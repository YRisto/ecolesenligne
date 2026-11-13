# Élément de mur ou meuble : réduction, palette, ombre portée semi-transparente. usage : post_obj.py in.png out.png taille [opaque]
import sys, numpy as np
from PIL import Image
sys.path.insert(0, '/home/claude/work/tools'); import charte
src, out, N = sys.argv[1], sys.argv[2], int(sys.argv[3]); opaque = False; NS = len(sys.argv) > 4
im = np.asarray(Image.open(src).convert('RGBA')).astype(np.float64)
a = im[..., 3:4] / 255.0; lum = im[..., :3].max(-1)
shadow_full = (lum < 6) & (im[..., 3] > 4) & (not NS)                       # le capteur d'ombre rend du noir pur
body_a = np.where(shadow_full, 0, im[..., 3]); sh_a = np.where(shadow_full, im[..., 3], 0)
pm = im[..., :3] * (body_a[..., None] / 255.0)
def down(x): return np.asarray(Image.fromarray(np.clip(x, 0, 255).astype(np.uint8)).resize((N, N), Image.BOX)).astype(np.float64)
ba = down(body_a); sa = down(sh_a); rgb = down(pm); rgb = np.where(ba[..., None] > 0, rgb * 255.0 / np.maximum(ba[..., None], 1), 0)
body = ba > 127
rgba = np.concatenate([np.clip(rgb, 0, 255), np.where(body, 255, 0)[..., None]], -1).astype(np.uint8)
q = charte.quantize(Image.fromarray(rgba, 'RGBA'), dither=12, levels=(4, 235, .9), sat=1.1)
idx = np.asarray(q).copy()
if not body.all():
    idx[idx == 241] = 242
    idx[(~body) & (sa > 70)] = 241            # ombre portée : noir à demi transparent
    idx[(~body) & (sa <= 70)] = 0
flat = []
for c in charte.PAL: flat += list(c)
o = Image.fromarray(idx, 'P'); o.putpalette(flat)
if body.all() or opaque: o.save(out, optimize=True)
else: o.save(out, optimize=True, transparency=bytes([0] + [255] * 240 + [115] + [255] * 14))
