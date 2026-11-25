// Routes de l'API. Chaque route enchaîne un ou deux appels à la base (qui contrôle la session et les droits)
// puis met en forme la réponse. Les calculs viennent du moteur (lib/kokolio/engine).
import { ApiError } from "./db.mjs";
import { SCRYPT, codeHash, hashPassword, newCode, newSalt, newToken, sha256 } from "./crypto.mjs";
import { absOut, absencesView, bootView, bundle, monthRange, monthView, pendingView, teamMonthView, todayView, yearOut } from "./views.mjs";
import { libView, planGridView } from "./planning.mjs";
import { addDays, addMonths, isMonth, isYmd, mondayOf, monthOf, monthStart } from "../engine/dates.mjs";
import { buildDays, contractAt, countAbsenceDays, sortContracts, summarize, typeMap, weeklyMinutes } from "../engine/model.mjs";
import { balances, yearEndCp } from "../engine/balances.mjs";
import { buildExport, buildSnapshot } from "../engine/closure.mjs";
import { BALANCES_HEADER, TEMPLATE_HEADER, TEMPLATE_ROWS, prepareBalances, prepareImport } from "../engine/importcsv.mjs";
import { passwordIssues } from "../engine/password.mjs";
import { buildDemo } from "../engine/demo.mjs";
import { APP_VERSION, SCHEMA_EXPECTED } from "../version.mjs";

const HTTP = { interdit: 403, introuvable: 404, identifiants: 401 };
const bad = (message, code = "requete", status, extra) => { throw new ApiError(code, message, status || HTTP[code] || 400, extra); };
const need = (cond, message, code) => { if (!cond) bad(message, code); };
const str = (v, max = 500) => String(v ?? "").trim().slice(0, max);
const frTime = (iso) => new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

// Date du jour à Paris, pour borner les lectures. La date qui fait foi reste celle renvoyée par la base.
function parisToday(ctx) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(ctx.now ? new Date(ctx.now) : new Date());
}

function authResult(ctx, r, token, failMessage) {
  if (r.status === "ok") { ctx.startSession(token); return { name: r.user.name }; }
  if (r.status === "locked") bad(`Trop d'essais : ce compte est bloqué jusqu'à ${frTime(r.until)}.`, "compte_bloque", 429);
  if (r.status === "throttled") bad("Trop de tentatives depuis cette connexion. Réessayez dans quelques minutes.", "ralenti", 429);
  bad(failMessage, "identifiants", 401);
}

// Justificatif : type réel vérifié sur les premiers octets, pas sur l'extension annoncée.
function checkDoc(doc) {
  if (!doc) return null;
  need(typeof doc === "object" && typeof doc.data === "string" && doc.data.length > 0, "Justificatif illisible.", "justificatif");
  need(doc.data.length <= 3_400_000, "Le justificatif doit peser moins de 2,5 Mo.", "justificatif");
  const head = Buffer.from(doc.data.slice(0, 24), "base64");
  const is = (bytes, at = 0) => bytes.every((x, i) => head[at + i] === x);
  const mime = is([0xff, 0xd8, 0xff]) ? "image/jpeg" : is([0x89, 0x50, 0x4e, 0x47]) ? "image/png" : is([0x25, 0x50, 0x44, 0x46]) ? "application/pdf"
    : is([0x52, 0x49, 0x46, 0x46]) && is([0x57, 0x45, 0x42, 0x50], 8) ? "image/webp" : null;
  need(mime, "Format de justificatif non accepté : envoyez une photo (JPEG, PNG, WebP) ou un PDF.", "justificatif");
  return { name: str(doc.name || "justificatif", 120).replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_") || "justificatif", mime, data: doc.data };
}

async function loadToday(ctx) {
  const t = parisToday(ctx);
  const from = addDays(monthStart(addMonths(monthOf(t), -1)), -7);
  const data = await ctx.call("read", { scope: "self", from, to: addDays(t, 15), ctx: true });
  const view = todayView(data, from);
  if (view.regime === "forfait_jours") {
    // jours travaillés depuis le 1er janvier : journées pointées, et journées comptées d'office quand la présence est automatique
    const y = data.today.slice(0, 4);
    const yr = await ctx.call("read", { scope: "self", from: `${y}-01-01`, to: data.today, ctx: true });
    const b = bundle(yr).get(yr.ctx.user.id);
    const recs = buildDays({ user: b.user, contracts: b.contracts, days: b.days, absences: b.absences, plan: b.plan, types: typeMap(yr.ctx.types), settings: yr.ctx.settings, from: `${y}-01-01`, to: yr.today, today: yr.today });
    view.forfait = { days: summarize(recs, { from: `${y}-01-01`, to: yr.today, settings: yr.ctx.settings }).days_worked, target: view.forfait_days };
  }
  return view;
}

// Lecture d'un salarié (soi ou un autre, si la base l'autorise) sur une période, avec le contexte.
async function readOne(ctx, userId, from, to, extra = {}) {
  const data = await ctx.call("read", { ...(userId ? { scope: "users", user_ids: [userId] } : { scope: "self" }), from, to, ctx: true, ...extra });
  const id = userId || data.ctx.user.id;
  const b = bundle(data).get(id);
  need(b, "Salarié introuvable.", "introuvable");
  return { data, b, id, c: data.ctx, types: typeMap(data.ctx.types) };
}

function contractIn(b) {
  const c = b.contract || {};
  const regime = c.regime === "forfait_jours" ? "forfait_jours" : "horaire";
  const dm = Array.isArray(c.day_minutes) && c.day_minutes.length === 7 ? c.day_minutes.map((x) => Math.round(Number(x) || 0)) : [420, 420, 420, 420, 420, 0, 0];
  need(dm.every((x) => x >= 0 && x <= 960), "Durée journalière invalide.", "horaire");
  const wd = Array.isArray(c.work_days) ? [...new Set(c.work_days.map(Number).filter((x) => x >= 1 && x <= 7))].sort() : [1, 2, 3, 4, 5];
  const out = { regime, day_minutes: dm, work_days: wd, pause_minutes: Math.round(Number(c.pause_minutes ?? 45)), cp_per_month: Number(c.cp_per_month ?? 2.08), forfait_days: Math.round(Number(c.forfait_days ?? 218)),
    presence: c.presence === "automatique" ? "automatique" : "pointage" };
  // cycle de travail : la semaine 1 commence le lundi de la date indiquée (à défaut, celui de la date d'effet)
  if (c.cycle_id) { out.cycle_id = str(c.cycle_id, 40); if (isYmd(c.cycle_anchor)) out.cycle_anchor = c.cycle_anchor; }
  return out;
}

function employeeRow(u, contracts, today) {
  const sorted = sortContracts(contracts);
  const c = contractAt(sorted, today) || sorted[sorted.length - 1] || null;
  return { ...u, regime: c?.regime || "horaire", weekly_minutes: weeklyMinutes(c), tracked: !!c, active: !u.disabled && (!u.exit_date || u.exit_date >= today),
    presence: c?.presence || "pointage", cycle: c?.cycle?.name || "" };
}

async function closureData(ctx, month) {
  const { from, to } = monthRange(month);
  const data = await ctx.call("read", { scope: "all", from, to, ctx: true, fingerprint_month: month });
  const snapshot = buildSnapshot({ users: data.users, contracts: data.contracts, days: data.days, absences: data.absences, plan: data.plan, types: data.ctx.types, settings: data.ctx.settings, month, today: data.today });
  const text = buildExport(snapshot, data.ctx.settings);
  return { data, snapshot, text };
}

export const ROUTES = {
  // ------------------------------------------------------------------ comptes
  "public/info": async (ctx) => {
    const p = await ctx.call("ping");
    return { company: p.company, logo_url: p.logo_url, app: APP_VERSION, schema: p.schema, schema_expected: SCHEMA_EXPECTED, demo: !!p.demo };
  },
  "auth/login": async (ctx, b) => {
    const login = str(b.login, 80).toLowerCase(), password = String(b.password ?? "");
    need(login && password, "Saisissez votre identifiant et votre mot de passe.", "identifiants");
    need(password.length <= 200, "Mot de passe trop long.", "identifiants");
    const s = await ctx.call("auth_salt", { login });
    const pw_hash = await hashPassword(password, s.salt, s.params);
    const token = newToken();
    const r = await ctx.call("login", { login, pw_hash, new_token: sha256(token) });
    return authResult(ctx, r, token, "Identifiant ou mot de passe incorrect.");
  },
  "auth/activate": async (ctx, b) => {
    const login = str(b.login, 80).toLowerCase(), password = String(b.password ?? ""), code = str(b.code, 40);
    need(login && code, "Saisissez votre identifiant et votre code d'activation.", "identifiants");
    const issues = passwordIssues(password, login);
    if (issues.length) bad(issues.join(" "), "mot_de_passe", 400, { issues });
    const salt = newSalt(), token = newToken();
    const pw_hash = await hashPassword(password, salt, SCRYPT);
    const r = await ctx.call("activate", { login, code_hash: codeHash(code), salt, pw_hash, params: SCRYPT, new_token: sha256(token) });
    return authResult(ctx, r, token, "Identifiant ou code d'activation incorrect, ou code expiré. Demandez un nouveau code à votre responsable ou aux RH.");
  },
  "auth/logout": async (ctx) => { await ctx.call("logout"); ctx.endSession(); return {}; },
  "account/password": async (ctx, b) => {
    const c = await ctx.call("ctx");
    const issues = passwordIssues(String(b.password ?? ""), c.user.login);
    if (issues.length) bad(issues.join(" "), "mot_de_passe", 400, { issues });
    const s = await ctx.call("auth_salt", { login: c.user.login });
    const old_hash = await hashPassword(String(b.current ?? ""), s.salt, s.params);
    const salt = newSalt();
    const pw_hash = await hashPassword(String(b.password), salt, SCRYPT);
    await ctx.call("password_change", { old_hash, salt, pw_hash, params: SCRYPT });
    return {};
  },
  "account/sessions": async (ctx) => ({ sessions: await ctx.call("sessions") }),
  "account/revoke": async (ctx) => { await ctx.call("sessions_revoke"); return {}; },
  boot: async (ctx) => bootView(await ctx.call("ctx")),

  // ------------------------------------------------------------------ mon espace
  "my/today": async (ctx) => loadToday(ctx),
  "my/punch": async (ctx, b) => {
    const r = await ctx.call("punch", { lieu: str(b.lieu, 30) });
    const view = await loadToday(ctx);
    return { ...view, punched: { kind: r.kind || null, hm: r.hm, duplicate: !!r.duplicate } };
  },
  "my/lieu": async (ctx, b) => { await ctx.call("day_lieu", { day: str(b.day, 10), lieu: str(b.lieu, 30) }); return {}; },
  "my/month": async (ctx, b) => {
    need(isMonth(b.month), "Mois invalide.");
    const { extFrom, extTo } = monthRange(b.month);
    const { data, b: mine, c, types } = await readOne(ctx, null, extFrom, extTo);
    return monthView(mine, { types, settings: c.settings, closed: c.closed, today: data.today, hm: data.hm, month: b.month });
  },
  "my/correct": async (ctx, b) => {
    need(isYmd(b.day), "Jour invalide.", "date");
    need(Array.isArray(b.times) && b.times.length <= 20, "Liste d'heures invalide.", "heures");
    const args = { day: b.day, times: b.times.map((t) => str(t, 5)), lieu: str(b.lieu, 30), comment: str(b.comment, 500) };
    if (b.version != null) args.version = +b.version;
    if (b.user_id) args.user_id = str(b.user_id, 40);
    return ctx.call("day_set", args);
  },
  "my/absences": async (ctx) => {
    const y = +parisToday(ctx).slice(0, 4);
    return absencesView(await ctx.call("read", { scope: "self", from: `${y - 1}-01-01`, to: `${y + 1}-12-31`, days: false, ctx: true }));
  },
  "my/absence-preview": async (ctx, b) => {
    need(isYmd(b.start) && isYmd(b.end) && b.end >= b.start, "Choisissez des dates valides.", "date");
    const half = ["matin", "apres_midi"].includes(b.half) && b.start === b.end ? b.half : "";
    const y = +b.start.slice(0, 4);
    const { data, b: who, c, types } = await readOne(ctx, b.user_id ? str(b.user_id, 40) : null, `${y}-01-01`, `${+b.end.slice(0, 4)}-12-31`, { days: false });
    const t = types.get(str(b.type, 30));
    need(t && t.active, "Motif d'absence inconnu.");
    const days = countAbsenceDays({ user: who.user, contracts: who.contracts, plan: who.plan, start: b.start, end: b.end, half });
    const warnings = [];
    if (who.absences.some((a) => (a.status === "valide" || a.status === "en_attente") && a.start_date <= b.end && a.end_date >= b.start && !(a.half && half && a.half !== half))) warnings.push("Une absence existe déjà sur cette période.");
    if (c.closed.some((m) => m >= monthOf(b.start) && m <= monthOf(b.end))) warnings.push("Cette période touche un mois clôturé.");
    if (t.category === "cp" || t.category === "rtt") {
      const bal = balances({ user: who.user, contracts: who.contracts, entries: who.entries, absences: who.absences, plan: who.plan, types, settings: c.settings, year: y, today: data.today });
      const avail = t.category === "cp" ? bal.cp.available : bal.rtt.available;
      if (days > avail) warnings.push(`Cela dépasse le solde disponible (${String(avail).replace(".", ",")} j).`);
    }
    return { days, warnings, needs_doc: !!t.needs_doc };
  },
  "my/absence-request": async (ctx, b) => {
    need(isYmd(b.start) && isYmd(b.end) && b.end >= b.start, "Choisissez des dates valides.", "date");
    const half = ["matin", "apres_midi"].includes(b.half) && b.start === b.end ? b.half : "";
    const userId = b.user_id ? str(b.user_id, 40) : null;
    const doc = checkDoc(b.doc);
    // le décompte suit le planning du salarié sur la période : cycle, exceptions d'un jour, jours fériés
    const { b: who } = await readOne(ctx, userId, b.start, b.end, { days: false });
    const days = countAbsenceDays({ user: who.user, contracts: who.contracts, plan: who.plan, start: b.start, end: b.end, half });
    need(days > 0, "Cette période ne contient aucun jour travaillé.", "date");
    const args = { type: str(b.type, 30), start: b.start, end: b.end, half, days_count: days, comment: str(b.comment, 500) };
    if (userId) args.user_id = userId;
    if (doc) args.doc = doc;
    return ctx.call("absence_create", args);
  },
  "my/absence-cancel": async (ctx, b) => ctx.call("absence_cancel", { id: str(b.id, 40) }),
  "my/absence-doc": async (ctx, b) => {
    const doc = checkDoc(b.doc);
    need(doc, "Choisissez un fichier.", "justificatif");
    return ctx.call("absence_attach", { id: str(b.id, 40), doc });
  },
  doc: async (ctx, b) => ctx.call("doc_get", { id: str(b.id, 40) }),
  "my/year": async (ctx, b) => {
    const year = Math.round(Number(b.year));
    need(year >= 2000 && year <= 2100, "Année invalide.");
    const { data, id } = await readOne(ctx, b.user_id ? str(b.user_id, 40) : null, `${year}-01-01`, `${year}-12-31`);
    return yearOut(data, id, year);
  },
  "my/fiche": async (ctx, b) => {
    const u = await ctx.call("user_get", b.user_id ? { id: str(b.user_id, 40) } : {});
    const today = u.today;
    const c = contractAt(sortContracts(u.contracts), today) || null;
    return { user: u.user, contracts: u.contracts, entries: u.entries, current: c, today };
  },
  "punch-log": async (ctx, b) => {
    need(isYmd(b.day), "Jour invalide.", "date");
    return { punches: await ctx.call("punch_log", { user_id: b.user_id ? str(b.user_id, 40) : "", from: b.day, to: b.day }) };
  },

  // ------------------------------------------------------------------ équipe (responsable, RH)
  "team/pending": async (ctx, b) => {
    const scope = b.scope === "all" ? "all" : "team";
    const p = await ctx.call("pending", { scope, user_id: b.user_id ? str(b.user_id, 40) : "" });
    const y = +p.today.slice(0, 4);
    let from = `${y}-01-01`, to = `${y}-12-31`;
    for (const a of p.absences) { if (a.start_date < from) from = `${a.start_date.slice(0, 4)}-01-01`; if (a.end_date > to) to = `${a.end_date.slice(0, 4)}-12-31`; }
    for (const d of p.days) if (d.day < from) from = `${d.day.slice(0, 4)}-01-01`;
    if ((new Date(to) - new Date(from)) / 864e5 > 1090) from = addDays(to, -1090);
    const data = await ctx.call("read", { scope, from, to, days: false, ctx: true });
    // un administrateur sans responsable valide aussi ses propres journées : il faut sa fiche dans le lot
    const meId = data.ctx.user.id;
    if (!data.users.some((u) => u.id === meId) && (p.days.some((d) => d.user_id === meId) || p.absences.some((a) => a.user_id === meId) || p.summary.some((s) => s.user_id === meId))) {
      const self = await ctx.call("read", { scope: "self", from, to, days: false });
      for (const k of ["users", "contracts", "absences", "entries", "plan"]) data[k] = data[k].concat(self[k]);
    }
    return { scope, ...pendingView(p, data, meId) };
  },
  "team/decide-days": async (ctx, b) => {
    need(Array.isArray(b.items) && b.items.length > 0 && b.items.length <= 2000, "Aucune journée sélectionnée.");
    return ctx.call("days_decide", { decision: str(b.decision, 20), reason: str(b.reason, 300), items: b.items.map((i) => ({ id: str(i.id, 40), ...(i.version != null ? { version: +i.version } : {}) })) });
  },
  "team/decide-absence": async (ctx, b) => {
    const args = { id: str(b.id, 40), decision: str(b.decision, 20), reason: str(b.reason, 500) };
    if (b.version != null) args.version = +b.version;
    return ctx.call("absence_decide", args);
  },
  "team/month": async (ctx, b) => {
    need(isMonth(b.month), "Mois invalide.");
    const scope = b.scope === "all" ? "all" : "team";
    const { extFrom, extTo } = monthRange(b.month);
    const data = await ctx.call("read", { scope, from: extFrom, to: extTo, ctx: true });
    return { scope, ...teamMonthView(data, b.month) };
  },
  "team/employee": async (ctx, b) => {
    need(isMonth(b.month), "Mois invalide.");
    const { extFrom, extTo } = monthRange(b.month);
    const y = b.month.slice(0, 4);
    const from = extFrom < `${y}-01-01` ? extFrom : `${y}-01-01`, to = extTo > `${y}-12-31` ? extTo : `${y}-12-31`;
    const { data, b: who, c, types } = await readOne(ctx, str(b.user_id, 40), from, to);
    const view = monthView(who, { types, settings: c.settings, closed: c.closed, today: data.today, hm: data.hm, month: b.month });
    const bal = balances({ user: who.user, contracts: who.contracts, entries: who.entries, absences: who.absences, plan: who.plan, types, settings: c.settings, year: +y, today: data.today });
    const { from: mFrom, to: mTo } = monthRange(b.month);
    return {
      ...view, user: employeeRow(who.user, who.contracts, data.today), balances: bal,
      absences: who.absences.filter((a) => a.start_date <= mTo && a.end_date >= mFrom).map((a) => absOut(a, types)),
      can_rh: c.user.role !== "salarie",
    };
  },
  "team/code": async (ctx, b) => {
    const code = newCode();
    const r = await ctx.call("activation_new", { user_id: str(b.user_id, 40), code_hash: codeHash(code) });
    return { code, expires: r.expires, login: r.user.login, name: r.user.name };
  },

  // ------------------------------------------------------------------ planning (responsable, RH)
  // Grille d'une ou plusieurs semaines : ce qui est prévu pour chacun, jour par jour, avec les absences et les jours fériés.
  "plan/grid": async (ctx, b) => {
    const scope = b.scope === "all" ? "all" : "team";
    const t = parisToday(ctx);
    const from = mondayOf(isYmd(b.from) ? b.from : t), weeks = [1, 2, 4].includes(+b.weeks) ? +b.weeks : 1;
    const to = addDays(from, weeks * 7 - 1);
    const [data, lib] = await Promise.all([ctx.call("read", { scope, from, to, days: false, ctx: true }), ctx.call("planning_lib")]);
    return { scope, ...planGridView(data, { from, to, lib }) };
  },
  "plan/set": async (ctx, b) => {
    need(Array.isArray(b.items) && b.items.length > 0 && b.items.length <= 3000, "Sélectionnez au moins un jour.");
    const items = b.items.map((i) => {
      need(i && isYmd(i.day), "Jour invalide.", "date");
      const o = { user_id: str(i.user_id, 40), day: i.day };
      if (i.clear) return { ...o, clear: true };
      if (i.model_code) return { ...o, model_code: str(i.model_code, 12).toUpperCase(), note: str(i.note, 200) };
      const minutes = Math.round(Number(i.minutes));
      need(Number.isFinite(minutes) && minutes >= 0 && minutes <= 960, "Durée invalide : entre 0 et 16 heures.", "horaire");
      return { ...o, minutes, ranges: Array.isArray(i.ranges) ? i.ranges.slice(0, 4).map((r) => (Array.isArray(r) ? [str(r[0], 5), str(r[1], 5)] : [])) : [], label: str(i.label, 60), note: str(i.note, 200) };
    });
    return ctx.call("plan_set", { items });
  },
  // Bibliothèque : horaires journaliers et cycles.
  "plan/lib": async (ctx) => libView(await ctx.call("planning_lib")),
  "plan/model-save": async (ctx, b) => {
    const m = b.model && typeof b.model === "object" ? b.model : {};
    const model = { code: str(m.code, 12).toUpperCase(), label: str(m.label, 60), minutes: Math.round(Number(m.minutes)), color: str(m.color, 12),
      ranges: Array.isArray(m.ranges) ? m.ranges.slice(0, 4).map((r) => (Array.isArray(r) ? [str(r[0], 5), str(r[1], 5)] : [])) : [] };
    need(Number.isFinite(model.minutes), "Durée illisible.", "horaire");
    if (typeof m.active === "boolean") model.active = m.active;
    if (m.sort != null && Number.isFinite(Number(m.sort))) model.sort = Math.round(Number(m.sort));
    return ctx.call("model_save", { model, create: !!b.create, ...(b.version != null ? { version: +b.version } : {}) });
  },
  "plan/cycle-save": async (ctx, b) => {
    const c = b.cycle && typeof b.cycle === "object" ? b.cycle : {};
    need(Array.isArray(c.weeks) && c.weeks.length >= 1 && c.weeks.length <= 12, "Un cycle compte entre 1 et 12 semaines.", "horaire");
    const cycle = { name: str(c.name, 60), weeks: c.weeks.map((w) => (Array.isArray(w) ? w.slice(0, 7).map((x) => (x ? str(x, 12).toUpperCase() : null)) : [])) };
    if (c.id) cycle.id = str(c.id, 40);
    if (typeof c.active === "boolean") cycle.active = c.active;
    return ctx.call("cycle_save", { cycle, ...(b.version != null ? { version: +b.version } : {}) });
  },

  // ------------------------------------------------------------------ RH
  "rh/employees": async (ctx) => {
    const t = parisToday(ctx);
    const data = await ctx.call("read", { scope: "all", from: t, to: t, days: false, ctx: true });
    const all = bundle(data), year = +data.today.slice(0, 4), service = data.ctx.settings.go_live || "";
    return {
      today: data.today, employees: [...all.values()].map((b) => employeeRow(b.user, b.contracts, data.today)),
      // l'outil tournait déjà l'an dernier et aucun report de congés n'a encore été passé cette année
      rollover_due: !!service && +service.slice(0, 4) < year && !data.entries.some((e) => e.kind === "cp" && e.year === year && e.tag === "report") ? year - 1 : null,
    };
  },
  "rh/employee": async (ctx, b) => {
    const id = str(b.id, 40);
    const u = await ctx.call("user_get", { id });
    const y = +u.today.slice(0, 4);
    const [{ data, b: who, c, types }, lib] = await Promise.all([readOne(ctx, id, `${y}-01-01`, `${y}-12-31`, { days: false }), ctx.call("planning_lib")]);
    return {
      user: u.user, contracts: u.contracts, entries: u.entries, today: u.today, year: y,
      balances: balances({ user: who.user, contracts: who.contracts, entries: who.entries, absences: who.absences, plan: who.plan, types, settings: c.settings, year: y, today: data.today }),
      is_admin: c.user.role === "admin", closed: c.closed, go_live: c.settings.go_live || "", cycles: libView(lib).cycles,
    };
  },
  "rh/employee-save": async (ctx, b) => {
    const args = {
      login: str(b.login, 64).toLowerCase(), first_name: str(b.first_name, 80), last_name: str(b.last_name, 80), matricule: str(b.matricule, 30),
      email: str(b.email, 120), team: str(b.team, 80), job: str(b.job, 100), manager_id: b.manager_id ? str(b.manager_id, 40) : "",
      entry_date: b.entry_date && isYmd(b.entry_date) ? b.entry_date : "", exit_date: b.exit_date && isYmd(b.exit_date) ? b.exit_date : "",
      details: b.details && typeof b.details === "object" && !Array.isArray(b.details) ? b.details : {},
    };
    if (b.role) args.role = str(b.role, 10);
    // début de suivi : transmis seulement quand le champ est envoyé (vide = le suivi commence à la mise en service)
    if (b.tracked_from !== undefined) args.tracked_from = b.tracked_from && isYmd(b.tracked_from) ? b.tracked_from : "";
    if (b.id) {
      args.id = str(b.id, 40);
      // la fiche détaillée n'est remplacée que si elle est envoyée : sinon on garde celle en place
      if (b.details === undefined) args.details = (await ctx.call("user_get", { id: args.id })).user.details || {};
      if (b.version != null) args.version = +b.version;
      if (typeof b.disabled === "boolean") args.disabled = b.disabled;
      return ctx.call("user_save", args);
    }
    const code = newCode();
    args.contract = contractIn(b); args.code_hash = codeHash(code);
    const r = await ctx.call("user_save", args);
    return { ...r, code };
  },
  "rh/contract": async (ctx, b) => {
    need(isYmd(b.start_date), "Date d'effet invalide.", "horaire");
    return ctx.call("contract_set", { user_id: str(b.user_id, 40), start_date: b.start_date, contract: contractIn(b) });
  },
  "rh/balance": async (ctx, b) => ctx.call("balance_add", { user_id: str(b.user_id, 40), kind: str(b.kind, 5), year: Math.round(Number(b.year)), amount: Number(b.amount), reason: str(b.reason, 200) }),
  "rh/import-template": async () => ({ filename: "modele-import-salaries.csv", text: "﻿" + [TEMPLATE_HEADER, ...TEMPLATE_ROWS].map((r) => r.join(";")).join("\r\n") + "\r\n" }),
  "rh/import-preview": async (ctx, b) => {
    need(typeof b.text === "string" && b.text.length > 0 && b.text.length < 2_000_000, "Fichier vide ou trop volumineux.", "import");
    const t = parisToday(ctx);
    const [data, lib] = await Promise.all([ctx.call("read", { scope: "all", from: t, to: t, days: false }), ctx.call("planning_lib")]);
    const p = prepareImport(b.text, data.users.map((u) => ({ login: u.login, matricule: u.matricule })), lib.cycles);
    return {
      errors: p.errors, unknown_columns: p.unknown, columns: p.columns,
      rows: p.rows.map((r) => ({ line: r.line, login: r.login, name: `${r.first_name} ${r.last_name}`.trim(), matricule: r.matricule, team: r.team, manager_login: r.manager_login,
        entry_date: r.entry_date, tracked_from: r.tracked_from, regime: r.contract.regime, weekly_minutes: r.contract.day_minutes.reduce((s, m) => s + m, 0),
        cycle: r.cycle, presence: r.contract.presence || "pointage", cp: r.cp, rtt: r.rtt, exists: r.exists, errors: r.errors })),
      create: p.rows.filter((r) => !r.exists && !r.errors.length).length, update: p.rows.filter((r) => r.exists && !r.errors.length).length,
      invalid: p.rows.filter((r) => r.errors.length).length,
    };
  },
  "rh/import": async (ctx, b) => {
    need(typeof b.text === "string" && b.text.length > 0 && b.text.length < 2_000_000, "Fichier vide ou trop volumineux.", "import");
    const t = parisToday(ctx);
    const [data, lib] = await Promise.all([ctx.call("read", { scope: "all", from: t, to: t, days: false, ctx: true }), ctx.call("planning_lib")]);
    const p = prepareImport(b.text, data.users.map((u) => ({ login: u.login, matricule: u.matricule })), lib.cycles);
    need(!p.errors.length, p.errors[0], "import");
    const invalid = p.rows.filter((r) => r.errors.length);
    need(!invalid.length, `Ligne ${invalid[0]?.line} : ${invalid[0]?.errors[0]}. Corrigez le fichier puis recommencez.`, "import");
    need(p.rows.length > 0, "Aucune ligne à importer.", "import");
    const codes = new Map();
    const rows = p.rows.map((r) => {
      const row = { ...r }; delete row.errors; delete row.exists; delete row.line; delete row.cycle;
      if (!r.exists) { const code = newCode(); codes.set(r.login, code); row.code_hash = codeHash(code); }
      return row;
    });
    const r = await ctx.call("users_import", { rows });
    const names = new Map(p.rows.map((x) => [x.login, `${x.first_name} ${x.last_name}`.trim()]));
    const expires = new Date(Date.parse(data.ctx.now) + (data.ctx.settings.activation_days || 14) * 864e5).toISOString();
    return { created: r.created.map((login) => ({ login, name: names.get(login) || login, code: codes.get(login) || "", expires })), updated: r.updated };
  },
  "rh/closures": async (ctx) => {
    const [list, c] = await Promise.all([ctx.call("closures"), ctx.call("ctx")]);
    const months = [];
    const first = monthOf(c.settings.go_live || c.today), last = addMonths(monthOf(c.today), -1);
    for (let m = last; m >= first && months.length < 36; m = addMonths(m, -1)) {
      const versions = list.filter((x) => x.month === m);
      months.push({ month: m, closed: c.closed.includes(m), versions });
    }
    return { today: c.today, months, current: monthOf(c.today) };
  },
  "rh/closure-check": async (ctx, b) => {
    need(isMonth(b.month), "Mois invalide.");
    const [check, { snapshot }] = await Promise.all([ctx.call("month_check", { month: b.month }), closureData(ctx, b.month)]);
    return {
      ...check, totals: snapshot.totals,
      empty: snapshot.employees.filter((e) => e.empty_days.length).map((e) => ({ name: e.name, days: e.empty_days })).slice(0, 200),
      no_matricule: snapshot.employees.filter((e) => !e.matricule).map((e) => e.name).slice(0, 200),
    };
  },
  "rh/close": async (ctx, b) => {
    need(isMonth(b.month), "Mois invalide.");
    const { data, snapshot, text } = await closureData(ctx, b.month);
    return ctx.call("month_close", { month: b.month, fingerprint: data.fingerprint, snapshot, export_text: text, export_sha256: sha256(text) });
  },
  "rh/reopen": async (ctx, b) => ctx.call("month_reopen", { month: str(b.month, 7), reason: str(b.reason, 300) }),
  "rh/export": async (ctx, b) => {
    need(isMonth(b.month), "Mois invalide.");
    // mois clôturé : c'est toujours le fichier figé qui est servi, jamais un nouveau calcul
    let version = b.version;
    if (version == null) version = (await ctx.call("closures")).find((x) => x.month === b.month && x.status === "cloture")?.version;
    if (version != null) {
      const c = await ctx.call("closure_get", { month: b.month, version: +version, download: true });
      return { draft: false, filename: `paie-${b.month}-v${c.version}.csv`, text: c.export_text, sha256: c.export_sha256, version: c.version };
    }
    const { text } = await closureData(ctx, b.month);
    return { draft: true, filename: `BROUILLON-paie-${b.month}.csv`, text, sha256: sha256(text) };
  },
  "rh/closure-detail": async (ctx, b) => {
    const c = await ctx.call("closure_get", { month: str(b.month, 7), version: +b.version });
    return { month: c.month, version: c.version, status: c.status, closed_at: c.closed_at, snapshot: c.snapshot, sha256: c.export_sha256 };
  },
  "rh/journal": async (ctx, b) => ctx.call("journal", { before: b.before ? String(b.before) : "", limit: 60, action: str(b.action, 60), q: str(b.q, 80), user_id: b.user_id ? str(b.user_id, 40) : "" }),
  "rh/journal-verify": async (ctx, b) => ctx.call("journal_verify", { after: b.after ? String(b.after) : "", limit: 4000 }),
  "rh/rollover-preview": async (ctx, b) => {
    const year = Math.round(Number(b.year));
    need(year >= 2000 && year <= 2100, "Année invalide.");
    const data = await ctx.call("read", { scope: "all", from: `${year}-01-01`, to: `${year + 1}-12-31`, days: false, ctx: true });
    const types = typeMap(data.ctx.types);
    const rows = [];
    for (const x of bundle(data).values()) {
      if (x.user.disabled || !x.contracts.length || (x.user.exit_date && x.user.exit_date <= `${year}-12-31`)) continue;
      const amount = yearEndCp({ user: x.user, contracts: x.contracts, entries: x.entries, absences: x.absences, plan: x.plan, types, settings: data.ctx.settings, year });
      rows.push({ user_id: x.user.id, name: x.user.name, team: x.user.team, amount, done: x.entries.some((e) => e.kind === "cp" && e.year === year + 1 && e.tag === "report") });
    }
    return { year, rows, year_ended: data.today > `${year}-12-31` };
  },
  // Écritures de solde par fichier : aperçu d'abord (apply absent), puis enregistrement en une fois.
  "rh/balances-import": async (ctx, b) => {
    if (b.template) return { filename: "modele-ecritures-de-solde.csv", text: "\ufeff" + [BALANCES_HEADER, ["camille.martin", "", "rtt", String(new Date().getFullYear()), "10", "Droits RTT de l'année"], ["", "0015", "cp", String(new Date().getFullYear()), "-1", "Régularisation"]].map((r) => r.join(";")).join("\r\n") + "\r\n" };
    need(typeof b.text === "string" && b.text.length > 0 && b.text.length < 1_000_000, "Fichier vide ou trop volumineux.", "import");
    const t = parisToday(ctx);
    const data = await ctx.call("read", { scope: "all", from: t, to: t, days: false });
    const p = prepareBalances(b.text, data.users, +data.today.slice(0, 4));
    const invalid = p.rows.filter((r) => r.errors.length).length;
    if (!b.apply) return { errors: p.errors, rows: p.rows.slice(0, 3000), valid: p.rows.length - invalid, invalid };
    need(!p.errors.length, p.errors[0], "import");
    need(p.rows.length > 0 && p.rows.length <= 3000, "Entre 1 et 3 000 lignes par fichier.", "import");
    need(!invalid, `Ligne ${p.rows.find((r) => r.errors.length)?.line} : ${p.rows.find((r) => r.errors.length)?.errors[0]}. Corrigez le fichier puis recommencez.`, "import");
    return ctx.call("balance_bulk", { label: str(b.label, 80) || "Écritures par fichier", items: p.rows.map((r) => ({ user_id: r.user_id, kind: r.kind, year: r.year, amount: r.amount, reason: r.reason, tag: "" })) });
  },
  "rh/rollover": async (ctx, b) => {
    const year = Math.round(Number(b.year));
    const pre = await ROUTES["rh/rollover-preview"](ctx, { year });
    const items = pre.rows.filter((r) => !r.done && r.amount !== 0).map((r) => ({ user_id: r.user_id, kind: "cp", year: year + 1, amount: r.amount, reason: `Report du solde ${year}`, tag: "report" }));
    if (!items.length) return { created: 0, skipped: pre.rows.length };
    return ctx.call("balance_bulk", { items, label: `Report ${year} → ${year + 1}` });
  },

  // ------------------------------------------------------------------ administration
  "admin/settings": async (ctx) => {
    const c = await ctx.call("ctx");
    need(c.user.role === "admin", "Accès réservé aux administrateurs.", "interdit");
    return { settings: c.settings, types: c.types };
  },
  "admin/settings-save": async (ctx, b) => ctx.call("settings_set", { settings: b.settings && typeof b.settings === "object" ? b.settings : {}, ...(b.version != null ? { version: +b.version } : {}) }),
  "admin/type-save": async (ctx, b) => ctx.call("type_save", { type: b.type && typeof b.type === "object" ? b.type : {} }),
  "admin/status": async (ctx) => ({ ...(await ctx.call("status")), app: APP_VERSION, schema_expected: SCHEMA_EXPECTED }),
  "admin/selftest": async (ctx) => ctx.call("selftest"),

  // ------------------------------------------------------------------ mode démonstration
  // Charge le jeu de données fictives dans un outil vide, puis clôture le premier mois comme le feraient les RH.
  "admin/demo-load": async (ctx) => {
    const c = await ctx.call("ctx");
    need(c.user.role === "admin", "Accès réservé aux administrateurs.", "interdit");
    need(Number(c.schema) >= SCHEMA_EXPECTED, "La base de données doit d'abord être mise à jour : rejouez le script d'installation.", "installation");
    const d = buildDemo(c.today), codes = new Map();
    const users = d.users.map(({ profil, cp, rtt, ...u }) => { const code = newCode(); codes.set(u.login, code); return { ...u, code_hash: codeHash(code) }; });
    const r = await ctx.call("demo_seed", { go_live: d.go_live, users, days: d.days, absences: d.absences, entries: d.entries, models: d.models, cycles: d.cycles });
    let closed = null;
    try {
      const { data, snapshot, text } = await closureData(ctx, d.close_month);
      await ctx.call("month_close", { month: d.close_month, fingerprint: data.fingerprint, snapshot, export_text: text, export_sha256: sha256(text) });
      closed = d.close_month;
    } catch (e) { console.error("kokolio démonstration : clôture du premier mois impossible", e?.message); } // la démonstration reste utilisable sans mois clôturé
    const expires = new Date(Date.parse(c.now) + (c.settings.activation_days || 14) * 864e5).toISOString();
    return { ...r, closed, go_live: d.go_live,
      accounts: d.users.map((u) => ({ login: u.login, name: `${u.first_name} ${u.last_name}`, profil: u.profil, code: codes.get(u.login), expires })) };
  },
  "admin/demo-reset": async (ctx, b) => {
    need(str(b.confirm, 20) === "EFFACER", "Pour confirmer, saisissez le mot EFFACER.", "confirmation");
    return ctx.call("demo_reset");
  },
};
