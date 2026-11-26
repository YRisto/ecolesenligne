// Essai de fumée : un seul utilisateur, chaque écran une fois. Il ne mesure pas la charge : il vérifie que l'environnement répond
// correctement à tout ce que les autres scénarios vont demander. À lancer en premier ; s'il échoue, inutile d'aller plus loin.
//
//   k6 run -e BASE=https://exemple.fr -e MDP="…" 01-fumee.js                 (ajouter -e RH_LOGIN=… -e RH_MDP="…" pour les écrans RH)
import http from "k6/http";
import { check, group } from "k6";
import { BASE, PAGE, CIBLE, MDP, RH, identifiant, appel, appelOk, lecture, connecter, deconnecter, exigerMdp, departEssai, caler, maintenant,
  parisJour, plusJours, ouvreAPartirDe, mois, resume } from "./lib/kokolio.js";

export const options = {
  vus: 1, iterations: 1,
  thresholds: { checks: ["rate==1"], kk_erreurs: ["rate==0"], kk_erreurs_serveur: ["count==0"] },
};

export function setup() { exigerMdp(); return departEssai(); }

export default function (donnees) {
  caler(donnees);
  const jour = parisJour(maintenant()), m = mois(jour);

  group("sans session", () => {
    const page = http.get(PAGE, { tags: { route: "page" } });
    check(page, { "page : servie": (r) => r.status === 200 && String(r.body).includes("Kokolio"), "page : politique de sécurité du contenu": (r) => !!r.headers["Content-Security-Policy"] });
    const sante = lecture("health").json();
    check(sante, { "santé : base joignable": (s) => s.ok === true && s.database === "ok", "santé : bon environnement": (s) => s.environment === CIBLE,
      "santé : base et application à la même version": (s) => s.schema === s.schema_expected });
    const info = appelOk("public/info");
    check(info, { "informations publiques : environnement annoncé": (r) => r.data?.environment === CIBLE });
    check(appel("boot", {}, { attendus: ["session"] }), { "sans session : accès refusé (401)": (r) => r.status === 401 });
  });

  group("salarié", () => {
    const login = identifiant(2);   // un salarié d'équipe, pas un responsable
    check(connecter(login, MDP), { "salarié : connecté": (r) => r.ok });
    const b = appelOk("boot");
    check(b, { "boot : mon identité": (r) => r.data?.me?.login === login, "boot : motifs d'absence": (r) => Array.isArray(r.data?.types) && r.data.types.length > 0 });
    appelOk("my/today"); appelOk("my/month", { month: m }); appelOk("my/absences"); appelOk("my/year", { year: +jour.slice(0, 4), user_id: "" }); appelOk("my/fiche");
    appelOk("punch-log", { day: jour, user_id: "" });
    // une demande de congé, de l'aperçu à l'annulation : rien ne reste derrière l'essai
    const debut = ouvreAPartirDe(plusJours(jour, 21 + Math.floor(Math.random() * 40)));
    const fin = plusJours(debut, 4);   // cinq jours de suite : au moins un jour travaillé, même autour d'un jour férié
    const ap = appelOk("my/absence-preview", { type: "cp", start: debut, end: fin, half: "" });
    check(ap, { "congé : l'aperçu compte les jours": (r) => Number(r.data?.days) > 0 });
    const d = appelOk("my/absence-request", { type: "cp", start: debut, end: fin, half: "", comment: "Essai de fumée k6" }, { attendus: ["chevauchement", "conflit"] });
    if (d.ok) check(appelOk("my/absence-cancel", { id: d.data.absence.id }), { "congé : demande annulée": (r) => r.ok });
    // cloisonnement : un salarié n'entre ni dans l'espace RH ni dans l'administration
    check(appel("rh/employees", {}, { attendus: ["interdit"] }), { "salarié : espace RH refusé (403)": (r) => r.status === 403 });
    check(appel("admin/status", {}, { attendus: ["interdit"] }), { "salarié : administration refusée (403)": (r) => r.status === 403 });
    check(appel("admin/test-clone", { confirm: "COPIER" }, { attendus: ["interdit", "etat"] }), { "salarié : copie vers le test refusée": (r) => !r.ok });
    deconnecter();
    check(appel("boot", {}, { attendus: ["session"] }), { "après déconnexion : session close": (r) => r.status === 401 });
  });

  group("responsable", () => {
    check(connecter(identifiant(1), MDP), { "responsable : connecté": (r) => r.ok });
    const b = appelOk("boot");
    check(b, { "boot : une équipe rattachée": (r) => r.data?.me?.is_manager === true && r.data.me.reports === 24 });
    appelOk("team/pending", {}); appelOk("team/month", { month: m, scope: "team" }); appelOk("team/anomalies", { month: m, scope: "team" });
    appelOk("team/presence", { scope: "team" }); appelOk("plan/grid", { scope: "team", from: jour, weeks: 2 }); appelOk("annual/team", { scope: "team", period: "" });
    // un responsable ne voit pas une autre équipe
    check(appel("team/month", { month: m, scope: "all" }, { attendus: ["interdit"] }), { "responsable : vue « tous les salariés » refusée (403)": (r) => r.status === 403 });
    check(appel("rh/employees", {}, { attendus: ["interdit"] }), { "responsable : espace RH refusé (403)": (r) => r.status === 403 });
    deconnecter();
  });

  if (RH) group("RH", () => {
    check(connecter(RH.login, RH.mdp), { "RH : connecté": (r) => r.ok });
    appelOk("boot"); appelOk("rh/employees"); appelOk("team/pending", { scope: "all" }); appelOk("team/month", { month: m, scope: "all" });
    appelOk("team/anomalies", { month: m, scope: "all" }); appelOk("team/presence", { scope: "all" }); appelOk("plan/grid", { scope: "all", from: jour, weeks: 2 });
    appelOk("rh/closures"); appelOk("rh/closure-check", { month: m }); appelOk("rh/journal", { before: "", action: "", q: "", user_id: "" }); appelOk("plan/lib");
    deconnecter();
  });
}

export const handleSummary = resume("01-fumee");
