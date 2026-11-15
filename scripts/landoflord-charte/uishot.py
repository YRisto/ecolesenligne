import sys
from playwright.sync_api import sync_playwright
html,out,tag=sys.argv[1],sys.argv[2],sys.argv[3];vp=(int(sys.argv[4]),int(sys.argv[5]))
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox']);pg=b.new_context(viewport={'width':vp[0],'height':vp[1]},user_agent=('Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)' if vp[0]<900 else None),has_touch=vp[0]<900).new_page()
    errs=[];pg.on('pageerror',lambda e:errs.append(str(e)[:200]))
    pg.goto('file://'+html);pg.wait_for_selector('#tNew');pg.wait_for_timeout(1200);pg.screenshot(path=f'{out}/{tag}_titre.png')
    pg.click('#tNew');pg.wait_for_timeout(300);pg.click('[data-diff="0"]');pg.wait_for_timeout(600)
    for i in range(80):
        st=pg.evaluate("({hero:!document.getElementById('heroSel').hidden,dlg:!document.getElementById('dlg').hidden})")
        if st['hero']:
            pg.click('[data-hero="aldric"]');pg.wait_for_timeout(300);pg.screenshot(path=f'{out}/{tag}_heros.png');pg.click('#heroYes');pg.wait_for_timeout(500);continue
        if st['dlg']:
            pg.keyboard.press('Escape');pg.wait_for_timeout(200)
            if pg.evaluate("!document.getElementById('dlg').hidden"):
                if pg.evaluate("!!document.querySelector('#dlgBtns.col')"):pg.click('#dlgBtns button')
                else:pg.keyboard.press('Enter')
                pg.wait_for_timeout(150)
            continue
        if pg.evaluate("typeof S!=='undefined'&&S&&S.lv&&!cineMode"):break
        pg.wait_for_timeout(200)
    pg.wait_for_timeout(500);pg.evaluate("log('Vous ramassez : <b>Onguent</b>. Le sac pèse un peu plus lourd, la conscience un peu moins.');give&&0");pg.wait_for_timeout(300);pg.screenshot(path=f'{out}/{tag}_jeu.png')
    pg.evaluate("openMap()");pg.wait_for_timeout(400);pg.screenshot(path=f'{out}/{tag}_plan.png');pg.evaluate("closeModal()")
    pg.evaluate("document.querySelector('#sys button')&&document.querySelector('#sys button').click()");pg.wait_for_timeout(400);pg.screenshot(path=f'{out}/{tag}_chron.png');pg.evaluate("closeModal()")
    pg.evaluate("say([['pepin','Votre soupe, mon général. Elle est froide, mais je vous rassure : elle était déjà mauvaise chaude.']])");pg.wait_for_timeout(900);pg.screenshot(path=f'{out}/{tag}_dial.png')
    print(errs[:3]);b.close()
