#!/bin/bash
# Monte tout l'outil en local pour les tests de bout en bout : base PostgreSQL jetable, faux PostgREST, site Next.js construit.
# Usage : bash tests/kokolio/e2e/serveur-local.sh [port]   → affiche le code d'activation de l'administrateur.
set -e
cd "$(dirname "$0")/../../.."
PORT=${1:-3111}
bash tests/kokolio/pg-local.sh reset >/dev/null 2>&1
PSQL="psql -h 127.0.0.1 -p 54329 -U postgres -d kokolio_test -v ON_ERROR_STOP=1 -qAt"
$PSQL -f supabase/kokolio/install.sql >/dev/null
$PSQL -c "insert into kokolio.meta (key, value) values ('test_mode', 'true'::jsonb) on conflict (key) do update set value = excluded.value" >/dev/null
pkill -f fake-postgrest.mjs 2>/dev/null || true
pkill -f "next start -p $PORT" 2>/dev/null || true
sleep 0.5
nohup node tests/kokolio/fake-postgrest.mjs > /tmp/kk-fake.log 2>&1 &
[ -f .next/BUILD_ID ] || SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=test-service-key npx next build >/dev/null
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=test-service-key KOKOLIO_TEST_HOOKS=1 nohup npx next start -p $PORT > /tmp/kk-next.log 2>&1 &
for i in $(seq 1 40); do curl -sf "http://127.0.0.1:$PORT/api/kokolio/health" >/dev/null 2>&1 && break; sleep 0.5; done
curl -s "http://127.0.0.1:$PORT/api/kokolio/health"; echo
echo "CODE_ADMIN=$($PSQL -c "select kokolio.bootstrap_admin('admin')")"
