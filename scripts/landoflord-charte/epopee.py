# Musique de l'intro : composition originale pour tambours de guerre, cordes graves, cors et chœur, en ré mineur, mesure à 12/8.
# Tout est synthétisé ici (aucun échantillon extérieur). Sortie : mus/epopee.wav, boucle parfaite.
import numpy as np, scipy.signal as sg, sys
SR = 44100; rng = np.random.default_rng(1247)
BEAT = 60 / 63          # la noire pointée
E = BEAT / 3            # la croche
BAR = 4 * BEAT
NB = 28; N = int(NB * BAR * SR)
def note(n): return 440 * 2 ** ((n - 69) / 12)
D1, A1, C2, D2, E2, F2, G2, A2, Bb2, C3, D3, E3, F3, G3, A3, Bb3, C4, D4, E4, F4, G4, A4 = 26, 33, 36, 38, 40, 41, 43, 45, 46, 48, 50, 52, 53, 55, 57, 58, 60, 62, 64, 65, 67, 69
L = np.zeros(N + SR * 6); R = np.zeros(N + SR * 6)
def put(buf, x, t, g=1.0):
    i = int(t * SR); buf[i:i + len(x)] += x[:max(0, len(buf) - i)] * g
def env(n, a, d, s=0.0, r=.05):
    t = np.arange(n) / SR; e = np.minimum(1, t / max(a, 1e-4)) * (s + (1 - s) * np.exp(-np.maximum(0, t - a) / d)); k = int(r * SR)
    if k < n: e[-k:] *= np.linspace(1, 0, k)
    return e
def lp(x, f, o=2): b, a = sg.butter(o, f / (SR / 2)); return sg.lfilter(b, a, x)
def bp(x, f1, f2): b, a = sg.butter(2, [f1 / (SR / 2), f2 / (SR / 2)], 'band'); return sg.lfilter(b, a, x)
def taiko(f0=62, dur=1.5, hit=1.0):
    n = int(dur * SR); t = np.arange(n) / SR; f = f0 * (1 + 1.5 * np.exp(-t / .028)); ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t / .42) + .5 * np.sin(ph * 1.51) * np.exp(-t / .16) + .25 * np.sin(ph * 2.3) * np.exp(-t / .09)
    skin = lp(rng.standard_normal(n), 1400) * np.exp(-t / .035) * 2.2 + bp(rng.standard_normal(n), 90, 500) * np.exp(-t / .16) * 1.2
    return np.tanh((body + skin * 1.0) * 1.6 * hit) * .9
def tom(f0=130, dur=.6):
    n = int(dur * SR); t = np.arange(n) / SR; f = f0 * (1 + .8 * np.exp(-t / .02)); ph = 2 * np.pi * np.cumsum(f) / SR
    return np.tanh((np.sin(ph) * np.exp(-t / .16) + lp(rng.standard_normal(n), 2400) * np.exp(-t / .03) * .9) * 1.5) * .7
def rim(dur=.16):
    n = int(dur * SR); t = np.arange(n) / SR; return bp(rng.standard_normal(n), 900, 4200) * np.exp(-t / .022) * 1.1
def saws(f, n, voices=5, det=.006, vib=0):
    t = np.arange(n) / SR; o = np.zeros(n)
    for v in range(voices):
        ff = f * (1 + det * (v - (voices - 1) / 2) / max(1, voices - 1) * 2) * (1 + vib * np.sin(2 * np.pi * (5 + v * .3) * t + v)); ph = (np.cumsum(ff * np.ones(n)) / SR + rng.random()) % 1; o += 2 * ph - 1
    return o / voices
def strings(n_, dur, a=.04, bright=1500, g=1.0, voices=6):
    n = int(dur * SR); x = lp(saws(note(n_), n, voices, .012, .002), bright, 2) * env(n, a, dur * .9, .75, min(.12, dur * .4)); return x * g
def horn(n_, dur, g=1.0):
    n = int(dur * SR); t = np.arange(n) / SR; x = saws(note(n_), n, 3, .004, .0035); e = env(n, .14, dur * 1.2, .8, .22)
    out = np.zeros(n); blk = 2048
    y = lp(x, 520, 2) * .9 + bp(x, 500, 1100) * e * .9 + bp(x, 1100, 2100) * e * e * .35
    return y * e * g
def choir(n_, dur, g=1.0):
    n = int(dur * SR); x = saws(note(n_), n, 7, .016, .004); y = bp(x, 380, 760) + .6 * bp(x, 900, 1300) + .25 * bp(x, 2300, 2900); return y * env(n, .5, dur * 2, .9, .5) * g
drm = (np.zeros_like(L), np.zeros_like(L)); mus_ = (np.zeros_like(L), np.zeros_like(L))
def D(x, t, g=1.0, pan=0.0): put(drm[0], x, t, g * (1 - max(0, pan))); put(drm[1], x, t, g * (1 + min(0, pan)))
def M(x, t, g=1.0, pan=0.0): put(mus_[0], x, t, g * (1 - max(0, pan))); put(mus_[1], x, t, g * (1 + min(0, pan)))
TK = [taiko(58 + rng.random() * 6) for _ in range(4)]; TK2 = [taiko(82 + rng.random() * 6, 1.1, .8) for _ in range(4)]; TM = [tom(120 + i * 22) for i in range(4)]
# --- tambours : grande caisse sur 1 et 3 (croches 0 et 6), réponses, et roulements de fin de phrase
for b in range(NB):
    t0 = b * BAR; lvl = .55 if b < 2 else .8 if b < 8 else 1.0
    pat = [(0, 1.0), (6, .9)] if b < 4 else [(0, 1.0), (3, .45), (6, .95), (9, .5), (10, .4)] if b < 12 else [(0, 1.0), (2, .35), (3, .55), (6, 1.0), (8, .4), (9, .6), (10, .45), (11, .5)]
    for e_, g in pat: D(TK[(b + e_) % 4], t0 + e_ * E + rng.normal(0, .004), g * lvl, rng.uniform(-.15, .15))
    if b >= 2:
        for e_ in ([4, 5, 10, 11] if b < 12 else [1, 4, 5, 7, 10, 11]): D(TK2[(b + e_) % 4], t0 + e_ * E + rng.normal(0, .005), .42 * lvl, -.3 if e_ % 2 else .3)
    if b >= 6:
        for e_ in range(12):
            if e_ % 3 != 0: D(rim(), t0 + e_ * E + rng.normal(0, .004), .16 * lvl * (1.3 if e_ % 3 == 2 else 1), .35 if e_ % 2 else -.35)
    if b % 4 == 3 and b >= 3:     # roulement : toms en doubles croches sur le dernier temps
        for k in range(6): D(TM[min(3, k * 4 // 6)], t0 + 9 * E + k * E / 2, (.35 + k * .1) * lvl, -.4 + k * .16)
        D(TK[0], t0 + BAR - .001, 0)   # (l'accent tombe sur le 1 de la mesure suivante)
# --- harmonie : ré mineur | si bémol | fa | do   puis   ré mineur | sol mineur | la | ré mineur
CH = [(D2, [D3, F3, A3]), (Bb2 - 12, [D3, F3, Bb3]), (F2, [C3, F3, A3]), (C2, [C3, E3, G3]), (D2, [D3, F3, A3]), (G2 - 12, [D3, G3, Bb3]), (A1, [E3, A3, 61]), (D2, [D3, F3, A3])]
for b in range(4, NB):
    bass, tri = CH[(b - 4) % 8]; t0 = b * BAR; full = b >= 12
    for e_ in range(12):      # ostinato de violoncelles et contrebasses, croches détachées, accent sur chaque temps
        acc = 1.0 if e_ % 3 == 0 else .62; M(strings(bass, E * .82, .012, 900 if not full else 1300, .55 * acc, 5), t0 + e_ * E, 1, -.2); M(strings(bass + 12, E * .7, .012, 1500 if not full else 2100, .30 * acc, 4), t0 + e_ * E, 1, .2)
    if b >= 8:                # altos : nappe tenue
        for k, n_ in enumerate(tri): M(strings(n_, BAR * 1.02, .35, 1700, .16, 6), t0, 1, (-.4, 0, .4)[k])
# --- thème des cors (mesures 12 à 27), repris à l'octave avec le chœur à partir de 20
TH = [(D4, 3), (F4, 1), (E4, 2), (D4, 2), (C4, 3), (D4, 1), (A3, 4),  (D4, 3), (F4, 1), (G4, 2), (A4, 2), (G4, 3), (F4, 1), (E4, 4),
      (F4, 3), (A4, 1), (G4, 2), (F4, 2), (E4, 3), (D4, 1), (61, 4),  (D4, 3), (E4, 1), (F4, 2), (E4, 2), (D4, 8)]
t = 12 * BAR
for k, (n_, beats) in enumerate(TH):
    d = beats * BEAT; rep = t >= 20 * BAR
    M(horn(n_ - 12, d * 1.03, .50), t, 1, -.25); M(horn(n_ - 5 if n_ - 5 >= 45 else n_ - 12, d * 1.03, .22), t, 1, .3)
    if rep: M(horn(n_, d * 1.03, .34), t, 1, .15); M(choir(n_ - 12, d * 1.05, .26), t, 1, -.1); M(choir(n_, d * 1.05, .16), t, 1, .25)
    t += d
    if t >= NB * BAR: break
for b in range(16, NB):       # violons : contre-chant en croches sur les fins de phrase
    bass, tri = CH[(b - 4) % 8]
    if b % 2: 
        for e_ in range(6, 12): M(strings(tri[(e_ // 2) % 3] + 12, E * .9, .02, 2600, .12), b * BAR + e_ * E, 1, .45)
for b in (8, 12, 20):          # coups de cymbale et de grande caisse aux entrées
    n = int(3.5 * SR); tt = np.arange(n) / SR; c = bp(rng.standard_normal(n), 3000, 9000) * np.exp(-tt / .9) * np.minimum(1, tt / .01); M(c, b * BAR, .22, .2); M(c[::-1] * .5, b * BAR - 3.5, .16, -.2) if b else None
# --- réverbération (salle de pierre) et mise à niveau ; la queue est repliée sur le début pour que la boucle soit parfaite
def rev(x, dur, seed, wet):
    r = np.random.default_rng(seed); n = int(dur * SR); tt = np.arange(n) / SR; ir = lp(r.standard_normal(n), 5200) * np.exp(-tt / (dur / 5.5)); ir[:int(.012 * SR)] *= .2; ir /= np.sqrt((ir ** 2).sum())
    return x + wet * sg.fftconvolve(x, ir)[:len(x)]
out = []
for ch in (0, 1):
    y = rev(drm[ch], 2.6, 10 + ch, .55) * .85 + rev(mus_[ch], 3.2, 20 + ch, .7) * 2.3
    tail = y[N:].copy(); y = y[:N]; y[:len(tail)] += tail; out.append(y)
y = np.stack(out, 1); y = y / np.percentile(np.abs(y), 99.7) * .8; y = np.tanh(y * 1.25) / np.tanh(1.25) * .93
sub = lp(y.mean(1), 140, 2)
print('durée %.1f s, crête %.2f, efficace %.3f' % (N / SR, np.abs(y).max(), np.sqrt((y ** 2).mean())))
y = np.clip(y, -.98, .98)
import scipy.io.wavfile as wf; wf.write(sys.argv[1], SR, (y * 32767).astype(np.int16))
