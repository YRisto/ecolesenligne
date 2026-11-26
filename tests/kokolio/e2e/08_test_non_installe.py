# Environnement de test pas encore installé dans la base : la production n'en souffre pas, et chaque écran dit quoi faire.
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from outils import *

CODE = sys.argv[1]
with sync_playwright() as p:
    nav = p.chromium.launch()
    ad = Poste(nav, "admin", BUREAU); ad.activer("admin", CODE, "Tableau-Bleu-2026"); ad.voit("Bonjour Administrateur")
    ad.page.locator("button.mode.m-test").click(); ad.page.wait_for_load_state("networkidle")
    ad.voit("Environnement de test pas encore installé"); ad.voit("install-test.sql"); ad.voit("à faire")
    assert ad.page.get_by_role("button", name="Copier la production vers le test").is_disabled()
    ad.photo("9a-admin-test-non-installe")
    # l'adresse du test répond proprement : un écran d'explication, pas une page cassée
    te = Poste(nav, "visiteur", BUREAU); te.page.goto(BASE + "/kokolio-test"); te.page.wait_for_load_state("networkidle")
    te.voit("Environnement de test pas encore installé"); te.voit("Administration › Test"); assert te.page.locator("#bandeau-test").is_visible()
    assert te.page.get_by_role("link", name="Aller à la production").first.get_attribute("href") == "/kokolio"
    te.photo("9b-test-non-installe")
    # la production, elle, fonctionne normalement
    ad.va("#/admin/etat"); ad.clic("Lancer l'autodiagnostic"); ad.voit("47 contrôles réussis", delai=30000)
    print("environnement de test non installé : écrans d'explication vérifiés, production intacte")
    # la console signale la réponse 503 de l'adresse de test : attendu ici, on ne retient que les exceptions
    graves = [e for e in erreurs if "exception" in e or "valeur brute" in e]
    if graves: print("ERREURS NAVIGATEUR :"); [print("  ", e) for e in graves]
    else: print("aucune exception dans le navigateur")
    nav.close()
    sys.exit(1 if graves else 0)
