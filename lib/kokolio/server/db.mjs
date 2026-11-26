// Unique accès à la base : la fonction kokolio_api, appelée avec la clé serveur.
// Toutes les règles (session, droits, verrous) sont appliquées dans la base elle-même.
export class ApiError extends Error {
  constructor(code, message, status = 400, extra) { super(message); this.code = code; this.status = status; this.extra = extra; }
}

const STATUS = { session: 401, interdit: 403, introuvable: 404, conflit: 409, cloture: 409, verrou: 409, bloque: 409, etat: 409, interne: 500, configuration: 503 };

// Deux installations dans la même base, chacune derrière sa propre fonction : la production et l'environnement de test.
// Le nom de l'environnement attendu accompagne chaque appel : la base refuse de répondre à la place de l'autre.
export const ENVIRONNEMENTS = {
  production: { nom: "production", fn: "kokolio_api", cookie: "kk_session", chemin: "/api/kokolio" },
  test: { nom: "test", fn: "kokolio_test_api", cookie: "kkt_session", chemin: "/api/kokolio-test" },
};

export async function rpc(action, { token = "", ip = "", ua = "", args = {}, now, env = ENVIRONNEMENTS.production } = {}) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new ApiError("configuration", "La base de données n'est pas configurée sur le serveur.", 503);
  const p = { action, token, ip, ua, args, env: env.nom };
  if (now) p._now = now;
  let r;
  try {
    r = await fetch(`${url}/rest/v1/rpc/${env.fn}`, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(25000),
      headers: { apikey: key, ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}), "Content-Type": "application/json" },
      body: JSON.stringify({ p }),
    });
  } catch (e) {
    console.error("kokolio base injoignable", action, e?.message);
    throw new ApiError("base", "La base de données ne répond pas. Réessayez dans un instant.", 503);
  }
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    console.error("kokolio rpc", action, r.status, text.slice(0, 300));
    if (r.status === 404) {
      let pgrst = ""; try { pgrst = String(JSON.parse(text).code || "").slice(0, 20); } catch { /* réponse non JSON */ }
      throw new ApiError("installation", env.nom === "test" ? "L'environnement de test n'est pas encore installé dans la base de données." : "L'outil n'est pas encore installé dans la base de données.", 503, { pgrst });
    }
    throw new ApiError("base", "La base de données a refusé la requête.", 503);
  }
  const j = await r.json().catch(() => null);
  if (!j || j.ok !== true) {
    if (!j || j.code === "interne") console.error("kokolio sql", action, j?.debug);
    throw new ApiError(j?.code || "base", j?.message || "Réponse illisible de la base de données.", STATUS[j?.code] || 400);
  }
  return j.data;
}

// Une réponse qui contient des contrats arrive avec les cycles qu'ils suivent : chaque contrat reçoit le sien,
// pour que le moteur de calcul dispose toujours du planning complet.
export function attachCycles(r) {
  if (r && typeof r === "object" && Array.isArray(r.contracts) && Array.isArray(r.cycles)) {
    const byId = new Map(r.cycles.filter(Boolean).map((c) => [c.id, c]));
    for (const c of r.contracts) if (c.cycle_id) c.cycle = byId.get(c.cycle_id) || null;
  }
  return r;
}
