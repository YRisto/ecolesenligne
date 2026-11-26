// Tests d'intégration de l'API : un scénario complet (septembre → clôture → année suivante) joué contre une vraie base PostgreSQL locale.
// Lancement : node --test tests/kokolio/api.test.mjs   (PostgreSQL 16 requis, voir pg-local.sh)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "..");
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "postgres", "-d", "kokolio_test", "-v", "ON_ERROR_STOP=1", "-qAt"];
const sql = (q) => execFileSync("psql", [...PG, "-c", q], { encoding: "utf8" }).trim();
const PORT = 54399;
let handle, fake, clock = null;

// Horloge de test : heure de Paris → instant UTC.
function at(day, hm) {
  for (const off of ["+02:00", "+01:00"]) {
    const iso = `${day}T${hm}:00${off}`;
    const wall = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
    if (wall === `${day} ${hm}`) { clock = new Date(iso).toISOString(); return; }
  }
  throw new Error("heure inexistante " + day + " " + hm);
}

class Client {
  constructor(name, ip = "10.0.0.1") { this.name = name; this.ip = ip; this.cookie = ""; }
  async call(route, body = {}, opt = {}) {
    const headers = { "content-type": "application/json", "x-forwarded-host": "kokolio.test", "x-forwarded-proto": "https", origin: "https://kokolio.test",
      "x-kokolio": "1", "x-real-ip": this.ip, "user-agent": "test/" + this.name, ...(opt.headers || {}) };
    if (this.cookie) headers.cookie = this.cookie;
    if (clock) headers["x-kk-test-now"] = clock;
    for (const k of opt.drop || []) delete headers[k];
    const res = await handle(new Request("https://kokolio.test/api/kokolio/" + route, { method: opt.method || "POST", headers, body: opt.method === "GET" ? undefined : JSON.stringify(body) }), route);
    for (const c of res.headers.getSetCookie()) {
      const m = c.match(/^kk_session=([^;]*)/);
      if (m) { this.cookie = m[1] ? `kk_session=${m[1]}` : ""; this.lastSetCookie = c; }
    }
    return { status: res.status, ...(await res.json()) };
  }
  async ok(route, body) { const r = await this.call(route, body); assert.equal(r.ok, true, `${this.name} ${route} → ${r.status} ${r.code} ${r.message}`); return r.data; }
  async fail(route, body, code, status) {
    const r = await this.call(route, body);
    assert.equal(r.ok, false, `${this.name} ${route} aurait dû être refusé`);
    if (code) assert.equal(r.code, code, `${this.name} ${route} → ${r.code} : ${r.message}`);
    if (status) assert.equal(r.status, status, `${this.name} ${route} → HTTP ${r.status}`);
    return r;
  }
}

const admin = new Client("admin"), sophie = new Client("sophie"), julien = new Client("julien"), camille = new Client("camille"), leo = new Client("leo"), nadia = new Client("nadia");
const PW = { admin: "Tableau-Bleu-2026", sophie: "Girafe!Verte42", julien: "Cactus#Mauve77", camille: "Bateau-Rouge-19", leo: "Lampe+Orange58", nadia: "Nuage=Violet63" };
const ids = {}, codes = {};
const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n").toString("base64");

before(async () => {
  execFileSync("bash", [path.join(HERE, "pg-local.sh"), "reset"], { stdio: "ignore" });
  execFileSync("psql", [...PG, "-f", path.join(ROOT, "supabase/kokolio/install.sql")], { stdio: "ignore" });
  sql("insert into kokolio.meta (key, value) values ('test_mode', 'true'::jsonb) on conflict (key) do update set value = excluded.value");
  fake = spawn("node", [path.join(HERE, "fake-postgrest.mjs")], { env: { ...process.env, FAKE_PGRST_PORT: String(PORT) }, stdio: ["ignore", "pipe", "inherit"] });
  await new Promise((resolve) => fake.stdout.once("data", resolve));
  process.env.SUPABASE_URL = `http://127.0.0.1:${PORT}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  process.env.KOKOLIO_TEST_HOOKS = "1";
  ({ handle } = await import(path.join(ROOT, "lib/kokolio/server/handle.mjs")));
});
after(() => { fake?.kill(); });

test("santé, et refus des requêtes forgées", async () => {
  const h = await admin.call("health", {}, { method: "GET" });
  assert.equal(h.ok, true); assert.equal(h.schema, 7);
  assert.equal((await admin.call("boot", {}, { drop: ["x-kokolio"] })).status, 403);
  assert.equal((await admin.call("boot", {}, { headers: { origin: "https://pirate.example" } })).status, 403);
  await admin.fail("boot", {}, "session", 401);
  await admin.fail("inconnu", {}, "introuvable", 404);
  const info = await admin.ok("public/info");
  assert.equal(info.company, "Centre Européen de Formation");
});

test("la clé publique ne donne accès à rien", async () => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = "anon";
  const h = await admin.call("health", {}, { method: "GET" });
  assert.equal(h.ok, false); assert.equal(h.status, 503);
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
});

test("activation de l'administrateur et réglages", async () => {
  at("2026-09-01", "07:30");
  const code = sql("select kokolio.bootstrap_admin('admin')");
  assert.match(code, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  await admin.fail("auth/activate", { login: "admin", code, password: "court" }, "mot_de_passe");
  await admin.fail("auth/activate", { login: "admin", code, password: "admin-admin-2026" }, "mot_de_passe");
  await admin.fail("auth/activate", { login: "admin", code: "AAAA-AAAA-AAAA", password: PW.admin }, "identifiants", 401);
  await admin.ok("auth/activate", { login: "admin", code: code.toLowerCase().replace(/-/g, " "), password: PW.admin });
  assert.match(admin.lastSetCookie, /HttpOnly; SameSite=Strict; Max-Age=7776000; Secure/);
  assert.match(admin.lastSetCookie, /Path=\/api\/kokolio/);
  await new Client("x").fail("auth/activate", { login: "admin", code, password: PW.admin }, "identifiants"); // code à usage unique
  const boot = await admin.ok("boot");
  assert.equal(boot.me.role, "admin"); assert.equal(boot.today, "2026-09-01");
  assert.deepEqual([boot.me.tracked, boot.me.self_validate], [false, false]); // compte technique : pas d'horaire, rien à pointer ni à valider pour lui-même
  const s = await admin.ok("admin/settings");
  const saved = await admin.ok("admin/settings-save", { settings: { go_live: "2026-09-01" }, version: s.settings.version });
  assert.equal(saved.settings.go_live, "2026-09-01");
  await admin.fail("admin/settings-save", { settings: { company: "X" }, version: s.settings.version }, "conflit", 409);
  await admin.fail("admin/settings-save", { settings: { logo_url: "http://pas-https.example/logo.png" } }, "parametre");
  await admin.ok("admin/settings-save", { settings: { logo_url: "https://www.centre-europeen-formation.fr/wp-content/uploads/2025/08/Logo_CEF.png", max_day_min: 600 } });
  await admin.fail("admin/settings-save", { settings: { lieux: [] } }, "parametre");
  await admin.fail("admin/settings-save", { settings: { export: { sep: "|" } } }, "parametre");
  await admin.ok("admin/settings-save", { settings: { export: { hours_code: "HS-HN", include_hours: true, sep: ";", decimal: ",", header: true } } });
});

test("import des salariés : aperçu, erreurs, création, codes", async () => {
  const head = "identifiant;nom;prenom;matricule;email;equipe;poste;responsable;date_entree;regime;heures_hebdo;jours_travailles;pause;solde_cp;droits_rtt;role";
  const rows = [
    "sophie.durand;Durand;Sophie;0001;;RH;Responsable RH;;01/03/2019;forfait;;lun-ven;;12;10;rh",
    "julien.bernard;Bernard;Julien;0004;;Admissions;Responsable des admissions;;15/01/2020;forfait;;lun-ven;;8,5;10;",
    "camille.martin;Martin;Camille;0012;camille@exemple.fr;Admissions;Conseillère;julien.bernard;01/09/2023;horaire;35;lun-ven;45;6;0;",
    "leo.petit;Petit;Léo;0015;;Admissions;Conseiller;julien.bernard;01/02/2024;horaire;28;lun-jeu;45;4;0;",
    "nadia.roux;Roux;Nadia;0020;;Pédagogie;Formatrice;sophie.durand;01/06/2022;horaire;35;lun-ven;60;10;0;",
  ];
  const bad = await admin.ok("rh/import-preview", { text: [head, "x;;Sans Nom;0012;;;;inconnu;32/13/2020;horaire;90;;;;;", rows[2], rows[2]].join("\n") });
  assert.equal(bad.invalid, 3);
  assert.ok(bad.rows[0].errors.length >= 4);
  await admin.fail("rh/import", { text: [head, rows[2].replace("julien.bernard", "personne")].join("\n") }, "import");
  const text = [head, ...rows].join("\r\n");
  const pre = await admin.ok("rh/import-preview", { text });
  assert.deepEqual([pre.create, pre.update, pre.invalid], [5, 0, 0]);
  assert.equal(pre.rows[3].weekly_minutes, 28 * 60);
  const done = await admin.ok("rh/import", { text });
  assert.equal(done.created.length, 5);
  for (const c of done.created) { codes[c.login] = c.code; assert.match(c.code, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/); }
  const again = await admin.ok("rh/import-preview", { text });
  assert.deepEqual([again.create, again.update], [0, 5]);
  const list = await admin.ok("rh/employees");
  assert.equal(list.employees.length, 6);
  for (const e of list.employees) ids[e.login] = e.id;
  const leoRow = list.employees.find((e) => e.login === "leo.petit");
  assert.equal(leoRow.weekly_minutes, 1680); assert.equal(leoRow.manager_name, "Julien Bernard"); assert.equal(leoRow.activated, false); assert.equal(leoRow.code_pending, true);
  assert.equal(list.employees.find((e) => e.login === "sophie.durand").role, "rh");
  const tpl = await admin.ok("rh/import-template");
  assert.ok(tpl.text.includes("identifiant;nom;prenom"));
});

test("activation des comptes, connexion, verrouillage", async () => {
  at("2026-09-01", "08:00");
  for (const [c, login] of [[sophie, "sophie.durand"], [julien, "julien.bernard"], [camille, "camille.martin"], [leo, "leo.petit"], [nadia, "nadia.roux"]]) {
    await c.ok("auth/activate", { login, code: codes[login], password: PW[c.name] });
  }
  const b = await camille.ok("boot");
  assert.equal(b.me.name, "Camille Martin"); assert.equal(b.me.is_manager, false); assert.equal(b.me.regime, "horaire"); assert.equal(b.me.weekly_minutes, 2100);
  assert.equal((await julien.ok("boot")).me.is_manager, true);
  assert.equal((await julien.ok("boot")).me.regime, "forfait_jours");
  // même réponse pour un compte inconnu et pour un mauvais mot de passe
  const intruder = new Client("intrus", "10.9.9.9");
  const r1 = await intruder.fail("auth/login", { login: "personne", password: "Nimporte-Quoi-99" }, "identifiants", 401);
  const r2 = await intruder.fail("auth/login", { login: "camille.martin", password: "Nimporte-Quoi-99" }, "identifiants", 401);
  assert.equal(r1.message, r2.message);
  for (let i = 0; i < 3; i++) await intruder.fail("auth/login", { login: "camille.martin", password: "Faux-Mot-De-Passe-" + i }, "identifiants");
  await intruder.fail("auth/login", { login: "camille.martin", password: "Faux-Mot-De-Passe-9" }, "compte_bloque", 429);
  await intruder.fail("auth/login", { login: "camille.martin", password: PW.camille }, "compte_bloque", 429); // même le bon mot de passe attend
  at("2026-09-01", "08:20");
  const phone = new Client("camille-mobile", "10.0.0.7");
  await phone.ok("auth/login", { login: "Camille.Martin ", password: PW.camille });
  assert.equal((await phone.ok("account/sessions")).sessions.length, 2);
  await phone.ok("auth/logout");
  await phone.fail("boot", {}, "session", 401);
});

test("cloisonnement : chacun ne voit que ce que son rôle autorise", async () => {
  await camille.fail("rh/employees", {}, "interdit", 403);
  await camille.fail("rh/employee", { id: ids["leo.petit"] }, "interdit", 403);
  await camille.fail("my/year", { year: 2026, user_id: ids["leo.petit"] }, "interdit", 403);
  await camille.fail("my/fiche", { user_id: ids["julien.bernard"] }, "interdit", 403);
  await camille.fail("team/month", { month: "2026-09", scope: "all" }, "interdit", 403);
  await camille.fail("team/pending", { scope: "all" }, "interdit", 403);
  await camille.fail("rh/journal", {}, "interdit", 403);
  await camille.fail("rh/closures", {}, "interdit", 403);
  await camille.fail("rh/export", { month: "2026-09" }, "interdit", 403);
  await camille.fail("rh/import", { text: "nom\nX" }, "interdit", 403);
  await camille.fail("rh/balance", { user_id: ids["camille.martin"], kind: "cp", year: 2026, amount: 30, reason: "cadeau" }, "interdit", 403);
  await camille.fail("rh/employee-save", { id: ids["camille.martin"], login: "camille.martin", last_name: "Martin", role: "admin" }, "interdit", 403);
  await camille.fail("admin/settings", {}, "interdit", 403);
  await camille.fail("admin/status", {}, "interdit", 403);
  await camille.fail("admin/selftest", {}, "interdit", 403);
  await camille.fail("team/code", { user_id: ids["leo.petit"] }, "interdit", 403);
  assert.equal((await camille.ok("team/month", { month: "2026-09" })).rows.length, 0); // pas d'équipe : liste vide
  // le responsable voit son équipe, pas les autres, et sans les données personnelles
  const team = await julien.ok("team/month", { month: "2026-09" });
  assert.deepEqual(team.rows.map((r) => r.name), ["Camille Martin", "Léo Petit"]);
  await julien.fail("team/employee", { user_id: ids["nadia.roux"], month: "2026-09" }, "interdit", 403);
  await julien.fail("my/year", { year: 2026, user_id: ids["nadia.roux"] }, "interdit", 403);
  await julien.fail("rh/employees", {}, "interdit", 403);
  const fiche = await julien.ok("my/fiche", { user_id: ids["camille.martin"] });
  assert.equal(fiche.user.email, undefined); assert.equal(fiche.user.details, undefined);
  assert.equal((await camille.ok("my/fiche")).user.email, "camille@exemple.fr");
  // les RH ne distribuent pas les rôles et ne touchent pas aux comptes administrateur
  await sophie.fail("rh/employee-save", { id: ids["camille.martin"], login: "camille.martin", last_name: "Martin", first_name: "Camille", role: "rh" }, "interdit", 403);
  await sophie.fail("rh/employee-save", { id: ids.admin, login: "admin", last_name: "Autre" }, "interdit", 403);
  await sophie.fail("team/code", { user_id: ids.admin }, "interdit", 403);
  await sophie.fail("admin/settings-save", { settings: { company: "X" } }, "interdit", 403);
  await sophie.fail("admin/type-save", { type: { code: "cp", label: "Congé" } }, "interdit", 403);
  // codes d'activation : le responsable direct oui, un autre non
  const c = await julien.ok("team/code", { user_id: ids["leo.petit"] });
  assert.equal(c.login, "leo.petit");
  await julien.fail("team/code", { user_id: ids["nadia.roux"] }, "interdit", 403);
  await leo.ok("boot"); // un nouveau code ne coupe pas la session en cours
});

test("pointage à l'heure du serveur", async () => {
  at("2026-09-01", "08:58");
  let t = await camille.ok("my/today");
  assert.equal(t.day, null); assert.equal(t.theo, 420); assert.equal(t.today, "2026-09-01");
  t = await camille.ok("my/punch", { lieu: "bureau" });
  assert.deepEqual([t.punched.kind, t.punched.hm, t.open_since], ["arrivee", "08:58", "08:58"]);
  t = await camille.ok("my/punch", {});
  assert.equal(t.punched.duplicate, true); assert.equal(t.day.times.length, 1);
  at("2026-09-01", "12:30"); t = await camille.ok("my/punch"); assert.equal(t.punched.kind, "depart");
  at("2026-09-01", "13:15"); await camille.ok("my/punch");
  at("2026-09-01", "17:45"); t = await camille.ok("my/punch");
  assert.deepEqual(t.day.times, ["08:58", "12:30", "13:15", "17:45"]);
  assert.equal(t.worked, 482); assert.equal(t.day.ecart, 62); assert.equal(t.pause, 0);
  assert.deepEqual([t.week.worked, t.month_sum.worked, t.month_sum.days_worked], [482, 482, 1]);
  await camille.fail("my/lieu", { day: "2026-09-01", lieu: "plage" }, "requete");
  await camille.ok("my/lieu", { day: "2026-09-01", lieu: "teletravail" });
  const log = await camille.ok("punch-log", { day: "2026-09-01" });
  assert.deepEqual(log.punches.map((p) => p.kind), ["arrivee", "depart", "arrivee", "depart"]);
  await leo.fail("punch-log", { day: "2026-09-01", user_id: ids["camille.martin"] }, "interdit", 403);
  assert.equal((await julien.ok("punch-log", { day: "2026-09-01", user_id: ids["camille.martin"] })).punches.length, 4);
  // forfait jours : la journée compte, pas les heures
  at("2026-09-01", "09:10"); await julien.ok("my/punch");
  at("2026-09-01", "18:40"); t = await julien.ok("my/punch");
  assert.equal(t.regime, "forfait_jours"); assert.equal(t.forfait.days, 1); assert.equal(t.forfait.target, 218); assert.equal(t.day.ecart, 0);
});

test("oubli de départ, correction, alertes légales", async () => {
  at("2026-09-02", "09:00"); await camille.ok("my/punch");
  at("2026-09-03", "08:00");
  let t = await camille.ok("my/punch");
  assert.deepEqual(t.anomalies.map((a) => [a.date, a.kind]), [["2026-09-02", "depart"]]);
  await camille.fail("my/correct", { day: "2026-09-02", times: ["09:00", "17:00"], comment: "" }, "motif");
  await camille.fail("my/correct", { day: "2026-09-02", times: ["17:00", "09:00"], comment: "oubli" }, "heures");
  await camille.fail("my/correct", { day: "2026-09-02", times: ["09:00"], comment: "oubli" }, "heures");
  await camille.fail("my/correct", { day: "2026-09-09", times: ["09:00", "17:00"], comment: "en avance" }, "date");
  await camille.fail("my/correct", { day: "2026-09-02", times: ["09:00", "17:00"], comment: "oubli", user_id: ids["leo.petit"] }, "interdit", 403);
  const fixed = await camille.ok("my/correct", { day: "2026-09-02", times: ["09:00", "17:00"], comment: "Départ non pointé" });
  assert.equal(fixed.day.corrected, true); assert.equal(fixed.day.status, "a_valider");
  at("2026-09-03", "19:30"); await camille.ok("my/punch");
  at("2026-09-04", "06:00"); await camille.ok("my/punch");
  at("2026-09-04", "14:00"); await camille.ok("my/punch");
  at("2026-09-05", "10:00");
  const m = await camille.ok("my/month", { month: "2026-09" });
  const byDay = Object.fromEntries(m.days.map((d) => [d.date, d]));
  assert.equal(byDay["2026-09-02"].worked, 435); assert.equal(byDay["2026-09-02"].pause, 45);   // 8 h − pause de 45 min
  assert.equal(byDay["2026-09-03"].worked, 645);                                                // 11 h 30 − 45 min
  assert.deepEqual(m.alerts.map((a) => [a.date, a.kind]), [["2026-09-03", "jour"], ["2026-09-04", "repos"]]);
  assert.equal(m.summary.worked, 482 + 435 + 645 + 480 - 45);
  assert.equal(m.summary.theo, 4 * 420); assert.equal(m.summary.pending, 4); assert.equal(m.anomalies.length, 0);
  // Léo (lundi → jeudi, 7 h) n'a rien pointé : trois jours à régulariser, vendredi n'en est pas un
  const lm = await leo.ok("my/month", { month: "2026-09" });
  assert.deepEqual(lm.anomalies.map((a) => a.date), ["2026-09-01", "2026-09-02", "2026-09-03"]);
  assert.equal(lm.summary.theo, 3 * 420); assert.equal(lm.summary.ecart, -3 * 420);
  for (const d of ["2026-09-01", "2026-09-02", "2026-09-03"]) await leo.ok("my/correct", { day: d, times: ["09:00", "12:30", "13:30", "17:00"], comment: "Badge oublié cette semaine" });
  assert.equal((await leo.ok("my/month", { month: "2026-09" })).anomalies.length, 0);
});

test("validation par le responsable : une à une, en lot, refus, réouverture", async () => {
  const p = await julien.ok("team/pending");
  assert.deepEqual(p.groups.map((g) => [g.name, g.days.length, g.ready]), [["Camille Martin", 4, 4], ["Léo Petit", 3, 3]]);
  assert.equal(p.total_days, 7);
  const cam = p.groups[0], lp = p.groups[1];
  assert.ok(cam.days.find((d) => d.date === "2026-09-03").alerts.length === 1);
  // personne ne valide ses propres journées, ni celles d'une autre équipe
  let r = await camille.ok("team/decide-days", { decision: "valide", items: [{ id: cam.days[0].id }] });
  assert.equal(r.failed[0].code, "interdit");
  r = await leo.ok("team/decide-days", { decision: "valide", items: [{ id: cam.days[0].id }] });
  assert.equal(r.failed[0].code, "interdit");
  r = await julien.ok("team/decide-days", { decision: "valide", items: [{ id: cam.days[0].id, version: cam.days[0].version }] });
  assert.equal(r.done.length, 1);
  r = await julien.ok("team/decide-days", { decision: "valide", items: cam.days.slice(1).map((d) => ({ id: d.id, version: d.version })) });
  assert.equal(r.done.length, 3);
  await julien.fail("team/decide-days", { decision: "refuse", items: [{ id: lp.days[0].id }] }, "motif");
  r = await julien.ok("team/decide-days", { decision: "refuse", reason: "Vous étiez en réunion extérieure le matin", items: [{ id: lp.days[0].id }] });
  assert.equal(r.done.length, 1);
  r = await julien.ok("team/decide-days", { decision: "valide", items: [{ id: lp.days[1].id, version: 99 }, { id: lp.days[2].id }] }); // une journée périmée ne bloque pas les autres
  assert.deepEqual([r.done.length, r.failed.length, r.failed[0].code], [1, 1, "conflit"]);
  const lm = await leo.ok("my/month", { month: "2026-09" });
  const refused = lm.days.find((d) => d.date === "2026-09-01");
  assert.equal(refused.status, "refuse"); assert.match(refused.refusal_reason, /réunion/);
  await leo.ok("my/correct", { day: "2026-09-01", times: ["13:30", "17:00"], comment: "Matin en réunion extérieure, non pointé", version: refused.version });
  // journée validée : verrouillée pour le salarié, rouvrable par le responsable avec un motif
  await camille.fail("my/correct", { day: "2026-09-01", times: ["09:00", "17:00"], comment: "je préfère" }, "verrou", 409);
  await camille.fail("my/lieu", { day: "2026-09-01", lieu: "bureau" }, "verrou", 409);
  r = await julien.ok("team/decide-days", { decision: "a_valider", reason: "Erreur de validation", items: [{ id: cam.days[0].id }] });
  assert.equal(r.done.length, 1);
  await camille.ok("my/correct", { day: "2026-09-01", times: ["08:58", "12:30", "13:15", "17:45"], lieu: "bureau", comment: "Lieu corrigé" });
  const left = await julien.ok("team/pending");
  assert.equal(left.total_days, 3);
  await julien.ok("team/decide-days", { decision: "valide", items: left.groups.flatMap((g) => g.days.map((d) => ({ id: d.id }))) });
  assert.equal((await julien.ok("team/pending")).total_days, 0);
  // journée en cours : pas validable avant le lendemain
  at("2026-09-07", "09:00"); await camille.ok("my/punch");
  const cur = await julien.ok("team/pending");
  assert.equal(cur.groups[0].days[0].state, "en_cours");
  r = await julien.ok("team/decide-days", { decision: "valide", items: [{ id: cur.groups[0].days[0].id }] });
  assert.equal(r.failed[0].code, "etat");
  at("2026-09-07", "17:00"); await camille.ok("my/punch");
});

test("congés et absences : demande, soldes, décision, justificatif", async () => {
  at("2026-09-08", "09:30");
  let pre = await camille.ok("my/absence-preview", { type: "cp", start: "2026-09-14", end: "2026-09-18" });
  assert.deepEqual([pre.days, pre.warnings.length], [5, 0]);
  pre = await camille.ok("my/absence-preview", { type: "cp", start: "2026-09-14", end: "2026-09-25" });
  assert.equal(pre.days, 10); assert.match(pre.warnings[0], /dépasse le solde/);
  pre = await leo.ok("my/absence-preview", { type: "cp", start: "2026-09-10", end: "2026-09-14" }); // jeudi, (vendredi non travaillé), lundi
  assert.equal(pre.days, 2);
  await camille.fail("my/absence-request", { type: "cp", start: "2026-09-12", end: "2026-09-13" }, "date"); // week-end
  await camille.fail("my/absence-request", { type: "vacances", start: "2026-09-14", end: "2026-09-18" }, "requete");
  const req = await camille.ok("my/absence-request", { type: "cp", start: "2026-09-14", end: "2026-09-18", comment: "Vacances" });
  assert.equal(req.absence.status, "en_attente"); assert.equal(Number(req.absence.days_count), 5);
  await camille.fail("my/absence-request", { type: "rtt", start: "2026-09-18", end: "2026-09-18" }, "conflit", 409);
  let mine = await camille.ok("my/absences");
  assert.deepEqual([mine.balances.cp.entries, mine.balances.cp.accrued, mine.balances.cp.taken, mine.balances.cp.waiting, mine.balances.cp.balance, mine.balances.cp.available], [6, 0, 0, 5, 6, 1]);
  const leoReq = await leo.ok("my/absence-request", { type: "cp", start: "2026-09-14", end: "2026-09-15" });
  // le responsable voit le solde et qui d'autre est absent
  const p = await julien.ok("team/pending");
  const a1 = p.absences.find((a) => a.name === "Camille Martin");
  assert.deepEqual(a1.balance, { kind: "CP", value: 6 });
  assert.deepEqual(a1.overlaps.map((o) => [o.name, o.pending]), [["Léo Petit", true]]);
  await leo.fail("team/decide-absence", { id: req.absence.id, decision: "valide" }, "interdit", 403);
  await camille.fail("team/decide-absence", { id: req.absence.id, decision: "valide" }, "interdit", 403);
  await julien.fail("team/decide-absence", { id: leoReq.absence.id, decision: "refuse" }, "motif");
  await julien.ok("team/decide-absence", { id: req.absence.id, decision: "valide", version: a1.version });
  await julien.ok("team/decide-absence", { id: leoReq.absence.id, decision: "refuse", reason: "Camille est déjà absente cette semaine-là" });
  await julien.fail("team/decide-absence", { id: leoReq.absence.id, decision: "valide" }, "etat", 409);
  mine = await camille.ok("my/absences");
  assert.deepEqual([mine.balances.cp.taken, mine.balances.cp.balance, mine.absences[0].status], [5, 1, "valide"]);
  const lv = await leo.ok("my/absences");
  assert.equal(lv.absences[0].status, "refuse"); assert.match(lv.absences[0].refusal_reason, /Camille/);
  // demi-journée, annulation par le salarié
  const half = await leo.ok("my/absence-request", { type: "evenement", start: "2026-09-16", end: "2026-09-16", half: "matin" });
  assert.equal(Number(half.absence.days_count), 0.5);
  await leo.ok("my/absence-cancel", { id: half.absence.id });
  await leo.fail("my/absence-cancel", { id: half.absence.id }, "etat", 409);
  await camille.fail("my/absence-cancel", { id: leoReq.absence.id }, "introuvable", 404);
  const half2 = await leo.ok("my/absence-request", { type: "evenement", start: "2026-09-16", end: "2026-09-16", half: "apres_midi" });
  await julien.ok("team/decide-absence", { id: half2.absence.id, decision: "valide" });
  // arrêt maladie saisi par les RH avec justificatif : validé d'office, accès restreint au document
  await sophie.fail("my/absence-request", { type: "maladie", start: "2026-09-08", end: "2026-09-11", user_id: ids["nadia.roux"], doc: { name: "virus.exe", data: Buffer.from("MZ\u0090\u0000binaire").toString("base64") } }, "justificatif");
  const sick = await sophie.ok("my/absence-request", { type: "maladie", start: "2026-09-08", end: "2026-09-11", user_id: ids["nadia.roux"], doc: { name: "arret.pdf", data: PDF } });
  assert.deepEqual([sick.absence.status, sick.absence.has_doc, Number(sick.absence.days_count)], ["valide", true, 4]);
  await julien.fail("my/absence-request", { type: "maladie", start: "2026-09-21", end: "2026-09-21", user_id: ids["camille.martin"] }, "interdit", 403); // un responsable ne saisit pas à la place
  const doc = await nadia.ok("doc", { id: sick.absence.id });
  assert.equal(doc.mime, "application/pdf"); assert.equal(doc.data, PDF);
  await sophie.ok("doc", { id: sick.absence.id });
  await julien.fail("doc", { id: sick.absence.id }, "introuvable", 404);
  await camille.fail("doc", { id: sick.absence.id }, "introuvable", 404);
  const j = await sophie.ok("rh/journal", { action: "justificatif_consulte" });
  assert.equal(j.rows.length, 1); assert.match(j.rows[0].actor_label, /Sophie Durand/);
  // dépôt après coup par la salariée
  const late = await nadia.ok("my/absence-request", { type: "autre", start: "2026-09-21", end: "2026-09-21", comment: "Rendez-vous" });
  await nadia.ok("my/absence-doc", { id: late.absence.id, doc: { name: "convocation.png", data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]).toString("base64") } });
  await sophie.ok("team/decide-absence", { id: late.absence.id, decision: "valide" });
  // annulation d'une absence validée par le responsable, avec motif
  await julien.fail("team/decide-absence", { id: half2.absence.id, decision: "annule" }, "motif");
  await julien.ok("team/decide-absence", { id: half2.absence.id, decision: "annule", reason: "Finalement présent" });
});

test("vue annuelle et synthèse d'équipe", async () => {
  at("2026-09-21", "10:00");
  const y = await camille.ok("my/year", { year: 2026 });
  const sept = y.months[8].cells;
  const code = (d) => sept[d - 1].code;
  assert.deepEqual([code(1), code(5), code(8), code(14), code(18), code(21), code(22)], ["T", "", "!", "CP", "CP", "", ""]);
  assert.equal(y.totals.CP, 5);
  assert.equal(y.months[10].cells[10].code, "F"); // 11 novembre
  assert.equal(y.months[7].cells[30].off, true);  // août : avant la mise en service
  const ny = await julien.ok("my/year", { year: 2026, user_id: ids["camille.martin"] });
  assert.equal(ny.user.name, "Camille Martin");
  const nv = await nadia.ok("my/year", { year: 2026 });
  assert.deepEqual([nv.months[8].cells[7].code, nv.months[8].cells[20].code], ["AM", "AB"]);
  const s = await sophie.ok("team/month", { month: "2026-09", scope: "all" });
  assert.equal(s.rows.length, 5); // le compte administrateur, sans horaire, n'est pas attendu au pointage
  const row = Object.fromEntries(s.rows.map((r) => [r.name, r]));
  assert.equal(row["Camille Martin"].abs_days, 5); assert.equal(row["Nadia Roux"].abs_days, 5);
  assert.equal(row["Nadia Roux"].abs_unplanned, 5);
  assert.ok(s.tiles.absenteeism > 0);
  const emp = await julien.ok("team/employee", { user_id: ids["camille.martin"], month: "2026-09" });
  assert.equal(emp.user.name, "Camille Martin"); assert.equal(emp.balances.cp.balance, 1); assert.equal(emp.absences.length, 1);
});

test("fiche salarié, horaire daté, soldes (RH)", async () => {
  const f = await sophie.ok("rh/employee", { id: ids["leo.petit"] });
  assert.equal(f.contracts.length, 1); assert.equal(f.balances.cp.entries, 4);
  await sophie.fail("rh/employee-save", { id: ids["leo.petit"], login: "camille.martin", last_name: "Petit" }, "identifiant");
  await sophie.fail("rh/employee-save", { id: ids["leo.petit"], login: "leo.petit", last_name: "Petit", matricule: "0012" }, "matricule");
  await sophie.fail("rh/employee-save", { id: ids["julien.bernard"], login: "julien.bernard", last_name: "Bernard", manager_id: ids["camille.martin"] }, "responsable"); // boucle
  const saved = await sophie.ok("rh/employee-save", { id: ids["leo.petit"], login: "leo.petit", first_name: "Léo", last_name: "Petit", matricule: "0015", team: "Admissions", job: "Conseiller senior",
    manager_id: ids["julien.bernard"], entry_date: "2024-02-01", details: { telephone: "06 00 00 00 00" }, version: f.user.version });
  assert.equal(saved.user.job, "Conseiller senior");
  await sophie.fail("rh/employee-save", { id: ids["leo.petit"], login: "leo.petit", last_name: "Petit", version: f.user.version }, "conflit", 409);
  // sans « details » dans l'envoi, la fiche détaillée est conservée
  const kept = await sophie.ok("rh/employee-save", { id: ids["leo.petit"], login: "leo.petit", first_name: "Léo", last_name: "Petit", matricule: "0015", team: "Admissions", job: "Conseiller senior", manager_id: ids["julien.bernard"], entry_date: "2024-02-01" });
  assert.equal(kept.user.details.telephone, "06 00 00 00 00");
  // passage à 35 h au 1er octobre : septembre garde ses 7 h sur quatre jours
  const before = (await leo.ok("my/month", { month: "2026-09" })).summary.theo;
  await sophie.ok("rh/contract", { user_id: ids["leo.petit"], start_date: "2026-10-01", contract: { regime: "horaire", day_minutes: [420, 420, 420, 420, 420, 0, 0], pause_minutes: 45, cp_per_month: 2.08 } });
  assert.equal((await leo.ok("my/month", { month: "2026-09" })).summary.theo, before);
  const f2 = await sophie.ok("rh/employee", { id: ids["leo.petit"] });
  assert.deepEqual(f2.contracts.map((c) => [c.start_date, c.end_date]), [["2024-02-01", "2026-09-30"], ["2026-10-01", null]]);
  await sophie.fail("rh/contract", { user_id: ids["leo.petit"], start_date: "2026-10-01", contract: { regime: "horaire", day_minutes: [0, 0, 0, 0, 0, 0, 0] } }, "horaire");
  await sophie.fail("rh/balance", { user_id: ids["leo.petit"], kind: "cp", year: 2026, amount: 2, reason: "" }, "motif");
  await sophie.ok("rh/balance", { user_id: ids["leo.petit"], kind: "cp", year: 2026, amount: 2, reason: "Jours de fractionnement" });
  assert.equal((await leo.ok("my/absences")).balances.cp.entries, 6);
  // écritures par fichier : aperçu, erreurs, puis enregistrement en une fois
  const lot = "identifiant;matricule;compteur;annee;jours;motif\ncamille.martin;;rtt;2026;3;Droits RTT de l'année\n;0020;cp;2026;-0,5;Régularisation\n";
  await camille.fail("rh/balances-import", { text: lot }, "interdit", 403);
  const vu = await sophie.ok("rh/balances-import", { text: lot + "inconnu;;rtt;2026;abc;x\n" });
  assert.deepEqual([vu.valid, vu.invalid, vu.rows[2].errors.length], [2, 1, 3]);
  await sophie.fail("rh/balances-import", { text: lot + "inconnu;;rtt;2026;1;Test\n", apply: true }, "import");
  assert.equal((await sophie.ok("rh/balances-import", { text: lot, apply: true })).created, 2);
  assert.equal((await camille.ok("my/absences")).balances.rtt.rights, 3);
  assert.equal((await nadia.ok("my/absences")).balances.cp.entries, 9.5);
  assert.ok((await sophie.ok("rh/balances-import", { template: true })).text.includes("identifiant;matricule;compteur"));
  // création d'une fiche à la main : le code d'activation est renvoyé une seule fois
  const created = await sophie.ok("rh/employee-save", { login: "ines.morel", first_name: "Inès", last_name: "Morel", matricule: "0031", team: "Pédagogie", manager_id: ids["sophie.durand"], entry_date: "2026-09-21",
    contract: { regime: "horaire", day_minutes: [420, 420, 420, 420, 420, 0, 0], pause_minutes: 45 } });
  assert.match(created.code, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  ids["ines.morel"] = created.user.id;
  // l'administrateur attribue un rôle ; le dernier administrateur ne peut pas être rétrogradé
  await admin.fail("rh/employee-save", { id: ids.admin, login: "admin", last_name: "Administrateur", role: "salarie" }, "interdit", 403);
  await admin.fail("rh/employee-save", { id: ids.admin, login: "admin", last_name: "Administrateur", disabled: true }, "interdit", 403);
});

test("clôture mensuelle : blocage, figement, export, réouverture", async () => {
  at("2026-09-30", "18:00");
  await sophie.fail("rh/close", { month: "2026-09" }, "etat", 409); // mois non terminé
  at("2026-10-02", "10:00");
  const list = await sophie.ok("rh/closures");
  assert.deepEqual(list.months.map((m) => [m.month, m.closed]), [["2026-09", false]]);
  let chk = await sophie.ok("rh/closure-check", { month: "2026-09" });
  assert.equal(chk.ended, true); assert.ok(chk.pending_days > 0); assert.equal(chk.pending_absences, 0);
  assert.ok(chk.totals.empty_days > 0);
  await sophie.fail("rh/close", { month: "2026-09" }, "bloque", 409);
  const draft = await sophie.ok("rh/export", { month: "2026-09" });
  assert.equal(draft.draft, true); assert.match(draft.filename, /^BROUILLON/);
  // les RH valident ce qui reste, salarié par salarié
  const all = await sophie.ok("team/pending", { scope: "all" });
  assert.ok(all.summary.length >= 2); assert.equal(all.groups.length, 0);
  for (const s of all.summary) {
    const one = await sophie.ok("team/pending", { scope: "all", user_id: s.user_id });
    const r = await sophie.ok("team/decide-days", { decision: "valide", items: one.groups[0].days.map((d) => ({ id: d.id })) });
    assert.equal(r.failed.length, 0, JSON.stringify(r.failed));
  }
  chk = await sophie.ok("rh/closure-check", { month: "2026-09" });
  assert.equal(chk.pending_days, 0);
  await julien.fail("rh/close", { month: "2026-09" }, "interdit", 403);
  const closed = await sophie.ok("rh/close", { month: "2026-09" });
  assert.equal(closed.version, 1);
  await sophie.fail("rh/close", { month: "2026-09" }, "etat", 409);
  const exp = await sophie.ok("rh/export", { month: "2026-09", version: 1 });
  const lines = exp.text.trim().split("\r\n");
  assert.equal(lines[0], "Matricule;Code;Valeur;Date début;Date fin");
  assert.ok(lines.includes("0012;AB-CP;5;14/09/2026;18/09/2026"), exp.text);
  assert.ok(lines.includes("0020;AB-MAL;4;08/09/2026;11/09/2026"), exp.text);
  assert.ok(lines.includes("0020;AB-ABS;1;21/09/2026;21/09/2026"), exp.text);
  const hours = lines.find((l) => l.startsWith("0012;HS-HN;"));
  assert.equal(hours, `0012;HS-HN;${String(Math.round(((482 + 435 + 645 + 435 + 435) / 60) * 100) / 100).replace(".", ",")};01/09/2026;30/09/2026`);
  assert.equal(exp.sha256.length, 64);
  // mois figé : ni l'outil, ni une requête directe sur la base ne modifient septembre
  await camille.fail("my/correct", { day: "2026-09-10", times: ["09:00", "17:00"], comment: "oubli" }, "cloture", 409);
  await camille.fail("my/absence-request", { type: "cp", start: "2026-09-29", end: "2026-10-01" }, "cloture", 409);
  await sophie.fail("my/correct", { day: "2026-09-10", times: ["09:00", "17:00"], comment: "oubli", user_id: ids["camille.martin"] }, "cloture", 409);
  await sophie.fail("rh/contract", { user_id: ids["camille.martin"], start_date: "2026-09-15", contract: { regime: "horaire", day_minutes: [480, 480, 480, 480, 0, 0, 0] } }, "cloture", 409);
  assert.throws(() => sql("update kokolio.days set times = '{08:00,20:00}' where day = '2026-09-01'"), /clôturé/);
  assert.throws(() => sql("delete from kokolio.absences where start_date = '2026-09-14'"), /clôturé/);
  assert.throws(() => sql("update kokolio.audit set action = 'rien' where seq = 1"), /ajout seul/);
  assert.throws(() => sql("delete from kokolio.balance_entries"), /ajout seul/);
  // le justificatif tardif reste possible : il ne change aucun chiffre
  const na = (await nadia.ok("my/absences")).absences.find((a) => a.type_code === "maladie");
  await nadia.ok("my/absence-doc", { id: na.id, doc: { name: "arret-v2.pdf", data: PDF } });
  // réouverture motivée, nouvelle version, l'ancienne reste consultable à l'identique
  await sophie.fail("rh/reopen", { month: "2026-09", reason: "" }, "motif");
  await sophie.ok("rh/reopen", { month: "2026-09", reason: "Oubli d'une journée de Camille" });
  await camille.ok("my/correct", { day: "2026-09-10", times: ["09:00", "17:00"], comment: "Journée oubliée" });
  await sophie.fail("rh/close", { month: "2026-09" }, "bloque", 409);
  const one = await sophie.ok("team/pending", { scope: "all", user_id: ids["camille.martin"] });
  await sophie.ok("team/decide-days", { decision: "valide", items: one.groups[0].days.map((d) => ({ id: d.id })) });
  assert.equal((await sophie.ok("rh/close", { month: "2026-09" })).version, 2);
  const v1 = await sophie.ok("rh/export", { month: "2026-09", version: 1 });
  const v2 = await sophie.ok("rh/export", { month: "2026-09", version: 2 });
  assert.equal(v1.text, exp.text); assert.notEqual(v2.text, v1.text);
  const courant = await sophie.ok("rh/export", { month: "2026-09" }); // sans version sur un mois clôturé : le fichier figé, pas un recalcul
  assert.deepEqual([courant.draft, courant.version, courant.text], [false, 2, v2.text]);
  const after = await sophie.ok("rh/closures");
  assert.deepEqual(after.months[0].versions.map((v) => [v.version, v.status]), [[2, "cloture"], [1, "rouvert"]]);
  const detail = await sophie.ok("rh/closure-detail", { month: "2026-09", version: 1 });
  assert.equal(detail.snapshot.employees.find((e) => e.matricule === "0012").worked, 482 + 435 + 645 + 435 + 435);
  // acquisition : septembre terminé rapporte 2,08 jours
  const b = (await camille.ok("my/absences")).balances.cp;
  assert.deepEqual([b.entries, b.accrued, b.taken, b.balance], [6, 2.08, 5, 3.08]);
});

test("journal non modifiable : la moindre retouche se voit", async () => {
  const j = await sophie.ok("rh/journal", {});
  assert.ok(j.total > 40); assert.equal(j.rows.length, 60 > j.total ? j.total : 60);
  assert.ok(j.actions.includes("mois_cloture") && j.actions.includes("correction") && j.actions.includes("absence_validee"));
  const page2 = await sophie.ok("rh/journal", { before: j.rows[j.rows.length - 1].seq });
  assert.ok(page2.rows.every((r) => r.seq < j.rows[j.rows.length - 1].seq));
  assert.ok((await sophie.ok("rh/journal", { q: "camille" })).rows.length > 3);
  let v = await sophie.ok("rh/journal-verify", {});
  assert.deepEqual([v.ok, v.done, v.checked], [true, true, j.total]);
  // un administrateur de la base désactive le garde-fou et retouche une ligne : la chaîne casse
  sql("alter table kokolio.audit disable trigger audit_append_only; update kokolio.audit set detail = '{\"motif\": \"maquillé\"}' where seq = 12; alter table kokolio.audit enable trigger audit_append_only");
  v = await sophie.ok("rh/journal-verify", {});
  assert.deepEqual([v.ok, v.bad_seq], [false, 12]);
});

test("sorties, mots de passe, sessions", async () => {
  at("2026-10-05", "09:00");
  const f = await sophie.ok("rh/employee", { id: ids["leo.petit"] });
  await sophie.ok("rh/employee-save", { id: ids["leo.petit"], login: "leo.petit", first_name: "Léo", last_name: "Petit", matricule: "0015", team: "Admissions", manager_id: ids["julien.bernard"], entry_date: "2024-02-01", exit_date: "2026-10-09", version: f.user.version });
  await leo.ok("boot");
  at("2026-10-10", "09:00"); // lendemain de la sortie : le compte se ferme tout seul
  await leo.fail("boot", {}, "session", 401);
  await new Client("leo2").fail("auth/login", { login: "leo.petit", password: PW.leo }, "identifiants", 401);
  // désactivation immédiate par les RH
  const fi = await sophie.ok("rh/employee", { id: ids["ines.morel"] });
  await sophie.ok("rh/employee-save", { id: ids["ines.morel"], login: "ines.morel", first_name: "Inès", last_name: "Morel", matricule: "0031", entry_date: "2026-09-21", disabled: true, version: fi.user.version });
  // changement de mot de passe : les autres appareils sont déconnectés
  const tablet = new Client("camille-tablette");
  await tablet.ok("auth/login", { login: "camille.martin", password: PW.camille });
  await camille.fail("account/password", { current: "Pas-Le-Bon-123", password: "Nouveau-Secret-88" }, "mot_de_passe");
  await camille.fail("account/password", { current: PW.camille, password: "camille.martin2026" }, "mot_de_passe");
  await camille.ok("account/password", { current: PW.camille, password: "Nouveau-Secret-88" });
  await tablet.fail("boot", {}, "session", 401);
  await camille.ok("boot");
  await new Client("c3").fail("auth/login", { login: "camille.martin", password: PW.camille }, "identifiants");
  await new Client("c4").ok("auth/login", { login: "camille.martin", password: "Nouveau-Secret-88" });
  // mot de passe oublié : nouveau code par le responsable, l'ancien mot de passe tombe à l'activation
  const c = await julien.ok("team/code", { user_id: ids["camille.martin"] });
  await new Client("c5").ok("auth/activate", { login: "camille.martin", code: c.code, password: "Encore-Un-Autre-55" });
  await camille.fail("boot", {}, "session", 401);
  // un compte RH ne reçoit un nouveau code que d'un administrateur
  await julien.fail("team/code", { user_id: ids["sophie.durand"] }, "interdit", 403);
  assert.match((await admin.ok("team/code", { user_id: ids["sophie.durand"] })).code, /^[A-Z2-9-]{14}$/);
});

test("administration : motifs, état, autodiagnostic", async () => {
  const st = await admin.ok("admin/status");
  assert.equal(st.users, 7); assert.equal(st.closures, 2); assert.ok(st.audit > 50); assert.equal(st.schema, 7);
  await admin.ok("admin/type-save", { type: { code: "paternite", label: "Congé paternité", category: "autre", export_code: "AB-PAT", needs_doc: true, absenteeism: false, sort: 45 } });
  await admin.fail("admin/type-save", { type: { code: "Pas Bon", label: "X" } }, "parametre");
  assert.ok((await nadia.ok("boot")).types.some((t) => t.code === "paternite" && t.needs_doc));
  await admin.ok("admin/type-save", { type: { code: "paternite", label: "Congé paternité", category: "autre", export_code: "AB-PAT", active: false } });
  assert.ok(!(await nadia.ok("boot")).types.some((t) => t.code === "paternite"));
  const t = await admin.ok("admin/selftest");
  assert.equal(t.ok, true, JSON.stringify(t.checks.filter((c) => !c.ok)));
  assert.equal((await admin.ok("admin/status")).users, 7); // l'autodiagnostic ne laisse aucune trace
});

test("report des congés en fin d'année", async () => {
  at("2027-01-04", "09:00");
  await sophie.fail("boot", {}, "session", 401); // trois mois sans activité : la session a expiré d'elle-même
  await sophie.ok("auth/login", { login: "sophie.durand", password: PW.sophie });
  assert.equal((await sophie.ok("rh/employees")).rollover_due, 2026); // en janvier, le report de l'année passée est signalé aux RH…
  const pre = await sophie.ok("rh/rollover-preview", { year: 2026 });
  assert.equal(pre.year_ended, true);
  const cam = pre.rows.find((r) => r.name === "Camille Martin");
  assert.equal(cam.amount, Math.round((6 + 4 * 2.08 - 5) * 100) / 100); assert.equal(cam.done, false);
  assert.ok(!pre.rows.some((r) => r.name === "Léo Petit")); // sorti en octobre
  const avant = new Client("c7"); await avant.ok("auth/login", { login: "camille.martin", password: "Encore-Un-Autre-55" });
  assert.equal((await avant.ok("my/absences")).report_pending, true);                 // … et aux salariés, dont le solde n'est pas encore complet
  const done = await sophie.ok("rh/rollover", { year: 2026 });
  assert.ok(done.created >= 4);
  assert.equal((await sophie.ok("rh/rollover", { year: 2026 })).created, 0); // rejouable sans doublon
  const c5 = new Client("c6");
  await c5.ok("auth/login", { login: "camille.martin", password: "Encore-Un-Autre-55" });
  const mine = await c5.ok("my/absences"), b = mine.balances;
  assert.deepEqual([b.year, b.cp.entries, b.cp.accrued, mine.report_pending], [2027, cam.amount, 0, false]);
  assert.equal((await sophie.ok("rh/employees")).rollover_due, null);
});

test("export de paie au format Sage : réglages, motifs, brouillon, nouvelle clôture, mois déjà clôturé", async () => {
  const { sageParse } = await import(path.join(ROOT, "lib/kokolio/engine/sage.mjs"));
  const base = { hours_code: "HS-HN", include_hours: true, sep: ";", decimal: ",", header: true };
  await admin.ok("auth/login", { login: "admin", password: PW.admin });   // janvier 2027 : la session d'octobre a expiré
  // au départ : colonnes séparées, et septembre clôturé sous cette forme
  const avant = await sophie.ok("rh/export", { month: "2026-09" });
  assert.deepEqual([avant.format, avant.filename, avant.draft], ["csv", "paie-2026-09-v2.csv", false]);
  assert.equal((await sophie.ok("rh/closures")).format, "csv");
  // réglages : réservés à l'administrateur, et refusés quand Sage ne saurait pas les lire
  await sophie.fail("admin/settings-save", { settings: { export: { ...base, format: "sage" } } }, "interdit", 403);
  await admin.fail("admin/settings-save", { settings: { export: { ...base, format: "xml" } } }, "parametre");
  await admin.fail("admin/settings-save", { settings: { export: { ...base, format: "sage", sage: { vm_code: "CODE-TROP-LONG" } } } }, "parametre");
  await admin.fail("admin/settings-save", { settings: { export: { ...base, format: "sage", sage: { label: "été" } } } }, "parametre");
  await admin.fail("admin/settings-save", { settings: { export: { ...base, format: "sage", sage: { vm_source: "autre" } } } }, "parametre");
  await admin.fail("admin/settings-save", { settings: { export: { ...base, format: "sage", sage: "HA16" } } }, "parametre");
  await admin.ok("admin/settings-save", { settings: { export: { ...base, format: "sage", sage: { vm_code: "ha16", vm_source: "manque" } } } });
  let x = (await admin.ok("admin/settings")).settings.export;
  assert.deepEqual([x.format, x.sage.vm_code, x.sage.vm_type, x.sage.vm_source, x.sage.label, x.hours_code], ["sage", "HA16", "255", "manque", "du %DEB au %FIN", "HS-HN"]);
  // un enregistrement qui ne parle ni du format ni de Sage les laisse en place
  await admin.ok("admin/settings-save", { settings: { export: { ...base, decimal: "." } } });
  x = (await admin.ok("admin/settings")).settings.export;
  assert.deepEqual([x.format, x.sage.vm_code, x.sage.vm_source, x.decimal], ["sage", "HA16", "manque", "."]);
  // motifs : code de paie, décompte, report des dates sur le bulletin
  await admin.fail("admin/type-save", { type: { code: "maladie", label: "Arrêt maladie", category: "maladie", export_unit: "heures" } }, "parametre");
  await admin.fail("admin/type-save", { type: { code: "maladie", label: "Arrêt maladie", category: "maladie", export_dates: "oui" } }, "parametre");
  await admin.ok("admin/type-save", { type: { code: "maladie", label: "Arrêt maladie", category: "maladie", export_code: "0960", needs_doc: true, absenteeism: true, sort: 30, export_unit: "calendaires" } });
  await admin.ok("admin/type-save", { type: { code: "cp", label: "Congé payé", category: "cp", export_code: "0950", absenteeism: false, sort: 10 } });   // ni décompte ni report envoyés : ils gardent leur valeur
  await admin.ok("admin/type-save", { type: { code: "anciennete", label: "Congé d'ancienneté", category: "cp", export_code: "0951", absenteeism: false, sort: 15 } });
  const types = Object.fromEntries((await admin.ok("admin/settings")).types.map((t) => [t.code, [t.export_code, t.export_unit, t.export_dates]]));
  assert.deepEqual([types.cp, types.maladie, types.anciennete, types.rtt], [["0950", "prevus", true], ["0960", "calendaires", false], ["0951", "prevus", true], ["AB-RTT", "prevus", false]]);
  const journal = (await admin.ok("rh/journal", { action: "motif_modifie" })).rows.find((r) => r.detail?.export_code);
  assert.deepEqual(journal.detail.export_code, ["AB-CP", "0950"], "le changement de code est inscrit au journal");
  // le mois déjà clôturé garde son fichier, à l'identique
  const apres = await sophie.ok("rh/export", { month: "2026-09" });
  assert.deepEqual([apres.format, apres.filename, apres.text], ["csv", "paie-2026-09-v2.csv", avant.text]);
  // les prochains fichiers sont au format Sage : brouillon d'octobre
  assert.equal((await sophie.ok("rh/closures")).format, "sage");
  const d = await sophie.ok("rh/export", { month: "2026-10" });
  assert.deepEqual([d.draft, d.format, d.filename], [true, "sage", "BROUILLON-Paye_Sage_2026-10.txt"]);
  assert.ok(d.text.endsWith("\r\n")); assert.ok(/^[\x20-\x7e\r\n]+$/.test(d.text), "texte sans accent");
  const lignes = d.text.split("\r\n").slice(0, -1);
  assert.ok(lignes.every((l) => (l.startsWith("EV") && l.length === 235) || (l.startsWith("VB") && l.length === 1347) || (l.startsWith("VM") && l.length === 37)));
  const chk = await sophie.ok("rh/closure-check", { month: "2026-10" });
  assert.equal(chk.format, "sage"); assert.deepEqual(Object.keys(chk.sage).sort(), ["long_code", "long_matricule", "no_code"]);
  assert.equal(lignes.filter((l) => l.startsWith("VB")).length, chk.totals.employees, "une ligne VB par salarié du mois");
  // septembre rouvert puis clôturé de nouveau : la version 3 est au format Sage, les versions 1 et 2 restent en colonnes
  await sophie.ok("rh/reopen", { month: "2026-09", reason: "Essai du format Sage" });
  const bloque = await sophie.ok("rh/closure-check", { month: "2026-09" });
  assert.deepEqual(bloque.sage.long_code, ["Autre absence (AB-ABS)"], "un code de plus de quatre caractères est signalé avant la clôture");
  assert.equal((await sophie.ok("rh/close", { month: "2026-09" })).version, 3);
  const v3 = await sophie.ok("rh/export", { month: "2026-09" });
  assert.deepEqual([v3.draft, v3.format, v3.filename, v3.version], [false, "sage", "Paye_Sage_2026-09-v3.txt", 3]);
  const relu = sageParse(v3.text), par = Object.fromEntries(relu.employees.map((e) => [e.matricule, e]));
  assert.equal(relu.date, "2027-01-04", "le fichier porte le jour où il est produit");
  assert.deepEqual(par["0012"].events, [{ code: "0950", start: "2026-09-14", end: "2026-09-18", quantity: 5, flag: "00" }]);
  assert.deepEqual(par["0012"].ranges, [["2026-09-14", "2026-09-18"]], "les dates du congé payé sont reportées sur le bulletin");
  assert.deepEqual(par["0020"].events.map((e) => [e.code, e.start, e.end, e.quantity]), [["0960", "2026-09-08", "2026-09-11", 4], ["AB-A", "2026-09-21", "2026-09-21", 1]]);
  assert.deepEqual(par["0020"].ranges, []);
  assert.ok(relu.employees.every((e) => e.values.every((v) => v.type === "255" && v.code === "HA16" && v.value > 0)));
  const detail = await sophie.ok("rh/closure-detail", { month: "2026-09", version: 3 });
  assert.equal(detail.snapshot.export_format, "sage");
  const v2 = await sophie.ok("rh/export", { month: "2026-09", version: 2 });
  assert.deepEqual([v2.format, v2.filename, v2.text], ["csv", "paie-2026-09-v2.csv", avant.text]);
});
