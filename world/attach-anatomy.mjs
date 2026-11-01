// Attach the lab's procedural anatomy (figure.mjs buildAnatomy) to an
// imported, rigged body (a GLB with a Hips bone), and let it hang with
// gravity as the body poses.
//
// spec (from assets/bodies/bodies.json, "anatomy"):
//   bone   the bone it roots on (default 'Hips')
//   root   [x, y, z] the root point on the skin, in the model's rest pose, metres
//   tone   skin colour for the anatomy, CSS colour string
//   facing +1 if the model faces +z (Meshy/Mixamo), -1 if it faces -z (the lab's own men)
//   stiff  0-1, how much it keeps the hips' tilt instead of hanging plumb (default 0.2)
//   skinPatch [x, y, size] a clean skin patch on the body texture (px of a 4096 texture) for the grain
//   foldBack, lobeTuck  fit tweaks for a flatter imported pelvis (defaults 1.1, 0.8)
//
// The anatomy is built in centimetres (the lab's units) inside `pouch`,
// which is scaled to metres. Params are the lab's slider set (getAnatomy()
// keys); anything not given takes the lab's realistic-average baseline.
import * as THREE from '../assets/vendor/three/three.module.js';
import { buildAnatomy, getAnatomy, setSoft } from '../assets/intro3d/figure.mjs';

const _q = new THREE.Quaternion(), _qh = new THREE.Quaternion(), _qt = new THREE.Quaternion();
const _v = new THREE.Vector3(), _y = new THREE.Vector3(0, 1, 0);

export function attachAnatomy(model, spec, params = {}) {
  const hips = model.getObjectByName(spec.bone || 'Hips');
  if (!hips) throw new Error(`attachAnatomy: no bone "${spec.bone || 'Hips'}"`);
  model.updateMatrixWorld(true);

  // holder: sits on the hips at the root point, world-scaled to 1 and
  // world-aligned in the rest pose, so the anatomy is laid out upright
  const holder = new THREE.Group();
  holder.name = 'anatomy-holder';
  hips.add(holder);
  holder.position.copy(hips.worldToLocal(_v.fromArray(spec.root)));
  const ws = hips.getWorldScale(new THREE.Vector3());
  holder.scale.set(1 / ws.x, 1 / ws.y, 1 / ws.z);
  hips.getWorldQuaternion(_qh);
  const rest = _qh.clone().invert();          // local rotation that makes the holder world-aligned at rest
  holder.quaternion.copy(rest);

  const pouch = new THREE.Group();
  pouch.name = 'anatomy';
  pouch.userData.live = true;                 // the build-man path: root sealed into the skin
  pouch.scale.setScalar(0.01);                // cm -> m
  if ((spec.facing ?? 1) > 0) pouch.rotation.y = Math.PI;   // the lab's men face -z
  holder.add(pouch);

  const material = new THREE.MeshStandardMaterial({ color: new THREE.Color(spec.tone || '#c48b74'), roughness: 0.55, metalness: 0 });
  // skin grain: a patch of the body's own texture (spec.skinPatch = [x, y, size] in texture px), tiled
  const bodyMap = (() => { let m = null; model.traverse(o => { if (!m && o.isMesh && o.material?.map?.image) m = o.material.map; }); return m; })();
  if (bodyMap && spec.skinPatch) {
    const k = (bodyMap.image.width || 4096) / (spec.skinPatchOf || 4096);   // patch given on a 4096 texture; scale to this one
    const [px, py, ps] = spec.skinPatch.map(v => v * k), c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d'); x.drawImage(bodyMap.image, px, py, ps, ps, 0, 0, 256, 256);
    // keep only the grain: flatten the patch's own colour to a mid grey so `tone` sets the colour
    const d = x.getImageData(0, 0, 256, 256), a = d.data; let r = 0, g = 0, b = 0;
    for (let i = 0; i < a.length; i += 4) { r += a[i]; g += a[i + 1]; b += a[i + 2]; }
    const n = a.length / 4; r /= n; g /= n; b /= n;
    for (let i = 0; i < a.length; i += 4) { const l = ((a[i] - r) + (a[i + 1] - g) + (a[i + 2] - b)) / 3; a[i] = a[i + 1] = a[i + 2] = Math.max(0, Math.min(255, 235 + l * 1.4)); }
    x.putImageData(d, 0, 0);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
    t.repeat.set(spec.skinRepeat || 0.35, spec.skinRepeat || 0.35);
    material.map = t;
  }
  let current = Object.assign(getAnatomy(), params);
  const build = p => {
    current = Object.assign({}, current, p);
    setSoft(1);                               // smooth shading (the lab's engraving look uses faceted 0.8)
    try { buildAnatomy(pouch, material, current); } finally { setSoft(0.8); }
    // fold the sac's top back into the body: the lab's own men hide it inside a
    // fuller pelvis; on a flatter imported pelvis it would show as an open lip
    pouch.traverse(o => {
      if (!o.isMesh || !o.userData.sac) return;
      const P = o.geometry.attributes.position;
      for (let i = 0; i < P.count; i++) { const y = P.getY(i); if (y > -1.5) P.setZ(i, P.getZ(i) + (spec.foldBack ?? 1.1) * (y + 1.5)); }
      P.needsUpdate = true; o.geometry.computeBoundingSphere();
    });
    // tuck the lobes inside the sac (on the lab's men they read through an
    // outline; under realistic skin a lobe poking through the sac shows as a scalloped edge)
    pouch.traverse(o => { if (o.isMesh && o.userData.side) { o.scale.set(spec.lobeTuck ?? 0.8, 1, spec.lobeTuck ?? 0.8); } });
    pouch.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  };
  build({});

  const stiff = spec.stiff ?? 0.2;
  // each frame: hang plumb under gravity, keeping the hips' heading (yaw),
  // with `stiff` of the hips' own tilt kept at the root
  function update() {
    hips.getWorldQuaternion(_qh);
    _q.copy(_qh).multiply(rest);              // where the holder would be if rigidly attached
    _v.set(0, 0, 1).applyQuaternion(_q); _v.y = 0;
    const yaw = _v.lengthSq() > 1e-8 ? Math.atan2(_v.x, _v.z) : 0;
    _qt.setFromAxisAngle(_y, yaw);            // upright, facing the hips' way
    _qt.slerp(_q, stiff);
    holder.quaternion.copy(_qh.invert()).multiply(_qt);
  }

  return {
    holder, pouch, material,
    update,
    rebuild: build,
    params: () => Object.assign({}, current),
    setVisible(v) { holder.visible = v; },
    dispose() { pouch.traverse(o => o.geometry?.dispose()); material.dispose(); holder.parent?.remove(holder); }
  };
}
