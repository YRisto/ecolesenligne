// Endurance : une charge modérée et constante pendant longtemps. On ne cherche pas la limite mais la dérive :
// des temps de réponse qui s'allongent au fil des minutes trahissent une fuite ou une table qui grossit mal.
//
//   k6 run -e BASE=https://exemple.fr -e MDP="…" 06-endurance.js
//
//   RYTHME=4     ouvertures d'application par seconde (500 salariés qui ouvrent l'outil 6 fois par heure font moins d'1 par seconde)
//   DUREE=1200   durée, en secondes (20 minutes par défaut ; une heure donne une meilleure lecture)
import exec from "k6/execution";
import { NB, MDP, identifiant, monNumero, assurerSession, ouvrirSessions, appelSession, appel, pointer, nbPointages, exigerMdp, departEssai, caler, maintenant, parisJour, mois, seuils, resume } from "./lib/kokolio.js";

const RYTHME = +(__ENV.RYTHME || 4), DUREE = +(__ENV.DUREE || 1200);
const TRANCHES = ["1 · premier tiers", "2 · deuxième tiers", "3 · dernier tiers"];

export const options = {
  noCookiesReset: true,
  setupTimeout: "15m",
  scenarios: { endurance: { executor: "constant-arrival-rate", rate: RYTHME, timeUnit: "1s", duration: `${DUREE}s`, preAllocatedVUs: Math.min(NB, 100), maxVUs: NB, gracefulStop: "30s" } },
  thresholds: {
    ...seuils({ courants: ["public/info", "my/month", "my/absences"] }),
    ...Object.fromEntries(TRANCHES.map((t) => [`http_req_duration{tranche:${t}}`, ["p(95)>=0"]])),
    dropped_iterations: ["count==0"],
  },
};

// Avant l'essai, hors mesure : une session par compte (compter deux à quatre minutes pour 500 comptes).
export function setup() { exigerMdp(); const sessions = ouvrirSessions(Array.from({ length: NB }, (_, k) => k + 1)); return { ...departEssai(), sessions }; }

export default function (donnees) {
  caler(donnees);
  const login = identifiant(monNumero()), jour = parisJour(maintenant());
  exec.vu.metrics.tags.tranche = TRANCHES[Math.min(2, Math.floor(((Date.now() - donnees.t0) / 1000 / DUREE) * 3))];
  assurerSession(login, MDP, donnees);
  appel("public/info");
  appelSession(login, MDP, "boot", {});
  appelSession(login, MDP, "my/today", {});
  const r = Math.random();
  if (r < 0.1 && nbPointages() < 16) pointer(login, MDP);
  else if (r < 0.4) appelSession(login, MDP, "my/month", { month: mois(jour) });
  else if (r < 0.55) appelSession(login, MDP, "my/absences", {});
}

export const handleSummary = resume("06-endurance");
