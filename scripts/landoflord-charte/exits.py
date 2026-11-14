import sys,base64
from playwright.sync_api import sync_playwright
html,out=sys.argv[1],sys.argv[2];dist=int(sys.argv[3]) if len(sys.argv)>3 else 3
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
    names=[]
    for lv in pg.evaluate("Object.keys(LEVELS)"):
        pg.evaluate(f"travel({{lv:'{lv}'}})");pg.wait_for_timeout(400)
        for _ in range(6):
            if pg.evaluate("!document.getElementById('dlg').hidden"):pg.keyboard.press('Escape');pg.wait_for_timeout(120)
        r=pg.evaluate("""(D)=>{LS.mons.forEach(m=>m.gone=1);for(let y=0;y<MH;y++)for(let x=0;x<MW;x++)if(cell(x,y)==='X'){for(let q=0;q<4;q++){let n=0,cx=x,cy=y;while(n<D&&'.dg'.includes(cell(cx+DX[q],cy+DY[q]))){cx+=DX[q];cy+=DY[q];n++;}if(n){S.x=cx;S.y=cy;S.d=(q+2)%4;anim=null;return [x,y,n];}}}return null}""",dist)
        if not r:continue
        pg.wait_for_timeout(350)
        u=pg.evaluate("document.getElementById('view').toDataURL()");open(f'{out}/x_{lv}.png','wb').write(base64.b64decode(u.split(',')[1]));names.append(lv)
    print(' '.join(names));b.close()
