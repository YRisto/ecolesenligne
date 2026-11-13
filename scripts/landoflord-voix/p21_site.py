# Voix des personnages : applique le correctif directement sur la page construite du jeu (public/landoflord/index.html).
#   python3 p21_site.py <index.html> <table_vox.json>
# À relancer après toute nouvelle construction du jeu qui n'aurait pas ce correctif (il refuse de s'appliquer deux fois).
import sys,json
P=sys.argv[1];V=json.load(open(sys.argv[2]));h=open(P,encoding='utf-8').read()
assert 'voxKey' not in h,'correctif déjà appliqué'
def rep(old,new):
    global h;c=h.count(old);assert c==1,(old[:70],c);h=h.replace(old,new)
rep("let PREF={mus:1,sfx:1};","let PREF={mus:1,sfx:1,vox:1,vv:1};")
JS=r"""/* ---------- voix ---------- */
/*VOX*/const VOX=@@;/*FIN VOX*/
let voxSrc=null,voxT0=0,voxDur=0,voxTok=0,voxWait=0,voxLine=0,voxNextK='',duckF=1;const VOXB={},VVOL=[.5,.85,1.2];
function voxKey(w,t){let h=2166136261;const s=(w||'')+'|'+t;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return('0000000'+(h>>>0).toString(16)).slice(-8);}
const voxHas=k=>!!(BASE&&AC&&PREF.vox!==0&&VOX[k]);
function voxLoad(k){if(!VOXB[k]){const p=VOXB[k]=fetch(BASE+'vox/'+k+'.mp3').then(r=>{if(!r.ok)throw 0;return r.arrayBuffer();}).then(b=>new Promise((ok,ko)=>{try{const q=AC.decodeAudioData(b,ok,ko);if(q&&q.catch)q.catch(()=>{});}catch(e){ko(e);}}));p.catch(()=>{if(VOXB[k]===p)delete VOXB[k];});}return VOXB[k];}
function duck(on){duckF=on?.45:1;try{if(curTrack)MUS.volume=(curTrack==='combat'?.22:.2)*duckF;}catch(e){}}
function voxStop(){voxTok++;voxWait=0;voxLine=0;if(voxSrc){const s=voxSrc;voxSrc=null;try{s.onended=null;s.stop();}catch(e){}}if(duckF!==1)duck(0);}
function vox(w,t){voxStop();const k=voxKey(w,t);if(!voxHas(k))return 0;const tok=voxTok;voxWait=1;voxLine=1;voxDur=VOX[k]/10;
 voxLoad(k).then(d=>{if(tok!==voxTok)return;try{if(AC.state==='suspended')AC.resume();const s=AC.createBufferSource(),g=AC.createGain();s.buffer=d;g.gain.value=VVOL[PREF.vv==null?1:PREF.vv];s.connect(g).connect(AC.destination);
   s.onended=()=>{if(voxSrc===s){voxSrc=null;duck(0);}};voxSrc=s;voxDur=d.duration;voxT0=AC.currentTime;voxWait=0;duck(1);s.start();}catch(e){voxWait=0;voxLine=0;}
  for(const q in VOXB)if(q!==k&&q!==voxNextK)delete VOXB[q];}).catch(()=>{if(tok===voxTok){voxWait=0;voxLine=0;}});return VOX[k]/10;}
function voxAhead(l){voxNextK='';if(!l||typeof l[1]!=='string')return;const k=voxKey(l[0],hx(l[1]));if(voxHas(k)){voxNextK=k;voxLoad(k);}}
/* avancement de la réplique parlée, de 0 à 1 ; -1 tant que la voix ne joue pas */
const voxPos=()=>voxSrc&&voxDur?Math.min(1,(AC.currentTime-voxT0)/voxDur):-1;
let logSeq=0,logShown=-1,logT=0;""".replace('@@',json.dumps(V,separators=(',',':')))
rep("let logSeq=0,logShown=-1,logT=0;",JS)
rep("MUS.volume=t==='combat'?.22:.2;MUS.src=","MUS.volume=(t==='combat'?.22:.2)*duckF;MUS.src=")
rep(" clearTimeout(autoT);autoDur=0;\n if(!DQ.length){"," clearTimeout(autoT);autoDur=0;voxStop();\n if(!DQ.length){")
rep("twTL=sp.tl;twBrow=sp.brow;}$('dlgText').textContent='';","twTL=sp.tl;twBrow=sp.brow;}const vd=vox(l[0],twFull);voxAhead(DQ[0]);$('dlgText').textContent='';")
rep("if(cineMode&&PREF.auto!==0&&!l[2]){autoDur=l[0]?","if(cineMode&&PREF.auto!==0&&!l[2]){autoDur=vd?Math.max(1700,vd*1000+1300):l[0]?")
rep("function faceState(ts,seed){const ms=(performance.now()-twT0)*1.2,talking=!!twTL.length&&ms<twTL[twTL.length-1][1]&&!$('dlg').hidden;",
 "function faceState(ts,seed){const end=twTL.length?twTL[twTL.length-1][1]:0,vp=voxLine?voxPos():0,ms=voxLine?(vp<0?-1:vp*end):(performance.now()-twT0)*1.2,talking=!!twTL.length&&ms>=0&&ms<end&&!$('dlg').hidden;")
rep("const T=SHOPTALK[id]||SHOPTALK.fulbert,L=T[mood||'hi'],stock=SHOPS[id+'_'+S.lv]||SHOPS[id];","const T=SHOPTALK[id]||SHOPTALK.fulbert,L=T[mood||'hi'],ln=L[rnd(0,L.length-1)],stock=SHOPS[id+'_'+S.lv]||SHOPS[id];")
rep("<p>« ${L[rnd(0,L.length-1)]} »</p>","<p>« ${ln} »</p>")
# échoppes mises en scène : le marchand dit sa phrase, sa bouche suit le son, la voix s'arrête à la fermeture
rep("function shopSay(t){if(!SHS)return;SHS.line=t;SHS.t0=performance.now();SHS.tl=speechTL(t).tl;}","function shopSay(t){if(!SHS)return;SHS.line=t;SHS.t0=performance.now();SHS.tl=speechTL(t).tl;const i=t.lastIndexOf(' écus. ');if(!vox(SHS.sid,t)&&i>0)vox(SHS.sid,t.slice(i+7));}")
rep("ms=(now-SHS.t0)*1.2,talk=SHS.tl.length&&ms<SHS.tl[SHS.tl.length-1][1];","vend=SHS.tl.length?SHS.tl[SHS.tl.length-1][1]:0,vp=voxLine?voxPos():0,ms=voxLine?(vp<0?-1:vp*vend):(now-SHS.t0)*1.2,talk=SHS.tl.length&&ms>=0&&ms<vend;")
rep("if(!cv||!SHS||$('modal').hidden){clearInterval(shT);shT=0;SHS=null;","if(!cv||!SHS||$('modal').hidden){clearInterval(shT);shT=0;SHS=null;if($('dlg').hidden)voxStop();")
rep("""<button data-m="sfx"><span>Bruitages : <b>${PREF.sfx?'oui':'non'}</b></span></button>""",
 """<button data-m="sfx"><span>Bruitages : <b>${PREF.sfx?'oui':'non'}</b></span></button><button data-m="vox"><span>Voix : <b>${PREF.vox!==0?'oui':'non'}</b>${ONSITE?'<small>Voix de synthèse, une par personnage.</small>':'<small>Disponible sur ecolesenligne.fr</small>'}</span></button>${ONSITE&&PREF.vox!==0?`<button data-m="vv"><span>Volume des voix : <b>${['doux','moyen','fort'][PREF.vv==null?1:PREF.vv]}</b></span></button>`:''}""")
rep(" else if(d.m==='tw'){PREF.tw=PREF.tw?0:1;savePref();optModal();}"," else if(d.m==='tw'){PREF.tw=PREF.tw?0:1;savePref();optModal();}\n else if(d.m==='vox'){PREF.vox=PREF.vox!==0?0:1;savePref();if(!PREF.vox)voxStop();optModal();}\n else if(d.m==='vv'){PREF.vv=((PREF.vv==null?1:PREF.vv)+1)%3;savePref();optModal();}")
rep(".join('')+'<p><b>Personnages</b>",".join('')+'<p><b>Voix</b> : voix de synthèse produites avec <a href=\"https://huggingface.co/kyutai/pocket-tts\" target=\"_blank\" rel=\"noopener\">Pocket TTS</a> de Kyutai (CC-BY 4.0) ; timbres issus du corpus CML-TTS (lectures LibriVox, CC-BY 4.0), <a href=\"https://huggingface.co/kyutai/tts-voices\" target=\"_blank\" rel=\"noopener\">kyutai/tts-voices</a>.</p><p><b>Personnages</b>")
open(P,'w',encoding='utf-8').write(h);print('voix : correctif appliqué,',len(V),'répliques dans la table')
