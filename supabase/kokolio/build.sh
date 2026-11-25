#!/bin/bash
# Assemble les fichiers de src/ en scripts à exécuter dans la console SQL de la base :
#   install.sql               installation et mises à jour (rejouable, ne supprime aucune donnée)
#   premiere-installation.sql le même, suivi de la création du compte administrateur : son résultat est le code d'activation
cd "$(dirname "$0")"
{
  echo "-- Kokolio — script d'installation et de mise à jour (généré par build.sh, ne pas modifier à la main)."
  echo "-- Rejouable : crée ce qui manque, remplace les fonctions, ne supprime aucune donnée."
  echo "begin;"
  cat src/01_tables.sql src/02_core.sql src/03_auth.sql src/04_actions.sql src/05_admin.sql src/05c_planning.sql src/05d_annual.sql src/05e_anomalies.sql src/05b_demo.sql src/06_selftest.sql src/07_api.sql
  echo "commit;"
} > install.sql
{
  echo "-- Kokolio — première installation (généré par build.sh)."
  echo "-- À exécuter une fois, en entier, dans la console SQL du projet Supabase."
  echo "-- Le résultat affiché à la fin est le code d'activation du compte « admin » (à usage unique, valable 14 jours)."
  echo "-- Ce script ne supprime rien : les mots delete et truncate qu'il contient figurent dans les fonctions de l'outil."
  echo
  cat install.sql
  echo
  echo "select kokolio.bootstrap_admin('admin') as \"Code d'activation du compte admin\";"
} > premiere-installation.sql
wc -c install.sql premiere-installation.sql
