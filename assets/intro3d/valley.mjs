// THE VALLEY: Burin & Brimstone's home at Showroom (three.js + CSS3D).
//
// After the roll intro has floated up, a tap on the landing starts one
// continuous shot, as it does for the card table (table.mjs): the camera
// rises out of the float and glides across the room, away from the gaming
// floor - and out of the house altogether, onto a rock shelf over a valley
// that is a PAGE. The whole world is a woodcut after Holbein's Dance of
// Death (Lyon, 1538): bone paper, iron-gall ink, the forms turned in a few
// clear planes and hatched, the darks crossed; the only colour anywhere is
// blood. You sit at a plank table on the shelf. Across it sits the dealer,
// Death - a bare skeleton with a rag of shroud, his hourglass by his hand.
// Behind him the valley rises in three terraces, and on each terrace the
// dance goes on, one Death to a vignette, each at his own work as Holbein
// drew him (the Duchess, the Old Woman, the Rich Man): on the first terrace
// Death saws a hanged man in two; on the second he winds a man's bowels
// onto a windlass, flays another against a dead tree and breaks a third on
// the wheel; on the third he drums under the gallows, holds his glass up to
// a man on the stake, and drags one more off by the hair. Each vignette has
// a placard nailed on a post beside it, as a condemned man's name was
// nailed up: the placards are your ready platforms, their initials in Fell's
// letters, crossed in blood when the soul is spent. Through the terraces
// runs the river - blood, its current cut in lines that crawl. Crows go
// round the gallows. Nailed to the table's back rail, the broadside - the
// one printed thing - with the clock, what is ready and the hand to deal.
//
// Tap a placard (or its vignette): its Death turns his skull to you, and
// the card comes up off the board to you, with its Keen Info and its moves
// (the same card and sheet as the card table's). Drag across the table:
// the wind gets up - the hanged swing, the skin on the branch lifts, the
// crows are thrown. Nothing here is scaled to fake a thing: the camera goes
// where you would sit, and the lens is sized for that.
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
// a groove-metal procession over a psytrance floor, Base / Main / Lift as
// the other homes have); under it the valley plays its own ambience - the
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
import { buildFigure, buildDeath, buildSkull, BODY_HIPS } from './figure.mjs';

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
// The shelf: flat round the table, falling to the first terrace beyond its lip.
const ROCK = { lip: 95 };
// The dealer, across the table to your right.
const DEALER = { at: [-22, 0, 104], yaw: -0.38 };
// The terraces (their floors) and the river's trough between the first and
// the second; the far hills beyond the third.
const TIER = [{ z: 300, y: -34 }, { z: 480, y: 70 }, { z: 700, y: 150 }];
const RIVER = { z: 206, w: 56 };
const SKY = 1100;
// The broadside: a printed sheet nailed to the table's back rail, under
// your thumb (at: its middle; 60 x 38 cm, 30 page px to the cm).
const SHEET = { at: [20, 16, 55.7], lean: 0.0, w: 60, h: 38, px: 30, tilt: 0.9 * DEG };   // (nailed flat to the rail's face)
// The views: the seat, portrait and landscape.
const VIEW = [{ eye: [0, 130, -112], aim: [0, 70, 140], fov: 68 }, { eye: [0, 118, -112], aim: [0, 90, 140], fov: 54 }];
const T = { fly: 4.8, uiIn: 0.6, lift: 0.55 };
const SND = { wind: 0.06, bell: 0.22, saw: 0.05, crow: 0.09 };
// The key: Holbein's light, high from the left and a little in front.
const KEY_SEAT = new THREE.Vector3(0.82, 0.5, -0.22).normalize();

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
  d.legs.l.kn.rotation.x = Math.max(0, -s) * 0.9 * amp + 0.05; d.legs.r.kn.rotation.x = Math.max(0, s) * 0.9 * amp + 0.05;
  d.spine.rotation.z = -c * 0.05 * amp;
}
// the hourglass: two bulbs of glass between two discs on three posts
function buildHourglass(kit, h = 14) {
  const g = new THREE.Group();
  const glass = mat({ uv: [20, 8], angle: HALF, tone: -0.22, freq: 1.4, wobble: 0.5 });
  const bulb = lathe([[0.6, 0], [3.4, 0.8], [4.4, 2.2], [4.2, 4], [2.4, 5.6], [0.9, 6.6], [0.6, 7]], 18);
  const a = mesh(bulb, glass, g, 1.3); a.position.y = 0.6;
  const b = mesh(bulb, glass, g, 1.3); b.position.y = h - 0.6; b.rotation.x = PI;
  // the sand: in the lower bulb a cone of ink, a thread between
  const sand = mesh(new THREE.ConeGeometry(3.4, 2.8, 14), mat({ tone: 0.55, freq: 2.4 }), g, 0); sand.position.y = 2.2;
  mesh(new THREE.CylinderGeometry(0.25, 0.25, 4, 6), kit.ink, g, 0).position.y = h / 2;
  [0, h].forEach(y => { const d = mesh(new THREE.CylinderGeometry(5.6, 5.6, 1, 16), kit.post, g, 1.2); d.position.y = y; });
  for (let i = 0; i < 3; i++) { const a2 = i / 3 * PI * 2 + 0.4, p = mesh(new THREE.CylinderGeometry(0.5, 0.5, h, 6), kit.post, g, 0.9); p.position.set(Math.cos(a2) * 5, h / 2, Math.sin(a2) * 5); }
  g.userData.sand = sand;
  return g;
}

const restBody = restSkeleton;   // (the same joints)
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
  sh.position.set(x - h * 0.12, 0.45, z + h * 0.05); sh.scale.set(rx, 1, rz); sh.renderOrder = 0;
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

// I. THE SAWYER. A man hung by the ankles from an A-frame, spread; Death
// at the saw, the cut from the fork down into the belly; what is in him
// hanging out of it; the blood running down him to the pool round his head.
function vSawyer(kit, rnd) {
  const g = new THREE.Group(), bands = [];
  const H = 190;
  // the frame: two pairs of legs crossed, a beam between the forks
  [-1, 1].forEach(s => { [-1, 1].forEach(k => { const leg = mesh(new THREE.CylinderGeometry(3, 3.6, H + 10, 8), kit.post, g, 1.8); leg.position.set(s * 60 + k * 10, H / 2, k * 12); leg.rotation.x = k * 0.14; leg.rotation.z = -s * 0.05; }); });
  const beam = mesh(new THREE.CylinderGeometry(3.6, 3.6, 136, 8), kit.post, g, 1.8); beam.position.y = H; beam.rotation.z = HALF;
  // the man: upside down, hips at the beam, the legs out to the forks
  const man = buildFigure(kit, rnd, { split: true, beard: true, part: 0.3 }); g.add(man);
  const d = man.userData;
  man.rotation.z = PI; man.position.set(0, H + 4, 0);          // (the ankles at the beam; hips at 109, head at 29)
  restBody(man);
  d.legs.l.hip.rotation.z = 0.78; d.legs.r.hip.rotation.z = -0.78; d.legs.l.kn.rotation.x = 0.2; d.legs.r.kn.rotation.x = 0.2;
  d.arms.l.sh.rotation.set(0.3, 0, 0.5); d.arms.r.sh.rotation.set(0.5, 0, -0.9); d.arms.l.el.rotation.x = 0.4; d.arms.r.el.rotation.x = 0.7;
  d.neck.rotation.x = 0.55;
  // the rope round each ankle to the beam
  ['l', 'r'].forEach(s => { const r = mesh(new THREE.TorusGeometry(6.4, 0.9, 6, 12), kit.rope, d.legs[s].foot, 0.9); r.position.y = 2; r.rotation.x = HALF; });
  // the cut: the raw from the fork down the belly, the bowels out of it
  const gut = mesh(gutGeo([[0, 90, -9], [6, 74, -16], [-4, 66, -20], [7, 60, -13], [-3, 50, -17], [8, 42, -18], [-2, 26, -12], [5, 12, -16], [-3, 4, -14], [6, 2, -20]]), kit.gut, g, 1.3);
  const bag = mesh(new THREE.SphereGeometry(5.5, 12, 9), kit.raw, g, 1.3); bag.position.set(3, 82, -12); bag.scale.set(1, 1.4, 0.8);
  // the pool under his head, and the one under the bowels' end
  g.add(pool(kit, rnd, 30, 1.2)).position.set(0, 0, -6);
  [-1, 1].forEach(sx => [-1, 1].forEach(k => shade(g, sx * 60 + k * 10, k * 12, 6, 5, 20)));
  shade(g, -40, -10, 22, 12);
  // Death at the saw: standing to the man's right, both hands on the saw
  const death = buildDeath(kit, rnd); g.add(death); restSkeleton(death);
  death.position.set(-40, 0, -10); death.rotation.y = -HALF + 0.3;   // (inside the frame's span, facing the man, turned a little to you)
  const dd = death.userData;
  dd.legs.l.hip.rotation.x = -0.35; dd.legs.r.hip.rotation.x = 0.3; dd.legs.r.kn.rotation.x = 0.4; dd.spine.rotation.x = 0.18;
  dd.arms.l.sh.rotation.set(-0.75, 0, 0.35); dd.arms.r.sh.rotation.set(-0.75, 0, -0.35); dd.arms.l.el.rotation.x = -0.7; dd.arms.r.el.rotation.x = -0.7;
  // the saw: a long blade with teeth, a handle at each end, held in the
  // right hand, set in the cut
  const saw = new THREE.Group(); g.add(saw);
  const blade = mesh(new THREE.BoxGeometry(0.8, 9, 84), kit.steel, saw, 1.6);
  for (let i = -19; i <= 19; i++) { const t = mesh(new THREE.ConeGeometry(1.1, 2.4, 4), kit.steel, saw, 0); t.position.set(0, -5.6, i * 2.1); t.rotation.x = PI; }
  [-1, 1].forEach(s => { const h = mesh(new THREE.CylinderGeometry(1.6, 1.6, 12, 8), kit.post, saw, 1.2); h.position.set(0, 2, s * 42); h.rotation.z = HALF; });
  saw.position.set(-14, 104, -9); saw.rotation.y = HALF; saw.rotation.z = -0.1;
  bleed(man, 0.5); bands.push([man, 110, 24]);
  bleed(saw); bands.push([saw, 108, 92]);
  const hi = 100;
  const act = (tt, dt, w, still) => {
    // the stroke: a slow draw back, a bite forward, the frame giving
    const s = still ? 0 : Math.sin(tt * 2.6), c = still ? 0 : Math.cos(tt * 2.6);
    saw.position.x = -14 + s * 14;
    dd.spine.rotation.x = 0.18 + c * 0.12; dd.arms.l.el.rotation.x = -0.7 + c * 0.4; dd.arms.r.el.rotation.x = -0.7 + c * 0.4; dd.arms.l.sh.rotation.x = -0.75 - c * 0.2; dd.arms.r.sh.rotation.x = -0.75 - c * 0.2;
    dd.hips.position.y = 92 - Math.abs(c) * 1.5;
    man.rotation.y = (still ? 0 : Math.sin(tt * 0.7) * 0.05) + w * 0.12;
    man.rotation.x = still ? 0 : c * 0.012;
    d.arms.r.sh.rotation.x = 0.5 + (still ? 0 : Math.sin(tt * 1.3) * 0.15);
    beam.position.y = H + (still ? 0 : Math.abs(c) * -0.6);
  };
  return { g, death, act, bands, drips: [[V(2, hi - 64, -10), V(0, 2, -8)], [V(-5, hi - 50, -12), V(2, 2, -4)]], crows: [] , width: 120 };
}
// II. THE WINDLASS. A man on his back on a plank table, opened; his bowels
// drawn out of him onto a windlass that Death turns by its crank.
function vWindlass(kit, rnd) {
  const g = new THREE.Group(), bands = [];
  const TH = 56;
  const top = mesh(new THREE.BoxGeometry(98, 5, 42), kit.wood, g, 1.8); top.position.set(0, TH, 0);
  [-1, 1].forEach(s => { const tr = mesh(new THREE.BoxGeometry(5, TH, 34), kit.post, g, 1.6); tr.position.set(s * 40, TH / 2 - 2.5, 0); tr.rotation.y = 0.12 * s; });
  const lie = G(g, 0, TH + 10, 4); lie.rotation.y = -HALF;                 // (lying along x, head to the right, face up)
  const man = buildFigure(kit, rnd, { beard: rnd() < 0.5 }); lie.add(man); restBody(man);
  shade(g, 0, 0, 56, 26, 40); shade(g, 50, -70, 22, 12); shade(g, 44, -34, 10, 20, 30);
  const d = man.userData;
  man.rotation.x = HALF; man.position.set(0, 0, -(BODY_HIPS - 10));
  d.arms.l.sh.rotation.set(0, 0, 1.2); d.arms.r.sh.rotation.set(0, 0, -1.2); d.arms.l.el.rotation.set(-1.1, 0, 0); d.arms.r.el.rotation.set(-1.1, 0, 0);
  d.legs.l.hip.rotation.z = 0.25; d.legs.r.hip.rotation.z = -0.25; d.legs.l.kn.rotation.x = 0.5; d.legs.r.kn.rotation.x = 0.5;
  d.neck.rotation.x = -0.7;
  // the belly open: a raw box sunk in the torso's front
  wound(d.hips, 22, 8, 20, 0, 26, -8, kit);
  // the windlass: a frame of two uprights with the drum between, the
  // crank at the near end
  const wl = G(g, 44, 0, -34);
  [-1, 1].forEach(s => { const u = mesh(new THREE.BoxGeometry(6, 92, 6), kit.post, wl, 1.6); u.position.set(0, 46, s * 16); });
  const drum = G(wl, 0, 90, 0);
  const dr = mesh(new THREE.CylinderGeometry(7, 7, 30, 14), kit.post, drum, 1.6); dr.rotation.x = HALF;
  // the bowels wound on the drum: a spiral tube
  const sp = [];
  for (let i = 0; i <= 40; i++) { const a = i / 40 * PI * 2 * 3, z = -10 + i / 40 * 18; sp.push([Math.cos(a) * 8.6, Math.sin(a) * 8.6, z]); }
  mesh(gutGeo(sp, 2.2), kit.gut, drum, 1.2);
  const crank = mesh(new THREE.BoxGeometry(2.4, 20, 2.4), kit.iron, drum, 1.2); crank.position.set(0, 10, -22);
  const handle = mesh(new THREE.CylinderGeometry(1.4, 1.4, 12, 8), kit.post, drum, 1.1); handle.position.set(0, 20, -28); handle.rotation.x = HALF;
  // the free run of the bowels, from the belly up to the drum
  mesh(gutGeo([[5, TH + 24, -4], [16, TH + 30, -10], [28, 80, -20], [38, 92, -28], [44, 99, -34]]), kit.gut, g, 1.2);
  // Death at the crank, side on, one hand on the handle, the other on the frame
  const death = buildDeath(kit, rnd); g.add(death); restSkeleton(death);
  death.position.set(50, 0, -70); death.rotation.y = -0.2;
  const dd = death.userData;
  dd.spine.rotation.x = 0.1; dd.legs.l.hip.rotation.x = -0.2; dd.legs.r.hip.rotation.x = 0.25; dd.legs.r.kn.rotation.x = 0.3;
  dd.arms.l.sh.rotation.set(-0.6, 0, 0.9); dd.arms.l.el.rotation.x = -0.5;
  // the pool under the table's edge, where it drips
  g.add(pool(kit, rnd, 22)).position.set(-10, 0, -22);
  bleed(man, 0.7); bands.push([man, TH + 28, TH + 10]);
  bleed(top); bands.push([top, TH + 3, TH - 3]);
  const act = (tt, dt, w, still) => {
    const a = still ? 0 : tt * 1.7;
    drum.rotation.z = -a;
    // the arm follows the crank's handle: the shoulder and elbow swing round
    dd.arms.r.sh.rotation.x = -1.1 + Math.sin(a) * 0.45; dd.arms.r.el.rotation.x = -0.9 + Math.cos(a) * 0.5; dd.arms.r.sh.rotation.z = -0.35 - Math.cos(a) * 0.1;
    dd.spine.rotation.z = still ? 0 : Math.cos(a) * 0.05;
    dd.neck.rotation.y = 0.5 + (still ? 0 : Math.sin(tt * 0.5) * 0.15);
    // the man: a hand lifts and falls, the head rolls
    d.arms.r.el.rotation.x = -1.1 + (still ? 0 : Math.max(0, Math.sin(tt * 0.9)) * 0.6);
    d.neck.rotation.z = still ? 0 : Math.sin(tt * 0.6) * 0.3;
  };
  return { g, death, act, bands, drips: [[V(-12, TH + 2, -20), V(-10, 2, -22)]], crows: [], width: 130 };
}
// III. THE FLAYING. A man bound to a dead tree, the skin off him; Death
// beside with the knife, holding the skin up by a hand; the rest of it
// hangs from the branch and lifts in the wind.
function vFlaying(kit, rnd) {
  const g = new THREE.Group(), bands = [];
  // the tree: a trunk with a lean, two branches, a stump of a third
  const trunk = mesh(lathe([[13, 0], [10, 30], [8.5, 80], [7, 130], [5.5, 170], [3, 200], [0.01, 201]], 12), kit.bark, g, 2);
  const br = mesh(new THREE.CylinderGeometry(2.4, 4.4, 70, 8), kit.bark, g, 1.6); br.position.set(-26, 158, 2); br.rotation.z = 1.2;
  const br2 = mesh(new THREE.CylinderGeometry(1.6, 3.4, 52, 8), kit.bark, g, 1.4); br2.position.set(16, 176, -4); br2.rotation.z = -0.9; br2.rotation.x = 0.3;
  mesh(new THREE.CylinderGeometry(1.4, 2.6, 18, 7), kit.bark, g, 1.2).position.set(8, 118, -6), g.children[g.children.length - 1].rotation.z = -1.3;
  // the man, flayed, bound standing against the trunk, arms up and tied
  const man = buildFigure(kit, rnd, { flayed: true }); g.add(man); restBody(man);
  man.position.set(0, 0, -12);
  shade(g, 0, -4, 24, 16, 80); shade(g, -44, 2, 22, 12);
  const d = man.userData;
  d.arms.l.sh.rotation.set(0, 0, 2.6); d.arms.r.sh.rotation.set(0, 0, -2.6); d.arms.l.el.rotation.x = -0.2; d.arms.r.el.rotation.x = -0.2;
  d.neck.rotation.x = 0.5; d.neck.rotation.z = 0.3; d.legs.l.kn.rotation.x = 0.25; d.legs.r.kn.rotation.x = 0.1;
  // the rope: round the wrists to the branch, round the waist to the trunk
  const rope = mesh(new THREE.CylinderGeometry(0.8, 0.8, 30, 6), kit.rope, g, 0.8); rope.position.set(-6, 146, -8); rope.rotation.z = 0.4;
  const belt = mesh(new THREE.TorusGeometry(17, 1, 6, 20), kit.rope, g, 0.9); belt.position.set(0, 96, -8); belt.rotation.x = HALF;
  // the skin: a flat man, hung from the branch by its arms, the rest down
  const skinShape = new THREE.Shape();
  [[0, 0], [8, -2], [10, -12], [18, -16], [34, -8], [36, -14], [20, -26], [16, -60], [20, -100], [16, -148], [6, -150], [4, -102], [0, -98], [-4, -102], [-6, -150], [-16, -148], [-20, -100], [-16, -60], [-20, -26], [-36, -14], [-34, -8], [-18, -16], [-10, -12], [-8, -2]].forEach(([x, y], i) => i ? skinShape.lineTo(x, y) : skinShape.moveTo(x, y));
  const sg = new THREE.ShapeGeometry(skinShape, 4);
  { const p = sg.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, Math.sin(y * 0.06) * 3 + Math.sin(x * 0.2) * 1.5); } sg.computeVertexNormals(); }
  const skin = mesh(sg, kit.skin, g, 1.6); skin.position.set(-54, 182, 14); skin.rotation.y = 0.5;
  // Death with the knife, one hand up at the skin's edge
  const death = buildDeath(kit, rnd); g.add(death); restSkeleton(death);
  death.position.set(-44, 0, 2); death.rotation.y = 0.9;
  const dd = death.userData;
  dd.arms.l.sh.rotation.set(-2.7, 0, 0.4); dd.arms.l.el.rotation.x = -0.3; dd.arms.r.sh.rotation.set(-1.0, 0, -0.5); dd.arms.r.el.rotation.x = -1.4;
  dd.spine.rotation.x = -0.1; dd.legs.r.hip.rotation.x = -0.3; dd.legs.l.hip.rotation.x = 0.2; dd.legs.l.kn.rotation.x = 0.3;
  const knife = mesh(new THREE.BoxGeometry(0.6, 2.6, 16), kit.iron, dd.arms.r.hand, 1.2); knife.position.set(0, -8, -8); knife.rotation.x = 0.4;
  g.add(pool(kit, rnd, 26)).position.set(0, 0, -16);
  bleed(trunk); bands.push([trunk, 150, 0]);
  const act = (tt, dt, w, still) => {
    // the skin lifts and turns in the wind; the man's head rolls
    skin.rotation.y = 0.5 + (still ? 0 : Math.sin(tt * 1.1) * 0.12) + w * 0.6;
    skin.rotation.x = (still ? 0 : Math.sin(tt * 0.8 + 1) * 0.06) - w * 0.25;
    d.neck.rotation.z = 0.3 + (still ? 0 : Math.sin(tt * 0.45) * 0.25);
    dd.arms.r.el.rotation.x = -1.4 + (still ? 0 : Math.sin(tt * 1.9) * 0.2);
    dd.neck.rotation.y = still ? 0 : Math.sin(tt * 0.3) * 0.2;
  };
  return { g, death, act, bands, drips: [[V(-4, 120, -20), V(0, 2, -16)]], crows: [[-20, 212, 2], [26, 198, -8]], width: 120 };
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
  const P = 118, R = 42;
  mesh(new THREE.CylinderGeometry(4, 5.5, P, 10), kit.post, g, 2).position.y = P / 2;
  const wh = G(g, 0, P + 2, 0); wh.rotation.x = 2.6;   // (its face tilted down toward you)
  mesh(new THREE.TorusGeometry(R, 3.2, 8, 36), kit.woodRing, wh, 1.8);
  for (let k = 0; k < 8; k++) { const sp = mesh(new THREE.CylinderGeometry(1.6, 2, R - 4, 8), kit.post, wh, 1.3); const a = k / 8 * PI * 2; sp.position.set(Math.cos(a) * R / 2, Math.sin(a) * R / 2, 0); sp.rotation.z = a + HALF; }
  mesh(new THREE.CylinderGeometry(7, 7, 9, 12), kit.post, wh, 1.5).rotation.x = HALF;
  // the man: on his back over the hub, the limbs bent back through the
  // spokes (a knee the wrong way, an elbow the wrong way)
  const man = buildFigure(kit, rnd, { hose: true }); wh.add(man); restBody(man);
  shade(g, 0, 0, 30, 22, 70); shade(g, -46, 10, 22, 12);
  man.position.set(0, BODY_HIPS, 10); man.rotation.set(0, PI, PI + 0.25);   // (on his back on the face, his head over the top rim, toward you)
  const d = man.userData;
  d.legs.l.hip.rotation.set(0.9, 0, 0.6); d.legs.r.hip.rotation.set(0.6, 0, -0.9); d.legs.l.kn.rotation.x = -1.9; d.legs.r.kn.rotation.x = -2.1;
  d.arms.l.sh.rotation.set(0.4, 0, 1.9); d.arms.r.sh.rotation.set(0.9, 0, -2.3); d.arms.l.el.rotation.set(0, 0, 1.6); d.arms.r.el.rotation.set(0, 0, -1.9);
  d.neck.rotation.set(-0.6, 0, 0.5);
  wound(d.legs.l.kn, 5, 7, 9, 0, -2, -2, kit); wound(d.arms.r.el, 4, 6, 7, 0, -1, 0, kit); wound(d.hips, 9, 5, 8, -4, 30, -10, kit);
  // Death with the bar: both hands, raised over his head
  const death = buildDeath(kit, rnd); g.add(death); restSkeleton(death);
  death.position.set(-46, 0, 10); death.rotation.y = 0.75;
  const dd = death.userData;
  const bar = mesh(new THREE.CylinderGeometry(1.8, 2.2, 88, 8), kit.iron, dd.arms.r.hand, 1.4); bar.position.set(0, 10, 0); bar.rotation.z = 0.1;
  dd.legs.l.hip.rotation.x = -0.4; dd.legs.r.hip.rotation.x = 0.35; dd.legs.r.kn.rotation.x = 0.4;
  g.add(pool(kit, rnd, 18)).position.set(6, 0, 16);
  bleed(man, 0.3); bands.push([man, P + 30, P - 30]);
  const act = (tt, dt, w, still) => {
    // the blow: a long wind-up, the bar brought down, a settle (a 3.4 s cycle)
    const c = still ? 0.3 : (tt % 3.4) / 3.4;
    const up = smoother(c / 0.55) * (1 - smoother((c - 0.62) / 0.1)), down = smoother((c - 0.62) / 0.1) * (1 - smoother((c - 0.78) / 0.22));
    const raise = up * 2.4 + down * -0.5, rec = down * 0.12;
    dd.arms.r.sh.rotation.set(-0.9 - raise, 0, -0.3); dd.arms.l.sh.rotation.set(-0.9 - raise, 0, 0.3);
    dd.arms.r.el.rotation.x = -0.4 - up * 0.6; dd.arms.l.el.rotation.x = -0.4 - up * 0.6;
    dd.spine.rotation.x = -0.2 + up * -0.25 + down * 0.45;
    dd.hips.position.y = 92 - down * 5 + up * 1.5;
    wh.rotation.z = (still ? 0 : Math.sin(tt * 0.3) * 0.03) + rec + w * 0.05;
    d.arms.l.el.rotation.z = 1.6 + (still ? 0 : Math.sin(tt * 2.3) * 0.08);
  };
  return { g, death, act, bands, drips: [[V(10, P - 4, 20), V(6, 2, 16)]], crows: [[R - 6, P + 2 + 16, 4], [-R + 4, P + 2 + 12, 10]], width: 120 };
}
// V. THE GALLOWS. A beam on two posts, two hanged - one long dead, one not
// - crows on the beam; Death under them with the drum, dancing.
function vGallows(kit, rnd) {
  const g = new THREE.Group(), bands = [];
  const H = 230, W = 120;
  [-1, 1].forEach(s => mesh(new THREE.BoxGeometry(8, H, 8), kit.post, g, 2).position.set(s * W / 2, H / 2, 0));
  mesh(new THREE.BoxGeometry(W + 30, 8, 8), kit.wood, g, 2).position.y = H;
  [-1, 1].forEach(s => { const b = mesh(new THREE.BoxGeometry(6, 6, 36), kit.wood, g, 1.3); b.position.set(s * (W / 2 - 14), H - 14, 0); b.rotation.z = s * 0.78; });
  // the hanged: a man, fresh, and a skeleton in rags; each on its rope
  const hanged = [];
  [[-30, 0], [30, 1]].forEach(([x, k]) => {
    const piv = G(g, x, H - 4, 0);
    mesh(new THREE.CylinderGeometry(0.9, 0.9, 44, 6), kit.rope, piv, 0.9).position.y = -22;
    const b = buildFigure(kit, rnd, { shirt: true, hose: k === 1, beard: k === 0 }); restBody(b);
    b.position.y = -44 - 150; b.rotation.y = (rnd() - 0.5) * 1.2 + (k ? 0.5 : -0.4); piv.add(b);
    const d = b.userData;
    d.neck.rotation.set(0.5, 0, 0.6); d.arms.l.sh.rotation.z = 0.12; d.arms.r.sh.rotation.z = -0.12; d.legs.l.hip.rotation.x = 0.05; d.legs.r.hip.rotation.x = -0.05;
    d.mouth.scale.set(1.2, 1.6, 0.5); d.arms.l.sh.rotation.x = 0.1; d.arms.l.el.rotation.z = 0.3; d.arms.r.el.rotation.z = -0.3;   // (the hands bound before him)
    if (k) { d.legs.l.kn.rotation.x = 0.3; d.neck.rotation.z = -0.6; }
    hanged.push({ piv, b, k, ph: rnd() * 6 });
  });
  // Death the drummer: the drum slung at his hip, a stick in each hand
  const death = buildDeath(kit, rnd); g.add(death); restSkeleton(death);
  death.position.set(4, 0, 30); death.rotation.y = -0.3;
  const dd = death.userData;
  const drum = G(dd.hips, 12, -6, -12);
  const dm = mesh(new THREE.CylinderGeometry(9, 9, 14, 16), kit.cloth, drum, 1.6); dm.rotation.x = HALF; dm.rotation.z = 0.3;
  mesh(new THREE.CylinderGeometry(9.4, 9.4, 1.2, 16), kit.post, drum, 1.2).rotation.copy(dm.rotation);
  ['l', 'r'].forEach(s => { const st = mesh(new THREE.CylinderGeometry(0.6, 0.8, 18, 6), kit.post, dd.arms[s].hand, 1); st.position.set(0, -4, -8); st.rotation.x = HALF + 0.4; });
  g.add(pool(kit, rnd, 14)).position.set(-30, 0, 2);
  const man = hanged[0].b;
  bleed(man, 0.45); bands.push([man, H - 36, H - 62]);   // (the blood at his nose and mouth)
  [-1, 1].forEach(s => shade(g, s * W / 2, 0, 9, 7, 30)); shade(g, 4, 30, 22, 12); shade(g, -30, 0, 14, 9, 150); shade(g, 30, 0, 14, 9, 150);
  const act = (tt, dt, w, still) => {
    const wv = still ? 0 : tt * 3.2;
    stepSkeleton(death, wv, 1.3);
    dd.hips.position.y = 92 + (still ? 0 : Math.max(0, Math.sin(wv)) * 7);
    dd.arms.l.sh.rotation.set(-0.9 + (still ? 0 : Math.sin(wv * 2) * 0.5), 0, 0.5); dd.arms.r.sh.rotation.set(-0.9 + (still ? 0 : Math.cos(wv * 2) * 0.5), 0, -0.5);
    dd.arms.l.el.rotation.x = -1.3; dd.arms.r.el.rotation.x = -1.3;
    dd.neck.rotation.set(0.25, still ? 0 : Math.sin(wv * 0.5) * 0.4, still ? 0 : Math.sin(wv) * 0.15);
    hanged.forEach((h, i) => { h.piv.rotation.z = (still ? 0 : Math.sin(tt * 0.8 + h.ph) * 0.05) + w * 0.22 * (i ? 0.7 : 1); h.piv.rotation.x = (still ? 0 : Math.sin(tt * 0.6 + h.ph) * 0.03) + w * 0.06; h.b.rotation.y += (still ? 0 : (0.12 + w * 0.5) * dt) * (i ? -1 : 1); });
  };
  return { g, death, act, bands, drips: [[V(-30, H - 170, -4), V(-30, 2, 2)]], crows: [[-50, H + 6, 0], [0, H + 6, 0], [44, H + 6, 0], [-W / 2, H + 5, 0]], width: 160 };
}
// VI. THE STAKE. A man on the stake, run through; Death at its foot
// holding his glass up to him.
function vStake(kit, rnd) {
  const g = new THREE.Group(), bands = [];
  const H = 230;
  const stake = mesh(new THREE.CylinderGeometry(2.6, 5, H, 9), kit.post, g, 2); stake.position.y = H / 2; stake.rotation.z = 0.06;
  mesh(new THREE.ConeGeometry(2.6, 12, 9), kit.post, g, 1.5).position.set(-H * 0.06 * 0.5 - 6.5, H + 5, 0);
  const man = buildFigure(kit, rnd, { hose: true, beard: true }); g.add(man); restBody(man);
  man.position.set(-8, H - 170, 2); man.rotation.set(0.35, 0.3, 0.1);
  shade(g, 0, 0, 10, 8, 40); shade(g, -40, 16, 22, 12);
  const d = man.userData;
  d.arms.l.sh.rotation.set(0.2, 0, 0.35); d.arms.r.sh.rotation.set(-0.1, 0, -0.25); d.arms.l.el.rotation.x = 0.3;
  d.legs.l.hip.rotation.x = 0.3; d.legs.r.hip.rotation.x = -0.1; d.legs.l.kn.rotation.x = 0.4; d.legs.r.kn.rotation.x = 0.7;
  d.neck.rotation.set(0.8, 0.4, 0.3);
  wound(d.hips, 9, 10, 14, 0, 40, -6, kit);
  // Death with the glass, looking up
  const death = buildDeath(kit, rnd); g.add(death); restSkeleton(death);
  death.position.set(-40, 0, 16); death.rotation.y = 0.9;
  const dd = death.userData;
  dd.arms.r.sh.rotation.set(-2.2, 0, -0.3); dd.arms.r.el.rotation.x = -0.4; dd.arms.l.sh.rotation.set(0.2, 0, 0.25);
  dd.neck.rotation.x = -0.55; dd.spine.rotation.x = -0.15;
  const glass = buildHourglass(kit, 12); glass.position.set(0, -8, -4); glass.rotation.x = 0.3; dd.arms.r.hand.add(glass);
  g.add(pool(kit, rnd, 20)).position.set(-6, 0, 4);
  bleed(man, 0.6); bands.push([man, H - 60, H - 170]);
  bleed(stake, 0.7); bands.push([stake, H - 100, 0]);
  const act = (tt, dt, w, still) => {
    d.arms.l.sh.rotation.x = 0.2 + (still ? 0 : Math.sin(tt * 0.5) * 0.08);
    d.neck.rotation.z = 0.3 + (still ? 0 : Math.sin(tt * 0.35) * 0.15);
    dd.neck.rotation.y = still ? 0 : Math.sin(tt * 0.4) * 0.15;
    dd.arms.r.sh.rotation.x = -2.2 + (still ? 0 : Math.sin(tt * 0.7) * 0.06);
  };
  return { g, death, act, bands, drips: [[V(-6, H - 110, -2), V(-6, 2, 4)]], crows: [[-14, H + 2, 0]], width: 90 };
}
// VII. THE DRAGGING. Death bent to it, a man by the hair behind him, the
// smear of him on the ground.
function vDragging(kit, rnd) {
  const g = new THREE.Group(), bands = [];
  const death = buildDeath(kit, rnd); g.add(death); restSkeleton(death);
  death.position.set(-20, 0, 0); death.rotation.y = HALF + 0.3;   // walking to screen right
  const dd = death.userData;
  dd.spine.rotation.x = 0.55;
  dd.arms.r.sh.rotation.set(1.6, 0, -0.2); dd.arms.r.el.rotation.x = 0.3; dd.arms.l.sh.rotation.set(-0.9, 0, 0.3); dd.arms.l.el.rotation.x = -0.9;
  const man = buildFigure(kit, rnd, { shirt: true }); g.add(man); restBody(man);
  man.position.set(22, 0, 6);
  shade(g, -20, 0, 22, 12); shade(g, 30, 6, 60, 18, 20); man.rotation.set(-HALF + 0.1, 0, HALF - 0.2);  // on his back, along x, head to -x
  const d = man.userData;
  d.neck.rotation.x = -1.0; d.arms.l.sh.rotation.set(0, 0, 2.4); d.arms.r.sh.rotation.set(0.3, 0, -2.2); d.legs.l.kn.rotation.x = 0.35; d.legs.r.hip.rotation.z = -0.3;
  wound(d.hips, 16, 9, 12, 2, 32, -8, kit);
  wound(d.hips, 6, 14, 8, -8, 10, -9, kit);
  // the smear behind him, long
  const sm = mesh(splat(30, rnd, 2.6, 30), kit.pool, g, 1.2); sm.position.set(74, 0.6, 6); sm.renderOrder = 1;
  g.add(pool(kit, rnd, 12)).position.set(26, 0, 4);
  bleed(man, 0.6); bands.push([man, 26, 0]);
  const act = (tt, dt, w, still) => {
    const wv = still ? 0 : tt * 2.2;
    stepSkeleton(death, wv, 0.8);
    dd.spine.rotation.x = 0.55 + (still ? 0 : Math.abs(Math.cos(wv)) * 0.08);
    // the man jolts forward with each step, the head held up by the hair
    const j = still ? 0 : Math.max(0, Math.sin(wv)) * 3;
    man.position.x = 22 - j; d.neck.rotation.x = -1.0 + (still ? 0 : Math.sin(wv) * 0.1);
    d.arms.r.sh.rotation.x = 0.3 + (still ? 0 : Math.sin(wv + 1) * 0.2);
  };
  return { g, death, act, bands, drips: [], crows: [[60, 2, 12]], width: 130 };
}
const VIGNETTES = [vSawyer, vFlaying, vWheel, vDragging, vGallows, vWindlass, vStake];
// where each stands: [x, tier, placard x offset, placard height]
const SPOTS = [[50, 0, 82, 96], [150, 1, -92, 104], [-140, 1, -56, 104], [-62, 1, 58, 104], [0, 2, -104, 116], [170, 2, -80, 116], [-170, 2, 76, 116]];

// Death at the table: seated on a stool across from you, bare, the rag over
// his shoulder, the hourglass under his right hand, the left on the cloth.
function buildDealer(kit, rnd) {
  const g = new THREE.Group();
  const sk = buildDeath(kit, rnd); restSkeleton(sk);
  sk.rotation.y = 0; sk.position.y = -44;
  g.add(sk);
  const a = sk.userData.arms, l = sk.userData.legs;
  l.l.hip.rotation.x = -1.45; l.r.hip.rotation.x = -1.45; l.l.kn.rotation.x = 1.5; l.r.kn.rotation.x = 1.5;
  a.l.sh.rotation.set(0.55, 0, 0.1); a.r.sh.rotation.set(0.5, 0, -0.2); a.l.el.rotation.x = 1.0; a.r.el.rotation.x = 1.05;
  // the stool
  const st = mesh(new THREE.CylinderGeometry(14, 12, 4, 12), kit.post, g, 1.6); st.position.set(0, 42, 8);
  for (let i = 0; i < 3; i++) { const lg = mesh(new THREE.CylinderGeometry(1.8, 2.2, 44, 8), kit.post, g, 1.3); const an = i / 3 * PI * 2 + 0.5; lg.position.set(Math.cos(an) * 10, 20, 8 + Math.sin(an) * 10); lg.rotation.z = -Math.cos(an) * 0.12; lg.rotation.x = Math.sin(an) * 0.12; }
  shade(g, 0, 8, 26, 18); shade(g, -8, -4, 6, 5, 20);
  g.userData = { sk, phase: rnd() * 6 };
  return g;
}

// ------------------------------------------------------------ the land
// the shelf and the terraces: one ground, flat under the table, dropping
// past the lip to the first terrace, the river's trough, up to the second
// and the third, the hills beyond; flat pads where the vignettes stand
function groundHeight(x, z, n1, n2) {
  const d = Math.hypot(x * 0.8, z - 20);
  let y = TIER[0].y * smoother((d - ROCK.lip) / 50);
  y += (n1(x * 0.012 + 3, z * 0.012) - 0.5) * 10 + (n2(x * 0.04, z * 0.04) - 0.5) * 2.5;
  const riverZ = RIVER.z + Math.sin(x * 0.011) * 22;
  y -= 16 * Math.exp(-Math.pow((z - riverZ) / (RIVER.w * 0.9), 2));
  y += (TIER[1].y - TIER[0].y) * smoother((z - 392) / 50);
  y += (TIER[2].y - TIER[1].y) * smoother((z - 600) / 60);
  y += smoother((z - 790) / 280) * 260 + (n1(x * 0.004, z * 0.004) - 0.5) * 160 * smoother((z - 770) / 200);
  // the pads
  for (const [sx, ti] of SPOTS) { const dd = Math.hypot(x - sx, z - TIER[ti].z); y = lerp(y, TIER[ti].y, smoother(1 - dd / 72)); }
  return y;
}
function vnoise2(seed) {
  const h = (x, y) => { let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041)) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  return (x, y) => { const x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty); return lerp(lerp(h(x0, y0), h(x0 + 1, y0), sx), lerp(h(x0, y0 + 1), h(x0 + 1, y0 + 1), sx), sy); };
}
function buildGround() {
  const n1 = vnoise2(5), n2 = vnoise2(11);
  const geo = new THREE.PlaneGeometry(1800, 1600, 150, 140);
  geo.rotateX(-HALF);
  geo.translate(0, 0, 560);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, groundHeight(p.getX(i), p.getZ(i), n1, n2));
  geo.computeVertexNormals();
  // the ground's cut: broken horizontals, the hills a lighter tone (the
  // block's distance)
  const g = new THREE.Mesh(geo, mat({ freq: 0.5, angle: 0.04, tone: -0.14, sky: 0.45, keyI: 1.0, wobble: 0.6, steps: 3, axis: [1, 0, 0] }));
  g.userData.height = (x, z) => groundHeight(x, z, n1, n2);
  return g;
}
// the river: a ribbon down the trough, red, its current lines crawling
function buildRiver(kit, height) {
  const pts = [];
  for (let x = -480; x <= 480; x += 12) { const z = RIVER.z + Math.sin(x * 0.011) * 22; pts.push(V(x, height(x, z) + 5, z)); }
  const curve = new THREE.CatmullRomCurve3(pts);
  const n = 80, w = RIVER.w * 0.62;
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
    // the low band: long horizontals broken, denser toward the horizon
    for (let y = H * 0.7; y < H; y += 7 + rnd() * 5) { let x = 0; while (x < W) { const l = 60 + rnd() * 260; g.lineWidth = 1.2 + rnd() * 1.4 * (y / H); g.globalAlpha = 0.45 + 0.5 * (y / H); g.beginPath(); g.moveTo(x, y + (rnd() - 0.5) * 3); g.lineTo(x + l, y + (rnd() - 0.5) * 3); g.stroke(); x += l + 20 + rnd() * 120; } }
    g.globalAlpha = 1;
    // the clouds: each a row of billows (arcs) outlined, hatched beneath
    for (let c = 0; c < 34; c++) {
      const cx = rnd() * W, cy = H * (0.42 + rnd() * 0.26), n = 3 + Math.floor(rnd() * 5), R = 12 + rnd() * 16;
      let x = cx - n * R * 0.45;
      const tops = [];
      for (let i = 0; i < n; i++) { const r = R * (0.6 + rnd() * 0.7), y = cy + (rnd() - 0.5) * R * 0.5; g.lineWidth = 1.4 + rnd() * 0.6; g.beginPath(); g.arc(x, y, r, PI * 1.05, PI * 1.95); g.stroke(); tops.push([x, y, r]); x += r * 1.1; }
      // the flat base and the hatch under the billows
      const x0 = tops[0][0] - tops[0][2] * 0.9, x1 = tops[tops.length - 1][0] + tops[tops.length - 1][2] * 0.9, by = cy + R * 0.3;
      g.lineWidth = 1.6; g.beginPath(); g.moveTo(x0, by); g.lineTo(x1, by + (rnd() - 0.5) * 3); g.stroke();
      for (let k = 0; k < 5; k++) { const yy = by - k * 2.2 - 2; g.lineWidth = 0.8 + (5 - k) * 0.12; g.globalAlpha = 0.4 + (5 - k) * 0.1; g.beginPath(); g.moveTo(x0 + k * 4 + rnd() * 5, yy); g.lineTo(x1 - k * 4 - rnd() * 5, yy + (rnd() - 0.5) * 1.5); g.stroke(); }
      g.globalAlpha = 1;
      // the billows' shade: short hatch inside each arc's right side
      tops.forEach(([tx, ty, tr]) => { for (let k = 0; k < 4; k++) { const a0 = PI * 1.55 + k * 0.07, aa = a0 + 0.35; g.lineWidth = 0.8; g.globalAlpha = 0.5; const rr = tr - 2.5 - k * 2.6; if (rr > 2) { g.beginPath(); g.arc(tx, ty, rr, a0, aa); g.stroke(); } } });
      g.globalAlpha = 1;
    }
    // birds: a few 'v's
    for (let i = 0; i < 26; i++) { const x = rnd() * W, y = H * (0.3 + rnd() * 0.4), s = 4 + rnd() * 7; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x - s, y - s * 0.4); g.quadraticCurveTo(x - s * 0.4, y + s * 0.3, x, y); g.quadraticCurveTo(x + s * 0.4, y + s * 0.3, x + s, y - s * 0.4); g.stroke(); }
  });
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
  const glass = buildHourglass(kit, 22); glass.position.set(-40, 0, 44); g.add(glass);
  const sk = buildSkull(kit); sk.scale.setScalar(1.15); sk.position.set(38, 7, 26); sk.rotation.set(0.25, 0.45, 0.1); g.add(sk);
  const dm = mat({ freq: 2.6, angle: 0.7, tone: -0.1 });
  for (let i = 0; i < 3; i++) { const d = mesh(new THREE.BoxGeometry(4, 4, 4), dm, g, 1.2); d.position.set(-10 + i * 7, 2, 16 + (i % 2) * 6); d.rotation.y = i * 0.7; for (let k = 0; k < [3, 5, 2][i]; k++) { const pip = new THREE.Mesh(new THREE.SphereGeometry(0.42, 6, 5), kit.ink); const [px, pz] = [[-1, -1], [1, 1], [0, 0], [-1, 1], [1, -1]][k]; pip.position.set(px * 1.1, 2.05, pz * 1.1); d.add(pip); } }
  const coinM = mat({ freq: 3.2, angle: 0.9, tone: 0.1 });
  for (let i = 0; i < 7; i++) { const c = mesh(new THREE.CylinderGeometry(3, 3, 0.5, 14), coinM, g, 0.9); c.position.set(12 + (i % 3) * 7, 0.3 + Math.floor(i / 3) * 0.6, 10 + Math.floor(i / 3) * 5); }
  shade(g, -40, 44, 7, 6, 22); shade(g, 38, 26, 9, 8, 14); shade(g, -3, 19, 12, 7, 4); shade(g, 20, 13, 14, 8, 2);
  g.userData.glass = glass;
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
const SL = { x: 70, rx: 1120, eyebrowY: 110, eyebrow: 52, numY: 560, now: 340, ampm: 64, ready: 420, runY: 760, runH: 240, run: 108, label: 72 };
function buildSheetBody() {
  const g = new THREE.Group();
  const c = document.createElement('canvas');
  c.width = 1800; c.height = Math.round(1800 * SHEET.h / SHEET.w);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const m = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(SHEET.w, SHEET.h), m);
  g.add(face);
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
  g.fillStyle = '#E3D6B8'; g.fillRect(0, 0, W, H);
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
  type(v.value > 0 ? `READY · ~$${v.value.toFixed(2)}` : 'READY', P(SL.rx), P(SL.eyebrowY), `${P(SL.label)}px "IM Fell English SC", Georgia, serif`, blood);
  type(v.ready, P(SL.rx), P(SL.numY), `${P(SL.ready)}px "IM Fell DW Pica", "IM Fell English", Georgia, serif`, ink);
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
    <div class="r3b-ready">&mdash;</div>
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
    bone: mat({ freq: 1.2, angle: 1.2, tone: -0.06 }),
    // (a long bone: strokes down its length; a joint or a skull: its
    // rings; a rib: strokes along the rib)
    shaft: mat({ uv: [14, 1], angle: 0, tone: -0.12, wobble: 1.4 }),
    ball: mat({ freq: 1.3, angle: 1.0, tone: -0.12 }),
    rib: mat({ uv: [1, 9], angle: HALF, tone: -0.1, wobble: 1.2 }),
    skull: mat({ freq: 1.25, angle: 1.1, tone: -0.14, keyI: 1.3, sky: 0.24, wobble: 0.8 }),
    // (flesh: the paper, hatched along the limb; the face in its rings;
    // hair a dark passage; the raw of a wound or a flayed man is blood)
    flesh: mat({ freq: 1.2, angle: -0.55, tone: -0.14, keyI: 1.4, sky: 0.44, wobble: 0.8 }),
    fleshUV: mat({ uv: [12, 5], angle: 0.08, tone: -0.14, keyI: 1.4, sky: 0.44, wobble: 0.6 }),
    face: mat({ freq: 1.25, angle: 1.1, tone: -0.12, keyI: 1.4, sky: 0.44, wobble: 0.7 }),
    hair: mat({ uv: [24, 8], angle: 0.2, tone: 0.58, freq: 1.6, wobble: 2 }),
    raw: mat({ paper: BLOOD, tone: 0.34, freq: 1.4, angle: -0.4, keyI: 1.2 }),
    rawUV: mat({ paper: BLOOD, uv: [12, 5], angle: 0.1, tone: 0.34, freq: 1.3, keyI: 1.2 }),
    gut: mat({ paper: BLOOD, uv: [40, 5], angle: HALF, tone: 0.46, freq: 1.0 }),
    pool: mat({ paper: BLOOD, tone: 0.42, freq: 1.0, angle: 0.1, side: THREE.DoubleSide }),
    skin: mat({ freq: 1.0, angle: 1.2, tone: -0.02, wobble: 1.4, side: THREE.DoubleSide }),
    river: mat({ paper: BLOOD, uv: [8, 60], angle: 0.1, tone: 0.22, freq: 1.0, wobble: 1.8, scroll: [0, 6], steps: 0 }),
    cloth: mat({ freq: 0.9, angle: 1.3, tone: 0.3, wobble: 1.6, side: THREE.DoubleSide }),
    linen: mat({ uv: [18, 4], angle: 0.1, tone: -0.06, sky: 0.36, wobble: 0.8 }),
    // (a plank or a beam, long in x: the grain runs its length; a turned
    // timber - any cylinder, standing or laid - its own length)
    wood: mat({ freq: 0.8, angle: HALF, tone: 0.2, wobble: 1.2, axis: [1, 0, 0] }),
    post: mat({ freq: 0.8, angle: 0, tone: 0.2, wobble: 1.2 }),
    woodRing: mat({ uv: [1, 10], angle: HALF, tone: 0.2, freq: 0.8, wobble: 1.2 }),
    bark: mat({ uv: [12, 4], angle: 0.12, tone: 0.44, freq: 1.4, wobble: 2.2 }),
    iron: mat({ freq: 1.6, angle: 0.3, tone: 0.5 }),
    steel: mat({ freq: 1.8, angle: 0.02, tone: 0.1, wobble: 0.3, axis: [0, 0, 1] }),
    rope: mat({ uv: [6, 1], angle: 0.9, tone: 0.3, freq: 2 }),
    stone: mat({ freq: 1.3, angle: 0.5, tone: 0.1, wobble: 1.6, steps: 3 }),
    hollow: mat({ freq: 1.8, angle: 0.9, tone: 0.56, keyI: 0.3 }),
    // (a flayed man: the muscle in its fibres, fine lines along the limb over the red)
    rawCap: mat({ paper: BLOOD, tone: 0.4, freq: 1.6, angle: 0.4, side: THREE.DoubleSide }),
    // (a flayed man: the fibres cut in blood on the paper - the page's own sanguine - so the figure keeps its silhouette and the lines read as muscle)
    muscle: mat({ paper: BONE, ink: BLOOD_WET, freq: 2.0, angle: -0.4, tone: 0.3, sky: 0.3, wobble: 0.5 }),
    muscleUV: mat({ paper: BONE, ink: BLOOD_WET, uv: [12, 5], angle: 0.1, tone: 0.3, sky: 0.3, freq: 2.0, wobble: 0.5 }),
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
  const ground = buildGround(); seat.add(ground);
  const height = ground.userData.height;
  await breathe();
  const river = buildRiver(kit, height); seat.add(river);
  const sky = buildSky(); seat.add(sky);
  await breathe();
  const table = buildTable(kit); seat.add(table);
  const dealer = buildDealer(kit, rnd); dealer.position.set(...DEALER.at); dealer.rotation.y = DEALER.yaw; dealer.position.y = height(DEALER.at[0], DEALER.at[2]) + 0.5; seat.add(dealer);
  await breathe();

  // The souls: the deck's ready platforms (the demonstration hand with
  // nothing ready), best first - the best nearest. Each is a vignette with
  // its placard.
  const hand = ((hooks.deck && hooks.deck()) || []).slice(0, 7);
  const cards = hand.length ? hand : K.demoHand().slice(0, 7);
  cards.forEach(c => { c.initials = K.initials(c.name); c.spent = c.remaining > 0; });
  const soulsG = new THREE.Group(); seat.add(soulsG);
  const pivots = [], vigs = [], drips = [], crowSpots = [];
  for (let i = 0; i < cards.length; i++) {
    const [sx, ti, px, ph] = SPOTS[i];
    const v = VIGNETTES[i](kit, rnd);
    const gy = height(sx, TIER[ti].z);
    v.g.position.set(sx, gy, TIER[ti].z);
    const pl = buildPlacard(kit, cards[i], i, ph, 30 + ti * 11);
    pl.position.set(sx + px, height(sx + px, TIER[ti].z - 20), TIER[ti].z - 20); pl.rotation.y = (rnd() - 0.5) * 0.3;
    const pivot = new THREE.Group(); pivot.add(v.g); pivot.add(pl); soulsG.add(pivot);
    pivot.userData = { v, placard: pl, plate: pl.userData.plate, tag: { userData: { id: cards[i].id, plate: pl.userData.plate, card: cards[i], n: i, spentTex: null, liveTex: pl.userData.liveTex } }, look: 0, lookTo: 0, deathYaw: v.death.rotation.y, toSeat: 0 };
    pivots.push(pivot); vigs.push(v);
    v.drips.forEach(([a, b]) => drips.push({ from: a.clone().add(v.g.position), to: b.clone().add(v.g.position) }));
    v.crows.forEach(([x, y, z]) => crowSpots.push(V(x, y, z).add(v.g.position)));
    await breathe();
  }
  // the blood bands, in world y (the seat sits at y 0, so its y is the world's)
  seat.updateMatrixWorld(true);
  vigs.forEach(v => v.bands.forEach(([root, hiOff, loOff]) => { setBleedBand(root, v.g.position.y + hiOff, v.g.position.y + loOff); }));
  // how far each Death turns his skull to look at you
  pivots.forEach(p => { const d = p.userData.v.death; const wp = d.getWorldPosition(V(0, 0, 0)); seat.worldToLocal(wp); const want = Math.atan2(wp.x, wp.z + 116); p.userData.toSeat = ((want - p.userData.deathYaw + PI) % (2 * PI) + 2 * PI) % (2 * PI) - PI; });
  // far off on the hills: more gallows, in silhouette
  const far = new THREE.Group(); seat.add(far);
  [[-320, 900], [-140, 980], [260, 930], [420, 880], [60, 1040]].forEach(([x, z]) => { const h = height(x, z), g = new THREE.Group(); g.position.set(x, h - 2, z); g.rotation.y = rnd() * 6; far.add(g); mesh(new THREE.BoxGeometry(6, 150, 6), kit.post, g, 1.6).position.y = 75; mesh(new THREE.BoxGeometry(70, 6, 6), kit.wood, g, 1.4).position.set(20, 148, 0); const sk = buildDeath(kit, rnd); restSkeleton(sk); sk.position.set(40, 142 - 165, 0); sk.scale.setScalar(0.9); sk.userData.neck.rotation.z = 0.5; g.add(sk); });
  // the ground dressed, as a woodcutter fills it: stones, bones, a skull or two
  const dress = new THREE.Group(); seat.add(dress);
  const stoneGeo = new THREE.IcosahedronGeometry(1, 1);
  for (let i = 0; i < 26; i++) {
    const ti = Math.floor(rnd() * 3), x = (rnd() - 0.5) * 520, z = TIER[ti].z + (rnd() - 0.5) * 90 + (ti === 0 ? -20 : 0);
    if (Math.hypot(x * 0.8, z - 20) < ROCK.lip + 30) continue;
    const st = mesh(stoneGeo, kit.stone, dress, 1.2); const sc = 3 + rnd() * 7; st.scale.set(sc * (0.8 + rnd() * 0.6), sc * 0.55, sc * (0.8 + rnd() * 0.6)); st.rotation.set(rnd(), rnd() * 6, rnd()); st.position.set(x, height(x, z) + sc * 0.2, z);
  }
  for (let i = 0; i < 14; i++) { const ti = Math.floor(rnd() * 3), x = (rnd() - 0.5) * 480, z = TIER[ti].z + (rnd() - 0.5) * 80; if (Math.hypot(x * 0.8, z - 20) < ROCK.lip + 30) continue; const b = mesh(boneGeo(18 + rnd() * 20, 1.6), kit.shaft, dress, 1.2); b.rotation.set(HALF + (rnd() - 0.5) * 0.2, 0, rnd() * 6); b.position.set(x, height(x, z) + 1.5, z); }
  for (let i = 0; i < 5; i++) { const ti = Math.floor(rnd() * 3), x = (rnd() - 0.5) * 440, z = TIER[ti].z + (rnd() - 0.5) * 70; if (Math.hypot(x * 0.8, z - 20) < ROCK.lip + 30) continue; const sk = buildSkull(kit); sk.rotation.set(rnd() * 0.8 - 0.2, rnd() * 6, rnd() * 0.6 - 0.3); sk.position.set(x, height(x, z) + 7, z); dress.add(sk); }
  // the scarps: boulders along the risers of the second and third terraces
  [[392, 44], [600, 52]].forEach(([rz, sz]) => { for (let x = -560; x <= 560; x += 40 + rnd() * 50) { if (rnd() < 0.35) continue; const z = rz + (rnd() - 0.5) * 24; const st = mesh(stoneGeo, kit.stone, dress, 1.4); const sc = 9 + rnd() * 11; st.scale.set(sc * (1 + rnd() * 0.8), sc * (0.6 + rnd() * 0.5), sc * 0.8); st.rotation.set(rnd() * 0.6, rnd() * 6, rnd() * 0.6); st.position.set(x, height(x, z) + sc * 0.1, z); } });
  // dead trees on the flanks of the terraces, as a woodcutter fills to the border
  [[-300, 1, 1.0], [300, 1, 0.85], [-360, 2, 1.1], [330, 2, 0.95], [-230, 2, 0.7], [250, 0, 0.8]].forEach(([x, ti, sc]) => { const z = TIER[ti].z + 30, t = buildTree(kit, rnd); t.scale.setScalar(sc); t.position.set(x, height(x, z) - 2, z); t.rotation.y = rnd() * 6; dress.add(t); });
  // the drops and the crows
  const drops = dropMesh(drips.length * 3); seat.add(drops);
  const dropP = Array.from({ length: drips.length * 3 }, (_, i) => ({ e: Math.floor(i / 3), t: Math.random() }));
  const NC = crowSpots.length + 6;
  const crows = new THREE.InstancedMesh(crowGeo(), new THREE.MeshBasicMaterial({ color: INK, side: THREE.DoubleSide }), NC); crows.frustumCulled = false; seat.add(crows);
  const gallows = pivots[4] ? pivots[4].userData.v.g.position : V(0, 150, 460);
  const crowP = Array.from({ length: NC }, (_, i) => i < crowSpots.length ? { perch: crowSpots[i], ph: Math.random() * 6, hop: Math.random() * 8 + 3 } : { r: 60 + Math.random() * 90, h: 230 + Math.random() * 60, ph: Math.random() * 6, sp: 0.25 + Math.random() * 0.25, dir: Math.random() < 0.5 ? 1 : -1 });
  const sheetBody = buildSheetBody(); sheetBody.position.set(...SHEET.at); sheetBody.rotation.set(SHEET.lean, PI, SHEET.tilt); seat.add(sheetBody);

  const pivotOf = id => pivots.find(p => p.userData.tag.userData.id === id);
  const setSpent = (id, spent) => {
    const p = pivotOf(id); if (!p) return;
    const t = p.userData.tag.userData;
    if (spent && !t.spentTex) t.spentTex = placardArt(t.card, t.n, true);
    t.plate.material.map = spent ? t.spentTex : t.liveTex; t.plate.material.needsUpdate = true;
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
    sheetObj.rotation.set(SHEET.lean, PI, SHEET.tilt);
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
    const em4 = new THREE.Matrix4(), eq = new THREE.Quaternion(), es = V(1, 1, 1), ep = V(0, 0, 0), zero = new THREE.Matrix4().makeScale(0, 0, 0);
    const placeDrops = (tt, dt) => {
      dropP.forEach((d, i) => {
        if (fo.reduced) { drops.setMatrixAt(i, zero); return; }
        const e = drips[d.e]; d.t += dt * 0.9; if (d.t >= 1) d.t = -Math.random() * 1.5;
        if (d.t < 0) { drops.setMatrixAt(i, zero); return; }
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
      // the dealer breathes (which he does not), and turns his skull to the soul you took
      const dd = dealer.userData, look = pivots.reduce((a, p) => Math.max(a, p.userData.look), 0);
      dd.sk.userData.spine.rotation.x = fo.reduced ? 0 : Math.sin(tt * 0.6 + dd.phase) * 0.025;
      dd.sk.userData.neck.rotation.y = lerp(0, 0.7, look) + (fo.reduced ? 0 : Math.sin(tt * 0.27) * 0.08);
      dd.sk.userData.neck.rotation.x = fo.reduced ? 0 : Math.sin(tt * 0.4 + 2) * 0.03;
      dd.sk.userData.rag.rotation.z = -0.25 + w * 0.3;
      // the sky drifts
      if (!fo.reduced) sky.userData.tex.offset.x = tt * 0.0025 + w * 0.002;
      placeDrops(tt, fo.reduced ? 0 : dt);
      placeCrows(tt, w);
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
      lab: () => ({ seat, ground, sky, river, dealer, table, soulsG, pivots, vigs, far, crows, drops, sheetBody }),
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
