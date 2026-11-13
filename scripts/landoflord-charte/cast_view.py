import sys,json,glob,os
from PIL import Image,ImageDraw
names=sys.argv[2:] or sorted(os.path.basename(f)[:-5] for f in glob.glob('/home/claude/work/sheets/*.json'))
cells=[]
for n in names:
    try:m=json.load(open(f'/home/claude/work/sheets/{n}.json'));im=Image.open(f'/home/claude/work/sheets/{n}.png').convert('RGBA')
    except Exception as e:continue
    idx=[0,6,8] if m['n']==14 else [0,4]
    for i in idx:cells.append((n,im.crop((i*m['w'],0,(i+1)*m['w'],m['h'])),m))
CW,CH=150,215;cols=12
S=Image.new('RGBA',(cols*CW,((len(cells)+cols-1)//cols)*CH),(58,54,50,255));d=ImageDraw.Draw(S)
for i,(n,c,m) in enumerate(cells):
    x,y=(i%cols)*CW,(i//cols)*CH
    S.alpha_composite(c.crop((max(0,m['ax']-75),0,min(m['w'],m['ax']+75),m['h'])),(x+max(0,75-m['ax']),y+CH-12-m['h']) if m['h']<CH-12 else (x,y))
    d.text((x+2,y+CH-11),n,fill=(255,255,255,255))
S.convert('RGB').save(sys.argv[1])
