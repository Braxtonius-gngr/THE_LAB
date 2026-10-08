// THE TABLE: where the landing flies to (three.js + CSS3D).
//
// After the roll intro has floated up, a tap on the landing starts one
// continuous shot: the camera rises out of the float and glides across the
// room, down into the player's seat at a private high-limit card table
// ('card', the one destination).
//
// The seat is the home screen of the Refinement x Realization skin. The rail
// in front of you holds the clock and the Daily Run; the deck waits in its
// shoe. The dealer is a machine in white ceramic - a torso with two arms -
// that rises out of a port in the felt: it deals your ready platforms onto
// the felt as cards, hand to hand, face down, and turns them (the higher a
// platform's tier, the finer its card), then stays up on the table, waiting
// on you - more and more plainly while a card you could collect sits there.
// Tap a card to lift it and read its Keen Info. Your phone lies by the
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
import { studioEnvironment, dressTrim, trimBaseOf } from './intro.mjs';
import { retile, canvasTex, embossTex, seeded, wrapNoise, dataTex, finish, finished } from './finish.mjs';

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
// How much of the room's even light (the intro's mirror of a studio) is
// left once you are seated at a home: the home's own lamp lights it, so
// that is what pools; the rest of the room falls back. Every home uses it.
const ROOM_ENV = 0.4;
// Where the dealt cards lie: three to a row, rows away from the player.
const SLOTS = { cols: 3, gapX: 1.3, gapZ: 2.4, max: 9 };
// The destination's layout in its seat frame: the seat camera (portrait,
// landscape - on a phone, wide enough to hold the whole chip rack and the
// dealer's arms at work above the cards), the first row of cards, the
// rail's panel, the shoe and the discard rack.
const LAYOUT = {
  card: {
    view: [{ eye: [0, 54, -22], aim: [0, 0, 24], fov: 54 }, { eye: [0, 46, -24], aim: [0, 0, 27], fov: 44 }],
    z0: 18.5, rail: { x: 3.4, y: 7.2, z: -4.2, tilt: 28 }, shoe: [-15.5, 54], discard: [16, 55]
  }
};
// The shot's timings (seconds from the tap).
const T = { cardFly: 4.8, uiIn: 0.6 };
// The deal, by the dealer's two arms: seconds per card, and its phases. The
// shoe's arm reaches into the shoe (the first time from the upright it rose
// in), draws the card out by its end, swings back and flicks it across to
// the other hand - in front of the machine's body, never over it - and the
// other hand, open where it will arrive, closes on it and gives a little
// with it. It carries the card to its place face down (a length short of
// it) and settles it onto its near edge; the push lifts it over onto its
// face-up place, and it finishes the fall on its own while the hand goes
// back to catch the next. A card flicked over (a sweep, a cascade, a
// knock) turns on its own; the spread's backs are shown a beat first. At
// the end both hands go down to rest.
// (the machine's pace, in seconds: quick enough to be just past what a
// person could do - see makeDeal)
const DEAL = { first: 0.72, grab: 0.24, pull: 0.07, windup: 0.2, beat: 0.05, flick: 0.085, follow: 0.12, give: 0.13, carry: 0.3,
  settle: 0.07, push: 0.09, fall: 0.22, back: 0.24, turn: 0.34, show: 0.55, sweep: 0.14, cascade: 0.075, rest: 0.6,
  stack: 0.26, spread: 0.46, flop: 0.03, wave: 55 };
// The ways it deals (a deal picks one, or ?deal= names it):
//   single  - one card at a time: flicked across, carried and pushed over
//   rows    - a row's cards laid face down across it one by one, then
//             swept over in one pass
//   columns - the same by columns, the column swept from front to back
//   spread  - every card laid face down, a beat to see the backs, then one
//             touch and the whole spread turns over in a cascade
//   flop    - a row at a time, as a hold'em dealer turns the flop: three
//             cards laid in a stack, slid out along the row in one stroke
//             of the fingers, and all three turned over together
//   pitch   - the shoe's hand alone, from the side of the table: each card
//             flicked low along its row, landing short and sliding into its
//             place face down; then two knocks on the felt and the backs
//             turn over in a wave out from them
const DEAL_STYLES = ['single', 'rows', 'columns', 'spread', 'flop', 'pitch'];
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
function sweep(path, profile, tile, caps = false, open = false) {
  const pos = [], uv = [], idx = [];
  // (open: the profile is a line, not a loop - a ribbon, one face, no
  // closing edge back to its start)
  const n = path.length, m = open ? profile.length - 1 : profile.length;
  const plen = [0];
  for (let j = 1; j <= m; j++) { const a = profile[j - 1], b = profile[j % profile.length]; plen.push(plen[j - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  let along = 0;
  for (let i = 0; i < n; i++) {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0], tz = b[1] - a[1];
    const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    const nx = tz, nz = -tx;             // right of the direction of travel
    if (i > 0) along += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    for (let j = 0; j <= m; j++) {
      const [o, u] = profile[j % profile.length];
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
// A card's shadow as an alpha map: the card's rounded outline in white on
// black, blurred by `blur` cm, with room round it for the blur (`pad` cm).
// (A shape drawn off the canvas casts its blurred shadow onto it: the one
// blur every browser's canvas has.)
// `rim`: only what falls outside the card's own edge - a contact shadow is
// a line round the card, and the card hides the rest of it anyway.
// `grow`: the shape spread by that many cm before it is blurred, so its
// darkest is at the card's very edge, not half-way out (a card flat on the
// cloth shuts the light out right to its edge: the line there is black).
function cardShadowTex(blur, pad, rim = false, grow = 0) {
  const k = 24, W = Math.round((CARD.w + 2 * pad) * k), H = Math.round((CARD.h + 2 * pad) * k);
  const tex = canvasTex(W, H, (c, w, h) => {
    c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
    const card = (x, y, cw, ch, r) => { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + cw, y, x + cw, y + ch, r); c.arcTo(x + cw, y + ch, x, y + ch, r); c.arcTo(x, y + ch, x, y, r); c.arcTo(x, y, x + cw, y, r); c.closePath(); c.fill(); };
    c.save();
    c.shadowColor = '#fff'; c.shadowBlur = blur * k * 2; c.shadowOffsetX = w * 4;
    c.fillStyle = '#fff';
    card((pad - grow) * k - w * 4, (pad - grow) * k, (CARD.w + 2 * grow) * k, (CARD.h + 2 * grow) * k, (0.36 + grow) * k);
    c.restore();
    if (rim) { const i = 0.03 * k; c.fillStyle = '#000'; card(pad * k + i, pad * k + i, CARD.w * k - 2 * i, CARD.h * k - 2 * i, 0.36 * k - i); }
  });
  tex.colorSpace = THREE.NoColorSpace; tex.anisotropy = 4;
  return { tex, pad };
}
// The house's finished set: the intro's materials, the brass brushed (a
// copy: the intro's own brass is left as it is).
function fineSet(set) {
  const brass = finished(set.brass.clone(), 'brushed', 1, 1, 0.18);
  brass.roughness = 0.34;
  return Object.assign({}, set, { brass });
}
// The same metal polished: a mirror, no brushing in it - for what a hand
// rubs or a jeweller buffs (knobs, rollers, rods, feet, bezels), beside
// the brushed plates, so the two finishes read against each other.
function polishedOf(mat, roughness = 0.1) {
  const m = mat.clone();
  m.normalMap = null; m.roughnessMap = null; m.roughness = roughness;
  m.needsUpdate = true;
  return m;
}
// Glass and acrylic as they are: what shows on a clear sheet is what it
// reflects, over whatever is behind it - more of it at a grazing angle
// (Fresnel), so its faces seen edge-on, and its cut and polished edges,
// go bright and dense while its face seen square on stays clear. (A
// transparent material otherwise dims its own reflections by its opacity:
// here the reflection sets how opaque it is.) edge: its opacity seen
// edge-on; lift: how strongly a reflection makes it opaque.
function glassy(mat, edge = 0.85, lift = 1.5) {
  mat.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `
      float gFres = pow(1.0 - saturate(abs(dot(normal, normalize(vViewPosition)))), 3.0);
      diffuseColor.a = clamp(max(mix(diffuseColor.a, ${edge.toFixed(3)}, gFres), dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722)) * ${lift.toFixed(3)}), 0.0, 1.0);
      #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => `glassy-${edge}-${lift}`;
  mat.needsUpdate = true;
  return mat;
}
// Several small parts as one mesh (one draw): [[geometry, matrix], ...],
// each placed by its matrix; positions, normals and uvs.
function merged(parts) {
  const pos = [], nor = [], uv = [];
  parts.forEach(([geo, mx]) => {
    const g = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(mx);
    pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); uv.push(...g.attributes.uv.array);
    g.dispose();
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return out;
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
// (opts, for the landing's blackjack table - the same salon table, dressed
// as its own: `rail`, the rail's leather colour; `mark`, its own lettering
// in place of the wordmark: { w, h, z } in cm, the canvas { cw, ch } and
// `paint(kl)`, drawn as paintMark is, white on black, kl the keyline)
function buildCardTable(set, opts = {}) {
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
  // (the dealer's port: a hole through the felt and the table, closed by
  // its iris - see buildPort)
  const hole = new THREE.Path();
  hole.absarc(PORT.x, -PORT.z, PORT.r, 0, Math.PI * 2, true);
  shape.holes.push(hole);
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
  // (a salon table's base is finished like its top: a polished brass shoe
  // where the column stands on the foot - it closes the column's last few
  // centimetres down to it - and a collar where it meets the top; from
  // across the room, gold in the dark under the table)
  const collar = polishedOf(set.brass, 0.16);
  [[-75.45, 12.15, 12.6, 5.1], [-9.6, 9.2, 9.7, 1.0]].forEach(([y, r0, r1, h]) => {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, 48), collar); c.position.set(0, y, b * 0.55); g.add(c);
  });
  // The padded rail round the arc: stitched leather over a walnut edge.
  // (full-grain calf over the padding, as a saddler covers a rail: a fine,
  // shallow grain, a pebble under a millimetre, under a soft semi-gloss -
  // the shot's padded map at the rail's scale read as cork pinched in, and
  // a deeper grain in the lamp as suede)
  const cushionMat = set.cushion.clone();
  if (opts.rail != null) cushionMat.color.setHex(opts.rail);
  cushionMat.normalMap = null;
  cushionMat.envMapIntensity = 0.25; cushionMat.roughness = 0.52;
  const ellipse = [];
  for (let j = 0; j < 40; j++) { const t = (j / 40) * 2 * Math.PI; ellipse.push([5.6 + 5.8 * Math.cos(t), 3.1 + 4.3 * Math.sin(t)]); }
  // (the crest burnished where forearms rest on it, as a saddler's rail
  // wears: the leather there rubbed smooth and a little glossy, the sides
  // left dull - a roughness map across the section, u round it by length)
  {
    const len = [0];
    for (let j = 1; j <= ellipse.length; j++) { const p0 = ellipse[j - 1], p1 = ellipse[j % ellipse.length]; len.push(len[j - 1] + Math.hypot(p1[0] - p0[0], p1[1] - p0[1])); }
    const deg = u => { const at = u * len[ellipse.length]; let j = 0; while (j < ellipse.length - 1 && len[j + 1] < at) j++; return (j + (at - len[j]) / (len[j + 1] - len[j])) / ellipse.length * 360; };
    const rub = canvasTex(256, 4, (c, W, H) => {
      for (let x = 0; x < W; x++) {
        const d = deg((x + 0.5) / W), k = Math.exp(-Math.pow((d - 84) / 26, 2));
        const v = Math.round(255 * (1.08 - 0.26 * k) / 1.1);
        c.fillStyle = `rgb(${v},${v},${v})`; c.fillRect(x, 0, 1, H);
      }
    });
    rub.colorSpace = THREE.NoColorSpace; rub.wrapT = THREE.RepeatWrapping;
    cushionMat.roughnessMap = rub; cushionMat.roughness = 0.46 * 1.1;
    // (the grain: u round the section, about 32 cm; v along, 14.45 cm a
    // tile - so 1.6 cm a pebble tile either way)
    finished(cushionMat, 'pebble', 32 / 1.6, 14.45 / 1.6, 0.07);
  }
  const railGeo = sweep(rim, ellipse, 14.45, true);
  const rail = new THREE.Mesh(railGeo, cushionMat);
  rail.castShadow = true; rail.receiveShadow = true; g.add(rail);
  railGeo.userData.caps.forEach(cg => g.add(new THREE.Mesh(cg, cushionMat)));
  // Figured black walnut, as a cabinetmaker finishes a salon table: open
  // pore under a satin catalysed lacquer. Across the room, a warm dark edge
  // with one long highlight; at arm's length the figure - dark streaks and
  // lighter bands running along the rail; pinched in, the pores, sunk
  // under the lacquer, which lies smooth over them and mirrors the lamp as
  // a soft band (its own faint peel). The pores are the wood's normal map
  // (see finish('pores')); the board's broad figure is its colour.
  const woodMat = walnutOf(set, 60, 15);
  // (the edge's u runs round its section; the grain wants to run along the
  // rail, so the section is walked in v: see the swapped tile below)
  const edgeSection = [[0.5, -0.6], [12.2, -0.6], [12.8, -1.6], [12.8, -8.2], [12.2, -9.2], [0.5, -9.2]];
  const edgeGeo = sweep(rim, edgeSection, 60);
  { const uv = edgeGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i), uv.getX(i) * 26 / 15); }
  const edge = new THREE.Mesh(edgeGeo, woodMat);
  edge.receiveShadow = true; g.add(edge);
  // a brass line let into the edge (the trim's: it outlines the table, so
  // it takes the trim's metal with the band - see TRIMS in intro.mjs)
  const trimLine = set.brass.clone();
  const lineGeo = sweep(rim, [[12.85, -3.0], [13.05, -3.0], [13.05, -3.5], [12.85, -3.5]], 30);
  g.add(new THREE.Mesh(lineGeo, trimLine));
  // The gold filigree inlaid round the felt, inside the rail.
  // (blended at its edges, not cut at a threshold: cut, its fine scrolls
  // break up into a shimmer of jagged pixels as the rail recedes)
  const satinGold = trimBaseOf(set.gold);
  satinGold.roughness = 0.5; satinGold.envMapIntensity = 0.6; satinGold.color = new THREE.Color(0.82, 0.78, 0.72);
  satinGold.alphaTest = 0; satinGold.transparent = true; satinGold.depthWrite = false;
  const goldBand = new THREE.Mesh(strip(rim, -2.6, -5.0, 0.012, 19.2), satinGold);
  goldBand.receiveShadow = true; goldBand.renderOrder = 1; g.add(goldBand);
  // a brass line let into the felt either side of it
  [[-2.42, -2.54], [-5.06, -5.18]].forEach(([o0, o1]) => { const l = new THREE.Mesh(strip(rim, o0, o1, 0.014, 20), trimLine); l.receiveShadow = true; g.add(l); });
  // (dressed as the shot's band is: the trim picked in Settings)
  const trimMats = { band: [satinGold], line: [trimLine] };
  dressTrim(trimMats, set.gold.userData.trim || 'gold');
  // The rail's stitching, as a saddler sews it: two rows of waxed linen
  // thread, gold, either side of the crest, saddle stitched through holes
  // pricked with a diamond iron at 4 mm. Across the room, two fine gold
  // lines; at arm's length, a row of stitches each laid at a slant (a
  // saddle stitch's lean), not dashes; pinched in, each stitch a twisted
  // cord - its strands catching the lamp in a diagonal, round across its
  // width - sunk into the leather at both ends, where the hole pulls the
  // leather down into a small dark pit. (u across the row, v along it,
  // one stitch a tile.)
  const paintStitch = relief => (c, W, H) => {
    c.clearRect(0, 0, W, H);
    if (relief) { c.fillStyle = '#000'; c.fillRect(0, 0, W, H); }
    c.save(); c.translate(W / 2, H / 2); c.rotate(-0.42);
    const L = H * 0.4, T = W * 0.2;
    // (the cord: a lozenge, round across, darker at its ends where it dives)
    const g = c.createLinearGradient(-T, 0, T, 0);
    if (relief) { g.addColorStop(0, '#333'); g.addColorStop(0.5, '#fff'); g.addColorStop(1, '#333'); }
    else { g.addColorStop(0, '#6e5224'); g.addColorStop(0.45, '#d9b56a'); g.addColorStop(0.6, '#c49a50'); g.addColorStop(1, '#5c431c'); }
    c.fillStyle = g;
    c.beginPath(); c.moveTo(0, -L); c.bezierCurveTo(T * 1.1, -L * 0.45, T * 1.1, L * 0.45, 0, L); c.bezierCurveTo(-T * 1.1, L * 0.45, -T * 1.1, -L * 0.45, 0, -L); c.fill();
    // (the twist: strands crossing the cord at a steep diagonal)
    c.strokeStyle = relief ? 'rgba(0,0,0,0.45)' : 'rgba(60,40,14,0.55)'; c.lineWidth = W * 0.035;
    for (let k = -4; k <= 4; k++) { const y = k * L * 0.21; c.beginPath(); c.moveTo(-T * 0.9, y + T * 0.55); c.lineTo(T * 0.9, y - T * 0.55); c.stroke(); }
    c.restore();
    // (the pricked holes, each end: the leather pulled down into them)
    if (!relief) {
      [[0.5 + 0.17, 0.5 - 0.37], [0.5 - 0.17, 0.5 + 0.37]].forEach(([x, y]) => {
        const r = c.createRadialGradient(x * W, y * H, 0, x * W, y * H, W * 0.16);
        r.addColorStop(0, 'rgba(0,0,0,0.9)'); r.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = r; c.fillRect(0, 0, W, H);
      });
    }
  };
  const stitch = canvasTex(64, 128, paintStitch(false));
  stitch.wrapS = stitch.wrapT = THREE.RepeatWrapping; stitch.anisotropy = 8;
  const stitchMat = new THREE.MeshStandardMaterial({ map: stitch, normalMap: embossTex(canvasTex(64, 128, paintStitch(true)).image, 2.2), transparent: true, alphaTest: 0.08, roughness: 0.55, metalness: 0.2, envMapIntensity: 0.8, side: THREE.DoubleSide });
  stitchMat.normalMap.wrapS = stitchMat.normalMap.wrapT = THREE.RepeatWrapping;
  [66, 114].forEach(deg => {
    const t0 = (deg - 0.6) * DEG, t1 = (deg + 0.6) * DEG;
    const at = t => [5.6 + 5.82 * Math.cos(t), 3.1 + 4.32 * Math.sin(t)];
    const row = new THREE.Mesh(sweep(rim, [at(t0), at(t1)], 0.4, false, true), stitchMat);
    g.add(row);
  });
  // The printed felt: a fine gold arc, the house line round it, the
  // wordmark by the dealer.
  // (alpha maps read the green channel: white ink on a black ground, so
  // the edges keep their coverage, and read as data, not colour)
  // (kl: drawn fatter by kl cm all round - the dark keyline set under the
  // gold on a light felt, so the print reads as crisply on tan or ivory
  // as it does on black)
  const paintPrint = kl => (c, W, H) => {
    // the canvas, as the player sees it: its left is x = +84 (their left),
    // its top z = 80 (the dealer's side)
    const px = x => ((84 - x) / 168) * W, pz = z => ((80 - z) / 84) * H, s = W / 168;
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    c.strokeStyle = '#fff'; c.fillStyle = '#fff'; c.lineJoin = 'round';
    c.lineWidth = (0.22 + 2 * kl) * s;
    const ell = (aa, bb) => { c.beginPath(); for (let i = 0; i <= 200; i++) { const th = Math.PI / 2 - (Math.PI * i) / 200; const x = aa * Math.sin(th), z = b - bb * Math.cos(th); if (i) c.lineTo(px(x), pz(z)); else c.moveTo(px(x), pz(z)); } c.stroke(); };
    // (the house line runs left to right as the player reads it: from x = +ra;
    // it and the diamonds keep below the cards' near row)
    ell(a - 11.4, b - 11.4);
    ell(a - 12.1, b - 12.1);
    // a string of small diamonds along the arc between the band and the
    // fine lines (small type would blur at the print's resolution and the
    // angle it is seen at)
    const ra = a - 8, rb = b - 8;
    c.lineWidth = 2 * kl * s;
    for (let i = 1; i < 18; i++) {
      const th = -Math.PI / 2 + (Math.PI * i) / 18;
      const x = ra * Math.sin(th), z = b - rb * Math.cos(th), d = 0.55 * s;
      c.save(); c.translate(px(x), pz(z)); c.rotate(-th);
      c.beginPath(); c.moveTo(0, -d); c.lineTo(d * 0.62, 0); c.lineTo(0, d); c.lineTo(-d * 0.62, 0); c.closePath(); c.fill();
      if (kl) c.stroke();
      c.restore();
    }
  };
  const print = canvasTex(2048, 1024, paintPrint(0)), printKey = canvasTex(2048, 1024, paintPrint(0.11));
  // The gold is hot-foil stamped into the cloth, as a bookbinder tools gold
  // into a cloth binding: a heated die presses the foil down into the nap,
  // so it is let into the felt rather than printed on it, and it takes the
  // weave. Across the room: gold lettering and a fine gold arc. At arm's
  // length: the letters sit a hair below the cloth round them, a soft wall
  // of pressed nap at their edges; the lamp does not lie on them as one
  // flat sheen (that read as a lit sign) but breaks up across the weave.
  // Pinched in: the weave in the foil, thread by thread, each crossing its
  // own small highlight, and the foil a little rougher here and smoother
  // there, as foil on cloth is.
  // (the weave, as the foil takes it: a plain weave, a thread about half a
  // millimetre, eight threads a tile - see weaveTex)
  const weave = weaveTex();
  const foilRough = retile(finish('clay').rough, 1, 1);
  // the wordmark, by the dealer: 36 x 9 cm at 57 px/cm
  const WM = opts.mark ? { w: opts.mark.w, h: opts.mark.h, z: opts.mark.z } : { w: 36, h: 9, z: b - 23 };
  const paintMark = opts.mark ? opts.mark.paint : kl => (c, W, H) => {
    const s = W / WM.w;
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#fff'; c.strokeStyle = '#fff'; c.lineJoin = 'round';
    c.translate(W / 2, H / 2);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    const text = (t, y) => { c.fillText(t, 0, y); if (kl) c.strokeText(t, 0, y); };
    c.lineWidth = 2 * kl * s;
    c.font = `700 ${2.7 * s}px Georgia, "Times New Roman", serif`;
    text('Daily Roll Over', -1.5 * s);
    c.font = `600 ${0.9 * s}px Georgia, "Times New Roman", serif`;
    c.lineWidth = 1.4 * kl * s;
    text('R E F I N E M E N T   ×   R E A L I Z A T I O N', 2.1 * s);
    c.lineWidth = (0.13 + 2 * kl) * s;
    c.beginPath(); c.moveTo(-13 * s, 0.45 * s); c.lineTo(13 * s, 0.45 * s); c.stroke();
    c.lineWidth = 2 * kl * s;
    [-13.6, 13.6].forEach(x => { const d = 0.32 * s; c.beginPath(); c.moveTo(x * s - d, 0.45 * s); c.lineTo(x * s, 0.45 * s - d * 0.6); c.lineTo(x * s + d, 0.45 * s); c.lineTo(x * s, 0.45 * s + d * 0.6); c.closePath(); c.fill(); if (kl) c.stroke(); });
  };
  const [MW, MH] = opts.mark ? [opts.mark.cw, opts.mark.ch] : [2048, 512];
  const mark = canvasTex(MW, MH, paintMark(0)), markKey = canvasTex(MW, MH, paintMark(0.12));
  [print, printKey, mark, markKey].forEach(t => { t.colorSpace = THREE.NoColorSpace; t.anisotropy = 16; });
  // (gold foil pressed into the felt, not ink: it catches the lamp)
  const inkMat = new THREE.MeshStandardMaterial({ color: 0xc9a75a, alphaMap: print, transparent: true, depthWrite: false, metalness: 0.8, roughness: 0.38, envMapIntensity: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  // (the arc and its diamonds: the weave at its own scale over the 168 x 84
  // cm plane - its own repeat, apart from the artwork's - and the foil's
  // roughness wandering at a centimetre and a half)
  inkMat.normalMap = weave.clone(); inkMat.normalMap.repeat.set(168 / 0.45, 84 / 0.45); inkMat.normalMap.needsUpdate = true;
  inkMat.normalScale = new THREE.Vector2(0.7, 0.7);
  inkMat.roughnessMap = foilRough.clone(); inkMat.roughnessMap.repeat.set(168 / 1.5, 84 / 1.5); inkMat.roughnessMap.needsUpdate = true;
  const ink = new THREE.Mesh(new THREE.PlaneGeometry(168, 84), inkMat);
  ink.rotation.x = -Math.PI / 2; ink.rotation.z = Math.PI; ink.position.set(0, 0.006, 38); ink.receiveShadow = true; ink.renderOrder = 0.5; g.add(ink);
  const markMat = inkMat.clone(); markMat.alphaMap = mark;
  // (the die's impression: the letters pressed a hair into the cloth, their
  // edges a soft wall, and inside them the weave the foil took - one height
  // field, drawn at the lettering's own resolution, a fifth of a millimetre
  // a pixel)
  markMat.normalMap = embossTex(stampTex(mark.image), 2.4, 0); markMat.normalScale = new THREE.Vector2(1, 1);
  markMat.roughnessMap = foilRough.clone(); markMat.roughnessMap.repeat.set(WM.w / 1.5, WM.h / 1.5); markMat.roughnessMap.needsUpdate = true;
  markMat.roughness = 0.44;
  const markMesh = new THREE.Mesh(new THREE.PlaneGeometry(WM.w, WM.h), markMat);
  markMesh.rotation.x = -Math.PI / 2; markMesh.rotation.z = Math.PI; markMesh.position.set(0, 0.008, WM.z); markMesh.receiveShadow = true; markMesh.renderOrder = 0.5; g.add(markMesh);
  // The keylines: the print's own shapes, fattened, in a dark umber ink
  // under the gold - an engraver's keyline. On black felt there is nothing
  // for them to do; on a light felt they give the gold an edge to read by.
  // (Drawn first, a hair under the gold, following the wordmark wherever
  // it is moved.)
  const keyMat = new THREE.MeshStandardMaterial({ color: 0x1a1108, roughness: 0.92, metalness: 0, alphaMap: printKey, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -0.5, polygonOffsetUnits: -0.5 });
  const keys = [[ink, printKey], [markMesh, markKey]].map(([m, t]) => {
    const km = keyMat.clone(); km.alphaMap = t;
    const k = new THREE.Mesh(m.geometry, km); k.position.z = -0.001; k.receiveShadow = true; k.renderOrder = 0.25;
    m.add(k);
    return k;
  });
  // (how light the felt is, 0 black to 1 ivory: the keyline's weight, and
  // the gold made to read on it - a little less mirror and more of its own
  // colour, as foil on a light cloth is seen against it rather than in it)
  const printFor = light => {
    keys.forEach(k => { k.visible = light > 0.01; k.material.opacity = Math.min(1, 0.55 + 0.45 * light); });
    [inkMat, markMat].forEach(m => { m.metalness = 0.8 - 0.3 * light; m.color.setHex(light > 0.01 ? 0xd9b563 : 0xc9a75a); });
  };
  printFor(feltMat.userData.feltLight || 0);
  g.userData.printFor = printFor;
  g.userData.mark = markMesh;
  // The dealer's edge: a walnut bar across the straight side, with the
  // chip tray let into it.
  const barLen = 2 * a + 26;
  const barGeo = new THREE.BoxGeometry(barLen, 10.2, 12);
  { const uv = barGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * barLen / 60, uv.getY(i) * 12 / 15); }
  const bar = new THREE.Mesh(barGeo, woodMat);
  bar.position.set(0, -4, b + 6); bar.castShadow = true; bar.receiveShadow = true; g.add(bar);
  g.add(chipTray(set));
  return { group: g, rim, focus: [0, 0, 30], felt: feltMat, trim: trimMats };
}

// A plain weave as a normal map: eight threads a tile each way, over and
// under in turn, each round across its width (a tile is set to 4.5 mm where
// it is used: a thread a little over half a millimetre).
let WEAVE = null;
function weaveTex() {
  if (WEAVE) return WEAVE;
  const N = 64, P = 8, h = new Float32Array(N * N), rnd = seeded(71);
  const jit = Float32Array.from({ length: P * P }, () => rnd() * 0.25);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / P, v = y / P, iu = Math.floor(u), iv = Math.floor(v), fu = u - iu, fv = v - iv;
    // (where the weft crosses over, the thread across is seen; else the warp)
    const over = (iu + iv) % 2 === 0;
    h[y * N + x] = (over ? Math.sqrt(Math.sin(Math.PI * fv)) : Math.sqrt(Math.sin(Math.PI * fu))) * (0.75 + jit[(iv % P) * P + (iu % P)]);
  }
  const at = (x, y) => h[((y + N) % N) * N + (x + N) % N];
  return (WEAVE = dataTex(N, d => {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 1.6, dy = (at(x, y + 1) - at(x, y - 1)) * 1.6, l = Math.hypot(dx, dy, 1), i = (y * N + x) * 4;
      d[i] = (-dx / l * 0.5 + 0.5) * 255; d[i + 1] = (dy / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
  }));
}
// The stamp's height field from white-on-black lettering (a canvas the
// lettering's size): the cloth round the letters at its own height, the
// letters pressed into it (their edges softened over a pixel or so, as the
// nap gives at the die's edge), and inside them the weave pressed into the
// foil, three pixels a thread.
function stampTex(src) {
  const W = src.width, H = src.height;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.filter = 'blur(1.1px)'; x.drawImage(src, 0, 0); x.filter = 'none';
  const img = x.getImageData(0, 0, W, H), d = img.data, rnd = seeded(97);
  const jit = Float32Array.from({ length: 4096 }, () => rnd());
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const i = (py * W + px) * 4, m = d[i + 1] / 255;
    const u = px / 3.1, v = py / 3.1, iu = Math.floor(u), iv = Math.floor(v);
    const over = (iu + iv) % 2 === 0;
    const w = (over ? Math.sin(Math.PI * (v - iv)) : Math.sin(Math.PI * (u - iu))) * (0.8 + 0.4 * jit[((iv & 63) << 6) | (iu & 63)]);
    const hgt = 0.62 - 0.2 * m + m * 0.085 * w;
    d[i] = d[i + 1] = d[i + 2] = Math.round(Math.max(0, Math.min(1, hgt)) * 255); d[i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return c;
}

// The house's walnut on a part whose UVs run `lu` cm along the grain (u)
// and `lv` cm across it per unit (see buildCardTable).
function walnutOf(set, lu, lv) {
  const m = set.wood.clone();
  m.map = retile(set.tex.walnut, 1, 1);
  m.map.repeat.set(lu / 60, lv / 15);
  m.normalMap = null;
  // (the pores at 2 cm a tile; the lacquer's peel at 3)
  finished(m, 'pores', lu / 2, lv / 2, 0.55);
  m.clearcoat = 0.7; m.clearcoatRoughness = 0.14;
  finished(m, 'peel', lu / 3, lv / 3, 0.012);
  return m;
}

// The chip float, as a dealer keeps it - held to a float from a Macau
// private salon: the rack a cabinetmaker's, in black piano lacquer with
// solid brass end caps, the chips Paulson clay.
//   Across the room: a black bar with ten columns of colour, its brass caps
//   and rails catching the lamp.
//   At arm's length: the lacquer mirrors the lamp as one clean soft band
//   over black (it is polished flat - no visible peel); the brass caps are
//   polished, the value strip brushed; each chip's edge shows its inserts,
//   clay set into clay, the columns never quite in step.
//   Pinched in: the values are cut into the strip, the light running along
//   the walls of each figure; each cap is held by two slotted screws, the
//   slots turned every which way, as they came to rest when driven; the
//   inserts' edges are a hair soft, as clay pressed into clay is, with the
//   grain of the clay across them.
//   Contact: the chips stand in their troughs and lean on each other; the
//   front one leans back on its row; each column shadows the trough under
//   it, darkest where the chips meet the lacquer.
//   Motion: none - the dealer draws cards, not chips.
// A black lacquer rack let into the
// dealer's bar, its top scalloped into ten troughs that run toward the
// player, the chips standing on edge in them by colour - more of the small
// ones, fewer of the large - each trough's value engraved on a brass strip
// along the front, brass rails along the top. A chip is a clay disc with
// eight inserts round its edge and the house's coin on its faces
// (assets/intro3d/icons). All the chips of a colour are one instanced mesh.
const CHIPS = ['onyx', 'oxblood', 'emerald', 'ivory', 'plum', 'gold'];
const chipFaces = {};
// (their loads, for the table to wait on before it is made ready: see
// prepareTable)
const chipLoads = [];
function chipFace(name) {
  if (!chipFaces[name]) {
    let done;
    chipLoads.push(new Promise(res => { done = res; }));
    const t = new THREE.TextureLoader().load(asset(`icons/chip-${name}.webp`), done, undefined, done);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    chipFaces[name] = t;
  }
  return chipFaces[name];
}
// A chip's materials (see chipTray): its edge, the clay with eight inserts
// round it, each pressed in by hand a little off the last; its faces, the
// house coin. Made new each time (whoever builds with them frees them).
const CHIP_SPOTS = { onyx: ['#121214', '#e8e2d2', '#b8914a'], oxblood: ['#5b1622', '#f1e7d0', '#c9a45a'], emerald: ['#1d3a2a', '#f1e7d0', '#c9a45a'], ivory: ['#e6dfcb', '#6b1320', '#b8914a'], plum: ['#3a2352', '#f1e7d0', '#c9a45a'], gold: ['#b58a2e', '#1a1208', '#f6e2a8'] };
function chipMats(name) {
  const [base, spot, line] = CHIP_SPOTS[name];
  const rs = seeded(name.length * 131 + name.charCodeAt(0));
  const side = canvasTex(2048, 64, (c, Wc, Hc) => {
    c.fillStyle = base; c.fillRect(0, 0, Wc, Hc);
    // (an insert is clay pressed into clay: its edges a hair soft, each
    // placed by hand a little off the last)
    c.filter = 'blur(0.8px)';
    for (let k = 0; k < 8; k++) {
      const x0 = k * Wc / 8 + Wc / 32 + (rs() - 0.5) * 6, w = Wc / 16 + (rs() - 0.5) * 4;
      c.fillStyle = spot; c.fillRect(x0, -2, w, Hc + 4);
      c.fillStyle = base; c.fillRect(x0 + w * 0.3, -2, w * 0.08, Hc + 4); c.fillRect(x0 + w * 0.62, -2, w * 0.08, Hc + 4);
      c.fillStyle = line; c.fillRect(x0 + w + Wc / 64 - 2, Hc * 0.33, 5, Hc * 0.34);
    }
    c.filter = 'none';
    const gr = c.createLinearGradient(0, 0, 0, Hc); gr.addColorStop(0, 'rgba(0,0,0,0.35)'); gr.addColorStop(0.2, 'rgba(0,0,0,0)'); gr.addColorStop(0.8, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.35)');
    c.fillStyle = gr; c.fillRect(0, 0, Wc, Hc);
  });
  // (the clay's grain at 2 cm a tile: round the edge 12.3 cm, across it
  // 0.33; on a face, 3.9 across)
  const sideM = finished(new THREE.MeshStandardMaterial({ map: side, roughness: 0.6 }), 'clay', 6, 0.16, 0.45);
  const faceM = finished(new THREE.MeshStandardMaterial({ map: chipFace(name), roughness: 0.5, metalness: 0.12 }), 'clay', 2, 2, 0.35);
  return [sideM, faceM];
}
function chipTray(set) {
  const g = new THREE.Group();
  // (piano lacquer: rubbed out and polished, so the coat is a mirror - its
  // peel all but gone, a whisper at 1 cm - over a black that is soft under
  // it; before, a coarse peel read as crumpled foil pinched in)
  const lacquer = finished(new THREE.MeshPhysicalMaterial({ color: 0x0b0a0a, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.1 }), 'peel', 1, 1, 0.01);
  // (troughs deeper than their radius above the top: a chip stands in its
  // trough to a little past half its height)
  const TR = { n: 10, pitch: 5.95, r: 2.1, sink: 0.55, len: 10.4, h: 3.1 };
  const W = TR.n * TR.pitch + 1.4;
  // the rack: its section across the troughs, drawn and extruded along z
  const prof = new THREE.Shape();
  prof.moveTo(-W / 2, 0); prof.lineTo(W / 2, 0); prof.lineTo(W / 2, TR.h);
  const cxOf = i => -W / 2 + 0.7 + TR.pitch * (i + 0.5);
  for (let i = TR.n - 1; i >= 0; i--) {
    const cx = cxOf(i);
    const a0 = Math.asin(TR.sink / TR.r);
    prof.lineTo(cx + TR.r * Math.cos(a0), TR.h);
    prof.absarc(cx, TR.h - TR.sink, TR.r, a0, Math.PI - a0, true);
  }
  prof.lineTo(-W / 2, TR.h); prof.closePath();
  const rackGeo = new THREE.ExtrudeGeometry(prof, { depth: TR.len, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.12, bevelSegments: 2, curveSegments: 18 });
  rackGeo.translate(0, 0, -TR.len / 2);
  const rack = new THREE.Mesh(rackGeo, lacquer); rack.receiveShadow = true; rack.castShadow = true;
  rack.position.y = 0.4; g.add(rack);
  const top = 0.4 + TR.h;
  // brass: a rail along the back and the front of the top, end plates
  [-1, 1].forEach(sz => { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, W + 0.2, 12), set.brass); r.rotation.z = Math.PI / 2; r.position.set(0, top + 0.06, sz * (TR.len / 2 + 0.05)); g.add(r); });
  // the end caps: solid brass, polished, a bevelled slab each end, held by
  // two slotted screws (each slot where it came to rest)
  // (buffed, not mirror-polished: a mirror here only shows the dark room
  // and reads as a black block; a buff keeps the brass's own warmth, with
  // a soft run of light along its bevel)
  const capMat = set.brass.clone(); capMat.roughness = 0.22; capMat.envMapIntensity = 1.2;
  const capShape = roundRect(TR.len + 0.5, TR.h + 0.5, 0.25);
  const capGeo = new THREE.ExtrudeGeometry(capShape, { depth: 0.24, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 3, curveSegments: 6 });
  capGeo.rotateY(Math.PI / 2); capGeo.translate(-0.2, 0, 0);
  const screwHead = new THREE.SphereGeometry(0.17, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2.4);
  screwHead.rotateZ(-Math.PI / 2);
  // (the dome's base sits on the cap's face; the slot cuts into it along
  // its whole length, standing a hair proud only at the crown)
  const slotGeo = new THREE.BoxGeometry(0.06, 0.22, 0.045);
  const screws = [], slots = [], rs = seeded(97);
  [-1, 1].forEach(sx => {
    const e = new THREE.Mesh(capGeo, capMat); e.position.set(sx * (W / 2 + 0.2), 0.4 + (TR.h + 0.5) / 2 - 0.1, 0);
    if (sx < 0) e.rotation.y = Math.PI;
    e.castShadow = true; e.receiveShadow = true; g.add(e);
    [-1, 1].forEach(sz => {
      const x = sx * (W / 2 + 0.276), y = 0.4 + TR.h * 0.52, z = sz * TR.len * 0.3, turn = rs() * Math.PI;
      const m = new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), sx < 0 ? Math.PI : 0), V(1, 1, 1));
      screws.push([screwHead, m]);
      const q = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), turn);
      slots.push([slotGeo, new THREE.Matrix4().compose(V(x + sx * 0.15, y, z), q, V(1, 1, 1))]);
    });
  });
  g.add(new THREE.Mesh(merged(screws), capMat));
  g.add(new THREE.Mesh(merged(slots), new THREE.MeshStandardMaterial({ color: 0x1a1206, roughness: 0.8, metalness: 0.4 })));
  // the value of each trough, on a brass strip along the front
  const COL = ['gold', 'plum', 'onyx', 'onyx', 'emerald', 'emerald', 'oxblood', 'oxblood', 'ivory', 'ivory'];
  const VAL = { gold: '1000', plum: '500', onyx: '100', emerald: '25', oxblood: '5', ivory: '1' };
  const FILL = { gold: 13, plum: 16, onyx: 22, emerald: 25, oxblood: 27, ivory: 28 };
  const plate = canvasTex(2048, 64, (c, Wc, Hc) => {
    c.fillStyle = '#d8ae58'; c.fillRect(0, 0, Wc, Hc);
    c.fillStyle = 'rgba(58,36,8,0.9)'; c.strokeStyle = 'rgba(58,36,8,0.9)';
    c.lineWidth = 2; c.strokeRect(6, 6, Wc - 12, Hc - 12);
    c.font = `700 ${Hc * 0.52}px Georgia, "Times New Roman", serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    // (the strip is seen from the front: x runs from the player's right)
    for (let i = 0; i < TR.n; i++) { const u = 0.5 - cxOf(i) / (W + 0.2); c.fillText(VAL[COL[i]], u * Wc, Hc / 2 + 2); }
    for (let i = 1; i < TR.n; i++) { const u = 0.5 - (cxOf(i) - TR.pitch / 2) / (W + 0.2); c.fillRect(u * Wc - 1, 14, 2, Hc - 28); }
  });
  // (the figures cut into the strip, not printed on it: see engravedMat.
  // Its brushing runs along it - 1 cm a tile on the relief's own UVs.)
  const stripMat = engravedMat(plate, 1.8);
  stripMat.roughness = 0.36;
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.2, 0.9), stripMat);
  strip.position.set(0, 0.4 + TR.h * 0.45, -(TR.len / 2 + 0.13)); strip.rotation.y = Math.PI; g.add(strip);
  // the chips: the edge texture, eight inserts; the faces, the house coin
  // (see chipMats)
  const chipGeo = new THREE.CylinderGeometry(1.95, 1.95, 0.33, 48, 1);
  chipGeo.rotateX(Math.PI / 2);           // (on edge, its axis along z)
  const R = new THREE.Object3D();
  CHIPS.forEach(name => {
    const [sideM, faceM] = chipMats(name);
    const troughs = COL.map((c, i) => (c === name ? i : -1)).filter(i => i >= 0);
    if (!troughs.length) return;
    const count = troughs.reduce((sum, i) => sum + FILL[COL[i]], 0);
    const inst = new THREE.InstancedMesh(chipGeo, [sideM, faceM, faceM], count);
    inst.castShadow = true; inst.receiveShadow = true;
    let k = 0;
    troughs.forEach(i => {
      const cx = cxOf(i), n = FILL[COL[i]];
      for (let j = 0; j < n; j++) {
        // (filled from the back; the front chip leans back on the row)
        const z = TR.len / 2 - 0.25 - (j + 0.5) * 0.335;
        const lean = j === n - 1 ? -0.16 : 0;
        R.position.set(cx + Math.sin(j * 2.3 + i) * 0.03, top - TR.sink - TR.r + 1.94 + (j === n - 1 ? -0.03 : 0), z + (j === n - 1 ? -0.04 : 0));
        R.rotation.set(lean, 0, j * 1.7 + i * 0.9);
        R.updateMatrix(); inst.setMatrixAt(k++, R.matrix);
      }
    });
    g.add(inst);
  });
  g.position.set(0, 0, FELT.b + 5.6);
  return g;
}

// ------------------------------------------------------------ the props
// Shared by them: a flat slab from a Shape (lying on the felt, h thick,
// bevelled), brass tubing along a path, the gilt edges of a deck, and an
// engraved brass face (the DRO seal, or a plaque's words).
function slab(shape, h, mat, bevel = 0.12) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth: h - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 16 });
  geo.rotateX(-Math.PI / 2); geo.translate(0, bevel, 0);
  const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true;
  return m;
}
function tube(points, r, mat, closed = false) {
  return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points, closed, 'catmullrom', 0.1), Math.max(8, points.length * 6), r, 8, closed), mat);
}
function rodBetween(a, b, r, mat) { return laid(new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 14), mat), a, b, true); }
// (the outline of a rounded rectangle on the felt, as points at height y)
function outline(w, d, r, y, cz = 0) { return roundRect(w, d, r).getSpacedPoints(96).map(p => V(p.x, y, cz - p.y)); }
let giltM = null;
// (a deck's gilt edge: a card every few pixels, but never a ruled grid -
// cards in a stack lie a hair out of true, so a line comes and goes in
// weight and now and then two sit close or a gap opens)
function giltEdges() {
  if (!giltM) {
    const rnd = seeded(808);
    const t = canvasTex(64, 256, (c, W, H) => {
      const g = c.createLinearGradient(0, 0, W, 0); g.addColorStop(0, '#b8914a'); g.addColorStop(0.5, '#e8c77e'); g.addColorStop(1, '#b8914a'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      for (let y = 0; y < H;) {
        c.fillStyle = `rgba(80,52,16,${(0.2 + rnd() * 0.3).toFixed(2)})`;
        const lean = (rnd() - 0.5) * 1.2;
        c.beginPath(); c.moveTo(0, y); c.lineTo(W, y + lean); c.lineTo(W, y + lean + 1); c.lineTo(0, y + 1); c.fill();
        y += rnd() < 0.08 ? 2 : rnd() < 0.06 ? 5 : 3;
      }
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    giltM = new THREE.MeshStandardMaterial({ map: t, metalness: 0.7, roughness: 0.38 });
  }
  return giltM;
}
function engraved(w, h, draw) {
  return canvasTex(w, h, (c, W, H) => {
    c.fillStyle = '#d8ae58'; c.fillRect(0, 0, W, H);
    c.fillStyle = c.strokeStyle = 'rgba(56,34,8,0.9)';
    draw(c, W, H);
  });
}
// An engraved brass face as a material: the engraving's colour, and the
// same artwork as relief - its cuts sunk into the metal, so the light
// runs along their walls rather than lying on a printed line.
function engravedMat(tex, depth = 2.4) {
  // (the relief placed exactly as the artwork is)
  const n = embossTex(tex.image, depth); n.repeat.copy(tex.repeat); n.offset.copy(tex.offset);
  const m = new THREE.MeshStandardMaterial({ map: tex, normalMap: n, metalness: 1, roughness: 0.3 });
  return finished(m, 'brushed', 1, 1, 0.1);
}
function sealTex() {
  return engraved(512, 512, (c, W, H) => {
    const cx = W / 2, cy = H / 2;
    c.lineWidth = 6; c.beginPath(); c.arc(cx, cy, W * 0.46, 0, 7); c.stroke();
    c.lineWidth = 2.5; c.beginPath(); c.arc(cx, cy, W * 0.42, 0, 7); c.stroke();
    c.beginPath(); c.arc(cx, cy, W * 0.29, 0, 7); c.stroke();
    for (let k = 0; k < 72; k++) { const a = k / 72 * Math.PI * 2; c.beginPath(); c.moveTo(cx + Math.cos(a) * W * 0.3, cy + Math.sin(a) * W * 0.3); c.lineTo(cx + Math.cos(a) * W * (k % 2 ? 0.315 : 0.33), cy + Math.sin(a) * W * (k % 2 ? 0.315 : 0.33)); c.stroke(); }
    c.font = `700 ${W * 0.05}px Georgia, "Times New Roman", serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    const t = 'DAILY ✦ ROLL ✦ OVER ✦ '.repeat(2);
    for (let i = 0; i < t.length; i++) { const a = -Math.PI / 2 + i / t.length * Math.PI * 2; c.save(); c.translate(cx + Math.cos(a) * W * 0.36, cy + Math.sin(a) * W * 0.36); c.rotate(a + Math.PI / 2); c.fillText(t[i], 0, 0); c.restore(); }
    c.font = `700 ${W * 0.16}px Georgia, "Times New Roman", serif`;
    c.fillText('DRO', cx, cy + W * 0.012);
  });
}

// The mouth plate's engraving, drawn to the plate as it lies (x across it,
// -4.85..4.85 cm, y up it, 0.9..2.95): a double rule along the top, broken
// at the thumb notch, a wave band between them, and over the slot, on
// either side of the notch, the house and the shoe's number - lettered as
// a salon's plate is, small, spaced, in capitals.
function plateTex() {
  const t = engraved(1024, 224, (c, W, H) => {
    const px = W / 9.7, py = H / 2.05, X = x => (x + 4.85) * px, Y = y => (2.95 - y) * py;
    const notch = 1.2 * px + 10;
    c.lineCap = 'round';
    // the rules and the wave between them, stopping short of the notch
    [[0.1, 2.2], [0.24, 1.1], [0.52, 1.1]].forEach(([d, w]) => {
      c.lineWidth = w;
      c.beginPath(); c.moveTo(X(-4.72), d * py); c.lineTo(W / 2 - notch, d * py); c.moveTo(W / 2 + notch, d * py); c.lineTo(X(4.72), d * py); c.stroke();
    });
    c.lineWidth = 0.9;
    for (const [x0, x1] of [[X(-4.72), W / 2 - notch], [W / 2 + notch, X(4.72)]]) {
      for (const ph of [0, Math.PI]) {
        c.beginPath();
        for (let x = x0; x <= x1; x += 1.5) { const yy = 0.38 * py + Math.sin((x - x0) / 7 + ph) * 0.1 * py; x === x0 ? c.moveTo(x, yy) : c.lineTo(x, yy); }
        c.stroke();
      }
    }
    // the lettering, over the slot on either side of the notch
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `600 ${0.26 * py}px Georgia, "Times New Roman", serif`;
    const spaced = (txt, x, y, sp) => { const w = [...txt].reduce((s, ch) => s + c.measureText(ch).width + sp, -sp); let at = x - w / 2; for (const ch of txt) { const cw = c.measureText(ch).width; c.fillText(ch, at + cw / 2, y); at += cw + sp; } };
    spaced('DAILY ROLL OVER', X(-2.98), Y(2.02), 3.5);
    spaced('SALON PRIVÉ', X(2.98), Y(2.02), 3.5);
    c.font = `italic 400 ${0.22 * py}px Georgia, "Times New Roman", serif`;
    spaced('baccarat', X(-2.95), Y(1.62), 3);
    spaced('shoe Nº 08', X(2.95), Y(1.62), 3);
    // a lozenge either side of the notch
    [-1, 1].forEach(sd => { const x = W / 2 + sd * (notch + 16), y = 0.38 * py; c.beginPath(); c.moveTo(x, y - 6); c.lineTo(x + 6, y); c.lineTo(x, y + 6); c.lineTo(x - 6, y); c.closePath(); c.fill(); });
  });
  // (the plate's face has its uvs in cm: put the artwork on it - turned
  // about, as that face looks out of the shoe's mouth, so it reads the
  // right way round to the dealer drawing the cards)
  t.repeat.set(-1 / 9.7, 1 / 2.05); t.offset.set(0.5, -0.9 / 2.05);
  return t;
}
// A contact shadow: where a thing stands on the felt the room's light can't
// get under it. A soft dark pad under its footprint (w x d, rounded r,
// fading over `soft` cm past it), darker at its feet [[x, z], ...]; laid a
// hair over the felt.
function contactShadow(w, d, r, soft, feet = [], dark = 0.55) {
  const N = 128, W = w + 2 * soft, D = d + 2 * soft;
  const c = document.createElement('canvas'); c.width = c.height = N;
  const ctx = c.getContext('2d'), img = ctx.createImageData(N, N), px = img.data;
  const sm = x => { x = clamp01(x); return x * x * (3 - 2 * x); };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = (i + 0.5) / N * W - W / 2, z = (j + 0.5) / N * D - D / 2;
    // (distance outside the rounded footprint)
    const qx = Math.abs(x) - (w / 2 - r), qz = Math.abs(z) - (d / 2 - r);
    const out = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - r;
    // (two parts, as a real one has: the dark line where the thing meets
    // the surface - the light cannot get under it at all - and the soft
    // spread round it from the light it blocks overhead)
    const core = 0.9 * (1 - sm((out + 0.05) / (0.1 * soft + 0.15)));
    const spread = 0.55 * (1 - sm((out + soft * 0.3) / soft));
    let a = Math.max(core, spread);
    feet.forEach(([fx, fz]) => { a = Math.max(a, 1 - sm(Math.hypot(x - fx, z - fz) / 0.75)); });
    const k = (j * N + i) * 4; px[k] = px[k + 1] = px[k + 2] = Math.round(a * 255); px[k + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: t, transparent: true, opacity: dark, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.03; m.renderOrder = 1;
  return m;
}

// The shoe, held to a baccarat shoe from a Macau private salon: a base in
// black piano lacquer on polished brass feet; smoked acrylic walls, their
// top sloping down to the mouth, polished brass along every edge; the deck
// inside tilted to the mouth, a lacquered follower with a polished knob
// behind it; at the mouth a brushed brass plate, engraved with the house
// and the shoe's number, a thumb notch over the slot and a polished roller,
// the top card out on the tongue; on the back, toward you, the house's
// seal, its engraving cut into the metal. Finishes set against each other:
// what a hand rubs or a jeweller buffs is mirror-polished, the plates are
// brushed; the acrylic is clear where you look through it square on and
// dense and bright where you see it edge-on, its polished edges catching
// the lamp; the lacquer is a hard clear coat over soft black. It stands on
// the felt: a soft shadow under it, darkest at its feet.
// (Its mouth is its -z end; the cards come out at local z -11.6, y 0.9.)
function buildShoe(set) {
  const g = new THREE.Group();
  const acrylic = glassy(new THREE.MeshPhysicalMaterial({ color: 0x2e2620, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.26, clearcoat: 1, clearcoatRoughness: 0.02, depthWrite: false, side: THREE.DoubleSide }), 0.72, 1.1);
  const lac = finished(new THREE.MeshPhysicalMaterial({ color: 0x0c0a0a, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 }), 'peel', 1 / 3, 1 / 3, 0.05);
  const polish = polishedOf(set.brass);
  const X = 4.85, Z0 = -10.2, Z1 = 7.0, Y0 = 0.9;
  // feet and base, and the shadow it stands in
  const feet = [[-X + 0.5, Z0 + 0.6], [X - 0.5, Z0 + 0.6], [-X + 0.5, Z1 - 0.6], [X - 0.5, Z1 - 0.6]];
  feet.forEach(([x, z]) => { const f = new THREE.Mesh(new THREE.SphereGeometry(0.4, 20, 12), polish); f.scale.y = 0.7; f.position.set(x, 0.28, z); g.add(f); });
  const baseShape = roundRect(2 * X + 0.3, Z1 - Z0 + 2.3, 0.9);
  const cz = (Z0 - 2 + Z1) / 2;
  const base = slab(baseShape, Y0 - 0.35, lac, 0.12); base.position.set(0, 0.35, cz); g.add(base);
  { const sh = contactShadow(2 * X + 0.3, Z1 - Z0 + 2.3, 0.9, 1.6, feet.map(([x, z]) => [x, z - cz])); sh.position.z = cz; g.add(sh); }
  g.add(tube(outline(2 * X + 0.34, Z1 - Z0 + 2.34, 0.92, Y0 - 0.02, cz), 0.05, polish, true));
  // the walls: the side profile, extruded across (its edges rounded over
  // and polished, so each catches a line of light)
  const side = new THREE.Shape();
  side.moveTo(Z0, Y0); side.lineTo(Z1, Y0); side.lineTo(Z1, 6.1); side.quadraticCurveTo(Z1, 6.9, Z1 - 0.8, 6.9); side.lineTo(Z0 + 1.8, 3.5); side.quadraticCurveTo(Z0, 3.1, Z0, 2.7); side.closePath();
  const sideGeo = new THREE.ExtrudeGeometry(side, { depth: 0.2, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 3, curveSegments: 12 });
  sideGeo.rotateY(-Math.PI / 2);         // (profile x -> z; across -> -x)
  [X, -X + 0.32].forEach(x => { const w = new THREE.Mesh(sideGeo, acrylic); w.position.x = x; g.add(w); });
  const back = new THREE.Mesh(new THREE.BoxGeometry(2 * X - 0.6, 6.1 - Y0, 0.28), acrylic); back.position.set(0, (6.1 + Y0) / 2, Z1 - 0.14); g.add(back);
  const lidA = V(0, 3.5, Z0 + 1.8), lidB = V(0, 6.9, Z1 - 0.8);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(2 * X - 0.1, 0.24, lidA.distanceTo(lidB)), acrylic);
  lid.position.copy(lidA).lerp(lidB, 0.5); lid.rotation.x = -Math.atan2(lidB.y - lidA.y, lidB.z - lidA.z); g.add(lid);
  // (the lid's top, front to back, for a hand to rest on)
  g.userData.lid = [lidA.clone().add(V(0, 0.12, 0)), lidB.clone().add(V(0, 0.12, 0))];
  // polished brass along the edges
  [X - 0.05, -X + 0.05].forEach(x => {
    g.add(rodBetween(V(x, lidA.y + 0.05, lidA.z), V(x, lidB.y + 0.05, lidB.z), 0.11, polish));
    g.add(rodBetween(V(x, Y0, Z1 - 0.05), V(x, 6.2, Z1 - 0.05), 0.11, polish));
    g.add(rodBetween(V(x, Y0, Z0 + 0.05), V(x, 2.8, Z0 + 0.05), 0.11, polish));
  });
  g.add(rodBetween(V(-X, 6.62, Z1 - 0.3), V(X, 6.62, Z1 - 0.3), 0.14, polish));
  // the deck, tilted down to the mouth, and the follower behind it
  const backM = new THREE.MeshStandardMaterial({ map: backTex(), roughness: 0.5 });
  const edgeM = giltEdges();
  const deck = new THREE.Mesh(new THREE.BoxGeometry(6.4, 3.0, 8.9), [edgeM, edgeM, backM, edgeM, edgeM, edgeM]);
  deck.rotation.x = -7 * DEG; deck.position.set(0, Y0 + 1.75, Z0 + 5.4); g.add(deck);
  const follower = new THREE.Mesh(new THREE.BoxGeometry(7.2, 3.8, 2.0), lac);
  follower.rotation.x = -7 * DEG; follower.position.set(0, Y0 + 2.4, Z0 + 11.1); g.add(follower);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.2, 16), polish); stem.position.set(0, Y0 + 4.8, Z0 + 11.25); g.add(stem);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.55, 28, 18), polish); knob.position.set(0, Y0 + 5.5, Z0 + 11.25); g.add(knob);
  // the mouth: a brushed, engraved plate with a thumb notch, over the slot,
  // a polished roller
  const plate = new THREE.Shape();
  plate.moveTo(-X, Y0); plate.lineTo(-3.4, Y0); plate.lineTo(-3.4, 1.38); plate.lineTo(3.4, 1.38); plate.lineTo(3.4, Y0); plate.lineTo(X, Y0);
  plate.lineTo(X, 2.95); plate.lineTo(1.2, 2.95); plate.absarc(0, 2.95, 1.2, 0, Math.PI, true); plate.lineTo(-X, 2.95); plate.closePath();
  const plateGeo = new THREE.ExtrudeGeometry(plate, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2, curveSegments: 16 });
  // (the engraving on its faces, plain brushed brass on its edges: the
  // extrusion's groups are its faces, then its sides)
  const face = new THREE.Mesh(plateGeo, [engravedMat(plateTex(), 2.0), set.brass]); face.position.z = Z0 - 0.28; g.add(face);
  const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 7.0, 28), polish); roller.rotation.z = Math.PI / 2; roller.position.set(0, 1.62, Z0 - 0.62); g.add(roller);
  // the top card, out on the tongue, ready to be drawn
  const card = new THREE.Mesh(new THREE.BoxGeometry(6.35, 0.03, 8.89), [edgeM, edgeM, backM, edgeM, edgeM, edgeM]);
  card.position.set(0, Y0 + 0.03, Z0 + 1.5); card.rotation.x = 2 * DEG; card.castShadow = true; g.add(card);
  // the seal on the back, toward you, its engraving cut into it, in a
  // polished rim
  const seal = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, 0.14, 64), [polish, engravedMat(sealTex(), 2.6), polish]);
  seal.rotation.set(Math.PI / 2, Math.PI / 2, 0); seal.position.set(0, 3.5, Z1 + 0.1); g.add(seal);
  return g;
}
// The discard rack, the shoe's pair from the same Macau salon set: a walnut
// plinth with a polished brass line round it and a black suede pad on top;
// smoked acrylic walls, low at the front, their edges polished and bound in
// polished brass rod; the played cards stacked in it, a few lying loose,
// and the house's brass medallion on them as a weight.
//   Across the room: a dark block by the dealer's hand, a red stack in it
//   and a gold coin, its brass edges fine lines of light.
//   At arm's length: the acrylic clear where you look through it and bright
//   along its edges; the rods a mirror, one sharp highlight each - not the
//   broad glow of brushed brass, which read as lit tubes; the suede dull,
//   a soft sheen at a low angle.
//   Pinched in: the suede's nap; the stack's gilt edges, card by card; the
//   medallion's engraving cut into the metal; the walnut's pores.
//   Light: acrylic mirrors the room at its edges and passes it face on;
//   polished brass shows what is beside it; suede soaks the lamp up.
//   Contact: it stands on the felt in a soft shadow of its own, darkest
//   under its edge; the stack and the loose cards lie on the pad; the
//   medallion casts onto the cards.
//   Motion: none.
function buildDiscard(set) {
  const g = new THREE.Group();
  // (the shoe's acrylic: see buildShoe)
  const smoke = glassy(new THREE.MeshPhysicalMaterial({ color: 0x2e2620, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.26, clearcoat: 1, clearcoatRoughness: 0.02, depthWrite: false, side: THREE.DoubleSide }), 0.72, 1.1);
  // (polished, but a satin polish rather than the shoe's mirror: they are
  // thin and run under the lamp end to end, and a mirror line that long
  // flared into a lit tube)
  const polish = polishedOf(set.brass, 0.22); polish.envMapIntensity = 0.8;
  const X = 4.3, Z = 5.6, Y0 = 1.0;
  // (the walnut's grain at its own scale: the slab's UVs are in cm)
  // (UVs in cm: the grain along x, as the plank was cut; before, the board
  // was squeezed to 18 cm both ways and its figure read as a granite fleck)
  const wood = walnutOf(set, 1, 1);
  const plinth = slab(roundRect(2 * X + 1.2, 2 * Z + 1.0, 0.8), Y0, wood, 0.18); g.add(plinth);
  g.add(contactShadow(2 * X + 1.2, 2 * Z + 1.0, 0.8, 1.3));
  g.add(tube(outline(2 * X + 1.24, 2 * Z + 1.04, 0.82, 0.55), 0.06, polish, true));
  // (suede: a black nap, dull face on, with a low sheen at a grazing angle;
  // its UVs in cm, the nap at a millimetre and a half)
  const suede = finished(new THREE.MeshPhysicalMaterial({ color: 0x0c0b0d, roughness: 0.92, sheen: 0.35, sheenRoughness: 0.6, sheenColor: new THREE.Color(0x2a2830), envMapIntensity: 0.3 }), 'clay', 1 / 1.5, 1 / 1.5, 0.35);
  const pad = new THREE.Mesh(new THREE.ShapeGeometry(roundRect(2 * X - 0.4, 2 * Z - 0.4, 0.4), 8), suede);
  pad.rotation.x = -Math.PI / 2; pad.position.y = Y0 + 0.01; pad.receiveShadow = true; g.add(pad);
  const side = new THREE.Shape();
  side.moveTo(-Z, Y0); side.lineTo(Z, Y0); side.lineTo(Z, 5.6); side.lineTo(Z - 0.6, 5.6); side.lineTo(-Z, 2.4); side.closePath();
  const sideGeo = new THREE.ExtrudeGeometry(side, { depth: 0.2, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 3, curveSegments: 12 });
  sideGeo.rotateY(-Math.PI / 2);
  [X, -X + 0.26].forEach(x => { const w = new THREE.Mesh(sideGeo, smoke); w.position.x = x; g.add(w); });
  const back = new THREE.Mesh(new THREE.BoxGeometry(2 * X - 0.5, 5.6 - Y0, 0.26), smoke); back.position.set(0, (5.6 + Y0) / 2, Z - 0.13); g.add(back);
  [X - 0.1, -X + 0.1].forEach(x => {
    g.add(rodBetween(V(x, 2.45, -Z), V(x, 5.65, Z - 0.6), 0.1, polish));
    g.add(rodBetween(V(x, Y0, -Z + 0.05), V(x, 2.45, -Z + 0.05), 0.1, polish));
  });
  g.add(rodBetween(V(-X, 5.62, Z - 0.3), V(X, 5.62, Z - 0.3), 0.12, polish));
  // the stack, a few loose on top, and the weight
  const backM = new THREE.MeshStandardMaterial({ map: backTex(), roughness: 0.5 });
  const edgeM = giltEdges();
  const stack = new THREE.Mesh(new THREE.BoxGeometry(6.35, 1.1, 8.89), [edgeM, edgeM, backM, edgeM, edgeM, edgeM]);
  stack.position.set(0, Y0 + 0.57, 0.3); stack.castShadow = true; stack.receiveShadow = true; g.add(stack);
  let y = Y0 + 1.12;
  for (let k = 0; k < 5; k++) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(6.35, 0.04, 8.89), [edgeM, edgeM, backM, edgeM, edgeM, edgeM]);
    c.position.set(Math.sin(k * 2.3) * 0.22, y + 0.02, 0.3 + Math.cos(k * 1.7) * 0.2);
    c.rotation.y = Math.sin(k * 1.9 + 0.4) * 0.05; c.castShadow = k === 4; c.receiveShadow = true;
    g.add(c); y += 0.045;
  }
  // (the seal cut into the metal, as the shoe's is: the light runs along the
  // walls of its cuts; its rim polished by the hands that lift it)
  const medal = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.78, 0.5, 64), [polishedOf(set.brass, 0.14), engravedMat(sealTex(), 2.6), polishedOf(set.brass, 0.14)]);
  // (turned to read from the seat, a little askew)
  medal.position.set(0.7, y + 0.26, -1.1); medal.rotation.y = Math.PI + 0.35; medal.castShadow = true; g.add(medal);
  return g;
}
// The port the dealer rises through (see prepareTable): the felt
// and the table under it have a hole here (buildCardTable); this is the
// iris that closes it, the bezel round it and the well below. An iris
// blade is the part of the hole's disc inside a large circle whose edge
// runs past the centre: nine of them, turned 40 degrees apart and each
// tilted a hair about its own radius, so each lies over the next and
// under the one before, and the gold edges meet in a spiral. Opening, each
// slides out along its radius and turns, back under the felt.
function buildPort(set) {
  const g = new THREE.Group();
  const R = PORT.r, N = 9, Rc = 9, dC = -1.1, Rb = R + 3;
  // the blade, closed: inside circle A (centre (dC + Rc, 0), radius Rc)
  // and inside the disc Rb, as a polygon in the blade's own x-z plane
  const ang = x => Math.atan2(x[1], x[0]);
  const cA = dC + Rc;
  // (where A and B cross: x from the two circles' equations)
  const xi = (Rb * Rb - Rc * Rc + cA * cA) / (2 * cA), yi = Math.sqrt(Math.max(0, Rb * Rb - xi * xi));
  const aA0 = Math.atan2(yi, xi - cA), aB0 = Math.atan2(yi, xi);
  const pts = [];
  for (let i = 0; i <= 40; i++) { const t = aA0 + (2 * Math.PI - 2 * aA0) * i / 40; pts.push([cA + Rc * Math.cos(t), Rc * Math.sin(t)]); }
  for (let i = 1; i < 24; i++) { const t = -aB0 + 2 * aB0 * i / 24; pts.push([Rb * Math.cos(t), Rb * Math.sin(t)]); }
  const shape = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
  shape.closePath();
  const bladeGeo = new THREE.ShapeGeometry(shape, 1);
  bladeGeo.rotateX(Math.PI / 2);          // (shape y -> world z)
  // the gold edge: a ribbon along A's arc, just inside the blade
  const edge = [];
  for (let i = 0; i <= 64; i++) { const t = Math.PI - 1.2 + 2.4 * i / 64; edge.push([cA + Rc * Math.cos(t), Rc * Math.sin(t)]); }
  const ribPos = [], ribIdx = [];
  edge.forEach(([x, y]) => { const nx = (x - cA) / Rc, ny = y / Rc; ribPos.push(x, 0.012, y, x - nx * 0.16, 0.012, y - ny * 0.16); });
  for (let i = 0; i < edge.length - 1; i++) { const a = 2 * i; ribIdx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const ribGeo = new THREE.BufferGeometry();
  ribGeo.setAttribute('position', new THREE.Float32BufferAttribute(ribPos, 3)); ribGeo.setIndex(ribIdx); ribGeo.computeVertexNormals();
  const bladeMat = finished(new THREE.MeshStandardMaterial({ color: 0x14110f, metalness: 0.75, roughness: 0.46, envMapIntensity: 0.55, side: THREE.DoubleSide }), 'blast', 1 / 3, 1 / 3, 0.22);
  const ribMat = set.brass.clone(); ribMat.side = THREE.DoubleSide;
  const blades = [];
  for (let i = 0; i < N; i++) {
    const pivot = new THREE.Group();
    const slide = new THREE.Group();
    const tilt = new THREE.Group(); tilt.rotation.x = 0.014;
    const mesh = new THREE.Mesh(bladeGeo, bladeMat); mesh.receiveShadow = true;
    const rib = new THREE.Mesh(ribGeo, ribMat);
    tilt.add(mesh, rib); slide.add(tilt); pivot.add(slide);
    pivot.position.y = -0.22;
    g.add(pivot);
    blades.push({ pivot, slide, base: i * 2 * Math.PI / N });
  }
  // the bezel: a brass ring on the felt, its top engraved
  const prof = [[R - 0.02, -0.4], [R - 0.02, 0.1], [R + 0.14, 0.24], [R + 0.86, 0.24], [R + 1.06, 0.12], [R + 1.12, 0.0]].map(([x, y]) => new THREE.Vector2(x, y));
  const bezel = new THREE.Mesh(new THREE.LatheGeometry(prof, 120), set.brass);
  bezel.castShadow = false; bezel.receiveShadow = true; g.add(bezel);
  const ringTex = canvasTex(1024, 1024, (c, W, H) => {
    const cx = W / 2, cy = H / 2, s = W / 2 / (R + 0.84);
    c.fillStyle = '#d9b062'; c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(60,38,10,0.85)'; c.fillStyle = 'rgba(60,38,10,0.85)';
    // two fine rules, and ticks between them
    c.lineWidth = 2.2;
    [R + 0.2, R + 0.78].forEach(r => { c.beginPath(); c.arc(cx, cy, r * s, 0, 7); c.stroke(); });
    for (let k = 0; k < 90; k++) {
      const a = k / 90 * Math.PI * 2, r0 = (R + 0.24) * s, r1 = (R + (k % 5 ? 0.36 : 0.46)) * s;
      c.lineWidth = k % 5 ? 1.4 : 2.4;
      c.beginPath(); c.moveTo(cx + r0 * Math.cos(a), cy + r0 * Math.sin(a)); c.lineTo(cx + r1 * Math.cos(a), cy + r1 * Math.sin(a)); c.stroke();
    }
    // the lettering, round the outer half of the band
    const text = 'DAILY ✦ ROLL ✦ OVER ✦ THE DEALER ✦ '.repeat(2);
    c.font = `700 ${Math.round(0.2 * s)}px Georgia, "Times New Roman", serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    const rt = (R + 0.6) * s;
    for (let i = 0; i < text.length; i++) {
      const a = -Math.PI / 2 + i / text.length * Math.PI * 2;
      c.save(); c.translate(cx + rt * Math.cos(a), cy + rt * Math.sin(a)); c.rotate(a + Math.PI / 2); c.fillText(text[i], 0, 0); c.restore();
    }
  });
  // (engraved, not printed: the rules, ticks and letters cut into the ring,
  // so pinched in the lamp runs along their walls)
  const ringMat = engravedMat(ringTex, 2.2);
  Object.assign(ringMat, { roughness: 0.3, envMapIntensity: 1.0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const ring = new THREE.Mesh(new THREE.RingGeometry(R + 0.16, R + 0.84, 120, 1), ringMat);
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.241; g.add(ring);
  // the well: dark walls, a floor, and a ring of warm light round its lip
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x0a0908, roughness: 0.6, metalness: 0.3, side: THREE.BackSide });
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.03, R - 0.03, 8.8, 48, 1, true), wallMat); wall.position.y = -4.45; g.add(wall);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(R, 40), new THREE.MeshBasicMaterial({ color: 0x030202 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -8.8; g.add(floor);
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x000000, fog: false });
  const glow = new THREE.Mesh(new THREE.TorusGeometry(R - 0.18, 0.08, 6, 64), glowMat); glow.rotation.x = Math.PI / 2; glow.position.y = -0.9; g.add(glow);
  const set01 = k => {
    k = clamp01(k);
    const e = smoother(k);
    blades.forEach(b => {
      b.pivot.rotation.y = b.base + e * 0.72;
      b.slide.position.x = e * (R + 1.4 - dC);
      b.pivot.visible = e < 0.999;
    });
    glowMat.color.setRGB(1.1 * e, 0.62 * e, 0.22 * e);
  };
  // (the radius of the opening at k: the blades' inner edges drawn back)
  const aperture = k => dC + smoother(clamp01(k)) * (R + 1.4 - dC);
  return { group: g, set: set01, aperture };
}

// The dealer is a machine: a two-armed torso in white ceramic traced with
// fine gold circuitry, stowed under a port in the middle of the dealer's
// side. As the deal begins the port's iris opens and it rises out of the
// table on a telescoping lift, both arms straight up and the hands
// together, like a diver surfacing - its shoulders folded up alongside its
// arms, since open they are wider than the port; clear of the felt they
// drop out to each side like a crane's outriggers, and the arms swing down
// to their work. Each arm is built the way the finest such arms are, with
// seven axes (see buildDealerArm), so its hand can take any pose while the
// arm stays one rigid chain; it is solved every frame from its shoulder to
// its wrist, its links long enough for the farthest card (see ARM). The
// arm on the shoe's side (the dealer's left) draws the cards and passes
// each one, hand to hand, to the other, which lays it and turns it over;
// once the deal is done they stay up on the table. A hand keeps the old
// glove's frame - at the fingertips, +z along the fingers, +y the back of
// the hand, +x the thumb's side (the left hand is the right one mirrored,
// its thumb on -x) - so a pose is still where the fingertips are and which
// way they point.
const PORT = { x: 0, z: 57.6, r: 6.2 };
// shoulder heights (up: dealing; down: stowed under the felt); the hinge
// pins' distance out from the torso's middle; each half of the yoke, pin
// to shoulder; the crank from the shoulder's roll (J1) to its pitch (J2),
// where the upper link begins; and the two links, J2 to elbow and elbow to
// wrist (with room to spare for the farthest reach of any deal - see
// rollTable.reach() - so nothing is ever pulled out of true)
const ARM = { up: 16.5, down: -62, pin: 2.4, yoke: 6.0, crank: 4.2, upper: 15.2, fore: 15.2 };
// The two arms: which side of the torso each is on (the seat's x: -1 the
// shoe's side, the player's right).
const SIDES = [-1, 1];
// Which way an arm carries its elbow (the seven axes leave that free): at
// work (0) out to its own side and a little up, as a dealer's elbows are,
// where you can see them work; at rest (1) out to the side and a little
// back, easy - and anything between. Folded (the rise and the sulk, the
// shoulders up alongside the arms) the elbows are carried forward, toward
// the player, so the cranks stand straight up inside the port's ring.
const ELBOW = { work: [0.95, 0.28, 0.02], rest: [0.95, 0.04, 0.3], folded: [0, 0.25, -1] };
function elbowWay(k, side, out, fold = 1) {
  const a = ELBOW.work, b = ELBOW.rest, c = ELBOW.folded;
  out.set(lerp(a[0], b[0], k) * side, lerp(a[1], b[1], k), lerp(a[2], b[2], k)).normalize();
  if (fold < 1) out.multiplyScalar(fold).addScaledVector(_fold.set(c[0], c[1], c[2]).normalize(), 1 - fold).normalize();
  return out;
}
const _fold = new THREE.Vector3();
// The elbow's clearance, see steer(): the arm's links and drums are kept
// off the torso, the other arm and the felt by turning the elbow round
// the line from the shoulder to the wrist (the seventh axis), as near its
// preferred way as the room allows.
const CLEAR = { steps: 15, step: 10 * DEG, felt: 0.3 };
// the wrist (J6's centre), in the hand's frame: behind the heel of the palm,
// past the tool flange
const WRIST = V(0, 0.6, -15.0);
// Circuitry under the glaze. The traces are cut into the ceramic and filled
// with glass, and what shows is the light a few layers down: by day a fine
// smoked seam, a faint warm bleed either side of it; lit, a soft amber glow
// that seems to come from inside the machine, as a pulse does. kind: false
// the colour (white glaze, the seam in it); true the light alone (each trace
// drawn again wider and fainter, so it is diffuse, as light is that has come
// up through a layer); 'rm' the finish (roughness in green, metalness in
// blue: the seam is glossy glass, not metal, in a matt-ish glaze); 'h' the
// depth of the cut, white where it is, for the normal map.
function circuitTex(kind) {
  const W = 512, H = 256;
  let seed = 20260928;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  // (the layout, the same for every kind: runs of polyline, and the pads at
  // their ends)
  const runs = [], pads = [];
  // buses: three traces running together, then single runs breaking off
  for (let b = 0; b < 4; b++) {
    const y0 = 30 + b * 60 + rnd() * 20;
    for (let k = 0; k < 3; k++) runs.push([[0, y0 + k * 5], [W, y0 + k * 5]]);
  }
  for (let i = 0; i < 30; i++) {
    let x = rnd() * W, y = rnd() * H;
    const pts = [[x, y]]; pads.push([x, y]);
    const legs = 2 + (rnd() * 3 | 0);
    for (let k = 0; k < legs; k++) {
      const L = 12 + rnd() * 40, d = rnd();
      if (d < 0.5) x += L; else if (d < 0.75) { x += L * 0.7; y += L * 0.7; } else { x += L * 0.7; y -= L * 0.7; }
      pts.push([x, y]);
    }
    runs.push(pts); pads.push([x, y]);
  }
  const t = canvasTex(W, H, c => {
    c.fillStyle = kind === true || kind === 'h' ? '#000000' : kind === 'rm' ? 'rgb(255,255,0)' : '#f4f1eb'; c.fillRect(0, 0, W, H);
    c.lineJoin = 'round'; c.lineCap = 'round';
    // (one pass over every trace and pad: a width, a colour, a pad radius)
    const pass = (w, col, pr) => {
      c.strokeStyle = c.fillStyle = col; c.lineWidth = w;
      runs.forEach(r => { c.beginPath(); r.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.stroke(); });
      pads.forEach(([x, y]) => { c.beginPath(); c.arc(x, y, pr, 0, 7); c.fill(); });
    };
    if (kind === true) {
      // (the light through the layers: broad and faint, then narrower and
      // brighter, a hot thread at the core)
      [[15, 0.03], [10, 0.05], [6.5, 0.09]].forEach(([w, a]) => pass(w, `rgba(255,160,70,${a})`, w * 0.5));
      pass(3.2, 'rgba(255,196,120,0.38)', 3.2);
      pass(1.4, 'rgba(255,234,196,0.9)', 1.9);
    } else if (kind === 'rm') pass(3.6, 'rgb(255,36,0)', 3.6);
    else if (kind === 'h') pass(3.6, '#ffffff', 3.6);
    else { pass(8, 'rgba(70,52,34,0.07)', 6); pass(3.0, 'rgba(24,22,22,0.86)', 3.0); }
  });
  if (kind === 'rm' || kind === 'h') t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
// A watch's movement, under each joint's crystal, as the caseback of a
// Swiss watch shows one: a rhodium plate finished in Côtes de Genève -
// broad stripes, each brushed across in shallow arcs by the turning tool,
// so the light runs down it in bands - a gold rotor over half of it,
// finished the same, perlage (overlapping circles of graining) round the
// centre, rubies in gold settings, blued screws with their slots every
// which way, and round the edge a gold ring engraved and filled. Its
// colour, its relief (made into a normal map), its finish (roughness in
// green, metalness in blue: the rubies and the filled engraving are not
// metal, and the grained plate is a frosted metal that also scatters a
// little of the lamp, so it reads silver in a dim room, not black) and the rubies alone (the light in them). Made once; each joint
// shows it turned its own way.
let MOVEMENT = null;
function movementTex() {
  if (MOVEMENT) return MOVEMENT;
  const N = 512, O = N / 2, R = N / 2;
  const layer = () => { const cv = document.createElement('canvas'); cv.width = cv.height = N; return cv; };
  const col = layer(), hgt = layer(), fin = layer(), lit = layer();
  const C = col.getContext('2d'), H = hgt.getContext('2d'), F = fin.getContext('2d'), L = lit.getContext('2d');
  const rnd = seeded(417);
  const gray = v => { const k = Math.round(v * 255); return `rgb(${k},${k},${k})`; };
  C.fillStyle = '#ccd0d5'; C.fillRect(0, 0, N, N);
  H.fillStyle = gray(0.5); H.fillRect(0, 0, N, N);
  F.fillStyle = 'rgb(255,100,180)'; F.fillRect(0, 0, N, N);
  L.fillStyle = '#000'; L.fillRect(0, 0, N, N);
  const clipped = (path, fn) => { [C, H, F].forEach(g => { g.save(); g.beginPath(); path(g); g.clip(); }); fn(); [C, H, F].forEach(g => g.restore()); };
  const disc = (r, a0 = 0, a1 = Math.PI * 2, r0 = 0) => g => { g.arc(O, O, r, a0, a1); if (r0) g.arc(O, O, r0, a1, a0, true); else g.lineTo(O, O); g.closePath(); };
  // Côtes de Genève over whatever is clipped: stripes W px wide across the
  // angle ang, each struck with arcs of a tool of radius Rt, a little
  // brighter and darker in turn; a fine ridge where one stripe's cut ran
  // over the last
  const cotes = (light, dark, ang, Wd = 34, Rt = 44) => {
    const ux = Math.cos(ang), uy = Math.sin(ang), nx = -uy, ny = ux;
    for (let k = -9; k <= 9; k++) {
      const sx = O + nx * k * Wd, sy = O + ny * k * Wd;
      // (each stripe light along one side and darker along the other, as
      // the arcs turn their faces to the light: the broad banding that
      // reads across a room)
      const band = g => { g.beginPath(); [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b], i) => { const x = sx + nx * a * Wd / 2 + ux * b * R * 2, y = sy + ny * a * Wd / 2 + uy * b * R * 2; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); };
      const gr = C.createLinearGradient(sx - nx * Wd / 2, sy - ny * Wd / 2, sx + nx * Wd / 2, sy + ny * Wd / 2);
      gr.addColorStop(0, light); gr.addColorStop(0.55, light); gr.addColorStop(1, dark);
      C.fillStyle = gr; band(C); C.fill();
      const hr = H.createLinearGradient(sx - nx * Wd / 2, sy - ny * Wd / 2, sx + nx * Wd / 2, sy + ny * Wd / 2);
      hr.addColorStop(0, gray(0.42)); hr.addColorStop(1, gray(0.58));
      H.fillStyle = hr; band(H); H.fill();
      // (the fine arcs of the tool across it)
      for (let u = -R * 1.5; u <= R * 1.5; u += 2.5) {
        const lvl = ((u / 2.5) & 1);
        C.strokeStyle = lvl ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'; H.strokeStyle = lvl ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
        [C, H].forEach(g => {
          g.lineWidth = 1.4; g.beginPath();
          for (let s = -Wd / 2; s <= Wd / 2 + 0.1; s += Wd / 8) {
            const bow = Rt - Math.sqrt(Rt * Rt - s * s);
            const x = sx + ux * (u + bow) + nx * s, y = sy + uy * (u + bow) + ny * s;
            s === -Wd / 2 ? g.moveTo(x, y) : g.lineTo(x, y);
          }
          g.stroke();
        });
      }
      // (and a fine ridge where this stripe's cut ran over the last)
      H.strokeStyle = gray(0.78); H.lineWidth = 1.6;
      H.beginPath(); H.moveTo(sx + nx * Wd / 2 - ux * R * 2, sy + ny * Wd / 2 - uy * R * 2); H.lineTo(sx + nx * Wd / 2 + ux * R * 2, sy + ny * Wd / 2 + uy * R * 2); H.stroke();
    }
  };
  // the plate
  clipped(disc(R * 0.86), () => cotes('#d2d6db', '#b4b9bf', -0.52));
  // perlage round the centre (on the half the rotor leaves open)
  clipped(disc(R * 0.46, Math.PI * 0.95, Math.PI * 2.05, R * 0.16), () => {
    for (let k = 0; k < 150; k++) {
      const a = k * 2.39996, r = R * 0.16 + (R * 0.3) * Math.sqrt(k / 150);
      const x = O + Math.cos(a) * r, y = O + Math.sin(a) * r;
      C.fillStyle = '#c9cdd2'; C.beginPath(); C.arc(x, y, 13, 0, 7); C.fill();
      for (let rr = 13; rr > 1; rr -= 2.5) {
        C.strokeStyle = (rr / 2.5 | 0) % 2 ? '#d8dce0' : '#b6bbc1'; C.lineWidth = 1.3; C.beginPath(); C.arc(x, y, rr, 0, 7); C.stroke();
        H.strokeStyle = gray((rr / 2.5 | 0) % 2 ? 0.68 : 0.32); H.lineWidth = 1.3; H.beginPath(); H.arc(x, y, rr, 0, 7); H.stroke();
      }
    }
  });
  // settings and rubies, blued screws, on the open half
  const ruby = (x, y) => {
    C.fillStyle = '#d7b46c'; C.beginPath(); C.arc(x, y, 12, 0, 7); C.fill();
    H.fillStyle = gray(0.75); H.beginPath(); H.arc(x, y, 12, 0, 7); H.fill();
    F.fillStyle = 'rgb(255,50,255)'; F.beginPath(); F.arc(x, y, 12, 0, 7); F.fill();
    const g = C.createRadialGradient(x - 1.6, y - 1.6, 0, x, y, 5.2); g.addColorStop(0, '#ff8a98'); g.addColorStop(0.35, '#b3122c'); g.addColorStop(1, '#4a0510');
    C.fillStyle = g; C.beginPath(); C.arc(x, y, 5.2, 0, 7); C.fill();
    const hg = H.createRadialGradient(x, y, 0, x, y, 5.2); hg.addColorStop(0, gray(0.95)); hg.addColorStop(1, gray(0.6));
    H.fillStyle = hg; H.beginPath(); H.arc(x, y, 5.2, 0, 7); H.fill();
    F.fillStyle = 'rgb(255,14,0)'; F.beginPath(); F.arc(x, y, 5.2, 0, 7); F.fill();
    L.fillStyle = '#ffffff'; L.beginPath(); L.arc(x, y, 4.4, 0, 7); L.fill();
  };
  const screw = (x, y, r = 9) => {
    const g = C.createRadialGradient(x - r * 0.35, y - r * 0.35, 0, x, y, r); g.addColorStop(0, '#6f8fd8'); g.addColorStop(0.6, '#2c4c9e'); g.addColorStop(1, '#172a5c');
    C.fillStyle = g; C.beginPath(); C.arc(x, y, r, 0, 7); C.fill();
    const hg = H.createRadialGradient(x, y, 0, x, y, r); hg.addColorStop(0, gray(0.85)); hg.addColorStop(1, gray(0.55));
    H.fillStyle = hg; H.beginPath(); H.arc(x, y, r, 0, 7); H.fill();
    F.fillStyle = 'rgb(255,36,255)'; F.beginPath(); F.arc(x, y, r, 0, 7); F.fill();
    const a = rnd() * Math.PI, dx = Math.cos(a) * r * 0.85, dy = Math.sin(a) * r * 0.85;
    [C, H].forEach(gg => { gg.strokeStyle = gg === C ? '#0b1022' : gray(0.3); gg.lineWidth = 2.4; gg.beginPath(); gg.moveTo(x - dx, y - dy); gg.lineTo(x + dx, y + dy); gg.stroke(); });
  };
  [[0.62, 1.12], [0.4, 1.3], [0.66, 1.5], [0.36, 1.72], [0.58, 1.88]].forEach(([r, a]) => ruby(O + Math.cos(a * Math.PI) * R * r, O + Math.sin(a * Math.PI) * R * r));
  [[0.74, 1.24], [0.52, 1.6], [0.74, 1.8]].forEach(([r, a]) => screw(O + Math.cos(a * Math.PI) * R * r, O + Math.sin(a * Math.PI) * R * r));
  // the rotor: half a disc in gold, struck the other way, its heavy rim a
  // band of its own, lettered along its arc
  const a0 = -0.05 * Math.PI, a1 = a0 + Math.PI;
  clipped(disc(R * 0.8, a0, a1, R * 0.1), () => {
    C.fillStyle = '#d4b06a'; C.fillRect(0, 0, N, N);
    F.fillStyle = 'rgb(255,86,215)'; F.fillRect(0, 0, N, N);
    cotes('#e6c886', '#bf9a55', 0.9, 30, 40);
  });
  clipped(disc(R * 0.8, a0, a1, R * 0.7), () => {
    C.fillStyle = '#cfa95f'; C.fillRect(0, 0, N, N); H.fillStyle = gray(0.66); H.fillRect(0, 0, N, N);
    for (let r = R * 0.7; r < R * 0.8; r += 2.5) { C.strokeStyle = ((r / 2.5) | 0) % 2 ? '#e2c27e' : '#b8924e'; C.lineWidth = 1.4; C.beginPath(); C.arc(O, O, r, a0, a1); C.stroke(); }
  });
  [C, H].forEach(g => { g.strokeStyle = g === C ? '#8a6a2c' : gray(0.3); g.lineWidth = 2; g.beginPath(); g.arc(O, O, R * 0.8, a0, a1); g.lineTo(O + Math.cos(a0) * R * 0.1, O + Math.sin(a0) * R * 0.1); g.stroke(); });
  const arcText = (txt, r, mid, size, fill, ht) => {
    [C, H, F].forEach(g => { g.font = `600 ${size}px Georgia, "Times New Roman", serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; });
    const w = [...txt].map(ch => C.measureText(ch).width + size * 0.25), tot = w.reduce((s, x) => s + x, 0);
    let at = mid - tot / r / 2;
    [...txt].forEach((ch, i) => {
      const a = at + w[i] / r / 2;
      [[C, fill], [H, gray(ht)], [F, 'rgb(255,200,0)']].forEach(([g, st]) => { g.save(); g.translate(O + Math.cos(a) * r, O + Math.sin(a) * r); g.rotate(a + Math.PI / 2); g.fillStyle = st; g.fillText(ch, 0, 0); g.restore(); });
      at += w[i] / r;
    });
  };
  arcText('DAILY ✦ ROLL ✦ OVER', R * 0.58, a0 + Math.PI / 2, 17, '#5a3e14', 0.3);
  arcText('SEPT AXES ✦ 21 RUBIS', R * 0.44, a0 + Math.PI / 2, 12, '#5a3e14', 0.3);
  // the centre: the rotor's arbor, a ruby under a blued screw
  ruby(O, O);
  screw(O, O, 7);
  // the ring round it all: polished gold, engraved and filled
  clipped(disc(R * 0.98, 0, Math.PI * 2, R * 0.86), () => {
    C.fillStyle = '#dcb872'; C.fillRect(0, 0, N, N); H.fillStyle = gray(0.62); H.fillRect(0, 0, N, N);
    F.fillStyle = 'rgb(255,66,235)'; F.fillRect(0, 0, N, N);
  });
  [C, H].forEach(g => { g.strokeStyle = g === C ? '#8f6c2e' : gray(0.35); g.lineWidth = 1.5; [R * 0.865, R * 0.975].forEach(r => { g.beginPath(); g.arc(O, O, r, 0, 7); g.stroke(); }); });
  arcText('ADJUSTED ✦ FIVE ✦ POSITIONS ✦ Nº 0417 ✦ DRO ✦', R * 0.92, -Math.PI / 2, 15, '#3c2a0e', 0.28);
  arcText('ADJUSTED ✦ FIVE ✦ POSITIONS ✦ Nº 0417 ✦ DRO ✦', R * 0.92, Math.PI / 2, 15, '#3c2a0e', 0.28);
  const map = new THREE.CanvasTexture(col); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  const rf = new THREE.CanvasTexture(fin); rf.colorSpace = THREE.NoColorSpace; rf.anisotropy = 8;
  const glow = new THREE.CanvasTexture(lit); glow.colorSpace = THREE.SRGBColorSpace;
  return (MOVEMENT = { map, normal: embossTex(hgt, 3.2), rf, glow });
}
function dealerMaterials() {
  // (the gold inlaid in the glaze: gold where the traces are - metal, and
  // brighter - and each trace a hair proud of the glaze under its clear)
  const rm = circuitTex('rm');
  const ceramic = new THREE.MeshPhysicalMaterial({ color: 0xeeeae2, map: circuitTex(false), roughness: 0.34, roughnessMap: rm, metalness: 1, metalnessMap: rm,
    clearcoat: 0.85, clearcoatRoughness: 0.12, sheen: 0.4, sheenRoughness: 0.45, sheenColor: new THREE.Color(0xfff0dc),
    emissive: 0xffc877, emissiveMap: circuitTex(true), emissiveIntensity: 0 });
  // (the cut a hair below the glaze: a negative emboss)
  { const n = embossTex(circuitTex('h').image, -1.6, 1); n.wrapS = n.wrapT = THREE.RepeatWrapping; ceramic.normalMap = n; ceramic.normalScale = new THREE.Vector2(0.28, 0.28); }
  // (the light in the traces runs in pulses along each part, from the
  // column up to the hand: pulse.value is the time)
  const pulse = { value: 0 };
  ceramic.onBeforeCompile = sh => {
    sh.uniforms.uPulse = pulse;
    sh.fragmentShader = 'uniform float uPulse;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      #ifdef USE_EMISSIVEMAP
        // (a slow swell down the part, riding a faint breath of its own: the
        // light comes up from under the glaze, it does not flash)
        totalEmissiveRadiance *= (0.34 + 0.95 * pow(0.5 + 0.5 * sin(vEmissiveMapUv.y * 15.0 - uPulse * 4.6), 3.0)) * (0.86 + 0.14 * sin(uPulse * 1.9));
      #endif`);
  };
  ceramic.customProgramCacheKey = () => 'dealer-ceramic-pulse';
  // (the glaze: a hard clear coat over soft white, and at its thin edges,
  // seen edge-on, the warm glow of light carried through it)
  const plain = new THREE.MeshPhysicalMaterial({ color: 0xe6e2da, roughness: 0.34, clearcoat: 0.85, clearcoatRoughness: 0.12, sheen: 0.4, sheenRoughness: 0.45, sheenColor: new THREE.Color(0xfff0dc) });
  // (sapphire over each movement and over every knuckle: no colour of its
  // own, only what it mirrors, and the faint violet-to-green bloom of its
  // anti-reflective coat at an angle)
  const clear = glassy(new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: 0.03, metalness: 0, ior: 1.77, specularIntensity: 1, transparent: true, opacity: 0.05, depthWrite: false,
    iridescence: 0.45, iridescenceIOR: 1.38, iridescenceThicknessRange: [240, 420] }), 0.7, 1.4);
  const gold = new THREE.MeshStandardMaterial({ color: 0xd6b064, metalness: 1, roughness: 0.26, emissive: 0x6a4512, emissiveIntensity: 0.25 });
  // (the bezels round the crystals: gold, buffed to a mirror)
  const bright = new THREE.MeshStandardMaterial({ color: 0xe0bc70, metalness: 1, roughness: 0.1 });
  // (tempered steel, heated to a deep blue: the screws)
  const blued = new THREE.MeshStandardMaterial({ color: 0x2a4c9c, metalness: 1, roughness: 0.14 });
  const graphite = new THREE.MeshStandardMaterial({ color: 0x28272b, metalness: 0.6, roughness: 0.34, envMapIntensity: 1.4 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, metalness: 1, roughness: 0.12 });
  const led = new THREE.MeshBasicMaterial({ color: 0xffb860 });
  // (under each drum's crystal: the movement - its rubies lit from within
  // while the arm works)
  const mv = movementTex();
  // (a movement is lit by what it faces: turned to the lamp it flashes, and
  // it is the one thing on the machine a watchmaker's loupe would be on -
  // it mirrors the room a little more strongly than the glaze does)
  const circuit = new THREE.MeshStandardMaterial({ map: mv.map, normalMap: mv.normal, normalScale: new THREE.Vector2(1.1, 1.1), roughness: 1, roughnessMap: mv.rf, metalness: 1, metalnessMap: mv.rf,
    envMapIntensity: 2.2, emissive: 0x6a160c, emissiveMap: mv.glow, emissiveIntensity: 0 });
  // (the glaze's peel under its clear; the graphite bead-blasted, the gold
  // and the chrome brushed)
  finished(ceramic, 'peel', 4, 4, 0.05); finished(plain, 'peel', 4, 4, 0.05);
  finished(graphite, 'blast', 2, 2, 0.3); finished(gold, 'brushed', 1, 1, 0.12); finished(chrome, 'brushed', 1, 1, 0.1);
  return { ceramic, plain, clear, gold, bright, blued, graphite, chrome, led, circuit, pulse };
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
// A drum: one joint's motor housing - a ceramic barrel on its axis (local
// y), a graphite band round its middle, and at each end, like a watch's
// back, a white rim, a buffed gold bezel and a sapphire crystal over the
// movement, six blued screws round the rim holding it (each screw's slot
// its own way, as a watchmaker leaves them). The movement is turned its
// own way in every drum. (The bezels, the screws and their slots are one
// mesh each for the whole drum.)
let drumNo = 0;
function drum(m, r, len) {
  const g = new THREE.Group(), rnd = seeded(9001 + 7919 * drumNo++);
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 44, 1), m.ceramic));
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(r * 1.015, r * 1.015, len * 0.18, 44, 1, true), m.graphite));
  const R = r * 0.86 / Math.sin(0.5);
  const hr = r * 0.058;
  // (a cheese-head screw: a low, slightly domed head; its slot a dark bar
  // let into the top)
  const head = new THREE.LatheGeometry([[0.001, 0.5], [0.5, 0.48], [0.85, 0.4], [1, 0.26], [1, 0]].map(([x, y]) => new THREE.Vector2(x * hr, y * hr)), 16);
  const slot = new THREE.BoxGeometry(hr * 1.6, hr * 0.14, hr * 0.26); slot.translate(0, hr * 0.44, 0);
  const bezels = [], screws = [], slots = [];
  const mx = (p, q) => new THREE.Matrix4().compose(p, q, V(1, 1, 1));
  [-1, 1].forEach(s => {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.93, r * 0.075, 10, 44), m.plain);
    rim.rotation.x = Math.PI / 2; rim.position.y = s * len / 2; g.add(rim);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(r * 0.87, 48), m.circuit);
    disc.rotation.set(-s * Math.PI / 2, 0, rnd() * Math.PI * 2); disc.position.y = s * (len / 2 + 0.01); g.add(disc);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(R, 48, 6, 0, Math.PI * 2, 0, 0.5), m.clear);
    cap.position.y = s * (len / 2 - R * Math.cos(0.5)); if (s < 0) cap.rotation.x = Math.PI; g.add(cap);
    bezels.push([new THREE.TorusGeometry(r * 0.868, r * 0.03, 8, 56), mx(V(0, s * (len / 2 + 0.015), 0), new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), Math.PI / 2))]);
    const up = V(0, s, 0), qUp = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), up);
    for (let k = 0; k < 6; k++) {
      const a = (k + 0.5 + (s > 0 ? 0 : 0.5)) / 6 * Math.PI * 2;
      const q = new THREE.Quaternion().setFromAxisAngle(up, rnd() * Math.PI).multiply(qUp);
      const at = V(Math.cos(a) * r * 0.93, s * (len / 2 + r * 0.068), Math.sin(a) * r * 0.93);
      screws.push([head, mx(at, q)]); slots.push([slot, mx(at, q)]);
    }
  });
  const fit = [new THREE.Mesh(merged(bezels), m.bright), new THREE.Mesh(merged(screws), m.blued), new THREE.Mesh(merged(slots), m.graphite)];
  // (too fine to throw a shadow of their own: see what casts, prepareTable)
  fit.forEach(f => { f.userData.noShadow = true; g.add(f); });
  return g;
}
// (a drum, or anything built along its local y, turned onto an axis)
const onAxis = (obj, axis) => obj.quaternion.setFromUnitVectors(V(0, 1, 0), axis);
function buildDealerHand(m, mirror = false) {
  const g = new THREE.Group();
  // (built as a right hand; a left hand is the same mirrored across its x)
  const body = new THREE.Group(); body.scale.x = mirror ? -1 : 1; g.add(body);
  // (modelled from the fingertips up; set down 0.7 cm so the fingers lie
  // on the card the pose puts them over rather than hovering above it)
  const hand = new THREE.Group(); hand.position.y = -0.7; body.add(hand);
  const bone = (r, a, b, mat) => laid(new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.01, a.distanceTo(b) - 2 * r), 4, 14), mat), a, b);
  // (a tapered segment, rounded at both ends: a finger's phalanx is wider at
  // its root than at its tip, and a capsule is the same width all the way.
  // Its rounded ends are centred ON the joints (`s`/`e`: the start/end run
  // on past the joint by their radius), so two segments meeting at a joint
  // share one sphere and turn on it without a waist or a gap: a finger,
  // not a chain of pills. The last segment's end stays flush with its tip.)
  const tapered = (rA, rB, a, b, mat, s = true, e = true) => {
    const u = b.clone().sub(a).normalize(), A = s ? a.clone().addScaledVector(u, -rA) : a.clone(), B = e ? b.clone().addScaledVector(u, rB) : b.clone();
    const L = Math.max(rA + rB + 0.01, A.distanceTo(B)), pts = [], N = 10;
    for (let i = 0; i <= N; i++) { const f = i / N * Math.PI / 2; pts.push(new THREE.Vector2(rA * Math.sin(f), -L / 2 + rA - rA * Math.cos(f))); }
    for (let i = 0; i <= N; i++) { const f = i / N * Math.PI / 2; pts.push(new THREE.Vector2(rB * Math.cos(f), L / 2 - rB + rB * Math.sin(f))); }
    return laid(new THREE.Mesh(new THREE.LatheGeometry(pts, 24), mat), A, B);
  };
  // (a gold collar round a finger, set into it where it stands at full width)
  const collar = (at, dir, r) => { const c = new THREE.Mesh(new THREE.TorusGeometry(r * 0.985, 0.035, 8, 24), m.gold); c.quaternion.setFromUnitVectors(V(0, 0, 1), dir.clone().normalize()); c.position.copy(at); return c; };
  const hinge = (p, r) => { const h = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.9, 14), m.graphite); h.rotation.z = Math.PI / 2; h.position.copy(p); return h; };
  // (a gold trace along the top of a segment)
  const trace = (a, b, r) => laid(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 6), m.gold), a.clone().add(V(0, r * 0.95, 0)), b.clone().add(V(0, r * 0.95, 0)), true);
  // the fingers: three segments each on a hinge, lying almost flat (the
  // tips lowest, to slide under a card's end), each segment its own pivot
  // so they curl on a grip and open and spread to let go
  const fingers = [];
  // Each digit its own, as a hand's are (index, middle, ring, little):
  //   x, kz   where its knuckle stands - the four knuckles lie on an arc,
  //           the middle's farthest out, the little finger's drawn back
  //   L       its length from knuckle to tip - the middle longest, the ring
  //           a touch shorter than the index, the little finger well short
  //   f       its three phalanges as shares of that (proximal, middle,
  //           distal): the little finger's middle one is the stub
  //   r       its girth, the little finger slight
  //   yaw     where it points at rest: the index leaning in toward the
  //           thumb, the ring and little finger fanning off
  //   arch    how far it already lies curled in the relaxed hand (the
  //           cascade, index to little finger), the same arch the grip puts
  //           in a finger - pads stay where the card is
  //   c       where each phalanx's gold collar sits along it (0 root, 1 tip)
  //   side    its share of a spread
  [
    { x: 2.4, kz: -6.5, L: 6.0, f: [0.39, 0.33, 0.28], r: 1.05, yaw: 0.03, arch: 0, side: 1, c: [0.3, 0.3] },
    { x: 0.85, kz: -6.7, L: 6.45, f: [0.38, 0.33, 0.29], r: 1.07, yaw: 0.0, arch: 0.05, side: 0.35, c: [0.2, 0.42] },
    { x: -0.75, kz: -6.45, L: 6.1, f: [0.385, 0.335, 0.28], r: 0.97, yaw: -0.04, arch: 0.1, side: -0.35, c: [0.38, 0.24] },
    { x: -2.15, kz: -6.05, L: 4.95, f: [0.41, 0.3, 0.29], r: 0.8, yaw: -0.1, arch: 0.17, side: -1, c: [0.5, 0.34] }
  ].forEach(({ x, kz, L, f, r, yaw, arch, side, c }) => {
    const p0 = V(x, 0.68, kz + L), p1 = p0.clone().add(V(0, 0.16, -L * f[2])), p2 = p1.clone().add(V(0, 0.2, -L * f[1])), p3 = V(x, 1.22, kz);
    // (the finger's rest direction is a turn of its own, under the pivots the
    // grip works)
    const base = new THREE.Group(); base.position.copy(p3); base.rotation.y = yaw; hand.add(base);
    const root = new THREE.Group(); base.add(root);
    const mid = new THREE.Group(); mid.position.copy(p2).sub(p3); root.add(mid);
    const tip = new THREE.Group(); tip.position.copy(p1).sub(p2); mid.add(tip);
    const o = V(0, 0, 0);
    // (three tapered phalanges, a gold collar near the root of each, nothing
    // laid along them: the joints are the rounded ends meeting)
    const d2 = p2.clone().sub(p3), d1 = p1.clone().sub(p2), d0 = p0.clone().sub(p1);
    // (fuller at the root and drawn in toward the tip, as a finger is: the
    // proximal phalanx thick, the last one half its width at the pad)
    root.add(tapered(0.53 * r, 0.46 * r, o, d2, m.plain), collar(d2.clone().multiplyScalar(c[0]), d2, 0.52 * r));
    mid.add(tapered(0.46 * r, 0.39 * r, o, d1, m.plain), collar(d1.clone().multiplyScalar(c[1]), d1, 0.45 * r));
    tip.add(tapered(0.39 * r, 0.3 * r, o, d0, m.plain, true, false));
    // a gold pad under the tip, a clear nail over it
    const pad = new THREE.Mesh(new THREE.SphereGeometry(0.24 * r, 10, 8), m.gold); pad.position.copy(p0).sub(p1).add(V(0, -0.22 * r, -0.1)); tip.add(pad);
    const nail = new THREE.Mesh(new THREE.SphereGeometry(0.42 * r, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), m.clear); nail.scale.set(0.95, 0.5, 1.5); nail.position.copy(p0).sub(p1).add(V(0, 0.12 * r, -0.35)); tip.add(nail);
    // (a cap over the knuckle)
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.62 * r, 16, 12), m.clear); root.add(cap);
    // (and a solid ball of ceramic under it: the knuckle, a joint with mass)
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.58 * r, 18, 12), m.plain); ball.scale.set(1, 0.92, 1.1); root.add(ball);
    fingers.push({ root, mid, tip, side, arch });
  });
  // the knuckles' mass: a ceramic bridge across the roots of the fingers,
  // so they spring from one body instead of standing in a row, and between
  // each pair the web, a flattened ellipsoid filling the gap where they
  // part (the three of them lie along the fingers, a little forward of the
  // knuckle, narrowing as they go)
  { const bridge = new THREE.Mesh(new THREE.CapsuleGeometry(0.72, 5.6, 6, 18), m.plain);
    bridge.rotation.z = Math.PI / 2; bridge.scale.set(1, 1, 0.92); bridge.position.set(0, 1.12, -6.25); hand.add(bridge);
    [[1.62, -6.0], [0.05, -6.1], [-1.45, -5.85]].forEach(([x, z]) => { const w = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10), m.plain); w.scale.set(0.8, 0.62, 1.15); w.position.set(x, 1.02, z); hand.add(w); }); }
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
  // (its uvs are in cm: the traces laid across it at the scale they run
  // along the arm, not squeezed into stripes)
  scaleUV(palmGeo, 1 / 7, 1 / 7);
  const palm = new THREE.Mesh(palmGeo, m.plain); palm.rotation.x = Math.PI / 2; palm.position.set(0, 1.3, -9.7); hand.add(palm);
  // the back of the hand: clean glazed ceramic, one panel let into it, its
  // edge a fine gold keyline (a gold shape under a slightly smaller ceramic
  // one), held by four screws - no traces across it, which at arm's length
  // read as scratches
  const keyline = new THREE.Mesh(new THREE.ShapeGeometry(palmShape, 10), m.gold);
  keyline.rotation.x = -Math.PI / 2; keyline.scale.set(0.84, 0.8, 1); keyline.position.set(0, 2.03, -9.7); hand.add(keyline);
  const panel = new THREE.Mesh(new THREE.ShapeGeometry(palmShape, 10), m.plain);
  panel.rotation.x = -Math.PI / 2; panel.scale.set(0.8, 0.76, 1); panel.position.set(0, 2.045, -9.7); hand.add(panel);
  [[-2.3, -7.6], [2.3, -7.6], [-1.7, -11.9], [1.7, -11.9]].forEach(([x, z]) => {
    const sc = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 12), m.gold); sc.position.set(x, 2.09, z); hand.add(sc);
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.05), m.graphite); slot.position.set(x, 2.13, z); slot.rotation.y = x * z; hand.add(slot);
  });
  // a gold inlay down the back of the hand, and the status lights in it
  const inlay = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 4.2), m.gold); inlay.position.set(0, 2.07, -9.7); hand.add(inlay);
  const leds = [-11.6, -11.0, -10.4].map(z => { const l = new THREE.Mesh(new THREE.CircleGeometry(0.17, 14), m.led.clone()); l.rotation.x = -Math.PI / 2; l.position.set(0.42, 2.075, z); hand.add(l); return l; });
  // vents down each side of the palm
  [-1, 1].forEach(sd => { for (let v = 0; v < 3; v++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 1.4), m.graphite); s.position.set(sd * (2.62 + v * 0.18 - 0.1), 1.35, -11.2 + v * 0.55); s.rotation.y = sd * 0.16; hand.add(s); } });
  // the thumb, off to the side, clear of the card, on a pivot of its own
  const t0 = V(3.6, 1.15, -10.4), t1 = V(4.6, 0.95, -7.4), t2 = V(4.9, 0.72, -4.7);
  // A thumb is jointed twice: a ball at its root, seated in the hand (it
  // swings out and in under the palm), and a hinge at its knuckle, halfway,
  // where it bends toward the fingers. So here: a ceramic ball in a gold
  // bezel let into the thenar pad - the bezel is the hand's, the ball the
  // thumb's, and it turns inside it - and a graphite pin through the
  // knuckle, gold-capped, the last phalanx hung on it.
  const thumb = new THREE.Group(); thumb.position.copy(t0); hand.add(thumb);
  const thumbTip = new THREE.Group(); thumb.add(thumbTip);
  { const d1 = t1.clone().sub(t0), d2 = t2.clone().sub(t1), o = V(0, 0, 0);
    thumbTip.position.copy(d1);
    // (fuller than a finger, and the two phalanges meeting on a shared
    // joint sphere, a gold collar near the root of each, a pad under the tip
    // and a clear nail over it)
    thumb.add(tapered(0.66, 0.56, o, d1, m.plain, true, true), collar(d1.clone().multiplyScalar(0.34), d1, 0.65));
    thumbTip.add(tapered(0.56, 0.38, o, d2, m.plain, false, false), collar(d2.clone().multiplyScalar(0.32), d2, 0.55));
    const tp = new THREE.Mesh(new THREE.SphereGeometry(0.29, 10, 8), m.gold); tp.position.copy(d2).add(V(0, -0.25, 0.05)); thumbTip.add(tp);
    const tn = new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), m.clear); tn.scale.set(0.95, 0.5, 1.5); tn.position.copy(d2).add(V(0, 0.15, 0.25)); thumbTip.add(tn);
    // (the knuckle's pin: across the thumb, standing a little proud of it
    // either side)
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 1.5, 16), m.graphite); thumbTip.add(pin);
    [-1, 1].forEach(sd => { const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.1, 16), m.gold); cap.position.y = sd * 0.75; thumbTip.add(cap); });
    // (the root: a bezel round where the ball is seated, standing in the
    // pad, and a graphite lip inside it)
    const dir = d1.clone().normalize(), seat = t0.clone().addScaledVector(dir, 0.5);
    const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.09, 8, 40), m.gold);
    bezel.quaternion.setFromUnitVectors(V(0, 0, 1), dir); bezel.position.copy(seat); hand.add(bezel);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.84, 0.1, 8, 40), m.graphite);
    lip.quaternion.copy(bezel.quaternion); lip.position.copy(seat).addScaledVector(dir, -0.03); hand.add(lip); }
  // (the thumb's own pose: the knuckle's rest bend toward the fingers; the
  // grip adds to it - see fingers() below)
  thumbTip.rotation.y = -0.18;
  // (and the thumb's ball, the thenar pad: a swell of ceramic from the
  // palm's edge out to the thumb's root, so it grows from the hand and is
  // not a finger lying beside it)
  { const pad = new THREE.Mesh(new THREE.SphereGeometry(1.0, 20, 14), m.plain); pad.scale.set(1.05, 0.78, 2.2); pad.position.set(3.45, 1.1, -9.0); pad.rotation.y = -0.18; hand.add(pad); }
  // the tool plate the arm's flange bolts to, at the heel of the palm: a
  // graphite disc on a ceramic neck, six bolt heads round a gold ring
  { const plate = new THREE.Mesh(new THREE.CylinderGeometry(1.32, 1.32, 0.55, 36), m.graphite);
    plate.rotation.x = Math.PI / 2; plate.position.copy(WRIST).add(V(0, 0, 1.45)); body.add(plate);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.2, 1.2, 36), m.plain);
    neck.rotation.x = Math.PI / 2; neck.position.copy(WRIST).add(V(0, 0, 2.3)); body.add(neck);
    const ringG = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.07, 8, 36), m.gold); ringG.position.copy(WRIST).add(V(0, 0, 1.18)); body.add(ringG);
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; const b = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.2, 8), m.graphite); b.rotation.x = Math.PI / 2; b.position.copy(WRIST).add(V(Math.cos(a) * 1.0, Math.sin(a) * 1.0, 1.12)); body.add(b); } }
  // The fingers, each its own: per[i] = [curl, spread] for index, middle,
  // ring and little finger. Curl 0 is straight; 1 a pinch - each finger
  // arched, its knuckle joint lifting as the two joints past it bend, so
  // the pads come straight down onto the card's end rather than digging
  // through it (a grip that closes this way stays clear of the felt: the
  // pads sit on the card at a pinch, no lower at a hook); past 1 a hook;
  // below 0 the finger opens back from its knuckle alone. Spread fans the
  // fingers apart at their knuckles. The thumb follows the grip: it swings
  // in under the palm, rolled to face the fingers, and out as they open.
  g.userData.fingers = (per, thumbCurl, thumbSpread) => {
    fingers.forEach((f, i) => {
      const [c0, sp] = per[i];
      // (the relaxed arch of its own, added to whatever the grip asks)
      const c = c0 + f.arch;
      const cp = Math.max(0, c), cn = Math.min(0, c);
      f.root.rotation.set(-cp * 0.4 + cn * 0.3, sp * f.side * 0.12, 0);
      f.mid.rotation.x = cp * 0.55 + cn * 0.05;
      f.tip.rotation.x = cp * 0.65;
    });
    const o = clamp01(thumbCurl / 0.9);
    thumb.rotation.set(o * 0.05 + Math.min(0, thumbCurl) * 0.2, -0.05 - o * 0.45 + thumbSpread * 0.25, -o * 0.15);
    // (and the knuckle closes on the grip, the last phalanx swinging in)
    thumbTip.rotation.y = -0.18 - o * 0.28 + Math.min(0, thumbCurl) * 0.1;
  };
  // the status lights: a chase while it works, dark at rest
  g.userData.leds = (on, tt) => leds.forEach((l, i) => { const k = on * (0.25 + 0.75 * Math.pow(0.5 + 0.5 * Math.sin(tt * 9 - i * 1.4), 3)); l.material.color.setRGB(1 * k + 0.08, 0.72 * k + 0.05, 0.36 * k + 0.03); });
  return g;
}
// The torso, placed by pose() each frame: the lift (three sleeves, each
// drawn out of the one below), the waist drum on top of it, turning the
// body a little toward its work, a lit ring round it - and on that the
// hinge: a ceramic saddle with a graphite band, a status light at its
// heart, and a pin through it either side, fore and aft, each carrying
// one half of the yoke. A half-yoke is a ceramic capsule from its pin out
// to the shoulder (the arm's J1 drum, let onto its end - see
// buildDealerArm). Folded (fold 0) both stand straight up off their pins,
// side by side, so the whole machine passes the port; open (fold 1) they
// lie out level, a little past level on the way (the overshoot of a
// servo settling under its own weight), and the shoulders are twice the
// port's width apart. Held to a Motoman's dual-arm torso finished like a
// Swiss watch: across the room, a T with two drums at its ends; at arm's
// length, the saddle's seams, the pins' caps, the gold spine let into the
// top of each half-yoke; pinched in, the engraving on the heart's rosette.
// Ceramic glows at its thin edges, graphite drinks the light, gold streaks.
function buildDealerTorso(m) {
  const g = new THREE.Group();
  const cyl = (rt, rb, mat, seg = 36) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, 1, seg, 1), mat);
  const ring = (r, t, mat) => new THREE.Mesh(new THREE.TorusGeometry(r, t, 8, 44), mat);
  const column = [cyl(2.0, 2.0, m.ceramic), cyl(2.35, 2.35, m.ceramic), cyl(2.7, 2.7, m.ceramic)];
  const seals = [ring(2.04, 0.17, m.graphite), ring(2.39, 0.17, m.graphite), ring(2.74, 0.17, m.graphite)];
  const base = drum(m, 3.0, 3.0);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(3.06, 0.1, 8, 64), m.led.clone());
  halo.rotation.x = Math.PI / 2; halo.position.y = 0.95; base.add(halo);
  // the saddle, built along its own x (the torso's side to side): a short
  // capsule the pins pass through, a graphite band round its middle with a
  // gold ring either side, and at each end the pin's cap, fore and aft
  const saddle = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.95, 2 * ARM.pin - 1.0, 8, 36), m.ceramic);
  body.rotation.z = Math.PI / 2; saddle.add(body);
  const waist = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.0, 1.1, 40, 1, true), m.graphite);
  waist.rotation.z = Math.PI / 2; saddle.add(waist);
  [-0.62, 0.62].forEach(x => { const r = ring(2.0, 0.06, m.gold); r.rotation.y = Math.PI / 2; r.position.x = x; saddle.add(r); });
  SIDES.forEach(sd => {
    // (the pin: a graphite sleeve through the saddle, a gold washer and a
    // ceramic cap at each end, so the half-yoke turns on it)
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 5.2, 24, 1), m.graphite);
    pin.rotation.x = Math.PI / 2; pin.position.x = sd * ARM.pin; saddle.add(pin);
    [-1, 1].forEach(e => {
      const washer = ring(0.92, 0.07, m.gold); washer.position.set(sd * ARM.pin, 0, e * 2.0); saddle.add(washer);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.0, 0.5, 24, 1), m.ceramic);
      cap.rotation.x = Math.PI / 2; cap.position.set(sd * ARM.pin, 0, e * 2.85); saddle.add(cap);
    });
  });
  // (its heart: a lens of clear over a gold rosette, facing the player)
  const heart = new THREE.Group();
  const rosette = new THREE.Mesh(new THREE.CircleGeometry(0.62, 32), m.circuit); heart.add(rosette);
  const lens = new THREE.Mesh(new THREE.SphereGeometry(0.72, 24, 8, 0, Math.PI * 2, 0, 0.9), m.clear); lens.rotation.x = Math.PI / 2; heart.add(lens);
  const bezel = ring(0.72, 0.07, m.gold); heart.add(bezel);
  const eye = new THREE.Mesh(new THREE.CircleGeometry(0.2, 20), m.led.clone()); eye.position.z = 0.02; heart.add(eye);
  heart.position.set(0, 0.2, -1.97); heart.rotation.y = Math.PI; saddle.add(heart);
  // the two halves of the yoke, each built along its own y from its pin: a
  // capsule with a gold spine along what is its top when it lies level,
  // and a graphite collar where it leaves the pin
  const halves = SIDES.map(sd => {
    const h = new THREE.Group();
    const cap = new THREE.Mesh(new THREE.CapsuleGeometry(1.95, ARM.yoke, 8, 36), m.ceramic);
    cap.position.y = ARM.yoke / 2; h.add(cap);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(1.98, 1.98, 1.4, 40, 1, true), m.graphite);
    collar.position.y = 1.3; h.add(collar);
    const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, ARM.yoke - 2.4, 6), m.gold);
    spine.position.set(-sd * 1.93, ARM.yoke / 2 + 0.3, 0); h.add(spine);
    return h;
  });
  g.add(...column, ...seals, base, saddle, ...halves);
  const up = V(0, 1, 0), side = V(1, 0, 0), fwd = V(0, 0, 1);
  const shoulders = [V(0, 0, 0), V(0, 0, 0)], pins = [V(0, 0, 0), V(0, 0, 0)];
  const _u = V(0, 0, 0), _m = new THREE.Matrix4(), _x = V(0, 0, 0);
  // each half-yoke's way out from its pin at fold f: level at 1, straight
  // up at 0, and a little under level past 1 (the overshoot)
  const wayOf = (k, f, out) => { const th = (1 - f) * Math.PI / 2; return out.copy(side).multiplyScalar(SIDES[k] * Math.cos(th)).addScaledVector(up, Math.sin(th)).normalize(); };
  return {
    group: g,
    // the shoulders (the J1 drums' centres) for the saddle at height y,
    // turned by yaw, the yoke folded by f: a pure function of those, for
    // the plans (see upright)
    shouldersAt(y, yaw, f, out) {
      _x.set(Math.cos(yaw), 0, -Math.sin(yaw));
      return out.map((o, k) => { o.set(PORT.x, y, PORT.z).addScaledVector(_x, SIDES[k] * ARM.pin); const th = (1 - f) * Math.PI / 2; o.addScaledVector(_x, SIDES[k] * Math.cos(th) * ARM.yoke); o.y += Math.sin(th) * ARM.yoke; return o; });
    },
    // the saddle at height y over the port, the body turned by yaw (from
    // facing the player), the yoke folded by `fold` (0 up, 1 level);
    // returns the two shoulders, [shoe side, other], the torso's own
    // side-to-side axis and its fore-and-aft axis (the pins' and J1's)
    pose(y, yaw, tt = 0, on = 0, fold = 1) {
      const top = y - 4.9, base0 = ARM.down - 6, span = top - base0;
      column.forEach((c, i) => {
        const a = base0 + span * (2 - i) / 3, b = Math.min(top, a + span / 3 + 1.2);
        laid(c, V(PORT.x, a, PORT.z), V(PORT.x, b, PORT.z), true);
        seals[i].position.set(PORT.x, b, PORT.z); seals[i].quaternion.setFromUnitVectors(V(0, 0, 1), up);
      });
      base.position.set(PORT.x, y - 3.4, PORT.z); base.rotation.set(0, yaw, 0);
      saddle.position.set(PORT.x, y, PORT.z); saddle.rotation.set(0, yaw, 0);
      side.set(Math.cos(yaw), 0, -Math.sin(yaw)); fwd.set(Math.sin(yaw), 0, Math.cos(yaw));
      halves.forEach((h, k) => {
        pins[k].set(PORT.x, y, PORT.z).addScaledVector(side, SIDES[k] * ARM.pin);
        wayOf(k, fold, _u);
        h.position.copy(pins[k]);
        // (its y along its way, its z the pin's: the spine stays on top)
        _m.makeBasis(_x.copy(_u).cross(fwd).normalize(), _u, fwd);
        h.quaternion.setFromRotationMatrix(_m);
        shoulders[k].copy(pins[k]).addScaledVector(_u, ARM.yoke);
      });
      const glowK = on * (0.55 + 0.45 * Math.sin(tt * 3.2));
      halo.material.color.setRGB(1 * glowK + 0.06, 0.72 * glowK + 0.05, 0.38 * glowK + 0.04);
      eye.material.color.setRGB(1 * glowK + 0.08, 0.72 * glowK + 0.05, 0.36 * glowK + 0.03);
      return { shoulders, side, fwd, pins };
    }
  };
}
// One arm, from its shoulder on the yoke to its wrist, placed by pose()
// each frame. It is a seven-axis arm, as the finest of them are: J1, the
// shoulder's roll, a drum let onto the end of its half of the yoke with
// its axis fore and aft (so it turns in place, and never into the yoke:
// its crystal faces the player); J2, the shoulder's pitch, a smaller drum
// on a crank out of J1's side, where the upper link begins; J3, a roll of
// the upper link; J4, the elbow; J5, a roll of the forearm; J6, the wrist;
// J7, the tool flange the hand bolts to. J1 turns the crank to wherever
// the elbow is, so the upper link always swings in the plane of the crank
// and the pin; with seven axes the elbow is still free to swing round the
// line from J2 to the wrist without moving either, so it is carried out to
// its own side and up, as a dealer's is - where you can see it work - and
// steered off anything in its way (see steer), while the chain stays
// exact. A cable dress runs down the outside of it in clamps, and a row of
// status lights on the forearm chases while it works. side: -1 the shoe's
// side.
function buildDealerArm(m, armSide) {
  const g = new THREE.Group();
  const cyl = (rt, rb, mat, seg = 36) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, 1, seg, 1), mat);
  const ring = (r, t, mat) => new THREE.Mesh(new THREE.TorusGeometry(r, t, 8, 44), mat);
  // J1, J2, J4, J6: the drums the arm turns and bends at
  const shoulder = drum(m, 2.15, 4.2), pitch = drum(m, 1.6, 3.4), elbow = drum(m, 1.95, 4.3), wrist = drum(m, 1.42, 3.0);
  // the crank, J1 to J2: a ceramic bar out of J1's side with a graphite
  // collar at its root and a gold ring at its head
  const crank = new THREE.Group();
  { const bar = cyl(1.25, 1.1, m.ceramic); bar.scale.y = ARM.crank; bar.position.y = ARM.crank / 2; crank.add(bar);
    const root = ring(1.28, 0.12, m.graphite); root.rotation.x = Math.PI / 2; root.position.y = 1.9; crank.add(root);
    const head = ring(1.12, 0.05, m.gold); head.rotation.x = Math.PI / 2; head.position.y = ARM.crank - 1.65; crank.add(head); }
  // J3, J5: the rolls, a collar on each link between two graphite breaks
  const collar = r => { const c = new THREE.Group(); const b = cyl(r, r, m.plain); b.scale.y = 1.5; c.add(b); [-0.8, 0.8].forEach(y => { const k = ring(r * 1.01, 0.1, m.graphite); k.rotation.x = Math.PI / 2; k.position.y = y; c.add(k); }); const gl = ring(r * 1.02, 0.045, m.gold); gl.rotation.x = Math.PI / 2; c.add(gl); return c; };
  const roll3 = collar(1.85), roll5 = collar(1.45);
  // the links: tapered, a gold spine let into the top of each, two seams
  const upper = cyl(1.52, 1.8, m.ceramic), fore = cyl(1.1, 1.38, m.ceramic);
  const spines = [cyl(0.07, 0.07, m.gold, 6), cyl(0.07, 0.07, m.gold, 6)];
  const seams = [ring(1.62, 0.045, m.graphite), ring(1.22, 0.045, m.graphite)];
  // J7: the tool flange, out of the wrist drum toward the hand
  const flange = new THREE.Group();
  { const c = cyl(1.22, 1.3, m.plain); c.scale.y = 1.35; c.position.y = 0.68; flange.add(c);
    const r = ring(1.24, 0.09, m.gold); r.rotation.x = Math.PI / 2; r.position.y = 1.3; flange.add(r); }
  // the cable dress, and its clamps
  const cable = new THREE.Mesh(new THREE.BufferGeometry(), m.graphite), wire = new THREE.Mesh(new THREE.BufferGeometry(), m.gold);
  const CLAMP_AT = [0.2, 0.44, 0.8];
  const clamps = CLAMP_AT.map(() => { const c = new THREE.Group(); c.add(ring(0.4, 0.1, m.plain)); const foot = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.55, 0.3), m.graphite); foot.position.y = -0.52; c.add(foot); g.add(c); return c; });
  // status lights along the forearm
  const lights = [0, 1, 2].map(() => { const l = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), m.led.clone()); g.add(l); return l; });
  g.add(shoulder, crank, pitch, roll3, elbow, roll5, wrist, upper, fore, ...spines, ...seams, flange, cable, wire);
  const up = V(0, 1, 0);
  // (where the elbow is carried, by default: out to its own side and up)
  const PREF = elbowWay(0, armSide, V(0, 0, 0));
  const E = V(0, 0, 0), S2 = V(0, 0, 0), dir = V(0, 0, 0), n = V(0, 0, 0), n0 = V(0, 0, 0), nb = V(0, 0, 0), d = V(0, 0, 0), d2 = V(0, 0, 0), n2 = V(0, 0, 0);
  const u = V(0, 0, 0), f = V(0, 0, 0), h = V(0, 0, 0), zax = V(0, 0, 1);
  const a4 = V(1, 0, 0), a6 = V(1, 0, 0), su = V(0, 1, 0), sf = V(0, 1, 0), tmp = V(0, 0, 0), tmp2 = V(0, 0, 0), steerV = V(0, 0, 0);
  const _m = new THREE.Matrix4();
  const band = (b, a, c, k) => { b.position.copy(a).lerp(c, k); b.quaternion.setFromUnitVectors(V(0, 0, 1), c.clone().sub(a).normalize()); };
  const at = (a, b, k, sd, dd) => a.clone().lerp(b, k).addScaledVector(sd, dd);
  const perp = (out, v, axis) => { out.copy(v).addScaledVector(axis, -v.dot(axis)); return out.lengthSq() > 1e-6 ? out.normalize() : null; };
  // the arm's own bulk, for the clearance: capsules (a, b, r), the J2 drum,
  // the upper link, the elbow drum and the forearm (the wrist and hand are
  // where the plan puts them: not the elbow's to move)
  const bulk = [{ a: V(0, 0, 0), b: V(0, 0, 0), r: 1.65 }, { a: V(0, 0, 0), b: V(0, 0, 0), r: 1.82 }, { a: V(0, 0, 0), b: V(0, 0, 0), r: 2.1 }, { a: V(0, 0, 0), b: V(0, 0, 0), r: 1.42 }];
  const E1 = V(0, 0, 0), S21 = V(0, 0, 0), d1 = V(0, 0, 0);
  let len0 = 0, a = 0, hh = 0, psi = 0, worst = 0;
  const L1 = ARM.upper, L2 = ARM.fore;
  // J2 and the elbow for the shoulder at S, the wrist at W and the elbow
  // carried along nn round the J2-to-wrist line: J1 turns the crank to the
  // elbow's own side of the pin's axis, and J2 moves with it, so the two
  // are found together (a few turns settle it)
  const chain = (S, W, nn, Eo, S2o, dOut, turns = 3) => {
    for (let it = 0; it < turns; it++) {
      S2o.copy(S).addScaledVector(dOut, ARM.crank);
      dir.copy(W).sub(S2o);
      len0 = dir.length() || 1e-4;
      dir.multiplyScalar(1 / len0);
      const len = THREE.MathUtils.clamp(len0, Math.abs(L1 - L2) + 0.5, L1 + L2 - 0.05);
      a = (L1 * L1 - L2 * L2 + len * len) / (2 * len); hh = Math.sqrt(Math.max(0, L1 * L1 - a * a));
      if (!perp(n, nn, dir) && !perp(n, up, dir)) n.copy(zax).negate();
      Eo.copy(S2o).addScaledVector(dir, a).addScaledVector(n, hh);
      if (!perp(d2, tmp2.copy(Eo).sub(S), zax)) d2.copy(up);
      const settled = d2.dot(dOut) > 0.99995;
      dOut.copy(d2);
      if (settled) break;
    }
  };
  // what the arm's bulk would sink into the obstacles (and the felt), with
  // the elbow at Eo: the sum of the squares of every overlap (listed, for
  // the lab, when `where` is given)
  let deepest = 0;
  const sunk = (S2o, Eo, W, obstacles, where = null) => {
    deepest = 0;
    bulk[0].a.copy(S2o); bulk[0].b.copy(S2o);
    bulk[1].a.copy(S2o); bulk[1].b.copy(Eo);
    bulk[2].a.copy(Eo); bulk[2].b.copy(Eo);
    bulk[3].a.copy(Eo); bulk[3].b.copy(W);
    let s = 0;
    for (let i = 0; i < 4; i++) {
      const c = bulk[i];
      // (the felt: for all but the forearm, whose wrist end the plan sets,
      // on the felt when it means to)
      if (i < 3) { const low = Math.min(c.a.y, c.b.y) - c.r - CLEAR.felt; if (low < 0) { s += low * low; deepest = Math.max(deepest, -low); if (where) where.push({ part: i, felt: +low.toFixed(2) }); } }
      if (obstacles) for (let j = 0; j < obstacles.length; j++) {
        const o = obstacles[j], gap = segDist(c.a, c.b, o.a, o.b) - c.r - o.r;
        if (gap < 0) { s += gap * gap; deepest = Math.max(deepest, -gap); if (where) where.push({ part: i, against: j, gap: +gap.toFixed(2) }); }
      }
    }
    return s;
  };
  let lastObstacles = null;
  let yaw = 0;
  return {
    group: g,
    // (the bulk as last solved, for the other arm's clearance, and how far
    // the elbow was steered off its way, in radians; worst: the deepest
    // overlap left, cm)
    bulk, get steered() { return psi; }, get sunk() { return worst; },
    // (the lab: what the bulk sinks into as it stands, part by part - the
    // J2 drum, the upper link, the elbow, the forearm - and against which
    // obstacle, by index)
    overlaps() { const w = []; sunk(S2, E, bulk[3].b, lastObstacles, w); return w; },
    // (the lab: the cost of each way round the elbow's circle, as the
    // steering sees it, from the chain as it stands)
    scan() {
      const W = bulk[3].b.clone(), S2c = S2.clone(), dirc = dir.clone(), out = [];
      n0.copy(n); nb.crossVectors(dirc, n0).normalize();
      for (let p = -Math.PI; p <= Math.PI + 1e-6; p += CLEAR.step) {
        tmp.copy(n0).multiplyScalar(Math.cos(p)).addScaledVector(nb, Math.sin(p));
        E1.copy(S2c).addScaledVector(dirc, a).addScaledVector(tmp, hh);
        const w = [];
        out.push({ deg: Math.round(p / DEG), E: E1.toArray().map(v => +v.toFixed(1)), sunk: +sunk(S2c, E1, W, lastObstacles, w).toFixed(3), w });
      }
      sunk(S2, E, W, lastObstacles);
      return out;
    },
    get joints() { return { S2: S2.toArray().map(v => +v.toFixed(1)), E: E.toArray().map(v => +v.toFixed(1)), W: bulk[3].b.toArray().map(v => +v.toFixed(1)), d: d.toArray().map(v => +v.toFixed(2)), n: n.toArray().map(v => +v.toFixed(2)) }; },
    // the shoulder (J1) at S, the wrist at W and the hand turned by q (seat
    // frame); across: the torso's side-to-side axis, for where the cables
    // leave it; along: its fore-and-aft axis, J1's; tt and on for the
    // lights; pref: the way the elbow is carried; obstacles: capsules
    // {a, b, r} the arm is steered clear of (see steer). Returns the
    // J2-to-wrist distance it was asked for.
    pose(S, W, q, across, along, tt = 0, on = 0, pref = PREF, obstacles = null) {
      zax.copy(along); lastObstacles = obstacles;
      // the crank's first guess: the elbow's own way (with the hand low and
      // near, the crank can settle either up or down with the elbow; this
      // finds the one the elbow's way is nearer), else toward the wrist
      if (!perp(d, pref, zax) && !perp(d, tmp.copy(W).sub(S), zax)) d.copy(up);
      chain(S, W, pref, E, S2, d);
      // the elbow steered round its circle, off anything in the way, as near
      // its own way as the room allows (the circle as it stands: the crank's
      // small move with it is settled after)
      psi = 0; worst = 0;
      {
        n0.copy(n); nb.crossVectors(dir, n0).normalize();
        const s0 = sunk(S2, E, W, obstacles);
        if (s0 > 1e-6) {
          let best = s0 * 1e3, bestPsi = 0;
          for (let i = 1; i <= CLEAR.steps; i++) {
            for (let sg = -1; sg <= 1; sg += 2) {
              const p = sg * i * CLEAR.step;
              tmp.copy(n0).multiplyScalar(Math.cos(p)).addScaledVector(nb, Math.sin(p));
              E1.copy(S2).addScaledVector(dir, a).addScaledVector(tmp, hh);
              const cost = sunk(S2, E1, W, obstacles) * 1e3 + (1 - Math.cos(p));
              if (cost < best) { best = cost; bestPsi = p; }
            }
          }
          // (then finer, either side of the best step)
          for (let k = 0; k < 4; k++) {
            const fine = CLEAR.step * [0.5, 0.25, 0.125, 0.0625][k];
            for (let sg = -1; sg <= 1; sg += 2) {
              const p = bestPsi + sg * fine;
              tmp.copy(n0).multiplyScalar(Math.cos(p)).addScaledVector(nb, Math.sin(p));
              E1.copy(S2).addScaledVector(dir, a).addScaledVector(tmp, hh);
              const cost = sunk(S2, E1, W, obstacles) * 1e3 + (1 - Math.cos(p));
              if (cost < best) { best = cost; bestPsi = p; }
            }
          }
          if (bestPsi) {
            psi = bestPsi;
            steerV.copy(n0).multiplyScalar(Math.cos(psi)).addScaledVector(nb, Math.sin(psi));
            chain(S, W, steerV, E, S2, d, 3);
          }
          sunk(S2, E, W, obstacles); worst = deepest;
        }
      }
      u.copy(E).sub(S2).normalize(); f.copy(W).sub(E).normalize();
      // J1 turns on the pin's axis: its crystal fore and aft, the crank out
      // of its side along d (the movement turns with it)
      _m.makeBasis(d, zax, tmp.crossVectors(d, zax).normalize());
      shoulder.position.copy(S); shoulder.quaternion.setFromRotationMatrix(_m);
      crank.position.copy(S); onAxis(crank, d);
      // J2 bends across the crank and the pin; the upper link swings in their
      // plane
      n2.crossVectors(zax, d);
      if (n2.lengthSq() < 1e-6) n2.copy(across); else n2.normalize();
      pitch.position.copy(S2); onAxis(pitch, n2);
      laid(upper, S2, E, true);
      roll3.position.copy(S2).addScaledVector(u, 4.4); onAxis(roll3, u);
      // J4 bends across the two links; J5 rolls the forearm
      const c4 = tmp.crossVectors(u, f);
      if (c4.lengthSq() > 1e-4) a4.copy(c4).normalize();
      elbow.position.copy(E); onAxis(elbow, a4);
      laid(fore, E, W, true);
      roll5.position.copy(E).addScaledVector(f, 4.4); onAxis(roll5, f);
      // (the top of each link: toward the elbow's side)
      perp(su, n, u) || su.copy(up); perp(sf, n, f) || sf.copy(up);
      laid(spines[0], at(S2, E, 0.36, su, 1.7), at(S2, E, 0.86, su, 1.56), true);
      laid(spines[1], at(E, W, 0.4, sf, 1.3), at(E, W, 0.74, sf, 1.18), true);
      band(seams[0], S2, E, 0.68); band(seams[1], E, W, 0.66);
      // J6 bends across the forearm and the hand; J7 rolls the flange
      h.set(0, 0, 1).applyQuaternion(q);
      const c6 = tmp.crossVectors(f, h);
      if (c6.lengthSq() > 1e-4) a6.copy(c6).normalize();
      wrist.position.copy(W); onAxis(wrist, a6);
      flange.position.copy(W); onAxis(flange, h);
      // the cable dress, out of the back of J1, round the crank, over the
      // outside of the arm into the wrist (only while the arm is out: under
      // the felt none shows)
      if (on) {
        const behind = V(-across.z, 0, across.x);   // (the torso's back: away from the player)
        if (behind.z < 0) behind.negate();
        const pts = [
          S.clone().addScaledVector(behind, 2.4).addScaledVector(d, 1.0),
          S.clone().addScaledVector(behind, 1.55).addScaledVector(d, ARM.crank * 0.62),
          S2.clone().addScaledVector(su, 2.4).addScaledVector(a4, 1.0 * armSide).addScaledVector(u, 1.5),
          at(S2, E, 0.55, su, 1.95).addScaledVector(a4, 0.85 * armSide),
          E.clone().addScaledVector(n, 2.45).addScaledVector(a4, 1.3 * armSide),
          at(E, W, 0.45, sf, 1.5).addScaledVector(a4, 0.75 * armSide),
          W.clone().addScaledVector(f, -2.0).addScaledVector(sf, 1.33).addScaledVector(a4, 0.55 * armSide)
        ];
        const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
        cable.geometry.dispose(); cable.geometry = new THREE.TubeGeometry(curve, 56, 0.25, 8, false);
        const wcurve = new THREE.CatmullRomCurve3(pts.map(p => p.clone().addScaledVector(a4, -0.4 * armSide)), false, 'centripetal');
        wire.geometry.dispose(); wire.geometry = new THREE.TubeGeometry(wcurve, 56, 0.07, 5, false);
        clamps.forEach((c, i) => { const t = CLAMP_AT[i]; c.position.copy(curve.getPointAt(t)); c.quaternion.setFromUnitVectors(V(0, 0, 1), curve.getTangentAt(t)); });
      }
      // the lights: a chase along the forearm
      lights.forEach((l, i) => {
        l.position.copy(at(E, W, 0.5 + i * 0.07, sf, 1.24 - i * 0.03)).addScaledVector(a4, -0.55 * armSide);
        const k = on * (0.2 + 0.8 * Math.pow(0.5 + 0.5 * Math.sin(tt * 9 - i * 1.4 - 2.2), 3));
        l.material.color.setRGB(1 * k + 0.08, 0.72 * k + 0.05, 0.36 * k + 0.03);
      });
      return len0;
    }
  };
}
// The least distance between two segments, a0-a1 and b0-b1 (the closest
// points of two capsules' axes), for the arms' clearance.
const _sA = V(0, 0, 0), _sB = V(0, 0, 0), _sR = V(0, 0, 0);
function segDist(a0, a1, b0, b1) {
  _sA.subVectors(a1, a0); _sB.subVectors(b1, b0); _sR.subVectors(a0, b0);
  const A = _sA.dot(_sA), E = _sB.dot(_sB), F = _sB.dot(_sR);
  let s = 0, t = 0;
  if (A <= 1e-9 && E <= 1e-9) return _sR.length();
  if (A <= 1e-9) t = clamp01(F / E);
  else {
    const C = _sA.dot(_sR);
    if (E <= 1e-9) s = clamp01(-C / A);
    else {
      const B = _sA.dot(_sB), den = A * E - B * B;
      s = den > 1e-9 ? clamp01((B * F - C * E) / den) : 0;
      t = (B * s + F) / E;
      if (t < 0) { t = 0; s = clamp01(-C / A); } else if (t > 1) { t = 1; s = clamp01((B - C) / A); }
    }
  }
  _sR.copy(_sA).multiplyScalar(s).add(a0).sub(b0).addScaledVector(_sB, -t);
  return _sR.length();
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
// The four pips, drawn (a font's suit glyphs vary by platform, and some
// turn the red two into emoji): each in a 100 x 100 box, its mass centred
// where a printer centres it - the knock-out lettering sits at PIP_MID.
const PIPS = {
  '♠': 'M50 3C63 22 95 38 95 60C95 74 85 82 73 82C64 82 57 77 54 71C55 82 59 90 67 97H33C41 90 45 82 46 71C43 77 36 82 27 82C15 82 5 74 5 60C5 38 37 22 50 3Z',
  '♥': 'M50 92C21 68 4 50 4 30C4 15 15 5 28 5C38 5 46 11 50 20C54 11 62 5 72 5C85 5 96 15 96 30C96 50 79 68 50 92Z',
  '♦': 'M50 2Q65 27 88 50Q65 73 50 98Q35 73 12 50Q35 27 50 2Z',
  '♣': 'M50 5a21 21 0 1 1 0 42a21 21 0 1 1 0-42ZM28 36a21 21 0 1 1 0 42a21 21 0 1 1 0-42ZM72 36a21 21 0 1 1 0 42a21 21 0 1 1 0-42ZM44 46H56L56 74C57 84 61 91 68 97H32C39 91 43 84 44 74Z'
};
const PIP_MID = { '♠': 55, '♥': 40, '♦': 50, '♣': 48 };
const pipSVG = (suit, cls) => `<svg class="${cls}" viewBox="0 0 100 100" aria-hidden="true"><path d="${PIPS[suit]}"/></svg>`;
// A card's face, as a casino deck's ace is printed: linen-finish stock
// (cream; black for S), the rank and its pip at two corners, one great pip
// in the middle with the house's mark knocked out of it in the stock's
// colour (where a maker puts its own on the ace of spades), an open line
// just inside its edge, the name under it in red, and the day's value in black.
function cardHTML(c) {
  const tier = tierOf(c.tier);
  const suit = SUITS[hash(c.name || '') % 4];
  const red = suit === '♥' || suit === '♦';
  const ev = typeof c.ev === 'number' && c.ev > 0 ? `~$${c.ev.toFixed(2)}` : '';
  const state = c.remaining > 0 ? fmtLeft(c.remaining) : 'Ready';
  const shown = cardShown(c);
  const label = `${c.name}, ${tier === 'U' ? 'unranked' : tier + ' tier'}, ${state}${ev ? ', about ' + ev.slice(2) + ' dollars a day' : ''}`;
  const rank = tier === 'U' ? '•' : tier;
  // The great pip is its own picture (an SVG drawn as an image): drawn
  // inline, its inset shapes - moved by their own transforms - land out of
  // place once the card is laid in 3D (the corner pips, untransformed, are
  // fine). So its colours are set here, matching the stylesheet's: --stock
  // and --ink on .r3t-front, and on .t-S.
  const S = tier === 'S';
  const stock = S ? '#0e0b09' : '#f3ead5';
  const ink = red ? (S ? '#e0353d' : '#a8121d') : (S ? '#e3c27a' : '#17120e');
  const mark = initials(c.name);
  // (the open line: the pip again a little smaller in the stock's colour,
  // and again smaller still in ink - a thin unprinted line just inside its
  // edge, as an engraver's plate leaves it)
  const inset = k => `translate(50 ${PIP_MID[suit]}) scale(${k}) translate(-50 -${PIP_MID[suit]})`;
  const pip = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill="${ink}" d="${PIPS[suit]}"/><path fill="${stock}" d="${PIPS[suit]}" transform="${inset(0.9)}"/><path fill="${ink}" d="${PIPS[suit]}" transform="${inset(0.85)}"/>` +
    `<text x="50" y="${PIP_MID[suit] + 10}" text-anchor="middle" fill="${stock}" font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="29" letter-spacing="0.5"${mark.length > 2 ? ' textLength="44" lengthAdjust="spacingAndGlyphs"' : ''}>${esc(mark)}</text></svg>`;
  const pipSrc = 'data:image/svg+xml,' + encodeURIComponent(pip);
  return `<div class="r3t-card-in">
    <div class="r3t-face r3t-front t-${tier}${red ? ' r3t-red' : ''}">
      <div class="r3t-frame"></div>
      <span class="r3t-idx r3t-tl"><b>${rank}</b>${pipSVG(suit, 'r3t-ipip')}</span>
      <span class="r3t-idx r3t-br"><b>${rank}</b>${pipSVG(suit, 'r3t-ipip')}</span>
      <img class="r3t-pip" src="${pipSrc}" alt="" draggable="false">
      <div class="r3t-name"${nameFit(c.name)}>${esc(c.name)}</div>
      <div class="r3t-meta"><span class="r3t-state">${esc(shown)}</span></div>
      <div class="r3t-linen"></div>
      <div class="r3t-sheen"></div><div class="r3t-scan"></div><div class="r3t-shade"></div>
    </div>
    <div class="r3t-face r3t-back t-${tier}"><div class="r3t-bk-art"></div><div class="r3t-bk-foil"></div><div class="r3t-sheen"></div><div class="r3t-shade"></div></div>
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
  return `<button type="button" class="r3t-ph-pickup" aria-label="Pick up phone">Pick up</button>
    <div class="r3t-ph-body"><div class="r3t-ph-screen">
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
  if (!scene.userData.set) throw new Error('table: the intro set is missing');
  const set = fineSet(scene.userData.set);
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
  // (a pendant this low over cloth throws a pool, not a wash: the cone is
  // narrow enough that the felt falls off toward the rail and into the
  // dark at the table's ends - where the light is, is where you look)
  const lampLight = new THREE.SpotLight(0xffeedd, 0, 0, 0.34, 1, 0);
  lampLight.position.set(0, 112, 34);
  lampLight.target.position.set(0, 0, 30);
  lampLight.castShadow = true;
  lampLight.shadow.mapSize.set(1024, 1024);
  lampLight.shadow.camera.near = 50; lampLight.shadow.camera.far = 200;
  lampLight.shadow.bias = -0.0004; lampLight.shadow.normalBias = 0.03; lampLight.shadow.radius = 4;
  seat.add(lampLight, lampLight.target);
  // (hidden until it has been made ready: see the end of prepareTable)
  seat.visible = false;
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
  // The dealer's port: a round hole in the felt in the middle of the
  // dealer's side, between the shoe and the rack, closed by an iris of nine
  // satin-black blades, each edged in gold, that turn back under the felt
  // as it opens (setPort: 0 shut, 1 open); a brass bezel round it,
  // engraved; below, a dark well with a ring of warm light in it.
  const port = buildPort(set);
  port.group.position.set(PORT.x, 0, PORT.z);
  seat.add(port.group);
  const setPort = port.set, portAperture = port.aperture;
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
    lampLight.intensity = 8.5 * k;
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
    const fo = Object.assign({ manual: false, reduced: false, duration: 0, onArrive: null, host: null, seatView: null, dealStyle: null, cards: 0 }, flyOpts);
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
    let sizeHand = null;
    const size = () => {
      world.size();
      // (the stage's box: after the arrival the landing, world.host, is
      // hidden, and a pinched-in page's window is only the part in view)
      const box = world.canvas.parentElement || world.host;
      const w = box.clientWidth || window.innerWidth, h = box.clientHeight || window.innerHeight;
      css.setSize(w, h);
      return w / h;
    };
    // The dealer has a canvas of its own over the cards (the cards are page
    // elements, always painted over the table's canvas, and a hand is on
    // top of the cards it deals), under the phone in yours.
    // (a stencil buffer: each card's shadow is kept off the card itself -
    // see the cards' masks below)
    const handGL = new THREE.WebGLRenderer({ alpha: true, antialias: true, stencil: true, powerPreference: 'low-power' });
    handGL.toneMapping = renderer.toneMapping; handGL.toneMappingExposure = renderer.toneMappingExposure;
    handGL.outputColorSpace = renderer.outputColorSpace;
    handGL.domElement.className = 'r3t-hand';
    const handScene = new THREE.Scene();
    // (the same studio the table's own brass mirrors, made again in this
    // canvas's context: without it the glaze, the gold and the crystals
    // had nothing to reflect but the three lights)
    handScene.environment = studioEnvironment(handGL);
    const HAND_ENV = 0.95;
    handScene.environmentIntensity = HAND_ENV;
    const handSeat = new THREE.Group();
    handSeat.position.copy(seat.position); handSeat.quaternion.copy(seat.quaternion);
    // (anything of the arm below the felt is inside the table: clipped)
    handGL.localClippingEnabled = true;
    const dealerMats = dealerMaterials();
    // (below the well's floor nothing of it is ever seen)
    const underFelt = [new THREE.Plane(V(0, 1, 0), 8.6)];
    Object.values(dealerMats).forEach(mat => { if (mat.isMaterial) mat.clippingPlanes = underFelt; });
    const torso = buildDealerTorso(dealerMats);
    handSeat.add(torso.group);
    // the two arms, [shoe side, other]: the shoe side's is the dealer's
    // left (it faces you), so its hand is a left hand
    const arms = SIDES.map(side => {
      const hand = buildDealerHand(dealerMats, side < 0);
      const arm = buildDealerArm(dealerMats, side);
      handSeat.add(hand, arm.group);
      return { side, hand, arm, now: { p: V(0, 0, 0), q: new THREE.Quaternion() }, wrist: V(0, 0, 0), pref: V(0, 0, 0), prevPalm: null };
    });
    // The table as the dealer's canvas sees it, in depth alone: the felt with
    // the port's hole in it and the well's wall, so what of it is down the
    // well shows through the hole and nowhere else.
    const feltShape = new THREE.Shape(); feltShape.moveTo(-200, -200); feltShape.lineTo(200, -200); feltShape.lineTo(200, 200); feltShape.lineTo(-200, 200); feltShape.closePath();
    { const h = new THREE.Path(); h.absarc(PORT.x, -PORT.z, PORT.r, 0, Math.PI * 2, true); feltShape.holes.push(h); }
    const hide = new THREE.MeshBasicMaterial({ colorWrite: false });
    {
      const felt = new THREE.Mesh(new THREE.ShapeGeometry(feltShape, 48), hide); felt.rotation.x = -Math.PI / 2; felt.position.y = -0.02; felt.renderOrder = -1;
      const wall = new THREE.Mesh(new THREE.CylinderGeometry(PORT.r - 0.03, PORT.r - 0.03, 8.8, 48, 1, true), hide); wall.position.set(PORT.x, -4.45, PORT.z); wall.renderOrder = -1;
      handSeat.add(felt, wall);
    }
    // (and while the iris is partly shut round the machine - a sulk - the
    // part of the hole its blades cover hides the machine too)
    const irisMask = new THREE.Mesh(new THREE.BufferGeometry(), hide);
    irisMask.rotation.x = -Math.PI / 2; irisMask.position.set(PORT.x, -0.015, PORT.z); irisMask.renderOrder = -1; irisMask.visible = false;
    handSeat.add(irisMask);
    let maskR = PORT.r;
    const maskIris = open => {
      const r = Math.max(0, portAperture(open)), want = r >= PORT.r - 0.05 ? PORT.r : Math.round(r * 20) / 20;
      if (want === maskR) return;
      maskR = want;
      irisMask.visible = want < PORT.r;
      if (irisMask.visible) { irisMask.geometry.dispose(); irisMask.geometry = new THREE.RingGeometry(Math.max(0.01, want), PORT.r + 0.05, 48); }
    };
    handScene.add(handSeat);
    // Its light: a key from the lamp overhead (the same lamp the table is
    // lit by), a cool fill from the room, and the room's own glow. The key
    // casts the machine's own shadow - its arms, its hands, its fingers -
    // onto the felt, onto the cards lying on it, and onto the shoe's lid
    // where a hand rests on it: surfaces that only take a shadow and are
    // otherwise clear, so the table's own canvas shows through them. (None
    // once the device has stepped down to no shadows: the table has none
    // of its own by then either.)
    handGL.shadowMap.enabled = world.quality > 1; handGL.shadowMap.type = THREE.PCFShadowMap;
    // (kept, for the house lights going down: see houseAt)
    const handLights = {};
    {
      const key = new THREE.DirectionalLight(0xffeedd, 2.3); key.position.set(-6, 112, 30); key.target.position.set(0, 0, 40);
      key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
      const sc = key.shadow.camera; sc.left = -48; sc.right = 48; sc.top = 48; sc.bottom = -48; sc.near = 70; sc.far = 135;
      key.shadow.bias = -0.0005; key.shadow.normalBias = 0.03; key.shadow.radius = 2;
      handSeat.add(key, key.target);
      const fill = new THREE.DirectionalLight(0xc9d2e6, 0.5); fill.position.set(6, 10, -30); handSeat.add(fill, fill.target);
      const hemi = new THREE.HemisphereLight(0xfff0e0, 0x1a1410, 0.55); handScene.add(hemi);
      // (a cool light from the dark behind the machine, off until the house
      // lights go down: then it draws the ceramic's edges out of the dark -
      // always there, so no shader changes when it comes up)
      const back = new THREE.DirectionalLight(0xbcc8e0, 0); back.position.set(4, 42, 120); back.target.position.set(0, 8, 55); handSeat.add(back, back.target);
      Object.assign(handLights, { key, fill, hemi, back });
      const catcher = new THREE.ShadowMaterial({ opacity: 0.52 });
      const onFelt = new THREE.Mesh(new THREE.ShapeGeometry(feltShape, 48), catcher); onFelt.rotation.x = -Math.PI / 2; onFelt.position.y = 0.05; onFelt.receiveShadow = true;
      const [la, lb] = shoe.userData.lid.map(p => p.clone().applyEuler(shoe.rotation).add(shoe.position));
      const lidLen = la.distanceTo(lb);
      const onLid = new THREE.Mesh(new THREE.PlaneGeometry(9.4, lidLen), catcher);
      onLid.position.copy(la).lerp(lb, 0.5).add(V(0, 0.02, 0));
      { const d = lb.clone().sub(la).normalize(), sd = d.clone().cross(V(0, 1, 0)).normalize(); onLid.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(sd, d, sd.clone().cross(d))); }
      onLid.receiveShadow = true;
      handSeat.add(onFelt, onLid);
    }
    // (what casts one: the machine's body - its links, drums, palms and
    // fingers, its cable. Not its glass, its lights or its gold, nor any part
    // thinner than a few millimetres - a screw, a seam, a trace - whose
    // shadow falls inside the one it sits on: half the parts, and so half
    // the shadow's draws, for the same shadow.)
    const extent = new THREE.Vector3();
    [torso.group, ...arms.flatMap(a => [a.hand, a.arm.group])].forEach(g => g.traverse(m => {
      if (!m.isMesh || m.userData.noShadow || m.material.isMeshBasicMaterial || [dealerMats.clear, dealerMats.gold, dealerMats.bright, dealerMats.blued, dealerMats.circuit].includes(m.material)) return;
      const geo = m.geometry;
      if (!geo.boundingBox) geo.computeBoundingBox();
      // (the cable's shape comes later, frame by frame: it casts)
      if (geo.boundingBox.isEmpty()) { m.castShadow = true; return; }
      geo.boundingBox.getSize(extent).multiply(m.scale);
      m.castShadow = Math.min(Math.abs(extent.x), Math.abs(extent.y), Math.abs(extent.z)) >= 0.35;
    }));
    world.layer(handGL);
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
    // (motion off: the UI is simply there, each card on its place the
    // moment the frame is and the dealer up at rest - no deal)
    const UI_IN = fo.reduced ? 0.01 : T.uiIn;
    const fov0 = camera.fov;
    const lens0 = world.lights.lensLight.intensity;
    const pendant0 = world.lights.pendant.intensity;
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
    // (lab: ?cards=N deals a hand of N, the ones there are repeated)
    if (fo.cards > cards.length) { const base = cards.slice(); for (let i = cards.length; i < Math.min(SLOTS.max, fo.cards); i++) cards.push(Object.assign({}, base[i % base.length], { id: `${base[i % base.length].id}~${i}` })); }
    const sampleStatus = () => ({ ready: cards.length, value: cards.reduce((t, c) => t + (c.ev || 0), 0), next: null, done: 0 });
    // (a third row of cards moves the whole hand nearer, and the wordmark
    // up toward the dealer, to make room)
    const rows = Math.ceil(cards.length / SLOTS.cols);
    const z0 = rows >= 3 ? L.z0 - 4 : L.z0;
    // (with a third row the wordmark moves up toward the dealer, a little
    // smaller, clear of both the cards and the port's bezel)
    if (table.group.userData.mark) { const m = table.group.userData.mark; m.position.z = FELT.b - (rows >= 3 ? 16.8 : 23); m.scale.setScalar(rows >= 3 ? 0.84 : 1); }
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
    // Each card in the dealer's canvas, in depth alone. The dealer is drawn
    // over the cards (they are page elements, under its canvas), so without
    // this a card it holds out in front of its body, one it throws across in
    // front of it, or one you bring up to you while it works, would have its
    // arm or its torso drawn over it. With it, whatever of the machine is
    // behind a card is hidden by that card, wherever the card is; what is in
    // front of it - the fingers on a card it holds - still shows. (Rounded
    // as the cards are, and a hair behind them, so fingertips resting on a
    // card stay in front of it.)
    //
    // And each card's shadow, cast by the same lamp as the machine's (the
    // key: along its light): a card on the felt sits on a tight, dark line
    // of shadow; lifted, the shadow comes off it, wider and softer and
    // fainter the higher it goes, and is gone by the time a card is up in
    // front of you. It falls on the felt and on the cards lying there, never
    // on the card that casts it (each card marks itself in the stencil).
    const keyDir = V(0, 0, 40).sub(V(-6, 112, 30)).normalize();
    const shadowKinds = [cardShadowTex(0.35, 1.2, true, 0.18), cardShadowTex(1.7, 5.2)];
    const maskGeo = new THREE.ShapeGeometry(roundRect(CARD.w, CARD.h, 0.36), 4), quadGeo = new THREE.PlaneGeometry(1, 1);
    const cardShade = cardObjs.map((o, i) => {
      const mask = new THREE.Mesh(maskGeo, new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide,
        stencilWrite: true, stencilRef: i + 1, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp }));
      mask.renderOrder = -1; mask.visible = false;
      const quads = shadowKinds.map(k => {
        const q = new THREE.Mesh(quadGeo, new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: k.tex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
          stencilWrite: true, stencilWriteMask: 0, stencilRef: i + 1, stencilFunc: THREE.NotEqualStencilFunc }));
        q.matrixAutoUpdate = false; q.visible = false; q.renderOrder = 1;
        return q;
      });
      handSeat.add(mask, ...quads);
      return { mask, quads };
    });
    const _sc = V(0, 0, 0), _sx = V(0, 0, 0), _sy = V(0, 0, 0), _sn = V(0, 1, 0);
    // (a point of the card, dropped along the light onto the felt)
    const onFeltAt = (v, out) => out.copy(v).addScaledVector(keyDir, -(v.y - 0.06) / keyDir.y);
    // (the mask a fifth of a millimetre further from the lens than its card,
    // along the line of sight: fingertips resting on the card stay in front
    // of it, and cards stacked a third of a millimetre apart keep their order
    // - a depth offset by slope would push a mask past the card under it)
    const _away = V(0, 0, 0);
    // card i at p, q, `lift` cm off the felt: its mask and its shadow
    const shadeCard = (i, p, q, shown) => {
      const S = cardShade[i];
      S.mask.visible = shown;
      if (shown) { S.mask.position.copy(p).addScaledVector(_away.copy(p).sub(camLocal.p).normalize(), 0.02); S.mask.quaternion.copy(q); }
      const h = Math.max(0, p.y - 0.04);
      // (on a light cloth the shadow is what parts a pale card from it, and
      // a lifted one from its place: deeper, the lighter the felt)
      const dk = 1 + 0.6 * (table.felt.userData.feltLight || 0);
      const k = [0.6 * dk * (1 - smoother(h / 0.7)), 0.3 * dk * smoother(h / 0.5) * (1 - smoother((h - 10) / 22))];
      onFeltAt(p, _sc);
      S.quads.forEach((Q, j) => {
        Q.visible = shown && k[j] > 0.004;
        if (!Q.visible) return;
        Q.material.opacity = k[j];
        // (the card's own two axes dropped onto the felt: a card on edge
        // casts a sliver, one lying flat its whole shape; the soft one
        // spreads a little as the card rises)
        const pad = shadowKinds[j].pad, grow = j ? 1 + 0.018 * Math.min(h, 20) : 1;
        onFeltAt(_sx.set(1, 0, 0).applyQuaternion(q).add(p), _sx).sub(_sc).multiplyScalar((CARD.w + 2 * pad) * grow);
        onFeltAt(_sy.set(0, 1, 0).applyQuaternion(q).add(p), _sy).sub(_sc).multiplyScalar((CARD.h + 2 * pad) * grow);
        // (a sliver still keeps a little width, so the quad never folds flat)
        if (_sx.lengthSq() < 0.01) _sx.set(0.1, 0, 0);
        if (_sy.lengthSq() < 0.01) _sy.set(0, 0, 0.1);
        Q.matrix.makeBasis(_sx, _sy, _sn).setPosition(_sc);
        Q.matrixWorldNeedsUpdate = true;
      });
    };
    // Your phone: not on the table but in the corner of the view, half out
    // of your pocket, and up in front of you on a tap (a page element,
    // over the hand's canvas; its moves are the page's own transitions)
    const phoneEl = document.createElement('div');
    phoneEl.className = 'r3t-phone';
    phoneEl.setAttribute('role', 'group');
    phoneEl.setAttribute('aria-label', 'Phone');
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
        obj.userData.ready = !(c.remaining > 0);
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
    let lookAt = null;
    const placeCamera = tt => {
      if (lookAt) {
        camera.up.copy(up);
        camera.position.copy(toWorld(lookAt.eye));
        camera.lookAt(toWorld(lookAt.aim));
        camera.fov = lookAt.fov;
      } else if (tt < FLY) {
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
    // A card in the hand, slot j of its stack: pinched at the fingertips by
    // one end, on its centreline, lying on from them along the fingers,
    // each further card a little lower and fanned. That is how a card is
    // drawn from the shoe and caught, and how the front row is laid. The
    // rows behind are laid with the hand turned round the card (k, 0 to 1:
    // a quarter turn), the pinch moving round to the card's corner - at 1
    // the hand lies across the card, its fingers toward the shoe and its
    // wrist out to its own side - so the hand never reaches back over a
    // card toward the port: the back row lies face down against it, and a
    // hand holding one by its end would have its wrist in the machine's
    // lift. Over a carry the card turns in the fingers to its row's grip,
    // as a dealer squares a card up as it goes down.
    const inHand = (j, k = 0) => {
      const th = clamp01(k) * Math.PI / 2;
      const q = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), Math.PI / 2).multiply(_q3.setFromAxisAngle(V(0, 0, 1), th));
      q.premultiply(_q2.setFromAxisAngle(V(0, 1, 0), j * 2.2 * DEG));
      // (the pinch, in the card's frame: its bottom end's centreline, round
      // to the corner of its long edge)
      const p = V(-Math.sin(th) * (CARD.w / 2 - 1.6), -CARD.h / 2 + 1.6 + 0.6 * Math.sin(th), 0).applyQuaternion(q).negate();
      p.x += j * 0.25; p.y += -0.95 - 0.07 * j; p.z += 0.3 * j;
      return { p, q };
    };
    // (the grip a card is laid with, by its row: the front row by its end,
    // the back row across - see inHand)
    const gripOf = i => clamp01(Math.floor(i / SLOTS.cols) / 2);
    // the hand that holds a card in slot j at card pose c, and the card's
    // pose in a hand at h (k: how far round to the side grip)
    const handFor = (c, j, k = 0) => { const s0 = inHand(j, k); const q = c.q.clone().multiply(s0.q.clone().invert()); return { p: c.p.clone().sub(s0.p.clone().applyQuaternion(q)), q }; };
    const cardIn = (h, j, out, k = 0) => { const s0 = inHand(j, k); out.q.copy(h.q).multiply(s0.q); out.p.copy(s0.p).applyQuaternion(h.q).add(h.p); return out; };
    // The shoe arm draws a card by its top end (the cards lie in the shoe
    // bottom end inward) and the other arm takes it by its bottom end, so
    // the card rides in the shoe arm's hand turned end for end in its own
    // plane: the same place, the other way round.
    const ENDWISE = new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), Math.PI);
    const cardInShoeHand = (h, out) => { cardIn(h, 0, out); out.q.multiply(ENDWISE); return out; };
    // Both arms straight up, the hands together over the middle of the torso,
    // the saddle at y and the yoke folded by `fold`: how it comes up through
    // the port and goes back down (the whole of it inside the port's ring),
    // and how it stands while the yoke drops open. Arm k's hand, palm to
    // the other's, fingertips up, as high as its arm reaches straight up
    // from J2 (the crank straight up off the shoulder).
    const reachUp = ARM.upper + ARM.fore - 0.1;
    const _upS = [V(0, 0, 0), V(0, 0, 0)];
    // (arm k's J2 at work, about: the shoulder with the yoke open and the
    // body square, the crank carried the elbow's way)
    const pivotAt = k => torso.shouldersAt(ARM.up, 0, 1, _upS)[k].clone().addScaledVector(elbowWay(0, SIDES[k], V(0, 0, 0)), ARM.crank);
    const upright = (k, y, fold = 0) => {
      // (the palms a finger apart: the wrist drums, wider than the hands,
      // just clear of each other)
      const sd = SIDES[k], S = torso.shouldersAt(y, 0, fold, _upS)[k];
      const wx = PORT.x + sd * 1.5, dx = wx - S.x;
      const wy = S.y + ARM.crank + Math.sqrt(Math.max(0, reachUp * reachUp - dx * dx));
      // (tagged: a move that starts from an upright starts from the upright
      // as it stands when it does - the yoke may be folding - see planned)
      return Object.assign(handPose(V(PORT.x + sd * 0.9, wy - WRIST.z, PORT.z), V(0, 1, 0), V(sd, 0, 0)), { upright: k });
    };
    const RISE = { open: 1.5, up: 1.15, swing: 0.5 };            // seconds before dealAt
    // A turning card's angle: pushed to 55 degrees by the hand, then over
    // on its own; or flicked (a sweep, a cascade) and over on its own.
    const angleAt = (ci, tt) => {
      const c = deal.cards[ci];
      if (tt < c.turn) return 0;
      if (c.push) {
        if (tt < c.turn + DEAL.push) return PUSH * smoother((tt - c.turn) / DEAL.push);
        const k = clamp01((tt - c.turn - DEAL.push) / DEAL.fall);
        return PUSH + (Math.PI - PUSH) * Math.pow(k, 1.7);
      }
      const k = clamp01((tt - c.turn) / DEAL.turn);
      // (up quickly off the felt, over, and falling faster onto its face)
      return Math.PI * (k < 0.5 ? 0.62 * easeOut(k / 0.5, 2) : 0.62 + 0.38 * Math.pow((k - 0.5) / 0.5, 1.6));
    };
    const turnEnd = c => c.turn + (c.push ? DEAL.push + DEAL.fall : DEAL.turn);
    const PUSH = 55 * DEG;

    // ---- The deal plan. Each arm's moves (segs) and, for each card, when it
    // is drawn from the shoe (pull), when the shoe arm passes it to the other
    // (hand), when that one lays it face down (lay) and when it starts to
    // turn (turn, pushed or not). Worked out once, as times from the tap. A
    // move ends either on a stop (a grab, a pass, a placement: there it
    // arrives dead still) or on a via point it flows through into the next
    // (a card drawn and carried off, a sweep swung into and out of): the path
    // is joined smooth through those. And the fingers: how far curled (below
    // 0, opened back) and how spread.
    const FIN = { rest: [0, 0], reach: [-0.35, 0.85], grip: [0.85, 0.08], flick: [1.15, 0.28], open: [-0.5, 1], relax: [0.32, 0.35], easy: [0.5, 0.1], poise: [0.28, 0.22] };
    // And the wrist: the hand's attitude, [pitch, roll] about its
    // fingertips (pitch over 0 tips the fingers down, the wrist up; roll
    // turns it about its length). Every grab, pass and placement is made
    // level, so a card is taken and laid true; in between the hand leans
    // into its work - reaching down into the shoe, lifting a card's end as
    // it draws it, banking as it swings, hooking its fingers down to flick a
    // row over - and each move can carry a lean that comes and goes with it.
    // The toss, in front of the machine's body, never over it: the shoe arm
    // holds the card out flat, face down, its long side across the table,
    // by its end nearer the shoe, and flicks it across to the other hand,
    // which waits open where it will arrive and takes the far end. It flies
    // as a flicked card does: one flat turn on the way, so it arrives the way
    // round it left; a little rise, less than a thrown stone's, the spin
    // holding it up; and a bow out toward you round the front of the
    // machine, the spin's pull. The catching hand closes on it as it arrives
    // and gives a centimetre with it.
    const TOSS = { T: 0.2, spin: 2 * Math.PI, g: 600, bow: 2.2 };
    const tossQ = cardInShoeHand(handPose(V(0, 0, 0), V(1, 0, 0), up), pose(V(0, 0, 0), new THREE.Quaternion())).q;
    // (the card's middle as it leaves the one hand and as the other has it)
    const TOSS_FROM = V(-6.4, 7.9, 45.0), TOSS_TO = V(5.8, 8.8, 44.2);
    const FLIGHT = (() => {
      const T = TOSS.T, acc = V(0, -TOSS.g, 8 * TOSS.bow / (T * T));
      const v0 = TOSS_TO.clone().sub(TOSS_FROM).addScaledVector(acc, -0.5 * T * T).multiplyScalar(1 / T);
      return { p0: TOSS_FROM.clone(), q0: tossQ.clone(), v0, acc, T, spin: TOSS.spin, v1: v0.clone().addScaledVector(acc, T) };
    })();
    // the shoe arm's hand as it lets go (it holds the card end for end - see
    // cardInShoeHand), wound back along the throw before it, and following
    // through after it; the catching hand, and where it gives to
    const RELEASE = handFor(pose(TOSS_FROM, tossQ.clone().multiply(ENDWISE)), 0);
    const along3 = (p, v, d) => p.clone().addScaledVector(v.clone().normalize(), d);
    const WINDUP = pose(along3(RELEASE.p, FLIGHT.v0, -0.5 * FLIGHT.v0.length() * DEAL.flick), RELEASE.q);
    const FOLLOW = pose(along3(RELEASE.p, FLIGHT.v0, 0.5 * FLIGHT.v0.length() * DEAL.follow), RELEASE.q);
    const CATCH = handFor(pose(TOSS_TO, tossQ), 0);
    const GIVEN = pose(along3(CATCH.p, FLIGHT.v1, 1.0), CATCH.q);
    // A card in flight at tt: along its arc, turning flat about the
    // vertical as it goes (F: a toss, from FLIGHT and its t0).
    const flightAt = (F, tt, out) => {
      const s = tt - F.t0, u = clamp01(s / F.T);
      out.p.copy(F.p0).addScaledVector(F.v0, s).addScaledVector(F.acc, 0.5 * s * s);
      out.q.setFromAxisAngle(up, F.spin * u).multiply(F.q0);
      // (and banked a few degrees into its bow, as a spinning card leans)
      out.q.premultiply(_q2.setFromAxisAngle(V(1, 0, 0), -0.08 * Math.sin(Math.PI * u)));
      return out;
    };
    // A pitch: a card flicked low along the table from a hand, from pose
    // `from` to its place `to` (face down). It flies, the spin holding it up
    // a little, touches down short of its place and slides the rest, the
    // felt taking its speed, its spin dying with it: it stops on its place,
    // square, the way round it lies there (one turn more than it needs, as
    // a flicked card spins).
    // (released low and all but flat - a touch upward, as a flick lifts the
    // card's leading edge - from the height its flight needs: `from`'s
    // height is ignored, and the result's y0 is where to let it go)
    const pitchOf = (from, to) => {
      const dirH = V(to.p.x - from.p.x, 0, to.p.z - from.p.z), D = dirH.length();
      dirH.multiplyScalar(1 / D);
      const Ds = THREE.MathUtils.clamp(D * 0.32, 3, 8), vh = 90 + 2.6 * D, Tf = (D - Ds) / vh, g = 820, lift = 14;
      const pT = to.p.clone().addScaledVector(dirH, -Ds);
      const y0 = pT.y + 0.5 * g * Tf * Tf - lift * Tf;
      from = pose(V(from.p.x, y0, from.p.z), from.q);
      const vy0 = lift;
      const vs0 = vh * 0.62, dec = vs0 * vs0 / (2 * Ds), Ts = vs0 / dec;
      const qRel = to.q.clone().multiply(from.q.clone().invert());
      const psi = ((2 * Math.atan2(qRel.y, qRel.w)) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
      const theta = psi + 2 * Math.PI;
      const qEnd = new THREE.Quaternion().setFromAxisAngle(up, theta).multiply(from.q);
      const fix = to.q.clone().multiply(qEnd.invert());
      return { p0: from.p.clone(), q0: from.q.clone(), y0, dirH, vh, vy0, g, Tf, pT, vs0, dec, Ts, theta, fix, v0: V(dirH.x * vh, vy0, dirH.z * vh), T: Tf + Ts };
    };
    const _pq = new THREE.Quaternion(), _pid = new THREE.Quaternion();
    const pitchAt = (P, tt, out) => {
      const s = tt - P.t0;
      if (s < P.Tf) { out.p.copy(P.p0).addScaledVector(P.dirH, P.vh * s); out.p.y = P.p0.y + P.vy0 * s - 0.5 * P.g * s * s; }
      else { const k = Math.min(s - P.Tf, P.Ts); out.p.copy(P.pT).addScaledVector(P.dirH, P.vs0 * k - 0.5 * P.dec * k * k); }
      const u = clamp01(s / P.T);
      out.q.setFromAxisAngle(up, P.theta * (1 - Math.pow(1 - u, 1.7))).multiply(P.q0);
      out.q.premultiply(_pq.copy(_pid).slerp(P.fix, smoother(u)));
      return out;
    };
    // The arms at rest once the deal is done, as a dealer waits: the shoe
    // arm's hand laid on the shoe's lid, fingers down the slope toward the
    // mouth; the other poised on its fingertips on the felt by the discard
    // rack, the wrist up, like a pianist's over the keys - the felt, the
    // wordmark and the cards all left clear.
    const toSeat = (obj, p) => p.clone().applyEuler(obj.rotation).add(obj.position);
    const REST = [(() => {
      const [la, lb] = shoe.userData.lid.map(p => toSeat(shoe, p));
      const d = lb.clone().sub(la).normalize(), side = d.clone().cross(up).normalize(), n = side.clone().cross(d).normalize();
      return handPose(la.clone().addScaledVector(d, 1.6).addScaledVector(n, 0.55), d.clone().negate(), n);
    })(), handPose(V(13.4, 0.62, 49.4), V(-0.42, -0.74, -0.52), up)];
    const restPose = k => REST[k];
    // A move of arm P's hand to b over dur, arcing up by lift; settle: a
    // servo's small shiver on arrival; via: on through b without a stop;
    // to: the fingers by the end of it; lean: the wrist's attitude by the
    // end of it; dip: an attitude that comes and goes over it; elbow: the
    // elbow's way by the end of it (see ELBOW); wrist: swung from the wrist
    // rather than the fingertips (for a move from stop to stop that turns
    // the hand a long way round). P is an arm's plan so far: its moves, its
    // time, where its hand is, its fingers, its wrist's attitude and its
    // elbow's way.
    // stiff: held rigid, with none of the trailing below (a flick and its
    // follow-through, a catch's give: a card leaves or meets the hand
    // exactly where the plan has it); v0, v1: the speeds it starts and ends
    // at, where they aren't still (a flick ends at the card's speed).
    const addMove = (P, b, dur, { lift = 0, settle = false, via = false, to = P.fin, lean = P.att, dip = [0, 0], elbow = P.el, wrist = false, stiff = false, v0 = null, v1 = null } = {}) => { P.segs.push({ kind: 'move', t0: P.t, t1: P.t + dur, a: P.at, b, lift, settle, via, f0: P.fin, f1: to, att0: P.att, att1: lean, dip, el0: P.el, el1: elbow, pivot: wrist, stiff, v0: v0 ? v0.clone() : V(0, 0, 0), v1: v1 ? v1.clone() : V(0, 0, 0), s0: 0, s1: 0 }); P.t += dur; P.at = b; P.fin = to; P.att = lean; P.el = elbow; };
    const holdP = (P, dur) => addMove(P, P.at, dur);
    // (arm P waits where it is until t)
    const untilP = (P, t) => { if (t > P.t + 1e-4) holdP(P, t - P.t); };
    // (through each via point at the mean of the speeds either side of it,
    // axis by axis - except along an axis where the way turns back there:
    // a turning point, still along that one, or the path would overshoot
    // it, out past the turn or down through the felt; dead still at every
    // stop)
    const smoothVias = segs => {
      for (let i = 0; i + 1 < segs.length; i++) {
        const S0 = segs[i], S1 = segs[i + 1];
        if (!S0.via || S0.kind !== 'move' || S1.kind !== 'move') continue;
        const dA = S0.t1 - S0.t0, dB = S1.t1 - S1.t0;
        const vA = S0.b.p.clone().sub(S0.a.p).multiplyScalar(1 / dA), vB = S1.b.p.clone().sub(S1.a.p).multiplyScalar(1 / dB);
        S0.v1 = V(0, 0, 0);
        ['x', 'y', 'z'].forEach(ax => { S0.v1[ax] = vA[ax] * vB[ax] > 0 ? (vA[ax] * dB + vB[ax] * dA) / (dA + dB) : 0; });
        S1.v0 = S0.v1.clone();
        S0.s1 = S1.s0 = 1;
      }
    };
    const makeDeal = style => {
      const n = cardObjs.length;
      const cardsP = cardObjs.map(() => ({ pull: Infinity, hand: Infinity, lay: Infinity, turn: Infinity, push: false, toss: null, pitch: null, rest: null, track: null, stampAt: Infinity }));
      // (shapes of the hand the deal asks for - the knock's - put on the
      // arms once they exist: see shapes)
      const handShapes = [];
      // each arm's plan so far: its moves, its time, where its hand is, its
      // fingers and its wrist's attitude (the plan starts as the arms, risen,
      // swing down to their work)
      const arm = k => ({ segs: [], t: dealAt - RISE.swing, at: upright(k, ARM.up), fin: FIN.rest, att: [0, 0], el: 0 });
      const A = arm(0), B = arm(1);
      const move = addMove, hold = holdP, until = untilP;
      // (a bank for a move from a to b: into the turn, as the hand swings
      // across itself)
      const bank = (a, b, k = 0.012) => { const d = b.p.clone().sub(a.p).applyQuaternion(a.q.clone().invert()); return THREE.MathUtils.clamp(-d.x * k, -0.3, 0.3); };
      const grabAt = () => handFor(shoePose(inShoe), 0), outAt = () => handFor(shoePose(pulled), 0);
      // The shoe arm draws card i: reaching down into the shoe, level at the
      // grab; drawing it out by its end, lifting it a little, on through.
      const drawOut = (i, first) => {
        const g0 = grabAt();
        move(A, g0, first ? DEAL.first : DEAL.grab, { lift: first ? 3 : 4.5, to: FIN.reach, lean: [0, 0], dip: [0.3, bank(A.at, g0)] });
        cardsP[i].pull = A.t;
        move(A, outAt(), DEAL.pull, { via: true, to: FIN.grip, lean: [-0.06, 0] });
      };
      // ... and flicks it across to the other hand (see TOSS): swung back to
      // its windup; a beat, when the other is there to take it; the flick,
      // stiff, letting go at the card's own speed; the follow-through, the
      // fingers opening. The other waits open where it arrives, and as it
      // does closes on it and gives with it (stiff: the card is where the
      // plan has it). Returns when it is caught.
      const flick = (i, first) => {
        // (a long wait for the other hand - a flop being turned - is spent
        // ready over the shoe's mouth, not holding a card wound back: the
        // draw is timed to end in the flick)
        const lead = (first ? DEAL.first : DEAL.grab) + DEAL.pull + DEAL.windup + DEAL.beat + DEAL.flick;
        const early = B.t + 0.06 - TOSS.T - lead - A.t;
        if (!first && early > 0.45) {
          const g0 = grabAt(), ready = pose(g0.p.clone().add(V(0, 3.2, 1.2)), g0.q);
          move(A, ready, 0.42, { lift: 2, to: FIN.relax, lean: [0, 0] });
          until(A, B.t + 0.06 - TOSS.T - lead);
        }
        drawOut(i, first);
        move(A, WINDUP, DEAL.windup, { lift: 1.2, to: FIN.grip, lean: [0, 0], dip: [-0.1, bank(A.at, WINDUP)] });
        const tr = Math.max(A.t + DEAL.beat + DEAL.flick, B.t + 0.06 - TOSS.T);
        until(A, tr - DEAL.flick);
        move(A, RELEASE, DEAL.flick, { to: FIN.grip, stiff: true, v1: FLIGHT.v0 });
        move(A, FOLLOW, DEAL.follow, { to: FIN.open, stiff: true, v0: FLIGHT.v0, dip: [0.14, 0] });
        const tc = tr + TOSS.T;
        cardsP[i].toss = Object.assign({}, FLIGHT, { t0: tr, t1: tc });
        until(B, tc);
        move(B, GIVEN, DEAL.give, { settle: true, to: FIN.grip, stiff: true, v0: FLIGHT.v1.clone().multiplyScalar(0.3) });
        cardsP[i].hand = tc;
        return tc;
      };
      // it lays card i at its face-down place (carried leading edge up,
      // banking into the swing, set down level; its weight goes into the
      // felt as it lands - see stampAt)
      // (held by its long edge by the time it is down - see inHand - the
      // card turning in the fingers over the carry)
      const lay = (i, dur, lift = 3.4, at = faceDown(cardObjs[i])) => { const b = handFor(at, 0, gripOf(i)); const t0 = B.t; move(B, b, dur, { lift, settle: true, to: FIN.grip, lean: [0, 0], dip: [-0.16, bank(B.at, b, 0.018)] }); if (!cardsP[i].carry) cardsP[i].carry = [t0, B.t]; cardsP[i].lay = cardsP[i].stampAt = B.t; };
      // (and the fingers open off it, spreading as they lift)
      const letGo = (dur = 0.1) => move(B, B.at, dur, { to: FIN.open });
      // back to where the next is caught, open
      const toCatch = (dur = DEAL.back) => move(B, CATCH, dur, { lift: 2.4, to: FIN.reach, lean: [0, 0], dip: [0.1, 0] });
      // the rows and the columns of the hand, as card indices
      const rows = [], cols = [];
      cardObjs.forEach((o, i) => { const r = Math.floor(i / SLOTS.cols), c = i % SLOTS.cols; (rows[r] = rows[r] || []).push(i); (cols[c] = cols[c] || []).push(i); });
      // the hand along a line of face-down cards, just past their far ends,
      // flicking each over as it passes (dir: across a row, or down a column;
      // per: seconds a card - the flop's are all but at once)
      // (the hand turned as it lays each row - see gripOf: pointed at the
      // player along the front row, sideways along the back row, its
      // fingers toward the shoe and its wrist out to its own side, where
      // pointed at the player it would have its wrist in the machine's lift
      // - turning as it goes down a column, which it ends just past the
      // last card's end, short of the lift)
      const fingersFor = g => V(0, -0.18, -1).lerp(V(-SIDES[1], -0.18, 0), g).normalize();
      const sweep = (line, along, per = DEAL.sweep) => {
        const ends = line.map(i => { const fd = faceDown(cardObjs[i]); return fd.p.clone().addScaledVector(topOf(cardObjs[i]), CARD.h / 2 + 0.4); });
        const ext = along === 'x' ? V(ends[0].x > ends[ends.length - 1].x ? 3 : -3, 0, 0) : V(0, 0, -0.8);
        const from = ends[0].clone().add(ext), to = ends[ends.length - 1].clone().sub(ext);
        from.y = to.y = 1.2;
        const P0 = handPose(from, fingersFor(gripOf(line[0])), up), P1 = handPose(to, fingersFor(gripOf(line[line.length - 1])), up);
        // (fingers hooked down, the hand rolled a little into the sweep)
        const roll = bank(P0, P1, 0.01);
        move(B, P0, 0.24, { lift: 2.5, via: true, to: FIN.flick, lean: [0.3, roll], dip: [-0.2, 0] });
        const dur = per * line.length + (per < DEAL.sweep ? 0.04 : 0.12);
        const t0 = B.t, d0 = from.distanceTo(to) || 1;
        line.forEach((i, k) => { cardsP[i].turn = t0 + dur * clamp01(from.distanceTo(ends[k]) / d0) - 0.03; });
        move(B, P1, dur, { via: true, to: FIN.flick, lean: [0.34, roll], dip: [0.06, 0] });
      };
      if (!n) return { arms: [A.segs, B.segs], cards: cardsP, end: dealAt, shapes: handShapes };
      // (the catching arm, risen, swings out to wait open where the first
      // will arrive)
      move(B, CATCH, DEAL.first + 0.15, { lift: 2, to: FIN.reach, lean: [0, 0], dip: [-0.1, 0] });
      if (style === 'single') {
        cardObjs.forEach((o, i) => {
          flick(i, i === 0);
          lay(i, DEAL.carry);
          hold(B, DEAL.settle);
          cardsP[i].turn = B.t; cardsP[i].push = true;
          B.segs.push({ kind: 'push', t0: B.t, t1: B.t + DEAL.push, card: i, f0: B.fin, f1: FIN.flick, el0: B.el, el1: B.el });
          B.t += DEAL.push; B.fin = FIN.flick; B.att = [0, 0];
          B.at = handFor(turned(o, PUSH, { p: V(0, 0, 0), q: new THREE.Quaternion() }), 0, gripOf(i));
          B.at.q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.62 * (1 - gripOf(i)), 0, 0)));
          if (i < n - 1) toCatch();
        });
      } else if (style === 'rows' || style === 'columns') {
        const groups = style === 'rows' ? rows : cols.map(c => c.slice());
        groups.forEach((g, gi) => {
          // the lay order, across the row (player's left to right) or down
          // the column (front to back); the deepest slot is laid first
          const order = style === 'rows' ? g.slice().sort((a, b) => cardObjs[b].userData.slot.x - cardObjs[a].userData.slot.x) : g.slice();
          order.forEach((i, k) => {
            flick(i, gi === 0 && k === 0);
            lay(i, k ? DEAL.carry * 0.9 : DEAL.carry);
            letGo(0.08);
            if (k < order.length - 1) toCatch();
          });
          hold(B, 0.08);
          sweep(order, style === 'rows' ? 'x' : 'z');
          if (gi < groups.length - 1) toCatch(DEAL.back + 0.06);
        });
      } else if (style === 'flop') {
        // A row at a time, as the flop is turned at hold'em: the cards laid
        // one on another in a stack on the first card's place - the one on
        // the machine's own side, so the stack is under its hand - squared
        // up a hair off true, as a hand lays them; then the fingers on the
        // top card slide it out along the row to the far end in one stroke,
        // the card under it dragged along to the middle, the bottom one left
        // where it lies; and the hand, hooked under their far ends, turns all
        // three over together.
        rows.forEach((row, ri) => {
          const order = row.slice().sort((a, b) => cardObjs[b].userData.slot.x - cardObjs[a].userData.slot.x);
          const base = faceDown(cardObjs[order[0]]);
          order.forEach((i, k) => {
            flick(i, ri === 0 && k === 0);
            // (the bottom one on its own place exactly: it is not moved again)
            const onStack = k ? pose(base.p.clone().add(V(Math.sin(i * 1.7) * 0.06, 0.05 * k, Math.cos(i * 2.3) * 0.06)), base.q.clone().multiply(_q1.setFromAxisAngle(V(0, 0, 1), Math.sin(i * 3.1) * 0.9 * DEG))) : base;
            cardsP[i].rest = onStack;
            lay(i, k ? DEAL.stack : DEAL.carry, k ? 2.2 : 3.4, onStack);
            if (k < order.length - 1) { letGo(0.07); toCatch(); }
          });
          if (order.length > 1) {
            // the stroke: the top card held under the fingers and slid flat
            // along the felt to its place; the ones under it dragged as far as
            // their own places, and left there
            const top = order[order.length - 1], t0 = B.t, to = faceDown(cardObjs[top]);
            const span = cardsP[top].rest.p.distanceTo(to.p) || 1;
            // (level and rigid the whole way - no lean, none of the hand's
            // trailing: tipped even a few degrees, a card sliding over another
            // would cut down through it)
            move(B, handFor(to, 0, gripOf(top)), DEAL.spread, { settle: true, to: FIN.grip, lean: [0, 0], stiff: true });
            cardsP[top].lay = cardsP[top].stampAt = B.t;
            order.slice(1, -1).forEach(i => { const fd = faceDown(cardObjs[i]); cardsP[i].track = { t0, t1: B.t, to: fd, frac: Math.max(0.05, Math.min(1, cardsP[i].rest.p.distanceTo(fd.p) / span)) }; });
            // (the top one was in the hand all the while, the bottom one never
            // left its place: neither lies anywhere but its own)
            cardsP[top].rest = cardsP[order[0]].rest = null;
            letGo(0.07);
            // all three over at once, from the stroke's end back along the row
            sweep(order.slice().reverse(), 'x', DEAL.flop);
          } else {
            cardsP[order[0]].rest = null;
            letGo(0.07);
            sweep(order, 'x', DEAL.flop);
          }
          if (ri < rows.length - 1) toCatch(DEAL.back + 0.06);
        });
      } else if (style === 'pitch') {
        // Caught, and pitched on: each card flicked across to the other hand
        // and, from there, flicked on low along the table into its place -
        // the front row first and each row's far end first, so no card slides
        // across one already down. A place too near the hand to pitch to (the
        // back row's, beside it) it lays, as a dealer places a near card.
        // Then both hands to rest, two knocks on the felt, and the backs
        // turn over in a wave out from them.
        const order = cardObjs.map((o, i) => i).sort((a, b) => (Math.floor(a / SLOTS.cols) - Math.floor(b / SLOTS.cols)) || (cardObjs[a].userData.slot.x - cardObjs[b].userData.slot.x));
        order.forEach((i, k) => {
          flick(i, k === 0);
          const fd = faceDown(cardObjs[i]);
          const held = cardIn(GIVEN, 0, pose(V(0, 0, 0), new THREE.Quaternion()));
          if (Math.hypot(fd.p.x - held.p.x, fd.p.z - held.p.z) < 9) { lay(i, DEAL.carry); letGo(0.08); }
          else {
            // (the hand dropped to the height the flight wants, level)
            const P = pitchOf(held, fd), rel = pose(GIVEN.p.clone().add(V(0, P.y0 - held.p.y, 0)), GIVEN.q);
            const dir = P.v0.clone().normalize(), sp = P.v0.length();
            // wound back against the throw, a beat, the flick (from still to
            // the card's speed over a few centimetres), the follow-through (a
            // hard stop: a servo's, not an arm's)
            // (the windup no longer than keeps the wrist well within the
            // arm's reach - see ARM: a throw along the fingers' own way is
            // wound back along the arm. The arm begins at J2, out on its
            // crank from the shoulder: taken here as carried out and up, the
            // elbow's own way at work)
            const shoulder = pivotAt(1);
            const wristAt = d => WRIST.clone().applyQuaternion(rel.q).add(rel.p).addScaledVector(dir, -d).distanceTo(shoulder);
            let wind = Math.min(4.5, 0.5 * sp * DEAL.flick);
            while (wind > 1 && wristAt(wind) > 27.5) wind -= 0.25;
            const fol = Math.min(3.5, 0.5 * sp * DEAL.follow);
            move(B, pose(rel.p.clone().addScaledVector(dir, -wind), rel.q), DEAL.windup, { lift: 0.6, to: FIN.grip, lean: [0, 0] });
            hold(B, DEAL.beat * 0.6);
            move(B, rel, 2 * wind / sp, { to: FIN.grip, stiff: true, v1: P.v0 });
            cardsP[i].pitch = Object.assign(P, { t0: B.t });
            cardsP[i].lay = B.t + P.T; cardsP[i].stampAt = B.t + P.Tf;
            move(B, pose(rel.p.clone().addScaledVector(dir, fol), rel.q), Math.max(0.05, 2 * fol / sp), { to: FIN.open, stiff: true, v0: P.v0, settle: true });
          }
          if (k < order.length - 1) toCatch();
        });
        // both at rest; then the knocks - down on the felt twice, beside the
        // hand - and the wave
        const settled = Math.max(...cardsP.map(c => c.lay));
        until(B, settled);
        move(A, restPose(0), DEAL.rest, { lift: 3, to: FIN.easy, lean: [0, 0], dip: [-0.15, 0], elbow: 1, wrist: true });
        move(B, restPose(1), DEAL.rest, { lift: 0.8, to: FIN.poise, lean: [0, 0], dip: [-0.15, 0], elbow: 1, wrist: true });
        hold(B, 0.18);
        // (on bare felt beside the hand's own side of the cards, level with
        // their middle)
        const r = restPose(1), fds = cardObjs.map(o => faceDown(o).p);
        const spot = V(Math.max(...fds.map(p => p.x)) + CARD.w / 2 + 2.4, r.p.y - 0.1, Math.min(44, (Math.min(...fds.map(p => p.z)) + Math.max(...fds.map(p => p.z))) / 2));
        const hi = pose(spot.clone().add(V(0, 3.4, 0.9)), r.q), lo = pose(spot.clone().add(V(0, -0.12, 0)), r.q);
        move(B, hi, 0.34, { lift: 1.5, to: FIN.easy, lean: [0.3, 0] });
        move(B, lo, 0.09, { settle: true });
        move(B, hi, 0.13);
        move(B, lo, 0.09, { settle: true });
        const knock = B.t, at = lo.p;
        handShapes.push({ k: 1, t0: knock - 0.62, t1: knock + 0.2, name: 'knock' });
        move(B, r, 0.4, { to: FIN.poise, lean: [0, 0] });
        cardObjs.forEach((o, i) => { const c = faceDown(o).p; cardsP[i].turn = knock + 0.06 + Math.hypot(c.x - at.x, c.z - at.z) / DEAL.wave; });
      } else {
        // spread: every card laid face down, one catch each, then a beat
        cardObjs.forEach((o, i) => {
          flick(i, i === 0);
          lay(i, DEAL.carry * 0.9, 3.2);
          letGo(0.08);
          if (i < n - 1) toCatch();
        });
        // (behind the spread, low, to let the backs be seen a moment; the
        // shoe arm opens its hand over them, palm up - there they are)
        const mid = V(0, 0, 0); cardObjs.forEach(o => mid.add(faceDown(o).p)); mid.multiplyScalar(1 / n);
        const far = Math.max(...cardObjs.map(o => faceDown(o).p.z)) + CARD.h / 2 + 3;
        // (both hands turned out, their wrists to their own sides, clear
        // of the lift just behind them)
        move(B, handPose(V(mid.x + 4, 4.5, far), V(-0.85, -0.35, -0.5), up), 0.34, { lift: 1.5, to: FIN.relax, lean: [-0.1, 0] });
        until(A, B.t - 0.3);
        move(A, handPose(V(mid.x - 7, 7.5, far + 1.5), V(0.85, 0.12, -0.5), V(0, -1, 0)), 0.5, { lift: 2, to: FIN.open, lean: [0, 0], wrist: true });
        hold(B, DEAL.show);
        // one touch on the first card's far end, and the cascade
        const first = faceDown(cardObjs[0]).p.clone().addScaledVector(topOf(cardObjs[0]), CARD.h / 2 + 0.3); first.y = 1.1;
        move(B, handPose(first, V(0, -0.2, -1), up), 0.22, { lift: 1.5, settle: true, to: FIN.flick, lean: [0.34, 0] });
        const t0 = B.t;
        const order = cardObjs.map((o, i) => i).sort((a, b) => (Math.floor(a / SLOTS.cols) - Math.floor(b / SLOTS.cols)) || (cardObjs[b].userData.slot.x - cardObjs[a].userData.slot.x));
        order.forEach((i, k) => { cardsP[i].turn = t0 + 0.04 + k * DEAL.cascade; });
        // (and away, up, with a turn of the wrist)
        move(B, handPose(first.clone().add(V(0, 10, 5)), V(0.5, 0.4, -1), V(-0.3, 1, 0)), 0.34, { via: true, to: FIN.open, lean: [-0.2, 0.25] });
      }
      // both hands down to rest on the felt once their work is done
      const lastTurn = Math.max(...cardsP.map(turnEnd));
      // (the shoe's hand turns a long way round from its follow-through to
      // the lid: swung from the wrist - see addMove)
      // (the laying hand low on its way, under its own shoulder, so the
      // arm never has its wrist up against J2 - a pose with no good elbow)
      if (style !== 'pitch') [A, B].forEach((P, k) => move(P, restPose(k), DEAL.rest, { lift: k ? 0.8 : 3, to: k ? FIN.poise : FIN.easy, lean: [0, 0], dip: [-0.15, 0], elbow: 1, wrist: !k }));
      smoothVias(A.segs); smoothVias(B.segs);
      return { arms: [A.segs, B.segs], cards: cardsP, end: Math.max(A.t, B.t, lastTurn), shapes: handShapes };
    };
    const pickStyle = () => {
      const want = fo.dealStyle;
      if (DEAL_STYLES.includes(want)) return want;
      return DEAL_STYLES[Math.floor(Math.random() * DEAL_STYLES.length)];
    };
    const dealStyle = fo.reduced ? 'none' : pickStyle();
    const deal = fo.reduced ? { arms: [[], []], cards: cardObjs.map(() => ({ pull: -1, hand: -1, lay: -1, turn: -1, push: false })), end: dealAt } : makeDeal(dealStyle);
    deal.style = dealStyle;
    // (settled: every card over, and both hands at rest on the felt)
    const settleAt = cardObjs.length ? deal.end + (fo.reduced ? 0.1 : 0.2) : dealAt;

    // ---- A focused card: lifted off the felt and brought up in front of
    // you, above the info's sheet, facing you. Drag it to turn it any way
    // (it keeps a little spin when you let go); the face you see is the
    // face toward you.
    const focal = { spin: new THREE.Quaternion(), vx: 0, vy: 0, dragging: false };
    const HELD = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.12, 0.07, -0.015, 'XYZ'));
    const camLocal = { p: V(0, 0, 0), q: new THREE.Quaternion() };
    const focalPose = out => {
      const fwd = V(0, 0, -1).applyQuaternion(camLocal.q), upv = V(0, 1, 0).applyQuaternion(camLocal.q);
      const half = Math.tan((camera.fov * DEG) / 2);
      const tall = aspect < 0.62;
      // (the card a third of the screen tall on a phone, half on a wide one,
      // centred in the space the sheet leaves above it)
      const d = CARD.h / (2 * half * (tall ? 0.34 : 0.46));
      out.p.copy(camLocal.p).addScaledVector(fwd, d).addScaledVector(upv, (tall ? 0.12 : 0.1) * 2 * half * d);
      // (held, not pinned to the glass: a card in a hand is tipped back a
      // little and turned a touch - its near edge closer than its far one,
      // so it reads as a thing in the air, not a picture of one. Your drag
      // turns it from there.)
      out.q.copy(camLocal.q).multiply(HELD).multiply(focal.spin);
      return out;
    };
    const focusPose = { p: V(0, 0, 0), q: new THREE.Quaternion() };
    const cardPose = { p: V(0, 0, 0), q: new THREE.Quaternion() };
    const handNow = { p: V(0, 0, 0), q: new THREE.Quaternion() };
    // Where every card is at tt. Cards riding in a hand are placed after the
    // hands (poseHeld); the rest here: in the air (flicked across, or
    // pitched), lying face down (on the flop's stack, or dragged along the
    // row by the card over it), or turning over and lying face up.
    const inAir = (c, tt) => (c.toss && tt >= c.toss.t0 && tt < c.toss.t1) || (c.pitch && tt >= c.pitch.t0 && tt < c.lay);
    const poseCards = tt => {
      cardObjs.forEach((obj, i) => {
        const c = deal.cards[i];
        const el = obj.element;
        if (!fo.reduced && tt < c.pull) { el.style.visibility = 'hidden'; obj.userData.held = false; shadeCard(i, cardPose.p, cardPose.q, false); return; }
        el.style.visibility = 'visible';
        const p = cardPose.p, q = cardPose.q;
        const air = !fo.reduced && inAir(c, tt);
        obj.userData.held = !fo.reduced && tt < c.lay && !air;
        if (obj.userData.held) return;
        let up = false;
        if (fo.reduced) { turned(obj, Math.PI, cardPose); up = true; }
        else if (air) { if (c.pitch && tt >= c.pitch.t0) pitchAt(c.pitch, tt, cardPose); else flightAt(c.toss, tt, cardPose); }
        else if (c.rest && tt < c.turn && !(c.track && tt >= c.track.t1)) {
          p.copy(c.rest.p); q.copy(c.rest.q);
          if (c.track && tt > c.track.t0) {
            const k = Math.min(1, smoother((tt - c.track.t0) / (c.track.t1 - c.track.t0)) / c.track.frac);
            p.lerp(c.track.to.p, k); q.slerp(c.track.to.q, k);
          }
        } else {
          turned(obj, angleAt(i, tt), cardPose);
          const te = turnEnd(c);
          if (tt >= te) { const b = tt - te; p.y += Math.max(0, 0.9 * Math.sin(b * 22) * Math.exp(-b * 9)); up = true; }
        }
        // (face up and still: one pass of the light down it, once - see
        // .r3t-sync)
        if (up !== !!obj.userData.synced) { obj.userData.synced = up; el.classList.toggle('r3t-sync', up && !fo.reduced); }
        placeCard(obj, tt);
      });
    };
    const poseHeld = tt => {
      cardObjs.forEach((obj, i) => {
        if (!obj.userData.held) return;
        const c = deal.cards[i];
        // (in the shoe arm's hand until it is flicked away, then in the
        // other's)
        // (in the other's, it turns round to the side grip over its carry -
        // see inHand)
        if (tt < (c.toss ? c.toss.t0 : c.hand)) cardInShoeHand(arms[0].now, cardPose);
        else cardIn(arms[1].now, 0, cardPose, c.carry ? gripOf(i) * smoother((tt - c.carry[0]) / Math.max(1e-4, c.carry[1] - c.carry[0])) : 0);
        placeCard(obj, tt);
      });
    };
    // A card under your finger (or the pointer) once the deal is done: it
    // comes up off the felt a centimetre to meet it, its shadow loosening
    // under it, its gilt edge catching the light (.r3t-hover) - and settles
    // back when you go. [k, target, from, t0] by card id, as for a lift.
    const hover = new Map();
    const hoverAt = (id, tt) => { const H = hover.get(id); if (!H) return 0; H[0] = fo.reduced ? H[1] : smoother(H[2] + (H[1] - H[2]) * clamp01((tt - H[3]) / 0.22)); return H[0]; };
    const setHover = (id, on) => {
      const H = hover.get(id), cur = H ? H[0] : 0, want = on ? 1 : 0;
      if (H && H[1] === want) return;
      hover.set(id, [cur, want, cur, tNow]);
      const o = cardObjs.find(x => x.userData.card.id === id);
      if (o) o.element.classList.toggle('r3t-hover', on);
      wake();
    };
    // (the lift toward you, the face toward you, and the lamp's reflection)
    const placeCard = (obj, tt) => {
      const el = obj.element, p = cardPose.p, q = cardPose.q, c = deal.cards[obj.userData.i];
      // (its weight going into the felt as it lands - pressed, and back,
      // with a servo's small give: see stampAt)
      const sa = tt - c.stampAt;
      let press = 0;
      // (at its deepest, about 0.06 s in, the card is at 95% - the stamp)
      if (!fo.reduced && sa >= 0 && sa < 0.18) { press = Math.sin(Math.PI * sa / 0.18) * Math.exp(-sa * 12); p.y -= 0.035 * press; }
      obj.scale.setScalar((1 - 0.12 * press) / CARD.px);
      const hk = hoverAt(obj.userData.card.id, tt);
      if (hk > 0) p.y += (fo.reduced ? 0 : 0.95) * hk;
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
      shadeCard(obj.userData.i, p, q, true);
      if ((lk > 0.02) !== el.classList.contains('r3t-lifted')) el.classList.toggle('r3t-lifted', lk > 0.02);
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
    // port until the deal; the port opens and it rises, both arms straight
    // up, the hands together; then each arm's moves, each on a quintic path
    // (dead still at a stop, with no jolt starting or stopping; on through a
    // via point at speed) with a servo's small shiver where it stops to place
    // something; and at the end both hands come down to rest on the felt,
    // where they stay. Over that, what makes it move like a thing with mass:
    // each hand trails and banks from its wrist as it speeds up, slows and
    // swings about - none of it at a stop, so every card lands exactly - and
    // the torso turns a little toward where its hands are working. (Motion
    // off: it is simply up, at rest, the cards dealt.)
    const onCard = (cp, j = 0, k = 0) => handFor(cp, j, k);
    const segAt = (S, tt) => {
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
      // (a wind-up: leaving a stop on a long move, the hand first gives a
      // few millimetres back the other way, as a servo loop takes up its
      // slack - level, never down toward the felt - and a little more or
      // less each time; not a flick or a catch: those start at speed, or wind
      // up on purpose)
      if (!sg.s0 && !sg.pivot && !sg.stiff && sg.v0.lengthSq() < 1e-6 && k < 0.22) {
        const dx = sg.b.p.x - sg.a.p.x, dz = sg.b.p.z - sg.a.p.z, Lh = Math.hypot(dx, dz);
        if (Lh > 5) { const w = Math.pow(Math.sin(Math.PI * k / 0.22), 4) * Math.min(0.26, 0.018 * Lh) * (0.7 + 0.6 * jitter(sg.t0, 1)); p.x -= dx / Lh * w; p.z -= dz / Lh * w; }
      }
      const q = sg.a.q.clone().slerp(sg.b.q, clamp01(h1 * sg.s0 + h2 * sg.s1 + h3));
      // (the wrist's attitude, about the fingertips)
      const e = smoother(k), bump = Math.pow(Math.sin(Math.PI * k), 2);
      const pitch = lerp(sg.att0[0], sg.att1[0], e) + sg.dip[0] * bump, roll = lerp(sg.att0[1], sg.att1[1], e) + sg.dip[1] * bump;
      if (pitch || roll) q.multiply(_attQ.setFromEuler(_attE.set(pitch, 0, roll)));
      // (swung from the wrist: the wrist goes the straight way from where it
      // was to where it will be, and the hand turns about it. Turned a long
      // way round about its fingertips instead, a hand swings its wrist out
      // in a wide arc - past the arm's reach, or down through the felt.)
      if (sg.pivot) {
        const at = (pp, qq, att) => { const qt = qq.clone(); if (att[0] || att[1]) qt.multiply(_attQ.setFromEuler(_attE.set(att[0], 0, att[1]))); return WRIST.clone().applyQuaternion(qt).add(pp); };
        const w = at(sg.a.p, sg.a.q, sg.att0).multiplyScalar(h0).addScaledVector(at(sg.b.p, sg.b.q, sg.att1), h3);
        w.y += sg.lift * bump;
        p.copy(w).sub(WRIST.clone().applyQuaternion(q));
      }
      return { p, q };
    };
    const _attQ = new THREE.Quaternion(), _attE = new THREE.Euler();
    // (a number 0..1 fixed for a moment in the plan and a channel: the same
    // move always varies the same way, but no two moves alike)
    const jitter = (t, ch) => { const v = Math.sin(t * 127.1 + ch * 311.7) * 43758.5453; return v - Math.floor(v); };
    const fingersAt = (sg, k) => { const e = smoother(clamp01(k * 2.4)); return [lerp(sg.f0[0], sg.f1[0], e), lerp(sg.f0[1], sg.f1[1], e)]; };
    // (arm k's fingers alone at any moment)
    const fingersNow = (k, tt) => {
      const S = deal.arms[k];
      if (fo.reduced) return k ? FIN.poise : FIN.easy;
      if (!S.length || tt < S[0].t0) return FIN.rest;
      const sg = segAt(S, tt);
      return fingersAt(sg, clamp01((tt - sg.t0) / Math.max(1e-4, sg.t1 - sg.t0)));
    };
    // the shoulders' height and the port, the same for both arms: the rise
    // out of the table, then any later lift of the whole machine (a sulk down
    // into the port, a peek out of it, the pop back up) - each {t0, t1, y0,
    // y1, o0, o1, ease}, o the iris
    const lifts = [];
    // The yoke's fold (see buildDealerTorso): up (0) through the port, out
    // level (1) at work. On the way up it drops open once the saddle is
    // FOLD.y clear of the felt - FOLD.out seconds, past level and back, a
    // servo settling under the weight - and on the way down it folds up in
    // the first FOLD.in seconds, before the saddle nears the felt. A lift
    // that never brings the saddle up (a peek) leaves it folded.
    const FOLD = { y: 2.6, out: 0.55, in: 0.4 };
    const foldOut = k => { k = clamp01(k); const c1 = 0.9, c3 = c1 + 1; return k < 1 ? 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2) : 1; };
    // (when a lift from y0 to y1 by ease first has the saddle FOLD.y up,
    // as a fraction of it; null if it never does)
    const clearsAt = (y0, y1, ease) => {
      if (y1 < FOLD.y) return null;
      let lo = 0, hi = 1;
      for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (lerp(y0, y1, ease(m)) < FOLD.y) lo = m; else hi = m; }
      return hi;
    };
    const riseEase = k => easeOut(k, 3);
    const riseClear = clearsAt(ARM.down, ARM.up, riseEase);
    const rising = tt => {
      if (fo.reduced) return { y: ARM.up, open: 1, fold: 1 };
      if (!cardObjs.length || tt < dealAt - RISE.open) return { y: ARM.down, open: 0, fold: 0 };
      const t0 = dealAt - RISE.up, T = RISE.up - RISE.swing;
      // (the fold as the rise leaves it, then as each lift since has left it)
      let fold = riseClear == null ? 0 : foldOut((tt - (t0 + riseClear * T)) / FOLD.out);
      if (!lifts.length || tt < lifts[0].t0) {
        const open = clamp01((tt - (dealAt - RISE.open)) / 0.32);
        return { y: lerp(ARM.down, ARM.up, riseEase((tt - t0) / T)), open, fold };
      }
      let L = lifts[0];
      for (const l of lifts) {
        if (l.t0 > tt) break;
        L = l;
        if (l.y1 > l.y0 + 0.5 && l.y1 >= ARM.up - 0.5) {
          if (l.foldAt == null) l.foldAt = clearsAt(l.y0, l.y1, l.ease);
          if (l.foldAt != null) fold = foldOut((tt - (l.t0 + l.foldAt * (l.t1 - l.t0))) / FOLD.out);
        } else if (l.y1 < l.y0 - 0.5 && l.y0 >= ARM.up - 0.5) fold = 1 - smoother(clamp01((tt - l.t0) / FOLD.in));
      }
      const k = clamp01((tt - L.t0) / Math.max(1e-4, L.t1 - L.t0));
      return { y: lerp(L.y0, L.y1, L.ease(k)), open: lerp(L.o0, L.o1, smoother(k)), fold };
    };
    // arm k's hand from the plan alone (no trailing), and its fingers
    const planned = (k, tt, y, fold = 1) => {
      if (fo.reduced) return { hp: restPose(k), f: k ? FIN.poise : FIN.easy, free: false, el: 1 };
      const S = deal.arms[k];
      if (!S.length || tt < S[0].t0) return { hp: upright(k, y, fold), f: FIN.rest, free: false, el: 0 };
      const sg = segAt(S, tt);
      const kk = clamp01((tt - sg.t0) / Math.max(1e-4, sg.t1 - sg.t0));
      let hp, free = false;
      if (sg.kind === 'up') hp = upright(k, y, fold);
      else if (sg.kind === 'push') {
        // (the fingertips stay on the card's end as it goes up; held by the
        // end, the hand bends back at the wrist as it pushes, so the wrist
        // stays low - held across, it tips with the card)
        const ang = angleAt(sg.card, tt), g = gripOf(sg.card);
        hp = onCard(turned(cardObjs[sg.card], ang, { p: V(0, 0, 0), q: new THREE.Quaternion() }), 0, g);
        hp.q.multiply(_attQ.setFromEuler(_attE.set(-0.62 * ang / PUSH * (1 - g), 0, 0)));
      }
      else { hp = along(sg.a.upright != null ? Object.assign({}, sg, { a: upright(k, y, fold) }) : sg, kk); free = true; }
      // (a servo's shiver where a move ends on a placement)
      const prev = segAt(S, tt - 0.13);
      if (prev && prev !== sg && prev.settle && tt - prev.t1 < 0.13 && tt >= prev.t1) {
        const dir = prev.b.p.clone().sub(prev.a.p); const L0 = dir.length();
        // (no two alike: each settle its own size, pitch and damping)
        if (L0 > 0.5) { const b = tt - prev.t1, j = jitter(prev.t1, 2), j2 = jitter(prev.t1, 3); hp.p.addScaledVector(dir.multiplyScalar(1 / L0), (0.11 + 0.09 * j) * Math.sin(b * (60 + 20 * j2)) * Math.exp(-b * (28 + 8 * j))); }
      }
      // (how much it trails, below: none where a move starts or ends dead
      // still - it comes in over the first few hundredths of the move and
      // goes over the last - so a hand setting a card down or lifting off
      // the felt never dips the card or its fingertips into it)
      const fade = free && !sg.stiff ? (sg.s0 ? 1 : smoother(kk / 0.15)) * (sg.s1 ? 1 : smoother((1 - kk) / 0.15)) : 0;
      return { hp, f: fingersAt(sg, kk), free, el: lerp(sg.el0, sg.el1, smoother(kk)), fade };
    };
    const wobble = new THREE.Quaternion(), wobE = new THREE.Euler();
    const mid = V(0, 0, 0);
    let glow = 0, prevT = 0, farthest = 0, farthestAt = null, lowest = { y: Infinity }, steered = { psi: 0, sunk: 0, at: null };
    // What the arms are steered clear of (see buildDealerArm, steer), as
    // capsules {a, b, r} in the seat's frame: the lift and its waist drum,
    // the saddle, each half of the yoke with its J1 drum, and - for the
    // second arm solved, and the first again if the second came near it -
    // the other arm's bulk.
    const house0 = [{ a: V(0, 0, 0), b: V(0, 0, 0), r: 3.05 }, { a: V(0, 0, 0), b: V(0, 0, 0), r: 2.0 }, { a: V(0, 0, 0), b: V(0, 0, 0), r: 2.0 }, { a: V(0, 0, 0), b: V(0, 0, 0), r: 2.0 }, { a: V(0, 0, 0), b: V(0, 0, 0), r: 2.2 }, { a: V(0, 0, 0), b: V(0, 0, 0), r: 2.2 }];
    // (each arm's list leaves out its own J1 drum: its crank holds the
    // upper link just clear of that by construction)
    const houseFor = [house0.filter((c, i) => i !== 4), house0.filter((c, i) => i !== 5)];
    const houseOf = (y, pose) => {
      const { shoulders, side, fwd, pins } = pose;
      house0[0].a.set(PORT.x, ARM.down, PORT.z); house0[0].b.set(PORT.x, y - 1.6, PORT.z);
      house0[1].a.set(PORT.x, y, PORT.z).addScaledVector(side, -ARM.pin); house0[1].b.set(PORT.x, y, PORT.z).addScaledVector(side, ARM.pin);
      [0, 1].forEach(k => {
        house0[2 + k].a.copy(pins[k]); house0[2 + k].b.copy(shoulders[k]);
        house0[4 + k].a.copy(shoulders[k]).addScaledVector(fwd, -2.1); house0[4 + k].b.copy(shoulders[k]).addScaledVector(fwd, 2.1);
      });
      return houseFor;
    };
    // (the lab's measures of the arms at work - see rollTable.reach(): the
    // farthest J2-to-wrist reach, the lowest wrist, the elbow steered the
    // farthest off its way and the deepest overlap the steering left)
    const measure = (k, a, reach, tt, y, shown) => {
      if (!shown || y < ARM.up - 0.01) return;
      if (reach > farthest) { farthest = reach; farthestAt = { t: +tt.toFixed(3), arm: k, wrist: a.wrist.toArray().map(v => +v.toFixed(1)), tips: a.now.p.toArray().map(v => +v.toFixed(1)) }; }
      if (a.wrist.y < lowest.y) lowest = { y: +a.wrist.y.toFixed(2), t: +tt.toFixed(3), arm: k };
      if (Math.abs(a.arm.steered) > Math.abs(steered.psi)) steered.psi = +a.arm.steered.toFixed(3), steered.at = { t: +tt.toFixed(3), arm: k };
      if (a.arm.sunk > steered.sunk) steered.sunk = +a.arm.sunk.toFixed(3), steered.sunkAt = { t: +tt.toFixed(3), arm: k };
    };
    const poseHand = tt => {
      const { y, open, fold } = rising(tt);
      const shown = y > ARM.down + 1;
      const hs = arms.map((a, k) => planned(k, tt, y, fold));
      // (the torso turns a little toward where its hands are: the middle of
      // the two, away from the player's side of the port)
      mid.copy(hs[0].hp.p).add(hs[1].hp.p).multiplyScalar(0.5);
      const yaw = y < ARM.up - 0.5 ? 0 : THREE.MathUtils.clamp(0.3 * Math.atan2(-(mid.x - PORT.x), -(mid.z - PORT.z)), -0.22, 0.22);
      const tp = torso.pose(y, yaw, tt, shown ? 1 : 0, fold);
      const { shoulders, side, fwd } = tp;
      const house = houseOf(y, tp);
      let speed = 0;
      arms.forEach((a, k) => {
        const { hp, f, free, fade } = hs[k];
        // (how it is speeding up, and which way, in the hand's own frame:
        // hung from the wrist, the fingers trail behind a change of speed -
        // down as it lifts, aside as it swings - and it banks into a swing)
        if (free && fade > 0) {
          const h = 1 / 60, pa = planned(k, tt - h, y, fold).hp.p, pb = planned(k, tt + h, y, fold).hp.p;
          const acc = pa.add(pb).addScaledVector(hp.p, -2).multiplyScalar(1 / (h * h)).applyQuaternion(hp.q.clone().invert());
          wobE.set(THREE.MathUtils.clamp(acc.y * 4e-5, -0.2, 0.2) * fade, THREE.MathUtils.clamp(-acc.x * 4e-5, -0.2, 0.2) * fade, THREE.MathUtils.clamp(-acc.x * 7e-5, -0.24, 0.24) * fade);
          wobble.setFromEuler(wobE);
          const wr = WRIST.clone().applyQuaternion(hp.q).add(hp.p), y0 = hp.p.y;
          hp.q.multiply(wobble);
          hp.p.copy(wr).sub(WRIST.clone().applyQuaternion(hp.q));
          // (low over the felt the fingers trail along it, not down into it)
          if (y0 < 3 && hp.p.y < y0) hp.p.y = y0;
        }
        a.now.p.copy(hp.p); a.now.q.copy(hp.q);
        a.hand.position.copy(hp.p);
        a.hand.quaternion.copy(hp.q);
        a.wrist.copy(WRIST).applyQuaternion(hp.q).add(hp.p);
        // (the shoe's arm first, against the house alone; the other against
        // the house and it; then the first again should the other still
        // have come against it - the laying arm, with more to do, keeps
        // its way)
        const reach = a.arm.pose(shoulders[k], a.wrist, hp.q, side, fwd, tt, shown ? 1 : 0, elbowWay(hs[k].el, a.side, a.pref, fold), k ? house[1].concat(arms[0].arm.bulk) : house[0]);
        if (k && arms[0].arm.bulk.some(c => a.arm.bulk.some(o => segDist(c.a, c.b, o.a, o.b) < c.r + o.r))) {
          const a0 = arms[0];
          const r0 = a0.arm.pose(shoulders[0], a0.wrist, a0.now.q, side, fwd, tt, shown ? 1 : 0, elbowWay(hs[0].el, a0.side, a0.pref, fold), house[0].concat(a.arm.bulk));
          measure(0, a0, r0, tt, y, shown);
        }
        measure(k, a, reach, tt, y, shown);
        a.hand.visible = a.arm.group.visible = shown;
        // the fingers: opening to reach, closed on the card it carries,
        // curled to flick one over, opened and spread as it lets go - the
        // index finger first, the others each a beat behind it, never quite
        // still (a servo's hold is a live one), the thumb opposing the grip
        // (a gesture's own shape of the hand - a point, a flutter, a drum -
        // comes in over the fingers and goes again)
        const shp = shapeAt(k, tt);
        const per = [0, 1, 2, 3].map(i => {
          const fi = i ? fingersNow(k, tt - i * 0.028) : f;
          const live = shown ? 0.03 * Math.sin(tt * 2.6 + i * 1.3 + k) + 0.015 * Math.sin(tt * 7.1 + i * 2.1 + k * 2) : 0;
          const c = fi[0] * (1 + 0.04 * i) + live;
          return shp ? [lerp(c, shp.per[i][0], shp.w), lerp(fi[1], shp.per[i][1], shp.w)] : [c, fi[1]];
        });
        let ft = fingersNow(k, tt + 0.02);
        if (shp) ft = [lerp(ft[0], shp.thumb[0], shp.w), lerp(ft[1], shp.thumb[1], shp.w)];
        a.hand.userData.fingers(per, ft[0], ft[1]);
        a.hand.userData.leds(shown ? 1 : 0, tt + k * 0.4);
        // the light in its circuits: up while it works, brighter as it moves
        const palm = V(0, 1.2, -9.8).applyQuaternion(hp.q).add(hp.p);
        const dt = tt - prevT;
        if (a.prevPalm && dt > 0 && dt < 0.2) speed = Math.max(speed, a.prevPalm.distanceTo(palm) / dt);
        a.prevPalm = palm;
      });
      setPort(open);
      maskIris(open);
      torso.group.visible = shown;
      glow = lerp(glow, shown ? 0.3 + Math.min(0.6, speed / 140) : 0, 0.35);
      // (in the dark, the gold in its circuits glows, and the rubies in its
      // movements warm - otherwise only while the arm works, and only a
      // little)
      const dark = fo.reduced ? 0 : 1 - houseAt(tt);
      dealerMats.ceramic.emissiveIntensity = glow + 0.5 * dark;
      dealerMats.circuit.emissiveIntensity = Math.max(0, glow - 0.3) * 2.5 + 1.2 * dark;
      dealerMats.pulse.value = tt;
      prevT = tt;
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
      // the intro's own world keeps time (the stick still drawing the dice;
      // for the Defiant Edge, the room's mirror dimmed round its die)
      scene.environmentIntensity = envRoom;
      world.lights.pendant.intensity = pendant0;
      world.stage(introT0 + tt);
      // (the house lights: down while the machine sulks)
      lightHouse(tt);
      // (and as you sit, the room's even light settles back: the lamp is
      // what lights this table, so its pool is what you see - the mirror
      // of the room stays in the metal, a little of it in the cloth)
      scene.environmentIntensity *= lerp(1, ROOM_ENV, fo.reduced ? 1 : smoother((tt - FLY * 0.45) / (FLY * 0.55)));
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
      // (a card up in front of you: the room behind it falls back - see
      // .r3t-focus)
      const stg = world.canvas.parentElement;
      if (stg && stg.classList.contains('r3t-focus') !== !!focusId) stg.classList.toggle('r3t-focus', !!focusId);
      const uiK = clamp01((tt - FLY + 0.1) / UI_IN);
      css.domElement.style.setProperty('--r3t-in', uiK.toFixed(3));
      css.domElement.classList.toggle('r3t-hide', uiK <= 0);
      if (!arrived && tt >= FLY) { arrived = true; if (fo.onArrive) fo.onArrive(css.domElement); }
    };
    // (the machine's first frame drawn unseen, at rest, once its shaders are
    // compiled: what only a frame makes - its shadow's shaders, its textures
    // - is made before the rise rather than in its first frames. In the same
    // task as the frame drawn over it, so it is never on screen.)
    let armsCompiled = false, armsWarmed = false;
    // (and once compiled, that frame at once - then the frame on screen again
    // over it, in the same task - rather than on the next frame the table
    // draws, which may be the one you tapped for)
    try { handGL.compileAsync(handScene, camera).catch(() => {}).then(() => { armsCompiled = true; if (!disposed && !armsWarmed) { warmArms(); drawArms(); } }); } catch (e) { armsCompiled = true; }
    const warmArms = () => {
      armsWarmed = true;
      if (fo.reduced) return;
      poseHand(settleAt + 1);
      world.lens(() => handGL.render(handScene, camera));
      poseHand(tNow);
    };
    const drawArms = () => { if (!armsWarmed && armsCompiled) warmArms(); world.lens(() => handGL.render(handScene, camera)); };
    const draw = () => {
      world.paint();
      css.render(cssScene, camera);
      drawArms();
    };
    // The frame on screen, drawn: at rest it is held, and drawn sharp.
    const show = () => { if (running) draw(); else world.rest(draw); };
    // (busy: the deal, a card lifting or going down, or one still spinning
    // from a flick)
    const busyUntil = () => Math.max(settleAt, ...[...lift.values()].map(L => L[3] + 0.5), ...[...hover.values()].map(H => H[3] + 0.3), spinning() ? tNow + 1 : 0, gestureEnd);
    let woke = 0;
    // (about 60 frames a second, evenly, on any screen: see makePacer in
    // intro.mjs)
    const pacer = world.pacer ? world.pacer() : null, armsPacer = world.pacer ? world.pacer() : null;
    const loop = now => {
      if (!running) return;
      if (pacer && !pacer.due(now)) { raf = requestAnimationFrame(loop); return; }
      // (slow frames play the shot slower rather than skip through it, down
      // to 10 a second)
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
      // (the frames' pace sets their resolution - not the first few after a
      // rest, which carry its resize, nor one after the tab was away)
      if (last && ++woke > 6 && !document.hidden && now - last < 250) world.pace((now - last) / 1000);
      last = now;
      update(tNow + dt);
      // (the last of the moves: its frame is the one that stays)
      if (tNow > busyUntil()) { running = false; world.rest(draw); return; }
      draw();
      raf = requestAnimationFrame(loop);
    };
    const wake = () => { if (disposed || fo.manual) { if (fo.manual) { update(tNow); world.rest(draw); } return; } if (!running) { running = true; last = 0; woke = 0; if (pacer) pacer.reset(); world.move(); raf = requestAnimationFrame(loop); } };
    // (a lost context back: its frame drawn again - the table's world first
    // makes the studio its surfaces mirror again, see intro.mjs)
    if (world.onRestore) world.onRestore(() => { if (!disposed) show(); });
    // (the dealer's copy of the studio is a buffer in its own context, which
    // the loss empties too: made again before its frame is drawn)
    handGL.domElement.addEventListener('webglcontextrestored', () => {
      if (disposed) return;
      const old = handScene.environment;
      handScene.environment = studioEnvironment(handGL);
      if (old) old.dispose();
      show();
    });

    // ---- Waiting. Once the deal is done the machine stays up on the table,
    // and while a card you can collect sits there uncollected it lets you
    // know, more and more plainly the longer it waits: a point at the best
    // of them (8 s), a wave over them (20 s), spirit fingers (34 s), the
    // fingers of the hand on the shoe drumming while the other tilts - well?
    // (50 s), and at last a sulk: down into its port, the iris closing round
    // the hands, only the fingertips showing (70 s), with a peek out now and
    // then. Any touch at the table brings it straight back up. Nothing ready,
    // it waits quietly; collect one, and the laying hand knocks twice on the
    // felt - a dealer's thanks. A gesture is more moves on each arm's plan,
    // made then and there; one that moves only the arms (all but the sulk,
    // the peek and the pop, which work the port) redraws only the arms'
    // canvas, so the table stays still and sharp under it. (Motion off, a
    // hidden page, a card up, the phone in your hand, a view or a dialog
    // over the table: none of it.)
    const SHAPES = {
      point: () => ({ per: [[-0.12, 0.04], [1.25, 0], [1.28, 0], [1.22, 0]], thumb: [0.95, 0] }),
      wave: u => ({ per: [0, 1, 2, 3].map(i => [-0.14 + 0.13 * Math.sin(u * 9 + i * 0.9), 0.95]), thumb: [-0.05, 0.8] }),
      spirit: u => ({ per: [0, 1, 2, 3].map(i => [0.2 + 0.5 * Math.sin(u * 31 + i * 1.9), 1.05]), thumb: [0.12 + 0.3 * Math.sin(u * 31 + 7.6), 0.9] }),
      // (rolls from the little finger to the index, twice a second: each
      // finger lifts off the lid and comes down on it)
      drum: u => ({ per: [0, 1, 2, 3].map(i => { const x = u * 2.1 - (3 - i) * 0.085; const ph = x - Math.floor(x); return [0.5 - 0.95 * Math.exp(-Math.pow((ph - 0.3) / 0.045, 2)), 0.14]; }), thumb: [0.3, 0.1] }),
      knock: () => ({ per: [[1.15, 0], [1.2, 0], [1.2, 0], [1.1, 0]], thumb: [0.9, 0] })
    };
    const shapes = [[], []];                  // per arm: { t0, t1, fn, fade }
    (deal.shapes || []).forEach(sh => shapes[sh.k].push({ t0: sh.t0, t1: sh.t1, fn: SHAPES[sh.name], fade: 0.1 }));
    const shapeAt = (k, tt) => {
      const list = shapes[k];
      for (let i = list.length - 1; i >= 0; i--) {
        const sh = list[i];
        if (tt < sh.t0 || tt > sh.t1) continue;
        const w = smoother(Math.min((tt - sh.t0) / sh.fade, (sh.t1 - tt) / sh.fade, 1));
        return Object.assign(sh.fn(tt - sh.t0), { w });
      }
      return null;
    };
    // (the sulk: the machine down in its port with only the fingertips of
    // its raised hands above the felt, the iris closed round them)
    const SULK = { y: 6 - upright(0, 0, 0).p.y, open: 0.52 };
    const backOut = k => { const c1 = 1.25, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };
    // arm k's plan from t on, after whatever it is already doing
    const planFrom = (k, t) => {
      const S = deal.arms[k], L = S[S.length - 1];
      return { segs: S, t: Math.max(t, L ? L.t1 : t), at: L && L.b ? L.b : restPose(k), fin: L ? L.f1 : FIN.easy, att: L && L.att1 ? L.att1 : [0, 0], el: L ? L.el1 : 1 };
    };
    // both arms straight up over the torso until t1, following it down or up
    const upTo = (k, t0, t1, yEnd) => { const P = planFrom(k, t0); P.segs.push({ kind: 'up', t0: P.t, t1: Math.max(t1, P.t), f0: P.fin, f1: FIN.rest, el0: P.el, el1: 0, b: upright(k, yEnd) }); };
    // (what the port and each arm still had planned from t on is dropped: a
    // move under way ends there, one not yet begun is gone, and a shape of
    // the hand under way fades out)
    const cutAt = t => {
      for (let i = lifts.length - 1; i >= 0; i--) if (lifts[i].t0 >= t) lifts.splice(i, 1);
      for (let i = house.length - 1; i >= 0; i--) if (house[i][0] >= t) house.splice(i, 1);
      [0, 1].forEach(k => {
        const S = deal.arms[k];
        while (S.length && S[S.length - 1].t0 >= t) S.pop();
        if (S.length && S[S.length - 1].t1 > t) S[S.length - 1].t1 = t;
        shapes[k] = shapes[k].filter(sh => sh.t1 < t).concat(shapes[k].filter(sh => sh.t0 <= t && sh.t1 >= t).map(sh => Object.assign({}, sh, { t1: t + sh.fade })));
      });
    };
    const liftNow = () => rising(tNow);
    const readyNow = () => cardObjs.map((o, i) => (o.userData.ready ? i : -1)).filter(i => i >= 0);
    const gestures = {
      // (the laying hand reaches out along the line from its shoulder, low
      // over the table, the index straight out, and taps the card's far end
      // twice with its fingertip - on the card itself, however far forward
      // it lies, so there is no doubt which. The shoe's hand stays home: its
      // fingers point the other way, down the lid, and turning them round
      // on the way out would swing its wrist past its reach.)
      point(t0, targets) {
        const card = cardObjs[targets[0]], c = card.userData.slot, B = planFrom(1, t0);
        const toward = V(c.x - pivotAt(1).x, 0, c.z - PORT.z).normalize();
        const end = c.clone().addScaledVector(topOf(card), CARD.h / 2 - 0.8);
        const over = handPose(end.clone().add(V(0, 2.4, 0)), toward.clone().multiplyScalar(0.91).add(V(0, -0.42, 0)), up);
        const tap = pose(end.clone().add(V(0, 0.8, 0)).addScaledVector(toward, 0.3), over.q);
        addMove(B, over, 0.7, { lift: 3, to: FIN.relax, lean: [0, 0], elbow: 0.35, wrist: true });
        addMove(B, tap, 0.13); addMove(B, over, 0.14); addMove(B, tap, 0.13); addMove(B, over, 0.16);
        holdP(B, 0.4);
        const back = B.t;
        addMove(B, restPose(1), 0.7, { lift: 2.5, to: FIN.poise, elbow: 1, wrist: true });
        shapes[1].push({ t0: t0 + 0.25, t1: back + 0.3, fn: SHAPES.point, fade: 0.22 });
        return B.t;
      },
      wave(t0, targets) {
        const pts = targets.map(i => cardObjs[i].userData.slot);
        const z = pts.reduce((a, p) => a + p.z, 0) / pts.length;
        const hiX = Math.max(...pts.map(p => p.x)) + 3.2, loX = Math.min(...pts.map(p => p.x)) - 3.2;
        const B = planFrom(1, t0);
        // (the hand over the cards' far ends, its fingers well down so the
        // wrist stays up and short of the lift behind the back row)
        const at = (x, r) => handPose(V(x, 5.2, z - 1), V(0, -0.5, -1), V(r, 1, 0));
        addMove(B, at(hiX, 0.12), 0.62, { lift: 3, to: FIN.open, lean: [0, 0], elbow: 0.3, wrist: true });
        const n = 4;
        for (let j = 1; j <= n; j++) addMove(B, at(lerp(hiX, loX, j / n), j % 2 ? -0.2 : 0.2), 1.3 / n, { via: j < n });
        const back = B.t;
        addMove(B, restPose(1), 0.66, { lift: 2.5, to: FIN.poise, elbow: 1, wrist: true });
        shapes[1].push({ t0: t0 + 0.3, t1: back + 0.2, fn: SHAPES.wave, fade: 0.25 });
        smoothVias(B.segs);
        return B.t;
      },
      spirit(t0) {
        const ends = [];
        [0, 1].forEach(k => {
          const P = planFrom(k, t0), sd = SIDES[k];
          // (the hands up in front of it, palms to you, the wrists well
          // clear of the felt)
          const hi = handPose(V(sd * 7.6, 18.4, 37.5), V(-sd * 0.12, 1, -0.3), V(0, 0.3, 1));
          addMove(P, hi, 0.58, { lift: 2, to: FIN.open, lean: [0, 0], elbow: 0, wrist: true });
          // (a little shimmy, side to side, while the fingers flutter)
          for (let j = 0; j < 4; j++) addMove(P, pose(hi.p.clone().add(V((j % 2 ? -1 : 1) * sd * 0.9, 0.35 * (j % 2), 0)), hi.q), 0.3, { via: j < 3 });
          addMove(P, hi, 0.18);
          const back = P.t;
          addMove(P, restPose(k), 0.68, { lift: 2, to: k ? FIN.poise : FIN.easy, elbow: 1, wrist: true });
          shapes[k].push({ t0: t0 + 0.38, t1: back + 0.12, fn: SHAPES.spirit, fade: 0.2 });
          smoothVias(P.segs);
          ends.push(P.t);
        });
        return Math.max(...ends);
      },
      drum(t0) {
        const A = planFrom(0, t0), B = planFrom(1, t0);
        holdP(A, 2.3);
        shapes[0].push({ t0: A.t - 2.3, t1: A.t, fn: SHAPES.drum, fade: 0.15 });
        // (the other rocks on its fingertips: well?)
        const r = restPose(1);
        addMove(B, r, 0.5, { lean: [0.05, 0.42] });
        holdP(B, 1.15);
        addMove(B, r, 0.6, { lean: [0, 0] });
        return Math.max(A.t, B.t);
      },
      knock(t0) {
        const B = planFrom(1, t0), r = restPose(1);
        const hi = pose(r.p.clone().add(V(0, 3.4, 0.9)), r.q), lo = pose(r.p.clone().add(V(0, -0.15, 0)), r.q);
        addMove(B, hi, 0.2, { to: FIN.easy, lean: [0.3, 0] });
        addMove(B, lo, 0.09, { settle: true }); addMove(B, hi, 0.13); addMove(B, lo, 0.09, { settle: true });
        addMove(B, r, 0.34, { to: FIN.poise, lean: [0, 0] });
        shapes[1].push({ t0: t0 + 0.05, t1: B.t - 0.12, fn: SHAPES.knock, fade: 0.1 });
        return B.t;
      },
      // down into the port: the arms straight up, the torso sinks, and once
      // its shoulders are below the felt the iris closes round the hands
      sulk(t0) {
        // (up to the upright as the yoke stands, open: it folds as the lift
        // starts, and the hands follow it up - see planned)
        [0, 1].forEach(k => { const P = planFrom(k, t0); addMove(P, upright(k, ARM.up, 1), 0.75, { lift: 2, to: FIN.rest, lean: [0, 0], elbow: 0, wrist: true }); });
        const tS = Math.max(...[0, 1].map(k => deal.arms[k][deal.arms[k].length - 1].t1));
        lifts.push({ t0: tS, t1: tS + 1.4, y0: ARM.up, y1: SULK.y, o0: 1, o1: 1, ease: smoother });
        lifts.push({ t0: tS + 1.4, t1: tS + 1.8, y0: SULK.y, y1: SULK.y, o0: 1, o1: SULK.open, ease: smoother });
        [0, 1].forEach(k => upTo(k, tS, tS + 1.8, SULK.y));
        // (the lights going down as it does)
        house.push([tS + 0.2, tS + 2.0, houseAt(tS), 0]);
        idle.sulk = true; idle.sinkAt = tS;
        return tS + 1.8;
      },
      // (a look out of the port, and back down)
      peek(t0) {
        const y1 = SULK.y + 8;
        lifts.push({ t0, t1: t0 + 0.3, y0: SULK.y, y1: SULK.y, o0: SULK.open, o1: 0.66, ease: smoother });
        lifts.push({ t0: t0 + 0.3, t1: t0 + 0.75, y0: SULK.y, y1, o0: 0.66, o1: 0.66, ease: easeOut });
        lifts.push({ t0: t0 + 1.75, t1: t0 + 2.25, y0: y1, y1: SULK.y, o0: 0.66, o1: 0.66, ease: smoother });
        lifts.push({ t0: t0 + 2.25, t1: t0 + 2.5, y0: SULK.y, y1: SULK.y, o0: 0.66, o1: SULK.open, ease: smoother });
        [0, 1].forEach(k => upTo(k, t0, t0 + 2.5, SULK.y));
        return t0 + 2.5;
      },
      // back up out of it, all at once, and down to rest with a flourish
      pop(t0) {
        // (from wherever the sulk or a peek has got to: what they still had
        // planned is dropped)
        const { y, open } = rising(t0);
        const lit = houseAt(t0);
        cutAt(t0);
        // (the lights up at once, as it comes)
        house.push([t0, t0 + 0.55, lit, 1]);
        lifts.push({ t0, t1: t0 + 0.16, y0: y, y1: y, o0: open, o1: 1, ease: smoother });
        lifts.push({ t0: t0 + 0.16, t1: t0 + 0.8, y0: y, y1: ARM.up, o0: 1, o1: 1, ease: backOut });
        const ends = [0, 1].map(k => {
          upTo(k, t0, t0 + 0.8, ARM.up);
          const P = planFrom(k, t0 + 0.8);
          // (no arc up: from straight up, the arm is at its full length)
          addMove(P, restPose(k), 0.7, { to: k ? FIN.poise : FIN.easy, lean: [0, 0], dip: [-0.25, 0], elbow: 1, wrist: true });
          return P.t;
        });
        idle.sulk = false;
        return Math.max(...ends);
      }
    };
    const idle = { since: 0, stage: 0, sulk: false, sinkAt: 0, ready: -1, peekAt: 0, away: false };
    // The house lights. When the machine sulks down into its port, the room
    // goes down with it: the lamp to a glow, the room's mirror (the studio
    // every glossy surface reflects) all but gone, so the brass and the gold
    // print go dark and the felt goes black; the cards stay as bright as
    // ever, lying in the dark; the machine, when it peeks out, is only its
    // edges, drawn by a cool light behind it, and the gold in its circuits,
    // glowing. A touch brings them straight back up with it. [t0, t1, from,
    // to] segments, the house's level at 1 (all up) to 0 (down).
    const house = [];
    const houseAt = tt => { let L = null; for (const h of house) if (h[0] <= tt) L = h; if (!L) return 1; return lerp(L[2], L[3], smoother((tt - L[0]) / Math.max(1e-4, L[1] - L[0]))); };
    const hemiRoom = [];
    scene.traverse(o => { if (o.isHemisphereLight) hemiRoom.push([o, o.intensity]); });
    const envRoom = scene.environmentIntensity;
    const lightHouse = tt => {
      const L = fo.reduced ? 1 : houseAt(tt), d = 1 - L;
      scene.environmentIntensity *= lerp(0.015, 1, L);
      // (and the dealer's own copy of the room's mirror with it)
      handScene.environmentIntensity = HAND_ENV * lerp(0.015, 1, L);
      if (d === 0 && !lightHouse.was) return;
      lightHouse.was = d > 0;
      lampLight.intensity *= lerp(0.1, 1, L);
      lampGlow.material.color.multiplyScalar(lerp(0.3, 1, L));
      hemiRoom.forEach(([o, i]) => { o.intensity = i * lerp(0.02, 1, L); });
      world.lights.pendant.intensity *= lerp(0.15, 1, L);
      handLights.key.intensity = 2.3 * lerp(0.2, 1, L);
      handLights.fill.intensity = 0.5 * lerp(0.1, 1, L);
      handLights.hemi.intensity = 0.55 * lerp(0.08, 1, L);
      handLights.back.intensity = 2.2 * d;
    };
    let gestureEnd = 0, armsRaf = 0, armsLast = 0;
    // The arms alone, frame by frame, to the end of what they are doing (the
    // table's own loop, if it starts meanwhile, takes over and draws them):
    // their canvas at a moving frame's resolution while they move, and the
    // last frame, the one that stays, sharp again.
    const armsLoop = now => {
      if (disposed || running) { armsRaf = 0; return; }
      if (armsPacer && !armsPacer.due(now)) { armsRaf = requestAnimationFrame(armsLoop); return; }
      const dt = armsLast ? Math.min(0.1, (now - armsLast) / 1000) : 1 / 60;
      armsLast = now;
      tNow = Math.min(tNow + dt, gestureEnd);
      poseHand(tNow);
      const done = tNow >= gestureEnd;
      world.layer(handGL, !done);
      drawArms();
      armsRaf = done ? 0 : requestAnimationFrame(armsLoop);
    };
    const playArms = () => { if (fo.manual || running || armsRaf) return; armsLast = 0; if (armsPacer) armsPacer.reset(); armsRaf = requestAnimationFrame(armsLoop); };
    const perform = (name, targets = readyNow()) => {
      if (!targets.length) targets = cardObjs.map((o, i) => i);
      gestureEnd = Math.max(gestureEnd, gestures[name](tNow + 0.02, targets));
      // (the port's own moves are the table's: its whole loop, to their end)
      if (name === 'sulk' || name === 'peek' || name === 'pop') wake(); else playArms();
    };
    // A gesture under way gives way to you: the hands go back to rest from
    // wherever they are (and up out of the port, if it was sulking).
    const giveWay = () => {
      idle.since = performance.now(); idle.stage = 0; idle.peekAt = 0;
      if (idle.sulk) {
        // (going down, or down: up out of the port. Still only raising its
        // hands for it: the sulk is called off, and the hands go home.)
        if (tNow >= idle.sinkAt) { const t0 = tNow + 0.02; gestureEnd = gestures.pop(t0); wake(); return; }
        for (let i = lifts.length - 1; i >= 0; i--) if (lifts[i].t0 >= tNow) lifts.splice(i, 1);
        for (let i = house.length - 1; i >= 0; i--) if (house[i][0] >= tNow) house.splice(i, 1);
        idle.sulk = false;
      }
      if (gestureEnd <= tNow + 0.02) return;
      // (the port's own moves - up out of a sulk - play out)
      if (lifts.some(l => l.t1 > tNow)) return;
      const y = liftNow().y;
      const now = [0, 1].map(k => planned(k, tNow, y));
      cutAt(tNow);
      let end = tNow;
      [0, 1].forEach(k => {
        const P = { segs: deal.arms[k], t: tNow, at: now[k].hp, fin: now[k].f, att: [0, 0], el: now[k].el };
        addMove(P, restPose(k), 0.5, { lift: 2, to: k ? FIN.poise : FIN.easy, elbow: 1, wrist: true });
        end = Math.max(end, P.t);
      });
      // (what it was going to do is gone: it is done when the hands are home)
      gestureEnd = end;
      playArms();
    };
    const idleTick = () => {
      if (disposed || fo.manual || fo.reduced || !arrived) return;
      // (away - another tab, the phone asleep - the wait starts over when you
      // are back, rather than every step it missed at once)
      if (document.hidden) { idle.away = true; return; }
      if (idle.away) { idle.away = false; idle.since = performance.now(); idle.peekAt = 0; if (!idle.sulk) idle.stage = 0; }
      if (document.documentElement.getAttribute('data-motion') === 'off') return;
      if (running || armsRaf || tNow < settleAt || gestureEnd > tNow) return;
      // (pinched in, you are looking something over: the machine holds
      // still, so the table stays a still - drawn at the zoom's own
      // resolution - rather than a moving frame's)
      const pinched = window.visualViewport && window.visualViewport.scale > 1.05;
      if (!idle.since || pinched || focusId || phoneHeld || document.body.classList.contains('r3-sheet-open') || document.querySelector('.sheet-backdrop.open')) { idle.since = performance.now(); idle.peekAt = 0; return; }
      const ready = readyNow();
      // (one fewer ready than last time: collected - a knock of thanks)
      if (idle.ready >= 0 && ready.length < idle.ready && !idle.sulk) { idle.ready = ready.length; perform('knock', ready); return; }
      idle.ready = ready.length;
      const waited = (performance.now() - idle.since) / 1000;
      if (idle.sulk) { if (waited - idle.peekAt > 26) { idle.peekAt = waited; perform('peek'); } return; }
      if (!ready.length) return;
      const next = [['point', 8], ['wave', 20], ['spirit', 34], ['drum', 50], ['sulk', 70]][idle.stage];
      if (next && waited >= next[1]) { idle.stage++; if (next[0] === 'sulk') idle.peekAt = waited; perform(next[0], ready); }
    };
    const idleClock = setInterval(idleTick, 700);

    // ---- Interaction.
    // (any touch or key at the table: the machine gives way, and its wait
    // starts over)
    css.domElement.addEventListener('pointerdown', giveWay);
    css.domElement.addEventListener('keydown', giveWay);
    // (a tap on the felt, or Enter, before the deal is done: straight to the
    // dealt table - the fly and the deal are the show, and a second open in
    // a day may not want it - the clock jumped to the settled frame)
    const skipAhead = e => {
      if (disposed || fo.manual || fo.reduced || tNow >= settleAt - 0.05) return;
      if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
      if (e.type === 'pointerdown' && e.target.closest && e.target.closest('.r3t-card, .r3t-phone, .r3t-info, button, a')) return;
      tNow = settleAt;
      wake();
      update(tNow);
    };
    world.canvas.addEventListener('pointerdown', skipAhead);
    document.addEventListener('keydown', skipAhead);
    // (a card under the pointer, or pressed, once the deal is done and no
    // card is up: see hover)
    const hoverable = e => { const card = e.target.closest && e.target.closest('.r3t-card'); return card && tNow >= settleAt && !focusId ? card.dataset.id : null; };
    css.domElement.addEventListener('pointerover', e => { if (e.pointerType === 'mouse') { const id = hoverable(e); if (id) setHover(id, true); } });
    css.domElement.addEventListener('pointerout', e => { const card = e.target.closest && e.target.closest('.r3t-card'); if (card && !card.contains(e.relatedTarget)) setHover(card.dataset.id, false); });
    css.domElement.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') { const id = hoverable(e); if (id) setHover(id, true); } });
    const unpress = () => hover.forEach((H, id) => { if (H[1]) setHover(id, false); });
    css.domElement.addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') unpress(); });
    css.domElement.addEventListener('pointercancel', unpress);
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
      if (e.target.closest('.r3t-ph-pickup')) {
        holdPhone(true);
        if (e.detail === 0) phoneEl.querySelector('.r3t-ph-tile').focus({ preventScroll: true });
        return;
      }
      if (e.target.closest('.r3t-ph-put')) {
        holdPhone(false);
        if (e.detail === 0) phoneEl.querySelector('.r3t-ph-pickup').focus({ preventScroll: true });
        return;
      }
      if (e.target.closest('.r3t-phone') && !phoneHeld) { holdPhone(true); }
    });
    css.domElement.addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('r3t-card')) { e.preventDefault(); e.target.click(); }
      if (e.key === 'Escape' && phoneHeld) { holdPhone(false); phoneEl.querySelector('.r3t-ph-pickup').focus({ preventScroll: true }); }
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
      update(tNow); show();
    };
    window.addEventListener('resize', onResize);

    update(0);
    if (fo.manual) world.rest(draw);
    else { draw(); running = true; raf = requestAnimationFrame(loop); }

    return {
      dest,
      duration: FLY, settleAt,
      get t() { return tNow; },
      seek(t) { tNow = t; update(t); show(); },
      pickUpPhone(on = true) { holdPhone(on); },
      // (lab and tests: lift a card, as a tap would)
      liftCard(id) { const el = cardObjs.find(o => o.userData.card.id === id); if (el) el.element.click(); },
      // (lab and tests: which way this deal was dealt, and a turn of the
      // focused card as a drag would give it)
      deal: deal.style,
      // (lab and tests: how many shaders each canvas has compiled - a count
      // that grows mid-move is a frame that waits on the GPU)
      get programs() { return { table: world.renderer.info.programs.length, hand: handGL.info.programs.length }; },
      // (lab and tests: each card's moments - drawn, flicked and caught,
      // pitched, laid, turned - in the table's clock)
      get timing() { return deal.cards.map(c => ({ pull: c.pull, toss: c.toss ? [c.toss.t0, c.toss.t1] : null, pitch: c.pitch ? [c.pitch.t0, c.lay] : null, lay: c.lay, turn: c.turn, turned: turnEnd(c) })); },
      // (lab and tests: the farthest either arm reaches over the whole deal,
      // J2 (the pitch drum) to wrist - it must stay under ARM.upper + ARM.fore)
      // (after the first swing out of the upright, which is at full length
      // by design)
      // (where: reach(true) says when, and which arm)
      // (and, with where: the elbow steered the farthest off its way, in
      // radians, the deepest overlap the steering could not clear, in cm,
      // and when)
      reach(where) { const t0 = tNow; farthest = 0; farthestAt = null; lowest = { y: Infinity }; steered = { psi: 0, sunk: 0, at: null }; for (let t = dealAt - RISE.swing + DEAL.first; t <= Math.max(settleAt, gestureEnd) + 0.05; t += 1 / 120) poseHand(t); poseHand(t0); return where ? { reach: +farthest.toFixed(2), at: farthestAt, lowestWrist: lowest, steered } : +farthest.toFixed(2); },
      // (lab: at t, each arm's elbow steer and whatever of its bulk still
      // overlaps something - see buildDealerArm's overlaps())
      clearance(t = tNow) { const t0 = tNow; update(t); const r = arms.map(a => ({ steered: +a.arm.steered.toFixed(3), sunk: +a.arm.sunk.toFixed(3), overlaps: a.arm.overlaps(), joints: a.arm.joints, tips: a.now.p.toArray().map(v => +v.toFixed(1)) })); update(t0); return r; },
      // (lab: where each card is at t, and its slot)
      cardsAt(t = tNow) { const t0 = tNow; update(t); const r = cardObjs.map(o => ({ at: o.position.toArray().map(v => +v.toFixed(1)), slot: o.userData.slot.toArray().map(v => +v.toFixed(1)) })); update(t0); return r; },
      // (lab: at t, arm k's elbow circle as the steering sees it)
      steerScan(t, k = 1) { const t0 = tNow; poseHand(t); const r = arms[k].arm.scan(); poseHand(t0); return r; },
      turnCard(dx, dy) { spinBy(dx, dy); wake(); },
      // (lab: the camera anywhere in the seat's frame, to look a prop over;
      // look() with nothing puts it back in the seat)
      look(eye, aim, fov) { lookAt = eye ? { eye: V(...eye), aim: V(...aim), fov: fov || sv.fov } : null; update(tNow); show(); },
      putDown,
      // The felt picked in Settings, laid now: the table's and the shot's
      // cloth, and the print's keyline for it (see FELTS in intro.mjs).
      setFelt(id) {
        if (!world.dressFelt) return;
        world.setFelt(id); world.dressFelt(table.felt, id);
        if (table.group.userData.printFor) table.group.userData.printFor(table.felt.userData.feltLight || 0);
        show();
      },
      // The trim picked in Settings, laid now: the table's band and lines,
      // and the shot's band (see TRIMS in intro.mjs).
      setTrim(id) {
        if (world.setTrim) world.setTrim(id);
        if (table.trim) dressTrim(table.trim, id);
        show();
      },
      // (lab: a gesture now - point, wave, spirit, drum, knock, sulk, peek,
      // pop - at the cards given by index, or the ready ones, and when it
      // runs, in the table's clock)
      gesture(name, at) { if (!gestures[name]) return null; const t0 = tNow; perform(name, at && at.length ? at : undefined); return { from: t0, to: gestureEnd }; },
      // (lab and tests: how the wait stands - the ladder's next step, how
      // long it has waited, a sulk, the end of the gesture under way, the
      // table's clock, which loop runs)
      get waiting() { return { stage: idle.stage, waited: idle.since ? +((performance.now() - idle.since) / 1000).toFixed(1) : 0, sulk: idle.sulk, ready: idle.ready, until: +gestureEnd.toFixed(2), t: +tNow.toFixed(2), table: running, arms: !!armsRaf }; },
      dispose() {
        disposed = true; running = false; cancelAnimationFrame(raf); cancelAnimationFrame(armsRaf);
        clearInterval(clock); clearInterval(idleClock);
        window.removeEventListener('resize', onResize);
        document.removeEventListener('keydown', skipAhead);
        world.canvas.removeEventListener('pointerdown', skipAhead);
        if (handScene.environment) handScene.environment.dispose();
        handGL.dispose();
        css.domElement.remove();
      }
    };
  }

  // Made ready while the intro floats on - its shaders compiled, its
  // textures uploaded a frame apiece - and only then shown. Its lamp is one
  // more light in the room, and a light the shaders weren't compiled for
  // would compile every one of them again in the frame it came on; the
  // table's own shaders and textures, left to its first frame, would all
  // land in the first frames of the fly-in.
  if (o.warm) {
    await Promise.race([Promise.all(chipLoads), new Promise(res => setTimeout(res, 1500))]);
    try { await o.warm({ show: [seat], spread: true }); } catch (e) { /* compiled on first draw */ }
  }
  seat.visible = true;

  return {
    dest,
    fly,
    // (out of the room, and its GPU resources given back - a drift away
    // from the table must not leave it on the card)
    dispose() { made.forEach(m => { scene.remove(m); freeTree(m, scene.userData.set); }); }
  };
}

// ---------------------------------------------------------- shared parts
// What another skin's home (study.mjs) builds with, so the rooms agree:
// the cards, their backs and the info sheet's text; the phone; the set's
// finishes and helpers.
// Give the GPU back everything a home built: its geometries, its materials
// and their textures - but not the house's own (the intro set's materials
// and textures in scene.userData.set, which the room and every other home
// still draw with), and not a render target's texture (its owner frees it).
// Taking an object out of the scene frees nothing on the GPU by itself.
export function freeTree(root, set) {
  const keepMat = new Set(), keepTex = new Set();
  const note = v => {
    if (!v) return;
    if (v.isMaterial) { keepMat.add(v); Object.values(v).forEach(t => { if (t && t.isTexture) keepTex.add(t); }); }
    else if (v.isTexture) keepTex.add(v);
  };
  if (set) Object.values(set).forEach(v => { if (v && !v.isMaterial && !v.isTexture && typeof v === 'object') Object.values(v).forEach(note); else note(v); });
  const geos = new Set(), mats = new Set();
  root.traverse(o => {
    // (and what the objects themselves own: an instanced mesh's instance
    // buffers, a light's shadow map)
    if (o.isInstancedMesh) o.dispose();
    if (o.isLight && o.shadow && o.shadow.dispose) o.shadow.dispose();
    if (o.geometry) geos.add(o.geometry);
    if (o.material) [].concat(o.material).forEach(m => { if (!keepMat.has(m)) mats.add(m); });
  });
  geos.forEach(gm => gm.dispose());
  mats.forEach(m => {
    Object.values(m).forEach(t => { if (t && t.isTexture && !t.isRenderTargetTexture && !keepTex.has(t)) t.dispose(); });
    m.dispose();
  });
}

export const tableKit = {
  CARD, TIERS, cardHTML, cardShown, inkBacks, demoHand, phoneHTML, fmtLeft, esc, tierOf, initials, hash,
  canvasTex, finished, polishedOf, fineSet, glassy, contactShadow, roundRect, lying, retile, freeTree, ROOM_ENV
};

// What the landing's blackjack game (blackjack.mjs) builds with, so its
// table and its dealer are this house's: the salon table (dressed as its
// own, see buildCardTable), the shoe, the discard rack, the port, the chips
// and the machine - its materials, torso, arms and hands, how a hand is
// posed and which way an elbow is carried - and the deck's backs and pips.
// The machine's moves are the game's own (a hand of four cards in the shot,
// not the table's deal).
export const dealerKit = {
  buildCardTable, buildShoe, buildDiscard, buildPort, chipMats, chipsReady: () => Promise.all(chipLoads),
  dealerMaterials, buildDealerTorso, buildDealerArm, buildDealerHand, handPose, elbowWay, segDist,
  paintCardBack, backArt, weaveTex, PIPS, lying, contactShadow, polishedOf, freeTree,
  CARD, FELT, PORT, ARM, WRIST, SIDES, LAYOUT
};
