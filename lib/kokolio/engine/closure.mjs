// Clôture mensuelle : photographie des chiffres par salarié, et fichier d'export pour la paie.
import { maxDate, minDate, monthEnd, monthStart } from "./dates.mjs";
import { buildDays, countAbsenceDays, sortContracts, summarize, typeMap } from "./model.mjs";

const frDate = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;

export function monthFigures({ user, contracts, days, absences, types, settings, month, today }) {
  const from = monthStart(month), to = monthEnd(month);
  const sorted = sortContracts(contracts);
  const recs = buildDays({ user, contracts: sorted, days, absences, types, settings, from, to, today });
  const s = summarize(recs, { from, to, settings });
  const tmap = types instanceof Map ? types : typeMap(types);
  const abs = [];
  for (const a of absences) {
    if (a.status !== "valide" || a.start_date > to || a.end_date < from) continue;
    const n = countAbsenceDays({ user, contracts: sorted, start: a.start_date, end: a.end_date, half: a.half, clipFrom: from, clipTo: to });
    if (n <= 0) continue;
    const t = tmap.get(a.type_code);
    abs.push({ type: a.type_code, label: t?.label || a.type_code, export_code: t?.export_code || "", start: maxDate(a.start_date, from), end: minDate(a.end_date, to), half: a.half || "", days: n });
  }
  const regime = recs.find((r) => r.regime)?.regime || sorted[sorted.length - 1]?.regime || "horaire";
  return { summary: s, absences: abs, regime, recs };
}

// Salariés concernés par un mois : présents au moins un jour, ou ayant une donnée dans le mois.
export function buildSnapshot({ users, contracts, days, absences, types, settings, month, today }) {
  const from = monthStart(month), to = monthEnd(month);
  const by = (list, key) => { const m = new Map(); for (const x of list) { if (!m.has(x[key])) m.set(x[key], []); m.get(x[key]).push(x); } return m; };
  const cBy = by(contracts, "user_id"), dBy = by(days, "user_id"), aBy = by(absences, "user_id");
  const employees = [];
  for (const u of users) {
    const present = (!u.entry_date || u.entry_date <= to) && (!u.exit_date || u.exit_date >= from);
    const uDays = dBy.get(u.id) || [], uAbs = aBy.get(u.id) || [];
    // suivi sur le mois : un horaire y est en vigueur, et le suivi propre au compte (s'il en a un) a commencé
    const suivi = (cBy.get(u.id) || []).some((c) => c.start_date <= to && (!c.end_date || c.end_date >= from)) && (!u.tracked_from || u.tracked_from <= to);
    if ((!present || !suivi) && !uDays.length && !uAbs.some((a) => a.status === "valide")) continue;
    if (u.disabled && !uDays.length && !uAbs.some((a) => a.status === "valide")) continue;
    const f = monthFigures({ user: u, contracts: cBy.get(u.id) || [], days: uDays, absences: uAbs, types, settings, month, today });
    employees.push({
      id: u.id, login: u.login, matricule: u.matricule || "", name: u.name, team: u.team || "", regime: f.regime,
      worked: f.summary.worked, theo: f.summary.theo, ecart: f.summary.ecart, days_worked: f.summary.days_worked,
      absences: f.absences, abs_days: f.summary.abs_days,
      empty_days: f.summary.anomalies.filter((x) => x.kind === "vide").map((x) => x.date), alerts: f.summary.alerts.length,
    });
  }
  employees.sort((a, b) => (a.matricule || "~").localeCompare(b.matricule || "~") || a.name.localeCompare(b.name, "fr"));
  return {
    month, from, to,
    totals: {
      employees: employees.length, worked: employees.reduce((s, e) => s + e.worked, 0), abs_days: employees.reduce((s, e) => s + e.abs_days, 0),
      empty_days: employees.reduce((s, e) => s + e.empty_days.length, 0), alerts: employees.reduce((s, e) => s + e.alerts, 0),
      no_matricule: employees.filter((e) => !e.matricule).length,
    },
    employees,
  };
}

// Fichier d'export : une ligne d'heures par salarié, une ligne par absence validée.
// Colonnes : matricule, code, valeur, date de début, date de fin. Codes et séparateurs réglables dans les paramètres.
export function buildExport(snapshot, settings) {
  const x = settings?.export || {};
  const sep = x.sep || ";", dec = x.decimal || ",";
  const num = (n) => String(Math.round(n * 100) / 100).replace(".", dec);
  const cell = (v) => { const s = String(v ?? ""); return s.includes(sep) || /["\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [];
  if (x.header !== false) lines.push(["Matricule", "Code", "Valeur", "Date début", "Date fin"]);
  for (const e of snapshot.employees) {
    const id = e.matricule || e.login;
    if (x.include_hours !== false && e.worked > 0) lines.push([id, x.hours_code || "", num(e.worked / 60), frDate(snapshot.from), frDate(snapshot.to)]);
    for (const a of e.absences) lines.push([id, a.export_code || "", num(a.days), frDate(a.start), frDate(a.end)]);
  }
  return lines.map((l) => l.map(cell).join(sep)).join("\r\n") + "\r\n";
}
