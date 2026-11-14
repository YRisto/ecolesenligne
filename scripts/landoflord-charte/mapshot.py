import sys,base64
from playwright.sync_api import sync_playwright
html,out=sys.argv[1],sys.argv[2];lvs=sys.argv[3].split(',');vp=(int(sys.argv[4]),int(sys.argv[5])) if len(sys.argv)>5 else (1280,800)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox']);pg=b.new_context(viewport={'width':vp[0],'height':vp[1]},has_touch=vp[0]<900,user_agent=('Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)' if vp[0]<900 else None)).new_page()
    errs=[];pg.on('pageerror',lambda e:errs.append(str(e)[:200]))
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
    for lv in lvs:
        pg.evaluate(f"travel({{lv:'{lv}'}})");pg.wait_for_timeout(400)
        for _ in range(6):
            if pg.evaluate("!document.getElementById('dlg').hidden"):pg.keyboard.press('Escape');pg.wait_for_timeout(120)
        pg.evaluate("(()=>{let n=0;for(let y=0;y<MH;y++)for(let x=0;x<MW;x++){if((x*7+y*13)%10<8)LS.seen[x+','+y]=1;}for(const k in LS.nt||{}){}S.marks[S.lv]={};})()")
        pg.evaluate("openMap()");pg.wait_for_timeout(500);pg.screenshot(path=f'{out}/map_{lv}.png')
        print(lv,pg.evaluate("JOURNAL().match(/La sortie\\.<\\/b>[^<]*/)"))
        pg.keyboard.press('Escape');pg.wait_for_timeout(200)
        if pg.evaluate("!document.getElementById('modal').hidden") if pg.evaluate("!!document.getElementById('modal')") else False: pg.evaluate("closeModal&&closeModal()")
    pg.screenshot(path=f'{out}/play.png');print(errs[:5]);b.close()
