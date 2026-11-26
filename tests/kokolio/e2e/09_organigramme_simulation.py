# Organigramme sur la page d'accueil de chacun, validation côté RH, simulation d'activité (mode démonstration).
# Le scénario de la simulation change d'une installation à l'autre (il dépend des identifiants internes) : on vérifie des ordres de grandeur, pas des valeurs.
import sys, os, re, json
sys.path.insert(0, os.path.dirname(__file__))
from outils import *

CODE = sys.argv[1]
MDP = "Tableau-Bleu-2026"
J, J1 = "2026-11-26", "2026-11-27"   # un jeudi, puis le vendredi

# Une entreprise inventée de 23 personnes : une directrice générale, deux directions, trois responsables, deux chefs d'équipe.
P = [("Direction", "Dora", "D01", "Direction", "Directrice générale", ""),
     ("Commerce", "Alain", "A01", "Direction commerciale", "Directeur commercial", "D01"), ("Services", "Aline", "A02", "Services", "Directrice des services", "D01"),
     ("Assistante", "Zoé", "Z01", "Direction", "Assistante de direction", "D01"),
     ("Ventes", "Bruno", "B11", "Ventes", "Responsable des ventes", "A01"), ("Comptes", "Bella", "B12", "Grands comptes", "Responsable grands comptes", "A01"),
     ("Support", "Boris", "B21", "Support", "Responsable support", "A02"),
     ("Nord", "Carla", "C111", "Ventes Nord", "Cheffe d'équipe", "B11"), ("Sud", "Cyril", "C112", "Ventes Sud", "Chef d'équipe", "B11")]
P += [("Nord", f"Sal{k}", f"N{k}", "Ventes Nord", "Vendeur", "C111") for k in range(1, 5)] + [("Sud", f"Sal{k}", f"S{k}", "Ventes Sud", "Vendeur", "C112") for k in range(1, 4)]
P += [("Comptes", f"Sal{k}", f"G{k}", "Grands comptes", "Chargé de comptes", "B12") for k in range(1, 4)] + [("Support", f"Sal{k}", f"U{k}", "Support", "Conseiller", "B21") for k in range(1, 5)]
CSV = "nom;prenom;matricule;equipe;poste;matricule_responsable;date_entree;regime;heures_hebdo;debut_suivi\n" + "\n".join(
    f"{n};{p};{m};{e};{j};{r};01/01/2022;horaire;35;25/11/2026" for n, p, m, e, j, r in P)

def appel(poste, route, corps=None, api="/api/kokolio/"):
    """Un appel direct à l'API depuis la page (même session, même horloge) : pour lire un compteur sans dépendre de la mise en page."""
    r = poste.page.evaluate("""async ([u, b]) => { const r = await fetch(u, { method: 'POST', headers: { 'content-type': 'application/json', 'x-kokolio': '1' }, body: JSON.stringify(b || {}) }); return r.json(); }""",
                            [api + route, corps])
    assert r.get("ok"), f"{route} → {r}"
    return r["data"]

with sync_playwright() as p:
    nav = p.chromium.launch()
    # ---- comme la production en cours d'essai : mode démonstration, puis l'import des fiches avec le matricule du responsable
    ad = Poste(nav, "admin", BUREAU).a(J, "10:30"); ad.activer("admin", CODE, MDP); ad.voit("Bonjour Administrateur")
    ad.va("#/admin/etat"); ad.clic("Charger les données de démonstration"); ad.valider_fenetre("Charger"); ad.voit("Ces codes ne seront plus affichés", delai=30000); ad.clic("Terminé")
    ad.va("#/rh/import"); ad.voit("Préparer le fichier"); ad.voit("matricule_responsable")
    ad.page.locator("textarea").fill(CSV); ad.clic("Vérifier le fichier"); ad.voit("À créer"); ad.photo("110-import-hierarchie")
    ad.clic("Importer 23 lignes"); ad.voit("Ces codes ne seront plus affichés", delai=30000)
    codes = {b.locator(".mono").first.inner_text(): b.locator(".code-act").inner_text() for b in ad.page.locator(".bons .bon").all()}
    assert len(codes) == 23, len(codes)
    ad.clic("Terminé")

    # ---- l'organigramme sur la page d'accueil : la direction générale, puis trois étages à déplier
    ad.ouvre("/kokolio"); ad.voit("Organigramme"); ad.voit("Dora Direction"); ad.voit("Directrice générale"); ad.voit("22 personnes, dont 3 en direct")
    ad.voit("Alain Commerce"); ad.voit("14 personnes, dont 2 en direct"); ad.voit("Aline Services"); ad.voit("5 personnes, dont 1 en direct")
    assert not ad.page.get_by_text("Bruno Ventes").first.is_visible() and not ad.page.get_by_text("Carla Nord").first.is_visible()
    ad.page.locator(".org summary", has_text="Alain Commerce").click(); ad.voit("Bruno Ventes"); ad.voit("Bella Comptes"); ad.voit("9 personnes, dont 2 en direct")
    assert not ad.page.get_by_text("Carla Nord").first.is_visible()
    ad.page.locator(".org summary", has_text="Bruno Ventes").click(); ad.voit("Carla Nord"); ad.voit("Cyril Sud"); ad.voit("Cheffe d'équipe"); ad.photo("111-organigramme-accueil")
    # la structure seulement : aucun salarié qui n'encadre personne n'y figure ; les équipes de la démonstration, pas encore rattachées, sont signalées
    ad.ne_voit_pas("Sal1 Nord"); ad.ne_voit_pas("Zoé Assistante")
    ad.voit("pas encore rattachée")
    assert ad.page.locator(".org-noeud.ici").count() == 0   # l'administrateur n'est rattaché à personne

    # ---- un vendeur : sa page d'accueil est l'écran de pointage ; sa ligne hiérarchique y figure, l'organigramme complet est à un geste
    ve = Poste(nav, "vendeur").a(J, "10:35"); ve.activer("sal1.nord", codes["sal1.nord"], "Girafe!Verte42"); ve.voit("Pointer mon arrivée")
    ve.voit("Votre ligne hiérarchique"); ve.voit("Carla Nord"); ve.voit("Bruno Ventes"); ve.voit("Alain Commerce"); ve.voit("Dora Direction"); ve.voit("Vous", exact=True)
    ligne = ve.page.locator(".org-fil").inner_text().replace("\n", " ")
    assert ligne.index("Dora Direction") < ligne.index("Alain Commerce") < ligne.index("Bruno Ventes") < ligne.index("Carla Nord") < ligne.rindex("Vous"), ligne
    ve.page.locator("section.organigramme").scroll_into_view_if_needed(); ve.photo("112-pointer-ligne-hierarchique")
    ve.clic("Voir l'organigramme de l'entreprise"); assert ve.page.evaluate("location.hash") == "#/organigramme"
    ve.voit("Carla Nord"); ve.voit("Cyril Sud")   # sa branche est dépliée d'emblée
    assert ve.page.locator(".org-noeud.ici").count() == 4, ve.page.locator(".org-noeud.ici").count()
    assert not ve.page.get_by_text("Boris Support").first.is_visible()   # les autres branches restent repliées
    ve.ne_voit_pas("Sal2 Nord"); ve.ne_voit_pas("Sal1 Sud"); ve.photo("113-organigramme-salarie")
    ve.clic("‹ Retour"); ve.voit("Pointer mon arrivée")

    # ---- un responsable : l'organigramme est sur son accueil, sa place marquée
    br = Poste(nav, "bruno").a(J, "10:40"); br.activer("bruno.ventes", codes["bruno.ventes"], "Cactus#Mauve77"); br.voit("Bonjour Bruno")
    br.voit("Organigramme"); br.voit("Carla Nord"); assert br.page.locator(".org-noeud.ici").count() == 3
    assert "Bruno Ventes" in br.page.locator(".org-noeud.ici").last.inner_text(); br.photo("114-organigramme-responsable")

    # ---- la simulation d'activité : permise ici parce que le mode démonstration est actif
    ad.va("#/admin/test"); ad.voit("Simulation d'activité"); ad.voit("jamais mise en marche"); ad.voit("Fiches qui seraient simulées"); ad.photo("115-simulation-avant")
    ad.clic("Mettre la simulation en marche"); ad.voit("Arrêter la simulation", delai=90000); ad.voit("en marche", exact=True); ad.voit("Fiches simulées"); ad.voit(", par admin")
    ad.photo("116-simulation-en-marche")
    sim = appel(ad, "admin/sim")
    assert sim["on"] and sim["enrolled"] >= 21 and sim["state"]["total"] > 100, sim
    # hier existe : chacun a sa journée du 25 ; ce matin, la plupart sont arrivés ; les deux comptes activés à la main n'ont rien reçu
    pr = appel(ad, "team/presence", {"scope": "all"})
    en_poste = pr["tiles"]["on_site"] + pr["tiles"]["remote"] + pr["tiles"].get("travel", 0)
    assert en_poste >= 14, pr["tiles"]
    for nom in ("Sal1 Nord", "Bruno Ventes"):
        assert [r["status"] for r in pr["rows"] if r["name"] == nom] == ["attendu"], [r for r in pr["rows"] if r["name"] == nom]
    ad.va("#/rh/presents"); ad.voit("Présents · tous les salariés"); ad.photo("117-presents-simulation")
    ad.va("#/rh/synthese"); ad.page.get_by_text("Sal2 Nord").first.click(); ad.voit("Journées · novembre 2026"); ad.photo("117b-journees-simulees")

    # ---- la journée passe : un passage en fin d'après-midi, puis le soir ; tout le monde est reparti, sauf départ oublié
    ad.a(J, "17:50").va("#/admin/etat"); ad.va("#/admin/test"); ad.clic("Faire avancer maintenant"); ad.voit("événements joués.", delai=60000)
    ad.a(J, "19:40").va("#/admin/etat"); ad.va("#/admin/test"); ad.clic("Faire avancer maintenant"); ad.voit("événements joués.", delai=60000)
    ad.clic("Faire avancer maintenant"); ad.voit("La simulation est à jour.", delai=30000)
    pr = appel(ad, "team/presence", {"scope": "all"})
    assert pr["tiles"]["on_site"] + pr["tiles"]["remote"] + pr["tiles"].get("travel", 0) <= 3, pr["tiles"]
    assert sum(1 for r in pr["rows"] if r["status"] == "sorti") >= 14, pr["tiles"]

    # ---- le lendemain : il suffit qu'une personne ouvre l'outil pour que la simulation rattrape le temps écoulé
    with br.page.expect_response(lambda r: r.url.endswith("/sim/tick"), timeout=60000) as rep:
        br.a(J1, "12:30").recharge()
    passage = rep.value.json()["data"]
    assert passage["on"] and passage["passages"] >= 1 and passage["faits"].get("punch", 0) > 20, passage
    assert set(passage) <= {"on", "due", "passages", "last", "faits", "refus"}, passage   # des compteurs, aucune donnée
    # son équipe (deux chefs d'équipe simulés) l'attend : la simulation ne valide rien à la place d'un responsable qui a activé son compte
    br.va("#/equipe/validation"); expect(br.page.get_by_text(re.compile("Carla Nord|Cyril Sud")).first).to_be_visible(); br.photo("118-validation-responsable")
    # les responsables simulés, eux, ont validé leurs équipes ce matin ; côté RH, seul ce qui n'a pas de responsable remonte
    rh, tout = appel(ad.a(J1, "12:35"), "team/pending", {"scope": "rh"}), appel(ad, "team/pending", {"scope": "all"})
    assert rh["total_days"] < tout["total_days"] and rh["encadres"] >= 22, (rh["total_days"], tout["total_days"], rh["encadres"])
    assert all(not s.get("manager_name") for s in rh["summary"]), rh["summary"]
    ad.va("#/rh/validation"); ad.voit("Validation · à traiter par les RH"); ad.photo("119-validation-rh-a-traiter")
    ad.va("#/rh/journal"); expect(ad.page.locator(".quoi", has_text="Simulation d'activité mise en marche").first).to_be_visible()
    expect(ad.page.locator(".quoi", has_text="Journées validées").first).to_be_visible(); ad.photo("120-journal-simulation")

    # ---- arrêt : plus rien ne se joue ; les pages ouvertes ne déclenchent plus rien
    ad.va("#/admin/test"); ad.clic("Arrêter la simulation"); ad.voit("Simulation arrêtée."); ad.voit("arrêtée le"); ad.photo("121-simulation-arretee")
    arret = appel(ad.a(J1, "18:30"), "sim/tick")
    assert arret["on"] is False and arret["passages"] == 0 and arret["faits"] == {}, arret
    assert appel(ad, "public/info")["simulation"] is False

    bilan()
    print("étape 9 terminée")
    sys.exit(1 if erreurs else 0)
