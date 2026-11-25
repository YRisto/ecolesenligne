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

## 2.1 — annualisation (à préciser en construisant)

Période commune (réglage). Par salarié : objectif initial (saisi, importé, ou proposé = heures planifiées sur la période) + écritures datées. Par motif d'absence : « compte comme réalisé » ou « retire de l'objectif ». Réalisé = heures faites + absences comptées. Projection = réalisé + planifié restant.

## 2.2 — anomalies et présence (à préciser en construisant)

Calculées à partir des plages prévues : retard, départ anticipé, pointage hors plage, présence insuffisante, travail pendant une absence, pause trop courte / trop longue / non prise. Tolérances et gravité réglables. Traitement : table d'acquittement (salarié, jour, type) avec commentaire. Tableau des présents : état en direct d'après les pointages, les absences et le planning ; liste d'évacuation imprimable.
