import bpy,sys,os,glob
for f in sys.argv[1:]:
    try:bpy.ops.wm.open_mainfile(filepath=f,use_scripts=False)
    except Exception as e:print('ERR',f,e);continue
    sc=bpy.context.scene
    print('==',os.path.relpath(f,'/home/claude/src/flare-game/art_src/characters'),bpy.data.version,'fr',sc.frame_start,sc.frame_end)
    for o in bpy.data.objects:
        if o.type=='MESH':
            arm=[m.object.name if m.object else None for m in o.modifiers if m.type=='ARMATURE']
            print('  M',o.name,len(o.data.vertices),'par',o.parent.name if o.parent else None,o.parent_type if o.parent else '',o.parent_bone if o.parent else '','arm',arm,'mats',[m.name if m else None for m in o.data.materials],'uv',len(o.data.uv_layers),'dims',tuple(round(v,2) for v in o.dimensions))
        elif o.type=='ARMATURE':print('  A',o.name,len(o.data.bones),o.animation_data.action.name if o.animation_data and o.animation_data.action else None,tuple(o.animation_data.action.frame_range) if o.animation_data and o.animation_data.action else None)
    print('  IMG',[(i.name,os.path.basename(i.filepath)) for i in bpy.data.images if i.filepath])
