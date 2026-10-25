// The cloth bench: one skinned garment over one skinned limb, for tuning
// UniversalClothMaterial (assets/intro3d/universal-cloth-material.mjs) live
// - the GPU cloth the app's figures will wear in any scene once they are
// skinned. Opened from the lab (its bar), behind the same passkey gate.
//
//   - the limb: a tube of skin on two bones, the lower half bent from the
//     joint by the Bend slider, or swung on a loop (Walk, Jog) - so the
//     cloth is seen moving with the bones, and its trail behind them
//   - the garment: a tube of cloth over it, the material carrying its front
//     out over the tissue under it: Rigid, Soft or Hydrostatic (the tissue
//     chips), its sliders the material's own parameters, by name
//   - the swing vector: the joint's angular velocity, read into
//     u_swingVector along the garment's v (the Trail slider scales it)
//   - looks: the valley's ink (burin's plates), or plain studio clay with
//     shadows (the shadow is cast by the carried-out shape too); Wire shows
//     the garment's mesh, so the protrusion's own geometry can be read
// The camera: drag to turn, pinch or wheel to zoom.
import * as THREE from '../assets/vendor/three/three.module.js';
import { UniversalClothMaterial, TISSUE_TYPE } from '../assets/intro3d/universal-cloth-material.mjs';
import { valleyKit } from '../assets/intro3d/valley.mjs';
import { burinTick, BONE } from '../assets/intro3d/burin.mjs';
import { initDevOverlay } from '../assets/intro3d/dev-overlay.mjs';

const PI = Math.PI;
const $ = s => document.querySelector(s);

// ---------- the sliders: the material's parameters, by name ----------
// [key, label, min, max, step, default, hydrostatic-only]
const SLIDERS = [
  ['state', 'State', 0, 1, 0.01, 0.35, true],
  ['maxDepth', 'Depth (cm)', 0, 8, 0.1, 3.5, false],
  ['length', 'Length (uv)', 0.05, 0.6, 0.01, 0.3, true],
  ['width', 'Width (uv)', 0.01, 0.25, 0.005, 0.07, true],
  ['radius', 'Radius (uv)', 0.02, 0.3, 0.005, 0.1, false],
  ['jiggle', 'Jiggle', 0, 0.3, 0.01, 0.06, false],
  ['clinginess', 'Cling', 0, 1, 0.01, 0.8, false],
  ['drapeDistance', 'Drape (cm)', 0, 6, 0.1, 1.5, false],
  ['trail', 'Trail', 0, 1, 0.01, 0.4, false],
  ['bend', 'Bend (deg)', -60, 60, 1, 20, false]
];
const state = { tissue: TISSUE_TYPE.HYDROSTATIC, look: 'ink', motion: 'still', wire: false, t: 0, phase: 0, trail: 0.4, bend: 20 };

// ---------- renderer, scene ----------
const canvas = document.getElementById('benchCanvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 1, 2000);
const kit = valleyKit();
const clay = (c, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.82, metalness: 0 }, o));
const STUDIO = { linen: clay(0xd8d2c4), skin: clay(0xb8a28c), floor: clay(0x34343a) };
const hemi = new THREE.HemisphereLight(0xf2ece2, 0x2a2826, 1.1); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff4e6, 2.4); sun.position.set(-60, 120, -90); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -80, right: 80, top: 80, bottom: -80, near: 10, far: 400 }); sun.shadow.bias = -0.0006;
scene.add(sun); scene.add(sun.target);
const fill = new THREE.DirectionalLight(0xdfe6ff, 0.6); fill.position.set(80, 40, -60); scene.add(fill);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), STUDIO.floor); floor.rotation.x = -PI / 2; floor.position.y = -34; floor.receiveShadow = true; scene.add(floor);

// ---------- the limb and its garment ----------
// a tube on two bones, +y up: the upper bone holds the top, the lower bends
// the rest from the joint at y 0 (weights eased over the joint)
const LEN = 56, JOINT = 0;
function skinnedTube(r, mat, segs = 64, rings = 56) {
  const g = new THREE.CylinderGeometry(r, r * 0.92, LEN, segs, rings, true);
  const p = g.attributes.position, si = [], sw = [];
  for (let i = 0; i < p.count; i++) { const y = p.getY(i), w = THREE.MathUtils.smoothstep(y, JOINT + 5, JOINT - 5); si.push(0, 1, 0, 0); sw.push(1 - w, w, 0, 0); }
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  const b0 = new THREE.Bone(), b1 = new THREE.Bone(); b0.add(b1); b1.position.y = JOINT;
  const m = new THREE.SkinnedMesh(g, mat); m.add(b0); m.bind(new THREE.Skeleton([b0, b1]));
  m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true;
  return m;
}
// (the ink plates hatch along the mesh's uv x their scale, laid in the body's
// units: the tube's uv runs 0-1 round and along, so its plates are scaled to
// its own size - the hatch at the pitch the figures have)
const UV_CM = [2 * PI * 9.9 * 0.9, LEN * 0.9];
const plate = m => { const c = m.clone(); if (c.uniforms && c.uniforms.uUvMode && c.uniforms.uUvMode.value) c.uniforms.uUvScale.value.set(UV_CM[0], UV_CM[1]); return c; };
const rig = new THREE.Group(); scene.add(rig);
const skin = skinnedTube(9.0, plate(kit.skin)); rig.add(skin);
const cloth = new UniversalClothMaterial(plate(kit.linen), { tissueType: state.tissue, baseUV: [0.5, 0.62], direction: [0, -1] });
SLIDERS.forEach(([k, , , , , v]) => { if (k !== 'trail' && k !== 'bend') cloth.set({ [k]: v }); });
const garment = skinnedTube(9.9, cloth.material); cloth.apply(garment); rig.add(garment);
// (the wire rides the same bones: a skinned copy)
const wireMesh = new THREE.SkinnedMesh(garment.geometry, new THREE.MeshBasicMaterial({ color: 0xffb070, wireframe: true, transparent: true, opacity: 0.5 })); wireMesh.bind(garment.skeleton, garment.bindMatrix); wireMesh.frustumCulled = false; wireMesh.visible = false; garment.add(wireMesh);
// (the studio clay for each, when the look is switched)
const INK = { skin: skin.material, cloth: cloth.material };
// (one set of uniforms drives both plates: the studio material shares cloth's)
const studioClothMat = (() => { const c = new UniversalClothMaterial(STUDIO.linen, {}); Object.keys(c.uniforms).forEach(k => { c.uniforms[k] = cloth.uniforms[k]; }); return c; })();
const bones = { upper: skin.skeleton.bones[0], lower: skin.skeleton.bones[1], gUpper: garment.skeleton.bones[0], gLower: garment.skeleton.bones[1] };

// ---------- looks ----------
function setLook(look) {
  state.look = look;
  const studio = look === 'studio';
  renderer.toneMapping = studio ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
  renderer.shadowMap.enabled = studio;
  scene.background = studio ? new THREE.Color(0x2b2b30) : BONE.clone();
  [hemi, sun, fill, floor].forEach(l => { l.visible = studio; });
  skin.material = studio ? STUDIO.skin : INK.skin;
  if (studio) { garment.material = studioClothMat.material; garment.customDepthMaterial = studioClothMat.depthMaterial; garment.customDistanceMaterial = studioClothMat.distanceMaterial; }
  else { garment.material = INK.cloth; garment.customDepthMaterial = cloth.depthMaterial; garment.customDistanceMaterial = cloth.distanceMaterial; }
  document.querySelectorAll('[data-look]').forEach(b => b.classList.toggle('on', b.dataset.look === look));
  dirty = true;
}

// ---------- motion ----------
// the lower bone's turn this frame, and its angular velocity for the trail
let lastBend = 0;
function poseBones(dt) {
  let bend = state.bend * PI / 180;
  if (state.motion !== 'still') {
    const hz = state.motion === 'jog' ? 1.5 : 0.85, amp = state.motion === 'jog' ? 0.9 : 0.5;
    state.phase += dt * 2 * PI * hz;
    bend = Math.sin(state.phase) * amp + state.bend * PI / 180 * 0.3;
  }
  [bones.lower, bones.gLower].forEach(b => { b.rotation.x = bend; });
  const omega = dt > 0 ? (bend - lastBend) / dt : 0; lastBend = bend;
  // (the trail: the cloth is read ahead along the swing - down the garment's
  // v as the limb swings forward; clamped to a few cells of uv)
  const trail = THREE.MathUtils.clamp(-omega * 0.02 * state.trail, -0.08, 0.08);
  cloth.set({ swingVector: [0, trail] });
  return omega;
}

// ---------- the camera: drag to turn, pinch / wheel to zoom ----------
const view = { target: new THREE.Vector3(0, -8, 0), dist: 150, yaw: 0.5, pitch: 0.1 };
function placeCamera() {
  const { target, dist, yaw, pitch } = view;
  camera.position.set(target.x - Math.sin(yaw) * Math.cos(pitch) * dist, target.y + Math.sin(pitch) * dist, target.z - Math.cos(yaw) * Math.cos(pitch) * dist);
  camera.lookAt(target);
}
const pts = new Map(); let pinch0 = 0, dist0 = 0;
const pinchDist = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
canvas.addEventListener('pointerdown', e => { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); canvas.setPointerCapture(e.pointerId); if (pts.size === 2) { pinch0 = pinchDist(); dist0 = view.dist; } });
canvas.addEventListener('pointermove', e => {
  const p = pts.get(e.pointerId); if (!p) return;
  if (pts.size === 1) { view.yaw -= (e.clientX - p.x) * 0.006; view.pitch = THREE.MathUtils.clamp(view.pitch + (e.clientY - p.y) * 0.006, -1.2, 1.2); dirty = true; }
  p.x = e.clientX; p.y = e.clientY;
  if (pts.size === 2 && pinch0) { view.dist = THREE.MathUtils.clamp(dist0 * pinch0 / pinchDist(), 40, 600); dirty = true; }
});
const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch0 = 0; };
canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
canvas.addEventListener('wheel', e => { view.dist = THREE.MathUtils.clamp(view.dist * (1 + e.deltaY * 0.001), 40, 600); dirty = true; e.preventDefault(); }, { passive: false });

// ---------- the dock ----------
const sliders = {};
function buildTools() {
  const box = $('#tools'); box.innerHTML = '';
  SLIDERS.forEach(([key, label, min, max, step, v, hydroOnly]) => {
    const lab = document.createElement('label'); lab.dataset.key = key; if (hydroOnly) lab.dataset.hydro = '1';
    const span = document.createElement('span'); span.textContent = label;
    const inp = document.createElement('input'); inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step; inp.value = v;
    const out = document.createElement('output'); out.textContent = Number(v).toFixed(step >= 1 ? 0 : 2);
    inp.addEventListener('input', () => {
      const x = Number(inp.value); out.textContent = x.toFixed(step >= 1 ? 0 : 2);
      if (key === 'trail' || key === 'bend') state[key] = x; else cloth.set({ [key]: x });
      dirty = true;
    });
    lab.append(span, inp, out); box.appendChild(lab); sliders[key] = inp;
  });
  syncHydro();
}
function syncHydro() { document.querySelectorAll('#tools label[data-hydro]').forEach(l => l.classList.toggle('off', state.tissue !== TISSUE_TYPE.HYDROSTATIC)); }
const NAMES = { 0: 'Rigid', 1: 'Soft', 2: 'Hydrostatic' };
document.querySelectorAll('[data-tissue]').forEach(b => b.addEventListener('click', () => {
  state.tissue = Number(b.dataset.tissue); cloth.set({ tissueType: state.tissue });
  document.querySelectorAll('[data-tissue]').forEach(o => o.classList.toggle('on', o === b));
  $('#who').textContent = NAMES[state.tissue]; syncHydro(); dirty = true;
}));
document.querySelectorAll('[data-motion]').forEach(b => b.addEventListener('click', () => {
  state.motion = b.dataset.motion; document.querySelectorAll('[data-motion]').forEach(o => o.classList.toggle('on', o === b)); dirty = true;
}));
document.querySelectorAll('[data-look]').forEach(b => b.addEventListener('click', () => setLook(b.dataset.look)));
$('#wire').addEventListener('click', () => { state.wire = !state.wire; wireMesh.visible = state.wire; $('#wire').classList.toggle('on', state.wire); dirty = true; });
$('#dockFold').addEventListener('click', () => { const f = $('#dock').classList.toggle('folded'); $('#dockFold').textContent = f ? '▸ Settings' : '▾ Settings'; });

// ---------- the loop ----------
let dirty = true, last = performance.now(), fps = 0;
function size() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true;
}
window.addEventListener('resize', size);
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  fps = fps * 0.9 + (dt > 0 ? 1 / dt : 0) * 0.1;
  state.t += dt;
  const moving = state.motion !== 'still';
  const omega = poseBones(moving ? dt : 0);
  // (the soft tissue's jiggle breathes with time: a soft piece redraws each frame)
  if (moving || state.tissue === TISSUE_TYPE.SOFT) dirty = true;
  if (dirty) {
    cloth.tick(state.t);
    placeCamera();
    burinTick(scene, camera, renderer, state.look === 'ink' ? 0 : state.t);
    renderer.render(scene, camera);
    const u = cloth.uniforms;
    $('#readout').textContent = `${fps.toFixed(0)} fps · swing ${u.u_swingVector.value.y.toFixed(3)} · ω ${omega.toFixed(1)} rad/s · gap ${((1 - u.u_clinginess.value) * u.u_drapeDistance.value).toFixed(2)} cm`;
    dirty = false;
  }
  requestAnimationFrame(loop);
}

// ---------- open: the gate first, then the bench ----------
let opened = false;
function open() {
  if (opened) return; opened = true;
  $('#bar').classList.remove('hidden'); $('#dock').classList.remove('hidden');
  buildTools();
  setLook('ink');
  size();
  requestAnimationFrame(loop);
}
// (the gate is the overlay's; it builds an anatomy panel for no figures, cleared at once)
initDevOverlay([], { onAuthed(api) { api.clear(); open(); } });
// the bench's own hook for the visual checks (scripts in a headless browser)
window.__bench = { state, cloth, setLook, step: dt => { poseBones(dt); state.t += dt; dirty = true; }, redraw: () => { dirty = true; }, view, sliders, garment, skin };
