"""
tools/face/fit-facekit.py - give a THE_LAB body the 53 FaceKit expressions as morph targets, automatically.

What it does (no hand work):
  1. imports a body GLB (assets/bodies/<name>/desktop.glb or mobile.glb) and finds its head
     (vertices skinned to the Head / head_end / headfront bones, with a soft falloff into the neck);
  2. imports ICT FaceKit's generic neutral head and the 53 expression OBJs;
  3. fits the FaceKit head to the body's head: similarity ICP (scale + rotation + translation, trimmed,
     tries both facings), then a smoothed non-rigid wrap of the face region onto the body surface;
  4. carries every expression's vertex deltas across to the body's head vertices (nearest point on the wrapped
     FaceKit surface, barycentric, distance falloff) and writes them as shape keys named exactly by the
     contract ids in assets/face/expressions.json;
  5. exports a GLB next to the input (or --out) with those shape keys as morph targets, plus a JSON report.

Run (Blender 4.2+; the fitter uses only bpy, bmesh, mathutils, numpy):
  blender -b -P tools/face/fit-facekit.py -- --body assets/bodies/dante/desktop.glb --facekit third_party/ict-facekit/FaceXModel
  blender -b -P tools/face/fit-facekit.py -- --body assets/bodies/dante/mobile.glb --out assets/bodies/dante/mobile.glb --preview
  python -m tools.face.fit_facekit ... also works where `pip install bpy` is present (same flags, no `--`).

The expression OBJs are not committed (140 MB); tools/face/fetch-facekit.sh pulls them into third_party/ict-facekit/FaceXModel.
Only the head moves; skinning, UVs, materials and the armature pass through untouched.
"""
import argparse, json, math, os, sys, time

import bpy, bmesh
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
HEAD_BONES = ('Head', 'head_end', 'headfront')
NECK_BONES = ('neck', 'Neck')

# --------------------------------------------------------------------------- args
def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    p = argparse.ArgumentParser()
    p.add_argument('--body', required=True, help='body GLB')
    p.add_argument('--facekit', default=os.path.join(REPO, 'third_party', 'ict-facekit', 'FaceXModel'))
    p.add_argument('--contract', default=os.path.join(REPO, 'assets', 'face', 'expressions.json'))
    p.add_argument('--out', default=None, help='output GLB (default: <body>.face.glb next to the input)')
    p.add_argument('--tier', default='full', choices=['core', 'full'], help='which contract ids to build')
    p.add_argument('--icp-iters', type=int, default=40)
    p.add_argument('--wrap-iters', type=int, default=25, help='Laplacian smoothing passes on the wrap offsets')
    p.add_argument('--falloff', type=float, default=0.025, help='metres from the fitted face beyond which a body vertex gets no delta')
    p.add_argument('--preview', action='store_true', help='also render front views of a few expressions next to the output')
    p.add_argument('--report', default=None)
    return p.parse_args()

def log(*a):
    print('[fit-facekit]', *a, flush=True)

# --------------------------------------------------------------------------- scene helpers
def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == 'MESH']
    arms = [o for o in new if o.type == 'ARMATURE']
    if not meshes:
        raise SystemExit('no mesh in ' + path)
    # the bodies are one skinned mesh; if several, take the biggest
    body = max(meshes, key=lambda o: len(o.data.vertices))
    return body, (arms[0] if arms else None)

def import_obj(path):
    before = set(bpy.data.objects)
    if hasattr(bpy.ops.wm, 'obj_import'):
        bpy.ops.wm.obj_import(filepath=path)
    else:
        bpy.ops.import_scene.obj(filepath=path)
    new = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    if len(new) > 1:  # FaceKit OBJs are one object, but be safe
        for o in new: o.select_set(True)
        bpy.context.view_layer.objects.active = new[0]
        bpy.ops.object.join()
        new = [bpy.context.view_layer.objects.active]
    return new[0]

def world_verts(obj):
    n = len(obj.data.vertices)
    co = np.empty(n * 3, dtype=np.float64)
    obj.data.vertices.foreach_get('co', co)
    co = co.reshape(n, 3)
    M = np.array(obj.matrix_world)
    return (co @ M[:3, :3].T) + M[:3, 3]

def tris_of(obj):
    me = obj.data
    me.calc_loop_triangles()
    t = np.empty(len(me.loop_triangles) * 3, dtype=np.int64)
    me.loop_triangles.foreach_get('vertices', t)
    return t.reshape(-1, 3)

# --------------------------------------------------------------------------- head selection
def head_weights(body):
    """Per-vertex 0..1: how much of this vertex belongs to the head (skin weights to head bones; neck fades in)."""
    n = len(body.data.vertices)
    w = np.zeros(n)
    groups = {g.name: g.index for g in body.vertex_groups}
    head_idx = [groups[b] for b in HEAD_BONES if b in groups]
    neck_idx = [groups[b] for b in NECK_BONES if b in groups]
    if not head_idx:
        raise SystemExit('body has no Head vertex group; bones are ' + ', '.join(groups))
    for v in body.data.vertices:
        s = 0.0
        for g in v.groups:
            if g.group in head_idx: s += g.weight
            elif g.group in neck_idx: s += g.weight * 0.35
        w[v.index] = min(1.0, s)
    return w

# --------------------------------------------------------------------------- fitting maths
def umeyama(src, dst, with_scale=True):
    """Similarity transform (s, R, t) minimising |s R src + t - dst|^2."""
    mu_s, mu_d = src.mean(0), dst.mean(0)
    S, D = src - mu_s, dst - mu_d
    cov = D.T @ S / len(src)
    U, sig, Vt = np.linalg.svd(cov)
    d = np.sign(np.linalg.det(U @ Vt))
    Sm = np.diag([1, 1, d])
    R = U @ Sm @ Vt
    var_s = (S ** 2).sum() / len(src)
    s = (sig * np.diag(Sm)).sum() / var_s if with_scale else 1.0
    t = mu_d - s * R @ mu_s
    return s, R, t

def apply_sim(P, s, R, t):
    return (s * (P @ R.T)) + t

def nearest_on_surface(bvh, P):
    """Nearest surface points for an (n,3) array. Returns points, distances, face indices."""
    out = np.empty_like(P); dist = np.empty(len(P)); fidx = np.empty(len(P), dtype=np.int64)
    for i, p in enumerate(P):
        loc, nor, idx, d = bvh.find_nearest(Vector(p))
        if loc is None:
            out[i] = p; dist[i] = 1e9; fidx[i] = -1
        else:
            out[i] = loc; dist[i] = d; fidx[i] = idx
    return out, dist, fidx

def icp_similarity(src, target_bvh, iters, init, anchors=None):
    """anchors: list of (src_point, dst_point, weight) landmark pairs that hold the fit in place
    (the nose tip and the crown) while the surface ICP settles the rest."""
    s, R, t = init
    A_src = np.array([a[0] for a in anchors]) if anchors else np.zeros((0, 3))
    A_dst = np.array([a[1] for a in anchors]) if anchors else np.zeros((0, 3))
    A_rep = [int(a[2]) for a in anchors] if anchors else []
    for it in range(iters):
        P = apply_sim(src, s, R, t)
        Q, d, _ = nearest_on_surface(target_bvh, P)
        keep = d < np.percentile(d, 80)  # trimmed: ignore the worst 20 % (hair, ears, mouth interior)
        S = [src[keep]]; D = [Q[keep]]
        for a_s, a_d, n in zip(A_src, A_dst, A_rep):
            S.append(np.repeat(a_s[None], n, 0)); D.append(np.repeat(a_d[None], n, 0))
        s, R, t = umeyama(np.concatenate(S), np.concatenate(D))
        if it % 10 == 9: log(f'  icp {it + 1}/{iters} rms {np.sqrt((d[keep] ** 2).mean()) * 1000:.2f} mm')
    P = apply_sim(src, s, R, t)
    _, d, _ = nearest_on_surface(target_bvh, P)
    return (s, R, t), float(np.sqrt((d[d < np.percentile(d, 80)] ** 2).mean()))

def laplacian_smooth(values, adjacency, iters, fixed_mask=None):
    v = values.copy()
    for _ in range(iters):
        acc = np.zeros_like(v); cnt = np.zeros(len(v))
        for a, b in adjacency:
            acc[a] += v[b]; acc[b] += v[a]; cnt[a] += 1; cnt[b] += 1
        cnt[cnt == 0] = 1
        sm = acc / cnt[:, None]
        if fixed_mask is not None: sm[fixed_mask] = v[fixed_mask]
        v = 0.5 * v + 0.5 * sm
    return v

def edges_of(obj):
    me = obj.data
    e = np.empty(len(me.edges) * 2, dtype=np.int64)
    me.edges.foreach_get('vertices', e)
    return e.reshape(-1, 2)

def barycentric(p, a, b, c):
    v0, v1, v2 = b - a, c - a, p - a
    d00, d01, d11 = v0 @ v0, v0 @ v1, v1 @ v1
    d20, d21 = v2 @ v0, v2 @ v1
    den = d00 * d11 - d01 * d01
    if abs(den) < 1e-18: return np.array([1.0, 0.0, 0.0])
    v = (d11 * d20 - d01 * d21) / den; w = (d00 * d21 - d01 * d20) / den
    return np.array([1 - v - w, v, w])

# --------------------------------------------------------------------------- main
def main():
    args = parse_args()
    t0 = time.time()
    contract = json.load(open(args.contract))
    ids = contract['expressions'] if args.tier == 'full' else contract['tiers']['core']
    cfg = json.load(open(os.path.join(args.facekit, 'vertex_indices.json')))
    out_path = args.out or os.path.splitext(args.body)[0] + '.face.glb'
    report = {'body': args.body, 'out': out_path, 'ids': ids, 'steps': {}}

    clear_scene()
    body, arm = import_glb(args.body)
    log('body', body.name, len(body.data.vertices), 'verts; armature', arm.name if arm else None)

    # ---- head region on the body
    hw = head_weights(body)
    head_mask = hw > 0.5
    BV = world_verts(body)
    head_pts = BV[head_mask]
    if len(head_pts) < 500: raise SystemExit('head selection too small: %d verts' % len(head_pts))
    hmin, hmax = head_pts.min(0), head_pts.max(0)
    head_w = hmax[0] - hmin[0]
    log(f'head: {head_mask.sum()} verts, width {head_w * 100:.1f} cm, centre {(hmin + hmax) / 2}')

    # body head surface BVH (world space, head triangles only)
    BT = tris_of(body)
    head_tris = BT[head_mask[BT].all(1)]
    body_bvh = BVHTree.FromPolygons([Vector(p) for p in BV], [tuple(t) for t in head_tris], all_triangles=True)

    # ---- FaceKit neutral
    fk = import_obj(os.path.join(args.facekit, 'generic_neutral_mesh.obj'))
    FK = world_verts(fk)  # Blender world (Z-up) like the body after import
    fit_idx = np.array(cfg['idx_to_fitting_verts'], dtype=np.int64)      # face skin
    rigid_idx = np.array(cfg['idx_to_lap_rigid_verts'], dtype=np.int64)  # head + neck skin
    skin_idx = np.unique(np.concatenate([fit_idx, rigid_idx]))
    fk_skin = FK[skin_idx]
    smin, smax = fk_skin.min(0), fk_skin.max(0)
    log(f'facekit: {len(FK)} verts, {len(fit_idx)} fitting, skin width {(smax[0] - smin[0]):.3f} (source units)')

    # ---- rigid: anchors first (nose tip + crown), then ICP from both facings; keep the better
    lm = np.array(cfg['idx_to_landmark_verts'], dtype=np.int64)
    fk_nose = FK[lm[30]]; fk_top = FK[rigid_idx][:, 2].max()
    fk_top_pt = np.array([fk_nose[0], FK[rigid_idx][FK[rigid_idx][:, 2].argmax()][1], fk_top])
    body_top = head_pts[head_pts[:, 2].argmax()]
    best = None
    for yaw in (0.0, math.pi):
        R0 = np.array(Matrix.Rotation(yaw, 3, 'Z'))
        # the nose is the most forward head vertex; "forward" is -Y after a glTF import, flipped for the other facing
        fwd = R0 @ np.array([0, -1.0, 0]) if (R0 @ (fk_nose - FK[rigid_idx].mean(0)))[1] < 0 else R0 @ np.array([0, 1.0, 0])
        body_nose = head_pts[(head_pts @ fwd).argmax()]
        s0 = (body_top[2] - body_nose[2]) / (fk_top - fk_nose[2])
        t0_ = body_nose - s0 * R0 @ fk_nose
        anchors = [(fk_nose, body_nose, 400), (fk_top_pt, np.array([body_nose[0], body_top[1], body_top[2]]), 150)]
        log(f'icp facing yaw={yaw:.2f}: nose {body_nose.round(3)}, crown z {body_top[2]:.3f}, scale0 {s0:.4f}')
        (s, R, t), rms = icp_similarity(FK[fit_idx], body_bvh, args.icp_iters, (s0, R0, t0_), anchors)
        if best is None or rms < best[1]: best = ((s, R, t), rms, yaw)
    (s, R, t), rms, yaw = best
    log(f'rigid fit: scale {s:.4f}, facing yaw {yaw:.2f}, trimmed rms {rms * 1000:.2f} mm')
    report['steps']['rigid'] = {'scale': s, 'yaw': yaw, 'rms_mm': rms * 1000}
    FKw = apply_sim(FK, s, R, t)  # FaceKit neutral in body space

    # ---- non-rigid wrap of the skin region onto the body head
    skin_mask = np.zeros(len(FK), bool); skin_mask[skin_idx] = True
    Q, d, _ = nearest_on_surface(body_bvh, FKw[skin_idx])
    off = np.zeros_like(FKw)
    good = d < args.falloff * 2
    off[skin_idx[good]] = (Q - FKw[skin_idx])[good]
    E = edges_of(fk)
    E = E[skin_mask[E].all(1)]
    off = laplacian_smooth(off, E, args.wrap_iters)
    W = FKw + off  # wrapped neutral
    _, d2, _ = nearest_on_surface(body_bvh, W[fit_idx])
    log(f'wrap: face region rms to body {np.sqrt((d2 ** 2).mean()) * 1000:.2f} mm')
    report['steps']['wrap'] = {'rms_mm': float(np.sqrt((d2 ** 2).mean()) * 1000)}

    # ---- expression deltas (rotation + scale only; translation cancels)
    deltas = {}
    for eid in ids:
        ex = import_obj(os.path.join(args.facekit, eid + '.obj'))
        EX = world_verts(ex)
        if len(EX) != len(FK): raise SystemExit(f'{eid}: vertex count {len(EX)} != neutral {len(FK)}')
        deltas[eid] = s * ((EX - FK) @ R.T)
        bpy.data.objects.remove(ex, do_unlink=True)
    log('loaded', len(deltas), 'expressions')

    # ---- transfer: body head vertex -> nearest point on wrapped FaceKit face surface -> barycentric deltas
    FT = tris_of(fk)
    face_tris = FT[np.isin(FT, fit_idx).all(1)]
    fk_bvh = BVHTree.FromPolygons([Vector(p) for p in W], [tuple(tt) for tt in face_tris], all_triangles=True)
    cand = np.where(hw > 0.05)[0]  # anything with head/neck influence may receive a delta
    P = BV[cand]
    Qc, dc, fc = nearest_on_surface(fk_bvh, P)
    fall = np.clip(1.0 - (dc - args.falloff * 0.25) / (args.falloff * 0.75), 0, 1)  # 1 inside, 0 beyond falloff
    fall *= np.clip(hw[cand] * 1.5, 0, 1)
    touched = fall > 1e-3
    log(f'transfer: {touched.sum()} body verts receive deltas (of {len(cand)} candidates)')

    bary = np.zeros((len(cand), 3)); tri_v = np.zeros((len(cand), 3), dtype=np.int64)
    for i in np.where(touched)[0]:
        tv = face_tris[fc[i]]; tri_v[i] = tv
        bary[i] = barycentric(Qc[i], W[tv[0]], W[tv[1]], W[tv[2]])

    # local-space base positions for shape keys
    Minv = np.array(body.matrix_world.inverted())
    def to_local(Pw): return (Pw @ Minv[:3, :3].T) + Minv[:3, 3]
    base_local = to_local(BV)

    if not body.data.shape_keys:
        body.shape_key_add(name='Basis', from_mix=False)
    sk_stats = {}
    for eid in ids:
        D = deltas[eid]
        dv = np.zeros_like(BV)
        dloc = (bary[:, :, None] * D[tri_v]).sum(1) * fall[:, None]
        dv[cand] = dloc
        key = body.shape_key_add(name=eid, from_mix=False)
        new_local = to_local(BV + dv)
        key.data.foreach_set('co', new_local.reshape(-1))
        mag = np.linalg.norm(dv, axis=1)
        sk_stats[eid] = {'max_mm': float(mag.max() * 1000), 'verts_moved': int((mag > 1e-4).sum())}
    report['shape_keys'] = sk_stats
    log('shape keys written:', len(ids))

    # ---- symmetry sanity check (L vs R max displacement)
    asym = []
    for eid in ids:
        if eid.endswith('_L'):
            r = eid[:-2] + '_R'
            if r in sk_stats:
                a, b = sk_stats[eid]['max_mm'], sk_stats[r]['max_mm']
                if max(a, b) > 0 and abs(a - b) / max(a, b) > 0.35: asym.append((eid, a, b))
    report['asymmetric_pairs'] = asym
    if asym: log('note: asymmetric pairs', asym)

    # ---- clean up FaceKit, export
    bpy.data.objects.remove(fk, do_unlink=True)
    for o in bpy.data.objects: o.select_set(o in (body, arm))
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=out_path, export_format='GLB', use_selection=True,
        export_morph=True, export_morph_normal=False, export_morph_tangent=False,
        export_skins=True, export_animations=False, export_apply=False,
        export_yup=True, export_image_format='AUTO',
    )
    log('exported', out_path, f'({os.path.getsize(out_path) / 1e6:.1f} MB)')

    if args.preview:
        render_previews(body, ids, out_path)

    report['seconds'] = time.time() - t0
    rp = args.report or os.path.splitext(out_path)[0] + '.fit.json'
    json.dump(report, open(rp, 'w'), indent=1)
    log('report', rp, f'{report["seconds"]:.0f}s')

def render_previews(body, ids, out_path):
    """Front renders of the neutral and a few expressions, for a glance before opening Blender."""
    picks = [None] + [e for e in ('jawOpen', 'mouthSmile_L', 'browInnerUp_L', 'eyeBlink_L', 'mouthPucker', 'eyeWide_L') if e in ids]
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.render.resolution_x = sc.render.resolution_y = 512
    bb = world_verts(body)
    hw = head_weights(body); hp = bb[hw > 0.5]
    c = (hp.min(0) + hp.max(0)) / 2; h = hp[:, 2].max() - hp[:, 2].min()
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam)
    cam.location = Vector((c[0], c[1] - h * 2.6, c[2]))
    cam.rotation_euler = (math.pi / 2, 0, 0)
    cam.data.lens = 85; sc.camera = cam
    base = os.path.splitext(out_path)[0]
    for e in picks:
        for kb in body.data.shape_keys.key_blocks: kb.value = 0.0
        if e: body.data.shape_keys.key_blocks[e].value = 1.0
        if e and e.endswith('_L') and e[:-2] + '_R' in body.data.shape_keys.key_blocks:
            body.data.shape_keys.key_blocks[e[:-2] + '_R'].value = 1.0
        sc.render.filepath = f'{base}.preview.{e or "neutral"}.png'
        bpy.ops.render.render(write_still=True)
    for kb in body.data.shape_keys.key_blocks: kb.value = 0.0
    log('previews written next to', base)

if __name__ == '__main__':
    main()
