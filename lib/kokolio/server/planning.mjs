// Planning : la bibliothèque (horaires journaliers, cycles) et la grille « qui est prévu quand ».
import { eachDay, holidayName, monthOf } from "../engine/dates.mjs";
import { buildDays, contractAt, sortContracts, typeMap } from "../engine/model.mjs";
import { rangesText } from "../engine/plan.mjs";
import { bundle } from "./views.mjs";

const modelOut = (m) => ({ code: m.code, label: m.label, minutes: m.minutes, ranges: m.ranges || [], ranges_text: rangesText(m.ranges), color: m.color || "" });

export function libView(lib) {
  return {
    can_edit: !!lib.can_edit,
    models: (lib.models || []).map((m) => ({ ...modelOut(m), active: m.active, sort: m.sort, version: m.version, cycles: m.cycles, locked: !!m.locked })),
    cycles: (lib.cycles || []).map((c) => {
      const totals = c.weeks.map((w) => w.reduce((s, e) => s + (e ? e.minutes : 0), 0));
      return {
        id: c.id, name: c.name, active: c.active, version: c.version, codes: c.codes, assigned: c.assigned, locked: !!c.locked,
        weeks: c.weeks.map((w) => w.map((e) => (e ? modelOut(e) : null))), week_minutes: totals,
        weekly_minutes: totals.length ? Math.round(totals.reduce((s, t) => s + t, 0) / totals.length) : 0,
      };
    }),
  };
}

/**
 * Grille du planning : une ligne par salarié, une case par jour. Chaque case dit ce qui est prévu (horaire, durée, plages),
 * d'où cela vient (exception posée à la main, cycle, horaire fixe) et ce qui s'y superpose (jour férié, absence).
 */
export function planGridView(data, { from, to, lib }) {
  const c = data.ctx, me = c.user, today = data.today, types = typeMap(c.types), settings = c.settings;
  const dates = eachDay(from, to);
  const rows = [];
  for (const b of bundle(data).values()) {
    const u = b.user, sorted = sortContracts(b.contracts);
    // hors planning : compte technique sans horaire, compte désactivé, salarié sorti avant la période ou pas encore entré
    if (!sorted.some((k) => k.start_date <= to && (!k.end_date || k.end_date >= from))) continue;
    if (u.disabled || (u.exit_date && u.exit_date < from) || (u.entry_date && u.entry_date > to)) continue;
    const recs = buildDays({ user: u, contracts: sorted, days: [], absences: b.absences, plan: b.plan, types, settings, from, to, today });
    const ref = contractAt(sorted, today >= from && today <= to ? today : from) || contractAt(sorted, to) || sorted[sorted.length - 1];
    let total = 0;
    const cells = recs.map((r) => {
      const hors = !r.regime || (u.entry_date && r.date < u.entry_date) || (u.exit_date && r.date > u.exit_date);
      const p = r.plan;
      const prevu = !hors && r.scheduled && (!r.holiday || p.source === "exception");
      if (prevu && r.regime === "horaire") total += p.minutes;
      return {
        date: r.date, hors: !!hors, work: prevu, code: prevu ? p.code : "", label: prevu ? p.label : "", minutes: prevu ? p.minutes : 0,
        ranges: prevu ? rangesText(p.ranges) : "", color: prevu ? p.color : "", source: hors ? "" : p.source, note: p?.note || "",
        holiday: r.holiday || "", closed: c.closed.includes(monthOf(r.date)),
        absence: r.abs ? { label: r.abs.label, code: r.abs.code, half: r.abs.half, pending: false } : r.absPending ? { label: r.absPending.label, code: "?", half: "", pending: true } : null,
      };
    });
    rows.push({
      user_id: u.id, name: u.name, team: u.team || "", regime: ref?.regime || "horaire", presence: ref?.presence || "pointage", cycle: ref?.cycle?.name || "",
      // nul ne modifie son propre planning, sauf l'administrateur sans responsable (même règle que pour la validation)
      can_edit: u.id !== me.id || (me.role === "admin" && !me.manager_id),
      total, cells,
    });
  }
  rows.sort((x, y) => x.team.localeCompare(y.team, "fr") || x.name.localeCompare(y.name, "fr"));
  const l = libView(lib);
  return {
    from, to, today, days: dates.map((d) => ({ date: d, holiday: holidayName(d) })), rows,
    models: l.models.filter((m) => m.active), can_lib: l.can_edit,
  };
}
