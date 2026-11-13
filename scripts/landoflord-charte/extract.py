import re,base64,sys,io,json
from PIL import Image
src,out=sys.argv[1],sys.argv[2]
s=open(src,encoding='utf8').read()
rows=[]
for m in re.finditer(r'"([A-Za-z0-9_]+)":\s*"data:image/(png|gif);base64,([A-Za-z0-9+/=]+)"',s):
    k,ext,b=m.groups()
    line=s.count('\n',0,m.start())+1
    d=base64.b64decode(b)
    fn=f'{out}/L{line}_{k}.{ext}'
    open(fn,'wb').write(d)
    im=Image.open(io.BytesIO(d))
    rows.append((line,k,im.size,im.mode,len(d)))
for r in rows: print(*r)
print(len(rows))
