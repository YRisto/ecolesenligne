import sys,re
s=open(sys.argv[1],encoding='utf8').read()
for pat in sys.argv[3:]:
    n=0
    for m in re.finditer(pat,s):
        a=max(0,m.start()-int(sys.argv[2]));b=min(len(s),m.end()+int(sys.argv[2])*3)
        print('>>',pat,m.start(),':',s[a:b].replace('\n','⏎'));n+=1
        if n>=3:break
    if not n:print('>> none',pat)
