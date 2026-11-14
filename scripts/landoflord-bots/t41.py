# parcours réel sous Chrome : titre → prologue → choix du héros → procès → geôles ; niveau réel de la musique à chaque étape
from playwright.sync_api import sync_playwright
import sys
URL='http://localhost:8766/landoflord/';B=sys.argv[1] if len(sys.argv)>1 else 'chromium';UA=sys.argv[2] if len(sys.argv)>2 else None
R="""()=>{if(!window.AN){window.AN=AC.createAnalyser();(BUS.mus||AC.createGain()).connect(AN);}const d=new Float32Array(AN.fftSize);let m=0;for(let k=0;k<1;k++){AN.getFloatTimeDomainData(d);let s=0;for(const v of d)s+=v*v;m=Math.sqrt(s/d.length);}
 return{sig:+m.toFixed(4),gain:BUS.mus?+BUS.mus.gain.value.toFixed(3):null,vol:+MUS.volume.toFixed(2),tr:curTrack,paused:MUS.paused,sc:mixScene,duck:duckF,cine:cineMode,dlg:!$('dlg').hidden,ac:AC.state,t:+MUS.currentTime.toFixed(1),ios:IOS}}"""
def lvl(pg,label,n=4):
    pg.evaluate(R);o=None;mx=0
    for i in range(n):
        pg.wait_for_timeout(350);o=pg.evaluate(R);mx=max(mx,o['sig'])
    o['sig']=mx;print('%-26s'%label,o)
with sync_playwright() as p:
    br=p.firefox.launch() if B=='firefox' else p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox']);kw={'user_agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 15_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1'} if UA else {};pg=br.new_context(viewport={'width':1280,'height':800},**kw).new_page();errs=[];pg.on('pageerror',lambda e:errs.append(str(e)[:200]))
    pg.goto(URL);pg.wait_for_selector('#tNew');pg.wait_for_function("typeof audioOn==='function'",timeout=60000);pg.wait_for_timeout(800)
    pg.mouse.click(640,60);pg.wait_for_timeout(2500);lvl(pg,'titre')
    pg.click('#tNew');pg.wait_for_timeout(600)
    if pg.locator('[data-diff="1"]').count():pg.click('[data-diff="1"]')
    pg.wait_for_timeout(3500);lvl(pg,'prologue (parlé)')
    for i in range(80):
        if pg.evaluate("$('dlg').hidden"):break
        pg.keyboard.press('Space');pg.wait_for_timeout(120)
    pg.wait_for_timeout(3500);lvl(pg,'choix du héros');print('   héros visible:',pg.evaluate("!$('heroSel').hidden"))
    pg.keyboard.press('Digit1');pg.wait_for_timeout(400);pg.keyboard.press('Enter');pg.wait_for_timeout(3500);lvl(pg,'procès (parlé)')
    for i in range(200):
        if pg.evaluate("$('dlg').hidden&&!!LS"):break
        pg.keyboard.press('Space');pg.wait_for_timeout(120)
    pg.wait_for_timeout(4000);lvl(pg,'en jeu, geôles');print('   ',pg.evaluate("[S&&S.lv,!!LS,$('dlg').hidden]"))
    for k in ['ArrowUp','ArrowUp','ArrowLeft','ArrowUp']:pg.keyboard.press(k);pg.wait_for_timeout(500)
    pg.wait_for_timeout(2500);lvl(pg,'en jeu, après marche')
    print('ERR',errs);br.close()
