# Rendu d'un personnage Flare (CC-BY-SA 3.0) avec la caméra et la lumière de la charte.
# usage : python render_char.py spec.json outdir
import bpy, bmesh, sys, math, os, json
from mathutils import Vector, Matrix, Euler

ART = '/home/claude/src/flare-game/art_src/characters/'
spec = json.load(open(sys.argv[1])); out = sys.argv[2]
os.makedirs(out, exist_ok=True)
SS = spec.get('ss', 2)                      # suréchantillonnage
FW, FH = spec.get('fw', 208), spec.get('fh', 192)
SPAN = spec.get('span', 2.6)                # hauteur de mur vue par le cadre (m)
GROUND = spec.get('ground', 0.86)           # position du sol dans le cadre (0 = haut)

bpy.ops.wm.open_mainfile(filepath=ART + spec['base'], use_scripts=False)
sc = bpy.context.scene

def is_invis(o):
    return o.type == 'MESH' and len(o.data.materials) > 0 and all((m is None) or m.name.startswith('Invis') for m in o.data.materials)

arm = None
for o in bpy.data.objects:
    if o.type == 'ARMATURE' and o.animation_data and o.animation_data.action and len(o.data.bones) > 10:
        users = [m for m in bpy.data.objects if m.type == 'MESH' and not is_invis(m) and any(md.type == 'ARMATURE' and md.object == o for md in m.modifiers)]
        if users or arm is None:
            arm = o
            if users: break
if arm is None:
    arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
if spec.get('action_from'):
    with bpy.data.libraries.load(ART + spec['action_from'][0], link=False) as (src, dst):
        dst.actions = [spec['action_from'][1]]
    if not arm.animation_data: arm.animation_data_create()
    arm.animation_data.action = dst.actions[0]

for o in list(bpy.data.objects):
    if o.type in ('LIGHT', 'CAMERA') or o.name.startswith('ShadowPlane') or is_invis(o) or o.name in spec.get('hide', []):
        bpy.data.objects.remove(o, do_unlink=True)

# pièces ajoutées (armes, casques, têtes) : rattachées à l'armature de base
for path, name in spec.get('add', []):
    with bpy.data.libraries.load(ART + path, link=False) as (src, dst):
        dst.objects = [n for n in src.objects if n == name]
    for ob in dst.objects:
        if ob is None: continue
        sc.collection.objects.link(ob)
        if ob.parent and ob.parent.type == 'ARMATURE':
            pb, pt, inv = ob.parent_bone, ob.parent_type, ob.matrix_parent_inverse.copy()
            ob.parent = arm; ob.parent_type = pt; ob.parent_bone = pb; ob.matrix_parent_inverse = inv
        elif ob.parent and ob.parent.type != 'ARMATURE':
            ob.parent = None
        for md in ob.modifiers:
            if md.type == 'ARMATURE': md.object = arm
        ob['added'] = 1
        k = spec.get('scale_obj', {}).get(name)
        if k: ob.scale = [v * k for v in ob.scale]
for ob in bpy.data.objects:
    if ob.type == 'MESH':
        ob.hide_render = False; ob.hide_viewport = False
        if ob.name not in sc.collection.all_objects: sc.collection.objects.link(ob)
def _unhide(lc):
    lc.exclude = False; lc.hide_viewport = False; lc.collection.hide_render = False
    for c in lc.children: _unhide(c)
_unhide(bpy.context.view_layer.layer_collection)
# masque de sommets : ne garder d'un maillage que certains matériaux (ex. la tête seule)
for oname, keep in spec.get('keep_mats', {}).items():
    ob = bpy.data.objects.get(oname)
    if not ob: continue
    for i, m in enumerate(ob.data.materials):
        if m and not any(m.name.split('.')[0] == k for k in keep):
            ob.data.materials[i] = bpy.data.materials.get('Invis') or bpy.data.materials.new('Invis')

# ---------- matériaux de la charte ----------
CH = {  # nom : (couleur linéaire, métal, rugosité)
 'skin':   ((.60, .36, .23), 0, .55), 'skin_pale': ((.72, .47, .34), 0, .55), 'skin_tan': ((.46, .26, .15), 0, .55), 'skin_dark': ((.22, .11, .06), 0, .55),
 'steel':  ((.62, .63, .66), 1, .32), 'steel_dull': ((.34, .35, .38), 1, .5), 'iron': ((.16, .16, .18), 1, .55), 'chain': ((.33, .34, .37), 1, .62),
 'gold':   ((.80, .52, .14), 1, .35), 'brass': ((.55, .38, .13), 1, .45),
 'leather': ((.16, .085, .04), 0, .6), 'leather_light': ((.33, .19, .09), 0, .65), 'leather_black': ((.035, .03, .028), 0, .5),
 'wood':   ((.20, .11, .05), 0, .7), 'wood_dark': ((.09, .05, .025), 0, .7),
 'hair_dark': ((.03, .022, .018), 0, .5), 'hair_brown': ((.11, .055, .025), 0, .5), 'hair_blond': ((.50, .34, .12), 0, .5), 'hair_grey': ((.36, .35, .33), 0, .5), 'hair_red': ((.30, .08, .02), 0, .5), 'hair_white': ((.70, .68, .64), 0, .5),
 'white':  ((.62, .58, .50), 0, .8), 'cream': ((.48, .40, .27), 0, .8), 'tan': ((.30, .21, .11), 0, .85), 'brown': ((.14, .08, .04), 0, .85), 'black': ((.03, .03, .035), 0, .8), 'grey': ((.16, .16, .16), 0, .85),
 'red':    ((.38, .035, .03), 0, .8), 'wine': ((.20, .025, .06), 0, .8), 'purple': ((.16, .05, .22), 0, .8), 'blue': ((.05, .10, .30), 0, .8), 'slate': ((.11, .15, .22), 0, .8), 'teal': ((.04, .17, .17), 0, .8),
 'green':  ((.07, .16, .05), 0, .85), 'olive': ((.16, .17, .05), 0, .85), 'ochre': ((.46, .28, .06), 0, .8), 'rust': ((.34, .12, .03), 0, .8), 'rags': ((.20, .16, .11), 0, .9), 'string': ((.5, .45, .35), 0, .8),
}
DEFAULT = [  # préfixe du matériau d'origine -> matière de la charte
 ('SkinDark', 'skin_dark'), ('Skin', 'skin'), ('testa', 'skin'), ('SteelDull', 'steel_dull'), ('SteelRough', 'steel_dull'), ('RoughSteel', 'steel_dull'), ('Steel', 'steel'), ('Blade', 'steel'), ('Silver', 'steel'), ('Shiny', 'steel'),
 ('BlackenedIron', 'iron'), ('DarkSteel', 'iron'), ('Iron', 'iron'), ('Dull', 'wood'), ('Chain', 'chain'), ('Metal', 'brass'), ('GreenGold', 'brass'), ('Guard', 'brass'), ('Pommel', 'brass'), ('BucklerTex', 'steel_dull'),
 ('LightLeather', 'leather_light'), ('LeatherDistressed', 'leather'), ('Leather', 'leather'), ('Grip', 'leather'), ('ClothWrap', 'leather_light'),
 ('WoodDark', 'wood_dark'), ('Wood', 'wood'), ('DarkHair', 'hair_dark'), ('HairHighlights', 'hair_brown'), ('Hair', 'hair_dark'),
 ('WhiteCloth', 'white'), ('TanCloth', 'tan'), ('BlueCloth', 'blue'), ('ClothBlack', 'black'), ('Black', 'black'), ('VestCloth', 'brown'), ('PantsCloth', 'tan'), ('Rags', 'rags'),
 ('Cloth_alt1', 'blue'), ('Cloth_alt2', 'red'), ('Cloth', 'wine'), ('Trim', 'ochre'), ('Page', 'cream'), ('Cover', 'leather'), ('BowString', 'string'), ('Crystal', 'steel'), ('BlueCrystal', 'steel'), ('Parchment', 'cream'),
 ('Fur', 'brown'), ('Material', 'skin'), ('suite', 'brown'), ('ShadowStealth', 'black'),
]
OVR = spec.get('colors', {})
_cache = {}
def charter_mat(key):
    if key in _cache: return _cache[key]
    col, metal, rough = CH[key] if isinstance(key, str) else key
    m = bpy.data.materials.new('CH_' + str(key)); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    o = nt.nodes.new('ShaderNodeOutputMaterial'); b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    b.inputs['Base Color'].default_value = (*col, 1); b.inputs['Metallic'].default_value = metal; b.inputs['Roughness'].default_value = rough
    # grain de matière : léger bruit sur la couleur et le relief
    n = nt.nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = 90 if metal else 40; n.inputs['Detail'].default_value = 3
    mix = nt.nodes.new('ShaderNodeMixRGB'); mix.blend_type = 'MULTIPLY'; mix.inputs['Fac'].default_value = .55 if key == 'chain' else .3
    mix.inputs['Color1'].default_value = (*col, 1)
    ramp = nt.nodes.new('ShaderNodeValToRGB'); ramp.color_ramp.elements[0].position = .3; ramp.color_ramp.elements[0].color = (.35, .35, .35, 1); ramp.color_ramp.elements[1].position = .7; ramp.color_ramp.elements[1].color = (1.25, 1.25, 1.25, 1)
    nt.links.new(n.outputs['Fac'], ramp.inputs['Fac']); nt.links.new(ramp.outputs['Color'], mix.inputs['Color2']); nt.links.new(mix.outputs['Color'], b.inputs['Base Color'])
    bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = .5 if key == 'chain' else .12
    nt.links.new(n.outputs['Fac'], bump.inputs['Height']); nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    nt.links.new(b.outputs['BSDF'], o.inputs['Surface'])
    _cache[key] = m; return m
def pick(name, oname):
    for k in (oname + ':' + name, oname + ':' + name.split('.')[0], name, name.split('.')[0]):
        if k in OVR: return OVR[k]
    for pre, key in DEFAULT:
        if name.startswith(pre): return key
    return 'grey'
invis = bpy.data.materials.new('INV'); invis.use_nodes = True; nt = invis.node_tree; nt.nodes.clear()
io = nt.nodes.new('ShaderNodeOutputMaterial'); tr = nt.nodes.new('ShaderNodeBsdfTransparent'); nt.links.new(tr.outputs[0], io.inputs[0])
used = {}
for ob in bpy.data.objects:
    if ob.type != 'MESH': continue
    for i, m in enumerate(ob.data.materials):
        if m is None: ob.data.materials[i] = charter_mat('skin'); continue
        if m.name.startswith('Invis') or m.name == 'INV': ob.data.materials[i] = invis; continue
        key = pick(m.name, ob.name)
        if key == 'invis': ob.data.materials[i] = invis; continue
        used.setdefault(ob.name, []).append(m.name + '>' + str(key))
        ob.data.materials[i] = charter_mat(key if isinstance(key, str) else (tuple(key[0]), key[1], key[2]))
print('MATS', json.dumps(used))


# ---------- visage : yeux, sourcils, nez, bouche, barbe, posés sur la tête au repos puis attachés à l'os ----------
FACE = spec.get('face', {})
if FACE is not None and arm.data.bones.get('Head') and not spec.get('noface'):
    arm.data.pose_position = 'REST'; bpy.context.view_layer.update()
    hb = arm.data.bones['Head']; fem = 'Female' in arm.name
    zc = (1.735 if not fem else 1.665); yf = (-.112 if not fem else -.098); k = 1.0 if not fem else .92
    par = arm.matrix_world @ hb.matrix_local @ Matrix.Translation((0, hb.length, 0))
    def feat(loc, size, key, rot=(0, 0, 0)):
        me = bpy.data.meshes.new('f'); bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1); bmesh.ops.scale(bm, vec=size, verts=bm.verts); bm.to_mesh(me); bm.free()
        for pl in me.polygons: pl.use_smooth = True
        me.materials.append(charter_mat(key)); o = bpy.data.objects.new('face', me); sc.collection.objects.link(o)
        wm = Matrix.Translation(loc) @ Euler(rot).to_matrix().to_4x4()
        o.parent = arm; o.parent_type = 'BONE'; o.parent_bone = 'Head'; o.matrix_parent_inverse = par.inverted(); o.matrix_basis = wm; return o
    eye = FACE.get('eye', 'hair_dark'); brow = FACE.get('brow', FACE.get('hair', 'hair_dark'))
    for sx in (-1, 1):
        feat((sx * .034 * k, yf + .012, zc + .022), (.016 * k, .012, .011), eye)                      # yeux
        feat((sx * .036 * k, yf + .010, zc + .045), (.024 * k, .012, .007), brow, (0, sx * -.18, 0))   # sourcils
    feat((0, yf - .004, zc - .012), (.011, .016, .026), FACE.get('skin', 'skin'))                     # nez
    feat((0, yf + .012, zc - .058), (.026 * k, .010, .0065), FACE.get('mouth', 'wine' if fem else 'leather'))   # bouche
    if FACE.get('beard'):
        feat((0, yf + .028, zc - .085), (.058, .045, .058), FACE['beard']); feat((0, yf + .014, zc - .040), (.036, .012, .008), FACE['beard'])
    if FACE.get('stache'): feat((0, yf + .010, zc - .042), (.040, .012, .010), FACE['stache'])
    if FACE.get('patch'):   # bandeau sur l'œil
        feat((.034, yf + .006, zc + .022), (.024, .012, .020), 'leather_black'); feat((0, yf + .03, zc + .05), (.098, .105, .010), 'leather_black', (.25, .35, 0))
    if FACE.get('scar'): feat((-.045, yf + .016, zc - .01), (.005, .008, .045), 'wine', (0, .3, 0))
    # coiffures et accessoires ajoutés pour coller aux portraits
    H = FACE.get('hairc', 'hair_dark')
    if FACE.get('cap'):  feat((0, .022, zc + .052), (.104 * k, .112, .095), H)                                # cheveux courts (calotte)
    if FACE.get('bob'):                                                                                       # carré au menton
        feat((0, .022, zc + .052), (.106 * k, .114, .097), H); feat((0, .085, zc - .03), (.092 * k, .05, .12), H)
        for sx in (-1, 1): feat((sx * .094 * k, .012, zc - .025), (.034, .072, .10), H)
    if FACE.get('mane'):                                                                                      # cheveux longs sur les épaules
        feat((0, .022, zc + .052), (.106 * k, .114, .097), H); feat((0, .082, zc - .10), (.105 * k, .06, .21), H)
        for sx in (-1, 1): feat((sx * .098 * k, .005, zc - .09), (.032, .06, .17), H)
    if FACE.get('bun'):  feat((0, .022, zc + .052), (.104 * k, .112, .095), H); feat((0, .10, zc + .07), (.05, .05, .05), H)   # chignon
    if FACE.get('crest'): feat((0, .0, zc + .135), (.034, .10, .035), H)                                      # crête courte
    if FACE.get('glasses'):
        for sx in (-1, 1): feat((sx * .036 * k, yf + .002, zc + .022), (.026 * k, .006, .020), 'steel')
        feat((0, yf + .004, zc + .026), (.012, .005, .004), 'leather_black')
    if FACE.get('goggles'):
        for sx in (-1, 1): feat((sx * .04 * k, yf + .012, zc + .085), (.032 * k, .016, .026), 'brass')
        feat((0, .01, zc + .085), (.108 * k, .118, .016), 'leather_black')
    if FACE.get('circlet'): feat((0, .01, zc + .078), (.108 * k, .118, .010), 'gold')
    if FACE.get('scarf'): feat((0, .0, zc - .135), (.105, .095, .05), FACE['scarf'])
    if FACE.get('collar'): feat((0, -.01, zc - .15), (.12, .10, .035), FACE['collar'])
    arm.data.pose_position = 'POSE'; bpy.context.view_layer.update()

# ---------- jupe longue (robe de dame) : cône rigide de la taille aux chevilles, pour les personnages qui restent sur place ----------
if spec.get('skirt'):
    arm.data.pose_position = 'REST'; bpy.context.view_layer.update()
    fem = 'Female' in arm.name; z0 = 1.04 if fem else 1.08; N = 14; vs = []; fs = []; R_ = 6
    for r in range(R_ + 1):
        t = r / R_; z = z0 - t * (z0 - .05); rad = .17 + t * .21
        for i in range(N):
            a_ = i / N * 2 * math.pi; vs.append((math.sin(a_) * rad * (1 + .05 * math.sin(a_ * 5) * t), math.cos(a_) * rad * .82 * (1 + .05 * math.sin(a_ * 5) * t) + .01, z))
    for r in range(R_):
        for i in range(N): fs.append((r * N + i, r * N + (i + 1) % N, (r + 1) * N + (i + 1) % N, (r + 1) * N + i))
    me = bpy.data.meshes.new('sk'); me.from_pydata(vs, [], fs); me.update()
    for pl in me.polygons: pl.use_smooth = True
    me.materials.append(charter_mat(spec['skirt'])); o = bpy.data.objects.new('skirt', me); sc.collection.objects.link(o); o.parent = arm; o.matrix_parent_inverse = arm.matrix_world.inverted()
    if spec.get('hem'):
        vh = [(x * 1.012, y * 1.012, z) for (x, y, z) in vs[-2 * N:]]; fh = [(i, (i + 1) % N, N + (i + 1) % N, N + i) for i in range(N)]
        mh = bpy.data.meshes.new('hem'); mh.from_pydata(vh, [], fh); mh.update(); mh.materials.append(charter_mat(spec['hem'])); oh = bpy.data.objects.new('hem', mh); sc.collection.objects.link(oh); oh.parent = arm; oh.matrix_parent_inverse = arm.matrix_world.inverted()
    arm.data.pose_position = 'POSE'; bpy.context.view_layer.update()

# ---------- cape et tabard : posés au repos, attachés à l'os du dos ----------
if (spec.get('cape') or spec.get('tabard')) and arm.data.bones.get('Back'):
    arm.data.pose_position = 'REST'; bpy.context.view_layer.update()
    bb = arm.data.bones['Back']; fem = 'Female' in arm.name; kz = .93 if fem else 1.0
    parb = arm.matrix_world @ bb.matrix_local @ Matrix.Translation((0, bb.length, 0))
    def cloth(verts, faces, key):
        me = bpy.data.meshes.new('cl'); me.from_pydata(verts, [], faces); me.update()
        for pl in me.polygons: pl.use_smooth = True
        me.materials.append(charter_mat(key)); o = bpy.data.objects.new('cloth', me); sc.collection.objects.link(o)
        so = o.modifiers.new('s', 'SOLIDIFY'); so.thickness = .012
        o.parent = arm; o.parent_type = 'BONE'; o.parent_bone = 'Back'; o.matrix_parent_inverse = parb.inverted(); o.matrix_basis = Matrix.Identity(4); return o
    if spec.get('cape'):
        vs = []; fs = []; N = 7; R_ = 9
        for r in range(R_ + 1):
            t = r / R_; z = (1.47 - t * 1.12) * kz; w = .27 + t * .22; back = .15 + t * .12
            for i in range(N):
                u = i / (N - 1) * 2 - 1; vs.append((u * w, back - abs(u) ** 2 * (.20 + t * .06) + .03 * math.sin(u * 5 + t * 6) * t, z))
        for r in range(R_):
            for i in range(N - 1): fs.append((r * N + i, r * N + i + 1, (r + 1) * N + i + 1, (r + 1) * N + i))
        cloth(vs, fs, spec['cape'])
        cloth([(-.26, -.10, 1.50 * kz), (.26, -.10, 1.50 * kz), (.27, .17, 1.47 * kz), (-.27, .17, 1.47 * kz)], [(0, 1, 2, 3)], spec['cape'])   # col sur les épaules
    if spec.get('tabard'):
        y = -.165 if not fem else -.15
        cloth([(-.15, y + .02, 1.40 * kz), (.15, y + .02, 1.40 * kz), (.17, y - .01, 1.02 * kz), (-.17, y - .01, 1.02 * kz), (.15, y + .01, .72 * kz), (-.15, y + .01, .72 * kz)], [(0, 1, 2, 3), (3, 2, 4, 5)], spec['tabard'])
        if spec.get('emblem'): cloth([(-.06, y - .025, 1.28 * kz), (.06, y - .025, 1.28 * kz), (.06, y - .03, 1.10 * kz), (-.06, y - .03, 1.10 * kz)], [(0, 1, 2, 3)], spec['emblem'])
    arm.data.pose_position = 'POSE'; bpy.context.view_layer.update()

# ---------- caméra et lumière de la charte ----------
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = spec.get('samples', 48); sc.cycles.use_denoising = False; sc.cycles.max_bounces = 3
sc.render.film_transparent = True; sc.render.resolution_x = FW * SS; sc.render.resolution_y = FH * SS; sc.render.resolution_percentage = 100
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'
yaw = math.radians(spec.get('yaw', 0)); D = 9.0
cam = bpy.data.cameras.new('C'); co = bpy.data.objects.new('C', cam); sc.collection.objects.link(co); sc.camera = co
eye = spec.get('eye', 1.25)
co.location = (D * math.sin(yaw), -D * math.cos(yaw), eye); co.rotation_euler = (math.radians(90), 0, yaw)
cam.sensor_fit = 'VERTICAL'; cam.sensor_height = 36; cam.lens = 36 * D / SPAN
cam.shift_y = (GROUND - .5) - eye / SPAN + .5 - .5   # le sol (z = 0) tombe à GROUND dans le cadre
cam.shift_y = (eye / SPAN) - (1 - GROUND) ; cam.shift_y = -cam.shift_y + 0  # voir calcul ci-dessous
# z à l'écran : v = .5 + (z - eye)/SPAN + shift ; on veut v(0) = 1 - GROUND  =>  shift = (1 - GROUND) - .5 + eye/SPAN
cam.shift_y = -((1 - GROUND) - .5 + eye / SPAN)
def sun(name, elev, azim, e, col, ang=6):
    l = bpy.data.lights.new(name, 'SUN'); l.energy = e; l.color = col; l.angle = math.radians(ang)
    o = bpy.data.objects.new(name, l); sc.collection.objects.link(o)
    o.rotation_euler = (math.radians(90 - elev), 0, math.radians(azim) + yaw); return o
sun('key', 48, -42, 3.4, (1.0, .86, .68))      # torche : en haut à gauche, chaude
sun('fill', 12, 62, .55, (.55, .68, 1.0), 30)  # contre-jour froid à droite
sun('rim', 35, 150, 1.1, (.9, .92, 1.0))       # liseré arrière
w = bpy.data.worlds.new('W'); sc.world = w; w.use_nodes = True
nt = w.node_tree; bg = nt.nodes['Background']
tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ'); rp = nt.nodes.new('ShaderNodeValToRGB')
rp.color_ramp.elements[0].position = .35; rp.color_ramp.elements[0].color = (.035, .03, .04, 1); rp.color_ramp.elements[1].position = .9; rp.color_ramp.elements[1].color = (.42, .38, .36, 1)
mp = nt.nodes.new('ShaderNodeMapRange'); mp.inputs[1].default_value = -1; mp.inputs[2].default_value = 1
nt.links.new(tc.outputs['Generated'], sep.inputs[0]); nt.links.new(sep.outputs['Z'], mp.inputs[0]); nt.links.new(mp.outputs[0], rp.inputs['Fac']); nt.links.new(rp.outputs['Color'], bg.inputs['Color'])
bg.inputs['Strength'].default_value = 1.0

s = spec.get('scale', 1.0)
if s != 1.0:
    roots = [o for o in bpy.data.objects if o.parent is None and o.type in ('MESH', 'ARMATURE', 'EMPTY')]
    for o in roots: o.scale = [v * s for v in o.scale]; o.location = [v * s for v in o.location]
roots = [o for o in bpy.data.objects if o.parent is None and o.type in ('MESH', 'ARMATURE', 'EMPTY')]
piv = bpy.data.objects.new('PIV', None); sc.collection.objects.link(piv)
for o in roots: o.parent = piv
RZ = spec.get('rotz_frames', {})
if spec.get('girth'): piv.scale = (spec['girth'], spec['girth'], 1)
for i, f in enumerate(spec['frames']):
    piv.rotation_euler = (0, 0, math.radians(RZ.get(str(i), spec.get('rotz', 0))))
    sc.frame_set(int(f)); sc.render.filepath = os.path.join(out, 'f%02d.png' % i); bpy.ops.render.render(write_still=True)
print('DONE', spec.get('name'))
