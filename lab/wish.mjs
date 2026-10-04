// Wish Room prototype: say what you wish for and it appears.
// A placeholder block with the thing's emoji lands at once, then the object
// refines in front of you: block -> wire sketch -> clay -> finished.
// The finished model comes from WISH_GENERATOR when one is plugged in
// (Braxtonius's text-to-visual generator), otherwise from the small
// procedural library below. See claude/wish-room-3d.md in the project.
import * as THREE from '../assets/vendor/three/three.module.js';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- the room ----------

const canvas = document.getElementById('wishCanvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d0b10);
scene.fog = new THREE.Fog(0x0d0b10, 9, 22);

const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 60);

scene.add(new THREE.HemisphereLight(0xffe9c8, 0x1a1420, 0.55));
const key = new THREE.DirectionalLight(0xfff1dc, 2.2);
key.position.set(3.5, 6, 2.5);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.left = -4; key.shadow.camera.right = 4;
key.shadow.camera.top = 4; key.shadow.camera.bottom = -4;
key.shadow.bias = -0.0004;
scene.add(key);
const rim = new THREE.PointLight(0x8f6bff, 6, 12, 2);
rim.position.set(-3, 2.2, -2.5);
scene.add(rim);

function std(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...opts });
}
function mesh(geo, mat, cast = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
}

// floor, rug and a low round table everything lands on
const floor = mesh(new THREE.CircleGeometry(30, 64), std(0x1a1519, { roughness: 0.9 }), false);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);
const rug = mesh(new THREE.CircleGeometry(3.4, 64), std(0x3a1f2c, { roughness: 1 }), false);
rug.rotation.x = -Math.PI / 2;
rug.position.y = 0.005;
scene.add(rug);
const rugRing = mesh(new THREE.RingGeometry(3.15, 3.25, 96), std(0xc9a45a, { roughness: 0.5, metalness: 0.6 }), false);
rugRing.rotation.x = -Math.PI / 2;
rugRing.position.y = 0.007;
scene.add(rugRing);

const TABLE_Y = 0.62;
const table = new THREE.Group();
const top = mesh(new THREE.CylinderGeometry(1.55, 1.55, 0.08, 64), std(0x3b2417, { roughness: 0.45 }));
top.position.y = TABLE_Y - 0.04;
const edge = mesh(new THREE.TorusGeometry(1.55, 0.025, 12, 96), std(0xc9a45a, { roughness: 0.3, metalness: 0.9 }));
edge.rotation.x = Math.PI / 2;
edge.position.y = TABLE_Y - 0.01;
const stem = mesh(new THREE.CylinderGeometry(0.12, 0.18, TABLE_Y - 0.08, 24), std(0x241510));
stem.position.y = (TABLE_Y - 0.08) / 2;
const foot = mesh(new THREE.CylinderGeometry(0.6, 0.65, 0.05, 48), std(0x241510));
foot.position.y = 0.025;
table.add(top, edge, stem, foot);
scene.add(table);

// ---------- camera: drag to orbit, pinch or wheel to zoom ----------

const view = { yaw: 0.5, pitch: 0.55, dist: window.innerWidth < window.innerHeight ? 7 : 5.2, target: new THREE.Vector3(0, TABLE_Y + 0.25, 0) };
function placeCamera() {
  const c = Math.cos(view.pitch);
  camera.position.set(
    view.target.x + view.dist * c * Math.sin(view.yaw),
    view.target.y + view.dist * Math.sin(view.pitch),
    view.target.z + view.dist * c * Math.cos(view.yaw)
  );
  camera.lookAt(view.target);
}
const pointers = new Map();
let pinchStart = 0;
let pinchDist = 0;
let idleSpin = true;
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  idleSpin = false;
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinchStart = Math.hypot(a.x - b.x, a.y - b.y);
    pinchDist = view.dist;
  }
});
canvas.addEventListener('pointermove', e => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  if (pointers.size === 1) {
    view.yaw -= (e.clientX - p.x) * 0.006;
    view.pitch = THREE.MathUtils.clamp(view.pitch + (e.clientY - p.y) * 0.004, 0.12, 1.25);
  }
  p.x = e.clientX; p.y = e.clientY;
  if (pointers.size === 2 && pinchStart) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    view.dist = THREE.MathUtils.clamp(pinchDist * pinchStart / Math.max(d, 1), 2.2, 10);
  }
});
function endPointer(e) { pointers.delete(e.pointerId); if (pointers.size < 2) pinchStart = 0; }
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  view.dist = THREE.MathUtils.clamp(view.dist * (1 + e.deltaY * 0.001), 2.2, 10);
}, { passive: false });

// ---------- the procedural library ----------
// Each entry: words that call it, an emoji for the placeholder, the box it
// fills (w, h, d in metres, so the placeholder is the right size), and a
// builder that returns the finished Group with its base at y = 0.

function lathe(points, segs = 48) {
  return new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), segs);
}
function rand(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function buildDonut(r = rand(7)) {
  const g = new THREE.Group();
  const dough = mesh(new THREE.TorusGeometry(0.11, 0.055, 24, 48), std(0xc8873f, { roughness: 0.75 }));
  dough.rotation.x = Math.PI / 2;
  dough.position.y = 0.055;
  // icing: a flattened, slightly wavy torus sitting on top
  const icingGeo = new THREE.TorusGeometry(0.11, 0.05, 24, 64);
  const pos = icingGeo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const ang = Math.atan2(v.y, v.x);
    v.z = Math.max(v.z, -0.004 - 0.008 * Math.sin(ang * 7)) * 0.75;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  icingGeo.computeVertexNormals();
  const icingColors = [0xff7fb6, 0x6b3a26, 0xfff3e6, 0x8fd3ff];
  const icing = mesh(icingGeo, std(icingColors[Math.floor(r() * icingColors.length)], { roughness: 0.35 }));
  icing.rotation.x = -Math.PI / 2;
  icing.position.y = 0.072;
  g.add(dough, icing);
  const sprinkleColors = [0xffe14d, 0x4dd2ff, 0xff4d6d, 0x7dff8a, 0xffffff];
  const sGeo = new THREE.CapsuleGeometry(0.0045, 0.014, 2, 6);
  for (let i = 0; i < 36; i++) {
    const a = r() * Math.PI * 2;
    const rad = 0.075 + r() * 0.07;
    const s = mesh(sGeo, std(sprinkleColors[i % sprinkleColors.length], { roughness: 0.4 }), false);
    s.position.set(Math.cos(a) * rad, 0.112, Math.sin(a) * rad);
    s.rotation.set(Math.PI / 2, 0, r() * Math.PI);
    g.add(s);
  }
  return g;
}
function buildDonuts() {
  const g = new THREE.Group();
  const plate = mesh(lathe([[0, 0], [0.3, 0], [0.34, 0.02], [0.36, 0.035], [0.35, 0.04], [0.3, 0.018], [0, 0.018]], 64), std(0xf4efe6, { roughness: 0.25 }));
  g.add(plate);
  [[-0.13, 0.02, 0.06, 3], [0.13, 0.02, 0.05, 11], [0, 0.11, -0.12, 23]].forEach(([x, y, z, seed], i) => {
    const d = buildDonut(rand(seed));
    d.position.set(x, 0.018 + (i === 2 ? 0.0 : 0), z);
    d.rotation.y = seed;
    g.add(d);
  });
  return g;
}
function buildPizza() {
  const g = new THREE.Group();
  const crust = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.025, 48), std(0xd8a15a, { roughness: 0.8 }));
  crust.position.y = 0.0125;
  const rimT = mesh(new THREE.TorusGeometry(0.29, 0.022, 12, 64), std(0xc98a43, { roughness: 0.85 }));
  rimT.rotation.x = Math.PI / 2; rimT.position.y = 0.028;
  const sauce = mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.006, 48), std(0xb8361f, { roughness: 0.6 }), false);
  sauce.position.y = 0.028;
  const cheese = mesh(new THREE.CylinderGeometry(0.255, 0.255, 0.006, 48), std(0xf6d67a, { roughness: 0.5 }), false);
  cheese.position.y = 0.032;
  g.add(crust, rimT, sauce, cheese);
  const r = rand(5);
  const pep = new THREE.CylinderGeometry(0.035, 0.035, 0.006, 20);
  for (let i = 0; i < 11; i++) {
    const a = r() * Math.PI * 2, d = 0.05 + r() * 0.17;
    const p = mesh(pep, std(0x9e2a1c, { roughness: 0.5 }), false);
    p.position.set(Math.cos(a) * d, 0.037, Math.sin(a) * d);
    g.add(p);
  }
  return g;
}
function buildCake() {
  const g = new THREE.Group();
  const plate = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.015, 48), std(0xf4efe6, { roughness: 0.25 }));
  plate.position.y = 0.0075;
  const tier1 = mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.16, 48), std(0xffd9e6, { roughness: 0.55 }));
  tier1.position.y = 0.095;
  const tier2 = mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.13, 48), std(0xfff3e6, { roughness: 0.55 }));
  tier2.position.y = 0.24;
  const drip1 = mesh(new THREE.TorusGeometry(0.22, 0.018, 10, 64), std(0xff7fb6, { roughness: 0.3 }));
  drip1.rotation.x = Math.PI / 2; drip1.position.y = 0.172;
  const drip2 = mesh(new THREE.TorusGeometry(0.15, 0.016, 10, 64), std(0xff7fb6, { roughness: 0.3 }));
  drip2.rotation.x = Math.PI / 2; drip2.position.y = 0.302;
  const candle = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.09, 12), std(0x7fc8ff));
  candle.position.y = 0.35;
  const flame = mesh(new THREE.SphereGeometry(0.016, 12, 10), new THREE.MeshStandardMaterial({ color: 0xffb340, emissive: 0xff9a1f, emissiveIntensity: 3 }), false);
  flame.scale.set(1, 1.7, 1); flame.position.y = 0.41;
  const glow = new THREE.PointLight(0xffa040, 0.8, 1.2, 2);
  glow.position.y = 0.42;
  g.add(plate, tier1, tier2, drip1, drip2, candle, flame, glow);
  return g;
}
function buildCoffee() {
  const g = new THREE.Group();
  const saucer = mesh(lathe([[0, 0], [0.16, 0], [0.19, 0.015], [0.18, 0.02], [0, 0.012]], 48), std(0xf4efe6, { roughness: 0.25 }));
  const cup = mesh(lathe([[0, 0.015], [0.07, 0.015], [0.085, 0.04], [0.09, 0.14], [0.082, 0.14], [0.078, 0.045], [0, 0.04]], 48), std(0xf7f3ec, { roughness: 0.2, side: THREE.DoubleSide }));
  const handle = mesh(new THREE.TorusGeometry(0.035, 0.009, 10, 24, Math.PI * 1.3), std(0xf7f3ec, { roughness: 0.2 }));
  handle.position.set(0.1, 0.09, 0); handle.rotation.z = -Math.PI * 0.65;
  const coffee = mesh(new THREE.CircleGeometry(0.08, 32), std(0x3b2010, { roughness: 0.15 }), false);
  coffee.rotation.x = -Math.PI / 2; coffee.position.y = 0.125;
  g.add(saucer, cup, handle, coffee);
  return g;
}
function buildBurger() {
  const g = new THREE.Group();
  const bunMat = std(0xd08a3c, { roughness: 0.55 });
  const bottom = mesh(new THREE.CylinderGeometry(0.15, 0.14, 0.04, 40), bunMat);
  bottom.position.y = 0.02;
  const patty = mesh(new THREE.CylinderGeometry(0.155, 0.155, 0.04, 40), std(0x4a2a1a, { roughness: 0.9 }));
  patty.position.y = 0.06;
  const cheese = mesh(new THREE.BoxGeometry(0.29, 0.01, 0.29), std(0xffc21f, { roughness: 0.4 }));
  cheese.position.y = 0.085; cheese.rotation.y = Math.PI / 4;
  const lettuce = mesh(new THREE.CylinderGeometry(0.165, 0.165, 0.012, 24), std(0x5cbf3a, { roughness: 0.7 }));
  lettuce.position.y = 0.096;
  const topBun = mesh(new THREE.SphereGeometry(0.155, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), bunMat);
  topBun.scale.y = 0.6; topBun.position.y = 0.102;
  g.add(bottom, patty, cheese, lettuce, topBun);
  const r = rand(9);
  const seed = new THREE.SphereGeometry(0.006, 6, 4);
  for (let i = 0; i < 22; i++) {
    const th = r() * Math.PI * 2, ph = 0.25 + r() * 0.9;
    const s = mesh(seed, std(0xfff1cf), false);
    s.scale.set(1, 0.5, 1.6);
    s.position.set(Math.cos(th) * Math.sin(ph) * 0.155, 0.102 + Math.cos(ph) * 0.093, Math.sin(th) * Math.sin(ph) * 0.155);
    g.add(s);
  }
  return g;
}
function buildDice() {
  const g = new THREE.Group();
  const pip = new THREE.SphereGeometry(0.011, 10, 8);
  const faces = [
    [new THREE.Vector3(0, 1, 0), [[0, 0]]],
    [new THREE.Vector3(1, 0, 0), [[-1, -1], [1, 1]]],
    [new THREE.Vector3(0, 0, 1), [[-1, -1], [0, 0], [1, 1]]]
  ];
  [[-0.08, 0.3], [0.09, -0.5]].forEach(([x, rot], k) => {
    const die = new THREE.Group();
    const body = mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), std(k ? 0xd8202a : 0xf4f0e8, { roughness: 0.25 }));
    die.add(body);
    faces.forEach(([n, spots]) => {
      spots.forEach(([a, b]) => {
        const p = mesh(pip, std(k ? 0xffffff : 0x111111, { roughness: 0.4 }), false);
        const off = 0.032;
        if (n.y) p.position.set(a * off, 0.06, b * off);
        else if (n.x) p.position.set(0.06, a * off, b * off);
        else p.position.set(a * off, b * off, 0.06);
        die.add(p);
      });
    });
    die.position.set(x, 0.06, k ? 0.05 : -0.04);
    die.rotation.y = rot;
    g.add(die);
  });
  return g;
}
function buildPlant() {
  const g = new THREE.Group();
  const pot = mesh(lathe([[0, 0], [0.09, 0], [0.12, 0.17], [0.13, 0.18], [0.13, 0.2], [0.115, 0.2], [0.105, 0.18], [0, 0.18]], 40), std(0xc0603a, { roughness: 0.85 }));
  const soil = mesh(new THREE.CircleGeometry(0.11, 24), std(0x2b1d14, { roughness: 1 }), false);
  soil.rotation.x = -Math.PI / 2; soil.position.y = 0.185;
  g.add(pot, soil);
  const r = rand(4);
  const leafGeo = new THREE.SphereGeometry(0.06, 12, 8);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + r() * 0.4;
    const h = 0.24 + r() * 0.22;
    const stalk = mesh(new THREE.CylinderGeometry(0.004, 0.006, h - 0.18, 6), std(0x3d7a2a), false);
    stalk.position.set(Math.cos(a) * 0.04, 0.18 + (h - 0.18) / 2, Math.sin(a) * 0.04);
    stalk.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
    const leaf = mesh(leafGeo, std(i % 2 ? 0x3fa34d : 0x2e8a3e, { roughness: 0.6 }));
    leaf.scale.set(0.55, 0.18, 1.3);
    leaf.position.set(Math.cos(a) * 0.1, h, Math.sin(a) * 0.1);
    leaf.rotation.y = -a;
    g.add(stalk, leaf);
  }
  return g;
}
function buildTrophy() {
  const g = new THREE.Group();
  const gold = std(0xe2b84a, { roughness: 0.22, metalness: 1 });
  const base = mesh(new THREE.BoxGeometry(0.2, 0.06, 0.2), std(0x1b1b1f, { roughness: 0.4 }));
  base.position.y = 0.03;
  const cup = mesh(lathe([[0.02, 0.06], [0.06, 0.07], [0.025, 0.1], [0.02, 0.17], [0.03, 0.19], [0.1, 0.24], [0.12, 0.36], [0.112, 0.36], [0.09, 0.25], [0, 0.24]], 48), std(0xe2b84a, { roughness: 0.3, metalness: 0.6, side: THREE.DoubleSide }));
  const h1 = mesh(new THREE.TorusGeometry(0.045, 0.01, 10, 24, Math.PI), gold);
  h1.position.set(0.12, 0.3, 0); h1.rotation.z = -Math.PI / 2;
  const h2 = h1.clone(); h2.position.x = -0.12; h2.rotation.z = Math.PI / 2;
  g.add(base, cup, h1, h2);
  return g;
}
function buildBall() {
  const g = new THREE.Group();
  const ball = mesh(new THREE.SphereGeometry(0.12, 40, 28), std(0xe8742a, { roughness: 0.75 }));
  ball.position.y = 0.12;
  const seamMat = std(0x1a1010, { roughness: 0.8 });
  const s1 = mesh(new THREE.TorusGeometry(0.1205, 0.003, 6, 64), seamMat, false);
  s1.position.y = 0.12;
  const s2 = s1.clone(); s2.rotation.y = Math.PI / 2;
  const s3 = s1.clone(); s3.rotation.x = Math.PI / 2;
  g.add(ball, s1, s2, s3);
  return g;
}
function buildLamp() {
  const g = new THREE.Group();
  const brass = std(0xc9a45a, { roughness: 0.3, metalness: 0.9 });
  const base = mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.03, 32), brass);
  base.position.y = 0.015;
  const pole = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.36, 12), brass);
  pole.position.y = 0.2;
  const shade = mesh(lathe([[0.16, 0], [0.09, 0.16], [0.088, 0.16], [0.155, 0.005]], 40), std(0xf2e2c2, { roughness: 0.9, side: THREE.DoubleSide, emissive: 0xffc070, emissiveIntensity: 0.35 }));
  shade.position.y = 0.3;
  const bulb = mesh(new THREE.SphereGeometry(0.028, 16, 12), new THREE.MeshStandardMaterial({ color: 0xfff0c0, emissive: 0xffd27a, emissiveIntensity: 2.5 }), false);
  bulb.position.y = 0.36;
  const light = new THREE.PointLight(0xffc878, 1.6, 2.5, 2);
  light.position.y = 0.36;
  g.add(base, pole, shade, bulb, light);
  return g;
}
function buildGift() {
  const g = new THREE.Group();
  const box = mesh(new THREE.BoxGeometry(0.24, 0.18, 0.24), std(0x2a6fdb, { roughness: 0.45 }));
  box.position.y = 0.09;
  const ribbonMat = std(0xf2c94c, { roughness: 0.3, metalness: 0.4 });
  const r1 = mesh(new THREE.BoxGeometry(0.245, 0.185, 0.04), ribbonMat);
  r1.position.y = 0.09;
  const r2 = mesh(new THREE.BoxGeometry(0.04, 0.185, 0.245), ribbonMat);
  r2.position.y = 0.09;
  const bowL = mesh(new THREE.TorusGeometry(0.035, 0.012, 10, 24), ribbonMat);
  bowL.position.set(-0.03, 0.2, 0); bowL.rotation.set(0, Math.PI / 2, 0.6);
  const bowR = bowL.clone(); bowR.position.x = 0.03; bowR.rotation.z = -0.6;
  g.add(box, r1, r2, bowL, bowR);
  return g;
}
function buildIceCream() {
  const g = new THREE.Group();
  const cone = mesh(new THREE.ConeGeometry(0.055, 0.2, 24, 1, true), std(0xd9a35b, { roughness: 0.8, side: THREE.DoubleSide }));
  cone.rotation.x = Math.PI; cone.position.y = 0.1;
  const s1 = mesh(new THREE.SphereGeometry(0.065, 24, 16), std(0xffc9dc, { roughness: 0.6 }));
  s1.position.y = 0.23;
  const s2 = mesh(new THREE.SphereGeometry(0.058, 24, 16), std(0x6b3a26, { roughness: 0.6 }));
  s2.position.y = 0.32;
  const cherry = mesh(new THREE.SphereGeometry(0.018, 12, 10), std(0xd0101a, { roughness: 0.2 }));
  cherry.position.y = 0.385;
  g.add(cone, s1, s2, cherry);
  return g;
}
function buildApple() {
  const g = new THREE.Group();
  const apple = mesh(lathe([[0, 0.01], [0.05, 0], [0.1, 0.04], [0.11, 0.1], [0.09, 0.16], [0.04, 0.17], [0.01, 0.155], [0, 0.15]], 40), std(0xc8202a, { roughness: 0.35 }));
  const stalk = mesh(new THREE.CylinderGeometry(0.004, 0.005, 0.05, 6), std(0x4a2e1a));
  stalk.position.y = 0.175; stalk.rotation.z = 0.2;
  const leaf = mesh(new THREE.SphereGeometry(0.03, 10, 6), std(0x3fa34d));
  leaf.scale.set(1, 0.2, 0.5); leaf.position.set(0.025, 0.19, 0);
  g.add(apple, stalk, leaf);
  return g;
}

const LIBRARY = [
  { words: ['donut', 'doughnut'], emoji: '🍩', size: [0.72, 0.24, 0.72], build: buildDonuts, single: () => buildDonut() },
  { words: ['pizza'], emoji: '🍕', size: [0.62, 0.06, 0.62], build: buildPizza },
  { words: ['cake', 'birthday'], emoji: '🎂', size: [0.6, 0.44, 0.6], build: buildCake },
  { words: ['coffee', 'latte', 'espresso', 'cappuccino', 'mug', 'tea'], emoji: '☕', size: [0.38, 0.15, 0.38], build: buildCoffee },
  { words: ['burger', 'hamburger', 'cheeseburger'], emoji: '🍔', size: [0.33, 0.2, 0.33], build: buildBurger },
  { words: ['dice', 'die'], emoji: '🎲', size: [0.34, 0.13, 0.3], build: buildDice },
  { words: ['plant', 'flower', 'tree', 'succulent'], emoji: '🪴', size: [0.4, 0.48, 0.4], build: buildPlant },
  { words: ['trophy', 'cup', 'award', 'prize'], emoji: '🏆', size: [0.34, 0.37, 0.22], build: buildTrophy },
  { words: ['ball', 'basketball'], emoji: '🏀', size: [0.24, 0.24, 0.24], build: buildBall },
  { words: ['lamp', 'light'], emoji: '💡', size: [0.32, 0.47, 0.32], build: buildLamp },
  { words: ['gift', 'present', 'box'], emoji: '🎁', size: [0.26, 0.23, 0.26], build: buildGift },
  { words: ['ice cream', 'icecream', 'cone', 'gelato'], emoji: '🍦', size: [0.14, 0.4, 0.14], build: buildIceCream },
  { words: ['apple'], emoji: '🍎', size: [0.22, 0.21, 0.22], build: buildApple }
];

// Emoji guesses for things the library cannot build yet.
const EMOJI_GUESS = {
  cookie: '🍪', cookies: '🍪', taco: '🌮', fries: '🍟', hotdog: '🌭', sushi: '🍣', beer: '🍺', wine: '🍷', cocktail: '🍸',
  money: '💰', cash: '💵', coin: '🪙', diamond: '💎', crown: '👑', rocket: '🚀', guitar: '🎸', cat: '🐈', dog: '🐕',
  star: '⭐', heart: '❤️', fire: '🔥', moon: '🌙', sun: '☀️', car: '🚗', banana: '🍌', cherry: '🍒', popcorn: '🍿',
  candy: '🍬', chocolate: '🍫', balloon: '🎈', clover: '🍀', slot: '🎰', cards: '🃏', chips: '🪙', bone: '🦴', skull: '💀'
};

// ---------- reading the wish ----------

const FILLER = /\b(i\s+wish\s+(i\s+had|there\s+(was|were))|i\s+want|give\s+me|can\s+i\s+(get|have)|gimme|bring\s+me|make\s+me|spawn|please|right\s+now|some|a\s+few|a|an|the|of|here|now)\b/g;

export function readWish(text) {
  const raw = String(text || '').trim();
  const clean = raw.toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, ' ').replace(FILLER, ' ').replace(/\s+/g, ' ').trim();
  for (const item of LIBRARY) {
    for (const w of item.words) {
      const re = new RegExp(`\\b${w}(e?s)?\\b`);
      const m = clean.match(re);
      if (m) return { raw, label: clean || w, item, plural: Boolean(m[1]) };
    }
  }
  const word = clean.split(' ').find(t => EMOJI_GUESS[t] || EMOJI_GUESS[t.replace(/s$/, '')]) || '';
  const emoji = EMOJI_GUESS[word] || EMOJI_GUESS[word.replace(/s$/, '')] || '✨';
  return { raw, label: clean || raw || 'something', item: null, emoji, plural: false };
}

// ---------- the stages ----------

function emojiTexture(emoji, glow = '#b48cff') {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  const grd = x.createRadialGradient(128, 128, 20, 128, 128, 128);
  grd.addColorStop(0, 'rgba(255,255,255,0.22)');
  grd.addColorStop(1, 'rgba(255,255,255,0.02)');
  x.fillStyle = grd;
  x.fillRect(0, 0, 256, 256);
  x.strokeStyle = glow;
  x.lineWidth = 10;
  x.strokeRect(8, 8, 240, 240);
  x.font = '150px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(emoji, 128, 140);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makePlaceholder(emoji, [w, h, d]) {
  const g = new THREE.Group();
  const tex = emojiTexture(emoji);
  const mat = new THREE.MeshStandardMaterial({ map: tex, color: 0xffffff, emissive: 0x6b4bd6, emissiveIntensity: 0.35, transparent: true, opacity: 0.92, roughness: 0.4 });
  const box = mesh(new THREE.BoxGeometry(Math.max(w, 0.16), Math.max(h, 0.16), Math.max(d, 0.16)), mat);
  box.position.y = Math.max(h, 0.16) / 2;
  const lines = new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry), new THREE.LineBasicMaterial({ color: 0xc9b2ff, transparent: true }));
  lines.position.copy(box.position);
  g.add(box, lines);
  g.userData.fade = [mat, lines.material];
  return g;
}

function eachMesh(obj, fn) {
  obj.traverse(o => { if (o.isMesh) fn(o); });
}
function rememberMaterials(obj) {
  eachMesh(obj, m => { m.userData.finalMat = m.material; });
}
function setLook(obj, look) {
  eachMesh(obj, m => {
    if (look === 'final') { m.material = m.userData.finalMat; return; }
    if (!m.userData[look]) {
      m.userData[look] = look === 'wire'
        ? new THREE.MeshBasicMaterial({ color: 0x9fe8ff, wireframe: true, transparent: true, opacity: 0.85 })
        : new THREE.MeshStandardMaterial({ color: 0xb9b2ad, roughness: 0.8, flatShading: true, transparent: true });
    }
    m.material = m.userData[look];
  });
  obj.traverse(o => { if (o.isLight) o.visible = look === 'final'; });
}
function setOpacity(obj, a) {
  eachMesh(obj, m => {
    const mat = m.material;
    if (!mat.userData.baseOpacity) mat.userData.baseOpacity = mat.opacity;
    mat.transparent = a < 1 || mat.userData.baseOpacity < 1;
    mat.opacity = mat.userData.baseOpacity * a;
  });
}

// scale a model so it fits the box its placeholder promised
function fitTo(obj, [w, h, d]) {
  const b = new THREE.Box3().setFromObject(obj);
  const s = b.getSize(new THREE.Vector3());
  const k = Math.min(w / Math.max(s.x, 1e-3), h / Math.max(s.y, 1e-3), d / Math.max(s.z, 1e-3));
  if (k < 0.8 || k > 1.25) obj.scale.multiplyScalar(k);
}

function emojiToken(emoji) {
  const g = new THREE.Group();
  const stand = mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.03, 32), std(0xc9a45a, { roughness: 0.3, metalness: 0.9 }));
  stand.position.y = 0.015;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(emoji, 'rgba(0,0,0,0)'), transparent: true }));
  sprite.scale.set(0.3, 0.3, 0.3);
  sprite.position.y = 0.22;
  sprite.userData.bob = true;
  g.add(stand, sprite);
  return g;
}

// ---------- spawning ----------

const SLOTS = [[0, 0], [0.75, 0.35], [-0.75, 0.35], [0.45, -0.7], [-0.45, -0.7], [0, 0.95], [1.05, -0.2], [-1.05, -0.2]];
const spawned = [];
const tweens = [];
let slotIndex = 0;

function tween(ms, step, done) {
  const t = { start: performance.now(), ms: reducedMotion ? Math.min(ms, 120) : ms, step, done };
  tweens.push(t);
  return t;
}
const wait = ms => new Promise(res => setTimeout(res, reducedMotion ? Math.min(ms, 150) : ms));
const ease = x => 1 - Math.pow(1 - x, 3);
function bounce(x) {
  const n1 = 7.5625, d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
  if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
  return n1 * (x -= 2.625 / d1) * x + 0.984375;
}
function crossfade(from, to, ms) {
  return new Promise(res => {
    to.visible = true;
    setOpacity(to, 0);
    tween(ms, k => { setOpacity(to, ease(k)); if (from) setOpacity(from, 1 - ease(k)); }, () => { if (from) from.visible = false; setOpacity(to, 1); res(); });
  });
}

// a ring that sweeps up through the object while it changes
function scanRing(group, w, h) {
  const ring = new THREE.Mesh(new THREE.RingGeometry(Math.max(w, 0.2) * 0.62, Math.max(w, 0.2) * 0.68, 64), new THREE.MeshBasicMaterial({ color: 0xb48cff, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  group.add(ring);
  tween(900, k => { ring.position.y = k * (h + 0.05); ring.material.opacity = 0.8 * (1 - k); }, () => { group.remove(ring); ring.geometry.dispose(); ring.material.dispose(); });
}

function sparkle(group, h) {
  const n = 40;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  const vel = [];
  for (let i = 0; i < n; i++) {
    pos.set([0, h * 0.6, 0], i * 3);
    vel.push(new THREE.Vector3((Math.random() - 0.5) * 1.2, Math.random() * 1.4, (Math.random() - 0.5) * 1.2));
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffe08a, size: 0.025, transparent: true }));
  group.add(pts);
  tween(900, k => {
    for (let i = 0; i < n; i++) {
      pos[i * 3] = vel[i].x * k * 0.5;
      pos[i * 3 + 1] = h * 0.6 + vel[i].y * k * 0.5 - k * k * 0.4;
      pos[i * 3 + 2] = vel[i].z * k * 0.5;
    }
    geo.attributes.position.needsUpdate = true;
    pts.material.opacity = 1 - k;
  }, () => { group.remove(pts); geo.dispose(); pts.material.dispose(); });
}

const STAGE_LABELS = ['Placing it', 'Sketching the shape', 'Sculpting', 'Painting it in', 'Ready'];

async function finalModel(wish) {
  if (typeof window.WISH_GENERATOR === 'function') {
    try {
      const out = await window.WISH_GENERATOR(wish.raw, { THREE });
      if (out && out.object && out.object.isObject3D) return out.object;
    } catch (err) {
      console.warn('WISH_GENERATOR failed, using the built-in model', err);
    }
  }
  if (wish.item) {
    if (!wish.plural && wish.item.single) return wish.item.single();
    return wish.item.build();
  }
  return emojiToken(wish.emoji);
}

export async function grantWish(text, onStage = () => {}) {
  const wish = readWish(text);
  const size = wish.item ? (wish.plural || !wish.item.single ? wish.item.size : [0.33, 0.12, 0.33]) : [0.26, 0.36, 0.26];
  const emoji = wish.item ? wish.item.emoji : wish.emoji;
  const [sx, sz] = SLOTS[slotIndex++ % SLOTS.length];
  const holder = new THREE.Group();
  holder.position.set(sx, TABLE_Y, sz);
  holder.rotation.y = Math.atan2(camera.position.x - sx, camera.position.z - sz);
  scene.add(holder);
  const old = spawned.find(s => s.slot === (slotIndex - 1) % SLOTS.length);
  if (old) removeSpawn(old);
  const entry = { holder, slot: (slotIndex - 1) % SLOTS.length, label: wish.label };
  spawned.push(entry);

  // 1. placeholder drops in at once
  onStage(0, wish, emoji);
  const block = makePlaceholder(emoji, size);
  holder.add(block);
  await new Promise(res => tween(650, k => { block.position.y = (1 - bounce(k)) * 1.6; }, res));

  // build the real thing while the block sits there
  const model = await finalModel(wish);
  rememberMaterials(model);
  fitTo(model, size);
  model.visible = false;
  holder.add(model);
  await wait(350);

  // 2. wire sketch
  onStage(1, wish, emoji);
  setLook(model, 'wire');
  scanRing(holder, size[0], size[1]);
  await crossfade(block, model, 600);
  holder.remove(block);
  await wait(700);

  // 3. clay
  onStage(2, wish, emoji);
  scanRing(holder, size[0], size[1]);
  setLook(model, 'clay');
  setOpacity(model, 0.4);
  await new Promise(res => tween(500, k => setOpacity(model, 0.4 + 0.6 * k), res));
  await wait(800);

  // 4. finished
  onStage(3, wish, emoji);
  scanRing(holder, size[0], size[1]);
  setLook(model, 'final');
  setOpacity(model, 0.3);
  await new Promise(res => tween(700, k => setOpacity(model, 0.3 + 0.7 * ease(k)), res));
  sparkle(holder, size[1]);
  onStage(4, wish, emoji);
  entry.model = model;
  return wish;
}

function removeSpawn(entry) {
  scene.remove(entry.holder);
  entry.holder.traverse(o => {
    if (o.geometry) o.geometry.dispose();
  });
  spawned.splice(spawned.indexOf(entry), 1);
}
export function clearWishes() {
  [...spawned].forEach(removeSpawn);
  slotIndex = 0;
}

// ---------- loop ----------

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(h, 1);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

let lastNow = performance.now();
function frame(now) {
  const dt = Math.min((now - lastNow) / 1000, 0.05);
  lastNow = now;
  for (let i = tweens.length - 1; i >= 0; i--) {
    const t = tweens[i];
    const k = Math.min(1, (now - t.start) / t.ms);
    t.step(k);
    if (k >= 1) { tweens.splice(i, 1); if (t.done) t.done(); }
  }
  if (idleSpin && !reducedMotion) view.yaw += dt * 0.08;
  scene.traverse(o => { if (o.userData.bob) o.position.y = 0.22 + Math.sin(now / 500) * 0.02; });
  placeCamera();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

export const STAGES = STAGE_LABELS;
