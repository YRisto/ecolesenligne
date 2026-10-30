import { Suspense } from "react";
import Listing from "./Listing";
import PageHero from "../../components/PageHero";
import { getFormations, DOMAINES } from "../../lib/catalogue";
export const metadata = { title: "Toutes les formations à distance" };
export default function Page() {
  const n = getFormations().length;
  return (
    <>
      <PageHero titre="Toutes les formations à distance" sous={`${n} formations comparées école par école : prix, diplôme, financement, avis. Filtrez, ouvrez une fiche, comparez.`} />
      <section className="sec sec-white sec-tight"><div className="sec-in"><Suspense><Listing formations={getFormations()} domaines={DOMAINES} /></Suspense></div></section>
    </>
  );
}
