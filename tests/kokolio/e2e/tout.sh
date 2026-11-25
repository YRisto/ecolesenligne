#!/bin/bash
# Rejoue toute la chaîne de bout en bout sur un environnement local neuf.
set -e
cd "$(dirname "$0")/../../.."
pkill -f "next start -p 3111" 2>/dev/null || true
[ "$1" = "sans-construire" ] || bash tests/kokolio/e2e/construire.sh
bash tests/kokolio/e2e/serveur-local.sh 3111 2>&1 | tail -1 > /tmp/kk-setup.txt
CODE=$(grep CODE_ADMIN /tmp/kk-setup.txt | cut -d= -f2)
python3 tests/kokolio/e2e/01_demarrage.py "$CODE" 2>&1 | tail -3
python3 tests/kokolio/e2e/02_quotidien.py 2>&1 | tail -6
python3 tests/kokolio/e2e/03_rh_admin.py 2>&1 | tail -14
