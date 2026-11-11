/* Cerveau des bots de recette : à chaque appel, think() rend UNE action élémentaire. */
(function(){
const WALK=c=>c==='.'||c==='d'||c==='g'||c==='D';
window.BOT={mem:null,
 init(P){this.mem={P,talk:{},dead:0,bad:{},stat:{rests:0,casts:0,items:0,dmg:0,kills:0,acts:0,minHp:1,buys:0},lastHp:null,goal:null,lv:null,t0:0,viol:[]};
  const self=this,go=window.gameOver;if(!go.__w){window.gameOver=function(){self.mem.dead++;return go.apply(this,arguments);};window.gameOver.__w=1;}
  const cs=window.cast;if(!cs.__w){window.cast=function(i,id,lv){const c=S.party[i],b=c?c.sf:0;const r=cs.apply(this,arguments);if(c&&c.sf<b)self.mem.stat.casts++;return r;};window.cast.__w=1;}},
 canOpen(x,y){const lk=LV.locks[x+','+y];return !!lk&&(has(lk.key)||lk.diff<=5);},
 bfs(tx,ty,adj){const W=MW,H=MH,prev=new Int32Array(W*H).fill(-2),q=[[S.x,S.y]];prev[S.y*W+S.x]=-1;const goal=(x,y)=>adj?Math.abs(x-tx)+Math.abs(y-ty)===1:(x===tx&&y===ty);
  if(goal(S.x,S.y))return[];
  while(q.length){const[x,y]=q.shift();for(let k=0;k<4;k++){const nx=x+DX[k],ny=y+DY[k];if(nx<0||ny<0||nx>=W||ny>=H||prev[ny*W+nx]!==-2)continue;const c=cell(nx,ny);
    if(!(WALK(c)||(c==='L'&&this.canOpen(nx,ny))))continue;if(npcAt(nx,ny))continue;prev[ny*W+nx]=y*W+x;
    if(goal(nx,ny)){const p=[];let i=ny*W+nx;while(prev[i]!==-1){p.unshift([i%W,(i/W)|0]);i=prev[i];}return p;}q.push([nx,ny]);}}return null;},
 dirTo(x,y){for(let k=0;k<4;k++)if(S.x+DX[k]===x&&S.y+DY[k]===y)return k;return -1;},
 face(k){const d=(k-S.d+4)%4;return d===0?null:{k:'turn',s:d===3?-1:1};},
 targets(){const m=this.mem,st=m.P.style,T=[];
  for(const it of LS.items){if(it.dropped)continue;const key=it.id!=='or'&&(ITEMS[it.id].k==='key'||ITEMS[it.id].learn);if(st.speed&&!key)continue;T.push({t:'item',x:it.x,y:it.y,id:'i'+it.id+it.x+','+it.y});}
  for(const n of LV.npcs){if(LS.gone[n.id]||m.talk[S.lv+n.id])continue;const must=n.id==='brune'||n.id==='odon';if(st.speed&&!must)continue;if(st.noshop&&!must&&SHOPS[n.id])continue;T.push({t:'npc',x:n.x,y:n.y,id:'n'+n.id,adj:1,npc:n.id});}
  for(let y=0;y<MH;y++)for(let x=0;x<MW;x++){const c=cell(x,y);
   if(c==='V')T.push({t:'wall',x,y,id:'V'+x+','+y,adj:1});
   if(c==='S'&&(st.explore||S.lv==='abbaye'))T.push({t:'wall',x,y,id:'S'+x+','+y,adj:1});
   if(c==='W'&&has('poudre')&&!st.speed)T.push({t:'wall',x,y,id:'W'+x+','+y,adj:1});}
  for(const mo of LS.mons){if(mo.hp<=0||mo.gone)continue;if(MON[mo.t].drop||st.hunt)T.push({t:'mon',x:mo.x,y:mo.y,id:'m',adj:1,mon:mo});}
  return T;},
 exitCell(){for(let y=0;y<MH;y++)for(let x=0;x<MW;x++)if(cell(x,y)==='X')return{t:'exit',x,y,id:'X',adj:1};return null;},
 heal(){const st=this.mem.P.style,safe=!LS.mons.some(mo=>mo.hp>0&&!mo.gone&&mo.aw&&df[mo.y*MW+mo.x]<7);
  const low=S.party.map((c,i)=>[c,i]).filter(a=>a[0].hp<a[0].hpM*(safe?st.healAt:Math.min(.35,st.healAt)));
  if(low.length){low.sort((a,b)=>a[0].hp/a[0].hpM-b[0].hp/b[0].hpM);const[c,i]=low[0];
   if(st.caster&&S.strats.includes('soins')){for(let k=0;k<S.party.length;k++){const h=S.party[k];if(h.hp>0&&!busy(h)&&S.T>=h.cd){const lv=h.sf>=STRATS.soins.c[1]?1:h.sf>=STRATS.soins.c[0]?0:-1;if(lv>=0)return{k:'cast',i:k,id:'soins',lv};}}}
   if(st.items&&c.hp>0){const id=['onguent','herbes','pain'].find(x=>S.bag.includes(x));if(id)return{k:'use',id,i};}}
  const ps=S.party.findIndex(c=>c.hp>0&&c.poison>S.T);if(ps>=0&&st.items&&S.bag.includes('herbes'))return{k:'use',id:'herbes',i:ps};
  if(LV.dark&&has('lanterne')&&(S.oil||0)<15&&S.bag.includes('huile'))return{k:'use',id:'huile',i:0};
  if(safe&&!st.norest&&S.party.some(c=>!(c.poison>S.T)&&(c.hp<c.hpM||c.sf<c.sfM))){const r=Math.min(...S.party.filter(c=>!(c.poison>S.T)).map(c=>c.hp/c.hpM));if(r<st.restAt||(st.caster&&S.party.some(c=>c.hp>0&&c.sf<c.sfM*.3))||S.party.some(c=>c.hp<=0))return{k:'rest'};}
  return null;},
 equip(){for(const id of S.bag){const it=ITEMS[id];
   if(it.k==='main'){if(it.rng&&!this.mem.P.style.ranged)continue;let best=-1,gain=.9;S.party.forEach((c,i)=>{if(c.hp<=0)return;const cur=wpn(c);if(it.rng&&c.sk.adresse.l<2)return;if(!it.rng&&cur.rng&&this.mem.P.style.ranged)return;const g=it.m-cur.m+(c.sk.armes.l*.01);if(g>gain){gain=g;best=i;}});if(best>=0)return{k:'equip',id,i:best};}
   else if(it.k==='corps'||it.k==='appoint'){let best=-1,gain=0;S.party.forEach((c,i)=>{const cur=c.eq[it.k]?ITEMS[c.eq[it.k]].prot:0;if(it.prot-cur>gain){gain=it.prot-cur;best=i;}});if(best>=0)return{k:'equip',id,i:best};}}
  return null;},
 fight(){const m=this.mem,st=m.P.style,adj=[];for(let k=0;k<4;k++){const mo=monAt(S.x+DX[k],S.y+DY[k]);if(mo&&pass(mo.x,mo.y))adj.push([k,mo]);}
  const rg=Math.max(0,...S.party.filter(c=>c.hp>0&&wpn(c).rng).map(c=>wpn(c).rng)),line=rg?target(rg):null;
  if(!adj.length&&!line)return null;
  if(adj.length&&!adj.some(a=>a[0]===S.d)){const f=this.face(adj[0][0]);if(f)return f;}
  const fm=monAt(S.x+DX[S.d],S.y+DY[S.d]);
  for(let i=0;i<S.party.length;i++){const c=S.party[i];if(c.hp<=0||busy(c)||S.T<c.cd)continue;const w=wpn(c);
   if(st.caster&&fm){const mt=MON[fm.t],can=(id,lv)=>S.strats.includes(id)&&c.sf>=STRATS[id].c[lv]&&(!STRATS[id].sup||lv<2||has(STRATS[id].sup));
    if(mt.boss&&can('ajuste',1))return{k:'cast',i,id:'ajuste',lv:1};
    if(mt.boss&&!(fm.blind>S.T)&&can('poudre',1))return{k:'cast',i,id:'poudre',lv:1};
    if(!(fm.stun>S.T)&&fm.hp>14&&can('cri',0)&&c.sf>STRATS.cri.c[0]+4)return{k:'cast',i,id:'cri',lv:0};
    if(fm.hp>18&&can('feu',1))return{k:'cast',i,id:'feu',lv:1};}
   if(w.rng){if(target(w.rng))return{k:'attack',i};continue;}
   if(fm||(w.reach&&target(w.reach)))return{k:'attack',i};}
  return{k:'wait'};},
 think(){const m=this.mem;m.stat.acts++;
  if(!$('dlg').hidden)return this.dlg();
  if(!$('modal').hidden)return this.modal();
  if(!$('title').hidden)return{k:'done'};
  if(resting)return{k:'wait'};
  const hp=S.party.reduce((a,c)=>a+c.hp,0);if(m.lastHp!=null&&hp<m.lastHp)m.stat.dmg+=m.lastHp-hp;m.lastHp=hp;m.stat.minHp=Math.min(m.stat.minHp,...S.party.map(c=>c.hp/c.hpM));
  const f=this.fight();if(f&&f.k!=='wait')return f;
  const h=this.heal();if(h)return h;if(f)return f;
  const e=this.equip();if(e)return e;
  // menace éveillée à portée : on va la chercher
  let g=null;const aw=LS.mons.filter(mo=>mo.hp>0&&!mo.gone&&mo.aw&&df[mo.y*MW+mo.x]<9).sort((a,b)=>df[a.y*MW+a.x]-df[b.y*MW+b.x])[0];
  if(aw)g={t:'mon',x:aw.x,y:aw.y,id:'m',adj:1,mon:aw};
  if(!g){let best=null,bl=1e9;for(const t of this.targets()){if(m.bad[S.lv+t.id]>3)continue;const p=this.bfs(t.x,t.y,t.adj);if(p&&p.length<bl){bl=p.length;best=t;}}g=best;}
  if(!g){const x=this.exitCell();if(x&&this.bfs(x.x,x.y,1))g=x;}
  if(!g){m.stuck=(m.stuck||0)+1;return m.stuck>40?{k:'softlock'}:{k:'wait'};}m.stuck=0;
  const p=this.bfs(g.x,g.y,g.adj);if(!p){m.bad[S.lv+g.id]=(m.bad[S.lv+g.id]||0)+1;return{k:'wait'};}
  if(!p.length){if(g.t==='item'){m.bad[S.lv+g.id]=(m.bad[S.lv+g.id]||0)+1;return{k:'interact'};}const k=this.dirTo(g.x,g.y),fc=this.face(k);if(fc)return fc;
   if(g.t==='npc')m.talk[S.lv+g.npc]=1;if(g.t==='mon')return{k:'wait'};m.bad[S.lv+g.id]=(m.bad[S.lv+g.id]||0)+(g.t==='exit'?0:1);return{k:'interact'};}
  const[nx,ny]=p[0],k=this.dirTo(nx,ny),fc=this.face(k);if(fc)return fc;const c=cell(nx,ny);
  if(c==='D'||c==='L')return{k:'interact'};if(monAt(nx,ny))return{k:'wait'};return{k:'move'};},
 dlg(){const bs=[...$('dlgBtns').querySelectorAll('button')],P=this.mem.P;if(bs.length<2)return{k:'dlg',n:-1};
  const t=bs[0].textContent;let n=0;
  if(t.includes('Je vous suis'))n=P.tent;else if(t.includes('trois victoires'))n=P.trempe;else if(t.includes('En garde'))n=P.style.sergent||0;
  else if(t.includes('Venez avec nous'))n=P.anselme||0;else if(t.includes('Cette fois'))n=P.odon||0;else if(t.includes('faisons simple'))n=P.style.hagen||0;
  if(!bs[n]||bs[n].disabled)n=0;return{k:'dlg',n};},
 modal(){const m=this.mem,st=m.P.style,box=$('modalBox');
  if(box.querySelector('[data-buy]')&&!st.noshop){const want=[];const lack=k=>S.party.some(c=>!c.eq[k]);
   const cnt=id=>S.bag.filter(x=>x===id).length;
   if(LV.dark&&!has('lanterne'))want.push('lanterne');
   for(const id of SHOPS[shopId]){const it=ITEMS[id];
    if(it.k==='corps'&&lack('corps')&&!S.bag.some(b=>ITEMS[b].k==='corps'))want.push(id);
    if(it.k==='appoint'&&lack('appoint')&&!S.bag.some(b=>ITEMS[b].k==='appoint'))want.push(id);
    if(it.k==='main'&&!it.rng&&S.party.some(c=>c.sk.armes.l>=2&&wpn(c).m+1.5<it.m)&&!S.bag.some(b=>ITEMS[b].k==='main'&&ITEMS[b].m>=it.m))want.push(id);}
   if(cnt('onguent')<3)want.push('onguent');if(cnt('herbes')<2&&SHOPS[shopId].includes('herbes'))want.push('herbes');if(LV.dark&&cnt('huile')<1&&SHOPS[shopId].includes('huile'))want.push('huile');
   for(const id of want){const b=box.querySelector(`[data-buy="${id}"]`);if(b&&!b.disabled&&m.stat.buys<60){m.stat.buys++;return{k:'buy',id};}}}
  return{k:'close'};},
 check(){const v=this.mem.viol,bad=s=>{if(v.length<12&&!v.includes(s))v.push(s);};
  if(!S||!LS)return;if(!pass(S.x,S.y))bad('joueur dans un mur '+S.lv+' '+S.x+','+S.y);if(!isFinite(S.T))bad('temps invalide');if(S.bag.length>BAGMAX)bad('sac > 48');
  if(S.bag.some(id=>!ITEMS[id]))bad('objet inconnu dans le sac');if(S.hand&&!ITEMS[S.hand])bad('objet tenu inconnu');
  const seen={};for(const mo of LS.mons){if(mo.hp<=0||mo.gone)continue;const k=mo.x+','+mo.y;if(seen[k])bad('deux ennemis sur une case '+k);seen[k]=1;if(!pass(mo.x,mo.y))bad('ennemi dans un mur '+mo.t+' '+k);if(mo.x===S.x&&mo.y===S.y)bad('ennemi sur la troupe');if(!isFinite(mo.hp))bad('vie ennemie invalide');}
  for(const c of S.party){if(!isFinite(c.hp)||c.hp<0||c.hp>c.hpM)bad('vie hors bornes '+c.id+' '+c.hp+'/'+c.hpM);if(c.sf<0||c.sf>c.sfM)bad('souffle hors bornes '+c.id+' '+c.sf+'/'+c.sfM);for(const k in c.eq)if(c.eq[k]&&!ITEMS[c.eq[k]])bad('équipement inconnu');}
  if(S.gold<0)bad('or négatif');if(new Set(S.strats).size!==S.strats.length)bad('stratagème en double');},
 /* exécution directe et accélérée (bots de simulation) */
 adv(ms){for(let t=0;t<ms;t+=50){if(paused())break;const n=resting?8:1;for(let k=0;k<n;k++){S.T+=50;tickMons();tickProj();tickStates();if(paused())break;}if(resting&&!paused())restTick(50);}anim=null;queued=null;},
 doSim(a){const m=this.mem;
  switch(a.k){
   case'turn':turn(a.s);this.adv(140);break;case'move':move(0);this.adv(170);break;case'interact':interact();this.adv(120);break;
   case'attack':attack(a.i);this.adv(50);break;case'cast':cast(a.i,a.id,a.lv);this.adv(50);break;case'wait':this.adv(resting?100:50);break;
   case'rest':m.stat.rests++;rest();this.adv(100);break;
   case'use':case'equip':{const i=S.bag.indexOf(a.id);if(i<0)break;if(S.hand)stow();S.hand=S.bag.splice(i,1)[0];tapPt(a.i);if(S.hand)stow();if(a.k==='use')m.stat.items++;this.adv(50);break;}
   case'dlg':{twDone();const bs=[...$('dlgBtns').querySelectorAll('button')];if(a.n<0)nextLine();else bs[a.n].click();break;}
   case'buy':$('modalBox').querySelector(`[data-buy="${a.id}"]`).click();break;case'close':$('modal').hidden=true;ui();break;}},
 run(P,levels){const out={name:P.name,levels:[],errors:[]};try{
   $('title').hidden=true;newGame(P.diff);this.init(P);const m=this.mem;let cur=null,L=null,guard=0;
   const open=()=>{L={lv:S.lv,T0:S.T,dead0:m.dead,s0:Object.assign({},m.stat),res:'en cours'};m.stat.minHp=1;};
   while(guard++<60000){const a=this.think();
    if(S&&LS&&S.lv!==cur){if(L){L.res='réussi';this.close(L,out);}cur=S.lv;open();if(levels&&!levels.includes(cur)){L=null;break;}}
    if(a.k==='done'){if(L){L.res='réussi';this.close(L,out);L=null;}break;}
    if(a.k==='softlock'){L.res='bloqué';break;}
    if(L&&m.dead-L.dead0>5){L.res='abandon (6 défaites)';break;}
    if(L&&S.T-L.T0>40*60000){L.res='trop long';break;}
    this.doSim(a);if(guard%25===0)this.check();}
   if(L)this.close(L,out);if(guard>=60000)out.errors.push('boucle sans fin');out.viol=m.viol;
  }catch(e){out.errors.push(String(e)+' @ '+(e.stack||'').split('\n').slice(1,4).join(' | '));}return out;},
 close(L,out){const m=this.mem,s=m.stat;out.levels.push({lv:L.lv,res:L.res,min:Math.round((S.T-L.T0)/6000)/10,dead:m.dead-L.dead0,rests:s.rests-L.s0.rests,casts:s.casts-L.s0.casts,items:s.items-L.s0.items,dmg:s.dmg-L.s0.dmg,minHp:Math.round(s.minHp*100),
   gold:S.gold,party:S.party.map(c=>c.id[0]+c.sk.armes.l+c.sk.adresse.l+c.sk.savoir.l).join(' '),strats:S.strats.length,alive:LS?LS.mons.filter(x=>x.hp>0&&!x.gone).length:0});}
};})();
