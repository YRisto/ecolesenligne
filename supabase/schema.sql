-- Schéma ecolesenligne.fr (PostgreSQL / Supabase)
create extension if not exists "pgcrypto";

create table if not exists ecoles (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  nom text not null,
  groupe text,
  site_web text,
  description text,
  logo_url text,
  email_leads text,            -- destinataire des demandes
  actif boolean default true,
  created_at timestamptz default now()
);

create table if not exists formations (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  ecole_id uuid references ecoles(id) on delete cascade,
  intitule text not null,
  domaine text not null,       -- Commerce & Marketing, Animaux, ...
  type text not null,          -- BTS, Bachelor, Titre professionnel, CAP, Certification, VAE
  niveau text,                 -- Bac+2, Bac+3, Niveau 3/4/5...
  rncp text,
  duree text,
  prix_eur numeric,
  prix_texte text,             -- "sur devis", "à partir de"
  cpf boolean,
  alternance boolean default false,
  description text,
  url_ecole text,
  actif boolean default true,
  created_at timestamptz default now()
);

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  prenom text not null,
  nom text not null,
  email text not null,
  telephone text not null,
  code_postal text,
  situation text,              -- lycéen, étudiant, salarié, demandeur d'emploi...
  formation_id uuid references formations(id),
  ecole_preferee_id uuid references ecoles(id),
  domaine text,
  message text,
  consent_ecole_preferee boolean not null default true,
  consent_autres_ecoles boolean not null default false,  -- partage à d'autres écoles
  consent_cgu boolean not null default false,
  ip inet,
  user_agent text,
  source text,                 -- page d'origine
  statut text default 'nouveau',   -- nouveau, transmis, invalide
  transmis_a uuid[]            -- ids des écoles destinataires
);

create index if not exists leads_created_idx on leads(created_at desc);
create index if not exists formations_domaine_idx on formations(domaine);

-- RLS : lecture publique du catalogue, écriture des leads uniquement via la clé service (API serveur)
alter table ecoles enable row level security;
alter table formations enable row level security;
alter table leads enable row level security;
create policy "catalogue public" on ecoles for select using (actif);
create policy "formations publiques" on formations for select using (actif);

-- Table d'entrée brute alimentée par l'API du site (slugs plutôt que uuid, pour rester simple au lancement)
create table if not exists leads_inbox (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  prenom text, nom text, email text, telephone text, code_postal text, situation text,
  formation_slug text, formation_intitule text, ecole_preferee_slug text, domaine text, message text,
  consent_ecole_preferee boolean, consent_autres_ecoles boolean, consent_cgu boolean,
  ip text, user_agent text, source text,
  statut text default 'nouveau', transmis_a text[]
);
alter table leads_inbox enable row level security;  -- aucune policy : accessible uniquement avec la clé service (API serveur)

-- ---------------------------------------------------------------
-- La Bataille du DG : hall of fame (scores par saison et par partie)
-- ---------------------------------------------------------------
create table if not exists jeu_dg_scores (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  partie_id uuid not null,
  type text not null check (type in ('saison','partie')),
  dg text not null,
  profil text,
  saison int,                 -- 1..6 (null pour une partie)
  annee int,                  -- exercice (2026..2031)
  resultat_pct numeric(6,2) not null,
  capital int,
  etudiants int,
  tresorerie_k int,
  mesures int,
  statut text,                -- partie : 'objectif', 'equilibre', 'manque', 'perdu'
  unique (partie_id, type, saison)
);
create index if not exists jeu_dg_scores_type_idx on jeu_dg_scores (type, annee, resultat_pct desc);
alter table jeu_dg_scores enable row level security;  -- accès uniquement via la clé service (route /api/jeudg)
-- Droits pour la clé service (le projet n'accorde pas de privilèges par défaut sur les nouvelles tables)
grant select, insert, update on public.jeu_dg_scores to service_role;
grant usage, select on sequence public.jeu_dg_scores_id_seq to service_role;
notify pgrst, 'reload schema';
