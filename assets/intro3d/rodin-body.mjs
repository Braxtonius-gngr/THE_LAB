// The Rodin body: a body made in Rodin (one unrigged mesh, a GLB) bound to a
// lab man's own skeleton (figure.mjs's rig), so his poses, his anatomy and
// its physics run on it as they run on his procedural body. Shared by the lab
// (lab/anatomy.mjs, its Rodin man) and the proof page (lab/rodin.html).
//
//   - the mesh is turned to the lab's facing (-z), its height warped
//     piecewise to the man's joints (knee, hip, shoulder, head), and its
//     arms - made hanging out from the body - laid down to hang as his do
//   - each point is owned by a bone (a geodesic Voronoi over the mesh's own
//     edges, from seeds in the trunk, the limbs and the head); the shoulder
//     and the hip are graded by geodesic nearness rather than cut, the elbow
//     and the knee shared across the joint as figure.mjs's skin shares them
//   - the front of the pelvis, made in shorts, is drawn back to a plain
//     surface for the anatomy, which is the man's own object (his `pouch`)
//
// Not yet: the head and face on the head's bone (the neck carries them), the
// hands' grip and the feet's ankle, garments fitted to this body.

import * as THREE from '../vendor/three/three.module.js';
import { GLTFLoader } from '../vendor/three/three.addons.js';
import { outlineOf } from './burin.mjs';

const PI = Math.PI;
export const RODIN_URL = new URL('./rare/bodies/rodin-lean.glb', import.meta.url).href;
// (the build the mesh is closest to, for the man whose skeleton it takes)
export const RODIN_BUILD = { height: 1, mass: -0.2, muscle: 0.5, age: 0 };

// The mesh's own landmarks, in metres in the file's frame (facing +z,
// feet on y 0, 1.8 m tall), read off this body: the + x side's arm, the
// knee, the hip joint, the shoulder's joint and the head's start. Another
// body from Rodin wants its own (a fit from the mesh is the next step).
const LM = {
  knee: 0.47, hip: 0.90, shoulder: 1.38, top: 1.80,
  S: [0.20, 1.40, -0.05], E: [0.33, 1.00, -0.03], W: [0.39, 0.80, 0.07], H: [0.39, 0.70, 0.08],
  head: 1.56, torso: { x: 0.12, y0: 0.93, y1: 1.30 }, leg: { x: 0.04, y0: 0.50, y1: 0.74 }
};
export const BONES = ['hips', 'legL', 'legR', 'kneeL', 'kneeR', 'shL', 'shR', 'elL', 'elR', 'neck'];
const smooth01 = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

// the body's mesh, loaded once
let loading = null;
export function loadRodinGeometry(url = RODIN_URL) {
  if (!loading) loading = new Promise((res, rej) => new GLTFLoader().load(url, gltf => {
    let geo = null; gltf.scene.traverse(o => { if (!geo && o.isMesh) geo = o.geometry; });
    if (geo) res(geo); else rej(new Error('rodin: no mesh in ' + url));
  }, undefined, rej));
  return loading;
}

function jointAt(group) { return group.getWorldPosition(new THREE.Vector3()); }

function weldMesh(geo) {
  const p = geo.attributes.position, n = p.count, key = new Map(), canon = new Int32Array(n), pos = [];
  for (let i = 0; i < n; i++) {
    const k = Math.round(p.getX(i) * 1e5) + ',' + Math.round(p.getY(i) * 1e5) + ',' + Math.round(p.getZ(i) * 1e5);
    let c = key.get(k);
    if (c == null) { c = pos.length / 3; key.set(k, c); pos.push(p.getX(i), p.getY(i), p.getZ(i)); }
    canon[i] = c;
  }
  const idx = geo.index ? Array.from(geo.index.array, i => canon[i]) : Array.from({ length: n }, (_, i) => canon[i]);
  return { pos: Float32Array.from(pos), idx: Uint32Array.from(idx), n: pos.length / 3 };
}

// a small binary heap of (distance, vertex)
class Heap {
  constructor() { this.d = []; this.v = []; }
  push(d, v) {
    let i = this.d.length; this.d.push(d); this.v.push(v);
    while (i > 0) { const p = (i - 1) >> 1; if (this.d[p] <= d) break; this.d[i] = this.d[p]; this.v[i] = this.v[p]; i = p; }
    this.d[i] = d; this.v[i] = v;
  }
  pop() {
    const n = this.d.length - 1, d0 = this.d[0], v0 = this.v[0], dl = this.d.pop(), vl = this.v.pop();
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1; if (c >= n) break;
        if (c + 1 < n && this.d[c + 1] < this.d[c]) c++;
        if (this.d[c] >= dl) break;
        this.d[i] = this.d[c]; this.v[i] = this.v[c]; i = c;
      }
      this.d[i] = dl; this.v[i] = vl;
    }
    return [d0, v0];
  }
  get size() { return this.d.length; }
}

// each vertex the label of the nearest seed along the surface's own edges
function geodesicLabels(mesh, seedOf) {
  const { pos, idx, n } = mesh, deg = new Int32Array(n + 1);
  for (let t = 0; t < idx.length; t += 3) for (let k = 0; k < 3; k++) { deg[idx[t + k] + 1] += 2; }
  for (let i = 0; i < n; i++) deg[i + 1] += deg[i];
  const fill = deg.slice(0, n), adj = new Int32Array(deg[n]);
  for (let t = 0; t < idx.length; t += 3) for (let k = 0; k < 3; k++) { const a = idx[t + k], b = idx[t + (k + 1) % 3]; adj[fill[a]++] = b; adj[fill[b]++] = a; }
  const dist = new Float64Array(n).fill(Infinity), lab = new Int8Array(n).fill(-1), heap = new Heap();
  for (let i = 0; i < n; i++) { const s = seedOf(i); if (s >= 0) { dist[i] = 0; lab[i] = s; heap.push(0, i); } }
  while (heap.size) {
    const [d, v] = heap.pop(); if (d > dist[v]) continue;
    for (let e = deg[v]; e < deg[v + 1]; e++) {
      const w = adj[e], dx = pos[3 * v] - pos[3 * w], dy = pos[3 * v + 1] - pos[3 * w + 1], dz = pos[3 * v + 2] - pos[3 * w + 2], nd = d + Math.hypot(dx, dy, dz);
      if (nd < dist[w]) { dist[w] = nd; lab[w] = lab[v]; heap.push(nd, w); }
    }
  }
  return { lab, dist };
}
function segDist(p, a, b) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const t = Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / (ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2)));
  return Math.hypot(ap[0] - t * ab[0], ap[1] - t * ab[1], ap[2] - t * ab[2]);
}
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// The mesh was made in a pair of shorts, and the front of its pelvis keeps
// their shape: a bump at the fork. The lab's anatomy is its own object, drawn
// and simulated from the hips, so the body under it wants the plain surface
// a body has there - the belly's line carried down to the thighs'. Each point
// in the bump is drawn back to that surface, eased out at the bump's edge.
// (File frame, metres: +z the front. The bump spans |x| < 0.075, y 0.82-0.94.)
const FLAT = { x: 0.075, y0: 0.80, y1: 0.945, zc: [[0.95, 0.083], [0.88, 0.076], [0.82, 0.068], [0.72, 0.050]], k: 4 };
function flatZ(y) {
  const c = FLAT.zc;
  if (y >= c[0][0]) return c[0][1];
  for (let i = 0; i < c.length - 1; i++) if (y >= c[i + 1][0]) { const t = (y - c[i + 1][0]) / (c[i][0] - c[i + 1][0]); return c[i + 1][1] + t * (c[i][1] - c[i + 1][1]); }
  return c[c.length - 1][1];
}
function flattenPelvis(P) {
  for (let i = 0; i < P.length / 3; i++) {
    const x = Math.abs(P[3 * i]), y = P[3 * i + 1], z = P[3 * i + 2];
    if (z < 0.02 || x > FLAT.x * 1.25 || y < FLAT.y0 - 0.03 || y > FLAT.y1 + 0.03) continue;
    const mx = 1 - smooth01((x - FLAT.x * 0.7) / (FLAT.x * 0.55)), my = smooth01((y - (FLAT.y0 - 0.03)) / 0.03) * (1 - smooth01((y - FLAT.y1) / 0.03));
    const zt = flatZ(y) - FLAT.k * x * x, over = z - zt;
    if (over > 0) P[3 * i + 2] = z - over * mx * my;
  }
}
// what the anatomy's simulation wants of this body: the thigh's round, and how
// far the trunk's front stands from the hips' axis (cm), as figure.mjs keeps
// them for its own (`colliders`)
function measureBody(P, SH) {
  const n = P.length / 3; let thMax = -1, thMin = 1, belly = -1;
  for (let i = 0; i < n; i++) {
    const x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2];
    if (y > 0.70 && y < 0.78 && x > 0.02 && x < 0.22) { thMax = Math.max(thMax, x); thMin = Math.min(thMin, x); }
    if (y > 1.00 && y < 1.08 && Math.abs(x) < 0.04) belly = Math.max(belly, z);
  }
  return { thighR: (thMax - thMin) / 2 * SH, bellyR: belly * SH };
}

function fitBody(srcGeo, man, opts = {}) {
  const u = man.userData, rig = u.rig, bi = rig.index;
  man.updateMatrixWorld(true);
  // the lab's joints, in the man's frame at rest
  const W = g => man.worldToLocal(jointAt(g));
  const J = { neck: W(u.neck) };
  ['l', 'r'].forEach(k => {
    const K = k.toUpperCase();
    J['sh' + K] = W(u.arms[k].sh); J['el' + K] = W(u.arms[k].el); J['hand' + K] = W(u.arms[k].hand);
    J['leg' + K] = W(u.legs[k].hip); J['knee' + K] = W(u.legs[k].kn);
  });
  // the man's height: his own procedural top, hair included (in his frame)
  const top = opts.top || man.worldToLocal(new THREE.Vector3(0, new THREE.Box3().setFromObject(man).max.y, 0)).y;
  const SH = top / LM.top;   // (cm per metre: the horizontal scale)
  const knots = [[0, 0], [LM.knee, J.kneeL.y], [LM.hip, J.legL.y], [LM.shoulder, J.shL.y], [LM.top, top]];
  const warpY = y => {
    for (let i = 0; i < knots.length - 1; i++) if (y <= knots[i + 1][0] || i === knots.length - 2) { const [a, A] = knots[i], [b, B] = knots[i + 1]; return A + (y - a) / (b - a) * (B - A); }
    return y;
  };
  const toLab = (x, y, z) => [-x * SH, warpY(y), -z * SH];   // (turned to face -z; + x is the man's left)

  const mesh = weldMesh(srcGeo), N = mesh.n, P = mesh.pos;
  if (opts.flat !== false) flattenPelvis(P);
  const meas = measureBody(P, SH);
  // The legs' joints moved onto this body's own: the procedural man's knee
  // stands some centimetres in front of where this mesh's knee is (its legs
  // set further back under it), and a knee bent about a pivot off its own
  // centre slides its shin past its thigh - a rim at the front of the knee.
  // Each joint is set, across and front to back, to the middle of the mesh's
  // limb at its height (the hip at the thigh's top, the knee, the ankle);
  // heights stay the lab's, which the warp has already matched.
  if (opts.refitLegs !== false) {
    const mid = (y0, side) => {
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, n = 0;
      for (let i = 0; i < N; i++) {
        const x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2];
        if (Math.abs(y - y0) > 0.008 || x * side < 0.025 || Math.abs(x) > 0.25) continue;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); n++;
      }
      return n ? toLab((x0 + x1) / 2, y0, (z0 + z1) / 2) : null;
    };
    const place = (g, c) => {
      if (!c) return;
      g.updateMatrixWorld(true);
      const at = man.worldToLocal(g.getWorldPosition(new THREE.Vector3()));
      g.position.copy(g.parent.worldToLocal(man.localToWorld(new THREE.Vector3(c[0], at.y, c[2]))));
      man.updateMatrixWorld(true);
    };
    ['l', 'r'].forEach(k => {
      const side = k === 'l' ? -1 : 1, L = u.legs[k];   // (the man's left is the file's - x)
      place(L.hip, mid(LM.hip - 0.09, side));
      place(L.kn, mid(LM.knee, side));
      if (L.foot) place(L.foot, mid(0.075, side));
      const K = k.toUpperCase(); J['leg' + K] = W(L.hip); J['knee' + K] = W(L.kn);
    });
  }
  // seeds, by the file's own frame; the man's left is the file's - x side
  const arm = { c: [LM.S, LM.E, LM.W, LM.H] }, A1 = lerp3(LM.S, LM.E, 0.35);
  const seedOf = i => {
    const x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2], ax = Math.abs(x), left = x < 0;
    if (y > LM.head) return 1;
    if (ax > 0.26 && y > 0.55 && y < 1.0) return left ? 2 : 3;   // (the hand: it rests against the thigh, so the surface alone would give its fingers to the leg)
    if (ax > 0.15) {
      const q = [ax, y, z], d = Math.min(segDist(q, A1, LM.E), segDist(q, LM.E, LM.W), segDist(q, LM.W, LM.H));
      if (d < 0.035) return left ? 2 : 3;
    }
    if (ax < LM.torso.x && y > LM.torso.y0 && y < LM.torso.y1) return 0;
    if (ax > LM.leg.x && y > LM.leg.y0 && y < LM.leg.y1) return left ? 4 : 5;
    return -1;
  };
  const lab = geodesicLabels(mesh, seedOf).lab;
  // the shoulder is graded, not cut: how much a point belongs to the arm
  // rather than the trunk is a smooth step on how much nearer the arm's
  // seed is along the surface than the trunk's (a cut at the Voronoi seam
  // tears the deltoid, since the arm is laid down and the trunk is not)
  const dT = geodesicLabels(mesh, i => (seedOf(i) === 0 || seedOf(i) === 1 ? 0 : -1)).dist;
  const dA = { L: geodesicLabels(mesh, i => (seedOf(i) === 2 ? 0 : -1)).dist, R: geodesicLabels(mesh, i => (seedOf(i) === 3 ? 0 : -1)).dist };
  // (the hip likewise: a thigh's share of a point is a smooth step on how much
  // nearer the thigh's seed is than the trunk's, whichever thigh is nearer)
  const dLeg = { L: geodesicLabels(mesh, i => (seedOf(i) === 4 ? 0 : -1)).dist, R: geodesicLabels(mesh, i => (seedOf(i) === 5 ? 0 : -1)).dist };
  const HIP_BLEND = 0.12;
  const legShare = i => {
    const K = dLeg.L[i] <= dLeg.R[i] ? 'L' : 'R';
    return { K, t: smooth01(0.5 + (dT[i] - dLeg[K][i]) / (2 * HIP_BLEND)) };
  };
  const SHOULDER_BLEND = 0.2;
  const armShare = i => {
    const K = P[3 * i] < 0 ? 'L' : 'R';
    return smooth01(0.5 + (dT[i] - dA[K][i]) / (2 * SHOULDER_BLEND));
  };
  // (the bone of each point, by its region)
  const own = new Int32Array(N), at = new Float32Array(N * 3);
  const sideOf = i => (P[3 * i] < 0 ? 'L' : 'R');
  const dirSE = [LM.E[0] - LM.S[0], LM.E[1] - LM.S[1], LM.E[2] - LM.S[2]];
  for (let i = 0; i < N; i++) {
    const x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2], L = lab[i] < 0 ? 0 : lab[i], K = sideOf(i);
    const [X, Y, Z] = toLab(x, y, z); at[3 * i] = X; at[3 * i + 1] = Y; at[3 * i + 2] = Z;
    if (L === 0) own[i] = bi.hips;
    else if (L === 1) own[i] = bi.neck;
    else if (L === 4 || L === 5) own[i] = y < LM.knee ? bi['knee' + (L === 4 ? 'L' : 'R')] : bi['leg' + (L === 4 ? 'L' : 'R')];
    else {
      const q = [Math.abs(x) - LM.E[0], y - LM.E[1], z - LM.E[2]];
      own[i] = (q[0] * dirSE[0] + q[1] * dirSE[1] + q[2] * dirSE[2]) > 0 ? bi['el' + (L === 2 ? 'L' : 'R')] : bi['sh' + (L === 2 ? 'L' : 'R')];
    }
    void K;
  }
  // the joints of the mesh's own arms (laid in the lab's space), and the
  // turn and stretch that lays each arm down to hang straight as the lab's do
  const armFit = {};
  ['L', 'R'].forEach(K => {
    const sg = K === 'L' ? -1 : 1;
    const Sa = toLab(sg * LM.S[0], LM.S[1], LM.S[2]), Ea = toLab(sg * LM.E[0], LM.E[1], LM.E[2]), Wa = toLab(sg * LM.H[0], LM.H[1], LM.H[2]);
    // (each segment turned in 3D onto the lab's - the mesh's forearm reaches
    // forward as well as out, and left so it bent the elbow before any pose
    // did - then stretched along it to the lab's length)
    const d1 = new THREE.Vector3(Ea[0] - Sa[0], Ea[1] - Sa[1], Ea[2] - Sa[2]), d2 = new THREE.Vector3(Wa[0] - Ea[0], Wa[1] - Ea[1], Wa[2] - Ea[2]);
    const l1 = J['el' + K].clone().sub(J['sh' + K]), l2 = J['hand' + K].clone().sub(J['el' + K]);
    const n1 = l1.clone().normalize(), n2 = l2.clone().normalize();
    armFit[K] = {
      Sa, Ea, Wa, Sl: J['sh' + K], El: J['el' + K], n1, n2,
      q1: new THREE.Quaternion().setFromUnitVectors(d1.clone().normalize(), n1), q2: new THREE.Quaternion().setFromUnitVectors(d2.clone().normalize(), n2),
      k1: l1.length() / d1.length(), k2: l2.length() / d2.length()
    };
  });
  // the joint blends: as figure.mjs's skin (a point near a joint is shared
  // with the bone across it, half and half at the joint, eased off)
  const Jb = [
    { a: bi.hips, b: bi.neck, P: J.neck, R0: 0, R: 6 }
  ];
  // (the elbow and the knee a short, smooth ramp across the joint's own
  // plane: figure.mjs's wide half-and-half band, on this mesh's thicker
  // limbs, bent into a sleeve standing off the joint - the knee's shelf)
  ['L', 'R'].forEach(K => {
    Jb.push({ a: bi['sh' + K], b: bi['el' + K], P: new THREE.Vector3(...armFit[K].Ea), R0: 0.5, R: 6, axial: true });
    Jb.push({ a: bi['leg' + K], b: bi['knee' + K], P: J['knee' + K], R0: 0.5, R: 7, axial: true });
  });
  const nb = BONES.length, W4i = new Uint16Array(N * 4), W4w = new Float32Array(N * 4), rest = new Float32Array(N * 3), col = new Float32Array(N * 3);
  const HUE = BONES.map((_, i) => new THREE.Color().setHSL(i / nb, 0.75, 0.5));
  const w = new Float32Array(nb), counts = new Array(nb).fill(0);
  const _r = new THREE.Vector3();
  const lay = (q, n, k, from, to, X, Y, Z) => { _r.set(X - from[0], Y - from[1], Z - from[2]).applyQuaternion(q); _r.addScaledVector(n, _r.dot(n) * (k - 1)); return [to.x + _r.x, to.y + _r.y, to.z + _r.z]; };
  for (let i = 0; i < N; i++) {
    const X = at[3 * i], Y = at[3 * i + 1], Z = at[3 * i + 2], o = own[i];
    w.fill(0); w[o] = 1; counts[o]++;
    if (lab[i] !== 4 && lab[i] !== 5) {
      const K = P[3 * i] < 0 ? 'L' : 'R', t = armShare(i);
      if (t > 0) {
        const q = [Math.abs(P[3 * i]) - LM.E[0], P[3 * i + 1] - LM.E[1], P[3 * i + 2] - LM.E[2]];
        const arm = (q[0] * dirSE[0] + q[1] * dirSE[1] + q[2] * dirSE[2]) > 0 ? bi['el' + K] : bi['sh' + K];
        const trunk = (o === bi.neck || o === bi.hips) ? o : bi.hips;
        w.fill(0); w[trunk] = 1 - t; w[arm] += t;
      }
    }
    if (lab[i] === 0 || lab[i] === 4 || lab[i] === 5) {
      const { K, t } = legShare(i), leg = P[3 * i + 1] < LM.knee ? bi['knee' + K] : bi['leg' + K];
      if (lab[i] !== 0) { w.fill(0); w[bi.hips] = 1; }
      const h = w[bi.hips]; w[bi.hips] = h * (1 - t); w[leg] += h * t;
    }
    for (const j of Jb) {
      if (j.a !== o && j.b !== o) continue;
      const other = j.a === o ? j.b : j.a, d = j.axial ? Math.abs(Y - j.P.y) : Math.hypot(X - j.P.x, Y - j.P.y, Z - j.P.z), share = 0.5 * smooth01((j.R - d) / (j.R - j.R0));
      w[o] -= share; w[other] += share;
    }
    // (the four heaviest, made one)
    const order = Array.from(w.keys()).sort((a, b) => w[b] - w[a]).slice(0, 4);
    let sum = 0; order.forEach(b => { sum += w[b]; });
    order.forEach((b, k) => { W4i[4 * i + k] = b; W4w[4 * i + k] = w[b] / sum; });
    // the pose it lies in at rest: each arm bone lays its share down
    let px = 0, py = 0, pz = 0, cr = 0, cg = 0, cb = 0;
    order.forEach(b => {
      const wt = w[b] / sum; let q = [X, Y, Z];
      const name = BONES[b], K = name.slice(-1);
      if (name.startsWith('sh')) { const f = armFit[K]; q = lay(f.q1, f.n1, f.k1, f.Sa, f.Sl, X, Y, Z); }
      else if (name.startsWith('el')) { const f = armFit[K]; q = lay(f.q2, f.n2, f.k2, f.Ea, f.El, X, Y, Z); }
      px += wt * q[0]; py += wt * q[1]; pz += wt * q[2];
      cr += wt * HUE[b].r; cg += wt * HUE[b].g; cb += wt * HUE[b].b;
    });
    rest[3 * i] = px; rest[3 * i + 1] = py; rest[3 * i + 2] = pz; col[3 * i] = cr; col[3 * i + 1] = cg; col[3 * i + 2] = cb;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(rest, 3));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(W4i, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(W4w, 4));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aAlong', new THREE.BufferAttribute(Float32Array.from({ length: N * 3 }, (_, k) => (k % 3 === 1 ? 1 : 0)), 3));
  geo.setIndex(new THREE.BufferAttribute(mesh.idx, 1));
  geo.computeVertexNormals();
  return { geo, counts, SH, top, tris: mesh.idx.length / 3, meas };
}

// Dual-quaternion skinning, for this body's materials only: linear blending
// (three.js's) averages the bones' matrices, so a joint bent or twisted far -
// the elbow folded behind the back, the arm turned in at the shoulder, the
// knee in a crouch - collapses and pinches (the candy wrapper). Blending the
// bones as rigid motions keeps the volume. A material is patched as a twin
// (its uniforms shared, so the burin's per-frame values still reach it).
const DQS_PARS = `
vec4 dqsQuat(mat3 m) {
  float t = m[0][0] + m[1][1] + m[2][2]; float s;
  if (t > 0.0) { s = sqrt(t + 1.0) * 2.0; return vec4((m[1][2] - m[2][1]) / s, (m[2][0] - m[0][2]) / s, (m[0][1] - m[1][0]) / s, 0.25 * s); }
  if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) { s = sqrt(1.0 + m[0][0] - m[1][1] - m[2][2]) * 2.0; return vec4(0.25 * s, (m[1][0] + m[0][1]) / s, (m[2][0] + m[0][2]) / s, (m[1][2] - m[2][1]) / s); }
  if (m[1][1] > m[2][2]) { s = sqrt(1.0 + m[1][1] - m[0][0] - m[2][2]) * 2.0; return vec4((m[1][0] + m[0][1]) / s, 0.25 * s, (m[2][1] + m[1][2]) / s, (m[2][0] - m[0][2]) / s); }
  s = sqrt(1.0 + m[2][2] - m[0][0] - m[1][1]) * 2.0; return vec4((m[2][0] + m[0][2]) / s, (m[2][1] + m[1][2]) / s, 0.25 * s, (m[0][1] - m[1][0]) / s);
}
vec4 dqsMul(vec4 a, vec4 b) { return vec4(a.w * b.xyz + b.w * a.xyz + cross(a.xyz, b.xyz), a.w * b.w - dot(a.xyz, b.xyz)); }
void dqsOf(mat4 M, out vec4 r, out vec4 d) { mat3 R = mat3(M); R[0] = normalize(R[0]); R[1] = normalize(R[1]); R[2] = normalize(R[2]); r = dqsQuat(R); d = 0.5 * dqsMul(vec4(M[3].xyz, 0.0), r); }
void dqsAdd(mat4 M, float w, vec4 r0, inout vec4 R, inout vec4 D) { vec4 r, d; dqsOf(M, r, d); if (dot(r, r0) < 0.0) { r = -r; d = -d; } R += w * r; D += w * d; }
vec3 dqsRot(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
`;
const DQS_BASE = `
  vec4 dqR = vec4(0.0), dqD = vec4(0.0);
  { vec4 r0, d0; dqsOf(boneMatX, r0, d0);
    dqsAdd(boneMatX, skinWeight.x, r0, dqR, dqD); dqsAdd(boneMatY, skinWeight.y, r0, dqR, dqD);
    dqsAdd(boneMatZ, skinWeight.z, r0, dqR, dqD); dqsAdd(boneMatW, skinWeight.w, r0, dqR, dqD);
    float L = length(dqR); dqR /= L; dqD /= L; }
`;
// (three's own runs first - it leaves its skinMatrix for a shader that reads
// it, the burin's grain direction - then the normal is made over by the rigid
// blend from what it was before)
const DQS_NORMAL_PRE = `
  vec3 dqN0 = objectNormal;
  #ifdef USE_TANGENT
  vec3 dqT0 = objectTangent.xyz;
  #endif
`;
const DQS_NORMAL = `
  objectNormal = (bindMatrixInverse * vec4(dqsRot(dqR, (bindMatrix * vec4(dqN0, 0.0)).xyz), 0.0)).xyz;
  #ifdef USE_TANGENT
  objectTangent.xyz = (bindMatrixInverse * vec4(dqsRot(dqR, (bindMatrix * vec4(dqT0, 0.0)).xyz), 0.0)).xyz;
  #endif
`;
const DQS_POS = `
  { vec3 p = (bindMatrix * vec4(transformed, 1.0)).xyz;
    vec3 tr = 2.0 * (dqR.w * dqD.xyz - dqD.w * dqR.xyz + cross(dqR.xyz, dqD.xyz));
    transformed = (bindMatrixInverse * vec4(dqsRot(dqR, p) + tr, 1.0)).xyz; }
`;
function patchDqs(m) {
  if (m.userData && m.userData.dqs) return m;
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(m, sh, r);
    sh.vertexShader = sh.vertexShader
      .replace('#include <skinning_pars_vertex>', '#include <skinning_pars_vertex>\n#ifdef USE_SKINNING\n' + DQS_PARS + '\n#endif')
      .replace('#include <skinbase_vertex>', '#include <skinbase_vertex>\n#ifdef USE_SKINNING\n' + DQS_BASE + '\n#endif')
      .replace('#include <skinnormal_vertex>', '#ifdef USE_SKINNING\n' + DQS_NORMAL_PRE + '\n#endif\n#include <skinnormal_vertex>\n#ifdef USE_SKINNING\n' + DQS_NORMAL + '\n#endif')
      .replace('#include <skinning_vertex>', '#ifdef USE_SKINNING\n' + DQS_POS + '\n#endif');
  };
  m.customProgramCacheKey = () => (prevKey ? prevKey.call(m) : '') + '|dqs';
  m.userData = Object.assign({}, m.userData, { dqs: true });
  m.needsUpdate = true;
  return m;
}
const DQS_TWIN = new WeakMap();
// (a twin of `mat` that skins by dual quaternions; one per material)
export function dqsTwin(mat) {
  if (!mat || (mat.userData && mat.userData.dqs)) return mat;
  let t = DQS_TWIN.get(mat); if (t) return t;
  t = mat.clone(); if (mat.uniforms) t.uniforms = mat.uniforms;
  patchDqs(t); DQS_TWIN.set(mat, t); return t;
}

// The anatomy's root is made to sit in the procedural body's pelvis: its top
// buried under the pubic mound and the fork closed round it. The Rodin mesh's
// pelvis is shaped otherwise (flatter above, the fork open and higher), so the
// root showed through as a block. Where the procedural skin (the man's own,
// hidden) stands in front of the Rodin skin round the root, the Rodin skin is
// brought out to it, eased off at the edges - the same mound and fork the
// anatomy was made for - and the anatomy keeps the man's own rooting.
function moundFromProcedural(man, geo) {
  const u = man.userData; let skin = null;
  man.traverse(o => { if (!skin && o.isSkinnedMesh && o.userData.skin) skin = o; });
  if (!skin || !u.pouch) return false;
  man.updateMatrixWorld(true);
  const root = man.worldToLocal(u.pouch.getWorldPosition(new THREE.Vector3()));
  const pa = geo.attributes.position, ray = new THREE.Raycaster(), o = new THREE.Vector3(), d = new THREE.Vector3(0, 0, 1);
  const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
  const Y0 = root.y - 7, Y1 = root.y + 13, XW = 6.5, REACH = 5;
  let moved = 0;
  for (let i = 0; i < pa.count; i++) {
    const X = pa.getX(i), Y = pa.getY(i), Z = pa.getZ(i);
    if (Math.abs(X) > XW || Y < Y0 || Y > Y1 || Z > 2) continue;
    const m = (1 - smooth((Math.abs(X) - XW * 0.6) / (XW * 0.4))) * smooth((Y - Y0) / 3) * (1 - smooth((Y - (Y1 - 8)) / 8));
    if (m <= 0) continue;
    ray.set(man.localToWorld(o.set(X, Y, -60)), d.set(0, 0, 1).transformDirection(man.matrixWorld));
    const hit = ray.intersectObject(skin, false)[0]; if (!hit) continue;
    const zp = man.worldToLocal(hit.point.clone()).z;
    // (no further than REACH: past it the ray has met his thigh, not his fork)
    if (zp < Z && Z - zp < REACH * 2) { pa.setZ(i, Z + Math.max(zp - Z, -REACH) * m); moved++; }
  }
  if (!moved) return false;
  pa.needsUpdate = true; geo.computeVertexNormals();
  return true;
}

// Put the body on `man` (a figure.mjs man built with `build`, at height 1):
// his procedural body hidden (his garments and his anatomy kept), the mesh
// bound to his skeleton, his anatomy rooted on it and his physics' colliders
// measured off it. Returns the mesh; `man.userData.rodin` holds what it did.
export function attachRodin(man, srcGeo, opts = {}) {
  const u = man.userData;
  const inPouch = o => { for (let c = o; c; c = c.parent) if (c === u.pouch) return true; return false; };
  const fit = fitBody(srcGeo, man, opts);
  const mound = opts.mound !== false && moundFromProcedural(man, fit.geo);
  // (his own body away: every mesh that is neither his clothes nor his anatomy)
  man.traverse(o => { if (o.isMesh && !o.userData.garment && !inPouch(o)) { o.visible = false; o.userData.proxyHidden = true; } });
  const ink = dqsTwin(opts.material || new THREE.MeshStandardMaterial({ color: 0xb8a28c }));
  const mesh = new THREE.SkinnedMesh(fit.geo, ink);
  // (its own plates for the lab's two looks - see applyLook)
  mesh.userData.ink = ink; if (opts.studio) mesh.userData.studio = dqsTwin(opts.studio);
  mesh.frustumCulled = false; mesh.userData.rodinBody = true; man.add(mesh);
  man.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(u.rig.skeleton.bones.slice()));
  if (opts.outline !== false) { const ol = outlineOf(mesh, 1.6); patchDqs(ol.material); }
  // (the anatomy rooted on this body's skin at the fork's front, as figure.mjs
  // roots it on its own: the surface's depth there, less a hair)
  if (u.pouch && !mound) { u.pouch.position.z = -(opts.flat !== false ? flatZ(0.81) : fit.meas.bellyR / fit.SH) * fit.SH - 0.3; u.pouch0 = u.pouch.position.clone(); }
  // (his anatomy's own tuning - flesh.mjs reads it; every other man has none:
  // swing and settle as every man's, and at rest carried a little out from
  // him, hanging low and forward of his body rather than against it)
  u.fleshTune = Object.assign({ sway: 1, damp: 1, rest: 0.1 }, opts.fleshTune);
  if (u.colliders) u.colliders = Object.assign({}, u.colliders, { thighR: fit.meas.thighR, bellyR: fit.meas.bellyR });
  // (the mesh kept off the enumerable fields: three.js copies userData as JSON)
  u.rodin = { meas: fit.meas, flat: opts.flat !== false, verts: fit.geo.attributes.position.count, tris: fit.tris, perBone: Object.fromEntries(BONES.map((b, i) => [b, fit.counts[i]])), height: fit.top };
  Object.defineProperty(u.rodin, 'mesh', { value: mesh, enumerable: false });
  return mesh;
}
