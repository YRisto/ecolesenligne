# corpus final des répliques : brut.json + cas particuliers + variantes de général -> lignes.json [{k,who,v,t}]
import re,json,subprocess
r0=subprocess.run(['python3','extrait.py'],capture_output=True,text=True);print(r0.stdout[-900:],r0.stderr[-300:])
import os
SRC='/home/claude/jeu/src/';PG=os.environ.get('PAGE')
s=open(PG or SRC+'story.js').read();d=open(PG or SRC+'data.js').read();e=open(PG or SRC+'engine.js').read()
D=json.load(open('/home/claude/voix/distribution.json'))
L=[tuple(x) for x in json.load(open('brut.json'))]
S=lambda t:json.loads('"'+t+'"')
STR=r'"((?:[^"\\]|\\.)*)"'
L+= [('renaud',S(t)) for t in re.findall(r'renaud_rally\('+STR+r'\)',s)]
i=s.index(' grolard(){');L+=[('grolard',S(t)) for t in re.findall(r'out\('+STR+r'\)',s[i:i+6000])]
m=re.search(r'const h=([^;]*?);\s*say\(\[\[null,"La poterne',s,re.S);L+=[(None,S(t)) for t in re.findall(STR,m.group(1))]
# locuteurs entre guillemets doubles (prologue) et répliques dites par l'un ou l'autre compagnon : who('a','b')
NM=set(re.findall(r'([a-z_0-9]+):"',re.search(r'const NAMES=\{([^}]*)\}',e).group(1)))|{'Le faussaire'}
dq=[(w,S(t)) for w,t in re.findall(r'\[\s*"([^"]{2,30})"\s*,\s*'+STR,s) if not w.startswith('«')]
L+=[x for x in dq if x[0] in NM];print('locuteurs entre guillemets ignorés (à vérifier) :',sorted(set(w for w,t in dq if w not in NM and re.search(r'[.!?…]$',t) and len(t)>25))[:12])
ww=re.findall(r"\[who\('([a-z]+)','([a-z]+)'\),\s*"+STR,s);assert len(ww)==len(re.findall(r"\[who\(",s)),len(ww)
for a,b,t in ww:L+=[(a,S(t)),(b,S(t))]
D['Le faussaire']=29   # non distribué : voix du prévôt de Karst, à l'autre bout du jeu (à confirmer)
# héros : plaidoirie et réplique du chancelier
hb=d[d.index('HEROES={'):d.index('const LEVELS')]
L+=[('aldric',S(t)) for t in re.findall(r'line:'+STR,hb)]+[('chancelier',S(t)) for t in re.findall(r'rep:'+STR,hb)]
# auberges
for m in re.finditer(r'"inn":\{(.*?)\}\}',d):
    for b in re.findall(r'\{[^{}]*\}',m.group(1)):
        w=re.search(r'"who":"([a-z]+)"',b);t=re.search(r'"txt":'+STR,b);n=re.search(r'"night":'+STR,b)
        if t:L.append((w.group(1) if w else None,S(t.group(1))))
        if n:L.append((None,S(n.group(1))))
L+=[(None,S(t)) for t in re.findall(r'n\.txt\|\|'+STR,e)]
# boutiques
b=d[d.index('SHOPTALK='):];b=b[:b.index('};')]
SH={}
for m in re.finditer(r'\n ([a-z_]+):\{(.*)',b):
    for t in re.findall(STR,m.group(2)):L.append((m.group(1),S(t)));SH[m.group(1)]=SH.get(m.group(1),0)+1
# échoppes mises en scène (page publiée) : rumeurs, marchandage, services, auberges — dits par le marchand (shopSay)
if os.path.exists('shop_site.json') and PG:
    J=json.load(open('shop_site.json'));ids=J['ids'];n0=len(L)
    L=[x for x in L if not (x[0] is None and any(x[1]==i.get(f) for i in J['inns'] for f in ('txt','night')))]   # auberges : plus dites par la chronique
    for k,v in J['RUM'].items():L+=[(k,t) for t in v]
    L+=[(k,t) for k,t in J['SHREFT'].items()]
    for i in ids:
        for m in J['SHBARG'].values():L+=[(i,t) for t in m]
        L+=[(i,"Soupesez, c'est permis."),(i,"Regardez de près, c'est du solide.")]   # fin des phrases à prix : seule la remarque est dite
    for i in J['inns']:
        L+=[('aubergiste',i[f]) for f in ('txt','night') if i.get(f)]+[('aubergiste',t) for t in i.get('rumor',[])]
    sv=[json.loads('"'+t+'"') for t in re.findall(r'(?:return|\?|:|\|\|)\s*'+STR,J['serv'][J['serv'].index('f:()=>'):]) if len(t)>20]
    MAP={'Voilà. Elle coupe':['forgeronne'],'Passée à la meule':['fulbert'],'Rivetée deux fois':['forgeronne'],'Doublée de toile':['tailleuse'],'Tenez-vous tranquille':['barnabe'],'Voilà, mon petit':['goupil'],'Bandé serré':['herboriste'],
         'À ras bord':['herboriste','fulbert','rodeur'],'Allez en paix':['barnabe'],'Tracé de mémoire':['rodeur'],'Dressé par un géomètre':['fulbert'],'La nuit passe sans alerte':['aubergiste'],'De la soupe, du lard':['aubergiste']}
    for t in sv:
        w=[v for k,v in MAP.items() if t.startswith(k)]
        if w:L+=[(i,t) for i in w[0]]
        elif not t.startswith(('Puissance','Protection','Rend ','La jauge','Tout le souffle','Toute la carte','Vie et souffle','Panser','Remplir','Bénédiction','Un plan','Une nuit','Un repas')):print('service non attribué:',t[:70])
    print('échoppes : +',len(L)-n0,'répliques')
# variantes des trois autres généraux
H=re.findall(r'\n ([a-z]+):\{n:"([^"]+)",full:"([^"]+)",sur:"([^"]+)"',hb);base=list(L)
for k,n,full,sur in H:
    if k=='aldric':continue
    for w,t in base:
        t2=t.replace('Aldric de Morvane',full).replace('Aldric',n).replace('Morvane',sur)
        if t2!=t:L.append((w,t2))
def key(w,t):
    h=2166136261
    for c in (w or '')+'|'+t:
        assert ord(c)<65536;h^=ord(c);h=(h*16777619)&0xffffffff
    return '%08x'%h
out=[];seen={}
for w,t in L:
    if '<' in t or len(t)<4:continue
    k=key(w,t)
    if k in seen:
        assert seen[k]==(w,t),('collision',k);continue
    seen[k]=(w,t);v=D['narr' if w is None else w];out.append(dict(k=k,who=w or 'narr',v=v,t=t))
json.dump(out,open('lignes.json','w'),ensure_ascii=False,indent=0)
tot=sum(len(x['t']) for x in out);print(len(out),'répliques,',tot,'car. ≈ %.0f min de son'%(tot/15/60),'| boutiques',SH,'| variantes généraux',len(L)-len(base))
by={}
for x in out:by[x['who']]=by.get(x['who'],0)+1
print(sorted(by.items(),key=lambda a:-a[1]))
print('sans voix:',[w for w in by if w not in D])
