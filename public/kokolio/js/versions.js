// Fonctionnalités et historique des versions. À mettre à jour à chaque mise en ligne, avec lib/kokolio/version.mjs.
export const VERSIONS = [
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
    "Horaires datés : un changement s'applique à partir de sa date d'effet",
    "Compteur débit-crédit par semaine et par mois ; forfait jours : décompte des journées dans l'année",
    "Pause déduite d'une longue journée pointée sans pause",
    "Jours fériés français pris en compte",
    "Points d'attention : plus de 10 h dans la journée, plus de 48 h dans la semaine, moins de 11 h de repos",
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
    "Nouveau code d'activation pour un salarié de son équipe qui a oublié son mot de passe",
    "Nul ne valide ses propres journées ni ses propres congés",
  ]],
  ["RH", [
    "Fiche salarié : identité, poste, responsable, dates d'entrée et de sortie, horaire, soldes",
    "Import de salariés par fichier CSV, avec aperçu avant enregistrement",
    "Vision et validation pour l'ensemble des salariés",
    "Clôture mensuelle : contrôle, figement des chiffres, réouverture motivée, versions successives",
    "Export paie pour Silae : codes et séparateurs réglables",
    "Report des congés en fin d'année ; écritures de solde par fichier (droits RTT de l'année, corrections en nombre)",
    "Journal de toutes les actions, avec vérification d'intégrité",
  ]],
  ["Administration", [
    "Attribution des profils RH et administrateur",
    "Réglages : entreprise, logo, date de mise en service, seuils d'alerte, lieux de travail, format de l'export paie",
    "Motifs d'absence : libellé, famille, code d'export, justificatif demandé",
    "État de l'installation et autodiagnostic des règles de sécurité",
    "Mode démonstration : jeu de données fictives à charger dans un outil vide, effaçable avant la mise en service",
  ]],
  ["Sécurité et conservation des données", [
    "Aucun accès direct aux données : tout passe par le serveur, qui contrôle la session et les droits à chaque appel",
    "Mots de passe jamais stockés en clair ; session dans un cookie inaccessible aux scripts",
    "Mois clôturé, journal et écritures de solde protégés contre toute modification, y compris par une requête directe sur la base",
    "Mises à jour sans perte : le script d'installation est rejouable et ne supprime aucune donnée",
  ]],
];

export const A_VENIR = [
  "Planning hebdomadaire par modèles d'horaires",
  "Télétravail sur demande, avec quota par semaine",
  "Compte épargne-temps",
  "Cycles de plusieurs semaines et annualisation",
  "Congés d'ancienneté",
  "Suivi des effectifs et des échéances : période d'essai, fin de CDD, visite médicale",
  "Délégation des validations à un remplaçant",
  "Notifications par e-mail",
  "Temps par activité",
];

export const NON_GERE = [
  "Heures supplémentaires majorées et repos compensateur",
  "Travail de nuit, du dimanche, astreintes",
  "Journées de travail qui passent minuit",
  "Période de référence des congés du 1er juin au 31 mai (les soldes sont tenus en année civile)",
  "Validation à plusieurs niveaux",
  "Connexion avec le compte Microsoft",
];
