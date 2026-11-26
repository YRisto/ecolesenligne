// Robustesse : des requêtes anormales ou hostiles, pendant qu'un trafic normal continue.
// On ne mesure pas la vitesse mais la tenue : chaque requête anormale doit recevoir le refus prévu (jamais une erreur du serveur),
// et les utilisateurs normaux ne doivent rien remarquer.
//
//   k6 run -e BASE=https://exemple.fr -e MDP="…" 07-robustesse.js
//
//   DUREE=90          secondes
//   AVEC_BLOCAGE=1    joue aussi la protection par adresse : trente échecs de connexion, puis plus aucune connexion acceptée
//                     depuis le poste pendant dix minutes (dans l'environnement de test seulement). À ne lancer qu'en tout dernier.
// Dans tous les cas, le dernier compte de charge est bloqué un quart d'heure par l'essai de force brute : c'est le comportement attendu.
import http from "k6/http";
import { check, sleep } from "k6";
import { BASE, API, NB, MDP, identifiant, monNumero, assurerSession, ouvrirSessions, appelSession, ouvrirApplication, pause, exigerMdp, departEssai, caler,
  maintenant, parisJour, mois, erreursServeur, HORLOGE_SIMULEE, resume } from "./lib/kokolio.js";

const DUREE = +(__ENV.DUREE || 90), NORMAUX = +(__ENV.NORMAUX || 10), HOSTILES = +(__ENV.HOSTILES || 5);
const AVEC_BLOCAGE = !!__ENV.AVEC_BLOCAGE;
// Sur un banc local seulement, les essais de connexion ratés partent d'une adresse factice, pour ne pas bloquer le reste du banc.
// En ligne, l'hébergeur écrase cet en-tête : c'est bien l'adresse du poste qui compte.
const IP_FACTICE = __ENV.IP_FACTICE ? { "x-real-ip": __ENV.IP_FACTICE } : {};
const INCONNU = "00000000-0000-4000-8000-000000000000";

export const options = {
  noCookiesReset: true,
  setupTimeout: "5m",
  scenarios: {
    normal: { executor: "constant-vus", vus: NORMAUX, duration: `${DUREE}s`, exec: "normal", gracefulStop: "20s" },
    hostile: { executor: "constant-vus", vus: HOSTILES, duration: `${DUREE}s`, exec: "hostile", gracefulStop: "20s" },
    volumineux: { executor: "per-vu-iterations", vus: 1, iterations: 3, exec: "volumineux", maxDuration: `${DUREE}s` },
    force_brute: { executor: "per-vu-iterations", vus: 1, iterations: 1, exec: "forceBrute", startTime: "5s", maxDuration: `${DUREE + 60}s` },
  },
  thresholds: {
    kk_erreurs_serveur: ["count==0"],                          // aucune requête, même absurde, ne doit faire tomber le serveur en erreur
    checks: ["rate==1"],                                       // chaque refus est celui qui était prévu
    "kk_erreurs{profil:normal}": ["rate<0.01"],                // les utilisateurs normaux ne remarquent rien
    "http_req_duration{profil:normal}": [`p(95)<${+(__ENV.P95 || 1000)}`],
    "http_req_duration{profil:hostile}": ["p(95)>=0"],
  },
};

export function setup() {
  exigerMdp();
  // sessions des utilisateurs normaux et des « hostiles » (des salariés ordinaires qui tentent de sortir de leur rôle)
  const sessions = ouvrirSessions(Array.from({ length: NORMAUX + HOSTILES }, (_, k) => k + 2));
  return { ...departEssai(), sessions };
}

/* ---------------------------------------------------------------- trafic normal */
export function normal(donnees) {
  caler(donnees);
  const login = identifiant(((monNumero() - 1) % NORMAUX) + 2), jour = parisJour(maintenant());
  assurerSession(login, MDP, donnees);
  ouvrirApplication(login, MDP, { profil: "normal" });
  appelSession(login, MDP, "my/month", { month: mois(jour) }, { profil: "normal" });
  pause(1, 3);
}

/* ---------------------------------------------------------------- requêtes anormales */
// Une requête brute, hors des habitudes de l'application, et le refus qu'on en attend.
function tente(nom, attendu, { route = "boot", methode = "POST", corps = "{}", entetes = {}, sansEntete = [], jar = null, sansControle = false } = {}) {
  const h = { "Content-Type": "application/json", "x-kokolio": "1", Origin: BASE, ...entetes };
  for (const k of sansEntete) delete h[k];
  if (HORLOGE_SIMULEE) h["x-kk-test-now"] = new Date(maintenant()).toISOString();
  const res = http.request(methode, API + route, methode === "GET" ? null : corps, { headers: h, tags: { route: `anormal : ${nom}`, profil: "hostile" },
    responseCallback: http.expectedStatuses({ min: 200, max: 499 }), ...(jar ? { jar } : {}) });
  let code = "";
  try { code = res.json().code || ""; } catch (e) { code = ""; }
  if (res.status >= 500) erreursServeur.add(1, { route: nom });
  if (sansControle) return { status: res.status, code };
  const ok = res.status === attendu[0] && (attendu[1] === undefined || code === attendu[1]);
  if (!ok && __ENV.BAVARD) console.warn(`${nom} : attendu ${attendu.join(" ")}, reçu ${res.status} ${code} ${String(res.body).slice(0, 100)}`);
  check(res, { [`${nom} → ${attendu.join(" ")}`]: () => ok });
  return { status: res.status, code };
}
const vide = () => new http.CookieJar();   // un visiteur sans aucun cookie
function avecCookie(nom, valeur) { const j = new http.CookieJar(); j.set(BASE, nom, valeur, { path: "/" }); return j; }
const J = (o) => JSON.stringify(o);

const SANS_SESSION = [
  () => tente("sans l'en-tête de l'application", [403, "origine"], { sansEntete: ["x-kokolio"], jar: vide() }),
  () => tente("depuis un autre site", [403, "origine"], { entetes: { Origin: "https://pirate.example" }, jar: vide() }),
  () => tente("sans session", [401, "session"], { jar: vide() }),
  () => tente("cookie de session inventé", [401, "session"], { jar: avecCookie("kkt_session", "a".repeat(64)) }),
  () => tente("cookie de la production présenté au test", [401, "session"], { jar: avecCookie("kk_session", "b".repeat(64)) }),
  () => tente("adresse inconnue", [404, "introuvable"], { route: "nimporte/quoi", jar: vide() }),
  () => tente("adresse à rallonge", [404, "introuvable"], { route: "a/".repeat(200), jar: vide() }),
  () => tente("corps illisible", [400, "requete"], { route: "public/info", corps: "{pas du json", jar: vide() }),
  () => tente("lecture d'une adresse d'écriture", [405, "methode"], { methode: "GET", jar: vide() }),
  () => tente("méthode inattendue", [405], { methode: "PUT", jar: vide() }),
];
// Sous la session d'un salarié ordinaire : sortir de son rôle, lire les données d'un autre, envoyer n'importe quoi.
const SOUS_SESSION = [
  () => tente("salarié → liste des salariés (RH)", [403, "interdit"], { route: "rh/employees" }),
  () => tente("salarié → journal (RH)", [403, "interdit"], { route: "rh/journal" }),
  () => tente("salarié → export paie (RH)", [403, "interdit"], { route: "rh/export", corps: J({ month: "2026-10" }) }),
  () => tente("salarié → import de salariés (RH)", [403, "interdit"], { route: "rh/import", corps: J({ text: "identifiant;nom;role\npirate;Pirate;admin" }) }),
  () => tente("salarié → état de l'installation", [403, "interdit"], { route: "admin/status" }),
  () => tente("salarié → réglages", [403, "interdit"], { route: "admin/settings-save", corps: J({ settings: { company: "Piraté" } }) }),
  () => tente("salarié → synthèse de tous les salariés", [403, "interdit"], { route: "team/month", corps: J({ month: "2026-12", scope: "all" }) }),
  () => tente("salarié → fiche d'un autre", [403, "interdit"], { route: "team/employee", corps: J({ user_id: INCONNU, month: "2026-12" }) }),
  () => tente("salarié → année d'un autre", [403, "interdit"], { route: "my/year", corps: J({ year: 2026, user_id: INCONNU }) }),
  () => tente("salarié → pointages d'un autre", [403, "interdit"], { route: "punch-log", corps: J({ day: "2026-12-01", user_id: INCONNU }) }),
  () => tente("salarié → justificatif d'un autre", [404, "introuvable"], { route: "doc", corps: J({ id: INCONNU }) }),
  () => tente("mois inexistant", [400, "requete"], { route: "my/month", corps: J({ month: "2026-13" }) }),
  () => tente("objet à la place d'un mois", [400, "requete"], { route: "my/month", corps: J({ month: { $gt: "" } }) }),
  () => tente("congé aux dates inversées", [400, "date"], { route: "my/absence-request", corps: J({ type: "cp", start: "2027-03-10", end: "2027-03-01" }) }),
  () => tente("motif d'absence façon injection", [400, "requete"], { route: "my/absence-request", corps: J({ type: "'; drop table users; --", start: "2027-03-10", end: "2027-03-10" }) }),
  () => tente("heures absurdes", [400, "heures"], { route: "my/correct", corps: J({ day: "2026-12-01", times: ["25:99", "aa:bb"], comment: "x" }) }),
  () => tente("validation sans journée", [400, "requete"], { route: "team/decide-days", corps: J({ decision: "valide", items: [] }) }),
  () => tente("justificatif exécutable", [400, "justificatif"], { route: "my/absence-request", corps: J({ type: "maladie", start: "2027-04-06", end: "2027-04-06", doc: { name: "virus.exe", data: "TVqQAGJpbmFpcmU=" } }) }),
];

export function hostile(donnees) {
  caler(donnees);
  const login = identifiant(NORMAUX + ((monNumero() - 1) % HOSTILES) + 2);
  SANS_SESSION[Math.floor(Math.random() * SANS_SESSION.length)]();
  assurerSession(login, MDP, donnees);
  SOUS_SESSION[Math.floor(Math.random() * SOUS_SESSION.length)]();
  sleep(0.2 + Math.random() * 0.5);
}

// Trois envois de plus de 4 Mo : refusés d'emblée, sans être lus jusqu'au bout par l'outil.
export function volumineux(donnees) {
  caler(donnees);
  tente("envoi de 5 Mo", [413, "taille"], { route: "public/info", corps: J({ x: "a".repeat(5000000) }), jar: vide() });
  sleep(2);
}

// Essais répétés sur un compte : il se bloque au cinquième échec, et le bon mot de passe ne passe plus tant qu'il est bloqué.
export function forceBrute(donnees) {
  caler(donnees);
  const cible = identifiant(NB), jar = vide();
  const essai = (nom, attendu, corps) => tente(nom, attendu, { route: "auth/login", corps: J(corps), entetes: IP_FACTICE, jar });
  essai("identifiant façon injection", [401, "identifiants"], { login: "' or 1=1 --", password: "x" });
  essai("mot de passe de 100 000 caractères (refusé sans calcul)", [401, "identifiants"], { login: cible, password: "x".repeat(100000) });
  for (let i = 1; i <= 4; i++) essai(`mauvais mot de passe, essai ${i}`, [401, "identifiants"], { login: cible, password: `Faux-mot-de-passe-${i}` });
  essai("mauvais mot de passe, essai 5 : compte bloqué", [429, "compte_bloque"], { login: cible, password: "Faux-mot-de-passe-5" });
  essai("bon mot de passe sur le compte bloqué", [429, "compte_bloque"], { login: cible, password: MDP });
  // un autre compte, depuis la même adresse, se connecte toujours : six échecs ne suffisent pas à bloquer l'adresse
  essai("un autre compte se connecte toujours", [200], { login: identifiant(NB - 1), password: MDP });
  if (!AVEC_BLOCAGE) return;
  // protection par adresse : au-delà de trente échecs en dix minutes, plus aucune connexion n'est acceptée depuis cette adresse
  let dernier = null, n = 0;
  while (n < 40 && (!dernier || dernier.code !== "ralenti")) {
    n++;
    dernier = tente("échecs en rafale depuis une même adresse", [], { route: "auth/login", corps: J({ login: `inconnu.${n}`, password: "x" }), entetes: IP_FACTICE, jar, sansControle: true });
  }
  check(dernier, { "adresse bloquée après une trentaine d'échecs (429 ralenti)": (d) => d.status === 429 && d.code === "ralenti" && n <= 31 });
  essai("adresse bloquée : même un bon compte attend", [429, "ralenti"], { login: identifiant(NB - 1), password: MDP });
}

export const handleSummary = resume("07-robustesse");
