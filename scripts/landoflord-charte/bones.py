import bpy,sys
for f in sys.argv[1:]:
    bpy.ops.wm.open_mainfile(filepath=f,use_scripts=False)
    for o in bpy.data.objects:
        if o.type=='ARMATURE' and len(o.data.bones)>10:
            print('ARM',f.split('/')[-2],o.name,'scale',tuple(round(v,2) for v in o.scale),'loc',tuple(round(v,2) for v in o.location))
            for b in o.data.bones:
                h=o.matrix_world@b.head_local;t=o.matrix_world@b.tail_local
                if b.name.lower() in('head','neck','chest','hand.right','hand.left','spine') or 'ead' in b.name: print('  ',b.name,'head',tuple(round(v,3) for v in h),'tail',tuple(round(v,3) for v in t),'x',tuple(round(v,2) for v in (o.matrix_world.to_3x3()@b.x_axis)),'z',tuple(round(v,2) for v in (o.matrix_world.to_3x3()@b.z_axis)))
            print('  all',[b.name for b in o.data.bones]);break
    for o in bpy.data.objects:
        if o.type=='MESH' and o.name.startswith('MaleHead') or o.name=='LongHair':
            import mathutils
            vs=[o.matrix_world@v.co for v in o.data.vertices];print('  mesh',o.name,'min',tuple(round(min(v[i] for v in vs),3) for i in range(3)),'max',tuple(round(max(v[i] for v in vs),3) for i in range(3)))
