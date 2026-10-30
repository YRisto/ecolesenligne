import { notFound } from "next/navigation";
import Link from "next/link";
import LpQuiz from "./LpQuiz";
import DomaineScene from "../../../components/DomaineScene";
import { getLps, getLp } from "../../../lib/lp";
import { eur } from "../../../lib/catalogue";
import "../lp.css";

export function generateStaticParams() { return getLps().map((l) => ({ slug: l.slug })); }
export async function generateMetadata({ params }) {
  const { slug } = await params; const lp = getLp(slug); if (!lp) return {};
  return { title: `${lp.titre} ${lp.soustitre || ""} à distance`.trim(), description: lp.accroche, robots: { index: false, follow: false } };
}

export default async function Page({ params }) {
  const { slug } = await params; const lp = getLp(slug); if (!lp) notFound();
  const o = lp.offre;
  const mens = o?.mensualite_eur;
  return (
    <div className="lp" style={{ "--ac": lp.accent }}>
      <section className="lp-hero">
        <div className="lp-left">
          <p className="lp-brand">Écoles<span>enligne</span>.fr <em>en partenariat avec {lp.ecoleObj?.nom}</em></p>
          <p className="lp-sur">{lp.surtitre}</p>
          <h1 className="display">{lp.titre}</h1>
          {lp.soustitre && <p className="lp-sous">{lp.soustitre}</p>}
          <p className="lp-acc">{lp.accroche}</p>
          <LpQuiz lp={{ slug: lp.slug, formation: lp.formation, ecole: lp.ecole, quiz: lp.quiz, cta: lp.cta, consent: lp.consent, ecoleObj: { nom: lp.ecoleObj?.nom } }} />
        </div>
        <div className="lp-right" aria-hidden={lp.image ? undefined : "true"}>
          {lp.image ? <img src={lp.image} alt="" /> : <DomaineScene domaine={lp.scene} className="lp-scene" />}
        </div>
      </section>

      <section className="lp-badges"><ul>{lp.badges.map((b) => <li key={b}>{b}</li>)}</ul></section>

      <section className="lp-sec">
        <div className="lp-in">
          <h2 className="display">{lp.methode.titre}</h2>
          <div className="lp-cols">{lp.methode.blocs.map((b) => <article key={b.t}><h3>{b.t}</h3><p>{b.d}</p></article>)}</div>
          <h2 className="display lp-h2b">{lp.methode.supports.titre}</h2>
          <div className="lp-cols">{lp.methode.supports.blocs.map((b) => <article key={b.t}><h3>{b.t}</h3><p>{b.d}</p></article>)}</div>
        </div>
      </section>

      <section className="lp-sec lp-clair">
        <div className="lp-in">
          <h2 className="display">{lp.programme.titre}</h2>
          <div className="lp-prog">{lp.programme.groupes.map((g) => (
            <article key={g.t}><h3>{g.t}</h3><ul>{g.items.map((x) => <li key={x}>{x}</li>)}</ul></article>
          ))}</div>
        </div>
      </section>

      {lp.bonus && (
        <section className="lp-sec">
          <div className="lp-in lp-bonus">
            <div><h2 className="display">{lp.bonus.titre}</h2><p>{lp.bonus.texte}</p></div>
            <ul>{lp.bonus.items.map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
        </section>
      )}

      <section className="lp-sec lp-clair">
        <div className="lp-in">
          <h2 className="display">{lp.financement.titre}</h2>
          {o?.prix_total_eur && <p className="lp-prix">À partir de <strong>{mens ? `${mens} € par mois` : eur(o.prix_total_eur)}</strong>{o.prix_total_eur ? ` (${eur(o.prix_total_eur)} au total)` : ""}</p>}
          <div className="lp-cols lp-cols4">{lp.financement.blocs.map((b) => <article key={b.t}><h3>{b.t}</h3><p>{b.d}</p></article>)}</div>
        </div>
      </section>

      <section className="lp-sec">
        <div className="lp-in lp-faq">
          <h2 className="display">Vos questions</h2>
          {lp.faq.map((f) => <details key={f.q}><summary>{f.q}</summary><p>{f.r}</p></details>)}
        </div>
      </section>

      <section className="lp-final">
        <div className="lp-in"><h2 className="display">Prêt(e) à vous lancer ?</h2><a href="#demande" className="lpq-go lp-final-btn">{lp.cta}</a></div>
      </section>

      <footer className="lp-foot">
        <p>Ecolesenligne.fr est un comparateur et un service de mise en relation avec des écoles partenaires, qui peuvent le rémunérer pour chaque demande. Données de l'offre relevées sur le site de l'école, susceptibles d'évoluer.</p>
        <p><Link href="/mentions-legales">Mentions légales</Link> · <Link href="/confidentialite">Confidentialité</Link> · <Link href={`/formations/${lp.formation}`}>Comparer les écoles</Link></p>
      </footer>
    </div>
  );
}
