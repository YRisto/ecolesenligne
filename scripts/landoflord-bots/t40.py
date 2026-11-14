# la musique sort-elle vraiment ? mesure du signal après le curseur, sur le site, navigateur au choix
from playwright.sync_api import sync_playwright
import sys
B=sys.argv[1] if len(sys.argv)>1 else 'chromium';URL=sys.argv[2] if len(sys.argv)>2 else 'https://ecolesenligne.fr/landoflord/'
with sync_playwright() as p:
    if B=='firefox':br=p.firefox.launch()
    else:br=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    c=br.new_context(viewport={'width':1280,'height':800});pg=c.new_page();errs=[];pg.on('pageerror',lambda e:errs.append(str(e)[:200]));pg.on('console',lambda m:errs.append('C:'+m.text[:160]) if m.type in('error','warning') else None)
    pg.goto(URL);pg.wait_for_selector('#tNew');pg.wait_for_function("typeof audioOn==='function'&&typeof LEVELS!=='undefined'",timeout=90000);pg.wait_for_timeout(1500)
    pg.mouse.click(640,120);pg.wait_for_timeout(2500)   # un vrai clic, comme un joueur
    M="""()=>{const o={ac:AC&&AC.state,bus:!!BUS.mus,gain:BUS.mus?+BUS.mus.gain.value.toFixed(3):null,el:MUS.volume,paused:MUS.paused,rs:MUS.readyState,t:+MUS.currentTime.toFixed(2),err:MUS.error&&MUS.error.code,tr:curTrack,pref:[PREF.mus,PREF.lm]};
      if(AC&&BUS.mus&&!window.AN){window.AN=AC.createAnalyser();BUS.mus.connect(AN);}return o;}"""
    print(B,'après un clic:',pg.evaluate(M));pg.wait_for_timeout(2500)
    R="""()=>{if(!window.AN)return null;const d=new Float32Array(AN.fftSize);AN.getFloatTimeDomainData(d);let s=0;for(const v of d)s+=v*v;return +Math.sqrt(s/d.length).toFixed(5);}"""
    print('signal musique (efficace):',[pg.evaluate(R) for _ in range(3)],'| t =',pg.evaluate("+MUS.currentTime.toFixed(2)"),pg.evaluate("AC&&AC.state"))
    pg.click('#tNew');pg.wait_for_timeout(3000);print('après Nouvelle partie:',pg.evaluate(M),pg.evaluate(R))
    print('ERR',errs[:6]);br.close()
