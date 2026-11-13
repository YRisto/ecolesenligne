# prologue en lecture automatique sur le site : aucune réplique ne doit être coupée par le passage automatique
from playwright.sync_api import sync_playwright
import sys
with sync_playwright() as p:
    br=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox','--autoplay-policy=no-user-gesture-required']);errs=[]
    c=br.new_context(viewport={'width':1280,'height':800});pg=c.new_page();pg.on('pageerror',lambda e:errs.append(str(e)[:300]))
    pg.goto('http://localhost:8766/landoflord/');pg.wait_for_selector('#tNew');pg.wait_for_timeout(300);pg.mouse.click(5,5)
    pg.evaluate("""()=>{audioOn();window.CUT=[];window.PLAYED=0;const s0=voxStop;voxStop=function(){if(voxSrc){const p=voxPos();PLAYED++;CUT.push(+p.toFixed(2));}else if(voxWait)CUT.push(-1);return s0();};const v0=vox;window.LAT=[];vox=function(w,t){const r=v0(w,t);return r;};}""")
    pg.click('#tNew');pg.wait_for_timeout(500)
    # choisit la difficulté / le héros si demandé, sinon laisse filer
    for sel in ['[data-diff="1"]']:
        if pg.locator(sel).count():pg.click(sel)
    T=int(sys.argv[1]) if len(sys.argv)>1 else 60
    for i in range(T//5):
        pg.wait_for_timeout(5000)
        st=pg.evaluate("({dlg:!$('dlg').hidden,cine:cineMode,q:DQ.length,hs:!$('heroSel').hidden,sp:speaker,src:!!voxSrc,cut:CUT.slice()})")
        if st['hs'] or not st['dlg']:break
    print(st);print('ERR',errs);br.close()
