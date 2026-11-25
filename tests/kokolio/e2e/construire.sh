#!/bin/bash
# Construit le site pour les tests locaux. La commande de construction peut s'interrompre une fois pour afficher un avis : on la relance.
cd "$(dirname "$0")/../../.."
export SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=test-service-key
npx next build > /tmp/kk-build.log 2>&1 || npx next build > /tmp/kk-build.log 2>&1
grep -q "api/kokolio" /tmp/kk-build.log && [ -f .next/BUILD_ID ] && echo "construction réussie" || { echo "construction en échec"; tail -15 /tmp/kk-build.log; exit 1; }
