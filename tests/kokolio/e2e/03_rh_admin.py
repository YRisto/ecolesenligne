# RH et administration sur ordinateur : fiches, clôture, export, journal, réglages, autodiagnostic, compte.
import sys, json, os
sys.path.insert(0, os.path.dirname(__file__))
from outils import *
E = lambda login: f"/tmp/kk-etat-{login}.json"
MDP = json.load(open("/tmp/kk-e2e.json"))["mdp"]

with sync_playwright() as p:
    nav = p.chromium.launch()
    # Léo corrige sa journée refusée, le responsable la valide
    leo = Poste(nav, "leo", etat=E("leo.petit")).a("2026-11-05", "10:05"); leo.ouvre("/kokolio#/moi/heures")
    leo.page.locator(".jour", has_text="lun. 2 nov.").get_by_role("button", name="Corriger").click()
    leo.page.locator("#dlg input[aria-label='Arrivée']").first.fill("13:30"); leo.page.locator("#dlg input[aria-label='Départ']").first.fill("17:00")
    leo.page.locator("#dlg .heures-edit").nth(1).get_by_role("button", name="Retirer cette plage").click()
    leo.page.locator("#dlg textarea").fill("Matin en rendez-vous extérieur"); leo.valider_fenetre("Enregistrer"); leo.voit("13:30 → 17:00")
    leo.page.locator(".jour", has_text="mar. 3 nov.").get_by_role("button", name="Corriger").click()
    leo.page.locator("#dlg input[aria-label='Départ']").first.fill("17:00"); leo.page.locator("#dlg textarea").fill("Départ non pointé"); leo.valider_fenetre("Enregistrer")

    so = Poste(nav, "sophie", BUREAU, etat=E("sophie.durand")).a("2026-11-06", "09:00"); so.ouvre(); so.voit("Bonjour Sophie")
    assert so.page.locator("button.mode").count() == 3, "RH : mon espace, mon équipe (Nadia lui est rattachée), RH"
    so.photo("30-accueil-rh")
    so.clic("Ressources humaines"); so.voit("Comptes activés"); so.voit("6 / 6"); so.photo("31-salaries")
    # fiche de Léo : poste, horaire daté, écriture de solde
    so.page.get_by_text("Léo Petit").first.click(); so.voit("Identité et poste"); so.voit("28 h 00 par semaine")
    so.champ("Poste", "Conseiller senior"); so.clic("Enregistrer"); so.voit("Fiche enregistrée")
    so.clic("Changer l'horaire à partir d'une date"); so.champ("Date d'effet", "2026-12-01")
    so.page.locator("#dlg input[aria-label='Durée du Ven']").fill("7"); so.voit("35 h 00"); so.photo("32-horaire", pleine=False); so.valider_fenetre("Appliquer"); so.voit("Historique")
    so.clic("Ajouter une écriture"); so.champ("Jours (négatif pour retirer)", "2,5"); so.champ("Motif", "Jours de fractionnement"); so.valider_fenetre("Ajouter"); so.voit("Jours de fractionnement")
    so.photo("33-fiche")
    so.clic("Mot de passe oublié : nouveau code"); so.voit("Ce code ne sera plus affiché"); so.photo("34-code", pleine=False); so.clic("J'ai transmis le code")
    # un RH ne peut ni modifier le compte administrateur ni attribuer un profil
    so.va("#/rh/salaries"); so.page.get_by_text("Administrateur").first.click(); so.voit("Identité et poste")
    assert so.page.get_by_label("Profil").is_disabled()
    so.clic("Enregistrer"); so.voit("Seul un administrateur peut modifier un compte administrateur")
    so.va("#/admin/reglages"); so.voit("Bonjour Sophie")                                           # espace administration fermé aux RH
    # nouvelle fiche à la main
    so.va("#/rh/fiche/nouveau"); so.champ("Prénom", "Inès"); so.champ("Nom", "Morel", exact=True); so.champ("Matricule de paie", "0031"); so.champ("Date d'entrée", "2026-11-09")
    assert so.page.get_by_label("Identifiant de connexion").input_value() == "ines.morel"
    so.clic("Créer la fiche"); so.voit("Ce code ne sera plus affiché"); so.clic("J'ai transmis le code"); so.voit("Compte et accès")
    # saisie d'un arrêt maladie pour Nadia, avec justificatif
    so.va("#/rh/synthese"); so.voit("Synthèse · tous les salariés"); so.photo("35-synthese-rh")
    so.page.get_by_text("Nadia Roux").first.click(); so.voit("Journées · novembre 2026"); so.clic("Saisir une absence")
    so.page.locator("#dlg select").first.select_option("maladie"); so.champ("Du", "2026-11-16", exact=True); so.champ("Au", "2026-11-20", exact=True); so.voit("5 jours décomptés")
    so.page.locator("#dlg input[type=file]").set_input_files("/tmp/kk-arret.png"); so.valider_fenetre("Enregistrer l'absence"); so.voit("Absence enregistrée")
    so.va("#/rh/annee/" + so.page.url.split("/salarie/")[1].split("/")[0]); so.voit("Année de Nadia Roux"); so.photo("36-annee-nadia")

    # --- 1er décembre : clôture de novembre
    so.a("2026-12-01", "10:00").va("#/rh/cloture"); so.recharge(); so.voit("Clôture et export paie"); so.voit("Ouvert"); so.photo("37-cloture")
    so.clic("Préparer la clôture"); so.voit("non validée"); so.voit("sans pointage ni absence"); so.photo("38-cloture-bloquee", pleine=False)
    assert so.page.locator("#dlg").get_by_role("button", name="Clôturer le mois").count() == 0
    so.clic("Ouvrir la validation"); so.voit("Validation · tous les salariés"); so.photo("39-validation-rh")
    for _ in range(8):
        so.va("#/rh/validation")
        ouvrir = so.page.get_by_role("button", name="Ouvrir", exact=True)
        demandes = so.page.locator(".carte", has_text="Demandes d'absence").get_by_role("button", name="Valider", exact=True)
        if demandes.count(): demandes.first.click(); so.page.wait_for_timeout(400); continue
        if not ouvrir.count(): break
        ouvrir.first.click(); so.page.wait_for_load_state("networkidle"); so.page.wait_for_timeout(200)
        lot = so.page.get_by_role("button", name=re.compile("Valider les")); un = so.page.get_by_role("button", name="Valider", exact=True)
        if lot.count(): lot.first.click()
        elif un.count(): un.first.click()
        else:  # départ jamais pointé : les RH complètent la journée à la place de la salariée, puis la valident
            so.voit("Départ non pointé"); so.photo("39b-depart-non-pointe"); so.clic("Corriger"); so.voit("elle sera tracée à votre nom")
            so.page.locator("#dlg input[aria-label='Départ']").first.fill("17:00"); so.page.locator("#dlg textarea").fill("Départ non pointé, heure confirmée par la salariée"); so.valider_fenetre("Enregistrer")
        so.page.wait_for_timeout(400)
    so.va("#/rh/validation"); so.voit("Rien à valider")
    so.va("#/rh/cloture"); so.clic("Préparer la clôture"); so.voit("Toutes les journées sont validées"); so.photo("40-cloture-prete", pleine=False)
    with so.page.expect_download() as dl: so.clic("Télécharger le brouillon de l'export")
    assert dl.value.suggested_filename.startswith("BROUILLON-paie-2026-11")
    so.valider_fenetre("Clôturer le mois"); so.voit("Clôturé · version 1"); so.photo("41-cloture-faite")
    with so.page.expect_download() as dl: so.clic("Télécharger l'export paie")
    export = open(dl.value.path(), encoding="utf-8").read()
    assert dl.value.suggested_filename == "paie-2026-11-v1.csv", dl.value.suggested_filename
    assert "0012;AB-CP;4;09/11/2026;13/11/2026" in export and "0020;AB-MAL;5;16/11/2026;20/11/2026" in export and "0012;HS-HN;" in export, export
    so.clic("Voir les chiffres figés"); so.voit("Chiffres figés le"); so.clic("Fermer")
    # mois figé : la salariée ne peut plus rien corriger
    cam = Poste(nav, "camille", etat=E("camille.martin")).a("2026-12-01", "10:30"); cam.ouvre("/kokolio#/moi/heures/2026-11"); cam.voit("Ce mois est clôturé")
    assert cam.page.get_by_role("button", name="Corriger").count() == 0 and cam.page.get_by_role("button", name="Ajouter une journée oubliée").count() == 0
    cam.photo("42-mois-cloture")
    # réouverture motivée puis nouvelle version
    so.clic("Rouvrir"); so.valider_fenetre("Rouvrir le mois"); so.voit("Indiquez un motif")
    so.page.locator("#dlg textarea").fill("Journée oubliée pour Camille Martin"); so.valider_fenetre("Rouvrir le mois"); so.voit("Rouvert")
    so.clic("Préparer la clôture"); so.valider_fenetre("Clôturer le mois"); so.voit("Clôturé · version 2"); so.voit("Rouverte le"); so.photo("43-cloture-v2")
    # journal
    so.va("#/rh/journal"); so.voit("Journal des actions"); lignes = lambda t: so.page.locator(".entree", has_text=t)
    expect(lignes("Mois clôturé").first).to_be_visible(); so.clic("Vérifier l'intégrité"); so.voit("Journal intact", delai=20000); so.photo("44-journal")
    so.page.get_by_label("Type d'action").select_option("correction"); so.page.wait_for_timeout(600); expect(lignes("Journée corrigée").first).to_be_visible(); expect(lignes("Mois clôturé")).to_have_count(0)
    so.va("#/rh/report"); so.voit("Report des congés 2025 → 2026"); so.va("#/rh/report/2026"); so.voit("n'est pas terminée"); so.photo("45-report")

    # --- administrateur
    ad = Poste(nav, "admin", BUREAU, etat=E("admin")).a("2026-12-01", "11:00"); ad.ouvre("/kokolio#/admin/motifs"); ad.voit("Motifs d'absence"); ad.photo("46-motifs")
    ad.clic("Nouveau motif"); ad.champ("Libellé", "Congé paternité"); ad.champ("Code dans l'export paie", "AB-PAT"); ad.valider_fenetre("Enregistrer"); ad.voit("Congé paternité")
    ad.va("#/admin/etat"); ad.voit("État de l'installation"); ad.clic("Lancer l'autodiagnostic"); ad.voit("contrôles réussis", delai=30000); ad.photo("47-etat")
    ad.va("#/"); ad.clic("Administration"); ad.voit("Première version de production"); ad.photo("48-versions")   # l'espace s'ouvre sur les fonctionnalités et les versions
    # l'administrateur attribue le profil RH
    ad.va("#/rh/salaries"); ad.page.get_by_text("Julien Bernard").first.click(); ad.voit("Identité et poste"); ad.page.get_by_label("Profil").select_option("rh"); ad.clic("Enregistrer"); ad.voit("Fiche enregistrée")
    # --- compte : mot de passe, appareils, déconnexion
    cam.va("#/compte"); cam.voit("Appareils connectés"); cam.photo("49-compte")
    cam.champ("Mot de passe actuel", MDP["camille.martin"]); cam.champ("Nouveau mot de passe", "court"); cam.champ("Confirmer", "court"); cam.clic("Changer le mot de passe"); cam.voit("Au moins 10 caractères")
    cam.champ("Nouveau mot de passe", "Nouveau-Secret-88"); cam.champ("Confirmer", "Nouveau-Secret-88"); cam.clic("Changer le mot de passe"); cam.voit("Mot de passe changé")
    cam.clic("Se déconnecter"); cam.valider_fenetre("Se déconnecter"); cam.voit("Vous êtes déconnecté")
    cam.connecter("camille.martin", MDP["camille.martin"]); cam.voit("Identifiant ou mot de passe incorrect")
    cam.connecter("camille.martin", "Nouveau-Secret-88"); cam.voit("Pointer mon arrivée")
    # la maquette reste consultable à part
    ad.ouvre("/kokolio/demo"); ad.voit("Maquette de démonstration")
    nav.close()
erreurs[:] = [e for e in erreurs if "/kokolio/demo" not in e and "centre-europeen-formation" not in e]
bilan(); print("étape 3 terminée")
