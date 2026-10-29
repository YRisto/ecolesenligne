"use client";
import { useState } from "react";
import Link from "next/link";
import { formatPrix } from "../../lib/catalogue";
export default function Compare({ formations }) {
  const [sel, setSel] = useState(["", "", ""]);
  const chosen = sel.map((s) => formations.find((f) => f.slug === s)).filter(Boolean);
  const rows = [["École", (f) => f.ecoleObj?.nom], ["Diplôme", (f) => f.type], ["Niveau", (f) => f.niveau || "—"], ["RNCP", (f) => f.rncp || "—"], ["Durée", (f) => f.duree || "—"], ["Prix", (f) => formatPrix(f)], ["CPF", (f) => (f.cpf ? "Oui" : f.cpf === false ? "Non" : "—")], ["Alternance", (f) => (f.alternance ? "Oui" : "Non")]];
  return (
    <>
      <div className="filters">{sel.map((s, i) => (
        <select key={i} value={s} onChange={(e) => setSel(sel.map((x, j) => (j === i ? e.target.value : x)))}>
          <option value="">Formation {i + 1}…</option>{formations.map((f) => <option key={f.slug} value={f.slug}>{f.intitule} ({f.ecoleObj?.nom})</option>)}
        </select>))}</div>
      {chosen.length > 0 && (
        <table className="compare"><thead><tr><th></th>{chosen.map((f) => <th key={f.slug}><Link href={`/formations/${f.slug}`}>{f.intitule}</Link></th>)}</tr></thead>
          <tbody>{rows.map(([label, fn]) => <tr key={label}><th>{label}</th>{chosen.map((f) => <td key={f.slug}>{fn(f)}</td>)}</tr>)}
            <tr><th></th>{chosen.map((f) => <td key={f.slug}><Link href={`/demande?formation=${f.slug}`} className="btn-sm btn">Demander des infos</Link></td>)}</tr></tbody></table>)}
    </>
  );
}
