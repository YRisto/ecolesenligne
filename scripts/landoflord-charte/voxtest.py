from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox','--autoplay-policy=document-user-activation-required']);pg=b.new_context(viewport={'width':1280,'height':800}).new_page()
    bad=[];ok=[];pg.on('response',lambda r:(bad if r.status>=400 else ok).append((r.status,r.url.split('8765')[1])));errs=[];pg.on('pageerror',lambda e:errs.append(str(e)[:300]))
    pg.goto('http://localhost:8765/landoflord/index.html');pg.wait_for_selector('#tNew');pg.wait_for_timeout(800)
    pg.click('#tNew');pg.wait_for_timeout(300);pg.click('[data-diff="0"]');pg.wait_for_timeout(6000)
    print('bad',bad);print('vox ok',[u for s,u in ok if 'vox' in u][:6]);print(errs)
    print(pg.evaluate("({vox:PREF.vox,lv:PREF.lv,voxOn:voxOn(),ac:AC&&AC.state,g:BUS.vox&&BUS.vox.gain.value,cine:cineMode,dlg:!document.getElementById('dlg').hidden,txt:document.getElementById('dlgText').textContent.slice(0,60)})"))
    b.close()
