"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";

export default function LeadForm({ formations, ecoles }) {
  const params = useSearchParams();
  const preset = formations.find((f) => f.slug === params.get("formation"));
  const [formation, setFormation] = useState(preset?.slug || "");
  const [ecole, setEcole] = useState(preset?.ecole || "");
  const [autres, setAutres] = useState(false);
  const [cgu, setCgu] = useState(false);
  const [state, setState] = useState({ status: "idle" });

  async function submit(e) {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.currentTarget).entries());
    setState({ status: "loading" });
    const res = await fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...fd, formation, ecole_preferee: ecole, consent_autres_ecoles: autres, consent_cgu: cgu, source: window.location.href }) });
    const json = await res.json().catch(() => ({}));
    setState(res.ok ? { status: "ok" } : { status: "error", message: json.error || "Une erreur est survenue." });
  }

  if (state.status === "ok") return <div className="notice success"><strong>Demande envoyée.</strong> Un conseiller vous recontacte sous 48 h ouvrées.</div>;

  return (
    <form className="form" onSubmit={submit}>
      <label>Formation qui vous intéresse
        <select value={formation} onChange={(e) => { setFormation(e.target.value); const f = formations.find((x) => x.slug === e.target.value); if (f) setEcole(f.ecole); }}>
          <option value="">— Choisir —</option>{formations.map((f) => <option key={f.slug} value={f.slug}>{f.intitule} ({f.ecoleObj?.nom})</option>)}
        </select></label>
      <label>École qui a votre préférence *
        <select required value={ecole} onChange={(e) => setEcole(e.target.value)}>
          <option value="">— Choisir —</option>{ecoles.map((x) => <option key={x.slug} value={x.slug}>{x.nom}</option>)}
        </select></label>
      <div className="row"><label>Prénom *<input name="prenom" required autoComplete="given-name" /></label><label>Nom *<input name="nom" required autoComplete="family-name" /></label></div>
      <div className="row"><label>E-mail *<input name="email" type="email" required autoComplete="email" /></label><label>Téléphone *<input name="telephone" type="tel" required autoComplete="tel" /></label></div>
      <div className="row"><label>Code postal<input name="code_postal" inputMode="numeric" autoComplete="postal-code" /></label>
        <label>Votre situation<select name="situation"><option value="">—</option><option>Lycéen·ne</option><option>Étudiant·e</option><option>Salarié·e</option><option>Demandeur·se d'emploi</option><option>Autre</option></select></label></div>
      <label>Votre projet (facultatif)<textarea name="message" rows={3} /></label>
      <div className="notice">
        Votre demande est transmise à l'école indiquée ci-dessus. Les écoles présentées sur ecolesenligne.fr sont des partenaires qui rémunèrent le site pour la mise en relation.
      </div>
      <label className="consent"><input type="checkbox" checked={autres} onChange={(e) => setAutres(e.target.checked)} />
        <span>J'accepte que ma demande soit également mise à disposition d'autres écoles référencées sur ecolesenligne.fr proposant une formation similaire, afin de recevoir plusieurs propositions. (facultatif)</span></label>
      <label className="consent"><input type="checkbox" required checked={cgu} onChange={(e) => setCgu(e.target.checked)} />
        <span>J'ai lu la <a href="/confidentialite" target="_blank">politique de confidentialité</a> et j'accepte d'être recontacté·e par e-mail et téléphone au sujet de ma demande. *</span></label>
      <input type="text" name="website" tabIndex={-1} autoComplete="off" style={{ position: "absolute", left: -9999 }} aria-hidden="true" />
      {state.status === "error" && <div className="notice error">{state.message}</div>}
      <button className="btn" disabled={state.status === "loading"}>{state.status === "loading" ? "Envoi…" : "Envoyer ma demande"}</button>
    </form>
  );
}
