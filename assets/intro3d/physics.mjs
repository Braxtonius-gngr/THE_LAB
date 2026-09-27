// The roll intro's physics: a small rigid-body simulator for the dice (and
// the Vault Pull's plaques), run once before the shot plays and recorded,
// so every frame of the intro is a lookup - the same throw however fast the
// device draws, and any moment can be shown on its own (?lab seeking).
//
// Units are centimetres and seconds, y up. The felt is the plane y = 0; the
// throw runs toward -z and strikes the table's back wall at z = TABLE.wallZ.
// Bodies are rounded boxes: an inner box grown by a ball of radius `rr`, so
// they touch the world through spheres at their inner corners and roll over
// their edges like real dice. Contacts are resolved with sequential impulses
// (restitution and Coulomb friction), positions are corrected for any
// penetration left over, and bodies at rest are put to sleep.
//
// Pure JavaScript with no dependencies, so it also runs under Node (the
// probes in the PR test it there).

export const G = 981;
export const DIE = 1.9;               // casino die edge, cm
export const DIE_ROUND = 0.2;         // radius of its rounded edges, cm
// A strike must land on the rubber, not the rail above it: the die's
// centre at least this far below the wall's top (a die is 1.9 cm).
const P_WALL_MARGIN = 1.1;
export const TABLE = {
  wallZ: -70,                         // back wall (rubber pyramids), facing +z
  wallTop: 17,                        // its height; the padded rail sits on top
  sideX: 52,                          // side rails at x = +/- sideX
  nearZ: 90                           // the thrower's end
};
const STEP = 1 / 1000;                // simulation step, s
const REC_EVERY = 4;                  // record every 4th step (250 Hz)

// ---- Small vector and quaternion helpers (arrays; q = [x, y, z, w]) ----
export function qmul(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
  ];
}
export function qconj(q) { return [-q[0], -q[1], -q[2], q[3]]; }
export function qnorm(q) { const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]; }
export function qaxis(axis, ang) {
  const l = Math.hypot(axis[0], axis[1], axis[2]) || 1, s = Math.sin(ang / 2) / l;
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(ang / 2)];
}
export function qrot(q, v) {
  // v + 2w(u x v) + 2 u x (u x v)
  const x = q[0], y = q[1], z = q[2], w = q[3];
  const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}
export function qslerp(a, b, t) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let bb = b;
  if (d < 0) { d = -d; bb = [-b[0], -b[1], -b[2], -b[3]]; }
  if (d > 0.9995) return qnorm([a[0] + (bb[0] - a[0]) * t, a[1] + (bb[1] - a[1]) * t, a[2] + (bb[2] - a[2]) * t, a[3] + (bb[3] - a[3]) * t]);
  const th = Math.acos(d), s = Math.sin(th), ka = Math.sin((1 - t) * th) / s, kb = Math.sin(t * th) / s;
  return [a[0] * ka + bb[0] * kb, a[1] * ka + bb[1] * kb, a[2] * ka + bb[2] * kb, a[3] * ka + bb[3] * kb];
}
// The rotation taking unit vector a onto unit vector b.
export function qfromto(a, b) {
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  if (d < -0.99999) {
    const ax = Math.abs(a[0]) < 0.9 ? [0, -a[2], a[1]] : [-a[1], a[0], 0];
    return qaxis(ax, Math.PI);
  }
  return qnorm([a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0], 1 + d]);
}
function rows(q) {
  const [x, y, z, w] = q;
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
    2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
    2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)
  ];
}

// A seeded random source (mulberry32): one seed, one throw.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- Bodies ----
export function makeBody(kind, hx, hy, hz, rr, mass) {
  // Solid box inertia (the rounding barely changes it).
  const ix = mass * (4 * (hy * hy + hz * hz)) / 12, iy = mass * (4 * (hx * hx + hz * hz)) / 12, iz = mass * (4 * (hx * hx + hy * hy)) / 12;
  const ih = [hx - rr, hy - rr, hz - rr];
  // Sample points on the inner box (spheres of radius rr): its corners, the
  // middles of its edges and faces - so an edge meeting an edge or a face
  // is felt, not only a corner meeting a face.
  const pts = [];
  for (const sx of [-1, 0, 1]) for (const sy of [-1, 0, 1]) for (const sz of [-1, 0, 1]) {
    const nz = (sx !== 0) + (sy !== 0) + (sz !== 0);
    if (nz >= 2) pts.push([sx * ih[0], sy * ih[1], sz * ih[2]]);
  }
  // Long edges (a plaque's) get extra points along them.
  for (let a = 0; a < 3; a++) {
    const len = 2 * ih[a];
    const n = Math.floor(len / 1.2);
    if (n < 2) continue;
    const b = (a + 1) % 3, c = (a + 2) % 3;
    for (let k = 1; k < n; k++) {
      const u = -ih[a] + (len * k) / n;
      if (Math.abs(u) < 1e-6) continue;
      for (const sb of [-1, 1]) for (const sc of [-1, 1]) {
        const p = [0, 0, 0]; p[a] = u; p[b] = sb * ih[b]; p[c] = sc * ih[c]; pts.push(p);
      }
    }
  }
  const corners = pts.filter(p => Math.abs(Math.abs(p[0]) - ih[0]) < 1e-6 && Math.abs(Math.abs(p[1]) - ih[1]) < 1e-6 && Math.abs(Math.abs(p[2]) - ih[2]) < 1e-6);
  return {
    kind, h: [hx, hy, hz], ih, rr, invM: 1 / mass, invI: [1 / ix, 1 / iy, 1 / iz],
    pts, corners,
    p: [0, 0, 0], q: [0, 0, 0, 1], v: [0, 0, 0], w: [0, 0, 0],
    sleep: false, still: 0, active: true
  };
}

// The world inverse inertia applied to a vector: R Ib^-1 R^T v.
function invIw(b, R, v) {
  const lx = R[0] * v[0] + R[3] * v[1] + R[6] * v[2];
  const ly = R[1] * v[0] + R[4] * v[1] + R[7] * v[2];
  const lz = R[2] * v[0] + R[5] * v[1] + R[8] * v[2];
  const ax = lx * b.invI[0], ay = ly * b.invI[1], az = lz * b.invI[2];
  return [R[0] * ax + R[1] * ay + R[2] * az, R[3] * ax + R[4] * ay + R[5] * az, R[6] * ax + R[7] * ay + R[8] * az];
}
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

// The static world: felt, back wall (rubber pyramids: livelier, and each
// strike leaves at a slightly random angle), side rails and the near end.
function planes(opts) {
  return [
    { n: [0, 1, 0], d: 0, e: 0.34, mu: 0.5, kind: 'felt' },
    { n: [0, 0, 1], d: TABLE.wallZ, e: 0.42, mu: 0.3, kind: 'wall', jitter: opts.wallJitter == null ? 0.12 : opts.wallJitter },
    { n: [1, 0, 0], d: -TABLE.sideX, e: 0.45, mu: 0.3, kind: 'rail' },
    { n: [-1, 0, 0], d: -TABLE.sideX, e: 0.45, mu: 0.3, kind: 'rail' },
    { n: [0, 0, -1], d: -TABLE.nearZ, e: 0.45, mu: 0.3, kind: 'rail' }
  ];
}

// One simulation run. `bodies` are set up by the caller (positions,
// velocities); `kinematic(t)` optionally returns moving capsules (the
// stick's hook) as { pts: [[x,y,z]...], r, v: [vx,vy,vz] } at world time t.
// Returns the recorded track, impact events and rest times.
export function simulate(bodies, opts) {
  const o = Object.assign({ t0: 0, duration: 4, rand: Math.random, kinematic: null, until: null, onStep: null }, opts || {});
  const world = planes(o);
  const n = bodies.length;
  const frames = Math.ceil(o.duration / STEP / REC_EVERY) + 1;
  const track = bodies.map(() => new Float32Array(frames * 7));
  const events = [];
  const restAt = bodies.map(() => null);
  const firstHit = bodies.map(() => null);
  const lastSound = bodies.map(() => -1);
  let t = o.t0, rec = 0;
  const record = () => {
    for (let i = 0; i < n; i++) {
      const b = bodies[i], a = track[i], k = rec * 7;
      a[k] = b.p[0]; a[k + 1] = b.p[1]; a[k + 2] = b.p[2];
      a[k + 3] = b.q[0]; a[k + 4] = b.q[1]; a[k + 5] = b.q[2]; a[k + 6] = b.q[3];
    }
    rec++;
  };
  record();
  const steps = Math.round(o.duration / STEP);
  for (let s = 1; s <= steps; s++) {
    t = o.t0 + s * STEP;
    if (o.onStep) o.onStep(t, bodies);
    const R = bodies.map(b => rows(b.q));
    for (const b of bodies) if (b.active && !b.sleep) b.v[1] -= G * STEP;
    // Contacts: body vs world planes, body vs body, body vs moving capsules.
    const contacts = [];
    const kin = o.kinematic ? o.kinematic(t) : null;
    for (let i = 0; i < n; i++) {
      const b = bodies[i];
      if (!b.active) continue;
      const Ri = R[i];
      for (const c of b.corners) {
        const P = [b.p[0] + Ri[0] * c[0] + Ri[1] * c[1] + Ri[2] * c[2], b.p[1] + Ri[3] * c[0] + Ri[4] * c[1] + Ri[5] * c[2], b.p[2] + Ri[6] * c[0] + Ri[7] * c[1] + Ri[8] * c[2]];
        for (const w of world) {
          const dist = dot(w.n, P) - w.d - b.rr;
          if (dist < 0) contacts.push({ a: i, b: -1, n: w.n, pt: [P[0] - w.n[0] * b.rr, P[1] - w.n[1] * b.rr, P[2] - w.n[2] * b.rr], pen: -dist, e: w.e, mu: w.mu, kind: w.kind, jitter: w.jitter || 0 });
        }
      }
      if (kin && kin.pts.length) {
        for (const q of kin.pts) {
          const c = boxPoint(b, Ri, q, kin.r);
          if (c) contacts.push({ a: i, b: -2, n: c.n, pt: c.pt, pen: c.pen, e: 0.1, mu: 0.25, kind: 'stick', kv: kin.v });
        }
      }
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      if (i === j || !bodies[i].active || !bodies[j].active) continue;
      const A = bodies[i], B = bodies[j];
      const dx = A.p[0] - B.p[0], dy = A.p[1] - B.p[1], dz = A.p[2] - B.p[2];
      const reach = Math.hypot(A.h[0], A.h[1], A.h[2]) + Math.hypot(B.h[0], B.h[1], B.h[2]);
      if (dx * dx + dy * dy + dz * dz > reach * reach) continue;
      // A's sample spheres against B's rounded box: contact normal from B
      // toward A.
      const Ra = R[i];
      for (const c of A.pts) {
        const P = [A.p[0] + Ra[0] * c[0] + Ra[1] * c[1] + Ra[2] * c[2], A.p[1] + Ra[3] * c[0] + Ra[4] * c[1] + Ra[5] * c[2], A.p[2] + Ra[6] * c[0] + Ra[7] * c[1] + Ra[8] * c[2]];
        const hit = boxPoint(B, R[j], P, A.rr);
        if (hit) contacts.push({ a: i, b: j, n: [-hit.n[0], -hit.n[1], -hit.n[2]], pt: [P[0] + hit.n[0] * A.rr, P[1] + hit.n[1] * A.rr, P[2] + hit.n[2] * A.rr], pen: hit.pen, e: 0.45, mu: 0.3, kind: 'body' });
      }
    }
    // Wake anything struck hard.
    solve(bodies, R, contacts, o.rand, t, events, lastSound, firstHit);
    // Integrate.
    for (let i = 0; i < n; i++) {
      const b = bodies[i];
      if (!b.active || b.sleep) continue;
      b.p[0] += b.v[0] * STEP; b.p[1] += b.v[1] * STEP; b.p[2] += b.v[2] * STEP;
      const w = b.w;
      const dq = qmul([w[0], w[1], w[2], 0], b.q);
      b.q = qnorm([b.q[0] + 0.5 * STEP * dq[0], b.q[1] + 0.5 * STEP * dq[1], b.q[2] + 0.5 * STEP * dq[2], b.q[3] + 0.5 * STEP * dq[3]]);
    }
    // Leftover penetration: moved out along the contact normal.
    for (const c of contacts) {
      const pen = c.pen - 0.005;
      if (pen <= 0) continue;
      const A = bodies[c.a], B = c.b >= 0 ? bodies[c.b] : null;
      const wa = A.sleep ? 0 : A.invM, wb = B && !B.sleep ? B.invM : 0;
      if (wa + wb === 0) continue;
      const k = (pen * 0.5) / (wa + wb);
      A.p[0] += c.n[0] * k * wa; A.p[1] += c.n[1] * k * wa; A.p[2] += c.n[2] * k * wa;
      if (B) { B.p[0] -= c.n[0] * k * wb; B.p[1] -= c.n[1] * k * wb; B.p[2] -= c.n[2] * k * wb; }
    }
    // Felt drags at anything resting on it (a die on cloth stops quickly);
    // a body barely moving for a moment goes to sleep. Resting means held
    // up: by the felt, or by another body underneath it (the contact's
    // normal pointing up) - not merely touching another body in the air.
    for (let i = 0; i < n; i++) {
      const b = bodies[i];
      if (!b.active || b.sleep) continue;
      const onFelt = contacts.some(c => c.a === i && (c.kind === 'felt' || (c.kind === 'body' && c.n[1] > 0.6)));
      if (onFelt) {
        const k = Math.exp(-1.3 * STEP), kl = Math.exp(-0.5 * STEP);
        b.w[0] *= k; b.w[1] *= Math.exp(-6 * STEP); b.w[2] *= k;
        b.v[0] *= kl; b.v[2] *= kl;
      }
      const slow = Math.hypot(b.v[0], b.v[1], b.v[2]) < 1.2 && Math.hypot(b.w[0], b.w[1], b.w[2]) < 0.9;
      b.still = onFelt && slow ? b.still + STEP : 0;
      if (b.still > 0.12 && !kin) {
        b.sleep = true; b.v = [0, 0, 0]; b.w = [0, 0, 0];
        if (restAt[i] == null) restAt[i] = t;
      }
    }
    if (s % REC_EVERY === 0) record();
    if (o.until && o.until(t, bodies, restAt, firstHit)) {
      // Stop early: pad the track with the last pose.
      while (rec < frames) record();
      break;
    }
  }
  while (rec < frames) record();
  return { t0: o.t0, dt: STEP * REC_EVERY, frames, track, events, restAt, firstHit, bodies };
}

// A sphere at world point P (radius r) against body B's rounded box. Null if
// apart; otherwise the normal pointing from B out toward P, the contact
// point on B's surface and the depth.
function boxPoint(B, R, P, r) {
  const dx = P[0] - B.p[0], dy = P[1] - B.p[1], dz = P[2] - B.p[2];
  const l = [R[0] * dx + R[3] * dy + R[6] * dz, R[1] * dx + R[4] * dy + R[7] * dz, R[2] * dx + R[5] * dy + R[8] * dz];
  const ih = B.ih;
  const reach = B.rr + r;
  if (Math.abs(l[0]) > ih[0] + reach || Math.abs(l[1]) > ih[1] + reach || Math.abs(l[2]) > ih[2] + reach) return null;
  const cl = [Math.max(-ih[0], Math.min(ih[0], l[0])), Math.max(-ih[1], Math.min(ih[1], l[1])), Math.max(-ih[2], Math.min(ih[2], l[2]))];
  const d = [l[0] - cl[0], l[1] - cl[1], l[2] - cl[2]];
  let len = Math.hypot(d[0], d[1], d[2]);
  let nl;
  if (len > 1e-6) {
    if (len >= reach) return null;
    nl = [d[0] / len, d[1] / len, d[2] / len];
  } else {
    // Inside the inner box: out through the nearest face.
    let best = 0, gap = Infinity;
    for (let a = 0; a < 3; a++) { const g = ih[a] - Math.abs(l[a]); if (g < gap) { gap = g; best = a; } }
    nl = [0, 0, 0]; nl[best] = l[best] >= 0 ? 1 : -1;
    len = -gap;
  }
  const n = [R[0] * nl[0] + R[1] * nl[1] + R[2] * nl[2], R[3] * nl[0] + R[4] * nl[1] + R[5] * nl[2], R[6] * nl[0] + R[7] * nl[1] + R[8] * nl[2]];
  const cw = [B.p[0] + R[0] * cl[0] + R[1] * cl[1] + R[2] * cl[2], B.p[1] + R[3] * cl[0] + R[4] * cl[1] + R[5] * cl[2], B.p[2] + R[6] * cl[0] + R[7] * cl[1] + R[8] * cl[2]];
  return { n: [-n[0], -n[1], -n[2]], nOut: n, pt: [cw[0] + n[0] * B.rr, cw[1] + n[1] * B.rr, cw[2] + n[2] * B.rr], pen: reach - len };
}

// Sequential impulses. Normals point from the other side (b) toward a.
function solve(bodies, R, contacts, rand, t, events, lastSound, firstHit) {
  if (!contacts.length) return;
  for (const c of contacts) {
    const A = bodies[c.a];
    c.ra = [c.pt[0] - A.p[0], c.pt[1] - A.p[1], c.pt[2] - A.p[2]];
    if (c.b >= 0) { const B = bodies[c.b]; c.rb = [c.pt[0] - B.p[0], c.pt[1] - B.p[1], c.pt[2] - B.p[2]]; }
    // Rubber pyramids: the wall's normal tips a little at random each time.
    if (c.jitter) {
      const j = c.jitter;
      c.n = normalize([c.n[0] + (rand() - 0.5) * 2 * j, c.n[1] + (rand() - 0.5) * 2 * j * 0.6, c.n[2]]);
    }
    const vn = dot(relVel(bodies, c), c.n);
    c.bias = vn < -18 ? -c.e * vn : 0;
    c.acc = 0; c.accT = [0, 0, 0];
    c.vn0 = vn;
    // Wake a sleeping body hit by something moving.
    // (a pinned body - `fixed` - never wakes)
    if (vn < -6) {
      if (!A.fixed) { A.sleep = false; A.still = 0; }
      if (c.b >= 0 && !bodies[c.b].fixed) { bodies[c.b].sleep = false; bodies[c.b].still = 0; }
    }
  }
  for (let it = 0; it < 8; it++) {
    for (const c of contacts) {
      const A = bodies[c.a], B = c.b >= 0 ? bodies[c.b] : null;
      if (A.sleep && (!B || B.sleep)) continue;
      const Ra = R[c.a], Rb = B ? R[c.b] : null;
      const vr = relVel(bodies, c);
      const vn = dot(vr, c.n);
      const kn = effMass(A, Ra, c.ra, c.n) + (B ? effMass(B, Rb, c.rb, c.n) : 0);
      let jn = (c.bias - vn) / kn;
      const acc = Math.max(c.acc + jn, 0);
      jn = acc - c.acc; c.acc = acc;
      apply(A, Ra, c.ra, c.n, jn);
      if (B) apply(B, Rb, c.rb, c.n, -jn);
      // Friction, against the sliding velocity, up to mu times the normal push.
      const vr2 = relVel(bodies, c);
      const vn2 = dot(vr2, c.n);
      const vt = [vr2[0] - vn2 * c.n[0], vr2[1] - vn2 * c.n[1], vr2[2] - vn2 * c.n[2]];
      const vtl = Math.hypot(vt[0], vt[1], vt[2]);
      if (vtl > 1e-5) {
        const tdir = [vt[0] / vtl, vt[1] / vtl, vt[2] / vtl];
        const kt = effMass(A, Ra, c.ra, tdir) + (B ? effMass(B, Rb, c.rb, tdir) : 0);
        const jt = -vtl / kt;
        let nt = [c.accT[0] + tdir[0] * jt, c.accT[1] + tdir[1] * jt, c.accT[2] + tdir[2] * jt];
        const ntl = Math.hypot(nt[0], nt[1], nt[2]), lim = c.mu * c.acc;
        if (ntl > lim) nt = [nt[0] * lim / ntl, nt[1] * lim / ntl, nt[2] * lim / ntl];
        const d = [nt[0] - c.accT[0], nt[1] - c.accT[1], nt[2] - c.accT[2]];
        c.accT = nt;
        applyV(A, Ra, c.ra, d, 1);
        if (B) applyV(B, Rb, c.rb, d, -1);
      }
    }
  }
  // Impacts worth a sound (and the first touch of each body).
  for (const c of contacts) {
    if (c.vn0 < -12 && c.acc > 0) {
      if (firstHit[c.a] == null) firstHit[c.a] = { t, kind: c.kind, pt: c.pt.slice() };
      if (t - lastSound[c.a] > 0.03) {
        lastSound[c.a] = t;
        events.push({ t, body: c.a, other: c.b, kind: c.kind, speed: -c.vn0, pt: c.pt.slice() });
      }
    }
  }
}
function normalize(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
function relVel(bodies, c) {
  const A = bodies[c.a];
  const va = [A.v[0] + A.w[1] * c.ra[2] - A.w[2] * c.ra[1], A.v[1] + A.w[2] * c.ra[0] - A.w[0] * c.ra[2], A.v[2] + A.w[0] * c.ra[1] - A.w[1] * c.ra[0]];
  if (c.b >= 0) {
    const B = bodies[c.b];
    va[0] -= B.v[0] + B.w[1] * c.rb[2] - B.w[2] * c.rb[1];
    va[1] -= B.v[1] + B.w[2] * c.rb[0] - B.w[0] * c.rb[2];
    va[2] -= B.v[2] + B.w[0] * c.rb[1] - B.w[1] * c.rb[0];
  } else if (c.kv) {
    va[0] -= c.kv[0]; va[1] -= c.kv[1]; va[2] -= c.kv[2];
  }
  return va;
}
function effMass(b, R, r, n) {
  if (b.sleep) return 0;
  const rn = cross(r, n);
  return b.invM + dot(cross(invIw(b, R, rn), r), n);
}
function apply(b, R, r, n, j) { applyV(b, R, r, [n[0] * j, n[1] * j, n[2] * j], 1); }
function applyV(b, R, r, J, sign) {
  if (b.sleep) return;
  b.v[0] += sign * J[0] * b.invM; b.v[1] += sign * J[1] * b.invM; b.v[2] += sign * J[2] * b.invM;
  const dw = invIw(b, R, cross(r, J));
  b.w[0] += sign * dw[0]; b.w[1] += sign * dw[1]; b.w[2] += sign * dw[2];
}

// ---- Playback ----
// Pose of body i at world time t: position and orientation, interpolated
// between recorded frames.
export function poseAt(run, i, t) {
  const f = Math.max(0, Math.min(run.frames - 1, (t - run.t0) / run.dt));
  const k0 = Math.floor(f), k1 = Math.min(run.frames - 1, k0 + 1), u = f - k0;
  const a = run.track[i];
  const o0 = k0 * 7, o1 = k1 * 7;
  const p = [a[o0] + (a[o1] - a[o0]) * u, a[o0 + 1] + (a[o1 + 1] - a[o0 + 1]) * u, a[o0 + 2] + (a[o1 + 2] - a[o0 + 2]) * u];
  const q = qslerp([a[o0 + 3], a[o0 + 4], a[o0 + 5], a[o0 + 6]], [a[o1 + 3], a[o1 + 4], a[o1 + 5], a[o1 + 6]], u);
  return { p, q };
}

// ---- The throw ----
// Dice leave the cup at `release` (world time), fly the length of the
// table, strike the back wall, drop to the felt and tumble to rest. Each
// session draws throws from its seed until one passes the checks: both
// dice hit the wall first, in the air; they end apart, face-up (not
// cocked) and inside the shot; and they settle in good time.
export const RELEASE = { pos: [0, 13, 44], t: 1.62 };
export function makeDice() {
  return [0, 1].map(() => makeBody('die', DIE / 2, DIE / 2, DIE / 2, DIE_ROUND, 1));
}
// One throw from its own seed: the same seed always gives the same throw.
export function simThrow(seed, opts) {
  const rand = rng(seed);
  const dice = makeDice();
  const vz = -(300 + 70 * rand()), vy = 150 + 70 * rand();
  const aim = (rand() - 0.5) * 36;           // across the table, cm/s
  dice.forEach((d, i) => {
    const side = i ? 1 : -1;
    d.p = [RELEASE.pos[0] + side * 1.25 + (rand() - 0.5) * 0.4, RELEASE.pos[1] + (i ? 0.9 : -0.2), RELEASE.pos[2] + (rand() - 0.5) * 0.8];
    d.v = [aim + side * (1 + 6 * rand()), vy + (rand() - 0.5) * 16, vz + (rand() - 0.5) * 24];
    d.q = qnorm([rand() - 0.5, rand() - 0.5, rand() - 0.5, rand() - 0.5]);
    const ax = normalize([rand() - 0.5, rand() - 0.5, rand() - 0.5]), spin = 14 + 22 * rand();
    d.w = [ax[0] * spin, ax[1] * spin, ax[2] * spin];
  });
  const launch = dice.map(d => ({ p: d.p.slice(), v: d.v.slice(), q: d.q.slice(), w: d.w.slice() }));
  const run = simulate(dice, Object.assign({
    t0: RELEASE.t, duration: 4.2, rand,
    // (a throw whose dice touch anything before the wall is no use: stop it
    // there rather than simulate the rest)
    until: (t, b, rest, first) => (first && first.some(h => h && h.kind !== 'wall')) || (rest[0] != null && rest[1] != null && t > (Math.max(rest[0], rest[1]) + 0.05))
  }, opts || {}));
  run.launch = launch;
  run.seed = seed;
  return run;
}
// Throws drawn from the session's seed until one passes the checks (and
// `extra`, the caller's own, e.g. that the stick can reach both dice).
// Gives up after `tries` throws or `budgetMs` of work, whichever comes
// first; the caller must check `score.ok` (the best failure is returned
// only so it can be reported).
// The search, one attempt per step. The budget counts only the time spent
// simulating, so the same seed finds the same throw whether it is run in
// one go (throwDice) or with pauses between attempts (throwDiceAsync).
function* throwSearch(seed, opts) {
  const o = Object.assign({ tries: 60, extra: null, budgetMs: Infinity }, opts || {});
  const r = rng(seed);
  let spent = 0;
  let best = null;
  for (let attempt = 0; attempt < o.tries && (attempt === 0 || spent < o.budgetMs); attempt++) {
    const t0 = Date.now();
    const run = simThrow(Math.floor(r() * 4294967296));
    const score = judge(run);
    if (o.extra) { const why = o.extra(run); if (why) { score.ok = false; score.why.push(why); } else score.score += 2; }
    spent += Date.now() - t0;
    if (!best || score.score > best.score.score) best = { run, score, attempt };
    if (score.ok) break;
    yield;
  }
  return best;
}
export function throwDice(seed, opts) {
  const it = throwSearch(seed, opts);
  let step = it.next();
  while (!step.done) step = it.next();
  return step.value;
}
// The same search, handing the main thread back every ~30 ms so the page
// keeps painting and taking input (and its fallback timer can fire) while a
// hard seed is searched. signal (an AbortSignal) stops it between attempts.
export async function throwDiceAsync(seed, opts, signal) {
  const it = throwSearch(seed, opts);
  let slice = Date.now();
  let step = it.next();
  while (!step.done) {
    if (Date.now() - slice > 30) {
      await new Promise(res => setTimeout(res, 0));
      if (signal && signal.aborted) throw new Error('intro cancelled');
      slice = Date.now();
    }
    step = it.next();
  }
  return step.value;
}
function judge(run) {
  const why = [];
  let score = 0;
  const dice = run.bodies;
  run.firstHit.forEach((h, i) => {
    if (!h || h.kind !== 'wall') why.push(`die ${i} first hit ${h ? h.kind : 'nothing'}`); else score += 2;
    if (h && h.kind === 'wall' && (h.pt[1] < 1.5 || h.pt[1] > TABLE.wallTop - P_WALL_MARGIN)) why.push(`die ${i} wall hit at y ${h.pt[1].toFixed(1)}`); else score += 1;
  });
  const rest = run.restAt;
  if (rest.some(r => r == null)) { why.push('not at rest'); score -= 5; }
  else if (Math.max(...rest) - RELEASE.t > 3.4) { why.push('slow to settle'); score -= 1; }
  else score += 2;
  const end = dice.map(d => d.p);
  end.forEach((p, i) => {
    if (p[2] < TABLE.wallZ + 3 || p[2] > -8 || Math.abs(p[0]) > 24) why.push(`die ${i} rests at ${p[0].toFixed(0)},${p[2].toFixed(0)}`); else score += 1;
  });
  const sep = Math.hypot(end[0][0] - end[1][0], end[0][2] - end[1][2]);
  if (sep < 3.2 || sep > 26) why.push(`dice ${sep.toFixed(1)} cm apart`); else score += 1;
  dice.forEach((d, i) => {
    const up = upAxis(d.q);
    if (up.align < 0.995) why.push(`die ${i} cocked (${up.align.toFixed(3)})`); else score += 1;
  });
  return { ok: why.length === 0, why, score };
}

// Which body axis points up, and how squarely (1 = flat on a face).
export function upAxis(q) {
  const axes = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  let best = null;
  for (const a of axes) {
    const w = qrot(q, a);
    if (!best || w[1] > best.align) best = { axis: a, align: w[1] };
  }
  return best;
}

// ---- Outcomes ----
// A die is a cube, so turning its markings by one of the cube's 24
// symmetries changes nothing about how it moves: the physics is untouched
// and only the numbers change. The face showing a value is picked this way
// for each die after the throw is known - the dice tumble naturally and land
// on the numbers the tier calls for.
// Faces in the die's own frame: 1 opposite 6, 2 opposite 5, 3 opposite 4,
// with 1, 2 and 3 running counterclockwise round their corner.
export const FACES = { 1: [0, 1, 0], 6: [0, -1, 0], 2: [0, 0, 1], 5: [0, 0, -1], 3: [1, 0, 0], 4: [-1, 0, 0] };
export const CUBE_ROTATIONS = (() => {
  const out = [];
  for (const a of [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]]) {
    const base = qfromto([0, 1, 0], a);
    for (let k = 0; k < 4; k++) out.push(qnorm(qmul(qaxis(a, (k * Math.PI) / 2), base)));
  }
  return out;
})();
// The marking turn S (applied in the die's own frame: shown = q * S) that
// puts `value` on top of a die resting at orientation q.
export function markingFor(q, value, rand) {
  const upBody = upAxis(q).axis;
  const target = FACES[value];
  const fits = CUBE_ROTATIONS.filter(S => {
    const v = qrot(S, target);
    return Math.abs(v[0] - upBody[0]) + Math.abs(v[1] - upBody[1]) + Math.abs(v[2] - upBody[2]) < 1e-6;
  });
  return fits[Math.floor((rand ? rand() : Math.random()) * fits.length) % fits.length];
}
export function valueUp(q) {
  let best = null;
  for (const [v, n] of Object.entries(FACES)) {
    const w = qrot(q, n);
    if (!best || w[1] > best.y) best = { v: +v, y: w[1] };
  }
  return best.v;
}
