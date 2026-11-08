// Reflexes: the fast, local layer of a character. Runs every frame with no
// model in the loop - breathing and weight shifts while idle, eyes and head
// following the player, walking to a spot (the Walking clip retargeted in
// place, the body moved by hand), turning, small gestures, sitting and lying
// (Meshy clips), one-off clips (drink, phone, stretch) and held poses built by
// hand (arms crossed, leaning on the counter, playing the bass). The mind
// (world/mind.mjs) only ever says *what* to do; this does it.
//
// Rotations are given in the body's rest frame (x pitch, y yaw, z roll), so
// they work on any rig's bone axes (see captureRest in retarget.mjs).
import * as THREE from '../assets/vendor/three/three.module.js';
import { captureRest, retargetClip } from './retarget.mjs';

const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _y = new THREE.Vector3(0, 1, 0);
const lerpAngle = (a, b, t) => { let d = ((b - a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; return a + d * t; };
// the held poses; the page can swap in tuned ones (setPoses) from world/poses.json or the pose page
export const POSES = {
  cross_arms: { bones: { LeftArm: [-0.35, 0.55, -0.95], RightArm: [-0.35, -0.55, 0.95], LeftForeArm: [0, -1.9, 0.25], RightForeArm: [0, -1.9, -0.25] } },
  lean_counter: { bones: { Hips: [0.08, 0, 0], Spine01: [-0.12, 0, 0], Spine: [-0.05, 0, 0], LeftArm: [0.55, 0, -0.85], RightArm: [0.55, 0, 0.85], LeftForeArm: [0.3, 0, 0], RightForeArm: [0.3, 0, 0], LeftUpLeg: [0, 0, 0.06], RightUpLeg: [0, 0, -0.06] } },
  play_bass: { bones: { Spine: [0.06, 0.08, 0], Head: [0.08, 0.25, 0], LeftArm: [-0.9, 0.35, -0.55], LeftForeArm: [0, -0.9, 0.2], RightArm: [-0.55, -0.6, 0.6], RightForeArm: [0, 1.15, 0] },
    prop: { fwd: 0.3, side: 0, y: 0.5, yaw: 1.5708, roll: 1.15 } },
};
export function setPoses(p) { for (const k in p) if (p[k] && p[k].bones) POSES[k] = p[k]; }
const ease = t => t * t * (3 - 2 * t);

export class Reflexes {
  // model: the GLTF scene (faces +z at rest); packs: { rest, clips } or a list of them
  // seats: { sofa: { pos, yaw }, bed: { pos, yaw, y } } - where his hips go when he sits or lies
  constructor(model, packs, { speed = 1.1, seats = {} } = {}) {
    this.model = model; this.rest = captureRest(model); this.speed = speed; this.seats = seats;
    this.mixer = new THREE.AnimationMixer(model);
    this.clips = {};
    for (const pack of [].concat(packs)) for (const c of pack.clips) this.clips[c.name] = retargetClip(c, pack.rest, this.rest, { inPlace: true });
    this.bone = n => this.rest[n]?.bone || null;
    this.t = 0; this.queue = []; this.current = null; this.gazeTarget = null; this.gaze = { yaw: 0, pitch: 0 };
    this.walkAction = null; this.walking = false; this.moveTarget = null; this.onArrive = null;
    this.posture = 'stand';      // stand | sit | lie
    this.clipAct = null;         // the clip holding the body now (sit, lie, a one-off)
    this.hold = null; this.holdW = 0;   // a hand-built pose layered on top (cross_arms, lean_counter, play_bass)
    this.glide = null;           // the body carried from one place to another (onto the bed)
    this.phase = Math.random() * 10;
  }

  // --- the API the mind's actions map onto ---
  do(action) { this.queue.push(action); }
  clear() { this.queue.length = 0; this.current = null; }   // (a new thought drops whatever was half done)
  lookAt(target) { this.gazeTarget = target; }            // Vector3 or null
  // walk there - around the furniture when the page has given us a floor map (world/nav.mjs)
  walkTo(pos, onArrive) {
    this.waypoints = this.nav ? this.nav.path(this.model.position, pos) : [pos.clone()];
    this.moveTarget = this.waypoints.shift(); this.onArrive = onArrive || null;
  }
  turnTo(pos) { this.turnTarget = pos.clone(); }
  gesture(name, dur = 1.2) { this.gestureName = name; this.gestureT = 0; this.gestureDur = dur; }
  // music in the room: on each beat a small nod, scaled by how into it he is (0-1)
  groove(amount) { this.grooveAmt = amount; }
  beat() { if (this.grooveAmt > 0) this.beatT = 0; }
  get busy() { return !!this.moveTarget || this.queue.length > 0 || !!this.current || !!this.glide; }

  // play a clip: once (then `then`), or looped; fades from whatever was holding the body
  play(name, { loop = false, then = null, fade = 0.35 } = {}) {
    const clip = this.clips[name]; if (!clip) { then?.(); return false; }
    const a = this.mixer.clipAction(clip).reset();
    a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1); a.clampWhenFinished = !loop;
    if (this.clipAct && this.clipAct !== a) { a.crossFadeFrom(this.clipAct, fade, false); }
    a.play(); this.clipAct = a;
    if (!loop) { const done = e => { if (e.action !== a) return; this.mixer.removeEventListener('finished', done); then?.(); }; this.mixer.addEventListener('finished', done); }
    return true;
  }
  _release() { if (this.clipAct) { this.clipAct.fadeOut(0.3); const a = this.clipAct; this.clipAct = null; setTimeout(() => { if (this.clipAct !== a) a.stop(); }, 320); } }

  // a seat by key ('sofa2'), or the first free one of a group ('sofa' -> sofa, sofa2, ...); the page
  // tells us which are taken (isTaken) so two people don't share a cushion
  seatFor(where) {
    const S = this.seats; if (!S) return null;
    const keys = Object.keys(S).filter(k => k === where || S[k].group === where || k.replace(/\d+$/, '') === where);
    return keys.map(k => [k, S[k]]).find(([k, v]) => !this.isTaken?.(k) || this.seat === k) || (keys.length ? [keys[0], S[keys[0]]] : null);
  }
  // sit on a seat: walk to it, turn his back to it, sit down, stay sitting
  sit(where = 'sofa', then = null) {
    const found = this.seatFor(where); if (!found || found[1].kind === 'lie' || found[1].kind === 'lean') { then?.(); return; }
    const [k, S] = found;
    this._standThen(() => this.walkTo(S.pos, () => {
      this.model.rotation.y = S.yaw; if (S.y != null) this.model.position.y = S.y;
      this.posture = 'sit'; this.hold = null; this.seat = k;
      this.play('sit_down', { then: () => { this.play('sit_idle', { loop: true }); then?.(); } }) || (this.play('sit_idle', { loop: true }), then?.());
    }));
  }
  // lie on the bed: walk to its side, then onto it and settle
  lie(then = null) {
    const S = this.seats.bed; if (!S || !S.side) { then?.(); return; }
    this.seat = 'bed';
    this._standThen(() => this.walkTo(S.side, () => {
      this.posture = 'lie'; this.hold = null; this.gazeTarget = null;
      this.play('lie_idle', { loop: true, fade: 0.8 });
      this.glide = { from: this.model.position.clone(), fromYaw: this.model.rotation.y, to: S.pos.clone(), toYaw: S.yaw, t: 0, dur: 1.4, then };
    }));
  }
  // on his feet again, from whatever he was doing
  stand(then = null) {
    if (this.posture === 'stand') { this._release(); then?.(); return; }
    const was = this.posture; this.hold = null; this.seat = null;
    if (was === 'lie') {
      const S = this.seats.bed;
      this.glide = { from: this.model.position.clone(), fromYaw: this.model.rotation.y, to: S.side.clone(), toYaw: S.yaw + Math.PI / 2, t: 0, dur: 1.2, then: () => { this.posture = 'stand'; this._release(); then?.(); } };
      this.play('get_up', { fade: 0.6 });
    } else {
      this.play('stand_up', { then: () => { this.posture = 'stand'; this.model.position.y = this.model.userData.y0 || 0; this._release(); then?.(); } }) || (this.posture = 'stand', this._release(), then?.());
    }
  }
  _standThen(f) { if (this.posture === 'stand') f(); else this.stand(f); }
  // a one-off clip standing: stand first if he must
  once(name, then) { this._standThen(() => { this.hold = null; this.play(name, { then: () => { this._release(); then?.(); } }) || then?.(); }); }

  // run one queued action at a time: each sets `current`, cleared when it is done
  _step(dt, spots) {
    if (this.current && this.current.done) this.current = null;
    if (this.current || !this.queue.length) return;
    const a = this.queue.shift(); const cur = this.current = { type: a.type, done: false }; const fin = () => { cur.done = true; };
    const walk = (at, then) => this._standThen(() => this.walkTo(at, () => { then?.(); fin(); }));
    if (a.type === 'walk_to' && spots[a.target]) { this.hold = null; walk(spots[a.target]); }
    else if (a.type === 'turn_to') { const at = a.target === 'other' ? this.other : this.player; if (at && this.posture === 'stand') this.turnTo(at); fin(); }
    else if (a.type === 'look_at') { this.lookAt(a.target === 'other' ? this.other : a.target === 'player' ? this.player : null); fin(); }
    else if (a.type === 'gesture') { this.gesture(a.name || 'nod'); setTimeout(fin, 1200); }
    else if (a.type === 'sit' || a.type === 'rest') this.sit(a.on || a.target || 'sofa', fin);
    else if (a.type === 'lie_down') this.lie(fin);
    else if (a.type === 'stand') this.stand(fin);
    else if (a.type === 'drink') this.once('drink', fin);
    else if (a.type === 'phone') this.once('phone_check', fin);
    else if (a.type === 'stretch') this.once('stretch_yawn', fin);
    else if (a.type === 'cross_arms') { this._standThen(() => { this.hold = 'cross_arms'; fin(); }); }
    else if (a.type === 'lean_counter') { const at = this.seatFor('counter')?.[1]; this.hold = null; if (at) walk(at.pos, () => { this.model.rotation.y = at.yaw; this.hold = 'lean_counter'; }); else fin(); }
    else if (a.type === 'play_bass') this.sit('sofa', () => { this.hold = 'play_bass'; this.onHold?.('play_bass', true); fin(); });
    // eat: off to the kitchen and a moment there
    else if (a.type === 'eat') { this.hold = null; walk(spots.kitchen || this.model.position, () => this.gesture('nod', 2.5)); }
    // changing clothes: off to where he keeps them - the bed - then the page dresses him
    else if (a.type === 'change') { this.hold = null; walk(spots.bed || spots.shelf || this.model.position, () => this.onChange?.(a.outfit)); }
    else fin();
  }

  // player: where the visitor's eyes are; other: the other person's head, when someone else is here
  update(dt, { player = null, other = null, spots = {} } = {}) {
    this.t += dt; this.player = player; this.other = other;
    this._step(dt, spots);
    const m = this.model;
    if (this.hold !== 'play_bass' && this._bassOn) this.onHold?.('play_bass', false);
    this._bassOn = this.hold === 'play_bass';
    // --- carried (onto the bed, off it) ---
    if (this.glide) {
      const G = this.glide; G.t += dt; const k = ease(Math.min(1, G.t / G.dur));
      m.position.lerpVectors(G.from, G.to, k); m.rotation.y = lerpAngle(G.fromYaw, G.toYaw, k);
      if (G.t >= G.dur) { this.glide = null; G.then?.(); }
    }
    // --- personal space: someone standing right on top of him, he gives a half-step back (standing,
    // not mid-walk, not leaning or playing, not more than once every few seconds) ---
    else if (this.posture === 'stand' && !this.moveTarget && !this.clipAct && !this.hold && this.t - (this.spaceT ?? -9) > 4 && this._crowded()) { /* (moveTarget set) */ }
    // --- locomotion: move the body, face the way it goes, keep the clip playing ---
    else if (this.moveTarget) {
      _v.subVectors(this.moveTarget, m.position); _v.y = 0; const d = _v.length();
      if (d < 0.18 && this.waypoints?.length) { this.moveTarget = this.waypoints.shift(); }   // a corner: on to the next, no stop
      else if (d < 0.08) { this.moveTarget = null; this._stopWalk(); if (this.onArrive) { const f = this.onArrive; this.onArrive = null; f(); } }
      else {
        const yaw = Math.atan2(_v.x, _v.z);
        m.rotation.y = lerpAngle(m.rotation.y, yaw, Math.min(1, dt * 6));
        const step = Math.min(d, this.speed * dt * Math.min(1, d / 0.4 + 0.3));
        m.position.addScaledVector(_v.normalize(), step);
        this._startWalk();
      }
    } else if (this.turnTarget) {
      _v.subVectors(this.turnTarget, m.position); _v.y = 0;
      const yaw = Math.atan2(_v.x, _v.z);
      m.rotation.y = lerpAngle(m.rotation.y, yaw, Math.min(1, dt * 4));
      if (Math.abs(lerpAngle(m.rotation.y, yaw, 1) - m.rotation.y) < 0.03) this.turnTarget = null;
    }
    // --- the clip or the idle ---
    if (this.walking || this.clipAct) this.mixer.update(dt);
    else this._idle(dt);
    // --- held pose, eased in and out, on top ---
    this.holdW += ((this.hold ? 1 : 0) - this.holdW) * Math.min(1, dt * 3);
    if (this.holdW > 0.01) this._hold(this._lastHold = this.hold || this._lastHold, this.holdW);
    // --- gaze (not lying down), on top of whatever the body is doing ---
    if (this.posture !== 'lie') this._gaze(dt);
    // --- the music: a nod on the beat (down quick, up slow) ---
    if (this.grooveAmt > 0 && this.beatT != null && this.beatT < 0.45) { this.beatT += dt; const k = this.beatT < 0.12 ? this.beatT / 0.12 : 1 - (this.beatT - 0.12) / 0.33; this._setRest('Head', 0.07 * this.grooveAmt * Math.max(0, k), 0, 0, true); this._setRest('neck', 0.03 * this.grooveAmt * Math.max(0, k), 0, 0, true); }
    // --- gesture, additive ---
    if (this.gestureName != null) this._gesture(dt);
  }

  // the other person (or the visitor) closer than about half a metre: step back along the line
  // between them, if the floor there is free. Returns true when a step was set.
  _crowded() {
    for (const p of [this.other, this.player]) {
      if (!p) continue;
      _v.subVectors(this.model.position, p); _v.y = 0; const d = _v.length();
      if (d < 0.01 || d > 0.55) continue;
      _w.copy(this.model.position).addScaledVector(_v.normalize(), 0.35);
      if (this.nav && !this.nav.freeAt(_w.x, _w.z)) continue;
      this.spaceT = this.t; this.waypoints = []; this.moveTarget = _w.clone(); this.onArrive = null;
      return true;
    }
    return false;
  }
  _startWalk() {
    if (this.walking) return;
    const clip = this.clips.Walking; if (!clip) return;
    this._release();
    this.walkAction = this.mixer.clipAction(clip).reset().setEffectiveTimeScale(1.0).fadeIn(0.25).play();
    this.walking = true;
  }
  _stopWalk() {
    if (!this.walking) return;
    this.walkAction?.fadeOut(0.25);
    this.walking = false; this.restT = 0;
    setTimeout(() => { if (!this.walking && !this.clipAct) { this.mixer.stopAllAction(); this._toRest(); } }, 300);
  }
  _toRest() { for (const r of Object.values(this.rest)) { r.bone.quaternion.copy(r.q); r.bone.position.copy(r.p); } }

  // in the body's rest frame: rotate a bone by (x, y, z) on top of its rest pose
  _setRest(name, x, y, z, add = false) {
    const r = this.rest[name]; if (!r) return;
    _q.setFromEuler(_e.set(x, y, z));
    const base = add ? r.bone.quaternion.clone() : r.q;
    r.bone.quaternion.copy(r.pwi).multiply(_q).multiply(r.pw).multiply(base);
  }

  // breathing, a slow weight shift, a small sway: alive without a clip
  _idle(dt) {
    if (this.walking) return;
    this._toRest();
    const t = this.t + this.phase;
    const br = Math.sin(t * 2 * Math.PI * 0.22);                 // ~13 breaths a minute
    const sway = Math.sin(t * 0.37) * 0.5 + Math.sin(t * 0.11) * 0.5;
    this._setRest('Spine01', -0.012 * br, 0, 0.01 * sway);
    this._setRest('Spine', -0.01 * br, 0.015 * sway, 0);
    this._setRest('Hips', 0, 0.02 * sway, 0.012 * sway);
    this._setRest('LeftArm', 0, 0, 0.02 * br); this._setRest('RightArm', 0, 0, -0.02 * br);
    this.model.position.y = (this.model.userData.y0 || 0) + 0.002 * (sway * 0.5 + 0.5);
  }

  // hand-built poses (world/poses.json, tuned on lab/pose.html): rest-frame turns per bone on top
  // of what the body is doing, scaled by w (0-1); the small living motion stays here in code
  _hold(name, w) {
    const P = POSES[name]; if (!P) return;
    const t = this.t + this.phase, A = (b, x, y, z) => this._setRest(b, x * w, y * w, z * w, true);
    for (const [b, r] of Object.entries(P.bones || {})) A(b, r[0], r[1], r[2]);
    if (name === 'cross_arms') A('Spine', 0.02 * Math.sin(t * 0.5), 0, 0);
    else if (name === 'lean_counter') A('Hips', 0, 0, 0.02 * Math.sin(t * 0.3));
    else if (name === 'play_bass') { const beat = Math.sin(t * Math.PI * 2 * 1.6), pluck = Math.sin(t * Math.PI * 2 * 3.2); A('Head', 0.04 * beat, 0, 0); A('RightForeArm', 0.05 * pluck, 0, 0); A('RightHand', 0.15 * pluck, 0, 0); }
  }

  // head and eyes toward the target, clamped like a person's, with the neck taking a share
  _gaze(dt) {
    const head = this.bone('Head'); if (!head) return;
    let yaw = 0, pitch = 0;
    if (this.gazeTarget && this.hold !== 'play_bass') {
      head.getWorldPosition(_w); _v.subVectors(this.gazeTarget, _w);
      // into the body's frame (its yaw)
      _v.applyAxisAngle(_y, -this.model.rotation.y);
      yaw = Math.atan2(_v.x, _v.z); pitch = -Math.atan2(_v.y, Math.hypot(_v.x, _v.z));
      const lim = THREE.MathUtils.degToRad(65); yaw = THREE.MathUtils.clamp(yaw, -lim, lim);
      pitch = THREE.MathUtils.clamp(pitch, THREE.MathUtils.degToRad(-30), THREE.MathUtils.degToRad(35));
    }
    const k = Math.min(1, dt * 5);
    this.gaze.yaw += (yaw - this.gaze.yaw) * k; this.gaze.pitch += (pitch - this.gaze.pitch) * k;
    this._setRest('neck', this.gaze.pitch * 0.3, this.gaze.yaw * 0.3, 0, true);
    this._setRest('Head', this.gaze.pitch * 0.7, this.gaze.yaw * 0.7, 0, true);
  }

  _gesture(dt) {
    this.gestureT += dt; const t = this.gestureT / this.gestureDur;
    if (t >= 1) { this.gestureName = null; return; }
    const env = Math.sin(Math.PI * t);
    if (this.gestureName === 'nod') { this._setRest('Head', 0.25 * Math.sin(t * Math.PI * 4) * env, 0, 0, true); }
    else if (this.gestureName === 'shrug') { this._setRest('LeftShoulder', 0, 0, 0.35 * env, true); this._setRest('RightShoulder', 0, 0, -0.35 * env, true); this._setRest('Head', 0, 0, 0.06 * env, true); }
    else if (this.gestureName === 'wave') { this._setRest('RightArm', 0, 0, -1.9 * env, true); this._setRest('RightForeArm', 0.3 * Math.sin(t * Math.PI * 6) * env, 0, -0.6 * env, true); }
    else if (this.gestureName === 'shake') { this._setRest('Head', 0, 0.2 * Math.sin(t * Math.PI * 4) * env, 0, true); }
  }
}
