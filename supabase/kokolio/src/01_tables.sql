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
-- Début de suivi propre au compte (schéma 3). Vide pour tout le monde : le suivi commence à la mise en service de l'outil.
-- Seul le chargement des données de démonstration le renseigne, sur les comptes qui existaient déjà, pour que l'historique fictif ne les concerne pas.
alter table kokolio.users add column if not exists tracked_from date;

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
