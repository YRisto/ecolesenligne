#!/usr/bin/env bash
# Joue les scénarios k6 sur un banc local : base PostgreSQL jetable, faux PostgREST, site construit, les DEUX environnements installés.
# Tout se passe dans l'environnement de test local (/kokolio-test), comme en ligne, après une copie de la production locale.
# Chaque scénario a sa journée simulée (horloge de test) : les pointages d'un essai ne gênent pas le suivant.
#
#   bash tests/kokolio/k6/lancer-local.sh preparer      # monte le banc, copie la production vers le test, crée et active les comptes de charge
#   bash tests/kokolio/k6/lancer-local.sh fumee | pic | lancement | journee | journee2 | lourds | montee | endurance | robustesse
#   bash tests/kokolio/k6/lancer-local.sh controles     # après les essais : journal, autodiagnostic, cohérence des pointages, erreurs du serveur
#   bash tests/kokolio/k6/lancer-local.sh tout          # tout, dans l'ordre (compter une demi-heure)
#
# Variables : K6 (chemin de k6), NB (comptes de charge, 500), KK_BASE_CSV (fichier de salariés à charger d'abord en production locale, facultatif),
#             et celles de chaque scénario (DUREE, PALIERS…). Les seuils par défaut visent l'hébergement réel : sur un petit poste, les desserrer (P95=…).
set -euo pipefail
cd "$(dirname "$0")"
RACINE="$(cd ../../.. && pwd)"
K6="${K6:-k6}"; NB="${NB:-500}"; PORT=3111; BASE="http://localhost:$PORT"
MDP="Charge-Locale-2026"; ADMIN_MDP="Tableau-Bleu-2026"   # identifiants du banc local uniquement
export RESULTATS="${RESULTATS:-$PWD/resultats}"; mkdir -p "$RESULTATS"
PSQL="psql -h 127.0.0.1 -p 54329 -U postgres -d kokolio_test -v ON_ERROR_STOP=1 -qAt"
commun=(--no-usage-report --no-color --quiet -e BAVARD=1 -e BASE="$BASE" -e MDP="$MDP" -e NB="$NB" -e RH_LOGIN=admin -e RH_MDP="$ADMIN_MDP" -e RESULTATS="$RESULTATS")
lance() { local nom="$1"; shift; echo; echo "──────── $nom"; "$K6" run "${commun[@]}" "$@" 2>&1 | grep -v '^$' | tee "$RESULTATS/$nom.txt" | grep -v 'level=info' || true; }

preparer() {
  ( cd "$RACINE" && [ -f .next/BUILD_ID ] || bash tests/kokolio/e2e/construire.sh )
  ( cd "$RACINE" && KK_PG_POOL="${KK_PG_POOL:-10}" bash tests/kokolio/e2e/serveur-local.sh $PORT 2>&1 | tail -1 > /tmp/kk-setup.txt )
  KK_HORLOGE=2026-11-30T06:00:00Z node preparer-banc-local.mjs "$(grep CODE_ADMIN /tmp/kk-setup.txt | cut -d= -f2)" ${KK_BASE_CSV:+"$KK_BASE_CSV"}
  lance 00-preparer-comptes -e ADMIN_LOGIN=admin -e ADMIN_MDP="$ADMIN_MDP" -e HORLOGE=2026-11-30T07:00 00-preparer-comptes.js
}
controles() {
  echo; echo "──────── contrôles après essais"
  $PSQL <<'SQL'
select 'fiches : ' || (select count(*) from kokolio_test.users) || ' · journées : ' || (select count(*) from kokolio_test.days) || ' · pointages : ' || (select count(*) from kokolio_test.punch_log)
    || ' · absences : ' || (select count(*) from kokolio_test.absences) || ' · lignes de journal : ' || (select count(*) from kokolio_test.audit) || ' · sessions : ' || (select count(*) from kokolio_test.sessions);
-- chaque pointage enregistré se retrouve dans la journée, et inversement : aucune écriture perdue sous la concurrence
select 'journées dont les heures ne correspondent pas à la trace des pointages : ' || count(*) from (
  select d.user_id, d.day from kokolio_test.days d
  where coalesce(array_length(d.times, 1), 0) <> (select count(*) from kokolio_test.punch_log l where l.user_id = d.user_id and l.day = d.day)
    and not exists (select 1 from kokolio_test.audit a where a.target_user = d.user_id and a.action in ('correction', 'correction_par_rh'))) x;
select 'journées aux heures désordonnées : ' || count(*) from kokolio_test.days d where d.times <> (select array_agg(t order by t) from unnest(d.times) t);
select 'pointages enregistrés deux fois (même compte, même instant) : ' || coalesce(sum(n - 1), 0) from (select count(*) n from kokolio_test.punch_log group by user_id, ts having count(*) > 1) x;
select 'arrivées et départs qui ne s''alternent pas : ' || count(*) from (select kind, lag(kind) over (partition by user_id, day order by ts, id) avant from kokolio_test.punch_log) x where kind = avant;
select 'numéros du journal : ' || count(*) || ' lignes, de ' || min(seq) || ' à ' || max(seq) || case when max(seq) - min(seq) + 1 = count(*) then ' (sans trou)' else ' (avec des trous : transactions annulées)' end from kokolio_test.audit;
select 'autodiagnostic du test : ' || (r->>'ok') || ' (' || (r->>'count') || ' contrôles)' from (select kokolio_test.selftest() r) q;
select 'production locale intacte : ' || (select count(*) from kokolio.users) || ' fiches, ' || (select count(*) from kokolio.days) || ' journées, ' || (select count(*) from kokolio.punch_log) || ' pointages';
SQL
  KK_BASE="$BASE" KK_ADMIN_MDP="$ADMIN_MDP" node --input-type=module - <<'NODE'
const BASE = process.env.KK_BASE, h = { "content-type": "application/json", "x-kokolio": "1", origin: BASE, "x-kk-test-now": "2026-12-11T08:00:00Z" };
const r = await fetch(BASE + "/api/kokolio-test/auth/login", { method: "POST", headers: h, body: JSON.stringify({ login: "admin", password: process.env.KK_ADMIN_MDP }) });
const cookie = r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
let apres = "", total = 0, ok = true;
for (let i = 0; i < 500; i++) {
  const j = await (await fetch(BASE + "/api/kokolio-test/rh/journal-verify", { method: "POST", headers: { ...h, cookie }, body: JSON.stringify({ after: apres }) })).json();
  if (!j.ok) { ok = false; console.log("journal : vérification impossible", JSON.stringify(j).slice(0, 200)); break; }
  total += j.data.checked;
  if (!j.data.ok) { ok = false; console.log(`journal du test : CHAÎNE ROMPUE à la ligne n° ${j.data.bad_seq}`); break; }
  if (j.data.done) break;
  apres = j.data.last;
}
if (ok) console.log(`journal du test : ${total} lignes vérifiées, chaîne d'empreintes intacte après les essais`);
NODE
  echo "erreurs dans le journal du serveur : $(grep -ciE 'unhandled|TypeError|ReferenceError|ECONNRESET|FATAL' /tmp/kk-next.log || true)"
}

case "${1:-tout}" in
  preparer) preparer ;;
  fumee) lance 01-fumee -e HORLOGE=2026-11-30T08:00 01-fumee.js ;;
  pic) lance 02-pic-du-matin-sessions -e HORLOGE=2026-12-01T08:40 -e DUREE="${DUREE:-300}" 02-pic-du-matin.js ;;
  lancement) lance 02-pic-du-matin-lancement -e MODE=lancement -e HORLOGE=2026-12-02T08:45 -e DUREE="${DUREE:-300}" 02-pic-du-matin.js ;;
  journee) lance 03-journee-type -e HORLOGE=2026-12-03T08:30 -e ACCELERATION=$(( 32400 / ${DUREE:-600} )) -e DUREE="${DUREE:-600}" 03-journee-type.js ;;
  # le lendemain : les journées de la veille sont complètes, les responsables ont de quoi valider
  journee2) lance 03-journee-type-lendemain -e HORLOGE=2026-12-04T08:30 -e ACCELERATION=$(( 32400 / ${DUREE:-600} )) -e DUREE="${DUREE:-600}" 03-journee-type.js ;;
  lourds) lance 04-ecrans-lourds -e HORLOGE=2026-12-07T10:00 04-ecrans-lourds.js ;;
  montee) lance 05-montee-en-charge -e HORLOGE=2026-12-08T08:30 05-montee-en-charge.js ;;
  endurance) lance 06-endurance -e HORLOGE=2026-12-09T08:30 -e ACCELERATION=$(( 32400 / ${DUREE:-1200} )) -e DUREE="${DUREE:-1200}" 06-endurance.js ;;
  robustesse) lance 07-robustesse -e HORLOGE=2026-12-10T09:00 -e AVEC_BLOCAGE=1 -e IP_FACTICE=203.0.113.77 07-robustesse.js ;;
  controles) controles ;;
  tout) preparer; for e in fumee pic lancement journee journee2 lourds montee endurance robustesse; do bash "$0" "$e"; done; controles ;;
  *) echo "usage : $0 preparer|fumee|pic|lancement|journee|journee2|lourds|montee|endurance|robustesse|controles|tout"; exit 1 ;;
esac
