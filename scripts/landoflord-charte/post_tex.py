# Réduit, boucle les bords (fondu croisé sur la marge) et passe un décor dans la palette. usage : post_tex.py in.png out.png
import sys, numpy as np
from PIL import Image
sys.path.insert(0, '/home/claude/work/tools'); import charte
PX, MG = 128, 16
src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGB'); wall = im.height == im.width * PX // (PX + MG) or im.height < im.width
im = im.resize((PX + MG, PX if wall else PX + MG), Image.BOX)
a = np.asarray(im).astype(np.float64)
def fold(a, axis):
    # la marge (MG premiers pixels) recouvre la fin du carreau : fondu de l'une vers l'autre
    a = np.moveaxis(a, axis, 0); m, body = a[:MG], a[MG:].copy()
    t = (np.arange(MG) + .5) / MG; t = t.reshape((MG,) + (1,) * (a.ndim - 1))
    body[-MG:] = body[-MG:] * (1 - t) + m * t
    return np.moveaxis(body, 0, axis)
a = fold(a, 1)
if not wall: a = fold(a, 0)
lev = (4, 235, .9) if len(sys.argv) < 4 else tuple(float(v) for v in sys.argv[3].split(','))
q = charte.quantize(Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGB').convert('RGBA'), dither=12, levels=lev, sat=1.1)
q.save(out, optimize=True)
