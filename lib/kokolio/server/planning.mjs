// Planning : la bibliothèque (horaires journaliers, cycles) et la grille « qui est prévu quand ».
import { eachDay, holidayName, monthOf } from "../engine/dates.mjs";
import { buildDays, contractAt, sortContracts, typeMap } from "../engine/model.mjs";
import { planAt, rangesText } from "../engine/plan.mjs";
import { bundle } from "./views.mjs";

const modelOut = (m) => ({ code: m.code, label: m.label, minutes: m.minutes, ranges: m.ranges || [], ranges_text: rangesText(m.ranges), color: m.color || "" });

export function libView(lib) {
  return {
    can_edit: !!lib.can_edit,
    models: (lib.models || []).map((m) => ({ ...modelOut(m), active: m.active, sort: m.sort, version: m.version, cycles: m.cycles, locked: !!m.locked })),
    cycles: (lib.cycles || []).map((c) => {
      const totals = c.weeks.map((w) => w.reduce((s, e) => s + (e ? e.minutes : 0), 0));
      return {
        id: c.id, name: c.name, active: c.active, annualise: !!c.annualise, version: c.version, codes: c.codes, assigned: c.assigned, locked: !!c.locked,
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
  const l = libView(lib), connus = new Set(l.models.map((m) => m.code));
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
      if (hors) return { hors: true };
      const p = r.plan;
      const prevu = r.scheduled && (!r.holiday || p.source === "exception");
      if (prevu && r.regime === "horaire") total += p.minutes;
      // Réponse allégée : à 500 salariés sur quatre semaines, la grille compte 14 000 cases. Ce qui est vide, ou se déduit du jour
      // (date, férié, clôture) ou de l'horaire désigné par son code (libellé, plages, couleur), n'est pas répété : voir public/kokolio/js/grille.js.
      const cell = { source: p.source };
      if (prevu) { cell.work = true; cell.minutes = p.minutes; if (p.code) cell.code = p.code; }
      if (prevu && (!p.code || !connus.has(p.code))) { if (p.label) cell.label = p.label; if (p.ranges.length) { cell.ranges = rangesText(p.ranges); cell.r = p.ranges; } if (p.color) cell.color = p.color; }
      if (p.note) cell.note = p.note;
      if (!!r.scheduled !== prevu) cell.sched = !!r.scheduled;          // jour férié non travaillé : prévu par le cycle, mais chômé
      if (p.source === "exception") {
        // ce que prévoit le cycle ou l'horaire fixe ce jour-là, exception mise à part : sert à recopier une semaine
        const d = planAt(contractAt(sorted, r.date), r.date, null);
        cell.def = { sched: d.scheduled, minutes: d.minutes, code: d.code };
      }
      if (r.abs) cell.absence = { label: r.abs.label, code: r.abs.code, half: r.abs.half, pending: false };
      else if (r.absPending) cell.absence = { label: r.absPending.label, code: "?", half: "", pending: true };
      return cell;
    });
    rows.push({
      user_id: u.id, name: u.name, team: u.team || "", regime: ref?.regime || "horaire", presence: ref?.presence || "pointage", cycle: ref?.cycle?.name || "",
      // nul ne modifie son propre planning, sauf l'administrateur sans responsable (même règle que pour la validation)
      can_edit: u.id !== me.id || (me.role === "admin" && !me.manager_id),
      total, cells,
    });
  }
  rows.sort((x, y) => x.team.localeCompare(y.team, "fr") || x.name.localeCompare(y.name, "fr"));
  return {
    from, to, today, days: dates.map((d) => ({ date: d, holiday: holidayName(d), closed: c.closed.includes(monthOf(d)) })), rows,
    // « codes » : tous les horaires de la bibliothèque (pour lire les cases) ; « models » : ceux qu'on peut encore appliquer
    codes: Object.fromEntries(l.models.map((m) => [m.code, { label: m.label, minutes: m.minutes, ranges_text: m.ranges_text, color: m.color }])),
    models: l.models.filter((m) => m.active), can_lib: l.can_edit,
  };
}
