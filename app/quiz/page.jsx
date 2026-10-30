import Quiz from "./Quiz";
import PageHero from "../../components/PageHero";
import { getFormations, getOffres, prixMin, DOMAINES } from "../../lib/catalogue";
export const metadata = { title: "Quelle formation pour moi ? Le quiz", description: "Cinq questions pour trouver la formation à distance qui vous correspond : domaine, niveau, budget, financement. Résultat immédiat, sans inscription." };

const niveauNum = (n = "") => { const m = n.match(/niveau (\d)/i); return m ? Number(m[1]) : null; };

export default function Page() {
  const formations = getFormations().map((f) => {
    const offres = getOffres(f.code);
    const fin = offres.flatMap((o) => o.financement || []).join(" | ").toLowerCase();
    const best = offres[0];
    return {
      slug: f.slug, intitule: f.intitule, domaine: f.domaine, type: f.type, niveau: niveauNum(f.niveau), nbEcoles: f.nbEcoles,
      prix: prixMin(f.code), best: best ? { nom: best.ecoleObj?.nom, note: best.note, prix: best.prix_total_eur } : null,
      fin: { cpf: /cpf/.test(fin), emploi: /france travail|pôle|pole emploi/.test(fin), employeur: /opco|employeur|plan de dév/.test(fin), perso: /autofinancement|plusieurs fois|paiement/.test(fin) },
    };
  });
  return (
    <>
      <PageHero titre={<>Quelle formation <span className="or">pour moi ?</span></>} sous="Cinq questions, deux minutes. Nous classons nos formations selon vos réponses, sans inscription." />
      <section className="sec sec-white sec-tight"><div className="sec-in"><Quiz formations={formations} domaines={DOMAINES} /></div></section>
    </>
  );
}
