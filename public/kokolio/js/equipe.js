// Mon équipe (responsable) et les mêmes écrans à l'échelle de l'entreprise (RH) : validation, synthèse, détail d'un salarié.
import { api } from "./api.js";
import { h, pose, toast, agir, demanderMotif, etiquette, tuile, listeAlertes, navMois, telecharger,
  fmtMin, fmtEcart, fmtJ, fmtNb, frJour, frMois, periode, classeEcart } from "./dom.js";
import { S, ecran, aller, recharger, moisCourant } from "./etat.js";
import { blocJour, blocAbsence, dialogueCorrection, dialogueAbsence, voirPointages, voirJustificatif } from "./moi.js";
import { montrerCode } from "./codes.js";

const apres = () => { S.compterAttente?.(); recharger(); };
const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? "s" : ""}`;

async function deciderJours(decision, items, reason) {
  const r = await api("team/decide-days", { decision, reason: reason || "", items });
  const fait = r.done.length, rate = r.failed.length;
  const verbe = decision === "valide" ? "validée" : decision === "refuse" ? "refusée" : "rouverte";
  if (fait) toast(`${pluriel(fait, "journée")} ${verbe}${fait > 1 ? "s" : ""}${rate ? `, ${rate} non traitée${rate > 1 ? "s" : ""} : ${r.failed[0].message}` : "."}`, !!rate);
  else toast(r.failed[0]?.message || "Aucune journée traitée.", true);
  apres();
}
async function deciderAbsence(a, decision, reason) {
  await api("team/decide-absence", { id: a.id, decision, reason: reason || "", version: a.version });
  toast(decision === "valide" ? "Absence validée." : decision === "refuse" ? "Demande refusée : le salarié verra votre motif." : "Absence annulée.");
  apres();
}

/* ================= Validation ================= */
export function vueValidation(espace, userId) {
  const rh = espace === "rh", scope = rh ? "all" : "team";
  ecran(() => api("team/pending", { scope, user_id: userId || "" }), (p) => {
    const rien = !p.absences.length && !p.groups.length && !p.summary.length;
    // journées prêtes, ni corrigées ni signalées : validables d'un geste ; les autres se regardent une à une
    const simples = p.groups.flatMap((g) => (g.own ? [] : g.days.filter((d) => d.state === "ok" && !d.corrected && !d.alerts.length)));
    pose(h("div", { class: "ligne" }, h("h2", null, userId && rh ? "Validation" : rh ? "Validation · tous les salariés" : "Validation"),
        userId && rh ? h("button", { onclick: () => aller("#/rh/validation") }, "‹ Tous les salariés") : null),
      rien ? h("div", { class: "carte" }, h("p", { class: "vide" }, "Rien à valider. Tout est à jour.")) : null,
      p.groups.length > 1 && simples.length > 1 ? h("div", { class: "bandeau info" }, h("strong", null, `${simples.length} journées sans correction ni alerte`),
        "Les journées corrigées par le salarié ou signalées par une alerte restent à examiner une à une.",
        h("div", { class: "ligne" }, h("button", { class: "domaine", onclick: (ev) => agir(ev.currentTarget, () => deciderJours("valide", simples.map((d) => ({ id: d.id, version: d.version })))) }, `Valider ces ${simples.length} journées`))) : null,
      p.absences.length ? h("div", { class: "carte" }, h("h3", null, `Demandes d'absence (${p.absences.length})`),
        p.absences.map((a) => h("div", { class: "jour" },
          h("div", null, h("strong", null, a.name), " ", h("span", null, `${a.label} · ${periode(a.start_date, a.end_date, a.half)}`)),
          h("div", { class: "num" }, fmtJ(a.days_count)),
          h("div", { class: "note discret" }, [a.team, rh && a.manager_name ? `responsable : ${a.manager_name}` : null, a.balance ? `solde ${a.balance.kind} avant cette demande : ${fmtJ(a.balance.value)}` : null].filter(Boolean).join(" · ")),
          a.balance && a.balance.value < a.days_count ? h("div", { class: "note moins" }, "La demande dépasse le solde.") : null,
          a.comment ? h("div", { class: "note" }, `« ${a.comment} »`) : null,
          a.overlaps.length ? h("div", { class: "note bandeau" }, h("strong", null, "Aussi absents sur la période"),
            a.overlaps.map((o) => h("div", null, `${o.name} : ${o.label}, ${periode(o.start_date, o.end_date)}${o.pending ? " (en attente)" : ""}`))) : null,
          h("div", { class: "actions" },
            h("button", { class: "domaine", onclick: (ev) => agir(ev.currentTarget, () => deciderAbsence(a, "valide")) }, "Valider"),
            h("button", { class: "danger", onclick: () => demanderMotif("Refuser la demande", `${a.name} · ${a.label} · ${periode(a.start_date, a.end_date, a.half)}`, "Refuser", (m) => deciderAbsence(a, "refuse", m), { danger: true, label: "Motif du refus (visible par le salarié)" }) }, "Refuser"),
            a.has_doc ? h("button", { class: "lien", onclick: (ev) => agir(ev.currentTarget, () => voirJustificatif(a.id)) }, "Voir le justificatif") : null)))) : null,
      // RH, tous salariés : d'abord la liste de ceux qui ont des journées en attente
      !p.groups.length && p.summary.length ? h("div", { class: "carte" }, h("h3", null, `Journées à valider (${p.total_days})`),
        h("p", { class: "discret" }, "Les responsables valident leur équipe. Vous pouvez valider à leur place, salarié par salarié."),
        p.summary.map((s) => h("div", { class: "jour" }, h("div", null, h("strong", null, s.name), " ", h("span", { class: "discret" }, [s.team, s.manager_name ? `responsable : ${s.manager_name}` : "sans responsable"].filter(Boolean).join(" · "))),
          h("div", { class: "num" }, pluriel(s.n, "journée")),
          h("div", { class: "actions" }, h("span", { class: "discret" }, `depuis le ${frJour(s.oldest)}`), h("button", { onclick: () => aller(`#/rh/validation/${s.user_id}`) }, "Ouvrir"))))) : null,
      p.groups.map((g) => {
        const pretes = g.days.filter((d) => d.state === "ok");
        return h("div", { class: "carte" }, h("h3", null, `${g.name} · ${pluriel(g.days.length, "journée")}`),
          g.own ? h("p", { class: "bandeau info" }, "Ce sont vos propres journées : en tant qu'administrateur sans responsable, vous les validez vous-même. C'est inscrit au journal.") : null,
          pretes.length > 1 ? h("div", { class: "ligne gauche" }, h("button", { class: "domaine", onclick: (ev) => agir(ev.currentTarget, () => deciderJours("valide", pretes.map((d) => ({ id: d.id, version: d.version })))) }, `Valider les ${pretes.length} journées prêtes`)) : null,
          g.days.map((d) => blocJour(d, { cadre: d.regime === "forfait_jours", notes: (x) => (x.alerts.length ? h("div", { class: "note moins" }, x.alerts.join(" · ")) : null), actions: (x) => [
            x.state === "ok" ? h("button", { class: "domaine", onclick: (ev) => agir(ev.currentTarget, () => deciderJours("valide", [{ id: x.id, version: x.version }])) }, "Valider") : null,
            x.state === "en_cours" ? etiquette("Journée en cours", "p-gris") : x.state === "incomplet" ? etiquette("Départ non pointé", "p-refus") : x.state === "clos" ? etiquette("Mois clôturé", "p-gris") : null,
            x.state !== "clos" ? h("button", { class: "danger", onclick: () => demanderMotif("Refuser la journée", `${g.name} · ${frJour(x.date)}. Le salarié devra la corriger.`, "Refuser", (m) => deciderJours("refuse", [{ id: x.id, version: x.version }], m), { danger: true, label: "Motif du refus (visible par le salarié)" }) }, "Refuser") : null,
            rh && x.state !== "clos" ? h("button", { onclick: () => dialogueCorrection({ jour: x, userId: g.user_id, nom: g.name }) }, "Corriger") : null,
            h("button", { class: "lien", onclick: (ev) => agir(ev.currentTarget, () => voirPointages(x.date, g.user_id)) }, "Pointages d'origine"),
          ] })));
      }));
  });
}

/* ================= Synthèse du mois ================= */
export function vueSynthese(espace, mois) {
  const rh = espace === "rh", m = /^\d{4}-\d{2}$/.test(mois) ? mois : moisCourant();
  ecran(() => api("team/month", { month: m, scope: rh ? "all" : "team" }), (d) => {
    const t = d.tiles, filtre = h("input", { type: "search", placeholder: "Rechercher un nom ou une équipe", "aria-label": "Rechercher" });
    const corps = h("tbody");
    const dessine = () => {
      const q = filtre.value.trim().toLowerCase();
      const rows = d.rows.filter((r) => !q || `${r.name} ${r.team} ${r.matricule}`.toLowerCase().includes(q));
      corps.replaceChildren(...rows.map((r) => {
        const cadre = r.regime === "forfait_jours";
        return h("tr", { class: "cliquable", tabindex: 0, onclick: () => aller(`#/${espace}/salarie/${r.user_id}/${m}`), onkeydown: (ev) => { if (ev.key === "Enter") aller(`#/${espace}/salarie/${r.user_id}/${m}`); } },
          h("td", null, h("strong", null, r.name), d.current && r.present ? h("span", { class: "pastille p-ok ml" }, "présent") : d.current && r.absent ? h("span", { class: "pastille p-neutre ml" }, "absent") : null),
          h("td", null, r.team || "—"),
          h("td", { class: "d num" }, cadre ? `${fmtNb(r.days)} j` : fmtMin(r.worked)),
          h("td", { class: "d num" }, cadre ? "forfait" : fmtMin(r.theo)),
          h("td", { class: "d num " + (cadre ? "" : classeEcart(r.ecart)) }, cadre ? "—" : fmtEcart(r.ecart)),
          h("td", { class: "d num" }, r.abs_days ? fmtJ(r.abs_days) : "—"),
          h("td", { class: "c" }, r.pending ? h("span", { class: "compte" }, r.pending) : "✓"),
          h("td", { class: "c" }, r.anomalies ? etiquette(String(r.anomalies), "p-attente") : "—"),
          h("td", { class: "c" }, r.alerts ? etiquette(String(r.alerts), "p-refus") : "—"));
      }));
      if (!rows.length) corps.append(h("tr", null, h("td", { colspan: 9, class: "vide" }, d.rows.length ? "Aucun résultat." : "Personne dans ce périmètre.")));
    };
    filtre.addEventListener("input", dessine); dessine();
    const csv = () => {
      const lignes = [["Salarié", "Matricule", "Équipe", "Régime", "Heures travaillées", "Heures prévues", "Écart (heures)", "Jours travaillés", "Jours d'absence", "Journées à valider", "À régulariser", "Alertes"],
        ...d.rows.map((r) => [r.name, r.matricule, r.team, r.regime === "forfait_jours" ? "Forfait jours" : "Horaire", fmtNb(r.worked / 60), fmtNb(r.theo / 60), fmtNb(r.ecart / 60), r.days, fmtNb(r.abs_days), r.pending, r.anomalies, r.alerts])];
      telecharger(`synthese-${m}.csv`, "﻿" + lignes.map((l) => l.map((c) => { const s = String(c ?? ""); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(";")).join("\r\n") + "\r\n");
    };
    pose(h("div", { class: "ligne" }, h("h2", null, rh ? "Synthèse · tous les salariés" : "Synthèse de l'équipe"), navMois(m, { min: (S.boot.settings.go_live || "").slice(0, 7), max: moisCourant(), surChange: (x) => aller(`#/${espace}/synthese/${x}`) })),
      d.closed ? h("p", { class: "bandeau ok" }, "Mois clôturé : ces chiffres sont figés.") : null,
      h("div", { class: "tuiles" },
        tuile("Salariés", String(t.employees), rh ? "dans l'entreprise" : "dans l'équipe"),
        d.current ? tuile("Présents", String(t.present), "en ce moment") : null,
        d.current ? tuile("Absents", String(t.absent), "aujourd'hui") : null,
        tuile("À valider", String(t.pending), "journées"),
        tuile("À régulariser", String(t.anomalies), "oublis de pointage"),
        tuile("Alertes", String(t.alerts), "durée du travail"),
        tuile("Absentéisme", t.absenteeism == null ? "—" : `${fmtNb(t.absenteeism)} %`, "hors congés et formation")),
      h("div", { class: "carte" }, h("h3", null, frMois(m)),
        h("div", { class: "recherche" }, d.rows.length > 8 ? filtre : null, h("button", { class: "pousse", onclick: csv }, "Télécharger (CSV)")),
        h("div", { class: "table-zone" }, h("table", null, h("thead", null, h("tr", null, h("th", null, "Salarié"), h("th", null, "Équipe"), h("th", { class: "d" }, "Travaillé"), h("th", { class: "d" }, "Prévu"),
          h("th", { class: "d" }, "Écart"), h("th", { class: "d" }, "Absences"), h("th", { class: "c" }, "À valider"), h("th", { class: "c" }, "Oublis"), h("th", { class: "c" }, "Alertes"))), corps))));
  });
}

/* ================= Un salarié sur un mois ================= */
export function vueSalarie(espace, id, mois) {
  let rh = espace === "rh";
  const m = /^\d{4}-\d{2}$/.test(mois) ? mois : moisCourant();
  ecran(() => api("team/employee", { user_id: id, month: m }), (d) => {
    const u = d.user, cadre = d.regime === "forfait_jours", s = d.summary, cp = d.balances.cp, rtt = d.balances.rtt;
    const soi = id === S.boot.me.id, moi = soi && !S.boot.me.self_validate;
    if (soi) rh = false; // sur sa propre fiche, on agit depuis « Mon espace », pas au titre des RH
    pose(h("div", { class: "ligne" },
        h("div", { class: "pile" }, h("button", { class: "lien", onclick: () => aller(`#/${espace}/synthese/${m}`) }, "‹ Synthèse"), h("h2", null, u.name),
          h("p", { class: "discret" }, [u.team, u.job, cadre ? "forfait jours" : `${fmtMin(d.weekly_minutes)} par semaine${d.cycle ? " en moyenne" : ""}`, d.cycle ? `cycle « ${d.cycle} »` : null,
            d.presence === "automatique" ? "présence automatique" : null, u.matricule ? `matricule ${u.matricule}` : null].filter(Boolean).join(" · "))),
        navMois(m, { min: (S.boot.settings.go_live || "").slice(0, 7), max: moisCourant(), surChange: (x) => aller(`#/${espace}/salarie/${id}/${x}`) })),
      !u.active ? h("p", { class: "bandeau" }, u.disabled ? "Compte désactivé." : "Ce salarié a quitté l'entreprise.") : null,
      !u.activated ? h("p", { class: "bandeau" }, u.code_pending ? "Compte pas encore activé : un code d'activation est en attente d'utilisation." : "Compte jamais activé, et aucun code valide : générez un code d'activation.") : null,
      h("div", { class: "ligne gauche" },
        h("button", { onclick: () => aller(`#/${espace}/annee/${id}`) }, "Voir l'année"),
        h("button", { onclick: () => aller(`#/${espace}/planning/${m === moisCourant() ? "" : m + "-01"}`) }, "Planning"),
        espace === "rh" ? h("button", { onclick: () => aller(`#/rh/fiche/${id}`) }, "Fiche") : null,
        rh && !d.closed ? h("button", { onclick: () => dialogueCorrection({ userId: id, nom: u.name }) }, "Ajouter une journée") : null,
        rh ? h("button", { onclick: () => dialogueAbsence({ userId: id, nom: u.name }) }, "Saisir une absence") : null,
        id !== S.boot.me.id ? h("button", { onclick: (ev) => agir(ev.currentTarget, async () => montrerCode(await api("team/code", { user_id: id }))) }, u.activated ? "Mot de passe oublié : nouveau code" : "Code d'activation") : null),
      h("div", { class: "tuiles" },
        cadre ? tuile("Jours travaillés", `${fmtNb(s.days_worked)} j`, frMois(m)) : tuile("Travaillé", fmtMin(s.worked), `sur ${fmtMin(s.theo)} prévues`),
        cadre ? null : tuile("Écart", fmtEcart(s.ecart), "débit-crédit du mois", classeEcart(s.ecart)),
        tuile("Validation", `${s.validated} / ${s.validated + s.pending + s.refused}`, "journées validées"),
        tuile("Congés payés", fmtJ(cp.balance), cp.waiting ? `${fmtJ(cp.waiting)} en attente` : "solde"),
        rtt.rights || rtt.taken ? tuile("RTT", fmtJ(rtt.balance), `sur ${fmtJ(rtt.rights)}`) : null),
      d.closed ? h("p", { class: "bandeau ok" }, "Mois clôturé : plus aucune modification possible sans réouverture par les RH.") : null,
      listeAlertes("À régulariser", d.anomalies, "", rh && !d.closed ? (a) => h("button", { class: "petit", onclick: () => dialogueCorrection({ jour: d.days.find((x) => x.date === a.date && x.id), date: a.date, userId: id, nom: u.name }) }, "Corriger") : null),
      listeAlertes("Durée du travail : points d'attention", d.alerts, "refus"),
      d.absences.length ? h("div", { class: "carte" }, h("h3", null, "Absences du mois"), d.absences.map((a) => blocAbsence(a, (x) => moi || d.closed ? null : [
        x.status === "en_attente" ? h("button", { class: "domaine", onclick: (ev) => agir(ev.currentTarget, () => deciderAbsence(x, "valide")) }, "Valider") : null,
        x.status === "en_attente" ? h("button", { class: "danger", onclick: () => demanderMotif("Refuser la demande", `${x.label} · ${periode(x.start_date, x.end_date, x.half)}`, "Refuser", (mo) => deciderAbsence(x, "refuse", mo), { danger: true }) }, "Refuser") : null,
        x.status === "valide" ? h("button", { class: "danger", onclick: () => demanderMotif("Annuler cette absence validée", "Les jours seront recrédités au solde. Le salarié verra votre motif.", "Annuler l'absence", (mo) => deciderAbsence(x, "annule", mo), { danger: true }) }, "Annuler l'absence") : null,
      ]))) : null,
      h("div", { class: "carte" }, h("h3", null, `Journées · ${frMois(m)}`),
        d.days.length ? d.days.map((j) => blocJour(j, { cadre, actions: (x) => [
          !moi && x.id && x.status === "a_valider" && x.date < d.today && x.complete && !d.closed ? h("button", { class: "domaine", onclick: (ev) => agir(ev.currentTarget, () => deciderJours("valide", [{ id: x.id, version: x.version }])) }, "Valider") : null,
          !moi && x.id && x.status === "a_valider" && !d.closed ? h("button", { class: "danger", onclick: () => demanderMotif("Refuser la journée", `${u.name} · ${frJour(x.date)}`, "Refuser", (mo) => deciderJours("refuse", [{ id: x.id, version: x.version }], mo), { danger: true }) }, "Refuser") : null,
          !moi && x.id && x.status === "valide" && !d.closed ? h("button", { onclick: () => demanderMotif("Rouvrir cette journée validée", "Elle redeviendra modifiable par le salarié et devra être validée de nouveau.", "Rouvrir", (mo) => deciderJours("a_valider", [{ id: x.id, version: x.version }], mo)) }, "Rouvrir") : null,
          rh && x.id && x.status !== "valide" && !d.closed ? h("button", { onclick: () => dialogueCorrection({ jour: x, userId: id, nom: u.name }) }, "Corriger") : null,
          rh && !x.id && x.anomalies.length && !d.closed ? h("button", { onclick: () => dialogueCorrection({ date: x.date, userId: id, nom: u.name }) }, "Renseigner") : null,
          x.id ? h("button", { class: "lien", onclick: (ev) => agir(ev.currentTarget, () => voirPointages(x.date, id)) }, "Pointages d'origine") : null,
        ] })) : h("p", { class: "vide" }, "Aucune journée sur ce mois.")));
  });
}
