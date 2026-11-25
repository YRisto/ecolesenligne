// Lecture d'un fichier de salariés (CSV, ou tableau collé depuis un tableur) et mise en forme des lignes.
import { isYmd } from "./dates.mjs";

const strip = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const key = (s) => strip(s).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

// Noms de colonnes acceptés (sans accents ni majuscules).
const COLUMNS = {
  login: ["identifiant", "login", "compte"], last_name: ["nom", "nom_de_famille"], first_name: ["prenom"],
  matricule: ["matricule", "matricule_paie", "matricule_silae"], email: ["email", "e_mail", "mail", "courriel"],
  team: ["equipe", "service", "departement"], job: ["poste", "fonction", "intitule_du_poste"],
  manager: ["responsable", "manager", "identifiant_responsable", "responsable_identifiant"],
  entry_date: ["date_entree", "entree", "date_d_entree", "date_embauche"], exit_date: ["date_sortie", "sortie", "date_de_sortie"],
  regime: ["regime", "contrat"], weekly: ["heures_hebdo", "heures_par_semaine", "heures", "horaire_hebdo"],
  days: ["jours_travailles", "jours"], pause: ["pause", "pause_min", "pause_minutes"],
  cp_rate: ["cp_par_mois", "acquisition_cp"], forfait: ["forfait_jours", "jours_forfait"],
  cp: ["solde_cp", "report_cp", "cp"], rtt: ["droits_rtt", "solde_rtt", "rtt"], role: ["role", "profil"],
};
const LOOKUP = new Map();
for (const [field, names] of Object.entries(COLUMNS)) for (const n of names) LOOKUP.set(n, field);

export const TEMPLATE_HEADER = ["identifiant", "nom", "prenom", "matricule", "email", "equipe", "poste", "responsable", "date_entree", "regime", "heures_hebdo", "jours_travailles", "pause", "solde_cp", "droits_rtt"];
export const TEMPLATE_ROWS = [
  ["camille.martin", "Martin", "Camille", "0012", "camille.martin@exemple.fr", "Admissions", "Conseillère en formation", "julien.bernard", "01/09/2023", "horaire", "35", "lun-ven", "45", "6", "0"],
  ["julien.bernard", "Bernard", "Julien", "0004", "julien.bernard@exemple.fr", "Admissions", "Responsable des admissions", "", "15/01/2020", "forfait", "", "lun-ven", "", "8,5", "10"],
];

// Découpe un texte tabulaire. Le séparateur (point-virgule, virgule ou tabulation) est deviné sur la première ligne.
export function parseTable(text) {
  const src = String(text ?? "").replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const firstLine = src.split("\n", 1)[0] || "";
  const count = (ch) => firstLine.split(ch).length - 1;
  const sep = count("\t") >= Math.max(count(";"), count(",")) && count("\t") > 0 ? "\t" : count(";") >= count(",") ? ";" : ",";
  const rows = []; let row = [], cell = "", quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false; } else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ""));
}

export function slugLogin(first, last) {
  const part = (s) => strip(s).replace(/[^a-z0-9]+/g, "");
  const f = part(first), l = part(last);
  return (f && l ? `${f}.${l}` : f || l).slice(0, 60);
}

function parseDate(v) {
  const s = String(v ?? "").trim();
  if (!s) return { value: null };
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  const iso = m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : s;
  return isYmd(iso) ? { value: iso } : { error: `date illisible « ${s} »` };
}
function parseNumber(v) {
  const s = String(v ?? "").trim().replace(/\s/g, "").replace(",", ".");
  if (!s) return { value: null };
  const n = Number(s);
  return Number.isFinite(n) ? { value: n } : { error: `nombre illisible « ${v} »` };
}
const DAY_NAMES = { lun: 1, lundi: 1, mar: 2, mardi: 2, mer: 3, mercredi: 3, jeu: 4, jeudi: 4, ven: 5, vendredi: 5, sam: 6, samedi: 6, dim: 7, dimanche: 7 };
function parseDays(v) {
  const s = strip(v);
  if (!s) return { value: [1, 2, 3, 4, 5] };
  const one = (t) => DAY_NAMES[t] || (/^[1-7]$/.test(t) ? +t : null);
  const out = new Set();
  for (const part of s.split(/[,;/ ]+/).filter(Boolean)) {
    const range = part.split("-");
    if (range.length === 2) {
      const a = one(range[0]), b = one(range[1]);
      if (!a || !b || b < a) return { error: `jours illisibles « ${v} »` };
      for (let i = a; i <= b; i++) out.add(i);
    } else { const d = one(part); if (!d) return { error: `jours illisibles « ${v} »` }; out.add(d); }
  }
  return out.size ? { value: [...out].sort() } : { error: `jours illisibles « ${v} »` };
}

/**
 * Transforme le texte en lignes prêtes à importer.
 * existing : comptes déjà présents [{login, matricule}] — sert à repérer les mises à jour et les doublons.
 */
export function prepareImport(text, existing = []) {
  const table = parseTable(text);
  if (table.length < 2) return { rows: [], errors: ["Le fichier doit contenir une ligne d'en-tête et au moins une ligne de salarié."], columns: [], unknown: [] };
  const header = table[0].map((h) => LOOKUP.get(key(h)) || null);
  const unknown = table[0].filter((h, i) => !header[i] && h);
  if (!header.includes("last_name")) return { rows: [], errors: ["Colonne « nom » introuvable dans l'en-tête."], columns: header.filter(Boolean), unknown };
  const known = new Map(existing.map((u) => [u.login.toLowerCase(), u]));
  const usedLogins = new Set(), usedMat = new Map(existing.filter((u) => u.matricule).map((u) => [u.matricule, u.login.toLowerCase()]));
  const rows = [];
  table.slice(1).forEach((cells, i) => {
    const raw = {}; header.forEach((f, c) => { if (f) raw[f] = cells[c] ?? ""; });
    const errors = [];
    const get = (f) => String(raw[f] ?? "").trim();
    const last = get("last_name"), first = get("first_name");
    if (!last) errors.push("nom manquant");
    const matricule = get("matricule");
    let login = strip(get("login")).replace(/\s+/g, "");
    if (!login) {
      // Sans colonne identifiant : on retrouve le compte par son matricule, sinon on fabrique prenom.nom.
      // Un homonyme (même nom, matricule différent, ou déjà vu dans le fichier) reçoit un numéro.
      const owner = matricule && usedMat.get(matricule);
      if (owner && known.has(owner)) login = owner;
      else {
        const base = slugLogin(first, last); login = base; let n = 2;
        const clash = (l) => usedLogins.has(l) || (known.has(l) && matricule && known.get(l).matricule && known.get(l).matricule !== matricule);
        while (login && clash(login)) login = `${base}${n++}`;
      }
    }
    if (!/^[a-z0-9][a-z0-9._@-]{2,63}$/.test(login)) errors.push("identifiant invalide (3 à 64 caractères : lettres, chiffres, point, tiret)");
    else if (usedLogins.has(login)) errors.push(`identifiant « ${login} » en double dans le fichier`);
    usedLogins.add(login);
    if (matricule) {
      const owner = usedMat.get(matricule);
      if (owner && owner !== login) errors.push(`matricule « ${matricule} » déjà utilisé par ${owner}`);
      usedMat.set(matricule, login);
    }
    const entry = parseDate(raw.entry_date), exit = parseDate(raw.exit_date);
    for (const d of [entry, exit]) if (d.error) errors.push(d.error);
    if (entry.value && exit.value && exit.value < entry.value) errors.push("date de sortie antérieure à la date d'entrée");
    const regimeRaw = strip(get("regime"));
    const regime = /forfait|cadre/.test(regimeRaw) ? "forfait_jours" : "horaire";
    const weekly = parseNumber(raw.weekly), pause = parseNumber(raw.pause), cpRate = parseNumber(raw.cp_rate), forfait = parseNumber(raw.forfait);
    const cp = parseNumber(raw.cp), rtt = parseNumber(raw.rtt), wd = parseDays(raw.days);
    for (const n of [weekly, pause, cpRate, forfait, cp, rtt, wd]) if (n.error) errors.push(n.error);
    const hours = weekly.value ?? 35;
    if (regime === "horaire" && (hours <= 0 || hours > 60)) errors.push("heures hebdomadaires hors limites");
    const workDays = wd.value || [1, 2, 3, 4, 5];
    const per = Math.round((hours * 60) / workDays.length);
    const contract = {
      regime, work_days: workDays,
      day_minutes: [1, 2, 3, 4, 5, 6, 7].map((d) => (regime === "horaire" && workDays.includes(d) ? per : 0)),
      pause_minutes: pause.value ?? 45, cp_per_month: cpRate.value ?? 2.08, forfait_days: forfait.value ?? 218,
    };
    const roleRaw = strip(get("role"));
    const role = roleRaw === "rh" ? "rh" : /^admin/.test(roleRaw) ? "admin" : "salarie";
    rows.push({
      line: i + 2, errors, exists: known.has(login),
      login, last_name: last, first_name: first, matricule, email: get("email"), team: get("team"), job: get("job"),
      manager_login: strip(get("manager")).replace(/\s+/g, ""), entry_date: entry.value, exit_date: exit.value, role, contract,
      cp: cp.value, rtt: rtt.value,
    });
  });
  // un responsable doit exister déjà ou figurer dans le fichier
  const all = new Set([...known.keys(), ...rows.map((r) => r.login)]);
  for (const r of rows) {
    if (r.manager_login && !all.has(r.manager_login)) r.errors.push(`responsable « ${r.manager_login} » introuvable`);
    if (r.manager_login && r.manager_login === r.login) r.errors.push("un salarié ne peut pas être son propre responsable");
  }
  return { rows, errors: [], columns: header.filter(Boolean), unknown };
}
