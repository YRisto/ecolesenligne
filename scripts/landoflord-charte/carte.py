# Le plan façon Lands of Lore : parchemin déchiré, encre brune, murs épais à l'ombre portée, légende manuscrite ; sorties signalées.
import re
JS_BG = r"""function mapBg(W,H,torn){const k=W+'x'+H+(torn?'t':'');if(MAPBG[k])return MAPBG[k];const c=document.createElement('canvas');c.width=W;c.height=H;const g=c.getContext('2d');let s=W*31+H;const r=()=>(s=(s*1103515245+12345)&0x7fffffff)/0x7fffffff;
 g.fillStyle='#cfae78';g.fillRect(0,0,W,H);
 for(let i=0;i<W*H/900;i++){const x=r()*W,y=r()*H,rad=12+r()*60,gr=g.createRadialGradient(x,y,0,x,y,rad);gr.addColorStop(0,r()<.55?'rgba(122,82,38,.13)':'rgba(240,216,160,.20)');gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.fillRect(x-rad,y-rad,rad*2,rad*2);}
 for(let i=0;i<W*H/26;i++){g.fillStyle=r()<.5?'rgba(96,62,26,.08)':'rgba(250,232,186,.10)';g.fillRect(r()*W|0,r()*H|0,1+(r()*3|0),1);}
 if(torn){g.strokeStyle='rgba(110,74,34,.16)';g.lineWidth=1.2;for(const f of[.34,.67]){g.beginPath();g.moveTo(W*f+r()*4,0);g.lineTo(W*f+r()*4,H);g.stroke();g.beginPath();g.moveTo(0,H*f+r()*4);g.lineTo(W,H*f+r()*4);g.stroke();}
  for(let i=0;i<5;i++){const x=r()*W,y=r()*H,rad=14+r()*30;g.strokeStyle='rgba(100,60,24,.14)';g.lineWidth=2+r()*3;g.beginPath();g.arc(x,y,rad,r()*6,r()*6+3+r()*3);g.stroke();}}
 const e=Math.max(8,Math.min(W,H)*(torn?.11:.09));for(const[x0,y0,x1,y1,a,b,cw,ch]of[[0,0,e,0,0,0,e,H],[W,0,W-e,0,W-e,0,e,H],[0,0,0,e,0,0,W,e],[0,H,0,H-e,0,H-e,W,e]]){const gr=g.createLinearGradient(x0,y0,x1,y1);gr.addColorStop(0,'rgba(74,44,16,.5)');gr.addColorStop(1,'rgba(74,44,16,0)');g.fillStyle=gr;g.fillRect(a,b,cw,ch);}
 if(torn){g.fillStyle='#120b06';const jag=(n,f)=>{g.beginPath();f(0,0,1);for(let i=0;i<=n;i++){const d=(i%7===3?6:2)+r()*5;f(i/n,d,0);}f(1,0,0);g.closePath();g.fill();};
  jag(W/9|0,(t,d,m)=>m?g.moveTo(0,0):g.lineTo(t*W,d));jag(W/9|0,(t,d,m)=>m?g.moveTo(0,H):g.lineTo(t*W,H-d));jag(H/9|0,(t,d,m)=>m?g.moveTo(0,0):g.lineTo(d,t*H));jag(H/9|0,(t,d,m)=>m?g.moveTo(W,0):g.lineTo(W-d,t*H));}
 try{vga(c,10);}catch(e){}return MAPBG[k]=c;}
"""
JS_PAINT = r"""function paintMap(g,cs,id){id=id||S.lv;const W=MW*cs,H=MH*cs,INK='#42260f',K=new Set(),mkd=(S.marks||{})[id]||{},nt=LS.nt||{},pr=LS.pr||{},PP={},small=cs<8,pad=small?0:Math.round(cs*1.6);for(const p of LV.props||[])PP[p.x+','+p.y]=p;
 const ch=(x,y)=>(x<0||y<0||x>=MW||y>=MH)?'#':cell(x,y),open=c=>'.dDLgG'.includes(c),seen=(x,y)=>LS.seen[x+','+y],orig=(x,y)=>LV.map[y][x],ic=(k,x,y,st)=>{K.add(k);if(!small||'you door lock gate up down exit'.includes(k))mapIcon(g,k,x*cs,y*cs,cs,st);},hs=(x,y,n)=>((x*73856093^y*19349663^n*83492791)>>>0)%1000/1000;
 g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,W+2*pad,H+2*pad);g.drawImage(mapBg(W+2*pad,H+2*pad,!small),0,0);g.translate(pad,pad);
 const t=Math.max(1.5,cs*.26),sh=small?0:Math.max(1.5,cs*.2),wob=small?0:cs*.05;
 // ombre portée des murs, vers le sud-est, comme sur les plans de Gladstone
 if(sh){g.fillStyle='rgba(74,44,16,.30)';for(let y=0;y<MH;y++)for(let x=0;x<MW;x++){if(!seen(x,y)||!open(ch(x,y)))continue;const X=x*cs,Y=y*cs;if(!open(ch(x,y+1)))g.fillRect(X+sh,Y+cs+t,cs,sh);if(!open(ch(x+1,y)))g.fillRect(X+cs+t,Y+sh,sh,cs);}}
 // sols explorés : dallage clair
 for(let y=0;y<MH;y++)for(let x=0;x<MW;x++){if(!seen(x,y)||!open(ch(x,y)))continue;g.fillStyle=hs(x,y,1)<.5?'#ecdcae':'#e6d3a2';g.fillRect(x*cs,y*cs,cs,cs);if(!small){g.fillStyle='rgba(126,92,48,.20)';g.fillRect(x*cs,y*cs,cs,1);g.fillRect(x*cs,y*cs,1,cs);if(!open(ch(x,y-1))){g.fillStyle='rgba(74,44,16,.16)';g.fillRect(x*cs,y*cs,cs,cs*.22);}if(!open(ch(x-1,y))){g.fillStyle='rgba(74,44,16,.16)';g.fillRect(x*cs,y*cs,cs*.22,cs);}}}
 // murs : trait épais à la plume, un peu irrégulier, liseré clair côté lumière
 for(let y=0;y<MH;y++)for(let x=0;x<MW;x++){if(!seen(x,y)||!open(ch(x,y)))continue;const X=x*cs,Y=y*cs,w=n=>(hs(x,y,n)-.5)*2*wob;
  const seg=(a,b,c,d,hl)=>{g.fillStyle=INK;g.fillRect(a,b,c,d);if(!small){g.fillStyle='rgba(150,104,56,.75)';hl?g.fillRect(a,b,c,Math.max(1,t*.22)):g.fillRect(a,b,Math.max(1,t*.22),d);}};
  if(!open(ch(x,y-1)))seg(X-t/2,Y-t+w(2),cs+t,t,1);if(!open(ch(x,y+1)))seg(X-t/2,Y+cs+w(3),cs+t,t,1);if(!open(ch(x-1,y)))seg(X-t+w(4),Y-t/2,t,cs+t,0);if(!open(ch(x+1,y)))seg(X+cs+w(5),Y-t/2,t,cs+t,0);}
 // pictogrammes
 const lab=[];
 for(let y=0;y<MH;y++)for(let x=0;x<MW;x++){if(!seen(x,y))continue;const c=ch(x,y),o=orig(x,y),k=x+','+y,h=!open(ch(x-1,y))&&!open(ch(x+1,y));
  if(c==='D'||c==='d')ic('door',x,y,{open:c==='d',h});else if(c==='L')ic('lock',x,y,{h});else if(c==='G'||c==='g')ic('gate',x,y,{open:c==='g',h});
  else if(c==='V'||c==='v')ic('lever',x,y,{down:c==='v'});else if(c==='N')ic('niche',x,y,{empty:!!nt[k]});else if(c==='B'){if(nt[k])ic('btn',x,y);}
  else if(c==='W')ic('crack',x,y);else if(c==='F')ic('frail',x,y);else if(c==='Q')ic('medal',x,y,{down:seqDown(k)});else if(c==='I')ic('sign',x,y);else if(c==='M')ic('shop',x,y);else if(c==='A')ic('inn',x,y);
  else if(c==='<'){ic('up',x,y);lab.push([x,y,'montée']);}else if(c==='>'){ic('down',x,y);lab.push([x,y,'descente']);}else if(c==='X'){let d=0;for(let q=0;q<4;q++)if(open(ch(x+DX[q],y+DY[q])))d=(q+2)%4;ic('exit',x,y,{d});lab.push([x,y,'Sortie']);}
  if(c==='.'&&(o==='S'||o==='H'))ic('secret',x,y);if(c==='.'&&(o==='W'||o==='F'))ic('breach',x,y);
  const f=LV.fx&&LV.fx[k];if(f){if(f.t==='pit'){if(nt['p'+k])ic('pit',x,y);}else if(f.t==='plate'||f.t==='tplate')ic(f.t,x,y);else if(f.t==='dart')ic(nt['f'+k]?'dart':'plate',x,y,{d:f.d});else if(nt['f'+k])ic('spin',x,y);}
  const p=PP[k];if(p){const kk=p.k==='chest'?'chest':p.k==='fountain'||p.k==='well'?'fountain':p.k==='bell'?'bell':p.sc?'keg':'furn';ic(kk,x,y,{open:!!pr[p.id]});}
  if(npcAt(x,y))ic('npc',x,y);else if(open(c)&&itemsAt(x,y).length)ic('item',x,y);
  if(mkd[k])ic('mark',x,y);}
 if(!small){const FT='"Palatino Linotype","Book Antiqua",Palatino,Georgia,serif';
  // mentions à la plume : sorties et escaliers
  for(const[x,y,tx]of lab){const big=tx==='Sortie';g.font=`italic ${big?'bold ':''}${Math.round(cs*(big?.95:.78))}px ${FT}`;const tw=g.measureText(tx).width,right=(x+1)*cs+4+tw<W+pad-4;g.textAlign=right?'left':'right';g.textBaseline='middle';const tx0=right?(x+1)*cs+t+3:x*cs-t-3,ty=y*cs+cs/2;g.lineWidth=3.5;g.strokeStyle='rgba(226,200,146,.92)';g.strokeText(tx,tx0,ty);g.fillStyle=big?'#1f5a2a':'#4a2468';g.fillText(tx,tx0,ty);}
  // numéros des lieux, dans un rond d'encre
  (LV.rooms||[]).forEach((r,i)=>{let s=false;for(let y=r.y;y<r.y+r.h&&!s;y++)for(let x=r.x;x<r.x+r.w;x++)if(seen(x,y)){s=true;break;}if(!s)return;const cx=(r.x+r.w/2)*cs,cy=(r.y+r.h/2)*cs,R=cs*.62;g.fillStyle='rgba(236,220,174,.85)';g.beginPath();g.arc(cx,cy,R,0,7);g.fill();g.strokeStyle='#7a1e12';g.lineWidth=1.2;g.stroke();g.font=`bold ${Math.round(cs*.8)}px ${FT}`;g.textAlign='center';g.textBaseline='middle';g.fillStyle='#7a1e12';g.fillText(i+1,cx,cy+1);});
  // rose des vents
  const rx=W+pad*.1-cs*1.3,ry=H+pad*.1-cs*1.3,R=cs*1.7;g.save();g.translate(rx,ry);g.globalAlpha=.8;g.strokeStyle=INK;g.lineWidth=1;g.beginPath();g.arc(0,0,R*.62,0,7);g.stroke();g.beginPath();g.arc(0,0,R*.5,0,7);g.stroke();
  for(let k=0;k<8;k++){g.save();g.rotate(k*Math.PI/4);const L=k&1?R*.55:R;g.beginPath();g.moveTo(0,-L);g.lineTo(L*.17,0);g.lineTo(0,0);g.closePath();g.fillStyle=k?INK:'#8e1c12';g.fill();g.beginPath();g.moveTo(0,-L);g.lineTo(-L*.17,0);g.lineTo(0,0);g.closePath();g.fillStyle='#e6d3a2';g.fill();g.stroke();g.restore();}
  g.font=`bold ${Math.round(cs*.85)}px ${FT}`;g.textAlign='center';g.textBaseline='bottom';g.fillStyle='#8e1c12';g.fillText('N',0,-R-1);g.restore();
  // cartouche du lieu
  const nm=LEVELS[id].name;g.font=`italic bold ${Math.round(cs*.95)}px ${FT}`;g.textAlign='left';g.textBaseline='middle';const tw=g.measureText(nm).width,bx=-pad*.35,by=-pad*.62;g.fillStyle='rgba(236,220,174,.7)';g.fillRect(bx,by-cs*.62,tw+cs*1.2,cs*1.24);g.strokeStyle=INK;g.lineWidth=1.2;g.strokeRect(bx,by-cs*.62,tw+cs*1.2,cs*1.24);g.strokeRect(bx+2.5,by-cs*.62+2.5,tw+cs*1.2-5,cs*1.24-5);g.fillStyle=INK;g.fillText(nm,bx+cs*.6,by+1);}
 if(id===S.lv)ic('you',S.x,S.y,{d:S.d});g.setTransform(1,0,0,1,0,0);MAPK=K;}
"""
JS_EXIT_ICON = r"""case'exit':{g.fillStyle='#1f5a2a';g.beginPath();g.moveTo(X+1.2*u,Y+cs-u);g.lineTo(X+1.2*u,m-u);g.quadraticCurveTo(X+1.2*u,Y+u,c,Y+u);g.quadraticCurveTo(X+cs-1.2*u,Y+u,X+cs-1.2*u,m-u);g.lineTo(X+cs-1.2*u,Y+cs-u);g.closePath();g.fill();g.strokeStyle='#0e2c14';g.stroke();tri(st.d||0,'#f4e6a8',2.2);break;}"""
# où est la sortie : direction sur le plan, lieu voisin, obstacle
JS_SORTIE = r"""const SORTIE=()=>{const c=[];for(let y=0;y<MH;y++)for(let x=0;x<MW;x++){const k=cell(x,y);if(k==='X')c.push([x,y,k]);}
 if(!c.length&&LV.next)for(const k in LV.links||{})if(LV.links[k].lv===LV.next){const[x,y]=k.split(',').map(Number);c.push([x,y,cell(x,y)]);}
 if(!c.length)return'';let x0=MW,x1=0,y0=MH,y1=0;for(let y=0;y<MH;y++)for(let x=0;x<MW;x++)if('.dDLgG'.includes(cell(x,y))){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
 return'<p><b>La sortie.</b> '+c.map(([x,y,k])=>{const fx=(x-x0)/Math.max(1,x1-x0),fy=(y-y0)/Math.max(1,y1-y0),ns=fy<.36?'nord':fy>.64?'sud':'',eo=fx<.36?'ouest':fx>.64?'est':'',dir=ns&&eo?'au '+ns+'-'+eo:ns?'au '+ns:eo?"à l'"+eo:'au centre';
  let best=null,bd=7;(LV.rooms||[]).forEach((r,i)=>{const dx=Math.max(r.x-x,0,x-(r.x+r.w-1)),dy=Math.max(r.y-y,0,y-(r.y+r.h-1)),d=dx+dy;if(d<bd){bd=d;best=[i,r];}});
  let lock=false;for(let q=0;q<4;q++)if(cell(x+DX[q],y+DY[q])==='L')lock=true;
  const d0=dir+' du plan';return(k==='<'?"Un escalier montant, "+d0:k==='>'?"Un escalier descendant, "+d0:d0[0].toUpperCase()+d0.slice(1))+(best?', '+(bd?'près de':'dans')+' « '+best[1].n+' » (lieu n° '+(best[0]+1)+')':'')+(lock?', derrière une porte verrouillée':'')+(LS.seen[x+','+y]?' — déjà portée sur votre carte':'')+'. Une lanterne allumée la signale.';}).join(' ')+'</p>';};
"""
JS_LANT = r"""function pLant(g){const gr=g.createRadialGradient(64,13,1,64,13,30);gr.addColorStop(0,'rgba(255,214,120,.85)');gr.addColorStop(.35,'rgba(255,170,70,.32)');gr.addColorStop(1,'rgba(255,150,50,0)');g.fillStyle=gr;g.fillRect(30,0,68,46);
 g.fillStyle='#1c120a';g.fillRect(63,0,2,5);g.fillRect(58,5,12,2);g.fillRect(58,19,12,2);g.fillRect(58,5,2,16);g.fillRect(68,5,2,16);g.fillStyle='#ffe9a0';g.fillRect(60,7,8,12);g.fillStyle='#fff8d8';g.fillRect(62,10,4,7);g.fillStyle='#1c120a';g.fillRect(63,7,1,12);}
"""
CSS = r"""
.box.mapM{background:#cfae78!important;color:#42260f!important;border:5px solid #1c120a!important;box-shadow:inset 0 0 0 2px #7a5a2c,inset 0 0 40px rgba(74,44,16,.55),0 6px 30px rgba(0,0,0,.8)!important;font-family:"Palatino Linotype","Book Antiqua",Palatino,Georgia,serif}
.box.mapM h2{display:none}
.box.mapM #mapC{border:0;background:#120b06;box-shadow:0 3px 10px rgba(30,16,4,.6);image-rendering:auto}
.box.mapM .legend,.box.mapM .rooms,.box.mapM .dim{color:#42260f!important;font-style:italic}
.box.mapM .legend{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:2px 10px;font-size:13px;border-top:1px solid rgba(66,38,15,.5);border-bottom:1px solid rgba(66,38,15,.5);padding:6px 0}
.box.mapM .legend span{margin:0;white-space:normal}.box.mapM .legend .mi{border:0;background:none}
.box.mapM .lgT{font-variant:small-caps;font-weight:bold;letter-spacing:1px;font-size:14px;margin:6px 0 2px;color:#7a1e12;font-style:normal}
.box.mapM .rooms b{background:none;color:#7a1e12;border:1px solid #7a1e12}
.box.mapM .tabs button{background:rgba(236,220,174,.55)!important;color:#42260f!important;border:1px solid #6a4a22!important;font-family:inherit;font-style:italic;box-shadow:none!important}.box.mapM .tabs button.on{background:#42260f!important;color:#ecdcae!important}
.box.mapM #mapNote{background:rgba(236,220,174,.7);border:1px solid #6a4a22;color:#42260f;font-family:inherit;font-style:italic}
.box.mapM .row button{background:#42260f!important;color:#ecdcae!important;border:1px solid #1c120a!important;font-family:inherit;box-shadow:none!important}
@media(min-width:900px){body:not(.ls) .box.mapM{display:grid;grid-template-columns:auto minmax(220px,300px);column-gap:16px;align-content:start;max-width:96vw!important;width:auto!important}
body:not(.ls) .box.mapM>*{grid-column:2;min-width:0}
body:not(.ls) .box.mapM>#mapC{grid-column:1;grid-row:1/9;height:calc(100vh - 110px);width:auto;max-width:none;margin:0}
body:not(.ls) .box.mapM .legend{grid-template-columns:1fr 1fr}body:not(.ls) .box.mapM .rooms{display:block}body:not(.ls) .box.mapM .rooms span{display:block;margin:2px 0}}
"""
def apply(s, rep1, lite_cs=None):
    a=s.index("function mapBg(W,H){"); b=s.index("/* un pictogramme dans la case"); s=s[:a]+JS_BG+s[b:]
    a=s.index("function paintMap(g,cs,id){"); b=s.index("function miniMap(){"); s=s[:a]+JS_PAINT+s[b:]
    a=s.index("case'exit':"); b=s.index("case'plate':case'tplate':case'dart':"); s=s[:a]+JS_EXIT_ICON+"\n "+s[b:]
    # la fenêtre : toile avec marge, grande échelle sur ordinateur, légende titrée
    s=rep1(s,"cs=w>20?14:18,lg=","cs=window.LITE?(w>20?14:18):(w>20?22:28),pad=Math.round(cs*1.6),lg=")
    s=rep1(s,'<canvas id="mapC" width="${w*cs}" height="${hh*cs}"></canvas><div class="legend" id="mapLg"></div>','<canvas id="mapC" width="${w*cs+2*pad}" height="${hh*cs+2*pad}"></canvas><div class="lgT">Légende</div><div class="legend" id="mapLg"></div>')
    s=rep1(s,"g.fillStyle='#f1e4ba';g.fillRect(0,0,22,22);mapIcon(g,c.dataset.ico,2,2,18,","g.clearRect(0,0,22,22);mapIcon(g,c.dataset.ico,2,2,18,")
    s=rep1(s,"x=(e.clientX-r.left)/r.width*w|0,y=(e.clientY-r.top)/r.height*hh|0,k=x+','+y;","x=Math.floor(((e.clientX-r.left)/r.width*cv.width-pad)/cs),y=Math.floor(((e.clientY-r.top)/r.height*cv.height-pad)/cs),k=x+','+y;")
    s=rep1(s,"<p class=\"dim\">Cliquez une case explorée pour y poser ou ôter un repère.</p>","<p class=\"dim\">Touchez une case explorée pour y poser ou ôter un repère.</p>")
    # journal : où est la sortie
    s=rep1(s,"const JOURNAL=()=>{const l=[`<p><b>Objectif.</b> ${LV.obj}</p>`,",JS_SORTIE+"const JOURNAL=()=>{const l=[`<p><b>Objectif.</b> ${LV.obj}</p>`,SORTIE(),")
    # dans la vue : une lanterne allumée au-dessus de chaque passage, et le passage reste éclairé de loin
    s=rep1(s,"function passTex(lv,c){",JS_LANT+"function passTex(lv,c){")
    s=rep1(s,"else pFlight(g,d[0]==='up',th==='palace'||th==='panel');})","else pFlight(g,d[0]==='up',th==='palace'||th==='panel');pLant(g);})")
    s=rep1(s,"exit:w(pExit)}","exit:w(g=>{pExit(g);pLant(g);})}")
    s=rep1(s,"const tl=isTorch(c,mx,my),a=clamp(1-lt(dist)*(tl?1.8:1)+(side?.1:0),0,.96);","const ex=c==='X'||c==='<'||c==='>',tl=isTorch(c,mx,my),a=clamp(1-lt(dist)*(tl?1.8:ex?2.4:1)+(side?.1:0),0,ex?.45:.96);")
    s=rep1(s,"<b>Escaliers</b> : ils relient les étages, dans les deux sens.","<b>Sorties et escaliers</b> : une lanterne allumée brûle au-dessus de chacun, visible de loin ; le journal dit de quel côté du plan chercher la sortie.")
    s=rep1(s,"</style>",CSS+"</style>",s.count("</style>")) if s.count("</style>")==1 else s.replace("</style>",CSS+"</style>",1)
    return s
