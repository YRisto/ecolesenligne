-- =====================================================================
-- Kokolio — fiches salariés, horaires datés, import, soldes, clôture, journal, paramètres
-- =====================================================================

-- Pose un nouvel horaire à partir d'une date : l'horaire précédent est fermé la veille, le passé n'est pas réécrit.
create or replace function kokolio._contract_apply(p_user uuid, p_start date, p_c jsonb, p_by uuid) returns kokolio.contracts language plpgsql as $$
declare
  v_regime text := coalesce(nullif(p_c->>'regime', ''), 'horaire'); v_dm int[]; v_wd int[]; v_i int; c kokolio.contracts;
  v_pause int := coalesce((p_c->>'pause_minutes')::int, 45); v_cp numeric := coalesce((p_c->>'cp_per_month')::numeric, 2.08);
  v_fd int := coalesce((p_c->>'forfait_days')::int, 218);
  v_cycle uuid := nullif(p_c->>'cycle_id', '')::uuid; v_anchor date := nullif(p_c->>'cycle_anchor', '')::date;
  v_presence text := coalesce(nullif(p_c->>'presence', ''), 'pointage'); k kokolio.cycles;
begin
  if v_regime not in ('horaire', 'forfait_jours') then perform kokolio._fail('horaire', 'Régime inconnu.'); end if;
  if v_presence not in ('pointage', 'automatique') then perform kokolio._fail('horaire', 'Mode de présence inconnu.'); end if;
  if p_start is null then perform kokolio._fail('horaire', 'Date d''effet manquante.'); end if;
  if v_cycle is not null then
    select * into k from kokolio.cycles x where x.id = v_cycle;
    if k.id is null then perform kokolio._fail('horaire', 'Cycle de travail introuvable.'); end if;
    if not k.active then perform kokolio._fail('horaire', 'Ce cycle de travail est désactivé : choisissez-en un autre.'); end if;
    -- la semaine 1 du cycle commence un lundi : celui de la date indiquée, ou à défaut celui de la date d'effet
    v_anchor := coalesce(v_anchor, p_start);
    v_anchor := v_anchor - (extract(isodow from v_anchor)::int - 1);
  else
    v_anchor := null;
  end if;
  if jsonb_typeof(p_c->'day_minutes') = 'array' and jsonb_array_length(p_c->'day_minutes') = 7 then
    select array_agg((x.v)::int order by x.o) into v_dm from jsonb_array_elements_text(p_c->'day_minutes') with ordinality as x(v, o);
  else
    v_dm := '{420,420,420,420,420,0,0}';
  end if;
  for v_i in 1..7 loop
    if v_dm[v_i] is null or v_dm[v_i] < 0 or v_dm[v_i] > 960 then perform kokolio._fail('horaire', 'Durée journalière invalide.'); end if;
  end loop;
  if v_cycle is not null then
    -- avec un cycle, la semaine du contrat n'est qu'un repère : on y recopie la première semaine du cycle
    select array_agg(coalesce(m.minutes, 0) order by d.o), array_agg(d.o::int order by d.o) filter (where m.code is not null) into v_dm, v_wd
    from jsonb_array_elements_text(k.weeks->0) with ordinality as d(code, o) left join kokolio.day_models m on m.code = d.code;
    v_wd := coalesce(v_wd, '{}');
    if v_regime = 'forfait_jours' then v_dm := '{0,0,0,0,0,0,0}'; end if;
  elsif v_regime = 'forfait_jours' then
    select array_agg(z.w order by z.w) into v_wd
    from (select distinct (y)::int as w from jsonb_array_elements_text(case when jsonb_typeof(p_c->'work_days') = 'array' then p_c->'work_days' else '[1,2,3,4,5]'::jsonb end) y) z;
    v_dm := '{0,0,0,0,0,0,0}';
  else
    select array_agg(g.i order by g.i) into v_wd from generate_series(1, 7) g(i) where v_dm[g.i] > 0;
  end if;
  if v_wd is null or (v_cycle is null and coalesce(array_length(v_wd, 1), 0) = 0) or exists (select 1 from unnest(v_wd) w where w < 1 or w > 7) then
    perform kokolio._fail('horaire', 'Indiquez au moins un jour travaillé.');
  end if;
  if v_pause < 0 or v_pause > 180 or v_cp < 0 or v_cp > 5 or v_fd < 1 or v_fd > 366 then
    perform kokolio._fail('horaire', 'Valeur hors limites dans l''horaire.');
  end if;
  if exists (select 1 from kokolio.contracts x where x.user_id = p_user)
     and exists (select 1 from jsonb_array_elements_text(kokolio._closed_months()) m where m >= to_char(p_start, 'YYYY-MM')) then
    perform kokolio._fail('cloture', 'Un mois clôturé existe à cette date ou après : choisissez une date d''effet postérieure à la dernière clôture.');
  end if;
  delete from kokolio.contracts x where x.user_id = p_user and x.start_date >= p_start;
  update kokolio.contracts set end_date = p_start - 1 where user_id = p_user and start_date < p_start and (end_date is null or end_date >= p_start);
  insert into kokolio.contracts (user_id, start_date, regime, day_minutes, work_days, pause_minutes, cp_per_month, forfait_days, cycle_id, cycle_anchor, presence, created_by)
  values (p_user, p_start, v_regime, v_dm, v_wd, v_pause, v_cp, v_fd, v_cycle, v_anchor, v_presence, p_by) returning * into c;
  return c;
end $$;

create or replace function kokolio._user_get(me kokolio.users, p_args jsonb) returns jsonb language plpgsql stable as $$
declare v_id uuid := coalesce(nullif(p_args->>'id', '')::uuid, me.id); u kokolio.users; v_full boolean;
begin
  if not kokolio._can_see(me, v_id) then perform kokolio._fail('interdit', 'Vous n''avez pas accès à ce salarié.'); end if;
  select * into u from kokolio.users x where x.id = v_id;
  if u.id is null then perform kokolio._fail('introuvable', 'Salarié introuvable.'); end if;
  v_full := v_id = me.id or me.role in ('rh', 'admin');
  return jsonb_build_object(
    'user', kokolio._user_json(u, v_full),
    'contracts', coalesce((select jsonb_agg(kokolio._contract_json(c) order by c.start_date) from kokolio.contracts c where c.user_id = v_id), '[]'::jsonb),
    'cycles', coalesce((select jsonb_agg(kokolio._cycle_json(x.cycle_id))
                        from (select distinct c.cycle_id from kokolio.contracts c where c.user_id = v_id and c.cycle_id is not null) x), '[]'::jsonb),
    'entries', case when v_full then coalesce((select jsonb_agg(to_jsonb(e) order by e.year desc, e.created_at) from kokolio.balance_entries e where e.user_id = v_id), '[]'::jsonb) else '[]'::jsonb end,
    'today', kokolio._today());
end $$;

create or replace function kokolio._no_cycle(p_user uuid, p_manager uuid) returns void language plpgsql stable as $$
declare v_cur uuid := p_manager; v_i int := 0;
begin
  while v_cur is not null and v_i < 60 loop
    if v_cur = p_user then perform kokolio._fail('responsable', 'Boucle hiérarchique : ce responsable dépend déjà de ce salarié.'); end if;
    select u.manager_id into v_cur from kokolio.users u where u.id = v_cur;
    v_i := v_i + 1;
  end loop;
end $$;

-- Création ou mise à jour d'une fiche (RH). Les rôles ne sont modifiables que par un administrateur.
create or replace function kokolio._user_save(me kokolio.users, p jsonb, p_args jsonb) returns jsonb language plpgsql as $$
declare
  v_id uuid := nullif(p_args->>'id', '')::uuid; u kokolio.users; o kokolio.users; v_new boolean;
  v_login text := lower(trim(coalesce(p_args->>'login', ''))); v_mgr uuid := nullif(p_args->>'manager_id', '')::uuid;
  v_role text; v_mat text := trim(coalesce(p_args->>'matricule', '')); v_details jsonb := coalesce(p_args->'details', '{}'::jsonb);
  v_entry date := nullif(p_args->>'entry_date', '')::date; v_exit date := nullif(p_args->>'exit_date', '')::date;
  v_now timestamptz := kokolio._now(); v_diff jsonb; v_days int; c kokolio.contracts;
  v_tracked date; v_go date; v_first date; v_a date; v_b date;
begin
  v_new := v_id is null;
  if me.role not in ('rh', 'admin') then perform kokolio._fail('interdit', 'Accès réservé aux RH.'); end if;
  if not v_new then
    select * into o from kokolio.users x where x.id = v_id for update;
    if o.id is null then perform kokolio._fail('introuvable', 'Salarié introuvable.'); end if;
    if o.role = 'admin' and me.role <> 'admin' then perform kokolio._fail('interdit', 'Seul un administrateur peut modifier un compte administrateur.'); end if;
    if p_args ? 'version' and (p_args->>'version')::int <> o.version then
      perform kokolio._fail('conflit', 'Cette fiche a été modifiée entre-temps. Rechargez la page.');
    end if;
  end if;
  if v_login !~ '^[a-z0-9][a-z0-9._@-]{2,63}$' then
    perform kokolio._fail('identifiant', 'Identifiant invalide : 3 à 64 caractères, lettres, chiffres, point ou tiret.');
  end if;
  if exists (select 1 from kokolio.users x where lower(x.login) = v_login and (v_new or x.id <> v_id)) then
    perform kokolio._fail('identifiant', 'Cet identifiant est déjà utilisé.');
  end if;
  if v_mat <> '' and exists (select 1 from kokolio.users x where x.matricule = v_mat and (v_new or x.id <> v_id)) then
    perform kokolio._fail('matricule', 'Ce matricule est déjà utilisé.');
  end if;
  if trim(coalesce(p_args->>'last_name', '')) = '' then perform kokolio._fail('nom', 'Le nom est obligatoire.'); end if;
  if v_exit is not null and v_entry is not null and v_exit < v_entry then perform kokolio._fail('date', 'La date de sortie précède la date d''entrée.'); end if;
  if jsonb_typeof(v_details) <> 'object' or length(v_details::text) > 6000 then perform kokolio._fail('requete', 'Fiche trop volumineuse.'); end if;
  -- Début de suivi : envoyé seulement quand les RH le modifient ; sinon la valeur en place est conservée.
  v_tracked := case when p_args ? 'tracked_from' then nullif(p_args->>'tracked_from', '')::date when v_new then null else o.tracked_from end;
  if not v_new and v_tracked is distinct from o.tracked_from then
    -- Déplacer le début de suivi change ce qui est attendu entre l'ancien et le nouveau premier jour : impossible si un mois clôturé s'y trouve.
    select case when m.value->>'go_live' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then (m.value->>'go_live')::date else date '1900-01-01' end into v_go from kokolio.meta m where m.key = 'settings';
    select min(x.start_date) into v_first from kokolio.contracts x where x.user_id = v_id;
    v_a := greatest(v_go, coalesce(o.tracked_from, date '1900-01-01'), coalesce(v_entry, date '1900-01-01'), coalesce(v_first, date '1900-01-01'));
    v_b := greatest(v_go, coalesce(v_tracked, date '1900-01-01'), coalesce(v_entry, date '1900-01-01'), coalesce(v_first, date '1900-01-01'));
    if v_a <> v_b and v_first is not null and kokolio._range_closed(least(v_a, v_b), greatest(v_a, v_b) - 1) then
      perform kokolio._fail('cloture', 'Un mois clôturé se trouve entre l''ancien et le nouveau début de suivi : il ne peut plus être déplacé sur cette période.');
    end if;
  end if;
  if v_mgr is not null then
    if not exists (select 1 from kokolio.users x where x.id = v_mgr) then perform kokolio._fail('responsable', 'Responsable introuvable.'); end if;
    if not v_new then
      if v_mgr = v_id then perform kokolio._fail('responsable', 'Un salarié ne peut pas être son propre responsable.'); end if;
      perform kokolio._no_cycle(v_id, v_mgr);
    end if;
  end if;
  v_role := coalesce(nullif(p_args->>'role', ''), case when v_new then 'salarie' else o.role end);
  if v_role not in ('salarie', 'rh', 'admin') then perform kokolio._fail('requete', 'Rôle inconnu.'); end if;
  if v_role <> (case when v_new then 'salarie' else o.role end) then
    if me.role <> 'admin' then perform kokolio._fail('interdit', 'Seul un administrateur peut attribuer un rôle.'); end if;
    if not v_new and o.role = 'admin' and v_role <> 'admin'
       and not exists (select 1 from kokolio.users x where x.role = 'admin' and x.id <> v_id and not x.disabled) then
      perform kokolio._fail('interdit', 'Impossible de retirer le dernier administrateur.');
    end if;
  end if;
  if v_new then
    insert into kokolio.users (login, role, first_name, last_name, matricule, email, team, job, manager_id, entry_date, exit_date, details, tracked_from)
    values (v_login, v_role, trim(coalesce(p_args->>'first_name', '')), trim(p_args->>'last_name'), v_mat, trim(coalesce(p_args->>'email', '')),
            trim(coalesce(p_args->>'team', '')), trim(coalesce(p_args->>'job', '')), v_mgr, v_entry, v_exit, v_details, v_tracked)
    returning * into u;
    c := kokolio._contract_apply(u.id, coalesce(v_entry, date '2000-01-01'), coalesce(p_args->'contract', '{}'::jsonb), me.id);
    if coalesce(p_args->>'code_hash', '') ~ '^[0-9a-f]{64}$' then
      select coalesce((m.value->>'activation_days')::int, 14) into v_days from kokolio.meta m where m.key = 'settings';
      update kokolio.users set act_hash = p_args->>'code_hash', act_expires = v_now + make_interval(days => coalesce(v_days, 14)) where id = u.id returning * into u;
    end if;
    perform kokolio._audit(me.id, 'fiche_creee', u.id, u.login, jsonb_build_object('nom', trim(u.first_name || ' ' || u.last_name), 'role', u.role), coalesce(p->>'ip', ''));
  else
    if coalesce((p_args->>'disabled')::boolean, o.disabled) and o.id = me.id then
      perform kokolio._fail('interdit', 'Vous ne pouvez pas désactiver votre propre compte.');
    end if;
    update kokolio.users set login = v_login, role = v_role, first_name = trim(coalesce(p_args->>'first_name', '')), last_name = trim(p_args->>'last_name'),
      matricule = v_mat, email = trim(coalesce(p_args->>'email', '')), team = trim(coalesce(p_args->>'team', '')), job = trim(coalesce(p_args->>'job', '')),
      manager_id = v_mgr, entry_date = v_entry, exit_date = v_exit, details = v_details, tracked_from = v_tracked,
      disabled = coalesce((p_args->>'disabled')::boolean, o.disabled), version = o.version + 1, updated_at = v_now
    where id = v_id returning * into u;
    if u.disabled and not o.disabled then delete from kokolio.sessions s where s.user_id = u.id; end if;
    v_diff := kokolio._diff(to_jsonb(o), to_jsonb(u), array['login', 'role', 'first_name', 'last_name', 'matricule', 'email', 'team', 'job', 'manager_id', 'entry_date', 'exit_date', 'tracked_from', 'disabled'])
      || case when o.details is distinct from u.details then jsonb_build_object('details', (select coalesce(jsonb_agg(k), '[]'::jsonb) from (
           select k from jsonb_object_keys(o.details || u.details) k where (o.details->k) is distinct from (u.details->k)) z)) else '{}'::jsonb end;
    perform kokolio._audit(me.id, 'fiche_modifiee', u.id, u.login, v_diff, coalesce(p->>'ip', ''));
  end if;
  return jsonb_build_object('user', kokolio._user_json(u, true));
end $$;

create or replace function kokolio._contract_set(me kokolio.users, p jsonb, p_args jsonb) returns jsonb language plpgsql as $$
declare v_uid uuid := nullif(p_args->>'user_id', '')::uuid; u kokolio.users; c kokolio.contracts; v_start date := nullif(p_args->>'start_date', '')::date;
begin
  if me.role not in ('rh', 'admin') then perform kokolio._fail('interdit', 'Accès réservé aux RH.'); end if;
  select * into u from kokolio.users x where x.id = v_uid for update;
  if u.id is null then perform kokolio._fail('introuvable', 'Salarié introuvable.'); end if;
  c := kokolio._contract_apply(u.id, v_start, coalesce(p_args->'contract', '{}'::jsonb), me.id);
  update kokolio.users set version = u.version + 1, updated_at = kokolio._now() where id = u.id;
  perform kokolio._audit(me.id, 'horaire_modifie', u.id, u.login,
    jsonb_build_object('a_compter_du', c.start_date, 'regime', c.regime, 'minutes_par_jour', to_jsonb(c.day_minutes), 'jours', to_jsonb(c.work_days),
      'pause', c.pause_minutes, 'cp_par_mois', c.cp_per_month, 'forfait_jours', c.forfait_days, 'presence', c.presence)
      || case when c.cycle_id is not null then jsonb_build_object('cycle', (select x.name from kokolio.cycles x where x.id = c.cycle_id), 'semaine_1_du_cycle', c.cycle_anchor) else '{}'::jsonb end,
    coalesce(p->>'ip', ''));
  return jsonb_build_object('contract', kokolio._contract_json(c));
end $$;

-- Import en masse : tout passe ou rien ne passe. Les comptes existants sont mis à jour, jamais leur mot de passe.
create or replace function kokolio._users_import(me kokolio.users, p jsonb, p_args jsonb) returns jsonb language plpgsql as $$
declare
  r jsonb; u kokolio.users; v_login text; v_created jsonb := '[]'::jsonb; v_updated jsonb := '[]'::jsonb; v_idx int := 0; v_mgr uuid;
  v_year int := extract(year from kokolio._today())::int; v_days int; v_now timestamptz := kokolio._now(); v_role text; c kokolio.contracts;
begin
  if me.role not in ('rh', 'admin') then perform kokolio._fail('interdit', 'Accès réservé aux RH.'); end if;
  if jsonb_typeof(p_args->'rows') is distinct from 'array' or jsonb_array_length(p_args->'rows') = 0 or jsonb_array_length(p_args->'rows') > 2000 then
    perform kokolio._fail('import', 'Le fichier doit contenir entre 1 et 2 000 lignes.');
  end if;
  select coalesce((m.value->>'activation_days')::int, 14) into v_days from kokolio.meta m where m.key = 'settings';
  for r in select x from jsonb_array_elements(p_args->'rows') x loop
    v_idx := v_idx + 1;
    v_login := lower(trim(coalesce(r->>'login', '')));
    if v_login !~ '^[a-z0-9][a-z0-9._@-]{2,63}$' then perform kokolio._fail('import', 'Ligne ' || v_idx || ' : identifiant invalide.'); end if;
    if trim(coalesce(r->>'last_name', '')) = '' then perform kokolio._fail('import', 'Ligne ' || v_idx || ' : nom manquant.'); end if;
    select * into u from kokolio.users x where lower(x.login) = v_login for update;
    begin
      if u.id is null then
        v_role := case when me.role = 'admin' and r->>'role' in ('rh', 'admin') then r->>'role' else 'salarie' end;
        insert into kokolio.users (login, role, first_name, last_name, matricule, email, team, job, entry_date, exit_date, details, tracked_from, act_hash, act_expires)
        values (v_login, v_role, trim(coalesce(r->>'first_name', '')), trim(r->>'last_name'), trim(coalesce(r->>'matricule', '')),
                trim(coalesce(r->>'email', '')), trim(coalesce(r->>'team', '')), trim(coalesce(r->>'job', '')),
                nullif(r->>'entry_date', '')::date, nullif(r->>'exit_date', '')::date, coalesce(r->'details', '{}'::jsonb), nullif(r->>'tracked_from', '')::date,
                case when coalesce(r->>'code_hash', '') ~ '^[0-9a-f]{64}$' then r->>'code_hash' end,
                case when coalesce(r->>'code_hash', '') ~ '^[0-9a-f]{64}$' then v_now + make_interval(days => coalesce(v_days, 14)) end)
        returning * into u;
        c := kokolio._contract_apply(u.id, coalesce(u.entry_date, date '2000-01-01'), coalesce(r->'contract', '{}'::jsonb), me.id);
        if coalesce((r->>'cp')::numeric, 0) <> 0 then
          insert into kokolio.balance_entries (user_id, kind, year, amount, reason, tag, created_by)
          values (u.id, 'cp', v_year, (r->>'cp')::numeric, 'Solde de départ (import)', 'import', me.id);
        end if;
        if coalesce((r->>'rtt')::numeric, 0) <> 0 then
          insert into kokolio.balance_entries (user_id, kind, year, amount, reason, tag, created_by)
          values (u.id, 'rtt', v_year, (r->>'rtt')::numeric, 'Droits de l''année (import)', 'import', me.id);
        end if;
        v_created := v_created || to_jsonb(u.login);
      else
        if u.role = 'admin' and me.role <> 'admin' then
          perform kokolio._fail('import', 'Ligne ' || v_idx || ' : compte administrateur, modifiable par un administrateur uniquement.');
        end if;
        update kokolio.users set
          first_name = coalesce(nullif(trim(r->>'first_name'), ''), first_name), last_name = trim(r->>'last_name'),
          matricule = coalesce(nullif(trim(r->>'matricule'), ''), matricule), email = coalesce(nullif(trim(r->>'email'), ''), email),
          team = coalesce(nullif(trim(r->>'team'), ''), team), job = coalesce(nullif(trim(r->>'job'), ''), job),
          entry_date = coalesce(nullif(r->>'entry_date', '')::date, entry_date), exit_date = coalesce(nullif(r->>'exit_date', '')::date, exit_date),
          version = version + 1, updated_at = v_now
        where id = u.id;
        v_updated := v_updated || to_jsonb(u.login);
      end if;
    exception
      when unique_violation then perform kokolio._fail('import', 'Ligne ' || v_idx || ' : identifiant ou matricule déjà utilisé.');
      when invalid_datetime_format or datetime_field_overflow or invalid_text_representation or check_violation then
        perform kokolio._fail('import', 'Ligne ' || v_idx || ' : date ou nombre illisible.');
    end;
  end loop;
  v_idx := 0;
  for r in select x from jsonb_array_elements(p_args->'rows') x loop
    v_idx := v_idx + 1;
    if trim(coalesce(r->>'manager_login', '')) <> '' then
      select x.id into v_mgr from kokolio.users x where lower(x.login) = lower(trim(r->>'manager_login'));
      if v_mgr is null then perform kokolio._fail('import', 'Ligne ' || v_idx || ' : responsable « ' || trim(r->>'manager_login') || ' » introuvable.'); end if;
      update kokolio.users set manager_id = v_mgr where lower(login) = lower(trim(r->>'login')) and manager_id is distinct from v_mgr;
    end if;
  end loop;
  for u in select * from kokolio.users x where x.manager_id is not null loop
    if u.manager_id = u.id then perform kokolio._fail('import', u.login || ' ne peut pas être son propre responsable.'); end if;
    perform kokolio._no_cycle(u.id, u.manager_id);
  end loop;
  perform kokolio._audit(me.id, 'import_salaries', null, '', jsonb_build_object('crees', v_created, 'mis_a_jour', v_updated), coalesce(p->>'ip', ''));
  return jsonb_build_object('created', v_created, 'updated', v_updated);
end $$;

-- Écriture de solde (report, ajustement). Une écriture ne se modifie pas : on en passe une autre.
create or replace function kokolio._balance_add(me kokolio.users, p jsonb, p_args jsonb) returns jsonb language plpgsql as $$
declare
  v_uid uuid := nullif(p_args->>'user_id', '')::uuid; v_kind text := coalesce(p_args->>'kind', ''); v_year int := (p_args->>'year')::int;
  v_amount numeric := (p_args->>'amount')::numeric; v_reason text := left(trim(coalesce(p_args->>'reason', '')), 200); v_tag text := coalesce(p_args->>'tag', '');
  e kokolio.balance_entries; u kokolio.users;
begin
  if me.role not in ('rh', 'admin') then perform kokolio._fail('interdit', 'Accès réservé aux RH.'); end if;
  select * into u from kokolio.users x where x.id = v_uid;
  if u.id is null then perform kokolio._fail('introuvable', 'Salarié introuvable.'); end if;
  if v_kind not in ('cp', 'rtt') or v_year is null or v_year < 2000 or v_year > 2100 then perform kokolio._fail('requete', 'Écriture invalide.'); end if;
  if v_amount is null or v_amount = 0 or abs(v_amount) > 200 then perform kokolio._fail('requete', 'Montant invalide.'); end if;
  if length(v_reason) < 3 then perform kokolio._fail('motif', 'Indiquez le motif de l''écriture.'); end if;
  if v_tag not in ('', 'report') then perform kokolio._fail('requete', 'Écriture invalide.'); end if;
  if v_tag <> '' and exists (select 1 from kokolio.balance_entries x where x.user_id = v_uid and x.kind = v_kind and x.year = v_year and x.tag = v_tag) then
    return jsonb_build_object('skipped', true);
  end if;
  insert into kokolio.balance_entries (user_id, kind, year, amount, reason, tag, created_by)
  values (v_uid, v_kind, v_year, v_amount, v_reason, v_tag, me.id) returning * into e;
  perform kokolio._audit(me.id, 'solde_ajuste', v_uid, v_kind, jsonb_build_object('annee', v_year, 'jours', v_amount, 'motif', v_reason), coalesce(p->>'ip', ''));
  return jsonb_build_object('entry', to_jsonb(e));
end $$;

-- Écritures en nombre (report de fin d'année) : une seule transaction, les reports déjà passés sont ignorés.
create or replace function kokolio._balance_bulk(me kokolio.users, p jsonb, p_args jsonb) returns jsonb language plpgsql as $$
declare v_it jsonb; v_n int := 0; v_skip int := 0; v_uid uuid; v_kind text; v_year int; v_amount numeric; v_tag text; v_reason text;
begin
  if me.role not in ('rh', 'admin') then perform kokolio._fail('interdit', 'Accès réservé aux RH.'); end if;
  if jsonb_typeof(p_args->'items') is distinct from 'array' or jsonb_array_length(p_args->'items') > 3000 then
    perform kokolio._fail('requete', 'Liste d''écritures invalide.');
  end if;
  for v_it in select x from jsonb_array_elements(p_args->'items') x loop
    v_uid := (v_it->>'user_id')::uuid; v_kind := coalesce(v_it->>'kind', ''); v_year := (v_it->>'year')::int;
    v_amount := (v_it->>'amount')::numeric; v_tag := coalesce(v_it->>'tag', ''); v_reason := left(trim(coalesce(v_it->>'reason', '')), 200);
    if v_kind not in ('cp', 'rtt') or v_year is null or v_year < 2000 or v_year > 2100 or v_amount is null or abs(v_amount) > 200
       or v_tag not in ('', 'report') or length(v_reason) < 3 or not exists (select 1 from kokolio.users u where u.id = v_uid) then
      perform kokolio._fail('requete', 'Écriture invalide.');
    end if;
    if v_amount = 0 or (v_tag <> '' and exists (select 1 from kokolio.balance_entries x where x.user_id = v_uid and x.kind = v_kind and x.year = v_year and x.tag = v_tag)) then
      v_skip := v_skip + 1;
    else
      insert into kokolio.balance_entries (user_id, kind, year, amount, reason, tag, created_by) values (v_uid, v_kind, v_year, v_amount, v_reason, v_tag, me.id);
      v_n := v_n + 1;
    end if;
  end loop;
  perform kokolio._audit(me.id, 'soldes_reportes', null, coalesce(p_args->>'label', ''), jsonb_build_object('ecritures', v_n, 'ignorees', v_skip), coalesce(p->>'ip', ''));
  return jsonb_build_object('created', v_n, 'skipped', v_skip);
end $$;

-- ---------------------------------------------------------------------
-- Clôture mensuelle
-- ---------------------------------------------------------------------
create or replace function kokolio._month_bounds(p_month text, out d1 date, out d2 date) language plpgsql immutable as $$
begin
  if p_month is null or p_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then perform kokolio._fail('requete', 'Mois invalide.'); end if;
  d1 := (p_month || '-01')::date;
  d2 := (d1 + interval '1 month' - interval '1 day')::date;
end $$;

-- Empreinte de tout ce qui entre dans le calcul d'un mois : sert à vérifier que rien n'a bougé entre le calcul et la clôture.
create or replace function kokolio._month_fingerprint(p_month text) returns text language plpgsql stable as $$
declare v_d1 date; v_d2 date; v_s text;
begin
  select b.d1, b.d2 into v_d1, v_d2 from kokolio._month_bounds(p_month) b;
  select encode(sha256(convert_to(
    coalesce((select string_agg(d.id::text || ':' || d.version, ',' order by d.id) from kokolio.days d where d.day between v_d1 and v_d2), '') || '#' ||
    coalesce((select string_agg(a.id::text || ':' || a.version, ',' order by a.id) from kokolio.absences a where a.start_date <= v_d2 and a.end_date >= v_d1), '') || '#' ||
    coalesce((select string_agg(c.id::text || ':' || c.start_date || ':' || coalesce(c.end_date::text, ''), ',' order by c.id) from kokolio.contracts c), '') || '#' ||
    coalesce((select string_agg(u.id::text || ':' || u.version, ',' order by u.id) from kokolio.users u), '') || '#' ||
    coalesce((select string_agg(q.user_id::text || ':' || q.day || ':' || q.minutes || ':' || extract(epoch from q.set_at), ',' order by q.user_id, q.day)
              from kokolio.plan_days q where q.day between v_d1 and v_d2), '') || '#' ||
    coalesce((select string_agg(k.id::text || ':' || k.version, ',' order by k.id) from kokolio.cycles k), '') || '#' ||
    coalesce((select string_agg(m.code || ':' || m.version, ',' order by m.code) from kokolio.day_models m), ''), 'UTF8')), 'hex') into v_s;
  return v_s;
end $$;

create or replace function kokolio._month_check(me kokolio.users, p_args jsonb) returns jsonb language plpgsql stable as $$
declare v_m text := p_args->>'month'; v_d1 date; v_d2 date;
begin
  if me.role not in ('rh', 'admin') then perform kokolio._fail('interdit', 'Accès réservé aux RH.'); end if;
  select b.d1, b.d2 into v_d1, v_d2 from kokolio._month_bounds(v_m) b;
  return jsonb_build_object('month', v_m, 'ended', v_d2 < kokolio._today(), 'closed', kokolio._month_closed(v_m),
    'pending_days', (select count(*) from kokolio.days d where d.day between v_d1 and v_d2 and d.status <> 'valide'),
    'pending_absences', (select count(*) from kokolio.absences a where a.status = 'en_attente' and a.start_date <= v_d2 and a.end_date >= v_d1));
end $$;

create or replace function kokolio._month_close(me kokolio.users, p jsonb, p_args jsonb) returns jsonb language plpgsql as $$
declare
  v_m text := p_args->>'month'; v_d1 date; v_d2 date; v_nd int; v_na int; v_ver int; c kokolio.closures;
  v_sha text := coalesce(p_args->>'export_sha256', '');
begin
  if me.role not in ('rh', 'admin') then perform kokolio._fail('interdit', 'Accès réservé aux RH.'); end if;
  select b.d1, b.d2 into v_d1, v_d2 from kokolio._month_bounds(v_m) b;
  if v_d2 >= kokolio._today() then perform kokolio._fail('etat', 'Ce mois n''est pas terminé.'); end if;
  lock table kokolio.days, kokolio.absences in share row exclusive mode;
  if kokolio._month_closed(v_m) then perform kokolio._fail('etat', 'Ce mois est déjà clôturé.'); end if;
  select count(*) into v_nd from kokolio.days d where d.day between v_d1 and v_d2 and d.status <> 'valide';
  select count(*) into v_na from kokolio.absences a where a.status = 'en_attente' and a.start_date <= v_d2 and a.end_date >= v_d1;
  if v_nd > 0 or v_na > 0 then
    perform kokolio._fail('bloque', 'Clôture impossible : ' || v_nd || ' journée(s) non validée(s) et ' || v_na || ' demande(s) d''absence en attente.');
  end if;
  if coalesce(p_args->>'fingerprint', '') <> kokolio._month_fingerprint(v_m) then
    perform kokolio._fail('conflit', 'Des données ont changé pendant la préparation de la clôture. Relancez-la.');
  end if;
  if jsonb_typeof(p_args->'snapshot') is distinct from 'object' or coalesce(p_args->>'export_text', '') = '' or v_sha !~ '^[0-9a-f]{64}$' then
    perform kokolio._fail('requete', 'Clôture incomplète.');
  end if;
  select coalesce(max(x.version), 0) + 1 into v_ver from kokolio.closures x where x.month = v_m;
  insert into kokolio.closures (month, version, status, closed_by, closed_at, snapshot, export_text, export_sha256)
  values (v_m, v_ver, 'cloture', me.id, kokolio._now(), p_args->'snapshot', p_args->>'export_text', v_sha) returning * into c;
  perform kokolio._audit(me.id, 'mois_cloture', null, v_m, jsonb_build_object('version', v_ver, 'empreinte_export', v_sha), coalesce(p->>'ip', ''));
  return jsonb_build_object('month', v_m, 'version', v_ver);
end $$;

create or replace function kokolio._month_reopen(me kokolio.users, p jsonb, p_args jsonb) returns jsonb language plpgsql as $$
declare v_m text := p_args->>'month'; v_reason text := left(trim(coalesce(p_args->>'reason', '')), 300); c kokolio.closures; v_d1 date; v_d2 date;
begin
  if me.role not in ('rh', 'admin') then perform kokolio._fail('interdit', 'Accès réservé aux RH.'); end if;
  select b.d1, b.d2 into v_d1, v_d2 from kokolio._month_bounds(v_m) b;
  if length(v_reason) < 5 then perform kokolio._fail('motif', 'Indiquez le motif de la réouverture.'); end if;
  select * into c from kokolio.closures x where x.month = v_m order by x.version desc limit 1 for update;
  if c.id is null or c.status <> 'cloture' then perform kokolio._fail('etat', 'Ce mois n''est pas clôturé.'); end if;
  update kokolio.closures set status = 'rouvert', reopened_by = me.id, reopened_at = kokolio._now(), reopen_reason = v_reason where id = c.id;
  perform kokolio._audit(me.id, 'mois_rouvert', null, v_m, jsonb_build_object('version', c.version, 'motif', v_reason), coalesce(p->>'ip', ''));
  return jsonb_build_object('month', v_m, 'version', c.version);
end $$;

create or replace function kokolio._closures(me kokolio.users) returns jsonb language plpgsql stable as $$
begin
  if me.role not in ('rh', 'admin') then perform kokolio._fail('interdit', 'Accès réservé aux RH.'); end if;
  return coalesce((select jsonb_agg(jsonb_build_object('month', c.month, 'version', c.version, 'status', c.status, 'closed_at', c.closed_at,
      'closed_by', (select trim(u.first_name || ' ' || u.last_name) from kokolio.users u where u.id = c.closed_by),
      'reopened_at', c.reopened_at, 'reopened_by', (select trim(u.first_name || ' ' || u.last_name) from kokolio.users u where u.id = c.reopened_by),
      'reopen_reason', c.reopen_reason, 'export_sha256', c.export_sha256, 'totals', c.snapshot->'totals') order by c.month desc, c.version desc)
    from kokolio.closures c), '[]'::jsonb);
end $$;

create or replace function kokolio._closure_get(me kokolio.users, p jsonb, p_args jsonb) returns jsonb language plpgsql as $$
declare c kokolio.closures;
begin
  if me.role not in ('rh', 'admin') then perform kokolio._fail('interdit', 'Accès réservé aux RH.'); end if;
  select * into c from kokolio.closures x where x.month = p_args->>'month' and x.version = (p_args->>'version')::int;
  if c.id is null then perform kokolio._fail('introuvable', 'Clôture introuvable.'); end if;
  if coalesce((p_args->>'download')::boolean, false) then
    perform kokolio._audit(me.id, 'export_telecharge', null, c.month, jsonb_build_object('version', c.version), coalesce(p->>'ip', ''));
  end if;
  return jsonb_build_object('month', c.month, 'version', c.version, 'status', c.status, 'closed_at', c.closed_at,
    'snapshot', c.snapshot, 'export_text', c.export_text, 'export_sha256', c.export_sha256);
end $$;

-- ---------------------------------------------------------------------
-- Journal
-- ---------------------------------------------------------------------
create or replace function kokolio._journal(me kokolio.users, p_args jsonb) returns jsonb language plpgsql stable as $$
declare
  v_before bigint := nullif(p_args->>'before', '')::bigint; v_limit int := least(greatest(coalesce((p_args->>'limit')::int, 50), 1), 200);
  v_action text := nullif(p_args->>'action', ''); v_user uuid := nullif(p_args->>'user_id', '')::uuid; v_q text := nullif(lower(trim(coalesce(p_args->>'q', ''))), '');
begin
  if me.role not in ('rh', 'admin') then perform kokolio._fail('interdit', 'Accès réservé aux RH.'); end if;
  return jsonb_build_object(
    'rows', coalesce((select jsonb_agg(to_jsonb(x) order by x.seq desc) from (
      select a.seq, a.ts, a.actor_label, a.action, a.target, a.detail, a.ip, a.target_user,
        (select trim(u.first_name || ' ' || u.last_name) from kokolio.users u where u.id = a.target_user) as target_name
      from kokolio.audit a
      where (v_before is null or a.seq < v_before)
        and (v_action is null or a.action = v_action)
        and (v_user is null or a.target_user = v_user or a.actor = v_user)
        and (v_q is null or lower(a.actor_label) like '%' || v_q || '%' or lower(a.target) like '%' || v_q || '%'
             or exists (select 1 from kokolio.users u where u.id = a.target_user and lower(u.first_name || ' ' || u.last_name) like '%' || v_q || '%'))
      order by a.seq desc limit v_limit) x), '[]'::jsonb),
    'actions', coalesce((select jsonb_agg(z.action order by z.action) from (select distinct a.action from kokolio.audit a) z), '[]'::jsonb),
    'total', (select count(*) from kokolio.audit));
end $$;

-- Vérifie la chaîne d'empreintes par tranches. Une ligne modifiée, supprimée ou insérée après coup casse la chaîne.
create or replace function kokolio._journal_verify(me kokolio.users, p_args jsonb) returns jsonb language plpgsql stable as $$
declare
  v_after bigint := coalesce(nullif(p_args->>'after', '')::bigint, 0); v_limit int := least(greatest(coalesce((p_args->>'limit')::int, 2000), 1), 5000);
  r kokolio.audit; v_prev text := ''; v_n int := 0; v_last bigint; v_head jsonb;
begin
  if me.role not in ('rh', 'admin') then perform kokolio._fail('interdit', 'Accès réservé aux RH.'); end if;
  v_last := v_after;
  if v_after > 0 then
    select a.hash into v_prev from kokolio.audit a where a.seq = v_after;
    if v_prev is null then return jsonb_build_object('ok', false, 'bad_seq', v_after, 'checked', 0); end if;
  end if;
  for r in select * from kokolio.audit a where a.seq > v_after order by a.seq limit v_limit loop
    if r.prev_hash <> v_prev or r.hash <> kokolio._audit_hash(r.prev_hash, r.seq, r.ts, r.actor, r.actor_label, r.action, r.target_user, r.target, r.detail, r.ip) then
      return jsonb_build_object('ok', false, 'bad_seq', r.seq, 'checked', v_n);
    end if;
    v_prev := r.hash; v_last := r.seq; v_n := v_n + 1;
  end loop;
  if v_n < v_limit then
    select m.value into v_head from kokolio.meta m where m.key = 'audit_head';
    if coalesce((v_head->>'seq')::bigint, 0) <> v_last or coalesce(v_head->>'hash', '') <> v_prev then
      return jsonb_build_object('ok', false, 'bad_seq', v_last, 'checked', v_n, 'reason', 'fin_de_chaine');
    end if;
  end if;
  return jsonb_build_object('ok', true, 'checked', v_n, 'last', v_last, 'done', v_n < v_limit);
end $$;

-- ---------------------------------------------------------------------
-- Paramètres (administrateur)
-- ---------------------------------------------------------------------
create or replace function kokolio._settings_set(me kokolio.users, p jsonb, p_args jsonb) returns jsonb language plpgsql as $$
declare v_old jsonb; v_new jsonb; v_in jsonb := coalesce(p_args->'settings', '{}'::jsonb); v_k text; v_l jsonb; v_e jsonb;
begin
  if me.role <> 'admin' then perform kokolio._fail('interdit', 'Accès réservé aux administrateurs.'); end if;
  select m.value into v_old from kokolio.meta m where m.key = 'settings' for update;
  if p_args ? 'version' and (p_args->>'version')::int <> coalesce((v_old->>'version')::int, 1) then
    perform kokolio._fail('conflit', 'Les paramètres ont été modifiés entre-temps. Rechargez la page.');
  end if;
  v_new := v_old;
  if v_in ? 'company' then
    if length(trim(v_in->>'company')) < 1 or length(v_in->>'company') > 80 then perform kokolio._fail('parametre', 'Nom d''entreprise invalide.'); end if;
    v_new := jsonb_set(v_new, '{company}', to_jsonb(trim(v_in->>'company')));
  end if;
  if v_in ? 'logo_url' then
    if coalesce(v_in->>'logo_url', '') <> '' and (v_in->>'logo_url' !~ '^https://[^ "<>]+$' or length(v_in->>'logo_url') > 300) then perform kokolio._fail('parametre', 'L''adresse du logo doit commencer par https://'); end if;
    v_new := jsonb_set(v_new, '{logo_url}', to_jsonb(coalesce(v_in->>'logo_url', '')));
  end if;
  if v_in ? 'go_live' then
    if (v_in->>'go_live') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then perform kokolio._fail('parametre', 'Date de mise en service invalide.'); end if;
    perform (v_in->>'go_live')::date;
    v_new := jsonb_set(v_new, '{go_live}', v_in->'go_live');
  end if;
  foreach v_k in array array['pause_threshold_min', 'max_day_min', 'max_week_min', 'min_rest_min', 'activation_days'] loop
    if v_in ? v_k then
      if jsonb_typeof(v_in->v_k) <> 'number' or (v_in->>v_k)::numeric < 0 or (v_in->>v_k)::numeric > 6000 or (v_in->>v_k)::numeric <> trunc((v_in->>v_k)::numeric) then
        perform kokolio._fail('parametre', 'Valeur invalide pour ' || v_k || '.');
      end if;
      v_new := jsonb_set(v_new, array[v_k], v_in->v_k);
    end if;
  end loop;
  if v_in ? 'night_until' then
    if coalesce(v_in->>'night_until', '') <> '' and (v_in->>'night_until') !~ '^(0[0-9]|1[01]):[0-5][0-9]$' then
      perform kokolio._fail('parametre', 'Heure limite de nuit invalide : entre 00:00 et 11:59, ou vide pour désactiver.');
    end if;
    v_new := jsonb_set(v_new, '{night_until}', to_jsonb(coalesce(v_in->>'night_until', '')));
  end if;
  -- pauses payées : minutes de pause pointée comptées comme du travail, par jour (0 = les pauses ne sont pas payées)
  if v_in ? 'break_paid_min' then
    if jsonb_typeof(v_in->'break_paid_min') <> 'number' or (v_in->>'break_paid_min')::numeric < 0 or (v_in->>'break_paid_min')::numeric > 120
       or (v_in->>'break_paid_min')::numeric <> trunc((v_in->>'break_paid_min')::numeric) then
      perform kokolio._fail('parametre', 'Pause payée invalide : entre 0 et 120 minutes par jour.');
    end if;
    v_new := jsonb_set(v_new, '{break_paid_min}', v_in->'break_paid_min');
  end if;
  -- anomalies liées à l'horaire : tolérances en minutes et niveau de chaque type
  if v_in ? 'anomalies' then
    v_e := v_in->'anomalies';
    if jsonb_typeof(v_e) <> 'object' or jsonb_typeof(coalesce(v_e->'levels', '{}'::jsonb)) <> 'object' then perform kokolio._fail('parametre', 'Réglage des anomalies invalide.'); end if;
    foreach v_k in array array['late_min', 'early_min', 'range_min', 'short_min', 'break_min', 'break_max'] loop
      if v_e ? v_k and (jsonb_typeof(v_e->v_k) <> 'number' or (v_e->>v_k)::numeric < 0 or (v_e->>v_k)::numeric > 600 or (v_e->>v_k)::numeric <> trunc((v_e->>v_k)::numeric)) then
        perform kokolio._fail('parametre', 'Tolérance invalide (' || v_k || ') : entre 0 et 600 minutes.');
      end if;
    end loop;
    if exists (select 1 from jsonb_each_text(coalesce(v_e->'levels', '{}'::jsonb)) x
               where x.key not in ('retard', 'depart_anticipe', 'hors_plage', 'presence_insuffisante', 'travail_absence', 'pause_courte', 'pause_longue', 'pause_non_prise')
                  or x.value not in ('corriger', 'verifier', 'info', 'off')) then
      perform kokolio._fail('parametre', 'Niveau d''anomalie inconnu.');
    end if;
    v_new := jsonb_set(v_new, '{anomalies}', coalesce(v_new->'anomalies', '{}'::jsonb) || (v_e - 'levels')
      || jsonb_build_object('levels', coalesce(v_new #> '{anomalies,levels}', '{}'::jsonb) || coalesce(v_e->'levels', '{}'::jsonb)));
  end if;
  if (v_new->>'activation_days')::int < 1 or (v_new->>'activation_days')::int > 90 then perform kokolio._fail('parametre', 'Durée de validité des codes : entre 1 et 90 jours.'); end if;
  if v_in ? 'lieux' then
    if jsonb_typeof(v_in->'lieux') <> 'array' or jsonb_array_length(v_in->'lieux') < 1 or jsonb_array_length(v_in->'lieux') > 8 then
      perform kokolio._fail('parametre', 'Indiquez entre 1 et 8 lieux.');
    end if;
    for v_l in select x from jsonb_array_elements(v_in->'lieux') x loop
      if coalesce(v_l->>'code', '') !~ '^[a-z0-9_]{2,30}$' or length(trim(coalesce(v_l->>'label', ''))) < 1 or length(v_l->>'label') > 40 then
        perform kokolio._fail('parametre', 'Lieu invalide.');
      end if;
    end loop;
    v_new := jsonb_set(v_new, '{lieux}', v_in->'lieux');
  end if;
  if v_in ? 'export' then
    v_e := v_in->'export';
    if jsonb_typeof(v_e) <> 'object' or length(coalesce(v_e->>'hours_code', '')) > 30 or coalesce(v_e->>'sep', ';') not in (';', ',', E'\t')
       or coalesce(v_e->>'decimal', ',') not in (',', '.') then
      perform kokolio._fail('parametre', 'Format d''export invalide.');
    end if;
    v_new := jsonb_set(v_new, '{export}', jsonb_build_object('hours_code', coalesce(v_e->>'hours_code', ''), 'include_hours', coalesce((v_e->>'include_hours')::boolean, true),
      'sep', coalesce(v_e->>'sep', ';'), 'decimal', coalesce(v_e->>'decimal', ','), 'header', coalesce((v_e->>'header')::boolean, true)));
  end if;
  v_new := jsonb_set(v_new, '{version}', to_jsonb(coalesce((v_old->>'version')::int, 1) + 1));
  update kokolio.meta set value = v_new, updated_at = now() where key = 'settings';
  perform kokolio._audit(me.id, 'parametres_modifies', null, '',
    kokolio._diff(v_old, v_new, array['company', 'logo_url', 'go_live', 'pause_threshold_min', 'max_day_min', 'max_week_min', 'min_rest_min', 'activation_days', 'night_until', 'break_paid_min', 'anomalies', 'lieux', 'export']),
    coalesce(p->>'ip', ''));
  return jsonb_build_object('settings', v_new);
end $$;

create or replace function kokolio._type_save(me kokolio.users, p jsonb, p_args jsonb) returns jsonb language plpgsql as $$
declare v_t jsonb := coalesce(p_args->'type', '{}'::jsonb); v_code text; t kokolio.absence_types; o kokolio.absence_types;
begin
  if me.role <> 'admin' then perform kokolio._fail('interdit', 'Accès réservé aux administrateurs.'); end if;
  v_code := lower(trim(coalesce(v_t->>'code', '')));
  if v_code !~ '^[a-z0-9_]{2,30}$' then perform kokolio._fail('parametre', 'Code de motif invalide (lettres minuscules, chiffres, tiret bas).'); end if;
  if length(trim(coalesce(v_t->>'label', ''))) < 2 or length(v_t->>'label') > 60 then perform kokolio._fail('parametre', 'Libellé de motif invalide.'); end if;
  if coalesce(v_t->>'category', 'autre') not in ('cp', 'rtt', 'maladie', 'autre') then perform kokolio._fail('parametre', 'Catégorie inconnue.'); end if;
  if length(coalesce(v_t->>'export_code', '')) > 30 then perform kokolio._fail('parametre', 'Code d''export trop long.'); end if;
  if coalesce(v_t->>'annual', 'retire') not in ('retire', 'realise', 'neutre') then perform kokolio._fail('parametre', 'Effet sur l''annualisation inconnu.'); end if;
  select * into o from kokolio.absence_types x where x.code = v_code;
  -- l'effet sur l'annualisation n'est modifié que s'il est envoyé : sinon il garde sa valeur
  insert into kokolio.absence_types as x (code, label, category, export_code, needs_doc, absenteeism, active, sort, annual)
  values (v_code, trim(v_t->>'label'), coalesce(v_t->>'category', 'autre'), trim(coalesce(v_t->>'export_code', '')),
          coalesce((v_t->>'needs_doc')::boolean, false), coalesce((v_t->>'absenteeism')::boolean, true),
          coalesce((v_t->>'active')::boolean, true), coalesce((v_t->>'sort')::int, 100), coalesce(v_t->>'annual', o.annual, 'retire'))
  on conflict (code) do update set label = excluded.label, category = excluded.category, export_code = excluded.export_code,
    needs_doc = excluded.needs_doc, absenteeism = excluded.absenteeism, active = excluded.active, sort = excluded.sort, annual = excluded.annual
  returning * into t;
  perform kokolio._audit(me.id, case when o.code is null then 'motif_cree' else 'motif_modifie' end, null, v_code,
    kokolio._diff(coalesce(to_jsonb(o), '{}'::jsonb), to_jsonb(t), array['label', 'category', 'export_code', 'needs_doc', 'absenteeism', 'active', 'sort', 'annual']), coalesce(p->>'ip', ''));
  return jsonb_build_object('type', to_jsonb(t));
end $$;

create or replace function kokolio._status(me kokolio.users) returns jsonb language plpgsql stable as $$
begin
  if me.role <> 'admin' then perform kokolio._fail('interdit', 'Accès réservé aux administrateurs.'); end if;
  return jsonb_build_object(
    'schema', (select m.value from kokolio.meta m where m.key = 'schema_version'),
    'users', (select count(*) from kokolio.users),
    'admins', (select count(*) from kokolio.users u where u.role = 'admin'),
    'active_users', (select count(*) from kokolio.users u where kokolio._account_ok(u)),
    'activated', (select count(*) from kokolio.users u where u.pw_hash is not null and kokolio._account_ok(u)),
    'sessions', (select count(*) from kokolio.sessions s where s.expires_at > kokolio._now()),
    'days', (select count(*) from kokolio.days),
    'punches', (select count(*) from kokolio.punch_log),
    'absences', (select count(*) from kokolio.absences),
    'documents', (select count(*) from kokolio.attachments),
    'documents_bytes', (select coalesce(sum(t.size), 0) from kokolio.attachments t),
    'audit', (select count(*) from kokolio.audit),
    'closures', (select count(*) from kokolio.closures),
    'db_bytes', (select coalesce(sum(pg_total_relation_size(c.oid)), 0) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'kokolio' and c.relkind = 'r'),
    'now', kokolio._now(), 'today', kokolio._today(), 'hm', kokolio._hm());
end $$;
