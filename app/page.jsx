import Link from "next/link";
import { DOMAINES, getFormations } from "../lib/catalogue";
import FormationCard from "../components/FormationCard";

export default function Home() {
  const formations = getFormations();
  return (
    <>
      <span className="chip">Comparateur indépendant</span>
      <h1>Comparez les formations 100 % à distance</h1>
      <p className="lead">BTS, Bachelors, titres professionnels, CAP, VAE : les formations en ligne des grandes écoles à distance, comparées sur les mêmes critères. Prix, durée, reconnaissance RNCP, financement CPF.</p>
      <p><Link href="/formations" className="btn">Voir toutes les formations</Link></p>
      <h2>Par domaine</h2>
      <div className="grid">
        {DOMAINES.map((d) => {
          const n = formations.filter((f) => f.domaine === d).length;
          return (
            <Link key={d} href={`/formations?domaine=${encodeURIComponent(d)}`} className="card" style={{ textDecoration: "none", color: "inherit" }}>
              <h2 style={{ margin: 0 }}>{d}</h2>
              <p className="muted">{n} formation{n > 1 ? "s" : ""}</p>
            </Link>
          );
        })}
      </div>
      <h2>Formations les plus comparées</h2>
      <div className="grid">{[...formations].sort((a,b)=>b.nbEcoles-a.nbEcoles).slice(0, 6).map((f) => <FormationCard key={f.slug} f={f} />)}</div>
    </>
  );
}
