#!/bin/bash
# Démarre (ou redémarre) une base PostgreSQL locale jetable pour les tests Kokolio.
# Elle imite les rôles d'un projet Supabase : anon, authenticated, service_role.
set -e
BIN=/usr/lib/postgresql/16/bin
DATA=/tmp/kkpg
PORT=${KK_PG_PORT:-54329}
run() { su postgres -c "$*"; }
if [ ! -d "$DATA" ]; then
  mkdir -p "$DATA" && chown postgres "$DATA"
  run "$BIN/initdb -D $DATA -U postgres --auth=trust -E UTF8 --locale=C.UTF-8" >/dev/null
fi
if ! run "$BIN/pg_isready -h 127.0.0.1 -p $PORT" >/dev/null 2>&1; then
  run "$BIN/pg_ctl -D $DATA -o '-p $PORT -c listen_addresses=127.0.0.1 -c unix_socket_directories=/tmp -c fsync=off' -l /tmp/kkpg.log -w start" >/dev/null
fi
if [ "$1" = "reset" ]; then
  # « with (force) » : coupe les connexions restées ouvertes par un précédent essai, sinon la base ne peut pas être recréée
  psql -h 127.0.0.1 -p $PORT -U postgres -q -c "drop database if exists kokolio_test with (force)" -c "create database kokolio_test"
  psql -h 127.0.0.1 -p $PORT -U postgres -q -d kokolio_test <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator login noinherit; end if;
end $$;
grant anon, authenticated, service_role to authenticator;
grant usage on schema public to anon, authenticated, service_role;
-- comme sur Supabase : tout ce qui est créé dans « public » est ouvert par défaut à ces rôles
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
SQL
fi
echo "pg ok port $PORT"
