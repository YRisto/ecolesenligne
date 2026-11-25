-- =====================================================================
-- Kokolio — lectures par périmètre, pointage, corrections, validations, absences
-- =====================================================================

create or replace function kokolio._ctx(me kokolio.users) returns jsonb language plpgsql stable as $$
begin
  return jsonb_build_object(
    'user', kokolio._user_json(me, true),
    'contract', (select kokolio._contract_json(c) || jsonb_build_object('cycle', case when c.cycle_id is not null then kokolio._cycle_json(c.cycle_id) end)
                 from kokolio.contracts c
                 where c.user_id = me.id and c.start_date <= kokolio._today() and (c.end_date is null or c.end_date >= kokolio._today())
                 order by c.start_date desc limit 1),
    'reports', (select count(*) from kokolio.users r where r.manager_id = me.id and not r.disabled),
    'settings', (select m.value from kokolio.meta m where m.key = 'settings'),
    'types', coalesce((select jsonb_agg(to_jsonb(t) order by t.sort, t.label) from kokolio.absence_types t), '[]'::jsonb),
    'closed', kokolio._closed_months(),
    'today', kokolio._today(), 'hm', kokolio._hm(), 'now', kokolio._now(),
    'demo', exists (select 1 from kokolio.meta m where m.key = 'demo'),
    'schema', (select m.value from kokolio.meta m where m.key = 'schema_version'));
end $$;

-- Périmètre d'une lecture : soi, son équipe directe, une liste de salariés visibles, ou tout le monde (RH).
create or replace function kokolio._scope_ids(me kokolio.users, p_args jsonb) returns uuid[] language plpgsql stable as $$
declare v_scope text := coalesce(p_args->>'scope', 'self'); v_ids uuid[] := '{}'; v_id uuid;
begin
  if v_scope = 'self' then
    return array[me.id];
  elsif v_scope = 'team' then
    select coalesce(array_agg(u.id), '{}') into v_ids from kokolio.users u where u.manager_id = me.id;
    return v_ids;
  elsif v_scope = 'all' then
    if me.role not in ('rh', 'admin') then perform kokolio._fail('interdit', 'Accès réservé aux RH.'); end if;
    select coalesce(array_agg(u.id), '{}') into v_ids from kokolio.users u;
    return v_ids;
  elsif v_scope = 'users' then
    for v_id in select x::uuid from jsonb_array_elements_text(coalesce(p_args->'user_ids', '[]'::jsonb)) x loop
      if not kokolio._can_see(me, v_id) then perform kokolio._fail('interdit', 'Vous n''avez pas accès à ce salarié.'); end if;
      v_ids := v_ids || v_id;
    end loop;
    return v_ids;
  end if;
  perform kokolio._fail('requete', 'Périmètre inconnu.');
  return v_ids;
end $$;

create or replace function kokolio._read(me kokolio.users, p_args jsonb) returns jsonb language plpgsql stable as $$
declare
  v_ids uuid[] := kokolio._scope_ids(me, p_args); v_from date := (p_args->>'from')::date; v_to date := (p_args->>'to')::date;
  v_rh boolean := me.role in ('rh', 'admin'); v_days boolean := coalesce((p_args->>'days')::boolean, true);
  v_fp text := nullif(p_args->>'fingerprint_month', '');
begin
  if v_from is null or v_to is null or v_to < v_from or v_to - v_from > 1100 then
    perform kokolio._fail('requete', 'Période invalide.');
  end if;
  if v_fp is not null and not v_rh then perform kokolio._fail('interdit', 'Accès réservé aux RH.'); end if;
  return jsonb_build_object(
    'users', coalesce((select jsonb_agg(kokolio._user_json(u, v_rh or u.id = me.id) order by u.last_name, u.first_name, u.login)
                       from kokolio.users u where u.id = any(v_ids)), '[]'::jsonb),
    'contracts', coalesce((select jsonb_agg(kokolio._contract_json(c) order by c.user_id, c.start_date)
                           from kokolio.contracts c where c.user_id = any(v_ids)), '[]'::jsonb),
    'days', case when v_days then coalesce((select jsonb_agg(kokolio._day_json(d) order by d.day)
                           from kokolio.days d where d.user_id = any(v_ids) and d.day between v_from and v_to), '[]'::jsonb)
                 else '[]'::jsonb end,
    'absences', coalesce((select jsonb_agg(kokolio._abs_json(a) order by a.start_date, a.created_at)
                          from kokolio.absences a where a.user_id = any(v_ids) and a.start_date <= v_to and a.end_date >= v_from), '[]'::jsonb),
    'entries', coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at)
                         from kokolio.balance_entries e
                         where e.user_id = any(v_ids) and e.year between extract(year from v_from)::int and extract(year from v_to)::int), '[]'::jsonb),
    -- planification : les cycles suivis par ces salariés (résolus), et leurs exceptions sur la période.
    -- Toujours renvoyées, même sans les journées : le décompte d'une absence en dépend.
    'cycles', coalesce((select jsonb_agg(kokolio._cycle_json(x.cycle_id))
                        from (select distinct c.cycle_id from kokolio.contracts c where c.user_id = any(v_ids) and c.cycle_id is not null) x), '[]'::jsonb),
    'plan', coalesce((select jsonb_agg(jsonb_build_object('user_id', q.user_id, 'day', q.day, 'model_code', q.model_code, 'label', q.label,
                                                          'minutes', q.minutes, 'ranges', q.ranges, 'note', q.note) order by q.day)
                      from kokolio.plan_days q where q.user_id = any(v_ids) and q.day between v_from and v_to), '[]'::jsonb),
    'closed', kokolio._closed_months(),
    'fingerprint', case when v_fp is not null then kokolio._month_fingerprint(v_fp) end,
    'ctx', case when coalesce((p_args->>'ctx')::boolean, false) then kokolio._ctx(me) end,
    'today', kokolio._today(), 'hm', kokolio._hm());
end $$;

-- Ce qui attend une décision : pour un responsable, son équipe ; pour les RH, tout le monde.
create or replace function kokolio._pending(me kokolio.users, p_args jsonb) returns jsonb language plpgsql stable as $$
declare
  v_all boolean := coalesce(p_args->>'scope', 'team') = 'all'; v_ids uuid[]; v_one uuid := nullif(p_args->>'user_id', '')::uuid;
  v_self boolean := me.role = 'admin' and me.manager_id is null;
begin
  if v_all then
    if me.role not in ('rh', 'admin') then perform kokolio._fail('interdit', 'Accès réservé aux RH.'); end if;
    select coalesce(array_agg(u.id), '{}') into v_ids from kokolio.users u where u.id <> me.id or v_self;
  else
    select coalesce(array_agg(u.id), '{}') into v_ids from kokolio.users u where u.manager_id = me.id or (v_self and u.id = me.id);
  end if;
  if v_one is not null then
    if not (v_one = any(v_ids)) then perform kokolio._fail('interdit', 'Vous ne pouvez pas valider pour ce salarié.'); end if;
    v_ids := array[v_one];
  end if;
  return jsonb_build_object(
    'summary', coalesce((select jsonb_agg(jsonb_build_object('user_id', s.user_id, 'n', s.n, 'oldest', s.oldest) order by s.oldest)
                         from (select d.user_id, count(*) as n, min(d.day) as oldest from kokolio.days d
                               where d.user_id = any(v_ids) and d.status = 'a_valider' group by d.user_id) s), '[]'::jsonb),
    'days', case when v_all and v_one is null then '[]'::jsonb
                 else coalesce((select jsonb_agg(kokolio._day_json(d) order by d.day)
                                from kokolio.days d where d.user_id = any(v_ids) and d.status = 'a_valider'), '[]'::jsonb) end,
    'absences', coalesce((select jsonb_agg(kokolio._abs_json(a) order by a.created_at)
                          from kokolio.absences a where a.user_id = any(v_ids) and a.status = 'en_attente'), '[]'::jsonb),
    'today', kokolio._today(), 'hm', kokolio._hm());
end $$;

-- ---------------------------------------------------------------------
-- Pointage : l'heure est celle du serveur, jamais celle de l'appareil.
-- ---------------------------------------------------------------------
create or replace function kokolio._punch(me kokolio.users, p jsonb, p_args jsonb) returns jsonb language plpgsql as $$
declare
  d kokolio.days; v_day date := kokolio._today(); v_hm text := kokolio._hm(); v_now timestamptz := kokolio._now();
  v_last timestamptz; v_lieu text := nullif(trim(coalesce(p_args->>'lieu', '')), ''); v_kind text; v_n int;
  v_night text := coalesce(kokolio._night(), ''); v_hm24 text;
begin
  if v_lieu is not null and not kokolio._lieu_ok(v_lieu) then perform kokolio._fail('requete', 'Lieu inconnu.'); end if;
  -- Travail de nuit : la journée commencée la veille et encore ouverte reçoit ce départ, noté au-delà de 24 h.
  if v_night <> '' and v_hm < v_night then
    select * into d from kokolio.days x where x.user_id = me.id and x.day = v_day - 1 for update;
    -- au-delà de seize heures depuis l'arrivée, c'est un départ oublié la veille, pas une nuit de travail : le pointage ouvre la journée du jour
    if d.id is not null and coalesce(array_length(d.times, 1), 0) % 2 = 1 and d.status <> 'valide'
       and not kokolio._month_closed(to_char(v_day - 1, 'YYYY-MM'))
       and (substr(v_hm, 1, 2)::int + 24) * 60 + substr(v_hm, 4, 2)::int
           - (substr(d.times[array_length(d.times, 1)], 1, 2)::int * 60 + substr(d.times[array_length(d.times, 1)], 4, 2)::int) <= 960 then
      select max(l.ts) into v_last from kokolio.punch_log l where l.user_id = me.id and l.day = v_day - 1;
      if v_last is not null and v_now - v_last < interval '15 seconds' then
        return jsonb_build_object('day', kokolio._day_json(d), 'duplicate', true, 'hm', v_hm);
      end if;
      v_hm24 := kokolio._plus24(v_hm);
      update kokolio.days set times = d.times || v_hm24, status = 'a_valider', refusal_reason = '', decided_by = null, decided_at = null,
        version = d.version + 1, updated_at = v_now
      where id = d.id returning * into d;
      insert into kokolio.punch_log (user_id, ts, day, hhmm, kind, ip, ua)
      values (me.id, v_now, v_day - 1, v_hm24, 'depart', coalesce(p->>'ip', ''), left(coalesce(p->>'ua', ''), 200));
      return jsonb_build_object('day', kokolio._day_json(d), 'kind', 'depart', 'hm', v_hm, 'veille', true);
    end if;
  end if;
  if kokolio._month_closed(to_char(v_day, 'YYYY-MM')) then perform kokolio._fail('cloture', 'Ce mois est clôturé.'); end if;
  insert into kokolio.days (user_id, day, lieu) values (me.id, v_day, coalesce(v_lieu, 'bureau')) on conflict (user_id, day) do nothing;
  select * into d from kokolio.days x where x.user_id = me.id and x.day = v_day for update;
  v_n := coalesce(array_length(d.times, 1), 0);
  select max(l.ts) into v_last from kokolio.punch_log l where l.user_id = me.id and l.day = v_day;
  if v_n > 0 and v_last is not null and v_now - v_last < interval '15 seconds' then
    return jsonb_build_object('day', kokolio._day_json(d), 'duplicate', true, 'hm', v_hm);
  end if;
  if d.status = 'valide' then perform kokolio._fail('verrou', 'Cette journée est déjà validée.'); end if;
  if v_n >= 20 then perform kokolio._fail('heures', 'Trop de pointages pour une seule journée.'); end if;
  if v_n > 0 and v_hm < d.times[v_n] then
    perform kokolio._fail('heures', 'L''heure actuelle est antérieure au dernier pointage. Corrigez la journée dans « Heures ».');
  end if;
  update kokolio.days set times = d.times || v_hm, status = 'a_valider', refusal_reason = '', decided_by = null, decided_at = null,
    lieu = coalesce(v_lieu, d.lieu), version = d.version + 1, updated_at = v_now
  where id = d.id returning * into d;
  v_kind := case when (v_n + 1) % 2 = 1 then 'arrivee' else 'depart' end;
  insert into kokolio.punch_log (user_id, ts, day, hhmm, kind, ip, ua)
  values (me.id, v_now, v_day, v_hm, v_kind, coalesce(p->>'ip', ''), left(coalesce(p->>'ua', ''), 200));
  return jsonb_build_object('day', kokolio._day_json(d), 'kind', v_kind, 'hm', v_hm);
end $$;

create or replace function kokolio._day_lieu(me kokolio.users, p_args jsonb) returns jsonb language plpgsql as $$
declare d kokolio.days; v_lieu text := trim(coalesce(p_args->>'lieu', ''));
begin
  if not kokolio._lieu_ok(v_lieu) then perform kokolio._fail('requete', 'Lieu inconnu.'); end if;
  select * into d from kokolio.days x where x.user_id = me.id and x.day = (p_args->>'day')::date for update;
  if d.id is null then perform kokolio._fail('introuvable', 'Journée introuvable.'); end if;
  if d.status = 'valide' then perform kokolio._fail('verrou', 'Cette journée est déjà validée.'); end if;
  update kokolio.days set lieu = v_lieu, version = d.version + 1, updated_at = kokolio._now() where id = d.id returning * into d;
  return jsonb_build_object('day', kokolio._day_json(d));
end $$;

-- Correction d'une journée (ou ajout d'une journée oubliée) : motif obligatoire, puis retour en validation.
-- Les RH peuvent corriger pour le compte d'un salarié ; c'est tracé comme tel.
create or replace function kokolio._day_set(me kokolio.users, p jsonb, p_args jsonb) returns jsonb language plpgsql as $$
declare
  v_uid uuid := coalesce(nullif(p_args->>'user_id', '')::uuid, me.id); v_day date := (p_args->>'day')::date;
  v_times text[] := kokolio._times(p_args->'times'); v_comment text := trim(coalesce(p_args->>'comment', ''));
  v_lieu text := nullif(trim(coalesce(p_args->>'lieu', '')), ''); d kokolio.days; v_before text[];
  v_n int; v_today date := kokolio._today(); v_behalf boolean; v_night text := coalesce(kokolio._night(), ''); v_hm text := kokolio._hm();
begin
  v_n := coalesce(array_length(v_times, 1), 0);
  v_behalf := v_uid <> me.id;
  if v_behalf and me.role not in ('rh', 'admin') then
    perform kokolio._fail('interdit', 'Seuls les RH peuvent corriger la journée d''un autre salarié.');
  end if;
  if v_behalf and not exists (select 1 from kokolio.users u where u.id = v_uid) then
    perform kokolio._fail('introuvable', 'Salarié introuvable.');
  end if;
  if v_day is null or v_day > v_today then perform kokolio._fail('date', 'Choisissez un jour passé ou aujourd''hui.'); end if;
  -- une journée de nuit commencée la veille peut rester ouverte jusqu'à l'heure limite du matin
  if v_n % 2 = 1 and v_day <> v_today and not (v_night <> '' and v_day = v_today - 1 and v_hm < v_night) then
    perform kokolio._fail('heures', 'Chaque arrivée doit avoir son départ.');
  end if;
  if v_day = v_today and v_n > 0 and v_times[v_n] > v_hm then
    perform kokolio._fail('heures', 'Une heure saisie est dans le futur.');
  end if;
  if v_day = v_today - 1 and v_n > 0 and v_times[v_n] >= '24:00' and v_times[v_n] > kokolio._plus24(v_hm) then
    perform kokolio._fail('heures', 'Une heure saisie est dans le futur.');
  end if;
  if length(v_comment) < 3 then perform kokolio._fail('motif', 'Indiquez le motif de la correction.'); end if;
  if length(v_comment) > 500 then perform kokolio._fail('motif', 'Motif trop long (500 caractères au plus).'); end if;
  if kokolio._month_closed(to_char(v_day, 'YYYY-MM')) then
    perform kokolio._fail('cloture', 'Ce mois est clôturé. Adressez-vous aux RH.');
  end if;
  if v_lieu is not null and not kokolio._lieu_ok(v_lieu) then perform kokolio._fail('requete', 'Lieu inconnu.'); end if;
  select * into d from kokolio.days x where x.user_id = v_uid and x.day = v_day for update;
  if d.id is null then
    insert into kokolio.days (user_id, day, times, lieu, status, corrected, comment)
    values (v_uid, v_day, v_times, coalesce(v_lieu, 'bureau'), 'a_valider', true, v_comment) returning * into d;
  else
    if d.status = 'valide' then
      perform kokolio._fail('verrou', 'Cette journée est déjà validée. Elle doit d''abord être rouverte par le responsable.');
    end if;
    if p_args ? 'version' and (p_args->>'version')::int <> d.version then
      perform kokolio._fail('conflit', 'Cette journée a été modifiée entre-temps. Rechargez la page.');
    end if;
    v_before := d.times;
    update kokolio.days set times = v_times, lieu = coalesce(v_lieu, d.lieu), status = 'a_valider', corrected = true, comment = v_comment,
      refusal_reason = '', decided_by = null, decided_at = null, version = d.version + 1, updated_at = kokolio._now()
    where id = d.id returning * into d;
  end if;
  perform kokolio._audit(me.id, case when v_behalf then 'correction_par_rh' else 'correction' end, v_uid, v_day::text,
    jsonb_build_object('avant', to_jsonb(v_before), 'apres', to_jsonb(v_times), 'motif', v_comment), coalesce(p->>'ip', ''));
  return jsonb_build_object('day', kokolio._day_json(d));
end $$;

-- Décision sur des journées : valider, refuser (motif), ou rouvrir une journée validée (motif).
-- Chaque journée est traitée séparément : une journée périmée n'empêche pas les autres.
create or replace function kokolio._days_decide(me kokolio.users, p jsonb, p_args jsonb) returns jsonb language plpgsql as $$
declare
  v_decision text := coalesce(p_args->>'decision', ''); v_reason text := trim(coalesce(p_args->>'reason', ''));
  v_item jsonb; d kokolio.days; v_done jsonb := '[]'::jsonb; v_failed jsonb := '[]'::jsonb; v_by jsonb := '{}'::jsonb;
  v_today date := kokolio._today(); v_now timestamptz := kokolio._now(); v_code text; v_key text; v_action text;
begin
  if v_decision not in ('valide', 'refuse', 'a_valider') then perform kokolio._fail('requete', 'Décision inconnue.'); end if;
  if v_decision <> 'valide' and length(v_reason) < 3 then perform kokolio._fail('motif', 'Indiquez un motif.'); end if;
  if jsonb_typeof(p_args->'items') is distinct from 'array' or jsonb_array_length(p_args->'items') > 2000 then
    perform kokolio._fail('requete', 'Liste de journées invalide.');
  end if;
  for v_item in select x from jsonb_array_elements(p_args->'items') x loop
    begin
      select * into d from kokolio.days x where x.id = (v_item->>'id')::uuid for update;
      if d.id is null then perform kokolio._fail('introuvable', 'Journée introuvable.'); end if;
      if not kokolio._can_manage(me, d.user_id) then perform kokolio._fail('interdit', 'Vous ne pouvez pas valider pour ce salarié.'); end if;
      if v_item ? 'version' and (v_item->>'version')::int <> d.version then
        perform kokolio._fail('conflit', 'Journée modifiée entre-temps.');
      end if;
      if kokolio._month_closed(to_char(d.day, 'YYYY-MM')) then perform kokolio._fail('cloture', 'Mois clôturé.'); end if;
      if v_decision = 'valide' then
        if d.status <> 'a_valider' then perform kokolio._fail('etat', 'Cette journée n''est pas en attente de validation.'); end if;
        if d.day >= v_today then perform kokolio._fail('etat', 'Journée en cours : validable à partir de demain.'); end if;
        if coalesce(array_length(d.times, 1), 0) % 2 = 1 then perform kokolio._fail('etat', 'Départ non pointé : la journée doit être corrigée.'); end if;
        update kokolio.days set status = 'valide', decided_by = me.id, decided_at = v_now, refusal_reason = '', version = d.version + 1, updated_at = v_now where id = d.id;
      elsif v_decision = 'refuse' then
        if d.status <> 'a_valider' then perform kokolio._fail('etat', 'Cette journée n''est pas en attente de validation.'); end if;
        update kokolio.days set status = 'refuse', decided_by = me.id, decided_at = v_now, refusal_reason = v_reason, version = d.version + 1, updated_at = v_now where id = d.id;
      else
        if d.status <> 'valide' then perform kokolio._fail('etat', 'Cette journée n''est pas validée.'); end if;
        update kokolio.days set status = 'a_valider', decided_by = null, decided_at = null, version = d.version + 1, updated_at = v_now where id = d.id;
      end if;
      v_done := v_done || to_jsonb(d.id);
      v_key := d.user_id::text;
      v_by := jsonb_set(v_by, array[v_key], coalesce(v_by->v_key, '[]'::jsonb) || to_jsonb(d.day));
    exception when others then
      if sqlerrm not like 'KK:%' then raise; end if;
      v_code := split_part(sqlerrm, ':', 2);
      v_failed := v_failed || jsonb_build_object('id', v_item->>'id', 'code', v_code, 'message', substr(sqlerrm, 5 + length(v_code)));
    end;
  end loop;
  v_action := case v_decision when 'valide' then 'pointages_valides' when 'refuse' then 'pointage_refuse' else 'pointage_rouvert' end;
  for v_key in select k from jsonb_object_keys(v_by) k loop
    perform kokolio._audit(me.id, v_action, v_key::uuid, '',
      jsonb_strip_nulls(jsonb_build_object('jours', v_by->v_key, 'motif', nullif(v_reason, ''), 'auto_validation', case when v_key::uuid = me.id then true end)),
      coalesce(p->>'ip', ''));
  end loop;
  return jsonb_build_object('done', v_done, 'failed', v_failed);
end $$;

-- ---------------------------------------------------------------------
-- Absences
-- ---------------------------------------------------------------------
create or replace function kokolio._doc_put(p_abs uuid, p_doc jsonb, p_by uuid) returns void language plpgsql as $$
declare v_data bytea; v_name text := left(trim(coalesce(p_doc->>'name', 'justificatif')), 120); v_mime text := coalesce(p_doc->>'mime', '');
begin
  if v_mime not in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf') then
    perform kokolio._fail('justificatif', 'Format de justificatif non accepté (photo JPEG, PNG, WebP ou PDF).');
  end if;
  begin
    v_data := decode(coalesce(p_doc->>'data', ''), 'base64');
  exception when others then
    v_data := null;
  end;
  if v_data is null or octet_length(v_data) = 0 then perform kokolio._fail('justificatif', 'Justificatif illisible.'); end if;
  if octet_length(v_data) > 2500000 then perform kokolio._fail('justificatif', 'Le justificatif doit peser moins de 2,5 Mo.'); end if;
  insert into kokolio.attachments as t (absence_id, filename, mime, size, data, uploaded_by)
  values (p_abs, v_name, v_mime, octet_length(v_data), v_data, p_by)
  on conflict (absence_id) do update set filename = excluded.filename, mime = excluded.mime, size = excluded.size,
    data = excluded.data, uploaded_by = excluded.uploaded_by, created_at = now();
end $$;

-- Demande d'absence par le salarié (en attente), ou saisie directe par les RH (validée d'office, tracée).
create or replace function kokolio._absence_create(me kokolio.users, p jsonb, p_args jsonb) returns jsonb language plpgsql as $$
declare
  v_uid uuid := coalesce(nullif(p_args->>'user_id', '')::uuid, me.id); v_type text := coalesce(p_args->>'type', '');
  v_start date := (p_args->>'start')::date; v_end date := (p_args->>'end')::date; v_half text := coalesce(p_args->>'half', '');
  v_count numeric := (p_args->>'days_count')::numeric; v_comment text := left(trim(coalesce(p_args->>'comment', '')), 500);
  v_behalf boolean; a kokolio.absences; v_now timestamptz := kokolio._now();
begin
  v_behalf := v_uid <> me.id;
  if v_behalf and me.role not in ('rh', 'admin') then
    perform kokolio._fail('interdit', 'Seuls les RH peuvent saisir une absence pour un autre salarié.');
  end if;
  if v_behalf and not exists (select 1 from kokolio.users u where u.id = v_uid) then perform kokolio._fail('introuvable', 'Salarié introuvable.'); end if;
  if not exists (select 1 from kokolio.absence_types t where t.code = v_type and t.active) then perform kokolio._fail('requete', 'Motif d''absence inconnu.'); end if;
  if v_start is null or v_end is null or v_end < v_start then perform kokolio._fail('date', 'La date de fin doit suivre la date de début.'); end if;
  if v_end - v_start > 366 then perform kokolio._fail('date', 'Une absence ne peut pas dépasser un an.'); end if;
  if v_half not in ('', 'matin', 'apres_midi') or (v_half <> '' and v_start <> v_end) then
    perform kokolio._fail('date', 'La demi-journée ne s''applique qu''à une absence d''un seul jour.');
  end if;
  if v_count is null or v_count <= 0 or v_count > (v_end - v_start + 1) then
    perform kokolio._fail('date', 'Cette période ne contient aucun jour travaillé.');
  end if;
  if kokolio._range_closed(v_start, v_end) then perform kokolio._fail('cloture', 'Cette période touche un mois clôturé. Adressez-vous aux RH.'); end if;
  perform 1 from kokolio.users u where u.id = v_uid for update;  -- sérialise les demandes d'un même salarié
  if exists (select 1 from kokolio.absences x where x.user_id = v_uid and x.status in ('en_attente', 'valide')
             and x.start_date <= v_end and x.end_date >= v_start
             and not (x.half <> '' and v_half <> '' and x.half <> v_half)) then
    perform kokolio._fail('conflit', 'Une absence existe déjà sur cette période.');
  end if;
  insert into kokolio.absences (user_id, type_code, start_date, end_date, half, days_count, comment, status, decided_by, decided_at, created_by)
  values (v_uid, v_type, v_start, v_end, v_half, v_count, v_comment,
          case when v_behalf then 'valide' else 'en_attente' end,
          case when v_behalf then me.id end, case when v_behalf then v_now end, me.id)
  returning * into a;
  if p_args ? 'doc' and jsonb_typeof(p_args->'doc') = 'object' then
    perform kokolio._doc_put(a.id, p_args->'doc', me.id);
    update kokolio.absences set has_doc = true where id = a.id returning * into a;
  end if;
  perform kokolio._audit(me.id, case when v_behalf then 'absence_saisie_par_rh' else 'absence_demandee' end, v_uid, v_type,
    jsonb_build_object('du', v_start, 'au', v_end, 'demi', nullif(v_half, ''), 'jours', v_count, 'justificatif', a.has_doc), coalesce(p->>'ip', ''));
  return jsonb_build_object('absence', kokolio._abs_json(a));
end $$;

create or replace function kokolio._absence_cancel(me kokolio.users, p jsonb, p_args jsonb) returns jsonb language plpgsql as $$
declare a kokolio.absences;
begin
  select * into a from kokolio.absences x where x.id = nullif(p_args->>'id', '')::uuid for update;
  if a.id is null or a.user_id <> me.id then perform kokolio._fail('introuvable', 'Demande introuvable.'); end if;
  if a.status <> 'en_attente' then
    perform kokolio._fail('etat', 'Seule une demande en attente peut être annulée. Pour une absence validée, adressez-vous à votre responsable.');
  end if;
  update kokolio.absences set status = 'annule', version = a.version + 1, updated_at = kokolio._now() where id = a.id returning * into a;
  perform kokolio._audit(me.id, 'absence_annulee', me.id, a.type_code, jsonb_build_object('du', a.start_date, 'au', a.end_date), coalesce(p->>'ip', ''));
  return jsonb_build_object('absence', kokolio._abs_json(a));
end $$;

-- Décision du responsable ou des RH : valider, refuser (motif), ou annuler une absence déjà validée (motif).
create or replace function kokolio._absence_decide(me kokolio.users, p jsonb, p_args jsonb) returns jsonb language plpgsql as $$
declare
  a kokolio.absences; v_decision text := coalesce(p_args->>'decision', ''); v_reason text := left(trim(coalesce(p_args->>'reason', '')), 500);
  v_now timestamptz := kokolio._now(); v_action text;
begin
  if v_decision not in ('valide', 'refuse', 'annule') then perform kokolio._fail('requete', 'Décision inconnue.'); end if;
  if v_decision <> 'valide' and length(v_reason) < 3 then perform kokolio._fail('motif', 'Indiquez un motif.'); end if;
  select * into a from kokolio.absences x where x.id = nullif(p_args->>'id', '')::uuid for update;
  if a.id is null then perform kokolio._fail('introuvable', 'Demande introuvable.'); end if;
  if not kokolio._can_manage(me, a.user_id) then perform kokolio._fail('interdit', 'Vous ne pouvez pas décider pour ce salarié.'); end if;
  if p_args ? 'version' and (p_args->>'version')::int <> a.version then
    perform kokolio._fail('conflit', 'Cette demande a été modifiée entre-temps. Rechargez la page.');
  end if;
  if v_decision in ('valide', 'refuse') and a.status <> 'en_attente' then perform kokolio._fail('etat', 'Cette demande n''est plus en attente.'); end if;
  if v_decision = 'annule' and a.status <> 'valide' then perform kokolio._fail('etat', 'Seule une absence validée peut être annulée ici.'); end if;
  if kokolio._range_closed(a.start_date, a.end_date) then perform kokolio._fail('cloture', 'Cette absence touche un mois clôturé.'); end if;
  update kokolio.absences set status = v_decision, decided_by = me.id, decided_at = v_now, refusal_reason = case when v_decision = 'valide' then '' else v_reason end,
    version = a.version + 1, updated_at = v_now where id = a.id returning * into a;
  v_action := case v_decision when 'valide' then 'absence_validee' when 'refuse' then 'absence_refusee' else 'absence_annulee_par_responsable' end;
  perform kokolio._audit(me.id, v_action, a.user_id, a.type_code,
    jsonb_strip_nulls(jsonb_build_object('du', a.start_date, 'au', a.end_date, 'jours', a.days_count, 'motif', nullif(v_reason, ''))), coalesce(p->>'ip', ''));
  return jsonb_build_object('absence', kokolio._abs_json(a));
end $$;

-- Ajout ou remplacement du justificatif par le salarié (ou les RH), tant que l'absence est en attente ou validée.
create or replace function kokolio._absence_attach(me kokolio.users, p jsonb, p_args jsonb) returns jsonb language plpgsql as $$
declare a kokolio.absences;
begin
  select * into a from kokolio.absences x where x.id = nullif(p_args->>'id', '')::uuid for update;
  if a.id is null or not (a.user_id = me.id or me.role in ('rh', 'admin')) then perform kokolio._fail('introuvable', 'Demande introuvable.'); end if;
  if a.status not in ('en_attente', 'valide') then perform kokolio._fail('etat', 'Cette demande n''accepte plus de justificatif.'); end if;
  perform kokolio._doc_put(a.id, p_args->'doc', me.id);
  if not a.has_doc then
    update kokolio.absences set has_doc = true, updated_at = kokolio._now() where id = a.id returning * into a;
  end if;
  perform kokolio._audit(me.id, 'justificatif_depose', a.user_id, a.type_code, jsonb_build_object('du', a.start_date, 'au', a.end_date), coalesce(p->>'ip', ''));
  return jsonb_build_object('absence', kokolio._abs_json(a));
end $$;

-- Lecture d'un justificatif : le salarié, son responsable, les RH. Toute consultation par un tiers est journalisée.
create or replace function kokolio._doc_get(me kokolio.users, p jsonb, p_args jsonb) returns jsonb language plpgsql as $$
declare a kokolio.absences; t kokolio.attachments;
begin
  select * into a from kokolio.absences x where x.id = nullif(p_args->>'id', '')::uuid;
  if a.id is null or not (a.user_id = me.id or kokolio._can_manage(me, a.user_id)) then
    perform kokolio._fail('introuvable', 'Justificatif introuvable.');
  end if;
  select * into t from kokolio.attachments x where x.absence_id = a.id;
  if t.absence_id is null then perform kokolio._fail('introuvable', 'Justificatif introuvable.'); end if;
  if a.user_id <> me.id then
    perform kokolio._audit(me.id, 'justificatif_consulte', a.user_id, a.type_code, jsonb_build_object('du', a.start_date, 'au', a.end_date), coalesce(p->>'ip', ''));
  end if;
  return jsonb_build_object('filename', t.filename, 'mime', t.mime, 'size', t.size, 'data', replace(encode(t.data, 'base64'), E'\n', ''));
end $$;

-- Trace brute des pointages d'une journée : le salarié, son responsable, les RH.
create or replace function kokolio._punch_log(me kokolio.users, p_args jsonb) returns jsonb language plpgsql stable as $$
declare v_uid uuid := coalesce(nullif(p_args->>'user_id', '')::uuid, me.id); v_from date := (p_args->>'from')::date; v_to date := coalesce((p_args->>'to')::date, (p_args->>'from')::date);
begin
  if not kokolio._can_see(me, v_uid) then perform kokolio._fail('interdit', 'Vous n''avez pas accès à ce salarié.'); end if;
  if v_from is null or v_to < v_from or v_to - v_from > 62 then perform kokolio._fail('requete', 'Période invalide.'); end if;
  return coalesce((select jsonb_agg(jsonb_build_object('ts', l.ts, 'day', l.day, 'hhmm', l.hhmm, 'kind', l.kind) order by l.ts)
                   from kokolio.punch_log l where l.user_id = v_uid and l.day between v_from and v_to), '[]'::jsonb);
end $$;
