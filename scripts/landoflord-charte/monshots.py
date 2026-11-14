import sys,base64
t=open('/home/claude/work/tools/exits.py').read()
a=t.index("        r=pg.evaluate(");b=t.index("    print(' '.join(names))")
new='''        for kind in sys.argv[3].split(','):
            r=pg.evaluate("""(kind)=>{const m=LS.mons.find(m=>m.t===kind);if(!m)return 0;LS.mons.forEach(o=>{if(o!==m)o.gone=1;});m.next=S.T+1e9;m.aw=0;m.mode='guard';for(const D of [2,1]){for(let q=0;q<4;q++){let cx=m.x,cy=m.y,k=0;while(k<D&&'.dg'.includes(cell(cx+DX[q],cy+DY[q]))){cx+=DX[q];cy+=DY[q];k++;}if(k===D){S.x=cx;S.y=cy;S.d=(q+2)%4;m.d=q;anim=null;return 1;}}}return 0}""",kind)
            if not r:continue
            pg.wait_for_timeout(350)
            u=pg.evaluate("document.getElementById('view').toDataURL()");open(f'{out}/m_{kind}.png','wb').write(base64.b64decode(u.split(',')[1]));names.append(kind)
'''
t=t[:a]+new+t[b:]
t=t.replace("dist=int(sys.argv[3]) if len(sys.argv)>3 else 3","dist=3")
exec(compile(t,'monshots','exec'))
