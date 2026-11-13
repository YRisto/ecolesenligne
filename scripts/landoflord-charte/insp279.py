import bpy,sys
print('FILE',bpy.data.filepath)
sc=bpy.context.scene
print('scene',sc.name,'frames',sc.frame_start,sc.frame_end,'res',sc.render.resolution_x,sc.render.resolution_y,sc.render.resolution_percentage,'engine',sc.render.engine,'layers',[i for i,l in enumerate(sc.layers) if l])
for o in bpy.data.objects:
    print(' OBJ',o.name,o.type,'layers',[i for i,l in enumerate(o.layers) if l],'loc',tuple(round(v,2) for v in o.location),'rot',tuple(round(v,2) for v in o.rotation_euler),'parent',o.parent.name if o.parent else None,'hide_r',o.hide_render, 'dims',tuple(round(v,2) for v in o.dimensions))
    if o.type=='CAMERA':print('   cam',o.data.type,o.data.ortho_scale,o.data.lens)
    if o.type=='LAMP':print('   lamp',o.data.type,o.data.energy,tuple(o.data.color))
    if o.animation_data and o.animation_data.action:print('   action',o.animation_data.action.name,tuple(o.animation_data.action.frame_range))
for a in bpy.data.actions:print(' ACT',a.name,tuple(a.frame_range))
for m in bpy.data.materials:print(' MAT',m.name,m.use_shadeless,[ (t.texture.name,t.texture.type, getattr(getattr(t.texture,'image',None),'filepath',None)) for t in m.texture_slots if t])
print('markers',[(m.name,m.frame) for m in sc.timeline_markers])
