// Suivi au quotidien (responsable, RH) : les anomalies du mois et leur traitement, le tableau des présents et la liste d'évacuation.
import { api } from "./api.js";
import { h, pose, remplir, toast, agir, ouvrir, etiquette, tuile, navMois, frJour, frCourt, frHorodatage, hmAff, paires } from "./dom.js";
import { S, ecran, aller, recharger, moisCourant, heureServeur } from "./etat.js";
import { dialogueCorrection } from "./moi.js";
import { sousSynthese } from "./annuel.js";

const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? "s" : ""}`;
const NIVEAUX = { corriger: ["À corriger", "p-refus"], verifier: ["À vérifier", "p-attente"], info: ["Pour information", "p-neutre"] };
// À l'ouverture, l'écran montre ce qui demande une action : les anomalies « pour information » (retards, pauses…) se consultent d'un geste.
const vue = { niveau: "importantes", etat: "ouvertes", q: "" };
const duNiveau = (r) => !vue.niveau || (vue.niveau === "importantes" ? r.level !== "info" : r.level === vue.niveau);

/* ================= Anomalies ================= */
export function vueAnomalies(espace, mois) {
  const rh = espace === "rh", m = /^\d{4}-\d{2}$/.test(mois) ? mois : moisCourant();
  ecran(() => api("team/anomalies", { month: m, scope: rh ? "all" : "team" }), (d) => {
    const liste = h("div", { class: "pile" });
    const acquitter = async (items, comment, undo) => {
      const r = await api("team/anomaly-ack", { items: items.map((x) => ({ user_id: x.user_id, day: x.date, kind: x.kind })), comment: comment || "", undo: !!undo });
      toast(undo ? `${pluriel(r.done, "acquittement")} annulé${r.done > 1 ? "s" : ""}.` : `${pluriel(r.done, "anomalie")} acquittée${r.done > 1 ? "s" : ""}.`); recharger();
    };
    const demander = (items, titre) => {
      const com = h("textarea", { maxlength: 300, placeholder: "Facultatif. Exemple : rendez-vous médical prévenu, prise de poste décalée d'un commun accord…" });
      ouvrir(titre, [h("p", null, "Acquitter, c'est noter que l'anomalie a été vue et qu'elle n'appelle pas de correction. Aucun chiffre ne change ; c'est inscrit au journal."),
        h("label", null, "Commentaire", com)], "Acquitter", () => acquitter(items, com.value.trim()));
    };
    const dessine = () => {
      const q = vue.q.trim().toLowerCase();
      const rows = d.rows.filter((r) => duNiveau(r) && (vue.etat === "toutes" || (vue.etat === "ouvertes") === !r.ack) && (!q || `${r.name} ${r.team}`.toLowerCase().includes(q)));
      const parSalarie = new Map();
      for (const r of rows) { if (!parSalarie.has(r.user_id)) parSalarie.set(r.user_id, []); parSalarie.get(r.user_id).push(r); }
      const groupes = [...parSalarie.values()].sort((a, b) => a[0].name.localeCompare(b[0].name, "fr"));
      remplir(liste, groupes.length ? groupes.slice(0, 150).map((g) => {
        const infos = g.filter((r) => !r.ack && r.can && r.level === "info");
        return h("div", { class: "carte" }, h("h3", null, `${g[0].name} · ${pluriel(g.length, "anomalie")}`),
          infos.length > 1 ? h("div", { class: "ligne gauche" }, h("button", { class: "petit", onclick: () => demander(infos, `Acquitter ${infos.length} anomalies pour information`) }, `Acquitter les ${infos.length} « pour information »`)) : null,
          g.map((r) => h("div", { class: "jour" },
            h("div", null, h("strong", null, frJour(r.date)), " ", h("span", null, r.label)),
            h("div", null, etiquette(...NIVEAUX[r.level])),
            h("div", { class: "note discret" }, [r.text, r.day ? paires(r.day.times) : null].filter(Boolean).join(" · ")),
            r.ack ? h("div", { class: "note" }, `Acquittée${r.ack.by ? ` par ${r.ack.by}` : ""} le ${frHorodatage(r.ack.at)}${r.ack.comment ? ` : « ${r.ack.comment} »` : ""}`) : null,
            h("div", { class: "actions" },
              r.ack ? etiquette("Acquittée", "p-ok") : null,
              !r.ack && r.can ? h("button", { class: "domaine", onclick: () => demander([r], `${r.label} · ${g[0].name} · ${frJour(r.date)}`) }, "Acquitter") : null,
              r.ack && r.can ? h("button", { onclick: (ev) => agir(ev.currentTarget, () => acquitter([r], "", true)) }, "Annuler l'acquittement") : null,
              rh && r.can && !d.closed && r.day && r.day.status !== "valide" ? h("button", { onclick: () => dialogueCorrection({ jour: { ...r.day, date: r.date }, userId: r.user_id, nom: r.name }) }, "Corriger") : null,
              rh && r.can && !d.closed && !r.day ? h("button", { onclick: () => dialogueCorrection({ date: r.date, userId: r.user_id, nom: r.name }) }, "Renseigner") : null,
              h("button", { class: "lien", onclick: () => aller(`#/${espace}/salarie/${r.user_id}/${m}`) }, "Voir le mois")))));
      }) : h("div", { class: "carte" }, h("p", { class: "vide" }, !d.rows.length ? "Aucune anomalie ce mois-ci." : vue.niveau === "importantes" && vue.etat === "ouvertes" ? "Rien à corriger ni à vérifier." : "Aucune anomalie avec ces filtres."),
          vue.niveau === "importantes" && d.counts.info ? h("div", { class: "ligne gauche" }, h("button", { onclick: () => { vue.niveau = "info"; niveau.value = "info"; dessine(); } }, `Voir les ${d.counts.info} « pour information »`)) : null),
        groupes.length > 150 ? h("p", { class: "discret" }, `Affichage limité à 150 salariés sur ${groupes.length} : affinez la recherche.`) : null);
    };
    const filtre = h("input", { type: "search", value: vue.q, placeholder: "Rechercher un nom ou une équipe", "aria-label": "Rechercher" });
    const niveau = h("select", { value: vue.niveau, "aria-label": "Niveau" }, h("option", { value: "importantes" }, "À corriger et à vérifier"),
      Object.entries(NIVEAUX).map(([v, [l]]) => h("option", { value: v }, l)), h("option", { value: "" }, "Tous les niveaux"));
    const etat = h("select", { value: vue.etat, "aria-label": "Traitement" }, h("option", { value: "ouvertes" }, "À traiter"), h("option", { value: "acquittees" }, "Acquittées"), h("option", { value: "toutes" }, "Toutes"));
    filtre.addEventListener("input", () => { vue.q = filtre.value; dessine(); });
    niveau.addEventListener("change", () => { vue.niveau = niveau.value; dessine(); });
    etat.addEventListener("change", () => { vue.etat = etat.value; dessine(); });
    dessine();
    const c = d.counts;
    pose(h("div", { class: "ligne" }, h("h2", null, rh ? "Anomalies · tous les salariés" : "Anomalies de l'équipe"),
        navMois(m, { min: (S.boot.settings.go_live || "").slice(0, 7), max: moisCourant(), surChange: (x) => aller(`#/${espace}/anomalies/${x}`) })),
      sousSynthese(espace, "anomalies"),
      d.closed ? h("p", { class: "bandeau ok" }, "Mois clôturé : les journées ne se corrigent plus, les anomalies restent consultables et peuvent être acquittées.") : null,
      h("div", { class: "tuiles" }, tuile("À corriger", String(c.corriger), "oublis, pointages hors horaire", c.corriger ? "moins" : ""), tuile("À vérifier", String(c.verifier), "travail pendant une absence"),
        tuile("Pour information", String(c.info), "retards, départs anticipés, pauses"), tuile("Acquittées", String(c.acquittees), "vues, sans correction")),
      h("div", { class: "recherche" }, d.rows.length > 8 ? filtre : null, niveau, etat),
      liste,
      h("p", { class: "discret" }, "Les anomalies sont recalculées à chaque affichage : une journée corrigée fait disparaître les siennes. Les tolérances et le niveau de chaque type se règlent dans Administration › Réglages."));
  });
}

/* ================= Tableau des présents ================= */
const ETATS = { present: "En poste", attendu: "Attendus, pas encore pointés", auto: "Présence automatique (ne pointent pas)", sorti: "Sortis", absent: "Absents", repos: "Non prévus aujourd'hui" };
export function vuePresents(espace) {
  const rh = espace === "rh";
  const charger = () => api("team/presence", { scope: rh ? "all" : "team" });
  ecran(charger, function rendre(d) {
    clearInterval(S.minuteur);
    // le tableau se met à jour seul toutes les minutes, tant que l'écran reste affiché et qu'aucune fenêtre n'est ouverte
    S.minuteur = setInterval(async () => {
      if (document.hidden || document.getElementById("dlg").open || document.body.classList.contains("impression")) return;
      try { rendre(await charger()); } catch { /* prochaine minute */ }
    }, 60000);
    const t = d.tiles, q = vue.q.trim().toLowerCase();
    const rows = d.rows.filter((r) => !q || `${r.name} ${r.team}`.toLowerCase().includes(q));
    const filtre = h("input", { type: "search", value: vue.q, placeholder: "Rechercher un nom ou une équipe", "aria-label": "Rechercher" });
    filtre.addEventListener("input", () => { vue.q = filtre.value; rendre(d); document.querySelector("#vue input[type=search]")?.focus(); });
    const lieu = (r) => (r.lieu === "teletravail" ? etiquette(r.lieu_label, "p-neutre") : r.lieu === "deplacement" ? etiquette(r.lieu_label, "p-attente") : r.lieu_label ? etiquette(r.lieu_label, "p-ok") : null);
    const droite = (r) => (r.status === "present" ? [h("span", { class: "num discret" }, `${r.detail ? r.detail + " " : "depuis "}${hmAff(r.since)}`), lieu(r)]
      : r.status === "sorti" ? h("span", { class: "num discret" }, `départ à ${hmAff(r.since)}`)
      : r.status === "absent" ? h("span", { class: "discret" }, `${r.detail}${r.until && r.until > d.today ? `, jusqu'au ${frCourt(r.until).slice(0, 5)}` : ""}`)
      : [r.detail ? h("span", { class: "discret" }, r.detail) : null, r.late ? etiquette("en retard", "p-refus") : null]);
    const bloc = (etat) => {
      const g = rows.filter((r) => r.status === etat);
      if (!g.length) return null;
      return h("div", { class: "carte" }, h("h3", null, `${ETATS[etat]} (${g.length})`),
        g.map((r) => h("div", { class: "ligne" }, h("span", null, h("button", { class: "lien", onclick: () => aller(`#/${espace}/salarie/${r.user_id}`) }, r.name), r.team ? h("span", { class: "discret" }, ` · ${r.team}`) : null),
          h("span", { class: "ligne gauche" }, droite(r)))));
    };
    pose(h("div", { class: "ligne" }, h("h2", null, rh ? "Présents · tous les salariés" : "Présents dans l'équipe"), h("span", { class: "discret num" }, `à ${d.hm} · mis à jour chaque minute`)),
      sousSynthese(espace, "presents"),
      h("div", { class: "tuiles" }, tuile("Sur site", String(t.on_site), "en poste, hors télétravail"), tuile("Télétravail", String(t.remote), "en poste"), t.travel ? tuile("Déplacement", String(t.travel), "en poste") : null,
        tuile("Attendus", String(t.expected), t.late ? `dont ${t.late} en retard` : "pas encore pointés", t.late ? "moins" : ""), tuile("Absents", String(t.absent), "absence validée"),
        t.auto ? tuile("Sans pointage", String(t.auto), "présence automatique") : null),
      h("div", { class: "recherche sans-impression" }, d.rows.length > 8 ? filtre : null,
        h("button", { class: "domaine pousse", onclick: () => imprimerEvacuation(d) }, "Liste d'évacuation")),
      rows.length ? ["present", "attendu", "auto", "sorti", "absent", "repos"].map(bloc) : h("div", { class: "carte" }, h("p", { class: "vide" }, d.rows.length ? "Aucun résultat." : "Personne dans ce périmètre.")),
      h("p", { class: "discret" }, "D'après les pointages du jour, les absences validées et le planning. Un salarié en présence automatique ne pointe pas : il est supposé présent les jours prévus."));
  });
}

// Liste d'évacuation : les personnes en poste sur site à l'instant, à cocher au point de rassemblement.
// Celles dont la présence n'est pas pointée (présence automatique) sont listées à part, à vérifier.
function imprimerEvacuation(d) {
  const tri = (a, b) => a.team.localeCompare(b.team, "fr") || a.name.localeCompare(b.name, "fr");
  const surSite = d.rows.filter((r) => r.status === "present" && r.lieu !== "teletravail" && r.lieu !== "deplacement").sort(tri);
  const aVerifier = d.rows.filter((r) => r.status === "auto" || (r.status === "attendu" && !r.late)).sort(tri);
  const ligne = (r, note) => h("tr", null, h("td", { class: "case" }, "☐"), h("td", null, h("strong", null, r.name)), h("td", null, r.team || "—"), h("td", { class: "num" }, note));
  const zone = h("div", { class: "imprimable evacuation" },
    h("h2", null, `Liste d'évacuation · ${S.boot.settings.company}`),
    h("p", null, `Établie le ${frCourt(d.today)} à ${heureServeur()}, d'après les pointages. ${pluriel(surSite.length, "personne")} en poste sur site.`),
    h("table", null, h("thead", null, h("tr", null, h("th", null, ""), h("th", null, "Nom"), h("th", null, "Équipe"), h("th", null, "En poste depuis"))),
      h("tbody", null, surSite.length ? surSite.map((r) => ligne(r, hmAff(r.since))) : h("tr", null, h("td", { colspan: 4 }, "Personne n'est pointé sur site.")))),
    aVerifier.length ? [h("h3", null, `À vérifier : présence non pointée (${aVerifier.length})`),
      h("table", null, h("tbody", null, aVerifier.map((r) => ligne(r, r.status === "auto" ? "présence automatique" : "attendu, pas encore pointé"))))] : null,
    h("p", null, "Les personnes en télétravail, en déplacement, absentes ou déjà sorties ne figurent pas sur cette liste. Les visiteurs et les prestataires non plus."));
  const main = document.getElementById("vue");
  main.append(zone); document.body.classList.add("impression");
  const fin = () => { zone.remove(); document.body.classList.remove("impression"); window.removeEventListener("afterprint", fin); };
  window.addEventListener("afterprint", fin);
  window.print();
  setTimeout(fin, 60000);
}
