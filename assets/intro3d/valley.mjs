// THE VALLEY: Burin & Brimstone's home at Showroom (three.js + CSS3D).
//
// After the roll intro has floated up, a tap on the landing starts one
// continuous shot, as it does for the card table (table.mjs): the camera
// rises out of the float and glides across the room, away from the gaming
// floor - and out of the house altogether, down onto a rock over hell. You
// sit at a gaming table on an outcrop above the valley. Everything out
// there is CUT: the whole world is a white-line engraving (burin.mjs) -
// the ground is the ink, every form is lit by being cut more, and the
// only wet thing anywhere is blood. Across the table stands the dealer,
// Death, in a hooded robe, his hands on the cloth. Behind him, along the
// ridge road, the dance of death goes by: a line of skeletons leading the
// damned, each with a lantern on a pole - each lantern is one of your
// ready platforms, its initials cut in the lantern's plate. Below the
// ridge the river of blood winds through the valley, wet and slow; on the
// knoll beyond stand the gibbets, and the breaking wheel burns on its
// pole; the sky is hatched smoke lit from under. Nailed to the table's
// back rail, a broadside - the one printed thing - with the clock, what is
// ready and the hand to deal.
//
// Tap a soul or its lantern: the skeleton turns to you, and its card comes
// up out of the lantern to you, with its Keen Info and its moves (the same
// card and sheet as the card table's). Drag across the table: the wind
// gets up - the procession's lanterns swing, the smoke drives, the fires
// lean. Nothing here is scaled to fake a thing: the camera goes where you
// would sit, and the lens is sized for that.
//
// Held to real makers, at three distances (across the room: silhouette;
// at arm's length: materials, bevels, seams; pinched in 3x: engraving,
// grain, wear), for what each surface does with the light, what it touches
// and how it moves:
//   The engraving - a white-line plate after Bewick, the cuts following
//     each form (a skull's dome in meridians, a bone's length in long
//     strokes, the ground in broken horizontals), swelling in the light,
//     stippled in the half-tones, the deepest darks left as ink. Room: a
//     page of bone line on black. Arm: the lines' swell and the stipple.
//     3x: each line cut clean, no two the same width, the crossings where
//     two sets meet. The ink glows ember in the darks nearest the fires.
//   The dance of death - after the Totentanz woodcuts and Holbein: each
//     skeleton anatomically a skeleton (skull with its sockets and jaw,
//     the rib cage, the spine, pelvis, long bones with their heads), each
//     posed in its own step of the dance, a lantern on a pole over its
//     shoulder; they walk in place on the road at a dirge's pace, the
//     lanterns swinging, no two in step.
//   The dealer - Death: a skeleton in a hooded robe of coarse cloth, the
//     cowl's dark holding the skull, the hands out on the cloth; he sways
//     as he breathes, which he does not, and turns his head to the soul
//     you take.
//   The river - blood, wet: the one surface with a real finish (glossy,
//     a clearcoat, a sheen along its bends), flowing slow toward you under
//     the outcrop, where it drips off the rock's lip.
//   The wheel - the breaking wheel from the Lounge's ring, on its pole,
//     turning slowly, its felloe burning: tongues of ember-cut flame
//     leaning in the wind, embers lifting off it and going out.
//   The gibbets - posts with their beams and the hanged in bone line,
//     turning a little on their ropes.
//   The sky - a dome of hatched smoke, the hatch rolling (the plate's
//     lines drifting), lit from under in ember along the horizon.
//   The broadside - a printed sheet: bone paper, the lettering in ink
//     (IM Fell English, Pinyon Script), the hand's box in blood red with
//     bone letters, nailed at the corners to the rail.
//
// The sound (with the music on - the valley has no loops; it plays its
// own): a hurdy-gurdy drone a fifth apart, slowly beating, a choir's hum
// under it, a timpani dirge at 70 to the minute, the wind, and far off a
// bell. With motion off nothing moves on its own and the drone holds.
//
// Coordinates are the seat's own, as the table's: centimetres, the origin
// on the table's top at the middle of its near edge, +z away from you,
// +y up, +x to your LEFT.

import * as THREE from '../vendor/three/three.module.js';
import { CSS3DRenderer, CSS3DObject } from '../vendor/three/three.addons.js';
import { tableKit as K } from './table.mjs';
import { engravingMaterial, outlineOf, burinTick, BONE, INK, BLOOD, EMBER } from './burin.mjs';

export const DESTS = ['valley'];

const DEG = Math.PI / 180;
const clamp01 = x => Math.min(Math.max(x, 0), 1);
const smoother = x => { x = clamp01(x); return x * x * x * (x * (6 * x - 15) + 10); };
const lerp = (a, b, k) => a + (b - a) * k;
const easeOut = (x, k = 3) => 1 - Math.pow(1 - clamp01(x), k);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const HERE = new URL('./', import.meta.url);
const asset = f => new URL(f, HERE).href;
function seeded(seed) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }

// Where the valley lies: off the far side of the house from the slaughter
// floor, the seat facing away from the gaming floor.
const SEAT = { at: [-470, 0, -60], yaw: -90 };
// The table: a plank top on a trestle, its near edge a little in front of
// the origin.
const TABLE = { w: 120, d: 64, z0: -4, slab: 4, floor: -80 };
// The outcrop: a shelf of rock under the table, falling away beyond it.
const ROCK = { r: 140, lip: 95, drop: 120 };
// The dealer, behind the table to your left; the ridge road behind him
// where the procession passes (x across, z, y its height); the valley
// floor and the river; the knoll with the gibbets; the wheel on its pole.
const DEALER = { at: [50, 0, 94], yaw: 0.22 };
const ROAD = { z: 300, y: 36, x0: -150, x1: 90 };
const RIVER = { y: -36, z0: 112, z1: 250, w: 54 };
const KNOLL = { at: [-40, 20, 400], r: 110 };
const WHEEL = { at: [-150, 0, 300], top: 170, r: 42 };
const SKY = 1100;
// The broadside: a printed sheet nailed to the table's back rail, under
// your thumb (at: its middle; 60 x 38 cm, 30 page px to the cm).
const SHEET = { at: [-20, 17, 56], lean: 0.42, w: 60, h: 38, px: 30, tilt: -0.9 * DEG };
// The views: the seat, portrait and landscape.
const VIEW = [{ eye: [0, 92, -116], aim: [0, 34, 120], fov: 62 }, { eye: [0, 78, -140], aim: [0, 36, 120], fov: 48 }];
const T = { fly: 4.8, uiIn: 0.6, lift: 0.55 };
const SND = { drone: 0.11, choir: 0.05, drum: 0.5, wind: 0.06, bell: 0.35 };
const KEY_SEAT = new THREE.Vector3(0.6, 0.55, -0.58).normalize();

// ------------------------------------------------------------ helpers
// (every surface here is white-line: the ground is the ink, bone lines cut into it)
// (tone here: + is darker - fewer cuts; the valley is a night plate, lit
// only by its fires, so the ground stays ink and the bones stay bone)
const mat = (opts) => engravingMaterial(Object.assign({ freq: 1.0, paper: INK, ink: BONE, invert: true, sky: 0.1, keyI: 1.15, tone: 0.12 }, opts));
const mesh = (geo, m, parent, outline = 1.6) => { const x = new THREE.Mesh(geo, m); parent.add(x); if (outline) outlineOf(x, outline); return x; };
// a bone: a long bone with its two heads, lying along +y from 0 to len
function boneGeo(len, r, head = 1.5) {
  const pts = [];
  const n = 10;
  for (let i = 0; i <= n; i++) {
    const t = i / n, bulb = Math.exp(-Math.pow((t - 0.06) / 0.09, 2)) * head + Math.exp(-Math.pow((t - 0.94) / 0.09, 2)) * head * 0.85;
    pts.push(new THREE.Vector2(r * (1 + bulb) * (i === 0 || i === n ? 0.2 : 1), t * len));
  }
  return new THREE.LatheGeometry(pts, 10);
}
// the skull: a dome, the sockets sunk, the jaw hung under
function buildSkull(kit) {
  const m = kit.bone, mOut = kit.ink;
  const g = new THREE.Group();
  const dome = new THREE.SphereGeometry(8.2, 24, 16); dome.scale(1, 1.12, 1.08);
  const d = mesh(dome, kit.skull, g, 1.6); d.position.y = 3;
  // the sockets: two dark hollows (ink, uncut) set into the face
  const sock = new THREE.SphereGeometry(2.6, 12, 8);
  [-3.1, 3.1].forEach(x => { const s = new THREE.Mesh(sock, mOut); s.position.set(x, 3.6, -6.6); s.scale.set(1, 1.1, 0.6); g.add(s); });
  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.2, 2.4, 4), mOut); nose.position.set(0, 0.6, -7.6); nose.rotation.x = Math.PI; g.add(nose);
  // the cheekbones and the upper teeth's arc
  const jawU = new THREE.TorusGeometry(4.6, 1.3, 8, 18, Math.PI); const ju = mesh(jawU, kit.rib, g, 1.2); ju.position.set(0, -2.6, -3.2); ju.rotation.set(Math.PI / 2, 0, Math.PI);
  const jaw = new THREE.TorusGeometry(4.4, 1.2, 8, 18, Math.PI); const jl = mesh(jaw, kit.rib, g, 1.2); jl.position.set(0, -6, -2.6); jl.rotation.set(Math.PI / 2, 0, Math.PI);
  g.userData.jaw = jl;
  return g;
}
// A skeleton standing on y = 0, facing -z (toward the seat when the group
// is not turned), about 165 tall. Its joints are groups, posed by pose().
function buildSkeleton(kit, rnd) {
  const m = kit.bone, mOut = kit.ink;
  const root = new THREE.Group();
  const hips = new THREE.Group(); hips.position.y = 92; root.add(hips);
  // the pelvis: two wings and the sacrum
  const pelvis = new THREE.Group(); hips.add(pelvis);
  [-1, 1].forEach(s => { const w = mesh(new THREE.SphereGeometry(6, 14, 10), kit.ball, pelvis, 1.4); w.position.set(s * 7, 0, 0); w.scale.set(0.9, 1.2, 0.5); });
  mesh(new THREE.ConeGeometry(4, 9, 8), m, pelvis, 1.2).position.set(0, -4, 2);
  // the spine up to the ribs, as a stack of vertebrae
  const spine = new THREE.Group(); spine.position.y = 4; hips.add(spine);
  for (let i = 0; i < 8; i++) { const v = mesh(new THREE.CylinderGeometry(2.4, 2.6, 2.6, 10), kit.ball, spine, 1.1); v.position.set(0, i * 3.6, 1.5 + Math.sin(i / 8 * 2) * 1.2); }
  // the chest: the rib cage as hoops swelling and narrowing, the sternum
  const chest = new THREE.Group(); chest.position.y = 30; spine.add(chest);
  for (let i = 0; i < 9; i++) {
    const t = i / 8, r = 10 * Math.sin(0.4 + t * 2.3) + 4;
    const rib = mesh(new THREE.TorusGeometry(r, 0.9, 6, 24, Math.PI * 1.55), kit.rib, chest, 1.1);
    rib.position.set(0, -i * 3.3 + 8, 0); rib.rotation.set(Math.PI / 2 + 0.18, 0, -Math.PI * 0.775); rib.scale.set(1, 0.85, 1);
  }
  mesh(new THREE.BoxGeometry(3, 18, 1.6), m, chest, 1.1).position.set(0, 2, -11.5);
  // the neck and the skull
  const neck = new THREE.Group(); neck.position.set(0, 14, 0); chest.add(neck);
  for (let i = 0; i < 3; i++) mesh(new THREE.CylinderGeometry(2.2, 2.2, 2.2, 10), kit.ball, neck, 1).position.y = i * 3;
  const head = new THREE.Group(); head.position.y = 10; neck.add(head);
  head.add(buildSkull(kit));
  // the arms, from the shoulders: clavicles, humerus, radius and ulna,
  // the hand a palm with five phalanx bones
  const arms = {};
  [-1, 1].forEach(s => {
    const key = s < 0 ? 'r' : 'l';
    mesh(new THREE.CylinderGeometry(1, 1, 15, 8), m, chest, 1).position.set(s * 7.5, 12, -3), chest.children[chest.children.length - 1].rotation.z = s * Math.PI / 2;
    const sh = new THREE.Group(); sh.position.set(s * 16, 12, -1); chest.add(sh);
    const hum = mesh(boneGeo(28, 1.7), kit.shaft, sh, 1.3); hum.rotation.x = Math.PI;
    const el = new THREE.Group(); el.position.y = -28; sh.add(el);
    const ra = mesh(boneGeo(25, 1.3), kit.shaft, el, 1.2); ra.rotation.x = Math.PI; ra.position.x = s * 1.2;
    const ul = mesh(boneGeo(26, 1.1), kit.shaft, el, 1.2); ul.rotation.x = Math.PI; ul.position.x = -s * 1.2;
    const hand = new THREE.Group(); hand.position.y = -26; el.add(hand);
    mesh(new THREE.BoxGeometry(6, 7, 1.8), m, hand, 1.1).position.y = -3.5;
    for (let f = 0; f < 5; f++) { const fg = mesh(new THREE.CylinderGeometry(0.6, 0.5, 6, 6), m, hand, 0.8); fg.position.set((f - 2) * 1.35 * (f === 4 ? 1.25 : 1), f === 4 ? -5 : -9.5, f === 4 ? -1.5 : 0); fg.rotation.z = f === 4 ? s * 0.9 : (f - 2) * 0.06; }
    arms[key] = { sh, el, hand };
  });
  // the legs: femur, tibia and fibula, the foot
  const legs = {};
  [-1, 1].forEach(s => {
    const key = s < 0 ? 'r' : 'l';
    const hip = new THREE.Group(); hip.position.set(s * 8, -2, 0); hips.add(hip);
    const fe = mesh(boneGeo(42, 2.2, 1.8), kit.shaft, hip, 1.4); fe.rotation.x = Math.PI;
    const kn = new THREE.Group(); kn.position.y = -42; hip.add(kn);
    mesh(new THREE.SphereGeometry(3, 10, 8), kit.ball, kn, 1.1);
    const ti = mesh(boneGeo(40, 1.8), kit.shaft, kn, 1.3); ti.rotation.x = Math.PI;
    const fi = mesh(boneGeo(38, 0.9), kit.shaft, kn, 1); fi.rotation.x = Math.PI; fi.position.x = -s * 2.4;
    const foot = new THREE.Group(); foot.position.y = -41; kn.add(foot);
    mesh(new THREE.BoxGeometry(5, 2.2, 13), m, foot, 1).position.set(0, -2, -4);
    legs[key] = { hip, kn, foot };
  });
  root.userData = { hips, spine, chest, neck, head, arms, legs, phase: rnd() * 6.28, gait: 0.85 + rnd() * 0.3 };
  return root;
}
// a skeleton's step of the dance at time t (seconds): the walk in place,
// the sway, the free arm thrown up, the head turning to the seat when
// looked at (look: 0..1)
function poseSkeleton(sk, t, look = 0, still = false) {
  const d = sk.userData, w = still ? 0 : (t * 2.1 * d.gait + d.phase);
  const s = Math.sin(w), c = Math.cos(w);
  d.hips.position.y = 92 + Math.abs(s) * 2.2;
  d.hips.rotation.y = s * 0.08; d.hips.rotation.z = c * 0.04;
  d.legs.l.hip.rotation.x = s * 0.55; d.legs.r.hip.rotation.x = -s * 0.55;
  d.legs.l.kn.rotation.x = Math.max(0, -s) * 0.9 + 0.05; d.legs.r.kn.rotation.x = Math.max(0, s) * 0.9 + 0.05;
  d.spine.rotation.z = -c * 0.05; d.spine.rotation.x = -0.04 - (d.stoop || 0) + Math.sin(w * 0.5) * 0.03;
  d.arms.l.sh.rotation.x = -s * 0.5; d.arms.r.sh.rotation.x = s * 0.5 - 0.3;
  d.arms.l.sh.rotation.z = 0.25 + (d.lanternHand === 'l' ? -1.9 : 0); d.arms.r.sh.rotation.z = -0.25 - (d.lanternHand === 'r' ? -1.9 : 0);
  d.arms.l.el.rotation.x = -0.4 - Math.max(0, s) * 0.5; d.arms.r.el.rotation.x = -0.4 - Math.max(0, -s) * 0.5;
  // the head: to the way it walks, turned to you when looked at, a nod
  d.neck.rotation.y = lerp(0, d.toSeat || 0, look) + Math.sin(w * 0.5 + 1) * 0.1 * (1 - look);
  d.neck.rotation.x = Math.sin(w) * 0.05 - 0.08 * look;
  d.head.children[0].userData.jaw.position.y = -6 - Math.max(0, Math.sin(w * 1.5 + d.phase * 3)) * 0.8 * (1 - look) - 1.4 * look;
}
// the lantern: a cage of four bars on a square foot and crown, a ring, the
// plate in it with the soul's initials cut, lit ember from within
function buildLantern(kit, card, i) {
  const g = new THREE.Group();
  const frame = kit.iron;
  const W = 11, H = 15;
  mesh(new THREE.BoxGeometry(W, 1, W), frame, g, 1).position.y = 0;
  mesh(new THREE.BoxGeometry(W, 1, W), frame, g, 1).position.y = H;
  mesh(new THREE.ConeGeometry(W * 0.75, 5, 4), frame, g, 1).position.y = H + 3; g.children[g.children.length - 1].rotation.y = Math.PI / 4;
  const ring = mesh(new THREE.TorusGeometry(2.6, 0.5, 6, 14), frame, g, 0.8); ring.position.y = H + 7.5;
  [-1, 1].forEach(sx => [-1, 1].forEach(sz => mesh(new THREE.BoxGeometry(0.9, H, 0.9), frame, g, 0.8).position.set(sx * (W / 2 - 0.5), H / 2, sz * (W / 2 - 0.5))));
  // the glow: an ember-lit core (the candle), and the plate on the near face
  const core = new THREE.Mesh(new THREE.SphereGeometry(3.2, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.55, 0.18), toneMapped: false }));
  core.position.y = H * 0.45; g.add(core);
  const art = K.canvasTex(256, 352, (c, w, h) => {
    c.fillStyle = '#1a0f0c'; c.fillRect(0, 0, w, h);
    // the plate: horn, scraped thin, the candle behind it - lit in the
    // middle; the initials cut through it in bone
    const gr = c.createRadialGradient(w / 2, h * 0.5, 10, w / 2, h * 0.5, w * 0.8); gr.addColorStop(0, 'rgba(255,190,90,1)'); gr.addColorStop(0.5, 'rgba(220,110,40,0.9)'); gr.addColorStop(1, 'rgba(120,40,14,0.6)');
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 5) { c.fillStyle = 'rgba(20,8,4,0.22)'; c.fillRect(0, y, w, 1.2); }
    c.fillStyle = '#120806'; c.font = `700 ${w * 0.56}px 'IM Fell English', Georgia, serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(card.initials, w / 2, h * 0.52);
    c.font = `${w * 0.11}px 'IM Fell English SC', Georgia, serif`; c.fillText(`soul ${String(i + 1).padStart(2, '0')}`, w / 2, h * 0.16);
  });
  const plateMat = new THREE.MeshBasicMaterial({ map: art, toneMapped: false });
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(W - 2, H - 2), plateMat);
  plate.position.set(0, H / 2, -(W / 2 - 0.3)); plate.rotation.y = Math.PI; g.add(plate);
  // (the same plate on the other three faces: a lantern is glazed all round)
  [[0, H / 2, W / 2 - 0.3, 0], [W / 2 - 0.3, H / 2, 0, Math.PI / 2], [-(W / 2 - 0.3), H / 2, 0, -Math.PI / 2]].forEach(([x, y, z, ry]) => { const f = new THREE.Mesh(plate.geometry, plateMat); f.position.set(x, y, z); f.rotation.y = ry; g.add(f); });
  g.userData.plate = plate; g.userData.core = core; g.userData.liveTex = art;
  return g;
}
// the lantern's plate when the soul is spent: the candle out, the horn dark
function spentArt(card, i) {
  return K.canvasTex(256, 352, (c, w, h) => {
    c.fillStyle = '#1a0f0c'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 5) { c.fillStyle = 'rgba(60,40,30,0.35)'; c.fillRect(0, y, w, 1.4); }
    c.fillStyle = 'rgba(232,220,192,0.5)'; c.font = `700 ${w * 0.5}px 'IM Fell English', Georgia, serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(card.initials, w / 2, h * 0.52);
    c.font = `${w * 0.11}px 'IM Fell English SC', Georgia, serif`; c.fillText(`soul ${String(i + 1).padStart(2, '0')}`, w / 2, h * 0.16);
  });
}
// a soul in the procession: a skeleton with its lantern on a pole over
// the shoulder, placed on the road at x, facing the way it walks
function buildSoul(kit, card, i, x, rnd) {
  const pivot = new THREE.Group();
  pivot.position.set(x, ROAD.y, ROAD.z + (rnd() - 0.5) * 16);
  const sk = buildSkeleton(kit, rnd);
  sk.scale.setScalar(0.86 + rnd() * 0.3);
  sk.userData.stoop = rnd() * 0.3;
  pivot.position.z += (rnd() - 0.5) * 36;
  // the road runs from screen right to left: they walk toward +x, turned
  // a little toward the seat so their faces read
  const walkYaw = -Math.PI / 2 + 0.55 + (rnd() - 0.5) * 0.3;
  sk.rotation.y = walkYaw;
  sk.userData.toSeat = Math.atan2(-x, 140 + ROAD.z) - walkYaw;   // (how far the head turns to look at you)
  sk.userData.lanternHand = 'l';
  pivot.add(sk);
  // the pole in the left hand, the lantern hung off its end over the shoulder
  const hand = sk.userData.arms.l.hand;
  const pl = 50 + rnd() * 16, tilt = -0.3 - rnd() * 0.3;
  const pole = mesh(new THREE.CylinderGeometry(0.9, 1.1, pl, 8), kit.wood, hand, 1); pole.position.set(0, pl / 2 - 9, 0); pole.rotation.x = tilt;
  const lantern = buildLantern(kit, card, i);
  lantern.position.set(0, (pl - 9) * Math.cos(tilt) - 2, (pl - 9) * Math.sin(tilt) * -1 - 2); lantern.scale.setScalar(1.9);
  hand.add(lantern);
  lantern.userData.swing = new THREE.Group();
  pivot.userData = { sk, lantern, plate: lantern.userData.plate, tag: { userData: { id: card.id, plate: lantern.userData.plate, card, n: i, spentTex: null, liveTex: lantern.userData.liveTex } }, look: 0, lookTo: 0 };
  return pivot;
}
// Death at the table: a skeleton seated on a stool across from you, in a
// hooded robe of coarse cloth (a lathe from the shoulders to the ground,
// its folds long vertical cuts), the cowl holding the skull in its dark,
// the hands out on the cloth
function buildDealer(kit, rnd) {
  const g = new THREE.Group();
  const sk = buildSkeleton(kit, rnd);
  sk.rotation.y = 0;                            // (a skeleton faces -z: toward you)
  sk.position.y = -44;                          // (seated: the hips at a stool's height)
  g.add(sk);
  const a = sk.userData.arms, l = sk.userData.legs;
  l.l.hip.rotation.x = -1.45; l.r.hip.rotation.x = -1.45; l.l.kn.rotation.x = 1.5; l.r.kn.rotation.x = 1.5;
  // the arms down and forward, the forearms flat along the cloth, the
  // hands palm down on it
  a.l.sh.rotation.set(0.6, 0, 0.3); a.r.sh.rotation.set(0.6, 0, -0.3); a.l.el.rotation.x = 0.97; a.r.el.rotation.x = 0.97;
  const pts = [];
  for (let i = 0; i <= 14; i++) { const t = 1 - i / 14, y = 106 - t * 106, r = 15 + t * t * 38 + Math.sin(t * 9) * 1.2; pts.push(new THREE.Vector2(r, y)); }
  const rg = new THREE.LatheGeometry(pts, 56);
  { const p = rg.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), y = p.getY(i), a = Math.atan2(z, x), r = Math.hypot(x, z); const fold = 1 + (0.07 * Math.sin(a * 9 + 0.4) + 0.035 * Math.sin(a * 17 + y * 0.05)) * (1 - y / 106) * (0.3 + 0.7 * (1 - y / 106)); p.setXYZ(i, Math.cos(a) * r * fold, y, Math.sin(a) * r * fold); } rg.computeVertexNormals(); }
  const robe = mesh(rg, mat({ uv: [56, 10], angle: 0, freq: 1.0, tone: 0.48, wobble: 1.6 }), g, 2.2);
  robe.position.set(0, 0, 4);
  const cowl = mesh(new THREE.SphereGeometry(14, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.62), mat({ uv: [40, 12], angle: 0, tone: 0.5, wobble: 2.4 }), g, 2.2);
  cowl.position.set(0, 116, 2); cowl.rotation.x = 0.55; cowl.scale.set(1, 1.15, 1.1);
  [a.l.sh, a.r.sh].forEach(sh => { const sl = mesh(new THREE.CylinderGeometry(5.5, 9, 40, 12, 1, true), mat({ uv: [26, 8], angle: 0, tone: 0.5, wobble: 2.4, side: THREE.DoubleSide }), sh, 1.6); sl.position.y = -19; sl.rotation.x = Math.PI; });
  g.userData = { sk, robe, cowl, phase: rnd() * 6 };
  return g;
}

// ------------------------------------------------------------ the land
// the outcrop and the valley floor: one lumpy ground, high under the table,
// dropping beyond the lip to the valley, rising to the ridge road and the
// knoll, cut in broken horizontals; the river bed sunk through it
function groundHeight(x, z, n1, n2) {
  // the shelf: flat round the table, falling steeply beyond ROCK.lip
  const d = Math.hypot(x * 0.8, z - 20);
  let y = -ROCK.drop * smoother((d - ROCK.lip) / 60);
  // the valley floor undulates; the river bed a trough along its line
  // (the river winds across the floor between the lip and the road)
  y += (n1(x * 0.01 + 3, z * 0.01) - 0.5) * 26 + (n2(x * 0.03, z * 0.03) - 0.5) * 8;
  const riverZ = RIVER.z0 + (RIVER.z1 - RIVER.z0) * 0.5 + Math.sin(x * 0.012) * 50;
  y -= 20 * Math.exp(-Math.pow((z - riverZ) / (RIVER.w * 0.8), 2)) * smoother((z - 90) / 40) * (1 - smoother((z - 270) / 30));
  // the ridge road: a shelf at ROAD.y along ROAD.z; the knoll beyond
  y = lerp(y, ROAD.y, smoother(1 - Math.abs(z - ROAD.z) / 70) * 0.97);
  y += 60 * Math.exp(-(Math.pow((x - KNOLL.at[0]) / KNOLL.r, 2) + Math.pow((z - KNOLL.at[2]) / KNOLL.r, 2)));
  // the far hills
  y += smoother((z - 520) / 300) * 180 + (n1(x * 0.004, z * 0.004) - 0.5) * 120 * smoother((z - 480) / 200);
  return y;
}
function vnoise2(seed) {
  const h = (x, y) => { let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041)) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  return (x, y) => { const x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty); return lerp(lerp(h(x0, y0), h(x0 + 1, y0), sx), lerp(h(x0, y0 + 1), h(x0 + 1, y0 + 1), sx), sy); };
}
function buildGround() {
  const n1 = vnoise2(5), n2 = vnoise2(11);
  const geo = new THREE.PlaneGeometry(1400, 1200, 140, 120);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, 350);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, groundHeight(p.getX(i), p.getZ(i), n1, n2) - 0.5 * (Math.hypot(p.getX(i) * 0.8, p.getZ(i) - 20) < ROCK.lip ? 0 : 0));
  geo.computeVertexNormals();
  const g = new THREE.Mesh(geo, mat({ freq: 0.55, angle: 0.06, tone: 0.62, ember: 0.55, sky: 0.06, keyI: 0.8, wobble: 1.6 }));
  g.userData.height = (x, z) => groundHeight(x, z, n1, n2);
  return g;
}
// the river: a ribbon down the trough, wet
function buildRiver(env) {
  const pts = [];
  // across the floor from screen right to left, winding, down to the lip on the left
  for (let x = -320; x <= 320; x += 14) pts.push(V(x, RIVER.y + 2, RIVER.z0 + (RIVER.z1 - RIVER.z0) * 0.5 + Math.sin(x * 0.012) * 50));
  const curve = new THREE.CatmullRomCurve3(pts);
  const n = 60, w = RIVER.w;
  const pos = [], uv = [], idx = [];
  const tan = V(0, 0, 0), side = V(0, 0, 0), up = V(0, 1, 0), pt = V(0, 0, 0);
  for (let i = 0; i <= n; i++) {
    const t = i / n; curve.getPointAt(t, pt); curve.getTangentAt(t, tan); side.crossVectors(up, tan).normalize();
    const ww = w * (0.8 + 0.25 * Math.sin(t * 7));
    for (let s = -1; s <= 1; s += 0.5) { pos.push(pt.x + side.x * ww * s, pt.y - Math.abs(s) * 2 + (1 - s * s) * 1.5, pt.z + side.z * ww * s); uv.push(s * 0.5 + 0.5, t * 6); }
  }
  for (let i = 0; i < n; i++) for (let s = 0; s < 4; s++) { const a = i * 5 + s, b = a + 5; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
  const m = new THREE.MeshPhysicalMaterial({ color: 0x3a0505, roughness: 0.18, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06, envMap: env || null, envMapIntensity: 1.8, emissive: 0x3a0404, emissiveIntensity: 0.45 });
  const r = new THREE.Mesh(geo, m);
  r.userData.flow = m;
  return r;
}
// the wheel on its pole: the breaking wheel of the Lounge's ring, burning
function buildWheel(kit) {
  const g = new THREE.Group();
  const pole = mesh(new THREE.CylinderGeometry(3, 4.5, WHEEL.top, 10), kit.wood, g, 2); pole.position.y = WHEEL.top / 2;
  const wh = new THREE.Group(); wh.position.set(0, WHEEL.top, 0); wh.rotation.x = -0.35; g.add(wh);
  const R = WHEEL.r;
  mesh(new THREE.TorusGeometry(R, 2.6, 8, 32), kit.wood, wh, 1.6);
  for (let k = 0; k < 8; k++) { const sp = mesh(new THREE.CylinderGeometry(1.4, 1.8, R - 4, 8), kit.wood, wh, 1.2); const a = k / 8 * Math.PI * 2; sp.position.set(Math.cos(a) * R / 2, Math.sin(a) * R / 2, 0); sp.rotation.z = a + Math.PI / 2; }
  mesh(new THREE.CylinderGeometry(6, 6, 8, 12), kit.wood, wh, 1.4).rotation.x = Math.PI / 2;
  // the flames: tongues of ember-cut cloth leaning off the felloe, each a
  // cone that flickers in scale
  const flames = [];
  const fm = mat({ ink: EMBER, freq: 1.4, angle: 1.5708, uv: [14, 10], tone: 0.35, ember: 1 });
  for (let k = 0; k < 7; k++) {
    const a = k / 7 * Math.PI * 2 + 0.3, f = new THREE.Mesh(new THREE.ConeGeometry(5 + Math.random() * 3, 16 + Math.random() * 12, 7), fm);
    f.position.set(Math.cos(a) * R, Math.sin(a) * R, 0); f.rotation.z = a - Math.PI / 2; wh.add(f); flames.push(f);
  }
  g.userData = { wheel: wh, flames };
  return g;
}
// the gibbets on the knoll: posts and beams, the hanged in bone line
function buildGibbets(kit, rnd) {
  const g = new THREE.Group();
  [[-30, -60], [70, -10], [20, 50]].forEach(([dx, dz], k) => {
    const post = new THREE.Group(); post.position.set(KNOLL.at[0] + dx, 0, KNOLL.at[2] + dz); post.rotation.y = rnd() * 6; g.add(post);
    mesh(new THREE.BoxGeometry(6, 170, 6), kit.wood, post, 1.6).position.y = 85;
    mesh(new THREE.BoxGeometry(60, 5, 5), kit.wood, post, 1.4).position.set(22, 168, 0);
    mesh(new THREE.BoxGeometry(4, 4, 30), kit.wood, post, 1).position.set(14, 150, 0), post.children[post.children.length - 1].rotation.z = -0.8;
    // the rope and the hanged: a skeleton hung by the neck, slack
    const rope = mesh(new THREE.CylinderGeometry(0.6, 0.6, 22, 6), kit.iron, post, 0.8); rope.position.set(46, 156, 0);
    const sk = buildSkeleton(kit, rnd); sk.scale.setScalar(0.92); sk.position.set(46, 146 - 165 * 0.92, 0); sk.rotation.y = rnd() * 6;
    poseSkeleton(sk, 0, 0, true);
    sk.userData.neck.rotation.z = 0.5; sk.userData.arms.l.sh.rotation.z = 0.1; sk.userData.arms.r.sh.rotation.z = -0.1;
    post.add(sk); post.userData.hanged = sk; post.userData.phase = rnd() * 6;
  });
  return g;
}
// the sky: a dome of hatched smoke, the hatch drawn as the plate's lines
// (a canvas, so it can roll), ember along the horizon
function skyTex() {
  return K.canvasTex(2048, 1024, (g, W, H) => {
    g.fillStyle = '#130a07'; g.fillRect(0, 0, W, H);
    const rnd = seeded(29);
    // the ember along the horizon
    const gr = g.createLinearGradient(0, H * 0.45, 0, H); gr.addColorStop(0, 'rgba(210,69,30,0)'); gr.addColorStop(0.7, 'rgba(160,40,16,0.35)'); gr.addColorStop(1, 'rgba(210,69,30,0.6)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    // the smoke: billows drawn as bundles of short curved hatch strokes
    for (let b = 0; b < 520; b++) {
      const cx = rnd() * W, cy = H * (0.05 + rnd() * 0.7), r = 18 + rnd() * 60, dark = rnd() < 0.6;
      g.strokeStyle = dark ? `rgba(232,220,192,${0.05 + rnd() * 0.08})` : `rgba(232,220,192,${0.12 + rnd() * 0.14})`; g.lineWidth = 0.8 + rnd() * 0.8;
      const a0 = rnd() * 6.28;
      for (let s = 0; s < 12; s++) { const rr = r * (0.3 + s / 12 * 0.7), a = a0 + (rnd() - 0.5) * 0.5; g.beginPath(); g.arc(cx, cy, rr, a, a + 0.7 + rnd() * 0.8); g.stroke(); }
    }
    // the ember hatch low down
    for (let i = 0; i < 400; i++) { const x = rnd() * W, y = H * (0.72 + rnd() * 0.28), l = 20 + rnd() * 60; g.strokeStyle = `rgba(210,69,30,${0.2 + rnd() * 0.5})`; g.lineWidth = 1 + rnd(); g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y + (rnd() - 0.5) * 6); g.stroke(); }
  });
}
function buildSky() {
  const tex = skyTex(); tex.wrapS = THREE.RepeatWrapping; tex.repeat.set(3, 1);
  const m = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, toneMapped: false, fog: false });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(SKY, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.6), m);
  dome.position.y = -220;
  dome.userData.tex = tex;
  return dome;
}
// the table: a plank top on a trestle, the cloth a square of black felt
// cut with a border; the broadside's rail at the back
function buildTable(kit) {
  const g = new THREE.Group();
  const top = mesh(new THREE.BoxGeometry(TABLE.w, TABLE.slab, TABLE.d), kit.wood, g, 2); top.position.set(0, -TABLE.slab / 2, TABLE.z0 + TABLE.d / 2);
  [-1, 1].forEach(s => { const leg = mesh(new THREE.BoxGeometry(6, 76, 40), kit.wood, g, 1.6); leg.position.set(s * (TABLE.w / 2 - 12), -TABLE.slab - 38, TABLE.z0 + TABLE.d / 2); leg.rotation.z = s * 0.1; });
  mesh(new THREE.BoxGeometry(TABLE.w - 30, 5, 5), kit.wood, g, 1.4).position.set(0, -50, TABLE.z0 + TABLE.d / 2);
  const rail = mesh(new THREE.BoxGeometry(TABLE.w, 8, 4), kit.wood, g, 1.6); rail.position.set(0, 2, TABLE.z0 + TABLE.d - 2);
  // the cloth: ink, the cut border (a plane with its own hatch band)
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(TABLE.w - 14, TABLE.d - 16), mat({ tone: 0.78, freq: 0.9, angle: 0.5, wobble: 1.4 }));
  cloth.rotation.x = -Math.PI / 2; cloth.position.set(0, 0.06, TABLE.z0 + TABLE.d / 2 - 1); g.add(cloth);
  // a few things on the cloth: a skull cup, three bone dice, coins
  const cup = mesh(new THREE.SphereGeometry(5.5, 18, 12, 0, Math.PI * 2, 0.9, Math.PI - 0.9), mat({ uv: [30, 14], angle: 1.5708 }), g, 1.4); cup.position.set(-34, 3.4, 30); cup.rotation.x = Math.PI;
  for (let i = 0; i < 3; i++) { const d = mesh(new THREE.BoxGeometry(4, 4, 4), mat({ freq: 2.6, angle: 0.7, tone: -0.05 }), g, 1.1); d.position.set(14 + i * 7, 2, 18 + (i % 2) * 6); d.rotation.y = i * 0.7; }
  const coinM = mat({ ink: EMBER, freq: 3.2, angle: 0.9, tone: 0.15, uv: null });
  for (let i = 0; i < 7; i++) { const c = mesh(new THREE.CylinderGeometry(3, 3, 0.5, 14), coinM, g, 0.8); c.position.set(-8 + (i % 3) * 7, 0.3 + Math.floor(i / 3) * 0.6, 12 + Math.floor(i / 3) * 5); }
  return g;
}
// embers: specks that lift off the fires, drift on the wind and go out
function buildEmbers(n) {
  const geo = new THREE.PlaneGeometry(1.4, 1.4);
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.8, 0.25), toneMapped: false, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
  const inst = new THREE.InstancedMesh(geo, m, n); inst.frustumCulled = false;
  return inst;
}

// ------------------------------------------------------------ the broadside
// A printed sheet: bone paper, Fell's letters in ink, the hand's box in
// blood with the letters left in bone; nailed to the rail at the corners.
// (laid out as the page's own sheet is - app.css .r3b-* - at SHEET.px to
// the cm, so the taps land where the print is)
const SL = { x: 70, rx: 1120, eyebrowY: 110, eyebrow: 52, numY: 560, now: 340, ampm: 64, ready: 420, runY: 760, runH: 240, run: 108, label: 72 };
function buildSheetBody() {
  const g = new THREE.Group();
  const c = document.createElement('canvas');
  c.width = 1800; c.height = Math.round(1800 * SHEET.h / SHEET.w);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const m = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(SHEET.w, SHEET.h), m);
  g.add(face);
  // the nails, one at each corner
  const nm = new THREE.MeshStandardMaterial({ color: 0x2a221c, roughness: 0.6, metalness: 0.5 });
  [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sy]) => { const n = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), nm); n.position.set(sx * (SHEET.w / 2 - 2.4), sy * (SHEET.h / 2 - 2.2), -0.4); g.add(n); });
  g.userData.print = { draw: v => { drawSheet(c.getContext('2d'), c.width, c.height, v); tex.needsUpdate = true; } };
  return g;
}
let sheetBack = null, sheetLayer = null;
function sheetBackOf(W, H) {
  if (sheetBack && sheetBack.width === W) return sheetBack;
  sheetBack = document.createElement('canvas'); sheetBack.width = W; sheetBack.height = H;
  const g = sheetBack.getContext('2d'), rnd = seeded(13);
  g.fillStyle = '#E3D6B8'; g.fillRect(0, 0, W, H);
  // laid paper: the chain lines, the laid lines, foxing, the plate mark
  for (let x = 0; x < W; x += 54) { g.fillStyle = 'rgba(120,100,70,0.08)'; g.fillRect(x, 0, 1.5, H); }
  for (let y = 0; y < H; y += 3) { g.fillStyle = `rgba(120,100,70,${(0.02 + rnd() * 0.04).toFixed(3)})`; g.fillRect(0, y, W, 1); }
  for (let i = 0; i < 70; i++) { const x = rnd() * W, y = rnd() * H, r = 4 + rnd() * 26, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(150,110,60,${(0.08 + rnd() * 0.14).toFixed(2)})`); gr.addColorStop(1, 'rgba(150,110,60,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); }
  g.strokeStyle = 'rgba(40,24,16,0.5)'; g.lineWidth = 3; g.strokeRect(40, 40, W - 80, H - 80);
  g.strokeStyle = 'rgba(40,24,16,0.35)'; g.lineWidth = 1.5; g.strokeRect(52, 52, W - 104, H - 104);
  // a blood thumbprint on one corner
  const tx = W * 0.9, ty = H * 0.2;
  for (let r = 0; r < 14; r++) { g.strokeStyle = `rgba(142,14,14,${(0.25 + rnd() * 0.3).toFixed(2)})`; g.lineWidth = 2.2; g.beginPath(); g.ellipse(tx, ty, 10 + r * 3.4, 14 + r * 4.4, 0.3, rnd() * 2, rnd() * 2 + 3); g.stroke(); }
  return sheetBack;
}
function drawSheet(g, W, H, v) {
  const k = W / (SHEET.w * SHEET.px), P = n => n * k;
  g.drawImage(sheetBackOf(W, H), 0, 0);
  if (!sheetLayer || sheetLayer.width !== W) { sheetLayer = document.createElement('canvas'); sheetLayer.width = W; sheetLayer.height = H; }
  const L = sheetLayer.getContext('2d');
  L.clearRect(0, 0, W, H);
  const ink = '#1A0F0C', dim = 'rgba(26,15,12,0.72)', blood = '#8E0E0E', bone = '#EBE1CB';
  const type = (s, x, y, font, color, align = 'left') => { L.font = font; L.textAlign = align; L.textBaseline = 'alphabetic'; L.fillStyle = color; L.fillText(s, x, y); };
  type('THE VALLEY', P(SL.x), P(SL.eyebrowY), `${P(SL.label)}px "IM Fell English SC", Georgia, serif`, dim);
  const nowFont = `${P(SL.now)}px "IM Fell DW Pica", "IM Fell English", Georgia, serif`;
  type(v.now, P(SL.x), P(SL.numY), nowFont, ink);
  L.font = nowFont; const nowW = L.measureText(v.now).width;
  type(v.ampm, P(SL.x) + nowW + P(16), P(SL.numY), `italic ${P(SL.ampm)}px "IM Fell English", Georgia, serif`, dim);
  type(v.value > 0 ? `READY · ~$${v.value.toFixed(2)}` : 'READY', P(SL.rx), P(SL.eyebrowY), `${P(SL.label)}px "IM Fell English SC", Georgia, serif`, blood);
  type(v.ready, P(SL.rx), P(SL.numY), `${P(SL.ready)}px "IM Fell DW Pica", "IM Fell English", Georgia, serif`, ink);
  // the hand's box: blood red, the letters left bone, a rule round it
  const bx = P(SL.x), by = P(SL.runY), bw = W - 2 * P(SL.x), bh = P(SL.runH);
  L.fillStyle = blood; L.fillRect(bx, by, bw, bh);
  L.strokeStyle = ink; L.lineWidth = P(3); L.strokeRect(bx + P(6), by + P(6), bw - P(12), bh - P(12));
  type('Deal your hand', bx + bw / 2, by + bh / 2 + P(SL.run * 0.34), `${P(SL.run)}px "IM Fell English SC", Georgia, serif`, bone, 'center');
  // the ink a little broken, as a print is
  L.globalCompositeOperation = 'destination-out';
  const rnd = seeded(K.hash(`${v.now}|${v.ready}`));
  for (let i = 0; i < 1400; i++) { const x = rnd() * W, y = rnd() * H, s = P(0.6 + rnd() * 1.6); L.fillStyle = `rgba(0,0,0,${(0.3 + rnd() * 0.5).toFixed(2)})`; L.fillRect(x, y, s, s); }
  L.globalCompositeOperation = 'source-over';
  g.drawImage(sheetLayer, 0, 0);
}
function sheetHTML() {
  return `<div class="r3b-sheet-in">
    <div class="r3b-eyebrow r3b-a">THE VALLEY</div>
    <div class="r3b-clock"><b class="r3b-now">--:--</b><small class="r3b-ampm"></small></div>
    <div class="r3b-eyebrow r3b-b r3b-red">READY</div>
    <div class="r3b-ready">&mdash;</div>
    <button type="button" class="r3b-run">Deal your hand</button>
  </div>`;
}

// ------------------------------------------------------------ the sound
// The valley's own score, made here (no loops): two hurdy-gurdy drones a
// fifth apart (sawtooths through a formant, their trompette buzz a slow
// beat), a choir's hum (three voices through vowel bandpasses), a timpani
// dirge at 70 to the minute (one stroke a bar, a flam every fourth), the
// wind (filtered noise, gusting) and, far off, a bell every minute or so.
function valleySound() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  let ctx, master, up = false, started = false, timer = 0, bellT = 0;
  const srcs = [];
  function start() {
    if (started) return; started = true;
    try {
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
      const osc = (type, f) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; srcs.push(o); return o; };
      const gain = v => { const g = ctx.createGain(); g.gain.value = v; return g; };
      const filt = (type, f, q) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
      // the drones: D2 and A2, each two saws a few cents apart through a
      // bodied formant; the trompette's buzz an LFO on the second's gain
      const drone = gain(SND.drone);
      [[73.42, 0], [73.42, 3], [110, 0], [110, -4]].forEach(([f, cents]) => { const o = osc('sawtooth', f * Math.pow(2, cents / 1200)), b = filt('bandpass', 520, 1.4), g = gain(0.5); o.connect(b); b.connect(g); g.connect(drone); });
      const buzz = osc('sawtooth', 146.83), bb = filt('bandpass', 1800, 3), bg = gain(0), lfo = osc('sine', 0.23), lg = gain(0.12); lfo.connect(lg); lg.connect(bg.gain); buzz.connect(bb); bb.connect(bg); bg.connect(drone);
      drone.connect(master);
      // the choir: D3 A3 D4 saws through two vowel bands each, swelling slowly
      const choir = gain(SND.choir), swell = osc('sine', 0.05), sg = gain(SND.choir * 0.6); swell.connect(sg); sg.connect(choir.gain);
      [146.83, 220, 293.66].forEach((f, i) => { const o = osc('sawtooth', f * (1 + (i - 1) * 0.0015)); const b1 = filt('bandpass', 400, 6), b2 = filt('bandpass', 800 + i * 150, 6), g = gain(0.4); o.connect(b1); o.connect(b2); b1.connect(g); b2.connect(g); g.connect(choir); });
      choir.connect(master);
      // the wind: noise through a lowpass whose cutoff gusts
      const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), nd = noise.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      const ns = ctx.createBufferSource(); ns.buffer = noise; ns.loop = true; srcs.push(ns);
      const wlp = filt('lowpass', 500, 0.8), wg = gain(SND.wind), gust = osc('sine', 0.07), gg = gain(300); gust.connect(gg); gg.connect(wlp.frequency);
      ns.connect(wlp); wlp.connect(wg); wg.connect(master);
      srcs.forEach(o => o.start());
      // the timpani: a sine dropping an octave with a noise thump, on the bar
      const BAR = 60 / 70 * 4;
      const drum = (t, level) => {
        const o = ctx.createOscillator(), g = gain(0), th = ctx.createBufferSource(), tf = filt('lowpass', 240, 1), tg = gain(0);
        o.frequency.setValueAtTime(96, t); o.frequency.exponentialRampToValueAtTime(52, t + 0.35);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(SND.drum * level, t + 0.012); g.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
        th.buffer = noise; tg.gain.setValueAtTime(SND.drum * 0.5 * level, t); tg.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        o.connect(g); g.connect(master); th.connect(tf); tf.connect(tg); tg.connect(master);
        o.start(t); o.stop(t + 1.7); th.start(t); th.stop(t + 0.2);
      };
      let bar = 0, next = ctx.currentTime + 0.5;
      const bell = t => {
        [1, 2.0, 2.76, 4.07, 5.4].forEach((r, i) => { const o = ctx.createOscillator(), g = gain(0); o.frequency.value = 164.8 * r; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(SND.bell * [1, 0.5, 0.4, 0.22, 0.12][i], t + 0.004); g.gain.exponentialRampToValueAtTime(0.0005, t + 6 - i * 0.6); o.connect(g); g.connect(master); o.start(t); o.stop(t + 6.5); });
      };
      bellT = 40 + Math.random() * 30;
      timer = setInterval(() => {
        if (!up) return;
        while (next < ctx.currentTime + 1.2) {
          drum(next, 1); if (bar % 4 === 3) drum(next - 0.07, 0.45);
          bar++; next += BAR;
        }
        bellT -= 0.5; if (bellT <= 0) { bell(ctx.currentTime + 0.1); bellT = 50 + Math.random() * 40; }
      }, 500);
    } catch (e) { started = false; }
  }
  return {
    set(on) {
      if (on && !started) start();
      if (!ctx) return;
      if (on && ctx.state === 'suspended') ctx.resume().catch(() => {});
      up = !!on;
      master.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.8);
    },
    dispose() { clearInterval(timer); srcs.forEach(o => { try { o.stop(); } catch (e) {} }); if (ctx) { try { ctx.close(); } catch (e) {} } }
  };
}

// ------------------------------------------------------------ prepare
export async function prepareTable(opts) {
  const o = Object.assign({ scene: null, dest: 'valley', hooks: {} }, opts);
  const scene = o.scene;
  if (!scene.userData.set) throw new Error('valley: the intro set is missing');
  const hooks = o.hooks || {};
  const seat = new THREE.Group();
  seat.position.set(...SEAT.at);
  seat.rotation.y = SEAT.yaw * DEG;
  seat.visible = false;
  scene.add(seat);
  const breathe = () => new Promise(r => setTimeout(r, 0));

  // the type: the engraver's letters, waited for with the sheet's
  const TYPE = 'https://fonts.googleapis.com/css2?family=IM+Fell+English:ital@0;1&family=IM+Fell+English+SC&family=IM+Fell+DW+Pica&family=Pinyon+Script&display=swap';
  if (![...document.querySelectorAll('link[rel="stylesheet"]')].some(l => l.href === TYPE)) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = TYPE; document.head.appendChild(l); }
  if (document.fonts && document.fonts.load) await Promise.all(['40px "IM Fell English"', '40px "IM Fell English SC"', '40px "IM Fell DW Pica"'].map(f => document.fonts.load(f).catch(() => {})));

  // the kit: the few materials everything is cut with
  const kit = {
    bone: mat({ freq: 1.1, angle: 1.2, tone: -0.08 }),
    // (a long bone: strokes down its length; a joint or a skull: its
    // rings; a rib: strokes along the rib)
    shaft: mat({ uv: [14, 1], angle: 0, freq: 1, tone: -0.08, wobble: 1.4 }),
    ball: mat({ uv: [22, 10], angle: 1.5708, freq: 1, tone: -0.08 }),
    rib: mat({ uv: [1, 9], angle: 1.5708, freq: 1, tone: -0.05, wobble: 1.2 }),
    skull: mat({ uv: [36, 18], angle: 1.5708, freq: 1, tone: -0.1, wobble: 0.8 }),
    ink: new THREE.MeshBasicMaterial({ color: INK }),
    wood: mat({ freq: 0.8, angle: 1.5708, tone: 0.42, wobble: 1.2 }),
    iron: mat({ freq: 1.6, angle: 0.3, tone: 0.45 })
  };
  const rnd = seeded(23);
  const ground = buildGround(); seat.add(ground);
  await breathe();
  const river = buildRiver(scene.environment); seat.add(river);
  const sky = buildSky(); seat.add(sky);
  await breathe();
  seat.add(buildTable(kit));
  const dealer = buildDealer(kit, rnd); dealer.position.set(...DEALER.at); dealer.rotation.y = DEALER.yaw; dealer.position.y = ground.userData.height(DEALER.at[0], DEALER.at[2]) + 0.5; seat.add(dealer);
  await breathe();
  const wheel = buildWheel(kit); wheel.position.set(WHEEL.at[0], ground.userData.height(WHEEL.at[0], WHEEL.at[2]) - 4, WHEEL.at[2]); seat.add(wheel);
  const gibbets = buildGibbets(kit, rnd); gibbets.children.forEach(p => { p.position.y = ground.userData.height(p.position.x, p.position.z) - 3; }); seat.add(gibbets);
  await breathe();
  const embers = buildEmbers(120); seat.add(embers);
  const emberP = Array.from({ length: 120 }, () => ({ x: 0, y: 0, z: 0, life: Math.random(), rate: 0.08 + Math.random() * 0.12, vx: 0, vy: 0, src: Math.random() < 0.7 ? 0 : 1 }));
  const sheetBody = buildSheetBody(); sheetBody.position.set(...SHEET.at); sheetBody.rotation.set(SHEET.lean, Math.PI, SHEET.tilt); seat.add(sheetBody);

  // The souls: the deck's ready platforms (the demonstration hand with
  // nothing ready), best first - the best nearest the dealer, down the road.
  const hand = ((hooks.deck && hooks.deck()) || []).slice(0, 7);
  const cards = hand.length ? hand : K.demoHand().slice(0, 6);
  cards.forEach(c => { c.initials = K.initials(c.name); c.spent = c.remaining > 0; });
  const soulsG = new THREE.Group();
  const pivots = [];
  for (let i = 0; i < cards.length; i++) {
    const x = lerp(ROAD.x0 + 20, ROAD.x1 - 20, cards.length > 1 ? i / (cards.length - 1) : 0.5);
    const p = buildSoul(kit, cards[i], i, x, rnd);
    p.position.y = ground.userData.height(p.position.x, p.position.z) + 0.3;
    pivots.push(p); soulsG.add(p);
    await breathe();
  }
  seat.add(soulsG);
  const pivotOf = id => pivots.find(p => p.userData.tag.userData.id === id);
  const setSpent = (id, spent) => {
    const p = pivotOf(id); if (!p) return;
    const t = p.userData.tag.userData;
    if (spent && !t.spentTex) t.spentTex = spentArt(t.card, t.n);
    t.plate.material.map = spent ? t.spentTex : t.liveTex; t.plate.material.needsUpdate = true;
    p.userData.lantern.userData.core.visible = !spent;
  };
  cards.forEach(c => { if (c.spent) setSpent(c.id, true); });
  const sound = valleySound();

  async function fly(world, flyOpts = {}) {
    const fo = Object.assign({ manual: false, reduced: false, duration: 0, onArrive: null, host: null, seatView: null }, flyOpts);
    const { camera } = world;
    const stageEl = fo.host || document.body;
    world.overlays.forEach(el => { el.style.visibility = 'hidden'; });
    const css = new CSS3DRenderer();
    css.domElement.className = 'r3t-css r3b-css';
    const cssScene = new THREE.Scene();
    const cssSeat = new THREE.Group();
    cssSeat.position.copy(seat.position); cssSeat.quaternion.copy(seat.quaternion);
    cssScene.add(cssSeat);
    let aspect = 1;
    const size = () => { world.size(); const box = world.canvas.parentElement || world.host; const w = box.clientWidth || window.innerWidth, h = box.clientHeight || window.innerHeight; css.setSize(w, h); return w / h; };
    aspect = size();
    stageEl.appendChild(css.domElement);
    const toWorld = v => seat.localToWorld(v.clone());
    seat.updateMatrixWorld(true);
    const seatView = () => {
      if (fo.seatView) { const [ey, ez, az, fv] = fo.seatView; return { eye: V(0, ey, ez), aim: V(0, 46, az), fov: fv }; }
      const v = VIEW[aspect < 0.62 ? 0 : 1];
      return { eye: V(...v.eye), aim: V(...v.aim), fov: v.fov };
    };
    let sv = seatView();
    let E1 = toWorld(sv.eye), A1 = toWorld(sv.aim);
    const E0 = camera.position.clone(), q0 = camera.quaternion.clone();
    const seatBack = toWorld(V(0, 0, -1)).sub(toWorld(V(0, 0, 0))).normalize();
    const F = toWorld(V(0, 50, 120));
    const cruise = THREE.MathUtils.clamp(Math.max(E0.y, E1.y) + 55, 110, 150);
    const bez = (u, a, b, c, d) => { const v = 1 - u; return v * v * v * a + 3 * v * v * u * b + 3 * v * u * u * c + u * u * u * d; };
    const P1 = V(0, 0, 0), P2 = V(0, 0, 0);
    const eyeAt = (k, out) => { const u = smoother(k); P1.copy(E0).lerp(E1, 0.2); P2.copy(E1).addScaledVector(seatBack, 60); const y = E0.y + (cruise - E0.y) * easeOut(k / 0.34, 2) - (cruise - E1.y) * smoother((k - 0.46) / 0.54); return out.set(bez(u, E0.x, P1.x, P2.x, E1.x), y, bez(u, E0.z, P1.z, P2.z, E1.z)); };
    const m4 = new THREE.Matrix4(), up = V(0, 1, 0);
    const lookQ = (eye, at, out) => out.setFromRotationMatrix(m4.lookAt(eye, at, up));
    const FLY = fo.reduced ? 0.01 : fo.duration > 0 ? fo.duration : T.fly;
    const UI_IN = fo.reduced ? 0.01 : T.uiIn;
    const fov0 = camera.fov, near0 = camera.near, far0 = camera.far;
    const lens0 = world.lights.lensLight.intensity, pendant0 = world.lights.pendant.intensity, bloom0 = world.bloom ? world.bloom.strength : 0;
    const introT0 = world.t;
    const env0 = world.scene.environmentIntensity == null ? 1 : world.scene.environmentIntensity;
    const fog0 = world.scene.fog;

    // ---- The UI, built now, shown on arrival.
    const ui = document.createElement('div'); ui.className = 'r3t-ui'; css.domElement.appendChild(ui);
    const sheetEl = document.createElement('div');
    sheetEl.className = 'r3b-sheet';
    sheetEl.style.width = `${Math.round(SHEET.w * SHEET.px)}px`; sheetEl.style.height = `${Math.round(SHEET.h * SHEET.px)}px`;
    sheetEl.innerHTML = sheetHTML();
    const sheetObj = new CSS3DObject(sheetEl);
    sheetObj.position.set(SHEET.at[0], SHEET.at[1] + 1.0 * Math.sin(SHEET.lean), SHEET.at[2] - 1.0 * Math.cos(SHEET.lean));
    sheetObj.rotation.set(SHEET.lean, Math.PI, SHEET.tilt);
    sheetObj.scale.setScalar(1 / SHEET.px);
    cssSeat.add(sheetObj);
    const cardEl = document.createElement('div'); cardEl.className = 'r3t-card r3b-card'; cardEl.setAttribute('role', 'button'); cardEl.tabIndex = -1; cardEl.style.visibility = 'hidden';
    const cardObj = new CSS3DObject(cardEl); cssSeat.add(cardObj);
    K.inkBacks(css.domElement, cards);
    const infoEl = document.createElement('div'); infoEl.className = 'r3t-info'; infoEl.setAttribute('role', 'region'); infoEl.style.visibility = 'hidden'; css.domElement.appendChild(infoEl);
    const phoneEl = document.createElement('div'); phoneEl.className = 'r3t-phone'; phoneEl.setAttribute('role', 'group'); phoneEl.setAttribute('aria-label', 'Phone'); phoneEl.innerHTML = K.phoneHTML(asset); css.domElement.appendChild(phoneEl);
    let phoneHeld = false;
    const holdPhone = on => { phoneHeld = !!on; phoneEl.classList.toggle('r3t-held', phoneHeld); };
    const srList = document.createElement('div'); srList.className = 'r3t-sr';
    srList.innerHTML = `<ul>${cards.map(c => `<li><button type="button" data-id="${K.esc(c.id)}">${K.esc(c.name)}, ${K.esc(K.cardShown(c))}</button></li>`).join('')}</ul>`;
    css.domElement.appendChild(srList);
    css.domElement.classList.add('r3t-hide');

    // ---- Time and the sheet's readouts.
    const q = s => sheetEl.querySelector(s);
    const put = (el, v) => { if (el && el.textContent !== v) el.textContent = v; };
    const sample = () => ({ ready: cards.length, value: cards.reduce((t, c) => t + (c.ev || 0), 0), next: null, done: 0 });
    let changed = false, sheetKey = '', sheetValue = 0;
    function printSheet() { sheetBody.userData.print.draw({ now: q('.r3b-now').textContent, ampm: q('.r3b-ampm').textContent, ready: q('.r3b-ready').textContent, value: sheetValue }); }
    const tick = () => {
      const d = new Date(), hh = d.getHours(), mm = d.getMinutes();
      const hm = `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')}`;
      put(q('.r3b-now'), hm); put(q('.r3b-ampm'), hh < 12 ? 'AM' : 'PM');
      const st = (hand.length && hooks.status && hooks.status()) || sample();
      put(q('.r3b-ready'), String(st.ready));
      sheetValue = st.value || 0;
      const key = `${hm}|${hh < 12 ? 'AM' : 'PM'}|${st.ready}|${sheetValue.toFixed(2)}`;
      if (key !== sheetKey) { sheetKey = key; printSheet(); changed = true; }
      phoneEl.querySelectorAll('.r3t-ph-clock, .r3t-ph-big').forEach(n => put(n, hm));
      put(phoneEl.querySelector('.r3t-ph-day'), d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }));
      put(phoneEl.querySelector('.r3t-ph-ready'), `${st.ready} ready${st.value > 0 ? ` · ~$${st.value.toFixed(2)}` : ''}`);
      put(phoneEl.querySelector('.r3t-ph-next'), st.next ? `Next comes ready in ${K.fmtLeft(st.next)}` : `All caught up · ${st.done} done today`);
      if (hooks.cardState) cards.forEach(c => { const now = hooks.cardState(c.id); if (!now) return; const spent = now.remaining > 0; if (spent !== !!c.spentNow) { c.spentNow = spent; c.remaining = now.remaining; setSpent(c.id, spent); changed = true; } });
      if (sound) sound.set(!fo.reduced && !document.hidden && (!hooks.musicOn || hooks.musicOn()) && arrived);
      if (changed) { changed = false; show(); }
    };

    // ---- The wind: a drag across the table gets it up; it dies down.
    let wind = 0, windT0 = -9, windDir = 1, push = 0;
    const windAt = tt => (windT0 >= 0 ? Math.exp(-(tt - windT0) / 4) * (1 - Math.exp(-(tt - windT0) / 0.3)) * wind : 0);
    const gust = (amp, dir) => { windT0 = tNow; wind = amp; windDir = dir; wake(); };

    // ---- A soul's card: out of the lantern and up to you.
    let cardId = null, lift = 0, liftTo = 0, liftFrom = 0, liftT0 = 0;
    const pw = V(0, 0, 0), qw = new THREE.Quaternion(), seatQi = new THREE.Quaternion();
    const focusPose = (outP, outQ) => { const fov = camera.fov * DEG; const d = K.CARD.h / (0.42 * 2 * Math.tan(fov / 2)); outP.set(0, 0.1 * d, -d).applyQuaternion(camera.quaternion).add(camera.position); outQ.copy(camera.quaternion); };
    const _p0 = V(0, 0, 0), _p1 = V(0, 0, 0), _q1 = new THREE.Quaternion(), flipQ = new THREE.Quaternion();
    const poseCard = tt => {
      if (!cardId) { if (cardEl.style.visibility !== 'hidden') cardEl.style.visibility = 'hidden'; return; }
      lift = fo.reduced ? liftTo : lerp(liftFrom, liftTo, smoother((tt - liftT0) / T.lift));
      if (lift <= 0.001 && liftTo === 0) { cardId = null; cardEl.style.visibility = 'hidden'; hideInfo(); return; }
      const p = pivotOf(cardId); if (!p) return;
      p.userData.plate.getWorldPosition(_p0);
      focusPose(_p1, _q1);
      const k = lift;
      pw.copy(_p0).lerp(_p1, k);
      pw.addScaledVector(V(0, 1, 0).applyQuaternion(camera.quaternion), Math.sin(Math.PI * k) * 3);
      flipQ.setFromAxisAngle(V(0, 1, 0), Math.PI * (1 - smoother(clamp01((k - 0.15) / 0.7))));
      qw.copy(_q1).multiply(flipQ);
      const tagPx = 13 * 1.9 / K.CARD.h;
      const sc = lerp(tagPx, 1, smoother(k)) / K.CARD.px;
      seatQi.copy(seat.quaternion).invert();
      cardObj.position.copy(pw); seat.worldToLocal(cardObj.position);
      cardObj.quaternion.copy(seatQi).multiply(qw);
      cardObj.scale.setScalar(sc);
      cardEl.style.visibility = 'visible';
      const n = V(0, 0, 1).applyQuaternion(qw), toCam = camera.position.clone().sub(pw);
      cardEl.classList.toggle('r3t-up', n.dot(toCam) > 0);
      p.userData.plate.visible = k < 0.5;
    };
    const showInfo = id => {
      const d = hooks.cardInfo ? hooks.cardInfo(id) : null;
      if (!d) { hideInfo(); return; }
      const tier = K.tierOf(d.tier);
      infoEl.setAttribute('aria-label', `${d.name}: keen info`);
      infoEl.innerHTML = `<div class="r3t-info-in"><div class="r3t-info-head"><span class="r3t-info-tier t-${tier}">${tier === 'U' ? '&bull;' : tier}</span><b>${K.esc(d.name)}</b><span class="r3t-info-state${d.ready ? ' r3t-ready' : ''}">${K.esc(d.state)}</span><button type="button" class="r3t-info-x" aria-label="Put the card back">&times;</button></div><div class="r3t-info-acts">${(d.acts || []).map(([act, label]) => `<button type="button" class="r3t-act r3t-act-${K.esc(act)}" data-act="${K.esc(act)}">${K.esc(label)}</button>`).join('')}</div><div class="r3t-info-body">${d.html || ''}</div></div>`;
      infoEl.style.visibility = 'visible';
      requestAnimationFrame(() => { if (cardId === id) infoEl.classList.add('r3t-open'); });
    };
    function hideInfo() { infoEl.classList.remove('r3t-open'); infoEl.style.visibility = 'hidden'; }
    const takeCard = id => {
      const c = cards.find(x => x.id === id); if (!c) return;
      if (cardId && cardId !== id) { const p = pivotOf(cardId); if (p) { p.userData.plate.visible = true; p.userData.lookTo = 0; } cardId = null; lift = 0; }
      cardId = id;
      const p = pivotOf(id); if (p) p.userData.lookTo = 1;
      cardEl.innerHTML = K.cardHTML(Object.assign({}, c, { remaining: c.spentNow ? c.remaining : 0 }));
      cardEl.dataset.id = id;
      liftFrom = lift; liftTo = 1; liftT0 = tNow;
      showInfo(id);
      if (hooks.cardTap) hooks.cardTap(id, true, c.tier);
      wake();
    };
    const putBack = () => {
      if (!cardId) return;
      const p = pivotOf(cardId); if (p) p.userData.lookTo = 0;
      liftFrom = lift; liftTo = 0; liftT0 = tNow;
      hideInfo();
      if (hooks.cardTap) hooks.cardTap(cardId, false);
      wake();
    };

    // ---- The frame at time tt.
    let tNow = 0, arrived = false;
    const flyEye = V(0, 0, 0), qTable = new THREE.Quaternion(), qSeat = new THREE.Quaternion(), camQ = new THREE.Quaternion();
    const placeCamera = tt => {
      camera.up.copy(up);
      if (tt < FLY) {
        const u = smoother(tt / FLY), e = eyeAt(tt / FLY, flyEye);
        lookQ(e, F, qTable); lookQ(E1, A1, qSeat);
        camQ.copy(q0).slerp(qTable, smoother(tt / (FLY * 0.3))).slerp(qSeat, smoother((u - 0.62) / 0.38));
        camera.position.copy(e); camera.quaternion.copy(camQ); camera.fov = lerp(fov0, sv.fov, smoother(u));
      } else { camera.position.copy(E1); camera.lookAt(A1); camera.fov = sv.fov; }
      camera.near = near0; camera.far = Math.max(far0, SKY * 3);
      camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    };
    const em4 = new THREE.Matrix4(), eq = new THREE.Quaternion(), es = V(1, 1, 1), ep = V(0, 0, 0);
    const wheelAt = V(WHEEL.at[0], 0, WHEEL.at[2]);
    const placeEmbers = (tt, dt) => {
      const w = windAt(tt) * windDir;
      emberP.forEach((e, i) => {
        if (fo.reduced) { embers.setMatrixAt(i, em4.makeScale(0, 0, 0)); return; }
        e.life += dt * e.rate;
        if (e.life >= 1) {
          e.life = 0;
          if (e.src === 0) { e.x = wheelAt.x + (Math.random() - 0.5) * 40; e.z = wheelAt.z + (Math.random() - 0.5) * 20; e.y = wheel.position.y + WHEEL.top + (Math.random() - 0.5) * 50; }
          else { e.x = (Math.random() - 0.5) * 400; e.z = 420 + Math.random() * 300; e.y = ground.userData.height(e.x, e.z) + 10; }
          e.vx = (Math.random() - 0.5) * 8; e.vy = 14 + Math.random() * 18;
        }
        e.x += (e.vx + w * 40 + Math.sin(tt * 2 + i) * 3) * dt; e.y += e.vy * dt;
        const s = (1 - e.life) * (0.7 + 0.5 * Math.sin(tt * 9 + i)) * 1.6;
        eq.setFromAxisAngle(up, 0); ep.set(e.x, e.y, e.z); es.setScalar(Math.max(0.01, s));
        embers.setMatrixAt(i, em4.compose(ep, eq, es));
      });
      embers.instanceMatrix.needsUpdate = true;
    };
    let lastT = 0;
    const keyW = KEY_SEAT.clone().applyQuaternion(seat.quaternion);
    const update = tt => {
      const dt = Math.min(0.1, Math.max(0, tt - lastT)); lastT = tt;
      tNow = tt;
      placeCamera(tt);
      world.stage(introT0 + tt);
      const sat = fo.reduced ? 1 : smoother((tt - FLY * 0.45) / (FLY * 0.55));
      world.scene.environmentIntensity = env0 * lerp(1, 0.25, sat);
      world.lights.pendant.intensity = pendant0;
      const kf = fo.reduced ? 1 : clamp01(tt / 0.9);
      world.lights.lensLight.intensity = lens0 * (1 - kf);
      world.lights.rim.intensity *= 1 - 0.6 * kf;
      if (world.bloom) world.bloom.strength = fo.reduced ? 0 : lerp(bloom0, 0.42, kf);
      // the fog of the house's room would grey the valley: off once out of the house
      world.scene.fog = sat > 0.5 ? null : fog0;
      // the dance: each soul its own step; the one you took turns to you
      const w = windAt(tt) * windDir;
      pivots.forEach((p, i) => {
        const d = p.userData;
        d.look = fo.reduced ? d.lookTo : lerp(d.look, d.lookTo, 1 - Math.exp(-dt * 5));
        poseSkeleton(d.sk, tt, d.look, fo.reduced);
        // the lantern swings on its pole with the step and the wind
        const L = d.lantern; L.rotation.z = (fo.reduced ? 0 : Math.sin(tt * 1.9 + d.sk.userData.phase) * 0.12) + w * 0.5; L.rotation.x = fo.reduced ? 0 : Math.sin(tt * 1.3 + i) * 0.08;
      });
      // Death breathes, and turns his skull to the soul you took
      const dd = dealer.userData, look = pivots.reduce((a, p) => Math.max(a, p.userData.look), 0);
      dd.sk.userData.spine.rotation.x = fo.reduced ? 0 : Math.sin(tt * 0.6 + dd.phase) * 0.025;
      dd.sk.userData.neck.rotation.y = lerp(0, 0.8, look) + (fo.reduced ? 0 : Math.sin(tt * 0.27) * 0.08);
      dd.sk.userData.neck.rotation.x = fo.reduced ? 0 : Math.sin(tt * 0.4 + 2) * 0.03;
      dd.cowl.rotation.y = dd.sk.userData.neck.rotation.y * 0.8;
      // the wheel turns; its flames flicker and lean with the wind
      if (!fo.reduced) { wheel.userData.wheel.rotation.z = tt * 0.12; wheel.userData.flames.forEach((f, i) => { f.scale.set(1 + 0.2 * Math.sin(tt * 7 + i * 2), 1 + 0.35 * Math.sin(tt * 9 + i), 1); f.rotation.y = w * 0.6; }); }
      // the hanged turn on their ropes
      gibbets.children.forEach((g, i) => { g.userData.hanged.rotation.y += (fo.reduced ? 0 : (0.06 + w * 0.4) * dt) * (i % 2 ? 1 : -1); g.userData.hanged.rotation.z = fo.reduced ? 0 : Math.sin(tt * 0.5 + g.userData.phase) * 0.03 + w * 0.08; });
      // the river flows (its sheen crawls), the sky's smoke rolls
      if (!fo.reduced) { sky.userData.tex.offset.x = tt * 0.004 + w * 0.002; river.userData.flow.clearcoatRoughness = 0.08 + 0.03 * Math.sin(tt * 1.3); }
      placeEmbers(tt, fo.reduced ? 0 : dt);
      burinTick(seat, camera, world.renderer, tt, keyW);
      poseCard(tt);
      sheetEl.style.visibility = tt < FLY ? 'hidden' : '';
      const stg = world.canvas.parentElement;
      if (stg && stg.classList.contains('r3t-focus') !== !!(cardId && liftTo)) stg.classList.toggle('r3t-focus', !!(cardId && liftTo));
      const uiK = clamp01((tt - FLY + 0.1) / UI_IN);
      css.domElement.style.setProperty('--r3t-in', uiK.toFixed(3));
      css.domElement.classList.toggle('r3t-hide', uiK <= 0);
      if (!arrived && tt >= FLY) { arrived = true; if (fo.onArrive) fo.onArrive(css.domElement); if (sound) sound.set(!fo.reduced && (!hooks.musicOn || hooks.musicOn())); }
    };
    const draw = () => { world.paint(); css.render(cssScene, camera); };
    const show = () => { if (running) draw(); else world.rest(draw); };

    // ---- The loop: the valley is never still unless motion is reduced.
    let running = false, raf = 0, last = 0, woke = 0, disposed = false, dragging = false;
    const pacer = world.pacer ? world.pacer() : null;
    const busy = () => !fo.reduced || tNow < FLY + UI_IN + 0.1 || dragging || (cardId && Math.abs(lift - liftTo) > 1e-3);
    const loop = now => {
      if (!running) return;
      if (pacer && !pacer.due(now)) { raf = requestAnimationFrame(loop); return; }
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
      if (last && ++woke > 6 && !document.hidden && now - last < 250) world.pace((now - last) / 1000);
      last = now;
      update(tNow + dt);
      if (!busy()) { running = false; world.rest(draw); return; }
      draw();
      raf = requestAnimationFrame(loop);
    };
    const wake = () => {
      if (disposed) return;
      if (fo.manual) { update(tNow); world.rest(draw); return; }
      if (!running) { running = true; last = 0; woke = 0; if (pacer) pacer.reset(); world.move(); raf = requestAnimationFrame(loop); }
    };
    if (world.onRestore) world.onRestore(() => { if (!disposed) show(); });

    // ---- Touch: a soul or its lantern (its card), the table (the wind).
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    const hitAt = e => {
      const r = css.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObject(soulsG, true)[0];
      if (hit) { let ob = hit.object; while (ob && ob.parent !== soulsG) ob = ob.parent; if (ob && ob.userData.tag) return { id: ob.userData.tag.userData.id }; }
      let best = null, bestD = Infinity;
      pivots.forEach(p => { p.userData.plate.getWorldPosition(pw); const d = ray.ray.distanceToPoint(pw), tol = 16; if (d < tol && d < bestD) { bestD = d; best = { id: p.userData.tag.userData.id }; } });
      return best;
    };
    let press = null;
    const onStage = e => { const st = world.canvas.parentElement; return !!(st && e.target && st.contains(e.target)); };
    const onDown = e => { if (tNow < FLY || e.button > 0 || !onStage(e)) return; if (e.target.closest && e.target.closest('.r3b-sheet, .r3t-info, .r3t-phone, .r3t-card')) return; press = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 }; };
    const onMove = e => { if (!press || e.pointerId !== press.id) return; const dx = e.clientX - press.x, dy = e.clientY - press.y; press.moved += Math.abs(dx) + Math.abs(dy); push += dx; if (press.moved > 8 && !dragging) { dragging = true; putBack(); wake(); } };
    const onUp = e => {
      if (!press || e.pointerId !== press.id) return;
      const wasDrag = dragging; dragging = false; press = null;
      if (wasDrag) { gust(Math.min(1.6, 0.4 + Math.abs(push) / 120), Math.sign(push) || 1); push = 0; return; }
      if (cardId && liftTo) { putBack(); return; }
      const h = hitAt(e); if (h && h.id) takeCard(h.id);
    };
    window.addEventListener('pointerdown', onDown, true); window.addEventListener('pointermove', onMove, true); window.addEventListener('pointerup', onUp, true);
    const onCancel = () => { dragging = false; press = null; push = 0; };
    window.addEventListener('pointercancel', onCancel, true);
    css.domElement.addEventListener('click', e => {
      const act = e.target.closest('.r3t-info [data-act]');
      if (act) { const id = cardId; putBack(); if (hooks.cardAction && id) hooks.cardAction(id, act.dataset.act); tick(); return; }
      if (e.target.closest('.r3t-info-x')) { putBack(); return; }
      if (e.target.closest('.r3t-card')) { putBack(); return; }
      if (e.target.closest('.r3b-run')) { if (hooks.run) hooks.run(); return; }
      const sr = e.target.closest('.r3t-sr button'); if (sr) { takeCard(sr.dataset.id); return; }
      const tile = e.target.closest('.r3t-ph-tile, .r3t-ph-gear'); if (tile) { if (hooks.openView) hooks.openView(tile.dataset.view); return; }
      if (e.target.closest('.r3t-ph-pickup')) { holdPhone(true); return; }
      if (e.target.closest('.r3t-ph-put')) { holdPhone(false); return; }
      if (e.target.closest('.r3t-phone') && !phoneHeld) holdPhone(true);
    });
    const onKey = e => { if (e.key !== 'Escape') return; if (phoneHeld) holdPhone(false); else if (cardId && liftTo) putBack(); };
    css.domElement.addEventListener('keydown', onKey);
    const onResize = () => { aspect = size(); sv = seatView(); E1 = toWorld(sv.eye); A1 = toWorld(sv.aim); update(tNow); show(); };
    window.addEventListener('resize', onResize);
    const onVis = () => { if (sound) sound.set(!document.hidden && arrived && !fo.reduced && (!hooks.musicOn || hooks.musicOn())); };
    document.addEventListener('visibilitychange', onVis);

    tick();
    const clock = setInterval(tick, 1000);
    update(0);
    if (fo.manual) world.rest(draw); else { draw(); running = true; raf = requestAnimationFrame(loop); }

    return {
      dest: 'valley',
      duration: FLY,
      get t() { return tNow; },
      seek(t) { tNow = t; lastT = t; update(t); show(); },
      takeCard(id) { takeCard(id || cards[0].id); },
      putBack,
      swing(amp = 1, dir = 1) { gust(amp, dir); update(tNow); show(); },
      pickUpPhone(on = true) { holdPhone(on); },
      tags: cards.map(c => c.id),
      screenOf(id) {
        const r = css.domElement.getBoundingClientRect();
        if (id === 'run') { const b = sheetEl.querySelector('.r3b-run').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }
        const p = pivotOf(id); if (!p) return null;
        const w = p.userData.plate.getWorldPosition(V(0, 0, 0)).project(camera);
        return { x: r.left + (w.x + 1) / 2 * r.width, y: r.top + (1 - w.y) / 2 * r.height };
      },
      get state() { return { card: cardId, lift: +lift.toFixed(3), wind: +windAt(tNow).toFixed(3), running }; },
      get programs() { return world.renderer.info.programs.length; },
      setFelt() {}, setTrim() {},
      lab: () => ({ seat, ground, sky, river, dealer, wheel, gibbets, soulsG, embers, sheetBody, pivots }),
      dispose() {
        disposed = true; running = false; cancelAnimationFrame(raf);
        clearInterval(clock);
        if (sound) sound.dispose();
        window.removeEventListener('resize', onResize);
        window.removeEventListener('pointerdown', onDown, true); window.removeEventListener('pointermove', onMove, true); window.removeEventListener('pointerup', onUp, true); window.removeEventListener('pointercancel', onCancel, true);
        document.removeEventListener('visibilitychange', onVis);
        world.scene.environmentIntensity = env0; world.scene.fog = fog0;
        camera.near = near0; camera.far = far0; camera.updateProjectionMatrix();
        css.domElement.remove();
      }
    };
  }

  if (o.warm) { try { await o.warm({ show: [seat], spread: true }); } catch (e) { /* compiled on first draw */ } }
  seat.visible = true;
  return { dest: 'valley', fly, dispose() { scene.remove(seat); K.freeTree(seat, scene.userData.set); } };
}
