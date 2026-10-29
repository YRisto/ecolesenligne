import Link from "next/link";
import { prixMin, eur } from "../lib/catalogue";
export default function FormationCard({ f }) {
  const pm = prixMin(f.code);
  return (
    <article className="card fcard">
      <div className="fcard-top"><span className="chip">{f.type}</span><span className="chip chip-muted">{f.niveau}</span></div>
      <h3><Link href={`/formations/${f.slug}`}>{f.intitule}</Link></h3>
      <p className="muted">{f.domaine}</p>
      <dl className="facts">
        <div><dt>Écoles comparées</dt><dd>{f.nbEcoles}</dd></div>
        <div><dt>À partir de</dt><dd>{eur(pm)}</dd></div>
      </dl>
      <Link href={`/formations/${f.slug}`} className="btn">Comparer les écoles</Link>
    </article>
  );
}
