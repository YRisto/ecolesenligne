// Administration : réglages, motifs d'absence, état de l'installation, versions et fonctionnalités.
import { api, ENV } from "./api.js";
import { h, pose, toast, agir, ouvrir, confirmer, etiquette, tuile, champ, coche, logo, fmtNb, frHorodatage, frCourt, frMois } from "./dom.js";
import { S, ecran, recharger } from "./etat.js";
import { ecranCodes } from "./rh.js";
import { VERSIONS, MAQUETTES, FONCTIONS, A_VENIR, NON_GERE } from "./versions.js";

const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30);
// Après un changement de réglage, les autres écrans doivent voir la nouvelle valeur.
async function rafraichir() { S.boot = await api("boot"); recharger(); }

/* ================= Réglages ================= */
export function vueReglages() {
  ecran(() => api("admin/settings"), ({ settings: s }) => {
    const x = s.export || {};
    const societe = h("input", { type: "text", value: s.company || "", maxlength: 80, required: true });
    const logoUrl = h("input", { type: "url", value: s.logo_url || "", placeholder: "https://…" });
    const service = h("input", { type: "date", value: s.go_live || "", required: true });
    const heures = (min) => h("input", { type: "text", inputmode: "decimal", value: fmtNb(min / 60) });
    const seuilPause = heures(s.pause_threshold_min), maxJour = heures(s.max_day_min), maxSemaine = heures(s.max_week_min), repos = heures(s.min_rest_min);
    const validite = h("input", { type: "number", min: 1, max: 90, value: s.activation_days });
    const nuit = h("input", { type: "time", value: s.night_until || "" });
    // anomalies liées à l'horaire : tolérances (minutes) et niveau de chaque type ; les valeurs de départ sont celles du calcul
    const an = { ...ANOMALIES_DEFAUT, ...(s.anomalies || {}), levels: { ...ANOMALIES_DEFAUT.levels, ...(s.anomalies?.levels || {}) } };
    const tol = Object.fromEntries(TOLERANCES.map(([k]) => [k, h("input", { type: "number", min: 0, max: 600, step: 1, value: an[k] })]));
    const niv = Object.fromEntries(Object.keys(TYPES_ANOMALIE).map((k) => [k, h("select", { value: an.levels[k] }, NIVEAUX.map(([v, l]) => h("option", { value: v }, l)))]));
    const pausePayee = h("input", { type: "number", min: 0, max: 120, step: 5, value: s.break_paid_min || 0 });
    const lieux = h("div", { class: "pile" });
    const ajouteLieu = (l = { code: "", label: "" }) => {
      const row = h("div", { class: "ligne", "data-code": l.code }, h("input", { type: "text", value: l.label, maxlength: 40, "aria-label": "Nom du lieu", class: "etire" }),
        h("button", { type: "button", "aria-label": "Retirer ce lieu", onclick: () => row.remove() }, "×"));
      lieux.append(row);
    };
    (s.lieux || []).forEach(ajouteLieu);
    const codeHeures = h("input", { type: "text", value: x.hours_code || "", maxlength: 30 });
    const [avecHeuresLib, avecHeures] = coche("Inclure une ligne d'heures travaillées par salarié", { checked: x.include_hours !== false });
    const [enteteLib, entete] = coche("Première ligne d'en-tête (noms de colonnes)", { checked: x.header !== false });
    const sep = h("select", { value: x.sep || ";" }, h("option", { value: ";" }, "Point-virgule"), h("option", { value: "," }, "Virgule"), h("option", { value: "\t" }, "Tabulation"));
    const dec = h("select", { value: x.decimal || "," }, h("option", { value: "," }, "Virgule (7,5)"), h("option", { value: "." }, "Point (7.5)"));
    // format du fichier de paie : colonnes séparées, ou import de Sage Paie (lignes EV, VB, VM à largeur fixe)
    const sg = x.sage || {};
    const format = h("select", { value: x.format === "sage" ? "sage" : "csv" }, h("option", { value: "csv" }, "Colonnes séparées (CSV) : une ligne par élément"), h("option", { value: "sage" }, "Sage Paie : lignes EV, VB et VM à largeur fixe"));
    const vmSource = h("select", { value: sg.vm_source || "" }, h("option", { value: "" }, "Aucune"), h("option", { value: "manque" }, "Heures manquantes (prévu − travaillé)"),
      h("option", { value: "surplus" }, "Heures en plus (travaillé − prévu)"), h("option", { value: "travaille" }, "Heures travaillées"));
    const vmCode = h("input", { type: "text", value: sg.vm_code || "", maxlength: 10, placeholder: "Exemple : HA16", autocapitalize: "characters" });
    const vmType = h("input", { type: "text", inputmode: "numeric", value: sg.vm_type || "255", maxlength: 3 });
    const libelleEv = h("input", { type: "text", value: sg.label ?? "du %DEB au %FIN", maxlength: 30 });
    const blocCsv = h("div", { class: "pile" });
    const blocSage = h("div", { class: "pile" });
    const majFormat = () => { blocCsv.hidden = format.value !== "csv"; blocSage.hidden = format.value !== "sage"; };
    format.addEventListener("change", majFormat);
    const ok = h("button", { class: "domaine", type: "submit" }, "Enregistrer les réglages");
    const enMinutes = (el, nom) => { const n = Number(el.value.trim().replace(",", ".")); if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error(`Valeur illisible : ${nom}.`); return Math.round(n * 60); };
    const remplirBloc = (bloc, ...enfants) => { bloc.append(...enfants.filter(Boolean)); return bloc; };
    majFormat();
    pose(h("h2", null, "Réglages"),
      h("form", { class: "pile", novalidate: true, onsubmit: (ev) => { ev.preventDefault(); agir(ok, async () => {
        const vus = new Set();
        const liste = [...lieux.children].map((row) => { const label = row.querySelector("input").value.trim(); let code = row.dataset.code || slug(label); while (vus.has(code)) code += "2"; vus.add(code); return { code, label }; }).filter((l) => l.label);
        if (!liste.length) throw new Error("Gardez au moins un lieu de travail.");
        if (liste.some((l) => l.code.length < 2)) throw new Error("Un nom de lieu est trop court.");
        if (format.value === "sage" && vmSource.value && !vmCode.value.trim()) throw new Error("Export Sage : indiquez le code de la constante de paie qui reçoit les heures, ou choisissez « Aucune ».");
        if (!/^[A-Za-z0-9_]{0,10}$/.test(vmCode.value.trim()) || !/^[0-9]{0,3}$/.test(vmType.value.trim())) throw new Error("Export Sage : le code de la constante tient en dix lettres ou chiffres, le type d'élément en trois chiffres.");
        if (!/^[ -~]{0,30}$/.test(libelleEv.value.trim())) throw new Error("Export Sage : le libellé des événements s'écrit sans accent, en trente caractères au plus.");
        await api("admin/settings-save", { version: s.version, settings: {
          company: societe.value.trim(), logo_url: logoUrl.value.trim(), go_live: service.value,
          pause_threshold_min: enMinutes(seuilPause, "seuil de pause"), max_day_min: enMinutes(maxJour, "durée par jour"), max_week_min: enMinutes(maxSemaine, "durée par semaine"), min_rest_min: enMinutes(repos, "repos"),
          activation_days: +validite.value, night_until: nuit.value || "", lieux: liste, break_paid_min: Math.round(+pausePayee.value || 0),
          anomalies: { ...Object.fromEntries(TOLERANCES.map(([k]) => [k, Math.round(+tol[k].value || 0)])), levels: Object.fromEntries(Object.keys(TYPES_ANOMALIE).map((k) => [k, niv[k].value])) },
          export: { format: format.value, hours_code: codeHeures.value.trim(), include_hours: avecHeures.checked, header: entete.checked, sep: sep.value, decimal: dec.value,
            sage: { label: libelleEv.value.trim(), vm_source: vmSource.value, vm_code: vmCode.value.trim().toUpperCase(), vm_type: vmType.value.trim() || "255" } },
        } });
        toast("Réglages enregistrés."); await rafraichir();
      }); } },
        h("div", { class: "carte" }, h("h3", null, "Entreprise"), champ("Nom affiché", societe),
          champ("Adresse du logo", logoUrl, "Une image en ligne, adresse commençant par https://. Laissez vide pour ne rien afficher."), logo(s.logo_url, "logo-p", "")),
        h("div", { class: "carte" }, h("h3", null, "Mise en service"), champ("Premier jour de pointage", service, "Rien n'est attendu des salariés avant cette date : pas d'oubli signalé, pas d'heures prévues. À fixer avant le démarrage, puis à ne plus modifier."),
          champ("Validité d'un code d'activation (jours)", validite)),
        h("div", { class: "carte" }, h("h3", null, "Durée du travail"),
          h("div", { class: "grille2" }, champ("Alerte au-delà de (heures par jour)", maxJour), champ("Alerte au-delà de (heures par semaine)", maxSemaine)),
          h("div", { class: "grille2" }, champ("Repos minimal entre deux journées (heures)", repos), champ("Pause déduite au-delà de (heures d'un seul tenant)", seuilPause)),
          h("p", { class: "discret" }, "La durée de la pause déduite se règle sur l'horaire de chaque salarié. Ces seuils signalent des points d'attention ; ils ne bloquent pas le pointage.")),
        h("div", { class: "carte" }, h("h3", null, "Anomalies liées à l'horaire"),
          h("p", { class: "discret" }, "Elles comparent les pointages à l'horaire prévu (plages du planning) et se consultent dans Synthèse › Anomalies. Elles ne bloquent ni le pointage ni la clôture."),
          h("div", { class: "grille3" }, TOLERANCES.map(([k, lib]) => champ(lib, tol[k]))),
          h("span", { class: "eyebrow" }, "Niveau de chaque anomalie"),
          h("div", { class: "grille2" }, Object.entries(TYPES_ANOMALIE).map(([k, lib]) => champ(lib, niv[k]))),
          h("p", { class: "discret" }, "Le départ non pointé et le jour sans pointage ni absence restent toujours « à corriger »."),
          champ("Pauses payées : minutes de pause pointée comptées comme du travail, par jour", pausePayee, "0 : les pauses pointées ne sont pas payées (cas général). S'applique à tous les mois non clôturés.")),
        h("div", { class: "carte" }, h("h3", null, "Travail de nuit"),
          champ("Un départ pointé avant cette heure ferme la journée de la veille", nuit, "Vide : fonction désactivée, chaque journée s'arrête à minuit. Exemple : 06:00 pour des équipes de nuit qui finissent au petit matin (au plus tard 11:59)."),
          h("p", { class: "discret" }, "Quand elle est activée : un salarié arrivé la veille au soir et encore en poste pointe son départ après minuit, et la journée entière compte pour la veille. Au-delà de seize heures depuis l'arrivée, le pointage ouvre une nouvelle journée (le départ de la veille a été oublié).")),
        h("div", { class: "carte" }, h("h3", null, "Lieux de travail"), lieux, h("div", { class: "ligne gauche" }, h("button", { type: "button", onclick: () => ajouteLieu() }, "Ajouter un lieu")),
          h("p", { class: "discret" }, "Le lieu nommé « Télétravail » alimente le code TT de la vue annuelle.")),
        h("div", { class: "carte" }, h("h3", null, "Export paie"),
          champ("Format du fichier remis à la paie", format, "S'applique aux prochaines clôtures : un mois déjà clôturé garde le fichier produit ce jour-là."),
          remplirBloc(blocCsv, h("p", null, "Le fichier contient une ligne par absence validée (matricule, code, nombre de jours, dates) et, si vous le souhaitez, une ligne d'heures par salarié."),
            champ("Code de la ligne d'heures", codeHeures), avecHeuresLib, enteteLib, h("div", { class: "grille2" }, champ("Séparateur de colonnes", sep), champ("Séparateur décimal", dec))),
          remplirBloc(blocSage, h("p", null, "Le fichier suit le format d'import de Sage Paie. Une ligne EV par absence validée : matricule, code du motif sur quatre caractères, dates, nombre de jours. Une ligne VB par salarié, avec les dates des congés à reporter sur le bulletin (trois périodes au plus). Et, si vous le demandez, une ligne VM d'heures par salarié à l'horaire."),
            champ("Heures transmises (lignes VM)", vmSource, "Calculées sur le mois clôturé, au millième d'heure. Rien n'est transmis pour les salariés au forfait jours."),
            h("div", { class: "grille2" }, champ("Constante ou rubrique de paie qui reçoit ces heures", vmCode), champ("Type d'élément Sage", vmType, "255 dans la plupart des dossiers.")),
            champ("Libellé des événements", libelleEv, "Sage remplace %DEB et %FIN par les dates de l'absence.")),
          h("p", { class: "bandeau" }, h("strong", null, "À faire valider par votre gestionnaire de paie"), "Les codes dépendent du paramétrage de votre dossier de paie. Le code de chaque absence, le nombre de jours transmis et le report des dates sur le bulletin se règlent dans l'onglet Motifs. Faites un essai d'import avec un brouillon avant la première clôture.")),
        h("div", { class: "ligne gauche" }, ok)));
  });
}

const ANOMALIES_DEFAUT = { late_min: 5, early_min: 5, range_min: 60, short_min: 15, break_min: 20, break_max: 120,
  levels: { retard: "info", depart_anticipe: "info", hors_plage: "corriger", presence_insuffisante: "info", travail_absence: "verifier", pause_courte: "info", pause_longue: "info", pause_non_prise: "info" } };
const TOLERANCES = [["late_min", "Retard toléré (min)"], ["early_min", "Départ anticipé toléré (min)"], ["range_min", "Hors horaire au-delà de (min)"],
  ["short_min", "Durée manquante tolérée (min)"], ["break_min", "Pause minimale (min)"], ["break_max", "Pause maximale (min)"]];
const TYPES_ANOMALIE = { retard: "Retard", depart_anticipe: "Départ anticipé", hors_plage: "Pointage hors de l'horaire", presence_insuffisante: "Temps de présence insuffisant",
  travail_absence: "Travail pendant une absence", pause_courte: "Pause trop courte", pause_longue: "Pause trop longue", pause_non_prise: "Pause non prise" };
const NIVEAUX = [["corriger", "À corriger"], ["verifier", "À vérifier"], ["info", "Pour information"], ["off", "Ne pas signaler"]];

/* ================= Motifs d'absence ================= */
const FAMILLES = { cp: "Congés payés (déduit du solde CP)", rtt: "RTT (déduit du solde RTT)", maladie: "Maladie", autre: "Autre" };
const UNITES = { prevus: "Jours prévus au planning (cas général)", calendaires: "Jours calendaires, week-ends compris" };
const ANNUEL = { retire: "Retiré de l'objectif (cas général)", realise: "Compté comme du temps réalisé", neutre: "Laissé à faire (l'objectif ne bouge pas)" };
export function vueMotifs() {
  ecran(() => api("admin/settings"), ({ types }) => {
    const editer = (t) => {
      const neuf = !t; t = t || { code: "", label: "", category: "autre", export_code: "", needs_doc: false, absenteeism: true, active: true, sort: (types.reduce((m, x) => Math.max(m, x.sort), 0) || 0) + 10 };
      const label = h("input", { type: "text", value: t.label, maxlength: 60, required: true });
      const famille = h("select", { value: t.category }, Object.entries(FAMILLES).map(([v, l]) => h("option", { value: v }, l)));
      const code = h("input", { type: "text", value: t.export_code, maxlength: 30 });
      const [docLib, doc] = coche("Justificatif demandé", { checked: t.needs_doc });
      const [absLib, abs] = coche("Compte dans le taux d'absentéisme", { checked: t.absenteeism });
      const [actLib, act] = coche("Proposé aux salariés", { checked: t.active });
      const ordre = h("input", { type: "number", value: t.sort, min: 0, max: 999 });
      const annuel = h("select", { value: t.annual || "retire" }, Object.entries(ANNUEL).map(([v, l]) => h("option", { value: v }, l)));
      const unite = h("select", { value: t.export_unit || "prevus" }, Object.entries(UNITES).map(([v, l]) => h("option", { value: v }, l)));
      // les dates d'un congé payé se reportent sur le bulletin : proposé d'office pour un nouveau motif de cette famille
      const [datesLib, dates] = coche("Dates reportées sur le bulletin de paie (format Sage, ligne VB)", { checked: neuf ? false : !!t.export_dates });
      let datesTouche = !neuf;
      dates.addEventListener("change", () => { datesTouche = true; });
      famille.addEventListener("change", () => { if (!datesTouche) dates.checked = famille.value === "cp"; });
      ouvrir(neuf ? "Nouveau motif d'absence" : `Motif : ${t.label}`, [champ("Libellé", label), champ("Famille", famille), docLib, absLib, actLib, champ("Ordre d'affichage", ordre),
        champ("Pour les salariés annualisés, le temps prévu pendant cette absence est", annuel, "Sans effet pour les salariés qui ne sont pas annualisés."),
        h("span", { class: "eyebrow" }, "Export paie"),
        champ("Code dans l'export paie", code, "Repris tel quel. Au format Sage : le code de la nature d'événement, sur quatre caractères (exemple : 0950)."),
        champ("Nombre de jours transmis à la paie", unite, "Jours prévus : seuls comptent les jours où le salarié devait travailler. Jours calendaires : du premier au dernier jour, week-ends et jours fériés compris."),
        datesLib,
        neuf ? null : h("p", { class: "discret" }, "Un motif déjà utilisé ne se supprime pas : décochez « Proposé aux salariés » pour le retirer des listes.")], "Enregistrer", async () => {
        const c = neuf ? slug(label.value) : t.code;
        if (c.length < 2) throw new Error("Libellé trop court.");
        if (neuf && types.some((x) => x.code === c)) throw new Error("Un motif porte déjà ce nom.");
        await api("admin/type-save", { type: { code: c, label: label.value.trim(), category: famille.value, export_code: code.value.trim(), needs_doc: doc.checked, absenteeism: abs.checked, active: act.checked, sort: +ordre.value || 100, annual: annuel.value,
          export_unit: unite.value, export_dates: dates.checked } });
        toast("Motif enregistré."); await rafraichir();
      });
    };
    pose(h("div", { class: "ligne" }, h("h2", null, "Motifs d'absence"), h("button", { class: "domaine", onclick: () => editer(null) }, "Nouveau motif")),
      h("div", { class: "carte" }, h("h3", null, "Motifs"),
        h("div", { class: "table-zone" }, h("table", null, h("thead", null, h("tr", null, ["Libellé", "Famille", "Code paie", "Jours transmis", "Justificatif", "Absentéisme", "Annualisation", "État"].map((x) => h("th", null, x)))),
          h("tbody", null, types.map((t) => h("tr", { class: "cliquable", tabindex: 0, onclick: () => editer(t), onkeydown: (ev) => { if (ev.key === "Enter") editer(t); } },
            h("td", null, h("strong", null, t.label)), h("td", null, FAMILLES[t.category].split(" (")[0]), h("td", { class: "mono" }, t.export_code || h("span", { class: "moins" }, "manquant")),
            h("td", null, t.export_unit === "calendaires" ? "Calendaires" : "Prévus", t.export_dates ? h("div", { class: "discret" }, "dates au bulletin") : null),
            h("td", null, t.needs_doc ? "Demandé" : "—"), h("td", null, t.absenteeism ? "Compté" : "—"), h("td", null, { retire: "Retiré", realise: "Réalisé", neutre: "À faire" }[t.annual || "retire"]), h("td", null, t.active ? etiquette("Actif", "p-ok") : etiquette("Retiré", "p-gris")))))))),
      h("p", { class: "discret" }, "Touchez un motif pour le modifier. Les codes d'export sont repris tels quels dans le fichier de paie ; le format du fichier se choisit dans l'onglet Réglages."));
  });
}

/* ================= État ================= */
export function vueEtat() {
  ecran(() => api("admin/status"), (d) => {
    const resultat = h("div");
    const mo = (n) => `${fmtNb(n / 1048576)} Mo`;
    const ligne = (a, b) => h("div", { class: "ligne" }, h("span", null, a), h("span", { class: "num" }, b));
    pose(h("h2", null, "État de l'installation"),
      d.schema !== d.schema_expected ? h("div", { class: "bandeau refus" }, h("strong", null, "Base de données à mettre à jour"),
        `L'application attend la version ${d.schema_expected} du schéma, la base est en version ${d.schema}. Rejouez le script d'installation (supabase/kokolio/install.sql) dans la console SQL : il ne supprime aucune donnée.`) : null,
      h("div", { class: "tuiles" }, tuile("Salariés actifs", String(d.active_users), `${d.users} fiches`), tuile("Comptes activés", String(d.activated)), tuile("Appareils connectés", String(d.sessions)),
        tuile("Journées", String(d.days), `${d.punches} pointages`), tuile("Absences", String(d.absences), `${d.documents} justificatifs`), tuile("Clôtures", String(d.closures))),
      h("div", { class: "carte" }, h("h3", null, "Versions et volumes"),
        ligne("Application", d.app), ligne("Schéma de la base", `${d.schema} (attendu : ${d.schema_expected})`), ligne("Heure du serveur", `${frCourt(d.today)} ${d.hm} (Paris)`),
        ligne("Lignes au journal", String(d.audit)), ligne("Taille des données", mo(d.db_bytes)), ligne("dont justificatifs", mo(d.documents_bytes)),
        h("p", { class: "discret" }, "Les justificatifs sont ce qui pèse le plus. Surveillez la taille des données par rapport à la capacité de votre hébergement de base.")),
      h("div", { class: "carte" }, h("h3", null, "Autodiagnostic"),
        h("p", null, "Rejoue, sur des comptes fictifs effacés aussitôt, les règles qui protègent les données : cloisonnement entre salariés, validations, verrous de clôture, journal."),
        h("div", { class: "ligne gauche" }, h("button", { class: "domaine", onclick: (ev) => agir(ev.currentTarget, async () => {
          resultat.replaceChildren(h("p", { class: "discret" }, "Contrôles en cours…"));
          const t = await api("admin/selftest");
          if (t.error) { resultat.replaceChildren(h("div", { class: "bandeau refus" }, h("strong", null, "L'autodiagnostic n'a pas pu s'exécuter"), `${t.error}. Rejouez le script d'installation, puis relancez.`)); return; }
          const ko = t.checks.filter((c) => !c.ok);
          resultat.replaceChildren(h("div", { class: "bandeau " + (t.ok ? "ok" : "refus") }, h("strong", null, t.ok ? `${t.checks.length} contrôles réussis` : `${ko.length} contrôle${ko.length > 1 ? "s" : ""} en échec sur ${t.checks.length}`),
            t.ok ? "Les règles de sécurité sont en place. Aucune donnée réelle n'a été touchée." : "Ne poursuivez pas l'utilisation avant correction : rejouez le script d'installation, puis relancez l'autodiagnostic."),
            h("ul", { class: "controles" }, t.checks.map((c) => h("li", { class: c.ok ? "" : "ko" }, c.name))));
        }) }, "Lancer l'autodiagnostic")), resultat),
      carteDemo(d),
      h("p", { class: "discret" }, `Relevé du ${frHorodatage(d.now)}.`));
  });
}

/* ================= Simulation d'activité ================= */
// Des salariés fictifs pointent, s'absentent et corrigent ; leurs responsables valident. Réservé à l'environnement de test,
// et à la production tant qu'elle est en mode démonstration.
function carteSimulation(sim) {
  const ligne = (a, b) => h("div", { class: "ligne" }, h("span", null, a), h("span", { class: "num" }, b));
  if (!sim.allowed) {
    return h("div", { class: "carte" }, h("h3", null, "Simulation d'activité"),
      h("p", { class: "discret" }, "Des salariés fictifs qui pointent et s'absentent pour faire vivre l'outil : cela se règle dans l'environnement de test. En production, la simulation n'existe que pendant le mode démonstration."));
  }
  const etat = h("p", { class: "discret" });
  // fait avancer la simulation jusqu'à l'instant présent, lot après lot (la première fois, la journée d'hier est longue à créer)
  const rattraper = async () => {
    let total = 0;
    for (let i = 0; i < 20; i++) {
      const r = await api("sim/tick");
      total += Object.values(r.faits || {}).reduce((x, y) => x + y, 0);
      etat.textContent = `${total} événement${total > 1 ? "s" : ""} joué${total > 1 ? "s" : ""}…`;
      if (!r.due || !r.passages) break;
    }
    return total;
  };
  const st = sim.state || {};
  return h("div", { class: "carte" }, h("h3", null, "Simulation d'activité"),
    h("p", null, "Des salariés fictifs pointent au fil de la journée — tous, sauf les absents —, posent des congés ou déclarent un arrêt, corrigent le lendemain un départ oublié ; leurs responsables valident les journées et décident les demandes. Le scénario est vraisemblable et varie d'un jour à l'autre."),
    h("p", { class: "discret" }, "Seules les fiches jamais activées sont simulées : dès qu'une personne pose son mot de passe, la simulation ne touche plus à son compte, et son équipe attend ses validations. À la première mise en marche, la journée de la veille est créée, avec les absences déjà en cours."),
    h("p", { class: "discret" }, ENV === "test" ? "Elle avance toutes les heures, et dès qu'une page de l'outil est ouverte. Une nouvelle copie de la production l'arrête ici : elle se remet en marche depuis cet écran."
      : "Elle avance toutes les heures, et dès qu'une page de l'outil est ouverte. Elle n'existe en production que pendant le mode démonstration, et s'efface avec ses données. Une copie vers le test l'y dépose arrêtée."),
    sim.on ? [
      ligne("État", "en marche"), ligne("Fiches simulées", String(sim.enrolled ?? 0)),
      ligne("Mise en marche", `${frHorodatage(st.started_at)}${st.by ? `, par ${st.by}` : ""}`), ligne("Simulée jusqu'à", st.last ? frHorodatage(st.last) : "—"),
      ligne("Événements joués", fmtNb(st.total || 0)),
    ] : [ligne("État", st.stopped_at ? `arrêtée le ${frHorodatage(st.stopped_at)}` : "jamais mise en marche"), ligne("Fiches qui seraient simulées", String(sim.candidates ?? 0))],
    etat,
    h("div", { class: "ligne gauche" },
      sim.on ? h("button", { onclick: (ev) => agir(ev.currentTarget, async () => { await api("admin/sim", { on: false }); toast("Simulation arrêtée."); recharger(); }) }, "Arrêter la simulation")
        : h("button", { class: "domaine", onclick: (ev) => agir(ev.currentTarget, async () => {
            etat.textContent = "Mise en marche…";
            await api("admin/sim", { on: true });
            const n = await rattraper();
            toast(`Simulation en marche : ${fmtNb(n)} événements joués.`); recharger();
          }) }, "Mettre la simulation en marche"),
      sim.on ? h("button", { onclick: (ev) => agir(ev.currentTarget, async () => { const n = await rattraper(); toast(n ? `${fmtNb(n)} événements joués.` : "La simulation est à jour."); recharger(); }) }, "Faire avancer maintenant") : null));
}

/* ================= Environnement de test ================= */
// Une copie complète de l'outil, à une adresse à part : mêmes écrans, données séparées. On y essaie ce qu'on veut sans risque.
export function vueTest() {
  if (ENV === "test") {
    ecran(async () => ({ ...(await api("admin/test-status")), sim: await api("admin/sim") }), (d) => {
      const c = d.cloned;
      pose(h("h2", null, "Environnement de test"),
        h("div", { class: "carte" }, h("h3", null, "Vous êtes dans l'environnement de test"),
          h("p", null, "Les écrans sont ceux de la production, les données en sont une copie (les justificatifs exceptés : un fichier témoin les remplace). Tout ce qui est fait ici reste ici : rien ne remonte vers la production."),
          h("p", null, c?.at ? `Dernière copie de la production : ${frHorodatage(c.at)}${c.by ? `, par ${c.by}` : ""}.` : "Aucune copie de la production n'a encore été faite : l'environnement est vide."),
          h("p", { class: "discret" }, "La copie se relance depuis la production : Administration › Test. Elle remplace tout le contenu de cet environnement."),
          h("div", { class: "ligne gauche" }, h("a", { class: "bouton domaine", href: "/kokolio#/admin/test" }, "Aller à la production"))),
        carteSimulation(d.sim));
    });
    return;
  }
  ecran(async () => {
    const d = await api("admin/test-status");
    // l'environnement de test répond-il ? (son contrôle de santé est public et ne renvoie aucune donnée)
    let sante = null;
    try { const r = await fetch("/api/kokolio-test/health", { cache: "no-store" }); sante = await r.json(); } catch { sante = null; }
    return { d, sante, sim: await api("admin/sim") };
  }, ({ d, sante, sim }) => {
    const mo = (n) => `${fmtNb((n || 0) / 1048576)} Mo`;
    const ligne = (a, b) => h("div", { class: "ligne" }, h("span", null, a), h("span", { class: "num" }, b));
    const pret = d.installed && sante?.ok && String(d.schema) === String(d.schema_production);
    const copie = d.cloned?.at ? `${frHorodatage(d.cloned.at)}${d.cloned.by ? `, par ${d.cloned.by}` : ""}` : "jamais";
    pose(h("h2", null, "Environnement de test"),
      h("div", { class: "carte" }, h("h3", null, "Une copie complète pour essayer sans risque"),
        h("p", null, "L'environnement de test est une seconde installation de Kokolio : mêmes écrans, même version, mais des données à part. Ce qui y est fait ne touche jamais la production."),
        h("p", null, "On s'y connecte avec les mêmes identifiants et mots de passe qu'en production, tels qu'ils étaient au moment de la dernière copie."),
        h("div", { class: "ligne gauche" },
          h("a", { class: "bouton domaine", href: "/kokolio-test", target: "_blank", rel: "noopener" }, "Ouvrir l'environnement de test"),
          h("span", { class: "discret mono" }, `${location.origin}/kokolio-test`))),
      !d.installed ? h("div", { class: "bandeau refus" }, h("strong", null, "Environnement de test pas encore installé"),
        "Exécutez le script supabase/kokolio/install-test.sql dans la console SQL de la base : il crée le schéma kokolio_test sans toucher à la production.") : null,
      d.installed && String(d.schema) !== String(d.schema_production) ? h("div", { class: "bandeau refus" }, h("strong", null, "Environnement de test à mettre à jour"),
        `Il est en version ${d.schema} du schéma, la production en version ${d.schema_production}. Rejouez le script install-test.sql, puis relancez la copie.`) : null,
      d.installed && !sante?.ok ? h("div", { class: "bandeau refus" }, h("strong", null, "L'environnement de test ne répond pas"), sante?.message || "Son adresse n'a pas donné de réponse lisible.") : null,
      h("div", { class: "carte" }, h("h3", null, "État"),
        ligne("Installation", d.installed ? `faite · schéma ${d.schema}` : "à faire"),
        ligne("Réponse", sante?.ok ? `oui · application ${sante.app}` : "non"),
        ligne("Dernière copie de la production", copie),
        ligne("Comptes dans le test", d.installed ? String(d.users) : "—"),
        ligne("Taille de ses données", d.installed ? mo(d.db_bytes) : "—"),
        h("p", { class: "discret" }, "Le test est hébergé au même endroit que la production : ses données comptent dans la capacité de la base, et une charge forte sur le test peut ralentir la production.")),
      h("div", { class: "carte" }, h("h3", null, "Remettre le test à l'image de la production"),
        h("p", null, "La copie remplace tout le contenu de l'environnement de test par celui de la production à cet instant : salariés, horaires, pointages, absences, clôtures, réglages, journal. Ce qui avait été saisi dans le test est perdu ; les personnes qui y étaient connectées devront se reconnecter."),
        h("p", null, "Les justificatifs déposés par les salariés ne sont pas copiés : dans le test, un fichier témoin les remplace."),
        h("p", { class: "discret" }, "La production n'est ni modifiée ni interrompue. La copie est inscrite au journal."),
        h("div", { class: "ligne gauche" }, h("button", { class: "domaine", disabled: !pret, onclick: () => {
          const mot = h("input", { type: "text", autocomplete: "off", autocapitalize: "characters", spellcheck: "false" });
          ouvrir("Copier la production vers le test",
            h("div", { class: "pile" }, h("p", null, "Tout le contenu actuel de l'environnement de test sera remplacé. Cette action ne se défait pas."), champ("Pour confirmer, saisissez le mot COPIER", mot)),
            "Lancer la copie", async () => {
              const r = await api("admin/test-clone", { confirm: mot.value.trim().toUpperCase() });
              toast(`Copie terminée : ${r.counts?.users ?? 0} comptes, ${fmtNb(r.rows)} lignes.`); recharger();
            });
        } }, "Copier la production vers le test"))),
      carteSimulation(sim));
  });
}

/* ================= Mode démonstration ================= */
function carteDemo(d) {
  const essais = d.users - d.admins, possible = !d.closures && essais <= 10;
  if (Number(d.schema) < Number(d.schema_expected)) return h("div", { class: "carte" }, h("h3", null, "Données de démonstration"),
    h("p", null, `Le mode démonstration demande la version ${d.schema_expected} de la base. Rejouez le script d'installation (supabase/kokolio/install.sql) dans la console SQL, puis rechargez cette page.`));
  if (S.boot.demo) return h("div", { class: "carte" }, h("h3", null, "Données de démonstration"),
    h("p", { class: "bandeau" }, h("strong", null, "L'outil est en mode démonstration"), "Il contient des salariés, des pointages et des absences fictifs. Avant la vraie mise en service, effacez-les : l'outil repartira vide, avec vos réglages, vos motifs d'absence et les comptes administrateur."),
    h("div", { class: "ligne gauche" }, h("button", { class: "danger", onclick: () => {
      const mot = h("input", { type: "text", autocomplete: "off", autocapitalize: "characters", spellcheck: "false", placeholder: "EFFACER" });
      ouvrir("Effacer les données de démonstration", [
        h("p", null, `Tout sera supprimé définitivement : ${d.users - d.admins} comptes, ${d.days} journées, ${d.absences} absences, les clôtures et le journal. Tout ce qui a été saisi depuis le chargement disparaît aussi, y compris d'éventuels vrais salariés.`),
        h("p", null, "Sont conservés : les comptes administrateur, les réglages et les motifs d'absence. La date de mise en service revient à aujourd'hui."),
        champ("Pour confirmer, saisissez le mot EFFACER", mot)], "Tout effacer", async () => {
        const r = await api("admin/demo-reset", { confirm: mot.value.trim().toUpperCase() });
        S.boot = await api("boot"); toast(`Données de démonstration effacées : ${r.users} comptes, ${r.days} journées.`); recharger();
      }, { danger: true });
    } }, "Effacer les données de démonstration")));
  return h("div", { class: "carte" }, h("h3", null, "Données de démonstration"),
    h("p", null, "Pour découvrir l'outil ou le présenter : six salariés fictifs (une RH, un responsable, quatre salariés dont deux cadres), deux mois de pointages, des absences, des validations en attente et un mois déjà clôturé."),
    possible ? h("div", { class: "ligne gauche" }, h("button", { class: "domaine", onclick: () => confirmer("Charger les données de démonstration", [
        essais ? h("p", { class: "bandeau" }, h("strong", null, `L'outil contient déjà ${essais} salarié${essais > 1 ? "s" : ""}`), "Ils sont conservés tels quels : l'historique fictif ne les concerne pas, leur suivi reste celui d'aujourd'hui. Ils feront toutefois partie du mode démonstration : ils seront effacés avec le reste lors de l'effacement.") : null,
        "Six comptes fictifs et leurs données sont créés, et la date de mise en service recule de deux mois. Leurs codes d'activation s'afficheront une fois : vous pourrez vous connecter à la place de chacun.",
        "L'outil passe en mode démonstration, signalé par un bandeau à tous les utilisateurs. Vous pourrez tout effacer d'ici avant la vraie mise en service."], "Charger", async () => {
        const r = await api("admin/demo-load");
        S.boot = await api("boot");
        document.getElementById("bandeau-demo").hidden = !S.boot.demo; // l'écran des codes ne repasse pas par la navigation : le bandeau se met à jour ici
        ecranCodes(r.accounts, `${r.users} comptes fictifs, ${r.days} journées et ${r.absences} absences créés${r.closed ? ` ; ${frMois(r.closed)} est déjà clôturé` : ""}.`,
          h("p", { class: "bandeau info" }, h("strong", null, "Pour essayer plusieurs comptes en même temps"), "Ouvrez chacun dans une fenêtre de navigation privée, ou sur un autre appareil : une fenêtre ne garde qu'une session à la fois."));
      }) }, "Charger les données de démonstration"))
      : h("p", { class: "bandeau info" }, "Cet outil est en service (un mois est clôturé, ou il compte plus de dix salariés) : les données de démonstration ne peuvent plus y être chargées."));
}

/* ================= Versions et fonctionnalités ================= */
export function vueVersions(publique) {
  S.jeton++;
  const v = VERSIONS[0];
  pose(h("div", { class: "ligne" }, h("h2", null, publique ? "Kokolio" : "Versions et fonctionnalités"), etiquette(`Version ${v.v} du ${v.date}`)),
    publique ? null : h("p", { class: "discret" }, `Application ${S.boot.app} · schéma de base ${S.boot.schema}. Cette page est mise à jour à chaque version.`),
    h("div", { class: "carte" }, h("h3", null, "Fonctionnalités"), FONCTIONS.map(([t, l]) => h("div", null, h("strong", null, t), h("ul", null, l.map((x) => h("li", null, x)))))),
    h("div", { class: "carte" }, h("h3", null, "Historique des versions"),
      VERSIONS.map((x) => h("div", null, h("div", { class: "ligne" }, h("strong", null, `${x.v} · ${x.titre}`), h("span", { class: "num discret" }, x.date)), h("ul", null, x.points.map((p) => h("li", null, p))))),
      h("div", null, h("strong", null, "Maquettes de préparation (données fictives)"), h("ul", null, MAQUETTES.map((m) => h("li", null, `${m.v} · ${m.titre} · ${m.date}`))))),
    h("div", { class: "carte" }, h("h3", null, "Prévu pour la suite"), h("p", { class: "discret" }, "Les prochaines versions, dans l'ordre prévu."), h("ul", null, A_VENIR.map((x) => h("li", null, x)))),
    h("div", { class: "carte" }, h("h3", null, "Non géré"), h("ul", null, NON_GERE.map((x) => h("li", null, x)))),
    logo(S.boot.settings.logo_url, "logo-p", S.boot.settings.company),
    h("p", { class: "pied" }, h("a", { href: "/kokolio/demo" }, "Voir la maquette de démonstration (V4.3, données fictives)")));
}
