import sys
from playwright.sync_api import sync_playwright
html,out=sys.argv[1],sys.argv[2];vp=(int(sys.argv[4]),int(sys.argv[5])) if len(sys.argv)>5 else (1280,720)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox']);pg=b.new_context(viewport={'width':vp[0],'height':vp[1]},user_agent=('Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)' if vp[0]<900 else None),has_touch=vp[0]<900).new_page()
    errs=[];pg.on('pageerror',lambda e:errs.append(str(e)[:300]))
    pg.goto('file://'+html);pg.wait_for_selector('#tNew');pg.wait_for_timeout(1500);pg.evaluate("PREF.auto=0;document.getElementById('title').hidden=true")
    names=[]
    for it in sys.argv[3].split(','):
        k,who,sec=it.split(':');pg.evaluate(f"say([[{'null' if who=='-' else repr(who)},'Ligne d essai pour le plan {k}, assez longue pour voir le sous-titre sur deux lignes au moins.',0,'{k}','Titre du lieu']])");pg.wait_for_timeout(int(float(sec)*1000));f=f'{out}/{k}_{sec}.png';pg.screenshot(path=f);names.append(f);pg.evaluate("DQ=[];nextLine();nextLine()");pg.wait_for_timeout(150)
    print(' '.join(names));print(errs[:4]);b.close()
