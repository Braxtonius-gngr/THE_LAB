import { NodeIO } from '@gltf-transform/core';
import fs from 'fs';
const io=new NodeIO();const doc=await io.read('../shape.glb');const m=doc.getRoot().listMaterials()[0];
m.getBaseColorTexture().setImage(fs.readFileSync('../base_new.png')).setMimeType('image/png');
m.getNormalTexture().setImage(fs.readFileSync('../normal_new.png')).setMimeType('image/png');
await io.write('../nude.glb',doc);
