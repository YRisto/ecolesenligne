import Link from "next/link";
import { DOMAINES, getFormations, getEcoles, getOffres, prixMin, eur } from "../lib/catalogue";
import conf from "../data/ponderation.json";
import offres from "../data/offres.json";
import CountUp from "../components/home/CountUp";
import HeroSearch from "../components/home/HeroSearch";

const LIBELLES = { diplome: "Diplôme reconnu", prix: "Prix", accompagnement: "Accompagnement", avis: "Avis des élèves", financement: "Financement", preparation_examen: "Préparation à l'examen", taux_reussite: "Taux de réussite", garantie: "Garantie", supports: "Supports de cours" };
const virgule = (n) => n.toFixed(1).replace(".", ",");

export default function Home() {
  const formations = getFormations();
  const ecoles = getEcoles();

  // Chiffres réels calculés sur le catalogue
  const prix = {};
  for (const o of offres) if (o.prix_total_eur) (prix[o.formation] ??= []).push({ p: o.prix_total_eur, ecole: o.ecole });
  const ecarts = Object.entries(prix).filter(([, l]) => l.length >= 2).map(([code, l]) => {
    const s = [...l].sort((a, b) => a.p - b.p);
    return { code, ecart: s[s.length - 1].p - s[0].p, min: s[0], max: s[s.length - 1], f: formations.find((x) => x.code === code) };
  }).sort((a, b) => b.ecart - a.ecart);
  const top = ecarts[0];
  const med = [...ecarts].map((e) => e.ecart).sort((a, b) => a - b)[Math.floor(ecarts.length / 2)];
  const nbCpf = offres.filter((o) => (o.financement || []).some((x) => /cpf/i.test(x))).length;
  const nom = (slug) => ecoles.find((e) => e.slug === slug)?.nom;

  // La fiche vedette : vraie comparaison de la formation à plus grand écart de prix
  const vedette = top?.f;
  const lignes = vedette ? getOffres(vedette.code) : [];

  const populaires = [...formations].sort((a, b) => b.nbEcoles - a.nbEcoles).slice(0, 8);

  return (
    <div className="home">
      {/* HERO */}
      <section className="hero">
        <svg className="hero-chart" viewBox="0 0 1200 500" preserveAspectRatio="none" aria-hidden="true"><polyline points="0,470 120,430 230,445 360,360 470,380 600,290 720,310 850,190 980,215 1100,90 1200,60" /></svg>
        <div className="hero-in">
          <div className="hero-grid">
            <div>
              <h1 className="display">
                Arrêtez de deviner.
                <span className="or">Voyez quelle école vaut vraiment son prix.</span>
              </h1>
              <p className="hero-sub">Même formation, deux écoles : jusqu'à <strong>{eur(top.ecart)}</strong> d'écart. Nous avons mis {ecoles.length} écoles à distance côte à côte (prix, diplôme, avis, financement) et nous les notons de 3 à 5. Vous choisissez en connaissance de cause.</p>
              <HeroSearch formations={formations.map((f) => ({ slug: f.slug, intitule: f.intitule, nbEcoles: f.nbEcoles }))} />
              <p className="hero-links"><Link href="/formations">Parcourir les {formations.length} formations</Link></p>
            </div>

            {vedette && (
              <aside className="verdict" aria-label={`Exemple de comparaison : ${vedette.intitule}`}>
                <p className="verdict-t"><strong>{vedette.intitule}</strong> : {lignes.length} écoles comparées</p>
                <ul>
                  {lignes.map((o, i) => (
                    <li key={o.ecole}>
                      <div className="v-top"><span className="v-nom">{o.ecoleObj?.nom}{i === 0 && <em className="v-best">Meilleure note</em>}</span><span className="v-prix">{eur(o.prix_total_eur)}</span></div>
                      <div className="v-bar"><i style={{ "--w": `${Math.round(((o.note - 3) / 2) * 100)}%`, "--d": `${0.55 + i * 0.12}s` }} /><b>{virgule(o.note)}/5</b></div>
                    </li>
                  ))}
                </ul>
                <p className="verdict-f">Entre la moins chère et la plus chère : <strong>{eur(top.ecart)}</strong></p>
              </aside>
            )}
          </div>

          <ul className="proof">
            <li><strong><CountUp to={formations.length} /></strong><span>formations comparées</span></li>
            <li><strong><CountUp to={ecoles.length} /></strong><span>écoles 100 % à distance</span></li>
            <li><strong><CountUp to={offres.length} /></strong><span>offres relevées une à une</span></li>
            <li><strong>0 €</strong><span>pour comparer et demander</span></li>
          </ul>
        </div>
      </section>

      {/* LA VÉRITÉ SUR LES PRIX */}
      <section className="sec sec-white">
        <div className="sec-in split">
          <h2 className="display h-dark">La même formation.<br />Pas le même prix.</h2>
          <div className="facts-l">
            <div><p className="big">{eur(top.ecart)}</p><p>d'écart sur la formation {top.f.intitule} : {eur(top.min.p)} chez {nom(top.min.ecole)}, {eur(top.max.p)} chez {nom(top.max.ecole)}.</p></div>
            <div><p className="big">{eur(med)}</p><p>d'écart médian entre deux écoles, sur les {ecarts.length} formations dont les prix sont publiés.</p></div>
            <div><p className="big">{nbCpf}</p><p>offres sur {offres.length} se financent avec le compte personnel de formation (CPF). C'est indiqué école par école.</p></div>
          </div>
        </div>
      </section>

      {/* COMMENT ÇA MARCHE */}
      <section className="sec sec-black">
        <div className="sec-in">
          <h2 className="display h-light">Trois étapes. Zéro mauvaise surprise.</h2>
          <ol className="steps">
            <li><span className="n">1</span><h3>Choisissez un métier</h3><p>Tapez un métier ou un diplôme. Chaque fiche explique le métier, la paie et les débouchés, avec une vidéo.</p></li>
            <li><span className="n">2</span><h3>Comparez les écoles</h3><p>Un seul tableau : prix, durée, diplôme, financement, avis, garanties. Chaque école reçoit une note de 3 à 5.</p></li>
            <li><span className="n">3</span><h3>Demandez, c'est gratuit</h3><p>Un formulaire, sans engagement. Un conseiller de l'école de votre choix vous rappelle.</p></li>
          </ol>
        </div>
      </section>

      {/* DOMAINES */}
      <section className="sec sec-white">
        <div className="sec-in">
          <h2 className="display h-dark">Quel est votre terrain de jeu ?</h2>
          <div className="tiles">
            {DOMAINES.map((d) => {
              const n = formations.filter((f) => f.domaine === d).length;
              return <Link key={d} href={`/formations?domaine=${encodeURIComponent(d)}`} className="tile"><span className="tile-n">{n}</span><span className="tile-t">{d}</span></Link>;
            })}
          </div>
        </div>
      </section>

      {/* LES PLUS COMPARÉES */}
      <section className="sec sec-gris">
        <div className="sec-in">
          <h2 className="display h-dark">Les plus comparées</h2>
          <ul className="rows">
            {populaires.map((f) => (
              <li key={f.slug}><Link href={`/formations/${f.slug}`}>
                <span className="r-t">{f.intitule}</span>
                <span className="r-m">{f.nbEcoles} écoles</span>
                <span className="r-p">{prixMin(f.code) ? `dès ${eur(prixMin(f.code))}` : "prix sur demande"}</span>
              </Link></li>
            ))}
          </ul>
        </div>
      </section>

      {/* MÉTHODE */}
      <section className="sec sec-black">
        <div className="sec-in split">
          <div>
            <h2 className="display h-light">Une note que personne n'achète.</h2>
            <p className="lead-l">Neuf critères, des poids publiés, des données relevées sur les sites des écoles. Aucune école n'est notée sous 3. Les écoles partenaires rémunèrent le site quand vous demandez des informations ; leur statut n'entre pas dans le calcul de la note.</p>
          </div>
          <ul className="poids">
            {Object.entries(conf.poids).sort((a, b) => b[1] - a[1]).map(([k, p]) => (
              <li key={k}><span>{LIBELLES[k]}</span><div><i style={{ width: `${p * 4}%` }} /></div><b>{p} %</b></li>
            ))}
          </ul>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="sec sec-or">
        <div className="sec-in cta-f">
          <h2 className="display h-dark">Dans deux minutes, vous savez quoi demander.</h2>
          <Link href="/formations" className="btn-noir">Trouver ma formation</Link>
        </div>
      </section>
    </div>
  );
}
