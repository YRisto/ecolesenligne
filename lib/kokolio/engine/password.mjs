// Règles de mot de passe : longueur d'abord, pas de règles de composition pénibles.
const COMMON = new Set(["motdepasse", "password", "azertyuiop", "qwertyuiop", "1234567890", "0123456789", "azerty1234", "azerty12345", "bonjour123", "soleil1234", "123456789a", "password123", "motdepasse1", "abcdefghij", "kokolio123", "iloveyou12"]);

export function passwordIssues(password, login = "") {
  const pw = String(password ?? "");
  const issues = [];
  if (pw.length < 10) issues.push("Au moins 10 caractères.");
  if (pw.length > 200) issues.push("200 caractères au plus.");
  if (!/[a-zA-ZÀ-ÿ]/.test(pw) || !/[^a-zA-ZÀ-ÿ]/.test(pw)) issues.push("Mélangez des lettres avec des chiffres ou des symboles.");
  const low = pw.toLowerCase();
  if (COMMON.has(low)) issues.push("Ce mot de passe est trop courant.");
  const l = String(login || "").toLowerCase();
  if (l.length >= 3 && low.includes(l)) issues.push("Le mot de passe ne doit pas contenir votre identifiant.");
  if (/^(.)\1+$/.test(pw)) issues.push("Évitez un seul caractère répété.");
  return issues;
}
