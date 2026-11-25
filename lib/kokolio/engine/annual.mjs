// Annualisation : sur une période de référence, les heures se compensent d'une semaine à l'autre.
// Un salarié est annualisé les jours où il suit un cycle annualisé. Le calcul repose sur les mêmes fiches jour que le reste de l'outil :
//   objectif        = objectif fixé par les RH (à défaut : total des heures planifiées) + ajustements − heures d'absence « retirées »
//   réalisé         = heures travaillées des jours comptés + heures des absences « comptées comme réalisées »
//   reste à faire   = objectif − réalisé
//   prévision       = réalisé + ce qui reste planifié jusqu'à la fin de la période
//   solde (semaine) = réalisé − prévu de la semaine, cumulé de semaine en semaine
import { addDays, maxDate, minDate, mondayOf } from "./dates.mjs";
import { buildDays, contractAt, sortContracts, typeMap } from "./model.mjs";

// Période à afficher : celle qui contient la date, sinon la dernière commencée, sinon la prochaine.
export function pickPeriod(periods, today, id) {
  const list = [...(periods || [])].sort((a, b) => (a.start_date < b.start_date ? -1 : 1));
  if (id) return list.find((p) => p.id === id) || null;
  return list.find((p) => p.start_date <= today && p.end_date >= today) || [...list].reverse().find((p) => p.start_date <= today) || list[0] || null;
}

export function annualFigures({ user, contracts, days, absences, plan, types, settings, period, goal, entries, today, live }) {
  const sorted = sortContracts(contracts || []), tmap = types instanceof Map ? types : typeMap(types);
  const recs = buildDays({ user, contracts: sorted, days, absences, plan, types: tmap, settings, from: period.start_date, to: period.end_date, today, live });
  let planned = 0, removed = 0, done = 0, rest = 0, any = false, from = null, to = null;
  const weeks = new Map(), byType = new Map();
  for (const r of recs) {
    const c = contractAt(sorted, r.date);
    if (!c?.cycle?.annualise || !r.inWindow) continue;      // jour hors annualisation : cycle non annualisé, horaire fixe, hors suivi
    any = true; from = from || r.date; to = r.date;
    const absMin = r.abs ? r.theoFull - r.theo : 0;          // temps prévu couvert par une absence validée
    const mode = r.abs && absMin ? tmap.get(r.abs.type)?.annual || "retire" : "";
    const absDone = mode === "realise" ? absMin : 0;
    planned += r.theoFull;
    if (mode === "retire") removed += absMin;
    if (mode) { const t = byType.get(r.abs.type) || { type: r.abs.type, label: r.abs.label, mode, minutes: 0 }; t.minutes += absMin; byType.set(r.abs.type, t); }
    const k = mondayOf(r.date);
    const w = weeks.get(k) || { week: k, from: maxDate(k, period.start_date), to: minDate(addDays(k, 6), period.end_date), planned: 0, done: 0, balance: 0, counted: false };
    // « prévu » d'une semaine : ce qui est attendu une fois les absences retirées (une absence comptée comme réalisée reste attendue, et faite)
    w.planned += r.theo + absDone + (mode === "neutre" ? absMin : 0);
    if (r.counted) { done += r.worked + absDone; w.done += r.worked + absDone; w.balance += r.worked + absDone - (r.theo + absDone + (mode === "neutre" ? absMin : 0)); w.counted = true; }
    else rest += r.theo + absDone;
    weeks.set(k, w);
  }
  const mine = (entries || []).filter((e) => e.period_id === period.id);
  const adjustments = mine.reduce((s, e) => s + Number(e.minutes), 0);
  const base = goal ? Number(goal.minutes) : planned;
  const objective = base + adjustments - removed;
  let cumul = 0;
  const rows = [...weeks.values()].sort((a, b) => (a.week < b.week ? -1 : 1)).map((w) => {
    if (w.counted) cumul += w.balance;
    return { ...w, cumul: w.counted ? cumul : null, current: today >= w.week && today <= addDays(w.week, 6) };
  });
  return {
    annual: any, period: { id: period.id, label: period.label, start_date: period.start_date, end_date: period.end_date }, from, to,
    goal_set: !!goal, goal_note: goal?.note || "", base, planned, adjustments, removed, objective,
    done, remaining: objective - done, planned_rest: rest, forecast: done + rest, gap: done + rest - objective, balance: cumul,
    absences: [...byType.values()], entries: mine, weeks: rows,
  };
}
