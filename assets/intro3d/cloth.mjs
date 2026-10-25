// CLOTH: a build's garments fitted each frame to the body under them - the
// lab's build men only (figure.mjs `dress()`; the valley never builds one).
//
// Every garment is its own mesh, reshaped in place (`liveMesh`): no sheet is
// laid over another, so there is no edge, no stair-step and no shadow gap
// between two. The rig is a hierarchy of groups, not a skinned mesh: a
// garment hangs in the group of the bone it rides (the brief in the hips)
// and moves with it as it is. Each pose, after the pose and the flesh's
// physics have run (the lab: pose -> sleeves -> physics -> cloth), the
// garment is reshaped from where the body's own meshes are now - so it never
// runs a frame behind a bone.
//
// The brief (`makeFit`), two passes over its own points:
//   1. the thighs. A stride swings a thigh into the brief's side seams and
//      the crease of the hip. Each leg is its skin's profile round the hip
//      joint's axis and the hip sleeve's curve (and whatever leg the garment
//      has over it); a point the thigh has come into is pushed out across
//      the thigh, along its transverse normal, by how much deeper it is than
//      at rest. One just inside the skin at rest is held out over it, so the
//      leg opening lies on the thigh; the rest pose's deeper cut (where the
//      brief tucks in under the skin) is kept as it was built. Damped: at the fork (an inner-thigh
//      mask on the hips' x) the two thighs press from both sides, so there it
//      gives only a little; and the push eases in and saturates, never a jump.
//   2. the anatomy (a snug fabric: `fit` in figure.mjs's FABRIC). The meshes
//      under the front - the anatomy's pieces where the physics put them, a
//      leg it lies over - are drawn into a depth map in a frame looking
//      straight out of the fork (an orthographic raster: for every cell how
//      far forward the front-most surface stands, and what tissue it is),
//      and the brief's own front as pass 1 left it. A membrane is solved over it, one height
//      a cell along the frame's normal:
//        - never inside the anatomy (the fabric's thickness over it), its
//          own rest shape, or a leg it lies over;
//        - cling pulls it down onto what is under it (a clingy knit
//          vacuum-seals: each piece reads on its own);
//        - stiffness pulls it toward its neighbours (a stiff weave bridges
//          the hollows, a smooth mound over them).
//      How far the membrane stands out of the brief's rest is how far the
//      brief is carried out. That is smoothed (a Gaussian skirt joined to it
//      by a cubic smooth max: the floor kept, the corner rounded), trailed a
//      little behind the anatomy's motion (the swing vector: the physics'
//      velocity of the mass against the body), and given the fabric's own
//      inertia (a damped spring a cell, which may lag on the way back but is
//      never let inside). Then each point on the brief's front is carried out
//      along the frame's normal by it - sampled by a cubic (Catmull-Rom)
//      through the cells round it, faded by a smoothstep at the window's
//      edges, from the front sheet back and toward the gusset (held between
//      the legs, so under the anatomy the brief runs back to it in one
//      slope, never folded flat onto the front) - and its shading leaned smooth
//      where it is drawn taut: one continuous surface, no stripes.
//
// Loose ones (`makeDrape`: the boxers' cup, a loincloth's front flap) hang
// with room in them, and the anatomy swings in that room without touching
// them. The room is the drape gap, (1 - cling) x the fabric's drape (cm);
// only the part of the swing past it pushes the cloth - tenting it out from
// where it hangs (its top held: grown out of the brief, sewn to the belt),
// never turning it whole like a card - and the cloth eases back with its own
// inertia. The anatomy only ever pushes it: away from the body or aside,
// never pulling it back in.
//
// Tissue, read from each mesh's `userData.tissue` (?? keeps rigid's 0):
//   RIGID (0)  bone, a hard edge: taken crisp - the cloth is never allowed to
//              press it, and it is never blurred
//   SOFT (1)   flesh, fat, muscle, the anatomy: the cloth's pressure (cling
//              against stiffness) presses it a little flatter and spreads
//              what it pushes aside round it - a Gaussian spread, so the
//              volume under the cloth is kept, not lost
// Garments (`FABRIC` in figure.mjs) give cling, stiff, thick (cm) and drape (cm).
import * as THREE from '../vendor/three/three.module.js';
import { outlineOf } from './burin.mjs';

export const TISSUE = { RIGID: 0, SOFT: 1 };
// (?? not ||: a rigid 0 is a value, not a missing one)
export const tissueOf = m => (m.userData.tissue ?? TISSUE.SOFT);

const NONE = -1e9;
const CELL = 0.6;        // cm a cell
const ITER = 36;         // membrane passes on a fresh fit
const ITER_WARM = 16;    // and a frame after (warm-started from the last)
const LAYER_GAP = 0.12;  // over a leg it lies on
const STEP = 1 / 240;    // the cloth's inertia: its step (s)
const LAG_T = 0.025;     // how far it trails the anatomy's motion (s of that motion)
const LAG_MAX = 1.2;     // and at most (cm)
const SKIRT_K = 0.5;     // the smooth max's round, between the floor and its skirt (cm)
// the thighs' push: the most a point is pushed (cm; it saturates toward it),
// the width of its ease-in (cm), the inner-thigh mask - `inner` of the push
// at the fork's middle, all of it from in1 out (the hips' |x|, cm) - and the
// tuck: a point less than `tuck` (cm) inside the skin at rest is held out
// over it (the leg opening lies on the thigh), one deeper than tuck + 1 is
// the brief's own cut, tucked in under the skin as it was built
const PUSH = { max: 4.0, ease: 0.35, inner: 0.2, in0: 1.0, in1: 6.0, tuck: 1.0 };
const _m = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _frame = new THREE.Matrix4(), _toFrame = new THREE.Matrix4();
const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _d = new THREE.Vector3(), _a = new THREE.Vector3(), _zero = new THREE.Vector3();
const _b = new THREE.Vector3(), _zq = new THREE.Quaternion();
// (a point further than this outside a leg at rest is never pressed by it, cm)
const NEAR = 8;

const clamp01 = x => Math.max(0, Math.min(1, x));
const smoothstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
// (the larger of a and b, the corner where they meet rounded over k - a
// cubic, so no crease; k shrinks to nothing as both go to 0, so a flat 0 stays 0)
const smax = (a, b, k) => { k = Math.min(k, Math.max(a, b)); if (k <= 1e-6) return Math.max(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * h * k / 6; };
// (x past 0, eased in over +-k: 0 below -k, x above k, a parabola between - C1 at both ends)
const ease0 = (x, k) => x <= -k ? 0 : x >= k ? x : (x + k) * (x + k) / (4 * k);
// (the Catmull-Rom cubic through four samples, at t 0..1 between the middle two)
const cr = (p0, p1, p2, p3, t) => p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));

// A mesh reshaped in place each frame: the indexed hull (its smooth normals,
// the outline drawn from it) and the faceted copy that is shaded - each of
// its points a corner of one face - so it reads as figure.mjs's facet() does,
// the planes' normals leaned `soft` of the way toward the hull's. A point's
// weight (0-1, `live.weight`) leans it the rest of the way: cloth drawn taut
// over something is one smooth surface, with no step in tone at its planes.
// Reshape: write `live.smooth`'s positions, then `live.refresh()`.
export function liveMesh(geo, mat, parent, { outline = 1.2, soft = 0.8 } = {}) {
  geo.computeVertexNormals();
  const flat = geo.toNonIndexed(), map = geo.index.array;
  const mesh = new THREE.Mesh(flat, mat); mesh.frustumCulled = false; parent.add(mesh);
  if (outline) { const o = outlineOf(mesh, outline); o.geometry = geo; o.frustumCulled = false; }
  const V = geo.attributes.position.count, Fc = map.length / 3;
  const live = { smooth: geo, rest: Float32Array.from(geo.attributes.position.array), soft, weight: new Float32Array(V) };
  // (only what moved is redone: the faces round a point that moved or was
  // reweighted, the points of those faces, and every face round those - a
  // garment's waistband and seat that never move cost nothing a frame)
  const start = new Int32Array(V + 1), ring = new Int32Array(map.length);
  for (let k = 0; k < map.length; k++) start[map[k] + 1]++;
  for (let v = 0; v < V; v++) start[v + 1] += start[v];
  const fill = start.slice(0, V); for (let k = 0; k < map.length; k++) ring[fill[map[k]]++] = (k / 3) | 0;
  const last = new Float32Array(V * 3).fill(NaN), lastW = new Float32Array(V).fill(-1), cross = new Float32Array(Fc * 3);
  const vMark = new Int32Array(V), fMark = new Int32Array(Fc), fDone = new Int32Array(Fc), vList = new Int32Array(V), fList = new Int32Array(Fc);
  let stamp = 0;
  const faceCross = (f, sa) => {
    const a = map[3 * f] * 3, b = map[3 * f + 1] * 3, c = map[3 * f + 2] * 3;
    // (wound as three.js winds it; its length the face's area, so a point's normal is area-weighted as three.js weights it)
    const ux = sa[b] - sa[a], uy = sa[b + 1] - sa[a + 1], uz = sa[b + 2] - sa[a + 2];
    const vx = sa[c] - sa[a], vy = sa[c + 1] - sa[a + 1], vz = sa[c + 2] - sa[a + 2];
    cross[3 * f] = uy * vz - uz * vy; cross[3 * f + 1] = uz * vx - ux * vz; cross[3 * f + 2] = ux * vy - uy * vx;
  };
  live.refresh = () => {
    const sa = geo.attributes.position.array, sn = geo.attributes.normal.array, w = live.weight;
    const fa = flat.attributes.position.array, fn = flat.attributes.normal.array;
    stamp++;
    // the faces round whatever moved
    let nf = 0;
    for (let v = 0; v < V; v++) {
      if (sa[3 * v] === last[3 * v] && sa[3 * v + 1] === last[3 * v + 1] && sa[3 * v + 2] === last[3 * v + 2] && w[v] === lastW[v]) continue;
      last[3 * v] = sa[3 * v]; last[3 * v + 1] = sa[3 * v + 1]; last[3 * v + 2] = sa[3 * v + 2]; lastW[v] = w[v];
      for (let r = start[v]; r < start[v + 1]; r++) { const f = ring[r]; if (fMark[f] !== stamp) { fMark[f] = stamp; fList[nf++] = f; } }
    }
    if (!nf) return;
    // their points (whose smooth normals change), and every face round those
    let nv = 0;
    for (let i = 0; i < nf; i++) for (let j = 0; j < 3; j++) { const v = map[3 * fList[i] + j]; if (vMark[v] !== stamp) { vMark[v] = stamp; vList[nv++] = v; } }
    let nf2 = 0;
    for (let i = 0; i < nv; i++) { const v = vList[i]; for (let r = start[v]; r < start[v + 1]; r++) { const f = ring[r]; if (fDone[f] !== stamp) { fDone[f] = stamp; faceCross(f, sa); fList[nf2++] = f; } } }
    for (let i = 0; i < nv; i++) {
      const v = vList[i]; let x = 0, y = 0, z = 0;
      for (let r = start[v]; r < start[v + 1]; r++) { const f = ring[r]; x += cross[3 * f]; y += cross[3 * f + 1]; z += cross[3 * f + 2]; }
      const l = Math.hypot(x, y, z) || 1; sn[3 * v] = x / l; sn[3 * v + 1] = y / l; sn[3 * v + 2] = z / l;
    }
    // the shaded copy of each of those faces: its corners, its plane's normal leaned toward each corner's smooth one
    for (let i = 0; i < nf2; i++) {
      const f = fList[i], L = Math.hypot(cross[3 * f], cross[3 * f + 1], cross[3 * f + 2]) || 1;
      const nx = cross[3 * f] / L, ny = cross[3 * f + 1] / L, nz = cross[3 * f + 2] / L;
      for (let j = 0; j < 3; j++) {
        const k = 3 * f + j, s = map[k], si = s * 3, o = k * 3, t = soft + (1 - soft) * w[s];
        fa[o] = sa[si]; fa[o + 1] = sa[si + 1]; fa[o + 2] = sa[si + 2];
        const x = nx + (sn[si] - nx) * t, y = ny + (sn[si + 1] - ny) * t, z = nz + (sn[si + 2] - nz) * t, l = Math.hypot(x, y, z) || 1;
        fn[o] = x / l; fn[o + 1] = y / l; fn[o + 2] = z / l;
      }
    }
    geo.attributes.position.needsUpdate = true; geo.attributes.normal.needsUpdate = true;
    flat.attributes.position.needsUpdate = true; flat.attributes.normal.needsUpdate = true;
  };
  live.refresh();
  mesh.userData.live = live;
  return mesh;
}

// how deep (cm) a point of the hips' frame is in a leg - its skin and what
// the leg wears over it - and the way out across it into `out` (the hips'
// frame). q, qi: the hip joint's turn and its inverse (null: at rest).
// A leg: { hip (the joint's group, a child of the hips), prof: y => [rx, rz,
// front, back] (the thigh's section at y down it, in the joint's frame),
// top, bottom (y), pad (cm), sleeve?: { a (the hips' frame), b (the
// joint's), ra, rb (mean radii), bulge } - the skin over the hip joint, a
// hull along the curve from a past the joint to b (figure.mjs addSleeve) }
// Each pose it is laid once (`legPose`); then `legDepth` per point.
const CHORDS = 4;
function legPose(L, q) {
  const P = L.hip.position, T = L._T || (L._T = { m: new THREE.Matrix3(), mi: new THREE.Matrix3(), c: Array.from({ length: CHORDS + 1 }, () => new THREE.Vector3()) });
  _q.copy(q || _zq); T.m.setFromMatrix4(_m.makeRotationFromQuaternion(_q)); T.mi.copy(T.m).transpose();
  if (L.sleeve) {
    // (the sleeve's curve: a quadratic from a past the joint to b, as addSleeve lays it)
    _b.fromArray(L.sleeve.b).applyMatrix3(T.m).add(P);
    const a = L.sleeve.a;
    T.c.forEach((c, k) => { const t = k / CHORDS, u = 1 - t; c.set(u * u * a[0] + 2 * u * t * P.x + t * t * _b.x, u * u * a[1] + 2 * u * t * P.y + t * t * _b.y, u * u * a[2] + 2 * u * t * P.z + t * t * _b.z); });
  }
  return T;
}
function legDepth(L, T, x, y, z, out) {
  const P = L.hip.position, e = T.mi.elements;
  let best = -Infinity;
  // the thigh: its section round the joint's axis, out across it
  const px = x - P.x, py = y - P.y, pz = z - P.z;
  const lx = e[0] * px + e[3] * py + e[6] * pz, ly = e[1] * px + e[4] * py + e[7] * pz, lz = e[2] * px + e[5] * py + e[8] * pz;
  const d = Math.sqrt(lx * lx + lz * lz);
  if (ly <= L.top && ly >= L.bottom && d > 1e-4) {
    const sec = L.prof(ly), rx = sec[0], c = lx / d, s = lz / d;
    // (the section's radius that way: an ellipse, its front and back pulled as the loft pulls them)
    const ez = sec[1] + (s < 0 ? sec[2] : sec[3]) * s * s, R = 1 / Math.sqrt((c / rx) * (c / rx) + (s / ez) * (s / ez));
    best = R + L.pad - d;
    if (out) out.set(c, 0, s).applyMatrix3(T.m);
  }
  // the sleeve: the nearest point on its curve, out from that
  const S = L.sleeve;
  if (S) {
    for (let k = 0; k < CHORDS; k++) {
      const c0 = T.c[k], c1 = T.c[k + 1], sx = c1.x - c0.x, sy = c1.y - c0.y, sz = c1.z - c0.z, L2 = sx * sx + sy * sy + sz * sz;
      const u = L2 ? Math.max(0, Math.min(1, ((x - c0.x) * sx + (y - c0.y) * sy + (z - c0.z) * sz) / L2)) : 0;
      const dx = x - c0.x - sx * u, dy = y - c0.y - sy * u, dz = z - c0.z - sz * u, dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < 1e-4) continue;
      // (its swell: sin(pi t), as addSleeve lays it - near enough as 4t(1 - t))
      const t = (k + u) / CHORDS, dep = S.ra + (S.rb - S.ra) * t + S.bulge * 4 * t * (1 - t) + L.pad - dist;
      if (dep > best) { best = dep; if (out) out.set(dx / dist, dy / dist, dz / dist); }
    }
  }
  return best;
}

// The brief, fitted. spec: { hips, mesh (a liveMesh in the hips),
//   fabric: { cling, stiff, thick }, legs: [leg (see legDepth)],
//   field?: { pouch, frame: () => { O, ex, ey, ez, x0, x1, y0, y1 } (the
//     hips' frame; recomputed on refit), layers: () => [mesh] (legs it lies
//     over), hold: [y0, y1] (the hips' y: the gusset, held between the legs
//     below y0 and free above y1 - so under the anatomy the brief runs back
//     to it in one slope, not folded flat onto the front) },
//   swing?: () => { v } (the flesh's swing vector, the hips' frame) or null }
export function makeFit(spec) {
  const live = spec.mesh.userData.live, geo = live.smooth, rest = live.rest, N = rest.length / 3;
  const pos = geo.attributes.position.array, idx = geo.index.array, base = new Float32Array(rest.length);
  const fab = spec.fabric, legs = spec.legs || [], fld = spec.field || null;
  // (each point's depth in each leg at rest: the cut as it was built - only
  // what a pose presses deeper than that is pushed out)
  const restIn = legs.map(L => { const T = legPose(L, null), a = new Float32Array(N); for (let i = 0; i < N; i++) a[i] = legDepth(L, T, rest[3 * i], rest[3 * i + 1], rest[3 * i + 2], null); return a; });
  // (and only the points near enough to it that a stride could press them)
  const near = restIn.map(a => Int32Array.from(a.reduce((l, v, i) => { if (v > -NEAR) l.push(i); return l; }, [])));
  const W = { F: null, nx: 0, ny: 0 };
  let h, lower, target, anat, soft, own, under, tmp, dz, floor, skirt, goal, dc, dv, fresh = true;

  function alloc() {
    const F = W.F = fld.frame();
    W.nx = Math.max(4, Math.ceil((F.x1 - F.x0) / CELL)); W.ny = Math.max(4, Math.ceil((F.y1 - F.y0) / CELL));
    const n = (W.nx + 1) * (W.ny + 1), A = () => new Float32Array(n);
    h = A(); lower = A(); target = A(); anat = A(); soft = A(); own = A(); under = A(); tmp = A();
    dz = A(); floor = A(); skirt = A(); goal = A(); dc = A(); dv = A();
    fresh = true;
  }

  // pass 1: out of the thighs, from the rest shape into `base`
  function pushOut() {
    base.set(rest);
    legs.forEach((L, k) => {
      const T = legPose(L, L.hip.quaternion), r0 = restIn[k], list = near[k];
      for (let n = 0; n < list.length; n++) {
        const i = list[n], x = rest[3 * i], y = rest[3 * i + 1], z = rest[3 * i + 2];
        const dep = legDepth(L, T, x, y, z, _d);
        // (how deep it may be: none near the skin, its rest depth where the
        // brief's own cut tucks it in under the skin)
        const r = r0[i], ok = r > 0 ? r * smoothstep(PUSH.tuck, PUSH.tuck + 1, r) : 0;
        let p = ease0(dep - ok, PUSH.ease);
        if (!(p > 0)) continue;
        p = PUSH.max * (1 - Math.exp(-p / PUSH.max));
        p *= PUSH.inner + (1 - PUSH.inner) * smoothstep(PUSH.in0, PUSH.in1, Math.abs(x));
        base[3 * i] += _d.x * p; base[3 * i + 1] += _d.y * p; base[3 * i + 2] += _d.z * p;
      }
    });
  }

  // draw triangles into a channel (the front-most depth a cell); e: the
  // matrix's elements from the triangles' frame into the window's. Each point
  // is taken into the window once; a face turned away from the window's
  // normal is never the front-most, so it is passed over (cull: closed hulls)
  let PX = new Float32Array(0), PY = PX, PZ = PX;
  function raster(pa, ix, count, e, ch, tch, rigid, cull) {
    const Wd = W.nx + 1, x0 = W.F.x0, y0 = W.F.y0, nx = W.nx, ny = W.ny, X = [0, 0, 0], Y = [0, 0, 0], Z = [0, 0, 0], np = pa.length / 3;
    if (PX.length < np) { PX = new Float32Array(np); PY = new Float32Array(np); PZ = new Float32Array(np); }
    for (let v = 0; v < np; v++) {
      const px = pa[3 * v], py = pa[3 * v + 1], pz = pa[3 * v + 2];
      PX[v] = ((e[0] * px + e[4] * py + e[8] * pz + e[12]) - x0) / CELL;
      PY[v] = ((e[1] * px + e[5] * py + e[9] * pz + e[13]) - y0) / CELL;
      PZ[v] = e[2] * px + e[6] * py + e[10] * pz + e[14];
    }
    for (let t = 0; t + 2 < count; t += 3) {
      for (let k = 0; k < 3; k++) { const vi = ix ? ix[t + k] : t + k; X[k] = PX[vi]; Y[k] = PY[vi]; Z[k] = PZ[vi]; }
      if (cull && (X[1] - X[0]) * (Y[2] - Y[0]) - (Y[1] - Y[0]) * (X[2] - X[0]) <= 0) continue;
      let i0 = Math.ceil(Math.min(X[0], X[1], X[2])), i1 = Math.floor(Math.max(X[0], X[1], X[2]));
      let j0 = Math.ceil(Math.min(Y[0], Y[1], Y[2])), j1 = Math.floor(Math.max(Y[0], Y[1], Y[2]));
      if (i1 < 0 || j1 < 0 || i0 > nx || j0 > ny) continue;
      i0 = Math.max(0, i0); j0 = Math.max(0, j0); i1 = Math.min(nx, i1); j1 = Math.min(ny, j1);
      const d = (Y[1] - Y[2]) * (X[0] - X[2]) + (X[2] - X[1]) * (Y[0] - Y[2]); if (Math.abs(d) < 1e-9) continue;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const a = ((Y[1] - Y[2]) * (i - X[2]) + (X[2] - X[1]) * (j - Y[2])) / d;
        const b = ((Y[2] - Y[0]) * (i - X[2]) + (X[0] - X[2]) * (j - Y[2])) / d, c = 1 - a - b;
        if (a < -1e-4 || b < -1e-4 || c < -1e-4) continue;
        const z = a * Z[0] + b * Z[1] + c * Z[2], q = j * Wd + i;
        if (z > ch[q]) { ch[q] = z; if (tch) tch[q] = rigid ? 0 : 1; }
      }
    }
  }
  function rasterMesh(mesh, ch, tch) {
    const g = mesh.geometry, p = g.attributes.position; if (!p) return;
    _m.multiplyMatrices(_inv, mesh.matrixWorld);
    raster(p.array, g.index ? g.index.array : null, g.index ? g.index.count : p.count, _m.elements, ch, tch, tissueOf(mesh) === TISSUE.RIGID);
  }
  // one pass of a 3x3 Gaussian over a channel (cells with nothing read as 0)
  function blur(src, dst) {
    const Wd = W.nx + 1, H = W.ny + 1, k = [1, 2, 1];
    for (let j = 0; j < H; j++) for (let i = 0; i < Wd; i++) {
      let s = 0, w = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= Wd || jj >= H) continue;
        const kw = k[di + 1] * k[dj + 1], v = src[jj * Wd + ii]; s += kw * (v > NONE / 2 ? Math.max(0, v) : 0); w += kw;
      }
      dst[j * Wd + i] = s / w;
    }
  }
  // a channel at (fi, fj) in cells, bilinear (clamped to the window)
  function lin(ch, fi, fj) {
    const Wd = W.nx + 1;
    fi = Math.max(0, Math.min(W.nx - 1e-4, fi)); fj = Math.max(0, Math.min(W.ny - 1e-4, fj));
    const i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j, q = j * Wd + i;
    return (ch[q] * (1 - u) + ch[q + 1] * u) * (1 - v) + (ch[q + Wd] * (1 - u) + ch[q + Wd + 1] * u) * v;
  }
  // a channel at (fi, fj), the Catmull-Rom cubic through the 4x4 cells round
  // it - smooth across the cells, so the normals are too - held within the
  // four cells it lies between, so it never rings past a steep edge (fi, fj
  // at least a cell in from the window's edge)
  function cubic(ch, fi, fj) {
    const Wd = W.nx + 1, i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j, r = [0, 0, 0, 0], q0 = j * Wd + i;
    for (let k = -1; k <= 2; k++) { const q = (j + k) * Wd + i; r[k + 1] = cr(ch[q - 1], ch[q], ch[q + 1], ch[q + 2], u); }
    const lo = Math.min(ch[q0], ch[q0 + 1], ch[q0 + Wd], ch[q0 + Wd + 1]), hi = Math.max(ch[q0], ch[q0 + 1], ch[q0 + Wd], ch[q0 + Wd + 1]);
    return Math.max(lo, Math.min(hi, cr(r[0], r[1], r[2], r[3], v)));
  }

  // pass 2: the anatomy - the membrane over the depth map, and how far the
  // brief is carried out a cell (into dc)
  function solve(dt) {
    const F = W.F, Wd = W.nx + 1, H = W.ny + 1, n = Wd * H, thick = fab.thick;
    spec.hips.updateMatrixWorld(true);
    // the window's frame in the hips, and its inverse: the brief's own points
    // into it; the hips' world x it, inverted: a mesh's world into it
    _frame.makeBasis(F.ex, F.ey, F.ez).setPosition(F.O); _toFrame.copy(_frame).invert();
    _inv.multiplyMatrices(spec.hips.matrixWorld, _frame).invert();
    anat.fill(NONE); own.fill(NONE); under.fill(NONE); soft.fill(1);
    fld.pouch.updateMatrixWorld(true);
    fld.pouch.traverse(o => { if (o.isMesh && !o.userData.outline && o.userData.wire !== true) rasterMesh(o, anat, soft); });
    (fld.layers ? fld.layers() : []).forEach(m => rasterMesh(m, under, null));
    raster(base, idx, idx.length, _toFrame.elements, own, null, false, true);
    // soft tissue under the cloth's pressure: flatter, its volume spread round
    // it (the Gaussian keeps the sum); rigid stays crisp
    const press = Math.max(0, Math.min(0.6, fab.cling * (1 - fab.stiff) * 0.55));
    if (press > 0) {
      blur(anat, tmp); blur(tmp, target);
      for (let q = 0; q < n; q++) {
        if (soft[q] === 0 && anat[q] > NONE / 2) continue;            // rigid: as it is
        const a = anat[q], spread = target[q];
        if (a <= NONE / 2 && spread < 0.05) continue;
        const b = a > NONE / 2 ? a : 0;
        anat[q] = b + (spread - b) * press;
      }
    }
    // the floor under the cloth, and where it is pulled: onto the anatomy
    // where there is any, back to its own rest where there is only itself
    let deepest = Infinity;
    for (let q = 0; q < n; q++) {
      const a = anat[q], o = own[q], u = under[q];
      let lo = o > NONE / 2 ? o : NONE;
      if (a > NONE / 2) { lo = Math.max(lo, a + thick); if (u > NONE / 2) lo = Math.max(lo, u + LAYER_GAP); }
      lower[q] = lo;
      target[q] = a > NONE / 2 ? lo : o > NONE / 2 ? o : NaN;
      if (lo > NONE / 2) deepest = Math.min(deepest, lo);
    }
    // (where there is nothing - not even the brief - it falls back)
    const back = (isFinite(deepest) ? deepest : 0) - 2.0;
    for (let q = 0; q < n; q++) if (Number.isNaN(target[q])) target[q] = back;
    if (fresh) h.set(target);
    // the membrane: stiffness toward the neighbours, cling toward the target,
    // never under the floor; the edge rows held at their target
    const sw = 6 * fab.stiff, cw = Math.max(0.05, fab.cling);
    for (let it = 0, nit = fresh ? ITER : ITER_WARM; it < nit; it++) {
      for (let j = 0; j < H; j++) for (let i = 0; i < Wd; i++) {
        const q = j * Wd + i;
        if (i === 0 || j === 0 || i === Wd - 1 || j === H - 1) { h[q] = Math.max(lower[q], target[q]); continue; }
        const avg = (h[q - 1] + h[q + 1] + h[q - Wd] + h[q + Wd]) * 0.25;
        h[q] = Math.max(lower[q], (sw * avg + cw * target[q]) / (sw + cw));
      }
    }
    // how far it stands out of the brief's rest, and the least it may (over
    // the anatomy: clear of it); then a skirt round that, joined smooth
    for (let q = 0; q < n; q++) {
      const o = own[q], has = o > NONE / 2;
      dz[q] = has ? Math.max(0, h[q] - o) : 0;
      floor[q] = has && anat[q] > NONE / 2 ? Math.max(0, lower[q] - o) : 0;
    }
    blur(dz, tmp); blur(tmp, skirt);
    for (let q = 0; q < n; q++) skirt[q] = smax(dz[q], skirt[q], SKIRT_K);
    // the swing vector: the anatomy's velocity against the body, in the
    // window - the cloth is sampled that far ahead of each cell, so it trails
    // the motion (stretched out behind it), and never under its floor
    const sv = spec.swing && spec.swing();
    let li = 0, lj = 0;
    if (sv && sv.v) {
      const vx = sv.v.dot(F.ex), vy = sv.v.dot(F.ey), L = Math.hypot(vx, vy) * LAG_T, k = L > LAG_MAX ? LAG_MAX / L : 1;
      li = vx * LAG_T * k / CELL; lj = vy * LAG_T * k / CELL;
    }
    for (let j = 0; j < H; j++) for (let i = 0; i < Wd; i++) { const q = j * Wd + i; goal[q] = Math.max(floor[q], li || lj ? lin(skirt, i + li, j + lj) : skirt[q]); }
    // the fabric's own inertia: a damped spring a cell toward that - pushed
    // out at once (never inside its floor), eased back with a little sway
    if (fresh || !(dt > 0)) { dc.set(goal); dv.fill(0); }
    else {
      const w = 2 * Math.PI * (3 + 5 * fab.cling), z = 0.25 + 0.5 * fab.stiff, steps = Math.min(24, Math.ceil(dt / STEP)), s = dt / steps;
      for (let k = 0; k < steps; k++) for (let q = 0; q < n; q++) {
        dv[q] += (w * w * (goal[q] - dc[q]) - 2 * z * w * dv[q]) * s; dc[q] += dv[q] * s;
        if (dc[q] < floor[q]) { dc[q] = floor[q]; if (dv[q] < 0) dv[q] = 0; }
      }
    }
  }

  // each point: out of the thighs (pass 1), then carried out along the
  // window's normal over the anatomy (pass 2); its shading smooth where taut
  function carry() {
    const wt = live.weight, F = W.F, Wd = W.nx + 1;
    for (let i = 0; i < N; i++) {
      const bx = base[3 * i], by = base[3 * i + 1], bz = base[3 * i + 2];
      let d = 0;
      if (fld) {
        const rx = bx - F.O.x, ry = by - F.O.y, rz = bz - F.O.z;
        const X = rx * F.ex.x + ry * F.ex.y + rz * F.ex.z, Y = rx * F.ey.x + ry * F.ey.y + rz * F.ey.z, Z = rx * F.ez.x + ry * F.ez.y + rz * F.ez.z;
        const fi = (X - F.x0) / CELL, fj = (Y - F.y0) / CELL, edge = Math.min(fi, fj, W.nx - fi, W.ny - fj);
        if (edge > 1) {
          // (only the front sheet: a point within a hair of the brief's
          // front-most surface there - its back and its seat stay as they are)
          const q = Math.floor(fj) * Wd + Math.floor(fi), top = Math.max(own[q], own[q + 1], own[q + Wd], own[q + Wd + 1]);
          const g = top > NONE / 2 ? (1 - smoothstep(0.6, 2.0, top - Z)) * (fld.hold ? smoothstep(fld.hold[0], fld.hold[1], rest[3 * i + 1]) : 1) : 0;
          if (g > 0) d = Math.max(0, cubic(dc, fi, fj)) * g * smoothstep(1, 4, edge);
        }
      }
      const e = d > 0 ? F.ez : _zero;
      pos[3 * i] = bx + e.x * d; pos[3 * i + 1] = by + e.y * d; pos[3 * i + 2] = bz + e.z * d;
      wt[i] = smoothstep(0, 0.6, d);
    }
    live.refresh();
  }

  const fit = {
    covers: !!fld,
    update(dt) {
      if (fld && !W.F) alloc();
      pushOut();
      if (fld) solve(dt);
      carry();
      fresh = false;
    },
    // the anatomy rebuilt (a slider): the window refitted to what is there now
    refit() { if (fld) alloc(); fit.update(0); },
    // (for the lab's checks: the grid, how far each cell is carried out, and the floor)
    debug: () => ({ nx: W.nx, ny: W.ny, d: Array.from(dc || []), floor: Array.from(floor || []) })
  };
  return fit;
}

// The loose ones, draped. spec: { pieces: [{ mesh (a liveMesh), w:
//   Float32Array (each point's share of the push: 0 where it is held - sewn
//   to the belt, grown out of the brief - 1 where it hangs free), room (cm,
//   the most its gap may be: the room it was cut with round the anatomy),
//   slide, lift (0-1: how much of a swing aside, and up or down, carries it
//   - a cup round the anatomy is carried, a flap hung in front of it is only
//   pushed out, the rest sliding under it) }],
//   fabric: { cling, stiff, drape }, swing: () => { d, tip } (the hips' frame) or null }
export function makeDrape(spec) {
  const fab = spec.fabric, st = spec.pieces.map(() => ({ x: new THREE.Vector3(), v: new THREE.Vector3() }));
  let fresh = true;
  const drape = {
    update(dt) {
      const sv = spec.swing && spec.swing();
      // the anatomy's swing off its rest (cm): the mass's or the tip's, the further
      const D = sv ? (sv.tip && sv.tip.lengthSq() > sv.d.lengthSq() ? sv.tip : sv.d) : null;
      spec.pieces.forEach((P, k) => {
        const S = st[k], live = P.mesh.userData.live, pa = live.smooth.attributes.position.array, rest = live.rest, wt = live.weight;
        // the drape gap: the swing within it touches nothing; past it, it pushes
        const gap = Math.min(P.room ?? Infinity, (1 - fab.cling) * (fab.drape || 0));
        _a.set(0, 0, 0);
        if (D) {
          const raw = D.length(), act = Math.max(0, raw - gap);
          if (raw > 1e-6 && act > 0) _a.copy(D).multiplyScalar(act / raw);
          // (pushed out, never drawn back in toward the body: -z is out; aside
          // and up or down only as far as it is carried)
          if (_a.z > 0) _a.z = 0;
          _a.x *= P.slide ?? 1; _a.y *= P.lift ?? 1;
        }
        // its inertia: pushed at once, eased back with a little sway
        if (fresh || !(dt > 0)) { S.x.copy(_a); S.v.set(0, 0, 0); }
        else {
          const w = 2 * Math.PI * (1.6 + 2.4 * fab.stiff), z = 0.35, steps = Math.min(24, Math.ceil(dt / STEP)), s = dt / steps;
          for (let i = 0; i < steps; i++) {
            _v.subVectors(_a, S.x).multiplyScalar(w * w).addScaledVector(S.v, -2 * z * w);
            S.v.addScaledVector(_v, s); S.x.addScaledVector(S.v, s);
          }
          const L = _a.length();
          if (L > 1e-6) {
            _d.copy(_a).divideScalar(L); const c = S.x.dot(_d);
            if (c < L) { S.x.addScaledVector(_d, L - c); const vc = S.v.dot(_d); if (vc < 0) S.v.addScaledVector(_d, -vc); }
          }
          // (its sway back never takes it in past where it hangs: the body is there)
          if (S.x.z > 0) { S.x.z = 0; if (S.v.z > 0) S.v.z = 0; }
        }
        for (let i = 0; i < wt.length; i++) {
          const w = P.w[i];
          pa[3 * i] = rest[3 * i] + S.x.x * w; pa[3 * i + 1] = rest[3 * i + 1] + S.x.y * w; pa[3 * i + 2] = rest[3 * i + 2] + S.x.z * w;
        }
        live.refresh();
      });
      fresh = false;
    },
    reset() { fresh = true; drape.update(0); },
    // (for the lab's checks: each piece's push off its rest, cm)
    debug: () => st.map(S => S.x.toArray())
  };
  return drape;
}
