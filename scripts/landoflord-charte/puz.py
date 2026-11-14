# Énigmes de lieu : une par carte, facultative, récompensée. Trois mécaniques : ordre, état, offrande.
import json
G = lambda q: ['or', q]
PUZ = {
 'geoles': dict(t='ordre', ck='table', clue="Le registre de ronde, ouvert à la page du jour : « Service des tonneaux. D'abord le vin, puis le vinaigre, l'eau en dernier. Le sergent ne boit jamais dans l'autre sens, et il compte. »",
   k=['barrel', 'barrel', 'barrel'], n=["le tonneau marqué d'une grappe", "le tonneau marqué d'une croix", "le tonneau marqué d'une vague"], o=[0, 1, 2], act="Vous frappez", ko="Il sonne faux : quelque chose retombe dans le mur. Il faut tout reprendre.",
   ok="Derrière le troisième tonneau, une planche bascule : la cave personnelle du sergent.", loot=[G(30), ['onguent', 0], ['vin', 0]]),
 'egouts': dict(t='etat', ck='stele', clue="Une plaque du service des eaux : « Vanne rouge : pleine. Vanne verte : fermée. Vanne noire : à demi. Toute autre disposition noie l'intendance, et l'intendant avec. »",
   k=['vanne', 'vanne', 'vanne'], n=["la vanne rouge", "la vanne verte", "la vanne noire"], s=["fermée", "à demi", "pleine"], g=[2, 0, 1],
   ok="L'eau change de pente avec un long soupir. Un caisson remonte du fond, couvert de vase et plein de bonnes surprises.", loot=[G(35), ['potfeu', 0], ['onguent', 0]]),
 'egouts2': dict(t='offre', ck='stele', clue="Gravé par les égoutiers : « Qui nourrit le saint, abreuve la table et rallume le feu repartira plus riche qu'il n'est venu. Les autres repartent, c'est déjà bien. »",
   k=['statue', 'table', 'brazier'], n=["le saint des égoutiers", "la table des compagnons", "le brasero éteint"], w=['pain', 'vin', 'huile'],
   h=["Sa main de pierre est tendue, paume en l'air. Il a faim depuis longtemps.", "Les gobelets sont vides et retournés. On attend qu'on serve.", "Les cendres sont froides. Il lui faudrait de quoi brûler."],
   ok="La confrérie des égoutiers tient parole, même absente : une dalle se soulève sur leur caisse commune.", loot=[G(45), ['onguent', 0], ['potfeu', 0]]),
 'village': dict(t='ordre', ck='stele', clue="La borne du village porte une comptine : « Salue la sainte, tire l'eau, charge la charrette : c'est ainsi qu'on commence une journée honnête. »",
   k=['statue', 'well', 'cart'], n=["la sainte du carrefour", "le puits", "la charrette"], o=[0, 1, 2], act="Vous vous occupez de", ko="Rien ne se passe, sinon qu'une vieille vous regarde de travers. Ce n'était pas l'ordre.",
   ok="Sous le plateau de la charrette, un double fond : les économies du village, cachées aux pillards. On vous en laisse la garde.", loot=[G(25), ['pain', 0], ['onguent', 0]]),
 'mine': dict(t='etat', ck='pupitre', clue="Le tableau de pesée du contremaître : « Wagonnet I : plein. Wagonnet II : vide. Wagonnet III : à demi. Sinon la bascule refuse, et moi aussi. »",
   k=['cart', 'cart', 'cart'], n=["le wagonnet I", "le wagonnet II", "le wagonnet III"], s=["vide", "à demi", "plein"], g=[2, 0, 1],
   ok="La bascule s'incline, satisfaite. Dans son socle, le tiroir de la paie s'ouvre : personne n'était venu la chercher.", loot=[G(40), ['huile', 0], ['potfeu', 0]]),
 'mine2': dict(t='ordre', ck='stele', clue="À la craie, d'une main pressée : « On éclaire d'abord la taille, puis le puits, puis le fond. Dans l'autre sens, on ne remonte pas pour le dire. »",
   k=['brazier', 'brazier', 'brazier'], n=["le brasero de la taille", "le brasero du puits", "le brasero du fond"], o=[0, 1, 2], act="Vous ranimez", ko="Un courant d'air mauvais souffle tout. Les anciens avaient leurs raisons.",
   ok="Les trois feux tirent ensemble, et l'air se met à circuler. Dans la lueur, une veine d'argent natif que personne n'avait vue.", loot=[G(55), ['onguent', 0]]),
 'abbaye': dict(t='ordre', ck='pupitre', clue="L'ordinaire du sonneur : « Matines sonne grave, laudes sonne clair, vêpres sonne fêlé, complies ne sonne qu'à peine. Qui se trompe recommence, et jeûne. »",
   k=['bell', 'bell', 'bell', 'bell'], n=["la cloche fêlée", "la clochette", "la grosse cloche", "la cloche claire"], o=[2, 3, 0, 1], act="Vous sonnez", ko="Fausse note. Quelque part, un frère mort depuis cent ans lève les yeux au ciel.",
   ok="Les quatre heures sonnées, le tronc des pauvres pivote. Les pauvres, ces temps-ci, c'est vous.", loot=[G(45), ['onguent', 0], ['herbes', 0]], fx='boom'),
 'crypte': dict(t='offre', ck='pupitre', clue="L'obituaire de Saint-Aubert : « Trois abbés reposent ici comme ils ont vécu : l'un à table, l'autre à la cave, le troisième à l'herbier. Rendez à chacun son péché. »",
   k=['stele', 'stele', 'stele'], n=["la tombe de l'abbé Gontier le Large", "la tombe de l'abbé Fulcran", "la tombe de l'abbé Médard"], w=['pain', 'vin', 'herbes'],
   h=["Le gisant a les mains croisées sur un ventre considérable.", "Le gisant tient un gobelet de pierre, vide.", "Le gisant serre un mortier et son pilon."],
   ok="Les trois abbés sont contents. Une dalle glisse : ils avaient mis de côté pour leurs vieux jours, qui ne sont pas venus.", loot=[G(60), ['onguent', 0], ['onguent', 0]]),
 'foret': dict(t='ordre', ck='stele', clue="La borne des veneurs : « Qui chasse dans Brocevaux salue d'abord celui qui fuit, puis celui qui suit, puis celui qui charge. »",
   k=['stele', 'stele', 'stele'], n=["la pierre au sanglier", "la pierre au cerf", "la pierre au loup"], o=[1, 2, 0], act="Vous saluez", ko="La forêt ne répond pas. Les veneurs étaient pointilleux.",
   ok="Sous la dernière pierre, la cache des veneurs : ce qu'ils gardaient pour les mauvais hivers.", loot=[G(40), ['herbes', 0], ['potfeu', 0]]),
 'ruines': dict(t='etat', ck='stele', clue="Sur le socle brisé : « Le roi regarde le levant, la reine le couchant, et le fou regarde le nord, où il n'y a rien. »",
   k=['statue', 'statue', 'statue'], n=["la statue du roi", "la statue de la reine", "la statue du fou"], s=["tournée vers le midi", "tournée vers le couchant", "tournée vers le nord", "tournée vers le levant"], g=[3, 1, 2],
   ok="Les trois regards se croisent enfin au bon endroit. Là où ils tombent, une dalle sonne creux, et cède.", loot=[G(65), ['onguent', 0]]),
 'marais': dict(t='offre', ck='stele', clue="Un poteau du passeur : « Deux feux pour le chenal, une rasade pour la Dame de pierre. Sans quoi la Morte-Eau garde ce qu'elle a pris. »",
   k=['brazier', 'brazier', 'statue'], n=["le fanal de l'amont", "le fanal de l'aval", "la Dame de pierre"], w=['huile', 'huile', 'vin'],
   h=["Sa coupelle est sèche. Il brûlait de l'huile.", "Sa coupelle est sèche. Il brûlait de l'huile.", "Elle tient une coupe vide, tendue vers vous avec insistance."],
   ok="Le chenal s'éclaire. Une barque échouée apparaît entre les saules, avec la cargaison d'un contrebandier moins chanceux que vous.", loot=[G(60), ['potfeu', 0], ['onguent', 0]]),
 'faubourgs': dict(t='ordre', ck='pupitre', clue="Le règlement du guet, à l'usage des nouveaux : « À Castelroc on boit d'abord à la fontaine, on jure ensuite devant le saint, et l'on paie à la borne. Jamais l'inverse : on a essayé. »",
   k=['fountain', 'statue', 'stele'], n=["la fontaine", "le saint du faubourg", "la borne de l'octroi"], o=[0, 1, 2], act="Vous sacrifiez à l'usage devant", ko="Un bourgeois vous toise. On voit bien que vous n'êtes pas d'ici.",
   ok="La borne de l'octroi rend la monnaie : un casier s'ouvre, plein de ce que le guet avait « mis de côté ».", loot=[G(50), ['vin', 0], ['onguent', 0]]),
 'cour': dict(t='etat', ck='pupitre', clue="Le protocole, annoté : « Le chandelier de la reine brûle entier. Celui du chancelier, à une flamme. Celui du connétable reste éteint : depuis l'arrestation. »",
   k=['chandelier', 'chandelier', 'chandelier'], n=["le chandelier de la reine", "le chandelier du chancelier", "le chandelier du connétable"], s=["éteint", "une flamme", "toutes les flammes"], g=[2, 1, 0],
   ok="Le protocole est respecté. Un huissier de bois sort du mur avec un plateau : la gratification des gens de service.", loot=[G(55), ['onguent', 0], ['vin', 0]]),
 'palais2': dict(t='ordre', ck='stele', clue="Une note d'archiviste : « Classez dans l'ordre : la naissance, l'impôt, le décès. L'administration ne connaît personne autrement. »",
   k=['pupitre', 'pupitre', 'pupitre'], n=["le registre des sépultures", "le registre des baptêmes", "le registre des tailles"], o=[1, 2, 0], act="Vous refermez", ko="Les pages se rouvrent toutes seules. L'administration a horreur du désordre.",
   ok="Les trois registres en ordre, le pupitre libère un tiroir : les étrennes que les archivistes n'ont jamais osé réclamer.", loot=[G(60), ['onguent', 0], ['potfeu', 0]]),
 'palais3': dict(t='etat', ck='stele', clue="L'usage de la chancellerie : « Aux traités la cire verte, aux grâces la rouge, aux condamnations la noire. Malvoisin n'a usé que de la dernière. »",
   k=['pupitre', 'pupitre', 'pupitre'], n=["le pupitre des traités", "le pupitre des grâces", "le pupitre des condamnations"], s=["sans cire", "cire verte", "cire rouge", "cire noire"], g=[1, 2, 3],
   ok="Chaque acte a sa cire. Le coffret des sceaux s'ouvre : on y gardait de quoi acheter les signatures récalcitrantes.", loot=[G(80), ['onguent', 0], ['onguent', 0]]),
 'camp': dict(t='ordre', ck='pupitre', clue="L'ordre du jour de Karst : « On bat d'abord ce qui lève, ensuite ce qui nourrit, enfin ce qui couche. Tout tambour fautif sera retenu sur la solde. »",
   k=['tambour', 'tambour', 'tambour'], n=["le tambour de la soupe", "le tambour de l'extinction", "le tambour du réveil"], o=[2, 0, 1], act="Vous battez", ko="Une tête sort d'une tente, vous regarde, et rentre. Ce n'était pas la bonne batterie.",
   ok="La troisième batterie fait tomber quelque chose dans la caisse du tambour-major : sa cagnotte, cachée où personne ne frappe d'habitude.", loot=[G(55), ['potfeu', 0], ['onguent', 0]]),
 'galeries': dict(t='etat', ck='stele', clue="De la main de Brune : « Aérage : ouvrir aux deux bouts, fermer au milieu. Sinon la mèche s'étouffe, et moi je m'énerve. »",
   k=['vanne', 'vanne', 'vanne'], n=["le volet de l'entrée", "le volet du milieu", "le volet du fond"], s=["fermé", "ouvert"], g=[1, 0, 1],
   ok="L'air file droit dans le rameau. Derrière un étai, le casse-croûte des sapeurs et leur cagnotte de chantier.", loot=[G(50), ['huile', 0], ['onguent', 0]]),
}
JS = "\n/* énigmes de lieu : placées au chargement sur des cases libres qui ne coupent aucun passage */\nconst PUZ=" + json.dumps(PUZ, ensure_ascii=False) + r""";
function freeCells(lv,need,nearFirst,loose){const D4=[[1,0],[-1,0],[0,1],[0,-1]],L=LEVELS[lv];if(!L||!L.map||!L.start)return null;
 if(!freeCells.A){freeCells.A={};for(const a in LEVELS)for(const k in LEVELS[a].links||{}){const v=LEVELS[a].links[k];if(v&&v.lv)(freeCells.A[v.lv]=freeCells.A[v.lv]||[]).push(v.x+','+v.y);}}
 const M=L.map,H=M.length,W=M[0].length,sx=L.start[0],sy=L.start[1];
 const occ=new Set();for(const p of L.props||[])occ.add(p.x+','+p.y);for(const n of L.npcs||[])occ.add(n.x+','+n.y);
 const busy=new Set(occ);for(const it of L.items||[])busy.add(it[1]+','+it[2]);for(const m of L.mons||[])busy.add(m[1]+','+m[2]);for(const k in L.fx||{})busy.add(k);for(const t of L.trig||[])busy.add(t[0]+','+t[1]);for(const k in L.links||{})busy.add(k);for(const k in L.ports||{})busy.add(L.ports[k][0]+','+L.ports[k][1]);for(const k of freeCells.A[lv]||[])busy.add(k);for(const k of L._res||[])busy.add(k);
 const walk=(x,y)=>y>=0&&y<H&&x>=0&&x<W&&M[y][x]!=='#'&&!occ.has(x+','+y);
 const reach=(bx,by)=>{const seen=new Set([sx+','+sy]),q=[[sx,sy]];while(q.length){const[x,y]=q.pop();for(const[dx,dy]of D4){const nx=x+dx,ny=y+dy,k=nx+','+ny;if(seen.has(k)||!walk(nx,ny)||(nx===bx&&ny===by))continue;seen.add(k);q.push([nx,ny]);}}return seen;};
 let base=reach(-1,-1);const cand=[];
 for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){const k=x+','+y;if(M[y][x]!=='.'||busy.has(k)||!base.has(k)||Math.abs(x-sx)+Math.abs(y-sy)<3)continue;
  let ok=1,w=0;for(const[dx,dy]of D4){const c=M[y+dy][x+dx];if(c==='#')w++;else if(c!=='.')ok=0;}
  if(ok&&w===2&&((M[y][x-1]==='#'&&M[y][x+1]==='#')||(M[y-1][x]==='#'&&M[y+1][x]==='#')))ok=0;/* pas au milieu d'un couloir */if(ok&&w>=2)cand.push([x,y,((x*73856093^y*19349663^(need*977+(loose?31:0)))>>>0)%9973]);}
 const picks=[],take=(c)=>{if(!loose&&reach(c[0],c[1]).size!==base.size-1)return false;if(!loose){occ.add(c[0]+','+c[1]);base=reach(-1,-1);}picks.push(c);return true;};
 if(nearFirst){cand.sort((a,b)=>Math.abs(a[0]-sx)+Math.abs(a[1]-sy)-Math.abs(b[0]-sx)-Math.abs(b[1]-sy));for(const c of cand)if(take(c))break;}
 cand.sort((a,b)=>a[2]-b[2]);
 for(const gap of[7,4,2])for(const c of cand){if(picks.length>=need)break;if(picks.includes(c)||picks.some(p=>Math.abs(p[0]-c[0])+Math.abs(p[1]-c[1])<gap))continue;take(c);}
 if(picks.length<need)return null;L._res=(L._res||[]).concat(picks.map(c=>c[0]+','+c[1]));return picks;}
for(const lv in PUZ){const P=PUZ[lv],L=LEVELS[lv],picks=freeCells(lv,P.n.length+1,1);if(!picks){delete PUZ[lv];continue;}
 L.props=L.props||[];L.props.push({id:'z0',k:P.ck,x:picks[0][0],y:picks[0][1],sc:'puz',pz:-1});
 P.n.forEach((n,i)=>L.props.push({id:'z'+(i+1),k:P.k[i],x:picks[i+1][0],y:picks[i+1][1],sc:'puz',pz:i}));}
SC.puz=function(p){const P=PUZ[S.lv];if(!P)return;const Z=LS.pz=LS.pz||{q:[],st:{},ok:0};
 if(p.pz<0){sfx('page');say([[null,P.clue]]);return;}
 const nm=P.n[p.pz];if(Z.ok){log(`${cap(nm)} : plus rien à en tirer, l'affaire est faite.`);return;}
 if(P.t==='ordre'){sfx(P.fx||'lever');Z.q.push(p.pz);const i=Z.q.length-1;
  if(P.o[i]!==p.pz){Z.q=[];log(`${P.act} ${nm}. ${P.ko}`);return;}
  if(Z.q.length<P.o.length){log(`${P.act} ${nm}. ${["Quelque chose a bougé, pas loin.","Un déclic répond, quelque part.","Cela répond encore."][i%3]}`);return;}}
 else if(P.t==='etat'){sfx('lever');Z.st[p.pz]=((Z.st[p.pz]||0)+1)%P.s.length;log(`${cap(nm)} : ${P.s[Z.st[p.pz]]}.`);if(!P.g.every((v,i)=>(Z.st[i]||0)===v))return;}
 else{const w=P.w[p.pz];if(Z.st[p.pz]){log(`${cap(nm)} a déjà reçu son dû.`);return;}if(!has(w)){log(`${cap(nm)}. ${P.h[p.pz]}`);return;}
  consume(w);Z.st[p.pz]=1;sfx('pick');log(`Vous laissez là ${ITEMS[w].n.toLowerCase()}. ${cap(nm)} : c'était bien cela.`);ui();if(!P.w.every((v,i)=>Z.st[i]))return;}
 Z.ok=1;shake();sfx('coin');const got=P.loot.map(l=>give(l[0],l[1]||0)),b=best('savoir');if(b)gainXp(b,'savoir',25);log(`<b>${P.ok}</b> Vous y gagnez : <b>${got.join(', ')}</b>.`);ui();save('auto');};
"""
