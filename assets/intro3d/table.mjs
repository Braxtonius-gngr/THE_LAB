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
// landscape - on a phone, wide enough to hold the whole chip rack and the
// dealer's arm at work above the cards), the first row of cards, the
// rail's panel, the shoe and the discard rack.
const LAYOUT = {
  card: {
    view: [{ eye: [0, 54, -22], aim: [0, 0, 24], fov: 54 }, { eye: [0, 46, -24], aim: [0, 0, 27], fov: 44 }],
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
function canvasTex(w, h, paint) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  paint(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
// A normal map from white-on-black artwork (a canvas): its strokes raised,
// their edges softened over a few pixels first, `strength` how steep.
function embossTex(src, strength) {
  const W = src.width, H = src.height;
  const a = src.getContext('2d').getImageData(0, 0, W, H).data;
  let h = new Float32Array(W * H), t = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) h[i] = a[i * 4 + 1] / 255;
  // (a box blur, twice, across then down)
  const R = 2;
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < H; y++) { let acc = 0; for (let x = -R; x <= R; x++) acc += h[y * W + Math.min(W - 1, Math.max(0, x))]; for (let x = 0; x < W; x++) { t[y * W + x] = acc / (2 * R + 1); acc += h[y * W + Math.min(W - 1, x + R + 1)] - h[y * W + Math.max(0, x - R)]; } }
    for (let x = 0; x < W; x++) { let acc = 0; for (let y = -R; y <= R; y++) acc += t[Math.min(H - 1, Math.max(0, y)) * W + x]; for (let y = 0; y < H; y++) { h[y * W + x] = acc / (2 * R + 1); acc += t[Math.min(H - 1, y + R + 1) * W + x] - t[Math.max(0, y - R) * W + x]; } }
  }
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d'), img = ctx.createImageData(W, H), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const dx = (h[y * W + Math.min(W - 1, x + 1)] - h[y * W + Math.max(0, x - 1)]) * strength;
    const dy = (h[Math.min(H - 1, y + 1) * W + x] - h[Math.max(0, y - 1) * W + x]) * strength;
    const l = Math.hypot(dx, dy, 1);
    // (canvas y runs down, a normal map's green up)
    d[i * 4] = (-dx / l * 0.5 + 0.5) * 255; d[i * 4 + 1] = (dy / l * 0.5 + 0.5) * 255; d[i * 4 + 2] = (1 / l * 0.5 + 0.5) * 255; d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace; tex.anisotropy = 16;
  return tex;
}
// ---- The finishes. Up close every surface has a texture of its own that
// catches the light: brass is brushed, fine lines running along the part
// (round a turned one); lacquer, lacquered walnut and glazed ceramic carry
// the faint orange peel of a sprayed coat under their clear; the iris
// blades are bead-blasted; clay chips are grained. Each is a small height
// field that tiles, made once from a fixed seed, turned into a normal map
// and a roughness map to go with it (a roughness map scales the
// material's roughness by its green).
const FINISHES = {};
function seeded(seed) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }
// (value noise that wraps: a lattice of cells x cells, smoothly joined)
function wrapNoise(N, cells, rnd) {
  const L = Float32Array.from({ length: cells * cells }, rnd), out = new Float32Array(N * N);
  const s = t => t * t * (3 - 2 * t);
  for (let y = 0; y < N; y++) {
    const fy = y / N * cells, y0 = Math.floor(fy), ty = s(fy - y0), y1 = (y0 + 1) % cells;
    for (let x = 0; x < N; x++) {
      const fx = x / N * cells, x0 = Math.floor(fx), tx = s(fx - x0), x1 = (x0 + 1) % cells;
      out[y * N + x] = lerp(lerp(L[y0 * cells + x0], L[y0 * cells + x1], tx), lerp(L[y1 * cells + x0], L[y1 * cells + x1], tx), ty);
    }
  }
  return out;
}
function dataTex(N, fill) {
  const c = document.createElement('canvas'); c.width = c.height = N;
  const ctx = c.getContext('2d'), img = ctx.createImageData(N, N);
  fill(img.data);
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}
function finish(kind) {
  if (FINISHES[kind]) return FINISHES[kind];
  const N = 256, h = new Float32Array(N * N);
  const rnd = seeded({ brushed: 11, peel: 23, blast: 37, clay: 41 }[kind] || 5);
  const add = (src, k) => { for (let i = 0; i < h.length; i++) h[i] += src[i] * k; };
  let strength = 1, lo = 0.8, hi = 1;
  if (kind === 'brushed') {
    // each row its own depth, then scratches over them, fading in and out
    const row = Float32Array.from({ length: N }, rnd);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) h[y * N + x] = row[y] * 0.5;
    for (let k = 0; k < 520; k++) {
      const y = Math.floor(rnd() * N), x0 = Math.floor(rnd() * N), len = 24 + rnd() * 200, a = (rnd() - 0.5) * 0.9;
      for (let i = 0; i < len; i++) h[y * N + (x0 + i) % N] += a * Math.sin(Math.PI * i / len);
    }
    // (and a broad cloud, the part's own unevenness, felt mostly as sheen)
    const cloud = wrapNoise(N, 4, rnd); add(cloud, 0.6);
    strength = 0.9; lo = 0.62; hi = 1;
  } else if (kind === 'peel') {
    add(wrapNoise(N, 16, rnd), 0.6); add(wrapNoise(N, 32, rnd), 0.3); add(wrapNoise(N, 64, rnd), 0.1);
    strength = 2.2; lo = 0.85; hi = 1;
  } else if (kind === 'blast') {
    for (let i = 0; i < h.length; i++) h[i] = rnd() * 0.5;
    add(wrapNoise(N, 64, rnd), 0.5); add(wrapNoise(N, 8, rnd), 0.4);
    strength = 1.6; lo = 0.8; hi = 1;
  } else {
    // clay: a fine grain, pressed, with a looser mottle through it
    for (let i = 0; i < h.length; i++) h[i] = rnd() * 0.45;
    add(wrapNoise(N, 96, rnd), 0.35); add(wrapNoise(N, 12, rnd), 0.35);
    strength = 1.8; lo = 0.78; hi = 1;
  }
  let mn = Infinity, mx = -Infinity;
  for (const v of h) { if (v < mn) mn = v; if (v > mx) mx = v; }
  for (let i = 0; i < h.length; i++) h[i] = (h[i] - mn) / (mx - mn || 1);
  const at = (x, y) => h[((y + N) % N) * N + (x + N) % N];
  const normal = dataTex(N, d => {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength, dy = (at(x, y + 1) - at(x, y - 1)) * strength, l = Math.hypot(dx, dy, 1), i = (y * N + x) * 4;
      d[i] = (-dx / l * 0.5 + 0.5) * 255; d[i + 1] = (dy / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
  });
  const rough = dataTex(N, d => { for (let i = 0; i < N * N; i++) { const v = (lo + (hi - lo) * h[i]) * 255; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; } });
  return (FINISHES[kind] = { normal, rough });
}
// A material given a finish: its normal map (under the clear coat, if it
// has one: the coat is what the peel is in) and roughness map, at a repeat.
function finished(mat, kind, rx, ry, depth) {
  const f = finish(kind);
  const n = retile(f.normal, rx, ry), r = retile(f.rough, rx, ry);
  if (mat.isMeshPhysicalMaterial && mat.clearcoat > 0 && kind === 'peel') {
    mat.clearcoatNormalMap = n; mat.clearcoatNormalScale = new THREE.Vector2(depth, depth);
  } else if (!mat.normalMap) {
    mat.normalMap = n; mat.normalScale = new THREE.Vector2(depth, depth);
  }
  if (!mat.roughnessMap) mat.roughnessMap = r;
  mat.needsUpdate = true;
  return mat;
}
// The house's finished set: the intro's materials, the brass brushed (a
// copy: the intro's own brass is left as it is).
function fineSet(set) {
  const brass = finished(set.brass.clone(), 'brushed', 1, 1, 0.18);
  brass.roughness = 0.34;
  return Object.assign({}, set, { brass });
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
  // (its lacquer's peel at 3 cm a tile: u here is 60 cm, v 15)
  finished(woodMat, 'peel', 20, 5, 0.05);
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
  // (blended at its edges, not cut at a threshold: cut, its fine scrolls
  // break up into a shimmer of jagged pixels as the rail recedes)
  const satinGold = set.gold.clone();
  satinGold.roughness = 0.5; satinGold.envMapIntensity = 0.6; satinGold.color = new THREE.Color(0.82, 0.78, 0.72);
  satinGold.alphaTest = 0; satinGold.transparent = true; satinGold.depthWrite = false;
  const goldBand = new THREE.Mesh(strip(rim, -2.6, -5.0, 0.012, 19.2), satinGold);
  goldBand.receiveShadow = true; goldBand.renderOrder = 1; g.add(goldBand);
  // a brass line let into the felt either side of it
  [[-2.42, -2.54], [-5.06, -5.18]].forEach(([o0, o1]) => { const l = new THREE.Mesh(strip(rim, o0, o1, 0.014, 20), set.brass); l.receiveShadow = true; g.add(l); });
  // the rail's stitching: two rows of gold thread either side of its crest
  const stitch = canvasTex(8, 64, (c, W, H) => { c.clearRect(0, 0, W, H); c.fillStyle = '#8f6f36'; c.fillRect(1, 14, W - 2, 34); c.fillStyle = 'rgba(214,180,110,0.7)'; c.fillRect(2, 16, W - 4, 8); });
  stitch.wrapS = stitch.wrapT = THREE.RepeatWrapping;
  const stitchMat = new THREE.MeshStandardMaterial({ map: stitch, transparent: true, alphaTest: 0.3, roughness: 0.75, metalness: 0.1, side: THREE.DoubleSide });
  [66, 114].forEach(deg => {
    const t0 = (deg - 0.5) * DEG, t1 = (deg + 0.5) * DEG;
    const at = t => [5.6 + 5.82 * Math.cos(t), 3.1 + 4.32 * Math.sin(t)];
    const row = new THREE.Mesh(sweep(rim, [at(t0), at(t1)], 0.5, false, true), stitchMat);
    g.add(row);
  });
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
  // (pressed into the felt: a normal map from the lettering's own edges, so
  // the foil's raised strokes catch the lamp)
  markMat.normalMap = embossTex(mark.image, 3.2); markMat.normalScale = new THREE.Vector2(1, 1);
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

// The chip float, as a dealer keeps it: a black lacquer rack let into the
// dealer's bar, its top scalloped into ten troughs that run toward the
// player, the chips standing on edge in them by colour - more of the small
// ones, fewer of the large - each trough's value engraved on a brass strip
// along the front, brass rails along the top. A chip is a clay disc with
// eight inserts round its edge and the house's coin on its faces
// (assets/intro3d/icons). All the chips of a colour are one instanced mesh.
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
  const lacquer = finished(new THREE.MeshPhysicalMaterial({ color: 0x0b0a0a, roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.1 }), 'peel', 1 / 3, 1 / 3, 0.05);
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
  [-1, 1].forEach(sx => { const e = new THREE.Mesh(new THREE.BoxGeometry(0.4, TR.h + 0.5, TR.len + 0.5), set.brass); e.position.set(sx * (W / 2 + 0.2), 0.4 + (TR.h + 0.5) / 2 - 0.1, 0); g.add(e); });
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
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.2, 0.9), finished(new THREE.MeshStandardMaterial({ map: plate, metalness: 1, roughness: 0.36 }), 'brushed', 1, 1 / 40, 0.12));
  strip.position.set(0, 0.4 + TR.h * 0.45, -(TR.len / 2 + 0.13)); strip.rotation.y = Math.PI; g.add(strip);
  // the chips: the edge texture, eight inserts; the faces, the house coin
  const spots = { onyx: ['#121214', '#e8e2d2', '#b8914a'], oxblood: ['#5b1622', '#f1e7d0', '#c9a45a'], emerald: ['#1d3a2a', '#f1e7d0', '#c9a45a'], ivory: ['#e6dfcb', '#6b1320', '#b8914a'], plum: ['#3a2352', '#f1e7d0', '#c9a45a'], gold: ['#b58a2e', '#1a1208', '#f6e2a8'] };
  const chipGeo = new THREE.CylinderGeometry(1.95, 1.95, 0.33, 48, 1);
  chipGeo.rotateX(Math.PI / 2);           // (on edge, its axis along z)
  const R = new THREE.Object3D();
  CHIPS.forEach(name => {
    const [base, spot, line] = spots[name];
    const side = canvasTex(1024, 32, (c, Wc, Hc) => {
      c.fillStyle = base; c.fillRect(0, 0, Wc, Hc);
      for (let k = 0; k < 8; k++) {
        const x0 = k * Wc / 8 + Wc / 32, w = Wc / 16;
        c.fillStyle = spot; c.fillRect(x0, 0, w, Hc);
        c.fillStyle = base; c.fillRect(x0 + w * 0.3, 0, w * 0.08, Hc); c.fillRect(x0 + w * 0.62, 0, w * 0.08, Hc);
        c.fillStyle = line; c.fillRect(x0 + w + Wc / 64 - 1, Hc * 0.35, 3, Hc * 0.3);
      }
      const gr = c.createLinearGradient(0, 0, 0, Hc); gr.addColorStop(0, 'rgba(0,0,0,0.35)'); gr.addColorStop(0.2, 'rgba(0,0,0,0)'); gr.addColorStop(0.8, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.35)');
      c.fillStyle = gr; c.fillRect(0, 0, Wc, Hc);
    });
    // (the clay's grain at 2 cm a tile: round the edge 12.3 cm, across it
    // 0.33; on a face, 3.9 across)
    const sideM = finished(new THREE.MeshStandardMaterial({ map: side, roughness: 0.6 }), 'clay', 6, 0.16, 0.45);
    const faceM = finished(new THREE.MeshStandardMaterial({ map: chipFace(name), roughness: 0.5, metalness: 0.12 }), 'clay', 2, 2, 0.35);
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
function giltEdges() {
  if (!giltM) {
    const t = canvasTex(64, 256, (c, W, H) => { const g = c.createLinearGradient(0, 0, W, 0); g.addColorStop(0, '#b8914a'); g.addColorStop(0.5, '#e8c77e'); g.addColorStop(1, '#b8914a'); c.fillStyle = g; c.fillRect(0, 0, W, H); c.fillStyle = 'rgba(80,52,16,0.35)'; for (let y = 0; y < H; y += 3) c.fillRect(0, y, W, 1); });
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

// The shoe: a lacquered base on brass feet; smoked acrylic walls, their
// top sloping down to the mouth, edged in brass; the deck inside tilted to
// the mouth, a lacquered follower with a brass knob behind it; at the mouth
// a brass plate with a thumb notch over the slot and a roller, the top card
// out on the tongue; on the back, toward you, the house's engraved seal.
// (Its mouth is its -z end; the cards come out at local z -11.6, y 0.9.)
function buildShoe(set) {
  const g = new THREE.Group();
  const acrylic = new THREE.MeshPhysicalMaterial({ color: 0x3a302a, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.3, clearcoat: 1, clearcoatRoughness: 0.03, depthWrite: false, side: THREE.DoubleSide });
  const lac = finished(new THREE.MeshPhysicalMaterial({ color: 0x0c0a0a, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 }), 'peel', 1 / 3, 1 / 3, 0.05);
  const X = 4.85, Z0 = -10.2, Z1 = 7.0, Y0 = 0.9;
  // feet and base
  [[-X + 0.5, Z0 + 0.6], [X - 0.5, Z0 + 0.6], [-X + 0.5, Z1 - 0.6], [X - 0.5, Z1 - 0.6]].forEach(([x, z]) => { const f = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 10), set.brass); f.scale.y = 0.7; f.position.set(x, 0.28, z); g.add(f); });
  const baseShape = roundRect(2 * X + 0.3, Z1 - Z0 + 2.3, 0.9);
  const base = slab(baseShape, Y0 - 0.35, lac, 0.12); base.position.set(0, 0.35, (Z0 - 2 + Z1) / 2); g.add(base);
  g.add(tube(outline(2 * X + 0.34, Z1 - Z0 + 2.34, 0.92, Y0 - 0.02, (Z0 - 2 + Z1) / 2), 0.05, set.brass, true));
  // the walls: the side profile, extruded across
  const side = new THREE.Shape();
  side.moveTo(Z0, Y0); side.lineTo(Z1, Y0); side.lineTo(Z1, 6.1); side.quadraticCurveTo(Z1, 6.9, Z1 - 0.8, 6.9); side.lineTo(Z0 + 1.8, 3.5); side.quadraticCurveTo(Z0, 3.1, Z0, 2.7); side.closePath();
  const sideGeo = new THREE.ExtrudeGeometry(side, { depth: 0.26, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2, curveSegments: 10 });
  sideGeo.rotateY(-Math.PI / 2);         // (profile x -> z; across -> -x)
  [X, -X + 0.32].forEach(x => { const w = new THREE.Mesh(sideGeo, acrylic); w.position.x = x; g.add(w); });
  const back = new THREE.Mesh(new THREE.BoxGeometry(2 * X - 0.6, 6.1 - Y0, 0.28), acrylic); back.position.set(0, (6.1 + Y0) / 2, Z1 - 0.14); g.add(back);
  const lidA = V(0, 3.5, Z0 + 1.8), lidB = V(0, 6.9, Z1 - 0.8);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(2 * X - 0.1, 0.24, lidA.distanceTo(lidB)), acrylic);
  lid.position.copy(lidA).lerp(lidB, 0.5); lid.rotation.x = -Math.atan2(lidB.y - lidA.y, lidB.z - lidA.z); g.add(lid);
  // brass along the edges
  [X - 0.05, -X + 0.05].forEach(x => {
    g.add(rodBetween(V(x, lidA.y + 0.05, lidA.z), V(x, lidB.y + 0.05, lidB.z), 0.11, set.brass));
    g.add(rodBetween(V(x, Y0, Z1 - 0.05), V(x, 6.2, Z1 - 0.05), 0.11, set.brass));
    g.add(rodBetween(V(x, Y0, Z0 + 0.05), V(x, 2.8, Z0 + 0.05), 0.11, set.brass));
  });
  g.add(rodBetween(V(-X, 6.62, Z1 - 0.3), V(X, 6.62, Z1 - 0.3), 0.14, set.brass));
  // the deck, tilted down to the mouth, and the follower behind it
  const backM = new THREE.MeshStandardMaterial({ map: backTex(), roughness: 0.5 });
  const edgeM = giltEdges();
  const deck = new THREE.Mesh(new THREE.BoxGeometry(6.4, 3.0, 8.9), [edgeM, edgeM, backM, edgeM, edgeM, edgeM]);
  deck.rotation.x = -7 * DEG; deck.position.set(0, Y0 + 1.75, Z0 + 5.4); g.add(deck);
  const follower = new THREE.Mesh(new THREE.BoxGeometry(7.2, 3.8, 2.0), lac);
  follower.rotation.x = -7 * DEG; follower.position.set(0, Y0 + 2.4, Z0 + 11.1); g.add(follower);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.2, 12), set.brass); stem.position.set(0, Y0 + 4.8, Z0 + 11.25); g.add(stem);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 14), set.brass); knob.position.set(0, Y0 + 5.5, Z0 + 11.25); g.add(knob);
  // the mouth: a brass plate with a thumb notch, over the slot, a roller
  const plate = new THREE.Shape();
  plate.moveTo(-X, Y0); plate.lineTo(-3.4, Y0); plate.lineTo(-3.4, 1.38); plate.lineTo(3.4, 1.38); plate.lineTo(3.4, Y0); plate.lineTo(X, Y0);
  plate.lineTo(X, 2.95); plate.lineTo(1.2, 2.95); plate.absarc(0, 2.95, 1.2, 0, Math.PI, true); plate.lineTo(-X, 2.95); plate.closePath();
  const plateGeo = new THREE.ExtrudeGeometry(plate, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2, curveSegments: 16 });
  const face = new THREE.Mesh(plateGeo, set.brass); face.position.z = Z0 - 0.28; g.add(face);
  const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 7.0, 20), set.brass); roller.rotation.z = Math.PI / 2; roller.position.set(0, 1.62, Z0 - 0.62); g.add(roller);
  // the top card, out on the tongue, ready to be drawn
  const card = new THREE.Mesh(new THREE.BoxGeometry(6.35, 0.03, 8.89), [edgeM, edgeM, backM, edgeM, edgeM, edgeM]);
  card.position.set(0, Y0 + 0.03, Z0 + 1.5); card.rotation.x = 2 * DEG; card.castShadow = true; g.add(card);
  // the seal on the back, toward you
  const seal = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, 0.14, 48), [set.brass, finished(new THREE.MeshStandardMaterial({ map: sealTex(), metalness: 1, roughness: 0.34 }), 'brushed', 1, 1, 0.1), set.brass]);
  seal.rotation.set(Math.PI / 2, Math.PI / 2, 0); seal.position.set(0, 3.5, Z1 + 0.1); g.add(seal);
  return g;
}
// The discard rack: a walnut plinth with a brass line round it and a felt
// pad on top; smoked acrylic walls, low at the front, edged in brass; the
// played cards stacked in it, a few lying loose, and the house's brass
// medallion on them as a weight.
function buildDiscard(set) {
  const g = new THREE.Group();
  const smoke = new THREE.MeshPhysicalMaterial({ color: 0x3a302a, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.32, clearcoat: 1, clearcoatRoughness: 0.04, depthWrite: false, side: THREE.DoubleSide });
  const X = 4.3, Z = 5.6, Y0 = 1.0;
  // (the walnut's grain at its own scale: the slab's UVs are in cm)
  const wood = set.wood.clone(); wood.map = retile(set.tex.walnut, 1 / 18, 1 / 18); wood.normalMap = retile(set.tex.walnutN, 1 / 18, 1 / 18);
  finished(wood, 'peel', 1 / 3, 1 / 3, 0.05);
  const plinth = slab(roundRect(2 * X + 1.2, 2 * Z + 1.0, 0.8), Y0, wood, 0.18); g.add(plinth);
  g.add(tube(outline(2 * X + 1.24, 2 * Z + 1.04, 0.82, 0.55), 0.06, set.brass, true));
  const pad = new THREE.Mesh(new THREE.ShapeGeometry(roundRect(2 * X - 0.4, 2 * Z - 0.4, 0.4), 8), new THREE.MeshStandardMaterial({ color: 0x0b0a0c, roughness: 0.95 }));
  pad.rotation.x = -Math.PI / 2; pad.position.y = Y0 + 0.01; g.add(pad);
  const side = new THREE.Shape();
  side.moveTo(-Z, Y0); side.lineTo(Z, Y0); side.lineTo(Z, 5.6); side.lineTo(Z - 0.6, 5.6); side.lineTo(-Z, 2.4); side.closePath();
  const sideGeo = new THREE.ExtrudeGeometry(side, { depth: 0.26, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2 });
  sideGeo.rotateY(-Math.PI / 2);
  [X, -X + 0.26].forEach(x => { const w = new THREE.Mesh(sideGeo, smoke); w.position.x = x; g.add(w); });
  const back = new THREE.Mesh(new THREE.BoxGeometry(2 * X - 0.5, 5.6 - Y0, 0.26), smoke); back.position.set(0, (5.6 + Y0) / 2, Z - 0.13); g.add(back);
  [X - 0.1, -X + 0.1].forEach(x => {
    g.add(rodBetween(V(x, 2.45, -Z), V(x, 5.65, Z - 0.6), 0.1, set.brass));
    g.add(rodBetween(V(x, Y0, -Z + 0.05), V(x, 2.45, -Z + 0.05), 0.1, set.brass));
  });
  g.add(rodBetween(V(-X, 5.62, Z - 0.3), V(X, 5.62, Z - 0.3), 0.12, set.brass));
  // the stack, a few loose on top, and the weight
  const backM = new THREE.MeshStandardMaterial({ map: backTex(), roughness: 0.5 });
  const edgeM = giltEdges();
  const stack = new THREE.Mesh(new THREE.BoxGeometry(6.35, 1.1, 8.89), [edgeM, edgeM, backM, edgeM, edgeM, edgeM]);
  stack.position.set(0, Y0 + 0.57, 0.3); g.add(stack);
  let y = Y0 + 1.12;
  for (let k = 0; k < 5; k++) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(6.35, 0.04, 8.89), [edgeM, edgeM, backM, edgeM, edgeM, edgeM]);
    c.position.set(Math.sin(k * 2.3) * 0.22, y + 0.02, 0.3 + Math.cos(k * 1.7) * 0.2);
    c.rotation.y = Math.sin(k * 1.9 + 0.4) * 0.05; c.castShadow = k === 4;
    g.add(c); y += 0.045;
  }
  const medal = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.78, 0.5, 64), [set.brass, finished(new THREE.MeshStandardMaterial({ map: sealTex(), metalness: 1, roughness: 0.32 }), 'brushed', 1, 1, 0.1), set.brass]);
  // (turned to read from the seat, a little askew)
  medal.position.set(0.7, y + 0.26, -1.1); medal.rotation.y = Math.PI + 0.35; medal.castShadow = true; g.add(medal);
  return g;
}
// The port the dealer's arm rises through (see prepareTable): the felt
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
  const ringMat = new THREE.MeshStandardMaterial({ map: ringTex, metalness: 1, roughness: 0.3, envMapIntensity: 1.0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
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
  return { group: g, set: set01 };
}

// The dealer is a machine: a seven-axis arm in white ceramic traced with fine
// gold circuitry, stowed under a port in the felt by the shoe. As the deal
// begins the port's iris opens and the arm rises out of the table on a
// telescoping lift. It is built the way the finest such arms are, with
// seven axes (see buildDealerArm), so the hand can take any pose while the
// arm stays one rigid chain; it is solved every frame from the shoulder to
// the wrist, its links long enough for the farthest card (see ARM). Its
// hand keeps the old glove's frame - at the fingertips, +z along the
// fingers, +y the back of the hand, +x the thumb's side - so a pose is
// still where the fingertips are and which way they point.
const PORT = { x: -4, z: 58.5, r: 5.4 };
// shoulder heights (up: dealing; down: stowed under the felt) and the two
// links, shoulder to elbow and elbow to wrist (with room to spare for the
// farthest card - 35.3 cm, shoulder to wrist, in a single deal of nine -
// so nothing is ever pulled out of true)
const ARM = { up: 7.5, down: -60, upper: 18, fore: 18 };
// the wrist (J6's centre), in the hand's frame: behind the heel of the palm,
// past the tool flange
const WRIST = V(0, 0.6, -15.0);
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
  // (under each drum's glass cap: a disc of gold circuitry on graphite,
  // lit from within while the arm works)
  const circuit = new THREE.MeshStandardMaterial({ color: 0x1b1916, metalness: 0.4, roughness: 0.45, map: circuitTex(false), emissive: 0xffc877, emissiveMap: circuitTex(true), emissiveIntensity: 0.3 });
  circuit.map.repeat.set(0.5, 1); circuit.emissiveMap.repeat.set(0.5, 1);
  // (the glaze's peel under its clear; the graphite bead-blasted, the gold
  // and the chrome brushed)
  finished(ceramic, 'peel', 4, 4, 0.05); finished(plain, 'peel', 4, 4, 0.05);
  finished(graphite, 'blast', 2, 2, 0.3); finished(gold, 'brushed', 1, 1, 0.12); finished(chrome, 'brushed', 1, 1, 0.1);
  return { ceramic, plain, clear, gold, graphite, chrome, led, circuit, pulse };
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
// y), a graphite band round its middle, and at each end a white rim and a
// shallow glass cap over a disc of gold circuitry, a graphite hub in it.
function drum(m, r, len) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 44, 1), m.ceramic));
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(r * 1.015, r * 1.015, len * 0.18, 44, 1, true), m.graphite));
  const R = r * 0.86 / Math.sin(0.5);
  [-1, 1].forEach(s => {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.93, r * 0.075, 10, 44), m.plain);
    rim.rotation.x = Math.PI / 2; rim.position.y = s * len / 2; g.add(rim);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(r * 0.87, 44), m.circuit);
    disc.rotation.x = -s * Math.PI / 2; disc.position.y = s * (len / 2 + 0.01); g.add(disc);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(R, 44, 6, 0, Math.PI * 2, 0, 0.5), m.clear);
    cap.position.y = s * (len / 2 - R * Math.cos(0.5)); if (s < 0) cap.rotation.x = Math.PI; g.add(cap);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.2, r * 0.2, 0.24, 20), m.graphite);
    hub.position.y = s * (len / 2 + 0.12); g.add(hub);
  });
  return g;
}
// (a drum, or anything built along its local y, turned onto an axis)
const onAxis = (obj, axis) => obj.quaternion.setFromUnitVectors(V(0, 1, 0), axis);
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
  // the tool plate the arm's flange bolts to, at the heel of the palm: a
  // graphite disc on a ceramic neck, six bolt heads round a gold ring
  { const plate = new THREE.Mesh(new THREE.CylinderGeometry(1.32, 1.32, 0.55, 36), m.graphite);
    plate.rotation.x = Math.PI / 2; plate.position.copy(WRIST).add(V(0, 0, 1.45)); g.add(plate);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.2, 1.2, 36), m.plain);
    neck.rotation.x = Math.PI / 2; neck.position.copy(WRIST).add(V(0, 0, 2.3)); g.add(neck);
    const ringG = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.07, 8, 36), m.gold); ringG.position.copy(WRIST).add(V(0, 0, 1.18)); g.add(ringG);
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; const b = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.2, 8), m.graphite); b.rotation.x = Math.PI / 2; b.position.copy(WRIST).add(V(Math.cos(a) * 1.0, Math.sin(a) * 1.0, 1.12)); g.add(b); } }
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
      const [c, sp] = per[i];
      const cp = Math.max(0, c), cn = Math.min(0, c);
      f.root.rotation.set(-cp * 0.4 + cn * 0.3, sp * f.side * 0.12, 0);
      f.mid.rotation.x = cp * 0.55 + cn * 0.05;
      f.tip.rotation.x = cp * 0.65;
    });
    const o = clamp01(thumbCurl / 0.9);
    thumb.rotation.set(o * 0.05 + Math.min(0, thumbCurl) * 0.2, -0.05 - o * 0.55 + thumbSpread * 0.25, -o * 0.15);
  };
  // the status lights: a chase while it works, dark at rest
  g.userData.leds = (on, tt) => leds.forEach((l, i) => { const k = on * (0.25 + 0.75 * Math.pow(0.5 + 0.5 * Math.sin(tt * 9 - i * 1.4), 3)); l.material.color.setRGB(1 * k + 0.08, 0.72 * k + 0.05, 0.36 * k + 0.03); });
  return g;
}
// The arm between the port and the wrist, placed by pose() each frame. It
// is a seven-axis arm, as the finest of them are: J1, the base drum on the
// lift, turning it to face its work; J2, the shoulder; J3, a roll of the
// upper link; J4, the elbow; J5, a roll of the forearm; J6, the wrist; J7,
// the tool flange the hand bolts to. With seven axes the elbow is free to
// swing round the line from shoulder to wrist without moving either, so it
// is carried out to the side and up, as a dealer's is - where you can see
// it work - while the chain stays exact. A cable dress runs down the outside of it in
// clamps, a lit ring breathes on J1, and a row of status lights on the
// forearm chases while it works.
function buildDealerArm(m) {
  const g = new THREE.Group();
  const cyl = (rt, rb, mat, seg = 36) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, 1, seg, 1), mat);
  const ring = (r, t, mat) => new THREE.Mesh(new THREE.TorusGeometry(r, t, 8, 44), mat);
  // the lift: three sleeves, each drawn out of the one below, a graphite
  // seal at each mouth
  const column = [cyl(2.0, 2.0, m.ceramic), cyl(2.35, 2.35, m.ceramic), cyl(2.7, 2.7, m.ceramic)];
  const seals = [ring(2.04, 0.17, m.graphite), ring(2.39, 0.17, m.graphite), ring(2.74, 0.17, m.graphite)];
  // J1: upright, a lit ring round it
  const base = drum(m, 3.0, 3.0);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(3.06, 0.1, 8, 64), m.led.clone());
  halo.rotation.x = Math.PI / 2; halo.position.y = 0.95; base.add(halo);
  // J2, J4, J6: the drums the arm bends at
  const shoulder = drum(m, 2.5, 5.2), elbow = drum(m, 2.05, 4.5), wrist = drum(m, 1.42, 3.0);
  // J3, J5: the rolls, a collar on each link between two graphite breaks
  const collar = r => { const c = new THREE.Group(); const b = cyl(r, r, m.plain); b.scale.y = 1.5; c.add(b); [-0.8, 0.8].forEach(y => { const k = ring(r * 1.01, 0.1, m.graphite); k.rotation.x = Math.PI / 2; k.position.y = y; c.add(k); }); const gl = ring(r * 1.02, 0.045, m.gold); gl.rotation.x = Math.PI / 2; c.add(gl); return c; };
  const roll3 = collar(2.0), roll5 = collar(1.5);
  // the links: tapered, a gold spine let into the top of each, two seams
  const upper = cyl(1.62, 1.92, m.ceramic), fore = cyl(1.12, 1.42, m.ceramic);
  const spines = [cyl(0.07, 0.07, m.gold, 6), cyl(0.07, 0.07, m.gold, 6)];
  const seams = [ring(1.72, 0.045, m.graphite), ring(1.25, 0.045, m.graphite)];
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
  g.add(...column, ...seals, base, shoulder, roll3, elbow, roll5, wrist, upper, fore, ...spines, ...seams, flange, cable, wire);
  const up = V(0, 1, 0);
  // (where the elbow is carried: out to its right - the player's left -
  // and up, a dealer's arm, so from the seat you see the whole of it)
  const PREF = V(0.9, 0.75, -0.25).normalize();
  const S = V(0, 0, 0), E = V(0, 0, 0), dir = V(0, 0, 0), n = V(0, 0, 0);
  const u = V(0, 0, 0), f = V(0, 0, 0), h = V(0, 0, 0), ax = V(1, 0, 0), fwd = V(0, 0, 1);
  const a4 = V(1, 0, 0), a6 = V(1, 0, 0), su = V(0, 1, 0), sf = V(0, 1, 0);
  const band = (b, a, c, k) => { b.position.copy(a).lerp(c, k); b.quaternion.setFromUnitVectors(V(0, 0, 1), c.clone().sub(a).normalize()); };
  const at = (a, b, k, side, d) => a.clone().lerp(b, k).addScaledVector(side, d);
  const perp = (out, v, axis) => { out.copy(v).addScaledVector(axis, -v.dot(axis)); return out.lengthSq() > 1e-6 ? out.normalize() : null; };
  let yaw = 0;
  return {
    group: g,
    // the shoulder at height y over the port, the wrist at W and the hand
    // turned by q (seat frame); tt and on for the lights
    pose(y, W, q, tt = 0, on = 0) {
      S.set(PORT.x, y, PORT.z);
      // the lift: three sleeves, each drawn out of the one below, up to J1
      const top = y - 4.9, base0 = ARM.down - 6, span = top - base0;
      column.forEach((c, i) => {
        const a = base0 + span * (2 - i) / 3, b = Math.min(top, a + span / 3 + 1.2);
        laid(c, V(PORT.x, a, PORT.z), V(PORT.x, b, PORT.z), true);
        seals[i].position.set(PORT.x, b, PORT.z); seals[i].quaternion.setFromUnitVectors(V(0, 0, 1), up);
      });
      // shoulder to wrist: the elbow on the circle round that line, as near
      // the preferred side as it goes
      dir.copy(W).sub(S);
      const len0 = dir.length() || 1e-4;
      dir.multiplyScalar(1 / len0);
      const L1 = ARM.upper, L2 = ARM.fore;
      const len = THREE.MathUtils.clamp(len0, Math.abs(L1 - L2) + 0.5, L1 + L2 - 0.05);
      const a = (L1 * L1 - L2 * L2 + len * len) / (2 * len), hh = Math.sqrt(Math.max(0, L1 * L1 - a * a));
      if (!perp(n, PREF, dir) && !perp(n, up, dir)) n.copy(fwd).negate();
      E.copy(S).addScaledVector(dir, a).addScaledVector(n, hh);
      u.copy(E).sub(S).normalize(); f.copy(W).sub(E).normalize();
      // J1 faces the upper link; J2 bends it across that plane
      if (u.x * u.x + u.z * u.z > 1e-3) yaw = Math.atan2(u.x, u.z);
      fwd.set(Math.sin(yaw), 0, Math.cos(yaw)); ax.set(Math.cos(yaw), 0, -Math.sin(yaw));
      base.position.set(PORT.x, y - 3.4, PORT.z); base.rotation.set(0, yaw, 0);
      shoulder.position.copy(S); onAxis(shoulder, ax);
      laid(upper, S, E, true);
      roll3.position.copy(S).addScaledVector(u, 4.6); onAxis(roll3, u);
      // J4 bends across the two links; J5 rolls the forearm
      const c4 = V(0, 0, 0).crossVectors(u, f);
      if (c4.lengthSq() > 1e-4) a4.copy(c4).normalize();
      elbow.position.copy(E); onAxis(elbow, a4);
      laid(fore, E, W, true);
      roll5.position.copy(E).addScaledVector(f, 4.4); onAxis(roll5, f);
      // (the top of each link: toward the elbow's side)
      perp(su, n, u) || su.copy(up); perp(sf, n, f) || sf.copy(up);
      laid(spines[0], at(S, E, 0.36, su, 1.8), at(S, E, 0.86, su, 1.66), true);
      laid(spines[1], at(E, W, 0.4, sf, 1.32), at(E, W, 0.74, sf, 1.2), true);
      band(seams[0], S, E, 0.68); band(seams[1], E, W, 0.66);
      // J6 bends across the forearm and the hand; J7 rolls the flange
      h.set(0, 0, 1).applyQuaternion(q);
      const c6 = V(0, 0, 0).crossVectors(f, h);
      if (c6.lengthSq() > 1e-4) a6.copy(c6).normalize();
      wrist.position.copy(W); onAxis(wrist, a6);
      flange.position.copy(W); onAxis(flange, h);
      // the cable dress, out of J1's back, over the outside of the arm into
      // the wrist (only while the arm is out: under the felt none shows)
      if (on) {
        const pts = [
          V(PORT.x, y - 2.8, PORT.z).addScaledVector(fwd, -2.9).addScaledVector(ax, 1.2),
          S.clone().addScaledVector(su, 2.9).addScaledVector(a4, 1.1).addScaledVector(u, 1.5),
          at(S, E, 0.55, su, 2.05).addScaledVector(a4, 0.9),
          E.clone().addScaledVector(n, 2.6).addScaledVector(a4, 1.4),
          at(E, W, 0.45, sf, 1.55).addScaledVector(a4, 0.8),
          W.clone().addScaledVector(f, -2.0).addScaledVector(sf, 1.35).addScaledVector(a4, 0.6)
        ];
        const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
        cable.geometry.dispose(); cable.geometry = new THREE.TubeGeometry(curve, 52, 0.25, 8, false);
        const wcurve = new THREE.CatmullRomCurve3(pts.map(p => p.clone().addScaledVector(a4, -0.4)), false, 'centripetal');
        wire.geometry.dispose(); wire.geometry = new THREE.TubeGeometry(wcurve, 52, 0.07, 5, false);
        clamps.forEach((c, i) => { const t = CLAMP_AT[i]; c.position.copy(curve.getPointAt(t)); c.quaternion.setFromUnitVectors(V(0, 0, 1), curve.getTangentAt(t)); });
      }
      // the lights: J1's ring breathing, and a chase along the forearm
      const glowK = on * (0.55 + 0.45 * Math.sin(tt * 3.2));
      halo.material.color.setRGB(1 * glowK + 0.06, 0.72 * glowK + 0.05, 0.38 * glowK + 0.04);
      lights.forEach((l, i) => {
        l.position.copy(at(E, W, 0.5 + i * 0.07, sf, 1.26 - i * 0.03)).addScaledVector(a4, -0.55);
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
  // The dealer's port: a round hole in the felt by the shoe, closed by an
  // iris of nine satin-black blades, each edged in gold, that turn back
  // under the felt as it opens (setPort: 0 shut, 1 open); a brass bezel
  // round it, engraved; below, a dark well with a ring of warm light in it.
  const port = buildPort(set);
  port.group.position.set(PORT.x, 0, PORT.z);
  seat.add(port.group);
  const setPort = port.set;
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
    // (below the well's floor nothing of it is ever seen)
    const underFelt = [new THREE.Plane(V(0, 1, 0), 8.6)];
    Object.values(dealerMats).forEach(mat => { if (mat.isMaterial) mat.clippingPlanes = underFelt; });
    const dealer = buildDealerHand(dealerMats);
    const arm = buildDealerArm(dealerMats);
    handSeat.add(dealer, arm.group);
    // The table as the arm's canvas sees it, in depth alone: the felt with
    // the port's hole in it and the well's wall, so what of the arm is down
    // the well shows through the hole and nowhere else.
    {
      const hide = new THREE.MeshBasicMaterial({ colorWrite: false });
      const top = new THREE.Shape(); top.moveTo(-200, -200); top.lineTo(200, -200); top.lineTo(200, 200); top.lineTo(-200, 200); top.closePath();
      const h = new THREE.Path(); h.absarc(PORT.x, -PORT.z, PORT.r, 0, Math.PI * 2, true); top.holes.push(h);
      const felt = new THREE.Mesh(new THREE.ShapeGeometry(top, 48), hide); felt.rotation.x = -Math.PI / 2; felt.position.y = -0.02; felt.renderOrder = -1;
      const wall = new THREE.Mesh(new THREE.CylinderGeometry(PORT.r - 0.03, PORT.r - 0.03, 8.8, 48, 1, true), hide); wall.position.set(PORT.x, -4.45, PORT.z); wall.renderOrder = -1;
      handSeat.add(felt, wall);
    }
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
    const RISE = { open: 1.2, up: 0.85, swing: 0.45 };          // seconds before dealAt
    const SINK = { fold: 0.4, down: 0.35, shut: 0.32 };           // seconds after the deal
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
    const FIN = { rest: [0, 0], reach: [-0.35, 0.85], grip: [0.85, 0.08], flick: [1.15, 0.28], open: [-0.5, 1], relax: [0.32, 0.35] };
    // And the wrist: the hand's attitude, [pitch, roll] about its
    // fingertips (pitch over 0 tips the fingers down, the wrist up; roll
    // turns it about its length). Every grab and placement is made level,
    // so a card is taken and laid true; in between the hand leans into its
    // work - reaching down into the shoe, lifting a card's end as it draws
    // it, banking as it swings, hooking its fingers down to flick a row
    // over - and each move can carry a lean that comes and goes with it.
    const makeDeal = style => {
      const n = cardObjs.length;
      const segs = [], cardsP = cardObjs.map(() => ({ pull: Infinity, j: 0, lay: Infinity, turn: Infinity, push: false }));
      // (the plan starts as the arm, risen, swings down to the shoe)
      let t = dealAt - RISE.swing;
      let at = upright(ARM.up), fin = FIN.rest, att = [0, 0];
      // a move of the hand to b over dur, arcing up by lift; settle: a
      // servo's small shiver on arrival; via: on through b without a stop;
      // to: the fingers by the end of it; lean: the wrist's attitude by the
      // end of it; dip: an attitude that comes and goes over it
      const move = (b, dur, { lift = 0, settle = false, via = false, to = fin, lean = att, dip = [0, 0] } = {}) => { segs.push({ kind: 'move', t0: t, t1: t + dur, a: at, b, lift, settle, via, f0: fin, f1: to, att0: att, att1: lean, dip }); t += dur; at = b; fin = to; att = lean; };
      // (a bank for a move from a to b: into the turn, as the hand swings
      // across itself)
      const bank = (a, b, k = 0.012) => { const d = b.p.clone().sub(a.p).applyQuaternion(a.q.clone().invert()); return THREE.MathUtils.clamp(-d.x * k, -0.3, 0.3); };
      const hold = dur => move(at, dur);
      const grabAt = j => handFor(shoePose(inShoe), j), outAt = j => handFor(shoePose(pulled), j);
      // draw card i into slot j (from wherever the hand is): in open, the
      // fingers close on it, and it comes out of the shoe on the move
      const draw = (i, j, first) => {
        // (reaching down into the shoe, level at the grab; then drawing the
        // card out by its end, lifting it a little)
        const g0 = grabAt(j);
        move(g0, first ? RISE.swing + 0.08 : (j ? DEAL.regrab : DEAL.grab), { lift: first ? 2 : (j ? 0.6 : 4.5), to: j ? FIN.grip : FIN.reach, lean: [0, 0], dip: j ? [0.08, 0] : [0.3, bank(at, g0)] });
        cardsP[i].pull = t; cardsP[i].j = j;
        move(outAt(j), DEAL.pull, { via: true, to: FIN.grip, lean: [-0.12, 0] });
      };
      // lay the card in slot j at its face-down place (carried leading edge
      // up, banking into the swing, set down level)
      const lay = (i, dur, lift) => { const b = handFor(faceDown(cardObjs[i]), cardsP[i].j); move(b, dur, { lift, settle: true, to: FIN.grip, lean: [0, 0], dip: [-0.16, bank(at, b, 0.018)] }); cardsP[i].lay = t; };
      // (and the fingers open off it, spreading as they lift)
      const letGo = (dur = 0.1) => move(at, dur, { to: FIN.open });
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
        // (fingers hooked down, the hand rolled a little into the sweep)
        const roll = bank(A, B, 0.01);
        move(A, 0.22, { lift: 2.5, via: true, to: FIN.flick, lean: [0.3, roll], dip: [-0.2, 0] });
        const dur = DEAL.sweep * line.length + 0.12;
        const t0 = t, d0 = from.distanceTo(to) || 1;
        line.forEach((i, k) => { cardsP[i].turn = t0 + dur * clamp01(from.distanceTo(ends[k]) / d0) - 0.03; });
        move(B, dur, { via: true, to: FIN.flick, lean: [0.34, roll], dip: [0.06, 0] });
      };
      if (!n) return { segs, cards: cardsP, end: t };
      if (style === 'single') {
        cardObjs.forEach((o, i) => {
          draw(i, 0, i === 0);
          lay(i, DEAL.carry, 3.4);
          hold(DEAL.settle);
          cardsP[i].turn = t; cardsP[i].push = true;
          segs.push({ kind: 'push', t0: t, t1: t + DEAL.push, card: i, f0: fin, f1: FIN.flick });
          t += DEAL.push; fin = FIN.flick; att = [0, 0];
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
        move(handPose(V(mid.x, 4.5, far), V(0, -0.35, -1), up), 0.32, { to: FIN.relax, lean: [-0.1, 0], dip: [-0.2, 0] });
        hold(DEAL.show);
        // one touch on the first card's far end, and the cascade
        const first = faceDown(cardObjs[0]).p.clone().addScaledVector(topOf(cardObjs[0]), CARD.h / 2 + 0.3); first.y = 1.1;
        move(handPose(first, V(0, -0.2, -1), up), 0.22, { lift: 1.5, settle: true, to: FIN.flick, lean: [0.34, 0] });
        const t0 = t;
        const order = cardObjs.map((o, i) => i).sort((a, b) => (Math.floor(a / SLOTS.cols) - Math.floor(b / SLOTS.cols)) || (cardObjs[b].userData.slot.x - cardObjs[a].userData.slot.x));
        order.forEach((i, k) => { cardsP[i].turn = t0 + 0.04 + k * DEAL.cascade; });
        // (and away, with a turn of the wrist)
        move(handPose(first.clone().add(V(0, 7, 5)), V(0.5, 0.4, -1), V(-0.3, 1, 0)), 0.34, { via: true, to: FIN.open, lean: [-0.2, 0.25] });
      }
      // the hand straightens up over the port once the last card is over
      const lastTurn = Math.max(...cardsP.map(turnEnd));
      move(upright(ARM.up), SINK.fold, { lift: 3, to: FIN.rest, lean: [0, 0], dip: [-0.2, 0] });
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
      const q = sg.a.q.clone().slerp(sg.b.q, clamp01(h1 * sg.s0 + h2 * sg.s1 + h3));
      // (the wrist's attitude, about the fingertips)
      const e = smoother(k), bump = Math.pow(Math.sin(Math.PI * k), 2);
      const pitch = lerp(sg.att0[0], sg.att1[0], e) + sg.dip[0] * bump, roll = lerp(sg.att0[1], sg.att1[1], e) + sg.dip[1] * bump;
      if (pitch || roll) q.multiply(_attQ.setFromEuler(_attE.set(pitch, 0, roll)));
      return { p, q };
    };
    const _attQ = new THREE.Quaternion(), _attE = new THREE.Euler();
    const fingersAt = (sg, k) => { const e = smoother(clamp01(k * 2.4)); return [lerp(sg.f0[0], sg.f1[0], e), lerp(sg.f0[1], sg.f1[1], e)]; };
    // (the fingers alone at any moment: at rest outside the deal)
    const fingersNow = tt => {
      const S = deal.segs;
      if (fo.reduced || !S.length || tt < S[0].t0 || tt >= S[S.length - 1].t1) return FIN.rest;
      const sg = segAt(tt);
      return sg ? fingersAt(sg, clamp01((tt - sg.t0) / Math.max(1e-4, sg.t1 - sg.t0))) : FIN.rest;
    };
    // the hand's pose from the plan alone (no trailing), the shoulder's
    // height, the port, the fingers
    const planned = tt => {
      const n = cardObjs.length;
      let hp = upright(ARM.down), y = ARM.down, open = 0, f = FIN.rest, free = false;
      if (n && !fo.reduced && tt >= dealAt - RISE.open) {
        open = clamp01((tt - (dealAt - RISE.open)) / 0.32);
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
          open = 1 - clamp01((k - SINK.down + 0.02) / SINK.shut);
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
      arm.pose(y, wristW, hp.q, tt, shown ? 1 : 0);
      setPort(open);
      dealer.visible = arm.group.visible = shown;
      // the fingers: opening to reach, closed on the cards it carries,
      // curled to flick one over, opened and spread as it lets go - the
      // index finger first, the others each a beat behind it, never quite
      // still (a servo's hold is a live one), the thumb opposing the grip
      const per = [0, 1, 2, 3].map(i => {
        const fi = i ? fingersNow(tt - i * 0.028) : f;
        const live = shown ? 0.03 * Math.sin(tt * 2.6 + i * 1.3) + 0.015 * Math.sin(tt * 7.1 + i * 2.1) : 0;
        return [fi[0] * (1 + 0.04 * i) + live, fi[1]];
      });
      const ft = fingersNow(tt + 0.02);
      dealer.userData.fingers(per, ft[0], ft[1]);
      dealer.userData.leds(shown ? 1 : 0, tt);
      // the light in its circuits: up while it works, brighter as it moves
      const palm = V(0, 1.2, -9.8).applyQuaternion(hp.q).add(hp.p);
      const dt = tt - prevT;
      const speed = prevPalm && dt > 0 && dt < 0.2 ? prevPalm.distanceTo(palm) / dt : 0;
      glow = lerp(glow, shown ? 0.3 + Math.min(0.6, speed / 140) : 0, 0.35);
      dealerMats.ceramic.emissiveIntensity = glow;
      dealerMats.circuit.emissiveIntensity = 0.15 + glow * 1.8;
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
      // (lab: the camera anywhere in the seat's frame, to look a prop over;
      // look() with nothing puts it back in the seat)
      look(eye, aim, fov) { lookAt = eye ? { eye: V(...eye), aim: V(...aim), fov: fov || sv.fov } : null; update(tNow); draw(); },
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
