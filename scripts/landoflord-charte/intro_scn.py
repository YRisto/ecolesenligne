# Plans de l'intro : décors rendus en 3D (Blender, Cycles), même charte de couleurs que le jeu. Usage : intro_scn.py <plan> <sortie.png> [échelle]
import bpy, bmesh, sys, math, random
from mathutils import Vector, noise, Matrix
name, out = sys.argv[-3], sys.argv[-2]; SCALE = float(sys.argv[-1])
random.seed(hash(name) % 9999); R = random.random; U = lambda a, b: a + (b - a) * R()
bpy.ops.wm.read_factory_settings(use_empty=True); sc = bpy.context.scene; col = sc.collection
def link(o): col.objects.link(o); return o
def mat(rgb, rough=.8, bump=.3, scale=6, var=.25, metal=0, brick=None, emit=0):
    m = bpy.data.materials.new('m'); m.use_nodes = True; nt = m.node_tree; b = nt.nodes['Principled BSDF']; b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    tc = nt.nodes.new('ShaderNodeTexCoord'); n = nt.nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = 6; nt.links.new(tc.outputs['Object'], n.inputs['Vector'])
    mix = nt.nodes.new('ShaderNodeMixRGB'); mix.blend_type = 'MULTIPLY'; mix.inputs[0].default_value = var * 2; mix.inputs[1].default_value = (*rgb, 1); nt.links.new(n.outputs['Fac'], mix.inputs[2]); src = mix.outputs[0]; hsrc = n.outputs['Fac']
    if brick:
        br = nt.nodes.new('ShaderNodeTexBrick'); br.inputs['Scale'].default_value = brick[0]; br.inputs['Mortar Size'].default_value = brick[1]; br.inputs['Color1'].default_value = (*rgb, 1); br.inputs['Color2'].default_value = (*[c * .8 for c in rgb], 1); br.inputs['Mortar'].default_value = (*[c * .35 for c in rgb], 1); br.inputs['Bias'].default_value = -.3
        sp = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(tc.outputs['Object'], sp.inputs[0]); ad = nt.nodes.new('ShaderNodeMath'); ad.operation = 'ADD'; nt.links.new(sp.outputs[0], ad.inputs[0]); nt.links.new(sp.outputs[1], ad.inputs[1]); cb = nt.nodes.new('ShaderNodeCombineXYZ'); nt.links.new(ad.outputs[0], cb.inputs[0]); nt.links.new(sp.outputs[2], cb.inputs[1]); nt.links.new(cb.outputs[0], br.inputs['Vector']); m2 = nt.nodes.new('ShaderNodeMixRGB'); m2.blend_type = 'MULTIPLY'; m2.inputs[0].default_value = var * 2; nt.links.new(br.outputs['Color'], m2.inputs[1]); nt.links.new(n.outputs['Fac'], m2.inputs[2]); src = m2.outputs[0]; hsrc = br.outputs['Fac']
    nt.links.new(src, b.inputs['Base Color'])
    if bump:
        bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = bump; nt.links.new(n.outputs['Fac'] if not brick else hsrc, bp.inputs['Height']); nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
    if emit: b.inputs['Emission Color'].default_value = (*rgb, 1); b.inputs['Emission Strength'].default_value = emit
    return m
def glow(rgb, s=1, alpha=1):
    m = bpy.data.materials.new('g'); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear(); o = nt.nodes.new('ShaderNodeOutputMaterial'); e = nt.nodes.new('ShaderNodeEmission'); e.inputs[0].default_value = (*rgb, 1); e.inputs[1].default_value = s
    if alpha < 1:
        t = nt.nodes.new('ShaderNodeBsdfTransparent'); mx = nt.nodes.new('ShaderNodeMixShader'); mx.inputs[0].default_value = alpha; nt.links.new(t.outputs[0], mx.inputs[1]); nt.links.new(e.outputs[0], mx.inputs[2]); nt.links.new(mx.outputs[0], o.inputs[0])
    else: nt.links.new(e.outputs[0], o.inputs[0])
    return m
def mesh(vs, fs, m, smooth=False):
    me = bpy.data.meshes.new('me'); me.from_pydata(vs, [], fs); me.update()
    if smooth:
        for p in me.polygons: p.use_smooth = True
    me.materials.append(m); return link(bpy.data.objects.new('o', me))
def box(x0, x1, y0, y1, z0, z1, m, rot=None):
    o = mesh([(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)], m)
    if rot: 
        c = Vector(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)); o.data.transform(Matrix.Translation(-c)); o.location = c; o.rotation_euler = rot
    return o
def cyl(x, y, z0, z1, r, m, r2=None, seg=16, smooth=True):
    r2 = r if r2 is None else r2; vs = []; fs = []
    for i in range(seg):
        a = i / seg * 2 * math.pi; vs += [(x + math.cos(a) * r, y + math.sin(a) * r, z0), (x + math.cos(a) * r2, y + math.sin(a) * r2, z1)]
    for i in range(seg): j = (i + 1) % seg; fs.append((i * 2, j * 2, j * 2 + 1, i * 2 + 1))
    fs.append(tuple(range(0, seg * 2, 2))[::-1]); fs.append(tuple(range(1, seg * 2, 2))); return mesh(vs, fs, m, smooth)
def ball(x, y, z, r, m, sc_=(1, 1, 1), sub=2):
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1); me = bpy.data.meshes.new('b'); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    me.materials.append(m); o = link(bpy.data.objects.new('b', me)); o.location = (x, y, z); o.scale = (r * sc_[0], r * sc_[1], r * sc_[2]); return o
def terrain(x0, x1, y0, y1, res, f, m, smooth=True):
    nx = int((x1 - x0) / res) + 1; ny = int((y1 - y0) / res) + 1; vs = [(x0 + i * res, y0 + j * res, f(x0 + i * res, y0 + j * res)) for j in range(ny) for i in range(nx)]
    fs = [(j * nx + i, j * nx + i + 1, (j + 1) * nx + i + 1, (j + 1) * nx + i) for j in range(ny - 1) for i in range(nx - 1)]; return mesh(vs, fs, m, smooth)
fb = lambda x, y, s, o=4, seed=0: noise.fractal(Vector((x * s + seed, y * s + seed * .7, seed * 1.3)), 1.0, 2.0, o)
def rock(x, y, z, r, m, sq=(1, 1, 1), amp=.35, seed=0):
    o = ball(x, y, z, r, m, sq, 4)
    for v in o.data.vertices: v.co += v.co.normalized() * (amp * noise.noise(v.co * 1.7 + Vector((seed, seed, seed))) + amp * .35 * noise.noise(v.co * 5 + Vector((seed, 3, seed))))
    return o
def sun(elev, azim, e, c, ang=3):
    l = bpy.data.lights.new('s', 'SUN'); l.energy = e; l.color = c; l.angle = math.radians(ang); o = link(bpy.data.objects.new('s', l)); o.rotation_euler = (math.radians(90 - elev), 0, math.radians(azim)); return o
def lamp(x, y, z, e, c, r=.1, spot=None):
    l = bpy.data.lights.new('l', 'SPOT' if spot else 'POINT'); l.energy = e; l.color = c; l.shadow_soft_size = r; o = link(bpy.data.objects.new('l', l)); o.location = (x, y, z)
    if spot: l.spot_size = math.radians(spot[0]); l.spot_blend = .5; o.rotation_euler = spot[1]
    return o
def camera(loc, look, lens=35):
    cam = bpy.data.cameras.new('C'); co = link(bpy.data.objects.new('C', cam)); sc.camera = co; cam.lens = lens; cam.clip_end = 2000; co.location = loc
    d = Vector(look) - Vector(loc); co.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler(); return co
def world(rgb, s=1): w = bpy.data.worlds.new('W'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (*rgb, 1); w.node_tree.nodes['Background'].inputs[1].default_value = s
def haze(y, rgb, a, x0=-900, x1=900, z1=220, z0=-20): box(x0, x1, y, y + .01, z0, z1, glow(rgb, 1, a))
STONE = (.33, .30, .26); STONE_D = (.20, .185, .165); WOOD = (.22, .12, .06); WOOD_D = (.10, .055, .03); RED = (.40, .05, .05); GOLD = (.75, .50, .14); CLOTH = (.48, .40, .27)
def crenel(x0, x1, y0, y1, z, m, n, axis='x', h=.9, d=.5):
    for i in range(n):
        if i % 2: continue
        if axis == 'x': a = x0 + (x1 - x0) * i / n; box(a, a + (x1 - x0) / n, y0, y1, z, z + h, m)
        else: a = y0 + (y1 - y0) * i / n; box(x0, x1, a, a + (y1 - y0) / n, z, z + h, m)
def tower(x, y, r, h, m, roof=None, z0=0):
    cyl(x, y, z0, z0 + h, r, m, seg=20); cyl(x, y, z0 + h, z0 + h + .5, r * 1.12, m, seg=20)
    for i in range(10):
        a = i / 10 * 2 * math.pi; box(x + math.cos(a) * r * 1.08 - r * .16, x + math.cos(a) * r * 1.08 + r * .16, y + math.sin(a) * r * 1.08 - r * .16, y + math.sin(a) * r * 1.08 + r * .16, z0 + h + .5, z0 + h + .5 + r * .35, m)
    if roof: cyl(x, y, z0 + h + .5, z0 + h + .5 + r * 2.2, r * .98, roof, r2=.02, seg=20)
def parch(x0, x1, y, z0, zs, zt, m, t=.5, d=.8, n=10):   # arc brisé dans le plan xz, épaisseur t, profondeur d
    c = (x0 + x1) / 2; w = (x1 - x0) / 2; vs = []; fs = []
    def pts(wi, top):
        o = []
        for i in range(n + 1):
            a = i / n; o.append((c - wi + wi * (a ** 1.0) * 1.0 * (1 - 0) * (a), zs + (top - zs) * math.sin(a * math.pi / 2)))
        return o
    inner = pts(w, zt); outer = pts(w + t, zt + t)
    for sgn in (1, -1):
        base = len(vs)
        for (ix, iz), (ox, oz) in zip(inner, outer):
            xi = c + sgn * (ix - c); xo = c + sgn * (ox - c); vs += [(xi, y, iz), (xo, y, oz), (xi, y + d, iz), (xo, y + d, oz)]
        for i in range(n):
            a = base + i * 4; b = a + 4; fs += [(a, a + 1, b + 1, b), (a + 2, b + 2, b + 3, a + 3), (a, b, b + 2, a + 2), (a + 1, a + 3, b + 3, b + 1)]
    mesh(vs, fs, m); box(x0 - t, x0, y, y + d, z0, zs, m); box(x1, x1 + t, y, y + d, z0, zs, m)

def dawn():   # plaine à l'aube, montagnes, château à l'horizon (ciel transparent : il est peint et animé dans le jeu)
    g = mat((.13, .22, .07), rough=.95, bump=.5, scale=.6, var=.45)
    terrain(-260, 260, -40, 330, 4, lambda x, y: 5 * fb(x, y, .012, 4, 3) + 1.6 * fb(x, y, .05, 3, 9) - .0009 * (y - 40) ** 2 * 0 + (max(0, (y - 150)) * .02), g)
    rd = mat((.30, .24, .15), rough=.95, bump=.2, var=.3); pts = []
    for i in range(140):
        y = -40 + i * 2.2; x = 9 * math.sin(y * .028) + 14 * math.sin(y * .011 + 1) + y * .09; z = 5 * fb(x, y, .012, 4, 3) + 1.6 * fb(x, y, .05, 3, 9) + max(0, (y - 150)) * .02 + .12; pts.append((x, y, z))
    vs = []; fs = []
    for i, (x, y, z) in enumerate(pts): w = 1.5; vs += [(x - w, y, z), (x + w, y, z)]
    for i in range(len(pts) - 1): fs.append((i * 2, i * 2 + 1, i * 2 + 3, i * 2 + 2))
    mesh(vs, fs, rd, True)
    for k, (yy, amp, c) in enumerate(((330, 55, (.13, .12, .20)), (420, 95, (.24, .20, .34)), (520, 150, (.40, .32, .48)))):
        m = mat(c, rough=1, bump=.6, scale=.05, var=.3); terrain(-700, 700, yy, yy + 90, 9, lambda x, y, yy=yy, amp=amp, k=k: max(0, (amp * (.55 + .9 * abs(fb(x, yy, .006, 5, 20 + k * 7))) + amp * .25 * fb(x, y, .03, 3, 4 + k)) * (1 - abs(y - yy - 45) / 45)), m, False)
    cx, cy = 62, 250; cz = 5 * fb(cx, cy, .012, 4, 3) + 2 + 10
    hill = mat((.13, .15, .08), rough=1, bump=.5, scale=.4); ball(cx, cy + 6, cz - 16, 42, hill, (1.3, 1, .55), 3)
    st = mat((.36, .32, .30), rough=.9, bump=.4, brick=(1.2, .03)); rf = mat((.16, .13, .22), rough=.7)
    box(cx - 16, cx + 16, cy - 6, cy + 10, cz, cz + 11, st); crenel(cx - 16, cx + 16, cy - 6, cy - 5, cz + 11, st, 22, h=1.2)
    for tx, ty, r, h in ((-16, -6, 4, 19), (16, -6, 4, 17), (-6, 8, 5, 30), (9, 9, 4.2, 24), (0, -7, 3, 15)): tower(cx + tx, cy + ty, r, h, st, rf, cz)
    box(cx - 5, cx + 7, cy + 2, cy + 12, cz, cz + 20, st); cyl(cx + 1, cy + 7, cz + 20, cz + 29, 7.5, rf, r2=.05, seg=4)
    tr = mat((.04, .10, .04), rough=1, bump=.3, scale=2); tr2 = mat((.07, .13, .05), rough=1, bump=.3, scale=2)
    for i in range(420):
        x = U(-230, 230); y = U(10, 300)
        if abs(x - (9 * math.sin(y * .028) + 14 * math.sin(y * .011 + 1) + y * .09)) < 7 or fb(x, y, .02, 2, 50) < .05: continue
        z = 5 * fb(x, y, .012, 4, 3) + 1.6 * fb(x, y, .05, 3, 9) + max(0, (y - 150)) * .02; h = U(4, 8); cyl(x, y, z, z + h, h * .32, tr if R() < .6 else tr2, r2=.02, seg=7, smooth=False)
    sun(11, 138, 9.0, (1, .62, .34), 2); sun(40, -30, 1.6, (.45, .5, .9), 40); world((.20, .18, .30), 1.0); camera((0, -34, 8.5), (10, 200, 14), 30)

def bridge():   # la porte de Castelroc vue d'en bas : tour à gauche, pont-levis, falaise
    st = mat((.36, .33, .29), rough=.9, bump=.9, brick=(1.6, .025), var=.35); std = mat((.24, .22, .20), rough=.95, bump=.9, brick=(1.6, .025), var=.35); dk = mat((.012, .012, .016), rough=1, bump=0)
    box(-15, -5, 2, 12, -6, 15, st); box(-5, 1, 3.2, 11, -6, 12.5, st); crenel(-15, -5, 2, 2.9, 15, st, 9, h=1.1); crenel(-5, 1, 3.2, 4, 12.5, st, 6, h=1); box(-15.4, -4.6, 1.6, 2, 13.4, 14, std); box(-5.3, 1.3, 2.8, 3.2, 11.2, 11.7, std)
    tower(-15, 2.5, 3.2, 20, st, None, -6); tower(1.6, 3.6, 2.6, 16.5, st, mat((.15, .12, .20), rough=.7), -6)
    box(-3.9, -.1, 3.1, 3.3, 0, 4.2, dk); parch(-3.9, -.1, 3.0, 0, 4.2, 6.0, std, t=.5, d=.5); mesh([(-3.9, 3.15, 4.2), (-.1, 3.15, 4.2), (-2, 3.15, 6.0)], [(0, 1, 2)], dk)
    for sx in (-4.6, .6): box(sx - .5, sx + .5, 2.4, 3.2, -6, 7.5, st)
    for z in (8.2, 9.4): 
        for x in (-12, -9): box(x, x + .5, 1.95, 2.05, z, z + 1.5, dk)
    wd = mat(WOOD, rough=.85, bump=.6, scale=3, var=.4); wdd = mat(WOOD_D, rough=.9, bump=.5)
    for i in range(22): x0 = -4 + i * 1.02; box(x0, x0 + .98, -1.6, 3.2, -.22 + U(-.02, .02), 0, wd)
    for y in (-1.6, 3.0): box(-4, 18.5, y, y + .22, 0, .25, wdd)
    ir = mat((.06, .06, .07), rough=.5, metal=.8)
    for y in (-1.7, 3.05): box(-4, 18.5, y, y + .3, -.75, -.22, wdd)
    for i in range(8): box(-3 + i * 2.9, -3 + i * 2.9 + .35, -1.6, 3.2, -.6, -.22, wdd)
    for y in (-1.6, 3.1):
        for i in range(10): box(-3.5 + i * 2.3, -3.5 + i * 2.3 + .16, y, y + .14, .25, 1.15, wdd)
        box(-4, 18.5, y, y + .14, 1.1, 1.25, wdd)
    rk = mat((.34, .29, .23), rough=1, bump=1, scale=1.2, var=.5); rk2 = mat((.40, .34, .26), rough=1, bump=1, scale=1.2, var=.5); gr = mat((.12, .17, .07), rough=1, bump=.6, scale=3)
    for i in range(26): rock(U(-22, 4), U(1, 12), U(-13, -5), U(3, 6), rk if R() < .5 else rk2, (1.3, 1, 1.1), .9, i)
    for i in range(34): rock(U(19, 46), U(3, 16), U(-9, -2.5) - (0 if R() < .5 else 3), U(2.5, 6), rk2 if R() < .5 else rk, (1.4, 1, .8), .9, 40 + i)
    box(17.5, 60, -8, 16, -3, -.05, gr); 
    for i in range(60): x = U(18, 44); y = U(-5, 14); ball(x, y, 0, U(.3, .8), gr, (1, 1, .5), 1)
    for i in range(9): x = U(26, 46); y = U(5, 15); h = U(5, 9); cyl(x, y, 0, h, h * .3, mat((.05, .10, .04), rough=1), r2=.02, seg=7, smooth=False)
    box(-60, 80, 40, 41, -30, -6.5, mat((.10, .12, .16), rough=.3)); terrain(-80, 120, 16, 200, 6, lambda x, y: -10 + 3 * fb(x, y, .03, 3, 2), mat((.10, .14, .07), rough=1))
    haze(30, (.72, .50, .46), .22, z0=-40)
    sun(16, 140, 6.5, (1, .66, .42), 2); sun(30, -40, 2.2, (.50, .56, .95), 40); world((.30, .26, .36), 1.0); camera((11.5, -11.5, -1.2), (2.5, 4, 4.4), 26)

def hall():   # grande nef : colonnes, arcs brisés, rosace et rais de lumière, trône au fond
    st = mat((.40, .36, .30), rough=.85, bump=.5, brick=(.9, .02), var=.3); std = mat((.26, .235, .20), rough=.9, bump=.5, brick=(.9, .02)); pol = mat((.32, .29, .26), rough=.18, bump=.05, scale=2, var=.15); dk = mat((.05, .045, .05), rough=.2)
    L = 46; W = 7
    box(-W - 5, W + 5, -6, L, -.3, 0, pol)
    for i in range(-6, 7):
        for j in range(-3, 24):
            if (i + j) % 2: box(i * 2, i * 2 + 2, j * 2, j * 2 + 2, 0, .004, dk)
    box(-1.5, 1.5, -6, L - 3, .004, .012, mat((.42, .04, .04), rough=.95, bump=.3, scale=30)); 
    for x in (-1.5, 1.32): box(x, x + .18, -6, L - 3, .012, .016, mat(GOLD, rough=.5, metal=.6))
    box(-W - 5, -W - 4.4, -6, L, 0, 24, st); box(W + 4.4, W + 5, -6, L, 0, 24, st); box(-W - 5, W + 5, L, L + .6, 0, 24, st)
    for k in range(8):
        y = k * 6
        for sx in (-1, 1):
            x = sx * W; cyl(x, y, 0, .7, 1.25, std, seg=8, smooth=False); cyl(x, y, .7, 9.5, .78, st, seg=12)
            for a in range(4): cyl(x + math.cos(a * 1.57 + .78) * .78, y + math.sin(a * 1.57 + .78) * .78, .7, 9.5, .26, st, seg=8)
            cyl(x, y, 9.5, 10.2, 1.0, std, r2=1.3, seg=8, smooth=False)
        parch(-W + .6, W - .6, y - .4, 10.2, 10.2, 17.5, st, t=.7, d=.8, n=14)
        for sx in (-1, 1):
            xa = sx * W + sx * .6; xb = sx * (W + 4.4); parch(min(xa, xb), max(xa, xb), y - .3, 10.2, 10.2, 13.2, std, t=.4, d=.6, n=8)
        if k < 7:
            for sx in (-1, 1):
                x0 = sx * W - .5; box(x0, x0 + 1, y + .4, y + 5.6, 15.6, 22, st)
    box(-W - 5, W + 5, -6, L, 22, 22.6, mat((.12, .10, .09), rough=1))
    win = glow((.80, .68, 1.0), 5); bar = mat((.05, .045, .05), rough=.9)
    for k in range(7):   # hautes fenêtres côté droit et leurs rais
        y = k * 6 + 3; box(W + 4.35, W + 4.42, y - 1.3, y + 1.3, 5, 13, win); mesh([(W + 4.35, y - 1.3, 13), (W + 4.35, y + 1.3, 13), (W + 4.35, y, 15.2)], [(0, 1, 2)], win)
        for b in (-.45, .45): box(W + 4.28, W + 4.36, y + b - .06, y + b + .06, 5, 13.6, bar)
        for z in (7.5, 10, 12.4): box(W + 4.28, W + 4.36, y - 1.3, y + 1.3, z, z + .12, bar)
        sh = glow((1.0, .86, .72), 1, .022); vs = [(W + 4.3, y - 1.2, 5), (W + 4.3, y + 1.2, 5), (W + 4.3, y + 1.2, 14), (W + 4.3, y - 1.2, 14), (-4, y - 2.2, 0), (-4, y + 2.0, 0), (2.5, y + 2.0, 0), (2.5, y - 2.2, 0)]
        mesh(vs, [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)], sh)
        lamp(W + 3, y, 9.5, 2600, (1, .82, .66), .5, spot=(46, (math.radians(-58), 0, math.radians(90))))
    ry = L - .05; cyl(0, ry, 15.5, 15.5, 0, win)   # rosace au fond
    o = cyl(0, 0, 0, .08, 3.6, win, seg=28); o.rotation_euler = (math.radians(90), 0, 0); o.location = (0, ry, 15.5)
    for i in range(12):
        a = i / 12 * 2 * math.pi; b = box(-.07, .07, -.05, .05, 0, 3.6, bar); b.rotation_euler = (0, a, 0); b.location = (0, ry - .1, 15.5)
    for r in (1.3, 2.5, 3.6): 
        bm = bmesh.new(); bmesh.ops.create_circle(bm, segments=28, radius=r, cap_ends=False); me = bpy.data.meshes.new('c'); bm.to_mesh(me); bm.free(); t = link(bpy.data.objects.new('c', me)); t.rotation_euler = (math.radians(90), 0, 0); t.location = (0, ry - .12, 15.5); md = t.modifiers.new('s', 'SKIN'); 
        for v in me.skin_vertices[0].data: v.radius = (.07, .07)
        me.materials.append(bar)
    sh = glow((.92, .80, 1.0), 1, .035); mesh([(-3.4, ry - .2, 12.2), (3.4, ry - .2, 12.2), (3.4, ry - .2, 18.8), (-3.4, ry - .2, 18.8), (-4.5, 16, 0), (4.5, 16, 0), (4.5, 30, 0), (-4.5, 30, 0)], [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)], sh)
    lamp(0, L - 4, 14, 9000, (.92, .82, 1.0), 1, spot=(50, (math.radians(-35), 0, math.radians(0))))
    for i, (d, h) in enumerate(((4.2, .3), (3.4, .6), (2.6, .9))): box(-4.6 + i * .6, 4.6 - i * .6, L - 3 - d, L - .6, 0, h, st)
    g = mat(GOLD, rough=.35, metal=.9, bump=.1); w = mat(WOOD, rough=.6, bump=.3); rd = mat(RED, rough=.95, bump=.3, scale=30)
    box(-.8, .8, L - 3.4, L - 2.4, .9, 1.7, w); box(-.9, .9, L - 2.5, L - 2.2, .9, 4.6, w); box(-.65, .65, L - 2.56, L - 2.5, 1.8, 4.3, rd)
    for x in (-.95, .77): box(x, x + .18, L - 3.4, L - 2.4, 1.7, 2.2, g)
    ball(0, L - 2.35, 4.85, .32, g); 
    for x in (-.8, .8): ball(x, L - 2.35, 4.65, .18, g)
    for sx in (-1, 1):
        for k, c in enumerate(((.07, .12, .34), (.40, .05, .05))): 
            x = sx * (2.6 + k * 1.6); box(x - .6, x + .6, L - .75, L - .65, 3.2, 9.5, mat(c, rough=.95, bump=.3, scale=30)); box(x - .28, x + .28, L - .8, L - .75, 6.4, 7.2, g)
        for k in range(8): 
            if k % 2 == 0: x = sx * (W + 4.3); c = (.40, .05, .05) if (k // 2) % 2 else (.07, .12, .34); box(min(x, x - sx * .08), max(x, x - sx * .08), k * 6 + 1.6, k * 6 + 4.4, 3, 8.6, mat(c, rough=.95, bump=.3, scale=30))
        cyl(sx * 3.3, L - 5, 0, 2.6, .07, mat((.06, .06, .07), metal=.8, rough=.5), seg=8); lamp(sx * 3.3, L - 5, 3.0, 380, (1, .6, .25), .15); ball(sx * 3.3, L - 5, 2.85, .22, glow((1, .62, .2), 14))
    world((.045, .04, .06), 1.0); camera((-1.2, -3.5, 1.5), (.4, 30, 6.4), 20)

def throneback():   # fond du gros plan de la reine : dossier du trône, bannière, torchère
    st = mat((.36, .33, .29), rough=.9, bump=.8, brick=(1.4, .03), var=.35); box(-8, 8, 2, 2.6, -1, 9, st)
    rd = mat((.42, .05, .05), rough=.95, bump=.35, scale=40); bl = mat((.07, .12, .34), rough=.95, bump=.35, scale=40); g = mat(GOLD, rough=.35, metal=.9, bump=.15, scale=20); w = mat(WOOD, rough=.55, bump=.4, scale=4)
    box(-1.1, 1.1, 1.4, 1.75, 0, 3.4, w); box(-.85, .85, 1.34, 1.4, .3, 3.1, rd); 
    for x in (-1.2, 1.02): box(x, x + .18, 1.3, 1.8, 0, 3.6, g)
    box(-1.2, 1.2, 1.3, 1.8, 3.4, 3.62, g); ball(0, 1.55, 3.95, .30, g); 
    for x in (-1.1, 1.1): ball(x, 1.55, 3.78, .16, g)
    for i in range(7): ball(-.72 + i * .24, 1.33, 3.0, .035, g)
    box(-4.6, -2.2, 1.9, 2.0, .6, 5.5, bl); box(-3.9, -2.9, 1.85, 1.9, 2.6, 3.6, g); box(2.2, 4.6, 1.9, 2.0, .6, 5.5, rd); box(2.9, 3.9, 1.85, 1.9, 2.6, 3.6, g)
    for sx in (-1, 1): cyl(sx * 5.6, 1.3, -1, 9, .55, st, seg=14)
    ir = mat((.06, .06, .07), metal=.8, rough=.5); cyl(-1.9, .9, 0, 2.2, .05, ir, seg=8); cyl(-1.9, .9, 2.2, 2.35, .16, ir, r2=.1, seg=10); ball(-1.9, .9, 2.5, .13, glow((1, .62, .2), 20)); lamp(-1.9, .7, 2.6, 260, (1, .62, .28), .12)
    lamp(3.5, -2, 4, 500, (.75, .78, 1.0), 1.2); world((.03, .028, .04), 1.0); camera((.9, -6.2, 2.3), (-.2, 1.5, 2.7), 34)

def field():   # le Gué-aux-Corbeaux au soir : gué, falaises, camp abandonné, étendards plantés
    gr = mat((.20, .15, .09), rough=1, bump=.8, scale=1.5, var=.5)
    terrain(-90, 90, -20, 160, 2.5, lambda x, y: 2.2 * fb(x, y, .03, 4, 6) + .5 * fb(x, y, .15, 3, 2) + max(0, abs(x) - 26) * .55 + (min(0, abs(y - 14) - 9) * .35), gr)
    box(-200, 200, -40, 200, -2.6, -1.25, mat((.05, .045, .06), rough=.08, bump=.02, scale=3))
    rk = mat((.50, .30, .18), rough=1, bump=1, scale=.5, var=.5); rk2 = mat((.42, .24, .15), rough=1, bump=1, scale=.5, var=.5)
    for i in range(46):
        sx = -1 if i % 2 else 1; x = sx * U(30, 62); y = U(-6, 140); h = U(14, 34); rock(x, y, h * .25, U(9, 16), rk if R() < .5 else rk2, (1, 1.2, h / 12), 1.1, i)
    cv = mat((.50, .40, .26), rough=.95, bump=.4, scale=8); cvd = mat((.30, .22, .14), rough=.95, bump=.4, scale=8); wd = mat(WOOD_D, rough=.9, bump=.5); 
    for i in range(13):
        x = U(-20, 20); y = U(30, 95); z = 2.2 * fb(x, y, .03, 4, 6); r = U(2.2, 3.4); col_ = cv if R() < .6 else cvd
        if R() < .35: o = cyl(x, y, z, z + r * 1.1, r, col_, r2=.05, seg=9, smooth=False); o.rotation_euler = (U(.6, 1.2), 0, U(0, 6)); 
        else: cyl(x, y, z, z + r * 1.35, r, col_, r2=.05, seg=9, smooth=False); cyl(x, y, z + r * 1.3, z + r * 1.8, .05, wd, seg=5)
    for i in range(46):   # pieux, lances, débris
        x = U(-17, 17); y = U(-2, 60); z = 2.2 * fb(x, y, .03, 4, 6) + .5 * fb(x, y, .15, 3, 2) + min(0, abs(y - 14) - 9) * .35; o = cyl(x, y, z - .3, z + U(1.4, 2.6), .05, wd, seg=5); o.rotation_euler = (U(-.5, .5), U(-.5, .5), 0)
    for i in range(7): 
        x = U(-16, 16); y = U(4, 40); z = 2.2 * fb(x, y, .03, 4, 6); b = box(-1.3, 1.3, -.7, .7, 0, .7, wd); b.location = (x, y, z + .3); b.rotation_euler = (U(-.4, .4), U(-.3, .3), U(0, 3)); c = cyl(0, 0, -.1, .1, .65, wd, seg=10); c.location = (x + 1, y - .9, z + .5); c.rotation_euler = (1.57 + U(-.4, .4), 0, U(0, 3))
    cyl(6, 24, 0, 9.5, .09, wd, seg=6)   # la hampe de l'étendard ennemi (l'étoffe est animée dans le jeu)
    for yy in (60, 110): haze(yy, (.70, .25, .12), .16)
    sun(10, 150, 8.0, (1, .46, .20), 2); sun(30, -35, 3.0, (.75, .45, .5), 40); world((.34, .16, .14), 1.0); camera((-2, -16, 3.2), (3, 40, 6.5), 26)

def cabinet(close=False):   # le cabinet du chancelier : boiseries, pupitre, rayonnages, lampe
    w = mat(WOOD, rough=.5, bump=.5, scale=5, var=.4); wd = mat(WOOD_D, rough=.6, bump=.5, scale=5, var=.4); fl = mat((.16, .09, .05), rough=.35, bump=.3, scale=8)
    box(-7, 7, -6, 5, -.2, 0, fl); box(-7, 7, 5, 5.3, 0, 6, wd); box(-7.3, -7, -6, 5, 0, 6, wd); box(7, 7.3, -6, 5, 0, 6, wd); box(-7, 7, -6, 5.3, 5.2, 5.5, wd)
    for i in range(8): x = -7 + i * 2; box(x + .15, x + 1.85, 4.94, 5, .5, 2.6, w); box(x + .15, x + 1.85, 4.94, 5, 2.9, 4.9, w)
    for i in range(6): box(-7, 7, -5 + i * 2, -4.8 + i * 2, 4.95, 5.2, w)
    rug = mat((.36, .06, .06), rough=1, bump=.3, scale=40); box(-3, 3, -3.5, 2.5, 0, .02, rug); box(-2.6, 2.6, -3.1, 2.1, .02, .025, mat((.10, .14, .30), rough=1, bump=.3, scale=40)); box(-2.2, 2.2, -2.7, 1.7, .025, .03, rug)
    box(-1.7, 1.7, 1.2, 2.5, .95, 1.05, w); 
    for x in (-1.6, 1.4): box(x, x + .2, 1.3, 2.4, 0, .95, wd)
    box(-1.5, 1.5, 2.3, 2.4, .2, .95, wd)
    pp = mat((.78, .70, .52), rough=.9, bump=.1)
    for i in range(7): b = box(-.22, .22, -.3, .3, 0, .006, pp); b.location = (U(-1.3, 1.2), U(1.45, 2.2), 1.055 + i * .004); b.rotation_euler = (0, 0, U(-.6, .6))
    cyl(.9, 1.6, 1.05, 1.2, .07, mat((.04, .04, .05), rough=.3), seg=10); cyl(-1.1, 2.1, 1.05, 1.32, .035, mat((.8, .75, .6)), seg=8); ball(-1.1, 2.1, 1.37, .04, glow((1, .7, .3), 30)); lamp(-1.1, 2.0, 1.5, 60, (1, .66, .3), .05)
    cols = [(.40, .08, .06), (.08, .16, .34), (.10, .26, .12), (.42, .30, .10), (.24, .10, .26), (.34, .22, .12)]
    for sx, x0 in ((-1, -6.6), (1, 3.6)):
        box(x0, x0 + 3, 4.3, 4.94, 0, 4.4, wd)
        for s in range(5):
            z = .15 + s * .85; box(x0 + .1, x0 + 2.9, 4.25, 4.9, z - .06, z, w); x = x0 + .15
            while x < x0 + 2.75:
                t = U(.07, .16); h = U(.5, .74); b = box(x, x + t, 4.3, 4.75, z, z + h, mat(random.choice(cols), rough=.7, bump=.2)); 
                if R() < .12: b.rotation_euler = (0, .25, 0)
                x += t + .012
    box(-1.0, 1.0, 4.9, 4.96, 2.2, 4.4, glow((.06, .10, .30), .9)); 
    for b in (-.34, .34): box(b - .04, b + .04, 4.86, 4.92, 2.2, 4.4, wd)
    for z in (2.9, 3.65): box(-1, 1, 4.86, 4.92, z, z + .07, wd)
    ir = mat((.07, .06, .05), metal=.8, rough=.4); cyl(0, .4, 3.5, 5.2, .02, ir, seg=6); cyl(0, .4, 3.2, 3.5, .22, ir, r2=.08, seg=10); ball(0, .4, 3.22, .15, glow((1, .72, .32), 24)); lamp(0, .4, 3.0, 520, (1, .68, .32), .2)
    box(3.9, 4.5, .2, .8, 0, .5, wd); box(3.9, 4.5, .7, .8, .5, 1.3, wd)
    world((.02, .018, .028), 1.0)
    if close: camera((-1.9, -.6, 1.8), (4.6, 4.6, 2.3), 38)
    else: camera((0, -5.6, 2.6), (0, 3, 1.25), 24)
def dark(): cabinet(True); lamp(1.5, 2.6, 2.4, 260, (1, .66, .3), .2)

def tent():   # la tente du général, la veille de la bataille : table, carte, lanterne, lit de camp
    cv = mat((.50, .41, .27), rough=.95, bump=.5, scale=10, var=.35); cvd = mat((.36, .28, .18), rough=.95, bump=.5, scale=10); wd = mat(WOOD, rough=.7, bump=.5, scale=5); wdd = mat(WOOD_D, rough=.8, bump=.5); gr = mat((.20, .15, .09), rough=1, bump=.8, scale=3, var=.4)
    box(-9, 9, -8, 9, -.2, 0, gr); rug = mat((.34, .07, .06), rough=1, bump=.3, scale=40); box(-2.6, 2.6, -1.5, 3.2, 0, .02, rug)
    N = 16; H = 5.6; Rr = 6.2; vs = [(0, 1, H)]; fs = []
    for i in range(N): a = i / N * 2 * math.pi; vs += [(math.cos(a) * Rr, 1 + math.sin(a) * Rr, 2.1), (math.cos(a) * Rr * 1.02, 1 + math.sin(a) * Rr * 1.02, 0)]
    for i in range(N):
        j = (i + 1) % N; a = 1 + i * 2; b = 1 + j * 2
        if i == 3: fs.append((0, a, b)); continue     # l'ouverture, au fond à droite du mât
        fs.append((0, b, a)); fs.append((a, b, b + 1, a + 1))
    o = mesh(vs, fs, cv); 
    for p in o.data.polygons: p.use_smooth = False
    cyl(0, 1, 0, H, .09, wdd, seg=8)
    for i in range(N): a = i / N * 2 * math.pi; cyl(math.cos(a) * Rr * .99, 1 + math.sin(a) * Rr * .99, 0, 2.1, .04, wdd, seg=5)
    box(-1.5, 1.5, 1.6, 3.0, .86, .94, wd); 
    for x in (-1.4, 1.25): 
        for y in (1.7, 2.75): box(x, x + .15, y, y + .15, 0, .86, wdd)
    mp = mat((.74, .66, .46), rough=.9, bump=.15, scale=20); box(-1.1, 1.0, 1.75, 2.85, .94, .95, mp); 
    for i in range(9): b = box(-.05, .05, -.05, .05, 0, .09, mat(random.choice([(.5, .06, .05), (.08, .14, .4)]), rough=.6)); b.location = (U(-.9, .8), U(1.9, 2.7), .95)
    ir = mat((.07, .06, .05), metal=.8, rough=.4); cyl(1.15, 2.0, .94, 1.0, .09, ir, seg=8); cyl(1.15, 2.0, 1.0, 1.26, .07, glow((1, .74, .34), 16), seg=8); cyl(1.15, 2.0, 1.26, 1.34, .09, ir, r2=.03, seg=8); lamp(1.15, 1.9, 1.5, 700, (1, .68, .3), .1)
    box(-5.2, -3.2, 2.2, 4.4, .3, .42, cvd); 
    for (x, y) in ((-5.1, 2.3), (-3.4, 2.3), (-5.1, 4.2), (-3.4, 4.2)): box(x, x + .12, y, y + .12, 0, .3, wdd)
    box(-5.1, -4.4, 3.5, 4.3, .42, .56, mat((.40, .06, .05), rough=1))
    for i in range(3): c = cyl(3.9 + i * .22, 4.6, 0, 2.2, .03, wdd, seg=5); c.rotation_euler = (.12, 0, 0)
    box(3.7, 4.6, 4.4, 4.7, .9, 1.0, wdd); sh = cyl(4.6, 3.7, .0, .9, .5, mat((.30, .06, .05), rough=.5, metal=.3), seg=14); sh.rotation_euler = (1.4, 0, .6); sh.location = (4.6, 3.7, .5)
    box(2.9, 3.9, 1.0, 1.7, 0, .6, wd); box(2.85, 3.95, .95, 1.75, .6, .68, wdd)
    world((.012, .014, .03), 1.0); lamp(-2.5, -2, 3.6, 500, (.5, .6, 1.0), 2); camera((-.6, -3.9, 1.5), (.5, 3, 1.85), 20)

globals()[name]()
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = int(96 * min(1, SCALE * 1.2)) if name not in ('hall',) else int(180 * min(1, SCALE * 1.2)); sc.cycles.max_bounces = 5; sc.cycles.transparent_max_bounces = 24
try: sc.cycles.use_denoising = True
except Exception: pass
sc.render.resolution_x = int(1600 * SCALE); sc.render.resolution_y = int(800 * SCALE); sc.render.resolution_percentage = 100
sc.render.film_transparent = name in ('dawn', 'bridge', 'field', 'tent'); sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
sc.view_settings.view_transform = 'Filmic' if 'Filmic' in [i.identifier for i in type(sc.view_settings).bl_rna.properties['view_transform'].enum_items] else 'AgX'; sc.view_settings.look = 'None'
sc.render.filepath = out; bpy.ops.render.render(write_still=True); print('DONE', name)
