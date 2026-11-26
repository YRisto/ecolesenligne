#!/usr/bin/env bash
# Rejoue les suites « serveur » et « planning » contre l'ENVIRONNEMENT DE TEST seul (schéma kokolio_test, fonction kokolio_test_api,
# adresses /api/kokolio-test, cookie kkt_session) : la seconde installation doit se comporter exactement comme la première,
# sans que la production soit installée à côté.
# Les suites ne sont pas dupliquées : une copie transformée est fabriquée le temps de l'exécution, puis effacée.
# Usage : bash tests/kokolio/sur-environnement-test.sh
set -euo pipefail
cd "$(dirname "$0")"
echec=0
for suite in api planning; do
  copie=".${suite}.sur-environnement-test.test.mjs"
  # schéma et fonction d'entrée, script d'installation, adresses, cookie, environnement passé au serveur
  perl -pe '
    s{\bkokolio\.(?=(?:meta|days|audit|absences|balance_entries|plan_days|annual_entries|bootstrap_admin|_month_fingerprint)\b)}{kokolio_test.}g;
    s{supabase/kokolio/install\.sql}{supabase/kokolio/install-test.sql}g;
    s{https://kokolio\.test/api/kokolio/}{https://kokolio.test/api/kokolio-test/}g;
    s{Path=\\/api\\/kokolio/}{Path=\\/api\\/kokolio-test;/}g;
    s{\bkk_session\b}{kkt_session}g;
    s{\}\), route\);}{\}), route, "test");}g;
    s{rpc/kokolio_api}{rpc/kokolio_test_api}g;
    s{function kokolio_api}{function kokolio_test_api}g;
  ' "${suite}.test.mjs" > "$copie"
  # garde-fou : la copie ne doit plus rien adresser à la production
  if grep -nE "kokolio\.(meta|days|audit|absences|users|contracts)\b|/api/kokolio/|\bkk_session\b|install\.sql" "$copie"; then echo "transformation incomplète pour $suite" >&2; rm -f "$copie"; exit 1; fi
  printf "%-9s sur l'environnement de test : " "$suite"
  if node --test "$copie" > ".${suite}.sortie" 2>&1; then grep -E "^# (tests|pass|fail)" ".${suite}.sortie" | tr '\n' ' '; echo
  else grep -E "^# (tests|pass|fail)" ".${suite}.sortie" | tr '\n' ' '; echo; grep -A24 "^not ok" ".${suite}.sortie" | cut -c1-400 | head -80; echec=1; fi
  rm -f "$copie" ".${suite}.sortie"
done
# la production n'a jamais été installée pendant ces deux passes : le test ne dépend pas d'elle
psql -h 127.0.0.1 -p 54329 -U postgres -d kokolio_test -qAt -c "select 'schéma kokolio présent : ' || exists (select 1 from pg_namespace where nspname = 'kokolio') || ' · schéma kokolio_test présent : ' || exists (select 1 from pg_namespace where nspname = 'kokolio_test')"
exit $echec
