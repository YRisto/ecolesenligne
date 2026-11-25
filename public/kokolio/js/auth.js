// Connexion par identifiant et mot de passe ; première connexion ou mot de passe oublié par code d'activation.
import { api } from "./api.js";
import { h, pose, logo, champ } from "./dom.js";
import { S } from "./etat.js";

function cadre(...kids) {
  document.body.classList.add("sans-nav");
  document.getElementById("onglets").replaceChildren();
  document.getElementById("qui").replaceChildren();
  const v = document.getElementById("vue"); v.className = "etroit"; v.dataset.espace = "";
  pose(h("div", { class: "porte" }, h("div", { class: "carte" }, logo(S.info?.logo_url, "logo-g", S.info?.company || ""), ...kids),
    h("p", { class: "pied" }, `${S.info?.company || ""} · Kokolio ${S.info?.app || ""}`)));
}

export function ecranConnexion(message, surSucces) {
  const login = h("input", { type: "text", name: "username", autocomplete: "username", autocapitalize: "none", spellcheck: "false", required: true, inputmode: "email" });
  const pw = h("input", { type: "password", name: "password", autocomplete: "current-password", required: true });
  const err = h("p", { class: "bandeau refus", hidden: true, role: "alert" });
  const ok = h("button", { class: "principal", type: "submit" }, "Se connecter");
  cadre(h("h2", null, "Connexion"),
    message ? h("p", { class: "bandeau info" }, message) : null,
    h("form", { novalidate: true, onsubmit: async (ev) => {
      ev.preventDefault(); err.hidden = true; ok.disabled = true;
      try { await api("auth/login", { login: login.value, password: pw.value }, { silencieux: true }); await surSucces(); }
      catch (e) { err.textContent = e.message; err.hidden = false; pw.value = ""; pw.focus(); }
      finally { ok.disabled = false; }
    } }, champ("Identifiant", login), champ("Mot de passe", pw), err, ok),
    h("button", { class: "lien", type: "button", onclick: () => ecranActivation(surSucces, login.value) }, "Première connexion ou mot de passe oublié"));
  login.focus();
}

export function ecranActivation(surSucces, loginInitial = "") {
  const login = h("input", { type: "text", name: "username", autocomplete: "username", autocapitalize: "none", spellcheck: "false", required: true, value: loginInitial });
  const code = h("input", { type: "text", name: "code", autocomplete: "one-time-code", autocapitalize: "characters", spellcheck: "false", required: true, placeholder: "XXXX-XXXX-XXXX", class: "mono" });
  const pw = h("input", { type: "password", name: "new-password", autocomplete: "new-password", required: true, minlength: 10 });
  const pw2 = h("input", { type: "password", name: "new-password-2", autocomplete: "new-password", required: true });
  const err = h("p", { class: "bandeau refus", hidden: true, role: "alert" });
  const ok = h("button", { class: "principal", type: "submit" }, "Activer mon compte");
  cadre(h("h2", null, "Activer mon compte"),
    h("p", null, "Saisissez le code d'activation remis par votre responsable ou par le service RH, puis choisissez votre mot de passe."),
    h("form", { novalidate: true, onsubmit: async (ev) => {
      ev.preventDefault(); err.hidden = true;
      if (pw.value !== pw2.value) { err.textContent = "Les deux mots de passe ne sont pas identiques."; err.hidden = false; return; }
      ok.disabled = true;
      try { await api("auth/activate", { login: login.value, code: code.value, password: pw.value }, { silencieux: true }); await surSucces(); }
      catch (e) { err.textContent = e.message; err.hidden = false; }
      finally { ok.disabled = false; }
    } }, champ("Identifiant", login), champ("Code d'activation", code),
      champ("Nouveau mot de passe", pw, "10 caractères au moins, avec des lettres et des chiffres ou des symboles."), champ("Confirmer le mot de passe", pw2), err, ok),
    h("p", { class: "discret" }, "Le code ne sert qu'une fois. Mot de passe oublié ? Demandez un nouveau code à votre responsable ou aux RH."),
    h("button", { class: "lien", type: "button", onclick: () => ecranConnexion("", surSucces) }, "J'ai déjà un mot de passe"));
  (loginInitial ? code : login).focus();
}

export function ecranIndisponible(e, reessayer) {
  const installation = e?.code === "installation" || e?.code === "configuration";
  cadre(h("h2", null, installation ? "Installation en cours" : "Service momentanément indisponible"),
    h("p", null, installation ? "L'outil est en ligne, mais sa base de données n'est pas encore installée. L'administrateur doit terminer l'installation."
      : (e?.message || "Le serveur ne répond pas.")),
    h("button", { class: "principal", onclick: reessayer }, "Réessayer"),
    installation ? h("p", { class: "discret" }, h("a", { href: "/kokolio/demo" }, "En attendant, la maquette de démonstration reste consultable.")) : null);
}
