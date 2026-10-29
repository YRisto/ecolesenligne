import conf from "../data/ponderation.json";

// Chaque fonction renvoie un score 0..1 ou null (non communiqué)
const diplomeScore = (o) => {
  const d = (o.diplome || "").toLowerCase();
  if (!d) return null;
  if (d.includes("diplôme d'état") || d.includes("diplome d'etat")) return 1;
  if (d.includes("rncp")) return 0.9;
  if (d.includes("rs") || d.includes("répertoire spécifique")) return 0.7;
  if (d.includes("certificat")) return 0.45;
  return 0.3;
};
const financementScore = (o) => {
  const f = (o.financement || []).map((x) => x.toLowerCase());
  if (!f.length) return null;
  let s = 0;
  if (f.some((x) => x.includes("cpf"))) s += 0.4;
  if (f.some((x) => x.includes("france travail") || x.includes("pôle emploi"))) s += 0.2;
  if (f.some((x) => x.includes("alternance"))) s += 0.2;
  if (f.some((x) => x.includes("plusieurs fois") || x.includes("mensualit"))) s += 0.2;
  return Math.min(1, s);
};
const textScore = (t, keywords) => {
  if (!t) return null;
  const l = t.toLowerCase();
  const hits = keywords.filter((k) => l.includes(k)).length;
  return Math.min(1, 0.4 + hits * 0.15);
};
const accompagnementScore = (e) => textScore(e.accompagnement, ["tuteur", "coach", "permanence", "téléphone", "visio", "communauté", "dédié"]);
const supportsScore = (e) => textScore(e.supports, ["vidéo", "livre", "kit", "plateforme", "application", "mallette", "matériel"]);
const prepaScore = (e) => textScore(e.preparation_examen, ["blanc", "inscription", "candidat libre", "re-présentation", "gratuit", "jury", "entraînement"]);
const garantieScore = (e) => {
  const g = (e.garantie || "").toLowerCase();
  if (!g || g.includes("aucune")) return g ? 0.2 : null;
  if (g.includes("rembours")) return 1;
  if (g.includes("rétractation")) return 0.5;
  return 0.4;
};
const avisScore = (e) => (e.avis && e.avis.note ? Math.max(0, (Number(e.avis.note) - 3) / 2) : null);
const tauxScore = (o, e) => {
  const t = o.taux_reussite || e.taux_reussite || "";
  const m = String(t).match(/(\d{2,3})\s*%/);
  return m ? Math.min(1, Number(m[1]) / 100) : null;
};
const prixScore = (o, minPrix) => {
  if (!o.prix_total_eur || !minPrix) return null;
  const ecart = (o.prix_total_eur - minPrix) / minPrix * 100;
  return Math.max(0, 1 - Math.min(ecart, conf.plafond_prix_pct) / conf.plafond_prix_pct);
};

export function noterOffres(offres, ecolesById) {
  const prix = offres.map((o) => o.prix_total_eur).filter(Boolean);
  const minPrix = prix.length ? Math.min(...prix) : null;
  return offres.map((o) => {
    const e = ecolesById[o.ecole] || {};
    const criteres = {
      diplome: diplomeScore(o), prix: prixScore(o, minPrix), accompagnement: accompagnementScore(e), avis: avisScore(e),
      financement: financementScore(o), preparation_examen: prepaScore(e), taux_reussite: tauxScore(o, e),
      garantie: garantieScore(e), supports: supportsScore(e),
    };
    let total = 0, poidsTotal = 0;
    for (const [k, p] of Object.entries(conf.poids)) {
      const v = criteres[k] == null ? conf.valeur_non_communique : criteres[k];
      total += v * p; poidsTotal += p;
    }
    const sur1 = total / poidsTotal;
    const note = Math.round((conf.note_min + sur1 * (conf.note_max - conf.note_min)) * 10) / 10;
    return { ...o, criteres, note };
  }).sort((a, b) => b.note - a.note);
}
