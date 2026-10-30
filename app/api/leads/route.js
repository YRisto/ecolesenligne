import { NextResponse } from "next/server";
import { getFormation, getEcole } from "../../../lib/catalogue";

export async function POST(req) {
  const b = await req.json().catch(() => null);
  if (!b) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  if (b.website) return NextResponse.json({ ok: true }); // honeypot anti-spam
  const required = ["prenom", "nom", "email", "telephone", "ecole_preferee"];
  for (const k of required) if (!b[k]) return NextResponse.json({ error: "Merci de remplir tous les champs obligatoires." }, { status: 400 });
  if (!b.consent_cgu) return NextResponse.json({ error: "Le consentement est obligatoire." }, { status: 400 });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email)) return NextResponse.json({ error: "E-mail invalide." }, { status: 400 });

  const f = b.formation ? getFormation(b.formation) : null;
  const e = b.ecole_preferee === "autre" ? null : getEcole(b.ecole_preferee);
  const autre = b.ecole_preferee === "autre";
  if (autre && !b.consent_autres_ecoles) return NextResponse.json({ error: "Pour une école non partenaire, votre accord de mise à disposition aux autres écoles est nécessaire." }, { status: 400 });
  const souhaitee = autre && b.ecole_souhaitee ? String(b.ecole_souhaitee).slice(0, 120) : null;
  const lead = {
    prenom: b.prenom, nom: b.nom, email: b.email, telephone: b.telephone, code_postal: b.code_postal || null,
    situation: b.situation || null, formation_slug: f?.slug || null, formation_intitule: f?.intitule || null,
    ecole_preferee_slug: autre ? "autre" : e?.slug || null, domaine: f?.domaine || null,
    message: [souhaitee ? `[École souhaitée : ${souhaitee}]` : null, b.message || null].filter(Boolean).join(" ") || null,
    consent_ecole_preferee: true, consent_autres_ecoles: !!b.consent_autres_ecoles, consent_cgu: true,
    ip: req.headers.get("x-forwarded-for")?.split(",")[0] || null, user_agent: req.headers.get("user-agent") || null, source: b.source || null,
  };

  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    const r = await fetch(`${url}/rest/v1/leads_inbox`, { method: "POST", headers: { apikey: key, ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}), "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify(lead) });
    if (!r.ok) { console.error("supabase", r.status, await r.text()); return NextResponse.json({ error: "Enregistrement impossible, réessayez." }, { status: 500 }); }
  } else {
    console.log("LEAD (Supabase non configuré)", JSON.stringify(lead));
  }
  return NextResponse.json({ ok: true });
}
