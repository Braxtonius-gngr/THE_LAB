// FLESH: the secondary motion of a man's anatomy under his cloth (the lab's
// men - figure.mjs `build`). It's a small mass on a short root, so it is
// simulated as such, not keyed:
//   - two particles: the mass of the sac (the lobes in it) and the tip of
//     the shaft, each held to its root by a rod (the root is fixed to the
//     skin of the pelvis, so it goes wherever he goes, in any orientation)
//   - a soft spring pulling each toward where it rests on the body, gravity
//     pulling it down - so it hangs, lags behind a move, swings back and
//     settles (realistic: about a second to settle)
//   - collisions: it is pushed aside by the thighs (capsules hip -> knee),
//     held off the belly, and laid on a seat or the floor
//   - the lobes ride on the sac with their own small lag, so a jolt shows
//     in them a beat after the body
// Looseness: the anatomy's own `sway` (the dev overlay's Sway slider) -
// higher is looser. Rest bias: an angle forward off the body's down that
// the tissue prefers (the lab's Rest angle).
// Each step it publishes the swing vector (`fig.userData.swing`, the hips'
// own frame and units): how far the mass and the tip are off their rest, and
// the mass's velocity against the body. The cloth reads it (cloth.mjs: the
// fitted brief trails it, the loose pieces are pushed by what passes their
// drape gap); nothing here reads the cloth.
import * as THREE from '../vendor/three/three.module.js';

const GRAV = 980;                  // cm/s^2, down
const STEP = 1 / 240;              // the simulation's step
// the tissue's hold toward its rest, as an acceleration per unit of the
// chord it has swung through (so a long one is no stiffer than a short one),
// and its damping, at sway 1. Below gravity (980), so a man turned upside
// down lets it fall; enough, with the cloth's hold, to keep a jog from
// throwing it about.
const K = 640, C = 9;
// (the cloth's hold: an upright man's never swings further than this from
// its rest - hung head down, gravity and the belly decide)
const CONE = 65 * Math.PI / 180;
const LOBE = { k: 900, c: 24, max: 1.2 };   // each lobe's own spring on the sac (1/s^2, 1/s; max offset, its group's units)
const _down = new THREE.Vector3(0, -1, 0), _fw = new THREE.Vector3();

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _qi = new THREE.Quaternion();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _restQ = new THREE.Quaternion(), _x = new THREE.Vector3(1, 0, 0);

// the closest point on segment a-b to p, into out
function closest(p, a, b, out) {
  _d.subVectors(b, a); const L2 = _d.lengthSq();
  const t = L2 ? Math.max(0, Math.min(1, _c.subVectors(p, a).dot(_d) / L2)) : 0;
  return out.copy(a).addScaledVector(_d, t);
}

export class FleshSim {
  constructor(fig) {
    this.fig = fig;
    this.p = [new THREE.Vector3(), new THREE.Vector3()];      // mass, tip (world)
    this.v = [new THREE.Vector3(), new THREE.Vector3()];
    this.anchor = new THREE.Vector3(); this.anchorPrev = new THREE.Vector3(); this.anchorV = new THREE.Vector3();
    this.lobe = [{ o: new THREE.Vector3(), v: new THREE.Vector3() }, { o: new THREE.Vector3(), v: new THREE.Vector3() }];
    this.rest = 0;              // rest bias, radians forward
    this.capsules = [];         // [{a, b, r}] in world, rebuilt each step
    this.boxes = [];            // extra solids: [{min, max}] in world (a seat), tops only
    this.floor = 0;
    this.fresh = true;
    this.acc = 0;
  }
  // the group the anatomy hangs in, and its inner (scaled) group
  get pouch() { return this.fig.userData.pouch; }
  get inner() { const p = this.pouch; return p && p.children[0]; }

  // where each particle rests on the body right now (world), with the rest bias
  targets(out0, out1, root) {
    const P = this.pouch, g = this.inner, u = g.userData, s = g.scale.x;
    _restQ.setFromAxisAngle(_x, this.restAll());
    P.quaternion.copy(_restQ); P.updateMatrixWorld(true);
    P.getWorldPosition(this.anchor);
    out0.set(u.mass[0] * s, u.mass[1] * s, u.mass[2] * s); P.localToWorld(out0);
    out1.set(u.shaftTip[0] * s, u.shaftTip[1] * s, u.shaftTip[2] * s); P.localToWorld(out1);
    if (root) { root.set(u.shaftRoot[0] * s, u.shaftRoot[1] * s, u.shaftRoot[2] * s); P.localToWorld(root); }
  }

  reset() { this.fresh = true; }
  // (the rest bias, plus the lift what he wears gives it)
  restAll() { return this.rest + (this.fig.userData.lift || 0); }

  colliders() {
    const d = this.fig.userData, c = d.colliders, sc = this.fig.getWorldScale(_w).x;
    this.capsules.length = 0;
    if (!c) return;
    ['l', 'r'].forEach(k => {
      const a = new THREE.Vector3(), b = new THREE.Vector3();
      d.legs[k].hip.getWorldPosition(a); d.legs[k].kn.getWorldPosition(b);
      this.capsules.push({ a, b, r: c.thighR * sc * 0.92 });
    });
    // the belly: a capsule up the trunk's axis from above the fork
    const a = new THREE.Vector3(0, 4, c.bellyZ), b = new THREE.Vector3(0, 30, c.bellyZ);
    d.hips.localToWorld(a); d.hips.localToWorld(b);
    this.capsules.push({ a, b, r: c.bellyR * sc * 0.96 });
  }

  collide(p, r) {
    for (const k of this.capsules) {
      closest(p, k.a, k.b, _a); _b.subVectors(p, _a); const L = _b.length(), R = k.r + r;
      if (L < R) { if (L < 1e-4) _b.set(0, 0, -1); else _b.divideScalar(L); p.copy(_a).addScaledVector(_b, R); }
    }
    for (const bx of this.boxes) {
      if (p.x > bx.min.x && p.x < bx.max.x && p.z > bx.min.z && p.z < bx.max.z && p.y < bx.max.y + r && p.y > bx.min.y) p.y = bx.max.y + r;
    }
    if (p.y < this.floor + r) p.y = this.floor + r;
  }

  // advance dt seconds and pose the anatomy from the particles
  step(dt) {
    const P = this.pouch, g = this.inner; if (!P || !g) return false;
    const u = g.userData, s = g.scale.x, sc = this.fig.getWorldScale(_w).x * P.scale.x * s;
    const loose = Math.max(0.2, u.sway || 1), k = K / loose, c = C / Math.sqrt(loose);
    const lobeMax = LOBE.max * (u.kl || 1), lobeK = LOBE.k;
    const T0 = new THREE.Vector3(), T1 = new THREE.Vector3(), root = new THREE.Vector3();
    this.targets(T0, T1, root);
    const L0 = T0.distanceTo(this.anchor), L1 = T1.distanceTo(this.anchor);
    const r0 = u.lobeR * sc * 0.85, r1 = u.shaftR * sc * 0.8;
    if (this.fresh) {
      this.p[0].copy(T0); this.p[1].copy(T1); this.v[0].set(0, 0, 0); this.v[1].set(0, 0, 0);
      // (a nudge toward his front: balanced exactly upside down it would
      // never start to fall)
      this.fig.userData.hips.getWorldQuaternion(_q); _fw.set(0, 0, -1).applyQuaternion(_q).multiplyScalar(25);
      this.v[0].copy(_fw); this.v[1].copy(_fw);
      this.anchorPrev.copy(this.anchor);
      this.lobe.forEach(l => { l.o.set(0, 0, 0); l.v.set(0, 0, 0); });
      this.fresh = false; dt = 0;
    }
    this.colliders();
    // the anchor's velocity this frame (the body's own motion under it)
    if (dt > 0) this.anchorV.subVectors(this.anchor, this.anchorPrev).divideScalar(dt);
    this.anchorPrev.copy(this.anchor);
    // (the lobes' frame: the inner group's, as it stands this frame)
    g.getWorldQuaternion(_qi).invert();
    const vm = new THREE.Vector3(), jolt = new THREE.Vector3();
    this.acc += dt;
    let n = 0;
    while (this.acc >= STEP && n < 40) {
      this.acc -= STEP; n++;
      vm.copy(this.v[0]);
      [0, 1].forEach(i => {
        const p = this.p[i], v = this.v[i], T = i ? T1 : T0, L = i ? L1 : L0, r = i ? r1 : r0;
        // gravity, the tissue's hold toward its rest, damping against the body's motion
        _v.subVectors(T, p).multiplyScalar(k / Math.max(1, L));
        _v.y -= GRAV;
        _w.subVectors(v, this.anchorV).multiplyScalar(-c);
        v.addScaledVector(_v.add(_w), STEP);
        const x = p.clone().addScaledVector(v, STEP);
        // held to its root (a short rod - tissue barely stretches)
        _a.subVectors(x, this.anchor); const d = _a.length() || 1; _a.divideScalar(d);
        // the cloth's hold: what he wears holds it within `support` degrees
        // of its rest, in any orientation; with none, the 65deg while upright
        _b.subVectors(T, this.anchor).normalize();
        const sup = this.fig.userData.support, cone = sup ? sup * Math.PI / 180 : CONE;
        if (sup || _b.dot(_down) > 0.2) {
          const cosA = _a.dot(_b);
          if (cosA < Math.cos(cone)) {
            // (turned back onto the cone's edge, in the plane of the two)
            _c.copy(_a).addScaledVector(_b, -cosA).normalize();
            _a.copy(_b).multiplyScalar(Math.cos(cone)).addScaledVector(_c, Math.sin(cone));
          }
        }
        x.copy(this.anchor).addScaledVector(_a, L);
        this.collide(x, r);
        v.subVectors(x, p).divideScalar(STEP);
        p.copy(x);
      });
      // the lobes: each a small spring on the sac, driven by the sac's own
      // jolts (its change of velocity - gravity it hangs against cancels out)
      jolt.subVectors(this.v[0], vm).divideScalar(STEP).applyQuaternion(_qi).divideScalar(sc);
      this.lobe.forEach((L, i) => {
        _a.copy(L.o).multiplyScalar(-lobeK).addScaledVector(L.v, -LOBE.c).addScaledVector(jolt, -(i ? 1.12 : 1));
        L.v.addScaledVector(_a, STEP); L.o.addScaledVector(L.v, STEP);
        if (L.o.length() > lobeMax) { L.o.setLength(lobeMax); L.v.multiplyScalar(0.5); }
      });
    }
    this.publish(T0, T1);
    this.pose(T0, root);
    const moving = this.v[0].distanceTo(this.anchorV) + this.v[1].distanceTo(this.anchorV);
    return moving > 0.5 || this.lobe.some(l => l.v.lengthSq() > 0.01);
  }

  // the swing vector, for the cloth: in the hips' frame and units
  publish(T0, T1) {
    const u = this.fig.userData, hips = u.hips; if (!hips) return;
    const S = u.swing || (u.swing = { d: new THREE.Vector3(), tip: new THREE.Vector3(), v: new THREE.Vector3() });
    hips.getWorldQuaternion(_q).invert(); const k = 1 / hips.getWorldScale(_w).x;
    S.d.subVectors(this.p[0], T0).applyQuaternion(_q).multiplyScalar(k);
    S.tip.subVectors(this.p[1], T1).applyQuaternion(_q).multiplyScalar(k);
    S.v.subVectors(this.v[0], this.anchorV).applyQuaternion(_q).multiplyScalar(k);
  }

  // turn the anatomy so its mass lies where the particle is; then the shaft
  // about its own root toward its tip; then the lobes' lag
  pose(T0, rootW) {
    const P = this.pouch, g = this.inner, u = g.userData, s = g.scale.x, hips = P.parent;
    hips.getWorldQuaternion(_qi).invert();
    _a.subVectors(T0, this.anchor).applyQuaternion(_qi).normalize();
    _b.subVectors(this.p[0], this.anchor).applyQuaternion(_qi).normalize();
    _q.setFromUnitVectors(_a, _b);
    // (how far it is swung off its rest, for the lab's readout)
    this.swing = 2 * Math.acos(Math.min(1, Math.abs(_q.w)));
    P.quaternion.copy(_q).multiply(_restQ.setFromAxisAngle(_x, this.restAll()));
    P.updateMatrixWorld(true);
    // the shaft: in the inner group's frame, from its root toward the tip particle
    const sh = u.shaft;
    if (sh) {
      const r0 = new THREE.Vector3(...u.shaftRoot), t0 = new THREE.Vector3(...u.shaftTip);
      const tip = g.worldToLocal(this.p[1].clone());
      _a.subVectors(t0, r0).normalize(); _b.subVectors(tip, r0).normalize();
      _q.setFromUnitVectors(_a, _b);
      // (never folded back on itself)
      const ang = 2 * Math.acos(Math.min(1, Math.abs(_q.w)));
      if (ang > 2.3) _q.slerp(new THREE.Quaternion(), 1 - 2.3 / ang);
      // (a build's: bent out of its sealed root; else turned whole on it)
      if (u.bendShaft) u.bendShaft(_q);
      else { sh.quaternion.copy(_q); sh.position.copy(r0).sub(r0.clone().applyQuaternion(_q)); }
    }
    u.lobes.forEach((lb, i) => { if (lb.userData.p0) lb.position.copy(lb.userData.p0).add(this.lobe[i].o); });
    // (the skin over them follows where they went)
    if (u.updateSac) u.updateSac();
  }
}
