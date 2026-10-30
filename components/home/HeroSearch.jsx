"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export default function HeroSearch({ formations }) {
  const [q, setQ] = useState("");
  const router = useRouter();
  const res = q.trim().length < 2 ? [] : formations.filter((f) => norm(f.intitule).includes(norm(q.trim()))).slice(0, 6);
  return (
    <form className="hs" role="search" onSubmit={(e) => { e.preventDefault(); if (res[0]) router.push(`/formations/${res[0].slug}`); else router.push(`/formations?q=${encodeURIComponent(q)}`); }}>
      <label htmlFor="hs-q" className="hs-label">Quel métier ou quel diplôme visez-vous ?</label>
      <div className="hs-box">
        <input id="hs-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Naturopathe, comptable, BTS MCO, CAP pâtissier…" autoComplete="off" />
        <button type="submit" className="btn-or">Comparer</button>
      </div>
      {res.length > 0 && (
        <ul className="hs-res">
          {res.map((f) => <li key={f.slug}><Link href={`/formations/${f.slug}`}><strong>{f.intitule}</strong><span>{f.nbEcoles} école{f.nbEcoles > 1 ? "s" : ""} comparée{f.nbEcoles > 1 ? "s" : ""}</span></Link></li>)}
        </ul>
      )}
    </form>
  );
}
