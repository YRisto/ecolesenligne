// Tests d'intégration de la planification (version 2.0) : horaires journaliers, cycles, planning d'équipe, début de suivi,
// présence automatique, journées qui passent minuit. Joués contre une vraie base PostgreSQL locale, comme api.test.mjs.
// Lancement : node --test tests/kokolio/planning.test.mjs
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "..");
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "postgres", "-d", "kokolio_test", "-v", "ON_ERROR_STOP=1", "-qAt"];
const sql = (q) => execFileSync("psql", [...PG, "-c", q], { encoding: "utf8" }).trim();
const sqlFails = (q) => { try { execFileSync("psql", [...PG, "-c", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); return ""; } catch (e) { return String(e.stderr || e.message); } };
const PORT = 54397;
let handle, fake, clock = null;

function at(day, hm) {
  for (const off of ["+02:00", "+01:00"]) {
    const iso = `${day}T${hm}:00${off}`;
    const wall = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
    if (wall === `${day} ${hm}`) { clock = new Date(iso).toISOString(); return; }
  }
  throw new Error("heure inexistante " + day + " " + hm);
}

class Client {
  constructor(name) { this.name = name; this.cookie = ""; }
  async call(route, body = {}) {
    const headers = { "content-type": "application/json", "x-forwarded-host": "kokolio.test", "x-forwarded-proto": "https", origin: "https://kokolio.test",
      "x-kokolio": "1", "x-real-ip": "10.0.0.2", "user-agent": "test/" + this.name };
    if (this.cookie) headers.cookie = this.cookie;
    if (clock) headers["x-kk-test-now"] = clock;
    const res = await handle(new Request("https://kokolio.test/api/kokolio/" + route, { method: "POST", headers, body: JSON.stringify(body) }), route);
    for (const c of res.headers.getSetCookie()) { const m = c.match(/^kk_session=([^;]*)/); if (m) this.cookie = m[1] ? `kk_session=${m[1]}` : ""; }
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
const PW = "Planning-Bleu-2026";
const ids = {}, lib = {};
const H35 = { regime: "horaire", day_minutes: [420, 420, 420, 420, 420, 0, 0], pause_minutes: 45, cp_per_month: 2.08 };
const FORFAIT = { regime: "forfait_jours", work_days: [1, 2, 3, 4, 5], cp_per_month: 2.08, forfait_days: 218 };

// Crée une fiche (par l'administrateur), puis active le compte avec le code remis.
async function embauche(client, login, first, last, extra) {
  const r = await admin.ok("rh/employee-save", { login, first_name: first, last_name: last, entry_date: "2025-01-06", ...extra });
  ids[login] = r.user.id;
  await client.ok("auth/activate", { login, code: r.code, password: PW });
  return r;
}
// la grille arrive allégée : on la remet à plat comme le fait l'écran du planning
const { normaliserGrille } = await import(path.join(ROOT, "public/kokolio/js/grille.js"));
const grille = async (client, body) => normaliserGrille(await client.ok("plan/grid", body));
const cellule = (grid, login, date) => grid.rows.find((r) => r.user_id === ids[login])?.cells.find((c) => c.date === date);
const journee = (c, day, times) => c.ok("my/correct", { day, times, lieu: "bureau", comment: "Saisie de test" });

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

test("mise en place : une RH, un responsable, deux salariés à 35 h, une cadre en présence automatique", async () => {
  at("2026-11-02", "07:30");
  const code = sql("select kokolio.bootstrap_admin('admin')");
  await admin.ok("auth/activate", { login: "admin", code, password: PW });
  ids.admin = (await admin.ok("boot")).me.id;
  await admin.ok("admin/settings-save", { settings: { go_live: "2026-11-02" } });
  await embauche(sophie, "sophie.leroy", "Sophie", "Leroy", { role: "rh", team: "Direction", contract: FORFAIT });
  await embauche(julien, "julien.bernard", "Julien", "Bernard", { team: "Admissions", manager_id: ids["sophie.leroy"], contract: FORFAIT });
  await embauche(camille, "camille.martin", "Camille", "Martin", { team: "Admissions", matricule: "0012", manager_id: ids["julien.bernard"], contract: H35 });
  await embauche(leo, "leo.petit", "Léo", "Petit", { team: "Admissions", matricule: "0015", manager_id: ids["julien.bernard"], contract: H35 });
  const n = await embauche(nadia, "nadia.benali", "Nadia", "Benali", { team: "Pédagogie", matricule: "0040", manager_id: ids["sophie.leroy"], contract: { ...FORFAIT, presence: "automatique" } });
  assert.equal(n.user.role, "salarie");
  const b = await nadia.ok("boot");
  const { APP_VERSION } = await import(path.join(ROOT, "lib/kokolio/version.mjs"));
  assert.deepEqual([b.me.regime, b.me.presence, b.me.cycle, b.app], ["forfait_jours", "automatique", "", APP_VERSION]);
  assert.equal((await camille.ok("boot")).me.presence, "pointage");
});

test("bibliothèque : les RH créent les horaires journaliers, avec leurs plages", async () => {
  const j8 = await sophie.ok("plan/model-save", { create: true, model: { code: "j8", label: "Journée 8 h", minutes: 480, ranges: [["08:45", "13:15"], ["14:00", "17:30"]], color: "violet" } });
  assert.deepEqual([j8.model.code, j8.model.minutes, j8.model.version], ["J8", 480, 1]);
  await sophie.ok("plan/model-save", { create: true, model: { code: "M4", label: "Matinée 4 h", minutes: 240, ranges: [["09:00", "13:00"]], color: "turquoise" } });
  await sophie.ok("plan/model-save", { create: true, model: { code: "J7", label: "Journée 7 h", minutes: 420, ranges: [["09:00", "12:30"], ["13:30", "17:00"]] } });
  await sophie.ok("plan/model-save", { create: true, model: { code: "N8", label: "Nuit 8 h", minutes: 480, ranges: [["21:00", "29:00"]] } });   // 21 h → 5 h le lendemain
  // refus : code en double, code ou durée invalides, plages qui se chevauchent ou à l'envers, couleur inconnue
  await sophie.fail("plan/model-save", { create: true, model: { code: "J8", label: "Doublon", minutes: 480 } }, "horaire");
  await sophie.fail("plan/model-save", { create: true, model: { code: "trop long pour un code", label: "X", minutes: 60 } }, "horaire");
  await sophie.fail("plan/model-save", { create: true, model: { code: "Z1", label: "X", minutes: 0 } }, "horaire");
  await sophie.fail("plan/model-save", { create: true, model: { code: "Z1", label: "X", minutes: 1000 } }, "horaire");
  await sophie.fail("plan/model-save", { create: true, model: { code: "Z1", label: "X", minutes: 420, ranges: [["09:00", "13:00"], ["12:00", "17:00"]] } }, "horaire");
  await sophie.fail("plan/model-save", { create: true, model: { code: "Z1", label: "X", minutes: 420, ranges: [["13:00", "09:00"]] } }, "horaire");
  await sophie.fail("plan/model-save", { create: true, model: { code: "Z1", label: "X", minutes: 420, color: "fuchsia" } }, "horaire");
  await sophie.fail("plan/model-save", { model: { code: "Z9", label: "Inconnu", minutes: 420 } }, "introuvable", 404);
  // modification : version contrôlée, désactivation possible
  const up = await sophie.ok("plan/model-save", { model: { code: "J7", label: "Journée 7 h (standard)", minutes: 420, ranges: [["09:00", "12:30"], ["13:30", "17:00"]], color: "bleu" }, version: 1 });
  assert.deepEqual([up.model.label, up.model.color, up.model.version], ["Journée 7 h (standard)", "bleu", 2]);
  await sophie.fail("plan/model-save", { model: { code: "J7", label: "Conflit", minutes: 420 }, version: 1 }, "conflit", 409);
  // droits : la bibliothèque se lit quand on encadre ou qu'on est RH ; seuls les RH la modifient
  await camille.fail("plan/lib", {}, "interdit", 403);
  await julien.fail("plan/model-save", { create: true, model: { code: "PIRATE", label: "X", minutes: 60 } }, "interdit", 403);
  const l = await julien.ok("plan/lib");
  assert.equal(l.can_edit, false);
  assert.deepEqual(l.models.map((m) => [m.code, m.minutes, m.ranges_text]), [["J7", 420, "9 h – 12 h 30 · 13 h 30 – 17 h"], ["J8", 480, "8 h 45 – 13 h 15 · 14 h – 17 h 30"], ["M4", 240, "9 h – 13 h"], ["N8", 480, "21 h – 5 h (+1)"]]);
});

test("cycles : une ou plusieurs semaines types construites avec les horaires journaliers", async () => {
  const k = await sophie.ok("plan/cycle-save", { cycle: { name: "Alternance 4 / 5 jours", weeks: [["J8", "J8", "J8", "J8", null, null, null], ["J8", "J8", "J8", "J8", "M4", null, null]] } });
  lib.alternance = k.cycle.id;
  assert.equal(k.cycle.weeks[1][4].minutes, 240);
  lib.s35 = (await sophie.ok("plan/cycle-save", { cycle: { name: "Semaine 35 h", weeks: [["J7", "J7", "J7", "J7", "J7", "", ""]] } })).cycle.id;
  await sophie.fail("plan/cycle-save", { cycle: { name: "semaine 35 H", weeks: [["J7", null, null, null, null, null, null]] } }, "horaire");           // nom déjà pris
  await sophie.fail("plan/cycle-save", { cycle: { name: "Horaire fantôme", weeks: [["XX", null, null, null, null, null, null]] } }, "horaire");       // horaire inconnu
  await sophie.fail("plan/cycle-save", { cycle: { name: "Tout au repos", weeks: [[null, null, null, null, null, null, null]] } }, "horaire");
  await sophie.fail("plan/cycle-save", { cycle: { name: "Semaine de six jours", weeks: [["J7", "J7", "J7", "J7", "J7", "J7"]] } }, "horaire");
  await sophie.fail("plan/cycle-save", { cycle: { name: "Trop long", weeks: Array.from({ length: 13 }, () => ["J7", null, null, null, null, null, null]) } }, "horaire");
  await julien.fail("plan/cycle-save", { cycle: { name: "Pirate", weeks: [["J7", null, null, null, null, null, null]] } }, "interdit", 403);
  const l = await sophie.ok("plan/lib");
  assert.equal(l.can_edit, true);
  assert.deepEqual(l.cycles.map((c) => [c.name, c.weeks.length, c.weekly_minutes, c.assigned, c.locked]), [["Alternance 4 / 5 jours", 2, 2040, 0, false], ["Semaine 35 h", 1, 2100, 0, false]]);
  assert.deepEqual(l.models.map((m) => [m.code, m.cycles]), [["J7", 1], ["J8", 1], ["M4", 1], ["N8", 0]]);
});

test("attribuer un cycle à un salarié : ce qui est prévu chaque jour suit le cycle", async () => {
  await julien.fail("rh/contract", { user_id: ids["camille.martin"], start_date: "2026-11-02", contract: { ...H35, cycle_id: lib.alternance } }, "interdit", 403);
  await sophie.fail("rh/contract", { user_id: ids["camille.martin"], start_date: "2026-11-02", contract: { ...H35, cycle_id: "00000000-0000-0000-0000-000000000000" } }, "horaire");
  // ancrage donné un mercredi : la semaine 1 commence le lundi de cette semaine-là
  const r = await sophie.ok("rh/contract", { user_id: ids["camille.martin"], start_date: "2026-11-02", contract: { ...H35, cycle_id: lib.alternance, cycle_anchor: "2026-11-04" } });
  assert.deepEqual([r.contract.cycle_id, r.contract.cycle_anchor, r.contract.presence, r.contract.day_minutes], [lib.alternance, "2026-11-02", "pointage", [480, 480, 480, 480, 0, 0, 0]]);
  const f = await sophie.ok("rh/employee", { id: ids["camille.martin"] });
  assert.equal(f.contracts.at(-1).cycle.name, "Alternance 4 / 5 jours");
  assert.deepEqual(f.cycles.map((c) => c.name), ["Alternance 4 / 5 jours", "Semaine 35 h"]);
  assert.equal((await sophie.ok("plan/lib")).cycles[0].assigned, 1);
  const boot = await camille.ok("boot");
  assert.deepEqual([boot.me.cycle, boot.me.weekly_minutes], ["Alternance 4 / 5 jours", 2040]);
  // écran « Pointer » : l'horaire du jour, et les deux semaines à venir
  const t = await camille.ok("my/today");
  assert.deepEqual([t.plan.code, t.plan.minutes, t.plan.ranges, t.theo, t.weekly_minutes], ["J8", 480, "8 h 45 – 13 h 15 · 14 h – 17 h 30", 480, 2040]);
  assert.equal(t.upcoming.length, 14);
  assert.deepEqual(t.upcoming.map((d) => d.minutes), [480, 480, 480, 480, 0, 0, 0, 480, 480, 0, 480, 240, 0, 0]);     // mercredi 11 : férié
  assert.equal(t.upcoming[9].holiday, "Armistice 1918");
  // un salarié à horaire fixe n'a pas de planning à afficher
  assert.deepEqual((await leo.ok("my/today")).upcoming, []);
  // sa fiche (lue par lui-même) porte aussi le cycle
  assert.equal((await camille.ok("my/fiche")).current.cycle.name, "Alternance 4 / 5 jours");
});

test("planning d'équipe : le responsable pose des exceptions, sur son équipe seulement", async () => {
  const g = await grille(julien, { from: "2026-11-04", weeks: 2 });
  assert.deepEqual([g.from, g.to, g.days.length, g.can_lib], ["2026-11-02", "2026-11-15", 14, false]);
  assert.deepEqual(g.rows.map((r) => [r.name, r.cycle, r.can_edit, r.total]), [["Camille Martin", "Alternance 4 / 5 jours", true, 480 * 7 + 240], ["Léo Petit", "", true, 420 * 9]]);
  assert.deepEqual(g.models.map((m) => m.code), ["J7", "J8", "M4", "N8"]);
  const c = cellule(g, "camille.martin", "2026-11-13");
  assert.deepEqual([c.work, c.code, c.minutes, c.source, c.ranges], [true, "M4", 240, "cycle", "9 h – 13 h"]);
  assert.deepEqual([cellule(g, "leo.petit", "2026-11-11").work, cellule(g, "leo.petit", "2026-11-11").holiday], [false, "Armistice 1918"]);
  // Léo : mardi 3 au repos, samedi 7 en matinée (horaire de la bibliothèque), jeudi 5 avec un horaire libre
  const r = await julien.ok("plan/set", { items: [
    { user_id: ids["leo.petit"], day: "2026-11-03", minutes: 0 },
    { user_id: ids["leo.petit"], day: "2026-11-07", model_code: "m4", note: "Salon étudiant" },
    { user_id: ids["leo.petit"], day: "2026-11-05", minutes: 360, ranges: [["10:00", "13:00"], ["14:00", "17:00"]], label: "Journée courte" },
  ] });
  assert.deepEqual([r.set, r.cleared], [3, 0]);
  const g2 = await grille(julien, { from: "2026-11-02", weeks: 1 });
  assert.deepEqual(["2026-11-03", "2026-11-05", "2026-11-07"].map((d) => { const x = cellule(g2, "leo.petit", d); return [x.work, x.code, x.label, x.minutes, x.source]; }),
    [[false, "", "", 0, "exception"], [true, "", "Journée courte", 360, "exception"], [true, "M4", "Matinée 4 h", 240, "exception"]]);
  assert.equal(cellule(g2, "leo.petit", "2026-11-07").note, "Salon étudiant");
  assert.equal(g2.rows.find((x) => x.user_id === ids["leo.petit"]).total, 420 * 3 + 360 + 240);
  // droits : ni soi-même, ni un salarié d'une autre équipe, ni un simple salarié ; horaire inconnu ou désactivé refusé
  await julien.fail("plan/set", { items: [{ user_id: ids["julien.bernard"], day: "2026-11-06", minutes: 0 }] }, "interdit", 403);
  await julien.fail("plan/set", { items: [{ user_id: ids["nadia.benali"], day: "2026-11-06", minutes: 0 }] }, "interdit", 403);
  await camille.fail("plan/set", { items: [{ user_id: ids["leo.petit"], day: "2026-11-06", minutes: 0 }] }, "interdit", 403);
  await camille.fail("plan/set", { items: [{ user_id: ids["camille.martin"], day: "2026-11-06", minutes: 0 }] }, "interdit", 403);
  await camille.fail("plan/grid", {}, "interdit", 403);
  await julien.fail("plan/set", { items: [{ user_id: ids["leo.petit"], day: "2026-11-06", model_code: "XX" }] }, "horaire");
  await julien.fail("plan/set", { items: [{ user_id: ids["leo.petit"], day: "2029-11-06", minutes: 0 }] }, "date");
  await julien.fail("plan/set", { items: [{ user_id: ids.admin, day: "2026-11-06", minutes: 0 }] }, "interdit", 403);
  // tout ou rien : un élément refusé annule le lot entier
  await julien.fail("plan/set", { items: [{ user_id: ids["leo.petit"], day: "2026-11-06", minutes: 0 }, { user_id: ids["nadia.benali"], day: "2026-11-06", minutes: 0 }] }, "interdit", 403);
  assert.equal(cellule(await grille(julien, { from: "2026-11-02" }), "leo.petit", "2026-11-06").source, "contrat");
  // les RH voient tout le monde, et planifient chacun sauf eux-mêmes
  const all = await grille(sophie, { scope: "all", from: "2026-11-02" });
  assert.deepEqual(all.rows.map((x) => [x.name, x.can_edit, x.presence]), [["Camille Martin", true, "pointage"], ["Julien Bernard", true, "pointage"], ["Léo Petit", true, "pointage"], ["Sophie Leroy", false, "pointage"], ["Nadia Benali", true, "automatique"]]);
  await julien.fail("plan/grid", { scope: "all" }, "interdit", 403);
  await sophie.fail("plan/set", { items: [{ user_id: ids["sophie.leroy"], day: "2026-11-06", minutes: 0 }] }, "interdit", 403);
  await sophie.ok("plan/set", { items: [{ user_id: ids["julien.bernard"], day: "2026-11-06", minutes: 0, label: "Récupération" }] });
  // revenir au planning par défaut
  const back = await julien.ok("plan/set", { items: [{ user_id: ids["leo.petit"], day: "2026-11-05", clear: true }, { user_id: ids["leo.petit"], day: "2026-11-04", clear: true }] });
  assert.deepEqual([back.set, back.cleared], [0, 1]);
  assert.deepEqual([cellule(await grille(julien, { from: "2026-11-02" }), "leo.petit", "2026-11-05").source], ["contrat"]);
  // chaque modification est inscrite au journal, au nom de son auteur
  const j = await sophie.ok("rh/journal", { action: "planning_modifie" });
  assert.ok(j.rows.length >= 3 && j.rows.some((e) => e.detail.jours === 3 && e.detail.detail.some((d) => d.horaire === "M4")), JSON.stringify(j.rows[0]));
  assert.deepEqual([...new Set(j.rows.map((e) => e.actor_label))].sort(), ["Julien Bernard (julien.bernard)", "Sophie Leroy (sophie.leroy)"]);
});

test("effets sur les heures : prévu, écart, oublis et décompte des absences suivent le planning", async () => {
  at("2026-11-09", "08:00");
  await journee(leo, "2026-11-02", ["09:00", "12:30", "13:30", "17:00"]);       // 7 h, comme prévu
  await journee(leo, "2026-11-03", ["09:00", "12:00"]);                         // 3 h un jour de repos : du temps en plus
  await journee(leo, "2026-11-07", ["09:00", "13:00"]);                         // le samedi matin planifié
  const m = await leo.ok("my/month", { month: "2026-11" });
  // semaine du 2 : lundi 7 h, mardi repos, mercredi-vendredi 7 h, samedi 4 h ; lundi 9 n'est pas terminé
  assert.deepEqual([m.summary.theo, m.summary.worked, m.summary.ecart], [420 * 4 + 240, 420 + 180 + 240, 420 + 180 + 240 - (420 * 4 + 240)]);
  assert.deepEqual(m.anomalies.map((a) => a.date), ["2026-11-04", "2026-11-05", "2026-11-06"]);
  const samedi = m.days.find((d) => d.date === "2026-11-07");
  assert.deepEqual([samedi.theo, samedi.ecart, samedi.plan.code, samedi.plan.exception], [240, 0, "M4", true]);
  assert.deepEqual([m.days.find((d) => d.date === "2026-11-03").theo, m.days.find((d) => d.date === "2026-11-03").ecart], [0, 180]);
  // Camille (cycle) : quatre jours de 8 h la première semaine ; le vendredi n'est pas attendu
  await journee(camille, "2026-11-02", ["08:45", "13:15", "14:00", "17:30"]);
  const mc = await camille.ok("my/month", { month: "2026-11" });
  assert.deepEqual([mc.summary.theo, mc.summary.ecart, mc.cycle], [480 * 4, 480 - 480 * 4, "Alternance 4 / 5 jours"]);
  assert.deepEqual(mc.anomalies.map((a) => a.date), ["2026-11-03", "2026-11-04", "2026-11-05"]);
  // synthèse du responsable : mêmes chiffres
  const s = await julien.ok("team/month", { month: "2026-11" });
  assert.deepEqual(s.rows.map((r) => [r.name, r.theo, r.anomalies]), [["Camille Martin", 1920, 3], ["Léo Petit", 1920, 3]]);
  // absence : la semaine du 16, avec le mardi au repos et le samedi travaillé, compte cinq jours
  await julien.ok("plan/set", { items: [{ user_id: ids["leo.petit"], day: "2026-11-17", minutes: 0 }, { user_id: ids["leo.petit"], day: "2026-11-21", model_code: "M4" }] });
  assert.equal((await leo.ok("my/absence-preview", { type: "cp", start: "2026-11-16", end: "2026-11-22" })).days, 5);
  assert.equal((await leo.ok("my/absence-preview", { type: "cp", start: "2026-11-17", end: "2026-11-17" })).days, 0);
  await leo.fail("my/absence-request", { type: "cp", start: "2026-11-17", end: "2026-11-17" }, "date");
  const a = await leo.ok("my/absence-request", { type: "cp", start: "2026-11-16", end: "2026-11-22", comment: "Vacances" });
  assert.equal(Number(a.absence.days_count), 5);
  // Camille : en semaine 1 du cycle (16-22), du lundi au vendredi = quatre jours
  assert.equal((await camille.ok("my/absence-preview", { type: "cp", start: "2026-11-16", end: "2026-11-20" })).days, 4);
  assert.equal((await camille.ok("my/absence-preview", { type: "cp", start: "2026-11-23", end: "2026-11-27" })).days, 5);
  // validation : le solde décompté suit aussi le planning
  const p = await julien.ok("team/pending");
  await julien.ok("team/decide-absence", { id: p.absences[0].id, decision: "valide", version: p.absences[0].version });
  assert.equal((await leo.ok("my/absences")).balances.cp.taken, 5);
  // l'absence apparaît dans la grille, par-dessus ce qui était prévu
  const g = await grille(julien, { from: "2026-11-16" });
  assert.deepEqual([cellule(g, "leo.petit", "2026-11-18").absence.code, cellule(g, "leo.petit", "2026-11-18").work], ["CP", true]);
});

test("présence automatique : la cadre ne pointe pas, ses jours prévus sont comptés", async () => {
  const t = await nadia.ok("my/today");
  assert.deepEqual([t.presence, t.regime, t.forfait.days, t.anomalies.length], ["automatique", "forfait_jours", 5, 0]);
  const m = await nadia.ok("my/month", { month: "2026-11" });
  assert.deepEqual([m.summary.days_worked, m.summary.credited, m.anomalies.length, m.presence], [5, 5, 0, "automatique"]);
  assert.deepEqual(m.days.map((d) => [d.date, d.credited]).reverse(), ["02", "03", "04", "05", "06"].map((d) => [`2026-11-${d}`, true]));
  // synthèse des RH : présente aujourd'hui sans pointage, rien à régulariser ; Julien (pointage, forfait) a cinq oublis
  const s = await sophie.ok("team/month", { month: "2026-11" });
  const ligne = (n) => s.rows.find((r) => r.name === n);
  assert.deepEqual([ligne("Nadia Benali").present, ligne("Nadia Benali").anomalies, ligne("Nadia Benali").days], [true, 0, 5]);
  assert.deepEqual([ligne("Julien Bernard").present, ligne("Julien Bernard").anomalies], [false, 4]);     // vendredi 6 : récupération posée par les RH
  // une demi-journée d'absence : la journée ne compte que pour moitié
  await sophie.ok("my/absence-request", { user_id: ids["nadia.benali"], type: "rtt", start: "2026-11-04", end: "2026-11-04", half: "matin" });
  assert.equal((await nadia.ok("my/month", { month: "2026-11" })).summary.days_worked, 4.5);
  // vue annuelle : jours travaillés sans pointage
  const y = await nadia.ok("my/year", { year: 2026 });
  assert.equal(y.months[10].cells.find((c) => c.d === 2).code, "T");
  // passage d'un salarié en présence automatique à partir d'une date : avant, ses oublis restent des oublis
  await sophie.ok("rh/contract", { user_id: ids["julien.bernard"], start_date: "2026-11-05", contract: { ...FORFAIT, presence: "automatique" } });
  const mj = await julien.ok("my/month", { month: "2026-11" });
  assert.deepEqual([mj.anomalies.map((a) => a.date), mj.summary.days_worked], [["2026-11-02", "2026-11-03", "2026-11-04"], 1]);   // jeudi 5 compté, vendredi 6 au repos
});

test("début de suivi par salarié : déployer équipe par équipe", async () => {
  const f = await sophie.ok("rh/employee", { id: ids["leo.petit"] });
  await julien.fail("rh/employee-save", { id: ids["leo.petit"], login: "leo.petit", last_name: "Petit", tracked_from: "2026-11-05" }, "interdit", 403);
  const base = { id: ids["leo.petit"], login: "leo.petit", first_name: "Léo", last_name: "Petit", matricule: "0015", team: "Admissions", manager_id: ids["julien.bernard"], entry_date: "2025-01-06" };
  const r = await sophie.ok("rh/employee-save", { ...base, tracked_from: "2026-11-05", version: f.user.version });
  assert.equal(r.user.tracked_from, "2026-11-05");
  // rien n'est attendu avant le 5 : plus d'oubli le 4, et le prévu repart du jeudi (7 h + 7 h + samedi 4 h)
  const m = await leo.ok("my/month", { month: "2026-11" });
  assert.deepEqual([m.summary.theo, m.anomalies.map((a) => a.date), m.go_live], [420 * 2 + 240, ["2026-11-05", "2026-11-06"], "2026-11-05"]);
  assert.equal((await leo.ok("boot")).me.since, "2026-11-05");
  // un enregistrement de fiche qui n'envoie pas le champ le conserve ; l'envoyer vide le retire
  assert.equal((await sophie.ok("rh/employee-save", { ...base, job: "Conseiller" })).user.tracked_from, "2026-11-05");
  assert.equal((await sophie.ok("rh/employee-save", { ...base, tracked_from: "" })).user.tracked_from, null);
  assert.equal((await leo.ok("my/month", { month: "2026-11" })).summary.theo, 420 * 4 + 240);
  const jr = await sophie.ok("rh/journal", { user_id: ids["leo.petit"], action: "fiche_modifiee" });
  assert.ok(jr.rows.some((e) => e.detail.tracked_from), JSON.stringify(jr.rows.map((e) => e.detail)));
});

test("annualisation : période, cycle annualisé, objectif, ajustements, effet des absences", async () => {
  // sans période, rien à afficher ; seuls les RH en créent
  assert.equal((await camille.ok("annual/employee", {})).period, null);
  assert.deepEqual([(await julien.ok("annual/team", {})).period, (await camille.ok("boot")).annual], [null, null]);
  await julien.fail("annual/period-save", { period: { label: "Pirate", start_date: "2026-11-02", end_date: "2026-12-31" } }, "interdit", 403);
  await sophie.fail("annual/period-save", { period: { label: "Trop longue", start_date: "2026-01-01", end_date: "2027-06-30" } }, "annualisation");
  const per = (await sophie.ok("annual/period-save", { period: { label: "Fin 2026", start_date: "2026-11-02", end_date: "2026-12-31" } })).period;
  await sophie.fail("annual/period-save", { period: { label: "Chevauchement", start_date: "2026-12-01", end_date: "2027-03-31" } }, "annualisation");
  await sophie.ok("annual/period-save", { period: { label: "Année 2027", start_date: "2027-01-01", end_date: "2027-12-31" } });
  assert.deepEqual((await sophie.ok("annual/periods")).periods.map((x) => x.label), ["Fin 2026", "Année 2027"]);
  // la période existe, mais personne n'est annualisé tant qu'aucun cycle ne l'est
  assert.deepEqual([(await camille.ok("boot")).annual.label, (await camille.ok("boot")).me.annualise, (await camille.ok("annual/employee", {})).annual], ["Fin 2026", false, false]);
  await julien.fail("plan/cycle-save", { cycle: { id: lib.alternance, name: "Alternance 4 / 5 jours", weeks: [["J8", "J8", "J8", "J8", null, null, null], ["J8", "J8", "J8", "J8", "M4", null, null]], annualise: true } }, "interdit", 403);
  await sophie.ok("plan/cycle-save", { cycle: { id: lib.alternance, name: "Alternance 4 / 5 jours", weeks: [["J8", "J8", "J8", "J8", null, null, null], ["J8", "J8", "J8", "J8", "M4", null, null]], annualise: true } });
  assert.equal((await camille.ok("boot")).me.annualise, true);
  // Camille : neuf semaines du 2 novembre au 31 décembre, 292 h planifiées (fériés du 11 novembre et du 25 décembre déduits)
  const a = await camille.ok("annual/employee", {});
  assert.deepEqual([a.annual, a.own, a.can_rh, a.goal_set, a.planned, a.objective, a.done, a.remaining, a.planned_rest, a.gap, a.balance],
    [true, true, false, false, 292 * 60, 292 * 60, 480, 292 * 60 - 480, 292 * 60 - 1920, -1440, -1440]);
  assert.deepEqual(a.weeks.map((w) => w.planned / 60), [32, 28, 32, 36, 32, 36, 32, 32, 32]);
  assert.deepEqual([a.weeks[0].done, a.weeks[0].cumul, a.weeks[1].current, a.weeks[1].counted, a.weeks[8].to], [480, -1440, true, false, "2026-12-31"]);
  // droits : un collègue ne voit rien, le responsable consulte, seuls les RH fixent l'objectif et l'ajustent
  await leo.fail("annual/employee", { user_id: ids["camille.martin"] }, "interdit", 403);
  assert.equal((await leo.ok("annual/employee", {})).annual, false);                           // horaire fixe : pas annualisé
  assert.deepEqual([(await julien.ok("annual/employee", { user_id: ids["camille.martin"] })).can_rh, (await sophie.ok("annual/employee", { user_id: ids["camille.martin"] })).can_rh], [false, true]);
  await julien.fail("annual/goal", { user_id: ids["camille.martin"], period_id: per.id, minutes: 290 * 60 }, "interdit", 403);
  await julien.fail("annual/entry", { user_id: ids["camille.martin"], period_id: per.id, day: "2026-11-10", minutes: -120, reason: "Essai" }, "interdit", 403);
  await sophie.ok("annual/goal", { user_id: ids["camille.martin"], period_id: per.id, minutes: 290 * 60, note: "Prorata convenu" });
  await sophie.fail("annual/entry", { user_id: ids["camille.martin"], period_id: per.id, day: "2027-01-10", minutes: -120, reason: "Hors période" }, "date");
  await sophie.fail("annual/entry", { user_id: ids["camille.martin"], period_id: per.id, day: "2026-11-10", minutes: -120, reason: "x" }, "motif");
  await sophie.ok("annual/entry", { user_id: ids["camille.martin"], period_id: per.id, day: "2026-11-10", minutes: -120, reason: "Heures de délégation" });
  const b = await camille.ok("annual/employee", {});
  assert.deepEqual([b.goal_set, b.goal_note, b.base, b.adjustments, b.objective, b.entries.map((e) => [e.day, e.minutes, e.reason])], [true, "Prorata convenu", 17400, -120, 17280, [["2026-11-10", -120, "Heures de délégation"]]]);
  assert.match(sqlFails("update kokolio.annual_entries set minutes = 1"), /ajout seul/);
  // un congé payé de deux jours (16 h) en décembre, saisi par les RH : retiré de l'objectif…
  await sophie.ok("my/absence-request", { user_id: ids["camille.martin"], type: "cp", start: "2026-12-14", end: "2026-12-15" });
  const c = await camille.ok("annual/employee", {});
  assert.deepEqual([c.removed, c.objective, c.absences], [960, 17280 - 960, [{ type: "cp", label: "Congé payé", mode: "retire", minutes: 960 }]]);
  // … ou compté comme réalisé, ou laissé à faire, selon le réglage du motif (réservé à l'administrateur)
  const cp = (await admin.ok("admin/settings")).types.find((t) => t.code === "cp");
  assert.equal(cp.annual, "retire");
  await sophie.fail("admin/type-save", { type: { ...cp, annual: "neutre" } }, "interdit", 403);
  await admin.fail("admin/type-save", { type: { ...cp, annual: "autre" } }, "parametre");
  await admin.ok("admin/type-save", { type: { ...cp, annual: "neutre" } });
  const n = await camille.ok("annual/employee", {});
  assert.deepEqual([n.removed, n.objective, n.gap - c.gap, n.absences[0].mode], [0, 17280, -960, "neutre"]);
  await admin.ok("admin/type-save", { type: { ...cp, annual: "realise" } });
  const r = await camille.ok("annual/employee", {});
  assert.deepEqual([r.removed, r.objective, r.planned_rest - n.planned_rest, r.absences[0].mode], [0, 17280, 960, "realise"]);
  const sansEffet = { ...cp }; delete sansEffet.annual;
  await admin.ok("admin/type-save", { type: sansEffet });                                       // sans le champ, le réglage est conservé
  assert.equal((await admin.ok("admin/settings")).types.find((t) => t.code === "cp").annual, "realise");
  await admin.ok("admin/type-save", { type: { ...cp, annual: "retire" } });
  // retirer l'objectif fixé : retour à l'objectif calculé
  await sophie.ok("annual/goal", { user_id: ids["camille.martin"], period_id: per.id, minutes: null, note: "Retour au planning" });
  assert.deepEqual([(await camille.ok("annual/employee", {})).goal_set, (await camille.ok("annual/employee", {})).objective], [false, 292 * 60 - 120 - 960]);
  // tableau d'équipe : le responsable voit ses salariés annualisés, les RH tout le monde
  const t = await julien.ok("annual/team", {});
  assert.deepEqual([t.period.label, t.rows.map((x) => [x.name, x.cycle, x.objective, x.done]), t.totals.employees], ["Fin 2026", [["Camille Martin", "Alternance 4 / 5 jours", 292 * 60 - 1080, 480]], 1]);
  const tout = await sophie.ok("annual/team", { scope: "all" });
  assert.deepEqual([tout.rows.length, tout.teams, tout.can_edit], [1, ["Admissions"], true]);
  await camille.fail("annual/team", { scope: "all" }, "interdit", 403);
  assert.deepEqual((await camille.ok("annual/team", {})).rows, []);                             // un salarié sans équipe : tableau vide
  // l'autre période, choisie explicitement
  const p27 = (await sophie.ok("annual/periods")).periods[1];
  assert.equal((await camille.ok("annual/employee", { period: p27.id })).period.label, "Année 2027");
  // modifier une période : version contrôlée, et les ajustements déjà passés doivent rester dedans
  await sophie.fail("annual/period-save", { period: { id: per.id, label: "Fin 2026", start_date: "2026-11-16", end_date: "2026-12-31" }, version: per.version }, "annualisation");
  await sophie.ok("annual/period-save", { period: { id: per.id, label: "Fin d'année 2026", start_date: "2026-11-02", end_date: "2026-12-31" }, version: per.version });
  await sophie.fail("annual/period-save", { period: { id: per.id, label: "Conflit", start_date: "2026-11-02", end_date: "2026-12-31" }, version: per.version }, "conflit", 409);
  const j = await sophie.ok("rh/journal", { user_id: ids["camille.martin"] });
  for (const quoi of ["objectif_annuel_fixe", "objectif_annuel_ajuste", "objectif_annuel_retire"]) assert.ok(j.rows.some((e) => e.action === quoi), quoi);
});

test("anomalies liées à l'horaire : calcul, niveaux, acquittement par le responsable", async () => {
  // Camille (horaire J8 : 8 h 45 – 13 h 15, 14 h – 17 h 30) : le mardi 3, arrivée à 9 h 10 et départ à 17 h
  await journee(camille, "2026-11-03", ["09:10", "13:15", "14:00", "17:00"]);
  const m = await camille.ok("my/month", { month: "2026-11" });
  assert.deepEqual(m.days.find((d) => d.date === "2026-11-03").signals.map((x) => [x.kind, x.level]), [["retard", "info"], ["depart_anticipe", "info"], ["presence_insuffisante", "info"]]);
  assert.deepEqual(m.days.find((d) => d.date === "2026-11-02").signals, []);
  const a = await julien.ok("team/anomalies", { month: "2026-11" });
  const de = (rows, nom) => rows.filter((r) => r.name === nom).map((r) => [r.date.slice(8), r.kind]).sort();
  assert.deepEqual(de(a.rows, "Camille Martin"), [["03", "depart_anticipe"], ["03", "presence_insuffisante"], ["03", "retard"], ["04", "vide"], ["05", "vide"]]);
  assert.deepEqual(de(a.rows, "Léo Petit"), [["04", "vide"], ["05", "vide"], ["06", "vide"]]);
  assert.deepEqual(a.counts, { corriger: 5, verifier: 0, info: 3, acquittees: 0 });
  assert.equal(a.rows[0].level, "corriger");                                                    // les plus graves d'abord
  assert.match(a.rows.find((r) => r.kind === "retard").text, /Arrivée à 9 h 10 pour 8 h 45 : 25 min de retard/);
  // acquittement : le responsable de l'équipe ou les RH, jamais le salarié ni un autre responsable
  const infos = a.rows.filter((r) => r.level === "info").map((r) => ({ user_id: r.user_id, day: r.date, kind: r.kind }));
  await camille.fail("team/anomaly-ack", { items: infos }, "interdit", 403);
  await camille.fail("team/anomalies", { month: "2026-11", scope: "all" }, "interdit", 403);
  await julien.fail("team/anomaly-ack", { items: [{ user_id: ids["nadia.benali"], day: "2026-11-03", kind: "retard" }] }, "interdit", 403);
  await julien.fail("team/anomaly-ack", { items: [{ user_id: ids["camille.martin"], day: "2026-11-03", kind: "inconnue" }] }, "requete");
  assert.equal((await julien.ok("team/anomaly-ack", { items: infos, comment: "Rendez-vous médical prévenu" })).done, 3);
  const b = await julien.ok("team/anomalies", { month: "2026-11" });
  assert.deepEqual(b.counts, { corriger: 5, verifier: 0, info: 0, acquittees: 3 });
  const ack = b.rows.find((r) => r.kind === "retard").ack;
  assert.deepEqual([ack.comment, ack.by], ["Rendez-vous médical prévenu", "Julien Bernard"]);
  assert.equal((await sophie.ok("team/anomaly-ack", { items: [infos[0]], undo: true })).done, 1);       // les RH annulent un acquittement
  assert.equal((await sophie.ok("team/anomalies", { month: "2026-11", scope: "all" })).counts.acquittees, 2);
  const jr = await sophie.ok("rh/journal", { user_id: ids["camille.martin"] });
  assert.ok(jr.rows.some((e) => e.action === "anomalies_acquittees" && e.detail.nombre === 3) && jr.rows.some((e) => e.action === "acquittement_annule"));
  // réglages (administrateur) : un type « non signalé » disparaît, une tolérance plus large aussi ; les oublis restent « à corriger »
  await sophie.fail("admin/settings-save", { settings: { anomalies: { late_min: 30 } } }, "interdit", 403);
  await admin.fail("admin/settings-save", { settings: { anomalies: { levels: { retard: "grave" } } } }, "parametre");
  await admin.fail("admin/settings-save", { settings: { anomalies: { late_min: -5 } } }, "parametre");
  await admin.ok("admin/settings-save", { settings: { anomalies: { late_min: 30, levels: { presence_insuffisante: "off", depart_anticipe: "verifier" } } } });
  const c = await julien.ok("team/anomalies", { month: "2026-11" });
  assert.deepEqual(de(c.rows, "Camille Martin"), [["03", "depart_anticipe"], ["04", "vide"], ["05", "vide"]]);
  assert.equal(c.rows.find((r) => r.kind === "depart_anticipe").level, "verifier");
  const regles = (await admin.ok("admin/settings")).settings.anomalies;
  assert.deepEqual([regles.late_min, regles.levels.presence_insuffisante, regles.levels.depart_anticipe], [30, "off", "verifier"]);
  await admin.ok("admin/settings-save", { settings: { anomalies: { late_min: 5, levels: { presence_insuffisante: "info", depart_anticipe: "info" } } } });
  // pauses payées : quinze minutes de la pause pointée comptent comme du travail
  const avant = (await camille.ok("my/month", { month: "2026-11" })).days.find((d) => d.date === "2026-11-03").worked;
  await admin.fail("admin/settings-save", { settings: { break_paid_min: 500 } }, "parametre");
  await admin.ok("admin/settings-save", { settings: { break_paid_min: 15 } });
  assert.equal((await camille.ok("my/month", { month: "2026-11" })).days.find((d) => d.date === "2026-11-03").worked, avant + 15);
  await admin.ok("admin/settings-save", { settings: { break_paid_min: 0 } });
});

test("tableau des présents : en poste, attendus, sans pointage, absents", async () => {
  at("2026-11-09", "09:30");
  await camille.ok("my/punch", { lieu: "teletravail" });
  await sophie.ok("my/absence-request", { user_id: ids["leo.petit"], type: "maladie", start: "2026-11-09", end: "2026-11-10" });
  const p = await julien.ok("team/presence", {});
  assert.deepEqual(p.rows.map((r) => [r.name, r.status, r.since, r.lieu, r.detail, r.until || ""]), [["Camille Martin", "present", "09:30", "teletravail", "", ""], ["Léo Petit", "absent", "", "", "Arrêt maladie", "2026-11-10"]]);
  assert.deepEqual([p.tiles.on_site, p.tiles.remote, p.tiles.absent, p.tiles.expected, p.tiles.total, p.hm], [0, 1, 1, 0, 2, "09:30"]);
  // les RH voient tout le monde : la cadre et le responsable en présence automatique sont « sans pointage », la RH (au pointage) est attendue
  const tout = await sophie.ok("team/presence", { scope: "all" });
  assert.deepEqual(tout.rows.map((r) => [r.name, r.status]), [["Camille Martin", "present"], ["Julien Bernard", "auto"], ["Léo Petit", "absent"], ["Nadia Benali", "auto"], ["Sophie Leroy", "attendu"]]);
  await camille.fail("team/presence", { scope: "all" }, "interdit", 403);
  assert.deepEqual((await camille.ok("team/presence", {})).rows, []);
  // Camille bascule sur site puis s'en va : « sortie » ; avec un horaire à plages, le retard d'un attendu est signalé
  await camille.ok("my/lieu", { day: "2026-11-09", lieu: "bureau" });
  assert.deepEqual([(await julien.ok("team/presence", {})).tiles.on_site, (await julien.ok("team/presence", {})).tiles.remote], [1, 0]);
  at("2026-11-09", "17:30");
  await camille.ok("my/punch", { lieu: "bureau" });
  assert.deepEqual((await julien.ok("team/presence", {})).rows[0].status, "sorti");
  at("2026-11-10", "09:30");
  const lendemain = (await julien.ok("team/presence", {})).rows[0];
  assert.deepEqual([lendemain.name, lendemain.status, lendemain.late, lendemain.detail], ["Camille Martin", "attendu", true, "prévu à 8 h 45"]);
  // le mercredi 11 novembre est férié : personne n'est attendu
  at("2026-11-11", "10:00");
  assert.deepEqual((await sophie.ok("team/presence", { scope: "all" })).rows.filter((r) => r.status !== "repos").map((r) => r.name), []);
});

test("clôture : le planning entre dans l'empreinte du mois, puis il est figé avec lui", async () => {
  at("2026-12-01", "10:00");
  // l'empreinte change dès qu'une exception du mois change
  const fp0 = sql("select kokolio._month_fingerprint('2026-11')");
  await julien.ok("plan/set", { items: [{ user_id: ids["camille.martin"], day: "2026-11-27", minutes: 0, label: "Pont" }] });
  const fp1 = sql("select kokolio._month_fingerprint('2026-11')");
  assert.notEqual(fp0, fp1);
  await sophie.ok("plan/model-save", { model: { code: "N8", label: "Nuit 8 h", minutes: 470, ranges: [["21:00", "29:00"]] } });
  assert.notEqual(fp1, sql("select kokolio._month_fingerprint('2026-11')"));
  // on valide tout ce qui attend, puis on clôture novembre
  for (const who of ["camille.martin", "leo.petit"]) {
    const p = await sophie.ok("team/pending", { scope: "all", user_id: ids[who] });
    await sophie.ok("team/decide-days", { decision: "valide", items: p.groups[0].days.map((d) => ({ id: d.id, version: d.version })) });
  }
  const pend = await sophie.ok("team/pending", { scope: "all" });
  for (const a of pend.absences) await sophie.ok("team/decide-absence", { id: a.id, decision: "valide", version: a.version });
  const chk = await sophie.ok("rh/closure-check", { month: "2026-11" });
  assert.deepEqual([chk.pending_days, chk.pending_absences], [0, 0]);
  const fige = await sophie.ok("rh/close", { month: "2026-11" });
  assert.equal(fige.version, 1);
  const snap = (await sophie.ok("rh/closure-detail", { month: "2026-11", version: 1 })).snapshot;
  const emp = (n) => snap.employees.find((e) => e.name === n);
  // Camille : cycle (4 j, 5 j dont le férié du 11 et un vendredi matin, 4 j, 5 j) moins le pont du 27 ; Nadia : jours comptés d'office
  assert.equal(emp("Camille Martin").theo, 480 * 4 + (480 * 3 + 240) + 480 * 4 + 480 * 4 + 480);
  assert.deepEqual([emp("Nadia Benali").days_worked, emp("Nadia Benali").empty_days.length], [19.5, 0]);
  assert.deepEqual([emp("Léo Petit").abs_days, emp("Léo Petit").absences.map((x) => x.days)], [7, [2, 5]]);       // deux jours d'arrêt, puis la semaine de congé décomptée cinq jours
  // mois clôturé : planning figé, par l'outil comme en base
  await julien.fail("plan/set", { items: [{ user_id: ids["leo.petit"], day: "2026-11-24", minutes: 0 }] }, "cloture", 409);
  await julien.fail("plan/set", { items: [{ user_id: ids["leo.petit"], day: "2026-11-03", clear: true }] }, "cloture", 409);
  assert.match(sqlFails("update kokolio.plan_days set minutes = 1 where day = '2026-11-03'"), /KK:cloture/);
  assert.match(sqlFails("delete from kokolio.plan_days where day = '2026-11-03'"), /KK:cloture/);
  assert.equal(cellule(await grille(julien, { from: "2026-11-23" }), "leo.petit", "2026-11-24").closed, true);
  // un horaire journalier et un cycle qui ont servi dans ce mois ne changent plus de durée ni de composition
  const l = await sophie.ok("plan/lib");
  assert.deepEqual(l.cycles.map((c) => [c.name, c.locked]), [["Alternance 4 / 5 jours", true], ["Semaine 35 h", false]]);
  assert.deepEqual(l.models.map((m) => [m.code, m.locked]), [["J7", false], ["J8", true], ["M4", true], ["N8", false]]);
  await sophie.fail("plan/model-save", { model: { code: "J8", label: "Journée 8 h", minutes: 450 } }, "cloture", 409);
  await sophie.ok("plan/model-save", { model: { code: "J8", label: "Journée de 8 heures", minutes: 480, ranges: [["08:30", "13:00"], ["14:00", "17:30"]], color: "violet" } });   // nom et plages : permis
  await sophie.fail("plan/cycle-save", { cycle: { id: lib.alternance, name: "Alternance 4 / 5 jours", weeks: [["J8", "J8", "J8", "J8", "J8", null, null]] } }, "cloture", 409);
  await sophie.ok("plan/cycle-save", { cycle: { id: lib.alternance, name: "Alternance 4 / 5 jours (2026)", weeks: [["J8", "J8", "J8", "J8", null, null, null], ["J8", "J8", "J8", "J8", "M4", null, null]], active: false } });
  // le début de suivi ne se déplace plus à travers un mois clôturé
  await sophie.fail("rh/employee-save", { id: ids["leo.petit"], login: "leo.petit", first_name: "Léo", last_name: "Petit", matricule: "0015", manager_id: ids["julien.bernard"], entry_date: "2025-01-06", tracked_from: "2026-11-20" }, "cloture", 409);
  // un cycle désactivé ne s'attribue plus ; un nouveau cycle s'attribue à partir du mois ouvert
  await sophie.fail("rh/contract", { user_id: ids["leo.petit"], start_date: "2026-12-01", contract: { ...H35, cycle_id: lib.alternance } }, "horaire");
  await sophie.fail("rh/contract", { user_id: ids["leo.petit"], start_date: "2026-11-16", contract: { ...H35, cycle_id: lib.s35 } }, "cloture", 409);
  const r = await sophie.ok("rh/contract", { user_id: ids["leo.petit"], start_date: "2026-12-01", contract: { ...H35, cycle_id: lib.s35 } });
  assert.equal(r.contract.cycle_anchor, "2026-11-30");
  // les chiffres de novembre affichés restent ceux de la clôture
  assert.equal((await camille.ok("my/month", { month: "2026-11" })).summary.theo, emp("Camille Martin").theo);
});

test("journées qui passent minuit : le départ du lendemain ferme la journée de la veille", async () => {
  // fonction désactivée par défaut : une heure au-delà de 24 h est refusée
  at("2026-12-02", "08:00");
  await leo.fail("my/correct", { day: "2026-12-01", times: ["21:00", "25:30"], lieu: "bureau", comment: "Nuit" }, "heures");
  await admin.fail("admin/settings-save", { settings: { night_until: "14:00" } }, "parametre");
  await admin.ok("admin/settings-save", { settings: { night_until: "05:00" } });
  assert.equal((await leo.ok("boot")).settings.night_until, "05:00");
  at("2026-12-02", "21:00");
  assert.equal((await leo.ok("my/punch", { lieu: "bureau" })).punched.kind, "arrivee");
  // à 1 h du matin, la journée de la veille est toujours « en cours » : ni oubli de départ, ni nouvelle journée
  at("2026-12-03", "01:00");
  const t = await leo.ok("my/today");
  assert.deepEqual([t.today, t.day_date, t.night, t.open_since, t.anomalies.filter((a) => a.kind === "depart").length], ["2026-12-03", "2026-12-02", true, "21:00", 0]);
  assert.equal((await julien.ok("team/month", { month: "2026-12" })).rows.find((r) => r.name === "Léo Petit").present, true);
  at("2026-12-03", "01:30");
  const p = await leo.ok("my/punch", { lieu: "bureau" });
  assert.deepEqual([p.punched.kind, p.punched.hm], ["depart", "01:30"]);
  assert.equal(sql(`select times::text from kokolio.days where user_id = '${ids["leo.petit"]}' and day = '2026-12-02'`), "{21:00,25:30}");
  assert.equal(sql(`select count(*) from kokolio.days where user_id = '${ids["leo.petit"]}' and day = '2026-12-03'`), "0");
  const m = await leo.ok("my/month", { month: "2026-12" });
  assert.deepEqual([m.days.find((d) => d.date === "2026-12-02").worked, m.days.find((d) => d.date === "2026-12-02").times], [270, ["21:00", "25:30"]]);
  const log = await leo.ok("punch-log", { day: "2026-12-02" });
  assert.deepEqual(log.punches.map((x) => [x.kind, x.hhmm]), [["arrivee", "21:00"], ["depart", "25:30"]]);
  // correction : une heure du lendemain est acceptée jusqu'à l'heure limite, jamais dans le futur
  await leo.fail("my/correct", { day: "2026-12-02", times: ["21:00", "26:00"], lieu: "bureau", comment: "Départ plus tard" }, "heures");      // 2 h : pas encore passé
  at("2026-12-03", "09:00");
  await leo.ok("my/correct", { day: "2026-12-02", times: ["21:00", "26:00"], lieu: "bureau", comment: "Départ plus tard" });
  await leo.fail("my/correct", { day: "2026-12-02", times: ["21:00", "30:00"], lieu: "bureau", comment: "Trop tard" }, "heures");               // au-delà de 5 h
  // un départ oublié la veille n'est pas pris pour une nuit de travail : seize heures au plus entre l'arrivée et ce départ
  await camille.ok("my/punch", { lieu: "bureau" });                      // arrivée à 9 h le 3, départ jamais pointé
  at("2026-12-04", "04:00");
  const c = await camille.ok("my/punch", { lieu: "bureau" });
  assert.equal(c.punched.kind, "arrivee");
  assert.equal(sql(`select times::text from kokolio.days where user_id = '${ids["camille.martin"]}' and day = '2026-12-04'`), "{04:00}");
  at("2026-12-04", "06:00");
  assert.ok((await camille.ok("my/today")).anomalies.some((a) => a.date === "2026-12-03" && a.kind === "depart"));
});

test("import : début de suivi, présence et cycle à la création", async () => {
  at("2026-12-04", "10:00");
  const texte = "identifiant;nom;prenom;matricule;equipe;responsable;date_entree;regime;heures_hebdo;debut_suivi;presence;cycle\n"
    + "zoe.durand;Durand;Zoé;0050;Pédagogie;sophie.leroy;01/12/2026;horaire;35;01/01/2027;;Semaine 35 h\n"
    + "marc.cadre;Cadre;Marc;0051;Direction;sophie.leroy;01/12/2026;forfait;;;automatique;\n";
  const vu = await sophie.ok("rh/import-preview", { text: texte + "x.y;Y;X;;;;;horaire;35;;;Cycle inconnu\n" });
  assert.deepEqual(vu.rows.map((r) => [r.login, r.tracked_from, r.presence, r.cycle, r.errors.length]), [["zoe.durand", "2027-01-01", "pointage", "Semaine 35 h", 0], ["marc.cadre", null, "automatique", "", 0], ["x.y", null, "pointage", "", 1]]);
  const r = await sophie.ok("rh/import", { text: texte });
  assert.equal(r.created.length, 2);
  const liste = (await sophie.ok("rh/employees")).employees;
  const zoe = liste.find((e) => e.login === "zoe.durand"), marc = liste.find((e) => e.login === "marc.cadre");
  assert.deepEqual([zoe.tracked_from, zoe.cycle, zoe.presence, zoe.weekly_minutes], ["2027-01-01", "Semaine 35 h", "pointage", 2100]);
  assert.deepEqual([marc.tracked_from, marc.cycle, marc.presence, marc.regime], [null, "", "automatique", "forfait_jours"]);
  // rien n'est attendu de Zoé avant le 1er janvier : absente de la synthèse de décembre
  assert.ok(!(await sophie.ok("team/month", { month: "2026-12", scope: "all" })).rows.some((x) => x.name === "Zoé Durand"));
});

test("autodiagnostic et journal toujours intègres", async () => {
  const st = await admin.ok("admin/selftest");
  assert.equal(st.ok, true, JSON.stringify(st.checks.filter((c) => !c.ok)));
  assert.equal(st.count, 51);
  const v = await sophie.ok("rh/journal-verify", {});
  assert.equal(v.ok, true);
});
