// Illustrations originales (SVG) : une par filière. Traits or / blancs, adaptés au fond noir.
const A = { fill: "none", stroke: "var(--i1,#ffc629)", strokeWidth: 3.5, strokeLinecap: "round", strokeLinejoin: "round" };
const B = { fill: "none", stroke: "var(--i2,#fff)", strokeWidth: 3.5, strokeLinecap: "round", strokeLinejoin: "round" };
const F = { fill: "var(--i1,#ffc629)", stroke: "none" };

const DESSINS = {
  "Commerce & Marketing": <>
    <path {...B} d="M18 78V52l38-14v54z" /><path {...A} d="M56 38l30-16v76L56 92" /><path {...B} d="M26 78l6 22h12l-5-18" />
    <path {...A} d="M96 44c6 4 6 20 0 24" />
  </>,
  "Gestion & RH": <>
    <circle {...B} cx="44" cy="40" r="13" /><path {...B} d="M20 92c0-16 11-26 24-26s24 10 24 26" />
    <circle {...A} cx="82" cy="46" r="10" /><path {...A} d="M70 76c14-6 30 2 30 18" />
  </>,
  "Santé & Bien-être": <>
    <path {...A} d="M60 100C30 84 22 58 40 40c9-9 20-6 20 8 0-14 11-17 20-8 18 18 10 44-20 60z" />
    <path {...B} d="M60 52v28M46 66h28" />
  </>,
  "Animaux": <>
    <ellipse {...A} cx="60" cy="82" rx="22" ry="17" />
    <ellipse {...B} cx="30" cy="54" rx="8" ry="11" /><ellipse {...B} cx="50" cy="36" rx="8" ry="11" />
    <ellipse {...B} cx="72" cy="36" rx="8" ry="11" /><ellipse {...B} cx="92" cy="54" rx="8" ry="11" />
  </>,
  "Informatique & Réseaux": <>
    <rect {...B} x="16" y="24" width="88" height="58" rx="6" /><path {...B} d="M44 100h32M60 82v18" />
    <path {...A} d="M44 44l-12 12 12 12M76 44l12 12-12 12M66 40l-12 32" />
  </>,
  "Bâtiment & Technique": <>
    <path {...A} d="M22 74c0-22 16-38 38-38s38 16 38 38z" /><path {...A} d="M16 74h88v10H16z" />
    <path {...B} d="M60 36V24M44 44l-6-10M76 44l6-10" /><path {...B} d="M30 100h60" />
  </>,
  "Création & Mode": <>
    <circle {...B} cx="36" cy="86" r="11" /><circle {...B} cx="72" cy="94" r="11" />
    <path {...A} d="M43 77l56-52M65 86L30 28" />
  </>,
  "Services & Formation": <>
    <path {...A} d="M60 24L10 46l50 22 50-22z" /><path {...B} d="M30 56v22c0 8 14 16 30 16s30-8 30-16V56" /><path {...A} d="M104 48v28" />
  </>,
  "Petite enfance & Social": <>
    <rect {...A} x="18" y="62" width="34" height="34" rx="4" /><rect {...B} x="56" y="62" width="34" height="34" rx="4" /><rect {...A} x="37" y="26" width="34" height="34" rx="4" />
    <path {...B} d="M47 82h14M65 80l8 12M82 80l-8 12M48 52l5-18 5 18M50 46h6" />
  </>,
  "Langues": <>
    <path {...A} d="M16 28h56a6 6 0 016 6v28a6 6 0 01-6 6H44L28 84V68h-12a6 6 0 01-6-6V34a6 6 0 016-6z" />
    <path {...B} d="M50 76v6a6 6 0 006 6h24l14 14V88h6a6 6 0 006-6V54a6 6 0 00-6-6H88" />
    <path {...A} d="M26 50l10-14 10 14M29 44h14" />
  </>,
  "VAE": <>
    <rect {...B} x="22" y="22" width="76" height="58" rx="5" /><path {...B} d="M36 40h48M36 54h30" />
    <circle {...A} cx="80" cy="78" r="14" /><path {...A} d="M72 90l-6 22 14-8 14 8-6-22" />
  </>,
};

export default function DomaineIllu({ domaine, className = "", title }) {
  const d = DESSINS[domaine] || DESSINS["Services & Formation"];
  return (
    <svg className={`illu ${className}`} viewBox="0 0 120 120" role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : "true"} focusable="false">{d}</svg>
  );
}
