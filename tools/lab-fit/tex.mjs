import { NodeIO } from '@gltf-transform/core';
import fs from 'fs';
const io=new NodeIO();const doc=await io.read(process.env.WORK+'/shape.glb');const m=doc.getRoot().listMaterials()[0];
m.getBaseColorTexture().setImage(fs.readFileSync(process.env.WORK+'/base_new.png')).setMimeType('image/png');
m.getNormalTexture().setImage(fs.readFileSync(process.env.WORK+'/normal_new.png')).setMimeType('image/png');
m.getMetallicRoughnessTexture().setImage(fs.readFileSync(process.env.WORK+'/mr_new.png')).setMimeType('image/png');
await io.write(process.env.WORK+'/nude.glb',doc);
