# Paint body hair, strand by strand, over the repainted pelvis.
# Hairs are placed on the 3D surface (density per cm^2 by region, direction
# from a flow field: down the belly line, converging on the groin, down and
# out over hips, thighs and glutes), then each strand is drawn into the
# texture through its triangle's own 3D->UV mapping, so they follow the body
# across the UV layout instead of tiling.
import numpy as np, cv2, sys
rng = np.random.default_rng(7)
SRC, OUT = sys.argv[1], sys.argv[2]
UV = np.fromfile('uv.bin', np.float32).reshape(-1, 2); I = np.fromfile('idx.bin', np.uint32).reshape(-1, 3)
W = np.load('newW.npy'); fillv = np.load('mask_w.npy')
img = cv2.cvtColor(cv2.imread(SRC), cv2.COLOR_BGR2RGB).astype(np.float32); h, w, _ = img.shape
ROOT = np.array([0.003, 0.815, 0.101])          # the anatomy's root (bodies.json)
x, y, z = W.T

def ss(a, b, t): t = np.clip((t - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)

# --- density, hairs per cm^2, per vertex ---
front = ss(-0.01, 0.03, z); back = ss(0.01, -0.03, z)
dx = np.abs(x - ROOT[0])
# pubic: a soft inverted triangle above and around the root, densest at the root
pub = np.exp(-((dx / (0.035 + 0.5 * np.clip(y - ROOT[1], 0, None))) ** 2)) * ss(ROOT[1] + 0.09, ROOT[1] + 0.03, y) * ss(ROOT[1] - 0.05, ROOT[1] - 0.01, y) * front
trail = np.exp(-(dx / 0.012) ** 2) * ss(ROOT[1] + 0.03, ROOT[1] + 0.07, y) * front           # the line up to the navel
groin = np.exp(-((dx - 0.07) / 0.03) ** 2) * ss(ROOT[1] - 0.06, ROOT[1] - 0.02, y) * ss(ROOT[1] + 0.06, ROOT[1] + 0.0, y)
thigh = ss(ROOT[1] + 0.0, ROOT[1] - 0.05, y)                                                   # the leg openings: match the hairy thighs
cleft = np.exp(-(dx / 0.02) ** 2) * back
dens = 3.0 + 13.0 * pub + 5.0 * trail + 3.5 * groin + 6.0 * thigh + 2.0 * cleft + 1.5 * back
dens *= 0.85 + 0.3 * rng.random(len(dens))

# --- flow direction, per vertex (3D, cm) ---
down = np.tile([0.0, -1.0, 0.0], (len(W), 1))
toward = ROOT - W; toward[:, 1] -= 0.04; toward /= np.linalg.norm(toward, axis=1, keepdims=True) + 1e-9
out = np.stack([np.sign(x - ROOT[0]), np.zeros_like(x), np.zeros_like(x)], 1)
d = down + 1.6 * (pub + trail)[:, None] * toward + (0.35 * thigh + 0.5 * back)[:, None] * out
d /= np.linalg.norm(d, axis=1, keepdims=True) + 1e-9

# --- hair colour (darker than the skin-hair mix in the texture) and length ---
HAIR = np.array([88, 52, 33], np.float32)
layerP = np.zeros((h, w), np.float32); layerB = np.zeros((h, w), np.float32)   # coarse pubic hair / fine body hair

band = np.load('band_w.npy') if __import__('os').path.exists('band_w.npy') else np.zeros(len(W), bool)
dens = np.where(band & ~fillv, np.minimum(dens, 3.0), dens)          # the smooth strip outside the old waistband: fine hair like the belly
tris = np.where(fillv[I].all(1) | band[I].all(1))[0]
P3 = W[I[tris]] * 100.0; Q2 = UV[I[tris]] * [w, h]
area = 0.5 * np.linalg.norm(np.cross(P3[:, 1] - P3[:, 0], P3[:, 2] - P3[:, 0]), axis=1)
dt = dens[I[tris]].mean(1); n_h = rng.poisson(area * dt)
total = 0
for k in np.where(n_h > 0)[0]:
    p, q, vi = P3[k], Q2[k], I[tris[k]]
    E1, E2 = p[1] - p[0], p[2] - p[0]; F1, F2 = q[1] - q[0], q[2] - q[0]
    G = np.array([[E1 @ E1, E1 @ E2], [E1 @ E2, E2 @ E2]])
    if abs(np.linalg.det(G)) < 1e-12: continue
    Gi = np.linalg.inv(G)
    for _ in range(n_h[k]):
        a, b = rng.random(2)
        if a + b > 1: a, b = 1 - a, 1 - b
        bc = np.array([1 - a - b, a, b])
        uv0 = bc @ q
        t3 = bc @ d[vi]
        # jitter the direction a little, keep it in the surface plane
        nrm = np.cross(E1, E2); nrm /= np.linalg.norm(nrm) + 1e-9
        t3 = t3 + rng.normal(0, 0.28, 3); t3 -= (t3 @ nrm) * nrm; t3 /= np.linalg.norm(t3) + 1e-9
        coarse = (bc @ (pub + trail)[vi]) > 0.15 + 0.35 * rng.random()          # pubic and belly-line hair: coarse and curly
        L = rng.uniform(0.6, 1.1) if coarse else rng.uniform(0.3, 0.65)      # cm
        ab = Gi @ np.array([t3 @ E1, t3 @ E2])                                    # 3D direction -> UV direction
        duv = (ab[0] * F1 + ab[1] * F2) * L
        if not np.isfinite(duv).all() or np.hypot(*duv) > 60: continue
        # a gentle curl: a quadratic bezier bent sideways
        side = np.array([-duv[1], duv[0]]) * rng.normal(0, 0.3 if coarse else 0.07)
        pts = [uv0 + duv * s + side * 4 * s * (1 - s) for s in np.linspace(0, 1, 6)]
        pts = np.round(np.array(pts) * 16).astype(np.int32)
        op = rng.uniform(0.5, 0.85) if coarse else rng.uniform(0.32, 0.62)
        cv2.polylines(layerP if coarse else layerB, [pts], False, op, 1, cv2.LINE_AA, shift=4)
        total += 1
print('hairs drawn', total)

# keep strokes on the pelvis region's own texels (no bleeding into other UV islands)
region = np.load('hair_region.npy') if len(sys.argv) > 3 else None
if region is not None: layerP *= region; layerB *= region
lp = np.clip(layerP, 0, 1)[..., None]; lb = np.clip(layerB, 0, 1)[..., None]
# dense hair also darkens the skin tone a touch underneath
shade = cv2.GaussianBlur(lp[..., 0] + 0.5 * lb[..., 0], (0, 0), 6)[..., None]
outimg = img * (1 - 0.15 * np.clip(shade * 2.5, 0, 1))
FINE = HAIR * 0.8 + np.array([150, 92, 60], np.float32) * 0.2      # body hair: finer and lighter than the pubic
outimg = outimg * (1 - lb) + FINE * lb
outimg = outimg * (1 - lp) + HAIR * lp
layer = np.maximum(lp, lb)
cv2.imwrite(OUT, cv2.cvtColor(np.clip(outimg, 0, 255).astype(np.uint8), cv2.COLOR_RGB2BGR))
cv2.imwrite('/tmp/claude-0/hair_layer.png', (255 - layer[..., 0] * 255).astype(np.uint8)[::4, ::4])
