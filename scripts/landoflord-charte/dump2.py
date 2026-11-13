import sys,json
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox']);pg=b.new_page();pg.goto('file://'+sys.argv[1]);pg.wait_for_selector('#tNew');pg.wait_for_timeout(500)
    r=pg.evaluate("""()=>{const o={};o.lv=Object.fromEntries(Object.entries(LEVELS).map(([k,l])=>[k,{keys:Object.keys(l).join(','),size:l.map[0].length+'x'+l.map.length,mons:(l.mons||[]).length,items:(l.items||[]).length,npcs:(l.npcs||[]).map(n=>n.id).join(','),fx:Object.values(l.fx||{}).map(f=>f.t).join(','),trig:(l.trig||[]).length,seq:(l.seq||[]).length,props:(l.props||[]).length,cells:[...new Set(l.map.join(''))].sort().join('')}]));
     o.fn=Object.keys(window).filter(k=>typeof window[k]==='function'&&!/^(on|webkit)/.test(k)&&window[k].toString().indexOf('[native code]')<0).join(' ');
     o.S=typeof newGame==='function'?'':'';o.trig=JSON.stringify(LEVELS.geoles.trig).slice(0,900);o.fxs=JSON.stringify(LEVELS.egouts.fx||{}).slice(0,500);o.evk=typeof EV!=='undefined'?Object.keys(EV).join(' '):'';return o}""")
    for k,v in r['lv'].items():print(k,v)
    print('FN',r['fn']);print('TRIG',r['trig']);print('FX',r['fxs']);print('EV',r['evk'][:3000])
    b.close()
