// État partagé entre les écrans : la session en cours, l'horloge du serveur, la navigation.
import { h, pose } from "./dom.js";

export const S = { info: null, boot: null, jeton: 0, minuteur: null, decalage: 0, afficher: () => {} };

// L'heure affichée est celle du serveur : on mémorise l'écart avec l'horloge de l'appareil.
export function calerHorloge(iso) { if (iso) S.decalage = new Date(iso).getTime() - Date.now(); }
const fmtHM = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
export const heureServeur = () => fmtHM.format(new Date(Date.now() + S.decalage));
export const minutesServeur = () => { const [a, b] = heureServeur().split(":").map(Number); return a * 60 + b; };

export function aller(hash) {
  if (location.hash === hash) S.afficher(); else location.hash = hash;
}
export const recharger = () => S.afficher();
export const moisCourant = () => S.boot.today.slice(0, 7);
export const estRH = () => S.boot.me.role !== "salarie";
export const estAdmin = () => S.boot.me.role === "admin";

// Charge puis affiche un écran. Si l'utilisateur a changé d'écran entre-temps, la réponse est ignorée.
export async function ecran(charger, rendre) {
  const jeton = ++S.jeton;
  pose(h("p", { class: "discret" }, "Chargement…"));
  try {
    const data = await charger();
    if (jeton !== S.jeton) return;
    rendre(data);
  } catch (e) {
    if (jeton !== S.jeton || e?.code === "session") return;
    pose(h("div", { class: "carte" }, h("h2", null, e?.code === "interdit" ? "Accès refusé" : "Impossible d'afficher cette page"),
      h("p", null, e?.message || "Une erreur est survenue."),
      h("div", { class: "ligne gauche" }, h("button", { class: "principal", onclick: () => S.afficher() }, "Réessayer"), h("button", { onclick: () => aller("#/") }, "Accueil"))));
  }
}
