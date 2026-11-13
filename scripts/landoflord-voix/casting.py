# planche de casting : les 35 voix françaises CML-TTS clonées par Pocket TTS (french_24l), une phrase chacune
import os,time,numpy as np,json
from huggingface_hub import HfApi,hf_hub_download
from pocket_tts import TTSModel
N=['un','deux','trois','quatre','cinq','six','sept','huit','neuf','dix','onze','douze','treize','quatorze','quinze','seize','dix-sept','dix-huit','dix-neuf','vingt',
   'vingt et un','vingt-deux','vingt-trois','vingt-quatre','vingt-cinq','vingt-six','vingt-sept','vingt-huit','vingt-neuf','trente','trente et un','trente-deux','trente-trois','trente-quatre','trente-cinq']
PH="Général ? On vous disait pendu, ou traître. Ou les deux, dans l'ordre qui vous arrange."
os.makedirs('cast',exist_ok=True)
fs=sorted(f for f in HfApi().list_repo_files('kyutai/tts-voices') if f.startswith('cml-tts/fr/') and f.endswith('_enhanced.wav'))
json.dump(fs,open('cast/voix.json','w'))
m=TTSModel.load_model(language='french_24l');sr=m.sample_rate
for i,f in enumerate(fs):
    o='cast/%02d.npy'%(i+1)
    if os.path.exists(o):continue
    t=time.time();p=hf_hub_download('kyutai/tts-voices',f)
    st=m.get_state_for_audio_prompt(p)
    a=m.generate_audio(st,'Voix numéro %s. %s'%(N[i],PH)).numpy().astype(np.float32)
    np.save(o,a);print(i+1,os.path.basename(f),'%.1fs audio, %.0fs calcul'%(len(a)/sr,time.time()-t),flush=True)
print('FINI',flush=True)
