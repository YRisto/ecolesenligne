import sys,re,json,base64,io
from playwright.sync_api import sync_playwright
html=sys.argv[1]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox']);pg=b.new_context(viewport={'width':1280,'height':800}).new_page()
    pg.goto('file://'+html+'?hd');pg.wait_for_selector('#tNew');pg.wait_for_timeout(1500)
    r=pg.evaluate("""()=>{const o=[];for(const lv in LEVELS)for(const n of LEVELS[lv].npcs||[])o.push([lv,n.id,n.spr,PORT[n.id]?n.id:(PORT[n.spr]?n.spr:null),(typeof NAMES!=='undefined'&&NAMES[n.id])||'']);return o}""")
    for x in r:print(x)
    json.dump(r,open('/home/claude/work/pairs.json','w'))
    b.close()
