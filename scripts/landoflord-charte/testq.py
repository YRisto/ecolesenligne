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
    def go(lv):
        pg.evaluate(f"travel({{lv:'{lv}'}})");pg.wait_for_timeout(250)
        for _ in range(8):
            if pg.evaluate("!document.getElementById('dlg').hidden"):pg.keyboard.press('Escape');pg.wait_for_timeout(100)
    print('off',pg.evaluate("[QCOM.filter(q=>q.off).length,QPRI.filter(q=>q.off).length,Object.keys(PUZ).length]"))
    for i,(a,bb) in enumerate(pg.evaluate("QCOM.map(q=>[q.a,q.b])")):
        go(a);pg.evaluate(f"SC.qcom(LV.props.find(p=>p.id==='qa{i}'))");pg.wait_for_timeout(100);pg.keyboard.press('Escape');pg.wait_for_timeout(100)
        go(bb);r1=pg.evaluate(f"(()=>{{const c=LV.props.find(p=>p.id==='qb{i}');useProp(c);return [c.x,c.y,has(QCOM[{i}].it),questLines().length]}})()")
        go(a);r2=pg.evaluate(f"(()=>{{const g=S.gold;SC.qcom(LV.props.find(p=>p.id==='qa{i}'));return [S.gold-g,S.flags['q_'+QCOM[{i}].it],questLines().length]}})()");print(a,bb,r1,r2)
    for i,lv in enumerate(pg.evaluate("QPRI.map(q=>q.lv)")):
        go(lv);pg.evaluate(f"SC.qpri(LV.props.find(p=>p.id==='qp{i}'))");pg.wait_for_timeout(100);pg.keyboard.press('Escape');pg.wait_for_timeout(100)
        r=pg.evaluate(f"(()=>{{const m=LS.mons.find(m=>m.t===QPRI[{i}].id),g=S.gold;if(!m)return 'ABSENT';const hp=m.hpM;m.hp=0;questTick();return [m.x,m.y,hp,MON[m.t].n,S.gold-g,S.flags['q_'+QPRI[{i}].id]]}})()");print(lv,r)
    print(pg.evaluate("JOURNAL().length"),errs[:4]);b.close()
