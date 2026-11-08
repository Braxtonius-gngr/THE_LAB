#!/usr/bin/env node
// Shape transfer: give one of our bodies the 52 ARKit blendshapes of another head.
//
//   node tools/face/transfer.mjs --from <head.glb> --to <body-id> [--tier desktop|mobile] [--out <file.glb>]
//   node tools/face/transfer.mjs --selftest --to dante          (a made-up source from Marco's own head)
//
// The source is any GLB whose head mesh carries ARKit-named morph targets (a Ready Player Me
// avatar exported with ?morphTargets=ARKit, a Faceit export of one of our own heads, ...). The
// target is a body from assets/bodies/bodies.json with its `face` anchors (eyes, brows, mouth,
// corners, chin - placed on lab/face.html). What happens:
//   1. landmarks on the source come from its own shapes (where eyeBlinkLeft moves vertices is the
//      left eye, mouthSmileLeft the left corner, jawOpen the chin, browInnerUp the inner brows);
//   2. the source is fitted onto the target by those pairs: both stand upright facing +z, so the fit
//      is a translation and a scale per axis in the body's own frame (no rotation to get wrong);
//   3. every target head vertex takes the delta of the nearest few source vertices, inverse-distance
//      weighted, fading to nothing past a radius and toward the neck seam;
//   4. the head (vertices weighted to the Head bone) is split into its own primitive, the shapes go on
//      it as sparse morph targets, and a new GLB is written. Nothing else in the file moves.
// Speech visemes (viseme_aa, viseme_PP, ... the Oculus 15) come along when the source has them.
// The face module (world/face.mjs) then drives the shapes; its skin path keeps the eyes.
// Normals are not morphed (lighting on a moved lip is a hair off; it is not worth the bytes).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const ARKIT = ['eyeBlinkLeft', 'eyeLookDownLeft', 'eyeLookInLeft', 'eyeLookOutLeft', 'eyeLookUpLeft', 'eyeSquintLeft', 'eyeWideLeft', 'eyeBlinkRight', 'eyeLookDownRight', 'eyeLookInRight', 'eyeLookOutRight', 'eyeLookUpRight', 'eyeSquintRight', 'eyeWideRight', 'jawForward', 'jawLeft', 'jawRight', 'jawOpen', 'mouthClose', 'mouthFunnel', 'mouthPucker', 'mouthLeft', 'mouthRight', 'mouthSmileLeft', 'mouthSmileRight', 'mouthFrownLeft', 'mouthFrownRight', 'mouthDimpleLeft', 'mouthDimpleRight', 'mouthStretchLeft', 'mouthStretchRight', 'mouthRollLower', 'mouthRollUpper', 'mouthShrugLower', 'mouthShrugUpper', 'mouthPressLeft', 'mouthPressRight', 'mouthLowerDownLeft', 'mouthLowerDownRight', 'mouthUpperUpLeft', 'mouthUpperUpRight', 'browDownLeft', 'browDownRight', 'browInnerUp', 'browOuterUpLeft', 'browOuterUpRight', 'cheekPuff', 'cheekSquintLeft', 'cheekSquintRight', 'noseSneerLeft', 'noseSneerRight', 'tongueOut'];

// ---------- arguments ----------
const args = process.argv.slice(2), opt = (k, d = null) => { const i = args.indexOf('--' + k); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : d; };
const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '../..');
const toId = opt('to'), tier = opt('tier', 'desktop'), selftest = !!opt('selftest'), fromPath = opt('from');
if (!toId || (!fromPath && !selftest)) { console.error('usage: transfer.mjs --from <head.glb> --to <body-id> [--tier desktop|mobile] [--out file.glb]   |   --selftest --to <body-id>'); process.exit(2); }
const bodies = JSON.parse(readFileSync(resolve(ROOT, 'assets/bodies/bodies.json'), 'utf8'));
const spec = bodies.find(b => b.id === toId); if (!spec) { console.error(`no body "${toId}" in bodies.json`); process.exit(2); }
if (!spec.face || !spec.face.eyeL) { console.error(`${toId} has no face anchors (place them on lab/face.html)`); process.exit(2); }
const outPath = resolve(ROOT, opt('out') || `tools/face/out/${toId}-${tier}.glb`);

// ---------- GLB in / out ----------
const CT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
function readGLB(path) {
  const buf = readFileSync(path);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`${path}: not a GLB`);
  const jl = buf.readUInt32LE(12), json = JSON.parse(buf.subarray(20, 20 + jl).toString());
  const bl = buf.readUInt32LE(20 + jl), bin = buf.subarray(28 + jl, 28 + jl + bl);
  return { json, bin };
}
// an accessor as a flat typed array (interleaved, normalized and sparse all handled)
function readAccessor(g, i) {
  const a = g.json.accessors[i], T = CT[a.componentType], n = NC[a.type], out = new T(a.count * n);
  if (a.bufferView != null) {
    const bv = g.json.bufferViews[a.bufferView], B = T.BYTES_PER_ELEMENT, stride = bv.byteStride || n * B, base = g.bin.byteOffset + (bv.byteOffset || 0) + (a.byteOffset || 0);
    const dv = new DataView(g.bin.buffer), get = { 5120: 'getInt8', 5121: 'getUint8', 5122: 'getInt16', 5123: 'getUint16', 5125: 'getUint32', 5126: 'getFloat32' }[a.componentType];
    for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) out[k * n + c] = dv[get](base + k * stride + c * B, true);
  }
  if (a.sparse) {
    const si = a.sparse.indices, sv = a.sparse.values, IT = CT[si.componentType];
    const ibv = g.json.bufferViews[si.bufferView], vbv = g.json.bufferViews[sv.bufferView];
    const idx = new IT(g.bin.buffer.slice(g.bin.byteOffset + (ibv.byteOffset || 0) + (si.byteOffset || 0), g.bin.byteOffset + (ibv.byteOffset || 0) + (si.byteOffset || 0) + a.sparse.count * IT.BYTES_PER_ELEMENT));
    const val = new T(g.bin.buffer.slice(g.bin.byteOffset + (vbv.byteOffset || 0) + (sv.byteOffset || 0), g.bin.byteOffset + (vbv.byteOffset || 0) + (sv.byteOffset || 0) + a.sparse.count * n * T.BYTES_PER_ELEMENT));
    for (let k = 0; k < a.sparse.count; k++) for (let c = 0; c < n; c++) out[idx[k] * n + c] = val[k * n + c];
  }
  const f = new Float32Array(out.length);
  if (a.normalized) { const m = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 }[a.componentType]; for (let k = 0; k < out.length; k++) f[k] = out[k] / m; return f; }
  for (let k = 0; k < out.length; k++) f[k] = out[k];
  return f;
}
// a glb with the original BIN plus whatever we append
class Out {
  constructor(g) { this.json = JSON.parse(JSON.stringify(g.json)); this.parts = [g.bin]; this.len = g.bin.byteLength; }
  pad() { const r = this.len % 4; if (r) { this.parts.push(Buffer.alloc(4 - r)); this.len += 4 - r; } }
  view(typed, target = null) { this.pad(); const b = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength); const bv = { buffer: 0, byteOffset: this.len, byteLength: b.byteLength }; if (target) bv.target = target; this.parts.push(b); this.len += b.byteLength; this.json.bufferViews.push(bv); return this.json.bufferViews.length - 1; }
  accessor(def) { this.json.accessors.push(def); return this.json.accessors.length - 1; }
  write(path) {
    this.pad(); this.json.buffers = [{ byteLength: this.len }];
    let js = Buffer.from(JSON.stringify(this.json)); while (js.length % 4) js = Buffer.concat([js, Buffer.from(' ')]);
    const bin = Buffer.concat(this.parts);
    const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
    const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
    const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
    mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, Buffer.concat([head, jh, js, bh, bin]));
  }
}

// ---------- small matrix helpers (column-major 4x4, like glTF) ----------
const I4 = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function mul(a, b) { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; }
function trs(n) {
  if (n.matrix) return n.matrix.slice();
  const [x, y, z, w] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1], [tx, ty, tz] = n.translation || [0, 0, 0];
  const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  return [(1 - 2 * (yy + zz)) * sx, 2 * (xy + wz) * sx, 2 * (xz - wy) * sx, 0, 2 * (xy - wz) * sy, (1 - 2 * (xx + zz)) * sy, 2 * (yz + wx) * sy, 0, 2 * (xz + wy) * sz, 2 * (yz - wx) * sz, (1 - 2 * (xx + yy)) * sz, 0, tx, ty, tz, 1];
}
function nodeWorld(g, idx) { const parent = new Map(); g.json.nodes.forEach((n, i) => (n.children || []).forEach(c => parent.set(c, i))); let m = I4(), cur = idx; while (cur != null) { m = mul(trs(g.json.nodes[cur]), m); cur = parent.get(cur); } return m; }
const xformP = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
const xformV = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2], m[1] * p[0] + m[5] * p[1] + m[9] * p[2], m[2] * p[0] + m[6] * p[1] + m[10] * p[2]];
function inv3(m) {   // inverse of the upper 3x3 (as a 4x4 with no translation), for vectors going back to vertex space
  const a = m[0], b = m[4], c = m[8], d = m[1], e = m[5], f = m[9], g = m[2], h = m[6], i = m[10];
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
  const o = I4(); o[0] = A / det; o[4] = -(b * i - c * h) / det; o[8] = (b * f - c * e) / det; o[1] = B / det; o[5] = (a * i - c * g) / det; o[9] = -(a * f - c * d) / det; o[2] = C / det; o[6] = -(a * h - b * g) / det; o[10] = (a * e - b * d) / det; return o;
}

// ---------- a mesh with its shapes, in model space (y up, +z the face, metres) ----------
function loadHead(g) {
  // the mesh that carries morph targets with ARKit names (or the biggest one, for a target body)
  let pick = null;
  g.json.meshes.forEach((m, mi) => m.primitives.forEach((p, pi) => { const names = m.extras?.targetNames || []; const score = (p.targets ? 1e6 : 0) + ARKIT.filter(n => names.includes(n)).length * 1e3 + g.json.accessors[p.attributes.POSITION].count; if (!pick || score > pick.score) pick = { mi, pi, score }; }));
  const m = g.json.meshes[pick.mi], p = m.primitives[pick.pi], nodeIdx = g.json.nodes.findIndex(n => n.mesh === pick.mi), M = nodeIdx >= 0 ? nodeWorld(g, nodeIdx) : I4();
  const pos = readAccessor(g, p.attributes.POSITION), n = pos.length / 3, P = new Float32Array(pos.length);
  for (let i = 0; i < n; i++) { const q = xformP(M, [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]); P[i * 3] = q[0]; P[i * 3 + 1] = q[1]; P[i * 3 + 2] = q[2]; }
  const shapes = {}; const names = m.extras?.targetNames || [];
  (p.targets || []).forEach((t, ti) => { if (t.POSITION == null) return; const d = readAccessor(g, t.POSITION), D = new Float32Array(d.length); for (let i = 0; i < n; i++) { const q = xformV(M, [d[i * 3], d[i * 3 + 1], d[i * 3 + 2]]); D[i * 3] = q[0]; D[i * 3 + 1] = q[1]; D[i * 3 + 2] = q[2]; } shapes[names[ti] || `target${ti}`] = D; });
  // which way each vertex faces (model space): the transfer only matches front-facing skin, never the
  // inside of a mouth or the back of a lip
  let N = null; if (p.attributes.NORMAL != null) { const nr = readAccessor(g, p.attributes.NORMAL); N = new Float32Array(nr.length); for (let i = 0; i < n; i++) { const q = xformV(M, [nr[i * 3], nr[i * 3 + 1], nr[i * 3 + 2]]), l = Math.hypot(q[0], q[1], q[2]) || 1; N[i * 3] = q[0] / l; N[i * 3 + 1] = q[1] / l; N[i * 3 + 2] = q[2] / l; } }
  return { g, mi: pick.mi, pi: pick.pi, prim: p, nodeIdx, M, pos, P, N, n, shapes, names };
}
// where a shape moves things: the magnitude-weighted centroid of its deltas (over a vertex subset)
function centroid(head, shape, keep = null) {
  const D = head.shapes[shape]; if (!D) return null; let w = 0, x = 0, y = 0, z = 0;
  for (let i = 0; i < head.n; i++) { if (keep && !keep(i)) continue; const l = Math.hypot(D[i * 3], D[i * 3 + 1], D[i * 3 + 2]); if (l < 1e-5) continue; w += l; x += head.P[i * 3] * l; y += head.P[i * 3 + 1] * l; z += head.P[i * 3 + 2] * l; }
  return w ? [x / w, y / w, z / w] : null;
}

// ---------- the target body ----------
const tgtG = readGLB(resolve(ROOT, 'assets/bodies', spec[tier] || spec.desktop));
const tgt = loadHead(tgtG);
const tj = tgtG.json, tprim = tgt.prim;
// head weight per vertex (how much the Head bone owns it)
const skin = tj.skins[tj.nodes[tgt.nodeIdx].skin], headJoint = skin.joints.findIndex(j => /^(mixamorig:?)?Head$/i.test(tj.nodes[j].name || ''));
if (headJoint < 0) { console.error('no Head bone on the target'); process.exit(1); }
const JI = readAccessor(tgtG, tprim.attributes.JOINTS_0), JW = readAccessor(tgtG, tprim.attributes.WEIGHTS_0);
const headW = new Float32Array(tgt.n); for (let i = 0; i < tgt.n; i++) for (let c = 0; c < 4; c++) if (JI[i * 4 + c] === headJoint) headW[i] += JW[i * 4 + c];
const isHead = i => headW[i] >= 0.5;
const headIdx = []; for (let i = 0; i < tgt.n; i++) if (isHead(i)) headIdx.push(i);
const tInv = inv3(tgt.M);   // model-space vector -> target vertex space
const A = spec.face, anchor = k => A[k] ? xformP(tgt.M, A[k]) : null;   // anchors are kept in vertex space; take them to model space
const mid = (a, b) => a && b ? a.map((v, k) => (v + b[k]) / 2) : a || b;   // (a browInnerUp centroid sits mid-way along the inner half of the brow)
const tgtLm = { eyeL: anchor('eyeL'), eyeR: anchor('eyeR'), browLin: mid(anchor('browLin'), anchor('browL')), browRin: mid(anchor('browRin'), anchor('browR')), mouthL: anchor('mouthL'), mouthR: anchor('mouthR'), mouth: anchor('mouth'), chin: anchor('chin') };

// ---------- the source head ----------
let src;
if (selftest) {
  // a made-up source: Marco's own head with a few shapes drawn by hand around his anchors, so the
  // whole path (landmarks from shapes, fit, transfer, split, write) is exercised with no file from outside
  const mspec = bodies.find(b => b.id === 'adult-base-01'), mg = readGLB(resolve(ROOT, 'assets/bodies', mspec.desktop)), m = loadHead(mg);
  const a = k => xformP(m.M, mspec.face[k]), up = [0, 1, 0];
  const bump = (centre, radius, vec, pred = null) => { const D = new Float32Array(m.n * 3); for (let i = 0; i < m.n; i++) { const dx = m.P[i * 3] - centre[0], dy = m.P[i * 3 + 1] - centre[1], dz = m.P[i * 3 + 2] - centre[2]; const r = Math.hypot(dx, dy, dz) / radius; if (r >= 1 || (pred && !pred(i))) continue; const f = (1 - r * r) ** 2; D[i * 3] = vec[0] * f; D[i * 3 + 1] = vec[1] * f; D[i * 3 + 2] = vec[2] * f; } return D; };
  const eL = a('eyeL'), eR = a('eyeR'), bL = a('browLin'), bR = a('browRin'), cL = a('mouthL'), cR = a('mouthR'), ch = a('chin'), mo = a('mouth');
  m.shapes = {
    eyeBlinkLeft: bump(eL, 0.016, [0, -0.004, 0], i => m.P[i * 3 + 1] > eL[1] - 0.002), eyeBlinkRight: bump(eR, 0.016, [0, -0.004, 0], i => m.P[i * 3 + 1] > eR[1] - 0.002),
    browInnerUp: (() => { const d1 = bump(bL, 0.014, [0, 0.006, 0]), d2 = bump(bR, 0.014, [0, 0.006, 0]); for (let i = 0; i < d1.length; i++) d1[i] += d2[i]; return d1; })(),
    mouthSmileLeft: bump(cL, 0.014, [0.003, 0.004, 0]), mouthSmileRight: bump(cR, 0.014, [-0.003, 0.004, 0]),
    jawOpen: (() => { const D = new Float32Array(m.n * 3); for (let i = 0; i < m.n; i++) { const y = m.P[i * 3 + 1] - mo[1], x = m.P[i * 3] - mo[0], z = m.P[i * 3 + 2] - mo[2]; if (y > 0.002 || y < -0.08 || Math.abs(x) > 0.07 || z < -0.08) continue; const below = Math.min(1, -(y - 0.002) / 0.006), lat = 1 - Math.min(1, Math.max(0, (Math.abs(x) - 0.035) / 0.03)); D[i * 3 + 1] = -0.012 * below * lat; } return D; })(),
  };
  m.names = Object.keys(m.shapes); src = m;
} else {
  src = loadHead(readGLB(resolve(fromPath)));
  if (!Object.keys(src.shapes).some(n => ARKIT.includes(n))) { console.error('the source has no ARKit-named morph targets (check extras.targetNames)'); process.exit(1); }
}
const sN = src.n;
// the source's landmarks, from where its own shapes move things
const left = i => src.P[i * 3] > 0, right = i => src.P[i * 3] < 0;
const srcLm = {
  eyeL: centroid(src, 'eyeBlinkLeft'), eyeR: centroid(src, 'eyeBlinkRight'),
  browLin: centroid(src, 'browInnerUp', left), browRin: centroid(src, 'browInnerUp', right),
  mouthL: centroid(src, 'mouthSmileLeft'), mouthR: centroid(src, 'mouthSmileRight'),
  chin: centroid(src, 'jawOpen'),
};
if (srcLm.mouthL && srcLm.mouthR) srcLm.mouth = srcLm.mouthL.map((v, k) => (v + srcLm.mouthR[k]) / 2);
// the source's "chin" from jawOpen is the whole lower face's centroid: pair it with the target's mouth-to-chin midpoint
const tgtChin = tgtLm.chin && tgtLm.mouth ? tgtLm.mouth.map((v, k) => (v + tgtLm.chin[k]) / 2) : tgtLm.chin;
const pairs = []; for (const k of Object.keys(srcLm)) if (srcLm[k] && (k === 'chin' ? tgtChin : tgtLm[k])) pairs.push([srcLm[k], k === 'chin' ? tgtChin : tgtLm[k], k]);
if (pairs.length < 4) { console.error('not enough landmark pairs to fit:', pairs.map(p => p[2])); process.exit(1); }

// ---------- the fit: per axis, target = s * source + t (least squares over the pairs) ----------
// (the chin pair is only a check: a jawOpen centroid sits wherever the source's jaw happens to be weighted)
const fitPairs = pairs.filter(p => p[2] !== 'chin');
const fit = [0, 1, 2].map(ax => {
  const xs = fitPairs.map(p => p[0][ax]), ys = fitPairs.map(p => p[1][ax]), n = xs.length, mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n;
  let num = 0, den = 0; for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  const s = Math.max(0.5, Math.min(2, den > 1e-9 ? num / den : 1)); return { s, t: my - s * mx };
});
// depth has no spread to fit a scale to (every landmark sits on the front of the face): the width
// scale serves, and the offset comes from the face landmarks alone (the chin's depth is the least sure)
{ const face = pairs.filter(p => p[2] !== 'chin'); const mz = face.reduce((a, p) => a + p[0][2], 0) / face.length, tz = face.reduce((a, p) => a + p[1][2], 0) / face.length; fit[2] = { s: fit[0].s, t: tz - fit[0].s * mz }; }
const mapP = p => [fit[0].s * p[0] + fit[0].t, fit[1].s * p[1] + fit[1].t, fit[2].s * p[2] + fit[2].t], mapV = v => [fit[0].s * v[0], fit[1].s * v[1], fit[2].s * v[2]];
// faces differ in more than size (wider-set eyes, a narrower mouth): after the stretch, a smooth local
// warp moves each landmark the rest of the way onto the target's, fading out away from them
const WARP = pairs.filter(p => p[2] !== 'chin').map(p => { const q = mapP(p[0]); return { at: q, r: [p[1][0] - q[0], p[1][1] - q[1], p[1][2] - q[2]] }; }), SIG = 0.016;
const warp = q => { let w = 0, x = 0, y = 0, z = 0; for (const L of WARP) { const d2 = (q[0] - L.at[0]) ** 2 + (q[1] - L.at[1]) ** 2 + (q[2] - L.at[2]) ** 2, g = Math.exp(-d2 / (2 * SIG * SIG)); w += g; x += g * L.r[0]; y += g * L.r[1]; z += g * L.r[2]; } const k = 1 / (w + 0.08); return [q[0] + x * k * Math.min(1, w / 0.3 + 0.0), q[1] + y * k * Math.min(1, w / 0.3), q[2] + z * k * Math.min(1, w / 0.3)]; };
const SP = new Float32Array(sN * 3); for (let i = 0; i < sN; i++) { const q = warp(mapP([src.P[i * 3], src.P[i * 3 + 1], src.P[i * 3 + 2]])); SP[i * 3] = q[0]; SP[i * 3 + 1] = q[1]; SP[i * 3 + 2] = q[2]; }
if (opt('debug')) { console.log('fit', JSON.stringify(fit)); for (const [a, b, k] of pairs) console.log(`  ${k}: mapped ${mapP(a).map(x => (x * 1000).toFixed(0)).join(',')} vs target ${b.map(x => (x * 1000).toFixed(0)).join(',')}`); }
const resid = pairs.map(p => { const q = warp(mapP(p[0])); return `${p[2]} ${(Math.hypot(q[0] - p[1][0], q[1] - p[1][1], q[2] - p[1][2]) * 1000).toFixed(1)} mm`; });
if (opt('debug')) { const mm = v => v.map(x => (x * 1000).toFixed(0)).join(','); console.log('target node matrix diag', [tgt.M[0], tgt.M[5], tgt.M[10]].map(v => v.toFixed(3)).join(' '), 'source', [src.M[0], src.M[5], src.M[10]].map(v => v.toFixed(3)).join(' ')); for (const [a, b, k] of pairs) console.log(`  ${k}: source ${mm(a)} -> target ${mm(b)} mm`); }
console.log(`fit: scale x ${fit[0].s.toFixed(3)} y ${fit[1].s.toFixed(3)} z ${fit[2].s.toFixed(3)}; landmark residuals: ${resid.join(', ')}`);

// ---------- transfer: each target head vertex takes the nearest source vertices' deltas ----------
// a grid over the aligned source for the nearest-neighbour search
const CELL = 0.01; const grid = new Map(); const key = (x, y, z) => `${Math.floor(x / CELL)},${Math.floor(y / CELL)},${Math.floor(z / CELL)}`;
for (let i = 0; i < sN; i++) { const k = key(SP[i * 3], SP[i * 3 + 1], SP[i * 3 + 2]); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(i); }
const RADIUS = 0.012, K = 4;
// the lip line (in aligned space it is the target's): a curve through the corners and the centre. Near the
// mouth a vertex only takes deltas from the same lip - upper from upper, lower from lower - so the lips part
// cleanly instead of averaging into a smear across the line
const LC = tgtLm.mouthL && tgtLm.mouthR && tgtLm.mouth ? { l: tgtLm.mouthL, r: tgtLm.mouthR, c: tgtLm.mouth, hw: Math.abs(tgtLm.mouthL[0] - tgtLm.mouthR[0]) / 2 } : null;
const lipSide = (x, y) => { if (!LC) return 0; const cx = (LC.l[0] + LC.r[0]) / 2, u = (x - cx) / (LC.hw || 1); if (Math.abs(u) > 1.4) return 0; const yc = LC.c[1], ye = (LC.l[1] + LC.r[1]) / 2, ly = yc + (ye - yc) * Math.min(1, u * u); const d = y - ly; return Math.abs(d) > 0.018 ? 0 : d >= 0 ? 1 : -1; };
const srcSide = new Int8Array(sN); for (let i = 0; i < sN; i++) srcSide[i] = lipSide(SP[i * 3], SP[i * 3 + 1]);
const front = i => !src.N || src.N[i * 3 + 2] > 0.1;
let side = 0;   // (the side of the lip line the target vertex being matched is on, set per vertex)
function nearest(x, y, z) {
  const out = []; const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL), cz = Math.floor(z / CELL);
  for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) for (let dz = -4; dz <= 4; dz++) { const a = grid.get(`${cx + dx},${cy + dy},${cz + dz}`); if (!a) continue; for (const i of a) { const d = Math.hypot(SP[i * 3] - x, SP[i * 3 + 1] - y, (SP[i * 3 + 2] - z) * 0.4); if (d < RADIUS && front(i) && !(side && srcSide[i] && srcSide[i] !== side)) out.push([d, i]); } }
  out.sort((a, b) => a[0] - b[0]); return out.slice(0, K);
}
// the 52 ARKit shapes, plus the 15 Oculus speech visemes (viseme_aa, viseme_PP, ...) when the source has them
const shapeNames = (selftest ? src.names : [...ARKIT, ...Object.keys(src.shapes).filter(n => /^viseme_/.test(n))]).filter(n => src.shapes[n]);
const H = headIdx.length, deltas = {}; for (const n of shapeNames) deltas[n] = new Float32Array(H * 3);
let touched = 0;
for (let h = 0; h < H; h++) {
  const i = headIdx[h], x = tgt.P[i * 3], y = tgt.P[i * 3 + 1], z = tgt.P[i * 3 + 2];
  side = (!tgt.N || tgt.N[i * 3 + 2] > -0.2) ? lipSide(x, y) : 0;
  const nn = (tgt.N && tgt.N[i * 3 + 2] < -0.3) ? [] : nearest(x, y, z); if (!nn.length) continue; touched++;
  const seam = Math.min(1, Math.max(0, (headW[i] - 0.5) / 0.45));   // fades to nothing at the neck seam
  let wsum = 0; const ws = nn.map(([d]) => { const w = 1 / (d + 0.0015); wsum += w; return w; });
  for (const n of shapeNames) {
    const D = src.shapes[n]; let vx = 0, vy = 0, vz = 0;
    nn.forEach(([, j], k) => { const w = ws[k] / wsum; vx += D[j * 3] * w; vy += D[j * 3 + 1] * w; vz += D[j * 3 + 2] * w; });
    const v = mapV([vx, vy, vz]), q = xformV(tInv, v);   // scaled with the fit, then back into the target's vertex space
    deltas[n][h * 3] = q[0] * seam; deltas[n][h * 3 + 1] = q[1] * seam; deltas[n][h * 3 + 2] = q[2] * seam;
  }
}
console.log(`target head: ${H} of ${tgt.n} vertices (Head bone >= 0.5); ${touched} within ${RADIUS * 1000} mm of the aligned source; ${shapeNames.length} shapes`);

// ---------- split the head off and write the shapes on it ----------
const out = new Out(tgtG);
const IDX = readAccessor(tgtG, tprim.indices), tri = IDX.length / 3, remap = new Int32Array(tgt.n).fill(-1); headIdx.forEach((i, h) => { remap[i] = h; });
const headTris = [], bodyTris = [];
for (let t = 0; t < tri; t++) { const a = IDX[t * 3], b = IDX[t * 3 + 1], c = IDX[t * 3 + 2]; if (remap[a] >= 0 && remap[b] >= 0 && remap[c] >= 0) headTris.push(remap[a], remap[b], remap[c]); else bodyTris.push(a, b, c); }
// the head's own copies of the vertex attributes (tightly packed)
const attrs = {};
for (const [name, acc] of Object.entries(tprim.attributes)) {
  const a = tj.accessors[acc], n = NC[a.type], src32 = readAccessor(tgtG, acc);
  const T = CT[a.componentType], arr = new T(H * n), m = a.normalized ? { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 }[a.componentType] : 1;
  headIdx.forEach((i, h) => { for (let c = 0; c < n; c++) arr[h * n + c] = T === Float32Array ? src32[i * n + c] : Math.round(src32[i * n + c] * m); });
  const def = { bufferView: out.view(arr, 34962), componentType: a.componentType, count: H, type: a.type }; if (a.normalized) def.normalized = true;
  if (name === 'POSITION') { const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (let h = 0; h < H; h++) for (let c = 0; c < 3; c++) { mn[c] = Math.min(mn[c], arr[h * 3 + c]); mx[c] = Math.max(mx[c], arr[h * 3 + c]); } def.min = mn; def.max = mx; }
  attrs[name] = out.accessor(def);
}
const headIndices = out.accessor({ bufferView: out.view(H > 65535 ? new Uint32Array(headTris) : new Uint16Array(headTris), 34963), componentType: H > 65535 ? 5125 : 5123, count: headTris.length, type: 'SCALAR' });
const bodyIndices = out.accessor({ bufferView: out.view(tgt.n > 65535 ? new Uint32Array(bodyTris) : new Uint16Array(bodyTris), 34963), componentType: tgt.n > 65535 ? 5125 : 5123, count: bodyTris.length, type: 'SCALAR' });
// the shapes, sparse: only the vertices a shape moves
const targets = [], names = [];
for (const n of shapeNames) {
  const D = deltas[n], idx = [], val = []; const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let h = 0; h < H; h++) { const x = D[h * 3], y = D[h * 3 + 1], z = D[h * 3 + 2]; if (Math.abs(x) + Math.abs(y) + Math.abs(z) < 1e-7) continue; idx.push(h); val.push(x, y, z); mn[0] = Math.min(mn[0], x); mn[1] = Math.min(mn[1], y); mn[2] = Math.min(mn[2], z); mx[0] = Math.max(mx[0], x); mx[1] = Math.max(mx[1], y); mx[2] = Math.max(mx[2], z); }
  if (!idx.length) { mn.fill(0); mx.fill(0); }
  const def = { componentType: 5126, count: H, type: 'VEC3', min: idx.length ? mn : [0, 0, 0], max: idx.length ? mx : [0, 0, 0] };
  if (idx.length) def.sparse = { count: idx.length, indices: { bufferView: out.view(H > 65535 ? new Uint32Array(idx) : new Uint16Array(idx)), componentType: H > 65535 ? 5125 : 5123 }, values: { bufferView: out.view(new Float32Array(val)) } };
  targets.push({ POSITION: out.accessor(def) }); names.push(n);
}
const mesh = out.json.meshes[tgt.mi], prim = mesh.primitives[tgt.pi];
const headPrim = { attributes: attrs, indices: headIndices, targets }; if (prim.material != null) headPrim.material = prim.material; if (prim.mode != null) headPrim.mode = prim.mode;
mesh.primitives = [{ ...prim, indices: bodyIndices }, headPrim];
mesh.extras = { ...(mesh.extras || {}), targetNames: names }; mesh.weights = names.map(() => 0);
out.write(outPath);
const before = readFileSync(resolve(ROOT, 'assets/bodies', spec[tier] || spec.desktop)).length, after = readFileSync(outPath).length;
console.log(`wrote ${outPath} (${(after / 1e6).toFixed(1)} MB, was ${(before / 1e6).toFixed(1)} MB): body ${bodyTris.length / 3} tris + head ${headTris.length / 3} tris with ${names.length} shapes`);
console.log(`check: node tools/face/check.mjs ${outPath}   view: lab/face.html?body=${toId}&glb=${outPath.replace(ROOT + '/', '')}`);
