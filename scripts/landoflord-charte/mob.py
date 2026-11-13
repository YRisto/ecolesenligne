import sys,time
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    for tag,html in (('new',sys.argv[1]),('old',sys.argv[2])):
        c=b.new_context(viewport={'width':667,'height':375},has_touch=True,is_mobile=True,device_scale_factor=2);pg=c.new_page();errs=[];pg.on('pageerror',lambda e:errs.append(str(e)[:200]))
        t=time.time();pg.goto('file://'+html);pg.wait_for_selector('#tNew');pg.wait_for_function("typeof TX!=='undefined'&&TX.panel&&TX.panel.deco2");dt=time.time()-t
        pg.tap('#tNew');pg.wait_for_timeout(200);pg.tap('[data-diff="0"]');pg.wait_for_timeout(600)
        for i in range(60):
            st=pg.evaluate("({hero:!document.getElementById('heroSel').hidden,dlg:!document.getElementById('dlg').hidden})")
            if st['hero']:pg.tap('[data-hero="aldric"]');pg.wait_for_timeout(200);pg.tap('#heroYes');pg.wait_for_timeout(500);continue
            if st['dlg']:
                pg.keyboard.press('Escape');pg.wait_for_timeout(150)
                if pg.evaluate("!document.getElementById('dlg').hidden"):pg.keyboard.press('Enter');pg.wait_for_timeout(120)
                continue
            if pg.evaluate("typeof S!=='undefined'&&S&&S.lv"):break
            pg.wait_for_timeout(200)
        pg.evaluate("(()=>{const m=LS.mons.find(m=>m.t==='garde');for(let k=0;k<4;k++){const ax=m.x-DX[k],ay=m.y-DY[k];if(cell(ax,ay)==='.'){S.x=ax;S.y=ay;S.d=k;break;}}})()")
        pg.wait_for_timeout(700);pg.screenshot(path=f'/home/claude/work/mob_{tag}.png');print(tag,'chargement %.2fs'%dt,errs[:2]);c.close()
    b.close()
