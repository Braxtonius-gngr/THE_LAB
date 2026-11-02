import { NodeIO } from '@gltf-transform/core';
import fs from 'fs';
const doc=await new NodeIO().read(process.env.WORK+'/fixed.glb');const prim=doc.getRoot().listMeshes()[0].listPrimitives()[0];
const P=prim.getAttribute('POSITION').getArray(),UV=prim.getAttribute('TEXCOORD_0').getArray(),I=prim.getIndices().getArray();
fs.writeFileSync(process.env.WORK+'/pos.bin',Buffer.from(P.buffer,P.byteOffset,P.byteLength));fs.writeFileSync(process.env.WORK+'/uv.bin',Buffer.from(UV.buffer,UV.byteOffset,UV.byteLength));
fs.writeFileSync(process.env.WORK+'/idx.bin',Buffer.from(new Uint32Array(I).buffer));
const m=doc.getRoot().listMaterials()[0];fs.writeFileSync(process.env.WORK+'/base.png',m.getBaseColorTexture().getImage());
const node=doc.getRoot().listNodes().find(n=>n.getMesh());console.log('mesh node',node.getName(),node.getMatrix?.());
for(const j of doc.getRoot().listSkins()[0].listJoints().slice(0,1)) console.log(j.getName(),j.getWorldTranslation());
for(const n of ['Hips','LeftUpLeg','RightUpLeg','Spine']){const j=doc.getRoot().listNodes().find(x=>x.getName()===n);console.log(n,j.getWorldTranslation().map(v=>v.toFixed(3)))}
console.log(P.length/3, I.length/3);
