// Journée type : des salariés consultent et pointent, des responsables valident, les RH suivent — tous en même temps.
// La journée est ramenée à DUREE secondes : arrivée au début, pause de midi au milieu, départ à la fin.
//
//   k6 run -e BASE=https://exemple.fr -e MDP="…" 03-journee-type.js          (ajouter -e RH_LOGIN=… -e RH_MDP="…" pour le profil RH)
//
//   ACTIFS=150       salariés présents en même temps dans l'application (chacun y revient toutes les 5 à 20 secondes)
//   RESPONSABLES=20  responsables d'équipe actifs
//   DUREE=600        durée de l'essai, en secondes
import exec from "k6/execution";
import { NB, MDP, RH, TAILLE_EQUIPE, NB_RESPONSABLES, identifiant, assurerSession, ouvrirSessions, appelSession, ouvrirApplication, pointer, nbPointages, pause, exigerMdp,
  departEssai, caler, maintenant, parisJour, plusJours, ouvreAPartirDe, mois, seuils, resume } from "./lib/kokolio.js";

const DUREE = +(__ENV.DUREE || 600);
const ACTIFS = Math.min(+(__ENV.ACTIFS || 150), NB - NB_RESPONSABLES);
const RESPONSABLES = Math.min(+(__ENV.RESPONSABLES || 20), NB_RESPONSABLES);

export const options = {
  noCookiesReset: true,
  setupTimeout: "15m",
  scenarios: {
    salaries: { executor: "constant-vus", vus: ACTIFS, duration: `${DUREE}s`, exec: "salarie", gracefulStop: "40s" },
    responsables: { executor: "constant-vus", vus: RESPONSABLES, duration: `${DUREE}s`, exec: "responsable", gracefulStop: "40s" },
    ...(RH ? { rh: { executor: "constant-vus", vus: +(__ENV.RH_ACTIFS || 2), duration: `${DUREE}s`, exec: "rh", gracefulStop: "40s" } } : {}),
  },
  thresholds: seuils({
    courants: ["public/info", "my/month", "my/absences", "my/year", "my/fiche", "my/absence-preview", "my/absence-request", "my/absence-cancel", "team/decide-days", "team/decide-absence"],
    lourds: ["team/pending", "team/month", "team/anomalies", "team/presence", "plan/grid", ...(RH ? ["rh/employees", "rh/closures", "rh/journal", "RH team/month", "RH team/anomalies", "RH team/presence", "RH team/pending"] : [])],
  }),
};

// Avant l'essai, hors mesure : les sessions de tous ceux qui vont agir (salariés, responsables, compte RH).
export function setup() {
  exigerMdp();
  const numeros = [];
  for (let k = 0; k < ACTIFS; k++) numeros.push(salarieDeRang(k));
  for (let k = 0; k < RESPONSABLES; k++) numeros.push(k * TAILLE_EQUIPE + 1);
  const sessions = ouvrirSessions(numeros, { autres: RH ? [RH] : [] });
  return { ...departEssai(), sessions };
}
const fraction = (donnees) => Math.min(1, (Date.now() - donnees.t0) / 1000 / DUREE);

/* ---------------------------------------------------------------- salarié */
// Un compte par utilisateur virtuel, pris parmi ceux qui ne sont pas responsables.
function salarieDeRang(k) { return k + Math.floor(k / (TAILLE_EQUIPE - 1)) + 2; }   // on saute le premier de chaque équipe (le responsable)
const numeroSalarie = () => salarieDeRang((exec.vu.idInTest - 1) % ACTIFS);
// Les quatre pointages de la journée, à des moments propres à chacun.
const moments = [Math.random() * 0.12, 0.42 + Math.random() * 0.1, 0.56 + Math.random() * 0.08, 0.86 + Math.random() * 0.1];
let demande = null;   // une demande de congé laissée en attente, pour que les responsables aient de quoi décider

export function salarie(donnees) {
  caler(donnees);
  const login = identifiant(numeroSalarie()), f = fraction(donnees), jour = parisJour(maintenant());
  assurerSession(login, MDP, donnees);
  ouvrirApplication(login, MDP, { profil: "salarie" });
  if (nbPointages() < moments.filter((m) => f >= m).length) pointer(login, MDP);
  const r = Math.random();
  if (r < 0.30) appelSession(login, MDP, "my/month", { month: mois(jour) });
  else if (r < 0.45) appelSession(login, MDP, "my/absences", {});
  else if (r < 0.52) appelSession(login, MDP, "my/year", { year: +jour.slice(0, 4), user_id: "" });
  else if (r < 0.57) appelSession(login, MDP, "my/fiche", {});
  else if (r < 0.63) {
    // une demande de congé : aperçu, puis dépôt ; deux fois sur trois le salarié se ravise et l'annule
    const debut = ouvreAPartirDe(plusJours(jour, 14 + Math.floor(Math.random() * 120))), fin = plusJours(debut, Math.floor(Math.random() * 4));
    const ap = appelSession(login, MDP, "my/absence-preview", { type: "cp", start: debut, end: fin, half: "" }, { attendus: ["date"] });
    if (ap.ok && Number(ap.data.days) > 0 && !demande) {
      const d = appelSession(login, MDP, "my/absence-request", { type: "cp", start: debut, end: fin, half: "", comment: "Essai de charge k6" }, { attendus: ["chevauchement", "conflit", "date", "solde"] });
      if (d.ok) {
        if (Math.random() < 0.66) { pause(2, 6); appelSession(login, MDP, "my/absence-cancel", { id: d.data.absence.id }, { attendus: ["etat", "conflit", "introuvable"] }); }
        else demande = d.data.absence.id;
      }
    }
  }
  pause(5, 20);
}

/* ---------------------------------------------------------------- responsable */
const numeroResponsable = () => ((exec.vu.idInTest - 1) % RESPONSABLES) * TAILLE_EQUIPE + 1;

export function responsable(donnees) {
  caler(donnees);
  const login = identifiant(numeroResponsable()), jour = parisJour(maintenant());
  assurerSession(login, MDP, donnees);
  ouvrirApplication(login, MDP, { profil: "responsable" });
  if (nbPointages() < moments.filter((m) => fraction(donnees) >= m).length) pointer(login, MDP);
  const p = appelSession(login, MDP, "team/pending", {});
  if (p.ok) {
    // valider les journées terminées et sans alerte d'un salarié de l'équipe (jamais la journée en cours)
    const prets = p.data.groups.filter((g) => !g.own && g.days.some((d) => d.state === "ok" && d.date < jour && !d.alerts.length));
    if (prets.length && Math.random() < 0.6) {
      const g = prets[Math.floor(Math.random() * prets.length)];
      const items = g.days.filter((d) => d.state === "ok" && d.date < jour && !d.alerts.length).map((d) => ({ id: d.id, version: d.version }));
      appelSession(login, MDP, "team/decide-days", { decision: "valide", reason: "", items }, { attendus: ["conflit", "verrou", "etat"] });
    }
    // décider une demande de congé en attente : acceptée neuf fois sur dix
    const enAttente = p.data.absences.filter((a) => !a.own);
    if (enAttente.length && Math.random() < 0.7) {
      const a = enAttente[Math.floor(Math.random() * enAttente.length)], accord = Math.random() < 0.9;
      appelSession(login, MDP, "team/decide-absence", { id: a.id, decision: accord ? "valide" : "refuse", reason: accord ? "" : "Trop d'absents cette semaine-là (essai de charge)", version: a.version },
        { attendus: ["conflit", "etat", "introuvable", "verrou"] });
    }
  }
  const r = Math.random();
  if (r < 0.35) appelSession(login, MDP, "team/month", { month: mois(jour), scope: "team" });
  else if (r < 0.60) appelSession(login, MDP, "team/anomalies", { month: mois(jour), scope: "team" });
  else if (r < 0.85) appelSession(login, MDP, "team/presence", { scope: "team" });
  else appelSession(login, MDP, "plan/grid", { scope: "team", from: jour, weeks: 2 });
  pause(8, 25);
}

/* ---------------------------------------------------------------- RH */
export function rh(donnees) {
  caler(donnees);
  const jour = parisJour(maintenant()), m = mois(jour);
  assurerSession(RH.login, RH.mdp, donnees);
  appelSession(RH.login, RH.mdp, "boot", {}, { profil: "rh" });
  const ecrans = [
    () => appelSession(RH.login, RH.mdp, "rh/employees", {}),
    () => appelSession(RH.login, RH.mdp, "team/pending", { scope: "all" }, { nom: "RH team/pending" }),
    () => appelSession(RH.login, RH.mdp, "team/month", { month: m, scope: "all" }, { nom: "RH team/month" }),
    () => appelSession(RH.login, RH.mdp, "team/anomalies", { month: m, scope: "all" }, { nom: "RH team/anomalies" }),
    () => appelSession(RH.login, RH.mdp, "team/presence", { scope: "all" }, { nom: "RH team/presence" }),
    () => appelSession(RH.login, RH.mdp, "rh/closures", {}),
    () => appelSession(RH.login, RH.mdp, "rh/journal", { before: "", action: "", q: "", user_id: "" }),
  ];
  ecrans[Math.floor(Math.random() * ecrans.length)]();
  pause(10, 30);
}

export const handleSummary = resume("03-journee-type");
