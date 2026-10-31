import { NextResponse } from "next/server";

const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers = () => ({ apikey: key, ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}), "Content-Type": "application/json" });
const clean = (s, n) => String(s ?? "").replace(/[<>]/g, "").trim().slice(0, n);
const ID = /^[a-z]{2,20}$/;

// GET /api/jeudg/trophees            → nombre de DG par trophée
// GET /api/jeudg/trophees?id=poker   → liste des DG qui ont ce trophée
export async function GET(req) {
  if (!url || !key) return NextResponse.json({ rows: [], offline: true });
  const id = new URL(req.url).searchParams.get("id") || "";
  const sel = ID.test(id) ? `trophee=eq.${id}&select=dg,scenario,created_at&order=created_at.asc&limit=200` : `select=trophee,dg&limit=5000`;
  const r = await fetch(`${url}/rest/v1/jeu_dg_trophees?${sel}`, { headers: headers(), cache: "no-store" });
  if (!r.ok) { const t = await r.text(); console.error("supabase trophees GET", r.status, t); return NextResponse.json({ rows: [], error: true }, { status: 500 }); }
  const rows = await r.json();
  if (ID.test(id)) return NextResponse.json({ rows });
  const counts = {}; for (const x of rows) counts[x.trophee] = (counts[x.trophee] || 0) + 1;
  return NextResponse.json({ counts });
}

// POST { dg, trophee, scenario }
export async function POST(req) {
  const b = await req.json().catch(() => null);
  if (!b) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const dg = clean(b.dg, 40), trophee = clean(b.trophee, 20), scenario = clean(b.scenario, 60);
  if (!dg || !ID.test(trophee)) return NextResponse.json({ error: "Données manquantes." }, { status: 400 });
  if (!url || !key) return NextResponse.json({ ok: true, offline: true });
  const r = await fetch(`${url}/rest/v1/jeu_dg_trophees?on_conflict=dg,trophee`, { method: "POST", headers: { ...headers(), Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ dg, trophee, scenario }) });
  if (!r.ok) { console.error("supabase trophees POST", r.status, await r.text()); return NextResponse.json({ error: "Enregistrement impossible." }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}
