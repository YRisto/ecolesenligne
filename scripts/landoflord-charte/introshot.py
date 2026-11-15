import sys
from playwright.sync_api import sync_playwright
html,out=sys.argv[1],sys.argv[2];plan=[x.split(':') for x in sys.argv[3].split(',')]   # ligne:secondes,...
vp=(int(sys.argv[4]),int(sys.argv[5])) if len(sys.argv)>5 else (1280,720)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox']);pg=b.new_context(viewport={'width':vp[0],'height':vp[1]},user_agent=('Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)' if vp[0]<900 else None),has_touch=vp[0]<900).new_page()
    errs=[];pg.on('pageerror',lambda e:errs.append(str(e)[:300]))
    pg.goto('file://'+html);pg.wait_for_selector('#tNew');pg.wait_for_timeout(1500);pg.screenshot(path=f'{out}/title.png')
    pg.evaluate("PREF.auto=0");pg.click('#tNew');pg.wait_for_timeout(300);pg.click('[data-diff="0"]');pg.wait_for_timeout(300)
    line=0;names=[]
    for ln,sec in plan:
        ln=int(ln)
        while line<ln:
            if pg.evaluate("!!document.querySelector('#dlgBtns.col')"):pg.click('#dlgBtns button')
            else:pg.keyboard.press('Enter')
            pg.wait_for_timeout(120)
            if pg.evaluate("!!tw"):pg.keyboard.press('Enter');pg.wait_for_timeout(80)
            line+=1
        pg.wait_for_timeout(int(float(sec)*1000));f=f'{out}/L{ln:02d}_{sec}.png';pg.screenshot(path=f);names.append(f)
    print(' '.join(names));print(pg.evaluate("[curScene,speaker]"),errs[:4]);b.close()
