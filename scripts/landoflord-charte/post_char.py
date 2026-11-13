# Passe les images rendues dans la charte et assemble la planche. usage : post_char.py dir out.png FW FH GROUND [crop]
import sys, glob, json, numpy as np
from PIL import Image, ImageDraw, ImageFilter
sys.path.insert(0, '/home/claude/work/tools'); import charte
d, out, FW, FH, GROUND = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), float(sys.argv[5])
LEV = (4, 215, .80); SAT = 1.12
fr = []
for f in sorted(glob.glob(d + '/f*.png')):
    im = np.asarray(Image.open(f).convert('RGBA')).astype(np.float64)
    pm = im.copy(); pm[..., :3] *= im[..., 3:4] / 255.0                      # alpha prémultiplié pour réduire sans frange
    small = np.asarray(Image.fromarray(pm.astype(np.uint8), 'RGBA').resize((FW, FH), Image.BOX)).astype(np.float64)
    a = small[..., 3:4]; rgb = np.where(a > 0, small[..., :3] * 255.0 / np.maximum(a, 1), 0)
    fr.append(np.concatenate([np.clip(rgb, 0, 255), a], -1))
# cadrage commun : on rogne les marges vides identiques sur toutes les images, sans toucher à l'ancrage au sol
al = np.max([f[..., 3] for f in fr], 0) > 127
xs = np.where(al.any(0))[0]; ys = np.where(al.any(1))[0]
gy = int(round(GROUND * FH)); cx = FW // 2
half = max(cx - xs[0], xs[-1] + 1 - cx) + 3; x0, x1 = max(0, cx - half), min(FW, cx + half)
y0 = max(0, ys[0] - 2); y1 = min(FH, max(ys[-1] + 3, gy + 8))
w, h = x1 - x0, y1 - y0
sheet = Image.new('RGBA', (w * len(fr), h), (0, 0, 0, 0))
for i, f in enumerate(fr):
    c = f[y0:y1, x0:x1]
    body = c[..., 3] > 127
    # ombre portée au sol : ellipse sombre sous les pieds, de la largeur du corps près du sol
    sh = Image.new('L', (w, h), 0); cols = np.where(body[max(0, gy - y0 - 40):].any(0))[0]
    if len(cols):
        sx0, sx1 = cols[0], cols[-1]; mx = (sx0 + sx1) / 2; rx = max(14, (sx1 - sx0) / 2 * .95); ry = max(4, rx * .2)
        ImageDraw.Draw(sh).ellipse([mx - rx, gy - y0 - ry + 1, mx + rx, gy - y0 + ry + 1], fill=255)
    sha = np.asarray(sh) > 127
    q = charte.quantize(Image.fromarray(np.concatenate([c[..., :3], np.where(body, 255, 0)[..., None]], -1).astype(np.uint8), 'RGBA'), dither=12, levels=LEV, sat=SAT).convert('RGBA')
    qa = np.asarray(q).copy()
    yy, xx = np.mgrid[0:h, 0:w]
    m = sha & ~body & (((xx + yy) & 1) == 0)          # ombre tramée en damier : le sol se devine au travers
    qa[m] = (8, 6, 10, 255)
    sheet.paste(Image.fromarray(qa, 'RGBA'), (i * w, 0))
p = charte.quantize(sheet, dither=0); p.save(out, optimize=True, transparency=0)
body_px = (1.75 / float(sys.argv[6] if len(sys.argv) > 6 else 2.6)) * FH
print(json.dumps({"w": int(w), "h": int(h), "n": len(fr), "ax": int(cx - x0), "ay": int(gy - y0), "hk": round(float(body_px / (gy - y0)), 3)}))
