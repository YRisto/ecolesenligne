# Décors de la charte : murs, sols et plafonds modélisés puis rendus avec la même lumière que les personnages.
# usage : python render_tex.py nom outdir     (nom = t_stone, f_stone, c_stone, ...)
import bpy, bmesh, sys, math, os, random
from mathutils import Vector, Matrix, Euler

name, out = sys.argv[1], sys.argv[2]
kind, theme = name[0], name[2:]
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

globals()[name]()

# ---------- caméra et lumière : les mêmes que pour les personnages ----------
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 40; sc.cycles.use_denoising = False; sc.cycles.max_bounces = 3
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
if kind == 't':
    sun('key', 52, -48, 3.6, (1.0, .86, .68)); sun('fill', 12, 62, .4, (.55, .68, 1.0), 30)
else:   # vue de dessus : la torche rase le sol depuis le haut à gauche
    sun('key', 38, -48 + 180, 3.2, (1.0, .86, .68)); sun('fill', 60, 62, .4, (.55, .68, 1.0), 30)
w = bpy.data.worlds.new('W'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (.17, .155, .165, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 1.0
sc.render.filepath = os.path.join(out, name + '.png'); bpy.ops.render.render(write_still=True)
print('DONE', name)
