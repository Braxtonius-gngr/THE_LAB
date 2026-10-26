// The valley's figures, cut the way Holbein's block-cutter cut them: a body
// as one continuous form built of a few flat planes - a lofted hull through
// cross-sections, faceted, so the hatch breaks at every plane as a knife
// cut does - and a Death the same way, bone by bone. Both stand on y = 0
// facing -z, about 165 tall, with the same joints valley.mjs poses by hand:
//   body:  { hips, torso, neck, head, arms: { l, r: { sh, el, hand } },
//            legs: { l, r: { hip, kn, foot } }, mouth, phase }
//   death: { hips, spine, chest, neck, head, arms, legs, rag, phase, gait }
// Every piece is faceted for the shade and smooth for its outline (the
// outline is an inverted hull pushed along the normal: flat normals would
// tear it at every edge).
// Two kinds of man come out of buildFigure: the valley's (no `build`), and a
// build's (o.build - tuned in the lab). A build's men are the app's own
// figures, for any scene that wants people once they are polished - skin all
// over, dressed, posed and simulated - not the valley's; the valley keeps
// its own until it is moved over to them.
import * as THREE from '../vendor/three/three.module.js';
import { outlineOf, haloOf } from './burin.mjs';
import { makeDrape, liveMesh, skinTo, TISSUE } from './cloth.mjs';
import { UniversalClothMaterial, TISSUE_TYPE } from './universal-cloth-material.mjs';

const PI = Math.PI, HALF = PI / 2;
// the body's hip joint off the ground (the ankle then stands at 3, the sole on it)
export const BODY_HIPS = 92;
const G = (parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); if (parent) parent.add(g); return g; };

// a faceted mesh: the shade from the flat planes, the outline from the
// smooth hull of the same points
// `soft` leans the planes' normals toward the smooth hull's (0 = hard
// facets, 1 = smooth): the cut shows as a step in tone, not a cliff.
let SOFT = 0.8;
export function setSoft(v) { SOFT = v; }
// the paper halo round a figure's main forms (px, 0 = none): every piece
// with an outline of 1.2 or more gets one, so a figure stands off a dark
// passage behind it and a limb off the body it crosses
let HALO = 0;
export function setHalo(v) { HALO = v; }
// the smooth hull and the flat copy of a geometry, the flat one's normals
// leaned `soft` of the way toward the hull's (the smooth normal of each
// point carried over by position)
function facetGeo(geo, soft) {
  const smooth = geo.index ? geo : weld(geo);
  smooth.computeVertexNormals();
  const flat = smooth.toNonIndexed();
  flat.computeVertexNormals();
  if (soft > 0) {
    const sp = smooth.attributes.position, sn = smooth.attributes.normal, map = new Map();
    for (let i = 0; i < sp.count; i++) map.set(sp.getX(i).toFixed(3) + ',' + sp.getY(i).toFixed(3) + ',' + sp.getZ(i).toFixed(3), i);
    const fp = flat.attributes.position, fn = flat.attributes.normal, v = new THREE.Vector3(), w = new THREE.Vector3();
    for (let i = 0; i < fp.count; i++) {
      const j = map.get(fp.getX(i).toFixed(3) + ',' + fp.getY(i).toFixed(3) + ',' + fp.getZ(i).toFixed(3));
      if (j == null) continue;
      v.set(fn.getX(i), fn.getY(i), fn.getZ(i)); w.set(sn.getX(j), sn.getY(j), sn.getZ(j));
      v.lerp(w, soft).normalize(); fn.setXYZ(i, v.x, v.y, v.z);
    }
  }
  return { smooth, flat };
}
function facet(geo, m, parent, outline = 1.8, soft = SOFT) {
  const { smooth, flat } = facetGeo(geo, soft);
  const x = new THREE.Mesh(flat, m); parent.add(x);
  if (outline) { const o = outlineOf(x, outline); o.geometry = smooth; }
  if (HALO && outline >= 1.2) { const h = haloOf(x, HALO); h.geometry = smooth; }
  return x;
}
// facet()'s mesh on bones (a build's garment that spans joints - the brief
// across the hips and both thighs): its weights from `weightAt` (x, y, z)
// -> a share per bone of `skeleton` (cloth.mjs skinTo), on the flat copy
// and the smooth hull alike (the outline skins with it). Bound now at rest,
// and again once the man is at his height (bindSkinned: a bind reads the
// bones' world matrices, so it must follow the root's scale).
function facetSkinned(geo, m, parent, outline, skeleton, weightAt, soft = SOFT) {
  const { smooth, flat } = facetGeo(geo, soft);
  skinTo(flat, weightAt); skinTo(smooth, weightAt);
  const x = new THREE.SkinnedMesh(flat, m); x.frustumCulled = false; parent.add(x);
  parent.updateWorldMatrix(true, true);
  x.bind(skeleton);
  if (outline) { const o = outlineOf(x, outline); o.geometry = smooth; }
  if (HALO && outline >= 1.2) { const h = haloOf(x, HALO); h.geometry = smooth; }
  return x;
}
function bindSkinned(list) {
  list.forEach(m => { m.bind(m.skeleton); m.children.forEach(c => { if (c.isSkinnedMesh) c.bind(m.skeleton, m.bindMatrix); }); });
}
// the body's hulls as one geometry: each part's indexed hull taken into one
// frame by its matrix, its points marked with the bone that owns them (the
// `owner` attribute - the weights read it), the indices run on
function mergeHulls(parts) {
  // (a hull that comes unindexed - a knob - is welded first)
  parts = parts.map(p => (p.geo.index ? p : Object.assign({}, p, { geo: weld(p.geo) })));
  let nv = 0, ni = 0;
  parts.forEach(p => { nv += p.geo.attributes.position.count; ni += p.geo.index.count; });
  const pos = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), owner = new Float32Array(nv), along = new Float32Array(nv * 3), idx = new Uint32Array(ni), v = new THREE.Vector3();
  let vo = 0, io = 0;
  parts.forEach(p => {
    const pa = p.geo.attributes.position, ua = p.geo.attributes.uv, al = p.geo.attributes.aAlong, ia = p.geo.index;
    for (let i = 0; i < pa.count; i++) {
      v.fromBufferAttribute(pa, i).applyMatrix4(p.matrix);
      pos[3 * (vo + i)] = v.x; pos[3 * (vo + i) + 1] = v.y; pos[3 * (vo + i) + 2] = v.z;
      uv[2 * (vo + i)] = ua ? ua.getX(i) : 0; uv[2 * (vo + i) + 1] = ua ? ua.getY(i) : 0;
      owner[vo + i] = p.bone;
      // (the hull's direction carried round with it; a knob - a buttock -
      // takes its own up, so its lines lie level round it)
      if (al) v.fromBufferAttribute(al, i); else v.set(0, 1, 0);
      v.transformDirection(p.matrix);
      along[3 * (vo + i)] = v.x; along[3 * (vo + i) + 1] = v.y; along[3 * (vo + i) + 2] = v.z;
    }
    for (let k = 0; k < ia.count; k++) idx[io + k] = ia.getX(k) + vo;
    vo += pa.count; io += ia.count;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('owner', new THREE.BufferAttribute(owner, 1));
  g.setAttribute('aAlong', new THREE.BufferAttribute(along, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}
// the soft tissue's motion: each site a small mass on a spring, driven
// against the body's own acceleration (the hips', up and down and fore and
// aft, in its own axes - a jolt presses it in, a drop lets it out; each
// site weighs the two its own way, `gy` and `gz`, and its drive is squashed
// by tanh at gain `g`: a walk's bob reads small, a jog's landing full but
// never pinned), so a stride, a landing, a jog set the belly, the chest and
// the seat moving a beat behind the body; the pulses go to the skin's
// cloth (its sites)
function softDrive(hips, ucm, gains) {
  const P = new THREE.Vector3(), prevP = new THREE.Vector3(), vel = new THREE.Vector3(), prevV = new THREE.Vector3(), acc = new THREE.Vector3(), q = new THREE.Quaternion();
  const st = gains.map(() => ({ x: 0, v: 0 })), pulse = new Float32Array(gains.length);
  const K = 320, C = 2 * Math.sqrt(320) * 0.34, H = 1 / 240;
  let fresh = true;
  return {
    update(dt) {
      hips.getWorldPosition(P);
      if (fresh || !(dt > 0)) { prevP.copy(P); prevV.set(0, 0, 0); st.forEach(s => { s.x = 0; s.v = 0; }); pulse.fill(0); fresh = false; ucm.set({ pulse }); return; }
      vel.subVectors(P, prevP).divideScalar(dt); acc.subVectors(vel, prevV).divideScalar(dt); prevP.copy(P); prevV.copy(vel);
      hips.getWorldQuaternion(q).invert(); acc.applyQuaternion(q);
      const ay = -acc.y / 980, az = -acc.z / 980, n = Math.max(1, Math.ceil(dt / H)), h = dt / n;
      gains.forEach((g, i) => {
        const s = st[i], goal = Math.tanh((ay * g.gy + az * g.gz) * g.g);
        for (let j = 0; j < n; j++) { s.v += (K * (goal - s.x) - C * s.v) * h; s.x += s.v * h; }
        pulse[i] = Math.max(-1, Math.min(1, s.x));
      });
      ucm.set({ pulse });
    },
    reset() { fresh = true; },
    debug: () => Array.from(pulse)
  };
}

// points that coincide made one (an icosahedron comes with every face its
// own three points; welded, its hull is smooth)
function weld(geo) {
  const p = geo.attributes.position, t = geo.attributes.uv, al = geo.attributes.aAlong, map = new Map(), pos = [], uv = [], along = [], idx = [];
  for (let i = 0; i < p.count; i++) {
    const k = p.getX(i).toFixed(3) + ',' + p.getY(i).toFixed(3) + ',' + p.getZ(i).toFixed(3);
    let j = map.get(k);
    if (j == null) { j = pos.length / 3; map.set(k, j); pos.push(p.getX(i), p.getY(i), p.getZ(i)); if (t) uv.push(t.getX(i), t.getY(i)); if (al) along.push(al.getX(i), al.getY(i), al.getZ(i)); }
    idx.push(j);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); if (t) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); if (al) g.setAttribute('aAlong', new THREE.Float32BufferAttribute(along, 3)); g.setIndex(idx); return g;
}
// facet()'s mesh, reshaped in place each frame (a garment fitted to the body,
// the shaft bending out of its root): cloth.mjs's liveMesh, with the halo
function liveFacet(geo, m, parent, outline = 1.8, soft = SOFT) {
  const x = liveMesh(geo.index ? geo : weld(geo), m, parent, { outline, soft });
  if (HALO && outline >= 1.2) { const h = haloOf(x, HALO); h.geometry = x.userData.live.smooth; }
  return x;
}

// ------------------------------------------------------------ the loft
// A hull through cross-sections. Each section: { y, rx, rz, x, z, n,
// front, back, tilt } - an n-gon at height y (centre x, z), rx wide and
// rz deep, its front (−z) pulled out by `front` and its back by `back`
// (a belly, a buttock, a calf), tilted `tilt` about x. All sections share
// n. `arc` [a0, a1] cuts a part-hull (for a halved torso); `cap` closes the
// ends; `front` k (0-1, a closed hull only) packs its points toward the front
// - (1 + k) / (1 - k) times as close there as behind, the hatch laid by angle
// all the same (a garment fitted over the anatomy). Returns an indexed
// geometry (smooth normals; facet() flattens it).
function loft(secs, o = {}) {
  const n = o.n || secs[0].n || 10, a0 = o.arc ? o.arc[0] : 0, a1 = o.arc ? o.arc[1] : PI * 2, open = !!o.arc;
  const cols = open ? n + 1 : n;
  const pos = [], idx = [];
  // (each column's share of the way round: even, or packed toward the front -
  // its angle's rate least at the front, 3/4 of the way round from +x)
  const kf = !open && o.front ? o.front : 0, frac = i => i / n - (kf / (2 * PI)) * Math.sin(2 * PI * (i / n - 0.75));
  const ringOf = (s) => {
    const r = [];
    for (let i = 0; i < cols; i++) {
      const a = a0 + (a1 - a0) * frac(i) + (o.spin || 0);
      let x = Math.cos(a) * s.rx, z = Math.sin(a) * s.rz;
      // (-z is the front; a pull proportional to how far round the front we are)
      const fz = Math.max(0, -Math.sin(a)), bz = Math.max(0, Math.sin(a));
      z -= fz * fz * (s.front || 0); z += bz * bz * (s.back || 0);
      if (s.folds) { const f = 1 + s.folds[1] * Math.sin(s.folds[0] * a + (s.folds[2] || 0)); x *= f; z *= f; }   // (cloth's folds: the ring rippled round)
      // (lobes: a muscle's swell out of the front of the hull - the pectorals -
      // part of the one surface, not a plate laid on it)
      if (s.lobes) for (const L of s.lobes) { const d = (x - L.x) / L.w; z -= L.d * fz * Math.exp(-d * d); }
      if (s.squash) z *= 1 - s.squash * Math.abs(Math.cos(a));
      let y = s.y;
      if (s.locks) y += (i % 2 ? 1 : -1) * s.locks * (0.6 + 0.4 * Math.sin(i * 2.3)) * (0.5 + 0.5 * fz);   // (a hem cut into locks, deepest at the brow)
      if (s.tilt) { const zz = z; z = zz * Math.cos(s.tilt); y += zz * Math.sin(s.tilt); }
      // (a garment's edge: raised at the sides, dropped behind - a brief's leg)
      if (s.saddle) y += s.saddle * Math.cos(a) * Math.cos(a);
      if (s.dropBack) y -= s.dropBack * bz * bz;
      r.push([x + (s.x || 0), y, z + (s.z || 0)]);
    }
    return r;
  };
  const rings = secs.map(ringOf), uv = [], along = [];
  // (uv: u round the section, v along the hull - the UV plates hatch along the limb)
  let run = 0; const vAt = [0];
  for (let j = 1; j < secs.length; j++) { run += Math.hypot((secs[j].x || 0) - (secs[j - 1].x || 0), secs[j].y - secs[j - 1].y, (secs[j].z || 0) - (secs[j - 1].z || 0)); vAt.push(run); }
  // (`metric` [mu, mv]: the UV plate's own scale, undone - the uv is then
  // laid in world units round and along the hull, DENS lines a unit, so a
  // torso and a finger are hatched at the same pitch)
  const fq = o.metric ? 1.3 / (o.metric[2] || 1.3) : 1;
  const mu = o.metric ? DENS * fq / o.metric[0] : 1, mv = o.metric ? DENS * fq / o.metric[1] : 1;
  rings.forEach((r, j) => { const per = o.metric ? PI * (secs[j].rx + secs[j].rz) * (open ? (a1 - a0) / (PI * 2) : 1) : 1; r.forEach((p, i) => { pos.push(...p); uv.push(frac(i) * per * mu, (o.metric ? vAt[j] : (run ? vAt[j] / run : 0)) * mv); }); });
  // (aAlong: the hull's own direction at each ring - from its centre to the
  // next's, the last ring from the one before (the centres', not each
  // point's: a lobe or a fold pulls a point off the line, and a plate's
  // rings would kink round it) - so a plate can lay its lines round the
  // form, square to it, wherever the hull turns; see burin.mjs)
  const cAt = j => [secs[j].x || 0, secs[j].y, secs[j].z || 0];
  rings.forEach((r, j) => {
    const k = j < rings.length - 1 ? j + 1 : j - 1, d = k >= 0 ? [cAt(k)[0] - cAt(j)[0], cAt(k)[1] - cAt(j)[1], cAt(k)[2] - cAt(j)[2]] : [0, 1, 0], L = Math.hypot(d[0], d[1], d[2]) || 1;
    r.forEach(() => along.push(d[0] / L, d[1] / L, d[2] / L));
  });
  // (a hull built downward would be inside out: its faces are turned)
  const down = secs[secs.length - 1].y < secs[0].y;
  for (let j = 0; j < secs.length - 1; j++) {
    for (let i = 0; i < (open ? n : n); i++) {
      const i2 = open ? i + 1 : (i + 1) % n;
      const a = j * cols + i, b = j * cols + i2, c = (j + 1) * cols + i, d = (j + 1) * cols + i2;
      if (down) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
  }
  if (o.cap !== false) {
    [0, secs.length - 1].forEach((j, k) => {
      const s = secs[j]; if (s.rx < 0.3 && s.rz < 0.3) return;
      const cx = (s.x || 0), cz = (s.z || 0);
      const ci = pos.length / 3; pos.push(cx, s.y, cz); uv.push(0.5, k); along.push(...along.slice(j * cols * 3, j * cols * 3 + 3));
      for (let i = 0; i < (open ? n : n); i++) {
        const i2 = open ? i + 1 : (i + 1) % n;
        const a = j * cols + i, b = j * cols + i2;
        if ((k === 0) !== down) idx.push(ci, b, a); else idx.push(ci, a, b);
      }
    });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aAlong', new THREE.Float32BufferAttribute(along, 3));
  g.setIndex(idx);
  return g;
}
// the UV plates' scales in the valley's kit, and the pitch laid on the hulls
// (the plate's uv scale, and its freq: the hatch is laid at DENS x 1.3 lines a unit whatever the plate's own freq)
const UVM = { flesh: [12, 5, 1.3], muscle: [12, 5, 2.0], linen: [18, 4, 1.3], hair: [24, 8, 1.6] };
let DENS = 0.9;
export function setDens(v) { DENS = v; }
// where a hull's front face lies (z) at height y - features sit on it
function frontAt(secs, y) {
  for (let j = 1; j < secs.length; j++) {
    const a = secs[j - 1], b = secs[j];
    if (y <= b.y || j === secs.length - 1) { const k = Math.max(0, Math.min(1, (y - a.y) / (b.y - a.y))); const fa = (a.z || 0) - a.rz - (a.front || 0), fb = (b.z || 0) - b.rz - (b.front || 0); return fa + (fb - fa) * k; }
  }
  return 0;
}
// where a hull's front surface is at height y and across at x (z), lobes
// and all - a nipple sits on the pectoral there
function frontZAt(secs, y, x) {
  let a = secs[0], b = secs[1];
  for (let j = 1; j < secs.length; j++) { a = secs[j - 1]; b = secs[j]; if (y <= b.y) break; }
  const k = Math.max(0, Math.min(1, (y - a.y) / (b.y - a.y))), L = (p, q) => (p || 0) + ((q || 0) - (p || 0)) * k;
  const rx = L(a.rx, b.rx), rz = L(a.rz, b.rz), front = L(a.front, b.front), zc = L(a.z, b.z);
  const ang = -Math.acos(Math.max(-1, Math.min(1, x / rx))), fz = -Math.sin(ang);
  let z = Math.sin(ang) * rz - fz * fz * front;
  [a, b].forEach((s, i) => (s.lobes || []).forEach(Lb => { const d = (x - Lb.x) / Lb.w; z -= (i ? k : 1 - k) * Lb.d * fz * Math.exp(-d * d); }));
  return z + zc;
}
// a round-section loft, radii given: [[y, r], ...] with optional pulls
const tube = (pts, n = 8, o = {}) => loft(pts.map(p => ({ y: p[0], rx: p[1], rz: p[2] == null ? p[1] : p[2], front: p[3] || 0, back: p[4] || 0 })), Object.assign({ n }, o));
// a joint's ball as a tube's rings: the half of a sphere of radius r about
// y0 on the side `dir` (+1 above, -1 below), closed to a point - two limbs
// ending in the same ball meet at any bend with no seam
const ball = (y0, r, dir) => { const out = []; for (let k = 0; k <= 4; k++) { const a = (dir > 0 ? 4 - k : k) / 4 * HALF; out.push([y0 + dir * r * Math.sin(a), Math.max(0.3, r * Math.cos(a))]); } return dir > 0 ? out : out; };
// a cut block: a box of planes with its edges knocked off
function block(w, h, d, bevel = 0.3) {
  const g = new THREE.BoxGeometry(w, h, d, 1, 1, 1);
  if (bevel) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); p.setXYZ(i, x * (1 - bevel * 0.2 * Math.abs(y / h)), y, z * (1 - bevel * 0.3 * Math.abs(y / h))); } }
  return g;
}
// a faceted knob (a joint, a skull's dome): an icosahedron, scaled
// a dark disc (a socket, a mouth's hollow): a circle turned to face -z, the front
const disc = (r, seg, m, parent, x, y, z, yaw = 0) => { const d = new THREE.Mesh(new THREE.CircleGeometry(r, seg), m); d.position.set(x, y, z); d.rotation.y = PI + yaw; parent.add(d); return d; };
// an ink seam: a thin dark line laid on a surface, through the points given
// (an ecorche's muscle boundaries, read at any distance)
function seam(pts, parent, m, r = 0.45) {
  const c = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)));
  const x = new THREE.Mesh(new THREE.TubeGeometry(c, Math.max(4, pts.length * 3), r, 4, false), m); parent.add(x); return x;
}
// a stave: a flat strap swept along points, its broad face turned out from
// `axis` (a point the cage curls round): w the strap's width, t its thickness
function stave(pts, w, t, axis) {
  const c = new THREE.CatmullRomCurve3(pts), n = Math.max(6, pts.length * 2), P = c.getSpacedPoints(n), pos = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const p = P[i], T = c.getTangentAt(i / n).normalize();
    const out = new THREE.Vector3(p.x - axis.x, 0, p.z - axis.z); out.addScaledVector(T, -out.dot(T)); if (out.lengthSq() < 1e-6) out.set(0, 0, -1); out.normalize();
    const up = new THREE.Vector3().crossVectors(T, out).normalize();
    const taper = 0.75 + 0.25 * Math.sin(Math.PI * Math.min(1, (i / n) * 1.6 + 0.2));
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([u, v]) => { const q = p.clone().addScaledVector(up, u * w * taper / 2).addScaledVector(out, v * t / 2); pos.push(q.x, q.y, q.z); });
  }
  for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) { const a = i * 4 + k, b = i * 4 + (k + 1) % 4, c2 = a + 4, d = b + 4; idx.push(a, c2, b, b, c2, d); }
  // the ends
  idx.push(0, 1, 2, 0, 2, 3); const L = n * 4; idx.push(L, L + 2, L + 1, L, L + 3, L + 2);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); return g;
}
// (a knob's direction is its own up: a wrapped plate lays its lines level round it)
const knob = (r, sx = 1, sy = 1, sz = 1, detail = 1) => { const g = new THREE.IcosahedronGeometry(r, detail); g.scale(sx, sy, sz); const n = g.attributes.position.count, al = new Float32Array(n * 3); for (let i = 0; i < n; i++) al[3 * i + 1] = 1; g.setAttribute('aAlong', new THREE.BufferAttribute(al, 3)); return g; };

// where a shaft lies in a closed hand (hand space): across the palm, under
// the fingers' roots, on the palm's side (+z: the fingers curl toward +z)
export const GRIP = [0, -7.5, 3.6];
// a tool set in a hand: its own y laid along the hand's x (across the
// palm) at GRIP, turned `roll` about that axis, the fingers closed on it
export function hold(hand, tool, o = {}) {
  const w = new THREE.Group(); hand.add(w);
  w.position.set(...GRIP); w.rotation.x = o.roll || 0;
  w.add(tool);
  if ((o.axis || 'y') === 'y') tool.rotation.set(0, 0, -HALF); else tool.rotation.set(0, HALF, 0);
  if (hand.userData.grip) hand.userData.grip(o.c == null ? 1 : o.c);
  return w;
}
// the arm reached to a point: the shoulder's three turns and the elbow's
// bend searched (coordinate descent) until the hand's grip point sits on
// `target` (in root's own frame; root is updated as it goes). Returns the
// four angles, for a pose lerped later.
const _gp = new THREE.Vector3(), _t = new THREE.Vector3();
// o.elbow: where the elbow should lie as well (a forearm laid on a table);
// o.start: the four angles to begin from (a natural pose, so the search
// settles into it and not into an elbow-up one).
const _ep = new THREE.Vector3(), _te = new THREE.Vector3();
export function reach(arm, target, root, rounds = 10, o = {}) {
  // (a few starts round the given one, the best kept: coordinate descent
  // can settle in a fold of the arm's space)
  if (o.start && !o.single) {
    const s0 = o.start, tries = [s0, [s0[0] - 0.5, s0[1], s0[2], s0[3]], [s0[0] + 0.4, s0[1], s0[2], s0[3] - 0.5], [s0[0], s0[1] + 0.4, s0[2], s0[3]], [s0[0], s0[1] - 0.4, s0[2], s0[3]], [s0[0] - 0.9, s0[1], s0[2] * 2, 0.4]];
    let best = null;
    for (const st of tries) { const a = reach(arm, target, root, rounds, Object.assign({}, o, { start: st, single: true })); if (!best || arm.miss < best.miss) best = { a, miss: arm.miss }; }
    setArm(arm, best.a); arm.miss = best.miss; return best.a;
  }
  const { sh, el, hand } = arm;
  _t.set(...target); if (o.elbow) _te.set(...o.elbow);
  if (o.start) { sh.rotation.set(o.start[0], o.start[1], o.start[2]); el.rotation.x = o.start[3]; }
  const toRoot = (v) => { if (root.parent) root.parent.worldToLocal(v); return v; };
  const dist = () => {
    root.updateMatrixWorld(true); _gp.set(...GRIP); hand.localToWorld(_gp); toRoot(_gp);
    let d = _gp.distanceTo(_t);
    if (o.elbow) { _ep.set(0, 0, 0); el.localToWorld(_ep); toRoot(_ep); d += 0.8 * _ep.distanceTo(_te); }
    return d;
  };
  const P = [[sh.rotation, 'x'], [sh.rotation, 'y'], [sh.rotation, 'z'], [el.rotation, 'x']];
  // (the elbow bends one way only, the forearm to the body's front: on a
  // limb that hangs down a joint's +x swings it forward, -z - the knee is the
  // one that folds back)
  const ok = () => el.rotation.x >= -0.02 && el.rotation.x <= 2.6;
  let step = 0.6, best = dist();
  for (let r = 0; r < rounds * 4 && best > (o.elbow ? 0.5 : 0.05); r++) {
    let moved = false;
    for (const [rot, k] of P) {
      for (const dir of [1, -1]) {
        // (a line search: keep stepping while it helps)
        for (;;) {
          const was = rot[k]; rot[k] = was + dir * step;
          const d = ok() ? dist() : Infinity;
          if (d < best - 1e-4) { best = d; moved = true; } else { rot[k] = was; break; }
        }
      }
    }
    if (!moved) step *= 0.6;
    if (step < 1e-3) break;
  }
  arm.miss = best;
  return [sh.rotation.x, sh.rotation.y, sh.rotation.z, el.rotation.x];
}
export function setArm(arm, a) { arm.sh.rotation.set(a[0], a[1], a[2]); arm.el.rotation.x = a[3]; }
// a pose through three solves at s = -1, 0, 1, read at s
export function lerp3(a, b, c, s) { return a.map((_, i) => b[i] + s * (c[i] - a[i]) / 2 + s * s * ((c[i] + a[i]) / 2 - b[i])); }
// ------------------------------------------------------------ a build's face
// (a build's men only - the lab's; the valley keeps buildHead and its
// screams.) A face rather than a mask: one smooth hull from the chin to the
// crown with the cheekbones, the brow ridge and the jaw pushed out of it and
// the sockets sunk into it; eyeballs set in the sockets under lids that
// close over them; brows of hair; a nose with its wings and nostrils; closed
// lips; ears with a rim; the hair and a beard that follows the jaw. Mass
// fills the cheeks and jaw, muscle squares it, age lets it sag and lines it.
// head.userData.setFace(name) moves it: 'calm', 'effort' (set jaw, pressed
// lips, a squint, the brows down and in) or 'pain' (the brows drawn up in
// the middle, the eyes screwed, the teeth bared).
export const FACES = {
  calm:   { lid: 0.30, low: 0.14, brow: 0,    tilt: 0,     press: 0,   open: 0,    teeth: 0, corner: 0 },
  effort: { lid: 0.42, low: 0.30, brow: -0.3, tilt: 0.16,  press: 1,   open: 0,    teeth: 0, corner: -0.25 },
  pain:   { lid: 0.58, low: 0.40, brow: 0.25, tilt: -0.24, press: 0.3, open: 0.55, teeth: 1, corner: -0.45 }
};
// a face's own cut, laid over what the build gives it (the lab's face
// variants, so two men of one build are two men): jaw width, cheek fullness,
// brow ridge, the nose's length and width, the mouth's width - each a share
// added to the build's own
export const FACE_VARIANTS = {
  plain:  { name: 'Plain' },
  square: { name: 'Square', jaw: 0.14, brow: 0.3, noseW: 0.1, cheek: -0.1 },
  narrow: { name: 'Narrow', jaw: -0.1, cheek: -0.3, nose: 0.22, noseW: -0.15, mouth: -0.25 },
  round:  { name: 'Round', jaw: 0.06, cheek: 0.6, nose: -0.12, noseW: 0.12, mouth: 0.35 },
  hawk:   { name: 'Hawk', nose: 0.4, noseW: 0.04, brow: 0.4, cheek: 0.2, jaw: -0.04 },
  soft:   { name: 'Soft', brow: -0.25, jaw: -0.06, nose: -0.18, noseW: -0.05, mouth: -0.15, cheek: 0.15 }
};
function buildFace(kit, o, B) {
  const skin = kit.face, head = new THREE.Group();
  const FV = Object.assign({ jaw: 0, cheek: 0, brow: 0, nose: 0, noseW: 0, mouth: 0 }, (o.faceVar && FACE_VARIANTS[o.faceVar]) || {});
  const fat = Math.max(0, B.mass), lean = Math.max(0, -B.mass), mus = Math.max(0, B.muscle), old = Math.max(0, B.age);
  const jaw = (1 + 0.10 * mus - 0.06 * lean) * (1 + FV.jaw);
  // the hull: [y, rx, rz, z, front, lobes]
  const S = [
    { y: -6.5, rx: 1.4, rz: 1.6, z: -3.5 },
    { y: -6.0, rx: (2.9 + 0.8 * fat) * jaw, rz: 3.3 + 0.4 * fat, z: -2.8, front: 0.3 },
    { y: -4.6, rx: (4.6 + 1.5 * fat + 0.6 * old) * jaw, rz: 5.5 + 0.9 * fat, z: -1.7, front: 0.5, lobes: [{ x: 0, w: 1.7, d: 0.45 + 0.2 * mus }] },
    { y: -2.9, rx: (6.0 + 1.3 * fat + 0.5 * old) * jaw, rz: 7.2 + 0.5 * fat, z: -0.8, front: 0.6 },
    { y: -1.3, rx: 6.6 + 1.0 * fat + 0.3 * old, rz: 8.0, z: -0.3, front: 0.7, lobes: [{ x: 0, w: 2.3, d: 0.5 }] },
    { y: 0.7, rx: 7.2 + 0.7 * fat, rz: 8.6, z: 0.1, front: 0.6, lobes: [{ x: -4.2, w: 1.7, d: 0.4 + 0.5 * fat + FV.cheek }, { x: 4.2, w: 1.7, d: 0.4 + 0.5 * fat + FV.cheek }] },
    { y: 2.5, rx: 7.6 + 0.3 * fat, rz: 9.0, z: 0.4, front: 0.5, lobes: [{ x: -4.6, w: 1.3, d: 0.7 + 0.3 * lean }, { x: 4.6, w: 1.3, d: 0.7 + 0.3 * lean }] },
    { y: 3.9, rx: 7.8, rz: 9.2, z: 0.5, front: 0.4, lobes: [{ x: -3.1, w: 1.35, d: -0.95 - 0.25 * old }, { x: 3.1, w: 1.35, d: -0.95 - 0.25 * old }] },
    { y: 5.3, rx: 7.9, rz: 9.5, z: 0.7, front: 0.9, lobes: [{ x: -3.0, w: 1.9, d: 0.3 + 0.15 * mus + FV.brow }, { x: 3.0, w: 1.9, d: 0.3 + 0.15 * mus + FV.brow }] },
    { y: 8.0, rx: 7.7, rz: 9.6, z: 1.0, front: 0.6 },
    { y: 10.8, rx: 7.1, rz: 9.1, z: 1.3 },
    { y: 13.0, rx: 5.4, rz: 7.0, z: 1.7 },
    { y: 14.6, rx: 2.0, rz: 2.6, z: 1.8 },
    { y: 14.9, rx: 0.3, rz: 0.3, z: 1.8 }
  ];
  const skull = facet(loft(densify(S, 2), { n: 28 }), skin, head, 2, 1);
  const F = (y, x = 0) => frontZAt(S, y, x);
  // (the lips a shade warmer than the face, by their own studio key)
  const lipM = kit._lip || (kit._lip = (() => { const m = kit.face.clone(); m.userData = Object.assign({}, kit.face.userData, { studioKey: 'lip' }); if (m.uniforms && m.uniforms.uTone) m.uniforms.uTone.value += 0.12; return m; })()), parts = {};
  // the eyes: a ball in each socket, the lids two shells over it that turn
  // shut (a cap's edge on the ball's equator, turned about x), a lash line on
  // the upper one's edge; turned a little out with the socket
  const ER = 1.15, LR = 1.3;
  const cap = (top) => new THREE.SphereGeometry(LR, 16, 6, PI - 0.5, PI + 1.0, top ? 0 : HALF, HALF);
  parts.lids = [];
  [-1, 1].forEach(sx => {
    const ex = sx * 3.1, ey = 3.9, eye = G(head, ex, ey, F(ey, ex) + ER - 0.7);
    eye.rotation.y = sx * 0.14;
    facet(new THREE.SphereGeometry(ER, 18, 12), kit.bone, eye, 0, 1);
    const iris = new THREE.Mesh(new THREE.CircleGeometry(0.52, 18), kit.ink); iris.position.z = -ER + 0.02; iris.rotation.y = PI; eye.add(iris);
    const up = G(eye), lo = G(eye);
    facet(cap(true), skin, up, 0, 1); facet(cap(false), skin, lo, 0, 1);
    // (the lash line: the upper lid's edge, across its front)
    const lash = []; for (let k = 0; k <= 8; k++) { const a = PI + 0.25 + (PI - 0.5) * k / 8; lash.push([-LR * Math.cos(a) * 1.01, 0, LR * Math.sin(a) * 1.01]); }
    seam(lash, up, kit.ink, 0.11);
    // (an older man's: a bag under the eye)
    if (old > 0.3) { const bag = facet(knob(1.0, 1.5, 0.4 + 0.15 * old, 0.45, 1), skin, head, 0, 1); bag.position.set(ex, ey - 1.45, F(ey - 1.45, ex) + 0.3); }
    parts.lids.push({ up, lo });
  });
  // the brows: hair laid along the ridge over each eye, a group each so it
  // can lift, drop and tilt
  const hairM = o.hairMat || kit.hair;
  parts.brows = [-1, 1].map(sx => {
    const g = G(head, sx * 3.3, 6.0, 0), pts = [];
    for (let k = 0; k <= 6; k++) { const x = sx * (1.3 + 4.2 * k / 6), y = 6.0 + 0.45 * Math.sin(PI * k / 6) - 0.25 * k / 6; pts.push([x - sx * 3.3, y - 6.0, F(y, x) - 0.45]); }
    seam(pts, g, hairM, 0.24 + 0.05 * fat);
    return g;
  });
  // the nose: a loft down from the bridge to the tip, (center, width, depth,
  // how far its front stands off the face), the wings at its foot, the nostrils
  const nl = (1 + 0.12 * old) * (1 + FV.nose), nw = (1 + 0.15 * fat + 0.05 * mus) * (1 + FV.noseW);
  const ns = (y, rx, rz, p) => ({ y, rx: rx * nw, rz, z: F(y) - p + rz });
  facet(loft([ns(5.0, 0.55, 0.5, 0.2), ns(3.6, 0.7, 0.7, 0.5), ns(2.0, 0.75, 0.85, 1.0 * nl), ns(0.6, 0.9, 0.9, 1.5 * nl), ns(-0.2, 0.85, 0.8, 1.55 * nl), ns(-0.85, 0.5, 0.5, 1.0), ns(-1.05, 0.2, 0.2, 0.6)], { n: 12 }), skin, head, 0.8, 1);
  [-1, 1].forEach(sx => {
    const wing = facet(knob(0.7, 1, 0.85, 1.0, 1), skin, head, 0.5, 1); wing.position.set(sx * 1.0 * nw, -0.35, F(-0.35, 1.0) - 0.55);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.32, 10), kit.ink); hole.position.set(sx * 0.55, -0.88, F(-0.9) - 1.0); hole.rotation.x = HALF; hole.scale.set(1, 1.5, 1); head.add(hole);
  });
  // the mouth: two lips laid on the face, the line between, the corners;
  // a dark gap and the teeth behind for the strained face
  const MY = -2.0, MW = (2.5 + 0.3 * fat) * (1 + FV.mouth);
  const lipPts = (y0, bow, drop) => { const pts = []; for (let k = 0; k <= 10; k++) { const u = k / 10 * 2 - 1, x = u * MW, y = y0 + bow * Math.exp(-u * u * 18) - drop * u * u; pts.push([x, y, F(y, x) - 0.12]); } return pts; };
  parts.upper = G(head); parts.lower = G(head); parts.line = G(head);
  // (the lips sit back into the face: their tubes' fronts just proud of it)
  facet(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(lipPts(MY + 0.42, -0.12, 0.25).map(p => new THREE.Vector3(...p))), 24, 0.3, 8, false), lipM, parts.upper, 0.4, 1);
  facet(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(lipPts(MY - 0.5, 0, -0.2).map(p => new THREE.Vector3(...p))), 24, 0.36, 8, false), lipM, parts.lower, 0.4, 1);
  seam(lipPts(MY, 0, 0.2).map(p => [p[0] * 1.04, p[1], p[2] - 0.25]), parts.line, kit.ink, 0.09);
  parts.gap = new THREE.Mesh(new THREE.CircleGeometry(1, 20), kit.ink); parts.gap.position.set(0, MY - 0.1, F(MY) - 0.12); parts.gap.rotation.y = PI; head.add(parts.gap);
  parts.teeth = facet(block(MW * 1.25, 0.55, 0.4, 0), kit.bone, head, 0); parts.teeth.position.set(0, MY + 0.05, F(MY) - 0.05);
  // (an older or heavier man: the folds from the nose's wings to the mouth's corners)
  if (old > 0.25 || fat > 0.5) [-1, 1].forEach(sx => seam([[sx * 1.7, -0.5, F(-0.5, 1.7) - 0.05], [sx * 2.6, -1.4, F(-1.4, 2.6) - 0.02], [sx * (MW + 0.5), -2.6, F(-2.6, MW + 0.5) + 0.05]], head, lipM, 0.13 + 0.06 * old));
  // (an old man's forehead: three faint lines)
  if (old > 0.6) for (let k = 0; k < 3; k++) { const y = 7.2 + k * 0.9, pts = []; for (let j = 0; j <= 6; j++) { const x = (j / 6 * 2 - 1) * 3.6; pts.push([x, y + 0.2 * Math.cos(x * 0.6), F(y, x) - 0.02]); } seam(pts, head, lipM, 0.08); }
  // the ears: a shell, its rim curled round, the bowl darker, flaring back
  [-1, 1].forEach(sx => {
    const ear = G(head, sx * 7.55, 2.6, 1.8), ek = 1 + 0.12 * old;
    ear.rotation.y = sx * 0.35; ear.scale.setScalar(ek);
    facet(knob(1.0, 0.32, 2.85, 1.85, 1), skin, ear, 0.7, 1).position.set(sx * 0.15, 0, 0);
    const rim = [[0, -2.4, -0.4], [0, -1.0, 1.2], [0, 1.2, 1.9], [0, 2.7, 1.2], [0, 3.0, -0.3], [0, 2.1, -1.2]];
    facet(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rim.map(p => new THREE.Vector3(sx * 0.35, p[1], p[2]))), 20, 0.36, 6, false), skin, ear, 0.6, 1);
    const bowl = facet(knob(0.7, 0.3, 1.1, 0.8, 1), skin, ear, 0, 1); bowl.position.set(sx * 0.25, 0.1, -0.1);
  });
  // the hair: as the valley's, a cap of planes cut into locks at the brow
  const recede = o.recede || 0;
  facet(loft([
    { y: 2.4 + recede * 5.0, rx: 9.0, rz: 10.4, z: 1.6 + recede * 1.2, front: -4.2 - recede * 1.6, locks: 2.6 * (1 - recede * 0.6) }, { y: 7.4 + recede * 2.6, rx: 9.4, rz: 10.6, z: 1.4, front: -2.2 }, { y: 11.0, rx: 8.0, rz: 9.5, z: 1.8 }, { y: 14.0, rx: 5.8, rz: 7.4, z: 1.8 }, { y: 15.5, rx: 0.2, rz: 0.2, z: 1.8 }
  ], { n: 18, spin: PI / 18, metric: UVM.hair }), hairM, head, 1.4).userData.hair = true;
  if (o.beard) {
    // the beard: a shell over the jaw and chin (open at the mouth), the
    // sideburns down the cheeks to it, and the moustache over the lip
    const off = (sec, d) => Object.assign({}, sec, { rx: sec.rx + d, rz: sec.rz + d, lobes: null });
    // (its top edge climbs the cheeks at the sides - the saddle - toward the
    // ears, under the lip at the front)
    const jawS = [{ y: -2.8, rx: S[5].rx + 0.55, rz: S[3].rz + 0.45, z: S[3].z, front: (S[3].front || 0) - 0.15, saddle: 3.6 }, off(S[2], 0.55), off(S[1], 0.6), { y: -6.9, rx: 2.0, rz: 2.0, z: -3.3 }, { y: -7.3, rx: 0.5, rz: 0.5, z: -3.4 }];
    facet(loft(jawS, { n: 20, arc: [PI - 0.15, 2 * PI + 0.15], metric: UVM.hair, cap: false }), hairM, head, 1.0, 1);
    const mo = []; for (let k = 0; k <= 10; k++) { const u = k / 10 * 2 - 1, x = u * (MW + 0.3), y = MY + 0.95 - 0.6 * u * u * u * u; mo.push([x, y, F(y, x) - 0.4]); }
    facet(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(mo.map(p => new THREE.Vector3(...p))), 24, 0.42, 8, false), hairM, head, 0.6, 1);
  }
  head.userData = { skull, mouth: parts.gap, nose: null, face: 'calm' };
  // the expression: the lids turned shut so far, the brows moved, the lips
  // pressed or parted, the teeth shown
  head.userData.setFace = (name) => {
    const E = FACES[name] || FACES.calm; head.userData.face = name;
    parts.lids.forEach(({ up, lo }) => { up.rotation.x = Math.asin(Math.max(-1, Math.min(1, 1 - 2 * E.lid))); lo.rotation.x = -Math.asin(Math.max(-1, Math.min(1, 1 - 2 * E.low))); });
    parts.brows.forEach((g, i) => { const sx = i ? 1 : -1; g.position.y = 6.0 + E.brow * 1.1; g.rotation.z = sx * E.tilt; });
    const press = 1 - 0.35 * E.press, open = E.open;
    parts.upper.scale.y = press; parts.upper.position.y = (1 - press) * (MY + 0.42) + open * 0.25;
    parts.lower.scale.y = press; parts.lower.position.y = (1 - press) * (MY - 0.5) - open * 1.0;
    parts.upper.rotation.z = parts.lower.rotation.z = 0;
    parts.line.visible = open < 0.1; parts.line.scale.y = 1; parts.line.position.y = E.corner * 0.12;
    parts.gap.visible = open >= 0.1; parts.gap.scale.set(MW * 0.95, 0.35 + open * 0.9, 1); parts.gap.position.y = MY - 0.1 - open * 0.4;
    parts.teeth.visible = E.teeth > 0 && open >= 0.1;
  };
  head.userData.setFace('calm');
  return head;
}

// ------------------------------------------------------------ the hand
// A hand hanging from its wrist at the origin, down -y, the palm facing
// +z when `s` is 1 (a left hand) - the palm a flat wedge with the heel's
// mass and the ball of the thumb, four fingers of three phalanges each in
// a relaxed curl that grows from the index to the little finger, and the
// thumb opposed at the side. `curl` 0..1 closes it.
function buildHand(kit, s, m, o = {}) {
  const hand = new THREE.Group();
  const curl = o.curl == null ? 0.25 : o.curl;
  // the palm: wrist -> heel -> knuckles, wider at the knuckles, thin
  const palm = facet(loft([
    { y: 0, rx: 3.1, rz: 1.6 }, { y: -2.2, rx: 3.9, rz: 1.9 }, { y: -5.5, rx: 4.3, rz: 1.5 }, { y: -8.4, rx: 4.5, rz: 1.3 }
  ], { n: 8 }), m, hand, 1.2);
  // the ball of the thumb
  const ball = facet(knob(2.2, 1, 1.3, 0.7), m, hand, 0.8); ball.position.set(s * 2.4, -3.6, 0.9);
  const fingers = [];
  const FING = [[-3.1, 8.2, 0.95], [-1.05, 9.2, 1.0], [1.05, 8.6, 0.95], [3.05, 6.8, 0.85]];   // x, length, girth
  FING.forEach(([fx, len, gr], f) => {
    const kn = G(hand, s * fx, -8.6, 0);
    const bend = (0.22 + f * 0.1) + curl * 1.1;
    kn.rotation.x = -bend * 0.9; kn.rotation.z = (f - 1.5) * -0.04 * s;
    const shares = [0.42, 0.32, 0.26];
    let at = kn; const chain = [kn];
    shares.forEach((sh, k) => {
      const L = len * sh, r = gr * (1 - k * 0.12);
      facet(tube([[0, r * 1.05], [-L * 0.5, r], [-L, r * 0.85]], 6), m, at, 0.7);
      const nx = G(at, 0, -L, 0); if (k < 2) nx.rotation.x = -bend * (k ? 0.9 : 1.1);
      at = nx; chain.push(nx);
    });
    // the nail: a flat plane at the tip (o.nails, a build's men: a thin
    // curved shell lying flush on the back of the last joint, in the skin's
    // own plate - the blocks read as a row of white tiles)
    if (o.nails) { const nail = facet(knob(gr * 0.5, 1.0, 1.5, 0.3, 1), m, at, 0); nail.position.set(0, 1.05, -gr * 0.6); nail.rotation.x = 0.08; }
    else { const nail = facet(block(gr * 1.1, 1.4, 0.35, 0), kit.bone, at, 0); nail.position.set(0, 0.8, -gr * 0.8); }
    fingers.push({ chain, bend, f });
  });
  // the thumb: out from the side of the palm, two phalanges, opposed
  const th = G(hand, s * 3.6, -2.6, 0.6);
  th.rotation.set(-0.9 - curl * 0.5, s * 0.5, s * (0.7 - curl * 0.3));
  facet(tube([[0, 1.3], [-3.4, 1.15], [-3.8, 1.0]], 6), m, th, 0.8);
  const th2 = G(th, 0, -3.8, 0); th2.rotation.x = -0.4 - curl * 0.8;
  facet(tube([[0, 1.1], [-2.8, 0.95], [-3.2, 0.7]], 6), m, th2, 0.7);
  hand.userData = { palm, fingers, thumb: th };
  // the grip, as the Death's: c 0 the rest curl, 1 closed on a shaft at GRIP
  hand.userData.grip = (c = 0) => {
    fingers.forEach(({ chain, bend }) => { chain[0].rotation.x = -bend * 0.9 - c * 1.0; chain[1].rotation.x = -bend * 1.1 - c * 0.9; chain[2].rotation.x = -bend * 0.9 - c * 0.5; });
    th.rotation.set(-0.9 - curl * 0.5 - c * 0.5, s * (0.5 + c * 0.3), s * (0.7 - curl * 0.3 - c * 0.4)); th2.rotation.x = -0.4 - curl * 0.8 - c * 0.6;
  };
  return hand;
}

// ------------------------------------------------------------ the head
// A head on its neck joint at the origin: a faceted hull from the jaw up
// through the cheekbones, the brow and the crown, long front to back; the
// nose a wedge, the sockets dark planes under the brow's shelf, the mouth
// open on its teeth; the ears; the hair a cap of planes.
function buildHead(kit, o = {}) {
  const flayed = !!o.flayed, skin = flayed ? kit.muscle : kit.face;
  const head = new THREE.Group();
  const H = [
    { y: -5.5, rx: 3.6, rz: 4.4, z: -2.2 },             // the chin's point
    { y: -3.2, rx: 6.4, rz: 7.6, z: -0.6 },             // the jaw
    { y: 1.0, rx: 8.2, rz: 9.4, z: 0.4, front: 0.6 },   // the cheekbones
    { y: 5.2, rx: 8.6, rz: 9.8, z: 0.8, front: 1.2 },   // the brow's shelf
    { y: 9.4, rx: 7.8, rz: 9.2, z: 1.4 },               // the temples
    { y: 12.8, rx: 4.6, rz: 5.6, z: 1.8 },              // toward the crown
    { y: 14.2, rx: 0.2, rz: 0.2, z: 1.8 }
  ];
  const skull = facet(loft(H, { n: 10, spin: PI / 10 }), skin, head, 2);
  const F = y => frontAt(H, y);   // (the face's plane at a height; the sides fall back from it)
  // the nose: a wedge from the brow down, its tip out
  const nose = facet(loft([{ y: 6.0, rx: 1.0, rz: 0.8, z: F(6) + 0.6 }, { y: 2.6, rx: 1.4, rz: 1.4, z: F(2.6) - 0.6 }, { y: 0.6, rx: 2.0, rz: 1.6, z: F(0.6) - 1.2 }, { y: -0.4, rx: 1.2, rz: 1.0, z: F(-0.4) - 0.2 }], { n: 5, spin: -HALF }), skin, head, 0.9);
  // the sockets: two dark planes under the shelf; the eyes in them
  [-1, 1].forEach(sx => {
    // (o.calm: the eyes shut - a lid's line under the brow, a lash's flick at
    // the outer corner; dark sockets on a freed face read as a ghoul's)
    if (o.calm && !flayed) { seam([[sx * 1.7, 4.0, F(4.0) + 0.2], [sx * 3.3, 3.55, F(3.55) - 0.15], [sx * 4.9, 3.9, F(3.9) + 0.5], [sx * 5.4, 3.5, F(3.5) + 0.9]], head, kit.ink, 0.32); return; }
    // (the socket's shadow a size smaller, the eye showing in it: a big black
    // disc read as a mask's slot)
    const so = disc(o.pained ? 1.5 : 1.8, 8, kit.ink, head, sx * 3.4, 4.0, F(4) + 0.9, -sx * 0.4); so.scale.set(1.05, 0.7, 1);
    if (!flayed) { const eye = facet(knob(0.9, 1, 1, 0.6, 0), kit.bone, head, 0); eye.position.set(sx * 3.3, 3.9, F(3.9) + 0.5); eye.rotation.y = sx * 0.4; disc(0.45, 6, kit.ink, head, sx * 3.3, 3.9, F(3.9) - 0.15, -sx * 0.4); }
  });
  // the brow: a ridge over the sockets, narrow, following the shelf
  // (o.calm: a freed face - the brow eased, the mouth closed)
  // (o.pained: the brows drawn up in the middle, the jaw slack, no teeth -
  // a brow cut down into a V over bared teeth read as a devil's snarl)
  const easy = o.calm || o.pained;
  [-1, 1].forEach(sx => { const brow = facet(block(5.6, 1.2, 2.2, 0.5), skin, head, 0.8); brow.position.set(sx * 3.4, 6.2, F(6.2) + 0.4); brow.rotation.set(0.5, sx * 0.4, easy ? -sx * (o.pained ? 0.16 : 0.08) : sx * 0.12); });
  // the mouth open: the hollow, the teeth's edge above, the lip below, the tongue
  const mouth = disc(2.4, 8, kit.ink, head, 0, -2.4, F(-2.4) - 0.1); mouth.scale.set(o.calm ? 0.9 : 1.3, o.calm ? 0.16 : o.pained ? 0.7 : 1.1, 1);
  const teeth = facet(block(4.2, 0.9, 0.7, 0), kit.bone, head, 0); teeth.position.set(0, -1.3, F(-1.3) - 0.3); teeth.visible = !easy;
  const lip = facet(block(5.4, 1.1, 1.6, 0.6), skin, head, 0.7); lip.position.set(0, -4.0, F(-4) - 0.3);
  const tongue = facet(knob(1.1, 1, 0.55, 1.2, 0), kit.raw, head, 0); tongue.position.set(0, -3.3, F(-3.3) + 0.2); tongue.visible = !easy;
  // the ears: flat shells at the sides
  [-1, 1].forEach(sx => { const ear = facet(loft([{ y: -1.8, rx: 1.2, rz: 1.6 }, { y: 0.4, rx: 1.7, rz: 2.4 }, { y: 2.8, rx: 1.3, rz: 2.0 }], { n: 6 }), skin, head, 0.9); ear.position.set(sx * 8.6, 2.4, 1.6); ear.scale.set(0.45, 1, 1); ear.rotation.z = -sx * 0.15; });
  if (!flayed) {
    // the hair: a cap of planes down to the nape and over the temples, cut into locks at the brow
    // (o.hairMat: another plate for it - the lab's grey; o.recede 0..1: the
    // hairline drawn back up the brow, an old man's)
    const hairM = o.hairMat || kit.hair, recede = o.recede || 0;
    const hair = facet(loft([
      { y: 2.4 + recede * 5.0, rx: 9.2, rz: 10.6, z: 1.6 + recede * 1.2, front: -4.2 - recede * 1.6, locks: 2.6 * (1 - recede * 0.6) }, { y: 7.4 + recede * 2.6, rx: 9.6, rz: 10.8, z: 1.4, front: -2.2 }, { y: 11.0, rx: 8.2, rz: 9.6, z: 1.8 }, { y: 14.0, rx: 4.8, rz: 5.8, z: 1.8 }, { y: 15.4, rx: 0.2, rz: 0.2, z: 1.8 }
    ], { n: 14, spin: PI / 14, metric: UVM.hair }), hairM, head, 1.4);
    hair.userData.hair = true;
    if (o.beard) { const bd = facet(loft([{ y: -4, rx: 5.2, rz: 4.6, z: -4.4 }, { y: -8, rx: 3.6, rz: 3.0, z: -5.4 }, { y: -12.5, rx: 1.0, rz: 0.8, z: -6.0 }], { n: 7, metric: UVM.hair }), hairM, head, 1.1); }
  }
  head.userData = { skull, mouth, nose };
  return head;
}

// ------------------------------------------------------------ a man's anatomy
// Under the cloth a man is built as a man is: a sac holding two lobes that
// hang a little unevenly, and the shaft attached at its root above them,
// hanging down over the top of the lobes and pushed forward and out by
// them as it rests on them. Everything is in the cloth's own material with
// ------------------------------------------------------------ anatomy
// A man's anatomy under the cloth, set before render and never reshaped by
// physics or scene events. Every parameter is a dev setting: adjustable in
// real time for tuning (each change rebuilds the mesh), but locked behind
// authentication in the dev overlay — never exposed to the scene or the UI.
//
// Parameters, per part (all set before render; rebuild() regenerates the mesh
// live). Each part has its own Size, and its Size sets the ceiling of every
// other parameter of that part: the 0-100 sliders are a share of what that
// Size allows, so two men alike in all but Size read differently.
//   the weight pouch (the shaft):
//     sizePouch  its scale (0.5-3; 1 = an average man's)
//     length     0-100: how far it reaches from its root, away or down
//                (0 = half its Size's base length, 100 = twice it; 50
//                and Size 1 = about 10 cm from the root)
//     girth      0-100: its thickness, likewise
//     depth      0-100: how far the lobes present it forward and out off
//                the body rather than hanging straight down - on a build's
//                man the more the lobes are full, big and high, the more of
//                it shows (high Fullness and Size Lobe, low Hang: the most)
//     gorge      0-100: as before (scales the sizes, length and girth
//                toward 1.6x); left as it was
//     sway       physics response amplitude (how freely it answers motion)
//   the lobes:
//     sizeLobe   their scale, and the sac's (0.5-3; 1 = an average man's)
//     fullnessL/R  0-100: each lobe's fill (0 slack, 100 round and high)
//     hangL/R    0-100: each lobe's drop from the body (0 tight to it, 100
//                as low as its Size lets the sac fall)
//
// Gravity comes from the pose: the `pouch` group's orientation is set by
// valley.mjs per figure (the sawyer hung head-down turns it end for end).
// `pouchSway` adds a small lagging pendulum on top — rotation only, never
// a reshape.
// (the baseline - the owner's: an average man, true to size. At Size 1 and
// 50 the shaft rests about 10 cm from its root, about 9.5 cm round; each
// lobe about 4 cm long; the sac hangs about 6 cm below the root)
let ANATOMY = {
  sizePouch: 1.0, sizeLobe: 1.0, length: 50, girth: 50, depth: 33.3,
  fullnessL: 65, fullnessR: 60,
  hangL: 45, hangR: 55,
  gorge: 0, sway: 1.0
};
// (a set from before the parts were split - one Size, length and girth as
// scales, depth as a scale - read as the same man)
function migrateAnatomy(o) {
  if (!o) return o;
  const out = Object.assign({}, o);
  if (out.size != null && out.sizePouch == null) { out.sizePouch = out.size; out.sizeLobe = out.size; }
  if (out.size != null && out.length != null && out.length <= 4) out.length = (out.length - 0.5) / 1.5 * 100;
  if (out.size != null && out.girth != null && out.girth <= 4) out.girth = (out.girth - 0.5) / 1.5 * 100;
  if (out.size != null && out.depth != null && out.depth <= 3) out.depth = (out.depth - 0.3) / 2.7 * 100;
  delete out.size;
  return out;
}
export function setAnatomy(o) { ANATOMY = Object.assign({}, ANATOMY, migrateAnatomy(o)); }
export function getAnatomy() { return Object.assign({}, ANATOMY); }
export { migrateAnatomy };

// (each man his own: the defaults varied per-man by a seeded rng - eight
// draws, in the order the one-size set drew them, so every man downstream
// of them in the build is drawn as before)
function anatomyFor(rnd) {
  const v = (base, k) => base * (1 + (rnd() - 0.5) * k);
  const pct = (base, k) => Math.max(0, Math.min(100, base + (rnd() - 0.5) * k));
  const sz = v(1, 0.16);
  const kL = v(0.5 + 1.5 * ANATOMY.length / 100, 0.24), kG = v(0.5 + 1.5 * ANATOMY.girth / 100, 0.2), kD = v(0.3 + 2.7 * ANATOMY.depth / 100, 0.3);
  return {
    sizePouch: ANATOMY.sizePouch * sz, sizeLobe: ANATOMY.sizeLobe * sz,
    length: (kL - 0.5) / 1.5 * 100, girth: (kG - 0.5) / 1.5 * 100, depth: (kD - 0.3) / 2.7 * 100,
    fullnessL: pct(ANATOMY.fullnessL, 30),
    fullnessR: pct(ANATOMY.fullnessR, 30),
    hangL: pct(ANATOMY.hangL, 40),
    hangR: pct(ANATOMY.hangR, 40),
    gorge: ANATOMY.gorge,
    sway: ANATOMY.sway
  };
}

// a tube swept along points with a radius at each (rings of n), closed at
// both ends, with UVs laid in world units so the hatch matches the body
function sweep(pts, radii, n = 12, metric, shape = null) {
  const c = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)));
  const S = Math.max(8, pts.length * 4), pos = [], uv = [], idx = [], dirs = [];
  const frames = c.computeFrenetFrames(S, false);
  const rAt = t => { const f = t * (radii.length - 1), i = Math.min(radii.length - 2, Math.floor(f)), k = f - i; return radii[i] * (1 - k) + radii[i + 1] * k; };
  const fq = metric ? 1.3 / (metric[2] || 1.3) : 1;
  const mu = metric ? DENS * fq / metric[0] : 1;
  const mv = metric ? DENS * fq / metric[1] : 1;
  // arc length along the curve for v-coordinate
  const vAt = [0]; let runLen = 0;
  for (let j = 1; j <= S; j++) { runLen += c.getPointAt(j / S).distanceTo(c.getPointAt((j - 1) / S)); vAt.push(runLen); }
  for (let j = 0; j <= S; j++) {
    const t = j / S, p = c.getPointAt(t), r = rAt(t) * (shape ? shape(t) : 1), N = frames.normals[j], B = frames.binormals[j], Tg = frames.tangents[j];
    const circ = 2 * PI * r;
    for (let i = 0; i < n; i++) {
      const a = i / n * PI * 2;
      pos.push(p.x + r * (Math.cos(a) * N.x + Math.sin(a) * B.x), p.y + r * (Math.cos(a) * N.y + Math.sin(a) * B.y), p.z + r * (Math.cos(a) * N.z + Math.sin(a) * B.z));
      uv.push(metric ? (i / n) * circ * mu : i / n, metric ? vAt[j] * mv : j / S);
      dirs.push(Tg.x, Tg.y, Tg.z);   // (the curve's own direction: see loft's aAlong)
    }
  }
  for (let j = 0; j < S; j++) for (let i = 0; i < n; i++) { const a = j * n + i, b = j * n + (i + 1) % n, c2 = a + n, d = b + n; idx.push(a, b, c2, b, d, c2); }
  [0, S].forEach((j, k) => { const p = c.getPointAt(k), ci = pos.length / 3, Tg = frames.tangents[j]; pos.push(p.x, p.y, p.z); uv.push(0.5, k ? vAt[S] * mv : 0); dirs.push(Tg.x, Tg.y, Tg.z); for (let i = 0; i < n; i++) { const a = j * n + i, b = j * n + (i + 1) % n; if (k) idx.push(ci, a, b); else idx.push(ci, b, a); } });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aAlong', new THREE.Float32BufferAttribute(dirs, 3));
  g.setIndex(idx);
  // (each point's share of the way along, 0 at the start, 1 at the end - the
  // rings are laid at even arc lengths - for a bend that grows along it)
  const along = new Float32Array(pos.length / 3);
  for (let j = 0; j <= S; j++) along.fill(j / S, j * n, (j + 1) * n);
  along[along.length - 1] = 1;
  g.userData.along = along;
  return g;
}

// gorge, as it was: at 0% the params are natural, at 100% each size, the
// length and the girth reach 1.6x
const gorgeAmp = a => 1 + Math.max(0, Math.min(100, a.gorge || 0)) / 100 * 0.6;

function buildAnatomy(pouch, m, a) {
  a = migrateAnatomy(a);
  // clear any previous build (for live rebuild)
  while (pouch.children.length) {
    const c = pouch.children[0];
    if (c.geometry) c.geometry.dispose();
    pouch.remove(c);
  }
  // (each part at its own scale: sL the lobes, the sac and the root they
  // hang from; sP the shaft's length and thickness - so one can change
  // without the other. Laid out in the pouch's own units, the group unscaled.)
  const amp = gorgeAmp(a), sL = a.sizeLobe * amp, sP = a.sizePouch * amp;
  const kL = (0.5 + 1.5 * a.length / 100) * amp, kG = (0.5 + 1.5 * a.girth / 100) * amp;
  const g = new THREE.Group(); pouch.add(g);

  // the two lobes, each with its own fullness and hang
  // fullness 0–100: 0 slack/empty, 100 round/full
  // hang 0–100: 0 tight to the body, 100 as low as the sac loft allows
  const fL = a.fullnessL / 100, fR = a.fullnessR / 100;
  const hL = a.hangL / 100, hR = a.hangR / 100;
  // lobe radius grows with fullness; drop grows with hang and inversely
  // with fullness (a full lobe sits higher, an empty one sags)
  const lobeR = f => (1.6 + f * 0.45) * sL;
  const lobeDrop = (f, h) => (4.2 + (1 - f) * 1.8 + h * 2.6) * sL;
  const lobeSquash = f => 1.12 + (1 - f) * 0.2;
  const lrL = lobeR(fL), lrR = lobeR(fR);
  const dropL = lobeDrop(fL, hL), dropR = lobeDrop(fR, hR);
  const lobes = [
    { sx: -1, lr: lrL, drop: dropL, full: fL, squash: lobeSquash(fL) },
    { sx:  1, lr: lrR, drop: dropR, full: fR, squash: lobeSquash(fR) }
  ].map(({ sx, lr, drop, full, squash }) => {
    const lobe = facet(knob(lr, 1.0, squash, 1.0, 2), m, g, 0);
    lobe.position.set(sx * (lr * 0.62), -drop, -0.6 * sL);
    lobe.rotation.z = sx * 0.12;
    lobe.userData.pouch = true; lobe.userData.side = sx < 0 ? 'L' : 'R';
    return lobe;
  });

  // the sac loft wrapping both lobes: its profile follows whichever lobe
  // hangs lower (fruit in a mesh bag — the bag stretches to hold them)
  const avgLR = (lrL + lrR) / 2;
  const sacLow = -Math.max(dropL, dropR) - 0.45 * sL;
  // (a build's man - pouch.userData.live: the sac is skin stretched over
  // the lobes where they are now, joined up into the body at its root, and
  // reshaped each frame the lobes move: loose enough that each moves on its
  // own, never parted from the rest)
  let updateSac = null, sac = null;
  if (pouch.userData.live) {
    const spread0 = Math.abs(lobes[1].position.x - lobes[0].position.x) / 2 || 1;
    const secs = () => {
      const L = lobes[0].position, R = lobes[1].position, cx = (L.x + R.x) / 2, zc = (L.z + R.z) / 2 + 0.4 * sL, spread = Math.abs(R.x - L.x) / 2;
      const low = Math.min(L.y, R.y) - 0.45 * sL, wide = avgLR * 1.55 * Math.max(0.85, spread / spread0);
      return [
        { y: 3.0 * sL, rx: 2.4 * sL, rz: 2.0 * sL },
        { y: 1.0 * sL, rx: 2.0 * sL, rz: 1.6 * sL },
        { y: -2.0 * sL, rx: avgLR * 1.15, rz: avgLR * 0.9, x: cx * 0.3, z: zc * 0.3 },
        { y: low + avgLR * 0.3, rx: wide, rz: avgLR * 0.95, x: cx, z: zc },
        { y: low - avgLR * 0.55, rx: avgLR * 1.25, rz: avgLR * 0.8, x: cx, z: zc },
        { y: low - avgLR * 0.95, rx: 0.3 * sL, rz: 0.3 * sL, x: cx, z: zc }
      ];
    };
    const geo = loft(secs(), { n: 14, metric: UVM.linen }); geo.computeVertexNormals();
    sac = new THREE.Mesh(geo, m); sac.position.z = -0.4 * sL; sac.frustumCulled = false; g.add(sac);
    updateSac = () => { const ng = loft(secs(), { n: 14, metric: UVM.linen }); geo.attributes.position.array.set(ng.attributes.position.array); geo.attributes.position.needsUpdate = true; geo.computeVertexNormals(); ng.dispose(); };
  } else {
    sac = facet(loft([
      { y: 1.0 * sL, rx: 2.0 * sL, rz: 1.6 * sL },
      { y: -2.0 * sL, rx: avgLR * 1.15, rz: avgLR * 0.9 },
      { y: sacLow + avgLR * 0.3, rx: avgLR * 1.55, rz: avgLR * 0.95 },
      { y: sacLow - avgLR * 0.55, rx: avgLR * 1.25, rz: avgLR * 0.8 },
      { y: sacLow - avgLR * 0.95, rx: 0.3 * sL, rz: 0.3 * sL }
    ], { n: 14, metric: UVM.linen }), m, g, 0);
    sac.position.z = -0.4 * sL;
  }
  sac.userData.sac = true;

  // the shaft: attached at the root above the lobes, it falls forward
  // over their top and lies down the front of them, pushed out by them
  const L = 6.4 * kL * sP;
  const r = 1.2 * kG * sP;
  const avgDrop = (dropL + dropR) / 2;
  // (depth: on a build's man, how far forward the lobes present it - the
  // fuller, bigger and higher they sit, the more. Depth 0 is no push at all:
  // it used to be a small pull back, sinking the shaft into the lobes at the
  // slider's foot; now a cubic through the old curve's default (33) and top
  // (100), so those read as before and it only ever rises. The valley's men
  // keep the one fixed push they were made with)
  const dd = a.depth / 100;
  const dk = pouch.userData.live
    ? (0.35 + 0.65 * (fL + fR) / 2) * (1 - 0.6 * (hL + hR) / 2) * dd * (1.311 + 1.417 * dd)
    : (0.3 + 2.7 * a.depth / 100 - 1) * 1.2;
  const front = -0.6 * sL - avgLR - r * 0.75 - dk * sL;
  const pts = [
    [0, 0.6 * sL, -1.4 * sL],
    [0, -1.6 * sL, front * 0.62],
    [0, -avgDrop + avgLR * 0.55, front],
    [0, -avgDrop - avgLR * 0.2, front - 0.15 * sL],
    [0, -2.0 * sL - L, front + 0.5 * sL]
  ];
  let sh, bendShaft = null;
  if (pouch.userData.live) {
    // (a build's man: its root sealed into the pelvis. It runs on up and back
    // in under the skin from where it shows, drawn to a point there by an
    // exponential taper over the first ROOT of its length - no flat end, no
    // open funnel at the base - and it bends out of that root rather than
    // turning on a pin: see bendShaft)
    const ROOT = 0.15, TAU = 0.035, BEND = 0.38;
    const bury = [0, pts[0][1] + 1.2 * sL, pts[0][2] + 2.6 * sL];
    const taper = t => t >= ROOT ? 1 : (1 - Math.exp(-t / TAU)) / (1 - Math.exp(-ROOT / TAU));
    const geo = sweep([bury, ...pts], [r * 0.9, r * 1.12, r, r * 0.98, r * 1.02, r * 0.55], 14, UVM.linen, taper);
    sh = liveFacet(geo, m, g, 0);
    // turn it by q about its root as the physics asks (null: at rest) - the
    // root's run held where it is, the turn growing to all of q by BEND along
    // it: past that it is the rigid turn it was, so the tip lands where the
    // physics put it; before it the base bends, and never opens off the body
    const live = sh.userData.live, P = live.smooth.attributes.position.array, R0 = live.rest, along = live.smooth.userData.along;
    const o = new THREE.Vector3(...pts[0]), v = new THREE.Vector3(), qw = new THREE.Quaternion();
    bendShaft = q => {
      for (let i = 0; i < along.length; i++) {
        const t = Math.max(0, Math.min(1, (along[i] - ROOT) / (BEND - ROOT))), w = q ? t * t * (3 - 2 * t) : 0;
        v.set(R0[3 * i], R0[3 * i + 1], R0[3 * i + 2]);
        if (w > 0) v.sub(o).applyQuaternion(qw.identity().slerp(q, w)).add(o);
        P[3 * i] = v.x; P[3 * i + 1] = v.y; P[3 * i + 2] = v.z;
      }
      live.refresh();
    };
  } else sh = facet(sweep(pts, [r * 1.08, r, r * 0.98, r * 1.02, r * 0.55], 14, UVM.linen), m, g, 0);
  sh.userData.pouch = true; sh.userData.shaft = true;
  // (for a physics pass - the lab's: where the mass sits, where the shaft
  // roots and ends, their radii; all in this group's own units; kl, the
  // lobes' scale, for their jiggle)
  lobes.forEach(l => { l.userData.p0 = l.position.clone(); });
  g.userData = { lobes, sac, shaft: sh, sway: a.sway, params: a, mass: [0, -avgDrop, -0.6 * sL], shaftRoot: pts[0], shaftTip: pts[pts.length - 1], lobeR: avgLR, shaftR: r, kl: sL, updateSac, bendShaft };
  return g;
}

// rebuild in place: tear down the old mesh and build with new params,
// keeping the pouch group's position and orientation (for the dev overlay)
export function rebuildAnatomy(fig, newParams) {
  const p = fig.userData.pouch; if (!p) return;
  const old = p.children[0] && p.children[0].userData.params;
  const a = Object.assign({}, old || anatomyFor(() => 0.5), migrateAnatomy(newParams));
  // find the material from any existing mesh child
  let m = null;
  p.traverse(c => { if (!m && c.isMesh && c.material) m = c.material; });
  if (!m) return;
  buildAnatomy(p, m, a);
  // (a fitted brief over it: refitted to the new size)
  if (fig.userData.cloth) fig.userData.cloth.refit();
}

// its answer to the body's motion: a small lagging pendulum swing
// (ph = the stride's phase, amp = how hard the body moves)
// This ONLY rotates the group — it never changes scale or vertex positions
export function pouchSway(fig, ph, amp = 1) {
  const p = fig.userData.pouch; if (!p) return;
  const g = p.children[0], k = (g && g.userData.sway) || 1;
  p.rotation.z = Math.sin(ph - 0.6) * 0.07 * amp * k;
  p.rotation.x = (p.userData.rx0 == null ? (p.userData.rx0 = p.rotation.x) : p.userData.rx0) + Math.abs(Math.sin(ph - 0.6)) * 0.05 * amp * k;
}

// ------------------------------------------------------------ the joints' sleeves
// (a build's men only.) A short hull over each joint - shoulder, elbow, hip,
// knee - drawn from a ring on the limb above to a ring on the limb below,
// along a curve through the joint, its rings turned part way from the one
// limb's frame to the other's: so a bent elbow is one bent form, not two
// tubes meeting in a ball, and a lifted arm or thigh has an armpit and a
// groin. Rebuilt in place each frame a pose changes (updateSleeves).
const SLV = { rings: 8, n: 14 };
function addSleeve(root, list, m, metric, spec) {
  const R = SLV.rings, n = SLV.n, pos = new Float32Array(R * n * 3), uv = [], idx = [];
  const len = spec.len || 12, circ = PI * ((spec.ra[0] + spec.rb[0]) / 2 + (spec.ra[1] + spec.rb[1]) / 2);
  const fq = 1.3 / (metric[2] || 1.3), mu = DENS * fq / metric[0], mv = DENS * fq / metric[1];
  for (let j = 0; j < R; j++) for (let i = 0; i < n; i++) uv.push(i / n * circ * mu, j / (R - 1) * len * mv);
  for (let j = 0; j < R - 1; j++) for (let i = 0; i < n; i++) { const i2 = (i + 1) % n, a = j * n + i, b = j * n + i2, c = (j + 1) * n + i, d = (j + 1) * n + i2; idx.push(a, b, c, b, d, c); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, m); mesh.frustumCulled = false; root.add(mesh);
  const o = outlineOf(mesh, spec.outline || 1.4); o.frustumCulled = false;
  list.push(Object.assign({ mesh }, spec));
}
const _A = new THREE.Vector3(), _B = new THREE.Vector3(), _J = new THREE.Vector3(), _C = new THREE.Vector3(), _inv = new THREE.Matrix4(), _mm = new THREE.Matrix4();
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _qr = new THREE.Quaternion(), _rv = new THREE.Vector3();
const frameIn = (obj, q) => { _mm.multiplyMatrices(_inv, obj.matrixWorld); _mm.decompose(_C, q, _rv); return q; };
export function updateSleeves(fig) {
  const S = fig.userData.sleeves; if (!S || !S.length) return;
  fig.updateMatrixWorld(true);
  _inv.copy(fig.matrixWorld).invert();
  const R = SLV.rings, n = SLV.n;
  for (const s of S) {
    _A.set(...s.a); s.pa.localToWorld(_A).applyMatrix4(_inv);
    _B.set(...s.b); s.pb.localToWorld(_B).applyMatrix4(_inv);
    _J.set(0, 0, 0); s.pb.localToWorld(_J).applyMatrix4(_inv);
    frameIn(s.pa, _qa); frameIn(s.pb, _qb);
    const P = s.mesh.geometry.attributes.position;
    for (let j = 0; j < R; j++) {
      const t = j / (R - 1), u = 1 - t;
      // the curve A -> J -> B, and the ring's frame turned from the one limb's to the other's
      const cx = u * u * _A.x + 2 * u * t * _J.x + t * t * _B.x, cy = u * u * _A.y + 2 * u * t * _J.y + t * t * _B.y, cz = u * u * _A.z + 2 * u * t * _J.z + t * t * _B.z;
      _qr.slerpQuaternions(_qa, _qb, t);
      const bulge = (s.bulge || 0) * Math.sin(PI * t);
      const rx = s.ra[0] + (s.rb[0] - s.ra[0]) * t + bulge, rz = s.ra[1] + (s.rb[1] - s.ra[1]) * t + bulge;
      for (let i = 0; i < n; i++) {
        const a = i / n * PI * 2;
        _rv.set(Math.cos(a) * rx, 0, Math.sin(a) * rz).applyQuaternion(_qr);
        P.setXYZ(j * n + i, cx + _rv.x, cy + _rv.y, cz + _rv.z);
      }
    }
    P.needsUpdate = true;
    s.mesh.geometry.computeVertexNormals();
  }
}

// ------------------------------------------------------------ a build's clothes
// (a build's men only.) The skin is skin everywhere; the clothes are cloth
// laid over it - their own hulls, standing off the body by the cloth's
// thickness and more where it hangs, with folds and hems - never the body
// recoloured. Under everything a fitted brief, with a cup fitted round the
// anatomy as it rests; over it, by outfit:
//   o.brief          the brief alone (the lab's Minimal: the skin to look at)
//   (none)           a loincloth: a belt and two flaps hung from it, front
//                    and back, over the brief
//   o.shirt          a loose shirt to mid-thigh, hanging from the chest,
//                    full sleeves to the elbow
//   o.hose           hose: each leg its own cloth, wrinkled at the knee and
//                    the ankle, the knee its own sleeve
//   o.under          in place of the brief: 'compression', 'boxerBriefs',
//                    'longJohns' or 'boxers' (see FABRIC)
// (a shirt with no hose has nothing under it.)
// Returns { cup, cloth, support } - cloth fits the brief and drapes the loose
// pieces each pose (cloth.mjs), and support is how far (degrees) the cloth
// lets the anatomy swing.
// (a loft's sections with k-1 more laid between each pair, every number
// eased between them - fine enough rings for the cloth to bend round a form)
function densify(secs, k) {
  const out = [];
  for (let j = 0; j < secs.length - 1; j++) for (let i = 0; i < k; i++) {
    const a = secs[j], b = secs[j + 1], t = i / k, s = {};
    new Set([...Object.keys(a), ...Object.keys(b)]).forEach(key => { const va = a[key] || 0, vb = b[key] || 0; if (typeof va === 'number' && typeof vb === 'number') s[key] = va + (vb - va) * t; });
    // (lobes eased too: each side's faded by its distance - a face's
    // sockets and cheekbones are lobes, and the rings between need them)
    if (a.lobes || b.lobes) s.lobes = [...(a.lobes || []).map(L => Object.assign({}, L, { d: L.d * (1 - t) })), ...(b.lobes || []).map(L => Object.assign({}, L, { d: L.d * t }))];
    out.push(s);
  }
  out.push(Object.assign({}, secs[secs.length - 1]));
  return out;
}
function wrapOver(geo, solids, pad) {
  const p = geo.attributes.position, v = new THREE.Vector3(), w = new THREE.Vector3(), qi = new THREE.Quaternion();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i), p.getZ(i));
    for (const g of solids || []) {
      // (in the solid's own frame: an ellipsoid turned as it is)
      w.copy(v).sub(g.c); if (g.q) w.applyQuaternion(qi.copy(g.q).invert());
      const dx = w.x / (g.r[0] + pad), dy = w.y / (g.r[1] + pad), dz = w.z / (g.r[2] + pad), d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < 1 && d > 1e-4) { w.divideScalar(d); if (g.q) w.applyQuaternion(g.q); v.copy(g.c).add(w); }
    }
    p.setXYZ(i, v.x, v.y, v.z);
  }
}
// (the areola: the face's plate cut a shade darker; the studio's own colour by key)
function areolaMat(kit) {
  if (kit._areola) return kit._areola;
  const m = kit.face.clone(); m.userData = Object.assign({}, kit.face.userData, { studioKey: 'areola' });
  if (m.uniforms && m.uniforms.uTone) m.uniforms.uTone.value += 0.22;
  return (kit._areola = m);
}
function dsMat(m, key) { const d = m.clone(); d.side = THREE.DoubleSide; d.userData = Object.assign({}, m.userData, { studioKey: key }); return d; }
// each fabric, tightest to loosest: support, the most (degrees) it lets the
// anatomy swing off its rest; lift, how far it rests carried up and forward
// (radians); slip, a loose cloth it can slip out of in a hard move - so it
// is drawn painted in the cloth's brown, never as skin; ease, the room in
// the seat (over the brief's). The cloth over the fork (cloth.mjs):
// cling 0-1 (how hard it is drawn down onto what is under it - a knit
// vacuum-seals), stiff 0-1 (how far it bridges the hollows between what is
// under it), thick (cm); fit, a snug one whose brief is itself fitted over
// the anatomy each frame (its own front carried out over it - no cup, no
// second sheet over it); drape (cm), a loose one's resting drape off the
// anatomy - with its cling, the drape gap ((1 - cling) x drape) the anatomy
// swings in without touching it. The loose ones (boxers, loincloth, a shirt)
// keep the plain cup, tented out only past that gap. Every brief keeps out
// of the thighs as they swing. The cloth never stiffens, damps or carries
// the anatomy (the owner's rollback): it only lies over it.
export const FABRIC = {
  compression: { name: 'Compression', support: 10, lift: 0.62, ease: -0.4, cling: 0.95, stiff: 0.15, thick: 0.3, fit: true },
  brief:       { name: 'Brief',       support: 16, lift: 0.62, ease: 0,    cling: 0.85, stiff: 0.30, thick: 0.6, fit: true },
  hose:        { name: 'Hose',        support: 22, lift: 0.62, ease: 0.2,  cling: 0.98, stiff: 0.05, thick: 0.2, fit: true },
  boxerBriefs: { name: 'Boxer briefs', support: 28, lift: 0.48, ease: 0.3, cling: 0.80, stiff: 0.35, thick: 0.7, fit: true },
  longJohns:   { name: 'Long johns',  support: 36, lift: 0.40, ease: 0.5,  cling: 0.85, stiff: 0.40, thick: 0.9, fit: true },
  boxers:      { name: 'Boxers',      support: 50, lift: 0.22, slip: true, ease: 2.0, cling: 0.45, stiff: 0.60, thick: 1.1, drape: 1.6 },
  loin:        { name: 'Loincloth',   support: 60, lift: 0.4, slip: true, ease: 0, cling: 0.15, stiff: 0.90, thick: 1.5, drape: 2.2 },
  shirt:       { name: 'Shirt (nothing under)', support: 75, lift: 0, slip: true, cling: 0.35, stiff: 0.75, thick: 1.2 },
  none:        { name: 'None',        support: 180, lift: 0 }
};
// the thigh's skin down from the hip joint, [y, rx, rz, front, back] (its
// hull, scaled by the build; the brief keeps out of it as it swings)
const THIGH_SKIN = [[7.5, 0.3], [6.4, 5.0], [3.8, 7.8], [0, 8.8, 9.4, 0, 1.2], [-10, 8.6, 9.0, 1.0], [-22, 7.4, 7.8, 0.8], [-34, 5.9, 6.4], [-40, 5.3, 5.5]];
// (its section at y, the build's k: [rx, rz, front, back] - one array, reused)
function thighAt(k) {
  const rows = THIGH_SKIN.map(r => [r[0], r[1] * k, (r[2] == null ? r[1] : r[2]) * k, (r[3] || 0) * k, (r[4] || 0) * k]), out = [0, 0, 0, 0];
  return y => {
    let j = 1; while (j < rows.length - 1 && y < rows[j][0]) j++;
    const a = rows[j - 1], b = rows[j], t = Math.max(0, Math.min(1, (a[0] - y) / (a[0] - b[0])));
    for (let i = 0; i < 4; i++) out[i] = a[i + 1] + (b[i + 1] - a[i + 1]) * t;
    return out;
  };
}
// which fabric holds him: the snuggest thing he has on over the fork
function fabricOf(o) { return o.nude ? 'none' : o.under || (o.hose ? 'hose' : o.brief ? 'brief' : o.shirt ? 'shirt' : 'loin'); }
// a short's leg: thigh cloth from the hip down to y `to`, standing `pad` off
// (out to pad + flare at the hem), folded toward it
const THIGH = [[4.0, 8.0, 8.4], [0, 9.6, 10.2, 0, 1.3], [-10, 9.4, 9.8, 1.1], [-22, 8.2, 8.6, 0.9], [-30, 7.2, 7.6], [-36, 6.6, 7.0]];
function shortLeg(L, kT, mat, s, { to, pad, flare = 0, folds = 0.02 }, skin) {
  const rows = THIGH.filter(r => r[0] > to);
  const j = THIGH.findIndex(r => r[0] <= to), a = THIGH[j - 1], b = THIGH[j], t = (a[0] - to) / (a[0] - b[0]);
  rows.push(a.map((v, i) => i === 0 ? to : v + ((b[i] || 0) - v) * t));
  const secs = rows.map(([y, rx, rz, f, bk], i) => {
    const e = pad + flare * Math.max(0, (4 - y) / (4 - to)) ** 1.5;
    return { y, rx: rx * kT + e, rz: rz * kT + e, front: (f || 0) * kT, back: (bk || 0) * kT, folds: i >= 2 ? [5, folds, s] : null };
  });
  const geo = loft(secs, { n: 14, metric: UVM.linen, cap: false });
  return skin ? facetSkinned(geo, mat, L.hip, 1.5, skin.skeleton, skin.weightAt) : facet(geo, mat, L.hip, 1.5);
}
function dress(kit, o, T, hips, arms, legs, pouch, x, sleeves) {
  const fab = fabricOf(o), F = FABRIC[fab], shirtOnly = fab === 'shirt';
  const loin = fab === 'loin';
  const lin = kit.linen, cloth = loin ? (kit.breech || kit.linen) : kit.linen, S = y => secAt(T, y), E = F.ease || 0;
  // the brief: round the hips and over the buttocks, closed between the
  // legs; its leg openings cut on the slant, high at the front of the hip and
  // low behind under the buttocks (rings tilted), with room over the skin
  // (fine enough for its own points to take the thigh's press and, fitted,
  // the anatomy's shape - a fitted one finer still: it is the shape there)
  const s5 = S(5.0), s0 = S(0.0), s6 = S(-6.0), s9 = S(-9.0), gb = x.gb, gR = x.gR || 8;
  const briefSecs = [
    { y: 4.0, rx: s5.rx + 1.0 + E * 0.4, rz: s5.rz + 1.0 + E * 0.4, front: (s5.front || 0) + 0.8, back: (s5.back || 0) + 0.5 },
    { y: 0.0, rx: s0.rx + 1.6 + E * 0.7, rz: s0.rz + 1.6 + E * 0.7, front: (s0.front || 0) + 0.9, back: (s0.back || 0) + gb * 0.8 },
    { y: -6.0, rx: s6.rx + 2.2 + E, rz: s6.rz + 1.8 + E, back: (s6.back || 0) + gb * 0.7 + 0.6 },
    { y: -10.0, rx: s6.rx + 1.0 + E, rz: s9.rz + 4.0 + E, back: gb * 0.5 + 0.6, z: 1.2, saddle: 4.0, dropBack: 1.8 },
    { y: -13.0, rx: s6.rx * 0.8 + E, rz: 6.8 + E, back: gb * 0.2, z: 2.4, saddle: 5.0, dropBack: 2.8 },
    { y: -14.6, rx: 0.3, rz: 0.3, z: 3.0, dropBack: 2.4 }
  ];
  const briefGeo = loft(densify(briefSecs, F.fit ? 5 : 4), { n: F.fit ? 64 : 48, front: F.fit ? 0.5 : 0.3, metric: UVM.linen });
  // (shrink-wrapped over the buttocks: a point of the cloth that falls
  // inside one is pushed out along its radius to clear it by the cloth's
  // thickness - a ring can't follow two round masses off the middle)
  // (a shirt alone has nothing under it: no seat, no cup)
  // The brief is skinned (facetSkinned) across the hips and both thighs - a
  // point lying over a thigh (in its skin, or within a few cm of it, below
  // the joint) goes with that thigh, eased in, the rest with the hips - so
  // a stride carries it with the leg instead of into it. The weights come
  // from the thigh's own hull at rest (THIGH_SKIN).
  let briefMesh = null;
  const skinned = [], rig = x.rig;
  const thighK = thighAt(x.kT), smooth01 = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
  const legShare = (P, px, py, pz) => {
    const lx = px - P.x, ly = py - P.y, lz = pz - P.z; if (ly > 4) return 0;
    const d = Math.hypot(lx, lz); if (d < 1e-4) return 1;
    const sec = thighK(Math.max(THIGH_SKIN[THIGH_SKIN.length - 1][0], Math.min(THIGH_SKIN[0][0], ly))), c = lx / d, sn = lz / d;
    const ez = sec[1] + (sn < 0 ? sec[2] : sec[3]) * sn * sn, R = 1 / Math.sqrt((c / sec[0]) * (c / sec[0]) + (sn / ez) * (sn / ez));
    return smooth01((R - d + 5) / 6.5) * smooth01((4 - ly) / 6);
  };
  const briefWeights = (px, py, pz) => {
    const wl = legShare(legs.l.hip.position, px, py, pz), wr = legShare(legs.r.hip.position, px, py, pz);
    return [Math.max(0.0001, 1 - wl - wr), wl, wr];
  };
  if (!shirtOnly) { wrapOver(briefGeo, x.glutes, Math.max(0.5, 0.9 + E)); briefMesh = facetSkinned(briefGeo, cloth, hips, 1.2, rig.skeleton, briefWeights); skinned.push(briefMesh); }
  // the cup: fitted round the anatomy where it rests, a finger's room in it
  let cup = null;
  // (a brief holds the anatomy up and forward against him: it rests turned
  // that far, and the cup is fitted to it there; a loincloth's wrap less so)
  const lift = F.lift, R = 0.9;
  // the anatomy's box in the hips' frame as it rests lifted: what a snug
  // brief's cloth stands off, or a loose one's cup is cut round
  let ucm = null, depth0 = 1, half0 = 3;
  const shortLegs = [], pieces = [];
  const anatomyBox = () => {
    const q0 = pouch.quaternion.clone();
    pouch.rotation.set(lift, 0, 0); pouch.updateMatrixWorld(true); hips.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(hips.matrixWorld).invert(), box = new THREE.Box3(), b = new THREE.Box3(), mm = new THREE.Matrix4();
    pouch.traverse(c => { if (!c.isMesh || c.userData.outline) return; c.geometry.computeBoundingBox(); b.copy(c.geometry.boundingBox).applyMatrix4(mm.multiplyMatrices(inv, c.matrixWorld)); box.union(b); });
    pouch.quaternion.copy(q0); pouch.updateMatrixWorld(true);
    return box;
  };
  if (pouch && F.fit && !shirtOnly) {
    // a snug fabric: the brief's own front is the GPU cloth
    // (universal-cloth-material.mjs), its hydrostatic tissue driven each
    // frame from the anatomy where the physics has put it: the shaft's root
    // and tip in the brief's cloth uv (an unwrap round the hips: u the arc
    // from the front's middle, v the height, cm), its radius, how far it
    // stands off the brief's rest front (depth0, measured here and on a
    // refit), the flesh's swing vector as the trail; the State slider the
    // lab's. Its outline is carried out with it.
    const measure = () => {
      const box = anatomyBox(), ymid = (box.min.y + box.max.y) / 2;
      x.cupFront = box.min.z - F.thick; x.cupBot = box.min.y - 1;
      depth0 = Math.max(0.5, frontAt(briefSecs, ymid) - box.min.z + F.thick);
      // (its width: the lobes', not the shaft's alone - the cloth is drawn over the whole of it)
      half0 = Math.max(1.5, (box.max.x - box.min.x) / 2);
    };
    measure();
    const uvOf = (px, py, pz) => [Math.atan2(px, -(pz - 1.0)) * 14, py];
    [briefMesh.geometry, briefMesh.children.find(c => c.userData.outline).geometry].forEach(geo => {
      const pa = geo.attributes.position, uv = new Float32Array(pa.count * 2);
      for (let i = 0; i < pa.count; i++) { const [u, v] = uvOf(pa.getX(i), pa.getY(i), pa.getZ(i)); uv[2 * i] = u; uv[2 * i + 1] = v; }
      geo.setAttribute('clothUv', new THREE.BufferAttribute(uv, 2));
    });
    ucm = new UniversalClothMaterial(cloth, { uv: 'clothUv', tissueType: TISSUE_TYPE.HYDROSTATIC, state: 0.4, jiggle: 0.03, clinginess: F.cling, drapeDistance: F.drape || 0, uvEps: 0.15 });
    ucm.apply(briefMesh);
    briefMesh.children.forEach(c => { if (c.userData.outline) c.material = ucm.wrap(c.material); });
    briefMesh.userData.ucm = ucm; briefMesh.userData.studioKey = 'linen';
    const _r = new THREE.Vector3(), _t = new THREE.Vector3(), g = pouch.children[0];
    ucm.drive = (dt, t) => {
      const u = g.userData, sh = u.shaft; if (!sh) return;
      hips.updateWorldMatrix(true, true);
      // the root, and the tip where the shaft's own points end now (bent by the physics)
      g.localToWorld(_r.fromArray(u.shaftRoot)); hips.worldToLocal(_r);
      const pa = sh.geometry.attributes.position; _t.fromBufferAttribute(pa, pa.count - 1); sh.localToWorld(_t); hips.worldToLocal(_t);
      const base = uvOf(_r.x, _r.y, _r.z), tip = uvOf(_t.x, _t.y, _t.z), dx = tip[0] - base[0], dy = tip[1] - base[1], L = Math.hypot(dx, dy) || 1;
      const sv = hips.parent && hips.parent.userData.swing, k = 0.025;
      let sx = sv ? sv.v.x * k : 0, sy = sv ? sv.v.y * k : 0; const sl = Math.hypot(sx, sy); if (sl > 1.2) { sx *= 1.2 / sl; sy *= 1.2 / sl; }
      ucm.set({ baseUV: base, direction: [dx / L, dy / L], length: L, width: Math.max(u.shaftR * g.scale.x * pouch.scale.x * 1.25, half0 * 0.9), maxDepth: depth0 / 0.58, swingVector: [sx, sy] });
      ucm.tick(t);
    };
    ucm.measure = measure;
  } else if (pouch) {
    const box = anatomyBox();
    const P = pouch.position, top = P.y + 1.5, bot = box.min.y - 1.3, H = top - bot;
    const hx = (box.max.x - box.min.x) / 2 + R, hz = (box.max.z - box.min.z) / 2 + R, cz = (box.min.z + box.max.z) / 2 - P.z;
    x.cupFront = P.z + cz - hz; x.cupBot = bot;
    if (!shirtOnly) {
    cup = G(hips, P.x, P.y, P.z);
    const yA = top - H * 0.32 - P.y;
    const cm = liveFacet(loft(densify([
      // (grown out of the brief: its top inside the brief's front, swelling
      // out below over the anatomy - no edge, no gap between the two)
      { y: 6.0, rx: Math.min(5.5, hx * 0.6), rz: 2.6, z: 0.6 },
      { y: 1.5, rx: hx * 0.82, rz: hz * 0.7, z: cz * 0.55 },
      { y: yA, rx: hx, rz: hz, z: cz },
      { y: top - H * 0.78 - P.y, rx: hx * 0.92, rz: hz * 0.9, z: cz },
      { y: bot - P.y, rx: 0.3, rz: 0.3, z: cz }
    ], 3), { n: 24, metric: UVM.linen }), cloth, cup, 1.0, 1);
    // (draped: held where it grows out of the brief, free from the
    // anatomy's top down; R of room round it, its gap at most that)
    const cr = cm.userData.live.rest, cw = new Float32Array(cr.length / 3);
    for (let i = 0; i < cw.length; i++) { const t = Math.max(0, Math.min(1, (6.0 - cr[3 * i + 1]) / (6.0 - yA))); cw[i] = t * t * (3 - 2 * t); }
    pieces.push({ mesh: cm, w: cw, room: R, slide: 1, lift: 0.5 });
    }
  }
  // the shorts' legs: compression to above the knee, skin-tight; boxer briefs
  // to mid-thigh, snug; boxers short, loose and flared, folded
  const SHORTS = { compression: { to: -28, pad: -0.4, folds: 0.008 }, boxerBriefs: { to: -18, pad: 0.3, folds: 0.015 }, boxers: { to: -24, pad: 1.4, flare: 3.0, folds: 0.06 } }[fab];
  // (the garments on the legs and the shirt are skinned: a short's or a
  // hose's thigh goes with the hips above the joint and the thigh below,
  // eased between; a hose's shin partly with the thigh at its top; the
  // shirt's shoulders with a lifted arm)
  const bi = rig.index, nb = rig.skeleton.bones.length, sm01 = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
  const thighCloth = k => ({ skeleton: rig.skeleton, weightAt: (px, py) => { const w = new Array(nb).fill(0), h = sm01((py + 6) / 10); w[bi.hips] = h; w[bi['leg' + k.toUpperCase()]] = 1 - h; return w; } });
  const shinCloth = k => ({ skeleton: rig.skeleton, weightAt: (px, py) => { const w = new Array(nb).fill(0), h = sm01((py + 9) / 6) * 0.5; w[bi['leg' + k.toUpperCase()]] = h; w[bi['knee' + k.toUpperCase()]] = 1 - h; return w; } });
  if (SHORTS) [-1, 1].forEach(s => { const k = s < 0 ? 'r' : 'l', m = shortLeg(legs[k], x.kT, lin, s, SHORTS, thighCloth(k)); shortLegs.push(m); skinned.push(m); });
  const front5 = frontAt(T, 5.0);
  if (loin) {
    // the belt, and the two flaps hung from it: the front one out over the
    // cup and down past it, the back one over the buttocks; their folds
    const bm = dsMat(cloth, 'breech');
    const belt = facet(new THREE.TorusGeometry(1, 0.075, 6, 28), cloth, hips, 1.0);
    belt.position.y = 4.4; belt.rotation.x = HALF; belt.scale.set(s5.rx + 1.3, s5.rz + (s5.front || 0) + 1.3, 16);
    const flap = (front) => {
      const w = (front ? 17 : 22) * x.fx, y0 = 4.2, y1 = (front ? Math.min(x.cupBot || -26, -24) : -22) - 5;
      const z0 = front ? front5 - 1.4 : (s0.rz + (s0.back || 0) + gb * 0.7 + 1.0), z1 = front ? Math.min(x.cupFront || z0, z0) - 1.0 : (s6.rz + (s6.back || 0) + gb + 1.5);
      const geo = new THREE.PlaneGeometry(w, y0 - y1, 10, 8), p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const u = p.getX(i) / w, v = (y0 - (p.getY(i) + (y0 + y1) / 2)) / (y0 - y1);   // u -0.5..0.5 across, v 0 top .. 1 hem
        const k = Math.min(1, v * 2.2), z = z0 + (z1 - z0) * k * k * (3 - 2 * k) + Math.sin(u * 9 + v * 1.5) * 0.45 * v;
        p.setXYZ(i, p.getX(i) * (1 - 0.12 * (1 - v)), p.getY(i) + (y0 + y1) / 2, z);
      }
      geo.computeVertexNormals();
      // (the front one hung from the belt, draped over what is under it: held
      // at the belt, tented out from there to the anatomy's top and hanging
      // free below it; across, the stiffer the cloth the more of its width
      // goes with the push. Its gap: at most the room it was cut with over
      // the cup and the cup's own)
      if (!front) return facet(geo, bm, hips, 1.0, 0.9);
      const piv = G(hips, 0, y0, z0); geo.translate(0, -y0, -z0);
      const fm = liveFacet(geo, bm, piv, 1.0, 0.9), fr = fm.userData.live.rest, fw = new Float32Array(fr.length / 3);
      const yA = (pouch ? pouch.position.y + 1.5 : -7) - y0, sig = 5 + 9 * F.stiff;
      for (let i = 0; i < fw.length; i++) {
        const t = Math.max(0, Math.min(1, fr[3 * i + 1] / yA)), ax = fr[3 * i] / sig;
        fw[i] = t * t * (3 - 2 * t) * Math.exp(-ax * ax);
      }
      pieces.push({ mesh: fm, w: fw, room: R + 1.0, slide: 0.5, lift: 0.15 });
      return piv;
    };
    x.flap = flap(true); flap(false);
  }
  if (o.shirt) {
    // the shirt hangs from the chest: below it the cloth falls straight to the
    // hem rather than following the waist in, folded, the hem cut uneven
    const chest = S(37.0), cR = chest.rx + 2.4, cZ = chest.rz + 2.4, cF = (chest.front || 0) + 1.6;
    const hipR = s0.rx + 2.8, hipZ = Math.max(s0.rz, s6.rz) + 2.6;
    const up = [56.2, 54.0, 51.0, 47.5, 43.0, 37.0, 30.0].map(y => {
      if (y === 56.2) return { y, rx: 7.2, rz: 6.6 };
      const t = S(y); return { y, rx: t.rx + 2.4, rz: t.rz + 2.4, front: (t.front || 0) + (y <= 43 && y >= 30 ? 1.6 : 0.3), back: t.back || 0, z: t.z || 0 };
    });
    const down = [[23.0, 0.012], [17.0, 0.02], [11.0, 0.03], [5.0, 0.04], [0.0, 0.05], [-6.0, 0.06], [-14.0, 0.07], [-22.0, 0.08], [-29.0, 0.09]].map(([y, f], i) => {
      const t = T.find(q => q.y === y) || s0;
      const rz = Math.max(t.rz + 2.6, cZ * 0.92, y <= 0 ? hipZ : 0);
      // (below the hips it falls out over the cup in front, not through it)
      const overCup = y <= 0 && x.cupFront != null ? Math.max(0, -(x.cupFront - 1.4) - rz) * Math.min(1, -y / 8) : 0;
      return { y, rx: Math.max(t.rx + 2.8, cR * 0.92, y <= 0 ? hipR : 0), rz, front: Math.max(t.front || 0, cF * 0.8, overCup), back: (t.back || 0) + (y <= 0 ? gb + 0.8 : 0.4), folds: [7, f, i * 0.4], locks: y === -29.0 ? 0.8 : 0 };
    });
    const shirtWeights = (px, py, pz) => {
      const w = new Array(nb).fill(0); let rest = 1;
      ['l', 'r'].forEach(k => { const sh = arms[k].sh.position, d = Math.hypot(px - sh.x, py - sh.y, pz - sh.z), share = 0.5 * sm01(1 - d / (9 * x.kA)); w[bi['sh' + k.toUpperCase()]] = share; rest -= share; });
      w[bi.hips] = rest; return w;
    };
    skinned.push(facetSkinned(loft([...up, ...down].sort((a, b) => b.y - a.y), { n: 20, metric: UVM.linen, cap: false }), lin, hips, 1.5, rig.skeleton, shirtWeights));
    // the sleeves, full, to the elbow, folded toward the hem
    [-1, 1].forEach(s => {
      const k = s < 0 ? 'r' : 'l', A = arms[k], kA = x.kA;
      const secs = [[3.0, 0.4, 0.4], [2.4, 5.8, 5.6], [0.8, 8.0, 7.8], [-2.0, 9.0, 8.8], [-8, 8.6, 8.4], [-14, 8.2, 8.0], [-20, 7.9, 7.7], [-21.5, 7.7, 7.5]].map(([y, rx, rz], i) => ({ y, rx: rx * kA, rz: rz * kA, folds: i > 3 ? [6, 0.03 * (i - 3), s] : null }));
      facet(loft(secs, { n: 16, metric: UVM.linen, cap: false }), dsMat(lin, 'linen'), A.sh, 1.4);
    });
  }
  if (o.hose || fab === 'longJohns') {
    // each leg its own cloth, a little off the skin, wrinkled at the knee and
    // gathered at the ankle; the knee its own sleeve (long johns: the same,
    // a knit closer to the skin)
    const kT = x.kT, kS = x.kS, d = fab === 'longJohns' ? -0.15 : 0;
    [-1, 1].forEach(s => {
      const k = s < 0 ? 'r' : 'l', L = legs[k];
      // (the kneecap's plate is under the cloth: the knee's sleeve is its
      // shape, and a cap of cloth over the knee's ball, bent or straight)
      if (L.cap) L.cap.visible = false;
      facet(new THREE.SphereGeometry(5.2 * kS + 0.55 + d, 16, 12), lin, L.kn, 1.2);
      const tc = thighCloth(k); skinned.push(facetSkinned(loft([[4.0, 8.0, 8.4], [0, 9.6, 10.2, 0, 1.3], [-10, 9.4, 9.8, 1.1], [-22, 8.2, 8.6, 0.9], [-30, 7.2, 7.6], [-36, 6.6, 7.0]].map(([y, rx, rz, f, b], i) => ({ y, rx: rx * kT + 0.4 + d, rz: rz * kT + 0.4 + d, front: (f || 0) * kT, back: (b || 0) * kT, folds: i >= 3 ? [5, 0.02, s] : null })), { n: 14, metric: UVM.linen, cap: false }), lin, L.hip, 1.6, tc.skeleton, tc.weightAt));
      const sc = shinCloth(k); skinned.push(facetSkinned(loft([[-7, 5.9, 6.7, 0, 2.6], [-14, 5.5, 6.1, 0, 1.8], [-24, 4.3, 4.5, 0, 0.4], [-32, 3.6, 3.7], [-36.5, 3.5, 3.6], [-38.5, 3.2, 3.3]].map(([y, rx, rz, f, b], i) => ({ y, rx: rx * kS + 0.5 + d, rz: rz * kS + 0.5 + d, front: (f || 0) * kS, back: (b || 0) * kS, folds: i >= 3 ? [7, 0.045, s * 2] : (i === 0 ? [6, 0.03, s] : null) })), { n: 14, metric: UVM.linen, cap: false }), lin, L.kn, 1.5, sc.skeleton, sc.weightAt));
      addSleeve(L.hip.parent.parent, sleeves, lin, UVM.linen, { pa: L.hip, a: [0, -33, 0], pb: L.kn, b: [0, -9, 0], ra: [6.1 * kT + 0.6 + d, 6.6 * kT + 0.6 + d], rb: [5.45 * kS + 0.6 + d, 6.1 * kS + 0.6 + d], bulge: 0.5, len: 18 });
    });
  }
  // the loose pieces draped; the GPU cloth driven; both read the flesh's
  // swing vector (flesh.mjs), never the other way round
  const swing = () => hips.parent && hips.parent.userData.swing;
  const drape = pieces.length ? makeDrape({ pieces, fabric: { cling: F.cling, stiff: F.stiff, drape: F.drape || 0 }, swing }) : null;
  // (what the lab drives each pose, after the physics; covers: the anatomy
  // under it is not drawn - the brief is its shape)
  let clock = 0;
  const wear = ucm || drape ? {
    covers: !!ucm,
    update(dt) { clock += dt > 0 ? dt : 0; if (ucm) ucm.drive(dt, clock); if (drape) drape.update(dt); },
    refit() { if (ucm) ucm.measure(); if (drape) drape.reset(); wear.update(0); },
    // the hydrostatic state, 0 slack to 1 firm (the lab's Firm slider)
    setState(v) { if (ucm) ucm.set({ state: v }); },
    debug: () => ({ cloth: ucm && Object.fromEntries(Object.entries(ucm.uniforms).map(([k, u]) => [k, u.value && u.value.isVector2 ? [u.value.x, u.value.y] : u.value])), drape: drape && drape.debug() })
  } : null;
  return { cup, cloth: wear, flap: x.flap || null, support: F.support, lift, fabric: fab, hold: F, skinned };
}

// ------------------------------------------------------------ a build
// o.build reshapes a man - the app's figures, tuned in the lab's lineup of bodies. The valley's men
// never pass it, so they come out exactly as they always have.
//   height  a scale on the whole man (1 = the valley's, about 165 tall)
//   mass    -0.5 lean .. 0 the valley's man .. 1 heavy: the belly first,
//           then the hips, the chest, the neck, the tops of the limbs
//   muscle  -0.5 slight .. 1 heavily muscled: the shoulders and the chest
//           out, the waist in, the arms and the thighs full
//   age     -0.3 a youth .. 0 .. 1 elderly: the upper back rounding and the
//           shoulders and the head carried forward, the chest falling, a
//           little paunch, the limbs thinning
// (the anatomy is counter-scaled against height, so the dev sliders read
// the same on every man in the line)
const bump = (y, c, w) => { const d = (y - c) / w; return Math.exp(-d * d); };
function shapeTrunk(T0, b) {
  const m = b.mass, u = b.muscle, a = b.age;
  // (more rings through the chest, so the pectorals have a shape: laid
  // between the trunk's own, every number eased)
  const T = [];
  T0.forEach((s, j) => { T.push(s); const n = T0[j + 1]; if (n && s.y >= 30 && n.y <= 47.5) [1 / 3, 2 / 3].forEach(t => { const r = {}; Object.keys(s).forEach(k => { r[k] = s[k] + ((n[k] || 0) - s[k]) * t; }); r.y = s.y + (n.y - s.y) * t; T.push(r); }); });
  // the pectorals: their depth by height - full across the chest, the lower
  // edge a short, defined fall, the top easing into the collarbones
  const P = Math.max(0.4, 1.5 + 1.5 * Math.max(0, u) + 0.7 * Math.max(0, m) - 0.6 * Math.max(0, a));
  const pec = y => { const d = y >= 38.5 ? (y - 38.5) / 7.5 : (y - 38.5) / 3.2; return P * Math.exp(-d * d); };
  return T.map(s => {
    if (s.rx < 0.5) return s;   // (the points the hull closes to stay points)
    const y = s.y, wb = bump(y, 10, 12), wc = bump(y, 38, 8), wh = bump(y, -2, 7), ws = bump(y, 47, 5), ww = bump(y, 18, 6), wn = bump(y, 54, 3);
    const up = Math.max(0, Math.min(1, (y - 24) / 32));
    return Object.assign({}, s, {
      rx: Math.max(0.6, s.rx + m * (4.2 * wb + 3.0 * wh + 2.4 * wc + 1.4 * wn) + u * (3.2 * ws + 1.4 * wc - 1.6 * ww + 1.2 * wn) + a * (1.2 * wb - 1.4 * ws)),
      rz: Math.max(0.6, s.rz + m * (2.6 * wb + 1.8 * wc + 1.8 * wh + 1.0 * wn) + u * (1.4 * wc + 0.8 * wn)),
      front: (s.front || 0) + m * (8.5 * wb + 1.4 * wc) + u * 0.9 * wc + a * (2.4 * wb - 0.8 * wc),
      back: (s.back || 0) + m * 1.8 * wh + a * 3.0 * up * up,
      z: (s.z || 0) - a * 5.0 * up * up,
      lobes: pec(y) > 0.05 ? [-1, 1].map(sx => ({ x: sx * (7.6 + 0.6 * Math.max(0, u + m)), w: 6.4 + 0.8 * Math.max(0, u + m), d: pec(y) - 1.2 * Math.max(0, a) * Math.max(0, 36 - y) / 6 })) : undefined
    });
  });
}
// a limb's radii thickened (k = 1 hands the points back untouched)
const thick = (pts, k) => k === 1 ? pts : pts.map(p => [p[0], p[1] * k, p[2] == null ? p[2] : p[2] * k, (p[3] || 0) * k, (p[4] || 0) * k]);
const secAt = (T, y) => T.find(s => s.y === y);

// ------------------------------------------------------------ the body
// o.flayed: the raw muscle, no hair; o.shirt, o.hose, o.beard; o.split: the
// torso cut in two from the fork up (the sawyer's man), halves parting on a
// hinge at the breastbone with the spine and the rib-ends in the kerf.
export function buildFigure(kit, rnd, o = {}) {
  if (o === true) o = { flayed: true };
  // (a body is turned smooth: its forms round, the planes' steps gone - the
  // hatch wraps it, and its contour carries it)
  const soft0 = SOFT; SOFT = 1;
  const flayed = !!o.flayed;
  const skin = flayed ? kit.muscle : kit.flesh, skinUV = flayed ? kit.muscleUV : kit.fleshUV, UVS = flayed ? UVM.muscle : UVM.flesh;
  const root = new THREE.Group();
  const hips = G(root, 0, BODY_HIPS, 0);
  const B = o.build ? Object.assign({ height: 1, mass: 0, muscle: 0, age: 0 }, o.build) : null;
  // (each limb's thickening under the build; 1 each for the valley's men)
  const kA = B ? 1 + 0.30 * B.mass + 0.28 * B.muscle - 0.12 * B.age : 1, kF = B ? 1 + 0.15 * B.mass + 0.20 * B.muscle - 0.08 * B.age : 1;
  const kT = B ? 1 + 0.32 * B.mass + 0.20 * B.muscle - 0.10 * B.age : 1, kS = B ? 1 + 0.12 * B.mass + 0.15 * B.muscle - 0.08 * B.age : 1;
  const kN = B ? 1 + 0.25 * B.mass + 0.25 * B.muscle : 1;
  // the trunk, fork to the top of the shoulders (hips-relative y -9 .. 55)
  // (closed to a point under the fork: a flat cap there took no uv and
  // printed as a smear between the legs)
  const T0 = [
    { y: -11.6, rx: 0.2, rz: 0.2 },
    { y: -10.8, rx: 5.0, rz: 3.6 },
    { y: -9.0, rx: 9.0, rz: 6.0, back: 1.6 },                   // the fork
    { y: -6.0, rx: 15.0, rz: 9.8, back: 3.4 },                  // the seat
    { y: 0.0, rx: 16.0, rz: 10.4, back: 2.8 },                  // the hips
    { y: 5.0, rx: 15.4, rz: 10.0, front: 0.8 },                 // the pelvis' rim
    { y: 11.0, rx: 13.4, rz: 9.4, front: 1.4 },                 // the belly's swell
    { y: 17.0, rx: 12.6, rz: 9.0, front: 1.4 },                 // the waist
    { y: 23.0, rx: 13.8, rz: 9.6, front: 0.4 },                 // the ribs' arch lifting out of it
    { y: 30.0, rx: 16.4, rz: 10.4 },                            // the ribs
    { y: 37.0, rx: 18.2, rz: 11.2, front: 1.0 },                // the chest
    { y: 43.0, rx: 19.4, rz: 11.0, front: 1.2 },
    { y: 47.5, rx: 19.4, rz: 9.8 },                             // the shoulders' points, the trunk carried out over the arm's head
    { y: 51.0, rx: 15.2, rz: 8.4, front: 0.8 },                 // the collarbones' ridge, falling to the neck
    { y: 54.0, rx: 10.0, rz: 6.6 },                             // the trapezius' slope
    { y: 56.5, rx: 5.6, rz: 5.2 }                               // the neck's root
  ];
  const T = B ? shapeTrunk(T0, B) : T0;
  // (how far the build has moved the front of the trunk at y: features laid
  // on it move with it)
  const dF = y => B ? frontAt(T, y) - frontAt(T0, y) : 0;
  // (a build's man is one skin: his trunk and limbs' hulls are collected here
  // and merged into one skinned mesh once his joints stand - see below)
  const skinParts = [];
  let torso;
  if (o.split) {
    torso = G(hips);
    [0, 1].forEach(k => {
      const h = G(torso, 0, 50, 0); h.rotation.z = (k ? -1 : 1) * (o.part == null ? 0.15 : o.part);
      const secs = T.map(s => Object.assign({}, s, { y: s.y - 50 }));
      const half = facet(loft(secs, { n: 16, arc: k ? [HALF, PI * 1.5] : [-HALF, HALF], cap: true, metric: UVS }), skinUV, h, 2);
      // the cut face: a plate of raw, the trunk's profile
      const sh = new THREE.Shape();
      secs.forEach((s, i) => { const z = -(s.rz + (s.front || 0)); if (i) sh.lineTo(z, s.y); else sh.moveTo(z, s.y); });
      for (let i = secs.length - 1; i >= 0; i--) sh.lineTo(secs[i].rz + (secs[i].back || 0), secs[i].y);
      const capGeo = new THREE.ShapeGeometry(sh, 2); capGeo.rotateY(k ? -HALF : HALF);
      const cap = new THREE.Mesh(capGeo, kit.rawCap); cap.position.x = (k ? -1 : 1) * 0.3; h.add(cap);
    });
    // (no spine or rib-ends drawn in the kerf: white blocks down it read as
    // a corset's lacing - the cut is the raw of the two faces)
  } else {
    // (a build's man: the trunk is a part of his one skin - see the skin below)
    if (B && !flayed) { skinParts.push({ geo: loft(T, { n: 16, metric: UVS }), group: hips, bone: 'hips' }); torso = null; }
    else torso = facet(loft(T, { n: 16, metric: UVS }), skinUV, hips, 2);
    // the chest's two plates, the navel
    // (a build: the plates fuller with mass and muscle, falling with age)
    const pk = B ? 1 + 0.22 * B.mass + 0.18 * B.muscle - 0.1 * B.age : 1, py = B ? -2.4 * B.age - 1.2 * Math.max(0, B.mass) : 0, px = B ? 1 + 0.08 * (B.mass + B.muscle) : 1;
    if (B) {
      // (a build's chest: each pectoral a broad plate from the breastbone up
      // and out into the armpit, its lower edge rising toward the arm; a
      // small nipple on a darker areola, not an ink dot)
      [-1, 1].forEach(sx => {
        // (the pectorals are lobes of the trunk itself - see shapeTrunk)
        const nx = sx * 8.6 * px, ny = 37.4 + py * 0.6, nz = frontZAt(T, ny, nx);
        const am = areolaMat(kit);
        disc(1.15, 12, am, hips, nx, ny, nz - 0.04, -sx * 0.4);
        facet(knob(0.42, 1, 1, 0.7, 1), am, hips, 0).position.set(nx, ny, nz - 0.12);
      });
    } else
    [-1, 1].forEach(sx => { const pc = facet(knob(7.0 * pk, 1.1, 0.5, 0.22, 2), skin, hips, 0); pc.position.set(sx * 8.4 * px, 40.0 + py, -10.2 + dF(40)); pc.rotation.set(0.2, -sx * 0.3, sx * 0.1); disc(0.95, 8, kit.ink, hips, sx * 8 * px, 38.8 + py, -13.1 + dF(40), -sx * 0.5); });   // (the nipples a size up: at 0.7 they vanished at arm's length and the chest read as a doll's)
    if (!(B && o.shirt)) disc(0.8, 6, kit.ink, hips, 0, 12, -11.3 + dF(12));
  }
  // (the collarbones are the ridge in the trunk's hull at 51: bars laid on
  // it read as a row of rivets across the chest)
  if (flayed && !o.split) {
    // the ecorche's seams, cut in ink: the linea alba, the rectus bands, the
    // pectorals' lower edge, the ribs' arch, the iliac furrow
    const Fz = y => frontAt(T, y) - 0.4;
    seam([[0, 2, Fz(2)], [0, 14, Fz(14)], [0, 26, Fz(26)], [0, 36, Fz(36)]], hips, kit.ink);
    [9, 17, 25].forEach(y => seam([[-6.5, y - 1, Fz(y) + 1.4], [0, y, Fz(y)], [6.5, y - 1, Fz(y) + 1.4]], hips, kit.ink, 0.4));
    [-1, 1].forEach(sx => {
      seam([[sx * 2, 34, Fz(34)], [sx * 9, 33, Fz(33) + 1.2], [sx * 15, 36, Fz(36) + 3.6]], hips, kit.ink, 0.45);
      seam([[sx * 3, 30, Fz(30)], [sx * 10, 27, Fz(27) + 1.6], [sx * 14, 22, Fz(22) + 4.2]], hips, kit.ink, 0.4);
      seam([[sx * 6, 1, Fz(1) + 1.6], [sx * 11, 6, Fz(6) + 4.0], [sx * 13.5, 12, Fz(12) + 7]], hips, kit.ink, 0.4);
    });
  }
  // (the shirt follows the trunk up over the shoulders to an open collar at
  // the neck: cut off flat across the chest it read as square pads and a
  // seam)
  // (its collar closed round the neck: left open, the gap printed as a black
  // wedge under the chin, a gaping jaw)
  // (a build widens the cloth round the hips with them)
  const fx = B ? secAt(T, 0).rx / 16.0 : 1, fz = B ? (secAt(T, 5.0).rz + secAt(T, 5.0).front) / 10.8 : 1;
  // (a build's men have buttocks: two masses under the seat, fuller with
  // mass, rounder with muscle, falling a little with age - the trunk's own
  // seat is nearly flat. They press the cloth out from behind; the shirt's
  // tail is let out over them.)
  const gk = B ? 1 + 0.30 * B.mass + 0.15 * B.muscle - 0.12 * B.age : 1, gb = B ? 2.8 * gk : 0, glutes = [];
  if (B && !o.split) {
    // (skin: the brief and whatever is over it are cloth of their own)
    const gm = skin;
    [-1, 1].forEach(sx => {
      const c = new THREE.Vector3(sx * 6.6 * fx, -5.0 - 2.2 * Math.max(0, B.age), secAt(T, -6.0).rz + (secAt(T, -6.0).back || 0) - 7.0), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, sx * 0.22, sx * 0.06));   // (pitched so the upper mass swells out and the fold tucks under: pitched the other way, the mass hung under the seat as a ball)
      const gr = [6.6 * gk, 8.6 * gk, 5.2 * gk];
      glutes.push({ c, q, r: gr });
      // (a part of his one skin, laid where it sits - see the skin below)
      if (!flayed) skinParts.push({ geo: knob(gr[0], 1.0, gr[1] / gr[0], gr[2] / gr[0], 2).applyMatrix4(new THREE.Matrix4().compose(c, q, new THREE.Vector3(1, 1, 1))), group: hips, bone: 'hips' });
      else { const gl = facet(knob(gr[0], 1.0, gr[1] / gr[0], gr[2] / gr[0], 2), gm, hips, 1.4); gl.position.copy(c); gl.quaternion.copy(q); }
    });
  }
  if (o.shirt && !flayed && !B) { const sh = facet(loft([...(o.hose ? [] : [{ y: -21.0, rx: 15.0 * fx, rz: 11.6 * fz, back: gb * 0.6 }, { y: -15.0, rx: 15.6 * fx, rz: 11.6 * fz, back: gb }, { y: -11.4, rx: 15.8 * fx, rz: 11.6 * fz, back: gb }]), ...T.slice(3, 15).map(s => Object.assign({}, s, { rx: s.rx + 1.4, rz: s.rz + 1.2 })), { y: 56.2, rx: 6.6, rz: 6.0 }], { n: 16, metric: UVM.linen, cap: false }), kit.linen, hips, 1.5); sh.position.z = 0.2; }
  // (the cloth gathered closed under the fork: its flat end printed as a
  // black hole where a body bent or lying shows it from below)
  // (a breechcloth wrapped close round the hips and over the tops of the
  // thighs, drawn up between the legs, the thighs coming out of it: hung
  // loose and full as a skirt, rounded under, it read as a diaper with a
  // belly)
  // (in a darker cloth than the skin, with a rolled band at the waist, so
  // it reads as cloth and the man as clothed)
  else if (!flayed && !B) {
    const bm = kit.breech || kit.linen;
    const band = facet(new THREE.TorusGeometry(16.6, 1.3, 6, 24), bm, hips, 1.0); band.position.y = 2.0; band.rotation.x = HALF; band.scale.set(fx, 0.66 * fz, 1);
    const lc = facet(loft([{ y: -21.0, rx: 0.2, rz: 0.2, z: -1.0 }, { y: -20.2, rx: 3.6, rz: 6.8, z: -1.0 }, { y: -18.4, rx: 8.6, rz: 10.2, z: -0.4 }, { y: -15.0, rx: 17.8, rz: 11.8 }, { y: -8, rx: 18.0, rz: 11.8 }, { y: -2, rx: 17.2, rz: 11.2 }, { y: 2.2, rx: 16.6, rz: 10.9 }], { n: 16, metric: UVM.linen }), bm, hips, 1.4); lc.scale.set(fx, 1, fz); }
  const neck = G(hips, 0, 55, B ? secAt(T, 54.0).z || 0 : 0);
  facet(tube(thick([[0, 5.6, 5.2], [5, 4.6, 4.3], [10.5, 4.4, 4.1]], kN), 12, { metric: UVS }), skinUV, neck, 1.2);
  const head = G(neck, 0, 11, 0);
  // (the head a size up on the body: at a ninth of the height it read as a doll's)
  // (a build's man - the lab's - has a face; the valley's keep their screams,
  // and the lab can ask for one: o.face 'valley')
  const hd = B && !flayed && o.face !== 'valley' ? buildFace(kit, o, B) : buildHead(kit, o); hd.scale.setScalar(1.12); head.add(hd);
  const arms = {};
  [-1, 1].forEach(s => {
    const key = s < 0 ? 'r' : 'l';
    const sh = G(hips, s * (17.2 + (B ? (secAt(T, 47.5).rx - 19.4) * 0.9 : 0)), 47.5, B ? secAt(T, 47.5).z || 0 : 0);
    // the upper arm one hull: its head domed under the trunk's shoulder, so
    // the line runs on from the trapezius over the deltoid with no corner, the deltoid's and the biceps' swell, the taper to
    // the elbow, and ending in the elbow's ball - the forearm starts in the
    // same ball, so the joint bends with no seam (knobs laid over a joint
    // read as a ring, a mannequin's)
    const upperArm = tube(thick([[0.2, 0.3], [-0.2, 3.4], [-1.4, 5.4], [-3.2, 6.4], [-7, 6.3, 6.0, 0.7], [-12, 5.6, 5.3, 0.6], [-19, 4.8, 4.6, 0.3], [-25, 4.2], ...ball(-30, 4.0, -1)], kA), 12, { metric: UVS });
    if (B && !flayed) skinParts.push({ geo: upperArm, group: sh, bone: 'sh' + key.toUpperCase() }); else facet(upperArm, skinUV, sh, 1.8);
    if (flayed) { seam([[s * 5.4, -4, -1.5], [s * 5.4, -14, -2.4], [s * 4.6, -26, -1.6]], sh, kit.ink, 0.4); seam([[0, -5, -5.9], [s * 1.5, -15, -5.6], [0, -25, -4.9]], sh, kit.ink, 0.35); }
    // (the sleeve domed over the shoulder, the cuff turned in)
    // (a build's: the deltoid capping the shoulder, rounder with muscle)
    if (B && !flayed) { const dl = facet(knob(5.4 * kA, 1.05, 1.3, 1.0, 2), skin, sh, 0.8); dl.position.set(s * 1.0, -3.6, 0.2); }
    if (o.shirt && !flayed && !B) facet(tube(thick([[2.4, 0.3], [1.8, 3.8], [0.4, 6.0], [-1.8, 7.2], [-6, 7.2], [-14, 6.8], [-20, 6.4], [-20.6, 4.9]], kA), 12, { metric: UVM.linen }), kit.linen, sh, 1.5);
    const el = G(sh, 0, -30, 0);
    // the forearm: out of the elbow's ball, its belly under the elbow,
    // narrowing to the wrist, closed inside the hand
    const forearm = tube(thick([...ball(0, 4.0, 1), [-5, 5.0, 4.5, 0, 0.7], [-12, 4.5, 4.0], [-20, 3.3, 2.7], [-25.5, 2.4, 1.9], [-27.2, 2.2, 1.7], [-28.0, 1.6, 1.3], [-28.4, 0.3]], kF), 12, { metric: UVS });
    if (B && !flayed) skinParts.push({ geo: forearm, group: el, bone: 'el' + key.toUpperCase() }); else facet(forearm, skinUV, el, 1.7);   // (the forearm's belly high under the elbow, narrowing hard to a slim wrist: one width end to end read as a mannequin's tube)
    if (flayed) seam([[s * 4.4, -3, -0.5], [s * 4.2, -12, -2.2], [s * 2.8, -24, -1.8]], el, kit.ink, 0.35);
    const hand = G(el, 0, -29, 0);
    const hh = buildHand(kit, s, skin, { curl: o.curl, nails: !!B }); hand.add(hh); hand.userData.grip = hh.userData.grip;
    arms[key] = { sh, el, hand };
  });
  // (hose came with a codpiece: a modest rounded front to the fork in the
  // same linen - a smooth closed fork read as a mannequin's)
  // (under the cloth, a man's weight: a pouch carried low and forward of the
  // fork, fuller at its foot than its root, the cloth drawn over it - a
  // smooth closed fork, or a small knob, read as a doll's. No line round
  // it: its own outline read as a doorknob. `pouch` is left in userData so a
  // pose can let it fall with gravity - see the sawyer, hung head down)
  let pouch = null;
  if (!flayed) {
    // (over a loincloth it is the cloth itself drawn forward over it)
    // (a shirt with no hose runs on to a shirt-tail over the fork, and the
    // pouch sits under it, showing through it)
    const covered = o.shirt && !o.hose;
    // (narrow at its root in the fork and full, deep and rounded at its foot,
    // carried low between the thighs: set wide and high it read as a pad of
    // belly fat, not a man)
    // (a build's man: rooted on the skin of the pelvis at the fork's front,
    // so it stays fixed to him in any pose, and grows from there)
    pouch = G(hips, 0, -8.6, B ? frontAt(T, -8.6) - 0.3 : (o.hose ? -7.2 : covered ? -8.8 : -10.0));
    if (B && B.height !== 1) pouch.scale.setScalar(1 / B.height);
    // (a build's man in a cloth he can slip out of: the anatomy painted brown)
    const m = B ? (FABRIC[fabricOf(o)].slip ? (kit.breech || kit.linen) : skinUV) : o.hose || covered ? kit.linen : (kit.breech || kit.linen);
    if (B) pouch.userData.live = true;
    const anat = Object.assign(anatomyFor(rnd), migrateAnatomy(o.anatomy) || {});
    buildAnatomy(pouch, m, anat);
  }
  const legs = {};
  const hoseLegs = o.hose && !flayed && !B;   // (a build's legs are skin; its hose are cloth over them)
  const legM = hoseLegs ? kit.linen : skinUV, legS = hoseLegs ? kit.linen : skin, legUV = hoseLegs ? UVM.linen : UVS;
  [-1, 1].forEach(s => {
    const key = s < 0 ? 'r' : 'l';
    const hip = G(hips, s * (8.5 + (B ? (secAt(T, 0.0).rx - 16.0) * 0.5 : 0)), -4, 0);
    // the thigh: full under the hip, the quadriceps' swell, the knee's taper
    // (one hull from a dome inside the trunk to the knee's ball)
    const thighGeo = tube(thick([...THIGH_SKIN, ...ball(-44, 5.2, -1)], kT), 12, { metric: legUV });
    let thigh = null;
    if (B && !flayed) skinParts.push({ geo: thighGeo, group: hip, bone: 'leg' + key.toUpperCase() }); else thigh = facet(thighGeo, legM, hip, 2);
    if (flayed) { seam([[s * 6.5, -2, -6.2], [s * 2.5, -16, -8.4], [-s * 3, -32, -6.4], [-s * 3.8, -40, -4.6]], hip, kit.ink, 0.45); seam([[-s * 7.8, -4, -2.6], [-s * 7.2, -20, -3.0], [-s * 5.8, -36, -2.4]], hip, kit.ink, 0.4); }
    const kn = G(hip, 0, -44, 0);
    // the shin: out of the knee's ball, the calf's swell behind, the ankle
    const shinGeo = tube(thick([...ball(0, 5.2, 1), [-7, 5.4, 6.2, 0, 2.6], [-14, 5.0, 5.6, 0, 1.8], [-24, 3.8, 4.0, 0, 0.4], [-33, 2.9, 3.0], [-37, 2.6, 2.8], [-39, 2.3], [-40.4, 0.3]], kS), 12, { metric: legUV });
    if (B && !flayed) skinParts.push({ geo: shinGeo, group: kn, bone: 'knee' + key.toUpperCase() }); else facet(shinGeo, legM, kn, 1.8);   // (the calf swelling high behind and falling away to a slim ankle)
    // the kneecap: a flat plate at the front of the knee's ball, riding on the shin
    const cap = facet(knob(2.6, 1.05, 1.2, 0.55, 1), legS, kn, 0); cap.position.set(0, 1.0, -5.0 * kS); cap.userData.tissue = TISSUE.RIGID;   // (bone: cloth lies crisp over it)
    if (flayed) { seam([[s * 2.2, -3, -5.8], [s * 1.2, -16, -4.8], [s * 0.6, -34, -3.6]], kn, kit.ink, 0.4); seam([[0, -4, 8.2], [0, -14, 7.2], [0, -26, 5.0]], kn, kit.ink, 0.4); }
    const foot = G(kn, 0, -41, 0);
    // the foot: the heel's block, the instep's slope out to the toes
    facet(loft([{ y: -0.5, rx: 3.6, rz: 4.2, z: 0.6 }, { y: -3.0, rx: 4.6, rz: 6.0, z: -1.8, front: 1.0 }], { n: 8 }), skin, foot, 1.2);
    const inst = facet(loft([{ y: -1.0, rx: 3.4, rz: 2.6, z: -3.0 }, { y: -2.2, rx: 4.6, rz: 2.4, z: -8.0 }, { y: -3.2, rx: 5.2, rz: 1.2, z: -12.0 }], { n: 6 }), skin, foot, 1.0);
    for (let t = 0; t < 5; t++) { const toe = facet(tube([[0, 0.8], [-2.2 + t * 0.2, 0.7]], 5), skin, foot, 0.6); toe.position.set((t - 2) * 1.5 * s - s * 0.4, -2.9, -12.4 + Math.abs(t - 0.5) * 0.5); toe.rotation.x = HALF; }
    legs[key] = { hip, kn, foot, cap, thigh };
  });
  // (a hose's knee sleeves are added by dress; the body's own joints have none)
  const sleeves = [];
  // the skeleton: a bone in each joint's group, driven by the pose as the
  // groups are - the skin and a garment that spans joints are skinned to it
  let rig = null, soft = null;
  const skinned = [];
  if (B && !flayed) {
    const bone = g => { const b = new THREE.Bone(); g.add(b); return b; };
    const bones = { hips: bone(hips), legL: bone(legs.l.hip), legR: bone(legs.r.hip), kneeL: bone(legs.l.kn), kneeR: bone(legs.r.kn), shL: bone(arms.l.sh), shR: bone(arms.r.sh), elL: bone(arms.l.el), elR: bone(arms.r.el), neck: bone(neck) };
    const keys = Object.keys(bones), bi = Object.fromEntries(keys.map((k, i) => [k, i]));
    rig = { bones, skeleton: new THREE.Skeleton(keys.map(k => bones[k])), index: bi };
    // the one skin: the trunk and the limbs' hulls merged in the hips' frame
    // (each at its joint, as it was built), on the bones. A point is its own
    // hull's bone's; near a joint it is shared with the bone across it - half
    // and half within the joint's ball (R0: the elbow's and the knee's, where
    // the two hulls end and start in one sphere, so it turns as one sphere
    // and never parts), eased off to the hull's own bone by R - so the skin
    // bends there as one surface (the sleeves that bridged each joint are
    // gone). The hulls still run on into each other inside the joint (the
    // thigh's dome in the trunk), and the blend carries both alike.
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(hips.matrixWorld).invert();
    const merged = mergeHulls(skinParts.map(p => ({ geo: p.geo, matrix: new THREE.Matrix4().multiplyMatrices(inv, p.group.matrixWorld), bone: bi[p.bone] })));
    const J = [];
    ['l', 'r'].forEach(k => {
      const K = k.toUpperCase(), A = arms[k], L = legs[k], sh = A.sh.position, hp = L.hip.position;
      J.push({ a: bi.hips, b: bi['sh' + K], P: sh.clone(), R0: 0, R: 8.5 * kA });
      J.push({ a: bi['sh' + K], b: bi['el' + K], P: sh.clone().add(A.el.position), R0: 4.4 * kA, R: 8 * kA });
      J.push({ a: bi.hips, b: bi['leg' + K], P: hp.clone(), R0: 0, R: 10.5 * kT });
      J.push({ a: bi['leg' + K], b: bi['knee' + K], P: hp.clone().add(L.kn.position), R0: 5.7 * kS, R: 10 * kT });
    });
    const smooth01 = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
    const skinWeights = (x, y, z, i, geo) => {
      const own = geo.attributes.owner.getX(i), w = new Array(keys.length).fill(0); w[own] = 1;
      for (const j of J) {
        if (j.a !== own && j.b !== own) continue;
        const other = j.a === own ? j.b : j.a, d = Math.hypot(x - j.P.x, y - j.P.y, z - j.P.z), share = 0.5 * smooth01((j.R - d) / (j.R - j.R0));
        w[own] -= share; w[other] += share;
      }
      return w;
    };
    // the skin's cloth uv (an unwrap round the trunk: u the arc from the
    // front's middle, v the height, cm) and its mask (the trunk and the
    // seat: 1; the limbs: 0), for the soft tissue below
    {
      const pa = merged.attributes.position, ow = merged.attributes.owner, uv = new Float32Array(pa.count * 2), mask = new Float32Array(pa.count);
      for (let i = 0; i < pa.count; i++) { uv[2 * i] = Math.atan2(pa.getX(i), -(pa.getZ(i) - 1.0)) * 14; uv[2 * i + 1] = pa.getY(i); mask[i] = ow.getX(i) === bi.hips ? 1 : 0; }
      merged.setAttribute('clothUv', new THREE.BufferAttribute(uv, 2)); merged.setAttribute('clothMask', new THREE.BufferAttribute(mask, 1));
      // (and which points are a limb's: the halo breathes wider round a limb,
      // where it crosses the trunk - see outlineMaterial's uLimbHalo)
      const limb = new Float32Array(pa.count); for (let i = 0; i < pa.count; i++) limb[i] = 1 - mask[i];
      merged.setAttribute('aLimb', new THREE.BufferAttribute(limb, 1));
    }
    const skinMesh = facetSkinned(merged, skinUV, hips, 2, rig.skeleton, skinWeights);
    skinMesh.userData.skin = true;
    skinned.push(skinMesh);
    torso = skinMesh;
    // the soft tissue: the belly, the pectorals and the seat as sites on the
    // skin's cloth (universal-cloth-material.mjs), each pulsed by softDrive
    // from the body's motion - fuller with mass, the chest with muscle too
    const uvAt = (x, y, z) => ({ u: Math.atan2(x, -(z - 1.0)) * 14, v: y });
    const mass = Math.max(0, B.mass), px = 1 + 0.08 * (B.mass + B.muscle), py = -2.4 * B.age - 1.2 * mass;
    const sites = [], gains = [];
    sites.push(Object.assign(uvAt(0, 11, frontAt(T, 11)), { radius: 9 + 3 * mass, amp: 0.5 + 0.9 * mass })); gains.push({ g: 1.1 + 0.5 * mass, gy: 1, gz: 0.5 });
    [-1, 1].forEach(sx => { const nx = sx * 8.6 * px, ny = 37.4 + py * 0.6; sites.push(Object.assign(uvAt(nx, ny, frontZAt(T, ny, nx)), { radius: 6.5, amp: 0.35 + 0.3 * mass + 0.15 * Math.max(0, B.muscle) })); gains.push({ g: 0.9 + 0.35 * mass, gy: 0.6, gz: 1 }); });
    glutes.forEach(gl => { sites.push(Object.assign(uvAt(gl.c.x, gl.c.y, gl.c.z), { radius: 7.5, amp: 0.45 * gk })); gains.push({ g: 1.0 + 0.35 * mass, gy: 1, gz: -0.4 }); });
    const skinCloth = new UniversalClothMaterial(skinUV, { uv: 'clothUv', mask: 'clothMask', tissueType: TISSUE_TYPE.SOFT, maxDepth: 0, jiggle: 0, uvEps: 0.2, sites });
    skinCloth.apply(skinMesh);
    skinMesh.children.forEach(c => { if (c.userData.outline) c.material = skinCloth.wrap(c.material); });
    // the skin's contour swells toward the light and thins in the shade, and
    // its halo stands wider round the limbs (burin.mjs outlineMaterial)
    skinMesh.children.forEach(c => { const u = c.userData.outline && c.material.uniforms; if (!u) return; u.uLitSwell.value = c.userData.halo ? 0.25 : 0.5; if (c.userData.halo) u.uLimbHalo.value = 0.45; });
    skinMesh.userData.ucm = skinCloth; skinMesh.userData.studioKey = 'fleshUV';
    soft = softDrive(hips, skinCloth, gains);
  }
  // a build's clothes, over the skin
  let worn = null;
  // (o.nude, the lab's None: no fabric at all - nothing holds the anatomy,
  // so its physics runs unrestrained: support 180 is no cone, no lift)
  if (B && !flayed && o.nude) worn = { cup: null, support: 180, lift: 0, fabric: 'none', hold: FABRIC.none };
  if (B && !flayed && !o.nude) { root.updateMatrixWorld(true); worn = dress(kit, o, T, hips, arms, legs, pouch, { gb, kA, kT, kS, fx, glutes, rig }, sleeves); }
  if (worn && worn.skinned) skinned.push(...worn.skinned);
  if (B && B.height !== 1) root.scale.setScalar(B.height);
  // (bound at the man's height: a bind reads the bones' world matrices)
  if (skinned.length) { root.updateMatrixWorld(true); bindSkinned(skinned); }
  // (under a fitted brief the anatomy is not drawn: the brief is its shape,
  // fitted to it each frame - it still moves, and the brief reads it)
  if (worn && worn.cloth && worn.cloth.covers && pouch) pouch.visible = false;
  root.userData = { cup: worn && worn.cup, cloth: worn && worn.cloth, flap: worn && worn.flap, support: worn && worn.support, lift: (worn && worn.lift) || 0, fabric: worn && worn.fabric, hold: worn && worn.hold, hips, torso, neck, head, arms, legs, pouch, mouth: hd.userData.mouth, setFace: hd.userData.setFace || null, phase: rnd() * 6.28, build: B, sleeves, rig, soft,
    // (what the anatomy's physics collides with, in the man's own units: the thighs' radius, the belly's front)
    colliders: B ? { thighR: 8.0 * kT, bellyR: -frontAt(T, 12), bellyZ: 0 } : null };
  if (sleeves.length) updateSleeves(root);
  SOFT = soft0;
  if (worn && worn.cloth) { root.updateMatrixWorld(true); worn.cloth.update(); }
  return root;
}

// ------------------------------------------------------------ the Death
// the skull: the dome long from brow to back, the brow's shelf, the
// temples flat, the sockets dark holes with the sharp orbit over each, the
// nasal hole a dark triangle, the cheekbones' arch standing off the side,
// the maxilla's teeth, and the mandible hinged under the ear, dropped open
export function buildSkull(kit) {
  const g = new THREE.Group();
  const D = [
    { y: -1.0, rx: 6.6, rz: 7.0, z: 2.0 }, { y: 2.4, rx: 8.0, rz: 9.4, z: 1.4 }, { y: 6.0, rx: 8.4, rz: 10.0, z: 1.2, front: 0.6 },
    { y: 9.6, rx: 7.4, rz: 9.0, z: 1.6 }, { y: 12.4, rx: 4.4, rz: 5.6, z: 1.8 }, { y: 13.6, rx: 0.2, rz: 0.2, z: 1.8 }
  ];
  const dome = facet(loft(D, { n: 10, spin: PI / 10 }), kit.skull, g, 2);
  const F = y => frontAt(D, y);
  // the face: the upper jaw's block under the dome, narrowing to the teeth
  const face = facet(loft([{ y: -5.6, rx: 4.4, rz: 3.4, z: -3.6 }, { y: -2.4, rx: 6.2, rz: 5.0, z: -2.6 }, { y: 1.0, rx: 7.4, rz: 6.4, z: -1.6 }], { n: 8 }), kit.skull, g, 1.6);
  // the orbits: a dark hole each, sunk under the brow's sharp shelf
  [-1, 1].forEach(sx => {
    const so = disc(3.0, 7, kit.ink, g, sx * 3.7, 3.0, F(3) - 0.2, -sx * 0.35); so.scale.set(1, 1.1, 1);
    const rim = facet(block(5.6, 0.8, 1.8, 0.4), kit.bone, g, 0.7); rim.position.set(sx * 3.7, 6.5, F(6.5) - 0.2); rim.rotation.set(0.6, sx * 0.35, sx * 0.12);
  });
  // the nose hole, and the bridge's bar above it
  const nose = disc(1.9, 3, kit.ink, g, 0, -1.2, F(-1.2) - 0.3); nose.rotation.z = PI;
  facet(block(1.8, 3.4, 1.4, 0), kit.bone, g, 0.8).position.set(0, 2.2, F(2.2) - 0.3);
  // the cheekbones: an arch standing off either side, back to the ear
  [-1, 1].forEach(sx => { const z = facet(loft([{ y: 0, rx: 1.0, rz: 1.0, z: 0 }, { y: 0, rx: 1.0, rz: 1.0, z: -3 }], { n: 5 }), kit.bone, g, 0.9); z.position.set(sx * 7.4, 0.6, -3.2); z.rotation.set(0, 0, 0); z.scale.set(1, 1.2, 1.8); });
  // the maxilla's teeth, an arc; the mandible with its own, hinged
  const arc = (parent, y, z0, r, h) => { for (let i = -3; i <= 3; i++) { const a = i / 3.6 * HALF; const t = facet(block(1.0, h, 0.8, 0), kit.bone, parent, 0.5); t.position.set(Math.sin(a) * r, y, z0 - Math.cos(a) * r); t.rotation.y = -a; } };
  arc(g, -5.0, -3.6, 4.4, 2.2);
  const jaw = G(g, 0, -1.4, 1.6);
  const jl = facet(loft([{ y: -8.6, rx: 4.8, rz: 4.4, z: -3.0 }, { y: -6.4, rx: 5.6, rz: 5.0, z: -2.8 }], { n: 8, arc: [PI, PI * 2] }), kit.bone, jaw, 1.4);
  [-1, 1].forEach(sx => { const r = facet(block(1.6, 7.6, 2.2, 0.2), kit.bone, jaw, 1); r.position.set(sx * 6.0, -3.6, -0.6); r.rotation.x = -0.25; });
  arc(jaw, -6.0, -4.2, 4.2, 2.0);
  jaw.rotation.x = 0.5;
  g.userData.jaw = jaw;
  return g;
}
// a long bone: a faceted shaft swelling into its two heads, +y from 0 to len
function bone(len, r, head = 1.6, n = 7) {
  return tube([[0, r * 0.4], [r * 0.9, r * head], [len * 0.12, r * 1.05], [len * 0.5, r * 0.88], [len * 0.88, r * 1.05], [len - r * 0.8, r * head * 0.9], [len, r * 0.4]], n);
}
export function buildDeath(kit, rnd) {
  const m = kit.bone;
  const root = new THREE.Group();
  const hips = G(root, 0, 92, 0);
  const pelvis = G(hips);
  // the pelvis: the two wings of the ilium, flat plates fanned back, the sacrum's wedge between
  [-1, 1].forEach(s => { const w = facet(loft([{ y: -4, rx: 4.0, rz: 1.2, x: s * 4 }, { y: 1, rx: 6.0, rz: 1.6, x: s * 7 }, { y: 6, rx: 6.6, rz: 1.4, x: s * 8.5, z: 1.5 }], { n: 6 }), kit.ball, pelvis, 1.4); w.rotation.y = -s * 0.55; });
  facet(loft([{ y: -8, rx: 1.4, rz: 1.2, z: 2.4 }, { y: 0, rx: 4.0, rz: 2.0, z: 2.0 }, { y: 4, rx: 4.6, rz: 2.2, z: 1.6 }], { n: 6 }), m, pelvis, 1.2);
  const spine = G(hips, 0, 4, 0);
  for (let i = 0; i < 8; i++) { const v = facet(new THREE.CylinderGeometry(2.3, 2.6, 2.4, 7), kit.ball, spine, 1.1); v.position.set(0, i * 3.6, 1.5 + Math.sin(i / 8 * 2) * 1.2); const sp = facet(block(1.2, 1.6, 2.6, 0), m, spine, 0.6); sp.position.set(0, i * 3.6, 4 + Math.sin(i / 8 * 2) * 1.2); }
  const chest = G(spine, 0, 30, 0);
  // the ribcage: the ribs as flat curved staves (broad face out, as a rib
  // is a strap of bone, not a rod), each from the spine round the side and
  // falling steeply to the front, the upper seven joined to the breastbone
  // by a thinner rising strap of cartilage - so it reads as a cage of
  // sloping staves with a sternum, never a coil of hoops
  const sternum = facet(loft([{ y: -14, rx: 1.6, rz: 0.9, z: -10.6 }, { y: -4, rx: 2.4, rz: 1.1, z: -11.8 }, { y: 6, rx: 3.0, rz: 1.1, z: -11.0 }], { n: 5 }), m, chest, 1.1);
  const stYZ = y => [y < -4 ? -10.6 - (y + 14) / 10 * 1.2 : -11.8 + (y + 4) / 10 * 0.8];
  for (let i = 0; i < 9; i++) {
    const t = i / 8, y0 = 11 - i * 3.3 - t * t * 2, R = 10.5 * Math.sin(0.6 + t * 2.1) + 4.5, D = R * 0.78;
    const short = i < 7 ? 0.8 : 0.66, drop = 7 + t * 6;
    [-1, 1].forEach(sx => {
      const pts = [];
      for (let k = 0; k <= 10; k++) { const a = k / 10 * short, ang = a * PI * 0.92; pts.push(new THREE.Vector3(sx * Math.sin(ang) * R, y0 - a * drop - a * a * 3.5 - 1.0 * Math.sin(a * PI), 3.2 - (1 - Math.cos(ang)) * D * 0.62 - a * 1.2)); }
      const w = i < 7 ? 1.9 - t * 0.5 : 1.2, th = 0.55;
      const sv = stave(pts, w, th, new THREE.Vector3(0, 0, -2));
      facet(sv, kit.rib, chest, 0.9, 0.6);
      if (i < 7) {
        // the cartilage: from the rib's end, rising inward to the sternum's edge
        const e = pts[pts.length - 1], sy = Math.min(5, Math.max(-13, y0 - 2 - i * 0.6));
        const c = [e, new THREE.Vector3(e.x * 0.55, e.y + 0.6, (e.z + stYZ(sy)[0]) / 2 - 0.6), new THREE.Vector3(sx * 2.2, sy, stYZ(sy)[0] + 0.3)];
        facet(stave(c, 1.0, 0.4, new THREE.Vector3(0, 0, -2)), kit.ball, chest, 0.6, 0.6);
      }
    });
  }
  // the hollow of the chest: a dark hull just inside the staves, so each rib
  // stands white against the shade of the cage, as a cutter leaves it, and
  // the far side's ribs never show through the near ones' gaps (seen from
  // above they ran on round the back, and the cage read as a coiled spring)
  const cav = (y, R) => ({ y, rx: R * 0.78, rz: R * 0.34, z: 3.2 - R * 0.42 });
  facet(loft([cav(10, 10.0), cav(4, 13.6), cav(-3, 14.6), cav(-10, 13.4), cav(-17, 10.2), cav(-21, 7.6)], { n: 12, cap: true }), kit.hollow || kit.ball, chest, 0, 0.9);
  // the shoulder blades: two flat plates on the back
  [-1, 1].forEach(s => { const sc = facet(loft([{ y: -12, rx: 2.0, rz: 0.7, x: s * 5 }, { y: -2, rx: 5.0, rz: 0.8, x: s * 8 }, { y: 9, rx: 5.6, rz: 0.9, x: s * 11 }], { n: 5 }), m, chest, 1.0); sc.position.set(0, 2, 7.6); sc.rotation.y = s * 0.25; });
  const neck = G(chest, 0, 14, 0);
  for (let i = 0; i < 3; i++) facet(new THREE.CylinderGeometry(2.1, 2.1, 2.1, 7), kit.ball, neck, 1.0).position.y = i * 3;
  const head = G(neck, 0, 10, 0);
  head.add(buildSkull(kit));
  const arms = {};
  [-1, 1].forEach(s => {
    const key = s < 0 ? 'r' : 'l';
    const cl = facet(tube([[0, 0.6], [1, 1.1], [7, 0.9], [14, 1.0], [15, 0.6]], 6), m, chest, 1.0); cl.position.set(s * 0.5, 12, -3.4); cl.rotation.z = s * HALF; cl.rotation.y = -s * 0.2;
    const sh = G(chest, s * 16, 12, -1);
    facet(knob(2.6, 1, 1, 1, 1), kit.ball, sh, 1.0);
    const hum = facet(bone(28, 1.7), kit.shaft, sh, 1.5); hum.rotation.x = PI;
    const el = G(sh, 0, -28, 0);
    const ra = facet(bone(25, 1.25), kit.shaft, el, 1.3); ra.rotation.x = PI; ra.position.x = s * 1.3;
    const ul = facet(bone(26, 1.05), kit.shaft, el, 1.3); ul.rotation.x = PI; ul.position.x = -s * 1.1;
    const hand = G(el, 0, -26, 0);
    // the hand: eight carpal knobs, five metacarpals, the phalanges in a loose curl
    for (let c = 0; c < 4; c++) facet(knob(0.9, 1, 1, 0.8, 0), kit.ball, hand, 0.5).position.set((c - 1.5) * 1.5, -1.2, 0);
    const F = [[-2.6, 7.2, 0.5, 0.1], [-0.9, 8.4, 0.5, 0.2], [0.9, 8.0, 0.48, 0.3], [2.6, 6.4, 0.42, 0.4]];
    const chains = [];
    F.forEach(([fx, len, r, curl]) => {
      const mc = facet(bone(5.6, r * 1.1, 1.4, 6), m, hand, 0.7); mc.rotation.x = PI; mc.position.set(s * fx, -2.0, 0);
      let at = G(hand, s * fx, -7.8, 0); const chain = [at];
      [0.42, 0.33, 0.25].forEach((shr, k) => { const L = len * shr; const ph = facet(bone(L, r * (1 - k * 0.12), 1.3, 6), m, at, 0.6); ph.rotation.x = PI; const nx = G(at, 0, -L, 0); chain.push(nx); at = nx; });
      chains.push({ chain, curl });
    });
    const th = G(hand, s * 3.4, -1.6, -0.4);
    const tm = facet(bone(4.2, 0.6, 1.3, 6), m, th, 0.7); tm.rotation.x = PI;
    const th2 = G(th, 0, -4.2, 0); const tp = facet(bone(3.2, 0.5, 1.3, 6), m, th2, 0.6); tp.rotation.x = PI;
    // the grip: c 0 a loose hang, 1 closed on a shaft across the palm at
    // GRIP (the fingers round it, the thumb over)
    hand.userData.grip = (c = 0) => {
      chains.forEach(({ chain, curl }) => { chain[0].rotation.x = -0.4 - curl - c * 1.1; chain[1].rotation.x = -0.5 - curl * 0.6 - c * 1.0; chain[2].rotation.x = -0.5 - curl * 0.6 - c * 0.5; });
      th.rotation.set(-0.5 - c * 0.9, s * c * 0.6, s * (1.1 - c * 0.5)); th2.rotation.x = -0.6 - c * 0.7;
    };
    hand.userData.grip(0);
    arms[key] = { sh, el, hand };
  });
  const legs = {};
  [-1, 1].forEach(s => {
    const key = s < 0 ? 'r' : 'l';
    const hip = G(hips, s * 8, -2, 0);
    facet(knob(2.8, 1, 1, 1, 1), kit.ball, hip, 1.1);
    const fe = facet(bone(42, 2.2, 1.7), kit.shaft, hip, 1.6); fe.rotation.x = PI;
    const kn = G(hip, 0, -42, 0);
    facet(knob(3.0, 1.1, 0.9, 1, 1), kit.ball, kn, 1.2);
    const ti = facet(bone(40, 1.8), kit.shaft, kn, 1.5); ti.rotation.x = PI;
    const fi = facet(bone(38, 0.85), kit.shaft, kn, 1.0); fi.rotation.x = PI; fi.position.x = -s * 2.6;
    const foot = G(kn, 0, -41, 0);
    // the foot: the heel's block, the tarsals, five metatarsals fanning out, the toes
    facet(knob(2.6, 1, 0.9, 1.4, 0), kit.ball, foot, 1.0).position.set(0, -1.6, 1.6);
    for (let t = 0; t < 5; t++) { const a = (t - 2) * 0.12; const mt = facet(bone(8 - Math.abs(t - 1) * 0.8, 0.55, 1.3, 6), m, foot, 0.6); mt.rotation.set(HALF + 0.08, 0, 0); mt.rotation.y = a; mt.position.set((t - 2) * 1.5 * s, -2.6, -2.6); const to = facet(bone(2.6, 0.45, 1.2, 5), m, foot, 0.5); to.rotation.x = HALF; to.position.set((t - 2) * 1.6 * s, -3.0, -10.6 + Math.abs(t - 1) * 0.8); }
    legs[key] = { hip, kn, foot };
  });
  // the rag: a scrap of shroud over one shoulder, falling down the back
  const rag = new THREE.Mesh(ragGeo(16, 54, rnd), kit.cloth); chest.add(rag); outlineOf(rag, 1.4); rag.position.set(-9, 16, 5); rag.rotation.set(0.1, 0, -0.25);
  root.userData = { hips, spine, chest, neck, head, arms, legs, rag, phase: rnd() * 6.28, gait: 0.85 + rnd() * 0.3 };
  return root;
}
// a scrap of cloth hanging from its top edge: a plane with a torn hem and
// a few folds, down -y
// (gathered narrow where it hangs from, flaring toward a torn hem, in deep
// pleats that open as they fall: a straight-sided scrap with shallow folds
// read as a plank strapped on)
export function ragGeo(w, h, rnd) {
  const g = new THREE.PlaneGeometry(w, h, 10, 16); g.translate(0, -h / 2, 0);
  const p = g.attributes.position, ph = rnd() * 6, tear = [];
  for (let i = 0; i <= 10; i++) tear.push((i % 2 ? 0.1 : 0.02) + rnd() * 0.12);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), k = -y / h, u = x / w + 0.5;
    const xx = x * (0.4 + 0.75 * k);
    let yy = y;
    if (k > 0.8) { const j = Math.round(u * 10); yy += tear[j] * h * (k - 0.8) / 0.2; }
    p.setXYZ(i, xx, yy, Math.sin(u * PI * 3.2 + ph + k * 1.5) * (0.8 + 4.2 * k) + Math.sin(k * 7 + ph) * 1.2 * k);
  }
  g.computeVertexNormals();
  return g;
}
