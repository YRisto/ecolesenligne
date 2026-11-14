from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox','--autoplay-policy=document-user-activation-required']);pg=b.new_context(viewport={'width':1280,'height':800}).new_page()
    errs=[];pg.on('pageerror',lambda e:errs.append(str(e)[:300]))
    pg.goto('http://localhost:8765/landoflord');pg.wait_for_selector('#tNew');pg.wait_for_timeout(500);print(pg.evaluate("location.pathname"),pg.evaluate("AUDDIAG()"))
    pg.click('#tNew');pg.wait_for_timeout(300);pg.click('[data-diff="0"]');pg.wait_for_timeout(9000);print(pg.evaluate("AUDDIAG()"));print(errs);b.close()
