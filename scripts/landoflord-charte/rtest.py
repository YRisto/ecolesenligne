import bpy,sys,math,os
from mathutils import Vector
src,out=sys.argv[1],sys.argv[2];frames=[int(x) for x in sys.argv[3].split(',')];res=int(sys.argv[4]);yaw=float(sys.argv[5]) if len(sys.argv)>5 else 0
bpy.ops.wm.open_mainfile(filepath=src,use_scripts=False)
sc=bpy.context.scene
for o in list(bpy.data.objects):
    if o.type in('LIGHT','CAMERA') or o.name.startswith('ShadowPlane') or (o.type=='MESH' and any(m and m.name.startswith('Invis') for m in o.data.materials)):
        bpy.data.objects.remove(o,do_unlink=True)
for m in bpy.data.materials:
    print('MAT',m.name,[ (n.type,[ (i.name,tuple(i.default_value) if hasattr(i.default_value,'__len__') else i.default_value) for i in n.inputs if i.name in('Base Color','Roughness','Metallic')]) for n in (m.node_tree.nodes if m.node_tree else [])])
sc.render.engine='CYCLES';sc.cycles.device='CPU';sc.cycles.samples=24;sc.cycles.use_denoising=False
sc.render.film_transparent=True;sc.render.resolution_x=res;sc.render.resolution_y=int(res*1.25);sc.render.resolution_percentage=100
sc.render.image_settings.file_format='PNG';sc.render.image_settings.color_mode='RGBA';sc.view_settings.view_transform='Standard'
cam=bpy.data.cameras.new('C');co=bpy.data.objects.new('C',cam);sc.collection.objects.link(co);sc.camera=co
a=math.radians(yaw);D=5.0;co.location=(D*math.sin(a),-D*math.cos(a),1.15);co.rotation_euler=(math.radians(90),0,a);cam.lens=60;cam.sensor_fit='VERTICAL';cam.sensor_height=36
def sun(name,rot,e,col):
    l=bpy.data.lights.new(name,'SUN');l.energy=e;l.color=col;l.angle=math.radians(8);o=bpy.data.objects.new(name,l);sc.collection.objects.link(o);o.rotation_euler=[math.radians(v) for v in rot];return o
k=sun('key',(50,0,-40+yaw),3.2,(1,.9,.76));f=sun('fill',(70,0,60+yaw),.8,(.6,.7,1));r=sun('rim',(120,0,160+yaw),1.2,(1,.95,.9))
w=bpy.data.worlds.new('W');sc.world=w;w.use_nodes=True;w.node_tree.nodes['Background'].inputs[0].default_value=(.10,.09,.12,1)
for fnum in frames:
    sc.frame_set(fnum);sc.render.filepath=os.path.join(out,'f%02d.png'%fnum);bpy.ops.render.render(write_still=True)
