import sys
from playwright.sync_api import sync_playwright
Q="({src:MUS.src.split('/').pop(),paused:MUS.paused,t:+MUS.currentTime.toFixed(2),vol:+MUS.volume.toFixed(3),muted:MUS.muted,err:MUS.error&&MUS.error.code,rs:MUS.readyState,cur:curTrack,ac:AC&&AC.state,pm:PREF.mus,lm:PREF.lm,duck:typeof duckF!=='undefined'?duckF:null,cine:typeof cineMode!=='undefined'?cineMode:null,sc:mixScene,dlg:!document.getElementById('dlg').hidden,lv:S&&S.lv,fight:typeof fightT!=='undefined'?!!fightT:null})"
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox','--autoplay-policy=document-user-activation-required']);pg=b.new_context(viewport={'width':1280,'height':800}).new_page()
    errs=[];pg.on('pageerror',lambda e:errs.append(str(e)[:200]));pg.on('console',lambda m:errs.append(m.text[:160]) if m.type=='error' else None)
    pg.goto('http://localhost:8765/landoflord/index.html');pg.wait_for_selector('#tNew');pg.wait_for_timeout(1500)
    print('avant clic',pg.evaluate(Q))
    pg.mouse.click(640,100);pg.wait_for_timeout(1500);print('titre, 1 clic',pg.evaluate(Q))
    pg.click('#tNew');pg.wait_for_timeout(300);pg.click('[data-diff="0"]');pg.wait_for_timeout(2500);print('intro',pg.evaluate(Q))
    for i in range(80):
        st=pg.evaluate("({hero:!document.getElementById('heroSel').hidden,dlg:!document.getElementById('dlg').hidden})")
        if st['hero']:
            pg.wait_for_timeout(1200);print('choix héros',pg.evaluate(Q));pg.click('[data-hero="aldric"]');pg.wait_for_timeout(200);pg.click('#heroYes');pg.wait_for_timeout(500);continue
        if st['dlg']:
            pg.keyboard.press('Escape');pg.wait_for_timeout(200)
            if pg.evaluate("!document.getElementById('dlg').hidden"):pg.keyboard.press('Enter');pg.wait_for_timeout(150)
            continue
        if pg.evaluate("typeof S!=='undefined'&&S&&S.lv&&document.getElementById('dlg').hidden"):break
        pg.wait_for_timeout(200)
    for i in range(40):
        pg.wait_for_timeout(700)
        if pg.evaluate("!document.getElementById('dlg').hidden"):pg.keyboard.press('Escape');pg.wait_for_timeout(150);pg.keyboard.press('Enter')
        elif not pg.evaluate("cineMode"):break
    pg.wait_for_timeout(3000);print('en jeu',pg.evaluate(Q))
    pg.keyboard.press('ArrowUp');pg.wait_for_timeout(4000);print('en jeu +4s',pg.evaluate(Q));pg.evaluate("travel({lv:'village'})");pg.wait_for_timeout(600)
    for _ in range(8):
        if pg.evaluate("!document.getElementById('dlg').hidden"):pg.keyboard.press('Escape');pg.wait_for_timeout(200)
    pg.wait_for_timeout(3000);print('village',pg.evaluate(Q));print(errs[:8]);b.close()
