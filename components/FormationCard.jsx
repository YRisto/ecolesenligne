import Link from "next/link";
import { prixMin, eur } from "../lib/catalogue";
export default function FormationCard({ f }) {
  const pm = prixMin(f.code);
  return (
    <Link href={`/formations/${f.slug}`} className="fcard">
      <div className="fcard-body">
        <p className="fcard-chips"><span className="chip">{f.type}</span>{f.niveau && <span className="chip chip-muted">{f.niveau}</span>}</p>
        <h3>{f.intitule}</h3>
        <p className="fcard-dom">{f.domaine}</p>
      </div>
      <div className="fcard-foot"><span>{f.nbEcoles} écoles comparées</span><strong>{pm ? `dès ${eur(pm)}` : "prix sur demande"}</strong></div>
    </Link>
  );
}
