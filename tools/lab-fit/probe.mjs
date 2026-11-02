import { NodeIO } from '@gltf-transform/core';
import fs from 'fs';
const doc=await new NodeIO().read(process.argv[2]);const r=doc.getRoot();
const node=r.listNodes().find(n=>n.getMesh());console.log('mesh node',node.getName(),'matrix',node.getMatrix().map(v=>+v.toFixed(4)).join(','));
const sk=r.listSkins()[0];console.log('joints',sk.listJoints().length,sk.listJoints().map(j=>j.getName()).join(' '));
for(const n of ['Hips','LeftUpLeg','RightUpLeg','Spine01','Spine02','Head']){const j=r.listNodes().find(x=>x.getName()===n);if(j)console.log(n,j.getWorldTranslation().map(v=>v.toFixed(3)).join(','))}
const m=r.listMaterials()[0];console.log('metal',m.getMetallicFactor(),'rough',m.getRoughnessFactor());
fs.writeFileSync(process.argv[3]+'/mr.png',m.getMetallicRoughnessTexture().getImage());
