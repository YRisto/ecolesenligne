-- Kokolio — script d'installation et de mise à jour (généré par build.sh, ne pas modifier à la main).
-- Rejouable : crée ce qui manque, remplace les fonctions, ne supprime aucune donnée.
begin;
-- =====================================================================
-- Kokolio — tables
-- Tout vit dans le schéma privé « kokolio », qui n'est pas exposé par l'API.
-- Script rejouable : il ne supprime ni table ni donnée.
-- =====================================================================
create schema if not exists kokolio;
revoke all on schema kokolio from public;

create table if not exists kokolio.meta (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists kokolio.users (
  id uuid primary key default gen_random_uuid(),
  login text not null,
  role text not null default 'salarie' check (role in ('salarie', 'rh', 'admin')),
  first_name text not null default '',
  last_name text not null default '',
  matricule text not null default '',
  email text not null default '',
  team text not null default '',
  job text not null default '',
  manager_id uuid references kokolio.users(id),
  entry_date date,
  exit_date date,
  details jsonb not null default '{}'::jsonb,
  pw_salt text,
  pw_hash text,
  pw_params jsonb,
  pw_set_at timestamptz,
  act_hash text,
  act_expires timestamptz,
  failed_count int not null default 0,
  locked_until timestamptz,
  disabled boolean not null default false,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (exit_date is null or entry_date is null or exit_date >= entry_date)
);
create unique index if not exists users_login_key on kokolio.users (lower(login));
create unique index if not exists users_matricule_key on kokolio.users (matricule) where matricule <> '';
create index if not exists users_manager_idx on kokolio.users (manager_id);

-- Horaires datés : une ligne par période. Modifier un horaire crée une nouvelle ligne, le passé reste intact.
create table if not exists kokolio.contracts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references kokolio.users(id),
  start_date date not null,
  end_date date,
  regime text not null default 'horaire' check (regime in ('horaire', 'forfait_jours')),
  day_minutes int[] not null default '{420,420,420,420,420,0,0}',  -- lundi → dimanche
  work_days int[] not null default '{1,2,3,4,5}',                  -- 1 = lundi … 7 = dimanche
  pause_minutes int not null default 45,
  cp_per_month numeric(5,2) not null default 2.08,
  forfait_days int not null default 218,
  created_by uuid references kokolio.users(id),
  created_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date),
  check (array_length(day_minutes, 1) = 7),
  unique (user_id, start_date)
);

-- Une ligne par salarié et par jour : les heures retenues et leur état de validation.
create table if not exists kokolio.days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references kokolio.users(id),
  day date not null,
  times text[] not null default '{}',     -- 'HH:MM' croissants : arrivée, départ, arrivée, départ…
  lieu text not null default 'bureau',
  status text not null default 'a_valider' check (status in ('a_valider', 'valide', 'refuse')),
  corrected boolean not null default false,
  comment text not null default '',
  refusal_reason text not null default '',
  decided_by uuid references kokolio.users(id),
  decided_at timestamptz,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, day)
);
create index if not exists days_day_idx on kokolio.days (day);
create index if not exists days_pending_idx on kokolio.days (user_id) where status <> 'valide';

-- Trace brute de chaque pointage réel (heure du serveur). En ajout seul.
create table if not exists kokolio.punch_log (
  id bigserial primary key,
  user_id uuid not null references kokolio.users(id),
  ts timestamptz not null,
  day date not null,
  hhmm text not null,
  kind text not null,
  ip text not null default '',
  ua text not null default ''
);
create index if not exists punch_log_user_day_idx on kokolio.punch_log (user_id, day);

create table if not exists kokolio.absence_types (
  code text primary key,
  label text not null,
  category text not null default 'autre' check (category in ('cp', 'rtt', 'maladie', 'autre')),
  export_code text not null default '',
  needs_doc boolean not null default false,
  absenteeism boolean not null default true,
  active boolean not null default true,
  sort int not null default 100
);

create table if not exists kokolio.absences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references kokolio.users(id),
  type_code text not null references kokolio.absence_types(code),
  start_date date not null,
  end_date date not null,
  half text not null default '' check (half in ('', 'matin', 'apres_midi')),
  days_count numeric(6,1) not null,
  comment text not null default '',
  status text not null default 'en_attente' check (status in ('en_attente', 'valide', 'refuse', 'annule')),
  decided_by uuid references kokolio.users(id),
  decided_at timestamptz,
  refusal_reason text not null default '',
  created_by uuid references kokolio.users(id),
  has_doc boolean not null default false,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  check (half = '' or start_date = end_date)
);
create index if not exists absences_user_idx on kokolio.absences (user_id, start_date);
create index if not exists absences_dates_idx on kokolio.absences (start_date, end_date);
create index if not exists absences_pending_idx on kokolio.absences (user_id) where status = 'en_attente';

-- Justificatifs : stockés ici, donc hors de portée de l'API publique.
create table if not exists kokolio.attachments (
  absence_id uuid primary key references kokolio.absences(id),
  filename text not null,
  mime text not null,
  size int not null,
  data bytea not null,
  uploaded_by uuid references kokolio.users(id),
  created_at timestamptz not null default now()
);

-- Écritures de solde : reports et ajustements, jamais modifiées après coup.
create table if not exists kokolio.balance_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references kokolio.users(id),
  kind text not null check (kind in ('cp', 'rtt')),
  year int not null,
  amount numeric(7,2) not null,
  reason text not null default '',
  tag text not null default '',
  created_by uuid references kokolio.users(id),
  created_at timestamptz not null default now()
);
create index if not exists balance_user_idx on kokolio.balance_entries (user_id, year);
create unique index if not exists balance_tag_key on kokolio.balance_entries (user_id, kind, year, tag) where tag <> '';

-- Clôtures mensuelles : chaque clôture fige les chiffres et l'export paie. Une réouverture crée une nouvelle version.
create table if not exists kokolio.closures (
  id uuid primary key default gen_random_uuid(),
  month text not null check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  version int not null,
  status text not null default 'cloture' check (status in ('cloture', 'rouvert')),
  closed_by uuid references kokolio.users(id),
  closed_at timestamptz not null default now(),
  reopened_by uuid references kokolio.users(id),
  reopened_at timestamptz,
  reopen_reason text not null default '',
  snapshot jsonb not null,
  export_text text not null,
  export_sha256 text not null,
  unique (month, version)
);

create table if not exists kokolio.sessions (
  token_hash text primary key,
  user_id uuid not null references kokolio.users(id),
  created_at timestamptz not null,
  last_seen timestamptz not null,
  expires_at timestamptz not null,
  ip text not null default '',
  ua text not null default ''
);
create index if not exists sessions_user_idx on kokolio.sessions (user_id);

create table if not exists kokolio.throttle (
  ip text primary key,
  window_start timestamptz not null,
  hits int not null
);

-- Journal des actions : en ajout seul, chaque ligne est chaînée à la précédente par une empreinte.
create table if not exists kokolio.audit (
  seq bigserial primary key,
  ts timestamptz not null,
  actor uuid,
  actor_label text not null default '',
  action text not null,
  target_user uuid,
  target text not null default '',
  detail jsonb not null default '{}'::jsonb,
  ip text not null default '',
  prev_hash text not null,
  hash text not null
);
create index if not exists audit_target_idx on kokolio.audit (target_user, seq desc);
create index if not exists audit_actor_idx on kokolio.audit (actor, seq desc);

-- Défense en profondeur : même si le schéma était un jour exposé, aucune ligne ne serait lisible sans passer par les fonctions.
alter table kokolio.meta enable row level security;
alter table kokolio.users enable row level security;
alter table kokolio.contracts enable row level security;
alter table kokolio.days enable row level security;
alter table kokolio.punch_log enable row level security;
alter table kokolio.absence_types enable row level security;
alter table kokolio.absences enable row level security;
alter table kokolio.attachments enable row level security;
alter table kokolio.balance_entries enable row level security;
alter table kokolio.closures enable row level security;
alter table kokolio.sessions enable row level security;
alter table kokolio.throttle enable row level security;
alter table kokolio.audit enable row level security;

-- Valeurs de départ (jamais écrasées si elles existent déjà)
insert into kokolio.meta (key, value) values
  ('audit_head', '{"seq": 0, "hash": ""}'::jsonb),
  ('pepper', jsonb_build_object('v', encode(sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text, 'UTF8')), 'hex'))),
  ('settings', jsonb_build_object(
    'version', 1,
    'company', 'Centre Européen de Formation',
    'logo_url', 'https://www.centre-europeen-formation.fr/wp-content/uploads/2025/08/Logo_CEF.png',
    'timezone', 'Europe/Paris',
    'go_live', to_char(now() at time zone 'Europe/Paris', 'YYYY-MM-DD'),
    'lieux', jsonb_build_array(
      jsonb_build_object('code', 'bureau', 'label', 'Bureau'),
      jsonb_build_object('code', 'teletravail', 'label', 'Télétravail'),
      jsonb_build_object('code', 'deplacement', 'label', 'Déplacement')),
    'pause_threshold_min', 360,
    'max_day_min', 600,
    'max_week_min', 2880,
    'min_rest_min', 660,
    'activation_days', 14,
    'export', jsonb_build_object('hours_code', 'HS-HN', 'include_hours', true, 'sep', ';', 'decimal', ',', 'header', true)))
on conflict (key) do nothing;

insert into kokolio.absence_types (code, label, category, export_code, needs_doc, absenteeism, sort) values
  ('cp', 'Congé payé', 'cp', 'AB-CP', false, false, 10),
  ('rtt', 'RTT', 'rtt', 'AB-RTT', false, false, 20),
  ('maladie', 'Arrêt maladie', 'maladie', 'AB-MAL', true, true, 30),
  ('sans_solde', 'Congé sans solde', 'autre', 'AB-CSS', false, true, 40),
  ('evenement', 'Événement familial', 'autre', 'AB-EVF', false, true, 50),
  ('formation', 'Formation', 'autre', 'AB-FORM', false, false, 60),
  ('autre', 'Autre absence', 'autre', 'AB-ABS', false, true, 70)
on conflict (code) do nothing;
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
    'disabled', u.disabled, 'version', u.version, 'activated', u.pw_hash is not null,
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
create or replace function kokolio._times(p_j jsonb) returns text[] language plpgsql stable as $$
declare v_out text[] := '{}'; v_t text; v_prev text := '';
begin
  if p_j is null or jsonb_typeof(p_j) <> 'array' then
    perform kokolio._fail('heures', 'Liste d''heures invalide.');
  end if;
  for v_t in select x.v from jsonb_array_elements_text(p_j) with ordinality as x(v, o) order by x.o loop
    if v_t !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
      perform kokolio._fail('heures', 'Heure invalide : ' || left(v_t, 10));
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
-- =====================================================================
-- Kokolio — comptes : connexion, activation, mot de passe
-- Le mot de passe n'arrive jamais ici en clair : le serveur l'a déjà transformé (scrypt) avec le sel du compte.
-- =====================================================================

create or replace function kokolio._account_ok(u kokolio.users) returns boolean language sql stable as $$
  select (u).id is not null and not (u).disabled and ((u).exit_date is null or (u).exit_date >= kokolio._today())
$$;

-- Sel du compte. Pour un identifiant inconnu, un sel factice mais stable est renvoyé :
-- la réponse ne permet pas de savoir si le compte existe.
create or replace function kokolio._auth_salt(p_args jsonb) returns jsonb language plpgsql stable as $$
declare u kokolio.users; v_login text := lower(trim(coalesce(p_args->>'login', ''))); v_pepper text;
begin
  select * into u from kokolio.users x where lower(x.login) = v_login;
  if u.id is not null and u.pw_hash is not null then
    return jsonb_build_object('salt', u.pw_salt, 'params', u.pw_params);
  end if;
  select m.value->>'v' into v_pepper from kokolio.meta m where m.key = 'pepper';
  return jsonb_build_object(
    'salt', substr(encode(sha256(convert_to(coalesce(v_pepper, '') || '|' || v_login, 'UTF8')), 'hex'), 1, 32),
    'params', null);
end $$;

create or replace function kokolio._auth_fail(u kokolio.users, p_ip text) returns jsonb language plpgsql as $$
declare v_now timestamptz := kokolio._now();
begin
  perform kokolio._throttle_hit(p_ip);
  if u.id is null then
    return jsonb_build_object('status', 'fail');
  end if;
  if u.failed_count + 1 >= 5 then
    update kokolio.users set failed_count = 0, locked_until = v_now + interval '15 minutes' where id = u.id;
    perform kokolio._audit(null, 'compte_bloque', u.id, u.login, jsonb_build_object('motif', '5 échecs consécutifs'), p_ip);
    return jsonb_build_object('status', 'locked', 'until', v_now + interval '15 minutes');
  end if;
  update kokolio.users set failed_count = u.failed_count + 1 where id = u.id;
  return jsonb_build_object('status', 'fail');
end $$;

create or replace function kokolio._login(p jsonb, p_args jsonb) returns jsonb language plpgsql as $$
declare
  u kokolio.users; v_now timestamptz := kokolio._now(); v_ip text := coalesce(p->>'ip', '');
  v_login text := lower(trim(coalesce(p_args->>'login', '')));
begin
  if kokolio._throttled(v_ip) then
    return jsonb_build_object('status', 'throttled');
  end if;
  select * into u from kokolio.users x where lower(x.login) = v_login for update;
  if u.id is not null and u.locked_until is not null and u.locked_until > v_now then
    return jsonb_build_object('status', 'locked', 'until', u.locked_until);
  end if;
  if not coalesce(kokolio._account_ok(u) and u.pw_hash is not null and u.pw_hash = coalesce(p_args->>'pw_hash', ''), false) then
    return kokolio._auth_fail(u, v_ip);
  end if;
  update kokolio.users set failed_count = 0, locked_until = null where id = u.id;
  perform kokolio._session_new(u.id, p_args->>'new_token', v_ip, p->>'ua');
  perform kokolio._audit(u.id, 'connexion', u.id, '', '{}'::jsonb, v_ip);
  return jsonb_build_object('status', 'ok', 'user', kokolio._user_json(u, true));
end $$;

create or replace function kokolio._pw_check(p_args jsonb) returns void language plpgsql as $$
begin
  if coalesce(p_args->>'salt', '') !~ '^[0-9a-f]{32}$' or coalesce(p_args->>'pw_hash', '') !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(p_args->'params') is distinct from 'object' then
    perform kokolio._fail('requete', 'Mot de passe mal formé.');
  end if;
end $$;

-- Première connexion ou mot de passe oublié : identifiant + code d'activation + nouveau mot de passe.
create or replace function kokolio._activate(p jsonb, p_args jsonb) returns jsonb language plpgsql as $$
declare
  u kokolio.users; v_now timestamptz := kokolio._now(); v_ip text := coalesce(p->>'ip', '');
  v_login text := lower(trim(coalesce(p_args->>'login', '')));
begin
  perform kokolio._pw_check(p_args);
  if kokolio._throttled(v_ip) then
    return jsonb_build_object('status', 'throttled');
  end if;
  select * into u from kokolio.users x where lower(x.login) = v_login for update;
  if u.id is not null and u.locked_until is not null and u.locked_until > v_now then
    return jsonb_build_object('status', 'locked', 'until', u.locked_until);
  end if;
  if not coalesce(kokolio._account_ok(u) and u.act_hash is not null and u.act_expires > v_now
          and u.act_hash = coalesce(p_args->>'code_hash', ''), false) then
    return kokolio._auth_fail(u, v_ip);
  end if;
  update kokolio.users set pw_salt = p_args->>'salt', pw_hash = p_args->>'pw_hash', pw_params = p_args->'params', pw_set_at = v_now,
    act_hash = null, act_expires = null, failed_count = 0, locked_until = null, updated_at = v_now
  where id = u.id returning * into u;
  delete from kokolio.sessions s where s.user_id = u.id;
  perform kokolio._session_new(u.id, p_args->>'new_token', v_ip, p->>'ua');
  perform kokolio._audit(u.id, 'compte_active', u.id, '', '{}'::jsonb, v_ip);
  return jsonb_build_object('status', 'ok', 'user', kokolio._user_json(u, true));
end $$;

create or replace function kokolio._password_change(me kokolio.users, p jsonb, p_args jsonb) returns jsonb language plpgsql as $$
declare v_now timestamptz := kokolio._now();
begin
  perform kokolio._pw_check(p_args);
  if not coalesce(me.pw_hash = coalesce(p_args->>'old_hash', ''), false) then
    perform kokolio._fail('mot_de_passe', 'Le mot de passe actuel est incorrect.');
  end if;
  update kokolio.users set pw_salt = p_args->>'salt', pw_hash = p_args->>'pw_hash', pw_params = p_args->'params', pw_set_at = v_now, updated_at = v_now
  where id = me.id;
  delete from kokolio.sessions s where s.user_id = me.id and s.token_hash <> coalesce(p->>'token', '');
  perform kokolio._audit(me.id, 'mot_de_passe_change', me.id, '', '{}'::jsonb, coalesce(p->>'ip', ''));
  return '{}'::jsonb;
end $$;

-- Nouveau code d'activation (le code lui-même est tiré au hasard par le serveur, seule son empreinte arrive ici).
-- Salarié : ses RH ou son responsable direct. Compte RH ou administrateur : un administrateur uniquement.
create or replace function kokolio._activation_new(me kokolio.users, p jsonb, p_args jsonb) returns jsonb language plpgsql as $$
declare u kokolio.users; v_days int; v_now timestamptz := kokolio._now();
begin
  select * into u from kokolio.users x where x.id = nullif(p_args->>'user_id', '')::uuid for update;
  if u.id is null then perform kokolio._fail('introuvable', 'Salarié introuvable.'); end if;
  if u.id = me.id then perform kokolio._fail('interdit', 'Pour votre propre compte, utilisez « Changer mon mot de passe ».'); end if;
  if u.role = 'salarie' then
    if not (me.role in ('rh', 'admin') or u.manager_id = me.id) then
      perform kokolio._fail('interdit', 'Vous ne pouvez pas générer de code pour ce salarié.');
    end if;
  elsif me.role <> 'admin' then
    perform kokolio._fail('interdit', 'Seul un administrateur peut générer un code pour un compte RH ou administrateur.');
  end if;
  if coalesce(p_args->>'code_hash', '') !~ '^[0-9a-f]{64}$' then perform kokolio._fail('requete', 'Code mal formé.'); end if;
  select coalesce((m.value->>'activation_days')::int, 14) into v_days from kokolio.meta m where m.key = 'settings';
  update kokolio.users set act_hash = p_args->>'code_hash', act_expires = v_now + make_interval(days => coalesce(v_days, 14)),
    failed_count = 0, locked_until = null, updated_at = v_now where id = u.id returning * into u;
  perform kokolio._audit(me.id, 'code_activation_genere', u.id, u.login, jsonb_build_object('deja_active', u.pw_hash is not null), coalesce(p->>'ip', ''));
  return jsonb_build_object('user', kokolio._user_json(u, me.role in ('rh', 'admin')), 'expires', u.act_expires);
end $$;

create or replace function kokolio._sessions(me kokolio.users, p jsonb) returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object('current', s.token_hash = coalesce(p->>'token', ''), 'created_at', s.created_at,
    'last_seen', s.last_seen, 'ua', s.ua) order by s.last_seen desc), '[]'::jsonb)
  from kokolio.sessions s where s.user_id = (me).id and s.expires_at > kokolio._now()
$$;
-- =====================================================================
-- Kokolio — lectures par périmètre, pointage, corrections, validations, absences
-- =====================================================================

create or replace function kokolio._ctx(me kokolio.users) returns jsonb language plpgsql stable as $$
begin
  return jsonb_build_object(
    'user', kokolio._user_json(me, true),
    'contract', (select kokolio._contract_json(c) from kokolio.contracts c
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
begin
  if kokolio._month_closed(to_char(v_day, 'YYYY-MM')) then perform kokolio._fail('cloture', 'Ce mois est clôturé.'); end if;
  if v_lieu is not null and not kokolio._lieu_ok(v_lieu) then perform kokolio._fail('requete', 'Lieu inconnu.'); end if;
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
  v_n int; v_today date := kokolio._today(); v_behalf boolean;
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
  if v_n % 2 = 1 and v_day <> v_today then perform kokolio._fail('heures', 'Chaque arrivée doit avoir son départ.'); end if;
  if v_day = v_today and v_n > 0 and v_times[v_n] > kokolio._hm() then
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
-- =====================================================================
-- Kokolio — fiches salariés, horaires datés, import, soldes, clôture, journal, paramètres
-- =====================================================================

-- Pose un nouvel horaire à partir d'une date : l'horaire précédent est fermé la veille, le passé n'est pas réécrit.
create or replace function kokolio._contract_apply(p_user uuid, p_start date, p_c jsonb, p_by uuid) returns kokolio.contracts language plpgsql as $$
declare
  v_regime text := coalesce(nullif(p_c->>'regime', ''), 'horaire'); v_dm int[]; v_wd int[]; v_i int; c kokolio.contracts;
  v_pause int := coalesce((p_c->>'pause_minutes')::int, 45); v_cp numeric := coalesce((p_c->>'cp_per_month')::numeric, 2.08);
  v_fd int := coalesce((p_c->>'forfait_days')::int, 218);
begin
  if v_regime not in ('horaire', 'forfait_jours') then perform kokolio._fail('horaire', 'Régime inconnu.'); end if;
  if p_start is null then perform kokolio._fail('horaire', 'Date d''effet manquante.'); end if;
  if jsonb_typeof(p_c->'day_minutes') = 'array' and jsonb_array_length(p_c->'day_minutes') = 7 then
    select array_agg((x.v)::int order by x.o) into v_dm from jsonb_array_elements_text(p_c->'day_minutes') with ordinality as x(v, o);
  else
    v_dm := '{420,420,420,420,420,0,0}';
  end if;
  for v_i in 1..7 loop
    if v_dm[v_i] is null or v_dm[v_i] < 0 or v_dm[v_i] > 960 then perform kokolio._fail('horaire', 'Durée journalière invalide.'); end if;
  end loop;
  if v_regime = 'forfait_jours' then
    select array_agg(z.w order by z.w) into v_wd
    from (select distinct (y)::int as w from jsonb_array_elements_text(case when jsonb_typeof(p_c->'work_days') = 'array' then p_c->'work_days' else '[1,2,3,4,5]'::jsonb end) y) z;
    v_dm := '{0,0,0,0,0,0,0}';
  else
    select array_agg(g.i order by g.i) into v_wd from generate_series(1, 7) g(i) where v_dm[g.i] > 0;
  end if;
  if v_wd is null or exists (select 1 from unnest(v_wd) w where w < 1 or w > 7) then
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
  insert into kokolio.contracts (user_id, start_date, regime, day_minutes, work_days, pause_minutes, cp_per_month, forfait_days, created_by)
  values (p_user, p_start, v_regime, v_dm, v_wd, v_pause, v_cp, v_fd, p_by) returning * into c;
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
    insert into kokolio.users (login, role, first_name, last_name, matricule, email, team, job, manager_id, entry_date, exit_date, details)
    values (v_login, v_role, trim(coalesce(p_args->>'first_name', '')), trim(p_args->>'last_name'), v_mat, trim(coalesce(p_args->>'email', '')),
            trim(coalesce(p_args->>'team', '')), trim(coalesce(p_args->>'job', '')), v_mgr, v_entry, v_exit, v_details)
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
      manager_id = v_mgr, entry_date = v_entry, exit_date = v_exit, details = v_details,
      disabled = coalesce((p_args->>'disabled')::boolean, o.disabled), version = o.version + 1, updated_at = v_now
    where id = v_id returning * into u;
    if u.disabled and not o.disabled then delete from kokolio.sessions s where s.user_id = u.id; end if;
    v_diff := kokolio._diff(to_jsonb(o), to_jsonb(u), array['login', 'role', 'first_name', 'last_name', 'matricule', 'email', 'team', 'job', 'manager_id', 'entry_date', 'exit_date', 'disabled'])
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
      'pause', c.pause_minutes, 'cp_par_mois', c.cp_per_month, 'forfait_jours', c.forfait_days), coalesce(p->>'ip', ''));
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
        insert into kokolio.users (login, role, first_name, last_name, matricule, email, team, job, entry_date, exit_date, details, act_hash, act_expires)
        values (v_login, v_role, trim(coalesce(r->>'first_name', '')), trim(r->>'last_name'), trim(coalesce(r->>'matricule', '')),
                trim(coalesce(r->>'email', '')), trim(coalesce(r->>'team', '')), trim(coalesce(r->>'job', '')),
                nullif(r->>'entry_date', '')::date, nullif(r->>'exit_date', '')::date, coalesce(r->'details', '{}'::jsonb),
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
    coalesce((select string_agg(u.id::text || ':' || u.version, ',' order by u.id) from kokolio.users u), ''), 'UTF8')), 'hex') into v_s;
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
    kokolio._diff(v_old, v_new, array['company', 'logo_url', 'go_live', 'pause_threshold_min', 'max_day_min', 'max_week_min', 'min_rest_min', 'activation_days', 'lieux', 'export']),
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
  select * into o from kokolio.absence_types x where x.code = v_code;
  insert into kokolio.absence_types as x (code, label, category, export_code, needs_doc, absenteeism, active, sort)
  values (v_code, trim(v_t->>'label'), coalesce(v_t->>'category', 'autre'), trim(coalesce(v_t->>'export_code', '')),
          coalesce((v_t->>'needs_doc')::boolean, false), coalesce((v_t->>'absenteeism')::boolean, true),
          coalesce((v_t->>'active')::boolean, true), coalesce((v_t->>'sort')::int, 100))
  on conflict (code) do update set label = excluded.label, category = excluded.category, export_code = excluded.export_code,
    needs_doc = excluded.needs_doc, absenteeism = excluded.absenteeism, active = excluded.active, sort = excluded.sort
  returning * into t;
  perform kokolio._audit(me.id, case when o.code is null then 'motif_cree' else 'motif_modifie' end, null, v_code,
    kokolio._diff(coalesce(to_jsonb(o), '{}'::jsonb), to_jsonb(t), array['label', 'category', 'export_code', 'needs_doc', 'absenteeism', 'active', 'sort']), coalesce(p->>'ip', ''));
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
-- =====================================================================
-- Kokolio — mode démonstration
-- Un jeu de données fictives se charge dans un outil vide ou en cours d'essai, pour le découvrir ou le présenter.
-- Tant qu'il est là, l'outil est « en mode démonstration » : c'est le seul état où tout peut être effacé.
-- Un outil en service (un mois clôturé, ou plus de dix salariés) ne peut pas y entrer.
-- =====================================================================

-- Chargement : les lignes sont préparées par le serveur (lib/kokolio/engine/demo.mjs), cette fonction les enregistre d'un bloc.
create or replace function kokolio._demo_seed(me kokolio.users, p jsonb, p_args jsonb) returns jsonb language plpgsql as $$
declare
  r jsonb; u kokolio.users; c kokolio.contracts; v_dec uuid; v_tz text := kokolio._tz(); v_now timestamptz := kokolio._now(); v_today date := kokolio._today();
  v_days int; v_go text := coalesce(p_args->>'go_live', ''); v_ok boolean; v_status text; v_day date; v_times text[]; v_t text; v_i int;
  v_nu int := 0; v_nd int := 0; v_na int := 0;
begin
  if me.role <> 'admin' then perform kokolio._fail('interdit', 'Accès réservé aux administrateurs.'); end if;
  if exists (select 1 from kokolio.meta m where m.key = 'demo') then
    perform kokolio._fail('etat', 'Les données de démonstration sont déjà chargées. Effacez-les avant de les recharger.');
  end if;
  -- Un outil en service ne passe jamais en mode démonstration : dès qu'un mois a été clôturé, ou au-delà de dix salariés, c'est refusé.
  -- En deçà (outil vide, ou quelques comptes d'essai), le chargement est accepté et ne touche pas à l'existant.
  if exists (select 1 from kokolio.closures) then
    perform kokolio._fail('etat', 'Un mois a déjà été clôturé : cet outil est en service, les données de démonstration ne peuvent plus y être chargées.');
  end if;
  if (select count(*) from kokolio.users x where x.role <> 'admin') > 10 then
    perform kokolio._fail('etat', 'L''outil contient déjà plus de dix salariés : les données de démonstration ne se chargent que dans un outil vide ou en cours d''essai.');
  end if;
  select x.login into v_t from kokolio.users x where x.login in (select lower(y->>'login') from jsonb_array_elements(case when jsonb_typeof(p_args->'users') = 'array' then p_args->'users' else '[]'::jsonb end) y) limit 1;
  if v_t is not null then
    perform kokolio._fail('etat', 'Un compte porte déjà l''identifiant « ' || v_t || ' », utilisé par les données de démonstration.');
  end if;
  if v_go !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or v_go::date > v_today then perform kokolio._fail('requete', 'Période de démonstration invalide.'); end if;
  if jsonb_typeof(p_args->'users') is distinct from 'array' or jsonb_array_length(p_args->'users') < 1 or jsonb_array_length(p_args->'users') > 50
     or jsonb_array_length(coalesce(p_args->'days', '[]'::jsonb)) > 6000 or jsonb_array_length(coalesce(p_args->'absences', '[]'::jsonb)) > 500 then
    perform kokolio._fail('requete', 'Jeu de données invalide.');
  end if;
  select coalesce((m.value->>'activation_days')::int, 14) into v_days from kokolio.meta m where m.key = 'settings';

  -- comptes fictifs : salariés ou RH, jamais administrateurs
  for r in select x from jsonb_array_elements(p_args->'users') x loop
    v_ok := coalesce(r->>'code_hash', '') ~ '^[0-9a-f]{64}$';
    insert into kokolio.users (login, role, first_name, last_name, matricule, team, job, entry_date, details, act_hash, act_expires)
    values (lower(r->>'login'), case when r->>'role' = 'rh' then 'rh' else 'salarie' end, coalesce(r->>'first_name', ''), r->>'last_name', coalesce(r->>'matricule', ''),
            coalesce(r->>'team', ''), coalesce(r->>'job', ''), nullif(r->>'entry_date', '')::date, coalesce(r->'details', '{}'::jsonb),
            case when v_ok then r->>'code_hash' end, case when v_ok then v_now + make_interval(days => coalesce(v_days, 14)) end)
    returning * into u;
    c := kokolio._contract_apply(u.id, coalesce(u.entry_date, date '2000-01-01'), coalesce(r->'contract', '{}'::jsonb), me.id);
    v_nu := v_nu + 1;
  end loop;
  for r in select x from jsonb_array_elements(p_args->'users') x loop
    if coalesce(r->>'manager_login', '') <> '' then
      update kokolio.users set manager_id = (select x.id from kokolio.users x where x.login = lower(r->>'manager_login')) where login = lower(r->>'login');
    end if;
  end loop;

  for r in select x from jsonb_array_elements(coalesce(p_args->'entries', '[]'::jsonb)) x loop
    insert into kokolio.balance_entries (user_id, kind, year, amount, reason, tag, created_by)
    select x.id, r->>'kind', (r->>'year')::int, (r->>'amount')::numeric, left(coalesce(r->>'reason', 'Démonstration'), 200), '', me.id
    from kokolio.users x where x.login = lower(r->>'login');
  end loop;

  -- journées : validées ou refusées au nom du responsable (à défaut, de l'administrateur), avec leur trace de pointage
  for r in select x from jsonb_array_elements(coalesce(p_args->'days', '[]'::jsonb)) x loop
    select x.* into u from kokolio.users x where x.login = lower(r->>'login');
    v_day := (r->>'day')::date;
    if u.id is null or v_day >= v_today then continue; end if;
    v_status := case when r->>'status' in ('valide', 'refuse') then r->>'status' else 'a_valider' end;
    v_times := kokolio._times(r->'times');
    v_dec := case when v_status <> 'a_valider' then coalesce(u.manager_id, me.id) end;
    insert into kokolio.days (user_id, day, times, lieu, status, corrected, comment, refusal_reason, decided_by, decided_at)
    values (u.id, v_day, v_times, case when kokolio._lieu_ok(coalesce(r->>'lieu', '')) then r->>'lieu' else 'bureau' end, v_status,
            coalesce((r->>'corrected')::boolean, false), left(coalesce(r->>'comment', ''), 500), left(coalesce(r->>'refusal_reason', ''), 300),
            v_dec, case when v_dec is not null then v_now end);
    if not coalesce((r->>'corrected')::boolean, false) then
      v_i := 0;
      foreach v_t in array v_times loop
        v_i := v_i + 1;
        insert into kokolio.punch_log (user_id, ts, day, hhmm, kind)
        values (u.id, (v_day::text || ' ' || v_t)::timestamp at time zone v_tz, v_day, v_t, case when v_i % 2 = 1 then 'arrivee' else 'depart' end);
      end loop;
    end if;
    v_nd := v_nd + 1;
  end loop;

  for r in select x from jsonb_array_elements(coalesce(p_args->'absences', '[]'::jsonb)) x loop
    select x.* into u from kokolio.users x where x.login = lower(r->>'login');
    if u.id is null or not exists (select 1 from kokolio.absence_types t where t.code = r->>'type') then continue; end if;
    v_status := case when r->>'status' in ('valide', 'refuse') then r->>'status' else 'en_attente' end;
    v_dec := case when v_status <> 'en_attente' then coalesce(u.manager_id, me.id) end;
    insert into kokolio.absences (user_id, type_code, start_date, end_date, half, days_count, comment, status, decided_by, decided_at, refusal_reason, created_by)
    values (u.id, r->>'type', (r->>'start')::date, (r->>'end')::date, coalesce(r->>'half', ''), (r->>'days_count')::numeric, left(coalesce(r->>'comment', ''), 500),
            v_status, v_dec, case when v_dec is not null then v_now end, left(coalesce(r->>'refusal_reason', ''), 500),
            case when coalesce((r->>'par_rh')::boolean, false) then me.id else u.id end);
    v_na := v_na + 1;
  end loop;

  -- la mise en service recule au début de la période de démonstration, et l'outil passe en mode démonstration
  update kokolio.meta set value = jsonb_set(jsonb_set(value, '{go_live}', to_jsonb(v_go)), '{version}', to_jsonb(coalesce((value->>'version')::int, 1) + 1)), updated_at = now()
  where key = 'settings';
  insert into kokolio.meta (key, value) values ('demo', jsonb_build_object('charge_le', v_now, 'par', me.id));
  perform kokolio._audit(me.id, 'donnees_demo_chargees', null, '', jsonb_build_object('comptes', v_nu, 'journees', v_nd, 'absences', v_na), coalesce(p->>'ip', ''));
  return jsonb_build_object('users', v_nu, 'days', v_nd, 'absences', v_na);
end $$;

-- Effacement : tout repart de zéro, sauf les comptes administrateur, les réglages et les motifs d'absence.
-- N'existe qu'en mode démonstration : un outil qui n'a jamais chargé ces données ne peut pas être vidé par ce chemin.
create or replace function kokolio._demo_reset(me kokolio.users, p jsonb) returns jsonb language plpgsql as $$
declare v_users int; v_days int;
begin
  if me.role <> 'admin' then perform kokolio._fail('interdit', 'Accès réservé aux administrateurs.'); end if;
  if not exists (select 1 from kokolio.meta m where m.key = 'demo') then
    perform kokolio._fail('etat', 'Cet outil n''est pas en mode démonstration : rien ne peut y être effacé.');
  end if;
  select count(*) into v_users from kokolio.users x where x.role <> 'admin';
  select count(*) into v_days from kokolio.days;
  perform set_config('kokolio.purge', '1', true);
  delete from kokolio.closures;        -- d'abord les clôtures : plus aucun mois n'est verrouillé
  delete from kokolio.attachments;
  delete from kokolio.absences;
  delete from kokolio.days;
  delete from kokolio.punch_log;
  delete from kokolio.balance_entries;
  delete from kokolio.sessions s where s.user_id in (select x.id from kokolio.users x where x.role <> 'admin');
  delete from kokolio.contracts c where c.user_id in (select x.id from kokolio.users x where x.role <> 'admin');
  update kokolio.users set manager_id = null where manager_id is not null;
  delete from kokolio.audit;           -- le journal repart d'une chaîne neuve
  delete from kokolio.throttle;
  delete from kokolio.users x where x.role <> 'admin';
  perform set_config('kokolio.purge', '', true);
  update kokolio.meta set value = jsonb_build_object('seq', 0, 'hash', ''), updated_at = now() where key = 'audit_head';
  update kokolio.meta set value = jsonb_set(jsonb_set(value, '{go_live}', to_jsonb(kokolio._today()::text)), '{version}', to_jsonb(coalesce((value->>'version')::int, 1) + 1)), updated_at = now()
  where key = 'settings';
  delete from kokolio.meta where key = 'demo';
  perform kokolio._audit(me.id, 'donnees_demo_effacees', null, '', jsonb_build_object('comptes', v_users, 'journees', v_days), coalesce(p->>'ip', ''));
  return jsonb_build_object('users', v_users, 'days', v_days);
end $$;
-- =====================================================================
-- Kokolio — autodiagnostic
-- Rejoue un scénario complet (comptes, droits, pointage, validation, clôture, journal) sur des comptes fictifs,
-- dans une transaction annulée à la fin : aucune trace ne reste en base.
-- =====================================================================
create or replace function kokolio.selftest() returns jsonb language plpgsql as $$
declare
  v_checks jsonb := '[]'::jsonb; v_r jsonb; v_tag text := 'kktest_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  v_rh uuid; v_mgr uuid; v_e1 uuid; v_e2 uuid; v_seq0 bigint; v_fp text; v_ok boolean; v_day uuid; v_abs uuid; c kokolio.contracts;
  t_rh text; t_mgr text; t_e1 text; t_e2 text; v_t0 timestamptz := '2001-02-15T09:00:00+01:00'; v_adm uuid; t_adm text;
begin
  begin
    insert into kokolio.meta (key, value) values ('test_mode', 'true'::jsonb) on conflict (key) do update set value = 'true'::jsonb;
    perform set_config('kokolio.test_now', v_t0::text, true);
    select coalesce((m.value->>'seq')::bigint, 0) into v_seq0 from kokolio.meta m where m.key = 'audit_head';

    insert into kokolio.users (login, role, last_name) values (v_tag || '_rh', 'rh', 'Test RH') returning id into v_rh;
    insert into kokolio.users (login, last_name) values (v_tag || '_mgr', 'Test Manager') returning id into v_mgr;
    insert into kokolio.users (login, last_name, manager_id, pw_salt, pw_hash, pw_params)
      values (v_tag || '_e1', 'Test Un', v_mgr, repeat('a', 32), repeat('b', 64), '{"N": 1}'::jsonb) returning id into v_e1;
    insert into kokolio.users (login, last_name) values (v_tag || '_e2', 'Test Deux') returning id into v_e2;
    c := kokolio._contract_apply(v_rh, date '2000-01-01', '{}'::jsonb, null);
    c := kokolio._contract_apply(v_mgr, date '2000-01-01', '{}'::jsonb, null);
    c := kokolio._contract_apply(v_e1, date '2000-01-01', '{}'::jsonb, null);
    c := kokolio._contract_apply(v_e2, date '2000-01-01', '{}'::jsonb, null);
    t_rh := encode(sha256(convert_to(v_tag || 'rh', 'UTF8')), 'hex'); t_mgr := encode(sha256(convert_to(v_tag || 'mgr', 'UTF8')), 'hex');
    t_e1 := encode(sha256(convert_to(v_tag || 'e1', 'UTF8')), 'hex'); t_e2 := encode(sha256(convert_to(v_tag || 'e2', 'UTF8')), 'hex');
    insert into kokolio.sessions (token_hash, user_id, created_at, last_seen, expires_at) values
      (t_rh, v_rh, v_t0, v_t0, v_t0 + interval '1 day'), (t_mgr, v_mgr, v_t0, v_t0, v_t0 + interval '1 day'), (t_e2, v_e2, v_t0, v_t0, v_t0 + interval '1 day');

    -- 1. Comptes
    v_r := public.kokolio_api(jsonb_build_object('action', 'login', 'args', jsonb_build_object('login', v_tag || '_e1', 'pw_hash', repeat('c', 64), 'new_token', t_e1)));
    v_checks := v_checks || jsonb_build_object('name', 'Mot de passe erroné refusé', 'ok', v_r #>> '{data,status}' = 'fail');
    v_r := public.kokolio_api(jsonb_build_object('action', 'login', 'args', jsonb_build_object('login', v_tag || '_e1', 'pw_hash', repeat('b', 64), 'new_token', t_e1)));
    v_checks := v_checks || jsonb_build_object('name', 'Connexion acceptée avec le bon mot de passe', 'ok', v_r #>> '{data,status}' = 'ok');
    v_r := public.kokolio_api(jsonb_build_object('action', 'ctx', 'token', repeat('0', 64)));
    v_checks := v_checks || jsonb_build_object('name', 'Appel sans session valide refusé', 'ok', v_r->>'code' = 'session');
    update kokolio.users set act_hash = repeat('d', 64), act_expires = v_t0 + interval '1 day' where id = v_e2;
    v_r := public.kokolio_api(jsonb_build_object('action', 'activate', 'args', jsonb_build_object('login', v_tag || '_e2', 'code_hash', repeat('e', 64),
      'salt', repeat('a', 32), 'pw_hash', repeat('f', 64), 'params', '{"N": 1}'::jsonb, 'new_token', t_e2)));
    v_checks := v_checks || jsonb_build_object('name', 'Code d''activation erroné refusé', 'ok', v_r #>> '{data,status}' = 'fail');
    v_r := public.kokolio_api(jsonb_build_object('action', 'activate', 'args', jsonb_build_object('login', v_tag || '_e2', 'code_hash', repeat('d', 64),
      'salt', repeat('a', 32), 'pw_hash', repeat('f', 64), 'params', '{"N": 1}'::jsonb, 'new_token', t_e2)));
    v_checks := v_checks || jsonb_build_object('name', 'Activation par code acceptée', 'ok', v_r #>> '{data,status}' = 'ok');

    -- 2. Pointage : heure du serveur, double appui ignoré
    v_r := public.kokolio_api(jsonb_build_object('action', 'punch', 'token', t_e1, 'args', '{}'::jsonb));
    v_checks := v_checks || jsonb_build_object('name', 'Pointage d''arrivée à l''heure du serveur', 'ok', v_r #>> '{data,kind}' = 'arrivee' and v_r #>> '{data,hm}' = '09:00');
    v_r := public.kokolio_api(jsonb_build_object('action', 'punch', 'token', t_e1, 'args', '{}'::jsonb));
    v_checks := v_checks || jsonb_build_object('name', 'Double appui ignoré', 'ok', coalesce((v_r #>> '{data,duplicate}')::boolean, false));
    perform set_config('kokolio.test_now', (v_t0 + interval '3 hours')::text, true);
    v_r := public.kokolio_api(jsonb_build_object('action', 'punch', 'token', t_e1, 'args', '{}'::jsonb));
    v_checks := v_checks || jsonb_build_object('name', 'Pointage de départ', 'ok', v_r #>> '{data,kind}' = 'depart' and jsonb_array_length(v_r #> '{data,day,times}') = 2);

    -- 3. Droits de lecture
    v_r := public.kokolio_api(jsonb_build_object('action', 'read', 'token', t_e2, 'args', jsonb_build_object('scope', 'users', 'user_ids', jsonb_build_array(v_e1), 'from', '2001-01-01', 'to', '2001-02-28')));
    v_checks := v_checks || jsonb_build_object('name', 'Un salarié ne lit pas les données d''un collègue', 'ok', v_r->>'code' = 'interdit');
    v_r := public.kokolio_api(jsonb_build_object('action', 'read', 'token', t_e2, 'args', jsonb_build_object('scope', 'all', 'from', '2001-01-01', 'to', '2001-02-28')));
    v_checks := v_checks || jsonb_build_object('name', 'Un salarié ne lit pas l''ensemble des salariés', 'ok', v_r->>'code' = 'interdit');
    v_r := public.kokolio_api(jsonb_build_object('action', 'read', 'token', t_mgr, 'args', jsonb_build_object('scope', 'users', 'user_ids', jsonb_build_array(v_e1), 'from', '2001-01-01', 'to', '2001-02-28')));
    v_checks := v_checks || jsonb_build_object('name', 'Le responsable lit son équipe, sans les données personnelles de la fiche',
      'ok', coalesce((v_r->>'ok')::boolean, false) and not ((v_r #> '{data,users,0}') ? 'details') and jsonb_array_length(v_r #> '{data,days}') = 1);
    v_r := public.kokolio_api(jsonb_build_object('action', 'user_save', 'token', t_mgr, 'args', jsonb_build_object('login', v_tag || '_x', 'last_name', 'X')));
    v_checks := v_checks || jsonb_build_object('name', 'Un responsable ne crée pas de fiche', 'ok', v_r->>'code' = 'interdit');
    v_r := public.kokolio_api(jsonb_build_object('action', 'user_save', 'token', t_rh, 'args', jsonb_build_object('id', v_e1, 'login', v_tag || '_e1', 'last_name', 'Test Un', 'role', 'admin')));
    v_checks := v_checks || jsonb_build_object('name', 'Les RH ne peuvent pas attribuer le rôle administrateur', 'ok', v_r->>'code' = 'interdit');

    -- 4. Correction et validation
    v_r := public.kokolio_api(jsonb_build_object('action', 'day_set', 'token', t_e1, 'args', jsonb_build_object('day', '2001-01-10', 'times', jsonb_build_array('09:00', '17:00'), 'comment', 'Journée oubliée')));
    v_day := (v_r #>> '{data,day,id}')::uuid;
    v_checks := v_checks || jsonb_build_object('name', 'Correction d''une journée avec motif', 'ok', v_day is not null and v_r #>> '{data,day,status}' = 'a_valider');
    v_r := public.kokolio_api(jsonb_build_object('action', 'day_set', 'token', t_e1, 'args', jsonb_build_object('day', '2001-01-11', 'times', jsonb_build_array('09:00', '08:00'), 'comment', 'Erreur')));
    v_checks := v_checks || jsonb_build_object('name', 'Heures dans le désordre refusées', 'ok', v_r->>'code' = 'heures');
    v_r := public.kokolio_api(jsonb_build_object('action', 'days_decide', 'token', t_e1, 'args', jsonb_build_object('decision', 'valide', 'items', jsonb_build_array(jsonb_build_object('id', v_day)))));
    v_checks := v_checks || jsonb_build_object('name', 'Nul ne valide ses propres pointages', 'ok', v_r #>> '{data,failed,0,code}' = 'interdit');
    v_r := public.kokolio_api(jsonb_build_object('action', 'days_decide', 'token', t_e2, 'args', jsonb_build_object('decision', 'valide', 'items', jsonb_build_array(jsonb_build_object('id', v_day)))));
    v_checks := v_checks || jsonb_build_object('name', 'Un collègue ne valide pas pour un autre', 'ok', v_r #>> '{data,failed,0,code}' = 'interdit');
    v_r := public.kokolio_api(jsonb_build_object('action', 'days_decide', 'token', t_mgr, 'args', jsonb_build_object('decision', 'valide', 'items', jsonb_build_array(jsonb_build_object('id', v_day)))));
    v_checks := v_checks || jsonb_build_object('name', 'Le responsable valide', 'ok', jsonb_array_length(v_r #> '{data,done}') = 1);
    v_r := public.kokolio_api(jsonb_build_object('action', 'day_set', 'token', t_e1, 'args', jsonb_build_object('day', '2001-01-10', 'times', jsonb_build_array('09:00', '18:00'), 'comment', 'Après validation')));
    v_checks := v_checks || jsonb_build_object('name', 'Une journée validée n''est plus modifiable par le salarié', 'ok', v_r->>'code' = 'verrou');

    -- 5. Absences
    v_r := public.kokolio_api(jsonb_build_object('action', 'absence_create', 'token', t_e1, 'args', jsonb_build_object('type', 'cp', 'start', '2001-01-22', 'end', '2001-01-23', 'days_count', 2)));
    v_abs := (v_r #>> '{data,absence,id}')::uuid;
    v_checks := v_checks || jsonb_build_object('name', 'Demande de congé enregistrée en attente', 'ok', v_r #>> '{data,absence,status}' = 'en_attente');
    v_r := public.kokolio_api(jsonb_build_object('action', 'absence_create', 'token', t_e1, 'args', jsonb_build_object('type', 'rtt', 'start', '2001-01-23', 'end', '2001-01-24', 'days_count', 2)));
    v_checks := v_checks || jsonb_build_object('name', 'Chevauchement d''absences refusé', 'ok', v_r->>'code' = 'conflit');
    v_r := public.kokolio_api(jsonb_build_object('action', 'absence_decide', 'token', t_e2, 'args', jsonb_build_object('id', v_abs, 'decision', 'valide')));
    v_checks := v_checks || jsonb_build_object('name', 'Un collègue ne valide pas un congé', 'ok', v_r->>'code' = 'interdit');
    v_r := public.kokolio_api(jsonb_build_object('action', 'month_check', 'token', t_rh, 'args', jsonb_build_object('month', '2001-01')));
    v_fp := kokolio._month_fingerprint('2001-01');
    v_checks := v_checks || jsonb_build_object('name', 'Clôture bloquée tant qu''une demande est en attente', 'ok', (v_r #>> '{data,pending_absences}')::int = 1
      and (public.kokolio_api(jsonb_build_object('action', 'month_close', 'token', t_rh, 'args', jsonb_build_object('month', '2001-01', 'fingerprint', v_fp,
            'snapshot', '{}'::jsonb, 'export_text', 'x', 'export_sha256', repeat('0', 64)))))->>'code' = 'bloque');
    v_r := public.kokolio_api(jsonb_build_object('action', 'absence_decide', 'token', t_mgr, 'args', jsonb_build_object('id', v_abs, 'decision', 'valide')));
    v_checks := v_checks || jsonb_build_object('name', 'Le responsable valide le congé', 'ok', v_r #>> '{data,absence,status}' = 'valide');

    -- 6. Clôture
    v_r := public.kokolio_api(jsonb_build_object('action', 'month_close', 'token', t_e2, 'args', jsonb_build_object('month', '2001-01')));
    v_checks := v_checks || jsonb_build_object('name', 'Seuls les RH clôturent', 'ok', v_r->>'code' = 'interdit');
    v_r := public.kokolio_api(jsonb_build_object('action', 'month_close', 'token', t_rh, 'args', jsonb_build_object('month', '2001-01', 'fingerprint', repeat('0', 64),
      'snapshot', '{}'::jsonb, 'export_text', 'x', 'export_sha256', repeat('0', 64))));
    v_checks := v_checks || jsonb_build_object('name', 'Clôture refusée si les données ont changé depuis le calcul', 'ok', v_r->>'code' = 'conflit');
    v_fp := kokolio._month_fingerprint('2001-01');
    v_r := public.kokolio_api(jsonb_build_object('action', 'month_close', 'token', t_rh, 'args', jsonb_build_object('month', '2001-01', 'fingerprint', v_fp,
      'snapshot', '{"totals": {}}'::jsonb, 'export_text', 'x', 'export_sha256', repeat('0', 64))));
    v_checks := v_checks || jsonb_build_object('name', 'Clôture du mois', 'ok', (v_r #>> '{data,version}')::int = 1);
    v_r := public.kokolio_api(jsonb_build_object('action', 'day_set', 'token', t_e1, 'args', jsonb_build_object('day', '2001-01-11', 'times', jsonb_build_array('09:00', '17:00'), 'comment', 'Après clôture')));
    v_checks := v_checks || jsonb_build_object('name', 'Mois clôturé : plus de saisie par l''outil', 'ok', v_r->>'code' = 'cloture');
    v_ok := false;
    begin
      update kokolio.days set comment = 'modification directe' where id = v_day;
    exception when others then
      v_ok := sqlerrm like 'KK:cloture:%';
    end;
    v_checks := v_checks || jsonb_build_object('name', 'Mois clôturé : modification directe en base refusée', 'ok', v_ok);
    v_ok := false;
    begin
      update kokolio.absences set days_count = 9 where id = v_abs;
    exception when others then
      v_ok := sqlerrm like 'KK:cloture:%';
    end;
    v_checks := v_checks || jsonb_build_object('name', 'Mois clôturé : absence figée', 'ok', v_ok);
    v_r := public.kokolio_api(jsonb_build_object('action', 'month_reopen', 'token', t_rh, 'args', jsonb_build_object('month', '2001-01', 'reason', 'Autodiagnostic')));
    v_checks := v_checks || jsonb_build_object('name', 'Réouverture motivée par les RH', 'ok', coalesce((v_r->>'ok')::boolean, false) and not kokolio._month_closed('2001-01'));

    -- 7. Journal
    v_ok := false;
    begin
      update kokolio.audit set action = 'falsifie' where seq = (select max(a.seq) from kokolio.audit a);
    exception when others then
      v_ok := sqlerrm like 'KK:journal:%';
    end;
    v_checks := v_checks || jsonb_build_object('name', 'Journal : modification refusée', 'ok', v_ok);
    v_ok := false;
    begin
      delete from kokolio.audit where seq = (select max(a.seq) from kokolio.audit a);
    exception when others then
      v_ok := sqlerrm like 'KK:journal:%';
    end;
    v_checks := v_checks || jsonb_build_object('name', 'Journal : suppression refusée', 'ok', v_ok);
    v_r := public.kokolio_api(jsonb_build_object('action', 'journal_verify', 'token', t_rh, 'args', jsonb_build_object('after', v_seq0, 'limit', 5000)));
    v_checks := v_checks || jsonb_build_object('name', 'Journal : chaîne d''empreintes intacte', 'ok', coalesce((v_r #>> '{data,ok}')::boolean, false) and (v_r #>> '{data,checked}')::int > 5);

    -- 8. Cloisonnement de la base
    v_checks := v_checks || jsonb_build_object('name', 'La porte d''entrée est fermée au rôle public de l''API',
      'ok', not exists (select 1 from pg_roles r where r.rolname in ('anon', 'authenticated') and has_function_privilege(r.rolname, 'public.kokolio_api(jsonb)', 'execute')));
    v_checks := v_checks || jsonb_build_object('name', 'Le schéma de données est inaccessible aux rôles de l''API',
      'ok', not exists (select 1 from pg_roles r where r.rolname in ('anon', 'authenticated', 'service_role') and has_schema_privilege(r.rolname, 'kokolio', 'usage')));

    -- 9. Mode démonstration : l'effacement des données n'existe que là
    if exists (select 1 from kokolio.meta m where m.key = 'demo') then
      v_checks := v_checks || jsonb_build_object('name', 'Effacement des données réservé au mode démonstration (actif ici : contrôle sans objet)', 'ok', true);
    else
      insert into kokolio.users (login, role, last_name) values (v_tag || '_adm', 'admin', 'Test Admin') returning id into v_adm;
      t_adm := encode(sha256(convert_to(v_tag || 'adm', 'UTF8')), 'hex');
      insert into kokolio.sessions (token_hash, user_id, created_at, last_seen, expires_at) values (t_adm, v_adm, v_t0, v_t0, v_t0 + interval '1 day');
      v_r := public.kokolio_api(jsonb_build_object('action', 'demo_reset', 'token', t_adm, 'args', '{}'::jsonb));
      v_checks := v_checks || jsonb_build_object('name', 'Effacement des données impossible hors mode démonstration', 'ok', v_r->>'code' = 'etat');
    end if;

    raise exception 'KKTEST:%', v_checks::text;
  exception when others then
    if sqlerrm like 'KKTEST:%' then
      v_checks := substr(sqlerrm, 8)::jsonb;
      return jsonb_build_object(
        'ok', not exists (select 1 from jsonb_array_elements(v_checks) x where not coalesce((x->>'ok')::boolean, false)),
        'checks', v_checks, 'count', jsonb_array_length(v_checks));
    end if;
    return jsonb_build_object('ok', false, 'error', sqlerrm, 'state', sqlstate, 'checks', '[]'::jsonb);
  end;
end $$;
-- =====================================================================
-- Kokolio — porte d'entrée unique, droits d'exécution, compte administrateur de départ
-- =====================================================================

create or replace function kokolio._dispatch(p jsonb) returns jsonb language plpgsql as $$
declare v_action text := coalesce(p->>'action', ''); v_args jsonb := coalesce(p->'args', '{}'::jsonb); me kokolio.users;
begin
  -- horloge de test : ignorée en production (la ligne « test_mode » n'y existe pas)
  if p ? '_now' and exists (select 1 from kokolio.meta m where m.key = 'test_mode' and m.value = 'true'::jsonb) then
    perform set_config('kokolio.test_now', p->>'_now', true);
  end if;

  -- sans session
  case v_action
    when 'ping' then
      return jsonb_build_object(
        'schema', (select m.value from kokolio.meta m where m.key = 'schema_version'),
        'company', (select m.value->>'company' from kokolio.meta m where m.key = 'settings'),
        'logo_url', (select m.value->>'logo_url' from kokolio.meta m where m.key = 'settings'),
        'demo', exists (select 1 from kokolio.meta m where m.key = 'demo'),
        'today', kokolio._today());
    when 'auth_salt' then return kokolio._auth_salt(v_args);
    when 'login' then return kokolio._login(p, v_args);
    when 'activate' then return kokolio._activate(p, v_args);
    when 'logout' then
      delete from kokolio.sessions s where s.token_hash = coalesce(p->>'token', '');
      return '{}'::jsonb;
    else null;
  end case;

  -- avec session : le compte est vérifié à chaque appel
  me := kokolio._me(p);
  case v_action
    when 'ctx' then return kokolio._ctx(me);
    when 'read' then return kokolio._read(me, v_args);
    when 'pending' then return kokolio._pending(me, v_args);
    when 'punch' then return kokolio._punch(me, p, v_args);
    when 'day_lieu' then return kokolio._day_lieu(me, v_args);
    when 'day_set' then return kokolio._day_set(me, p, v_args);
    when 'days_decide' then return kokolio._days_decide(me, p, v_args);
    when 'punch_log' then return kokolio._punch_log(me, v_args);
    when 'absence_create' then return kokolio._absence_create(me, p, v_args);
    when 'absence_cancel' then return kokolio._absence_cancel(me, p, v_args);
    when 'absence_decide' then return kokolio._absence_decide(me, p, v_args);
    when 'absence_attach' then return kokolio._absence_attach(me, p, v_args);
    when 'doc_get' then return kokolio._doc_get(me, p, v_args);
    when 'user_get' then return kokolio._user_get(me, v_args);
    when 'user_save' then return kokolio._user_save(me, p, v_args);
    when 'contract_set' then return kokolio._contract_set(me, p, v_args);
    when 'users_import' then return kokolio._users_import(me, p, v_args);
    when 'activation_new' then return kokolio._activation_new(me, p, v_args);
    when 'balance_add' then return kokolio._balance_add(me, p, v_args);
    when 'balance_bulk' then return kokolio._balance_bulk(me, p, v_args);
    when 'month_check' then return kokolio._month_check(me, v_args);
    when 'month_close' then return kokolio._month_close(me, p, v_args);
    when 'month_reopen' then return kokolio._month_reopen(me, p, v_args);
    when 'closures' then return kokolio._closures(me);
    when 'closure_get' then return kokolio._closure_get(me, p, v_args);
    when 'journal' then return kokolio._journal(me, v_args);
    when 'journal_verify' then return kokolio._journal_verify(me, v_args);
    when 'settings_set' then return kokolio._settings_set(me, p, v_args);
    when 'type_save' then return kokolio._type_save(me, p, v_args);
    when 'status' then return kokolio._status(me);
    when 'password_change' then return kokolio._password_change(me, p, v_args);
    when 'sessions' then return kokolio._sessions(me, p);
    when 'sessions_revoke' then
      delete from kokolio.sessions s where s.user_id = me.id and s.token_hash <> coalesce(p->>'token', '');
      return '{}'::jsonb;
    when 'demo_seed' then return kokolio._demo_seed(me, p, v_args);
    when 'demo_reset' then return kokolio._demo_reset(me, p);
    when 'selftest' then
      if me.role <> 'admin' then perform kokolio._fail('interdit', 'Accès réservé aux administrateurs.'); end if;
      return kokolio.selftest();
    else null;
  end case;
  perform kokolio._fail('requete', 'Action inconnue.');
  return null;
end $$;

-- Seule fonction visible de l'API. Elle s'exécute avec les droits du propriétaire des tables,
-- mais n'est appelable que par le rôle serveur, et ne fait rien sans session valide.
create or replace function public.kokolio_api(p jsonb) returns jsonb
language plpgsql security definer set search_path = kokolio, pg_temp as $$
declare v_code text;
begin
  begin
    return jsonb_build_object('ok', true, 'data', kokolio._dispatch(coalesce(p, '{}'::jsonb)));
  exception when others then
    if sqlerrm like 'KK:%' then
      v_code := split_part(sqlerrm, ':', 2);
      return jsonb_build_object('ok', false, 'code', v_code, 'message', substr(sqlerrm, 5 + length(v_code)));
    end if;
    return jsonb_build_object('ok', false, 'code', 'interne', 'message', 'Erreur interne.', 'debug', sqlstate || ' ' || sqlerrm);
  end;
end $$;

-- Droits : personne d'autre que le rôle serveur ne peut appeler la porte d'entrée ; personne n'accède au schéma.
revoke all on function public.kokolio_api(jsonb) from public;
revoke all on all functions in schema kokolio from public;
alter default privileges in schema kokolio revoke execute on functions from public;
do $$
declare v_role text;
begin
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles r where r.rolname = v_role) then
      execute format('revoke all on function public.kokolio_api(jsonb) from %I', v_role);
      execute format('revoke all on schema kokolio from %I', v_role);
      execute format('revoke all on all tables in schema kokolio from %I', v_role);
      execute format('revoke all on all sequences in schema kokolio from %I', v_role);
      execute format('revoke all on all functions in schema kokolio from %I', v_role);
    end if;
  end loop;
  if exists (select 1 from pg_roles r where r.rolname = 'service_role') then
    execute 'grant execute on function public.kokolio_api(jsonb) to service_role';
  end if;
end $$;

-- Compte administrateur de départ : à lancer une fois depuis la console SQL. Renvoie un code d'activation à usage unique.
-- Relancée sur un compte administrateur existant, elle génère un nouveau code (dépannage).
create or replace function kokolio.bootstrap_admin(p_login text default 'admin', p_last_name text default 'Administrateur') returns text language plpgsql as $$
declare
  u kokolio.users; v_login text := lower(trim(p_login)); v_raw bytea; v_alpha text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text := ''; v_i int; v_days int;
begin
  if v_login !~ '^[a-z0-9][a-z0-9._@-]{2,63}$' then raise exception 'Identifiant invalide.'; end if;
  v_raw := sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text || clock_timestamp()::text, 'UTF8'));
  for v_i in 0..11 loop
    v_code := v_code || substr(v_alpha, (get_byte(v_raw, v_i) % 32) + 1, 1);
  end loop;
  select * into u from kokolio.users x where lower(x.login) = v_login for update;
  if u.id is null then
    -- compte technique : aucun horaire, donc rien n'est attendu de lui au pointage (les RH peuvent lui en donner un sur sa fiche)
    insert into kokolio.users (login, role, last_name) values (v_login, 'admin', p_last_name) returning * into u;
  elsif u.role <> 'admin' then
    raise exception 'Le compte % existe déjà et n''est pas administrateur.', v_login;
  end if;
  select coalesce((m.value->>'activation_days')::int, 14) into v_days from kokolio.meta m where m.key = 'settings';
  update kokolio.users set act_hash = encode(sha256(convert_to(v_code, 'UTF8')), 'hex'),
    act_expires = now() + make_interval(days => coalesce(v_days, 14)), failed_count = 0, locked_until = null, disabled = false
  where id = u.id;
  perform kokolio._audit(null, 'administrateur_initialise', u.id, v_login, '{}'::jsonb, '');
  return substr(v_code, 1, 4) || '-' || substr(v_code, 5, 4) || '-' || substr(v_code, 9, 4);
end $$;
revoke all on function kokolio.bootstrap_admin(text, text) from public;

insert into kokolio.meta (key, value) values ('schema_version', '2'::jsonb)
on conflict (key) do update set value = excluded.value, updated_at = now();

notify pgrst, 'reload schema';
commit;
