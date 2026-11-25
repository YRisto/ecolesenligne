-- =====================================================================
-- Kokolio — socle : horloge, erreurs, verrous de clôture, journal, sessions, droits
-- =====================================================================

create or replace function kokolio._fail(p_code text, p_msg text) returns void language plpgsql as $$
begin
  raise exception 'KK:%:%', p_code, p_msg;
end $$;

create or replace function kokolio._tz() returns text language sql stable as $$
  select coalesce((select m.value->>'timezone' from kokolio.meta m where m.key = 'settings'), 'Europe/Paris')
$$;

-- L'heure fait foi côté serveur. Elle n'est remplaçable qu'en mode test (ligne « test_mode » absente en production).
create or replace function kokolio._now() returns timestamptz language plpgsql stable as $$
declare v_fake text;
begin
  v_fake := nullif(current_setting('kokolio.test_now', true), '');
  if v_fake is not null and exists (select 1 from kokolio.meta m where m.key = 'test_mode' and m.value = 'true'::jsonb) then
    return v_fake::timestamptz;
  end if;
  return now();
end $$;

create or replace function kokolio._today() returns date language sql stable as $$
  select (kokolio._now() at time zone kokolio._tz())::date
$$;

create or replace function kokolio._hm() returns text language sql stable as $$
  select to_char(kokolio._now() at time zone kokolio._tz(), 'HH24:MI')
$$;

create or replace function kokolio._month_closed(p_month text) returns boolean language sql stable as $$
  select coalesce((select c.status = 'cloture' from kokolio.closures c where c.month = p_month order by c.version desc limit 1), false)
$$;

create or replace function kokolio._range_closed(p_from date, p_to date) returns boolean language sql stable as $$
  select exists (
    select 1 from generate_series(date_trunc('month', p_from::timestamp), date_trunc('month', p_to::timestamp), interval '1 month') g
    where kokolio._month_closed(to_char(g, 'YYYY-MM')))
$$;

create or replace function kokolio._closed_months() returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(x.month order by x.month), '[]'::jsonb)
  from (select distinct on (c.month) c.month, c.status from kokolio.closures c order by c.month, c.version desc) x
  where x.status = 'cloture'
$$;

-- ---------------------------------------------------------------------
-- Verrous de clôture : même le propriétaire de la base ne peut pas modifier un mois clôturé sans le rouvrir.
-- ---------------------------------------------------------------------
create or replace function kokolio._guard_days() returns trigger language plpgsql as $$
begin
  if tg_op <> 'INSERT' and kokolio._month_closed(to_char(old.day, 'YYYY-MM')) then
    raise exception 'KK:cloture:Ce mois est clôturé : plus aucune modification possible.';
  end if;
  if tg_op <> 'DELETE' and kokolio._month_closed(to_char(new.day, 'YYYY-MM')) then
    raise exception 'KK:cloture:Ce mois est clôturé : plus aucune modification possible.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create or replace trigger days_guard before insert or update or delete on kokolio.days
  for each row execute function kokolio._guard_days();
-- Le planning d'un mois clôturé est figé comme ses journées.
create or replace trigger plan_days_guard before insert or update or delete on kokolio.plan_days
  for each row execute function kokolio._guard_days();

create or replace function kokolio._guard_absences() returns trigger language plpgsql as $$
begin
  -- seul le dépôt tardif d'un justificatif reste possible sur un mois clôturé : il ne change aucun chiffre
  if tg_op = 'UPDATE' and (to_jsonb(old) - 'has_doc' - 'updated_at') = (to_jsonb(new) - 'has_doc' - 'updated_at') then
    return new;
  end if;
  if tg_op <> 'INSERT' and kokolio._range_closed(old.start_date, old.end_date) then
    raise exception 'KK:cloture:Cette absence touche un mois clôturé : plus aucune modification possible.';
  end if;
  if tg_op <> 'DELETE' and kokolio._range_closed(new.start_date, new.end_date) then
    raise exception 'KK:cloture:Cette absence touche un mois clôturé : plus aucune modification possible.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create or replace trigger absences_guard before insert or update or delete on kokolio.absences
  for each row execute function kokolio._guard_absences();

-- ---------------------------------------------------------------------
-- Tables en ajout seul : journal, trace des pointages, écritures de solde
-- ---------------------------------------------------------------------
create or replace function kokolio._append_only() returns trigger language plpgsql as $$
begin
  -- Seule exception : l'effacement des données de démonstration, qui pose ce drapeau le temps de sa transaction
  -- (voir _demo_reset : administrateur, et uniquement si l'outil est en mode démonstration).
  if tg_op = 'DELETE' and current_setting('kokolio.purge', true) = '1' then
    return old;
  end if;
  raise exception 'KK:journal:Cette table est en ajout seul : aucune modification ni suppression.';
end $$;
create or replace trigger audit_append_only before update or delete on kokolio.audit
  for each row execute function kokolio._append_only();
create or replace trigger audit_no_truncate before truncate on kokolio.audit
  for each statement execute function kokolio._append_only();
create or replace trigger punch_log_append_only before update or delete on kokolio.punch_log
  for each row execute function kokolio._append_only();
create or replace trigger punch_log_no_truncate before truncate on kokolio.punch_log
  for each statement execute function kokolio._append_only();
create or replace trigger balance_append_only before update or delete on kokolio.balance_entries
  for each row execute function kokolio._append_only();

-- ---------------------------------------------------------------------
-- Journal chaîné : chaque ligne porte l'empreinte de la précédente.
-- ---------------------------------------------------------------------
create or replace function kokolio._audit_hash(p_prev text, p_seq bigint, p_ts timestamptz, p_actor uuid, p_label text,
    p_action text, p_target_user uuid, p_target text, p_detail jsonb, p_ip text) returns text language sql stable as $$
  select encode(sha256(convert_to(
    p_prev || '|' || p_seq::text || '|' || to_char(p_ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') || '|' ||
    coalesce(p_actor::text, '') || '|' || p_label || '|' || p_action || '|' || coalesce(p_target_user::text, '') || '|' ||
    p_target || '|' || p_detail::text || '|' || p_ip, 'UTF8')), 'hex')
$$;

create or replace function kokolio._audit(p_actor uuid, p_action text, p_target_user uuid, p_target text, p_detail jsonb, p_ip text)
returns void language plpgsql as $$
declare
  v_head jsonb; v_prev text; v_hash text; v_seq bigint; v_ts timestamptz := clock_timestamp(); v_label text := '';
  v_detail jsonb := coalesce(p_detail, '{}'::jsonb); v_target text := coalesce(p_target, ''); v_ip text := coalesce(p_ip, '');
begin
  select m.value into v_head from kokolio.meta m where m.key = 'audit_head' for update;
  v_prev := coalesce(v_head->>'hash', '');
  v_seq := nextval('kokolio.audit_seq_seq');
  if p_actor is not null then
    select trim(u.first_name || ' ' || u.last_name) || ' (' || u.login || ')' into v_label from kokolio.users u where u.id = p_actor;
    v_label := coalesce(v_label, '');
  end if;
  v_hash := kokolio._audit_hash(v_prev, v_seq, v_ts, p_actor, v_label, p_action, p_target_user, v_target, v_detail, v_ip);
  insert into kokolio.audit (seq, ts, actor, actor_label, action, target_user, target, detail, ip, prev_hash, hash)
  values (v_seq, v_ts, p_actor, v_label, p_action, p_target_user, v_target, v_detail, v_ip, v_prev, v_hash);
  update kokolio.meta set value = jsonb_build_object('seq', v_seq, 'hash', v_hash), updated_at = now() where key = 'audit_head';
end $$;

-- ---------------------------------------------------------------------
-- Représentations JSON
-- ---------------------------------------------------------------------
create or replace function kokolio._user_json(u kokolio.users, p_full boolean) returns jsonb language plpgsql stable as $$
declare v_j jsonb; v_mgr text;
begin
  select trim(m.first_name || ' ' || m.last_name) into v_mgr from kokolio.users m where m.id = u.manager_id;
  v_j := jsonb_build_object(
    'id', u.id, 'login', u.login, 'role', u.role, 'first_name', u.first_name, 'last_name', u.last_name,
    'name', trim(u.first_name || ' ' || u.last_name), 'matricule', u.matricule, 'team', u.team, 'job', u.job,
    'manager_id', u.manager_id, 'manager_name', coalesce(v_mgr, ''), 'entry_date', u.entry_date, 'exit_date', u.exit_date,
    'tracked_from', u.tracked_from, 'disabled', u.disabled, 'version', u.version, 'activated', u.pw_hash is not null,
    'code_pending', (u.act_hash is not null and u.act_expires > kokolio._now()));
  if p_full then
    v_j := v_j || jsonb_build_object('email', u.email, 'details', u.details,
      'locked', (u.locked_until is not null and u.locked_until > kokolio._now()),
      'code_expires', case when u.act_hash is not null then u.act_expires end);
  end if;
  return v_j;
end $$;

create or replace function kokolio._day_json(d kokolio.days) returns jsonb language sql stable as $$
  select to_jsonb(d) - 'created_at'
$$;

create or replace function kokolio._abs_json(a kokolio.absences) returns jsonb language sql stable as $$
  select to_jsonb(a)
$$;

create or replace function kokolio._contract_json(c kokolio.contracts) returns jsonb language sql stable as $$
  select to_jsonb(c) - 'created_by' - 'created_at'
$$;

-- Un cycle avec ses horaires journaliers résolus : le calcul n'a plus besoin de la bibliothèque.
create or replace function kokolio._cycle_json(p_id uuid) returns jsonb language sql stable as $$
  select jsonb_build_object('id', c.id, 'name', c.name, 'active', c.active, 'version', c.version,
    'weeks', (select coalesce(jsonb_agg(
        (select jsonb_agg(case when m.code is null then 'null'::jsonb
                               else jsonb_build_object('code', m.code, 'label', m.label, 'minutes', m.minutes, 'ranges', m.ranges, 'color', m.color) end order by d.o)
         from jsonb_array_elements_text(w.v) with ordinality as d(code, o) left join kokolio.day_models m on m.code = d.code)
        order by w.o), '[]'::jsonb)
      from jsonb_array_elements(c.weeks) with ordinality as w(v, o)))
  from kokolio.cycles c where c.id = p_id
$$;
-- Un cycle (ou un horaire journalier) qui a servi dans un mois clôturé ne change plus de composition : on en crée un nouveau.
create or replace function kokolio._cycle_locked(p_id uuid) returns boolean language sql stable as $$
  select exists (
    select 1 from kokolio.contracts k, jsonb_array_elements_text(kokolio._closed_months()) m
    where k.cycle_id = p_id and m >= to_char(k.start_date, 'YYYY-MM') and (k.end_date is null or m <= to_char(k.end_date, 'YYYY-MM')))
$$;
create or replace function kokolio._model_cycles(p_code text) returns uuid[] language sql stable as $$
  select coalesce(array_agg(c.id), '{}') from kokolio.cycles c
  where exists (select 1 from jsonb_array_elements(c.weeks) w, jsonb_array_elements_text(w) x where x = p_code)
$$;

-- ---------------------------------------------------------------------
-- Sessions et droits
-- ---------------------------------------------------------------------
create or replace function kokolio._session_new(p_user uuid, p_token text, p_ip text, p_ua text) returns void language plpgsql as $$
declare v_now timestamptz := kokolio._now();
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    perform kokolio._fail('requete', 'Jeton de session invalide.');
  end if;
  insert into kokolio.sessions (token_hash, user_id, created_at, last_seen, expires_at, ip, ua)
  values (p_token, p_user, v_now, v_now, v_now + interval '30 days', coalesce(p_ip, ''), left(coalesce(p_ua, ''), 200));
  -- au plus dix appareils par compte, et ménage des sessions expirées
  delete from kokolio.sessions s where s.user_id = p_user and s.token_hash not in (
    select s2.token_hash from kokolio.sessions s2 where s2.user_id = p_user order by s2.last_seen desc limit 10);
  delete from kokolio.sessions s where s.expires_at < v_now - interval '1 day';
end $$;

create or replace function kokolio._me(p jsonb) returns kokolio.users language plpgsql as $$
declare me kokolio.users; s kokolio.sessions; v_now timestamptz := kokolio._now();
begin
  select * into s from kokolio.sessions x where x.token_hash = coalesce(p->>'token', '');
  if s.token_hash is null or s.expires_at <= v_now then
    perform kokolio._fail('session', 'Votre session a expiré. Reconnectez-vous.');
  end if;
  select * into me from kokolio.users u where u.id = s.user_id;
  if me.id is null or me.disabled or (me.exit_date is not null and me.exit_date < kokolio._today()) then
    perform kokolio._fail('session', 'Ce compte est désactivé.');
  end if;
  if s.last_seen < v_now - interval '10 minutes' then
    update kokolio.sessions set last_seen = v_now, expires_at = least(s.created_at + interval '90 days', v_now + interval '30 days')
    where token_hash = s.token_hash;
  end if;
  return me;
end $$;

create or replace function kokolio._is_rh(me kokolio.users) returns boolean language sql immutable as $$
  select (me).role in ('rh', 'admin')
$$;

-- Voir un salarié : soi-même, son responsable direct, les RH.
create or replace function kokolio._can_see(me kokolio.users, p_target uuid) returns boolean language sql stable as $$
  select (me).id = p_target or (me).role in ('rh', 'admin')
    or exists (select 1 from kokolio.users u where u.id = p_target and u.manager_id = (me).id)
$$;

-- Valider pour un salarié : son responsable direct ou les RH, jamais soi-même
-- (seule exception : un administrateur sans responsable, pour ne pas bloquer la clôture).
create or replace function kokolio._can_manage(me kokolio.users, p_target uuid) returns boolean language sql stable as $$
  select case
    when (me).id = p_target then (me).role = 'admin' and (me).manager_id is null
    else (me).role in ('rh', 'admin') or exists (select 1 from kokolio.users u where u.id = p_target and u.manager_id = (me).id)
  end
$$;

create or replace function kokolio._lieu_ok(p_code text) returns boolean language sql stable as $$
  select exists (
    select 1 from kokolio.meta m, jsonb_array_elements(m.value->'lieux') l
    where m.key = 'settings' and l->>'code' = p_code)
$$;

-- Liste d'heures 'HH:MM' : format, ordre, nombre.
-- Travail de nuit : heure du matin jusqu'à laquelle un départ est rattaché à la journée de la veille. Vide = fonction désactivée.
create or replace function kokolio._night() returns text language sql stable as $$
  select case when coalesce(m.value->>'night_until', '') ~ '^(0[0-9]|1[01]):[0-5][0-9]$' then m.value->>'night_until' else '' end
  from kokolio.meta m where m.key = 'settings'
$$;
-- Une heure du lendemain s'écrit au-delà de 24 h : 01:30 le lendemain = « 25:30 ».
create or replace function kokolio._plus24(p_hm text) returns text language sql immutable as $$
  select lpad((substr(p_hm, 1, 2)::int + 24)::text, 2, '0') || substr(p_hm, 3)
$$;

create or replace function kokolio._times(p_j jsonb) returns text[] language plpgsql stable as $$
declare v_out text[] := '{}'; v_t text; v_prev text := ''; v_night text := coalesce(kokolio._night(), '');
begin
  if p_j is null or jsonb_typeof(p_j) <> 'array' then
    perform kokolio._fail('heures', 'Liste d''heures invalide.');
  end if;
  for v_t in select x.v from jsonb_array_elements_text(p_j) with ordinality as x(v, o) order by x.o loop
    if v_t !~ '^([01][0-9]|2[0-9]|3[0-5]):[0-5][0-9]$' then
      perform kokolio._fail('heures', 'Heure invalide : ' || left(v_t, 10));
    end if;
    if v_t >= '24:00' and (v_night = '' or v_t > kokolio._plus24(v_night)) then
      perform kokolio._fail('heures', case when v_night = '' then 'Heure invalide : ' || left(v_t, 10)
        else 'Un départ après minuit est accepté jusqu''à ' || v_night || ' le lendemain.' end);
    end if;
    if v_t < v_prev then
      perform kokolio._fail('heures', 'Les heures doivent se suivre dans l''ordre.');
    end if;
    v_out := v_out || v_t;
    v_prev := v_t;
  end loop;
  if coalesce(array_length(v_out, 1), 0) > 20 then
    perform kokolio._fail('heures', 'Trop de pointages pour une seule journée.');
  end if;
  return v_out;
end $$;

-- Plages indicatives d'un horaire : 0 à 4 plages « début → fin » qui se suivent. Une fin au-delà de 24 h désigne le lendemain.
create or replace function kokolio._ranges(p_j jsonb) returns jsonb language plpgsql immutable as $$
declare v_r jsonb; v_a text; v_b text; v_prev text := ''; v_out jsonb := '[]'::jsonb;
begin
  if p_j is null or jsonb_typeof(p_j) = 'null' then return v_out; end if;
  if jsonb_typeof(p_j) <> 'array' or jsonb_array_length(p_j) > 4 then perform kokolio._fail('horaire', 'Plages horaires invalides (quatre au plus).'); end if;
  for v_r in select x.v from jsonb_array_elements(p_j) with ordinality as x(v, o) order by x.o loop
    if jsonb_typeof(v_r) <> 'array' or jsonb_array_length(v_r) <> 2 then perform kokolio._fail('horaire', 'Plage horaire invalide.'); end if;
    v_a := v_r->>0; v_b := v_r->>1;
    if coalesce(v_a, '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(v_b, '') !~ '^([01][0-9]|2[0-9]|3[0-5]):[0-5][0-9]$' then
      perform kokolio._fail('horaire', 'Heure de plage invalide.');
    end if;
    if v_b <= v_a or v_a < v_prev then perform kokolio._fail('horaire', 'Les plages doivent se suivre, chacune avec une fin après son début.'); end if;
    v_out := v_out || jsonb_build_array(jsonb_build_array(v_a, v_b));
    v_prev := v_b;
  end loop;
  return v_out;
end $$;

-- Limitation des tentatives par adresse : 30 échecs par tranche de 10 minutes.
create or replace function kokolio._throttled(p_ip text) returns boolean language sql stable as $$
  select coalesce(p_ip, '') <> '' and exists (
    select 1 from kokolio.throttle t
    where t.ip = p_ip and t.window_start > kokolio._now() - interval '10 minutes' and t.hits >= 30)
$$;

create or replace function kokolio._throttle_hit(p_ip text) returns void language plpgsql as $$
declare v_now timestamptz := kokolio._now();
begin
  if coalesce(p_ip, '') = '' then return; end if;
  insert into kokolio.throttle as t (ip, window_start, hits) values (p_ip, v_now, 1)
  on conflict (ip) do update set
    hits = case when t.window_start > v_now - interval '10 minutes' then t.hits + 1 else 1 end,
    window_start = case when t.window_start > v_now - interval '10 minutes' then t.window_start else v_now end;
  delete from kokolio.throttle x where x.window_start < v_now - interval '1 day';
end $$;

-- Différences entre deux versions d'une ligne, pour le journal.
create or replace function kokolio._diff(p_old jsonb, p_new jsonb, p_keys text[]) returns jsonb language sql immutable as $$
  select coalesce(jsonb_object_agg(k, jsonb_build_array(p_old->k, p_new->k)), '{}'::jsonb)
  from unnest(p_keys) k
  where (p_old->k) is distinct from (p_new->k)
$$;
