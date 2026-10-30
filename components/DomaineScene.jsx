// Scènes illustrées (SVG original, style affiche) : un métier représenté par filière.
const G = "#ffc629", G2 = "#ffd95e", K = "#111", D = "#2a2a2e", W = "#fff", S = "#f1c19b", S2 = "#a8683f";
const VERT = "#2f9e5b", ROUGE = "#e5383b", BLEU = "#3b82f6", ORANGE = "#ff7a1a", MARRON = "#8a5a3b";

function Fig({ x, s = 1, skin = S, hair = K, top = K, bot = D, long = false, arms = [], children }) {
  return (
    <g transform={`translate(${x} 170) scale(${s})`}>
      <rect x="-12" y="-52" width="10" height="46" rx="3" fill={bot} /><rect x="2" y="-52" width="10" height="46" rx="3" fill={bot} />
      <rect x="-15" y="-7" width="14" height="7" rx="3.5" fill={K} /><rect x="1" y="-7" width="14" height="7" rx="3.5" fill={K} />
      {long && <path d="M-17 -136a17 17 0 0134 0v26h-8v-14h-18v14h-8z" fill={hair} />}
      <rect x="-18" y="-112" width="36" height="64" rx="12" fill={top} />
      <rect x="-5" y="-124" width="10" height="14" fill={skin} />
      <circle cx="0" cy="-134" r="15" fill={skin} />
      <path d={long ? "M-16 -134a16 16 0 0132 0c-8-8-24-8-32 0z" : "M-15 -136a15 15 0 0130 0c-7-7-23-7-30 0z"} fill={hair} />
      {arms.map((a, i) => (
        <g key={i}><path d={a.d} fill="none" stroke={a.c || top} strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" /><circle cx={a.h[0]} cy={a.h[1]} r="5.5" fill={skin} /></g>
      ))}
      {children}
    </g>
  );
}

const Cadre = ({ children }) => (
  <>
    <rect width="240" height="180" fill={G} />
    <circle cx="120" cy="98" r="76" fill={G2} />
    {children}
    <rect y="168" width="240" height="12" fill={K} />
  </>
);

const SCENES = {
  "Commerce & Marketing": (
    <Cadre>
      <rect x="132" y="38" width="94" height="84" rx="5" fill={W} stroke={K} strokeWidth="3" />
      <rect x="146" y="92" width="14" height="22" fill={K} /><rect x="168" y="78" width="14" height="36" fill={G} stroke={K} strokeWidth="2" /><rect x="190" y="62" width="14" height="52" fill={K} />
      <path d="M144 80l24-18 20 8 30-28" fill="none" stroke={ROUGE} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /><path d="M208 40l8 0 0 8" fill="none" stroke={ROUGE} strokeWidth="4" strokeLinecap="round" />
      <rect x="176" y="122" width="6" height="46" fill={K} />
      <Fig x={78} top={K} hair="#5a3a22" arms={[{ d: "M16 -104 L44 -112", h: [48, -113] }, { d: "M-16 -104 L-24 -72", h: [-25, -66] }]}>
        <rect x="-3" y="-108" width="6" height="30" fill={G} />
      </Fig>
    </Cadre>
  ),
  "Gestion & RH": (
    <Cadre>
      <rect x="22" y="30" width="38" height="48" rx="4" fill={W} stroke={K} strokeWidth="3" transform="rotate(-8 41 54)" /><path d="M30 46h22M30 56h22M30 66h14" stroke={K} strokeWidth="3" strokeLinecap="round" transform="rotate(-8 41 54)" />
      <circle cx="196" cy="46" r="17" fill={K} /><path d="M188 46l6 6 11-12" fill="none" stroke={G} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <Fig x={78} top={K} hair="#3a2a1a" arms={[{ d: "M16 -104 L38 -90 L44 -88", h: [45, -88] }, { d: "M-16 -104 L-22 -70", h: [-23, -64] }]} />
      <Fig x={162} top={W} bot={D} skin={S2} hair={K} long arms={[{ d: "M-16 -104 L-38 -90 L-44 -88", h: [-45, -88], c: W }, { d: "M16 -104 L22 -70", h: [23, -64], c: W }]}>
        <rect x="-18" y="-112" width="36" height="64" rx="12" fill="none" stroke={K} strokeWidth="3" />
      </Fig>
    </Cadre>
  ),
  "Santé & Bien-être": (
    <Cadre>
      <rect x="168" y="40" width="46" height="46" rx="8" fill={W} stroke={K} strokeWidth="3" /><path d="M191 50v26M178 63h26" stroke={ROUGE} strokeWidth="9" strokeLinecap="round" />
      <path d="M150 120c0-18 14-26 30-26 0 16-12 28-30 26z" fill={VERT} stroke={K} strokeWidth="2.5" /><path d="M152 120c8-8 14-14 22-20" stroke={K} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <Fig x={92} top={W} hair="#5a3a22" long arms={[{ d: "M16 -104 L40 -88", h: [43, -86], c: W }, { d: "M-16 -104 L-22 -70", h: [-23, -64], c: W }]}>
        <path d="M-9 -112v20a9 9 0 0018 0v-20" fill="none" stroke={K} strokeWidth="3" strokeLinecap="round" /><circle cx="9" cy="-80" r="5" fill={G} stroke={K} strokeWidth="2" />
        <path d="M36 -88c0-14 10-20 22-20 0 12-8 22-22 20z" fill={VERT} stroke={K} strokeWidth="2" />
      </Fig>
    </Cadre>
  ),
  "Animaux": (
    <Cadre>
      <g>
        <path d="M206 134c14-4 18-18 12-30" fill="none" stroke={MARRON} strokeWidth="9" strokeLinecap="round" />
        <ellipse cx="184" cy="138" rx="26" ry="28" fill={MARRON} /><ellipse cx="170" cy="146" rx="12" ry="18" fill={W} />
        <rect x="160" y="150" width="11" height="20" rx="5" fill={MARRON} /><rect x="190" y="150" width="11" height="20" rx="5" fill={MARRON} />
        <circle cx="164" cy="104" r="17" fill={MARRON} /><ellipse cx="150" cy="110" rx="11" ry="8" fill={W} /><circle cx="146" cy="107" r="3.4" fill={K} />
        <path d="M168 90c8-6 18 0 16 14-8 0-14-4-16-14z" fill={K} /><circle cx="162" cy="100" r="2.6" fill={K} />
      </g>
      <path d="M170 64c0-8 10-8 10 0 0-8 10-8 10 0 0 8-10 14-10 14s-10-6-10-14z" fill={ROUGE} />
      <Fig x={84} top={K} hair="#7c2d12" long arms={[{ d: "M16 -104 L36 -84 L52 -62", h: [54, -60] }, { d: "M-16 -104 L-22 -70", h: [-23, -64] }]} />
    </Cadre>
  ),
  "Informatique & Réseaux": (
    <Cadre>
      <rect x="128" y="62" width="86" height="58" rx="5" fill={K} /><rect x="134" y="68" width="74" height="46" rx="2" fill={D} />
      <path d="M142 80h30M142 90h46M150 100h26M184 100h14" stroke={G} strokeWidth="4" strokeLinecap="round" /><path d="M142 100h4" stroke={W} strokeWidth="4" strokeLinecap="round" />
      <rect x="164" y="120" width="8" height="8" fill={K} /><rect x="64" y="128" width="168" height="8" rx="2" fill={K} /><rect x="76" y="136" width="8" height="32" fill={K} /><rect x="214" y="136" width="8" height="32" fill={K} />
      <rect x="124" y="124" width="46" height="4" rx="2" fill={W} />
      <rect x="60" y="92" width="10" height="56" rx="4" fill={D} />
      <rect x="72" y="84" width="34" height="54" rx="12" fill={K} /><rect x="80" y="64" width="12" height="22" fill={S} /><circle cx="90" cy="56" r="15" fill={S} /><path d="M75 54a15 15 0 0130 0c-8-6-22-6-30 0z" fill="#3a2a1a" />
      <path d="M74 56a16 16 0 0132 0" fill="none" stroke={W} strokeWidth="3" /><rect x="70" y="54" width="7" height="12" rx="3" fill={W} /><path d="M72 66q4 8 14 6" fill="none" stroke={W} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M96 100L124 118" stroke={K} strokeWidth="10" strokeLinecap="round" /><circle cx="127" cy="120" r="5.5" fill={S} />
      <rect x="82" y="136" width="52" height="12" rx="5" fill={D} /><rect x="124" y="140" width="12" height="28" rx="5" fill={D} /><rect x="120" y="164" width="22" height="6" rx="3" fill={K} />
    </Cadre>
  ),
  "Bâtiment & Technique": (
    <Cadre>
      <rect x="146" y="62" width="86" height="106" fill="#c2410c" />
      {[0, 1, 2, 3, 4].map((r) => <path key={r} d={`M146 ${80 + r * 20}h86`} stroke={W} strokeWidth="2" />)}
      {[0, 1, 2, 3, 4, 5].map((r) => [0, 1].map((c) => <path key={`${r}${c}`} d={`M${(r % 2 ? 168 : 190) + c * 44} ${62 + r * 20}v20`} stroke={W} strokeWidth="2" />))}
      <Fig x={92} top={ORANGE} bot={D} hair={K} arms={[{ d: "M16 -104 L42 -98 L56 -88", h: [58, -86] }, { d: "M-16 -104 L-24 -72", h: [-25, -66] }]}>
        <rect x="-18" y="-96" width="36" height="6" fill={W} /><rect x="-18" y="-78" width="36" height="6" fill={W} />
        <path d="M-17 -140a17 17 0 0134 0z" fill={W} /><rect x="-21" y="-142" width="42" height="6" rx="3" fill={W} stroke={K} strokeWidth="2" /><rect x="-3" y="-156" width="6" height="14" fill={W} />
        <path d="M58 -86l16 -2-3 10z" fill="#d4d4d8" stroke={K} strokeWidth="2" /><rect x="52" y="-84" width="8" height="5" fill={K} />
      </Fig>
    </Cadre>
  ),
  "Création & Mode": (
    <Cadre>
      <path d="M160 60q14-10 28 0l6 30q-6 16-2 42h-40q4-26-2-42z" fill={W} stroke={K} strokeWidth="3" />
      <path d="M156 94q22 8 42 0" fill="none" stroke={ROUGE} strokeWidth="5" strokeLinecap="round" /><path d="M170 96v6M178 97v6M186 96v6" stroke={K} strokeWidth="2" />
      <rect x="172" y="132" width="5" height="32" fill={K} /><ellipse cx="174.500" cy="166" rx="22" ry="4.500" fill={K} />
      <circle cx="174" cy="56" r="5" fill={K} />
      <Fig x={86} top={K} hair="#7c2d12" long arms={[{ d: "M16 -104 L42 -92", h: [46, -92] }, { d: "M-16 -104 L-24 -72", h: [-25, -66] }]}>
        <g stroke={K} strokeWidth="3" strokeLinecap="round" fill="none"><path d="M50 -92l20-14M50 -92l20 12" /><circle cx="46" cy="-98" r="4" fill={G} /><circle cx="46" cy="-86" r="4" fill={G} /></g>
      </Fig>
    </Cadre>
  ),
  "Services & Formation": (
    <Cadre>
      <ellipse cx="190" cy="76" rx="20" ry="5" fill={K} /><path d="M170 74h40" stroke={K} strokeWidth="3" /><path d="M210 74h20" stroke={K} strokeWidth="6" strokeLinecap="round" />
      <path d="M180 56c-4-10 6-14 4-24M194 58c-4-10 6-14 4-24" fill="none" stroke={W} strokeWidth="3.500" strokeLinecap="round" />
      <circle cx="176" cy="104" r="5" fill={ORANGE} /><circle cx="190" cy="94" r="4.500" fill={VERT} /><circle cx="204" cy="106" r="5" fill={ROUGE} />
      <Fig x={92} s={0.9} top={W} hair="#3a2a1a" arms={[{ d: "M16 -104 L44 -96 L66 -90", h: [68, -90] }, { d: "M-16 -104 L-24 -72", h: [-25, -66] }]}>
        <circle cx="-5" cy="-96" r="2.200" fill={K} /><circle cx="-5" cy="-84" r="2.200" fill={K} /><circle cx="-5" cy="-72" r="2.200" fill={K} />
        <rect x="-16" y="-152" width="32" height="12" fill={W} stroke={K} strokeWidth="2.500" /><circle cx="-12" cy="-158" r="10" fill={W} stroke={K} strokeWidth="2.500" /><circle cx="0" cy="-164" r="12" fill={W} stroke={K} strokeWidth="2.500" /><circle cx="12" cy="-158" r="10" fill={W} stroke={K} strokeWidth="2.500" /><rect x="-15" y="-152" width="30" height="9" fill={W} />
      </Fig>
    </Cadre>
  ),
  "Petite enfance & Social": (
    <Cadre>
      <rect x="190" y="130" width="30" height="30" rx="3" fill={BLEU} stroke={K} strokeWidth="2.500" /><text x="205" y="152" textAnchor="middle" fontSize="18" fontWeight="800" fill={W} fontFamily="Arial,sans-serif">A</text>
      <rect x="196" y="100" width="30" height="30" rx="3" fill={ROUGE} stroke={K} strokeWidth="2.500" /><text x="211" y="122" textAnchor="middle" fontSize="18" fontWeight="800" fill={W} fontFamily="Arial,sans-serif">B</text>
      <path d="M164 108Q176 84 184 62" fill="none" stroke={K} strokeWidth="1.800" /><circle cx="186" cy="48" r="15" fill={ROUGE} /><path d="M184 62l3 0-1.500 5z" fill={ROUGE} />
      <Fig x={74} top={K} hair="#5a3a22" long arms={[{ d: "M16 -104 L40 -72 L50 -52", h: [52, -50] }, { d: "M-16 -104 L-24 -72", h: [-25, -66] }]} />
      <Fig x={142} s={0.58} top={G} bot={BLEU} skin={S2} hair={K} arms={[{ d: "M-16 -104 L-26 -88 L-30 -78", h: [-31, -76], c: "#e0a800" }, { d: "M16 -104 L26 -122", h: [27, -124], c: "#e0a800" }]} />
    </Cadre>
  ),
  "Langues": (
    <Cadre>
      <path d="M22 8h70a8 8 0 018 8v20a8 8 0 01-8 8H62l-12 10V44H22a8 8 0 01-8-8V16a8 8 0 018-8z" fill={W} stroke={K} strokeWidth="3" />
      <text x="57" y="33" textAnchor="middle" fontSize="18" fontWeight="800" fill={K} fontFamily="Arial,sans-serif">Hello</text>
      <path d="M146 8h72a8 8 0 018 8v20a8 8 0 01-8 8h-12v10l-12-10h-48a8 8 0 01-8-8V16a8 8 0 018-8z" fill={K} />
      <text x="182" y="33" textAnchor="middle" fontSize="16" fontWeight="800" fill={G} fontFamily="Arial,sans-serif">Bonjour</text>
      <circle cx="120" cy="128" r="17" fill={W} stroke={K} strokeWidth="3" /><ellipse cx="120" cy="128" rx="7" ry="17" fill="none" stroke={K} strokeWidth="2" /><path d="M103 128h34M107 118h26M107 138h26" stroke={K} strokeWidth="2" fill="none" />
      <Fig x={58} s={0.84} top={K} hair="#5a3a22" arms={[{ d: "M16 -104 L38 -116", h: [41, -118] }, { d: "M-16 -104 L-24 -72", h: [-25, -66] }]} />
      <Fig x={182} s={0.84} top={W} skin={S2} hair={K} long arms={[{ d: "M-16 -104 L-38 -114", h: [-41, -116], c: W }, { d: "M16 -104 L24 -72", h: [25, -66], c: W }]}>
        <rect x="-18" y="-112" width="36" height="64" rx="12" fill="none" stroke={K} strokeWidth="3" />
      </Fig>
    </Cadre>
  ),
  "VAE": (
    <Cadre>
      <rect x="146" y="46" width="80" height="62" rx="4" fill={W} stroke={K} strokeWidth="3" /><path d="M158 62h56M158 74h40" stroke={K} strokeWidth="4" strokeLinecap="round" />
      <circle cx="204" cy="94" r="12" fill={ROUGE} stroke={K} strokeWidth="2.500" /><path d="M198 104l-4 16 10-5 10 5-4-16" fill={ROUGE} stroke={K} strokeWidth="2" />
      <rect x="40" y="40" width="9" height="9" fill={BLEU} transform="rotate(20 44 44)" /><rect x="128" y="30" width="8" height="8" fill={ROUGE} transform="rotate(-20 132 34)" /><circle cx="30" cy="84" r="5" fill={K} /><rect x="120" y="76" width="7" height="7" fill={K} transform="rotate(30 124 80)" />
      <Fig x={92} top={K} hair="#3a2a1a" arms={[{ d: "M16 -104 L40 -118", h: [43, -120] }, { d: "M-16 -104 L-24 -72", h: [-25, -66] }]}>
        <path d="M-24 -150l24-12 24 12-24 12z" fill={K} stroke={W} strokeWidth="2" /><rect x="-12" y="-146" width="24" height="10" fill={K} /><path d="M22 -150v18" stroke={G} strokeWidth="3" /><circle cx="22" cy="-130" r="3.500" fill={G} />
        <rect x="42" y="-130" width="26" height="9" rx="3" fill={W} stroke={K} strokeWidth="2" transform="rotate(-24 55 -126)" />
      </Fig>
    </Cadre>
  ),
};

export default function DomaineScene({ domaine, className = "", title }) {
  const d = SCENES[domaine] || SCENES["Services & Formation"];
  return (
    <svg className={`scene ${className}`} viewBox="0 0 240 180" role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : "true"} focusable="false">{d}</svg>
  );
}
