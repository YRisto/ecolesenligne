import Link from "next/link";
import { notFound } from "next/navigation";
import { getEcoles, getEcole, getOffresByEcole, eur } from "../../../lib/catalogue";
export function generateStaticParams() { return getEcoles().map((e) => ({ slug: e.slug })); }
export async function generateMetadata({ params }) { const { slug } = await params; const e = getEcole(slug); return { title: e ? `${e.nom} : avis, prix et formations à distance` : "École" }; }
export default async function Page({ params }) {
  const { slug } = await params; const e = getEcole(slug); if (!e) notFound();
  const offres = getOffresByEcole(slug);
  return (
    <>
      <h1>{e.nom}</h1>
      <p className="lead">{e.groupe ? `Marque du groupe ${e.groupe}. ` : ""}{offres.length} formation{offres.length > 1 ? "s" : ""} référencée{offres.length > 1 ? "s" : ""} sur ecolesenligne.fr.</p>
      <div className="card" style={{ maxWidth: 720 }}>
        <dl className="facts" style={{ gridTemplateColumns: "repeat(2,1fr)" }}>
          <div><dt>Avis</dt><dd>{e.avis?.note ? `${e.avis.note}/5 (${e.avis.nombre} avis ${e.avis.source})` : "non communiqué"}</dd></div>
          <div><dt>Garantie</dt><dd>{e.garantie || "non communiqué"}</dd></div>
          <div><dt>Accompagnement</dt><dd>{e.accompagnement || "non communiqué"}</dd></div>
          <div><dt>Supports</dt><dd>{e.supports || "non communiqué"}</dd></div>
          <div><dt>Modalités</dt><dd>{e.modalites || "non communiqué"}</dd></div>
          <div><dt>Préparation examen</dt><dd>{e.preparation_examen || "non communiqué"}</dd></div>
        </dl>
        {e.site && <a href={e.site} target="_blank" rel="nofollow noopener" className="btn btn-outline">Site de l'école</a>}
      </div>
      <h2>Formations</h2>
      <table className="compare"><thead><tr><th>Formation</th><th>Prix total</th><th>Durée</th><th>Diplôme</th><th></th></tr></thead>
        <tbody>{offres.map((o) => <tr key={o.formation}><td><Link href={`/formations/${o.formationObj?.slug}`}>{o.formationObj?.intitule}</Link></td><td>{eur(o.prix_total_eur)}</td><td>{o.duree_heures ? `${o.duree_heures} h` : ""} {o.duree_acces}</td><td>{o.diplome || "—"}</td><td><Link href={`/formations/${o.formationObj?.slug}`} className="btn btn-sm">Comparer</Link></td></tr>)}</tbody></table>
    </>
  );
}
