"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";

export default function LeadForm({ formations, ecoles, offres, tous }) {
  const params = useSearchParams();
  const preset = formations.find((f) => f.slug === params.get("formation"));
  const [formation, setFormation] = useState(preset?.slug || "");
  const clic = params.get("ecole") || "";
  const fObj = formations.find((f) => f.slug === formation);
  const ecolesDispo = fObj ? ecoles.filter((e) => offres.some((o) => o.formation === fObj.code && o.ecole === e.slug)) : ecoles;
  // École cliquée dans le comparateur : si elle n'est pas partenaire, on présélectionne « Autre école »
  const nomClic = tous.find((e) => e.slug === clic)?.nom || "";
  const [ecole, setEcole] = useState(!clic ? "" : ecoles.some((e) => e.slug === clic) ? clic : nomClic ? "autre" : "");
  const [autreNom, setAutreNom] = useState(nomClic && !ecoles.some((e) => e.slug === clic) ? nomClic : "");
  const [autres, setAutres] = useState(false);
  const [cgu, setCgu] = useState(false);
  const [state, setState] = useState({ status: "idle" });

  async function submit(e) {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.currentTarget).entries());
    setState({ status: "loading" });
    const res = await fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...fd, formation, ecole_preferee: ecole, ecole_souhaitee: ecole === "autre" ? autreNom : "", consent_autres_ecoles: autres, consent_cgu: cgu, source: window.location.href }) });
    const json = await res.json().catch(() => ({}));
    setState(res.ok ? { status: "ok" } : { status: "error", message: json.error || "Une erreur est survenue." });
  }

  if (state.status === "ok") return <div className="notice success"><strong>Demande envoyée.</strong> Un conseiller vous recontacte sous 48 h ouvrées.</div>;

  return (
    <form className="form" onSubmit={submit}>
      <label>Formation qui vous intéresse
        <select value={formation} onChange={(e) => { setFormation(e.target.value); setEcole(""); }}>
          <option value="">— Choisir —</option>{formations.map((f) => <option key={f.slug} value={f.slug}>{f.intitule}</option>)}
        </select></label>
      <label>École qui a votre préférence *
        <select required value={ecole} onChange={(e) => setEcole(e.target.value)}>
          <option value="">— Choisir —</option>{ecolesDispo.map((x) => <option key={x.slug} value={x.slug}>{x.nom}</option>)}<option value="autre">Autre école</option>
        </select></label>
      {ecole === "autre" && <label>Quelle école ? (facultatif)<input value={autreNom} onChange={(e) => setAutreNom(e.target.value)} placeholder="Nom de l'école qui vous intéresse" /></label>}
      <div className="row"><label>Prénom *<input name="prenom" required autoComplete="given-name" /></label><label>Nom *<input name="nom" required autoComplete="family-name" /></label></div>
      <div className="row"><label>E-mail *<input name="email" type="email" required autoComplete="email" /></label><label>Téléphone *<input name="telephone" type="tel" required autoComplete="tel" /></label></div>
      <div className="row"><label>Code postal<input name="code_postal" inputMode="numeric" autoComplete="postal-code" /></label>
        <label>Votre situation<select name="situation"><option value="">—</option><option>Lycéen·ne</option><option>Étudiant·e</option><option>Salarié·e</option><option>Demandeur·se d'emploi</option><option>Autre</option></select></label></div>
      <label>Votre projet (facultatif)<textarea name="message" rows={3} /></label>
      <div className="notice">
        {ecole === "autre" ? "Cette école n'étant pas partenaire, votre demande sera transmise aux écoles partenaires proposant une formation similaire (votre accord ci-dessous est nécessaire). " : "Votre demande est transmise à l'école indiquée ci-dessus. "}Les écoles présentées sur ecolesenligne.fr sont des partenaires qui rémunèrent le site pour la mise en relation.
      </div>
      <label className="consent"><input type="checkbox" required={ecole === "autre"} checked={autres} onChange={(e) => setAutres(e.target.checked)} />
        <span>J'accepte que ma demande soit également mise à disposition d'autres écoles référencées sur ecolesenligne.fr proposant une formation similaire, afin de recevoir plusieurs propositions.{ecole === "autre" ? " *" : " (facultatif)"}</span></label>
      <label className="consent"><input type="checkbox" required checked={cgu} onChange={(e) => setCgu(e.target.checked)} />
        <span>J'ai lu la <a href="/confidentialite" target="_blank">politique de confidentialité</a> et j'accepte d'être recontacté·e par e-mail et téléphone au sujet de ma demande. *</span></label>
      <input type="text" name="website" tabIndex={-1} autoComplete="off" style={{ position: "absolute", left: -9999 }} aria-hidden="true" />
      {state.status === "error" && <div className="notice error">{state.message}</div>}
      <button className="btn" disabled={state.status === "loading"}>{state.status === "loading" ? "Envoi…" : "Envoyer ma demande"}</button>
    </form>
  );
}
