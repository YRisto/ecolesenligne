import { Suspense } from "react";
import Listing from "./Listing";
import { getFormations, getEcoles, DOMAINES } from "../../lib/catalogue";
export const metadata = { title: "Toutes les formations à distance" };
export default function Page() {
  return (
    <>
      <h1>Toutes les formations à distance</h1>
      <p className="lead">Filtrez par domaine, type de diplôme, école ou financement CPF.</p>
      <Suspense><Listing formations={getFormations()} ecoles={getEcoles()} domaines={DOMAINES} /></Suspense>
    </>
  );
}
