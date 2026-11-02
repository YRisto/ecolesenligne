import { NextResponse } from "next/server";

// Mesure d'audience du Jeu du DG, anonyme : un identifiant aléatoire par appareil (pas d'IP, pas de nom), l'école, le type d'appareil.
const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers = () => ({ apikey: key, ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}), "Content-Type": "application/json", Prefer: "return=minimal" });
const KINDS = ["visite", "debut", "fin"];
const ID = /^[0-9a-z-]{8,40}$/i;

export async function POST(req) {
  const b = await req.json().catch(() => null);
  if (!b || !KINDS.includes(b.kind) || !ID.test(String(b.visiteur || ""))) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const row = {
    kind: b.kind,
    visiteur: String(b.visiteur).slice(0, 40),
    partie_id: ID.test(String(b.partie_id || "")) ? String(b.partie_id).slice(0, 40) : null,
    ecole: String(b.ecole || "").replace(/[<>]/g, "").slice(0, 40) || null,
    mobile: !!b.mobile,
    appli: !!b.appli,
    statut: ["objectif", "equilibre", "manque", "perdu"].includes(b.statut) ? b.statut : null,
  };
  if (!url || !key) return NextResponse.json({ ok: true, offline: true });
  const r = await fetch(`${url}/rest/v1/jeu_dg_events`, { method: "POST", headers: headers(), body: JSON.stringify(row) });
  if (!r.ok) { console.error("jeudg event", r.status, await r.text()); return NextResponse.json({ ok: false }, { status: 202 }); }
  return NextResponse.json({ ok: true });
}
