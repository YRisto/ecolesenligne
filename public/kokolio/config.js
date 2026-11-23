/* Réglages de l'outil de pointage (V2).
   Tant que demo vaut true, l'outil fonctionne avec des données d'exemple,
   sans connexion Microsoft. Passez-le à false une fois les champs remplis. */
window.POINTAGE_CONFIG = {
  demo: true,

  // Identifiants de l'application enregistrée dans Microsoft Entra (voir GUIDE-INSTALLATION.md)
  clientId: "00000000-0000-0000-0000-000000000000",
  tenantId: "00000000-0000-0000-0000-000000000000",

  // Site SharePoint qui stocke les données
  sharepointHost: "votreentreprise.sharepoint.com",
  sitePath: "/sites/Pointage",

  // Identifiants Microsoft des personnes RH : elles voient, valident, clôturent et exportent tout
  rh: ["rh@votreentreprise.fr"],

  // Responsable utilisé quand ni l'annuaire Microsoft ni la fiche salarié n'en indiquent
  managerParDefaut: "rh@votreentreprise.fr",

  // Pause déduite automatiquement quand une journée de plus de pauseSeuilH heures ne comporte aucune pause pointée
  pauseMin: 45,
  pauseSeuilH: 6,

  // Congés payés acquis par mois complet (en jours ouvrés)
  cpParMois: 2.08,

  // Nombre de jours du forfait annuel des cadres au forfait jours
  forfaitJours: 218,

  // Retard signalé au-delà de cette tolérance par rapport à l'horaire planifié (minutes)
  toleranceRetardMin: 10,

  // Envoi d'e-mails (demande à valider, décision). Nécessite l'autorisation Mail.Send.
  notifications: false,

  motifs: ["Congé payé", "RTT", "Arrêt maladie", "Congé sans solde", "Événement familial", "Formation", "Autre"],
  lieux: ["Bureau", "Télétravail", "Déplacement"],
  activites: ["Activité courante", "Réunion", "Formation", "Rendez-vous extérieur"],

  // Modèles d'horaires proposés dans le planning
  modeles: [
    { nom: "Journée", debut: "09:00", fin: "17:00" },
    { nom: "Matin", debut: "07:00", fin: "14:00" },
    { nom: "Après-midi", debut: "13:00", fin: "20:00" },
    { nom: "Repos" }
  ],

  // Codes Silae : à faire confirmer par la personne qui gère la paie
  silae: {
    heures: "HS-HN",
    absences: {
      "Congé payé": "AB-CP", "RTT": "AB-RTT", "Arrêt maladie": "AB-MAL", "Congé sans solde": "AB-CSS",
      "Événement familial": "AB-EVF", "Formation": "AB-FORM", "Autre": "AB-ABS"
    }
  }
};
