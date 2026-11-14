# Grosse mise à jour : densités calées sur l'original (démo officielle de Lands of Lore, niveaux 1 à 5 : un monstre pour 20 cases,
# trois quarts de base, un quart de costauds, un meneur ; objets surtout ordinaires), bestiaire par région, gardes endormis, pluie, boutiques vivantes.
JS = r"""
/* ====== MAJ : densités de l'original, meneurs, bestiaire par région ====== */
(function(){
 const OPEN='.dDLgG';let seed=20261114;const rr=()=>(seed=(seed*1103515245+12345)&0x7fffffff)/0x7fffffff;
 Object.assign(ITEMS,{
  pierre:{n:"Pierre",k:'throw',junk:1,m:2.5,ty:'c',p:0,d:"Une pierre. Elle se lance, se ramasse et se relance. L'arme la plus ancienne du royaume, et la moins chère."},
  fer:{n:"Fer à cheval",k:'throw',junk:1,m:3,ty:'c',p:2,d:"Il porte bonheur, dit-on. Lancé avec conviction, il le retire à quelqu'un d'autre."},
  tesson:{n:"Tesson de cruche",k:'throw',junk:1,m:2,ty:'t',p:0,d:"Le fond d'une cruche. Ce qu'elle contenait a été bu depuis longtemps, sans doute par Pépin."},
  os:{n:"Os rongé",k:'throw',junk:1,m:1.5,ty:'c',p:0,d:"Rongé avec application. Quelqu'un, ou quelque chose, a pris son temps."},
  chiffon:{n:"Chemise déchirée",k:'throw',junk:1,m:.5,ty:'c',p:1,d:"Une chemise qui a connu des jours meilleurs et au moins une bagarre."}});
 const U={u_patience:['lance',"La Longue Patience",3,0,"Lance du capitaine Malebrèche. Arme unique : elle attend son heure plus longtemps que celui d'en face."],
  u_potdefer:['casque',"Le Pot-de-fer du guet",0,2,"Casque du sergent Trognon. Pièce unique : cabossé de partout, percé nulle part."],
  u_raisonneuse:['hache',"La Raisonneuse",3,0,"Hache du lieutenant Corbac. Arme unique : elle met fin aux discussions, et à ceux qui les prolongent."],
  u_rondache:['bouclier',"La Rondache de Florimond",0,2,"Bouclier du maître d'armes. Pièce unique : trente ans de leçons, pas une touche."],
  u_taupiere:['pioche',"La Taupière",3,0,"Pic du maître sapeur Gringoire. Arme unique : elle ouvre les galeries et les avis contraires."]};
 for(const k in U){const[b,n,dd,dp,d]=U[k],B=ITEMS[b];if(!B)continue;const o=Object.assign({},B,{n,d,p:Math.round(B.p*2.5+40),base:b});if(B.dmg)o.dmg=[B.dmg[0]+dd-1,B.dmg[1]+dd];if(B.m)o.m=B.m+dd*.6;if(B.prot)o.prot=B.prot+dp;ITEMS[k]=o;}
 const LEAD={ruines:["le capitaine Malebrèche",'u_patience'],faubourgs:["le sergent Trognon",'u_potdefer'],cour:["le lieutenant Corbac",'u_raisonneuse'],palais2:["le maître d'armes Florimond",'u_rondache'],galeries:["le maître sapeur Gringoire",'u_taupiere']};
 const VAR={
  mine:{arbal:["le frondeur des puits",1,1,{kite:1}],lancier:["le piqueur de galerie",1.1,1,{}],molosse:["le chien de carrier",1.2,1,{}],rat:["le rat de mine",1.3,1,{}]},
  abbaye:{arbal:["l'archer du clocher",1,1.1,{}],lancier:["le hallebardier du chapitre",1.15,1,{}],reitre:["le reître de Hagen",1,1,{alert:3,alertT:"« Au capitaine ! » Le cri file sous les voûtes."}],molosse:["le dogue du cellier",1.3,1.1,{}]},
  mine2:{pillard:["le mineur dévoyé",1.1,1,{cap:['etourdi',14],coward:0}],arbal:["le guetteur de puits",1,1,{amb:.4,ambT:"se laisse tomber d'un boisage"}],lancier:["le porteur d'étai",1.25,.9,{}],molosse:["le chien de fond",1.2,1,{}]},
  crypte:{reitre:["le pilleur de caveaux",.9,1,{cap:['vol',16],coward:1}],arbal:["le veilleur de crypte",1,1,{amb:.5,ambT:"sort de derrière un gisant"}],lancier:["le fossoyeur armé",1.2,1.1,{}],molosse:["le chien des tombes",1.1,1.1,{}]},
  ruines:{pillard:["le chercheur de ruines",1,1,{cap:['vol',14]}],arbal:["le guetteur des créneaux",1,1.1,{kite:1}],lancier:["le piquier perdu",1.1,1,{}]},
  faubourgs:{reitre:["le soudard de faubourg",.9,1,{coward:1}],garde_royal:["l'homme du guet",.9,.9,{alert:4,alertT:"« Au guet ! » Des volets claquent, des bottes accourent."}]},
  cour:{garde:["le garde de la cour",1.2,1.1,{}],arbal:["l'arbalétrier des remparts",1.1,1.1,{kite:1}],reitre:["le reître de la cour",1.1,1,{}]},
  palais2:{arbal:["l'arbalétrier de la galerie",1.1,1.1,{}],lancier:["le hallebardier d'apparat",1.3,1.1,{}],reitre:["le gentilhomme d'armes",1.1,1.15,{}]},
  palais3:{arbal:["le tireur du chancelier",1.2,1.2,{kite:1}],lancier:["le garde du sceau",1.4,1.15,{}],reitre:["le spadassin du chancelier",1.2,1.2,{}]},
  camp:{lancier:["le piquier de Karst",1.3,1.1,{}],molosse:["le chien de guerre",1.5,1.2,{}],reitre:["le vétéran de Karst",1.25,1.15,{}]},
  galeries:{molosse:["le chien de sape",1.4,1.1,{}],sentinelle:["le veilleur de sape",1,1,{amb:.35,ambT:"surgit d'une niche de mine"}]}};
 /* geôles : le sergent cognait trop fort pour un premier chef */
 if(MON.sergent){MON.sergent.hp=40;MON.sergent.m=5;}
 const cnt={};for(const id in LEVELS)for(const m of LEVELS[id].mons||[])cnt[m[0]]=(cnt[m[0]]||0)+1;
 const pick=(a,n)=>{if(n>=a.length)return a.slice();const o=[];for(let i=0;i<n;i++)o.push(a[Math.floor((i+.5)*a.length/n)]);return o;};
 window.MAJSTAT={};
 for(const id in LEVELS){const L=LEVELS[id];if(!L.map||L.waves)continue;let cells=0;for(const row of L.map)for(const c of row)if(OPEN.includes(c))cells++;
  const st=MAJSTAT[id]={cells,m0:(L.mons||[]).length,i0:(L.items||[]).length};
  /* --- adversaires : un pour vingt cases environ, trois quarts de base, un quart de costauds --- */
  if(L.mons&&L.mons.length){const T=Math.max(5,Math.round(cells/21)),isFix=m=>!MON[m[0]]||MON[m[0]].boss||MON[m[0]].drop||m[3]||cnt[m[0]]===1;
   const fix=L.mons.filter(isFix),rest=L.mons.filter(m=>!isFix(m)),pw=m=>MON[m[0]].hp*MON[m[0]].m,ps=[...new Set(rest.map(pw))].sort((a,b)=>a-b),med=ps[ps.length>>1];
   const tough=rest.filter(m=>ps.length>1&&pw(m)>=med),base=rest.filter(m=>!(ps.length>1&&pw(m)>=med));
   if(L.mons.length>T){const room=Math.max(2,T-fix.length);let nT=Math.min(tough.length,Math.round(room*.25)),nB=Math.min(base.length,room-nT);nT=Math.min(tough.length,room-nB);
    const keep=new Set([...fix,...pick(tough,nT),...pick(base,nB)]);L.mons=L.mons.filter(m=>keep.has(m));}
   /* un meneur nommé là où il n'y avait pas de chef : il porte l'objet remarquable du niveau */
   if(LEAD[id]){const sx=L.start[0],sy=L.start[1],c=L.mons.filter(m=>!isFix(m)&&MON[m[0]].sc>=.8).sort((a,b)=>pw(b)-pw(a)||(Math.abs(b[1]-sx)+Math.abs(b[2]-sy))-(Math.abs(a[1]-sx)+Math.abs(a[2]-sy)))[0];
    if(c){const b=MON[c[0]],n=LEAD[id][0];MON['lead_'+id]=Object.assign({},b,{n,lead:1,spr:b.spr||c[0],hp:Math.round(b.hp*1.9),m:Math.round(b.m*1.25),lv:b.lv+1,sc:(b.sc||.82)*1.1,coward:0,amb:0,kite:0,gold:[15,30],alert:Math.max(b.alert||0,4),alertT:"« À moi ! » "+cap(n)+" n'a pas besoin de le dire deux fois.",ko:cap(n)+" tombe. Ses hommes n'ont plus personne à qui obéir."});c[0]='lead_'+id;c[3]=[LEAD[id][1]];}}
   /* bestiaire de la région, et un garde sur quatre assoupi à son poste */
   const V=VAR[id]||{};let k=0;for(const m of L.mons){if(isFix(m)||MON[m[0]].lead)continue;const b0=m[0];
    if(V[b0]){const[n,h,mm,ex]=V[b0],nid=id+'_'+b0;if(!MON[nid]){const b=MON[b0];MON[nid]=Object.assign({},b,{n,spr:b.spr||b0,hp:Math.round(b.hp*h),m:Math.max(1,Math.round(b.m*mm*10)/10),ko:cap(n)+" "+(b.sc<.7?"file sans demander son reste.":"s'effondre.")},ex);}m[0]=nid;}
    const t=MON[m[0]];if(id!=='geoles'&&t.sc>=.8&&t.mode!=='w'&&!t.amb&&!t.rng&&(k++%4)===1)m[4]={slp:1};}
   st.m1=L.mons.length;st.kinds=[...new Set(L.mons.map(m=>MON[m[0]].n))];}
  /* --- objets : moitié moins à ramasser, surtout de l'ordinaire --- */
  if(L.items&&L.items.length&&id!=='bataille'){const tut=id==='geoles'?['tabouret','onguent','epee_c','fronde']:[];
   const key=i=>{const t=ITEMS[i[0]];return i[0]!=='or'&&(!t||t.k==='key'||t.learn||/^[uq]_/.test(i[0])||tut.includes(i[0]));};
   const F=Math.max(4,Math.round(cells/24)),fixI=L.items.filter(key),loose=L.items.filter(i=>!key(i));
   const val=loose.filter(i=>i[0]!=='or'&&ITEMS[i[0]].p>=40),purse=loose.filter(i=>i[0]==='or'),cons=loose.filter(i=>i[0]!=='or'&&!val.includes(i)&&(ITEMS[i[0]].k==='use'||ITEMS[i[0]].k==='throw')),gear=loose.filter(i=>!val.includes(i)&&!purse.includes(i)&&!cons.includes(i));
   const chests=(L.props||[]).filter(p=>p.k==='chest'&&Array.isArray(p.loot)&&!p.sc&&!p.pz&&!/^(q|cf)/.test(p.id));
   const kV=pick(val,Math.ceil(val.length/2)),onFloor=[];kV.forEach((i,n)=>{if(chests.length){const c=chests[n%chests.length];c.loot=c.loot.concat([[i[0],0]]);}else onFloor.push(i);});
   const kP=pick(purse,Math.max(1,Math.round(F*.15))),kC=pick(cons,Math.max(1,Math.round(F*.15))),kG=pick(gear,Math.max(1,Math.round(F*.13)));
   const sumA=purse.reduce((a,i)=>a+(i[3]||0),0),sumK=kP.reduce((a,i)=>a+(i[3]||0),0);if(sumK)for(const i of kP)i[3]=Math.max(1,Math.round((i[3]||0)*sumA/sumK));
   const kept=new Set([...kP,...kC,...kG,...onFloor]),free=loose.filter(i=>!kept.has(i)).map(i=>[rr(),i[1],i[2]]).sort((a,b)=>a[0]-b[0]);
   const nR=Math.round(F*.4),nJ=Math.round(F*.15),J=['fer','tesson','os','chiffon'],add=[];free.forEach((f,n)=>{if(n<nR)add.push(['pierre',f[1],f[2]]);else if(n<nR+nJ)add.push([J[(n+id.length)%4],f[1],f[2]]);});
   L.items=[...fixI,...kP,...kC,...kG,...onFloor,...add];
   /* meubles : un sur deux ne cache plus rien (sauf clés) */
   let q=0;for(const p of L.props||[]){if(p.k==='chest'||!Array.isArray(p.loot)||p.sc||p.pz!=null)continue;if(p.loot.some(l=>l[0]!=='or'&&ITEMS[l[0]]&&(ITEMS[l[0]].k==='key'||/^[uq]_/.test(l[0]))))continue;if(q++%2)delete p.loot;}
   st.i1=L.items.length;st.comp={};for(const i of L.items){const t=ITEMS[i[0]],c=i[0]==='or'?'bourse':!t?'?':t.junk?(i[0]==='pierre'?'pierre':'rebut'):t.k==='key'||/^[uq]_/.test(i[0])?'quête':t.k==='use'||t.k==='throw'?'consommable':'arme/armure';st.comp[c]=(st.comp[c]||0)+1;}}
 }
 /* icônes des nouveaux objets */
 const _pi=postIcons;postIcons=function(){_pi();try{
  const blob=(g,c1,c2)=>{g.fillStyle='#1a120c';g.beginPath();g.ellipse(8,9.5,5.6,4.6,0,0,7);g.fill();g.fillStyle=c1;g.beginPath();g.ellipse(8,9,4.8,3.8,0,0,7);g.fill();g.fillStyle=c2;g.beginPath();g.ellipse(6.6,7.8,2.2,1.4,0,0,7);g.fill();};
  ICONC.pierre=mk(16,16,g=>blob(g,'#6c6a66','#9a9892'));ICONC.os=mk(16,16,g=>{g.strokeStyle='#1a120c';g.lineWidth=4;g.beginPath();g.moveTo(4,12);g.lineTo(12,4);g.stroke();g.strokeStyle='#d8cfb4';g.lineWidth=2;g.stroke();for(const[x,y]of[[3,11],[5,13],[11,3],[13,5]]){g.fillStyle='#d8cfb4';g.fillRect(x-1,y-1,2,2);}});
  ICONC.tesson=mk(16,16,g=>{g.fillStyle='#1a120c';g.beginPath();g.moveTo(3,13);g.lineTo(6,3);g.lineTo(10,7);g.lineTo(13,5);g.lineTo(12,13);g.closePath();g.fill();g.fillStyle='#8a5a34';g.beginPath();g.moveTo(4.5,12);g.lineTo(6.6,5);g.lineTo(10,8.6);g.lineTo(11.8,7.4);g.lineTo(11,12);g.closePath();g.fill();});
  ICONC.fer=mk(16,16,g=>{g.strokeStyle='#1a120c';g.lineWidth=5;g.beginPath();g.arc(8,7,4,Math.PI*.15,Math.PI*.85,true);g.stroke();g.strokeStyle='#7c7f86';g.lineWidth=2.6;g.stroke();});
  ICONC.chiffon=mk(16,16,g=>{g.fillStyle='#1a120c';g.fillRect(2,4,12,10);g.fillStyle='#b9ad8e';g.fillRect(3,5,10,8);g.fillStyle='#1a120c';g.fillRect(6,5,4,2);g.fillRect(4,10,1,3);g.fillRect(9,11,1,2);});
  for(const k in ITEMS)if(ITEMS[k].base&&!ICONC[k]&&ICONC[ITEMS[k].base])ICONC[k]=mk(16,16,g=>{g.drawImage(ICONC[ITEMS[k].base],0,0);g.globalCompositeOperation='source-atop';g.fillStyle='rgba(214,168,60,.38)';g.fillRect(0,0,16,16);});
  for(const k of['pierre','os','tesson','fer','chiffon'])try{vga(ICONC[k],-1);}catch(e){}}catch(e){}};
 /* pluie sur les lieux à ciel couvert, et marais */
 const _render=render;render=function(ts){_render(ts);if(!S||!LS||!LV||!(LV.sky===2||LV.theme==='swamp'))return;const cv=$('view');if(!cv)return;const g=cv.getContext('2d'),W=cv.width,H=cv.height;g.save();g.strokeStyle='rgba(196,210,220,.26)';g.lineWidth=1;g.beginPath();
  for(let i=0;i<70;i++){const sp=1+(i%4)*.18,x=((i*53.7+ts*.11*sp)%(W+40))-20,y=(i*97.3+ts*.62*sp)%H;g.moveTo(x,y);g.lineTo(x-3,y+9);}g.stroke();g.restore();};
})();
function shopFx(g,now){g.save();g.globalCompositeOperation='lighter';g.fillStyle='rgba(255,160,70,'+(.045+.03*Math.sin(now/130)+.018*Math.sin(now/47)).toFixed(3)+')';g.fillRect(0,0,400,153);
 for(let i=0;i<14;i++){const x=(i*61+Math.sin(now/1900+i)*14+400)%400,y=150-((now/60*(.3+(i%4)*.12)+i*37)%150);g.fillStyle='rgba(255,230,180,'+(.18+.14*Math.sin(now/700+i)).toFixed(2)+')';g.fillRect(x|0,y|0,1,1);}g.restore();}
"""
def apply(s, rep1):
    i = s.rindex('</script>'); s = s[:i] + JS + s[i:]
    # un meneur, des dormeurs : les marques posées sur les adversaires passent à la partie
    s = rep1(s, "if(m[3])o.loot=m[3];return o;})", "if(m[3])o.loot=m[3];if(m[4])Object.assign(o,m[4]);return o;})")
    s = rep1(s, "function sees(m){const dx=S.x-m.x,dy=S.y-m.y;", "function sees(m){const dx=S.x-m.x,dy=S.y-m.y;if(m.slp){const dd=Math.abs(dx)+Math.abs(dy);if(dd<=3&&!m.slpS&&los(m.x,m.y,S.x,S.y)){m.slpS=1;log('<i>'+cap(MON[m.t].n)+' dort debout, le menton sur la poitrine. Un premier coup porterait double.</i>');bark('pepin',[\"Chut. Il rêve qu'il monte la garde.\",\"Celui-là dort. Je propose qu'on ne le dérange pas, ou alors très fort.\",\"Un garde qui dort : enfin un collègue.\"],.7);}if(dd>1||rnd(1,100)>30)return false;m.slp=0;log(cap(MON[m.t].n)+' se réveille en sursaut.');}")
    s = rep1(s, "function hurt(m,dmg,c,sk,perf){dmg=Math.max(1,Math.round(dmg));", "function hurt(m,dmg,c,sk,perf){if(m.slp){m.slp=0;dmg*=2;log('<i>Pris en plein sommeil : le coup porte double.</i>');}dmg=Math.max(1,Math.round(dmg));")
    s = rep1(s, "function roused(m){const mt=MON[m.t];", "function roused(m){const mt=MON[m.t];if(mt.lead&&!m.ldS){m.ldS=1;log('<b>'+cap(mt.n)+' vous a vus. Celui-là commande aux autres.</b>');bark('brune',[\"Celui-là, c'est le chef. Les autres le regardent avant de frapper.\",\"Le meneur. Lui tombé, les autres réfléchiront.\"],.9);}")
    # moins de combats : chaque victoire rapporte davantage (expérience et bourse)
    s = rep1(s, "const s=c.sk[sk];s.x+=a;", "const s=c.sk[sk];s.x+=a*1.5;")
    s = rep1(s, "const g=rnd(mt.gold[0],mt.gold[1]);if(g){S.gold+=g;", "const g=Math.round(rnd(mt.gold[0],mt.gold[1])*1.5);if(g){S.gold+=g;")
    # les pierres et rebuts ne remplissent pas le sac : deux de chaque au plus sont ramassés d'office
    s = rep1(s, "for(const it of here){if(it.id==='or'){S.gold+=it.q;", "for(const it of here){if(ITEMS[it.id]&&ITEMS[it.id].junk&&S.bag.filter(b=>b===it.id).length+(S.hand===it.id?1:0)>=2)continue;if(it.id==='or'){S.gold+=it.q;")
    s = rep1(s, "if(it.k==='throw')return'À lancer · feu';", "if(it.k==='throw')return it.junk?'À lancer · se ramasse':'À lancer · feu';")
    s = rep1(s, "it.k==='throw'?'Cliquez le haut de la vue pour le lancer.'", "it.k==='throw'?'Cliquez le haut de la vue pour le lancer.'+(it.junk?' Il retombe là où il frappe : on peut le reprendre.':'')")
    # marais : la vase ralentit chaque pas
    s = rep1(s, "startAnim(ox+.5,oy+.5,ANG[S.d],nx+.5,ny+.5,ANG[S.d],165);computeDF();", "startAnim(ox+.5,oy+.5,ANG[S.d],nx+.5,ny+.5,ANG[S.d],LV.theme==='swamp'?255:165);if(LV.theme==='swamp'&&!S.flags.vase){S.flags.vase=1;log('<i>La vase colle aux bottes : ici, chaque pas coûte, et la pluie ne fait pas de quartier.</i>');}computeDF();")
    # boutiques : lueur de flamme et poussière dans la lumière
    s = rep1(s, "g.drawImage(shopBg(SHK[SHS.id]||'etal'),0,0);", "g.drawImage(shopBg(SHK[SHS.id]||'etal'),0,0);shopFx(g,now);")
    return s
