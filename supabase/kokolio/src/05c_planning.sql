-- =====================================================================
-- Kokolio — planification : horaires journaliers, cycles, exceptions d'un jour
-- Bibliothèque (horaires, cycles) : RH et administrateurs. Planning d'un salarié : son responsable direct, ou les RH.
-- =====================================================================

-- Bibliothèque : les horaires journaliers et les cycles, avec ce qu'il faut pour savoir s'ils sont utilisés ou figés.
create or replace function kokolio._planning_lib(me kokolio.users) returns jsonb language plpgsql stable as $$
declare v_today date := kokolio._today();
begin
  if me.role = 'salarie' and not exists (select 1 from kokolio.users r where r.manager_id = me.id) then
    perform kokolio._fail('interdit', 'Accès réservé aux responsables et aux RH.');
  end if;
  return jsonb_build_object(
    'can_edit', me.role in ('rh', 'admin'),
    'models', coalesce((select jsonb_agg(jsonb_build_object('code', m.code, 'label', m.label, 'minutes', m.minutes, 'ranges', m.ranges, 'color', m.color,
        'active', m.active, 'sort', m.sort, 'version', m.version,
        'cycles', coalesce(array_length(kokolio._model_cycles(m.code), 1), 0),
        'locked', exists (select 1 from unnest(kokolio._model_cycles(m.code)) x where kokolio._cycle_locked(x))) order by m.sort, m.code)
      from kokolio.day_models m), '[]'::jsonb),
    'cycles', coalesce((select jsonb_agg(kokolio._cycle_json(c.id) || jsonb_build_object('codes', c.weeks,
        'assigned', (select count(distinct k.user_id) from kokolio.contracts k where k.cycle_id = c.id and (k.end_date is null or k.end_date >= v_today)),
        'locked', kokolio._cycle_locked(c.id)) order by lower(c.name))
      from kokolio.cycles c), '[]'::jsonb));
end $$;

-- Créer ou modifier un horaire journalier. Sa durée ne change plus dès qu'un cycle qui l'emploie a servi dans un mois clôturé.
create or replace function kokolio._model_save(me kokolio.users, p jsonb, p_args jsonb) returns jsonb language plpgsql as $$
declare
  j jsonb := coalesce(p_args->'model', '{}'::jsonb); v_code text := upper(trim(coalesce(j->>'code', ''))); o kokolio.day_models; m kokolio.day_models;
  v_label text := trim(coalesce(j->>'label', '')); v_min int; v_ranges jsonb; v_color text := coalesce(j->>'color', ''); v_new boolean := coalesce((p_args->>'create')::boolean, false);
begin
  if me.role not in ('rh', 'admin') then perform kokolio._fail('interdit', 'Accès réservé aux RH.'); end if;
  if v_code !~ '^[A-Z0-9][A-Z0-9_-]{0,11}$' then perform kokolio._fail('horaire', 'Code invalide : 1 à 12 caractères, lettres majuscules, chiffres, tiret.'); end if;
  if length(v_label) < 1 or length(v_label) > 60 then perform kokolio._fail('horaire', 'Donnez un nom à cet horaire (60 caractères au plus).'); end if;
  if jsonb_typeof(j->'minutes') is distinct from 'number' or (j->>'minutes')::numeric <> trunc((j->>'minutes')::numeric)
     or (j->>'minutes')::numeric < 1 or (j->>'minutes')::numeric > 960 then
    perform kokolio._fail('horaire', 'Durée invalide : entre 1 minute et 16 heures.');
  end if;
  v_min := (j->>'minutes')::int;
  v_ranges := kokolio._ranges(j->'ranges');
  if v_color not in ('', 'bleu', 'vert', 'ambre', 'rose', 'violet', 'turquoise', 'brique', 'gris') then perform kokolio._fail('horaire', 'Couleur inconnue.'); end if;
  select * into o from kokolio.day_models x where x.code = v_code for update;
  if o.code is null then
    if not v_new then perform kokolio._fail('introuvable', 'Horaire introuvable.'); end if;
    insert into kokolio.day_models (code, label, minutes, ranges, color, active, sort, created_by)
    values (v_code, v_label, v_min, v_ranges, v_color, coalesce((j->>'active')::boolean, true), coalesce((j->>'sort')::int, 100), me.id) returning * into m;
    perform kokolio._audit(me.id, 'horaire_type_cree', null, v_code, jsonb_build_object('nom', v_label, 'minutes', v_min, 'plages', v_ranges), coalesce(p->>'ip', ''));
  else
    if v_new then perform kokolio._fail('horaire', 'Ce code est déjà utilisé par l''horaire « ' || o.label || ' ».'); end if;
    if p_args ? 'version' and (p_args->>'version')::int <> o.version then
      perform kokolio._fail('conflit', 'Cet horaire a été modifié entre-temps. Rechargez la page.');
    end if;
    if v_min <> o.minutes and exists (select 1 from unnest(kokolio._model_cycles(v_code)) x where kokolio._cycle_locked(x)) then
      perform kokolio._fail('cloture', 'Cet horaire a servi dans un mois clôturé : sa durée ne peut plus changer. Créez un nouvel horaire et placez-le dans un nouveau cycle.');
    end if;
    update kokolio.day_models set label = v_label, minutes = v_min, ranges = v_ranges, color = v_color,
      active = coalesce((j->>'active')::boolean, o.active), sort = coalesce((j->>'sort')::int, o.sort), version = o.version + 1, updated_at = kokolio._now()
    where code = v_code returning * into m;
    perform kokolio._audit(me.id, 'horaire_type_modifie', null, v_code,
      kokolio._diff(to_jsonb(o), to_jsonb(m), array['label', 'minutes', 'ranges', 'color', 'active']), coalesce(p->>'ip', ''));
  end if;
  return jsonb_build_object('model', to_jsonb(m) - 'created_by' - 'created_at');
end $$;

-- Créer ou modifier un cycle. Sa composition ne change plus dès qu'il a servi dans un mois clôturé : on le duplique.
create or replace function kokolio._cycle_save(me kokolio.users, p jsonb, p_args jsonb) returns jsonb language plpgsql as $$
declare
  j jsonb := coalesce(p_args->'cycle', '{}'::jsonb); v_id uuid := nullif(j->>'id', '')::uuid; o kokolio.cycles; c kokolio.cycles;
  v_name text := trim(coalesce(j->>'name', '')); v_weeks jsonb := '[]'::jsonb; w jsonb; x jsonb; v_week jsonb; v_code text; v_n int := 0;
begin
  if me.role not in ('rh', 'admin') then perform kokolio._fail('interdit', 'Accès réservé aux RH.'); end if;
  if length(v_name) < 2 or length(v_name) > 60 then perform kokolio._fail('horaire', 'Donnez un nom au cycle (2 à 60 caractères).'); end if;
  if jsonb_typeof(j->'weeks') is distinct from 'array' or jsonb_array_length(j->'weeks') < 1 or jsonb_array_length(j->'weeks') > 12 then
    perform kokolio._fail('horaire', 'Un cycle compte entre 1 et 12 semaines.');
  end if;
  for w in select y.v from jsonb_array_elements(j->'weeks') with ordinality as y(v, o) order by y.o loop
    if jsonb_typeof(w) <> 'array' or jsonb_array_length(w) <> 7 then perform kokolio._fail('horaire', 'Chaque semaine du cycle compte sept jours.'); end if;
    v_week := '[]'::jsonb;
    for x in select y.v from jsonb_array_elements(w) with ordinality as y(v, o) order by y.o loop
      v_code := upper(trim(coalesce(x #>> '{}', '')));
      if v_code = '' then
        v_week := v_week || 'null'::jsonb;
      else
        if not exists (select 1 from kokolio.day_models m where m.code = v_code) then
          perform kokolio._fail('horaire', 'Horaire journalier inconnu : ' || left(v_code, 12));
        end if;
        v_week := v_week || to_jsonb(v_code);
        v_n := v_n + 1;
      end if;
    end loop;
    v_weeks := v_weeks || jsonb_build_array(v_week);
  end loop;
  if v_n = 0 then perform kokolio._fail('horaire', 'Le cycle doit contenir au moins un jour travaillé.'); end if;
  if exists (select 1 from kokolio.cycles y where lower(y.name) = lower(v_name) and (v_id is null or y.id <> v_id)) then
    perform kokolio._fail('horaire', 'Un cycle porte déjà ce nom.');
  end if;
  if v_id is null then
    insert into kokolio.cycles (name, weeks, active, created_by) values (v_name, v_weeks, coalesce((j->>'active')::boolean, true), me.id) returning * into c;
    perform kokolio._audit(me.id, 'cycle_cree', null, v_name, jsonb_build_object('semaines', jsonb_array_length(v_weeks), 'composition', v_weeks), coalesce(p->>'ip', ''));
  else
    select * into o from kokolio.cycles y where y.id = v_id for update;
    if o.id is null then perform kokolio._fail('introuvable', 'Cycle introuvable.'); end if;
    if p_args ? 'version' and (p_args->>'version')::int <> o.version then
      perform kokolio._fail('conflit', 'Ce cycle a été modifié entre-temps. Rechargez la page.');
    end if;
    if o.weeks <> v_weeks and kokolio._cycle_locked(v_id) then
      perform kokolio._fail('cloture', 'Ce cycle a servi dans un mois clôturé : sa composition ne peut plus changer. Dupliquez-le, puis attribuez le nouveau cycle à partir d''une date.');
    end if;
    update kokolio.cycles set name = v_name, weeks = v_weeks, active = coalesce((j->>'active')::boolean, o.active), version = o.version + 1, updated_at = kokolio._now()
    where id = v_id returning * into c;
    perform kokolio._audit(me.id, 'cycle_modifie', null, v_name, kokolio._diff(to_jsonb(o), to_jsonb(c), array['name', 'weeks', 'active']), coalesce(p->>'ip', ''));
  end if;
  return jsonb_build_object('cycle', kokolio._cycle_json(c.id) || jsonb_build_object('codes', c.weeks));
end $$;

-- Planning : poser, modifier ou retirer l'exception d'un jour pour un ou plusieurs salariés. Tout passe ou rien ne passe.
-- Chaque élément : { user_id, day, clear } pour revenir au planning par défaut, { …, model_code } pour un horaire de la bibliothèque,
-- ou { …, minutes, ranges, label } pour une saisie libre (0 minute = repos).
create or replace function kokolio._plan_set(me kokolio.users, p jsonb, p_args jsonb) returns jsonb language plpgsql as $$
declare
  r jsonb; v_uid uuid; v_day date; v_today date := kokolio._today(); m kokolio.day_models; v_min int; v_ranges jsonb; v_label text; v_code text;
  v_note text; v_set int := 0; v_cleared int := 0; v_n int := 0; v_ok jsonb := '{}'::jsonb; v_touch jsonb := '{}'::jsonb; v_k text; v_login text;
begin
  if jsonb_typeof(p_args->'items') is distinct from 'array' or jsonb_array_length(p_args->'items') < 1 or jsonb_array_length(p_args->'items') > 3000 then
    perform kokolio._fail('requete', 'Sélectionnez entre 1 et 3 000 jours.');
  end if;
  for r in select y.v from jsonb_array_elements(p_args->'items') with ordinality as y(v, o) order by y.o loop
    v_uid := nullif(r->>'user_id', '')::uuid; v_day := nullif(r->>'day', '')::date; v_n := v_n + 1;
    if v_uid is null or v_day is null then perform kokolio._fail('requete', 'Jour de planning invalide.'); end if;
    if not (v_ok ? v_uid::text) then
      if not kokolio._can_manage(me, v_uid) then perform kokolio._fail('interdit', 'Vous ne pouvez pas modifier le planning de ce salarié.'); end if;
      if not exists (select 1 from kokolio.contracts k where k.user_id = v_uid) then
        perform kokolio._fail('horaire', 'Ce compte n''a pas d''horaire : il ne peut pas être planifié.');
      end if;
      v_ok := v_ok || jsonb_build_object(v_uid::text, true);
    end if;
    if v_day < v_today - 366 or v_day > v_today + 732 then perform kokolio._fail('date', 'Le planning se modifie sur un an en arrière et deux ans en avant.'); end if;
    if kokolio._month_closed(to_char(v_day, 'YYYY-MM')) then
      perform kokolio._fail('cloture', 'Le ' || to_char(v_day, 'DD/MM/YYYY') || ' est dans un mois clôturé : son planning ne change plus.');
    end if;
    if coalesce((r->>'clear')::boolean, false) then
      delete from kokolio.plan_days q where q.user_id = v_uid and q.day = v_day;
      if found then v_cleared := v_cleared + 1; v_touch := jsonb_set(v_touch, array[v_uid::text], coalesce(v_touch->(v_uid::text), '[]'::jsonb) || jsonb_build_object('jour', v_day, 'horaire', 'par défaut')); end if;
      continue;
    end if;
    v_code := upper(trim(coalesce(r->>'model_code', '')));
    v_note := left(trim(coalesce(r->>'note', '')), 200);
    if v_code <> '' then
      select * into m from kokolio.day_models x where x.code = v_code;
      if m.code is null then perform kokolio._fail('horaire', 'Horaire journalier inconnu : ' || left(v_code, 12)); end if;
      if not m.active then perform kokolio._fail('horaire', 'L''horaire « ' || m.label || ' » est désactivé.'); end if;
      v_min := m.minutes; v_ranges := m.ranges; v_label := m.label;
    else
      if jsonb_typeof(r->'minutes') is distinct from 'number' or (r->>'minutes')::numeric <> trunc((r->>'minutes')::numeric)
         or (r->>'minutes')::numeric < 0 or (r->>'minutes')::numeric > 960 then
        perform kokolio._fail('horaire', 'Durée invalide : entre 0 et 16 heures.');
      end if;
      v_min := (r->>'minutes')::int;
      v_ranges := case when v_min = 0 then '[]'::jsonb else kokolio._ranges(r->'ranges') end;
      v_label := left(trim(coalesce(r->>'label', '')), 60);
      if v_label = '' then v_label := case when v_min = 0 then 'Repos' else 'Horaire du jour' end; end if;
    end if;
    insert into kokolio.plan_days (user_id, day, model_code, label, minutes, ranges, note, set_by, set_at)
    values (v_uid, v_day, v_code, v_label, v_min, v_ranges, v_note, me.id, kokolio._now())
    on conflict (user_id, day) do update set model_code = excluded.model_code, label = excluded.label, minutes = excluded.minutes,
      ranges = excluded.ranges, note = excluded.note, set_by = excluded.set_by, set_at = excluded.set_at;
    v_set := v_set + 1;
    v_touch := jsonb_set(v_touch, array[v_uid::text], coalesce(v_touch->(v_uid::text), '[]'::jsonb)
      || jsonb_build_object('jour', v_day, 'horaire', case when v_code <> '' then v_code else v_label end, 'minutes', v_min));
  end loop;
  -- une ligne de journal par salarié concerné (le détail est borné : au-delà de soixante jours, seul le nombre est gardé)
  for v_k in select jsonb_object_keys(v_touch) loop
    select x.login into v_login from kokolio.users x where x.id = v_k::uuid;
    perform kokolio._audit(me.id, 'planning_modifie', v_k::uuid, coalesce(v_login, ''),
      jsonb_build_object('jours', jsonb_array_length(v_touch->v_k))
        || case when jsonb_array_length(v_touch->v_k) <= 60 then jsonb_build_object('detail', v_touch->v_k) else '{}'::jsonb end,
      coalesce(p->>'ip', ''));
  end loop;
  return jsonb_build_object('set', v_set, 'cleared', v_cleared, 'items', v_n);
end $$;
