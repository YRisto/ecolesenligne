# enregistre toutes les répliques (Pocket TTS french_24l, voix clonées de la distribution) -> gen/<clé>.npy ; reprenable
import os,sys,json,time,glob,re,numpy as np,torch
os.environ['HF_HUB_OFFLINE']='1'
from pocket_tts import TTSModel
L=json.load(open('lignes.json'));only=set(sys.argv[2:]) if len(sys.argv)>2 else None;seed=int(sys.argv[1]) if len(sys.argv)>1 else 0
fs=json.load(open('/home/claude/voix/cast/voix.json'))
ref=lambda n:glob.glob(os.path.expanduser('~/.cache/huggingface/hub/models--kyutai--tts-voices/snapshots/*/'+fs[n-1]))[0]
def norm(t):
    t=t.replace('«','').replace('»','').replace('“','').replace('”','').replace('—',',').replace('–',',').replace('…','...')
    t=t.replace('1247','mille deux cent quarante-sept').replace('1239','mille deux cent trente-neuf');t=re.sub(r'\s+',' ',t).strip()
    if len(t)<28:t=re.sub(r'^\.\.\.\s*','',t);t=re.sub(r'\.\.\.$','.',t)
    return t
m=TTSModel.load_model(language='french_24l');st={};todo=[x for x in sorted(L,key=lambda x:(x['v'],x['k'])) if (only is None and not os.path.exists('gen/%s.npy'%x['k'])) or (only and x['k'] in only)]
print(len(todo),'à faire',flush=True);t0=time.time();dur=0
for i,x in enumerate(todo):
    if x['v'] not in st:st={x['v']:m.get_state_for_audio_prompt(ref(x['v']))}
    torch.manual_seed(seed*1000+int(x['k'],16)%997)
    a=m.generate_audio(st[x['v']],norm(x['t'])).numpy().astype(np.float32);np.save('gen/%s%s.npy'%(x['k'],'' if not only else '_r%d'%seed),a);dur+=len(a)/24000
    if i%10==9:print(i+1,'/',len(todo),'%.0f s de son, %.0f s de calcul'%(dur,time.time()-t0),flush=True)
print('FINI %.0f s de son en %.0f s'%(dur,time.time()-t0),flush=True)
