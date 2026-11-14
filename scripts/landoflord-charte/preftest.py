from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox']);pg=b.new_context().new_page()
    pg.goto('http://localhost:8765/landoflord/index.html');pg.wait_for_selector('#tNew')
    for pref in ['{"mus":0,"sfx":1,"vox":0,"vv":1}','{"mus":0,"sfx":1,"vox":0,"vv":1,"lm":0,"ls":80,"lv":0,"mfix":1}']:
        pg.evaluate("p=>localStorage.setItem('gd2_prefs',p)",pref);pg.reload();pg.wait_for_selector('#tNew');pg.mouse.click(600,100);pg.wait_for_timeout(1200)
        print(pg.evaluate("[PREF.lm,PREF.ls,PREF.lv,PREF.mus,PREF.vox,voxOn(),!MUS.paused,MUS.volume]"))
    b.close()
