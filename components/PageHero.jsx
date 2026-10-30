import Link from "next/link";

export default function PageHero({ crumbs = [], chips = [], titre, sous, aside }) {
  return (
    <section className="phero">
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
        {aside && <div className="phero-aside">{aside}</div>}
      </div>
    </section>
  );
}
