// Organigramme, validation côté RH, simulation d'activité : joués contre une vraie base PostgreSQL locale, les deux environnements installés.
// Ce qui est vérifié : l'organigramme ne montre que les responsables ; les RH ne voient par défaut que ce qui leur revient ;
// la simulation n'existe que dans le test (ou en mode démonstration), ne touche que des fiches jamais activées, crée la veille,
// avance sans doublon quel que soit le rythme des passages, et laisse la production intacte.
// Lancement : node --test tests/kokolio/sim.test.mjs   (PostgreSQL 16 requis, voir pg-local.sh)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "..");
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "postgres", "-d", "kokolio_test", "-v", "ON_ERROR_STOP=1", "-qAt"];
const sql = (q) => execFileSync("psql", [...PG, "-c", q], { encoding: "utf8" }).trim();
const PORT = 54395;
let handle, fake, clock = "2026-11-24T08:00:00Z";
const paris = (jour, hm) => { clock = new Date(`${jour}T${hm}:00+01:00`).toISOString(); };

const ENVS = { production: { api: "/api/kokolio/", cookie: "kk_session" }, test: { api: "/api/kokolio-test/", cookie: "kkt_session" } };
class Client {
  constructor(env, name) { this.env = env; this.name = name; this.cookie = ""; }
  async call(route, body = {}) {
    const e = ENVS[this.env];
    const headers = { "content-type": "application/json", "x-forwarded-host": "kokolio.test", "x-forwarded-proto": "https", origin: "https://kokolio.test",
      "x-kokolio": "1", "x-real-ip": "10.0.0.7", "user-agent": "test/" + this.name, "x-kk-test-now": clock };
    if (this.cookie) headers.cookie = this.cookie;
    const res = await handle(new Request("https://kokolio.test" + e.api + route, { method: "POST", headers, body: JSON.stringify(body) }), route, this.env);
    for (const c of res.headers.getSetCookie()) { const m = c.match(/^(kkt?_session)=([^;]*)/); if (m) this.cookie = m[2] ? `${m[1]}=${m[2]}` : ""; }
    return { status: res.status, ...(await res.json()) };
  }
  async ok(route, body) { const r = await this.call(route, body); assert.equal(r.ok, true, `${this.env} ${route} → ${r.code} ${r.message} ${r.debug || ""}`); return r.data ?? r; }
  async fail(route, body, code, status) { const r = await this.call(route, body); assert.equal(r.ok, false, `${route} aurait dû échouer`); assert.equal(r.code, code, `${route} → ${r.code} ${r.message}`); if (status) assert.equal(r.status, status); return r; }
}
const MDP = "Tableau-Bleu-2026";
const adminP = new Client("production", "admin"), adminT = new Client("test", "admin"), visiteurT = new Client("test", "visiteur"), visiteurP = new Client("production", "visiteur");
// Jusqu'à ce que la simulation soit à jour : comme le fait la page de l'administrateur.
async function avancer(c = visiteurT) {
  const bilan = { faits: {}, refus: {}, appels: 0 };
  for (let i = 0; i < 30; i++) {
    const r = await c.ok("sim/tick"); bilan.appels++; bilan.on = r.on;
    for (const [k, n] of Object.entries(r.faits || {})) bilan.faits[k] = (bilan.faits[k] || 0) + n;
    for (const [k, n] of Object.entries(r.refus || {})) bilan.refus[k] = (bilan.refus[k] || 0) + n;
    if (!r.due || !r.passages) break;
  }
  return bilan;
}
const n = (q) => +sql(q);

// Une entreprise de 31 personnes : une directrice, trois responsables d'équipe, 27 salariés (9 par équipe), tous à 35 h, suivis depuis le 25 novembre.
const lignes = ["nom;prenom;matricule;equipe;poste;matricule_responsable;date_entree;regime;heures_hebdo;debut_suivi", "Direction;Dora;D01;Direction;Directrice générale;;01/01/2020;horaire;35;25/11/2026"];
for (let e = 1; e <= 3; e++) {
  lignes.push(`Chef${e};Resp;R0${e};Équipe ${e};Responsable d'équipe;D01;01/01/2021;horaire;35;25/11/2026`);
  for (let k = 1; k <= 9; k++) lignes.push(`Equipe${e};Sal${k};S${e}${k};Équipe ${e};Conseiller;R0${e};01/01/2023;horaire;35;25/11/2026`);
}
let codes = {};

before(async () => {
  execFileSync("bash", [path.join(HERE, "pg-local.sh"), "reset"], { stdio: "ignore" });
  execFileSync("psql", [...PG, "-f", path.join(ROOT, "supabase/kokolio/install.sql")], { stdio: "ignore" });
  execFileSync("psql", [...PG, "-f", path.join(ROOT, "supabase/kokolio/install-test.sql")], { stdio: "ignore" });
  sql("insert into kokolio.meta (key, value) values ('test_mode', 'true'::jsonb)");
  fake = spawn("node", [path.join(HERE, "fake-postgrest.mjs")], { env: { ...process.env, FAKE_PGRST_PORT: String(PORT) }, stdio: ["ignore", "pipe", "inherit"] });
  await new Promise((r) => fake.stdout.once("data", r));
  Object.assign(process.env, { SUPABASE_URL: `http://127.0.0.1:${PORT}`, SUPABASE_SERVICE_ROLE_KEY: "test-service-key", KOKOLIO_TEST_HOOKS: "1" });
  ({ handle } = await import(path.join(ROOT, "lib/kokolio/server/handle.mjs")));
});
after(() => fake?.kill());

test("import par matricule du responsable, puis organigramme : la structure, pas la liste des salariés", async () => {
  const code = sql("select kokolio.bootstrap_admin('admin')");
  await adminP.ok("auth/activate", { login: "admin", code, password: MDP });
  await adminP.ok("admin/settings-save", { settings: { go_live: "2026-11-02" } });
  const imp = await adminP.ok("rh/import", { text: lignes.join("\n") });
  assert.equal(imp.created.length, 31);
  codes = Object.fromEntries(imp.created.map((c) => [c.login, c.code]));
  assert.equal(n("select count(*) from kokolio.users where manager_id is not null"), 30);
  assert.equal(sql("select m.login from kokolio.users u join kokolio.users m on m.id = u.manager_id where u.matricule = 'S25'"), "resp.chef2");
  // vu par un salarié de l'équipe 2 : la directrice et les trois responsables, sa propre ligne, aucun collègue nommé
  const s25 = new Client("production", "s25");
  await s25.ok("auth/activate", { login: "sal5.equipe2", code: codes["sal5.equipe2"], password: "Girafe!Verte42" });
  const o = await s25.ok("org/chart");
  assert.deepEqual(o.nodes.map((x) => [x.name, x.job, x.direct, x.total]), [["Dora Direction", "Directrice générale", 3, 30], ["Resp Chef1", "Responsable d'équipe", 9, 9], ["Resp Chef2", "Responsable d'équipe", 9, 9], ["Resp Chef3", "Responsable d'équipe", 9, 9]]);
  assert.equal(o.total, 32);   // 31 fiches et le compte administrateur
  assert.deepEqual(o.chain.length, 2);
  assert.deepEqual([o.nodes.find((x) => x.id === o.chain[0]).name, o.nodes.find((x) => x.id === o.chain[1]).name], ["Resp Chef2", "Dora Direction"]);
  assert.equal(o.me.name, "Sal5 Equipe2");
  assert.ok(!JSON.stringify(o.nodes).includes("Sal"), "aucun salarié sans équipe n'apparaît dans l'organigramme");
  assert.ok(!("login" in o.nodes[0]) && !("matricule" in o.nodes[0]) && !("email" in o.nodes[0]));
  // sans session : rien
  await visiteurP.fail("org/chart", {}, "session", 401);
  // un salarié sorti ou désactivé ne compte plus dans l'effectif de son responsable
  sql("update kokolio.users set exit_date = '2026-11-20' where matricule = 'S19'; update kokolio.users set disabled = true where matricule = 'S18'");
  assert.deepEqual((await adminP.ok("org/chart")).nodes.find((x) => x.name === "Resp Chef1").total, 7);
  sql("update kokolio.users set exit_date = null where matricule = 'S19'; update kokolio.users set disabled = false where matricule = 'S18'");
  // une boucle de rattachements (A sous B, B sous A) ne bloque pas l'organigramme
  sql("update kokolio.users set manager_id = (select id from kokolio.users where matricule = 'R01') where matricule = 'D01'");
  assert.ok((await adminP.ok("org/chart")).nodes.length >= 4);
  sql("update kokolio.users set manager_id = null where matricule = 'D01'");
});

test("validation côté RH : par défaut ce qui leur revient, le reste attend chez les responsables", async () => {
  // deux journées en attente : celle de la directrice (sans responsable) et celle d'un salarié de l'équipe 1
  paris("2026-11-25", "09:00");
  const dora = new Client("production", "dora"), s11 = new Client("production", "s11"), chef1 = new Client("production", "chef1");
  await dora.ok("auth/activate", { login: "dora.direction", code: codes["dora.direction"], password: "Cactus#Mauve77" });
  await s11.ok("auth/activate", { login: "sal1.equipe1", code: codes["sal1.equipe1"], password: "Lampe+Orange58" });
  await chef1.ok("auth/activate", { login: "resp.chef1", code: codes["resp.chef1"], password: "Bateau-Rouge-19" });
  await dora.ok("my/punch", {}); await s11.ok("my/punch", {});
  paris("2026-11-25", "17:30"); await dora.ok("my/punch", {}); await s11.ok("my/punch", {});
  await s11.ok("my/absence-request", { type: "cp", start: "2026-12-21", end: "2026-12-22" });
  await dora.ok("my/absence-request", { type: "cp", start: "2026-12-23", end: "2026-12-23" });
  paris("2026-11-26", "08:00");
  const rh = await adminP.ok("team/pending", { scope: "rh" }), tout = await adminP.ok("team/pending", { scope: "all" });
  assert.deepEqual([rh.scope, rh.summary.map((x) => x.name), rh.absences.map((a) => a.name), rh.total_days], ["rh", ["Dora Direction"], ["Dora Direction"], 1]);
  assert.deepEqual([tout.scope, tout.summary.map((x) => x.name).sort(), tout.absences.length, tout.total_days], ["all", ["Dora Direction", "Sal1 Equipe1"], 2, 2]);
  assert.equal(rh.encadres, 30);
  // le responsable de l'équipe 1 voit la sienne ; un salarié ne voit ni l'une ni l'autre
  const e1 = await chef1.ok("team/pending", {});
  assert.deepEqual([e1.groups.map((g) => g.name), e1.absences.map((a) => a.name)], [["Sal1 Equipe1"], ["Sal1 Equipe1"]]);
  await s11.fail("team/pending", { scope: "rh" }, "interdit", 403);
  await chef1.fail("team/pending", { scope: "rh" }, "interdit", 403);
  // un responsable parti : son équipe revient aux RH
  sql("update kokolio.users set exit_date = '2026-11-25' where matricule = 'R01'");
  assert.deepEqual((await adminP.ok("team/pending", { scope: "rh" })).summary.map((x) => x.name).sort(), ["Dora Direction", "Sal1 Equipe1"]);
  sql("update kokolio.users set exit_date = null where matricule = 'R01'");
  // les RH décident pour la directrice ; le salarié reste chez son responsable
  await adminP.ok("team/decide-absence", { id: rh.absences[0].id, decision: "valide", version: rh.absences[0].version });
  assert.equal((await adminP.ok("team/pending", { scope: "rh" })).absences.length, 0);
});

test("simulation : refusée en production hors démonstration ; dans le test, la veille est créée et seuls les comptes jamais activés pointent", async () => {
  paris("2026-11-26", "10:30");
  // production, sans mode démonstration : pas de simulation
  await adminP.fail("admin/sim", { on: true }, "etat");
  assert.deepEqual([(await adminP.ok("admin/sim")).allowed, (await visiteurP.ok("sim/tick")).on], [false, false]);
  assert.equal((await visiteurP.ok("public/info")).simulation, false);
  // copie vers le test, où elle est permise ; un salarié ne peut pas la mettre en marche
  await adminP.ok("admin/test-clone", { confirm: "COPIER" });
  await adminT.ok("auth/login", { login: "admin", password: MDP });
  const s25 = new Client("test", "s25"); await s25.ok("auth/login", { login: "sal5.equipe2", password: "Girafe!Verte42" });
  await s25.fail("admin/sim", { on: true }, "interdit", 403); await s25.fail("admin/sim", {}, "interdit", 403);
  let st = await adminT.ok("admin/sim");
  assert.deepEqual([st.allowed, st.on, st.environment, st.candidates], [true, false, "test", 27]);   // 31 fiches moins les quatre comptes activés
  assert.equal((await visiteurT.ok("sim/tick")).on, false);
  st = await adminT.ok("admin/sim", { on: true });
  assert.deepEqual([st.on, st.enrolled, st.state.by, st.state.last, st.state.since], [true, 27, "admin", "2026-11-24T23:00:00.000Z", "2026-11-25"]);
  assert.equal((await visiteurT.ok("public/info")).simulation, true);
  assert.ok(!("by_id" in st.state));
  // le passage est ouvert à tous (ici sans session) et ne renvoie que des compteurs
  const b = await avancer();
  assert.ok(b.faits.punch > 100, JSON.stringify(b));
  assert.deepEqual(Object.keys(b.faits).filter((k) => !["punch", "absence", "absence_rh", "correct", "decide_days", "decide_absence"].includes(k)), []);
  // la veille : une journée pour chaque fiche simulée, sauf absents ; rien pour les quatre comptes activés (leurs journées sont les leurs)
  const simules = "(select id from kokolio_test.users where pw_hash is null and role = 'salarie')";
  const hier = n(`select count(*) from kokolio_test.days where day = '2026-11-25' and user_id in ${simules}`);
  const absentsHier = n(`select count(distinct user_id) from kokolio_test.absences where start_date <= '2026-11-25' and end_date >= '2026-11-25' and status in ('valide', 'en_attente')`);
  assert.ok(hier >= 27 - absentsHier - 2 && hier <= 27 - absentsHier, `${hier} journées hier pour 27 fiches simulées, ${absentsHier} absents`);
  assert.equal(n("select count(*) from kokolio_test.punch_log l join kokolio_test.users u on u.id = l.user_id where u.pw_hash is not null and l.ip = 'simulation'"), 0, "aucun compte activé n'est simulé");
  assert.equal(n("select count(*) from kokolio_test.punch_log where ip = 'simulation'"), n("select count(*) from kokolio_test.punch_log") - 4, "tous les pointages sauf les quatre faits à la main");
  // les journées d'hier sont terminées (à un départ oublié près), celles d'aujourd'hui sont en cours ; chaque pointage a sa trace, à son heure
  assert.ok(n("select count(*) from kokolio_test.days where day = '2026-11-25' and array_length(times, 1) % 2 = 1") <= 3);
  assert.ok(n("select count(*) from kokolio_test.days where day = '2026-11-26' and array_length(times, 1) = 1") >= 15);
  assert.equal(n("select count(*) from kokolio_test.days d where coalesce(array_length(d.times, 1), 0) <> (select count(*) from kokolio_test.punch_log l where l.user_id = d.user_id and l.day = d.day)"), 0);
  assert.equal(n("select count(*) from kokolio_test.punch_log l where l.ip = 'simulation' and to_char(l.ts at time zone 'Europe/Paris', 'YYYY-MM-DD HH24:MI') <> l.day || ' ' || l.hhmm"), 0);
  assert.equal(n("select count(*) from kokolio_test.punch_log where ts > '2026-11-26T09:30:00Z'"), 0, "rien dans le futur");
  // la production n'a rien reçu
  assert.equal(n("select count(*) from kokolio.punch_log"), 4);
  assert.equal(sql("select count(*) from kokolio.meta where key = 'simulation'"), "0");
});

test("simulation : aucun doublon quel que soit le rythme des passages ; la journée se termine pour tout le monde", async () => {
  const avant = n("select count(*) from kokolio_test.punch_log");
  // un passage dans la même minute, puis deux minutes après : rien à faire (cinq minutes au moins entre deux passages)
  assert.deepEqual([(await visiteurT.ok("sim/tick")).due, n("select count(*) from kokolio_test.punch_log")], [false, avant]);
  paris("2026-11-26", "10:32"); assert.equal((await visiteurT.ok("sim/tick")).due, false);
  // deux passages lancés au même instant : un seul avance
  paris("2026-11-26", "12:40");
  const [a, b] = await Promise.all([visiteurT.ok("sim/tick"), new Client("test", "autre").ok("sim/tick")]);
  assert.ok(a.passages + b.passages >= 1);
  const midi = n("select count(*) from kokolio_test.punch_log");
  assert.ok(midi > avant);
  assert.equal(n("select count(*) from (select user_id, ts from kokolio_test.punch_log group by 1, 2 having count(*) > 1) x"), 0, "aucun pointage joué deux fois");
  // la fin de journée, puis un passage tardif
  for (const hm of ["14:10", "16:05", "17:45", "19:30", "22:00"]) { paris("2026-11-26", hm); await avancer(); }
  const ouvertes = n("select count(*) from kokolio_test.days d join kokolio_test.users u on u.id = d.user_id where d.day = '2026-11-26' and u.pw_hash is null and array_length(d.times, 1) % 2 = 1");
  assert.ok(ouvertes <= 3, `${ouvertes} journées restées ouvertes (départs oubliés)`);
  assert.equal(n("select count(*) from kokolio_test.days where times <> (select array_agg(t order by t) from unnest(times) t)"), 0);
  assert.equal(n("select count(*) from (select kind, lag(kind) over (partition by user_id, day order by ts, id) avant from kokolio_test.punch_log) x where kind = avant"), 0, "arrivées et départs alternés");
  // le temps fait est plausible : entre 6 h et 8 h pour une journée complète à 35 h
  const fait = sql(`select min(m) || ' ' || max(m) from (select (select sum((split_part(times[i + 1], ':', 1)::int * 60 + split_part(times[i + 1], ':', 2)::int) - (split_part(times[i], ':', 1)::int * 60 + split_part(times[i], ':', 2)::int))
      from generate_series(1, array_length(times, 1) - 1, 2) i) m from kokolio_test.days d join kokolio_test.users u on u.id = d.user_id where d.day = '2026-11-26' and u.pw_hash is null and array_length(times, 1) = 4) x`).split(" ").map(Number);
  assert.ok(fait[0] >= 380 && fait[1] <= 460, `temps fait entre ${fait[0]} et ${fait[1]} minutes`);
});

test("simulation : le lendemain, les responsables simulés valident ; l'équipe d'un responsable réel l'attend", async () => {
  // dans la vraie simulation, un responsable sur cinq ne valide pas le jour même ; ici, pour un essai qui ne dépende pas du tirage, tous le font
  const { REGLAGES } = await import(path.join(ROOT, "lib/kokolio/engine/simulation.mjs"));
  const habitude = REGLAGES.responsable_actif; REGLAGES.responsable_actif = 1;
  paris("2026-11-27", "12:30");
  const b = await avancer();
  REGLAGES.responsable_actif = habitude;
  assert.ok(b.faits.punch > 20, JSON.stringify(b));
  // équipes 2 et 3 : responsables simulés → s'il est là ce matin, il a validé toutes les journées terminées de son équipe ; sinon, elles l'attendent
  // (une journée complétée ce matin par son salarié, après un départ oublié, attend le passage suivant du responsable : on ne la compte pas)
  const etat = (equipe) => sql(`select count(*) filter (where d.status = 'valide') || '/' || count(*) from kokolio_test.days d join kokolio_test.users u on u.id = d.user_id where u.team = 'Équipe ${equipe}' and u.job = 'Conseiller' and d.day = '2026-11-26' and array_length(d.times, 1) % 2 = 0 and not d.corrected`);
  const arrive = (mat) => n(`select count(*) from kokolio_test.punch_log l join kokolio_test.users u on u.id = l.user_id where u.matricule = '${mat}' and l.day = '2026-11-27'`) > 0;
  const valideur = (mat) => n(`select count(*) from kokolio_test.audit a join kokolio_test.users u on u.id = a.actor where a.action = 'pointages_valides' and a.ip = 'simulation' and u.matricule = '${mat}'`);
  let actifs = 0;
  for (const e of [2, 3]) {
    const [v, t] = etat(e).split("/").map(Number), la = arrive(`R0${e}`);
    assert.ok(t >= 5, `équipe ${e} : ${t} journées terminées la veille`);
    assert.equal(v, la ? t : 0, `équipe ${e} : ${v}/${t} validées, responsable ${la ? "présent" : "absent"} ce matin`);
    assert.equal(valideur(`R0${e}`) >= 1, la);
    if (la) actifs++;
  }
  assert.equal(b.faits.decide_days || 0, actifs);
  // un responsable ne valide pas avant d'être arrivé
  assert.ok(n("select count(*) from kokolio_test.days d join kokolio_test.users m on m.id = d.decided_by where d.status = 'valide' and m.pw_hash is null") >= 5 || actifs === 0,
    JSON.stringify([b, actifs, etat(2), etat(3), sql("select string_agg(u.matricule || ':' || a.type_code || ':' || a.start_date || '>' || a.end_date || ':' || a.status, ' ') from kokolio_test.absences a join kokolio_test.users u on u.id = a.user_id where u.matricule like 'R0%'")]));
  assert.equal(n(`select count(*) from kokolio_test.days d join kokolio_test.users m on m.id = d.decided_by
    where d.status = 'valide' and m.pw_hash is null and coalesce(d.decided_at < (select min(l.ts) from kokolio_test.punch_log l where l.user_id = m.id
      and l.day = (d.decided_at at time zone 'Europe/Paris')::date), true)`), 0);
  // équipe 1 : son responsable a activé son compte → la simulation ne décide rien à sa place
  assert.equal(+etat(1).split("/")[0], 0);
  assert.equal(n("select count(*) from kokolio_test.days d join kokolio_test.users u on u.id = d.user_id where u.team = 'Équipe 1' and d.status = 'valide'"), 0);
  // les décisions sont au journal au nom des responsables simulés ; aucun compte activé n'y figure à ce titre ; le journal reste vérifiable
  assert.equal(n("select count(*) from kokolio_test.audit a join kokolio_test.users u on u.id = a.actor where a.ip = 'simulation' and u.pw_hash is not null and a.action <> 'absence_saisie_par_rh'"), 0);
  assert.equal((await adminT.ok("rh/journal-verify", {})).ok, true);
  // côté RH du test : presque rien ne leur revient (la directrice a activé son compte en production ; ses journées sont à elle)
  const rh = await adminT.ok("team/pending", { scope: "rh" }), tout = await adminT.ok("team/pending", { scope: "all" });
  assert.ok(rh.total_days <= 2 && tout.total_days > rh.total_days + 10, `RH : ${rh.total_days}, tout : ${tout.total_days}`);
  // une fiche importée après la mise en marche n'est pas simulée ; une fiche activée entre-temps ne l'est plus
  await adminT.ok("rh/import", { text: "nom;prenom;matricule;date_entree;regime;heures_hebdo\nNouveau;Nina;N01;01/11/2026;horaire;35" });
  const s31 = new Client("test", "s31"); await s31.ok("auth/activate", { login: "sal1.equipe3", code: codes["sal1.equipe3"], password: "Lampe+Orange58" });
  const avant = n("select count(*) from kokolio_test.punch_log l join kokolio_test.users u on u.id = l.user_id where u.matricule = 'S31'");
  paris("2026-11-27", "19:30"); await avancer();
  assert.equal(n("select count(*) from kokolio_test.days d join kokolio_test.users u on u.id = d.user_id where u.matricule = 'N01'"), 0);
  assert.equal(n("select count(*) from kokolio_test.punch_log l join kokolio_test.users u on u.id = l.user_id where u.matricule = 'S31'"), avant);
  assert.equal((await adminT.ok("admin/sim")).enrolled, 26);
});

test("simulation : arrêt, reprise sans rattrapage, fin avec le mode démonstration", async () => {
  paris("2026-11-27", "20:00");
  let st = await adminT.ok("admin/sim", { on: false });
  assert.deepEqual([st.on, typeof st.state.stopped_at], [false, "string"]);
  assert.equal((await visiteurT.ok("public/info")).simulation, false);
  // arrêtée : le temps passe (un week-end), rien ne se joue
  paris("2026-11-30", "11:00");
  const fige = n("select count(*) from kokolio_test.punch_log");
  assert.deepEqual([(await visiteurT.ok("sim/tick")).on, n("select count(*) from kokolio_test.punch_log")], [false, fige]);
  // reprise : à partir de maintenant, sans rejouer le lundi matin déjà passé
  st = await adminT.ok("admin/sim", { on: true });
  assert.deepEqual([st.on, st.state.last], [true, "2026-11-30T10:00:00.000Z"]);
  await avancer();
  assert.equal(n("select count(*) from kokolio_test.punch_log where ts >= '2026-11-27T19:00:00Z' and ts < '2026-11-30T10:00:00Z'"), 0);
  paris("2026-11-30", "13:30"); await avancer();
  assert.ok(n("select count(*) from kokolio_test.punch_log where ts >= '2026-11-30T10:00:00Z'") > 10);
  assert.deepEqual(await adminT.ok("rh/journal", { action: "simulation_activee" }).then((j) => j.rows.length), 2);
  // en production : permise seulement pendant le mode démonstration, et elle s'en va avec lui
  sql("insert into kokolio.meta (key, value) values ('demo', '{}'::jsonb)");
  st = await adminP.ok("admin/sim", { on: true });
  assert.deepEqual([st.allowed, st.on, st.enrolled], [true, true, 27]);
  sql("delete from kokolio.meta where key = 'demo'");
  assert.deepEqual([(await adminP.ok("admin/sim")).allowed, (await visiteurP.ok("sim/tick")).on, (await visiteurP.ok("public/info")).simulation], [false, false, false]);
  assert.equal(n("select count(*) from kokolio.punch_log where ip = 'simulation'"), 0);
  // l'autodiagnostic passe dans les deux environnements, simulation comprise
  const t = await adminP.ok("admin/selftest"), tt = await adminT.ok("admin/selftest");
  assert.deepEqual([t.ok, tt.ok, t.count, tt.count], [true, true, 51, 51], JSON.stringify([...t.checks, ...tt.checks].filter((c) => !c.ok)));
  assert.ok(t.checks.some((c) => c.name === "Simulation d'activité impossible en production hors mode démonstration") && tt.checks.some((c) => c.name === "Simulation d'activité : permise dans l'environnement de test"));
  // … et ne laisse aucune trace : la simulation du test est toujours en marche, celle de la production toujours absente
  assert.deepEqual([(await adminT.ok("admin/sim")).on, (await adminP.ok("admin/sim")).on], [true, false]);
});

test("copie vers le test pendant que la simulation tourne : elle y arrive arrêtée, et repart sur demande sans rien rejouer", async () => {
  // la production en mode démonstration, simulation en marche (cas de l'outil en cours d'essai)
  sql("insert into kokolio.meta (key, value) values ('demo', '{}'::jsonb)");
  paris("2026-12-01", "10:00");
  assert.deepEqual([(await adminP.ok("admin/sim")).on, (await visiteurP.ok("public/info")).simulation], [true, true]);
  const p1 = await avancer(visiteurP);
  assert.ok(p1.faits.punch > 20, JSON.stringify(p1));
  const simules = (s, quand = "") => n(`select count(*) from ${s}.punch_log where ip = 'simulation' ${quand}`);
  const prodAvant = simules("kokolio"), dernier = (await adminP.ok("admin/sim")).state.last;
  assert.equal(dernier, "2026-12-01T09:00:00.000Z");
  // la copie emporte l'historique simulé et l'état de la simulation, mais arrêtée : le test est une image fixe de la production
  await adminP.ok("admin/test-clone", { confirm: "COPIER" });
  const at = new Client("test", "admin-apres-copie"); await at.ok("auth/login", { login: "admin", password: MDP });
  let st = await at.ok("admin/sim");
  assert.deepEqual([st.on, st.allowed, st.state.stopped_at, st.state.last], [false, true, "2026-12-01T09:00:00.000Z", dernier]);
  assert.deepEqual([simules("kokolio_test"), (await visiteurT.ok("public/info")).simulation, (await adminP.ok("admin/sim")).on], [prodAvant, false, true]);
  // le temps passe : la production avance, le test ne bouge pas
  paris("2026-12-01", "14:30");
  const bp = await avancer(visiteurP), bt = await avancer(visiteurT);
  assert.ok(bp.faits.punch > 10, JSON.stringify(bp));
  assert.deepEqual([bt.on, bt.faits, simules("kokolio_test")], [false, {}, prodAvant]);
  // remise en marche dans le test, depuis son propre onglet : à partir de maintenant, sans rattraper la matinée
  st = await at.ok("admin/sim", { on: true });
  assert.deepEqual([st.on, st.state.last, st.enrolled], [true, "2026-12-01T13:30:00.000Z", (await adminP.ok("admin/sim")).enrolled]);
  paris("2026-12-01", "18:45");
  await avancer(visiteurP);
  const bt2 = await avancer(visiteurT);
  assert.ok(bt2.faits.punch > 10, JSON.stringify(bt2));
  assert.equal(simules("kokolio_test", "and ts > '2026-12-01T09:00:00Z' and ts <= '2026-12-01T13:30:00Z'"), 0);
  // … et depuis, les mêmes personnes pointent aux mêmes heures des deux côtés (le scénario ne dépend que du salarié et du jour)
  const apres = (s) => `select user_id, ts from ${s}.punch_log where ip = 'simulation' and ts > '2026-12-01T13:30:00Z'`;
  assert.equal(n(`select count(*) from ((${apres("kokolio")} except ${apres("kokolio_test")}) union all (${apres("kokolio_test")} except ${apres("kokolio")})) x`), 0);
  for (const s of ["kokolio", "kokolio_test"]) assert.equal(n(`select count(*) from (select user_id, ts from ${s}.punch_log group by 1, 2 having count(*) > 1) x`), 0, `aucun pointage rejoué (${s})`);
  // arrêter l'une ne touche pas l'autre
  await at.ok("admin/sim", { on: false });
  assert.deepEqual([(await visiteurT.ok("public/info")).simulation, (await visiteurP.ok("public/info")).simulation], [false, true]);
  // la fin du mode démonstration efface les données fictives et, avec elles, la simulation de la production
  await adminP.ok("admin/demo-reset", { confirm: "EFFACER" });
  assert.deepEqual([sql("select count(*) from kokolio.meta where key in ('simulation', 'demo')"), (await visiteurP.ok("sim/tick")).on, (await visiteurP.ok("public/info")).simulation], ["0", false, false]);
  assert.equal(n("select count(*) from kokolio.punch_log"), 0);
  await adminP.fail("admin/sim", { on: true }, "etat");
});

test("passage de simulation : un seul appel à la fois fait la lecture lourde ; une réservation abandonnée tombe d'elle-même", async () => {
  // dans le test, simulation remise en marche ; cinq minutes plus tard, un passage est dû
  const at = new Client("test", "admin-reservation"); await at.ok("auth/login", { login: "admin", password: MDP });
  paris("2026-12-02", "07:30");
  await at.ok("admin/sim", { on: true });
  paris("2026-12-02", "09:40");
  const rpc = (action, args = {}) => fetch(`http://127.0.0.1:${PORT}/rest/v1/rpc/kokolio_test_api`, { method: "POST",
    headers: { "content-type": "application/json", apikey: "test-service-key", authorization: "Bearer test-service-key" },
    body: JSON.stringify({ p: { action, env: "test", _now: clock, args } }) }).then((r) => r.json());
  // un premier appel lit (et réserve) sans appliquer : comme un passage interrompu en route
  const lu = await rpc("sim_read");
  assert.deepEqual([lu.ok, lu.data.on, lu.data.due, Array.isArray(lu.data.users)], [true, true, true, true]);
  // pendant la réservation, les autres appels repartent aussitôt, sans données
  const autre = await rpc("sim_read");
  assert.deepEqual(autre.data, { on: true, due: false, busy: true, last: lu.data.last });
  const avant = n("select count(*) from kokolio_test.punch_log");
  const t = await visiteurT.ok("sim/tick");
  assert.deepEqual([t.on, t.due, t.passages, n("select count(*) from kokolio_test.punch_log")], [true, false, 0, avant]);
  // la réservation n'est ni montrée à l'administrateur, ni éternelle : passée une minute, le passage suivant reprend la main
  assert.ok(!("claim" in (await at.ok("admin/sim")).state));
  sql(`update kokolio_test.meta set value = value || jsonb_build_object('claim', clock_timestamp() - interval '61 seconds') where key = 'simulation'`);
  const b = await avancer();
  assert.ok(b.faits.punch > 5 && n("select count(*) from kokolio_test.punch_log") > avant, JSON.stringify(b));
  assert.equal(sql("select value ? 'claim' from kokolio_test.meta where key = 'simulation'"), "f");
  // un lot appliqué avec un point de départ périmé ne rejoue rien
  const perime = await rpc("sim_apply", { expect_last: lu.data.last, upto: clock, events: [{ kind: "punch", user: lu.data.users[0].id, t: clock, args: {} }] });
  assert.deepEqual([perime.data.on, perime.data.skipped], [true, true]);
  await at.ok("admin/sim", { on: false });
});
