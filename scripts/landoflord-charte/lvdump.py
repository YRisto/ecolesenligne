import sys,json
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox']);pg=b.new_page();pg.goto('file://'+sys.argv[1]);pg.wait_for_selector('#tNew');pg.wait_for_timeout(400)
    r=pg.evaluate("(lv)=>{const l=LEVELS[lv];return {map:l.map,start:l.start,obj:l.obj,next:l.next,locks:l.locks,levers:l.levers,seq:l.seq,glyph:l.glyph,ports:l.ports,links:l.links,rooms:l.rooms,fx:l.fx,btn:l.btn,signs:l.signs,sgates:l.sgates,vault:l.vault,trig:l.trig,keys:(l.mons||[]).filter(m=>m[3]).map(m=>m),chests:(l.props||[]).filter(p=>p.k==='chest'||p.sc).map(p=>[p.id,p.k,p.x,p.y,p.key||'',JSON.stringify(p.loot||''),p.sc||'']),items:(l.items||[]).filter(i=>/cle|key/.test(i[0]))}}",sys.argv[2])
    for y,row in enumerate(r.pop('map')):print('%2d'%y,row)
    print('   '+''.join(str(i%10) for i in range(32)))
    for k,v in r.items():print(k,json.dumps(v,ensure_ascii=False)[:700])
    b.close()
