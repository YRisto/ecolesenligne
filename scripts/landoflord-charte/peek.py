import sys,base64
from playwright.sync_api import sync_playwright
html,out,lv=sys.argv[1],sys.argv[2],sys.argv[3];pos=[tuple(int(v) for v in a.split(',')) for a in sys.argv[4:]]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox']);pg=b.new_context(viewport={'width':1280,'height':800}).new_page()
    pg.goto('file://'+html);pg.wait_for_selector('#tNew');pg.wait_for_timeout(600);pg.click('#tNew');pg.wait_for_timeout(200);pg.click('[data-diff="0"]');pg.wait_for_timeout(800)
    for i in range(60):
        st=pg.evaluate("({hero:!document.getElementById('heroSel').hidden,dlg:!document.getElementById('dlg').hidden})")
        if st['hero']:pg.click('[data-hero="aldric"]');pg.wait_for_timeout(200);pg.click('#heroYes');pg.wait_for_timeout(500);continue
        if st['dlg']:
            pg.keyboard.press('Escape');pg.wait_for_timeout(150)
            if pg.evaluate("!document.getElementById('dlg').hidden"):pg.keyboard.press('Enter');pg.wait_for_timeout(120)
            continue
        if pg.evaluate("typeof S!=='undefined'&&S&&S.lv"):break
        pg.wait_for_timeout(200)
    pg.evaluate(f"travel({{lv:'{lv}'}})");pg.wait_for_timeout(500)
    for _ in range(6):
        if pg.evaluate("!document.getElementById('dlg').hidden"):pg.keyboard.press('Escape');pg.wait_for_timeout(120)
    print(pg.evaluate("[DX,DY,S.bag.includes('lanterne'),S.oil]"))
    for i,(x,y,d) in enumerate(pos):
        pg.evaluate(f"LS.mons.forEach(m=>m.gone=1);S.x={x};S.y={y};S.d={d};anim=null");pg.wait_for_timeout(300)
        u=pg.evaluate("document.getElementById('view').toDataURL()");open(f'{out}/peek{i}.png','wb').write(base64.b64decode(u.split(',')[1]))
    b.close()
