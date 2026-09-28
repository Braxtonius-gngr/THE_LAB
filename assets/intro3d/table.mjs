// THE TABLE: where the landing flies to (three.js + CSS3D).
//
// After the roll intro has floated up, a tap on the landing starts one
// continuous shot: the camera rises out of the float, sweeps across the room
// and settles into the player's seat at a table. Two destinations are being
// tried (?dest= picks one): a private high-limit card table across the room
// ('card'), or the craps table itself, at its near end ('craps').
//
// The seat is the home screen of the Refinement x Realization skin. The rail
// in front of you holds the clock and the Daily Run; the deck waits in its
// shoe; running the deck deals your ready platforms onto the felt as cards,
// face down, then turns them - the higher a platform's tier, the finer its
// card. Your phone lies by the rail: pick it up for the freebies and the
// community drops.
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
import * as P from './physics.mjs';

export const DESTS = ['card', 'craps'];

const DEG = Math.PI / 180;
const clamp01 = x => Math.min(Math.max(x, 0), 1);
const smoother = x => { x = clamp01(x); return x * x * x * (x * (6 * x - 15) + 10); };
const lerp = (a, b, k) => a + (b - a) * k;
const easeInOut = x => { x = clamp01(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const easeOut = (x, k = 3) => 1 - Math.pow(1 - clamp01(x), k);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Where the card table stands, and which way its seat faces: along +x, away
// from the craps table, so the camera comes in from behind the chair.
const CARD_TABLE = { at: [212, 0, -18], yaw: 90 };
// Its felt: a half-ellipse, a across and b deep, from the player's rail to
// the dealer's straight edge.
const FELT = { a: 80, b: 64 };
// The craps seat: at the rail along the long side, opposite the
// stickman, looking across the table to where the stick draws the dice.
const CRAPS_SEAT = { at: [-P.TABLE.sideX, 0, 6], yaw: 90, zRange: [-50, 64] };
// A playing card (6.35 x 8.89 cm), built at CARD.px page pixels per cm and
// scaled down, so its print is rasterised sharp.
const CARD = { w: 6.35, h: 8.89, px: 50 };
// Where the dealt cards lie: three to a row, rows away from the player.
const SLOTS = { cols: 3, gapX: 1.3, gapZ: 2.4, max: 9 };
// Each destination's layout in its seat frame: the seat camera (portrait,
// landscape), the first row of cards, the rail's panel, the shoe and the
// discard rack.
const LAYOUT = {
  card: {
    view: [{ eye: [0, 54, -22], aim: [0, 0, 21], fov: 50 }, { eye: [0, 46, -24], aim: [0, 0, 25], fov: 40 }],
    z0: 16.5, rail: { y: 7.2, z: -4.2, tilt: 28 }, shoe: [-12, 54], discard: [16, 55],
    // the phone at rest: [x, y] in the view (-1..1), and its distance, cm
    // (it rides in a layer of its own, over the table's)
    phone: [0.8, -1.24, 40]
  },
  craps: {
    view: [{ eye: [0, 60, -20], aim: [0, 0, 36], fov: 50 }, { eye: [0, 54, -22], aim: [0, 0, 40], fov: 40 }],
    z0: 25, rail: { y: 26.4, z: -4.4, tilt: 34, scale: 54 }, shoe: [-13, 50], discard: [17, 50],
    phone: [0.8, -1.24, 40]
  }
};
// The shot's timings (seconds from the tap).
const T = { cardFly: 4.8, crapsFly: 3.9, uiIn: 0.6 };
// The deal, by the dealer's hand: seconds per card, and its phases - the
// reach to the shoe, the pull out of it, the carry to the card's place
// (face down, a length short of it), the settle onto its near edge, the push
// that lifts it over onto its face-up place, and the fall it finishes on
// its own while the hand goes back for the next.
const DEAL = { each: 1.25, reach: 0.12, pull: 0.1, carry: 0.36, settle: 0.14, push: 0.14, fall: 0.22 };
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
    // (the house line runs left to right as the player reads it: from x = +ra)
    ell(a - 13, b - 13);
    ell(a - 13.7, b - 13.7);
    // a string of small diamonds along the arc between the band and the
    // fine lines (small type would blur at the print's resolution and the
    // angle it is seen at)
    const ra = a - 9.3, rb = b - 9.3;
    for (let i = 1; i < 18; i++) {
      const th = -Math.PI / 2 + (Math.PI * i) / 18;
      const x = ra * Math.sin(th), z = b - rb * Math.cos(th), d = 0.55 * s;
      c.save(); c.translate(px(x), pz(z)); c.rotate(-th);
      c.beginPath(); c.moveTo(0, -d); c.lineTo(d * 0.62, 0); c.lineTo(0, d); c.lineTo(-d * 0.62, 0); c.closePath(); c.fill();
      c.restore();
    }
  });
  print.colorSpace = THREE.NoColorSpace;
  // the wordmark, by the dealer: 36 x 9 cm at 28 px/cm
  const WM = { w: 36, h: 9, z: b - 23 };
  const mark = canvasTex(1024, 256, (c, W, H) => {
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
  mark.colorSpace = THREE.NoColorSpace;
  // (printed ink, not foil: a muted, satin gold)
  const inkMat = new THREE.MeshStandardMaterial({ color: 0x9c7c3e, alphaMap: print, transparent: true, depthWrite: false, metalness: 0.45, roughness: 0.6, envMapIntensity: 0.6, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const ink = new THREE.Mesh(new THREE.PlaneGeometry(168, 84), inkMat);
  ink.rotation.x = -Math.PI / 2; ink.rotation.z = Math.PI; ink.position.set(0, 0.006, 38); ink.receiveShadow = true; g.add(ink);
  const markMat = inkMat.clone(); markMat.alphaMap = mark;
  const markMesh = new THREE.Mesh(new THREE.PlaneGeometry(WM.w, WM.h), markMat);
  markMesh.rotation.x = -Math.PI / 2; markMesh.rotation.z = Math.PI; markMesh.position.set(0, 0.008, WM.z); markMesh.receiveShadow = true; g.add(markMesh);
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

// The chip tray: a black lacquer well with a brass rim, stacks of chips in
// the house colours.
function chipTray(set) {
  const g = new THREE.Group();
  const tray = new THREE.Mesh(new THREE.BoxGeometry(62, 1.2, 9.6), new THREE.MeshStandardMaterial({ color: 0x0b0a0a, roughness: 0.35, metalness: 0.2 }));
  tray.position.y = 1.3; g.add(tray);
  const rimGeo = new THREE.BoxGeometry(63, 0.5, 10.4);
  const rim = new THREE.Mesh(rimGeo, set.brass); rim.position.y = 1.95; g.add(rim);
  const colours = [['#101012', '#e8e2d2'], ['#5b1622', '#f1e7d0'], ['#1d3a2a', '#f1e7d0'], ['#3a2352', '#f1e7d0'], ['#d9cfb8', '#6b1320'], ['#b58a2e', '#1a1208']];
  const mats = colours.map(([base, spot]) => {
    const side = canvasTex(256, 16, (c, W, H) => { c.fillStyle = base; c.fillRect(0, 0, W, H); c.fillStyle = spot; for (let k = 0; k < 6; k++) c.fillRect(k * 42.7 + 16, 0, 9, H); });
    const top = canvasTex(64, 64, (c, W) => { c.fillStyle = base; c.fillRect(0, 0, W, W); c.strokeStyle = spot; c.lineWidth = 3; c.beginPath(); c.arc(32, 32, 22, 0, 7); c.stroke(); c.lineWidth = 1; c.beginPath(); c.arc(32, 32, 15, 0, 7); c.stroke(); });
    const sideM = new THREE.MeshStandardMaterial({ map: side, roughness: 0.45 });
    const topM = new THREE.MeshStandardMaterial({ map: top, roughness: 0.4 });
    return [sideM, topM, topM];
  });
  const chipGeo = new THREE.CylinderGeometry(1.95, 1.95, 0.33, 32);
  for (let k = 0; k < 12; k++) {
    const x = -27.5 + k * 5, m = mats[k % mats.length], n = 5 + ((k * 7) % 5);
    for (let j = 0; j < n; j++) {
      const chip = new THREE.Mesh(chipGeo, m);
      chip.position.set(x + Math.sin(j * 2.1 + k) * 0.08, 1.9 + j * 0.34, Math.cos(j * 1.7 + k) * 0.08);
      chip.rotation.y = j * 0.9 + k;
      chip.castShadow = j === n - 1;
      g.add(chip);
    }
  }
  g.position.set(0, 0, FELT.b + 5.6);
  return g;
}

// ------------------------------------------------------------ the props
// The shoe: a lacquered box, sloped, with a brass face where the cards
// come out; the discard rack; the phone.
function buildShoe(set) {
  const g = new THREE.Group();
  // walnut sides, a black lacquer lid sloping down to the mouth, a brass
  // face with the finger slot the cards are drawn through
  const lac = new THREE.MeshPhysicalMaterial({ color: 0x0c0a0a, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 });
  const side = new THREE.Shape();
  side.moveTo(-8, 0); side.lineTo(8, 0); side.lineTo(8, 6.2); side.lineTo(-6.6, 3.2); side.lineTo(-8, 3.2); side.closePath();
  const bodyGeo = new THREE.ExtrudeGeometry(side, { depth: 8.4, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.2, bevelSegments: 2 });
  bodyGeo.translate(0, 0, -4.2);
  const wood = set.wood.clone();
  wood.map = retile(set.tex.walnut, 1 / 20, 1 / 20);
  const body = new THREE.Mesh(bodyGeo, [wood, lac]);
  // (the shape's x runs along the shoe: turned so its low end is the mouth, at -z)
  body.rotation.y = -Math.PI / 2; body.castShadow = true; g.add(body);
  const face = new THREE.Mesh(new THREE.BoxGeometry(8.9, 3.4, 0.35), set.brass);
  face.position.set(0, 1.7, -8.2); g.add(face);
  const slot = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.5, 0.4), new THREE.MeshBasicMaterial({ color: 0x050403 }));
  slot.position.set(0, 0.55, -8.35); g.add(slot);
  // the top card of the deck at the mouth, back up
  const back = canvasTex(256, 356, paintCardBack);
  const card = new THREE.Mesh(new THREE.BoxGeometry(6.35, 0.03, 8.89), [0, 0, new THREE.MeshStandardMaterial({ map: back, roughness: 0.5 }), 0, 0, 0].map(m => m || new THREE.MeshStandardMaterial({ color: 0xece4d2 })));
  card.position.set(0, 0.2, -6.5); card.rotation.x = 3 * DEG; card.castShadow = true; g.add(card);
  return g;
}
function buildDiscard(set) {
  // the discard rack: smoked glass on a walnut base, a few cards already in
  // it (what has been played today)
  const g = new THREE.Group();
  const smoke = new THREE.MeshPhysicalMaterial({ color: 0x2a221c, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.42, clearcoat: 1, clearcoatRoughness: 0.05, depthWrite: false });
  const base = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.8, 11), set.wood); base.position.y = 0.4; g.add(base);
  [-3.9, 3.9].forEach(x => { const w = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4.2, 10.4), smoke); w.position.set(x, 2.9, 0); g.add(w); });
  const backW = new THREE.Mesh(new THREE.BoxGeometry(7.8, 4.2, 0.3), smoke); backW.position.set(0, 2.9, 5.1); g.add(backW);
  const rim = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.25, 0.5), set.brass); rim.position.set(0, 5, 5.1); g.add(rim);
  const back = new THREE.MeshStandardMaterial({ map: canvasTex(256, 356, paintCardBack), roughness: 0.5 });
  const edge = new THREE.MeshStandardMaterial({ color: 0xe9e0cc, roughness: 0.7 });
  for (let k = 0; k < 5; k++) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(6.35, 0.08, 8.89), [edge, edge, back, edge, edge, edge]);
    c.position.set(Math.sin(k * 2.3) * 0.3, 0.86 + k * 0.09, 0.4 + Math.cos(k * 1.7) * 0.3);
    c.rotation.y = Math.sin(k * 1.9) * 0.08;
    g.add(c);
  }
  return g;
}
// The dealer's right hand: a white cotton glove, a black sleeve. Its frame
// is at the fingertips - +z along the fingers, +y the back of the hand, +x
// the thumb's side - so a pose is where the fingertips are and which way
// they point. The fingers lie flat to slide under a card's end; the thumb
// stands off to the side, clear of the card.
function buildHand() {
  const g = new THREE.Group();
  const glove = new THREE.MeshStandardMaterial({ color: 0xf3efe6, roughness: 0.86 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0x141212, roughness: 0.92 });
  const along = (mesh, a, b) => {
    // (a capsule stands along y: laid from a to b)
    const d = b.clone().sub(a), l = d.length();
    mesh.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize());
    mesh.position.copy(a).lerp(b, 0.5);
    mesh.userData.len = l;
    return mesh;
  };
  const capsule = (r, len, mat) => { const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 12), mat); m.castShadow = true; return m; };
  // the fingers, tips at the origin, lying back along -z, a little curled
  [[2.3, 0.05, 0.3], [0.8, 0.2, 0], [-0.8, 0.15, 0], [-2.3, 0, 0.9]].forEach(([x, dy, back]) => {
    g.add(along(capsule(0.78, 4.4, glove), V(x, 0.78 + dy, -back - 0.4), V(x, 1.35 + dy, -back - 6.2)));
  });
  const palm = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), glove);
  palm.scale.set(3.6, 1.05, 3.6); palm.position.set(0, 1.35, -8.6); palm.castShadow = true; g.add(palm);
  const knuckles = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), glove);
  knuckles.scale.set(3.5, 0.9, 1.4); knuckles.position.set(0, 1.4, -6.2); g.add(knuckles);
  g.add(along(capsule(0.82, 4.2, glove), V(3.3, 0.9, -8.4), V(5.6, 0.7, -4.2)));
  // the cuff and the sleeve, back to the elbow (rising a little, out of the shot)
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.6, 1.6, 20), glove);
  cuff.rotation.x = Math.PI / 2; cuff.position.set(0, 1.5, -12.6); g.add(cuff);
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 2.5, 34, 20), cloth);
  along(sleeve, V(0, 1.6, -13), V(0, 8.5, -46.3)); sleeve.castShadow = true; g.add(sleeve);
  return g;
}
// A hand pose: fingertips at p, fingers along z, the back of the hand up y.
function handPose(p, z, y) {
  const zz = z.clone().normalize(), xx = y.clone().cross(zz).normalize(), yy = zz.clone().cross(xx);
  return { p: p.clone(), q: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xx, yy, zz)) };
}
// The phone is all page elements (its frame too - see .r3t-phone): it is
// always in front of the table, and a WebGL body under a page-element
// screen could be painted over by the rail's panel. This is just its
// transform, which the screen follows.
function buildPhone() {
  return new THREE.Group();
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
function cardHTML(c) {
  const tier = tierOf(c.tier);
  const suit = SUITS[hash(c.name || '') % 4];
  const red = suit === '♥' || suit === '♦';
  const ev = typeof c.ev === 'number' && c.ev > 0 ? `~$${c.ev.toFixed(2)}` : '';
  const state = c.remaining > 0 ? fmtLeft(c.remaining) : 'Ready';
  // (a dealt card is ready by being dealt: it shows what it's worth, or
  // how long it has left when it isn't)
  const shown = c.remaining > 0 ? state : (ev || state);
  const label = `${c.name}, ${tier === 'U' ? 'unranked' : tier + ' tier'}, ${state}${ev ? ', about ' + ev.slice(2) + ' dollars a day' : ''}`;
  return `<div class="r3t-card-in">
    <div class="r3t-face r3t-front t-${tier}${red ? ' r3t-red' : ''}">
      <div class="r3t-frame"></div>
      <span class="r3t-idx r3t-tl"><b>${tier === 'U' ? '•' : tier}</b><i>${suit}</i></span>
      <span class="r3t-idx r3t-br"><b>${tier === 'U' ? '•' : tier}</b><i>${suit}</i></span>
      <div class="r3t-seal"><span>${esc(initials(c.name))}</span></div>
      <div class="r3t-name">${esc(c.name)}</div>
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
        <circle cx="50" cy="50" r="46" class="r3t-dial-face"/>
        ${Array.from({ length: 12 }, (_, i) => `<line x1="50" y1="${i % 3 ? 9 : 7}" x2="50" y2="${i % 3 ? 14 : 17}" transform="rotate(${i * 30} 50 50)" class="r3t-tick${i % 3 ? '' : ' r3t-tick-q'}"/>`).join('')}
        <line x1="50" y1="50" x2="50" y2="27" class="r3t-hand-h"/>
        <line x1="50" y1="54" x2="50" y2="15" class="r3t-hand-m"/>
        <line x1="50" y1="58" x2="50" y2="12" class="r3t-hand-s"/>
        <circle cx="50" cy="50" r="3.2" class="r3t-pin"/>
      </svg>
    </div>
    <div class="r3t-time"><b class="r3t-now">--:--</b><small class="r3t-date"></small></div>
    <button type="button" class="r3t-run"><span class="r3t-run-k">Run the deck</span><span class="r3t-run-v">&mdash;</span></button>
    <div class="r3t-status"><b class="r3t-next">&mdash;</b><small class="r3t-done"></small></div>
  </div>`;
}
function phoneHTML() {
  return `<div class="r3t-phone-in">
    <div class="r3t-ph-status"><span class="r3t-ph-clock">--:--</span><span class="r3t-ph-icons">•••</span></div>
    <div class="r3t-ph-lock">
      <div class="r3t-ph-big">--:--</div>
      <div class="r3t-ph-day"></div>
      <div class="r3t-ph-note"><b>Freebies</b><span>New drops waiting</span></div>
      <div class="r3t-ph-note"><b>Community</b><span>Drops from other players</span></div>
      <div class="r3t-ph-hint">Pick up</div>
    </div>
    <div class="r3t-ph-app">
      <div class="r3t-ph-title">Daily Roll Over</div>
      <button type="button" class="r3t-ph-tile" data-view="freebies"><b>Freebies</b><span>Codes, drops and giveaways</span></button>
      <button type="button" class="r3t-ph-tile" data-view="community"><b>Community drops</b><span>Shared by other players</span></button>
      <button type="button" class="r3t-ph-put">Put it down</button>
    </div>
  </div>`;
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
  let table = null, lampLight = null, lampGlow = null, focus = [0, 0, 30];
  const L = LAYOUT[dest];
  if (dest === 'card') {
    table = buildCardTable(set);
    seat.add(table.group);
    focus = table.focus;
    seat.position.set(...CARD_TABLE.at);
    seat.rotation.y = CARD_TABLE.yaw * DEG;
    // its lamp: a low bronze pendant with a warm glow, and the light in it
    const bronze = new THREE.MeshStandardMaterial({ color: 0x2a1c12, metalness: 0.85, roughness: 0.35 });
    const lamp = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(70, 6, 26), bronze);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(71, 0.8, 27), set.brass); lip.position.y = -3.2;
    lampGlow = new THREE.Mesh(new THREE.PlaneGeometry(66, 22), new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 0, 0), fog: false }));
    lampGlow.rotation.x = Math.PI / 2; lampGlow.position.y = -3.7;
    lamp.add(body, lip, lampGlow);
    [-26, 26].forEach(x => { const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 200, 8), bronze); rod.position.set(x, 103, 0); lamp.add(rod); });
    lamp.position.set(0, 118, 34);
    seat.add(lamp);
    lampLight = new THREE.SpotLight(0xffeedd, 0, 0, 0.78, 0.85, 0);
    lampLight.position.set(0, 112, 34);
    lampLight.target.position.set(0, 0, 30);
    lampLight.castShadow = true;
    lampLight.shadow.mapSize.set(1024, 1024);
    lampLight.shadow.camera.near = 50; lampLight.shadow.camera.far = 200;
    lampLight.shadow.bias = -0.0004; lampLight.shadow.normalBias = 0.03; lampLight.shadow.radius = 4;
    seat.add(lampLight, lampLight.target);
  } else {
    seat.position.set(...CRAPS_SEAT.at);
    seat.rotation.y = CRAPS_SEAT.yaw * DEG;
    focus = [0, 0, 45];
    // (the room's lamp is aimed down the far end: the players' end gets a
    // light of its own, coming up as the card table's lamp would)
    lampLight = new THREE.SpotLight(0xffeedd, 0, 0, 0.5, 0.9, 0);
    lampLight.position.set(-30, 190, 40);
    lampLight.target.position.set(0, 0, 34);
    lampLight.castShadow = true;
    lampLight.shadow.mapSize.set(1024, 1024);
    lampLight.shadow.camera.near = 60; lampLight.shadow.camera.far = 220;
    lampLight.shadow.bias = -0.0004; lampLight.shadow.normalBias = 0.03; lampLight.shadow.radius = 4;
    seat.add(lampLight, lampLight.target);
  }
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
  const phone = buildPhone();
  seat.add(shoe, discard, phone);
  // (the hand itself is drawn over the cards - see fly - so it is never
  // painted under a card it is on; this is only its shadow on the felt)
  const handShadow = new THREE.Mesh(new THREE.PlaneGeometry(16, 22), new THREE.MeshBasicMaterial({ map: canvasTex(128, 128, (c, W, H) => { const g = c.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 2); g.addColorStop(0, 'rgba(0,0,0,0.9)'); g.addColorStop(0.45, 'rgba(0,0,0,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, W, H); }), transparent: true, depthWrite: false, opacity: 0 }));
  handShadow.rotation.x = -Math.PI / 2; handShadow.position.y = 0.02; handShadow.renderOrder = 2;
  seat.add(handShadow);
  const shoeMouth = V(0, 0.9, -11.6).applyAxisAngle(V(0, 1, 0), shoe.rotation.y).add(shoe.position);
  const mouthDir = V(0, 0, -1).applyAxisAngle(V(0, 1, 0), shoe.rotation.y);
  // (a card in the shoe lies with its top inward: the dealer draws it by
  // its bottom end, and turns it over its far edge onto its place)
  const yawShoe = Math.atan2(-mouthDir.x, -mouthDir.z);

  // The lamp comes up while the intro floats, so the table is there, lit,
  // before the camera turns toward it.
  const lampT0 = performance.now();
  const lampUp = () => {
    if (!lampLight) return 1;
    const k = smoother((performance.now() - lampT0) / 2200);
    lampLight.intensity = (dest === 'card' ? 3.3 : 1.5) * k;
    if (lampGlow) lampGlow.material.color.setRGB(2.2 * k, 1.75 * k, 1.3 * k);
    return k;
  };
  lampUp();

  // ---- The fly-in and the seat.
  async function fly(world, flyOpts = {}) {
    const fo = Object.assign({ manual: false, reduced: false, onArrive: null, host: null, seatView: null }, flyOpts);
    const { renderer, camera } = world;
    // At the craps table you sit along the rail from where the dice came to
    // rest, so they lie in front of you past the cards.
    if (dest === 'craps' && world.dice && world.dice.length) {
      world.stage(world.floatEnd);
      const c = V(0, 0, 0);
      world.dice.forEach(d => c.add(d.getWorldPosition(V(0, 0, 0))));
      c.multiplyScalar(1 / world.dice.length);
      world.stage(world.t);
      if (Number.isFinite(c.z)) seat.position.z = THREE.MathUtils.clamp(c.z, CRAPS_SEAT.zRange[0], CRAPS_SEAT.zRange[1]);
      seat.updateMatrixWorld(true);
    }
    const stageEl = fo.host || document.body;
    world.overlays.forEach(el => { el.style.visibility = 'hidden'; });
    // CSS3D layer, over the canvas, same camera.
    const css = new CSS3DRenderer();
    css.domElement.className = 'r3t-css';
    const cssScene = new THREE.Scene();
    const cssSeat = new THREE.Group();
    cssSeat.position.copy(seat.position); cssSeat.quaternion.copy(seat.quaternion);
    cssScene.add(cssSeat);
    // The phone has a layer of its own over the table's: it's in your hand,
    // in front of everything on the table, whatever the depths say.
    const phoneCss = new CSS3DRenderer();
    phoneCss.domElement.className = 'r3t-css r3t-css-phone';
    const phoneScene = new THREE.Scene();
    const size = () => {
      world.size();
      const w = world.host.clientWidth || window.innerWidth, h = world.host.clientHeight || window.innerHeight;
      css.setSize(w, h);
      phoneCss.setSize(w, h);
      if (typeof sizeHand === 'function') sizeHand(w, h);
      return w / h;
    };
    // The dealer's hand has a canvas of its own over the cards (the cards
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
    const dealer = buildHand();
    handSeat.add(dealer);
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
    css.domElement.appendChild(phoneCss.domElement);

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

    // The path: from where the float left the camera, up and back a little
    // (the breath before the move), high over the room on a curve, then in
    // from behind the chair and down into the seat.
    const fwd0 = new THREE.Vector3(); camera.getWorldDirection(fwd0);
    const E0 = camera.position.clone(), A0 = E0.clone().addScaledVector(fwd0, 70);
    const seatBack = toWorld(V(0, 0, -1)).sub(toWorld(V(0, 0, 0))).normalize();
    const travel = E1.clone().sub(E0); travel.y = 0;
    const side = V(-travel.z, 0, travel.x).normalize();
    const high = Math.max(E0.y, E1.y);
    const eyePts = dest === 'card'
      ? [E0, E0.clone().add(V(0, 26, 0)).addScaledVector(fwd0, -18), E0.clone().lerp(E1, 0.45).add(V(0, high * 0.55 + 40, 0)).addScaledVector(side, 38),
        E1.clone().addScaledVector(seatBack, 70).add(V(0, 46, 0)), E1.clone().addScaledVector(seatBack, 22).add(V(0, 9, 0)), E1]
      : [E0, E0.clone().add(V(0, 22, 0)).addScaledVector(fwd0, -14), E0.clone().lerp(E1, 0.5).add(V(0, 38, 0)).addScaledVector(side, 30),
        E1.clone().addScaledVector(seatBack, 40).add(V(0, 28, 0)), E1];
    const F = toWorld(V(...focus));
    const aimPts = [A0, A0.clone().lerp(F, 0.35).add(V(0, 12, 0)), F.clone().add(V(0, 6, 0)), A1];
    const eyeCurve = new THREE.CatmullRomCurve3(eyePts, false, 'centripetal');
    const aimCurve = new THREE.CatmullRomCurve3(aimPts, false, 'centripetal');
    const FLY = fo.reduced ? 0.01 : dest === 'card' ? T.cardFly : T.crapsFly;
    const fov0 = camera.fov;
    const lens0 = world.lights.lensLight.intensity, rim0 = world.lights.rim.intensity;
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
    const railObj = add(railEl, V(0, L.rail.y, L.rail.z), lying(new THREE.Quaternion(), { tilt: L.rail.tilt * DEG }), 1 / (L.rail.scale || 40));
    // the cards
    const hand = (hooks.deck && hooks.deck()) || [];
    const cards = (hand.length ? hand : demoHand()).slice(0, SLOTS.max);
    const sampleStatus = () => ({ ready: cards.length, value: cards.reduce((t, c) => t + (c.ev || 0), 0), next: null, done: 0 });
    const slotAt = i => {
      const r = Math.floor(i / SLOTS.cols), c = i % SLOTS.cols;
      const inRow = Math.min(SLOTS.cols, cards.length - r * SLOTS.cols);
      const x = ((inRow - 1) / 2 - c) * (CARD.w + SLOTS.gapX);
      return V(x, 0.04, L.z0 + r * (CARD.h + SLOTS.gapZ));
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
      el.style.visibility = 'hidden';
      return obj;
    });
    // the phone's screen
    const phoneEl = document.createElement('div');
    phoneEl.className = 'r3t-phone';
    phoneEl.innerHTML = phoneHTML();
    // (CSS3D objects live in the css scene: the phone's screen follows the
    // phone's transform each frame - see placePhone)
    const phoneObj = new CSS3DObject(phoneEl);
    phoneObj.scale.setScalar(1 / 55);
    phoneScene.add(phoneObj);

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
    };
    tick();
    const clock = setInterval(tick, 1000);

    // ---- The timeline, in seconds from the tap.
    const dealAt = FLY + T.uiIn;
    const cardAt = i => dealAt + i * DEAL.each;
    const settleAt = cards.length ? cardAt(cards.length - 1) + DEAL.each + 0.55 : dealAt;
    const introT0 = world.t;
    let phoneK = 0, phoneTarget = 0, phoneFrom = 0, phoneT0 = 0;
    let focusId = null;
    const lift = new Map();                 // card id -> [k, target, from, t0]

    const tmpQ = new THREE.Quaternion(), camQ = new THREE.Quaternion();
    const up = V(0, 1, 0);
    const placeCamera = tt => {
      if (tt < FLY) {
        const u = easeInOut(tt / FLY);
        const e = eyeCurve.getPointAt(u), a = aimCurve.getPointAt(u);
        // bank a little into the turn, the way a flying camera does
        const e2 = eyeCurve.getPointAt(Math.min(1, u + 0.01)), e0 = eyeCurve.getPointAt(Math.max(0, u - 0.01));
        const acc = e2.clone().add(e0).addScaledVector(e, -2);
        const f = a.clone().sub(e).normalize(), r = f.clone().cross(up).normalize();
        const roll = THREE.MathUtils.clamp(acc.dot(r) * 0.9, -7 * DEG, 7 * DEG) * Math.sin(Math.PI * u);
        camera.up.copy(up).applyAxisAngle(f, roll);
        camera.position.copy(e);
        camera.lookAt(a);
        camera.fov = lerp(fov0, sv.fov, u) + 10 * Math.sin(Math.PI * u) * (dest === 'card' ? 1 : 0.6);
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
        if (tt < t0) { el.style.visibility = 'hidden'; return; }
        el.style.visibility = 'visible';
        const p = cardPose.p, q = cardPose.q;
        if (tt < t1) {
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
          const lk = smoother(L[2] + (L[1] - L[2]) * clamp01((tt - L[3]) / 0.35));
          L[0] = lk;
          p.y += lk * 5; p.z -= lk * 3.2;
          // (tipped up toward you about its own width)
          q.multiply(_q2.setFromAxisAngle(V(1, 0, 0), L[0] * 34 * DEG));
        }
        obj.position.copy(p);
        obj.quaternion.copy(q);
        el.classList.toggle('r3t-up', V(0, 0, 1).applyQuaternion(q).y > 0);
      });
    };
    // The dealer's hand: at rest by the chip tray; over the shoe between
    // cards; on each card from its pull to its push, flat on its back with
    // the fingertips a little in from the end it holds.
    const REST = handPose(V(-8, 6, 92), V(0.15, -0.3, -1), up);
    const gripAt = shoeMouth.clone().addScaledVector(mouthDir, 0.6); gripAt.y = shoeMouth.y + 0.95;
    const HOVER = handPose(gripAt.clone().addScaledVector(mouthDir, 2.5).add(V(0, 4.5, 0)), mouthDir.clone().negate().add(V(0, -0.5, 0)), up);
    const GRIP = handPose(gripAt, mouthDir.clone().negate().add(V(0, -0.08, 0)), up);
    const onCard = (obj, inFrom) => {
      // the card's "end" the hand holds is its local bottom: the dealer's
      // side (the card's top is toward the player until it is turned)
      const q = obj.quaternion, p = obj.position;
      const end = V(0, -1, 0).applyQuaternion(q), back = V(0, 0, -1).applyQuaternion(q);
      return handPose(p.clone().addScaledVector(end, CARD.h / 2 - inFrom).addScaledVector(back, 0.95), end.clone().negate(), back);
    };
    const mixPose = (a, b, k) => ({ p: a.p.clone().lerp(b.p, k), q: a.q.clone().slerp(b.q, k) });
    const poseHand = tt => {
      const n = cardObjs.length;
      let pose = REST;
      if (n && tt >= dealAt - 0.5) {
        const last = cardAt(n - 1) + DEAL.each;
        if (tt < dealAt) pose = mixPose(REST, HOVER, smoother((tt - (dealAt - 0.5)) / 0.5));
        else if (tt >= last) pose = mixPose(HOVER, REST, smoother((tt - last) / 0.55));
        else {
          const i = Math.min(n - 1, Math.floor((tt - dealAt) / DEAL.each)), obj = cardObjs[i];
          const { t0, t4 } = stages(i);
          const s0 = cardAt(i);
          if (tt < t0) pose = mixPose(HOVER, GRIP, smoother((tt - s0) / DEAL.reach));
          else if (tt < t4) pose = onCard(obj, 1.6);
          else {
            // the card goes on without the hand, which lifts away and turns
            // back for the shoe
            const at = { p: V(0, 0, 0), q: new THREE.Quaternion() };
            turned(obj, 62 * DEG, at);
            const held = onCard({ position: at.p, quaternion: at.q }, 1.6);
            const k = clamp01((tt - t4) / (DEAL.each - (t4 - s0)));
            const away = { p: held.p.clone().add(V(0, 3.5, 0)).addScaledVector(topOf(obj), 3), q: held.q };
            pose = k < 0.35 ? mixPose(held, away, smoother(k / 0.35)) : mixPose(away, HOVER, smoother((k - 0.35) / 0.65));
          }
        }
      }
      dealer.position.copy(pose.p);
      dealer.quaternion.copy(pose.q);
      // its shadow on the felt, under the palm, fading as the hand rises
      const palm = V(0, 1.2, -8.6).applyQuaternion(pose.q).add(pose.p);
      handShadow.position.set(palm.x, 0.02, palm.z);
      handShadow.rotation.z = Math.atan2(V(0, 0, 1).applyQuaternion(pose.q).x, V(0, 0, 1).applyQuaternion(pose.q).z);
      handShadow.material.opacity = 0.5 * clamp01(1 - (palm.y - 1.2) / 14) * (tt >= dealAt - 0.5 ? 1 : 0);
    };
    // The phone, placed in the camera's own frame (it rides with the view):
    // at rest low at the bottom right, leaning back, its top third showing;
    // held, square to the lens and filling most of the view.
    const camFrame = (x, y, dist, tiltBack, roll) => {
      const tanV = Math.tan((camera.fov * DEG) / 2), tanH = tanV * camera.aspect;
      const pc = V(x * tanH * dist, y * tanV * dist, -dist).applyQuaternion(camera.quaternion).add(camera.position);
      const qc = camera.quaternion.clone()
        .multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), roll))
        .multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -tiltBack));
      return { p: seat.worldToLocal(pc), q: camQ.copy(seat.quaternion).invert().multiply(qc).clone() };
    };
    const placePhone = tt => {
      const k = phoneTarget === phoneFrom ? phoneTarget : smoother(phoneFrom + (phoneTarget - phoneFrom) * clamp01((tt - phoneT0) / 0.6));
      phoneK = k;
      const heldDist = (15.4 / 2) / (0.86 * Math.tan((camera.fov * DEG) / 2));
      const rest = camFrame(L.phone[0], L.phone[1], L.phone[2], 34 * DEG, 16 * DEG);
      const held = camFrame(0, 0, heldDist, 0, 0);
      const p = rest.p.clone().lerp(held.p, k);
      p.addScaledVector(V(0, 1, 0), Math.sin(Math.PI * k) * 3);
      phone.position.copy(p);
      phone.quaternion.copy(rest.q).slerp(held.q, k);
      // its screen rides on it
      phone.updateMatrixWorld(true);
      phoneObj.position.set(0, 0, 0).applyMatrix4(phone.matrixWorld);
      phoneObj.quaternion.copy(seat.quaternion).multiply(phone.quaternion);
      phoneEl.classList.toggle('r3t-held', k > 0.98);
    };

    let tNow = 0, raf = 0, last = 0, running = false, arrived = false, disposed = false;
    const update = tt => {
      tNow = tt;
      lampUp();
      placeCamera(tt);
      const kf = clamp01(tt / 0.9);
      world.lights.lensLight.intensity = lens0 * (1 - kf);
      // (from the craps seat the rim light is straight into the lens: gone)
      world.lights.rim.intensity = rim0 * (1 - (dest === 'craps' ? 1 : 0.6) * kf);
      if (world.bloom) world.bloom.strength = lerp(bloom0, 0.3, kf);
      // the intro's own world keeps time (the stick still drawing the dice)
      world.stage(introT0 + tt);
      poseCards(tt);
      poseHand(tt);
      placePhone(tt);
      const uiK = clamp01((tt - FLY + 0.1) / T.uiIn);
      css.domElement.style.setProperty('--r3t-in', uiK.toFixed(3));
      css.domElement.classList.toggle('r3t-hide', uiK <= 0);
      if (!arrived && tt >= FLY) { arrived = true; if (fo.onArrive) fo.onArrive(css.domElement); }
    };
    const draw = () => {
      if (world.composer) world.composer.render(); else renderer.render(scene, camera);
      css.render(cssScene, camera);
      handGL.render(handScene, camera);
      phoneCss.render(phoneScene, camera);
    };
    const busyUntil = () => Math.max(settleAt, phoneT0 + 0.6, ...[...lift.values()].map(L => L[3] + 0.4));
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
    css.domElement.addEventListener('click', e => {
      const card = e.target.closest('.r3t-card');
      if (card) {
        const id = card.dataset.id;
        const L = lift.get(id);
        const cur = L ? L[0] : 0;
        const target = cur > 0.5 ? 0 : 1;
        if (focusId && focusId !== id) { const F2 = lift.get(focusId); if (F2) { F2[2] = F2[0]; F2[1] = 0; F2[3] = tNow; } }
        lift.set(id, [cur, target, cur, tNow]);
        focusId = target ? id : null;
        if (hooks.cardTap) hooks.cardTap(id);
        wake();
        return;
      }
      if (e.target.closest('.r3t-run')) { if (hooks.run) hooks.run(); return; }
      const tile = e.target.closest('.r3t-ph-tile');
      if (tile) { if (hooks.openView) hooks.openView(tile.dataset.view); return; }
      if (e.target.closest('.r3t-ph-put')) { phoneFrom = phoneK; phoneTarget = 0; phoneT0 = tNow; wake(); return; }
      if (e.target.closest('.r3t-phone') && phoneK < 0.5) { phoneFrom = phoneK; phoneTarget = 1; phoneT0 = tNow; wake(); }
    });
    css.domElement.addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('r3t-card')) { e.preventDefault(); e.target.click(); }
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
      pickUpPhone(on = true) { phoneFrom = phoneK; phoneTarget = on ? 1 : 0; phoneT0 = tNow; wake(); },
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
