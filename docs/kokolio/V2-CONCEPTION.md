# Kokolio V2 — lots 1 et 2 : conception

Document de travail. Il sert de fil conducteur pendant la construction ; le README reste la référence une fois une version en ligne.

## Découpage

| Version | Schéma | Contenu |
|---|---|---|
| 2.0 | 4 | Horaires journaliers à plages, cycles, planning d'équipe (exceptions), début de suivi par salarié réglable par les RH, présence automatique (cadres), journées passant minuit |
| 2.1 | 5 | Annualisation : objectif, réalisé, reste à faire, projection, solde semaine par semaine |
| 2.2 | 6 | Anomalies liées à l'horaire prévu, gravité et traitement, pauses, tableau des présents et liste d'évacuation |

Principe commun : **tout est optionnel**. Un salarié sans cycle garde son horaire fixe actuel ; aucun chiffre existant ne bouge.

## Ce que montre le Kelio du CEF (relevé du 25/11/2026, lecture seule)

- Horaire journalier : un code (L006), une durée théorique (8 h 00), des plages indicatives (8 h 45 – 13 h 15, 14 h – 18 h), type « libre ».
- Cycle de travail par salarié (« Annualisation FDV Expert 35h ») : des semaines types (AN010…) faites d'horaires journaliers ; calendrier annuel jour par jour.
- Planning : par jour et par salarié, l'horaire prévu ; le responsable modifie les périodes d'un jour ; copier-coller, modification en masse, retour au planning par défaut.
- Date de « prise en compte » par salarié ; mode de gestion de la présence (badgeages ou présence automatique : les cadres n'ont pas de pointage).
- Annualisation (« modulation ») : période commune (06/04/2026 → 31/12/2026). Objectif individuel = valeur d'initialisation en début de période ± écritures datées (« retrait de l'objectif »). Affiché : objectif, réalisé à ce jour, reste à faire, réalisé prévisionnel. Détail hebdomadaire : réalisé, théorique, solde de la semaine et solde cumulé (réalisé − théorique).
- Anomalies en quatre niveaux (à corriger absolument, à corriger éventuellement, pour information, pour information RH) et trois états (à traiter, corrigée, acquittée).

Ce qui n'est pas visible avec un profil manager (règles de calcul, tolérances) devient un réglage dans Kokolio.

## 2.0 — modèle

- `day_models` (code, libellé, minutes, plages `[["08:45","13:15"],…]`, couleur, actif).
- `cycles` (nom, `weeks` = 1 à 12 semaines de 7 codes d'horaire ou vide = repos).
- `contracts` + `cycle_id`, `cycle_anchor` (lundi de la semaine 1), `presence` (`pointage` | `automatique`).
- `plan_days` (salarié, jour) : exception qui remplace le cycle ; copie la durée et les plages au moment de la saisie.
- Réglage `night_until` (vide = désactivé) : avant cette heure, un pointage termine la journée de la veille restée ouverte ; l'heure est stockée au-delà de 24:00 (« 25:30 »).

Résolution d'un jour (`engine/plan.mjs`) : exception → cycle → horaire fixe du contrat. Un jour férié n'est travaillé que si une exception le prévoit.
Le serveur résout cycles et exceptions dès la lecture (`attachPlan`) : chaque contrat reçoit `cycle` (semaines résolues), chaque salarié `plan` (ses exceptions). Le moteur ne change donc pas de signature.

Verrous : un horaire ou un cycle qui a servi dans un mois clôturé ne peut plus changer de durée ni de composition (on en crée un nouveau) ; `plan_days` est figé avec le mois clôturé.
Droits : bibliothèque et cycles = RH et administrateurs ; planning = responsable direct, RH, administrateurs ; jamais soi-même.

## 2.1 — annualisation (construite)

Période commune créée par les RH (`annual_periods`). Sont annualisés les salariés qui suivent un cycle marqué « annualisé ». Objectif = objectif fixé (`annual_goals`) ou heures planifiées, plus ajustements datés (`annual_entries`), moins les absences « retirées ». Chaque motif d'absence dit son effet (`absence_types.annual`). Détail dans le README, calcul dans `engine/annual.mjs`.

## 2.2 — anomalies et présence (construite)

Anomalies calculées à partir des plages prévues (`engine/signals.mjs`), niveaux et tolérances dans les réglages, acquittement dans `anomaly_acks`. Tableau des présents et liste d'évacuation dans `server/suivi.mjs` et `public/kokolio/js/suivi.js`.

## Mise en ligne

Faite le 25/11/2026 vers 18 h 45, dans cet ordre :

1. **Base** : script `supabase/kokolio/install.sql` joué dans l'éditeur SQL de Supabase après vérification de son empreinte. Contrôles avant et après identiques (9 comptes, 8 horaires, 336 journées, 11 absences, 15 lignes de journal, 1 clôture, 916 pointages), schéma passé de 3 à 6, aucun horaire modifié, nouvelles tables vides, autodiagnostic vrai (45 contrôles).
2. **Application** : `main` avancé sur la version 2.2.0 ; `GET /api/kokolio/health` répond application 2.2.0, schéma 6 attendu et constaté.

Reste à faire — **préparer la démonstration en production** (l'outil y est en mode démonstration, données chargées en 1.1.1 : ne pas l'effacer, les comptes `demo.manager` et `demo.salarie` y sont rattachés). Avec la session administrateur, par les écrans de l'outil :

- Planning › Horaires et cycles : J7 (7 h, 9 h – 12 h 30 / 13 h 30 – 17 h), J8 (8 h, 8 h 45 – 13 h 15 / 14 h – 17 h 30), M4 (4 h, 9 h – 13 h), S7 (7 h, 12 h – 15 h 30 / 16 h 30 – 20 h) ;
- cycles : « Semaine 35 h » (annualisé), « Temps partiel 28 h (lundi à jeudi) », « Alternance 4 jours / 5 jours » (annualisé) ;
- fiches : cycle « Semaine 35 h » pour Camille Martin, Thomas Petit et Salarié Test à compter du 01/10/2026 (septembre est clôturé), cycle 28 h pour Inès Roux, présence automatique pour Nadia Benali ;
- Synthèse › Annualisation : période « Annualisation 2026 », du 01/09/2026 au 31/12/2026.

Le soir de la mise en ligne, le navigateur du PC refusait le site (`ERR_CERT_AUTHORITY_INVALID`) alors qu'il répondait normalement de l'extérieur : un filtrage du réseau ou d'un logiciel de sécurité de ce poste, pas un défaut du site. La préparation ci-dessus attend que ce poste atteigne de nouveau le site.
