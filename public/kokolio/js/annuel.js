// Annualisation : objectif, réalisé, reste à faire et solde semaine par semaine — pour soi, pour son équipe, pour tous (RH).
import { api } from "./api.js";
import { h, pose, toast, ouvrir, tuile, champ, telecharger, fmtMin, fmtEcart, fmtNb, frCourt, classeEcart, lireDuree } from "./dom.js";
import { S, ecran, aller, recharger, estRH } from "./etat.js";

const EFFETS = { retire: "retirées de l'objectif", realise: "comptées comme réalisées", neutre: "laissées à faire" };
// Heures saisies à la main, avec un signe possible : « 12 », « -7:30 », « 3,5 ».
function lireHeures(txt) {
  const s = String(txt ?? "").trim().replace("−", "-"), neg = s.startsWith("-");
  const m = lireDuree(s.replace(/^[+-]/, ""));
  return Number.isNaN(m) ? NaN : neg ? -m : m;
}
// Durée qui peut dépasser 99 heures : « 1 607 h 00 ».
const fmtGrand = (m) => { const a = Math.abs(Math.round(m)); return `${m < 0 ? "− " : ""}${Math.floor(a / 60).toLocaleString("fr-FR")} h ${String(a % 60).padStart(2, "0")}`; };

// Sous-onglets de « Synthèse » : le mois, les anomalies, les présents, et l'annualisation dès qu'une période existe (les RH la voient toujours, pour créer la première).
export const sousSynthese = (espace, actif) => h("div", { class: "sous" },
  [["mois", "Mois", "synthese"], ["anomalies", "Anomalies", "anomalies"], ["presents", "Présents", "presents"], ...(S.boot.annual || estRH() ? [["annualisation", "Annualisation", "annualisation"]] : [])]
    .map(([id, lib, route]) => h("button", { "aria-current": actif === id ? "page" : null, onclick: () => aller(`#/${espace}/${route}`) }, lib)));
export const sousAnnee = (actif) => (S.boot.annual && S.boot.me.annualise ? h("div", { class: "sous" },
  h("button", { "aria-current": actif === "annee" ? "page" : null, onclick: () => aller("#/moi/annee") }, "Calendrier"),
  h("button", { "aria-current": actif === "annualisation" ? "page" : null, onclick: () => aller("#/moi/annualisation") }, "Annualisation")) : null);

const choixPeriode = (d, surChange) => (d.periods.length > 1 ? h("select", { value: d.period.id, "aria-label": "Période", onchange: (ev) => surChange(ev.target.value) },
  d.periods.map((p) => h("option", { value: p.id }, `${p.label} · ${frCourt(p.start_date)} → ${frCourt(p.end_date)}`))) : null);

/* ================= Un salarié ================= */
export function vueAnnuelSalarie(espace, userId, periode) {
  const moi = espace === "moi";
  ecran(() => api("annual/employee", { user_id: moi ? "" : userId, period: periode || "" }), (d) => {
    const retour = moi ? null : h("button", { class: "lien", onclick: () => aller(`#/${espace}/annualisation`) }, "‹ Annualisation de l'équipe");
    if (!d.period) return pose(moi ? sousAnnee("annualisation") : retour, h("h2", null, "Annualisation"),
      h("div", { class: "carte" }, h("p", { class: "vide" }, "Aucune période d'annualisation n'est définie pour l'instant.")));
    const vers = (p) => aller(moi ? `#/moi/annualisation/${p}` : `#/${espace}/annualisation/${userId}/${p}`);
    const entete = [moi ? sousAnnee("annualisation") : retour,
      h("div", { class: "ligne" }, h("div", { class: "pile" }, h("h2", null, moi ? "Mon annualisation" : `Annualisation · ${d.user.name}`),
        h("p", { class: "discret" }, `${d.period.label} · du ${frCourt(d.period.start_date)} au ${frCourt(d.period.end_date)}`)), choixPeriode(d, vers))];
    if (!d.annual) return pose(entete, h("div", { class: "carte" }, h("p", { class: "vide" }, moi ? "Vous ne suivez pas de cycle annualisé sur cette période." : "Ce salarié ne suit pas de cycle annualisé sur cette période."),
      d.can_rh ? h("p", { class: "discret" }, "Un salarié est annualisé quand il suit un cycle marqué « annualisé » (Planning › Horaires et cycles), attribué depuis sa fiche.") : null));
    const ligne = (a, b, cls) => h("div", { class: "ligne" }, h("span", null, a), h("span", { class: "num " + (cls || "") }, b));
    const signe = (m) => (m > 0 ? "+ " : m < 0 ? "− " : "") + fmtGrand(Math.abs(m));
    pose(entete,
      h("div", { class: "tuiles" },
        tuile("Objectif", fmtGrand(d.objective), d.goal_set ? "fixé par les RH" : "d'après le planning"),
        tuile("Réalisé", fmtGrand(d.done), `au ${frCourt(d.today < d.period.end_date ? d.today : d.period.end_date)}`),
        tuile("Reste à faire", fmtGrand(Math.max(0, d.remaining)), d.remaining < 0 ? `objectif dépassé de ${fmtGrand(-d.remaining)}` : "d'ici la fin de la période"),
        tuile("Prévision", fmtEcart(d.gap), d.gap === 0 ? "pile sur l'objectif en fin de période" : d.gap > 0 ? "au-dessus de l'objectif en fin de période" : "en dessous de l'objectif en fin de période", classeEcart(d.gap)),
        tuile("Solde", fmtEcart(d.balance), "réalisé moins prévu, à ce jour", classeEcart(d.balance))),
      h("div", { class: "carte" }, h("h3", null, "D'où vient l'objectif"),
        d.goal_set ? ligne(`Objectif fixé par les RH${d.goal_note ? ` (${d.goal_note})` : ""}`, fmtGrand(d.base)) : ligne("Heures planifiées sur la période, d'après le cycle et le planning", fmtGrand(d.base)),
        d.entries.map((e) => ligne(`Ajustement du ${frCourt(e.day)} : ${e.reason}`, signe(e.minutes), e.minutes < 0 ? "moins" : "")),
        d.absences.filter((a) => a.mode === "retire").map((a) => ligne(`${a.label} : heures retirées de l'objectif`, signe(-a.minutes), "moins")),
        h("div", { class: "ligne" }, h("strong", null, "Objectif de la période"), h("strong", { class: "num" }, fmtGrand(d.objective))),
        d.absences.filter((a) => a.mode !== "retire").map((a) => h("p", { class: "discret" }, `${a.label} : ${fmtGrand(a.minutes)} ${EFFETS[a.mode]}.`)),
        d.goal_set ? h("p", { class: "discret" }, `Pour mémoire, le planning prévoit ${fmtGrand(d.planned)} sur la période.`) : null,
        h("p", { class: "discret" }, `Prévision de fin de période : ${fmtGrand(d.done)} réalisées + ${fmtGrand(d.planned_rest)} encore planifiées = ${fmtGrand(d.forecast)}.`),
        d.can_rh ? h("div", { class: "ligne gauche" },
          h("button", { onclick: () => dialogueObjectif(d) }, d.goal_set ? "Modifier l'objectif" : "Fixer l'objectif"),
          h("button", { onclick: () => dialogueAjustement(d) }, "Ajouter un ajustement")) : null),
      h("div", { class: "carte" }, h("h3", null, "Semaine par semaine"),
        h("div", { class: "table-zone" }, h("table", null,
          h("thead", null, h("tr", null, h("th", null, "Semaine"), h("th", { class: "d" }, "Prévu"), h("th", { class: "d" }, "Réalisé"), h("th", { class: "d" }, "Écart"), h("th", { class: "d" }, "Solde cumulé"))),
          h("tbody", null, d.weeks.map((w) => h("tr", { class: w.current ? "courante" : w.counted ? "" : "avenir" },
            h("td", null, `${frCourt(w.from).slice(0, 5)} → ${frCourt(w.to).slice(0, 5)}`, w.current ? h("span", { class: "pastille p-neutre ml" }, "en cours") : null),
            h("td", { class: "d num" }, fmtMin(w.planned)), h("td", { class: "d num" }, w.counted ? fmtMin(w.done) : "—"),
            h("td", { class: "d num " + (w.counted ? classeEcart(w.balance) : "") }, w.counted ? fmtEcart(w.balance) : "—"),
            h("td", { class: "d num " + (w.counted ? classeEcart(w.cumul) : "") }, w.counted ? fmtEcart(w.cumul) : "—")))))),
        h("p", { class: "discret" }, "Prévu : ce que le planning attend, absences déduites. Écart : réalisé moins prévu sur les jours passés. Le solde cumulé additionne les écarts depuis le début de la période.")));
  });
}

function dialogueObjectif(d) {
  const heures = h("input", { type: "text", inputmode: "decimal", value: d.goal_set ? fmtNb(d.base / 60) : "", placeholder: `Exemple : ${fmtNb(Math.round(d.planned / 60))}` });
  const note = h("input", { type: "text", maxlength: 200, value: d.goal_note || "", placeholder: "Exemple : prorata d'un 1 607 h, entrée en cours d'année" });
  ouvrir(`Objectif de ${d.user.name}`, [
    h("p", { class: "discret" }, `${d.period.label}. Le planning prévoit ${fmtGrand(d.planned)} sur la période : c'est l'objectif retenu tant que vous n'en fixez pas un.`),
    champ("Objectif en heures", heures, "Vide : revenir à l'objectif calculé d'après le planning. Les absences continuent de le réduire selon le réglage de chaque motif."), champ("Note", note),
  ], "Enregistrer", async () => {
    const txt = heures.value.trim().replace(/\s/g, "").replace(",", ".");
    const minutes = txt === "" ? null : Math.round(Number(txt) * 60);
    if (minutes != null && (!Number.isFinite(minutes) || minutes < 0)) throw new Error("Nombre d'heures illisible (exemple : 1607 ou 1204,5).");
    await api("annual/goal", { user_id: d.user.id, period_id: d.period.id, minutes, note: note.value.trim() });
    toast(minutes == null ? "Objectif recalculé d'après le planning." : "Objectif enregistré."); recharger();
  });
}
function dialogueAjustement(d) {
  const jour = h("input", { type: "date", value: d.today >= d.period.start_date && d.today <= d.period.end_date ? d.today : d.period.start_date, min: d.period.start_date, max: d.period.end_date, required: true });
  const heures = h("input", { type: "text", inputmode: "decimal", placeholder: "Exemple : -7 ou 3:30", required: true });
  const motif = h("input", { type: "text", maxlength: 200, required: true, placeholder: "Exemple : heures de délégation, régularisation" });
  ouvrir(`Ajuster l'objectif de ${d.user.name}`, [h("div", { class: "grille2" }, champ("Date", jour), champ("Heures (négatif pour retirer)", heures)), champ("Motif", motif),
    h("p", { class: "discret" }, "Un ajustement ne se modifie pas : pour corriger, passez l'ajustement inverse. Il est inscrit au journal.")], "Ajouter", async () => {
    const m = lireHeures(heures.value);
    if (Number.isNaN(m) || m === 0) throw new Error("Nombre d'heures illisible (exemples : -7, 3:30, 2,5).");
    await api("annual/entry", { user_id: d.user.id, period_id: d.period.id, day: jour.value, minutes: m, reason: motif.value.trim() });
    toast("Ajustement ajouté."); recharger();
  });
}

/* ================= L'équipe ================= */
const filtreEquipe = { valeur: null };
export function vueAnnuelEquipe(espace, periode) {
  const rh = espace === "rh";
  ecran(() => api("annual/team", { scope: rh ? "all" : "team", period: periode || "", ...(rh && filtreEquipe.valeur != null ? { team: filtreEquipe.valeur } : {}) }), (d) => {
    const titre = h("div", { class: "ligne" }, h("h2", null, rh ? "Annualisation · tous les salariés" : "Annualisation de l'équipe"),
      d.period ? choixPeriode(d, (p) => aller(`#/${espace}/annualisation/periode/${p}`)) : null);
    const periodes = rh ? cartePeriodes(d) : null;
    if (!d.period) return pose(titre, sousSynthese(espace, "annualisation"),
      h("div", { class: "carte" }, h("p", { class: "vide" }, "Aucune période d'annualisation n'est définie."),
        rh ? h("p", { class: "discret" }, "Créez une période de référence (par exemple l'année civile). Seront annualisés les salariés qui suivent un cycle marqué « annualisé » dans Planning › Horaires et cycles.") : null), periodes);
    const equipe = rh && d.teams.length > 1 ? h("select", { value: d.team ?? "", "aria-label": "Équipe", onchange: (ev) => { filtreEquipe.valeur = ev.target.value === "__toutes__" ? null : ev.target.value; recharger(); } },
      h("option", { value: "__toutes__", selected: d.team == null }, "Toutes les équipes"), d.teams.map((t) => h("option", { value: t, selected: d.team === t }, t || "Sans équipe"))) : null;
    const csv = () => {
      const lignes = [["Salarié", "Équipe", "Cycle", "Objectif (heures)", "Réalisé (heures)", "Reste à faire (heures)", "Écart prévu en fin de période (heures)", "Solde à ce jour (heures)"],
        ...d.rows.map((r) => [r.name, r.team, r.cycle, fmtNb(r.objective / 60), fmtNb(r.done / 60), fmtNb(r.remaining / 60), fmtNb(r.gap / 60), fmtNb(r.balance / 60)])];
      telecharger(`annualisation-${d.period.start_date}.csv`, "﻿" + lignes.map((l) => l.map((c) => { const s = String(c ?? ""); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(";")).join("\r\n") + "\r\n");
    };
    pose(titre, sousSynthese(espace, "annualisation"),
      h("p", { class: "discret" }, `${d.period.label} · du ${frCourt(d.period.start_date)} au ${frCourt(d.period.end_date)}`),
      d.need_team ? h("p", { class: "bandeau info" }, h("strong", null, `${d.total} salariés annualisés`), "Choisissez une équipe pour afficher le détail.") : null,
      d.rows.length ? h("div", { class: "tuiles" },
        tuile("Annualisés", String(d.totals.employees), rh ? "sur la période" : "dans l'équipe"), tuile("Objectif", fmtGrand(d.totals.objective), "total"),
        tuile("Réalisé", fmtGrand(d.totals.done), `au ${frCourt(d.today < d.period.end_date ? d.today : d.period.end_date)}`), tuile("Reste à faire", fmtGrand(Math.max(0, d.totals.remaining)), "total"),
        tuile("Prévision", fmtEcart(d.totals.gap), "écart à l'objectif en fin de période", classeEcart(d.totals.gap))) : null,
      h("div", { class: "carte" }, h("h3", null, "Par salarié"),
        h("div", { class: "recherche" }, equipe, d.rows.length ? h("button", { class: "pousse", onclick: csv }, "Télécharger (CSV)") : null),
        h("div", { class: "table-zone" }, h("table", null,
          h("thead", null, h("tr", null, h("th", null, "Salarié"), h("th", null, "Cycle"), h("th", { class: "d" }, "Objectif"), h("th", { class: "d" }, "Réalisé"), h("th", { class: "d" }, "Reste à faire"), h("th", { class: "d" }, "Prévision"), h("th", { class: "d" }, "Solde"))),
          h("tbody", null, d.rows.length ? d.rows.map((r) => h("tr", { class: "cliquable", tabindex: 0, onclick: () => aller(`#/${espace}/annualisation/${r.user_id}/${d.period.id}`), onkeydown: (ev) => { if (ev.key === "Enter") aller(`#/${espace}/annualisation/${r.user_id}/${d.period.id}`); } },
            h("td", null, h("strong", null, r.name), r.goal_set ? h("span", { class: "pastille p-neutre ml" }, "objectif fixé") : null), h("td", null, r.cycle || "—"),
            h("td", { class: "d num" }, fmtGrand(r.objective)), h("td", { class: "d num" }, fmtGrand(r.done)), h("td", { class: "d num" }, fmtGrand(Math.max(0, r.remaining))),
            h("td", { class: "d num " + classeEcart(r.gap) }, fmtEcart(r.gap)), h("td", { class: "d num " + classeEcart(r.balance) }, fmtEcart(r.balance))))
            : h("tr", null, h("td", { colspan: 7, class: "vide" }, d.need_team ? "Choisissez une équipe." : "Personne ne suit de cycle annualisé sur cette période."))))),
        h("p", { class: "discret" }, "Prévision : écart à l'objectif en fin de période si le planning restant est tenu. Solde : réalisé moins prévu à ce jour. Touchez une ligne pour le détail semaine par semaine.")),
      periodes);
  });
}

// RH : les périodes de référence.
function cartePeriodes(d) {
  const editer = (p) => {
    const an = +d.today.slice(0, 4);
    const nom = h("input", { type: "text", maxlength: 60, required: true, value: p?.label || `Annualisation ${an}` });
    const du = h("input", { type: "date", required: true, value: p?.start_date || `${an}-01-01` }), au = h("input", { type: "date", required: true, value: p?.end_date || `${an}-12-31` });
    ouvrir(p ? "Modifier la période" : "Nouvelle période d'annualisation", [champ("Nom", nom), h("div", { class: "grille2" }, champ("Du", du), champ("Au", au)),
      h("p", { class: "discret" }, "Treize mois au plus. Deux périodes ne se chevauchent pas. Modifier les bornes recalcule les objectifs et les soldes de la période.")], "Enregistrer", async () => {
      if (!du.value || !au.value || au.value < du.value) throw new Error("Vérifiez les dates.");
      await api("annual/period-save", { period: { id: p?.id, label: nom.value.trim(), start_date: du.value, end_date: au.value }, ...(p ? { version: p.version } : {}) });
      toast("Période enregistrée."); S.boot = await api("boot"); recharger();
    });
  };
  return h("div", { class: "carte" }, h("h3", null, "Périodes d'annualisation"),
    d.periods.length ? d.periods.map((p) => h("div", { class: "ligne" }, h("span", null, h("strong", null, p.label), ` · du ${frCourt(p.start_date)} au ${frCourt(p.end_date)}`,
      d.today >= p.start_date && d.today <= p.end_date ? h("span", { class: "pastille p-ok ml" }, "en cours") : null), h("button", { class: "petit", onclick: () => editer(p) }, "Modifier")))
      : h("p", { class: "vide" }, "Aucune période."),
    h("div", { class: "ligne gauche" }, h("button", { class: "domaine", onclick: () => editer(null) }, "Nouvelle période")),
    h("p", { class: "discret" }, "Sont annualisés les salariés qui suivent un cycle marqué « annualisé » (Planning › Horaires et cycles). L'effet de chaque motif d'absence sur l'objectif se règle dans Administration › Motifs."));
}
