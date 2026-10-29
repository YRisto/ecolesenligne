import Link from "next/link";
import { formatPrix } from "../lib/catalogue";
export default function FormationCard({ f }) {
  return (
    <article className="card fcard">
      <div className="fcard-top">
        <span className="chip">{f.type}</span>
        {f.niveau && <span className="chip chip-muted">{f.niveau}</span>}
        {f.cpf && <span className="chip chip-ok">CPF</span>}
      </div>
      <h3><Link href={`/formations/${f.slug}`}>{f.intitule}</Link></h3>
      <p className="muted">{f.ecoleObj?.nom} · {f.domaine}</p>
      <dl className="facts">
        <div><dt>Durée</dt><dd>{f.duree || "—"}</dd></div>
        <div><dt>Prix</dt><dd>{formatPrix(f)}</dd></div>
        <div><dt>RNCP</dt><dd>{f.rncp || "—"}</dd></div>
      </dl>
      <Link href={`/demande?formation=${f.slug}`} className="btn">Demander des renseignements</Link>
    </article>
  );
}
