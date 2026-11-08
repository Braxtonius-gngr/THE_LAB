#!/usr/bin/env node
// Check a body GLB for what the face module (world/face.mjs) needs: which meshes carry morph
// targets, which of the 52 ARKit shapes are there, and whether the shapes sit on a small head
// mesh (morph data lives in a GPU texture; 52 shapes on a 100k-vertex body is far too much for
// a phone, a 10-15k head is fine).  node tools/face/check.mjs assets/bodies/<id>/desktop.glb
import { readFileSync } from 'node:fs';
const ARKIT = ['eyeBlinkLeft', 'eyeLookDownLeft', 'eyeLookInLeft', 'eyeLookOutLeft', 'eyeLookUpLeft', 'eyeSquintLeft', 'eyeWideLeft', 'eyeBlinkRight', 'eyeLookDownRight', 'eyeLookInRight', 'eyeLookOutRight', 'eyeLookUpRight', 'eyeSquintRight', 'eyeWideRight', 'jawForward', 'jawLeft', 'jawRight', 'jawOpen', 'mouthClose', 'mouthFunnel', 'mouthPucker', 'mouthLeft', 'mouthRight', 'mouthSmileLeft', 'mouthSmileRight', 'mouthFrownLeft', 'mouthFrownRight', 'mouthDimpleLeft', 'mouthDimpleRight', 'mouthStretchLeft', 'mouthStretchRight', 'mouthRollLower', 'mouthRollUpper', 'mouthShrugLower', 'mouthShrugUpper', 'mouthPressLeft', 'mouthPressRight', 'mouthLowerDownLeft', 'mouthLowerDownRight', 'mouthUpperUpLeft', 'mouthUpperUpRight', 'browDownLeft', 'browDownRight', 'browInnerUp', 'browOuterUpLeft', 'browOuterUpRight', 'cheekPuff', 'cheekSquintLeft', 'cheekSquintRight', 'noseSneerLeft', 'noseSneerRight', 'tongueOut'];
for (const f of process.argv.slice(2)) {
  const buf = readFileSync(f); const len = buf.readUInt32LE(12); const json = JSON.parse(buf.subarray(20, 20 + len).toString());
  console.log(`== ${f}`);
  let any = false;
  for (const m of json.meshes || []) for (const [i, p] of (m.primitives || []).entries()) {
    const nv = json.accessors[p.attributes.POSITION]?.count, names = m.extras?.targetNames || [], n = p.targets?.length || 0;
    if (!n) { console.log(`  mesh "${m.name}"#${i}: ${nv} verts, no morph targets`); continue; }
    any = true;
    const have = ARKIT.filter(a => names.includes(a)), missing = ARKIT.filter(a => !names.includes(a));
    console.log(`  mesh "${m.name}"#${i}: ${nv} verts, ${n} morph targets, ${have.length}/52 ARKit${names.length ? '' : ' (no target names in extras - Blender exports them; the face module needs them)'}`);
    if (missing.length && missing.length < 52) console.log(`    missing: ${missing.join(', ')}`);
    if (nv > 30000) console.log(`    ! ${nv} vertices carry the shapes - split the head off first (Blender: select the Head vertex group, P → Selection) or the phone tier will not cope`);
    const est = (nv * n * 2 * 4 * 4 / 1e6).toFixed(0); console.log(`    morph texture on the GPU ≈ ${est} MB (positions + normals, float32 RGBA)`);
  }
  if (!any) console.log('  no face shapes anywhere: this body gets head motion only (world/face.mjs headAdd)');
}
