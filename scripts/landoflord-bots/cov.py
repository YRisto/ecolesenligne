# couverture des voix : pendant une campagne jouée par les bots, toute réplique affichée doit avoir son enregistrement prévu
import sys,json,os
R=os.environ.get('BOTS')
if R:sys.path.insert(0,R)
import bots
if R:bots.BOTJS=open(R+'/bot.js').read()
if os.environ.get('URL'):bots.URL=os.environ['URL']
from playwright.sync_api import sync_playwright
K=[x['k'] for x in json.load(open('/home/claude/vox/lignes.json'))];hit=set();miss={}
W="(K=>{const A=new Set(K),seen={},v0=vox;vox=function(w,t){const k=voxKey(w,t);if(!seen[k]){seen[k]=1;console.log((A.has(k)?'VOXHIT ':'VOXMISS ')+JSON.stringify([k,w,t]));}return v0(w,t);};})"
orig=bots.page
def page(b,vp,touch=False):
    pg,errs=orig(b,vp,touch)
    def on(m):
        t=m.text
        if t.startswith('VOXHIT '):hit.add(json.loads(t[7:])[0])
        elif t.startswith('VOXMISS '):
            k,w,x=json.loads(t[8:]);miss[k]=(w,x)
    pg.on('console',on);pg.evaluate(W+'('+json.dumps(K)+')');return pg,errs
bots.page=page
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    bots.SIM=[s for s in bots.SIM if s[0][:2] in sys.argv[1:]];r=bots.sim(b,1);b.close()
print('répliques entendues:',len(hit),'/',len(K),'| sans enregistrement:',len(miss))
for k,(w,x) in miss.items():print('  MANQUE',w,'|',x[:150])
json.dump(dict(hit=sorted(hit),miss=miss),open('cov.json','w'),ensure_ascii=False)
