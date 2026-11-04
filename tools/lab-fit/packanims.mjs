// Merge Meshy animation GLBs (same skeleton) into one skeleton-only pack:
//   node packanims.mjs out.glb name1=a.glb name2=b.glb ...
import { NodeIO } from '@gltf-transform/core';
import { prune } from '@gltf-transform/functions';
const [,, out, ...pairs] = process.argv;
const io = new NodeIO();
const items = pairs.map(p => p.split('='));
const base = await io.read(items[0][1]); const R = base.getRoot();
const byName = new Map(R.listNodes().map(n => [n.getName(), n]));
R.listAnimations()[0].setName(items[0][0]);
for (const [name, file] of items.slice(1)) {
  const d = await io.read(file); const a = d.getRoot().listAnimations()[0];
  const A = base.createAnimation(name); const buf = R.listBuffers()[0];
  for (const ch of a.listChannels()) {
    const tn = byName.get(ch.getTargetNode().getName()); if (!tn) continue;
    const s = ch.getSampler();
    const inp = base.createAccessor().setType('SCALAR').setArray(s.getInput().getArray().slice()).setBuffer(buf);
    const outp = base.createAccessor().setType(s.getOutput().getType()).setArray(s.getOutput().getArray().slice()).setBuffer(buf);
    const S = base.createAnimationSampler().setInput(inp).setOutput(outp).setInterpolation(s.getInterpolation());
    A.addSampler(S).addChannel(base.createAnimationChannel().setTargetNode(tn).setTargetPath(ch.getTargetPath()).setSampler(S));
  }
}
// skeleton only: drop meshes, skins, materials, textures
for (const n of R.listNodes()) { n.setMesh(null); n.setSkin(null); }
for (const x of [...R.listMeshes(), ...R.listSkins(), ...R.listMaterials(), ...R.listTextures()]) x.dispose();
await base.transform(prune());
await io.write(out, base);
console.log('wrote', out, R.listAnimations().map(a => a.getName() + ' ' + a.listChannels().length).join(' | '));
