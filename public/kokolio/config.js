/* Réglages de l'outil de pointage.
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

  // Adresses de connexion (identifiants Microsoft) des personnes RH : elles voient et valident tout
  rh: ["rh@votreentreprise.fr"],

  // Responsable utilisé quand l'annuaire Microsoft n'indique pas de manager pour un salarié
  managerParDefaut: "rh@votreentreprise.fr",

  // Durée de référence d'une journée, en heures (sert aux écarts dans la synthèse)
  heuresJour: 7,

  // Motifs d'absence proposés
  motifs: ["Congé payé", "RTT", "Maladie", "Congé sans solde", "Événement familial", "Formation", "Autre"]
};
