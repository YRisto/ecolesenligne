import { notFound } from "next/navigation";
import { getFormations, getFormation, getOffres, eur, prixMin } from "../../../lib/catalogue";
import TableauComparatif from "../../../components/TableauComparatif";
import PageHero from "../../../components/PageHero";
import conf from "../../../data/ponderation.json";
import videos from "../../../data/videos.json";
import VideoMetier from "../../../components/VideoMetier";

const LIB = { diplome: "Diplôme reconnu", prix: "Prix", accompagnement: "Accompagnement", avis: "Avis des élèves", financement: "Financement", preparation_examen: "Préparation à l'examen", taux_reussite: "Taux de réussite", garantie: "Garantie", supports: "Supports de cours" };

export function generateStaticParams() { return getFormations().map((f) => ({ slug: f.slug })); }
export async function generateMetadata({ params }) {
  const { slug } = await params; const f = getFormation(slug); if (!f) return {};
  return { title: `${f.intitule} à distance : comparatif des écoles`, description: `Comparez ${f.nbEcoles} écoles proposant ${f.intitule} 100 % à distance : prix, durée, diplôme, financement CPF, avis et note.` };
}
export default async function Page({ params }) {
  const { slug } = await params; const f = getFormation(slug); if (!f) notFound();
  const offres = getOffres(f.code); const s = f.synthese; const v = videos[f.code];
  const prix = offres.map((o) => o.prix_total_eur).filter(Boolean);
  const ecart = prix.length > 1 ? Math.max(...prix) - Math.min(...prix) : 0;
  const meilleure = offres[0];
  const blocs = s ? [["Métiers accessibles", s.metiers], ["Missions au quotidien", s.missions], ["Conditions de travail", s.conditions], ["Rémunération", s.salaire], ["Perspectives d'évolution", s.evolution]].filter((b) => b[1]) : [];
  return (
    <>
      <PageHero
        crumbs={[{ label: "Formations", href: "/formations" }, { label: f.domaine }]}
        chips={[{ label: f.type }, f.niveau && { label: f.niveau, tone: "muted" }].filter(Boolean)}
        titre={<>{f.intitule}<span className="or"> à distance</span></>}
        sous={`Quelle école choisir ? ${offres.length} écoles comparées sur les mêmes critères, classées par note ecolesenligne.fr.`}
        aside={
          <ul className="phero-stats">
            <li><strong>{offres.length}</strong><span>écoles comparées</span></li>
            {prixMin(f.code) && <li><strong>{eur(prixMin(f.code))}</strong><span>prix le plus bas</span></li>}
            {ecart > 0 && <li><strong>{eur(ecart)}</strong><span>d'écart entre la moins chère et la plus chère</span></li>}
          </ul>
        }
      />
      {v && (
        <section className="sec sec-white sec-tight" aria-label="Le métier en vidéo">
          <div className="sec-in"><h2 className="display h-dark">Le métier en vidéo</h2><VideoMetier id={v.id} titre={v.titre} chaine={v.chaine} ecole={v.ecole} /></div>
        </section>
      )}
      <section className="sec sec-gris sec-tight">
        <div className="sec-in">
          <h2 className="display h-dark">Le comparatif</h2>
          {meilleure && <p className="verdict-line"><strong>Meilleure note : {meilleure.ecoleObj?.nom}</strong>, {String(meilleure.note.toFixed(1)).replace(".", ",")}/5{meilleure.prix_total_eur ? `, ${eur(meilleure.prix_total_eur)}` : ""}.</p>}
          <TableauComparatif offres={offres} formation={f} />
          <p className="small note-meth">Note de 3 à 5 calculée à partir de neuf critères pondérés ({Object.entries(conf.poids).sort((a, b) => b[1] - a[1]).map(([k, p]) => `${LIB[k].toLowerCase()} ${p} %`).join(", ")}). Aucune école ne descend sous 3/5 : toutes celles présentées ont été sélectionnées. Les écoles « Partenaire » rémunèrent le site pour la mise en relation ; cela n'influence pas la note. Données relevées sur les sites des écoles, susceptibles d'évoluer.</p>
        </div>
      </section>
      <section className="sec sec-black">
        <div className="sec-in">
          <h2 className="display h-light">Le métier après {f.intitule}</h2>
          {blocs.length ? (
            <div className="syn">
              {blocs.map(([t, txt]) => <article key={t}><h3>{t}</h3><p>{txt}</p></article>)}
            </div>
          ) : <p className="lead-l">Synthèse en cours de rédaction.</p>}
          {s?.sources?.length > 0 && <p className="small syn-src">Sources : {s.sources.map((x, i) => <span key={i}>{i > 0 && " · "}<a href={x.url} target="_blank" rel="noopener">{x.titre}</a></span>)}</p>}
        </div>
      </section>
      <section className="sec sec-or sec-tight">
        <div className="sec-in cta-f">
          <h2 className="display h-dark">Une question sur cette formation ?</h2>
          <a href={`/demande?formation=${f.slug}`} className="btn-noir">Demander des infos</a>
        </div>
      </section>
    </>
  );
}
