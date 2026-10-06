// THE ROLL INTRO, IN WEBGL (three.js).
//
// The landing screen's brand shot: a leather cup with a DRO badge shakes
// over a pristine black felt table, throws two translucent oxblood dice the
// length of it; they strike the back wall's rubber pyramids (time slows as
// they do, and the light behind the camera gleams across them), drop to the
// felt, tumble and settle. What happens next is decided when the intro
// starts, by one draw of Math.random() - the rarity tier:
//
//   0.000 - 0.899  Standard Drop (90%)   the stickman calls the roll and his
//                                        stick draws the dice back
//   0.900 - 0.979  The Hardways (8%)     the dice come up snake eyes or
//                                        boxcars, called in platinum
//   0.980 - 0.998  The Vault Pull (1.9%) the dice shake three times, glowing
//                                        hotter, and burst into Baccarat
//                                        plaques that clack onto the felt
//   0.999 - 1.000  The Defiant Edge (0.1%) one die stops dead on a corner;
//                                        the room falls silent as the lens
//                                        closes in
//
// Everything is worked out before the first frame: the throw is simulated
// (physics.mjs) and recorded, the numbers are set by turning each die's
// markings (never its motion), and the camera, the timings and every sound
// are laid out on one timeline. Each frame is then a lookup at a time, so
// the shot looks the same on any device and any moment can be shown on its
// own (?lab seeks). The base set loads with the intro; a rare tier fetches
// its own assets (platinum lettering, plaques, the ceramic clack) only when
// it is drawn.

import * as THREE from '../vendor/three/three.module.js';
import { EffectComposer, RenderPass, UnrealBloomPass, OutputPass } from '../vendor/three/three.addons.js';
import * as P from './physics.mjs';
import { finish, finished, embossTex } from './finish.mjs';

const HERE = new URL('./', import.meta.url);
const asset = f => new URL(f, HERE).href;

// The games: the shot is one of these each launch, drawn alike (pickGame)
// unless ?game= names one. The dice are this module's own; every other game
// is a module of its own beside it (`./<game>.mjs`, exporting makeGame())
// that builds its pieces into the same room, under the same lights, and
// hands the shot its plan, its camera path, its sounds and its frames - see
// the `game` seam in buildIntro(). The set, the resolution, the post, the
// sound, the quality steps and the handover to the homes are shared.
export const GAMES = ['dice', 'wheel', 'plinko', 'blackjack', 'slots'];
export function pickGame(r) { return GAMES[Math.min(GAMES.length - 1, Math.floor(r * GAMES.length))]; }
export const TIERS = ['standard', 'hardways', 'vault', 'edge'];
export const TIER_NAMES = { standard: 'Standard Drop', hardways: 'The Hardways', vault: 'The Vault Pull', edge: 'The Defiant Edge' };
// (as the draw below gives them: 90%, 8%, 1.9%, 0.1%)
export const TIER_ODDS = { standard: '90%', hardways: '8%', vault: '1.9%', edge: '0.1%' };
// The rarity draw, exactly as specified: [0, 0.9) standard, [0.9, 0.98)
// hardways, [0.98, 0.999) vault, [0.999, 1) edge.
export function pickTier(r) {
  return r < 0.9 ? 'standard' : r < 0.98 ? 'hardways' : r < 0.999 ? 'vault' : 'edge';
}

// ---------------------------------------------------------------- helpers
const clamp01 = x => Math.min(Math.max(x, 0), 1);
const smoother = x => { x = clamp01(x); return x * x * x * (x * (6 * x - 15) + 10); };
const easeOut = (x, k = 3) => 1 - Math.pow(1 - clamp01(x), k);
const lerp = (a, b, k) => a + (b - a) * k;
const mix3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const DEG = Math.PI / 180;
// The light: the pendant over the table, and the studio the glossy surfaces
// mirror (dimmed together round the Defiant Edge's die).
const PENDANT = 3.5, ENV_LEVEL = 0.95, RIM = 2.0;
// The gold filigree band: its width, its repeat along its length (the
// texture is 8:1), and how far in from the walls it is inlaid in the felt.
const TRIM = { w: 2.4, tile: 19.2, inset: 2.2 };
// The house's felts, picked in Settings (almanac_felt_v1): black baize, the
// house's own; and three lighter cloths - a camel tan, an ivory, a dove
// grey. Each is a colour and the sheen its nap gives off at a low light;
// `light` says how light it is, for what has to change with it (the gold
// print's dark keyline, the shadows: see the table).
export const FELTS = {
  black: { name: 'Black', color: 0x0f0f13, sheen: 0x34343e, light: 0 },
  tan: { name: 'Tan', color: 0x7a5a38, sheen: 0xcaa77a, light: 0.6 },
  ivory: { name: 'Ivory', color: 0xa99e86, sheen: 0xe9dfc8, light: 1 },
  dove: { name: 'Dove grey', color: 0x5f6368, sheen: 0xb8bcc4, light: 0.55 },
  // (2026-09-30: a pastel lilac and a cream among the light cloths; a
  // chocolate, a mahogany and a crimson among the dark ones - dyed baize,
  // each with the warmer or cooler sheen its dye gives the nap)
  lilac: { name: 'Pastel purple', color: 0x7e6f96, sheen: 0xd6c8ea, light: 0.6 },
  cream: { name: 'Cream', color: 0xae9b6e, sheen: 0xf0e2bc, light: 0.9 },
  chocolate: { name: 'Chocolate', color: 0x28170e, sheen: 0x6a4630, light: 0.1 },
  mahogany: { name: 'Mahogany', color: 0x40150e, sheen: 0x9c4a34, light: 0.14 },
  crimson: { name: 'Crimson', color: 0x5c0913, sheen: 0xc2394a, light: 0.2 }
};
export const feltOf = id => (FELTS[id] ? id : 'black');
// (a felt material dressed as felt `id`)
export function dressFelt(mat, id) {
  const f = FELTS[feltOf(id)];
  mat.color.setHex(f.color);
  mat.sheenColor.setHex(f.sheen);
  // (a light cloth's nap throws back more of the room than black's does)
  mat.envMapIntensity = 0.15 + 0.25 * f.light;
  mat.userData.felt = feltOf(id);
  mat.userData.feltLight = f.light;
  return mat;
}
// The trim round the felt - the filigree band inlaid in it and the fine
// metal lines either side of it (on the card table, the line let into the
// walnut edge too) - picked in Settings (almanac_trim_v1). Gold is the
// house's own. The others are each a real inlay:
//   onyx     - polished black onyx: a stone, not a metal, so it holds no
//              colour of its own and shows only what it mirrors - the lamp
//              runs along it as a hard white line, the relief a glitter;
//   silver   - sterling, freshly polished: a cool white mirror, a touch
//              brighter than the gold, the relief's hollows gone grey;
//   crimson  - a red enamel fired over silver and polished flat, so the
//              colour pools deep in the relief's hollows and runs thin
//              and bright over its crests, under a glass-hard shine;
//   burgundy - bronze patinated a deep wine red and waxed: a warm dark
//              metal with a soft sheen, redder where it is recessed.
// `color` multiplies the band's relief (a grey of the gold band's own
// artwork, so its hollows stay darker than its crests); the lines have no
// artwork, so `line` is their own colour.
export const TRIMS = {
  gold: { name: 'Gold' },
  onyx: { name: 'Shiny onyx', color: 0x17161a, line: 0x0b0b0d, metalness: 0.0, roughness: 0.07, env: 2.2 },
  silver: { name: 'Luminous silver', color: 0xffffff, line: 0xf0f3f7, metalness: 1, roughness: 0.14, env: 2.1 },
  crimson: { name: 'Pooled crimson', color: 0xd21a34, line: 0x9c0f22, metalness: 0.45, roughness: 0.1, env: 1.35 },
  burgundy: { name: 'Bronzed burgundy', color: 0xd06a5a, line: 0xa4463c, metalness: 1, roughness: 0.3, env: 1.45 }
};
export const trimOf = id => (TRIMS[id] ? id : 'gold');
// (the gold band's artwork in grey: its relief as light and dark, for a
// trim that is not gold to be coloured over; one per image)
const greyOf = new WeakMap();
function greyTrim(tex) {
  if (!tex || !tex.image) return null;
  if (greyOf.has(tex)) return greyOf.get(tex);
  const img = tex.image, c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height), a = d.data;
  let mx = 0;
  for (let i = 0; i < a.length; i += 4) mx = Math.max(mx, 0.2126 * a[i] + 0.7152 * a[i + 1] + 0.0722 * a[i + 2]);
  for (let i = 0; i < a.length; i += 4) { const v = Math.min(255, (0.2126 * a[i] + 0.7152 * a[i + 1] + 0.0722 * a[i + 2]) * 255 / (mx || 255)); a[i] = a[i + 1] = a[i + 2] = v; }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = tex.colorSpace; t.wrapS = tex.wrapS; t.wrapT = tex.wrapT; t.anisotropy = tex.anisotropy;
  t.repeat.copy(tex.repeat); t.offset.copy(tex.offset);
  greyOf.set(tex, t);
  return t;
}
// (materials dressed as trim `id`: `band` the filigree's, `line` the plain
// metal lines'. Each keeps what it was made as - the gold - to go back to,
// here rather than in its userData, which a clone copies as JSON.)
const trimBase = new WeakMap();
// (a material as it was made, before any trim: for a copy of it to be
// dressed on its own)
export function trimBaseOf(m) {
  const b = trimBase.get(m), c = m.clone();
  if (b) { Object.assign(c, { map: b.map, metalness: b.metalness, roughness: b.roughness, envMapIntensity: b.env, roughnessMap: b.roughnessMap }); c.color.setHex(b.color); }
  delete c.userData.trim;
  return c;
}
export function dressTrim({ band = [], line = [] }, id) {
  const tr = TRIMS[trimOf(id)];
  const keep = m => {
    if (!trimBase.has(m)) trimBase.set(m, { map: m.map, color: m.color.getHex(), metalness: m.metalness, roughness: m.roughness, env: m.envMapIntensity, roughnessMap: m.roughnessMap });
    return trimBase.get(m);
  };
  band.forEach(m => {
    const b = keep(m);
    if (!tr.color) Object.assign(m, { map: b.map, metalness: b.metalness, roughness: b.roughness, envMapIntensity: b.env, roughnessMap: b.roughnessMap });
    else Object.assign(m, { map: greyTrim(b.map) || b.map, metalness: tr.metalness, roughness: tr.roughness, envMapIntensity: tr.env, roughnessMap: tr.roughness < 0.15 ? null : b.roughnessMap });
    m.color.setHex(tr.color || b.color);
    m.userData.trim = trimOf(id);
    m.needsUpdate = true;
  });
  line.forEach(m => {
    const b = keep(m);
    if (!tr.line) Object.assign(m, { metalness: b.metalness, roughness: b.roughness, envMapIntensity: b.env, roughnessMap: b.roughnessMap });
    else Object.assign(m, { metalness: tr.metalness, roughness: tr.roughness, envMapIntensity: tr.env, roughnessMap: tr.roughness < 0.15 ? null : b.roughnessMap });
    m.color.setHex(tr.line || b.color);
    m.userData.trim = trimOf(id);
    m.needsUpdate = true;
  });
}
// After the shot the camera floats on for FLOAT seconds, rising toward a
// ceiling (eye height CEIL cm above the felt) that it eases into.
const FLOAT = 36, CEIL = 178;
// The room: the floor 82 cm under the felt, the lamps' height, the fog, and
// the far tables' light pools ([x, z, radius]).
const ROOM = { floor: -82, lamp: 172, backdropZ: -420, fog: 0.0019, far: [[-340, -300, 150], [390, -430, 170], [-560, 120, 160], [620, 60, 150], [120, -720, 190], [-260, 520, 150]] };
// The pace frames are drawn at: about 60 a second, evenly. A phone's
// screen may offer 90, 120 or 144 frames a second, and a shot drawn on every
// one of them asks twice the work of the GPU; the frames it can't finish in
// time are dropped here and there, and that unevenness is the judder. Drawn
// on every second frame of a 120 Hz screen (every one of a 60 or 90 Hz
// one), each frame has twice the time, and they come at an even beat. The
// screen's own interval is learnt from its frames: a low percentile of the
// gaps between them, as frames the page skips still come.
export function makePacer(hz = 60) {
  const gaps = [];
  let vsync = 1 / 60, seen = 0, drawn = 0;
  return {
    // true when the frame at `now` (a requestAnimationFrame time) is one to
    // draw; false to wait for the next
    due(now) {
      if (seen) {
        const g = (now - seen) / 1000;
        if (g > 0.003 && g < 0.05) { gaps.push(g); if (gaps.length > 48) gaps.shift(); }
        if (gaps.length >= 8) vsync = gaps.slice().sort((a, b) => a - b)[Math.floor(gaps.length * 0.2)];
      }
      seen = now;
      const every = Math.max(1, Math.floor(1 / hz / vsync + 0.3));
      if (drawn && (now - drawn) / 1000 < (every - 0.5) * vsync) return false;
      drawn = now;
      return true;
    },
    // (the next frame is drawn, whenever it comes: after a stop)
    reset() { drawn = 0; },
    get interval() { return vsync; }
  };
}

// Catmull-Rom through keys [t, v1, v2, ...]: smooth velocity through every key.
function spline(keys, t) {
  const n = keys.length;
  if (t <= keys[0][0]) return keys[0].slice(1);
  if (t >= keys[n - 1][0]) return keys[n - 1].slice(1);
  let i = 0;
  while (t > keys[i + 1][0]) i++;
  const a = keys[i], b = keys[i + 1], h = b[0] - a[0], s = (t - a[0]) / h;
  const s2 = s * s, s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = 3 * s2 - 2 * s3, h11 = s3 - s2;
  const out = [];
  for (let j = 1; j < a.length; j++) {
    const ma = i > 0 ? (b[j] - keys[i - 1][j]) / (b[0] - keys[i - 1][0]) : (b[j] - a[j]) / h;
    const mb = i + 2 < n ? (keys[i + 2][j] - a[j]) / (keys[i + 2][0] - a[0]) : (b[j] - a[j]) / h;
    out.push(h00 * a[j] + h10 * h * ma + h01 * b[j] + h11 * h * mb);
  }
  return out;
}

// ------------------------------------------------------------ the cup keys
// World seconds: [t, x, y, z, tilt (deg, mouth toward the wall), yaw (deg)].
// Held up and shaken, wound back, then thrust toward the wall - mouth
// leading - and checked, so the dice fly on out of it; then drawn back out
// of the shot. At the release the mouth sits exactly on the dice's launch
// point (physics.RELEASE).
const CUP = { h: 10, rTop: 4.25, rBot: 3.75 };
const RELEASE_TILT = 62;
const CUP_KEYS = (() => {
  const ax = [0, Math.cos(RELEASE_TILT * DEG), -Math.sin(RELEASE_TILT * DEG)];
  const c = [P.RELEASE.pos[0] - ax[0] * CUP.h / 2, P.RELEASE.pos[1] - ax[1] * CUP.h / 2, P.RELEASE.pos[2] - ax[2] * CUP.h / 2];
  const tr = P.RELEASE.t;
  return [
    [0.0, -1.5, 15.5, 54, -4, 4],
    [0.55, -1.2, 16.5, 54.5, -6, 2],
    [1.02, -0.8, 14.5, 56.5, -14, 0],
    [1.18, -0.4, 12.2, 56, -10, 0],
    [tr - 0.14, c[0] - 0.2, c[1] - 0.6, c[2] + 5.5, 34, 0],
    [tr, c[0], c[1], c[2], RELEASE_TILT, 0],
    [tr + 0.16, c[0] + 0.3, c[1] + 1.4, c[2] - 1.6, 84, -2],
    [tr + 0.55, -4, 19, 56, 40, -8],
    [tr + 1.1, -9, 30, 70, 10, -14]
  ];
})();
function cupShake(t) { return smoother((t - 0.25) / 0.2) * (1 - smoother((t - 0.98) / 0.16)); }
function cupAt(t) {
  const k = spline(CUP_KEYS, t);
  let [x, y, z, tilt, yaw] = k;
  const sh = cupShake(t);
  if (sh > 0) {
    const hz = 4.6, ph = t * 2 * Math.PI * hz;
    const jolt = Math.exp(-(((t * hz * 2) % 1) / 0.08)) * Math.sin(t * 2 * Math.PI * 31);
    y += sh * (-1.1 * Math.sin(ph) + 0.18 * jolt);
    z += sh * 0.5 * Math.sin(ph - 0.6);
    tilt += sh * (7 * Math.sin(ph + 0.5) + 1.4 * jolt);
    yaw += sh * 4 * Math.sin(ph * 0.5 + 0.8);
    x += sh * 0.25 * Math.sin(ph * 0.5);
  }
  const q = P.qmul(P.qaxis([0, 1, 0], yaw * DEG), P.qaxis([1, 0, 0], -tilt * DEG));
  return { p: [x, y, z], q, shake: sh };
}

// ------------------------------------------------------- the time warp
// Real time runs the world at full speed until the dice reach the wall,
// eases down to a crawl as they strike it (never stopped: they keep
// turning), holds while the camera swings round and the light gleams across
// them, and eases back up for the landing.
function rampWorld(s, from, to) { return from * s + (to - from) * (Math.pow(s, 6) - 3 * Math.pow(s, 5) + 2.5 * Math.pow(s, 4)); }
// (exported for the other games: the same slow motion round their own
// moment - the wheel's clapper riding its last peg)
export function makeWarp(wallW) {
  const a = wallW - 0.05, down = 0.26, hold = 0.95, up = 0.6, rate = 0.12;
  const world = t => {
    const x = t - a;
    if (x <= 0) return t;
    if (x <= down) return a + down * rampWorld(x / down, 1, rate);
    let w = a + down * rampWorld(1, 1, rate);
    if (x <= down + hold) return w + (x - down) * rate;
    w += hold * rate;
    if (x <= down + hold + up) return w + up * rampWorld((x - down - hold) / up, rate, 1);
    return w + up * rampWorld(1, rate, 1) + (x - down - hold - up);
  };
  const rateAt = t => {
    const x = t - a;
    if (x <= 0) return 1;
    if (x <= down) return 1 + (rate - 1) * smoother(x / down);
    if (x <= down + hold) return rate;
    if (x <= down + hold + up) return rate + (1 - rate) * smoother((x - down - hold) / up);
    return 1;
  };
  const real = w => { let lo = 0, hi = w + down + hold + up + 1; for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (world(m) < w) lo = m; else hi = m; } return (lo + hi) / 2; };
  return { world, real, rateAt, slowStart: a, slowHold: [a + down, a + down + hold], slowEnd: a + down + hold + up };
}

// ------------------------------------------------------------ the stick
// The stickman's stick: a long walnut shaft ending in a bent-wood J hook.
// He reaches in from the shooter's end, on the lens's side, over
// the dice, sets the hook down beyond them and draws them back to himself.
// The hook is a moving body in the physics, so the dice are pushed by it -
// sliding, bumping each other - rather than carried.
const HOOK = { rc: 4.2, cap: 0.28, lift: 3.8, pull: 32, glide: 4.5 };
// The shaft leans 11 degrees off the felt, and stands steeper as the hook
// comes toward the rail, so it always clears the cushion (SHAFT.clear cm
// above the felt); the glide after the draw stops where the shaft would
// have to stand steeper than SHAFT.maxLean.
const SHAFT = { len: 160, lean: 11, clear: 27, maxLean: 55 };
// Where the shaft leaves the hook, in the hook's frame (across, up, along).
const HOOK_ATTACH = [-HOOK.rc - 0.35, 0.2, HOOK.rc + 3.2];
function hookCurve() {
  // In the hook's own frame: a across, b along the pull (toward the
  // stickman); the foot of the J at the origin.
  const rc = HOOK.rc, pts = [];
  for (let b = rc + 3.2; b > rc; b -= 0.25) pts.push([-rc, b]);
  for (let k = 0; k <= 56; k++) { const th = Math.PI + (k * Math.PI) / 56; pts.push([rc * Math.cos(th), rc + rc * Math.sin(th)]); }
  for (let b = rc + 0.25; b <= rc + 2.2; b += 0.25) pts.push([rc, b]);
  return pts;
}
function stickLine(rest) {
  // A line to pull along that takes both dice in the hook: close to the
  // line through them, and drawn down the table toward the shooter - the
  // stickman stands at the shooter's end, on the lens's side, so the dice
  // come toward the bottom of the screen.
  const base = Math.atan2(Math.cos(-36 * DEG), Math.sin(-36 * DEG));
  let best = null;
  for (let d = -32; d <= 32; d += 2) {
    const ang = base + d * DEG;
    const U = [Math.cos(ang), 0, Math.sin(ang)];
    const X = [U[2], 0, -U[0]];   // (X, up, U) is right-handed
    const s = rest.map(r => r.p[0] * X[0] + r.p[2] * X[2]);
    const spread = Math.abs(s[0] - s[1]) / 2;
    const cost = spread * 3 + Math.abs(d) * 0.02;
    if (spread <= 2.2 && (!best || cost < best.cost)) best = { U, X, sc: (s[0] + s[1]) / 2, cost };
  }
  return best;
}
function hookFoot(line, rest) {
  // The furthest along the pull the foot can stand with the inside of the
  // J clear of every corner of both dice.
  const ri = HOOK.rc - HOOK.cap - P.DIE_ROUND - 0.12;
  const ih = P.DIE / 2 - P.DIE_ROUND;
  let foot = Infinity;
  for (const r of rest) {
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      const c = P.qrot(r.q, [sx * ih, sy * ih, sz * ih]);
      const x = r.p[0] + c[0], z = r.p[2] + c[2];
      const a = Math.min(Math.abs(x * line.X[0] + z * line.X[2] - line.sc), ri - 0.01);
      const u = x * line.U[0] + z * line.U[2];
      foot = Math.min(foot, u - (HOOK.rc - Math.sqrt(ri * ri - a * a)));
    }
  }
  return foot - 0.35;
}
function makeHookPath(line, foot, s0, draw, reach) {
  const T = { approach: [s0, s0 + 0.9], set: [s0 + 0.9, s0 + 1.2], pull: [s0 + 1.28, s0 + 2.5] };
  // After the draw the stick keeps coming - slowly, drawing the dice on
  // toward the stickman - and eases to rest `reach` cm further on. The
  // glide starts under the draw, so the stick never stops and restarts.
  const T1 = T.pull[1] - T.pull[0];
  const vg = reach > 0.5 ? Math.min(HOOK.glide, reach / (T1 * 0.5 + 3)) : 0;
  const g1 = vg * T1 * 0.5, gr = Math.max(0, reach - g1);
  const glideAt = x => {
    if (vg === 0 || x <= 0) return 0;
    if (x <= T1) { const s = x / T1; return vg * T1 * (Math.pow(s, 6) - 3 * Math.pow(s, 5) + 2.5 * Math.pow(s, 4)); }
    return g1 + (gr > 0.01 ? gr * (1 - Math.exp(-((x - T1) * vg) / gr)) : 0);
  };
  const at = t => {
    if (t <= T.approach[0]) return { u: foot + 70, h: HOOK.lift, on: false };
    if (t <= T.approach[1]) { const k = easeOut((t - T.approach[0]) / (T.approach[1] - T.approach[0]), 2.2); return { u: lerp(foot + 70, foot - 1.4, k), h: HOOK.lift, on: true }; }
    if (t <= T.set[1]) { const k = smoother((t - T.set[0]) / (T.set[1] - T.set[0])); return { u: lerp(foot - 1.4, foot, k), h: HOOK.lift * (1 - k), on: true }; }
    if (t <= T.pull[0]) return { u: foot, h: 0, on: true };
    const k = smoother((t - T.pull[0]) / T1);
    return { u: foot + draw * k + glideAt(t - T.pull[0]), h: 0, on: true };
  };
  return { line, foot, T, at, curve: hookCurve(), glide: { vg, reach } };
}
// The shaft's foot in the world for a hook at u, and the run (along the
// pull, cm) from there to the nearest rail it has to rise over.
function shaftFoot(line, u) {
  const { U, X, sc } = line, a = HOOK_ATTACH;
  return [X[0] * (sc + a[0]) + U[0] * (u + a[2]), HOOK.cap + a[1], X[2] * (sc + a[0]) + U[2] * (u + a[2])];
}
function runToRail(line, u) {
  const f = shaftFoot(line, u), U = line.U;
  let run = Infinity;
  if (U[0] > 0.05) run = Math.min(run, (P.TABLE.sideX - f[0]) / U[0]);
  if (U[0] < -0.05) run = Math.min(run, (-P.TABLE.sideX - f[0]) / U[0]);
  if (U[2] > 0.05) run = Math.min(run, (P.TABLE.nearZ - f[2]) / U[2]);
  if (U[2] < -0.05) run = Math.min(run, (P.TABLE.wallZ - f[2]) / U[2]);
  return run;
}
// The lean the shaft needs at a hook position to clear the rail ahead.
function shaftLean(line, u) {
  const run = runToRail(line, u);
  return Math.max(SHAFT.lean * DEG, Math.atan2(SHAFT.clear - HOOK.cap, Math.max(run, 1)));
}
// The draw (at most HOOK.pull) and how much further the glide may take the
// hook after it: until the shaft would need more than SHAFT.maxLean to
// clear the rail. Near a rail the draw is shortened, so there is always
// some way left to glide.
function hookRun(line, foot) {
  const need = (SHAFT.clear - HOOK.cap) / Math.tan(SHAFT.maxLean * DEG);
  const draw = Math.max(10, Math.min(HOOK.pull, runToRail(line, foot) - need - 8));
  return { draw, reach: Math.max(0, Math.min(40, runToRail(line, foot + draw) - need)) };
}
function hookWorld(hp, st) {
  const { U, X, sc } = hp.line;
  const O = [X[0] * sc + U[0] * st.u, HOOK.cap + st.h, X[2] * sc + U[2] * st.u];
  return { O, U, X };
}

// -------------------------------------------------------------- the plan
// What the stickman calls: the number, and 'easy' for an even total rolled
// the easy way (not a pair), or 'winner' for a seven or eleven.
const CALLS = { 3: ['Three', ''], 4: ['Four', 'The easy way'], 5: ['Five', ''], 6: ['Six', 'The easy way'], 7: ['Seven', 'Winner'], 8: ['Eight', 'The easy way'], 9: ['Nine', ''], 10: ['Ten', 'The easy way'], 11: ['Yo-leven', 'Winner'] };
const throwOpts = tier => ({
  tries: 200, budgetMs: 2500,
  extra: tier === 'standard' || tier === 'hardways' ? run => {
    const rest = run.bodies.map(b => ({ p: b.p, q: b.q }));
    return stickLine(rest) ? null : 'stick cannot take both dice';
  } : null
});
// makePlan works the throw out in one go (the lab and the checks use it);
// makePlanAsync is the same plan, searched without holding the main thread.
export function makePlan(tier, seed) {
  return planFromThrow(tier, seed, P.throwDice(seed, throwOpts(tier)));
}
export async function makePlanAsync(tier, seed, signal) {
  return planFromThrow(tier, seed, await P.throwDiceAsync(seed, throwOpts(tier), signal));
}
function planFromThrow(tier, seed, best) {
  const R = P.rng((seed ^ 0x9e3779b9) >>> 0);
  const wantsStick = tier === 'standard' || tier === 'hardways';
  // No throw passed every check within the budget: never play one that
  // did not. The caller shows the CSS intro instead.
  if (!best.score.ok) throw new Error(`no valid throw for seed ${seed}: ${best.score.why.join('; ')}`);
  let run = best.run;
  const restPose = () => run.bodies.map(b => ({ p: b.p.slice(), q: b.q.slice() }));
  const wallW = Math.min(...run.firstHit.map(h => (h ? h.t : 9)));
  const warp = makeWarp(wallW);
  let restW = Math.max(...run.restAt.map(r => (r == null ? P.RELEASE.t + 3 : r)));
  const plan = { tier, seed, warp, wallW, restW, throwOk: best.score.ok, why: best.score.why };
  const wallHits = run.firstHit.filter(h => h && h.kind === 'wall').map(h => h.pt);
  plan.impact = wallHits.length ? [0, 1, 2].map(k => wallHits.reduce((s, p) => s + p[k], 0) / wallHits.length) : [0, 8, P.TABLE.wallZ];

  // The edge: one die (the one nearer the lens) is stopped dead just before
  // it would settle flat and stood on a corner. The throw is run again with
  // it pinned there from that moment, so the other die still meets it.
  if (tier === 'edge') {
    const e = run.bodies[0].p[2] > run.bodies[1].p[2] ? 0 : 1;
    const tf = Math.max(run.restAt[e] - 0.3, wallW + 0.35);
    const f = P.poseAt(run, e, tf), g = P.poseAt(run, e, tf - 0.02);
    const ih = P.DIE / 2 - VIS_ROUND;
    let low = null;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      const d = P.qrot(f.q, [sx, sy, sz]);
      if (!low || d[1] < low.w[1]) low = { w: d, b: [sx, sy, sz] };
    }
    const lw = P.qrot(f.q, low.b.map(v => v / Math.sqrt(3)));
    const qc = P.qmul(P.qfromto(lw, [0, -1, 0]), f.q);
    const drift = [(f.p[0] - g.p[0]) / 0.02, (f.p[2] - g.p[2]) / 0.02];
    const pc = [f.p[0] + drift[0] * 0.07, ih * Math.sqrt(3) + VIS_ROUND, f.p[2] + drift[1] * 0.07];
    let pinned = false;
    run = P.simThrow(run.seed, {
      onStep: (t, bodies) => {
        if (pinned || t < tf) return;
        pinned = true;
        const b = bodies[e];
        b.p = pc.slice(); b.q = qc.slice(); b.v = [0, 0, 0]; b.w = [0, 0, 0]; b.sleep = true; b.fixed = true;
      },
      until: (t, b, rest) => rest[1 - e] != null && t > rest[1 - e] + 0.05 && t > tf + 0.4
    });
    run.restAt[e] = tf + 0.32;
    plan.edge = { die: e, tf, from: f, qc, pc, done: tf + 0.32 };
    restW = Math.max(tf + 0.32, run.restAt[1 - e] || tf + 0.32);
    plan.restW = restW;
  }
  plan.run = run;
  const rest = restPose();
  plan.rest = rest;

  // The numbers: each die's markings are turned so the tier's values land
  // on top (for the edge, the pinned die just shows a random corner).
  let values;
  if (tier === 'hardways') { const v = R() < 0.5 ? 1 : 6; values = [v, v]; }
  else if (tier === 'standard') { let a, b; do { a = 1 + Math.floor(R() * 6); b = 1 + Math.floor(R() * 6); } while (a === b); values = [a, b]; }
  else { values = [1 + Math.floor(R() * 6), 1 + Math.floor(R() * 6)]; }
  plan.values = values;
  plan.marks = rest.map((r, i) => (tier === 'edge' && plan.edge.die === i) ? P.CUBE_ROTATIONS[Math.floor(R() * 24)] : P.markingFor(r.q, values[i], R));
  plan.call = tier === 'standard' ? CALLS[values[0] + values[1]] : tier === 'hardways' ? [values[0] === 1 ? 'Snake Eyes' : 'Boxcars', ''] : null;

  // What follows the landing.
  if (wantsStick) {
    const line = stickLine(rest) || { U: [1, 0, 0], X: [0, 0, 1], sc: (rest[0].p[2] + rest[1].p[2]) / 2 };
    const s0 = restW + 0.9;
    const foot = hookFoot(line, rest);
    const run = hookRun(line, foot);
    const hp = makeHookPath(line, foot, s0, run.draw, run.reach);
    // (the physics runs a second on past the draw, the hook still pushing,
    // so the dice are already gliding with it when the recording ends)
    const simEnd = hp.T.pull[1] + 1.0;
    const dice = P.makeDice();
    dice.forEach((d, i) => { d.p = rest[i].p.slice(); d.q = rest[i].q.slice(); d.sleep = true; });
    const pts = hp.curve;
    const kin = t => {
      const st = hp.at(t);
      if (!st.on || st.h > 1.2 || t > simEnd) return null;
      const a = hookWorld(hp, st), b = hookWorld(hp, hp.at(t + 0.004));
      const v = [(b.O[0] - a.O[0]) / 0.004, (b.O[1] - a.O[1]) / 0.004, (b.O[2] - a.O[2]) / 0.004];
      return { r: HOOK.cap, v, pts: pts.map(([x, u]) => [a.O[0] + a.X[0] * x + a.U[0] * u, a.O[1], a.O[2] + a.X[2] * x + a.U[2] * u]) };
    };
    plan.stick = { hp, simEnd, run: P.simulate(dice, { t0: restW, duration: simEnd - restW, rand: R, kinematic: kin }) };
    plan.callW = restW + 0.1;
    plan.revealW = hp.T.pull[0] + 1.3;
    plan.endW = hp.T.pull[1] + 0.9;
  } else if (tier === 'vault') {
    const V = { shakes: [[0.55, 0.34, 7], [1.3, 0.38, 10.5], [2.05, 0.44, 15]], boom: restW + 2.85 };
    const plaques = [];
    for (let i = 0; i < 6; i++) {
      const b = P.makeBody('plaque', 4, 0.3, 2.5, 0.22, 3);
      const src = rest[i % 2].p;
      const a = (i / 6) * 2 * Math.PI + R() * 0.8;
      const out = 45 + 45 * R();
      b.p = [src[0] + Math.cos(a) * 1.5, 2.5 + i * 0.9, src[2] + Math.sin(a) * 1.5];
      b.v = [Math.cos(a) * out, 150 + 70 * R(), Math.sin(a) * out];
      b.q = P.qnorm([R() - 0.5, R() - 0.5, R() - 0.5, R() - 0.5]);
      const ax = [R() - 0.5, R() - 0.5, R() - 0.5], l = Math.hypot(...ax) || 1, sp = 7 + 8 * R();
      b.w = ax.map(x => (x / l) * sp);
      plaques.push(b);
    }
    plan.vault = Object.assign(V, {
      run: P.simulate(plaques, { t0: V.boom, duration: 3.6, rand: R, until: (t, b, restAt) => restAt.every(x => x != null) && t > V.boom + 1.5 }),
      kinds: plaques.map((_, i) => (i % 3 === 1 ? '100k' : '25k'))
    });
    plan.callW = V.boom;
    plan.revealW = V.boom + 2.6;
    plan.endW = V.boom + 4.6;
  } else {
    plan.callW = plan.edge.done + 0.65;
    plan.silence = [plan.edge.done, plan.edge.done + 0.65];
    plan.revealW = plan.edge.done + 0.65;
    plan.endW = plan.revealW + 2.6;
  }
  plan.revealReal = warp.real(plan.revealW);
  plan.totalReal = warp.real(plan.endW);
  plan.restReal = warp.real(restW);
  plan.wallReal = warp.real(wallW);
  return plan;
}

// Where each die is at world time w, as { p, q } (q with its markings).
function dicePose(plan, i, w) {
  const run = plan.run, L = run.launch[i];
  let pose;
  if (w < P.RELEASE.t) {
    // Before the release: the same flight run back, so the dice are already
    // on it as they slide out of the mouth.
    const dt = w - P.RELEASE.t;
    const wl = Math.hypot(...L.w) || 1;
    pose = { p: [L.p[0] + L.v[0] * dt, L.p[1] + L.v[1] * dt - 0.5 * P.G * dt * dt, L.p[2] + L.v[2] * dt], q: P.qmul(P.qaxis(L.w, wl * dt), L.q) };
  } else if (plan.stick && w > plan.restW) {
    const S = plan.stick;
    if (w <= S.simEnd) pose = P.poseAt(S.run, i, w);
    else {
      // past the recording the dice ride on with the hook, sliding
      const last = P.poseAt(S.run, i, S.simEnd), du = S.hp.at(w).u - S.hp.at(S.simEnd).u, U = S.hp.line.U;
      pose = { p: [last.p[0] + U[0] * du, last.p[1], last.p[2] + U[2] * du], q: last.q };
    }
  }
  else pose = P.poseAt(run, i, w);
  if (plan.edge && plan.edge.die === i && w > plan.edge.tf) {
    const E = plan.edge, k = easeOut((w - E.tf) / (E.done - E.tf), 3);
    const wob = w > E.done ? 0.012 * Math.exp(-(w - E.done) / 0.35) * Math.sin((w - E.done) * 26) : 0;
    const q = P.qmul(P.qaxis([1, 0, 0.4], wob), P.qslerp(E.from.q, E.qc, k));
    pose = { p: mix3(E.from.p, E.pc, k), q };
  }
  return { p: pose.p, q: P.qmul(pose.q, plan.marks[i]) };
}

// ---------------------------------------------------------- the geometry
// A rounded box: an inner box grown by a ball of radius r, each face a grid
// packed toward its edges so the rounding is smooth. `dimple(face, u, v)`
// may sink points (the pips' wells); `group(face)` picks each face's
// material. UVs run 0..1 across each face.
function roundedBox(h, r, nFlat, nBand, opt = {}) {
  const pos = [], nor = [], uvs = [], idx = [];
  const geo = new THREE.BufferGeometry();
  const samples = hh => {
    const out = [], f = hh - r;
    for (let k = 0; k < nBand; k++) out.push(-hh + (r * k) / nBand);
    for (let k = 0; k <= nFlat; k++) out.push(-f + (2 * f * k) / nFlat);
    for (let k = nBand - 1; k >= 0; k--) out.push(hh - (r * k) / nBand);
    return out;
  };
  const faces = [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]];
  faces.forEach(([a, s], fi) => {
    const b = (a + 1) % 3, c = (a + 2) % 3;
    const U = samples(h[b]), V = samples(h[c]);
    const start = pos.length / 3, i0 = idx.length;
    for (let j = 0; j < V.length; j++) for (let i = 0; i < U.length; i++) {
      const Pp = [0, 0, 0]; Pp[a] = s * h[a]; Pp[b] = U[i]; Pp[c] = V[j];
      const inner = Pp.map((x, k) => Math.max(-(h[k] - r), Math.min(h[k] - r, x)));
      const d = [Pp[0] - inner[0], Pp[1] - inner[1], Pp[2] - inner[2]];
      const l = Math.hypot(...d) || 1;
      const n = d.map(x => x / l);
      const Q = [inner[0] + n[0] * r, inner[1] + n[1] * r, inner[2] + n[2] * r];
      if (opt.dimple) {
        const sink = opt.dimple(fi, U[i], V[j]);
        if (sink) { Q[a] -= s * sink; }
      }
      pos.push(...Q); nor.push(...n);
      uvs.push(...(opt.uv ? opt.uv(fi, Q) : [0.5 + U[i] / (2 * h[b]), 0.5 + V[j] / (2 * h[c])]));
    }
    const nu = U.length;
    for (let j = 0; j < V.length - 1; j++) for (let i = 0; i < nu - 1; i++) {
      const p0 = start + j * nu + i, p1 = p0 + 1, p2 = p0 + nu, p3 = p2 + 1;
      if (s > 0) idx.push(p0, p1, p2, p1, p3, p2); else idx.push(p0, p2, p1, p1, p2, p3);
    }
    geo.addGroup(i0, idx.length - i0, opt.group ? opt.group(fi) : 0);
  });
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  return geo;
}
// Face index (roundedBox order) -> die value: faces follow physics.FACES.
const FACE_VALUE = [3, 4, 1, 6, 2, 5];
const PIP_LAYOUT = {
  1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1]]
};
const PIP = { off: 0.44, r: 0.225, r1: 0.3, depth: 0.1 };
// The dice are drawn rounder than the physics body (0.2): the soft, sanded
// corners of translucent casino-shop dice. A die at rest sits on a face, so
// the two agree there; on a corner (the Defiant Edge) it is set by this one.
const VIS_ROUND = 0.28;
function pipsOf(value) { return PIP_LAYOUT[value].map(([u, v]) => ({ u: u * PIP.off, v: v * PIP.off, r: value === 1 ? PIP.r1 : PIP.r })); }
function dieGeometry() {
  const h = P.DIE / 2;
  return roundedBox([h, h, h], VIS_ROUND, 40, 7, {
    dimple: (fi, u, v) => {
      for (const pp of pipsOf(FACE_VALUE[fi])) if (Math.hypot(u - pp.u, v - pp.v) < pp.r * 1.02) return PIP.depth + 0.04;
      return 0;
    }
  });
}
// The pips: cupped white paint, each a shallow bowl sitting in its well.
function pipGeometry() {
  const h = P.DIE / 2, pos = [], nor = [], idx = [], col = [];
  const faces = [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]];
  faces.forEach(([a, s], fi) => {
    const b = (a + 1) % 3, c = (a + 2) % 3;
    for (const pp of pipsOf(FACE_VALUE[fi])) {
      const rings = 7, segs = 30, start = pos.length / 3;
      for (let k = 0; k <= rings; k++) {
        const rho = (pp.r * k) / rings;
        const z = -PIP.depth * (1 - (rho * rho) / (pp.r * pp.r)) + 0.004;
        for (let m = 0; m < (k === 0 ? 1 : segs); m++) {
          const th = (m / segs) * 2 * Math.PI;
          const du = rho * Math.cos(th), dv = rho * Math.sin(th);
          const Pp = [0, 0, 0]; Pp[a] = s * (h + z); Pp[b] = pp.u + du; Pp[c] = pp.v + dv;
          const g = (2 * PIP.depth) / (pp.r * pp.r);
          const n = [0, 0, 0]; n[a] = s; n[b] = -g * du; n[c] = -g * dv;
          const l = Math.hypot(...n);
          pos.push(...Pp); nor.push(n[0] / l, n[1] / l, n[2] / l);
          // a bright lip round a greyer hollow (the paint pools thin there)
          const shade = 0.62 + 0.38 * Math.pow(rho / pp.r, 3);
          col.push(shade, shade, shade);
        }
      }
      for (let m = 0; m < segs; m++) {
        const a1 = start + 1 + m, a2 = start + 1 + ((m + 1) % segs);
        if (s > 0) idx.push(start, a1, a2); else idx.push(start, a2, a1);
      }
      for (let k = 1; k < rings; k++) for (let m = 0; m < segs; m++) {
        const r0 = start + 1 + (k - 1) * segs, r1 = start + 1 + k * segs;
        const p0 = r0 + m, p1 = r0 + ((m + 1) % segs), p2 = r1 + m, p3 = r1 + ((m + 1) % segs);
        if (s > 0) idx.push(p0, p2, p1, p1, p2, p3); else idx.push(p0, p1, p2, p1, p3, p2);
      }
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  return geo;
}

// UVs in world units, so a shared texture keeps one scale on every piece:
// `scaleUV` stretches a geometry's 0..1 UVs; `boxUV` gives each face of a
// BoxGeometry its own size over (tu, tv) cm tiles, the grain running along
// the box's longest horizontal side.
function scaleUV(geo, su, sv) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  uv.needsUpdate = true;
  return geo;
}
function boxUV(geo, w, h, d, tu, tv) {
  // BoxGeometry faces in order: +x, -x, +y, -y, +z, -z (4 vertices each)
  const uv = geo.attributes.uv, alongX = w >= d;
  const size = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    let [a, b] = size[f];
    const swap = (f < 2 && alongX) || (f >= 2 && f < 4 && !alongX);
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k, u = uv.getX(i), v = uv.getY(i);
      if (swap) uv.setXY(i, (v * b) / tu, (u * a) / tv); else uv.setXY(i, (u * a) / tu, (v * b) / tv);
    }
  }
  uv.needsUpdate = true;
  return geo;
}

// Soft sprites and decals, painted once on small canvases.
function canvasTexture(size, paint) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  paint(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const radial = stops => (g, n) => {
  const gr = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  stops.forEach(([o, c]) => gr.addColorStop(o, c));
  g.fillStyle = gr; g.fillRect(0, 0, n, n);
};

// A studio for the reflections: a dark gunmetal room lit by long softbox
// strips over the table and a broad panel behind the lens - what the
// glossy dice, brass and felt sheen mirror. (Exported: the table's dealer
// has a canvas of its own, which needs the same room in its own context,
// so its ceramic, gold and glass mirror what the brass beside it does.)
export function studioEnvironment(renderer) {
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(20, 10, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.018, 0.019, 0.022), side: THREE.BackSide })));
  const panel = (w, h, rgb, k, pos, look) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(rgb[0] * k, rgb[1] * k, rgb[2] * k), side: THREE.DoubleSide }));
    m.position.set(...pos); m.lookAt(...look); scene.add(m);
  };
  panel(9, 0.7, [1, 0.93, 0.82], 9, [0, 4.8, -1.2], [0, 0, -1.2]);
  panel(9, 0.5, [1, 0.95, 0.88], 6, [0, 4.8, 1.6], [0, 0, 1.6]);
  panel(6, 3.2, [0.85, 0.9, 1], 2.4, [-2, 1.8, 9.5], [0, 0, 0]);
  panel(3.5, 2.2, [1, 0.8, 0.6], 1.3, [9.5, 1.2, -2], [0, 0, 0]);
  panel(12, 1.2, [0.5, 0.52, 0.56], 0.6, [0, 1.4, -9.8], [0, 1.4, 0]);
  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromScene(scene, 0.035).texture;
  pm.dispose();
  return env;
}

// -------------------------------------------------------------- sound
// Synthesised live with WebAudio (the Vault Pull's ceramic clack is a
// recording, fetched only for that tier). Browsers keep a page silent until
// it has been tapped, so the intro may start muted: the first tap or key
// starts the sound (see createIntro), and the speaker button turns it on
// or off without skipping the shot.
class Sound {
  constructor() {
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = AC ? new AC() : null;
    if (!this.ctx) return;
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = 0.85; this.master.connect(c.destination);
    const n = c.sampleRate;
    this.noise = c.createBuffer(1, n, n);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this.clack = null;
  }
  get on() { return !!this.ctx && this.ctx.state === 'running' && !this.muted; }
  burst(when, type, freq, q, gain, dur, rate) {
    const c = this.ctx, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.noise; src.playbackRate.value = rate || 1;
    // (the buffer holds a second of noise: a longer burst loops it)
    src.loop = true;
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(gain, when + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(f); f.connect(g); g.connect(this.out || this.master);
    src.start(when, Math.random() * 0.5); src.stop(when + dur + 0.05);
  }
  tone(when, freq, gain, dur, type = 'sine', slide) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, when);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, when + dur);
    g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(gain, when + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g); g.connect(this.out || this.master);
    o.start(when); o.stop(when + dur + 0.05);
  }
  ambience(start) {
    if (this.bed) return;
    const c = this.ctx, src = c.createBufferSource(), lp = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.noise; src.loop = true; src.playbackRate.value = 0.5;
    lp.type = 'lowpass'; lp.frequency.value = 420;
    g.gain.value = 0; g.gain.setTargetAtTime(0.05, start, 0.4);
    src.connect(lp); lp.connect(g); g.connect(this.master);
    src.start(start);
    this.bed = { src, g };
  }
  cut(when) { this.fade(when, 0.012); }
  fade(when, tc) { if (this.bed) { this.bed.g.gain.cancelScheduledValues(when); this.bed.g.gain.setTargetAtTime(0, when, tc); } }
  play(ev, when, slow) {
    // slow < 1: the moment is in slow motion, so the sound is too.
    const k = slow < 0.6 ? 0.5 : 1;
    const v = Math.min(1, ev.speed / 260);
    switch (ev.kind) {
      case 'felt':
        this.burst(when, 'bandpass', 3200 * k, 2.2, 0.35 * v, 0.018 / k);
        this.burst(when, 'lowpass', 700 * k, 0.7, 0.5 * v, 0.045 / k);
        break;
      case 'wall':
        this.burst(when, 'lowpass', 320 * k, 0.9, 0.9 * v, 0.08 / k, 0.7);
        this.tone(when, 150 * k, 0.25 * v, 0.12 / k, 'sine', 90 * k);
        break;
      case 'body':
        this.burst(when, 'bandpass', 5200 * k, 3, 0.4 * v, 0.012 / k);
        this.tone(when, 3100 * k, 0.08 * v, 0.05 / k, 'triangle');
        break;
      case 'stick':
        this.burst(when, 'bandpass', 900, 1.4, 0.35 * v, 0.03);
        break;
      case 'plaque':
        if (this.clack) {
          const s = this.ctx.createBufferSource(), g = this.ctx.createGain();
          s.buffer = this.clack; s.playbackRate.value = 0.9 + Math.random() * 0.25;
          g.gain.value = 0.25 + 0.75 * v;
          s.connect(g); g.connect(this.master); s.start(when);
        } else {
          this.burst(when, 'bandpass', 2800, 4, 0.7 * v, 0.05);
        }
        break;
      case 'rattle':
        this.burst(when, 'bandpass', 2600 + Math.random() * 900, 3, 0.18, 0.02);
        break;
      case 'whoosh':
        this.burst(when, 'bandpass', 900, 0.8, 0.14, 0.28, 0.6);
        break;
      case 'hum':
        this.tone(when, ev.f, 0.06 + 0.1 * ev.level, ev.dur, 'sawtooth');
        break;
      case 'boom': {
        // (soft: the wheel's, under its bell)
        const g = ev.soft ? 0.3 : 1;
        this.tone(when, 70, 0.9 * g, 1.2, 'sine', 32);
        this.burst(when, 'lowpass', 900, 0.8, 1 * g, 0.7);
        break;
      }
      case 'chime':
        [1, 2.76, 5.4].forEach((m, i) => this.tone(when + i * 0.03, 880 * m, 0.08 / (i + 1), 1.4, 'sine'));
        break;
      case 'drop':
        this.tone(when, 55, 0.7, 2.2, 'sine', 41);
        [1, 1.5, 2].forEach((m, i) => this.tone(when + 0.05, 220 * m, 0.05, 2.4, 'sine'));
        break;
      case 'scrape':
        this.burst(when, 'bandpass', 1400, 1.2, 0.09, ev.dur, 0.8);
        break;
      // (the wheel's: the clapper's leather over a brass peg - a slap and
      // the pin's ring, quicker and lighter the faster the wheel; the
      // wind-up's creak; the pull; the settle's wooden knock; the bell)
      case 'tick': {
        const f = Math.min(1, (ev.speed || 1) / 9);
        this.burst(when, 'bandpass', (1500 + 900 * f) * k, 2.4, (0.12 + 0.16 * f), 0.014 / k);
        this.tone(when, (640 + 120 * f) * k, 0.05 + 0.05 * (1 - f), 0.05 / k, 'triangle', 420 * k);
        break;
      }
      case 'creak':
        this.burst(when, 'bandpass', 420, 3, 0.12, 0.4, 0.5);
        this.tone(when + 0.05, 180, 0.03, 0.35, 'sawtooth', 140);
        break;
      case 'pull':
        this.burst(when, 'bandpass', 700, 0.8, 0.2, 0.42, 0.7);
        this.burst(when + 0.06, 'lowpass', 300, 0.8, 0.3, 0.3);
        break;
      case 'knock':
        this.burst(when, 'lowpass', 520, 0.9, 0.5, 0.07);
        this.tone(when, 210, 0.18, 0.14, 'sine', 120);
        break;
      case 'bell':
        [1, 2.0, 2.98, 4.2].forEach((m, i) => this.tone(when + i * 0.012, 660 * m, 0.12 / (i + 1), 2.2 - i * 0.3, 'sine'));
        break;
      // (the plinko's: the chip's brass rim on a brass pin - a ring, higher
      // and shorter the harder; its clay on a rail; its landing on the
      // bucket's brass floor; the lever's latch)
      case 'pin': {
        const f = Math.min(1, (ev.speed || 60) / 200);
        this.burst(when, 'bandpass', (3400 + 1400 * f) * k, 5, 0.08 + 0.2 * f, 0.016 / k);
        this.tone(when, (2300 + 300 * f) * k, 0.03 + 0.05 * f, (0.07 + 0.05 * f) / k, 'sine', 2100 * k);
        this.tone(when, 900 * k, 0.03 * f, 0.03 / k, 'triangle');
        break;
      }
      case 'clay': {
        const f = Math.min(1, (ev.speed || 40) / 200);
        this.burst(when, 'bandpass', 1900 * k, 2.5, 0.06 + 0.14 * f, 0.02 / k);
        break;
      }
      case 'cup': {
        const f = Math.min(1, (ev.speed || 100) / 260);
        this.burst(when, 'lowpass', 700 * k, 0.9, 0.25 + 0.3 * f, 0.06 / k);
        this.tone(when, 420 * k, 0.1 * f, 0.1 / k, 'sine', 260 * k);
        break;
      }
      case 'latch':
        this.burst(when, 'bandpass', 1400, 1.2, 0.18, 0.03);
        this.tone(when + 0.01, 520, 0.06, 0.05, 'triangle', 380);
        break;
      // (blackjack's: a card drawn from the shoe or sliding over the cloth -
      // a dry hiss as long as the slide; the snap of a card off the
      // fingers; a card landing on the felt, harder the faster; the
      // machine's lift, a servo's rising whine)
      case 'slide':
        this.burst(when, 'bandpass', 2600 * k, 1.1, 0.06, (ev.dur || 0.08) / k, 1.3);
        break;
      case 'snap':
        this.burst(when, 'bandpass', 3800 * k, 3.5, ev.soft ? 0.07 : 0.14, 0.012 / k);
        this.tone(when, 1900 * k, ev.soft ? 0.02 : 0.04, 0.03 / k, 'triangle', 1500 * k);
        break;
      case 'pat': {
        const f = Math.min(1, (ev.speed || 60) / 160);
        this.burst(when, 'lowpass', 1100 * k, 0.9, 0.08 + 0.18 * f, 0.03 / k);
        this.burst(when, 'bandpass', 3000 * k, 2.2, 0.03 + 0.05 * f, 0.012 / k);
        break;
      }
      case 'servo':
        this.tone(when, ev.f0 || 80, 0.025, ev.dur || 0.6, 'sawtooth', ev.f1 || 140);
        this.burst(when, 'bandpass', 600, 2, 0.03, ev.dur || 0.6, 0.6);
        break;
      default:
    }
  }
}

// ------------------------------------------------------------- the intro
// Everything the shot takes hold of (the WebGL context, the sound, its
// elements, its listeners) is registered for undoing as it is made. If the
// setup throws at any point, or opts.signal aborts it while it is still
// loading, all of it is given back before the promise rejects: browsers
// allow only a few live contexts, and a half-built shot must never stay
// painted over the CSS intro that replaces it.
export async function createIntro(opts) {
  const undo = [];
  let torn = false;
  const teardown = () => {
    if (torn) return;
    torn = true;
    while (undo.length) { try { undo.pop()(); } catch (e) { /* keep going */ } }
  };
  try {
    return await buildIntro(opts, undo, teardown);
  } catch (err) {
    teardown();
    throw err;
  }
}

async function buildIntro(opts, undo, teardown) {
  const o = Object.assign({ host: null, controlsHost: null, tier: 'standard', seed: 1, game: 'dice', onReveal: null, onEnd: null, sound: true, onSoundChange: null, quality: 'auto', signal: null, motionOff: null, felt: 'black', trim: 'gold' }, opts);
  const checkAbort = () => { if (o.signal && o.signal.aborted) throw new Error('intro cancelled'); };
  checkAbort();
  const host = o.host;
  const tier = TIERS.includes(o.tier) ? o.tier : 'standard';
  // The game (see GAMES): the dice are built here; another game's module is
  // fetched now, alongside the set's textures, and asked for its pieces once
  // the room and its lights stand (`game`, below).
  const gameId = GAMES.includes(o.game) ? o.game : 'dice';
  const gameLoad = gameId === 'dice' ? null : import(`./${gameId}.mjs`);
  let game = null;

  // Rare assets start loading now, while the throw is worked out; nothing
  // waits on them for long, and nothing is fetched for a tier not drawn.
  const loader = new THREE.TextureLoader();
  const tex = (f, srgb, rep) => loader.loadAsync(asset(f)).then(t => {
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
    t.anisotropy = 4;
    return t;
  });
  const rare = {};
  const rareLoads = [];
  if (tier === 'hardways') {
    // (the lettering is an <img>: it is shown over the shot, not in it)
    rare.platinum = null;
  }
  if (tier === 'vault' && !gameLoad) {
    rareLoads.push(tex('rare/plaque-25k.jpg', true).then(t => { rare.p25 = t; }).catch(() => {}));
    rareLoads.push(tex('rare/plaque-100k.jpg', true).then(t => { rare.p100 = t; }).catch(() => {}));
    rareLoads.push(fetch(asset('rare/ceramic-clack.wav')).then(r => (r.ok ? r.arrayBuffer() : null)).then(b => { rare.clackBytes = b; }).catch(() => {}));
  }

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // (a moving frame: the screen's resolution, to 2x - see size())
  const LIVE_MAX = Math.min(window.devicePixelRatio || 1, 2);
  let pixelRatio = LIVE_MAX;
  renderer.setPixelRatio(pixelRatio);
  const canvas = renderer.domElement;
  canvas.className = 'r3-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  undo.push(() => {
    renderer.dispose();
    try { renderer.forceContextLoss(); } catch (e) { /* already gone */ }
    canvas.remove();
  });

  const [feltN, rubberN, leatherN, walnut, gunmetal, badge, goldC, goldA, goldN, walnutN, cushionN, carpetC, carpetN] = await Promise.all([
    tex('felt-normal.jpg', false, [13, 20]),
    tex('rubber-normal.jpg', false, [14.4, 2.36]),
    tex('leather-normal.jpg', false, [5, 2]),
    tex('walnut.jpg', true, [1, 1]),
    tex('gunmetal.jpg', true),
    tex('badge.png', true),
    tex('gold-trim-color.jpg', true, [1, 1]),
    tex('gold-trim-alpha.png', false, [1, 1]),
    tex('gold-trim-normal.jpg', false, [1, 1]),
    tex('walnut-normal.jpg', false, [1, 1]),
    tex('cushion-normal.jpg', false, [1, 1]),
    tex('carpet-color.jpg', true, [1, 1]),
    tex('carpet-normal.jpg', false, [1, 1])
  ]);
  // (the filigree band repeats along its length only)
  [goldC, goldA, goldN].forEach(t => { t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = 8; });
  feltN.anisotropy = 8;
  checkAbort();
  // (another game's plan comes with its pieces, once the room stands)
  let plan = gameLoad ? null : await makePlanAsync(tier, o.seed, o.signal);
  checkAbort();
  let W = plan ? plan.warp : null;

  // ---- The set.
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050506);
  scene.environment = studioEnvironment(renderer);
  scene.environmentIntensity = ENV_LEVEL;

  const felt = new THREE.Mesh(new THREE.PlaneGeometry(2 * P.TABLE.sideX, P.TABLE.nearZ - P.TABLE.wallZ),
    // black baize: a fine twill under a soft nap that catches the light
    new THREE.MeshPhysicalMaterial({ color: 0x070709, roughness: 0.9, specularIntensity: 0.22, sheen: 0.85, sheenRoughness: 0.5, sheenColor: new THREE.Color(0x2c2c36), normalMap: feltN, normalScale: new THREE.Vector2(0.85, 0.85), envMapIntensity: 0.15 }));
  felt.rotation.x = -Math.PI / 2;
  felt.position.set(0, 0, (P.TABLE.nearZ + P.TABLE.wallZ) / 2);
  felt.receiveShadow = true;
  dressFelt(felt.material, o.felt);
  scene.add(felt);

  const rubber = new THREE.MeshStandardMaterial({ color: 0x08080a, roughness: 0.7, normalMap: rubberN, normalScale: new THREE.Vector2(0.9, 0.9) });
  // (the walls: plain pebbled leather; the padded rails: the same leather
  // with a double-stitched seam either side of the top - see cushionUV)
  const leatherWall = new THREE.MeshStandardMaterial({ color: 0x0e0e10, roughness: 0.42, normalMap: leatherN, normalScale: new THREE.Vector2(0.3, 0.3) });
  const cushion = new THREE.MeshStandardMaterial({ color: 0x100e0e, roughness: 0.4, normalMap: cushionN, normalScale: new THREE.Vector2(0.55, 0.55), envMapIntensity: 0.9 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xd8ae58, metalness: 1, roughness: 0.27, envMapIntensity: 1.0 });
  // Gold filigree: a running scroll of acanthus in relief, between beaded
  // rules. One band texture, repeating along its length (TRIM.tile cm).
  const gold = new THREE.MeshStandardMaterial({ map: goldC, alphaMap: goldA, alphaTest: 0.5, normalMap: goldN, normalScale: new THREE.Vector2(1.3, 1.3), metalness: 1, roughness: 0.34, envMapIntensity: 1.05, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  // figured walnut under a satin lacquer (UVs in cm: 60 along the grain, 15 across)
  const wood = new THREE.MeshPhysicalMaterial({ map: walnut, normalMap: walnutN, normalScale: new THREE.Vector2(0.35, 0.35), color: 0x8a6e60, roughness: 0.42, clearcoat: 0.65, clearcoatRoughness: 0.18 });
  const WOOD_TILE = [60, 15];
  const wallTop = P.TABLE.wallTop, wz = P.TABLE.wallZ, sx = P.TABLE.sideX;
  const back = new THREE.Mesh(new THREE.PlaneGeometry(2 * sx, wallTop), rubber);
  back.position.set(0, wallTop / 2, wz); back.receiveShadow = true; scene.add(back);
  // A rail: the padded cushion over the wall, a brass edge, and the walnut
  // cap outside it; below the cap the walnut apron runs down to a black
  // plinth, so the table stands on the floor (seen from the float and the
  // fly-in). capLen runs corner to corner of the outside.
  const nz = P.TABLE.nearZ, OUT = 18, APRON = -56;
  const addRail = (len, capLen, apLen, pos, rotY) => {
    const g = new THREE.Group();
    // (a cylinder's u runs round it, v along it: stitches every 14.45 cm tile)
    const cyl = new THREE.Mesh(scaleUV(new THREE.CylinderGeometry(4.6, 4.6, len, 48), 1, len / 14.45), cushion);
    cyl.rotation.z = Math.PI / 2; cyl.position.set(0, wallTop + 4.4, -4.4); cyl.castShadow = true; g.add(cyl);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(len, 0.55, 1.0), brass);
    trim.position.set(0, wallTop + 0.15, -0.55); g.add(trim);
    const cap = new THREE.Mesh(boxUV(new THREE.BoxGeometry(capLen, 3.2, 10), capLen, 3.2, 10, ...WOOD_TILE), wood);
    cap.position.set(0, wallTop + 7.4, -13); cap.castShadow = true; g.add(cap);
    const apH = wallTop + 5.8 - APRON;
    const apron = new THREE.Mesh(boxUV(new THREE.BoxGeometry(apLen, apH, 2.4), apLen, apH, 2.4, ...WOOD_TILE), wood);
    apron.position.set(0, APRON + apH / 2, -(OUT - 1.2)); g.add(apron);
    const band = new THREE.Mesh(new THREE.BoxGeometry(apLen, 0.6, 0.4), brass);
    band.position.set(0, wallTop + 2.2, -(OUT + 0.15)); g.add(band);
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(capLen - 16, APRON + 82, 2), new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.6 }));
    plinth.position.set(0, (APRON - 82) / 2, -(OUT - 9)); g.add(plinth);
    g.position.set(...pos); g.rotation.y = rotY; scene.add(g);
  };
  const outW = 2 * (sx + OUT);
  addRail(2 * sx + 10, outW, outW - 4.8, [0, 0, wz], 0);
  // the near end: the players' side, closed like the rest (behind the lens
  // through the shot; seen from the float and the fly-in)
  const near = new THREE.Mesh(new THREE.PlaneGeometry(2 * sx, wallTop), leatherWall);
  near.position.set(0, wallTop / 2, nz); near.rotation.y = Math.PI; near.receiveShadow = true; scene.add(near);
  addRail(2 * sx + 10, outW, outW - 4.8, [0, 0, nz], Math.PI);
  [-1, 1].forEach(sgn => {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(nz - wz, wallTop), leatherWall);
    side.position.set(sgn * sx, wallTop / 2, (nz + wz) / 2);
    side.rotation.y = -sgn * Math.PI / 2; side.receiveShadow = true; scene.add(side);
    // (the sides' aprons run the full length, closing the corners)
    addRail(nz - wz + 10, nz - wz + 2 * OUT - 20, nz - wz + 2 * OUT, [sgn * sx, 0, (nz + wz) / 2], -sgn * Math.PI / 2);
  });
  // The gold: a filigree border inlaid in the felt round the back and
  // sides (mitred at the corners), and a frieze along the top of the walls.
  {
    const band = (quad, uvOf) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(quad.flat(), 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(quad.map(uvOf).flat(), 2));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(quad.map(() => [0, 0, 0]).flat(), 3));
      g.setIndex([0, 1, 2, 0, 2, 3]);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, gold);
      m.receiveShadow = true;
      scene.add(m);
    };
    const oz = wz + TRIM.inset, iz = oz + TRIM.w, ox = sx - TRIM.inset, ix = ox - TRIM.w, y = 0.01;
    const onz = nz - TRIM.inset, inz = onz - TRIM.w;
    // back and near: u runs along x; v 0 at the wall side, 1 inward
    band([[-ox, y, oz], [-ix, y, iz], [ix, y, iz], [ox, y, oz]], p => [p[0] / TRIM.tile, (p[2] - oz) / TRIM.w]);
    band([[ox, y, onz], [ix, y, inz], [-ix, y, inz], [-ox, y, onz]], p => [p[0] / TRIM.tile, (onz - p[2]) / TRIM.w]);
    [-1, 1].forEach(sg => {
      // (wound to face up: reversed on the right)
      const q = [[sg * ox, y, oz], [sg * ox, y, onz], [sg * ix, y, inz], [sg * ix, y, iz]];
      band(sg > 0 ? q.reverse() : q, p => [p[2] / TRIM.tile, (sg * ox - p[0]) * sg / TRIM.w]);
    });
    const fy0 = wallTop - TRIM.w - 0.35, fy1 = wallTop - 0.35;
    band([[-sx, fy0, wz + 0.05], [sx, fy0, wz + 0.05], [sx, fy1, wz + 0.05], [-sx, fy1, wz + 0.05]], p => [p[0] / TRIM.tile, (fy1 - p[1]) / TRIM.w]);
    band([[sx, fy0, nz - 0.05], [-sx, fy0, nz - 0.05], [-sx, fy1, nz - 0.05], [sx, fy1, nz - 0.05]], p => [p[0] / TRIM.tile, (fy1 - p[1]) / TRIM.w]);
    [-1, 1].forEach(sg => {
      // (wound to face the table: reversed on the left)
      const x = sg * (sx - 0.05), q = [[x, fy0, wz], [x, fy0, nz], [x, fy1, nz], [x, fy1, wz]];
      band(sg > 0 ? q : q.reverse(), p => [p[2] / TRIM.tile, (fy1 - p[1]) / TRIM.w]);
    });
  }
  // The room: brushed gunmetal behind the table, far out of focus; a deep
  // oxblood carpet with a worn gold art-deco lattice (200 cm repeat), lit
  // in pools under the lamps and lost to the dark between them (fog).
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(1500, 700), new THREE.MeshBasicMaterial({ map: gunmetal, color: new THREE.Color(0.85, 0.85, 0.88) }));
  backdrop.position.set(120, 160, ROOM.backdropZ); scene.add(backdrop);
  scene.fog = new THREE.FogExp2(0x050506, ROOM.fog);
  const carpet = new THREE.MeshStandardMaterial({ map: carpetC, normalMap: carpetN, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.95, envMapIntensity: 0.1 });
  const floor = new THREE.Mesh(scaleUV(new THREE.PlaneGeometry(3000, 3000), 15, 15), carpet);
  floor.rotation.x = -Math.PI / 2; floor.position.y = ROOM.floor; floor.receiveShadow = true; scene.add(floor);
  // The lamp over the table: a long bronze pendant, its diffuser glowing
  // warm underneath, hung on two rods from the dark.
  {
    const lamp = new THREE.Group();
    const bronze = new THREE.MeshStandardMaterial({ color: 0x2a1c12, metalness: 0.85, roughness: 0.35 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(34, 7, 132), bronze);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(35, 1, 133), brass);
    lip.position.y = -3.4;
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(30, 128), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.9, 1.4), fog: false }));
    glow.rotation.x = Math.PI / 2; glow.position.y = -3.95;
    lamp.add(body, lip, glow);
    [-50, 50].forEach(z => { const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 200, 8), bronze); rod.position.set(0, 103, z); lamp.add(rod); });
    lamp.position.set(-8, ROOM.lamp, -25);
    scene.add(lamp);
  }
  // Other tables in the room, far off: pools of lamplight on the carpet and
  // the glow of their lamps, nothing more (the fog does the rest).
  {
    const pool = canvasTexture(128, radial([[0, 'rgba(255,214,160,0.55)'], [0.45, 'rgba(255,190,130,0.18)'], [1, 'rgba(255,190,130,0)']]));
    ROOM.far.forEach(([x, z, r]) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.MeshBasicMaterial({ map: pool, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true }));
      m.rotation.x = -Math.PI / 2; m.position.set(x, ROOM.floor + 0.3, z); scene.add(m);
      const shade = new THREE.Mesh(new THREE.BoxGeometry(r * 0.35, 4, r * 0.9), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.2, 0.8) }));
      shade.position.set(x, ROOM.lamp - 10, z); scene.add(shade);
    });
  }
  // (the set's materials and textures, for the table the landing flies to)
  // (the trim: the filigree band is the shot's trim; its rails' brass edge
  // is the rail's, and stays brass)
  dressTrim({ band: [gold] }, o.trim);
  scene.userData.set = { felt: felt.material, rubber, leatherWall, cushion, brass, gold, wood, carpet, WOOD_TILE, tex: { feltN, leatherN, cushionN, walnut, walnutN, goldC, goldA, goldN, badge } };

  // ---- Lights: a warm pendant over the table (the shadows), the light
  // behind the lens (it rides with the camera, so its gleam slides across
  // the dice as the camera moves), a faint fill.
  const pendant = new THREE.SpotLight(0xfff0e2, PENDANT, 0, 0.62, 0.75, 0);
  pendant.position.set(-8, ROOM.lamp - 6, -25);
  pendant.target.position.set(0, 0, -32);
  pendant.castShadow = true;
  pendant.shadow.mapSize.set(1024, 1024);
  pendant.shadow.camera.near = 80; pendant.shadow.camera.far = 290;
  pendant.shadow.bias = -0.0004; pendant.shadow.normalBias = 0.04; pendant.shadow.radius = 5;
  scene.add(pendant, pendant.target);
  const lensLight = new THREE.SpotLight(0xfff4e6, 1.2, 0, 0.32, 0.9, 0);
  scene.add(lensLight, lensLight.target);
  scene.add(new THREE.HemisphereLight(0x8a90a0, 0x0a0806, 0.3));
  // A warm rim hung high over the back of the table, facing the lens: it
  // comes through the dice and lights the resin from inside, and rakes the
  // nap of the felt and the relief of the gold.
  const rim = new THREE.SpotLight(0xffd9b0, RIM, 0, 0.55, 0.85, 0);
  rim.position.set(12, 78, -64);
  rim.target.position.set(0, 0, -30);
  scene.add(rim, rim.target);
  const edgeSpot = new THREE.SpotLight(0xfff0dc, 0, 0, 0.1, 0.5, 0);
  scene.add(edgeSpot, edgeSpot.target);
  const lights = { pendant, rim, lensLight, edgeSpot };

  // ---- The game, when it is not the dice: its pieces built into the room
  // now (every light it will use with them, so nothing is compiled
  // mid-shot), its plan worked out, and from here the shot asks it for the
  // camera, the sounds and each frame. (The lens follows the screen's
  // shape: a tall phone sees little from side to side, so the game frames
  // for this screen's aspect.)
  const aspect = (host.clientWidth || window.innerWidth) / (host.clientHeight || window.innerHeight);
  if (gameLoad) {
    const mod = await gameLoad;
    checkAbort();
    game = await mod.makeGame({
      THREE, scene, set: scene.userData.set, lights, tier, seed: o.seed, aspect, host, signal: o.signal,
      room: { floor: ROOM.floor, lamp: ROOM.lamp, backdropZ: ROOM.backdropZ, FLOAT, CEIL, PENDANT, ENV_LEVEL, RIM }, asset,
      helpers: { makeWarp, spline, smoother, easeOut, lerp, mix3, clamp01, canvasTexture, radial, finished, embossTex, scaleUV, boxUV }
    });
    checkAbort();
    plan = game.plan;
    W = plan.warp;
    undo.push(() => { if (game && game.dispose) game.dispose(); });
  }

  // ---- The cup, held to a backgammon cup from a saddlery: pebble-grain
  // calfskin over a rigid form, its top edge rolled and burnished under a
  // brass lip, a felt lining, and an enamelled badge set on the curve.
  //   Across the room: a dark tapered cylinder, its brass lip and bands.
  //   At arm's length: an even, fine grain with one soft sheen running up
  //   the side toward the lamp; the leather darker at the rim and the base,
  //   where hands have held it (burnished), a shade warmer between.
  //   Pinched in: each pebble of the grain round-topped and glossy, the
  //   creases between them dull; the badge's enamel under a hard clear
  //   gloss, its brass rim and letters standing up from it.
  //   Contact: it stands on the felt with a tight shadow at its foot; the
  //   dice rattle inside (the shake: see CUP_KEYS).
  //   Motion: the shake's wind-up, throw and settle are the cup's keys.
  // (Before, a coarse leather map at 5 cm a tile read as crinkled vinyl.)
  // (the cup, the dice, the stick and the vault are the dice game's: another
  // game has built its own pieces above)
  const cup = game ? null : new THREE.Group();
  if (cup) {
    const H = CUP.h, rt = CUP.rTop, rb = CUP.rBot;
    const outer = [];
    for (let k = 0; k <= 12; k++) { const y = -H / 2 + (H * k) / 12; outer.push(new THREE.Vector2(rb + (rt - rb) * (k / 12), y)); }
    // (the burnish: a map down the cup's height, dark at rim and base)
    const burnish = (() => {
      const c = document.createElement('canvas'); c.width = 4; c.height = 256;
      const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
      [[0, '#6f6f6f'], [0.1, '#d6d6d6'], [0.45, '#ffffff'], [0.82, '#dcdcdc'], [0.94, '#8a8a8a'], [1, '#5e5e5e']].forEach(([o, col]) => gr.addColorStop(o, col));
      g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false;
      return t;
    })();
    const leather = new THREE.MeshPhysicalMaterial({ color: 0x6c3a26, map: burnish, roughness: 0.62, sheen: 0.35, sheenRoughness: 0.45, sheenColor: new THREE.Color(0x7a4a34), envMapIntensity: 0.8 });
    // (the grain at 2.5 cm a tile: round the cup 25 cm, up it 10)
    finished(leather, 'pebble', 10, 4, 0.9);
    const shell = new THREE.Mesh(new THREE.LatheGeometry(outer, 56), leather);
    shell.castShadow = true; cup.add(shell);
    const inner = outer.map(v => new THREE.Vector2(v.x - 0.32, v.y)).reverse();
    // (the lining: a deep green baize, its nap soaking up the light)
    const lining = new THREE.MeshPhysicalMaterial({ color: 0x06120c, roughness: 1, sheen: 0.8, sheenRoughness: 0.6, sheenColor: new THREE.Color(0x1d3a2a), side: THREE.DoubleSide });
    cup.add(new THREE.Mesh(new THREE.LatheGeometry(inner, 56), lining));
    const lip = new THREE.Mesh(new THREE.TorusGeometry(rt - 0.16, 0.2, 12, 64), brass);
    lip.rotation.x = Math.PI / 2; lip.position.y = H / 2; cup.add(lip);
    const band = (y0, y1) => {
      const r0 = rb + (rt - rb) * ((y0 + H / 2) / H) + 0.07, r1 = rb + (rt - rb) * ((y1 + H / 2) / H) + 0.07;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, y1 - y0, 56, 1, true), brass);
      m.position.y = (y0 + y1) / 2; cup.add(m);
    };
    band(-H / 2 + 0.25, -H / 2 + 1.05); band(H / 2 - 1.25, H / 2 - 0.45);
    const base = new THREE.Mesh(new THREE.CircleGeometry(rb, 48), leather);
    base.rotation.x = Math.PI / 2; base.position.y = -H / 2; cup.add(base);
    const floorIn = new THREE.Mesh(new THREE.CircleGeometry(rb - 0.3, 48), lining);
    floorIn.rotation.x = -Math.PI / 2; floorIn.position.y = -H / 2 + 0.5; cup.add(floorIn);
    // The DRO badge: a brass-and-enamel plate on the curve of the leather,
    // turned to face the lens through the shake.
    const bh = 2.5, by = 0.4, th = 1.0;
    const rAt = y => rb + (rt - rb) * ((y + H / 2) / H) + 0.09;
    // (enamel and brass: the letters and rim raised out of the badge's own
    // artwork, the whole under a hard clear gloss as fired enamel is)
    const badgeMat = new THREE.MeshPhysicalMaterial({ map: badge, transparent: true, alphaTest: 0.4, metalness: 0.55, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06 });
    if (badge.image && badge.image.width) {
      const c = document.createElement('canvas'); c.width = badge.image.width; c.height = badge.image.height;
      const g = c.getContext('2d'); g.drawImage(badge.image, 0, 0);
      badgeMat.normalMap = embossTex(c, 2.6); badgeMat.normalMap.flipY = badge.flipY;
      badgeMat.normalScale = new THREE.Vector2(0.9, 0.9);
    }
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(rAt(by + bh / 2), rAt(by - bh / 2), bh, 24, 1, true, -30 * DEG - th / 2, th), badgeMat);
    plate.position.y = by; cup.add(plate);
    scene.add(cup);
  }

  // ---- The dice.
  const dieGeo = game ? null : dieGeometry(), pipGeo = game ? null : pipGeometry();
  // (both sides: the pips of the far faces show through the resin)
  const pipMat = game ? null : new THREE.MeshStandardMaterial({ color: 0xdcd8ce, roughness: 0.42, vertexColors: true, side: THREE.DoubleSide });
  const dice = game ? [] : [0, 1].map(() => {
    const mat = new THREE.MeshPhysicalMaterial({
      // deep red resin: dark through the middle, bright red where it is
      // thin (the rounded edges), glass-hard highlights on the clear coat
      // (a little roughness on both coats: a face that catches a light
      // square on glints rather than flashes white)
      color: 0xc01424, roughness: 0.16, metalness: 0, transmission: 0.9, thickness: 1.6, ior: 1.5,
      attenuationColor: new THREE.Color(0x8a0616), attenuationDistance: 0.75,
      clearcoat: 0.7, clearcoatRoughness: 0.16, specularIntensity: 0.6, envMapIntensity: 2.3,
      emissive: new THREE.Color(0xff3212), emissiveIntensity: 0
    });
    const g = new THREE.Group();
    const body = new THREE.Mesh(dieGeo, mat); body.castShadow = true;
    const pips = new THREE.Mesh(pipGeo, pipMat);
    g.add(body, pips);
    scene.add(g);
    // (the Vault Pull's dice glow from inside. The light hangs in the room,
    // not in the die: a light under a hidden group isn't counted, so the
    // dice coming out of the cup would change how many lights there are,
    // and every material in the shot would be compiled again that frame -
    // the hitch as the cup throws. Other tiers have no glow, and no light.)
    const glow = plan.vault ? new THREE.PointLight(0xff3a18, 0, 14, 2) : null;
    if (glow) scene.add(glow);
    return { g, mat, glow };
  });

  // ---- The stick (standard, hardways), held to a stickman's stick from a
  // craps-table maker: a walnut shaft, turned, tapering to the hook; the
  // hook bent rattan, steamed round a form into its J and lacquered; a
  // turned brass ferrule where the two are joined.
  //   Across the room: a long dark line with a pale hook at its end.
  //   At arm's length: the shaft's lacquer carries one long highlight down
  //   its length; the rattan is honey-coloured, a shade darker down the
  //   side that lay against the form as it was steamed; the ferrule turned
  //   with two fine grooves, catching the lamp in rings.
  //   Pinched in: the walnut's open pores and the rattan's fibres, both
  //   running along the stick under their lacquer.
  //   Contact: the hook's bend pushes the dice, and its shadow and theirs
  //   meet on the felt.
  //   Motion: the hook's path (makeHookPath) - a reach, a draw, the dice
  //   carried and let go - is the stick's.
  // (Before, the hook was the shaft's walnut on a thin tube and read as a
  // bent metal rod.)
  let stick = null;
  if (!game && plan.stick) {
    const hp = plan.stick.hp;
    const g = new THREE.Group();
    const curve = new THREE.CatmullRomCurve3(hp.curve.map(([a, b]) => new THREE.Vector3(a, 0, b)));
    // (UVs in cm, the grain along the wood: a tube's u already runs along it)
    const hookGeo = new THREE.TubeGeometry(curve, 120, HOOK.cap, 10, false);
    scaleUV(hookGeo, curve.getLength() / WOOD_TILE[0], (2 * Math.PI * HOOK.cap) / WOOD_TILE[1]);
    // (rattan: its fibres are the pores' streaks at half the size)
    const rattan = new THREE.MeshPhysicalMaterial({ color: 0x8c6438, roughness: 0.5, clearcoat: 0.7, clearcoatRoughness: 0.18, envMapIntensity: 0.8 });
    finished(rattan, 'pores', WOOD_TILE[0], WOOD_TILE[1] / 1.5, 0.45);
    // (browned by the steam where it lay against the form: a darker streak
    // down one side of the cane, v = 0.5 round it)
    // (and the cane's fibres: fine streaks along it, lighter and darker, a
    // node now and then where a leaf grew - 6 cm of cane a tile)
    rattan.map = (() => {
      const c = document.createElement('canvas'); c.width = 256; c.height = 64;
      const x = c.getContext('2d'), gr = x.createLinearGradient(0, 0, 0, 64);
      [[0, '#ffffff'], [0.35, '#f2eadc'], [0.5, '#b89a78'], [0.65, '#f2eadc'], [1, '#ffffff']].forEach(([o, col]) => gr.addColorStop(o, col));
      x.fillStyle = gr; x.fillRect(0, 0, 256, 64);
      let sd = 71; const r = () => { sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0; return sd / 4294967296; };
      for (let k = 0; k < 90; k++) { const y = r() * 64; x.fillStyle = r() < 0.5 ? `rgba(90,58,26,${(0.08 + r() * 0.14).toFixed(2)})` : `rgba(255,236,200,${(0.08 + r() * 0.12).toFixed(2)})`; x.fillRect(0, y, 256, 0.6 + r() * 1.2); }
      x.fillStyle = 'rgba(80,50,22,0.35)'; x.fillRect(178, 0, 3, 64); x.fillStyle = 'rgba(255,240,210,0.25)'; x.fillRect(181, 0, 2, 64);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
      t.repeat.set(WOOD_TILE[0] / 6, WOOD_TILE[1] / (2 * Math.PI * HOOK.cap));
      return t;
    })();
    const hook = new THREE.Mesh(hookGeo, rattan);
    hook.castShadow = true; g.add(hook);
    // The shaft and its ferrule hang from a pivot at the hook, laid along
    // the pull (+z) and tipped up per frame (see shaftLean).
    const len = SHAFT.len;
    const pivot = new THREE.Group();
    pivot.position.set(...HOOK_ATTACH);
    // (a cylinder's u runs round it: swapped, so the grain runs along)
    const shaftGeo = new THREE.CylinderGeometry(0.42, 0.48, len, 14);
    { const uv = shaftGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getY(i) * len) / WOOD_TILE[0], (uv.getX(i) * 2.8) / WOOD_TILE[1]); }
    // (the shaft's walnut with its pores open under the lacquer, as the
    // table's is: 2 cm a tile)
    const shaftWood = wood.clone(); shaftWood.normalMap = null; shaftWood.roughnessMap = null;
    finished(shaftWood, 'pores', WOOD_TILE[0] / 2, WOOD_TILE[1] / 2, 0.5);
    const shaft = new THREE.Mesh(shaftGeo, shaftWood);
    shaft.rotation.x = Math.PI / 2; shaft.position.z = len / 2;
    shaft.castShadow = true; pivot.add(shaft);
    // (turned brass: a lathe profile with a bead at each end and two fine
    // grooves, so the lamp lies on it in rings)
    const fp = [[0, -0.9], [0.46, -0.9], [0.53, -0.82], [0.53, -0.66], [0.5, -0.6], [0.5, -0.3], [0.46, -0.26], [0.5, -0.22], [0.5, 0.18], [0.46, 0.22], [0.5, 0.26], [0.5, 0.6], [0.53, 0.66], [0.53, 0.82], [0.46, 0.9], [0, 0.9]].map(([r, y]) => new THREE.Vector2(r, y));
    const ferrule = new THREE.Mesh(new THREE.LatheGeometry(fp, 32), new THREE.MeshStandardMaterial({ color: 0xc19a52, metalness: 1, roughness: 0.24, envMapIntensity: 1.1 }));
    ferrule.rotation.x = Math.PI / 2; ferrule.position.z = 1.2;
    pivot.add(ferrule);
    g.add(pivot);
    scene.add(g);
    stick = { g, hp, pivot };
  }

  // ---- The Vault Pull's pieces.
  let vault = null;
  if (!game && plan.vault) {
    await Promise.all(rareLoads);
    checkAbort();
    const faceMat = t => new THREE.MeshPhysicalMaterial({ map: t || null, color: t ? 0xcfc9bc : 0xcfc6b4, roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.12, envMapIntensity: 0.6 });
    const edge25 = new THREE.MeshPhysicalMaterial({ color: 0xb8ad94, roughness: 0.3, clearcoat: 0.7, envMapIntensity: 0.6 });
    const edge100 = new THREE.MeshPhysicalMaterial({ color: 0x15151a, roughness: 0.25, clearcoat: 1 });
    // Print on both faces reads along the plaque's length, the right way
    // round from outside (x along the text, -z up it; mirrored underneath).
    const geo = roundedBox([4, 0.3, 2.5], 0.22, 6, 3, {
      group: fi => (fi === 2 ? 1 : fi === 3 ? 2 : 0),
      uv: (fi, Q) => [0.5 + (fi === 3 ? -1 : 1) * Q[0] / 8, 0.5 - Q[2] / 5]
    });
    const m25 = [edge25, faceMat(rare.p25), faceMat(rare.p25)], m100 = [edge100, faceMat(rare.p100), faceMat(rare.p100)];
    const plaques = plan.vault.kinds.map(k => { const m = new THREE.Mesh(geo, k === '100k' ? m100 : m25); m.castShadow = true; m.visible = false; scene.add(m); return m; });
    const scorchTex = canvasTexture(256, (g, n) => {
      const gr = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
      gr.addColorStop(0, 'rgba(8,5,3,0.95)'); gr.addColorStop(0.45, 'rgba(20,10,5,0.8)'); gr.addColorStop(0.75, 'rgba(40,22,10,0.35)'); gr.addColorStop(1, 'rgba(40,22,10,0)');
      g.fillStyle = gr; g.fillRect(0, 0, n, n);
      for (let k = 0; k < 900; k++) { const a = Math.random() * 6.28, r = Math.pow(Math.random(), 0.6) * n * 0.46; g.fillStyle = `rgba(0,0,0,${0.08 + Math.random() * 0.2})`; g.fillRect(n / 2 + Math.cos(a) * r, n / 2 + Math.sin(a) * r, 2 + Math.random() * 4, 2 + Math.random() * 4); }
    });
    const emberTex = canvasTexture(128, radial([[0, 'rgba(255,220,140,1)'], [0.3, 'rgba(255,120,30,0.7)'], [0.7, 'rgba(200,40,10,0.25)'], [1, 'rgba(200,40,10,0)']]));
    const scorch = plan.rest.map(r => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshStandardMaterial({ map: scorchTex, transparent: true, depthWrite: false, opacity: 0, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }));
      m.rotation.x = -Math.PI / 2; m.rotation.z = Math.random() * 6.28; m.position.set(r.p[0], 0.02, r.p[2]); scene.add(m);
      const e = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 4.5), new THREE.MeshBasicMaterial({ map: emberTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
      e.rotation.x = -Math.PI / 2; e.position.set(r.p[0], 0.05, r.p[2]); scene.add(e);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 64), new THREE.MeshBasicMaterial({ color: 0xffe2b0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(r.p[0], 0.1, r.p[2]); scene.add(ring);
      return { m, e, ring };
    });
    const flash = new THREE.PointLight(0xffd9a8, 0, 0, 0);
    const c = [(plan.rest[0].p[0] + plan.rest[1].p[0]) / 2, 4, (plan.rest[0].p[2] + plan.rest[1].p[2]) / 2];
    flash.position.set(...c); scene.add(flash);
    vault = { plaques, scorch, flash };
  }

  // ---- Particles: dust in the light, felt dust at the landings, and the
  // burst's sparks and embers. One additive point cloud, rewritten per frame.
  const spriteTex = canvasTexture(64, radial([[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,245,230,0.6)'], [1, 'rgba(255,240,220,0)']]));
  // (the dust is the room's; the puffs and the sparks are the dice's)
  const DUST = 190, PUFF = 16, SPARK = !game && plan.vault ? 180 : 0;
  const puffs = game ? [] : plan.run.events.filter(e => e.kind === 'felt' && e.speed > 70).slice(0, 10);
  const NP = DUST + puffs.length * PUFF + SPARK;
  const pPos = new Float32Array(NP * 3), pCol = new Float32Array(NP * 3);
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const points = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.16, map: spriteTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
  points.frustumCulled = false;
  scene.add(points);
  const dustSeed = P.rng(77);
  const dust = Array.from({ length: DUST }, () => ({
    p: [-38 + 76 * dustSeed(), 1 + 44 * dustSeed(), -70 + 120 * dustSeed()], v: [-0.8 + 1.6 * dustSeed(), -0.6 + 0.5 * dustSeed(), -0.8 + 1.6 * dustSeed()], a: 0.3 + 0.7 * dustSeed(), ph: 6.28 * dustSeed()
  }));

  // ---- Camera: spherical keys (azimuth from the thrower's end, elevation,
  // distance, lift of the aim) around an aim point that hands off from the
  // cup to the dice, to the wall strike, and back to the dice.
  const camera = new THREE.PerspectiveCamera(36, 1, 0.5, 3000);
  // (the shot's turns, in real seconds: the dice's release, wall strike and
  // rest; another game names its own - plan.wallReal is its slow moment)
  const Rrel = game ? 0 : W.real(P.RELEASE.t), Rwall = plan.wallReal, Rrest = plan.restReal;
  const R2 = w => W.real(w);
  const floatEnd = plan.totalReal + FLOAT;
  const CAM_DT = 1 / 120, camN = Math.ceil((floatEnd + 2) / CAM_DT) + 2;
  const camEye = new Float32Array(camN * 3), camAim = new Float32Array(camN * 3);
  // (another game lays its own path - its moves, its float up under the
  // ceiling - into the same arrays: see cameraAt)
  if (game) game.camera({ eye: camEye, aim: camAim, dt: CAM_DT, n: camN, floatEnd });
  else {
  const endPos = plan.rest;
  // Framing the dice at rest: the camera turns (up to 18 degrees either
  // way) so the gap between them runs up the screen rather than across it
  // - a phone is tall and narrow - and stands back only as far as that
  // needs, for this screen's shape.
  const tanV = Math.tan(((aspect < 0.62 ? 42 : 34) * DEG) / 2), tanH = tanV * aspect;
  const gap = [endPos[1].p[0] - endPos[0].p[0], endPos[1].p[2] - endPos[0].p[2]];
  const needFor = az => {
    const a = az * DEG, el = 50 * DEG;
    const lat = Math.abs(gap[0] * Math.cos(a) - gap[1] * Math.sin(a));
    const dep = Math.abs(gap[0] * Math.sin(a) + gap[1] * Math.cos(a));
    return Math.max((lat / 2 + 4.5) / tanH, (dep * Math.sin(el) / 2 + 5) / tanV);
  };
  let dAz = 0;
  for (let d = -18; d <= 18; d += 1.5) if (needFor(-32 + d) < needFor(-32 + dAz) - 0.5) dAz = d;
  const D = Math.min(115, Math.max(34, needFor(-32 + dAz)));
  const keys = [
    [0, -34, 12, 38, 1.5],
    [1.2, -30, 13, 34, 1.5],
    [Rrel + 0.12, -24, 17, 36, 1],
    // (the push toward the wall strike goes 4/5 of the way it once did:
    // 36 cm to 31 and 27 then, to 32 and 28.8 now)
    [Rwall - 0.08, -22, 14, 36 - 0.8 * 5, 0],
    [W.slowHold[1], -58, 10, 36 - 0.8 * 9, 0]
  ];
  // (keys must run forward in time; a quick settle can come before the
  // slow motion has fully eased off, so each is kept after the last)
  const pushKey = k => { const prev = keys[keys.length - 1]; k[0] = Math.max(k[0], prev[0] + 0.3); keys.push(k); };
  pushKey([Math.min(W.slowEnd, Rrest - 0.2), -44, 26, 30, 1]);
  const turnFrom = keys.length;
  pushKey([Rrest + 0.25, -30, 48, D, D * 0.14]);
  if (plan.stick) {
    const T = plan.stick.hp.T;
    pushKey([R2(T.approach[0]), -32, 52, D * 0.96, D * 0.12]);
    pushKey([R2(T.pull[0]), -35, 56, D * 1.08, D * 0.16]);
    pushKey([R2(T.pull[1]), -38, 62, D * 1.26, D * 0.24]);
    // (backing out and tilting up as the landing's copy comes in)
    pushKey([R2(plan.endW) + 2, -40, 58, D * 1.5, D * 0.46]);
  } else if (plan.vault) {
    const Bm = R2(plan.vault.boom);
    pushKey([Bm - 0.3, -32, 40, D * 0.9, D * 0.1]);
    pushKey([Bm + 0.35, -33, 38, D * 0.95, D * 0.12]);
    pushKey([Bm + 1.5, -34, 42, D * 1.15, D * 0.14]);
    pushKey([Bm + 3.4, -34, 16, D * 1.4, 24]);
    pushKey([R2(plan.endW) + 2, -34, 13, D * 1.5, 28]);
  } else {
    const Fd = R2(plan.edge.done);
    pushKey([Fd, -32, 40, D * 0.8, D * 0.08]);
    pushKey([Fd + 0.7, -38, 20, 20, 2.2]);
    pushKey([R2(plan.endW) + 2, -54, 16, 17, 2.6]);
  }
  // The float: past the shot the camera drifts on, backing out and rising
  // slowly, until someone taps (the landing decides what that does) or it
  // settles under the ceiling.
  {
    const L = keys[keys.length - 1];
    // (the float rises and backs away - the apex the fly-in swoops down from)
    const F = plan.stick ? { el: 4, g: [1.32, 1.7, 2.0], h: [0.2, 0.46, 0.66] }
      : plan.vault ? { el: 10, g: [1.1, 1.25, 1.35], h: [0.08, 0.2, 0.3] }
      : { el: 14, g: [1.6, 2.6, 3.4], h: [0.3, 0.8, 1.2] };
    [6, 16, FLOAT - 2].forEach((dt, i) => keys.push([L[0] + dt, L[1] - [2, 4, 5][i], L[2] + F.el * [0.3, 0.7, 1][i], L[3] * F.g[i], L[4] + L[3] * F.h[i]]));
  }
  for (let k = turnFrom; k < keys.length; k++) keys[k][1] += dAz;
  const centroid = w => { const a = dicePose(plan, 0, w).p, b = dicePose(plan, 1, w).p; return mix3(a, b, 0.5); };
  const cupAim = t => { const c = cupAt(t); return [c.p[0], c.p[1] + 1, c.p[2]]; };
  // (once the draw is under way the camera stops following the dice: the
  // stick carries them on to the side as the camera backs away)
  const stickAnchor = plan.stick ? centroid(plan.stick.hp.T.pull[1]) : null;
  const aimRaw = t => {
    const w = W.world(t);
    let aim;
    if (t < 1.25) aim = cupAim(t);
    else if (t < Rrel + 0.25) aim = mix3(cupAim(Math.min(t, Rrel)), centroid(Math.max(w, P.RELEASE.t - 0.05) + 0.04), smoother((t - 1.25) / (Rrel + 0.25 - 1.25)));
    else aim = centroid(w);
    const kI = smoother((t - (Rwall - 0.25)) / 0.3) * (1 - smoother((t - W.slowHold[1]) / 0.8));
    aim = mix3(aim, plan.impact, kI * 0.3);
    if (plan.edge && w > plan.edge.tf) aim = mix3(aim, dicePose(plan, plan.edge.die, w).p, smoother((w - plan.edge.tf) / 0.6));
    if (plan.vault && w > plan.vault.boom + 1.5) aim = mix3(aim, [aim[0], aim[1], aim[2] - 90], smoother((w - plan.vault.boom - 1.5) / 2.0));
    if (stickAnchor) { const T = plan.stick.hp.T; aim = mix3(aim, stickAnchor, smoother((w - T.pull[0]) / (T.pull[1] - T.pull[0] + 1.2))); }
    return aim;
  };
  {
    let aim = null;
    for (let k = 0; k < camN; k++) {
      const t = k * CAM_DT;
      const raw = aimRaw(t);
      aim = aim ? mix3(aim, raw, 1 - Math.exp(-CAM_DT / 0.11)) : raw;
      const [az, el, dist, lift] = spline(keys, t);
      const A = [aim[0], aim[1] + lift, aim[2]];
      const e = [A[0] + dist * Math.sin(az * DEG) * Math.cos(el * DEG), A[1] + dist * Math.sin(el * DEG), A[2] + dist * Math.cos(az * DEG) * Math.cos(el * DEG)];
      // Never let a die tumble into the lens: the eye backs off along the
      // view to keep every die at least 22 cm away.
      const wv = W.world(t);
      if (wv > P.RELEASE.t) {
        const back = [e[0] - A[0], e[1] - A[1], e[2] - A[2]], bl = Math.hypot(...back) || 1;
        // (and every plaque of the Vault Pull, once it is in the air)
        const near = [0, 1].map(i => [dicePose(plan, i, wv).p, 22]);
        if (plan.vault && wv > plan.vault.boom) plan.vault.kinds.forEach((_, i) => near.push([P.poseAt(plan.vault.run, i, wv).p, 30]));
        for (const [d, keep] of near) {
          for (let it = 0; it < 4; it++) {
            const gap = Math.hypot(e[0] - d[0], e[1] - d[1], e[2] - d[2]);
            if (gap >= keep) break;
            const push = keep - gap + 0.5;
            e[0] += (back[0] / bl) * push; e[1] += (back[1] / bl) * push; e[2] += (back[2] / bl) * push;
          }
        }
      }
      camEye.set(e, k * 3); camAim.set(A, k * 3);
    }
    // Through the strike and the landing, keep the dice in the frame: a
    // tall phone sees little from side to side, and the dice can part
    // widely off the wall. Where either would leave it, the eye backs off
    // along the view just far enough, up to PULL cm; if that is still not
    // enough for both, the aim leans toward the die nearer the lens, so one
    // is always held. Both are eased (held ahead a little, then smoothed),
    // so the camera moves before a die reaches the edge, never after.
    const PULL = 55, M = 0.8, R = 1.6;
    const inWin = k => { const t = k * CAM_DT; return t > Rwall - 0.15 && t < Rrest + 0.3; };
    const basis = k => {
      const e = camEye.subarray(k * 3, k * 3 + 3), A = camAim.subarray(k * 3, k * 3 + 3);
      const f = [A[0] - e[0], A[1] - e[1], A[2] - e[2]], fl = Math.hypot(...f);
      f[0] /= fl; f[1] /= fl; f[2] /= fl;
      const rl = Math.hypot(f[2], f[0]) || 1, r = [-f[2] / rl, 0, f[0] / rl];
      const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
      return { e, A, f, r, u };
    };
    const needAt = (k, only) => {
      const { e, f, r, u } = basis(k), wv = W.world(k * CAM_DT);
      let s = 0;
      for (let i = 0; i < 2; i++) {
        if (only != null && i !== only) continue;
        const p = dicePose(plan, i, wv).p, d = [p[0] - e[0], p[1] - e[1], p[2] - e[2]];
        const z = d[0] * f[0] + d[1] * f[1] + d[2] * f[2];
        const x = Math.abs(d[0] * r[0] + d[1] * r[1] + d[2] * r[2]) + R, y = Math.abs(d[0] * u[0] + d[1] * u[1] + d[2] * u[2]) + R;
        s = Math.max(s, x / (M * tanH) - z, y / (M * tanV) - z);
      }
      return s;
    };
    // (never reaching back into the cup's shot: it fades in over the last
    // 0.3 s before the strike window opens)
    const fence = k => smoother((k * CAM_DT - (Rwall - 0.5)) / 0.3);
    const ease = arr => {
      const hold = Math.round(0.3 / CAM_DT), soft = Math.round(0.18 / CAM_DT);
      const held = arr.map((_, k) => { let m = 0; for (let j = Math.max(0, k - hold); j <= Math.min(camN - 1, k + hold); j++) m = Math.max(m, arr[j]); return m; });
      return held.map((_, k) => { let a = 0, n = 0; for (let j = -2 * soft; j <= 2 * soft; j++) { const i = k + j; if (i < 0 || i >= camN) continue; const g = Math.exp(-(j * j) / (2 * soft * soft)); a += held[i] * g; n += g; } return (a / n) * fence(k); });
    };
    // 0. the whole close-up on the dice, from the throw to the landing,
    // stands a quarter further back (same move, same view, smaller dice),
    // and the pull below may back the lens off up to PULL cm more: the aim
    // stays between the two dice and both stay in the frame, rather than
    // the lens chasing one of them
    for (let k = 0; k < camN; k++) {
      const { e, A } = basis(k), tt = k * CAM_DT;
      const zf = 1 + 0.25 * smoother((tt - Rrel) / Math.max(0.1, Rwall - Rrel)) * (1 - smoother((tt - (Rrest + 0.3)) / 0.8));
      if (zf > 1.0001) for (let j = 0; j < 3; j++) e[j] = A[j] + (e[j] - A[j]) * zf;
    }
    // 1. the lean, where pulling back PULL cm would not be enough. It
    // follows one die for the whole strike (the one nearer the lens over
    // it), never swapping between them mid-shot.
    let hero = 0;
    {
      let dd = [0, 0];
      for (let k = 0; k < camN; k++) if (inWin(k)) {
        const e = camEye.subarray(k * 3, k * 3 + 3), wv = W.world(k * CAM_DT);
        for (let i = 0; i < 2; i++) { const p = dicePose(plan, i, wv).p; dd[i] += Math.hypot(p[0] - e[0], p[1] - e[1], p[2] - e[2]); }
      }
      hero = dd[0] <= dd[1] ? 0 : 1;
    }
    const lean = ease(new Float32Array(camN).map((_, k) => (inWin(k) ? Math.min(0.85, Math.max(0, needAt(k) - PULL) / 14) : 0)));
    for (let k = 0; k < camN; k++) {
      if (lean[k] < 0.005) continue;
      const { e, A } = basis(k), near = dicePose(plan, hero, W.world(k * CAM_DT)).p;
      // (the eye moves with the aim, so the view keeps its angle)
      for (let j = 0; j < 3; j++) { const dA = (near[j] - A[j]) * lean[k] * (j === 1 ? 0.5 : 1); A[j] += dA; e[j] += dA; }
    }
    // 2. the pull back: enough for both dice, or, as far as the lean has
    // gone, for the one it follows
    const pull = ease(new Float32Array(camN).map((_, k) => {
      if (!inWin(k)) return 0;
      const l = Math.min(1, lean[k] / 0.85);
      return Math.min(PULL, Math.max(0, (1 - l) * needAt(k) + l * needAt(k, hero)));
    }));
    for (let k = 0; k < camN; k++) {
      const { e, A } = basis(k);
      if (pull[k] > 0.01) {
        const bk = [e[0] - A[0], e[1] - A[1], e[2] - A[2]], bl = Math.hypot(...bk) || 1;
        for (let j = 0; j < 3; j++) e[j] += (bk[j] / bl) * pull[k];
      }
      e[1] = Math.max(e[1], 2.5);
      // 4. the ceiling: the float rises into it and rests there
      if (e[1] > CEIL - 20) e[1] = CEIL - 20 * Math.exp(-(e[1] - (CEIL - 20)) / 20);
    }
  }
  }

  // ---- Timeline of sounds (real seconds).
  const sfx = [];
  if (game) sfx.push(...game.sfx);
  else {
  for (let t = 0.3; t < 1.0; t += 1 / 9.2) sfx.push({ t, kind: 'rattle' }, { t: t + 0.03, kind: 'rattle' });
  sfx.push({ t: Rrel - 0.05, kind: 'whoosh' });
  const pushEvents = run => run.events.forEach(e => {
    const kind = plan.vault && run === plan.vault.run ? 'plaque' : e.kind === 'rail' ? 'wall' : e.kind;
    sfx.push({ t: W.real(e.t), kind, speed: e.speed, rate: W.rateAt(W.real(e.t)) });
  });
  pushEvents(plan.run);
  if (plan.stick) {
    pushEvents(plan.stick.run);
    const T = plan.stick.hp.T;
    sfx.push({ t: R2(T.set[1]), kind: 'stick', speed: 120 }, { t: R2(T.pull[0]), kind: 'scrape', dur: T.pull[1] - T.pull[0] });
  }
  if (tier === 'hardways') sfx.push({ t: R2(plan.callW) + 0.1, kind: 'chime' });
  if (plan.vault) {
    plan.vault.shakes.forEach(([s, len], k) => sfx.push({ t: R2(plan.restW + s), kind: 'hum', f: 55 * (1 + k * 0.25), level: k / 2, dur: len + 0.3 }));
    sfx.push({ t: R2(plan.vault.boom), kind: 'boom' });
    pushEvents(plan.vault.run);
  }
  if (plan.edge) sfx.push({ t: R2(plan.silence[1]), kind: 'drop' });
  }
  sfx.sort((a, b) => a.t - b.t);
  // (the room's sound cut dead, real seconds - the Defiant Edge's silence,
  // or a game's own - and whether the bed plays at all before it)
  const silenceAt = game ? (game.silence || null) : plan.edge ? R2(plan.silence[0]) : null;

  // ---- Sound.
  let sound = null;
  try { sound = o.sound ? new Sound() : null; } catch (e) { sound = null; }
  // (read when undone: the speaker can make one later)
  undo.push(() => { if (sound && sound.ctx) sound.ctx.close().catch(() => {}); });
  if (sound && sound.ctx) {
    if (rare.clackBytes) sound.ctx.decodeAudioData(rare.clackBytes.slice(0)).then(b => { sound.clack = b; }).catch(() => {});
    try { sound.ctx.resume(); } catch (e) { /* needs a tap */ }
  }

  // ---- Overlays: the call, the tier's name.
  const call = document.createElement('div');
  // (a game may call its hardways in the house gold, as its other lines are,
  // rather than the dice's platinum)
  const goldCall = tier === 'hardways' && !!(game && game.goldCall);
  call.className = `r3-call r3-call-${goldCall ? 'gold' : tier}`;
  if (tier === 'hardways' && !game) {
    const img = new Image();
    img.alt = plan.call[0];
    img.onerror = () => { call.textContent = plan.call[0]; call.classList.add('r3-call-text'); };
    img.src = asset(plan.values[0] === 1 ? 'rare/hardways-snake-eyes.png' : 'rare/hardways-boxcars.png');
    call.appendChild(img);
  } else if (plan.call) {
    // (a game's hardways call is lettered, not pictured: the platinum text)
    if (tier === 'hardways' && !goldCall) call.classList.add('r3-call-text');
    call.innerHTML = `<span></span>${plan.call[1] ? '<small></small>' : ''}`;
    call.firstChild.textContent = plan.call[0];
    if (plan.call[1]) call.lastChild.textContent = plan.call[1];
  }
  // (a game whose call can land over pale pieces - blackjack's white
  // machine, its cards - asks for a soft shade of the room behind it)
  const scrimEl = document.createElement('div');
  scrimEl.className = 'r3-call-scrim';
  if (!(game && game.callScrim && plan.call)) scrimEl.hidden = true;
  const badgeEl = document.createElement('div');
  badgeEl.className = `r3-tier r3-tier-${goldCall ? 'gold' : tier}`;
  const tierNames = game && game.tierNames ? game.tierNames : TIER_NAMES;
  // (where the call already names the tier - a game whose line is the
  // tier, The Jackpot called "The Jackpot" - the caption gives the odds
  // alone rather than say it twice)
  const named = !!(plan.call && plan.call[0] && String(plan.call[0]).toLowerCase() === String(tierNames[tier]).toLowerCase());
  if (named) badgeEl.classList.add('r3-tier-odds');
  badgeEl.innerHTML = tier === 'standard' ? '' : named ? `<small>Odds · ${TIER_ODDS[tier]}</small>` : `<span>${tierNames[tier]}</span><small>Odds · ${TIER_ODDS[tier]}</small>`;
  const flashEl = document.createElement('div');
  flashEl.className = 'r3-flash';
  host.append(canvas, flashEl, scrimEl, call, badgeEl);
  undo.push(() => [flashEl, scrimEl, call, badgeEl].forEach(el => el.remove()));

  // ---- Post: bloom on the brightest glints.
  let composer = null, bloom = null;
  // ---- Resolution. A moving frame is drawn at `pixelRatio`: the screen's,
  // to 2x, and lower while the device is slow (the quality steps below). A
  // frame that stays up - the shot at rest, the table between its moves -
  // is drawn again at the screen's own resolution, to 3x; and while the
  // page is pinched in, only the part in view is drawn, at the zoom's
  // resolution, so the table stays as sharp as the cards' print on it.
  // `redraw` is set while the frame on screen stays (it draws that frame
  // again); `crop` is the part of the screen in view, when the canvas
  // covers only that.
  let redraw = null, crop = null, refit = false, zoomT = 0;
  let screenW = 0, screenH = 0, sized = '';
  // (a still's buffers are held to about a phone's own pixels at 3x. With
  // the bloom pass on its buffers are doubled, so a still is drawn into
  // them without multisampling - see postStill() - at the screen's own
  // resolution, where the edges are as fine as the print; a moving frame
  // has them multisampled at its own, lower resolution.)
  const STILL_PX = 4.2e6;
  const stillRatio = (w, h, cw, ch, zoom) => {
    const want = Math.min(window.devicePixelRatio || 1, 3) * zoom;
    return Math.max(pixelRatio, Math.min(want, Math.sqrt(STILL_PX / (cw * ch))));
  };
  // The post's buffers multisampled (a moving frame) or not (a still, at
  // its higher resolution): set before a frame is drawn, and made again
  // by the renderer the next time it draws into them.
  let stillPost = false;
  const postStill = on => {
    if (!composer || on === stillPost) return;
    stillPost = on;
    [composer.renderTarget1, composer.renderTarget2].forEach(t => { if (t) { t.samples = on ? 0 : 4; t.dispose(); } });
  };
  // The part of the screen in view while the page is pinched in (the
  // visual viewport, in the canvas box's own pixels) - with a margin, that
  // and a share of its size more on every side, inside the screen - or
  // null.
  const inView = (box, w, h, margin = 0) => {
    const vv = window.visualViewport;
    if (!vv || !(vv.scale > 1.05)) return null;
    const b = box.getBoundingClientRect();
    const mx = vv.width * margin, my = vv.height * margin;
    let x0 = Math.max(0, vv.offsetLeft - b.left - mx), y0 = Math.max(0, vv.offsetTop - b.top - my);
    let x1 = Math.min(w, vv.offsetLeft - b.left + vv.width + mx), y1 = Math.min(h, vv.offsetTop - b.top + vv.height + my);
    if (margin) { x0 = Math.floor(x0); y0 = Math.floor(y0); x1 = Math.ceil(x1); y1 = Math.ceil(y1); }
    return x1 - x0 >= 1 && y1 - y0 >= 1 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0, fw: w, fh: h, zoom: vv.scale } : null;
  };
  // A crop still good for the view: all of what is in view inside it, at a
  // zoom within a sixth of its own.
  const MARGIN = 0.25;
  const serves = (c, v) => !!c && !!v && v.x >= c.x - 0.5 && v.y >= c.y - 0.5 && v.x + v.w <= c.x + c.w + 0.5 && v.y + v.h <= c.y + c.h + 0.5 && Math.abs(Math.log(v.zoom / c.zoom)) < 0.16;
  // Sizes the canvas for a moving frame (live) or for the frame that stays.
  // Pinched in, it covers the part in view: exactly, for a frame at rest;
  // for one drawn while the view moves (`moving` - a moving frame, or a
  // still while the page is pinched or panned) the crop already drawn is
  // kept while it still serves, and a new one takes a margin round the
  // view, so a small pan or pinch shows what is already drawn, sharp.
  const size = (live = !redraw, moving = live) => {
    const box = canvas.parentElement || host;
    const w = box.clientWidth || window.innerWidth, h = box.clientHeight || window.innerHeight;
    // (the lens follows the screen's shape, and only when that changes:
    // the table sets a lens of its own every frame)
    if (w !== screenW || h !== screenH) {
      screenW = w; screenH = h;
      camera.aspect = w / h;
      // Narrow screens get a wider lens so the table still reads.
      camera.fov = w / h < 0.62 ? 42 : 34;
      camera.updateProjectionMatrix();
    }
    const v = inView(box, w, h);
    if (!moving || !serves(crop, v) || crop.fw !== w || crop.fh !== h) crop = v && moving ? inView(box, w, h, MARGIN) : v;
    const cw = crop ? crop.w : w, ch = crop ? crop.h : h;
    // (a moving frame: its pixels spread over the part in view, so pinched
    // in it is as sharp as the zoom - to the screen's own - at no more cost)
    const r = live ? Math.min(pixelRatio * Math.sqrt((w * h) / (cw * ch)), Math.max(pixelRatio, Math.min(window.devicePixelRatio || 1, 3) * (crop ? crop.zoom : 1)))
      : stillRatio(w, h, cw, ch, crop ? crop.zoom : 1);
    const key = [w, h, r, live ? 'l' : 's', crop ? [crop.x, crop.y, crop.w, crop.h] : ''].join();
    if (key === sized) return false;
    sized = key;
    place(canvas, renderer, cw, ch, r);
    if (composer) { postStill(!live); composer.setPixelRatio(r); composer.setSize(cw, ch); }
    layers.forEach(gl => place(gl.domElement, gl, cw, ch, r));
    return true;
  };
  // A canvas over the whole screen, or over the crop, at ratio r. (Set with
  // !important: a layer's own stylesheet may pin it to the whole screen.)
  const place = (el, gl, cw, ch, r) => {
    const st = el.style;
    if (crop) [['left', crop.x], ['top', crop.y], ['width', crop.w], ['height', crop.h]].forEach(([k, v]) => st.setProperty(k, `${v}px`, 'important'));
    else ['left', 'top', 'width', 'height'].forEach(k => st.removeProperty(k));
    gl.setDrawingBufferSize(cw, ch, r);
  };
  // Other canvases drawn over this one with the same camera (the table's
  // dealer has one): kept the same size - the same part of the screen at the
  // same resolution - and drawn through the same part of the lens. A layer
  // that moves on its own over a frame that stays (the dealer's arms over
  // the table held still) is placed again `live`, at a moving frame's
  // resolution - no more pixels than a moving frame of the whole view, and
  // so, pinched in, at the zoom's resolution over the part in view - and
  // placed again without it once it stops. (Placing a canvas clears it:
  // draw it straight after.)
  const layers = [];
  const layerSize = new THREE.Vector2();
  const layer = (gl, live = false) => {
    const known = layers.includes(gl);
    if (!known) layers.push(gl);
    const [w, h, r0] = sized.split(',').map(Number);
    if (!w) return;
    const cw = crop ? crop.w : w, ch = crop ? crop.h : h;
    // (drawn alone, over a frame that is not drawn again: close to the
    // still's own resolution - unless the device is down from full speed)
    const r = live ? Math.min(r0, Math.max(pixelRatio * Math.sqrt((w * h) / (cw * ch)), pixelRatio < LIVE_MAX ? 0 : 0.85 * r0)) : r0;
    gl.getSize(layerSize);
    if (known && gl.getPixelRatio() === r && layerSize.x === cw && layerSize.y === ch) return;
    place(gl.domElement, gl, cw, ch, r);
  };
  // Before a frame is drawn: the canvas sized for it, when it has moved on
  // from a still (true when it was resized).
  const fit = () => { if (!refit) return false; refit = false; return size(); };
  // Draws through the part of the lens in view, when the canvas covers
  // only that (a crop).
  const lens = paint => {
    if (!crop) { paint(); return; }
    camera.setViewOffset(crop.fw, crop.fh, crop.x, crop.y, crop.w, crop.h);
    paint();
    camera.clearViewOffset();
  };
  // The frame on screen stays: drawn again, sharp (`again` draws it).
  const rest = again => { redraw = again; clearTimeout(zoomT); size(); again(); };
  // Moving again: the next frame is drawn at the moving frames' resolution.
  const move = () => { if (!redraw) return; redraw = null; clearTimeout(zoomT); refit = true; };
  // Pinching, or moving about while pinched in. The canvas follows the view
  // as it goes, a frame at a time: a crop that no longer covers what is in
  // view (or drawn for a zoom a sixth away) is drawn again round where the
  // view is now, with a margin, at the zoom's resolution - within a still's
  // budget, so never blocky, and never a gap at the edge - and once the
  // view stops, just what is in view, at the zoom's full resolution.
  // Moving frames re-crop on their own next frame.
  let zoomRaf = 0;
  const follow = () => { zoomRaf = 0; if (redraw && size(false, true)) redraw(); };
  const onZoom = () => {
    if (!redraw) { refit = true; return; }
    clearTimeout(zoomT);
    if (!zoomRaf) zoomRaf = requestAnimationFrame(follow);
    // (the keyboard coming up, say, changes nothing the canvas needs)
    zoomT = setTimeout(() => { if (redraw && size()) redraw(); }, 220);
  };
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', onZoom);
    window.visualViewport.addEventListener('scroll', onZoom);
    undo.push(() => {
      clearTimeout(zoomT); cancelAnimationFrame(zoomRaf);
      window.visualViewport.removeEventListener('resize', onZoom);
      window.visualViewport.removeEventListener('scroll', onZoom);
    });
  }
  const makeComposer = () => {
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.35, 0.5, 2.1);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  };
  if (o.quality !== 'low') makeComposer();
  size();

  // (a frame's breath: the next frame, or a moment when frames aren't
  // coming - a hidden tab)
  const breath = () => new Promise(res => { let d = false; const go = () => { if (!d) { d = true; res(); } }; requestAnimationFrame(go); setTimeout(go, 60); });
  // (any buffer will do to compile against: a shader drawing into one
  // buffer is the one drawing into all of them)
  const probe = new THREE.WebGLRenderTarget(1, 1);
  undo.push(() => probe.dispose());
  // The scene's shaders compiled (in parallel where the driver can) for the
  // way it is drawn now - into the post's buffer; or to the screen and, for
  // the glass dice, into a buffer - and its textures uploaded. `show`: parts
  // still hidden that are compiled as they will be once shown (the lights
  // they bring count), then hidden again; `spread`: the uploads a frame
  // apiece, for a scene that is playing meanwhile. (The whole scene, always:
  // a part of it compiled on its own would count its lights twice.)
  const warm = async ({ show = [], spread = false } = {}) => {
    const was = renderer.getRenderTarget(), hidden = show.filter(x => !x.visible);
    hidden.forEach(x => { x.visible = true; });
    const jobs = [];
    // (with the post, the screen's shaders too, not waited on: should a slow
    // device drop the post mid-shot - applyQuality - the frame that drops it
    // compiles nothing)
    for (const target of composer ? [probe, null] : [null, probe]) {
      renderer.setRenderTarget(target);
      try {
        const job = renderer.compileAsync(scene, camera).catch(() => {});
        if (target === probe || !composer) jobs.push(job);
      } catch (e) { /* compiled on first draw */ }
    }
    renderer.setRenderTarget(was);
    const texs = new Set();
    scene.traverse(m => { if (m.material) [].concat(m.material).forEach(mat => Object.values(mat).forEach(v => { if (v && v.isTexture && !v.isRenderTargetTexture) texs.add(v); })); });
    hidden.forEach(x => { x.visible = false; });
    await Promise.all(jobs);
    for (const t of texs) {
      try { renderer.initTexture(t); } catch (e) { /* on first draw */ }
      if (spread) await breath();
    }
  };

  // ---- One frame at real time t.
  const setPose = (obj, p, q) => { obj.position.set(p[0], p[1], p[2]); obj.quaternion.set(q[0], q[1], q[2], q[3]); };
  const project = p => { const v = new THREE.Vector3(p[0], p[1], p[2]).project(camera); return [(v.x * 0.5 + 0.5) * host.clientWidth, (-v.y * 0.5 + 0.5) * host.clientHeight, v.z]; };
  // The light behind the lens: brightest through the slow motion.
  const gleamAt = game ? (t => game.gleamAt(t)) : (t => smoother((t - (Rwall - 0.2)) / 0.35) * (1 - smoother((t - W.slowHold[1]) / 0.7)));
  // (it sits up and off to the lens's left, not on its axis: a light on the
  // axis comes straight back off any face square to the lens, a white flash)
  const aimLens = (eye, aim, gleam) => {
    const back = new THREE.Vector3(eye[0] - aim[0], eye[1] - aim[1], eye[2] - aim[2]).normalize();
    const right = new THREE.Vector3(back.z, 0, -back.x).normalize();
    lensLight.position.set(eye[0] + back.x * 10 - right.x * 26, eye[1] + back.y * 10 + 30, eye[2] + back.z * 10 - right.z * 26);
    lensLight.target.position.set(aim[0], aim[1], aim[2]);
    lensLight.intensity = 0.35 + 0.65 * gleam;
  };
  // The camera at real time t, from the path worked out above.
  const cameraAt = t => {
    const w = W.world(t);
    const f = Math.min(camN - 2, Math.max(0, t / CAM_DT)), k0 = Math.floor(f), u = f - k0;
    const eye = [0, 1, 2].map(j => lerp(camEye[k0 * 3 + j], camEye[(k0 + 1) * 3 + j], u));
    const aim = [0, 1, 2].map(j => lerp(camAim[k0 * 3 + j], camAim[(k0 + 1) * 3 + j], u));
    let shake = [0, 0, 0];
    if (game) { if (game.shakeAt) shake = game.shakeAt(t, w); }
    else if (plan.vault) {
      const x = w - plan.vault.boom;
      if (x > 0 && x < 0.8) { const a = 0.9 * Math.exp(-x / 0.14); shake = [a * Math.sin(x * 73), a * Math.sin(x * 61 + 1), a * Math.sin(x * 57 + 2)]; }
    }
    return { eye: [eye[0] + shake[0], eye[1] + shake[1], eye[2] + shake[2]], aim };
  };
  const placeCamera = t => {
    const { eye, aim } = cameraAt(t);
    camera.position.set(eye[0], eye[1], eye[2]);
    camera.lookAt(aim[0], aim[1], aim[2]);
    camera.updateMatrixWorld();
    aimLens(eye, aim, gleamAt(t));
  };
  // Everything in the shot but the camera, at real time t.
  const stage = t => {
    const w = W.world(t);
    const rate = W.rateAt(t);
    const gleam = gleamAt(t);
    // Another game's pieces, lights and call, at this frame (its burst is
    // the bloom's, as the Vault Pull's is).
    const gst = game ? game.stage(t, { w, rate, gleam }) : null;
    // Cup.
    const cp = game ? null : cupAt(Math.min(w, 5));
    if (cup) { setPose(cup, cp.p, cp.q); cup.visible = w < P.RELEASE.t + 1.2; }
    // Dice.
    const burst = game ? (gst && gst.burst != null ? gst.burst : -1) : plan.vault ? w - plan.vault.boom : -1;
    for (let i = 0; i < dice.length; i++) {
      const d = dice[i];
      let pose = dicePose(plan, i, w);
      let glow = 0;
      if (plan.vault && w > plan.restW) {
        const x = w - plan.restW;
        let ang = 0;
        plan.vault.shakes.forEach(([s, len, deg], k) => {
          const uu = (x - s - i * 0.035) / len;
          if (uu > 0 && uu < 1) ang += deg * DEG * Math.sin(uu * Math.PI * 3) * Math.pow(1 - uu, 0.7);
          glow += 0.25 * Math.exp(-Math.pow((x - s - len * 0.4) / 0.18, 2)) * (k + 1) / 2;
        });
        glow = Math.min(1.2, glow + 0.9 * Math.pow(clamp01((x - plan.vault.shakes[2][0]) / (plan.vault.boom - plan.restW - plan.vault.shakes[2][0])), 2.2));
        const axis = [Math.cos(-34 * DEG), 0, -Math.sin(-34 * DEG)];
        const q = P.qmul(P.qaxis(axis, ang), pose.q);
        // Rocked on its edge: lifted so its lowest corner stays on the felt.
        let low = Infinity;
        const ih = P.DIE / 2 - VIS_ROUND;
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) low = Math.min(low, P.qrot(q, [sx * ih, sy * ih, sz * ih])[1]);
        pose = { p: [pose.p[0], VIS_ROUND - low, pose.p[2]], q };
      }
      setPose(d.g, pose.p, pose.q);
      // (out of the cup only once they have left its mouth)
      const shown = w >= P.RELEASE.t && !(burst > 0.06);
      d.g.visible = shown;
      const s = burst > 0 ? 1 + burst * 5 : 1;
      d.g.scale.setScalar(s);
      d.mat.emissiveIntensity = glow * 0.8;
      if (d.glow) { d.glow.position.set(pose.p[0], pose.p[1], pose.p[2]); d.glow.intensity = shown ? glow * 3.5 : 0; }
      // Seen from afar a die is a few pixels, and its glass-hard gloss and
      // the studio in it average out to a pale pink: the gloss goes as the
      // lens pulls back, leaving the resin's own red.
      const far = Math.hypot(pose.p[0] - camera.position.x, pose.p[1] - camera.position.y, pose.p[2] - camera.position.z) / s;
      const kg = 1 - smoother((far - 48) / 55);
      d.mat.envMapIntensity = 0.3 + 2.0 * kg;
      // (never quite none: a coat that reaches 0 is a different shader, and
      // switching to it mid-shot compiles it then and there)
      d.mat.clearcoat = Math.max(0.02, 0.7 * kg);
      d.mat.specularIntensity = 0.25 + 0.35 * kg;
      d.mat.roughness = 0.16 + 0.36 * (1 - kg);
    }
    // Stick.
    if (stick) {
      const st = stick.hp.at(w);
      stick.g.visible = st.on;
      if (st.on) {
        const hw = hookWorld(stick.hp, st);
        const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(...hw.X), new THREE.Vector3(0, 1, 0), new THREE.Vector3(...hw.U));
        stick.g.quaternion.setFromRotationMatrix(m);
        stick.g.position.set(hw.O[0], hw.O[1], hw.O[2]);
        // (rotating about x by -lean tips +z up toward +y)
        stick.pivot.rotation.x = -shaftLean(stick.hp.line, st.u);
      }
    }
    // Vault.
    if (vault) {
      const on = burst > 0;
      vault.plaques.forEach((m, i) => {
        m.visible = on;
        if (on) { const ps = P.poseAt(plan.vault.run, i, w); const sc = Math.min(1, 0.3 + burst / 0.12); setPose(m, ps.p, ps.q); m.scale.setScalar(sc); }
      });
      const fl = burst > 0 ? (burst < 0.03 ? burst / 0.03 : Math.exp(-(burst - 0.03) / 0.2)) : 0;
      vault.flash.intensity = fl * 30;
      flashEl.style.opacity = (fl * 0.32).toFixed(3);
      vault.scorch.forEach(sc => {
        sc.m.material.opacity = clamp01(burst / 0.1) * 0.9;
        sc.e.material.opacity = burst > 0 ? Math.pow(Math.max(0, 1 - burst / 2.2), 1.5) * (0.8 + 0.2 * Math.sin(burst * 23)) : 0;
        const kk = clamp01(burst / 0.5);
        sc.ring.material.opacity = burst > 0 && burst < 0.5 ? 0.4 * Math.pow(1 - kk, 2) : 0;
        sc.ring.scale.setScalar(1 + 11 * (1 - Math.pow(1 - kk, 3)));
      });
    }
    // The rim light is for the strike: once the dice have come to rest it
    // eases down, or a face square to it would flash white into the lens.
    // (another game sets the house lights itself, in its stage())
    if (!game && !plan.edge) rim.intensity = RIM * (1 - 0.8 * smoother((w - (plan.restW - 0.45)) / 0.5));
    // Edge: the room goes dark round the pinned die as the lens closes in.
    if (!game && plan.edge) {
      const e = dicePose(plan, plan.edge.die, w).p;
      const k = smoother((w - plan.edge.done) / 0.5);
      edgeSpot.position.set(e[0] - 6, e[1] + 60, e[2] + 8);
      edgeSpot.target.position.set(e[0], e[1], e[2]);
      edgeSpot.intensity = 2.8 * k;
      pendant.intensity = PENDANT * (1 - 0.8 * k);
      rim.intensity = RIM * (1 - 0.7 * k);
      scene.environmentIntensity = ENV_LEVEL * (1 - 0.6 * k);
    }
    // Particles.
    let n = 0;
    const put = (p, c) => { pPos[n * 3] = p[0]; pPos[n * 3 + 1] = p[1]; pPos[n * 3 + 2] = p[2]; pCol[n * 3] = c[0]; pCol[n * 3 + 1] = c[1]; pCol[n * 3 + 2] = c[2]; n++; };
    const lightAxis = [0, -1, 0];
    for (const m of dust) {
      const p = [m.p[0] + m.v[0] * t + 1.2 * Math.sin(t * 0.5 + m.ph), m.p[1] + m.v[1] * t + 0.8 * Math.sin(t * 0.37 + m.ph * 2), m.p[2] + m.v[2] * t];
      const off = Math.hypot(p[0] - pendant.target.position.x * 0.9, p[2] - pendant.target.position.z * 0.9);
      const lit = Math.exp(-(off * off) / (2 * 26 * 26)) * (game ? (gst && gst.dust != null ? gst.dust : 1) : plan.edge ? 1 - 0.8 * smoother((w - plan.edge.done) / 0.5) : 1);
      const tw = 0.4 + 0.6 * Math.pow(0.5 + 0.5 * Math.sin(t * 2.3 + m.ph * 3), 4);
      const b = m.a * lit * tw * 0.55;
      put(p, [b, b * 0.96, b * 0.9]);
    }
    puffs.forEach((ev, j) => {
      const x = w - ev.t;
      for (let k = 0; k < PUFF; k++) {
        if (x <= 0 || x > 1.1) { put([0, -500, 0], [0, 0, 0]); continue; }
        const ang = k * 2.39996 + j, sp = 6 + 7 * ((k * 37) % 11) / 11, up = 5 + 5 * ((k * 53) % 7) / 7;
        const p = [ev.pt[0] + Math.cos(ang) * sp * x, Math.max(0.05, up * x - 9 * x * x), ev.pt[2] + Math.sin(ang) * sp * x];
        const b = 0.35 * (1 - x / 1.1) * Math.min(1, ev.speed / 200);
        put(p, [b * 0.85, b * 0.8, b * 0.72]);
      }
    });
    if (SPARK) {
      for (let k = 0; k < SPARK; k++) {
        const die = k % 2, src = plan.rest[die].p;
        const life = 0.45 + 0.7 * ((k * 29) % 13) / 13;
        if (burst <= 0 || burst > life) { put([0, -500, 0], [0, 0, 0]); continue; }
        const ang = k * 2.39996, el = 0.2 + 1.2 * ((k * 17) % 9) / 9, sp = 40 + 60 * ((k * 41) % 10) / 10;
        const dr = Math.exp(-burst * 1.6);
        const p = [src[0] + Math.cos(ang) * Math.cos(el) * sp * burst * dr, Math.max(0.05, 1 + Math.sin(el) * sp * burst * dr - 0.5 * 490 * burst * burst), src[2] + Math.sin(ang) * Math.cos(el) * sp * burst * dr];
        const heat = 1 - burst / life;
        put(p, [1.6 * heat, (0.5 + 0.9 * heat) * heat, 0.25 * heat * heat]);
      }
    }
    pGeo.setDrawRange(0, n);
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.color.needsUpdate = true;
    // The call, over the dice.
    const callOn = !!plan.call;
    if (callOn) {
      const cw = plan.callW;
      // (a game may take its call out for a moment - a pan it would cross)
      const on = smoother((w - cw) / 0.45) * (1 - smoother((w - plan.revealW + 0.3) / 0.5)) * (game && game.callAlphaAt ? game.callAlphaAt(w) : 1);
      call.style.opacity = on.toFixed(3);
      scrimEl.style.opacity = (0.85 * on * (game && game.callScrimAt ? game.callScrimAt(w) : 1)).toFixed(3);
      if (on > 0) {
        // Over the higher of the two dice on screen, clear of both (or over
        // where the game says its call belongs).
        const s = game ? project(game.callAt(w)) : [0, 1].map(i => { const d = dicePose(plan, i, w).p; return project([d[0], d[1] + 2.5, d[2]]); }).sort((a, b) => a[1] - b[1])[0];
        // (a long call - THE BLACK JACK - is set smaller to fit a phone held
        // upright, never wider than most of the screen)
        const fitW = Math.min(1, (0.86 * host.clientWidth) / Math.max(1, call.offsetWidth));
        const grow = fitW * (1.12 - 0.12 * smoother((w - cw) / 0.8));
        // (kept whole on screen, whatever the dice's spread)
        const half = (call.offsetWidth * grow) / 2 + 12, W0 = host.clientWidth;
        const cx = half * 2 < W0 ? Math.min(Math.max(s[0], half), W0 - half) : W0 / 2;
        // (kept on screen top and bottom: a game's close-up can carry its
        // anchor off the bottom of a wide screen)
        // (and never up under the tier's caption at the top)
        const under = tier === 'standard' ? 0 : badgeEl.offsetTop + badgeEl.offsetHeight + 10 + (call.offsetHeight * grow) / 2;
        const cy = Math.min(Math.max(s[1] - 56, call.offsetHeight + 16, under), host.clientHeight - call.offsetHeight / 2 - 16);
        call.style.transform = `translate(${cx.toFixed(1)}px,${cy.toFixed(1)}px) translate(-50%,-50%) scale(${grow.toFixed(3)})`;
        if (!scrimEl.hidden) {
          scrimEl.style.width = `${(call.offsetWidth * grow + 90).toFixed(0)}px`;
          scrimEl.style.height = `${(call.offsetHeight * grow + 70).toFixed(0)}px`;
          scrimEl.style.transform = `translate(${cx.toFixed(1)}px,${cy.toFixed(1)}px) translate(-50%,-50%)`;
        }
        call.style.setProperty('--shine', `${(-60 + 220 * clamp01((w - cw - 0.1) / 1.2)).toFixed(1)}%`);
      }
    }
    badgeEl.style.opacity = tier === 'standard' ? '0' : smoother((w - plan.callW - 0.2) / 0.6).toFixed(3);
    return { w, rate, gleam, burst };
  };
  // The scene as it stands, through the post when there is one.
  const paint = () => { fit(); lens(() => { if (composer) composer.render(); else renderer.render(scene, camera); }); };
  const draw = st => {
    if (composer) bloom.strength = 0.3 + 0.22 * st.gleam + (plan.vault || (game && st.burst > 0) ? 1.4 * Math.max(0, 1 - Math.max(0, st.burst) / 0.6) * (st.burst > 0 ? 1 : 0) : 0);
    paint();
  };
  // One frame at real time t.
  const render = t => { placeCamera(t); const st = stage(t); draw(st); return st; };

  // ---- Playback.
  let raf = 0, t = 0, last = 0, playing = false, sfxIndex = 0, silenced = false;
  // Quality steps down while frames run slow (averaged over 24 frames):
  // 3 full; 2 no bloom, lower resolution; 1 no shadows, 1x resolution;
  // 0 the dice lose their glass (transmission renders the scene twice).
  let quality = composer ? 3 : 2, frames = 0;
  // The last frames' times, judged by their median: steady slowness is the
  // device and costs quality; a lone long frame is the page (the app still
  // booting under the shot - a sync, the catalogue's first render) and
  // must not, since a step down recompiles every material and is itself
  // the hitch.
  const win = [];
  const median = a => a.slice().sort((x, y) => x - y)[a.length >> 1];
  const applyQuality = q => {
    if (q <= 2) {
      if (composer) { composer.dispose(); bloom.dispose(); }
      composer = null; pixelRatio = Math.min(pixelRatio, 1.5);
    }
    if (q <= 1) {
      pixelRatio = 1;
      renderer.shadowMap.enabled = false;
      scene.traverse(m => { if (m.material) [].concat(m.material).forEach(x => { x.needsUpdate = true; }); });
    }
    if (q <= 0) dice.forEach(d => { d.mat.transmission = 0; d.mat.color.set(0x9a1224); d.mat.clearcoat = 1; d.mat.needsUpdate = true; });
    if (game && game.quality) game.quality(q);
    size();
  };
  // The table's moving frames, timed by its loop: the resolution the
  // shot's steps left (they may have been taken while the app was still
  // starting up under it) comes back, half a step at a time, while frames
  // come quickly, and goes down while they come slowly. Once down, it tries
  // again only after a wait, twice as long each time it has had to come
  // down: a slow patch (a sync, the app busy under it) costs a few seconds
  // of a softer picture, not the visit, while a device that can't hold it
  // tries less and less often (no see-saw).
  // (the wait never grows past half a minute: a device that was slow once
  // under a sync or a compile is tried again, not written off)
  const paced = [];
  let pacedWait = 0, pacedFor = 8000;
  const PACED_MAX = 32000;
  const pace = raw => {
    paced.push(raw);
    if (paced.length < 20) return;
    const med = median(paced);
    paced.length = 0;
    const now = performance.now();
    if (med > 0.036 && pixelRatio > 1) { pixelRatio = Math.max(1, pixelRatio - 0.5); pacedWait = now + pacedFor; pacedFor = Math.min(PACED_MAX, pacedFor * 2); refit = true; }
    else if (med < 0.021 && now > pacedWait && pixelRatio < LIVE_MAX) { pixelRatio = Math.min(LIVE_MAX, pixelRatio + 0.5); refit = true; }
  };
  const scheduleSound = (from, to) => {
    if (!sound || !sound.on) return;
    const now = sound.ctx.currentTime;
    if (!sound.bed && silenceAt == null) sound.ambience(now);
    if (silenceAt != null && !sound.bed && t < silenceAt) sound.ambience(now);
    while (sfxIndex < sfx.length && sfx[sfxIndex].t < to) {
      const ev = sfx[sfxIndex++];
      if (ev.t < from - 0.05) continue;
      sound.play(ev, now + Math.max(0, ev.t - from), ev.rate || 1);
    }
    if (silenceAt != null && !silenced && to >= silenceAt) { silenced = true; sound.cut(now + Math.max(0, silenceAt - from)); }
  };
  // Fires the landing's cues once each, whichever way the shot gets there.
  const cue = () => {
    if (!revealed && t >= plan.revealReal) { revealed = true; if (o.onReveal) o.onReveal(); }
    if (!ended && t >= plan.totalReal) { ended = true; if (o.onEnd) o.onEnd(); }
  };
  // The finished frame, held still (motion off, a muted skin, or a device
  // too slow to play it): never earlier than the end of the shot - and a
  // breath into the float, where the dice have come down from under the
  // copy's veil and sit, red and sharp, on the hook below it.
  const still = () => {
    playing = false; cancelAnimationFrame(raf);
    t = Math.max(t, plan.totalReal + 2.4);
    rest(() => render(t));
    soundBtn.hidden = true;
    if (sound && sound.bed) sound.cut(sound.ctx.currentTime);
    cue();
  };
  // The float has risen into the ceiling: the frame stays, the loop rests.
  const settle = () => {
    playing = false; cancelAnimationFrame(raf);
    t = floatEnd; rest(() => render(t));
    if (sound && sound.bed) sound.fade(sound.ctx.currentTime, 1.2);
    cue();
  };
  const pacer = makePacer();
  const loop = now => {
    if (!playing) return;
    // Reduced motion switched on mid-shot (in the app or the system): the
    // finished frame, at once, as when it was on from the start.
    if (o.motionOff && o.motionOff()) { still(); return; }
    // (a frame between the ones drawn, on a fast screen: see makePacer)
    if (!pacer.due(now)) { raf = requestAnimationFrame(loop); return; }
    const raw = last ? (now - last) / 1000 : 1 / 60;
    last = now;
    // Time runs with the clock (a slow device drops frames rather than
    // stretching the shot); only a stall - a hidden tab - is held back.
    const dt = Math.min(raw, 0.1);
    const t0 = t;
    t += dt;
    // (the first frames are skipped: they carry texture uploads and the
    // app's own start-up)
    frames++;
    // (nor the frame after the tab was hidden: that gap is the tab, not the
    // device, and must not cost quality or end the shot)
    const stall = resumed; resumed = false;
    if (frames > 12 && o.quality !== 'full' && !stall) { win.push(raw); if (win.length > 10) win.shift(); }
    if (win.length >= 10) {
      const med = median(win);
      if (med > 0.036 && quality > 0) { applyQuality(--quality); win.length = 0; }
      // Still a slideshow at the lowest setting: show the finished frame
      // instead (as with motion off) rather than stutter through the shot.
      else if (med > 0.12 && quality === 0) { still(); return; }
    }
    scheduleSound(t0, t + 0.1);
    if (t >= floatEnd) { settle(); return; }
    render(t);
    cue();
    raf = requestAnimationFrame(loop);
  };
  let revealed = false, ended = false;
  // A lost context - the phone short of GPU memory: a screen recording, a
  // screenshot, another app in front - comes back empty, every buffer gone.
  // three.js makes again what it can by itself (the shaders, the textures
  // from their images, the shadows, the post's buffers), but the studio the
  // glossy surfaces mirror is a buffer drawn once, and would stay black: the
  // room went dark but for the lamps' own glints on the brass. It is drawn
  // again, then the frame on screen (the table, once it has the canvas,
  // redraws its own through onRestore).
  const restored = [];
  const onRestored = () => {
    const old = scene.environment;
    scene.environment = studioEnvironment(renderer);
    if (old) old.dispose();
    if (restored.length) restored.forEach(fn => { try { fn(); } catch (e) { /* the next frame */ } });
    else if (redraw) redraw();
    else if (!playing) render(t);
  };
  canvas.addEventListener('webglcontextrestored', onRestored);
  undo.push(() => canvas.removeEventListener('webglcontextrestored', onRestored));
  const onResize = () => { size(); render(t); };
  window.addEventListener('resize', onResize);
  let resumed = false;
  const onVisibility = () => { if (document.hidden) resumed = true; };
  document.addEventListener('visibilitychange', onVisibility);
  undo.push(() => {
    playing = false; cancelAnimationFrame(raf);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVisibility);
  });

  // The speaker: sound on or off, without skipping the shot.
  const soundBtn = document.createElement('button');
  soundBtn.type = 'button';
  soundBtn.className = 'r3-sound';
  const paintBtn = () => {
    const on = !!(sound && sound.on);
    soundBtn.setAttribute('aria-label', on ? 'Mute intro sound' : 'Play intro sound');
    soundBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    soundBtn.innerHTML = on
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  };
  // Its own taps, focus and keys belong to it: none of them may reach the
  // landing screen's skip handlers (focus arriving there, or Enter/Space
  // reaching the document, would end the shot it is meant to keep).
  ['pointerdown', 'focusin', 'keydown'].forEach(type => soundBtn.addEventListener(type, e => e.stopPropagation()));
  soundBtn.addEventListener('click', e => {
    e.stopPropagation();
    if (!sound) { try { sound = new Sound(); } catch (err) { sound = null; } }
    if (!sound || !sound.ctx) return;
    if (sound.on) { sound.muted = true; sound.master.gain.setTargetAtTime(0, sound.ctx.currentTime, 0.02); }
    else {
      sound.muted = false;
      sound.ctx.resume().then(() => { sound.master.gain.setTargetAtTime(0.85, sound.ctx.currentTime, 0.02); sfxIndex = sfx.findIndex(ev => ev.t >= t); if (sfxIndex < 0) sfxIndex = sfx.length; paintBtn(); });
      if (rare.clackBytes && !sound.clack) sound.ctx.decodeAudioData(rare.clackBytes.slice(0)).then(b => { sound.clack = b; }).catch(() => {});
    }
    paintBtn();
    if (o.onSoundChange) o.onSoundChange(!sound.muted);
  });
  paintBtn();
  // Outside the scene's aria-hidden layer, so assistive technology can
  // find it (the canvas and overlays stay hidden, as decoration).
  (o.controlsHost || host).appendChild(soundBtn);
  undo.push(() => soundBtn.remove());
  if (sound && sound.ctx) sound.ctx.onstatechange = paintBtn;
  // Sound is on unless it was switched off, but the browser holds the page
  // silent until its first tap or key. So the first one anywhere - the tap
  // that skips the shot, say - starts it, as the speaker would. A tap on
  // the speaker itself is the speaker's to answer (it would otherwise turn
  // straight back off what this had just turned on).
  const UNLOCK_ON = ['pointerup', 'touchend', 'click', 'keydown'];
  const dropUnlock = () => UNLOCK_ON.forEach(type => window.removeEventListener(type, unlock, true));
  const unlock = e => {
    if (e && e.target && e.target.closest && e.target.closest('.r3-sound')) return;
    if (!sound || !sound.ctx || sound.muted || sound.ctx.state !== 'suspended') { dropUnlock(); return; }
    sound.ctx.resume().then(() => {
      dropUnlock();
      if (sound.muted) return;
      sfxIndex = sfx.findIndex(ev => ev.t >= t); if (sfxIndex < 0) sfxIndex = sfx.length;
      paintBtn();
    }).catch(() => { /* not a gesture the browser counts: the next one */ });
  };
  if (sound && sound.ctx && sound.ctx.state !== 'running') UNLOCK_ON.forEach(type => window.addEventListener(type, unlock, true));
  soundBtn.addEventListener('click', dropUnlock);
  undo.push(dropUnlock);

  // Everything the shot draws is made ready before it plays, so no frame of
  // it waits on the GPU. Each shader is compiled for the way it is drawn: a
  // shader drawing into a buffer (the post's, or the one the glass dice see
  // the room through) is not the one drawing to the screen, and compiling
  // the screen's when the post draws is how the old shot still hitched. Then
  // a frame is drawn, unseen, at each turn of the shot - the throw, the
  // strike, the swing round, the landing, the stick or the burst or the
  // edge, the float - so whatever only those frames bring in (the wall
  // coming into view, the dice's glass and its buffer, the burst's plaques,
  // the room) is compiled and uploaded now rather than the first time it
  // shows. Nothing after this changes what a shader is: no light comes or
  // goes, and no coat reaches none.
  await warm();
  checkAbort();
  {
    const at = game ? game.warmAt.concat([plan.totalReal + 1, floatEnd - 0.5]) : [Rrel + 0.04, Rwall + 0.06, W.slowHold[1], Rrest + 0.3, plan.totalReal + 1, floatEnd - 0.5];
    if (!game && plan.stick) at.push(R2(plan.stick.hp.T.approach[1]), R2(plan.stick.hp.T.pull[1]));
    if (!game && plan.vault) at.push(R2(plan.vault.boom) + 0.05, R2(plan.vault.boom) + 0.7);
    if (!game && plan.edge) at.push(R2(plan.edge.done) + 0.5);
    canvas.style.visibility = 'hidden';
    for (const tt of at) { render(Math.min(floatEnd, Math.max(0, tt))); await breath(); checkAbort(); }
    canvas.style.visibility = '';
  }
  render(0);
  return {
    plan: { game: gameId, tier, seed: o.seed, revealReal: plan.revealReal, totalReal: plan.totalReal, floatEnd, restReal: plan.restReal, wallReal: plan.wallReal, values: plan.values, call: plan.call, throwOk: plan.throwOk, why: plan.why, moments: game ? game.moments : null },
    play() { playing = true; last = 0; pacer.reset(); move(); raf = requestAnimationFrame(loop); },
    seek(time) { playing = false; cancelAnimationFrame(raf); t = Math.max(0, Math.min(floatEnd, time)); render(t); },
    // (lab: that frame drawn as a still - at the screen's own resolution,
    // as a frame that stays is)
    still(time) { this.seek(time); rest(() => render(t)); },
    // A tap mid-shot: straight to its end, and float on from there.
    skip() {
      if (t < plan.totalReal) {
        t = plan.totalReal;
        sfxIndex = sfx.findIndex(ev => ev.t >= t); if (sfxIndex < 0) sfxIndex = sfx.length;
      }
      if (!playing && t < floatEnd) { playing = true; last = 0; pacer.reset(); move(); raf = requestAnimationFrame(loop); }
      render(t);
      cue();
    },
    // Motion off: the finished frame, held still.
    finish: still,
    // A look at the running scene (the table builds into it while the
    // intro floats), without stopping anything.
    peek() { return { scene, renderer, camera, composer, bloom, game, dbg: { camEye, camAim, CAM_DT, W, plan, dicePose } }; },
    // What is added to the scene (the table, while the intro floats) made
    // ready before it is drawn: see warm().
    warm,
    // (a felt picked while the shot is up: dressed, and the frame redrawn)
    setFelt(id) { dressFelt(felt.material, id); if (redraw) redraw(); else if (!playing) render(t); },
    // (the same for the trim: see TRIMS)
    setTrim(id) { dressTrim({ band: [gold] }, id); if (redraw) redraw(); else if (!playing) render(t); },
    // The fly-in takes the scene over: the loop stops and the set, the
    // renderer and the camera are handed on, as they are this moment.
    release() {
      playing = false; cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      soundBtn.hidden = true;
      dropUnlock();
      if (sound && sound.bed) sound.fade(sound.ctx.currentTime, 0.6);
      // (the frame at rest was the shot's: the table draws its own)
      move();
      return {
        THREE, renderer, scene, camera, host, canvas, t, floatEnd,
        get composer() { return composer; },
        get bloom() { return bloom; },
        get pixelRatio() { return pixelRatio; },
        get quality() { return quality; },
        size,
        // the scene drawn as it stands (sized first, when a still has
        // ended; through the part in view, when pinched in); the frame on
        // screen held (drawn again, sharp) or moving on; a moving frame's
        // time, for its resolution
        paint, rest, move, pace, layer, lens, fit, warm,
        // (a pacer of its own for each loop that draws: see makePacer)
        pacer: () => makePacer(),
        // (what to draw again once a lost context is back: see onRestored)
        onRestore: fn => { restored.push(fn); },
        // (the felt picked in Settings, dressed onto the shot's table and
        // onto any other felt handed it: see FELTS)
        setFelt: id => dressFelt(felt.material, id),
        dressFelt,
        // (the trim picked in Settings, dressed onto the shot's band; the
        // table dresses its own with dressTrim)
        setTrim: id => dressTrim({ band: [gold] }, id),
        dressTrim,
        get trim() { return gold.userData.trim || 'gold'; },
        // the intro's own world (dice, stick, dust) at a real time, and a
        // frame of it drawn through the intro's post-processing
        stage: tt => stage(tt == null ? t : tt),
        draw,
        lights,
        dice: dice.map(d => d.g),
        game: gameId,
        overlays: [call, scrimEl, badgeEl, flashEl],
        dispose: teardown
      };
    },
    dispose: teardown
  };
}
