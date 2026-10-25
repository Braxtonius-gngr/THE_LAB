// CLOTH: a build's garments over the body under them - the lab's build men
// only (figure.mjs `dress()`; the valley never builds one).
//
// Every garment is its own mesh: no sheet is laid over another, so there is
// no edge, no stair-step and no shadow gap between two. The rig is a
// hierarchy of groups; a garment that spans joints (the brief: the hips and
// both thighs) is a skinned mesh on bones set in those joints (`skinTo`
// writes its weights), so it bends with a stride on the GPU, and the
// garment's own shape over the fork is the GPU cloth too
// (universal-cloth-material.mjs, driven each frame from the flesh's physics:
// figure.mjs `dress`). The loose pieces (the boxers' cup, a loincloth's
// front flap) are reshaped in place on the CPU (`liveMesh`, `makeDrape`).
// Each pose, after the pose and the flesh's physics have run (the lab:
// pose -> sleeves -> physics -> cloth), the cloth is driven from where the
// body is now - so it never runs a frame behind a bone.
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
//   RIGID (0)  bone, a hard edge (the kneecap)
//   SOFT (1)   flesh, fat, muscle, the anatomy
// (the GPU cloth's u_tissueType uses the same two values, and 2 for the
// hydrostatic tissue of the anatomy.) Garments (`FABRIC` in figure.mjs)
// give cling, stiff, thick (cm) and drape (cm).
import * as THREE from '../vendor/three/three.module.js';
import { outlineOf } from './burin.mjs';

export const TISSUE = { RIGID: 0, SOFT: 1 };
// (?? not ||: a rigid 0 is a value, not a missing one)
export const tissueOf = m => (m.userData.tissue ?? TISSUE.SOFT);

const STEP = 1 / 240;    // the cloth's inertia: its step (s)
const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _a = new THREE.Vector3();

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

// A garment's skin weights, from a function of its rest points: `weightAt`
// (x, y, z) gives each bone's share (any length, any scale); the four
// largest are kept, normalised, written as skinIndex / skinWeight. A point
// no bone claims goes to bone 0.
export function skinTo(geo, weightAt) {
  const p = geo.attributes.position, n = p.count, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const w = weightAt(p.getX(i), p.getY(i), p.getZ(i)), order = w.map((v, k) => [v, k]).sort((a, b) => b[0] - a[0]).slice(0, 4);
    let sum = 0; order.forEach(([v]) => { sum += Math.max(0, v); });
    for (let k = 0; k < 4; k++) { const o = order[k]; si[4 * i + k] = o ? o[1] : 0; sw[4 * i + k] = o && sum > 0 ? Math.max(0, o[0]) / sum : (k === 0 ? 1 : 0); }
  }
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  return geo;
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
