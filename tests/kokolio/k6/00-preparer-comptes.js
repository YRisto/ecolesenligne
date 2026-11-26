// Préparation des essais de charge : crée dans l'ENVIRONNEMENT DE TEST les comptes fictifs « charge.0001 »… et les active.
// À lancer une fois après chaque copie de la production vers le test (la copie efface ces comptes). Relancé, il ne refait que ce qui manque.
//
//   k6 run -e BASE=https://exemple.fr -e ADMIN_LOGIN=… -e ADMIN_MDP="…" -e MDP="mot de passe des comptes de charge" 00-preparer-comptes.js
//
//   ADMIN_LOGIN / ADMIN_MDP : un compte RH ou administrateur de l'environnement de test (le vôtre) ; il sert à importer les fiches.
//   MDP : le mot de passe que recevront tous les comptes de charge (10 caractères au moins) ; les autres scénarios le redemandent.
//   NB  : nombre de comptes (500 par défaut), par équipes de 25 dont le premier est le responsable.
// Les codes d'activation ne quittent pas la mémoire de k6 : ils servent aussitôt, rien n'est écrit sur le disque.
import { check } from "k6";
import exec from "k6/execution";
import { Counter } from "k6/metrics";
import { BASE, CIBLE, NB, TAILLE_EQUIPE, MDP, identifiant, estResponsable, responsableDe, appel, exigerMdp, parisJour, maintenant, resume } from "./lib/kokolio.js";

const ADMIN = { login: __ENV.ADMIN_LOGIN || "", mdp: __ENV.ADMIN_MDP || "" };
const actives = new Counter("kk_comptes_actives");
const PARALLELE = Math.min(+(__ENV.PARALLELE || 4), NB);

export const options = {
  setupTimeout: "5m",
  noCookiesReset: false,   // chaque activation part sans session
  scenarios: { activation: { executor: "shared-iterations", vus: PARALLELE, iterations: NB, maxDuration: "30m" } },
  thresholds: { kk_erreurs_serveur: ["count==0"], checks: ["rate==1"] },
};

export function setup() {
  exigerMdp();
  if (!ADMIN.login || !ADMIN.mdp) throw new Error("Indiquez un compte RH ou administrateur de l'environnement de test : -e ADMIN_LOGIN=… -e ADMIN_MDP=\"…\"");
  const info = appel("public/info");
  if (!info.ok) throw new Error(`L'environnement ne répond pas (${info.status} ${info.code} ${info.message}).`);
  if (CIBLE === "test" && info.data.environment !== "test") throw new Error("L'adresse visée ne répond pas comme un environnement de test : arrêt.");
  const c = appel("auth/login", { login: ADMIN.login, password: ADMIN.mdp });
  if (!c.ok) throw new Error(`Connexion du compte ${ADMIN.login} refusée : ${c.message || c.code}`);
  // fiches fictives : entrée et début de suivi aujourd'hui, pour ne créer aucun arriéré de journées manquantes
  const jour = parisJour(maintenant()), fr = `${jour.slice(8)}/${jour.slice(5, 7)}/${jour.slice(0, 4)}`;
  const lignes = ["identifiant;nom;prenom;matricule;equipe;poste;responsable;date_entree;regime;heures_hebdo;jours_travailles;debut_suivi"];
  for (let i = 1; i <= NB; i++) {
    const equipe = Math.ceil(i / TAILLE_EQUIPE);
    lignes.push([identifiant(i), "Charge", `Essai ${String(i).padStart(4, "0")}`, `CH${String(i).padStart(4, "0")}`, `Essai de charge ${String(equipe).padStart(2, "0")}`,
      estResponsable(i) ? "Responsable (fictif)" : "Salarié (fictif)", estResponsable(i) ? "" : identifiant(responsableDe(i)), fr, "horaire", "35", "lun-ven", fr].join(";"));
  }
  // seules les fiches absentes sont importées : celles d'une préparation précédente ne sont pas retouchées
  const apercu = appel("rh/import-preview", { text: lignes.join("\n") });
  if (!apercu.ok) throw new Error(`Aperçu de l'import refusé : ${apercu.message || apercu.code}`);
  const presentes = new Set(apercu.data.rows.filter((x) => x.exists).map((x) => x.login));
  const manquantes = [lignes[0], ...lignes.slice(1).filter((l) => !presentes.has(l.split(";")[0]))];
  const codes = {};
  if (manquantes.length > 1) {
    const imp = appel("rh/import", { text: manquantes.join("\n") });
    if (!imp.ok) throw new Error(`Import des fiches refusé : ${imp.message || imp.code}`);
    for (const x of imp.data.created) codes[x.login] = x.code;
  }
  appel("auth/logout");
  console.log(`fiches créées : ${Object.keys(codes).length} · déjà présentes : ${presentes.size} · à activer : ${Object.keys(codes).length}`);
  return { codes };
}

export default function (data) {
  const login = identifiant(exec.scenario.iterationInTest + 1), code = data.codes[login];
  if (!code) return;   // fiche déjà présente avant ce lancement : son mot de passe a été posé lors d'une préparation précédente
  const r = appel("auth/activate", { login, code, password: MDP }, { nom: "auth/activate" });
  if (!check(r, { "auth/activate : compte activé": (x) => x.ok })) {
    // un seul refus suffit à s'arrêter : insister ferait bloquer l'adresse du poste par la protection contre les essais répétés
    exec.test.abort(`Activation de ${login} refusée : ${r.message || r.code}. Rien d'autre n'a été tenté.`);
  }
  actives.add(1);
  appel("auth/logout");
}

export function teardown(data) {
  // contrôle final : le dernier compte se connecte avec le mot de passe de charge
  const r = appel("auth/login", { login: identifiant(NB), password: MDP });
  if (!r.ok) console.error(`ATTENTION : ${identifiant(NB)} ne se connecte pas avec le mot de passe indiqué (${r.message || r.code}). Les comptes existaient-ils déjà avec un autre mot de passe ? Une nouvelle copie de la production vers le test les efface.`);
  else { console.log(`comptes de charge prêts : ${identifiant(1)} à ${identifiant(NB)} (${BASE}, ${CIBLE})`); appel("auth/logout"); }
}

export const handleSummary = resume("00-preparer-comptes");
