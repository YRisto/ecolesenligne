import sys,json
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox']);pg=b.new_page();pg.goto('file://'+sys.argv[1]);pg.wait_for_selector('#tNew');pg.wait_for_timeout(500)
    r=pg.evaluate("""()=>{const o={};o.mon=Object.fromEntries(Object.entries(MON).map(([k,m])=>[k,[m.n,m.spr||'',m.ty,m.rng||0,m.reach||0,m.sc,m.boss||0,m.mode||'',!!SHEET[m.spr||k]]]));
     const np={};for(const lv in LEVELS)for(const n of LEVELS[lv].npcs||[]){(np[n.spr]=np[n.spr]||[]).push(lv+':'+n.id);}o.npc=Object.fromEntries(Object.entries(np).map(([k,v])=>[k,[!!SHEET[k],!!SPR[k],v.join(' ')]]));
     o.spr=Object.keys(SPR);o.themes=[...new Set(Object.values(LEVELS).map(l=>l.theme+'/'+(l.sky||0)+'/'+(l.dark?1:0)))];o.lv=Object.fromEntries(Object.entries(LEVELS).map(([k,l])=>[k,l.theme]));o.tx=Object.keys(TX);o.txk=Object.keys(TX.stone);o.props=[...new Set(Object.values(LEVELS).flatMap(l=>(l.props||[]).map(p=>p.k)))];o.ch=Object.keys(CH);return o}""")
    for k,v in r['mon'].items():print('MON',k,v)
    for k,v in r['npc'].items():print('NPC',k,v)
    for k in('spr','themes','lv','tx','txk','props','ch'):print(k,r[k])
    b.close()
