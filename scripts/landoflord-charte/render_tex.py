# Décors de la charte : murs, sols et plafonds modélisés puis rendus avec la même lumière que les personnages.
# usage : python render_tex.py nom outdir     (nom = t_stone, f_stone, c_stone, ...)
import bpy, bmesh, sys, math, os, random
from mathutils import Vector, Matrix, Euler

name, out = sys.argv[1], sys.argv[2]
kind, theme = name[0], name[2:]
VAR = kind == 'u'   # u_* : seconde variante d'un mur
if VAR: kind = 't'
W = 2.9; PX = 128; MG = 16; SS = 3
random.seed(hash(name) % 9999 if False else sum(ord(c) * (i + 3) for i, c in enumerate(name)))
R = random.random
U = lambda a, b: a + (b - a) * R()

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
col = sc.collection

# ---------- matières ----------
_m = {}
def mat(rgb, rough=.85, metal=0, grain=.35, gscale=14, bump=.35, stretch=(1, 1, 1), spots=0, spotcol=(0, 0, 0)):
    key = (tuple(round(c, 3) for c in rgb), rough, metal, grain, gscale, bump, stretch, spots, spotcol)
    if key in _m: return _m[key]
    m = bpy.data.materials.new('M'); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    o = nt.nodes.new('ShaderNodeOutputMaterial'); b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    geo = nt.nodes.new('ShaderNodeNewGeometry'); mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = stretch
    nt.links.new(geo.outputs['Position'], mp.inputs['Vector'])
    n = nt.nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = gscale; n.inputs['Detail'].default_value = 5; n.inputs['Roughness'].default_value = .65
    nt.links.new(mp.outputs['Vector'], n.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeValToRGB'); e = ramp.color_ramp.elements
    e[0].position = .28; e[0].color = (1 - grain * 1.6,) * 3 + (1,); e[1].position = .72; e[1].color = (1 + grain * .9,) * 3 + (1,)
    nt.links.new(n.outputs['Fac'], ramp.inputs['Fac'])
    mix = nt.nodes.new('ShaderNodeMixRGB'); mix.blend_type = 'MULTIPLY'; mix.inputs['Fac'].default_value = 1; mix.inputs['Color1'].default_value = (*rgb, 1)
    nt.links.new(ramp.outputs['Color'], mix.inputs['Color2']); last = mix.outputs['Color']
    if spots:
        n2 = nt.nodes.new('ShaderNodeTexNoise'); n2.inputs['Scale'].default_value = 2.2; n2.inputs['Detail'].default_value = 4
        nt.links.new(geo.outputs['Position'], n2.inputs['Vector'])
        r2 = nt.nodes.new('ShaderNodeValToRGB'); r2.color_ramp.elements[0].position = .52; r2.color_ramp.elements[0].color = (0, 0, 0, 1); r2.color_ramp.elements[1].position = .66; r2.color_ramp.elements[1].color = (spots,) * 3 + (1,)
        nt.links.new(n2.outputs['Fac'], r2.inputs['Fac'])
        m2 = nt.nodes.new('ShaderNodeMixRGB'); m2.inputs['Color2'].default_value = (*spotcol, 1)
        nt.links.new(r2.outputs['Color'], m2.inputs['Fac']); nt.links.new(last, m2.inputs['Color1']); last = m2.outputs['Color']
    nt.links.new(last, b.inputs['Base Color'])
    bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = bump; bp.inputs['Distance'].default_value = .02
    nt.links.new(n.outputs['Fac'], bp.inputs['Height']); nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
    nt.links.new(b.outputs['BSDF'], o.inputs['Surface'])
    _m[key] = m; return m
def emit(rgb, strength=1):
    m = bpy.data.materials.new('E'); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    o = nt.nodes.new('ShaderNodeOutputMaterial'); e = nt.nodes.new('ShaderNodeEmission'); e.inputs[0].default_value = (*rgb, 1); e.inputs[1].default_value = strength
    nt.links.new(e.outputs[0], o.inputs[0]); return m
def vary(rgb, dv=.18, dh=.05):
    k = 1 + U(-dv, dv); return (max(0, rgb[0] * k * (1 + U(-dh, dh))), max(0, rgb[1] * k), max(0, rgb[2] * k * (1 + U(-dh, dh))))

# ---------- formes ----------
def obj(me, m=None):
    o = bpy.data.objects.new('o', me); col.objects.link(o)
    if m: me.materials.append(m)
    return o
_chis = None
def box(cx, cy, cz, sx, sy, sz, m, bevel=0, rot=(0, 0, 0), chisel=0):
    global _chis
    me = bpy.data.meshes.new('b'); bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    if bevel: bmesh.ops.bevel(bm, geom=bm.edges[:] + bm.verts[:], offset=min(bevel, min(sx, sy, sz) * .45), segments=2, affect='EDGES', profile=.6)
    if chisel:
        cuts = max(2, int(max(sx, sy, sz) / .07))
        bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=min(cuts, 10), use_grid_fill=True)
    bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = bevel > 0
    o = obj(me, m); o.location = (cx, cy, cz); o.rotation_euler = rot
    if chisel:
        if _chis is None:
            _chis = bpy.data.textures.new('ch', 'CLOUDS'); _chis.noise_scale = .16; _chis.noise_depth = 2
        d = o.modifiers.new('d', 'DISPLACE'); d.texture = _chis; d.strength = chisel; d.texture_coords = 'GLOBAL'; d.mid_level = .5
    return o
def cyl(x, y, z0, z1, r, m, r2=None, seg=14, axis='z'):
    me = bpy.data.meshes.new('c'); bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=abs(z1 - z0))
    bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    o = obj(me, m)
    if axis == 'z': o.location = (x, y, (z0 + z1) / 2)
    elif axis == 'x': o.rotation_euler = (0, math.radians(90), 0); o.location = ((z0 + z1) / 2, y, x)
    elif axis == 'y': o.rotation_euler = (math.radians(90), 0, 0); o.location = (x, (z0 + z1) / 2, y)
    return o
def surface(m, amp=.05, scale=.5, res=90, wall=True, z=0.0, extra=0.6):
    """Plan subdivisé déplacé par un bruit : roche, terre, enduit, toile."""
    me = bpy.data.meshes.new('s'); bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=res, y_segments=res, size=(W + 2 * extra) / 2)
    bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    o = obj(me, m)
    if wall: o.rotation_euler = (math.radians(90), 0, 0); o.location = (W / 2, z, W / 2)
    else: o.location = (W / 2, W / 2, z)
    if amp:
        t = bpy.data.textures.new('t', 'CLOUDS'); t.noise_scale = scale; t.noise_depth = 3
        d = o.modifiers.new('d', 'DISPLACE'); d.texture = t; d.strength = amp; d.texture_coords = 'GLOBAL'
    return o
def per_x(make, x, w):
    """Répète un objet qui déborde à gauche ou à droite pour que le motif boucle."""
    make(x)
    if x - w / 2 < 0.0 + 1e-6: make(x + W)
    if x + w / 2 > W - MGm - 1e-6 or x + w / 2 > W: make(x - W)
MGm = W * MG / PX
def wall_blocks(rows, wr, cols_, depth=.10, bevel=.03, gap=.022, jit=.02, chisel=0, rough=.9, grain=.38, gscale=16, bump=.5, spots=0, spotcol=(0, 0, 0), z0=0.0, z1=None, mortar=(.02, .018, .016), dv=.2):
    z1 = W if z1 is None else z1
    box(W / 2, depth * .1, (z0 + z1) / 2, W * 1.6, .02, z1 - z0, mat(mortar, grain=.2))
    z = z0; ri = 0
    while z < z1 - 1e-6:
        h = min(rows[ri % len(rows)], z1 - z); x = -U(0, wr[1]); xs = []
        while x < W:
            w = U(*wr); xs.append((x, w)); x += w
        # dernière pierre ajustée pour boucler exactement
        tot = xs[-1][0] + xs[-1][1] - xs[0][0]; k = W / tot; x = xs[0][0] * k
        for (_, w) in xs:
            w *= k; c = random.choice(cols_); m = mat(vary(c, dv), rough=rough, grain=grain, gscale=gscale, bump=bump, spots=spots, spotcol=spotcol)
            dy = U(-jit, jit); rz = U(-jit, jit) * .6
            for xx in (x, x + W, x - W):
                if xx + w < -MGm - .01 or xx > W + .01: continue
                box(xx + w / 2, dy, z + h / 2, w - gap, depth, h - gap, m, bevel, (0, 0, rz), chisel)
            x += w
        z += h; ri += 1
def floor_slabs(rows, wr, cols_, depth=.08, bevel=.02, gap=.02, jit=.008, chisel=0, rough=.85, grain=.35, gscale=16, bump=.4, mortar=(.02, .018, .016), dv=.16, stagger=True, spots=0, spotcol=(0, 0, 0)):
    box(W / 2, W / 2, -depth * .4, W * 1.6, W * 1.6, .02, mat(mortar, grain=.2))
    n = len(rows); hs = [W * r / sum(rows) for r in rows]; y = 0
    for ri, h in enumerate(hs):
        x = -U(0, wr[1]) if stagger else 0; xs = []
        while x < W - 1e-6:
            w = U(*wr); xs.append((x, w)); x += w
        tot = xs[-1][0] + xs[-1][1] - xs[0][0]; k = W / tot; x = xs[0][0] * k
        for (_, w) in xs:
            w *= k; m = mat(vary(random.choice(cols_), dv), rough=rough, grain=grain, gscale=gscale, bump=bump, spots=spots, spotcol=spotcol); dz = U(-jit, jit)
            for xx in (x, x + W, x - W):
                for yy in (y, y + W, y - W):
                    if xx + w < -MGm - .01 or xx > W + .01 or yy + h < -MGm - .01 or yy > W + .01: continue
                    box(xx + w / 2, yy + h / 2, dz, w - gap, h - gap, depth, m, bevel, (0, 0, 0), chisel)
            x += w
        y += h
def leaves(n, region, cols_, size=(.07, .16), ydepth=(-.12, .0), wall=True, droop=0):
    """Nuée de feuilles (losanges) dans une zone ; un maillage par teinte."""
    for c in cols_:
        me = bpy.data.meshes.new('l'); vs = []; fs = []
        for i in range(n // len(cols_)):
            x = U(region[0], region[2]); z = U(region[1], region[3]); y = U(*ydepth); s = U(*size)
            rot = Euler((U(-.9, .9) + (math.radians(90) if wall else 0), U(-.6, .6), U(0, 6.28))).to_matrix()
            pts = [Vector((-s * .5, 0, 0)), Vector((0, s * .28, 0)), Vector((s * .5, 0, 0)), Vector((0, -s * .28, 0))]
            for dx in (0, W, -W):
                if x + dx < -MGm - .2 or x + dx > W + .2: continue
                b = len(vs)
                for p in pts:
                    q = rot @ p; vs.append((x + dx + q.x, y + q.y, z + q.z) if wall else (x + dx + q.x, z + q.y, -y + q.z))
                fs.append((b, b + 1, b + 2, b + 3))
        me.from_pydata(vs, [], fs); obj(me, mat(c, rough=.6, grain=.25, gscale=30, bump=.1))
def pebbles(n, cols_, size=(.03, .09), flat=.45):
    for i in range(n):
        x, y, s = U(0, W), U(0, W), U(*size); m = mat(vary(random.choice(cols_), .25), grain=.3, gscale=30)
        for dx in (0, W, -W):
            for dy in (0, W, -W):
                if x + dx < -MGm - .1 or x + dx > W + .1 or y + dy < -MGm - .1 or y + dy > W + .1: continue
                me = bpy.data.meshes.new('p'); bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=2, radius=s)
                bmesh.ops.scale(bm, vec=(1, U(.6, 1), flat), verts=bm.verts); bm.to_mesh(me); bm.free()
                for p in me.polygons: p.use_smooth = True
                o = obj(me, m); o.location = (x + dx, y + dy, 0); o.rotation_euler = (0, 0, U(0, 6.28))

# ---------- couleurs de pierre et de bois de la charte ----------
GREY = (.15, .14, .13); GREY2 = (.12, .12, .125); CREAM = (.42, .33, .21); PALE = (.40, .375, .33); DARKB = (.10, .11, .14)
BRICK = (.30, .14, .08); SEW = (.10, .12, .09); WOOD = (.20, .11, .05); WOODD = (.10, .055, .028); EARTH = (.17, .11, .06); ROCK = (.19, .14, .10)
PLAST = (.46, .38, .25); CANVAS = (.42, .34, .21); G1 = (.05, .13, .03); G2 = (.09, .20, .05); G3 = (.03, .08, .03); MOSS = (.07, .13, .08)
def beam_frame():   # étais de mine : un poteau à cheval sur chaque bord, un chapeau en haut
    m = mat(WOOD, grain=.5, gscale=10, stretch=(6, 6, .5), bump=.6)
    for x in (0, W): box(x, -.09, W / 2, .30, .20, W, m, .02)
    box(W / 2, -.10, W - .16, W * 1.4, .24, .32, m, .02)
    for x in (.0, W):
        cyl(x + .0, -.215, W - .16, 0, .028, mat((.05, .05, .055), metal=1, rough=.5), axis='y') if False else None

# ---------- thèmes ----------
def t_stone():
    wall_blocks([.74, .70, .76, .70], (.62, 1.05), [GREY, GREY2, (.20, .18, .16)], depth=.22, bevel=.06, gap=.05, jit=.035, chisel=.05, bump=.8, grain=.4, gscale=22, spots=.6, spotcol=(.07, .07, .065), mortar=(.012, .011, .01))
def t_sewer():
    wall_blocks([.36, .37, .36, .37, .36, .36, .36, .36], (.5, .82), [SEW, (.12, .13, .11), (.09, .10, .10)], depth=.16, bevel=.04, gap=.04, jit=.025, chisel=.035, rough=.4, bump=.7, gscale=22, spots=.8, spotcol=(.04, .10, .035), mortar=(.008, .012, .008))
    leaves(120, (0, 0, W, .5), [MOSS, (.05, .10, .05)], size=(.05, .12), ydepth=(-.07, -.05))
def t_crypt():
    wall_blocks([.98, .96, .96], (.9, 1.5), [DARKB, (.12, .12, .15), (.09, .10, .12)], depth=.16, bevel=.04, gap=.03, jit=.018, chisel=.03, bump=.6, gscale=20, spots=.5, spotcol=(.04, .04, .06), mortar=(.006, .006, .01))
def t_mine():
    surface(mat((.13, .10, .075), grain=.3, gscale=5, bump=1.0, spots=.25, spotcol=(.08, .065, .055)), amp=.34, scale=.6)
    beam_frame()
def t_abbey():
    wall_blocks([.56, .56, .56, .56], (.8, 1.15), [CREAM, (.46, .36, .23), (.37, .30, .20)], depth=.12, bevel=.03, gap=.026, jit=.01, chisel=.014, bump=.4, grain=.25, gscale=20, z0=.30, z1=2.54, mortar=(.10, .075, .045), dv=.1)
    m = mat((.40, .32, .21), grain=.2, bump=.2)
    box(W / 2, -.05, .15, W * 1.5, .22, .30, m, .03); box(W / 2, -.08, 2.63, W * 1.5, .26, .12, m, .03); box(W / 2, -.04, 2.80, W * 1.5, .18, .22, m, .04)
def t_palace():
    wall_blocks([.74, .74, .74], (1.0, 1.45), [PALE, (.44, .41, .37), (.36, .34, .31)], depth=.10, bevel=.028, gap=.022, jit=.006, chisel=.008, bump=.3, grain=.2, gscale=20, z0=.34, z1=2.56, mortar=(.11, .10, .09), dv=.07)
    m = mat((.34, .32, .29), grain=.18, bump=.2); g = mat((.72, .48, .14), metal=1, rough=.4, grain=.2, bump=.1)
    box(W / 2, -.06, .17, W * 1.5, .24, .34, m, .03); box(W / 2, -.09, 2.62, W * 1.5, .28, .10, m, .03); box(W / 2, -.05, 2.80, W * 1.5, .2, .24, m, .04); box(W / 2, -.11, 2.705, W * 1.5, .22, .05, g, .01)
def t_panel():
    box(W / 2, .03, W / 2, W * 1.5, .04, W, mat(WOODD, grain=.45, gscale=8, stretch=(8, 8, .6), bump=.4))
    st = mat(WOOD, grain=.45, gscale=9, stretch=(8, 8, .6), bump=.4, rough=.55); st2 = mat((.25, .14, .07), grain=.45, gscale=9, stretch=(.6, 8, 8), bump=.4, rough=.55)
    g = mat((.72, .48, .14), metal=1, rough=.4, grain=.2, bump=.1)
    for x in (0, W / 2, W): box(x, -.03, W / 2, .20, .08, W, st, .015)
    for z, h in ((.14, .28), (1.02, .16), (2.52, .18), (2.80, .2)): box(W / 2, -.035, z, W * 1.5, .09, h, st2, .015)
    box(W / 2, -.085, 2.66, W * 1.5, .03, .035, g, .008)
    for x in (W / 4, 3 * W / 4):
        for z, h in ((.61, .50), (1.76, 1.16)): box(x, -.005, z, 1.06, .05, h, mat((.17, .09, .042), grain=.5, gscale=9, stretch=(8, 8, .6), bump=.4, rough=.5), .05)
def t_town():
    wall_blocks([.36, .36], (.5, .8), [(.20, .19, .17), (.25, .23, .21)], depth=.2, bevel=.05, gap=.04, chisel=.04, z0=0, z1=.72, bump=.7, gscale=22)
    surface(mat(PLAST, grain=.22, gscale=9, bump=.35, spots=.35, spotcol=(.40, .33, .22)), amp=.02, scale=.3, z=.0)
    b = mat(WOODD, grain=.5, gscale=10, stretch=(7, 7, .5), bump=.6); bh = mat(WOODD, grain=.5, gscale=10, stretch=(.5, 7, 7), bump=.6)
    for x in (0, W): box(x, -.06, 1.8, .26, .14, 2.2, b, .02)
    for z in (.80, 1.82, 2.80): box(W / 2, -.065, z, W * 1.5, .15, .20, bh, .02)
    for sx in (1, -1):
        o = box(W / 2 + sx * .72, -.05, 1.31, .16, .12, 1.25, b, .02); o.rotation_euler = (0, sx * math.radians(48), 0)
    if VAR:
        for sx in (1, -1):
            o = box(W / 2, -.05, 2.31, .14, .12, 2.6, b, .02); o.rotation_euler = (0, sx * math.radians(70), 0)
        return
    # fenêtre à meneaux sous la sablière haute
    box(W / 2, -.055, 2.31, .86, .14, .78, b, .02); box(W / 2, -.10, 2.31, .66, .06, .58, mat((.03, .04, .06), rough=.2, grain=.1, bump=0))
    box(W / 2, -.12, 2.31, .05, .05, .58, b, .01); box(W / 2, -.12, 2.31, .66, .05, .05, b, .01)
def t_camp():
    o = surface(mat(CANVAS, grain=.16, gscale=12, bump=.12, spots=.3, spotcol=(.30, .24, .15)), amp=0, res=160)
    for v in o.data.vertices:   # huit plis réguliers sur la largeur : le motif boucle
        x = v.co.x + W / 2; v.co.z += .07 * math.sin(2 * math.pi * 8 * x / W) + .02 * math.sin(2 * math.pi * 16 * x / W + 1)
    red = mat((.34, .04, .03), grain=.2, gscale=40, bump=.2)
    box(W / 2, -.10, W - .14, W * 1.5, .05, .28, red)
    n = 8
    for i in range(-1, n + 1):
        me = bpy.data.meshes.new('f'); x = (i + .5) * W / n; hw = W / n / 2
        me.from_pydata([(x - hw, -.10, W - .27), (x + hw, -.10, W - .27), (x, -.10, W - .52)], [], [(0, 1, 2)]); obj(me, red)
    box(W / 2, -.06, .13, W * 1.5, .06, .26, mat((.12, .08, .05), grain=.3, gscale=20))
    for x in (0, W): cyl(x, -.13, 0, W, .05, mat(WOOD, grain=.5, gscale=10, stretch=(6, 6, .5), bump=.5))
def t_field():
    sky = bpy.data.materials.new('sky'); sky.use_nodes = True; nt = sky.node_tree; nt.nodes.clear()
    o = nt.nodes.new('ShaderNodeOutputMaterial'); e = nt.nodes.new('ShaderNodeEmission'); geo = nt.nodes.new('ShaderNodeNewGeometry'); sp = nt.nodes.new('ShaderNodeSeparateXYZ'); mr = nt.nodes.new('ShaderNodeMapRange'); rp = nt.nodes.new('ShaderNodeValToRGB')
    mr.inputs[1].default_value = 0; mr.inputs[2].default_value = W; rp.color_ramp.elements[0].color = (.32, .42, .50, 1); rp.color_ramp.elements[1].color = (.14, .25, .44, 1)
    nt.links.new(geo.outputs['Position'], sp.inputs[0]); nt.links.new(sp.outputs['Z'], mr.inputs[0]); nt.links.new(mr.outputs[0], rp.inputs[0]); nt.links.new(rp.outputs[0], e.inputs[0]); nt.links.new(e.outputs[0], o.inputs[0])
    box(W / 2, .3, W / 2, W * 1.6, .02, W * 1.2, sky)
    n = 9
    for i in range(-1, n + 1):
        x = (i + .5) * W / n; r = W / n / 2 * .96; top = 2.25 + [.10, -.06, .14, .0, -.1, .08, -.02, .12, -.08][i % 9]
        m = mat(vary(WOOD, .2), grain=.55, gscale=9, stretch=(7, 7, .45), bump=.7)
        cyl(x, 0, 0, top, r, m); cyl(x, 0, top, top + .34, r, m, r2=.01)
    hb = mat(WOODD, grain=.5, gscale=9, stretch=(.5, 7, 7), bump=.6)
    for z in (.62, 1.72): box(W / 2, -.155, z, W * 1.5, .04, .15, hb, .012)
def trunks(xs, m, r=(.13, .2), lean=.05, y=-.02):
    for x in xs:
        rr = U(*r)
        for dx in (0, W, -W):
            o = cyl(x + dx, y, -0.1, W + .1, rr * 1.15, m, r2=rr * .8); o.rotation_euler = (0, (x * 7 % 1 - .5) * lean, 0)
            cyl(x + dx, y - .02, -.05, .22, rr * 1.9, m, r2=rr * 1.1)
def t_forest():
    box(W / 2, .25, W / 2, W * 1.6, .02, W * 1.2, mat((.012, .03, .012), grain=.3))
    leaves(900, (0, 0, W, W), [G3, (.02, .06, .02)], size=(.1, .22), ydepth=(.05, .2))
    trunks([.45, 1.45, 2.4], mat((.13, .085, .05), grain=.6, gscale=9, stretch=(7, 7, .4), bump=.9))
    leaves(1100, (0, 1.55, W, W + .1), [G1, G2, (.12, .24, .05)], size=(.09, .2), ydepth=(-.32, .0))
    leaves(260, (0, .55, W, 1.6), [G1, G2], size=(.08, .16), ydepth=(-.1, .12))
    leaves(420, (0, -.05, W, .5), [G1, G2, (.14, .22, .06)], size=(.07, .18), ydepth=(-.3, -.05))
def t_swamp():
    box(W / 2, .3, W / 2, W * 1.6, .02, W * 1.2, mat((.02, .035, .035), grain=.3))
    leaves(500, (0, 0, W, W), [(.03, .06, .05), (.02, .045, .04)], size=(.1, .25), ydepth=(.08, .25))
    trunks([.3, 1.25, 2.05], mat((.08, .075, .065), grain=.6, gscale=9, stretch=(7, 7, .4), bump=.9), r=(.09, .16), lean=.16)
    mm = mat((.10, .17, .11), grain=.3, gscale=30)
    for i in range(70):   # mousse pendante
        x = U(0, W); l = U(.3, 1.4); z1 = U(1.9, W + .1)
        for dx in (0, W, -W): cyl(x + dx, U(-.2, -.02), z1 - l, z1, .012, mm, r2=.003, seg=5)
    leaves(300, (0, 2.3, W, W + .1), [(.06, .12, .08), (.09, .15, .09)], size=(.08, .18), ydepth=(-.25, 0))
    leaves(260, (0, -.05, W, .35), [(.07, .12, .06), (.05, .09, .06)], size=(.08, .2), ydepth=(-.28, -.05))
def t_ruin():
    wall_blocks([.29] * 10, (.42, .72), [(.26, .19, .12), (.22, .17, .12), (.30, .21, .13), (.17, .15, .13)], depth=.16, bevel=.04, gap=.04, jit=.04, chisel=.04, bump=.8, gscale=22, spots=.7, spotcol=(.08, .08, .06), mortar=(.02, .017, .012), dv=.25)
    leaves(520, (0, 2.0, W, W + .1), [G1, G2, (.12, .22, .05)], size=(.07, .16), ydepth=(-.2, -.08))
    for i in range(9):   # lierre qui retombe
        x = U(0, W); l = U(.5, 1.5); leaves(46, (x - .09, W - .7 - l, x + .09, W - .5), [G1, G2], size=(.06, .13), ydepth=(-.16, -.08))
    leaves(160, (0, -.05, W, .3), [G1, (.10, .16, .06)], size=(.07, .16), ydepth=(-.2, -.08))

def f_stone(): floor_slabs([1, 1.15, .9, 1.05], (.5, .95), [GREY, GREY2, (.17, .16, .15)], depth=.14, bevel=.04, gap=.04, jit=.014, chisel=.03, bump=.7, gscale=22, spots=.5, spotcol=(.07, .07, .065), mortar=(.012, .011, .01))
def c_stone(): floor_slabs([1, 1, 1], (.8, 1.3), [(.085, .085, .085), (.07, .07, .078)], depth=.14, bevel=.04, gap=.04, jit=.014, chisel=.03, bump=.7, gscale=22)
def f_sewer():
    floor_slabs([1] * 6, (.3, .55), [SEW, (.11, .12, .11)], depth=.12, bevel=.04, gap=.035, chisel=.025, jit=.012, rough=.35, bump=.6, spots=.7, spotcol=(.04, .09, .04), mortar=(.01, .018, .012))
def c_sewer(): floor_slabs([1] * 6, (.5, .8), [(.07, .08, .07), (.08, .085, .08)], bevel=.02, rough=.5, bump=.6, spots=.5, spotcol=(.03, .07, .03))
def f_crypt(): floor_slabs([1, 1], (1.2, 1.7), [DARKB, (.12, .12, .15)], depth=.12, bevel=.03, gap=.03, chisel=.02, jit=.006, bump=.45, spots=.4, spotcol=(.05, .05, .07))
def c_crypt(): floor_slabs([1, 1, 1], (.9, 1.3), [(.06, .065, .085), (.07, .07, .09)], bevel=.02, jit=.006, bump=.5)
def f_mine():
    surface(mat(EARTH, grain=.5, gscale=9, bump=.9, spots=.5, spotcol=(.09, .06, .035)), amp=.07, scale=.35, wall=False)
    pebbles(46, [ROCK, (.24, .20, .16), (.13, .11, .09)])
def c_mine():
    surface(mat((.085, .065, .05), grain=.3, gscale=5, bump=1.0, spots=.25, spotcol=(.05, .04, .035)), amp=.3, scale=.6, wall=False)
    m = mat(WOODD, grain=.5, gscale=10, stretch=(.5, 7, 7), bump=.6)
    for y in (0, W): box(W / 2, y, .12, W * 1.5, .34, .2, m, .02)
def f_abbey():   # damier terre cuite et pierre claire
    box(W / 2, W / 2, -.03, W * 1.6, W * 1.6, .02, mat((.05, .04, .03)))
    n = 4; s = W / n
    for i in range(-1, n + 1):
        for j in range(-1, n + 1):
            c = (.34, .10, .06) if (i + j) % 2 else (.52, .44, .31)
            box((i + .5) * s, (j + .5) * s, U(-.003, .003), s - .018, s - .018, .06, mat(vary(c, .1), rough=.55, grain=.22, gscale=18, bump=.25), .012)
def c_abbey():   # plafond à solives
    box(W / 2, W / 2, -.1, W * 1.6, W * 1.6, .02, mat((.10, .06, .03), grain=.5, gscale=9, stretch=(.5, 8, 8), bump=.4))
    m = mat(WOOD, grain=.5, gscale=9, stretch=(8, .5, 8), bump=.5)
    for i in range(-1, 5): box((i + .5) * W / 4, W / 2, 0, .26, W * 1.6, .2, m, .02)
    m2 = mat(WOODD, grain=.5, gscale=9, stretch=(.5, 8, 8), bump=.5)
    for y in (0, W): box(W / 2, y, .08, W * 1.6, .34, .24, m2, .02)
def f_palace():
    box(W / 2, W / 2, -.03, W * 1.6, W * 1.6, .02, mat((.05, .045, .04)))
    n = 2; s = W / n
    for i in range(-1, n + 1):
        for j in range(-1, n + 1):
            box((i + .5) * s, (j + .5) * s, 0, s - .016, s - .016, .06, mat(vary((.50, .46, .40), .06), rough=.35, grain=.2, gscale=6, bump=.12, spots=.5, spotcol=(.36, .33, .30)), .012)
            box(i * s, j * s, .004, .42, .42, .06, mat((.10, .10, .12), rough=.3, grain=.2, gscale=8, bump=.1), .012, (0, 0, math.radians(45)))
def c_palace():   # plafond à caissons, sobre
    box(W / 2, W / 2, -.14, W * 1.6, W * 1.6, .02, mat((.20, .185, .16), grain=.2, bump=.2))
    m = mat((.30, .28, .245), grain=.18, bump=.2)
    for i in range(-1, 3):
        box(i * W / 2, W / 2, 0, .34, W * 1.6, .26, m, .04); box(W / 2, i * W / 2, 0, W * 1.6, .34, .26, m, .04)
def f_panel():
    box(W / 2, W / 2, -.04, W * 1.6, W * 1.6, .02, mat((.03, .02, .012)))
    n = 6; s = W / n
    for i in range(-1, n + 1):
        off = (i % 2) * W / 2
        for y0 in (-W + off, off, W + off, 2 * W + off - 2 * W):
            box((i + .5) * s, y0 + W / 2 - W / 2, U(-.003, .003), s - .014, W - .014, .05, mat(vary((.24, .13, .06), .16), rough=.4, grain=.5, gscale=9, stretch=(8, .5, 8), bump=.35), .008)
c_panel = c_abbey
def f_town():   # pavés
    floor_slabs([1] * 8, (.26, .44), [(.19, .18, .17), (.22, .21, .19), (.15, .145, .14), (.20, .17, .14)], depth=.14, bevel=.07, gap=.045, jit=.016, chisel=.02, bump=.6, gscale=22, mortar=(.03, .024, .018))
def grass(base, blades, n=1500, earth=EARTH):
    surface(mat(base, grain=.5, gscale=10, bump=.6, spots=.6, spotcol=earth), amp=.05, scale=.4, wall=False)
    leaves(n, (0, 0, W, W), blades, size=(.06, .16), ydepth=(-.06, -.005), wall=False)
def f_forest():
    grass((.05, .09, .03), [G1, G2, (.10, .17, .05)])
    leaves(120, (0, 0, W, W), [(.22, .12, .04), (.28, .18, .05)], size=(.08, .13), ydepth=(-.07, -.05), wall=False)
def f_field(): grass((.14, .13, .05), [(.20, .22, .07), (.28, .26, .09), (.13, .17, .05)], n=1300)
def f_swamp():
    grass((.035, .06, .045), [(.06, .11, .07), (.04, .08, .06)], n=700, earth=(.02, .03, .03))
    box(W / 2 + .5, W / 2, .012, 1.3, .9, .01, mat((.015, .03, .035), rough=.08, grain=.1, bump=.05), 0, (0, 0, .5))
def f_camp():
    surface(mat((.20, .14, .08), grain=.5, gscale=9, bump=.8, spots=.5, spotcol=(.11, .08, .045)), amp=.05, scale=.35, wall=False)
    leaves(260, (0, 0, W, W), [(.22, .20, .08), (.15, .16, .06)], size=(.06, .14), ydepth=(-.05, -.005), wall=False)
    pebbles(14, [ROCK, (.22, .19, .15)], size=(.02, .05))
def f_ruin():
    grass((.07, .10, .04), [G1, G2, (.13, .18, .06)], n=900)
    for i in range(7):
        x, y, s = U(.2, W - .2), U(.2, W - .2), U(.22, .42); box(x, y, -.01, s, s * U(.6, .9), .07, mat(vary((.24, .20, .15), .2), grain=.4, gscale=16, bump=.6), .03, (0, 0, U(0, 3)))


# =====================================================================
# Éléments de mur (o_*) et meubles (p_*) : mêmes matières, même lumière.
# Coordonnées « points » : grille 128 des murs (o_) ou 96 des meubles (p_), y vers le bas, comme dans le moteur.
# =====================================================================
IRON = (.07, .07, .078); IRON2 = (.13, .13, .14); BRASS = (.55, .36, .10); GOLD = (.80, .52, .14); STONE = (.20, .19, .17); STONE2 = (.27, .25, .22)
m_iron = lambda: mat(IRON, rough=.5, metal=1, grain=.25, gscale=40, bump=.2)
m_steel = lambda: mat((.40, .41, .44), rough=.4, metal=1, grain=.2, gscale=40, bump=.15)
m_brass = lambda: mat(BRASS, rough=.4, metal=1, grain=.2, gscale=40, bump=.1)
m_gold = lambda: mat(GOLD, rough=.32, metal=1, grain=.15, gscale=40, bump=.1)
m_wood = lambda c=WOOD, st=(7, 7, .5): mat(vary(c, .12), grain=.5, gscale=10, stretch=st, bump=.6)
m_stone = lambda c=STONE: mat(vary(c, .1), grain=.38, gscale=20, bump=.7, spots=.4, spotcol=(.11, .11, .10))
m_cloth = lambda c: mat(c, rough=.9, grain=.18, gscale=30, bump=.15)
m_dark = lambda: emit((.0045, .004, .0035), 1)
if kind == 'o': G_ = 128.0; UN = W / 128.0
elif kind == 'p':
    PSCL = {'chest': .36, 'chest_o': .36, 'barrel': .5, 'crate': .44, 'sacks': .42, 'table': .48, 'bed': .4, 'altar': .58, 'rack': .72, 'shelf': .82, 'fountain': .6, 'bell': .82, 'stele': .5, 'statue': .86, 'brazier': .52, 'well': .52, 'cart': .56, 'keg': .44, 'sac': .5, 'or': .5}
    SPANP = PSCL[theme] * W; G_ = 96.0; UN = SPANP / 96.0
else: UN = 1
def PXx(px): return px * UN if kind == 'o' else (px - 48) * UN
def PZz(py): return (128 - py) * UN if kind == 'o' else (90 - py) * UN
def bx(x0, y0, x1, y1, d0, d1, m, bevel=0, chisel=0, rot=(0, 0, 0)):
    """Boîte donnée par son rectangle en points (x0,y0)-(x1,y1) et sa profondeur d0..d1 (points, vers le spectateur)."""
    return box((PXx(x0) + PXx(x1)) / 2, -(d0 + d1) / 2 * UN, (PZz(y0) + PZz(y1)) / 2, abs(x1 - x0) * UN, abs(d1 - d0) * UN, abs(y1 - y0) * UN, m, bevel * UN, rot, chisel * UN)
def cy(x, y0, y1, r, d, m, r2=None, seg=12):   # cylindre vertical
    return cyl(PXx(x), -d * UN, PZz(y1), PZz(y0), r * UN, m, None if r2 is None else r2 * UN, seg) if PZz(y1) < PZz(y0) else cyl(PXx(x), -d * UN, PZz(y0), PZz(y1), r * UN, m, None if r2 is None else r2 * UN, seg)
def cyh(x0, x1, y, r, d, m, seg=10):          # cylindre horizontal (le long de x)
    me = bpy.data.meshes.new('c'); bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r * UN, radius2=r * UN, depth=abs(x1 - x0) * UN); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    o = obj(me, m); o.rotation_euler = (0, math.radians(90), 0); o.location = ((PXx(x0) + PXx(x1)) / 2, -d * UN, PZz(y)); return o
def cyd(x, y, r, d0, d1, m, seg=16, r2=None):  # cylindre vers le spectateur (disque, clou, moyeu)
    me = bpy.data.meshes.new('c'); bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r * UN, radius2=(r if r2 is None else r2) * UN, depth=abs(d1 - d0) * UN); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    o = obj(me, m); o.rotation_euler = (math.radians(90), 0, 0); o.location = (PXx(x), -(d0 + d1) / 2 * UN, PZz(y)); return o
def ball(x, y, r, d, m, sc=(1, 1, 1)):
    me = bpy.data.meshes.new('s'); bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=2, radius=r * UN); bmesh.ops.scale(bm, vec=sc, verts=bm.verts); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    o = obj(me, m); o.location = (PXx(x), -d * UN, PZz(y)); return o
def ring(x, y, r, t, d, m, rot=(0, 0, 0)):
    me = bpy.data.meshes.new('r'); bm = bmesh.new()
    # tore : cercle de sections
    n, k = 16, 6; vs = []
    for i in range(n):
        a = 2 * math.pi * i / n
        for j in range(k):
            b = 2 * math.pi * j / k; rr_ = (r + t * math.cos(b)) * UN
            vs.append(bm.verts.new((rr_ * math.cos(a), t * math.sin(b) * UN, rr_ * math.sin(a))))
    for i in range(n):
        for j in range(k):
            bm.faces.new((vs[i * k + j], vs[((i + 1) % n) * k + j], vs[((i + 1) % n) * k + (j + 1) % k], vs[i * k + (j + 1) % k]))
    bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    o = obj(me, m); o.location = (PXx(x), -d * UN, PZz(y)); o.rotation_euler = rot; return o
def arch_frame(x0=16, x1=112, yt=10, spring=46, dark=True, m=None):
    """Encadrement de pierre : deux piédroits et un arc de claveaux ; fond sombre derrière."""
    cx = (x0 + x1) / 2; rx = (x1 - x0) / 2; ry = spring - yt
    if dark: bx(x0, yt, x1, 128, .1, .4, m_dark())
    for sx in (x0 - 9, x1 - 1):
        for (a, b) in ((spring, 74), (74, 101), (101, 128)): bx(sx, a, sx + 10, b, 0, 7 + R() * 1.5, m or m_stone(), 1.6, 1.2)
    n = 9
    for i in range(n):
        a = math.pi * (i + .5) / n; px = cx - (rx + 4) * math.cos(a); py = spring - (ry + 4) * math.sin(a)
        o = bx(px - 8.6, py - 5.5, px + 8.6, py + 5.5, 0, 7 + R() * 1.5 + (2 if i == n // 2 else 0), m or m_stone(), 1.6, 1.2); o.rotation_euler = (0, a - math.pi / 2, 0)
def arch_h(px, x0=16, x1=112, yt=10, spring=46):   # hauteur du haut de l'ouverture à l'abscisse px
    cx = (x0 + x1) / 2; rx = (x1 - x0) / 2; t = max(-1, min(1, (px - cx) / rx)); return spring - (spring - yt) * math.sqrt(max(0, 1 - t * t))
def planks(x0, x1, ytop, d=2.5, bands=(36, 94), top=None):
    n = 6; w = (x1 - x0) / n
    for i in range(n):
        xa = x0 + i * w; yt_ = top(xa + w / 2) + 1 if top else ytop
        bx(xa + .4, yt_, xa + w - .4, 128, d - 2.4, d, m_wood(), .5)
    for y in bands:
        bx(x0, y, x1, y + 9, d, d + 1.6, m_iron(), .5)
        for x in range(int(x0) + 6, int(x1) - 2, 12): ball(x, y + 4.5, 1.7, d + 1.8, m_steel(), (1, .6, 1))
def o_door(lock=False):
    arch_frame(); planks(20, 108, 14, top=lambda x: arch_h(x, 20, 108, 15, 46))
    if lock:
        bx(53, 58, 75, 86, 4.1, 5.6, m_brass(), 1); cyd(64, 68, 3.2, 5.6, 5.9, m_dark()); bx(62.6, 69, 65.4, 79, 5.6, 5.9, m_dark())
    else:
        ring(92, 72, 6.5, 1.3, 5.6, m_steel()); cyd(92, 64, 3, 4.1, 6.4, m_iron())
def o_lock(): o_door(True)
def o_leaf(lock=False):
    n = 8; w = 128 / n
    for i in range(n): bx(i * w + .3, 0, (i + 1) * w - .3, 128, 0, 3, m_wood(), .5)
    for y in (14, 60, 106):
        bx(-2, y, 130, y + 9, 3, 4.6, m_iron(), .5)
        for x in range(8, 128, 14): ball(x, y + 4.5, 1.8, 4.8, m_steel(), (1, .6, 1))
    if lock:
        bx(52, 70, 76, 100, 3.1, 5, m_brass(), 1); cyd(64, 81, 3.4, 5, 5.3, m_dark()); bx(62.5, 82, 65.5, 93, 5, 5.3, m_dark())
    else:
        ring(100, 86, 8, 1.5, 5, m_steel()); cyd(100, 76, 3.2, 3, 5.6, m_iron())
def o_leafL(): o_leaf(True)
def o_gate():
    arch_frame()
    for x in range(24, 108, 12): cy(x + 2.5, 14, 128, 2.4, 3, m_steel(), seg=8)
    for y in (40, 78, 112): cyh(18, 110, y + 2.5, 2.2, 3.4, m_iron())
def o_grille():
    for x in range(6, 128, 17):
        cy(x + 3, 0, 122, 2.8, 3, m_steel(), seg=8); cy(x + 3, 122, 128, 2.8, 3, m_steel(), r2=.2, seg=8)
    for y in (10, 50, 90): cyh(-2, 130, y + 3, 2.6, 3.6, m_iron())
def o_torch(f=0):
    bx(54, 60, 74, 64, 0, 9, m_iron(), .6); cy(64, 62, 92, 6, 7, m_iron(), r2=3); bx(62, 90, 66, 99, 0, 8, m_iron(), .5)
    for (mm, r, h, dx, d) in ((emit((.95, .22, .03), 1.6), 7.5, 17 + f * 2, f * 1.6 - .8, 7), (emit((1.0, .55, .08), 2.2), 5.0, 11 - f, .6 - f, 9.5), (emit((1.0, .85, .40), 3.0), 2.6, 5.5, 0, 11.5)):
        o = ball(64 + dx, 60 - h * .78, r, d, mm, (1, .8, h / r)); o.rotation_euler = (0, math.radians(dx * 5), 0)
        ball(64 + dx * 1.4, 60 - h * 1.62, r * .42, d, mm, (1, .8, 2.0))
    l = bpy.data.lights.new('pt', 'POINT'); l.energy = 40; l.color = (1, .6, .25); l.shadow_soft_size = .1; lo = bpy.data.objects.new('pt', l); col.objects.link(lo); lo.location = (PXx(64), -16 * UN, PZz(46))
def o_torch0(): o_torch(0)
def o_torch1(): o_torch(1)
def o_lever(down=False):
    bx(50, 38, 78, 94, 0, 3, m_iron(), 1.2); bx(53, 41, 75, 91, 3, 4.2, mat(IRON2, rough=.5, metal=1, grain=.25, gscale=40, bump=.2), 1); bx(62, 46, 66, 86, 4.2, 4.5, m_dark())
    y = 80 if down else 50; me = bpy.data.meshes.new('a'); bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=2.3 * UN, radius2=2.3 * UN, depth=1); bm.to_mesh(me); bm.free()
    a = Vector((PXx(64), -4 * UN, PZz(66))); b = Vector((PXx(64), -17 * UN, PZz(y))); o = obj(me, m_wood((.26, .15, .07))); o.location = (a + b) / 2; o.scale = (1, 1, (b - a).length); o.rotation_euler = (b - a).to_track_quat('Z', 'Y').to_euler()
    ball(64, y, 6, 17, m_gold())
def o_lever0(): o_lever(False)
def o_lever1(): o_lever(True)
def o_niche(full=False):
    bx(36, 44, 92, 94, .1, .4, m_dark()); bx(39, 86, 89, 93, .4, 3.5, mat((.05, .045, .04), grain=.3))
    for (a, b, c, d) in ((32, 40, 96, 46), (32, 92, 96, 99), (32, 46, 38, 92), (90, 46, 96, 92)): bx(a, b, c, d, 0, 5, m_stone(STONE2), 1.4, 1)
    if full:
        bx(54, 76, 74, 91, .5, 12, m_gold(), 1.5); bx(54, 81, 74, 83, .5, 12.5, m_wood((.12, .07, .03)), .3); bx(62, 79, 66, 85, 12, 13, m_brass(), .5)
def o_niche0(): o_niche(True)
def o_niche1(): o_niche(False)
def o_btn(down=False):
    bx(55, 59, 73, 75, 0, .6, m_dark())
    bx(58, 62, 70, 72, 0, .8 if down else 3.2, m_stone((.12, .115, .10) if down else STONE2), .8)
def o_btn0(): o_btn(False)
def o_btn1(): o_btn(True)
def o_sign():
    bx(28, 38, 96, 86, 0, 3, mat((.42, .39, .33), grain=.25, gscale=20, bump=.4), 1.2)
    for i in range(5): bx(36, 46 + i * 7, 88 - ((i * 13) % 17), 48 + i * 7, 3, 3.25, mat((.05, .04, .03), grain=0, bump=0))
    for (x, y) in ((32, 42), (92, 42), (32, 82), (92, 82)): ball(x, y, 1.6, 3.2, m_iron(), (1, .6, 1))
def o_shop(inn=False):
    o_door(False)
    cyh(80, 120, 20, 1.5, 14, m_iron()); bx(118, 14, 121, 26, 0, 16, m_iron(), .5)
    for x in (90, 110): cy(x, 20, 27, .8, 14, m_iron(), seg=6)
    bx(84, 26, 116, 50, 12.5, 15.5, m_wood((.30, .17, .08), (.5, 7, 7)), 1.2)
    if inn:
        cy(99, 31, 45, 5.5, 17, mat((.62, .56, .46), rough=.5, grain=.15), seg=14); ring(105, 38, 4, 1, 17, mat((.62, .56, .46), rough=.5, grain=.15)); cyd(99, 30.5, 5.6, 14, 20, mat((.9, .88, .8), grain=.1), seg=14) if False else ball(99, 31, 5.6, 17, mat((.85, .83, .76), grain=.1), (1, 1, .35))
    else:
        cyd(100, 38, 8, 15.5, 17, m_gold(), seg=20); cyd(100, 38, 4.5, 17, 17.5, m_brass(), seg=16)
def o_inn(): o_shop(True)
def flight(up=True, carpet=False):
    x0, x1, yt = 22, 106, 12
    arch_frame(x0, x1, yt, 44, dark=False)
    st = lambda: mat(vary((.26, .245, .22), .06), grain=.3, gscale=20, bump=.5)
    wallm = mat((.10, .095, .085), grain=.35, gscale=14, bump=.6)
    n = 11; run = 11.0; rise = 10.0 if up else -4.6
    for i in range(n):
        ytop = 128 - (i + 1) * rise if up else 126 + i * (-rise)
        d0 = -(i + 1) * run; d1 = -i * run
        bx(x0, ytop, x1, 128 + (0 if up else 140), d0, d1, st(), .6)
        if carpet: bx(64 - 20, ytop - .7, 64 + 20, ytop + 1, d0 - .2, d1 + .4, m_cloth((.34, .03, .03)))
    L_ = n * run + 30
    bx(x0 - 8, -160, x0, 300, -L_, 0, wallm); bx(x1, -160, x1 + 8, 300, -L_, 0, wallm); bx(x0 - 8, -170, x1 + 8, -160, -L_, 0, wallm); bx(x0 - 8, -170, x1 + 8, 300, -L_ - 4, -L_, m_dark())
    if up:
        l = bpy.data.lights.new('pt', 'POINT'); l.energy = 260; l.color = (1, .9, .68); l.shadow_soft_size = .3; lo = bpy.data.objects.new('pt', l); col.objects.link(lo); lo.location = (PXx(64), (n * run * .8) * UN, PZz(128 - n * rise - 40))
    else:
        l = bpy.data.lights.new('pt', 'POINT'); l.energy = 30; l.color = (1, .6, .3); l.shadow_soft_size = .2; lo = bpy.data.objects.new('pt', l); col.objects.link(lo); lo.location = (PXx(40), 34 * UN, PZz(80))
def o_flightU(): flight(True)
def o_flightD(): flight(False)
def o_flightUc(): flight(True, True)
def o_flightDc(): flight(False, True)
def o_deco_stone():   # chaînes et anneaux de geôle
    for x in (40, 88):
        cyd(x, 22, 4.5, 0, 2, m_iron()); ring(x, 22, 4, 1.2, 3, m_steel())
        for i, y in enumerate(range(30, 86, 8)): ring(x + math.sin(y) * 1.2, y, 3.6, 1.0, 3, m_steel() if i % 2 else m_iron(), (0, 0, math.radians(90) if i % 2 else 0)).scale = (.62, 1, 1)
        ring(x, 92, 6.2, 1.4, 3, m_steel())
def o_deco_abbey():   # bannière aux armes
    cyh(22, 102, 14, 2.4, 5, m_wood((.22, .13, .06), (.5, 7, 7))); 
    for x in (22, 102): ball(x, 14, 3.4, 5, m_brass())
    bx(30, 16, 94, 106, 3, 4, m_cloth((.36, .04, .035))); 
    for (a, b, c, d) in ((30, 16, 94, 20), (30, 16, 33, 106), (91, 16, 94, 106)): bx(a, b, c, d, 4, 4.4, m_cloth((.62, .42, .12)))
    for x in range(30, 94, 8):
        me = bpy.data.meshes.new('t'); me.from_pydata([(PXx(x), -3.5 * UN, PZz(106)), (PXx(x + 8), -3.5 * UN, PZz(106)), (PXx(x + 4), -3.5 * UN, PZz(114))], [], [(0, 1, 2)]); obj(me, m_cloth((.36, .04, .035)))
    g = m_cloth((.62, .42, .12)); bx(52, 52, 72, 82, 4, 4.5, g)
    for x in (50, 59, 68): bx(x, 44, x + 6, 53, 4, 4.5, g)
    bx(59, 66, 65, 82, 4.5, 4.8, m_cloth((.20, .02, .02)))
def o_deco_lamp():    # lanterne suspendue
    cy(64, 12, 40, .9, 6, m_iron(), seg=6); bx(54, 40, 74, 45, 0, 12, m_iron(), 1); bx(54, 72, 74, 78, 0, 12, m_iron(), 1)
    bx(57, 45, 71, 72, 1.5, 10.5, emit((1.0, .62, .18), 2.2))
    for x in (55.2, 63.2, 71.2): bx(x - .4, 45, x + 1.4, 72, .5, 11.5, m_iron())
    bx(60, 8, 68, 13, 0, 8, m_iron(), 1)
    l = bpy.data.lights.new('pt', 'POINT'); l.energy = 30; l.color = (1, .65, .3); l.shadow_soft_size = .1; lo = bpy.data.objects.new('pt', l); col.objects.link(lo); lo.location = (PXx(64), -22 * UN, PZz(58))


def rock(x, y, r, d, c=None, sq=(1, 1, 1)):
    me = bpy.data.meshes.new('k'); bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=2, radius=r * UN)
    for v in bm.verts: v.co *= 1 + U(-.22, .22)
    bmesh.ops.scale(bm, vec=sq, verts=bm.verts); bm.to_mesh(me); bm.free()
    o = obj(me, mat(vary(c or (.17, .14, .11), .22), grain=.4, gscale=18, bump=.9, spots=.4, spotcol=(.08, .07, .06))); o.location = (PXx(x), -d * UN, PZz(y)); o.rotation_euler = (U(0, 3), U(0, 3), U(0, 3)); return o
def o_frail():   # éboulis : un mur de blocs effondrés, des étais brisés ; on le reconnaît de loin
    bx(0, 0, 128, 128, .1, .5, m_dark())
    for row in range(9):
        y = 122 - row * 13; n = 8 - row // 3
        for i in range(n + 1):
            r = U(8.5, 12.5) - row * .35; rock(-4 + (i + U(-.25, .25)) * 136 / n + (row % 2) * 8, y + U(-3, 3), r, U(2, 9) + (8 - row) * .9, sq=(1.15, .8, .85))
    for i in range(14): rock(U(4, 124), U(116, 126), U(2.5, 5), U(12, 20), (.22, .19, .15))
    w = m_wood(WOODD)
    for (x0, y0, x1, y1, d) in ((20, 6, 58, 70, 13), (112, 2, 84, 52, 12)):
        me = bpy.data.meshes.new('a'); bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1); bmesh.ops.scale(bm, vec=(6 * UN, 6 * UN, 1), verts=bm.verts); bm.to_mesh(me); bm.free()
        a = Vector((PXx(x0), -d * UN, PZz(y0))); b = Vector((PXx(x1), -(d + 5) * UN, PZz(y1))); o = obj(me, w); o.location = (a + b) / 2; o.scale = (1, 1, (b - a).length); o.rotation_euler = (b - a).to_track_quat('Z', 'Y').to_euler()
def o_crack():   # mur fissuré : une lézarde ouverte sur du noir, des éclats au pied
    P = [(60, -2), (52, 26), (70, 46), (56, 74), (74, 98), (62, 130)]
    def seg(a, b, wd, m, d):
        cx, cy = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2; L = math.hypot(b[0] - a[0], b[1] - a[1]) * 1.08
        bx(cx - wd / 2, cy - L / 2, cx + wd / 2, cy + L / 2, d - .5, d, m, 0, 0, (0, math.atan2(a[0] - b[0], b[1] - a[1]), 0))
    for i in range(len(P) - 1):
        seg(P[i], P[i + 1], 10, mat((.30, .27, .23), grain=.3, gscale=20, bump=.6), .6); seg(P[i], P[i + 1], 6, m_dark(), .9)
    for (a, b) in (((70, 46), (94, 58)), ((56, 74), (32, 87)), ((52, 26), (38, 18))): seg(a, b, 5.5, mat((.30, .27, .23), grain=.3, gscale=20, bump=.6), .6); seg(a, b, 2.8, m_dark(), .9)
    for i in range(9): rock(U(40, 90), U(120, 126), U(2.2, 4.5), U(4, 14), (.24, .21, .18))
def o_secret():  # pierre pivotante : un seul moellon un peu en saillie, joint plus sombre ; il faut le chercher
    bx(39, 59, 87, 95, .1, .5, m_dark()); bx(40.5, 60.5, 85.5, 93.5, .5, 2.4, m_stone((.21, .20, .18)), 1.2, .8)
def o_hid():     # mur mobile commandé d'ailleurs : un joint fin dessine le panneau, deux griffures au pied
    k = mat((.012, .011, .01), grain=0, bump=0)
    for (a, b, c, d) in ((21, 12, 23.2, 128), (104.8, 12, 107, 128), (21, 12, 107, 14.2)): bx(a, b, c, d, .1, .45, k)
    for (a, b, c, d) in ((23.2, 14.2, 24.2, 128), (23.2, 14.2, 104.8, 15.2)): bx(a, b, c, d, .1, .4, mat((.34, .32, .28), grain=0, bump=0))
    for (a, b, c, d) in ((30, 124, 52, 125), (70, 125.5, 98, 126.5)): bx(a, b, c, d, .1, .4, mat((.30, .28, .25), grain=0, bump=0))

def frame4(x0, y0, x1, y1, m=None, t=6, d=5):
    for (a, b, c, e) in ((x0 - t, y0 - t, x1 + t, y0), (x0 - t, y1, x1 + t, y1 + t), (x0 - t, y0, x0, y1), (x1, y0, x1 + t, y1)): bx(a, b, c, e, 0, d, m or m_stone(STONE2), 1.4, 1)
def o_sig_crypte():   # ossuaire
    bx(26, 34, 102, 96, .1, .5, m_dark()); frame4(26, 34, 102, 96)
    bone = lambda: mat(vary((.50, .45, .34), .12), rough=.7, grain=.2, gscale=30, bump=.3)
    for r_ in range(3):
        for i in range(5 - (r_ % 2)):
            x = 35 + i * 15 + (r_ % 2) * 7.5; y = 88 - r_ * 17; ball(x, y, 6.6, 3, bone(), (1, .9, 1.05)); ball(x, y + 5.5, 4, 3.4, bone(), (1, .8, .7))
            for dx in (-2.4, 2.4): ball(x + dx, y + .3, 1.7, 8.4, m_dark(), (1, .5, 1.1))
            ball(x, y + 3.6, .9, 8.6, m_dark(), (1, .5, 1.3))
def o_sig_palais():   # blason aux armes d'Austrevie sur deux épées croisées
    for sgn in (1, -1):
        o = bx(62.4, 18, 65.6, 104, 2, 3, m_steel(), .4); o.rotation_euler = (0, sgn * math.radians(38), 0)
        o = bx(56, 92, 72, 95, 2, 3.4, m_brass(), .4); o.rotation_euler = (0, sgn * math.radians(38), 0); o.location = (PXx(64 - sgn * 21), -2.7 * UN, PZz(88))
    bx(42, 36, 86, 70, 3, 5.5, m_cloth((.06, .12, .32)), 1.5); cyd(64, 70, 22, 3, 5.5, m_cloth((.06, .12, .32)), seg=24)
    g = m_gold(); bx(56, 54, 72, 80, 5.5, 6.6, g, .5)
    for x in (55, 61.5, 68): bx(x, 47, x + 5, 55, 5.5, 6.6, g, .4)
    bx(61.5, 66, 66.5, 80, 6.6, 6.9, m_cloth((.03, .05, .14)))
    for (a, b, c, e) in ((40, 34, 88, 37),): bx(a, b, c, e, 3, 6, g, .6)
def o_sig_mine():     # râtelier d'outils
    bx(18, 30, 110, 37, 0, 4, m_wood((.22, .13, .06), (.5, 7, 7)), .8)
    for x in (30, 52, 76, 98): cyd(x, 33.5, 1.6, 4, 9, m_iron(), seg=8)
    cy(30, 36, 108, 1.7, 6, m_wood((.28, .17, .08)), seg=8); o = bx(16, 38, 44, 43, 4.5, 7.5, m_steel(), 1); o.rotation_euler = (0, math.radians(-8), 0)
    cy(52, 36, 100, 1.7, 6, m_wood((.28, .17, .08)), seg=8); bx(45, 96, 59, 116, 5, 7, m_steel(), 1.5)
    cy(76, 36, 60, .7, 6, m_iron(), seg=5); bx(69, 60, 83, 64, 1, 11, m_iron(), .8); bx(69, 82, 83, 86, 1, 11, m_iron(), .8); bx(71.5, 64, 80.5, 82, 2.5, 9.5, emit((.9, .42, .06), .6))
    for i in range(7): ring(98, 40 + i * 7, 3.2, .9, 6, m_steel() if i % 2 else m_iron(), (0, 0, math.radians(90) if i % 2 else 0)).scale = (.62, 1, 1)
def o_sig_egout():    # bouche d'égout
    cyd(64, 70, 26, 0, 6, m_stone((.16, .17, .15)), seg=22); cyd(64, 70, 19, 6, 6.3, m_dark(), seg=22)
    for x in (53, 64, 75): cy(x, 52, 88, 1.5, 6.6, m_iron(), seg=6)
    bx(58.5, 86, 69.5, 128, 6.2, 6.8, mat((.05, .16, .10), rough=.1, grain=.15, bump=.1)); bx(52, 122, 76, 128, 0, 9, mat((.05, .16, .10), rough=.1, grain=.15, bump=.1), 2)
    leaves(60, (PXx(40), PZz(100), PXx(88), PZz(88)), [MOSS, (.05, .10, .05)], size=(.04, .1), ydepth=(-.2, -.14))
def o_sig_geoles():   # soupirail grillagé
    bx(40, 14, 88, 46, .1, .5, emit((.10, .13, .20), 1)); frame4(40, 14, 88, 46)
    for x in (50, 64, 78): cy(x, 14, 46, 1.9, 2.5, m_iron(), seg=8)
    cyh(40, 88, 30, 1.7, 3, m_iron())
    for i in range(7): bx(34 + i * 5, 84, 35.2 + i * 5, 98, .1, .4, mat((.03, .028, .025), grain=0, bump=0))
    o = bx(30, 90.4, 66, 91.6, .1, .45, mat((.03, .028, .025), grain=0, bump=0)); o.rotation_euler = (0, math.radians(-14), 0)
def o_sig_abbaye():   # niche au saint
    bx(44, 30, 84, 104, .1, .5, m_dark()); frame4(44, 30, 84, 104, m_stone((.36, .30, .21))); cyd(64, 30, 20, 0, 5, m_stone((.36, .30, .21)), seg=20); cyd(64, 31, 15, 5, 5.3, m_dark(), seg=20)
    s_ = m_stone((.40, .36, .28)); cy(64, 54, 100, 9, 4, s_, r2=6.5, seg=12); ball(64, 46, 6.5, 4, s_, (.9, .9, 1.1)); ball(64, 57, 9.5, 4, s_, (1, .6, .5)); bx(58, 100, 70, 104, 1, 9, s_, 1)
    cy(77, 92, 103, 1.3, 7, mat((.72, .68, .58), grain=.1), seg=8); ball(77, 90, 1.7, 7, emit((1, .6, .15), 2.2), (.8, .8, 1.6))
def o_sig_camp():     # écu et lances croisées
    for sgn in (1, -1):
        o = cy(64, 10, 112, 1.5, 2, m_wood((.26, .16, .08)), seg=8); o.rotation_euler = (0, sgn * math.radians(34), 0)
    cyd(64, 62, 24, 2.5, 5, m_wood((.30, .05, .04)), seg=24); ring(64, 62, 24, 1.6, 4.5, m_iron()); cyd(64, 62, 6, 5, 8, m_steel(), seg=14, r2=2)
# ---------- meubles (grille 96, sol à y = 90) ----------
def dz(w): return w * .62   # profondeur par défaut d'un meuble de largeur w
def pb(x0, y0, x1, y1, m, depth=None, bevel=.8, front=0, chisel=0):
    d = (x1 - x0) * .62 if depth is None else depth; return bx(x0, y0, x1, y1, front - d / 2, front + d / 2, m, bevel, chisel)
def p_chest(open_=False):
    w = m_wood((.24, .13, .06), (.5, 7, 7)); pb(22, 58, 74, 90, w, 30)
    for x in (30, 62): pb(x, 57, x + 4, 90, m_iron(), 31.5, .3)
    pb(21, 70, 75, 73, m_iron(), 31.5, .3)
    if open_:
        pb(22, 28, 74, 58, w, 5, .8, -14)
        for x in (30, 62): pb(x, 27, x + 4, 58, m_iron(), 6, .3, -14)
        pb(25, 55, 71, 59, m_dark(), 26)
        for (x, y) in ((38, 57), (50, 56), (58, 57), (44, 56)): ball(x, y, 5, 2 + R() * 6 - 4, m_gold(), (1, 1, .45))
    else:
        o = cyh(22, 74, 58, 15, 0, w, seg=18); o.scale = (.5, 1, 1)
        for x in (32, 64): cyh(x - 2, x + 2, 58, 15.4, 0, m_iron(), seg=18).scale = (.5, 1, 1)
        pb(44, 55, 52, 66, m_brass(), 2, .5, 15.5)
def p_chest_o(): p_chest(True)
def p_barrel():
    o = cy(48, 38, 90, 20, 0, m_wood((.26, .15, .07)), seg=20)
    for y in (46, 62, 80): cy(48, y - 1.5, y + 1.5, 20.6, 0, m_iron(), seg=20)
    cy(48, 37, 39, 18, 0, m_wood(WOODD), seg=20)
def p_keg():
    cy(48, 50, 90, 18, 0, m_wood((.16, .09, .04)), seg=20)
    for y in (58, 79): cy(48, y - 1.5, y + 1.5, 18.6, 0, m_iron(), seg=20)
    pb(40, 66, 56, 74, m_cloth((.42, .05, .04)), 1, .2, 18.3); cy(54, 38, 50, .8, 0, m_cloth((.5, .42, .3)), seg=5); ball(54, 37, 2.2, 0, emit((1, .6, .15), 2.5))
def p_crate():
    w = m_wood((.30, .19, .09)); pb(24, 46, 72, 90, w, 44, .6)
    f = m_wood((.14, .08, .04))
    for (a, b, c, d) in ((24, 46, 72, 50), (24, 86, 72, 90), (24, 46, 28, 90), (68, 46, 72, 90)): pb(a, b, c, d, f, 1.6, .3, 22.6)
    for sgn in (1, -1):
        o = pb(46, 44, 50, 92, f, 1.4, .3, 22.5); o.rotation_euler = (0, sgn * math.radians(46), 0)
def p_sacks():
    for (x, y, r, d) in ((36, 78, 14, 2), (60, 78, 14, -3), (48, 62, 13, 0)):
        ball(x, y, r, d, m_cloth(vary((.40, .31, .18), .1)), (1, .9, .85)); ball(x, y - r * .85, 3.2, d, m_cloth((.2, .15, .08)))
def p_table():
    w = m_wood((.22, .13, .06), (.5, 7, 7)); pb(16, 54, 80, 61, w, 40, 1)
    for x in (20, 72):
        for d in (-15, 15): pb(x, 61, x + 5, 90, m_wood(WOODD), 5, .5, d)
    cy(38, 44, 54, 4, 4, mat((.55, .52, .46), rough=.4, grain=.15), seg=12); ball(58, 52.5, 7, -4, m_cloth((.42, .08, .06)), (1, 1, .3)); ball(27, 52, 4, 8, m_cloth((.55, .40, .18)), (1, 1, .7))
def p_bed():
    w = m_wood(WOODD, (.5, 7, 7)); pb(14, 70, 82, 78, w, 44); pb(14, 54, 82, 90, w, 4, .5, -22); pb(14, 66, 82, 90, w, 3, .5, 22)
    pb(17, 63, 79, 71, m_cloth((.50, .42, .28)), 40, 2); pb(19, 59, 37, 66, m_cloth((.70, .66, .56)), 30, 3, -4); pb(40, 61.5, 79.5, 71, m_cloth((.30, .06, .06)), 41, 2)
def p_altar():
    s = lambda: m_stone((.34, .32, .28)); pb(24, 50, 72, 90, s(), 30, 1.5, 0, 1); pb(18, 44, 78, 51, s(), 36, 1.5, 0, .8)
    pb(30, 51, 66, 84, m_cloth((.36, .04, .04)), 1, .2, 15.5); pb(46, 56, 50, 78, m_gold(), .8, .2, 16.2); pb(40, 62, 56, 66, m_gold(), .8, .2, 16.2)
    for x in (27.5, 68.5):
        cy(x, 32, 44, 1.6, 6, mat((.72, .68, .58), rough=.5, grain=.1), seg=8); ball(x, 30, 2, 6, emit((1, .65, .2), 2.5), (.8, .8, 1.5))
def p_rack():
    w = m_wood(WOODD)
    for x in (18, 74): pb(x, 24, x + 4, 90, w, 6, .5)
    for y in (34, 70): pb(18, y, 78, y + 4, m_wood((.22, .13, .06), (.5, 7, 7)), 8, .5)
    for i, x in enumerate((30, 42, 54, 66)):
        cy(x, 22, 84, 1.0, 5, m_steel() if i != 2 else m_wood((.26, .16, .08)), seg=6); pb(x - 4, 62, x + 4, 64, m_brass(), 2, .3, 5)
        if i == 2: ball(x, 22, 2.6, 5, m_steel(), (.5, .5, 2.2))
        else: cy(x, 14, 22, 1.0, 5, m_steel(), r2=.1, seg=6)
def p_shelf():
    w = m_wood((.24, .14, .07)); pb(18, 14, 22, 90, w, 16, .4); pb(74, 14, 78, 90, w, 16, .4); pb(18, 12, 78, 16, w, 17, .4); pb(20, 14, 76, 90, m_wood(WOODD), 1, 0, -8)
    C = [(.36, .07, .06), (.08, .13, .30), (.16, .20, .08), (.50, .36, .10), (.22, .10, .18), (.42, .36, .26)]
    for y in (34, 52, 70, 88):
        pb(20, y, 76, y + 2, w, 16, .3); x = 23.0
        while x < 71:
            t = 2.6 + R() * 2.4; h = 9 + R() * 5; pb(x, y - h, x + t, y, m_cloth(vary(random.choice(C), .15)), 9 + R() * 2, .3, 1); x += t + .3 + (3 if R() < .12 else 0)
def p_fountain():
    s = lambda: m_stone((.32, .30, .27)); o = cy(48, 66, 90, 30, 0, s(), seg=18); o.scale = (1, .75, 1)
    cy(48, 65.5, 67, 26.5, 0, mat((.05, .16, .22), rough=.08, grain=.1, bump=.05), seg=18).scale = (1, .75, 1)
    cy(48, 36, 68, 5, 0, s(), seg=10); cy(48, 33, 37, 12, 0, s(), r2=8, seg=14)
    for dx in (-6.5, 6.5): cy(48 + dx, 40, 66, .8, 4, mat((.45, .62, .72), rough=.1, grain=0, bump=0), seg=5)
def p_bell():
    w = m_wood(WOODD)
    for x in (20, 71): pb(x, 14, x + 5, 90, w, 6, .5)
    pb(16, 13, 80, 19, m_wood(WOODD, (.5, 7, 7)), 8, .5)
    cy(48, 24, 54, 9, 0, m_gold(), r2=15, seg=18) if False else None
    o = cy(48, 24, 54, 15, 0, m_brass(), r2=8, seg=18); cy(48, 19, 24, 2, 0, m_iron(), seg=6); ball(48, 57, 3, 0, m_iron()); cy(47, 60, 84, .5, 3, m_cloth((.5, .42, .3)), seg=5)
def p_stele():
    s = m_stone((.30, .29, .27)); pb(30, 54, 66, 90, s, 9, 1.2, 0, 1); cyd(48, 54, 18, -4.5, 4.5, s, seg=20)
    k = mat((.05, .05, .05), grain=0, bump=0); pb(46, 48, 50, 66, k, .5, 0, 4.6); pb(40, 54, 56, 58, k, .5, 0, 4.6)
    for y in (72, 77, 82): pb(36, y, 60, y + 1.5, k, .5, 0, 4.6)
def p_brazier():
    for (x, d) in ((36, 5), (60, 5), (48, -8)):
        me = bpy.data.meshes.new('a'); bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=1.4 * UN, radius2=1.4 * UN, depth=1); bm.to_mesh(me); bm.free()
        a = Vector((PXx(x), -d * UN, PZz(90))); b = Vector((PXx(48 + (x - 48) * .4), -d * .4 * UN, PZz(62))); o = obj(me, m_iron()); o.location = (a + b) / 2; o.scale = (1, 1, (b - a).length); o.rotation_euler = (b - a).to_track_quat('Z', 'Y').to_euler()
    cy(48, 52, 64, 18, 0, m_iron(), r2=12, seg=14); ball(48, 53, 15, 0, emit((.8, .18, .02), 1.2), (1, 1, .3))
    for (mm, r, h, dx, d) in ((emit((.95, .22, .03), 1.6), 7, 12, -5, 0), (emit((.95, .22, .03), 1.6), 7.5, 15, 5, -2), (emit((1.0, .55, .08), 2.2), 5, 9, 0, 3), (emit((1.0, .85, .40), 3.0), 2.6, 5, 1, 5)):
        ball(48 + dx, 52 - h * .7, r, d, mm, (1, .8, h / r))
def p_well():
    s = lambda: m_stone((.30, .29, .26)); cy(48, 62, 90, 24, 0, s(), seg=16).scale = (1, .8, 1); cy(48, 61.5, 63, 20, 0, m_dark(), seg=16).scale = (1, .8, 1)
    w = m_wood(WOODD)
    for x in (26, 66): pb(x, 30, x + 4, 64, w, 4, .4)
    cyh(24, 72, 30, 2.6, 0, m_wood((.22, .13, .06), (.5, 7, 7))); cy(48, 32, 56, .5, 0, m_cloth((.5, .42, .3)), seg=5); cy(48, 54, 63, 5, 0, m_wood((.26, .15, .07)), seg=10)
def p_cart():
    w = m_wood((.24, .14, .07), (.5, 7, 7)); pb(16, 52, 72, 70, w, 34, .8); pb(15, 49, 73, 53, m_wood(WOODD, (.5, 7, 7)), 36, .5)
    for d in (19, -19):
        cyd(32, 78, 12, d - 1.5, d + 1.5, m_wood(WOODD), seg=18); cyd(32, 78, 12.6, d - 1, d + 1, m_iron(), seg=18) if False else None; cyd(32, 78, 3, d - 2.4, d + 2.4, m_iron(), seg=10)
    me = bpy.data.meshes.new('a'); bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=1.6 * UN, radius2=1.6 * UN, depth=1); bm.to_mesh(me); bm.free()
    for d in (10, -10):
        a = Vector((PXx(70), -d * UN, PZz(63))); b = Vector((PXx(92), -d * UN, PZz(74))); o = obj(me.copy(), m_wood(WOODD)); o.location = (a + b) / 2; o.scale = (1, 1, (b - a).length); o.rotation_euler = (b - a).to_track_quat('Z', 'Y').to_euler()
def p_statue():   # silhouette de pierre : socle, corps drapé, tête, bras
    s = m_stone((.36, .35, .32)); pb(30, 76, 66, 90, s, 26, 1.5, 0, 1); cy(48, 36, 77, 11, 0, s, r2=8, seg=12); ball(48, 26, 8.5, 0, s, (.9, .9, 1.1)); ball(48, 37, 12, 0, s, (1, .6, .5))
    for x in (35.5, 60.5): cy(x, 38, 64, 3.4, 1, s, r2=2.6, seg=8)
    pb(46.4, 30, 49.6, 82, s, 2.4, .6, 9)
def p_sac():
    ball(48, 77, 14, 0, m_cloth((.36, .25, .12)), (1, 1, .95)); cy(48, 56, 66, 4, 0, m_cloth((.36, .25, .12)), r2=6.5, seg=10); cy(48, 63, 66, 6.2, 0, m_cloth((.12, .08, .04)), seg=10)
def p_or():
    for (a, b, d) in ((38, 87, 3), (48, 88, 7), (58, 87, 2), (43, 84, -2), (53, 84, -3), (48, 81, 2), (46, 86, -6)):
        cy(a, b - 2.2, b, 6.5, d, m_gold(), seg=14)


# =====================================================================
# Intérieurs (h_* : échoppes vues derrière le comptoir) et scènes (s_*), 400 x 200.
# Repère : sol z = 0, mur du fond en y = +3, spectateur en y = -4 à hauteur d'yeux.
# =====================================================================
def wb(x0, x1, y0, y1, z0, z1, m, bevel=0, chisel=0, rot=(0, 0, 0)):
    return box((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, abs(x1 - x0), abs(y1 - y0), abs(z1 - z0), m, bevel, rot, chisel)
def wc(x, y, z0, z1, r, m, r2=None, seg=14): return cyl(x, y, z0, z1, r, m, r2, seg)
def wcx(x0, x1, y, z, r, m, seg=12):
    me = bpy.data.meshes.new('c'); bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=abs(x1 - x0)); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    o = obj(me, m); o.rotation_euler = (0, math.radians(90), 0); o.location = ((x0 + x1) / 2, y, z); return o
def wcy(x, y0, y1, z, r, m, seg=12, r2=None):
    me = bpy.data.meshes.new('c'); bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=abs(y1 - y0)); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    o = obj(me, m); o.rotation_euler = (math.radians(-90), 0, 0); o.location = (x, (y0 + y1) / 2, z); return o
def wsph(x, y, z, r, m, sc=(1, 1, 1)):
    me = bpy.data.meshes.new('s'); bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=2, radius=r); bmesh.ops.scale(bm, vec=sc, verts=bm.verts); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    o = obj(me, m); o.location = (x, y, z); return o
def lamp(x, y, z, e, c=(1, .62, .28), size=.15):
    l = bpy.data.lights.new('pt', 'POINT'); l.energy = e; l.color = c; l.shadow_soft_size = size; lo = bpy.data.objects.new('pt', l); col.objects.link(lo); lo.location = (x, y, z); return lo
def stone_wall(y, x0=-6, x1=6, z0=0, z1=3.4, bw=(.6, 1.0), bh=.5, cols_=None, depth=.16, **kw):
    cols_ = cols_ or [GREY, GREY2, (.20, .18, .16)]; wb(x0, x1, y + .02, y + .1, z0, z1, mat((.012, .011, .01)))
    z = z0; r_ = 0
    while z < z1:
        x = x0 - R() * bw[1]
        while x < x1:
            w = U(*bw); wb(x + .025, x + w - .025, y - depth + U(-.02, .02), y, z + .025, min(z + bh, z1) - .025, mat(vary(random.choice(cols_), .2), grain=.4, gscale=22, bump=.8, spots=.5, spotcol=(.07, .07, .065)), .05, kw.get('chisel', .04)); x += w
        z += bh
def plank_wall(y, x0=-6, x1=6, z0=0, z1=3.4, c=WOOD, w=.36):
    x = x0
    while x < x1: wb(x + .008, x + w - .008, y - .06, y, z0, z1, m_wood(vary(c, .14)), .01); x += w
def room(wall='stone', floor_c=(.10, .085, .07), ceil=True, **kw):
    if wall == 'stone': stone_wall(3.0, **kw)
    elif wall == 'plank': plank_wall(3.0, c=kw.get('c', WOOD))
    wb(-7, 7, -6, 3.2, -.1, 0, mat(floor_c, grain=.4, gscale=10, bump=.6))
    if ceil:
        wb(-7, 7, -6, 3.2, 3.4, 3.5, mat((.07, .045, .025), grain=.5, gscale=9, stretch=(.5, 8, 8), bump=.4))
        for x in (-4.2, -2.1, 0, 2.1, 4.2): wb(x - .13, x + .13, -6, 3.1, 3.12, 3.4, m_wood(WOODD, (8, .5, 8)), .02)
def counter(c=(.24, .14, .07)):
    wb(-6, 6, -1.75, -1.1, 0, .96, m_wood(vary(c, .05), (.5, 7, 7)), .015); wb(-6, 6, -1.82, -1.04, .96, 1.03, m_wood((.30, .18, .09), (.5, 7, 7)), .02)
    for x in (-3.3, -1.1, 1.1, 3.3): wb(x - .04, x + .04, -1.78, -1.74, 0, .96, m_wood(WOODD), .01)
def shelf_(x0, x1, z, y=2.9, d=.34, c=WOODD):
    wb(x0, x1, y - d, y, z - .04, z, m_wood(c, (.5, 7, 7)), .01)
    for x in (x0 + .05, x1 - .05): wb(x - .03, x + .03, y - d + .03, y, z - .22, z - .04, m_wood(c), .01)
def jars(x0, x1, z, y=2.72, cols_=None, n=9):
    cols_ = cols_ or [(.20, .32, .10), (.38, .09, .06), (.55, .40, .12), (.10, .20, .34), (.26, .10, .26), (.08, .24, .14)]
    for i in range(n):
        x = x0 + (i + .5) * (x1 - x0) / n; h = U(.16, .26); r = U(.055, .08); m = mat(vary(random.choice(cols_), .15), rough=.25, grain=.12, bump=.05)
        wc(x, y, z, z + h, r, m); wc(x, y, z + h, z + h + .04, r * .6, m_wood(WOODD))
def fire(x, y, z, s=1.0):
    for (c, e, r, h, dx) in (((.95, .22, .03), .9, .22, .5, -.12), ((.95, .22, .03), .9, .2, .62, .14), ((1.0, .55, .08), 1.3, .15, .42, 0), ((1.0, .85, .4), 1.9, .08, .22, .03)):
        wsph(x + dx * s, y, z + h * s * .5, r * s, emit(c, e), (1, .8, h / r * .5))
    lamp(x, y - .5, z + .4, 260 * s)

def h_forge():
    room('stone'); counter()
    wb(1.5, 4.2, 2.0, 2.95, 0, 1.0, m_stone((.14, .13, .12)), .06, .04); wb(1.7, 4.0, 1.9, 2.9, 1.0, 1.12, mat((.02, .018, .016)))
    for i in range(14): wsph(U(1.9, 3.8), U(2.1, 2.7), 1.14, U(.07, .12), emit((.9, .2 + R() * .2, .03), .6 + R() * .8), (1, 1, .6))
    fire(2.85, 2.4, 1.1, .9)
    wb(1.4, 4.3, 1.9, 2.95, 2.3, 3.3, m_stone((.11, .10, .095)), .05, .04)   # hotte
    for i, x in enumerate((-.7, -.25, .2, .65)):   # épées au mur
        l = U(.9, 1.2); wb(x - .035, x + .035, 2.80, 2.84, 1.95 - l + 1.0, 2.95 - .2, m_steel(), .008); wb(x - .14, x + .14, 2.78, 2.84, 1.75 - l + 1.0, 1.80 - l + 1.0, m_brass(), .01); wb(x - .03, x + .03, 2.78, 2.84, 1.50 - l + 1.0, 1.76 - l + 1.0, m_wood(WOODD), .01)
    wcy(-4.2, 2.78, 2.86, 2.1, .5, m_steel(), 20); wcy(-4.2, 2.72, 2.80, 2.1, .13, m_brass(), 12)
    wb(-5.6, -3.2, 2.6, 2.95, 0, 1.0, m_wood(WOODD), .02); 
    for x in (-5.2, -4.6, -4.0, -3.5): wc(x, 2.75, 1.0, 1.0 + U(.25, .5), .1, m_iron(), seg=8)
    lamp(-2, 0, 2.6, 60, (1, .75, .5))
def h_herbes():
    room('plank', c=(.20, .12, .06)); counter()
    for z in (1.5, 2.15): shelf_(-5.4, -.6, z); jars(-5.3, -.7, z, n=13)
    wcx(-.2, 5.6, 2.6, 3.0, .04, m_wood(WOODD))
    for i in range(13):   # bouquets pendus
        x = .1 + i * .42; l = U(.35, .6); wc(x, 2.6, 3.0 - l * .35, 3.0, .012, m_cloth((.3, .24, .14)), seg=5)
        wsph(x, 2.6, 3.0 - l * .35 - l * .4, .13, m_cloth(vary(random.choice([(.10, .20, .05), (.16, .22, .07), (.28, .22, .10), (.16, .10, .22)]), .2)), (1, 1, l / .13 * .5))
    shelf_(1.2, 5.2, 1.45); jars(1.3, 5.1, 1.45, n=8)
    wc(4.4, 2.2, 1.45, 1.75, .04, mat((.72, .68, .58), grain=.1), seg=8); wsph(4.4, 2.2, 1.8, .045, emit((1, .7, .25), 6), (1, 1, 1.8)); lamp(4.4, 1.9, 1.9, 50)
    lamp(-2, 0, 2.6, 70, (1, .8, .55))
def h_drap():
    room('plank', c=(.24, .15, .09)); counter()
    cs = [(.38, .05, .05), (.07, .14, .30), (.55, .40, .12), (.10, .22, .08), (.22, .06, .20), (.62, .58, .50), (.26, .15, .08)]
    for j, z in enumerate((.95, 1.6, 2.25)):
        shelf_(-5.5, -1.2, z)
        for i in range(8): wcx(-5.4 + i * .52, -5.4 + i * .52 + .46, 2.72, z + .17, .16, m_cloth(vary(cs[(i + j * 2) % 7], .1)), 12)
    wb(2.4, 4.6, 2.9, 2.98, 1.0, 2.9, emit((.55, .66, .85), 1.6)); wb(2.3, 4.7, 2.86, 2.96, .9, 1.0, m_wood(WOODD)); wb(2.3, 4.7, 2.86, 2.96, 2.9, 3.0, m_wood(WOODD))
    for x in (2.3, 3.5, 4.7): wb(x - .05, x + .05, 2.86, 2.96, .9, 3.0, m_wood(WOODD))
    wb(2.3, 4.7, 2.86, 2.96, 1.9, 1.98, m_wood(WOODD))
    wc(.6, 2.3, 0, 1.3, .03, m_wood(WOODD), seg=6); wc(.6, 2.3, 1.0, 1.9, .34, m_cloth((.40, .06, .06)), r2=.2, seg=14); wsph(.6, 2.3, 2.0, .2, m_cloth((.40, .06, .06)), (1.3, .7, .6)); wsph(.6, 2.3, 2.3, .13, m_wood((.3, .2, .1)))
    wc(.6, 2.3, 1.88, 1.93, .22, m_cloth((.6, .42, .12)), seg=14)
    lamp(3.5, 2.2, 2.2, 120, (.7, .8, 1.0), .5); lamp(-2, 0, 2.6, 70, (1, .8, .55))
def h_taverne():
    room('plank', c=(.17, .10, .05)); counter()
    wb(2.0, 5.0, 2.3, 2.98, 0, 2.0, m_stone((.15, .14, .13)), .06, .04); wb(2.5, 4.5, 2.2, 2.9, .1, 1.3, mat((.012, .01, .009))); fire(3.5, 2.5, .15, 1.2); wb(1.9, 5.1, 2.2, 2.98, 2.0, 2.2, m_wood(WOODD, (.5, 7, 7)), .02)
    for (x, z, r) in ((-5.0, .55, .55), (-3.8, .55, .55), (-4.4, 1.55, .5)):   # tonneaux couchés
        wcy(x, 2.0, 2.9, z, r, m_wood((.24, .14, .07), (7, .5, 7)), 18)
        for y in (2.02, 2.45): wcy(x, y, y + .06, z, r + .015, m_iron(), 18)
        wcy(x, 1.98, 2.0, z, r * .92, m_wood(WOODD), 18)
    shelf_(-2.6, 1.4, 1.75)
    for i in range(8):
        x = -2.4 + i * .5; wc(x, 2.72, 1.75, 1.97, .08, mat((.50, .42, .28), rough=.5, grain=.15), seg=10); wb(x + .08, x + .13, 2.70, 2.74, 1.80, 1.92, mat((.40, .33, .22), grain=.15))
    wc(-.6, 1.6, 2.5, 3.2, .012, m_iron(), seg=5); wb(-.72, -.48, 1.48, 1.72, 2.2, 2.5, emit((.9, .40, .05), .55)); lamp(-.6, 1.3, 2.3, 60)
def h_etal():
    room('stone', cols_=[(.11, .11, .13), (.13, .125, .14), (.10, .10, .11)]); counter((.20, .12, .06))
    wb(2.6, 3.8, 2.95, 3.0, 2.0, 2.9, emit((.30, .40, .65), 1.4))
    for x in (2.85, 3.2, 3.55): wc(x, 2.82, 1.95, 2.95, .04, m_iron(), seg=8)
    lamp(3.2, 2.4, 2.4, 90, (.55, .68, 1.0), .4)
    shelf_(-5.2, -1.0, 1.55)
    for i in range(5): wsph(-4.8 + i * .85, 2.72, 1.66, .26, m_cloth(vary((.40, .25, .10), .1)), (1, .8, .45))
    wcx(-.2, 2.0, 2.7, 3.0, .03, m_wood(WOODD))
    for i in range(6):
        x = 0 + i * .34; l = U(.4, .62); wc(x, 2.7, 3.0 - l, 3.0, .055, m_cloth(vary((.30, .07, .05), .15)), seg=8)
    wc(-5.2, 1.6, 0, 1.4, .5, m_cloth((.34, .25, .13)), r2=.62, seg=14)
    lamp(-2.5, 0, 2.5, 40, (1, .7, .4))
def h_chariot():
    sky = emit((.30, .42, .62), 1.0); wb(-30, 30, 20, 20.1, -5, 25, sky)
    for (x, y, r, c) in ((-9, 17, 9, (.10, .15, .13)), (8, 16, 11, (.09, .14, .11)), (-2, 12, 7, (.07, .12, .06)), (12, 11, 6, (.08, .13, .05)), (-12, 10, 6, (.09, .13, .05))):
        wsph(x, y, -1.0, r, mat(c, grain=.4, gscale=1.2, bump=.4), (1, 1, .42))
    wb(-20, 20, -8, 20, -.1, 0, mat((.11, .13, .05), grain=.5, gscale=6, bump=.6))
    counter((.26, .16, .08))
    for x in (-5.2, 5.2): wc(x, -.6, 0, 3.3, .07, m_wood(WOODD))
    for i in range(10):   # auvent rayé
        x0 = -5.6 + i * 1.12; o = wb(x0, x0 + 1.12, -1.6, 1.4, 3.1, 3.14, m_cloth((.38, .05, .04) if i % 2 else (.60, .56, .46))); o.rotation_euler = (math.radians(-9), 0, 0)
    wb(-5.6, 5.6, -1.72, -1.66, 2.66, 2.98, m_cloth((.38, .05, .04)))
    wcy(4.3, 1.2, 1.36, .9, .9, m_wood(WOODD), 20); wcy(4.3, 1.14, 1.42, .9, .14, m_iron(), 10)
    for a in range(6):
        o = wb(4.27, 4.33, 1.24, 1.32, .1, 1.7, m_wood((.22, .13, .06))); o.rotation_euler = (0, a * math.pi / 6, 0)
    for (x, z, w) in ((-4.6, 0, 1.2), (-3.2, 0, .9), (-4.1, 1.2, .8)): wb(x - w / 2, x + w / 2, .6, .6 + w, z, z + w, m_wood(vary((.28, .18, .09), .1)), .03)
def h_cloitre():
    room('stone', cols_=[(.24, .21, .16), (.27, .23, .17), (.20, .18, .14)], ceil=False)
    wb(-7, 7, -6, 3.2, 3.6, 3.7, mat((.08, .07, .06)))
    counter((.22, .14, .08))
    for x in (-4.4, -1.5, 1.5, 4.4):
        wc(x, 2.3, 0, 2.6, .2, m_stone((.34, .31, .26)), seg=12); wb(x - .3, x + .3, 2.0, 2.6, 2.6, 2.8, m_stone((.36, .33, .28)), .04); wb(x - .28, x + .28, 2.02, 2.58, 0, .2, m_stone((.36, .33, .28)), .04)
    for x in (-2.95, 0, 2.95):   # vitraux
        wb(x - .7, x + .7, 2.74, 2.80, .9, 2.4, emit((.55, .32, .06), .5)); wsph(x, 2.77, 2.4, .7, emit((.45, .06, .05), .5), (1, .05, 1)); wb(x - .7, x + .7, 2.73, 2.79, .9, 1.4, emit((.05, .12, .40), .5))
        wb(x - .03, x + .03, 2.70, 2.74, .9, 3.1, m_iron()); wb(x - .7, x + .7, 2.70, 2.74, 1.6, 1.66, m_iron()); wb(x - .7, x + .7, 2.70, 2.74, 1.38, 1.43, m_iron())
        lamp(x, 2.3, 1.8, 60, (1, .75, .4), .4)
    for x in (-3.6, -.7, 2.2):
        wc(x, -.9, 1.03, 1.4, .035, mat((.72, .68, .58), grain=.1), seg=8) if False else None
def h_egout():
    room('stone', cols_=[SEW, (.12, .13, .11), (.09, .10, .10)], bw=(.4, .7), bh=.3, floor_c=(.04, .06, .05)); counter((.16, .10, .05))
    wb(1.6, 4.6, 2.78, 2.9, 0, 1.6, emit((.004, .006, .005), 1)); wsph(3.1, 2.84, 1.6, 1.5, emit((.004, .006, .005), 1), (1, .04, 1))
    wb(1.6, 4.6, 2.5, 2.9, 0, .28, mat((.03, .12, .09), rough=.08, grain=.1, bump=.05))
    for a in range(9):
        t = math.pi * (a + .5) / 9; o = wb(3.1 - 1.72 * math.cos(t) - .3, 3.1 - 1.72 * math.cos(t) + .3, 2.62, 2.84, 1.6 + 1.72 * math.sin(t) - .17, 1.6 + 1.72 * math.sin(t) + .17, m_stone((.13, .14, .12)), .04, .03); o.rotation_euler = (0, t - math.pi / 2, 0)
    wc(-1.6, 1.4, 2.6, 3.4, .012, m_iron(), seg=5); wb(-1.72, -1.48, 1.28, 1.52, 2.3, 2.6, emit((.9, .40, .05), .55)); lamp(-1.6, 1.1, 2.4, 70)
    for (x, z, w) in ((-4.8, 0, 1.1), (-3.6, 0, .8), (-4.5, 1.1, .7)): wb(x - w / 2, x + w / 2, 1.8, 1.8 + w, z, z + w, m_wood(vary((.20, .13, .07), .1)), .03)
def s_throne():
    stone_wall(6.0, x0=-8, x1=8, z1=6, cols_=[(.30, .28, .25), (.34, .31, .27), (.26, .245, .22)], bw=(.9, 1.4), bh=.7, chisel=.02)
    wb(-9, 9, -8, 6.2, -.1, 0, mat((.20, .19, .17), rough=.4, grain=.25, gscale=5, bump=.2)); wb(-9, 9, -8, 6.2, 6, 6.1, mat((.10, .09, .08)))
    for i in range(-4, 5):
        for j in range(-3, 3): 
            if (i + j) % 2: wb(i * 1.5, i * 1.5 + 1.5, j * 1.5, j * 1.5 + 1.5, 0, .006, mat((.07, .07, .08), rough=.3, grain=.2))
    wb(-.9, .9, -8, 4.4, .005, .02, m_cloth((.36, .04, .04))); 
    for x in (-.9, .82): wb(x, x + .08, -8, 4.4, .02, .025, m_cloth((.62, .42, .12)))
    for k, yy in enumerate((-.5, 2.2, 4.9)):
        for sx in (-1, 1):
            x = sx * 3.3; wc(x, yy, 0, 5.2, .32, m_stone((.36, .34, .30)), seg=14); wb(x - .5, x + .5, yy - .5, yy + .5, 0, .35, m_stone((.38, .36, .32)), .05); wb(x - .5, x + .5, yy - .5, yy + .5, 5.2, 5.6, m_stone((.38, .36, .32)), .05)
            if k < 2:
                bxx = sx * 4.6; wb(bxx - .45, bxx + .45, yy + 1.2, yy + 1.25, 2.0, 4.6, m_cloth((.07, .12, .30) if k == 0 else (.36, .04, .04))); wb(bxx - .2, bxx + .2, yy + 1.17, yy + 1.2, 3.1, 3.6, m_cloth((.62, .42, .12)))
    for i, (d, h) in enumerate(((1.6, .22), (1.25, .44), (.9, .66))): wb(-2.4 + i * .35, 2.4 - i * .35, 5.9 - d - .4, 5.95, 0, h, m_stone((.34, .32, .29)), .03)
    g = m_gold(); w = m_wood((.20, .10, .05))
    wb(-.55, .55, 5.0, 5.75, .66, 1.25, w, .03); wb(-.6, .6, 5.6, 5.8, .66, 3.1, w, .04); wb(-.45, .45, 5.56, 5.6, 1.3, 2.9, m_cloth((.36, .04, .04)))
    for x in (-.62, .5): wb(x, x + .12, 5.0, 5.75, 1.25, 1.6, g, .03)
    wsph(0, 5.7, 3.25, .22, g); 
    for x in (-.55, .55): wsph(x, 5.7, 3.12, .12, g)
    for sx in (-1, 1):
        wc(sx * 1.9, 5.2, .66, 2.2, .05, m_iron(), seg=8); wc(sx * 1.9, 5.2, 2.2, 2.35, .2, m_iron(), r2=.12, seg=10); fire(sx * 1.9, 5.2, 2.35, .5)
    for sx in (-1, 1): wb(sx * 6.2 - .2, sx * 6.2 + .2, -8, 6.2, 0, 6, mat((.22, .205, .185), grain=.4, gscale=3, bump=.8, spots=.5, spotcol=(.14, .13, .12)))
    lamp(0, 2, 5, 400, (1, .85, .65), 1.0)

globals()['t_' + theme if VAR else name]()
if VAR and theme in ('stone', 'sewer', 'crypt', 'abbey', 'palace', 'mine'):   # variante : traces d'humidité et mousse au pied du mur
    leaves(90 if theme in ('abbey', 'palace') else 220, (0, -.05, W, .45 if theme != 'sewer' else 1.2), [MOSS, (.05, .10, .05), (.09, .14, .07)], size=(.05, .13), ydepth=(-.14, -.09))
    for i in range(5):
        x = U(0, W); leaves(26, (x - .06, U(.8, 1.6), x + .06, W + .05), [(.045, .07, .05), (.06, .09, .055)], size=(.05, .11), ydepth=(-.135, -.10))
if kind == 'h':   # le fond de l'échoppe est rapproché du comptoir : les objets se lisent mieux
    for o_ in list(col.objects):
        if o_.location.y > .5: o_.location.y -= 1.7
    lamp(-1.5, -.6, 2.7, 160, (1, .82, .6), .6)

# ---------- caméra et lumière : les mêmes que pour les personnages ----------
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 40; sc.cycles.use_denoising = False; sc.cycles.max_bounces = 3
if kind in ('h', 's'):
    sc.cycles.samples = 48; sc.render.resolution_x = 1200; sc.render.resolution_y = 600; sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = 'PNG'; sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'
    cam = bpy.data.cameras.new('C'); co = bpy.data.objects.new('C', cam); col.objects.link(co); sc.camera = co; cam.clip_end = 200; cam.sensor_fit = 'VERTICAL'; cam.sensor_height = 36
    if kind == 'h': co.location = (0, -4.15, 1.45); co.rotation_euler = (math.radians(90), 0, 0); cam.lens = 36 * 267 / 200
    else: co.location = (0, -7.5, 1.7); co.rotation_euler = (math.radians(92), 0, 0); cam.lens = 36 * 230 / 200
elif kind in ('o', 'p'):
    sc.render.film_transparent = True; sc.render.image_settings.color_mode = 'RGBA'; sc.cycles.samples = 64
    N_ = 128 if kind == 'o' else 96; sc.render.resolution_x = N_ * 4; sc.render.resolution_y = N_ * 4; sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = 'PNG'; sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'
    cam = bpy.data.cameras.new('C'); co = bpy.data.objects.new('C', cam); col.objects.link(co); sc.camera = co; cam.clip_end = 100; cam.sensor_fit = 'VERTICAL'; cam.sensor_height = 36
    if kind == 'o':
        Dc = 4.35; co.location = (W / 2, -Dc, W / 2); co.rotation_euler = (math.radians(90), 0, 0); cam.lens = 36 * Dc / W
        if name != 'o_grille' and not name.startswith('o_leaf') and not name.startswith('o_flight'):
            sp_ = box(W / 2, .0005, W / 2, W * 3, .001, W * 3, mat((.5, .5, .5))); sp_.is_shadow_catcher = True
    else:
        Dc = 4.0; eye = 1.45; co.location = (0, -Dc, eye); co.rotation_euler = (math.radians(90), 0, 0); cam.lens = 36 * Dc / SPANP
        cam.shift_y = -((6.0 / 96.0) - .5 + eye / SPANP)
        gp = box(0, 0, -.0005, 8, 8, .001, mat((.5, .5, .5))); gp.is_shadow_catcher = True
else:
    sc.render.resolution_x = (PX + MG) * SS; sc.render.resolution_y = (PX + (MG if kind != 't' else 0)) * SS; sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = 'PNG'; sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'
    cam = bpy.data.cameras.new('C'); co = bpy.data.objects.new('C', cam); col.objects.link(co); sc.camera = co; cam.type = 'ORTHO'
    cam.ortho_scale = W * (PX + MG) / PX; cam.clip_end = 100
    if kind == 't':
        co.location = (W / 2 - MGm / 2, -20, W / 2); co.rotation_euler = (math.radians(90), 0, 0)
    else:
        co.location = (W / 2 - MGm / 2, W / 2 - MGm / 2, 20); co.rotation_euler = (0, 0, 0)
def sun(n, elev, azim, e, c, ang=6):
    l = bpy.data.lights.new(n, 'SUN'); l.energy = e; l.color = c; l.angle = math.radians(ang); o = bpy.data.objects.new(n, l); col.objects.link(o)
    o.rotation_euler = (math.radians(90 - elev), 0, math.radians(azim))
if kind in ('h', 's'):
    sun('key', 40, -35, 1.6 if name != 'h_chariot' else 3.6, (1.0, .86, .68)); sun('fill', 12, 62, .3, (.55, .68, 1.0), 30)
elif kind in ('t', 'o', 'p'):
    sun('key', 52, -48, 3.6, (1.0, .86, .68)); sun('fill', 12, 62, .4, (.55, .68, 1.0), 30)
else:   # vue de dessus : la torche rase le sol depuis le haut à gauche
    sun('key', 38, -48 + 180, 3.2, (1.0, .86, .68)); sun('fill', 60, 62, .4, (.55, .68, 1.0), 30)
w = bpy.data.worlds.new('W'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (.17, .155, .165, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 1.0
sc.render.filepath = os.path.join(out, name + '.png'); bpy.ops.render.render(write_still=True)
print('DONE', name)
