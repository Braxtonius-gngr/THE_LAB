// Reflexes: the fast, local layer of a character. Runs every frame with no
// model in the loop - breathing and weight shifts while idle, eyes and head
// following the player, walking to a spot (the Walking clip retargeted in
// place, the body moved by hand), turning, and small gestures. The mind
// (world/mind.mjs) only ever says *what* to do; this does it.
//
// Rotations are given in the body's rest frame (x pitch, y yaw, z roll), so
// they work on any rig's bone axes (see captureRest in retarget.mjs).
import * as THREE from '../assets/vendor/three/three.module.js';
import { captureRest, retargetClip } from './retarget.mjs';

const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _y = new THREE.Vector3(0, 1, 0);
const lerpAngle = (a, b, t) => { let d = ((b - a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; return a + d * t; };

export class Reflexes {
  // model: the GLTF scene (faces +z at rest); pack: { rest, clips } from the animation library
  constructor(model, pack, { speed = 1.1 } = {}) {
    this.model = model; this.rest = captureRest(model); this.pack = pack; this.speed = speed;
    this.mixer = new THREE.AnimationMixer(model);
    this.clips = {};
    for (const c of pack.clips) this.clips[c.name] = retargetClip(c, pack.rest, this.rest, { inPlace: true });
    this.bone = n => this.rest[n]?.bone || null;
    this.t = 0; this.queue = []; this.current = null; this.gazeTarget = null; this.gaze = { yaw: 0, pitch: 0 };
    this.walkAction = null; this.walking = false; this.moveTarget = null; this.onArrive = null;
    this.phase = Math.random() * 10;
  }

  // --- the API the mind's actions map onto ---
  do(action) { this.queue.push(action); }
  clear() { this.queue.length = 0; }
  lookAt(target) { this.gazeTarget = target; }            // Vector3 or null
  walkTo(pos, onArrive) { this.moveTarget = pos.clone(); this.onArrive = onArrive || null; }
  turnTo(pos) { this.turnTarget = pos.clone(); }
  gesture(name, dur = 1.2) { this.gestureName = name; this.gestureT = 0; this.gestureDur = dur; }
  get busy() { return !!this.moveTarget || this.queue.length > 0 || !!this.current; }

  // run one queued action at a time: walk_to waits for arrival, gestures for their length
  _step(dt, spots) {
    if (this.current) {
      if (this.current.type === 'walk_to' && !this.moveTarget) this.current = null;
      else if (this.current.type === 'gesture' && this.gestureName == null) this.current = null;
      else if (this.current.type !== 'walk_to' && this.current.type !== 'gesture') this.current = null;
    }
    if (!this.current && this.queue.length) {
      const a = this.queue.shift(); this.current = a;
      if (a.type === 'walk_to' && spots[a.target]) this.walkTo(spots[a.target]);
      else if (a.type === 'turn_to' && a.target === 'player' && this.player) this.turnTo(this.player);
      else if (a.type === 'look_at') this.lookAt(a.target === 'player' ? this.player : null);
      else if (a.type === 'gesture') this.gesture(a.name || 'nod');
      else this.current = null;
    }
  }

  update(dt, { player = null, spots = {} } = {}) {
    this.t += dt; this.player = player;
    this._step(dt, spots);
    const m = this.model;
    // --- locomotion: move the body, face the way it goes, keep the clip playing ---
    if (this.moveTarget) {
      _v.subVectors(this.moveTarget, m.position); _v.y = 0; const d = _v.length();
      if (d < 0.08) { this.moveTarget = null; this._stopWalk(); if (this.onArrive) { const f = this.onArrive; this.onArrive = null; f(); } }
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
    if (this.walking) this.mixer.update(dt);
    else this._idle(dt);
    // --- gaze, on top of whatever the body is doing ---
    this._gaze(dt);
    // --- gesture, additive ---
    if (this.gestureName != null) this._gesture(dt);
  }

  _startWalk() {
    if (this.walking) return;
    const clip = this.clips.Walking; if (!clip) return;
    this.walkAction = this.mixer.clipAction(clip).reset().setEffectiveTimeScale(1.0).fadeIn(0.25).play();
    this.walking = true;
  }
  _stopWalk() {
    if (!this.walking) return;
    this.walkAction?.fadeOut(0.25);
    this.walking = false; this.restT = 0;
    setTimeout(() => { if (!this.walking) { this.mixer.stopAllAction(); this._toRest(); } }, 300);
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

  // head and eyes toward the target, clamped like a person's, with the neck taking a share
  _gaze(dt) {
    const head = this.bone('Head'); if (!head) return;
    let yaw = 0, pitch = 0;
    if (this.gazeTarget) {
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
