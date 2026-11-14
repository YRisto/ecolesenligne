import sys,json
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox']);pg=b.new_context().new_page()
    pg.goto('file://'+sys.argv[1]+'?hd');pg.wait_for_selector('#tNew');pg.wait_for_timeout(1200)
    r=pg.evaluate("""()=>{const o=[];for(const id in LEVELS){const L=LEVELS[id];let fl=0,ni=0,ch=0;for(const row of L.map)for(const c of row){if('.dDLgG'.includes(c))fl++;if(c==='N')ni++;}
      const its=(L.items||[]).length,props=(L.props||[]).filter(p=>p.k==='chest'||p.loot||p.it).length,mk={};(L.mons||[]).forEach(m=>mk[m.k||m.t]=(mk[m.k||m.t]||0)+1);
      o.push({id,theme:L.theme,w:L.map[0].length,h:L.map.length,fl,mons:(L.mons||[]).length,kinds:mk,items:its,niches:ni,props:(L.props||[]).length,loot:props,npcs:(L.npcs||[]).length});}return o}""")
    tm=ti=0
    for x in r:print(x['id'],x['theme'],f"{x['w']}x{x['h']}",'cases',x['fl'],'ennemis',x['mons'],x['kinds'],'objets au sol',x['items'],'niches',x['niches'],'meubles',x['props'],'pnj',x['npcs']);tm+=x['mons'];ti+=x['items']+x['niches']
    print('moyenne ennemis',tm/len(r),'objets+niches',ti/len(r),'niveaux',len(r));b.close()
