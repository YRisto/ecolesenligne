// Planning : la grille « qui est prévu quand » (responsable, RH) et la bibliothèque des horaires journaliers et des cycles (RH).
import { api } from "./api.js";
import { h, pose, remplir, toast, agir, ouvrir, confirmer, champ, coche, pad, fmtMin, fmtCourt, frJour, frCourt, plusJours, jourSemaine,
  lireDuree, ecrireDuree } from "./dom.js";
import { S, ecran, aller, recharger } from "./etat.js";
import { normaliserGrille } from "./grille.js";

const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const COULEURS = [["", "Sans couleur"], ["bleu", "Bleu"], ["vert", "Vert"], ["turquoise", "Turquoise"], ["violet", "Violet"], ["rose", "Rose"], ["ambre", "Ambre"], ["brique", "Brique"], ["gris", "Gris"]];
const lundiDe = (s) => plusJours(s, -jourSemaine(s));
const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? "s" : ""}`;
// Ce que l'écran garde d'une visite à l'autre : nombre de semaines affichées, filtre, sélection en cours, case copiée.
const etat = { semaines: 1, filtre: "", equipe: "", choix: new Set(), copie: null };

const sousNav = (espace, actif) => (espace === "rh" ? h("div", { class: "sous" },
  h("button", { "aria-current": actif === "planning" ? "page" : null, onclick: () => aller("#/rh/planning") }, "Planning"),
  h("button", { "aria-current": actif === "horaires" ? "page" : null, onclick: () => aller("#/rh/horaires") }, "Horaires et cycles")) : null);

/* ================= Grille ================= */
export function vuePlanning(espace, depuis) {
  const rh = espace === "rh", scope = rh ? "all" : "team";
  const from = lundiDe(/^\d{4}-\d{2}-\d{2}$/.test(depuis) ? depuis : S.boot.today);
  ecran(async () => normaliserGrille(await api("plan/grid", { scope, from, weeks: etat.semaines })), (d) => rendreGrille(espace, d));
}

function rendreGrille(espace, d) {
  const rh = espace === "rh";
  // la sélection ne survit que si elle porte encore sur des cases affichées
  const visibles = new Set(d.rows.flatMap((r) => r.cells.map((c) => `${r.user_id}|${c.date}`)));
  for (const k of [...etat.choix]) if (!visibles.has(k)) etat.choix.delete(k);
  const modifiable = (r, c) => r.can_edit && !c.hors && !c.closed;
  const equipes = [...new Set(d.rows.map((r) => r.team).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));
  const filtre = h("input", { type: "search", value: etat.filtre, placeholder: "Rechercher un nom", "aria-label": "Rechercher" });
  const equipe = h("select", { value: etat.equipe, "aria-label": "Équipe" }, h("option", { value: "" }, "Toutes les équipes"), equipes.map((e) => h("option", { value: e }, e)));
  const corps = h("tbody"), barre = h("div", { class: "plan-barre", hidden: true }), note = h("p", { class: "discret" });
  const lignes = () => {
    const q = etat.filtre.trim().toLowerCase();
    return d.rows.filter((r) => (!etat.equipe || r.team === etat.equipe) && (!q || r.name.toLowerCase().includes(q)));
  };

  const caseDe = (r, c) => {
    const k = `${r.user_id}|${c.date}`, ok = modifiable(r, c);
    const cls = ["pc"];
    let haut = "", bas = "", titre = `${r.name} · ${frJour(c.date)}`;
    if (c.hors) { cls.push("hors"); haut = "·"; titre += " : hors contrat"; }
    else if (c.absence && !c.absence.half && !c.absence.pending) { cls.push("abs", `k-${{ CP: "cp", RTT: "rtt", AM: "am" }[c.absence.code] || "ab"}`); haut = c.absence.code; bas = c.work ? (c.code || fmtCourt(c.minutes)) : ""; titre += ` : ${c.absence.label}`; }
    else if (c.holiday && !c.work) { cls.push("ferie"); haut = "Férié"; titre += ` : ${c.holiday}`; }
    else if (c.work) {
      const col = c.color || "";
      if (col) cls.push(`hm-${col}`);
      const forfait = r.regime === "forfait_jours";
      haut = c.code || (forfait ? "Jour" : fmtCourt(c.minutes)); bas = c.code && !forfait ? fmtCourt(c.minutes) : "";
      titre += ` : ${c.label || "prévu"}${forfait ? "" : ` · ${fmtMin(c.minutes)}`}${c.ranges ? ` · ${c.ranges}` : ""}`;
      if (c.absence) { bas = c.absence.pending ? "? demande" : `½ ${c.absence.code}`; titre += ` · ${c.absence.label}${c.absence.pending ? " (demande en attente)" : " (demi-journée)"}`; }
      if (c.holiday) titre += ` · jour férié travaillé (${c.holiday})`;
    } else { cls.push("repos"); haut = "Repos"; titre += " : repos"; if (c.absence?.pending) bas = "? demande"; }
    if (c.source === "exception") { cls.push("exc"); titre += " · modifié à la main"; }
    if (c.note) titre += ` · ${c.note}`;
    if (c.closed) { cls.push("clos"); titre += " · mois clôturé"; }
    if (c.date === d.today) cls.push("auj");
    if (etat.choix.has(k)) cls.push("sel");
    const contenu = [h("b", null, haut), bas ? h("small", null, bas) : null];
    return h("td", null, ok
      ? h("button", { type: "button", class: cls.join(" "), title: titre, "aria-label": titre, "aria-pressed": etat.choix.has(k) ? "true" : "false", onclick: () => { if (etat.choix.has(k)) etat.choix.delete(k); else etat.choix.add(k); dessine(); } }, contenu)
      : h("div", { class: cls.join(" "), title: titre }, contenu));
  };
  // un clic sur un nom ou sur un jour sélectionne (ou désélectionne) toute la ligne ou toute la colonne
  const bascule = (cles) => { const tout = cles.length && cles.every((k) => etat.choix.has(k)); for (const k of cles) { if (tout) etat.choix.delete(k); else etat.choix.add(k); } dessine(); };

  const dessine = () => {
    const rows = lignes(), max = 120;
    remplir(corps, rows.slice(0, max).map((r) => h("tr", null,
      h("th", { scope: "row" }, r.can_edit
        ? h("button", { type: "button", class: "lien", title: "Sélectionner toute la ligne", onclick: () => bascule(r.cells.filter((c) => modifiable(r, c)).map((c) => `${r.user_id}|${c.date}`)) }, r.name)
        : h("span", null, r.name),
      h("small", null, [r.cycle || (r.regime === "forfait_jours" ? "forfait jours" : "horaire fixe"), r.presence === "automatique" ? "présence automatique" : null, !r.can_edit ? "votre propre planning : non modifiable" : null].filter(Boolean).join(" · "))),
      r.cells.map((c) => caseDe(r, c)),
      h("td", { class: "d num" }, r.regime === "forfait_jours" ? `${r.cells.filter((c) => c.work).length} j` : fmtMin(r.total)))),
      rows.length ? null : h("tr", null, h("td", { colspan: d.days.length + 2, class: "vide" }, d.rows.length ? "Aucun résultat." : "Personne à planifier dans ce périmètre.")));
    note.textContent = rows.length > max ? `Affichage limité aux ${max} premiers salariés sur ${rows.length} : affinez par équipe ou par nom.` : "";
    // barre d'actions : n'apparaît que lorsqu'une sélection existe
    const n = etat.choix.size;
    barre.hidden = !n;
    if (!n) remplir(barre);
    else {
      remplir(barre, h("strong", null, pluriel(n, "jour") + ` sélectionné${n > 1 ? "s" : ""}`),
        h("button", { class: "domaine", onclick: () => dialogueAppliquer(d, appliquer) }, "Appliquer un horaire"),
        h("button", { onclick: (ev) => agir(ev.currentTarget, () => appliquer({ minutes: 0 }, "Repos")) }, "Repos"),
        h("button", { onclick: (ev) => agir(ev.currentTarget, () => appliquer({ clear: true }, "planning par défaut")) }, "Par défaut"),
        n === 1 ? h("button", { onclick: () => { const [k] = etat.choix; etat.copie = planDe(d, k); toast("Journée copiée : sélectionnez les jours où la coller."); dessine(); } }, "Copier") : null,
        etat.copie ? h("button", { onclick: (ev) => agir(ev.currentTarget, () => appliquer(etat.copie.plan, etat.copie.nom)) }, `Coller « ${etat.copie.nom} »`) : null,
        h("button", { class: "lien", onclick: () => { etat.choix.clear(); dessine(); } }, "Tout désélectionner"));
    }
  };

  // applique un même horaire à toute la sélection ; le serveur contrôle les droits et les mois clôturés, tout passe ou rien
  const appliquer = async (plan, nom) => {
    const items = [...etat.choix].map((k) => { const [user_id, day] = k.split("|"); return { user_id, day, ...plan }; });
    const r = await api("plan/set", { items });
    etat.choix.clear();
    toast(plan.clear ? `${pluriel(r.cleared, "jour")} revenu${r.cleared > 1 ? "s" : ""} au planning par défaut.` : `${nom} : appliqué à ${pluriel(r.set, "jour")}.`);
    recharger();
  };

  filtre.addEventListener("input", () => { etat.filtre = filtre.value; dessine(); });
  equipe.addEventListener("change", () => { etat.equipe = equipe.value; dessine(); });
  const semaines = h("select", { value: String(etat.semaines), "aria-label": "Période affichée", onchange: (ev) => { etat.semaines = +ev.target.value; recharger(); } },
    h("option", { value: "1" }, "1 semaine"), h("option", { value: "2" }, "2 semaines"), h("option", { value: "4" }, "4 semaines"));
  const vers = (n) => aller(`#/${espace}/planning/${plusJours(d.from, n)}`);
  dessine();
  pose(h("div", { class: "ligne" }, h("h2", null, rh ? "Planning · tous les salariés" : "Planning de l'équipe"),
      h("div", { class: "mois-nav" }, h("button", { type: "button", "aria-label": "Période précédente", onclick: () => vers(-7 * etat.semaines) }, "‹"),
        h("strong", null, `${frJour(d.from).replace(/^\S+\s/, "")} → ${frJour(d.to).replace(/^\S+\s/, "")}`),
        h("button", { type: "button", "aria-label": "Période suivante", onclick: () => vers(7 * etat.semaines) }, "›"))),
    sousNav(espace, "planning"),
    h("div", { class: "recherche" }, d.rows.length > 8 ? filtre : null, equipes.length > 1 ? equipe : null, semaines,
      d.from !== lundiDe(d.today) ? h("button", { onclick: () => aller(`#/${espace}/planning`) }, "Cette semaine") : null,
      etat.semaines === 1 ? h("button", { class: "pousse", onclick: (ev) => agir(ev.currentTarget, () => recopier(espace, d, lignes())) }, "Recopier sur la semaine suivante") : null),
    h("div", { class: "carte" }, h("h3", null, "Qui est prévu quand"),
      h("div", { class: "table-zone" }, h("table", { class: "plan" },
        h("thead", null, h("tr", null, h("th", null, "Salarié"),
          d.days.map((j) => h("th", { class: "c" + (j.date === d.today ? " auj" : "") }, h("button", { type: "button", class: "lien", title: "Sélectionner toute la colonne",
            onclick: () => bascule(lignes().flatMap((r) => r.cells.filter((c) => c.date === j.date && modifiable(r, c)).map((c) => `${r.user_id}|${c.date}`))) },
            `${JOURS[jourSemaine(j.date)]} ${+j.date.slice(8)}`), j.holiday ? h("small", null, "férié") : null)),
          h("th", { class: "d" }, "Total"))), corps)),
      note,
      h("div", { class: "legende" }, h("span", { class: "pc-l exc" }, "Modifié à la main"), h("span", { class: "pc-l repos" }, "Repos"), h("span", { class: "pc-l k-f" }, "Férié"),
        h("span", { class: "pc-l k-cp" }, "Absence"), d.models.filter((m) => m.color).map((m) => h("span", { class: `pc-l hm-${m.color}` }, `${m.code} · ${m.label}`))),
      h("p", { class: "discret" }, "Touchez un jour pour le sélectionner, un nom pour toute la ligne, un jour de la semaine pour toute la colonne ; puis appliquez un horaire, un repos, ou revenez au planning par défaut. "
        + "Sans modification, chacun suit son cycle ou son horaire fixe. Les mois clôturés ne se modifient plus.")),
    barre);
}

// Ce qui est prévu dans une case, sous la forme qu'attend l'enregistrement (pour copier une journée ou recopier une semaine).
function planCase(c) {
  if (!c.sched) return { plan: { minutes: 0 }, nom: "Repos" };
  if (c.code) return { plan: { model_code: c.code }, nom: c.code };
  return { plan: { minutes: c.minutes, ranges: c.r || [], label: c.source === "exception" ? c.label : "" }, nom: fmtCourt(c.minutes) };
}
function planDe(d, cle) {
  const [uid, date] = cle.split("|");
  return planCase(d.rows.find((r) => r.user_id === uid).cells.find((c) => c.date === date));
}

// Recopie la semaine affichée sur la suivante : les jours modifiés à la main y sont reportés tels quels ; les autres jours
// de la semaine suivante reviennent à ce que prévoit le cycle ou l'horaire fixe. Un cycle de plusieurs semaines garde ainsi son rythme.
async function recopier(espace, d, rows) {
  const suite = normaliserGrille(await api("plan/grid", { scope: espace === "rh" ? "all" : "team", from: plusJours(d.from, 7), weeks: 1 }));
  const items = []; const touches = new Set(); let clos = 0;
  for (const r of rows) {
    if (!r.can_edit) continue;
    const cible = suite.rows.find((x) => x.user_id === r.user_id); if (!cible) continue;
    r.cells.forEach((c, i) => {
      const t = cible.cells[i];
      if (c.hors || t.hors || !t.def) return;
      const v = { sched: !!c.sched, minutes: c.sched ? c.minutes : 0, code: c.sched ? c.code : "" };
      const commeDefaut = v.sched === t.def.sched && (!v.sched || (v.minutes === t.def.minutes && v.code === t.def.code));
      const dejaBon = v.sched === t.sched && (!v.sched || (v.minutes === t.minutes && v.code === t.code));
      let item = null;
      if (c.source === "exception" && !commeDefaut) { if (!dejaBon) item = { user_id: r.user_id, day: t.date, ...planCase(c).plan, note: c.note || "" }; }
      else if (t.source === "exception") item = { user_id: r.user_id, day: t.date, clear: true };
      if (!item) return;
      if (t.closed) { clos += 1; return; }
      items.push(item); touches.add(r.user_id);
    });
  }
  if (!items.length) { toast(clos ? "La semaine suivante est dans un mois clôturé : elle ne se modifie plus." : "Rien à recopier : la semaine suivante porte déjà les mêmes modifications."); return; }
  confirmer("Recopier sur la semaine suivante", [`Semaine du ${frCourt(d.from)} → semaine du ${frCourt(plusJours(d.from, 7))}.`,
    `${pluriel(items.length, "jour")} à modifier pour ${pluriel(touches.size, "salarié")}.`,
    "Les jours modifiés à la main cette semaine sont reportés sur la suivante ; les autres jours y suivent le cycle ou l'horaire habituel. Les absences ne sont pas recopiées."], "Recopier", async () => {
    await api("plan/set", { items });
    toast("Semaine recopiée."); etat.choix.clear();
    aller(`#/${espace}/planning/${plusJours(d.from, 7)}`);
  });
}

// Choix de l'horaire à appliquer à la sélection : un horaire de la bibliothèque, ou une saisie libre pour ce jour-là.
function dialogueAppliquer(d, appliquer) {
  const duree = h("input", { type: "text", inputmode: "decimal", placeholder: "Exemple : 6 ou 6:30" });
  const nom = h("input", { type: "text", maxlength: 60, placeholder: "Exemple : Salon étudiant" });
  const note = h("input", { type: "text", maxlength: 200, placeholder: "Facultatif : visible au survol de la case" });
  const plages = editeurPlages([]);
  // un refus du serveur (droits, mois clôturé) s'affiche dans la fenêtre, qui reste ouverte
  const refus = h("p", { class: "bandeau refus", hidden: true, role: "alert" });
  const choisir = async (ev, plan, lib) => {
    const b = ev.currentTarget; b.disabled = true; refus.hidden = true;
    try { await appliquer({ ...plan, note: note.value.trim() }, lib); document.getElementById("dlg").close(); }
    catch (e) { if (e?.code === "session") { document.getElementById("dlg").close(); return; } refus.textContent = e?.message || "Une erreur est survenue."; refus.hidden = false; }
    finally { b.disabled = false; }
  };
  ouvrir(`Appliquer à ${pluriel(etat.choix.size, "jour")}`, [
    d.models.length ? h("div", { class: "pile" }, h("span", { class: "eyebrow" }, "Horaires de la bibliothèque"),
      d.models.map((m) => h("button", { type: "button", class: `choix-h hm-${m.color || "aucune"}`, onclick: (ev) => choisir(ev, { model_code: m.code }, m.code) },
        h("b", null, m.code), h("span", null, m.label), h("small", null, [fmtMin(m.minutes), m.ranges_text].filter(Boolean).join(" · ")))), refus)
      : h("p", { class: "bandeau info" }, h("strong", null, "Aucun horaire dans la bibliothèque"), d.can_lib ? "Créez vos horaires journaliers dans « Horaires et cycles », ou saisissez un horaire libre ci-dessous." : "Les RH peuvent en créer. En attendant, saisissez un horaire libre ci-dessous."),
    champ("Note pour ces jours", note),
    h("div", { class: "pile" }, h("span", { class: "eyebrow" }, "Ou un horaire libre pour ces jours"),
      h("div", { class: "grille2" }, champ("Durée", duree), champ("Nom", nom)), plages.noeud),
  ], "Appliquer l'horaire libre", async () => {
    const r = plages.lire();
    let min = lireDuree(duree.value);
    if (!duree.value.trim() && r.length) min = r.reduce((s, [a, b]) => s + minutesDe(b) - minutesDe(a), 0);
    if (Number.isNaN(min) || min < 1 || min > 960) throw new Error("Indiquez une durée entre 1 minute et 16 heures (exemples : 6, 6:30), ou des plages.");
    await appliquer({ minutes: min, ranges: r, label: nom.value.trim(), note: note.value.trim() }, nom.value.trim() || fmtCourt(min));
  }, { large: true });
}

const minutesDe = (t) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
// Plages « début → fin » (trois au plus). Une fin avant le début désigne le lendemain : elle est enregistrée au-delà de 24 h.
function editeurPlages(ranges) {
  const zone = h("div", { class: "pile" });
  const ajoute = (a = "", b = "") => {
    if (zone.children.length >= 4) return;
    const fin = b && b >= "24:00" ? `${pad(+b.slice(0, 2) - 24)}${b.slice(2)}` : b;
    const row = h("div", { class: "heures-edit" }, h("input", { type: "time", value: a, "aria-label": "Début de plage" }), h("span", null, "→"), h("input", { type: "time", value: fin, "aria-label": "Fin de plage" }),
      h("button", { type: "button", "aria-label": "Retirer cette plage", onclick: () => row.remove() }, "×"));
    zone.append(row);
  };
  for (const [a, b] of ranges) ajoute(a, b);
  if (!ranges.length) ajoute();
  return {
    noeud: h("div", { class: "pile" }, h("span", { class: "eyebrow" }, "Plages indicatives (facultatif)"), zone,
      h("button", { type: "button", class: "lien", onclick: () => ajoute() }, "Ajouter une plage"),
      h("small", { class: "discret" }, "Exemple : 8:45 → 13:15, puis 14:00 → 18:00. Une fin avant le début désigne le lendemain (travail de nuit).")),
    lire() {
      const out = []; let avant = "";
      for (const row of zone.children) {
        const [a, b] = [...row.querySelectorAll("input")].map((i) => i.value);
        if (!a && !b) continue;
        if (!a || !b) throw new Error("Une plage est incomplète.");
        const fin = b <= a ? `${pad(+b.slice(0, 2) + 24)}${b.slice(2)}` : b;
        if (a < avant) throw new Error("Les plages doivent se suivre dans l'ordre.");
        out.push([a, fin]); avant = fin;
      }
      return out;
    },
  };
}

/* ================= Bibliothèque : horaires journaliers et cycles ================= */
export function vueBibliotheque() {
  ecran(() => api("plan/lib"), (d) => {
    const pastilleH = (m) => h("span", { class: `code-h hm-${m.color || "aucune"}` }, m.code);
    pose(h("div", { class: "ligne" }, h("h2", null, "Horaires et cycles")), sousNav("rh", "horaires"),
      h("p", { class: "discret" }, "Un horaire journalier donne une durée et, si vous le souhaitez, des plages. Un cycle enchaîne ces horaires sur une ou plusieurs semaines, et se répète. "
        + "Vous attribuez ensuite un cycle à un salarié depuis sa fiche, à partir d'une date. Sans cycle, un salarié garde son horaire fixe."),
      h("div", { class: "carte" }, h("h3", null, `Horaires journaliers (${d.models.length})`),
        d.models.length ? d.models.map((m) => h("div", { class: "jour" },
          h("div", null, pastilleH(m), " ", h("strong", null, m.label), !m.active ? h("span", { class: "pastille p-gris ml" }, "désactivé") : null),
          h("div", { class: "num" }, fmtMin(m.minutes)),
          h("div", { class: "note discret" }, [m.ranges_text || "sans plage indicative", m.cycles ? `dans ${pluriel(m.cycles, "cycle")}` : "dans aucun cycle", m.locked ? "durée figée : a servi dans un mois clôturé" : null].filter(Boolean).join(" · ")),
          d.can_edit ? h("div", { class: "actions" }, h("button", { onclick: () => dialogueHoraire(m) }, "Modifier")) : null))
          : h("p", { class: "vide" }, "Aucun horaire journalier pour l'instant."),
        d.can_edit ? h("div", { class: "ligne gauche" }, h("button", { class: "domaine", onclick: () => dialogueHoraire(null) }, "Nouvel horaire journalier")) : null),
      h("div", { class: "carte" }, h("h3", null, `Cycles (${d.cycles.length})`),
        d.cycles.length ? d.cycles.map((c) => h("div", { class: "jour" },
          h("div", null, h("strong", null, c.name), !c.active ? h("span", { class: "pastille p-gris ml" }, "désactivé") : null, c.locked ? h("span", { class: "pastille p-neutre ml" }, "figé") : null),
          h("div", { class: "num" }, `${fmtMin(c.weekly_minutes)} / sem.`),
          h("div", { class: "note discret" }, [pluriel(c.weeks.length, "semaine"), c.weeks.length > 1 ? "durée moyenne" : null, c.assigned ? `suivi par ${pluriel(c.assigned, "salarié")}` : "attribué à personne"].filter(Boolean).join(" · ")),
          h("div", { class: "note" }, h("div", { class: "cycle-apercu" }, c.weeks.map((w, i) => h("div", { class: "sem" }, c.weeks.length > 1 ? h("small", null, `S${i + 1}`) : null,
            w.map((e, j) => h("span", { class: e ? `code-h hm-${e.color || "aucune"}` : "code-h vide-h", title: `${JOURS[j]} : ${e ? `${e.label} (${fmtMin(e.minutes)})` : "repos"}` }, e ? e.code : "·")))))),
          d.can_edit ? h("div", { class: "actions" }, h("button", { onclick: () => dialogueCycle(d, c) }, "Modifier"), h("button", { onclick: () => dialogueCycle(d, { ...c, id: null, name: `${c.name} (copie)`.slice(0, 60), locked: false, assigned: 0, active: true }) }, "Dupliquer")) : null))
          : h("p", { class: "vide" }, "Aucun cycle pour l'instant."),
        d.can_edit ? h("div", { class: "ligne gauche" }, h("button", { class: "domaine", disabled: !d.models.some((m) => m.active), onclick: () => dialogueCycle(d, null) }, "Nouveau cycle"),
          !d.models.some((m) => m.active) ? h("span", { class: "discret" }, "Créez d'abord un horaire journalier.") : null) : null,
        h("p", { class: "discret" }, "Un cycle qui a servi dans un mois clôturé ne change plus de composition : dupliquez-le, modifiez la copie, puis attribuez-la aux salariés à partir d'une date.")));
  });
}

function dialogueHoraire(m) {
  const nouveau = !m;
  const code = h("input", { type: "text", value: m?.code || "", maxlength: 12, required: true, disabled: !nouveau, autocapitalize: "characters", placeholder: "Exemple : J7" });
  const nom = h("input", { type: "text", value: m?.label || "", maxlength: 60, required: true, placeholder: "Exemple : Journée 7 h" });
  const duree = h("input", { type: "text", inputmode: "decimal", value: ecrireDuree(m?.minutes || 0), disabled: !!m?.locked, placeholder: "Exemple : 7 ou 7:30" });
  const coul = h("select", { value: m?.color || "" }, COULEURS.map(([v, l]) => h("option", { value: v }, l)));
  const [actifLib, actif] = coche("Proposé dans le planning et dans les nouveaux cycles", { checked: m ? m.active : true });
  const plages = editeurPlages(m?.ranges || []);
  ouvrir(nouveau ? "Nouvel horaire journalier" : `Horaire ${m.code}`, [
    h("div", { class: "grille2" }, champ("Code", code, "Court, il s'affiche dans les cases du planning."), champ("Nom", nom)),
    h("div", { class: "grille2" }, champ("Durée de travail", duree, m?.locked ? "Figée : cet horaire a servi dans un mois clôturé." : "Laissez vide pour la calculer d'après les plages."), champ("Couleur", coul)),
    plages.noeud, nouveau ? null : actifLib,
  ], nouveau ? "Créer" : "Enregistrer", async () => {
    const r = plages.lire();
    let min = lireDuree(duree.value);
    if (!duree.value.trim() && r.length) min = r.reduce((s, [a, b]) => s + minutesDe(b) - minutesDe(a), 0);
    if (Number.isNaN(min) || min < 1 || min > 960) throw new Error("Indiquez une durée entre 1 minute et 16 heures (exemples : 7, 7:30), ou des plages.");
    if (!nom.value.trim()) throw new Error("Donnez un nom à cet horaire.");
    const model = { code: code.value.trim().toUpperCase(), label: nom.value.trim(), minutes: min, ranges: r, color: coul.value, active: actif.checked };
    await api("plan/model-save", nouveau ? { create: true, model } : { model, version: m.version });
    toast(nouveau ? "Horaire créé." : "Horaire enregistré."); recharger();
  }, { large: true });
}

function dialogueCycle(d, c) {
  const nouveau = !c?.id, fige = !!c?.locked;
  const actifs = d.models.filter((m) => m.active);
  const nom = h("input", { type: "text", value: c?.name || "", maxlength: 60, required: true, placeholder: "Exemple : Semaine 35 h" });
  const [actifLib, actif] = coche("Peut être attribué à de nouveaux salariés", { checked: c ? c.active : true });
  const zone = h("div", { class: "pile" }), total = h("strong", { class: "num" });
  const maj = () => {
    const sommes = [...zone.children].map((row) => [...row.querySelectorAll("select")].reduce((s, sel) => s + (d.models.find((m) => m.code === sel.value)?.minutes || 0), 0));
    [...zone.children].forEach((row, i) => { row.querySelector(".tot").textContent = fmtMin(sommes[i]); row.querySelector(".rang").textContent = `Semaine ${i + 1}`; });
    total.textContent = sommes.length ? `${fmtMin(Math.round(sommes.reduce((s, x) => s + x, 0) / sommes.length))} par semaine${sommes.length > 1 ? " en moyenne" : ""}` : "—";
  };
  const ajoute = (codes) => {
    if (zone.children.length >= 12) return;
    const row = h("div", { class: "cycle-sem" }, h("div", { class: "ligne" }, h("span", { class: "eyebrow rang" }), h("span", { class: "discret tot num" }),
        fige ? null : h("button", { type: "button", class: "petit", "aria-label": "Retirer cette semaine", onclick: () => { if (zone.children.length > 1) { row.remove(); maj(); } } }, "Retirer")),
      h("div", { class: "grille7" }, JOURS.map((j, i) => h("label", null, j, h("select", { value: codes[i] || "", disabled: fige, onchange: maj }, h("option", { value: "" }, "Repos"),
        // un horaire désactivé reste proposé s'il figure déjà dans cette case : on ne le perd pas en ouvrant le cycle
        d.models.filter((m) => m.active || m.code === codes[i]).map((m) => h("option", { value: m.code }, m.code)))))));
    zone.append(row); maj();
  };
  const depart = c?.codes?.length ? c.codes : [[actifs[0]?.code || "", actifs[0]?.code || "", actifs[0]?.code || "", actifs[0]?.code || "", actifs[0]?.code || "", "", ""]];
  for (const w of depart) ajoute(w.map((x) => x || ""));
  ouvrir(nouveau ? "Nouveau cycle" : `Cycle « ${c.name} »`, [
    fige ? h("p", { class: "bandeau info" }, h("strong", null, "Composition figée"), "Ce cycle a servi dans un mois clôturé : seuls son nom et son état peuvent changer. Pour un autre rythme, dupliquez-le.") : null,
    !nouveau && !fige && c.assigned ? h("p", { class: "bandeau" }, h("strong", null, `Suivi par ${pluriel(c.assigned, "salarié")}`), "Modifier sa composition change ce qui est prévu pour eux, y compris sur les mois passés non clôturés.") : null,
    champ("Nom", nom), zone,
    fige ? null : h("div", { class: "ligne gauche" }, h("button", { type: "button", onclick: () => { const derniere = zone.lastElementChild; ajoute(derniere ? [...derniere.querySelectorAll("select")].map((s) => s.value) : []); } }, "Ajouter une semaine")),
    h("div", { class: "ligne" }, h("span", { class: "discret" }, "Durée du cycle"), total),
    h("p", { class: "discret" }, actifs.map((m) => `${m.code} = ${m.label} (${fmtMin(m.minutes)})`).join(" · ")),
    nouveau ? null : actifLib,
  ], nouveau ? "Créer le cycle" : "Enregistrer", async () => {
    const weeks = [...zone.children].map((row) => [...row.querySelectorAll("select")].map((s) => s.value || null));
    if (!nom.value.trim()) throw new Error("Donnez un nom au cycle.");
    if (!weeks.some((w) => w.some(Boolean))) throw new Error("Le cycle doit contenir au moins un jour travaillé.");
    const cycle = { name: nom.value.trim(), weeks, active: actif.checked };
    if (!nouveau) cycle.id = c.id;
    await api("plan/cycle-save", nouveau ? { cycle } : { cycle, version: c.version });
    toast(nouveau ? "Cycle créé. Attribuez-le depuis la fiche d'un salarié." : "Cycle enregistré."); recharger();
  }, { large: true });
}

// Aperçu d'un cycle dans la fiche d'un salarié (réutilisé par l'éditeur d'horaire).
export function apercuCycle(c) {
  return h("div", { class: "cycle-apercu" }, c.weeks.map((w, i) => h("div", { class: "sem" }, c.weeks.length > 1 ? h("small", null, `S${i + 1}`) : null,
    w.map((e, j) => h("span", { class: e ? `code-h hm-${e.color || "aucune"}` : "code-h vide-h", title: `${JOURS[j]} : ${e ? `${e.label} (${fmtMin(e.minutes)})` : "repos"}` }, e ? e.code : "·")))));
}
