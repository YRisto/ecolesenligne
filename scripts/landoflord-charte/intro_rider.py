# Le cavalier au galop (8 poses), modèle simple fait de volumes, éclairé comme le plan du pont. Usage : intro_rider.py <dossier>
import bpy, bmesh, sys, math
from mathutils import Vector
out = sys.argv[-1]
def build(ph):
    bpy.ops.wm.read_factory_settings(use_empty=True); sc = bpy.context.scene; col = sc.collection
    def mat(rgb, rough=.7):
        m = bpy.data.materials.new('m'); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']; b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Roughness'].default_value = rough; return m
    def ball(p, r, m, s=(1, 1, 1), rot=(0, 0, 0)):
        bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1); me = bpy.data.meshes.new('b'); bm.to_mesh(me); bm.free()
        for q in me.polygons: q.use_smooth = True
        me.materials.append(m); o = bpy.data.objects.new('b', me); col.objects.link(o); o.location = p; o.scale = (r * s[0], r * s[1], r * s[2]); o.rotation_euler = rot; return o
    def limb(a, b, r1, r2, m):
        a = Vector(a); b = Vector(b); d = b - a; L = d.length; bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=r1, radius2=r2, depth=L); me = bpy.data.meshes.new('l'); bm.to_mesh(me); bm.free()
        for q in me.polygons: q.use_smooth = True
        me.materials.append(m); o = bpy.data.objects.new('l', me); col.objects.link(o); o.location = (a + b) / 2; o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler(); return o
    H = mat((.17, .095, .05)); HD = mat((.05, .035, .03)); CL = mat((.10, .14, .30)); CP = mat((.36, .05, .06)); SK = mat((.55, .38, .28)); LT = mat((.20, .12, .07))
    bob = .09 * math.sin(2 * ph); pit = .07 * math.sin(ph + .6); Z = 1.28 + bob
    P = lambda x, z, y=0: (x, y, Z + z + x * pit)
    ball(P(0, 0), 1, H, (.9, .34, .43)); ball(P(-.62, .06), .45, H, (1, .8, 1)); ball(P(.62, .05), .47, H, (1, .82, 1))
    nk = .12 * math.sin(ph + 1.2); limb(P(-.82, .22), P(-1.34, .78 + nk), .24, .15, H); ball(P(-1.58, .76 + nk * 1.3), .36, H, (1, .40, .46), (0, .45 + nk, 0)); ball(P(-1.86, .62 + nk * 1.5), .13, HD, (1, .8, .8))
    for sy in (-.07, .07): limb(P(-1.38, .95 + nk * 1.3, sy), P(-1.34, 1.12 + nk * 1.3, sy * 1.4), .05, .01, H)
    for i in range(7): t = i / 6; ball(P(-.86 - t * .46, .42 + t * .52 + nk * t, 0), .10, HD, (1.6, .35, .9), (0, .9, 0))
    tw = .18 * math.sin(ph * 2 + 1); limb(P(.98, .22), P(1.5, .34 + tw), .09, .12, HD); limb(P(1.5, .34 + tw), P(1.98, .12 + tw * 1.8), .12, .02, HD)
    def leg(x, y, phase, front):
        s = math.sin(phase); c = math.cos(phase); A = .95 if front else .85; up = A * s; fold = max(0, c) * 1.25 + .15
        hip = Vector(P(x, -.18, y)); L1 = .62; L2 = .60
        k = hip + Vector((-math.sin(up) * L1, 0, -math.cos(up) * L1)); a2 = up - (fold if front else -fold * .0) + (0 if front else fold * .9)
        f = k + Vector((-math.sin(a2) * L2, 0, -math.cos(a2) * L2)); limb(hip, k, .15, .085, H); limb(k, f, .08, .055, H); ball(f, .075, HD, (1.3, 1, .8))
    leg(-.58, .13, ph, True); leg(-.50, -.13, ph + .55, True); leg(.62, .14, ph + math.pi * .95, False); leg(.56, -.14, ph + math.pi * .95 + .5, False)
    # le cavalier, couché sur l'encolure
    ball(P(-.02, .40), .2, LT, (1.9, 1.3, .5)); tor = ball(P(-.20, .86), .33, CL, (1.25, .8, 1.3), (0, -.62, 0)); ball(P(-.56, 1.30), .17, SK); ball(P(-.53, 1.35), .19, CL, (1.05, 1.02, 1))
    for sy in (-.24, .24): limb(P(-.32, 1.02, sy), P(-.78, .78, sy * .7), .09, .06, CL); limb(P(-.05, .52, sy * 1.25), P(-.30, -.12, sy * 1.5), .13, .08, LT); ball(P(-.36, -.2, sy * 1.5), .09, HD, (1.5, .8, .7))
    vs = []; fs = []; n = 9
    for i in range(n + 1):
        t = i / n; x = -.08 + t * 1.25; z = 1.12 - t * .28 + .13 * math.sin(ph * 2 + t * 5) * t + .06 * math.sin(ph * 3 + t * 9) * t; w = .30 + t * .26
        h = .26 + t * .22; vs += [(x, -.05 - t * .1, Z + z + x * pit + h), (x, .05 + t * .1, Z + z + x * pit - h)]
    for i in range(n): fs.append((i * 2, i * 2 + 1, i * 2 + 3, i * 2 + 2))
    me = bpy.data.meshes.new('cape'); me.from_pydata(vs, [], fs); me.update(); me.materials.append(CP); o = bpy.data.objects.new('cape', me); col.objects.link(o)
    for q in me.polygons: q.use_smooth = True
    md = o.modifiers.new('s', 'SOLIDIFY'); md.thickness = .03
    def sun(elev, azim, e, c):
        l = bpy.data.lights.new('s', 'SUN'); l.energy = e; l.color = c; l.angle = .05; so = bpy.data.objects.new('s', l); col.objects.link(so); so.rotation_euler = (math.radians(90 - elev), 0, math.radians(azim))
    sun(18, 150, 6.5, (1, .66, .42)); sun(30, -40, 2.4, (.50, .56, .95)); w = bpy.data.worlds.new('W'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (.30, .26, .36, 1)
    cam = bpy.data.cameras.new('C'); co = bpy.data.objects.new('C', cam); col.objects.link(co); sc.camera = co; cam.type = 'ORTHO'; cam.ortho_scale = 5.4; co.location = (.05, -12, 1.45); co.rotation_euler = (math.radians(90), 0, 0)
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 40; sc.render.film_transparent = True; sc.render.resolution_x = 720; sc.render.resolution_y = 480; sc.render.image_settings.color_mode = 'RGBA'
    try: sc.cycles.use_denoising = True
    except Exception: pass
    return sc
for i in range(8):
    sc = build(i / 8 * 2 * math.pi); sc.render.filepath = '%s/rider%d.png' % (out, i); bpy.ops.render.render(write_still=True)
print('DONE')
