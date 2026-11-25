// Mise en forme des réponses : à partir des lignes renvoyées par la base (déjà limitées au périmètre autorisé),
// le moteur calcule ce que l'interface affiche. Aucune règle de droit ici : elles sont toutes dans la base.
import { addDays, addMonths, mondayOf, monthEnd, monthOf, monthStart } from "../engine/dates.mjs";
import { buildDays, contractAt, sortContracts, summarize, typeMap, weeklyMinutes } from "../engine/model.mjs";
import { balances } from "../engine/balances.mjs";
import { yearView } from "../engine/yearview.mjs";
import { APP_VERSION } from "../version.mjs";

// Regroupe les lignes par salarié.
export function bundle(data) {
  const m = new Map();
  for (const u of data.users || []) m.set(u.id, { user: u, contracts: [], days: [], absences: [], entries: [] });
  for (const c of data.contracts || []) m.get(c.user_id)?.contracts.push(c);
  for (const d of data.days || []) m.get(d.user_id)?.days.push(d);
  for (const a of data.absences || []) m.get(a.user_id)?.absences.push(a);
  for (const e of data.entries || []) m.get(e.user_id)?.entries.push(e);
  return m;
}

// Bornes de lecture d'un mois : semaines entières, plus la veille, pour des alertes justes aux bords.
export function monthRange(month) {
  const from = monthStart(month), to = monthEnd(month);
  return { from, to, extFrom: addDays(mondayOf(from), -1), extTo: addDays(mondayOf(to), 6) };
}

export function bootView(c) {
  const u = c.user;
  return {
    me: {
      id: u.id, login: u.login, role: u.role, name: u.name, first_name: u.first_name, last_name: u.last_name, team: u.team, job: u.job,
      matricule: u.matricule, manager_name: u.manager_name, regime: c.contract?.regime || "horaire", weekly_minutes: weeklyMinutes(c.contract),
      // « suivi » : le compte a un horaire, donc il pointe. Un compte technique (administrateur de départ) n'en a pas.
      tracked: !!c.contract, is_manager: c.reports > 0, reports: c.reports, self_validate: u.role === "admin" && !u.manager_id && !!c.contract,
    },
    settings: { company: c.settings.company, logo_url: c.settings.logo_url, lieux: c.settings.lieux, go_live: c.settings.go_live },
    types: c.types.filter((t) => t.active).map((t) => ({ code: t.code, label: t.label, category: t.category, needs_doc: t.needs_doc })),
    closed: c.closed, today: c.today, hm: c.hm, now: c.now, app: APP_VERSION, schema: c.schema, demo: !!c.demo,
  };
}

export function dayOut(r) {
  return {
    id: r.row?.id || null, date: r.date, times: r.times, status: r.row?.status || null, lieu: r.row?.lieu || null,
    corrected: !!r.row?.corrected, comment: r.row?.comment || "", refusal_reason: r.row?.refusal_reason || "", version: r.row?.version || null,
    worked: r.worked, theo: r.theo, ecart: r.ecart, counted: r.counted, open: r.open, complete: r.complete, pause: r.pause,
    holiday: r.holiday, workday: r.workday, regime: r.regime, anomalies: r.anomalies,
    absence: r.abs ? r.abs.label + (r.abs.half ? (r.abs.half === "matin" ? " (matin)" : " (après-midi)") : "") : "",
    absence_pending: r.absPending ? r.absPending.label : "",
  };
}

export function absOut(a, types) {
  const t = types.get(a.type_code);
  return {
    id: a.id, user_id: a.user_id, type_code: a.type_code, label: t?.label || a.type_code, category: t?.category || "autre",
    start_date: a.start_date, end_date: a.end_date, half: a.half || "", days_count: Number(a.days_count), status: a.status,
    comment: a.comment || "", refusal_reason: a.refusal_reason || "", has_doc: !!a.has_doc, version: a.version,
    by_rh: !!a.created_by && a.created_by !== a.user_id, created_at: a.created_at,
  };
}

// Écran « Pointer » : état du jour, compteurs de la semaine et du mois, points à régulariser.
export function todayView(data, from) {
  const c = data.ctx, today = data.today, month = monthOf(today);
  const b = bundle(data).get(c.user.id);
  const types = typeMap(c.types), settings = c.settings;
  const recs = buildDays({ user: b.user, contracts: b.contracts, days: b.days, absences: b.absences, types, settings, from, to: today, today });
  const rec = recs[recs.length - 1];
  const wk = mondayOf(today);
  const week = summarize(recs, { from: wk, to: addDays(wk, 6), settings });
  const cur = summarize(recs, { from: monthStart(month), to: monthEnd(month), settings });
  const prevMonth = addMonths(month, -1);
  const prevOpen = !c.closed.includes(prevMonth) && monthEnd(prevMonth) >= (settings.go_live || "");
  const prev = prevOpen ? summarize(recs, { from: monthStart(prevMonth), to: monthEnd(prevMonth), settings }) : null;
  const contract = contractAt(sortContracts(b.contracts), today);
  return {
    today, hm: data.hm, now: c.now, month, closed: c.closed.includes(month), regime: contract?.regime || "horaire",
    weekly_minutes: weeklyMinutes(contract), forfait_days: contract?.forfait_days || 218,
    day: rec.row ? dayOut(rec) : null,
    worked: rec.worked, open_since: rec.open ? rec.times[rec.times.length - 1] : null, theo: rec.theo, pause: rec.pause,
    holiday: rec.holiday, absence: rec.abs ? { label: rec.abs.label, half: rec.abs.half } : null,
    week: { worked: week.worked, theo: week.theo, ecart: week.ecart },
    month_sum: { worked: cur.worked, theo: cur.theo, ecart: cur.ecart, days_worked: cur.days_worked },
    anomalies: [...(prev ? prev.anomalies : []), ...cur.anomalies], alerts: cur.alerts,
    forfait: null,
  };
}

// Écran « Heures » : le mois jour par jour.
export function monthView({ user, contracts, days, absences }, { types, settings, closed, today, month }) {
  const { from, to, extFrom, extTo } = monthRange(month);
  const recs = buildDays({ user, contracts, days, absences, types, settings, from: extFrom, to: extTo, today });
  const s = summarize(recs, { from, to, settings });
  const contract = contractAt(sortContracts(contracts), to < today ? to : today) || sortContracts(contracts).slice(-1)[0];
  return {
    month, today, closed: closed.includes(month), regime: contract?.regime || "horaire", weekly_minutes: weeklyMinutes(contract),
    summary: { worked: s.worked, theo: s.theo, ecart: s.ecart, days_worked: s.days_worked, validated: s.validated, pending: s.pending, refused: s.refused, abs_days: s.abs_days },
    // les jours pointés, et les jours prévus sans pointage (absence, férié, oubli) jusqu'à aujourd'hui
    days: recs.filter((r) => r.date >= from && r.date <= to && (r.row || (r.inWindow && r.scheduled && (r.abs || r.absPending || r.anomalies.length || (r.holiday && r.date <= today))))).map(dayOut).reverse(),
    anomalies: s.anomalies, alerts: s.alerts, go_live: settings.go_live || "",
  };
}

// Écran « Absences » : soldes de l'année et demandes.
export function absencesView(data) {
  const c = data.ctx, b = bundle(data).get(c.user.id), types = typeMap(c.types), year = +data.today.slice(0, 4);
  return {
    today: data.today, year,
    balances: balances({ user: b.user, contracts: b.contracts, entries: b.entries, absences: b.absences, types, settings: c.settings, year, today: data.today }),
    absences: b.absences.map((a) => absOut(a, types)).sort((x, y) => (x.start_date < y.start_date ? 1 : -1)),
    closed: c.closed,
    // en début d'année, tant que les RH n'ont pas passé le report, le solde affiché ne contient pas les jours de l'an dernier
    report_pending: !!c.settings.go_live && +c.settings.go_live.slice(0, 4) < year && !b.entries.some((e) => e.kind === "cp" && e.year === year && e.tag === "report"),
  };
}

export function yearOut(data, userId, year) {
  const c = data.ctx, b = bundle(data).get(userId);
  const v = yearView({ user: b.user, contracts: b.contracts, days: b.days, absences: b.absences, types: typeMap(c.types), settings: c.settings, year, today: data.today });
  return { ...v, user: { id: b.user.id, name: b.user.name }, today: data.today };
}

// Écran « Validation » : demandes d'absence et journées en attente, avec ce qu'il faut pour décider.
export function pendingView(p, data, meId) {
  const c = data.ctx, types = typeMap(c.types), settings = c.settings, today = data.today, all = bundle(data);
  const absences = (p.absences || []).map((a) => {
    const b = all.get(a.user_id); if (!b) return null;
    const out = absOut(a, types);
    const t = types.get(a.type_code);
    let balance = null;
    if (t?.category === "cp" || t?.category === "rtt") {
      const bal = balances({ user: b.user, contracts: b.contracts, entries: b.entries, absences: b.absences, types, settings, year: +a.start_date.slice(0, 4), today });
      balance = t.category === "cp" ? { kind: "CP", value: bal.cp.balance } : { kind: "RTT", value: bal.rtt.balance };
    }
    // même équipe, ou même responsable : qui d'autre est absent sur la période ?
    const overlaps = [];
    for (const o of all.values()) {
      if (o.user.id === a.user_id) continue;
      const sameGroup = (b.user.team && o.user.team === b.user.team) || (b.user.manager_id && o.user.manager_id === b.user.manager_id);
      if (!sameGroup) continue;
      for (const x of o.absences) {
        if ((x.status === "valide" || x.status === "en_attente") && x.start_date <= a.end_date && x.end_date >= a.start_date) {
          overlaps.push({ name: o.user.name, label: types.get(x.type_code)?.label || x.type_code, start_date: x.start_date, end_date: x.end_date, pending: x.status === "en_attente" });
        }
      }
    }
    return { ...out, name: b.user.name, team: b.user.team, manager_name: b.user.manager_name, balance, overlaps, own: a.user_id === meId };
  }).filter(Boolean);

  const byUser = new Map();
  for (const d of p.days || []) { if (!byUser.has(d.user_id)) byUser.set(d.user_id, []); byUser.get(d.user_id).push(d); }
  const groups = [];
  for (const [uid, rows] of byUser) {
    const b = all.get(uid); if (!b) continue;
    rows.sort((x, y) => (x.day < y.day ? -1 : 1));
    const recs = buildDays({ user: b.user, contracts: b.contracts, days: rows, absences: b.absences, types, settings, from: rows[0].day, to: rows[rows.length - 1].day, today });
    const s = summarize(recs, { from: rows[0].day, to: rows[rows.length - 1].day, settings });
    const days = recs.filter((r) => r.row).map((r) => {
      const o = dayOut(r);
      o.state = r.date >= today ? "en_cours" : r.open ? "incomplet" : c.closed.includes(monthOf(r.date)) ? "clos" : "ok";
      o.alerts = s.alerts.filter((x) => x.date === r.date).map((x) => x.text);
      return o;
    });
    groups.push({ user_id: uid, name: b.user.name, team: b.user.team, manager_name: b.user.manager_name, own: uid === meId, days, ready: days.filter((d) => d.state === "ok").length });
  }
  groups.sort((x, y) => x.name.localeCompare(y.name, "fr"));
  const summary = (p.summary || []).map((s) => { const b = all.get(s.user_id); return b ? { ...s, name: b.user.name, team: b.user.team, manager_name: b.user.manager_name } : null; }).filter(Boolean);
  return { today, absences, groups, summary, total_days: summary.reduce((n, s) => n + s.n, 0) };
}

// Écran « Synthèse » : une ligne par salarié pour le mois, et les indicateurs du jour.
export function teamMonthView(data, month) {
  const c = data.ctx, types = typeMap(c.types), settings = c.settings, today = data.today;
  const { from, to, extFrom, extTo } = monthRange(month);
  const rows = [];
  for (const b of bundle(data).values()) {
    const u = b.user;
    const present = (!u.entry_date || u.entry_date <= to) && (!u.exit_date || u.exit_date >= from);
    const suivi = b.contracts.some((k) => k.start_date <= to && (!k.end_date || k.end_date >= from));
    if ((!present || u.disabled || !suivi) && !b.days.some((d) => d.day >= from && d.day <= to)) continue;
    const recs = buildDays({ user: u, contracts: b.contracts, days: b.days, absences: b.absences, types, settings, from: extFrom, to: extTo, today });
    const s = summarize(recs, { from, to, settings });
    const now = recs.find((r) => r.date === today);
    rows.push({
      user_id: u.id, name: u.name, team: u.team, matricule: u.matricule, manager_name: u.manager_name,
      regime: recs.find((r) => r.date >= from && r.date <= to && r.regime)?.regime || "horaire",
      worked: s.worked, theo: s.theo, ecart: s.ecart, days: s.days_worked, pending: s.pending + s.refused, abs_days: s.abs_days,
      alerts: s.alerts.length, anomalies: s.anomalies.length, theo_days: s.theo_days, abs_unplanned: s.abs_unplanned,
      present: !!now?.open, absent: !!(now?.abs && now.workday && !now.abs.half),
    });
  }
  rows.sort((x, y) => x.name.localeCompare(y.name, "fr"));
  const sum = (k) => rows.reduce((n, r) => n + r[k], 0);
  const theoDays = sum("theo_days");
  return {
    month, today, closed: c.closed.includes(month), current: month === monthOf(today), rows,
    tiles: {
      employees: rows.length, present: rows.filter((r) => r.present).length, absent: rows.filter((r) => r.absent).length,
      pending: sum("pending"), alerts: sum("alerts"), anomalies: sum("anomalies"),
      absenteeism: theoDays ? Math.round((sum("abs_unplanned") / theoDays) * 1000) / 10 : null, worked: sum("worked"),
    },
  };
}
