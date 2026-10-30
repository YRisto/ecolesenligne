import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormations, getFormation, getOffres, eur, prixMin } from "../../../lib/catalogue";
import TableauComparatif from "../../../components/TableauComparatif";
import conf from "../../../data/ponderation.json";
import videos from "../../../data/videos.json";
import VideoMetier from "../../../components/VideoMetier";

export function generateStaticParams() { return getFormations().map((f) => ({ slug: f.slug })); }
export async function generateMetadata({ params }) {
  const { slug } = await params; const f = getFormation(slug); if (!f) return {};
  return { title: `${f.intitule} à distance : comparatif des écoles`, description: `Comparez ${f.nbEcoles} écoles proposant ${f.intitule} 100 % à distance : prix, durée, diplôme, financement CPF, avis et note.` };
}
export default async function Page({ params }) {
  const { slug } = await params; const f = getFormation(slug); if (!f) notFound();
  const offres = getOffres(f.code); const s = f.synthese; const v = videos[f.code];
  return (
    <>
      <p className="muted"><Link href="/formations">Formations</Link> › {f.domaine}</p>
      <span className="chip">{f.type}</span><span className="chip chip-muted">{f.niveau}</span>
      <h1>{f.intitule} à distance : quelle école choisir ?</h1>
      <p className="lead">{offres.length} école{offres.length > 1 ? "s" : ""} comparée{offres.length > 1 ? "s" : ""} sur les mêmes critères{prixMin(f.code) ? `, à partir de ${eur(prixMin(f.code))}` : ""}. Classement par note ecolesenligne.fr.</p>
      {v && <section aria-label="Le métier en vidéo"><VideoMetier id={v.id} titre={v.titre} chaine={v.chaine} ecole={v.ecole} /></section>}
      <TableauComparatif offres={offres} formation={f} />
      <p className="small muted">Note de 3 à 5 calculée à partir des critères pondérés ({Object.entries(conf.poids).map(([k, p]) => `${k} ${p} %`).join(", ")}). Aucune école ne descend sous 3/5 : toutes celles présentées ont été sélectionnées. Les écoles « Partenaire » rémunèrent le site pour la mise en relation ; cela n'influence pas la note. Données relevées sur les sites des écoles, susceptibles d'évoluer.</p>
      {s ? (
        <section className="prose synthese">
          <h2>Le métier après {f.intitule}</h2>
          {s.metiers && <><h3>Métiers accessibles</h3><p>{s.metiers}</p></>}
          {s.missions && <><h3>Missions au quotidien</h3><p>{s.missions}</p></>}
          {s.conditions && <><h3>Conditions de travail</h3><p>{s.conditions}</p></>}
          {s.salaire && <><h3>Rémunération</h3><p>{s.salaire}</p></>}
          {s.evolution && <><h3>Perspectives d'évolution</h3><p>{s.evolution}</p></>}
          {s.sources?.length > 0 && <p className="small muted">Sources : {s.sources.map((x, i) => <span key={i}>{i > 0 && " · "}<a href={x.url} target="_blank" rel="noopener">{x.titre}</a></span>)}</p>}
        </section>
      ) : <section className="prose"><h2>Le métier après {f.intitule}</h2><p className="muted">Synthèse en cours de rédaction.</p></section>}
    </>
  );
}
