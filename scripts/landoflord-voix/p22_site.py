# Mixage façon Lands of Lore : trois curseurs (musique, bruitages, voix), musique sur le même circuit que les voix
# (le réglage agit aussi sur iPhone), fondu de la musique et de l'ambiance pendant les scènes parlées, voix coupées en biseau.
#   python3 p22_site.py <index.html>      — à appliquer APRÈS p21_site.py ; refuse de s'appliquer deux fois.
import sys
P=sys.argv[1];h=open(P,encoding='utf-8').read()
assert 'voxKey' in h,"appliquer d'abord p21_site.py";assert 'mixUpd' not in h,'correctif déjà appliqué'
def rep(old,new,n=1):
    global h;c=h.count(old);assert c==n,(old[:70],c);h=h.replace(old,new)
# niveaux : reprise des anciens réglages oui/non
rep("const savePref=()=>","if(PREF.lm==null)PREF.lm=PREF.mus===0?0:60;if(PREF.ls==null)PREF.ls=PREF.sfx===0?0:80;if(PREF.lv==null)PREF.lv=PREF.vox===0?0:[60,90,100][PREF.vv==null?1:PREF.vv];\nconst savePref=()=>")
JS=r"""/* ---------- mixage : trois niveaux (musique, bruitages, voix) comme dans l'original, fondus en plus ---------- */
const BUS={};let mixScene=0,voxGn=null;
const OUT=k=>BUS[k]||AC.destination,voxOn=()=>!!(BASE&&AC&&PREF.vox!==0),musBase=()=>(curTrack==='combat'?.22:.2)*(PREF.lm/60);
function mixInit(){try{BUS.sfx=AC.createGain();BUS.sfx.connect(AC.destination);BUS.amb=AC.createGain();BUS.amb.connect(BUS.sfx);BUS.vox=AC.createGain();BUS.vox.connect(AC.destination);}catch(e){}
 try{const g=AC.createGain();g.gain.value=0;g.connect(AC.destination);AC.createMediaElementSource(MUS).connect(g);BUS.mus=g;MUS.volume=1;}catch(e){BUS.mus=null;}
 mixUpd(1);}
function gset(p,v,d){const t=AC.currentTime;try{p.cancelScheduledValues(t);if(d>0)p.setTargetAtTime(v,t,d/3);else p.setValueAtTime(v,t);}catch(e){try{p.value=v;}catch(x){}}}
/* scène parlée (intro, intermèdes) : musique et ambiance s'éteignent en fondu ; ailleurs la musique baisse seulement sous une voix */
function mixUpd(now){const sc=(cineMode&&!$('dlg').hidden&&voxOn())?1:0,f=sc?0:duckF,d=now?0:sc?.8:mixScene?1.5:duckF<1?.25:.6;mixScene=sc;
 if(AC&&BUS.mus)gset(BUS.mus.gain,musBase()*f,d);else try{MUS.volume=Math.min(1,musBase()*f);}catch(e){}
 if(!AC)return;if(BUS.amb)gset(BUS.amb.gain,sc?0:1,d);if(BUS.sfx)gset(BUS.sfx.gain,PREF.ls/80,now?0:.05);if(BUS.vox)gset(BUS.vox.gain,PREF.lv/100,now?0:.05);}
function setVol(k,v){PREF[k]=v;const m=PREF.mus,s=PREF.sfx;PREF.mus=PREF.lm>0?1:0;PREF.sfx=PREF.ls>0?1:0;PREF.vox=PREF.lv>0?1:0;
 if(PREF.mus!==m)music();if(PREF.sfx!==s){if(amb)amb.gain.value=PREF.sfx?.05:0;ambKey='-';ambience();}if(!PREF.vox)voxStop();mixUpd(1);}
function volHTML(){const r=(k,n)=>`<label><span>${n}</span><input type="range" min="0" max="100" step="5" value="${PREF[k]}" data-vol="${k}" aria-label="${n}"><b>${PREF[k]}</b></label>`;
 return `<div class="vols">${ONSITE?r('lm','Musique'):''}${r('ls','Bruitages')}${ONSITE?r('lv','Voix'):'<small>Musique et voix : sur ecolesenligne.fr.</small>'}<small>À fond à gauche : coupé.</small></div>`;}
document.addEventListener('input',e=>{const t=e.target,k=t&&t.dataset&&t.dataset.vol;if(!k)return;audioOn();setVol(k,+t.value);if(t.nextElementSibling)t.nextElementSibling.textContent=t.value;});
document.addEventListener('change',e=>{const t=e.target,k=t&&t.dataset&&t.dataset.vol;if(!k)return;savePref();if(k==='ls')sfx('coin');else if(k==='lv'&&PREF.lv>0)vox('pepin',"C'est bien ce qui m'inquiète.");});
/* ---------- voix ---------- */"""
rep("/* ---------- voix ---------- */",JS)
rep("function audioOn(){if(AC)return;try{AC=new(window.AudioContext||window.webkitAudioContext)();}catch(e){return;}","function audioOn(){if(AC)return;try{AC=new(window.AudioContext||window.webkitAudioContext)();}catch(e){return;}mixInit();")
# sorties : bruitages, ambiance, voix, musique
rep(".connect(amb).connect(AC.destination)",".connect(amb).connect(OUT('amb'))")
rep("o.connect(g).connect(AC.destination);o.start(t)","o.connect(g).connect(OUT('sfx'));o.start(t)")
rep("s.connect(f).connect(g).connect(AC.destination);s.start(t);}","s.connect(f).connect(g).connect(OUT('sfx'));s.start(t);}")
rep("g.gain.value=n==='step'?.35:.6;s.connect(g).connect(AC.destination)","g.gain.value=n==='step'?.35:.6;s.connect(g).connect(OUT('sfx'))")
rep("g.gain.setTargetAtTime(AVOL[k]||.5,AC.currentTime,.9);s.connect(g).connect(AC.destination)","g.gain.setTargetAtTime(AVOL[k]||.5,AC.currentTime,.9);s.connect(g).connect(OUT('amb'))")
rep("g.gain.value=VVOL[PREF.vv==null?1:PREF.vv];s.connect(g).connect(AC.destination);","g.gain.value=1;s.connect(g).connect(OUT('vox'));voxGn=g;")
assert h.count('AC.destination')==4,h.count('AC.destination')   # il ne reste que les sorties des circuits
rep("function duck(on){duckF=on?.45:1;try{if(curTrack)MUS.volume=(curTrack==='combat'?.22:.2)*duckF;}catch(e){}}","function duck(on){duckF=on?.45:1;mixUpd();}")
rep("MUS.volume=(t==='combat'?.22:.2)*duckF;MUS.src=","mixUpd(1);MUS.src=")
# voix coupée en biseau quand on passe une réplique
rep("if(voxSrc){const s=voxSrc;voxSrc=null;try{s.onended=null;s.stop();}catch(e){}}","if(voxSrc){const s=voxSrc,g=voxGn;voxSrc=null;try{s.onended=null;g.gain.setTargetAtTime(0,AC.currentTime,.03);s.stop(AC.currentTime+.12);}catch(e){try{s.stop();}catch(x){}}}")
# scènes : fondu à l'ouverture et à la fermeture, pas de bruit de page sous les voix
rep(" if(!DQ.length){$('dlg').hidden=true;"," if(!DQ.length){$('dlg').hidden=true;mixUpd();")
rep("$('dlg').hidden=false;sfx('page');","$('dlg').hidden=false;if(!(cineMode&&voxOn()))sfx('page');mixUpd();")
# le son revient après une mise en veille ou un retour d'arrière-plan
rep("addEventListener('pointerdown',()=>{audioOn();if(MUS.paused)music();}","addEventListener('pointerdown',()=>{audioOn();if(AC&&AC.state!=='running')try{AC.resume().catch(()=>{});}catch(e){}if(MUS.paused)music();}")
# réglages : trois curseurs à la place des oui/non
rep("""<div class="list"><button data-m="mus"><span>Musique : <b>${PREF.mus?'oui':'non'}</b>${ONSITE?'':'<small>Disponible sur ecolesenligne.fr</small>'}</span></button><button data-m="sfx"><span>Bruitages : <b>${PREF.sfx?'oui':'non'}</b></span></button><button data-m="vox"><span>Voix : <b>${PREF.vox!==0?'oui':'non'}</b>${ONSITE?'<small>Voix de synthèse, une par personnage.</small>':'<small>Disponible sur ecolesenligne.fr</small>'}</span></button>${ONSITE&&PREF.vox!==0?`<button data-m="vv"><span>Volume des voix : <b>${['doux','moyen','fort'][PREF.vv==null?1:PREF.vv]}</b></span></button>`:''}""","""${volHTML()}<div class="list">""")
rep("addEventListener('keydown',e=>{","addEventListener('keydown',e=>{if(e.target&&e.target.type==='range'&&/^(Arrow|Home|End|Page)/.test(e.code))return;")
rep("</style>\n</head>",".vols{display:grid;gap:6px;margin:0 0 10px}.vols label{display:grid;grid-template-columns:5.6em 1fr 2.2em;align-items:center;gap:10px;font-size:14px}.vols input{width:100%;height:36px;margin:0;accent-color:#c9a24a}.vols b{text-align:right;color:#e2c477;font-weight:normal}.vols small{font-size:11px;opacity:.7}\n</style>\n</head>")
open(P,'w',encoding='utf-8').write(h);print('mixage : correctif appliqué')
