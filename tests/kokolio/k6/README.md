# Essais de charge et de robustesse (k6)

Huit scripts [k6](https://grafana.com/docs/k6/latest/) qui rejouent ce que fait réellement l'application : les mêmes adresses, les mêmes
en-têtes, les mêmes enchaînements que le navigateur. Ils visent **l'environnement de test** (`/kokolio-test`), jamais la production en
ligne : `lib/kokolio.js` refuse toute autre cible, sauf sur un banc local.

| Script | Ce qu'il joue | Ce qu'il montre |
|---|---|---|
| `00-preparer-comptes.js` | Crée et active les comptes fictifs `charge.0001`… (équipes de 25, le premier est responsable) | Préalable aux autres ; à refaire après chaque copie de la production vers le test |
| `01-fumee.js` | Un utilisateur, chaque écran une fois, plus le cloisonnement des rôles | Que l'environnement répond juste ; à lancer en premier |
| `02-pic-du-matin.js` | Tous les salariés arrivent en quelques minutes, ouvrent l'outil et pointent | Le moment le plus chargé d'une journée ordinaire. `MODE=lancement` : chacun se connecte en arrivant (premier matin) |
| `03-journee-type.js` | Salariés, responsables et RH en même temps, une journée ramenée à dix minutes | L'usage mêlé : pointages, demandes de congé, validations, écrans de suivi |
| `04-ecrans-lourds.js` | Les écrans « tous les salariés », demandés par plusieurs RH à la fois, sans temps mort | Le poids du nombre de salariés |
| `05-montee-en-charge.js` | Des ouvertures d'application de plus en plus nombreuses, par paliers | La limite, et la marge par rapport à l'usage réel |
| `06-endurance.js` | Une charge modérée et constante, longtemps | Une dérive dans le temps (fuite, table qui grossit mal) |
| `07-robustesse.js` | Requêtes anormales ou hostiles pendant un trafic normal | Que chaque abus reçoit le refus prévu, sans jamais d'erreur du serveur |

## Sur un banc local (sans limite)

Tout se monte sur le poste : base PostgreSQL jetable, les deux environnements, le site construit. Chaque scénario a sa journée simulée.

```bash
bash tests/kokolio/k6/lancer-local.sh preparer      # banc, copie production → test, 500 comptes de charge (1 à 2 minutes)
bash tests/kokolio/k6/lancer-local.sh fumee         # puis : pic, lancement, journee, journee2, lourds, montee, endurance, robustesse
bash tests/kokolio/k6/lancer-local.sh controles     # après les essais : cohérence des pointages, journal, autodiagnostic, production intacte
bash tests/kokolio/k6/lancer-local.sh tout          # tout d'un coup (compter une heure avec les durées par défaut)
```

`KK_BASE_CSV=/chemin/salaries.csv` charge d'abord une base de salariés dans la production locale (fichier au format de l'import, à garder
hors du dépôt) : les écrans RH portent alors sur un effectif réaliste.

## Sur l'environnement de test en ligne

À lire avant de lancer quoi que ce soit en ligne :

- **Règle de l'hébergeur.** Vercel réserve les essais de charge à son offre Enterprise et prévient qu'un essai lancé sans accord peut
  faire bloquer l'adresse d'où il part ([règle](https://vercel.com/kb/guide/what-s-vercel-s-policy-regarding-load-testing-deployments),
  [guide pratique](https://vercel.com/kb/guide/how-to-effectively-load-test-your-vercel-application)). En ligne, s'en tenir à l'essai de
  fumée et à des volumes qui sont ceux d'une vraie journée ; la montée en charge et l'endurance se jouent sur le banc local.
- **Même hébergement que la production.** L'environnement de test partage sa base et son serveur avec la production : une charge forte
  sur le test ralentit la production. Lancer en dehors des heures de travail.
- **Vingt pointages par compte et par jour.** C'est une règle de l'outil ; au-delà, les pointages sont refusés (comptés à part, ce n'est
  pas une erreur). Un essai consomme un à quatre pointages par compte.
- **Une copie de la production vers le test efface les comptes de charge** : relancer alors `00-preparer-comptes.js`.

```powershell
winget install k6 --source winget          # une fois (ou l'installateur officiel de k6)
cd tests\kokolio\k6

# 1. comptes de charge : votre compte administrateur du test, et le mot de passe que vous choisissez pour les comptes fictifs
k6 run -e BASE=https://ecolesenligne.fr -e ADMIN_LOGIN=admin -e ADMIN_MDP="…" -e MDP="…" -e NB=100 00-preparer-comptes.js

# 2. essai de fumée, puis un matin à volume réel
k6 run -e BASE=https://ecolesenligne.fr -e MDP="…" 01-fumee.js
k6 run -e BASE=https://ecolesenligne.fr -e MDP="…" -e NB=100 -e DUREE=300 02-pic-du-matin.js
```

Les mots de passe ne sont écrits nulle part : ils ne vivent que dans la ligne de commande et dans la mémoire de k6. Pour les écrans RH,
ajouter `-e RH_LOGIN=… -e RH_MDP="…"` avec un compte RH ou administrateur à soi ; aucun compte RH partagé n'est créé.

## Réglages

| Variable | Défaut | Rôle |
|---|---|---|
| `BASE` | `http://localhost:3111` | Adresse du site |
| `MDP` | — | Mot de passe des comptes de charge |
| `NB` | 500 | Nombre de comptes de charge (et d'utilisateurs virtuels au plus) |
| `DUREE` | selon le script | Durée de l'essai, en secondes |
| `P95`, `P95_LOURD`, `P95_CONNEXION` | 1000, 4000, 3000 | Seuils (95 % des réponses plus rapides que…), en millisecondes |
| `PALIERS`, `PALIER` | `2,5,10,20,40`, 60 | Montée en charge : ouvertures par seconde, et durée de chaque palier |
| `RYTHME` | 4 | Endurance : ouvertures par seconde |
| `AVEC_BLOCAGE` | non | Robustesse : joue aussi le blocage de l'adresse après trente échecs de connexion (dix minutes sans connexion possible depuis le poste) |
| `HORLOGE`, `ACCELERATION` | — | Banc local seulement : heure simulée de départ et vitesse du temps |
| `RESULTATS` | — | Dossier où écrire un fichier de mesures par scénario |
| `BAVARD` | non | Affiche chaque réponse inattendue |

## Lire le résultat

Chaque script se termine par un résumé en français : nombre de requêtes, temps de réponse par écran (médiane, 95 %, maximum),
réponses inattendues, refus de gestion prévus, seuils tenus ou non. Trois mesures comptent partout :

- `kk_erreurs_serveur` : réponses 5xx. Le seuil est zéro.
- `kk_erreurs` : réponses qui ne sont ni un succès ni un refus prévu par le scénario. Moins de 1 %.
- `kk_refus_metier` : refus normaux de l'outil (quota de pointages, journée déjà validée, congé qui en chevauche un autre). Ce ne sont pas des erreurs.

Les sessions sont ouvertes **avant** chaque essai, hors mesure : une connexion calcule exprès une empreinte coûteuse du mot de passe
(un quart de seconde de calcul), et cinq cents connexions dans la même minute fausseraient le reste. Le mode `lancement` du pic du matin
mesure justement ce cas.

## Relevé du 26/11/2026 sur le banc local

Poste à 2 processeurs, partagés entre k6, le site, et la base ; 1 041 fiches dans le test (541 copiées de la production locale, 500 de charge).

| Essai | Volume | Résultat |
|---|---|---|
| Pic du matin | 500 arrivées en 2 minutes | ouverture 11 ms, pointage 22 ms (95 % des réponses) ; aucune erreur |
| Pic du matin, mode lancement | 500 connexions et pointages en 3 minutes | connexion 532 ms, le reste sous 35 ms |
| Journée type | 150 salariés, 20 responsables, 2 RH ; 48 requêtes par seconde | écrans des salariés et des responsables sous 30 ms ; synthèse RH de 1 041 fiches : 320 ms |
| Écrans lourds | 4 RH en même temps, sans temps mort | anomalies 556 ms, synthèse 486 ms, contrôle de clôture 447 ms |
| Montée en charge | de 5 à 120 ouvertures par seconde | tenu jusqu'à 40 par seconde (20 ms), ralenti à 80 (146 ms), saturé à 120 ; aucune erreur serveur |
| Endurance | 6 ouvertures par seconde pendant 5 minutes | aucune dérive (10 ms, 9 ms, 9 ms par tiers) |
| Robustesse | 1 970 requêtes, dont un millier anormales | chaque refus est celui prévu ; aucune erreur serveur ; trafic normal intact |

Pour mémoire, 500 salariés qui arrivent en cinq minutes font moins de 2 ouvertures par seconde.

Contrôles après essais : aucune journée dont les heures diffèrent de la trace des pointages, aucun pointage en double, arrivées et
départs alternés, journal intact (chaîne d'empreintes vérifiée), production locale inchangée.

**Ce que ce relevé ne dit pas** : la capacité de l'hébergement en ligne (serveur et base mutualisés), qui dépend de l'offre souscrite
et non du code. Il dit que l'application elle-même, sur une petite machine, tient plus de dix fois la charge d'un matin de 500 salariés.
