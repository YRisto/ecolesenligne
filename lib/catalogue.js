import data from "../data/formations.json";

export const DOMAINES = [
  "Commerce & Marketing", "Gestion & RH", "Santé & Bien-être", "Animaux",
  "Informatique & Réseaux", "Bâtiment & Technique", "Création & Mode",
  "Services & Formation", "Petite enfance & Social", "VAE",
];

export function getEcoles() { return data.ecoles; }
export function getEcole(slug) { return data.ecoles.find((e) => e.slug === slug); }
export function getFormations() {
  return data.formations.map((f) => ({ ...f, ecoleObj: getEcole(f.ecole) }));
}
export function getFormation(slug) { return getFormations().find((f) => f.slug === slug); }
export function getFormationsByEcole(slug) { return getFormations().filter((f) => f.ecole === slug); }
export function formatPrix(f) {
  if (f.prix_eur) return `${Number(f.prix_eur).toLocaleString("fr-FR")} €`;
  return f.prix_texte || "Sur devis";
}
