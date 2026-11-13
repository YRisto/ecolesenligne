import sys
from PIL import Image
out=sys.argv[1];cols=int(sys.argv[2]);fs=sys.argv[3:]
ims=[Image.open(f).convert('RGB') for f in fs]
w,h=ims[0].size
rows=(len(ims)+cols-1)//cols
S=Image.new('RGB',(cols*(w+4),rows*(h+4)),(255,0,255))
for i,im in enumerate(ims):S.paste(im.resize((w,h),Image.NEAREST),((i%cols)*(w+4),(i//cols)*(h+4)))
S.save(out)
