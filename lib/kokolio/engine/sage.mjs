// Export de paie au format d'import de Sage Paie : fichier texte à largeur fixe, trois types de lignes.
//   EV : un événement (une période d'absence) — matricule, code à 4 caractères, du… au…, nombre de jours ;
//   VB : une ligne par salarié, qui porte les dates des congés à reporter sur le bulletin (trois périodes au plus) ;
//   VM : une valeur pour une constante ou une rubrique de paie (ici : un nombre d'heures).
// Les salariés sont triés par matricule et regroupés par blocs de cent : pour chaque bloc, ses EV, puis ses VB, puis ses VM.
// La disposition reproduit, à l'octet près, le fichier que la paie reçoit déjà de l'outil de gestion des temps précédent.

const pad2 = (n) => String(n).padStart(2, "0");
// Sage n'attend que de l'ASCII : les accents sont retirés, tout autre caractère devient « ? ».
const ascii = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, "?");
const gauche = (s, n) => ascii(s).slice(0, n).padEnd(n, " ");
const droite = (s, n) => ascii(s).slice(-n).padStart(n, " ");
// AAAA-MM-JJ → JJ/MM/AA
export const sageDate = (ymd) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(2, 4)}`;
// Le rang d'une ligne EV dans le fichier, écrit comme une durée : 00:HH:MM:SS.
const rang = (n) => `00:${pad2(Math.floor(n / 3600) % 100)}:${pad2(Math.floor(n / 60) % 60)}:${pad2(n % 60)}`;

export const SAGE = { EV: 235, VB: 1347, VM: 37, PLAGES_VB: 3, BLOC: 100, LIBELLE: "du %DEB au %FIN" };

export function ligneEV({ matricule, code, start, end, quantity, flag = "00" }, { date, label, n }) {
  return "EV" + gauche(matricule, 10) + gauche(code, 4) + sageDate(start) + "00:00" + sageDate(end) + "00:00" + droite(Number(quantity).toFixed(2), 12)
    + " ".repeat(119) + gauche(label, 30) + sageDate(date) + rang(n) + "   " + gauche(flag, 2) + sageDate(date);
}
export function ligneVB({ matricule, ranges = [] }) {
  return ("VB" + gauche(matricule, 10) + "0" + " ".repeat(494) + ranges.slice(0, SAGE.PLAGES_VB).map(([a, b]) => sageDate(a) + sageDate(b)).join("")).padEnd(SAGE.VB, " ");
}
export function ligneVM({ matricule, type = "255", code, value }) {
  return "VM" + gauche(matricule, 10) + droite(type, 3) + gauche(code, 10) + droite(Number(value).toFixed(3), 12);
}

// employees : [{ matricule, events: [{ code, start, end, quantity, flag }], ranges: [[début, fin]], values: [{ type, code, value }] }]
// date : jour de production du fichier (AAAA-MM-JJ). Renvoie le texte complet, lignes terminées par CR LF.
export function sageText({ employees, date, label = SAGE.LIBELLE, block = SAGE.BLOC }) {
  const cle = (e) => ascii(e.matricule).slice(0, 10).padEnd(10, " ");
  const tri = [...employees].sort((a, b) => (cle(a) < cle(b) ? -1 : cle(a) > cle(b) ? 1 : 0));
  const lignes = [];
  let n = 0;
  for (let i = 0; i < tri.length; i += block) {
    const lot = tri.slice(i, i + block);
    for (const e of lot) {
      const ev = [...(e.events || [])].map((x, k) => [x, k]).sort((a, b) => (a[0].start < b[0].start ? -1 : a[0].start > b[0].start ? 1 : a[1] - b[1]));
      for (const [x] of ev) lignes.push(ligneEV({ matricule: e.matricule, ...x }, { date, label, n: ++n }));
    }
    for (const e of lot) lignes.push(ligneVB(e));
    for (const e of lot) for (const v of e.values || []) lignes.push(ligneVM({ matricule: e.matricule, ...v }));
  }
  return lignes.map((l) => l + "\r\n").join("");
}

// Lecture d'un fichier à ce format (sert aux contrôles : relire ce qu'on a produit, comparer à un fichier de référence).
export function sageParse(text) {
  const iso = (s) => `20${s.slice(6, 8)}-${s.slice(3, 5)}-${s.slice(0, 2)}`;
  const by = new Map();
  const get = (m) => { if (!by.has(m)) by.set(m, { matricule: m, events: [], ranges: [], values: [] }); return by.get(m); };
  let date = "", label = "";
  for (const l of String(text).split(/\r?\n/)) {
    if (!l) continue;
    const t = l.slice(0, 2), m = l.slice(2, 12).trimEnd();
    if (t === "EV") {
      get(m).events.push({ code: l.slice(12, 16).trimEnd(), start: iso(l.slice(16, 24)), end: iso(l.slice(29, 37)), quantity: Number(l.slice(42, 54)), flag: l.slice(225, 227) });
      date = iso(l.slice(203, 211)); label = l.slice(173, 203).trimEnd();
    } else if (t === "VB") {
      const e = get(m), z = l.slice(507);
      for (let i = 0; i + 16 <= z.length; i += 16) if (z.slice(i, i + 16).trim()) e.ranges.push([iso(z.slice(i, i + 8)), iso(z.slice(i + 8, i + 16))]);
    } else if (t === "VM") {
      get(m).values.push({ type: l.slice(12, 15).trim(), code: l.slice(15, 25).trimEnd(), value: Number(l.slice(25, 37)) });
    } else throw new Error(`Ligne de type inconnu : « ${t} ».`);
  }
  return { employees: [...by.values()], date, label };
}

// Du mois figé (voir closure.mjs) au fichier Sage. Règles :
//   - une ligne EV par absence validée, avec le code de paie du motif ; quantité en jours prévus ou calendaires selon le motif ;
//     demi-journée : « 01 » le matin, « 10 » l'après-midi (les deux derniers caractères avant la date de fin de ligne) ;
//   - une ligne VB par salarié ; elle reprend les dates des motifs « reportés sur le bulletin » (les congés payés), trois périodes au plus ;
//   - une ligne VM par salarié à l'horaire quand une constante de paie est réglée : heures manquantes (prévu − travaillé),
//     heures en plus (travaillé − prévu) ou heures travaillées, au millième d'heure. Rien pour les salariés au forfait jours.
export function buildSageExport(snapshot, settings, { today } = {}) {
  const x = settings?.export?.sage || {};
  const employees = snapshot.employees.map((e) => {
    const abs = [...e.absences].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
    const events = abs.map((a) => ({ code: a.export_code || "", start: a.start, end: a.end,
      quantity: a.unit === "calendaires" && a.cal != null ? a.cal : a.days, flag: a.half === "matin" ? "01" : a.half ? "10" : "00" }));
    const ranges = abs.filter((a) => a.dates).map((a) => [a.start, a.end]);
    const values = [];
    if (x.vm_code && x.vm_source && e.regime !== "forfait_jours") {
      const min = x.vm_source === "travaille" ? e.worked : x.vm_source === "surplus" ? Math.max(0, e.worked - e.theo) : Math.max(0, e.theo - e.worked);
      if (min > 0) values.push({ type: x.vm_type || "255", code: x.vm_code, value: min / 60 });
    }
    return { matricule: e.matricule || e.login, events, ranges, values };
  });
  return sageText({ employees, date: today || snapshot.to, label: x.label ?? SAGE.LIBELLE });
}

// Ce que la paie ne saura pas lire : motifs sans code, codes ou matricules trop longs pour leur zone.
export function sageWarnings(snapshot) {
  const sansCode = new Set(), codeLong = new Set(), matricules = [];
  for (const e of snapshot.employees) {
    if ((e.matricule || e.login).length > 10) matricules.push(e.name);
    for (const a of e.absences) { if (!a.export_code) sansCode.add(a.label); else if (a.export_code.length > 4) codeLong.add(`${a.label} (${a.export_code})`); }
  }
  return { no_code: [...sansCode], long_code: [...codeLong], long_matricule: matricules.slice(0, 200) };
}
