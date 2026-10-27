// The lab: an empty room with a line of men of every build, for tuning the
// app's figures (figure.mjs with `build`) - general-purpose people, meant
// for every scene once they are polished, not for any one of them (the
// valley is one scene that may take them up; it does not yet). Opened
// from the authenticator (?lab sends the owner here); nothing in it moves
// unless you move it - the camera goes only where you send it, and the
// walk is the only pose that animates (and it pauses).
//
//   - the line: eight builds (figure.mjs `build`: height, mass, muscle, age)
//     from a slight eighteen-year-old to an old man, a heavy man, a big one
//   - poses: standing, walking (in place, on a loop), seated on a block,
//     hung head-down from a beam as the sawyer is in the valley
//   - wear: the loincloth, a shirt, hose, a shirt and hose
//   - looks: the valley's engraving (ink), or plain grey clay (studio)
//   - the anatomy's rest: how far it swings forward off the vertical in each
//     pose, and for the hung man how it falls - swung forward over the
//     belly, or the valley's present flip (turned end for end about the
//     body's depth, which keeps the front out but mirrors left and right)
// The dev overlay's sliders act on every man in the room; a pose or an
// outfit rebuilds the men with the values the sliders hold. Its sliders are
// grouped by part (the weight pouch, the lobes), each part its own tab.
//   - compare: two models side by side, each with its own build, face and
//     slider values (their panels docked at the sides of the view on a wide
//     screen, under it on a phone); the same or different values
//   - faces: each man a face variant of his own, or one for all
//   - None paints the anatomy as the physics proxy: orange see-through,
//     the lobes blue (L) and red (R) with the pouch orange, or opaque brown
//   - every panel and the settings dock fold away for a clear view
import * as THREE from '../assets/vendor/three/three.module.js';
import { valleyKit, KEY_SEAT } from '../assets/intro3d/valley.mjs';
import { buildFigure, BODY_HIPS, getAnatomy, updateSleeves, FACE_VARIANTS } from '../assets/intro3d/figure.mjs';
import { FleshSim } from '../assets/intro3d/flesh.mjs';
import { burinTick, engravingMaterial, paperMaterial, BONE } from '../assets/intro3d/burin.mjs';
import { UC_MODE } from '../assets/intro3d/universal-cloth-material.mjs';
import { initDevOverlay } from '../assets/intro3d/dev-overlay.mjs';

const PI = Math.PI, DEG = PI / 180;
const KNEE_BACK = -1;
const SPACING = 96;   // between the men, cm

// ---------- the line ----------
const MEN = [
  { name: '18, slight', build: { height: 0.97, mass: -0.35, muscle: -0.2, age: -0.3 } },
  { name: '30s, fit', build: { height: 1.02, mass: -0.15, muscle: 0.9, age: 0 } },
  { name: '30s, average', build: { height: 1.0, mass: 0.25, muscle: 0.15, age: 0.05 }, beard: true },
  { name: 'Middle age', build: { height: 0.99, mass: 0.55, muscle: 0.1, age: 0.45 }, beard: true, recede: 0.4 },
  { name: 'Elderly', build: { height: 0.95, mass: 0.15, muscle: -0.4, age: 1 }, grey: true, recede: 0.9, beard: true },
  { name: 'Big & tall', build: { height: 1.1, mass: 0.45, muscle: 0.85, age: 0.2 } },
  { name: 'Heavy', build: { height: 1.0, mass: 1, muscle: 0.2, age: 0.3 }, beard: true },
  { name: 'Small', build: { height: 0.88, mass: 0.05, muscle: 0.1, age: 0.1 } }
];
// (tightest hold to loosest; see FABRIC in figure.mjs)
const OUTFITS = { compression: { under: 'compression' }, minimal: { brief: true }, hose: { hose: true }, both: { shirt: true, hose: true }, boxerBriefs: { under: 'boxerBriefs' }, longJohns: { under: 'longJohns' }, boxers: { under: 'boxers' }, loin: {}, shirt: { shirt: true }, none: { nude: true } };
// (with no fabric at all - None - the anatomy is drawn as the physics proxy,
// never as a body; in a cloth it can slip out of, it is painted brown)
const bare = () => state.outfit === 'none';
// the anatomy's rest, degrees forward off the body's down: with physics on,
// a bias the tissue leans toward (gravity and the body do the rest); with it
// off, the fixed angle it is held at
const ANIMATED = { walk: 1, jog: 1, rope: 1, jump: 1, climb: 1 };
const REST = { stand: 0, walk: 0, jog: 0, rope: 0, jump: 0, climb: 0, seat: 40, hung: 0 };
const REST_FIXED = { stand: 0, walk: 0, jog: 0, rope: 0, jump: 0, climb: 0, seat: 80, hung: 150 };

const VARS = Object.keys(FACE_VARIANTS);
const state = {
  look: 'ink', pose: 'stand', outfit: 'loin', face: 'auto', focus: -1, frame: 'all', physics: true,
  rest: Object.assign({}, REST), restFixed: Object.assign({}, REST_FIXED), hungMode: 'physics', paused: false,
  // the GPU cloth's hydrostatic state over the fork, 0 slack to 1 firm (the Firm slider)
  firm: 0.4,
  // (None's paint: 'orange' see-through, 'split' lobes blue/red and the
  // pouch orange, 'brown' opaque - nothing bare in a physics test)
  paint: 'orange',
  // (the line's faces: 'auto' each man his own variant, or one for all)
  shape: 'auto',
  // two models side by side, each with its own build, face and values
  compare: false,
  models: [{ man: 2, face: 'plain', params: getAnatomy() }, { man: 2, face: 'square', params: getAnatomy() }]
};
const restOf = () => (state.physics && !(state.pose === 'hung' && state.hungMode === 'valley') ? state.rest : state.restFixed);

// ---------- renderer, scene ----------
const canvas = document.getElementById('labCanvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(36, 1, 2, 9000);

const kit = valleyKit();
// (the old man's hair: the hair's own plate, cut lighter)
kit.hairGrey = kit.hair.clone(); kit.hairGrey.userData.burin = true; kit.hairGrey.uniforms.uTone.value = 0.08;

// the studio's clay, one per plate (the ink plates mapped by their kit name)
const clay = (c, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.82, metalness: 0 }, o));
const STUDIO = {
  flesh: clay(0xb8a28c), fleshUV: clay(0xb8a28c), face: clay(0xbda792), skin: clay(0xb8a28c),
  linen: clay(0xd8d2c4), breech: clay(0x6f6457), hair: clay(0x3b332c), hairGrey: clay(0xb3afa8),
  bone: clay(0xe6dccb), raw: clay(0x7c2424), rawUV: clay(0x7c2424), muscle: clay(0x9a4a40), muscleUV: clay(0x9a4a40),
  ink: new THREE.MeshBasicMaterial({ color: 0x17110e }), post: clay(0x5c4a3a), wood: clay(0x5c4a3a), rope: clay(0x8a7a5e),
  areola: clay(0x9a7462), lip: clay(0xae8a78),
  floor: clay(0x34343a), wall: clay(0x45454c)
};
const toStudio = new Map(), toInk = new Map();
Object.keys(kit).forEach(k => { if (STUDIO[k]) { toStudio.set(kit[k], STUDIO[k]); toInk.set(STUDIO[k], kit[k]); } });

// lights for the studio (the ink plates light themselves from their own key)
const hemi = new THREE.HemisphereLight(0xf2ece2, 0x2a2826, 1.1); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff4e6, 2.4);
sun.position.set(-260, 420, -360); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -460, right: 460, top: 300, bottom: -60, near: 50, far: 1400 });
sun.shadow.bias = -0.0006; scene.add(sun); scene.add(sun.target);
const fill = new THREE.DirectionalLight(0xdfe6ff, 0.6); fill.position.set(320, 160, -200); scene.add(fill);

// ---------- the room ----------
const room = new THREE.Group(); scene.add(room);
const W = SPACING * (MEN.length + 1) + 200;
const floorInk = engravingMaterial({ freq: 0.9, angle: 0.5, tone: 0.06, wobble: 0.6, sky: 0.3, keyI: 0.9, axis: [1, 0, 0.35] });
const wallInk = paperMaterial();
const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, 900), floorInk); floor.rotation.x = -PI / 2; floor.position.z = 140; floor.receiveShadow = true; room.add(floor);
const wall = new THREE.Mesh(new THREE.PlaneGeometry(W, 520), wallInk); wall.position.set(0, 260, 190); wall.rotation.y = PI; wall.receiveShadow = true; room.add(wall);
floor.userData.ink = floorInk; floor.userData.studio = STUDIO.floor; wall.userData.ink = wallInk; wall.userData.studio = STUDIO.wall;

// ---------- the men ----------
const seeded = seed => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
// (the first man on the left as you face the line: the camera looks down +z, so screen-left is +x)
const xOf = i => ((MEN.length - 1) / 2 - i) * SPACING;
function mkSlot(i, x, k) {
  const m = MEN[i];
  const g = new THREE.Group(); g.position.x = x; g.userData.slot = k == null ? i : k; scene.add(g);
  const h = m.build.height;
  // the seat: a block under the thighs, its top at the thighs' undersides
  const seat = new THREE.Mesh(new THREE.BoxGeometry(52 * h, 41 * h, 58 * h), kit.wood);
  seat.position.set(0, 20.5 * h, -6 * h); seat.castShadow = seat.receiveShadow = true; seat.visible = false; g.add(seat);
  // the gallows: two posts and a beam, the ankles roped to it
  const gal = new THREE.Group(); gal.visible = false; g.add(gal);
  const H = 214 * h;
  [-1, 1].forEach(s => { const p = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.6, H + 10, 8), kit.post); p.position.set(s * 44 * h, H / 2, 0); p.castShadow = true; gal.add(p); });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 96 * h, 8), kit.post); beam.position.y = H; beam.rotation.z = PI / 2; beam.castShadow = true; gal.add(beam);
  // the ladder (climbing in place: its rungs run down past him as he climbs)
  const lad = new THREE.Group(); lad.visible = false; lad.position.z = -30 * h; g.add(lad);
  [-1, 1].forEach(s => { const r = new THREE.Mesh(new THREE.BoxGeometry(4, 330 * h, 5), kit.wood); r.position.set(s * 26 * h, 165 * h, 0); r.castShadow = true; lad.add(r); });
  const rungs = []; for (let k = 0; k < 11; k++) { const r = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 52 * h, 8), kit.wood); r.rotation.z = PI / 2; r.castShadow = true; lad.add(r); rungs.push(r); }
  // the skipping rope (rebuilt each frame between his hands)
  const rope = new THREE.Mesh(new THREE.BufferGeometry(), kit.rope); rope.visible = false; rope.frustumCulled = false; g.add(rope);
  return { i, k, g, man: null, seat, gal, H, lad, rungs, rope, sim: null };
}
const slots = MEN.map((m, i) => mkSlot(i, xOf(i)));
// the comparison's two models, A on the left as you face them
const CMP_X = 62;
const cmpSlots = [null, null];
function makeCmp(k) {
  const old = cmpSlots[k];
  if (old) { scene.remove(old.g); old.g.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
  const s = mkSlot(state.models[k].man, k ? -CMP_X : CMP_X, k); s.g.visible = state.compare; cmpSlots[k] = s;
  // (its place in the world now, before the first pose reads it: the joints'
  // sleeves are laid from it, and a new group's world matrix is stale until a render)
  s.g.updateMatrixWorld(true);
  return s;
}
makeCmp(0); makeCmp(1);
const active = () => state.compare ? cmpSlots : slots;
const nameOf = s => s.k != null ? `${'AB'[s.k]} · ${MEN[s.i].name}` : MEN[s.i].name;
const figures = [];   // (the overlay's live list - refilled in place on a rebuild)
const cmpFigs = [[], []];   // (each model's, likewise)

// (a man's face variant: a model's own, or the line's pick - each his own by default)
const faceVarOf = s => s.k != null ? state.models[s.k].face : (state.shape === 'auto' ? VARS[s.i % VARS.length] : state.shape);
function build(s) {
  const m = MEN[s.i], i = s.i;
  if (s.man) { s.g.remove(s.man); s.man.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
  const man = buildFigure(kit, seeded(101 + i * 7), Object.assign({
    build: m.build, beard: !!m.beard, recede: m.recede || 0, hairMat: m.grey ? kit.hairGrey : kit.hair,
    // (every man the sliders' values exactly - no per-man scatter, so the
    // line compares; a model its own panel's)
    anatomy: s.k != null ? Object.assign({}, state.models[s.k].params) : getAnatomy(),
    face: state.face === 'valley' ? 'valley' : undefined, faceVar: faceVarOf(s)
  }, OUTFITS[state.outfit]));
  const u = man.userData;
  if (u.pouch) { u.pouch0 = u.pouch.position.clone(); }
  // the ropes round his ankles, for the gallows
  u.ropes = ['l', 'r'].map(k => { const r = new THREE.Mesh(new THREE.TorusGeometry(6.4, 0.9, 6, 12), kit.rope); r.position.y = 2; r.rotation.x = PI / 2; r.visible = false; u.legs[k].foot.add(r); return r; });
  s.g.add(man); s.man = man;
  if (u.cloth && u.cloth.setState) u.cloth.setState(state.firm);
  s.sim = u.pouch ? new FleshSim(man) : null;
  if (bare()) proxy(man);
  setFaceOf(man);
  applyLook(man);
  return man;
}
// the face: by the pose unless one is picked - calm standing, walking or
// seated; effort in a jog, a skip, a jump or a climb; strain hung head down
// ('valley': the valley's own head, its scream, for comparison - a rebuild)
const faceFor = () => state.face !== 'auto' ? state.face : ({ jog: 'effort', rope: 'effort', jump: 'effort', climb: 'effort', hung: 'pain' })[state.pose] || 'calm';
function setFaceOf(man) { if (man.userData.setFace && state.face !== 'valley') man.userData.setFace(faceFor()); }
function buildAll() {
  figures.length = 0; cmpFigs.forEach(a => { a.length = 0; });
  slots.forEach(s => { s.g.visible = !state.compare; }); cmpSlots.forEach(s => { s.g.visible = state.compare; });
  active().forEach(s => { const man = build(s); if (man.userData.pouch) (s.k != null ? cmpFigs[s.k] : figures).push(man); });
  pose(0, true);
}
// (one man again - a model whose build or face changed)
function rebuildOne(s) {
  const man = build(s), list = s.k != null ? cmpFigs[s.k] : figures;
  const at = list.indexOf(man); if (s.k != null) { list.length = 0; if (man.userData.pouch) list.push(man); } else if (at < 0 && man.userData.pouch) list.push(man);
  pose(0, true);
}

// ---------- None: the anatomy as a physics proxy ----------
// (with no fabric the lab draws the anatomy as see-through debug shapes - the
// mass, the shaft, the lobes - moving exactly as the simulation moves them,
// in either look: it is a readout of the physics, not a body)
const proxyMat = (c, e) => new THREE.MeshStandardMaterial({ color: c, emissive: e, transparent: true, opacity: 0.5, depthWrite: false, roughness: 0.6 });
const wireMat = c => new THREE.MeshBasicMaterial({ color: c, wireframe: true, transparent: true, opacity: 0.55 });
const PROXY = { orange: proxyMat(0xff7a1a, 0x5a2200), L: proxyMat(0x2f7bff, 0x0a2260), R: proxyMat(0xff2f2f, 0x5a0808) };
const PROXY_WIRE = { orange: wireMat(0xffb070), L: wireMat(0x8fb8ff), R: wireMat(0xff9a9a) };
// (brown: opaque paint, no wire - what the cloth's slip paint is in a garment)
// (the ink look has no lights: there it is a flat paint; the studio lights it)
const BROWN = { ink: new THREE.MeshBasicMaterial({ color: 0x5b4030 }), studio: new THREE.MeshStandardMaterial({ color: 0x5b4030, roughness: 0.9 }) };
function proxy(man) {
  const P = man.userData.pouch; if (!P) return;
  const brown = state.paint === 'brown';
  P.traverse(o => {
    if (!o.isMesh || o.userData.wire === true) return;
    if (o.userData.outline) { o.visible = false; o.userData.ink = o.userData.studio = null; o.userData.proxyHidden = true; return; }
    const part = state.paint === 'split' && o.userData.side ? o.userData.side : 'orange';
    const ink = brown ? BROWN.ink : PROXY[part], studio = brown ? BROWN.studio : PROXY[part];
    o.material = state.look === 'studio' ? studio : ink; o.userData.ink = ink; o.userData.studio = studio;
    if (!o.userData.wire) { const w = new THREE.Mesh(o.geometry, PROXY_WIRE[part]); w.userData.wire = true; o.userData.wire = w; o.add(w); }
    const w = o.userData.wire; w.material = PROXY_WIRE[part]; w.userData.ink = w.userData.studio = PROXY_WIRE[part]; w.visible = !brown; w.userData.proxyHidden = brown;
  });
}
function setPaint(p) { state.paint = p; if (bare()) active().forEach(s => { proxy(s.man); applyLook(s.man); }); dirty = true; }

// ---------- looks ----------
function applyLook(root) {
  const studio = state.look === 'studio';
  root.traverse(o => {
    if (!o.isMesh) return;
    if (o.userData.proxyHidden) { o.visible = false; return; }
    if (o.userData.wire === true) { o.visible = true; return; }
    if (o.userData.outline) { o.visible = !studio; return; }
    // (the GPU cloth: its ink plate and a studio clay on the same uniforms)
    if (o.userData.ucm && !o.userData.ink) { o.userData.ink = o.material; o.userData.studio = o.userData.ucm.twin(STUDIO[o.userData.studioKey] || STUDIO.linen).material; }
    if (o.userData.ink) { o.material = studio ? o.userData.studio : o.userData.ink; o.castShadow = o.receiveShadow = studio; return; }
    // (a mesh built since the last switch carries whichever plate it was
    // made with: find its ink plate either way)
    if (!o.userData.inkMat) o.userData.inkMat = toInk.get(o.material) || o.material;
    const ink = o.userData.inkMat;
    o.material = studio ? (toStudio.get(ink) || STUDIO[ink.userData && ink.userData.studioKey] || STUDIO.flesh) : ink;
    o.castShadow = o.receiveShadow = studio;
  });
}
function setLook(look) {
  state.look = look;
  const studio = look === 'studio';
  renderer.toneMapping = studio ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = studio;
  scene.background = studio ? new THREE.Color(0x2b2b30) : BONE.clone();
  [hemi, sun, fill].forEach(l => { l.visible = studio; });
  applyLook(scene);
  dirty = true;
}

// ---------- poses ----------
function rest(u) {
  u.hips.position.y = BODY_HIPS; u.hips.rotation.set(0, 0, 0); u.neck.rotation.set(0, 0, 0); u.head.rotation.set(0, 0, 0);
  ['l', 'r'].forEach(s => {
    u.arms[s].sh.rotation.set(0, 0, 0); u.arms[s].el.rotation.set(0, 0, 0); u.arms[s].hand.rotation.set(0, 0, 0);
    u.legs[s].hip.rotation.set(0, 0, 0); u.legs[s].kn.rotation.set(0, 0, 0); u.legs[s].foot.rotation.set(0, 0, 0);
  });
  if (u.pouch) { u.pouch.position.copy(u.pouch0); u.pouch.rotation.set(0, 0, 0); }
}
// the anatomy held still at its rest (physics off, or the valley's flip):
// the shaft and the lobes back where they were built
function stillFlesh(u) {
  const g = u.pouch && u.pouch.children[0]; if (!g) return;
  const d = g.userData;
  if (d.bendShaft) d.bendShaft(null);
  else if (d.shaft) { d.shaft.quaternion.identity(); d.shaft.position.set(0, 0, 0); }
  (d.lobes || []).forEach(l => { if (l.userData.p0) l.position.copy(l.userData.p0); });
  if (d.updateSac) d.updateSac();
  // (no swing: the cloth hangs at its rest)
  u.swing = null;
}
// (age carries the head forward and eases the knees; the face is lifted
// back to look ahead)
function posture(u, kneeToo) {
  const a = Math.max(0, (u.build && u.build.age) || 0);
  u.neck.rotation.x += -0.3 * a; u.head.rotation.x += 0.24 * a;
  if (kneeToo) { ['l', 'r'].forEach(s => { u.legs[s].hip.rotation.x += 0.1 * a; u.legs[s].kn.rotation.x += KNEE_BACK * 0.16 * a; u.legs[s].foot.rotation.x += 0.06 * a; }); u.hips.position.y -= 1.6 * a; }
}
const swayOf = u => { const g = u.pouch && u.pouch.children[0]; return (g && g.userData.sway) || 1; };
const clamp01 = x => Math.max(0, Math.min(1, x));
const smooth = x => { x = clamp01(x); return x * x * (3 - 2 * x); };
// a crouch c 0..1: the hips sink, thighs forward, knees and ankles fold, the
// trunk leans over the knees (the legs turned back to keep the shins upright)
function crouch(u, c) {
  u.hips.position.y -= 24 * c;
  u.hips.rotation.x = -0.42 * c;
  ['l', 'r'].forEach(k => { u.legs[k].hip.rotation.x = 1.15 * c + 0.42 * c; u.legs[k].kn.rotation.x = KNEE_BACK * 1.9 * c; u.legs[k].foot.rotation.x = 0.33 * c; });
}

function poseMan(s, t) {
  const man = s.man, u = man.userData, h = MEN[s.i].build.height, P = state.pose;
  man.rotation.set(0, 0, 0); man.position.set(0, 0, 0);
  rest(u);
  s.seat.visible = P === 'seat'; s.gal.visible = P === 'hung'; s.lad.visible = P === 'climb'; s.rope.visible = P === 'rope';
  u.ropes.forEach(r => { r.visible = P === 'hung'; });
  const restA = restOf()[P] * DEG;
  const ph0 = s.i * 0.37;   // (each man a little out of step with the next)
  if (P === 'stand') {
    // at ease, his weight on one leg: the free hip dropped and that knee
    // eased forward, the arms slack at his sides
    const tilt = -0.12;
    u.hips.position.y = BODY_HIPS - 1.8; u.hips.rotation.z = tilt;
    u.arms.l.sh.rotation.set(0.06, 0, 0.1 - tilt); u.arms.r.sh.rotation.set(0.1, 0, -0.12 - tilt);
    u.arms.l.el.rotation.x = 0.28; u.arms.r.el.rotation.x = 0.35;
    u.legs.l.hip.rotation.set(0.24, 0, 0.05 - tilt); u.legs.l.kn.rotation.x = KNEE_BACK * 0.45; u.legs.l.foot.rotation.x = -0.28;
    u.legs.r.hip.rotation.set(-0.03, 0, -0.03 - tilt);
    posture(u, true);
  } else if (P === 'walk') {
    // a walk in place: the legs' swing, the knee folding behind, the arms
    // against the legs, the hips' rise and turn
    const w = (t + ph0) * 2 * PI * 0.85, sn = Math.sin(w), cs = Math.cos(w);
    u.hips.position.y = BODY_HIPS - 2.2 + Math.abs(cs) * 2.0;
    u.hips.rotation.y = sn * 0.07; u.hips.rotation.z = cs * 0.035;
    u.legs.l.hip.rotation.x = sn * 0.46; u.legs.r.hip.rotation.x = -sn * 0.46;
    u.legs.l.kn.rotation.x = KNEE_BACK * (Math.max(0, -cs) * 0.85 + 0.06); u.legs.r.kn.rotation.x = KNEE_BACK * (Math.max(0, cs) * 0.85 + 0.06);
    ['l', 'r'].forEach(k => { u.legs[k].foot.rotation.x = -(u.legs[k].hip.rotation.x + u.legs[k].kn.rotation.x) * 0.7; });
    u.arms.l.sh.rotation.set(-sn * 0.34, 0, 0.08); u.arms.r.sh.rotation.set(sn * 0.34, 0, -0.08);
    u.arms.l.el.rotation.x = 0.3 + Math.max(0, sn) * 0.3; u.arms.r.el.rotation.x = 0.3 + Math.max(0, -sn) * 0.3;
    posture(u, false);
    if (!state.physics && u.pouch) { const k = swayOf(u), q = w - 0.6; u.pouch.rotation.z = Math.sin(q) * 0.07 * k; u.pouch.rotation.x = Math.abs(Math.sin(q)) * 0.05 * k; }
  } else if (P === 'jog') {
    // a jog in place: knees driven up, the shin folding hard behind on the
    // swing, a flight between strides (the whole man off the floor), the
    // trunk a little forward, the arms bent at a right angle, driving
    const w = (t + ph0) * 2 * PI * 1.35, sn = Math.sin(w), cs = Math.cos(w);
    const air = Math.max(0, Math.abs(cs) - 0.55) / 0.45;   // (the flight, at each crossing)
    man.position.y = 4.5 * h * air * air;
    u.hips.position.y = BODY_HIPS - 3.5 + 2.5 * air;
    u.hips.rotation.x = -0.12; u.hips.rotation.y = sn * 0.1; u.hips.rotation.z = cs * 0.04;
    u.legs.l.hip.rotation.x = 0.12 + 0.62 * sn + 0.3 * Math.max(0, sn); u.legs.r.hip.rotation.x = 0.12 - 0.62 * sn + 0.3 * Math.max(0, -sn);
    u.legs.l.kn.rotation.x = KNEE_BACK * (0.2 + 1.55 * Math.max(0, -cs * 0.6 + sn * 0.8)); u.legs.r.kn.rotation.x = KNEE_BACK * (0.2 + 1.55 * Math.max(0, cs * 0.6 - sn * 0.8));
    ['l', 'r'].forEach(k => { u.legs[k].foot.rotation.x = -(u.legs[k].hip.rotation.x + u.legs[k].kn.rotation.x) * 0.55 + 0.2; });
    u.arms.l.sh.rotation.set(-sn * 0.62 + 0.1, 0, 0.12); u.arms.r.sh.rotation.set(sn * 0.62 + 0.1, 0, -0.12);
    u.arms.l.el.rotation.x = 1.45 + sn * 0.15; u.arms.r.el.rotation.x = 1.45 - sn * 0.15;
    u.arms.l.hand.userData.grip(0.7); u.arms.r.hand.userData.grip(0.7);
  } else if (P === 'rope') {
    // skipping: both feet together, a small hop each turn of the rope; up
    // on the toes in the air, the knees giving on the landing; the upper
    // arms close in, the hands out low turning the rope from the wrists
    const f = 2.0, q = ((t + ph0) * f) % 1, airT = 0.42;
    const air = q < airT ? Math.sin(PI * q / airT) : 0, give = q >= airT ? Math.sin(PI * (q - airT) / (1 - airT)) : 0;
    man.position.y = 9 * h * air;
    u.hips.position.y = BODY_HIPS - 4.5 * give;
    ['l', 'r'].forEach(k => { u.legs[k].hip.rotation.x = 0.06 + 0.32 * give; u.legs[k].kn.rotation.x = KNEE_BACK * (0.1 + 0.62 * give); u.legs[k].foot.rotation.x = 0.26 * give - 0.38 * air; });
    u.arms.l.sh.rotation.set(0.25, 0, 0.42); u.arms.r.sh.rotation.set(0.25, 0, -0.42);
    u.arms.l.el.rotation.x = 1.0; u.arms.r.el.rotation.x = 1.0;
    u.arms.l.hand.userData.grip(0.9); u.arms.r.hand.userData.grip(0.9);
    // the rope: through both hands, round the line between them, under his
    // feet while he is in the air (q = airT/2)
    man.updateMatrixWorld(true);
    const hl = new THREE.Vector3(0, -8, 2), hr = new THREE.Vector3(0, -8, 2);
    u.arms.l.hand.localToWorld(hl); u.arms.r.hand.localToWorld(hr); s.g.worldToLocal(hl); s.g.worldToLocal(hr);
    const th = 2 * PI * (q - airT / 2), mid = hl.clone().add(hr).multiplyScalar(0.5), R = mid.y + 4;
    const dir = new THREE.Vector3(0, -Math.cos(th), -Math.sin(th)), pts = [];
    for (let k = 0; k <= 24; k++) { const a = k / 24; pts.push(hl.clone().lerp(hr, a).addScaledVector(dir, R * Math.sin(PI * a) * 0.98)); }
    s.rope.geometry.dispose(); s.rope.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.55, 5, false);
  } else if (P === 'jump') {
    // a standing jump, every 2.6s: settle, crouch with the arms swung back,
    // drive up through the toes, the flight (a true fall: 980 cm/s/s), the
    // landing taken in a deep crouch, and up again
    const T = (t + ph0 * 1.7) % 2.6, Tf = 0.5, v0 = 980 * Tf / 2;
    let c = 0, y = 0, arms = 0;
    if (T < 0.35) { c = 0; arms = 0; }
    else if (T < 0.85) { const k = smooth((T - 0.35) / 0.5); c = 0.75 * k; arms = -k; }
    else if (T < 0.98) { const k = smooth((T - 0.85) / 0.13); c = 0.75 * (1 - k) - 0.12 * k; arms = -1 + 3.6 * k; }
    else if (T < 0.98 + Tf) { const tt = T - 0.98; y = v0 * tt - 490 * tt * tt; c = -0.12 + 0.3 * smooth(tt / Tf); arms = 2.6 - 1.2 * smooth(tt / Tf); }
    else if (T < 1.75) { const k = (T - 0.98 - Tf) / (1.75 - 0.98 - Tf); c = 0.85 * Math.sin(PI * Math.min(1, k * 1.4) * 0.5 + 0.0) * (1 - 0.15 * k); arms = 1.4 - 0.8 * k; }
    else { const k = smooth((T - 1.75) / 0.85); c = 0.72 * (1 - k); arms = 0.6 * (1 - k); }
    man.position.y = y * h;
    if (c >= 0) crouch(u, c); else ['l', 'r'].forEach(k => { u.legs[k].foot.rotation.x = 0.9 * c; });   // (up on the toes)
    u.arms.l.sh.rotation.set(arms, 0, 0.1); u.arms.r.sh.rotation.set(arms, 0, -0.1);
    u.arms.l.el.rotation.x = 0.25 + 0.2 * Math.abs(arms) / 2.6; u.arms.r.el.rotation.x = u.arms.l.el.rotation.x;
  } else if (P === 'climb') {
    // up a ladder in place (the rungs run down past him): one knee driven
    // high to the next rung, near the belly, while the other leg straightens
    // under him; the opposite hand reaching for the rung overhead
    const per = 1.7, q = ((t + ph0) / per) % 1, rise = 60 * h;
    man.position.y = 42 * h;
    s.rungs.forEach((r, k) => { r.position.y = ((k * 30 * h - q * rise) % (330 * h) + 330 * h) % (330 * h); });
    const side = q < 0.5 ? 1 : -1, k2 = (q % 0.5) / 0.5, lift = Math.sin(PI * k2);
    u.hips.rotation.x = -0.1;
    const up = { l: side > 0 ? lift : 0, r: side < 0 ? lift : 0 };
    ['l', 'r'].forEach(k => {
      const L = up[k], base = 0.35 * (1 - (up.l + up.r));
      u.legs[k].hip.rotation.x = 0.1 + 1.55 * L + base; u.legs[k].kn.rotation.x = KNEE_BACK * (0.25 + 2.0 * L + base * 1.4); u.legs[k].foot.rotation.x = 0.4 * L;
    });
    const reachL = side < 0 ? lift : 0, reachR = side > 0 ? lift : 0;
    u.arms.l.sh.rotation.set(2.25 + 0.6 * reachL, 0, 0.12); u.arms.r.sh.rotation.set(2.25 + 0.6 * reachR, 0, -0.12);
    u.arms.l.el.rotation.x = 0.95 - 0.7 * reachL; u.arms.r.el.rotation.x = 0.95 - 0.7 * reachR;
    u.arms.l.hand.userData.grip(1); u.arms.r.hand.userData.grip(1);
  } else if (P === 'seat') {
    // on the block: the thighs out level, the shins down, the hands on the knees
    u.hips.position.y = 53.3;
    ['l', 'r'].forEach(k => { u.legs[k].hip.rotation.x = 1.45; u.legs[k].kn.rotation.x = KNEE_BACK * 1.45; });
    u.legs.l.hip.rotation.z = 0.06; u.legs.r.hip.rotation.z = -0.06;
    u.arms.l.sh.rotation.set(0.95, 0, 0.16); u.arms.r.sh.rotation.set(0.95, 0, -0.16);
    u.arms.l.el.rotation.x = 0.45; u.arms.r.el.rotation.x = 0.45;
    posture(u, false);
  } else if (P === 'hung') {
    // head down from the beam by the ankles, as the sawyer hangs
    man.rotation.z = PI; man.position.y = s.H + 4 * h;
    u.legs.l.hip.rotation.z = 0.36; u.legs.r.hip.rotation.z = -0.36;
    u.legs.l.kn.rotation.x = KNEE_BACK * 0.2; u.legs.r.kn.rotation.x = KNEE_BACK * 0.2;
    u.arms.l.sh.rotation.set(0.1, 0, PI - 0.3); u.arms.r.sh.rotation.set(0.1, 0, -(PI - 0.34));
    u.arms.l.el.rotation.x = 0.38; u.arms.r.el.rotation.x = 0.44;
    u.neck.rotation.x = 0.55;
  }
  // the anatomy: simulated, or held
  if (u.pouch) {
    const valley = P === 'hung' && state.hungMode === 'valley';
    if (valley) { stillFlesh(u); u.pouch.rotation.set(0.14, 0, PI); u.pouch.position.set(0, -13.0, -11.0); }
    else if (!state.physics) { stillFlesh(u); const lift = u.lift || 0; if (P !== 'walk') u.pouch.rotation.x = restA + lift; else u.pouch.rotation.x += restA + lift; }
    else if (s.sim) s.sim.rest = restA;
  }
  updateSleeves(man);
}
let tAnim = 0, awake = 0;
// the hold readout: for the man in focus (or the first), how far the anatomy
// is swung off its rest now, the most over the last three seconds, and how
// far his fabric lets it go
const holdLog = [];
function holdReadout(now) {
  const el = document.getElementById('hold'); if (!el) return;
  const s = active()[Math.max(0, state.focus)], u = s.man.userData, P = u.pouch;
  if (!P || !s.sim || !physicsOn(s)) { el.textContent = state.physics ? '' : 'Physics off: held at the rest angle'; return; }
  const swing = (s.sim.swing || 0) * 180 / Math.PI;
  holdLog.push([now, swing]); while (holdLog.length && now - holdLog[0][0] > 3000) holdLog.shift();
  const peak = Math.max(...holdLog.map(h => h[1]));
  const sup = u.support, fabric = state.outfit === 'both' ? 'Shirt + hose' : (u.hold && u.hold.name) || state.outfit;
  el.textContent = `${nameOf(s)} · ${fabric}: swing ${swing.toFixed(0)}° · peak ${peak.toFixed(0)}° (3s) · hold ${!sup || sup >= 180 ? 'none' : sup + '° max'}${u.lift ? ', lifted ' + Math.round(u.lift * 180 / Math.PI) + '°' : ''}`;
}
function physicsOn(s) { return state.physics && s.sim && !(state.pose === 'hung' && state.hungMode === 'valley'); }
function pose(dt, fresh) {
  if (ANIMATED[state.pose] && !state.paused) tAnim += dt;
  active().forEach(s => {
    poseMan(s, tAnim);
    if (!physicsOn(s)) return;
    if (fresh) { s.sim.reset(); awake = 2; }   // (let it settle into the new pose under gravity)
    // (the seat and the floor to lie on)
    s.sim.boxes.length = 0;
    if (state.pose === 'seat') { s.seat.updateMatrixWorld(true); s.sim.boxes.push(new THREE.Box3().setFromObject(s.seat)); }
    if (s.sim.step(fresh ? 0 : dt)) awake = 0.6;
  });
  // the cloth over each man, fitted to where his body and anatomy are now
  active().forEach(s => { const c = s.man && s.man.userData.cloth; if (c) c.update(fresh ? 0 : dt); });
  // (and the soft tissue of each skin, from the body's motion)
  active().forEach(s => { const f = s.man && s.man.userData.soft; if (f) { if (fresh) f.reset(); f.update(fresh ? 0 : dt); } });
  dirty = true;
}

// ---------- the camera: only where you send it ----------
const view = { target: new THREE.Vector3(0, 95, 0), dist: 900, yaw: 0, pitch: 0.12 };
const labKey = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
let tween = null;
// the clear strip of screen between the slider panel (or the top bar) and
// the dock: the view is centred in it and a man fitted to its height
function band() {
  const H = window.innerHeight, Wd = window.innerWidth, bar = $('#bar'), dock = $('#dock');
  let top = bar && !bar.classList.contains('hidden') ? bar.getBoundingClientRect().bottom : 0;
  // (a panel docked across the top pushes the strip down; one at a side
  // narrows it - while it is open; one under the view is in the dock)
  let left = 0, right = Wd;
  document.querySelectorAll('.dev-anatomy-panel').forEach(over => {
    const r = over.getBoundingClientRect(), d = over.dataset.dock;
    if (d === 'top') top = Math.max(top, r.bottom);
    else if (r.height > 60 && d === 'left') left = Math.max(left, r.right);
    else if (r.height > 60 && d === 'right') right = Math.min(right, r.left);
  });
  const bottom = dock && !dock.classList.contains('hidden') ? dock.getBoundingClientRect().top : H;
  const t = Math.min(top + 8, H * 0.6), b = Math.max(bottom - 8, t + H * 0.25);
  const l = Math.min(left + 8, Wd * 0.4), rr = Math.max(right - 8, l + Wd * 0.3);
  return { H, W: Wd, cy: (t + b) / 2, frac: (b - t) / H, cx: (l + rr) / 2, fw: (rr - l) / Wd };
}
// (the projection's centre slid into the strip - down, and across past a
// side panel; its inverse kept for the taps' rays)
function aimIntoBand() {
  const { H, W, cy, cx } = band();
  camera.updateProjectionMatrix();
  camera.projectionMatrix.elements[9] = -(1 - 2 * cy / H);
  camera.projectionMatrix.elements[8] = -(2 * cx / W - 1);
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
}
function framing(frame, i) {
  const B = band(), tanV = Math.tan(camera.fov * DEG / 2), tanH = tanV * camera.aspect * B.fw, frac = B.frac;
  if (frame === 'all' || i < 0) {
    const half = state.compare ? CMP_X + 70 : SPACING * MEN.length / 2 + 40;
    // (the two models: fitted to their height in the strip, and to their width)
    if (state.compare) return { target: new THREE.Vector3(0, 98, 0), dist: Math.max(half / tanH, 112 / (tanV * frac)) * 1.04, yaw: 0, pitch: 0.08 };
    return { target: new THREE.Vector3(0, 100, 0), dist: Math.max(half / tanH, 600) * 1.02, yaw: 0, pitch: 0.12 };
  }
  const s = active()[i];
  s.man.updateMatrixWorld(true);
  if (frame === 'close' && s.man.userData.pouch) {
    const p = new THREE.Vector3(); s.man.userData.pouch.getWorldPosition(p);
    const look = state.pose === 'hung' ? p.clone().add(new THREE.Vector3(0, -8, 0)) : p.clone().add(new THREE.Vector3(0, -6, 0));
    // (from the side for the hung man - which way it falls is front or
    // back; three-quarters for the rest; a little from above on the seat)
    const yaw = state.pose === 'hung' ? 1.35 : 0.6, pitch = state.pose === 'seat' ? 0.45 : 0.08;
    return { target: look, dist: Math.max(60, (state.pose === 'hung' ? 30 : 22) / (tanV * frac)), yaw, pitch };
  }
  const box = new THREE.Box3().setFromObject(s.man), c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
  const d = Math.max((sz.y * 0.54) / (tanV * frac), (Math.max(sz.x, 60) * 0.62) / tanH) + sz.z / 2;
  return { target: c, dist: d, yaw: view.yaw, pitch: 0.08 };
}
function goTo(frame, i) {
  state.frame = frame; state.focus = i;
  // (a close-up has the man to himself: the rest of the line steps out of
  // the way, so a side view isn't looking down a row of men)
  active().forEach((s, j) => { s.g.visible = frame !== 'close' || i < 0 || j === i; });
  const to = framing(frame, i);
  tween = { t0: performance.now(), from: { target: view.target.clone(), dist: view.dist, yaw: view.yaw, pitch: view.pitch }, to };
  ui.syncFrame();
}
const ease = x => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
function placeCamera() {
  const { target, dist, yaw, pitch } = view;
  camera.position.set(target.x - Math.sin(yaw) * Math.cos(pitch) * dist, target.y + Math.sin(pitch) * dist, target.z - Math.cos(yaw) * Math.cos(pitch) * dist);
  camera.lookAt(target);
}

// drag to look round, pinch (or the wheel) to come closer, tap a man to go to him
const pts = new Map(); let gesture = null;
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  gesture = { moved: 0, t0: performance.now(), pinch: pts.size === 2 ? pinchDist() : 0, dist: view.dist };
});
canvas.addEventListener('pointermove', e => {
  const p = pts.get(e.pointerId); if (!p || !gesture) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
  gesture.moved += Math.abs(dx) + Math.abs(dy);
  tween = null;
  if (pts.size === 2) { if (gesture.pinch) view.dist = Math.min(4200, Math.max(40, gesture.dist * gesture.pinch / pinchDist())); }
  else { view.yaw -= dx * 0.006; view.pitch = Math.min(1.2, Math.max(-0.4, view.pitch + dy * 0.005)); }
  dirty = true;
});
const end = e => {
  pts.delete(e.pointerId);
  if (gesture && pts.size === 0 && gesture.moved < 8 && performance.now() - gesture.t0 < 350) tapAt(e.clientX, e.clientY);
  if (pts.size === 0) gesture = null; else if (gesture) { gesture.pinch = 0; }
};
canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
canvas.addEventListener('wheel', e => { e.preventDefault(); tween = null; view.dist = Math.min(4200, Math.max(40, view.dist * Math.exp(e.deltaY * 0.001))); dirty = true; }, { passive: false });
function pinchDist() { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; }
const ray = new THREE.Raycaster();
function tapAt(x, y) {
  const r = canvas.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2((x - r.left) / r.width * 2 - 1, -((y - r.top) / r.height) * 2 + 1), camera);
  const hits = ray.intersectObjects(active().map(s => s.man), true);
  for (const h of hits) { let o = h.object; while (o && o.userData.slot == null) o = o.parent; if (o) { goTo(state.frame === 'close' ? 'close' : 'full', o.userData.slot); return; } }
}

// ---------- the dock ----------
const $ = sel => document.querySelector(sel);
const ui = {
  syncFrame() {
    $('#who').textContent = state.focus < 0 ? (state.compare ? 'A · B' : 'All') : nameOf(active()[state.focus]);
    document.querySelectorAll('[data-frame]').forEach(b => b.classList.toggle('on', b.dataset.frame === (state.focus < 0 ? 'all' : state.frame)));
  },
  tools() {
    const box = $('#tools'); box.innerHTML = '';
    const p = state.pose;
    const add = html => { const d = document.createElement('div'); d.innerHTML = html; while (d.firstChild) box.appendChild(d.firstChild); };
    if (ANIMATED[p]) add(`<button type="button" class="chip" id="pause">${state.paused ? '▶ Play' : '❚❚ Pause'}</button>`);
    add(`<button type="button" class="chip ${state.physics ? 'on' : ''}" id="phys">Physics ${state.physics ? 'on' : 'off'}</button>`);
    if (p === 'hung') add(`<span class="seg"><button type="button" data-hm="physics" class="${state.hungMode === 'physics' ? 'on' : ''}">Falls</button><button type="button" data-hm="valley" class="${state.hungMode === 'valley' ? 'on' : ''}">Valley flip</button></span>`);
    const live = !(p === 'hung' && state.hungMode === 'valley'), R = restOf();
    if (live) add(`<label>${state.physics ? 'Rest bias' : 'Rest angle'} <input type="range" id="restA" min="0" max="180" step="1" value="${R[p]}"><output id="restO">${R[p]}°</output></label>`);
    // (a snug fabric: the cloth's hydrostatic state over the fork)
    if (active().some(s => s.man && s.man.userData.cloth && s.man.userData.cloth.covers)) add(`<label>Firm <input type="range" id="firmA" min="0" max="1" step="0.01" value="${state.firm}"><output id="firmO">${state.firm.toFixed(2)}</output></label>`);
    add(`<span class="lbl" id="hold" style="text-transform:none;letter-spacing:0;flex:1 1 100%"></span>`);
    box.classList.toggle('hidden', !box.children.length);
    const pz = $('#pause'); if (pz) pz.onclick = () => { state.paused = !state.paused; ui.tools(); };
    const ph = $('#phys'); if (ph) ph.onclick = () => { state.physics = !state.physics; ui.tools(); pose(0, true); };
    box.querySelectorAll('[data-hm]').forEach(b => { b.onclick = () => { state.hungMode = b.dataset.hm; ui.tools(); pose(0, true); }; });
    const ra = $('#restA'); if (ra) ra.oninput = () => { restOf()[p] = +ra.value; $('#restO').textContent = ra.value + '°'; awake = 1; pose(0); };
    const fa = $('#firmA'); if (fa) fa.oninput = () => { state.firm = +fa.value; $('#firmO').textContent = state.firm.toFixed(2); active().forEach(s => { const c = s.man && s.man.userData.cloth; if (c && c.setState) c.setState(state.firm); }); dirty = true; };
  }
};
document.querySelectorAll('[data-look]').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('[data-look]').forEach(x => x.classList.toggle('on', x === b)); setLook(b.dataset.look);
}));
document.querySelectorAll('[data-pose]').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('[data-pose]').forEach(x => x.classList.toggle('on', x === b));
  state.pose = b.dataset.pose; active().forEach(s => s.man && setFaceOf(s.man)); pose(0, true); ui.tools();
  if (state.focus >= 0) goTo(state.frame, state.focus);   // (the man's moved: the view follows, once)
}));
document.querySelectorAll('[data-outfit]').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('[data-outfit]').forEach(x => x.classList.toggle('on', x === b));
  state.outfit = b.dataset.outfit; $('#paintRow').classList.toggle('hidden', !bare()); buildAll();
}));
document.querySelectorAll('[data-face]').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('[data-face]').forEach(x => x.classList.toggle('on', x === b));
  const was = state.face; state.face = b.dataset.face;
  if (was === 'valley' || state.face === 'valley') buildAll(); else { active().forEach(s => s.man && setFaceOf(s.man)); dirty = true; }
}));
document.querySelectorAll('[data-frame]').forEach(b => b.addEventListener('click', () => {
  const f = b.dataset.frame;
  if (f === 'all') goTo('all', -1); else goTo(f, state.focus < 0 ? 0 : state.focus);
}));
$('#prev').addEventListener('click', () => goTo(state.frame === 'all' ? 'full' : state.frame, state.focus <= 0 ? active().length - 1 : state.focus - 1));
$('#next').addEventListener('click', () => goTo(state.frame === 'all' ? 'full' : state.frame, state.focus < 0 || state.focus >= active().length - 1 ? 0 : state.focus + 1));

// None's paint
document.querySelectorAll('[data-paint]').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('[data-paint]').forEach(x => x.classList.toggle('on', x === b)); setPaint(b.dataset.paint);
}));
// the line's face variants: each his own, or one for all
{
  const row = $('#shapeRow');
  VARS.forEach(v => { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.dataset.shape = v; b.textContent = FACE_VARIANTS[v].name; row.appendChild(b); });
  row.querySelectorAll('[data-shape]').forEach(b => b.addEventListener('click', () => {
    row.querySelectorAll('[data-shape]').forEach(x => x.classList.toggle('on', x === b));
    state.shape = b.dataset.shape; if (!state.compare) buildAll();
  }));
}
// the comparison: two models, each its own build, face and values
function setCompare(on) {
  state.compare = on;
  $('#cmp').classList.toggle('on', on); $('#cmpPicks').classList.toggle('hidden', !on); $('#shapeRow').classList.toggle('hidden', on);
  buildAll(); layoutPanels();
  goTo('all', -1);
}
{
  const fill = sel => { sel.innerHTML = MEN.map((m, i) => `<option value="${i}">${m.name}</option>`).join(''); };
  ['cmpA', 'cmpB'].forEach((id, k) => {
    const sel = $('#' + id); fill(sel); sel.value = String(state.models[k].man);
    sel.addEventListener('change', () => { state.models[k].man = +sel.value; const s = makeCmp(k); rebuildOne(s); if (state.focus >= 0) goTo(state.frame, state.focus); });
  });
  $('#cmp').addEventListener('click', () => setCompare(!state.compare));
  // (the same values on both: A's copied to B)
  $('#cmpCopy').addEventListener('click', () => { state.models[1].params = Object.assign({}, state.models[0].params); rebuildOne(cmpSlots[1]); layoutPanels(); });
}
// (a model's face, picked in its own panel)
function faceExtra(k) {
  const box = document.createElement('label');
  box.style.cssText = 'display:flex;gap:8px;align-items:center;margin-top:6px;border-top:1px solid #333;padding-top:6px;';
  box.innerHTML = `<span style="color:#d9b45a;text-transform:uppercase;letter-spacing:.06em;font-weight:bold">Face</span>`;
  const sel = document.createElement('select');
  sel.setAttribute('aria-label', `Model ${'AB'[k]}: face`);
  sel.style.cssText = 'flex:1;padding:4px;background:#111;color:#ddd;border:1px solid #555;border-radius:4px;font:11px monospace;';
  sel.innerHTML = VARS.map(v => `<option value="${v}">${FACE_VARIANTS[v].name}</option>`).join(''); sel.value = state.models[k].face;
  sel.addEventListener('change', () => { state.models[k].face = sel.value; rebuildOne(cmpSlots[k]); });
  box.appendChild(sel);
  return box;
}
// the settings fold away, all but their own toggle, for a clear view
$('#dockFold').addEventListener('click', () => {
  const folded = $('#dock').classList.toggle('folded');
  $('#dockFold').textContent = folded ? '▸ Settings' : '▾ Settings';
  layoutPanels();
});

// ---------- the sliders' panels: docked at the sides, or under the view ----------
let overlay = null;
const wide = () => window.innerWidth >= 900;
function layoutPanels() {
  const bar = $('#bar'), dock = $('#dock');
  const topPx = Math.round(bar.getBoundingClientRect().bottom + 8) + 'px';
  document.documentElement.style.setProperty('--dev-top', topPx);
  document.documentElement.style.setProperty('--dev-bottom', Math.round(window.innerHeight - dock.getBoundingClientRect().top + 8) + 'px');
  if (!overlay) return;
  overlay.clear();
  const pm = $('#panels'); pm.innerHTML = '';
  const W = wide();
  if (!state.compare) {
    overlay.make({ key: 'line', label: 'Anatomy · all', figures, params: null }, { dock: W ? 'right' : 'top', top: topPx });
    pm.classList.add('hidden');
  } else {
    state.models.forEach((M, k) => overlay.make({ key: 'model' + 'AB'[k], label: `Model ${'AB'[k]}`, figures: cmpFigs[k], params: M.params },
      { dock: W ? (k ? 'right' : 'left') : 'below', mount: W ? null : pm, top: topPx, accent: k ? '#ff6a4a' : '#4aa8ff', folded: !W, extra: () => faceExtra(k) }));
    pm.classList.toggle('hidden', W);
  }
  aimIntoBand(); if (state.focus < 0) Object.assign(view, framing('all', -1)); dirty = true;
}
let wasWide = wide();
window.addEventListener('resize', () => { if (wide() !== wasWide) { wasWide = wide(); layoutPanels(); } });

// ---------- the loop ----------
let dirty = true, last = performance.now();
function size() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; aimIntoBand();
  if (state.focus < 0) Object.assign(view, framing('all', -1));
  dirty = true;
}
window.addEventListener('resize', size);
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  // (the poses that move, and the flesh while it is still settling)
  if ((ANIMATED[state.pose] && !state.paused) || awake > 0) { awake = Math.max(0, awake - dt); pose(dt); }
  if (now - (loop.hold || 0) > 200) { loop.hold = now; holdReadout(now); }
  if (tween) {
    tween.t = Math.min(1, (now - tween.t0) / 750); const k = ease(tween.t);
    view.target.lerpVectors(tween.from.target, tween.to.target, k);
    view.dist = tween.from.dist + (tween.to.dist - tween.from.dist) * k;
    view.yaw = tween.from.yaw + (tween.to.yaw - tween.from.yaw) * k;
    view.pitch = tween.from.pitch + (tween.to.pitch - tween.from.pitch) * k;
    if (tween.t >= 1) tween = null;
    dirty = true;
  }
  if (dirty) {
    aimIntoBand();
    placeCamera();
    // (a fixed clock into the plates: the hatch holds still; the valley's key,
    // turned with the view as the valley turns it with the seat, so the men
    // are lit from the plate's upper left whichever way you look at them)
    burinTick(scene, camera, renderer, 0, labKey.copy(KEY_SEAT).applyAxisAngle(UP, view.yaw));
    renderer.render(scene, camera);
    dirty = false;
  }
  requestAnimationFrame(loop);
}

// ---------- open: the gate first, then the room ----------
let opened = false;
function open() {
  if (opened) return; opened = true;
  $('#bar').classList.remove('hidden'); $('#dock').classList.remove('hidden');
  buildAll();
  setLook('ink');
  size();
  Object.assign(view, framing('all', -1));
  ui.tools(); ui.syncFrame();
  // (the panel folding or the tools row changing moves the strip: redraw)
  if (window.ResizeObserver) { const ro = new ResizeObserver(() => { aimIntoBand(); dirty = true; }); ro.observe($('#dock')); }
  requestAnimationFrame(loop);
}
// (the build and the cloth's mode, so a phone's screenshot says which it was)
fetch('../sw.js', { cache: 'no-cache' }).then(r => r.text()).then(t => { const m = /CACHE_NAME = '([^']+)'/.exec(t); const el = document.getElementById('stamp'); if (el) el.textContent = `· ${m ? m[1] : '?'} · uc:${UC_MODE}`; }).catch(() => {});
initDevOverlay(figures, {
  top: 'calc(max(10px, env(safe-area-inset-top)) + 46px)',
  compact: true,
  // (fold or unfold a panel or a tab: the view's strip may have moved)
  onFold() { aimIntoBand(); if (state.focus < 0) Object.assign(view, framing('all', -1)); dirty = true; },
  onAuthed(api) { overlay = api; open(); layoutPanels(); if (api.ink) setTimeout(() => api.ink.rescan(), 1500); },   // (the men are built after the panel: its saved and linked numbers land on a rescan)
  // (the ink panel: the burin's pitch and thresholds on the men's plates)
  ink: { root: scene, dock: 'left' },
  // (a slider moved: the overlay rebuilt each man's anatomy in place - give
  // the new pieces the room's look and put them back in the pose)
  onChange() { active().forEach(s => { if (bare()) proxy(s.man); applyLook(s.man); }); awake = 1; pose(0); }
});
// the lab's own hook for the visual checks (scripts in a headless browser)
window.__lab = { state, setLook, pose: (f) => pose(0, f), step: dt => pose(dt), redraw: () => { dirty = true; }, goTo, buildAll, slots, cmpSlots, active, setCompare, setPaint, layoutPanels, ui, view, camera, framing };
