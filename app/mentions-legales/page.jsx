import PageHero from "../../components/PageHero";
export const metadata = { title: "Mentions légales" };
export default function Page() {
  return (
    <>
      <PageHero titre="Mentions légales" />
      <section className="sec sec-white sec-tight"><div className="sec-in"><div className="prose">
      
      <h2>Éditeur du site</h2><p>[Raison sociale ou nom de l'éditeur] — [forme juridique, capital] — [adresse] — [SIREN] — [e-mail de contact]. Directeur de la publication : [nom].</p>
      <h2>Hébergement</h2><p>Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis. Données de contact hébergées par Supabase (région Irlande, UE).</p>
      <h2>Nature du service</h2><p>ecolesenligne.fr est un comparateur de formations à distance et un service de mise en relation. Les établissements présentés sont des partenaires commerciaux du site : ils peuvent rémunérer ecolesenligne.fr pour chaque demande de renseignements transmise. Le site ne délivre aucune formation et n'est pas un organisme de formation.</p>
      <h2>Propriété intellectuelle</h2><p>Les marques et logos des écoles appartiennent à leurs titulaires respectifs.</p>
    </div></div></section>
    </>
  );
}
