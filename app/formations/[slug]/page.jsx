import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormations, getFormation, formatPrix } from "../../../lib/catalogue";
export function generateStaticParams() { return getFormations().map((f) => ({ slug: f.slug })); }
export async function generateMetadata({ params }) { const { slug } = await params; const f = getFormation(slug); return { title: f ? `${f.intitule} — ${f.ecoleObj?.nom}` : "Formation" }; }
export default async function Page({ params }) {
  const { slug } = await params; const f = getFormation(slug); if (!f) notFound();
  return (
    <>
      <p className="muted"><Link href="/formations">Formations</Link> › {f.domaine}</p>
      <span className="chip">{f.type}</span>{f.niveau && <span className="chip chip-muted">{f.niveau}</span>}{f.cpf && <span className="chip chip-ok">Éligible CPF</span>}
      <h1>{f.intitule}</h1>
      <p className="lead">Proposée par <Link href={`/ecoles/${f.ecole}`}>{f.ecoleObj?.nom}</Link>, 100 % à distance.</p>
      <div className="card" style={{ maxWidth: 640 }}>
        <dl className="facts" style={{ gridTemplateColumns: "repeat(2,1fr)" }}>
          <div><dt>Durée</dt><dd>{f.duree || "—"}</dd></div>
          <div><dt>Prix indicatif</dt><dd>{formatPrix(f)}</dd></div>
          <div><dt>Code RNCP</dt><dd>{f.rncp || "—"}</dd></div>
          <div><dt>Alternance possible</dt><dd>{f.alternance ? "Oui" : "Non"}</dd></div>
        </dl>
        {f.description && <p>{f.description}</p>}
        <p><Link href={`/demande?formation=${f.slug}`} className="btn">Demander des renseignements</Link> {f.url_ecole && <a href={f.url_ecole} rel="nofollow sponsored noopener" target="_blank" className="btn btn-outline">Site de l'école</a>}</p>
      </div>
    </>
  );
}
