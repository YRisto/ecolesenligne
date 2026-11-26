// Écrans lourds : ceux qui portent sur tous les salariés (synthèse du mois, anomalies, présents, planning, contrôle de clôture),
// demandés par plusieurs personnes à la fois, sans temps mort. C'est là que le nombre de salariés pèse le plus.
//
//   k6 run -e BASE=https://exemple.fr -e MDP="…" -e RH_LOGIN=… -e RH_MDP="…" 04-ecrans-lourds.js
//
//   SIMULTANES=4   personnes qui enchaînent ces écrans en même temps     DUREE=120 secondes
// Sans compte RH, l'essai se rabat sur les écrans d'équipe des responsables (25 salariés chacun), bien plus légers.
import exec from "k6/execution";
import { MDP, RH, TAILLE_EQUIPE, NB_RESPONSABLES, identifiant, assurerSession, ouvrirSessions, appelSession, exigerMdp, departEssai, caler, maintenant, parisJour, mois, seuils, resume } from "./lib/kokolio.js";

const DUREE = +(__ENV.DUREE || 120), SIMULTANES = +(__ENV.SIMULTANES || 4);
const ECRANS = RH
  ? ["rh/employees", "team/pending", "team/month", "team/anomalies", "team/presence", "plan/grid", "annual/team", "rh/closures", "rh/closure-check", "rh/journal"]
  : ["team/pending", "team/month", "team/anomalies", "team/presence", "plan/grid", "annual/team"];

export const options = {
  noCookiesReset: true,
  setupTimeout: "5m",
  scenarios: { lourds: { executor: "constant-vus", vus: SIMULTANES, duration: `${DUREE}s`, gracefulStop: "60s" } },
  thresholds: seuils({ lourds: ECRANS }),
};
// les seuils des écrans courants ne concernent pas cet essai
for (const r of ["boot", "my/today", "my/punch"]) delete options.thresholds[`http_req_duration{route:${r}}`];

export function setup() {
  if (!RH) exigerMdp();
  const sessions = RH ? ouvrirSessions([], { autres: [RH] }) : ouvrirSessions(Array.from({ length: Math.min(SIMULTANES, NB_RESPONSABLES) }, (_, k) => k * TAILLE_EQUIPE + 1));
  return { ...departEssai(), sessions };
}

export default function (donnees) {
  caler(donnees);
  const jour = parisJour(maintenant()), m = mois(jour);
  const qui = RH || { login: identifiant(((exec.vu.idInTest - 1) % Math.min(SIMULTANES, NB_RESPONSABLES)) * TAILLE_EQUIPE + 1), mdp: MDP };
  const scope = RH ? "all" : "team";
  assurerSession(qui.login, qui.mdp, donnees);
  const corps = {
    "rh/employees": {}, "team/pending": { scope }, "team/month": { month: m, scope }, "team/anomalies": { month: m, scope }, "team/presence": { scope },
    "plan/grid": { scope, from: jour, weeks: 2 }, "annual/team": { scope, period: "" }, "rh/closures": {}, "rh/closure-check": { month: m },
    "rh/journal": { before: "", action: "", q: "", user_id: "" },
  };
  for (const e of ECRANS) appelSession(qui.login, qui.mdp, e, corps[e]);
}

export const handleSummary = resume("04-ecrans-lourds");
