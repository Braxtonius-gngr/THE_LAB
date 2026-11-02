// Write new skin weights into a copy of a body GLB:  node skinwrite.mjs <in.glb> <dumpDir> <out.glb>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import fs from 'fs';
const [,, src, dir, out] = process.argv;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS); const doc = await io.read(src); const root = doc.getRoot();
const prims = root.listMeshes().flatMap(m => m.listPrimitives());
const prim = prims.reduce((a, b) => (b.getAttribute('POSITION').getCount() > a.getAttribute('POSITION').getCount() ? b : a));
const n = prim.getAttribute('POSITION').getCount();
const w = fs.readFileSync(`${dir}/wgt_new.f32`), j = fs.readFileSync(`${dir}/jnt_new.u16`);
const W = new Float32Array(w.buffer, w.byteOffset, w.byteLength / 4), Jn = new Uint16Array(j.buffer, j.byteOffset, j.byteLength / 2);
if (W.length !== n * 4) throw new Error(`weights ${W.length / 4} vs verts ${n}`);
const ja = prim.getAttribute('JOINTS_0'); const old = ja.getArray();
ja.setArray(old instanceof Uint8Array ? Uint8Array.from(Jn) : Uint16Array.from(Jn));
prim.getAttribute('WEIGHTS_0').setArray(Float32Array.from(W));
await io.write(out, doc); console.log('wrote', out);
