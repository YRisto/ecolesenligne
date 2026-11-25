# Le quotidien : pointer, oublier, corriger, demander un congé, valider.
import sys, json, os, base64
sys.path.insert(0, os.path.dirname(__file__))
from outils import *

PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNkYPhfz0AEYBxVSF+FAP5FDvcfRYWgAAAAAElFTkSuQmCC")
open("/tmp/kk-arret.png", "wb").write(PNG)
E = lambda login: f"/tmp/kk-etat-{login}.json"

with sync_playwright() as p:
    nav = p.chromium.launch()
    cam = Poste(nav, "camille", etat=E("camille.martin")); leo = Poste(nav, "leo", etat=E("leo.petit")); nad = Poste(nav, "nadia", etat=E("nadia.roux"))
    jul = Poste(nav, "julien", etat=E("julien.bernard"))

    # --- lundi 2 novembre
    cam.a("2026-11-02", "08:58").ouvre(); cam.voit("Pointer mon arrivée")
    cam.clic("Pointer mon arrivée"); cam.voit("Présent depuis 08:58"); assert "Arrivée enregistrée à 08:58" in cam.toast(); cam.photo("10-pointer-present")
    cam.a("2026-11-02", "12:30").recharge(); cam.clic("Pointer mon départ"); cam.voit("Dernier départ à 12:30")
    cam.a("2026-11-02", "13:15").recharge(); cam.clic("Pointer mon retour"); cam.voit("Présent depuis 13:15")
    cam.a("2026-11-02", "17:45").recharge(); cam.clic("Pointer mon départ"); cam.voit("08:58 → 12:30"); cam.voit("8 h 02"); cam.photo("11-pointer-fin-de-journee")
    nad.a("2026-11-02", "09:00").ouvre(); nad.page.get_by_label("Lieu de travail").select_option("teletravail"); nad.clic("Pointer mon arrivée"); nad.voit("Présent depuis 09:00")
    jul.a("2026-11-02", "09:10").ouvre(); jul.clic("Mon espace"); jul.clic("Pointer mon arrivée"); jul.a("2026-11-02", "18:40").recharge(); jul.clic("Pointer mon départ"); jul.voit("1 / 218"); jul.photo("12-pointer-cadre")

    # --- mardi 3 : les oublis de la veille sont signalés
    nad.a("2026-11-03", "08:55").recharge(); nad.voit("À régulariser"); nad.voit("Départ non pointé"); nad.photo("13-oubli-depart")
    nad.clic("Corriger"); nad.voit("Corriger le lun. 2 nov."); nad.page.locator("#dlg input[aria-label='Départ']").first.fill("17:30")
    nad.valider_fenetre("Enregistrer"); nad.voit("Indiquez le motif")                       # motif obligatoire
    nad.page.locator("#dlg textarea").fill("Départ non pointé"); nad.photo("14-correction", pleine=False); nad.valider_fenetre("Enregistrer")
    nad.ne_voit_pas("À régulariser"); nad.clic("Pointer mon arrivée")
    leo.a("2026-11-03", "09:05").ouvre(); leo.voit("Aucun pointage ni absence"); leo.va("#/moi/heures"); leo.voit("Renseigner mes heures"); leo.photo("15-heures-oubli")
    leo.clic("Renseigner mes heures"); d = leo.page.locator("#dlg")
    d.locator("input[aria-label='Arrivée']").first.fill("09:00"); d.locator("input[aria-label='Départ']").first.fill("12:30")
    leo.clic("Ajouter une plage"); d.locator("input[aria-label='Arrivée']").nth(1).fill("13:30"); d.locator("input[aria-label='Départ']").nth(1).fill("17:00")
    d.locator("textarea").fill("Badge oublié"); leo.valider_fenetre("Enregistrer"); leo.voit("09:00 → 12:30"); leo.voit("À valider")
    leo.va("#/moi/pointer"); leo.clic("Pointer mon arrivée")
    cam.a("2026-11-03", "08:00").recharge(); cam.clic("Pointer mon arrivée")
    # demande de congé : le 11 novembre, férié, n'est pas décompté
    cam.va("#/moi/absences"); cam.voit("6 j"); cam.clic("Nouvelle demande")
    cam.champ("Du", "2026-11-09", exact=True); cam.champ("Au", "2026-11-13", exact=True); cam.page.locator("#dlg textarea").fill("Vacances en famille"); cam.voit("4 jours décomptés"); cam.photo("16-demande-conge", pleine=False)
    cam.valider_fenetre("Envoyer la demande"); cam.voit("En attente"); cam.voit("2 j après les demandes en attente"); cam.photo("17-absences")
    # demi-journée avec justificatif (image réduite dans le navigateur avant l'envoi)
    nad.va("#/moi/absences"); nad.clic("Nouvelle demande"); nad.page.locator("#dlg select").first.select_option("evenement")
    nad.champ("Du", "2026-11-06", exact=True); nad.champ("Au", "2026-11-06", exact=True); nad.page.locator("#dlg").get_by_text("Après-midi").click(); nad.voit("0,5 jour décompté")
    nad.page.locator("#dlg input[type=file]").set_input_files("/tmp/kk-arret.png"); nad.valider_fenetre("Envoyer la demande"); nad.voit("Voir le justificatif")
    nad.clic("Voir le justificatif"); nad.voit("Document à accès restreint"); assert nad.page.locator("#dlg img.apercu").count() == 1; nad.clic("Fermer")
    cam.a("2026-11-03", "19:30").va("#/moi/pointer").recharge(); cam.clic("Pointer mon départ")
    # --- mercredi 4 : alertes sur la durée du travail
    cam.a("2026-11-04", "06:00").recharge(); cam.clic("Pointer mon arrivée"); cam.a("2026-11-04", "14:00").recharge(); cam.clic("Pointer mon départ")
    cam.a("2026-11-05", "09:00").va("#/moi/heures"); cam.voit("Plus de 10 h 00 travaillées"); cam.voit("Repos de 10 h 30 seulement"); cam.photo("18-heures-alertes")
    cam.clic("Pointages d'origine", n=0); cam.voit("relevées par le serveur"); cam.clic("Fermer")
    cam.va("#/moi/annee"); cam.voit("Mon année"); cam.photo("19-annee")

    # --- le responsable valide (jeudi 5)
    jul.a("2026-11-05", "09:30").va("#/"); jul.recharge(); jul.page.wait_for_timeout(500)
    assert jul.page.locator("button.mode .compte").inner_text() == "6", jul.page.locator("button.mode .compte").inner_text()   # 5 journées + 1 demande
    jul.photo("20-accueil-pastille"); jul.clic("Mon équipe"); jul.voit("Demandes d'absence (1)"); jul.voit("solde CP avant cette demande : 6 j"); jul.photo("21-validation")
    jul.page.locator(".carte", has_text="Demandes d'absence").get_by_role("button", name="Valider", exact=True).click(); jul.voit("Absence validée")
    jul.clic("Valider les 3 journées prêtes"); jul.voit("3 journées validées")
    jul.page.locator(".carte", has_text="Léo Petit").get_by_role("button", name="Refuser").first.click()
    jul.page.locator("#dlg textarea").fill("Vous étiez en rendez-vous extérieur le matin"); jul.valider_fenetre("Refuser"); jul.voit("journée refusée")
    jul.va("#/equipe/synthese"); jul.voit("Synthèse de l'équipe"); jul.voit("Camille Martin"); jul.photo("22-synthese-equipe")
    jul.page.get_by_text("Camille Martin").first.click(); jul.voit("Journées · novembre 2026"); jul.voit("Absences du mois"); jul.photo("23-detail-salarie")
    # un responsable ne voit pas une salariée d'une autre équipe, même en forçant l'adresse
    jul.va("#/equipe/salarie/00000000-0000-0000-0000-000000000000"); jul.voit("Accès refusé")
    # Léo voit le refus et corrige
    leo.a("2026-11-05", "10:00").va("#/moi/heures"); leo.voit("Refusée : Vous étiez en rendez-vous extérieur le matin"); leo.photo("24-journee-refusee")
    for etat, poste in (("camille.martin", cam), ("leo.petit", leo), ("nadia.roux", nad), ("julien.bernard", jul)): poste.ctx.storage_state(path=E(etat))
    nav.close()
bilan(); print("étape 2 terminée")
