import { Suspense } from "react";
import Compare from "./Compare";
import { getFormations } from "../../lib/catalogue";
export const metadata = { title: "Comparer des formations à distance" };
export default function Page() {
  return (<><h1>Comparer des formations</h1><p className="lead">Choisissez jusqu'à 3 formations pour les comparer côte à côte.</p><Suspense><Compare formations={getFormations()} /></Suspense></>);
}
