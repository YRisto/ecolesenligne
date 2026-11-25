// Soldes de congés payés et de RTT sur l'année civile.
// CP : écritures de l'année (report, ajustements) + acquisition mensuelle − jours pris.
// RTT : droits saisis par les RH − jours pris.
import { monthEnd, monthStart, pad2 } from "./dates.mjs";
import { contractAt, countAbsenceDays, sortContracts, typeMap } from "./model.mjs";

const r2 = (x) => Math.round(x * 100) / 100;

export function balances({ user, contracts, entries, absences, types, settings, year, today }) {
  const sorted = sortContracts(contracts || []);
  const tmap = types instanceof Map ? types : typeMap(types);
  const y = String(year);
  const mine = (entries || []).filter((e) => e.year === +year);
  const sum = (kind) => r2(mine.filter((e) => e.kind === kind).reduce((s, e) => s + Number(e.amount), 0));

  // Un mois terminé rapporte des congés si le salarié était présent tout le mois.
  // Les mois terminés avant la mise en service ne comptent pas : le solde saisi au départ les contient déjà.
  let accrued = 0;
  for (let m = 1; m <= 12; m++) {
    const month = `${y}-${pad2(m)}`, first = monthStart(month), last = monthEnd(month);
    if (last >= today) break;
    if (settings?.go_live && last < settings.go_live) continue;
    if (user?.entry_date && user.entry_date > first) continue;
    if (user?.exit_date && user.exit_date < last) continue;
    const c = contractAt(sorted, last);
    if (c) accrued += Number(c.cp_per_month);
  }
  accrued = r2(accrued);

  const taken = { cp: 0, rtt: 0 }, waiting = { cp: 0, rtt: 0 };
  for (const a of absences || []) {
    const cat = tmap.get(a.type_code)?.category;
    if (cat !== "cp" && cat !== "rtt") continue;
    if (a.status !== "valide" && a.status !== "en_attente") continue;
    const n = countAbsenceDays({ user, contracts: sorted, start: a.start_date, end: a.end_date, half: a.half, clipFrom: `${y}-01-01`, clipTo: `${y}-12-31` });
    if (a.status === "valide") taken[cat] += n; else waiting[cat] += n;
  }
  const cpEntries = sum("cp"), rttRights = sum("rtt");
  return {
    year: +year,
    cp: { entries: cpEntries, accrued, taken: taken.cp, waiting: waiting.cp, balance: r2(cpEntries + accrued - taken.cp), available: r2(cpEntries + accrued - taken.cp - waiting.cp) },
    rtt: { rights: rttRights, taken: taken.rtt, waiting: waiting.rtt, balance: r2(rttRights - taken.rtt), available: r2(rttRights - taken.rtt - waiting.rtt) },
  };
}

// Solde de CP restant en fin d'année, toutes acquisitions comprises : sert au report sur l'année suivante.
export function yearEndCp({ user, contracts, entries, absences, types, settings, year }) {
  return balances({ user, contracts, entries, absences, types, settings, year, today: `${+year + 1}-01-01` }).cp.balance;
}
