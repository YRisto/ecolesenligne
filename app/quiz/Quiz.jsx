"use client";
import { useState } from "react";
import Link from "next/link";
import DomaineIllu from "../../components/DomaineIllu";

const eur = (n) => (n ? `${Number(n).toLocaleString("fr-FR")} €` : "prix sur demande");
const QUESTIONS = [
  { k: "niveau", t: "Quel niveau de diplôme visez-vous ?", o: [["3", "CAP / BEP", "Niveau 3"], ["4", "Bac, bac pro, titre pro", "Niveau 4"], ["5", "Bac+2, BTS", "Niveau 5"], ["6", "Bac+3 et plus", "Niveaux 6 et 7"], ["0", "Pas de diplôme, juste des compétences", "Formation qualifiante"], ["", "Peu importe", ""]] },
  { k: "budget", t: "Quel budget total pouvez-vous y consacrer ?", o: [["1500", "Moins de 1 500 €", ""], ["3000", "Jusqu'à 3 000 €", ""], ["5000", "Jusqu'à 5 000 €", ""], ["99999", "Plus de 5 000 €", ""], ["", "Je ne sais pas encore", ""]] },
  { k: "fin", t: "Comment comptez-vous la financer ?", o: [["cpf", "Mon CPF", "Compte personnel de formation"], ["emploi", "France Travail", ""], ["employeur", "Mon employeur / OPCO", ""], ["perso", "Je paie moi-même", "En plusieurs fois possible"], ["", "Je ne sais pas", ""]] },
  { k: "objectif", t: "Quel est votre objectif ?", o: [["reconversion", "Me reconvertir", "Changer de métier"], ["evoluer", "Évoluer dans mon métier", "Monter en compétences"], ["vae", "Faire valider mon expérience", "VAE"], ["diplome", "Passer un diplôme", "Études, première qualification"]] },
];

function score(f, r, domaine) {
  let s = 0; const why = [];
  if (domaine) { if (f.domaine === domaine) { s += 40; why.push(`Dans votre domaine : ${f.domaine}`); } }
  if (r.niveau === "0") { if (f.niveau == null) { s += 25; why.push("Formation qualifiante, sans niveau imposé"); } }
  else if (r.niveau && f.niveau != null) {
    const d = Math.abs(f.niveau - Number(r.niveau));
    if (d === 0) { s += 25; why.push(`Niveau ${f.niveau} comme souhaité`); } else if (d === 1) s += 10;
    else if (f.niveau >= 6 && Number(r.niveau) >= 6) s += 25;
  }
  if (r.budget && f.prix) {
    const b = Number(r.budget);
    if (f.prix <= b) { s += 20; why.push(`Dès ${eur(f.prix)}, dans votre budget`); } else if (f.prix <= b * 1.25) s += 6;
    else s -= 8;
  }
  if (r.fin && f.fin[r.fin]) { s += 15; why.push({ cpf: "Finançable avec le CPF", emploi: "Financements France Travail possibles", employeur: "Prise en charge employeur / OPCO possible", perso: "Paiement en plusieurs fois possible" }[r.fin]); }
  const isVae = f.type === "VAE";
  if (r.objectif === "vae") s += isVae ? 30 : -30;
  else if (isVae) s -= 25;
  if (r.objectif === "reconversion" && ["CAP", "Titre professionnel", "Formation qualifiante"].includes(f.type)) { s += 8; why.push("Un format adapté à la reconversion"); }
  if (r.objectif === "evoluer" && ["BTS", "Bachelor", "Certification", "Formation qualifiante", "Titre professionnel"].includes(f.type)) s += 8;
  if (r.objectif === "diplome" && ["CAP", "Bac pro", "BTS", "Bachelor"].includes(f.type)) { s += 8; why.push("Un diplôme d'État ou équivalent"); }
  if (f.best) s += (f.best.note - 3) * 2;
  return { s, why };
}

export default function Quiz({ formations, domaines }) {
  const [step, setStep] = useState(0); // 0 = domaine, 1..4 = QUESTIONS, 5 = résultat
  const [domaine, setDomaine] = useState("");
  const [rep, setRep] = useState({});
  const total = QUESTIONS.length + 1;

  const reset = () => { setStep(0); setDomaine(""); setRep({}); };

  if (step >= total) {
    const res = formations.map((f) => ({ f, ...score(f, rep, domaine) })).sort((a, b) => b.s - a.s).slice(0, 3);
    return (
      <div className="quiz">
        <p className="quiz-prog">Votre résultat</p>
        <h2 className="display h-dark">Voici vos 3 meilleures pistes</h2>
        <ol className="quiz-res">
          {res.map(({ f, why }, i) => (
            <li key={f.slug}>
              <span className="qr-n">{i + 1}</span>
              <DomaineIllu domaine={f.domaine} className="qr-illu" />
              <div className="qr-body">
                <p className="qr-chips"><span className="chip">{f.type}</span></p>
                <h3>{f.intitule}</h3>
                <ul className="qr-why">{why.slice(0, 3).map((w) => <li key={w}>{w}</li>)}{!why.length && <li>{f.nbEcoles} écoles comparées</li>}</ul>
                {f.best && <p className="qr-best">Meilleure note : <strong>{f.best.nom}</strong> ({String(f.best.note.toFixed(1)).replace(".", ",")}/5){f.best.prix ? `, ${eur(f.best.prix)}` : ""}</p>}
                <div className="qr-actions">
                  <Link href={`/formations/${f.slug}`} className="btn-noir">Comparer les {f.nbEcoles} écoles</Link>
                  <Link href={`/demande?formation=${f.slug}`} className="btn-or">Demander des infos</Link>
                </div>
              </div>
            </li>
          ))}
        </ol>
        <button className="quiz-again" onClick={reset}>Refaire le quiz</button>
      </div>
    );
  }

  const q = step === 0 ? null : QUESTIONS[step - 1];
  const next = () => setStep((s) => s + 1);
  return (
    <div className="quiz">
      <div className="quiz-bar" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={step + 1}><i style={{ width: `${((step + 1) / total) * 100}%` }} /></div>
      <p className="quiz-prog">Question {step + 1} sur {total}</p>
      <h2 className="display h-dark">{q ? q.t : "Quel domaine vous attire ?"}</h2>
      <div className="quiz-opts" key={step}>
        {step === 0 ? (
          <>
            {domaines.map((d) => (
              <button key={d} className="qo qo-illu" onClick={() => { setDomaine(d); next(); }}><DomaineIllu domaine={d} className="qo-i" /><span>{d}</span></button>
            ))}
            <button className="qo" onClick={() => { setDomaine(""); next(); }}><span>Je ne sais pas encore</span></button>
          </>
        ) : q.o.map(([v, label, sub]) => (
          <button key={label} className="qo" onClick={() => { setRep((r) => ({ ...r, [q.k]: v })); next(); }}>
            <span>{label}</span>{sub && <small>{sub}</small>}
          </button>
        ))}
      </div>
      {step > 0 && <button className="quiz-back" onClick={() => setStep((s) => s - 1)}>← Question précédente</button>}
    </div>
  );
}
