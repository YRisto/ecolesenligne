import formations from "../data/formations.json";
import ecoles from "../data/ecoles.json";
import offres from "../data/offres.json";
import { noterOffres } from "./score";

export const DOMAINES = ["Commerce & Marketing","Gestion & RH","Santé & Bien-être","Animaux","Informatique & Réseaux","Bâtiment & Technique","Création & Mode","Services & Formation","Petite enfance & Social","Langues","VAE"];

export const ecolesById = Object.fromEntries(ecoles.map((e) => [e.slug, e]));
export function getEcoles() { return ecoles; }
export function getEcole(slug) { return ecolesById[slug]; }
export function getFormations() {
  return formations.map((f) => ({ ...f, nbEcoles: offres.filter((o) => o.formation === f.code).length }));
}
export function getFormation(slug) { return getFormations().find((f) => f.slug === slug); }
export function getOffres(code) { return noterOffres(offres.filter((o) => o.formation === code), ecolesById).map((o) => ({ ...o, ecoleObj: ecolesById[o.ecole] })); }
export function getOffresByEcole(slug) { return offres.filter((o) => o.ecole === slug).map((o) => ({ ...o, formationObj: formations.find((f) => f.code === o.formation) })); }
export function prixMin(code) { const p = offres.filter((o) => o.formation === code && o.prix_total_eur).map((o) => o.prix_total_eur); return p.length ? Math.min(...p) : null; }
export const eur = (n) => (n ? `${Number(n).toLocaleString("fr-FR")} €` : "—");
