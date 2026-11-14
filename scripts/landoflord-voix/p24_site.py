# Herses : la dalle à minuterie de la forêt de Brocevaux n'est plus au pied de la herse du chemin (elle ouvrait une autre
# herse, celle de la chambre forte) ; le message de la dalle dit de quel côté la herse remonte ; une herse examinée dit
# ce qui la commande et de quel côté chercher.
#   python3 p24_site.py <index.html>      — indépendant de p21–p23 ; refuse de s'appliquer deux fois.
import sys
P=sys.argv[1];h=open(P,encoding='utf-8').read()
assert 'gateHint' not in h,'correctif déjà appliqué'
def rep(old,new,n=1):
    global h;c=h.count(old);assert c==n,(old[:70],c);h=h.replace(old,new)
JS=r"""/* ---------- herses : qui les commande, et de quel côté ---------- */
function dirTo(dx,dy){const ns=dy<-1?'nord':dy>1?'sud':'',ew=dx<-1?'ouest':dx>1?'est':'',d=ns&&ew?ns+'-'+ew:ns||ew;return!d?'tout près':(d[0]==='e'||d[0]==='o'?"à l'":'au ')+d;}
function roomAt(x,y){for(const r of LV.rooms||[])if(x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h)return r.n;return'';}
function gateHint(x,y){const k=x+','+y;
 for(const lk in LV.levers||{}){const t=LV.levers[lk];if(t[0]!==x||t[1]!==y)continue;const[lx,ly]=lk.split(',').map(Number);let rn='';for(let d=0;d<4&&!rn;d++){const a=lx+DX[d],b=ly+DY[d];if(LEVELS[S.lv].map[b]&&LEVELS[S.lv].map[b][a]==='.')rn=roomAt(a,b);}
  return rn?`Une herse de fer. Elle se commande d'ailleurs : cherchez un levier du côté de « ${rn} », ${dirTo(lx-S.x,ly-S.y)}.`:`Une herse de fer. Elle se commande d'ailleurs : cherchez un levier ${dirTo(lx-S.x,ly-S.y)}.`;}
 for(const fk in LV.fx||{}){const f=LV.fx[fk];if(!f.gate||f.gate[0]!==x||f.gate[1]!==y)continue;const[px,py]=fk.split(',').map(Number);
  return f.t==='tplate'?`Une herse de fer, sans levier. Une dalle la commande, ${dirTo(px-S.x,py-S.y)}, et ne la tient pas longtemps levée : il faudra courir.`:`Une herse de fer, sans levier. Une dalle la commande, ${dirTo(px-S.x,py-S.y)}.`;}
 for(const q of LV.seq||[])if(q.target&&q.target[0]===x&&q.target[1]===y)return"Une herse de fer, sans levier. Des signes gravés la commandent, dans un ordre précis.";
 return"Une herse de fer. Elle se commande d'ailleurs : cherchez un levier.";}
function cellFx(){"""
rep("function cellFx(){",JS)
rep("""else if(c==='G')log("Une herse de fer. Elle se commande d'ailleurs : cherchez un levier.");""","""else if(c==='G')log(gateHint(x,y));""")
rep("""log("Une dalle s'enfonce : une herse remonte, et quelque part un cliquetis se met à compter.");""","""log(`Une dalle s'enfonce : une herse remonte ${dirTo(g[0]-S.x,g[1]-S.y)}, à quelques pas, et un cliquetis se met à compter.`);""")
# forêt de Brocevaux : la dalle de la chambre forte passe entre les deux pierres levées, loin de la herse du chemin
FIX=r"""
/* p24 : dalle de la chambre forte de Brocevaux déplacée entre les deux pierres levées (elle était au pied de la herse du chemin) */
(function(){const L=LEVELS.foret,f=L&&L.fx&&L.fx['14,16'];if(!f||f.t!=='tplate'||!f.gate||f.gate[0]!==17||f.gate[1]!==13||L.map[17][14]!=='G'||L.map[15][19]!=='.'||L.fx['19,15'])return;
 for(const p of L.props||[])if(p.x===19&&p.y===15)return;L.fx['19,15']=f;delete L.fx['14,16'];})();
</script>
</body>"""
rep("\n</script>\n</body>",FIX)
open(P,'w',encoding='utf-8').write(h);print('herses : correctif appliqué')
