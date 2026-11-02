// Write a fitted garment:  node gwrite.mjs <raw.glb> <fitDir> <out.glb>
// fitDir: pos.f32 (body-mesh local space), jnt.u16, wgt.f32 from fit.py. The mesh node is reset to identity;
// world/garments.mjs binds it to the body's own skeleton at load.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';
import fs from 'fs';
const [,, src, dir, out] = process.argv;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS); const doc = await io.read(src); const root = doc.getRoot();
const node = root.listNodes().find(n => n.getMesh()); const prim = node.getMesh().listPrimitives()[0];
const rd = (f, T) => { const b = fs.readFileSync(`${dir}/${f}`); return new T(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
const P = rd('pos.f32', Float32Array), J = rd('jnt.u16', Uint16Array), W = rd('wgt.f32', Float32Array);
prim.getAttribute('POSITION').setArray(P);
// normals from the new shape
const I = prim.getIndices().getArray(), N = new Float32Array(P.length);
for (let t = 0; t < I.length; t += 3) { const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3; const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2]; const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; for (const q of [a, b, c]) { N[q] += nx; N[q + 1] += ny; N[q + 2] += nz; } }
for (let i = 0; i < N.length; i += 3) { const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1; N[i] /= l; N[i + 1] /= l; N[i + 2] /= l; }
if (prim.getAttribute('NORMAL')) prim.getAttribute('NORMAL').setArray(N); else prim.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(N).setBuffer(root.listBuffers()[0]));
prim.setAttribute('JOINTS_0', doc.createAccessor().setType('VEC4').setArray(J).setBuffer(root.listBuffers()[0]));
prim.setAttribute('WEIGHTS_0', doc.createAccessor().setType('VEC4').setArray(W).setBuffer(root.listBuffers()[0]));
// identity all the way up
let n = node; while (n) { n.setMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); n = n.getParentNode?.(); }
for (const m of root.listMaterials()) { m.setDoubleSided(true); if (m.getMetallicFactor() > 0.5 && !m.getMetallicRoughnessTexture()) m.setMetallicFactor(0); }
await doc.transform(dedup(), prune(), textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 85, resize: [2048, 2048] }));
await io.write(out, doc); console.log('wrote', out);
