// Mon espace : pointer, mes heures, mes absences, mon année. Les fenêtres de correction et de demande d'absence
// servent aussi aux RH quand ils agissent pour un salarié (userId renseigné).
import { api } from "./api.js";
import { carteOrganigramme } from "./organigramme.js";
import { h, pose, toast, agir, ouvrir, pastille, etiquette, tuile, champ, listeAlertes, navMois, telecharger, base64VersBlob, pad,
  fmtMin, fmtEcart, fmtJ, fmtCourt, frJour, frJourLong, frMois, frMoisSeul, paires, hmAff, periode, classeEcart, jourSemaine } from "./dom.js";
import { S, ecran, aller, recharger, calerHorloge, heureServeur, minutesServeur, moisCourant } from "./etat.js";
import { sousAnnee } from "./annuel.js";

const lieuLib = (code) => S.boot.settings.lieux.find((l) => l.code === code)?.label || code || "";
const memo = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* stockage indisponible */ } } };
const dateServeur = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date(Date.now() + S.decalage));

/* ================= Pointer ================= */
export function vuePointer() { ecran(() => api("my/today"), rendrePointer); }

function rendrePointer(t) {
  calerHorloge(t.now);
  clearInterval(S.minuteur);
  const cadre = t.regime === "forfait_jours", present = !!t.open_since, jour = t.day, lieux = S.boot.settings.lieux, auto = t.presence === "automatique";
  // travail de nuit : la journée « en cours » peut être celle de la veille, tant que son départ n'est pas pointé
  const jourDate = t.day_date || t.today;
  const verrou = t.closed ? "Le mois est clôturé : le pointage est fermé." : jour?.status === "valide" ? "Cette journée est déjà validée." : "";
  const lieu = h("select", { value: jour?.lieu || memo.get("kk-lieu") || lieux[0].code, "aria-label": "Lieu de travail", onchange: (ev) => {
    memo.set("kk-lieu", ev.target.value);
    if (jour && !verrou) agir(ev.target, async () => { await api("my/lieu", { day: jourDate, lieu: ev.target.value }); toast(`Lieu enregistré : ${lieuLib(ev.target.value)}`); });
  } }, lieux.map((l) => h("option", { value: l.code }, l.label)));
  if (![...lieu.options].some((o) => o.selected && o.value === lieu.value)) lieu.selectedIndex = 0;
  const horloge = h("div", { class: "horloge num" }, heureServeur());
  const vivant = h("span", { class: "v num" });
  const libelle = present ? "Pointer mon départ" : jour?.times.length ? "Pointer mon retour" : "Pointer mon arrivée";
  const bouton = h("button", { class: "geant", disabled: !!verrou, onclick: (ev) => agir(ev.currentTarget, async () => {
    const r = await api("my/punch", { lieu: lieu.value });
    memo.set("kk-lieu", lieu.value);
    rendrePointer(r);
    toast(r.punched.duplicate ? "Pointage déjà enregistré il y a un instant." : r.punched.kind === "arrivee" ? `Arrivée enregistrée à ${r.punched.hm}` : `Départ enregistré à ${r.punched.hm}`);
  }) }, libelle);
  const etat = present ? h("span", { class: "etat on" }, t.night ? `En poste depuis hier ${t.open_since}` : `Présent depuis ${t.open_since}`)
    : auto ? h("span", { class: "etat on" }, "Présence automatique")
    : h("span", { class: "etat" }, jour?.times.length ? `Dernier départ à ${hmAff(jour.times[jour.times.length - 1])}` : "Pas encore pointé aujourd'hui");

  const tic = () => {
    if (dateServeur() !== t.today) { clearInterval(S.minuteur); return vuePointer(); } // minuit est passé
    horloge.textContent = heureServeur();
    const depuis = present ? +t.open_since.slice(0, 2) * 60 + +t.open_since.slice(3) : 0;
    const enCours = present ? Math.max(0, minutesServeur() + (t.night ? 1440 : 0) - depuis) : 0;
    // présence automatique : la journée prévue est annoncée, elle sera comptée une fois passée
    if (cadre) vivant.textContent = jour?.times.length ? "Pointée" : auto && t.plan && !(t.absence && !t.absence.half) ? "Prévue" : "—";
    else vivant.textContent = auto && !jour ? (t.theo ? fmtMin(t.theo) : "—") : fmtMin(t.worked + enCours);
  };
  tic(); S.minuteur = setInterval(tic, 1000);

  const infos = [];
  if (t.holiday && !t.plan) infos.push(h("p", { class: "bandeau info" }, `Aujourd'hui est férié : ${t.holiday}.`));
  if (t.absence) infos.push(h("p", { class: "bandeau info" }, `Absence enregistrée aujourd'hui : ${t.absence.label}${t.absence.half ? (t.absence.half === "matin" ? " (matin)" : " (après-midi)") : ""}.`));
  if (jour?.status === "refuse") infos.push(h("div", { class: "bandeau refus" }, h("strong", null, "Journée refusée par votre responsable"), jour.refusal_reason,
    h("div", { class: "ligne" }, h("button", { class: "petit", onclick: () => dialogueCorrection({ jour }) }, "Corriger"))));
  // ce que le planning prévoit aujourd'hui, quand il dit plus qu'une durée : horaire nommé, plages, modification du responsable
  const prevu = t.plan && (t.plan.code || t.plan.ranges || t.plan.exception)
    ? h("div", { class: "prevu" }, h("strong", null, `Prévu ${t.night ? "pour cette journée" : "aujourd'hui"} : ${[t.plan.label, cadre ? null : fmtMin(t.plan.minutes)].filter(Boolean).join(" · ")}`),
      t.plan.ranges ? h("span", null, t.plan.ranges) : null, t.plan.exception ? h("span", null, `Modifié par votre responsable${t.plan.note ? ` : ${t.plan.note}` : ""}`) : null) : null;

  pose(h("section", { class: "hero" },
      h("p", { class: "eyebrow" }, frJourLong(t.today)), horloge, etat,
      auto ? h("p", null, "Vous ne pointez pas : vos journées prévues sont comptées d'office. Déclarez seulement vos absences.") : bouton,
      auto ? h("button", { class: "geant", onclick: () => aller("#/moi/absences") }, "Demander une absence") : null,
      prevu,
      verrou && !auto ? h("p", { class: "discret" }, verrou) : null,
      auto ? null : h("label", null, "Lieu", lieu),
      auto ? null : h("p", { class: "discret" }, "L'heure enregistrée est celle du serveur, pas celle de votre appareil.")),
    infos,
    listeAlertes("À régulariser", t.anomalies, "", (a) => h("button", { class: "petit", onclick: (ev) => agir(ev.currentTarget, () => corrigerDate(a.date)) }, "Corriger")),
    listeAlertes("Durée du travail : points d'attention", t.alerts, "refus"),
    h("div", { class: "tuiles" },
      h("div", { class: "tuile" }, h("span", { class: "discret" }, t.night ? "Journée en cours" : "Aujourd'hui"), vivant,
        h("span", { class: "discret" }, cadre ? "forfait jours" : (t.theo ? (auto && !jour ? "prévues, comptées d'office" : `sur ${fmtMin(t.theo)} prévues`) : "jour non travaillé") + (t.pause ? ` · pause de ${t.pause} min déduite` : ""))),
      cadre ? tuile(`Jours travaillés en ${t.today.slice(0, 4)}`, `${fmtJours(t.forfait?.days ?? 0)} / ${t.forfait?.target ?? t.forfait_days}`, "forfait annuel")
        : tuile("Cette semaine", fmtEcart(t.week.ecart), `${fmtMin(t.week.worked)} sur ${fmtMin(t.week.theo)}`, classeEcart(t.week.ecart)),
      cadre ? tuile(frMoisSeul(t.month), `${fmtJours(t.month_sum.days_worked)} j`, auto ? "journées comptées" : "journées pointées")
        : tuile(frMoisSeul(t.month), fmtEcart(t.month_sum.ecart), `${fmtMin(t.month_sum.worked)} sur ${fmtMin(t.month_sum.theo)}`, classeEcart(t.month_sum.ecart))),
    jour ? h("div", { class: "carte" }, h("h3", null, t.night ? `Pointages du ${frJour(jourDate)}` : "Pointages du jour"),
      h("div", { class: "ligne" }, h("span", { class: "num" }, paires(jour.times) || "—"), pastille(jour.status)),
      h("div", { class: "ligne" }, h("span", null, lieuLib(jour.lieu) + (jour.corrected ? " · journée corrigée" : "")),
        verrou ? null : h("button", { class: "petit", onclick: () => dialogueCorrection({ jour }) }, "Corriger"))) : null,
    t.upcoming?.length ? h("div", { class: "carte" }, h("h3", null, "Mon planning"),
      t.cycle ? h("p", { class: "discret" }, `Cycle « ${t.cycle} »`) : null,
      h("div", { class: "agenda" }, t.upcoming.map((j) => [
        h("strong", { class: j.off ? "off" : "" }, frJour(j.date)),
        h("span", { class: j.off ? "off" : "" }, (j.absence || (j.off ? (j.holiday ? `Férié : ${j.holiday}` : "Repos") : j.label || "Jour travaillé")) + (j.exception && !j.absence ? " · modifié" : ""),
          !j.off && !j.absence && j.ranges ? h("small", null, j.ranges) : null, j.note && !j.absence ? h("small", null, j.note) : null),
        h("span", { class: "num " + (j.off ? "off" : "") }, j.off || cadre ? "" : fmtCourt(j.minutes))])),
      h("p", { class: "discret" }, "Les quatorze jours à venir. Votre responsable peut modifier un jour : il apparaît alors « modifié ».")) : null,
    carteOrganigramme({ complet: false }));
}
const fmtJours = (n) => String(Math.round(Number(n) * 10) / 10).replace(".", ",");

// Ouvre la correction d'une date : la journée existante est rechargée pour partir des heures déjà enregistrées.
export async function corrigerDate(date, userId) {
  const mois = date.slice(0, 7);
  const d = userId ? await api("team/employee", { user_id: userId, month: mois }) : await api("my/month", { month: mois });
  const jour = d.days.find((x) => x.date === date && x.id) || null;
  dialogueCorrection({ jour, date, userId, nom: userId ? d.user?.name : "" });
}

/* ================= Correction d'une journée ================= */
export function dialogueCorrection({ jour, date, userId, nom }) {
  const today = S.boot.today, fixe = jour?.date || date || "";
  // pour soi : pas avant le premier jour suivi de son compte ; pour un autre (responsable, RH) : pas avant la mise en service
  const quand = fixe ? null : h("input", { type: "date", max: today, min: (!userId && S.boot.me.since) || S.boot.settings.go_live || "", required: true });
  const lignes = h("div", { class: "pile" });
  // Travail de nuit activé : un départ peut tomber le lendemain. Il est enregistré au-delà de 24 h (01:30 le lendemain = « 25:30 »).
  const nuit = S.boot.settings.night_until || "";
  const ajoute = (a = "", b = "") => {
    const demain = b >= "24:00";
    const row = h("div", { class: "heures-edit" }, h("input", { type: "time", value: a, "aria-label": "Arrivée" }), h("span", null, "→"),
      h("input", { type: "time", value: demain ? `${pad(+b.slice(0, 2) - 24)}${b.slice(2)}` : b, "aria-label": "Départ" }),
      h("button", { type: "button", "aria-label": "Retirer cette plage", onclick: () => { row.remove(); if (!lignes.children.length) ajoute(); } }, "×"),
      nuit || demain ? h("label", { class: "coche lendemain" }, h("input", { type: "checkbox", checked: demain }), "départ le lendemain") : null);
    lignes.append(row);
  };
  const times = jour?.times || [];
  if (times.length) for (let i = 0; i < times.length; i += 2) ajoute(times[i], times[i + 1] || ""); else ajoute();
  const lieux = S.boot.settings.lieux;
  const lieu = h("select", { value: jour?.lieu || lieux[0].code }, lieux.map((l) => h("option", { value: l.code }, l.label)));
  const motif = h("textarea", { required: true, maxlength: 500, placeholder: "Exemple : départ non pointé, badge oublié…" });
  ouvrir(fixe ? `${jour ? "Corriger" : "Renseigner"} le ${frJour(fixe)}` : "Ajouter une journée oubliée", [
    nom ? h("p", { class: "bandeau info" }, `Correction saisie pour ${nom} : elle sera tracée à votre nom.`) : null,
    quand ? champ("Jour", quand) : null,
    h("div", { class: "pile" }, h("span", { class: "eyebrow" }, "Heures d'arrivée et de départ"), lignes,
      h("button", { type: "button", class: "lien", onclick: () => ajoute() }, "Ajouter une plage (retour de pause)")),
    champ("Lieu", lieu), champ("Motif de la correction", motif),
    h("p", { class: "discret" }, userId ? "La journée repasse en validation." : "La journée sera soumise à votre responsable pour validation."),
  ], "Enregistrer", async () => {
    const day = fixe || quand.value;
    if (!day) throw new Error("Choisissez le jour.");
    const out = [];
    for (const row of lignes.children) {
      const [a, fin] = [...row.querySelectorAll("input[type=time]")].map((i) => i.value);
      const b = fin && row.querySelector("input[type=checkbox]")?.checked ? `${pad(+fin.slice(0, 2) + 24)}${fin.slice(2)}` : fin;
      if (!a && !b) continue;
      if (!a) throw new Error("Une plage a un départ sans arrivée.");
      // une journée de nuit commencée la veille peut rester ouverte : le serveur vérifie qu'elle est bien encore en cours
      if (!b && day !== today && !nuit) throw new Error("Chaque arrivée doit avoir son départ.");
      out.push(a); if (b) out.push(b);
    }
    for (let i = 1; i < out.length; i++) if (out[i] < out[i - 1]) throw new Error("Les heures doivent se suivre dans l'ordre.");
    if (motif.value.trim().length < 3) throw new Error("Indiquez le motif de la correction.");
    const body = { day, times: out, lieu: lieu.value, comment: motif.value.trim() };
    if (jour?.version) body.version = jour.version;
    if (userId) body.user_id = userId;
    await api("my/correct", body);
    toast("Correction enregistrée : la journée est en attente de validation.");
    S.compterAttente?.(); recharger();
  });
}

/* ================= Liste des jours d'un mois (réutilisée dans la fiche d'équipe) ================= */
export function blocJour(j, { cadre, actions, notes }) {
  const quoi = j.times.length ? paires(j.times) : j.credited ? "Présence automatique" : j.absence || (j.holiday ? `Férié : ${j.holiday}` : j.absence_pending ? `${j.absence_pending} (demande en attente)` : j.anomalies.includes("vide") ? "Aucun pointage ni absence" : "—");
  const droite = j.times.length || j.credited ? (cadre ? "Journée" : fmtMin(j.worked)) : "";
  const creux = !j.times.length && !j.anomalies.length && !j.credited;
  return h("div", { class: "jour" + (creux ? " creux" : "") },
    h("div", null, h("strong", null, frJour(j.date)), " ", h("span", { class: "num" }, quoi)),
    h("div", { class: "num" }, droite),
    h("div", { class: "note discret" },
      [j.times.length ? lieuLib(j.lieu) : null,
        (j.times.length || j.credited) && j.absence ? j.absence : null,
        j.plan ? `prévu : ${[j.plan.code || j.plan.label, cadre ? null : fmtCourt(j.plan.minutes), j.plan.ranges, j.plan.exception ? "modifié par le responsable" : null].filter(Boolean).join(" · ")}` : null,
        !cadre && j.counted && !j.credited && (j.times.length || j.theo) ? `écart ${fmtEcart(j.ecart)}` : null,
        j.pause ? `pause de ${j.pause} min déduite` : null,
        j.open && j.anomalies.includes("depart") ? "départ non pointé" : null].filter(Boolean).join(" · ")),
    j.corrected && j.comment ? h("div", { class: "note discret" }, `Corrigée : ${j.comment}`) : null,
    j.status === "refuse" ? h("div", { class: "note moins" }, `Refusée : ${j.refusal_reason}`) : null,
    j.signals?.length ? h("div", { class: "note " + (j.signals.some((s) => s.level !== "info") ? "moins" : "discret") }, j.signals.map((s) => s.text).join(" · ")) : null,
    notes ? notes(j) : null,
    h("div", { class: "actions" }, j.status ? pastille(j.status) : j.credited ? etiquette("Comptée d'office", "p-ok") : j.anomalies.length ? etiquette("À régulariser", "p-refus") : null, actions ? actions(j) : null));
}

export function vueHeures(mois) {
  const m = /^\d{4}-\d{2}$/.test(mois) ? mois : moisCourant();
  ecran(() => api("my/month", { month: m }), (d) => {
    const cadre = d.regime === "forfait_jours", s = d.summary;
    pose(h("div", { class: "ligne" }, h("h2", null, "Mes heures"), navMois(m, { min: (d.go_live || "").slice(0, 7), max: moisCourant(), surChange: (x) => aller(`#/moi/heures/${x}`) })),
      d.closed ? h("p", { class: "bandeau info" }, "Ce mois est clôturé : il n'est plus modifiable. Pour une erreur, adressez-vous au service RH.") : null,
      h("div", { class: "tuiles" },
        cadre ? tuile("Jours travaillés", `${fmtJours(s.days_worked)} j`, d.presence === "automatique" ? "journées comptées d'office" : "journées pointées") : tuile("Travaillé", fmtMin(s.worked), `${fmtJours(s.days_worked)} journée${s.days_worked > 1 ? "s" : ""}`),
        cadre ? null : tuile("Prévu à ce jour", fmtMin(s.theo), d.cycle ? `cycle « ${d.cycle} »` : "selon votre horaire"),
        cadre ? null : tuile("Écart", fmtEcart(s.ecart), "débit-crédit du mois", classeEcart(s.ecart)),
        tuile("Validation", `${s.validated} / ${s.validated + s.pending + s.refused}`, s.refused ? `${s.refused} refusée${s.refused > 1 ? "s" : ""}` : "journées validées")),
      listeAlertes("À régulariser", d.anomalies, "", d.closed ? null : (a) => h("button", { class: "petit", onclick: () => dialogueCorrection({ jour: d.days.find((x) => x.date === a.date && x.id), date: a.date }) }, "Corriger")),
      listeAlertes("Durée du travail : points d'attention", d.alerts, "refus"),
      d.closed ? null : h("div", { class: "ligne gauche" }, h("button", { onclick: () => dialogueCorrection({}) }, "Ajouter une journée oubliée")),
      h("div", { class: "carte" }, h("h3", null, frMois(m)),
        d.days.length ? d.days.map((j) => blocJour(j, { cadre, actions: (x) => [
          x.id && x.status !== "valide" && !d.closed ? h("button", { onclick: () => dialogueCorrection({ jour: x }) }, "Corriger") : null,
          !x.id && x.anomalies.length && !d.closed ? h("button", { onclick: () => dialogueCorrection({ date: x.date }) }, "Renseigner mes heures") : null,
          !x.id && x.anomalies.length && !d.closed ? h("button", { onclick: () => dialogueAbsence({ date: x.date }) }, "Déclarer une absence") : null,
          x.id ? h("button", { class: "lien", onclick: (ev) => agir(ev.currentTarget, () => voirPointages(x.date)) }, "Pointages d'origine") : null,
        ] })) : h("p", { class: "vide" }, "Aucune journée sur ce mois.")));
  });
}

// Trace brute des pointages : ce qui a été réellement pointé, à l'heure du serveur, avant toute correction.
export async function voirPointages(date, userId) {
  const r = await api("punch-log", { day: date, user_id: userId || "" });
  ouvrir(`Pointages d'origine du ${frJour(date)}`, [
    r.punches.length ? h("div", { class: "pile" }, r.punches.map((p) => h("div", { class: "ligne" }, h("span", null, p.kind === "arrivee" ? "Arrivée" : "Départ"), h("span", { class: "num" }, hmAff(p.hhmm)))))
      : h("p", null, "Aucun pointage réel ce jour-là : les heures ont été saisies à la main."),
    h("p", { class: "discret" }, "Ces heures sont celles relevées par le serveur au moment du pointage. Elles ne peuvent être ni modifiées ni supprimées."),
  ]);
}

/* ================= Absences ================= */
// Photo prise au téléphone : réduite avant l'envoi. PDF : envoyé tel quel s'il tient dans la limite.
async function lireJustificatif(file) {
  const LIMITE = 2_400_000;
  const enBase64 = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = () => rej(new Error("Fichier illisible.")); r.readAsDataURL(blob); });
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    if (file.size > LIMITE) throw new Error("Ce PDF dépasse 2,4 Mo. Envoyez plutôt une photo du document.");
    return { name: file.name, data: await enBase64(file) };
  }
  if (!/^image\//.test(file.type)) throw new Error("Format non accepté : envoyez une photo ou un PDF.");
  let img;
  try { img = await createImageBitmap(file); } catch { throw new Error("Image illisible. Essayez une photo au format JPEG."); }
  for (const [cote, qualite] of [[2000, 0.82], [1600, 0.75], [1200, 0.7]]) {
    const k = Math.min(1, cote / Math.max(img.width, img.height));
    const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise((res) => c.toBlob(res, "image/jpeg", qualite));
    if (blob && blob.size <= LIMITE) return { name: file.name.replace(/\.[a-z0-9]+$/i, "") + ".jpg", data: await enBase64(blob) };
  }
  throw new Error("Image trop lourde, même réduite.");
}

export function dialogueAbsence({ userId, nom, date } = {}) {
  const types = S.boot.types;
  const type = h("select", null, types.map((t) => h("option", { value: t.code }, t.label)));
  const du = h("input", { type: "date", required: true, value: date || "" }), au = h("input", { type: "date", required: true, value: date || "" });
  const demi = h("div", { class: "segments", role: "radiogroup", "aria-label": "Durée" },
    [["", "Journée entière"], ["matin", "Matin"], ["apres_midi", "Après-midi"]].map(([v, l], i) => h("label", null, h("input", { type: "radio", name: "demi", value: v, checked: i === 0 }), l)));
  const note = h("textarea", { maxlength: 500, placeholder: "Facultatif" });
  const piece = h("input", { type: "file", accept: "image/*,application/pdf" });
  const pieceAide = h("small", null, "");
  const apercu = h("div", { class: "bandeau info", hidden: true });
  let jeton = 0, minuteur;
  const demiVal = () => (du.value && du.value === au.value ? demi.querySelector("input:checked").value : "");
  const maj = () => {
    if (du.value && (!au.value || au.value < du.value)) au.value = du.value;
    demi.hidden = !(du.value && du.value === au.value);
    const t = types.find((x) => x.code === type.value);
    pieceAide.textContent = t?.needs_doc ? "Demandé pour ce motif. Vous pourrez aussi l'ajouter plus tard." : "Facultatif. Photo ou PDF.";
    clearTimeout(minuteur);
    if (!du.value || !au.value) { apercu.hidden = true; return; }
    minuteur = setTimeout(async () => {
      const moi = ++jeton;
      try {
        const p = await api("my/absence-preview", { type: type.value, start: du.value, end: au.value, half: demiVal(), user_id: userId || "" });
        if (moi !== jeton) return;
        apercu.replaceChildren(h("strong", null, p.days > 0 ? `${fmtJ(p.days).replace(" j", "")} jour${p.days > 1 ? "s" : ""} décompté${p.days > 1 ? "s" : ""}` : "Aucun jour travaillé sur cette période"),
          ...p.warnings.map((w) => h("div", null, w)));
        apercu.className = "bandeau " + (p.days > 0 && !p.warnings.length ? "info" : ""); apercu.hidden = false;
      } catch (e) { if (moi === jeton) { apercu.replaceChildren(e.message); apercu.className = "bandeau refus"; apercu.hidden = false; } }
    }, 250);
  };
  for (const el of [type, du, au, demi]) el.addEventListener("change", maj);
  ouvrir(userId ? `Saisir une absence pour ${nom || "ce salarié"}` : "Nouvelle demande d'absence", [
    userId ? h("p", { class: "bandeau info" }, "Saisie par les RH : l'absence est enregistrée comme validée, et tracée à votre nom.") : null,
    champ("Motif", type), h("div", { class: "grille2" }, champ("Du", du), champ("Au", au)), demi, apercu,
    champ("Commentaire", note), h("label", null, "Justificatif", piece, pieceAide),
  ], userId ? "Enregistrer l'absence" : "Envoyer la demande", async () => {
    if (!du.value || !au.value) throw new Error("Choisissez les dates.");
    const body = { type: type.value, start: du.value, end: au.value, half: demiVal(), comment: note.value.trim() };
    if (userId) body.user_id = userId;
    if (piece.files[0]) body.doc = await lireJustificatif(piece.files[0]);
    await api("my/absence-request", body);
    toast(userId ? "Absence enregistrée." : "Demande envoyée à votre responsable.");
    S.compterAttente?.(); recharger();
  });
  maj();
}

export async function voirJustificatif(id) {
  const d = await api("doc", { id });
  const blob = base64VersBlob(d.data, d.mime), url = URL.createObjectURL(blob);
  ouvrir("Justificatif", [
    d.mime.startsWith("image/") ? h("img", { class: "apercu", src: url, alt: d.filename }) : h("p", null, `${d.filename} · ${Math.max(1, Math.round(d.size / 1024))} Ko`),
    h("div", { class: "ligne gauche" }, h("button", { type: "button", class: "principal", onclick: () => telecharger(d.filename, blob) }, "Télécharger")),
    h("p", { class: "discret" }, "Document à accès restreint : le salarié, son responsable et les RH. Chaque consultation par un tiers est inscrite au journal."),
  ]);
  document.getElementById("dlg").addEventListener("close", () => setTimeout(() => URL.revokeObjectURL(url), 60000), { once: true });
}
export function ajouterJustificatif(id) {
  const piece = h("input", { type: "file", accept: "image/*,application/pdf", required: true });
  ouvrir("Ajouter un justificatif", [h("label", null, "Photo ou PDF", piece, h("small", null, "Il remplace le justificatif déjà déposé, s'il y en a un."))], "Envoyer", async () => {
    if (!piece.files[0]) throw new Error("Choisissez un fichier.");
    await api("my/absence-doc", { id, doc: await lireJustificatif(piece.files[0]) });
    toast("Justificatif enregistré."); recharger();
  });
}

// Bloc d'une absence, commun à « Mes absences » et aux écrans d'équipe.
export function blocAbsence(a, actions) {
  return h("div", { class: "jour" },
    h("div", null, h("strong", null, a.label), " ", h("span", null, periode(a.start_date, a.end_date, a.half))),
    h("div", { class: "num" }, fmtJ(a.days_count)),
    a.comment ? h("div", { class: "note discret" }, a.comment) : null,
    a.by_rh ? h("div", { class: "note discret" }, "Saisie par le service RH") : null,
    a.refusal_reason ? h("div", { class: "note " + (a.status === "refuse" ? "moins" : "discret") }, `${a.status === "refuse" ? "Refusée" : "Annulée"} : ${a.refusal_reason}`) : null,
    h("div", { class: "actions" }, pastille(a.status), a.has_doc ? h("button", { class: "lien", onclick: (ev) => agir(ev.currentTarget, () => voirJustificatif(a.id)) }, "Voir le justificatif") : null, actions ? actions(a) : null));
}

export function vueAbsences() {
  ecran(() => api("my/absences"), (d) => {
    const cp = d.balances.cp, rtt = d.balances.rtt, types = new Map(S.boot.types.map((t) => [t.code, t]));
    const aFournir = d.absences.filter((a) => !a.has_doc && types.get(a.type_code)?.needs_doc && (a.status === "valide" || a.status === "en_attente"));
    pose(h("div", { class: "ligne" }, h("h2", null, "Mes absences"), h("button", { class: "principal", onclick: () => dialogueAbsence() }, "Nouvelle demande")),
      h("div", { class: "tuiles" },
        tuile("Congés payés", fmtJ(cp.balance), cp.waiting ? `${fmtJ(cp.available)} après les demandes en attente` : `solde au ${frJour(d.today)}`),
        rtt.rights || rtt.taken || rtt.waiting ? tuile("RTT", fmtJ(rtt.balance), rtt.waiting ? `${fmtJ(rtt.available)} après les demandes en attente` : `sur ${fmtJ(rtt.rights)} dans l'année`) : null,
        tuile(`Pris en ${d.year}`, fmtJ(cp.taken + rtt.taken), "congés payés et RTT")),
      h("p", { class: "discret" }, `Congés payés ${d.year} : ${fmtJ(cp.entries)} de report et d'ajustements, ${fmtJ(cp.accrued)} acquis depuis janvier, ${fmtJ(cp.taken)} pris.`),
      d.report_pending ? h("p", { class: "bandeau info" }, h("strong", null, `Report de ${d.year - 1} à venir`), `Vos congés restants de ${d.year - 1} n'ont pas encore été reportés par le service RH : le solde affiché ne les contient pas.`) : null,
      aFournir.length ? h("div", { class: "bandeau" }, h("strong", null, "Justificatif à fournir"), aFournir.map((a) => h("div", { class: "ligne" }, h("span", null, `${a.label}, ${periode(a.start_date, a.end_date, a.half)}`),
        h("button", { class: "petit", onclick: () => ajouterJustificatif(a.id) }, "Ajouter")))) : null,
      h("div", { class: "carte" }, h("h3", null, "Mes demandes"),
        d.absences.length ? d.absences.map((a) => blocAbsence(a, (x) => [
          x.status === "en_attente" ? h("button", { class: "danger", onclick: (ev) => agir(ev.currentTarget, async () => { await api("my/absence-cancel", { id: x.id }); toast("Demande annulée."); S.compterAttente?.(); recharger(); }) }, "Annuler la demande") : null,
          (x.status === "en_attente" || x.status === "valide") ? h("button", { class: "lien", onclick: () => ajouterJustificatif(x.id) }, x.has_doc ? "Remplacer le justificatif" : "Ajouter un justificatif") : null,
        ])) : h("p", { class: "vide" }, "Aucune demande pour l'instant.")),
      h("p", { class: "discret" }, "Pour annuler une absence déjà validée, adressez-vous à votre responsable."));
  });
}

/* ================= Année ================= */
const CLASSES = { T: "k-t", TT: "k-tt", CP: "k-cp", RTT: "k-rtt", AM: "k-am", AB: "k-ab", F: "k-f", "?": "k-att", "!": "k-an" };
export function vueAnnee(annee, userId, espace) {
  const courant = +S.boot.today.slice(0, 4), y = /^\d{4}$/.test(annee) ? +annee : courant;
  const base = userId ? `#/${espace}/annee/${userId}` : "#/moi/annee";
  ecran(() => api("my/year", { year: y, user_id: userId || "" }), (d) => {
    const min = +(S.boot.settings.go_live || String(courant)).slice(0, 4);
    pose(userId ? null : sousAnnee("annee"), h("div", { class: "ligne" },
        h("div", { class: "pile" }, userId ? h("button", { class: "lien", onclick: () => aller(`#/${espace}/salarie/${userId}`) }, `‹ ${d.user.name}`) : null, h("h2", null, userId ? `Année de ${d.user.name}` : "Mon année")),
        h("div", { class: "mois-nav" }, h("button", { "aria-label": "Année précédente", disabled: y <= min, onclick: () => aller(`${base}/${y - 1}`) }, "‹"), h("strong", { class: "num" }, String(y)),
          h("button", { "aria-label": "Année suivante", disabled: y >= courant + 1, onclick: () => aller(`${base}/${y + 1}`) }, "›"))),
      h("div", { class: "legende" }, d.legend.map(([code, lib]) => h("span", { class: CLASSES[code] }, `${code} ${lib}`, d.totals[code] ? ` : ${String(d.totals[code]).replace(".", ",")}` : ""))),
      h("div", { class: "annee" }, d.months.map((m) => {
        const decal = jourSemaine(m.month + "-01");
        return h("div", { class: "moisbloc" }, h("div", { class: "ligne" }, h("strong", null, frMoisSeul(m.month)), m.minutes ? h("span", { class: "discret num" }, fmtMin(m.minutes)) : null),
          h("div", { class: "cal" }, ["L", "M", "M", "J", "V", "S", "D"].map((x) => h("span", { class: "ent", "aria-hidden": "true" }, x)),
            Array.from({ length: decal }, () => h("span")),
            m.cells.map((c) => h("button", { class: [c.off ? "k-we" : CLASSES[c.cat] || "", c.date === d.today ? "auj" : ""].join(" ").trim(), title: c.text, "aria-label": `${frJour(c.date)} : ${c.text}`,
              onclick: () => toast(`${frJourLong(c.date)} : ${c.text}`) }, c.d, c.code ? h("b", null, c.code) : null))));
      })),
      h("p", { class: "discret" }, `Total pointé sur l'année : ${fmtMin(d.total_minutes)}. Touchez un jour pour le détail.`));
  });
}
