// Organigramme : la ligne hiérarchique de l'entreprise, déduite des rattachements des fiches (qui est le responsable de qui).
// On n'y montre que les personnes qui encadrent, avec leur poste et l'effectif de leur équipe, sur trois étages sous la direction générale,
// et la place de celui qui regarde. Aucune liste de salariés : chacun ne voit que la structure.
import { api } from "./api.js";
import { h, remplir } from "./dom.js";
import { S, aller, ecran } from "./etat.js";

let memoire = null, memoireDe = "";
// Une lecture par session ouverte (la structure change rarement) ; relue à la connexion suivante ou sur demande.
export function chargerOrganigramme(force) {
  const moi = S.boot?.me?.id || "";
  if (force || !memoire || memoireDe !== moi) { memoireDe = moi; memoire = api("org/chart", null, { silencieux: true }).catch((e) => { memoire = null; throw e; }); }
  return memoire;
}

const personnes = (n) => `${n} personne${n > 1 ? "s" : ""}`;
function foret(d) {
  const par = new Map(d.nodes.map((n) => [n.id, { ...n, enfants: [] }]));
  const racines = [];
  for (const n of par.values()) { const p = n.manager_id ? par.get(n.manager_id) : null; if (p && p !== n) p.enfants.push(n); else racines.push(n); }
  for (const n of par.values()) n.enfants.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "fr"));
  racines.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "fr"));
  return { par, racines };
}
// La chaîne des responsables de celui qui regarde, du sommet jusqu'à son responsable direct.
function ligneDe(d, par) {
  return [...d.chain].reverse().map((id) => par.get(id)).filter(Boolean);
}
function noeud(n, classe, ici) {
  return h("div", { class: `org-noeud ${classe}${ici ? " ici" : ""}` },
    h("strong", null, n.name || "—"), n.job ? h("small", null, n.job) : null,
    h("span", { class: "n" }, n.direct === n.total ? personnes(n.total) : `${personnes(n.total)}, dont ${n.direct} en direct`));
}
// Une branche : le responsable, puis ses responsables d'équipe, sur « reste » étages. Au-delà, on n'affiche que l'effectif.
function branche(n, niveau, reste, chaine, moi) {
  const ici = chaine.has(n.id) || n.id === moi;
  const carte = noeud(n, `n${niveau}`, ici);
  if (!n.enfants.length || reste <= 0) return h("li", null, carte);
  return h("li", null, h("details", { open: ici || null }, h("summary", null, carte),
    h("ul", { class: `org-n${niveau + 1}` }, n.enfants.map((e) => branche(e, niveau + 1, reste - 1, chaine, moi)))));
}

// Ma place : la suite de mes responsables, en clair.
function maLigne(d, par) {
  const ligne = ligneDe(d, par);
  if (!ligne.length) return null;
  const etape = (n, i) => h("span", { class: "p" + (i === ligne.length - 1 ? " resp" : "") }, h("strong", null, n.name), n.job ? ` · ${n.job}` : "");
  return h("div", { class: "org-fil" }, h("span", { class: "discret" }, "Votre ligne hiérarchique"),
    // chaque responsable garde sa flèche à sa droite, même quand son intitulé passe à la ligne
    ligne.map((n, i) => h("span", { class: "etape" }, etape(n, i), h("span", { class: "sep", "aria-hidden": "true" }, "›"))), h("span", { class: "p moi" }, "Vous"));
}

function dessiner(d, { complet }) {
  const { par, racines } = foret(d);
  if (!racines.length) {
    return S.boot?.me?.role === "salarie" ? null
      : h("section", { class: "carte organigramme" }, h("h3", null, "Organigramme"),
          h("p", { class: "discret" }, "Aucun rattachement n'est encore défini. Indiquez le responsable de chacun sur sa fiche, ou par l'import (colonnes responsable ou matricule_responsable) : l'organigramme se dessine tout seul."));
  }
  const chaine = new Set(d.chain), moi = d.me.id, ligne = maLigne(d, par);
  if (!complet) {
    // version courte, sous l'écran de pointage : ma ligne hiérarchique et un lien vers le reste
    return h("section", { class: "carte organigramme court" }, h("h3", null, "Organigramme"),
      ligne || h("p", { class: "discret" }, par.has(moi) ? `Vous encadrez ${personnes(par.get(moi).total)}.` : "Vous n'êtes rattaché à aucun responsable pour l'instant."),
      h("div", { class: "ligne gauche" }, h("button", { class: "lien", onclick: () => aller("#/organigramme") }, "Voir l'organigramme de l'entreprise")));
  }
  // l'arbre principal (le plus grand), puis celui de celui qui regarde s'il est ailleurs
  const sommetDe = (id) => { let n = par.get(id), garde = 0; while (n?.manager_id && par.get(n.manager_id) && garde++ < 12) n = par.get(n.manager_id); return n; };
  const mien = sommetDe(d.chain[0] || moi);
  const arbres = [racines[0], ...(mien && mien !== racines[0] ? [mien] : [])];
  const autres = racines.filter((r) => !arbres.includes(r));
  const responsables = d.nodes.length;
  return h("section", { class: "carte organigramme" }, h("h3", null, "Organigramme"), ligne,
    arbres.map((r) => h("div", { class: "org" },
      noeud(r, "dg", chaine.has(r.id) || r.id === moi),
      r.enfants.length ? h("ul", { class: "org-n1" }, r.enfants.map((e) => branche(e, 1, 2, chaine, moi))) : null)),
    h("p", { class: "discret" }, `${personnes(d.total)}, ${responsables} responsable${responsables > 1 ? "s" : ""}. Chacun valide les pointages et les congés de son équipe directe ; touchez une direction pour la déplier.`,
      autres.length ? ` ${autres.length} autre${autres.length > 1 ? "s" : ""} équipe${autres.length > 1 ? "s" : ""} ne ${autres.length > 1 ? "sont" : "est"} pas encore rattachée${autres.length > 1 ? "s" : ""} à cette ligne.` : ""));
}

// Une carte qui se remplit toute seule : posée tout de suite dans la page, dessinée quand la réponse arrive.
export function carteOrganigramme({ complet = true } = {}) {
  const boite = h("div", { class: "org-boite" });
  chargerOrganigramme().then((d) => { const c = dessiner(d, { complet }); if (c) remplir(boite, c); }).catch(() => {});
  return boite;
}

// La page entière.
export function vueOrganigramme() {
  ecran(() => chargerOrganigramme(true), (d) => {
    const c = dessiner(d, { complet: true });
    remplir(document.getElementById("vue"), h("h2", null, "Organigramme"), c || h("p", { class: "discret" }, "Aucun rattachement n'est encore défini."),
      h("div", { class: "ligne gauche" }, h("button", { onclick: () => aller("#/") }, "‹ Retour")));
  });
}
