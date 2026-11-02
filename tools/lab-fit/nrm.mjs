import { NodeIO } from '@gltf-transform/core';
import fs from 'fs';
const doc=await new NodeIO().read(process.env.WORK+'/fixed.glb');fs.writeFileSync(process.env.WORK+'/normal.png',doc.getRoot().listMaterials()[0].getNormalTexture().getImage());
