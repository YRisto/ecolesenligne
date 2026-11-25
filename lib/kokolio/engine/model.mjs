// Cœur du calcul : pour un salarié et une période, une fiche par jour (prévu, fait, absence, anomalies),
// puis les totaux, les anomalies et les alertes légales qui en découlent.
import { addDays, eachDay, holidayName, isoDow, mondayOf, maxDate } from "./dates.mjs";

export const toMin = (hm) => +hm.slice(0, 2) * 60 + +hm.slice(3, 5);

// Minutes entre paires arrivée/départ. Un pointage d'arrivée sans départ ne compte pas.
export function rawMinutes(times) {
  let total = 0;
  for (let i = 0; i + 1 < times.length; i += 2) total += Math.max(0, toMin(times[i + 1]) - toMin(times[i]));
  return total;
}

// Pause déduite d'office : seulement si la journée tient en une seule plage (aucune pause pointée) et dépasse le seuil.
export function netMinutes(times, contract, settings) {
  const raw = rawMinutes(times);
  const threshold = settings?.pause_threshold_min ?? 360;
  if (times.length === 2 && raw > threshold) return Math.max(0, raw - (contract?.pause_minutes ?? 0));
  return raw;
}
export const pauseApplied = (times, contract, settings) =>
  times.length === 2 && rawMinutes(times) > (settings?.pause_threshold_min ?? 360) && (contract?.pause_minutes ?? 0) > 0;

export function sortContracts(contracts) {
  return [...contracts].sort((a, b) => (a.start_date < b.start_date ? -1 : 1));
}
// Horaire en vigueur à une date : celui dont la période contient la date.
export function contractAt(sorted, date) {
  for (let i = sorted.length - 1; i >= 0; i--) {
    const c = sorted[i];
    if (c.start_date <= date) return !c.end_date || c.end_date >= date ? c : null;
  }
  return null;
}
export const weeklyMinutes = (c) => (c ? c.day_minutes.reduce((s, m) => s + m, 0) : 0);

export function typeMap(types) {
  const map = new Map();
  for (const t of types || []) map.set(t.code, t);
  return map;
}
// Code affiché dans la vue annuelle selon la famille du motif.
export function absenceCode(type) {
  if (!type) return "AB";
  return type.category === "cp" ? "CP" : type.category === "rtt" ? "RTT" : type.category === "maladie" ? "AM" : "AB";
}

// Premier jour suivi pour un salarié : mise en service de l'outil, ou son entrée si elle est postérieure.
// « tracked_from » est un début de suivi propre au compte : il ne peut que retarder le premier jour, jamais l'avancer.
// (Posé par le chargement des données de démonstration sur les comptes qui existaient déjà : l'historique fictif ne les concerne pas.)
export function windowStart(user, sorted, settings) {
  let start = settings?.go_live || "1900-01-01";
  if (user?.tracked_from) start = maxDate(start, user.tracked_from);
  if (user?.entry_date) start = maxDate(start, user.entry_date);
  if (sorted.length) start = maxDate(start, sorted[0].start_date);
  return start;
}
export function isWorkday(user, sorted, date) {
  const c = contractAt(sorted, date);
  if (!c) return false;
  if (user?.entry_date && date < user.entry_date) return false;
  if (user?.exit_date && date > user.exit_date) return false;
  return c.work_days.includes(isoDow(date)) && !holidayName(date);
}

/**
 * Une fiche par jour de la période.
 * days : lignes de pointage du salarié ; absences : ses absences (tous états) ; today/hm : date et heure du serveur.
 */
export function buildDays({ user, contracts, days, absences, types, settings, from, to, today }) {
  const sorted = sortContracts(contracts || []);
  const tmap = types instanceof Map ? types : typeMap(types);
  const rows = new Map();
  for (const d of days || []) rows.set(d.day, d);
  const valid = (absences || []).filter((a) => a.status === "valide");
  const pending = (absences || []).filter((a) => a.status === "en_attente");
  const start = windowStart(user, sorted, settings);
  const out = [];
  for (const date of eachDay(from, to)) {
    const c = contractAt(sorted, date);
    const holiday = holidayName(date);
    const inWindow = !!c && date >= start && (!user?.exit_date || date <= user.exit_date);
    const scheduled = !!c && c.work_days.includes(isoDow(date));
    const workday = inWindow && scheduled && !holiday;
    const hourly = c?.regime === "horaire";
    const theoFull = workday && hourly ? c.day_minutes[isoDow(date) - 1] : 0;
    const abs = valid.find((a) => a.start_date <= date && a.end_date >= date) || null;
    const absPending = abs ? null : pending.find((a) => a.start_date <= date && a.end_date >= date) || null;
    const share = abs ? (abs.half ? 0.5 : 0) : 1; // part de la journée restant à travailler
    const theo = Math.round(theoFull * share);
    const row = rows.get(date) || null;
    const times = row?.times || [];
    const open = times.length % 2 === 1;
    const complete = times.length > 0 && !open;
    const worked = netMinutes(times, c, settings);
    const past = date < today;
    const counted = inWindow && (past || (date === today && complete));
    const anomalies = [];
    if (past && open) anomalies.push("depart");
    if (past && workday && times.length === 0 && (!abs || abs.half) && !absPending) anomalies.push("vide");
    out.push({
      date, holiday, inWindow, scheduled, workday, regime: c?.regime || null, theoFull, theo,
      abs: abs ? { id: abs.id, type: abs.type_code, half: abs.half || "", code: absenceCode(tmap.get(abs.type_code)), label: tmap.get(abs.type_code)?.label || abs.type_code,
        absenteeism: tmap.get(abs.type_code)?.absenteeism !== false } : null,
      absPending: absPending ? { id: absPending.id, type: absPending.type_code, label: tmap.get(absPending.type_code)?.label || absPending.type_code } : null,
      row, times, open, complete, worked, counted, ecart: counted && hourly ? worked - theo : 0,
      pause: pauseApplied(times, c, settings) ? c.pause_minutes : 0,
      anomalies,
    });
  }
  return out;
}

const fmt = (m) => `${Math.floor(m / 60)} h ${String(Math.round(m) % 60).padStart(2, "0")}`;
const ANOMALY_TEXT = { depart: "Départ non pointé", vide: "Aucun pointage ni absence" };

/**
 * Totaux d'une période à partir des fiches jour. `recs` peut déborder de la période (semaines entières)
 * pour que les alertes hebdomadaires et de repos soient justes aux bords.
 */
export function summarize(recs, { from, to, settings }) {
  const maxDay = settings?.max_day_min ?? 600, maxWeek = settings?.max_week_min ?? 2880, minRest = settings?.min_rest_min ?? 660;
  const s = { worked: 0, theo: 0, ecart: 0, days_worked: 0, validated: 0, pending: 0, refused: 0, theo_days: 0,
    abs: {}, abs_days: 0, abs_unplanned: 0, anomalies: [], alerts: [] };
  const weeks = new Map();
  let prev = null;
  for (const r of recs) {
    const inside = r.date >= from && r.date <= to;
    if (r.times.length) {
      const wk = mondayOf(r.date);
      weeks.set(wk, (weeks.get(wk) || 0) + r.worked);
      if (inside && r.worked > maxDay) s.alerts.push({ date: r.date, kind: "jour", text: `Plus de ${fmt(maxDay)} travaillées (${fmt(r.worked)})` });
      if (inside && prev && prev.date === addDays(r.date, -1) && prev.complete) {
        const rest = 1440 - toMin(prev.times[prev.times.length - 1]) + toMin(r.times[0]);
        if (rest < minRest) s.alerts.push({ date: r.date, kind: "repos", text: `Repos de ${fmt(rest)} seulement depuis la veille (minimum ${fmt(minRest)})` });
      }
    }
    prev = r;
    if (!inside) continue;
    if (r.times.length) {
      s.worked += r.worked; s.days_worked += 1;
      if (r.row.status === "valide") s.validated += 1; else if (r.row.status === "refuse") s.refused += 1; else s.pending += 1;
    } else if (r.row) {
      if (r.row.status === "valide") s.validated += 1; else if (r.row.status === "refuse") s.refused += 1; else s.pending += 1;
    }
    if (r.counted) { s.theo += r.theo; s.ecart += r.ecart; }
    if (r.inWindow && r.scheduled && !r.holiday) {
      s.theo_days += 1;
      if (r.abs) {
        const q = r.abs.half ? 0.5 : 1;
        s.abs[r.abs.type] = (s.abs[r.abs.type] || 0) + q; s.abs_days += q;
        if (r.abs.absenteeism) s.abs_unplanned += q;
      }
    }
    for (const a of r.anomalies) s.anomalies.push({ date: r.date, kind: a, text: ANOMALY_TEXT[a] });
  }
  for (const [wk, total] of weeks) {
    if (total > maxWeek && addDays(wk, 6) >= from && wk <= to) s.alerts.push({ date: wk, kind: "semaine", text: `Semaine de plus de ${fmt(maxWeek)} (${fmt(total)})` });
  }
  s.alerts.sort((a, b) => (a.date < b.date ? -1 : 1));
  return s;
}

// Nombre de jours d'absence décomptés : jours travaillés de l'horaire en vigueur, hors jours fériés.
export function countAbsenceDays({ user, contracts, start, end, half, clipFrom, clipTo }) {
  const sorted = sortContracts(contracts || []);
  const a = clipFrom && clipFrom > start ? clipFrom : start, b = clipTo && clipTo < end ? clipTo : end;
  if (b < a) return 0;
  if (half) return isWorkday(user, sorted, start) && start >= a && start <= b ? 0.5 : 0;
  let n = 0;
  for (const d of eachDay(a, b)) if (isWorkday(user, sorted, d)) n += 1;
  return n;
}
