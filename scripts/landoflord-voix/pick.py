# retient, pour chaque réplique refaite, la prise la mieux retranscrite (l'originale est gardée dans gen/orig/)
import json,os,shutil,sys
from bilan import sc
R=json.load(open('ctl.json'));L={x['k']:x for x in json.load(open('lignes.json'))};redo=json.load(open('redo.json'));os.makedirs('gen/orig',exist_ok=True)
sufs=['']+sys.argv[1:];ch=0;left=[]
for k in redo:
    t=L[k]['t'].replace('1247','mille deux cent quarante-sept').replace('1239','mille deux cent trente-neuf')
    c=[(max(sc(t,R[k+s]['h']),sc(L[k]['t'],R[k+s]['h'])),-len(s),s) for s in sufs if k+s in R];b=max(c);s0=c[0][0]
    if b[2] and b[0]>s0+.02:
        if not os.path.exists('gen/orig/%s.npy'%k):shutil.copy('gen/%s.npy'%k,'gen/orig/%s.npy'%k)
        shutil.copy('gen/%s%s.npy'%(k,b[2]),'gen/%s.npy'%k);R[k]=dict(R[k+b[2]]);ch+=1
    if b[0]<.9:left.append((b[0],L[k]['who'],L[k]['t'][:70],R[k]['h'][:60]))
json.dump(R,open('ctl.json','w'),ensure_ascii=False)
print('remplacées',ch,'/',len(redo),'| encore sous 0,90 :',len(left))
for x in sorted(left):print(' ',x)
json.dump([k for k in redo if max(sc(L[k]['t'],R[k]['h']),0)<.9],open('redo2.json','w'))
