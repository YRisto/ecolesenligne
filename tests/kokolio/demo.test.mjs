// Mode démonstration et mise à jour de la base : chargement dans un outil vide, usage, effacement, garde-fous.
// Lancement : node --test tests/kokolio/demo.test.mjs   (un fichier de test à la fois : ils partagent la base locale)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(HERE, "..", "..");
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "postgres", "-d", "kokolio_test", "-v", "ON_ERROR_STOP=1", "-qAt"];
const sql = (q) => execFileSync("psql", [...PG, "-c", q], { encoding: "utf8" }).trim();
const PORT = 54397;
let handle, fake;
const clock = "2026-11-25T09:00:00Z";

class Client {
  constructor(name) { this.name = name; this.cookie = ""; }
  async call(route, body = {}) {
    const headers = { "content-type": "application/json", "x-forwarded-host": "k.test", "x-forwarded-proto": "https", origin: "https://k.test", "x-kokolio": "1", "x-real-ip": "10.0.0.9", "x-kk-test-now": clock };
    if (this.cookie) headers.cookie = this.cookie;
    const res = await handle(new Request("https://k.test/api/kokolio/" + route, { method: "POST", headers, body: JSON.stringify(body) }), route);
    for (const c of res.headers.getSetCookie()) { const m = c.match(/^kk_session=([^;]*)/); if (m) this.cookie = m[1] ? `kk_session=${m[1]}` : ""; }
    return { status: res.status, ...(await res.json()) };
  }
  async ok(route, body) { const r = await this.call(route, body); assert.equal(r.ok, true, `${this.name} ${route} → ${r.status} ${r.code} ${r.message}`); return r.data; }
  async fail(route, body, code) { const r = await this.call(route, body); assert.equal(r.ok, false, `${this.name} ${route} aurait dû être refusé`); if (code) assert.equal(r.code, code, `${route} → ${r.code} : ${r.message}`); return r; }
}
const admin = new Client("admin");
let comptes;

before(async () => {
  execFileSync("bash", [path.join(HERE, "pg-local.sh"), "reset"], { stdio: "ignore" });
  // la base part de la version 1 telle qu'elle a été installée en production, avec un administrateur déjà activé…
  const v1 = execFileSync("git", ["-C", ROOT, "show", "c7d1028:supabase/kokolio/install.sql"], { encoding: "utf8", maxBuffer: 32e6 });
  execFileSync("psql", [...PG, "-f", "-"], { input: v1, stdio: ["pipe", "ignore", "ignore"] });
  sql("insert into kokolio.meta (key, value) values ('test_mode', 'true'::jsonb)");
  fake = spawn("node", [path.join(HERE, "fake-postgrest.mjs")], { env: { ...process.env, FAKE_PGRST_PORT: String(PORT) }, stdio: ["ignore", "pipe", "ignore"] });
  await new Promise((r) => fake.stdout.once("data", r));
  Object.assign(process.env, { SUPABASE_URL: `http://127.0.0.1:${PORT}`, SUPABASE_SERVICE_ROLE_KEY: "test-service-key", KOKOLIO_TEST_HOOKS: "1" });
  ({ handle } = await import(path.join(ROOT, "lib/kokolio/server/handle.mjs")));
});
after(() => fake?.kill());

test("mise à jour de la base de la version 1 à la version 5, sans rien perdre", async () => {
  const code = sql("select kokolio.bootstrap_admin('admin')");
  await admin.ok("auth/activate", { login: "admin", code, password: "Tableau-Bleu-2026" });
  await admin.ok("admin/settings-save", { settings: { company: "Entreprise d'essai" } });
  assert.equal((await admin.ok("admin/status")).schema, 1);
  await admin.fail("admin/demo-load", {}, "installation");              // l'application est en avance sur la base : message clair, rien de cassé
  // un salarié créé avec la toute première version de la base, pour vérifier que sa fiche et son horaire traversent les mises à jour
  const essai = await admin.ok("rh/employee-save", { login: "essai.un", first_name: "Essai", last_name: "Un", entry_date: "2026-01-01", contract: { regime: "horaire", day_minutes: [450, 450, 450, 450, 300, 0, 0], pause_minutes: 30 } });
  const horaire = () => sql(`select regime || '|' || day_minutes::text || '|' || work_days::text || '|' || pause_minutes || '|' || start_date from kokolio.contracts where user_id = '${essai.user.id}'`);
  const horaireAvant = horaire();
  assert.equal(horaireAvant, "horaire|{450,450,450,450,300,0,0}|{1,2,3,4,5}|30|2026-01-01");
  // empreinte des comptes et du journal (hors colonne ajoutée par la version 3) : elle ne doit pas bouger d'une version à l'autre
  const empreinte = () => sql("select md5(string_agg((to_jsonb(u) - 'tracked_from')::text, ',' order by u.id)) || (select count(*) from kokolio.audit) from kokolio.users u");
  const avant = empreinte();
  // … d'abord la version 2, telle qu'elle a été jouée en production
  const v2 = execFileSync("git", ["-C", ROOT, "show", "cdff09b:supabase/kokolio/install.sql"], { encoding: "utf8", maxBuffer: 32e6 });
  execFileSync("psql", [...PG, "-f", "-"], { input: v2, stdio: ["pipe", "ignore", "ignore"] });
  assert.equal(empreinte(), avant);
  assert.equal((await admin.ok("admin/status")).schema, 2);
  await admin.fail("admin/demo-load", {}, "installation");              // encore une version de retard : toujours refusé, toujours rien de cassé
  // … puis la version 3, celle de la production avant la planification
  const v3 = execFileSync("git", ["-C", ROOT, "show", "f3c2400:supabase/kokolio/install.sql"], { encoding: "utf8", maxBuffer: 32e6 });
  execFileSync("psql", [...PG, "-f", "-"], { input: v3, stdio: ["pipe", "ignore", "ignore"] });
  assert.equal(empreinte(), avant);
  assert.equal((await admin.ok("admin/status")).schema, 3);
  await admin.fail("admin/demo-load", {}, "installation");
  // … la version 4 (planification), avec un cycle et un motif réglés à la main pour vérifier qu'ils traversent la suite
  const v4 = execFileSync("git", ["-C", ROOT, "show", "c36584d:supabase/kokolio/install.sql"], { encoding: "utf8", maxBuffer: 32e6 });
  execFileSync("psql", [...PG, "-f", "-"], { input: v4, stdio: ["pipe", "ignore", "ignore"] });
  assert.equal(empreinte(), avant);
  assert.equal(sql("select value::text from kokolio.meta where key = 'schema_version'"), "4");
  sql("insert into kokolio.day_models (code, label, minutes) values ('V4', 'Horaire créé en version 4', 400); insert into kokolio.cycles (name, weeks) values ('Cycle créé en version 4', '[[\"V4\",null,null,null,null,null,null]]')");
  // … enfin la version courante, jouée deux fois de suite : le script est rejouable
  for (let i = 0; i < 2; i++) execFileSync("psql", [...PG, "-f", path.join(ROOT, "supabase/kokolio/install.sql")], { stdio: "ignore" });
  // le cycle d'avant n'est pas annualisé, les motifs prennent l'effet par défaut, aucune période n'existe
  assert.equal(sql("select name || '|' || annualise || '|' || weeks::text from kokolio.cycles"), 'Cycle créé en version 4|false|[["V4", null, null, null, null, null, null]]');
  assert.equal(sql("select string_agg(distinct annual, ',') || '|' || count(*) from kokolio.absence_types"), "retire|7");
  assert.equal(sql("select count(*) from kokolio.annual_periods"), "0");
  sql("delete from kokolio.cycles; delete from kokolio.day_models");
  assert.equal(empreinte(), avant);
  assert.equal(sql("select count(*) from kokolio.users where tracked_from is not null"), "0");
  const st = await admin.ok("admin/status");                             // la session ouverte avant la mise à jour reste valable
  assert.deepEqual([st.schema, st.schema_expected, st.users, st.admins], [5, 5, 2, 1]);
  assert.equal((await admin.ok("admin/settings")).settings.company, "Entreprise d'essai");
  // l'horaire d'avant est intact ; les nouveautés arrivent à leur valeur neutre : pas de cycle, présence par pointage, bibliothèque vide, nuit désactivée
  assert.equal(horaire(), horaireAvant);
  assert.equal(sql(`select presence || '|' || (cycle_id is null) || '|' || (cycle_anchor is null) from kokolio.contracts where user_id = '${essai.user.id}'`), "pointage|true|true");
  const f = await admin.ok("rh/employee", { id: essai.user.id });
  assert.deepEqual([f.contracts[0].presence, f.contracts[0].cycle_id, f.cycles.length, f.user.first_name], ["pointage", null, 0, "Essai"]);
  const lib = await admin.ok("plan/lib");
  assert.deepEqual([lib.models.length, lib.cycles.length], [0, 0]);
  assert.deepEqual([(await admin.ok("boot")).settings.night_until, (await admin.ok("boot")).annual], ["", null]);
  const t = await admin.ok("admin/selftest");
  assert.equal(t.ok, true, JSON.stringify(t.checks.filter((c) => !c.ok))); assert.equal(t.count, 42);
  // la fiche d'essai n'a servi qu'à cette vérification : la suite repart d'un outil qui ne contient que l'administrateur
  sql(`delete from kokolio.contracts where user_id = '${essai.user.id}'; delete from kokolio.users where id = '${essai.user.id}'`);
});

test("chargement des données de démonstration", async () => {
  assert.equal((await admin.ok("boot")).demo, false);
  await admin.fail("admin/demo-reset", { confirm: "EFFACER" }, "etat"); // rien à effacer hors mode démonstration
  const r = await admin.ok("admin/demo-load");
  comptes = Object.fromEntries(r.accounts.map((a) => [a.login, a]));
  assert.deepEqual([r.users, r.accounts.length, r.closed, r.go_live], [6, 6, "2026-09", "2026-09-01"]);
  assert.ok(r.days > 300 && r.absences >= 10);
  for (const a of r.accounts) assert.match(a.code, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal((await admin.ok("boot")).demo, true);
  assert.equal((await new Client("visiteur").ok("public/info")).demo, true);
  await admin.fail("admin/demo-load", {}, "etat");                      // pas deux fois
  const list = await admin.ok("rh/employees");
  assert.equal(list.employees.length, 7);
  assert.equal(list.employees.find((e) => e.login === "sophie.leroy").role, "rh");
  assert.equal(list.employees.find((e) => e.login === "camille.martin").manager_name, "Julien Bernard");
  const cl = await admin.ok("rh/closures");
  assert.deepEqual(cl.months.map((m) => [m.month, m.closed]), [["2026-10", false], ["2026-09", true]]);
  const chk = await admin.ok("rh/closure-check", { month: "2026-10" });
  assert.deepEqual([chk.pending_days, chk.pending_absences], [0, 0]);  // octobre est prêt à être clôturé devant le public
  const exp = await admin.ok("rh/export", { month: "2026-09" });
  assert.ok(exp.text.includes("0012;AB-MAL;2;15/09/2026;16/09/2026") && exp.text.includes("0002;AB-CP;3;16/09/2026;18/09/2026"), exp.text);
  const p = await admin.ok("team/pending", { scope: "all" });
  assert.ok(p.total_days >= 25 && p.absences.length === 3);
  assert.equal((await admin.ok("rh/journal-verify", {})).ok, true);
  assert.equal(sql("select count(*) from kokolio.punch_log") > "0", true);
  // bibliothèque d'exemple : quatre horaires, trois cycles ; les salariés à 35 h et à 28 h suivent un cycle
  const lib = await admin.ok("plan/lib");
  assert.deepEqual(lib.models.map((m) => m.code), ["J7", "J8", "M4", "S7"]);
  assert.deepEqual(lib.cycles.map((c) => [c.name, c.assigned, c.weekly_minutes]),
    [["Alternance 4 jours / 5 jours (36 h en moyenne)", 0, 2160], ["Semaine 35 h", 2, 2100], ["Temps partiel 28 h (lundi à jeudi)", 1, 1680]]);
  assert.deepEqual(["camille.martin", "ines.roux", "julien.bernard"].map((l) => list.employees.find((e) => e.login === l).cycle), ["Semaine 35 h", "Temps partiel 28 h (lundi à jeudi)", ""]);
  // annualisation d'exemple : l'année en cours depuis la mise en service fictive ; les salariés du cycle « Semaine 35 h » sont annualisés
  const an = await admin.ok("annual/team", { scope: "all" });
  assert.deepEqual([an.period.label, an.period.start_date, an.period.end_date, an.rows.map((r) => r.name)], ["Annualisation 2026", "2026-09-01", "2026-12-31", ["Camille Martin", "Thomas Petit"]]);
  assert.ok(an.rows.every((r) => r.objective > 0 && r.done > 0 && r.remaining > 0 && !r.goal_set), JSON.stringify(an.rows));
  assert.equal((await admin.ok("boot")).annual.label, "Annualisation 2026");
  const { normaliserGrille } = await import(path.join(ROOT, "public/kokolio/js/grille.js"));
  const g = normaliserGrille(await admin.ok("plan/grid", { scope: "all", from: "2026-11-23" }));
  assert.deepEqual(g.rows.map((r) => [r.name, r.cycle ? r.cells[0].code : "", r.total]), [["Camille Martin", "J7", 2100], ["Julien Bernard", "", 0], ["Thomas Petit", "J7", 2100], ["Sophie Leroy", "", 0], ["Inès Roux", "J7", 1680], ["Nadia Benali", "", 0]]);
});

test("chaque compte fictif s'active avec son code et retrouve ses données", async () => {
  const camille = new Client("camille"), julien = new Client("julien"), thomas = new Client("thomas"), sophie = new Client("sophie");
  await camille.ok("auth/activate", { login: "camille.martin", code: comptes["camille.martin"].code, password: "Bateau-Rouge-19" });
  await julien.ok("auth/activate", { login: "julien.bernard", code: comptes["julien.bernard"].code, password: "Cactus#Mauve77" });
  await thomas.ok("auth/activate", { login: "thomas.petit", code: comptes["thomas.petit"].code, password: "Lampe+Orange58" });
  await sophie.ok("auth/activate", { login: "sophie.leroy", code: comptes["sophie.leroy"].code, password: "Girafe!Verte42" });
  const oct = await camille.ok("my/month", { month: "2026-10" });
  assert.ok(oct.summary.days_worked >= 15 && oct.summary.abs_days === 5 && oct.summary.pending === 0);
  const nov = await camille.ok("my/month", { month: "2026-11" });
  assert.deepEqual(nov.alerts.map((a) => a.kind).sort(), ["jour", "repos"]);
  const abs = await camille.ok("my/absences");
  assert.deepEqual([abs.balances.cp.entries, abs.balances.cp.accrued, abs.balances.cp.taken, abs.balances.cp.waiting], [9, 4.16, 5, 3]);
  const t = await thomas.ok("my/today");
  assert.deepEqual(t.anomalies.map((a) => a.kind).sort(), ["depart", "vide"]);
  assert.equal((await thomas.ok("my/month", { month: "2026-11" })).summary.refused, 1);
  const y = await camille.ok("my/year", { year: 2026 });
  assert.ok(y.totals.CP === 5 && y.totals.AM === 2 && y.totals.TT > 5 && y.totals["?"] === 3);
  const b = await julien.ok("boot");
  assert.deepEqual([b.me.is_manager, b.me.reports, b.me.regime, b.demo], [true, 4, "forfait_jours", true]);
  const pend = await julien.ok("team/pending");
  assert.deepEqual(pend.groups.map((g) => g.name), ["Camille Martin", "Inès Roux", "Nadia Benali", "Thomas Petit"]);
  assert.deepEqual(pend.absences.map((a) => a.name).sort(), ["Camille Martin", "Inès Roux"]);
  const pointes = await julien.ok("punch-log", { day: pend.groups[0].days[0].date, user_id: pend.groups[0].user_id });
  assert.ok(pointes.punches.length >= 2);                               // les journées fictives ont leur trace de pointage
  const r = await julien.ok("team/decide-days", { decision: "valide", items: pend.groups[0].days.filter((d) => d.state === "ok").map((d) => ({ id: d.id, version: d.version })) });
  assert.ok(r.done.length >= 4 && r.failed.length === 0);
  assert.equal((await sophie.ok("team/pending")).absences[0].name, "Julien Bernard"); // la demande du responsable va à sa propre responsable
  await camille.fail("admin/demo-reset", { confirm: "EFFACER" }, "interdit");
  await sophie.fail("admin/demo-reset", { confirm: "EFFACER" }, "interdit");
  await sophie.fail("admin/demo-load", {}, "interdit");
  // octobre se clôture comme en vrai
  assert.equal((await sophie.ok("rh/close", { month: "2026-10" })).version, 1);
});

test("effacement : tout repart de zéro, sauf l'administrateur et les réglages", async () => {
  await admin.fail("admin/demo-reset", {}, "confirmation");
  await admin.fail("admin/demo-reset", { confirm: "oui" }, "confirmation");
  assert.throws(() => sql("delete from kokolio.audit"), /ajout seul/);  // hors de la fonction d'effacement, le journal reste intouchable
  const r = await admin.ok("admin/demo-reset", { confirm: "EFFACER" });
  assert.equal(r.users, 6);
  const st = await admin.ok("admin/status");
  assert.deepEqual([st.users, st.admins, st.days, st.punches, st.absences, st.closures, st.audit], [1, 1, 0, 0, 0, 0, 1]);
  assert.deepEqual([(await admin.ok("boot")).demo, (await admin.ok("admin/settings")).settings.go_live, (await admin.ok("admin/settings")).settings.company], [false, "2026-11-25", "Entreprise d'essai"]);
  const j = await admin.ok("rh/journal", {});
  assert.deepEqual(j.rows.map((x) => x.action), ["donnees_demo_effacees"]);
  assert.equal((await admin.ok("rh/journal-verify", {})).ok, true);
  assert.equal((await new Client("camille").call("auth/login", { login: "camille.martin", password: "Bateau-Rouge-19" })).code, "identifiants");
  assert.throws(() => sql("delete from kokolio.audit"), /ajout seul/);
  await admin.fail("admin/demo-reset", { confirm: "EFFACER" }, "etat");
  // la bibliothèque d'exemple est repartie avec la démonstration
  assert.deepEqual([(await admin.ok("plan/lib")).models.length, (await admin.ok("plan/lib")).cycles.length], [0, 0]);
  // rechargeable, puis effaçable de nouveau ; ce que l'administrateur a créé lui-même dans la bibliothèque reste en place
  await admin.ok("plan/model-save", { create: true, model: { code: "PERSO", label: "Horaire maison", minutes: 400 } });
  await admin.ok("plan/model-save", { create: true, model: { code: "J7", label: "Journée 7 h maison", minutes: 420 } });
  assert.equal((await admin.ok("admin/demo-load")).users, 6);
  assert.deepEqual((await admin.ok("plan/lib")).models.map((m) => [m.code, m.label]), [["J8", "Journée 8 h"], ["M4", "Matinée 4 h"], ["S7", "Soirée 7 h"], ["J7", "Journée 7 h maison"], ["PERSO", "Horaire maison"]]);
  await admin.ok("admin/demo-reset", { confirm: "EFFACER" });
  assert.deepEqual((await admin.ok("plan/lib")).models.map((m) => m.code), ["J7", "PERSO"]);
  assert.equal((await admin.ok("plan/lib")).cycles.length, 0);
  assert.deepEqual([(await admin.ok("annual/periods")).periods.length, (await admin.ok("boot")).annual], [0, null]);     // la période d'exemple est repartie aussi
  assert.equal(sql("select count(*) from kokolio.plan_days"), "0");
});

test("les comptes déjà créés ne sont pas concernés par l'historique fictif", async () => {
  // la configuration rencontrée en production : deux comptes d'essai entrés au 1er janvier, activés, puis chargement
  await admin.ok("rh/import", { text: "identifiant;nom;prenom;matricule;responsable;date_entree;regime;heures_hebdo\ndemo.manager;Manager;Démo;9001;;01/01/2026;forfait;\ndemo.salarie;Salarié;Démo;9002;demo.manager;01/01/2026;horaire;35\n" });
  const ids = Object.fromEntries((await admin.ok("rh/employees")).employees.map((e) => [e.login, e.id]));
  const essai = new Client("demo.salarie");
  await essai.ok("auth/activate", { login: "demo.salarie", code: (await admin.ok("team/code", { user_id: ids["demo.salarie"] })).code, password: "Bateau-Rouge-19" });
  const releve = async () => ({ mois: await essai.ok("my/month", { month: "2026-11" }), soldes: (await essai.ok("my/absences")).balances, jour: (await essai.ok("my/today")).anomalies });
  const avant = await releve();
  const r = await admin.ok("admin/demo-load");
  assert.deepEqual([r.users, r.closed, r.go_live, r.existing], [6, "2026-09", "2026-09-01", 3]);
  // le mois clôturé et le mois suivant ne contiennent que les six comptes fictifs, sans journée vide
  const photo = (await admin.ok("rh/closure-detail", { month: "2026-09", version: 1 })).snapshot;
  assert.deepEqual([photo.totals.employees, photo.totals.empty_days], [6, 0]);
  const chk = await admin.ok("rh/closure-check", { month: "2026-10" });
  assert.deepEqual([chk.totals.employees, chk.totals.empty_days, chk.empty.length, chk.pending_days, chk.pending_absences], [6, 0, 0, 0, 0]);
  const oct = await admin.ok("team/month", { month: "2026-10", scope: "all" });
  assert.deepEqual(oct.rows.map((x) => x.name), ["Camille Martin", "Inès Roux", "Julien Bernard", "Nadia Benali", "Sophie Leroy", "Thomas Petit"]);
  assert.ok(oct.rows[0].worked > 6000 && oct.tiles.anomalies === 0);      // les comptes fictifs, eux, ont bien leur historique
  // pour le compte d'essai, rien n'a changé : mêmes heures, mêmes soldes, aucun oubli inventé
  assert.deepEqual(await releve(), avant);
  assert.equal((await essai.ok("boot")).me.since, "2026-11-25");
  const passe = await essai.ok("my/month", { month: "2026-10" });         // « Mes heures » ne remonte pas avant son suivi
  assert.deepEqual([passe.summary.theo, passe.anomalies.length, passe.days.length, passe.go_live], [0, 0, 0, "2026-11-25"]);
  // à partir de son premier jour suivi, il figure normalement dans la synthèse
  assert.equal((await admin.ok("team/month", { month: "2026-11", scope: "all" })).rows.length, 8);
  // effacement : il part avec le reste, et l'administrateur repart sans début de suivi propre
  assert.equal(sql("select count(*) from kokolio.users where tracked_from is not null"), "3");
  assert.equal((await admin.ok("admin/demo-reset", { confirm: "EFFACER" })).users, 8);
  assert.equal(sql("select count(*) || '/' || count(tracked_from) from kokolio.users"), "1/0");
});

test("garde-fous : accepté dans un outil en cours d'essai, refusé dans un outil en service", async () => {
  // quelques comptes d'essai : le chargement est accepté et n'y touche pas ; ils partiront avec le reste
  await admin.ok("rh/import", { text: "identifiant;nom;prenom\nessai.un;Essai;Un\n" });
  assert.equal((await admin.ok("admin/demo-load")).users, 6);
  assert.equal((await admin.ok("rh/employees")).employees.length, 8);
  await admin.ok("admin/demo-reset", { confirm: "EFFACER" });
  assert.equal((await admin.ok("rh/employees")).employees.length, 1);
  // un mois clôturé : l'outil est en service, le mode démonstration lui est fermé pour toujours
  sql("insert into kokolio.closures (month, version, snapshot, export_text, export_sha256) values ('2026-01', 1, '{}'::jsonb, 'x', repeat('a', 64))");
  assert.match((await admin.fail("admin/demo-load", {}, "etat")).message, /clôturé/);
  sql("delete from kokolio.closures");
  // un identifiant des données fictives est déjà pris
  await admin.ok("rh/import", { text: "identifiant;nom;prenom\ncamille.martin;Martin;Camille\n" });
  assert.match((await admin.fail("admin/demo-load", {}, "etat")).message, /camille\.martin/);
  // plus de dix salariés : refusé, et rien n'est effaçable
  await admin.ok("rh/import", { text: "identifiant;nom\n" + Array.from({ length: 11 }, (_, i) => `vrai${i};Nom${i}`).join("\n") + "\n" });
  assert.match((await admin.fail("admin/demo-load", {}, "etat")).message, /plus de dix/);
  await admin.fail("admin/demo-reset", { confirm: "EFFACER" }, "etat");
  assert.equal((await admin.ok("rh/employees")).employees.length, 13);
  const t = await admin.ok("admin/selftest");
  assert.equal(t.ok, true, JSON.stringify(t.checks.filter((c) => !c.ok)));
});
