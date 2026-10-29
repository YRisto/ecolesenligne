import { Suspense } from "react";
import LeadForm from "./LeadForm";
import { getFormations, getEcoles } from "../../lib/catalogue";
import offres from "../../data/offres.json";
export const metadata = { title: "Demander des renseignements" };
export default function Page() {
  return (
    <>
      <h1>Demander des renseignements</h1>
      <p className="lead">Pour plus de renseignements sur les écoles citées sur ce site, remplissez ce formulaire. Un conseiller de l'école vous recontacte, sans engagement.</p>
      <Suspense><LeadForm formations={getFormations()} ecoles={getEcoles().filter((e) => e.partenaire)} offres={offres} /></Suspense>
    </>
  );
}
