# Musique : sortie directe comme avant sur ordinateur et Android (volume de l'élément, fondus par paliers) ;
# passage par le circuit Web Audio réservé à l'iPhone et à l'iPad, où le volume de l'élément ne se règle pas.
#   python3 p23_site.py <index.html>      — après p21 et p22 ; refuse de s'appliquer deux fois.
import sys
P=sys.argv[1];h=open(P,encoding='utf-8').read()
assert 'mixUpd' in h,"appliquer d'abord p22_site.py";assert 'vramp' not in h,'correctif déjà appliqué'
def rep(old,new,n=1):
    global h;c=h.count(old);assert c==n,(old[:70],c);h=h.replace(old,new)
rep("const BUS={};let mixScene=0,voxGn=null;","const BUS={};let mixScene=0,voxGn=null,vrT=0;const IOS=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);\nfunction vramp(v,d){clearInterval(vrT);if(!(d>0)){try{MUS.volume=v;}catch(e){}return;}const v0=MUS.volume,t0=performance.now();vrT=setInterval(()=>{const k=Math.min(1,(performance.now()-t0)/(d*1000));try{MUS.volume=v0+(v-v0)*k;}catch(e){}if(k>=1)clearInterval(vrT);},40);}")
rep(" try{const g=AC.createGain();g.gain.value=0;g.connect(AC.destination);AC.createMediaElementSource(MUS).connect(g);BUS.mus=g;MUS.volume=1;}catch(e){BUS.mus=null;}"," if(IOS)try{const g=AC.createGain();g.gain.value=0;g.connect(AC.destination);AC.createMediaElementSource(MUS).connect(g);BUS.mus=g;MUS.volume=1;}catch(e){BUS.mus=null;}")
rep("if(AC&&BUS.mus)gset(BUS.mus.gain,musBase()*f,d);else try{MUS.volume=Math.min(1,musBase()*f);}catch(e){}","if(AC&&BUS.mus)gset(BUS.mus.gain,musBase()*f,d);else vramp(Math.min(1,musBase()*f),d);")
open(P,'w',encoding='utf-8').write(h);print('musique : sortie directe hors iPhone, correctif appliqué')
