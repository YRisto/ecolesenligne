// Point d'entrée HTTP : contrôle d'origine, session par cookie, aiguillage vers les routes, mise en forme des erreurs.
import { ApiError, ENVIRONNEMENTS, attachCycles, rpc } from "./db.mjs";
import { sha256 } from "./crypto.mjs";
import { ROUTES } from "./routes.mjs";
import { APP_VERSION, SCHEMA_EXPECTED } from "../version.mjs";

const MAX_BODY = 4_200_000;

function json(body, status = 200, cookies = []) {
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  for (const c of cookies) headers.append("Set-Cookie", c);
  return new Response(JSON.stringify(body), { status, headers });
}
function parseCookies(header) {
  const out = {};
  for (const part of String(header || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}
// Chaque environnement a son cookie, limité à ses propres adresses : une session de production ne vaut rien dans le test, et l'inverse.
function cookie(req, env, value, maxAge) {
  const https = (req.headers.get("x-forwarded-proto") || new URL(req.url).protocol.replace(":", "")) === "https";
  return `${env.cookie}=${value}; Path=${env.chemin}; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${https ? "; Secure" : ""}`;
}
function clientIp(req) {
  return (req.headers.get("x-real-ip") || (req.headers.get("x-forwarded-for") || "").split(",")[0] || "").trim().slice(0, 60);
}

// État du service, sans donnée : sert à la surveillance et au diagnostic d'installation.
async function health(env) {
  const t0 = Date.now();
  try {
    const ping = await rpc("ping", { env });
    return json({ ok: true, app: APP_VERSION, schema: ping.schema, schema_expected: SCHEMA_EXPECTED, database: "ok", environment: ping.environment || env.nom,
      ...(env.nom === "test" ? { cloned_at: ping.cloned?.at || null } : {}), today: ping.today, db_ms: Date.now() - t0, region: process.env.VERCEL_REGION || "" });
  } catch (e) {
    // Tant que l'installation n'est pas faite : de quoi vérifier que le script est exécuté dans le bon projet (début de son identifiant, sans la clé).
    let projet = ""; try { projet = new URL(process.env.SUPABASE_URL).hostname.split(".")[0].slice(0, 6); } catch { /* adresse absente */ }
    return json({ ok: false, app: APP_VERSION, environment: env.nom, database: e?.code || "erreur", message: e?.message || "", db_ms: Date.now() - t0, region: process.env.VERCEL_REGION || "",
      ...(e?.code === "installation" ? { projet, reponse_api: e?.extra?.pgrst || "" } : {}) }, 503);
  }
}

export async function handle(req, path, environnement = "production") {
  const env = ENVIRONNEMENTS[environnement] || ENVIRONNEMENTS.production;
  try {
    if (req.method === "GET") {
      if (path === "health") return health(env);
      return json({ ok: false, code: "methode", message: "Méthode non acceptée." }, 405);
    }
    // Requêtes forgées depuis un autre site : l'origine doit être la nôtre, et l'en-tête maison présent.
    const origin = req.headers.get("origin"), host = req.headers.get("x-forwarded-host") || req.headers.get("host");
    if (origin) {
      let originHost = null;
      try { originHost = new URL(origin).host; } catch { /* origine illisible */ }
      if (originHost !== host) return json({ ok: false, code: "origine", message: "Origine refusée." }, 403);
    }
    if (req.headers.get("x-kokolio") !== "1") return json({ ok: false, code: "origine", message: "Requête refusée." }, 403);
    if ((+req.headers.get("content-length") || 0) > MAX_BODY) return json({ ok: false, code: "taille", message: "Envoi trop volumineux." }, 413);
    const route = ROUTES[path];
    if (!route) return json({ ok: false, code: "introuvable", message: "Adresse inconnue." }, 404);
    let body = {};
    const text = await req.text();
    if (text.length > MAX_BODY) return json({ ok: false, code: "taille", message: "Envoi trop volumineux." }, 413);
    if (text) { try { body = JSON.parse(text); } catch { return json({ ok: false, code: "requete", message: "Requête illisible." }, 400); } }
    if (!body || typeof body !== "object" || Array.isArray(body)) body = {};

    const raw = parseCookies(req.headers.get("cookie"))[env.cookie] || "";
    const cookies = [];
    const base = {
      token: raw ? sha256(raw) : "", ip: clientIp(req), ua: (req.headers.get("user-agent") || "").slice(0, 200),
      now: process.env.KOKOLIO_TEST_HOOKS === "1" ? req.headers.get("x-kk-test-now") || undefined : undefined,
    };
    const ctx = {
      ...base, env: env.nom,
      call: async (action, args) => attachCycles(await rpc(action, { ...base, args, env })),
      startSession: (rawToken) => cookies.push(cookie(req, env, rawToken, 90 * 86400)),
      endSession: () => cookies.push(cookie(req, env, "", 0)),
    };
    const data = await route(ctx, body);
    return json({ ok: true, data }, 200, cookies);
  } catch (e) {
    if (e instanceof ApiError) {
      return json({ ok: false, code: e.code, message: e.message, ...(e.extra || {}) }, e.status, e.code === "session" ? [cookie(req, env, "", 0)] : []);
    }
    console.error("kokolio erreur", path, e);
    return json({ ok: false, code: "interne", message: "Erreur interne. Réessayez dans un instant." }, 500);
  }
}
