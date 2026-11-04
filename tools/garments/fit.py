#!/usr/bin/env python3
"""Fit a Meshy garment (normalised to a ~1 m cube) onto a rigged body.

  fit.py <garmentDumpDir> <bodyDumpDir> <kind> <outDir>

garmentDumpDir: pos.f32 / idx.u32 from gdump.mjs; bodyDumpDir: skindump.mjs output (world
positions, joints, weights, node.json). Kinds (where it sits on a 170 cm man, metres):

  top     collar at `top`, hem `h` below; sleeves swung about the shoulder to the body's arm angle
  pants   waist at `top`, cuffs at `bottom`
  under   waistband at `top`, leg openings / hem at `bottom`
  socks   cuffs at `top`, soles on the floor

Steps: uniform scale to the garment's height on this body, centre it on the body's own band,
swing sleeves to the arms, push anything inside the skin out to `off` above it (a few passes,
displacement smoothed so it doesn't crinkle), then copy skin weights from the nearest body
vertices (a Gaussian blend of k neighbours, top 4 joints kept). Writes pos.f32 in the body
mesh's local space plus jnt.u16 / wgt.f32 for gwrite.mjs, and hide.u32: the body triangles it covers.
"""
import sys, json, numpy as np
from scipy.spatial import cKDTree
import scipy.sparse as sp

G, B, kind, OUT = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
spec = json.loads(sys.argv[5]) if len(sys.argv) > 5 else {}
gp = np.fromfile(f'{G}/pos.f32', np.float32).reshape(-1, 3).astype(np.float64)
gi = np.fromfile(f'{G}/idx.u32', np.uint32).reshape(-1, 3)
bp = np.fromfile(f'{B}/pos.f32', np.float32).reshape(-1, 3).astype(np.float64)
bi = np.fromfile(f'{B}/idx.u32', np.uint32).reshape(-1, 3)
bj = np.fromfile(f'{B}/jnt.u16', np.uint16).reshape(-1, 4)
bw = np.fromfile(f'{B}/wgt.f32', np.float32).reshape(-1, 4)
joints = {j['name']: np.array(j['world']) for j in json.load(open(f'{B}/joints.json'))}
M = np.array(json.load(open(f'{B}/node.json'))['matrix']).reshape(4, 4).T   # column-major -> row-major

D = dict(hat=dict(top=0, bottom=0), shoes=dict(top=0.12, bottom=0.0), top=dict(top=1.47, h=0.68), pants=dict(top=1.0, bottom=0.03), under=dict(top=0.98, bottom=0.72),
         socks=dict(top=0.32, bottom=0.0))[kind]
D.update(spec)
off = D.get('off', 0.006)

# ---- body normals (area weighted) ----
fn = np.cross(bp[bi[:, 1]] - bp[bi[:, 0]], bp[bi[:, 2]] - bp[bi[:, 0]])
bn = np.zeros_like(bp)
for k in range(3): np.add.at(bn, bi[:, k], fn)
bn /= np.linalg.norm(bn, axis=1, keepdims=True) + 1e-12
tree = cKDTree(bp)

# ---- scale and place ----
lo, hi = gp.min(0), gp.max(0)
if kind == 'hat':
    # a head's width (temple to temple) sets the size; its crown sits `lift` above the scalp
    hy = bp[:, 1].max(); band = bp[(bp[:, 1] > hy - 0.12) & (bp[:, 1] < hy - 0.06)]
    s = (band[:, 0].max() - band[:, 0].min()) * D.get('w', 1.12) / (hi[0] - lo[0]); ytop = hy + D.get('lift', 0.012)
elif kind == 'top':
    s = D['h'] / (hi[1] - lo[1]); ytop = D['top']
else:
    s = (D['top'] - D['bottom']) / (hi[1] - lo[1]); ytop = D['top']
g = gp * s
g[:, 1] += ytop - g[:, 1].max()
g[:, 0] -= (g[:, 0].max() + g[:, 0].min()) / 2
# depth: centre on the body's own band at the garment's mid height
band = (bp[:, 1] > g[:, 1].min()) & (bp[:, 1] < g[:, 1].max()) & (np.abs(bp[:, 0]) < (0.12 if kind == 'hat' else 0.2))
g[:, 2] += (bp[band, 2].max() + bp[band, 2].min()) / 2 - (g[:, 2].max() + g[:, 2].min()) / 2
g[:, 2] += D.get('dz', 0)

# ---- shoes: each one onto its own foot, as long as the foot plus `room`, sole on the floor ----
if kind == 'shoes':
    for sx in (1, -1):
        sh = sx * g[:, 0] > 0
        ft = bp[(bp[:, 1] < D['top'] + 0.02) & (sx * bp[:, 0] > 0.02)]
        flen = ft[:, 2].max() - ft[:, 2].min(); slen = g[sh, 2].max() - g[sh, 2].min()
        k = (flen + D.get('room', 0.02)) / slen
        c = np.array([(g[sh, 0].max() + g[sh, 0].min()) / 2, g[sh, 1].min(), (g[sh, 2].max() + g[sh, 2].min()) / 2])
        fc = np.array([(ft[:, 0].max() + ft[:, 0].min()) / 2, 0.0, (ft[:, 2].max() + ft[:, 2].min()) / 2 + D.get('heel', 0.004)])
        g[sh] = fc + (g[sh] - c) * k
        print(f'{"L" if sx > 0 else "R"} shoe: foot {flen*100:.1f} cm, shoe scaled {k:.2f}')

# ---- sleeves to the arms (tops) ----
if kind == 'top' and not D.get('sleeveless'):
    for side, sx in (('Left', 1), ('Right', -1)):
        S, E = joints[f'{side}Arm'], joints[f'{side}ForeArm']
        want = np.arctan2(-(E[1] - S[1]), sx * (E[0] - S[0]))           # body arm, down from horizontal
        sl = (sx * g[:, 0] > abs(S[0]) + 0.03) & (g[:, 1] < S[1] + 0.08)
        if sl.sum() < 50: continue
        c = g[sl]; v = c - c.mean(0)
        ax = np.linalg.svd(v[:, :2], full_matrices=False)[2][0]
        if ax[0] * sx < 0: ax = -ax
        have = np.arctan2(-ax[1], sx * ax[0])
        dA = (want - have) * sx * -1                                       # rotate in xy about the shoulder
        piv = np.array([S[0], S[1]])
        w = np.clip((sx * g[:, 0] - (abs(S[0]) - 0.06)) / 0.08, 0, 1) * (g[:, 1] < S[1] + 0.1)
        rel = g[:, :2] - piv; ca, sa = np.cos(dA * w), np.sin(dA * w)
        g[:, 0] = piv[0] + rel[:, 0] * ca - rel[:, 1] * sa
        g[:, 1] = piv[1] + rel[:, 0] * sa + rel[:, 1] * ca
        print(f'{side} sleeve: had {np.degrees(have):.0f} deg, arm {np.degrees(want):.0f} deg')

# ---- push out of the body ----
gnb = gi.astype(np.int64)
e = np.vstack([gnb[:, [0, 1]], gnb[:, [1, 2]], gnb[:, [2, 0]]])
A = sp.coo_matrix((np.ones(len(e)), (e[:, 0], e[:, 1])), shape=(len(g), len(g))).tocsr(); A = A + A.T
deg = np.asarray(A.sum(1)).ravel(); deg[deg == 0] = 1
for it in range(6):
    d, k = tree.query(g)
    n = bn[k]; dist = ((g - bp[k]) * n).sum(1)
    push = np.clip(off - dist, 0, None)[:, None] * n
    for _ in range(4): push = 0.5 * push + 0.5 * (A @ push) / deg[:, None]
    g += push * 1.2
d, k = tree.query(g); inside = (((g - bp[k]) * bn[k]).sum(1) < 0).sum()
print(f'{kind}: scale {s:.3f}, inside after push {inside} / {len(g)}')

# ---- weights from the nearest skin ----
dd, kk = tree.query(g, k=12)
sig = np.maximum(dd[:, :1], 0.01)
gw = np.exp(-(dd / sig) ** 2)
NJ = int(bj.max()) + 1
acc = np.zeros((len(g), NJ))
for c in range(12):
    for q in range(4):
        np.add.at(acc, (np.arange(len(g)), bj[kk[:, c], q]), gw[:, c] * bw[kk[:, c], q])
top4 = np.argsort(-acc, 1)[:, :4]
W = np.take_along_axis(acc, top4, 1); W /= W.sum(1, keepdims=True) + 1e-12
J = top4.astype(np.uint16)

# ---- into the body mesh's local space ----
Minv = np.linalg.inv(M)
loc = (np.c_[g, np.ones(len(g))] @ Minv.T)[:, :3]
import os; os.makedirs(OUT, exist_ok=True)
loc.astype(np.float32).tofile(f'{OUT}/pos.f32'); J.tofile(f'{OUT}/jnt.u16'); W.astype(np.float32).tofile(f'{OUT}/wgt.f32')
np.save(f'{OUT}/world.npy', g)
# ---- the skin this garment covers: body triangles whose three corners all lie within `cover` of
# the cloth (hidden at load so the skin can't flicker through; restored when it comes off) ----
gt = cKDTree(g); dB, _ = gt.query(bp, distance_upper_bound=D.get('cover', 0.03))
cov = np.isfinite(dB)
# (not where the garment ends: keep a ring of skin under each opening so no gap shows at a cuff)
# (trousers: keep the skin of the last few cm above the hem, so no gap shows between hem and shoe)
if kind == 'pants': cov &= bp[:, 1] > g[:, 1].min() + D.get('hemkeep', 0.05)
hid = np.where(cov[bi].all(1))[0].astype(np.uint32)
hid.tofile(f'{OUT}/hide.u32'); print(f'hides {len(hid)} body triangles')
