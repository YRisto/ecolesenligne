// Secrets : jetons de session, mots de passe (scrypt), codes d'activation.
import { createHash, randomBytes, scrypt } from "node:crypto";

// Paramètres scrypt des nouveaux mots de passe. Ils sont enregistrés avec chaque compte : on peut les durcir sans casser l'existant.
export const SCRYPT = { N: 32768, r: 8, p: 3, len: 32 };

export const sha256 = (s) => createHash("sha256").update(String(s), "utf8").digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");
export const newSalt = () => randomBytes(16).toString("hex");

export function hashPassword(password, saltHex, params) {
  const q = params && Number.isInteger(params.N) ? params : SCRYPT;
  const N = Math.min(Math.max(q.N, 1024), 1 << 17), r = Math.min(Math.max(q.r || 8, 1), 16), p = Math.min(Math.max(q.p || 1, 1), 8);
  return new Promise((resolve, reject) => {
    scrypt(String(password).normalize("NFKC"), Buffer.from(saltHex, "hex"), q.len || 32, { N, r, p, maxmem: 512 * 1024 * 1024 },
      (err, key) => (err ? reject(err) : resolve(key.toString("hex"))));
  });
}

// Code d'activation : 12 caractères sans ambiguïté de lecture (ni 0/O ni 1/I), soit 60 bits.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function newCode() {
  let s = "";
  for (const b of randomBytes(12)) s += ALPHABET[b % 32];
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}
export const normCode = (c) => String(c ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
export const codeHash = (c) => sha256(normCode(c));
