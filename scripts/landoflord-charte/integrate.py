# Reconstruit index.html à partir de la version d'origine (git HEAD) : images de la charte + retouches du moteur.
import re, sys, io, os, json, base64, subprocess, glob
import numpy as np
from PIL import Image
SWV = 34
sys.path.insert(0, '/home/claude/work/tools'); import charte
REPO = '/home/claude/ecolesenligne'; REL = 'public/landoflord/index.html'
WK = '/home/claude/work'
src = open(WK + '/old_voix.html', encoding='utf8').read()   # version d'avant la charte (cbf763c) + voix (b836477)
L = src.split('\n')

def uri(im):
    b = io.BytesIO(); kw = {}
    if 'transparency' in im.info: kw['transparency'] = im.info['transparency']
    im.save(b, 'PNG', optimize=True, **kw); return 'data:image/png;base64,' + base64.b64encode(b.getvalue()).decode()
def load(u): return Image.open(io.BytesIO(base64.b64decode(u.split(',', 1)[1])))
def pairs(line): return re.findall(r'"([A-Za-z0-9_]+)":\s*"(data:image/[a-z]+;base64,[A-Za-z0-9+/=]+)"', line)
def rep1(s, a, b, n=1):
    assert s.count(a) == n, (s.count(a), a[:80]); return s.replace(a, b)

# ---------- 1. décors, illustrations, bustes ----------
i_img = next(i for i, l in enumerate(L) if l.startswith('const IMG={'))
i_bust = next(i for i, l in enumerate(L) if l.startswith('const BUSTS='))
BUSTS = json.loads(L[i_bust][len('const BUSTS='):].rstrip(';'))
old = dict(pairs(L[i_img])); new = {}
for f in sorted(glob.glob(WK + '/tex/*.png')):
    new[os.path.basename(f)[:-4]] = uri(Image.open(f))
def quant_bust(im, b):
    im = im.convert('RGBA'); Wd, Hd = im.size; out = Image.new('RGBA', im.size, (0, 0, 0, 0))
    def q(region, dest):   # quantifie une zone avec la phase de tramage de l'endroit où elle sera affichée
        x0, y0, x1, y1 = region; cv = Image.new('RGBA', (dest[0] + x1 - x0 + 4, dest[1] + y1 - y0 + 4), (0, 0, 0, 0)); cv.paste(im.crop(region), dest)
        r = charte.quantize(cv, dither=10).convert('RGBA').crop((dest[0], dest[1], dest[0] + x1 - x0, dest[1] + y1 - y0)); out.paste(r, (x0, y0))
    q((0, 0, min(192, Wd), Hd), (0, 0))
    mx, my, mw, mh = b['m']; ex, ey, ew, eh = b['e']
    for i in range(Hd // mh + 1):
        if i * mh < Hd and Wd > 192: q((192, i * mh, min(Wd, 192 + mw), min(Hd, (i + 1) * mh)), (mx, my))
    for i in range(Hd // eh + 1):
        if i * eh < Hd and Wd > 192 + mw: q((192 + mw, i * eh, min(Wd, 192 + mw + ew), min(Hd, (i + 1) * eh)), (ex, ey))
    return charte.quantize(out, dither=0)
for f in sorted(glob.glob(WK + '/scn/h_*.png')):   # intérieurs d'échoppe
    new[os.path.basename(f)[:-4]] = uri(Image.open(f))
for f in sorted(glob.glob(WK + '/obj/*.png')):   # éléments de mur et meubles rendus en 3D
    new[os.path.basename(f)[:-4]] = uri(Image.open(f))
for k, u in old.items():
    if k[:2] == 's_' and os.path.exists(WK + '/scenes/%s.png' % k): new[k] = uri(charte.quantize(Image.open(WK + '/scenes/%s.png' % k).convert('RGBA'), dither=0))
    elif k[:2] == 's_': new[k] = uri(charte.quantize(load(u).convert('RGBA'), dither=12, sat=.95))
    elif k[:2] == 'b_': new[k] = uri(quant_bust(load(u), BUSTS[k[2:]]))
    elif k[:2] in ('t_', 'f_', 'c_'): pass
    else: new[k] = u
L[i_img] = 'const IMG={' + ', '.join('"%s": "%s"' % kv for kv in new.items()) + '};'

# ---------- 2. personnages et bêtes ----------
i_sh = next(i for i, l in enumerate(L) if l.startswith('const SHEETS='))
meta = {}
for l in L[i_sh:i_sh + 4]:
    for m in re.finditer(r'"([a-z_]+)": (\{"w"[^}]*\})', l): meta[m.group(1)] = json.loads(m.group(2))
imgs = {}
for l in L[i_sh:i_sh + 4]: imgs.update(dict(pairs(l)))
order = list(imgs.keys()); out_img = {}; out_meta = {}
for k in order:
    f = WK + '/sheets/%s.png' % k
    if os.path.exists(f):
        m = json.load(open(WK + '/sheets/%s.json' % k))
        if meta[k].get('npc'): m.update(npc=1, idle=4, gest=4)
        out_img[k] = uri(Image.open(f)); out_meta[k] = m
    else:   # bêtes : mêmes rendus 3D, ramenés à la densité de pixels, au contraste et à la palette de la charte
        m = dict(meta[k]); im = load(imgs[k]).convert('RGBA'); sc_ = {'loup': .56, 'rat': .36, 'molosse': .55, 'ragondin': .5}[k]
        dens = m['ay'] * m.get('hk', .66) / (.6 * sc_ / .82); f = min(1.0, 215.0 / dens)
        w2, h2 = int(round(m['w'] * f)), int(round(m['h'] * f)); sheet = Image.new('RGBA', (w2 * m['n'], h2), (0, 0, 0, 0)); gy = int(round(m['ay'] * f))
        for i in range(m['n']):
            a = np.asarray(im.crop((i * m['w'], 0, (i + 1) * m['w'], m['h']))).astype(np.float64)
            a[..., :3] = np.clip((a[..., :3] - 110) * 1.22 + 108, 0, 255); a[a[..., 3] < 200, 3] = 0   # l'ancienne ombre fondue disparaît
            pm = a.copy(); pm[..., :3] *= pm[..., 3:4] / 255.0
            sm = np.asarray(Image.fromarray(pm.astype(np.uint8), 'RGBA').resize((w2, h2), Image.BOX)).astype(np.float64)
            al = sm[..., 3:4]; rgb = np.where(al > 0, sm[..., :3] * 255.0 / np.maximum(al, 1), 0); body = sm[..., 3] > 127
            fr = np.concatenate([np.clip(rgb, 0, 255), np.where(body, 255, 0)[..., None]], -1).astype(np.uint8)
            q = np.asarray(charte.quantize(Image.fromarray(fr, 'RGBA'), dither=12).convert('RGBA')).copy()
            cols = np.where(body[max(0, gy - 30):min(h2, gy + 6)].any(0))[0]
            if len(cols) and i < 11:   # ombre tramée, comme celle des personnages
                x0, x1 = cols[0], cols[-1]; yy, xx = np.mgrid[0:h2, 0:w2]; rx = max(8, (x1 - x0) / 2); ry = max(3, rx * .2)
                e = (((xx - (x0 + x1) / 2) / rx) ** 2 + ((yy - gy) / ry) ** 2 <= 1) & ~body & (((xx + yy) & 1) == 0); q[e] = (8, 6, 10, 255)
            sheet.paste(Image.fromarray(q, 'RGBA'), (i * w2, 0))
        m.update(w=w2, h=h2, ax=round(m['ax'] * f, 1), ay=round(m['ay'] * f, 1))
        out_img[k] = uri(charte.quantize(sheet, dither=0)); out_meta[k] = m
# ---------- 2b. deux paquets d'images : complet (ordinateur) et allégé (téléphone) ; index.html ne garde que le code ----------
def frames_rgba(u, m): im = load(u).convert('RGBA'); return [im.crop((i * m['w'], 0, (i + 1) * m['w'], m['h'])) for i in range(m['n'])]
def shrink(im, w2, h2):
    a = np.asarray(im).astype(np.float64); pm = a.copy(); pm[..., :3] *= pm[..., 3:4] / 255.0
    sm = np.asarray(Image.fromarray(pm.astype(np.uint8), 'RGBA').resize((w2, h2), Image.BOX)).astype(np.float64)
    al = sm[..., 3:4]; rgb = np.where(al > 0, sm[..., :3] * 255.0 / np.maximum(al, 1), 0)
    return Image.fromarray(np.concatenate([np.clip(rgb, 0, 255), np.where(sm[..., 3:4] > 110, 255, 0)], -1).astype(np.uint8), 'RGBA')
def lite_sheet(u, m, sc=.62):
    fr = frames_rgba(u, m); sel = [0, 2, 4, 6, 8, 10, 12, 13, 14, 15, 16, 18, 19, 21] if m['n'] == 22 else list(range(m['n']))
    w2, h2 = int(round(m['w'] * sc)), int(round(m['h'] * sc)); sheet = Image.new('RGBA', (w2 * len(sel), h2), (0, 0, 0, 0))
    for j, i in enumerate(sel): sheet.paste(shrink(fr[i], w2, h2), (j * w2, 0))
    m2 = dict(m); m2.update(w=w2, h=h2, n=len(sel), ax=round(m['ax'] * sc, 1), ay=round(m['ay'] * sc, 1))
    return uri(charte.quantize(sheet, dither=6)), m2
hd_img = dict(out_img); hd_meta = dict(out_meta)
for k in order:   # images de près (ordinateur seulement) : repos, frappe, touché, rendus 1,6 fois plus fins
    f = WK + '/sheets_n/%s.png' % k
    if os.path.exists(f) and os.path.getsize(WK + '/sheets_n/%s.json' % k) > 10:
        m = json.load(open(WK + '/sheets_n/%s.json' % k)); idx = json.load(open(WK + '/specs/n/%s.json' % k))['near']
        if out_meta[k]['n'] == max(idx) + 1 or out_meta[k]['n'] >= max(idx) + 1:
            m['map'] = {str(i): j for j, i in enumerate(idx)}; hd_img[k + '@n'] = uri(Image.open(f)); hd_meta[k + '@n'] = m
lt_img = {}; lt_meta = {}
for k in order: lt_img[k], lt_meta[k] = lite_sheet(out_img[k], out_meta[k])
lt_IMG = {}
for k, u in new.items():
    if k[:2] in ('u_', 'g_'): continue
    if k[:2] in ('s_', 'h_'): lt_IMG[k] = uri(charte.quantize(load(u).convert('RGB').resize((256, 128), Image.BOX).convert('RGBA'), dither=6))
    else: lt_IMG[k] = u
OUTD = os.path.join(REPO, 'public/landoflord')
def pack(name, I, SI, SM):
    t = 'window.PACK={IMG:{' + ', '.join('"%s": "%s"' % kv for kv in I.items()) + '},SHEETS:{"img": {' + ', '.join('"%s": "%s"' % kv for kv in SI.items()) + '}, "meta": ' + json.dumps(SM) + '}};'
    open(os.path.join(OUTD, name), 'w', encoding='utf8').write(t); return len(t) // 1024
print('paquets :', pack('pack-hd.js', new, hd_img, hd_meta), 'Ko (complet),', pack('pack-lite.js', lt_IMG, lt_img, lt_meta), 'Ko (allégé)')
L[i_img] = 'const IMG=PACK.IMG;'
L[i_sh] = 'const SHEETS=PACK.SHEETS;'

for j in (1, 2, 3):
    assert L[i_sh + j].startswith('/*'), L[i_sh + j][:40]
    L[i_sh + j] = L[i_sh + j][:L[i_sh + j].index('*/') + 2]
s = '\n'.join(L)
# le chargeur choisit le paquet : allégé sur téléphone, complet ailleurs (?hd ou ?lite dans l'adresse pour forcer)
i_ms = s.rfind('<script', 0, s.index('const IMG=PACK.IMG;'))
s = s[:i_ms] + "<script>(function(){var q=location.search,lite=/[?&]lite\\b/.test(q)||(!/[?&]hd\\b/.test(q)&&(/iPhone|iPod|Android.*Mobile|Windows Phone/i.test(navigator.userAgent)||(navigator.maxTouchPoints>1&&Math.min(screen.width,screen.height)<=600)));window.LITE=lite;document.write('<script src=\"pack-'+(lite?'lite':'hd')+'.js?v=" + str(SWV) + "\"><\\/script>');})();</script>\n" + s[i_ms:]

# ---------- 3. moteur ----------
# 3a. le filtre « VGA » devient le passage dans la palette de référence (table 32x32x32 précalculée)
lut = charte.lut()[::2, ::2, ::2]   # 64^3 -> 32^3
g = np.arange(32) * 8 + 4; grid = np.stack(np.meshgrid(g, g, g, indexing='ij'), -1)
lut32 = charte.lut()[grid[..., 0] >> 2, grid[..., 1] >> 2, grid[..., 2] >> 2].astype(np.uint8)
pal_js = ','.join(str((c[0] << 16) | (c[1] << 8) | c[2]) for c in charte.PAL)
a0 = s.index('function vga(c,q){'); a1 = s.index('\n', a0)
new_vga = ("/* Charte graphique : palette de référence (16 rampes de 16 tons, pas VGA) ; tout ce qui est peint par le jeu y passe. */\n"
 "const CHP=[" + pal_js + "],CHL=Uint8Array.from(atob('" + base64.b64encode(lut32.tobytes()).decode() + "'),c=>c.charCodeAt(0)),CHS=new Set(CHP);\n"
 "function vga(c,q){const g=c.getContext('2d'),im=g.getImageData(0,0,c.width,c.height),d=im.data,B=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5],w=c.width;q=q<0?0:Math.min(q||12,12);"
 "for(let y=0;y<c.height;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;if(!d[i+3]||CHS.has(d[i]<<16|d[i+1]<<8|d[i+2]))continue;const t=(B[(y&3)*4+(x&3)]/16-.47)*q,"
 "r=Math.max(0,Math.min(255,d[i]+t)),v=Math.max(0,Math.min(255,d[i+1]+t)),b=Math.max(0,Math.min(255,d[i+2]+t)),p=CHP[CHL[(r>>3)<<10|(v>>3)<<5|(b>>3)]];d[i]=p>>16;d[i+1]=p>>8&255;d[i+2]=p&255;}"
 "g.putImageData(im,0,0);return c;}")
s = s[:a0] + new_vga + s[a1:]
# 3b. murs : l'image de la charte telle quelle (corniches, étais et feuillages sont dans le rendu)
a0 = s.index("function wallBase(g,th,seed){"); a1 = s.index(" if(th==='forest'){g.fillStyle=lg(g,0,0,0,TS,'#16301a'", a0)
s = s[:a0] + ("function wallBase(g,th,seed,v){const r=rng(seed);const im=(v&&IMGEL['u_'+th])||IMGEL['t_'+th];\n"
 " if(im){g.imageSmoothingEnabled=false;const o=v&&!IMGEL['u_'+th]?TS/2:0;g.drawImage(im,o,0,TS-o,TS,0,0,TS-o,TS);if(o)g.drawImage(im,0,0,o,TS,TS-o,0,o,TS);return;}\n") + s[a1:]
s = rep1(s, "wall2:mk(TS,TS,g=>wallBase(g,th,s+50))", "wall2:mk(TS,TS,g=>wallBase(g,th,s+50,1))")
# 3c. sols et plafonds : même densité que les murs (128 points par case au lieu de 64)
a0 = s.index("for(const[k,o,th]of[['f_stone',FL,'stone']"); a1 = s.index('\n', a0)
s = s[:a0] + ("for(const th in seeds)for(const[p,o]of[['f_',FL],['c_',CL]])if(IMGEL[p+th])o[th]=pix(mk(128,128,g=>{g.imageSmoothingEnabled=false;g.drawImage(IMGEL[p+th],0,0,128,128);}));for(const th in seeds)if(IMGEL['g_'+th])FLB[th]=pix(mk(128,128,g=>{g.imageSmoothingEnabled=false;g.drawImage(IMGEL['g_'+th],0,0,128,128);}));\n"
 " for(const o of[FL,CL])for(const k in o)if(o[k]&&o[k].length===4096){const a=o[k],b=new Uint32Array(16384);for(let y=0;y<128;y++)for(let x=0;x<128;x++)b[y*128+x]=a[(y>>1)*64+(x>>1)];o[k]=b;}") + s[a1:]
s = rep1(s, "sx=d*ex*64,sy=d*ey*64;let fx_=(vx+d*rx0)*64,fy_=(vy+d*ry0)*64;", "sx=d*ex*128,sy=d*ey*128;let fx_=(vx+d*rx0)*128,fy_=(vy+d*ry0)*128;")
s = rep1(s, "const i=((fy_&63)<<6)|(fx_&63);let c=ft[i];if(FXM){const a=fx_>>6,b=fy_>>6,u=fx_&63,v=fy_&63;", "const i=((fy_&127)<<7)|(fx_&127);let c=(ftB&&((fx_>>7)*7+(fy_>>7)*13)%4===0?ftB:ft)[i];if(FXM){const a=fx_>>7,b=fy_>>7,u=(fx_&127)>>1,v=(fy_&127)>>1;")
s = rep1(s, "ft=FL[LV.theme],ct=CL[LV.theme]||FL[LV.theme],half=VH>>1", "ft=FL[LV.theme],ftB=FLB[LV.theme],ct=CL[LV.theme]||FL[LV.theme],half=VH>>1")
# 3d. plus de reteinte à la volée : les couleurs viennent des matières de la charte
s = rep1(s, "function regrade(){", "function regrade(){return;")
s = rep1(s, "/* Personnages animés : Flare (Clint Bellanger et contributeurs), CC-BY-SA 3.0, recomposés et retraités. */",
 "/* Personnages : modèles 3D de Flare (Clint Bellanger et contributeurs, CC-BY-SA 3.0), rendus de face à hauteur d'yeux avec la lumière et la palette de la charte. Décors modélisés et rendus avec la même lumière. */")
if "<p><b>Soldats animés</b>" in s: s = rep1(s, "<p><b>Soldats animés</b> : tirés du jeu libre Flare (Clint Bellanger et contributeurs), licence CC-BY-SA 3.0, recomposés et retraités pour ce jeu. Ces images restent sous la même licence.</p>",
 "<p><b>Personnages</b> : modèles 3D du jeu libre Flare (Clint Bellanger et contributeurs), licence CC-BY-SA 3.0, rendus de face pour ce jeu avec la lumière et la palette de sa charte graphique. Ces images restent sous la même licence.</p><p><b>Décors</b> : murs, sols et plafonds modélisés et rendus pour ce jeu, avec la même lumière et la même palette de 256 couleurs que les personnages.</p>")

# 3e. éléments de mur et meubles : les images rendues remplacent les dessins du moteur
def pre(sig, body):
    global s
    s = rep1(s, sig, sig + body)
OI = lambda k: "if(IMGEL['%s']){g.drawImage(IMGEL['%s'],0,0);return;}" % (k, k)
OI2 = lambda cond, a, b: "{const _o=IMGEL[%s?'%s':'%s'];if(_o){g.drawImage(_o,0,0);return;}}" % (cond, a, b)
pre("function pDoor(g,lock){", OI2('lock', 'o_lock', 'o_door'))
pre("function pGate(g){", OI('o_gate'))
pre("function pLever(g,down){", OI2('down', 'o_lever1', 'o_lever0'))
pre("function pTorch(g,f){g.fillStyle=rg(g,64,44,46,'rgba(255,170,60,.38)','rgba(255,150,40,0)');g.fillRect(0,0,TS,TS);", OI2('f', 'o_torch1', 'o_torch0'))
pre("function pNiche(g,full){", OI2('full', 'o_niche0', 'o_niche1'))
pre("function pBtn(g,down){", OI2('down', 'o_btn1', 'o_btn0'))
pre("function pShop(g,inn){", OI2('inn', 'o_inn', 'o_shop'))
pre("function pSign(g){", OI('o_sign'))
pre("function pLeaf(g,lock){", OI2('lock', 'o_leafL', 'o_leaf'))
pre("function pGrille(g){", OI('o_grille'))
pre("function pFlight(g,up,carpet){", "{const _o=IMGEL['o_flight'+(up?'U':'D')+(carpet?'c':'')];if(_o){g.drawImage(_o,0,0);return;}}")
pre("function pStairs(g,up){", OI2('up', 'o_flightU', 'o_flightD'))
pre("function pDeco(g,th){", "{const _k=th==='stone'?'o_deco_stone':th==='abbey'?'o_deco_abbey':'o_deco_lamp';if(IMGEL[_k]){if(_k==='o_deco_lamp'){g.fillStyle=rg(g,64,58,44,'rgba(255,190,90,.42)','rgba(255,170,60,0)');g.fillRect(0,0,TS,TS);}g.drawImage(IMGEL[_k],0,0);return;}}")
pre("function pFrail(g){", OI('o_frail'))
pre("function pCrack(g){", OI('o_crack'))
pre("function pSecret(g){", OI('o_secret'))
# murs mobiles (H) : leur propre texture, sans torche ni décor accroché
s = rep1(s, "crack:w(pCrack),secret:w(pSecret),", "crack:w(pCrack),secret:w(pSecret),hidw:w(g=>{if(IMGEL.o_hid)g.drawImage(IMGEL.o_hid,0,0);}),")
s = rep1(s, "if(c==='S')return t.secret;if(c==='<')return t.stairU;", "if(c==='S')return t.secret;if(c==='H'&&t.hidw)return t.hidw;if(c==='<')return t.stairU;", s.count("if(c==='S')return t.secret;if(c==='<')return t.stairU;"))
s = rep1(s, "function addSpr(n,c){SPR[n]={i:vars(c)};}", "function addSpr(n,c,raw){SPR[n]={i:vars(c,raw)};}")
s = rep1(s, "function vars(c){c=outlined(vga(c,10));", "function vars(c,raw){c=raw?c:outlined(vga(c,10));")
s = rep1(s, "function buildProps(){const P=(n,fn)=>addSpr('p_'+n,paint(96,g=>{g.fillStyle='rgba(0,0,0,.35)';el(g,48,90,26,4);fn(g);}))",
 "function buildProps(){const RI=k=>mk(96,96,g=>{g.imageSmoothingEnabled=false;g.drawImage(IMGEL[k],0,0);});for(const k of['sac','or'])if(IMGEL['p_'+k])addSpr(k,RI('p_'+k),1);"
 "const P=(n,fn)=>IMGEL['p_'+n]?addSpr('p_'+n,RI('p_'+n),1):addSpr('p_'+n,paint(96,g=>{g.fillStyle='rgba(0,0,0,.35)';el(g,48,90,26,4);fn(g);}))")
s = rep1(s, "function shopBg(kind){if(SHBG[kind])return SHBG[kind];", "function shopBg(kind){if(SHBG[kind])return SHBG[kind];if(IMGEL['h_'+kind])return SHBG[kind]=mk(400,200,g=>{g.imageSmoothingEnabled=false;g.drawImage(IMGEL['h_'+kind],0,0,400,200);});")
# 3f. lumière : ombrage par crans, brume teintée par lieu (murs, personnages, sols et plafonds)
s = rep1(s, "lt=d=>Math.max(.045,1-d/LR);", "lt=d=>Math.max(.045,Math.round((1-d/LR)*16)/16);")
s = rep1(s, "FOGC=LV.sky===1?'46,60,78':LV.sky===2?'62,70,66':LV.sky===3?'6,8,20':'5,3,2';", "FOGC=LV.sky===1?'46,60,78':LV.sky===2?'62,70,66':LV.sky===3?'6,8,20':({sewer:'8,18,10',crypt:'8,10,24',mine:'20,10,4',abbey:'14,9,5',palace:'12,11,11',panel:'14,8,3',stone:'9,8,10'})[LV.theme]||'5,3,2';FOGA=FOGC.split(',').map(Number);")
s = rep1(s, "let FOGC='5,3,2';", "let FOGC='5,3,2',FOGA=[5,3,2];")
s = rep1(s, "const row=y*VW,crow=(VH-1-y)*VW;", "const row=y*VW,crow=(VH-1-y)*VW,f0=FOGA[0]*(256-li)>>8,f1=FOGA[1]*(256-li)>>8,f2=FOGA[2]*(256-li)>>8,e0=FOGA[0]*(256-li2)>>8,e1=FOGA[1]*(256-li2)>>8,e2=FOGA[2]*(256-li2)>>8;")
s = rep1(s, "fb[row+x]=0xff000000|((c&255)*li>>8)|(((c>>8&255)*li>>8)<<8)|(((c>>16&255)*li>>8)<<16);c=ct[i];", "fb[row+x]=0xff000000|(((c&255)*li>>8)+f0)|((((c>>8&255)*li>>8)+f1)<<8)|((((c>>16&255)*li>>8)+f2)<<16);c=ct[i];")
s = rep1(s, "0xff000000|((c&255)*li2>>8)|(((c>>8&255)*li2>>8)<<8)|(((c>>16&255)*li2>>8)<<16);fx_+=sx;", "0xff000000|(((c&255)*li2>>8)+e0)|((((c>>8&255)*li2>>8)+e1)<<8)|((((c>>16&255)*li2>>8)+e2)<<16);fx_+=sx;")

# 3i. images de près : à moins d'une case et demie, on prend la planche fine quand elle a l'image voulue
s = rep1(s, "if(s[8]==='S'){const M=SHEETS.meta[s[2]],k=wh*.6*(s[3]/.82)/(M.ay*(M.hk||.66));SCR.width=M.w;SCR.height=M.h;SG.drawImage(SHEET[s[2]],s[7]*M.w,0,M.w,M.h,0,0,M.w,M.h);",
 "if(s[8]==='S'){let M=SHEETS.meta[s[2]],SH=SHEET[s[2]],fr=s[7];if(tY<1.6){const N2=SHEETS.meta[s[2]+'@n'];if(N2&&SHEET[s[2]+'@n']&&N2.map[fr]!=null){M=N2;SH=SHEET[s[2]+'@n'];fr=N2.map[fr];}}const k=wh*.6*(s[3]/.82)/(M.ay*(M.hk||.66));SCR.width=M.w;SCR.height=M.h;SG.drawImage(SH,fr*M.w,0,M.w,M.h,0,0,M.w,M.h);")

# 3j. interface : icônes et boiseries passées dans la palette de référence
s = rep1(s, "document.documentElement.style.setProperty('--wood',`url(${wood.toDataURL()})`);", "vga(wood,6);document.documentElement.style.setProperty('--wood',`url(${wood.toDataURL()})`);")

# 3g. animations longues (22 images : repos 4, marche 8, frappe 4, touché 2, mort 4) ; les planches à 14 images gardent l'ancien découpage
s = rep1(s, "function monFrame(m,mt,now,ts){if(m.hp<=0)", "function monFrame(m,mt,now,ts){const L=((SHEETS.meta[mt.spr||m.t]||{}).n||0)>=22;if(m.hp<=0)")
s = rep1(s, "return t<170?11:t<360?12:13;}", "return L?(t<110?18:t<230?19:t<370?20:21):(t<170?11:t<360?12:13);}")
s = rep1(s, "return 10;if(m.atkT!=null&&S.T>=m.atkT&&S.T-m.atkT<400)return 6+Math.min", "return L?(S.T<m.flash?16:17):10;if(m.atkT!=null&&S.T>=m.atkT&&S.T-m.atkT<400)return (L?12:6)+Math.min")
s = rep1(s, "return 2+((now/95|0)&3);return(ts/430+m.x|0)&1;}", "return L?4+((now/75|0)&7):2+((now/95|0)&3);return L?[0,1,2,3,2,1][(ts/300+m.x|0)%6]:(ts/430+m.x|0)&1;}")
# 3h. crédits : les illustrations remplacées par des vues du jeu
i_cr = s.index('const CREDITS='); j_cr = s.index('\n', i_cr); CR = json.loads(s[i_cr + len('const CREDITS='):j_cr].rstrip(';'))
KEYS = ['castle', 'throne', 'cell', 'road', 'mine', 'abbey', 'end', 'village', 'forest', 'marsh', 'crypt', 'palace', 'gate']
for n, k in enumerate(KEYS):
    if os.path.exists(WK + '/scenes/s_%s.png' % k): CR[n] = [CR[n][0], 'Décors et personnages du jeu', 'vue composée', 'https://ecolesenligne.fr/landoflord']
s = s[:i_cr] + 'const CREDITS=' + json.dumps(CR, ensure_ascii=False) + ';' + s[j_cr:]

# murs « signature » : un mur sur neuf porte le motif du lieu (ossuaire, blason, râtelier, bouche d'égout, soupirail, niche au saint, écu)
s = rep1(s, "function texFor(c,x,y,fl){", "var FLB={};var SIGT={crypt:'o_sig_crypte',palace:'o_sig_palais',panel:'o_sig_palais',mine:'o_sig_mine',sewer:'o_sig_egout',stone:'o_sig_geoles',abbey:'o_sig_abbaye',camp:'o_sig_camp'};\nfunction texFor(c,x,y,fl){", s.count('function texFor(c,x,y,fl){'))
s = rep1(s, "if(h===4)return t.deco;return h%2?t.wall:t.wall2;}", "if(h===4)return t.deco;if(h===6&&SIGT[LV.theme]&&t.sig)return t.sig;return h%2?t.wall:t.wall2;}", s.count('if(h===4)return t.deco;return h%2?t.wall:t.wall2;}'))
# 4d. objets uniques cachés dans des niches difficiles
UNIQ = {
 'u_veuve': ('epee_l', 'palais2', '14,1', "{n:\"La Veuve\",k:'main',dmg:[6,13],spd:1100,sk:'armes',p:150,m:8.5,ty:'t',d:\"Épée longue du connétable Hugues. Arme unique : elle a fait plus de veuves que la fièvre, et ne s'en excuse pas.\"}"),
 'u_tocsin': ('baton', 'abbaye', '12,13', "{n:\"Le Tocsin\",k:'main',dmg:[6,13],spd:1300,sk:'armes',p:130,m:9,ty:'c',d:\"Masse d'armes des abbés de Saint-Aubert. Arme unique : elle sonne les heures sur les casques, et les plates n'y résistent pas.\"}"),
 'u_aiguille': ('estoc', 'crypte', '1,26', "{n:\"L'Aiguille\",k:'main',dmg:[4,10],spd:800,sk:'armes',pierce:6,p:140,m:6.5,ty:'p',d:\"Estoc de duel, mince comme un reproche. Arme unique : elle trouve le défaut de toutes les mailles.\"}"),
 'u_pavois': ('ecu', 'ruines', '22,12', "{n:\"Le Pavois du Gué\",k:'appoint',prot:4,p:120,d:\"Il a tenu le Gué-aux-Corbeaux une première fois, il y a cent ans. Pièce unique : on se sent plus large derrière.\"}"),
 'u_haubert': ('mailles', 'palais3', '7,19', "{n:\"Haubert du roi Alaric\",k:'corps',prot:6,p:200,d:\"Mailles doubles, rivées pour un roi qui se méfiait de sa cour. Pièce unique : il avait raison.\"}"),
}
s = rep1(s, "for(const k in WM){ITEMS[k].m=WM[k][0];ITEMS[k].ty=WM[k][1];}", "for(const k in WM){ITEMS[k].m=WM[k][0];ITEMS[k].ty=WM[k][1];}\nObject.assign(ITEMS,{" + ','.join("%s:%s" % (k, v[3]) for k, v in UNIQ.items()) + "});")
s = rep1(s, "for(const k in F){ICONC[k]=mk(16,16,F[k]);ICON[k]=ICONC[k].toDataURL();}", "for(const k in F){ICONC[k]=vga(mk(16,16,F[k]),-1);ICON[k]=ICONC[k].toDataURL();}\n for(const[u,b]of" + json.dumps([[k, v[0]] for k, v in UNIQ.items()]) + "){ICONC[u]=mk(16,16,g=>{g.drawImage(ICONC[b],0,0);g.globalCompositeOperation='source-atop';g.fillStyle='rgba(255,196,60,.42)';g.fillRect(0,0,16,16);});ICON[u]=ICONC[u].toDataURL();}")
i_end = s.rindex('</script>')
s = s[:i_end] + "\n/* objets uniques : ils remplacent l'or de cinq niches bien cachées */\nfor(const[u,lv,k]of" + json.dumps([[k, v[1], v[2]] for k, v in UNIQ.items()]) + ")if(LEVELS[lv]&&LEVELS[lv].niche&&LEVELS[lv].niche[k])LEVELS[lv].niche[k]=[[u,0]];\n" + s[i_end:]

# ---------- 4. jeu ----------
# 4a. résistances lisibles : la première fois qu'un type de coup marche mal ou bien sur un adversaire, la chronique le dit
s = rep1(s, "hurt(m,roll2(dmgMax(might,w.ty||'c',mt.res,mt.def,h===2)),c,w.sk,h===2);return h;}",
 "{const ty=w.ty||'c',rs=(mt.res||{})[ty]||1,fk='res_'+(mt.spr||m.t)+ty,TY={t:'Le tranchant',p:'La pointe',c:'Le choc',f:'Le feu'}[ty]||'Ce coup';"
 "if((rs<=.8||rs>=1.2)&&!S.flags[fk]){S.flags[fk]=1;log(rs<1?`<i>${TY} glisse sur ${mt.n} : son armure s'en moque. Une autre arme ferait mieux.</i>`:`<i>${TY} fait merveille contre ${mt.n}. Insistez.</i>`);}}"
 "hurt(m,roll2(dmgMax(might,w.ty||'c',mt.res,mt.def,h===2)),c,w.sk,h===2);return h;}")
# 4b. bilan de fin de campagne
s = rep1(s, "const JOURNAL=()=>{", "const BILAN=()=>{let k=0,lv=0;for(const id in S.L){lv++;for(const m of S.L[id].mons||[])if(m.hp<=0)k++;}const mn=Math.round((S.T||0)/60000),h=Math.floor(mn/60);"
 "return `Bilan de campagne : ${k} adversaires mis hors de combat, ${lv} lieux traversés, ${h?h+' h ':''}${mn%60} min de marche et de bataille, ${S.gold} écus en caisse, ${S.strats.length} stratagèmes sur 7. Difficulté : ${DIFF[S.diff].n}.`;};\nconst JOURNAL=()=>{")
s = rep1(s, "[null,\"FIN. Merci d'avoir joué.", "[null,BILAN()],[null,\"FIN. Merci d'avoir joué.")
# 4c. les compagnons commentent chaque lieu, une fois, à l'arrivée
LIEUX = {
 'geoles': {'pepin': ["Je connais ces couloirs par cœur, mon général. Surtout dans l'autre sens."]},
 'egouts': {'pepin': ["Je retire ce que j'ai dit sur la soupe des geôles. Elle avait au moins une couleur."]},
 'egouts2': {'pepin': ["Si on me demande, je dirai que nous sommes sortis par la grande porte."]},
 'village': {'pepin': ["Un village. Des gens qui ne nous connaissent pas. Profitons-en pour avoir bonne réputation."]},
 'mine': {'pepin': ["On étaye avec du bois, ici. Du bois, mon général. Contre une montagne."], 'brune': ["Ces étais sont posés par des gens payés à la toise. Ne vous appuyez sur rien."]},
 'mine2': {'brune': ["Plus on descend, mieux c'est taillé. Les anciens savaient creuser. Ils ne savaient pas remonter, voilà tout."], 'pepin': ["Je préviens : ma lanterne et moi, nous avons le même courage. Il baisse avec l'huile."]},
 'abbaye': {'pepin': ["Parlez bas. Chez les moines, même l'écho fait pénitence."], 'brune': ["De la belle pierre, posée d'aplomb. Ça me repose. Ça ne durera pas."]},
 'crypte': {'odon': ["Ne dérangez pas les défunts, mes enfants. Ils ont déjà les pilleurs."], 'pepin': ["Je marche au milieu. Statistiquement, c'est là qu'on meurt en dernier."]},
 'foret': {'odon': ["De l'air, des simples, des oiseaux. Je savais bien que le Seigneur avait fait autre chose que des caves."], 'brune': ["Rien à saper ici. Je me sens inutile et observée."]},
 'ruines': {'brune': ["Celui qui a monté ce mur avait bu. Celui qui l'a abattu aussi, mais lui visait juste."], 'odon': ["Tout ce qui tient debout ici tient par habitude. Ne lui donnez pas d'idées."]},
 'marais': {'pepin': ["J'ai de l'eau dans une botte. L'autre est jalouse et s'y emploie."], 'odon': ["Les fièvres viennent de ces eaux. Respirez par le nez, et le moins possible."]},
 'faubourgs': {'pepin': ["La ville ! Des toits, des auberges, des gens qui me doivent de l'argent."], 'brune': ["Ils ont bâti contre le rempart. En cas de siège, ils seront aux premières loges."]},
 'cour': {'pepin': ["Tenez-vous droit et ayez l'air de livrer quelque chose. Au palais, personne n'arrête un homme qui porte un paquet."], 'odon': ["Tant de dorures pour si peu de lumière."]},
 'palais2': {'brune': ["Des murs de trois pieds, creux. Ce palais est une noix. Je sais ouvrir les noix."], 'pepin': ["Les tapis étouffent les pas. Les nôtres comme les leurs, je le signale."]},
 'palais3': {'odon': ["La chancellerie. C'est ici qu'on soigne les royaumes, à la saignée."], 'pepin': ["Ne touchez à rien, mon général. Tout ce qui est écrit ici a déjà fait pendre quelqu'un."]},
 'camp': {'brune': ["Leurs tentes sont alignées au cordeau. Des gens ordonnés. Ça brûle très bien, l'ordre."], 'pepin': ["Si on nous interroge, je suis muet et vous êtes mon interprète."]},
 'galeries': {'brune': ["Enfin chez moi. Marchez où je marche, et taisez-vous quand j'écoute."], 'pepin': ["Nous sommes sous l'ennemi. Je préférais quand il était devant : on le voyait venir."]},
 'bataille': {'odon': ["Je serai derrière vous avec du fil et des aiguilles. Tâchez de m'en laisser."], 'pepin': ["Mon général, pour la postérité : j'étais contre."]},
}
s = rep1(s, "fadeIn();fire('intro_'+id);}", "fadeIn();fire('intro_'+id);lieuBark(id,0);}\nconst LIEUX=" + json.dumps(LIEUX, ensure_ascii=False) + ";\n"
 "function lieuBark(id,n){const L=LIEUX[id];if(!L||S.flags['lb_'+id]||n>8)return;setTimeout(()=>{if(!S||S.lv!==id||S.flags['lb_'+id])return;if(!$('dlg').hidden||!$('modal').hidden||resting){lieuBark(id,n+1);return;}"
 "const who=['brune','odon','pepin'].filter(w=>L[w]&&S.party.some(c=>c.id===w&&c.hp>0));if(!who.length)return;S.flags['lb_'+id]=1;const w=who[rnd(0,who.length-1)];log(`<i>${NAMES[w]} : « ${L[w][rnd(0,L[w].length-1)]} »</i>`);},n?5000:9000);}")

# 4e. énigmes de lieu
sys.path.insert(0, WK + '/tools'); import puz
s = rep1(s, "function useProp(p){LS.pr=LS.pr||{};const st=LS.pr[p.id];", "function useProp(p){LS.pr=LS.pr||{};const st=LS.pr[p.id];if(p.pz!=null&&SC[p.sc]){SC[p.sc](p);return;}")
s = rep1(s, "cart:.56,keg:.44};", "cart:.56,keg:.44,vanne:.5,chandelier:.62,pupitre:.5,tambour:.4};")
s = rep1(s, "const P=(n,fn)=>IMGEL['p_'+n]?", "for(const n of['vanne','chandelier','pupitre','tambour'])if(IMGEL['p_'+n])addSpr('p_'+n,RI('p_'+n),1);const P=(n,fn)=>IMGEL['p_'+n]?")
s = rep1(s, "${S.strats.length} stratagèmes sur 7.", "${S.strats.length} stratagèmes sur 7, ${Object.values(S.L).filter(l=>l.pz&&l.pz.ok).length} énigmes de lieu résolues sur ${Object.keys(PUZ).length}.")
i_end = s.rindex('</script>'); s = s[:i_end] + puz.JS + s[i_end:]

# 4f. quêtes secondaires
import quetes
s = rep1(s, "Object.assign(ITEMS,{u_veuve:", "Object.assign(ITEMS,{" + ','.join('%s:%s' % kv for kv in quetes.ITEMS.items()) + ",u_veuve:")
s = rep1(s, 'for(const[u,b]of[["u_veuve"', "for(const[u,b]of" + json.dumps(quetes.ICONS)[:-1] + ',["u_veuve"')
s = rep1(s, "function tickMons(){", "function tickMons(){questTick();")
s = rep1(s, "l.push(`<p class=\"dim\">Difficulté : ${DIFF[S.diff].n}.</p>`);return l.join('');};", "{const q=questLines();if(q.length)l.push(`<p><b>Affaires en cours.</b> ${q.map(cap).join(' ; ')}.</p>`);}l.push(`<p class=\"dim\">Difficulté : ${DIFF[S.diff].n}.</p>`);return l.join('');};")
i_end = s.rindex('</script>'); s = s[:i_end] + quetes.JS + s[i_end:]

# 6. musique : un ancien réglage « musique coupée » resté dans le navigateur la rendait muette sans rien dire ; on la rétablit une fois
s = rep1(s, "if(PREF.lm==null)PREF.lm=PREF.mus===0?0:60;", "if(PREF.lm==null)PREF.lm=PREF.mus===0?0:60;if(!PREF.mfix){PREF.mfix=1;if(!(PREF.lm>0)){PREF.lm=60;PREF.mus=1;}try{localStorage.setItem('gd2_prefs',JSON.stringify(PREF));}catch(e){}}")
# 5. le plan façon Lands of Lore et les sorties signalées
import carte
s = carte.apply(s, rep1)
open(os.path.join(REPO, REL), 'w', encoding='utf8').write(s)
sw = os.path.join(REPO, 'public/landoflord/sw.js'); t = open(sw).read()
t2 = re.sub(r"general-dechu-v(\d+)'", lambda m: "general-dechu-v%d'" % SWV, t, count=1); open(sw, 'w').write(t2)
print('index.html', len(s) // 1024, 'Ko ;', len(new), 'images de décor/illustration ;', len(out_img), 'planches')
