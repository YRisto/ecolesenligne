# Mise en route : activation de l'administrateur, réglages, import, remise des codes.
import sys, json, os
sys.path.insert(0, os.path.dirname(__file__))
from outils import *

CODE = sys.argv[1]
MDP = {"admin": "Tableau-Bleu-2026", "sophie.durand": "Girafe!Verte42", "julien.bernard": "Cactus#Mauve77", "camille.martin": "Bateau-Rouge-19", "leo.petit": "Lampe+Orange58", "nadia.roux": "Nuage=Violet63"}
CSV = """identifiant;nom;prenom;matricule;email;equipe;poste;responsable;date_entree;regime;heures_hebdo;jours_travailles;pause;solde_cp;droits_rtt;role
sophie.durand;Durand;Sophie;0001;;RH;Responsable RH;;01/03/2019;forfait;;lun-ven;;12;10;rh
julien.bernard;Bernard;Julien;0004;;Admissions;Responsable des admissions;;15/01/2020;forfait;;lun-ven;;8,5;10;
camille.martin;Martin;Camille;0012;camille@exemple.fr;Admissions;Conseillère en formation;julien.bernard;01/09/2023;horaire;35;lun-ven;45;6;0;
leo.petit;Petit;Léo;0015;;Admissions;Conseiller en formation;julien.bernard;01/02/2024;horaire;28;lun-jeu;45;4;0;
nadia.roux;Roux;Nadia;0020;;Pédagogie;Formatrice;sophie.durand;01/06/2022;horaire;35;lun-ven;60;10;0;
"""
with sync_playwright() as p:
    nav = p.chromium.launch()
    ad = Poste(nav, "admin", BUREAU).a("2026-11-02", "08:00")
    ad.ouvre(); ad.voit("Connexion"); ad.photo("01-connexion")
    # mauvais mot de passe : message identique à un compte inconnu
    ad.champ("Identifiant", "admin"); ad.champ("Mot de passe", "nimporte-quoi-1", exact=True); ad.clic("Se connecter"); ad.voit("Identifiant ou mot de passe incorrect")
    ad.activer("admin", CODE, MDP["admin"])
    ad.voit("Bonjour Administrateur"); ad.photo("02-accueil-admin")
    assert ad.page.locator("button.mode").count() == 4, "quatre espaces attendus pour l'administrateur"
    # réglages : mise en service au 2 novembre
    ad.va("#/admin/reglages"); ad.voit("Mise en service")
    ad.champ("Premier jour de pointage", "2026-11-02"); ad.clic("Enregistrer les réglages"); ad.voit("Réglages enregistrés"); ad.photo("03-reglages")
    # import
    ad.va("#/rh/import"); ad.voit("Préparer le fichier")
    ad.page.locator("textarea").fill(CSV.replace("julien.bernard;01/09/2023", "personne;32/13/2023")); ad.clic("Vérifier le fichier"); ad.voit("tout ou rien"); ad.photo("04-import-erreurs")
    ad.page.locator("textarea").fill(CSV); ad.clic("Vérifier le fichier"); ad.voit("À créer"); ad.photo("05-import-apercu")
    ad.clic("Importer 5 lignes"); ad.voit("Ces codes ne seront plus affichés"); ad.photo("06-codes")
    codes = {}
    for bon in ad.page.locator(".bons .bon").all():
        codes[bon.locator(".mono").first.inner_text()] = bon.locator(".code-act").inner_text()
    assert len(codes) == 5, codes
    ad.clic("Terminé"); ad.voit("Comptes activés"); ad.photo("07-salaries")
    json.dump({"codes": codes, "mdp": MDP}, open("/tmp/kk-e2e.json", "w"))
    # chacun active son compte sur son téléphone
    for login in codes:
        s = Poste(nav, login).a("2026-11-02", "08:30")
        s.activer(login, codes[login], MDP[login])
        s.voit("Pointer mon arrivée" if login in ("camille.martin", "leo.petit", "nadia.roux") else "Bonjour")
        s.ctx.storage_state(path=f"/tmp/kk-etat-{login}.json")
        if login == "camille.martin": s.photo("08-pointer-vide")
        if login == "julien.bernard": s.photo("09-accueil-responsable")
        s.ctx.close()
    ad.ctx.storage_state(path="/tmp/kk-etat-admin.json")
    nav.close()
bilan(); print("étape 1 terminée")
