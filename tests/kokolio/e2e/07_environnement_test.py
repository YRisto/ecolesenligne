# Environnement de test : accès depuis l'administration, copie de la production, cloisonnement des deux environnements.
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from outils import *

CODE = sys.argv[1]
MDP = "Tableau-Bleu-2026"
with sync_playwright() as p:
    nav = p.chromium.launch()
    # ---- en production : l'administrateur prépare des données, puis ouvre l'onglet « Test »
    ad = Poste(nav, "admin", BUREAU); ad.activer("admin", CODE, MDP); ad.voit("Bonjour Administrateur")
    assert not ad.page.locator("#bandeau-test").is_visible()
    assert ad.page.title().startswith("Kokolio ·")
    ad.va("#/admin/etat"); ad.clic("Charger les données de démonstration"); ad.valider_fenetre("Charger"); ad.voit("Ces codes ne seront plus affichés", delai=30000)
    codes = {b.locator(".mono").first.inner_text(): b.locator(".code-act").inner_text() for b in ad.page.locator(".bons .bon").all()}
    ad.voit("localhost:3111/kokolio"); ad.clic("Terminé")
    ad.ouvre("/kokolio"); ad.voit("Administration"); ad.photo("90-accueil-admin")
    assert ad.page.locator(".marque-test").count() == 0
    # l'accès est en vue dès l'accueil de l'administrateur : une tuile, qui mène à l'onglet « Test » de l'administration
    ad.page.locator("button.mode.m-test").click(); ad.page.wait_for_load_state("networkidle")
    assert ad.page.evaluate("location.hash") == "#/admin/test"
    ad.voit("Une copie complète pour essayer sans risque"); ad.voit("Ouvrir l'environnement de test")
    ad.voit("faite · schéma 8"); ad.voit("oui · application 2.4.0"); ad.voit("jamais", exact=True); ad.photo("91-admin-test-avant-copie")
    lien = ad.page.get_by_role("link", name="Ouvrir l'environnement de test")
    assert lien.get_attribute("href") == "/kokolio-test" and lien.get_attribute("target") == "_blank"
    assert ad.page.locator("nav#onglets").get_by_text("Test", exact=True).count() == 1

    # ---- l'environnement de test, encore vide : bandeau, aucune connexion possible, la session de production n'y vaut rien
    te = Poste(nav, "admin-test", BUREAU, etat=ad.ctx.storage_state()); te.ouvre("/kokolio-test")
    te.voit("Environnement de test"); te.voit("aucune copie de la production pour l'instant"); te.voit("Connexion")
    assert te.page.locator("#bandeau-test").is_visible() and te.page.title().startswith("Kokolio TEST ·")
    assert te.page.locator('link[rel="manifest"]').count() == 0
    te.champ("Identifiant", "admin"); te.champ("Mot de passe", MDP, exact=True); te.clic("Se connecter"); te.voit("Identifiant ou mot de passe incorrect"); te.photo("92-test-vide")

    # ---- la copie : mot de confirmation obligatoire
    ad.clic("Copier la production vers le test"); ad.valider_fenetre("Lancer la copie"); ad.voit("saisissez le mot COPIER")
    ad.page.locator("#dlg input").fill("copier"); ad.photo("93-copie-confirmation", pleine=False); ad.valider_fenetre("Lancer la copie")
    ad.voit("Copie terminée : 7 comptes", delai=30000); ad.ne_voit_pas_exact("jamais"); ad.voit(", par admin"); ad.photo("94-admin-test-apres-copie")
    ad.va("#/rh/journal"); expect(ad.page.locator(".quoi", has_text="Production copiée vers l'environnement de test").first).to_be_visible(); ad.photo("95-journal-copie")

    # ---- dans le test : mêmes identifiants, mêmes données, bandeau daté
    te.recharge(); te.voit("copie de la production du"); te.champ("Identifiant", "admin"); te.champ("Mot de passe", MDP, exact=True); te.clic("Se connecter")
    te.voit("Bonjour Administrateur"); te.voit("rien de ce qui est fait ici ne touche la production"); te.voit("Vous y êtes"); te.photo("96-test-accueil")
    assert te.page.locator("header.barre .marque-test").inner_text() == "TEST"
    te.va("#/rh/salaries"); te.voit("Camille Martin"); te.voit("7 fiches"); te.photo("97-test-salaries")
    te.va("#/admin/test"); te.voit("Vous êtes dans l'environnement de test"); te.voit("Dernière copie de la production"); te.ne_voit_pas("Copier la production vers le test"); te.photo("98-test-onglet-test")
    assert te.page.get_by_role("link", name="Aller à la production").first.get_attribute("href") in ("/kokolio", "/kokolio#/admin/test")
    # un réglage changé dans le test ne change rien en production
    te.va("#/admin/reglages"); te.champ("Nom affiché", "Entreprise d'essai (test)"); te.clic("Enregistrer les réglages"); te.voit("Réglages enregistrés")
    te.recharge(); assert te.page.title() == "Kokolio TEST · Entreprise d'essai (test)", te.page.title()
    ad.recharge(); assert ad.page.title() == "Kokolio · Centre Européen de Formation", ad.page.title()
    # la session de production est restée ouverte pendant tout ce temps, celle du test aussi
    ad.va("#/admin/etat"); ad.voit("État de l'installation")

    # ---- un salarié : son code d'activation vaut dans les deux environnements, chacun de son côté
    th_t = Poste(nav, "thomas-test"); th_t.page.goto(BASE + "/kokolio-test"); th_t.page.wait_for_load_state("networkidle")
    th_t.clic("Première connexion ou mot de passe oublié"); th_t.champ("Identifiant", "thomas.petit"); th_t.champ("Code d'activation", codes["thomas.petit"])
    th_t.champ("Nouveau mot de passe", "Lampe+Orange58"); th_t.champ("Confirmer le mot de passe", "Lampe+Orange58"); th_t.clic("Activer mon compte")
    th_t.page.wait_for_load_state("networkidle"); th_t.voit("Pointer mon arrivée"); assert th_t.page.locator("#bandeau-test").is_visible()
    th_t.clic("Pointer mon arrivée"); th_t.voit("Pointer mon départ"); th_t.photo("99-test-salarie")
    assert th_t.page.locator("button.mode.m-test").count() == 0   # la tuile d'accès au test n'existe que pour l'administrateur
    # … en production, Thomas n'a ni compte activé ni pointage : le mot de passe choisi dans le test n'y existe pas
    th_p = Poste(nav, "thomas-prod"); th_p.connecter("thomas.petit", "Lampe+Orange58"); th_p.voit("Identifiant ou mot de passe incorrect")
    th_p.activer("thomas.petit", codes["thomas.petit"], "Girafe!Verte42"); th_p.voit("Pointer mon arrivée"); assert not th_p.page.locator("#bandeau-test").is_visible()

    # ---- nouvelle copie : le test revient à l'image de la production, les sessions du test tombent
    ad.va("#/admin/test"); ad.clic("Copier la production vers le test"); ad.page.locator("#dlg input").fill("COPIER"); ad.valider_fenetre("Lancer la copie"); ad.voit("Copie terminée", delai=30000)
    te.recharge(); te.voit("Connexion"); assert te.page.title() == "Kokolio TEST · Centre Européen de Formation", te.page.title()
    th_t.recharge(); th_t.voit("Connexion")
    th_t.champ("Identifiant", "thomas.petit"); th_t.champ("Mot de passe", "Girafe!Verte42", exact=True); th_t.clic("Se connecter"); th_t.voit("Pointer mon arrivée")   # le mot de passe de production, copié
    print("environnement de test : accès depuis l'administration, copie, cloisonnement — vérifiés")
    bilan()
    nav.close()
    sys.exit(1 if erreurs else 0)
