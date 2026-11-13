# extrait toutes les répliques parlées du jeu : (locuteur, texte) -> lignes.json ; signale les expressions non littérales
import re,json,sys
SRC='/home/claude/jeu/src/'
import os
names=set(re.findall(r'([a-z_0-9]+):"',re.search(r'const NAMES=\{([^}]*)\}',open(os.environ.get('PAGE') or SRC+'engine.js').read()).group(1)))
def scan(s,fn,out,flag):
    for m in re.finditer(r"\[\s*(?:'([a-z_0-9]+)'|(null))\s*,",s):
        who=m.group(1) or None
        if who and who not in names:continue
        i=m.end();dep=0;lits=[];odd=False;start=i
        while i<len(s):
            c=s[i]
            if c=='"':
                j=i+1
                while s[j]!='"':j+=2 if s[j]=='\\' else 1
                lits.append(json.loads(s[i:j+1]));i=j+1;continue
            if c=="'":
                j=i+1
                while s[j]!="'":j+=2 if s[j]=='\\' else 1
                i=j+1;continue
            if c=='`':odd=True
            if c in '([{':
                if c=='[' and dep==0:break       # tableau de choix
                dep+=1
            elif c in ')]}':
                if dep==0:break
                dep-=1
            elif c==',' and dep==0:break
            elif c=='+' and dep==0:odd=True
            i+=1
        ex=s[start:i].strip()
        if not lits or odd or (not ex.startswith('"') and '?' not in ex):
            if not(ex.startswith('"')) :flag.append((fn,who,ex[:160]))
            if not lits:continue
        for t in lits:
            if len(t)>3:out.append((who,t))
out=[];flag=[]
import os
ONE=os.environ.get('PAGE')
for fn in ([ONE] if ONE else ['story.js','engine.js','ui.js','data.js']):scan(open(fn if ONE else SRC+fn).read(),fn,out,flag)
seen=set();L=[]
for w,t in out:
    if (w,t) not in seen:seen.add((w,t));L.append([w,t])
json.dump(L,open('brut.json','w'),ensure_ascii=False,indent=0)
print(len(out),'occurrences,',len(L),'uniques,',sum(len(t) for _,t in L),'car.')
print('--- à examiner',len(flag))
for f in flag:print(f[0],f[1],'|',f[2])
