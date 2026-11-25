// Unique accès à la base : la fonction kokolio_api, appelée avec la clé serveur.
// Toutes les règles (session, droits, verrous) sont appliquées dans la base elle-même.
export class ApiError extends Error {
  constructor(code, message, status = 400, extra) { super(message); this.code = code; this.status = status; this.extra = extra; }
}

const STATUS = { session: 401, interdit: 403, introuvable: 404, conflit: 409, cloture: 409, verrou: 409, bloque: 409, etat: 409, interne: 500 };

export async function rpc(action, { token = "", ip = "", ua = "", args = {}, now } = {}) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new ApiError("configuration", "La base de données n'est pas configurée sur le serveur.", 503);
  const p = { action, token, ip, ua, args };
  if (now) p._now = now;
  let r;
  try {
    r = await fetch(`${url}/rest/v1/rpc/kokolio_api`, {
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
    if (r.status === 404) throw new ApiError("installation", "L'outil n'est pas encore installé dans la base de données.", 503);
    throw new ApiError("base", "La base de données a refusé la requête.", 503);
  }
  const j = await r.json().catch(() => null);
  if (!j || j.ok !== true) {
    if (!j || j.code === "interne") console.error("kokolio sql", action, j?.debug);
    throw new ApiError(j?.code || "base", j?.message || "Réponse illisible de la base de données.", STATUS[j?.code] || 400);
  }
  return j.data;
}
