import { Suspense } from "react";
import LeadForm from "./LeadForm";
import { getFormations, getEcoles } from "../../lib/catalogue";
export const metadata = { title: "Demander des renseignements" };
export default function Page() {
  return (
    <>
      <h1>Demander des renseignements</h1>
      <p className="lead">Pour plus de renseignements sur les écoles citées sur ce site, remplissez ce formulaire. Un conseiller de l'école vous recontacte, sans engagement.</p>
      <Suspense><LeadForm formations={getFormations()} ecoles={getEcoles()} /></Suspense>
    </>
  );
}
