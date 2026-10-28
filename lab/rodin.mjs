// The lab's Rodin body: a body made in Rodin (a GLB, one unrigged mesh),
// bound to the lab's own skeleton and driven by the same poses, beside the
// procedural man for comparison. A proof, not yet in the line of men:
//
//   - the mesh is turned to the lab's facing (-z), its height warped
//     piecewise to the lab's joints (knee, hip, shoulder, head), and its
//     arms - made in an A-pose - laid down to hang as the lab's do
//   - each point is owned by a bone (a geodesic Voronoi over the mesh's own
//     edges, from seeds in the torso, the limbs and the head, so the
//     armpit and the crotch split where the surface does, not where a
//     plane would cut them), then shared with the bone across a joint by
//     the same smooth blend as figure.mjs's skin (`skinWeights`)
//   - drawn in the valley's engraving (the flesh plate, outlined), as clay
//     or as its weights, to see how it bends
//
// What it does not do yet: garments (they are lofted to the procedural
// body's measurements), the anatomy (the pelvis here carries the shorts it
// was made in), the soft tissue, the hands' grip or the feet's ankle.
// Opened from the lab's gate like the lab itself.

import * as THREE from '../assets/vendor/three/three.module.js';
import { GLTFLoader } from '../assets/vendor/three/three.addons.js';
import { valleyKit, KEY_SEAT } from '../assets/intro3d/valley.mjs';
import { buildFigure, BODY_HIPS } from '../assets/intro3d/figure.mjs';
import { burinTick, engravingMaterial, paperMaterial, outlineOf } from '../assets/intro3d/burin.mjs';
import { initDevOverlay } from '../assets/intro3d/dev-overlay.mjs';

const PI = Math.PI, KNEE_BACK = -1, UP = new THREE.Vector3(0, 1, 0);
const BODY_URL = '../assets/intro3d/rare/bodies/rodin-lean.glb';

// The mesh's own landmarks, in metres in the file's frame (facing +z,
// feet on y 0, 1.8 m tall), read off this body: the + x side's arm, the
// knee, the hip joint, the shoulder's joint and the head's start. Another
// body from Rodin wants its own (a fit from the mesh is the next step).
const LM = {
  knee: 0.47, hip: 0.90, shoulder: 1.38, top: 1.80,
  S: [0.20, 1.40, -0.05], E: [0.33, 1.00, -0.03], W: [0.39, 0.80, 0.07], H: [0.39, 0.70, 0.08],
  head: 1.56, torso: { x: 0.12, y0: 0.93, y1: 1.30 }, leg: { x: 0.04, y0: 0.50, y1: 0.74 }
};
const BONES = ['hips', 'legL', 'legR', 'kneeL', 'kneeR', 'shL', 'shR', 'elL', 'elR', 'neck'];
const smooth01 = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

// ---------- renderer, scene ----------
const canvas = document.getElementById('rodinCanvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(36, 1, 2, 9000);
const kit = valleyKit();
scene.add(new THREE.HemisphereLight(0xf2ece2, 0x2a2826, 1.1));
const sun = new THREE.DirectionalLight(0xfff4e6, 2.2); sun.position.set(-260, 420, -360); scene.add(sun);

const floorInk = engravingMaterial({ freq: 0.9, angle: 0.5, tone: 0.06, wobble: 0.6, sky: 0.3, keyI: 0.9, axis: [1, 0, 0.35] });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), floorInk); floor.rotation.x = -PI / 2; floor.position.z = 140; scene.add(floor);
const wall = new THREE.Mesh(new THREE.PlaneGeometry(900, 520), paperMaterial()); wall.position.set(0, 260, 190); wall.rotation.y = PI; scene.add(wall);

// ---------- the men ----------
const BUILD = { height: 1, mass: -0.2, muscle: 0.5, age: 0 };
const seeded = seed => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
function mkSlot(x, opts) {
  const g = new THREE.Group(); g.position.x = x; scene.add(g);
  const man = buildFigure(kit, seeded(101), Object.assign({ build: BUILD }, opts));
  g.add(man);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(52, 41, 58), kit.wood); seat.position.set(0, 20.5, -6); seat.visible = false; g.add(seat);
  return { g, man, u: man.userData, seat };
}
// (the camera looks down +z, so screen-left is +x: the procedural man on the left)
const ref = mkSlot(50, { under: 'boxerBriefs' });
const rod = mkSlot(-50, { nude: true });
const ALL = [ref, rod];
// the Rodin slot's own meshes are not drawn - only its bones are used
rod.man.traverse(o => { if (o.isMesh) o.visible = false; });

// ---------- the mesh to the rig ----------
const _v = new THREE.Vector3();
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
  return lab;
}
function segDist(p, a, b) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const t = Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / (ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2)));
  return Math.hypot(ap[0] - t * ab[0], ap[1] - t * ab[1], ap[2] - t * ab[2]);
}
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function fitBody(srcGeo, slot) {
  const u = slot.u, rig = u.rig, bi = rig.index;
  slot.man.updateMatrixWorld(true);
  // the lab's joints, in the man's frame at rest
  const W = g => jointAt(g).sub(slot.man.getWorldPosition(new THREE.Vector3()));
  const J = { neck: W(u.neck) };
  ['l', 'r'].forEach(k => {
    const K = k.toUpperCase();
    J['sh' + K] = W(u.arms[k].sh); J['el' + K] = W(u.arms[k].el); J['hand' + K] = W(u.arms[k].hand);
    J['leg' + K] = W(u.legs[k].hip); J['knee' + K] = W(u.legs[k].kn);
  });
  // the man's height: the reference's top, hair included
  const top = new THREE.Box3().setFromObject(ref.man).max.y;
  const SH = top / LM.top;   // (cm per metre: the horizontal scale)
  const knots = [[0, 0], [LM.knee, J.kneeL.y], [LM.hip, J.legL.y], [LM.shoulder, J.shL.y], [LM.top, top]];
  const warpY = y => {
    for (let i = 0; i < knots.length - 1; i++) if (y <= knots[i + 1][0] || i === knots.length - 2) { const [a, A] = knots[i], [b, B] = knots[i + 1]; return A + (y - a) / (b - a) * (B - A); }
    return y;
  };
  const toLab = (x, y, z) => [-x * SH, warpY(y), -z * SH];   // (turned to face -z; + x is the man's left)

  const mesh = weldMesh(srcGeo), N = mesh.n, P = mesh.pos;
  // seeds, by the file's own frame; the man's left is the file's - x side
  const arm = { c: [LM.S, LM.E, LM.W, LM.H] }, A1 = lerp3(LM.S, LM.E, 0.35);
  const seedOf = i => {
    const x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2], ax = Math.abs(x), left = x < 0;
    if (y > LM.head) return 1;
    if (ax > 0.15) {
      const q = [ax, y, z], d = Math.min(segDist(q, A1, LM.E), segDist(q, LM.E, LM.W), segDist(q, LM.W, LM.H));
      if (d < 0.035) return left ? 2 : 3;
    }
    if (ax < LM.torso.x && y > LM.torso.y0 && y < LM.torso.y1) return 0;
    if (ax > LM.leg.x && y > LM.leg.y0 && y < LM.leg.y1) return left ? 4 : 5;
    return -1;
  };
  const lab = geodesicLabels(mesh, seedOf);
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
    const d1 = [Ea[0] - Sa[0], Ea[1] - Sa[1]], d2 = [Wa[0] - Ea[0], Wa[1] - Ea[1]];
    const lab1 = J['el' + K].clone().sub(J['sh' + K]).length(), lab2 = J['hand' + K].clone().sub(J['el' + K]).length();
    armFit[K] = {
      Sa, Ea, Wa, Sl: J['sh' + K], El: J['el' + K],
      phi1: -PI / 2 - Math.atan2(d1[1], d1[0]), phi2: -PI / 2 - Math.atan2(d2[1], d2[0]),
      k1: lab1 / Math.hypot(d1[0], d1[1]), k2: lab2 / Math.hypot(d2[0], d2[1])
    };
  });
  // the joint blends: as figure.mjs's skin (a point near a joint is shared
  // with the bone across it, half and half at the joint, eased off)
  const Jb = [
    { a: bi.hips, b: bi.neck, P: J.neck, R0: 0, R: 6 }
  ];
  ['L', 'R'].forEach(K => {
    Jb.push({ a: bi.hips, b: bi['sh' + K], P: new THREE.Vector3(...armFit[K].Sa), R0: 0, R: 10 });
    Jb.push({ a: bi['sh' + K], b: bi['el' + K], P: new THREE.Vector3(...armFit[K].Ea), R0: 4.4, R: 8 });
    Jb.push({ a: bi.hips, b: bi['leg' + K], P: J['leg' + K], R0: 0, R: 13.5 });
    Jb.push({ a: bi['leg' + K], b: bi['knee' + K], P: J['knee' + K], R0: 5.7, R: 10 });
  });
  const nb = BONES.length, W4i = new Uint16Array(N * 4), W4w = new Float32Array(N * 4), rest = new Float32Array(N * 3), col = new Float32Array(N * 3);
  const HUE = BONES.map((_, i) => new THREE.Color().setHSL(i / nb, 0.75, 0.5));
  const w = new Float32Array(nb), counts = new Array(nb).fill(0);
  const rot = (phi, x, y) => [x * Math.cos(phi) - y * Math.sin(phi), x * Math.sin(phi) + y * Math.cos(phi)];
  for (let i = 0; i < N; i++) {
    const X = at[3 * i], Y = at[3 * i + 1], Z = at[3 * i + 2], o = own[i];
    w.fill(0); w[o] = 1; counts[o]++;
    for (const j of Jb) {
      if (j.a !== o && j.b !== o) continue;
      const other = j.a === o ? j.b : j.a, d = Math.hypot(X - j.P.x, Y - j.P.y, Z - j.P.z), share = 0.5 * smooth01((j.R - d) / (j.R - j.R0));
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
      if (name.startsWith('sh')) { const f = armFit[K], r = rot(f.phi1, X - f.Sa[0], Y - f.Sa[1]); q = [f.Sl.x + r[0], f.Sl.y + r[1] * f.k1, f.Sl.z + (Z - f.Sa[2])]; }
      else if (name.startsWith('el')) { const f = armFit[K], r = rot(f.phi2, X - f.Ea[0], Y - f.Ea[1]); q = [f.El.x + r[0], f.El.y + r[1] * f.k2, f.El.z + (Z - f.Ea[2])]; }
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
  return { geo, counts, SH, top, tris: mesh.idx.length / 3 };
}

const MATS = {
  ink: kit.flesh,
  clay: new THREE.MeshStandardMaterial({ color: 0xb8a28c, roughness: 0.82, metalness: 0 }),
  weights: new THREE.MeshBasicMaterial({ vertexColors: true })
};
let body = null, info = null;
function mountBody(srcGeo) {
  const fit = fitBody(srcGeo, rod);
  const mesh = new THREE.SkinnedMesh(fit.geo, MATS.ink);
  mesh.frustumCulled = false; rod.man.add(mesh);
  rod.man.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(rod.u.rig.skeleton.bones.slice()));
  outlineOf(mesh, 1.6);
  body = mesh; info = { verts: fit.geo.attributes.position.count, tris: fit.tris, perBone: Object.fromEntries(BONES.map((b, i) => [b, fit.counts[i]])), height: fit.top };
  setLook(state.look);
}

// ---------- poses (the lab's, without the physics) ----------
const clamp01 = x => Math.max(0, Math.min(1, x));
function rest(u) {
  u.hips.position.y = BODY_HIPS; u.hips.rotation.set(0, 0, 0); u.neck.rotation.set(0, 0, 0); u.head.rotation.set(0, 0, 0);
  ['l', 'r'].forEach(s => {
    u.arms[s].sh.rotation.set(0, 0, 0); u.arms[s].el.rotation.set(0, 0, 0); u.arms[s].hand.rotation.set(0, 0, 0);
    u.legs[s].hip.rotation.set(0, 0, 0); u.legs[s].kn.rotation.set(0, 0, 0); u.legs[s].foot.rotation.set(0, 0, 0);
  });
}
function crouch(u, c) {
  u.hips.position.y -= 24 * c; u.hips.rotation.x = -0.42 * c;
  ['l', 'r'].forEach(k => { u.legs[k].hip.rotation.x = 1.15 * c + 0.42 * c; u.legs[k].kn.rotation.x = KNEE_BACK * 1.9 * c; u.legs[k].foot.rotation.x = 0.33 * c; });
}
function poseOne(slot, P, t) {
  const { u, g, man, seat } = slot;
  man.position.set(0, 0, 0); rest(u); seat.visible = P === 'seat';
  if (P === 'stand') {
    const tilt = -0.12;
    u.hips.position.y = BODY_HIPS - 1.8; u.hips.rotation.z = tilt;
    u.arms.l.sh.rotation.set(0.06, 0, 0.1 - tilt); u.arms.r.sh.rotation.set(0.1, 0, -0.12 - tilt);
    u.arms.l.el.rotation.x = 0.28; u.arms.r.el.rotation.x = 0.35;
    u.legs.l.hip.rotation.set(0.24, 0, 0.05 - tilt); u.legs.l.kn.rotation.x = KNEE_BACK * 0.45; u.legs.l.foot.rotation.x = -0.28;
    u.legs.r.hip.rotation.set(-0.03, 0, -0.03 - tilt);
  } else if (P === 'walk') {
    const w = t * 2 * PI * 0.85, sn = Math.sin(w), cs = Math.cos(w);
    u.hips.position.y = BODY_HIPS - 2.2 + Math.abs(cs) * 2.0; u.hips.rotation.y = sn * 0.07; u.hips.rotation.z = cs * 0.035;
    u.legs.l.hip.rotation.x = sn * 0.46; u.legs.r.hip.rotation.x = -sn * 0.46;
    u.legs.l.kn.rotation.x = KNEE_BACK * (Math.max(0, -cs) * 0.85 + 0.06); u.legs.r.kn.rotation.x = KNEE_BACK * (Math.max(0, cs) * 0.85 + 0.06);
    u.arms.l.sh.rotation.set(-sn * 0.34, 0, 0.08); u.arms.r.sh.rotation.set(sn * 0.34, 0, -0.08);
    u.arms.l.el.rotation.x = 0.3 + Math.max(0, sn) * 0.3; u.arms.r.el.rotation.x = 0.3 + Math.max(0, -sn) * 0.3;
  } else if (P === 'jog') {
    const w = t * 2 * PI * 1.35, sn = Math.sin(w), cs = Math.cos(w), air = Math.max(0, Math.abs(cs) - 0.55) / 0.45;
    man.position.y = 4.5 * air * air; u.hips.position.y = BODY_HIPS - 3.5 + 2.5 * air;
    u.hips.rotation.x = -0.12; u.hips.rotation.y = sn * 0.1; u.hips.rotation.z = cs * 0.04;
    u.legs.l.hip.rotation.x = 0.12 + 0.62 * sn + 0.3 * Math.max(0, sn); u.legs.r.hip.rotation.x = 0.12 - 0.62 * sn + 0.3 * Math.max(0, -sn);
    u.legs.l.kn.rotation.x = KNEE_BACK * (0.2 + 1.55 * Math.max(0, -cs * 0.6 + sn * 0.8)); u.legs.r.kn.rotation.x = KNEE_BACK * (0.2 + 1.55 * Math.max(0, cs * 0.6 - sn * 0.8));
    u.arms.l.sh.rotation.set(-sn * 0.62 + 0.1, 0, 0.12); u.arms.r.sh.rotation.set(sn * 0.62 + 0.1, 0, -0.12);
    u.arms.l.el.rotation.x = 1.45 + sn * 0.15; u.arms.r.el.rotation.x = 1.45 - sn * 0.15;
  } else if (P === 'crouch') {
    crouch(u, 0.7);
    u.arms.l.sh.rotation.set(-0.9, 0, 0.1); u.arms.r.sh.rotation.set(-0.9, 0, -0.1);
    u.arms.l.el.rotation.x = 0.3; u.arms.r.el.rotation.x = 0.3;
  } else if (P === 'reach') {
    u.arms.l.sh.rotation.set(2.6, 0, 0.12); u.arms.r.sh.rotation.set(2.6, 0, -0.12);
    u.arms.l.el.rotation.x = 0.3; u.arms.r.el.rotation.x = 0.3;
  } else if (P === 'seat') {
    u.hips.position.y = 53.3;
    ['l', 'r'].forEach(k => { u.legs[k].hip.rotation.x = 1.45; u.legs[k].kn.rotation.x = KNEE_BACK * 1.45; });
    u.legs.l.hip.rotation.z = 0.06; u.legs.r.hip.rotation.z = -0.06;
    u.arms.l.sh.rotation.set(0.95, 0, 0.16); u.arms.r.sh.rotation.set(0.95, 0, -0.16);
    u.arms.l.el.rotation.x = 0.45; u.arms.r.el.rotation.x = 0.45;
  }
  void g;
}
const ANIMATED = { walk: 1, jog: 1 };

// ---------- view ----------
const state = { pose: 'stand', look: 'ink', paused: false, t: 0 };
const view = { yaw: 0, pitch: 0.08, zoom: 1, target: new THREE.Vector3(0, 90, 0) };
let dirty = true;
function distFor() { const a = camera.aspect; return Math.max(300, 100 / (Math.tan(18 * PI / 180) * a)) * view.zoom; }
function placeCamera() {
  const d = distFor(), cp = Math.cos(view.pitch);
  camera.position.set(view.target.x + d * Math.sin(view.yaw) * cp, view.target.y + d * Math.sin(view.pitch), view.target.z - d * Math.cos(view.yaw) * cp);
  camera.lookAt(view.target);
}
function size() { const w = window.innerWidth, h = window.innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true; }
window.addEventListener('resize', size);

function setLook(l) {
  state.look = l;
  if (body) {
    body.material = MATS[l];
    body.children.forEach(c => { if (c.userData.outline) c.visible = l === 'ink'; });
  }
  document.querySelectorAll('[data-look]').forEach(b => b.classList.toggle('on', b.dataset.look === l));
  dirty = true;
}
function setPose(p) {
  state.pose = p; state.t = 0;
  document.querySelectorAll('[data-pose]').forEach(b => b.classList.toggle('on', b.dataset.pose === p));
  applyPose(); dirty = true;
}
function setYaw(deg) {
  view.yaw = deg * PI / 180;
  document.querySelectorAll('[data-yaw]').forEach(b => b.classList.toggle('on', +b.dataset.yaw === deg));
  dirty = true;
}
function applyPose() { ALL.forEach(s => poseOne(s, state.pose, state.t)); scene.updateMatrixWorld(true); }

// drag to turn, wheel and pinch to zoom
{
  const pts = new Map(); let pinch = 0;
  canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); pinch = 0; });
  canvas.addEventListener('pointerup', e => pts.delete(e.pointerId));
  canvas.addEventListener('pointercancel', e => pts.delete(e.pointerId));
  canvas.addEventListener('pointermove', e => {
    const p = pts.get(e.pointerId); if (!p) return;
    if (pts.size === 2) {
      pts.set(e.pointerId, [e.clientX, e.clientY]); const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch) view.zoom = Math.max(0.3, Math.min(2.5, view.zoom * pinch / d)); pinch = d; dirty = true; return;
    }
    view.yaw -= (e.clientX - p[0]) * 0.008; view.pitch = Math.max(-0.2, Math.min(0.9, view.pitch + (e.clientY - p[1]) * 0.004));
    p[0] = e.clientX; p[1] = e.clientY; document.querySelectorAll('[data-yaw]').forEach(b => b.classList.remove('on')); dirty = true;
  });
  canvas.addEventListener('wheel', e => { e.preventDefault(); view.zoom = Math.max(0.3, Math.min(2.5, view.zoom * (1 + e.deltaY * 0.001))); dirty = true; }, { passive: false });
}
document.querySelectorAll('[data-pose]').forEach(b => b.addEventListener('click', () => setPose(b.dataset.pose)));
document.querySelectorAll('[data-look]').forEach(b => b.addEventListener('click', () => setLook(b.dataset.look)));
document.querySelectorAll('[data-yaw]').forEach(b => b.addEventListener('click', () => setYaw(+b.dataset.yaw)));
document.getElementById('pause').addEventListener('click', e => { state.paused = !state.paused; e.currentTarget.classList.toggle('on', state.paused); e.currentTarget.textContent = state.paused ? 'Play' : 'Pause'; });

// ---------- the loop ----------
const labKey = new THREE.Vector3();
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (ANIMATED[state.pose] && !state.paused) { state.t += dt; applyPose(); dirty = true; }
  if (dirty) {
    placeCamera();
    burinTick(scene, camera, renderer, 0, labKey.copy(KEY_SEAT).applyAxisAngle(UP, view.yaw));
    renderer.render(scene, camera); dirty = false;
  }
  requestAnimationFrame(loop);
}

// ---------- open: the gate first, then the room ----------
let opened = false;
function open() {
  if (opened) return; opened = true;
  ['bar', 'dock', 'note'].forEach(id => document.getElementById(id).classList.remove('hidden'));
  size(); applyPose();
  new GLTFLoader().load(BODY_URL, gltf => {
    let geo = null; gltf.scene.traverse(o => { if (!geo && o.isMesh) geo = o.geometry; });
    if (!geo) { console.error('rodin: no mesh in', BODY_URL); return; }
    mountBody(geo); applyPose(); dirty = true;
  }, undefined, err => console.error('rodin: could not load', BODY_URL, err));
  requestAnimationFrame(loop);
}
initDevOverlay([], { onAuthed(api) { try { api.clear(); } catch (e) { /* no panel */ } open(); } });
window.__rodin = { state, setPose, setLook, setYaw, redraw: () => { dirty = true; }, info: () => info, scene, camera, view, applyPose, ref, rod, step: dt => { state.t += dt; applyPose(); dirty = true; } };
