// Dates manipulées comme des chaînes « AAAA-MM-JJ » : aucun fuseau horaire n'intervient dans les calculs.
export const pad2 = (n) => String(n).padStart(2, "0");
export const toDate = (s) => new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)));
export const ymd = (d) => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
export const addDays = (s, n) => { const d = toDate(s); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };
export const isoDow = (s) => ((toDate(s).getUTCDay() + 6) % 7) + 1; // 1 = lundi … 7 = dimanche
export const mondayOf = (s) => addDays(s, 1 - isoDow(s));
export const monthOf = (s) => s.slice(0, 7);
export const monthStart = (m) => `${m}-01`;
export const monthEnd = (m) => ymd(new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)));
export const addMonths = (m, n) => ymd(new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1 + n, 1))).slice(0, 7);
export const diffDays = (a, b) => Math.round((toDate(b) - toDate(a)) / 864e5);
export const isYmd = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && ymd(toDate(s)) === s;
export const isMonth = (s) => typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
export const maxDate = (a, b) => (a > b ? a : b);
export const minDate = (a, b) => (a < b ? a : b);
export function eachDay(a, b) { const out = []; for (let d = a; d <= b; d = addDays(d, 1)) out.push(d); return out; }

// Jours fériés français (métropole) : huit dates fixes et trois dates mobiles calées sur Pâques.
const cache = new Map();
export function holidaysFR(year) {
  if (cache.has(year)) return cache.get(year);
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  const easter = `${year}-${pad2(month)}-${pad2(day)}`;
  const out = {
    [`${year}-01-01`]: "Jour de l'an", [addDays(easter, 1)]: "Lundi de Pâques", [`${year}-05-01`]: "Fête du travail",
    [`${year}-05-08`]: "Victoire 1945", [addDays(easter, 39)]: "Ascension", [addDays(easter, 50)]: "Lundi de Pentecôte",
    [`${year}-07-14`]: "Fête nationale", [`${year}-08-15`]: "Assomption", [`${year}-11-01`]: "Toussaint",
    [`${year}-11-11`]: "Armistice 1918", [`${year}-12-25`]: "Noël",
  };
  cache.set(year, out);
  return out;
}
export const holidayName = (s) => holidaysFR(+s.slice(0, 4))[s] || "";
