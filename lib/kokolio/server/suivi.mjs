// Suivi au quotidien pour le responsable et les RH : les anomalies du mois, et le tableau des présents.
import { addDays, monthOf } from "../engine/dates.mjs";
import { buildDays, contractAt, liveDay, sortContracts, typeMap } from "../engine/model.mjs";
import { ANOMALY_KINDS, anomalySettings } from "../engine/signals.mjs";
import { rangesText } from "../engine/plan.mjs";
import { bundle, monthRange } from "./views.mjs";

const RANG = { corriger: 0, verifier: 1, info: 2 };
// nul ne traite ses propres anomalies ni son propre planning, sauf l'administrateur sans responsable
const peutGerer = (me, u) => u.id !== me.id || (me.role === "admin" && !me.manager_id);

/** Anomalies du mois : les deux oublis (départ non pointé, jour sans pointage) et les anomalies liées à l'horaire, avec leur traitement. */
export function anomaliesView(data, month) {
  const c = data.ctx, types = typeMap(c.types), settings = c.settings, today = data.today;
  const { from, to } = monthRange(month), live = liveDay(settings, today, data.hm);
  const acks = new Map((data.acks || []).map((a) => [`${a.user_id}|${a.day}|${a.kind}`, a]));
  const rows = [];
  for (const b of bundle(data).values()) {
    const u = b.user;
    if (!b.contracts.length) continue;
    const recs = buildDays({ user: u, contracts: b.contracts, days: b.days, absences: b.absences, plan: b.plan, types, settings, from, to, today, live });
    for (const r of recs) {
      const liste = [...r.anomalies.map((k) => ({ kind: k, text: "", level: "corriger" })), ...r.signals];
      for (const s of liste) {
        const a = acks.get(`${u.id}|${r.date}|${s.kind}`);
        rows.push({
          user_id: u.id, name: u.name, team: u.team || "", date: r.date, kind: s.kind, label: ANOMALY_KINDS[s.kind] || s.kind, text: s.text || "", level: s.level,
          ack: a ? { comment: a.comment || "", by: a.by || "", at: a.at } : null, can: peutGerer(c.user, u),
          day: r.row ? { id: r.row.id, version: r.row.version, status: r.row.status, times: r.times, lieu: r.row.lieu } : null,
        });
      }
    }
  }
  rows.sort((x, y) => RANG[x.level] - RANG[y.level] || (x.date < y.date ? 1 : x.date > y.date ? -1 : 0) || x.name.localeCompare(y.name, "fr"));
  const ouvertes = rows.filter((r) => !r.ack);
  return {
    month, today, closed: c.closed.includes(month), current: month === monthOf(today), rows, can_rh: c.user.role !== "salarie",
    counts: { corriger: ouvertes.filter((r) => r.level === "corriger").length, verifier: ouvertes.filter((r) => r.level === "verifier").length,
      info: ouvertes.filter((r) => r.level === "info").length, acquittees: rows.length - ouvertes.length },
  };
}

/**
 * Tableau des présents : l'état de chacun à l'instant, d'après ses pointages du jour, ses absences et son planning.
 * present (en poste) · sorti (a pointé, n'est plus en poste) · attendu (prévu, pas encore pointé) · auto (présence automatique : attendu sans pointage)
 * absent (absence validée) · repos (jour non travaillé ou férié).
 */
export function presenceView(data) {
  const c = data.ctx, types = typeMap(c.types), settings = c.settings, today = data.today, hm = data.hm;
  const live = liveDay(settings, today, hm), tolerance = anomalySettings(settings).late_min;
  const lieux = new Map((settings.lieux || []).map((l) => [l.code, l.label]));
  const minutes = (t) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
  const rows = [];
  for (const b of bundle(data).values()) {
    const u = b.user, sorted = sortContracts(b.contracts), k = contractAt(sorted, today);
    if (u.disabled || !k || (u.exit_date && u.exit_date < today) || (u.entry_date && u.entry_date > today)) continue;
    const recs = buildDays({ user: u, contracts: sorted, days: b.days, absences: b.absences, plan: b.plan, types, settings, from: addDays(today, -1), to: today, today, live });
    const jour = recs[1], veille = live && recs[0].open ? recs[0] : null, r = veille || jour;
    if (!jour.inWindow) continue;                                  // pas encore suivi : il n'a pas à figurer au tableau
    const row = { user_id: u.id, name: u.name, team: u.team || "", status: "repos", since: "", lieu: "", lieu_label: "", detail: "", late: false };
    const debut = jour.workday && jour.plan?.ranges?.length ? jour.plan.ranges[0][0] : "";
    if (r.open) {
      row.status = "present"; row.since = r.times[r.times.length - 1]; row.lieu = r.row.lieu || "bureau"; row.lieu_label = lieux.get(row.lieu) || row.lieu;
      row.detail = veille ? "depuis hier" : "";
    } else if (jour.abs && !jour.abs.half && (jour.workday || jour.scheduled)) {
      const a = b.absences.find((x) => x.id === jour.abs.id);
      row.status = "absent"; row.detail = jour.abs.label; row.until = a?.end_date || today;
    } else if (jour.times.length) {
      row.status = "sorti"; row.since = jour.times[jour.times.length - 1]; row.lieu = jour.row.lieu || ""; row.lieu_label = lieux.get(row.lieu) || "";
    } else if (!jour.workday) {
      row.status = "repos"; row.detail = jour.holiday ? `Férié : ${jour.holiday}` : jour.plan?.source === "exception" ? "Repos (planning)" : "";
    } else if (jour.auto) {
      row.status = "auto"; row.detail = jour.abs?.half ? `${jour.abs.label} (demi-journée)` : "";
    } else {
      row.status = "attendu"; row.detail = debut ? `prévu à ${rangesText([[debut, debut]]).split(" – ")[0]}` : "";
      row.late = !!debut && minutes(hm) > minutes(debut) + tolerance;
      if (jour.abs?.half) row.detail = [`${jour.abs.label} (demi-journée)`, row.detail].filter(Boolean).join(" · ");
    }
    rows.push(row);
  }
  rows.sort((x, y) => x.name.localeCompare(y.name, "fr"));
  const n = (f) => rows.filter(f).length, surSite = (r) => r.status === "present" && r.lieu !== "teletravail" && r.lieu !== "deplacement";
  return {
    today, hm, now: c.now, rows,
    tiles: { on_site: n(surSite), remote: n((r) => r.status === "present" && r.lieu === "teletravail"), travel: n((r) => r.status === "present" && r.lieu === "deplacement"),
      expected: n((r) => r.status === "attendu"), late: n((r) => r.status === "attendu" && r.late), auto: n((r) => r.status === "auto"), out: n((r) => r.status === "sorti"),
      absent: n((r) => r.status === "absent"), off: n((r) => r.status === "repos"), total: rows.length },
  };
}
