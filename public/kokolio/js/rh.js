// Ressources humaines : salariés et fiches, import, report des congés, clôture et export paie, journal.
import { api, CHEMIN } from "./api.js";
import { h, pose, remplir, toast, agir, ouvrir, confirmer, demanderMotif, etiquette, tuile, champ, telecharger, pad,
  fmtMin, fmtJ, fmtNb, frCourt, frMois, frHorodatage, lireDuree, ecrireDuree, plusJours, jourSemaine } from "./dom.js";
import { S, ecran, aller, recharger, estAdmin } from "./etat.js";
import { montrerCode, bonActivation, imprimerBons } from "./codes.js";
import { apercuCycle } from "./planning.js";

const val = (el) => el.value.trim();
const csvLigne = (l) => l.map((c) => { const s = String(c ?? ""); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(";");
const ROLES = { salarie: "Salarié", rh: "RH", admin: "Administrateur" };
const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

/* ---------- durées et horaires ---------- */
const lundiDe = (s) => plusJours(s, -jourSemaine(s));
const presenceLib = (c) => (c?.presence === "automatique" ? " · présence automatique (ne pointe pas)" : "");
const moyenneCycle = (k) => Math.round(k.weeks.reduce((s, w) => s + w.reduce((t, e) => t + (e ? e.minutes : 0), 0), 0) / k.weeks.length);
const resumeHoraire = (c) => (!c ? "—"
  : c.cycle ? `Cycle « ${c.cycle.name} » (${c.cycle.weeks.length > 1 ? `${c.cycle.weeks.length} semaines, ` : ""}${c.regime === "forfait_jours" ? `forfait de ${c.forfait_days} jours par an` : `${fmtMin(moyenneCycle(c.cycle))} par semaine${c.cycle.weeks.length > 1 ? " en moyenne" : ""}`})${c.cycle.weeks.length > 1 && c.cycle_anchor ? `, semaine 1 le lundi ${frCourt(c.cycle_anchor)}` : ""}${c.regime === "horaire" ? `, pause ${c.pause_minutes} min` : ""}${presenceLib(c)}`
  : c.regime === "forfait_jours" ? `Forfait de ${c.forfait_days} jours par an (${c.work_days.map((d) => JOURS[d - 1].toLowerCase()).join(", ")})${presenceLib(c)}`
  : `${fmtMin(c.day_minutes.reduce((s, m) => s + m, 0))} par semaine (${c.day_minutes.map((m, i) => (m ? `${JOURS[i].toLowerCase()} ${ecrireDuree(m)}` : null)).filter(Boolean).join(", ")}), pause ${c.pause_minutes} min${presenceLib(c)}`);

// Éditeur d'horaire : régime, organisation du temps (semaine fixe ou cycle de la bibliothèque), présence, pause, acquisition de congés.
// cycles : cycles de la bibliothèque ; dateEffet : fonction qui renvoie la date d'effet choisie (pour proposer le lundi de la semaine 1).
function editeurHoraire(c, cycles = [], dateEffet = () => "") {
  c = c || { regime: "horaire", day_minutes: [420, 420, 420, 420, 420, 0, 0], work_days: [1, 2, 3, 4, 5], pause_minutes: 45, cp_per_month: 2.08, forfait_days: 218, presence: "pointage" };
  const regime = h("select", { value: c.regime }, h("option", { value: "horaire" }, "Horaire (heures par semaine)"), h("option", { value: "forfait_jours" }, "Forfait jours (cadre)"));
  const proposes = cycles.filter((k) => k.active || k.id === c.cycle_id);
  const orga = h("select", { value: c.cycle_id || "" }, h("option", { value: "" }, "Semaine fixe : la même toute l'année"),
    proposes.map((k) => h("option", { value: k.id }, `Cycle : ${k.name}${k.active ? "" : " (désactivé)"}`)));
  const ancre = h("input", { type: "date", value: c.cycle_anchor || "" });
  const apercu = h("div", { class: "pile" });
  const presence = h("select", { value: c.presence || "pointage" }, h("option", { value: "pointage" }, "Pointage : arrivée et départ"), h("option", { value: "automatique" }, "Présence automatique : ne pointe pas"));
  const durees = JOURS.map((j, i) => h("input", { type: "text", inputmode: "decimal", value: ecrireDuree(c.day_minutes[i]), placeholder: "—", "aria-label": `Durée du ${j}` }));
  const total = h("strong", { class: "num" });
  const coches = JOURS.map((j, i) => h("input", { type: "checkbox", checked: c.work_days.includes(i + 1), "aria-label": j }));
  const pause = h("input", { type: "number", min: 0, max: 180, step: 5, value: c.pause_minutes });
  const cp = h("input", { type: "text", inputmode: "decimal", value: fmtNb(c.cp_per_month) });
  const forfait = h("input", { type: "number", min: 1, max: 366, value: c.forfait_days });
  const champPause = champ("Pause déduite (minutes)", pause, "Déduite d'une journée de plus de six heures pointée d'un seul tenant, sans pause pointée.");
  const blocDurees = h("div", { class: "pile" }, h("span", { class: "eyebrow" }, "Durée prévue chaque jour (exemples : 7, 7:30, 7,5 ; vide = non travaillé)"),
    h("div", { class: "grille7" }, JOURS.map((j, i) => h("label", null, j, durees[i]))), h("div", { class: "ligne" }, h("span", { class: "discret" }, "Total hebdomadaire"), total));
  const blocJours = h("div", { class: "pile" }, h("span", { class: "eyebrow" }, "Jours travaillés"), h("div", { class: "segments" }, JOURS.map((j, i) => h("label", null, coches[i], j))));
  const champForfait = champ("Jours du forfait annuel", forfait);
  const blocCycle = h("div", { class: "pile" }, apercu, champ("Semaine 1 du cycle : semaine du", ancre, "N'importe quel jour de la semaine voulue. Vide : la semaine de la date d'effet."));
  const maj = () => {
    const f = regime.value === "forfait_jours", k = proposes.find((x) => x.id === orga.value);
    blocDurees.hidden = f || !!k; blocJours.hidden = !f || !!k; champForfait.hidden = !f; champPause.hidden = f; blocCycle.hidden = !k;
    if (k) remplir(apercu, h("span", { class: "eyebrow" }, `${k.weeks.length} semaine${k.weeks.length > 1 ? "s" : ""}${f ? "" : ` · ${fmtMin(moyenneCycle(k))} par semaine${k.weeks.length > 1 ? " en moyenne" : ""}`}`), apercuCycle(k),
      f ? h("small", { class: "discret" }, "Au forfait jours, le cycle dit seulement quels jours sont travaillés.") : null);
    const mins = durees.map((d) => lireDuree(d.value));
    total.textContent = mins.some(Number.isNaN) ? "durée illisible" : fmtMin(mins.reduce((s, m) => s + m, 0));
  };
  regime.addEventListener("change", maj); orga.addEventListener("change", maj); for (const d of durees) d.addEventListener("input", maj); maj();
  return {
    noeud: h("div", { class: "pile" }, h("div", { class: "grille2" }, champ("Régime", regime), champ("Présence", presence, "Automatique : les jours prévus sont comptés d'office, seules les absences se déclarent.")),
      proposes.length ? champ("Organisation du temps", orga) : null, blocCycle, blocDurees, blocJours, champForfait, champPause, champ("Congés payés acquis par mois complet (jours)", cp)),
    lire() {
      const cpv = Number(val(cp).replace(",", "."));
      if (!Number.isFinite(cpv) || cpv < 0 || cpv > 5) throw new Error("Acquisition de congés invalide (entre 0 et 5 jours par mois).");
      const f = regime.value === "forfait_jours";
      const commun = { cp_per_month: cpv, presence: presence.value, forfait_days: f ? +forfait.value || 218 : 218, pause_minutes: f ? 0 : +pause.value || 0 };
      if (orga.value) {
        // la semaine du contrat n'est alors qu'un repère : la base y recopie la première semaine du cycle
        return { regime: regime.value, day_minutes: f ? [0, 0, 0, 0, 0, 0, 0] : [420, 420, 420, 420, 420, 0, 0], work_days: [1, 2, 3, 4, 5], ...commun,
          cycle_id: orga.value, cycle_anchor: ancre.value ? lundiDe(ancre.value) : dateEffet() ? lundiDe(dateEffet()) : "" };
      }
      if (f) {
        const wd = coches.map((x, i) => (x.checked ? i + 1 : 0)).filter(Boolean);
        if (!wd.length) throw new Error("Cochez au moins un jour travaillé.");
        return { regime: "forfait_jours", day_minutes: [0, 0, 0, 0, 0, 0, 0], work_days: wd, ...commun };
      }
      const mins = durees.map((d) => lireDuree(d.value));
      if (mins.some((m) => Number.isNaN(m) || m > 960)) throw new Error("Une durée journalière est illisible. Écrivez par exemple 7, 7:30 ou 7,5.");
      if (!mins.some((m) => m > 0)) throw new Error("Indiquez au moins un jour travaillé.");
      return { regime: "horaire", day_minutes: mins, work_days: mins.map((m, i) => (m ? i + 1 : 0)).filter(Boolean), ...commun };
    },
  };
}

function etatCompte(e) {
  if (e.disabled) return etiquette("Désactivé", "p-gris");
  if (!e.active) return etiquette("Sorti", "p-gris");
  if (e.locked) return etiquette("Bloqué 15 min", "p-refus");
  if (e.activated) return etiquette("Activé", "p-ok");
  return e.code_pending ? etiquette("Code remis", "p-attente") : etiquette("À activer", "p-refus");
}

/* ================= Salariés ================= */
export function vueSalaries() {
  ecran(() => api("rh/employees"), (d) => {
    const tous = d.employees, actifs = tous.filter((e) => e.active), suivis = actifs.filter((e) => e.tracked);
    const aActiver = actifs.filter((e) => !e.activated && !e.code_pending);
    const filtre = h("input", { type: "search", placeholder: "Nom, matricule, équipe, identifiant", "aria-label": "Rechercher" });
    const quoi = h("select", { "aria-label": "Filtrer" }, [["actifs", "Salariés actifs"], ["activer", "Comptes à activer"], ["sortis", "Sortis ou désactivés"], ["tous", "Tous"]].map(([v, l]) => h("option", { value: v }, l)));
    const corps = h("tbody"), compte = h("span", { class: "discret" });
    const dessine = () => {
      const q = filtre.value.trim().toLowerCase();
      const rows = tous.filter((e) => (quoi.value === "tous" || (quoi.value === "actifs" && e.active) || (quoi.value === "activer" && e.active && !e.activated) || (quoi.value === "sortis" && !e.active))
        && (!q || `${e.name} ${e.matricule} ${e.team} ${e.login} ${e.job}`.toLowerCase().includes(q)));
      compte.textContent = `${rows.length} fiche${rows.length > 1 ? "s" : ""}`;
      corps.replaceChildren(...rows.slice(0, 600).map((e) => h("tr", { class: "cliquable", tabindex: 0, onclick: () => aller(`#/rh/fiche/${e.id}`), onkeydown: (ev) => { if (ev.key === "Enter") aller(`#/rh/fiche/${e.id}`); } },
        h("td", null, h("strong", null, e.name), e.role !== "salarie" ? h("span", { class: "pastille p-neutre ml" }, ROLES[e.role]) : null),
        h("td", { class: "num" }, e.matricule || h("span", { class: "moins" }, "manquant")), h("td", null, e.team || "—"), h("td", null, e.manager_name || "—"),
        h("td", { class: "num" }, !e.tracked ? "Hors pointage" : [e.regime === "forfait_jours" ? "Forfait jours" : fmtMin(e.weekly_minutes), e.cycle ? "cycle" : null, e.presence === "automatique" ? "sans pointage" : null].filter(Boolean).join(" · ")), h("td", null, etatCompte(e)))));
      if (!rows.length) corps.append(h("tr", null, h("td", { colspan: 6, class: "vide" }, "Aucune fiche.")));
    };
    filtre.addEventListener("input", dessine); quoi.addEventListener("change", dessine); dessine();
    pose(h("div", { class: "ligne" }, h("h2", null, "Salariés"),
        h("div", { class: "ligne gauche" }, h("button", { class: "domaine", onclick: () => aller("#/rh/fiche/nouveau") }, "Nouveau salarié"), h("button", { onclick: () => aller("#/rh/import") }, "Importer un fichier"),
          h("button", { onclick: () => aller("#/rh/report") }, "Soldes : report et écritures"))),
      h("div", { class: "tuiles" }, tuile("Actifs", String(actifs.length), `${tous.length} fiches au total`),
        tuile("Comptes activés", `${actifs.filter((e) => e.activated).length} / ${actifs.length}`, "ont choisi leur mot de passe"),
        tuile("Sans matricule", String(suivis.filter((e) => !e.matricule).length), "à compléter avant l'export paie"),
        tuile("Sans responsable", String(suivis.filter((e) => !e.manager_id).length), "validés par les RH")),
      d.rollover_due ? h("div", { class: "bandeau" }, h("strong", null, `Report des congés ${d.rollover_due} à faire`), `Les soldes de ${d.rollover_due + 1} ne contiennent pas encore les jours restants de ${d.rollover_due}. Les salariés en sont prévenus sur leur écran.`,
        h("div", { class: "ligne" }, h("button", { class: "petit", onclick: () => aller(`#/rh/report/${d.rollover_due}`) }, "Ouvrir le report"))) : null,
      aActiver.length ? h("div", { class: "bandeau" }, h("strong", null, `${aActiver.length} compte${aActiver.length > 1 ? "s" : ""} sans code d'activation valide`),
        "Ces salariés ne peuvent pas se connecter : leur code a expiré ou n'a jamais été généré.",
        h("div", { class: "ligne" }, h("button", { class: "petit", onclick: () => codesEnMasse(aActiver) }, `Générer ${aActiver.length > 1 ? "les codes" : "le code"}`))) : null,
      h("div", { class: "carte" }, h("h3", null, "Fiches"), h("div", { class: "recherche" }, filtre, quoi), compte,
        h("div", { class: "table-zone" }, h("table", null, h("thead", null, h("tr", null, ["Nom", "Matricule", "Équipe", "Responsable", "Temps de travail", "Compte"].map((x) => h("th", null, x)))), corps))));
  });
}

function codesEnMasse(liste) {
  confirmer("Générer les codes d'activation", `Un nouveau code sera généré pour ${liste.length} salarié${liste.length > 1 ? "s" : ""}. Les codes s'afficheront une seule fois, à imprimer ou télécharger aussitôt.`, "Générer", async () => {
    const codes = [];
    for (const e of liste) {
      try { codes.push(await api("team/code", { user_id: e.id })); }
      catch (err) { if (err.code === "session") throw err; codes.push({ login: e.login, name: e.name, code: "", erreur: err.message }); }
    }
    ecranCodes(codes.filter((c) => c.code), `${codes.filter((c) => c.code).length} code(s) généré(s).` + (codes.some((c) => c.erreur) ? ` ${codes.filter((c) => c.erreur).length} refusé(s) : ${codes.find((c) => c.erreur).erreur}` : ""));
  });
}

// Page de remise des codes : à l'écran une seule fois, avec impression et téléchargement.
export function ecranCodes(codes, titre, suite) {
  S.jeton++;
  pose(h("h2", null, "Codes d'activation"),
    h("div", { class: "bandeau" }, h("strong", null, "Ces codes ne seront plus affichés"), `${titre} Imprimez les fiches ou téléchargez la liste avant de quitter cette page. En cas de perte, vous pourrez générer un nouveau code depuis la fiche du salarié.`),
    h("div", { class: "ligne gauche sans-impression" },
      h("button", { class: "domaine", onclick: () => imprimerBons(codes) }, "Imprimer les fiches"),
      h("button", { onclick: () => telecharger("codes-activation.csv", "﻿" + [["Nom", "Identifiant", "Code d'activation", "Adresse"], ...codes.map((c) => [c.name, c.login, c.code, `${location.origin}${CHEMIN}`])].map(csvLigne).join("\r\n") + "\r\n") }, "Télécharger la liste (CSV)"),
      h("button", { onclick: () => aller("#/rh/salaries") }, "Terminé")),
    suite || null,
    h("div", { class: "bons" }, codes.map(bonActivation)));
}

/* ================= Fiche ================= */
export function vueFiche(id) {
  const nouveau = id === "nouveau";
  ecran(() => Promise.all([nouveau ? null : api("rh/employee", { id }), api("rh/employees"), nouveau ? api("plan/lib") : null]), ([f, liste, lib]) => {
    const u = f?.user || { role: "salarie", details: {} }, det = u.details || {};
    const cycles = f?.cycles || lib?.cycles || [];
    const champs = {
      first_name: h("input", { type: "text", value: u.first_name || "", autocomplete: "off" }), last_name: h("input", { type: "text", value: u.last_name || "", required: true, autocomplete: "off" }),
      login: h("input", { type: "text", value: u.login || "", required: true, autocapitalize: "none", spellcheck: "false", autocomplete: "off", placeholder: "prenom.nom" }),
      matricule: h("input", { type: "text", value: u.matricule || "", autocomplete: "off" }), email: h("input", { type: "email", value: u.email || "", autocomplete: "off" }),
      team: h("input", { type: "text", value: u.team || "", list: "kk-equipes", autocomplete: "off" }), job: h("input", { type: "text", value: u.job || "", autocomplete: "off" }),
      entry_date: h("input", { type: "date", value: u.entry_date || "" }), exit_date: h("input", { type: "date", value: u.exit_date || "" }),
      tracked_from: h("input", { type: "date", value: u.tracked_from || "" }),
    };
    const responsable = h("select", { value: u.manager_id || "" }, h("option", { value: "" }, "Aucun (validé par les RH)"),
      liste.employees.filter((e) => e.id !== u.id && (e.active || e.id === u.manager_id)).map((e) => h("option", { value: e.id }, `${e.name}${e.team ? ` · ${e.team}` : ""}`)));
    const role = h("select", { value: u.role, disabled: !estAdmin() }, Object.entries(ROLES).map(([v, l]) => h("option", { value: v }, l)));
    const details = {
      civilite: h("select", { value: det.civilite || "" }, ["", "Mme", "M."].map((x) => h("option", { value: x }, x || "—"))),
      telephone: h("input", { type: "tel", value: det.telephone || "", autocomplete: "off" }),
      type_contrat: h("select", { value: det.type_contrat || "" }, ["", "CDI", "CDD", "Alternance", "Stage", "Autre"].map((x) => h("option", { value: x }, x || "—"))),
      categorie: h("select", { value: det.categorie || "" }, ["", "Employé", "Agent de maîtrise", "Cadre"].map((x) => h("option", { value: x }, x || "—"))),
      etablissement: h("input", { type: "text", value: det.etablissement || "", autocomplete: "off" }),
    };
    const horaire = nouveau ? editeurHoraire(null, cycles, () => val(champs.entry_date)) : null;
    // identifiant proposé à partir du prénom et du nom
    if (nouveau) {
      const propose = () => { if (champs.login.dataset.touche) return; const p = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, ""); const a = p(champs.first_name.value), b = p(champs.last_name.value); champs.login.value = a && b ? `${a}.${b}` : a || b; };
      champs.first_name.addEventListener("input", propose); champs.last_name.addEventListener("input", propose);
      champs.login.addEventListener("input", () => { champs.login.dataset.touche = "1"; });
    }
    const corpsEnvoi = () => {
      const b = { manager_id: responsable.value, details: { ...det } };
      for (const [k, el] of Object.entries(champs)) b[k] = val(el);
      for (const [k, el] of Object.entries(details)) { const v = val(el); if (v) b.details[k] = v; else delete b.details[k]; }
      if (estAdmin()) b.role = role.value;
      return b;
    };
    const enregistrer = h("button", { class: "domaine", type: "submit" }, nouveau ? "Créer la fiche" : "Enregistrer");
    const formulaire = h("form", { class: "carte", novalidate: true, onsubmit: (ev) => { ev.preventDefault(); agir(enregistrer, async () => {
      const b = corpsEnvoi();
      if (!b.last_name) throw new Error("Le nom est obligatoire.");
      if (nouveau) {
        b.contract = horaire.lire();
        const r = await api("rh/employee-save", b);
        history.replaceState(null, "", `#/rh/fiche/${r.user.id}`);
        recharger();
        montrerCode({ code: r.code, login: r.user.login, name: r.user.name, expires: r.user.code_expires });
      } else {
        b.id = u.id; b.version = u.version;
        await api("rh/employee-save", b);
        toast("Fiche enregistrée."); recharger();
      }
    }); } },
      h("h3", null, "Identité et poste"),
      h("div", { class: "grille2" }, champ("Prénom", champs.first_name), champ("Nom", champs.last_name)),
      h("div", { class: "grille2" }, champ("Identifiant de connexion", champs.login), champ("Matricule de paie", champs.matricule, "Sert à l'export Silae.")),
      h("div", { class: "grille2" }, champ("Équipe", champs.team), champ("Poste", champs.job)),
      h("datalist", { id: "kk-equipes" }, [...new Set(liste.employees.map((e) => e.team).filter(Boolean))].sort().map((t) => h("option", { value: t }))),
      champ("Responsable (valide les pointages et les congés)", responsable),
      h("div", { class: "grille2" }, champ("Date d'entrée", champs.entry_date), champ("Date de sortie", champs.exit_date, "Le compte se ferme seul le lendemain.")),
      champ("Début du suivi dans Kokolio", champs.tracked_from, `Vide : le suivi commence à la mise en service de l'outil${f?.go_live ? ` (${frCourt(f.go_live)})` : ""}, ou à l'entrée du salarié. Une date plus tardive permet de déployer équipe par équipe : rien n'est attendu de ce salarié avant.`),
      h("div", { class: "grille3" }, champ("Civilité", details.civilite), champ("Type de contrat", details.type_contrat), champ("Catégorie", details.categorie)),
      h("div", { class: "grille2" }, champ("Téléphone", details.telephone), champ("Établissement", details.etablissement)),
      h("div", { class: "grille2" }, champ("E-mail", champs.email), champ("Profil", role, estAdmin() ? "RH : voit et gère tous les salariés. Administrateur : en plus, les réglages et les profils." : "Seul un administrateur peut le modifier.")),
      nouveau ? [h("span", { class: "eyebrow" }, "Temps de travail à l'entrée"), horaire.noeud] : null,
      h("div", { class: "ligne" }, h("button", { type: "button", onclick: () => aller("#/rh/salaries") }, nouveau ? "Annuler" : "‹ Salariés"), enregistrer));

    if (nouveau) return pose(h("h2", null, "Nouveau salarié"), formulaire,
      h("p", { class: "discret" }, "À la création, un code d'activation s'affiche : remettez-le au salarié pour qu'il choisisse son mot de passe."));

    const cp = f.balances.cp, rtt = f.balances.rtt, courant = f.contracts.find((c) => c.start_date <= f.today && (!c.end_date || c.end_date >= f.today));
    const soi = u.id === S.boot.me.id, peutCode = !soi && (u.role === "salarie" || estAdmin());
    const ligne = (a, b) => h("div", { class: "ligne" }, h("span", null, a), h("span", { class: "num" }, b));
    pose(h("div", { class: "ligne" }, h("h2", null, u.name), h("div", { class: "ligne gauche" }, etatCompte({ ...u, active: !u.disabled && (!u.exit_date || u.exit_date >= f.today) }),
        h("button", { onclick: () => aller(`#/rh/salarie/${u.id}`) }, "Mois en cours"), h("button", { onclick: () => aller(`#/rh/annee/${u.id}`) }, "Année"), h("button", { onclick: () => aller(`#/rh/journal/${u.id}`) }, "Journal"))),
      formulaire,
      h("div", { class: "carte" }, h("h3", null, "Compte et accès"),
        h("p", null, u.disabled ? "Compte désactivé : la connexion est impossible." : u.activated ? "Le salarié a activé son compte et choisi son mot de passe." : u.code_pending ? `Un code d'activation est en attente, valable jusqu'au ${frHorodatage(u.code_expires)}.` : "Compte jamais activé, aucun code valide."),
        u.locked ? h("p", { class: "bandeau refus" }, "Compte bloqué quinze minutes après cinq mots de passe erronés. Un nouveau code d'activation le débloque aussitôt.") : null,
        h("div", { class: "ligne gauche" },
          peutCode ? h("button", { onclick: (ev) => agir(ev.currentTarget, async () => { const c = await api("team/code", { user_id: u.id }); recharger(); montrerCode(c); }) }, u.activated ? "Mot de passe oublié : nouveau code" : "Générer un code d'activation") : null,
          !soi && (u.role !== "admin" || estAdmin()) ? h("button", { class: u.disabled ? "" : "danger", onclick: () => confirmer(u.disabled ? "Réactiver ce compte" : "Désactiver ce compte",
            u.disabled ? "Le salarié pourra de nouveau se connecter." : "Le salarié est déconnecté immédiatement et ne peut plus se connecter. Ses données sont conservées.", u.disabled ? "Réactiver" : "Désactiver",
            async () => { await api("rh/employee-save", { ...corpsOrigine(u), disabled: !u.disabled }); toast(u.disabled ? "Compte réactivé." : "Compte désactivé."); recharger(); }, { danger: !u.disabled }) }, u.disabled ? "Réactiver le compte" : "Désactiver le compte") : null),
        !peutCode && !soi ? h("p", { class: "discret" }, "Seul un administrateur peut générer un code pour un compte RH ou administrateur.") : null),
      h("div", { class: "carte" }, h("h3", null, "Temps de travail"),
        f.contracts.length ? h("p", null, h("strong", null, "En vigueur : "), resumeHoraire(courant))
          : h("p", { class: "bandeau info" }, h("strong", null, "Compte hors pointage"), "Aucun horaire n'est défini : rien n'est attendu de ce compte au pointage et il n'entre pas dans la clôture. Définissez un horaire pour qu'il pointe comme les autres."),
        f.contracts.length > 1 ? h("div", { class: "pile" }, h("span", { class: "eyebrow" }, "Historique"),
          [...f.contracts].reverse().map((c) => h("div", { class: "ligne" }, h("span", null, c.start_date > f.today ? `À partir du ${frCourt(c.start_date)}` : `${frCourt(c.start_date)} → ${c.end_date ? frCourt(c.end_date) : "aujourd'hui"}`), h("span", { class: "discret" }, resumeHoraire(c))))) : null,
        courant?.cycle ? apercuCycle(courant.cycle) : null,
        h("div", { class: "ligne gauche" }, h("button", { onclick: () => dialogueHoraire(u, courant || f.contracts[f.contracts.length - 1], f) }, f.contracts.length ? "Changer l'horaire à partir d'une date" : "Définir un horaire"),
          f.contracts.length ? h("button", { onclick: () => aller("#/rh/planning") }, "Voir le planning") : null),
        h("p", { class: "discret" }, "Un changement d'horaire, de cycle ou de mode de présence s'applique à partir de sa date d'effet : les mois passés gardent l'horaire de l'époque. Les cycles se créent dans Planning › Horaires et cycles.")),
      h("div", { class: "carte" }, h("h3", null, `Soldes ${f.year}`),
        ligne("Congés payés : report et ajustements", fmtJ(cp.entries)), ligne("Congés payés acquis depuis janvier", fmtJ(cp.accrued)), ligne("Congés payés pris", fmtJ(cp.taken)),
        cp.waiting ? ligne("Demandes en attente", fmtJ(cp.waiting)) : null, h("div", { class: "ligne" }, h("strong", null, "Solde de congés payés"), h("strong", { class: "num" }, fmtJ(cp.balance))),
        ligne("RTT : droits de l'année", fmtJ(rtt.rights)), ligne("RTT pris", fmtJ(rtt.taken)), h("div", { class: "ligne" }, h("strong", null, "Solde de RTT"), h("strong", { class: "num" }, fmtJ(rtt.balance))),
        f.entries.length ? h("div", { class: "pile" }, h("span", { class: "eyebrow" }, "Écritures"),
          f.entries.map((e) => h("div", { class: "ligne" }, h("span", null, `${e.year} · ${e.kind === "cp" ? "CP" : "RTT"} · ${e.reason}`), h("span", { class: "num " + (e.amount < 0 ? "moins" : "") }, (e.amount > 0 ? "+ " : "− ") + fmtJ(Math.abs(e.amount)))))) : null,
        h("div", { class: "ligne gauche" }, h("button", { onclick: () => dialogueEcriture(u, f.year) }, "Ajouter une écriture")),
        h("p", { class: "discret" }, "Une écriture ne se modifie pas : pour corriger, passez l'écriture inverse. Chaque écriture est inscrite au journal.")));
  });
}
// Champs d'une fiche tels qu'enregistrés, pour un changement qui ne touche qu'un interrupteur.
const corpsOrigine = (u) => ({ id: u.id, version: u.version, login: u.login, first_name: u.first_name, last_name: u.last_name, matricule: u.matricule, email: u.email || "", team: u.team, job: u.job,
  manager_id: u.manager_id || "", entry_date: u.entry_date || "", exit_date: u.exit_date || "" });   // le début de suivi n'est pas envoyé : il est conservé tel quel

function dialogueHoraire(u, actuel, f) {
  const ed = editeurHoraire(actuel, f.cycles || [], () => date.value);
  const dernierClos = f.closed.length ? f.closed[f.closed.length - 1] : "";
  const [y, m] = dernierClos ? dernierClos.split("-").map(Number) : [0, 0];
  const min = dernierClos ? `${m === 12 ? y + 1 : y}-${pad(m === 12 ? 1 : m + 1)}-01` : "";
  const prochain = (() => { const t = f.today; const d = new Date(+t.slice(0, 4), +t.slice(5, 7), 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`; })();
  const date = h("input", { type: "date", required: true, min, value: prochain });
  ouvrir(`Changer l'horaire de ${u.name}`, [
    champ("Date d'effet", date, min ? `Au plus tôt le ${frCourt(min)} : les mois clôturés ne changent plus.` : "Le nouvel horaire s'applique à partir de ce jour."), ed.noeud,
  ], "Appliquer", async () => {
    if (!date.value) throw new Error("Indiquez la date d'effet.");
    await api("rh/contract", { user_id: u.id, start_date: date.value, contract: ed.lire() });
    toast("Nouvel horaire enregistré."); recharger();
  }, { large: true });
}
function dialogueEcriture(u, annee) {
  const kind = h("select", null, h("option", { value: "cp" }, "Congés payés"), h("option", { value: "rtt" }, "RTT"));
  const an = h("input", { type: "number", value: annee, min: 2000, max: 2100 });
  const montant = h("input", { type: "text", inputmode: "decimal", placeholder: "Exemple : 2,5 ou -1", required: true });
  const motif = h("input", { type: "text", maxlength: 200, required: true, placeholder: "Exemple : droits RTT de l'année, jours de fractionnement" });
  ouvrir(`Écriture de solde pour ${u.name}`, [h("div", { class: "grille2" }, champ("Compteur", kind), champ("Année", an)), champ("Jours (négatif pour retirer)", montant), champ("Motif", motif)], "Ajouter", async () => {
    const n = Number(val(montant).replace(",", ".").replace("−", "-"));
    if (!Number.isFinite(n) || n === 0) throw new Error("Nombre de jours illisible.");
    await api("rh/balance", { user_id: u.id, kind: kind.value, year: +an.value, amount: n, reason: val(motif) });
    toast("Écriture ajoutée."); recharger();
  });
}

/* ================= Import ================= */
async function lireFichier(file) {
  const buf = await file.arrayBuffer();
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); }
  catch { return new TextDecoder("windows-1252").decode(buf); } // fichier enregistré par Excel au format « CSV » classique
}
export function vueImport() {
  S.jeton++;
  const fichier = h("input", { type: "file", accept: ".csv,.txt,text/csv,text/plain" });
  const texte = h("textarea", { rows: 6, placeholder: "…ou collez ici les lignes copiées depuis votre tableur, ligne d'en-tête comprise", spellcheck: "false" });
  const zone = h("div", { class: "pile" });
  fichier.addEventListener("change", async () => { if (fichier.files[0]) { texte.value = await lireFichier(fichier.files[0]); verifier(); } });
  const verifier = () => agir(bouton, async () => {
    if (!texte.value.trim()) throw new Error("Choisissez un fichier ou collez des lignes.");
    const p = await api("rh/import-preview", { text: texte.value });
    const bloque = p.errors.length > 0 || p.invalid > 0 || !p.rows.length;
    remplir(zone, 
      p.errors.length ? h("p", { class: "bandeau refus" }, p.errors.join(" ")) : null,
      p.unknown_columns.length ? h("p", { class: "bandeau" }, `Colonnes ignorées (nom non reconnu) : ${p.unknown_columns.join(", ")}.`) : null,
      p.rows.length ? h("div", { class: "tuiles" }, tuile("À créer", String(p.create)), tuile("À mettre à jour", String(p.update), "mot de passe inchangé"), tuile("Lignes en erreur", String(p.invalid), p.invalid ? "à corriger dans le fichier" : "aucune", p.invalid ? "moins" : "")) : null,
      p.rows.length ? h("div", { class: "table-zone" }, h("table", null, h("thead", null, h("tr", null, ["Ligne", "Nom", "Identifiant", "Matricule", "Équipe", "Responsable", "Temps de travail", "Début du suivi", "CP", "RTT", "Résultat"].map((x) => h("th", null, x)))),
        h("tbody", null, p.rows.map((r) => h("tr", { class: r.errors.length ? "erreur" : "" }, h("td", { class: "num" }, r.line), h("td", null, r.name), h("td", { class: "mono" }, r.login), h("td", { class: "num" }, r.matricule || "—"), h("td", null, r.team || "—"),
          h("td", { class: "mono" }, r.manager_login || "—"), h("td", { class: "num" }, [r.cycle ? `Cycle « ${r.cycle} »` : r.regime === "forfait_jours" ? "Forfait jours" : fmtMin(r.weekly_minutes), r.presence === "automatique" ? "sans pointage" : null].filter(Boolean).join(" · ")),
          h("td", { class: "num" }, r.tracked_from ? frCourt(r.tracked_from) : "—"), h("td", { class: "num" }, r.cp == null ? "—" : fmtNb(r.cp)), h("td", { class: "num" }, r.rtt == null ? "—" : fmtNb(r.rtt)),
          h("td", { class: "large" }, r.errors.length ? r.errors.join(" ; ") : r.exists ? "Mise à jour" : "Création")))))) : null,
      bloque ? (p.rows.length ? h("p", { class: "bandeau refus" }, "L'import est tout ou rien : corrigez les lignes en erreur dans le fichier, puis vérifiez de nouveau.") : null)
        : h("div", { class: "ligne gauche" }, h("button", { class: "domaine", onclick: (ev) => agir(ev.currentTarget, async () => {
          const r = await api("rh/import", { text: texte.value });
          const msg = `${r.created.length} compte(s) créé(s), ${r.updated.length} fiche(s) mise(s) à jour${r.tracked?.length ? `, dont ${r.tracked.length} début(s) de suivi déplacé(s)` : ""}.`;
          if (r.created.length) ecranCodes(r.created, msg); else { toast(msg); aller("#/rh/salaries"); }
        }) }, `Importer ${p.rows.length} ligne${p.rows.length > 1 ? "s" : ""}`)));
  });
  const bouton = h("button", { class: "domaine", onclick: verifier }, "Vérifier le fichier");
  pose(h("div", { class: "ligne" }, h("h2", null, "Importer des salariés"), h("button", { onclick: () => aller("#/rh/salaries") }, "‹ Salariés")),
    h("div", { class: "carte" }, h("h3", null, "1. Préparer le fichier"),
      h("p", null, "Un tableau avec une ligne d'en-tête et une ligne par salarié, enregistré au format CSV. Seule la colonne « nom » est obligatoire."),
      h("ul", null, h("li", null, "Colonnes reconnues : identifiant, nom, prenom, matricule, email, equipe, poste, responsable (son identifiant), date_entree, date_sortie, regime (horaire ou forfait), heures_hebdo, jours_travailles (exemple : lun-ven), pause, solde_cp, droits_rtt, debut_suivi, presence (pointage ou automatique), cycle (son nom dans la bibliothèque)."),
        h("li", null, "Sans colonne identifiant, il est fabriqué : prenom.nom."), h("li", null, "Un salarié déjà présent (même identifiant) est mis à jour ; son mot de passe, son horaire et ses soldes ne changent pas."),
        h("li", null, "solde_cp : jours de congés restant à prendre à la date de mise en service. droits_rtt : droits de l'année."),
        h("li", null, "debut_suivi : premier jour où le salarié est suivi, pour déployer équipe par équipe ou repousser un lancement. Pour une fiche déjà présente, la date est déplacée quand la colonne est remplie (sauf si un mois clôturé se trouve entre l'ancienne et la nouvelle).")),
      h("div", { class: "ligne gauche" }, h("button", { onclick: (ev) => agir(ev.currentTarget, async () => { const t = await api("rh/import-template"); telecharger(t.filename, t.text); }) }, "Télécharger le modèle (CSV)"))),
    h("div", { class: "carte" }, h("h3", null, "2. Vérifier"), h("label", null, "Fichier CSV", fichier), texte, h("div", { class: "ligne gauche" }, bouton),
      h("p", { class: "discret" }, "Rien n'est enregistré à cette étape : vous voyez d'abord ce qui sera créé ou modifié.")),
    zone);
}

/* ================= Report des congés ================= */
export function vueReport(annee) {
  const courant = +S.boot.today.slice(0, 4), y = /^\d{4}$/.test(annee) ? +annee : courant - 1;
  ecran(() => api("rh/rollover-preview", { year: y }), (d) => {
    const aFaire = d.rows.filter((r) => !r.done && r.amount !== 0);
    // écritures par fichier : droits RTT de l'année, corrections en nombre
    const fichier = h("input", { type: "file", accept: ".csv,.txt,text/csv,text/plain" }), texte = h("textarea", { rows: 4, spellcheck: "false", placeholder: "identifiant;matricule;compteur;annee;jours;motif" }), zone = h("div", { class: "pile" });
    fichier.addEventListener("change", async () => { if (fichier.files[0]) { texte.value = await lireFichier(fichier.files[0]); verifier.click(); } });
    const verifier = h("button", { onclick: (ev) => agir(ev.currentTarget, async () => {
      if (!texte.value.trim()) throw new Error("Choisissez un fichier ou collez des lignes.");
      const p = await api("rh/balances-import", { text: texte.value });
      remplir(zone, p.errors.length ? h("p", { class: "bandeau refus" }, p.errors.join(" ")) : null,
        p.rows.length ? h("div", { class: "table-zone" }, h("table", null, h("thead", null, h("tr", null, ["Ligne", "Salarié", "Compteur", "Année", "Jours", "Motif", "Résultat"].map((x) => h("th", null, x)))),
          h("tbody", null, p.rows.slice(0, 400).map((r) => h("tr", { class: r.errors.length ? "erreur" : "" }, h("td", { class: "num" }, r.line), h("td", null, r.name), h("td", null, r.kind === "rtt" ? "RTT" : r.kind === "cp" ? "CP" : "—"), h("td", { class: "num" }, r.year || "—"),
            h("td", { class: "num" }, r.amount == null ? "—" : fmtNb(r.amount)), h("td", { class: "large" }, r.reason), h("td", { class: "large" }, r.errors.length ? r.errors.join(" ; ") : "Prête")))))) : null,
        p.rows.length > 400 ? h("p", { class: "discret" }, `… et ${p.rows.length - 400} autres lignes.`) : null,
        p.invalid || p.errors.length || !p.rows.length ? (p.rows.length ? h("p", { class: "bandeau refus" }, "Tout ou rien : corrigez les lignes en erreur, puis vérifiez de nouveau.") : null)
          : h("div", { class: "ligne gauche" }, h("button", { class: "domaine", onclick: () => confirmer("Enregistrer les écritures", `${p.valid} écriture${p.valid > 1 ? "s" : ""} ${p.valid > 1 ? "seront ajoutées" : "sera ajoutée"} aux soldes. Une écriture ne se supprime pas : en cas d'erreur, il faudra passer l'écriture inverse. Ne renvoyez pas deux fois le même fichier.`, "Enregistrer", async () => {
            const r = await api("rh/balances-import", { text: texte.value, apply: true }); toast(`${r.created} écriture(s) enregistrée(s).`); texte.value = ""; remplir(zone, );
          }) }, `Enregistrer ${p.valid} écriture${p.valid > 1 ? "s" : ""}`)));
    }) }, "Vérifier le fichier");
    pose(h("div", { class: "ligne" }, h("h2", null, `Report des congés ${y} → ${y + 1}`), h("button", { onclick: () => aller("#/rh/salaries") }, "‹ Salariés")),
      h("div", { class: "carte" }, h("h3", null, "Principe"),
        h("p", null, `Le solde de congés payés restant au 31 décembre ${y} (report, acquisitions de l'année, moins les jours pris) devient l'écriture de report de ${y + 1}. L'opération est rejouable : un salarié déjà reporté est ignoré.`),
        d.year_ended ? null : h("p", { class: "bandeau" }, `L'année ${y} n'est pas terminée : le report sera possible à partir du 1er janvier ${y + 1}.`),
        h("div", { class: "ligne gauche" }, h("button", { class: "domaine", disabled: !d.year_ended || !aFaire.length, onclick: () => confirmer("Reporter les soldes", `${aFaire.length} écriture${aFaire.length > 1 ? "s" : ""} de report ${aFaire.length > 1 ? "seront créées" : "sera créée"} sur ${y + 1}. Les soldes négatifs sont reportés tels quels.`, "Reporter", async () => {
          const r = await api("rh/rollover", { year: y }); toast(`${r.created} report(s) créé(s).`); recharger();
        }) }, aFaire.length ? `Reporter ${aFaire.length} solde${aFaire.length > 1 ? "s" : ""}` : "Tout est déjà reporté"),
          y < courant - 1 || y >= courant ? h("button", { onclick: () => aller(`#/rh/report/${courant - 1}`) }, `Année ${courant - 1}`) : h("button", { onclick: () => aller(`#/rh/report/${courant}`) }, `Aperçu ${courant}`))),
      h("div", { class: "carte" }, h("h3", null, `Soldes au 31 décembre ${y}`),
        h("div", { class: "table-zone" }, h("table", null, h("thead", null, h("tr", null, h("th", null, "Salarié"), h("th", null, "Équipe"), h("th", { class: "d" }, "Solde à reporter"), h("th", null, "État"))),
          h("tbody", null, d.rows.length ? d.rows.map((r) => h("tr", null, h("td", null, r.name), h("td", null, r.team || "—"), h("td", { class: "d num " + (r.amount < 0 ? "moins" : "") }, fmtJ(r.amount)),
            h("td", null, r.done ? etiquette("Reporté", "p-ok") : r.amount === 0 ? etiquette("Rien à reporter", "p-gris") : etiquette("À reporter", "p-attente")))) : h("tr", null, h("td", { colspan: 4, class: "vide" }, "Aucun salarié.")))))),
      h("div", { class: "carte" }, h("h3", null, "Écritures de solde par fichier"),
        h("p", null, "Pour créditer en une fois les droits RTT de l'année, ou passer des corrections en nombre. Une ligne par écriture : identifiant ou matricule, compteur (cp ou rtt), année, jours (négatif pour retirer), motif."),
        h("div", { class: "ligne gauche" }, h("button", { onclick: (ev) => agir(ev.currentTarget, async () => { const t = await api("rh/balances-import", { template: true }); telecharger(t.filename, t.text); }) }, "Télécharger le modèle (CSV)")),
        h("label", null, "Fichier CSV", fichier), texte, h("div", { class: "ligne gauche" }, verifier), zone));
  });
}

/* ================= Clôture et export paie ================= */
export function vueCloture() {
  ecran(() => api("rh/closures"), (d) => {
    pose(h("h2", null, "Clôture et export paie"),
      h("div", { class: "carte" }, h("h3", null, "Principe"),
        h("p", null, "La clôture fige les chiffres d'un mois terminé et produit le fichier pour la paie. Après clôture, plus personne ne peut modifier le mois, ni par l'outil ni directement dans la base."),
        h("p", { class: "discret" }, "Un mois se clôture quand toutes ses journées sont validées et qu'aucune demande d'absence n'est en attente. Une réouverture demande un motif ; la clôture suivante crée une nouvelle version, l'ancienne reste consultable."),
        h("p", { class: "discret" }, `Format du fichier des prochaines clôtures : ${d.format === "sage" ? "Sage Paie (lignes EV, VB et VM)" : "colonnes séparées (CSV)"}. Il se choisit dans Administration › Réglages.`)),
      d.months.length ? d.months.map((mo) => {
        const derniere = mo.versions[0];
        return h("div", { class: "carte" }, h("div", { class: "ligne" }, h("strong", { class: "titre-mois" }, frMois(mo.month)),
            mo.closed ? etiquette(`Clôturé · version ${derniere.version}`, "p-ok") : derniere ? etiquette("Rouvert", "p-attente") : etiquette("Ouvert", "p-neutre")),
          mo.closed && derniere.totals ? h("p", { class: "discret" }, `${derniere.totals.employees} salariés · ${fmtMin(derniere.totals.worked)} travaillées · ${fmtJ(derniere.totals.abs_days)} d'absence`) : null,
          h("div", { class: "ligne gauche" },
            mo.closed ? h("button", { class: "domaine", onclick: (ev) => agir(ev.currentTarget, () => exporter(mo.month, derniere.version)) }, "Télécharger l'export paie") : h("button", { class: "domaine", onclick: (ev) => agir(ev.currentTarget, () => preparer(mo.month)) }, "Préparer la clôture"),
            mo.closed ? h("button", { onclick: (ev) => agir(ev.currentTarget, () => detailCloture(mo.month, derniere.version)) }, "Voir les chiffres figés") : null,
            mo.closed ? h("button", { class: "danger", onclick: () => demanderMotif(`Rouvrir ${frMois(mo.month)}`, "Le mois redevient modifiable. Il faudra le clôturer de nouveau, ce qui produira une nouvelle version de l'export : prévenez la paie.", "Rouvrir le mois",
              async (m) => { await api("rh/reopen", { month: mo.month, reason: m }); toast("Mois rouvert."); recharger(); }, { danger: true, min: 5, label: "Motif de la réouverture" }) }, "Rouvrir") : null),
          mo.versions.length ? h("div", { class: "pile" }, h("span", { class: "eyebrow" }, "Historique"), mo.versions.map((v) => h("div", { class: "pile" },
            h("div", { class: "ligne" }, h("span", null, `Version ${v.version} · clôturée le ${frHorodatage(v.closed_at)} par ${v.closed_by || "—"}`),
              h("button", { class: "lien", onclick: (ev) => agir(ev.currentTarget, () => exporter(mo.month, v.version)) }, "Export de cette version")),
            v.status === "rouvert" ? h("div", { class: "discret" }, `Rouverte le ${frHorodatage(v.reopened_at)} par ${v.reopened_by || "—"} : ${v.reopen_reason}`) : null,
            h("div", { class: "discret mono" }, `Empreinte du fichier : ${v.export_sha256}`)))) : null);
      }) : h("div", { class: "carte" }, h("p", { class: "vide" }, "Aucun mois terminé depuis la mise en service.")),
      h("p", { class: "discret" }, `Le mois en cours (${frMois(d.current)}) pourra être clôturé à partir du 1er du mois suivant.`));
  });
}
async function exporter(month, version) {
  const e = await api("rh/export", version ? { month, version } : { month });
  // le fichier Sage est du texte sans accent, à largeur fixe : il part tel quel, sans marque d'encodage
  telecharger(e.filename, e.text, e.format === "sage" ? "text/plain;charset=us-ascii" : undefined);
  toast(e.draft ? "Brouillon téléchargé : il n'a aucune valeur tant que le mois n'est pas clôturé." : "Export téléchargé. Le téléchargement est inscrit au journal.");
}
async function preparer(month) {
  const c = await api("rh/closure-check", { month });
  const bloque = !c.ended || c.pending_days > 0 || c.pending_absences > 0;
  ouvrir(`Clôturer ${frMois(month)}`, [
    !c.ended ? h("p", { class: "bandeau refus" }, "Ce mois n'est pas terminé.") : null,
    c.pending_days ? h("div", { class: "bandeau refus" }, h("strong", null, `${c.pending_days} journée${c.pending_days > 1 ? "s" : ""} non validée${c.pending_days > 1 ? "s" : ""}`), "Elles bloquent la clôture. Relancez les responsables, ou validez-les vous-même.",
      h("div", { class: "ligne" }, h("button", { type: "button", class: "petit", onclick: () => { document.getElementById("dlg").close(); aller("#/rh/validation"); } }, "Ouvrir la validation"))) : null,
    c.pending_absences ? h("p", { class: "bandeau refus" }, `${c.pending_absences} demande${c.pending_absences > 1 ? "s" : ""} d'absence en attente sur ce mois : à valider ou refuser avant de clôturer.`) : null,
    !bloque ? h("p", { class: "bandeau ok" }, "Toutes les journées sont validées et aucune demande n'est en attente.") : null,
    h("div", { class: "tuiles" }, tuile("Salariés", String(c.totals.employees)), tuile("Heures", fmtMin(c.totals.worked)), tuile("Absences", fmtJ(c.totals.abs_days))),
    c.empty.length ? h("div", { class: "bandeau" }, h("strong", null, `${c.totals.empty_days} jour${c.totals.empty_days > 1 ? "s" : ""} sans pointage ni absence`), "Ils ne bloquent pas la clôture, mais ils compteront comme non travaillés et non justifiés.",
      c.empty.slice(0, 12).map((e) => h("div", null, `${e.name} : ${e.days.map((x) => frCourt(x).slice(0, 5)).join(", ")}`)), c.empty.length > 12 ? h("div", null, `… et ${c.empty.length - 12} autres salariés`) : null) : null,
    c.no_matricule.length ? h("div", { class: "bandeau" }, h("strong", null, `${c.no_matricule.length} salarié${c.no_matricule.length > 1 ? "s" : ""} sans matricule`), "Dans l'export, leur identifiant remplacera le matricule : la paie ne saura pas les rattacher.",
      h("div", null, c.no_matricule.slice(0, 15).join(", "))) : null,
    c.sage?.no_code.length ? h("div", { class: "bandeau" }, h("strong", null, `${c.sage.no_code.length} motif${c.sage.no_code.length > 1 ? "s" : ""} sans code de paie`), "Leurs absences partiront avec un code vide, que Sage refusera. Renseignez le code dans Administration › Motifs.",
      h("div", null, c.sage.no_code.join(", "))) : null,
    c.sage?.long_code.length ? h("div", { class: "bandeau" }, h("strong", null, "Code de paie de plus de quatre caractères"), "Au format Sage, le code d'un motif est coupé au quatrième caractère.", h("div", null, c.sage.long_code.join(", "))) : null,
    c.sage?.long_matricule.length ? h("div", { class: "bandeau" }, h("strong", null, `${c.sage.long_matricule.length} matricule${c.sage.long_matricule.length > 1 ? "s" : ""} de plus de dix caractères`), "Au format Sage, le matricule est coupé au dixième caractère.",
      h("div", null, c.sage.long_matricule.slice(0, 15).join(", "))) : null,
    h("div", { class: "ligne gauche" }, h("button", { type: "button", onclick: (ev) => agir(ev.currentTarget, () => exporter(month)) }, "Télécharger le brouillon de l'export")),
    h("p", { class: "discret" }, "Une fois le mois clôturé, ses chiffres et son export sont figés. Toute correction passera par une réouverture motivée."),
  ], bloque ? null : "Clôturer le mois", async () => {
    const r = await api("rh/close", { month });
    toast(`Clôture enregistrée : ${frMois(month)}, version ${r.version}.`); recharger();
  }, { large: true });
}
async function detailCloture(month, version) {
  const c = await api("rh/closure-detail", { month, version });
  const s = c.snapshot;
  ouvrir(`${frMois(month)} · version ${version}`, [
    h("p", { class: "discret" }, `Chiffres figés le ${frHorodatage(c.closed_at)}.`),
    h("div", { class: "table-zone" }, h("table", null, h("thead", null, h("tr", null, h("th", null, "Salarié"), h("th", null, "Matricule"), h("th", { class: "d" }, "Travaillé"), h("th", { class: "d" }, "Prévu"), h("th", { class: "d" }, "Absences"))),
      h("tbody", null, s.employees.map((e) => h("tr", null, h("td", null, e.name), h("td", { class: "num" }, e.matricule || "—"), h("td", { class: "d num" }, e.regime === "forfait_jours" ? `${fmtNb(e.days_worked)} j` : fmtMin(e.worked)),
        h("td", { class: "d num" }, e.regime === "forfait_jours" ? "forfait" : fmtMin(e.theo)), h("td", { class: "d num" }, e.abs_days ? fmtJ(e.abs_days) : "—")))))),
  ], null, null, { large: true });
}

/* ================= Journal ================= */
const ACTIONS = { connexion: "Connexion", compte_active: "Compte activé", compte_bloque: "Compte bloqué", mot_de_passe_change: "Mot de passe changé", code_activation_genere: "Code d'activation généré",
  correction: "Journée corrigée", correction_par_rh: "Journée corrigée par les RH", pointages_valides: "Journées validées", pointage_refuse: "Journée refusée", pointage_rouvert: "Journée rouverte",
  absence_demandee: "Absence demandée", absence_saisie_par_rh: "Absence saisie par les RH", absence_annulee: "Demande annulée par le salarié", absence_validee: "Absence validée", absence_refusee: "Absence refusée",
  absence_annulee_par_responsable: "Absence validée annulée", justificatif_depose: "Justificatif déposé", justificatif_consulte: "Justificatif consulté", fiche_creee: "Fiche créée", fiche_modifiee: "Fiche modifiée",
  horaire_modifie: "Horaire modifié", import_salaries: "Import de salariés", solde_ajuste: "Solde ajusté", soldes_reportes: "Soldes reportés", mois_cloture: "Mois clôturé", mois_rouvert: "Mois rouvert",
  export_telecharge: "Export paie téléchargé", donnees_demo_chargees: "Données de démonstration chargées", donnees_demo_effacees: "Données de démonstration effacées", parametres_modifies: "Réglages modifiés", motif_cree: "Motif d'absence créé", motif_modifie: "Motif d'absence modifié", administrateur_initialise: "Administrateur initialisé",
  planning_modifie: "Planning modifié", horaire_type_cree: "Horaire journalier créé", horaire_type_modifie: "Horaire journalier modifié", cycle_cree: "Cycle créé", cycle_modifie: "Cycle modifié", periode_annualisation_creee: "Période d'annualisation créée", periode_annualisation_modifiee: "Période d'annualisation modifiée",
  anomalies_acquittees: "Anomalies acquittées", acquittement_annule: "Acquittement annulé",
  test_copie: "Production copiée vers l'environnement de test",
  objectif_annuel_fixe: "Objectif annuel fixé", objectif_annuel_retire: "Objectif annuel recalculé d'après le planning", objectif_annuel_ajuste: "Objectif annuel ajusté" };
const CLES = { avant: "avant", apres: "après", motif: "motif", du: "du", au: "au", demi: "demi-journée", jours: "jours", justificatif: "justificatif", annee: "année", version: "version", auto_validation: "auto-validation",
  a_compter_du: "à compter du", regime: "régime", pause: "pause", crees: "créés", mis_a_jour: "mis à jour", ecritures: "écritures", ignorees: "ignorées", nom: "nom", role: "profil", deja_active: "compte déjà activé",
  empreinte_export: "empreinte", comptes: "comptes", journees: "journées", absences: "absences", minutes_par_jour: "minutes par jour", cp_par_mois: "CP par mois", forfait_jours: "forfait", login: "identifiant", first_name: "prénom", last_name: "nom", matricule: "matricule", email: "e-mail",
  team: "équipe", job: "poste", manager_id: "responsable", entry_date: "entrée", exit_date: "sortie", disabled: "désactivé", details: "fiche détaillée", company: "entreprise", go_live: "mise en service", label: "libellé",
  category: "famille", export_code: "code d'export", needs_doc: "justificatif demandé", absenteeism: "compte dans l'absentéisme", active: "actif",
  tracked_from: "début du suivi", presence: "présence", cycle: "cycle", semaine_1_du_cycle: "semaine 1 du cycle", night_until: "limite de nuit", minutes: "durée (minutes)", plages: "plages", ranges: "plages",
  nombre: "nombre", commentaire: "commentaire", break_paid_min: "pause payée (min)", anomalies: "anomalies",
  annualise: "annualisé", annual: "effet sur l'annualisation", export_unit: "jours transmis à la paie", export_dates: "dates reportées sur le bulletin", start_date: "début", end_date: "fin", avant_minutes: "avant (minutes)", jour: "jour",
  semaines: "semaines", composition: "composition", weeks: "composition", name: "nom", color: "couleur", detail: "détail", comptes_deja_presents: "comptes déjà présents" };
const ORDRE = ["du", "au", "demi", "jours", "annee", "a_compter_du", "regime", "avant", "apres", "motif", "justificatif", "version"];
function texteDetail(r) {
  const horaire = r.action === "horaire_modifie";
  const dit = (v, k) => {
    if (Array.isArray(v)) {
      if (horaire && k === "jours") return v.map((d) => JOURS[d - 1]?.toLowerCase()).join(", ");
      if (k === "minutes_par_jour") return v.map((m) => ecrireDuree(m) || "—").join(" · ");
      return v.length > 8 ? `${v.slice(0, 8).map((x) => dit(x)).join(", ")}… (${v.length})` : v.map((x) => dit(x)).join(", ") || "—";
    }
    if (v == null || v === "") return "—";
    if (typeof v === "boolean") return v ? "oui" : "non";
    if (typeof v === "object" && v.jour && v.anomalie) return `${frCourt(v.jour).slice(0, 5)} : ${v.anomalie.replace(/_/g, " ")}`;
    if (typeof v === "object" && v.jour) return `${frCourt(v.jour).slice(0, 5)} : ${v.horaire === "par défaut" ? "retour au planning par défaut" : v.minutes === 0 ? "repos" : v.horaire}`;
    if (typeof v === "object") return "…";
    if (typeof v === "number") return fmtNb(v);
    const t = String(v);
    return /^\d{4}-\d{2}-\d{2}$/.test(t) ? frCourt(t) : t === "apres_midi" ? "après-midi" : t === "forfait_jours" ? "forfait jours" : t === "prevus" ? "jours prévus" : t === "calendaires" ? "jours calendaires" : t;
  };
  const rang = (k) => { const i = ORDRE.indexOf(k); return i < 0 ? 99 : i; };
  return Object.entries(r.detail || {}).filter(([, v]) => v != null).sort((a, b) => rang(a[0]) - rang(b[0])).map(([k, v]) => {
    const lib = CLES[k] || k;
    // modification d'une fiche ou d'un réglage : ancienne valeur → nouvelle valeur
    if (Array.isArray(v) && v.length === 2 && ["fiche_modifiee", "parametres_modifies", "motif_cree", "motif_modifie", "horaire_type_modifie", "cycle_modifie", "periode_annualisation_modifiee"].includes(r.action) && k !== "details") {
      // un cycle ou des plages : la composition complète ne tient pas sur une ligne, on signale seulement le changement
      if (k === "weeks" || k === "ranges") return `${lib} : modifiée`;
      return `${lib} : ${dit(v[0], k)} → ${dit(v[1], k)}`;
    }
    if (k === "composition" || k === "plages") return null;
    return `${lib} : ${dit(v, k)}`;
  }).filter(Boolean).join(" · ");
}
// Ce sur quoi porte l'action, en clair : un motif d'absence, un compteur, un jour, un mois.
function cible(r) {
  const t = r.target || "";
  if (!t || /^[0-9a-f-]{36}$/.test(t)) return "";
  if (/^(absence_|justificatif_)/.test(r.action)) return S.boot.types.find((x) => x.code === t)?.label || t;
  if (r.action === "solde_ajuste") return t === "cp" ? "Congés payés" : "RTT";
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return frCourt(t);
  if (/^\d{4}-\d{2}$/.test(t)) return frMois(t);
  return t;
}
export function vueJournal(userId) {
  const etat = { rows: [], total: 0, fin: false, action: "", q: "" };
  const liste = h("div"), plus = h("button", { onclick: (ev) => agir(ev.currentTarget, () => charger(false)) }, "Afficher les plus anciennes");
  const filtreAction = h("select", { "aria-label": "Type d'action" }, h("option", { value: "" }, "Toutes les actions"));
  const recherche = h("input", { type: "search", placeholder: "Nom d'un salarié ou d'un auteur", "aria-label": "Rechercher" });
  const verdict = h("div");
  const dessine = () => {
    liste.replaceChildren(...etat.rows.map((r) => h("div", { class: "entree" }, h("time", { class: "num" }, frHorodatage(r.ts)),
      h("div", null, h("span", { class: "quoi" }, ACTIONS[r.action] || r.action), r.target_name ? ` · ${r.target_name}` : cible(r) ? ` · ${cible(r)}` : "",
        h("span", { class: "discret" }, ` · par ${r.actor_label || "le système"}`)),
      [r.target_name && cible(r) !== r.target_name ? cible(r) : "", texteDetail(r)].filter(Boolean).length ? h("div", { class: "detail" }, [r.target_name ? cible(r) : "", texteDetail(r)].filter(Boolean).join(" · ")) : null)));
    if (!etat.rows.length) liste.append(h("p", { class: "vide" }, "Aucune ligne."));
    plus.hidden = etat.fin;
  };
  const charger = async (debut) => {
    const d = await api("rh/journal", { before: debut || !etat.rows.length ? "" : etat.rows[etat.rows.length - 1].seq, action: etat.action, q: etat.q, user_id: userId || "" });
    etat.rows = debut ? d.rows : etat.rows.concat(d.rows); etat.total = d.total; etat.fin = d.rows.length < 60;
    if (filtreAction.options.length === 1) for (const a of d.actions) filtreAction.append(h("option", { value: a }, ACTIONS[a] || a));
    dessine();
  };
  filtreAction.addEventListener("change", () => { etat.action = filtreAction.value; agir(null, () => charger(true)); });
  let t; recherche.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { etat.q = recherche.value.trim(); agir(null, () => charger(true)); }, 350); });
  const verifier = (btn) => agir(btn, async () => {
    let after = "", n = 0;
    verdict.replaceChildren(h("p", { class: "bandeau info" }, "Vérification en cours…"));
    for (let i = 0; i < 500; i++) {
      const v = await api("rh/journal-verify", { after });
      n += v.checked;
      if (!v.ok) { verdict.replaceChildren(h("div", { class: "bandeau refus" }, h("strong", null, "Le journal a été altéré"), `La chaîne d'empreintes est rompue à la ligne n° ${v.bad_seq} : une ligne a été modifiée, supprimée ou ajoutée en dehors de l'outil. Prévenez l'administrateur.`)); return; }
      if (v.done) { verdict.replaceChildren(h("div", { class: "bandeau ok" }, h("strong", null, "Journal intact"), `${n} ligne${n > 1 ? "s" : ""} vérifiée${n > 1 ? "s" : ""} : aucune n'a été modifiée, supprimée ou insérée après coup.`)); return; }
      after = v.last;
    }
  });
  ecran(() => charger(true), () => {
    pose(h("div", { class: "ligne" }, h("h2", null, userId ? "Journal du salarié" : "Journal des actions"),
        h("div", { class: "ligne gauche" }, userId ? h("button", { onclick: () => aller(`#/rh/fiche/${userId}`) }, "‹ Fiche") : null, userId ? null : h("button", { class: "domaine", onclick: (ev) => verifier(ev.currentTarget) }, "Vérifier l'intégrité"))),
      verdict,
      h("div", { class: "carte" }, h("h3", null, userId ? "Actions le concernant" : `${etat.total} lignes`), h("div", { class: "recherche" }, userId ? null : recherche, filtreAction), liste, h("div", { class: "ligne gauche" }, plus)),
      h("p", { class: "discret" }, "Le journal est en ajout seul : aucune ligne ne peut être modifiée ni supprimée, même par un administrateur. Chaque ligne porte l'empreinte de la précédente."));
    dessine();
  });
}
