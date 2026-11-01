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
  const archive = q.get("archive") === "1";
  // Rééquilibrage de la difficulté du 1er novembre 2026 : tout ce qui a été joué avant est archivé, sans toucher aux lignes.
  const CUTOFF = "2026-11-01T09:00:00Z";
  let filter = archive ? `type=eq.${type}&or=(archive.eq.true,created_at.lt.${CUTOFF})` : `type=eq.${type}&archive=eq.false&created_at=gte.${CUTOFF}`;
  filter += `&masque=eq.false`; // parties retirées à la demande du joueur (colonne masque, lignes conservées)
  if (type === "saison" && annee) filter += `&annee=eq.${annee}`;
  const base = "dg,profil,saison,annee,resultat_pct,capital,etudiants,tresorerie_k,mesures,statut,archive,created_at";
  let r = await fetch(`${url}/rest/v1/jeu_dg_scores?${filter}&select=${base},resultat_k,ca_k&order=resultat_k.desc.nullslast,resultat_pct.desc,capital.desc,created_at.asc&limit=300`, { headers: headers(), cache: "no-store" });
  if (r.status === 400) { filter = filter.replace("&masque=eq.false", ""); r = await fetch(`${url}/rest/v1/jeu_dg_scores?${filter}&select=${base},resultat_k,ca_k&order=resultat_k.desc.nullslast,resultat_pct.desc,capital.desc,created_at.asc&limit=300`, { headers: headers(), cache: "no-store" }); }
  if (r.status === 400) r = await fetch(`${url}/rest/v1/jeu_dg_scores?${filter}&select=${base}&order=resultat_pct.desc,capital.desc,created_at.asc&limit=300`, { headers: headers(), cache: "no-store" }); // colonnes resultat_k / ca_k pas encore créées
  if (!r.ok) { const t = await r.text(); console.error("supabase jeudg GET", r.status, t); return NextResponse.json({ rows: [], error: true, status: r.status, detail: t.slice(0, 300) }, { status: 500 }); }
  return NextResponse.json({ rows: await r.json() });
}


// Garde-fous anti-triche : un score doit être cohérent avec l'historique détaillé de la partie et plausible pour l'école choisie.
const ECOLES = { "Xyn and You": 30000, "LinguIA": 7000, "ENACTO Business School": 10000, "Centre National de Formation": 60000, "Hippocampus": 1002, "Les Cuisines de Minuit": 12600, "Académie Orbitale": 5400, "L'École des Nouveaux Paysans": 8000 };
function plausible(row, details) {
  const ecole = Object.keys(ECOLES).find((n) => String(row.profil || "").startsWith(n));
  if (!ecole) return "école inconnue";
  const ca0 = ECOLES[ecole], caMax = ca0 * 5;
  const an = details && Array.isArray(details.annees) ? details.annees : null;
  if (!an || !an.length) return "historique manquant";
  if (an.length > 5) return "trop d'années";
  let prevCa = ca0;
  for (const [i, y] of an.entries()) {
    if (!y || y.annee !== 2026 + i) return "années incohérentes";
    const ca = Number(y.ca), res = Number(y.resultat);
    if (!Number.isFinite(ca) || !Number.isFinite(res)) return "valeurs invalides";
    if (ca < 0 || ca > caMax) return "chiffre d'affaires hors limites";
    if (res > ca * 0.6 || res < -ca0 * 3) return "résultat hors limites";
    if (ca > prevCa * 1.9 + ca0 * 0.1) return "croissance impossible";
    prevCa = ca;
  }
  const last = an[an.length - 1];
  if (row.annee !== last.annee) return "année incohérente";
  if (row.resultat_k != null && Math.abs(row.resultat_k - last.resultat) > 2) return "résultat incohérent";
  if (row.ca_k != null && Math.abs(row.ca_k - last.ca) > 2) return "chiffre d'affaires incohérent";
  if (row.ca_k && Math.abs(row.resultat_pct - (row.resultat_k / row.ca_k) * 100) > 0.6) return "taux incohérent";
  if (row.type === "saison" && row.saison !== an.length) return "saison incohérente";
  if (row.type === "partie" && an.length < 5 && row.statut !== "perdu") return "partie incomplète";
  return null;
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
    saison: type === "saison" ? num(b.saison, 1, 5) : null, annee: num(b.annee, 2026, 2030),
    resultat_pct: num(b.resultat_pct, -100, 100) ?? 0, resultat_k: num(b.resultat_k, -1e7, 1e7), ca_k: num(b.ca_k, 0, 1e7), capital: num(b.capital, 0, 100), etudiants: num(b.etudiants, 0, 1e6),
    tresorerie_k: num(b.tresorerie_k, -1e6, 1e6), mesures: num(b.mesures, 0, 200), statut: clean(b.statut, 20) || null,
  };
  // Historique détaillé de la partie (jauges, école, médias, mesures, années, journal) : objet JSON borné à 60 Ko
  if (b.details && typeof b.details === "object" && !Array.isArray(b.details)) { const d = JSON.stringify(b.details).replace(/[<>]/g, ""); if (d.length <= 60000) row.details = JSON.parse(d); }
  const bad = plausible(row, row.details);
  if (bad) { console.warn("jeudg score refusé :", bad, row.dg, row.profil); return NextResponse.json({ error: "Score refusé : " + bad + "." }, { status: 422 }); }
  if (!url || !key) { console.log("SCORE (Supabase non configuré)", JSON.stringify(row)); return NextResponse.json({ ok: true, offline: true }); }
  const post = (body) => fetch(`${url}/rest/v1/jeu_dg_scores?on_conflict=partie_id,type,saison`, { method: "POST", headers: { ...headers(), Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(body) });
  let r = await post(row);
  if (r.status === 400) { const { resultat_k, ca_k, details, ...rest } = row; r = await post(rest); } // colonnes pas encore créées
  if (!r.ok) { console.error("supabase jeudg", r.status, await r.text()); return NextResponse.json({ error: "Enregistrement impossible." }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}
