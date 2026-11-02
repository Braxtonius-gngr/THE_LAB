// Bake a Meshy prop for the world: scale it to real metres, stand it on the
// floor with its origin at the floor centre and its front on +z, then write a
// desktop GLB (2048 textures, webp) and a mobile GLB (1024 textures, ~35 % of
// the triangles).  Run from tools/lab-fit (node_modules live there):
//   node ../props/bake.mjs <raw.glb> <name> <sx[,sy,sz]> <outDir>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds, dedup, prune, weld, simplify, textureCompress, resample, cloneDocument } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const [, , src, name, scaleArg, outDir] = process.argv;
const sc = scaleArg.split(',').map(Number); const scale = sc.length === 3 ? sc : [sc[0], sc[0], sc[0]];
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(src);
const root = doc.getRoot(); const scene = root.getDefaultScene() || root.listScenes()[0];
// wrap the scene in one node carrying the scale, then a translation that puts the floor centre at the origin
const wrap = doc.createNode(name).setScale(scale);
for (const n of scene.listChildren()) { scene.removeChild(n); wrap.addChild(n); }
scene.addChild(wrap);
const b = getBounds(scene);
wrap.setTranslation([-(b.min[0] + b.max[0]) / 2, -b.min[1], -(b.min[2] + b.max[2]) / 2]);
const b2 = getBounds(scene);
const size = b2.max.map((v, i) => +(v - b2.min[i]).toFixed(3));
for (const m of root.listMaterials()) { m.setName(name); if (m.getMetallicFactor() > 0.5 && !m.getMetallicRoughnessTexture()) m.setMetallicFactor(0); }
await doc.transform(dedup(), prune(), resample());
mkdirSync(outDir, { recursive: true });
// desktop: as modelled, webp textures
const desk = cloneDocument(doc);
await desk.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 88 }));
await io.write(`${outDir}/desktop.glb`, desk);
// mobile: 1024 textures, simplified
const mob = cloneDocument(doc);
await mob.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: 0.35, error: 0.002 }), textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 80, resize: [1024, 1024] }));
await io.write(`${outDir}/mobile.glb`, mob);
let tri = 0; for (const me of mob.getRoot().listMeshes()) for (const p of me.listPrimitives()) tri += (p.getIndices()?.getCount() || 0) / 3;
console.log(JSON.stringify({ name, size, scale, mobileTris: Math.round(tri) }));
