// Name an auto-rig's bones (Bone_000...) with the lab's canonical names by the
// skeleton's shape: legs are the chains reaching the floor, the hips are where
// they meet, the spine climbs from the root to where the arms branch, fingers
// are named by their place across the palm (thumb most forward).
// Usage: node automap.mjs in.glb out.glb   (+x is the character's left; faces +z)
import { NodeIO } from '@gltf-transform/core';
const [,, inp, out] = process.argv;
const io = new NodeIO(); const doc = await io.read(inp); const r = doc.getRoot();
const joints = r.listSkins()[0].listJoints(); const J = new Set(joints);
const P = n => n.getWorldTranslation();
const kids = n => n.listChildren().filter(c => J.has(c));
const parentOf = new Map(); for (const n of r.listNodes()) for (const c of n.listChildren()) parentOf.set(c, n);
const root = joints.find(j => !J.has(parentOf.get(j)));
const name = new Map(); const set = (n, s) => { if (n && !name.has(n)) name.set(n, s); };
const reach = n => Math.max(Math.abs(P(n)[0]), ...kids(n).map(reach));   // how far out a subtree goes
const chainDown = n => { const out = [n]; while (kids(out.at(-1)).length === 1) out.push(kids(out.at(-1))[0]); return out; };

// legs: leaves near the floor; walk up until the parent has another leg below it
const leaves = joints.filter(j => kids(j).length === 0 && P(j)[1] < 0.15);
const legOf = leaf => { const ch = [leaf]; let n = leaf; while (parentOf.get(n) && J.has(parentOf.get(n))) { n = parentOf.get(n); ch.unshift(n); if (P(n)[1] > 0.6 && kids(parentOf.get(n) || n).length >= 2) break; } return ch; };
const legs = leaves.map(legOf).map(ch => { const i = ch.findIndex(n => P(n)[1] < 0.95 && Math.abs(P(n)[0]) > 0.04); return ch.slice(i); });
const pelvis = parentOf.get(legs[0][0]);
for (const ch of legs) {
  const side = P(ch[0])[0] > 0 ? 'Left' : 'Right';
  ['UpLeg', 'Leg', 'Foot', 'ToeBase', 'Toe_end'].forEach((s, i) => set(ch[i], side + s));
}
// the chest: the bone the arms branch from; Hips: where the leg and spine chains meet
const chest = joints.find(j => kids(j).filter(c => reach(c) > 0.25 && P(c)[1] > 1.1).length >= 2);
const up = n => { const out = []; while (n && J.has(n)) { out.push(n); n = parentOf.get(n); } return out; };
const chestUp = up(chest), hips = up(pelvis).find(x => chestUp.includes(x));
set(hips, 'Hips'); { let q = parentOf.get(hips), k = 0; while (q && J.has(q)) { set(q, k ? 'Root' + k : 'Root'); k++; q = parentOf.get(q); } }
const spine = chestUp.slice(0, chestUp.indexOf(hips)).reverse();          // bottom-up, hips excluded
const SP = spine.length >= 4 ? ['Spine02', 'Spine01', 'Spine', 'Chest', 'Chest2'] : ['Spine02', 'Spine01', 'Spine'].slice(3 - spine.length);
spine.forEach((b, i) => set(b, SP[i] || 'Spine' + i));
if (pelvis !== hips) { set(pelvis, 'Pelvis'); let q = parentOf.get(pelvis); while (q && q !== hips && J.has(q)) { set(q, 'PelvisRoot'); q = parentOf.get(q); } }
const neck = kids(chest).filter(c => reach(c) <= 0.25).sort((a, b) => P(b)[1] - P(a)[1])[0];
if (neck) { const hc = chainDown(neck); ['neck', 'Head', 'head_end', 'head_end2'].forEach((s, i) => set(hc[i], s)); }
// arms and fingers
for (const sh of kids(chest).filter(c => reach(c) > 0.25)) {
  const side = P(sh)[0] > 0 ? 'Left' : 'Right';
  const arm = [sh]; while (kids(arm.at(-1)).length === 1 && arm.length < 4) arm.push(kids(arm.at(-1))[0]);
  ['Shoulder', 'Arm', 'ForeArm', 'Hand'].forEach((s, i) => set(arm[i], side + s));
  let hand = arm[3]; if (!hand) continue;
  let fk = kids(hand);
  if (fk.length === 1 && kids(fk[0]).length > 1) { set(fk[0], side + 'HandPalm'); fk = kids(fk[0]); }
  const F = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'];
  // thumb: most forward; the rest across the palm, front to back
  fk.sort((a, b) => P(b)[2] - P(a)[2]).forEach((f, i) => chainDown(f).forEach((b, k) => set(b, `${side}Hand${F[i] || 'Finger' + i}${k + 1}`)));
}
let unnamed = 0; for (const j of joints) { if (name.has(j)) j.setName(name.get(j)); else unnamed++; }
console.log('named', joints.length - unnamed, 'of', joints.length, unnamed ? '(unnamed left as is)' : '');
console.log([...name.entries()].filter(([, s]) => !/Hand(Thumb|Index|Middle|Ring|Pinky|Finger)/.test(s)).map(([b, s]) => s + '@' + P(b).map(v => v.toFixed(2)).join(',')).join('  '));
await io.write(out, doc);
