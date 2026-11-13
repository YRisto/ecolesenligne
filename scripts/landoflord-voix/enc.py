# encode gen/<clé>.npy -> mp3/<clé>.mp3 (mono 24 kHz, 40 kb/s, niveau égalisé) et écrit la table VOX (durée en dixièmes de seconde) dans data.js
import os,json,subprocess,numpy as np,sys,re
L=json.load(open('lignes.json'));os.makedirs('mp3',exist_ok=True);V={};miss=0
def prep(a):
    # coupe les silences de tête et de queue, égalise le niveau (RMS des passages voisés), limite les crêtes
    e=np.abs(a);w=np.convolve(e,np.ones(480)/480,'same');idx=np.where(w>.012)[0]
    if len(idx):a=a[max(0,idx[0]-1200):min(len(a),idx[-1]+3600)]
    v=a[np.abs(a)>.02];r=np.sqrt((v*v).mean()) if len(v) else .05
    a=a*(.11/r);p=np.abs(a).max()
    if p>.97:a=np.tanh(a/ .97*1.2)/np.tanh(1.2)*.97 if p<1.6 else a/p*.97
    return a.astype(np.float32)
for x in L:
    f='gen/%s.npy'%x['k']
    if not os.path.exists(f):miss+=1;continue
    o='mp3/%s.mp3'%x['k'];a=prep(np.load(f))
    if not os.path.exists(o) or os.path.getmtime(o)<os.path.getmtime(f):
        subprocess.run(['ffmpeg','-v','error','-y','-f','f32le','-ar','24000','-ac','1','-i','-','-c:a','libmp3lame','-b:a','40k',o],input=a.tobytes(),check=True)
    V[x['k']]=max(1,round(len(a)/2400))
print(len(V),'encodées,',miss,'manquantes, %.1f min, %.1f Mo'%(sum(V.values())/600,sum(os.path.getsize('mp3/%s.mp3'%k) for k in V)/1e6))
if '--inject' in sys.argv:
    p='/home/claude/jeu/src/data.js';t=open(p).read();n=re.subn(r'/\*VOX\*/.*?/\*FIN VOX\*/','/*VOX*/const VOX='+json.dumps(V,separators=(',',':')).replace('\\','\\\\')+';/*FIN VOX*/',t,flags=re.S)
    assert n[1]==1;open(p,'w').write(n[0]);print('table VOX injectée')
