"use client";
import { useState } from "react";

const ICONS = {
  briefcase: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5h6v2M3 13h18" /></>,
  cap: <><path d="M2 9l10-5 10 5-10 5z" /><path d="M6 11v5c0 1.500 3 3 6 3s6-1.500 6-3v-5" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-5-5" /></>,
  dots: <><circle cx="12" cy="12" r="9" /><path d="M8 12h.01M12 12h.01M16 12h.01" strokeWidth="3" /></>,
  wallet: <><rect x="3" y="6" width="18" height="14" rx="2" /><path d="M3 10h18M16 15h2" /></>,
  bolt: <path d="M13 2L4 14h7l-1 8 9-12h-7z" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
};
const Icon = ({ n }) => <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[n] || ICONS.dots}</svg>;

export default function LpQuiz({ lp }) {
  const steps = lp.quiz;
  const total = steps.length + 1;
  const [i, setI] = useState(0);
  const [rep, setRep] = useState({});
  const [st, setSt] = useState({ status: "idle" });
  const [cgu, setCgu] = useState(false);

  function choisir(k, v) { setRep((r) => ({ ...r, [k]: v })); setI((x) => x + 1); }

  async function envoyer(e) {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.currentTarget).entries());
    setSt({ status: "loading" });
    const detail = steps.map((s) => `${s.k} : ${rep[s.k] || "—"}`).join(" ; ");
    try {
      const res = await fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        prenom: fd.prenom, nom: fd.nom, email: fd.email, telephone: fd.telephone, code_postal: fd.code_postal, website: fd.website,
        situation: rep.situation || "", formation: lp.formation, ecole_preferee: lp.ecole, lp: lp.slug, message: detail,
        consent_cgu: cgu, consent_autres_ecoles: false, source: window.location.href,
      }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return setSt({ status: "error", message: json.error || "Une erreur est survenue." });
      try { (window.dataLayer = window.dataLayer || []).push({ event: "lead_lp", lp: lp.slug }); } catch {}
      setSt({ status: "ok" });
    } catch { setSt({ status: "error", message: "Connexion impossible, réessayez." }); }
  }

  if (st.status === "ok") return (
    <div className="lpq lpq-ok" id="demande">
      <div className="lpq-bar"><i style={{ width: "100%" }} /></div>
      <h2>Merci {""}!</h2>
      <p>Votre demande est bien partie. Un conseiller du {lp.ecoleObj?.nom} vous recontacte rapidement pour vous envoyer la brochure et répondre à vos questions.</p>
    </div>
  );

  const s = steps[i];
  return (
    <div className="lpq" id="demande">
      <div className="lpq-bar" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={i + 1}><i style={{ width: `${((i + 1) / total) * 100}%` }} /></div>
      {s ? (
        <div key={i} className="lpq-step">
          <h2>{s.q}</h2>
          <div className="lpq-opts">
            {s.o.map(([label, icon]) => (
              <button key={label} type="button" className="lpq-opt" onClick={() => choisir(s.k, label)}><Icon n={icon} /><span>{label}</span></button>
            ))}
          </div>
          {i > 0 && <button type="button" className="lpq-back" onClick={() => setI(i - 1)}>← Retour</button>}
        </div>
      ) : (
        <form key="f" className="lpq-step lpq-form" onSubmit={envoyer}>
          <h2>Dernière étape : où vous envoyer votre brochure ?</h2>
          <div className="lpq-row"><label>Prénom<input name="prenom" required autoComplete="given-name" /></label><label>Nom<input name="nom" required autoComplete="family-name" /></label></div>
          <div className="lpq-row"><label>E-mail<input name="email" type="email" required autoComplete="email" /></label><label>Téléphone<input name="telephone" type="tel" required autoComplete="tel" /></label></div>
          <label>Code postal<input name="code_postal" inputMode="numeric" autoComplete="postal-code" /></label>
          <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: -9999 }} />
          <label className="lpq-consent"><input type="checkbox" required checked={cgu} onChange={(e) => setCgu(e.target.checked)} /><span>{lp.consent} <a href="/confidentialite" target="_blank" rel="noopener">Confidentialité</a></span></label>
          {st.status === "error" && <p className="lpq-err" role="alert">{st.message}</p>}
          <button className="lpq-go" disabled={st.status === "loading"}>{st.status === "loading" ? "Envoi…" : lp.cta}</button>
          <button type="button" className="lpq-back" onClick={() => setI(i - 1)}>← Retour</button>
        </form>
      )}
    </div>
  );
}
