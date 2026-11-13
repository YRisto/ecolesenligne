import bpy,sys
bpy.ops.wm.open_mainfile(filepath=sys.argv[1],use_scripts=False)
sc=bpy.context.scene
print('ver',bpy.data.version,'scene',sc.name,'frames',sc.frame_start,sc.frame_end,'res',sc.render.resolution_x,sc.render.resolution_y,'fps',sc.render.fps)
for o in bpy.data.objects:
    print(' OBJ',o.name,o.type,'loc',tuple(round(v,2) for v in o.location),'rot',tuple(round(v,2) for v in o.rotation_euler),'par',o.parent.name if o.parent else None,'hide_r',o.hide_render,'dims',tuple(round(v,2) for v in o.dimensions),'colls',[c.name for c in o.users_collection])
    if o.type=='CAMERA':print('   cam',o.data.type,o.data.ortho_scale,o.data.lens)
    if o.type=='LIGHT':print('   light',o.data.type,o.data.energy,tuple(o.data.color))
    if o.type=='MESH':print('   mesh v',len(o.data.vertices),'uv',[u.name for u in o.data.uv_layers],'mats',[m.name if m else None for m in o.data.materials],'mods',[(m.type) for m in o.modifiers],'vcol',len(o.data.color_attributes))
    if o.animation_data and o.animation_data.action:print('   action',o.animation_data.action.name,tuple(o.animation_data.action.frame_range))
for a in bpy.data.actions:print(' ACT',a.name,tuple(a.frame_range))
for m in bpy.data.materials:print(' MAT',m.name,tuple(round(c,2) for c in m.diffuse_color),m.use_nodes)
for i in bpy.data.images:print(' IMG',i.name,i.filepath,tuple(i.size))
print('markers',sorted([(m.frame,m.name) for m in sc.timeline_markers]))
