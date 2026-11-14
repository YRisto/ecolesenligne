import sys,json
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox']);pg=b.new_page();pg.goto('file://'+sys.argv[1]);pg.wait_for_selector('#tNew');pg.wait_for_timeout(500)
    r=pg.evaluate("""()=>{const o={};for(const k in LEVELS){const l=LEVELS[k];o[k]={niche:l.niche,btn:l.btn,hid:l.hid,vault:l.vault};}o.items=Object.fromEntries(Object.entries(ITEMS).filter(([k,i])=>i.k==='main'||i.k==='corps'||i.k==='appoint'||i.k==='tete').map(([k,i])=>[k,[i.n,i.k,i.dmg||'',i.spd||'',i.prot||'',i.p,i.pierce||'',i.reach||'',i.m||'',i.ty||'']]));o.wm=typeof WM!=='undefined'?1:0;return o}""")
    for k,v in r.items():
        print(k,json.dumps(v,ensure_ascii=False)[:1100])
    b.close()
