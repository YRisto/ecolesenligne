// Faux PostgREST pour les tests : expose POST /rest/v1/rpc/kokolio_api (et kokolio_test_api) au-dessus d'une base PostgreSQL locale,
// en prenant le rôle service_role (ou anon avec la clé « anon ») comme le fait Supabase.
import http from "node:http";
import pg from "pg";

const PORT = +(process.env.FAKE_PGRST_PORT || 54321);
const pool = new pg.Pool({ host: "127.0.0.1", port: +(process.env.KK_PG_PORT || 54329), user: "postgres", database: process.env.KK_PG_DB || "kokolio_test", max: 8 });

http.createServer(async (req, res) => {
  const send = (status, body) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
  // deux portes d'entrée, comme dans la base réelle : la production et l'environnement de test
  const fn = { "/rest/v1/rpc/kokolio_api": "kokolio_api", "/rest/v1/rpc/kokolio_test_api": "kokolio_test_api" }[req.url];
  if (req.method !== "POST" || !fn) return send(404, { code: "PGRST202", message: "not found" });
  const key = req.headers.apikey;
  if (key !== "test-service-key" && key !== "anon") return send(401, { message: "Invalid API key" });
  let raw = ""; for await (const chunk of req) raw += chunk;
  let body; try { body = JSON.parse(raw); } catch { return send(400, { message: "bad json" }); }
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`set local role ${key === "anon" ? "anon" : "service_role"}`);
    const r = await client.query(`select public.${fn}($1::jsonb) as r`, [JSON.stringify(body.p ?? null)]);
    await client.query("commit");
    send(200, r.rows[0].r);
  } catch (e) {
    await client.query("rollback").catch(() => {});
    // fonction absente (environnement non installé) : PostgREST répond 404, comme pour une adresse inconnue
    send(e.code === "42883" ? 404 : e.code === "42501" ? 403 : 400, { code: e.code === "42883" ? "PGRST202" : e.code, message: e.message });
  } finally { client.release(); }
}).listen(PORT, "127.0.0.1", () => console.log(`faux PostgREST sur ${PORT}`));
