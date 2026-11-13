import sys, numpy as np
from PIL import Image
sys.path.insert(0, '/home/claude/work/tools'); import charte
im = Image.open(sys.argv[1]).convert('RGB').resize((400, 200), Image.BOX)
charte.quantize(im.convert('RGBA'), dither=12, levels=(3, 215, .8), sat=1.08).save(sys.argv[2], optimize=True)
