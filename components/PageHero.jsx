import Link from "next/link";
import DomaineScene from "./DomaineScene";

const MOTS = ["Comparer", "Choisir", "Demander", "Réussir"];

export default function PageHero({ crumbs = [], chips = [], titre, sous, aside, domaine, stats }) {
  const carte = domaine ? <DomaineScene domaine={domaine} className="phero-card" title={`Illustration : ${domaine}`} /> : null;
  return (
    <>
      <section className="phero">
        <svg className="hero-chart" viewBox="0 0 1200 500" preserveAspectRatio="none" aria-hidden="true"><polyline points="0,470 120,430 230,445 360,360 470,380 600,290 720,310 850,190 980,215 1100,90 1200,60" /></svg>
        <div className="phero-in">
          <div className="phero-main">
            {crumbs.length > 0 && (
              <nav className="crumbs" aria-label="Fil d'Ariane">
                {crumbs.map((c, i) => (c.href ? <Link key={i} href={c.href}>{c.label}</Link> : <span key={i}>{c.label}</span>))}
              </nav>
            )}
            {chips.length > 0 && <p className="phero-chips">{chips.map((c, i) => <span key={i} className={c.tone ? `chip chip-${c.tone}` : "chip"}>{c.label}</span>)}</p>}
            <h1 className="display">{titre}</h1>
            {sous && <p className="phero-sub">{sous}</p>}
          </div>
          {(aside || carte) && <div className="phero-aside">{carte || aside}</div>}
          {stats && <ul className="phero-row">{stats.map((x, i) => <li key={i}><strong>{x.v}</strong><span>{x.l}</span></li>)}</ul>}
        </div>
      </section>
      <div className="ticker" aria-hidden="true">
        <div className="ticker-t">{[0, 1, 2, 3].map((k) => <span key={k}>{MOTS.map((m) => <b key={m}>{m}<i>★</i></b>)}</span>)}</div>
      </div>
    </>
  );
}
