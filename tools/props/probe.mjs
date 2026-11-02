// Probe raw Meshy props: size, triangle count, textures.  Run from a dir with Meshy_AI_* folders:  node tools/props/probe.mjs
import { NodeIO } from '@gltf-transform/core';
import { getBounds as bounds } from '@gltf-transform/core';
import { readdirSync } from 'node:fs';
const io = new NodeIO();
const rows = [];
for (const d of readdirSync('.').filter(n => n.startsWith('Meshy_AI_'))) {
  const m = d.match(/^Meshy_AI_([a-z]+)_([wh])(\d+)cm/);
  const doc = await io.read(`${d}/Meshy_AI_model.glb`);
  const root = doc.getRoot();
  const scene = root.getDefaultScene() || root.listScenes()[0];
  const b = bounds(scene);
  const size = b.max.map((v, i) => v - b.min[i]);
  let tris = 0, texes = root.listTextures().map(t => { const s = t.getSize(); return s ? `${s[0]}x${s[1]}` : '?'; });
  for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) tris += (p.getIndices()?.getCount() || p.getAttribute('POSITION').getCount()) / 3;
  rows.push({ name: m[1], axis: m[2], cm: +m[3], size: size.map(v => +v.toFixed(3)), min: b.min.map(v => +v.toFixed(3)), tris: Math.round(tris), meshes: root.listMeshes().length, mats: root.listMaterials().length, tex: texes.join(','), dir: d });
}
for (const r of rows) console.log(JSON.stringify(r));
