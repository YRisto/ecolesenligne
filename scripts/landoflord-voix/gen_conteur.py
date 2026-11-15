# Reprise de la voix du conteur (chronique) : même timbre, intonations mieux posées.
# Méthode : chaque réplique est dite phrase par phrase (la voix retombe alors à chaque point au lieu de filer d'un trait),
# plusieurs prises par phrase, et l'on garde celle dont la mélodie convient au texte : chute en fin de phrase affirmative,
# montée en fin de question, débit régulier, pas d'envolée hors de propos. Les phrases sont recollées avec de vrais silences.
#   python3 gen_conteur.py                  toutes les répliques du conteur (voix « narr » de distribution.json)
#   python3 gen_conteur.py <clé> <clé>…     seulement celles-là
#   PRISES=6 python3 gen_conteur.py         nombre de prises par phrase (4 par défaut)
#   VOIX_ESSAI=jean python3 gen_conteur.py  essai sans le modèle à clonage, avec une voix du catalogue (pour vérifier la chaîne)
# Sortie : gen/<clé>.npy (remplace la prise existante ; l'ancienne est gardée en gen/<clé>_av.npy). Puis enc.py comme d'habitude.
import os, sys, json, re, glob, time, numpy as np, torch
from pocket_tts import TTSModel
SR = 24000; K = int(os.environ.get('PRISES', '4')); ESSAI = os.environ.get('VOIX_ESSAI')
L = json.load(open('lignes.json')); D = json.load(open('distribution.json')); VN = D['narr']
only = set(sys.argv[1:]); todo = [x for x in L if x['v'] == VN and (not only or x['k'] in only)]
def norm(t):
    t = t.replace('«', '').replace('»', '').replace('“', '').replace('”', '').replace('—', ',').replace('–', ',').replace('…', '...')
    t = t.replace('1247', 'mille deux cent quarante-sept').replace('1239', 'mille deux cent trente-neuf'); return re.sub(r'\s+', ' ', t).strip()
def phrases(t):
    out = []
    for p in re.split(r'(?<=[.!?…])\s+(?=[A-ZÀÂÉÈÊÎÔÛÇ«"])', t.strip()):
        if len(p) > 150 and re.search(r' [;:] ', p): out += [q.strip() for q in re.split(r'(?<= [;:]) ', p) if q.strip()]
        elif p.strip(): out.append(p.strip())
    return out
def f0(a):   # hauteur de la voix, par autocorrélation, une mesure toutes les 10 ms (0 = non voisé)
    w = int(.04 * SR); h = int(.01 * SR); lo = SR // 350; hi = SR // 65; out = []
    for i in range(0, len(a) - w, h):
        x = a[i:i + w] * np.hanning(w); e = float((x * x).sum())
        if e < 1e-3: out.append(0); continue
        r = np.correlate(x, x, 'full')[w - 1:]; r = r / (r[0] + 1e-9); j = lo + int(np.argmax(r[lo:hi])); out.append(SR / j if r[j] > .45 else 0)
    return np.array(out)
def note(texte, a):
    f = f0(a); v = f[f > 0]; d = len(a) / SR
    if len(v) < 12: return -9, {}
    st = 12 * np.log2(v / np.median(v)); n = max(4, len(v) // 5); fin = float(np.median(st[-n:])); s = 0.0
    if texte.rstrip().endswith('?'): s += max(-1, min(1, fin / 2.0))            # question : la voix monte
    elif texte.rstrip().endswith('!'): s += 0
    else: s += max(-1, min(1, -fin / 2.5))                                      # affirmation : la voix retombe (2,5 demi-tons ou plus)
    ec = float(np.std(st))
    if ec > 4.2: s -= (ec - 4.2) / 1.5                                         # envolées hors de propos
    if ec < 1.3: s -= .6                                                       # récitation plate
    sauts = float(np.mean(np.abs(np.diff(st)) > 5)); s -= sauts * 8             # sauts de hauteur brusques
    cps = len(texte) / max(.2, d)
    if cps > 21: s -= (cps - 21) / 2
    if cps < 10: s -= (10 - cps) / 2
    return s, dict(fin=round(fin, 1), ecart=round(ec, 1), cps=round(cps, 1))
def colle(morceaux, textes):
    out = []
    for a, t in zip(morceaux, textes):
        e = np.abs(a); w = np.convolve(e, np.ones(480) / 480, 'same'); idx = np.where(w > .012)[0]
        if len(idx): a = a[max(0, idx[0] - 600):min(len(a), idx[-1] + 1800)]
        a = a.copy(); k = 360; a[:k] *= np.linspace(0, 1, k); a[-k:] *= np.linspace(1, 0, k); out.append(a)
        fin = t.rstrip()[-1:]; out.append(np.zeros(int(SR * (.52 if t.rstrip().endswith('...') else .40 if fin in '.!?' else .22)), np.float32))
    return np.concatenate(out[:-1]).astype(np.float32)
m = TTSModel.load_model(language='french_24l')
if ESSAI: st = m.get_state_for_audio_prompt(ESSAI)
else:
    fs = json.load(open('/home/claude/voix/cast/voix.json')); ref = glob.glob(os.path.expanduser('~/.cache/huggingface/hub/models--kyutai--tts-voices/snapshots/*/' + fs[VN - 1]))[0]; st = m.get_state_for_audio_prompt(ref)
os.makedirs('gen', exist_ok=True); t0 = time.time(); bilan = {}
for n, x in enumerate(todo):
    ph = phrases(x['t']); mor = []; inf = []
    for p in ph:
        best = None
        for s in range(K):
            torch.manual_seed(7919 * s + int(x['k'], 16) % 9973 + len(p)); a = m.generate_audio(st, norm(p)).numpy().astype(np.float32); sc, i = note(p, a)
            if best is None or sc > best[0]: best = (sc, a, i, s)
        mor.append(best[1]); inf.append(dict(p=p[:40], note=round(best[0], 2), prise=best[3], **best[2]))
    o = 'gen/%s.npy' % x['k']
    if os.path.exists(o) and not os.path.exists(o[:-4] + '_av.npy') and not ESSAI: os.replace(o, o[:-4] + '_av.npy')
    np.save(o if not ESSAI else 'gen/essai_%s.npy' % x['k'], colle(mor, ph)); bilan[x['k']] = inf
    print(n + 1, '/', len(todo), x['k'], [(i['note'], i.get('fin')) for i in inf], '%.0f s' % (time.time() - t0), flush=True)
json.dump(bilan, open('conteur.json', 'w'), ensure_ascii=False, indent=1); print('FINI', len(todo), 'répliques')
