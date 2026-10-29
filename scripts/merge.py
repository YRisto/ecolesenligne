import json, glob, re, unicodedata, os
SRC="/tmp/claude-0/-home-claude/5f8c2c5d-c66a-53e8-9892-cd67c7bcfa8b/scratchpad/collecte"
def slug(s):
    s=unicodedata.normalize("NFKD",s).encode("ascii","ignore").decode().lower(); return re.sub(r"[^a-z0-9]+","-",s).strip("-")
NOMS={"ascor":"ASCOR","atelierdeschefs":"L'Atelier des Chefs","cef":"Centre Européen de Formation","cned":"CNED","enaco":"ENACO","entheor":"Entheor","hippocratus":"Hippocratus","iacademie":"Icademie","les2rives":"Les 2 Rives","studi":"Studi","youschool":"YouSchool","educatel":"Educatel","lignes":"Lignes et Formations","ifsa":"IFSA","ecolechezsoi":"École Chez Soi","minerve":"Cours Minerve","edaa":"EDAA","linguaphone":"Linguaphone","cned_langues":"CNED","langues_concurrent":None}
PARTENAIRES={"cef","enaco","entheor","hippocratus","educatel","lignes","ifsa","ecolechezsoi","minerve","edaa"}
GROUPE={"educatel":"Skill&You","lignes":"Skill&You","ifsa":"Skill&You","ecolechezsoi":"Skill&You","minerve":"Skill&You","edaa":"Skill&You","studi":"Galileo Global Education","les2rives":"Adecco","iacademie":"Eureka Education"}
codes={f["code"] for f in json.load(open("data/formations.json"))}
ecoles, offres = [], []
for path in sorted(glob.glob(f"{SRC}/*.json"), key=lambda p: (os.path.basename(p).startswith("cned_"), p)):
    key=os.path.basename(path)[:-5]
    if key not in NOMS: continue
    d=json.load(open(path)); d=d[0] if isinstance(d,list) else d
    if key=="cned_langues":
        cned=next((e for e in ecoles if e["slug"]=="cned"),None)
        for o in d.get("offres",[]):
            c=o.get("code")
            if c in codes and not any(x["ecole"]=="cned" and x["formation"]==c for x in offres):
                p=o.get("prix_total_eur"); h=o.get("duree_heures"); m_=o.get("mensualite_eur")
                offres.append({"ecole":"cned","formation":c,"intitule_ecole":o.get("intitule_ecole",""),"url":o.get("url",""),"prix_total_eur":int(p) if isinstance(p,(int,float)) and p>0 else None,"prix_detail":o.get("prix_detail",""),"mensualite_eur":int(m_) if isinstance(m_,(int,float)) and m_>0 else None,"financement":[f for f in (o.get("financement") or []) if f][:6],"duree_heures":int(h) if isinstance(h,(int,float)) and h>0 else None,"duree_acces":o.get("duree_acces",""),"diplome":o.get("diplome",""),"rncp":o.get("rncp",""),"stage":o.get("stage",""),"taux_reussite":o.get("taux_reussite",""),"specificites":o.get("specificites","")})
        continue
    if key=="langues_concurrent":
        key=slug(d.get("ecole","concurrent")); NOMS[key]=d.get("ecole","")
    avis=d.get("avis") or {}
    e={"slug":key,"nom":NOMS[key],"groupe":GROUPE.get(key,""),"site":d.get("site",""),"partenaire":key in PARTENAIRES,
       "avis":{"source":avis.get("source",""),"note":avis.get("note"),"nombre":avis.get("nombre"),"url":avis.get("url","")} if avis.get("note") else None,
       "garantie":d.get("garantie",""),"accompagnement":d.get("accompagnement",""),"supports":d.get("supports",""),"modalites":d.get("modalites",""),
       "preparation_examen":d.get("preparation_examen",""),"taux_reussite":d.get("taux_reussite","")}
    ecoles.append(e)
    seen=set()
    for o in d.get("offres",[]):
        c=o.get("code")
        if c not in codes or c in seen: continue
        seen.add(c)
        p=o.get("prix_total_eur"); p=int(p) if isinstance(p,(int,float)) and p>0 else None
        h=o.get("duree_heures"); h=int(h) if isinstance(h,(int,float)) and h>0 else None
        m=o.get("mensualite_eur"); m=int(m) if isinstance(m,(int,float)) and m>0 else None
        offres.append({"ecole":key,"formation":c,"intitule_ecole":o.get("intitule_ecole",""),"url":o.get("url",""),"prix_total_eur":p,"prix_detail":o.get("prix_detail",""),"mensualite_eur":m,
            "financement":[f for f in (o.get("financement") or []) if f][:6],"duree_heures":h,"duree_acces":o.get("duree_acces",""),"diplome":o.get("diplome",""),"rncp":o.get("rncp",""),
            "stage":o.get("stage",""),"taux_reussite":o.get("taux_reussite",""),"specificites":o.get("specificites","")})
json.dump(ecoles,open("data/ecoles.json","w"),ensure_ascii=False,indent=1); json.dump(offres,open("data/offres.json","w"),ensure_ascii=False,indent=1)
# synthèses
F=json.load(open("data/formations.json"))
for f in F:
    p=f"data/syntheses/{f['code']}.json"
    if os.path.exists(p):
        s=json.load(open(p)); f["synthese"]={k:s.get(k) for k in ("metiers","missions","conditions","salaire","evolution","sources")}
json.dump(F,open("data/formations.json","w"),ensure_ascii=False,indent=1)
from collections import Counter
print(len(ecoles),"écoles",len(offres),"offres", sum(1 for f in F if f["synthese"]),"synthèses")
c=Counter(o["formation"] for o in offres); print("formations sans offre:", [f["code"] for f in F if c[f["code"]]==0])
