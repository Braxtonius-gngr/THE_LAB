// world/face.mjs - FaceRig: drives a body's face from the contract in assets/face/expressions.json.
//
// One weight map { expressionId: 0..1 } over the 53 ICT FaceKit ids is the whole interface.
// Layers (summed, clamped, then eased toward over time so nothing snaps):
//   mood      - resting face from the mind's { valence, energy }, bilinear between the four mood corners
//   gaze      - eyeLook* from the reflexes' head yaw/pitch toward the gaze target
//   blink     - spontaneous blinks on the contract's timing
//   speech    - visemes from timing frames (ElevenLabs alignment or a simple amplitude fallback)
//   act       - one-shot expressions the mind asks for ({ type: 'express', id, amount, hold })
// A body with no morph targets is fine: the rig computes, applies nothing, and reports `rigged: false`.
//
// Usage (apartment.html):
//   const face = new FaceRig(model);                    // finds every mesh with a morphTargetDictionary
//   face.setMood(mood);                                  // from the mind reply
//   face.setGaze(reflexes.gaze.yaw, reflexes.gaze.pitch) // each frame, or let update() read `reflexes`
//   face.speak(frames)  /  face.speakAmplitude(analyser) // while his voice plays
//   face.update(dt);                                     // each frame

import * as THREE from '../assets/vendor/three/three.module.js';

const CONTRACT_URL = new URL('../assets/face/expressions.json', import.meta.url);
let _contract = null;
export async function loadContract(url = CONTRACT_URL) {
  if (_contract) return _contract;
  _contract = await (await fetch(url)).json();
  return _contract;
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;

export class FaceRig {
  constructor(model, contract, { reflexes = null, smoothing = 10 } = {}) {
    this.contract = contract || _contract;
    if (!this.contract) throw new Error('FaceRig: call loadContract() first');
    this.ids = this.contract.expressions;
    this.reflexes = reflexes;
    this.smoothing = smoothing; // 1/sec - higher follows faster; ~10 reads natural, ~25 reads twitchy

    // --- find morph-target meshes and map id -> [mesh, index] ---
    this.meshes = [];
    this.index = new Map(); // id -> [{ mesh, i }]
    model.traverse((o) => {
      if (!o.isMesh || !o.morphTargetDictionary) return;
      this.meshes.push(o);
      for (const id of this.ids) {
        const i = o.morphTargetDictionary[id];
        if (i == null) continue;
        if (!this.index.has(id)) this.index.set(id, []);
        this.index.get(id).push({ mesh: o, i });
      }
    });
    this.rigged = this.index.size > 0;
    this.tier = this._tier();

    // --- state ---
    this.target = Object.fromEntries(this.ids.map((id) => [id, 0]));  // where each weight wants to be
    this.current = { ...this.target };                                 // where it is (eased)
    this.mood = { valence: 0, energy: 0.5 };
    this.gaze = { yaw: 0, pitch: 0 };
    this.acts = [];                                                    // one-shots in flight
    this.speech = null;                                                // { frames, t0 } or { analyser }
    this._blink = { t: 0, next: this._nextBlink(), phase: null };
    this._moodMap = {};
    this._recomputeMood();
  }

  _tier() {
    const t = this.contract.tiers;
    if (!this.rigged) return null;
    if (this.ids.every((id) => this.index.has(id))) return 'full';
    if (t.core.every((id) => this.index.has(id))) return 'core';
    return 'partial';
  }

  // ---------- inputs ----------
  setMood(mood) {
    if (!mood) return;
    this.mood = { valence: clamp01((mood.valence + 1) / 2) * 2 - 1, energy: clamp01(mood.energy) };
    this._recomputeMood();
  }
  setGaze(yaw, pitch) { this.gaze.yaw = yaw; this.gaze.pitch = pitch; }

  // id (or a weight map), amount 0..1, hold seconds, attack/release seconds
  express(id, amount = 1, hold = 1.2, { attack = 0.25, release = 0.6 } = {}) {
    const map = typeof id === 'string' ? { [id]: 1 } : id;
    this.acts.push({ map, amount, hold, attack, release, t: 0 });
  }

  // frames: [{ t: seconds, viseme: 'aa' | ..., weight?: 0..1 }] relative to now; sorted by t
  speak(frames) { this.speech = { frames, t0: performance.now() / 1000, i: 0, cur: 'sil', prev: 'sil', k: 1 }; }
  // fallback: an AnalyserNode on the voice; jaw follows loudness, mouth shape by spectral centroid
  speakAmplitude(analyser) { this.speech = { analyser, buf: new Uint8Array(analyser.frequencyBinCount) }; }
  stopSpeaking() { this.speech = null; }

  // ---------- per-frame ----------
  update(dt) {
    dt = Math.min(dt, 0.1);
    for (const id of this.ids) this.target[id] = 0;

    // mood (resting face)
    for (const id in this._moodMap) this.target[id] += this._moodMap[id];

    // gaze
    if (this.reflexes) this.setGaze(this.reflexes.gaze.yaw, this.reflexes.gaze.pitch);
    this._applyGaze();

    // one-shot acts
    this.acts = this.acts.filter((a) => {
      a.t += dt;
      const env = a.t < a.attack ? a.t / a.attack
        : a.t < a.attack + a.hold ? 1
        : Math.max(0, 1 - (a.t - a.attack - a.hold) / a.release);
      for (const id in a.map) this.target[id] += a.map[id] * a.amount * env;
      return a.t < a.attack + a.hold + a.release;
    });

    // speech
    this._applySpeech(dt);

    // blink (on top; closes eyes regardless of the rest)
    this._applyBlink(dt);

    // ease and write
    const k = 1 - Math.exp(-this.smoothing * dt);
    for (const id of this.ids) {
      const v = clamp01(this.target[id]);
      // blinks and visemes want to be crisp; the rest eases
      const fast = id.startsWith('eyeBlink') || (this.speech && this._isMouth(id));
      this.current[id] = fast ? lerp(this.current[id], v, Math.min(1, k * 3)) : lerp(this.current[id], v, k);
      const slots = this.index.get(id);
      if (slots) for (const s of slots) s.mesh.morphTargetInfluences[s.i] = this.current[id];
    }
  }

  // ---------- layers ----------
  _recomputeMood() {
    const M = this.contract.moods;
    const v = (this.mood.valence + 1) / 2, e = this.mood.energy; // 0..1 each
    // bilinear over the four corners, faded toward neutral when near the centre
    const corners = [
      [M.low_calm, (1 - v) * (1 - e)], [M.low_lively, (1 - v) * e],
      [M.warm_calm, v * (1 - e)], [M.warm_lively, v * e],
    ];
    const strength = Math.min(1, Math.hypot(this.mood.valence, (e - 0.5) * 2)); // 0 at dead centre
    const out = {};
    for (const [map, w] of corners) for (const id in map) out[id] = (out[id] || 0) + map[id] * w * strength;
    this._moodMap = out;
  }

  _applyGaze() {
    // reflexes' yaw: + looks to his left (model +x); pitch: + looks down. Eyes lead the head, so scale up.
    const y = Math.max(-1, Math.min(1, this.gaze.yaw * 2.2)), p = Math.max(-1, Math.min(1, this.gaze.pitch * 2.2));
    const T = this.target;
    if (y > 0) { T.eyeLookOut_L += y; T.eyeLookIn_R += y; } else { T.eyeLookIn_L += -y; T.eyeLookOut_R += -y; }
    if (p > 0) { T.eyeLookDown_L += p; T.eyeLookDown_R += p; } else { T.eyeLookUp_L += -p; T.eyeLookUp_R += -p; }
  }

  _nextBlink() {
    const b = this.contract.blink;
    return b.meanIntervalSec + (Math.random() * 2 - 1) * b.jitterSec;
  }
  _applyBlink(dt) {
    const b = this.contract.blink, s = this._blink;
    s.t += dt;
    if (s.phase == null && s.t >= s.next) { s.phase = 0; s.t = 0; }
    if (s.phase == null) return;
    const total = b.closeSec + b.holdSec + b.openSec;
    let w;
    if (s.t < b.closeSec) w = s.t / b.closeSec;
    else if (s.t < b.closeSec + b.holdSec) w = 1;
    else w = Math.max(0, 1 - (s.t - b.closeSec - b.holdSec) / b.openSec);
    // slower blinks when sleepy (low energy)
    this.target.eyeBlink_L += w; this.target.eyeBlink_R += w;
    if (s.t >= total * (1 + (0.5 - this.mood.energy) * 0.6)) { s.phase = null; s.t = 0; s.next = this._nextBlink(); }
  }

  _isMouth(id) { return this.contract.groups.mouth.includes(id) || this.contract.groups.jaw.includes(id); }

  _applySpeech(dt) {
    const sp = this.speech; if (!sp) return;
    const V = this.contract.visemes;
    if (sp.frames) {
      const t = performance.now() / 1000 - sp.t0;
      while (sp.i < sp.frames.length && sp.frames[sp.i].t <= t) { sp.prev = sp.cur; sp.cur = sp.frames[sp.i].viseme; sp.k = 0; sp.i++; }
      if (sp.i >= sp.frames.length && t > (sp.frames.at(-1)?.t ?? 0) + 0.25) { this.speech = null; return; }
      sp.k = Math.min(1, sp.k + dt / 0.06); // 60 ms crossfade between visemes
      const a = V[sp.prev] || {}, b = V[sp.cur] || {};
      for (const id in a) this.target[id] += a[id] * (1 - sp.k);
      for (const id in b) this.target[id] += b[id] * sp.k;
    } else if (sp.analyser) {
      sp.analyser.getByteFrequencyData(sp.buf);
      let sum = 0, cen = 0;
      for (let i = 0; i < sp.buf.length; i++) { sum += sp.buf[i]; cen += sp.buf[i] * i; }
      const loud = Math.min(1, sum / sp.buf.length / 90), bright = sum ? cen / sum / sp.buf.length : 0;
      // loud+dark -> 'aa'/'oh', loud+bright -> 'E'/'SS'
      const open = V.aa, round = V.oh, wide = V.E;
      const blend = (m, w) => { for (const id in m) this.target[id] += m[id] * w; };
      blend(open, loud * (1 - bright) * 0.7); blend(round, loud * (1 - bright) * 0.3); blend(wide, loud * bright);
    }
  }
}

// Convenience: weights the mind can send back ({ express: 'mouthSmile_L', amount, hold }) go through here.
export function applyMindFace(face, reply) {
  if (!face) return;
  if (reply.mood) face.setMood(reply.mood);
  for (const a of reply.actions || []) if (a.type === 'express' && a.id) face.express(a.id, a.amount ?? 1, a.hold ?? 1.2);
}
