#!/bin/bash
# Construit le site pour les tests locaux. La commande de construction peut s'interrompre pour afficher un avis : on la relance.
cd "$(dirname "$0")/../../.."
export SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=test-service-key
for essai in 1 2 3; do
  rm -f .next/BUILD_ID
  if npx next build > /tmp/kk-build.log 2>&1 && [ -f .next/BUILD_ID ]; then echo "construction réussie (essai $essai)"; exit 0; fi
done
echo "construction en échec"; tail -15 /tmp/kk-build.log; exit 1
