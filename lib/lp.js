import fs from "node:fs";
import path from "node:path";
import { getFormation, getEcole, getOffres } from "./catalogue";

const dir = path.join(process.cwd(), "data", "lps");
export function getLps() {
  return fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
}
export function getLp(slug) {
  const lp = getLps().find((l) => l.slug === slug);
  if (!lp) return null;
  const formation = getFormation(lp.formation);
  const ecole = getEcole(lp.ecole);
  const offre = formation ? getOffres(formation.code).find((o) => o.ecole === lp.ecole) : null;
  return { ...lp, formationObj: formation || null, ecoleObj: ecole || null, offre: offre || null };
}
