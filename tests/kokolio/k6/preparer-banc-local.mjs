// Banc local pour les essais k6 : part d'une base neuve, crée l'administrateur de la production locale, y charge au besoin une base
// de salariés (fichier CSV au format de l'import, hors dépôt), puis copie la production vers l'environnement de test, comme en ligne.
// Usage : node tests/kokolio/k6/preparer-banc-local.mjs <code d'activation de l'administrateur> [fichier CSV de salariés]
// N'a de sens que sur localhost : les identifiants ci-dessous sont ceux du banc d'essai, ils n'existent nulle part ailleurs.
import { readFileSync } from "node:fs";

const BASE = process.env.KK_BASE || "http://localhost:3111";
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) { console.error("Ce script ne prépare qu'un banc local."); process.exit(1); }
const [code, fichier] = process.argv.slice(2);
const ADMIN = { login: "admin", mdp: process.env.KK_ADMIN_MDP || "Tableau-Bleu-2026" };
const HORLOGE = process.env.KK_HORLOGE || "";   // instant simulé (ISO, UTC), pour dater l'installation avant les scénarios

function client(prefixe, cookieNom) {
  let cookie = "";
  return async (route, corps = {}) => {
    const t0 = performance.now();
    const res = await fetch(`${BASE}${prefixe}${route}`, { method: "POST", body: JSON.stringify(corps),
      headers: { "content-type": "application/json", "x-kokolio": "1", origin: BASE, ...(cookie ? { cookie } : {}), ...(HORLOGE ? { "x-kk-test-now": HORLOGE } : {}) } });
    for (const c of res.headers.getSetCookie()) { const m = c.match(new RegExp(`^${cookieNom}=([^;]*)`)); if (m) cookie = m[1] ? `${cookieNom}=${m[1]}` : ""; }
    const j = await res.json();
    if (!j.ok) throw new Error(`${prefixe}${route} → ${res.status} ${j.code} ${j.message}`);
    return { data: j.data, ms: Math.round(performance.now() - t0) };
  };
}
const prod = client("/api/kokolio/", "kk_session"), test = client("/api/kokolio-test/", "kkt_session");

await prod("auth/activate", { login: ADMIN.login, code, password: ADMIN.mdp });
await prod("admin/settings-save", { settings: { go_live: (HORLOGE || new Date().toISOString()).slice(0, 10) } });
if (fichier) {
  const r = await prod("rh/import", { text: readFileSync(fichier, "utf8") });
  console.log(`production locale : ${r.data.created.length} fiches importées en ${r.ms} ms`);
}
const copie = await prod("admin/test-clone", { confirm: "COPIER" });
console.log(`copie de la production vers le test : ${copie.data.counts.users} comptes, ${copie.data.rows} lignes, ${copie.ms} ms`);
await test("auth/login", { login: ADMIN.login, password: ADMIN.mdp });
const etat = (await test("admin/status")).data;
console.log(`environnement de test local prêt : ${etat.users} fiches, schéma ${etat.schema}, application ${etat.app}`);
