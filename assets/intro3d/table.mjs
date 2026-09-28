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
// (the machine's pace, in seconds: quick enough to be just past what a
// person could do - see makeDeal)
const DEAL = { grab: 0.16, regrab: 0.1, pull: 0.07, carry: 0.26, settle: 0.07, push: 0.09, fall: 0.22, turn: 0.34,
  lay: 0.13, back: 0.28, show: 0.55, sweep: 0.14, cascade: 0.075 };
// The ways it deals (a deal picks one, or ?deal= names it):
//   single  - one card at a time, drawn, carried and pushed over
//   rows    - a row's cards drawn together, laid face down across the row,
//             then swept over in one pass
//   columns - the same by columns, the column swept from front to back
//   spread  - every card laid face down, a beat to see the backs, then one
//             touch and the whole spread turns over in a cascade
const DEAL_STYLES = ['single', 'rows', 'columns', 'spread'];
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
  const backM = new THREE.MeshStandardMaterial({ map: backTex(), roughness: 0.5 });
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
  const backM = new THREE.MeshStandardMaterial({ map: backTex(), roughness: 0.5 });
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
  // (the light in the traces runs in pulses along each part, from the
  // column up to the hand: pulse.value is the time)
  const pulse = { value: 0 };
  ceramic.onBeforeCompile = sh => {
    sh.uniforms.uPulse = pulse;
    sh.fragmentShader = 'uniform float uPulse;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      #ifdef USE_EMISSIVEMAP
        totalEmissiveRadiance *= 0.35 + 2.4 * pow(0.5 + 0.5 * sin(vEmissiveMapUv.y * 19.0 - uPulse * 8.0), 7.0);
      #endif`);
  };
  ceramic.customProgramCacheKey = () => 'dealer-ceramic-pulse';
  const plain = new THREE.MeshPhysicalMaterial({ color: 0xf4f1eb, roughness: 0.34, clearcoat: 0.85, clearcoatRoughness: 0.16 });
  const clear = new THREE.MeshPhysicalMaterial({ color: 0xeaf2f6, roughness: 0.05, transparent: true, opacity: 0.32, clearcoat: 1, depthWrite: false });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd6b064, metalness: 1, roughness: 0.26, emissive: 0x6a4512, emissiveIntensity: 0.25 });
  const graphite = new THREE.MeshStandardMaterial({ color: 0x1c1b1e, metalness: 0.55, roughness: 0.36 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, metalness: 1, roughness: 0.12 });
  const led = new THREE.MeshBasicMaterial({ color: 0xffb860 });
  return { ceramic, plain, clear, gold, graphite, chrome, led, pulse };
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
  // (a gold trace along the top of a segment)
  const trace = (a, b, r) => laid(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 6), m.gold), a.clone().add(V(0, r * 0.93, 0)), b.clone().add(V(0, r * 0.93, 0)), true);
  // the fingers: three segments each on a hinge, lying almost flat (the
  // tips lowest, to slide under a card's end), each segment its own pivot
  // so they curl on a grip and open and spread to let go
  const fingers = [];
  [[2.3, 0.94, 1], [0.8, 1, 0.35], [-0.8, 0.97, -0.35], [-2.3, 0.84, -1]].forEach(([x, k, side]) => {
    const p0 = V(x, 0.68, -0.4), p1 = p0.clone().add(V(0, 0.16, -1.7 * k)), p2 = p1.clone().add(V(0, 0.2, -2.0 * k)), p3 = V(x, 1.22, -6.4);
    const root = new THREE.Group(); root.position.copy(p3); hand.add(root);
    const mid = new THREE.Group(); mid.position.copy(p2).sub(p3); root.add(mid);
    const tip = new THREE.Group(); tip.position.copy(p1).sub(p2); mid.add(tip);
    const o = V(0, 0, 0);
    root.add(bone(0.47, o, p2.clone().sub(p3), m.plain), trace(V(0, 0, -0.2), p2.clone().sub(p3).add(V(0, 0, 0.5)), 0.47));
    mid.add(hinge(o, 0.36), bone(0.44, o, p1.clone().sub(p2), m.plain), trace(V(0, 0, 0.45), p1.clone().sub(p2).add(V(0, 0, 0.4)), 0.44));
    tip.add(hinge(o, 0.33), bone(0.4, o, p0.clone().sub(p1), m.plain));
    // a gold pad under the tip, a clear nail over it
    const pad = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), m.gold); pad.position.copy(p0).sub(p1).add(V(0, -0.22, -0.1)); tip.add(pad);
    const nail = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), m.clear); nail.scale.set(0.95, 0.5, 1.5); nail.position.copy(p0).sub(p1).add(V(0, 0.12, -0.35)); tip.add(nail);
    // (a cap over the knuckle)
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.56, 16, 12), m.clear); root.add(cap);
    fingers.push({ root, mid, tip, side });
  });
  // the knuckles: one graphite bar with gold ends, the palm a ceramic plate
  // behind it
  const knuckles = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 7.0, 16), m.graphite);
  knuckles.rotation.z = Math.PI / 2; knuckles.position.set(0, 1.22, -6.4); hand.add(knuckles);
  [-3.55, 3.55].forEach(x => { const e = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 0.22, 18), m.gold); e.rotation.z = Math.PI / 2; e.position.set(x, 1.22, -6.4); hand.add(e); });
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
  // a clear cover over the back of the hand, the gold traces under it,
  // held by four screws
  const cover = new THREE.Mesh(new THREE.ShapeGeometry(palmShape, 10), m.clear);
  cover.rotation.x = -Math.PI / 2; cover.scale.set(0.82, 0.8, 1); cover.position.set(0, 2.02, -9.7); hand.add(cover);
  [[-2.3, -7.6], [2.3, -7.6], [-1.7, -11.9], [1.7, -11.9]].forEach(([x, z]) => {
    const sc = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 12), m.gold); sc.position.set(x, 2.06, z); hand.add(sc);
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.05), m.graphite); slot.position.set(x, 2.1, z); slot.rotation.y = x * z; hand.add(slot);
  });
  // a gold inlay down the back of the hand, and the status lights in it
  const inlay = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 4.2), m.gold); inlay.position.set(0, 1.98, -9.7); hand.add(inlay);
  const leds = [-11.6, -11.0, -10.4].map(z => { const l = new THREE.Mesh(new THREE.CircleGeometry(0.17, 14), m.led.clone()); l.rotation.x = -Math.PI / 2; l.position.set(0.42, 2.04, z); hand.add(l); return l; });
  // vents down each side of the palm
  [-1, 1].forEach(sd => { for (let v = 0; v < 3; v++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 1.4), m.graphite); s.position.set(sd * (2.62 + v * 0.18 - 0.1), 1.35, -11.2 + v * 0.55); s.rotation.y = sd * 0.16; hand.add(s); } });
  // the thumb, off to the side, clear of the card, on a pivot of its own
  const t0 = V(3.6, 1.15, -10.4), t1 = V(4.6, 0.95, -7.4), t2 = V(4.9, 0.72, -4.7);
  const thumb = new THREE.Group(); thumb.position.copy(t0); hand.add(thumb);
  thumb.add(bone(0.5, V(0, 0, 0), t1.clone().sub(t0), m.plain), bone(0.44, t1.clone().sub(t0), t2.clone().sub(t0), m.plain), hinge(t1.clone().sub(t0), 0.37));
  { const c = new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 12), m.clear); thumb.add(c); }
  // the wrist, and a gold collar turning in it
  const w = joint(m, 1.35, 'x'); w.position.copy(WRIST); g.add(w);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.12, 8, 28), m.gold); collar.position.copy(WRIST).add(V(0, 0, 0.9)); g.add(collar);
  // curl: 0 straight, 1 a grip, below 0 opened back; spread: 0 together, 1 splayed
  g.userData.curl = (curl, spread) => {
    fingers.forEach(f => {
      f.root.rotation.set(curl * 0.16, spread * f.side * 0.075, 0);
      f.mid.rotation.x = curl * 0.26;
      f.tip.rotation.x = curl * 0.3;
    });
    thumb.rotation.set(curl * 0.1, -0.05 - spread * 0.12 + Math.max(0, curl) * 0.1, 0);
  };
  // the status lights: a chase while it works, dark at rest
  g.userData.leds = (on, tt) => leds.forEach((l, i) => { const k = on * (0.25 + 0.75 * Math.pow(0.5 + 0.5 * Math.sin(tt * 9 - i * 1.4), 3)); l.material.color.setRGB(1 * k + 0.08, 0.72 * k + 0.05, 0.36 * k + 0.03); });
  return g;
}
// The arm between the port and the wrist: a telescoping column; on it a
// turret (a toothed ring and a yoke that turns to face the reach) holding
// the shoulder; the upper arm, the elbow and the forearm; a hydraulic ram
// over each joint, a cable harness down the outside and a row of status
// lights by the wrist - all placed by pose() each frame.
function buildDealerArm(m) {
  const g = new THREE.Group();
  const cyl = (rt, rb, mat, seg = 24) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, 1, seg, 1), mat);
  const ring = (r, mat = m.gold, t = 0.13) => new THREE.Mesh(new THREE.TorusGeometry(r, t, 8, 32), mat);
  const column = [cyl(1.9, 1.9, m.ceramic), cyl(2.3, 2.3, m.ceramic), cyl(2.7, 2.7, m.ceramic)];
  const collars = [ring(1.95), ring(2.35), ring(2.75)];
  // the turret: a toothed ring round the top of the column, and the yoke
  const turret = new THREE.Group();
  { const disc = cyl(2.95, 2.95, m.graphite, 40); disc.scale.y = 0.55; turret.add(disc);
    const teeth = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.5, 0.42), m.gold, 40);
    const d = new THREE.Object3D();
    for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2; d.position.set(Math.sin(a) * 3.05, 0, Math.cos(a) * 3.05); d.rotation.set(0, a, 0); d.updateMatrix(); teeth.setMatrixAt(i, d.matrix); }
    turret.add(teeth);
    const trim = ring(2.95, m.gold, 0.07); trim.rotation.x = Math.PI / 2; trim.position.y = 0.3; turret.add(trim); }
  const yoke = new THREE.Group();
  { // two cheeks either side of the shoulder, on a plinth over the turret
    const plinth = cyl(2.2, 2.6, m.ceramic, 32); plinth.scale.y = 1.2; plinth.position.y = -1.7; yoke.add(plinth);
    [-1, 1].forEach(sd => {
      const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.55, 3.6, 3.4), m.plain); cheek.position.set(sd * 2.55, -0.6, 0); yoke.add(cheek);
      const boss = cyl(1.15, 1.15, m.gold, 24); boss.rotation.z = Math.PI / 2; boss.scale.y = 0.3; boss.position.set(sd * 2.88, 0, 0); yoke.add(boss);
      const bolt = cyl(0.3, 0.3, m.graphite, 6); bolt.rotation.z = Math.PI / 2; bolt.scale.y = 0.2; bolt.position.set(sd * 3.0, 0, 0); yoke.add(bolt);
    });
    yoke.add(joint(m, 2.2, 'x'));
  }
  const upper = cyl(1.3, 1.6, m.ceramic), fore = cyl(1.0, 1.25, m.ceramic);
  const elbow = joint(m, 1.65, 'x');
  const bands = [ring(1.65), ring(1.36), ring(1.31), ring(1.05)];
  // (panel seams: fine dark rings between the gold bands)
  const seams = [ring(1.52, m.graphite, 0.05), ring(1.4, m.graphite, 0.05), ring(1.2, m.graphite, 0.05), ring(1.1, m.graphite, 0.05)];
  // the rams: a graphite barrel, a chrome rod out of it, a gold eye each end
  const ram = () => {
    const r = { barrel: cyl(0.4, 0.4, m.graphite, 16), rod: cyl(0.17, 0.17, m.chrome, 12), eyes: [new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 8), m.gold), new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), m.gold)], gland: ring(0.4, m.gold, 0.09) };
    g.add(r.barrel, r.rod, ...r.eyes, r.gland);
    r.set = (a, b, len) => {
      const d = b.clone().sub(a), L = d.length() || 1e-4, e = a.clone().addScaledVector(d, Math.min(len, L - 0.8) / L);
      laid(r.barrel, a, e, true); laid(r.rod, e, b, true);
      r.eyes[0].position.copy(a); r.eyes[1].position.copy(b);
      r.gland.position.copy(e); r.gland.quaternion.setFromUnitVectors(V(0, 0, 1), d.multiplyScalar(1 / L));
    };
    return r;
  };
  const rams = [ram(), ram()];
  // the harness: a braided cable and a fine gold line beside it, bent
  // through the arm's joints (rebuilt each frame as the arm moves)
  const cable = new THREE.Mesh(new THREE.BufferGeometry(), m.graphite), wire = new THREE.Mesh(new THREE.BufferGeometry(), m.gold);
  // status lights along the forearm
  const lights = [0, 1, 2].map(() => { const l = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), m.led.clone()); g.add(l); return l; });
  g.add(...column, ...collars, turret, yoke, upper, fore, elbow, ...bands, ...seams, cable, wire);
  const up = V(0, 1, 0), bend = V(0, 0.5, 1).normalize();
  const S = V(0, 0, 0), E = V(0, 0, 0), dir = V(0, 0, 0), n = V(0, 0, 0);
  const u = V(0, 0, 0), f = V(0, 0, 0), ax = V(0, 0, 0), pu = V(0, 0, 0), pf = V(0, 0, 0);
  const band = (b, a, c, k) => { b.position.copy(a).lerp(c, k); b.quaternion.setFromUnitVectors(V(0, 0, 1), c.clone().sub(a).normalize()); };
  const at = (a, b, k, side, d) => a.clone().lerp(b, k).addScaledVector(side, d);
  let yaw = 0;
  return {
    group: g,
    // the shoulder at height y over the port, the wrist at W (seat frame)
    pose(y, W, tt = 0, on = 0) {
      S.set(PORT.x, y, PORT.z);
      // the column: three sleeves, each drawn out of the one below
      const base = ARM.down - 6, span = y - base;
      column.forEach((c, i) => {
        const a = base + span * (2 - i) / 3, b = Math.min(y - 2.2, a + span / 3 + 1.2);
        laid(c, V(PORT.x, a, PORT.z), V(PORT.x, b, PORT.z), true);
        collars[i].position.set(PORT.x, b, PORT.z); collars[i].quaternion.setFromUnitVectors(V(0, 0, 1), up);
      });
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
      u.copy(E).sub(S).normalize(); f.copy(W).sub(E).normalize();
      // the turret turns to face the upper arm (held where it was when the
      // arm stands straight up)
      if (u.x * u.x + u.z * u.z > 1e-3) yaw = Math.atan2(u.x, u.z);
      turret.position.set(PORT.x, y - 2.2, PORT.z); turret.rotation.y = yaw;
      yoke.position.copy(S); yoke.rotation.y = yaw;
      ax.set(Math.cos(yaw), 0, -Math.sin(yaw));
      laid(upper, S, E, true);
      laid(fore, E, W, true);
      elbow.position.copy(E);
      { const k = V(0, 0, 0).crossVectors(u, f); if (k.lengthSq() > 1e-6) elbow.quaternion.setFromUnitVectors(V(1, 0, 0), k.normalize()); }
      band(bands[0], S, E, 0.1); band(bands[1], S, E, 0.9); band(bands[2], E, W, 0.1); band(bands[3], E, W, 0.9);
      band(seams[0], S, E, 0.36); band(seams[1], S, E, 0.66); band(seams[2], E, W, 0.4); band(seams[3], E, W, 0.7);
      // (the underside of each bone, in the arm's plane)
      pu.crossVectors(ax, u).normalize(); if (pu.y > 0) pu.negate();
      pf.crossVectors(ax, f).normalize(); if (pf.dot(pu) < 0) pf.negate();
      rams[0].set(S.clone().add(V(0, -2.4, 0)).addScaledVector(V(Math.sin(yaw), 0, Math.cos(yaw)), -1.2), at(S, E, 0.46, pu, 1.55), 5.2);
      rams[1].set(at(S, E, 0.66, pu, 1.45), at(E, W, 0.32, pf, 1.2), 4.4);
      // the harness, out of the turret's back, down the outside of the arm
      // (only while it is out: under the felt nothing of it shows)
      if (on) {
        const side = ax.clone().multiplyScalar(0.9), el = pu.clone().add(pf).normalize();
        const pts = [S.clone().add(V(0, -2.2, 0)).addScaledVector(V(Math.sin(yaw), 0, Math.cos(yaw)), -2.6), at(S, E, 0.3, pu, 1.9).add(side), at(S, E, 0.75, pu, 1.9).add(side), E.clone().addScaledVector(el, 2.2).add(side), at(E, W, 0.5, pf, 1.6).add(side), W.clone().addScaledVector(pf, 1.1).addScaledVector(ax, 0.6)];
        const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
        cable.geometry.dispose(); cable.geometry = new THREE.TubeGeometry(curve, 44, 0.24, 7, false);
        const wcurve = new THREE.CatmullRomCurve3(pts.map(p => p.clone().addScaledVector(ax, 0.42)), false, 'centripetal');
        wire.geometry.dispose(); wire.geometry = new THREE.TubeGeometry(wcurve, 44, 0.07, 5, false);
      }
      // the lights on top of the forearm, near the wrist
      const top = pf.clone().negate();
      lights.forEach((l, i) => {
        l.position.copy(at(E, W, 0.62 + i * 0.07, top, 1.08 - i * 0.02));
        const k = on * (0.2 + 0.8 * Math.pow(0.5 + 0.5 * Math.sin(tt * 9 - i * 1.4 - 2.2), 3));
        l.material.color.setRGB(1 * k + 0.08, 0.72 * k + 0.05, 0.36 * k + 0.03);
      });
      return len0;
    }
  };
}
// A hand pose: fingertips at p, fingers along z, the back of the hand up y.
function handPose(p, z, y) {
  const zz = z.clone().normalize(), xx = y.clone().cross(zz).normalize(), yy = zz.clone().cross(xx);
  return { p: p.clone(), q: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xx, yy, zz)) };
}
// The back of every card in the shoe and the rack: ivory stock round
// oxblood, the engraving laid on it once drawn (backArt, the D tier's).
function paintCardBack(c, W, H) {
  c.fillStyle = '#efe6d3'; c.fillRect(0, 0, W, H);
  const mx = W * 15 / 318, my = H * 15 / 445, g = c.createRadialGradient(W / 2, H * 0.4, 0, W / 2, H * 0.4, H * 0.6);
  g.addColorStop(0, '#4a0b14'); g.addColorStop(1, '#3a0810');
  c.fillStyle = g; c.fillRect(mx, my, W - 2 * mx, H - 2 * my);
}
function backTex() {
  const t = canvasTex(384, 538, paintCardBack);
  const img = new Image();
  img.onload = () => {
    const c = t.image.getContext('2d'), W = t.image.width, H = t.image.height, mx = W * 15 / 318, my = H * 15 / 445;
    c.drawImage(img, mx, my, W - 2 * mx, H - 2 * my);
    t.needsUpdate = true;
  };
  img.src = backArt('D', false).slice(5, -2);
  return t;
}

// The printed backs of the dealt cards: engraved like a banknote - a
// crossed guilloche over the whole field, a beaded double rule with
// filigree in the corners, and in the middle a woven rosette round the
// DRO medallion, its ring lettered. Finer with the tier (more strands in
// the rosette, a rope in the rule, a sunburst for S). Drawn as SVG once a
// tier and handed to the page as a custom property (--r3t-art-<tier>); a
// strokes-only copy (--r3t-foil-<tier>) masks the foil's glint, so the
// light runs along the engraving as you turn the card.
const BACK_INK = {
  U: ['#d6b062', '#f2d894', '#3a0810'], F: ['#d6b062', '#f2d894', '#3a0810'], D: ['#d6b062', '#f2d894', '#3a0810'],
  C: ['#dcb86a', '#f6dea0', '#3a0810'], B: ['#c98a4e', '#f0c48c', '#24150b'], A: ['#7d838c', '#b9bec6', '#e6e3dc'], S: ['#d9b467', '#fff0c0', '#0b0908']
};
const BACK_FINE = { U: 0, F: 0, D: 0, C: 1, B: 2, A: 3, S: 4 };
function backArt(tier, foil) {
  const [ink, hi, disc] = BACK_INK[tier] || BACK_INK.D, lv = BACK_FINE[tier] || 0;
  const W = 288, H = 415, cx = W / 2, cy = H / 2;
  const f = x => +x.toFixed(1);
  // (foil: white strokes alone, for the mask)
  const col = foil ? '#fff' : 'url(#g)', solid = foil ? '#fff' : ink, fillDisc = foil ? 'none' : disc;
  const out = [];
  // a wave along y from x0 to x1: a quadratic arc a half wave, mirrored on
  // from there
  const wave = (x0, x1, y, lam, amp) => {
    let d = `M${f(x0)} ${f(y)}q${f(lam / 4)} ${f(-2 * amp)} ${f(lam / 2)} 0`;
    for (let x = x0 + lam / 2; x < x1 - 0.1; x += lam / 2) d += `t${f(lam / 2)} 0`;
    return d;
  };
  // the field: two families of waves, crossed
  let field = '';
  for (let y = -6; y < H + 12; y += 9 - Math.min(lv, 3)) field += wave(-36, W + 36, y, 36, 3.2) + wave(-27, W + 36, y + 4.5, 36, -3.2);
  out.push(`<path d="${field}" fill="none" stroke="${solid}" stroke-width="0.5" opacity="${foil ? 0.5 : 0.3 + 0.04 * lv}"/>`);
  // the rule: outer line, beads, inner line (and, finer, a rope in it)
  out.push(`<rect x="7" y="7" width="${W - 14}" height="${H - 14}" rx="7" fill="none" stroke="${col}" stroke-width="1.8"/>`);
  out.push(`<rect x="11.5" y="11.5" width="${W - 23}" height="${H - 23}" rx="4" fill="none" stroke="${solid}" stroke-width="2" stroke-linecap="round" stroke-dasharray="0 5.2"/>`);
  out.push(`<rect x="16" y="16" width="${W - 32}" height="${H - 32}" rx="3" fill="none" stroke="${col}" stroke-width="0.9"/>`);
  if (lv >= 2) {
    const rope = n => wave(30, n - 30, 21, 6, 0.8) + wave(30, n - 30, 21, 6, -0.8);
    const across = rope(W), down = rope(H);
    out.push(`<g fill="none" stroke="${solid}" stroke-width="0.6" opacity="0.85"><path d="${across}"/><path d="${across}" transform="matrix(1 0 0 -1 0 ${H})"/><path d="${down}" transform="matrix(0 1 1 0 0 0)"/><path d="${down}" transform="matrix(0 1 -1 0 ${W} 0)"/></g>`);
  }
  // the corners: a quarter rosette, a scroll either way and a pip
  const corner = `<g id="c" fill="none" stroke="${col}" stroke-linecap="round">
    <path d="M16 46A30 30 0 0 0 46 16M16 38A22 22 0 0 0 38 16" stroke-width="1.1"/>
    <path d="M46 16c10 0 16 5 16 11c0 5-4 8-8 6c-3-1.5-2-6 1.5-5.5M16 46c0 10 5 16 11 16c5 0 8-4 6-8c-1.5-3-6-2-5.5 1.5" stroke-width="1.1"/>
    <path d="M20 20L34 34M26 18L34 34M18 26L34 34" stroke-width="0.7"/>
    <path d="M34 29l5 5-5 5-5-5z" fill="${foil ? '#fff' : hi}" stroke="none"/>
  </g>`;
  out.push(corner, `<use href="#c" transform="translate(${W} 0) scale(-1 1)"/>`, `<use href="#c" transform="translate(0 ${H}) scale(1 -1)"/>`, `<use href="#c" transform="translate(${W} ${H}) scale(-1 -1)"/>`);
  // the printer's rules over and under the rosette
  const rule = y => `<path d="M${cx - 58} ${y}H${cx - 12}M${cx + 12} ${y}H${cx + 58}" stroke="${col}" stroke-width="0.9"/><path d="M${cx} ${y - 5}l5 5-5 5-5-5z" fill="${foil ? '#fff' : hi}"/><circle cx="${cx - 62}" cy="${y}" r="1.6" fill="${solid}"/><circle cx="${cx + 62}" cy="${y}" r="1.6" fill="${solid}"/>`;
  out.push(rule(48), rule(H - 48));
  // the rosette: a strand r = R + a sin(n t), turned a step at a time, so
  // the strands weave into a band; a finer band inside it
  const strand = (id, R, a, n) => { let d = ''; for (let s = 0; s <= 360; s++) { const t = s / 360 * 2 * Math.PI, r = R + a * Math.sin(n * t); d += `${s ? 'L' : 'M'}${f(cx + r * Math.cos(t))} ${f(cy + r * Math.sin(t))}`; } return `<path id="${id}" d="${d}Z" fill="none"/>`; };
  const band = (id, R, a, n, m, w) => {
    let s = `<defs>${strand(id, R, a, n)}</defs><g stroke="${col}" stroke-width="${w}" fill="none">`;
    for (let j = 0; j < m; j++) s += `<use href="#${id}" transform="rotate(${f(j * 360 / n / m)} ${cx} ${f(cy)})"/>`;
    return s + '</g>';
  };
  if (tier === 'S') {
    let rays = '';
    for (let k = 0; k < 96; k++) { const t = k / 96 * 2 * Math.PI, r0 = 106, r1 = k % 2 ? 114 : 122; rays += `M${f(cx + r0 * Math.cos(t))} ${f(cy + r0 * Math.sin(t))}L${f(cx + r1 * Math.cos(t))} ${f(cy + r1 * Math.sin(t))}`; }
    out.push(`<path d="${rays}" stroke="${col}" stroke-width="0.8"/>`);
  }
  // (the field quieter under the rosette)
  if (!foil) out.push(`<circle cx="${cx}" cy="${cy}" r="104" fill="${disc}" opacity="0.6"/>`);
  out.push(`<circle cx="${cx}" cy="${cy}" r="104" fill="none" stroke="${col}" stroke-width="0.8"/>`);
  out.push(band('o', 90, 9, 14 + 2 * lv, 5 + 2 * lv, 0.55));
  out.push(band('i', 64, 6, 20 + 2 * lv, 4 + lv, 0.5));
  if (lv >= 3) out.push(band('p', 44, 5, 9, 3, 0.6));
  // the medallion: a disc, two rings, the lettered ring and the monogram
  out.push(`<circle cx="${cx}" cy="${cy}" r="54" fill="${fillDisc}" stroke="${col}" stroke-width="1.6"/>`);
  out.push(`<circle cx="${cx}" cy="${cy}" r="37" fill="none" stroke="${col}" stroke-width="1.1"/>`);
  out.push(`<defs><path id="ring" d="M${cx} ${cy + 45.5}a45.5 45.5 0 1 1 0.1 0"/></defs><text font-family="Georgia,Times New Roman,serif" font-size="8.2" font-weight="700" letter-spacing="1.6" fill="${foil ? '#fff' : hi}"><textPath href="#ring" textLength="280" lengthAdjust="spacing">DAILY ✦ ROLL ✦ OVER ✦ DAILY ✦ ROLL ✦ OVER ✦</textPath></text>`);
  // (double-ended, as a court card is: it reads the right way up however
  // the card lies)
  const mono = `<text x="${cx}" y="${f(cy - 5)}" text-anchor="middle" font-family="Georgia,Times New Roman,serif" font-size="17" font-weight="700" letter-spacing="1.5" fill="${foil ? '#fff' : 'url(#g)'}">DRO</text>`;
  out.push(mono, `<g transform="rotate(180 ${cx} ${f(cy)})">${mono}</g>`, `<path d="M${cx - 24} ${f(cy)}H${cx - 5}M${cx + 5} ${f(cy)}H${cx + 24}" stroke="${col}" stroke-width="0.8"/><path d="M${cx} ${f(cy - 3)}l3 3-3 3-3-3z" fill="${foil ? '#fff' : hi}"/>`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${ink}"/><stop offset="0.45" stop-color="${hi}"/><stop offset="0.6" stop-color="${ink}"/><stop offset="1" stop-color="${hi}"/></linearGradient></defs>${out.join('')}</svg>`;
  // (only what a data URL must escape)
  return `url("data:image/svg+xml,${svg.replace(/\s+/g, ' ').replace(/"/g, "'").replace(/[^ -~]|[#%<>{}|\\^`]/g, encodeURIComponent)}")`;
}
// (once a tier, on the scene's own element)
function inkBacks(root, cards) {
  new Set(cards.map(c => tierOf(c.tier))).forEach(t => {
    root.style.setProperty(`--r3t-art-${t}`, backArt(t, false));
    root.style.setProperty(`--r3t-foil-${t}`, backArt(t, true));
  });
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
    <div class="r3t-face r3t-back t-${tier}"><div class="r3t-bk-art"></div><div class="r3t-bk-foil"></div><div class="r3t-sheen"></div></div>
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
    const fo = Object.assign({ manual: false, reduced: false, duration: 0, onArrive: null, host: null, seatView: null, dealStyle: null }, flyOpts);
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
    Object.values(dealerMats).forEach(mat => { if (mat.isMaterial) mat.clippingPlanes = underFelt; });
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
    inkBacks(css.domElement, cards);
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
      el.dataset.gx0 = `${Math.round(50 + obj.userData.slot.x * 4)}%`;
      el.style.setProperty('--gx', el.dataset.gx0);
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
    // ---- Cards and the hand that deals them.
    // A card lies face down a length short of its place (the dealer's side
    // of it) and turns over its far edge onto its place, face up: turned(),
    // at an angle from 0 (face down) to pi (face up). While it is carried it
    // rides in the hand - one of a small stack, slot j - so the arm leads
    // and the cards follow it exactly.
    const inShoe = shoeMouth.clone().addScaledVector(mouthDir, -4);
    const pulled = shoeMouth.clone().addScaledVector(mouthDir, 1.6);
    const topOf = obj => V(Math.sin(obj.userData.yaw), 0, Math.cos(obj.userData.yaw));
    const flipAxis = obj => { const top = topOf(obj); return { pt: obj.userData.slot.clone().addScaledVector(top, CARD.h / 2), axis: top.clone().cross(up).normalize(), top }; };
    const turned = (obj, a, out) => {
      const { pt, axis, top } = flipAxis(obj);
      const R = new THREE.Quaternion().setFromAxisAngle(axis, a);
      out.p.copy(pt).add(V(0, 0, 0).copy(top).multiplyScalar(CARD.h / 2).applyQuaternion(R));
      lying(out.q, { yaw: obj.userData.yaw + Math.PI, flip: Math.PI }).premultiply(R);
      return out;
    };
    const pose = (p, q) => ({ p: p.clone(), q: q.clone() });
    const faceDown = obj => turned(obj, 0, { p: V(0, 0, 0), q: new THREE.Quaternion() });
    const shoePose = at => ({ p: at.clone(), q: lying(new THREE.Quaternion(), { yaw: yawShoe, flip: Math.PI }) });
    // A card in the hand, slot j of its stack: under the palm, its end at
    // the fingertips, each further card a little lower and fanned.
    const inHand = j => {
      const q = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), Math.PI / 2);
      q.premultiply(_q3.setFromAxisAngle(V(0, 1, 0), j * 2.2 * DEG));
      return { p: V(j * 0.25, -0.95 - 0.07 * j, CARD.h / 2 - 1.6 + 0.3 * j), q };
    };
    // the hand that holds a card in slot j at card pose c, and the card's
    // pose in a hand at h
    const handFor = (c, j) => { const s0 = inHand(j); const q = c.q.clone().multiply(s0.q.clone().invert()); return { p: c.p.clone().sub(s0.p.clone().applyQuaternion(q)), q }; };
    const cardIn = (h, j, out) => { const s0 = inHand(j); out.q.copy(h.q).multiply(s0.q); out.p.copy(s0.p).applyQuaternion(h.q).add(h.p); return out; };
    // straight up over the port, the shoulder at y: the arm at full length,
    // the hand on top pointing up, its back to the dealer (so it all goes
    // through the port's ring)
    const reachUp = ARM.upper + ARM.fore - 0.1;
    const upright = y => handPose(V(PORT.x, y + reachUp - WRIST.z, PORT.z - WRIST.y), V(0, 1, 0), V(0, 0, 1));
    const RISE = { open: 0.95, up: 0.85, swing: 0.45 };         // seconds before dealAt
    const SINK = { fold: 0.4, down: 0.35, shut: 0.15 };           // seconds after the deal
    // A turning card's angle: pushed to 62 degrees by the hand, then over
    // on its own; or flicked (a sweep, a cascade) and over on its own.
    const angleAt = (ci, tt) => {
      const c = deal.cards[ci];
      if (tt < c.turn) return 0;
      if (c.push) {
        if (tt < c.turn + DEAL.push) return 62 * DEG * smoother((tt - c.turn) / DEAL.push);
        const k = clamp01((tt - c.turn - DEAL.push) / DEAL.fall);
        return 62 * DEG + (Math.PI - 62 * DEG) * Math.pow(k, 1.7);
      }
      const k = clamp01((tt - c.turn) / DEAL.turn);
      // (up quickly off the felt, over, and falling faster onto its face)
      return Math.PI * (k < 0.5 ? 0.62 * easeOut(k / 0.5, 2) : 0.62 + 0.38 * Math.pow((k - 0.5) / 0.5, 1.6));
    };
    const turnEnd = c => c.turn + (c.push ? DEAL.push + DEAL.fall : DEAL.turn);

    // ---- The deal plan. The hand's moves (segs) and, for each card, when
    // it is drawn (pull), which slot of the hand it rides in (j), when it is
    // laid face down (lay) and when it starts to turn (turn, pushed or not).
    // Worked out once, as times from the tap. A move ends either on a stop
    // (a grab, a placement: there it arrives dead still) or on a via point
    // it flows through into the next (a card drawn and carried off, a sweep
    // swung into and out of): the path is joined smooth through those. And
    // the fingers: how far curled (below 0, opened back) and how spread.
    const FIN = { rest: [0, 0], reach: [-0.55, 0.7], grip: [0.38, 0.05], flick: [0.75, 0.3], open: [-0.8, 1] };
    const makeDeal = style => {
      const n = cardObjs.length;
      const segs = [], cardsP = cardObjs.map(() => ({ pull: Infinity, j: 0, lay: Infinity, turn: Infinity, push: false }));
      // (the plan starts as the arm, risen, swings down to the shoe)
      let t = dealAt - RISE.swing;
      let at = upright(ARM.up), fin = FIN.rest;
      // a move of the hand to b over dur, arcing up by lift; settle: a
      // servo's small shiver on arrival; via: on through b without a stop;
      // to: the fingers by the end of it
      const move = (b, dur, { lift = 0, settle = false, via = false, to = fin } = {}) => { segs.push({ kind: 'move', t0: t, t1: t + dur, a: at, b, lift, settle, via, f0: fin, f1: to }); t += dur; at = b; fin = to; };
      const hold = dur => move(at, dur);
      const grabAt = j => handFor(shoePose(inShoe), j), outAt = j => handFor(shoePose(pulled), j);
      // draw card i into slot j (from wherever the hand is): in open, the
      // fingers close on it, and it comes out of the shoe on the move
      const draw = (i, j, first) => {
        move(grabAt(j), first ? RISE.swing + 0.08 : (j ? DEAL.regrab : DEAL.grab), { lift: first ? 2 : (j ? 0.6 : 4.5), to: j ? FIN.grip : FIN.reach });
        cardsP[i].pull = t; cardsP[i].j = j;
        move(outAt(j), DEAL.pull, { via: true, to: FIN.grip });
      };
      // lay the card in slot j at its face-down place
      const lay = (i, dur, lift) => { move(handFor(faceDown(cardObjs[i]), cardsP[i].j), dur, { lift, settle: true, to: FIN.grip }); cardsP[i].lay = t; };
      // (and the fingers open off it)
      const letGo = (dur = 0.09) => move(at, dur, { to: FIN.open });
      // the rows and the columns of the hand, as card indices
      const rows = [], cols = [];
      cardObjs.forEach((o, i) => { const r = Math.floor(i / SLOTS.cols), c = i % SLOTS.cols; (rows[r] = rows[r] || []).push(i); (cols[c] = cols[c] || []).push(i); });
      // the hand along a line of face-down cards, just past their far ends,
      // flicking each over as it passes (dir: across a row, or down a column)
      const sweep = (line, along) => {
        const ends = line.map(i => { const fd = faceDown(cardObjs[i]); return fd.p.clone().addScaledVector(topOf(cardObjs[i]), CARD.h / 2 + 0.4); });
        const ext = along === 'x' ? V(ends[0].x > ends[ends.length - 1].x ? 3 : -3, 0, 0) : V(0, 0, -3);
        const from = ends[0].clone().add(ext), to = ends[ends.length - 1].clone().sub(ext);
        from.y = to.y = 1.2;
        const fingers = V(0, -0.18, -1);
        const A = handPose(from, fingers, up), B = handPose(to, fingers, up);
        move(A, 0.22, { lift: 2.5, via: true, to: FIN.flick });
        const dur = DEAL.sweep * line.length + 0.12;
        const t0 = t, d0 = from.distanceTo(to) || 1;
        line.forEach((i, k) => { cardsP[i].turn = t0 + dur * clamp01(from.distanceTo(ends[k]) / d0) - 0.03; });
        move(B, dur, { via: true, to: FIN.flick });
      };
      if (!n) return { segs, cards: cardsP, end: t };
      if (style === 'single') {
        cardObjs.forEach((o, i) => {
          draw(i, 0, i === 0);
          lay(i, DEAL.carry, 3.4);
          hold(DEAL.settle);
          cardsP[i].turn = t; cardsP[i].push = true;
          segs.push({ kind: 'push', t0: t, t1: t + DEAL.push, card: i, f0: fin, f1: FIN.flick });
          t += DEAL.push; fin = FIN.flick;
          at = handFor(turned(o, 62 * DEG, { p: V(0, 0, 0), q: new THREE.Quaternion() }), 0);
        });
      } else if (style === 'rows' || style === 'columns') {
        const groups = style === 'rows' ? rows : cols.map(c => c.slice());
        groups.forEach((g, gi) => {
          // the lay order, across the row (player's left to right) or down
          // the column (front to back); the deepest slot is laid first
          const order = style === 'rows' ? g.slice().sort((a, b) => cardObjs[b].userData.slot.x - cardObjs[a].userData.slot.x) : g.slice();
          order.slice().reverse().forEach((i, k) => draw(i, k, gi === 0 && k === 0));
          order.forEach((i, k) => lay(i, k ? DEAL.lay : DEAL.carry, k ? 0.8 : 3.8));
          letGo();
          hold(0.1);
          sweep(order, style === 'rows' ? 'x' : 'z');
        });
      } else {
        // spread: every card laid face down, one draw each, then a beat
        cardObjs.forEach((o, i) => { draw(i, 0, i === 0); lay(i, DEAL.carry * 0.9, 3.2); });
        letGo();
        // (back behind the spread, low, to let the backs be seen a moment)
        const mid = V(0, 0, 0); cardObjs.forEach(o => mid.add(faceDown(o).p)); mid.multiplyScalar(1 / n);
        const far = Math.max(...cardObjs.map(o => faceDown(o).p.z)) + CARD.h / 2 + 3;
        move(handPose(V(mid.x, 4.5, far), V(0, -0.35, -1), up), 0.32, { to: FIN.rest });
        hold(DEAL.show);
        // one touch on the first card's far end, and the cascade
        const first = faceDown(cardObjs[0]).p.clone().addScaledVector(topOf(cardObjs[0]), CARD.h / 2 + 0.3); first.y = 1.1;
        move(handPose(first, V(0, -0.2, -1), up), 0.22, { lift: 1.5, settle: true, to: FIN.flick });
        const t0 = t;
        const order = cardObjs.map((o, i) => i).sort((a, b) => (Math.floor(a / SLOTS.cols) - Math.floor(b / SLOTS.cols)) || (cardObjs[b].userData.slot.x - cardObjs[a].userData.slot.x));
        order.forEach((i, k) => { cardsP[i].turn = t0 + 0.04 + k * DEAL.cascade; });
        // (and away, with a turn of the wrist)
        move(handPose(first.clone().add(V(0, 7, 5)), V(0.5, 0.4, -1), V(-0.3, 1, 0)), 0.34, { via: true, to: FIN.open });
      }
      // the hand straightens up over the port once the last card is over
      const lastTurn = Math.max(...cardsP.map(turnEnd));
      move(upright(ARM.up), SINK.fold, { lift: 3, to: FIN.rest });
      // (through each via point at the mean of the speeds either side of
      // it; dead still at every stop)
      segs.forEach(sg => { sg.v0 = V(0, 0, 0); sg.v1 = V(0, 0, 0); sg.s0 = sg.s1 = 0; });
      for (let i = 0; i + 1 < segs.length; i++) {
        const A = segs[i], B = segs[i + 1];
        if (!A.via || A.kind !== 'move' || B.kind !== 'move') continue;
        const dA = A.t1 - A.t0, dB = B.t1 - B.t0;
        const vA = A.b.p.clone().sub(A.a.p).multiplyScalar(1 / dA), vB = B.b.p.clone().sub(B.a.p).multiplyScalar(1 / dB);
        A.v1 = vA.multiplyScalar(dB).addScaledVector(vB, dA).multiplyScalar(1 / (dA + dB)); B.v0 = A.v1.clone();
        A.s1 = B.s0 = 1;
      }
      return { segs, cards: cardsP, end: Math.max(t, lastTurn) };
    };
    const pickStyle = () => {
      const want = fo.dealStyle;
      if (DEAL_STYLES.includes(want)) return want;
      return DEAL_STYLES[Math.floor(Math.random() * DEAL_STYLES.length)];
    };
    const dealStyle = fo.reduced ? 'none' : pickStyle();
    const deal = fo.reduced ? { segs: [], cards: cardObjs.map(() => ({ pull: -1, j: 0, lay: -1, turn: -1, push: false })), end: dealAt } : makeDeal(dealStyle);
    deal.style = dealStyle;
    // (settled: every card over, and the arm back under the felt)
    const settleAt = cardObjs.length ? deal.end + (fo.reduced ? 0.1 : SINK.down + SINK.shut + 0.3) : dealAt;

    // ---- A focused card: lifted off the felt and brought up in front of
    // you, above the info's sheet, facing you. Drag it to turn it any way
    // (it keeps a little spin when you let go); the face you see is the
    // face toward you.
    const focal = { spin: new THREE.Quaternion(), vx: 0, vy: 0, dragging: false };
    const camLocal = { p: V(0, 0, 0), q: new THREE.Quaternion() };
    const focalPose = out => {
      const fwd = V(0, 0, -1).applyQuaternion(camLocal.q), upv = V(0, 1, 0).applyQuaternion(camLocal.q);
      const half = Math.tan((camera.fov * DEG) / 2);
      const tall = aspect < 0.62;
      // (the card a third of the screen tall on a phone, half on a wide one,
      // centred in the space the sheet leaves above it)
      const d = CARD.h / (2 * half * (tall ? 0.34 : 0.46));
      out.p.copy(camLocal.p).addScaledVector(fwd, d).addScaledVector(upv, (tall ? 0.12 : 0.1) * 2 * half * d);
      out.q.copy(camLocal.q).multiply(focal.spin);
      return out;
    };
    const focusPose = { p: V(0, 0, 0), q: new THREE.Quaternion() };
    const cardPose = { p: V(0, 0, 0), q: new THREE.Quaternion() };
    const handNow = { p: V(0, 0, 0), q: new THREE.Quaternion() };
    // Where every card is at tt. Cards riding in the hand are placed after
    // the hand (poseHeld); the rest here.
    const poseCards = tt => {
      cardObjs.forEach((obj, i) => {
        const c = deal.cards[i];
        const el = obj.element;
        if (!fo.reduced && tt < c.pull) { el.style.visibility = 'hidden'; obj.userData.held = false; return; }
        el.style.visibility = 'visible';
        const p = cardPose.p, q = cardPose.q;
        obj.userData.held = !fo.reduced && tt < c.lay;
        if (obj.userData.held) return;
        if (fo.reduced) turned(obj, Math.PI, cardPose);
        else {
          turned(obj, angleAt(i, tt), cardPose);
          const te = turnEnd(c);
          if (tt >= te) { const b = tt - te; p.y += Math.max(0, 0.9 * Math.sin(b * 22) * Math.exp(-b * 9)); }
        }
        placeCard(obj, tt);
      });
    };
    const poseHeld = tt => {
      cardObjs.forEach((obj, i) => {
        if (!obj.userData.held) return;
        cardIn(handNow, deal.cards[i].j, cardPose);
        placeCard(obj, tt);
      });
    };
    // (the lift toward you, the face toward you, and the lamp's reflection)
    const placeCard = (obj, tt) => {
      const el = obj.element, p = cardPose.p, q = cardPose.q;
      const L = lift.get(obj.userData.card.id);
      let lk = 0;
      if (L) {
        lk = fo.reduced ? L[1] : smoother(L[2] + (L[1] - L[2]) * clamp01((tt - L[3]) / 0.45));
        L[0] = lk;
        if (lk > 0) {
          focalPose(focusPose);
          const arc = Math.sin(Math.PI * lk) * 4;
          p.lerp(focusPose.p, lk); p.y += arc;
          q.slerp(focusPose.q, lk);
        }
      }
      obj.position.copy(p);
      obj.quaternion.copy(q);
      // the face toward the camera is the face that shows
      const n = V(0, 0, 1).applyQuaternion(q), toCam = camLocal.p.clone().sub(p);
      el.classList.toggle('r3t-up', n.dot(toCam) > 0);
      // the lamp's reflection: where the card lies, or - held up - where
      // the light over your shoulder catches it as you turn it
      const lv = lk.toFixed(2);
      if (el.dataset.lift !== lv) { el.dataset.lift = lv; el.style.setProperty('--lift', lv); }
      if (lk > 0.01) {
        const nc = n.clone().applyQuaternion(camLocal.q.clone().invert());
        const gx = `${Math.round(50 - nc.x * 140)}%`;
        if (el.dataset.gxf !== gx) { el.dataset.gxf = gx; el.style.setProperty('--gx', gx); }
      } else if (el.dataset.gxf) { delete el.dataset.gxf; el.style.setProperty('--gx', el.dataset.gx0); }
    };

    // ---- The machine's moves, evaluated from the plan: stowed under the
    // port until the deal; the port opens and it rises, a straight column,
    // its hand pointing up; the moves of the deal, each on a quintic path
    // (dead still at a stop, with no jolt starting or stopping; on through
    // a via point at speed) with a servo's small shiver where it stops to
    // place something; up straight again, down into the table, and the
    // port shuts. Over that, what makes it move like a thing with mass:
    // the hand trails and banks from the wrist as it speeds up, slows and
    // swings about - none of it at a stop, so every card lands exactly.
    // (Motion off: it stays below, the cards dealt.)
    const onCard = (cp, j = 0) => handFor(cp, j);
    const wristW = V(0, 0, 0);
    let prevPalm = null, prevT = 0, glow = 0;
    const segAt = tt => {
      const S = deal.segs;
      if (!S.length || tt < S[0].t0) return null;
      let lo = 0, hi = S.length - 1;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (S[mid].t0 <= tt) lo = mid; else hi = mid - 1; }
      return S[lo];
    };
    // (quintic Hermite: positions and speeds at the ends, no acceleration)
    const along = (sg, k) => {
      const k3 = k * k * k, k4 = k3 * k, k5 = k4 * k, dt = sg.t1 - sg.t0;
      const h0 = 1 - 10 * k3 + 15 * k4 - 6 * k5, h1 = k - 6 * k3 + 8 * k4 - 3 * k5, h2 = -4 * k3 + 7 * k4 - 3 * k5, h3 = 10 * k3 - 15 * k4 + 6 * k5;
      const p = sg.a.p.clone().multiplyScalar(h0).addScaledVector(sg.v0, h1 * dt).addScaledVector(sg.v1, h2 * dt).addScaledVector(sg.b.p, h3);
      p.y += sg.lift * Math.pow(Math.sin(Math.PI * k), 2);
      return { p, q: sg.a.q.clone().slerp(sg.b.q, clamp01(h1 * sg.s0 + h2 * sg.s1 + h3)) };
    };
    const fingersAt = (sg, k) => { const e = smoother(clamp01(k * 2.4)); return [lerp(sg.f0[0], sg.f1[0], e), lerp(sg.f0[1], sg.f1[1], e)]; };
    // the hand's pose from the plan alone (no trailing), the shoulder's
    // height, the port, the fingers
    const planned = tt => {
      const n = cardObjs.length;
      let hp = upright(ARM.down), y = ARM.down, open = 0, f = FIN.rest, free = false;
      if (n && !fo.reduced && tt >= dealAt - RISE.open) {
        open = smoother((tt - (dealAt - RISE.open)) / 0.15);
        const S = deal.segs;
        const firstT = S.length ? S[0].t0 : dealAt, endT = S.length ? S[S.length - 1].t1 : dealAt;
        if (tt < firstT) {
          // rising out of the table
          y = lerp(ARM.down, ARM.up, easeOut((tt - (dealAt - RISE.up)) / (RISE.up - RISE.swing), 3));
          hp = upright(y);
        } else if (tt < endT) {
          y = ARM.up;
          const sg = segAt(tt);
          const k = sg ? clamp01((tt - sg.t0) / Math.max(1e-4, sg.t1 - sg.t0)) : 0;
          if (!sg) hp = upright(ARM.up);
          else if (sg.kind === 'push') hp = onCard(turned(cardObjs[sg.card], angleAt(sg.card, tt), { p: V(0, 0, 0), q: new THREE.Quaternion() }));
          else { hp = along(sg, k); free = true; }
          if (sg) f = fingersAt(sg, k);
          // (a servo's shiver where a move ends on a placement)
          const prev = segAt(tt - 0.13);
          if (prev && prev !== sg && prev.settle && tt - prev.t1 < 0.13 && tt >= prev.t1) {
            const dir = prev.b.p.clone().sub(prev.a.p); const L0 = dir.length();
            if (L0 > 0.5) { const b = tt - prev.t1; hp.p.addScaledVector(dir.multiplyScalar(1 / L0), 0.16 * Math.sin(b * 70) * Math.exp(-b * 32)); }
          }
        } else {
          const k = tt - endT;
          y = lerp(ARM.up, ARM.down, smoother(k / SINK.down));
          hp = upright(y);
          open = 1 - smoother((k - SINK.down + 0.05) / SINK.shut);
        }
      }
      return { hp, y, open, f, free };
    };
    const wobble = new THREE.Quaternion(), wobE = new THREE.Euler();
    const poseHand = tt => {
      const { hp, y, open, f, free } = planned(tt);
      // (how it is speeding up, and which way, in the hand's own frame:
      // hung from the wrist, the fingers trail behind a change of speed -
      // down as it lifts, aside as it swings - and it banks into a swing)
      if (free) {
        const h = 1 / 60, a = planned(tt - h).hp.p, b = planned(tt + h).hp.p;
        const acc = a.add(b).addScaledVector(hp.p, -2).multiplyScalar(1 / (h * h)).applyQuaternion(hp.q.clone().invert());
        wobE.set(THREE.MathUtils.clamp(acc.y * 4e-5, -0.2, 0.2), THREE.MathUtils.clamp(-acc.x * 4e-5, -0.2, 0.2), THREE.MathUtils.clamp(-acc.x * 7e-5, -0.24, 0.24));
        wobble.setFromEuler(wobE);
        const wr = WRIST.clone().applyQuaternion(hp.q).add(hp.p);
        hp.q.multiply(wobble);
        hp.p.copy(wr).sub(WRIST.clone().applyQuaternion(hp.q));
      }
      handNow.p.copy(hp.p); handNow.q.copy(hp.q);
      dealer.position.copy(hp.p);
      dealer.quaternion.copy(hp.q);
      wristW.copy(WRIST).applyQuaternion(hp.q).add(hp.p);
      const shown = y > ARM.down + 1;
      arm.pose(y, wristW, tt, shown ? 1 : 0);
      setPort(open);
      dealer.visible = arm.group.visible = shown;
      // the fingers: opening to reach, closed on the cards it carries,
      // curled to flick one over, opened and spread as it lets go
      dealer.userData.curl(f[0], f[1]);
      dealer.userData.leds(shown ? 1 : 0, tt);
      // the light in its circuits: up while it works, brighter as it moves
      const palm = V(0, 1.2, -9.8).applyQuaternion(hp.q).add(hp.p);
      const dt = tt - prevT;
      const speed = prevPalm && dt > 0 && dt < 0.2 ? prevPalm.distanceTo(palm) / dt : 0;
      glow = lerp(glow, shown ? 0.3 + Math.min(0.6, speed / 140) : 0, 0.35);
      dealerMats.ceramic.emissiveIntensity = glow;
      dealerMats.pulse.value = tt;
      prevPalm = palm; prevT = tt;
      // its shadow on the felt, under the palm, fading as the hand rises
      handShadow.position.set(palm.x, 0.02, palm.z);
      handShadow.rotation.z = Math.atan2(V(0, 0, 1).applyQuaternion(hp.q).x, V(0, 0, 1).applyQuaternion(hp.q).z);
      handShadow.material.opacity = shown && palm.y > 0 ? 0.5 * clamp01(1 - (palm.y - 1.2) / 14) : 0;
    };
    let tNow = 0, raf = 0, last = 0, running = false, arrived = false, disposed = false;
    // (a flicked card's spin, slowing to a stop)
    let spinT = null;
    const spinning = () => !focal.dragging && Math.abs(focal.vx) + Math.abs(focal.vy) > 0.05;
    const spinStep = tt => {
      const dt = spinT == null ? 0 : Math.max(0, Math.min(0.1, tt - spinT));
      spinT = tt;
      if (!focusId || !spinning()) return;
      const f = dt * 60;
      spinBy(focal.vx * f, focal.vy * f);
      const decay = Math.pow(0.9, f);
      focal.vx *= decay; focal.vy *= decay;
    };
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
      // (the camera in the seat's frame: where a focused card is held up,
      // and which face of each card is toward you)
      camLocal.p.copy(camera.position); seat.worldToLocal(camLocal.p);
      camLocal.q.copy(seat.quaternion).invert().multiply(camera.quaternion);
      spinStep(tt);
      poseCards(tt);
      poseHand(tt);
      poseHeld(tt);
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
    // (busy: the deal, a card lifting or going down, or one still spinning
    // from a flick)
    const busyUntil = () => Math.max(settleAt, ...[...lift.values()].map(L => L[3] + 0.5), spinning() ? tNow + 1 : 0);
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
    // Turning the focused card by hand: a drag turns it about the screen's
    // own axes (sideways about the vertical, up and down about the
    // horizontal), and a flick leaves it spinning down to a stop.
    let drag = null, swallowClick = false;
    const spinBy = (dx, dy) => {
      focal.spin.premultiply(_q1.setFromAxisAngle(V(1, 0, 0), dy * 0.0105)).premultiply(_q1.setFromAxisAngle(V(0, 1, 0), dx * 0.0105));
    };
    css.domElement.addEventListener('pointerdown', e => {
      // (a new press: whatever the last drag left to swallow is stale)
      swallowClick = false;
      const card = e.target.closest('.r3t-card');
      if (!card || card.dataset.id !== focusId) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0, t: performance.now() };
      focal.vx = focal.vy = 0; focal.dragging = true;
      try { card.setPointerCapture(e.pointerId); } catch (err) { /* not capturable: moves still bubble */ }
    });
    css.domElement.addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      const now = performance.now(), dt = Math.max(1, now - drag.t);
      drag.x = e.clientX; drag.y = e.clientY; drag.t = now; drag.moved += Math.abs(dx) + Math.abs(dy);
      spinBy(dx, dy);
      // (its speed, in pixels a frame, for the spin it keeps)
      focal.vx = lerp(focal.vx, dx / dt * 16, 0.5); focal.vy = lerp(focal.vy, dy / dt * 16, 0.5);
      wake();
    });
    const endDrag = e => {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      focal.dragging = false;
      if (drag.moved > 6) swallowClick = true;
      if (fo.reduced) focal.vx = focal.vy = 0;
      drag = null;
      wake();
    };
    css.domElement.addEventListener('pointerup', endDrag);
    css.domElement.addEventListener('pointercancel', endDrag);
    css.domElement.addEventListener('click', e => {
      // (a drag that turned the card is not a tap on it)
      if (swallowClick) { swallowClick = false; if (e.target.closest('.r3t-card')) return; }
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
        // (a card brought up starts square to you)
        if (focusId) { focal.spin.identity(); focal.vx = focal.vy = 0; }
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
      // (the arrow keys turn a focused card, a quarter of a half-turn a press)
      else if (focusId && e.target.dataset && e.target.dataset.id === focusId && /^Arrow/.test(e.key)) {
        e.preventDefault();
        const step = 43;
        spinBy(e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0, e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0);
        wake();
      }
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
      // (lab and tests: which way this deal was dealt, and a turn of the
      // focused card as a drag would give it)
      deal: deal.style,
      turnCard(dx, dy) { spinBy(dx, dy); wake(); },
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
