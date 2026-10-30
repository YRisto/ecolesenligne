"use client";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import FormationCard from "../../components/FormationCard";

export default function Listing({ formations, domaines }) {
  const params = useSearchParams();
  const [domaine, setDomaine] = useState(params.get("domaine") || "");
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const types = useMemo(() => [...new Set(formations.map((f) => f.type))].sort(), [formations]);
  const list = formations.filter((f) => (!domaine || f.domaine === domaine) && (!type || f.type === type) && (!q || f.intitule.toLowerCase().includes(q.toLowerCase())));
  return (
    <>
      <div className="filters">
        <input aria-label="Rechercher une formation" placeholder="Rechercher une formation : comptable, CAP, BTS…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Domaine" value={domaine} onChange={(e) => setDomaine(e.target.value)}><option value="">Tous les domaines</option>{domaines.map((d) => <option key={d}>{d}</option>)}</select>
        <select aria-label="Diplôme" value={type} onChange={(e) => setType(e.target.value)}><option value="">Tous les diplômes</option>{types.map((t) => <option key={t}>{t}</option>)}</select>
      </div>
      <p className="count">{list.length} formation{list.length > 1 ? "s" : ""}</p>
      <div className="grid">{list.map((f) => <FormationCard key={f.code} f={f} />)}</div>
    </>
  );
}
