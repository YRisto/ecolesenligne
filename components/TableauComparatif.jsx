import Link from "next/link";
import Etoiles from "./Etoiles";
import conf from "../data/ponderation.json";
import { eur } from "../lib/catalogue";

const LIBELLES = { diplome: "Diplôme", prix: "Prix", accompagnement: "Accompagnement", avis: "Avis", financement: "Financement", preparation_examen: "Préparation examen", taux_reussite: "Taux de réussite", garantie: "Garantie", supports: "Supports" };
const nc = (v) => v || <span className="muted">non communiqué</span>;

export default function TableauComparatif({ offres, formation }) {
  if (!offres.length) return <p className="notice">Aucune école référencée pour cette formation pour le moment.</p>;
  return (
    <div className="table-wrap">
      <table className="cmp">
        <thead><tr>
          <th>École</th><th>Prix total</th><th>Financement</th><th>Durée</th><th>Diplôme obtenu</th><th>Modalités</th><th>Stage</th><th>Accompagnement</th><th>Supports</th><th>Préparation examen</th><th>Taux de réussite</th><th>Avis</th><th>Garantie</th><th>Note</th><th></th>
        </tr></thead>
        <tbody>
          {offres.map((o) => { const e = o.ecoleObj || {}; return (
            <tr key={o.ecole}>
              <th scope="row"><Link href={`/ecoles/${o.ecole}`}>{e.nom}</Link>{e.partenaire && <span className="chip chip-ok">Partenaire</span>}{o.intitule_ecole && <div className="muted small">{o.intitule_ecole}</div>}</th>
              <td><strong>{eur(o.prix_total_eur)}</strong>{o.mensualite_eur && <div className="small muted">soit {o.mensualite_eur} €/mois</div>}{!o.prix_total_eur && o.prix_detail && <div className="small">{o.prix_detail}</div>}</td>
              <td>{(o.financement || []).length ? <ul className="pills">{o.financement.map((f) => <li key={f}>{f}</li>)}</ul> : nc("")}</td>
              <td>{o.duree_heures ? `${o.duree_heures} h` : ""}{o.duree_heures && o.duree_acces ? " · " : ""}{nc(o.duree_acces)}</td>
              <td>{nc(o.diplome)}</td>
              <td>{nc(o.modalites || e.modalites)}</td>
              <td>{nc(o.stage)}</td>
              <td>{nc(e.accompagnement)}</td>
              <td>{nc(e.supports)}</td>
              <td>{nc(e.preparation_examen)}</td>
              <td>{nc(o.taux_reussite || e.taux_reussite)}</td>
              <td>{e.avis?.note ? <>{e.avis.note.toString().replace(".", ",")}/5<div className="small muted">{e.avis.nombre} avis {e.avis.source}</div></> : nc("")}</td>
              <td>{nc(e.garantie)}</td>
              <td className="note-cell"><Etoiles note={o.note} />
                <details className="detail-note"><summary>détail</summary>
                  <ul>{Object.entries(conf.poids).map(([k, p]) => <li key={k}>{LIBELLES[k]} ({p} %) : {o.criteres[k] == null ? "n.c." : Math.round(o.criteres[k] * 10) + "/10"}</li>)}</ul>
                </details></td>
              <td>{e.partenaire ? <Link href={`/demande?formation=${formation.slug}&ecole=${o.ecole}`} className="btn btn-sm">Demander des infos</Link> : <a href={o.url || e.site} target="_blank" rel="nofollow noopener" className="btn btn-sm btn-outline">Voir le site</a>}</td>
            </tr>); })}
        </tbody>
      </table>
    </div>
  );
}
