#!/bin/bash
# Assemble les fichiers de src/ en un script unique, à exécuter dans la console SQL de la base.
cd "$(dirname "$0")"
{
  echo "-- Kokolio — script d'installation et de mise à jour (généré par build.sh, ne pas modifier à la main)."
  echo "-- Rejouable : crée ce qui manque, remplace les fonctions, ne supprime aucune donnée."
  echo "begin;"
  cat src/01_tables.sql src/02_core.sql src/03_auth.sql src/04_actions.sql src/05_admin.sql src/06_selftest.sql src/07_api.sql
  echo "commit;"
} > install.sql
wc -c install.sql
