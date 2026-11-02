#!/usr/bin/env python3
"""Shoulder reweight: stop the chest wall and lat from riding up with the arm.

Auto-rig weights let the upper-arm bone reach well into the pec and the lat, so a raised
arm drags a shelf of torso with it and the armpit pinches.  This rebuilds the arm-vs-torso
split around each shoulder from the geometry:

  * cap      (above the joint, the deltoid): arm weight ramps 0 -> 1 over ~7 cm
  * armpit   (beside the joint): a vertex is ARM if its normal points away from the arm axis
             and it sits within the arm's radius; TORSO if its normal points toward the axis
             (chest wall / lat facing the arm) or it is far from the axis; a geodesic band of
             BAND metres each side of that crease is solved as a Laplacian blend (shorter
             tears the skin, longer drags the pec)
  * below    the arm keeps its existing Arm/ForeArm mix, the torso loses all arm weight

Usage:  shoulder.py <dumpDir> [band_m=0.07]   (pos.f32 jnt.u16 wgt.f32 idx.u32 joints.json from skindump.mjs)
Writes  <dumpDir>/wgt_new.f32 and jnt_new.u16
"""
import sys, json, numpy as np, scipy.sparse as sp
from scipy.sparse.csgraph import dijkstra

D = sys.argv[1]
BAND = float(sys.argv[2]) if len(sys.argv) > 2 else 0.07   # metres of blend each side of the crease
P = np.fromfile(f'{D}/pos.f32', np.float32).reshape(-1, 3).astype(np.float64)
J = np.fromfile(f'{D}/jnt.u16', np.uint16).reshape(-1, 4).astype(np.int64)
W = np.fromfile(f'{D}/wgt.f32', np.float32).reshape(-1, 4).astype(np.float64)
I = np.fromfile(f'{D}/idx.u32', np.uint32).reshape(-1, 3).astype(np.int64)
joints = json.load(open(f'{D}/joints.json'))
name2i = {j['name']: j['i'] for j in joints}
jpos = {j['name']: np.array(j['world']) for j in joints}
n = len(P)

# ---- welded topology (UV seams duplicate vertices) ----
key = np.round(P * 1e5).astype(np.int64)
_, uid, inv = np.unique(key, axis=0, return_index=True, return_inverse=True); inv = inv.ravel()
nu = len(uid)
F = inv[I]
e = np.vstack([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]]); e = np.sort(e, axis=1); e = np.unique(e, axis=0)
A = sp.coo_matrix((np.ones(len(e)), (e[:, 0], e[:, 1])), shape=(nu, nu)).tocsr(); A = A + A.T
elen = np.linalg.norm(P[uid][e[:, 0]] - P[uid][e[:, 1]], axis=1)
Aw = sp.coo_matrix((elen, (e[:, 0], e[:, 1])), shape=(nu, nu)).tocsr(); Aw = Aw + Aw.T   # edge lengths, for geodesic bands
deg = np.asarray(A.sum(1)).ravel(); deg[deg == 0] = 1
# area-weighted vertex normals on the welded mesh
fn = np.cross(P[I[:, 1]] - P[I[:, 0]], P[I[:, 2]] - P[I[:, 0]])
N = np.zeros((nu, 3))
for k in range(3): np.add.at(N, F[:, k], fn)
N /= np.linalg.norm(N, axis=1, keepdims=True) + 1e-12
# smooth the normals a little so the arm/torso test doesn't flicker along the crease
for _ in range(3):
    N = 0.5 * N + 0.5 * (A @ N) / deg[:, None]; N /= np.linalg.norm(N, axis=1, keepdims=True) + 1e-12
Pu = P[uid]

def smoothstep(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)

# per-vertex weight as dict helpers
def wsum(ids):
    m = np.isin(J, ids); return (W * m).sum(1)

def side(prefix):
    arm, fore, sh = name2i[f'{prefix}Arm'], name2i[f'{prefix}ForeArm'], name2i[f'{prefix}Shoulder']
    S, E = jpos[f'{prefix}Arm'], jpos[f'{prefix}ForeArm']
    u = (E - S); u /= np.linalg.norm(u)
    d = Pu - S; t = d @ u; rv = d - np.outer(t, u); r = np.linalg.norm(rv, axis=1)
    rhat = rv / (r[:, None] + 1e-9); nd = (N * rhat).sum(1)          # normal . outward-from-axis
    dist = np.linalg.norm(d, axis=1)
    # the arm's own radius along t, from vertices that clearly face outward
    armlike = (nd > 0.5) & (r < 0.1) & (t > 0.0) & (t < 0.3)
    R = np.full(nu, 0.075)
    for t0 in np.arange(0.0, 0.3, 0.02):
        b = armlike & (t >= t0) & (t < t0 + 0.02)
        if b.sum() > 30:
            R[(t >= t0) & (t < t0 + 0.02)] = np.percentile(r[b], 75)
    roi = (dist < 0.34) & (t < 0.3) & (np.sign(Pu[:, 0] - 0.0) == np.sign(S[0]) if True else True)
    roi &= (np.abs(Pu[:, 0]) > 0.02)   # never the midline
    # classify
    w = np.full(nu, np.nan)
    cap = (t < 0.0) & (r < 0.11) & (nd > -0.2)
    w[cap] = smoothstep(t[cap], -0.075, -0.005)
    pit = (t >= 0.0)
    is_arm = pit & (nd > 0.15) & (r < R * 1.25)
    is_torso = pit & ((nd < -0.15) | (r > R * 1.6) | (r > 0.115))
    w[is_arm] = 1.0; w[is_torso] = 0.0
    # torso-side of the cap region too (chest / back at shoulder height but far from the axis)
    w[(t < 0.0) & ((r >= 0.11) | (nd <= -0.2))] = 0.0
    w[~roi] = np.nan   # outside: untouched
    # the crease: where fixed ARM meets fixed TORSO, free a geodesic band of BAND metres on both sides
    # so the skin ramps over BAND metres instead of folding on one edge
    wf = np.where(np.isnan(w), -1.0, w)
    ok = (wf[e[:, 0]] >= 0) & (wf[e[:, 1]] >= 0) & roi[e[:, 0]] & roi[e[:, 1]]
    bedge = ok & (np.abs(wf[e[:, 0]] - wf[e[:, 1]]) > 0.5)
    seeds = np.unique(e[bedge].ravel())
    band = np.zeros(nu, bool)
    if len(seeds):
        dgeo = dijkstra(Aw, directed=False, indices=seeds, min_only=True, limit=BAND)
        band = np.isfinite(dgeo)
    w[band & roi & (t >= -0.06)] = np.nan
    fixed = roi & ~np.isnan(w)
    solve = roi & np.isnan(w)
    a_old_u = wsum([arm, fore])[uid]            # outside the ROI the field is simply what it was
    w2 = np.where(np.isnan(w), a_old_u, w)
    # Laplace on the unclassified crease vertices
    for _ in range(300):
        avg = (A @ w2) / deg
        w2[solve] = avg[solve]
    # a light pass over the whole ROI so there are no razor steps (the crease stays short)
    for _ in range(6):
        avg = (A @ w2) / deg
        w2[roi] = 0.5 * w2[roi] + 0.5 * avg[roi]
    # below t=0.2 arm vertices keep what they had (elbow blend), the torso goes to 0
    keep = roi & (t > 0.2) & ~is_torso
    return dict(arm=arm, fore=fore, sh=sh, w=w2, roi=roi & ~keep, nsolve=int(solve.sum()), nfix=int(fixed.sum()))

out_J, out_W = J.copy(), W.copy()
for prefix in ('Left', 'Right'):
    s = side(prefix)
    wv = s['w'][inv]; roi = s['roi'][inv]
    arm, fore, sh = s['arm'], s['fore'], s['sh']
    idx = np.where(roi)[0]
    changed = 0
    for v in idx:
        wd = {}
        for k in range(4):
            if W[v, k] > 0: wd[int(J[v, k])] = wd.get(int(J[v, k]), 0.0) + float(W[v, k])
        a_old = wd.get(arm, 0.0) + wd.get(fore, 0.0)
        a_new = float(np.clip(wv[v], 0, 1))
        if abs(a_new - a_old) < 0.01: continue
        new = {}
        if a_new > 0:
            if a_old > 0:
                new[arm] = a_new * wd.get(arm, 0.0) / a_old; new[fore] = a_new * wd.get(fore, 0.0) / a_old
            else: new[arm] = a_new
        t_old = 1.0 - a_old
        if t_old > 1e-6:
            for j, x in wd.items():
                if j in (arm, fore): continue
                new[j] = new.get(j, 0.0) + x * (1.0 - a_new) / t_old
        else:
            new[sh] = new.get(sh, 0.0) + (1.0 - a_new)
        items = sorted([(x, j) for j, x in new.items() if x > 1e-5], reverse=True)[:4]
        tot = sum(x for x, _ in items)
        out_J[v] = 0; out_W[v] = 0
        for k, (x, j) in enumerate(items): out_J[v, k] = j; out_W[v, k] = x / tot
        changed += 1
    print(f'{prefix}: roi {len(idx)} verts, changed {changed}, crease solved {s["nsolve"]}, fixed {s["nfix"]}')

out_W.astype(np.float32).tofile(f'{D}/wgt_new.f32'); out_J.astype(np.uint16).tofile(f'{D}/jnt_new.u16')
print('wrote', D)
