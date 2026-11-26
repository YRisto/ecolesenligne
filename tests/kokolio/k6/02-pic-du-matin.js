// Pic du matin : tous les salariés arrivent en quelques minutes, ouvrent l'application et pointent.
// C'est le moment le plus chargé d'une journée ordinaire : une ouverture d'application et un pointage par personne.
//
//   k6 run -e BASE=https://exemple.fr -e MDP="…" 02-pic-du-matin.js
//
//   NB=500      nombre de salariés (un utilisateur virtuel et un compte de charge chacun)
//   DUREE=300   secondes sur lesquelles les arrivées s'étalent, plus denses au milieu
//   MODE=sessions (par défaut) : les sessions sont déjà ouvertes, comme un matin ordinaire (une session dure 90 jours).
//                Avant l'essai, hors mesure, tous les comptes sont connectés (compter deux à quatre minutes pour 500).
//   MODE=lancement : chacun se connecte en arrivant, comme le premier matin d'utilisation ou après une longue coupure.
import { sleep } from "k6";
import { NB, MDP, identifiant, estResponsable, monNumero, assurerSession, appelSession, ouvrirApplication, pointer, pause, exigerMdp,
  departEssai, caler, ouvrirSessions, seuils, resume } from "./lib/kokolio.js";

const DUREE = +(__ENV.DUREE || 300);
const MODE = (__ENV.MODE || "sessions").toLowerCase();

export const options = {
  noCookiesReset: true,
  setupTimeout: "15m",
  scenarios: { matin: { executor: "per-vu-iterations", vus: NB, iterations: 1, maxDuration: `${DUREE + 240}s` } },
  thresholds: seuils({ courants: ["public/info", "page", "team/pending"],
    // la connexion calcule une empreinte coûteuse du mot de passe : c'est voulu, et plus lent que le reste
    extra: MODE === "lancement" ? { "http_req_duration{route:auth/login}": [`p(95)<${+(__ENV.P95_CONNEXION || 3000)}`] } : {} }),
};

export function setup() {
  exigerMdp();
  // matin ordinaire : toutes les sessions sont ouvertes avant le pic, hors mesure
  const sessions = MODE === "lancement" ? {} : ouvrirSessions(Array.from({ length: NB }, (_, k) => k + 1));
  return { ...departEssai(), sessions };
}

export default function (donnees) {
  caler(donnees);
  const i = monNumero(), login = identifiant(i);
  sleep(((Math.random() + Math.random()) / 2) * DUREE);   // l'arrivée : étalée sur la durée, plus dense au milieu
  assurerSession(login, MDP, donnees);                    // mode « lancement » : c'est ici que chacun se connecte
  ouvrirApplication(login, MDP, { page: true });
  if (estResponsable(i)) appelSession(login, MDP, "team/pending", {});   // la pastille des validations en attente
  pause(1, 4);                                            // le temps de trouver le bouton
  pointer(login, MDP);
}

export const handleSummary = resume(`02-pic-du-matin-${MODE}`);
