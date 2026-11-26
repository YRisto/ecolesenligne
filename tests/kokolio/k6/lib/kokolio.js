// Outils communs aux scénarios k6 de Kokolio : cible, appels à l'API, comptes de charge, horloge, mesures.
// Tout scénario part, par défaut, vers l'ENVIRONNEMENT DE TEST (adresses /kokolio-test et /api/kokolio-test).
// La production n'est acceptée que sur un banc local (localhost) : on ne charge jamais la production en ligne.
import http from "k6/http";
import { check, sleep } from "k6";
import exec from "k6/execution";
import { Counter, Rate, Trend } from "k6/metrics";

/* ------------------------------------------------------------------ cible */
export const BASE = (__ENV.BASE || "http://localhost:3111").replace(/\/+$/, "");
export const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(BASE);
export const CIBLE = (__ENV.CIBLE || "test").toLowerCase();
if (CIBLE !== "test" && !(CIBLE === "production" && LOCAL)) {
  throw new Error("Ces scénarios ne visent que l'environnement de test (CIBLE=test). CIBLE=production n'est accepté que sur un banc local (BASE=http://localhost:…).");
}
export const API = BASE + (CIBLE === "test" ? "/api/kokolio-test/" : "/api/kokolio/");
export const PAGE = BASE + (CIBLE === "test" ? "/kokolio-test" : "/kokolio");

/* ------------------------------------------------------------------ comptes de charge */
// Comptes fictifs « charge.0001 », « charge.0002 »… créés et activés par 00-preparer-comptes.js, par équipes de 25.
// Le premier de chaque équipe en est le responsable. Tous ont le même mot de passe, choisi par la personne qui lance l'essai (MDP).
export const NB = Math.max(1, Math.min(2000, +(__ENV.NB || 500)));
export const TAILLE_EQUIPE = 25;
export const MDP = __ENV.MDP || "";
export const identifiant = (i) => `charge.${String(i).padStart(4, "0")}`;
export const estResponsable = (i) => (i - 1) % TAILLE_EQUIPE === 0;
export const responsableDe = (i) => i - ((i - 1) % TAILLE_EQUIPE);
export const NB_RESPONSABLES = Math.ceil(NB / TAILLE_EQUIPE);
// Numéro du compte tenu par l'utilisateur virtuel courant : un compte par utilisateur virtuel, toujours le même.
export const monNumero = () => ((exec.vu.idInTest - 1) % NB) + 1;
// Compte RH ou administrateur, facultatif, pour les écrans qui portent sur tous les salariés. Jamais de compte RH partagé :
// la personne qui lance l'essai passe le sien, il n'est lu que par ce script, sur son poste.
export const RH = __ENV.RH_LOGIN && __ENV.RH_MDP ? { login: __ENV.RH_LOGIN, mdp: __ENV.RH_MDP } : null;
export function exigerMdp() {
  if (!MDP) throw new Error("Indiquez le mot de passe des comptes de charge : -e MDP=\"…\" (celui choisi au lancement de 00-preparer-comptes.js).");
}

/* ------------------------------------------------------------------ horloge */
// Décalage de Paris par rapport à UTC, en heures, pour un instant donné (heure d'été du dernier dimanche de mars au dernier d'octobre, 1 h UTC).
function decalageParis(ms) {
  const d = new Date(ms), an = d.getUTCFullYear();
  const dernierDimanche = (mois) => { const f = new Date(Date.UTC(an, mois + 1, 0, 1)); return f.getTime() - f.getUTCDay() * 864e5; };
  return ms >= dernierDimanche(2) && ms < dernierDimanche(9) ? 2 : 1;
}
// Date du jour à Paris (AAAA-MM-JJ) et heure (HH:MM) pour un instant donné.
export function parisJour(ms = maintenant()) { return new Date(ms + decalageParis(ms) * 36e5).toISOString().slice(0, 10); }
export function parisHeure(ms = maintenant()) { return new Date(ms + decalageParis(ms) * 36e5).toISOString().slice(11, 16); }
export const plusJours = (jour, n) => new Date(Date.parse(jour + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
export const jourSemaine = (jour) => new Date(jour + "T12:00:00Z").getUTCDay();   // 0 = dimanche
// Premier jour ouvré (lundi à vendredi) à partir d'une date.
export function ouvreAPartirDe(jour) { let j = jour; while ([0, 6].includes(jourSemaine(j))) j = plusJours(j, 1); return j; }

// Horloge simulée, pour un banc local seulement (le serveur en ligne ignore cet en-tête) :
//   -e HORLOGE=2026-12-01T08:30   instant de départ, heure de Paris
//   -e ACCELERATION=54            une seconde réelle vaut 54 secondes simulées (une journée de 9 h en 10 minutes)
// Sans HORLOGE, l'heure est celle du serveur : les scénarios attendent alors 15 s réelles entre deux pointages d'un même compte.
const HORLOGE = __ENV.HORLOGE || "";
const ACCELERATION = +(__ENV.ACCELERATION || 1);
export const HORLOGE_SIMULEE = !!HORLOGE;
let departReel = 0, departSimule = 0;
if (HORLOGE) {
  const naif = Date.parse(HORLOGE.length === 16 ? HORLOGE + ":00Z" : HORLOGE + "Z");
  if (Number.isNaN(naif)) throw new Error("HORLOGE attend une date et une heure de Paris, par exemple 2026-12-01T08:30");
  departSimule = naif - decalageParis(naif) * 36e5;
}
// À appeler dans setup() puis à transmettre aux utilisateurs virtuels : tous partagent le même instant de départ.
export function departEssai() { return { t0: Date.now() }; }
export function caler(donnees) { departReel = donnees?.t0 || departReel || Date.now(); }
export function maintenant() {
  if (!HORLOGE) return Date.now();
  if (!departReel) departReel = Date.now();
  return departSimule + (Date.now() - departReel) * ACCELERATION;
}
// Secondes réelles à attendre pour que « s » secondes s'écoulent du point de vue du serveur.
export const attenteServeur = (s) => (HORLOGE ? s / ACCELERATION : s);

/* ------------------------------------------------------------------ mesures */
export const erreurs = new Rate("kk_erreurs");                    // réponses inattendues (ni succès, ni refus prévu par le scénario)
export const erreursServeur = new Counter("kk_erreurs_serveur");  // réponses 5xx : il ne doit jamais y en avoir
export const refus = new Counter("kk_refus_metier");              // refus prévus par les règles de gestion (quota de pointages, doublon…)
export const poids = new Trend("kk_taille_reponse_ko");           // taille des réponses, par écran

/* ------------------------------------------------------------------ appels */
// Un appel à l'API, comme le fait l'application : POST JSON, en-tête anti-requête-forgée, origine du site.
//   attendus : codes de refus que le scénario considère comme normaux (ex. ["heures"] quand le quota de pointages du jour est atteint)
//   nom      : nom de l'écran dans les mesures, quand la même adresse sert à deux usages
export function appel(route, corps = {}, { attendus = [], nom = "", entetes = {}, brut = null, profil = "" } = {}) {
  const params = {
    headers: { "Content-Type": "application/json", "x-kokolio": "1", Origin: BASE, ...entetes },
    tags: { route: nom || route, phase: "essai", ...(profil ? { profil } : {}) },
    // un refus de gestion arrive avec un statut 4xx : il n'est compté comme échec HTTP que s'il n'était pas prévu
    responseCallback: http.expectedStatuses(200, ...(attendus.length ? [400, 401, 403, 404, 409, 413, 423, 429] : [])),
  };
  if (HORLOGE) params.headers["x-kk-test-now"] = new Date(maintenant()).toISOString();
  const res = http.post(API + route, brut !== null ? brut : JSON.stringify(corps), params);
  let j = null;
  try { j = res.json(); } catch (e) { j = null; }
  const ok = res.status === 200 && j?.ok === true;
  const prevu = !ok && j && attendus.includes(j.code);
  if (res.status >= 500) erreursServeur.add(1, { route: nom || route });
  if (prevu) refus.add(1, { code: j.code });
  erreurs.add(!ok && !prevu, { route: nom || route, ...(profil ? { profil } : {}) });
  poids.add((res.body ? res.body.length : 0) / 1024, { route: nom || route });
  if (!ok && !prevu && __ENV.BAVARD) console.warn(`${nom || route} → ${res.status} ${j?.code || ""} ${j?.message || String(res.body).slice(0, 120)}`);
  return { ok, prevu, code: j?.code || "", message: j?.message || "", data: j?.data ?? null, status: res.status, res };
}
// Variante qui vérifie aussi le résultat : l'échec d'un contrôle apparaît dans le résumé sous le nom de l'écran.
export function appelOk(route, corps, opt = {}) {
  const r = appel(route, corps, opt);
  check(r, { [`${opt.nom || route} : réponse correcte`]: (x) => x.ok || x.prevu });
  return r;
}
export const lecture = (route, opt = {}) => http.get(API + route, { tags: { route: opt.nom || route }, headers: opt.entetes || {} });

/* ------------------------------------------------------------------ session */
// État de l'utilisateur virtuel courant (chaque utilisateur virtuel a sa propre copie de ces variables).
let session = "";   // identifiant du compte connecté
export function connecter(login, mdp, opt = {}) {
  const r = appel("auth/login", { login, password: mdp }, { nom: "auth/login", ...opt });
  check(r, { "auth/login : connexion acceptée": (x) => x.ok });
  session = r.ok ? login : "";
  return r;
}
export function deconnecter() { if (session) appel("auth/logout", {}); session = ""; http.cookieJar().clear(BASE); }
// Sessions ouvertes d'avance, dans setup() : la connexion calcule exprès une empreinte coûteuse du mot de passe, et cinq cents
// connexions dans la même minute fausseraient la mesure du reste (un matin ordinaire, les sessions existent déjà : elles durent 90 jours).
// Renvoie { identifiant: valeur du cookie }, à transmettre aux utilisateurs virtuels par les données de setup().
const COOKIE = CIBLE === "test" ? "kkt_session" : "kk_session";
const CHEMIN_API = CIBLE === "test" ? "/api/kokolio-test" : "/api/kokolio";
export function ouvrirSessions(numeros, { parallele = +(__ENV.PARALLELE || 4), autres = [] } = {}) {
  const comptes = [...numeros.map((i) => ({ login: identifiant(i), mdp: MDP })), ...autres], sessions = {};
  const entetes = { "Content-Type": "application/json", "x-kokolio": "1", Origin: BASE };
  for (let k = 0; k < comptes.length; k += parallele) {
    const lot = comptes.slice(k, k + parallele);
    if (HORLOGE) entetes["x-kk-test-now"] = new Date(maintenant()).toISOString();
    const reps = http.batch(lot.map((c) => ({ method: "POST", url: API + "auth/login", body: JSON.stringify({ login: c.login, password: c.mdp }),
      params: { headers: entetes, jar: new http.CookieJar(), tags: { route: "auth/login (avant l'essai)" }, responseCallback: http.expectedStatuses(200) } })));
    reps.forEach((r, n) => {
      const v = r.cookies[COOKIE] && r.cookies[COOKIE][0] ? r.cookies[COOKIE][0].value : "";
      // au premier refus on s'arrête : insister ferait bloquer l'adresse du poste par la protection contre les essais répétés
      if (r.status !== 200 || !v) throw new Error(`Connexion de ${lot[n].login} refusée (${r.status} ${String(r.body).slice(0, 160)}). Les comptes de charge sont-ils préparés (00-preparer-comptes.js) avec ce mot de passe ?`);
      sessions[lot[n].login] = v;
    });
  }
  return sessions;
}
// Reprend, pour l'utilisateur virtuel courant, la session ouverte d'avance pour ce compte.
function reprendreSession(donnees, login) {
  const v = donnees && donnees.sessions ? donnees.sessions[login] : "";
  if (!v) return false;
  http.cookieJar().set(BASE, COOKIE, v, { path: CHEMIN_API });
  session = login;
  return true;
}
// Garantit une session pour ce compte : celle ouverte d'avance si elle existe, sinon une connexion (une seule fois par utilisateur virtuel).
export function assurerSession(login, mdp, donnees) {
  if (session === login) return true;
  if (session) deconnecter();
  if (reprendreSession(donnees, login)) return true;
  return connecter(login, mdp).ok;
}
// Appel sous session : si la session a disparu côté serveur (copie de la production vers le test, expiration), on se reconnecte une fois.
export function appelSession(login, mdp, route, corps, opt = {}) {
  let r = appel(route, corps, { ...opt, attendus: [...(opt.attendus || []), "session"] });
  if (r.code === "session") { session = ""; if (!assurerSession(login, mdp)) return r; r = appel(route, corps, opt); }
  check(r, { [`${opt.nom || route} : réponse correcte`]: (x) => x.ok || x.prevu });
  return r;
}

/* ------------------------------------------------------------------ gestes d'un salarié */
let dernierPointage = 0, pointagesFaits = 0;
export const nbPointages = () => pointagesFaits;
// Pointe, en respectant ce que l'outil impose : pas deux pointages d'un même compte en moins de 15 secondes, vingt au plus par jour.
export function pointer(login, mdp, opt = {}) {
  const ecoule = (maintenant() - dernierPointage) / 1000;
  if (dernierPointage && ecoule < 16) sleep(attenteServeur(16 - ecoule));
  const r = appelSession(login, mdp, "my/punch", { lieu: "bureau" }, { ...opt, attendus: ["heures", "verrou", "cloture"] });
  const p = r.data?.punched;
  if (r.ok) { dernierPointage = maintenant(); if (!p?.duplicate) pointagesFaits++; }
  check(r, { "my/punch : pointage enregistré ou refus prévu": (x) => (x.ok && (p?.kind === "arrivee" || p?.kind === "depart" || p?.duplicate === true)) || x.prevu });
  return r;
}
// Ouverture de l'application par un salarié : ce que le navigateur demande réellement.
export function ouvrirApplication(login, mdp, { page = false, profil = "" } = {}) {
  if (page) http.get(PAGE, { tags: { route: "page", phase: "essai" } });
  appel("public/info", {}, { profil });
  const b = appelSession(login, mdp, "boot", {}, { profil });
  const t = appelSession(login, mdp, "my/today", {}, { profil });
  return { boot: b.data, jour: t.data };
}

/* ------------------------------------------------------------------ divers */
// Attend jusqu'à « secondes » après le départ de l'essai (temps réel) : pour enchaîner des phases communes à tous les utilisateurs virtuels.
export function attendreJusqua(secondes) { const reste = (departReel || Date.now()) + secondes * 1000 - Date.now(); if (reste > 0) sleep(reste / 1000); }
export const hasard = (min, max) => min + Math.random() * (max - min);
export const pause = (min, max) => sleep(hasard(min, max));
export const mois = (jour) => jour.slice(0, 7);
// Seuils communs : jamais d'erreur serveur, presque aucune réponse inattendue, des écrans courants fluides.
// Les valeurs se règlent à l'appel (-e P95=1500) : un banc local à deux processeurs n'a pas la capacité de l'hébergement.
export function seuils({ courants = [], lourds = [], extra = {} } = {}) {
  const p95 = +(__ENV.P95 || 1000), lourd = +(__ENV.P95_LOURD || 4000);
  const parEcran = (liste, limite) => Object.fromEntries(liste.map((r) => [`http_req_duration{route:${r}}`, [`p(95)<${limite}`]]));
  return {
    kk_erreurs_serveur: ["count==0"],
    kk_erreurs: [`rate<${__ENV.TAUX_ERREURS || 0.01}`],
    checks: ["rate>0.99"],
    "http_req_duration{phase:essai}": ["p(95)>=0"],   // pour lire les temps de l'essai sans les connexions faites avant lui
    ...parEcran(["boot", "my/today", "my/punch", ...courants], p95),
    ...parEcran(lourds, lourd),
    ...extra,
  };
}
// Résumé en français, en plus de celui de k6 : un fichier par scénario dans resultats/, et l'essentiel à l'écran.
export function resume(nomScenario) {
  return (data) => {
    const m = data.metrics, v = (k, s) => m[k]?.values?.[s];
    const duree = m["http_req_duration{phase:essai}"] ? "http_req_duration{phase:essai}" : "http_req_duration";
    const ms = (x) => (x == null ? "—" : `${Math.round(x)} ms`);
    const routes = Object.keys(m).filter((k) => k.startsWith("http_req_duration{route:")).map((k) => [k.slice(24, -1), m[k].values]).sort((a, b) => (b[1]["p(95)"] || 0) - (a[1]["p(95)"] || 0));
    const seuilsKo = Object.entries(m).flatMap(([k, x]) => Object.entries(x.thresholds || {}).filter(([, t]) => !t.ok).map(([t]) => `${k} : ${t}`));
    const lignes = [
      `\n=== ${nomScenario} · ${CIBLE} · ${BASE} ===`,
      `requêtes : ${v("http_reqs", "count") ?? 0} (${(v("http_reqs", "rate") ?? 0).toFixed(1)}/s) · itérations : ${v("iterations", "count") ?? 0} · utilisateurs virtuels au plus : ${v("vus_max", "max") ?? v("vus_max", "value") ?? "—"}`,
      `temps de réponse, tous écrans : médiane ${ms(v(duree, "med"))} · p95 ${ms(v(duree, "p(95)"))} · maximum ${ms(v(duree, "max"))}${duree === "http_req_duration" ? "" : " (hors connexions faites avant l'essai)"}`,
      `réponses inattendues : ${((v("kk_erreurs", "rate") ?? 0) * 100).toFixed(2)} % · erreurs serveur (5xx) : ${v("kk_erreurs_serveur", "count") ?? 0} · refus de gestion prévus : ${v("kk_refus_metier", "count") ?? 0}`,
      `contrôles réussis : ${(((v("checks", "rate") ?? 1)) * 100).toFixed(2)} % (${v("checks", "passes") ?? 0} sur ${(v("checks", "passes") ?? 0) + (v("checks", "fails") ?? 0)})`,
      ...(routes.length ? ["par écran (p95 décroissant) :"] : []),
      ...routes.map(([r, x]) => `  ${r.padEnd(26)} médiane ${ms(x.med).padStart(8)} · p95 ${ms(x["p(95)"]).padStart(8)} · max ${ms(x.max).padStart(8)}`),
      ...["palier", "tranche", "profil"].flatMap((cle) => {
        const l = Object.keys(m).filter((k) => k.startsWith(`http_req_duration{${cle}:`)).sort().map((k) => [k.slice(19 + cle.length, -1), m[k].values]);
        return l.length ? [`par ${cle} :`, ...l.map(([n, x]) => `  ${n.padEnd(26)} médiane ${ms(x.med).padStart(8)} · p95 ${ms(x["p(95)"]).padStart(8)} · max ${ms(x.max).padStart(8)}`)] : [];
      }),
      ...(m.dropped_iterations ? [`ouvertures non lancées faute d'utilisateur virtuel libre (l'outil ne suivait plus) : ${v("dropped_iterations", "count") ?? 0}`] : []),
      seuilsKo.length ? `SEUILS NON TENUS :\n  ${seuilsKo.join("\n  ")}` : "tous les seuils sont tenus",
      "",
    ];
    const sortie = { stdout: lignes.join("\n") };
    if (__ENV.RESULTATS) sortie[`${__ENV.RESULTATS}/${nomScenario}.json`] = JSON.stringify({ scenario: nomScenario, base: BASE, cible: CIBLE, date: new Date().toISOString(), metrics: data.metrics }, null, 1);
    return sortie;
  };
}
