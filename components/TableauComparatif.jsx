import Link from "next/link";
import Etoiles from "./Etoiles";
import conf from "../data/ponderation.json";
import { eur } from "../lib/catalogue";

const LIBELLES = { diplome: "Diplôme", prix: "Prix", accompagnement: "Accompagnement", avis: "Avis", financement: "Financement", preparation_examen: "Préparation examen", taux_reussite: "Taux de réussite", garantie: "Garantie", supports: "Supports" };
const nc = (v) => v || <span className="muted">non communiqué</span>;
const Txt = ({ v }) => v ? <details className="clamp"><summary>{v}</summary><div>{v}</div></details> : <span className="muted">non communiqué</span>;

export default function TableauComparatif({ offres, formation }) {
  if (!offres.length) return <p className="notice">Aucune école référencée pour cette formation pour le moment.</p>;
  return (
    <div className="table-wrap">
      <table className="cmp">
        <thead><tr>
          <th>École</th><th>Note</th><th>Prix total</th><th>Diplôme obtenu</th><th>Durée</th><th>Financement</th><th>Stage</th><th>Avis</th><th>Taux de réussite</th><th>Garantie</th><th>Accompagnement</th><th>Supports</th><th>Préparation examen</th><th>Modalités</th><th></th>
        </tr></thead>
        <tbody>
          {offres.map((o) => { const e = o.ecoleObj || {}; return (
            <tr key={o.ecole}>
              <th scope="row"><Link href={`/ecoles/${o.ecole}`}>{e.nom}</Link>{e.partenaire && <span className="chip chip-ok">Partenaire</span>}{o.intitule_ecole && <div className="muted small">{o.intitule_ecole}</div>}</th>
              <td className="note-cell"><Etoiles note={o.note} />
                <details className="detail-note"><summary>détail</summary>
                  <ul>{Object.entries(conf.poids).map(([k, p]) => <li key={k}>{LIBELLES[k]} ({p} %) : {o.criteres[k] == null ? "n.c." : Math.round(o.criteres[k] * 10) + "/10"}</li>)}</ul>
                </details></td>
              <td><strong>{eur(o.prix_total_eur)}</strong>{o.mensualite_eur && <div className="small muted">soit {o.mensualite_eur} €/mois</div>}{!o.prix_total_eur && o.prix_detail && <div className="small">{o.prix_detail}</div>}</td>
              <td>{nc(o.diplome)}</td>
              <td>{o.duree_heures ? `${o.duree_heures} h` : ""}{o.duree_heures && o.duree_acces ? " · " : ""}<Txt v={o.duree_acces} /></td>
              <td>{(o.financement || []).length ? <ul className="pills">{o.financement.map((f) => <li key={f} title={f}>{f.length > 28 ? f.slice(0, 26) + "…" : f}</li>)}</ul> : nc("")}</td>
              <td><Txt v={o.stage} /></td>
              <td>{e.avis?.note ? <>{e.avis.note.toString().replace(".", ",")}/5<div className="small muted">{e.avis.nombre} avis {e.avis.source}</div></> : nc("")}</td>
              <td><Txt v={o.taux_reussite || e.taux_reussite} /></td>
              <td><Txt v={e.garantie} /></td>
              <td><Txt v={e.accompagnement} /></td>
              <td><Txt v={e.supports} /></td>
              <td><Txt v={e.preparation_examen} /></td>
              <td><Txt v={o.modalites || e.modalites} /></td>
              <td><Link href={`/demande?formation=${formation.slug}&ecole=${o.ecole}`} className="btn btn-sm">Demander des infos</Link></td>
            </tr>); })}
        </tbody>
      </table>
    </div>
  );
}
