# Intro en plans animés plein cadre, calée sur l'enchaînement de l'intro originale de Lands of Lore (logo, aube sur le château, cavalier au pont,
# messager dans la grande salle, gros plan du souverain, le lieu de l'ennemi, l'antre du traître, gros plan, puis le choix du personnage).
import os, json
from PIL import Image
WK = '/home/claude/work'
def pack(charte, uri):
    """Renvoie (images ordinateur, images mobile)."""
    hd = {}; lt = {}
    def grade(im, c=1.18, s=1.15, b=1.0):
        from PIL import ImageEnhance
        a = im.getchannel('A'); rgb = im.convert('RGB'); rgb = ImageEnhance.Contrast(rgb).enhance(c); rgb = ImageEnhance.Color(rgb).enhance(s); rgb = ImageEnhance.Brightness(rgb).enhance(b); rgb.putalpha(a); return rgb
    G = {'dawn': (1.45, 1.35, .92), 'bridge': (1.2, 1.2, 1.0), 'hall': (1.15, 1.15, 1.05), 'field': (1.2, 1.2, 1.05), 'throneback': (1.1, 1.1, 1.0), 'cabinet': (1.1, 1.1, 1.05), 'dark': (1.1, 1.1, 1.25), 'tent': (1.1, 1.1, 1.0)}
    for n, g in G.items():
        f = WK + '/intro/r_%s.png' % n
        if not os.path.exists(f): continue
        im = grade(Image.open(f).convert('RGBA'), *g)
        for dst, size, d in ((hd, (800, 400), 8), (lt, (400, 200), 8)):
            r = im.resize(size, Image.LANCZOS); a = r.getchannel('A').point(lambda v: 255 if v > 150 else 0); r.putalpha(a)
            dst['i_' + n] = uri(charte.quantize(r, dither=d))
    fr = [Image.open(WK + '/intro/rider/rider%d.png' % i).convert('RGBA') for i in range(8) if os.path.exists(WK + '/intro/rider/rider%d.png' % i)]
    if len(fr) == 8:
        for dst, (w, h) in ((hd, (180, 120)), (lt, (90, 60))):
            sh = Image.new('RGBA', (w * 8, h), (0, 0, 0, 0))
            for i, f in enumerate(fr):
                r = f.resize((w, h), Image.LANCZOS); a = r.getchannel('A').point(lambda v: 255 if v > 130 else 0); r.putalpha(a); sh.paste(r, (i * w, 0))
            dst['i_rider'] = uri(charte.quantize(sh, dither=0))
    return hd, lt

JS = r"""
/* ====== INTRO : plans animés plein cadre ====== */
(function(){
 const CW=window.LITE?400:800,CH=CW/2,K=CW/800,TAU=Math.PI*2;
 const cv=document.createElement('canvas');cv.id='dlgHD';cv.width=CW;cv.height=CH;cv.style.cssText='position:absolute;left:0;top:0;width:100%;height:100%;display:none;'+(window.LITE?'image-rendering:pixelated;':'');
 $('dlgImgW').insertBefore(cv,$('dlgFx'));let G=cv.getContext('2d');
 const img=k=>IMGEL['i_'+k],lerp=(a,b,t)=>a+(b-a)*t,cl=(v,a,b)=>Math.max(a==null?0:a,Math.min(b==null?1:b,v)),ease=t=>t*t*(3-2*t),mixc=(a,b,t)=>'rgb('+a.map((v,i)=>Math.round(lerp(v,b[i],t))).join(',')+')';
 const hs=n=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);};
 /* nuages : bruit fractal généré une fois, deux teintes */
 let CLD=null;function clouds(){if(CLD)return CLD;const W=512,H=128,c=mk(W,H,()=>{}),g=c.getContext('2d'),im=g.createImageData(W,H),d=im.data;
  const vn=(x,y)=>{const xi=Math.floor(x),yi=Math.floor(y),fx=x-xi,fy=y-yi,u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy),h=(a,b)=>hs(((a%64)+64)%64*57+b*131);return lerp(lerp(h(xi,yi),h(xi+1,yi),u),lerp(h(xi,yi+1),h(xi+1,yi+1),u),v);};
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){let n=0,a=.5,f=1;for(let o=0;o<4;o++){n+=a*vn(x/8*f/8*4,y/3.2*f/8*4+o*9);a*=.5;f*=2;}const v=cl((n-.50)*3.4)*cl(y/22)*cl((H-y)/40),i=(y*W+x)*4;d[i]=255;d[i+1]=236;d[i+2]=226;d[i+3]=v*230;}
  g.putImageData(im,0,0);return CLD=c;}
 function sky(top,mid,bot,h){const gr=G.createLinearGradient(0,0,0,CH);gr.addColorStop(0,top);gr.addColorStop(h||.45,mid);gr.addColorStop(Math.min(1,(h||.45)+.2),bot);gr.addColorStop(1,bot);G.fillStyle=gr;G.fillRect(0,0,CW,CH);}
 function cloudBand(t,sp,y,h,al,tint){const c=clouds(),x=-((t*sp)%512);G.save();G.globalAlpha=al;for(let k=0;k<3;k++)G.drawImage(c,(x+k*512)*K*1.6,y*K,512*K*1.6,h*K);if(tint){G.globalCompositeOperation='source-atop';}G.restore();}
 function cam(z,cx,cy){G.setTransform(K*z,0,0,K*z,(cx*800-cx*800*z)*K,(cy*400-cy*400*z)*K);}
 function uncam(){G.setTransform(1,0,0,1,0,0);}
 function plate(k){const im=img(k);if(im)G.drawImage(im,0,0,800,400);else{G.fillStyle='#0a0810';G.fillRect(0,0,800,400);}}
 function glowAt(x,y,r,col,a){G.save();G.globalCompositeOperation='lighter';const gr=G.createRadialGradient(x,y,0,x,y,r);gr.addColorStop(0,col.replace('A',a.toFixed(3)));gr.addColorStop(1,col.replace('A','0'));G.fillStyle=gr;G.fillRect(x-r,y-r,r*2,r*2);G.restore();}
 function bird(x,y,s,ph,col){G.strokeStyle=col;G.lineWidth=Math.max(1,s*.28);G.beginPath();const f=Math.sin(ph)*s*.55;G.moveTo(x-s,y-f);G.quadraticCurveTo(x-s*.4,y-s*.25-f*.3,x,y);G.quadraticCurveTo(x+s*.4,y-s*.25-f*.3,x+s,y-f);G.stroke();}
 function spr(key,fr,x,y,hp,flip){const M=SHEETS.meta[key],SH=SHEET[key];if(!M||!SH)return;const s=hp/M.h;G.save();G.imageSmoothingEnabled=false;G.translate(x,y);if(flip)G.scale(-1,1);G.fillStyle='rgba(0,0,0,.35)';G.beginPath();G.ellipse(0,0,M.w*s*.22,M.w*s*.06,0,0,TAU);G.fill();G.drawImage(SH,(fr%Math.min(4,M.n))*M.w,0,M.w,M.h,-M.ax*s,-M.ay*s,M.w*s,M.h*s);G.restore();}
 let SIL=null;function sil(key,fr,x,y,hp,flip){const M=SHEETS.meta[key],SHh=SHEET[key];if(!M||!SHh)return;if(!SIL)SIL=mk(260,260,()=>{});const g=SIL.getContext('2d');g.globalCompositeOperation='source-over';g.clearRect(0,0,260,260);g.imageSmoothingEnabled=false;g.drawImage(SHh,(fr%Math.min(4,M.n))*M.w,0,M.w,M.h,0,0,M.w,M.h);g.globalCompositeOperation='source-atop';g.fillStyle='rgba(12,7,5,.86)';g.fillRect(0,0,260,260);const s=hp/M.h;G.save();G.translate(x,y);if(flip)G.scale(-1,1);G.fillStyle='rgba(0,0,0,.4)';G.beginPath();G.ellipse(0,0,M.w*s*.24,M.w*s*.06,0,0,TAU);G.fill();G.imageSmoothingEnabled=true;G.drawImage(SIL,0,0,M.w,M.h,-M.ax*s,-M.ay*s,M.w*s,M.h*s);G.restore();}
 function vign(a){uncam();const gr=G.createRadialGradient(CW/2,CH*.5,CH*.45,CW/2,CH*.5,CW*.72);gr.addColorStop(0,'rgba(0,0,0,0)');gr.addColorStop(1,'rgba(0,0,0,'+a+')');G.fillStyle=gr;G.fillRect(0,0,CW,CH);}
 function motes(t,n,x0,y0,x1,y1,col){G.save();G.globalCompositeOperation='lighter';for(let i=0;i<n;i++){const x=x0+((hs(i)*(x1-x0)+t*(3+hs(i+9)*6))%(x1-x0)),y=y0+((hs(i+3)*(y1-y0)+t*(2+hs(i+5)*5)+Math.sin(t*.7+i)*6)%(y1-y0)),a=.25+.25*Math.sin(t*1.3+i*2.1);G.fillStyle=col.replace('A',a.toFixed(2));G.fillRect(x,y,hs(i+7)>.75?2:1.2,hs(i+7)>.75?2:1.2);}G.restore();}
 function busts(list,ts){uncam();const fs=faceState(ts),S_=Math.round(CH*.98);G.imageSmoothingEnabled=false;for(const b of list.slice().sort((p,q)=>(p.act?1:0)-(q.act?1:0))){bustTo(bk(b.k),b.act?fs.mo:null,b.act?fs.ey:blinkAtT(ts,b.x*7+1));if(!b.act){PSG.globalCompositeOperation='source-atop';PSG.fillStyle='rgba(8,6,14,.5)';PSG.fillRect(0,0,192,192);PSG.globalCompositeOperation='source-over';}
   const s=b.act?S_:Math.round(S_*.9),y=CH-s+Math.round(CH*.03)+(b.act&&fs.talking?Math.round(Math.sin(ts/240)*1.5*K):0);G.drawImage(PSC,Math.round(b.x*CW-s/2),y,s,s);}G.imageSmoothingEnabled=true;}
 let LOGO=null;
 const SH={
  logo(t){G.fillStyle='#05040a';G.fillRect(0,0,CW,CH);if(!LOGO)LOGO=mk(400,200,g=>SCENES.logo(g));const a=ease(cl(t/1.6));cam(1+.06*ease(cl(t/9)),.5,.36);glowAt(400,120,230,'rgba(190,60,40,A)',.20*a+.05*Math.sin(t*1.7));G.globalAlpha=a;G.imageSmoothingEnabled=true;G.drawImage(LOGO,0,0,800,400);G.globalAlpha=1;
   const sw=cl((t-1.4)/1.3);if(sw>0&&sw<1){G.save();G.globalCompositeOperation='lighter';G.beginPath();G.rect(330,40,140,180);G.clip();const x=lerp(300,520,sw),gr=G.createLinearGradient(x-40,0,x+40,0);gr.addColorStop(0,'rgba(255,230,170,0)');gr.addColorStop(.5,'rgba(255,230,170,.5)');gr.addColorStop(1,'rgba(255,230,170,0)');G.fillStyle=gr;G.fillRect(x-40,40,80,180);G.restore();}
   G.save();G.globalCompositeOperation='lighter';for(let i=0;i<34;i++){const y=400-((t*(14+hs(i)*22)+hs(i+4)*400)%420),x=260+hs(i+2)*280+Math.sin(t*.8+i)*14;G.fillStyle='rgba(255,'+(140+hs(i+6)*90|0)+',60,'+(cl(y/400)*.8*a).toFixed(2)+')';G.fillRect(x,y,1.6,1.6);}G.restore();vign(.5);},
  dawn(t,sp,ts,bare){const p=ease(cl(t/12));uncam();sky(mixc([10,10,34],[46,42,104],p),mixc([52,26,66],[196,104,96],p),mixc([120,52,50],[255,186,104],p),.40);
   if(p<.7){G.fillStyle='rgba(255,250,235,'+((1-p/.7)*.9).toFixed(2)+')';for(let i=0;i<70;i++){const tw=.6+.4*Math.sin(t*2+i);G.globalAlpha=tw;G.fillRect(hs(i)*CW,hs(i+1)*CH*.45,K*1.3,K*1.3);}G.globalAlpha=1;}
   cam(1+.07*p,.64,.40);const sy=lerp(232,150,p);glowAt(560,sy,300,'rgba(255,170,90,A)',.30+.45*p);glowAt(560,sy,70,'rgba(255,236,190,A)',.9*p);G.fillStyle='rgba(255,244,214,'+(.4+.6*p).toFixed(2)+')';G.beginPath();G.arc(560,sy,15,0,TAU);G.fill();
   uncam();cloudBand(t,5,6,120,.34+.3*p);cloudBand(t+90,9,70,90,.22+.25*p);cam(1+.07*p,.64,.40);plate('dawn');
   G.save();G.globalCompositeOperation='source-atop';G.fillStyle='rgba(8,8,40,'+(.42*(1-p)).toFixed(2)+')';G.fillRect(0,0,800,400);G.restore();glowAt(560,sy+20,520,'rgba(255,140,70,A)',.22*p);
   if(!bare){const P=[[588,402],[604,340],[606,300],[560,274],[480,263],[432,251]],u=cl((t-2.5)/13)*(P.length-1),i=Math.min(P.length-2,Math.floor(u)),f=u-i,x=lerp(P[i][0],P[i+1][0],f),y=lerp(P[i][1],P[i+1][1],f),s=lerp(4.2,1.1,u/(P.length-1));
    if(t>2.5&&u<P.length-1.02){for(let k=1;k<6;k++){G.fillStyle='rgba(200,170,130,'+(.28-k*.045).toFixed(2)+')';G.beginPath();G.arc(x+k*s*1.4*(i<2?0:1),y+k*s*(i<2?1.2:.2)-k*s*.3,s*(.6+k*.25),0,TAU);G.fill();}G.fillStyle='#120c0c';G.beginPath();G.ellipse(x,y-s*.9+Math.abs(Math.sin(t*9))*s*.3,s*1.5,s,0,0,TAU);G.fill();G.beginPath();G.arc(x-s*.2,y-s*2+Math.abs(Math.sin(t*9))*s*.3,s*.55,0,TAU);G.fill();}}
   for(let i=0;i<7;i++){const bx=((90+i*130+t*(15+i%3*5))%1000)-100,by=58+i*15+Math.sin(t*.9+i)*8;bird(bx,by,4+i%3,t*7+i,'rgba(20,16,30,.8)');}
   if(!bare){uncam();const a=ease(cl((t-2)/2.4));if(a>0){G.save();G.globalAlpha=a;G.textAlign='center';const tx='LE GÉNÉRAL DÉCHU',fs=Math.round(50*K);G.font='bold '+fs+'px Georgia,"Times New Roman",serif';const wd=[...tx].map(c=>G.measureText(c).width+7*K),tot=wd.reduce((p,q)=>p+q,0);let x=CW/2-tot/2;const y=Math.round(96*K);
     for(let i=0;i<tx.length;i++){const cx=x+wd[i]/2;G.fillStyle='rgba(0,0,0,.75)';G.fillText(tx[i],cx+2*K,y+3*K);const gr=G.createLinearGradient(0,y-fs,0,y+4);gr.addColorStop(0,'#fff0b8');gr.addColorStop(.5,'#e8b84a');gr.addColorStop(1,'#8a5a14');G.fillStyle=gr;G.fillText(tx[i],cx,y);x+=wd[i];}
     G.fillStyle='rgba(240,200,110,.9)';G.fillRect(CW/2-tot*.42,y+12*K,tot*.84,Math.max(1,1.5*K));G.font='italic '+Math.round(17*K)+'px Georgia,serif';G.fillStyle='rgba(0,0,0,.7)';G.fillText("Chronique d'une trahison",CW/2+K,y+34*K+K);G.fillStyle='#f3e3b0';G.fillText("Chronique d'une trahison",CW/2,y+34*K);G.restore();}}
   vign(.38);},
  bridge(t){uncam();sky('rgb(64,70,150)','rgb(206,128,124)','rgb(255,204,136)',.5);glowAt(CW*.9,CH*.86,CW*.6,'rgba(255,190,110,A)',.55);cloudBand(t,11,10,150,.6);cloudBand(t+60,18,120,110,.4);
   const z=1+.06*ease(cl(t/13));cam(z,.34,.62);
   /* la herse, dans l'ombre de la porte : elle se lève avant le cavalier et retombe derrière lui */
   const op=ease(cl((t-.4)/2.4))*(1-ease(cl((t-9.4)/1.3)));plate('bridge');
   G.save();G.beginPath();G.moveTo(238,300);G.lineTo(238,205);G.quadraticCurveTo(240,176,264,170);G.quadraticCurveTo(288,176,290,205);G.lineTo(290,300);G.closePath();G.clip();G.translate(0,-op*128);G.strokeStyle='#221d24';G.lineWidth=3;for(let x=242;x<292;x+=9){G.beginPath();G.moveTo(x,160);G.lineTo(x,304);G.stroke();}for(let y=176;y<304;y+=15){G.beginPath();G.moveTo(236,y);G.lineTo(292,y);G.stroke();}G.strokeStyle='rgba(150,130,120,.5)';G.lineWidth=1;for(let x=243;x<292;x+=9){G.beginPath();G.moveTo(x,160);G.lineTo(x,304);G.stroke();}G.fillStyle='#221d24';for(let x=242;x<292;x+=9){G.beginPath();G.moveTo(x-2.5,304);G.lineTo(x+2.5,304);G.lineTo(x,312);G.fill();}G.restore();
   const u=cl((t-2.2)/6.4),im=img('rider');if(im&&t>2.2&&u<1){const x=lerp(940,262,u),y=lerp(338,311,u),s=lerp(1.9,.8,u),w=180*s,h=120*s,fr=Math.floor(t*12)%8,fw=im.width/8;G.save();G.beginPath();G.rect(266,0,800,400);G.clip();G.globalAlpha=cl((1-u)/.06);
    for(let k=0;k<7;k++){const q=(t*2.2+k/7)%1;G.fillStyle='rgba(214,190,160,'+((1-q)*.34).toFixed(2)+')';G.beginPath();G.arc(x+w*.25+q*70*s+k*5,y-6*s-q*18*s,(5+q*13)*s,0,TAU);G.fill();}
    G.fillStyle='rgba(0,0,0,.4)';G.beginPath();G.ellipse(x,y+1,w*.33,5*s,0,0,TAU);G.fill();G.imageSmoothingEnabled=true;G.drawImage(im,fr*fw,0,fw,im.height,x-w*.5,y-h*.93,w,h);G.restore();}
   glowAt(820,360,500,'rgba(255,170,90,A)',.16);vign(.4);},
  hall(t){const z=1+.11*ease(cl(t/15));cam(z,.47,.40);plate('hall');glowAt(390,140,95,'rgba(230,205,255,A)',.22+.06*Math.sin(t*.9));glowAt(655,70,170,'rgba(255,230,200,A)',.12+.04*Math.sin(t*.6+1));motes(t,80,250,90,700,340,'rgba(255,236,205,A)');vign(.5);},
  field(t){uncam();sky('rgb(46,18,44)','rgb(176,52,40)','rgb(255,150,60)',.42);cam(1+.07*ease(cl(t/15)),.5,.56);glowAt(372,226,260,'rgba(255,120,40,A)',.6);G.fillStyle='rgb(255,196,120)';G.beginPath();G.arc(372,226,27,0,TAU);G.fill();
   uncam();G.save();G.globalCompositeOperation='multiply';cloudBand(t,7,0,120,.75);G.restore();cloudBand(t+40,12,60,80,.25);cam(1+.07*ease(cl(t/15)),.5,.56);plate('field');
   for(const[sx,sy,ph]of[[300,246,0],[432,250,1.7],[250,256,3.1],[560,262,4.4]])for(let k=0;k<9;k++){const q=((t*.12+k/9+ph)%1),x=sx+q*q*90+Math.sin(q*6+ph)*6,y=sy-q*150;G.fillStyle='rgba(40,28,30,'+((1-q)*.42).toFixed(2)+')';G.beginPath();G.arc(x,y,5+q*24,0,TAU);G.fill();}
   /* l'étendard de Karst flotte sur le gué */
   G.save();G.translate(464,152);for(let i=0;i<16;i++){const x0=i*4,x1=x0+4.6,w0=Math.sin(t*3.2-i*.5)*(1+i*.28),w1=Math.sin(t*3.2-(i+1)*.5)*(1+(i+1)*.28);G.fillStyle=i%2?'#16141c':'#1e1b26';G.beginPath();G.moveTo(x0,w0);G.lineTo(x1,w1);G.lineTo(x1,w1+34-i*.3);G.lineTo(x0,w0+34-(i-1)*.3);G.fill();G.fillStyle='#9a1c16';G.beginPath();G.moveTo(x0,w0+13);G.lineTo(x1,w1+13);G.lineTo(x1,w1+21);G.lineTo(x0,w0+21);G.fill();}G.restore();
   for(let i=0;i<9;i++){const a=t*(.25+hs(i)*.2)+i*1.9,rx=120+hs(i+2)*150,ry=26+hs(i+3)*30,x=400+Math.cos(a)*rx+(hs(i+5)-.5)*200,y=120+Math.sin(a)*ry+hs(i+4)*70;bird(x,y,5+hs(i+8)*5,t*8+i,'#0c0a10');}
   G.save();G.globalCompositeOperation='lighter';for(let i=0;i<26;i++){const y=400-((t*(10+hs(i)*20)+hs(i+4)*400)%400),x=hs(i+2)*800+Math.sin(t+i)*20;G.fillStyle='rgba(255,'+(120+hs(i+6)*80|0)+',40,.5)';G.fillRect(x,y,1.5,1.5);}G.restore();vign(.5);},
  news(t,sp,ts){if(t<3.6){SH.hall(t);if(t>3.1){uncam();G.fillStyle='rgba(0,0,0,'+cl((t-3.1)/.5).toFixed(2)+')';G.fillRect(0,0,CW,CH);}}else{SH.field(t-3.6);if(t<4.2){uncam();G.fillStyle='rgba(0,0,0,'+(1-cl((t-3.6)/.6)).toFixed(2)+')';G.fillRect(0,0,CW,CH);}}},
  close(t,ts,bg,z,cx,cy,list,lx,ly,lc){cam(z+.03*ease(cl(t/10)),cx,cy);plate(bg);if(lx!=null)glowAt(lx,ly,170,lc||'rgba(255,170,80,A)',.20+.07*Math.sin(t*9)+.05*Math.sin(t*23));uncam();G.fillStyle='rgba(6,4,10,.28)';G.fillRect(0,0,CW,CH);busts(list,ts);vign(.55);},
  queen(t,sp,ts){SH.close(t,ts,'throneback',1.18,.52,.42,[{k:'reine',x:.5,act:sp==='reine'||!sp}],220,222);},
  duo(t,sp,ts){SH.close(t,ts,'throneback',1.06,.5,.42,[{k:'reine',x:.29,act:sp==='reine'},{k:'chancelier',x:.71,act:sp==='chancelier'}],220,222);},
  mess(t,sp,ts){SH.close(t,ts,'hall',1.9,.46,.62,[{k:'messager',x:.5,act:sp==='messager'}],390,140,'rgba(230,205,255,A)');},
  cab(t,sp,ts,alone){const z=1+.09*ease(cl(t/14));cam(z,.5,.56);plate('cabinet');glowAt(400,64,230,'rgba(255,176,90,A)',.18+.05*Math.sin(t*8)+.04*Math.sin(t*19));glowAt(330,203,46,'rgba(255,190,110,A)',.3+.12*Math.sin(t*13));
   if(!alone)sil('rodeur',Math.floor(t*1.6),250,372,210);sil('chancelier',Math.floor(t*1.6+1),600,378,225,true);motes(t,24,250,90,560,300,'rgba(255,220,170,A)');vign(.55);},
  cab2(t,sp,ts){SH.cab(t,sp,ts,true);},
  scowl(t,sp,ts){SH.close(t,ts,'dark',1.06,.5,.5,[{k:'chancelier',x:.54,act:sp==='chancelier'}],250,330);if(sp!=='chancelier'){G.save();G.globalCompositeOperation='lighter';for(let i=0;i<22;i++){const q=(t*.5+hs(i))%1,x=CW*(.3+hs(i+2)*.12)+Math.sin(t*2+i)*8*K,y=CH*(.86-q*.5);G.fillStyle='rgba(255,'+(130+hs(i+6)*90|0)+',50,'+((1-q)*.8).toFixed(2)+')';G.fillRect(x,y,2*K,2*K);}G.restore();glowAt(CW*.36,CH*.9,90*K,'rgba(255,140,50,A)',.4+.15*Math.sin(t*11));}},
  tent(t,sp,ts){uncam();G.fillStyle='#070a1c';G.fillRect(0,0,CW,CH);G.fillStyle='#fff';for(let i=0;i<40;i++){G.globalAlpha=.4+.5*Math.abs(Math.sin(t+i));G.fillRect(CW*(.3+hs(i)*.4),CH*(.5+hs(i+1)*.25),K,K);}G.globalAlpha=1;const z=1+.08*ease(cl(t/14));cam(z,.5,.6);plate('tent');G.fillStyle='rgba(20,8,4,.34)';G.fillRect(0,0,800,400);glowAt(520,300,240,'rgba(255,170,80,A)',.24+.06*Math.sin(t*9)+.04*Math.sin(t*21));if(t>1.2){const e=ease(cl((t-1.2)/1.6));sil('garde_royal',Math.floor(t*1.5),lerp(880,700,e),388,230);sil('capitaine',Math.floor(t*1.5+1),lerp(900,600,e),392,250);sil('garde_royal',Math.floor(t*1.5+2),lerp(960,770,e),394,240,true);}motes(t,20,300,150,620,330,'rgba(255,220,170,A)');vign(.6);},
  qw(t,sp,ts){if(t<2.6){SH.hall(t);if(t>2.2){uncam();G.fillStyle='rgba(0,0,0,'+cl((t-2.2)/.4).toFixed(2)+')';G.fillRect(0,0,CW,CH);}}else{SH.queen(t-2.6,sp,ts);if(t<3.1){uncam();G.fillStyle='rgba(0,0,0,'+(1-cl((t-2.6)/.5)).toFixed(2)+')';G.fillRect(0,0,CW,CH);}}},
  cell(t){const im=IMGEL['s_cell'];cam(1+.10*ease(cl(t/12)),.55,.5);G.imageSmoothingEnabled=true;if(im)G.drawImage(im,0,0,800,400);G.fillStyle='rgba(6,6,16,.30)';G.fillRect(0,0,800,400);glowAt(620,150,200,'rgba(255,170,80,A)',.14+.05*Math.sin(t*9)+.03*Math.sin(t*23));motes(t,16,300,80,700,330,'rgba(255,225,180,A)');vign(.6);},
  trial(t,sp,ts){SH.close(t,ts,'throneback',1.06,.5,.42,[{k:'aldric',x:.22,act:sp==='aldric'},{k:'reine',x:.5,act:sp==='reine'},{k:'chancelier',x:.78,act:sp==='chancelier'}],220,222);},
  cap(t,sp,ts){uncam();G.fillStyle='#070a1c';G.fillRect(0,0,CW,CH);SH.close(t,ts,'tent',1.5,.58,.62,[{k:'capitaine',x:.5,act:sp==='capitaine'}],520,300);}};
 const SHOT={i_logo:SH.logo,i_dawn:SH.dawn,i_bridge:SH.bridge,i_news:SH.news,i_hall:SH.hall,i_mess:SH.mess,i_queen:SH.queen,i_duo:SH.duo,i_cab:SH.cab,i_cab2:SH.cab2,i_scowl:SH.scowl,i_tent:SH.tent,i_cap:SH.cap,i_trial:SH.trial,i_qw:SH.qw,i_field:SH.field,i_cell:SH.cell};
 for(const k in SHOT)SCENES[k]=g=>{g.fillStyle='#000';g.fillRect(0,0,400,200);};
 let cur=null,t0=0,slow=0,acc=0;
 function frame(fn,t,sp,ts,extra){G.setTransform(1,0,0,1,0,0);G.globalAlpha=1;G.globalCompositeOperation='source-over';G.imageSmoothingEnabled=true;fn(t,sp,ts,extra);G.setTransform(1,0,0,1,0,0);G.globalAlpha=1;G.globalCompositeOperation='source-over';}
 const _ct=cineTick;cineTick=function(ts){_ct(ts);const on=!$('dlg').hidden&&cineMode&&SHOT[curScene];cv.style.display=on?'block':'none';
  const full=on&&!document.body.classList.contains('ls');$('dlg').classList.toggle('full',!!full);const iw=$('dlgImgW');if(full){const W=innerWidth,H=innerHeight,fw=Math.min(W,H*2),fh=fw/2;iw.style.cssText='position:absolute;border:0;margin:0;left:'+Math.round((W-fw)/2)+'px;top:'+Math.round(Math.max(0,(H-fh)/2-H*.04))+'px;width:'+Math.round(fw)+'px;height:'+Math.round(fh)+'px';}else if(iw.style.cssText)iw.style.cssText='';
  if(on){if(cur!==curScene){cur=curScene;t0=performance.now();}$('dlgStage').getContext('2d').clearRect(0,0,400,200);$('dlgFx').getContext('2d').clearRect(0,0,400,200);const t=(performance.now()-t0)/1000;G=cv.getContext('2d');frame(SHOT[cur],t,speaker,ts);
   if(t<.45){G.fillStyle='rgba(0,0,0,'+(1-t/.45).toFixed(2)+')';G.fillRect(0,0,CW,CH);}
   if(!slow){const a=performance.now();try{vga(cv,6);}catch(e){slow=1;}acc=acc*.9+(performance.now()-a)*.1;if(acc>16)slow=1;}}
  else{cur=null;const tb=$('titleBg');if(tb&&!$('title').hidden&&img('dawn')){if(tb.width!==CW){tb.width=CW;tb.height=CH;tb.style.imageRendering=window.LITE?'pixelated':'auto';}const g0=G;G=tb.getContext('2d');frame(SH.dawn,30+(ts/1000)%100000,null,ts,true);G=g0;if(!slow){try{vga(tb,6);}catch(e){}}}}};
})();
"""
CSS = """
#dlg.cine.full .box{position:absolute;left:0;top:0;width:100%;height:100vh;max-width:none;max-height:none;padding:0;overflow:hidden;border-radius:0}
#dlg.cine.full #dlgImg{width:100%;height:100%;aspect-ratio:auto}
#dlg.cine.full #dlgBand{position:absolute;left:0;right:0;bottom:0;padding:46px 14% 20px;background:linear-gradient(rgba(5,4,8,0),rgba(5,4,8,.82) 38%,rgba(5,4,8,.94))}
#dlg.cine.full #dlgText{min-height:0;font-size:20px;line-height:1.45;max-height:6.9em;overflow:hidden;text-shadow:0 1px 4px #000}
#dlg.cine.full .who b{font-size:17px}
#dlg.cine.full #dlgSkip{position:absolute;right:18px;top:14px;float:none;margin:0;z-index:3}
#dlg.cine.full #dlgBtns:not(.col){justify-content:flex-end}#dlg.cine.full #dlgBtns:not(.col) button{flex:0 0 190px}
#dlg.cine.full #dlgBtns.col{max-width:62%;margin-left:auto}
#dlg.cine.full #dlgCap{top:18px;font-size:22px}
"""
PROLOGUE = r"""prologue(){music();say([
  [null,"Une chronique d'Austrevie, telle que la racontent ceux qui en sont revenus.",0,'i_logo'],
  [null,"Austrevie, an 1247. Neuf ans de guerre contre l'Empire de Karst, et un seul général qui gagne.",0,'i_dawn'],
  [null,"Ce matin-là, il rentrait vainqueur, une fois de plus. La ville criait son nom. Elle le criait un peu trop fort.",0,'i_bridge',"La porte de Castelroc"],
  ['reine',"Encore une victoire, général. Mon peuple vous aime. Je commence à compter combien.",0,'i_qw',"Castelroc · salle du trône"],
  ['chancelier',"Un général que l'on acclame, Majesté, finit toujours par s'écouter. Ou par écouter quelqu'un d'autre.",0,'i_duo'],
  [null,"Le soir même, dans son cabinet, le chancelier fit écrire trois lettres. Elles étaient de la main du général, à ceci près que le général ne les avait jamais écrites.",0,'i_cab',"Le cabinet du chancelier"],
  ['chancelier',"« Je livrerai le plan de bataille à l'Empire. » C'est bien tourné. Il aurait pu l'écrire.",0,'i_scowl'],
  [null,"Trois jours plus tard, le général apprit qu'il vendait le royaume à l'ennemi. Il l'apprit en même temps que la cour.",0,'i_hall',"Le procès"],
  ['reine',"On a trouvé ces lettres, général. Vous avez servi neuf ans : je vous accorde une phrase.",0,'i_queen']
 """
def apply(s, rep1):
    i = s.rindex('</script>'); s = s[:i] + JS + s[i:]
    s = s.replace('</style>', CSS + '</style>', 1)
    a = s.index("prologue(){say(["); b = s.index("],openHeroSel);},", a); s = s[:a] + PROLOGUE + s[b:]
    s = rep1(s, "say([['aldric',h.line,0,'throne'],['chancelier',h.rep],", "say([['aldric',h.line,0,'i_trial'],['chancelier',h.rep],")
    # après la sentence : l'armée sans son général, puis la cellule
    s = rep1(s, """[null,"La reine a dit « le temps d'y voir clair ». C'était il y a quarante jours.",0,'cell',"Quarante jours plus tard"]]""", """[null,"L'armée passa au duc de Fierbois. Au Gué-aux-Corbeaux, il tint une heure.",0,'i_field',"Le Gué-aux-Corbeaux"],[null,"La reine a dit « le temps d'y voir clair ». C'était il y a quarante jours.",0,'i_cell',"Quarante jours plus tard"]]""")
    # musique : un seul thème épique, du logo à la cellule ; elle passe sous les voix au lieu de se taire
    s = rep1(s, "if(!$('heroSel').hidden)return'festin';if(!S)return'barde';if(!LS)return'complainte';", "if(!$('heroSel').hidden)return'epopee';if(!S)return'barde';if(!LS)return'epopee';")
    s = rep1(s, "f=(sc||musHold)?0:duckF,d=now?0:musHold?.22:sc?.8:", "f=musHold?0:sc?(/^i_/.test(curScene)&&cineMode?(duckF<1?.4:1):0):duckF,d=now?0:musHold?.22:sc?.8:")
    s = rep1(s, "musBase=()=>(curTrack==='combat'?.22:.2)*(PREF.lm/60);", "musBase=()=>(curTrack==='combat'?.22:curTrack==='epopee'?.36:.2)*(PREF.lm/60);")
    return s
