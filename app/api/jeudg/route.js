import { NextResponse } from "next/server";

const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers = () => ({ apikey: key, ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}), "Content-Type": "application/json" });
const clean = (s, n) => String(s ?? "").replace(/[<>]/g, "").trim().slice(0, n);

// GET /api/jeudg?type=saison&annee=2026  |  /api/jeudg?type=partie
export async function GET(req) {
  if (!url || !key) return NextResponse.json({ rows: [], offline: true });
  const q = new URL(req.url).searchParams;
  const type = q.get("type") === "partie" ? "partie" : "saison";
  const annee = parseInt(q.get("annee") || "0", 10);
  let filter = `type=eq.${type}`;
  if (type === "saison" && annee) filter += `&annee=eq.${annee}`;
  const r = await fetch(`${url}/rest/v1/jeu_dg_scores?${filter}&select=dg,profil,saison,annee,resultat_pct,capital,etudiants,tresorerie_k,mesures,statut,created_at&order=resultat_pct.desc,capital.desc,created_at.asc&limit=50`, { headers: headers(), cache: "no-store" });
  if (!r.ok) { const t = await r.text(); console.error("supabase jeudg GET", r.status, t); return NextResponse.json({ rows: [], error: true, status: r.status, detail: t.slice(0, 300) }, { status: 500 }); }
  return NextResponse.json({ rows: await r.json() });
}

// POST : enregistre un score de saison ou de partie
export async function POST(req) {
  const b = await req.json().catch(() => null);
  if (!b || !b.partie_id || !/^[0-9a-f-]{36}$/.test(b.partie_id)) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const type = b.type === "partie" ? "partie" : "saison";
  const dg = clean(b.dg, 40); if (!dg) return NextResponse.json({ error: "Nom manquant." }, { status: 400 });
  const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : null; };
  const row = {
    partie_id: b.partie_id, type, dg, profil: clean(b.profil, 60),
    saison: type === "saison" ? num(b.saison, 1, 6) : null, annee: num(b.annee, 2026, 2031),
    resultat_pct: num(b.resultat_pct, -100, 100) ?? 0, capital: num(b.capital, 0, 100), etudiants: num(b.etudiants, 0, 1e6),
    tresorerie_k: num(b.tresorerie_k, -1e6, 1e6), mesures: num(b.mesures, 0, 200), statut: clean(b.statut, 20) || null,
  };
  if (!url || !key) { console.log("SCORE (Supabase non configuré)", JSON.stringify(row)); return NextResponse.json({ ok: true, offline: true }); }
  const r = await fetch(`${url}/rest/v1/jeu_dg_scores?on_conflict=partie_id,type,saison`, { method: "POST", headers: { ...headers(), Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(row) });
  if (!r.ok) { console.error("supabase jeudg", r.status, await r.text()); return NextResponse.json({ error: "Enregistrement impossible." }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}
