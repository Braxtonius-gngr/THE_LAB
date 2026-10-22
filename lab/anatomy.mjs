// The lab: an empty room with a line of men of every build, for tuning the
// valley's figures against a body that isn't the valley's one man. Opened
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
// outfit rebuilds the men with the values the sliders hold.
import * as THREE from '../assets/vendor/three/three.module.js';
import { valleyKit } from '../assets/intro3d/valley.mjs';
import { buildFigure, BODY_HIPS, getAnatomy } from '../assets/intro3d/figure.mjs';
import { burinTick, engravingMaterial, paperMaterial, BONE } from '../assets/intro3d/burin.mjs';
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
const OUTFITS = { loin: {}, shirt: { shirt: true }, hose: { hose: true }, both: { shirt: true, hose: true } };
// each pose's default rest for the anatomy (degrees forward off the
// vertical; for the hung man, off his own down)
const REST = { stand: 0, walk: 0, seat: 80, hung: 150 };

const state = {
  look: 'ink', pose: 'stand', outfit: 'loin', focus: -1, frame: 'all',
  rest: Object.assign({}, REST), hungMode: 'swing', offBelly: 4, paused: false
};

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
const slots = MEN.map((m, i) => {
  const g = new THREE.Group(); g.position.x = xOf(i); g.userData.slot = i; scene.add(g);
  const h = m.build.height;
  // the seat: a block under the thighs, its top at the thighs' undersides
  const seat = new THREE.Mesh(new THREE.BoxGeometry(52 * h, 41 * h, 58 * h), kit.wood);
  seat.position.set(0, 20.5 * h, -6 * h); seat.castShadow = seat.receiveShadow = true; seat.visible = false; g.add(seat);
  // the gallows: two posts and a beam, the ankles roped to it
  const gal = new THREE.Group(); gal.visible = false; g.add(gal);
  const H = 214 * h;
  [-1, 1].forEach(s => { const p = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.6, H + 10, 8), kit.post); p.position.set(s * 44 * h, H / 2, 0); p.castShadow = true; gal.add(p); });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 96 * h, 8), kit.post); beam.position.y = H; beam.rotation.z = PI / 2; beam.castShadow = true; gal.add(beam);
  return { i, g, man: null, seat, gal, H };
});
const figures = [];   // (the overlay's live list - refilled in place on a rebuild)

function build(i) {
  const s = slots[i], m = MEN[i];
  if (s.man) { s.g.remove(s.man); s.man.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
  const man = buildFigure(kit, seeded(101 + i * 7), Object.assign({
    build: m.build, beard: !!m.beard, recede: m.recede || 0, hairMat: m.grey ? kit.hairGrey : kit.hair,
    anatomy: getAnatomy()   // (every man the sliders' values exactly - no per-man scatter, so the line compares)
  }, OUTFITS[state.outfit]));
  const u = man.userData;
  if (u.pouch) { u.pouch0 = u.pouch.position.clone(); }
  // the ropes round his ankles, for the gallows
  u.ropes = ['l', 'r'].map(k => { const r = new THREE.Mesh(new THREE.TorusGeometry(6.4, 0.9, 6, 12), kit.rope); r.position.y = 2; r.rotation.x = PI / 2; r.visible = false; u.legs[k].foot.add(r); return r; });
  s.g.add(man); s.man = man;
  applyLook(man);
  return man;
}
function buildAll() {
  figures.length = 0;
  slots.forEach(s => { const man = build(s.i); if (man.userData.pouch) figures.push(man); });
  pose(0);
}

// ---------- looks ----------
function applyLook(root) {
  const studio = state.look === 'studio';
  root.traverse(o => {
    if (!o.isMesh) return;
    if (o.userData.outline) { o.visible = !studio; return; }
    if (o.userData.ink) { o.material = studio ? o.userData.studio : o.userData.ink; return; }
    // (a mesh built since the last switch carries whichever plate it was
    // made with: find its ink plate either way)
    if (!o.userData.inkMat) o.userData.inkMat = toInk.get(o.material) || o.material;
    const ink = o.userData.inkMat;
    o.material = studio ? (toStudio.get(ink) || STUDIO.flesh) : ink;
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
// (age carries the head forward and eases the knees; the face is lifted
// back to look ahead)
function posture(u, kneeToo) {
  const a = Math.max(0, (u.build && u.build.age) || 0);
  u.neck.rotation.x += -0.3 * a; u.head.rotation.x += 0.24 * a;
  if (kneeToo) { ['l', 'r'].forEach(s => { u.legs[s].hip.rotation.x += 0.1 * a; u.legs[s].kn.rotation.x += KNEE_BACK * 0.16 * a; u.legs[s].foot.rotation.x += 0.06 * a; }); u.hips.position.y -= 1.6 * a; }
}
const swayOf = u => { const g = u.pouch && u.pouch.children[0]; return (g && g.userData.sway) || 1; };

function poseMan(s, t) {
  const man = s.man, u = man.userData, h = MEN[s.i].build.height;
  man.rotation.set(0, 0, 0); man.position.set(0, 0, 0);
  rest(u);
  s.seat.visible = state.pose === 'seat'; s.gal.visible = state.pose === 'hung';
  u.ropes.forEach(r => { r.visible = state.pose === 'hung'; });
  const restA = state.rest[state.pose] * DEG;
  if (state.pose === 'stand') {
    // at ease, his weight on one leg: the free hip dropped and that knee
    // eased forward, the arms slack at his sides
    const tilt = -0.12;
    u.hips.position.y = BODY_HIPS - 1.8; u.hips.rotation.z = tilt;
    u.arms.l.sh.rotation.set(0.06, 0, 0.1 - tilt); u.arms.r.sh.rotation.set(0.1, 0, -0.12 - tilt);
    u.arms.l.el.rotation.x = 0.28; u.arms.r.el.rotation.x = 0.35;
    u.legs.l.hip.rotation.set(0.24, 0, 0.05 - tilt); u.legs.l.kn.rotation.x = KNEE_BACK * 0.45; u.legs.l.foot.rotation.x = -0.28;
    u.legs.r.hip.rotation.set(-0.03, 0, -0.03 - tilt);
    posture(u, true);
    if (u.pouch) u.pouch.rotation.x = restA;
  } else if (state.pose === 'walk') {
    // a walk in place: the legs' swing, the knee folding behind, the arms
    // against the legs, the hips' rise and turn
    const w = t * 2 * PI * 0.85 + s.i * 0.7, sn = Math.sin(w), cs = Math.cos(w);
    u.hips.position.y = BODY_HIPS - 2.2 + Math.abs(cs) * 2.0;
    u.hips.rotation.y = sn * 0.07; u.hips.rotation.z = cs * 0.035;
    u.legs.l.hip.rotation.x = sn * 0.46; u.legs.r.hip.rotation.x = -sn * 0.46;
    u.legs.l.kn.rotation.x = KNEE_BACK * (Math.max(0, -cs) * 0.85 + 0.06); u.legs.r.kn.rotation.x = KNEE_BACK * (Math.max(0, cs) * 0.85 + 0.06);
    ['l', 'r'].forEach(k => { u.legs[k].foot.rotation.x = -(u.legs[k].hip.rotation.x + u.legs[k].kn.rotation.x) * 0.7; });
    u.arms.l.sh.rotation.set(-sn * 0.34, 0, 0.08); u.arms.r.sh.rotation.set(sn * 0.34, 0, -0.08);
    u.arms.l.el.rotation.x = 0.3 + Math.max(0, sn) * 0.3; u.arms.r.el.rotation.x = 0.3 + Math.max(0, -sn) * 0.3;
    posture(u, false);
    if (u.pouch) { const k = swayOf(u), ph = w - 0.6; u.pouch.rotation.z = Math.sin(ph) * 0.07 * k; u.pouch.rotation.x = restA + Math.abs(Math.sin(ph)) * 0.05 * k; }
  } else if (state.pose === 'seat') {
    // on the block: the thighs out level, the shins down, the hands on the knees
    u.hips.position.y = 53.3;
    ['l', 'r'].forEach(k => { u.legs[k].hip.rotation.x = 1.45; u.legs[k].kn.rotation.x = KNEE_BACK * 1.45; });
    u.legs.l.hip.rotation.z = 0.06; u.legs.r.hip.rotation.z = -0.06;
    u.arms.l.sh.rotation.set(0.95, 0, 0.16); u.arms.r.sh.rotation.set(0.95, 0, -0.16);
    u.arms.l.el.rotation.x = 0.45; u.arms.r.el.rotation.x = 0.45;
    posture(u, false);
    if (u.pouch) u.pouch.rotation.x = restA;
  } else if (state.pose === 'hung') {
    // head down from the beam by the ankles, as the sawyer hangs
    man.rotation.z = PI; man.position.y = s.H + 4 * h;
    u.legs.l.hip.rotation.z = 0.36; u.legs.r.hip.rotation.z = -0.36;
    u.legs.l.kn.rotation.x = KNEE_BACK * 0.2; u.legs.r.kn.rotation.x = KNEE_BACK * 0.2;
    u.arms.l.sh.rotation.set(0.1, 0, PI - 0.3); u.arms.r.sh.rotation.set(0.1, 0, -(PI - 0.34));
    u.arms.l.el.rotation.x = 0.38; u.arms.r.el.rotation.x = 0.44;
    u.neck.rotation.x = 0.55;
    if (u.pouch) {
      if (state.hungMode === 'valley') {
        // the valley's sawyer today, exactly
        u.pouch.rotation.set(0.14, 0, PI); u.pouch.position.set(0, -13.0, -11.0);
      } else {
        // swung forward about its root over the front of him, sides kept:
        // its own down turned toward his belly, `offBelly` lifting it out
        u.pouch.rotation.set(restA, 0, 0);
        u.pouch.position.z = u.pouch0.z - state.offBelly;
      }
    }
  }
}
let tWalk = 0;
function pose(dt) {
  if (state.pose === 'walk' && !state.paused) tWalk += dt;
  slots.forEach(s => poseMan(s, tWalk));
  dirty = true;
}

// ---------- the camera: only where you send it ----------
const view = { target: new THREE.Vector3(0, 95, 0), dist: 900, yaw: 0, pitch: 0.12 };
let tween = null;
// the clear strip of screen between the slider panel (or the top bar) and
// the dock: the view is centred in it and a man fitted to its height
function band() {
  const H = window.innerHeight, over = document.getElementById('dev-anatomy-overlay'), bar = $('#bar'), dock = $('#dock');
  let top = bar && !bar.classList.contains('hidden') ? bar.getBoundingClientRect().bottom : 0;
  if (over) top = Math.max(top, over.getBoundingClientRect().bottom);
  const bottom = dock && !dock.classList.contains('hidden') ? dock.getBoundingClientRect().top : H;
  const t = Math.min(top + 8, H * 0.6), b = Math.max(bottom - 8, t + H * 0.25);
  return { H, cy: (t + b) / 2, frac: (b - t) / H };
}
// (the projection's centre slid down into the strip; its inverse kept for the taps' rays)
function aimIntoBand() {
  const { H, cy } = band();
  camera.updateProjectionMatrix();
  camera.projectionMatrix.elements[9] = -(1 - 2 * cy / H);
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
}
function framing(frame, i) {
  const tanV = Math.tan(camera.fov * DEG / 2), tanH = tanV * camera.aspect, frac = band().frac;
  if (frame === 'all' || i < 0) {
    const half = SPACING * MEN.length / 2 + 40;
    return { target: new THREE.Vector3(0, 100, 0), dist: Math.max(half / tanH, 600) * 1.02, yaw: 0, pitch: 0.12 };
  }
  const s = slots[i];
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
  slots.forEach(s => { s.g.visible = frame !== 'close' || i < 0 || s.i === i; });
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
  const hits = ray.intersectObjects(slots.map(s => s.man), true);
  for (const h of hits) { let o = h.object; while (o && o.userData.slot == null) o = o.parent; if (o) { goTo(state.frame === 'close' ? 'close' : 'full', o.userData.slot); return; } }
}

// ---------- the dock ----------
const $ = sel => document.querySelector(sel);
const ui = {
  syncFrame() {
    $('#who').textContent = state.focus < 0 ? 'All' : MEN[state.focus].name;
    document.querySelectorAll('[data-frame]').forEach(b => b.classList.toggle('on', b.dataset.frame === (state.focus < 0 ? 'all' : state.frame)));
  },
  tools() {
    const box = $('#tools'); box.innerHTML = '';
    const p = state.pose;
    const add = html => { const d = document.createElement('div'); d.innerHTML = html; while (d.firstChild) box.appendChild(d.firstChild); };
    if (p === 'walk') add(`<button type="button" class="chip" id="pause">${state.paused ? '▶ Play' : '❚❚ Pause'}</button>`);
    if (p === 'hung') add(`<span class="lbl">Fall</span><span class="seg"><button type="button" data-hm="swing" class="${state.hungMode === 'swing' ? 'on' : ''}">Swing over</button><button type="button" data-hm="valley" class="${state.hungMode === 'valley' ? 'on' : ''}">Valley flip</button></span>`);
    const live = !(p === 'hung' && state.hungMode === 'valley');
    if (live) add(`<label>Rest angle <input type="range" id="restA" min="0" max="180" step="1" value="${state.rest[p]}"><output id="restO">${state.rest[p]}°</output></label>`);
    if (p === 'hung' && state.hungMode === 'swing') add(`<label>Off belly <input type="range" id="offB" min="-4" max="12" step="0.5" value="${state.offBelly}"><output id="offO">${state.offBelly}</output></label>`);
    box.classList.toggle('hidden', !box.children.length);
    const pz = $('#pause'); if (pz) pz.onclick = () => { state.paused = !state.paused; ui.tools(); };
    box.querySelectorAll('[data-hm]').forEach(b => { b.onclick = () => { state.hungMode = b.dataset.hm; ui.tools(); pose(0); }; });
    const ra = $('#restA'); if (ra) ra.oninput = () => { state.rest[p] = +ra.value; $('#restO').textContent = ra.value + '°'; pose(0); };
    const ob = $('#offB'); if (ob) ob.oninput = () => { state.offBelly = +ob.value; $('#offO').textContent = ob.value; pose(0); };
  }
};
document.querySelectorAll('[data-look]').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('[data-look]').forEach(x => x.classList.toggle('on', x === b)); setLook(b.dataset.look);
}));
document.querySelectorAll('[data-pose]').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('[data-pose]').forEach(x => x.classList.toggle('on', x === b));
  state.pose = b.dataset.pose; pose(0); ui.tools();
  if (state.focus >= 0) goTo(state.frame, state.focus);   // (the man's moved: the view follows, once)
}));
document.querySelectorAll('[data-outfit]').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('[data-outfit]').forEach(x => x.classList.toggle('on', x === b));
  state.outfit = b.dataset.outfit; buildAll();
}));
document.querySelectorAll('[data-frame]').forEach(b => b.addEventListener('click', () => {
  const f = b.dataset.frame;
  if (f === 'all') goTo('all', -1); else goTo(f, state.focus < 0 ? 0 : state.focus);
}));
$('#prev').addEventListener('click', () => goTo(state.frame === 'all' ? 'full' : state.frame, state.focus <= 0 ? MEN.length - 1 : state.focus - 1));
$('#next').addEventListener('click', () => goTo(state.frame === 'all' ? 'full' : state.frame, state.focus < 0 || state.focus >= MEN.length - 1 ? 0 : state.focus + 1));

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
  if (state.pose === 'walk' && !state.paused) pose(dt);
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
    // (a fixed clock into the plates: the hatch holds still)
    burinTick(scene, camera, renderer, 0);
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
  if (window.ResizeObserver) { const ro = new ResizeObserver(() => { dirty = true; }); [document.getElementById('dev-anatomy-overlay'), $('#dock')].forEach(el => el && ro.observe(el)); }
  requestAnimationFrame(loop);
}
initDevOverlay(figures, {
  top: 'calc(max(10px, env(safe-area-inset-top)) + 46px)',
  compact: true,
  onAuthed: open,
  // (a slider moved: the overlay rebuilt each man's anatomy in place - give
  // the new pieces the room's look and put them back in the pose)
  onChange() { slots.forEach(s => applyLook(s.man)); pose(0); }
});
// the lab's own hook for the visual checks (scripts in a headless browser)
window.__lab = { state, setLook, pose: () => pose(0), goTo, buildAll, slots, ui, view, camera, framing };
