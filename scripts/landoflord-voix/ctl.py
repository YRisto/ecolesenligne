# contrôle : retranscrit chaque réplique (whisper small) et mesure ce qu'il reste du texte -> ctl.json ; reprenable
import os,json,re,sys,numpy as np,unicodedata
from faster_whisper import WhisperModel
L=json.load(open('lignes.json'));R=json.load(open('ctl.json')) if os.path.exists('ctl.json') else {}
suf=sys.argv[1] if len(sys.argv)>1 else ''
def words(t):
    t=unicodedata.normalize('NFD',t.lower());t=''.join(c for c in t if unicodedata.category(c)!='Mn');return re.findall(r"[a-zœ]+",t.replace('œ','oe'))
def score(ref,hyp):
    a,b=words(ref),words(hyp)
    if not a:return 1
    # alignement par plus longue sous-suite commune
    m=[[0]*(len(b)+1) for _ in range(len(a)+1)]
    for i in range(len(a)):
        for j in range(len(b)):m[i+1][j+1]=m[i][j]+1 if a[i]==b[j] else max(m[i][j+1],m[i+1][j])
    l=m[-1][-1];return round(2*l/(len(a)+len(b)),3) if b else 0
wh=WhisperModel('small',device='cpu',compute_type='int8');n=0
for x in L:
    k=x['k']+suf;f='gen/%s.npy'%k
    if k in R or not os.path.exists(f):continue
    a=np.load(f);y=np.interp(np.arange(0,len(a),1.5),np.arange(len(a)),a).astype(np.float32)
    t=' '.join(s.text for s in wh.transcribe(y,language='fr',beam_size=2)[0]).strip()
    cps=len(x['t'])/max(.1,len(a)/24000)
    R[k]=dict(s=score(x['t'],t),cps=round(cps,1),h=t);n+=1
    if n%20==0:json.dump(R,open('ctl.json','w'),ensure_ascii=False);print(n,flush=True)
json.dump(R,open('ctl.json','w'),ensure_ascii=False);print('contrôlées',n,'total',len(R))
