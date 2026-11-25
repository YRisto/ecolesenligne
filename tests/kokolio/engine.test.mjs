// Tests du moteur de calcul. Lancement : node --test tests/kokolio/engine.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { addDays, addMonths, holidaysFR, isoDow, isYmd, mondayOf, monthEnd } from "../../lib/kokolio/engine/dates.mjs";
import { buildDays, contractAt, countAbsenceDays, netMinutes, rawMinutes, sortContracts, summarize } from "../../lib/kokolio/engine/model.mjs";
import { balances, yearEndCp } from "../../lib/kokolio/engine/balances.mjs";
import { yearView } from "../../lib/kokolio/engine/yearview.mjs";
import { buildExport, buildSnapshot } from "../../lib/kokolio/engine/closure.mjs";
import { parseTable, prepareImport, slugLogin } from "../../lib/kokolio/engine/importcsv.mjs";
import { passwordIssues } from "../../lib/kokolio/engine/password.mjs";

const SETTINGS = { go_live: "2026-01-01", pause_threshold_min: 360, max_day_min: 600, max_week_min: 2880, min_rest_min: 660,
  export: { hours_code: "HS-HN", include_hours: true, sep: ";", decimal: ",", header: true } };
const TYPES = [
  { code: "cp", label: "Congé payé", category: "cp", export_code: "AB-CP", absenteeism: false },
  { code: "rtt", label: "RTT", category: "rtt", export_code: "AB-RTT", absenteeism: false },
  { code: "maladie", label: "Arrêt maladie", category: "maladie", export_code: "AB-MAL", absenteeism: true },
];
const C35 = { user_id: "u1", start_date: "2000-01-01", end_date: null, regime: "horaire", day_minutes: [420, 420, 420, 420, 420, 0, 0], work_days: [1, 2, 3, 4, 5], pause_minutes: 45, cp_per_month: 2.08, forfait_days: 218 };
const USER = { id: "u1", login: "camille", name: "Camille Martin", matricule: "0012", team: "Admissions", entry_date: "2023-09-01", exit_date: null };
const day = (d, times, status = "valide", extra = {}) => ({ id: "d" + d, user_id: "u1", day: d, times, status, lieu: "bureau", ...extra });
const abs = (type, start, end, status = "valide", half = "") => ({ id: `a-${start}`, user_id: "u1", type_code: type, start_date: start, end_date: end, half, status });
const run = (over) => buildDays({ user: USER, contracts: [C35], days: [], absences: [], types: TYPES, settings: SETTINGS, from: "2026-11-02", to: "2026-11-08", today: "2026-11-25", ...over });

test("dates : jours de la semaine, mois, validité", () => {
  assert.equal(isoDow("2026-11-23"), 1);
  assert.equal(isoDow("2026-11-29"), 7);
  assert.equal(mondayOf("2026-11-29"), "2026-11-23");
  assert.equal(monthEnd("2028-02"), "2028-02-29");
  assert.equal(addMonths("2026-01", -1), "2025-12");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.ok(isYmd("2026-02-28")); assert.ok(!isYmd("2026-02-30")); assert.ok(!isYmd("28/02/2026"));
});

test("jours fériés : dates mobiles calées sur Pâques", () => {
  const h26 = holidaysFR(2026), h27 = holidaysFR(2027);
  assert.equal(h26["2026-04-06"], "Lundi de Pâques");
  assert.equal(h26["2026-05-14"], "Ascension");
  assert.equal(h26["2026-05-25"], "Lundi de Pentecôte");
  assert.equal(h27["2027-03-29"], "Lundi de Pâques");
  assert.equal(h27["2027-05-06"], "Ascension");
  assert.equal(Object.keys(h26).length, 11);
});

test("minutes travaillées et pause déduite d'office", () => {
  assert.equal(rawMinutes(["08:30", "12:00", "13:00", "17:00"]), 450);
  assert.equal(rawMinutes(["08:30"]), 0);
  assert.equal(netMinutes(["09:00", "17:00"], C35, SETTINGS), 435, "une seule plage de 8 h : 45 min de pause déduites");
  assert.equal(netMinutes(["09:00", "15:00"], C35, SETTINGS), 360, "6 h pile : pas de déduction");
  assert.equal(netMinutes(["09:00", "12:00", "13:00", "18:00"], C35, SETTINGS), 480, "pause pointée : rien à déduire");
});

test("horaires datés : le changement d'horaire ne réécrit pas le passé", () => {
  const cs = sortContracts([
    { ...C35, end_date: "2026-06-30" },
    { ...C35, start_date: "2026-07-01", day_minutes: [480, 480, 480, 480, 0, 0, 0], work_days: [1, 2, 3, 4] },
  ]);
  assert.equal(contractAt(cs, "2026-06-30").day_minutes[0], 420);
  assert.equal(contractAt(cs, "2026-07-01").day_minutes[0], 480);
  assert.equal(contractAt(cs, "1999-12-31"), null);
  const recs = buildDays({ user: USER, contracts: cs, days: [], absences: [], types: TYPES, settings: SETTINGS, from: "2026-06-26", to: "2026-07-03", today: "2026-11-25" });
  assert.deepEqual(recs.map((r) => r.theoFull), [420, 0, 0, 420, 420, 480, 480, 0], "vendredi travaillé avant juillet, plus après");
});

test("débit-crédit : seuls les jours passés ou terminés comptent", () => {
  const recs = run({ days: [day("2026-11-02", ["09:00", "12:00", "13:00", "17:30"]), day("2026-11-03", ["09:00", "12:00", "13:00", "16:00"])] });
  const s = summarize(recs, { from: "2026-11-02", to: "2026-11-08", settings: SETTINGS });
  assert.equal(s.worked, 450 + 360);
  assert.equal(s.theo, 420 * 5);
  assert.equal(s.ecart, 450 + 360 - 2100);
  assert.equal(s.anomalies.filter((a) => a.kind === "vide").length, 3, "mercredi à vendredi sans pointage ni absence");
  const today = buildDays({ user: USER, contracts: [C35], days: [day("2026-11-25", ["09:00"], "a_valider")], absences: [], types: TYPES, settings: SETTINGS, from: "2026-11-25", to: "2026-11-25", today: "2026-11-25" });
  assert.equal(today[0].counted, false, "journée en cours : pas encore dans l'écart");
  assert.equal(today[0].open, true);
});

test("absences : journée entière, demi-journée, demande en attente", () => {
  const recs = run({ absences: [abs("cp", "2026-11-02", "2026-11-03"), abs("rtt", "2026-11-04", "2026-11-04", "valide", "matin"), abs("cp", "2026-11-05", "2026-11-05", "en_attente")],
    days: [day("2026-11-04", ["13:30", "17:00"])] });
  assert.equal(recs[0].theo, 0); assert.equal(recs[0].abs.code, "CP");
  assert.equal(recs[2].theo, 210, "demi-journée : la moitié de l'horaire reste due");
  assert.deepEqual(recs[3].anomalies, [], "une demande en attente n'est pas une anomalie");
  assert.deepEqual(recs[4].anomalies, ["vide"]);
  const s = summarize(recs, { from: "2026-11-02", to: "2026-11-08", settings: SETTINGS });
  assert.equal(s.abs.cp, 2); assert.equal(s.abs.rtt, 0.5); assert.equal(s.abs_unplanned, 0);
  assert.equal(s.ecart, 210 - 210 + 0 - 420 - 420, "jeudi (en attente) et vendredi restent dus");
});

test("rien n'est dû avant la mise en service ni avant l'entrée du salarié", () => {
  const recs = buildDays({ user: { ...USER, entry_date: "2026-11-04" }, contracts: [C35], days: [], absences: [], types: TYPES,
    settings: { ...SETTINGS, go_live: "2026-11-03" }, from: "2026-11-02", to: "2026-11-06", today: "2026-11-25" });
  assert.deepEqual(recs.map((r) => r.workday), [false, false, true, true, true]);
  assert.deepEqual(recs.map((r) => r.anomalies.length), [0, 0, 1, 1, 1]);
});

test("jour férié et week-end : ni horaire dû ni anomalie", () => {
  const recs = buildDays({ user: USER, contracts: [C35], days: [], absences: [], types: TYPES, settings: SETTINGS, from: "2026-11-09", to: "2026-11-15", today: "2026-11-25" });
  const armistice = recs.find((r) => r.date === "2026-11-11");
  assert.equal(armistice.holiday, "Armistice 1918"); assert.equal(armistice.theo, 0); assert.deepEqual(armistice.anomalies, []);
  assert.equal(recs.find((r) => r.date === "2026-11-14").workday, false);
});

test("alertes légales : 10 h par jour, 48 h par semaine, 11 h de repos", () => {
  const days = [
    day("2026-11-02", ["07:00", "12:00", "12:30", "18:30"]),                 // 11 h
    day("2026-11-03", ["04:00", "12:00", "13:00", "15:00"]),                 // repos de 9 h 30 depuis la veille
    day("2026-11-04", ["08:00", "12:00", "13:00", "19:00"]), day("2026-11-05", ["08:00", "12:00", "13:00", "19:00"]), day("2026-11-06", ["08:00", "12:00", "13:00", "19:00"]),
  ];
  const s = summarize(run({ days }), { from: "2026-11-02", to: "2026-11-08", settings: SETTINGS });
  assert.deepEqual(s.alerts.map((a) => a.kind).sort(), ["jour", "repos", "semaine"]);
});

test("départ non pointé : anomalie dès le lendemain", () => {
  const recs = run({ days: [day("2026-11-02", ["09:00", "12:00", "13:00"], "a_valider")] });
  assert.deepEqual(recs[0].anomalies, ["depart"]);
  assert.equal(recs[0].worked, 180, "seules les plages fermées comptent");
});

test("forfait jours : aucun horaire dû, les jours travaillés sont comptés", () => {
  const forfait = { ...C35, regime: "forfait_jours", day_minutes: [0, 0, 0, 0, 0, 0, 0] };
  const recs = buildDays({ user: USER, contracts: [forfait], days: [day("2026-11-02", ["09:00", "19:00"])], absences: [], types: TYPES, settings: SETTINGS, from: "2026-11-02", to: "2026-11-03", today: "2026-11-25" });
  const s = summarize(recs, { from: "2026-11-02", to: "2026-11-03", settings: SETTINGS });
  assert.equal(s.theo, 0); assert.equal(s.ecart, 0); assert.equal(s.days_worked, 1);
  assert.deepEqual(recs[1].anomalies, ["vide"], "un jour ouvré sans rien reste à régulariser");
});

test("décompte des jours d'absence : jours travaillés, hors fériés, temps partiel compris", () => {
  assert.equal(countAbsenceDays({ user: USER, contracts: [C35], start: "2026-11-09", end: "2026-11-15" }), 4, "le 11 novembre ne compte pas");
  assert.equal(countAbsenceDays({ user: USER, contracts: [C35], start: "2026-11-14", end: "2026-11-15" }), 0);
  assert.equal(countAbsenceDays({ user: USER, contracts: [C35], start: "2026-11-10", end: "2026-11-10", half: "matin" }), 0.5);
  const partiel = { ...C35, day_minutes: [420, 420, 0, 420, 420, 0, 0], work_days: [1, 2, 4, 5] };
  assert.equal(countAbsenceDays({ user: USER, contracts: [partiel], start: "2026-11-16", end: "2026-11-20" }), 4);
  assert.equal(countAbsenceDays({ user: USER, contracts: [C35], start: "2026-12-28", end: "2027-01-08", clipFrom: "2027-01-01", clipTo: "2027-12-31" }), 5, "découpe par année, 1er janvier férié");
});

test("soldes : écritures, acquisition mensuelle, congés pris et en attente", () => {
  const b = balances({ user: USER, contracts: [C35], types: TYPES, settings: { ...SETTINGS, go_live: "2026-09-10" }, year: 2026, today: "2026-11-25",
    entries: [{ kind: "cp", year: 2026, amount: "12.5" }, { kind: "rtt", year: 2026, amount: 10 }, { kind: "cp", year: 2025, amount: 99 }],
    absences: [abs("cp", "2026-10-26", "2026-10-30"), abs("cp", "2026-12-21", "2026-12-24", "en_attente"), abs("rtt", "2026-11-02", "2026-11-02"), abs("maladie", "2026-11-03", "2026-11-04")] });
  assert.equal(b.cp.entries, 12.5);
  assert.equal(b.cp.accrued, 4.16, "septembre et octobre acquis ; les mois d'avant la mise en service sont dans le solde de départ");
  assert.equal(b.cp.taken, 5); assert.equal(b.cp.waiting, 4);
  assert.equal(b.cp.balance, 11.66); assert.equal(b.cp.available, 7.66);
  assert.equal(b.rtt.rights, 10); assert.equal(b.rtt.taken, 1); assert.equal(b.rtt.balance, 9);
  assert.equal(yearEndCp({ user: USER, contracts: [C35], types: TYPES, settings: { ...SETTINGS, go_live: "2026-09-10" }, year: 2026, entries: [{ kind: "cp", year: 2026, amount: 12.5 }], absences: [] }), 20.82);
});

test("soldes : un salarié arrivé en cours de mois n'acquiert qu'à partir du mois suivant", () => {
  const b = balances({ user: { ...USER, entry_date: "2026-03-10" }, contracts: [C35], types: TYPES, settings: SETTINGS, year: 2026, today: "2026-06-15", entries: [], absences: [] });
  assert.equal(b.cp.accrued, 4.16, "avril et mai");
});

test("vue annuelle : un code par jour", () => {
  const v = yearView({ user: USER, contracts: [C35], types: TYPES, settings: SETTINGS, year: 2026, today: "2026-11-25",
    days: [day("2026-11-02", ["09:00", "17:00"]), day("2026-11-06", ["09:00", "17:00"], "valide", { lieu: "teletravail" })],
    absences: [abs("cp", "2026-11-03", "2026-11-04"), abs("maladie", "2026-11-05", "2026-11-05"), abs("cp", "2026-12-01", "2026-12-01", "en_attente")] });
  const cell = (d) => v.months[+d.slice(5, 7) - 1].cells.find((c) => c.date === d);
  assert.equal(cell("2026-11-02").code, "T"); assert.equal(cell("2026-11-06").code, "TT");
  assert.equal(cell("2026-11-03").code, "CP"); assert.equal(cell("2026-11-05").code, "AM");
  assert.equal(cell("2026-11-11").code, "F"); assert.equal(cell("2026-11-07").code, "");
  assert.equal(cell("2026-11-09").code, "!"); assert.equal(cell("2026-12-01").code, "?"); assert.equal(cell("2026-12-02").code, "");
  assert.equal(v.totals.CP, 2); assert.equal(v.totals.AM, 1); assert.equal(v.months[10].minutes, 870);
  assert.equal(v.months.length, 12); assert.equal(v.months[1].cells.length, 28);
});

test("clôture : photographie du mois et fichier d'export", () => {
  const snap = buildSnapshot({ users: [USER, { id: "u2", login: "paul", name: "Paul Petit", matricule: "", team: "", entry_date: "2026-12-01" }],
    contracts: [C35, { ...C35, user_id: "u2" }], types: TYPES, settings: SETTINGS, month: "2026-11", today: "2026-12-03",
    days: [day("2026-11-02", ["09:00", "12:00", "13:00", "17:00"]), day("2026-11-03", ["09:00", "12:30", "13:30", "17:00"])],
    absences: [abs("cp", "2026-10-29", "2026-11-04"), abs("maladie", "2026-11-30", "2026-12-02"), abs("rtt", "2026-11-20", "2026-11-20", "en_attente")] });
  assert.equal(snap.employees.length, 1, "le salarié entré en décembre n'est pas dans le mois de novembre");
  const e = snap.employees[0];
  assert.equal(e.worked, 840); assert.equal(e.absences.length, 2);
  assert.deepEqual(e.absences.map((a) => [a.type, a.start, a.end, a.days]), [["cp", "2026-11-01", "2026-11-04", 3], ["maladie", "2026-11-30", "2026-11-30", 1]]);
  const text = buildExport(snap, SETTINGS);
  assert.deepEqual(text.trim().split("\r\n"), [
    "Matricule;Code;Valeur;Date début;Date fin",
    "0012;HS-HN;14;01/11/2026;30/11/2026",
    "0012;AB-CP;3;01/11/2026;04/11/2026",
    "0012;AB-MAL;1;30/11/2026;30/11/2026",
  ]);
  assert.equal(buildExport(snap, { export: { include_hours: false, header: false, sep: ",", decimal: "." } }).trim().split("\r\n").length, 2);
});

test("import : séparateurs, guillemets, colonnes reconnues", () => {
  assert.deepEqual(parseTable('a;b\n"x;1";"dit ""oui"""\n\n'), [["a", "b"], ["x;1", 'dit "oui"']]);
  assert.deepEqual(parseTable("a\tb\r\n1\t2"), [["a", "b"], ["1", "2"]]);
  assert.equal(slugLogin("Éloïse", "D'Arc-Petit"), "eloise.darcpetit");
  const p = prepareImport("Nom;Prénom;Matricule;Responsable;Date entrée;Heures hebdo;Jours travaillés;Solde CP;Régime\nMartin;Camille;0012;julien.bernard;01/09/2023;28;lun-jeu;6,5;\nBernard;Julien;0004;;2020-01-15;;;;Forfait jours\nMartin;Camille;0013;;;;;;\n", [{ login: "julien.bernard", matricule: "0004" }]);
  assert.deepEqual(p.errors, []);
  assert.equal(p.rows[0].login, "camille.martin"); assert.equal(p.rows[0].entry_date, "2023-09-01");
  assert.deepEqual(p.rows[0].contract.day_minutes, [420, 420, 420, 420, 0, 0, 0]); assert.equal(p.rows[0].cp, 6.5);
  assert.equal(p.rows[1].exists, true); assert.equal(p.rows[1].contract.regime, "forfait_jours");
  assert.equal(p.rows[2].login, "camille.martin2", "homonyme : identifiant numéroté");
  assert.deepEqual(p.rows.map((r) => r.errors.length), [0, 0, 0]);
});

test("import : erreurs signalées ligne par ligne", () => {
  const p = prepareImport("identifiant,nom,matricule,responsable,date_entree,heures_hebdo\na.b,Durand,1,inconnu,31/02/2026,abc\na.b,Petit,1,,,\n,,,,,\n");
  assert.ok(p.rows[0].errors.some((e) => e.includes("responsable")));
  assert.ok(p.rows[0].errors.some((e) => e.includes("date illisible")));
  assert.ok(p.rows[0].errors.some((e) => e.includes("nombre illisible")));
  assert.ok(p.rows[1].errors.some((e) => e.includes("en double")));
  assert.equal(p.rows.length, 2, "ligne vide ignorée");
  assert.ok(prepareImport("prenom\nCamille").errors[0].includes("nom"));
});

test("mot de passe : longueur et mélange exigés", () => {
  assert.equal(passwordIssues("Tulipe-rouge-42", "camille").length, 0);
  assert.equal(passwordIssues("quatre mots au hasard", "camille").length, 0);
  assert.ok(passwordIssues("court1!", "camille").length > 0);
  assert.ok(passwordIssues("uniquementdeslettres", "camille").length > 0);
  assert.ok(passwordIssues("camille-2026!", "camille").length > 0);
  assert.ok(passwordIssues("motdepasse1", "x").length > 0);
});
