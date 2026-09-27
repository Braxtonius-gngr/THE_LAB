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

const HERE = new URL('./', import.meta.url);
const asset = f => new URL(f, HERE).href;

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
function makeWarp(wallW) {
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
// He reaches in from his side of the table (+x, toward the thrower), over
// the dice, sets the hook down beyond them and draws them back to himself.
// The hook is a moving body in the physics, so the dice are pushed by it -
// sliding, bumping each other - rather than carried.
const HOOK = { rc: 4.2, cap: 0.28, lift: 3.8, pull: 32 };
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
  // line through them, drawn toward the stickman (+x) and never back
  // toward the wall.
  const base = Math.atan2(0.35, 1);
  let best = null;
  for (let d = -30; d <= 65; d += 2.5) {
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
function makeHookPath(line, foot, s0) {
  const T = { approach: [s0, s0 + 1.05], set: [s0 + 1.05, s0 + 1.4], pull: [s0 + 1.5, s0 + 3.7] };
  const at = t => {
    if (t <= T.approach[0]) return { u: foot + 70, h: HOOK.lift, on: false };
    if (t <= T.approach[1]) { const k = easeOut((t - T.approach[0]) / (T.approach[1] - T.approach[0]), 2.2); return { u: lerp(foot + 70, foot - 1.4, k), h: HOOK.lift, on: true }; }
    if (t <= T.set[1]) { const k = smoother((t - T.set[0]) / (T.set[1] - T.set[0])); return { u: lerp(foot - 1.4, foot, k), h: HOOK.lift * (1 - k), on: true }; }
    if (t <= T.pull[0]) return { u: foot, h: 0, on: true };
    const k = smoother((t - T.pull[0]) / (T.pull[1] - T.pull[0]));
    return { u: foot + HOOK.pull * k, h: 0, on: true };
  };
  return { line, foot, T, at, curve: hookCurve() };
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
export function makePlan(tier, seed) {
  const R = P.rng((seed ^ 0x9e3779b9) >>> 0);
  const wantsStick = tier === 'standard' || tier === 'hardways';
  const best = P.throwDice(seed, {
    tries: 200, budgetMs: 2500,
    extra: wantsStick ? run => {
      const rest = run.bodies.map(b => ({ p: b.p, q: b.q }));
      return stickLine(rest) ? null : 'stick cannot take both dice';
    } : null
  });
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
    const ih = P.DIE / 2 - P.DIE_ROUND;
    let low = null;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      const d = P.qrot(f.q, [sx, sy, sz]);
      if (!low || d[1] < low.w[1]) low = { w: d, b: [sx, sy, sz] };
    }
    const lw = P.qrot(f.q, low.b.map(v => v / Math.sqrt(3)));
    const qc = P.qmul(P.qfromto(lw, [0, -1, 0]), f.q);
    const drift = [(f.p[0] - g.p[0]) / 0.02, (f.p[2] - g.p[2]) / 0.02];
    const pc = [f.p[0] + drift[0] * 0.07, ih * Math.sqrt(3) + P.DIE_ROUND, f.p[2] + drift[1] * 0.07];
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
    const s0 = restW + 1.2;
    const hp = makeHookPath(line, hookFoot(line, rest), s0);
    const dice = P.makeDice();
    dice.forEach((d, i) => { d.p = rest[i].p.slice(); d.q = rest[i].q.slice(); d.sleep = true; });
    const pts = hp.curve;
    const kin = t => {
      const st = hp.at(t);
      if (!st.on || st.h > 1.2 || t > hp.T.pull[1] + 0.25) return null;
      const a = hookWorld(hp, st), b = hookWorld(hp, hp.at(t + 0.004));
      const v = [(b.O[0] - a.O[0]) / 0.004, (b.O[1] - a.O[1]) / 0.004, (b.O[2] - a.O[2]) / 0.004];
      return { r: HOOK.cap, v, pts: pts.map(([x, u]) => [a.O[0] + a.X[0] * x + a.U[0] * u, a.O[1], a.O[2] + a.X[2] * x + a.U[2] * u]) };
    };
    plan.stick = { hp, run: P.simulate(dice, { t0: restW, duration: hp.T.pull[1] + 1.0 - restW, rand: R, kinematic: kin }) };
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
  } else if (plan.stick && w > plan.restW) pose = P.poseAt(plan.stick.run, i, w);
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
const PIP = { off: 0.47, r: 0.19, r1: 0.25, depth: 0.075 };
function pipsOf(value) { return PIP_LAYOUT[value].map(([u, v]) => ({ u: u * PIP.off, v: v * PIP.off, r: value === 1 ? PIP.r1 : PIP.r })); }
function dieGeometry() {
  const h = P.DIE / 2;
  return roundedBox([h, h, h], P.DIE_ROUND, 30, 5, {
    dimple: (fi, u, v) => {
      for (const pp of pipsOf(FACE_VALUE[fi])) if (Math.hypot(u - pp.u, v - pp.v) < pp.r * 1.02) return PIP.depth + 0.04;
      return 0;
    }
  });
}
// The pips: cupped white paint, each a shallow bowl sitting in its well.
function pipGeometry() {
  const h = P.DIE / 2, pos = [], nor = [], idx = [];
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
  geo.setIndex(idx);
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
// glossy dice, brass and felt sheen mirror.
function studioEnvironment(renderer) {
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
// it has been tapped, so the intro may start muted; the speaker button
// turns sound on without skipping the shot.
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
  cut(when) { if (this.bed) { this.bed.g.gain.cancelScheduledValues(when); this.bed.g.gain.setTargetAtTime(0, when, 0.012); } }
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
      case 'boom':
        this.tone(when, 70, 0.9, 1.2, 'sine', 32);
        this.burst(when, 'lowpass', 900, 0.8, 1, 0.7);
        break;
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
  const o = Object.assign({ host: null, controlsHost: null, tier: 'standard', seed: 1, onReveal: null, onEnd: null, sound: true, onSoundChange: null, quality: 'auto', signal: null, motionOff: null }, opts);
  const checkAbort = () => { if (o.signal && o.signal.aborted) throw new Error('intro cancelled'); };
  checkAbort();
  const host = o.host;
  const tier = TIERS.includes(o.tier) ? o.tier : 'standard';

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
  if (tier === 'vault') {
    rareLoads.push(tex('rare/plaque-25k.jpg', true).then(t => { rare.p25 = t; }).catch(() => {}));
    rareLoads.push(tex('rare/plaque-100k.jpg', true).then(t => { rare.p100 = t; }).catch(() => {}));
    rareLoads.push(fetch(asset('rare/ceramic-clack.wav')).then(r => (r.ok ? r.arrayBuffer() : null)).then(b => { rare.clackBytes = b; }).catch(() => {}));
  }

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  let pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(pixelRatio);
  const canvas = renderer.domElement;
  canvas.className = 'r3-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  undo.push(() => {
    renderer.dispose();
    try { renderer.forceContextLoss(); } catch (e) { /* already gone */ }
    canvas.remove();
  });

  const [feltN, rubberN, leatherN, walnut, gunmetal, badge] = await Promise.all([
    tex('felt-normal.jpg', false, [9, 13]),
    tex('rubber-normal.jpg', false, [14.4, 2.36]),
    tex('leather-normal.jpg', false, [5, 2]),
    tex('walnut.jpg', true, [1, 1]),
    tex('gunmetal.jpg', true),
    tex('badge.png', true)
  ]);
  checkAbort();
  const plan = makePlan(tier, o.seed);
  checkAbort();
  const W = plan.warp;

  // ---- The set.
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050506);
  scene.environment = studioEnvironment(renderer);
  scene.environmentIntensity = 0.7;

  const felt = new THREE.Mesh(new THREE.PlaneGeometry(2 * P.TABLE.sideX, P.TABLE.nearZ - P.TABLE.wallZ),
    new THREE.MeshPhysicalMaterial({ color: 0x030304, roughness: 0.97, sheen: 0.45, sheenRoughness: 0.45, sheenColor: new THREE.Color(0x16161b), normalMap: feltN, normalScale: new THREE.Vector2(0.4, 0.4), envMapIntensity: 0.08 }));
  felt.rotation.x = -Math.PI / 2;
  felt.position.set(0, 0, (P.TABLE.nearZ + P.TABLE.wallZ) / 2);
  felt.receiveShadow = true;
  scene.add(felt);

  const rubber = new THREE.MeshStandardMaterial({ color: 0x08080a, roughness: 0.7, normalMap: rubberN, normalScale: new THREE.Vector2(0.9, 0.9) });
  const cushion = new THREE.MeshStandardMaterial({ color: 0x0e0e10, roughness: 0.42, normalMap: leatherN, normalScale: new THREE.Vector2(0.3, 0.3) });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc9a24c, metalness: 1, roughness: 0.26 });
  const wood = new THREE.MeshPhysicalMaterial({ map: walnut, color: 0x7a5a44, roughness: 0.45, clearcoat: 0.5, clearcoatRoughness: 0.25 });
  const wallTop = P.TABLE.wallTop, wz = P.TABLE.wallZ, sx = P.TABLE.sideX;
  const back = new THREE.Mesh(new THREE.PlaneGeometry(2 * sx, wallTop), rubber);
  back.position.set(0, wallTop / 2, wz); back.receiveShadow = true; scene.add(back);
  const addRail = (len, pos, rotY) => {
    const g = new THREE.Group();
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, len, 40), cushion);
    cyl.rotation.z = Math.PI / 2; cyl.position.set(0, wallTop + 4.4, -4.4); cyl.castShadow = true; g.add(cyl);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(len, 0.55, 1.0), brass);
    trim.position.set(0, wallTop + 0.15, -0.55); g.add(trim);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(len + 8, 3.2, 10), wood);
    cap.position.set(0, wallTop + 7.4, -13); g.add(cap);
    g.position.set(...pos); g.rotation.y = rotY; scene.add(g);
  };
  addRail(2 * sx + 10, [0, 0, wz], 0);
  [-1, 1].forEach(sgn => {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(P.TABLE.nearZ - wz, wallTop), cushion);
    side.position.set(sgn * sx, wallTop / 2, (P.TABLE.nearZ + wz) / 2);
    side.rotation.y = -sgn * Math.PI / 2; side.receiveShadow = true; scene.add(side);
    addRail(P.TABLE.nearZ - wz + 10, [sgn * sx, 0, (P.TABLE.nearZ + wz) / 2], -sgn * Math.PI / 2);
  });
  // The room: brushed gunmetal behind the table, far out of focus; the floor.
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(1500, 700), new THREE.MeshBasicMaterial({ map: gunmetal, color: new THREE.Color(0.85, 0.85, 0.88) }));
  backdrop.position.set(120, 160, -420); scene.add(backdrop);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshBasicMaterial({ color: 0x040405 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -82; scene.add(floor);

  // ---- Lights: a warm pendant over the table (the shadows), the light
  // behind the lens (it rides with the camera, so its gleam slides across
  // the dice as the camera moves), a faint fill.
  const pendant = new THREE.SpotLight(0xfff0e2, 2.8, 0, 0.62, 0.75, 0);
  pendant.position.set(-8, 150, -25);
  pendant.target.position.set(0, 0, -32);
  pendant.castShadow = true;
  pendant.shadow.mapSize.set(1024, 1024);
  pendant.shadow.camera.near = 60; pendant.shadow.camera.far = 220;
  pendant.shadow.bias = -0.0004; pendant.shadow.normalBias = 0.04; pendant.shadow.radius = 5;
  scene.add(pendant, pendant.target);
  const lensLight = new THREE.SpotLight(0xfff4e6, 1.2, 0, 0.32, 0.9, 0);
  scene.add(lensLight, lensLight.target);
  scene.add(new THREE.HemisphereLight(0x8a90a0, 0x050505, 0.18));
  const edgeSpot = new THREE.SpotLight(0xfff0dc, 0, 0, 0.1, 0.5, 0);
  scene.add(edgeSpot, edgeSpot.target);

  // ---- The cup.
  const cup = new THREE.Group();
  {
    const H = CUP.h, rt = CUP.rTop, rb = CUP.rBot;
    const outer = [];
    for (let k = 0; k <= 12; k++) { const y = -H / 2 + (H * k) / 12; outer.push(new THREE.Vector2(rb + (rt - rb) * (k / 12), y)); }
    const leather = new THREE.MeshStandardMaterial({ color: 0x4a2819, roughness: 0.58, normalMap: leatherN, normalScale: new THREE.Vector2(0.7, 0.7) });
    const shell = new THREE.Mesh(new THREE.LatheGeometry(outer, 56), leather);
    shell.castShadow = true; cup.add(shell);
    const inner = outer.map(v => new THREE.Vector2(v.x - 0.32, v.y)).reverse();
    const lining = new THREE.MeshStandardMaterial({ color: 0x06120c, roughness: 1, side: THREE.DoubleSide });
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
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(rAt(by + bh / 2), rAt(by - bh / 2), bh, 24, 1, true, -30 * DEG - th / 2, th),
      new THREE.MeshStandardMaterial({ map: badge, transparent: true, alphaTest: 0.4, metalness: 0.55, roughness: 0.3 }));
    plate.position.y = by; cup.add(plate);
  }
  scene.add(cup);

  // ---- The dice.
  const dieGeo = dieGeometry(), pipGeo = pipGeometry();
  const pipMat = new THREE.MeshStandardMaterial({ color: 0xd2cec4, roughness: 0.5 });
  const dice = [0, 1].map(() => {
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xd21c36, roughness: 0.05, metalness: 0, transmission: 0.9, thickness: 1.5, ior: 1.49,
      attenuationColor: new THREE.Color(0x8a0818), attenuationDistance: 1.4,
      clearcoat: 1, clearcoatRoughness: 0.03, specularIntensity: 1, envMapIntensity: 1.25,
      emissive: new THREE.Color(0xff3212), emissiveIntensity: 0
    });
    const g = new THREE.Group();
    const body = new THREE.Mesh(dieGeo, mat); body.castShadow = true;
    const pips = new THREE.Mesh(pipGeo, pipMat);
    g.add(body, pips);
    const glow = new THREE.PointLight(0xff3a18, 0, 14, 2);
    g.add(glow);
    scene.add(g);
    return { g, mat, glow };
  });

  // ---- The stick (standard, hardways).
  let stick = null;
  if (plan.stick) {
    const hp = plan.stick.hp;
    const g = new THREE.Group();
    const curve = new THREE.CatmullRomCurve3(hp.curve.map(([a, b]) => new THREE.Vector3(a, 0, b)));
    const hook = new THREE.Mesh(new THREE.TubeGeometry(curve, 120, HOOK.cap, 10, false), wood);
    hook.castShadow = true; g.add(hook);
    const len = 160, lean = 11 * DEG;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, len, 14), wood);
    const attach = new THREE.Vector3(-HOOK.rc - 0.35, 0.2, HOOK.rc + 3.2);
    const dir = new THREE.Vector3(0, Math.sin(lean), Math.cos(lean));
    shaft.position.copy(attach).addScaledVector(dir, len / 2);
    shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    shaft.castShadow = true; g.add(shaft);
    const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.8, 16), new THREE.MeshStandardMaterial({ color: 0x8c6d34, metalness: 1, roughness: 0.45 }));
    ferrule.position.copy(attach).addScaledVector(dir, 1.2);
    ferrule.quaternion.copy(shaft.quaternion); g.add(ferrule);
    scene.add(g);
    stick = { g, hp };
  }

  // ---- The Vault Pull's pieces.
  let vault = null;
  if (plan.vault) {
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
  const DUST = 190, PUFF = 16, SPARK = plan.vault ? 180 : 0;
  const puffs = plan.run.events.filter(e => e.kind === 'felt' && e.speed > 70).slice(0, 10);
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
  const Rrel = W.real(P.RELEASE.t), Rwall = plan.wallReal, Rrest = plan.restReal;
  const endPos = plan.rest;
  // Framing the dice at rest: the camera turns (up to 18 degrees either
  // way) so the gap between them runs up the screen rather than across it
  // - a phone is tall and narrow - and stands back only as far as that
  // needs, for this screen's shape.
  const aspect = (host.clientWidth || window.innerWidth) / (host.clientHeight || window.innerHeight);
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
    [Rwall - 0.08, -22, 14, 31, 0],
    [W.slowHold[1], -58, 10, 27, 0]
  ];
  const R2 = w => W.real(w);
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
    pushKey([R2(plan.endW) + 2, -39, 63, D * 1.3, D * 0.25]);
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
  for (let k = turnFrom; k < keys.length; k++) keys[k][1] += dAz;
  const centroid = w => { const a = dicePose(plan, 0, w).p, b = dicePose(plan, 1, w).p; return mix3(a, b, 0.5); };
  const cupAim = t => { const c = cupAt(t); return [c.p[0], c.p[1] + 1, c.p[2]]; };
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
    return aim;
  };
  const CAM_DT = 1 / 120, camN = Math.ceil((plan.totalReal + 2) / CAM_DT) + 2;
  const camEye = new Float32Array(camN * 3), camAim = new Float32Array(camN * 3);
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
      e[1] = Math.max(e[1], 2.5);
      camEye.set(e, k * 3); camAim.set(A, k * 3);
    }
  }

  // ---- Timeline of sounds (real seconds).
  const sfx = [];
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
  sfx.sort((a, b) => a.t - b.t);

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
  call.className = `r3-call r3-call-${tier}`;
  if (tier === 'hardways') {
    const img = new Image();
    img.alt = plan.call[0];
    img.onerror = () => { call.textContent = plan.call[0]; call.classList.add('r3-call-text'); };
    img.src = asset(plan.values[0] === 1 ? 'rare/hardways-snake-eyes.png' : 'rare/hardways-boxcars.png');
    call.appendChild(img);
  } else if (plan.call) {
    call.innerHTML = `<span></span>${plan.call[1] ? '<small></small>' : ''}`;
    call.firstChild.textContent = plan.call[0];
    if (plan.call[1]) call.lastChild.textContent = plan.call[1];
  }
  const badgeEl = document.createElement('div');
  badgeEl.className = `r3-tier r3-tier-${tier}`;
  badgeEl.innerHTML = tier === 'standard' ? '' : `<span>${TIER_NAMES[tier]}</span><small>${TIER_ODDS[tier]}</small>`;
  const flashEl = document.createElement('div');
  flashEl.className = 'r3-flash';
  host.append(canvas, flashEl, call, badgeEl);
  undo.push(() => [flashEl, call, badgeEl].forEach(el => el.remove()));

  // ---- Post: bloom on the brightest glints.
  let composer = null, bloom = null;
  const size = () => {
    const w = host.clientWidth || window.innerWidth, h = host.clientHeight || window.innerHeight;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Narrow screens get a wider lens so the table still reads.
    camera.fov = w / h < 0.62 ? 42 : 34;
    camera.updateProjectionMatrix();
    if (composer) { composer.setPixelRatio(pixelRatio); composer.setSize(w, h); }
  };
  const makeComposer = () => {
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.35, 0.5, 1.35);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  };
  if (o.quality !== 'low') makeComposer();
  size();

  // ---- One frame at real time t.
  const setPose = (obj, p, q) => { obj.position.set(p[0], p[1], p[2]); obj.quaternion.set(q[0], q[1], q[2], q[3]); };
  const project = p => { const v = new THREE.Vector3(p[0], p[1], p[2]).project(camera); return [(v.x * 0.5 + 0.5) * host.clientWidth, (-v.y * 0.5 + 0.5) * host.clientHeight, v.z]; };
  const render = t => {
    const w = W.world(t);
    const rate = W.rateAt(t);
    // Camera.
    const f = Math.min(camN - 2, Math.max(0, t / CAM_DT)), k0 = Math.floor(f), u = f - k0;
    const eye = [0, 1, 2].map(j => lerp(camEye[k0 * 3 + j], camEye[(k0 + 1) * 3 + j], u));
    const aim = [0, 1, 2].map(j => lerp(camAim[k0 * 3 + j], camAim[(k0 + 1) * 3 + j], u));
    let shake = [0, 0, 0];
    if (plan.vault) {
      const x = w - plan.vault.boom;
      if (x > 0 && x < 0.8) { const a = 0.9 * Math.exp(-x / 0.14); shake = [a * Math.sin(x * 73), a * Math.sin(x * 61 + 1), a * Math.sin(x * 57 + 2)]; }
    }
    camera.position.set(eye[0] + shake[0], eye[1] + shake[1], eye[2] + shake[2]);
    camera.lookAt(aim[0], aim[1], aim[2]);
    camera.updateMatrixWorld();
    // The light behind the lens: brightest through the slow motion.
    const gleam = smoother((t - (Rwall - 0.2)) / 0.35) * (1 - smoother((t - W.slowHold[1]) / 0.7));
    const back = new THREE.Vector3(eye[0] - aim[0], eye[1] - aim[1], eye[2] - aim[2]).normalize();
    lensLight.position.set(eye[0] + back.x * 18, eye[1] + back.y * 18 + 14, eye[2] + back.z * 18);
    lensLight.target.position.set(aim[0], aim[1], aim[2]);
    lensLight.intensity = 0.6 + 1.7 * gleam;
    // Cup.
    const cp = cupAt(Math.min(w, 5));
    setPose(cup, cp.p, cp.q);
    cup.visible = w < P.RELEASE.t + 1.2;
    // Dice.
    const burst = plan.vault ? w - plan.vault.boom : -1;
    for (let i = 0; i < 2; i++) {
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
        const ih = P.DIE / 2 - P.DIE_ROUND;
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) low = Math.min(low, P.qrot(q, [sx * ih, sy * ih, sz * ih])[1]);
        pose = { p: [pose.p[0], P.DIE_ROUND - low, pose.p[2]], q };
      }
      setPose(d.g, pose.p, pose.q);
      const shown = w >= P.RELEASE.t - 0.07 && !(burst > 0.06);
      d.g.visible = shown;
      const s = burst > 0 ? 1 + burst * 5 : 1;
      d.g.scale.setScalar(s);
      d.mat.emissiveIntensity = glow * 0.8;
      d.glow.intensity = glow * 3.5;
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
    // Edge: the room goes dark round the pinned die as the lens closes in.
    if (plan.edge) {
      const e = dicePose(plan, plan.edge.die, w).p;
      const k = smoother((w - plan.edge.done) / 0.5);
      edgeSpot.position.set(e[0] - 6, e[1] + 60, e[2] + 8);
      edgeSpot.target.position.set(e[0], e[1], e[2]);
      edgeSpot.intensity = 7 * k;
      pendant.intensity = 2.8 * (1 - 0.8 * k);
      scene.environmentIntensity = 0.7 * (1 - 0.6 * k);
    }
    // Particles.
    let n = 0;
    const put = (p, c) => { pPos[n * 3] = p[0]; pPos[n * 3 + 1] = p[1]; pPos[n * 3 + 2] = p[2]; pCol[n * 3] = c[0]; pCol[n * 3 + 1] = c[1]; pCol[n * 3 + 2] = c[2]; n++; };
    const lightAxis = [0, -1, 0];
    for (const m of dust) {
      const p = [m.p[0] + m.v[0] * t + 1.2 * Math.sin(t * 0.5 + m.ph), m.p[1] + m.v[1] * t + 0.8 * Math.sin(t * 0.37 + m.ph * 2), m.p[2] + m.v[2] * t];
      const off = Math.hypot(p[0] - pendant.target.position.x * 0.9, p[2] - pendant.target.position.z * 0.9);
      const lit = Math.exp(-(off * off) / (2 * 26 * 26)) * (plan.edge ? 1 - 0.8 * smoother((w - plan.edge.done) / 0.5) : 1);
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
      const on = smoother((w - cw) / 0.45) * (1 - smoother((w - plan.revealW + 0.3) / 0.5));
      call.style.opacity = on.toFixed(3);
      if (on > 0) {
        // Over the higher of the two dice on screen, clear of both.
        const s = [0, 1].map(i => { const d = dicePose(plan, i, w).p; return project([d[0], d[1] + 2.5, d[2]]); }).sort((a, b) => a[1] - b[1])[0];
        const grow = 1.12 - 0.12 * smoother((w - cw) / 0.8);
        // (kept whole on screen, whatever the dice's spread)
        const half = (call.offsetWidth * grow) / 2 + 12, W0 = host.clientWidth;
        const cx = half * 2 < W0 ? Math.min(Math.max(s[0], half), W0 - half) : W0 / 2;
        const cy = Math.max(s[1] - 56, call.offsetHeight + 16);
        call.style.transform = `translate(${cx.toFixed(1)}px,${cy.toFixed(1)}px) translate(-50%,-50%) scale(${grow.toFixed(3)})`;
        call.style.setProperty('--shine', `${(-60 + 220 * clamp01((w - cw - 0.1) / 1.2)).toFixed(1)}%`);
      }
    }
    badgeEl.style.opacity = tier === 'standard' ? '0' : smoother((w - plan.callW - 0.2) / 0.6).toFixed(3);
    // Render.
    if (composer) {
      bloom.strength = 0.32 + 0.5 * gleam + (plan.vault ? 1.4 * Math.max(0, 1 - Math.max(0, burst) / 0.6) * (burst > 0 ? 1 : 0) : 0);
      composer.render();
    } else renderer.render(scene, camera);
    return { w, rate };
  };

  // ---- Playback.
  let raf = 0, t = 0, last = 0, playing = false, sfxIndex = 0, silenced = false;
  // Quality steps down while frames run slow (averaged over 24 frames):
  // 3 full; 2 no bloom, lower resolution; 1 no shadows, 1x resolution;
  // 0 the dice lose their glass (transmission renders the scene twice).
  let quality = composer ? 3 : 2, winFrames = 0, winTime = 0, frames = 0;
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
    if (q <= 0) dice.forEach(d => { d.mat.transmission = 0; d.mat.color.set(0x7a0c18); d.mat.needsUpdate = true; });
    size();
  };
  const scheduleSound = (from, to) => {
    if (!sound || !sound.on) return;
    const now = sound.ctx.currentTime;
    if (!sound.bed && !plan.edge) sound.ambience(now);
    if (plan.edge && !sound.bed && t < R2(plan.silence[0])) sound.ambience(now);
    while (sfxIndex < sfx.length && sfx[sfxIndex].t < to) {
      const ev = sfx[sfxIndex++];
      if (ev.t < from - 0.05) continue;
      sound.play(ev, now + Math.max(0, ev.t - from), ev.rate || 1);
    }
    if (plan.edge && !silenced && to >= R2(plan.silence[0])) { silenced = true; sound.cut(now + Math.max(0, R2(plan.silence[0]) - from)); }
  };
  const loop = now => {
    if (!playing) return;
    // Reduced motion switched on mid-shot (in the app or the system): the
    // finished frame, at once, as when it was on from the start.
    if (o.motionOff && o.motionOff()) { playing = false; if (o.onEnd) o.onEnd(); return; }
    const raw = last ? (now - last) / 1000 : 1 / 60;
    last = now;
    // Time runs with the clock (a slow device drops frames rather than
    // stretching the shot); only a stall - a hidden tab - is held back.
    const dt = Math.min(raw, 0.1);
    const t0 = t;
    t += dt;
    // (the first frames are skipped: they carry texture uploads)
    frames++;
    // (nor the frame after the tab was hidden: that gap is the tab, not the
    // device, and must not cost quality or end the shot)
    const stall = resumed; resumed = false;
    if (frames > 3 && o.quality !== 'full' && !stall) { winFrames++; winTime += raw; }
    const avg = winFrames ? winTime / winFrames : 0;
    if (o.quality !== 'full' && !stall && ((winFrames >= 8 && avg > 0.036) || (frames > 3 && raw > 0.25))) {
      if (quality > 0) { applyQuality(--quality); winFrames = 0; winTime = 0; }
      // Still a slideshow at the lowest setting: show the finished frame
      // instead (as with motion off) rather than stutter through the shot.
      else if (winFrames >= 6 && avg > 0.12) { playing = false; if (o.onEnd) o.onEnd(); return; }
    }
    scheduleSound(t0, t + 0.1);
    if (t >= plan.totalReal) { t = plan.totalReal; render(t); playing = false; if (o.onEnd) o.onEnd(); return; }
    render(t);
    if (!revealed && t >= plan.revealReal) { revealed = true; if (o.onReveal) o.onReveal(); }
    raf = requestAnimationFrame(loop);
  };
  let revealed = false;
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

  // Shaders compiled up front (in parallel where the driver can), so the
  // shot does not hitch on its first frames.
  try { await renderer.compileAsync(scene, camera); } catch (e) { /* compiled on first draw */ }
  checkAbort();
  render(0);
  return {
    plan: { tier, seed: o.seed, revealReal: plan.revealReal, totalReal: plan.totalReal, restReal: plan.restReal, wallReal: plan.wallReal, values: plan.values, call: plan.call, throwOk: plan.throwOk, why: plan.why },
    play() { playing = true; last = 0; raf = requestAnimationFrame(loop); },
    seek(time) { playing = false; cancelAnimationFrame(raf); t = Math.max(0, Math.min(plan.totalReal, time)); render(t); },
    finish() { playing = false; cancelAnimationFrame(raf); t = plan.totalReal; render(t); soundBtn.hidden = true; if (sound && sound.bed) sound.cut(sound.ctx.currentTime); },
    dispose: teardown
  };
}
