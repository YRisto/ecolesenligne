// Fiches d'activation : le code n'est montré qu'une fois, au moment où il est généré.
import { h, ouvrir, toast, frCourt } from "./dom.js";
import { S } from "./etat.js";

const adresse = () => `${location.origin}/kokolio`;
const finValidite = (iso) => (iso ? frCourt(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date(iso))) : "");

export function bonActivation({ name, login, code, expires }) {
  return h("div", { class: "bon" },
    h("h4", null, name || login), h("p", { class: "discret" }, `${S.boot.settings.company} · accès à Kokolio, l'outil de pointage et d'absences`),
    h("div", null, "Adresse : ", h("strong", null, adresse())),
    h("div", null, "Identifiant : ", h("strong", { class: "mono" }, login)),
    h("div", { class: "code-act" }, code),
    h("ol", null, h("li", null, "Ouvrez l'adresse ci-dessus, sur téléphone ou ordinateur."), h("li", null, "Choisissez « Première connexion ou mot de passe oublié »."),
      h("li", null, "Saisissez l'identifiant et le code, puis choisissez votre mot de passe (10 caractères au moins).")),
    h("p", { class: "discret" }, `Code personnel, utilisable une seule fois${expires ? `, valable jusqu'au ${finValidite(expires)}` : ""}. Ne le transmettez à personne d'autre.`));
}

export function montrerCode(c) {
  const texte = `Kokolio (${S.boot.settings.company})\nAdresse : ${adresse()}\nIdentifiant : ${c.login}\nCode d'activation : ${c.code}\nChoisissez « Première connexion ou mot de passe oublié », saisissez l'identifiant et le code, puis créez votre mot de passe.`;
  ouvrir("Code d'activation", [
    h("p", { class: "bandeau" }, h("strong", null, "Ce code ne sera plus affiché"), "Notez-le ou transmettez-le maintenant. En cas de perte, il suffit d'en générer un nouveau."),
    bonActivation(c),
    h("div", { class: "ligne gauche" },
      h("button", { type: "button", onclick: async () => { try { await navigator.clipboard.writeText(texte); toast("Copié. Collez-le dans un message au salarié."); } catch { toast("Copie impossible : notez le code à la main.", true); } } }, "Copier le message"),
      h("button", { type: "button", onclick: () => imprimerBons([c]) }, "Imprimer")),
  ], null, null, { fermer: "J'ai transmis le code" });
}

// Impression : les fiches sont posées dans une zone à part, seule visible à l'impression.
export function imprimerBons(liste) {
  const zone = h("div", { class: "imprimable bons" }, liste.map(bonActivation));
  const main = document.getElementById("vue");
  main.append(zone); document.body.classList.add("impression"); // la fenêtre ouverte reste à l'écran : elle est masquée à l'impression
  const fin = () => { zone.remove(); document.body.classList.remove("impression"); window.removeEventListener("afterprint", fin); };
  window.addEventListener("afterprint", fin);
  window.print();
  setTimeout(fin, 60000);
}
