# Mode démonstration dans un outil en cours d'essai : deux comptes existent déjà (cas rencontré en production).
# L'historique fictif ne doit pas les concerner : ni mois sans pointage, ni présence dans le mois clôturé.
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from outils import *

CODE = sys.argv[1]
CSV = ("identifiant;nom;prenom;matricule;responsable;date_entree;regime;heures_hebdo\n"
       "demo.manager;Manager;Démo;9001;;01/01/2026;forfait;\n"
       "demo.salarie;Salarié;Démo;9002;demo.manager;01/01/2026;horaire;35\n")
with sync_playwright() as p:
    nav = p.chromium.launch()
    ad = Poste(nav, "admin", BUREAU); ad.activer("admin", CODE, "Tableau-Bleu-2026"); ad.voit("Bonjour Administrateur")
    ad.va("#/rh/import"); ad.voit("Préparer le fichier")
    ad.page.locator("textarea").fill(CSV); ad.clic("Vérifier le fichier"); ad.voit("À créer")
    ad.clic("Importer 2 lignes"); ad.voit("Ces codes ne seront plus affichés")
    codes = {b.locator(".mono").first.inner_text(): b.locator(".code-act").inner_text() for b in ad.page.locator(".bons .bon").all()}
    ad.clic("Terminé")
    es = Poste(nav, "essai"); es.activer("demo.salarie", codes["demo.salarie"], "Bateau-Rouge-19"); es.voit("Pointer mon arrivée"); es.ne_voit_pas("À régulariser")
    # chargement : la fenêtre de confirmation dit ce qu'il advient des comptes déjà là
    ad.va("#/admin/etat"); ad.clic("Charger les données de démonstration")
    ad.voit("L'outil contient déjà 2 salariés"); ad.voit("l'historique fictif ne les concerne pas"); ad.photo("70-chargement-avec-comptes-existants", pleine=False)
    ad.valider_fenetre("Charger"); ad.voit("Ces codes ne seront plus affichés", delai=30000)
    assert ad.page.locator(".bons .bon").count() == 6
    ad.clic("Terminé"); ad.voit("9 fiches")
    # synthèse d'octobre et clôture : les six comptes fictifs seulement, aucune journée sans pointage inventée
    ad.va("#/rh/synthese/2026-10"); ad.voit("Camille Martin"); ad.ne_voit_pas("Démo Salarié"); ad.ne_voit_pas("Démo Manager"); ad.photo("71-synthese-octobre")
    ad.va("#/rh/synthese"); ad.voit("Démo Salarié"); ad.photo("72-synthese-mois-courant")
    ad.va("#/rh/cloture"); ad.voit("Clôturé · version 1"); ad.ne_voit_pas("sans pointage"); ad.photo("73-cloture")
    # le compte d'essai : toujours rien à régulariser, et « Mes heures » ne remonte pas avant son premier jour suivi
    es.recharge(); es.voit("Pointer mon arrivée"); es.ne_voit_pas("À régulariser"); assert es.page.locator("#bandeau-demo").is_visible()
    es.va("#/moi/heures"); es.voit("Mes heures"); assert es.page.get_by_role("button", name="Mois précédent").is_disabled(); es.photo("74-compte-existant-heures")
    es.va("#/moi/annee"); es.voit("Mon année"); es.photo("75-compte-existant-annee")
    nav.close()
bilan(); print("étape 5 terminée")
