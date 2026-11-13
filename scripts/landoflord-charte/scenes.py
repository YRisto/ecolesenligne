# Refait les « vues composées » des scènes avec les nouveaux décors et personnages.
import sys,base64,io
from playwright.sync_api import sync_playwright
from PIL import Image
html,out=sys.argv[1],sys.argv[2]
JS=r"""
async ([lv,mode])=>{
  const Wk=c=>c==='.'||c==='d'||c==='g';
  travel({lv});await new Promise(r=>setTimeout(r,300));
  if(mode==='crowd'&&!LS.mons.length){let bd=0,bk=0;for(let d=0;d<4;d++){let k=0;while(k<9&&Wk(cell(S.x+DX[d]*(k+1),S.y+DY[d]*(k+1))))k++;if(k>bk){bk=k;bd=d;}}
    const d=bd,T=['reitre','lancier','reitre','arbal','reitre','lancier','arbal','reitre'];let n=0;
    for(const[f,l]of[[2,-1],[3,1],[3,-2],[4,0],[4,2],[5,-1],[5,1],[4,-3]]){const x=S.x+DX[d]*f-DY[d]*l,y=S.y+DY[d]*f+DX[d]*l;if(Wk(cell(x,y)))LS.mons.push({t:T[n++%T.length],x,y,hp:10});}
    await new Promise(r=>setTimeout(r,120));anim=null;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const u=document.getElementById('view').toDataURL();LS.mons.length=0;return [n,u];}
  let best=null,bs=-1;
  for(let y=0;y<MH;y++)for(let x=0;x<MW;x++){if(!Wk(cell(x,y)))continue;for(let d=0;d<4;d++){let s=0;
    if(mode==='crowd'){for(const m of LS.mons){if(m.hp<=0||m.gone||m.hid)continue;const ax=m.x-x,ay=m.y-y,f=ax*DX[d]+ay*DY[d],l=Math.abs(ax*DY[d]-ay*DX[d]);if(f>=2&&f<=7&&l<=f*.7)s+=1+(f<5?.5:0);if(f>0&&f<2&&l<1)s-=3;}
      for(let k=1;k<=2;k++)if(!Wk(cell(x+DX[d]*k,y+DY[d]*k)))s-=1;}
    else if(mode==='one'){for(const m of LS.mons){if(m.hp<=0||m.gone||m.hid)continue;if(m.x===x+2*DX[d]&&m.y===y+2*DY[d]&&Wk(cell(x+DX[d],y+DY[d])))s=5+(Wk(cell(x+3*DX[d],y+3*DY[d]))?1:0)+(Wk(cell(x+4*DX[d],y+4*DY[d]))?1:0);}}
    else if(mode==='torch'){const wx=x+2*DX[d],wy=y+2*DY[d];if(Wk(cell(x+DX[d],y+DY[d]))&&cell(wx,wy)==='#'&&(wx*7+wy*13)%9===0){s=5;for(const m of LS.mons)if(Math.abs(m.x-x)+Math.abs(m.y-y)<4)s-=3;}}
    else if(mode==='room'){let k=0;while(k<8&&Wk(cell(x+DX[d]*(k+1),y+DY[d]*(k+1))))k++;s=k>=3&&k<=5?k:0;for(const p of LV.props||[]){const ax=p.x-x,ay=p.y-y,f=ax*DX[d]+ay*DY[d],l=Math.abs(ax*DY[d]-ay*DX[d]);if(f>=1&&f<=4&&l<=1)s+=2;}for(const m of LS.mons)if(Math.abs(m.x-x)+Math.abs(m.y-y)<6)s-=4;}
    if(s>bs){bs=s;best=[x,y,d];}}}
  S.x=best[0];S.y=best[1];S.d=best[2];anim=null;
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  return [bs,document.getElementById('view').toDataURL()];
}
"""
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    pg=b.new_context(viewport={'width':1280,'height':800}).new_page()
    pg.goto('file://'+html);pg.wait_for_selector('#tNew');pg.wait_for_timeout(600)
    pg.click('#tNew');pg.wait_for_timeout(200);pg.click('[data-diff="0"]');pg.wait_for_timeout(800)
    for i in range(60):
        st=pg.evaluate("({hero:!document.getElementById('heroSel').hidden,dlg:!document.getElementById('dlg').hidden})")
        if st['hero']:pg.click('[data-hero="aldric"]');pg.wait_for_timeout(200);pg.click('#heroYes');pg.wait_for_timeout(500);continue
        if st['dlg']:
            pg.keyboard.press('Escape');pg.wait_for_timeout(150)
            if pg.evaluate("!document.getElementById('dlg').hidden"):pg.keyboard.press('Enter');pg.wait_for_timeout(120)
            continue
        if pg.evaluate("typeof S!=='undefined'&&S&&S.lv"):break
        pg.wait_for_timeout(200)
    for name,lv,mode in [('s_battle','bataille','crowd'),('s_camp','camp','one'),('s_tent','camp','torch'),('s_cabinet','palais3','room'),('s_cell','geoles','room'),('s_mine','mine','room'),('s_abbey','abbaye','room'),('s_village','village','room'),('s_forest','foret','room'),('s_marsh','marais','room'),('s_crypt','crypte','room'),('s_palace','cour','room')]:
        sc,d=pg.evaluate(JS,[lv,mode]);im=Image.open(io.BytesIO(base64.b64decode(d.split(',')[1]))).convert('RGB').crop((0,25,400,225));im.save(f'{out}/{name}.png');print(name,sc)
        for _ in range(6):
            if pg.evaluate("!document.getElementById('dlg').hidden"):pg.keyboard.press('Escape');pg.wait_for_timeout(100)
    b.close()
