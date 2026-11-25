# Kokolio — pointage et absences

Outil interne de pointage, de suivi des heures et des absences. Adresse : `/kokolio`. Maquette de démonstration (données fictives, sans serveur) : `/kokolio/demo`.

Version de l'application : voir `lib/kokolio/version.mjs` et, dans l'outil, Administration › Versions.

## Comment c'est fait

```
Navigateur ──HTTPS──▶ /api/kokolio/…  (Next.js, Vercel)
  public/kokolio/        lib/kokolio/server/   contrôle d'origine, cookie de session, routes
  (pages, sans donnée)   lib/kokolio/engine/   calculs : heures, écarts, soldes, clôture, export
                                │  clé serveur, un seul point d'entrée
                                ▼
                         public.kokolio_api(jsonb)        ← seule fonction appelable
                         schéma privé « kokolio »         ← tables, règles, verrous, journal
                         (PostgreSQL, projet Supabase du site)
```

- **Le navigateur** ne parle qu'à `/api/kokolio/…`. Il ne détient aucune clé et n'accède jamais à la base.
- **Le serveur** (routes Next.js) transforme le mot de passe (scrypt), tient la session dans un cookie `HttpOnly`, appelle la base et met en forme les réponses. Les calculs sont dans `lib/kokolio/engine`, testés seuls.
- **La base** applique elle-même toutes les règles : session, droits, verrous de clôture, journal. Le schéma `kokolio` n'est pas exposé par l'API de Supabase et aucun rôle n'y a de droit ; la seule porte est la fonction `public.kokolio_api`, appelable uniquement avec la clé serveur, et qui ne fait rien de sensible sans session valide.

Les tables du site (`ecoles`, `formations`, `leads`, `jeu_dg_*`…) ne sont pas touchées.

## Installation

1. Dans la console SQL du projet Supabase, exécuter **`supabase/kokolio/install.sql`** en entier. Le script crée le schéma, les tables et les fonctions. Il est rejouable : il ne supprime ni table ni donnée.
2. Toujours dans la console SQL : `select kokolio.bootstrap_admin('admin');` — la requête renvoie un **code d'activation à usage unique**.
3. Ouvrir `/kokolio`, choisir « Première connexion ou mot de passe oublié », saisir l'identifiant `admin`, le code, et choisir un mot de passe.
4. Dans Administration › Réglages, fixer la **date de mise en service** (premier jour de pointage). Avant cette date, rien n'est attendu des salariés.
5. Dans RH › Salariés, importer le fichier des salariés (modèle téléchargeable), puis remettre à chacun sa fiche d'activation.

Variables d'environnement utilisées (déjà présentes pour le site) : `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Ne jamais définir `KOKOLIO_TEST_HOOKS` en production.

Contrôle : `GET /api/kokolio/health` répond `{"ok":true,"database":"ok",…}` quand tout est en place, et `"database":"installation"` tant que le script n'a pas été exécuté.

## Mise à jour

- **Application** : pousser sur `main` (déploiement automatique). Incrémenter `APP_VERSION` dans `lib/kokolio/version.mjs` et ajouter la version en tête de `public/kokolio/js/versions.js` — c'est la page « Versions » de l'outil, à tenir à jour à chaque mise en ligne.
- **Base** : modifier les fichiers de `supabase/kokolio/src/`, lancer `bash supabase/kokolio/build.sh`, puis rejouer `install.sql` dans la console SQL. Règles : n'ajouter que des `create … if not exists`, `alter table … add column if not exists`, `create or replace function` ; jamais de `drop`. Si le changement est nécessaire à l'application, incrémenter `schema_version` (fin de `07_api.sql`) et `SCHEMA_EXPECTED` : l'écran Administration › État signale tout écart.
- Les données sont conservées d'une version à l'autre : aucune étape ne les réécrit.

## Qui voit quoi

| Profil | Voit | Peut |
|---|---|---|
| Salarié | ses pointages, ses absences, ses soldes, sa fiche | pointer, corriger (motif obligatoire, validation requise), demander une absence, annuler une demande en attente |
| Responsable (toute personne à qui un salarié est rattaché) | en plus : les journées, absences et soldes de son équipe directe, sans les coordonnées personnelles | valider ou refuser journées et absences, rouvrir, générer un code d'activation pour un membre de son équipe |
| RH | tous les salariés | fiches, horaires, soldes, import, saisie pour un salarié, clôture, export, journal |
| Administrateur | comme RH | en plus : profils RH et administrateur, réglages, motifs, autodiagnostic |

Règles appliquées dans la base, quel que soit le chemin d'accès : nul ne valide ses propres journées ni ses propres congés (exception tracée : un administrateur sans responsable) ; un RH ne modifie pas un compte administrateur ; les profils ne sont attribués que par un administrateur ; le dernier administrateur ne peut pas être rétrogradé.

## Ce qui ne peut pas être modifié en dehors de l'outil

Des déclencheurs dans la base refusent, y compris pour une requête SQL directe du propriétaire :

- toute modification d'une journée ou d'une absence d'un **mois clôturé** (seule une réouverture motivée, tracée, la rend possible) ;
- toute modification ou suppression dans le **journal**, la **trace des pointages** et les **écritures de solde** (ajout seul).

Le journal est chaîné : chaque ligne porte l'empreinte de la précédente. Si quelqu'un désactivait les déclencheurs pour retoucher une ligne, RH › Journal › « Vérifier l'intégrité » le détecterait. Des trous dans la numérotation des lignes sont normaux (opérations annulées) : c'est la chaîne d'empreintes qui fait foi.

Limite à connaître : un administrateur de la base peut toujours, techniquement, tout supprimer ou restaurer une ancienne sauvegarde. L'outil rend les retouches visibles ; il ne remplace pas la maîtrise des accès au projet Supabase.

## Comptes et mots de passe

- Mot de passe : 10 caractères au moins. Il n'est jamais stocké ni transmis à la base en clair (scrypt, sel par compte).
- Cinq erreurs consécutives bloquent le compte quinze minutes. Trente erreurs en dix minutes depuis une même adresse bloquent cette adresse.
- Mot de passe oublié : le responsable, un RH ou un administrateur génère un nouveau code d'activation. Le code s'affiche une fois, vaut 14 jours (réglable) et ne sert qu'une fois. Chaque génération est inscrite au journal : c'est ce qui permet de contrôler qu'un responsable n'a pas repris la main sur le compte d'un salarié.
- Session : cookie `HttpOnly`, `Secure`, `SameSite=Strict`, limité à `/api/kokolio`. Trente jours sans activité, ou quatre-vingt-dix jours au plus, puis reconnexion.
- **Mot de passe administrateur perdu** : rejouer `select kokolio.bootstrap_admin('admin');` dans la console SQL, qui renvoie un nouveau code.

## Calculs

- Heures d'une journée : somme des plages arrivée → départ. Si la journée tient en une seule plage de plus de six heures, la pause de l'horaire est déduite.
- Prévu : durée du jour selon l'horaire en vigueur à cette date, zéro les jours fériés et les jours d'absence validée (moitié pour une demi-journée). Rien n'est prévu avant la date de mise en service ni avant la date d'entrée.
- Écart : travaillé moins prévu, sur les jours passés et, pour le jour même, seulement quand la journée est terminée.
- Forfait jours : pas d'écart en heures, décompte des journées pointées dans l'année.
- Congés payés (année civile) : écritures de l'année (report, ajustements) + acquisition par mois complet terminé depuis la mise en service − jours pris. RTT : droits saisis par les RH − jours pris.
- Décompte d'une absence : jours travaillés de l'horaire en vigueur, hors jours fériés.
- Jours fériés : les onze jours fériés de métropole. L'Alsace-Moselle et l'outre-mer ne sont pas gérés.

## Clôture et export paie

La clôture d'un mois exige : mois terminé, toutes les journées validées, aucune demande d'absence en attente. Elle enregistre une photographie des chiffres par salarié et le fichier d'export, avec son empreinte. Une réouverture demande un motif ; la clôture suivante crée une nouvelle version, les précédentes restent téléchargeables à l'identique.

Fichier d'export : une ligne par absence validée et, en option, une ligne d'heures par salarié — `Matricule;Code;Valeur;Date début;Date fin`. Codes, séparateurs et en-tête se règlent dans Administration (Réglages et Motifs).

**Le format d'import attendu par Silae n'a pas été validé** : il dépend du paramétrage du dossier de paie. Avant la première clôture, faire un essai d'import avec un brouillon et ajuster les codes.

## Exploitation

- **Sauvegardes** : elles relèvent de l'hébergement de la base. Vérifier que le projet Supabase dispose de sauvegardes quotidiennes (offre payante) ; sans elles, une suppression accidentelle serait irréversible.
- **Volume** : les justificatifs (2,5 Mo au plus chacun, les photos sont réduites avant l'envoi) sont stockés dans la base. Administration › État affiche la taille.
- **Surveillance** : `GET /api/kokolio/health`.
- **Charge** : les écrans RH « tous les salariés » lisent un mois entier de pointages ; à plusieurs milliers de salariés il faudrait agréger côté base.
- **Dépendance** : le site et l'outil partagent le même projet Supabase et la même clé serveur. Une fuite de cette clé ne donnerait pas accès aux données de l'outil (il faut une session), mais permettrait de tenter des connexions.

## Tests

```
node --test tests/kokolio/engine.test.mjs      # calculs (aucune dépendance)
bash tests/kokolio/pg-local.sh reset            # PostgreSQL 16 local jetable
cd tests/kokolio && npm install && cd ../..     # une fois : client PostgreSQL des tests
node --test tests/kokolio/api.test.mjs          # scénario complet contre une vraie base
bash tests/kokolio/e2e/tout.sh                  # navigateur (Playwright) : mise en route, quotidien, RH
```

Dans l'outil : Administration › État › « Lancer l'autodiagnostic » rejoue en production, sur des comptes fictifs effacés aussitôt, les règles de cloisonnement et de verrouillage.

## Non géré dans cette version

Heures supplémentaires majorées, travail de nuit ou du dimanche, astreintes, journées passant minuit, période de référence des congés du 1er juin au 31 mai, validation à plusieurs niveaux, connexion Microsoft. Prévus ensuite (présents dans la maquette) : planning, télétravail avec quota, compte épargne-temps, cycles et annualisation, congés d'ancienneté, effectifs et échéances, délégation, notifications par e-mail, temps par activité.
