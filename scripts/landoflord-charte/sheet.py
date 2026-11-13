import sys,glob,os
from PIL import Image,ImageDraw
out=sys.argv[1]; cell=int(sys.argv[2]); cols=int(sys.argv[3]); files=sys.argv[4:]
rows=(len(files)+cols-1)//cols
S=Image.new('RGB',(cols*cell,rows*(cell+12)),(40,40,60))
d=ImageDraw.Draw(S)
for i,f in enumerate(files):
    im=Image.open(f).convert('RGBA')
    if im.width>im.height*3: im=im.crop((0,0,im.height*3,im.height))
    sc=min(cell/im.width,cell/im.height)
    im=im.resize((max(1,int(im.width*sc)),max(1,int(im.height*sc))),Image.NEAREST)
    x,y=(i%cols)*cell,(i//cols)*(cell+12)
    S.paste(im,(x,y),im)
    d.text((x+2,y+cell),os.path.basename(f).split('_',1)[1][:22],fill=(255,255,255))
S.save(out)
