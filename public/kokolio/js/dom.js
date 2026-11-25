// Outils d'affichage : construction du DOM sans jamais interpréter de HTML venu des données, formats français, fenêtres.

export function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  let value;
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "value") value = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false) continue;
    e.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  if (value !== undefined) e.value = value; // après les enfants : un <select> a besoin de ses options
  return e;
}
export const vue = () => document.getElementById("vue");
export function pose(...kids) { vue().replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false)); }

/* ---------- formats ---------- */
export const pad = (n) => String(n).padStart(2, "0");
const dateDe = (s) => new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
export const fmtMin = (m) => { m = Math.round(m); return `${Math.floor(m / 60)} h ${pad(m % 60)}`; };
export const fmtEcart = (m) => (m < 0 ? "− " : "+ ") + fmtMin(Math.abs(m));
export const fmtJ = (n) => { const v = Math.round(Number(n) * 100) / 100; return `${String(v).replace(".", ",")} j`; };
export const fmtNb = (n) => String(Math.round(Number(n) * 100) / 100).replace(".", ",");
export const frJour = (s) => dateDe(s).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
export const frJourLong = (s) => dateDe(s).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
export const frCourt = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "");
export const frMois = (m) => dateDe(m + "-01").toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
export const frMoisSeul = (m) => dateDe(m + "-01").toLocaleDateString("fr-FR", { month: "long" });
export const frHorodatage = (iso) => new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
export const plusMois = (m, n) => { const d = new Date(+m.slice(0, 4), +m.slice(5, 7) - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
export const plusJours = (s, n) => { const d = dateDe(s); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const jourSemaine = (s) => (dateDe(s).getDay() + 6) % 7; // 0 = lundi
export const paires = (times) => { const out = []; for (let i = 0; i < times.length; i += 2) out.push(`${times[i]} → ${times[i + 1] || "…"}`); return out.join("  ·  "); };
export const periode = (a, b, half) => (a === b ? frJour(a) + (half ? (half === "matin" ? " (matin)" : " (après-midi)") : "") : `${frJour(a)} → ${frJour(b)}`);
export const classeEcart = (m) => (m > 0 ? "plus" : m < 0 ? "moins" : "");

/* ---------- pictogrammes ---------- */
const ICONES = {
  salarie: "M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
  cadre: "M4 8h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1ZM9 8V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 13h18",
  equipe: "M12 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM5 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM19 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM12 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM12 7v10M5 17v-3h14v3",
  rh: "M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM21 19v-1a4 4 0 0 0-3-3.8M15.5 3.2a3.5 3.5 0 0 1 0 6.6",
  admin: "M10 6h10M10 12h10M10 18h10M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2",
  pointer: "M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
  heures: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  absences: "M12 3v2M12 19v2M5 12H3M21 12h-2M6 6 4.6 4.6M19.4 4.6 18 6M6 18l-1.4 1.4M19.4 19.4 18 18M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  annee: "M4 9h16M8 3v4M16 3v4M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1ZM8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01",
  validation: "M9 12l2 2 4-4M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
  synthese: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  salaries: "M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM21 19v-1a4 4 0 0 0-3-3.8M15.5 3.2a3.5 3.5 0 0 1 0 6.6",
  cloture: "M7 11V8a5 5 0 0 1 10 0v3M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1ZM12 15v2",
  journal: "M6 3h9l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM14 3v5h5M9 13h6M9 17h6",
  reglages: "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M16 4v4M10 10v4M18 16v4",
  motifs: "M4 5h16M4 10h16M4 15h10M4 20h7",
  etat: "M3 12h4l3-8 4 16 3-8h4",
  versions: "M12 3l8 4.5-8 4.5-8-4.5L12 3ZM4 12l8 4.5 8-4.5M4 16.5 12 21l8-4.5",
  compte: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1",
};
export function icone(id) {
  const NS = "http://www.w3.org/2000/svg", s = document.createElementNS(NS, "svg"), p = document.createElementNS(NS, "path");
  s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true"); p.setAttribute("d", ICONES[id] || ICONES.pointer); s.append(p);
  return s;
}

/* ---------- messages, fenêtres ---------- */
let toastT;
export function toast(msg, erreur) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.className = erreur ? "erreur" : ""; t.style.display = "block";
  clearTimeout(toastT); toastT = setTimeout(() => { t.style.display = "none"; }, erreur ? 7000 : 4500);
}
// Exécute une action déclenchée par un bouton : le bouton est neutralisé pendant l'appel, l'erreur est affichée.
export async function agir(btn, fn) {
  if (btn) btn.disabled = true;
  try { await fn(); } catch (e) { if (e?.code !== "session") toast(e?.message || "Une erreur est survenue. Réessayez.", true); }
  finally { if (btn) btn.disabled = false; }
}
/**
 * Fenêtre avec formulaire. surOk peut lever une erreur : elle s'affiche dans la fenêtre, qui reste ouverte.
 * options : large (fenêtre plus large), danger (bouton rouge), fermer (libellé du bouton d'annulation).
 */
export function ouvrir(titre, corps, libelleOk, surOk, options = {}) {
  const dlg = document.getElementById("dlg");
  dlg.className = options.large ? "large" : "";
  const err = h("p", { class: "bandeau refus", hidden: true, role: "alert" });
  const ok = libelleOk ? h("button", { class: options.danger ? "danger" : "principal", type: "submit" }, libelleOk) : null;
  const form = h("form", { method: "dialog", novalidate: true, onsubmit: async (ev) => {
    ev.preventDefault(); if (!ok || ok.disabled) return;
    ok.disabled = true; err.hidden = true;
    try { const garder = await surOk(); if (garder !== false) dlg.close(); }
    catch (e) { if (e?.code === "session") { dlg.close(); return; } err.textContent = e?.message || "Une erreur est survenue."; err.hidden = false; }
    finally { ok.disabled = false; }
  } }, h("h2", null, titre), corps, err,
    h("div", { class: "ligne" }, h("button", { type: "button", onclick: () => dlg.close() }, options.fermer || (ok ? "Annuler" : "Fermer")), ok));
  dlg.replaceChildren(form);
  if (!dlg.open) dlg.showModal();
  dlg.scrollTop = 0;
  return dlg;
}
export const fermer = () => { const d = document.getElementById("dlg"); if (d.open) d.close(); };
// Demande un motif (obligatoire) avant une action.
export function demanderMotif(titre, texte, libelle, fn, options = {}) {
  const motif = h("textarea", { required: true, maxlength: 300, placeholder: options.placeholder || "" });
  ouvrir(titre, [texte ? h("p", null, texte) : null, h("label", null, options.label || "Motif", motif)], libelle, async () => {
    const v = motif.value.trim();
    if (v.length < (options.min || 3)) throw new Error("Indiquez un motif.");
    await fn(v);
  }, { danger: options.danger });
  motif.focus();
}
export function confirmer(titre, texte, libelle, fn, options = {}) {
  ouvrir(titre, (Array.isArray(texte) ? texte : [texte]).map((t) => (typeof t === "string" ? h("p", null, t) : t)), libelle, fn, options);
}

export function pastille(statut) {
  const map = { valide: ["Validé", "p-ok"], a_valider: ["À valider", "p-attente"], en_attente: ["En attente", "p-attente"], refuse: ["Refusé", "p-refus"], annule: ["Annulé", "p-gris"],
    cloture: ["Clôturé", "p-ok"], rouvert: ["Rouvert", "p-attente"], ouvert: ["Ouvert", "p-neutre"] };
  const [txt, cls] = map[statut] || [statut || "—", "p-neutre"];
  return h("span", { class: "pastille " + cls }, txt);
}
export const etiquette = (txt, cls = "p-neutre") => h("span", { class: "pastille " + cls }, txt);
export const tuile = (libelle, valeur, note, cls) => h("div", { class: "tuile" }, h("span", { class: "discret" }, libelle), h("span", { class: "v num " + (cls || "") }, valeur), note ? h("span", { class: "discret" }, note) : null);
export const champ = (libelle, controle, aide) => h("label", null, libelle, controle, aide ? h("small", null, aide) : null);
export const coche = (libelle, attrs) => { const i = h("input", { type: "checkbox", ...attrs }); return [h("label", { class: "coche" }, i, libelle), i]; };
export function listeAlertes(titre, liste, cls, action) {
  if (!liste.length) return null;
  return h("div", { class: "bandeau " + (cls || "") }, h("strong", null, titre),
    liste.map((a) => h("div", { class: action ? "ligne" : "" }, h("span", null, `${frJour(a.date)} : ${a.text}`), action ? action(a) : null)));
}

// Sélecteur de mois : précédent / suivant, bornés.
export function navMois(mois, { min, max, surChange }) {
  return h("div", { class: "mois-nav" },
    h("button", { type: "button", "aria-label": "Mois précédent", disabled: !!(min && mois <= min), onclick: () => surChange(plusMois(mois, -1)) }, "‹"),
    h("strong", null, frMois(mois)),
    h("button", { type: "button", "aria-label": "Mois suivant", disabled: !!(max && mois >= max), onclick: () => surChange(plusMois(mois, 1)) }, "›"));
}

export function telecharger(nom, contenu, mime = "text/csv;charset=utf-8") {
  const blob = contenu instanceof Blob ? contenu : new Blob([contenu], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = h("a", { href: url, download: nom });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export function base64VersBlob(b64, mime) {
  const bin = atob(b64), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
export function logo(url, cls, alt = "") {
  if (!url) return null;
  const i = h("img", { class: cls, src: url, alt, referrerpolicy: "no-referrer" });
  i.addEventListener("error", () => i.remove());
  return i;
}
