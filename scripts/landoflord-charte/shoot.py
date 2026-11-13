import sys,time,json,base64
from playwright.sync_api import sync_playwright
html,out=sys.argv[1],sys.argv[2]
JS=r"""
async (lv)=>{
  const W=c=>c==='.'||c==='d'||c==='g';
  travel({lv});await new Promise(r=>setTimeout(r,250));
  const shots=[];
  const snap=async(tag)=>{await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));shots.push([tag,document.getElementById('view').toDataURL()]);};
  await snap('start');
  const tg=[];for(const m of LS.mons)if(m.hp>0&&!m.gone&&!m.hid)tg.push(['m_'+m.t,m.x,m.y]);for(const n of LV.npcs)if(!LS.gone[n.id])tg.push(['n_'+n.id,n.x,n.y]);
  const seen={};let n=0;
  for(const[t,x,y]of tg){if(seen[t]||n>=5)continue;
    for(let k=0;k<4;k++){const ax=x-DX[k],ay=y-DY[k],bx=x-2*DX[k],by=y-2*DY[k];if(W(cell(ax,ay))&&W(cell(bx,by))){S.x=bx;S.y=by;S.d=k;anim=null;await snap(t+'_far');S.x=ax;S.y=ay;await snap(t+'_near');seen[t]=1;n++;break;}}}
  return shots;
}
"""
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    c=b.new_context(viewport={'width':1280,'height':800});pg=c.new_page();errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)[:300]))
    pg.goto('file://'+html);pg.wait_for_selector('#tNew');pg.wait_for_timeout(600)
    pg.click('#tNew');pg.wait_for_timeout(200);pg.click('[data-diff="0"]');pg.wait_for_timeout(800)
    for i in range(60):
        st=pg.evaluate("({hero:!document.getElementById('heroSel').hidden,dlg:!document.getElementById('dlg').hidden})")
        if st['hero']:
            pg.screenshot(path=f'{out}/ui_hero.png');pg.click('[data-hero="aldric"]');pg.wait_for_timeout(200);pg.click('#heroYes');pg.wait_for_timeout(500);continue
        if st['dlg']:
            if i==3:pg.screenshot(path=f'{out}/ui_intro.png')
            pg.keyboard.press('Escape');pg.wait_for_timeout(150);
            if pg.evaluate("!document.getElementById('dlg').hidden"):pg.keyboard.press('Enter');pg.wait_for_timeout(120)
            continue
        if pg.evaluate("typeof S!=='undefined'&&S&&S.lv"):break
        pg.wait_for_timeout(200)
    pg.wait_for_timeout(500);pg.screenshot(path=f'{out}/ui_game.png')
    for lv in sys.argv[3].split(','):
        try:
            for tag,d in pg.evaluate(JS,lv):
                open(f'{out}/{lv}_{tag}.png','wb').write(base64.b64decode(d.split(',')[1]))
            for _ in range(6):
                if pg.evaluate("!document.getElementById('dlg').hidden"):pg.keyboard.press('Escape');pg.wait_for_timeout(100)
        except Exception as e:print(lv,'ERR',str(e)[:300])
    print(errs[:5]);b.close()
