import sys
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox']);pg=b.new_context(viewport={'width':1280,'height':800}).new_page();errs=[];pg.on('pageerror',lambda e:errs.append(str(e)[:200]))
    pg.goto('file://'+sys.argv[1]);pg.wait_for_selector('#tNew');pg.wait_for_timeout(600);pg.click('#tNew');pg.wait_for_timeout(200);pg.click('[data-diff="0"]');pg.wait_for_timeout(800)
    for i in range(60):
        st=pg.evaluate("({hero:!document.getElementById('heroSel').hidden,dlg:!document.getElementById('dlg').hidden})")
        if st['hero']:pg.click('[data-hero="aldric"]');pg.wait_for_timeout(200);pg.click('#heroYes');pg.wait_for_timeout(500);continue
        if st['dlg']:
            pg.keyboard.press('Escape');pg.wait_for_timeout(150)
            if pg.evaluate("!document.getElementById('dlg').hidden"):pg.keyboard.press('Enter');pg.wait_for_timeout(120)
            continue
        if pg.evaluate("typeof S!=='undefined'&&S&&S.lv"):break
        pg.wait_for_timeout(200)
    for k in sys.argv[3:]:
        pg.evaluate(f"openShop('{k}')");pg.wait_for_timeout(900);pg.screenshot(path=f'{sys.argv[2]}/shop_{k}.png');pg.keyboard.press('Escape');pg.wait_for_timeout(200)
    print(errs[:3]);b.close()
