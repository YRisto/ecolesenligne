// Fonctionnalités et historique des versions. À mettre à jour à chaque mise en ligne, avec lib/kokolio/version.mjs.
export const VERSIONS = [
  { v: "2.0.0", date: "25/11/2026", titre: "Planification : horaires à plages, cycles, planning d'équipe", points: [
    "Horaires journaliers avec plages (exemple : 8 h 45 – 13 h 15, 14 h – 18 h), réunis dans une bibliothèque tenue par les RH",
    "Cycles d'une ou plusieurs semaines, attribués à un salarié à partir d'une date : le prévu, l'écart, les oublis et le décompte des absences suivent le cycle",
    "Planning d'équipe : exception d'un jour (autre horaire, repos, jour férié travaillé), sélection de plusieurs jours, copier-coller, recopie d'une semaine sur la suivante, retour au planning par défaut",
    "Présence automatique pour les salariés qui ne pointent pas : leurs jours prévus sont comptés d'office, seules les absences se déclarent",
    "Début de suivi propre à chaque salarié, réglable par les RH et à l'import, pour déployer l'outil équipe par équipe",
    "Journées qui passent minuit (réglage, désactivé au départ) : le départ du lendemain ferme la journée de la veille",
    "Le salarié voit son horaire du jour et son planning des quatorze jours à venir",
    "Rien ne change pour un salarié sans cycle : il garde son horaire fixe. Base de données en version 4 (trois tables et trois colonnes ajoutées, aucune donnée modifiée)",
  ] },
  { v: "1.1.1", date: "25/11/2026", titre: "Démonstration sans effet sur les comptes déjà créés", points: [
    "Correction : au chargement des données de démonstration, les comptes déjà présents se retrouvaient avec deux mois de journées sans pointage, jusque dans le mois clôturé. Leur suivi reste désormais celui d'avant le chargement",
    "Chaque compte porte son premier jour suivi : « Mes heures » et la saisie d'une journée oubliée ne remontent pas plus loin",
    "Base de données en version 3 (une colonne ajoutée, aucune donnée modifiée)",
  ] },
  { v: "1.1.0", date: "25/11/2026", titre: "Mode démonstration", points: [
    "Données de démonstration à charger dans un outil vide : six salariés fictifs, deux mois de pointages, absences, validations en attente, un mois clôturé",
    "Codes d'activation des comptes fictifs affichés au chargement, pour essayer chaque profil",
    "Bandeau « Mode démonstration » visible par tous ; effacement complet avant la mise en service, réservé à ce mode",
  ] },
  { v: "1.0.0", date: "25/11/2026", titre: "Première version de production", points: [
    "Comptes personnels : identifiant, mot de passe, activation par code à usage unique. La connexion Microsoft de la maquette est remplacée",
    "Données enregistrées sur un serveur et cloisonnées : chacun ne voit que ce que son rôle autorise, quel que soit le moyen d'accès",
    "Pointage à l'heure du serveur ; la trace d'origine de chaque pointage est conservée, même après correction",
    "Horaires datés : changer la fiche d'un salarié ne modifie plus les mois passés",
    "Clôture mensuelle qui fige les chiffres ; export paie versionné, non régénérable après clôture",
    "Journal des actions en ajout seul, dont l'intégrité se vérifie d'un clic",
    "Import des salariés par fichier, fiches d'activation imprimables, désactivation automatique à la date de sortie",
    "Report des congés en fin d'année, écritures de solde tracées",
    "Réglages, motifs d'absence et codes d'export modifiables par l'administrateur ; autodiagnostic de l'installation",
  ] },
];

// Les versions de la maquette (données fictives, sans serveur), conservées pour mémoire.
export const MAQUETTES = [
  { v: "V4.3", date: "23/11/2026", titre: "Dossier d'installation téléchargeable" },
  { v: "V4.2", date: "23/11/2026", titre: "Fond blanc, menus agrandis, logo" },
  { v: "V4.1", date: "23/11/2026", titre: "Habillage Centre Européen de Formation" },
  { v: "V4", date: "23/11/2026", titre: "Organisation du temps, télétravail, CET, effectifs" },
  { v: "V3.1", date: "23/11/2026", titre: "Nouveau design" },
  { v: "V3", date: "23/11/2026", titre: "Accueil par profil" },
  { v: "V2", date: "23/11/2026", titre: "Gestion des temps complète" },
  { v: "V1", date: "23/11/2026", titre: "Première maquette" },
];

export const FONCTIONS = [
  ["Comptes et droits", [
    "Connexion par identifiant et mot de passe ; première connexion et mot de passe oublié par code d'activation à usage unique",
    "Quatre niveaux : salarié, responsable d'équipe (dès qu'un salarié lui est rattaché), RH, administrateur",
    "Compte bloqué quinze minutes après cinq mots de passe erronés",
    "Liste des appareils connectés, déconnexion des autres appareils, déconnexion automatique après trente jours sans activité",
    "Compte fermé automatiquement le lendemain de la date de sortie ; désactivation immédiate par les RH",
  ]],
  ["Pointage", [
    "Arrivée et départ en un geste, autant de fois que nécessaire dans la journée, à l'heure du serveur",
    "Lieu de travail : bureau, télétravail, déplacement (liste réglable)",
    "Correction d'une journée ou ajout d'une journée oubliée, avec motif obligatoire, soumise au responsable",
    "Signalement des oublis : départ non pointé, jour travaillé sans pointage ni absence",
    "Pointages d'origine consultables : ce qui a réellement été pointé, avant toute correction",
    "Journée verrouillée après validation ; mois verrouillé après clôture",
  ]],
  ["Temps de travail", [
    "Horaire par salarié, jour par jour : temps plein, temps partiel, forfait jours",
    "Horaires datés : un changement d'horaire, de cycle ou de mode de présence s'applique à partir de sa date d'effet",
    "Présence par pointage, ou automatique pour ceux qui ne pointent pas (jours prévus comptés d'office)",
    "Début de suivi propre à chaque salarié : rien n'est attendu de lui avant",
    "Compteur débit-crédit par semaine et par mois ; forfait jours : décompte des journées dans l'année",
    "Pause déduite d'une longue journée pointée sans pause",
    "Jours fériés français pris en compte",
    "Points d'attention : plus de 10 h dans la journée, plus de 48 h dans la semaine, moins de 11 h de repos",
    "Journées qui passent minuit, sur réglage : le départ pointé le lendemain matin est rattaché à la veille",
  ]],
  ["Planification", [
    "Bibliothèque d'horaires journaliers : code, durée, plages indicatives, couleur",
    "Cycles d'une à douze semaines construits avec ces horaires ; ils se répètent à partir d'un lundi de départ",
    "Planning d'équipe semaine par semaine (une, deux ou quatre semaines) : ce qui est prévu pour chacun, avec les absences et les jours fériés",
    "Exception d'un jour : autre horaire, horaire libre, repos, jour férié travaillé ; note visible sur la case",
    "Modification en masse : sélection de jours, de lignes ou de colonnes, copier-coller d'une journée, recopie d'une semaine sur la suivante",
    "Retour au planning par défaut ; chaque modification est inscrite au journal",
    "Un cycle ou un horaire qui a servi dans un mois clôturé ne change plus de durée : on le duplique",
    "Chaque salarié voit son horaire du jour et ses quatorze prochains jours",
  ]],
  ["Congés et absences", [
    "Demande par motif, sur une période ou une demi-journée ; décompte en jours travaillés, hors jours fériés",
    "Soldes de congés payés (report, acquisition mensuelle, jours pris) et de RTT",
    "Justificatif en photo ou PDF, à accès restreint : le salarié, son responsable, les RH ; chaque consultation est tracée",
    "Annulation d'une demande en attente par le salarié",
    "Saisie directe par les RH (arrêt maladie, par exemple)",
  ]],
  ["Vue annuelle", [
    "Un an jour par jour : travaillé, télétravail, congé payé, RTT, arrêt maladie, autre absence, férié, demande en attente, à régulariser",
    "Totaux par catégorie et heures par mois",
    "Consultable par le responsable et les RH pour chaque salarié",
  ]],
  ["Responsable", [
    "Validation ou refus des journées, une à une ou en lot, avec motif en cas de refus",
    "Validation ou refus des demandes d'absence, avec le solde et les autres absents de l'équipe sur la période",
    "Réouverture d'une journée validée, annulation d'une absence validée, toujours avec motif",
    "Synthèse mensuelle de l'équipe, détail par salarié, export CSV",
    "Planning de son équipe : il le consulte et le modifie, sauf le sien",
    "Nouveau code d'activation pour un salarié de son équipe qui a oublié son mot de passe",
    "Nul ne valide ses propres journées ni ses propres congés",
  ]],
  ["RH", [
    "Fiche salarié : identité, poste, responsable, dates d'entrée et de sortie, début de suivi, horaire ou cycle, mode de présence, soldes",
    "Import de salariés par fichier CSV, avec aperçu avant enregistrement (début de suivi, cycle et mode de présence compris)",
    "Bibliothèque des horaires journaliers et des cycles ; planning de tous les salariés",
    "Vision et validation pour l'ensemble des salariés",
    "Clôture mensuelle : contrôle, figement des chiffres, réouverture motivée, versions successives",
    "Export paie pour Silae : codes et séparateurs réglables",
    "Report des congés en fin d'année ; écritures de solde par fichier (droits RTT de l'année, corrections en nombre)",
    "Journal de toutes les actions, avec vérification d'intégrité",
  ]],
  ["Administration", [
    "Attribution des profils RH et administrateur",
    "Réglages : entreprise, logo, date de mise en service, seuils d'alerte, travail de nuit, lieux de travail, format de l'export paie",
    "Motifs d'absence : libellé, famille, code d'export, justificatif demandé",
    "État de l'installation et autodiagnostic des règles de sécurité",
    "Mode démonstration : jeu de données fictives à charger dans un outil vide, effaçable avant la mise en service",
  ]],
  ["Sécurité et conservation des données", [
    "Aucun accès direct aux données : tout passe par le serveur, qui contrôle la session et les droits à chaque appel",
    "Mots de passe jamais stockés en clair ; session dans un cookie inaccessible aux scripts",
    "Mois clôturé (journées, absences, planning), journal et écritures de solde protégés contre toute modification, y compris par une requête directe sur la base",
    "Mises à jour sans perte : le script d'installation est rejouable et ne supprime aucune donnée",
  ]],
];

// Ce qui est prévu, dans l'ordre des lots de la version 2.
export const A_VENIR = [
  "Annualisation : objectif annuel, réalisé, reste à faire, solde semaine par semaine (version 2.1)",
  "Anomalies liées à l'horaire prévu (retard, départ anticipé, pointage hors plage), avec gravité et traitement (version 2.2)",
  "Pauses pointées : trop courtes, trop longues, non prises (version 2.2)",
  "Tableau des présents en temps réel et liste d'évacuation (version 2.2)",
  "Télétravail sur demande, avec quota ; calendrier d'équipe et planning annuel des congés",
  "Absence à la demi-journée près dans un congé long, demande de modification ou de suppression d'une absence validée",
  "Soldes prévisionnels, congés pris par anticipation, reliquat de l'année précédente ; congés d'ancienneté ; compte épargne-temps",
  "Heures supplémentaires et complémentaires ; heures de nuit, du dimanche et des jours fériés ; astreintes ; tickets restaurant",
  "Temps par activité ; sites et organigramme ; délégation des validations, validation à plusieurs niveaux",
  "Notifications par e-mail ; connexion avec le compte Microsoft",
  "Fiche RH complète et échéances (période d'essai, fin de CDD, visite médicale) ; états standards et sur mesure ; absentéisme par salarié",
];

export const NON_GERE = [
  "Heures supplémentaires majorées et repos compensateur",
  "Majorations de nuit, du dimanche et des jours fériés ; astreintes",
  "Période de référence des congés du 1er juin au 31 mai (les soldes sont tenus en année civile)",
  "Validation à plusieurs niveaux",
  "Connexion avec le compte Microsoft",
  "Badgeuses et contrôle d'accès : le pointage se fait dans l'outil",
];
