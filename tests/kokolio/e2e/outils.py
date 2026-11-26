# Outils communs aux tests de bout en bout (Playwright) : navigateur, horloge de test, captures.
import os, re, sys
from datetime import datetime
from zoneinfo import ZoneInfo
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get("KK_BASE", "http://localhost:3111")
SHOTS = os.environ.get("KK_SHOTS", "/tmp/kk-shots")
os.makedirs(SHOTS, exist_ok=True)
MOBILE = {"viewport": {"width": 390, "height": 844}, "device_scale_factor": 2, "is_mobile": True, "has_touch": True}
BUREAU = {"viewport": {"width": 1280, "height": 860}}
erreurs = []

def instant(jour, hm):
    """Heure de Paris -> instant ISO (UTC) pour l'en-tete d'horloge de test."""
    d = datetime.strptime(f"{jour} {hm}", "%Y-%m-%d %H:%M").replace(tzinfo=ZoneInfo("Europe/Paris"))
    return d.astimezone(ZoneInfo("UTC")).strftime("%Y-%m-%dT%H:%M:%SZ")

class Poste:
    """Un navigateur pour une personne : son propre contexte (cookies), son horloge."""
    def __init__(self, nav, nom, forme=MOBILE, etat=None):
        self.nom = nom
        self.ctx = nav.new_context(locale="fr-FR", timezone_id="Europe/Paris", storage_state=etat, accept_downloads=True, **forme)
        self.page = self.ctx.new_page()
        self.page.on("console", lambda m: erreurs.append(f"[{nom}] console {m.type}: {m.text}") if m.type == "error" and "Failed to load resource" not in m.text else None)
        self.page.on("pageerror", lambda e: erreurs.append(f"[{nom}] exception: {e}"))
    def a(self, jour, hm):
        self.ctx.set_extra_http_headers({"x-kk-test-now": instant(jour, hm)})
        return self
    def ouvre(self, chemin="/kokolio"):
        self.page.goto(BASE + chemin); self.page.wait_for_load_state("networkidle"); return self
    def va(self, hash_):
        self.page.evaluate(f"location.hash = '{hash_}'"); self.page.wait_for_load_state("networkidle"); self.page.wait_for_timeout(150); return self
    def recharge(self):
        self.page.reload(); self.page.wait_for_load_state("networkidle"); return self
    def photo(self, nom, pleine=True):
        self.page.wait_for_timeout(200)
        # aucun écran ne doit laisser paraître une valeur brute (null, undefined, NaN, [object Object])
        brut = self.page.evaluate("""() => { const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT), out = []; let n;
          while ((n = w.nextNode())) { const t = n.nodeValue.trim(); if (t === 'null' || /undefined|NaN|\\[object /.test(t)) out.push(t.slice(0, 60)); } return out; }""")
        if brut: erreurs.append(f"[{self.nom}] valeur brute affichée sur « {nom} » : {brut[:3]}")
        self.page.screenshot(path=f"{SHOTS}/{nom}.png", full_page=pleine)
    def clic(self, texte, exact=False, n=0):
        self.page.get_by_role("button", name=texte, exact=exact).nth(n).click(); self.page.wait_for_timeout(120); return self
    def champ(self, libelle, valeur, exact=False):
        self.page.get_by_label(libelle, exact=exact).first.fill(valeur); return self
    def voit(self, texte, delai=6000, exact=False):
        expect(self.page.get_by_text(texte, exact=exact).first).to_be_visible(timeout=delai); return self
    def ne_voit_pas(self, texte):
        expect(self.page.get_by_text(texte)).to_have_count(0); return self
    def ne_voit_pas_exact(self, texte):
        expect(self.page.get_by_text(texte, exact=True)).to_have_count(0); return self
    def toast(self):
        return self.page.locator("#toast").inner_text()
    def activer(self, login, code, mdp):
        self.ouvre()
        self.clic("Première connexion ou mot de passe oublié")
        self.champ("Identifiant", login); self.champ("Code d'activation", code)
        self.champ("Nouveau mot de passe", mdp); self.champ("Confirmer le mot de passe", mdp)
        self.clic("Activer mon compte"); self.page.wait_for_load_state("networkidle"); self.page.wait_for_timeout(300); return self
    def connecter(self, login, mdp):
        self.ouvre(); self.champ("Identifiant", login); self.champ("Mot de passe", mdp, exact=True); self.clic("Se connecter")
        self.page.wait_for_load_state("networkidle"); self.page.wait_for_timeout(300); return self
    def valider_fenetre(self, libelle):
        self.page.locator("#dlg").get_by_role("button", name=libelle, exact=True).click(); self.page.wait_for_load_state("networkidle"); self.page.wait_for_timeout(250); return self

def bilan():
    if erreurs:
        print("ERREURS NAVIGATEUR :"); [print("  ", e) for e in erreurs[:30]]
    else:
        print("aucune erreur de console ni exception dans le navigateur")
