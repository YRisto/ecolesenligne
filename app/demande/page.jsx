import { Suspense } from "react";
import LeadForm from "./LeadForm";
import PageHero from "../../components/PageHero";
import { getFormations, getEcoles } from "../../lib/catalogue";
import offres from "../../data/offres.json";
export const metadata = { title: "Demander des renseignements" };
export default function Page() {
  return (
    <>
      <PageHero titre="Demandez vos infos. C'est gratuit." sous="Remplissez ce formulaire : un conseiller de l'école vous recontacte, sans engagement." />
      <section className="sec sec-white sec-tight"><div className="sec-in"><Suspense><LeadForm formations={getFormations()} ecoles={getEcoles().filter((e) => e.partenaire)} offres={offres} tous={getEcoles().map((e) => ({ slug: e.slug, nom: e.nom }))} /></Suspense></div></section>
    </>
  );
}
