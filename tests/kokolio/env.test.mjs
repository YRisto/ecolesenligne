// Environnement de test : deux installations dans la même base (production et test), jouées contre une vraie base PostgreSQL locale.
// Ce qui est vérifié : le test est une copie fidèle à la demande, les deux environnements ne se touchent jamais ensuite,
// une session de l'un ne vaut rien dans l'autre, et rien dans le test ne peut écrire en production.
// Lancement : node --test tests/kokolio/env.test.mjs   (PostgreSQL 16 requis, voir pg-local.sh)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "..");
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "postgres", "-d", "kokolio_test", "-v", "ON_ERROR_STOP=1", "-qAt"];
const sql = (q) => execFileSync("psql", [...PG, "-c", q], { encoding: "utf8" }).trim();
const PORT = 54396;
let handle, fake, clock = "2026-11-26T09:00:00Z";

const ENVS = { production: { api: "/api/kokolio/", cookie: "kk_session" }, test: { api: "/api/kokolio-test/", cookie: "kkt_session" } };
class Client {
  constructor(env, name) { this.env = env; this.name = name; this.cookie = ""; }
  async call(route, body = {}, opt = {}) {
    const e = ENVS[this.env];
    const headers = { "content-type": "application/json", "x-forwarded-host": "kokolio.test", "x-forwarded-proto": "https", origin: "https://kokolio.test",
      "x-kokolio": "1", "x-real-ip": "10.0.0.9", "user-agent": "test/" + this.name, "x-kk-test-now": clock };
    if (opt.cookie ?? this.cookie) headers.cookie = opt.cookie ?? this.cookie;
    const res = await handle(new Request("https://kokolio.test" + e.api + route, { method: opt.method || "POST", headers, body: opt.method === "GET" ? undefined : JSON.stringify(body) }), route, this.env);
    for (const c of res.headers.getSetCookie()) {
      const m = c.match(/^(kkt?_session)=([^;]*)/);
      if (m) { this.cookie = m[2] ? `${m[1]}=${m[2]}` : ""; this.lastSetCookie = c; }
    }
    return { status: res.status, ...(await res.json()) };
  }
  async ok(route, body, opt) { const r = await this.call(route, body, opt); assert.equal(r.ok, true, `${this.env} ${route} → ${r.code} ${r.message}`); return r.data ?? r; }
  async fail(route, body, code, status, opt) {
    const r = await this.call(route, body, opt);
    assert.equal(r.ok, false, `${this.env} ${route} aurait dû échouer`); assert.equal(r.code, code, `${this.env} ${route} → ${r.code} ${r.message}`);
    if (status) assert.equal(r.status, status);
    return r;
  }
}
const PW = { admin: "Tableau-Bleu-2026", lea: "Girafe!Verte42", nouveau: "Cactus#Mauve77" };
const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n").toString("base64");
let absenceId = null;
const adminP = new Client("production", "admin"), leaP = new Client("production", "lea");
const adminT = new Client("test", "admin"), leaT = new Client("test", "lea");
// Empreinte de toutes les données d'un schéma (hors sessions et compteur d'essais) : sert à prouver qu'un environnement n'a pas bougé.
const empreinte = (schema) => sql(`select md5(string_agg(t || ':' || n || ':' || h, '|' order by t)) from (
  select c.relname t, (xpath('/row/n/text()', query_to_xml(format('select count(*) n from %I.%I', '${schema}', c.relname), false, true, '')))[1]::text n,
         (xpath('/row/h/text()', query_to_xml(format('select coalesce(md5(string_agg(md5(x::text), '','' order by md5(x::text))), '''') h from %I.%I x', '${schema}', c.relname), false, true, '')))[1]::text h
  from pg_class c join pg_namespace s on s.oid = c.relnamespace where s.nspname = '${schema}' and c.relkind = 'r' and c.relname not in ('sessions', 'throttle')) q`);
const compte = (schema, table) => +sql(`select count(*) from ${schema}.${table}`);

before(async () => {
  execFileSync("bash", [path.join(HERE, "pg-local.sh"), "reset"], { stdio: "ignore" });
  execFileSync("psql", [...PG, "-f", path.join(ROOT, "supabase/kokolio/install.sql")], { stdio: "ignore" });
  execFileSync("psql", [...PG, "-f", path.join(ROOT, "supabase/kokolio/install-test.sql")], { stdio: "ignore" });
  sql("insert into kokolio.meta (key, value) values ('test_mode', 'true'::jsonb)");
  sql("insert into kokolio_test.meta (key, value) values ('test_mode', 'true'::jsonb)");
  fake = spawn("node", [path.join(HERE, "fake-postgrest.mjs")], { env: { ...process.env, FAKE_PGRST_PORT: String(PORT) }, stdio: ["ignore", "pipe", "inherit"] });
  await new Promise((r) => fake.stdout.once("data", r));
  Object.assign(process.env, { SUPABASE_URL: `http://127.0.0.1:${PORT}`, SUPABASE_SERVICE_ROLE_KEY: "test-service-key", KOKOLIO_TEST_HOOKS: "1" });
  ({ handle } = await import(path.join(ROOT, "lib/kokolio/server/handle.mjs")));
});
after(() => fake?.kill());

test("deux installations distinctes : chacune sait qui elle est et refuse de répondre pour l'autre", async () => {
  const hp = await adminP.call("health", {}, { method: "GET" }), ht = await adminT.call("health", {}, { method: "GET" });
  assert.deepEqual([hp.ok, hp.environment, hp.schema, hp.cloned_at], [true, "production", 9, undefined]);
  assert.deepEqual([ht.ok, ht.environment, ht.schema, ht.cloned_at], [true, "test", 9, null]);
  assert.equal((await adminP.ok("public/info")).environment, "production");
  assert.deepEqual([(await adminT.ok("public/info")).environment, (await adminT.ok("public/info")).cloned], ["test", null]);
  // branchement croisé (adresse de test reliée à la base de production, ou l'inverse) : la base refuse
  assert.equal(sql(`select public.kokolio_api('{"action":"ping","env":"test"}'::jsonb)->>'code'`), "configuration");
  assert.equal(sql(`select public.kokolio_test_api('{"action":"ping","env":"production"}'::jsonb)->>'code'`), "configuration");
  assert.equal(sql(`select public.kokolio_test_api('{"action":"ping","env":"test"}'::jsonb)#>>'{data,environment}'`), "test");
  // aucune mention du schéma de production dans le script de l'environnement de test (hors commentaires)
  const script = readFileSync(path.join(ROOT, "supabase/kokolio/install-test.sql"), "utf8").split("\n").filter((l) => !l.startsWith("--") && /kokolio(?!_test)/.test(l));
  assert.deepEqual(script, []);
});

test("la production vit sa vie ; le test, vide, ne connaît personne", async () => {
  const code = sql("select kokolio.bootstrap_admin('admin')");
  await adminP.ok("auth/activate", { login: "admin", code, password: PW.admin });
  await adminP.ok("admin/settings-save", { settings: { go_live: "2026-11-02" } });
  const csv = "identifiant;nom;prenom;matricule;equipe;date_entree;regime;heures_hebdo\nlea.durand;Durand;Léa;1001;Section 253;01/09/2023;horaire;35\npaul.morel;Morel;Paul;1002;Section 253;01/09/2024;horaire;30\nzoe.petit;Petit;Zoé;1003;Section 430;01/02/2025;forfait;";
  const imp = await adminP.ok("rh/import", { text: csv });
  assert.equal(imp.created.length, 3);
  await leaP.ok("auth/activate", { login: "lea.durand", code: imp.created.find((c) => c.login === "lea.durand").code, password: PW.lea });
  clock = "2026-11-26T08:02:00Z"; await leaP.ok("my/punch", {});
  clock = "2026-11-26T09:00:00Z";
  // un arrêt maladie avec son justificatif : le document lui-même ne devra pas quitter la production
  const arret = await leaP.ok("my/absence-request", { type: "maladie", start: "2026-12-07", end: "2026-12-09", doc: { name: "arret-lea-durand.pdf", data: PDF } });
  absenceId = arret.absence.id;
  assert.deepEqual([compte("kokolio", "users"), compte("kokolio", "days"), compte("kokolio_test", "users"), compte("kokolio_test", "days")], [4, 1, 0, 0]);
  // le test n'a aucun compte : ni l'administrateur ni Léa ne peuvent s'y connecter, et une session de production n'y vaut rien
  await adminT.fail("auth/login", { login: "admin", password: PW.admin }, "identifiants");
  await adminT.fail("boot", {}, "session", 401, { cookie: adminP.cookie });
  await adminT.fail("boot", {}, "session", 401, { cookie: adminP.cookie.replace("kk_session", "kkt_session") });
  // vu de la production : le test est installé, jamais copié
  const st = await adminP.ok("admin/test-status");
  assert.deepEqual([st.environment, st.installed, st.schema, st.schema_production, st.cloned, st.users], ["production", true, 9, 9, null, 0]);
});

test("copie de la production vers le test : réservée à l'administrateur, confirmée, complète", async () => {
  await leaP.fail("admin/test-clone", { confirm: "COPIER" }, "interdit", 403);
  await leaP.fail("admin/test-status", {}, "interdit", 403);
  await adminP.fail("admin/test-clone", {}, "confirmation");
  const avant = empreinte("kokolio");
  const r = await adminP.ok("admin/test-clone", { confirm: "COPIER" });
  assert.deepEqual([r.counts.users, r.counts.contracts, r.counts.days, r.counts.punch_log, r.counts.absence_types], [4, 3, 1, 1, 7]);
  // la production n'a pas bougé, à la ligne de journal près ; le test est son image
  assert.equal(compte("kokolio", "audit"), compte("kokolio_test", "audit") + 1, "la copie est inscrite au journal de la production");
  assert.equal(sql("select action from kokolio.audit order by seq desc limit 1"), "test_copie");
  for (const t of ["users", "contracts", "days", "punch_log", "absence_types", "absences", "balance_entries", "closures"]) {
    assert.equal(sql(`select md5(string_agg(md5(x::text), ',' order by md5(x::text))) from kokolio.${t} x`), sql(`select md5(string_agg(md5(x::text), ',' order by md5(x::text))) from kokolio_test.${t} x`), `table ${t} identique`);
  }
  assert.notEqual(avant, empreinte("kokolio"));   // … du seul fait de la ligne de journal
  // le justificatif reste en production ; dans le test, l'absence garde une pièce jointe, mais c'est un fichier témoin
  assert.equal(r.counts.attachments, 1);
  assert.equal(sql("select filename || '|' || mime || '|' || (size = octet_length(data)) || '|' || (position('%PDF' in convert_from(data, 'UTF8')) > 0) from kokolio.attachments"), "arret-lea-durand.pdf|application/pdf|true|true");
  assert.equal(sql("select filename || '|' || mime || '|' || (size = octet_length(data)) || '|' || convert_from(data, 'UTF8') from kokolio_test.attachments"),
    "justificatif-non-copie.txt|text/plain|true|Ce justificatif n'a pas été copié dans l'environnement de test : les documents déposés par les salariés restent en production.");
  assert.deepEqual([compte("kokolio_test", "sessions"), compte("kokolio", "sessions")], [0, 2], "les sessions ne sont pas copiées");
  // les réglages suivent, la version du schéma et la marque de copie restent celles du test
  assert.equal(sql("select value->>'go_live' from kokolio_test.meta where key = 'settings'"), "2026-11-02");
  assert.equal(sql("select value->>'by' from kokolio_test.meta where key = 'test_clone'"), "admin");
  assert.equal(sql("select count(*) from kokolio.meta where key = 'test_clone'"), "0");
  const st = await adminP.ok("admin/test-status");
  assert.deepEqual([st.users, st.cloned.by, st.cloned.users], [4, "admin", 4]);
  assert.equal((await adminT.call("health", {}, { method: "GET" })).cloned_at, st.cloned.at);
  // les compteurs automatiques du test repartent après les valeurs copiées
  assert.ok(+sql("select nextval('kokolio_test.audit_seq_seq')") > +sql("select max(seq) from kokolio_test.audit"));
});

test("dans le test : mêmes identifiants, session à part, et tout ce qui s'y fait y reste", async () => {
  // une session de production ne vaut toujours rien dans le test (les sessions n'ont pas été copiées)
  await adminT.fail("boot", {}, "session", 401, { cookie: adminP.cookie.replace("kk_session", "kkt_session") });
  await adminT.ok("auth/login", { login: "admin", password: PW.admin });
  assert.match(adminT.lastSetCookie, /^kkt_session=[^;]+; Path=\/api\/kokolio-test; HttpOnly; SameSite=Strict/);
  await leaT.ok("auth/login", { login: "lea.durand", password: PW.lea });
  // dans le test, la pièce jointe de l'absence s'ouvre : c'est le fichier témoin, pas le document déposé en production
  const docT = await leaT.ok("doc", { id: absenceId }), docP = await leaP.ok("doc", { id: absenceId });
  assert.deepEqual([docT.filename, docT.mime, Buffer.from(docT.data, "base64").toString("utf8").startsWith("Ce justificatif n'a pas été copié")], ["justificatif-non-copie.txt", "text/plain", true]);
  assert.deepEqual([docP.filename, docP.mime, docP.data], ["arret-lea-durand.pdf", "application/pdf", PDF]);
  const info = await adminT.ok("public/info");
  assert.deepEqual([info.environment, typeof info.cloned.at, info.cloned.by], ["test", "string", undefined]);   // l'auteur de la copie n'est pas dit au public
  assert.equal((await adminT.ok("admin/test-status")).cloned.by, "admin");
  // … et une session du test ne vaut rien en production
  await adminP.fail("boot", {}, "session", 401, { cookie: adminT.cookie.replace("kkt_session", "kk_session") });
  await adminP.ok("auth/login", { login: "admin", password: PW.admin });   // (le refus a effacé le cookie : l'administrateur se reconnecte)
  const prod = empreinte("kokolio");
  // activité dans le test : pointage, réglage, nouveau salarié, changement de mot de passe
  clock = "2026-11-26T16:45:00Z"; const p = await leaT.ok("my/punch", {});
  assert.ok(p);
  await adminT.ok("admin/settings-save", { settings: { company: "Entreprise d'essai" } });
  const imp = await adminT.ok("rh/import", { text: "identifiant;nom;prenom;matricule\nnouveau.test;Test;Nouveau;9001" });
  await new Client("test", "nouveau").ok("auth/activate", { login: "nouveau.test", code: imp.created[0].code, password: PW.nouveau });
  assert.deepEqual([compte("kokolio_test", "users"), compte("kokolio", "users")], [5, 4]);
  assert.equal(sql("select value->>'company' from kokolio_test.meta where key = 'settings'"), "Entreprise d'essai");
  assert.equal(empreinte("kokolio"), prod, "la production n'a pas bougé d'une ligne");
  // le journal du test reste vérifiable après la copie
  const j = await adminT.ok("rh/journal-verify", {});
  assert.equal(j.ok, true);
  // depuis le test, la copie ne se lance pas ; l'état dit simplement où l'on est
  await adminT.fail("admin/test-clone", { confirm: "COPIER" }, "etat");
  assert.equal(sql(`select public.kokolio_test_api(jsonb_build_object('action', 'test_clone', 'env', 'test', 'token', (select token_hash from kokolio_test.sessions s join kokolio_test.users u on u.id = s.user_id where u.login = 'admin' limit 1)))->>'code'`), "etat");
  assert.equal((await adminT.ok("admin/test-status")).environment, "test");
  // en sens inverse : un pointage en production n'apparaît pas dans le test
  clock = "2026-11-26T17:10:00Z"; await leaP.ok("my/punch", {});
  assert.notEqual(sql("select times::text from kokolio.days"), sql("select times::text from kokolio_test.days"));
});

test("nouvelle copie : le test revient à l'image de la production, ses sessions tombent", async () => {
  clock = "2026-11-26T18:00:00Z";
  const r = await adminP.ok("admin/test-clone", { confirm: "COPIER" });
  assert.equal(r.counts.users, 4);
  assert.deepEqual([compte("kokolio_test", "users"), sql("select value->>'company' from kokolio_test.meta where key = 'settings'") === "Entreprise d'essai"], [4, false]);
  assert.equal(sql("select times::text from kokolio.days"), sql("select times::text from kokolio_test.days"));
  await adminT.fail("boot", {}, "session", 401);
  await adminT.ok("auth/login", { login: "admin", password: PW.admin });
  assert.equal((await adminT.ok("rh/journal-verify", {})).ok, true);
  // un environnement de test en retard d'une version : la copie est refusée avec une explication
  sql("update kokolio_test.meta set value = '8'::jsonb where key = 'schema_version'");
  await adminP.fail("admin/test-clone", { confirm: "COPIER" }, "etat");
  sql("update kokolio_test.meta set value = '9'::jsonb where key = 'schema_version'");
});

test("import : le début de suivi d'une fiche existante se déplace quand la colonne est remplie", async () => {
  const suivi = () => sql("select string_agg(login || ':' || coalesce(tracked_from::text, '-'), ' ' order by login) from kokolio.users where role <> 'admin'");
  assert.equal(suivi(), "lea.durand:- paul.morel:- zoe.petit:-");
  // sans colonne debut_suivi, ou avec une cellule vide : rien ne bouge
  let r = await adminP.ok("rh/import", { text: "identifiant;nom;prenom;matricule;debut_suivi\nlea.durand;Durand;Léa;1001;\npaul.morel;Morel;Paul;1002;04/01/2027" });
  assert.deepEqual([r.created.length, r.updated.length, r.tracked], [0, 2, ["paul.morel"]]);
  assert.equal(suivi(), "lea.durand:- paul.morel:2027-01-04 zoe.petit:-");
  // sans identifiant, la fiche est retrouvée par son matricule ; la même date une seconde fois ne compte pas comme un déplacement
  r = await adminP.ok("rh/import", { text: "nom;prenom;matricule;debut_suivi\nMorel;Paul;1002;04/01/2027\nPetit;Zoé;1003;01/12/2026" });
  assert.deepEqual([r.created.length, r.updated.length, r.tracked], [0, 2, ["zoe.petit"]]);
  assert.equal(suivi(), "lea.durand:- paul.morel:2027-01-04 zoe.petit:2026-12-01");
  const journal = (await adminP.ok("rh/journal", { action: "import_salaries" })).rows[0];
  assert.deepEqual(journal.detail.debut_suivi_deplace, ["zoe.petit"]);
  // l'aperçu annonce la date qui sera appliquée
  const ap = await adminP.ok("rh/import-preview", { text: "nom;prenom;matricule;debut_suivi\nDurand;Léa;1001;15/12/2026" });
  assert.deepEqual([ap.update, ap.rows[0].exists, ap.rows[0].tracked_from, ap.rows[0].login], [1, true, "2026-12-15", "lea.durand"]);
});
