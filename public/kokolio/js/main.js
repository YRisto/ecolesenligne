// Démarrage, navigation entre les espaces, accueil, compte.
import { api, quandSessionPerdue, ENV } from "./api.js";
import { carteOrganigramme, vueOrganigramme } from "./organigramme.js";
import { h, pose, icone, logo, toast, agir, champ, fmtMin, frHorodatage, frCourt, confirmer } from "./dom.js";
import { S, ecran, aller, calerHorloge } from "./etat.js";
import { ecranConnexion, ecranIndisponible } from "./auth.js";
import * as moi from "./moi.js";
import * as equipe from "./equipe.js";
import * as rh from "./rh.js";
import * as admin from "./admin.js";
import * as planning from "./planning.js";
import * as annuel from "./annuel.js";
import * as suivi from "./suivi.js";

const ESPACES = {
  moi: { titre: "Mon espace", onglets: [["pointer", "Pointer"], ["heures", "Heures"], ["absences", "Absences"], ["annee", "Année"]] },
  equipe: { titre: "Mon équipe", onglets: [["validation", "Validation"], ["planning", "Planning"], ["synthese", "Synthèse"]] },
  rh: { titre: "Ressources humaines", onglets: [["salaries", "Salariés"], ["validation", "Validation"], ["planning", "Planning"], ["synthese", "Synthèse"], ["cloture", "Clôture"], ["journal", "Journal"]] },
  admin: { titre: "Administration", onglets: [["versions", "Versions"], ["reglages", "Réglages"], ["motifs", "Motifs"], ["etat", "État"], ["test", "Test"]] },
};
const ROLES = { salarie: "Salarié", rh: "Ressources humaines", admin: "Administrateur" };

function espaces() {
  const me = S.boot.me, out = [];
  if (me.tracked || me.role === "salarie") out.push("moi"); // un compte technique sans horaire n'a pas d'espace de pointage
  if (me.is_manager || me.self_validate) out.push("equipe");
  if (me.role !== "salarie") out.push("rh");
  if (me.role === "admin") out.push("admin");
  return out;
}

/* ---------- démarrage ---------- */
async function demarrer() {
  bandeauTest();   // dès l'ouverture : même si l'environnement ne répond pas, on sait où l'on est
  try { S.info = await api("public/info", null, { silencieux: true }); }
  catch (e) { S.info = S.info || {}; return ecranIndisponible(e, demarrer); }
  const l = logo(S.info.logo_url, "logo-h", S.info.company);
  document.getElementById("logo-h").replaceChildren(...(l ? [l] : []));
  document.title = `Kokolio${ENV === "test" ? " TEST" : ""} · ${S.info.company}`;
  bandeauTest();
  await ouvrirSession();
}
// Dans l'environnement de test, un bandeau permanent dit où l'on est et de quand date la copie des données.
function bandeauTest() {
  const b = document.getElementById("bandeau-test");
  if (ENV !== "test") { b.hidden = true; return; }
  document.querySelector('link[rel="manifest"]')?.remove();   // le test ne s'installe pas comme une application : l'icône ouvrirait la production
  const titre = document.querySelector("header.barre h1");
  if (titre && !titre.querySelector(".marque-test")) titre.insertBefore(h("span", { class: "marque-test" }, "TEST"), titre.querySelector("small"));
  const c = S.info?.cloned;
  b.replaceChildren("Environnement de test", !S.info?.app ? "" : c?.at ? ` · copie de la production du ${frHorodatage(c.at)}` : " · aucune copie de la production pour l'instant",
    h("span", { class: "long" }, " · rien de ce qui est fait ici ne touche la production"), h("a", { href: "/kokolio" }, "Aller à la production"));
  b.hidden = false;
}
// Simulation d'activité (environnement de test, mode démonstration) : tant qu'une page est ouverte, elle fait avancer la simulation
// jusqu'à l'instant présent, sans rien afficher. Le serveur ne fait rien si elle est à jour ou arrêtée.
let dernierPassage = 0;
function passageSimulation() {
  if (!S.info?.simulation || Date.now() - dernierPassage < 5 * 60e3) return;
  dernierPassage = Date.now();
  api("sim/tick", null, { silencieux: true }).catch(() => {});
}
setInterval(() => { if (!document.hidden) passageSimulation(); }, 10 * 60e3);

async function ouvrirSession(message) {
  try { S.boot = await api("boot", null, { silencieux: true }); }
  catch (e) {
    S.boot = null;
    if (e.code === "session") return ecranConnexion(message || "", ouvrirSession);
    return ecranIndisponible(e, demarrer);
  }
  calerHorloge(S.boot.now);
  if (!location.hash || location.hash === "#") history.replaceState(null, "", "#/");
  afficher();
  compterAttente();
  passageSimulation();
}
quandSessionPerdue((e) => {
  if (!S.boot) return;
  S.boot = null; clearInterval(S.minuteur);
  const d = document.getElementById("dlg"); if (d.open) d.close();
  ecranConnexion(e.message, ouvrirSession);
});

// Pastilles « à traiter » de l'accueil et des onglets : chargées à part, sans bloquer l'affichage.
async function compterAttente() {
  const me = S.boot?.me; if (!me) return;
  try {
    if (me.is_manager || me.self_validate) { const p = await api("team/pending", {}); S.attenteEquipe = p.total_days + p.absences.length; }
    // la pastille des RH ne compte que ce qui leur revient : le reste attend chez les responsables
    if (me.role !== "salarie") { const p = await api("team/pending", { scope: "rh" }); S.attenteRH = p.total_days + p.absences.length; }
  } catch { return; }
  majPastilles();
}
S.compterAttente = compterAttente;
function majPastilles() {
  for (const el of document.querySelectorAll("[data-attente]")) {
    const n = el.dataset.attente === "rh" ? S.attenteRH : S.attenteEquipe;
    el.textContent = n || ""; el.hidden = !n;
  }
}

/* ---------- navigation ---------- */
function route() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  return { espace: parts[0] || "", onglet: parts[1] || "", a: parts[2] || "", b: parts[3] || "" };
}
function enTete(r) {
  const me = S.boot.me, liste = espaces();
  document.getElementById("qui").replaceChildren(
    ...(liste.length > 1 && r.espace ? [h("button", { onclick: () => aller("#/") }, "Accueil")] : []),
    h("button", { class: "compte-btn", onclick: () => aller("#/compte"), "aria-label": "Mon compte" }, icone("compte"), h("span", { class: "nom-long" }, me.first_name || me.name)));
}
function navigation(r) {
  const nav = document.getElementById("onglets"), e = ESPACES[r.espace];
  nav.dataset.espace = r.espace;
  if (!e) { nav.replaceChildren(); document.body.classList.add("sans-nav"); return; }
  document.body.classList.remove("sans-nav");
  const actif = { salarie: r.espace === "rh" ? "salaries" : "synthese", fiche: "salaries", import: "salaries", report: "salaries", horaires: "planning", annee: r.espace === "moi" ? "annee" : "synthese", annualisation: r.espace === "moi" ? "annee" : "synthese", anomalies: "synthese", presents: "synthese" }[r.onglet] || r.onglet;
  nav.replaceChildren(...e.onglets.map(([id, lib]) => h("button", { "aria-current": actif === id ? "page" : null, onclick: () => { aller(`#/${r.espace}/${id}`); window.scrollTo(0, 0); } },
    icone(id), lib, id === "validation" ? h("span", { class: "compte", hidden: true, "data-attente": r.espace === "rh" ? "rh" : "equipe" }) : null)));
  majPastilles();
}

function afficher() {
  if (!S.boot) return;
  clearInterval(S.minuteur); S.minuteur = null;
  const r = route(), liste = espaces(), v = document.getElementById("vue");
  if (r.espace === "" && liste.length === 1) { history.replaceState(null, "", `#/${liste[0]}`); return afficher(); }
  if (ESPACES[r.espace] && !liste.includes(r.espace)) { history.replaceState(null, "", "#/"); return afficher(); }
  if (ESPACES[r.espace] && !r.onglet) { history.replaceState(null, "", `#/${r.espace}/${ESPACES[r.espace].onglets[0][0]}`); return afficher(); }
  v.dataset.espace = ESPACES[r.espace] ? r.espace : "";
  document.getElementById("bandeau-demo").hidden = !S.boot.demo;
  enTete(r); navigation(r);
  const large = r.onglet === "annee" || (r.espace !== "moi" && ["synthese", "salaries", "salarie", "import", "report", "journal", "motifs", "planning", "horaires", "annualisation", "anomalies", "presents"].includes(r.onglet));
  v.className = large ? "" : "etroit";
  const k = `${r.espace}/${r.onglet}`;
  const vues = {
    "/": vueAccueil, "compte/": vueCompte, "apropos/": () => admin.vueVersions(true), "organigramme/": vueOrganigramme,
    "moi/pointer": () => moi.vuePointer(), "moi/heures": () => moi.vueHeures(r.a), "moi/absences": () => moi.vueAbsences(), "moi/annee": () => moi.vueAnnee(r.a),
    "equipe/validation": () => equipe.vueValidation("equipe", r.a), "equipe/synthese": () => equipe.vueSynthese("equipe", r.a),
    "equipe/salarie": () => equipe.vueSalarie("equipe", r.a, r.b), "equipe/annee": () => moi.vueAnnee(r.b, r.a, "equipe"),
    "rh/salaries": () => rh.vueSalaries(), "rh/fiche": () => rh.vueFiche(r.a), "rh/import": () => rh.vueImport(), "rh/report": () => rh.vueReport(r.a),
    "rh/validation": () => equipe.vueValidation("rh", r.a), "rh/synthese": () => equipe.vueSynthese("rh", r.a),
    "rh/salarie": () => equipe.vueSalarie("rh", r.a, r.b), "rh/annee": () => moi.vueAnnee(r.b, r.a, "rh"),
    "rh/cloture": () => rh.vueCloture(), "rh/journal": () => rh.vueJournal(r.a),
    "equipe/anomalies": () => suivi.vueAnomalies("equipe", r.a), "rh/anomalies": () => suivi.vueAnomalies("rh", r.a),
    "equipe/presents": () => suivi.vuePresents("equipe"), "rh/presents": () => suivi.vuePresents("rh"),
    "moi/annualisation": () => annuel.vueAnnuelSalarie("moi", null, r.a),
    "equipe/annualisation": () => (r.a === "periode" ? annuel.vueAnnuelEquipe("equipe", r.b) : r.a ? annuel.vueAnnuelSalarie("equipe", r.a, r.b) : annuel.vueAnnuelEquipe("equipe")),
    "rh/annualisation": () => (r.a === "periode" ? annuel.vueAnnuelEquipe("rh", r.b) : r.a ? annuel.vueAnnuelSalarie("rh", r.a, r.b) : annuel.vueAnnuelEquipe("rh")),
    "equipe/planning": () => planning.vuePlanning("equipe", r.a), "rh/planning": () => planning.vuePlanning("rh", r.a), "rh/horaires": () => planning.vueBibliotheque(),
    "admin/reglages": () => admin.vueReglages(), "admin/motifs": () => admin.vueMotifs(), "admin/etat": () => admin.vueEtat(), "admin/versions": () => admin.vueVersions(false),
    "admin/test": () => admin.vueTest(),
  };
  (vues[k] || (() => { history.replaceState(null, "", "#/"); afficher(); }))();
}
S.afficher = afficher;
window.addEventListener("hashchange", () => { window.scrollTo(0, 0); afficher(); });
// Au retour sur l'onglet après une longue absence, l'écran de pointage se remet à jour.
document.addEventListener("visibilitychange", () => { if (!document.hidden && S.boot && route().onglet === "pointer" && !document.getElementById("dlg").open) afficher(); });

/* ---------- accueil ---------- */
function vueAccueil() {
  const me = S.boot.me, liste = espaces();
  const cadre = me.regime === "forfait_jours";
  const tuiles = {
    moi: ["Mon espace", cadre ? "Forfait jours : pointer, suivre mes journées, demander un congé" : `${fmtMin(me.weekly_minutes)} par semaine : pointer, voir mes heures, demander un congé`, cadre ? "cadre" : "salarie", cadre ? "m-cadre" : ""],
    equipe: ["Mon équipe", "Valider les pointages et les congés, planifier, suivre le mois", "equipe", "m-equipe"],
    rh: ["Ressources humaines", "Salariés, validations, planning et cycles, clôture et export paie, journal", "rh", "m-rh"],
    admin: ["Administration", "Fonctionnalités et versions, réglages, motifs d'absence, état de l'outil, environnement de test", "admin", "m-admin"],
  };
  pose(h("div", { class: "bienvenue pile" }, logo(S.boot.settings.logo_url, "logo-g", S.boot.settings.company),
      h("p", { class: "eyebrow" }, S.boot.settings.company), h("h2", null, `Bonjour ${me.first_name || me.name}`)),
    h("div", { class: "modes" }, liste.map((id, i) => {
      const [t, s, ic, cls] = tuiles[id];
      return h("button", { class: `mode ${cls}${liste.length === 3 && i === 2 ? " seul" : ""}`, onclick: () => aller(`#/${id}`) }, icone(ic), h("strong", null, t), h("span", { class: "s" }, s),
        id === "equipe" || id === "rh" ? h("span", { class: "compte", hidden: true, "data-attente": id }) : null);
    }),
      // l'accès à l'environnement de test, bien en vue pour l'administrateur (et, depuis le test, le rappel de l'endroit où l'on est)
      liste.includes("admin") ? h("button", { class: "mode m-test seul", onclick: () => aller("#/admin/test") }, icone("test"),
        h("strong", null, "Environnement de test"),
        h("span", { class: "s" }, ENV === "test" ? "Vous y êtes : une copie de la production, où tout peut être essayé sans risque" : "Une copie complète de l'outil pour essayer sans risque : l'ouvrir, la remettre à l'image de la production")) : null),
    carteOrganigramme({ complet: true }),
    h("p", { class: "pied" }, h("button", { class: "lien", onclick: () => aller("#/apropos") }, `Kokolio ${S.boot.app} · versions et fonctionnalités`)));
  majPastilles();
}

/* ---------- mon compte ---------- */
function vueCompte() {
  ecran(() => Promise.all([api("my/fiche"), api("account/sessions")]), ([f, ses]) => {
    const u = f.user, c = f.current;
    const act = h("input", { type: "password", autocomplete: "current-password", required: true });
    const nv = h("input", { type: "password", autocomplete: "new-password", required: true, minlength: 10 });
    const nv2 = h("input", { type: "password", autocomplete: "new-password", required: true });
    const ok = h("button", { class: "principal", type: "submit" }, "Changer le mot de passe");
    const ligne = (a, b) => (b ? h("div", { class: "ligne" }, h("span", null, a), h("span", { class: "num" }, b)) : null);
    pose(h("h2", null, "Mon compte"),
      h("div", { class: "carte" }, h("h3", null, u.name),
        ligne("Identifiant", u.login), ligne("Profil", ROLES[u.role] + (S.boot.me.is_manager ? " · responsable d'équipe" : "")), ligne("Matricule", u.matricule), ligne("Équipe", u.team), ligne("Poste", u.job),
        ligne("Responsable", u.manager_name), ligne("Date d'entrée", frCourt(u.entry_date)),
        ligne("Temps de travail", c ? (c.regime === "forfait_jours" ? `Forfait de ${c.forfait_days} jours par an` : `${fmtMin(S.boot.me.weekly_minutes)} par semaine${c.cycle ? " en moyenne" : ""}`) : "—"),
        c?.cycle ? ligne("Cycle de travail", c.cycle.name) : null,
        c?.presence === "automatique" ? ligne("Présence", "automatique : vous ne pointez pas") : null,
        h("p", { class: "discret" }, "Une information est inexacte ? Signalez-le au service RH.")),
      h("div", { class: "carte" }, h("h3", null, "Mot de passe"),
        h("form", { class: "pile", novalidate: true, onsubmit: (ev) => { ev.preventDefault(); agir(ok, async () => {
          if (nv.value !== nv2.value) throw new Error("Les deux mots de passe ne sont pas identiques.");
          await api("account/password", { current: act.value, password: nv.value });
          act.value = nv.value = nv2.value = ""; toast("Mot de passe changé. Vos autres appareils ont été déconnectés."); S.afficher();
        }); } }, champ("Mot de passe actuel", act), champ("Nouveau mot de passe", nv, "10 caractères au moins, avec des lettres et des chiffres ou des symboles."), champ("Confirmer", nv2), ok)),
      h("div", { class: "carte" }, h("h3", null, "Appareils connectés"),
        ses.sessions.map((s) => h("div", { class: "ligne" }, h("span", null, appareil(s.ua) + (s.current ? " (cet appareil)" : "")), h("span", { class: "discret num" }, "vu le " + frHorodatage(s.last_seen)))),
        ses.sessions.length > 1 ? h("button", { onclick: (ev) => agir(ev.currentTarget, async () => { await api("account/revoke"); toast("Les autres appareils sont déconnectés."); S.afficher(); }) }, "Déconnecter mes autres appareils") : null),
      h("div", { class: "ligne" },
        h("button", { class: "lien", onclick: () => aller("#/apropos") }, "Versions et fonctionnalités"),
        h("button", { class: "danger", onclick: () => confirmer("Se déconnecter", "Vous devrez saisir votre mot de passe pour revenir.", "Se déconnecter", async () => {
          await api("auth/logout"); S.boot = null; history.replaceState(null, "", "#/"); ecranConnexion("Vous êtes déconnecté.", ouvrirSession);
        }, { danger: true }) }, "Se déconnecter")));
  });
}
function appareil(ua) {
  const os = /iPhone|iPad/.test(ua) ? "iPhone ou iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "Appareil";
  const nav = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "";
  return nav ? `${os} · ${nav}` : os;
}

demarrer();
