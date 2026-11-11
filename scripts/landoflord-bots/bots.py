import json,sys,time,random
from playwright.sync_api import sync_playwright
URL='file:///home/claude/jeu/index.html';BOTJS=open('/home/claude/test/bot.js').read()
PRU=dict(healAt=.5,restAt=.6,items=1);FON=dict(healAt=.3,restAt=.35,items=1,hunt=1);STR=dict(healAt=.5,restAt=.6,items=1,caster=1)
SIM=[
 ("01 Écuyer prudent",0,0,0,PRU),("02 Écuyer fonceur",0,0,2,FON),("03 Capitaine prudent",1,0,0,PRU),("04 Capitaine fonceur",1,0,2,FON),
 ("05 Capitaine stratège",1,2,1,STR),("06 Capitaine avare",1,1,1,dict(healAt=.4,restAt=.6,items=0,noshop=1)),("07 Capitaine sans repos",1,2,0,dict(healAt=.5,norest=1,items=1,caster=1)),
 ("08 Capitaine explorateur",1,1,0,dict(healAt=.5,restAt=.6,items=1,explore=1,hunt=1,caster=1)),("09 Capitaine pressé",1,0,1,dict(speed=1,healAt=.4,restAt=.45,items=1)),
 ("10 Capitaine corrupteur",1,1,2,dict(PRU,sergent=2,hagen=1)),("11 Capitaine bluffeur",1,1,1,dict(PRU,sergent=1)),("12 Général prudent",2,0,0,PRU),
 ("13 Général fonceur",2,0,2,FON),("14 Général stratège",2,2,1,STR),("15 Général explorateur",2,2,0,dict(healAt=.5,restAt=.65,items=1,explore=1,hunt=1,caster=1)),
 ("16 Capitaine tireur",1,1,0,dict(PRU,ranged=1))]
def page(b,vp,touch=False):
    c=b.new_context(viewport=vp,has_touch=touch,is_mobile=touch);pg=c.new_page();errs=[];pg.on('pageerror',lambda e:errs.append(str(e)+' @ '+(e.stack or '')[:300]))
    pg.goto(URL);pg.wait_for_selector('#tNew');pg.wait_for_timeout(250);pg.evaluate(BOTJS);return pg,errs
def sim(b,runs=2):
    res=[]
    for name,diff,trempe,tent,style in SIM:
        for r in range(runs):
            pg,errs=page(b,{'width':1000,'height':700});t=time.time()
            try:o=pg.evaluate("P=>BOT.run(P)",dict(name=name,diff=diff,trempe=trempe,tent=tent,style=style,anselme=r%2,odon=r%3))
            except Exception as e:o=dict(name=name,levels=[],errors=['crash '+str(e)[:200]])
            o['errors']+=errs;o['secs']=round(time.time()-t,1);o['run']=r;res.append(o);pg.context.close()
            print(name,r,'|',' / '.join(f"{l['lv']}:{l['res']} {l['min']}min d{l['dead']} r{l['rests']} c{l['casts']} i{l['items']} hp{l['minHp']}%" for l in o['levels']),'|',o['errors'][:1],o.get('viol'),flush=True)
    return res
KEYS={'turn':lambda a:'Numpad7' if a['s']<0 else 'Numpad9','move':lambda a:'Numpad8','interact':lambda a:'Space','rest':lambda a:'KeyR','close':lambda a:'Escape'}
def ui(b,name,mode,secs=150):
    touch=mode=='touch';pg,errs=page(b,{'width':390,'height':780} if touch else {'width':1280,'height':800},touch)
    tap=(lambda sel:pg.tap(sel)) if touch else (lambda sel:pg.click(sel))
    def down(sel):
        if touch:pg.tap(sel)
        else:
            bb=None
            for _ in range(5):
                e=pg.query_selector(sel);bb=e.bounding_box() if e else None
                if bb:break
                pg.wait_for_timeout(40)
            if not bb:return
            pg.mouse.move(bb['x']+bb['width']/2,bb['y']+bb['height']/2);pg.mouse.down();pg.mouse.up()
    out=dict(name=name,errors=[],steps=0)
    try:
        if mode=='key':pg.focus('#tNew');pg.keyboard.press('Enter');pg.wait_for_timeout(80);pg.keyboard.press('Enter')
        else:tap('#tNew');tap('[data-diff="0"]')
        pg.wait_for_timeout(200);pg.evaluate("BOT.init({name:'ui',diff:0,trempe:0,tent:0,style:{healAt:.5,restAt:.6,items:1,caster:1}})")
        t0=time.time();lv='geoles'
        while time.time()-t0<secs:
            a=pg.evaluate("(()=>{const a=BOT.think();if(a.k==='use'||a.k==='equip')a.slot=S.bag.indexOf(a.id);if(a.k==='cast')a.si=S.strats.indexOf(a.id);return a})()");out['steps']+=1;k=a['k']
            if k in('done','softlock'):out['end']=k;break
            if k=='hero':
                if mode=='key':pg.keyboard.press('Digit1');pg.wait_for_timeout(120);pg.keyboard.press('Enter')
                else:tap('[data-hero="aldric"]');pg.wait_for_timeout(120);tap('#heroYes')
                continue
            if pg.evaluate("S&&S.lv") not in ('','geoles'):out['end']='niveau terminé';break
            if mode=='key':
                if k in KEYS:pg.keyboard.press(KEYS[k](a))
                elif k=='attack':pg.keyboard.press(f"F{a['i']+1}")
                elif k=='cast':pg.keyboard.press(f"F{a['i']+5}");pg.keyboard.press(f"Digit{a['si']+1}");pg.keyboard.press(f"Digit{a['lv']+1}")
                elif k in('use','equip'):
                    for _ in range(50):
                        if pg.evaluate("S.hand")==a['id']:break
                        pg.keyboard.press('Tab')
                    pg.keyboard.press(f"Digit{a['i']+1}");pg.keyboard.press('Escape') if pg.evaluate("!!S.hand") else None
                elif k=='dlg':pg.keyboard.press('Enter' if a['n']<0 else f"Digit{a['n']+1}")
                elif k=='buy':pg.click(f"[data-buy=\"{a['id']}\"]")
                else:pg.wait_for_timeout(50)
            else:
                if k=='turn':down('[data-mv="tl"]' if a['s']<0 else '[data-mv="tr"]')
                elif k=='move':down('[data-mv="f"]')
                elif k=='interact':
                    bb=pg.query_selector('#view').bounding_box();(pg.touchscreen.tap if touch else pg.mouse.click)(bb['x']+bb['width']/2,bb['y']+bb['height']*.75)
                elif k=='attack':down(f"[data-atk=\"{a['i']}\"]")
                elif k=='cast':
                    down(f"[data-spc=\"{a['i']}\"]");pg.wait_for_timeout(40)
                    if pg.query_selector(f"#pick [data-st=\"{a['id']}\"]"):down(f"#pick [data-st=\"{a['id']}\"]");pg.wait_for_timeout(40)
                    if pg.query_selector(f"#pick [data-lv=\"{a['lv']}\"]:not(:disabled)"):down(f"#pick [data-lv=\"{a['lv']}\"]")
                elif k in('use','equip'):
                    pg.evaluate(f"S.off={a['slot']};drawInv()");down(f"[data-slot=\"{a['slot']}\"]");down(f"[data-pt=\"{a['i']}\"]")
                    if pg.evaluate("!!S.hand"):pg.evaluate("stow()")
                elif k=='rest':tap('#bRest')
                elif k=='dlg':
                    bs=pg.query_selector_all('#dlgBtns button');(bs[0] if a['n']<0 else bs[a['n']]).tap() if touch else (bs[0] if a['n']<0 else bs[a['n']]).click()
                elif k=='buy':tap(f"[data-buy=\"{a['id']}\"]")
                elif k=='close':tap('#modal [data-close]')
                else:pg.wait_for_timeout(50)
            pg.wait_for_timeout(35 if k!='wait' else 20)
            if out['steps']%30==0:pg.evaluate("BOT.check()")
        out.update(pg.evaluate("({lv:S.lv,x:S.x,y:S.y,dead:BOT.mem.dead,hp:S.party.map(c=>c.hp+'/'+c.hpM).join(' '),strats:S.strats.length,viol:BOT.mem.viol,alive:LS.mons.filter(m=>m.hp>0&&!m.gone).length,stat:BOT.mem.stat})"))
        pg.screenshot(path=f"bot_{mode}.png")
    except Exception as e:
        import traceback;out['errors'].append('pilote: '+str(e)[:300]+' | '+traceback.format_exc()[-420:]+' | '+str(locals().get('a')))
    out['errors']+=errs;pg.context.close();print(name,'|',{k:v for k,v in out.items() if k!='stat'},flush=True);return out
def monkey(b,secs=75):
    pg,errs=page(b,{'width':1280,'height':800});random.seed(7);out=dict(name='20 Singe (entrées au hasard)',errors=[],steps=0)
    pg.click('#tNew');pg.click('[data-diff="1"]');pg.evaluate("BOT.init({name:'singe',diff:1,trempe:0,tent:0,style:{}})")
    keys=['Numpad7','Numpad8','Numpad9','Numpad4','Numpad5','Numpad6','ArrowUp','ArrowLeft','ArrowRight','KeyW','KeyA','KeyD','KeyQ','KeyE','F1','F2','F3','F4','F5','F6','F7','F8','Digit1','Digit2','Digit3','Digit4','Space','Enter','Tab','Escape','KeyR','KeyM','KeyC','KeyJ','KeyT','PageDown','PageUp']
    t0=time.time()
    try:
        while time.time()-t0<secs:
            r=random.random();out['steps']+=1
            if r<.6:pg.keyboard.press(random.choice(keys))
            elif r<.9:pg.mouse.click(random.uniform(120,1160),random.uniform(15,785),button='right' if random.random()<.15 else 'left')
            else:pg.mouse.wheel(0,random.choice([-120,120]))
            if out['steps']%40==0:
                pg.evaluate("BOT.check()")
                if pg.evaluate("!document.getElementById('title').hidden"):pg.click('#tNew');pg.click('[data-diff="1"]')
        out.update(pg.evaluate("({lv:S&&S.lv,viol:BOT.mem.viol,bag:S&&S.bag.length})"))
    except Exception as e:
        import traceback;out['errors'].append('pilote: '+str(e)[:300]+' | '+traceback.format_exc()[-420:]+' | '+str(locals().get('a')))
    out['errors']+=errs;pg.context.close();print(out['name'],'|',out,flush=True);return out
if __name__=='__main__':
    what=sys.argv[1] if len(sys.argv)>1 else 'all'
    with sync_playwright() as p:
        b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox']);R={}
        if what in('all','sim'):R['sim']=sim(b,int(sys.argv[2]) if len(sys.argv)>2 else 2)
        if what in('all','ui'):R['ui']=[ui(b,'17 Clavier seul','key'),ui(b,'18 Souris seule','mouse'),ui(b,'19 Tactile mobile','touch'),monkey(b)]
        json.dump(R,open(f'bots_{what}.json','w'),ensure_ascii=False,indent=1);b.close()
