// Anomalies liées à l'horaire : ce que les pointages d'une journée disent par rapport à ce qui était prévu.
// Rien n'est stocké : elles sont recalculées à chaque affichage, et disparaissent dès que la journée est corrigée.
// Elles s'ajoutent aux deux oublis déjà suivis (« depart » : départ non pointé ; « vide » : aucun pointage ni absence).
const toMin = (hm) => +hm.slice(0, 2) * 60 + +hm.slice(3, 5);
const hm = (t) => { const h = +t.slice(0, 2), m = t.slice(3, 5); return `${h % 24} h ${m}`; };
const dur = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}` : `${m} min`);

export const ANOMALY_KINDS = {
  depart: "Départ non pointé", vide: "Aucun pointage ni absence",
  retard: "Retard", depart_anticipe: "Départ anticipé", hors_plage: "Pointage hors de l'horaire prévu", presence_insuffisante: "Temps de présence insuffisant",
  travail_absence: "Travail pendant une absence", pause_courte: "Pause trop courte", pause_longue: "Pause trop longue", pause_non_prise: "Pause non prise",
};
// Niveaux : « corriger » (à corriger absolument), « verifier » (à corriger éventuellement), « info » (pour information), « off » (non signalé).
const DEFAULTS = {
  late_min: 5, early_min: 5, range_min: 60, short_min: 15, break_min: 20, break_max: 120,
  levels: { retard: "info", depart_anticipe: "info", hors_plage: "corriger", presence_insuffisante: "info", travail_absence: "verifier", pause_courte: "info", pause_longue: "info", pause_non_prise: "info" },
};
export function anomalySettings(settings) {
  const a = settings?.anomalies || {};
  return { ...DEFAULTS, ...a, levels: { ...DEFAULTS.levels, ...(a.levels || {}) } };
}
export const levelOf = (kind, settings) => (kind === "depart" || kind === "vide" ? "corriger" : anomalySettings(settings).levels[kind] || "info");

// Minutes de pause pointée : les intervalles entre un départ et l'arrivée suivante.
export function breakMinutes(times) {
  let total = 0;
  for (let i = 1; i + 1 < times.length; i += 2) total += Math.max(0, toMin(times[i + 1]) - toMin(times[i]));
  return total;
}

/**
 * Anomalies d'une journée pointée. Les contrôles d'horaire (retard, départ anticipé, hors plage, durée, pauses) ne valent que pour
 * un salarié à l'horaire, un jour prévu, sans absence ce jour-là ; le travail pendant une absence vaut pour tous.
 */
export function daySignals({ times, complete, worked, theo, plan, abs, hourly, workday, counted, raw, settings }) {
  const out = [];
  if (!times.length) return out;
  if (abs && !abs.half) { out.push({ kind: "travail_absence", text: `Pointage un jour d'absence (${abs.label})` }); return out; }
  if (!hourly || !workday || abs) return out;
  const a = anomalySettings(settings), first = times[0], last = complete ? times[times.length - 1] : null;
  const ranges = plan?.ranges || [];
  if (ranges.length) {
    const start = ranges[0][0], end = ranges[ranges.length - 1][1];
    const late = toMin(first) - toMin(start), early = last ? toMin(end) - toMin(last) : 0;
    if (-late > a.range_min) out.push({ kind: "hors_plage", text: `Arrivée à ${hm(first)}, ${dur(-late)} avant l'horaire (${hm(start)})` });
    else if (late > a.late_min) out.push({ kind: "retard", text: `Arrivée à ${hm(first)} pour ${hm(start)} : ${dur(late)} de retard`, minutes: late });
    if (last && -early > a.range_min) out.push({ kind: "hors_plage", text: `Départ à ${hm(last)}, ${dur(-early)} après l'horaire (${hm(end)})` });
    else if (last && early > a.early_min) out.push({ kind: "depart_anticipe", text: `Départ à ${hm(last)} pour ${hm(end)} : ${dur(early)} plus tôt`, minutes: early });
  }
  if (complete && counted && theo - worked > a.short_min) out.push({ kind: "presence_insuffisante", text: `${dur(worked)} travaillées pour ${dur(theo)} prévues`, minutes: theo - worked });
  if (complete) {
    const pause = breakMinutes(times), seuil = settings?.pause_threshold_min ?? 360;
    if (times.length === 2 && raw > seuil) out.push({ kind: "pause_non_prise", text: `Journée de ${dur(raw)} d'un seul tenant, sans pause pointée` });
    else if (times.length >= 4 && raw > seuil && pause < a.break_min) out.push({ kind: "pause_courte", text: `Pause de ${dur(pause)} (minimum ${dur(a.break_min)})`, minutes: pause });
    if (times.length >= 4 && pause > a.break_max) out.push({ kind: "pause_longue", text: `Pause de ${dur(pause)} (maximum ${dur(a.break_max)})`, minutes: pause });
  }
  return out;
}
