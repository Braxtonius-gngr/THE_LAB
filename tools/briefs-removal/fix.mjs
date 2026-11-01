import { NodeIO } from '@gltf-transform/core';
const io=new NodeIO();const doc=await io.read('../raw.glb');const m=doc.getRoot().listMaterials()[0];
const t=m.getMetallicRoughnessTexture();m.setMetallicRoughnessTexture(null);t.dispose();
m.setMetallicFactor(0).setRoughnessFactor(0.62).setName('adult-base-skin');
await io.write('../fixed.glb',doc);
