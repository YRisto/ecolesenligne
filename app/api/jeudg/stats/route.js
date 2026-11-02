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
  const sc = await all("jeu_dg_scores?select=partie_id,type,profil,statut,created_at,masque" + (short ? "" : ",details") + "&order=created_at.asc").catch(() => []);
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
  // Comment jouent les DG : à partir du dernier état connu de chaque partie (colonne details des scores)
  const last = new Map(); for (const s of sc) if (s.partie_id && s.details) last.set(s.partie_id, s);
  const states = [...last.values()];
  const cnt = (m, k) => m.set(k, (m.get(k) || 0) + 1);
  const mes = new Map(), fins = new Map(), cse = new Map(), env = new Map(), exp = new Map(); let renvoiSum = 0, renvoiN = 0;
  for (const s of states) {
    const d = s.details || {};
    for (const m of new Set(d.mesures || [])) cnt(mes, m);
    const ch = Array.isArray(d.choix) ? d.choix : [];
    for (const c of ch) {
      if (c.q === "Décision express") { const k = c.qt || ("Décision " + c.x); if (!exp.has(k)) exp.set(k, new Map()); cnt(exp.get(k), c.a); }
      else if (c.q === "Questions du CSE") cnt(cse, c.a);
      else if (c.q && c.ph === 3) cnt(env, c.a);
    }
    const o = d.over;
    if (o && o.perdu) { const w = String(o.pourquoi || ""); const cause = /banque|bilan/i.test(w) ? "Faillite : la banque coupe le crédit" : /grève/i.test(w) ? "Grève illimitée (CSE à zéro)" : /hémorragie|habilitation/i.test(w) ? "Exode des inscrits (jauge à zéro)" : /plafonne/i.test(w) ? "Étape de chiffre d'affaires manquée" : /investisseurs/i.test(w) ? "Condition des investisseurs non tenue" : /plus pu vous défendre|capital/i.test(w) ? "Capital à zéro : révocation" : "Autre";
      cnt(fins, cause); const yrs = (d.annees || []).length; if (yrs) { renvoiSum += yrs; renvoiN++; } }
    else if (s.type === "partie" && s.statut) cnt(fins, s.statut === "objectif" ? "Mandat rempli" : s.statut === "equilibre" ? "Demi-succès" : "Objectif manqué");
  }
  const top = (m, n, tot) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ k, v, pct: tot ? Math.round((v / tot) * 100) : null }));
  const jeu = { parties: states.length,
    mesures: top(mes, 15, states.length), fins: top(fins, 12, [...fins.values()].reduce((a, b) => a + b, 0)),
    cse: top(cse, 10, [...cse.values()].reduce((a, b) => a + b, 0)), enveloppes: top(env, 10, [...env.values()].reduce((a, b) => a + b, 0)),
    express: [...exp.entries()].map(([q, m]) => { const tot = [...m.values()].reduce((a, b) => a + b, 0); return { q, total: tot, reponses: top(m, 4, tot) }; }).sort((a, b) => b.total - a.total).slice(0, 14),
    saisonRenvoi: renvoiN ? +(renvoiSum / renvoiN).toFixed(1) : null };
  return NextResponse.json({
    maj: new Date().toISOString(), mesureDepuis: ev.length ? ev[0].created_at : null, evenements: evOk,
    totals: { ...totals, visites: vis.length, visiteurs: uniq.size, mobile: vis.length ? Math.round((vis.filter((e) => e.mobile).length / vis.length) * 100) : null, appli: vis.length ? Math.round((vis.filter((e) => e.appli).length / vis.length) * 100) : null },
    parJour, parEcole: Object.values(parEcole).sort((a, b) => b.lancees - a.lancees), jeu,
  }, { headers: { "Cache-Control": "no-store" } });
}
