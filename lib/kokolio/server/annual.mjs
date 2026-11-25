// Annualisation : mise en forme pour l'écran du salarié, la fiche vue par le responsable ou les RH, et le tableau d'équipe.
import { annualFigures, pickPeriod } from "../engine/annual.mjs";
import { liveDay, typeMap } from "../engine/model.mjs";
import { bundle } from "./views.mjs";

const periodOut = (p) => ({ id: p.id, label: p.label, start_date: p.start_date, end_date: p.end_date, version: p.version });

// Suit-il un cycle annualisé à un moment de la période ?
export const annualisedIn = (contracts, period) => (contracts || []).some((c) => c.cycle?.annualise && c.start_date <= period.end_date && (!c.end_date || c.end_date >= period.start_date));

export function periodsView(data, today) {
  const list = (data.annual?.periods || []).map(periodOut);
  return { periods: list, current: pickPeriod(list, today)?.id || null, can_edit: data.ctx.user.role !== "salarie", today };
}

function figuresOf(b, data, period) {
  const c = data.ctx;
  return annualFigures({
    user: b.user, contracts: b.contracts, days: b.days, absences: b.absences, plan: b.plan, types: typeMap(c.types), settings: c.settings, period,
    goal: (data.annual?.goals || []).find((g) => g.user_id === b.user.id && g.period_id === period.id) || null,
    entries: (data.annual?.entries || []).filter((e) => e.user_id === b.user.id), today: data.today, live: liveDay(c.settings, data.today, data.hm),
  });
}

// Un salarié : les chiffres de la période, le détail semaine par semaine, et de quoi expliquer l'objectif.
export function annualEmployeeView(data, userId, period, periods) {
  const c = data.ctx, b = bundle(data).get(userId);
  const f = figuresOf(b, data, period);
  return {
    today: data.today, periods: periods.map(periodOut), period: periodOut(period), user: { id: b.user.id, name: b.user.name, team: b.user.team || "" },
    can_rh: c.user.role !== "salarie" && b.user.id !== c.user.id, own: b.user.id === c.user.id, ...f,
  };
}

// L'équipe : une ligne par salarié annualisé sur la période.
export function annualTeamView(data, period, periods) {
  const rows = [];
  for (const b of bundle(data).values()) {
    if (b.user.disabled || !annualisedIn(b.contracts, period)) continue;
    const f = figuresOf(b, data, period);
    if (!f.annual) continue;
    rows.push({ user_id: b.user.id, name: b.user.name, team: b.user.team || "", cycle: b.contracts.filter((k) => k.cycle?.annualise).slice(-1)[0]?.cycle?.name || "",
      goal_set: f.goal_set, objective: f.objective, done: f.done, remaining: f.remaining, forecast: f.forecast, gap: f.gap, balance: f.balance });
  }
  rows.sort((x, y) => x.name.localeCompare(y.name, "fr"));
  const sum = (k) => rows.reduce((n, r) => n + r[k], 0);
  return { today: data.today, periods: periods.map(periodOut), period: periodOut(period), rows,
    totals: { employees: rows.length, objective: sum("objective"), done: sum("done"), remaining: sum("remaining"), gap: sum("gap") } };
}
