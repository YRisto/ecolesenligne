// Faux PostgREST pour les tests : expose POST /rest/v1/rpc/kokolio_api au-dessus d'une base PostgreSQL locale,
// en prenant le rôle service_role (ou anon avec la clé « anon ») comme le fait Supabase.
import http from "node:http";
import pg from "pg";

const PORT = +(process.env.FAKE_PGRST_PORT || 54321);
const pool = new pg.Pool({ host: "127.0.0.1", port: +(process.env.KK_PG_PORT || 54329), user: "postgres", database: process.env.KK_PG_DB || "kokolio_test", max: 8 });

http.createServer(async (req, res) => {
  const send = (status, body) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
  if (req.method !== "POST" || req.url !== "/rest/v1/rpc/kokolio_api") return send(404, { code: "PGRST202", message: "not found" });
  const key = req.headers.apikey;
  if (key !== "test-service-key" && key !== "anon") return send(401, { message: "Invalid API key" });
  let raw = ""; for await (const chunk of req) raw += chunk;
  let body; try { body = JSON.parse(raw); } catch { return send(400, { message: "bad json" }); }
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`set local role ${key === "anon" ? "anon" : "service_role"}`);
    const r = await client.query("select public.kokolio_api($1::jsonb) as r", [JSON.stringify(body.p ?? null)]);
    await client.query("commit");
    send(200, r.rows[0].r);
  } catch (e) {
    await client.query("rollback").catch(() => {});
    send(e.code === "42501" ? 403 : 400, { code: e.code, message: e.message });
  } finally { client.release(); }
}).listen(PORT, "127.0.0.1", () => console.log(`faux PostgREST sur ${PORT}`));
