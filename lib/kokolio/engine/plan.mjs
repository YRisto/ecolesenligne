// Ce qui est prévu un jour donné pour un salarié. Trois sources, de la plus précise à la plus générale :
// l'exception posée ce jour-là sur le planning, le cycle de travail du contrat, l'horaire fixe du contrat.
import { diffDays, isoDow, mondayOf } from "./dates.mjs";

const REPOS = { scheduled: false, minutes: 0, ranges: [], code: "", label: "", color: "", note: "" };

// Exceptions d'un salarié rangées par date.
export function planMap(plan) {
  if (plan instanceof Map) return plan;
  const m = new Map();
  for (const p of plan || []) m.set(p.day, p);
  return m;
}

// Rang de la semaine dans le cycle : la semaine 1 commence le lundi d'ancrage, et le cycle se répète avant comme après.
export function cycleWeek(c, date) {
  const n = c.cycle.weeks.length;
  const w = Math.round(diffDays(c.cycle_anchor || c.start_date, mondayOf(date)) / 7);
  return ((w % n) + n) % n;
}

/**
 * Le prévu d'un jour : { scheduled, minutes, ranges, code, label, color, note, source }.
 * source : « exception », « cycle » ou « contrat ». Au forfait jours, les minutes ne servent qu'à dire si le jour est travaillé.
 */
export function planAt(c, date, exceptions) {
  if (!c) return { ...REPOS, source: "" };
  const x = exceptions?.get(date);
  if (x) {
    return { scheduled: x.minutes > 0, minutes: x.minutes, ranges: x.ranges || [], code: x.model_code || "", label: x.label || (x.minutes > 0 ? "Horaire du jour" : "Repos"),
      color: "", note: x.note || "", source: "exception" };
  }
  if (c.cycle_id) {
    // un contrat qui suit un cycle doit arriver avec ce cycle : calculer sans lui donnerait des chiffres faux sans que rien ne le signale
    if (!c.cycle || !Array.isArray(c.cycle.weeks) || !c.cycle.weeks.length) throw new Error("Cycle de travail non résolu pour le contrat " + (c.id || ""));
    const e = c.cycle.weeks[cycleWeek(c, date)]?.[isoDow(date) - 1] || null;
    if (!e) return { ...REPOS, source: "cycle" };
    return { scheduled: true, minutes: e.minutes, ranges: e.ranges || [], code: e.code, label: e.label, color: e.color || "", note: "", source: "cycle" };
  }
  const dow = isoDow(date), scheduled = c.work_days.includes(dow);
  return { ...REPOS, scheduled, minutes: scheduled ? c.day_minutes[dow - 1] || 0 : 0, source: "contrat" };
}

// Durée hebdomadaire d'un contrat : la semaine fixe, ou la moyenne des semaines du cycle.
export function weeklyMinutesOf(c) {
  if (!c) return 0;
  if (c.cycle_id && c.cycle?.weeks?.length) {
    const total = c.cycle.weeks.reduce((s, w) => s + w.reduce((t, e) => t + (e ? e.minutes : 0), 0), 0);
    return Math.round(total / c.cycle.weeks.length);
  }
  return c.day_minutes.reduce((s, m) => s + m, 0);
}

// « 08:45 » → minutes ; une heure du lendemain s'écrit au-delà de 24 h (« 25:30 »).
export const hmToMin = (hm) => +hm.slice(0, 2) * 60 + +hm.slice(3, 5);
// Plages lisibles : « 8 h 45 – 13 h 15 · 14 h – 18 h ». Une fin au-delà de minuit est suivie de « (+1) ».
export function rangesText(ranges) {
  const one = (t) => { const h = +t.slice(0, 2), m = t.slice(3, 5); return `${h % 24} h${m === "00" ? "" : " " + m}${h >= 24 ? " (+1)" : ""}`; };
  return (ranges || []).map(([a, b]) => `${one(a)} – ${one(b)}`).join(" · ");
}
