// The lab's Rodin body: a body made in Rodin (a GLB, one unrigged mesh),
// bound to the lab's own skeleton and driven by the same poses, beside the
// procedural man for comparison. A proof, not yet in the line of men:
//
//   - the mesh is turned to the lab's facing (-z), its height warped
//     piecewise to the lab's joints (knee, hip, shoulder, head), and its
//     arms - made in an A-pose - laid down to hang as the lab's do
//   - each point is owned by a bone (a geodesic Voronoi over the mesh's own
//     edges, from seeds in the torso, the limbs and the head, so the
//     armpit and the crotch split where the surface does, not where a
//     plane would cut them), then shared with the bone across a joint by
//     the same smooth blend as figure.mjs's skin (`skinWeights`)
//   - drawn in the valley's engraving (the flesh plate, outlined), as clay
//     or as its weights, to see how it bends
//
// What it does not do yet: garments (they are lofted to the procedural
// body's measurements), the anatomy (the pelvis here carries the shorts it
// was made in), the soft tissue, the hands' grip or the feet's ankle.
// Opened from the lab's gate like the lab itself.

import * as THREE from '../assets/vendor/three/three.module.js';
import { valleyKit, KEY_SEAT } from '../assets/intro3d/valley.mjs';
import { buildFigure, BODY_HIPS } from '../assets/intro3d/figure.mjs';
import { FleshSim } from '../assets/intro3d/flesh.mjs';
import { burinTick, engravingMaterial, paperMaterial } from '../assets/intro3d/burin.mjs';
import { initDevOverlay } from '../assets/intro3d/dev-overlay.mjs';
import { loadRodinGeometry, attachRodin, dqsTwin, RODIN_BUILD } from '../assets/intro3d/rodin-body.mjs';

const PI = Math.PI, KNEE_BACK = -1, UP = new THREE.Vector3(0, 1, 0);

// ---------- renderer, scene ----------
const canvas = document.getElementById('rodinCanvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(36, 1, 2, 9000);
const kit = valleyKit();
scene.add(new THREE.HemisphereLight(0xf2ece2, 0x2a2826, 1.1));
const sun = new THREE.DirectionalLight(0xfff4e6, 2.2); sun.position.set(-260, 420, -360); scene.add(sun);

const floorInk = engravingMaterial({ freq: 0.9, angle: 0.5, tone: 0.06, wobble: 0.6, sky: 0.3, keyI: 0.9, axis: [1, 0, 0.35] });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), floorInk); floor.rotation.x = -PI / 2; floor.position.z = 140; scene.add(floor);
const wall = new THREE.Mesh(new THREE.PlaneGeometry(900, 520), paperMaterial()); wall.position.set(0, 260, 190); wall.rotation.y = PI; scene.add(wall);

// ---------- the men ----------
const BUILD = RODIN_BUILD;
const seeded = seed => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
function mkSlot(x, opts) {
  const g = new THREE.Group(); g.position.x = x; scene.add(g);
  const man = buildFigure(kit, seeded(101), Object.assign({ build: BUILD }, opts));
  g.add(man);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(52, 41, 58), kit.wood); seat.position.set(0, 20.5, -6); seat.visible = false; g.add(seat);
  return { g, man, u: man.userData, seat };
}
// (the camera looks down +z, so screen-left is +x: the procedural man on the left)
const ref = mkSlot(50, { nude: true });
const rod = mkSlot(-50, { nude: true });
const ALL = [ref, rod];
// the Rodin slot's own meshes are not drawn - only its bones are used
rod.man.traverse(o => { if (o.isMesh && !inPouch(o, rod.u.pouch)) o.visible = false; });

// the anatomy as the lab draws it with nothing on: see-through shapes, the
// mass orange and the lobes blue (left) and red (right), moving as the
// simulation moves them - a readout of the physics, not a body
const proxyMat = (c, e) => new THREE.MeshStandardMaterial({ color: c, emissive: e, transparent: true, opacity: 0.5, depthWrite: false, roughness: 0.6 });
const wireMat = c => new THREE.MeshBasicMaterial({ color: c, wireframe: true, transparent: true, opacity: 0.55 });
const PROXY = { orange: proxyMat(0xff7a1a, 0x5a2200), L: proxyMat(0x2f7bff, 0x0a2260), R: proxyMat(0xff2f2f, 0x5a0808) };
const PROXY_WIRE = { orange: wireMat(0xffb070), L: wireMat(0x8fb8ff), R: wireMat(0xff9a9a) };
function inPouch(o, P) { for (let c = o; c; c = c.parent) if (c === P) return true; return false; }
function proxify(man) {
  const P = man.userData.pouch; if (!P) return;
  P.traverse(o => {
    if (!o.isMesh || o.userData.wire === true) return;
    if (o.userData.outline) { o.visible = false; return; }
    const part = o.userData.side || 'orange';
    o.material = PROXY[part]; o.visible = true;
    if (!o.userData.wire) { const w = new THREE.Mesh(o.geometry, PROXY_WIRE[part]); w.userData.wire = true; o.userData.wire = w; o.add(w); }
  });
  if (!man.userData.pouch0) man.userData.pouch0 = P.position.clone();
}
proxify(ref.man); proxify(rod.man);
// (the lab's rest angles, forward off the vertical: sitting carries it 40°)
const REST = { stand: 0, walk: 0, jog: 0, crouch: 0, reach: 0, seat: 40 };
ALL.forEach(sl => { sl.sim = new FleshSim(sl.man); });


const MATS = {
  ink: kit.flesh,
  clay: new THREE.MeshStandardMaterial({ color: 0xb8a28c, roughness: 0.82, metalness: 0 }),
  weights: new THREE.MeshBasicMaterial({ vertexColors: true })
};
let body = null, info = null;
function mountBody(srcGeo) {
  body = attachRodin(rod.man, srcGeo, { flat: state.flat, material: MATS.ink, top: new THREE.Box3().setFromObject(ref.man).max.y });
  info = rod.u.rodin;
  rod.sim.reset();
  setLook(state.look);
}

// ---------- poses (the lab's, without the physics) ----------
const clamp01 = x => Math.max(0, Math.min(1, x));
function rest(u) {
  u.hips.position.y = BODY_HIPS; u.hips.rotation.set(0, 0, 0); u.neck.rotation.set(0, 0, 0); u.head.rotation.set(0, 0, 0);
  if (u.pouch) { u.pouch.position.copy(u.pouch0); u.pouch.rotation.set(0, 0, 0); }
  ['l', 'r'].forEach(s => {
    u.arms[s].sh.rotation.set(0, 0, 0); u.arms[s].el.rotation.set(0, 0, 0); u.arms[s].hand.rotation.set(0, 0, 0);
    u.legs[s].hip.rotation.set(0, 0, 0); u.legs[s].kn.rotation.set(0, 0, 0); u.legs[s].foot.rotation.set(0, 0, 0);
  });
}
function crouch(u, c) {
  u.hips.position.y -= 24 * c; u.hips.rotation.x = -0.42 * c;
  ['l', 'r'].forEach(k => { u.legs[k].hip.rotation.x = 1.15 * c + 0.42 * c; u.legs[k].kn.rotation.x = KNEE_BACK * 1.9 * c; u.legs[k].foot.rotation.x = 0.33 * c; });
}
function poseOne(slot, P, t) {
  const { u, g, man, seat } = slot;
  man.position.set(0, 0, 0); rest(u); seat.visible = P === 'seat';
  if (P === 'stand') {
    const tilt = -0.12;
    u.hips.position.y = BODY_HIPS - 1.8; u.hips.rotation.z = tilt;
    u.arms.l.sh.rotation.set(0.06, 0, 0.1 - tilt); u.arms.r.sh.rotation.set(0.1, 0, -0.12 - tilt);
    u.arms.l.el.rotation.x = 0.28; u.arms.r.el.rotation.x = 0.35;
    u.legs.l.hip.rotation.set(0.24, 0, 0.05 - tilt); u.legs.l.kn.rotation.x = KNEE_BACK * 0.45; u.legs.l.foot.rotation.x = -0.28;
    u.legs.r.hip.rotation.set(-0.03, 0, -0.03 - tilt);
  } else if (P === 'walk') {
    const w = t * 2 * PI * 0.85, sn = Math.sin(w), cs = Math.cos(w);
    u.hips.position.y = BODY_HIPS - 2.2 + Math.abs(cs) * 2.0; u.hips.rotation.y = sn * 0.07; u.hips.rotation.z = cs * 0.035;
    u.legs.l.hip.rotation.x = sn * 0.46; u.legs.r.hip.rotation.x = -sn * 0.46;
    u.legs.l.kn.rotation.x = KNEE_BACK * (Math.max(0, -cs) * 0.85 + 0.06); u.legs.r.kn.rotation.x = KNEE_BACK * (Math.max(0, cs) * 0.85 + 0.06);
    u.arms.l.sh.rotation.set(-sn * 0.34, 0, 0.08); u.arms.r.sh.rotation.set(sn * 0.34, 0, -0.08);
    u.arms.l.el.rotation.x = 0.3 + Math.max(0, sn) * 0.3; u.arms.r.el.rotation.x = 0.3 + Math.max(0, -sn) * 0.3;
  } else if (P === 'jog') {
    const w = t * 2 * PI * 1.35, sn = Math.sin(w), cs = Math.cos(w), air = Math.max(0, Math.abs(cs) - 0.55) / 0.45;
    man.position.y = 4.5 * air * air; u.hips.position.y = BODY_HIPS - 3.5 + 2.5 * air;
    u.hips.rotation.x = -0.12; u.hips.rotation.y = sn * 0.1; u.hips.rotation.z = cs * 0.04;
    u.legs.l.hip.rotation.x = 0.12 + 0.62 * sn + 0.3 * Math.max(0, sn); u.legs.r.hip.rotation.x = 0.12 - 0.62 * sn + 0.3 * Math.max(0, -sn);
    u.legs.l.kn.rotation.x = KNEE_BACK * (0.2 + 1.55 * Math.max(0, -cs * 0.6 + sn * 0.8)); u.legs.r.kn.rotation.x = KNEE_BACK * (0.2 + 1.55 * Math.max(0, cs * 0.6 - sn * 0.8));
    u.arms.l.sh.rotation.set(-sn * 0.62 + 0.1, 0, 0.12); u.arms.r.sh.rotation.set(sn * 0.62 + 0.1, 0, -0.12);
    u.arms.l.el.rotation.x = 1.45 + sn * 0.15; u.arms.r.el.rotation.x = 1.45 - sn * 0.15;
  } else if (P === 'crouch') {
    crouch(u, 0.7);
    u.arms.l.sh.rotation.set(-0.9, 0, 0.1); u.arms.r.sh.rotation.set(-0.9, 0, -0.1);
    u.arms.l.el.rotation.x = 0.3; u.arms.r.el.rotation.x = 0.3;
  } else if (P === 'reach') {
    u.arms.l.sh.rotation.set(2.6, 0, 0.12); u.arms.r.sh.rotation.set(2.6, 0, -0.12);
    u.arms.l.el.rotation.x = 0.3; u.arms.r.el.rotation.x = 0.3;
  } else if (P === 'seat') {
    u.hips.position.y = 53.3;
    ['l', 'r'].forEach(k => { u.legs[k].hip.rotation.x = 1.45; u.legs[k].kn.rotation.x = KNEE_BACK * 1.45; });
    u.legs.l.hip.rotation.z = 0.06; u.legs.r.hip.rotation.z = -0.06;
    u.arms.l.sh.rotation.set(0.95, 0, 0.16); u.arms.r.sh.rotation.set(0.95, 0, -0.16);
    u.arms.l.el.rotation.x = 0.45; u.arms.r.el.rotation.x = 0.45;
  }
  void g;
}
const ANIMATED = { walk: 1, jog: 1 };

// ---------- view ----------
const state = { pose: 'stand', look: 'ink', paused: false, t: 0, flat: !/[?&]flat=0/.test(location.search) };
const view = { yaw: 0, pitch: 0.08, zoom: 1, target: new THREE.Vector3(0, 90, 0) };
let dirty = true;
function distFor() { const a = camera.aspect; return Math.max(300, 100 / (Math.tan(18 * PI / 180) * a)) * view.zoom; }
function placeCamera() {
  const d = distFor(), cp = Math.cos(view.pitch);
  camera.position.set(view.target.x + d * Math.sin(view.yaw) * cp, view.target.y + d * Math.sin(view.pitch), view.target.z - d * Math.cos(view.yaw) * cp);
  camera.lookAt(view.target);
}
function size() { const w = window.innerWidth, h = window.innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true; }
window.addEventListener('resize', size);

function setLook(l) {
  state.look = l;
  if (body) {
    body.material = dqsTwin(MATS[l]);
    body.children.forEach(c => { if (c.userData.outline) c.visible = l === 'ink'; });
  }
  document.querySelectorAll('[data-look]').forEach(b => b.classList.toggle('on', b.dataset.look === l));
  dirty = true;
}
function setPose(p) {
  state.pose = p; state.t = 0;
  document.querySelectorAll('[data-pose]').forEach(b => b.classList.toggle('on', b.dataset.pose === p));
  applyPose(); stepFlesh(0, true); for (let k = 0; k < 90; k++) stepFlesh(1 / 60, false); dirty = true;
}
function setYaw(deg) {
  view.yaw = deg * PI / 180;
  document.querySelectorAll('[data-yaw]').forEach(b => b.classList.toggle('on', +b.dataset.yaw === deg));
  dirty = true;
}
function applyPose() { ALL.forEach(s => poseOne(s, state.pose, state.t)); scene.updateMatrixWorld(true); }
// the anatomy's physics, as the lab steps it: the rest angle of the pose, the
// seat to rest on, and a settle under gravity when a pose is newly taken
let settle = false;
function stepFlesh(dt, fresh) {
  ALL.forEach(sl => {
    const sim = sl.sim; if (!sim) return;
    sim.rest = REST[state.pose] * PI / 180; sim.restShaft = null;
    sim.boxes.length = 0;
    if (state.pose === 'seat') { sl.seat.updateMatrixWorld(true); sim.boxes.push(new THREE.Box3().setFromObject(sl.seat)); }
    if (fresh) sim.reset();
    if (sim.step(fresh ? 0 : dt)) dirty = true;
  });
}

// drag to turn, wheel and pinch to zoom
{
  const pts = new Map(); let pinch = 0;
  canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); pinch = 0; });
  canvas.addEventListener('pointerup', e => pts.delete(e.pointerId));
  canvas.addEventListener('pointercancel', e => pts.delete(e.pointerId));
  canvas.addEventListener('pointermove', e => {
    const p = pts.get(e.pointerId); if (!p) return;
    if (pts.size === 2) {
      pts.set(e.pointerId, [e.clientX, e.clientY]); const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch) view.zoom = Math.max(0.3, Math.min(2.5, view.zoom * pinch / d)); pinch = d; dirty = true; return;
    }
    view.yaw -= (e.clientX - p[0]) * 0.008; view.pitch = Math.max(-0.2, Math.min(0.9, view.pitch + (e.clientY - p[1]) * 0.004));
    p[0] = e.clientX; p[1] = e.clientY; document.querySelectorAll('[data-yaw]').forEach(b => b.classList.remove('on')); dirty = true;
  });
  canvas.addEventListener('wheel', e => { e.preventDefault(); view.zoom = Math.max(0.3, Math.min(2.5, view.zoom * (1 + e.deltaY * 0.001))); dirty = true; }, { passive: false });
}
document.querySelectorAll('[data-pose]').forEach(b => b.addEventListener('click', () => setPose(b.dataset.pose)));
document.querySelectorAll('[data-look]').forEach(b => b.addEventListener('click', () => setLook(b.dataset.look)));
document.querySelectorAll('[data-yaw]').forEach(b => b.addEventListener('click', () => setYaw(+b.dataset.yaw)));
document.getElementById('pause').addEventListener('click', e => { state.paused = !state.paused; e.currentTarget.classList.toggle('on', state.paused); e.currentTarget.textContent = state.paused ? 'Play' : 'Pause'; });

// ---------- the loop ----------
const labKey = new THREE.Vector3();
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (ANIMATED[state.pose] && !state.paused) { state.t += dt; applyPose(); dirty = true; }
  stepFlesh(dt, false);
  if (dirty) {
    placeCamera();
    burinTick(scene, camera, renderer, 0, labKey.copy(KEY_SEAT).applyAxisAngle(UP, view.yaw));
    renderer.render(scene, camera); dirty = false;
  }
  requestAnimationFrame(loop);
}

// ---------- open: the gate first, then the room ----------
let opened = false;
function open() {
  if (opened) return; opened = true;
  ['bar', 'dock', 'note'].forEach(id => document.getElementById(id).classList.remove('hidden'));
  size(); applyPose();
  loadRodinGeometry().then(geo => { mountBody(geo); setPose(state.pose); }, err => console.error('rodin: could not load the body', err));
  requestAnimationFrame(loop);
}
// the lab's own panel: its sliders act on both men's anatomy and its physics
// (the trunk's and limbs' lofts it also carries are the procedural man's
// alone - the Rodin body's shape is its mesh's)
initDevOverlay([ref.man, rod.man], {
  top: 'calc(max(10px, env(safe-area-inset-top)) + 46px)',
  compact: true, dock: 'right',
  ink: { root: scene, dock: 'left' },
  onAuthed(api) { open(); if (api.ink) setTimeout(() => api.ink.rescan(), 1500); },
  onFold() { dirty = true; },
  // (a slider moved: the overlay rebuilt each man's anatomy in place - paint
  // the new pieces as the proxy, and let the physics settle into the pose)
  onChange() { ALL.forEach(sl => proxify(sl.man)); setPose(state.pose); }
});
window.__rodin = { state, setPose, setLook, setYaw, redraw: () => { dirty = true; }, info: () => info, scene, camera, view, applyPose, ref, rod, step: dt => { state.t += dt; applyPose(); dirty = true; } };
