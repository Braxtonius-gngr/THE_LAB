// THE TABLE: where the landing flies to (three.js + CSS3D).
//
// After the roll intro has floated up, a tap on the landing starts one
// continuous shot: the camera rises out of the float and glides across the
// room, down into the player's seat at a private high-limit card table
// ('card', the one destination).
//
// The seat is the home screen of the Refinement x Realization skin. The rail
// in front of you holds the clock and the Daily Run; the deck waits in its
// shoe. The dealer is a white ceramic arm that rises out of a port in the
// felt: it deals your ready platforms onto the felt as cards, face down,
// turns them, and sinks back - the higher a platform's tier, the finer its
// card. Tap a card to lift it and read its Keen Info. Your phone lies by the
// rail: pick it up for the freebies and the community drops.
//
// The table is WebGL: it shares the intro's renderer, scene, set and lights
// (handed over by the intro's release()). Everything you read or tap - the
// rail's instruments, the cards, the phone's screen - is page elements laid
// into the same 3D space by CSS3DRenderer from the same camera, so text stays
// sharp and every control is a real button.
//
// Coordinates here are the seat's own: centimetres, the origin on the felt at
// the inside edge of the rail in front of the player, +z away from the player
// (toward the dealer), +y up, and so +x to the player's LEFT (right-handed).

import * as THREE from '../vendor/three/three.module.js';
import { CSS3DRenderer, CSS3DObject } from '../vendor/three/three.addons.js';

export const DESTS = ['card'];

const DEG = Math.PI / 180;
const clamp01 = x => Math.min(Math.max(x, 0), 1);
const smoother = x => { x = clamp01(x); return x * x * x * (x * (6 * x - 15) + 10); };
const lerp = (a, b, k) => a + (b - a) * k;
const easeInOut = x => { x = clamp01(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const easeOut = (x, k = 3) => 1 - Math.pow(1 - clamp01(x), k);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
// The module's own assets (the coins and chips in ./icons), by URL.
const HERE = new URL('./', import.meta.url);
const asset = f => new URL(f, HERE).href;

// Where the card table stands, and which way its seat faces: along +x, away
// from the craps table, so the camera comes in from behind the chair.
const CARD_TABLE = { at: [212, 0, -18], yaw: 90 };
// Its felt: a half-ellipse, a across and b deep, from the player's rail to
// the dealer's straight edge.
const FELT = { a: 80, b: 64 };
// A playing card (6.35 x 8.89 cm), built at CARD.px page pixels per cm and
// scaled down, so its print is rasterised sharp.
const CARD = { w: 6.35, h: 8.89, px: 50 };
// Where the dealt cards lie: three to a row, rows away from the player.
const SLOTS = { cols: 3, gapX: 1.3, gapZ: 2.4, max: 9 };
// The destination's layout in its seat frame: the seat camera (portrait,
// landscape), the first row of cards, the rail's panel, the shoe and the
// discard rack.
const LAYOUT = {
  card: {
    view: [{ eye: [0, 54, -22], aim: [0, 0, 21], fov: 50 }, { eye: [0, 46, -24], aim: [0, 0, 25], fov: 40 }],
    z0: 18.5, rail: { x: 3.4, y: 7.2, z: -4.2, tilt: 28 }, shoe: [-15.5, 54], discard: [16, 55]
  }
};
// The shot's timings (seconds from the tap).
const T = { cardFly: 4.8, uiIn: 0.6 };
// The deal, by the dealer's arm: seconds per card, and its phases - the
// reach to the shoe, the pull out of it, the carry to the card's place
// (face down, a length short of it), the settle onto its near edge, the push
// that lifts it over onto its face-up place, and the fall it finishes on
// its own while the hand goes back for the next.
// (the machine's pace: quick enough to be just past what a person could do)
const DEAL = { each: 0.8, reach: 0.08, pull: 0.07, carry: 0.23, settle: 0.08, push: 0.09, fall: 0.2 };
const TIERS = ['S', 'A', 'B', 'C', 'D', 'F'];
const SUITS = ['♠', '♥', '♦', '♣'];

// ------------------------------------------------------------ helpers
// World-unit UVs (see intro.mjs): scale a geometry's 0..1 UVs.
function scaleUV(geo, su, sv) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  uv.needsUpdate = true;
  return geo;
}
// A texture sharing another's image, with its own repeat.
function retile(tex, rx, ry) {
  const t = tex.clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.needsUpdate = true;
  return t;
}
// A path in the table plane, [[x, z], ...], resampled evenly.
function resample(path, step) {
  const out = [path[0]];
  let carry = 0;
  for (let i = 1; i < path.length; i++) {
    const [x0, z0] = path[i - 1], [x1, z1] = path[i];
    const L = Math.hypot(x1 - x0, z1 - z0);
    let d = step - carry;
    while (d <= L) { const k = d / L; out.push([x0 + (x1 - x0) * k, z0 + (z1 - z0) * k]); d += step; }
    carry = L - (d - step);
  }
  const last = path[path.length - 1];
  if (Math.hypot(out[out.length - 1][0] - last[0], out[out.length - 1][1] - last[1]) > step * 0.3) out.push(last);
  return out;
}
// Sweep a closed cross-section along a path in the table plane. The profile
// is [[out, up], ...]: `out` along the path's outward normal (to the right of
// its direction of travel), `up` along +y. UVs: u runs round the profile
// (0..1), v along the path in `tile` cm.
function sweep(path, profile, tile, caps = false) {
  const pos = [], uv = [], idx = [];
  const n = path.length, m = profile.length;
  const plen = [0];
  for (let j = 1; j <= m; j++) { const a = profile[j - 1], b = profile[j % m]; plen.push(plen[j - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  let along = 0;
  for (let i = 0; i < n; i++) {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0], tz = b[1] - a[1];
    const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    const nx = tz, nz = -tx;             // right of the direction of travel
    if (i > 0) along += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    for (let j = 0; j <= m; j++) {
      const [o, u] = profile[j % m];
      pos.push(path[i][0] + nx * o, u, path[i][1] + nz * o);
      uv.push(plen[j] / plen[m], along / tile);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < m; j++) {
    const a = i * (m + 1) + j, b = a + 1, c = a + (m + 1), d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (!caps) return g;
  // End caps: a fan over each end's section (own vertices, flat normals).
  const capGeo = [];
  [0, n - 1].forEach((i, e) => {
    const cp = [], cu = [], ci = [];
    const ring = [];
    for (let j = 0; j < m; j++) ring.push(pos.slice((i * (m + 1) + j) * 3, (i * (m + 1) + j) * 3 + 3));
    const c = ring.reduce((s, v) => [s[0] + v[0] / m, s[1] + v[1] / m, s[2] + v[2] / m], [0, 0, 0]);
    cp.push(...c); cu.push(0.5, 0.5);
    ring.forEach(v => { cp.push(...v); cu.push(0.5, 0.5); });
    for (let j = 0; j < m; j++) { const a = 1 + j, b = 1 + ((j + 1) % m); if (e === 0) ci.push(0, a, b); else ci.push(0, b, a); }
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3));
    cg.setAttribute('uv', new THREE.Float32BufferAttribute(cu, 2));
    cg.setIndex(ci);
    cg.computeVertexNormals();
    capGeo.push(cg);
  });
  g.userData.caps = capGeo;
  return g;
}
// A flat strip lying on the felt along a path, from `o0` to `o1` out from it:
// u along the path in `tile` cm, v across (0 at o0).
function strip(path, o0, o1, y, tile) {
  const pos = [], uv = [], idx = [];
  let along = 0;
  const n = path.length;
  for (let i = 0; i < n; i++) {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0], tz = b[1] - a[1];
    const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    const nx = tz, nz = -tx;
    if (i > 0) along += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    pos.push(path[i][0] + nx * o0, y, path[i][1] + nz * o0, path[i][0] + nx * o1, y, path[i][1] + nz * o1);
    uv.push(along / tile, 0, along / tile, 1);
  }
  for (let i = 0; i < n - 1; i++) { const a = 2 * i; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
function canvasTex(w, h, paint) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  paint(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
// A rounded rectangle as a Shape (centred), for the phone and the tray.
function roundRect(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
// An orientation for something lying face up on the felt, its top edge
// toward the dealer, reading the right way round from the seat; `tilt`
// lifts its far edge toward the player, `yaw` turns it on the felt, and
// `flip` turns it over about its own long axis (PI: face down).
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
function lying(q, { tilt = 0, yaw = 0, flip = 0 } = {}) {
  _q1.setFromAxisAngle(V(0, 1, 0), Math.PI + yaw);
  _q2.setFromAxisAngle(V(1, 0, 0), -Math.PI / 2 + tilt);
  _q3.setFromAxisAngle(V(0, 1, 0), flip);
  return q.copy(_q1).multiply(_q2).multiply(_q3);
}
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function initials(name) {
  const w = String(name || '?').replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (!w.length) return '?';
  if (w.length === 1) return w[0].slice(0, 2).toUpperCase();
  return (w[0][0] + w[1][0]).toUpperCase();
}
const tierOf = t => (TIERS.includes(t) ? t : 'U');
function fmtLeft(ms) {
  if (!(ms > 0)) return 'Ready';
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h}h ${m % 60}m` : `${Math.round(h / 24)}d`;
}

// ------------------------------------------------------- the card table
function buildCardTable(set) {
  const g = new THREE.Group();
  const { a, b } = FELT;
  // the felt's rim: the arc on the player's side, from the player's right
  // (-x) round through the seat to their left (+x); travelling that way,
  // "out" (right of travel) is away from the felt, toward the player
  const arc = [];
  for (let i = 0; i <= 120; i++) { const th = -Math.PI / 2 + (Math.PI * i) / 120; arc.push([a * Math.sin(th), b - b * Math.cos(th)]); }
  const rim = resample(arc, 1.2);
  // Felt: the shape laid flat (a Shape's y is the table's -z once laid).
  const shape = new THREE.Shape();
  rim.forEach(([x, z], i) => (i ? shape.lineTo(x, -z) : shape.moveTo(x, -z)));
  shape.closePath();
  const feltMat = set.felt.clone();
  feltMat.normalMap = retile(set.tex.feltN, 1, 1);
  const feltGeo = scaleUV(new THREE.ShapeGeometry(shape, 48), 1 / 8, 1 / 8);
  const felt = new THREE.Mesh(feltGeo, feltMat);
  felt.rotation.x = -Math.PI / 2; felt.receiveShadow = true; g.add(felt);
  // The body under it: a slab the shape of the top, then a pedestal.
  const slab = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 9, bevelEnabled: false, curveSegments: 48 }), new THREE.MeshStandardMaterial({ color: 0x070606, roughness: 0.8 }));
  slab.rotation.x = -Math.PI / 2; slab.position.y = -9.05; g.add(slab);
  const black = new THREE.MeshStandardMaterial({ color: 0x060505, roughness: 0.5, metalness: 0.3 });
  const column = new THREE.Mesh(new THREE.CylinderGeometry(9, 12, 64, 32), black);
  column.position.set(0, -9 - 32, b * 0.55); g.add(column);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(34, 38, 5, 48), black);
  foot.position.set(0, -80.5, b * 0.55); g.add(foot);
  // The padded rail round the arc: stitched leather over a walnut edge.
  const cushionMat = set.cushion.clone();
  cushionMat.normalMap = retile(set.tex.cushionN, 1, 1);
  cushionMat.envMapIntensity = 0.35; cushionMat.roughness = 0.52;
  const ellipse = [];
  for (let j = 0; j < 40; j++) { const t = (j / 40) * 2 * Math.PI; ellipse.push([5.6 + 5.8 * Math.cos(t), 3.1 + 4.3 * Math.sin(t)]); }
  const railGeo = sweep(rim, ellipse, 14.45, true);
  const rail = new THREE.Mesh(railGeo, cushionMat);
  rail.castShadow = true; rail.receiveShadow = true; g.add(rail);
  railGeo.userData.caps.forEach(cg => g.add(new THREE.Mesh(cg, cushionMat)));
  const woodMat = set.wood.clone();
  woodMat.map = retile(set.tex.walnut, 1, 1);
  woodMat.normalMap = retile(set.tex.walnutN, 1, 1);
  // (the edge's u runs round its section; the grain wants to run along the
  // rail, so the section is walked in v: see the swapped tile below)
  const edgeSection = [[0.5, -0.6], [12.2, -0.6], [12.8, -1.6], [12.8, -8.2], [12.2, -9.2], [0.5, -9.2]];
  const edgeGeo = sweep(rim, edgeSection, 60);
  { const uv = edgeGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i), uv.getX(i) * 26 / 15); }
  const edge = new THREE.Mesh(edgeGeo, woodMat);
  edge.receiveShadow = true; g.add(edge);
  // a brass line let into the edge
  const lineGeo = sweep(rim, [[12.85, -3.0], [13.05, -3.0], [13.05, -3.5], [12.85, -3.5]], 30);
  g.add(new THREE.Mesh(lineGeo, set.brass));
  // The gold filigree inlaid round the felt, inside the rail.
  const satinGold = set.gold.clone();
  satinGold.roughness = 0.5; satinGold.envMapIntensity = 0.6; satinGold.color = new THREE.Color(0.82, 0.78, 0.72);
  const goldBand = new THREE.Mesh(strip(rim, -2.6, -5.0, 0.012, 19.2), satinGold);
  goldBand.receiveShadow = true; g.add(goldBand);
  // The printed felt: a fine gold arc, the house line round it, the
  // wordmark by the dealer.
  // (alpha maps read the green channel: white ink on a black ground, so
  // the edges keep their coverage, and read as data, not colour)
  const print = canvasTex(2048, 1024, (c, W, H) => {
    // the canvas, as the player sees it: its left is x = +84 (their left),
    // its top z = 80 (the dealer's side)
    const px = x => ((84 - x) / 168) * W, pz = z => ((80 - z) / 84) * H, s = W / 168;
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    c.strokeStyle = '#fff'; c.fillStyle = '#fff';
    c.lineWidth = 0.22 * s;
    const ell = (aa, bb) => { c.beginPath(); for (let i = 0; i <= 200; i++) { const th = Math.PI / 2 - (Math.PI * i) / 200; const x = aa * Math.sin(th), z = b - bb * Math.cos(th); if (i) c.lineTo(px(x), pz(z)); else c.moveTo(px(x), pz(z)); } c.stroke(); };
    // (the house line runs left to right as the player reads it: from x = +ra;
    // it and the diamonds keep below the cards' near row)
    ell(a - 11.4, b - 11.4);
    ell(a - 12.1, b - 12.1);
    // a string of small diamonds along the arc between the band and the
    // fine lines (small type would blur at the print's resolution and the
    // angle it is seen at)
    const ra = a - 8, rb = b - 8;
    for (let i = 1; i < 18; i++) {
      const th = -Math.PI / 2 + (Math.PI * i) / 18;
      const x = ra * Math.sin(th), z = b - rb * Math.cos(th), d = 0.55 * s;
      c.save(); c.translate(px(x), pz(z)); c.rotate(-th);
      c.beginPath(); c.moveTo(0, -d); c.lineTo(d * 0.62, 0); c.lineTo(0, d); c.lineTo(-d * 0.62, 0); c.closePath(); c.fill();
      c.restore();
    }
  });
  print.colorSpace = THREE.NoColorSpace;
  // the wordmark, by the dealer: 36 x 9 cm at 57 px/cm
  const WM = { w: 36, h: 9, z: b - 23 };
  const mark = canvasTex(2048, 512, (c, W, H) => {
    const s = W / WM.w;
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#fff'; c.strokeStyle = '#fff';
    c.translate(W / 2, H / 2);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `700 ${2.7 * s}px Georgia, "Times New Roman", serif`;
    c.fillText('Daily Roll Over', 0, -1.5 * s);
    c.font = `600 ${0.9 * s}px Georgia, "Times New Roman", serif`;
    c.fillText('R E F I N E M E N T   ×   R E A L I Z A T I O N', 0, 2.1 * s);
    c.lineWidth = 0.13 * s;
    c.beginPath(); c.moveTo(-13 * s, 0.45 * s); c.lineTo(13 * s, 0.45 * s); c.stroke();
    [-13.6, 13.6].forEach(x => { const d = 0.32 * s; c.beginPath(); c.moveTo(x * s - d, 0.45 * s); c.lineTo(x * s, 0.45 * s - d * 0.6); c.lineTo(x * s + d, 0.45 * s); c.lineTo(x * s, 0.45 * s + d * 0.6); c.closePath(); c.fill(); });
  });
  mark.colorSpace = THREE.NoColorSpace; mark.anisotropy = 16; print.anisotropy = 16;
  // (gold foil pressed into the felt, not ink: it catches the lamp)
  const inkMat = new THREE.MeshStandardMaterial({ color: 0xc9a75a, alphaMap: print, transparent: true, depthWrite: false, metalness: 0.8, roughness: 0.38, envMapIntensity: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const ink = new THREE.Mesh(new THREE.PlaneGeometry(168, 84), inkMat);
  ink.rotation.x = -Math.PI / 2; ink.rotation.z = Math.PI; ink.position.set(0, 0.006, 38); ink.receiveShadow = true; g.add(ink);
  const markMat = inkMat.clone(); markMat.alphaMap = mark;
  const markMesh = new THREE.Mesh(new THREE.PlaneGeometry(WM.w, WM.h), markMat);
  markMesh.rotation.x = -Math.PI / 2; markMesh.rotation.z = Math.PI; markMesh.position.set(0, 0.008, WM.z); markMesh.receiveShadow = true; g.add(markMesh);
  g.userData.mark = markMesh;
  // The dealer's edge: a walnut bar across the straight side, with the
  // chip tray let into it.
  const barLen = 2 * a + 26;
  const barGeo = new THREE.BoxGeometry(barLen, 10.2, 12);
  { const uv = barGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * barLen / 60, uv.getY(i) * 12 / 15); }
  const bar = new THREE.Mesh(barGeo, woodMat);
  bar.position.set(0, -4, b + 6); bar.castShadow = true; bar.receiveShadow = true; g.add(bar);
  g.add(chipTray(set));
  return { group: g, rim, focus: [0, 0, 30] };
}

// The chip rack: a black lacquer well let into the dealer's bar, brass
// rails and dividers, and stacks of chips whose faces are the house's
// coins (assets/intro3d/icons, the chip's colour under the gold).
const CHIPS = ['onyx', 'oxblood', 'emerald', 'ivory', 'plum', 'gold'];
const chipFaces = {};
function chipFace(name) {
  if (!chipFaces[name]) {
    const t = new THREE.TextureLoader().load(asset(`icons/chip-${name}.webp`));
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    chipFaces[name] = t;
  }
  return chipFaces[name];
}
function chipTray(set) {
  const g = new THREE.Group();
  const lacquer = new THREE.MeshPhysicalMaterial({ color: 0x0b0a0a, roughness: 0.28, clearcoat: 0.8, clearcoatRoughness: 0.12 });
  const well = new THREE.Mesh(new THREE.BoxGeometry(63, 1.2, 10.4), lacquer);
  well.position.y = 1.3; g.add(well);
  // the rails along the front and back, and the dividers between stacks
  [-5.5, 5.5].forEach(z => { const r = new THREE.Mesh(new THREE.BoxGeometry(64, 0.5, 0.7), set.brass); r.position.set(0, 2.1, z); g.add(r); });
  [-32, 32].forEach(x => { const r = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 11.7), set.brass); r.position.set(x, 2.1, 0); g.add(r); });
  for (let k = 1; k < 12; k++) { const d = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.9, 10.4), set.brass); d.position.set(-30 + k * 5, 2.2, 0); g.add(d); }
  const spots = { onyx: ['#101012', '#e8e2d2'], oxblood: ['#5b1622', '#f1e7d0'], emerald: ['#1d3a2a', '#f1e7d0'], ivory: ['#e6dfcb', '#6b1320'], plum: ['#3a2352', '#f1e7d0'], gold: ['#b58a2e', '#1a1208'] };
  const mats = CHIPS.map(name => {
    const [base, spot] = spots[name];
    const side = canvasTex(256, 16, (c, W, H) => { c.fillStyle = base; c.fillRect(0, 0, W, H); c.fillStyle = spot; for (let k = 0; k < 6; k++) c.fillRect(k * 42.7 + 16, 0, 9, H); });
    const sideM = new THREE.MeshStandardMaterial({ map: side, roughness: 0.5 });
    const topM = new THREE.MeshStandardMaterial({ map: chipFace(name), roughness: 0.42, metalness: 0.15 });
    return [sideM, topM, topM];
  });
  const chipGeo = new THREE.CylinderGeometry(1.95, 1.95, 0.33, 40);
  for (let k = 0; k < 12; k++) {
    const x = -27.5 + k * 5, m = mats[k % mats.length], n = 5 + ((k * 7) % 5);
    for (let j = 0; j < n; j++) {
      const chip = new THREE.Mesh(chipGeo, m);
      chip.position.set(x + Math.sin(j * 2.1 + k) * 0.07, 1.9 + j * 0.34, Math.cos(j * 1.7 + k) * 0.07);
      chip.rotation.y = j * 0.9 + k;
      chip.castShadow = j === n - 1;
      g.add(chip);
    }
  }
  g.position.set(0, 0, FELT.b + 5.6);
  return g;
}

// ------------------------------------------------------------ the props
// The shoe: smoked acrylic, the deck showing through it, a brass plate
// at the mouth with the roller the cards come out under; the discard rack.
function buildShoe(set) {
  const g = new THREE.Group();
  const acrylic = new THREE.MeshPhysicalMaterial({ color: 0x2a2320, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.38, clearcoat: 1, clearcoatRoughness: 0.04, depthWrite: false, side: THREE.DoubleSide });
  const lac = new THREE.MeshPhysicalMaterial({ color: 0x0c0a0a, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 });
  // the base: black lacquer, the mouth end open
  const base = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.9, 17), lac); base.position.set(0, 0.45, 0.4); base.castShadow = true; g.add(base);
  // the deck inside: a block of card edges, the top card's back on top
  const edges = canvasTex(64, 256, (c, W, H) => { c.fillStyle = '#e9e1cf'; c.fillRect(0, 0, W, H); c.fillStyle = 'rgba(120,100,80,0.35)'; for (let y = 0; y < H; y += 3) c.fillRect(0, y, W, 1); });
  edges.wrapS = edges.wrapT = THREE.RepeatWrapping;
  const edgeM = new THREE.MeshStandardMaterial({ map: edges, roughness: 0.75 });
  const backM = new THREE.MeshStandardMaterial({ map: canvasTex(256, 356, paintCardBack), roughness: 0.5 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(6.4, 2.6, 9), [edgeM, edgeM, backM, edgeM, edgeM, edgeM]);
  deck.position.set(0, 0.9 + 1.3, 1.2); deck.rotation.x = 4 * DEG; g.add(deck);
  // the acrylic hood: sloping lid, sides, back
  const hood = new THREE.Shape();
  hood.moveTo(-8.2, 0.9); hood.lineTo(8.2, 0.9); hood.lineTo(8.2, 6.4); hood.lineTo(-6.4, 3.4); hood.lineTo(-8.2, 3.4); hood.closePath();
  const hoodGeo = new THREE.ExtrudeGeometry(hood, { depth: 8.9, bevelEnabled: false });
  hoodGeo.translate(0, 0, -4.45);
  const hoodM = new THREE.Mesh(hoodGeo, acrylic);
  hoodM.rotation.y = -Math.PI / 2; g.add(hoodM);
  // (the hood's ends: a back, and a strip over the mouth above the roller)
  const back = new THREE.Mesh(new THREE.BoxGeometry(8.9, 5.5, 0.3), acrylic); back.position.set(0, 3.65, 8.2); g.add(back);
  // the brass at the mouth: a plate with the finger slot, the roller, corner caps
  const face = new THREE.Mesh(new THREE.BoxGeometry(9.2, 2.2, 0.4), set.brass); face.position.set(0, 1.8, -8.3); g.add(face);
  const slot = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.5, 0.5), new THREE.MeshBasicMaterial({ color: 0x050403 })); slot.position.set(0, 1.25, -8.4); g.add(slot);
  const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 8.6, 20), set.brass);
  roller.rotation.z = Math.PI / 2; roller.position.set(0, 3.4, -8.1); g.add(roller);
  [[-4.6, -8.2], [4.6, -8.2], [-4.6, 8.2], [4.6, 8.2]].forEach(([x, z]) => { const cap = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.4, 0.6), set.brass); cap.position.set(x, 1.1, z); g.add(cap); });
  // the top card, out at the mouth, ready to be drawn
  const card = new THREE.Mesh(new THREE.BoxGeometry(6.35, 0.03, 8.89), [0, 0, backM, 0, 0, 0].map(m => m || new THREE.MeshStandardMaterial({ color: 0xece4d2 })));
  card.position.set(0, 0.95, -6.5); card.rotation.x = 3 * DEG; card.castShadow = true; g.add(card);
  return g;
}
function buildDiscard(set) {
  // the discard rack: smoked acrylic on a walnut base, what has been played
  // today stacked in it under a brass weight
  const g = new THREE.Group();
  const smoke = new THREE.MeshPhysicalMaterial({ color: 0x2a221c, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.4, clearcoat: 1, clearcoatRoughness: 0.05, depthWrite: false });
  const base = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.8, 11.2), set.wood); base.position.y = 0.4; base.castShadow = true; g.add(base);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(8.8, 0.25, 11.4), set.brass); lip.position.y = 0.85; g.add(lip);
  [-4.0, 4.0].forEach(x => { const w = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4.6, 10.6), smoke); w.position.set(x, 3.2, 0); g.add(w); });
  const backW = new THREE.Mesh(new THREE.BoxGeometry(8.0, 4.6, 0.3), smoke); backW.position.set(0, 3.2, 5.3); g.add(backW);
  const edges = canvasTex(64, 256, (c, W, H) => { c.fillStyle = '#e9e1cf'; c.fillRect(0, 0, W, H); c.fillStyle = 'rgba(120,100,80,0.35)'; for (let y = 0; y < H; y += 3) c.fillRect(0, y, W, 1); });
  const edgeM = new THREE.MeshStandardMaterial({ map: edges, roughness: 0.75 });
  const backM = new THREE.MeshStandardMaterial({ map: canvasTex(256, 356, paintCardBack), roughness: 0.5 });
  // the stack: a block of card edges with a few loose cards on top
  const stack = new THREE.Mesh(new THREE.BoxGeometry(6.35, 1.4, 8.89), [edgeM, edgeM, backM, edgeM, edgeM, edgeM]);
  stack.position.set(0, 0.98 + 0.7, 0.4); g.add(stack);
  for (let k = 0; k < 3; k++) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(6.35, 0.06, 8.89), [edgeM, edgeM, backM, edgeM, edgeM, edgeM]);
    c.position.set(Math.sin(k * 2.3) * 0.25, 2.42 + k * 0.07, 0.4 + Math.cos(k * 1.7) * 0.25);
    c.rotation.y = Math.sin(k * 1.9) * 0.06;
    g.add(c);
  }
  // the weight: a brass bar across the stack
  const weight = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.7, 2.2), set.brass); weight.position.set(0, 3.0, 0.4); weight.castShadow = true; g.add(weight);
  return g;
}
// The dealer is a machine: a white ceramic arm traced with fine gold
// circuitry, stowed under a port in the felt by the shoe. As the deal
// begins the port opens and the arm rises out of the table. It deals each
// card with quick, exact moves on smooth curves, then sinks back once the
// hand is out. The arm is solved every frame from the port to the wrist:
// two bones, the elbow held back toward the dealer and a little up. Its hand keeps
// the old glove's frame - at the fingertips, +z along the fingers, +y the
// back of the hand, +x the thumb's side - so a pose is still where the
// fingertips are and which way they point.
const PORT = { x: -4, z: 58.5, r: 5.4 };
// shoulder heights (up: dealing; down: stowed under the felt) and the bones
const ARM = { up: 10, down: -50, upper: 16, fore: 16 };
// the wrist, in the hand's frame
const WRIST = V(0, 0.6, -13.0);
// Gold traces on ceramic (glow: the same traces alone, for the light in them).
function circuitTex(glow) {
  let seed = 20260928;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const t = canvasTex(512, 256, (c, W, H) => {
    c.fillStyle = glow ? '#000000' : '#f4f1eb'; c.fillRect(0, 0, W, H);
    c.strokeStyle = c.fillStyle = glow ? '#ffd48c' : '#b08745';
    c.lineWidth = 1.5; c.lineJoin = 'round'; c.lineCap = 'round';
    // buses: three traces running together, then single runs breaking off
    for (let b = 0; b < 4; b++) {
      const y0 = 30 + b * 60 + rnd() * 20;
      for (let k = 0; k < 3; k++) { c.beginPath(); c.moveTo(0, y0 + k * 5); c.lineTo(W, y0 + k * 5); c.stroke(); }
    }
    for (let i = 0; i < 30; i++) {
      let x = rnd() * W, y = rnd() * H;
      c.beginPath(); c.arc(x, y, 2.4, 0, 7); c.fill();
      c.beginPath(); c.moveTo(x, y);
      const legs = 2 + (rnd() * 3 | 0);
      for (let k = 0; k < legs; k++) {
        const L = 12 + rnd() * 40, d = rnd();
        if (d < 0.5) x += L; else if (d < 0.75) { x += L * 0.7; y += L * 0.7; } else { x += L * 0.7; y -= L * 0.7; }
        c.lineTo(x, y);
      }
      c.stroke();
      c.beginPath(); c.arc(x, y, 2.4, 0, 7); c.stroke();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function dealerMaterials() {
  const ceramic = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: circuitTex(false), roughness: 0.34, clearcoat: 0.85, clearcoatRoughness: 0.16,
    emissive: 0xffc877, emissiveMap: circuitTex(true), emissiveIntensity: 0 });
  const plain = new THREE.MeshPhysicalMaterial({ color: 0xf4f1eb, roughness: 0.34, clearcoat: 0.85, clearcoatRoughness: 0.16 });
  const clear = new THREE.MeshPhysicalMaterial({ color: 0xeaf2f6, roughness: 0.05, transparent: true, opacity: 0.32, clearcoat: 1, depthWrite: false });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd6b064, metalness: 1, roughness: 0.26, emissive: 0x6a4512, emissiveIntensity: 0.25 });
  const graphite = new THREE.MeshStandardMaterial({ color: 0x1c1b1e, metalness: 0.55, roughness: 0.36 });
  return { ceramic, plain, clear, gold, graphite };
}
// A mesh laid from a to b along its own y (a unit-height cylinder, or a
// capsule built to the length).
function laid(mesh, a, b, unit) {
  const d = b.clone().sub(a), l = d.length() || 1e-4;
  mesh.quaternion.setFromUnitVectors(V(0, 1, 0), d.multiplyScalar(1 / l));
  mesh.position.copy(a).lerp(b, 0.5);
  if (unit) mesh.scale.set(1, l, 1);
  return mesh;
}
// A joint: a clear shell over a gold core, on a graphite axle.
function joint(m, r, axis) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), m.clear));
  g.add(new THREE.Mesh(new THREE.SphereGeometry(r * 0.52, 16, 12), m.gold));
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.36, r * 0.36, r * 2.3, 16), m.graphite);
  if (axis === 'x') axle.rotation.z = Math.PI / 2;
  g.add(axle);
  return g;
}
function buildDealerHand(m) {
  const g = new THREE.Group();
  // (modelled from the fingertips up; set down 0.7 cm so the fingers lie
  // on the card the pose puts them over rather than hovering above it)
  const hand = new THREE.Group(); hand.position.y = -0.7; g.add(hand);
  const bone = (r, a, b, mat) => laid(new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.01, a.distanceTo(b) - 2 * r), 4, 14), mat), a, b);
  const hinge = (p, r) => { const h = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1.0, 14), m.graphite); h.rotation.z = Math.PI / 2; h.position.copy(p); return h; };
  // the fingers: three segments each, on graphite hinges, lying almost flat
  // (the tips lowest, to slide under a card's end)
  [[2.3, 0.94], [0.8, 1], [-0.8, 0.97], [-2.3, 0.84]].forEach(([x, k]) => {
    const p0 = V(x, 0.68, -0.4), p1 = p0.clone().add(V(0, 0.16, -1.7 * k)), p2 = p1.clone().add(V(0, 0.2, -2.0 * k)), p3 = V(x, 1.22, -6.4);
    hand.add(bone(0.4, p0, p1, m.plain), bone(0.44, p1, p2, m.plain), bone(0.47, p2, p3, m.plain), hinge(p1, 0.33), hinge(p2, 0.36));
    // a gold pad on the tip
    const pad = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), m.gold); pad.position.copy(p0).add(V(0, -0.22, -0.1)); hand.add(pad);
  });
  // the knuckles: one graphite bar, the palm a ceramic plate behind it
  const knuckles = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 7.0, 16), m.graphite);
  knuckles.rotation.z = Math.PI / 2; knuckles.position.set(0, 1.22, -6.4); hand.add(knuckles);
  // (the palm narrows from the knuckles to the wrist, its edges rounded
  // over: a shaped shell, not a slab)
  const palmShape = new THREE.Shape();
  { const k = 3.4, w = 2.5, h = 3.0, r = 0.9;
    palmShape.moveTo(-w + r * 0.4, -h); palmShape.lineTo(w - r * 0.4, -h);
    palmShape.quadraticCurveTo(w, -h, w + 0.1, -h + r);
    palmShape.lineTo(k, h - r); palmShape.quadraticCurveTo(k, h, k - r, h);
    palmShape.lineTo(-k + r, h); palmShape.quadraticCurveTo(-k, h, -k, h - r);
    palmShape.lineTo(-w - 0.1, -h + r); palmShape.quadraticCurveTo(-w, -h, -w + r * 0.4, -h); }
  const palmGeo = new THREE.ExtrudeGeometry(palmShape, { depth: 0.5, bevelEnabled: true, bevelThickness: 0.45, bevelSize: 0.4, bevelSegments: 5, curveSegments: 10 });
  palmGeo.center();
  const palm = new THREE.Mesh(palmGeo, m.ceramic); palm.rotation.x = Math.PI / 2; palm.position.set(0, 1.3, -9.7); hand.add(palm);
  // a clear cover over the back of the hand, the gold traces under it
  const cover = new THREE.Mesh(new THREE.ShapeGeometry(palmShape, 10), m.clear);
  cover.rotation.x = -Math.PI / 2; cover.scale.set(0.82, 0.8, 1); cover.position.set(0, 2.02, -9.7); hand.add(cover);
  // a gold inlay down the back of the hand, and the status light in it
  const inlay = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 4.2), m.gold); inlay.position.set(0, 1.98, -9.7); hand.add(inlay);
  const pip = new THREE.Mesh(new THREE.CircleGeometry(0.26, 18), m.gold); pip.rotation.x = -Math.PI / 2; pip.position.set(0, 2.0, -11.6); hand.add(pip);
  // the thumb, off to the side, clear of the card
  const t0 = V(3.6, 1.15, -10.4), t1 = V(4.6, 0.95, -7.4), t2 = V(4.9, 0.72, -4.7);
  hand.add(bone(0.5, t0, t1, m.plain), bone(0.44, t1, t2, m.plain), hinge(t1, 0.37));
  // the wrist
  const w = joint(m, 1.35, 'x'); w.position.copy(WRIST); g.add(w);
  return g;
}
// The arm between the port and the wrist: a telescoping column, the
// shoulder, the upper arm, the elbow and the forearm, each placed by pose().
function buildDealerArm(m) {
  const g = new THREE.Group();
  const cyl = (rt, rb, mat) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, 1, 24, 1), mat);
  const ring = r => { const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.13, 8, 32), m.gold); return t; };
  const column = [cyl(1.9, 1.9, m.ceramic), cyl(2.3, 2.3, m.ceramic), cyl(2.7, 2.7, m.ceramic)];
  const collars = [ring(1.95), ring(2.35), ring(2.75)];
  const shoulder = joint(m, 2.2, 'x');
  const upper = cyl(1.3, 1.6, m.ceramic), fore = cyl(1.0, 1.25, m.ceramic);
  const elbow = joint(m, 1.65, 'x');
  const bands = [ring(1.65), ring(1.36), ring(1.31), ring(1.05)];
  g.add(...column, ...collars, shoulder, upper, fore, elbow, ...bands);
  const up = V(0, 1, 0), bend = V(0, 0.5, 1).normalize();
  const S = V(0, 0, 0), E = V(0, 0, 0), dir = V(0, 0, 0), n = V(0, 0, 0);
  const band = (b, a, c, k) => { b.position.copy(a).lerp(c, k); b.quaternion.setFromUnitVectors(V(0, 0, 1), c.clone().sub(a).normalize()); };
  return {
    group: g,
    // the shoulder at height y over the port, the wrist at W (seat frame)
    pose(y, W) {
      S.set(PORT.x, y, PORT.z);
      // the column: three sleeves, each drawn out of the one below
      const base = ARM.down - 6, span = y - base;
      column.forEach((c, i) => {
        const a = base + span * (2 - i) / 3, b = Math.min(y, a + span / 3 + 1.2);
        laid(c, V(PORT.x, a, PORT.z), V(PORT.x, b, PORT.z), true);
        collars[i].position.set(PORT.x, b, PORT.z); collars[i].quaternion.setFromUnitVectors(V(0, 0, 1), up);
      });
      shoulder.position.copy(S);
      // two bones: the elbow in the plane of the reach, back and a little up
      dir.copy(W).sub(S);
      const len0 = dir.length() || 1e-4;
      dir.multiplyScalar(1 / len0);
      const L1 = ARM.upper, L2 = ARM.fore;
      const len = THREE.MathUtils.clamp(len0, Math.abs(L1 - L2) + 0.5, L1 + L2 - 0.05);
      const a = (L1 * L1 - L2 * L2 + len * len) / (2 * len), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
      n.copy(bend).addScaledVector(dir, -bend.dot(dir));
      if (n.lengthSq() < 1e-6) n.set(0, 0, 1);
      n.normalize();
      E.copy(S).addScaledVector(dir, a).addScaledVector(n, h);
      laid(upper, S, E, true);
      laid(fore, E, W, true);
      elbow.position.copy(E);
      band(bands[0], S, E, 0.1); band(bands[1], S, E, 0.9); band(bands[2], E, W, 0.1); band(bands[3], E, W, 0.9);
      return len0;
    }
  };
}
// A hand pose: fingertips at p, fingers along z, the back of the hand up y.
function handPose(p, z, y) {
  const zz = z.clone().normalize(), xx = y.clone().cross(zz).normalize(), yy = zz.clone().cross(xx);
  return { p: p.clone(), q: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xx, yy, zz)) };
}
// The back of every card: oxblood, a gold diamond lattice, the DRO seal.
function paintCardBack(c, W, H) {
  c.fillStyle = '#efe6d3'; c.fillRect(0, 0, W, H);
  const m = W * 0.06;
  c.fillStyle = '#4a0b14'; c.fillRect(m, m, W - 2 * m, H - 2 * m);
  c.save(); c.beginPath(); c.rect(m, m, W - 2 * m, H - 2 * m); c.clip();
  c.strokeStyle = 'rgba(214,176,98,0.55)'; c.lineWidth = W * 0.006;
  const step = W * 0.09;
  for (let x = -H; x < W + H; x += step) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x + H, H); c.stroke(); c.beginPath(); c.moveTo(x, H); c.lineTo(x + H, 0); c.stroke(); }
  c.restore();
  c.strokeStyle = '#d6b062'; c.lineWidth = W * 0.012; c.strokeRect(m * 1.6, m * 1.6, W - 3.2 * m, H - 3.2 * m);
  c.fillStyle = '#4a0b14'; c.beginPath(); c.arc(W / 2, H / 2, W * 0.2, 0, 7); c.fill();
  c.strokeStyle = '#d6b062'; c.lineWidth = W * 0.012; c.beginPath(); c.arc(W / 2, H / 2, W * 0.2, 0, 7); c.stroke();
  c.fillStyle = '#e9cf8a'; c.font = `700 ${W * 0.13}px Georgia, serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('DRO', W / 2, H / 2 + W * 0.01);
}

// ------------------------------------------------------------- the deck
// The cards to deal: from the app's deck (hooks.deck()), else - on a fresh
// install, or a preview with nothing tracked - a demonstration hand from
// the catalogue, one of each tier.
// (index.html passes a real hand through hooks.deck(); this is only the
// last resort, so the table is never bare)
function demoHand() {
  const names = [['Grand Salon', 'S', 1.2], ['Crown Room', 'A', 0.8], ['Parlor Nine', 'B', 0.4], ['Velvet Lane', 'C', 0.25], ['Fortune Row', 'D', 0.1], ['Spin Hall', 'F', 0.05]];
  return names.map(([name, tier, ev], i) => ({ id: 'demo' + i, name, tier, ev, remaining: 0 }));
}

// --------------------------------------------------------------- the UI
// What a card's face says: a dealt card is ready by being dealt, so it
// shows what it's worth - or, once collected, how long it has left.
function cardShown(c) {
  const ev = typeof c.ev === 'number' && c.ev > 0 ? `~$${c.ev.toFixed(2)}` : '';
  return c.remaining > 0 ? fmtLeft(c.remaining) : (ev || 'Ready');
}
// A long name is set smaller rather than cut off at the card's edge: its
// longest word fits the line, and the whole of it two lines.
function nameFit(name) {
  const n = String(name || '');
  const longest = Math.max(1, ...n.split(/\s+/).map(w => w.length));
  const px = Math.max(22, Math.min(40, Math.floor(40 * 8.5 / longest), Math.floor(40 * 18 / Math.max(18, n.length))));
  return px < 40 ? ` style="font-size:${px}px"` : '';
}
function cardHTML(c) {
  const tier = tierOf(c.tier);
  const suit = SUITS[hash(c.name || '') % 4];
  const red = suit === '♥' || suit === '♦';
  const ev = typeof c.ev === 'number' && c.ev > 0 ? `~$${c.ev.toFixed(2)}` : '';
  const state = c.remaining > 0 ? fmtLeft(c.remaining) : 'Ready';
  const shown = cardShown(c);
  const label = `${c.name}, ${tier === 'U' ? 'unranked' : tier + ' tier'}, ${state}${ev ? ', about ' + ev.slice(2) + ' dollars a day' : ''}`;
  return `<div class="r3t-card-in">
    <div class="r3t-face r3t-front t-${tier}${red ? ' r3t-red' : ''}">
      <div class="r3t-frame"></div>
      <span class="r3t-idx r3t-tl"><b>${tier === 'U' ? '•' : tier}</b><i>${suit}</i></span>
      <span class="r3t-idx r3t-br"><b>${tier === 'U' ? '•' : tier}</b><i>${suit}</i></span>
      <div class="r3t-seal"><span>${esc(initials(c.name))}</span></div>
      <div class="r3t-name"${nameFit(c.name)}>${esc(c.name)}</div>
      <div class="r3t-meta"><span class="r3t-state">${esc(shown)}</span></div>
      <div class="r3t-sheen"></div>
    </div>
    <div class="r3t-face r3t-back t-${tier}"><div class="r3t-bk-frame"></div><div class="r3t-bk-seal"></div><div class="r3t-sheen"></div></div>
  </div><span class="r3t-sr">${esc(label)}</span>`;
}
function railHTML() {
  return `<div class="r3t-rail-in">
    <div class="r3t-clock" aria-hidden="true">
      <svg viewBox="0 0 100 100" class="r3t-dial">
        <circle cx="50" cy="50" r="47" class="r3t-dial-face"/>
        ${Array.from({ length: 12 }, (_, i) => `<line x1="50" y1="6" x2="50" y2="${i % 3 ? 10 : 14}" transform="rotate(${i * 30} 50 50)" class="r3t-tick${i % 3 ? '' : ' r3t-tick-q'}"/>`).join('')}
        <line x1="50" y1="52" x2="50" y2="26" class="r3t-hand-h"/>
        <line x1="50" y1="55" x2="50" y2="13" class="r3t-hand-m"/>
        <line x1="50" y1="60" x2="50" y2="10" class="r3t-hand-s"/>
        <circle cx="50" cy="50" r="3.4" class="r3t-pin"/>
      </svg>
    </div>
    <div class="r3t-time"><b class="r3t-now">--:--</b><small class="r3t-date"></small><span class="r3t-status"><b class="r3t-next">&mdash;</b><small class="r3t-done"></small></span></div>
    <button type="button" class="r3t-run"><span class="r3t-run-coin" aria-hidden="true"></span><span class="r3t-run-k">Run the deck</span><span class="r3t-run-v">&mdash;</span></button>
  </div>`;
}
function phoneHTML(asset) {
  const coin = n => `<img class="r3t-ph-coin" src="${asset(`icons/coin-${n}.webp`)}" alt="" width="64" height="64">`;
  return `<div class="r3t-ph-body"><div class="r3t-ph-screen">
    <div class="r3t-ph-island"></div>
    <div class="r3t-ph-status"><span class="r3t-ph-clock">--:--</span><span class="r3t-ph-sig" aria-hidden="true"><i></i><i></i><i></i><i></i><b></b></span></div>
    <div class="r3t-ph-lock">
      <div class="r3t-ph-day"></div>
      <div class="r3t-ph-big">--:--</div>
      <div class="r3t-ph-notes">
        <div class="r3t-ph-note">${coin('house')}<div><b>Freebies</b><span class="r3t-ph-n-free">Codes, drops and giveaways</span></div><i>now</i></div>
        <div class="r3t-ph-note">${coin('send')}<div><b>Community</b><span class="r3t-ph-n-comm">Drops shared by other players</span></div><i>2m</i></div>
      </div>
      <div class="r3t-ph-hint">Tap to pick up</div>
    </div>
    <div class="r3t-ph-app">
      <div class="r3t-ph-title">Daily <em>Roll Over</em><button type="button" class="r3t-ph-gear" data-view="settings" aria-label="Settings"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm8.4 3.5c0-.5-.05-.95-.13-1.4l2.02-1.58-2-3.46-2.44.98a8.3 8.3 0 0 0-2.42-1.4L15 2.5H9l-.43 2.64a8.3 8.3 0 0 0-2.42 1.4l-2.44-.98-2 3.46 2.02 1.58a8.5 8.5 0 0 0 0 2.8L1.71 15l2 3.46 2.44-.98a8.3 8.3 0 0 0 2.42 1.4L9 21.5h6l.43-2.62a8.3 8.3 0 0 0 2.42-1.4l2.44.98 2-3.46-2.02-1.6c.08-.45.13-.9.13-1.4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg></button></div>
      <div class="r3t-ph-grid">
        <button type="button" class="r3t-ph-tile" data-view="freebies">${coin('house')}<b>Freebies</b><span>Codes, drops, giveaways</span></button>
        <button type="button" class="r3t-ph-tile" data-view="community">${coin('send')}<b>Community</b><span>Drops other players shared</span></button>
        <button type="button" class="r3t-ph-tile" data-view="deck">${coin('deck')}<b>Deck</b><span>Every platform you track</span></button>
        <button type="button" class="r3t-ph-tile" data-view="catalogue">${coin('clock')}<b>Catalogue</b><span>Platforms to add</span></button>
      </div>
      <div class="r3t-ph-today"><b class="r3t-ph-ready">&mdash;</b><span class="r3t-ph-next">&mdash;</span></div>
      <button type="button" class="r3t-ph-put">Put it down</button>
    </div>
  </div></div>`;
}

// ------------------------------------------------------------ prepare
// Builds the destination into the running scene - quietly, while the intro
// still floats (its lamp comes up out of the dark) - and returns the
// controller: fly() takes over from the intro and plays the shot in.
export async function prepareTable(opts) {
  const o = Object.assign({ scene: null, dest: 'card', hooks: {} }, opts);
  const scene = o.scene;
  const set = scene.userData.set;
  if (!set) throw new Error('table: the intro set is missing');
  const dest = DESTS.includes(o.dest) ? o.dest : 'card';
  const hooks = o.hooks || {};
  const made = [];                        // everything added, for dispose()

  // ---- The seat frame and the destination.
  const seat = new THREE.Group();
  const L = LAYOUT[dest];
  const table = buildCardTable(set);
  seat.add(table.group);
  const focus = table.focus;
  seat.position.set(...CARD_TABLE.at);
  seat.rotation.y = CARD_TABLE.yaw * DEG;
  // its lamp: a low bronze pendant with a warm glow, and the light in it
  const bronze = new THREE.MeshStandardMaterial({ color: 0x2a1c12, metalness: 0.85, roughness: 0.35 });
  const lamp = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(70, 6, 26), bronze);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(71, 0.8, 27), set.brass); lip.position.y = -3.2;
  const lampGlow = new THREE.Mesh(new THREE.PlaneGeometry(66, 22), new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 0, 0), fog: false }));
  lampGlow.rotation.x = Math.PI / 2; lampGlow.position.y = -3.7;
  lamp.add(body, lip, lampGlow);
  [-26, 26].forEach(x => { const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 200, 8), bronze); rod.position.set(x, 103, 0); lamp.add(rod); });
  lamp.position.set(0, 118, 34);
  seat.add(lamp);
  const lampLight = new THREE.SpotLight(0xffeedd, 0, 0, 0.78, 0.85, 0);
  lampLight.position.set(0, 112, 34);
  lampLight.target.position.set(0, 0, 30);
  lampLight.castShadow = true;
  lampLight.shadow.mapSize.set(1024, 1024);
  lampLight.shadow.camera.near = 50; lampLight.shadow.camera.far = 200;
  lampLight.shadow.bias = -0.0004; lampLight.shadow.normalBias = 0.03; lampLight.shadow.radius = 4;
  seat.add(lampLight, lampLight.target);
  scene.add(seat);
  made.push(seat);

  // ---- The props: the shoe (the deck), the discard rack, the phone.
  // (a box's mouth is its -z face: turned toward where the cards will lie)
  const faceToward = (obj, x, z, tx, tz) => { obj.position.set(x, 0, z); obj.rotation.y = Math.atan2(-(tx - x), -(tz - z)); };
  const shoe = buildShoe(set);
  // (the shoe's mouth is toward the dealer, who draws the cards by their
  // end: L.shoe is where the mouth is, the body lies back from it)
  faceToward(shoe, L.shoe[0], L.shoe[1], L.shoe[0] + 3, L.shoe[1] + 15);
  shoe.position.sub(V(0, 0, -11.6).applyAxisAngle(V(0, 1, 0), shoe.rotation.y));
  const discard = buildDiscard(set);
  faceToward(discard, L.discard[0], L.discard[1], 0, L.z0 + 6);
  // The phone isn't on the table: it's yours, half out of your pocket at
  // the bottom right of the view, and pulled up in front of you on a tap.
  seat.add(shoe, discard);
  // (the hand itself is drawn over the cards - see fly - so it is never
  // painted under a card it is on; this is only its shadow on the felt)
  const handShadow = new THREE.Mesh(new THREE.PlaneGeometry(16, 22), new THREE.MeshBasicMaterial({ map: canvasTex(128, 128, (c, W, H) => { const g = c.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 2); g.addColorStop(0, 'rgba(0,0,0,0.9)'); g.addColorStop(0.45, 'rgba(0,0,0,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, W, H); }), transparent: true, depthWrite: false, opacity: 0 }));
  handShadow.rotation.x = -Math.PI / 2; handShadow.position.y = 0.02; handShadow.renderOrder = 2;
  seat.add(handShadow);
  // The dealer's port: a brass ring let into the felt by the shoe, a dark
  // well, and two ceramic leaves that draw back into the rim while the arm
  // is up (setPort: 0 shut, 1 open).
  const port = new THREE.Group();
  port.position.set(PORT.x, 0, PORT.z);
  const portRing = new THREE.Mesh(new THREE.TorusGeometry(PORT.r, 0.2, 10, 48), set.brass);
  portRing.rotation.x = Math.PI / 2; portRing.position.y = 0.1;
  const portWell = new THREE.Mesh(new THREE.CircleGeometry(PORT.r, 40), new THREE.MeshBasicMaterial({ color: 0x040303 }));
  portWell.rotation.x = -Math.PI / 2; portWell.position.y = 0.03;
  // (black lacquer like the rack, so shut it is only a ring in the felt)
  const leafMat = new THREE.MeshPhysicalMaterial({ color: 0x100e0d, roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.12 });
  const leaves = [0, 1].map(i => {
    const m = new THREE.Mesh(new THREE.CircleGeometry(PORT.r - 0.08, 32, Math.PI / 2 + i * Math.PI, Math.PI), leafMat);
    m.rotation.x = -Math.PI / 2; m.position.y = 0.06; m.receiveShadow = true;
    return m;
  });
  port.add(portWell, portRing, ...leaves);
  seat.add(port);
  const setPort = k => leaves.forEach((m, i) => {
    const w = Math.max(0.002, 1 - clamp01(k));
    m.scale.x = w; m.position.x = (i ? 1 : -1) * PORT.r * (1 - w);
  });
  setPort(0);
  const shoeMouth = V(0, 0.9, -11.6).applyAxisAngle(V(0, 1, 0), shoe.rotation.y).add(shoe.position);
  const mouthDir = V(0, 0, -1).applyAxisAngle(V(0, 1, 0), shoe.rotation.y);
  // (a card in the shoe lies with its top inward: the dealer draws it by
  // its bottom end, and turns it over its far edge onto its place)
  const yawShoe = Math.atan2(-mouthDir.x, -mouthDir.z);

  // The lamp comes up while the intro floats, so the table is there, lit,
  // before the camera turns toward it.
  let lampT0 = performance.now();
  const lampUp = () => {
    const k = smoother((performance.now() - lampT0) / 2200);
    lampLight.intensity = 3.3 * k;
    lampGlow.material.color.setRGB(2.2 * k, 1.75 * k, 1.3 * k);
    return k;
  };
  lampUp();

  // ---- The fly-in and the seat.
  // flyOpts: `reduced` (motion off) cuts to the seat with the cards already
  // dealt and nothing moving after - the readable take of the same table;
  // `duration` is a fly of its own length (the short sit-down when the
  // seat is taken without the shot).
  async function fly(world, flyOpts = {}) {
    const fo = Object.assign({ manual: false, reduced: false, duration: 0, onArrive: null, host: null, seatView: null }, flyOpts);
    const { renderer, camera } = world;
    if (fo.reduced) lampT0 = -Infinity;   // (the lamp is simply on)
    const stageEl = fo.host || document.body;
    world.overlays.forEach(el => { el.style.visibility = 'hidden'; });
    // CSS3D layer, over the canvas, same camera.
    const css = new CSS3DRenderer();
    css.domElement.className = 'r3t-css';
    const cssScene = new THREE.Scene();
    const cssSeat = new THREE.Group();
    cssSeat.position.copy(seat.position); cssSeat.quaternion.copy(seat.quaternion);
    cssScene.add(cssSeat);
    const size = () => {
      world.size();
      const w = world.host.clientWidth || window.innerWidth, h = world.host.clientHeight || window.innerHeight;
      css.setSize(w, h);
      if (typeof sizeHand === 'function') sizeHand(w, h);
      return w / h;
    };
    // The dealer's arm has a canvas of its own over the cards (the cards
    // are page elements, always painted over the table's canvas, and the
    // hand is on top of the cards it deals), under the phone in yours.
    const handGL = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    handGL.setPixelRatio(world.pixelRatio || 1);
    handGL.toneMapping = renderer.toneMapping; handGL.toneMappingExposure = renderer.toneMappingExposure;
    handGL.outputColorSpace = renderer.outputColorSpace;
    handGL.domElement.className = 'r3t-hand';
    const handScene = new THREE.Scene();
    const handSeat = new THREE.Group();
    handSeat.position.copy(seat.position); handSeat.quaternion.copy(seat.quaternion);
    // (anything of the arm below the felt is inside the table: clipped)
    handGL.localClippingEnabled = true;
    const dealerMats = dealerMaterials();
    const underFelt = [new THREE.Plane(V(0, 1, 0), -0.05)];
    Object.values(dealerMats).forEach(mat => { mat.clippingPlanes = underFelt; });
    const dealer = buildDealerHand(dealerMats);
    const arm = buildDealerArm(dealerMats);
    handSeat.add(dealer, arm.group);
    handScene.add(handSeat);
    {
      const key = new THREE.DirectionalLight(0xffeedd, 2.4); key.position.set(-8, 40, 12); handSeat.add(key, key.target);
      const fill = new THREE.DirectionalLight(0xc9d2e6, 0.5); fill.position.set(6, 10, -30); handSeat.add(fill, fill.target);
      handScene.add(new THREE.HemisphereLight(0xfff0e0, 0x1a1410, 0.5));
    }
    const sizeHand = (w, h) => handGL.setSize(w, h, false);
    let aspect = size();
    stageEl.appendChild(css.domElement);
    css.domElement.appendChild(handGL.domElement);

    // Where the camera sits, and what it looks at, in the seat's frame.
    const seatView = () => {
      // (lab: ?seatcam=eyeY,eyeZ,aimZ,fov overrides the framing, for tuning)
      if (fo.seatView) { const [ey, ez, az, fv] = fo.seatView; return { eye: V(0, ey, ez), aim: V(0, 0, az), fov: fv }; }
      const v = L.view[aspect < 0.62 ? 0 : 1];
      return { eye: V(...v.eye), aim: V(...v.aim), fov: v.fov };
    };
    const toWorld = v => seat.localToWorld(v.clone());
    seat.updateMatrixWorld(true);
    let sv = seatView();
    let E1 = toWorld(sv.eye), A1 = toWorld(sv.aim);

    // The path: one unbroken glide from wherever the float left the camera
    // to the chair. It lifts off toward the card table, clearing everything
    // by a wide margin at a steady cruise height, with the table held in the
    // middle of the view as it comes up to meet you. Then it settles from
    // behind the chair down into the seat. There is no swerve, no bank and
    // no zoom pulse, and nothing passes close to the lens.
    const E0 = camera.position.clone(), q0 = camera.quaternion.clone();
    const seatBack = toWorld(V(0, 0, -1)).sub(toWorld(V(0, 0, 0))).normalize();
    // (the table's heart, a little above the felt: what the eye holds on)
    const F = toWorld(V(focus[0], 6, focus[2]));
    // (under the craps table's lamp, whose shade hangs at 168 cm)
    const cruise = THREE.MathUtils.clamp(Math.max(E0.y, E1.y) + 55, 110, 150);
    const bez = (u, a, b, c, d) => { const v = 1 - u; return v * v * v * a + 3 * v * v * u * b + 3 * v * u * u * c + u * u * u * d; };
    const P1 = V(0, 0, 0), P2 = V(0, 0, 0);
    // (k: the time through the shot, 0..1. Across the room it goes on a
    // smooth curve that ends coming in from behind the chair; up and down
    // it goes on a timing of its own - up to the cruise first, so the
    // craps table's rail is well below before it moves off, and down into
    // the seat last. Worked out from E1 each time: a turned phone moves
    // the seat's eye.)
    const eyeAt = (k, out) => {
      const u = smoother(k);
      P1.copy(E0).lerp(E1, 0.2);
      P2.copy(E1).addScaledVector(seatBack, 60);
      const y = E0.y + (cruise - E0.y) * easeOut(k / 0.34, 2) - (cruise - E1.y) * smoother((k - 0.46) / 0.54);
      return out.set(bez(u, E0.x, P1.x, P2.x, E1.x), y, bez(u, E0.z, P1.z, P2.z, E1.z));
    };
    const m4 = new THREE.Matrix4();
    const lookQ = (eye, at, out) => out.setFromRotationMatrix(m4.lookAt(eye, at, V(0, 1, 0)));
    const FLY = fo.reduced ? 0.01 : fo.duration > 0 ? fo.duration : T.cardFly;
    // (motion off: the UI is simply there, and each card is on its place
    // the moment the frame is - no deal, the arm stowed under the felt)
    const UI_IN = fo.reduced ? 0.01 : T.uiIn;
    const EACH = fo.reduced ? 0 : DEAL.each;
    const fov0 = camera.fov;
    const lens0 = world.lights.lensLight.intensity;
    const bloom0 = world.bloom ? world.bloom.strength : 0;

    // ---- The UI, built now, shown on arrival.
    const ui = document.createElement('div');
    ui.className = 'r3t-ui';
    const add = (el, pos, q, scale) => {
      const obj = new CSS3DObject(el);
      obj.position.copy(pos); obj.quaternion.copy(q); obj.scale.setScalar(scale);
      cssSeat.add(obj);
      return obj;
    };
    // the rail's instruments
    const railEl = document.createElement('div');
    railEl.className = 'r3t-rail';
    railEl.innerHTML = railHTML();
    const railObj = add(railEl, V(L.rail.x || 0, L.rail.y, L.rail.z), lying(new THREE.Quaternion(), { tilt: L.rail.tilt * DEG }), 1 / (L.rail.scale || 40));
    // the cards
    const hand = (hooks.deck && hooks.deck()) || [];
    const cards = (hand.length ? hand : demoHand()).slice(0, SLOTS.max);
    const sampleStatus = () => ({ ready: cards.length, value: cards.reduce((t, c) => t + (c.ev || 0), 0), next: null, done: 0 });
    // (a third row of cards moves the whole hand nearer, and the wordmark
    // up toward the dealer, to make room)
    const rows = Math.ceil(cards.length / SLOTS.cols);
    const z0 = rows >= 3 ? L.z0 - 4 : L.z0;
    if (table.group.userData.mark) table.group.userData.mark.position.z = FELT.b - (rows >= 3 ? 15 : 23);
    const slotAt = i => {
      const r = Math.floor(i / SLOTS.cols), c = i % SLOTS.cols;
      const inRow = Math.min(SLOTS.cols, cards.length - r * SLOTS.cols);
      const x = ((inRow - 1) / 2 - c) * (CARD.w + SLOTS.gapX);
      return V(x, 0.04, z0 + r * (CARD.h + SLOTS.gapZ));
    };
    const cardObjs = cards.map((c, i) => {
      // (a div, not a <button>: Chrome lays a button's content in a box of
      // its own that flattens 3D, and the card's two faces must stay 3D)
      const el = document.createElement('div');
      el.className = 'r3t-card';
      el.setAttribute('role', 'button');
      el.tabIndex = 0;
      el.innerHTML = cardHTML(c);
      el.dataset.id = c.id;
      const obj = add(el, shoeMouth.clone().addScaledVector(mouthDir, -4), lying(new THREE.Quaternion(), { yaw: yawShoe, flip: Math.PI }), 1 / CARD.px);
      obj.userData = { card: c, slot: slotAt(i), yaw: ((hash(c.name || '') % 7) - 3) * 0.6 * DEG, i };
      // where the lamp's reflection sits on the card: toward the lamp, which
      // hangs over the middle of the table (+x is the player's left, the
      // face's right side from the seat)
      el.style.setProperty('--gx', `${Math.round(50 + obj.userData.slot.x * 4)}%`);
      el.style.visibility = 'hidden';
      return obj;
    });
    // Your phone: not on the table but in the corner of the view, half out
    // of your pocket, and up in front of you on a tap (a page element,
    // over the hand's canvas; its moves are the page's own transitions)
    const phoneEl = document.createElement('div');
    phoneEl.className = 'r3t-phone';
    phoneEl.setAttribute('role', 'button');
    phoneEl.setAttribute('aria-label', 'Your phone: freebies, community drops, the deck, the catalogue and settings');
    phoneEl.tabIndex = 0;
    phoneEl.innerHTML = phoneHTML(asset);
    css.domElement.appendChild(phoneEl);
    let phoneHeld = false;
    // A lifted card's info: the Keen Info its logo pops out in the Deck,
    // and its own moves - open it, mark it collected, run the deck from it
    // (hooks.cardInfo / hooks.cardAction) - in a low sheet over the rail,
    // the card held above it.
    const infoEl = document.createElement('div');
    infoEl.className = 'r3t-info';
    infoEl.setAttribute('role', 'region');
    infoEl.style.visibility = 'hidden';
    css.domElement.appendChild(infoEl);
    let infoId = null;
    const showInfo = id => {
      const d = hooks.cardInfo ? hooks.cardInfo(id) : null;
      if (!d) { hideInfo(); return; }
      infoId = id;
      const tier = tierOf(d.tier);
      infoEl.setAttribute('aria-label', `${d.name}: keen info`);
      infoEl.innerHTML = `<div class="r3t-info-in">
        <div class="r3t-info-head"><span class="r3t-info-tier t-${tier}">${tier === 'U' ? '&bull;' : tier}</span><b>${esc(d.name)}</b><span class="r3t-info-state${d.ready ? ' r3t-ready' : ''}">${esc(d.state)}</span><button type="button" class="r3t-info-x" aria-label="Put the card back">&times;</button></div>
        <div class="r3t-info-acts">${(d.acts || []).map(([act, label]) => `<button type="button" class="r3t-act r3t-act-${esc(act)}" data-act="${esc(act)}">${esc(label)}</button>`).join('')}</div>
        <div class="r3t-info-body">${d.html || ''}</div>
      </div>`;
      infoEl.style.visibility = 'visible';
      requestAnimationFrame(() => { if (infoId === id) infoEl.classList.add('r3t-open'); });
    };
    function hideInfo() {
      infoId = null;
      infoEl.classList.remove('r3t-open');
      infoEl.style.visibility = 'hidden';
    }
    const holdPhone = on => {
      phoneHeld = !!on;
      phoneEl.classList.toggle('r3t-held', phoneHeld);
      phoneEl.setAttribute('aria-expanded', phoneHeld ? 'true' : 'false');
    };

    css.domElement.appendChild(ui);
    css.domElement.classList.add('r3t-hide');

    // ---- Time and the rail's readouts.
    const q = s => railEl.querySelector(s);
    // (only what changed is touched: each change re-rasterises a layer
    // laid in 3D, and the phone's and the rail's are large)
    const put = (el, v) => { if (el && el.textContent !== v) el.textContent = v; };
    const turn = (el, deg) => { const v = `rotate(${deg} 50 50)`; if (el && el.getAttribute('transform') !== v) el.setAttribute('transform', v); };
    const tick = () => {
      const d = new Date();
      const hh = d.getHours(), mm = d.getMinutes(), ss = d.getSeconds();
      const h12 = ((hh + 11) % 12) + 1;
      const hm = `${h12}:${String(mm).padStart(2, '0')}`;
      put(q('.r3t-now'), hm);
      put(q('.r3t-date'), `${hh < 12 ? 'AM' : 'PM'} · ${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`);
      turn(q('.r3t-hand-h'), (hh % 12) * 30 + mm * 0.5);
      turn(q('.r3t-hand-m'), mm * 6 + ss * 0.1);
      turn(q('.r3t-hand-s'), ss * 6);
      const st = (hand.length && hooks.status && hooks.status()) || sampleStatus();
      put(q('.r3t-run-v'), `${st.ready} ready${st.value > 0 ? ` · ~$${st.value.toFixed(2)}` : ''}`);
      put(q('.r3t-next'), st.next ? `Next in ${fmtLeft(st.next)}` : 'All caught up');
      put(q('.r3t-done'), `${st.done} done today`);
      phoneEl.querySelectorAll('.r3t-ph-clock, .r3t-ph-big').forEach(n => put(n, hm));
      put(phoneEl.querySelector('.r3t-ph-day'), d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }));
      put(phoneEl.querySelector('.r3t-ph-ready'), `${st.ready} ready${st.value > 0 ? ` · ~$${st.value.toFixed(2)}` : ''}`);
      put(phoneEl.querySelector('.r3t-ph-next'), st.next ? `Next comes ready in ${fmtLeft(st.next)}` : `All caught up · ${st.done} done today`);
      // each dealt card's state as it is now: collected at the table (or
      // anywhere), it shows how long it has left
      if (hooks.cardState) cardObjs.forEach(obj => {
        const c = obj.userData.card, now = hooks.cardState(c.id);
        if (!now) return;
        c.remaining = now.remaining;
        put(obj.element.querySelector('.r3t-state'), cardShown(c));
        obj.element.classList.toggle('r3t-spent', c.remaining > 0);
      });
    };
    tick();
    const clock = setInterval(tick, 1000);

    // ---- The timeline, in seconds from the tap.
    const dealAt = FLY + UI_IN;
    const cardAt = i => dealAt + i * EACH;
    // (settled: the last card down and the arm back under the felt - see
    // poseHand: its last release, then 0.9 s to fold, sink and shut)
    const lastRelease = cardAt(cards.length - 1) + DEAL.reach + DEAL.pull + DEAL.carry + DEAL.settle + DEAL.push;
    const settleAt = cards.length ? Math.max(cardAt(cards.length - 1) + EACH + 0.55, fo.reduced ? 0 : lastRelease + 1) : dealAt;
    const introT0 = world.t;
    let focusId = null;
    const lift = new Map();                 // card id -> [k, target, from, t0]

    const tmpQ = new THREE.Quaternion(), camQ = new THREE.Quaternion();
    const up = V(0, 1, 0);
    const flyEye = V(0, 0, 0), qTable = new THREE.Quaternion(), qSeat = new THREE.Quaternion();
    const placeCamera = tt => {
      if (tt < FLY) {
        // (smootherstep: it eases away from the float and into the seat
        // with no jolt at either end)
        const u = smoother(tt / FLY);
        const e = eyeAt(tt / FLY, flyEye);
        // the look: the head comes up from the dice onto the card table
        // first, while the camera is still rising (so it never stares into
        // the craps table's rail on the way), is held on the table through
        // the glide, then settles onto the felt in front of the seat
        lookQ(e, F, qTable);
        lookQ(E1, A1, qSeat);
        camQ.copy(q0).slerp(qTable, smoother(tt / (FLY * 0.3))).slerp(qSeat, smoother((u - 0.62) / 0.38));
        camera.up.copy(up);
        camera.position.copy(e);
        camera.quaternion.copy(camQ);
        camera.fov = lerp(fov0, sv.fov, smoother(u));
      } else {
        camera.up.copy(up);
        camera.position.copy(E1);
        camera.lookAt(A1);
        camera.fov = sv.fov;
      }
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
    };
    // Each card: in the shoe until its pull; drawn out by its end, face
    // down, its top toward the player; carried over to lie a length short
    // of its place; then flipped over its far edge onto it, face up and
    // the right way up. The hand is on top of the card throughout.
    const inShoe = shoeMouth.clone().addScaledVector(mouthDir, -4);
    const pulled = shoeMouth.clone().addScaledVector(mouthDir, 1.6);
    const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
    const topOf = obj => V(Math.sin(obj.userData.yaw), 0, Math.cos(obj.userData.yaw));
    // where the card lies face down, and the edge it turns over
    const layAt = obj => obj.userData.slot.clone().addScaledVector(topOf(obj), CARD.h);
    const flipAxis = obj => { const top = topOf(obj); return { pt: obj.userData.slot.clone().addScaledVector(top, CARD.h / 2), axis: top.clone().cross(up).normalize(), top }; };
    const stages = i => { const t0 = cardAt(i) + DEAL.reach, t1 = t0 + DEAL.pull, t2 = t1 + DEAL.carry, t3 = t2 + DEAL.settle, t4 = t3 + DEAL.push, t5 = t4 + DEAL.fall; return { t0, t1, t2, t3, t4, t5 }; };
    // the card's turn: angle a over its far edge (0 flat face down, pi flat face up)
    const turned = (obj, a, out) => {
      const { pt, axis, top } = flipAxis(obj);
      const R = new THREE.Quaternion().setFromAxisAngle(axis, a);
      out.p.copy(pt).add(V(0, 0, 0).copy(top).multiplyScalar(CARD.h / 2).applyQuaternion(R));
      lying(out.q, { yaw: obj.userData.yaw + Math.PI, flip: Math.PI }).premultiply(R);
      return out;
    };
    const cardPose = { p: V(0, 0, 0), q: new THREE.Quaternion() };
    const poseCards = tt => {
      cardObjs.forEach((obj, i) => {
        const { t0, t1, t2, t3, t4, t5 } = stages(i);
        const el = obj.element;
        if (tt < (fo.reduced ? dealAt : t0)) { el.style.visibility = 'hidden'; return; }
        el.style.visibility = 'visible';
        const p = cardPose.p, q = cardPose.q;
        if (fo.reduced) {
          turned(obj, Math.PI, cardPose);
        } else if (tt < t1) {
          const k = easeOut((tt - t0) / DEAL.pull, 2);
          p.copy(inShoe).lerp(pulled, k); p.y += 0.3 * k;
          lying(q, { yaw: yawShoe, flip: Math.PI });
        } else if (tt < t3) {
          const k = easeInOut(clamp01((tt - t1) / DEAL.carry));
          p.copy(pulled).lerp(layAt(obj), k);
          p.y += Math.sin(Math.PI * k) * 3.4 + (1 - k) * 0.3;
          lying(q, { yaw: yawShoe + wrap(obj.userData.yaw + Math.PI - yawShoe) * k, flip: Math.PI });
        } else if (tt < t4) {
          turned(obj, 62 * DEG * smoother((tt - t3) / DEAL.push), cardPose);
        } else {
          // over it goes, quickening, with a small bounce at the end
          const k = clamp01((tt - t4) / DEAL.fall);
          const a = 62 * DEG + (Math.PI - 62 * DEG) * Math.pow(k, 1.7);
          turned(obj, a, cardPose);
          if (tt >= t5) { const b = tt - t5; p.y += Math.max(0, 0.9 * Math.sin(b * 22) * Math.exp(-b * 9)); }
        }
        const L = lift.get(obj.userData.card.id);
        if (L) {
          const lk = fo.reduced ? L[1] : smoother(L[2] + (L[1] - L[2]) * clamp01((tt - L[3]) / 0.35));
          L[0] = lk;
          // (tipping toward you, it tips into the lamp's reflection)
          const lv = lk.toFixed(2);
          if (el.dataset.lift !== lv) { el.dataset.lift = lv; el.style.setProperty('--lift', lv); }
          p.y += lk * 5; p.z -= lk * 3.2;
          // (tipped up toward you about its own width)
          q.multiply(_q2.setFromAxisAngle(V(1, 0, 0), L[0] * 34 * DEG));
        }
        obj.position.copy(p);
        obj.quaternion.copy(q);
        el.classList.toggle('r3t-up', V(0, 0, 1).applyQuaternion(q).y > 0);
      });
    };
    // The machine's moves. It stays stowed under the port until the deal.
    // Then the port opens and it rises out of the table, a straight
    // column, its hand pointing up. It swings down to the shoe and draws
    // each card, carries it and turns it over onto its place, then goes
    // straight back to the shoe for the next on one smooth arc. When the
    // hand is out it straightens, sinks back into the table, and the port
    // shuts. Every move is an S-curve (smootherstep): fast, and exact at
    // both ends. (Motion off: it stays below, the cards already dealt.)
    const gripAt = shoeMouth.clone().addScaledVector(mouthDir, 0.6); gripAt.y = shoeMouth.y + 0.95;
    const GRIP = handPose(gripAt, mouthDir.clone().negate().add(V(0, -0.08, 0)), up);
    const onCard = (obj, inFrom) => {
      // the card's "end" the hand holds is its local bottom: the dealer's
      // side (the card's top is toward the player until it is turned)
      const q = obj.quaternion, p = obj.position;
      const end = V(0, -1, 0).applyQuaternion(q), back = V(0, 0, -1).applyQuaternion(q);
      return handPose(p.clone().addScaledVector(end, CARD.h / 2 - inFrom).addScaledVector(back, 0.95), end.clone().negate(), back);
    };
    // where the hand lets a card go: on it, the card turned 62 degrees
    const heldAt = obj => { const at = { p: V(0, 0, 0), q: new THREE.Quaternion() }; turned(obj, 62 * DEG, at); return onCard({ position: at.p, quaternion: at.q }, 1.6); };
    // straight up over the port, the shoulder at y: the arm at full length,
    // the hand on top pointing up, its back to the dealer (so it all goes
    // through the port's ring)
    const reachUp = ARM.upper + ARM.fore - 0.1;
    const upright = y => handPose(V(PORT.x, y + reachUp - WRIST.z, PORT.z - WRIST.y), V(0, 1, 0), V(0, 0, 1));
    const mixPose = (a, b, k) => ({ p: a.p.clone().lerp(b.p, k), q: a.q.clone().slerp(b.q, k) });
    const arcTo = (a, b, k, lift) => { const m = mixPose(a, b, smoother(k)); m.p.y += Math.sin(Math.PI * clamp01(k)) * lift; return m; };
    const RISE = { open: 0.95, up: 0.85, swing: 0.45 };         // seconds before dealAt
    const SINK = { fold: 0.4, down: 0.35, shut: 0.15 };           // seconds after the last card
    const wristW = V(0, 0, 0);
    let prevPalm = null, prevT = 0, glow = 0;
    const poseHand = tt => {
      const n = cardObjs.length;
      let pose = upright(ARM.down), y = ARM.down, open = 0;
      if (n && !fo.reduced && tt >= dealAt - RISE.open) {
        const first = stages(0).t0, lastEnd = stages(n - 1).t4;
        open = smoother((tt - (dealAt - RISE.open)) / 0.15);
        if (tt < dealAt - RISE.swing) {
          y = lerp(ARM.down, ARM.up, easeOut((tt - (dealAt - RISE.up)) / (RISE.up - RISE.swing), 3));
          pose = upright(y);
        } else if (tt < first) {
          y = ARM.up;
          pose = arcTo(upright(ARM.up), GRIP, (tt - (dealAt - RISE.swing)) / (first - (dealAt - RISE.swing)), 2);
        } else if (tt < lastEnd) {
          y = ARM.up;
          const i = Math.min(n - 1, Math.max(0, Math.floor((tt - dealAt - DEAL.reach) / DEAL.each)));
          const st = stages(i);
          if (tt < st.t4) pose = onCard(cardObjs[i], 1.6);
          else pose = arcTo(heldAt(cardObjs[i]), GRIP, (tt - st.t4) / (stages(i + 1).t0 - st.t4), 4.5);
        } else {
          const k = tt - lastEnd;
          if (k < SINK.fold) { y = ARM.up; pose = arcTo(heldAt(cardObjs[n - 1]), upright(ARM.up), k / SINK.fold, 3); }
          else {
            y = lerp(ARM.up, ARM.down, smoother((k - SINK.fold) / SINK.down));
            pose = upright(y);
            open = 1 - smoother((k - SINK.fold - SINK.down + 0.05) / SINK.shut);
          }
        }
      }
      dealer.position.copy(pose.p);
      dealer.quaternion.copy(pose.q);
      wristW.copy(WRIST).applyQuaternion(pose.q).add(pose.p);
      arm.pose(y, wristW);
      setPort(open);
      const shown = y > ARM.down + 1;
      dealer.visible = arm.group.visible = shown;
      // the light in its circuits: up while it works, brighter as it moves
      const palm = V(0, 1.2, -9.8).applyQuaternion(pose.q).add(pose.p);
      const dt = tt - prevT;
      const speed = prevPalm && dt > 0 && dt < 0.2 ? prevPalm.distanceTo(palm) / dt : 0;
      glow = lerp(glow, shown ? 0.16 + Math.min(0.5, speed / 160) : 0, 0.35);
      dealerMats.ceramic.emissiveIntensity = glow;
      prevPalm = palm; prevT = tt;
      // its shadow on the felt, under the palm, fading as the hand rises
      handShadow.position.set(palm.x, 0.02, palm.z);
      handShadow.rotation.z = Math.atan2(V(0, 0, 1).applyQuaternion(pose.q).x, V(0, 0, 1).applyQuaternion(pose.q).z);
      handShadow.material.opacity = shown && palm.y > 0 ? 0.5 * clamp01(1 - (palm.y - 1.2) / 14) : 0;
    };
    let tNow = 0, raf = 0, last = 0, running = false, arrived = false, disposed = false;
    const update = tt => {
      tNow = tt;
      lampUp();
      placeCamera(tt);
      // the intro's own world keeps time (the stick still drawing the dice)
      world.stage(introT0 + tt);
      // (its lights set by stage(): the lens light goes, and the rim light
      // eases down)
      const kf = fo.reduced ? 1 : clamp01(tt / 0.9);
      world.lights.lensLight.intensity = lens0 * (1 - kf);
      world.lights.rim.intensity *= 1 - 0.6 * kf;
      // (motion off: no bloom either - the glints stay on the metal, the
      // light stays off the print)
      if (world.bloom) world.bloom.strength = fo.reduced ? 0 : lerp(bloom0, 0.3, kf);
      poseCards(tt);
      poseHand(tt);
      const uiK = clamp01((tt - FLY + 0.1) / UI_IN);
      css.domElement.style.setProperty('--r3t-in', uiK.toFixed(3));
      css.domElement.classList.toggle('r3t-hide', uiK <= 0);
      if (!arrived && tt >= FLY) { arrived = true; if (fo.onArrive) fo.onArrive(css.domElement); }
    };
    const draw = () => {
      if (world.composer) world.composer.render(); else renderer.render(scene, camera);
      css.render(cssScene, camera);
      handGL.render(handScene, camera);
    };
    const busyUntil = () => Math.max(settleAt, ...[...lift.values()].map(L => L[3] + 0.4));
    const loop = now => {
      if (!running) return;
      // (slow frames play the shot slower rather than skip through it, down
      // to 10 a second)
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
      last = now;
      update(tNow + dt);
      draw();
      if (tNow > busyUntil()) { running = false; return; }
      raf = requestAnimationFrame(loop);
    };
    const wake = () => { if (disposed || fo.manual) { if (fo.manual) { update(tNow); draw(); } return; } if (!running) { running = true; last = 0; raf = requestAnimationFrame(loop); } };

    // ---- Interaction.
    // A lifted card goes back down, and its info away.
    const putDown = () => {
      if (focusId) { const F = lift.get(focusId); if (F) { F[2] = F[0]; F[1] = 0; F[3] = tNow; } }
      focusId = null;
      hideInfo();
      wake();
    };
    css.domElement.addEventListener('click', e => {
      // (the info's own: its moves, its close, and - inside it - the Keen
      // Info's notes and share, which answer for themselves)
      const act = e.target.closest('.r3t-info [data-act]');
      if (act) {
        const id = infoId;
        putDown();
        if (hooks.cardAction && id) hooks.cardAction(id, act.dataset.act);
        tick();
        return;
      }
      if (e.target.closest('.r3t-info-x')) { const back = focusId; putDown(); const el = back && cardObjs.find(o => o.userData.card.id === back); if (el && e.detail === 0) el.element.focus({ preventScroll: true }); return; }
      if (e.target.closest('.r3t-info')) return;
      const card = e.target.closest('.r3t-card');
      if (card) {
        const id = card.dataset.id;
        const L = lift.get(id);
        const cur = L ? L[0] : 0;
        const target = cur > 0.5 ? 0 : 1;
        if (focusId && focusId !== id) { const F2 = lift.get(focusId); if (F2) { F2[2] = F2[0]; F2[1] = 0; F2[3] = tNow; } }
        lift.set(id, [cur, target, cur, tNow]);
        focusId = target ? id : null;
        if (focusId) {
          showInfo(id);
          // (from the keyboard, on to the card's first move)
          if (e.detail === 0) { const first = infoEl.querySelector('[data-act]'); if (first) first.focus({ preventScroll: true }); }
        } else hideInfo();
        if (hooks.cardTap) hooks.cardTap(id);
        wake();
        return;
      }
      if (e.target.closest('.r3t-run')) { if (hooks.run) hooks.run(); return; }
      const tile = e.target.closest('.r3t-ph-tile, .r3t-ph-gear');
      if (tile) { if (hooks.openView) hooks.openView(tile.dataset.view); return; }
      if (e.target.closest('.r3t-ph-put')) { holdPhone(false); return; }
      if (e.target.closest('.r3t-phone') && !phoneHeld) { holdPhone(true); }
    });
    css.domElement.addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && (e.target.classList.contains('r3t-card') || e.target.classList.contains('r3t-phone'))) { e.preventDefault(); e.target.click(); }
      if (e.key === 'Escape' && phoneHeld) { holdPhone(false); phoneEl.focus({ preventScroll: true }); }
      else if (e.key === 'Escape' && focusId) { const back = cardObjs.find(o => o.userData.card.id === focusId); putDown(); if (back) back.element.focus({ preventScroll: true }); }
    });
    const onResize = () => {
      aspect = size();
      sv = seatView(); E1 = toWorld(sv.eye); A1 = toWorld(sv.aim);
      update(tNow); draw();
    };
    window.addEventListener('resize', onResize);

    update(0); draw();
    if (!fo.manual) { running = true; raf = requestAnimationFrame(loop); }

    return {
      dest,
      duration: FLY, settleAt,
      get t() { return tNow; },
      seek(t) { tNow = t; update(t); draw(); },
      pickUpPhone(on = true) { holdPhone(on); },
      // (lab and tests: lift a card, as a tap would)
      liftCard(id) { const el = cardObjs.find(o => o.userData.card.id === id); if (el) el.element.click(); },
      putDown,
      dispose() {
        disposed = true; running = false; cancelAnimationFrame(raf);
        clearInterval(clock);
        window.removeEventListener('resize', onResize);
        handGL.dispose();
        css.domElement.remove();
      }
    };
  }

  return {
    dest,
    fly,
    dispose() { made.forEach(m => scene.remove(m)); }
  };
}
