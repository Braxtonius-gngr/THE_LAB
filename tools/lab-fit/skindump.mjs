// Dump skinning data for analysis:  node skindump.mjs <body.glb> <outDir>
// writes pos.f32 (n*3, world space: y up, metres), jnt.u16 (n*4), wgt.f32 (n*4), idx.u32, joints.json [{name, world:[x,y,z], parent}]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import fs from 'fs';
const [,, src, out] = process.argv; fs.mkdirSync(out, { recursive: true });
const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(src); const root = doc.getRoot();
const prims = root.listMeshes().flatMap(m => m.listPrimitives());
const prim = prims.reduce((a, b) => (b.getAttribute('POSITION').getCount() > a.getAttribute('POSITION').getCount() ? b : a));
const node = root.listNodes().find(n => n.getMesh() && n.getMesh().listPrimitives().includes(prim)); const M = node.getWorldMatrix();
const P0 = prim.getAttribute('POSITION').getArray(); const P = new Float32Array(P0.length);
for (let i = 0; i < P0.length; i += 3) { const x = P0[i], y = P0[i + 1], z = P0[i + 2]; P[i] = M[0] * x + M[4] * y + M[8] * z + M[12]; P[i + 1] = M[1] * x + M[5] * y + M[9] * z + M[13]; P[i + 2] = M[2] * x + M[6] * y + M[10] * z + M[14]; }
const J = prim.getAttribute('JOINTS_0').getArray(), W = prim.getAttribute('WEIGHTS_0').getArray(), I = prim.getIndices().getArray();
fs.writeFileSync(`${out}/pos.f32`, Buffer.from(new Float32Array(P).buffer));
fs.writeFileSync(`${out}/jnt.u16`, Buffer.from(new Uint16Array(J).buffer));
fs.writeFileSync(`${out}/wgt.f32`, Buffer.from(new Float32Array(W).buffer));
fs.writeFileSync(`${out}/idx.u32`, Buffer.from(new Uint32Array(I).buffer));
const skin = root.listSkins()[0]; const joints = skin.listJoints();
const meta = joints.map((j, i) => ({ i, name: j.getName(), world: j.getWorldTranslation().map(v => +v.toFixed(4)), parent: joints.indexOf(j.getParentNode?.() || null) }));
fs.writeFileSync(`${out}/joints.json`, JSON.stringify(meta));
console.log('verts', P.length / 3, 'tris', I.length / 3, 'joints', joints.length, 'prims', prims.length, 'jointsType', J.constructor.name, 'wType', W.constructor.name);
