// CLOTH: a snug garment's front panel over the fork, fitted each frame to the
// body under it - the lab's build men only (figure.mjs `dress()`; the valley
// never builds one).
//
// No bounding shape stands in for what is under the cloth. Each frame the
// panel takes the real meshes it covers - the anatomy's pieces where the
// physics (flesh.mjs) has just put them, the thighs and the hip sleeves as
// the pose has bent them, the brief it grows out of - and draws them into a
// depth map in the panel's own frame (an orthographic raster: for every cell,
// how far forward the front-most surface stands, and what tissue it is). So
// the cloth follows the body's own surfaces and moves with them, piece by
// piece, with no skinning weights to keep in step: the rig is a hierarchy of
// groups, and the panel reads where its meshes are.
//
// Then the cloth is solved over that map as a membrane, one height per cell
// along the panel's normal:
//   - it never goes inside what is under it: at least the fabric's thickness
//     over the body, and a hair over the brief it lies on;
//   - cling pulls it down onto what is under it (a clingy knit vacuum-seals:
//     each piece reads on its own);
//   - stiffness pulls it toward its neighbours (a stiff weave bridges the
//     hollows between the pieces, a smooth mound over them);
//   - where nothing is under it but the brief, it tucks just under the brief,
//     so it grows out of the brief's front with no edge; over a bare thigh
//     it goes in under the skin (its leg opening); where nothing at all, it
//     falls back.
// Nothing under it, nothing shown: the panel has no shape of its own to hold.
//
// Tissue, read from each mesh's `userData.tissue` (?? keeps rigid's 0):
//   RIGID (0)  bone, a hard edge: taken crisp - the cloth is never allowed to
//              press it, and it is never blurred
//   SOFT (1)   flesh, fat, muscle, the anatomy: the cloth's pressure (cling
//              against stiffness) presses it a little flatter and spreads
//              what it pushes aside round it - a Gaussian spread, so the
//              volume under the cloth is kept, not lost
// Garments (`FABRIC` in figure.mjs) give cling, stiff and thick (cm).
import * as THREE from '../vendor/three/three.module.js';
import { outlineOf } from './burin.mjs';

export const TISSUE = { RIGID: 0, SOFT: 1 };
// (?? not ||: a rigid 0 is a value, not a missing one)
export const tissueOf = m => (m.userData.tissue ?? TISSUE.SOFT);

const NONE = -1e9;
const CELL = 0.8;        // cm a cell
const ITER = 36;         // membrane passes a frame (warm-started)
const LAYER_GAP = 0.12;  // over the brief it lies on
const TUCK = 0.45;       // under the brief's front where only the brief is there
const _m = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _v = new THREE.Vector3();

// spec: { hips, pouch, mat, fabric: { cling, stiff, thick }, metric: [mu, mv],
//   frame: () => { O, ex, ey, ez, x0, x1, y0, y1 } (hips-local; recomputed on refit),
//   bodies: () => [mesh], layers: () => [mesh], outline }
export function makePanel(spec) {
  const P = { spec, mesh: null, nx: 0, ny: 0 };
  let F = null, h = null, lower = null, target = null, anat = null, body = null, layer = null, soft = null, tmp = null;

  function alloc() {
    F = spec.frame();
    P.nx = Math.max(4, Math.ceil((F.x1 - F.x0) / CELL)); P.ny = Math.max(4, Math.ceil((F.y1 - F.y0) / CELL));
    const n = (P.nx + 1) * (P.ny + 1);
    h = new Float32Array(n); lower = new Float32Array(n); target = new Float32Array(n);
    anat = new Float32Array(n); body = new Float32Array(n); layer = new Float32Array(n); soft = new Float32Array(n); tmp = new Float32Array(n);
    // the mesh: a grid of the cells' corners, its UVs in cm (the hatch the same
    // density as the brief's), laid each update along the panel's normal
    const pos = new Float32Array(n * 3), uv = [], idx = [];
    const [mu, mv] = spec.metric;
    for (let j = 0; j <= P.ny; j++) for (let i = 0; i <= P.nx; i++) uv.push((F.x0 + i * CELL) * mu, (F.y0 + j * CELL) * mv);
    for (let j = 0; j < P.ny; j++) for (let i = 0; i < P.nx; i++) { const a = j * (P.nx + 1) + i, b = a + 1, c = a + P.nx + 1, d = c + 1; idx.push(a, b, c, b, d, c); }   // (wound to face out along ez)
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    if (P.mesh) { P.mesh.geometry.dispose(); P.mesh.geometry = geo; P.mesh.children.forEach(c => { if (c.userData.outline) c.geometry = geo; }); }
    else {
      P.mesh = new THREE.Mesh(geo, spec.mat); P.mesh.frustumCulled = false; P.mesh.userData.clothPanel = true;
      spec.hips.add(P.mesh);
      const o = outlineOf(P.mesh, spec.outline || 1.2); o.frustumCulled = false;
    }
    P.fresh = true;
  }

  // draw a mesh's triangles into a channel (max forward depth per cell)
  function raster(mesh, ch, tissueCh) {
    const g = mesh.geometry, pa = g.attributes.position; if (!pa) return;
    _m.multiplyMatrices(_inv, mesh.matrixWorld);
    const e = _m.elements, ix = g.index ? g.index.array : null, count = ix ? ix.length : pa.count;
    const rigid = tissueOf(mesh) === TISSUE.RIGID;
    const W = P.nx + 1, x0 = F.x0, y0 = F.y0, nx = P.nx, ny = P.ny;
    const X = [0, 0, 0], Y = [0, 0, 0], Z = [0, 0, 0];
    for (let t = 0; t + 2 < count; t += 3) {
      for (let k = 0; k < 3; k++) {
        const vi = ix ? ix[t + k] : t + k, px = pa.getX(vi), py = pa.getY(vi), pz = pa.getZ(vi);
        X[k] = ((e[0] * px + e[4] * py + e[8] * pz + e[12]) - x0) / CELL;
        Y[k] = ((e[1] * px + e[5] * py + e[9] * pz + e[13]) - y0) / CELL;
        Z[k] = e[2] * px + e[6] * py + e[10] * pz + e[14];
      }
      let i0 = Math.ceil(Math.min(X[0], X[1], X[2])), i1 = Math.floor(Math.max(X[0], X[1], X[2]));
      let j0 = Math.ceil(Math.min(Y[0], Y[1], Y[2])), j1 = Math.floor(Math.max(Y[0], Y[1], Y[2]));
      if (i1 < 0 || j1 < 0 || i0 > nx || j0 > ny) continue;
      i0 = Math.max(0, i0); j0 = Math.max(0, j0); i1 = Math.min(nx, i1); j1 = Math.min(ny, j1);
      const d = (Y[1] - Y[2]) * (X[0] - X[2]) + (X[2] - X[1]) * (Y[0] - Y[2]); if (Math.abs(d) < 1e-9) continue;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const a = ((Y[1] - Y[2]) * (i - X[2]) + (X[2] - X[1]) * (j - Y[2])) / d;
        const b = ((Y[2] - Y[0]) * (i - X[2]) + (X[0] - X[2]) * (j - Y[2])) / d, c = 1 - a - b;
        if (a < -1e-4 || b < -1e-4 || c < -1e-4) continue;
        const z = a * Z[0] + b * Z[1] + c * Z[2], q = j * W + i;
        if (z > ch[q]) { ch[q] = z; if (tissueCh) tissueCh[q] = rigid ? 0 : 1; }
      }
    }
  }

  // one pass of a 3x3 Gaussian over a channel (cells with nothing read as 0)
  function blur(src, dst) {
    const W = P.nx + 1, H = P.ny + 1, k = [1, 2, 1];
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      let s = 0, w = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
        const kw = k[di + 1] * k[dj + 1], v = src[jj * W + ii]; s += kw * (v > NONE / 2 ? Math.max(0, v) : 0); w += kw;
      }
      dst[j * W + i] = s / w;
    }
  }

  P.update = function () {
    if (!F) alloc();
    const { hips } = spec, fab = spec.fabric;
    hips.updateMatrixWorld(true);
    // the panel's frame in the world: hips' world x (O, ex, ey, ez); its inverse takes a mesh into it
    _m.makeBasis(F.ex, F.ey, F.ez).setPosition(F.O);
    _inv.multiplyMatrices(hips.matrixWorld, _m).invert();
    anat.fill(NONE); body.fill(NONE); layer.fill(NONE); soft.fill(1);
    spec.pouch.updateMatrixWorld(true);
    spec.pouch.traverse(o => { if (o.isMesh && !o.userData.outline && o.userData.wire !== true) raster(o, anat, soft); });
    spec.bodies().forEach(m => raster(m, body, null));
    spec.layers().forEach(m => raster(m, layer, null));
    const W = P.nx + 1, n = h.length, thick = fab.thick;
    // soft tissue under the cloth's pressure: flatter, its volume spread round
    // it (the Gaussian keeps the sum); rigid stays crisp
    const press = Math.max(0, Math.min(0.6, fab.cling * (1 - fab.stiff) * 0.55));
    if (press > 0) {
      blur(anat, tmp); blur(tmp, target);
      for (let q = 0; q < n; q++) {
        if (soft[q] === 0 && anat[q] > NONE / 2) continue;            // rigid: as it is
        const a = anat[q] > NONE / 2 ? anat[q] : NONE, spread = target[q];
        if (a <= NONE / 2 && spread < 0.05) continue;
        const base = a > NONE / 2 ? a : 0;
        anat[q] = base + (spread - base) * press;
      }
    }
    // the floor under the cloth, and where it is pulled
    let deepest = Infinity;
    for (let q = 0; q < n; q++) {
      const a = anat[q], b = body[q], l = layer[q];
      let lo = NONE;
      if (a > NONE / 2) lo = Math.max(lo, a + thick);
      if (b > NONE / 2) lo = Math.max(lo, b + thick);
      if (l > NONE / 2) lo = Math.max(lo, l + LAYER_GAP);
      if (a > NONE / 2) { lower[q] = lo; target[q] = lo; }                   // over the anatomy: never inside it, or the thigh, or the brief
      else if (l > NONE / 2) { lower[q] = NONE; target[q] = l - TUCK; }     // only the brief: tuck under it
      else if (b > NONE / 2) { lower[q] = NONE; target[q] = b - TUCK * 2; } // only a thigh: in under its skin (the leg opening)
      else { lower[q] = NONE; target[q] = NaN; }                             // nothing: falls back (below)
      if (lo > NONE / 2) deepest = Math.min(deepest, lo);
    }
    const back = (isFinite(deepest) ? deepest : 0) - 2.0;
    for (let q = 0; q < n; q++) if (Number.isNaN(target[q])) target[q] = back;
    if (P.fresh) { h.set(target); P.fresh = false; }
    // the membrane: stiffness toward the neighbours, cling toward the target,
    // never under the floor; the edge rows held at their target
    const sw = 6 * fab.stiff, cw = Math.max(0.05, fab.cling), H = P.ny + 1;
    for (let it = 0; it < ITER; it++) {
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        const q = j * W + i;
        if (i === 0 || j === 0 || i === W - 1 || j === H - 1) { h[q] = Math.max(lower[q], target[q]); continue; }
        const avg = (h[q - 1] + h[q + 1] + h[q - W] + h[q + W]) * 0.25;
        h[q] = Math.max(lower[q], (sw * avg + cw * target[q]) / (sw + cw));
      }
    }
    // laid along the frame: hips-local O + X ex + Y ey + h ez
    const pos = P.mesh.geometry.attributes.position, O = F.O, ex = F.ex, ey = F.ey, ez = F.ez;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const q = j * W + i, X = F.x0 + i * CELL, Y = F.y0 + j * CELL, Z = h[q];
      pos.setXYZ(q, O.x + X * ex.x + Y * ey.x + Z * ez.x, O.y + X * ex.y + Y * ey.y + Z * ez.y, O.z + X * ex.z + Y * ey.z + Z * ez.z);
    }
    pos.needsUpdate = true;
    P.mesh.geometry.computeVertexNormals();
    P.mesh.geometry.computeBoundingSphere();
  };
  // the anatomy rebuilt (a slider): the window refitted to what is there now
  P.refit = function () { alloc(); P.update(); };
  P.dispose = function () { if (P.mesh) { P.mesh.geometry.dispose(); P.mesh.removeFromParent(); } };
  // (for the lab's checks: the solved heights and the floor, and the grid)
  P.debug = () => ({ nx: P.nx, ny: P.ny, h: Array.from(h || []), lower: Array.from(lower || []) });
  alloc();
  return P;
}
