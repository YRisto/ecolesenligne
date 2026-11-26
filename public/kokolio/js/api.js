// Appels au serveur. La session tient dans un cookie que le navigateur renvoie seul ; le script n'y a pas accès.
export class ApiError extends Error {
  constructor(code, message, status, extra) { super(message); this.code = code; this.status = status; this.extra = extra || {}; }
}
// Deux environnements, servis par la même application : la production (/kokolio) et l'environnement de test (/kokolio-test).
// L'adresse de la page décide : chacun a ses propres adresses d'API, ses propres données et sa propre session.
export const ENV = /^\/kokolio-test(\/|$)/i.test(location.pathname) ? "test" : "production";
export const CHEMIN = ENV === "test" ? "/kokolio-test" : "/kokolio";
const BASE = ENV === "test" ? "/api/kokolio-test/" : "/api/kokolio/";

let surSessionPerdue = null;
export const quandSessionPerdue = (fn) => { surSessionPerdue = fn; };

export async function api(route, body, { silencieux = false } = {}) {
  let r;
  try {
    r = await fetch(BASE + route, {
      method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json", "x-kokolio": "1" }, body: JSON.stringify(body || {}),
    });
  } catch {
    throw new ApiError("reseau", "Pas de connexion : rien n'a été enregistré. Vérifiez votre réseau puis réessayez.", 0);
  }
  let j = null;
  try { j = await r.json(); } catch { /* réponse illisible */ }
  if (!j) throw new ApiError("serveur", "Le serveur ne répond pas correctement. Réessayez dans un instant.", r.status);
  if (!j.ok) {
    const e = new ApiError(j.code || "erreur", j.message || "Une erreur est survenue.", r.status, j);
    if (j.code === "session" && !silencieux && surSessionPerdue) surSessionPerdue(e);
    throw e;
  }
  return j.data;
}
