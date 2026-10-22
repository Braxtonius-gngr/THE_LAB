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
import * as THREE from '../vendor/three/three.module.js';
import { outlineOf, haloOf } from './burin.mjs';

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
function facet(geo, m, parent, outline = 1.8, soft = SOFT) {
  const smooth = geo.index ? geo : weld(geo);
  smooth.computeVertexNormals();
  const flat = smooth.toNonIndexed();
  flat.computeVertexNormals();
  if (soft > 0) {
    // (the smooth normal of each point, carried over by position)
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
  const x = new THREE.Mesh(flat, m); parent.add(x);
  if (outline) { const o = outlineOf(x, outline); o.geometry = smooth; }
  if (HALO && outline >= 1.2) { const h = haloOf(x, HALO); h.geometry = smooth; }
  return x;
}

// points that coincide made one (an icosahedron comes with every face its
// own three points; welded, its hull is smooth)
function weld(geo) {
  const p = geo.attributes.position, t = geo.attributes.uv, map = new Map(), pos = [], uv = [], idx = [];
  for (let i = 0; i < p.count; i++) {
    const k = p.getX(i).toFixed(3) + ',' + p.getY(i).toFixed(3) + ',' + p.getZ(i).toFixed(3);
    let j = map.get(k);
    if (j == null) { j = pos.length / 3; map.set(k, j); pos.push(p.getX(i), p.getY(i), p.getZ(i)); if (t) uv.push(t.getX(i), t.getY(i)); }
    idx.push(j);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); if (t) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); return g;
}

// ------------------------------------------------------------ the loft
// A hull through cross-sections. Each section: { y, rx, rz, x, z, n,
// front, back, tilt } - an n-gon at height y (centre x, z), rx wide and
// rz deep, its front (−z) pulled out by `front` and its back by `back`
// (a belly, a buttock, a calf), tilted `tilt` about x. All sections share
// n. `arc` [a0, a1] cuts a part-hull (for a halved torso); `cap` closes the
// ends. Returns an indexed geometry (smooth normals; facet() flattens it).
function loft(secs, o = {}) {
  const n = o.n || secs[0].n || 10, a0 = o.arc ? o.arc[0] : 0, a1 = o.arc ? o.arc[1] : PI * 2, open = !!o.arc;
  const cols = open ? n + 1 : n;
  const pos = [], idx = [];
  const ringOf = (s) => {
    const r = [];
    for (let i = 0; i < cols; i++) {
      const a = a0 + (a1 - a0) * (open ? i / n : i / n) + (o.spin || 0);
      let x = Math.cos(a) * s.rx, z = Math.sin(a) * s.rz;
      // (-z is the front; a pull proportional to how far round the front we are)
      const fz = Math.max(0, -Math.sin(a)), bz = Math.max(0, Math.sin(a));
      z -= fz * fz * (s.front || 0); z += bz * bz * (s.back || 0);
      if (s.squash) z *= 1 - s.squash * Math.abs(Math.cos(a));
      let y = s.y;
      if (s.locks) y += (i % 2 ? 1 : -1) * s.locks * (0.6 + 0.4 * Math.sin(i * 2.3)) * (0.5 + 0.5 * fz);   // (a hem cut into locks, deepest at the brow)
      if (s.tilt) { const zz = z; z = zz * Math.cos(s.tilt); y += zz * Math.sin(s.tilt); }
      r.push([x + (s.x || 0), y, z + (s.z || 0)]);
    }
    return r;
  };
  const rings = secs.map(ringOf), uv = [];
  // (uv: u round the section, v along the hull - the UV plates hatch along the limb)
  let run = 0; const vAt = [0];
  for (let j = 1; j < secs.length; j++) { run += Math.hypot((secs[j].x || 0) - (secs[j - 1].x || 0), secs[j].y - secs[j - 1].y, (secs[j].z || 0) - (secs[j - 1].z || 0)); vAt.push(run); }
  // (`metric` [mu, mv]: the UV plate's own scale, undone - the uv is then
  // laid in world units round and along the hull, DENS lines a unit, so a
  // torso and a finger are hatched at the same pitch)
  const fq = o.metric ? 1.3 / (o.metric[2] || 1.3) : 1;
  const mu = o.metric ? DENS * fq / o.metric[0] : 1, mv = o.metric ? DENS * fq / o.metric[1] : 1;
  rings.forEach((r, j) => { const per = o.metric ? PI * (secs[j].rx + secs[j].rz) * (open ? (a1 - a0) / (PI * 2) : 1) : 1; r.forEach((p, i) => { pos.push(...p); uv.push(i / n * per * mu, (o.metric ? vAt[j] : (run ? vAt[j] / run : 0)) * mv); }); });
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
      const ci = pos.length / 3; pos.push(cx, s.y, cz); uv.push(0.5, k);
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
const knob = (r, sx = 1, sy = 1, sz = 1, detail = 1) => { const g = new THREE.IcosahedronGeometry(r, detail); g.scale(sx, sy, sz); return g; };

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
    // the nail: a flat plane at the tip
    const nail = facet(block(gr * 1.1, 1.4, 0.35, 0), kit.bone, at, 0); nail.position.set(0, 0.8, -gr * 0.8);
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
// Parameters (all set before render; rebuild() regenerates the mesh live):
//   size       overall scale of the whole system (1.5 = generous start)
//   length     the shaft's length (scale, gorge amplifies toward max)
//   girth      the shaft's thickness (scale, gorge amplifies toward max)
//   depth      how far the lobes push the shaft forward and out
//   fullnessL  left lobe fill 0–100 (0 = empty/slack, 100 = round/high)
//   fullnessR  right lobe fill 0–100
//   hangL      left lobe drop 0–100 (0 = tight/close, 100 = as low as sac allows)
//   hangR      right lobe drop 0–100
//   gorge      0–100: scales girth, length, size toward their max
//              (0 = natural soft resting state, NOT absent; 100 = full max)
//   sway       physics response amplitude (how freely it answers motion)
//
// Gravity comes from the pose: the `pouch` group's orientation is set by
// valley.mjs per figure (the sawyer hung head-down turns it end for end).
// `pouchSway` adds a small lagging pendulum on top — rotation only, never
// a reshape.
let ANATOMY = {
  size: 1.5, length: 1.5, girth: 1.5, depth: 1.2,
  fullnessL: 65, fullnessR: 60,
  hangL: 45, hangR: 55,
  gorge: 0, sway: 1.0
};
export function setAnatomy(o) { ANATOMY = Object.assign({}, ANATOMY, o); }
export function getAnatomy() { return Object.assign({}, ANATOMY); }

// (each man his own: the defaults varied per-man by a seeded rng)
function anatomyFor(rnd) {
  const v = (base, k) => base * (1 + (rnd() - 0.5) * k);
  const pct = (base, k) => Math.max(0, Math.min(100, base + (rnd() - 0.5) * k));
  return {
    size: v(ANATOMY.size, 0.16),
    length: v(ANATOMY.length, 0.24),
    girth: v(ANATOMY.girth, 0.2),
    depth: v(ANATOMY.depth, 0.3),
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
function sweep(pts, radii, n = 12, metric) {
  const c = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)));
  const S = Math.max(8, pts.length * 4), pos = [], uv = [], idx = [];
  const frames = c.computeFrenetFrames(S, false);
  const rAt = t => { const f = t * (radii.length - 1), i = Math.min(radii.length - 2, Math.floor(f)), k = f - i; return radii[i] * (1 - k) + radii[i + 1] * k; };
  const fq = metric ? 1.3 / (metric[2] || 1.3) : 1;
  const mu = metric ? DENS * fq / metric[0] : 1;
  const mv = metric ? DENS * fq / metric[1] : 1;
  // arc length along the curve for v-coordinate
  const vAt = [0]; let runLen = 0;
  for (let j = 1; j <= S; j++) { runLen += c.getPointAt(j / S).distanceTo(c.getPointAt((j - 1) / S)); vAt.push(runLen); }
  for (let j = 0; j <= S; j++) {
    const t = j / S, p = c.getPointAt(t), r = rAt(t), N = frames.normals[j], B = frames.binormals[j];
    const circ = 2 * PI * r;
    for (let i = 0; i < n; i++) {
      const a = i / n * PI * 2;
      pos.push(p.x + r * (Math.cos(a) * N.x + Math.sin(a) * B.x), p.y + r * (Math.cos(a) * N.y + Math.sin(a) * B.y), p.z + r * (Math.cos(a) * N.z + Math.sin(a) * B.z));
      uv.push(metric ? (i / n) * circ * mu : i / n, metric ? vAt[j] * mv : j / S);
    }
  }
  for (let j = 0; j < S; j++) for (let i = 0; i < n; i++) { const a = j * n + i, b = j * n + (i + 1) % n, c2 = a + n, d = b + n; idx.push(a, b, c2, b, d, c2); }
  [0, S].forEach((j, k) => { const p = c.getPointAt(k), ci = pos.length / 3; pos.push(p.x, p.y, p.z); uv.push(0.5, k ? vAt[S] * mv : 0); for (let i = 0; i < n; i++) { const a = j * n + i, b = j * n + (i + 1) % n; if (k) idx.push(ci, a, b); else idx.push(ci, b, a); } });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// resolve gorge: at 0% the params are natural (unchanged), at 100% they
// reach the max the creation params allow — gorge amplifies girth, length,
// size toward their ceiling, never past it
function applyGorge(a) {
  const g = Math.max(0, Math.min(100, a.gorge)) / 100;
  // the max each param can reach is 1.6× its creation value (the ceiling
  // is proportional to the man's own build, not a global constant)
  const amp = (base) => base * (1 + g * 0.6);
  return Object.assign({}, a, {
    size: amp(a.size),
    length: amp(a.length),
    girth: amp(a.girth)
  });
}

function buildAnatomy(pouch, m, a) {
  // clear any previous build (for live rebuild)
  while (pouch.children.length) {
    const c = pouch.children[0];
    if (c.geometry) c.geometry.dispose();
    pouch.remove(c);
  }
  const resolved = applyGorge(a);
  const g = new THREE.Group(); pouch.add(g); g.scale.setScalar(resolved.size);

  // the two lobes, each with its own fullness and hang
  // fullness 0–100: 0 slack/empty, 100 round/full
  // hang 0–100: 0 tight to the body, 100 as low as the sac loft allows
  const fL = a.fullnessL / 100, fR = a.fullnessR / 100;
  const hL = a.hangL / 100, hR = a.hangR / 100;
  // lobe radius grows with fullness; drop grows with hang and inversely
  // with fullness (a full lobe sits higher, an empty one sags)
  const lobeR = f => 2.7 + f * 0.7;
  const lobeDrop = (f, h) => 6.4 + (1 - f) * 2.6 + h * 3.2;
  const lobeSquash = f => 1.12 + (1 - f) * 0.2;
  const lrL = lobeR(fL), lrR = lobeR(fR);
  const dropL = lobeDrop(fL, hL), dropR = lobeDrop(fR, hR);
  const lobes = [
    { sx: -1, lr: lrL, drop: dropL, full: fL, squash: lobeSquash(fL) },
    { sx:  1, lr: lrR, drop: dropR, full: fR, squash: lobeSquash(fR) }
  ].map(({ sx, lr, drop, full, squash }) => {
    const lobe = facet(knob(lr, 1.0, squash, 1.0, 2), m, g, 0);
    lobe.position.set(sx * (lr * 0.62), -drop, -0.6);
    lobe.rotation.z = sx * 0.12;
    lobe.userData.pouch = true;
    return lobe;
  });

  // the sac loft wrapping both lobes: its profile follows whichever lobe
  // hangs lower (fruit in a mesh bag — the bag stretches to hold them)
  const avgLR = (lrL + lrR) / 2;
  const sacLow = -Math.max(dropL, dropR) - 0.45;
  facet(loft([
    { y: 1.0, rx: 2.0, rz: 1.6 },
    { y: -2.0, rx: avgLR * 1.15, rz: avgLR * 0.9 },
    { y: sacLow + avgLR * 0.3, rx: avgLR * 1.55, rz: avgLR * 0.95 },
    { y: sacLow - avgLR * 0.55, rx: avgLR * 1.25, rz: avgLR * 0.8 },
    { y: sacLow - avgLR * 0.95, rx: 0.3, rz: 0.3 }
  ], { n: 14, metric: UVM.linen }), m, g, 0).position.z = -0.4;

  // the shaft: attached at the root above the lobes, it falls forward
  // over their top and lies down the front of them, pushed out by their
  // depth; gorge amplifies its girth and length toward the max
  const L = 9.6 * resolved.length;
  const r = 1.75 * resolved.girth;
  const avgDrop = (dropL + dropR) / 2;
  const front = -0.6 - avgLR - r * 0.75 - (a.depth - 1) * 1.2;
  const pts = [
    [0, 0.6, -1.4],
    [0, -1.6, front * 0.62],
    [0, -avgDrop + avgLR * 0.55, front],
    [0, -avgDrop - avgLR * 0.2, front - 0.15],
    [0, -2.0 - L, front + 0.5]
  ];
  const sh = facet(sweep(pts, [r * 1.08, r, r * 0.98, r * 1.02, r * 0.55], 14, UVM.linen), m, g, 0);
  sh.userData.pouch = true;
  g.userData = { lobes, shaft: sh, sway: a.sway, params: a };
  return g;
}

// rebuild in place: tear down the old mesh and build with new params,
// keeping the pouch group's position and orientation (for the dev overlay)
export function rebuildAnatomy(fig, newParams) {
  const p = fig.userData.pouch; if (!p) return;
  const old = p.children[0] && p.children[0].userData.params;
  const a = Object.assign({}, old || anatomyFor(() => 0.5), newParams);
  // find the material from any existing mesh child
  let m = null;
  p.traverse(c => { if (!m && c.isMesh && c.material) m = c.material; });
  if (!m) return;
  buildAnatomy(p, m, a);
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

// ------------------------------------------------------------ a build
// o.build reshapes a man - the lab's lineup of bodies. The valley's men
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
function shapeTrunk(T, b) {
  const m = b.mass, u = b.muscle, a = b.age;
  return T.map(s => {
    if (s.rx < 0.5) return s;   // (the points the hull closes to stay points)
    const y = s.y, wb = bump(y, 10, 12), wc = bump(y, 38, 8), wh = bump(y, -2, 7), ws = bump(y, 47, 5), ww = bump(y, 18, 6), wn = bump(y, 54, 3);
    const up = Math.max(0, Math.min(1, (y - 24) / 32));
    return Object.assign({}, s, {
      rx: Math.max(0.6, s.rx + m * (4.2 * wb + 3.0 * wh + 2.4 * wc + 1.4 * wn) + u * (3.2 * ws + 1.4 * wc - 1.6 * ww + 1.2 * wn) + a * (1.2 * wb - 1.4 * ws)),
      rz: Math.max(0.6, s.rz + m * (2.6 * wb + 1.8 * wc + 1.8 * wh + 1.0 * wn) + u * (1.4 * wc + 0.8 * wn)),
      front: (s.front || 0) + m * (8.5 * wb + 1.4 * wc) + u * 0.9 * wc + a * (2.4 * wb - 0.8 * wc),
      back: (s.back || 0) + m * 1.8 * wh + a * 3.0 * up * up,
      z: (s.z || 0) - a * 5.0 * up * up
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
    { y: -9.0, rx: 9.0, rz: 6.0 },                              // the fork
    { y: -6.0, rx: 15.0, rz: 9.8, back: 2.2 },                  // the seat
    { y: 0.0, rx: 16.0, rz: 10.4, back: 1.6 },                  // the hips
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
    torso = facet(loft(T, { n: 16, metric: UVS }), skinUV, hips, 2);
    // the chest's two plates, the navel
    // (a build: the plates fuller with mass and muscle, falling with age)
    const pk = B ? 1 + 0.22 * B.mass + 0.18 * B.muscle - 0.1 * B.age : 1, py = B ? -2.4 * B.age - 1.2 * Math.max(0, B.mass) : 0, px = B ? 1 + 0.08 * (B.mass + B.muscle) : 1;
    [-1, 1].forEach(sx => { const pc = facet(knob(7.0 * pk, 1.1, 0.5, 0.22, 2), skin, hips, 0); pc.position.set(sx * 8.4 * px, 40.0 + py, -10.2 + dF(40)); pc.rotation.set(0.2, -sx * 0.3, sx * 0.1); disc(0.95, 8, kit.ink, hips, sx * 8 * px, 38.8 + py, -13.1 + dF(40), -sx * 0.5); });   // (the nipples a size up: at 0.7 they vanished at arm's length and the chest read as a doll's)
    disc(0.8, 6, kit.ink, hips, 0, 12, -11.3 + dF(12));
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
  if (o.shirt && !flayed) { const sh = facet(loft([...(o.hose ? [] : [{ y: -21.0, rx: 15.0 * fx, rz: 11.6 * fz }, { y: -15.0, rx: 15.6 * fx, rz: 11.6 * fz }, { y: -11.4, rx: 15.8 * fx, rz: 11.6 * fz }]), ...T.slice(3, 15).map(s => Object.assign({}, s, { rx: s.rx + 1.4, rz: s.rz + 1.2 })), { y: 56.2, rx: 6.6, rz: 6.0 }], { n: 16, metric: UVM.linen, cap: false }), kit.linen, hips, 1.5); sh.position.z = 0.2; }
  // (the cloth gathered closed under the fork: its flat end printed as a
  // black hole where a body bent or lying shows it from below)
  // (a breechcloth wrapped close round the hips and over the tops of the
  // thighs, drawn up between the legs, the thighs coming out of it: hung
  // loose and full as a skirt, rounded under, it read as a diaper with a
  // belly)
  // (in a darker cloth than the skin, with a rolled band at the waist, so
  // it reads as cloth and the man as clothed)
  else if (!flayed) {
    const bm = kit.breech || kit.linen;
    const band = facet(new THREE.TorusGeometry(16.6, 1.3, 6, 24), bm, hips, 1.0); band.position.y = 2.0; band.rotation.x = HALF; band.scale.set(fx, 0.66 * fz, 1);
    const lc = facet(loft([{ y: -21.0, rx: 0.2, rz: 0.2, z: -1.0 }, { y: -20.2, rx: 3.6, rz: 6.8, z: -1.0 }, { y: -18.4, rx: 8.6, rz: 10.2, z: -0.4 }, { y: -15.0, rx: 17.8, rz: 11.8 }, { y: -8, rx: 18.0, rz: 11.8 }, { y: -2, rx: 17.2, rz: 11.2 }, { y: 2.2, rx: 16.6, rz: 10.9 }], { n: 16, metric: UVM.linen }), bm, hips, 1.4); lc.scale.set(fx, 1, fz); }
  const neck = G(hips, 0, 55, B ? secAt(T, 54.0).z || 0 : 0);
  facet(tube(thick([[0, 5.6, 5.2], [5, 4.6, 4.3], [10.5, 4.4, 4.1]], kN), 12, { metric: UVS }), skinUV, neck, 1.2);
  const head = G(neck, 0, 11, 0);
  // (the head a size up on the body: at a ninth of the height it read as a doll's)
  const hd = buildHead(kit, o); hd.scale.setScalar(1.12); head.add(hd);
  const arms = {};
  [-1, 1].forEach(s => {
    const key = s < 0 ? 'r' : 'l';
    const sh = G(hips, s * (17.2 + (B ? (secAt(T, 47.5).rx - 19.4) * 0.9 : 0)), 47.5, B ? secAt(T, 47.5).z || 0 : 0);
    // the upper arm one hull: its head domed under the trunk's shoulder, so
    // the line runs on from the trapezius over the deltoid with no corner, the deltoid's and the biceps' swell, the taper to
    // the elbow, and ending in the elbow's ball - the forearm starts in the
    // same ball, so the joint bends with no seam (knobs laid over a joint
    // read as a ring, a mannequin's)
    facet(tube(thick([[0.2, 0.3], [-0.2, 3.4], [-1.4, 5.4], [-3.2, 6.4], [-7, 6.3, 6.0, 0.7], [-12, 5.6, 5.3, 0.6], [-19, 4.8, 4.6, 0.3], [-25, 4.2], ...ball(-30, 4.0, -1)], kA), 12, { metric: UVS }), skinUV, sh, 1.8);
    if (flayed) { seam([[s * 5.4, -4, -1.5], [s * 5.4, -14, -2.4], [s * 4.6, -26, -1.6]], sh, kit.ink, 0.4); seam([[0, -5, -5.9], [s * 1.5, -15, -5.6], [0, -25, -4.9]], sh, kit.ink, 0.35); }
    // (the sleeve domed over the shoulder, the cuff turned in)
    if (o.shirt && !flayed) facet(tube(thick([[2.4, 0.3], [1.8, 3.8], [0.4, 6.0], [-1.8, 7.2], [-6, 7.2], [-14, 6.8], [-20, 6.4], [-20.6, 4.9]], kA), 12, { metric: UVM.linen }), kit.linen, sh, 1.5);
    const el = G(sh, 0, -30, 0);
    // the forearm: out of the elbow's ball, its belly under the elbow,
    // narrowing to the wrist, closed inside the hand
    facet(tube(thick([...ball(0, 4.0, 1), [-5, 5.0, 4.5, 0, 0.7], [-12, 4.5, 4.0], [-20, 3.3, 2.7], [-25.5, 2.4, 1.9], [-27.2, 2.2, 1.7], [-28.0, 1.6, 1.3], [-28.4, 0.3]], kF), 12, { metric: UVS }), skinUV, el, 1.7);   // (the forearm's belly high under the elbow, narrowing hard to a slim wrist: one width end to end read as a mannequin's tube)
    if (flayed) seam([[s * 4.4, -3, -0.5], [s * 4.2, -12, -2.2], [s * 2.8, -24, -1.8]], el, kit.ink, 0.35);
    const hand = G(el, 0, -29, 0);
    const hh = buildHand(kit, s, skin, { curl: o.curl }); hand.add(hh); hand.userData.grip = hh.userData.grip;
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
    pouch = G(hips, 0, -8.6, (o.hose ? -7.2 : covered ? -8.8 : -10.0) + (B ? dF(-9.0) : 0));
    if (B && B.height !== 1) pouch.scale.setScalar(1 / B.height);
    const m = o.hose || covered ? kit.linen : (kit.breech || kit.linen);
    const anat = Object.assign(anatomyFor(rnd), o.anatomy || {});
    buildAnatomy(pouch, m, anat);
  }
  const legs = {};
  const legM = o.hose && !flayed ? kit.linen : skinUV, legS = o.hose && !flayed ? kit.linen : skin, legUV = o.hose && !flayed ? UVM.linen : UVS;
  [-1, 1].forEach(s => {
    const key = s < 0 ? 'r' : 'l';
    const hip = G(hips, s * (8.5 + (B ? (secAt(T, 0.0).rx - 16.0) * 0.5 : 0)), -4, 0);
    // the thigh: full under the hip, the quadriceps' swell, the knee's taper
    // (one hull from a dome inside the trunk to the knee's ball)
    facet(tube(thick([[7.5, 0.3], [6.4, 5.0], [3.8, 7.8], [0, 8.8, 9.4, 0, 1.2], [-10, 8.6, 9.0, 1.0], [-22, 7.4, 7.8, 0.8], [-34, 5.9, 6.4], [-40, 5.3, 5.5], ...ball(-44, 5.2, -1)], kT), 12, { metric: legUV }), legM, hip, 2);
    if (flayed) { seam([[s * 6.5, -2, -6.2], [s * 2.5, -16, -8.4], [-s * 3, -32, -6.4], [-s * 3.8, -40, -4.6]], hip, kit.ink, 0.45); seam([[-s * 7.8, -4, -2.6], [-s * 7.2, -20, -3.0], [-s * 5.8, -36, -2.4]], hip, kit.ink, 0.4); }
    const kn = G(hip, 0, -44, 0);
    // the shin: out of the knee's ball, the calf's swell behind, the ankle
    facet(tube(thick([...ball(0, 5.2, 1), [-7, 5.4, 6.2, 0, 2.6], [-14, 5.0, 5.6, 0, 1.8], [-24, 3.8, 4.0, 0, 0.4], [-33, 2.9, 3.0], [-37, 2.6, 2.8], [-39, 2.3], [-40.4, 0.3]], kS), 12, { metric: legUV }), legM, kn, 1.8);   // (the calf swelling high behind and falling away to a slim ankle)
    // the kneecap: a flat plate at the front of the knee's ball, riding on the shin
    facet(knob(2.6, 1.05, 1.2, 0.55, 1), legS, kn, 0).position.set(0, 1.0, -5.0 * kS);
    if (flayed) { seam([[s * 2.2, -3, -5.8], [s * 1.2, -16, -4.8], [s * 0.6, -34, -3.6]], kn, kit.ink, 0.4); seam([[0, -4, 8.2], [0, -14, 7.2], [0, -26, 5.0]], kn, kit.ink, 0.4); }
    const foot = G(kn, 0, -41, 0);
    // the foot: the heel's block, the instep's slope out to the toes
    facet(loft([{ y: -0.5, rx: 3.6, rz: 4.2, z: 0.6 }, { y: -3.0, rx: 4.6, rz: 6.0, z: -1.8, front: 1.0 }], { n: 8 }), skin, foot, 1.2);
    const inst = facet(loft([{ y: -1.0, rx: 3.4, rz: 2.6, z: -3.0 }, { y: -2.2, rx: 4.6, rz: 2.4, z: -8.0 }, { y: -3.2, rx: 5.2, rz: 1.2, z: -12.0 }], { n: 6 }), skin, foot, 1.0);
    for (let t = 0; t < 5; t++) { const toe = facet(tube([[0, 0.8], [-2.2 + t * 0.2, 0.7]], 5), skin, foot, 0.6); toe.position.set((t - 2) * 1.5 * s - s * 0.4, -2.9, -12.4 + Math.abs(t - 0.5) * 0.5); toe.rotation.x = HALF; }
    legs[key] = { hip, kn, foot };
  });
  if (B && B.height !== 1) root.scale.setScalar(B.height);
  root.userData = { hips, torso, neck, head, arms, legs, pouch, mouth: hd.userData.mouth, phase: rnd() * 6.28, build: B };
  SOFT = soft0;
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
