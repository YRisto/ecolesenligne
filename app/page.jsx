const domaines = [
  { nom: "Commerce & Marketing", ex: "BTS NDRC, BTS MCO, Bachelor Marketing" },
  { nom: "Gestion & RH", ex: "BTS Gestion de la PME, Bachelor RH" },
  { nom: "Santé & Bien-être", ex: "Naturopathie, Diététique, Secrétaire médical" },
  { nom: "Animaux", ex: "Toiletteur, Auxiliaire vétérinaire, Éducateur canin" },
  { nom: "Informatique & Réseaux", ex: "TP Assistant informatique, TP Technicien réseau" },
  { nom: "Bâtiment & Technique", ex: "BTS Bâtiment, Électricité, Mécanique" },
  { nom: "Création & Mode", ex: "TP Graphiste, Styliste, Modéliste" },
  { nom: "Services & Formation", ex: "TP Formateur, Secrétaire assistant, ADVF" },
  { nom: "VAE", ex: "Validation des acquis de l'expérience" },
];

export default function Home() {
  return (
    <main>
      <span className="badge">Bientôt disponible</span>
      <h1>Comparez les formations 100 % à distance</h1>
      <p className="lead">
        BTS, Bachelors, titres professionnels, VAE : toutes les formations en
        ligne des grandes écoles à distance, comparées sur les mêmes critères.
        Prix, durée, reconnaissance RNCP, financement CPF.
      </p>
      <div className="grid">
        {domaines.map((d) => (
          <div className="card" key={d.nom}>
            <h2>{d.nom}</h2>
            <p>{d.ex}</p>
          </div>
        ))}
      </div>
      <footer>© {new Date().getFullYear()} ecolesenligne.fr — Site en construction.</footer>
    </main>
  );
}
