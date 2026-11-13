# voix : lecture à l'affichage, coupure au passage, bouche calée, musique baissée, réplique sans voix, réglage non, boutique
import json,os
from playwright.sync_api import sync_playwright
L=json.load(open('/home/claude/vox/lignes.json'));have=[x for x in L if os.path.exists('/home/claude/vox/mp3/%s.mp3'%x['k'])]
a=next(x for x in have if x['who']=='brune');b=next(x for x in have if x['who'] not in('brune','narr'))
with sync_playwright() as p:
    br=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox','--autoplay-policy=no-user-gesture-required']);errs=[];req=[]
    c=br.new_context(viewport={'width':1280,'height':800});pg=c.new_page();pg.on('pageerror',lambda e:errs.append(str(e)[:300]));pg.on('request',lambda r:req.append(r.url.split('/')[-1]) if '/vox/' in r.url else None)
    pg.goto('http://localhost:8766/landoflord/');pg.wait_for_selector('#tNew');pg.wait_for_timeout(300);pg.mouse.click(5,5)
    pg.evaluate("""()=>{audioOn();$('title').hidden=true;newGame(1);let n=0;while(!$('dlg').hidden&&n++<400){twDone();const bs=[...$('dlgBtns').querySelectorAll('button')];(bs[0]||{click(){}}).click();}}""")
    print('clé identique py/js:',pg.evaluate("([w,t])=>voxKey(w,t)",[a['who'],a['t']])==a['k'],'| table:',pg.evaluate("Object.keys(VOX).length"),'| AC:',pg.evaluate("AC&&AC.state"))
    pg.evaluate("([a,b])=>say([[a.who,a.t],[b.who,b.t],['pepin','Ceci est une réplique sans enregistrement, pour voir.']])",[a,b])
    print('affichage, attente:',pg.evaluate("[voxWait,voxLine,!!voxSrc]"));pg.wait_for_timeout(900)
    r=pg.evaluate("()=>{const o=[];for(let i=0;i<1;i++);return{src:!!voxSrc,pos:+voxPos().toFixed(2),dur:+voxDur.toFixed(1),duck:duckF,mus:+MUS.volume.toFixed(3),sp:speaker}}");print('après 0,9 s:',r)
    ms=[];
    for i in range(12):ms.append(pg.evaluate("faceState(performance.now(),0).mo"));pg.wait_for_timeout(110)
    print('bouches:',ms)
    pg.evaluate("twDone();nextLine()");pg.wait_for_timeout(700);print('réplique 2:',pg.evaluate("[!!voxSrc,+voxPos().toFixed(2),speaker]"))
    pg.evaluate("twDone();nextLine()");pg.wait_for_timeout(300);print('réplique 3 (sans voix):',pg.evaluate("[!!voxSrc,voxLine,duckF,faceState(performance.now(),0).talking]"))
    pg.evaluate("twDone();nextLine()");print('dialogue fermé:',pg.evaluate("[$('dlg').hidden,!!voxSrc]"))
    # fin naturelle
    pg.evaluate("([a])=>say([[a.who,a.t]])",[a]);pg.wait_for_timeout(int(a and 1000*pg.evaluate("voxDur"))+1500);print('fin naturelle:',pg.evaluate("[!!voxSrc,duckF,faceState(performance.now(),0).talking]"));pg.evaluate("twDone();nextLine()")
    # réglage non
    pg.evaluate("PREF.vox=0");pg.evaluate("([a])=>say([[a.who,a.t]])",[a]);pg.wait_for_timeout(500);print('voix non:',pg.evaluate("[!!voxSrc,voxLine,faceState(performance.now(),0).talking]"));pg.evaluate("twDone();nextLine();PREF.vox=1")
    pg.evaluate("optModal()");print('réglages:',[t for t in pg.locator('#modalBox button span').all_inner_texts() if 'oix' in t]);pg.click('[data-m="vv"]');print('volume ->',pg.evaluate("PREF.vv"));pg.click('[data-m="vox"]');print('voix ->',pg.evaluate("PREF.vox"),pg.locator('[data-m="vv"]').count());pg.evaluate("PREF.vox=1;savePref();closeModal()")
    pg.evaluate("openShop('fulbert')");pg.wait_for_timeout(700);print('boutique:',pg.locator('.shop').count(),'voix du marchand:',pg.evaluate('[voxLine,!!voxSrc]'));pg.evaluate("closeModal()")
    print('fichiers demandés:',len(req),len(set(req)));print('ERR',errs);br.close()
