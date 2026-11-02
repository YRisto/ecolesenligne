import { NextResponse } from "next/server";

// Statistiques agrégées du Jeu du DG (aucune donnée personnelle) : visites, visiteurs uniques, parties lancées / terminées / gagnées.
const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers = () => ({ apikey: key, ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}) });
const day = (d) => new Date(new Date(d).getTime() + 3600e3).toISOString().slice(0, 10); // jour en heure de Paris (approx. hiver)

async function all(path) {
  const out = [];
  for (let off = 0; off < 200000; off += 1000) {
    const r = await fetch(`${url}/rest/v1/${path}&limit=1000&offset=${off}`, { headers: headers(), cache: "no-store" });
    if (!r.ok) { if (off === 0) throw new Error(path.split("?")[0] + " " + r.status); break; }
    const rows = await r.json(); out.push(...rows); if (rows.length < 1000) break;
  }
  return out;
}

export async function GET(req) {
  if (!url || !key) return NextResponse.json({ offline: true });
  const q = new URL(req.url).searchParams; const short = q.get("court") === "1";
  let ev = [], evOk = true;
  try { ev = await all("jeu_dg_events?select=kind,visiteur,partie_id,ecole,mobile,appli,statut,created_at&order=created_at.asc"); } catch (e) { evOk = false; }
  const sc = await all("jeu_dg_scores?select=partie_id,type,profil,statut,created_at,masque&order=created_at.asc").catch(() => []);
  const ECOLES = ["Xyn and You", "LinguIA", "ENACTO Business School", "Centre National de Formation", "Hippocampus", "Les Cuisines de Minuit", "Académie Orbitale", "L'École des Nouveaux Paysans"];
  const ecoleOf = (p) => ECOLES.find((n) => String(p || "").startsWith(n)) || "Autre";
  // parties : une partie est « lancée » si elle a un début enregistré ou au moins une saison jouée ; « terminée » si elle a sa ligne de fin
  const parties = new Map();
  const P = (id) => { if (!parties.has(id)) parties.set(id, { id, ecole: null, start: null, fin: null, statut: null }); return parties.get(id); };
  for (const e of ev) if (e.partie_id && e.kind === "debut") { const p = P(e.partie_id); p.start = p.start || e.created_at; p.ecole = p.ecole || e.ecole; }
  for (const s of sc) { if (!s.partie_id) continue; const p = P(s.partie_id); p.start = p.start && p.start < s.created_at ? p.start : (p.start || s.created_at); p.ecole = p.ecole || ecoleOf(s.profil); if (s.type === "partie") { p.fin = p.fin || s.created_at; p.statut = p.statut || s.statut; } }
  const list = [...parties.values()];
  const totals = { lancees: list.length, terminees: list.filter((p) => p.fin).length, gagnees: list.filter((p) => p.statut === "objectif").length, revoquees: list.filter((p) => p.statut === "perdu").length };
  if (short) return NextResponse.json(totals, { headers: { "Cache-Control": "s-maxage=60" } });
  const vis = ev.filter((e) => e.kind === "visite");
  const days = {};
  const D = (d) => (days[d] = days[d] || { jour: d, visites: 0, visiteurs: new Set(), lancees: 0, terminees: 0 });
  for (const e of vis) { const x = D(day(e.created_at)); x.visites++; x.visiteurs.add(e.visiteur); }
  for (const p of list) { if (p.start) D(day(p.start)).lancees++; if (p.fin) D(day(p.fin)).terminees++; }
  const parJour = Object.values(days).sort((a, b) => a.jour.localeCompare(b.jour)).map((x) => ({ ...x, visiteurs: x.visiteurs.size }));
  const parEcole = {}; for (const p of list) { const k = p.ecole || "Autre"; const x = (parEcole[k] = parEcole[k] || { ecole: k, lancees: 0, terminees: 0, gagnees: 0 }); x.lancees++; if (p.fin) x.terminees++; if (p.statut === "objectif") x.gagnees++; }
  const uniq = new Set(vis.map((e) => e.visiteur));
  return NextResponse.json({
    maj: new Date().toISOString(), mesureDepuis: ev.length ? ev[0].created_at : null, evenements: evOk,
    totals: { ...totals, visites: vis.length, visiteurs: uniq.size, mobile: vis.length ? Math.round((vis.filter((e) => e.mobile).length / vis.length) * 100) : null, appli: vis.length ? Math.round((vis.filter((e) => e.appli).length / vis.length) * 100) : null },
    parJour, parEcole: Object.values(parEcole).sort((a, b) => b.lancees - a.lancees),
  }, { headers: { "Cache-Control": "no-store" } });
}
