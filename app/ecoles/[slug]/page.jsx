import Link from "next/link";
import { notFound } from "next/navigation";
import { getEcoles, getEcole, getOffresByEcole, eur } from "../../../lib/catalogue";
import PageHero from "../../../components/PageHero";
export function generateStaticParams() { return getEcoles().map((e) => ({ slug: e.slug })); }
export async function generateMetadata({ params }) { const { slug } = await params; const e = getEcole(slug); return { title: e ? `${e.nom} : avis, prix et formations à distance` : "École" }; }
export default async function Page({ params }) {
  const { slug } = await params; const e = getEcole(slug); if (!e) notFound();
  const offres = getOffresByEcole(slug);
  const nc = (v) => v || "non communiqué";
  const faits = [["Garantie", e.garantie], ["Accompagnement", e.accompagnement], ["Supports", e.supports], ["Modalités", e.modalites], ["Préparation examen", e.preparation_examen]];
  return (
    <>
      <PageHero
        crumbs={[{ label: "Formations", href: "/formations" }, { label: "École" }]}
        titre={e.nom}
        sous={`${e.groupe ? `Marque du groupe ${e.groupe}. ` : ""}${offres.length} formation${offres.length > 1 ? "s" : ""} référencée${offres.length > 1 ? "s" : ""} sur ecolesenligne.fr.`}
        aside={e.avis?.note ? <ul className="phero-stats"><li><strong>{String(e.avis.note).replace(".", ",")}/5</strong><span>{e.avis.nombre} avis {e.avis.source}</span></li><li><strong>{offres.length}</strong><span>formations comparées</span></li></ul> : <ul className="phero-stats"><li><strong>{offres.length}</strong><span>formations comparées</span></li></ul>}
      />
      <section className="sec sec-white sec-tight">
        <div className="sec-in">
          <h2 className="display h-dark">L'école en bref</h2>
          <dl className="bigfacts">{faits.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{nc(v)}</dd></div>)}</dl>
        </div>
      </section>
      <section className="sec sec-gris sec-tight">
        <div className="sec-in">
          <h2 className="display h-dark">Ses formations</h2>
          <ul className="rows">
            {offres.map((o) => (
              <li key={o.formation}><Link href={`/formations/${o.formationObj?.slug}`}>
                <span className="r-t">{o.formationObj?.intitule}</span>
                <span className="r-m">{o.duree_heures ? `${o.duree_heures} h` : ""} {o.diplome || ""}</span>
                <span className="r-p">{o.prix_total_eur ? eur(o.prix_total_eur) : "sur demande"}</span>
              </Link></li>
            ))}
          </ul>
        </div>
      </section>
      <section className="sec sec-or sec-tight">
        <div className="sec-in cta-f"><h2 className="display h-dark">Envie d'en savoir plus ?</h2><Link href={`/demande?ecole=${e.slug}`} className="btn-noir">Demander des infos</Link></div>
      </section>
    </>
  );
}
