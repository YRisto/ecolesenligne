// Montée en charge : le rythme des ouvertures d'application augmente par paliers jusqu'à ce que l'outil décroche.
// On lit, palier par palier, le temps de réponse : le dernier palier tenu donne la marge par rapport à l'usage réel.
// L'essai s'arrête de lui-même quand les réponses deviennent trop lentes ou trop souvent en erreur.
//
//   k6 run -e BASE=https://exemple.fr -e MDP="…" 05-montee-en-charge.js
//
//   PALIERS=2,5,10,20,40   ouvertures d'application par seconde, palier après palier (une ouverture = 3 à 4 requêtes)
//   PALIER=60              durée de chaque palier, en secondes
// ATTENTION : c'est l'essai le plus rude. L'environnement de test partage son hébergement avec la production :
// à lancer en dehors des heures de travail.
import exec from "k6/execution";
import { NB, MDP, identifiant, monNumero, assurerSession, ouvrirSessions, appelSession, appel, pointer, nbPointages, exigerMdp, departEssai, caler, maintenant, parisJour, mois, resume } from "./lib/kokolio.js";

const PALIERS = (__ENV.PALIERS || "2,5,10,20,40").split(",").map(Number).filter((x) => x > 0);
const PALIER = +(__ENV.PALIER || 60);
const etiquette = (i) => `${String(i + 1).padStart(2, "0")} · ${PALIERS[i]} par seconde`;

export const options = {
  noCookiesReset: true,
  setupTimeout: "15m",
  scenarios: {
    montee: { executor: "ramping-arrival-rate", startRate: PALIERS[0], timeUnit: "1s", preAllocatedVUs: Math.min(NB, 200), maxVUs: NB,
      // chaque palier : dix secondes pour atteindre le rythme, puis il est tenu
      stages: PALIERS.flatMap((r) => [{ target: r, duration: "10s" }, { target: r, duration: `${PALIER - 10}s` }]), gracefulStop: "30s" },
  },
  // Ici, les temps par écran ne sont pas des seuils à tenir : l'essai va exprès au-delà de la limite. Ils sont relevés pour être lus,
  // palier par palier. Seuls comptent : aucune erreur serveur, et l'arrêt automatique quand l'outil n'est plus utilisable.
  thresholds: {
    kk_erreurs_serveur: ["count==0"],
    http_req_duration: [{ threshold: `p(95)<${+(__ENV.ARRET_P95 || 8000)}`, abortOnFail: true, delayAbortEval: "20s" }],
    kk_erreurs: [{ threshold: `rate<${+(__ENV.ARRET_ERREURS || 0.1)}`, abortOnFail: true, delayAbortEval: "20s" }],
    "http_req_duration{phase:essai}": ["p(95)>=0"],
    ...Object.fromEntries(["public/info", "boot", "my/today", "my/punch", "my/month"].map((r) => [`http_req_duration{route:${r}}`, ["p(95)>=0"]])),
    ...Object.fromEntries(PALIERS.map((_, i) => [`http_req_duration{palier:${etiquette(i)}}`, ["p(95)>=0"]])),
    dropped_iterations: ["count>=0"],
  },
};

export function setup() { exigerMdp(); const sessions = ouvrirSessions(Array.from({ length: NB }, (_, k) => k + 1)); return { ...departEssai(), sessions }; }

export default function (donnees) {
  caler(donnees);
  const login = identifiant(monNumero()), jour = parisJour(maintenant());
  const palier = etiquette(Math.min(PALIERS.length - 1, Math.floor((Date.now() - donnees.t0) / 1000 / PALIER)));
  exec.vu.metrics.tags.palier = palier;   // toutes les requêtes de cette itération portent le palier en cours
  assurerSession(login, MDP, donnees);
  appel("public/info");
  appelSession(login, MDP, "boot", {});
  appelSession(login, MDP, "my/today", {});
  // une ouverture sur six se termine par un pointage (dans la limite de seize par compte et par jour), une sur trois par l'écran des heures
  const r = Math.random();
  if (r < 0.17 && nbPointages() < 16) pointer(login, MDP);
  else if (r < 0.5) appelSession(login, MDP, "my/month", { month: mois(jour) });
}

export const handleSummary = resume("05-montee-en-charge");
