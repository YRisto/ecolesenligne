import sys,json,base64
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
    print('niveaux avec énigme',pg.evaluate("Object.keys(PUZ).length"),pg.evaluate("Object.keys(LEVELS).filter(k=>!PUZ[k]).join(',')"))
    for lv in pg.evaluate("Object.keys(PUZ)"):
        pg.evaluate(f"travel({{lv:'{lv}'}})");pg.wait_for_timeout(250)
        for _ in range(8):
            if pg.evaluate("!document.getElementById('dlg').hidden"):pg.keyboard.press('Escape');pg.wait_for_timeout(100)
        r=pg.evaluate("""()=>{const P=PUZ[S.lv],pr=LV.props.filter(p=>p.pz!=null),by=i=>pr.find(p=>p.pz===i);const g0=S.gold;
          S.bag.push('pain','vin','huile','huile','herbes');
          // mauvaise tentative puis bonne
          if(P.t==='ordre'){SC.puz(by(P.o[1]));for(const i of P.o)SC.puz(by(i));}
          else if(P.t==='etat'){for(let i=0;i<P.g.length;i++)for(let k=0;k<P.g[i];k++)SC.puz(by(i));}
          else{for(let i=0;i<P.w.length;i++)SC.puz(by(i));}
          return [S.lv,P.t,pr.map(p=>p.k+'@'+p.x+','+p.y).join(' '),LS.pz&&LS.pz.ok,S.gold-g0];}""")
        print(r)
    pg.evaluate("travel({lv:'egouts'})");pg.wait_for_timeout(300)
    for _ in range(8):
        if pg.evaluate("!document.getElementById('dlg').hidden"):pg.keyboard.press('Escape');pg.wait_for_timeout(100)
    pg.evaluate("""(()=>{const p=LV.props.find(p=>p.pz===0);for(let k=0;k<4;k++){const ax=p.x-DX[k],ay=p.y-DY[k];if(cell(ax,ay)==='.'&&!LV.props.some(q=>q.x===ax&&q.y===ay)){S.x=ax;S.y=ay;S.d=k;break;}}LS.mons.forEach(m=>m.gone=1);anim=null;})()""");pg.wait_for_timeout(400)
    u=pg.evaluate("document.getElementById('view').toDataURL()");open('/home/claude/work/puz_view.png','wb').write(base64.b64decode(u.split(',')[1]))
    print(errs[:4]);b.close()
