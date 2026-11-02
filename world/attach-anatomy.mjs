// Attach the lab's procedural anatomy (figure.mjs buildAnatomy) to an
// imported, rigged body (a GLB with a Hips bone), and run the lab's flesh
// physics on it (flesh.mjs FleshSim): it hangs under gravity, lags behind a
// move, swings back and settles, and is pushed aside by the thighs.
//
// spec (from assets/bodies/bodies.json, "anatomy"):
//   bone   the bone it roots on (default 'Hips')
//   root   [x, y, z] the root point on the skin, in the model's rest pose, metres
//   tone   skin colour for the anatomy, CSS colour string
//   facing +1 if the model faces +z (Meshy/Mixamo), -1 if it faces -z (the lab's own men)
//   skinPatch [x, y, size] a clean skin patch on the body texture (px of a 4096 texture) for the grain
//   foldBack, lobeTuck  fit tweaks for a flatter imported pelvis (defaults 1.1, 0.8)
//   colliders { legs: [[hipBone, kneeBone], ...], thighR, belly: [fromBone, toBone], bellyR } (metres)
//   stiff  0-1, physics off only: how much it keeps the hips' tilt instead of hanging plumb (default 0.2)
//
// The anatomy is built in centimetres (the lab's units) inside `pouch`,
// which is scaled to metres; the sim is told the world is in metres
// (fig.userData.unit = 0.01). Params are the lab's slider set (getAnatomy()
// keys); anything not given takes the lab's realistic-average baseline.
import * as THREE from '../assets/vendor/three/three.module.js';
import { buildAnatomy, getAnatomy, setSoft } from '../assets/intro3d/figure.mjs';
import { FleshSim } from '../assets/intro3d/flesh.mjs';

const _q = new THREE.Quaternion(), _qh = new THREE.Quaternion(), _qt = new THREE.Quaternion();
const _v = new THREE.Vector3(), _y = new THREE.Vector3(0, 1, 0);

// the lab's sim with colliders from an imported rig's bones (world units)
class RigFleshSim extends FleshSim {
  constructor(fig, rig) { super(fig); this.rig = rig; }
  colliders() {
    this.capsules.length = 0;
    const R = this.rig;
    for (const [a, b] of R.legs) this.capsules.push({ a: a.getWorldPosition(new THREE.Vector3()), b: b.getWorldPosition(new THREE.Vector3()), r: R.thighR });
    if (R.belly) {
      const a = R.belly[0].getWorldPosition(new THREE.Vector3()), b = R.belly[1].getWorldPosition(new THREE.Vector3());
      a.lerp(b, 0.12);                        // start a little above the hips' joint, clear of the root
      this.capsules.push({ a, b, r: R.bellyR });
    }
  }
}

export function attachAnatomy(model, spec, params = {}) {
  const hips = model.getObjectByName(spec.bone || 'Hips');
  if (!hips) throw new Error(`attachAnatomy: no bone "${spec.bone || 'Hips'}"`);
  model.updateMatrixWorld(true);

  // holder: sits on the hips at the root point, world-scaled to 1, in the
  // lab's frame (front -z) in the rest pose - rigidly on the hips; the
  // physics turns the pouch inside it
  const holder = new THREE.Group();
  holder.name = 'anatomy-holder';
  hips.add(holder);
  holder.position.copy(hips.worldToLocal(_v.fromArray(spec.root)));
  const ws = hips.getWorldScale(new THREE.Vector3());
  holder.scale.set(1 / ws.x, 1 / ws.y, 1 / ws.z);
  hips.getWorldQuaternion(_qh);
  const rest = _qh.clone().invert();
  if ((spec.facing ?? 1) > 0) rest.multiply(new THREE.Quaternion().setFromAxisAngle(_y, Math.PI));   // the lab's men face -z
  holder.quaternion.copy(rest);

  const pouch = new THREE.Group();
  pouch.name = 'anatomy';
  pouch.userData.live = true;                 // the build-man path: root sealed into the skin, sac follows the lobes
  pouch.scale.setScalar(0.01);                // cm -> m
  holder.add(pouch);

  const material = new THREE.MeshStandardMaterial({ color: new THREE.Color(spec.tone || '#c48b74'), roughness: 0.55, metalness: 0 });
  // skin grain: a patch of the body's own texture, tiled
  const bodyMap = (() => { let m = null; model.traverse(o => { if (!m && o.isMesh && o.material?.map?.image) m = o.material.map; }); return m; })();
  if (bodyMap && spec.skinPatch) {
    const k = (bodyMap.image.width || 4096) / (spec.skinPatchOf || 4096);   // patch given on a 4096 texture; scale to this one
    const [px, py, ps] = spec.skinPatch.map(v => v * k), c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d'); x.drawImage(bodyMap.image, px, py, ps, ps, 0, 0, 256, 256);
    // keep only the grain: flatten the patch's own colour so `tone` sets the colour
    const d = x.getImageData(0, 0, 256, 256), a = d.data; let r = 0, g = 0, b = 0;
    for (let i = 0; i < a.length; i += 4) { r += a[i]; g += a[i + 1]; b += a[i + 2]; }
    const n = a.length / 4; r /= n; g /= n; b /= n;
    for (let i = 0; i < a.length; i += 4) { const l = ((a[i] - r) + (a[i + 1] - g) + (a[i + 2] - b)) / 3; a[i] = a[i + 1] = a[i + 2] = Math.max(0, Math.min(255, 235 + l * 1.4)); }
    x.putImageData(d, 0, 0);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
    t.repeat.set(spec.skinRepeat || 0.35, spec.skinRepeat || 0.35);
    material.map = t;
  }

  // the figure the sim reads: the pouch, a lab-frame "hips" (front -z) and the units
  const fig = { userData: { pouch, hips: holder, unit: 0.01 }, getWorldScale: v => v.set(1, 1, 1) };
  const C = spec.colliders || {};
  const bone = n => model.getObjectByName(n);
  const rig = {
    legs: (C.legs || [['LeftUpLeg', 'LeftLeg'], ['RightUpLeg', 'RightLeg']]).map(([a, b]) => [bone(a), bone(b)]).filter(([a, b]) => a && b),
    thighR: C.thighR ?? 0.06,
    belly: (() => { const [a, b] = C.belly || [spec.bone || 'Hips', 'Spine01']; return bone(a) && bone(b) ? [bone(a), bone(b)] : null; })(),
    bellyR: C.bellyR ?? 0.085
  };
  const sim = new RigFleshSim(fig, rig);
  let physics = true;

  const foldSac = sac => {
    const P = sac.geometry.attributes.position, f = spec.foldBack ?? 1.1;
    for (let i = 0; i < P.count; i++) { const y = P.getY(i); if (y > -1.5) P.setZ(i, P.getZ(i) + f * (y + 1.5)); }
    P.needsUpdate = true; sac.geometry.computeVertexNormals(); sac.geometry.computeBoundingSphere();
  };

  let current = Object.assign(getAnatomy(), params);
  const build = p => {
    current = Object.assign({}, current, p);
    setSoft(1);                               // smooth shading (the lab's engraving look uses faceted 0.8)
    try { buildAnatomy(pouch, material, current); } finally { setSoft(0.8); }
    const g = pouch.children[0], u = g.userData;
    // fold the sac's top back into the body (the lab's men hide it inside a
    // fuller pelvis) - again each time the physics reshapes the sac
    if (u.sac) {
      foldSac(u.sac);
      if (u.updateSac) { const re = u.updateSac; u.updateSac = () => { re(); foldSac(u.sac); }; }
    }
    // tuck the lobes inside the sac (a lobe poking through shows as a scalloped edge)
    for (const lb of u.lobes || []) lb.scale.set(spec.lobeTuck ?? 0.8, 1, spec.lobeTuck ?? 0.8);
    pouch.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    sim.reset();
  };
  build({});

  // physics off: hang plumb, keeping the hips' heading, `stiff` of their tilt
  const stiff = spec.stiff ?? 0.2;
  function plumb() {
    hips.getWorldQuaternion(_qh);
    _q.copy(_qh).multiply(rest);
    _v.set(0, 0, -1).applyQuaternion(_q); _v.y = 0;          // the lab frame's front
    const yaw = _v.lengthSq() > 1e-8 ? Math.atan2(-_v.x, -_v.z) : 0;
    _qt.setFromAxisAngle(_y, yaw).slerp(_q, stiff);
    holder.quaternion.copy(_qh.invert()).multiply(_qt);
  }

  return {
    holder, pouch, material, sim,
    // dt in seconds; returns true while it is still moving
    update(dt = 1 / 60) {
      if (!physics) { plumb(); return false; }
      holder.quaternion.copy(rest);
      holder.updateMatrixWorld(true);
      return sim.step(Math.min(dt, 0.05));
    },
    setPhysics(on) {
      physics = on;
      if (on) { holder.quaternion.copy(rest); sim.reset(); }
      else { pouch.quaternion.identity(); build({}); }
    },
    get physics() { return physics; },
    // the lab's looseness (sway slider, 1 = baseline) and rest angle (radians forward)
    tune({ sway, rest: restAngle } = {}) {
      if (sway != null) build({ sway });
      if (restAngle != null) sim.rest = restAngle;
    },
    rebuild: build,
    params: () => Object.assign({}, current),
    setVisible(v) { holder.visible = v; },
    dispose() { pouch.traverse(o => o.geometry?.dispose()); material.dispose(); holder.parent?.remove(holder); }
  };
}
