// THE FINISHES: what every surface in the room is made of up close, shared
// by the shot (intro.mjs) and the table (table.mjs). Brushed brass, lacquer
// peel, bead-blasted steel, pressed clay, open-pore walnut, pebble-grain
// leather - each a small height field that tiles, made once from a fixed
// seed and turned into a normal map and a roughness map; and the canvas
// helpers the painted and engraved surfaces are drawn with.

import * as THREE from '../vendor/three/three.module.js';

const lerp = (a, b, k) => a + (b - a) * k;

// A texture sharing another's image, with its own repeat.
export function retile(tex, rx, ry) {
  const t = tex.clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.needsUpdate = true;
  return t;
}

export function canvasTex(w, h, paint) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  paint(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// A normal map from white-on-black artwork (a canvas): its strokes raised,
// their edges softened over a few pixels first (R: how many; 0, none),
// `strength` how steep.
export function embossTex(src, strength, R = 2) {
  const W = src.width, H = src.height;
  const a = src.getContext('2d').getImageData(0, 0, W, H).data;
  let h = new Float32Array(W * H), t = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) h[i] = a[i * 4 + 1] / 255;
  // (a box blur, twice, across then down)
  for (let pass = 0; pass < (R ? 2 : 0); pass++) {
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
export function seeded(seed) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }
// (value noise that wraps: a lattice of cells x cells, smoothly joined)
export function wrapNoise(N, cells, rnd) {
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
export function dataTex(N, fill) {
  const c = document.createElement('canvas'); c.width = c.height = N;
  const ctx = c.getContext('2d'), img = ctx.createImageData(N, N);
  fill(img.data);
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}
export function finish(kind) {
  if (FINISHES[kind]) return FINISHES[kind];
  const N = 256, h = new Float32Array(N * N);
  const rnd = seeded({ brushed: 11, peel: 23, blast: 37, clay: 41, pores: 53, pebble: 67 }[kind] || 5);
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
  } else if (kind === 'pores') {
    // Open-pore walnut under a satin lacquer, as a cabinetmaker leaves it:
    // the lacquer lies smooth over the board, but the pores - the cut
    // vessels of the wood, fine grooves running with the grain (along u) -
    // stay open under it. Each is a short sunk dash, a few in a line where
    // a vessel runs on; between them the late wood's growth lines, faint
    // ridges that wander a little. (One tile is 2 cm along the grain and
    // 2 across, so a pore is about 0.3 to 1.2 mm long and a hair wide.)
    const wave = wrapNoise(N, 4, rnd);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const yy = y + wave[y * N + x] * 6;
      h[y * N + x] = 0.5 + 0.18 * Math.sin(yy / N * Math.PI * 2 * 14);
    }
    for (let k = 0; k < 1400; k++) {
      const y0 = rnd() * N, x0 = Math.floor(rnd() * N), len = 4 + Math.floor(rnd() * 18), run = rnd() < 0.3 ? 2 + Math.floor(rnd() * 3) : 1, d = 0.5 + rnd() * 0.5;
      for (let r = 0; r < run; r++) {
        const xs = x0 + r * (len + 3 + Math.floor(rnd() * 6)), yv = Math.floor(y0 + (wave[Math.floor(y0) * N + (xs % N)] || 0) * 6);
        for (let i = 0; i < len; i++) {
          const x = (xs + i) % N, taper = Math.sin(Math.PI * (i + 0.5) / len);
          h[((yv % N) + N) % N * N + x] -= d * taper;
          h[((yv + 1) % N + N) % N * N + x] -= d * taper * 0.35;
        }
      }
    }
    strength = 2.4; lo = 0.8; hi = 1.05;
  } else if (kind === 'pebble') {
    // Pebble-grain calfskin, as a saddlery's dice cup is covered: the grain
    // side of the hide tumbled until it rises in small rounded pebbles
    // with fine creases between them, each pebble its own size and shape
    // (cells round scattered points, 22 across a tile: at 2.5 cm a tile,
    // a pebble is about a millimetre). A pebble's top is where the hide
    // is polished by handling; its creases hold the dull.
    const C = 22, pts = [];
    for (let j = 0; j < C; j++) for (let i = 0; i < C; i++) pts.push([(i + 0.15 + rnd() * 0.7) / C * N, (j + 0.15 + rnd() * 0.7) / C * N]);
    const cell = N / C;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const ci = Math.floor(x / cell), cj = Math.floor(y / cell);
      let d1 = Infinity, d2 = Infinity;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = (ci + di + C) % C, jj = (cj + dj + C) % C, [px, py] = pts[jj * C + ii];
        let dx = x - px, dy = y - py;
        if (dx > N / 2) dx -= N; else if (dx < -N / 2) dx += N;
        if (dy > N / 2) dy -= N; else if (dy < -N / 2) dy += N;
        const d = Math.hypot(dx, dy);
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
      }
      // (distance to the crease, rounded over: a pebble's shoulder)
      const e = Math.min(1, (d2 - d1) / (cell * 0.55));
      h[y * N + x] = Math.sqrt(e);
    }
    add(wrapNoise(N, 48, rnd), 0.08);
    // (tops polished, creases dull: roughness falls as the height rises)
    strength = 1.5; lo = 1; hi = 0.72;
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
export function finished(mat, kind, rx, ry, depth) {
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
