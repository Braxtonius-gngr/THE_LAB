# Reshape a full-coverage garment (trunks/briefs with a thick waistband and
# leg hems) back to skin. Unlike reshape.py's fixed 4 mm pull, the garment is
# pulled in by its fabric thickness T with a smooth harmonic ramp to zero across
# a band at its edges (no ledge), its lips and wrinkles are relaxed away
# (volume-preserving), then the front is thin-plate filled and the gluteal
# cleft restored.
import numpy as np, scipy.sparse as sp, sys
from scipy.sparse.linalg import spsolve
T = float(sys.argv[1]) if len(sys.argv) > 1 else 0.007        # fabric thickness, m
CLEFT_TOP, CLEFT_BOT = (float(sys.argv[2]), float(sys.argv[3])) if len(sys.argv) > 3 else (0.935, 0.70)
I = np.fromfile('idx.bin', np.uint32).reshape(-1, 3); W = np.load('W.npy'); vm = np.load('vmask.npy')
key = np.round(W * 1e5).astype(np.int64); _, uid, inv = np.unique(key, axis=0, return_index=True, return_inverse=True); inv = inv.ravel()
U = W[uid].copy(); n = len(U); F = inv[I]
m = np.zeros(n, bool); np.logical_or.at(m, inv, vm)
e = np.vstack([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]]); A = sp.coo_matrix((np.ones(len(e)), (e[:, 0], e[:, 1])), shape=(n, n)); A = ((A + A.T) > 0).astype(float).tocsr()
L = sp.diags(1 / np.maximum(np.asarray(A.sum(1)).ravel(), 1)) @ A
for _ in range(6): m = m | (((L @ m.astype(float)) > 0.5) & (U[:, 1] > 0.6) & (U[:, 1] < 1.05))
for _ in range(2): m = m & ((L @ m.astype(float)) > 0.25)
def rings(start, within, k):
    d = np.full(n, 99); cur = start.copy(); d[cur] = 0; seen = cur.copy()
    for r in range(1, k + 1):
        nx = ((A @ cur.astype(float)) > 0) & within & ~seen; d[nx] = r; seen |= nx; cur = nx
    return d
edge_in = m & ((A @ (~m).astype(float)) > 0); edge_out = ~m & ((A @ m.astype(float)) > 0)
ri = rings(edge_in, m, 30); ro = rings(edge_out, ~m, 30)
def normals(V):
    a, b, c = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]; fn = np.cross(b - a, c - a); N = np.zeros_like(V)
    for k in range(3): np.add.at(N, F[:, k], fn)
    return N / np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-12)
x, y, z = U.T
K = 7
# 1) the pull: T deep inside, 0 out on the skin, a harmonic ramp across the band
s = np.where(m & (ri >= K), 1.0, 0.0)
band = (m & (ri < K)) | (~m & (ro <= K))
bi = np.where(band)[0]
for it in range(1500): s[bi] = (L @ s)[bi]
s = s * s * (3 - 2 * s)
Ns = normals(U)
for _ in range(20): Ns = L @ Ns
Ns /= np.maximum(np.linalg.norm(Ns, axis=1, keepdims=True), 1e-12)
# orient outward: compare with the direction from the body's vertical axis (the winding varies by exporter)
axis = np.stack([np.full(n, np.median(x)), y, np.full(n, np.median(z))], 1)
if np.sum(Ns[m] * (U[m] - axis[m])) < 0: Ns = -Ns; print('normals flipped to face outward')
U -= Ns * (T * s)[:, None]
# 2) relax lips and wrinkles: Taubin (no shrink) over the garment and its band
zone = m | (~m & (ro <= K + 3)); zi = np.where(zone)[0]
for it in range(160):
    U[zi] = U[zi] + 0.5 * ((L @ U)[zi] - U[zi])
    U[zi] = U[zi] - 0.53 * ((L @ U)[zi] - U[zi])
# 2b) the stitch strips: the waistband and hems are packed with dense, jittery
# micro-geometry (dozens of vertices in a few mm) - relax just those, hard
eL = np.linalg.norm(U[e[:, 0]] - U[e[:, 1]], axis=1)
acc = np.zeros(n); cntv = np.zeros(n); np.add.at(acc, e[:, 0], eL); np.add.at(cntv, e[:, 0], 1); np.add.at(acc, e[:, 1], eL); np.add.at(cntv, e[:, 1], 1)
avg = acc / np.maximum(cntv, 1)
dense = zone & (avg < np.median(avg[zone]) * 0.45)
for _ in range(2): dense = dense | (((A @ dense.astype(float)) > 0) & zone)
di = np.where(dense)[0]
for it in range(300): U[di] = 0.5 * U[di] + 0.5 * (L @ U)[di]
for it in range(40):
    U[zi] = U[zi] + 0.5 * ((L @ U)[zi] - U[zi]); U[zi] = U[zi] - 0.53 * ((L @ U)[zi] - U[zi])
print('stitch-strip verts relaxed', dense.sum())
# 3) the front: thin-plate fill over the pouch (+8 rings), the rest held
x, y, z = U.T
PB = [float(v) for v in sys.argv[4].split(',')] if len(sys.argv) > 4 else [0.06, 0.74, 0.88]   # pouch half-width, bottom, top
pouch = m & (((z > 0.04) & (np.abs(x) < PB[0]) & (y > PB[1]) & (y < PB[2])) | ((np.abs(x) < 0.04) & (y > PB[1] - 0.04) & (y < PB[1] + 0.06)))
grow = pouch.copy()
for _ in range(5): grow = grow | ((A @ grow.astype(float)) > 0)
Lap = sp.identity(n, format='csr') - L; L2 = (Lap @ Lap).tocsr()
fi = np.where(grow)[0]; bo = np.where(~grow)[0]
M = L2[fi][:, fi].tocsc(); R = -(L2[fi][:, bo] @ U[bo])
for k in range(3): U[fi, k] = spsolve(M, R[:, k])
# 4) the gluteal cleft: a groove up the back midline the fabric bridged
x, y, z = U.T
def ss(a, b, t): t = np.clip((t - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)
prof = ss(CLEFT_TOP, CLEFT_TOP - 0.05, y) * ss(CLEFT_BOT, CLEFT_BOT + 0.03, y)
back = ss(-0.012, -0.045, z) * m.astype(float)
dep = 0.022 * np.exp(-(x / 0.017) ** 2) * prof * back
U[:, 2] += dep
cm = dep > 1e-4
for _ in range(3): cm = cm | ((A @ cm.astype(float)) > 0)
ci = np.where(cm)[0]
for it in range(12):
    U[ci] = U[ci] - 0.34 * ((L @ U)[ci] - U[ci]); U[ci] = 0.68 * U[ci] + 0.32 * (L @ U)[ci]
# 5) untangle: triangles folded or turned steeply against the surface (the fabric's
# edge stitched to the skin) - relax their vertices until none remain
for rnd in range(8):
    a_, b_, c_ = U[F[:, 0]], U[F[:, 1]], U[F[:, 2]]; fn = np.cross(b_ - a_, c_ - a_)
    VN = np.zeros((n, 3))
    for k in range(3): np.add.at(VN, F[:, k], fn)
    for _ in range(8): VN = L @ VN
    VN /= np.maximum(np.linalg.norm(VN, axis=1, keepdims=True), 1e-12)
    d = ((fn / np.maximum(np.linalg.norm(fn, axis=1, keepdims=True), 1e-15)) * VN[F].mean(1)).sum(1)
    bad = zone[F].any(1) & (d < 0.5)
    if rnd == 0 or bad.sum() == 0: print('round', rnd, 'folded/steep', bad.sum())
    if bad.sum() == 0: break
    bv = np.zeros(n, bool); bv[F[bad].ravel()] = True
    for _ in range(1 + rnd // 2): bv = bv | ((A @ bv.astype(float)) > 0)
    vi = np.where(bv)[0]
    for it in range(120): U[vi] = 0.5 * U[vi] + 0.5 * (L @ U)[vi]
print('after untangle: folded/steep', int(bad.sum()))
print('garment verts', m.sum(), 'moved max (cm)', (np.linalg.norm(U - W[uid], axis=1).max() * 100).round(2))
np.save('newW.npy', U[inv]); np.save('mask_w.npy', m[inv])
