# bilan du contrôle : ressemblance lettre à lettre entre le texte et sa retranscription (insensible aux homophones courants)
import json,re,unicodedata,difflib,sys
def let(t):
    t=unicodedata.normalize('NFD',t.lower().replace('œ','oe'));t=''.join(c for c in t if unicodedata.category(c)!='Mn')
    w=re.findall(r'[a-z]+',t);o=[]
    for x in w:
        x=re.sub(r'(ent|es|s|x|e|t|d|ez|er|ee|ees)$','',x) if len(x)>3 else x
        o.append(x)
    return ''.join(o)
def sc(a,b):return round(difflib.SequenceMatcher(None,let(a),let(b),autojunk=False).ratio(),3)
if __name__=='__main__':
    R=json.load(open('ctl.json'));L={x['k']:x for x in json.load(open('lignes.json'))};th=float(sys.argv[1]) if len(sys.argv)>1 else .88
    v=sorted(((sc(L[k]['t'],r['h']),k) for k,r in R.items() if k in L));bad=[k for s,k in v if s<th]
    print('contrôlées',len(v),'| sous',th,':',len(bad),'| médiane',v[len(v)//2][0])
    for s,k in v[:int(sys.argv[2]) if len(sys.argv)>2 else 8]:print(s,L[k]['who'],'|',L[k]['t'][:95],'\n      →',R[k]['h'][:95])
    json.dump(bad,open('bad.json','w'))
