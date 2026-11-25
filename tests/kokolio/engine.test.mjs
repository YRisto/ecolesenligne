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

// ---------------------------------------------------------------- début de suivi propre au compte
test("début de suivi propre au compte : rien n'est attendu avant, et il ne peut que retarder", () => {
  const semaine = { from: "2026-11-02", to: "2026-11-08", settings: SETTINGS };
  const tard = { ...USER, tracked_from: "2026-11-05" };
  const recs = run({ user: tard });
  // lundi 2 au mercredi 4 : hors suivi, ni heures prévues ni oubli ; jeudi 5 et vendredi 6 : journées sans pointage
  assert.deepEqual(recs.map((r) => [r.date.slice(8), r.inWindow, r.theo, r.anomalies.join()]),
    [["02", false, 0, ""], ["03", false, 0, ""], ["04", false, 0, ""], ["05", true, 420, "vide"], ["06", true, 420, "vide"], ["07", true, 0, ""], ["08", true, 0, ""]]);
  const s = summarize(recs, semaine);
  assert.deepEqual([s.theo, s.theo_days, s.anomalies.map((a) => a.date).join()], [840, 2, "2026-11-05,2026-11-06"]);
  // sans début de suivi propre, la semaine entière est attendue
  assert.equal(summarize(run({}), semaine).theo, 2100);
  // un début de suivi antérieur à la mise en service ne l'avance pas
  const tot = buildDays({ user: { ...USER, tracked_from: "2025-06-01" }, contracts: [C35], days: [], absences: [], types: TYPES, settings: SETTINGS, from: "2025-12-29", to: "2026-01-04", today: "2026-11-25" });
  assert.deepEqual(tot.map((r) => r.inWindow), [false, false, false, true, true, true, true]);
  // congés : pas d'acquisition pour les mois terminés avant le début de suivi
  const acquis = (u) => balances({ user: u, contracts: [C35], entries: [], absences: [], types: TYPES, settings: SETTINGS, year: 2026, today: "2026-11-25" }).cp.accrued;
  assert.equal(acquis(USER), 20.8);
  assert.equal(acquis({ ...USER, tracked_from: "2026-09-10" }), 4.16);    // septembre et octobre
  assert.equal(acquis({ ...USER, tracked_from: "2026-11-25" }), 0);
  // clôture et export : absent des mois antérieurs à son suivi, présent ensuite
  const photo = (month) => buildSnapshot({ users: [USER, { ...USER, id: "u2", login: "essai", name: "Compte Essai", matricule: "9001", tracked_from: "2026-11-25" }],
    contracts: [C35, { ...C35, user_id: "u2" }], days: [], absences: [], types: TYPES, settings: SETTINGS, month, today: "2026-12-10" });
  assert.deepEqual(photo("2026-10").employees.map((e) => e.login), ["camille"]);
  assert.deepEqual(photo("2026-11").employees.map((e) => [e.login, e.empty_days.length]), [["camille", 20], ["essai", 4]]);
});

// ---------------------------------------------------------------- données de démonstration
import { buildDemo } from "../../lib/kokolio/engine/demo.mjs";
import { holidayName as ferie, isoDow as jourIso } from "../../lib/kokolio/engine/dates.mjs";

test("données de démonstration : cohérentes quelle que soit la date de chargement", () => {
  for (const today of ["2026-11-25", "2026-12-03", "2027-01-05", "2027-03-01", "2027-05-12", "2027-08-17"]) {
    const d = buildDemo(today), par = Object.fromEntries(d.users.map((u) => [u.login, u]));
    assert.equal(d.users.length, 6);
    assert.equal(d.go_live.slice(8), "01"); assert.ok(d.go_live < today); assert.equal(d.close_month, d.go_live.slice(0, 7));
    assert.deepEqual(d, buildDemo(today), "même date, mêmes données");
    const vus = new Set();
    for (const j of d.days) {
      const u = par[j.login], cle = `${j.login}|${j.day}`;
      assert.ok(!vus.has(cle), `journée en double ${cle}`); vus.add(cle);
      assert.ok(j.day >= d.go_live && j.day < today, `${cle} hors période`);
      assert.ok(u.contract.work_days.includes(jourIso(j.day)) && !ferie(j.day), `${cle} n'est pas un jour travaillé`);
      assert.ok(j.times.length >= 1 && j.times.every((t, i) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t) && (i === 0 || t >= j.times[i - 1])), `${cle} heures ${j.times}`);
      assert.ok(!d.absences.some((a) => a.login === j.login && a.status === "valide" && !a.half && a.start <= j.day && a.end >= j.day), `${cle} pointé pendant une absence`);
    }
    for (const a of d.absences) { assert.ok(a.days_count > 0 && a.end >= a.start && par[a.login]); if (a.status === "en_attente") assert.ok(a.start > today); else assert.ok(a.end < today); }
    // de quoi montrer chaque écran : validations en attente, refus, correction, oublis, demandes à venir
    assert.ok(d.days.some((j) => j.status === "a_valider") && d.days.some((j) => j.status === "valide") && d.days.some((j) => j.status === "refuse"));
    assert.ok(d.days.some((j) => j.corrected) && d.days.some((j) => j.times.length % 2 === 1));
    assert.ok(d.absences.filter((a) => a.status === "en_attente").length >= 2 && d.absences.some((a) => a.status === "refuse") && d.absences.some((a) => a.half));
    assert.ok(d.days.filter((j) => j.day.startsWith(d.close_month)).every((j) => j.status === "valide"), "le premier mois doit pouvoir être clôturé");
  }
});

// ---------------------------------------------------------------- version 2.0 : planification
import { planAt, planMap, rangesText, weeklyMinutesOf, cycleWeek } from "../../lib/kokolio/engine/plan.mjs";
import { isWorkday, liveDay, weeklyMinutes } from "../../lib/kokolio/engine/model.mjs";
import { DEMO_CYCLES, DEMO_MODELS, DEMO_USERS } from "../../lib/kokolio/engine/demo.mjs";

const J8 = { code: "J8", label: "Journée 8 h", minutes: 480, ranges: [["08:45", "13:15"], ["14:00", "17:30"]], color: "violet" };
const M4 = { code: "M4", label: "Matinée 4 h", minutes: 240, ranges: [["09:00", "13:00"]], color: "" };
// cycle de deux semaines : quatre jours de 8 h, puis cinq jours dont un vendredi matin
const CYCLE = { id: "k1", name: "Alternance", weeks: [[J8, J8, J8, J8, null, null, null], [J8, J8, J8, J8, M4, null, null]] };
const CCYC = { ...C35, id: "c-cyc", cycle_id: "k1", cycle_anchor: "2026-11-02", cycle: CYCLE, presence: "pointage" };
const exc = (d, minutes, extra = {}) => ({ user_id: "u1", day: d, model_code: "", label: minutes ? "Horaire du jour" : "Repos", minutes, ranges: [], note: "", ...extra });

test("cycle de plusieurs semaines : il se répète à partir du lundi d'ancrage, avant comme après", () => {
  const prevu = (from, to) => buildDays({ user: USER, contracts: [CCYC], days: [], absences: [], types: TYPES, settings: SETTINGS, from, to, today: "2026-12-31" }).map((r) => r.theo);
  assert.deepEqual(prevu("2026-11-02", "2026-11-08"), [480, 480, 480, 480, 0, 0, 0]);            // semaine 1
  assert.deepEqual(prevu("2026-11-09", "2026-11-15"), [480, 480, 0, 480, 240, 0, 0]);            // semaine 2 (mercredi 11 : férié)
  assert.deepEqual(prevu("2026-11-16", "2026-11-22"), [480, 480, 480, 480, 0, 0, 0]);            // de nouveau la semaine 1
  assert.deepEqual(prevu("2026-10-26", "2026-11-01"), [480, 480, 480, 480, 240, 0, 0]);          // avant l'ancrage : semaine 2
  assert.equal(cycleWeek(CCYC, "2026-11-04"), 0); assert.equal(cycleWeek(CCYC, "2026-11-15"), 1); assert.equal(cycleWeek(CCYC, "2025-11-03"), 0);
  // durée hebdomadaire affichée : la moyenne des semaines du cycle (32 h et 36 h → 34 h)
  assert.equal(weeklyMinutesOf(CCYC), 2040); assert.equal(weeklyMinutes(CCYC), 2040); assert.equal(weeklyMinutes(C35), 2100);
  // le prévu d'un jour : horaire nommé, plages, origine
  const p = planAt(CCYC, "2026-11-13", planMap([]));
  assert.deepEqual([p.scheduled, p.code, p.minutes, p.source, rangesText(p.ranges)], [true, "M4", 240, "cycle", "9 h – 13 h"]);
  assert.equal(rangesText(J8.ranges), "8 h 45 – 13 h 15 · 14 h – 17 h 30");
  assert.equal(rangesText([["21:00", "29:00"]]), "21 h – 5 h (+1)");
  // débit-crédit : 8 h pointées un lundi du cycle = à l'équilibre ; avec l'horaire fixe de 7 h, une heure de plus
  const jour = [day("2026-11-02", ["08:45", "13:15", "14:00", "17:30"])];
  assert.equal(buildDays({ user: USER, contracts: [CCYC], days: jour, absences: [], types: TYPES, settings: SETTINGS, from: "2026-11-02", to: "2026-11-02", today: "2026-11-25" })[0].ecart, 0);
  assert.equal(run({ days: jour })[0].ecart, 60);
});

test("un contrat qui suit un cycle ne se calcule pas sans ce cycle", () => {
  const sans = { ...CCYC, cycle: null };
  assert.throws(() => buildDays({ user: USER, contracts: [sans], days: [], absences: [], types: TYPES, settings: SETTINGS, from: "2026-11-02", to: "2026-11-02", today: "2026-11-25" }), /Cycle de travail non résolu/);
  assert.throws(() => countAbsenceDays({ user: USER, contracts: [sans], start: "2026-11-02", end: "2026-11-03" }), /Cycle de travail non résolu/);
});

test("exception d'un jour : elle remplace le cycle ou l'horaire fixe, et seule elle fait travailler un jour férié", () => {
  const plan = [exc("2026-11-03", 0), exc("2026-11-07", 240, { label: "Salon étudiant", ranges: [["09:00", "13:00"]] }), exc("2026-11-11", 420, { model_code: "J7", label: "Journée 7 h" })];
  const recs = buildDays({ user: USER, contracts: [C35], days: [], absences: [], plan, types: TYPES, settings: SETTINGS, from: "2026-11-02", to: "2026-11-15", today: "2026-11-25" });
  const par = Object.fromEntries(recs.map((r) => [r.date.slice(8), r]));
  assert.deepEqual([par["03"].workday, par["03"].theo, par["03"].anomalies.join(), par["03"].plan.source], [false, 0, "", "exception"]);           // mardi mis au repos
  assert.deepEqual([par["07"].workday, par["07"].theo, par["07"].anomalies.join(), par["07"].plan.label], [true, 240, "vide", "Salon étudiant"]);   // samedi travaillé
  assert.deepEqual([par["11"].holiday, par["11"].workday, par["11"].theo], ["Armistice 1918", true, 420]);                                          // férié travaillé
  assert.deepEqual([par["04"].workday, par["04"].theo, par["04"].plan.source], [true, 420, "contrat"]);
  const s = summarize(recs, { from: "2026-11-02", to: "2026-11-15", settings: SETTINGS });
  assert.equal(s.theo, 420 * 9 + 240);   // dix jours du lundi au vendredi (férié travaillé compris) moins le mardi, plus le samedi matin
  assert.equal(s.theo_days, 10);
  // sans exception, le 11 novembre reste férié : rien de prévu, rien d'attendu
  assert.deepEqual(run({ from: "2026-11-11", to: "2026-11-11" }).map((r) => [r.workday, r.theo]), [[false, 0]]);
  // la même règle vaut pour le décompte des jours travaillés
  assert.equal(isWorkday(USER, [C35], "2026-11-11", plan), true); assert.equal(isWorkday(USER, [C35], "2026-11-11"), false);
  assert.equal(isWorkday(USER, [C35], "2026-11-03", plan), false); assert.equal(isWorkday(USER, [C35], "2026-11-07", plan), true);
  // vue annuelle : le férié travaillé et pointé apparaît travaillé, plus « F »
  const y = yearView({ user: USER, contracts: [C35], days: [day("2026-11-11", ["09:00", "12:30", "13:30", "17:00"])], absences: [], plan, types: TYPES, settings: SETTINGS, year: 2026, today: "2026-11-25" });
  assert.equal(y.months[10].cells.find((c) => c.d === 11).code, "T");
});

test("absences et soldes : le décompte suit le planning (cycle, exceptions)", () => {
  // semaine 1 du cycle (lundi-jeudi) : un congé du lundi au vendredi compte quatre jours ; en semaine 2, cinq — moins le férié du 11
  assert.equal(countAbsenceDays({ user: USER, contracts: [CCYC], start: "2026-11-02", end: "2026-11-06" }), 4);
  assert.equal(countAbsenceDays({ user: USER, contracts: [CCYC], start: "2026-11-09", end: "2026-11-13" }), 4);
  assert.equal(countAbsenceDays({ user: USER, contracts: [CCYC], start: "2026-11-16", end: "2026-11-29" }), 9);
  // une exception « repos » sort le jour du décompte ; un samedi travaillé par exception y entre
  const plan = [exc("2026-11-03", 0), exc("2026-11-07", 240)];
  assert.equal(countAbsenceDays({ user: USER, contracts: [C35], plan, start: "2026-11-02", end: "2026-11-08" }), 5);
  assert.equal(countAbsenceDays({ user: USER, contracts: [C35], start: "2026-11-02", end: "2026-11-08" }), 5);
  assert.equal(countAbsenceDays({ user: USER, contracts: [C35], plan, start: "2026-11-03", end: "2026-11-03" }), 0);
  assert.equal(countAbsenceDays({ user: USER, contracts: [C35], plan, start: "2026-11-07", end: "2026-11-07", half: "matin" }), 0.5);
  const b = (p) => balances({ user: USER, contracts: [C35], entries: [], absences: [abs("cp", "2026-11-02", "2026-11-04")], plan: p, types: TYPES, settings: SETTINGS, year: 2026, today: "2026-11-25" }).cp.taken;
  assert.equal(b([]), 3); assert.equal(b(plan), 2);
  // clôture : mêmes jours décomptés dans la photographie du mois
  const snap = buildSnapshot({ users: [USER], contracts: [C35], days: [], absences: [abs("cp", "2026-11-02", "2026-11-04")], plan, types: TYPES, settings: SETTINGS, month: "2026-11", today: "2026-12-10" });
  assert.equal(snap.employees[0].abs_days, 2); assert.equal(snap.employees[0].absences[0].days, 2);
});

test("présence automatique : les jours prévus sont comptés d'office, sans pointage ni oubli signalé", () => {
  const auto = { ...C35, presence: "automatique" };
  const semaine = { from: "2026-11-02", to: "2026-11-08", settings: SETTINGS };
  const recs = buildDays({ user: USER, contracts: [auto], days: [], absences: [abs("cp", "2026-11-05", "2026-11-05"), abs("rtt", "2026-11-06", "2026-11-06", "valide", "matin")], types: TYPES, settings: SETTINGS, ...semaine, today: "2026-11-25" });
  assert.deepEqual(recs.map((r) => [r.credited, r.worked, r.anomalies.length]), [[true, 420, 0], [true, 420, 0], [true, 420, 0], [false, 0, 0], [true, 210, 0], [false, 0, 0], [false, 0, 0]]);
  const s = summarize(recs, semaine);
  assert.deepEqual([s.worked, s.theo, s.ecart, s.days_worked, s.credited, s.anomalies.length, s.pending], [1470, 1470, 0, 3.5, 3.5, 0, 0]);
  // la journée en cours n'est comptée qu'une fois passée ; une journée réellement pointée garde ses heures
  const auj = buildDays({ user: USER, contracts: [auto], days: [day("2026-11-03", ["09:00", "12:00"])], absences: [], types: TYPES, settings: SETTINGS, from: "2026-11-02", to: "2026-11-04", today: "2026-11-04" });
  assert.deepEqual(auj.map((r) => [r.credited, r.worked]), [[true, 420], [false, 180], [false, 0]]);
  // forfait jours : chaque jour prévu compte pour un jour travaillé, sans heures
  const cadre = { ...C35, regime: "forfait_jours", day_minutes: [0, 0, 0, 0, 0, 0, 0], presence: "automatique" };
  const sf = summarize(buildDays({ user: USER, contracts: [cadre], days: [], absences: [], types: TYPES, settings: SETTINGS, ...semaine, today: "2026-11-25" }), semaine);
  assert.deepEqual([sf.days_worked, sf.worked, sf.anomalies.length], [5, 0, 0]);
  // même salarié en pointage : cinq oublis
  assert.equal(summarize(run({}), semaine).anomalies.length, 5);
  // vue annuelle et clôture
  const y = yearView({ user: USER, contracts: [auto], days: [], absences: [], types: TYPES, settings: SETTINGS, year: 2026, today: "2026-11-25" });
  assert.equal(y.months[10].cells.find((c) => c.d === 2).code, "T");
  const snap = buildSnapshot({ users: [USER], contracts: [auto], days: [], absences: [], types: TYPES, settings: SETTINGS, month: "2026-10", today: "2026-11-25" });
  assert.deepEqual([snap.employees[0].worked, snap.employees[0].days_worked, snap.employees[0].empty_days.length], [22 * 420, 22, 0]);
});

test("journée qui passe minuit : le départ du lendemain s'écrit au-delà de 24 h et reste rattaché à la veille", () => {
  const nuit = { ...SETTINGS, night_until: "06:00" };
  assert.equal(rawMinutes(["21:00", "25:30"]), 270);
  assert.equal(netMinutes(["21:00", "29:00"], C35, nuit), 480 - 45);   // huit heures d'un seul tenant : pause déduite
  assert.equal(liveDay(nuit, "2026-11-04", "01:30"), "2026-11-03"); assert.equal(liveDay(nuit, "2026-11-04", "06:00"), null); assert.equal(liveDay(SETTINGS, "2026-11-04", "01:30"), null);
  // à 1 h 30 le mercredi, la journée de mardi commencée à 21 h est encore en cours : pas d'oubli de départ
  const enCours = { user: USER, contracts: [C35], days: [day("2026-11-03", ["21:00"], "a_valider")], absences: [], types: TYPES, settings: nuit, from: "2026-11-03", to: "2026-11-04" };
  assert.deepEqual(buildDays({ ...enCours, today: "2026-11-04", live: "2026-11-03" })[0].anomalies, []);
  assert.deepEqual(buildDays({ ...enCours, today: "2026-11-04", live: null })[0].anomalies, ["depart"]);
  // une fois le départ pointé (25:30), la journée compte pour la veille ; repos calculé jusqu'à l'arrivée suivante
  const recs = buildDays({ user: USER, contracts: [C35], days: [day("2026-11-03", ["21:00", "25:30"]), day("2026-11-04", ["09:00", "17:00"])], absences: [], types: TYPES, settings: nuit, from: "2026-11-02", to: "2026-11-08", today: "2026-11-25" });
  assert.equal(recs[1].worked, 270); assert.equal(recs[1].counted, true);
  const s = summarize(recs, { from: "2026-11-02", to: "2026-11-08", settings: nuit });
  assert.ok(s.alerts.some((a) => a.kind === "repos" && a.date === "2026-11-04" && /7 h 30/.test(a.text)), JSON.stringify(s.alerts));
});

test("import : début de suivi, mode de présence et cycle de travail", () => {
  const cycles = [{ id: "k35", name: "Semaine 35 h", active: true }, { id: "kold", name: "Ancien cycle", active: false }];
  const p = prepareImport("nom;prenom;debut_suivi;presence;cycle\nDurand;Zoé;01/03/2027;Automatique;semaine 35 h\nMartin;Li;;;\nPetit;Tom;31/02/2027;parfois;Ancien cycle\nRoux;Ana;;pointage;Inconnu", [], cycles);
  assert.deepEqual(p.rows.map((r) => [r.login, r.tracked_from, r.contract.presence || "", r.contract.cycle_id || "", r.errors.length]),
    [["zoe.durand", "2027-03-01", "automatique", "k35", 0], ["li.martin", null, "", "", 0], ["tom.petit", null, "", "", 3], ["ana.roux", null, "", "", 1]]);
  assert.match(p.rows[2].errors.join(" | "), /date illisible.*mode de présence inconnu.*désactivé/);
  assert.match(p.rows[3].errors[0], /introuvable dans la bibliothèque/);
});

test("données de démonstration : la bibliothèque d'exemple reproduit les horaires des salariés fictifs", () => {
  const modeles = new Map(DEMO_MODELS.map((m) => [m.code, m]));
  for (const c of DEMO_CYCLES) for (const w of c.weeks) { assert.equal(w.length, 7); for (const code of w) assert.ok(code === null || modeles.has(code), `${c.name} : ${code}`); }
  const d = buildDemo("2026-11-25");
  assert.equal(d.models.length, 4); assert.equal(d.cycles.length, 3);
  for (const u of DEMO_USERS.filter((x) => x.cycle)) {
    const k = DEMO_CYCLES.find((c) => c.name === u.cycle);
    assert.ok(k, `${u.login} : cycle ${u.cycle}`);
    // chaque jour du cycle vaut l'horaire fixe du salarié : attribuer le cycle ne change aucun chiffre
    assert.deepEqual(k.weeks[0].map((code) => (code ? modeles.get(code).minutes : 0)), u.contract.day_minutes, u.login);
  }
});

// ---------------------------------------------------------------- version 2.1 : annualisation
import { annualFigures, pickPeriod } from "../../lib/kokolio/engine/annual.mjs";
import { diffDays } from "../../lib/kokolio/engine/dates.mjs";

const P26 = { id: "p26", label: "Annualisation 2026", start_date: "2026-11-02", end_date: "2026-11-29" };
// cycle annualisé de deux semaines : 4 × 8 h, puis 4 × 8 h + 4 h (32 h et 36 h)
const CAN = { ...CCYC, cycle: { ...CYCLE, annualise: true } };
const TYPES_AN = [...TYPES.map((t) => ({ ...t, annual: t.code === "cp" ? "retire" : t.code === "maladie" ? "neutre" : "realise" })),
  { code: "formation", label: "Formation", category: "autre", annual: "realise" }];
const annuel = (over) => annualFigures({ user: USER, contracts: [CAN], days: [], absences: [], plan: [], types: TYPES_AN, settings: SETTINGS, period: P26, goal: null, entries: [], today: "2026-11-16", ...over });

test("annualisation : objectif, réalisé, reste à faire, prévision et solde semaine par semaine", () => {
  // quatre semaines : 32 h, 36 h moins le férié du 11 (28 h), 32 h, 36 h → 128 h planifiées
  const vide = annuel({});
  assert.deepEqual([vide.annual, vide.planned, vide.objective, vide.goal_set], [true, 128 * 60, 128 * 60, false]);
  // deux semaines faites : 33 h la première (une heure de plus), 26 h la seconde (deux de moins)
  const jours = [day("2026-11-02", ["08:00", "12:00", "13:00", "18:00"]), day("2026-11-03", ["08:45", "13:15", "14:00", "17:30"]), day("2026-11-04", ["08:45", "13:15", "14:00", "17:30"]), day("2026-11-05", ["08:45", "13:15", "14:00", "17:30"]),
    day("2026-11-09", ["08:45", "13:15", "14:00", "17:30"]), day("2026-11-10", ["08:45", "13:15", "14:00", "17:30"]), day("2026-11-12", ["08:45", "13:15", "14:00", "17:30"]), day("2026-11-13", ["09:00", "11:00"])];
  const f = annuel({ days: jours });
  assert.deepEqual([f.done, f.remaining, f.planned_rest, f.forecast, f.gap, f.balance], [59 * 60, 69 * 60, 68 * 60, 127 * 60, -60, -60]);
  assert.deepEqual(f.weeks.map((w) => [w.week, w.planned, w.done, w.balance, w.cumul, w.counted, w.current]),
    [["2026-11-02", 1920, 1980, 60, 60, true, false], ["2026-11-09", 1680, 1560, -120, -60, true, false], ["2026-11-16", 1920, 0, 0, null, false, true], ["2026-11-23", 2160, 0, 0, null, false, false]]);
  // objectif fixé par les RH et ajustements datés : ils remplacent l'objectif calculé, le reste suit
  const g = annuel({ days: jours, goal: { user_id: "u1", period_id: "p26", minutes: 130 * 60, note: "Prorata" }, entries: [{ period_id: "p26", minutes: -120, day: "2026-11-10", reason: "Heures de délégation" }, { period_id: "autre", minutes: 600 }] });
  assert.deepEqual([g.goal_set, g.base, g.adjustments, g.objective, g.remaining, g.gap, g.entries.length], [true, 7800, -120, 7680, 7680 - 3540, 7620 - 7680, 1]);
});

test("annualisation : chaque motif d'absence retire du temps de l'objectif, le compte comme réalisé, ou le laisse à faire", () => {
  const sem3 = (type) => annuel({ today: "2026-11-01", absences: [abs(type, "2026-11-16", "2026-11-17")] });      // deux jours de 8 h, vus avant le début de la période
  // congé payé (« retire ») : l'objectif baisse de 16 h, plus rien n'est attendu ces jours-là
  const cp = sem3("cp");
  assert.deepEqual([cp.removed, cp.objective, cp.planned_rest, cp.gap, cp.weeks[2].planned], [960, 7680 - 960, 7680 - 960, 0, 960]);
  assert.deepEqual(cp.absences, [{ type: "cp", label: "Congé payé", mode: "retire", minutes: 960 }]);
  // formation (« réalisé ») : l'objectif ne bouge pas, les 16 h compteront comme faites
  const fo = sem3("formation");
  assert.deepEqual([fo.removed, fo.objective, fo.planned_rest, fo.gap, fo.weeks[2].planned], [0, 7680, 7680, 0, 1920]);
  const faite = annuel({ absences: [abs("formation", "2026-11-03", "2026-11-03")] });
  assert.deepEqual([faite.done, faite.weeks[0].done, faite.weeks[0].balance], [480, 480, 480 - 1920]);
  // maladie réglée « neutre » : l'objectif ne bouge pas et le temps n'est pas fait : il manque en fin de période
  const ma = sem3("maladie");
  assert.deepEqual([ma.removed, ma.objective, ma.planned_rest, ma.gap], [0, 7680, 7680 - 960, -960]);
  // demi-journée : la moitié du temps prévu
  assert.equal(annuel({ absences: [abs("cp", "2026-11-16", "2026-11-16", "valide", "matin")] }).removed, 240);
});

test("annualisation : seuls les jours passés sous un cycle annualisé comptent", () => {
  // horaire fixe, ou cycle non annualisé : pas d'annualisation
  assert.equal(annualFigures({ user: USER, contracts: [C35], days: [], absences: [], types: TYPES_AN, settings: SETTINGS, period: P26, today: "2026-11-16" }).annual, false);
  assert.equal(annualFigures({ user: USER, contracts: [CCYC], days: [], absences: [], types: TYPES_AN, settings: SETTINGS, period: P26, today: "2026-11-16" }).annual, false);
  // passage au cycle annualisé le 16 : seules les deux dernières semaines entrent dans le calcul
  const avant = { ...C35, end_date: "2026-11-15" }, apres = { ...CAN, start_date: "2026-11-16", cycle_anchor: "2026-11-16" };
  const f = annualFigures({ user: USER, contracts: [avant, apres], days: [day("2026-11-03", ["09:00", "17:00"])], absences: [], types: TYPES_AN, settings: SETTINGS, period: P26, today: "2026-11-16" });
  assert.deepEqual([f.annual, f.from, f.planned, f.done, f.weeks.length], [true, "2026-11-16", (32 + 36) * 60, 0, 2]);
  // début de suivi propre au salarié : rien avant
  assert.equal(annuel({ user: { ...USER, tracked_from: "2026-11-23" } }).planned, 36 * 60);
  // choix de la période : celle qui contient la date, sinon la dernière commencée, sinon la prochaine
  const ps = [{ id: "a", start_date: "2025-01-01", end_date: "2025-12-31" }, { id: "b", start_date: "2026-04-06", end_date: "2026-12-31" }, { id: "c", start_date: "2027-01-01", end_date: "2027-12-31" }];
  assert.deepEqual([pickPeriod(ps, "2026-11-25").id, pickPeriod(ps, "2026-02-01").id, pickPeriod(ps, "2024-06-01").id, pickPeriod(ps, "2026-11-25", "c").id, pickPeriod([], "2026-11-25")], ["b", "a", "a", "c", null]);
});

test("données de démonstration : une période d'annualisation d'exemple, toujours de moins de treize mois", () => {
  for (const today of ["2026-11-25", "2027-01-05", "2027-03-01", "2027-12-30"]) {
    const d = buildDemo(today);
    assert.ok(d.annual_period.start <= today && d.annual_period.end >= today, today);
    assert.ok(diffDays(d.annual_period.start, d.annual_period.end) <= 366, today);
    assert.ok(d.cycles.some((c) => c.annualise));
  }
});
