# Mode démonstration, sur un outil vide : chargement, codes des comptes fictifs, usage, effacement.
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from outils import *

CODE = sys.argv[1]
with sync_playwright() as p:
    nav = p.chromium.launch()
    ad = Poste(nav, "admin", BUREAU); ad.activer("admin", CODE, "Tableau-Bleu-2026"); ad.voit("Bonjour Administrateur")
    assert not ad.page.locator("#bandeau-demo").is_visible()
    ad.va("#/admin/etat"); ad.voit("Données de démonstration"); ad.photo("60-etat-avant-demo")
    ad.clic("Charger les données de démonstration"); ad.valider_fenetre("Charger"); ad.voit("Ces codes ne seront plus affichés", delai=30000)
    assert ad.page.locator(".bons .bon").count() == 6
    assert ad.page.locator("#bandeau-demo").is_visible(); ad.voit("Compte fictif"); ad.photo("61-comptes-fictifs")
    codes = {b.locator(".mono").first.inner_text(): b.locator(".code-act").inner_text() for b in ad.page.locator(".bons .bon").all()}
    ad.clic("Terminé"); ad.voit("Camille Martin"); ad.voit("7 fiches")
    ad.va("#/rh/synthese"); ad.voit("Synthèse · tous les salariés"); ad.voit("Thomas Petit"); ad.photo("62-synthese-demo")
    ad.va("#/rh/cloture"); ad.voit("Clôturé · version 1"); ad.photo("63-cloture-demo")
    ad.va("#/rh/validation/tout"); ad.voit("Demandes d'absence (3)"); ad.photo("64-validation-demo")
    # un salarié fictif et son responsable se connectent avec leur code
    th = Poste(nav, "thomas"); th.activer("thomas.petit", codes["thomas.petit"], "Lampe+Orange58"); th.voit("Pointer mon arrivée"); th.voit("À régulariser")
    assert th.page.locator("#bandeau-demo").is_visible(); th.photo("65-salarie-fictif")
    th.va("#/moi/annee"); th.voit("Mon année"); th.photo("66-annee-fictive")
    ju = Poste(nav, "julien"); ju.activer("julien.bernard", codes["julien.bernard"], "Cactus#Mauve77"); ju.voit("Bonjour Julien"); ju.page.wait_for_timeout(600)
    ju.photo("67-responsable-fictif"); ju.clic("Mon équipe"); ju.voit("Demandes d'absence (2)"); ju.voit("journées sans correction ni alerte"); ju.photo("68-validation-responsable")
    ju.page.get_by_role("button", name=re.compile("Valider ces")).click(); ju.voit("validées")
    # effacement : mot de confirmation obligatoire
    ad.va("#/admin/etat"); ad.voit("L'outil est en mode démonstration"); ad.clic("Effacer les données de démonstration"); ad.valider_fenetre("Tout effacer"); ad.voit("saisissez le mot EFFACER")
    ad.page.locator("#dlg input").fill("effacer"); ad.photo("69-effacement", pleine=False); ad.valider_fenetre("Tout effacer"); ad.voit("Données de démonstration effacées")
    assert not ad.page.locator("#bandeau-demo").is_visible()
    ad.va("#/rh/salaries"); ad.voit("1 fiche"); ad.va("#/rh/journal"); expect(ad.page.locator(".entree", has_text="Données de démonstration effacées").first).to_be_visible(); assert ad.page.locator(".entree").count() == 1
    th.recharge(); th.voit("Connexion")   # le compte fictif n'existe plus
    nav.close()
bilan(); print("étape 4 terminée")
