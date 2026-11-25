// Administration : réglages, motifs d'absence, état de l'installation, versions et fonctionnalités.
import { api } from "./api.js";
import { h, pose, toast, agir, ouvrir, etiquette, tuile, champ, coche, logo, fmtNb, frHorodatage, frCourt } from "./dom.js";
import { S, ecran, recharger } from "./etat.js";
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
    const ok = h("button", { class: "domaine", type: "submit" }, "Enregistrer les réglages");
    const enMinutes = (el, nom) => { const n = Number(el.value.trim().replace(",", ".")); if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error(`Valeur illisible : ${nom}.`); return Math.round(n * 60); };
    pose(h("h2", null, "Réglages"),
      h("form", { class: "pile", novalidate: true, onsubmit: (ev) => { ev.preventDefault(); agir(ok, async () => {
        const vus = new Set();
        const liste = [...lieux.children].map((row) => { const label = row.querySelector("input").value.trim(); let code = row.dataset.code || slug(label); while (vus.has(code)) code += "2"; vus.add(code); return { code, label }; }).filter((l) => l.label);
        if (!liste.length) throw new Error("Gardez au moins un lieu de travail.");
        if (liste.some((l) => l.code.length < 2)) throw new Error("Un nom de lieu est trop court.");
        await api("admin/settings-save", { version: s.version, settings: {
          company: societe.value.trim(), logo_url: logoUrl.value.trim(), go_live: service.value,
          pause_threshold_min: enMinutes(seuilPause, "seuil de pause"), max_day_min: enMinutes(maxJour, "durée par jour"), max_week_min: enMinutes(maxSemaine, "durée par semaine"), min_rest_min: enMinutes(repos, "repos"),
          activation_days: +validite.value, lieux: liste,
          export: { hours_code: codeHeures.value.trim(), include_hours: avecHeures.checked, header: entete.checked, sep: sep.value, decimal: dec.value },
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
        h("div", { class: "carte" }, h("h3", null, "Lieux de travail"), lieux, h("div", { class: "ligne gauche" }, h("button", { type: "button", onclick: () => ajouteLieu() }, "Ajouter un lieu")),
          h("p", { class: "discret" }, "Le lieu nommé « Télétravail » alimente le code TT de la vue annuelle.")),
        h("div", { class: "carte" }, h("h3", null, "Export paie (Silae)"),
          h("p", null, "Le fichier contient une ligne par absence validée (matricule, code, nombre de jours, dates) et, si vous le souhaitez, une ligne d'heures par salarié."),
          champ("Code de la ligne d'heures", codeHeures), avecHeuresLib, enteteLib, h("div", { class: "grille2" }, champ("Séparateur de colonnes", sep), champ("Séparateur décimal", dec)),
          h("p", { class: "bandeau" }, h("strong", null, "À faire valider par votre gestionnaire de paie"), "Les codes et le format d'import dépendent du paramétrage de votre dossier Silae. Les codes des absences se règlent dans l'onglet Motifs. Faites un essai d'import avec un brouillon avant la première clôture.")),
        h("div", { class: "ligne gauche" }, ok)));
  });
}

/* ================= Motifs d'absence ================= */
const FAMILLES = { cp: "Congés payés (déduit du solde CP)", rtt: "RTT (déduit du solde RTT)", maladie: "Maladie", autre: "Autre" };
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
      ouvrir(neuf ? "Nouveau motif d'absence" : `Motif : ${t.label}`, [champ("Libellé", label), champ("Famille", famille), champ("Code dans l'export paie", code), docLib, absLib, actLib, champ("Ordre d'affichage", ordre),
        neuf ? null : h("p", { class: "discret" }, "Un motif déjà utilisé ne se supprime pas : décochez « Proposé aux salariés » pour le retirer des listes.")], "Enregistrer", async () => {
        const c = neuf ? slug(label.value) : t.code;
        if (c.length < 2) throw new Error("Libellé trop court.");
        if (neuf && types.some((x) => x.code === c)) throw new Error("Un motif porte déjà ce nom.");
        await api("admin/type-save", { type: { code: c, label: label.value.trim(), category: famille.value, export_code: code.value.trim(), needs_doc: doc.checked, absenteeism: abs.checked, active: act.checked, sort: +ordre.value || 100 } });
        toast("Motif enregistré."); await rafraichir();
      });
    };
    pose(h("div", { class: "ligne" }, h("h2", null, "Motifs d'absence"), h("button", { class: "domaine", onclick: () => editer(null) }, "Nouveau motif")),
      h("div", { class: "carte" }, h("h3", null, "Motifs"),
        h("div", { class: "table-zone" }, h("table", null, h("thead", null, h("tr", null, ["Libellé", "Famille", "Code d'export", "Justificatif", "Absentéisme", "État"].map((x) => h("th", null, x)))),
          h("tbody", null, types.map((t) => h("tr", { class: "cliquable", tabindex: 0, onclick: () => editer(t), onkeydown: (ev) => { if (ev.key === "Enter") editer(t); } },
            h("td", null, h("strong", null, t.label)), h("td", null, FAMILLES[t.category].split(" (")[0]), h("td", { class: "mono" }, t.export_code || h("span", { class: "moins" }, "manquant")),
            h("td", null, t.needs_doc ? "Demandé" : "—"), h("td", null, t.absenteeism ? "Compté" : "—"), h("td", null, t.active ? etiquette("Actif", "p-ok") : etiquette("Retiré", "p-gris")))))))),
      h("p", { class: "discret" }, "Touchez un motif pour le modifier. Les codes d'export sont repris tels quels dans le fichier de paie."));
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
          const ko = t.checks.filter((c) => !c.ok);
          resultat.replaceChildren(h("div", { class: "bandeau " + (t.ok ? "ok" : "refus") }, h("strong", null, t.ok ? `${t.checks.length} contrôles réussis` : `${ko.length} contrôle${ko.length > 1 ? "s" : ""} en échec sur ${t.checks.length}`),
            t.ok ? "Les règles de sécurité sont en place. Aucune donnée réelle n'a été touchée." : "Ne poursuivez pas l'utilisation avant correction : rejouez le script d'installation, puis relancez l'autodiagnostic."),
            h("ul", { class: "controles" }, t.checks.map((c) => h("li", { class: c.ok ? "" : "ko" }, c.name))));
        }) }, "Lancer l'autodiagnostic")), resultat),
      h("p", { class: "discret" }, `Relevé du ${frHorodatage(d.now)}.`));
  });
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
    h("div", { class: "carte" }, h("h3", null, "Prévu pour la suite"), h("p", { class: "discret" }, "Présent dans la maquette, pas encore dans la version de production."), h("ul", null, A_VENIR.map((x) => h("li", null, x)))),
    h("div", { class: "carte" }, h("h3", null, "Non géré"), h("ul", null, NON_GERE.map((x) => h("li", null, x)))),
    logo(S.boot.settings.logo_url, "logo-p", S.boot.settings.company),
    h("p", { class: "pied" }, h("a", { href: "/kokolio/demo" }, "Voir la maquette de démonstration (V4.3, données fictives)")));
}
