// Jeu de données de démonstration : six salariés fictifs (ceux de la maquette), deux mois de pointages, des absences,
// des validations en attente. Tout est calculé à partir de la date du jour, de façon reproductible : même date, mêmes données.
import { addDays, addMonths, eachDay, holidayName, isoDow, mondayOf, monthOf, monthStart, pad2 } from "./dates.mjs";
import { countAbsenceDays } from "./model.mjs";

const SEMAINE = [1, 2, 3, 4, 5];
const horaire = (heures, jours = SEMAINE, pause = 45) => ({ regime: "horaire", work_days: jours, day_minutes: [1, 2, 3, 4, 5, 6, 7].map((d) => (jours.includes(d) ? Math.round((heures * 60) / jours.length) : 0)), pause_minutes: pause, cp_per_month: 2.08, forfait_days: 218 });
const forfait = () => ({ regime: "forfait_jours", work_days: SEMAINE, day_minutes: [0, 0, 0, 0, 0, 0, 0], pause_minutes: 0, cp_per_month: 2.08, forfait_days: 218 });

// Bibliothèque d'exemple : quelques horaires journaliers avec leurs plages, et des cycles construits avec eux.
// Les salariés fictifs à 35 h et à 28 h suivent un cycle qui reproduit leur horaire : leurs chiffres ne changent pas, le planning devient lisible.
export const DEMO_MODELS = [
  { code: "J7", label: "Journée 7 h", minutes: 420, ranges: [["09:00", "12:30"], ["13:30", "17:00"]], color: "bleu", sort: 10 },
  { code: "J8", label: "Journée 8 h", minutes: 480, ranges: [["08:45", "13:15"], ["14:00", "17:30"]], color: "violet", sort: 20 },
  { code: "M4", label: "Matinée 4 h", minutes: 240, ranges: [["09:00", "13:00"]], color: "turquoise", sort: 30 },
  { code: "S7", label: "Soirée 7 h", minutes: 420, ranges: [["12:00", "15:30"], ["16:30", "20:00"]], color: "ambre", sort: 40 },
];
export const DEMO_CYCLES = [
  { name: "Semaine 35 h", weeks: [["J7", "J7", "J7", "J7", "J7", null, null]] },
  { name: "Temps partiel 28 h (lundi à jeudi)", weeks: [["J7", "J7", "J7", "J7", null, null, null]] },
  { name: "Alternance 4 jours / 5 jours (36 h en moyenne)", weeks: [["J8", "J8", "J8", "J8", null, null, null], ["J8", "J8", "J8", "J8", "J8", null, null]] },
];

export const DEMO_USERS = [
  { login: "sophie.leroy", role: "rh", first_name: "Sophie", last_name: "Leroy", matricule: "0002", team: "Direction", job: "Responsable RH", manager_login: "", entry_date: "2014-03-01",
    details: { civilite: "Mme", type_contrat: "CDI", categorie: "Cadre" }, contract: forfait(), cp: 14, rtt: 10, profil: "RH, cadre au forfait jours" },
  { login: "julien.bernard", role: "salarie", first_name: "Julien", last_name: "Bernard", matricule: "0004", team: "Admissions", job: "Responsable des admissions", manager_login: "sophie.leroy", entry_date: "2020-01-15",
    details: { civilite: "M.", type_contrat: "CDI", categorie: "Cadre" }, contract: forfait(), cp: 8.5, rtt: 10, profil: "responsable de quatre personnes, cadre au forfait jours" },
  { login: "camille.martin", role: "salarie", first_name: "Camille", last_name: "Martin", matricule: "0012", team: "Admissions", job: "Conseillère en formation", manager_login: "julien.bernard", entry_date: "2023-09-01",
    details: { civilite: "Mme", type_contrat: "CDI", categorie: "Employé" }, contract: horaire(35), cycle: "Semaine 35 h", cp: 9, rtt: 0, profil: "salariée à 35 h" },
  { login: "thomas.petit", role: "salarie", first_name: "Thomas", last_name: "Petit", matricule: "0027", team: "Admissions", job: "Chargé d'admission", manager_login: "julien.bernard", entry_date: "2025-12-01",
    details: { civilite: "M.", type_contrat: "CDD", categorie: "Employé" }, contract: horaire(35), cycle: "Semaine 35 h", cp: 6, rtt: 0, profil: "salarié à 35 h, avec des oublis de pointage" },
  { login: "ines.roux", role: "salarie", first_name: "Inès", last_name: "Roux", matricule: "0031", team: "Pédagogie", job: "Formatrice", manager_login: "julien.bernard", entry_date: "2022-06-01",
    details: { civilite: "Mme", type_contrat: "CDI", categorie: "Agent de maîtrise" }, contract: horaire(28, [1, 2, 3, 4]), cycle: "Temps partiel 28 h (lundi à jeudi)", cp: 7, rtt: 0, profil: "salariée à temps partiel, 28 h du lundi au jeudi" },
  { login: "nadia.benali", role: "salarie", first_name: "Nadia", last_name: "Benali", matricule: "0040", team: "Pédagogie", job: "Responsable pédagogique", manager_login: "julien.bernard", entry_date: "2026-05-04",
    details: { civilite: "Mme", type_contrat: "CDI", categorie: "Cadre" }, contract: forfait(), cp: 5, rtt: 8, profil: "cadre au forfait jours" },
];

const hm = (min) => { const t = Math.round(min); return `${pad2(Math.floor(t / 60))}:${pad2(t % 60)}`; };
// Tirage reproductible à partir d'un texte (identifiant + date).
function tirage(graine) {
  let x = 2166136261;
  for (const ch of graine) x = Math.imul(x ^ ch.charCodeAt(0), 16777619) >>> 0;
  return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; };
}
const ouvre = (u, d) => u.contract.work_days.includes(isoDow(d)) && !holidayName(d) && d >= u.entry_date;
// Le n-ième lundi d'un mois (1 = premier lundi du mois).
function lundi(mois, n) { let d = mondayOf(monthStart(mois)); if (d < monthStart(mois)) d = addDays(d, 7); return addDays(d, 7 * (n - 1)); }
// Premier jour ouvré (pour ce salarié) à partir d'une date.
function prochainOuvre(u, d) { let x = d; for (let i = 0; i < 14 && !ouvre(u, x); i++) x = addDays(x, 1); return x; }

export function buildDemo(today) {
  const m2 = monthOf(today), m1 = addMonths(m2, -1), m0 = addMonths(m2, -2);
  const goLive = monthStart(m0), hier = addDays(today, -1), limiteValide = addDays(today, -9);
  const users = DEMO_USERS, par = Object.fromEntries(users.map((u) => [u.login, u]));
  const absences = [];
  const absence = (login, type, start, end, { half = "", status = "valide", comment = "", refusal_reason = "", par_rh = false } = {}) => {
    const u = par[login];
    const days = countAbsenceDays({ user: { entry_date: u.entry_date }, contracts: [{ ...u.contract, start_date: "2000-01-01", end_date: null }], start, end, half });
    if (days > 0) absences.push({ login, type, start, end, half, days_count: days, status, comment, refusal_reason, par_rh });
  };
  // --- passées
  const s0 = lundi(m0, 2), s1 = lundi(m1, 3), futur = addDays(mondayOf(today), 14);
  absence("sophie.leroy", "cp", addDays(s0, 2), addDays(s0, 4), { comment: "Quelques jours en famille" });
  absence("julien.bernard", "rtt", prochainOuvre(par["julien.bernard"], addDays(s0, 4)), prochainOuvre(par["julien.bernard"], addDays(s0, 4)));
  absence("camille.martin", "maladie", addDays(s0, 1), addDays(s0, 2), { par_rh: true, comment: "Arrêt transmis par téléphone" });
  absence("camille.martin", "cp", s1, addDays(s1, 4), { comment: "Vacances" });
  const demiThomas = prochainOuvre(par["thomas.petit"], addDays(lundi(m1, 1), 4));
  absence("thomas.petit", "evenement", demiThomas, demiThomas, { half: "matin", comment: "Rendez-vous à la mairie" });
  absence("thomas.petit", "cp", addDays(lundi(m1, 4), 3), addDays(lundi(m1, 4), 4), { status: "refuse", refusal_reason: "Semaine de clôture des inscriptions : toute l'équipe est mobilisée", comment: "Week-end prolongé" });
  absence("ines.roux", "formation", addDays(lundi(m1, 1), 1), addDays(lundi(m1, 1), 2), { comment: "Formation de formateurs" });
  const demiNadia = prochainOuvre(par["nadia.benali"], addDays(lundi(m1, 2), 4));
  absence("nadia.benali", "rtt", demiNadia, demiNadia, { half: "apres_midi" });
  // --- à venir, en attente de décision
  absence("camille.martin", "cp", futur, addDays(futur, 2), { status: "en_attente", comment: "Déménagement" });
  absence("ines.roux", "cp", addDays(futur, 7), addDays(futur, 10), { status: "en_attente", comment: "Vacances" });
  absence("julien.bernard", "cp", prochainOuvre(par["julien.bernard"], addDays(futur, 4)), prochainOuvre(par["julien.bernard"], addDays(futur, 4)), { status: "en_attente" });

  const absent = (login, d) => absences.find((a) => a.login === login && a.status === "valide" && a.start <= d && a.end >= d) || null;
  const days = [];
  for (const u of users) {
    const dates = eachDay(goLive, hier).filter((d) => ouvre(u, d) && !(absent(u.login, d) && !absent(u.login, d).half));
    const derniers = [...dates].reverse(); // derniers[0] = dernier jour travaillé avant aujourd'hui
    const cadre = u.contract.regime === "forfait_jours";
    for (const d of dates) {
      const r = tirage(`${u.login}|${d}`), rang = derniers.indexOf(d), demi = absent(u.login, d)?.half || "";
      let times, lieu = "bureau", status = d <= limiteValide ? "valide" : "a_valider", corrected = false, comment = "", refusal_reason = "";
      if (demi === "matin") times = [hm(13 * 60 + 25 + r() * 10), hm(17 * 60 + 5 + r() * 20)];
      else if (demi === "apres_midi") times = [hm(8 * 60 + 50 + r() * 15), hm(12 * 60 + 25 + r() * 15)];
      else if (cadre) times = [hm(8 * 60 + 50 + r() * 25), hm(18 * 60 + r() * 45)];
      else {
        const arrivee = 8 * 60 + 40 + r() * 30, cible = u.contract.day_minutes[isoDow(d) - 1] || 420;
        if (r() < 0.2) times = [hm(arrivee), hm(arrivee + cible + u.contract.pause_minutes - 5 + r() * 20)]; // journée d'un seul tenant : la pause sera déduite
        else { const sortie = 12 * 60 + 15 + r() * 30, repas = 45 + r() * 15; times = [hm(arrivee), hm(sortie), hm(sortie + repas), hm(arrivee + cible + repas - 10 + r() * 30)]; }
      }
      if (u.login === "camille.martin" && isoDow(d) === 5) lieu = "teletravail";
      if (u.login === "nadia.benali" && isoDow(d) === 3) lieu = "teletravail";
      // quelques situations à traiter, sur les derniers jours
      if (u.login === "camille.martin" && rang === 4) times = ["08:00", "19:30"];                  // plus de dix heures
      if (u.login === "camille.martin" && rang === 3) times = ["06:00", "14:00"];                  // moins de onze heures de repos
      if (u.login === "thomas.petit" && rang === 1) { times = [times[0]]; status = "a_valider"; }  // départ non pointé
      if (u.login === "thomas.petit" && rang === 3) continue;                                      // jour sans pointage ni absence
      if (u.login === "thomas.petit" && rang === 5) { status = "refuse"; refusal_reason = "Heure d'arrivée à confirmer : vous étiez attendu à 9 h en réunion d'équipe"; }
      if (u.login === "ines.roux" && rang === 2) { corrected = true; comment = "Badge oublié le matin"; status = "a_valider"; }
      days.push({ login: u.login, day: d, times, lieu, status, corrected, comment, refusal_reason });
    }
  }
  const annees = [...new Set([+goLive.slice(0, 4), +today.slice(0, 4)])];
  const entries = [];
  for (const u of users) for (const y of annees) {
    entries.push({ login: u.login, kind: "cp", year: y, amount: u.cp, reason: "Solde de départ (démonstration)" });
    if (u.rtt) entries.push({ login: u.login, kind: "rtt", year: y, amount: u.rtt, reason: "Droits RTT de l'année (démonstration)" });
  }
  return { go_live: goLive, close_month: m0, users, days, absences, entries, models: DEMO_MODELS, cycles: DEMO_CYCLES };
}
