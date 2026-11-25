// Vue annuelle : une case par jour, avec un code lisible sans la couleur.
import { monthEnd, pad2 } from "./dates.mjs";
import { buildDays, rawMinutes } from "./model.mjs";

export const LEGEND = [
  ["T", "Travaillé"], ["TT", "Télétravail"], ["CP", "Congé payé"], ["RTT", "RTT"], ["AM", "Arrêt maladie"],
  ["AB", "Autre absence"], ["F", "Férié"], ["?", "Demande en attente"], ["!", "À régulariser"],
];
const pairs = (times) => { const out = []; for (let i = 0; i < times.length; i += 2) out.push(`${times[i]} → ${times[i + 1] || "…"}`); return out.join(" · "); };
const fmt = (m) => `${Math.floor(m / 60)} h ${String(Math.round(m) % 60).padStart(2, "0")}`;

export function classify(r, today) {
  if (r.abs && r.workday) {
    const half = r.abs.half ? ` (${r.abs.half === "matin" ? "matin" : "après-midi"})` : "";
    return { code: (r.abs.half ? "½" : "") + r.abs.code, cat: r.abs.code, text: r.abs.label + half };
  }
  if (r.holiday && !r.workday) return { code: "F", cat: "F", text: `Férié : ${r.holiday}` };
  if (r.times.length) {
    const tt = r.row?.lieu === "teletravail";
    return { code: tt ? "TT" : "T", cat: tt ? "TT" : "T", text: `${tt ? "Télétravail" : "Travaillé"} · ${pairs(r.times)} · ${fmt(r.worked)}` };
  }
  if (r.credited) return { code: "T", cat: "T", text: "Travaillé · présence automatique" };
  if (!r.scheduled || !r.inWindow) return { code: "", cat: "", text: r.scheduled ? "Hors période suivie" : "Jour non travaillé", off: true };
  if (r.absPending) return { code: "?", cat: "?", text: `${r.absPending.label} (demande en attente)` };
  if (r.date < today) return { code: "!", cat: "!", text: "Aucun pointage ni absence" };
  return { code: "", cat: "", text: "À venir" };
}

export function yearView({ user, contracts, days, absences, plan, types, settings, year, today }) {
  const from = `${year}-01-01`, to = `${year}-12-31`;
  const recs = buildDays({ user, contracts, days, absences, plan, types, settings, from, to, today });
  const totals = {};
  const months = [];
  let totalMinutes = 0;
  for (let m = 1; m <= 12; m++) {
    const month = `${year}-${pad2(m)}`, last = monthEnd(month);
    const cells = []; let minutes = 0;
    for (const r of recs) {
      if (r.date < `${month}-01` || r.date > last) continue;
      const c = classify(r, today);
      if (c.cat) {
        const q = c.code.startsWith("½") ? 0.5 : 1;
        totals[c.cat] = (totals[c.cat] || 0) + q;
        if (q === 0.5 && (r.times.length || r.credited)) totals.T = (totals.T || 0) + 0.5;
      }
      minutes += r.worked;
      cells.push({ d: +r.date.slice(8), date: r.date, code: c.code, cat: c.cat, text: c.text, off: !!c.off });
    }
    totalMinutes += minutes;
    months.push({ month, minutes, cells });
  }
  return { year: +year, months, totals, total_minutes: totalMinutes, legend: LEGEND };
}
export { rawMinutes };
