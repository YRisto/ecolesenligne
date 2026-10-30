"use client";
import { useEffect, useRef, useState } from "react";

// Le HTML serveur contient déjà la valeur finale ; l'animation ne joue que si le visiteur ne l'a pas désactivée.
export default function CountUp({ to, duree = 1400 }) {
  const ref = useRef(null);
  const [v, setV] = useState(to);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf, t0;
    setV(0);
    const step = (t) => {
      t0 ??= t;
      const p = Math.min(1, (t - t0) / duree);
      setV(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, duree]);
  return <span ref={ref}>{v.toLocaleString("fr-FR")}</span>;
}
