#!/bin/bash
# Rejoue toute la chaîne de bout en bout sur un environnement local neuf.
set -e
cd "$(dirname "$0")/../../.."
[ "$1" = "sans-construire" ] || bash tests/kokolio/e2e/construire.sh
bash tests/kokolio/e2e/serveur-local.sh 3111 2>&1 | tail -1 > /tmp/kk-setup.txt
CODE=$(grep CODE_ADMIN /tmp/kk-setup.txt | cut -d= -f2)
for etape in 01_demarrage 02_quotidien 03_rh_admin; do
  if ! python3 tests/kokolio/e2e/$etape.py "$CODE" > /tmp/kk-$etape.log 2>&1; then echo "ÉCHEC à l'étape $etape"; grep -n "in <module>\|Expect \|waiting for\|AssertionError" /tmp/kk-$etape.log | head -8; exit 1; fi
  tail -n 2 /tmp/kk-$etape.log
done
# le mode démonstration se joue sur un outil vide : nouvel environnement
bash tests/kokolio/e2e/serveur-local.sh 3111 2>&1 | tail -1 > /tmp/kk-setup.txt
CODE=$(grep CODE_ADMIN /tmp/kk-setup.txt | cut -d= -f2)
if ! python3 tests/kokolio/e2e/04_demonstration.py "$CODE" > /tmp/kk-04_demonstration.log 2>&1; then echo "ÉCHEC à l'étape 04_demonstration"; grep -n "in <module>\|Expect \|waiting for\|AssertionError" /tmp/kk-04_demonstration.log | head -8; exit 1; fi
tail -n 2 /tmp/kk-04_demonstration.log
