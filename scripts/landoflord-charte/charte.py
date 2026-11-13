# Charte graphique du Général déchu : palette de référence et conversion commune.
# 16 rampes de 16 tons = 256 couleurs, arrondies au pas VGA (6 bits par canal) pour le grain d'époque.
import colorsys, numpy as np
from PIL import Image

# (nom, teinte, saturation, ton le plus sombre, ton le plus clair)
RAMPS = [
 ('pierre',   34, .13, .035, .86), ('acier',   218, .14, .04, .93), ('bois',     24, .58, .03, .62), ('enduit',   37, .46, .06, .88),
 ('chair',    20, .50, .07, .90), ('sang',      2, .80, .05, .78), ('lie',     325, .48, .04, .70), ('or',       43, .85, .07, .93),
 ('mousse',   72, .50, .04, .72), ('feuille', 112, .52, .035, .68), ('vase',   165, .42, .035, .66), ('ardoise', 214, .42, .035, .70),
 ('azur',    222, .62, .06, .86), ('braise',   18, .92, .06, .95), ('os',       46, .26, .10, .97), ('nuit',    262, .30, .012, .58),
]
def build_palette():
    pal = []
    for name, h, s, v0, v1 in RAMPS:
        for i in range(16):
            t = i / 15.0
            v = v0 + (v1 - v0) * (t ** 1.25)
            # ombres tirées vers le violet froid, lumières vers le jaune chaud, saturation qui retombe aux extrêmes
            hh = h + (1 - t) * (-14 if 20 < h < 200 else 14) * (1 - t) + t * t * (10 if h > 60 and h < 250 else -4 if h > 250 else 6)
            if name == 'nuit': hh = h + t * 20
            ss = s * (0.72 + 0.5 * np.sin(np.pi * (0.15 + 0.7 * t))) * (1 - .45 * t ** 3)
            r, g, b = colorsys.hsv_to_rgb((hh % 360) / 360.0, max(0, min(1, ss)), v)
            pal.append(tuple(int(round(c * 63)) * 4 + (int(round(c * 63)) >> 4) for c in (r, g, b)))  # 6 bits -> 8 bits
    pal[0] = (0, 0, 0)
    return pal
PAL = build_palette()

def _lab(rgb):
    rgb = np.asarray(rgb, dtype=np.float64) / 255.0
    lin = np.where(rgb > .04045, ((rgb + .055) / 1.055) ** 2.4, rgb / 12.92)
    M = np.array([[.4124, .3576, .1805], [.2126, .7152, .0722], [.0193, .1192, .9505]])
    xyz = lin @ M.T / np.array([.95047, 1.0, 1.08883])
    f = np.where(xyz > .008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)
_LUT = None
def lut():
    global _LUT
    if _LUT is None:
        g = np.arange(64) * 4 + 2
        grid = np.stack(np.meshgrid(g, g, g, indexing='ij'), -1).reshape(-1, 3)
        gl, pl = _lab(grid), _lab(np.array(PAL))
        w = np.array([1.0, 1.35, 1.35])       # la teinte compte un peu plus que la clarté : pas de dérive de couleur
        best = np.zeros(len(grid), np.int32); bd = np.full(len(grid), 1e18)
        for i in range(256):
            d = (((gl - pl[i]) * w) ** 2).sum(1); m = d < bd; best[m] = i; bd[m] = d[m]
        _LUT = best.reshape(64, 64, 64).astype(np.uint8)
    return _LUT
BAYER = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16.0 - .47

def quantize(img, dither=14, alpha_cut=128, levels=None, sat=1.0, keep_soft_alpha=False):
    """Image RGBA -> image palettisée (P) dans la palette de référence, tramage ordonné léger."""
    im = np.asarray(img.convert('RGBA')).astype(np.float64)
    rgb, a = im[..., :3], im[..., 3]
    if levels:
        lo, hi, gamma = levels
        rgb = np.clip((rgb - lo) / (hi - lo), 0, 1) ** gamma * 255
    if sat != 1.0:
        l = rgb @ np.array([.299, .587, .114]); rgb = np.clip(l[..., None] + (rgb - l[..., None]) * sat, 0, 255)
    h, w = a.shape
    t = np.tile(BAYER, (h // 4 + 1, w // 4 + 1))[:h, :w][..., None] * dither
    q = np.clip(rgb + t, 0, 255).astype(np.int32) >> 2
    idx = lut()[q[..., 0], q[..., 1], q[..., 2]]
    out = Image.fromarray(idx, 'P'); flat = []
    for c in PAL: flat += list(c)
    out.putpalette(flat)
    if a.min() < 255:
        # la couleur 0 (noir) sert de transparent ; le noir opaque passe sur l'indice 240 (nuit le plus sombre)
        idx = idx.copy(); idx[idx == 0] = 240; idx[a < alpha_cut] = 0
        out = Image.fromarray(idx, 'P'); out.putpalette(flat); out.info['transparency'] = 0
    return out

if __name__ == '__main__':
    import sys
    sw = Image.new('RGB', (16 * 24, 16 * 24))
    for i, c in enumerate(PAL):
        sw.paste(c, ((i % 16) * 24, (i // 16) * 24, (i % 16) * 24 + 24, (i // 16) * 24 + 24))
    sw.save(sys.argv[1] if len(sys.argv) > 1 else 'palette.png')
    print(len(set(PAL)), 'couleurs distinctes')
