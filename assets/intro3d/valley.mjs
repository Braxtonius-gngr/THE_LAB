// THE VALLEY: Burin & Brimstone's home at Showroom (three.js + CSS3D).
//
// After the roll intro has floated up, a tap on the landing starts one
// continuous shot, as it does for the card table (table.mjs): the camera
// rises out of the float and glides across the room, away from the gaming
// floor - and out of the house altogether, onto a rock shelf over a valley
// that is a PAGE. The whole world is a woodcut after Holbein's Dance of
// Death (Lyon, 1538): bone paper, iron-gall ink, the forms turned in a few
// clear planes and hatched, the darks crossed; the only colour anywhere is
// blood. You are the dealer - Death - at a plank table on the shelf: the
// camera is his eye, and his bare forearms reach into the frame's foot, one
// hand on his hourglass, the other over a skull cup. Round him on a half
// ring the dance goes on, one Death to a vignette, each at his own work as
// Holbein drew him (the Duchess, the Old Woman, the Rich Man): Death saws a
// hanged man in two, winds a man's bowels onto a windlass, flays another
// against a dead tree, breaks a third on the wheel, drums under the
// gallows, holds his glass up to a man on the stake and drags one more off.
// You face one of them at a time, framed whole; the best soul straight
// ahead, the rest alternating right and left of it. Each vignette has a
// placard on a post beside it, as a condemned man's name was nailed up: the
// placards are your ready platforms, their initials in Fell's letters,
// crossed in blood when the soul is spent. Between you and them runs the
// river - blood, its current cut in lines that crawl - and behind them the
// hills, ruled as the sky is ruled. Crows go round the gallows. Nailed to the
// table's back rail, the broadside - the one printed thing - with the clock,
// what is ready and the hand to deal.
//
// Swipe across: you turn to the next torment (the desk, the broadside and
// your hands turn with you). Leave it alone and you look slowly from one to
// the next. A collect turns you to the soul it frees. Tap a placard (or its
// vignette): its Death turns his skull to you, and the card comes up off the
// board to you, with its Keen Info and its moves (the same card and sheet as
// the card table's). A drag gets the wind up - the hanged swing, the skin
// on the branch lifts, the crows are thrown. Nothing here is scaled to fake
// a thing: the camera goes where you would sit, and the lens is sized for
// that.
//
// Held to real makers, at three distances (across the room: silhouette;
// at arm's length: materials, bevels, seams; pinched in 3x: engraving,
// grain, wear), for what each surface does with the light, what it touches
// and how it moves:
//   The cut - Holbein's blocks as Lützelburger cut them: a heavy contour
//     round every form, the tone in three or four planes, the lit plane
//     left as paper, the turn hatched in one set of lines that follow the
//     form, the dark crossed. Room: a page of black line on bone. Arm: the
//     planes and the crossings. 3x: each line's swell, the paper between.
//   Death - anatomically a skeleton (skull with its sockets and jaw, the
//     rib cage, the spine, pelvis, long bones with their heads), bare but
//     for a rag, posed at his work, each in his own time: the saw's stroke
//     with its wind-up and bite, the crank's turn, the bar raised and
//     brought down with a settle, the dancer's hop.
//   The damned - fleshed bodies, their flesh the paper, the muscle turned
//     in hatch; where they are opened the raw is BLOOD, and blood runs
//     down them by the plate's own mask, drips, and stands in pools that
//     spread where they stand. A flayed man is red to the bone; his skin
//     hangs from the branch, a flat sheet of paper, and lifts in the wind.
//   The river - blood: a ribbon in the trough, red, its current lines
//     crawling downstream (the plate's lines drifting).
//   The crows - ink, two strokes each, flapping; they circle the gallows
//     and sit on the beam and the wheel's rim, and lift when the wind gets up.
//   The sky - bone, with Holbein's clouds: billows outlined and hatched
//     under, a band of long horizontal strokes low down, a few birds.
//   The broadside - a printed sheet: bone paper, the lettering in ink
//     (IM Fell English, DW Pica), the hand's box in blood with bone
//     letters, nailed at the corners to the rail.
//
// The sound: the valley's piece is the homes' music (music.mjs `valley`:
// the owner's take "In the Valley", a 64-bar arrangement at one level, the
// voice where it sings); under it the valley plays its own ambience - the
// wind, crows, the saw's rasp in time with the sawyer, and far off a bell -
// gated on the same setting. With motion off nothing moves on its own.
//
// Coordinates are the seat's own, as the table's: centimetres, the origin
// on the table's top at the middle of its near edge, +z away from you,
// +y up, +x to your LEFT.

import * as THREE from '../vendor/three/three.module.js';
import { CSS3DRenderer, CSS3DObject } from '../vendor/three/three.addons.js';
import { tableKit as K } from './table.mjs';
import { engravingMaterial, outlineOf, burinTick, BONE, INK, BLOOD, BLOOD_WET } from './burin.mjs';
import { buildFigure, buildDeath, buildSkull, BODY_HIPS, GRIP, hold, reach, setArm, lerp3, setHalo } from './figure.mjs';
// dev overlay for live anatomy tuning (loaded dynamically, only on ?lab)
const devOverlayP = (new URLSearchParams(window.location.search)).has('lab')
  ? import('./dev-overlay.mjs').then(m => m.initDevOverlay).catch(() => null)
  : Promise.resolve(null);
// (the figures stand off the dark hills on a hair of paper: a halo round
// their main forms, in device pixels)
setHalo(5);
// the raw of a flayed man: the blood's red let down a little toward the paper, and its fibres
const FLUSH = BONE.clone().lerp(BLOOD, 0.16);   // (the flayed man's paper: bone, only flushed with the blood)

export const DESTS = ['valley'];

const DEG = Math.PI / 180;
const PI = Math.PI, HALF = Math.PI / 2;
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
const TABLE = { w: 120, d: 64, z0: -4, slab: 4 };
// You are the dealer: the camera is his eye, his hands on the table in
// front of you. The souls stand on a half ring ahead (RING: its centre your
// feet, the eye's foot), one torment framed at a time - the best straight
// ahead, the rest alternating right and left of it, a step apart wide
// enough that the next one stays out of the frame. A swipe turns you to the
// next; left alone, you look slowly from one to the next.
const RING = { c: [0, -112], r: 330, step: 34 * DEG, end: 8 * DEG };
// (the two at the ends a step and a little more out: the windlass and the
// stake are wide, and a step alone would leave their parts in the next frame)
const ringAngle = k => (RING.step * Math.ceil(k / 2) + (k >= 5 ? RING.end : 0)) * (k % 2 ? -1 : 1);
const ringAt = (th, r = RING.r) => [RING.c[0] + Math.sin(th) * r, RING.c[1] + Math.cos(th) * r];
// (the taller torments a little further off, so each fills its frame alike)
const RING_DR = [0, 0, 0, 0, 40, 34, 22];
// (and the dragging on a low mound: what it drags lies on the ground, which
// the broadside would otherwise cover)
const RING_UP = [0, 0, 0, 30, 0, 0, 0];
// The shelf: flat round your feet and the table, falling to the floor of the
// ring beyond its lip; the river's trough between, the hills behind.
const SHELF = 205;
const FLOOR = -34;
const RIVER = { r: 262, w: 56 };
let PADS = [];   // (the stations' floors, flattened; set by prepareTable)
const SKY = 1100;
// The broadside: a printed sheet nailed to the table's back rail, under
// your thumb (at: its middle; 60 x 38 cm, 30 page px to the cm).
const SHEET = { at: [20, 16, 55.7], lean: 0.0, w: 60, h: 38, px: 30, tilt: 0.9 * DEG };   // (nailed flat to the rail's face)
// The views: the seat, portrait and landscape.
const VIEW = [{ eye: [0, 130, -112], aim: [0, 70, 140], fov: 68 }, { eye: [0, 118, -112], aim: [0, 55, 140], fov: 58 }];
const T = { fly: 4.8, uiIn: 0.6, lift: 0.55 };
const SND = { wind: 0.06, bell: 0.22, saw: 0.05, crow: 0.09 };
// The key: Holbein's light, high from the left and a little in front.
// (the key from the plate's upper left and only a little before it, as the
// engraver lights a page: the lights of a figure turned to you left open,
// its far half cut into shade - lit from nearer the front, a figure turned
// to you printed as blank paper)
const KEY_SEAT = new THREE.Vector3(0.8, 0.52, -0.22).normalize();

// ------------------------------------------------------------ helpers
// (every surface here is the block's: paper left where the light falls,
// the turn hatched, the dark crossed; tone + is darker)
const mat = (opts) => engravingMaterial(Object.assign({ freq: 1.3, sky: 0.16, keyI: 1.5, tone: -0.04, wobble: 0.55, steps: 0 }, opts));
const mesh = (geo, m, parent, outline = 1.8) => { const x = new THREE.Mesh(geo, m); parent.add(x); if (outline) outlineOf(x, outline); return x; };
const G = (parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); if (parent) parent.add(g); return g; };
// a limb: a capsule hanging from its joint at the origin, down -y
const limb = (len, r, m, parent, outline = 1.5) => { const x = mesh(new THREE.CapsuleGeometry(r, len, 4, 10), m, parent, outline); x.position.y = -len / 2; return x; };
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
// a lathe from a profile of [r, y] pairs, round y
const lathe = (prof, seg = 20) => new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), seg);
// a flat shape on the ground with a ragged edge (a pool, a smear): a
// polygon round (0,0) of radius r, stretched sx along x, noised
function splat(r, rnd, sx = 1, n = 26) {
  const sh = new THREE.Shape();
  for (let i = 0; i < n; i++) { const a = i / n * PI * 2, rr = r * (0.84 + rnd() * 0.28 + 0.1 * Math.sin(a * 3 + rnd())); const x = Math.cos(a) * rr * sx, y = Math.sin(a) * rr; if (i) sh.lineTo(x, y); else sh.moveTo(x, y); }
  sh.closePath();
  const g = new THREE.ShapeGeometry(sh, 6); g.rotateX(-HALF); return g;
}

// ------------------------------------------------------------ the figures
// (built in figure.mjs: buildFigure the body, buildDeath the skeleton; the
// joints they return are posed here)
// the skeleton at rest: every joint straight
function restSkeleton(sk) {
  const d = sk.userData;
  d.hips.rotation.set(0, 0, 0); d.neck.rotation.set(0, 0, 0);
  if (d.spine) { d.hips.position.y = 92; d.spine.rotation.set(0, 0, 0); d.chest.rotation.set(0, 0, 0); }
  ['l', 'r'].forEach(s => { d.arms[s].sh.rotation.set(0, 0, 0); d.arms[s].el.rotation.set(0, 0, 0); d.arms[s].hand.rotation.set(0, 0, 0); d.legs[s].hip.rotation.set(0, 0, 0); d.legs[s].kn.rotation.set(0, 0, 0); d.legs[s].foot.rotation.set(0, 0, 0); });
}
// the dancer's step in place: the walk, the sway (used by the drummer and
// the one who drags)
function stepSkeleton(sk, w, amp = 1) {
  const d = sk.userData, s = Math.sin(w), c = Math.cos(w);
  d.hips.position.y = 92 + Math.abs(s) * 2.2 * amp;
  d.hips.rotation.y = s * 0.08 * amp; d.hips.rotation.z = c * 0.04 * amp;
  d.legs.l.hip.rotation.x = s * 0.55 * amp; d.legs.r.hip.rotation.x = -s * 0.55 * amp;
  d.legs.l.kn.rotation.x = KNEE_BACK * (Math.max(0, -s) * 0.9 * amp + 0.05); d.legs.r.kn.rotation.x = KNEE_BACK * (Math.max(0, s) * 0.9 * amp + 0.05);
  d.spine.rotation.z = -c * 0.05 * amp;
}
// the hourglass: two bulbs of glass between two discs on three posts
function buildHourglass(kit, h = 14) {
  const g = new THREE.Group();
  // (glass as the engraver cuts it: curved lines round the bulb, darker at
  // its turning edges, a clean upright highlight left in the paper; the
  // sand a dark mound below and a dark cap draining above, the thread
  // between - so it reads as a glass, never an empty stool)
  const glass = mat({ uv: [20, 8], angle: HALF, tone: 0.16, keyI: 1.1, sky: 0.2, freq: 1.6, wobble: 0.4 });
  const bulb = lathe([[0.6, 0], [3.4, 0.8], [4.4, 2.2], [4.2, 4], [2.4, 5.6], [0.9, 6.6], [0.6, 7]], 18);
  const a = mesh(bulb, glass, g, 1.3); a.position.y = 0.6;
  const b = mesh(bulb, glass, g, 1.3); b.position.y = h - 0.6; b.rotation.x = PI;
  const sandM = mat({ tone: 0.62, freq: 2.4, keyI: 0.8 });
  const sand = mesh(new THREE.ConeGeometry(3.6, 3.2, 14), sandM, g, 0.8); sand.position.y = 2.4;
  const top = mesh(new THREE.ConeGeometry(2.6, 1.8, 14), sandM, g, 0.6); top.position.y = h - 3.8; top.rotation.x = PI;
  mesh(new THREE.CylinderGeometry(0.3, 0.3, h * 0.5, 6), kit.ink, g, 0).position.y = h / 2;
  // the highlight: a narrow upright stroke of bare paper down the front of each bulb
  const hiM = new THREE.MeshBasicMaterial({ color: BONE, toneMapped: false });
  [a, b].forEach((bb, i) => { const hl = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 3.4), hiM); hl.position.set(-1.6, i ? h - 3.6 : 3.6, -3.9); hl.rotation.y = PI + 0.4; g.add(hl); });
  [0, h].forEach(y => { const d = mesh(new THREE.CylinderGeometry(5.6, 5.6, 1, 16), kit.post, g, 1.2); d.position.y = y; });
  for (let i = 0; i < 3; i++) { const a2 = i / 3 * PI * 2 + 0.4, p = mesh(new THREE.CylinderGeometry(0.5, 0.5, h, 6), kit.post, g, 0.9); p.position.set(Math.cos(a2) * 5, h / 2, Math.sin(a2) * 5); }
  g.userData.sand = sand;
  return g;
}

const restBody = restSkeleton;   // (the same joints)
// the valley's men are the app's figures (figure.mjs `build`: one skinned
// skin, its soft tissue and cloth - the lab's men), each a little different
// in mass, muscle and age at the valley's height, with the lab's faces set
// to the valley's cast: calm or in pain. The sawn man (split) and the flayed
// man keep the valley's own rig: their cuts are not a build's. A build's man
// steps his soft tissue each frame from his own motion (`softFigs`).
const softFigs = [];
function buildMan(kit, rnd, o) {
  const build = { height: 1, mass: (rnd() - 0.5) * 0.5, muscle: (rnd() - 0.5) * 0.5, age: rnd() * 0.5 };
  const man = buildFigure(kit, rnd, Object.assign({ build }, o));
  if (man.userData.setFace) man.userData.setFace(o.calm ? 'calm' : 'pain');
  if (man.userData.soft) softFigs.push(man);
  return man;
}
// a run of blood on a part: its own plate, the mask from the wound down
// (hi, lo in world y - set once the part is placed)
function bleed(obj, spill = 1, wet = 1) {
  obj.traverse(o => {
    if (!o.isMesh || !o.material.userData || !o.material.userData.burin || o.userData.outline) return;
    const m = o.material.clone(); m.userData.burin = true;
    m.uniforms.uBloodOn.value = 1; m.uniforms.uBloodSpill.value = spill; m.uniforms.uWet.value = wet;
    o.material = m; o.userData.bleeds = true;
  });
}
function setBleedBand(root, hi, lo) {
  root.traverse(o => { if (o.userData.bleeds) { o.material.uniforms.uBloodHi.value = hi; o.material.uniforms.uBloodLo.value = lo; } });
}
// a wound: a raw patch sunk into a part
const wound = (parent, w, h, d, x, y, z, kit) => { const g = mesh(new THREE.BoxGeometry(w, h, d), kit.raw, parent, 1.2); g.position.set(x, y, z); return g; };
// the bowels: a tube along a wandering path from a to b (world/seat
// coordinates in the parent's frame), with loops
function gutGeo(path, r = 2.1) {
  const curve = new THREE.CatmullRomCurve3(path.map(p => V(...p)), false, 'catmullrom', 0.6);
  return new THREE.TubeGeometry(curve, Math.max(24, path.length * 8), r, 8, false);
}
// a cast shadow on the ground: an ellipse of parallel cuts, thrown to the
// right (away from the key), under whatever stands there
let shadowGeo = null;
function shade(parent, x, z, rx, rz, h = 60) {
  if (!shadowGeo) { shadowGeo = new THREE.CircleGeometry(1, 20); shadowGeo.rotateX(-HALF); }
  const sh = new THREE.Mesh(shadowGeo, parent.userData.kitShadow || shade.mat);
  sh.position.set(x - h * 0.12, 0.45, z + h * 0.05); sh.scale.set(rx, 1, rz); sh.renderOrder = 0; sh.userData.shade = true;
  parent.add(sh);
  return sh;
}
// a pool on the ground, and spatter round it
function pool(kit, rnd, r, sx = 1) {
  const g = new THREE.Group();
  const p = mesh(splat(r, rnd, sx), kit.pool, g, 1.2); p.position.y = 0.6; p.renderOrder = 1;
  for (let i = 0; i < 7; i++) { const s = mesh(splat(1.2 + rnd() * 2.4, rnd, 1, 10), kit.pool, g, 0); const a = rnd() * PI * 2, d = r * (0.9 + rnd() * 0.9); s.position.set(Math.cos(a) * d * sx, 0.7, Math.sin(a) * d); s.renderOrder = 1; }
  return g;
}
// the placard: a board on a post, the soul's initials in Fell's letters;
// crossed in blood when spent
function placardArt(card, i, spent) {
  return K.canvasTex(512, 352, (c, w, h) => {
    c.fillStyle = '#E3D6B8'; c.fillRect(0, 0, w, h);
    const rnd = seeded(K.hash(card.id || card.name) + (spent ? 7 : 0));
    // the board's grain: broken horizontals
    for (let y = 6; y < h; y += 7) { c.strokeStyle = `rgba(26,15,12,${(0.08 + rnd() * 0.1).toFixed(2)})`; c.lineWidth = 1.2; c.beginPath(); c.moveTo(0, y + rnd() * 3); c.lineTo(w, y + rnd() * 3); c.stroke(); }
    c.strokeStyle = '#1A0F0C'; c.lineWidth = 9; c.strokeRect(14, 14, w - 28, h - 28);
    c.lineWidth = 3; c.strokeRect(30, 30, w - 60, h - 60);
    c.fillStyle = '#1A0F0C'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `700 ${h * 0.56}px 'IM Fell English', Georgia, serif`; c.fillText(card.initials, w / 2, h * 0.5 + 6);
    c.font = `${h * 0.11}px 'IM Fell English SC', Georgia, serif`; c.fillText(`soul ${String(i + 1).padStart(2, '0')}`, w / 2, h * 0.14);
    // the nails
    [[40, 40], [w - 40, 40], [40, h - 40], [w - 40, h - 40]].forEach(([x, y]) => { c.beginPath(); c.arc(x, y, 7, 0, 7); c.fillStyle = '#1A0F0C'; c.fill(); });
    if (spent) {
      // crossed out in blood, by a wet thumb
      c.strokeStyle = 'rgba(142,14,14,0.92)'; c.lineCap = 'round';
      [[60, 70, w - 60, h - 70], [w - 60, 70, 60, h - 70]].forEach(([x0, y0, x1, y1]) => { for (let k = 0; k < 4; k++) { c.lineWidth = 16 - k * 3; c.beginPath(); c.moveTo(x0 + rnd() * 10, y0 + rnd() * 10); c.quadraticCurveTo((x0 + x1) / 2 + (rnd() - 0.5) * 30, (y0 + y1) / 2 + (rnd() - 0.5) * 30, x1 + rnd() * 10, y1 + rnd() * 10); c.stroke(); } });
      for (let k = 0; k < 18; k++) { c.fillStyle = `rgba(142,14,14,${(0.5 + rnd() * 0.5).toFixed(2)})`; c.beginPath(); c.arc(rnd() * w, rnd() * h, 1.5 + rnd() * 5, 0, 7); c.fill(); }
    }
  });
}
function buildPlacard(kit, card, i, h = 96, bw = 30) {
  const g = new THREE.Group();
  const bh = bw * 0.69;
  mesh(new THREE.CylinderGeometry(1.8, 2.4, h, 8), kit.post, g, 1.6).position.y = h / 2;
  shade(g, 0, 0, 5, 4, 30);
  const board = mesh(new THREE.BoxGeometry(bw, bh, 1.6), kit.wood, g, 1.8); board.position.set(0, h - bh / 2 + 2, -1.4);
  const art = placardArt(card, i, false);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(bw - 0.6, bh - 0.6), new THREE.MeshBasicMaterial({ map: art, toneMapped: false }));
  face.position.set(0, h - bh / 2 + 2, -2.3); face.rotation.y = PI; g.add(face);
  g.userData = { plate: face, liveTex: art };
  return g;
}

// ------------------------------------------------------------ the vignettes
// Each returns { g, death, act(tt, dt, wind, reduced), bands: [[root, hiOff, loOff]], crows: [...] }.
// Each is built facing -z at its own origin on the ground; the caller
// places it and sets its blood bands in world y.

// the sense in which a knee or an elbow bends back (the shin or forearm to
// the body's back, +z): set once from the figure's joints
const KNEE_BACK = -1;
// I. THE SAWYER. A man hung by the ankles from an A-frame, spread; Death
// at the saw, the cut from the fork down into the belly; what is in him
// hanging out of it; the blood running down him to the pool round his head.
function vSawyer(kit, rnd) {
  const g = new THREE.Group(), bands = [];
  // (the beam high enough that his hanging hands stay a hand's breadth off
  // the ground: lower, they planted flat beside his head and he read as a
  // man doing a handstand)
  const H = 214;
  // (the saw: its length, its slant up from the fork, turned toward you a
  // little, its stroke; Death where its handle comes to him)
  const SAW = { len: 58, tilt: 0.32, yaw: -0.42, stroke: 7, dx: -74, dz: -32 };
  // the frame: two pairs of legs crossed, a beam between the forks
  [-1, 1].forEach(s => { [-1, 1].forEach(k => { const leg = mesh(new THREE.CylinderGeometry(3, 3.6, H + 10, 8), kit.post, g, 1.8); leg.position.set(s * 60 + k * 10, H / 2, k * 12); leg.rotation.x = k * 0.14; leg.rotation.z = -s * 0.05; }); });
  const beam = mesh(new THREE.CylinderGeometry(3.6, 3.6, 136, 8), kit.post, g, 1.8); beam.position.y = H; beam.rotation.z = HALF;
  // the man: upside down, hips at the beam, the legs out to the forks
  const man = buildFigure(kit, rnd, { split: true, beard: true, part: 0.3 }); g.add(man);
  const d = man.userData;
  man.rotation.z = PI; man.position.set(0, H + 4, 0);          // (the ankles at the beam; hips at 133, head at 53)
  restBody(man);
  d.legs.l.hip.rotation.z = 0.78; d.legs.r.hip.rotation.z = -0.78; d.legs.l.kn.rotation.x = KNEE_BACK * 0.2; d.legs.r.kn.rotation.x = KNEE_BACK * 0.2;
  // (his arms hanging toward the ground past his head, close to it and a
  // little bent, the hands limp and clear of the ground: spread out
  // sideways they read as a second pair of legs)
  d.arms.l.sh.rotation.set(0.1, 0, PI - 0.3); d.arms.r.sh.rotation.set(0.1, 0, -(PI - 0.34)); d.arms.l.el.rotation.x = 0.38; d.arms.r.el.rotation.x = 0.44;
  d.arms.l.hand.userData.grip(0.35); d.arms.r.hand.userData.grip(0.3);
  d.neck.rotation.x = 0.55;
  // (hung head down, his weight under the cloth falls the other way, onto
  // his belly toward the ground)
  // (the base stays in the fork and the narrower mass lies down along his
  // front toward his belly, pressed out against the cloth from inside)
  if (d.pouch) { d.pouch.rotation.set(0.14, 0, PI); d.pouch.position.set(0, -13.0, -11.0); }   // (turned end for end about the body's depth, so its front stays to the front)
  // the rope round each ankle to the beam
  ['l', 'r'].forEach(s => { const r = mesh(new THREE.TorusGeometry(6.4, 0.9, 6, 12), kit.rope, d.legs[s].foot, 0.9); r.position.y = 2; r.rotation.x = HALF; });
  // the cut: the raw open in the fork where the blade is in him, and the
  // blood run down him off his head in two falls to the pool (no bowels
  // hung out: a coil there read as a ribbon, not a wound)
  wound(d.hips, 10, 10, 14, 0, -8, -1, kit);
  // (no standing falls of blood to the pool: two red rods there read as
  // candles; the drops fall on their own)
  // the pool under his head, and the one under the bowels' end
  g.add(pool(kit, rnd, 30, 1.2)).position.set(0, 0, -6);
  [-1, 1].forEach(sx => [-1, 1].forEach(k => shade(g, sx * 60 + k * 10, k * 12, 6, 5, 20)));
  shade(g, SAW.dx + 6, SAW.dz, 22, 12);
  // Death at the saw: outside the frame's near legs, facing the man, both
  // hands on the handle at the blade's upper end, which runs down into his
  // fork on a slant - so the saw reads as in him, and in Death's hands
  const death = buildDeath(kit, rnd); g.add(death); restSkeleton(death);
  death.position.set(SAW.dx, 0, SAW.dz); death.rotation.y = -HALF + 0.35;   // (facing the man, turned a little to you)
  const dd = death.userData;
  dd.legs.l.hip.rotation.x = -0.4; dd.legs.r.hip.rotation.x = 0.35; dd.legs.r.kn.rotation.x = KNEE_BACK * 0.45; dd.legs.l.foot.rotation.x = 0.3;
  dd.hips.position.y = 88;
  // the saw: a broad toothed blade on a slant, its lower end sunk in the
  // cut, a cross handle at its upper end; it works along its own length
  const saw = new THREE.Group(); g.add(saw);
  // (the blade a long tapering plate with its teeth cut in its foot, so the
  // silhouette is a saw's; laid in close cross-hatch as iron is, a bare glint
  // along its back. Seen edge-on, or pale, it read as a striped stick or a
  // third leg)
  const bs = new THREE.Shape(); bs.moveTo(0, 3.6); bs.lineTo(-SAW.len, 5.6); bs.lineTo(-SAW.len, -5.6);
  { const n = 22, w = SAW.len / n; for (let i = 0; i < n; i++) { const x0 = -SAW.len + i * w, yb = q => -5.6 + 2 * (q + SAW.len) / SAW.len; bs.lineTo(x0 + w * 0.3, yb(x0) - 2.4); bs.lineTo(x0 + w, yb(x0 + w)); } }
  bs.lineTo(0, 3.6);
  const bladeGeo = new THREE.ExtrudeGeometry(bs, { depth: 0.7, bevelEnabled: false }); bladeGeo.translate(0, 0, -0.35);
  mesh(bladeGeo, kit.blade, saw, 1.4);
  mesh(new THREE.BoxGeometry(SAW.len * 0.84, 1.1, 0.9), kit.glint, saw, 0).position.set(-SAW.len * 0.5, 2.8, 0);
  // (its handle upright across the blade's end, in the blade's plane, so
  // both fists on it stay in sight)
  mesh(new THREE.CylinderGeometry(1.7, 1.7, 17, 8), kit.post, saw, 1.2).position.set(-SAW.len - 1.6, 0, 0);
  const SAW0 = V(0, 122, -8), SAWD = V(-Math.cos(SAW.tilt), Math.sin(SAW.tilt), 0).applyAxisAngle(V(0, 1, 0), SAW.yaw);
  saw.quaternion.setFromUnitVectors(V(-1, 0, 0), SAWD);
  // (rolled about its length most of the way to the lens: the face and the
  // teeth read, the blade still entering the kerf on a slant)
  { const n = V(0, 0, 1).applyQuaternion(saw.quaternion), want = V(0, 0, -1).projectOnPlane(SAWD).normalize();
    let a = Math.atan2(V(0, 0, 0).crossVectors(n, want).dot(SAWD), n.dot(want)); if (Math.abs(a) > HALF) a -= Math.sign(a) * PI;
    saw.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(SAWD, a * 0.75)); }
  const SAWY = V(0, 1, 0).applyQuaternion(saw.quaternion);
  // (no band of blood round his hips - with its runs it read as a pair of
  // red briefs: the cut is the raw of its two faces, the blade bloody)
  bleed(saw); bands.push([saw, 125, 117]);
  // both his hands on the handle, one each side of the blade: the arms
  // solved at the stroke's two ends and its middle, and read between (the
  // back bowed into the push)
  const sawAt = sx => SAW0.clone().addScaledVector(SAWD, sx * SAW.stroke);
  const handleAt = (sx, side) => sawAt(sx).addScaledVector(SAWD, SAW.len + 1.6).addScaledVector(SAWY, side * 4.8).toArray();
  // (the elbows held down at his sides, under the line from shoulder to
  // fist: left free, the search raised an upper arm level with his jaw and
  // he read as biting a bone)
  const elbowFor = (arm, hand) => { g.updateMatrixWorld(true); const sp = g.worldToLocal(arm.sh.getWorldPosition(V(0, 0, 0))); return sp.lerp(V(...hand), 0.35).add(V(0, -22, 0)).toArray(); };
  const sawPose = [-1, 0, 1].map(sx => { dd.spine.rotation.x = -0.14 - sx * 0.1; saw.position.copy(sawAt(sx)); const hl = handleAt(sx, 1), hr = handleAt(sx, -1); return { l: reach(dd.arms.l, hl, death, 14, { start: [1.3, 0, 0.2, 1.4], elbow: elbowFor(dd.arms.l, hl) }), r: reach(dd.arms.r, hr, death, 14, { start: [1.3, 0, -0.2, 1.4], elbow: elbowFor(dd.arms.r, hr) }) }; });
  saw.position.copy(sawAt(0));
  dd.arms.l.hand.userData.grip(1); dd.arms.r.hand.userData.grip(1);
  const act = (tt, dt, w, still) => {
    // the stroke: a slow draw back, a bite forward, the frame giving
    const s = still ? 0 : Math.sin(tt * 2.6), c = still ? 0 : Math.cos(tt * 2.6);
    saw.position.copy(sawAt(s));
    // Death leans into the push stroke and straightens on the pull
    dd.spine.rotation.x = -0.14 - s * 0.14;
    setArm(dd.arms.l, lerp3(sawPose[0].l, sawPose[1].l, sawPose[2].l, s)); setArm(dd.arms.r, lerp3(sawPose[0].r, sawPose[1].r, sawPose[2].r, s));
    // deeper hip drop on the push, rising on the pull — weight into it
    dd.hips.position.y = 88 - Math.abs(c) * 2.5 - Math.max(0, s) * 1.5;
    // the head dips with the push, lifts on the pull
    dd.neck.rotation.x = still ? 0 : s * -0.1;
    // weight shifts side to side with the stroke
    dd.hips.rotation.z = still ? 0 : c * 0.04;
    man.rotation.y = (still ? 0 : Math.sin(tt * 0.7) * 0.05) + w * 0.12;
    man.rotation.x = still ? 0 : c * 0.015;
    d.arms.r.sh.rotation.x = 0.12 + (still ? 0 : Math.sin(tt * 1.3) * 0.06);
    beam.position.y = H + (still ? 0 : Math.abs(c) * -0.6);
  };
  return { g, death, act, bands, drips: [[V(2, 48, -10), V(0, 2, -8)], [V(-4, 46, -6), V(-2, 2, -4)]], crows: [] , width: 120, victims: [man], freed: { pose: 'dance', at: [0, 0, -58] } };
}
// II. THE WINDLASS. A man on his back on a plank table, opened; his bowels
// drawn out of him onto a windlass that Death turns by its crank.
function vWindlass(kit, rnd) {
  const g = new THREE.Group(), bands = [];
  const TH = 56;
  const top = mesh(new THREE.BoxGeometry(98, 5, 42), kit.wood, g, 1.8); top.position.set(0, TH, 0);
  [-1, 1].forEach(s => { const tr = mesh(new THREE.BoxGeometry(5, TH, 34), kit.post, g, 1.6); tr.position.set(s * 40, TH / 2 - 2.5, 0); tr.rotation.y = 0.12 * s; });
  const lie = G(g, 0, TH + 10, 4); lie.rotation.y = -HALF;                 // (lying along x, head to the right, face up)
  const man = buildMan(kit, rnd, { beard: rnd() < 0.5 }); lie.add(man); restBody(man);
  shade(g, 0, 0, 56, 26, 40); shade(g, 50, -70, 22, 12); shade(g, 44, -34, 10, 20, 30);
  const d = man.userData;
  man.rotation.x = HALF; man.position.set(0, 0, -(BODY_HIPS - 10));
  d.arms.l.sh.rotation.set(0, 0, 1.2); d.arms.r.sh.rotation.set(0, 0, -1.2); d.arms.l.el.rotation.set(0.25, 0, 0); d.arms.r.el.rotation.set(0.25, 0, 0);
  d.legs.l.hip.rotation.z = 0.25; d.legs.r.hip.rotation.z = -0.25; d.legs.l.kn.rotation.x = 0.5; d.legs.r.kn.rotation.x = 0.5;
  d.neck.rotation.x = -0.7;
  // the belly open: a raw plate sunk flush in the torso's front (standing
  // proud of it, it read as a red brick on his belly)
  wound(d.hips, 20, 14, 5, 0, 24, -7.6, kit);
  // the windlass: a frame of two uprights with the drum between, the
  // crank at the near end
  // (a well's windlass, big enough to read across the valley: two posts on
  // a sill with a cross-piece, the drum between them turned side-on to you,
  // a great crank at its near end; the bowels wound fat round the drum and
  // running in a red rope from his open belly up to it)
  const wl = G(g, 62, 0, -10); wl.rotation.y = 0.35;
  const WH = 118, DR = 13, DL = 40;
  mesh(new THREE.BoxGeometry(10, 8, DL + 22), kit.wood, wl, 1.6).position.set(0, 4, 0);
  [-1, 1].forEach(s => { const u = mesh(new THREE.BoxGeometry(8, WH, 8), kit.post, wl, 1.8); u.position.set(0, WH / 2, s * (DL / 2 + 6)); const br = mesh(new THREE.BoxGeometry(5, 40, 5), kit.post, wl, 1.2); br.position.set(14, 22, s * (DL / 2 + 6)); br.rotation.z = 0.55; });
  mesh(new THREE.BoxGeometry(7, 7, DL + 22), kit.wood, wl, 1.5).position.set(0, WH + 3, 0);
  const drum = G(wl, 0, WH - 22, 0);
  const dr = mesh(new THREE.CylinderGeometry(DR, DR, DL, 16), kit.woodRing, drum, 1.8); dr.rotation.x = HALF;
  [-1, 1].forEach(s => { const cap = mesh(new THREE.CylinderGeometry(DR + 2.5, DR + 2.5, 2, 16), kit.post, drum, 1.3); cap.rotation.x = HALF; cap.position.z = s * DL / 2; });
  // the bowels wound on the drum: a fat coil, three turns
  const sp = [];
  for (let i = 0; i <= 60; i++) { const a = i / 60 * PI * 2 * 4, z = -DL / 2 + 6 + i / 60 * (DL - 12); sp.push([Math.cos(a) * (DR + 3.2), Math.sin(a) * (DR + 3.2), z]); }
  mesh(gutGeo(sp, 3.4), kit.gut, drum, 1.3);
  const crank = mesh(new THREE.BoxGeometry(3.2, 30, 3.2), kit.iron, drum, 1.3); crank.position.set(0, 15, -(DL / 2 + 8));
  const axle = mesh(new THREE.CylinderGeometry(2.2, 2.2, 10, 8), kit.iron, drum, 1.1); axle.rotation.x = HALF; axle.position.z = -(DL / 2 + 4);
  const handle = mesh(new THREE.CylinderGeometry(2, 2, 16, 8), kit.post, drum, 1.2); handle.position.set(0, 30, -(DL / 2 + 15)); handle.rotation.x = HALF;
  // the free run of the bowels, from the belly up to the drum's coil, sagging
  wl.updateMatrix(); drum.updateMatrix();
  const coil = new THREE.Vector3(-(DR + 3), WH - 22, 0).applyMatrix4(wl.matrix);
  mesh(gutGeo([[4, TH + 22, -4], [16, TH + 28, -8], [32, TH + 30, -10], [coil.x - 10, (TH + 30 + coil.y) / 2 + 2, (coil.z - 10) / 2], [coil.x, coil.y, coil.z]], 3.4), kit.gut, g, 1.3);
  // Death at the crank, side on, one hand on the handle, the other on the frame
  const death = buildDeath(kit, rnd); g.add(death); restSkeleton(death);
  // (beside the crank, outside it, turned to it: so the drum and the coil
  // are never behind him; his right hand on the handle the whole way round
  // - the arm solved at eight places on the turn at build, and read between)
  death.position.set(104, 0, -50); death.rotation.y = HALF - 0.45;
  const dd = death.userData;
  dd.spine.rotation.x = -0.12; dd.legs.l.hip.rotation.x = -0.25; dd.legs.r.hip.rotation.x = 0.3; dd.legs.r.kn.rotation.x = 0.3;
  const turn = [];
  for (let n = 0; n < 8; n++) {
    drum.rotation.z = -n / 8 * PI * 2;
    g.updateMatrixWorld(true);
    const hp = handle.getWorldPosition(new THREE.Vector3()); g.worldToLocal(hp);
    turn.push(reach(dd.arms.r, [hp.x, hp.y, hp.z], death, 10, { start: [0.6, 0, -0.3, 0.9] }));
  }
  drum.rotation.z = 0;
  // the left hand on the near post's top
  g.updateMatrixWorld(true);
  const postTop = new THREE.Vector3(0, WH - 6, -(DL / 2 + 6)).applyMatrix4(wl.matrix);
  reach(dd.arms.l, [postTop.x + 2, postTop.y, postTop.z - 4], death, 10, { start: [0.5, 0, 0.4, 0.6] });
  dd.arms.r.hand.userData.grip(1); dd.arms.l.hand.userData.grip(0.8);
  // the pool under the table's edge, where it drips
  g.add(pool(kit, rnd, 22)).position.set(-10, 0, -22);
  // (a lying body: a band by height would redden all of him - the open belly,
  // the bowels and the table's edge carry the blood)
  bleed(top); bands.push([top, TH + 3, TH - 3]);
  const act = (tt, dt, w, still) => {
    const a = still ? 0 : tt * 1.7;
    drum.rotation.z = -a;
    // the arm follows the crank's handle: the shoulder and elbow swing round
    const f = ((a / (PI * 2)) % 1 + 1) % 1 * 8, n0 = Math.floor(f) % 8, n1 = (n0 + 1) % 8, k = f - Math.floor(f);
    setArm(dd.arms.r, turn[n0].map((v, j) => v + (turn[n1][j] - v) * k));
    // Death leans into the crank: weight shifts with the turn
    const ca = Math.cos(a), sa = Math.sin(a);
    dd.spine.rotation.z = still ? 0 : ca * 0.08;
    dd.spine.rotation.x = -0.12 - (still ? 0 : Math.max(0, -sa) * 0.1);   // bows into the push
    dd.hips.position.y = 92 - (still ? 0 : Math.max(0, -sa) * 3);          // drops weight into it
    dd.hips.rotation.z = still ? 0 : ca * 0.04;                             // hip sway
    dd.legs.r.kn.rotation.x = 0.3 + (still ? 0 : Math.max(0, sa) * 0.15); // steps into crank
    dd.neck.rotation.y = 0.5 + (still ? 0 : Math.sin(tt * 0.5) * 0.15);
    dd.neck.rotation.x = still ? 0 : Math.max(0, -sa) * -0.08;             // head dips with effort
    // the man: a hand lifts and falls, the head rolls
    d.arms.r.el.rotation.x = 0.25 + (still ? 0 : Math.max(0, Math.sin(tt * 0.9)) * 0.7);
    d.neck.rotation.z = still ? 0 : Math.sin(tt * 0.6) * 0.3;
  };
  // (the whole of it drawn in toward the middle of its window: the crank
  // end and Death at it otherwise stand in the next station's)
  const IN = 30;
  g.children.forEach(c => { c.position.x -= IN; });
  return { g, death, act, bands, drips: [[V(-12 - IN, TH + 2, -20), V(-10 - IN, 2, -22)]], crows: [], width: 130, victims: [man], freed: { pose: 'dance', at: [-10 - IN, 0, -56] } };
}
// III. THE FLAYING. A man bound to a dead tree, the skin off him; Death
// beside with the knife, holding the skin up by a hand; the rest of it
// hangs from the branch and lifts in the wind.
function vFlaying(kit, rnd) {
  const g = new THREE.Group(), bands = [];
  // the tree: a trunk with a lean, two branches, a stump of a third
  // (the branches leave the trunk above his head: from behind it, at its
  // height, they stood out of his skull as a pair of horns)
  const trunk = mesh(lathe([[13, 0], [10, 30], [8.5, 80], [7, 130], [6, 170], [5, 200], [4.2, 211], [3.4, 213.5], [0.01, 214]], 12), kit.bark, g, 2);   // (its top broken off just over the boughs: drawn up to a point above his head it stood there as a spike)
  const br = mesh(new THREE.CylinderGeometry(2.4, 4.4, 70, 8), kit.bark, g, 1.6); br.position.set(-26, 200, 2); br.rotation.z = 1.2;
  const br2 = mesh(new THREE.CylinderGeometry(1.6, 3.6, 76, 8), kit.bark, g, 1.4); br2.position.set(26, 202, -4); br2.rotation.z = -1.15;
  mesh(new THREE.CylinderGeometry(1.4, 2.6, 18, 7), kit.bark, g, 1.2).position.set(8, 118, -6), g.children[g.children.length - 1].rotation.z = -1.3;
  // the man, flayed, bound standing against the trunk, arms up and tied
  const man = buildFigure(kit, rnd, { flayed: true, pained: true }); g.add(man); restBody(man);
  man.position.set(0, 0, -12);
  shade(g, 0, -4, 24, 16, 80); shade(g, -44, 2, 22, 12);
  const d = man.userData;
  d.arms.l.sh.rotation.set(0, 0, 2.6); d.arms.r.sh.rotation.set(0, 0, -2.6); d.arms.l.el.rotation.x = 0.2; d.arms.r.el.rotation.x = 0.2;
  // (the head fallen forward and aside: thrown back, the open face read as a snarl)
  d.neck.rotation.x = -0.45; d.neck.rotation.z = 0.3; d.legs.l.kn.rotation.x = KNEE_BACK * 0.25; d.legs.r.kn.rotation.x = KNEE_BACK * 0.1;
  // the ropes: each wrist tied up to the branch over it, the waist to the trunk
  const cords = [];
  { g.updateMatrixWorld(true);
    const brY = (b, x) => { const dir = V(0, 1, 0).applyEuler(b.rotation); return b.position.y + (x - b.position.x) / dir.x * dir.y; };
    [[d.arms.l, br2], [d.arms.r, br]].forEach(([arm, b]) => {
      const a = g.worldToLocal(arm.hand.getWorldPosition(V(0, 0, 0))), top = V(a.x, brY(b, a.x), b.position.z);
      const L = a.distanceTo(top), c = mesh(new THREE.CylinderGeometry(0.8, 0.8, L, 6), kit.rope, g, 0.8);
      c.position.copy(a).add(top).multiplyScalar(0.5); c.quaternion.setFromUnitVectors(V(0, 1, 0), top.clone().sub(a).normalize()); cords.push(c);
    }); }
  const belt = mesh(new THREE.TorusGeometry(17, 1, 6, 20), kit.rope, g, 0.9); belt.position.set(0, 96, -8); belt.rotation.x = HALF;
  // the skin: a flat man, hung from the branch by its arms, the rest down
  const skinShape = new THREE.Shape();
  [[0, 0], [8, -2], [10, -12], [18, -14], [26, -22], [30, -52], [24, -54], [19, -32], [16, -60], [20, -100], [16, -148], [6, -150], [4, -102], [0, -98], [-4, -102], [-6, -150], [-16, -148], [-20, -100], [-16, -60], [-19, -32], [-24, -54], [-30, -52], [-26, -22], [-18, -14], [-10, -12], [-8, -2]].forEach(([x, y], i) => i ? skinShape.lineTo(x, y) : skinShape.moveTo(x, y));
  const sg = new THREE.ShapeGeometry(skinShape, 4);
  { const p = sg.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, Math.sin(y * 0.06) * 3 + Math.sin(x * 0.2) * 1.5); } sg.computeVertexNormals(); }
  // (hung by its arms from the end of the low branch, face to you, pale
  // against the dark hill: a man's whole outline, emptied)
  const SKIN_Y = PI - 0.25;
  // (its own plate: a hide has a tone, hatched in its folds, never bare
  // paper - a white cut-out read as a hole in the print)
  const hideM = mat({ freq: 1.5, angle: 1.35, tone: 0.04, keyI: 0.5, sky: 0.5, bare: 0.1, wobble: 0.9, side: THREE.DoubleSide });
  const skin = mesh(sg, hideM, g, 0); skin.position.set(-52, 199, 4); skin.rotation.y = SKIN_Y; skin.scale.setScalar(0.8);
  // the cord it hangs by, up to the branch, and its feet well clear of the ground
  { const cord = mesh(new THREE.CylinderGeometry(1.0, 1.0, 13, 6), kit.rope, g, 1.0); cord.position.set(-52, 204.5, 4); }
  // (a flat skin has no hull for an outline: its edge drawn as a line, a
  // little proud of both faces, so its arms, legs and head read)
  { const pts = skinShape.getPoints(6).map(q => V(q.x, q.y, Math.sin(q.y * 0.06) * 3 + Math.sin(q.x * 0.2) * 1.5)); pts.push(pts[0].clone());
    const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1), pts.length * 3, 0.8, 5, false);
    skin.add(new THREE.Mesh(tube, kit.ink)); }
  // Death with the knife at his flank, on the other side of him from the
  // skin, the other hand drawing back what is left of it at his shoulder
  const death = buildDeath(kit, rnd); g.add(death); restSkeleton(death);
  death.position.set(44, 0, -24); death.rotation.y = Math.atan2(-(0 - 44), -(-12 - -24));
  const dd = death.userData;
  dd.spine.rotation.x = -0.12; dd.legs.r.hip.rotation.x = -0.3; dd.legs.l.hip.rotation.x = 0.25; dd.legs.l.kn.rotation.x = KNEE_BACK * 0.3;
  const knife = mesh(new THREE.BoxGeometry(0.6, 2.6, 16), kit.iron, g, 1.2); knife.position.z = 6; hold(dd.arms.r.hand, knife, { axis: 'z' });   // (the blade out past the thumb)
  // the knife hand: solved at three heights along the cut - a short drag
  // down through the skin, the blade biting, then lifted back to the top
  const cutPoses = [-1, 0, 1].map(sx => {
    const cy = 116 + sx * 12;   // (drag down 12 cm each way from the mid-cut)
    return reach(dd.arms.r, [15 + sx * 2, cy, -19 - sx * 1], death, 12, { start: [0.9, 0, -0.3, 1.0] });
  });
  // the left hand: gripping at the shoulder and pulling the skin back -
  // solved at two positions, a hold and a peel
  const holdAt = reach(dd.arms.l, [12, 148, -17], death, 12, { start: [1.4, 0, 0.3, 0.6] });
  const peelAt = reach(dd.arms.l, [6, 152, -24], death, 12, { start: [1.4, 0, 0.3, 0.6] });
  dd.arms.l.hand.userData.grip(0.7);
  g.add(pool(kit, rnd, 26)).position.set(0, 0, -16);
  bleed(trunk); bands.push([trunk, 150, 0]);
  const act = (tt, dt, w, still) => {
    // the skin lifts and turns in the wind; the man's head rolls
    skin.rotation.y = SKIN_Y + (still ? 0 : Math.sin(tt * 1.1) * 0.12) + w * 0.6;
    skin.rotation.x = (still ? 0 : Math.sin(tt * 0.8 + 1) * 0.06) - w * 0.25;
    d.neck.rotation.z = 0.3 + (still ? 0 : Math.sin(tt * 0.45) * 0.25);
    // the cutting stroke: a deliberate drag down then a lift back up
    // (a 2.8 s cycle: the slow bite down for 0.6, the lift for 0.4)
    const cs = still ? 0 : Math.sin(tt * 2.2);
    setArm(dd.arms.r, lerp3(cutPoses[0], cutPoses[1], cutPoses[2], cs));
    // Death leans into the cut on the down-stroke, straightens on the lift
    dd.spine.rotation.x = -0.12 - (still ? 0 : Math.max(0, cs) * 0.1);
    // the left hand peels: alternates between hold and pull-back
    const pk = still ? 0 : (Math.sin(tt * 1.1) * 0.5 + 0.5);
    setArm(dd.arms.l, holdAt.map((v, j) => v + (peelAt[j] - v) * pk));
    // the head watches the blade, tracking down the cut
    dd.neck.rotation.y = (still ? 0 : Math.sin(tt * 0.3) * 0.2);
    dd.neck.rotation.x = still ? 0 : cs * -0.08;
    // shift weight with the stroke
    dd.hips.position.y = 92 - (still ? 0 : Math.max(0, cs) * 2);
  };
  return { g, death, act, bands, drips: [[V(17, 100, -22), V(15, 2, -20)]], crows: [[-40, 208, 2], [40, 214, -4]], width: 120, victims: [man, skin, belt, ...cords], freed: { pose: 'dance', at: [-18, 0, -46] } };
}
// a dead tree: a trunk with a lean, two or three bare branches
function buildTree(kit, rnd) {
  const g = new THREE.Group();
  mesh(lathe([[12 + rnd() * 4, 0], [9, 30], [7.5, 80], [6, 130], [4.5, 170], [2.5, 210], [0.01, 212]], 10), kit.bark, g, 2);
  shade(g, 0, 0, 20, 14, 120);
  const n = 2 + Math.floor(rnd() * 2);
  for (let i = 0; i < n; i++) {
    const a = rnd() * 6, y = 90 + i * 40 + rnd() * 30, len = 50 + rnd() * 40, tilt = 0.45 + rnd() * 0.4;
    const br = G(g, Math.cos(a) * 6, y, Math.sin(a) * 6); br.rotation.set(Math.sin(a) * tilt, 0, -Math.cos(a) * tilt);
    mesh(new THREE.CylinderGeometry(1.4 + rnd(), 3.2 + rnd(), len, 7), kit.bark, br, 1.5).position.y = len / 2;
    for (let k = 0; k < 2; k++) { const tw = G(br, 0, len * (0.55 + k * 0.35), 0); tw.rotation.set((rnd() - 0.5) * 1.2, 0, (rnd() - 0.5) * 1.2); mesh(new THREE.CylinderGeometry(0.5, 1.3, 18 + rnd() * 14, 6), kit.bark, tw, 1.1).position.y = 12; }
  }
  return g;
}
// IV. THE WHEEL. The breaking wheel on its pole, a man across it with his
// limbs through the spokes, broken; Death below it with the bar, raised.
function vWheel(kit, rnd) {
  const g = new THREE.Group(), bands = [];
  const P = 104, R = 60;
  mesh(new THREE.CylinderGeometry(4.5, 6, P, 10), kit.post, g, 2).position.y = P / 2;
  // (the wheel's face turned up to you: its camera side is -z, up +y)
  const wh = G(g, 0, P + R * 0.55, 0); wh.rotation.x = 0.42;
  mesh(new THREE.TorusGeometry(R, 3.4, 8, 40), kit.woodRing, wh, 1.8);
  // (a felloe's second ring inside the rim, so it reads as a cart wheel)
  mesh(new THREE.TorusGeometry(R - 5, 1.4, 6, 40), kit.woodRing, wh, 1.1);
  for (let k = 0; k < 10; k++) { const sp = mesh(new THREE.CylinderGeometry(1.5, 2, R - 6, 8), kit.post, wh, 1.2); const a = k / 10 * PI * 2 + 0.16; sp.position.set(Math.cos(a) * R / 2, Math.sin(a) * R / 2, 0.8); sp.rotation.z = a + HALF; }
  mesh(new THREE.CylinderGeometry(8, 8, 11, 12), kit.post, wh, 1.5).rotation.x = HALF;
  // the man, broken on it: on his back on the face, his hips at the hub and
  // his head thrown back over the top rim; the thighs out to the rim and the
  // shins snapped back behind it through the spokes; the arms out along the
  // upper spokes, the forearms broken back over the rim; lashed at wrist
  // and knee
  const man = buildMan(kit, rnd, { hose: true }); wh.add(man); restBody(man);
  shade(g, 0, 0, 40, 26, 70); shade(g, -58, 10, 22, 12);
  man.position.set(0, -BODY_HIPS + 4, -5);
  const d = man.userData;
  d.legs.l.hip.rotation.set(0, 0, 0.42); d.legs.r.hip.rotation.set(0, 0, -0.42);
  d.legs.l.kn.rotation.x = KNEE_BACK * 1.7; d.legs.r.kn.rotation.x = KNEE_BACK * 1.9;
  d.arms.l.sh.rotation.set(0, 0, 2.15); d.arms.r.sh.rotation.set(0, 0, -2.05);
  d.arms.l.el.rotation.x = KNEE_BACK * 1.45; d.arms.r.el.rotation.x = KNEE_BACK * 1.25;
  d.neck.rotation.set(-0.85, 0, 0.35);
  // the lashings: a rope round each wrist and each knee, out to the rim
  const lash = (part, y) => { const r = mesh(new THREE.TorusGeometry(4.6, 0.9, 6, 12), kit.rope, part, 0.9); r.position.y = y; r.rotation.x = HALF; };
  lash(d.arms.l.hand, 1); lash(d.arms.r.hand, 1); lash(d.legs.l.kn, -1); lash(d.legs.r.kn, -1);
  wound(d.legs.l.kn, 5, 7, 9, 0, -2, -2, kit); wound(d.legs.r.kn, 5, 6, 8, 0, -2, -2, kit); wound(d.arms.r.el, 4, 6, 7, 0, -1, 0, kit); wound(d.arms.l.el, 4, 5, 6, 0, -1, 0, kit);
  // Death with the bar: both hands, raised over his head
  const death = buildDeath(kit, rnd); g.add(death); restSkeleton(death);
  death.position.set(-62, 0, -6); death.rotation.y = -1.15;   // (facing the wheel, turned a little to you)
  const dd = death.userData;
  const bar = mesh(new THREE.CylinderGeometry(1.8, 2.2, 88, 8), kit.iron, g, 1.4); bar.position.y = 12; hold(dd.arms.r.hand, bar); dd.arms.l.hand.userData.grip(1);   // (across both fists, raised)
  dd.legs.l.hip.rotation.x = -0.4; dd.legs.r.hip.rotation.x = 0.35; dd.legs.r.kn.rotation.x = KNEE_BACK * 0.4;
  g.add(pool(kit, rnd, 18)).position.set(6, 0, 16);
  // (no band of blood round him: across his belly it read as a red corset;
  // the blood is at the breaks, and drips off the rim under them)
  const act = (tt, dt, w, still) => {
    // the blow: a slow, deliberate wind-up, the bar brought crashing down,
    // a pause of recovery (a 3.8 s cycle with more time on the wind-up)
    const c = still ? 0.3 : (tt % 3.8) / 3.8;
    const up = smoother(c / 0.55) * (1 - smoother((c - 0.60) / 0.06));
    const down = smoother((c - 0.60) / 0.06) * (1 - smoother((c - 0.72) / 0.28));
    const raise = up * 2.6 + down * -0.6, rec = down * 0.14;
    // (a limb's +x swings it forward: held forward and down, wound up over
    // and behind the head, brought down through the front onto the wheel;
    // the back arched on the wind-up, bowed hard on the blow)
    const th = 0.9 + raise * 1.12;
    dd.arms.r.sh.rotation.set(th, 0, -0.3); dd.arms.l.sh.rotation.set(th, 0, 0.3);
    dd.arms.r.el.rotation.x = 0.4 + up * 0.7; dd.arms.l.el.rotation.x = 0.4 + up * 0.7;
    // spine: arches well back on the wind-up, crashes forward on the blow
    dd.spine.rotation.x = -0.15 + up * 0.35 - down * 0.55;
    // hips: rises slightly on the wind-up, drops hard on the blow
    dd.hips.position.y = 92 - down * 7 + up * 2;
    // front knee bends deeper on the blow — a lunge
    dd.legs.r.kn.rotation.x = KNEE_BACK * 0.4 + down * 0.35;
    // neck: tips back on the wind-up (watching the bar rise), snaps forward on the blow
    dd.neck.rotation.x = still ? 0 : up * 0.2 - down * 0.25;
    wh.rotation.z = (still ? 0 : Math.sin(tt * 0.3) * 0.03) + rec + w * 0.05;
    d.arms.l.sh.rotation.z = 2.15 + (still ? 0 : Math.sin(tt * 2.3) * 0.05);   // (a twitch)
  };
  return { g, death, act, bands, drips: [[V(6, P + 10, -16), V(6, 2, -10)]], crows: [[R - 6, P + R * 0.55 + 30, 4], [-R + 4, P + R * 0.55 + 26, 10]], width: 140, victims: [man], freed: { pose: 'walk', at: [84, 0, -30] } };
}
// V. THE GALLOWS. A beam on two posts, two hanged - one long dead, one not
// - crows on the beam; Death under them with the drum, dancing.
function vGallows(kit, rnd) {
  const g = new THREE.Group(), bands = [];
  const H = 252, W = 120;
  [-1, 1].forEach(s => mesh(new THREE.BoxGeometry(8, H, 8), kit.post, g, 2).position.set(s * W / 2, H / 2, 0));
  mesh(new THREE.BoxGeometry(W + 30, 8, 8), kit.wood, g, 2).position.y = H;
  [-1, 1].forEach(s => { const b = mesh(new THREE.BoxGeometry(6, 6, 36), kit.wood, g, 1.3); b.position.set(s * (W / 2 - 14), H - 14, 0); b.rotation.z = s * 0.78; });
  // the hanged: a man, fresh, and a skeleton in rags; each on its rope
  const hanged = [];
  [[-30, 0], [30, 1]].forEach(([x, k]) => {
    // (a hanged body: the rope taut from the beam to the knot under one
    // ear, the head thrown over to the other side by it, the shoulders
    // dropped, the arms bound behind, the legs long and loose, the feet
    // pointed down - his weight is all on the rope, nothing under him)
    const piv = G(g, x, H - 4, 0);
    // (a short drop on a stout rope, so the feet hang a man's shin clear of
    // the ground and the rope reads from the beam down to the knot)
    const ROPE = 30;
    mesh(new THREE.CylinderGeometry(1.9, 1.9, ROPE + 4, 7), kit.rope, piv, 1.2).position.y = -ROPE / 2 - 1;
    const b = buildMan(kit, rnd, { shirt: true, hose: k === 1, beard: k === 0 }); restBody(b);
    const face = k ? -0.22 : 0.18;
    // (the knot at the rope's end: the neck joint is 147 up the body, the coil 5 above it)
    b.position.y = -(ROPE + 152); b.rotation.y = face; piv.add(b);
    const d = b.userData;
    const side = k ? -1 : 1;
    d.neck.rotation.set(0.42, 0, side * 0.95);
    // the noose: a coil round the neck and the knot standing out under the ear
    const coil = mesh(new THREE.TorusGeometry(5.2, 1.2, 6, 14), kit.rope, d.neck, 1.0); coil.position.y = 5; coil.rotation.x = HALF;
    const knot = mesh(new THREE.CylinderGeometry(1.9, 1.9, 6, 7), kit.rope, d.neck, 1.0); knot.position.set(-side * 5.6, 7.5, 0.5);
    // (the wrists bound before him at the groin, the cord round them, the
    // elbows at his sides: bound behind, the arms were lost behind the body
    // and he read armless from the seat)
    ['l', 'r'].forEach(s => {
      const sx = s === 'l' ? 1 : -1;
      // (reach's target is in the body's parent's frame, the rope's pivot)
      reach(d.arms[s], V(-sx * 1.6, 95, -11).applyEuler(b.rotation).add(b.position).toArray(), b, 10, { start: [0.3, 0, sx * 0.15, 1.2], elbow: V(sx * 21, 115, 0).applyEuler(b.rotation).add(b.position).toArray() });
      d.arms[s].hand.userData.grip(0.55);
    });
    { b.updateMatrixWorld(true); const wl = b.worldToLocal(d.arms.l.hand.getWorldPosition(V(0, 0, 0))), wr = b.worldToLocal(d.arms.r.hand.getWorldPosition(V(0, 0, 0)));
      const cord = mesh(new THREE.TorusGeometry(3.2, 0.9, 5, 12), kit.rope, b, 0.9); cord.position.copy(wl.add(wr).multiplyScalar(0.5)); cord.rotation.set(0.2, HALF, 0); }
    d.legs.l.hip.rotation.set(0.04, 0, 0.05); d.legs.r.hip.rotation.set(-0.06, 0, -0.04);
    d.legs.l.kn.rotation.x = KNEE_BACK * (k ? 0.35 : 0.12); d.legs.r.kn.rotation.x = KNEE_BACK * 0.08;
    d.legs.l.foot.rotation.x = -0.95; d.legs.r.foot.rotation.x = -0.85;
    d.mouth.scale.set(1.2, 1.6, 0.5);
    hanged.push({ piv, b, k, ph: rnd() * 6, face });
  });
  // Death the drummer: the drum slung at his hip, a stick in each hand
  const death = buildDeath(kit, rnd); g.add(death); restSkeleton(death);
  death.position.set(4, 0, -26); death.rotation.y = -0.3;   // (before the two of them, toward you, the drum at his side in sight)
  const dd = death.userData;
  const drum = G(dd.hips, 12, -6, -12);
  const dm = mesh(new THREE.CylinderGeometry(9, 9, 14, 16), kit.cloth, drum, 1.6); dm.rotation.x = HALF; dm.rotation.z = 0.3;
  mesh(new THREE.CylinderGeometry(9.4, 9.4, 1.2, 16), kit.post, drum, 1.2).rotation.copy(dm.rotation);
  ['l', 'r'].forEach(s => { const st = mesh(new THREE.CylinderGeometry(0.6, 0.8, 18, 6), kit.post, g, 1); st.position.y = 7; hold(dd.arms[s].hand, st, { roll: s === 'l' ? 0.5 : -0.5 }); });
  // (hanging is bloodless: no pool under them and no blood at the face - a
  // band at the head's height printed as a red hood; the pool is made and
  // left out so the dressing's draws after it fall as before)
  pool(kit, rnd, 14);
  [-1, 1].forEach(s => shade(g, s * W / 2, 0, 9, 7, 30)); shade(g, 4, -26, 22, 12); shade(g, -30, 0, 14, 9, 150); shade(g, 30, 0, 14, 9, 150);
  const act = (tt, dt, w, still) => {
    const wv = still ? 0 : tt * 3.2;
    stepSkeleton(death, wv, 1.6);   // (bigger dance amplitude)
    // a higher bounce: Death is joyful here
    dd.hips.position.y = 92 + (still ? 0 : Math.max(0, Math.sin(wv)) * 10);
    // drumming: bigger strokes, alternating - the sticks really come down
    const lHit = still ? 0 : Math.sin(wv * 2), rHit = still ? 0 : Math.cos(wv * 2);
    dd.arms.l.sh.rotation.set(0.3 + lHit * 0.55, 0, 0.4); dd.arms.r.sh.rotation.set(0.3 + rHit * 0.55, 0, -0.4);
    dd.arms.l.el.rotation.x = 1.0 + (still ? 0 : Math.sin(wv * 2 + 0.6) * 0.5); dd.arms.r.el.rotation.x = 1.0 + (still ? 0 : Math.cos(wv * 2 + 0.6) * 0.5);
    // the head bobs and sways with the beat
    dd.neck.rotation.set(0.25 + (still ? 0 : Math.max(0, lHit) * -0.15), still ? 0 : Math.sin(wv * 0.5) * 0.45, still ? 0 : Math.sin(wv) * 0.2);
    // spine sways with the dance
    dd.spine.rotation.z = still ? 0 : Math.sin(wv * 0.5) * 0.08;
    hanged.forEach((h, i) => { h.piv.rotation.z = (still ? 0 : Math.sin(tt * 0.8 + h.ph) * 0.05) + w * 0.22 * (i ? 0.7 : 1); h.piv.rotation.x = (still ? 0 : Math.sin(tt * 0.6 + h.ph) * 0.03) + w * 0.06; h.b.rotation.y = h.face + (still ? 0 : Math.sin(tt * 0.31 + h.ph) * 0.32) + w * 0.4 * (i ? -1 : 1); });   // (they turn on the rope a little, and back - never round to show their backs)
  };
  return { g, death, act, bands, drips: [], crows: [[-50, H + 6, 0], [0, H + 6, 0], [44, H + 6, 0], [-W / 2, H + 5, 0]], width: 160, victims: hanged.map(h => h.b), freed: { pose: 'dance', at: [0, 0, -30], two: true } };
}
// VI. THE STAKE. A man on the stake, run through; Death at its foot
// holding his glass up to him.
function vStake(kit, rnd) {
  const g = new THREE.Group(), bands = [];
  // (run through from the fork to the left shoulder: the stake stands
  // upright in a mound, the man slumped on it, his feet hanging clear, the
  // shaft seen below him between his legs and its point standing out of
  // him by his neck - the body leant over until that shoulder is above the
  // fork, so the shaft passes straight through both)
  // (his feet hang well clear of the mound and the stones: lower, they read
  // as stood on them)
  const FEET = 66, FORK = FEET + BODY_HIPS - 9, SHOULDER = FEET + BODY_HIPS + 50, TIP = SHOULDER + 32;
  const H = TIP;
  const stakeGeo = new THREE.CylinderGeometry(1.7, 5, TIP - 10, 9); stakeGeo.translate(0, (TIP - 10) / 2, 0);
  const stake = mesh(stakeGeo, kit.post, g, 2); stake.position.set(0, 0, 0);
  const point = mesh(new THREE.ConeGeometry(1.7, 10, 9), kit.post, stake, 1.4); point.position.y = TIP - 5;
  // the mound it is planted in, the blood run down into it
  const mound = mesh(new THREE.SphereGeometry(24, 16, 8, 0, PI * 2, 0, HALF), kit.stone, g, 1.4); mound.scale.set(1, 0.36, 0.9); mound.position.set(0, -0.5, 0);
  const piv = G(g, 0, FORK, 0);
  const man = buildMan(kit, rnd, { hose: true, beard: true }); piv.add(man); restBody(man);
  man.position.set(0, -(BODY_HIPS - 9), 0); man.rotation.set(0.06, 0.18, 0.05);   // (nearly square on: turned three-quarters he showed his back, not his fall)
  shade(g, 0, 0, 26, 16, 20); shade(g, -44, -12, 22, 12); shade(g, 0, 0, 16, 10, 120);
  const d = man.userData;
  // the slump: the head fallen away from the point, the arms hanging, one
  // hand at the shaft below him; the legs dangling apart either side of it
  d.arms.l.sh.rotation.set(0, 0, 0.18); d.arms.r.sh.rotation.set(KNEE_BACK * 0.5, 0, -0.3); d.arms.r.el.rotation.x = KNEE_BACK * -0.6;
  d.legs.l.hip.rotation.set(0.1, 0, 0.3); d.legs.r.hip.rotation.set(-0.15, 0, -0.26); d.legs.l.kn.rotation.x = KNEE_BACK * 0.35; d.legs.r.kn.rotation.x = KNEE_BACK * 0.55;
  d.legs.l.foot.rotation.x = -0.7; d.legs.r.foot.rotation.x = -0.6;
  d.neck.rotation.set(0.5, 0.2, -0.75);
  wound(d.hips, 8, 7, 10, 0, -6, -4, kit);   // (where it went in)
  wound(d.hips, 7, 7, 9, 12, 51, 0, kit);    // (where it came out)
  // (leant over on the shaft: turned at the fork until the shoulder it
  // comes out of stands above it)
  for (let k = 0; k < 4; k++) { g.updateMatrixWorld(true); const sh = g.worldToLocal(d.arms.l.sh.getWorldPosition(V(0, 0, 0))); piv.rotation.z += Math.atan2(sh.x - 0, sh.y - FORK); }
  // (slumped on it, whatever the lean of the body above: the thighs fallen
  // open either side of the shaft and the shins hanging straight down from
  // the knees, a diamond round the stake that reads from in front as a
  // weight sat on it - knees bent only fore and aft vanish in the frontal
  // view and he stood on air; the head dropped, the arms hanging dead)
  // (and the trunk fallen forward over the shaft, SLUMP: held square and
  // upright he read as standing in the air; the legs and arms hang plumb
  // from it, the knees a little open and uneven, the toes down, the head
  // fallen onto the shoulder)
  const SLUMP = -0.42; piv.rotation.x = SLUMP;
  d.legs.l.hip.rotation.set(0.3 - SLUMP, 0, -piv.rotation.z + 0.32); d.legs.r.hip.rotation.set(0.16 - SLUMP, 0, -piv.rotation.z - 0.28);
  d.legs.l.kn.rotation.set(KNEE_BACK * 0.55, 0, -0.3); d.legs.r.kn.rotation.set(KNEE_BACK * 0.35, 0, 0.26);
  d.legs.l.foot.rotation.x = -0.75; d.legs.r.foot.rotation.x = -0.55;
  d.neck.rotation.set(-0.3, 0.3, -0.85);   // (onto the shoulder, a cheek and brow still showing: with the trunk's fall, further forward he showed only his crown)
  d.arms.l.sh.rotation.set(0.1 - SLUMP, 0, 0.12); d.arms.r.sh.rotation.set(0.15 - SLUMP, 0, -0.14); d.arms.l.el.rotation.x = 0.2; d.arms.r.el.rotation.x = 0.25;
  // Death with the glass, looking up
  const death = buildDeath(kit, rnd); g.add(death); restSkeleton(death);
  // (stepped out to the side and toward you, clear of him, facing up at
  // his face: a limb's +x swings it forward, a neck's +x tips the head back)
  g.updateMatrixWorld(true);
  const face = g.worldToLocal(d.head.getWorldPosition(V(0, 0, 0)));
  death.position.set(-58, 0, -22); death.rotation.y = Math.atan2(-(face.x - -58), -(face.z - -22));
  const dd = death.userData;
  dd.arms.l.sh.rotation.set(-0.15, 0, 0.25); dd.arms.l.el.rotation.x = 0.35;
  dd.neck.rotation.x = 0.28; dd.spine.rotation.x = 0.04;   // (looking up at him, not thrown back: further, his skull sank to his shoulder and he read as malformed)
  // the glass held up to his face at arm's length, as far as the arm goes
  const raised = reach(dd.arms.r, [face.x - 32, Math.min(face.y - 8, 194), face.z - 20], death, 12, { start: [2.4, 0, -0.2, 0.3] });
  const glass = buildHourglass(kit, 26); glass.position.set(0, -15, -4); glass.rotation.x = 0.3; dd.arms.r.hand.add(glass); dd.arms.r.hand.userData.grip(0.45);
  g.add(pool(kit, rnd, 20)).position.set(-6, 0, 1);
  // (the blood from where the point came out, down his breast; the shaft
  // red from his fork to the ground)
  bleed(man, 0.17); bands.push([man, SHOULDER + 6, SHOULDER - 26]);
  d.head.traverse(o => { if (o.userData.bleeds) o.material.uniforms.uBloodOn.value = 0; });   // (his head, fallen to the shoulder, lies in the band's height: left in it, it printed as a red hood)
  bleed(stake, 0.95); bands.push([stake, FORK + 4, 0]);
  const act = (tt, dt, w, still) => {
    d.arms.l.sh.rotation.x = 0.4 + (still ? 0 : Math.sin(tt * 0.5) * 0.06);
    d.neck.rotation.z = -0.85 + (still ? 0 : Math.sin(tt * 0.35) * 0.08);
    // Death: theatrical presentation — weight shifts, glass tilts, head tracks
    const sw = still ? 0 : Math.sin(tt * 0.4);
    dd.neck.rotation.y = still ? 0 : sw * 0.18;
    dd.neck.rotation.x = 0.28 + (still ? 0 : Math.sin(tt * 0.6) * 0.06);   // looks up and down
    setArm(dd.arms.r, raised); dd.arms.r.sh.rotation.x += still ? 0 : Math.sin(tt * 0.7) * 0.08;
    // tilt the glass slowly, presenting it
    glass.rotation.z = still ? 0 : Math.sin(tt * 0.35) * 0.15;
    // weight shift side to side — he's savoring, not standing at attention
    dd.hips.position.y = 92 + (still ? 0 : Math.sin(tt * 0.3) * 1.5);
    dd.hips.rotation.z = still ? 0 : sw * 0.04;
    dd.spine.rotation.z = still ? 0 : sw * -0.05;                           // counter-sway
    dd.spine.rotation.x = 0.04 + (still ? 0 : Math.max(0, sw) * 0.06);     // leans in when looking up
    // left arm gestures slightly — not dead at his side
    dd.arms.l.sh.rotation.x = -0.15 + (still ? 0 : Math.sin(tt * 0.5) * 0.1);
  };
  return { g, death, act, bands, drips: [[V(-2, FORK - 6, -2), V(-2, 2, -1)]], crows: [[0, TIP + 2, 0]], width: 100, victims: [man], freed: { pose: 'peace', at: [-44, 0, -26], beside: [52, -6] } };
}
// VII. THE DRAGGING. Death striding off to your left, leant into it, a man
// behind him by one ankle: flat on his back, dragged feet first, the leg up
// to the hand, his arms trailed out over his head, the smear of him back to
// where he was taken - so the drag reads as one long line along the ground,
// pulled up at the near end, at a glance.
function vDragging(kit, rnd) {
  const g = new THREE.Group(), bands = [];
  // (the drag laid on a slant: the near end, Death, toward you on your left,
  // the body running back from him into the valley - so the long line of it
  // fits its window)
  // (turned well back into the valley - Death striding out of it toward
  // you, the man dragged after him back into the depth - and set back so
  // Death stands where he did: the whole length of him, head and trailed
  // arms too, stays inside the window instead of running off its edge)
  const dg = G(g, 26, 0, 37); dg.rotation.y = 1.1;
  const death = buildDeath(kit, rnd); dg.add(death); restSkeleton(death);
  death.position.set(72, 0, 14); death.rotation.y = -HALF + 0.3;   // (facing +x, your left, a little toward you)
  const dd = death.userData;
  const BEND = -0.2; dd.spine.rotation.x = BEND;   // (leant into the pull: a joint's -x bows forward)
  // (striding away: the near leg out in front and bent, the far one long
  // behind on its toes, the hips down with the stride so the front foot stands)
  const SL = 0.55;
  const stride = () => {
    dd.legs.r.hip.rotation.x = SL; dd.legs.r.kn.rotation.x = KNEE_BACK * SL * 1.1;
    dd.legs.l.hip.rotation.x = -SL * 0.85; dd.legs.l.kn.rotation.x = KNEE_BACK * 0.1; dd.legs.l.foot.rotation.x = SL * 0.9;
    dd.hips.position.y = 92 - 83 + 42 * Math.cos(SL) + 41 * Math.cos(SL * 0.1);
  };
  stride();
  dd.arms.l.sh.rotation.set(0.5, 0, 0.15); dd.arms.l.el.rotation.x = 0.6;   // (the free arm swung forward, with the stride)
  // the man: flat on his back, dragged feet first by one ankle - the leg up
  // to Death's hand, his arms trailed out over his head, the head lolled
  const man = buildMan(kit, rnd, { shirt: true }); dg.add(man); restBody(man);
  man.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(0, 0, 1), V(-1, 0, 0), V(0, -1, 0)));   // (head to -x, face up)
  const d = man.userData;
  d.legs.r.hip.rotation.set(1.0, 0, 0.06); d.legs.r.kn.rotation.x = KNEE_BACK * 0.06;   // (the near leg, hauled up by its ankle)
  // (the other leg trailed along the ground behind, a little apart - drawn
  // up, its knee knotted with Death's feet - its foot slack along it, the
  // sole turned down: square to the leg, the sole faced you end-on as a
  // black blot by Death's foot and read as his head)
  d.legs.l.hip.rotation.set(0.12, 0, -0.22); d.legs.l.kn.rotation.x = KNEE_BACK * 0.12; d.legs.l.foot.rotation.x = -0.9;
  d.arms.l.sh.rotation.set(2.95, 0, 0.62); d.arms.r.sh.rotation.set(2.85, 0, -0.7);
  d.arms.l.el.rotation.x = 0.1; d.arms.r.el.rotation.x = 0.15;
  d.neck.rotation.x = 0.35;
  // (set by his back: the lowest of him just into the dirt, the hips where
  // the drag has got him)
  g.updateMatrixWorld(true);
  const hp = dg.worldToLocal(d.hips.getWorldPosition(V(0, 0, 0)));
  const low = new THREE.Box3().setFromObject(man).min.y - g.position.y;
  const MAN0 = V(-3 - hp.x, -0.6 - low, 4 - hp.z);
  man.position.add(MAN0); MAN0.copy(man.position);
  g.updateMatrixWorld(true);
  // Death's near hand fast round the ankle, reached to it: the shin just
  // above the foot
  const ank = dg.worldToLocal(d.legs.r.foot.getWorldPosition(V(0, 0, 0)));
  const shin = dg.worldToLocal(d.legs.r.kn.getWorldPosition(V(0, 0, 0))).sub(ank).normalize();
  const tgt = ank.clone().addScaledVector(shin, 5).toArray();
  const tries = [[-1.0, 0, -0.25, 0.2], [-0.6, 0.4, -0.6, 0.5], [-1.4, -0.3, 0.1, 0.1]].map(st0 => { const an = reach(dd.arms.r, tgt, death, 12, { start: st0 }); return { an, miss: dd.arms.r.miss }; });
  const best = tries.reduce((x, y2) => y2.miss < x.miss ? y2 : x);
  setArm(dd.arms.r, best.an); dd.arms.r.miss = best.miss;
  dd.arms.r.hand.userData.grip(0.85);
  wound(d.hips, 13, 9, 3.4, 3, 17, -9.4, kit);   // (a raw gash across the belly, sunk in it)
  shade(dg, 76, 6, 24, 12); shade(dg, -23, 6, 62, 14, 12);
  // the smear behind him, long, back the way he came
  const sm = mesh(splat(24, rnd, 2.2, 30), kit.pool, dg, 1.2); sm.position.set(-96, 0.6, 6); sm.renderOrder = 1;
  dg.add(pool(kit, rnd, 10)).position.set(-33, 0, 8);
  bleed(man, 0.6); bands.push([man, 10, 0]);
  const rArm = best.an.slice();
  // (the hand's grip point, for the body to follow it on each heave)
  const gripAt = () => { g.updateMatrixWorld(true); return dg.worldToLocal(dd.arms.r.hand.localToWorld(V(...GRIP))); };
  const grip0 = gripAt();
  const act = (tt, dt, w, still) => {
    const wv = still ? 0 : tt * 2.2;
    // (the haul: each heave he leans hard into the pull, sinks on the front
    // knee and bows his spine, then straightens and gathers for the next)
    const hv = still ? 0 : Math.pow(Math.max(0, Math.sin(wv)), 2);
    const rec = still ? 0 : Math.pow(Math.max(0, -Math.sin(wv)), 2) * 0.3;   // recovery: a lighter lift
    stride();
    dd.hips.position.y -= hv * 5 - rec * 1.5;   // deep drop on the heave
    dd.legs.r.kn.rotation.x += hv * 0.25;   // front knee bends more on the pull
    dd.spine.rotation.x = BEND - hv * 0.28 + rec * 0.06;   // strong bow forward
    dd.spine.rotation.z = still ? 0 : Math.sin(wv * 0.5) * 0.05;   // a little sway
    // the head dips with the effort, lifts on recovery
    dd.neck.rotation.x = still ? 0 : hv * -0.12 + rec * 0.08;
    // the free arm swings back with the heave (counterbalance)
    dd.arms.l.sh.rotation.x = 0.5 - hv * 0.4 + rec * 0.15;
    dd.arms.l.el.rotation.x = 0.6 + hv * 0.3;
    setArm(dd.arms.r, rArm);
    // the body jerks on after the hand, along the ground
    const gp = gripAt();
    man.position.set(MAN0.x + (gp.x - grip0.x), MAN0.y, MAN0.z + (gp.z - grip0.z));
    d.neck.rotation.x = 0.35 + (still ? 0 : Math.sin(wv - 0.6) * 0.15);
    d.arms.l.sh.rotation.z = 0.62 + (still ? 0 : Math.sin(wv + 1) * 0.12);
  };
  return { g, death, act, bands, drips: [], crows: [[-100, 2, 62]], width: 150, victims: [man], freed: { pose: 'peace', at: [14, 0, -22], beside: [-52, -6] } };
}
const VIGNETTES = [vSawyer, vFlaying, vWheel, vDragging, vGallows, vWindlass, vStake];
// (the lab: one vignette built alone, for the study page - the kit's
// shadow plate set as prepareTable sets it)
export function labVignette(n, kit, seed = 23) { shade.mat = kit.shadow; return VIGNETTES[n](kit, seeded(seed)); }
export const VIGNETTE_NAMES = ['sawyer', 'flaying', 'wheel', 'dragging', 'gallows', 'windlass', 'stake'];
// each station's placard, against its own vignette (vignette-local: x, post
// height, z - searched from the station's own camera: the board clear of its
// figures and its posts, in front of them, and drawn in within 44 of the
// middle so the next stations' frames never see it; the sawyer's set low
// to the side of the head that hangs over the pool)
const SPOTS = [[0, 0, -36, 56, -40], [0, 0, -36, 56, -40], [0, 0, 40, 96, -40], [0, 0, 44, 88, -40], [0, 0, -32, 56, -30], [0, 0, -44, 64, -40], [0, 0, 40, 104, -40]];

// Your hands (you are the dealer): two of Death's forearms reaching in from
// under the frame, the right on the hourglass's cap, the left over the skull
// cup - a size up, a giant's at his table. Each forearm runs from its hand
// down toward a point under the table's near edge, so it leaves the frame at
// its foot, as your own arms would; the palm turned down onto what it holds.
function buildHands(kit, rnd, table) {
  const g = new THREE.Group();
  const sk = buildDeath(kit, rnd), a = sk.userData.arms;
  const S = 1.25, off = V(0, -33.5, 3.6), palm = V(0, 0, 1), down = V(0, -1, 0);
  const lay = (arm, tgt, from, grip) => {
    const el = arm.el; el.parent.remove(el); g.add(el);
    el.scale.setScalar(S); el.rotation.set(0, 0, 0);
    const T = V(...tgt), u = V(...from).sub(T).normalize();
    // (the forearm's own line, elbow to grip, laid along the reach; then
    // turned about it until the palm faces down)
    const q1 = new THREE.Quaternion().setFromUnitVectors(off.clone().normalize(), u.clone().negate());
    const axis = u.clone().negate(), n = palm.clone().applyQuaternion(q1);
    const np = n.clone().addScaledVector(axis, -n.dot(axis)).normalize(), dp = down.clone().addScaledVector(axis, -down.dot(axis)).normalize();
    const phi = Math.atan2(V(0, 0, 0).crossVectors(np, dp).dot(axis), np.dot(dp));
    el.quaternion.copy(new THREE.Quaternion().setFromAxisAngle(axis, phi).multiply(q1));
    el.position.copy(T).sub(off.clone().multiplyScalar(S).applyQuaternion(el.quaternion));
    arm.hand.userData.grip(grip);
  };
  const gp = table.userData.glass.position, kp = table.userData.skull.position;
  lay(a.r, [gp.x + 1, 23.5, gp.z - 2], [gp.x + 8, -16, -22], 0.5);
  lay(a.l, [kp.x - 1, 19, kp.z - 1], [kp.x - 8, -16, -24], 0.3);
  return g;
}

// ------------------------------------------------------------ the land
// the shelf and the terraces: one ground, flat under the table, dropping
// past the lip to the first terrace, the river's trough, up to the second
// and the third, the hills beyond; flat pads where the vignettes stand
function groundHeight(x, z, n1, n2) {
  // (all of it by the distance from your feet: the shelf, the river's
  // trough in an arc round it, the ring's floor, then the hills behind)
  const dx = x - RING.c[0], dz = z - RING.c[1], r = Math.hypot(dx, dz), th = Math.atan2(dx, dz);
  let y = FLOOR * smoother((r - SHELF) / 50);
  y += (n1(x * 0.012 + 3, z * 0.012) - 0.5) * 10 + (n2(x * 0.04, z * 0.04) - 0.5) * 2.5;
  const rr = RIVER.r + Math.sin(th * 4.2) * 12;
  y -= 16 * Math.exp(-Math.pow((r - rr) / (RIVER.w * 0.9), 2));
  y += 46 * smoother((r - 440) / 60) + smoother((r - 520) / 320) * 300 + (n1(x * 0.004, z * 0.004) - 0.5) * 160 * smoother((r - 520) / 200);
  // the pads
  for (const [sx, sz, up] of PADS) { const dd = Math.hypot(x - sx, z - sz); y = lerp(y, FLOOR + (up || 0), smoother(1 - dd / (72 + (up || 0)))); }
  return y;
}
function vnoise2(seed) {
  const h = (x, y) => { let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041)) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  return (x, y) => { const x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty); return lerp(lerp(h(x0, y0), h(x0 + 1, y0), sx), lerp(h(x0, y0 + 1), h(x0 + 1, y0 + 1), sx), sy); };
}
function buildGround() {
  const n1 = vnoise2(5), n2 = vnoise2(11);
  // (out past the half ring's ends on both sides and behind you, so a
  // landscape frame turned to an end station still has hills to its edge)
  const geo = new THREE.PlaneGeometry(1800, 2340, 150, 198);
  geo.rotateX(-HALF);
  geo.translate(0, 0, 210);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, groundHeight(p.getX(i), p.getZ(i), n1, n2));
  geo.computeVertexNormals();
  // (its uv in rings round your feet - u along the ring, v outward, in world
  // units - so its lines run level across the frame whichever way you face)
  // (the strokes open out up the hills, so far off they never close into a
  // moire: past the ring's floor each stroke stands for more ground)
  const uv = geo.attributes.uv, tone = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const dx = p.getX(i) - RING.c[0], dz = p.getZ(i) - RING.c[1], r = Math.hypot(dx, dz);
    uv.setXY(i, Math.atan2(dx, dz) * r, r < 420 ? r : 420 + (r - 420) * 0.5);
    // the hills behind the figures laid in as one planned passage, the same
    // all round: dark at their foot, where the figures stand against them,
    // opening toward the crest, so every torment has a dark field behind it
    // whichever way the hill happens to face the light
    const v = 0.57 - 0.3 * smoother((r - 620) / 300) + (n1(p.getX(i) * 0.006 + 9, p.getZ(i) * 0.006) - 0.5) * 0.08;   // (below the cross set's tone: at 0.66 the foot crossed and closed into a black belt that shouted over the figures)
    tone[i * 2] = v; tone[i * 2 + 1] = smoother((r - 430) / 50);
  }
  geo.setAttribute('aTone', new THREE.BufferAttribute(tone, 2));
  // the ground's cut: level strokes round the ring at a mid tone, so the
  // figures (their lights bare paper) stand off it, as in his plates
  // (its rings worked out per pixel from the world point under it, `ring`,
  // set once the seat is placed: the uv rings, interpolated across the
  // mesh's faces, kinked at every edge into a zip; the hand's drift slow and
  // each stroke swelling and thinning along its length, so a line undulates
  // as a cut one does and never jitters like a plotted trace)
  const g = new THREE.Mesh(geo, mat({ uv: [1, 1], angle: -HALF, freq: 0.6, tone: 0.42, sky: 0.4, keyI: 1.0, wobble: 0.6, wobF: 0.05, swell: 0.45, toneMap: true }));
  g.userData.height = (x, z) => groundHeight(x, z, n1, n2);
  return g;
}
// the river: a ribbon down the trough, red, its current lines crawling
function buildRiver(kit, height) {
  const pts = [];
  // (an arc round the shelf, through the half ring's width and on past it)
  for (let th = -2.9; th <= 2.9001; th += 0.04) { const [x, z] = ringAt(th, RIVER.r + Math.sin(th * 4.2) * 12); pts.push(V(x, height(x, z) + 5, z)); }
  const curve = new THREE.CatmullRomCurve3(pts);
  const n = 120, w = RIVER.w * 0.62;
  const pos = [], uv = [], idx = [];
  const tan = V(0, 0, 0), side = V(0, 0, 0), up = V(0, 1, 0), pt = V(0, 0, 0);
  for (let i = 0; i <= n; i++) {
    const t = i / n; curve.getPointAt(t, pt); curve.getTangentAt(t, tan); side.crossVectors(up, tan).normalize();
    const ww = w * (0.85 + 0.2 * Math.sin(t * 9));
    for (let s = -1; s <= 1; s += 0.5) { pos.push(pt.x + side.x * ww * s, pt.y - Math.abs(s) * 1.5, pt.z + side.z * ww * s); uv.push(s * 0.5 + 0.5, t); }
  }
  for (let i = 0; i < n; i++) for (let s = 0; s < 4; s++) { const a = i * 5 + s, b = a + 5; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
  const r = new THREE.Mesh(geo, kit.river);
  // the banks' lip: a line of ink along each edge
  return r;
}
// the sky: Holbein's - bone, the clouds billows outlined and hatched
// under, long strokes low down, birds (a canvas, so it can drift)
function skyTex() {
  return K.canvasTex(2048, 1024, (g, W, H) => {
    g.fillStyle = '#E8DCC0'; g.fillRect(0, 0, W, H);
    const rnd = seeded(29);
    g.strokeStyle = '#1A0F0C'; g.lineCap = 'round';
    // the sky ruled as his cutter ruled it: unbroken level lines across the
    // whole plate, heaviest at the top and thinning toward the hills until
    // they give out above them, so the sky pales into the distance and the
    // crest stands dark against it (lines broken into dashes, and darker
    // low down, read as a screen's scanlines); each line drawn in short runs
    // whose weight swells and thins along it, as a burin cuts
    for (let y = H * 0.04; y < H * 0.72; y += 7.5 + rnd() * 1.2) {
      const k = Math.max(0, 1 - y / (H * 0.72)), ph = rnd() * 6, wy = (rnd() - 0.5) * 2;
      g.globalAlpha = 0.25 + 0.5 * k;
      // (every wave in it a whole number of turns across the plate, which
      // wraps round the sky four times: no step where its ends meet)
      const at = x => y + wy * Math.sin(2 * PI * 3 * x / W + ph) + Math.sin(2 * PI * x / W + ph * 2) * 1.2;
      let px = 0, py = at(0);
      for (let i = 1; i <= 96; i++) {
        const x = i * W / 96, ny = at(x);
        g.lineWidth = Math.max(0.5, (0.6 + 1.7 * k) * (0.75 + 0.25 * Math.sin(2 * PI * 7 * x / W + ph)));
        g.beginPath(); g.moveTo(px, py); g.lineTo(x, ny); g.stroke(); px = x; py = ny;
      }
    }
    g.globalAlpha = 1;
    // the clouds, as Holbein's cutter drew them: each one mass with a
    // scalloped top (the billows overlap, one continuous edge, never loose
    // arcs), a flat-ish belly, the lower half hatched with level lines that
    // stop at the edge, heavier toward the belly - fewer, larger, low
    const cloud = (cx, cy, wdt, ht) => {
      // (a heap: big billows in the middle, small at the ends, each sitting
      // on the belly and overlapping its neighbour by most of its radius, so
      // the joins are shallow notches - the edge of the union, found by
      // marching round the top and taking the highest circle at each x)
      const n = 5 + Math.floor(wdt / 40), bill = [];
      for (let i = 0; i < n; i++) { const t = (i + 0.5) / n, r = ht * (0.3 + 0.55 * Math.pow(Math.sin(PI * t), 0.8) + (rnd() - 0.5) * 0.16); bill.push([cx - wdt / 2 + t * wdt, cy + ht * 0.32 - r * 0.85, r]); }
      const belly = cy + ht * 0.32;
      const topAt = x => { let y = belly; for (const [bx, by, r] of bill) { const d = x - bx; if (Math.abs(d) < r) y = Math.min(y, by - Math.sqrt(r * r - d * d)); } return y; };
      const xa = bill[0][0] - bill[0][2], xb = bill[n - 1][0] + bill[n - 1][2];
      // (the underside in shallow lobes of its own, never a straight cut)
      const lobes = 2 + Math.floor(wdt / 70), ph = rnd() * PI;
      const botAt = x => belly + ht * 0.2 * Math.abs(Math.sin((x - xa) / (xb - xa) * PI * lobes + ph * 0.2)) + ht * 0.08 * Math.sin((x - xa) / (xb - xa) * PI);
      const path = new Path2D();
      path.moveTo(xa, belly);
      for (let x = xa; x <= xb; x += 2) path.lineTo(x, Math.min(belly, topAt(x)));
      for (let x = xb; x >= xa; x -= 2) path.lineTo(x, botAt(x));
      path.closePath();
      // (the paper inside, so the sky's lines stop at the cloud)
      g.fillStyle = '#E8DCC0'; g.fill(path);
      g.save(); g.clip(path);
      // (its shade cut in strokes that follow the lobed underside up into
      // the heap, heaviest at the bottom and giving out before the lit
      // tops: hatched level from a flat cut, and over most of it, the heaps
      // read as tombstones standing on the ridge)
      for (let j = 0, d = 1.4; d < ht * 0.5; j++, d += 3.3) {
        const k = 1 - d / (ht * 0.5);
        g.globalAlpha = 0.3 + 0.6 * k; g.lineWidth = 0.8 + 1.4 * k;
        g.beginPath(); g.moveTo(xa, botAt(xa) - d);
        for (let x = xa + 4; x <= xb; x += 4) g.lineTo(x, botAt(x) - d - Math.sin(x * 0.05 + j) * 0.6);
        g.stroke();
      }
      g.restore(); g.globalAlpha = 1;
      g.lineWidth = 1.8; g.stroke(path);
    };
    for (let c = 0; c < 9; c++) cloud(c / 9 * W + rnd() * W / 12, H * (0.45 + rnd() * 0.06), 110 + rnd() * 120, 16 + rnd() * 10);   // (lifted clear of the crest, smaller and short of the frame's top)
    g.globalAlpha = 1;
    // birds: a few 'v's
    for (let i = 0; i < 26; i++) { const x = rnd() * W, y = H * (0.3 + rnd() * 0.4), s = 4 + rnd() * 7; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x - s, y - s * 0.4); g.quadraticCurveTo(x - s * 0.4, y + s * 0.3, x, y); g.quadraticCurveTo(x + s * 0.4, y + s * 0.3, x + s, y - s * 0.4); g.stroke(); }
  });
}
// a two-colour canvas printed the other way round: the paper as ink, the
// ink as paper (each pixel swapped between the two, the edges between kept)
function negativeTex(src) {
  const c0 = src.image, c = document.createElement('canvas'); c.width = c0.width; c.height = c0.height;
  const g = c.getContext('2d'); g.drawImage(c0, 0, 0);
  const im = g.getImageData(0, 0, c.width, c.height), d = im.data;
  for (let i = 0; i < d.length; i += 4) { d[i] = 258 - d[i]; d[i + 1] = 235 - d[i + 1]; d[i + 2] = 204 - d[i + 2]; }
  g.putImageData(im, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = src.colorSpace; t.wrapS = src.wrapS; t.wrapT = src.wrapT; t.repeat.copy(src.repeat); t.anisotropy = src.anisotropy;
  return t;
}
function buildSky() {
  const tex = skyTex(); tex.wrapS = THREE.RepeatWrapping; tex.repeat.set(4, 1);
  const m = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, toneMapped: false, fog: false });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(SKY, 48, 24, 0, PI * 2, 0, PI * 0.6), m);
  dome.position.y = -260;
  dome.userData.tex = tex;
  return dome;
}
// the table: a plank top on a trestle, the hourglass, a skull cup, bone
// dice, a few coins; the broadside's rail at the back
function buildTable(kit) {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) { const pl = mesh(new THREE.BoxGeometry(TABLE.w, TABLE.slab, TABLE.d / 3 - 0.8), kit.wood, g, 2); pl.position.set(0, -TABLE.slab / 2, TABLE.z0 + (i + 0.5) * TABLE.d / 3); }
  [-1, 1].forEach(s => { const leg = mesh(new THREE.BoxGeometry(6, 76, 40), kit.post, g, 1.6); leg.position.set(s * (TABLE.w / 2 - 12), -TABLE.slab - 38, TABLE.z0 + TABLE.d / 2); leg.rotation.z = s * 0.1; });
  mesh(new THREE.BoxGeometry(TABLE.w - 30, 5, 5), kit.wood, g, 1.4).position.set(0, -50, TABLE.z0 + TABLE.d / 2);
  const rail = mesh(new THREE.BoxGeometry(TABLE.w, 22, 4), kit.wood, g, 1.6); rail.position.set(0, 9, TABLE.z0 + TABLE.d - 2);
  // (the hourglass and the skull cup forward, under your hands)
  const glass = buildHourglass(kit, 22); glass.position.set(-42, 0, 24); g.add(glass);
  const sk = buildSkull(kit); sk.scale.setScalar(1.15); sk.position.set(42, 7, 20); sk.rotation.set(0.25, 0.45, 0.1); g.add(sk);
  const dm = mat({ freq: 2.6, angle: 0.7, tone: -0.1 });
  for (let i = 0; i < 3; i++) { const d = mesh(new THREE.BoxGeometry(4, 4, 4), dm, g, 1.2); d.position.set(-10 + i * 7, 2, 16 + (i % 2) * 6); d.rotation.y = i * 0.7; for (let k = 0; k < [3, 5, 2][i]; k++) { const pip = new THREE.Mesh(new THREE.SphereGeometry(0.42, 6, 5), kit.ink); const [px, pz] = [[-1, -1], [1, 1], [0, 0], [-1, 1], [1, -1]][k]; pip.position.set(px * 1.1, 2.05, pz * 1.1); d.add(pip); } }
  const coinM = mat({ freq: 3.2, angle: 0.9, tone: 0.1 });
  for (let i = 0; i < 7; i++) { const c = mesh(new THREE.CylinderGeometry(3, 3, 0.5, 14), coinM, g, 0.9); c.position.set(12 + (i % 3) * 7, 0.3 + Math.floor(i / 3) * 0.6, 10 + Math.floor(i / 3) * 5); }
  shade(g, -42, 24, 7, 6, 22); shade(g, 42, 20, 9, 8, 14); shade(g, -3, 19, 12, 7, 4); shade(g, 20, 13, 14, 8, 2);
  g.userData.glass = glass; g.userData.skull = sk;
  return g;
}
// crows: two strokes each (a flat V), ink; circling and perched
function crowGeo() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-7, 0, 0, 0, 0, -1.2, -1.5, 0, 1.4, 7, 0, 0, 1.5, 0, 1.4, 0, 0, -1.2, -1.5, 0, 1.4, 0, 0.6, 3.2, 1.5, 0, 1.4], 3));
  g.computeVertexNormals();
  return g;
}
// drops: blood falling from a wound to its pool, a few in the air at once
function dropMesh(n) {
  const geo = new THREE.SphereGeometry(0.9, 6, 5); geo.scale(1, 1.6, 1);
  const m = new THREE.MeshBasicMaterial({ color: BLOOD_WET, toneMapped: false });
  const inst = new THREE.InstancedMesh(geo, m, n); inst.frustumCulled = false; return inst;
}

// ------------------------------------------------------------ the broadside
// A printed sheet: bone paper, Fell's letters in ink, the hand's box in
// blood with the letters left in bone; nailed to the rail at the corners.
// (laid out as the page's own sheet is - app.css .r3b-* - at SHEET.px to
// the cm, so the taps land where the print is)
const SL = { x: 70, rx: 1120, eyebrowY: 116, eyebrow: 52, numY: 560, now: 340, ampm: 64, ready: 420, valueY: 680, value: 76, runY: 760, runH: 240, run: 108, label: 86 };
function buildSheetBody() {
  const g = new THREE.Group();
  const c = document.createElement('canvas');
  c.width = 1800; c.height = Math.round(1800 * SHEET.h / SHEET.w);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const m = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, transparent: true, alphaTest: 0.5 });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(SHEET.w, SHEET.h), m);
  g.add(face);
  // the shadow it throws on its board: down and away from the key, cut as
  // parallel lines as a woodcut throws one (behind the sheet, on the board)
  const sc = document.createElement('canvas'); sc.width = 512; sc.height = Math.round(512 * SHEET.h / SHEET.w);
  { const x = sc.getContext('2d'); x.fillStyle = 'rgba(26,15,12,0.55)'; x.fillRect(0, 0, sc.width, sc.height); x.strokeStyle = 'rgba(26,15,12,1)'; x.lineWidth = 3.4; for (let i = -sc.height; i < sc.width; i += 7) { x.beginPath(); x.moveTo(i, sc.height); x.lineTo(i + sc.height, 0); x.stroke(); } }
  const st = new THREE.CanvasTexture(sc); st.colorSpace = THREE.SRGBColorSpace;
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(SHEET.w, SHEET.h), new THREE.MeshBasicMaterial({ map: st, toneMapped: false, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }));
  shadow.position.set(4.2, -2.4, -0.12); shadow.renderOrder = 2; g.add(shadow);
  const nm = new THREE.MeshBasicMaterial({ color: INK });
  [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sy]) => { const n = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), nm); n.position.set(sx * (SHEET.w / 2 - 2.4), sy * (SHEET.h / 2 - 2.2), -0.4); g.add(n); });
  g.userData.print = { draw: v => { drawSheet(c.getContext('2d'), c.width, c.height, v); tex.needsUpdate = true; } };
  return g;
}
let sheetBack = null, sheetLayer = null;
function sheetBackOf(W, H) {
  if (sheetBack && sheetBack.width === W) return sheetBack;
  sheetBack = document.createElement('canvas'); sheetBack.width = W; sheetBack.height = H;
  const g = sheetBack.getContext('2d'), rnd = seeded(13);
  // (the sheet's own shape: a deckled edge, a hair ragged, torn a little at
  // one corner; outside it the canvas stays clear)
  const D = 9; g.beginPath();
  const edge = (x0, y0, x1, y1, n) => { for (let i = 0; i <= n; i++) { const t = i / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t, j = (rnd() - 0.5) * D * (i % 3 ? 0.5 : 1); if (y0 === y1) g.lineTo(x, y + j); else g.lineTo(x + j, y); } };
  g.moveTo(D, D); edge(D, D, W - D, D, 90); edge(W - D, D, W - D, H - D * 3.5, 60); g.lineTo(W - D * 6, H - D); edge(W - D * 6, H - D, D, H - D, 90); edge(D, H - D, D, D, 60); g.closePath(); g.clip();
  g.fillStyle = '#E8DCC0'; g.fillRect(0, 0, W, H);
  const tone = g.createLinearGradient(0, 0, W, H); tone.addColorStop(0, 'rgba(255,250,235,0.18)'); tone.addColorStop(0.55, 'rgba(0,0,0,0)'); tone.addColorStop(1, 'rgba(70,45,20,0.16)');
  g.fillStyle = tone; g.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x += 54) { g.fillStyle = 'rgba(120,100,70,0.08)'; g.fillRect(x, 0, 1.5, H); }
  for (let y = 0; y < H; y += 3) { g.fillStyle = `rgba(120,100,70,${(0.02 + rnd() * 0.04).toFixed(3)})`; g.fillRect(0, y, W, 1); }
  for (let i = 0; i < 70; i++) { const x = rnd() * W, y = rnd() * H, r = 4 + rnd() * 26, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(150,110,60,${(0.08 + rnd() * 0.14).toFixed(2)})`); gr.addColorStop(1, 'rgba(150,110,60,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); }
  g.strokeStyle = 'rgba(40,24,16,0.5)'; g.lineWidth = 3; g.strokeRect(40, 40, W - 80, H - 80);
  g.strokeStyle = 'rgba(40,24,16,0.35)'; g.lineWidth = 1.5; g.strokeRect(52, 52, W - 104, H - 104);
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
  const ink = '#1A0F0C', dim = 'rgba(26,15,12,0.72)', blood = '#8E0E0E';
  const type = (s, x, y, font, color, align = 'left') => { L.font = font; L.textAlign = align; L.textBaseline = 'alphabetic'; L.fillStyle = color; L.fillText(s, x, y); };
  type('THE VALLEY', P(SL.x), P(SL.eyebrowY), `${P(SL.label)}px "IM Fell English SC", Georgia, serif`, dim);
  const nowFont = `${P(SL.now)}px "IM Fell DW Pica", "IM Fell English", Georgia, serif`;
  type(v.now, P(SL.x), P(SL.numY), nowFont, ink);
  L.font = nowFont; const nowW = L.measureText(v.now).width;
  type(v.ampm, P(SL.x) + nowW + P(16), P(SL.numY), `italic ${P(SL.ampm)}px "IM Fell English", Georgia, serif`, dim);
  // (what is ready: the count of souls, named beside it as the hour's pm is,
  // and what they are worth under it in the blood)
  type('READY', P(SL.rx), P(SL.eyebrowY), `${P(SL.label)}px "IM Fell English SC", Georgia, serif`, blood);
  const readyFont = `${P(SL.ready)}px "IM Fell DW Pica", "IM Fell English", Georgia, serif`;
  type(v.ready, P(SL.rx), P(SL.numY), readyFont, ink);
  L.font = readyFont; const readyW = L.measureText(v.ready).width;
  type(v.ready === '1' ? 'soul' : 'souls', P(SL.rx) + readyW + P(16), P(SL.numY), `italic ${P(SL.ampm + 8)}px "IM Fell English", Georgia, serif`, dim);
  if (v.value > 0) type(`worth $${v.value.toFixed(2)}`, P(SL.rx), P(SL.valueY), `italic ${P(SL.value)}px "IM Fell English", Georgia, serif`, blood);
  const bx = P(SL.x), by = P(SL.runY), bw = W - 2 * P(SL.x), bh = P(SL.runH);
  // (a letterpress rule box: a heavy rule and a fine one, the words in blood)
  L.strokeStyle = ink; L.lineWidth = P(7); L.strokeRect(bx, by, bw, bh);
  L.lineWidth = P(2); L.strokeRect(bx + P(14), by + P(14), bw - P(28), bh - P(28));
  type('Deal your hand', bx + bw / 2, by + bh / 2 + P(SL.run * 0.34), `${P(SL.run)}px "IM Fell English SC", Georgia, serif`, blood, 'center');
  // the printer's fists either side
  type('\u261E', bx + P(60), by + bh / 2 + P(SL.run * 0.3), `${P(SL.run * 0.8)}px Georgia, serif`, ink);
  type('\u261C', bx + bw - P(60), by + bh / 2 + P(SL.run * 0.3), `${P(SL.run * 0.8)}px Georgia, serif`, ink, 'right');
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
    <div class="r3b-ready">&mdash;</div><small class="r3b-souls">souls</small>
    <button type="button" class="r3b-run">Deal your hand</button>
  </div>`;
}

// ------------------------------------------------------------ the sound
// The valley's ambience, made here, under the piece music.mjs plays: the
// wind (filtered noise, gusting), the saw's rasp in time with the stroke,
// a crow now and then, and far off a bell.
function valleySound() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  let ctx, master, up = false, started = false, timer = 0, bellT = 0, crowT = 0;
  const srcs = [];
  function start() {
    if (started) return; started = true;
    try {
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
      const osc = (type, f) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; srcs.push(o); return o; };
      const gain = v => { const g = ctx.createGain(); g.gain.value = v; return g; };
      const filt = (type, f, q) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
      const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), nd = noise.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      const ns = ctx.createBufferSource(); ns.buffer = noise; ns.loop = true; srcs.push(ns);
      const wlp = filt('lowpass', 500, 0.8), wg = gain(SND.wind), gust = osc('sine', 0.07), gg = gain(300); gust.connect(gg); gg.connect(wlp.frequency);
      ns.connect(wlp); wlp.connect(wg); wg.connect(master);
      // the saw: noise through a high band, its level following the stroke
      // (2.6 rad/s, as the sawyer's arm), rasping on the draw
      const ns2 = ctx.createBufferSource(); ns2.buffer = noise; ns2.loop = true; srcs.push(ns2);
      const sbp = filt('bandpass', 2600, 4), sgn = gain(0), slfo = osc('sine', 2.6 / (2 * PI)), slg = gain(SND.saw); slfo.connect(slg); slg.connect(sgn.gain);
      ns2.connect(sbp); sbp.connect(sgn); sgn.connect(master);
      srcs.forEach(o => o.start());
      // a crow: a sawtooth dropping through a throat, twice or three times
      const crow = t => {
        const n = 2 + Math.floor(Math.random() * 2);
        for (let i = 0; i < n; i++) {
          const t0 = t + i * 0.26, o = ctx.createOscillator(), b = filt('bandpass', 1400, 2.5), g = gain(0);
          o.type = 'sawtooth'; o.frequency.setValueAtTime(760, t0); o.frequency.exponentialRampToValueAtTime(480, t0 + 0.16);
          g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(SND.crow, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.2);
          o.connect(b); b.connect(g); g.connect(master); o.start(t0); o.stop(t0 + 0.25);
        }
      };
      const bell = t => {
        [1, 2.0, 2.76, 4.07, 5.4].forEach((r, i) => { const o = ctx.createOscillator(), g = gain(0); o.frequency.value = 164.8 * r; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(SND.bell * [1, 0.5, 0.4, 0.22, 0.12][i], t + 0.004); g.gain.exponentialRampToValueAtTime(0.0005, t + 6 - i * 0.6); o.connect(g); g.connect(master); o.start(t); o.stop(t + 6.5); });
      };
      bellT = 40 + Math.random() * 30; crowT = 6 + Math.random() * 8;
      timer = setInterval(() => {
        if (!up) return;
        bellT -= 0.5; if (bellT <= 0) { bell(ctx.currentTime + 0.1); bellT = 50 + Math.random() * 40; }
        crowT -= 0.5; if (crowT <= 0) { crow(ctx.currentTime + 0.1); crowT = 9 + Math.random() * 16; }
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
// the kit: the few plates everything is cut with (exported for the
// figure study page)
export function valleyKit() {
  const kit = {
    bone: mat({ freq: 1.2, angle: 1.2, tone: -0.06, bare: 0.2 }),
    // (a long bone: strokes down its length; a joint or a skull: its
    // rings; a rib: strokes along the rib)
    shaft: mat({ uv: [14, 1], angle: 0, tone: -0.12, wobble: 0.7, bare: 0.2 }),
    ball: mat({ freq: 1.3, angle: 1.0, tone: -0.12, bare: 0.2 }),
    rib: mat({ uv: [1, 9], angle: HALF, tone: -0.1, wobble: 0.6 }),
    skull: mat({ freq: 1.25, angle: 1.1, tone: -0.14, keyI: 1.3, sky: 0.24, wobble: 0.5, bare: 0.2 }),
    // (flesh: the paper, hatched along the limb; the face in its rings;
    // hair a dark passage; the raw of a wound or a flayed man is blood)
    flesh: mat({ freq: 1.2, angle: -0.55, tone: -0.06, keyI: 1.0, sky: 0.44, wobble: 0.5, bare: 0.16 }),
    fleshUV: mat({ uv: [12, 5], angle: HALF - 0.28, tone: -0.06, keyI: 1.0, sky: 0.44, wobble: 0.4, bare: 0.16 }),
    face: mat({ freq: 1.25, angle: 1.1, tone: -0.08, keyI: 1.15, sky: 0.44, wobble: 0.45 }),
    hair: mat({ uv: [24, 8], angle: 0.3, tone: 0.58, freq: 1.6, wobble: 1.2 }),
    raw: mat({ paper: BLOOD, tone: 0.34, freq: 1.4, angle: -0.4, keyI: 1.2 }),
    rawUV: mat({ paper: BLOOD, uv: [12, 5], angle: 0.1, tone: 0.34, freq: 1.3, keyI: 1.2 }),
    gut: mat({ paper: BLOOD, uv: [40, 5], angle: HALF, tone: 0.46, freq: 1.0 }),
    pool: mat({ paper: BLOOD, tone: 0.42, freq: 1.0, angle: 0.1, side: THREE.DoubleSide }),
    skin: mat({ freq: 1.0, angle: 1.2, tone: -0.02, wobble: 0.8, side: THREE.DoubleSide }),
    river: mat({ paper: BLOOD, uv: [8, 60], angle: 0.1, tone: 0.22, freq: 1.0, wobble: 1.8, scroll: [0, 6], steps: 0 }),
    cloth: mat({ freq: 0.9, angle: 1.3, tone: 0.3, wobble: 0.8, side: THREE.DoubleSide }),
    linen: mat({ uv: [18, 4], angle: HALF - 0.16, tone: -0.04, keyI: 1.05, sky: 0.36, wobble: 0.5, bare: 0.18 }),
    // (a breechcloth: coarser and darker than the skin it covers)
    breech: mat({ uv: [18, 4], angle: 0.35, tone: 0.42, keyI: 0.9, sky: 0.3, wobble: 0.7, bare: 0.06 }),   // (its lines laid across the skin's, so it reads as another stuff)
    // (a plank or a beam, long in x: the grain runs its length; a turned
    // timber - any cylinder, standing or laid - its own length)
    wood: mat({ freq: 0.9, angle: HALF, tone: 0.22, wobble: 0.45, axis: [1, 0, 0] }),
    post: mat({ freq: 0.9, angle: 0, tone: 0.22, wobble: 0.45 }),
    woodRing: mat({ uv: [1, 10], angle: HALF, tone: 0.22, freq: 0.9, wobble: 0.5 }),
    bark: mat({ uv: [12, 4], angle: 0.12, tone: 0.44, freq: 1.4, wobble: 1.1 }),
    iron: mat({ freq: 1.6, angle: 0.3, tone: 0.5 }),
    blade: mat({ freq: 2.4, angle: 0.3, tone: 0.95, keyI: 0.5, sky: 0.08, wobble: 0.2 }),
    glint: mat({ freq: 2.4, angle: 0.3, tone: -1.2, keyI: 1.0, wobble: 0.2 }),
    steel: mat({ freq: 1.8, angle: 0.02, tone: 0.1, wobble: 0.3, axis: [0, 0, 1] }),
    rope: mat({ uv: [6, 1], angle: 0.9, tone: 0.3, freq: 2 }),
    stone: mat({ freq: 1.3, angle: 0.5, tone: 0.1, wobble: 0.8, steps: 3 }),
    hollow: mat({ freq: 1.8, angle: 0.9, tone: 0.56, keyI: 0.3 }),
    // (a flayed man: the muscle in its fibres, fine lines along the limb over the red)
    rawCap: mat({ paper: BLOOD, tone: 0.4, freq: 1.6, angle: 0.4, side: THREE.DoubleSide }),
    // (a flayed man: the fibres cut in blood on the paper - the page's own sanguine - so the figure keeps its silhouette and the lines read as muscle)
    // (the flayed: his fibres cut in the blood's own crimson on a paper only
    // flushed with it, close and heavy, so he reads red at a distance and as
    // muscle near to - the whole of him laid in a flat block of red read as
    // a painted devil)
    muscle: mat({ paper: FLUSH, ink: BLOOD, freq: 2.0, angle: -0.4, tone: 0.24, keyI: 1.0, sky: 0.3, wobble: 0.5, bare: 0.08 }),
    muscleUV: mat({ paper: FLUSH, ink: BLOOD, uv: [12, 5], angle: HALF - 0.28, tone: 0.24, keyI: 1.0, sky: 0.3, freq: 2.0, wobble: 0.5, bare: 0.08 }),
    // (a cast shadow: parallel cuts on the ground, no light to it)
    shadow: mat({ tone: 0.02, keyI: 0, sky: 0, angle: -0.55, freq: 0.7, wobble: 0.5, steps: 0, axis: [1, 0, 0.7] }),
    ink: new THREE.MeshBasicMaterial({ color: INK })
  };
  return kit;
}

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

  const kit = valleyKit();
  shade.mat = kit.shadow;
  const rnd = seeded(23);
  // The souls: the deck's ready platforms (the demonstration hand with
  // nothing ready), best first - the best straight ahead. Each is a vignette
  // with its placard, on its own station of the half ring.
  const hand = ((hooks.deck && hooks.deck()) || []).slice(0, 7);
  const cards = hand.length ? hand : K.demoHand().slice(0, 7);
  cards.forEach(c => { c.initials = K.initials(c.name); c.spent = c.remaining > 0; });
  const STATIONS = cards.map((c, i) => { const th = ringAngle(i), r = RING.r + (RING_DR[i] || 0), [x, z] = ringAt(th, r); return { th, r, x, z }; });
  PADS = STATIONS.map((st, i) => [st.x, st.z, RING_UP[i] || 0]);
  const ground = buildGround(); seat.add(ground);
  { seat.updateMatrixWorld(true); const c = ground.localToWorld(V(RING.c[0], 0, RING.c[1])); ground.material.uniforms.uRing.value.set(c.x, c.z, 420, 1); }
  const height = ground.userData.height;
  await breathe();
  const river = buildRiver(kit, height); seat.add(river);
  const sky = buildSky(); seat.add(sky);
  await breathe();
  // the desk: everything at your hands turns with you - the table, the
  // broadside on its rail, your hands and the hourglass - about your feet
  const desk = new THREE.Group(); desk.position.set(RING.c[0], 0, RING.c[1]); seat.add(desk);
  const deskIn = new THREE.Group(); deskIn.position.set(-RING.c[0], 0, -RING.c[1]); desk.add(deskIn);
  const table = buildTable(kit); deskIn.add(table);
  const hands = buildHands(kit, rnd, table); deskIn.add(hands);
  await breathe();

  const soulsG = new THREE.Group(); seat.add(soulsG);
  const pivots = [], vigs = [], drips = [], crowSpots = [];
  const UP = V(0, 1, 0);
  for (let i = 0; i < cards.length; i++) {
    const [, , px, ph, pz = -34] = SPOTS[i];
    const st = STATIONS[i];
    const v = VIGNETTES[i](kit, rnd);
    v.g.position.set(st.x, height(st.x, st.z), st.z); v.g.rotation.y = st.th;
    const pl = buildPlacard(kit, cards[i], i, ph, 34);
    // (the placard where it was laid against its own vignette - clear of
    // the figures and the station's posts - turned round with it)
    const lp = V(px, 0, pz).applyAxisAngle(UP, st.th);
    pl.position.set(st.x + lp.x, height(st.x + lp.x, st.z + lp.z), st.z + lp.z); pl.rotation.y = st.th + (rnd() - 0.5) * 0.2;
    const pivot = new THREE.Group(); pivot.add(v.g); pivot.add(pl); soulsG.add(pivot);
    pivot.userData = { v, placard: pl, plate: pl.userData.plate, tag: { userData: { id: cards[i].id, plate: pl.userData.plate, card: cards[i], n: i, spentTex: null, liveTex: pl.userData.liveTex } }, look: 0, lookTo: 0, deathYaw: v.death.rotation.y + st.th, toSeat: 0, station: st };
    pivots.push(pivot); vigs.push(v);
    v.drips.forEach(([a, b]) => drips.push({ from: a.clone().applyAxisAngle(UP, st.th).add(v.g.position), to: b.clone().applyAxisAngle(UP, st.th).add(v.g.position), v }));
    v.crows.forEach(([x, y, z]) => crowSpots.push(V(x, y, z).applyAxisAngle(UP, st.th).add(v.g.position)));
    await breathe();
  }
  // the blood bands, in world y (the seat sits at y 0, so its y is the world's)
  seat.updateMatrixWorld(true);
  vigs.forEach(v => v.bands.forEach(([root, hiOff, loOff]) => { setBleedBand(root, v.g.position.y + hiOff, v.g.position.y + loOff); }));
  // ---------------------------------------------------------- the freed
  // A collect frees a soul for a moment: its vignette dissolves into the
  // white-line negative (burin.mjs uFlip - the forms print dark, the light
  // cut out in thin bone lines, no blood), its Death washes back toward the
  // paper (uGhost), the tormented body and its gore are gone, and the man
  // stands whole - dancing with his Death (most), at peace by the empty
  // stake, walking off from beside the wheel toward the hills. Then it all
  // comes back.
  // Each vignette (and its Death apart from it) takes its own copies of the
  // kit's plates, so one soul flips alone; the copies share the shader.
  const GORE = new Set([kit.raw, kit.rawUV, kit.gut, kit.pool, kit.rawCap]);
  const ownMats = (root, skip) => {
    const map = new Map(), mats = [], outs = [];
    const walk = o => {
      if (skip && skip.has(o)) return;
      if (o.isMesh) {
        if (o.userData.outline) outs.push(o.material);
        else if (o.material.userData && o.material.userData.burin) { let c = map.get(o.material); if (!c) { c = o.material.clone(); c.userData.burin = true; map.set(o.material, c); mats.push(c); } o.material = c; }
      }
      o.children.forEach(walk);
    };
    walk(root);
    return { mats, outs };
  };
  pivots.forEach(p => {
    const v = p.userData.v;
    v.gore = []; v.g.traverse(o => { if (o.isMesh && !o.userData.outline && GORE.has(o.material)) v.gore.push(o); });
    const dset = new Set(); v.death.traverse(o => dset.add(o));
    v.deathPlates = ownMats(v.death);
    v.plates = ownMats(v.g, dset);
  });
  const freedRnd = seeded(77);
  // (the freed are clean-shaven: in the negative a beard printed as a black
  // wedge under the chin, a gaping jaw)
  const freedFigs = [0, 1].map(k => { const f = buildMan(kit, freedRnd, { calm: true, shirt: true, hose: true }); restBody(f); f.visible = false; f.userData.plates = ownMats(f); return f; });
  const setPlates = (pl, flip, ghost) => { pl.mats.forEach(m => { m.uniforms.uFlip.value = flip; m.uniforms.uGhost.value = ghost; }); pl.outs.forEach(m => { m.uniforms.uFlip.value = flip; m.uniforms.uGhost.value = ghost; }); };
  const FREE = { IN: 0.8, HOLD: 3.8, OUT: 1.1 };
  const snapOf = root => { const out = []; root.traverse(o => out.push([o, o.position.clone(), o.quaternion.clone()])); return out; };
  const swapFreed = (F, on) => {
    const v = F.p.userData.v;
    v.victims.forEach(b => { b.visible = !on; });
    v.gore.forEach(m => { m.visible = !on; });
    // (the station's cast shadows lie where its figures stood: while it is
    // freed they go, and each freed figure and its Death carries its own
    // under its feet - left, they lay ahead of the freed man as black holes)
    if (!v.shades) { v.shades = []; v.g.traverse(o => { if (o.userData.shade) v.shades.push(o); }); v.deathShade = shade(v.death, 0, 0, 13, 8, 0); }
    v.shades.forEach(o => { o.visible = !on; }); v.deathShade.visible = on;
    F.figs.forEach(f => { if (!f.userData.shadow) f.userData.shadow = shade(f, 0, 0, 13, 8, 0); });
    if (on) {
      F.snap = snapOf(v.death);
      // (a Death built inside a turned group - the dragging's slant - is
      // posed in the vignette's own frame while freed, then put back)
      F.home = v.death.parent; if (F.home !== v.g) v.g.attach(v.death);
      F.figs.forEach(f => { v.g.add(f); f.visible = true; });
    } else {
      F.figs.forEach(f => { f.visible = false; });
      if (F.home && F.home !== v.g) F.home.attach(v.death);
      F.snap.forEach(([o, pp, q]) => { o.position.copy(pp); o.quaternion.copy(q); });
    }
  };
  const faceTo = (obj, x, z) => { obj.rotation.set(0, Math.atan2(-(x - obj.position.x), -(z - obj.position.z)), 0); };
  const stepLegs = (u, ph, amp, hipsY) => {
    const sn = Math.sin(ph);
    u.hips.position.y = hipsY + Math.abs(sn) * 2.4 * amp;
    u.legs.l.hip.rotation.set(sn * 0.5 * amp, 0, 0.04); u.legs.r.hip.rotation.set(-sn * 0.5 * amp, 0, -0.04);
    u.legs.l.kn.rotation.x = KNEE_BACK * Math.max(0, -sn) * 0.9 * amp; u.legs.r.kn.rotation.x = KNEE_BACK * Math.max(0, sn) * 0.9 * amp;
    u.legs.l.foot.rotation.x = 0; u.legs.r.foot.rotation.x = 0;
  };
  // the dance as the Totentanz cuts it: a line toward you, hand in hand,
  // each turned a little in to the next, the inner hands joined at the
  // shoulder before the line and the outer ones flung up. The arms are
  // solved once a line (the hands meet where the line says), then ride the
  // bodies, the whole line swaying and skipping as one so the joined hands
  // never part.
  // (where each stands along the line, and how far each turns in toward
  // the next: a turn of +y faces them to -x)
  const LINE = { 2: [-42, 42], 3: [-66, 0, 66] }, TURN = { 2: [-0.3, 0.42], 3: [-0.25, 0, 0.25] };
  const lineOf = (F, v) => F.figs.length === 2 ? [F.figs[0], v.death, F.figs[1]] : [F.figs[0], v.death];
  const camIn = v => v.camL || (v.camL = v.g.worldToLocal(seat.localToWorld(V(0, 0, -116))));
  const solveLine = (line, xs, turn) => {
    const _s = V(0, 0, 0), _c = V(0, 0, 0);
    return line.map((o, i) => {
      const par = o.parent, u = o.userData, keep = [o.position.clone(), o.rotation.clone()];
      o.position.set(xs[i], 0, 0); o.rotation.set(0, turn[i], 0); restSkeleton(o); u.hips.position.y = 92; o.updateMatrixWorld(true);
      par.worldToLocal(o.getWorldPosition(_c));
      const out = {};
      ['l', 'r'].forEach(s => {
        const arm = u.arms[s]; par.worldToLocal(arm.sh.getWorldPosition(_s));
        const side = Math.sign(_s.x - _c.x) || 1, nb = xs[i + side];
        // (toward a neighbour the hands meet halfway, at the shoulder and a
        // forearm before the line; with none on that side it goes up and out)
        const tgt = nb !== undefined ? [(xs[i] + nb) / 2, _s.y - 2, -16] : [_s.x + side * 24, _s.y + 46, -10];
        out[s] = reach(arm, tgt, o, 8, { start: nb !== undefined ? [0.5, 0, side * 1.25, 0.6] : [0.2, 0, side * 2.3, 0.3] });
      });
      o.position.copy(keep[0]); o.rotation.copy(keep[1]);
      return out;
    });
  };
  const poseFreed = (F, k) => {
    const v = F.p.userData.v, at = v.freed.at, du = v.death.userData;
    if (v.freed.pose === 'dance') {
      const line = lineOf(F, v), xs = LINE[line.length], turn = TURN[line.length];
      // (solved once for each vignette's Death, the first time it is freed)
      const key = 'arms' + line.length;
      if (!v[key]) v[key] = solveLine(line, xs, turn);
      const cam = camIn(v);
      const face = Math.atan2(-(cam.x - at[0]), -(cam.z - at[2]));
      // the line sways round as it goes, and drifts a step side to side
      const yaw = face + Math.sin(k * 1.3) * 0.32, cy = Math.cos(yaw), sy = Math.sin(yaw);
      const drift = Math.sin(k * 0.9) * 7;
      line.forEach((o, i) => {
        const x = xs[i] + drift, u = o.userData;
        o.position.set(at[0] + x * cy, 0, at[2] - x * sy); o.rotation.set(0, yaw + turn[i], 0);
        restSkeleton(o);
        // (a skip, all in step: the hips rise together, so the hands hold)
        stepLegs(u, k * 6.4, 0.9, 92);
        setArm(u.arms.l, v[key][i].l); setArm(u.arms.r, v[key][i].r);
        // the freed look up and at their Death (a turn of +y looks to -x);
        // Death looks from one to the other
        const dx = xs[1] - xs[i];
        u.neck.rotation.set(o === v.death ? 0.08 : 0.26, o === v.death ? Math.sin(k * 1.7) * 0.5 : -Math.sign(dx) * 0.25, 0);
      });
    } else if (v.freed.pose === 'peace') {
      // he stands whole by the empty stake (or where he was dragged), his
      // weight on one leg, the hands open at his sides, the face lifted; his
      // Death stands by him, turned to him, the skull bowed, a hand laid on
      // his shoulder (a line of dancers would not fit the dragging's window)
      const f = F.figs[0], u = f.userData, cam = camIn(v);
      f.position.set(at[0], 0, at[2]); f.rotation.set(0, Math.atan2(-(cam.x - at[0]), -(cam.z - at[2])), 0);
      // (at ease, his weight on one leg: the free hip dropped and that knee
      // eased forward, the arms hanging slack close to his sides, the head a
      // little bowed - square on both feet, arms out and palms open, he
      // stood as a shop's dummy)
      const tilt = -0.16 + Math.sin(k * 1.6) * 0.012;
      u.hips.position.y = BODY_HIPS - 2.4 + Math.sin(k * 1.6) * 0.5; u.hips.rotation.z = tilt;
      u.arms.l.sh.rotation.set(0.06, 0, 0.1 - tilt); u.arms.r.sh.rotation.set(0.1, 0, -0.12 - tilt);
      u.arms.l.el.rotation.x = 0.28; u.arms.r.el.rotation.x = 0.35;
      u.arms.l.hand.userData.grip(0.25); u.arms.r.hand.userData.grip(0.2);
      u.legs.l.hip.rotation.set(0.3, 0, 0.06 - tilt); u.legs.l.kn.rotation.x = KNEE_BACK * 0.55; u.legs.l.foot.rotation.x = -0.35; u.legs.r.hip.rotation.set(-0.04, 0, -0.03 - tilt);
      u.neck.rotation.set(-0.32, 0.1, 0.16);
      // (beside him across the line of sight - to your left of him, or to
      // your right where `beside` is negative (the dragging's placard stands
      // on his left), clear of his arm and a little nearer you - so he never
      // stands half hidden behind the man he frees)
      const [kx, kz] = v.freed.beside || [60, -6];
      const fx = cam.x - at[0], fz = cam.z - at[2], fl = Math.hypot(fx, fz) || 1;
      v.death.position.set(at[0] - fz / fl * kx - fx / fl * kz, 0, at[2] + fx / fl * kx - fz / fl * kz); faceTo(v.death, at[0], at[2]);
      restSkeleton(v.death);
      du.neck.rotation.set(-0.45, 0, 0); du.spine.rotation.x = -0.1;
      // (the hand laid on the top of his near shoulder, the arm out across
      // the gap in sight: solved once, with whichever of Death's arms gets
      // there)
      if (!v.peaceArm) {
        v.g.updateMatrixWorld(true);
        const shs = ['l', 'r'].map(sd => v.g.worldToLocal(u.arms[sd].sh.getWorldPosition(V(0, 0, 0))));
        const t = shs.sort((p1, p2) => p1.distanceTo(v.death.position) - p2.distanceTo(v.death.position))[0];
        const best = ['l', 'r'].map(sd => {
          const an = reach(du.arms[sd], [t.x, t.y + 3, t.z - 1], v.death, 10, { start: [0.9, 0, sd === 'l' ? 0.2 : -0.2, 0.5] });
          return { sd, an, miss: du.arms[sd].miss };
        }).sort((a2, b2) => a2.miss - b2.miss)[0];
        v.peaceArm = best; restSkeleton(v.death); du.neck.rotation.set(-0.45, 0, 0); du.spine.rotation.x = -0.1;
      }
      setArm(du.arms[v.peaceArm.sd], v.peaceArm.an); du.arms[v.peaceArm.sd].hand.userData.grip(0.3);
    } else {
      // he walks off from beside the wheel toward the hills, his back to
      // you, clear of its rim; his Death stands where he was and watches
      const f = F.figs[0], u = f.userData, go = Math.max(0, k - FREE.IN * 0.5);
      f.position.set(at[0] + go * 9, 0, at[2] + go * 14); f.rotation.set(0, Math.atan2(-9, -14), 0);
      stepLegs(u, go * 6.5, 0.9, BODY_HIPS);
      u.arms.l.sh.rotation.set(Math.sin(go * 6.5) * 0.45, 0, 0.08); u.arms.r.sh.rotation.set(-Math.sin(go * 6.5) * 0.45, 0, -0.08);
      u.arms.l.el.rotation.x = 0.2; u.arms.r.el.rotation.x = 0.2;
      restSkeleton(v.death);
      faceTo(v.death, f.position.x, f.position.z);
    }
  };
  // how far each Death turns his skull to look at you
  pivots.forEach(p => { const d = p.userData.v.death; const wp = d.getWorldPosition(V(0, 0, 0)); seat.worldToLocal(wp); const want = Math.atan2(wp.x, wp.z + 116); p.userData.toSeat = ((want - p.userData.deathYaw + PI) % (2 * PI) + 2 * PI) % (2 * PI) - PI; });
  // far off on the hills: more gallows, in silhouette - out past the half
  // ring's ends, where only a wide frame turned to an end finds them (each
  // station's frame spans the whole step to its neighbours, so one set
  // anywhere round the ring sat on a station's beam or was cut by the top of
  // its frame)
  const far = new THREE.Group(); seat.add(far);
  [[-2.7, 820], [-2.35, 900], [2.35, 900], [2.7, 820], [3.1, 980]].forEach(([th, r]) => { const [x, z] = ringAt(th, r), h = height(x, z), g = new THREE.Group(); g.position.set(x, h - 2, z); g.rotation.y = rnd() * 6; far.add(g); mesh(new THREE.BoxGeometry(6, 150, 6), kit.post, g, 1.6).position.y = 75; mesh(new THREE.BoxGeometry(70, 6, 6), kit.wood, g, 1.4).position.set(20, 148, 0); const sk = buildDeath(kit, rnd); restSkeleton(sk); sk.position.set(40, 142 - 165, 0); sk.scale.setScalar(0.9); sk.userData.neck.rotation.z = 0.5; g.add(sk); });
  // the ground dressed, as a woodcutter fills it: stones, bones, a skull or
  // two - on the ring's floor between the stations, clear of their pads
  const dress = new THREE.Group(); seat.add(dress);
  const stoneGeo = new THREE.IcosahedronGeometry(1, 1);
  const clearOf = (x, z, m) => PADS.every(([px, pz]) => Math.hypot(x - px, z - pz) > m);
  const floorAt = (rLo, rHi) => { const th = (rnd() - 0.5) * 5.0, r = rLo + rnd() * (rHi - rLo); return ringAt(th, r); };
  for (let i = 0; i < 44; i++) {
    const [x, z] = floorAt(SHELF + 20, 470); if (!clearOf(x, z, 70)) continue;
    const st = mesh(stoneGeo, kit.stone, dress, 1.2); const sc = 3 + rnd() * 7; st.scale.set(sc * (0.8 + rnd() * 0.6), sc * 0.55, sc * (0.8 + rnd() * 0.6)); st.rotation.set(rnd(), rnd() * 6, rnd()); st.position.set(x, height(x, z) + sc * 0.2, z);
  }
  for (let i = 0; i < 21; i++) { const [x, z] = floorAt(SHELF + 30, 440); if (!clearOf(x, z, 64)) continue; const b = mesh(boneGeo(18 + rnd() * 20, 1.6), kit.shaft, dress, 1.2); b.rotation.set(HALF + (rnd() - 0.5) * 0.2, 0, rnd() * 6); b.position.set(x, height(x, z) + 1.5, z); }
  for (let i = 0; i < 8; i++) { const [x, z] = floorAt(SHELF + 40, 440); if (!clearOf(x, z, 64)) continue; const sk = buildSkull(kit); sk.rotation.set(rnd() * 0.8 - 0.2, rnd() * 6, rnd() * 0.6 - 0.3); sk.position.set(x, height(x, z) + 7, z); dress.add(sk); }
  // the scarps: boulders along the rise behind the stations and the shelf's lip
  [[452, 9, 11], [SHELF + 6, 5, 6]].forEach(([r0, s0, s1]) => { for (let th = -2.8; th <= 2.8; th += (40 + rnd() * 50) / r0) { if (rnd() < 0.35) continue; const [x, z] = ringAt(th, r0 + (rnd() - 0.5) * 20); if (!clearOf(x, z, 58)) continue; const st = mesh(stoneGeo, kit.stone, dress, 1.4); const sc = s0 + rnd() * s1; st.scale.set(sc * (1 + rnd() * 0.8), sc * (0.6 + rnd() * 0.5), sc * 0.8); st.rotation.set(rnd() * 0.6, rnd() * 6, rnd() * 0.6); st.position.set(x, height(x, z) + sc * 0.1, z); } });
  // dead trees between the stations, on the rise, as a woodcutter fills to the border
  STATIONS.forEach((st, i) => { if (i === 0 || rnd() < 0.3) return; const th = st.th + Math.sign(st.th) * RING.step * 0.5, [x, z] = ringAt(th, 470 + rnd() * 40), t = buildTree(kit, rnd); t.scale.setScalar(0.75 + rnd() * 0.35); t.position.set(x, height(x, z) - 2, z); t.rotation.y = rnd() * 6; dress.add(t); });
  // the drops and the crows
  const drops = dropMesh(drips.length * 3); seat.add(drops);
  const dropP = Array.from({ length: drips.length * 3 }, (_, i) => ({ e: Math.floor(i / 3), t: Math.random() }));
  const NC = crowSpots.length + 6;
  const crows = new THREE.InstancedMesh(crowGeo(), new THREE.MeshBasicMaterial({ color: INK, side: THREE.DoubleSide }), NC); crows.frustumCulled = false; seat.add(crows);
  const gallows = pivots[4] ? pivots[4].userData.v.g.position : V(0, 150, 460);
  const crowP = Array.from({ length: NC }, (_, i) => i < crowSpots.length ? { perch: crowSpots[i], ph: Math.random() * 6, hop: Math.random() * 8 + 3 } : { r: 60 + Math.random() * 90, h: 230 + Math.random() * 60, ph: Math.random() * 6, sp: 0.25 + Math.random() * 0.25, dir: Math.random() < 0.5 ? 1 : -1 });
  const sheetBody = buildSheetBody(); sheetBody.position.set(...SHEET.at); sheetBody.rotation.set(SHEET.lean, PI, SHEET.tilt); deskIn.add(sheetBody);
  // (the board it is nailed to: a plank board standing on the rail, a hand's
  // breadth wider than the sheet all round, just behind it)
  const board = mesh(new THREE.BoxGeometry(SHEET.w + 16, SHEET.h + 7, 2.2), mat({ freq: 0.75, angle: HALF, tone: -0.06, wobble: 0.4, axis: [1, 0, 0] }), deskIn, 1.8); board.position.set(SHEET.at[0], SHEET.at[1] + 0.5, SHEET.at[2] + 1.3);
  [-1, 1].forEach(s2 => { const cleat = mesh(new THREE.BoxGeometry(2.4, SHEET.h + 7, 1.2), kit.post, deskIn, 1.2); cleat.position.set(SHEET.at[0] + s2 * (SHEET.w / 2 + 6.6), SHEET.at[1] + 0.5, SHEET.at[2] + 0.2); });

  const pivotOf = id => pivots.find(p => p.userData.tag.userData.id === id);
  const setSpent = (id, spent) => {
    const p = pivotOf(id); if (!p) return;
    const t = p.userData.tag.userData;
    if (spent && !t.spentTex) t.spentTex = placardArt(t.card, t.n, true);
    t.plate.material.map = spent ? t.spentTex : t.liveTex; t.plate.material.needsUpdate = true;
  };
  cards.forEach(c => { if (c.spent) setSpent(c.id, true); });
  // ---------------------------------------------------------- the negative
  // While a soul stands freed the whole valley prints in the negative - the
  // block left standing as the ground, the light cut out of it in bone -
  // and only your desk (the hands, the table, the broadside) stays a print.
  // The desk takes its own copies of the plates, so the valley's flip alone.
  ownMats(desk);
  const inDesk = new Set(); desk.traverse(o => inDesk.add(o));
  const inVig = new Set(); pivots.forEach(p => p.userData.v.g.traverse(o => inVig.add(o)));
  const worldPlates = { mats: [], outs: [] }, seenPl = new Set();
  seat.traverse(o => {
    if (!o.isMesh || inDesk.has(o) || inVig.has(o) || seenPl.has(o.material)) return;
    const m = o.material; if (!m.uniforms || !m.uniforms.uFlip) return;
    seenPl.add(m); (o.userData.outline ? worldPlates.outs : worldPlates.mats).push(m);
  });
  // (the sky its own negative: a second dome inside it, faded in)
  const skyNeg = new THREE.Mesh(sky.geometry, new THREE.MeshBasicMaterial({ map: negativeTex(sky.userData.tex), side: THREE.BackSide, toneMapped: false, fog: false, transparent: true, opacity: 0, depthWrite: false }));
  skyNeg.position.copy(sky.position); skyNeg.scale.setScalar(0.995); skyNeg.visible = false; sky.parent.add(skyNeg);
  const inkC = new THREE.Color(INK), boneC = new THREE.Color(BONE);
  const setNegative = f => {
    setPlates(worldPlates, f, 0);
    pivots.forEach(p => { setPlates(p.userData.v.plates, f, 0); setPlates(p.userData.v.deathPlates, f, 0); });
    skyNeg.visible = f > 0.002; skyNeg.material.opacity = f;
    crows.material.color.copy(inkC).lerp(boneC, f);
    drops.visible = f < 0.5;
  };
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
    // (the broadside's page turns with the desk it is nailed to)
    const cssDesk = new THREE.Group(); cssDesk.position.set(RING.c[0], 0, RING.c[1]); cssSeat.add(cssDesk);
    const cssDeskIn = new THREE.Group(); cssDeskIn.position.set(-RING.c[0], 0, -RING.c[1]); cssDesk.add(cssDeskIn);
    let aspect = 1;
    const size = () => { world.size(); const box = world.canvas.parentElement || world.host; const w = box.clientWidth || window.innerWidth, h = box.clientHeight || window.innerHeight; css.setSize(w, h); return w / h; };
    aspect = size();
    stageEl.appendChild(css.domElement);
    const toWorld = v => seat.localToWorld(v.clone());
    seat.updateMatrixWorld(true);
    // (the seat's view: the eye fixed, the aim on a ring round your feet at
    // the view's own distance and height, turned to the station you face)
    const seatView = () => {
      if (fo.seatView) { const [ey, ez, az, fv] = fo.seatView; return { eye: V(0, ey, ez), aimY: 46, aimR: az - RING.c[1], fov: fv }; }
      const v = VIEW[aspect < 0.62 ? 0 : 1];
      return { eye: V(...v.eye), aimY: v.aim[1], aimR: v.aim[2] - RING.c[1], fov: v.fov };
    };
    let yaw = 0, yawV = 0, yawTo = 0;
    const aimW = th => { const [x, z] = ringAt(th, sv.aimR); return toWorld(V(x, sv.aimY, z)); };
    let sv = seatView();
    let E1 = toWorld(sv.eye), A1 = aimW(0);
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
    sheetObj.rotation.set(SHEET.lean, PI, SHEET.tilt);
    sheetObj.scale.setScalar(1 / SHEET.px);
    cssDeskIn.add(sheetObj);
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

    // ---- A soul's card: off its placard and up to you.
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
      pw.addScaledVector(V(0, 1, 0).applyQuaternion(camera.quaternion), Math.sin(PI * k) * 3);
      flipQ.setFromAxisAngle(V(0, 1, 0), PI * (1 - smoother(clamp01((k - 0.15) / 0.7))));
      qw.copy(_q1).multiply(flipQ);
      const tagPx = 30 / K.CARD.h;
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
      // (the great pip is an image with the card table's colours in it:
      // reprinted here in the page's three inks)
      const pip = cardEl.querySelector('.r3t-pip');
      if (pip) pip.src = 'data:image/svg+xml,' + encodeURIComponent(decodeURIComponent(pip.src.slice(19)).replace(/#(?:e3c27a|17120e)/gi, '#1A0F0C').replace(/#(?:e0353d|a8121d)/gi, '#8E0E0E').replace(/#(?:0e0b09|f3ead5)/gi, '#E3D6B8'));
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

    // ---- Turning: you face one station at a time. A swipe turns you to the
    // next; left alone (motion on, nothing lifted) you look slowly from one
    // to the next and back; a collect turns you to the soul it frees, and the
    // flash waits until you face it. The turn has weight: a spring a little
    // under critical, so it carries a hair past and settles.
    const order = pivots.map((p, i) => i).sort((a2, b2) => STATIONS[b2].th - STATIONS[a2].th);   // (left to right as you face them)
    let at = order.indexOf(0), lastTouch = 0, lastTurn = 0, tourDir = 1, pendingFree = null;
    const freeWant = [];
    const TURN = { w: 4.4, z: 0.72, idle: 14, hold: 9 };
    const turnTo = k => {
      k = Math.max(0, Math.min(order.length - 1, k));
      at = k; yawTo = STATIONS[order[at]].th; lastTurn = tNow;
      if (fo.reduced) { yaw = yawTo; yawV = 0; }
      wake();
    };
    const turn = dir => { if (pendingFree) return; turnTo(at + dir); };
    const stepTurn = dt => {
      if (fo.reduced) { yaw = yawTo; yawV = 0; }
      else {
        // (two half steps: the spring stays steady at a slow frame)
        for (let i = 0; i < 2; i++) { const h = dt / 2; yawV += (TURN.w * TURN.w * (yawTo - yaw) - 2 * TURN.z * TURN.w * yawV) * h; yaw += yawV * h; }
      }
      desk.rotation.y = yaw; cssDesk.rotation.y = yaw;
      const settled = Math.abs(yaw - yawTo) < 0.012 && Math.abs(yawV) < 0.04;
      // the soul a collect frees, once you face it
      if (!freeing && !pendingFree && freeWant.length) { pendingFree = freeWant.shift(); turnTo(order.indexOf(pivots.indexOf(pendingFree))); }
      if (pendingFree && settled) { startFreed(pendingFree); pendingFree = null; lastTouch = tNow; }
      // the tour, when you leave it alone
      if (!fo.reduced && arrived && !press && !cardId && !freeing && !pendingFree && order.length > 1 && tNow - lastTouch > TURN.idle && tNow - lastTurn > TURN.hold) {
        if (at + tourDir < 0 || at + tourDir >= order.length) tourDir = -tourDir;
        turnTo(at + tourDir);
      }
    };

    // ---- The house: out of the valley's way once you are seated. (Facing
    // straight ahead its room never showed; turned to the side stations,
    // its walls stood inside the sky.) Shown again when you leave.
    const houseHidden = [];
    const hideHouse = on => {
      if (on) world.scene.children.forEach(o2 => { if (o2 !== seat && o2.visible && !o2.isLight && !o2.isCamera) { o2.visible = false; houseHidden.push(o2); } });
      else { houseHidden.forEach(o2 => { o2.visible = true; }); houseHidden.length = 0; }
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
      } else { camera.position.copy(E1); camera.lookAt(aimW(yaw)); camera.fov = sv.fov; }
      camera.near = near0; camera.far = Math.max(far0, SKY * 3);
      camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    };
    const em4 = new THREE.Matrix4(), eq = new THREE.Quaternion(), es = V(1, 1, 1), ep = V(0, 0, 0), zero = new THREE.Matrix4().makeScale(0, 0, 0);
    const placeDrops = (tt, dt) => {
      dropP.forEach((d, i) => {
        if (fo.reduced) { drops.setMatrixAt(i, zero); return; }
        const e = drips[d.e]; d.t += dt * 0.9; if (d.t >= 1) d.t = -Math.random() * 1.5;
        // (a freed soul does not bleed)
        if (d.t < 0 || freeing && freeing.swapped && freeing.p.userData.v === e.v) { drops.setMatrixAt(i, zero); return; }
        const k = d.t * d.t;   // falling
        ep.lerpVectors(e.from, e.to, k); es.set(1, 1 + k * 1.2, 1);
        drops.setMatrixAt(i, em4.compose(ep, eq, es));
      });
      drops.instanceMatrix.needsUpdate = true;
    };
    const cq = new THREE.Quaternion(), cup = V(0, 1, 0), mR = new THREE.Matrix4();
    const placeCrows = (tt, w) => {
      crowP.forEach((c, i) => {
        if (c.perch) {
          // perched: a hop now and then, a flap; thrown up by a gust
          const h = fo.reduced ? 0 : Math.max(0, Math.sin((tt + c.ph) * 0.6)) * (Math.sin(tt * 11 + c.ph) > 0.8 ? 2 : 0);
          const lift = clamp01(Math.abs(w) * 1.6);
          ep.copy(c.perch); ep.y += h + lift * 60 * (0.5 + 0.5 * Math.sin(tt * 2 + c.ph)); ep.x += lift * 40 * Math.sin(tt * 1.3 + c.ph) * -Math.sign(w || 1);
          cq.setFromAxisAngle(cup, c.ph);
          const flap = fo.reduced ? 0.3 : (lift > 0.05 || h > 0 ? Math.sin(tt * 18 + c.ph) : 0.35);
          es.set(1, 1, 1); crows.setMatrixAt(i, em4.compose(ep, cq, es).multiply(mR.makeRotationX(flap * 0.6)));
        } else {
          const a = fo.reduced ? c.ph : (tt * c.sp * c.dir + c.ph);
          ep.set(gallows.x + Math.cos(a) * c.r + w * 30, gallows.y + c.h + Math.sin(a * 2) * 10, gallows.z + Math.sin(a) * c.r * 0.6);
          cq.setFromAxisAngle(cup, -a * c.dir + (c.dir > 0 ? 0 : PI));
          const flap = fo.reduced ? 0.2 : Math.sin(tt * 14 + c.ph);
          es.set(1, 1, 1); crows.setMatrixAt(i, em4.compose(ep, cq, es).multiply(mR.makeRotationZ(flap * 0.7)));
        }
      });
      crows.instanceMatrix.needsUpdate = true;
    };
    let lastT = 0;
    // (the key turns with you: the light falls from the plate's upper left
    // in every frame, whichever torment you face, as it does in a book of
    // plates - so every station is lit alike)
    const keyW = new THREE.Vector3(), KEY_UP = new THREE.Vector3(0, 1, 0);
    const keyAt = () => keyW.copy(KEY_SEAT).applyAxisAngle(KEY_UP, yaw).applyQuaternion(seat.quaternion);
    // (the freed: the flash's state lives with the flight - it reads the clock)
    let freeing = null, freeQueue = [], freeN = 0;
    const startFreed = p => {
      if (!p || fo.reduced) return;
      if (freeing) { if (freeQueue.length < 2) freeQueue.push(p); return; }
      const v = p.userData.v;
      freeing = { p, t0: tNow, swapped: false, figs: v.freed.two ? freedFigs : [freedFigs[0]] };
    };
    const stepFreed = tt => {
      const F = freeing, v = F.p.userData.v, k = tt - F.t0;
      const f = k < FREE.IN ? smoother(k / FREE.IN) : k < FREE.IN + FREE.HOLD ? 1 : 1 - smoother((k - FREE.IN - FREE.HOLD) / FREE.OUT);
      setNegative(f);
      F.figs.forEach(fg => setPlates(fg.userData.plates, f, 0));
      const on = f >= 0.5;
      if (on !== F.swapped) { swapFreed(F, on); F.swapped = on; }
      if (on) poseFreed(F, k);
      if (k >= FREE.IN + FREE.HOLD + FREE.OUT) {
        setNegative(0);
        if (F.swapped) swapFreed(F, false);
        freeing = null;
        if (freeQueue.length) startFreed(freeQueue.shift());
      }
    };
    const update = tt => {
      const dt = Math.min(0.1, Math.max(0, tt - lastT)); lastT = tt;
      tNow = tt;
      // (the turn first: the camera and the desk it carries move as one)
      if (tt >= FLY) stepTurn(dt);
      placeCamera(tt);
      world.stage(introT0 + tt);
      const sat = fo.reduced ? 1 : smoother((tt - FLY * 0.45) / (FLY * 0.55));
      world.scene.environmentIntensity = env0 * lerp(1, 0.25, sat);
      world.lights.pendant.intensity = pendant0;
      const kf = fo.reduced ? 1 : clamp01(tt / 0.9);
      world.lights.lensLight.intensity = lens0 * (1 - kf);
      world.lights.rim.intensity *= 1 - 0.6 * kf;
      if (world.bloom) world.bloom.strength = fo.reduced ? 0 : lerp(bloom0, 0.0, kf);
      // the fog of the house's room would grey the page: off once out of the house
      world.scene.fog = sat > 0.5 ? null : fog0;
      // the dance: each vignette its own act; the Death you took turns to you
      const w = windAt(tt) * windDir;
      pivots.forEach(p => {
        const d = p.userData;
        d.look = fo.reduced ? d.lookTo : lerp(d.look, d.lookTo, 1 - Math.exp(-dt * 5));
        d.v.act(tt, dt, w, fo.reduced);
        const nk = d.v.death.userData.neck;
        nk.rotation.y = lerp(nk.rotation.y, d.toSeat, d.look);
        // the placard knocks in the wind
        d.placard.rotation.x = w * 0.06;
      });
      if (freeing) stepFreed(tt);
      // (the men's soft tissue, from how each has just moved)
      softFigs.forEach(f => f.userData.soft.update(dt));
      // the sky drifts
      if (!fo.reduced) { sky.userData.tex.offset.x = tt * 0.0025 + w * 0.002; skyNeg.material.map.offset.x = sky.userData.tex.offset.x; }
      placeDrops(tt, fo.reduced ? 0 : dt);
      placeCrows(tt, w);
      burinTick(seat, camera, world.renderer, tt, keyAt());
      poseCard(tt);
      sheetEl.style.visibility = tt < FLY ? 'hidden' : '';
      const stg = world.canvas.parentElement;
      if (stg && stg.classList.contains('r3t-focus') !== !!(cardId && liftTo)) stg.classList.toggle('r3t-focus', !!(cardId && liftTo));
      const uiK = clamp01((tt - FLY + 0.1) / UI_IN);
      css.domElement.style.setProperty('--r3t-in', uiK.toFixed(3));
      css.domElement.classList.toggle('r3t-hide', uiK <= 0);
      if (!arrived && tt >= FLY) { arrived = true; hideHouse(true); lastTouch = tt; if (fo.onArrive) fo.onArrive(css.domElement); if (sound) sound.set(!fo.reduced && (!hooks.musicOn || hooks.musicOn())); }
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

    // ---- Touch: a placard or its vignette (its card), the table (the wind).
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    const hitAt = e => {
      const r = css.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObject(soulsG, true)[0];
      if (hit) { let ob = hit.object; while (ob && ob.parent !== soulsG) ob = ob.parent; if (ob && ob.userData.tag) return { id: ob.userData.tag.userData.id }; }
      let best = null, bestD = Infinity;
      pivots.forEach(p => { p.userData.plate.getWorldPosition(pw); const d = ray.ray.distanceToPoint(pw), tol = 22; if (d < tol && d < bestD) { bestD = d; best = { id: p.userData.tag.userData.id }; } });
      return best;
    };
    let press = null;
    const onStage = e => { const st = world.canvas.parentElement; return !!(st && e.target && st.contains(e.target)); };
    const onDown = e => { if (tNow < FLY || e.button > 0 || !onStage(e)) return; lastTouch = tNow; if (e.target.closest && e.target.closest('.r3b-sheet, .r3t-info, .r3t-phone, .r3t-card')) return; press = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 }; };
    const onMove = e => { if (!press || e.pointerId !== press.id) return; const dx = e.clientX - press.x, dy = e.clientY - press.y; press.moved += Math.abs(dx) + Math.abs(dy); push += dx; if (press.moved > 8 && !dragging) { dragging = true; putBack(); wake(); } };
    const onUp = e => {
      if (!press || e.pointerId !== press.id) return;
      const wasDrag = dragging, dx = e.clientX - press.x, dy = e.clientY - press.y; dragging = false; press = null;
      // (a swipe across turns you to the next torment, the way it went; any
      // drag still gets the wind up)
      if (wasDrag) { if (Math.abs(dx) > 36 && Math.abs(dx) > 1.2 * Math.abs(dy)) turn(dx < 0 ? 1 : -1); gust(Math.min(1.6, 0.4 + Math.abs(push) / 120), Math.sign(push) || 1); push = 0; lastTouch = tNow; return; }
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
    const onResize = () => { aspect = size(); sv = seatView(); E1 = toWorld(sv.eye); A1 = aimW(0); update(tNow); show(); };
    window.addEventListener('resize', onResize);
    const onVis = () => { if (sound) sound.set(!document.hidden && arrived && !fo.reduced && (!hooks.musicOn || hooks.musicOn())); };
    document.addEventListener('visibilitychange', onVis);

    tick();
    const clock = setInterval(tick, 1000);
    update(0);
    if (fo.manual) world.rest(draw); else { draw(); running = true; raf = requestAnimationFrame(loop); }

    // dev overlay: biometric-gated slider UI for live anatomy tuning
    devOverlayP.then(init => {
      if (!init) return;
      const allFigs = [];
      vigs.forEach(v => { if (v.victims) v.victims.forEach(f => { if (f.userData && f.userData.pouch) allFigs.push(f); }); });
      freedFigs.forEach(f => { if (f.userData && f.userData.pouch) allFigs.push(f); });
      if (allFigs.length) init(allFigs);
    });

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
      // a collect: that soul freed for a moment (a platform not on the
      // board frees the next soul in turn, so every collect shows one)
      collected(id) { if (!fo.reduced && freeWant.length < 3) { freeWant.push(pivotOf(id) || pivots[freeN++ % pivots.length]); wake(); } },
      freeSoul(n) { if (!fo.reduced && pivots[n]) { freeWant.push(pivots[n]); wake(); } },
      // (the lab: turn to a station by its place left to right, or by a step)
      turnTo(k) { turnTo(k); },
      turn(dir) { turn(dir); },
      get station() { return { at, n: order[at], yaw: +yaw.toFixed(3), to: +yawTo.toFixed(3), count: order.length }; },
      get freeing() { return freeing ? { n: pivots.indexOf(freeing.p), t: +(tNow - freeing.t0).toFixed(2) } : null; },
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
      lab: () => ({ seat, ground, sky, river, hands, desk, table, soulsG, pivots, vigs, far, crows, drops, sheetBody, camera, renderer: world.renderer, freedFigs }),
      dispose() {
        disposed = true; running = false; cancelAnimationFrame(raf);
        hideHouse(false);
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
