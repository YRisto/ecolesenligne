import { notFound } from "next/navigation";
import { getEcoles, getEcole, getFormationsByEcole } from "../../../lib/catalogue";
import FormationCard from "../../../components/FormationCard";
export function generateStaticParams() { return getEcoles().map((e) => ({ slug: e.slug })); }
export async function generateMetadata({ params }) { const { slug } = await params; const e = getEcole(slug); return { title: e ? `${e.nom} : formations à distance` : "École" }; }
export default async function Page({ params }) {
  const { slug } = await params; const e = getEcole(slug); if (!e) notFound();
  const fs = getFormationsByEcole(slug);
  return (
    <>
      <h1>{e.nom}</h1>
      <p className="lead">{e.description || `Toutes les formations à distance proposées par ${e.nom}.`}</p>
      <div className="grid">{fs.map((f) => <FormationCard key={f.slug} f={f} />)}</div>
    </>
  );
}
