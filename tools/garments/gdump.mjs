// Dump a Meshy garment's geometry (world space) for fit.py:  node gdump.mjs <raw.glb> <outDir>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import fs from 'fs';
const [,, src, out] = process.argv; fs.mkdirSync(out, { recursive: true });
const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(src); const root = doc.getRoot();
const node = root.listNodes().find(n => n.getMesh()); const M = node.getWorldMatrix();
const prim = node.getMesh().listPrimitives()[0];
const P0 = prim.getAttribute('POSITION').getArray(), P = new Float32Array(P0.length);
for (let i = 0; i < P0.length; i += 3) { const x = P0[i], y = P0[i + 1], z = P0[i + 2]; P[i] = M[0] * x + M[4] * y + M[8] * z + M[12]; P[i + 1] = M[1] * x + M[5] * y + M[9] * z + M[13]; P[i + 2] = M[2] * x + M[6] * y + M[10] * z + M[14]; }
fs.writeFileSync(`${out}/pos.f32`, Buffer.from(P.buffer));
fs.writeFileSync(`${out}/idx.u32`, Buffer.from(new Uint32Array(prim.getIndices().getArray()).buffer));
console.log('verts', P.length / 3);
