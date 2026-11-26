// Simulation d'activité pour des salariés fictifs (environnement de test, mode démonstration) : des journées de pointage
// vraisemblables, des demandes d'absence, les régularisations du lendemain, les décisions des responsables.
//
// Rien n'est tiré « au hasard » : chaque tirage dépend du salarié et du jour. Même salarié, même jour : même journée, quel que soit
// le moment où la simulation passe. Chaque événement porte son heure ; un passage ne joue que ceux dont l'heure tombe après le
// passage précédent. On peut donc passer toutes les heures, toutes les cinq minutes ou une fois par jour : le résultat est le même.
import { addDays, eachDay, holidayName, isoDow, pad2 } from "./dates.mjs";
import { buildDays, contractAt, countAbsenceDays, sortContracts, toMin, typeMap } from "./model.mjs";

/* ------------------------------------------------------------------ réglages */
// Fréquences par salarié et par jour travaillé. À 500 salariés : quatre à cinq arrêts et cinq à six demandes de congé par jour,
// six absences imprévues, une douzaine de départs non pointés.
export const REGLAGES = {
  retard: 0.06, sans_pause: 0.08, oubli_depart: 0.025, absence_imprevue: 0.012,
  maladie: 0.009, conge: 0.011, evenement: 0.001,
  correction_lendemain: 0.75, regularisation_lendemain: 0.6,
  responsable_actif: 0.82, refus_conge: 0.07,
  amorce_jours: 45,           // au démarrage : les absences « déjà en cours » sont celles qu'auraient produites ces derniers jours
  fenetre_max_jours: 7,       // après une longue interruption, on ne rejoue pas plus d'une semaine
};
const MOTIFS_MALADIE = ["Arrêt de travail", "Arrêt maladie, justificatif à suivre", "Malade ce matin", "Grippe", "Enfant malade"];
const MOTIFS_CONGE = ["Vacances", "Quelques jours en famille", "Week-end prolongé", "Congés d'hiver", "Déménagement", "Rendez-vous personnel", ""];
const MOTIFS_EVENEMENT = ["Mariage dans la famille", "Naissance", "Décès d'un proche"];
const MOTIFS_CORRECTION = ["Oubli de pointage en partant", "Départ non pointé : parti à l'heure habituelle", "Badge oublié le soir"];
const MOTIFS_REFUS = ["Trop d'absents dans l'équipe sur cette période", "Période de forte activité : à reporter", "Un collègue a déjà posé ces dates"];

/* ------------------------------------------------------------------ tirages et heures */
// Tirage reproductible à partir d'un texte (identifiant, jour, sujet).
export function tirage(graine) {
  let x = 2166136261;
  for (let i = 0; i < graine.length; i++) x = Math.imul(x ^ graine.charCodeAt(i), 16777619) >>> 0;
  return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; };
}
const choix = (r, liste) => liste[Math.min(liste.length - 1, Math.floor(r() * liste.length))];
// Tirage parmi des valeurs pondérées : [[valeur, poids], …].
function pondere(r, table) {
  let x = r() * table.reduce((s, [, p]) => s + p, 0);
  for (const [v, p] of table) { if (x < p) return v; x -= p; }
  return table[table.length - 1][0];
}
export const hm = (min) => { const t = Math.max(0, Math.min(1439, Math.round(min))); return `${pad2(Math.floor(t / 60))}:${pad2(t % 60)}`; };

// Décalage de Paris par rapport à UTC pour un instant donné : heure d'été du dernier dimanche de mars au dernier d'octobre, à 1 h UTC.
function decalageParis(ms) {
  const an = new Date(ms).getUTCFullYear();
  const dernierDimanche = (mois) => { const f = new Date(Date.UTC(an, mois + 1, 0, 1)); return f.getTime() - f.getUTCDay() * 864e5; };
  return ms >= dernierDimanche(2) && ms < dernierDimanche(9) ? 2 : 1;
}
// Jour et heure de Paris → instant (texte ISO, UTC).
export function instantParis(jour, heure) {
  const naif = Date.parse(`${jour}T${heure}:00Z`);
  let ms = naif - 36e5;
  ms = naif - decalageParis(ms) * 36e5;
  return new Date(ms).toISOString();
}
// Instant → jour et heure de Paris.
export function parisDe(iso) {
  const ms = Date.parse(iso), local = new Date(ms + decalageParis(ms) * 36e5).toISOString();
  return { jour: local.slice(0, 10), heure: local.slice(11, 16) };
}

/* ------------------------------------------------------------------ une journée de pointage */
// Traits propres à chacun, stables d'un jour à l'autre : matinal ou non, plutôt du matin ou de l'après-midi quand la journée est courte,
// un jour de télétravail pour certains.
function profil(id) {
  const r = tirage(`${id}|profil`);
  return { decalage: Math.round((r() - 0.4) * 60), apresMidi: r() < 0.4, teletravail: r() < 0.22 ? 1 + Math.floor(r() * 5) : 0 };
}

/**
 * Les pointages d'un salarié pour un jour donné.
 * rec : la fiche du jour calculée par buildDays (jour prévu, minutes prévues, plages, absence validée).
 * Renvoie { cas, times, lieu } ; cas : repos, absent (absence imprévue), normale, sans_pause, oubli_depart, demi.
 */
export function journeeSimulee({ id, rec, contract, settings }) {
  const vide = (cas) => ({ cas, times: [], complet: [], lieu: "" });
  if (!rec || !rec.inWindow || !rec.workday || !contract) return vide("repos");
  if (contract.presence === "automatique") return vide("repos");           // ne pointe pas : ses jours prévus sont comptés d'office
  if (rec.abs && !rec.abs.half) return vide("repos");
  const cadre = contract.regime !== "horaire", demi = rec.abs?.half || "";
  const prevu = cadre ? (demi ? 240 : 0) : rec.theo;
  if (!cadre && prevu <= 0) return vide("repos");
  const p = profil(id), r = tirage(`${id}|${rec.date}`);
  const plages = rec.plan?.ranges?.length ? rec.plan.ranges.map(([a, b]) => [toMin(a), toMin(b)]) : null;
  const alea = () => (r() + r() + r() - 1.5) * 12;                           // plus ou moins un quart d'heure, le plus souvent quelques minutes
  const imprevu = r() < REGLAGES.absence_imprevue, oubli = r() < REGLAGES.oubli_depart, sansPause = r() < REGLAGES.sans_pause, retard = r() < REGLAGES.retard;
  if (imprevu && !demi) return vide("absent");

  let t, cas = "normale";
  if (demi === "matin") {                                                   // absent le matin : il vient l'après-midi
    const debut = (plages?.[1]?.[0] ?? 13 * 60 + 30) + r() * 15 - 3;
    t = [debut, debut + (prevu || 240) + r() * 18 - 4]; cas = "demi";
  } else if (demi === "apres_midi") {
    const debut = (plages?.[0]?.[0] ?? 8 * 60 + 45 + p.decalage / 2) + alea();
    t = [debut, debut + (prevu || 240) + r() * 18 - 4]; cas = "demi";
  } else if (cadre) {
    const debut = 8 * 60 + 50 + p.decalage / 2 + alea() + (retard ? 15 + r() * 25 : 0), fin = 17 * 60 + 50 + r() * 60;
    if (r() < 0.4) { const sortie = 12 * 60 + 15 + r() * 40; t = [debut, sortie, sortie + 45 + r() * 30, fin]; }
    else t = [debut, fin];
  } else if (prevu < 360) {                                                 // journée courte, d'un seul tenant : le matin ou l'après-midi selon la personne
    const base = plages ? plages[0][0] : p.apresMidi ? 13 * 60 + 45 + p.decalage / 2 : 9 * 60 + p.decalage / 2;
    const debut = base + alea() + (retard ? 8 + r() * 20 : 0);
    t = [debut, debut + prevu + r() * 16 - 4];
  } else {
    const debut = (plages ? plages[0][0] : 8 * 60 + 45 + p.decalage) + alea() + (retard ? 10 + r() * 25 : 0);
    const pauseDeduite = contract.pause_minutes ?? 45;
    if (sansPause) { t = [debut, debut + prevu + pauseDeduite + r() * 26 - 6]; cas = "sans_pause"; }  // une seule plage : l'outil déduira la pause
    else {
      const sortie = Math.max(debut + 150, plages?.[0]?.[1] != null ? plages[0][1] + r() * 14 - 6 : 12 * 60 + r() * 60);
      const repas = plages?.[1] ? Math.max(30, plages[1][0] - plages[0][1] + r() * 12 - 6) : 45 + r() * 25;
      t = [debut, sortie, sortie + repas, debut + prevu + repas + r() * 28 - 8];
    }
  }
  // minutes entières, strictement croissantes, dans la journée
  const complet = [];
  for (const x of t) complet.push(Math.max(Math.round(x), complet.length ? complet[complet.length - 1] + 2 : 5 * 60));
  if (complet[complet.length - 1] > 23 * 60 + 55) return vide("repos");
  const times = complet.map(hm);
  const lieux = (settings?.lieux || []).map((l) => l.code);
  const lieu = p.teletravail === isoDow(rec.date) && lieux.includes("teletravail") ? "teletravail" : lieux.includes("bureau") ? "bureau" : lieux[0] || "bureau";
  if (oubli && cas !== "demi") return { cas: "oubli_depart", times: times.slice(0, -1), complet: times, lieu };
  return { cas, times, complet: times, lieu };
}

/* ------------------------------------------------------------------ demandes d'absence d'un jour */
const ouvre = (jour) => isoDow(jour) <= 5 && !holidayName(jour);
function prochainOuvre(jour) { let j = jour; for (let i = 0; i < 10 && !ouvre(j); i++) j = addDays(j, 1); return j; }
// Dernier jour d'une absence de n jours ouvrés commençant un jour ouvré.
function finApres(debut, n) { let j = debut, reste = n - 1; while (reste > 0) { j = addDays(j, 1); if (ouvre(j)) reste--; } return j; }
const chevauche = (absences, debut, fin) => absences.some((a) => (a.status === "en_attente" || a.status === "valide") && a.start_date <= fin && a.end_date >= debut);

/**
 * Ce qu'un salarié demande un jour donné : au plus une demande (arrêt du jour, congé à venir, événement familial).
 * b : { user, contracts, absences, plan } ; types : motifs actifs. Renvoie [] ou [{ heure, type, start, end, half, days_count, comment }].
 */
export function demandesDuJour(b, jour, { types, settings }) {
  const id = b.user.id, r = tirage(`${id}|${jour}|absence`), x = r();
  const actifs = new Map([...typeMap(types).values()].filter((t) => t.active !== false).map((t) => [t.code, t]));
  const parFamille = (cat) => [...actifs.values()].find((t) => t.category === cat)?.code || "";
  const sorted = sortContracts(b.contracts || []), c = contractAt(sorted, jour);
  if (!c || !ouvre(jour) || (b.user.entry_date && jour < b.user.entry_date) || (b.user.exit_date && jour > b.user.exit_date)) return [];
  let d = null;
  if (x < REGLAGES.maladie) {
    const type = parFamille("maladie"); if (!type) return [];
    const n = pondere(r, [[1, 35], [2, 25], [3, 15], [5, 15], [10, 10]]);
    d = { heure: hm(7 * 60 + 30 + r() * 75), type, start: jour, end: finApres(jour, n), half: "", comment: choix(r, MOTIFS_MALADIE) };
  } else if (x < REGLAGES.maladie + REGLAGES.conge) {
    const cadre = c.regime !== "horaire";
    const type = (cadre && r() < 0.35 && parFamille("rtt")) || (r() < 0.06 && actifs.has("sans_solde") && "sans_solde") || parFamille("cp");
    if (!type) return [];
    let debut = addDays(jour, 7 + Math.floor(r() * 50));
    debut = r() < 0.5 ? addDays(debut, (8 - isoDow(debut)) % 7) : debut;     // une fois sur deux, à partir d'un lundi
    debut = prochainOuvre(debut);
    const n = pondere(r, [[1, 30], [2, 15], [3, 10], [5, 30], [10, 15]]);
    const half = n === 1 && r() < 0.3 ? (r() < 0.5 ? "matin" : "apres_midi") : "";
    d = { heure: hm(9 * 60 + r() * 480), type, start: debut, end: finApres(debut, n), half, comment: choix(r, MOTIFS_CONGE) };
  } else if (x < REGLAGES.maladie + REGLAGES.conge + REGLAGES.evenement) {
    const type = actifs.has("evenement") ? "evenement" : ""; if (!type) return [];
    const debut = prochainOuvre(addDays(jour, 1 + Math.floor(r() * 10)));
    d = { heure: hm(9 * 60 + r() * 420), type, start: debut, end: finApres(debut, 1 + Math.floor(r() * 3)), half: "", comment: choix(r, MOTIFS_EVENEMENT) };
  }
  if (!d) return [];
  d.days_count = countAbsenceDays({ user: b.user, contracts: b.contracts, plan: b.plan, start: d.start, end: d.end, half: d.half });
  if (!(d.days_count > 0) || chevauche(b.absences || [], d.start, d.end)) return [];
  if ((settings?.closed || []).some((m) => d.start.slice(0, 7) <= m && d.end.slice(0, 7) >= m)) return [];
  return [d];
}
// Un arrêt commence-t-il ce jour-là pour ce salarié ? (Il ne pointe alors pas, même avant d'avoir déclaré son arrêt.)
export function maladeCeJour(b, jour, ctx) {
  const d = demandesDuJour(b, jour, ctx)[0];
  return !!d && d.start === jour;
}

/* ------------------------------------------------------------------ les événements d'une période */
/**
 * Tous les événements simulés dont l'heure tombe dans ]apres, jusqua] (instants ISO).
 * donnees : ce que renvoie la lecture (users, contracts, days, absences, plan, ctx.settings, ctx.types, closed, today).
 * Renvoie une liste triée de { t, kind, user, args } :
 *   punch            le salarié pointe
 *   absence          le salarié dépose une demande
 *   correct          le salarié corrige sa journée de la veille (départ oublié)
 *   decide_days      le responsable valide des journées de son équipe
 *   decide_absence   le responsable décide une demande
 */
export function evenements(donnees, { apres, jusqua, limite = 600 }) {
  const settings = { ...(donnees.ctx?.settings || donnees.settings || {}), closed: donnees.closed || donnees.ctx?.closed || [] };
  const types = donnees.ctx?.types || donnees.types || [], tmap = typeMap(types);
  const fin = parisDe(jusqua), debutMin = new Date(Date.parse(jusqua) - REGLAGES.fenetre_max_jours * 864e5).toISOString();
  const depuis = apres && apres > debutMin ? apres : debutMin;
  const debut = parisDe(depuis);
  const jours = eachDay(debut.jour, fin.jour), lecture = addDays(debut.jour, -6);
  const fiches = new Map();
  for (const u of donnees.users || []) fiches.set(u.id, { user: u, contracts: [], days: [], absences: [], plan: [] });
  for (const k of ["contracts", "days", "absences", "plan"]) for (const x of donnees[k] || []) fiches.get(x.user_id)?.[k].push(x);
  const equipes = new Map();
  for (const b of fiches.values()) if (b.user.manager_id && fiches.has(b.user.manager_id)) {
    if (!equipes.has(b.user.manager_id)) equipes.set(b.user.manager_id, []);
    equipes.get(b.user.manager_id).push(b);
  }
  const out = [];
  const pousse = (jour, heure, kind, user, args) => {
    const t = instantParis(jour, heure);
    if (t > depuis && t <= jusqua) out.push({ t, kind, user, args });
  };
  const ctx = { types, settings };
  for (const b of fiches.values()) {
    const id = b.user.id, sorted = sortContracts(b.contracts);
    const recs = new Map(buildDays({ user: b.user, contracts: b.contracts, days: b.days, absences: b.absences, plan: b.plan, types: tmap, settings, from: lecture, to: fin.jour, today: fin.jour, live: null })
      .map((x) => [x.date, x]));
    const journee = (jour) => journeeSimulee({ id, rec: recs.get(jour), contract: contractAt(sorted, jour), settings });
    const absentCeJour = (jour) => { const rec = recs.get(jour); return !!(rec?.abs && !rec.abs.half) || !!rec?.absPending || maladeCeJour(b, jour, ctx); };
    let veille = null;
    for (const jour of eachDay(addDays(jours[0], -5), fin.jour)) {      // quelques jours avant, pour connaître le dernier jour travaillé
      const rec = recs.get(jour);
      if (!rec?.workday) continue;
      if (jour >= jours[0]) {
        // 1. ses pointages du jour — aucun s'il est absent, ni si sa journée a déjà été reprise par quelqu'un : corrigée, décidée,
        //    ou commencée autrement que par la simulation (pointages venus d'ailleurs : données de démonstration, saisie à la main)
        const prevus = journee(jour).times, deja = rec.row?.times || [];
        const repris = rec.row && (rec.row.corrected || rec.row.status !== "a_valider" || deja.length > prevus.length || deja.some((t, i) => t !== prevus[i]));
        if (!absentCeJour(jour) && !repris) for (const heure of prevus) pousse(jour, heure, "punch", id, { lieu: journee(jour).lieu });
        // 2. sa demande du jour
        for (const d of demandesDuJour(b, jour, ctx)) {
          pousse(jour, d.heure, "absence", id, { type: d.type, start: d.start, end: d.end, half: d.half, days_count: d.days_count, comment: d.comment });
        }
        if (veille) {
          const r = tirage(`${id}|${jour}|lendemain`), hier = journee(veille), ficheHier = recs.get(veille);
          // 3. le départ oublié la veille est corrigé le matin, trois fois sur quatre
          if (hier.cas === "oubli_depart" && r() < REGLAGES.correction_lendemain && ficheHier?.row && ficheHier.row.times.length % 2 === 1 && !ficheHier.row.corrected && ficheHier.row.status === "a_valider") {
            const dernier = hier.complet[hier.complet.length - 1], avant = ficheHier.row.times;
            if (dernier > avant[avant.length - 1]) pousse(jour, hm(8 * 60 + 20 + r() * 100), "correct", id, { day: veille, times: [...avant, dernier], comment: choix(r, MOTIFS_CORRECTION), version: ficheHier.row.version });
          }
          // 4. l'absence imprévue de la veille est régularisée, six fois sur dix
          if (hier.cas === "absent" && !absentCeJour(veille) && !ficheHier?.row && r() < REGLAGES.regularisation_lendemain) {
            const type = pondere(r, [["maladie", 5], ["sans_solde", 3], ["cp", 2]]);
            const n = countAbsenceDays({ user: b.user, contracts: b.contracts, plan: b.plan, start: veille, end: veille, half: "" });
            if (tmap.get(type)?.active !== false && tmap.has(type) && n > 0 && !chevauche(b.absences, veille, veille)) {
              pousse(jour, hm(8 * 60 + 15 + r() * 75), "absence", id, { type, start: veille, end: veille, half: "", days_count: n, comment: "Régularisation de mon absence de la veille" });
            }
          }
        }
        // 5. s'il encadre une équipe : il valide les journées terminées et décide les demandes en attente
        // (seulement s'il est là ce jour-là, et pas avant d'être arrivé)
        const equipe = equipes.get(id), sienne = equipe ? journee(jour) : null;
        if (equipe && !absentCeJour(jour) && sienne.times.length) {
          const r = tirage(`${id}|${jour}|validation`);
          if (r() < REGLAGES.responsable_actif) {
            const base = Math.max(9 * 60 + 10 + r() * 150, toMin(sienne.times[0]) + 12);
            const items = [];
            for (const e of equipe) for (const d of e.days) {
              if (d.day < jour && d.status === "a_valider" && d.times.length && d.times.length % 2 === 0 && items.length < 400) items.push({ id: d.id, version: d.version });
            }
            if (items.length) pousse(jour, hm(base), "decide_days", id, { decision: "valide", items });
            let k = 1;
            for (const e of equipe) for (const a of e.absences) {
              if (a.status !== "en_attente") continue;
              const demande = parisDe(a.created_at).jour, arret = tmap.get(a.type_code)?.category === "maladie";
              if (!(demande < jour || arret)) continue;                         // un congé se décide au plus tôt le lendemain de la demande
              const ra = tirage(`${a.id}|decision`), refus = !arret && a.start_date > jour && ra() < REGLAGES.refus_conge;
              pousse(jour, hm(base + 2 * k++), "decide_absence", id, { id: a.id, decision: refus ? "refuse" : "valide", reason: refus ? choix(ra, MOTIFS_REFUS) : "", version: a.version });
            }
          }
        }
      }
      veille = jour;
    }
  }
  out.sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
  // trop d'événements d'un coup : on s'arrête à une heure ronde, le passage suivant reprendra de là
  if (out.length > limite) { const coupe = out[limite].t; const garde = out.filter((e) => e.t < coupe); return { events: garde, jusqua: garde.length ? garde[garde.length - 1].t : coupe, reste: true }; }
  return { events: out, jusqua, reste: false };
}

/**
 * Absences « déjà en cours » au démarrage de la simulation : celles qu'auraient produites les dernières semaines et qui
 * touchent encore la veille, aujourd'hui ou les jours à venir. Elles sont saisies d'un coup, comme le feraient les RH.
 * Renvoie [{ user_id, type, start, end, half, days_count, comment }].
 */
export function absencesEnCours(donnees, aujourdhui) {
  const settings = { ...(donnees.ctx?.settings || {}), closed: donnees.closed || [] }, types = donnees.ctx?.types || donnees.types || [];
  const fiches = new Map();
  for (const u of donnees.users || []) fiches.set(u.id, { user: u, contracts: [], absences: [], plan: [] });
  for (const k of ["contracts", "absences", "plan"]) for (const x of donnees[k] || []) fiches.get(x.user_id)?.[k].push(x);
  const hier = addDays(aujourdhui, -1), out = [];
  for (const b of fiches.values()) {
    const prises = [...b.absences];
    for (const jour of eachDay(addDays(aujourdhui, -REGLAGES.amorce_jours), addDays(aujourdhui, -2))) {
      for (const d of demandesDuJour({ ...b, absences: prises }, jour, { types, settings })) {
        if (d.end < hier) continue;
        // ce qui a commencé avant le suivi du salarié est ramené à son premier jour suivi
        const debut = d.start < hier ? hier : d.start;
        const n = countAbsenceDays({ user: b.user, contracts: b.contracts, plan: b.plan, start: debut, end: d.end, half: debut === d.start ? d.half : "" });
        if (!(n > 0)) continue;
        const half = debut === d.start ? d.half : "";
        prises.push({ status: "valide", start_date: debut, end_date: d.end });
        out.push({ user_id: b.user.id, type: d.type, start: debut, end: d.end, half, days_count: n, comment: d.comment });
      }
    }
  }
  return out;
}
