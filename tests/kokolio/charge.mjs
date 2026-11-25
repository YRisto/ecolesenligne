// Essai de volume : 500 salariés, un mois complet de pointages. Mesure les écrans RH les plus lourds et la clôture.
// Lancement : node tests/kokolio/charge.mjs   (base locale, voir pg-local.sh)
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(HERE, "..", "..");
const PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "postgres", "-d", "kokolio_test", "-v", "ON_ERROR_STOP=1", "-qAt"];
const sql = (q) => execFileSync("psql", [...PG, "-c", q], { encoding: "utf8", maxBuffer: 64e6 }).trim();
const N = +(process.argv[2] || 500), PORT = 54398;

execFileSync("bash", [path.join(HERE, "pg-local.sh"), "reset"], { stdio: "ignore" });
execFileSync("psql", [...PG, "-f", path.join(ROOT, "supabase/kokolio/install.sql")], { stdio: "ignore" });
sql("insert into kokolio.meta (key, value) values ('test_mode', 'true'::jsonb)");
const fake = spawn("node", [path.join(HERE, "fake-postgrest.mjs")], { env: { ...process.env, FAKE_PGRST_PORT: String(PORT) }, stdio: ["ignore", "pipe", "ignore"] });
await new Promise((r) => fake.stdout.once("data", r));
process.on("exit", () => fake.kill());
process.on("uncaughtException", (e) => { console.error("ERREUR :", e.message); process.exit(1); });
process.on("unhandledRejection", (e) => { console.error("ERREUR :", e?.message || e); process.exit(1); });
Object.assign(process.env, { SUPABASE_URL: `http://127.0.0.1:${PORT}`, SUPABASE_SERVICE_ROLE_KEY: "test-service-key", KOKOLIO_TEST_HOOKS: "1" });
const { handle } = await import(path.join(ROOT, "lib/kokolio/server/handle.mjs"));

let clock = "2026-10-01T06:00:00Z";
const jar = {};
async function call(who, route, body = {}) {
  const headers = { "content-type": "application/json", "x-forwarded-host": "k.test", origin: "https://k.test", "x-forwarded-proto": "https", "x-kokolio": "1", "x-real-ip": "10.1.1." + (who.length % 250), "x-kk-test-now": clock };
  if (jar[who]) headers.cookie = jar[who];
  const t0 = performance.now();
  const res = await handle(new Request("https://k.test/api/kokolio/" + route, { method: "POST", headers, body: JSON.stringify(body) }), route);
  for (const c of res.headers.getSetCookie()) { const m = c.match(/^kk_session=([^;]*)/); if (m && m[1]) jar[who] = `kk_session=${m[1]}`; }
  const text = await res.text(), j = JSON.parse(text);
  if (!j.ok) throw new Error(`${route} → ${j.code} ${j.message}`);
  return { data: j.data, ms: Math.round(performance.now() - t0), ko: Math.round(text.length / 1024) };
}
const mesure = async (libelle, who, route, body) => { const r = await call(who, route, body); console.log(`${libelle.padEnd(46)} ${String(r.ms).padStart(6)} ms   réponse ${String(r.ko).padStart(5)} Ko`); return r.data; };

const code = sql("select kokolio.bootstrap_admin('admin')");
await call("admin", "auth/activate", { login: "admin", code, password: "Tableau-Bleu-2026" });
await call("admin", "admin/settings-save", { settings: { go_live: "2026-10-01" } });

// fichier de N salariés : un responsable pour vingt, tous à 35 h
const lignes = ["identifiant;nom;prenom;matricule;equipe;responsable;date_entree;regime;heures_hebdo;solde_cp;droits_rtt;role"];
for (let i = 0; i < N; i++) {
  const chef = i % 20 === 0, eq = Math.floor(i / 20);
  lignes.push([`s${String(i).padStart(4, "0")}`, `Nom${i}`, `Prénom${i}`, String(1000 + i), `Équipe ${eq}`, chef ? "" : `s${String(eq * 20).padStart(4, "0")}`, "01/01/2020", chef ? "forfait" : "horaire", chef ? "" : "35", "10", chef ? "10" : "0", i === 0 ? "rh" : ""].join(";"));
}
await mesure(`Import : aperçu de ${N} lignes`, "admin", "rh/import-preview", { text: lignes.join("\n") });
const imp = await mesure(`Import : création de ${N} comptes`, "admin", "rh/import", { text: lignes.join("\n") });
const codes = Object.fromEntries(imp.created.map((c) => [c.login, c.code]));
// les comptes s'activent dans la foulée : un code ne vaut que quatorze jours
await call("rh", "auth/activate", { login: "s0000", code: codes.s0000, password: "Girafe!Verte42" });
await call("chef", "auth/activate", { login: "s0020", code: codes.s0020, password: "Cactus#Mauve77" });
await call("sal", "auth/activate", { login: "s0021", code: codes.s0021, password: "Bateau-Rouge-19" });

// planification : un horaire journalier et un cycle, suivi par un salarié sur deux (attribué directement, pour aller vite)
await call("rh", "plan/model-save", { create: true, model: { code: "J7", label: "Journée 7 h", minutes: 420, ranges: [["09:00", "12:30"], ["13:30", "17:00"]], color: "bleu" } });
const cycle = (await call("rh", "plan/cycle-save", { cycle: { name: "Semaine 35 h", weeks: [["J7", "J7", "J7", "J7", "J7", null, null]] } })).data.cycle;
sql(`update kokolio.contracts c set cycle_id = '${cycle.id}', cycle_anchor = '2026-09-28' from kokolio.users u
     where u.id = c.user_id and u.login like 's%' and c.regime = 'horaire' and right(u.login, 1) in ('1', '3', '5', '7', '9')`);

// un mois d'octobre complet pour tout le monde, saisi directement (22 jours ouvrés)
sql(`insert into kokolio.days (user_id, day, times, status)
     select u.id, d::date, array['09:0' || (extract(day from d)::int % 10), '12:30', '13:15', '17:4' || (extract(day from d)::int % 10)], 'a_valider'
     from kokolio.users u, generate_series('2026-10-01'::date, '2026-10-31'::date, interval '1 day') d
     where u.login like 's%' and extract(isodow from d) < 6`);
sql(`insert into kokolio.absences (user_id, type_code, start_date, end_date, days_count, status)
     select u.id, 'cp', '2026-10-19', '2026-10-23', 5, 'valide' from kokolio.users u where u.login like 's%' and right(u.login, 1) = '7'`);
sql("delete from kokolio.days d using kokolio.absences a where a.user_id = d.user_id and d.day between a.start_date and a.end_date");
console.log(`\nDonnées : ${sql("select count(*) from kokolio.users")} comptes, ${sql("select count(*) from kokolio.days")} journées, ${sql("select count(*) from kokolio.absences")} absences\n`);

clock = "2026-11-02T08:00:00Z";
// un mois sans activité : les sessions ont expiré, chacun se reconnecte
for (const [who, login, password] of [["rh", "s0000", "Girafe!Verte42"], ["chef", "s0020", "Cactus#Mauve77"], ["sal", "s0021", "Bateau-Rouge-19"]]) { delete jar[who]; await call(who, "auth/login", { login, password }); }

console.log("--- un salarié");
await mesure("Pointer (écran du jour)", "sal", "my/today");
await mesure("Pointer (pointage)", "sal", "my/punch", {});
await mesure("Mes heures (octobre)", "sal", "my/month", { month: "2026-10" });
await mesure("Mon année", "sal", "my/year", { year: 2026 });
console.log("--- un responsable de 19 personnes");
const pend = await mesure("Validation de l'équipe (418 journées)", "chef", "team/pending", {});
await mesure("Validation en lot de l'équipe", "chef", "team/decide-days", { decision: "valide", items: pend.groups.flatMap((g) => g.days.map((d) => ({ id: d.id, version: d.version }))) });
await mesure("Synthèse de l'équipe", "chef", "team/month", { month: "2026-10" });
const grille = await mesure("Planning de l'équipe (une semaine)", "chef", "plan/grid", { from: "2026-11-09" });
await mesure("Planning : 95 jours modifiés d'un coup", "chef", "plan/set", { items: grille.rows.flatMap((r) => grille.days.slice(0, 5).map((j) => ({ user_id: r.user_id, day: j.date, minutes: 360, label: "Inventaire" }))) });
console.log(`--- les RH, ${N} salariés`);
await mesure("Liste des salariés", "rh", "rh/employees");
await mesure("Validation, tous les salariés (résumé)", "rh", "team/pending", { scope: "all" });
await mesure("Synthèse d'octobre, tous les salariés", "rh", "team/month", { month: "2026-10", scope: "all" });
await mesure("Planning d'une semaine, tous les salariés", "rh", "plan/grid", { scope: "all", from: "2026-10-05", weeks: 1 });
await mesure("Planning de quatre semaines, tous les salariés", "rh", "plan/grid", { scope: "all", from: "2026-10-05", weeks: 4 });
await mesure("Clôture : contrôle", "rh", "rh/closure-check", { month: "2026-10" });
sql("update kokolio.days set status = 'valide' where status <> 'valide' and day < '2026-11-01'");
await mesure("Clôture d'octobre", "rh", "rh/close", { month: "2026-10" });
const exp = await mesure("Export paie figé", "rh", "rh/export", { month: "2026-10" });
console.log(`    export : ${exp.text.trim().split("\r\n").length - 1} lignes`);
await mesure("Journal (première page)", "rh", "rh/journal", {});
await mesure("Report des congés : aperçu", "rh", "rh/rollover-preview", { year: 2026 });

console.log("--- 200 pointages au même instant");
clock = "2026-11-03T08:00:00Z";
const logins = imp.created.slice(100, 300).map((c) => c.login);
sql(`insert into kokolio.sessions (token_hash, user_id, created_at, last_seen, expires_at)
     select encode(sha256(convert_to('charge-' || u.login, 'UTF8')), 'hex'), u.id, now(), now(), now() + interval '300 days' from kokolio.users u where u.login = any('{${logins.join(",")}}')`);
for (const l of logins) jar[l] = `kk_session=charge-${l}`;
const t0 = performance.now();
const res = await Promise.allSettled(logins.map((l) => call(l, "my/punch", {})));
const okN = res.filter((r) => r.status === "fulfilled").length, durees = res.filter((r) => r.status === "fulfilled").map((r) => r.value.ms).sort((a, b) => a - b);
console.log(`${okN} / ${logins.length} réussis en ${Math.round(performance.now() - t0)} ms ; médiane ${durees[Math.floor(durees.length / 2)]} ms, plus lent ${durees[durees.length - 1]} ms`);
if (okN < logins.length) console.log("  échecs :", [...new Set(res.filter((r) => r.status === "rejected").map((r) => r.reason.message))].slice(0, 3));
console.log(`journées pointées le 3 novembre : ${sql("select count(*) from kokolio.days where day = '2026-11-03'")}`);
fake.kill();
