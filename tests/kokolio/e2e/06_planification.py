# Planification (version 2.0), sur les données de démonstration : bibliothèque, cycles, planning d'équipe, présence automatique, nuit.
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from outils import *

CODE = sys.argv[1]
J = "2026-11-25"   # un mercredi
with sync_playwright() as p:
    nav = p.chromium.launch()
    ad = Poste(nav, "admin", BUREAU).a(J, "10:00"); ad.activer("admin", CODE, "Tableau-Bleu-2026"); ad.voit("Bonjour Administrateur")
    ad.va("#/admin/etat"); ad.clic("Charger les données de démonstration"); ad.valider_fenetre("Charger"); ad.voit("Ces codes ne seront plus affichés", delai=30000)
    codes = {b.locator(".mono").first.inner_text(): b.locator(".code-act").inner_text() for b in ad.page.locator(".bons .bon").all()}

    # --- RH : planning de tous, bibliothèque, nouveau cycle
    so = Poste(nav, "sophie", BUREAU).a(J, "10:00"); so.activer("sophie.leroy", codes["sophie.leroy"], "Girafe!Verte42"); so.voit("Bonjour Sophie")
    so.va("#/rh/planning"); so.voit("Planning · tous les salariés"); so.voit("Qui est prévu quand"); so.voit("Camille Martin"); so.voit("votre propre planning : non modifiable")
    assert so.page.locator("table.plan tbody tr").count() == 6
    assert so.page.locator("button.pc[aria-label^='Camille Martin · mer. 25 nov.']").inner_text().split() == ["J7", "7", "h"]
    so.page.get_by_label("Période affichée").select_option("4"); so.page.wait_for_load_state("networkidle"); so.voit("Camille Martin"); so.photo("80-planning-rh-4-semaines")
    so.page.get_by_label("Période affichée").select_option("1"); so.page.wait_for_load_state("networkidle")
    so.clic("Horaires et cycles"); so.voit("Horaires journaliers (4)"); so.voit("Cycles (3)"); so.voit("Semaine 35 h"); so.photo("81-bibliotheque")
    so.clic("Nouvel horaire journalier"); so.champ("Code", "j6"); so.champ("Nom", "Journée 6 h")
    heures = so.page.locator("#dlg input[type=time]"); heures.nth(0).fill("09:00"); heures.nth(1).fill("12:00")
    so.clic("Ajouter une plage"); heures.nth(2).fill("13:00"); heures.nth(3).fill("16:00")
    so.page.locator("#dlg").get_by_label("Couleur").select_option("vert"); so.photo("82-nouvel-horaire", pleine=False)
    so.valider_fenetre("Créer"); so.voit("Horaires journaliers (5)"); so.voit("Journée 6 h"); so.voit("9 h – 12 h · 13 h – 16 h")
    # code déjà pris : le refus s'affiche dans la fenêtre
    so.clic("Nouvel horaire journalier"); so.champ("Code", "J7"); so.champ("Nom", "Doublon"); so.champ("Durée de travail", "7"); so.valider_fenetre("Créer"); so.voit("Ce code est déjà utilisé")
    so.page.locator("#dlg").get_by_role("button", name="Annuler").click()
    so.clic("Nouveau cycle"); so.champ("Nom", "Semaine de 4 jours")
    choix = so.page.locator("#dlg .cycle-sem select")
    for i in range(4): choix.nth(i).select_option("J8")
    choix.nth(4).select_option("")
    so.voit("32 h 00 par semaine"); so.clic("Ajouter une semaine"); so.voit("Semaine 2"); so.photo("83-nouveau-cycle", pleine=False)
    so.page.locator("#dlg .cycle-sem").nth(1).get_by_role("button", name="Retirer").click()
    so.valider_fenetre("Créer le cycle"); so.voit("Cycles (4)"); so.voit("Semaine de 4 jours")
    # --- RH : attribuer le cycle à Thomas à partir du 1er décembre
    so.va("#/rh/salaries"); so.page.locator("tr.cliquable", has_text="Thomas Petit").click(); so.voit("Temps de travail"); so.voit("Cycle « Semaine 35 h »")
    so.clic("Changer l'horaire à partir d'une date"); so.page.locator("#dlg").get_by_label("Organisation du temps").select_option(label="Cycle : Semaine de 4 jours")
    so.voit("1 semaine · 32 h 00 par semaine"); so.photo("84-horaire-cycle", pleine=False); so.valider_fenetre("Appliquer")
    so.voit("À partir du 01/12/2026"); so.voit("Cycle « Semaine de 4 jours »"); so.photo("85-fiche-cycle")
    # début de suivi : il ne se déplace pas à travers un mois clôturé (septembre l'est)
    so.champ("Début du suivi dans Kokolio", "2026-11-02"); so.clic("Enregistrer"); so.voit("Un mois clôturé se trouve entre")
    so.recharge()
    # --- RH : Nadia passe en présence automatique depuis le 2 novembre
    so.va("#/rh/salaries"); so.page.locator("tr.cliquable", has_text="Nadia Benali").click(); so.voit("Temps de travail")
    so.clic("Changer l'horaire à partir d'une date"); so.page.locator("#dlg input[type=date]").first.fill("2026-11-02")
    so.page.locator("#dlg").get_by_label("Présence").select_option("automatique"); so.valider_fenetre("Appliquer"); so.voit("présence automatique (ne pointe pas)")

    # --- Responsable, sur téléphone : planning de son équipe
    ju = Poste(nav, "julien").a(J, "10:00"); ju.activer("julien.bernard", codes["julien.bernard"], "Cactus#Mauve77"); ju.voit("Bonjour Julien")
    ju.va("#/equipe/planning"); ju.voit("Planning de l'équipe"); ju.voit("Thomas Petit")
    assert ju.page.locator("table.plan tbody tr").count() == 4
    ju.ne_voit_pas("Horaires et cycles")
    ju.page.locator("button.pc[aria-label^='Camille Martin · ven. 27 nov.']").click(); ju.voit("1 jour sélectionné"); ju.photo("86-planning-selection")
    ju.clic("Repos", exact=True); ju.voit("appliqué à 1 jour"); ju.voit("Camille Martin")
    assert "exc" in ju.page.locator("button.pc[aria-label^='Camille Martin · ven. 27 nov.']").get_attribute("class")
    # toute une ligne, puis on renonce
    ju.clic("Thomas Petit", exact=True); ju.voit("7 jours sélectionnés"); ju.clic("Tout désélectionner"); ju.ne_voit_pas("jours sélectionnés")
    # toute une colonne : samedi matin pour l'équipe, avec un horaire de la bibliothèque
    ju.clic("Sam 28", exact=True); ju.voit("4 jours sélectionnés"); ju.clic("Appliquer un horaire"); ju.voit("Horaires de la bibliothèque"); ju.photo("87-appliquer-horaire", pleine=False)
    ju.page.locator("#dlg button.choix-h", has_text="Matinée 4 h").click(); ju.page.wait_for_load_state("networkidle"); ju.voit("Thomas Petit")
    ju.voit("appliqué à 4 jours")
    assert ju.page.locator("button.pc[aria-label^='Thomas Petit · sam. 28 nov.']").inner_text().split()[0] == "M4"
    # copier une journée, la coller ailleurs
    ju.page.locator("button.pc[aria-label^='Thomas Petit · sam. 28 nov.']").click(); ju.clic("Copier", exact=True); ju.voit("Journée copiée"); ju.clic("Tout désélectionner")
    ju.page.locator("button.pc[aria-label^='Inès Roux · ven. 27 nov.']").click(); ju.clic("Coller « M4 »"); ju.voit("M4 : appliqué à 1 jour"); ju.voit("Inès Roux")
    assert ju.page.locator("button.pc[aria-label^='Inès Roux · ven. 27 nov.']").inner_text().split()[0] == "M4"
    ju.photo("88-planning-equipe")
    # recopie de la semaine sur la suivante
    ju.clic("Recopier sur la semaine suivante"); ju.voit("à modifier pour"); ju.valider_fenetre("Recopier"); ju.voit("Thomas Petit")
    assert ju.page.locator("button.pc[aria-label^='Camille Martin · ven. 4 déc.']").inner_text().split()[0] == "Repos"
    assert ju.page.locator("button.pc[aria-label^='Thomas Petit · sam. 5 déc.']").inner_text().split()[0] == "M4"
    # Thomas suit le cycle de quatre jours à partir du 1er décembre : son vendredi est au repos sans exception
    assert "exc" not in ju.page.locator("button.pc[aria-label^='Thomas Petit · ven. 4 déc.']").get_attribute("class")
    # retour au planning par défaut
    ju.page.locator("button.pc[aria-label^='Camille Martin · ven. 4 déc.']").click(); ju.clic("Par défaut"); ju.voit("revenu au planning par défaut"); ju.voit("Camille Martin")
    assert ju.page.locator("button.pc[aria-label^='Camille Martin · ven. 4 déc.']").inner_text().split()[0] == "J7"
    ju.photo("89-planning-semaine-suivante")

    # --- Salariée : son horaire du jour et son planning à venir
    ca = Poste(nav, "camille").a(J, "10:00"); ca.activer("camille.martin", codes["camille.martin"], "Bateau-Rouge-19")
    ca.voit("Prévu aujourd'hui : Journée 7 h"); ca.voit("9 h – 12 h 30 · 13 h 30 – 17 h"); ca.voit("Mon planning"); ca.voit("Repos · modifié"); ca.voit("Matinée 4 h"); ca.photo("90-salariee-planning")
    # --- Cadre en présence automatique : pas de pointeuse, des journées comptées
    na = Poste(nav, "nadia").a(J, "10:00"); na.activer("nadia.benali", codes["nadia.benali"], "Nuage=Violet63")
    na.voit("Présence automatique"); na.voit("Vous ne pointez pas"); na.ne_voit_pas("Pointer mon arrivée"); na.photo("91-presence-automatique")
    na.va("#/moi/heures"); na.voit("Mes heures"); na.photo("92-heures-presence-automatique")

    # --- Administrateur : travail de nuit, versions
    ad.va("#/admin/reglages"); ad.voit("Travail de nuit"); ad.page.get_by_label("Un départ pointé avant cette heure").fill("05:00"); ad.clic("Enregistrer les réglages"); ad.voit("Réglages enregistrés"); ad.voit("Travail de nuit")
    ca.recharge(); ca.va("#/moi/heures"); ca.clic("Ajouter une journée oubliée"); ca.voit("départ le lendemain"); ca.photo("93-correction-nuit", pleine=False)
    ad.va("#/admin/versions"); ad.voit("2.0.0 · Planification"); ad.voit("2.1.0 · Annualisation"); ad.voit("2.2.0 · Anomalies"); ad.photo("94-versions")
    so.va("#/rh/journal")
    for quoi in ["Planning modifié", "Cycle créé", "Horaire journalier créé"]: expect(so.page.locator(".entree", has_text=quoi).first).to_be_visible()
    so.voit("04/12 : retour au planning par défaut"); so.photo("95-journal-planning")

    # --- Annualisation (version 2.1) : la démonstration apporte une période et un cycle annualisé
    so.va("#/rh/synthese"); so.clic("Annualisation", exact=True); so.voit("Annualisation · tous les salariés"); so.voit("Annualisation 2026 · du 01/09/2026 au 31/12/2026"); so.voit("Camille Martin")
    assert so.page.locator("tr.cliquable").count() == 2
    so.photo("96-annualisation-equipe")
    so.page.locator("tr.cliquable", has_text="Camille Martin").click(); so.voit("Annualisation · Camille Martin"); so.voit("D'où vient l'objectif"); so.voit("Semaine par semaine"); so.voit("d'après le planning")
    so.clic("Fixer l'objectif"); so.champ("Objectif en heures", "520"); so.champ("Note", "Prorata convenu"); so.valider_fenetre("Enregistrer"); so.voit("fixé par les RH"); so.voit("Objectif fixé par les RH (Prorata convenu)")
    so.clic("Ajouter un ajustement"); so.champ("Heures (négatif pour retirer)", "-7"); so.champ("Motif", "Heures de délégation"); so.valider_fenetre("Ajouter"); so.voit("Heures de délégation"); so.photo("97-annualisation-salarie")
    so.clic("‹ Annualisation de l'équipe"); so.voit("objectif fixé"); so.clic("Nouvelle période"); so.champ("Nom", "Annualisation 2027")
    so.page.locator("#dlg input[type=date]").nth(0).fill("2027-01-01"); so.page.locator("#dlg input[type=date]").nth(1).fill("2027-12-31"); so.valider_fenetre("Enregistrer")
    expect(so.page.locator(".carte .ligne", has_text="Annualisation 2027").first).to_be_visible()
    so.clic("Nouvelle période"); so.champ("Nom", "Chevauchement"); so.valider_fenetre("Enregistrer"); so.voit("Cette période en chevauche une autre"); so.page.locator("#dlg").get_by_role("button", name="Annuler").click()
    # la salariée voit sa propre annualisation depuis « Année »
    ca.recharge(); ca.va("#/moi/annee"); ca.clic("Annualisation", exact=True); ca.voit("Mon annualisation"); ca.voit("Objectif fixé par les RH"); ca.voit("Reste à faire"); ca.ne_voit_pas("Fixer l'objectif"); ca.photo("98-mon-annualisation")
    # le responsable consulte son équipe, sans rien pouvoir fixer
    ju.va("#/equipe/synthese"); ju.clic("Annualisation", exact=True); ju.voit("Annualisation de l'équipe"); ju.voit("Camille Martin"); ju.ne_voit_pas("Nouvelle période")
    ju.page.locator("tr.cliquable", has_text="Camille Martin").click(); ju.voit("Annualisation · Camille Martin"); ju.ne_voit_pas("Ajouter un ajustement"); ju.photo("99-annualisation-responsable")
    # l'administrateur règle l'effet d'un motif d'absence sur l'objectif
    ad.va("#/admin/motifs"); ad.page.locator("tr.cliquable", has_text="Formation").click()
    ad.page.locator("#dlg").get_by_label("Pour les salariés annualisés").select_option("realise"); ad.valider_fenetre("Enregistrer"); ad.voit("Motif enregistré")
    expect(ad.page.locator("tr.cliquable", has_text="Formation")).to_contain_text("Réalisé")

    # --- Anomalies et présents (version 2.2)
    ju.va("#/equipe/synthese"); ju.clic("Anomalies", exact=True); ju.voit("Anomalies de l'équipe"); ju.voit("Thomas Petit"); ju.voit("Départ non pointé"); ju.photo("100-anomalies")
    ju.page.get_by_label("Niveau").select_option("info"); ju.page.wait_for_timeout(150)
    ju.page.locator(".jour", has_text="Pour information").first.get_by_role("button", name="Acquitter", exact=True).click()
    ju.page.locator("#dlg textarea").fill("Vu avec le salarié"); ju.valider_fenetre("Acquitter"); ju.voit("anomalie acquittée")
    ju.page.get_by_label("Traitement").select_option("acquittees"); ju.voit("Vu avec le salarié"); ju.photo("101-anomalie-acquittee")
    ju.clic("Annuler l'acquittement"); ju.voit("acquittement annulé")
    # tableau des présents : Camille pointe, le responsable la voit en poste ; les autres sont attendus ou sans pointage
    ca.va("#/moi/pointer"); ca.clic("Pointer mon arrivée"); ca.voit("Présent depuis 10:00")
    ju.va("#/equipe/presents"); ju.voit("Présents dans l'équipe"); ju.voit("En poste (1)"); ju.voit("Attendus, pas encore pointés (2)"); ju.voit("en retard"); ju.voit("Présence automatique (ne pointent pas) (1)"); ju.photo("102-presents")
    so.va("#/rh/presents"); so.voit("Présents · tous les salariés"); so.voit("En poste (1)"); so.photo("103-presents-rh")
    so.page.evaluate("() => { window.print = () => { window.__liste = document.querySelector('.evacuation').innerText; }; }")
    so.clic("Liste d'évacuation"); so.page.wait_for_timeout(200)
    liste = so.page.evaluate("() => window.__liste")
    assert "Liste d'évacuation" in liste and "Camille Martin" in liste and "1 personne en poste sur site" in liste and "présence automatique" in liste, liste
    so.page.evaluate("() => { window.dispatchEvent(new Event('afterprint')); }"); so.ne_voit_pas("Liste d'évacuation · ")
    # réglage d'une tolérance par l'administrateur
    ad.va("#/admin/reglages"); ad.voit("Anomalies liées à l'horaire"); ad.page.get_by_label("Retard toléré (min)").fill("10"); ad.clic("Enregistrer les réglages"); ad.voit("Réglages enregistrés")
    nav.close()
bilan(); print("étape 6 terminée")
