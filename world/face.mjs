// Face: what a man's face does - his mood on it, blinks and glances, his mouth when he talks.
// Runs every frame beside the reflexes (world/reflexes.mjs does the head and neck; this does
// everything inside the face). It drives ARKit-named blendshapes (eyeBlinkLeft, jawOpen,
// mouthSmileLeft, browInnerUp, ...) wherever the body has them: a head mesh with those morph
// targets, made in Blender with Faceit (tools/face/README.md). A body with no face shapes
// still gets the timing of all this - blinks, glances, speech rhythm - as small head motion
// (headAdd), which the reflexes add on top of the gaze, so he reads as alive and talking even
// before his face can move.
//
//   const face = new Face(model);             // finds every mesh with morph targets
//   face.setMood({ valence, energy });        // from the mind's reply
//   face.listening = true | false;            // the visitor is talking to him
//   face.update(dt, { spoken })               // spoken: voice.spoken() when it's him talking
//   reflex.headAdd = face.headAdd;            // pitch, yaw, roll to add to the head
// the 52 ARKit shapes (also what Unreal's Live Link face expects), so a head made for one works for the other
export const ARKIT = ['eyeBlinkLeft', 'eyeLookDownLeft', 'eyeLookInLeft', 'eyeLookOutLeft', 'eyeLookUpLeft', 'eyeSquintLeft', 'eyeWideLeft', 'eyeBlinkRight', 'eyeLookDownRight', 'eyeLookInRight', 'eyeLookOutRight', 'eyeLookUpRight', 'eyeSquintRight', 'eyeWideRight', 'jawForward', 'jawLeft', 'jawRight', 'jawOpen', 'mouthClose', 'mouthFunnel', 'mouthPucker', 'mouthLeft', 'mouthRight', 'mouthSmileLeft', 'mouthSmileRight', 'mouthFrownLeft', 'mouthFrownRight', 'mouthDimpleLeft', 'mouthDimpleRight', 'mouthStretchLeft', 'mouthStretchRight', 'mouthRollLower', 'mouthRollUpper', 'mouthShrugLower', 'mouthShrugUpper', 'mouthPressLeft', 'mouthPressRight', 'mouthLowerDownLeft', 'mouthLowerDownRight', 'mouthUpperUpLeft', 'mouthUpperUpRight', 'browDownLeft', 'browDownRight', 'browInnerUp', 'browOuterUpLeft', 'browOuterUpRight', 'cheekPuff', 'cheekSquintLeft', 'cheekSquintRight', 'noseSneerLeft', 'noseSneerRight', 'tongueOut'];

// a letter being spoken -> the mouth it takes (rough visemes; good enough at talking distance)
const VIS = {
  a: { jawOpen: 0.55, mouthStretch: 0.1 }, e: { jawOpen: 0.35, mouthSmile: 0.25 }, i: { jawOpen: 0.22, mouthSmile: 0.4 }, o: { jawOpen: 0.45, mouthFunnel: 0.5 }, u: { jawOpen: 0.2, mouthPucker: 0.6 }, y: { jawOpen: 0.2, mouthSmile: 0.3 },
  m: { mouthClose: 0.7, mouthPress: 0.4 }, b: { mouthClose: 0.7, mouthPress: 0.4 }, p: { mouthClose: 0.8, mouthPress: 0.5 },
  f: { mouthClose: 0.3, mouthLowerDown: 0.1, mouthRollLower: 0.5 }, v: { mouthClose: 0.3, mouthRollLower: 0.5 },
  w: { mouthPucker: 0.7, jawOpen: 0.15 }, r: { mouthPucker: 0.35, jawOpen: 0.2 }, q: { mouthPucker: 0.6, jawOpen: 0.15 },
  s: { jawOpen: 0.12, mouthSmile: 0.15, mouthClose: 0.2 }, z: { jawOpen: 0.12, mouthSmile: 0.15 }, c: { jawOpen: 0.2 }, k: { jawOpen: 0.25 }, g: { jawOpen: 0.25 }, h: { jawOpen: 0.3 },
  t: { jawOpen: 0.15, mouthClose: 0.1 }, d: { jawOpen: 0.18 }, n: { jawOpen: 0.15, mouthClose: 0.15 }, l: { jawOpen: 0.25 }, j: { jawOpen: 0.2, mouthFunnel: 0.4 }, x: { jawOpen: 0.15, mouthSmile: 0.1 },
};
const SH = { jawOpen: 0.2, mouthFunnel: 0.55 }, TH = { jawOpen: 0.18, mouthStretch: 0.1 };
const lerp = (a, b, t) => a + (b - a) * t, clamp01 = v => Math.max(0, Math.min(1, v));

export class Face {
  constructor(model) {
    this.targets = {};   // shape name -> [{ mesh, index }]
    model.traverse(o => { if (o.isMesh && o.morphTargetDictionary) for (const [n, i] of Object.entries(o.morphTargetDictionary)) (this.targets[n] = this.targets[n] || []).push({ mesh: o, index: i }); });
    this.has = ARKIT.some(n => this.targets[n]);
    this.w = {}; this.goal = {};          // current and target weights, by shape
    this.mood = { valence: 0, energy: 0.5 }; this.listening = false;
    this.headAdd = { pitch: 0, yaw: 0, roll: 0 };
    this.t = 0; this.nextBlink = 1 + Math.random() * 3; this.blinkT = -1; this.nextGlance = 2; this.glance = { x: 0, y: 0 }; this.glanceGoal = { x: 0, y: 0 };
    this.lastIndex = -1; this.wordStart = 0; this.nod = 0; this.rnd = Math.random() * 10;
  }
  setMood(m) { if (m && typeof m.valence === 'number') this.mood = { valence: Math.max(-1, Math.min(1, m.valence)), energy: clamp01(m.energy ?? 0.5) }; }
  // the shapes a mood puts on a resting face (small; a real face at rest is mostly still)
  _moodGoal(g) {
    const { valence: v, energy: e } = this.mood;
    if (v > 0) { g.mouthSmileLeft = g.mouthSmileRight = 0.35 * v; g.cheekSquintLeft = g.cheekSquintRight = 0.15 * v; g.eyeSquintLeft = g.eyeSquintRight = 0.1 * v; }
    else if (v < 0) { const a = -v; g.mouthFrownLeft = g.mouthFrownRight = 0.25 * a; if (e > 0.55) { g.browDownLeft = g.browDownRight = 0.3 * a; g.noseSneerLeft = g.noseSneerRight = 0.08 * a; } else { g.browInnerUp = 0.3 * a; g.mouthPressLeft = g.mouthPressRight = 0.1 * a; } }
    if (e < 0.35) { const h = (0.35 - e) / 0.35; g.eyeBlinkLeft = (g.eyeBlinkLeft || 0) + 0.18 * h; g.eyeBlinkRight = (g.eyeBlinkRight || 0) + 0.18 * h; }   // heavy lids
    else if (e > 0.75) { const h = (e - 0.75) / 0.25; g.eyeWideLeft = g.eyeWideRight = 0.15 * h; g.browOuterUpLeft = g.browOuterUpRight = 0.08 * h; }
    if (this.listening) { g.browInnerUp = (g.browInnerUp || 0) + 0.08; g.eyeWideLeft = (g.eyeWideLeft || 0) + 0.05; g.eyeWideRight = (g.eyeWideRight || 0) + 0.05; }
  }
  // the mouth for the character being spoken now; the previous one still fading
  _viseme(spoken, g) {
    if (!spoken) { this.wasTalking = false; return; }
    const ch = (spoken.char || '').toLowerCase(), nx = (spoken.next || '').toLowerCase();
    let V = null;
    if (ch === 's' && nx === 'h' || ch === 'c' && nx === 'h') V = SH; else if (ch === 't' && nx === 'h') V = TH; else if (/[a-z]/.test(ch)) V = VIS[ch] || { jawOpen: 0.15 };
    if (spoken.index !== this.lastIndex) { if (spoken.index >= 0 && (spoken.index === 0 || /\s/.test(spoken.text[spoken.index - 1] || ''))) this.wordStart = this.t; this.lastIndex = spoken.index; }
    if (V) for (const [k, v] of Object.entries(V)) {
      if (k === 'mouthSmile' || k === 'mouthStretch' || k === 'mouthPress' || k === 'mouthLowerDown') { g[k + 'Left'] = Math.max(g[k + 'Left'] || 0, v); g[k + 'Right'] = Math.max(g[k + 'Right'] || 0, v); }
      else g[k] = Math.max(g[k] || 0, v);
    }
    this.wasTalking = true;
  }
  update(dt, { spoken = null } = {}) {
    this.t += dt;
    const g = {};
    this._moodGoal(g);
    this._viseme(spoken, g);
    // blinks: every 2-6 s, quicker when wound up; a blink is ~120 ms down, ~160 ms up
    const e = this.mood.energy;
    if (this.blinkT < 0 && this.t >= this.nextBlink) { this.blinkT = 0; this.nextBlink = this.t + 2 + Math.random() * (e > 0.7 ? 2.5 : 4); }
    let blink = 0;
    if (this.blinkT >= 0) { this.blinkT += dt; blink = this.blinkT < 0.12 ? this.blinkT / 0.12 : Math.max(0, 1 - (this.blinkT - 0.12) / 0.16); if (this.blinkT > 0.3) this.blinkT = -1; }
    g.eyeBlinkLeft = Math.max(g.eyeBlinkLeft || 0, blink); g.eyeBlinkRight = Math.max(g.eyeBlinkRight || 0, blink);
    // glances: the eyes drift a little every so often and come back (eye contact is the resting state)
    if (this.t >= this.nextGlance) { const away = Math.random() < 0.35; this.glanceGoal = away ? { x: (Math.random() - 0.5) * 0.8, y: (Math.random() - 0.6) * 0.5 } : { x: 0, y: 0 }; this.nextGlance = this.t + (away ? 0.6 + Math.random() * 1.2 : 1.5 + Math.random() * 3); }
    this.glance.x = lerp(this.glance.x, this.glanceGoal.x, Math.min(1, dt * 12)); this.glance.y = lerp(this.glance.y, this.glanceGoal.y, Math.min(1, dt * 12));
    const gx = this.glance.x, gy = this.glance.y;
    if (gx > 0) { g.eyeLookOutLeft = gx; g.eyeLookInRight = gx; } else { g.eyeLookInLeft = -gx; g.eyeLookOutRight = -gx; }
    if (gy > 0) { g.eyeLookUpLeft = g.eyeLookUpRight = gy; } else { g.eyeLookDownLeft = g.eyeLookDownRight = -gy; }
    // ease toward the goal (mouth fast, the rest slower) and write the shapes
    for (const n of Object.keys(this.w)) if (!(n in g)) g[n] = 0;
    for (const [n, v] of Object.entries(g)) {
      const fast = n === 'eyeBlinkLeft' || n === 'eyeBlinkRight' || n.startsWith('jaw') || n.startsWith('mouth') || n.startsWith('eyeLook');
      this.w[n] = lerp(this.w[n] || 0, clamp01(v), Math.min(1, dt * (fast ? 22 : 6)));
      for (const t of this.targets[n] || []) t.mesh.morphTargetInfluences[t.index] = this.w[n];
    }
    // the head: small life while talking (a nod on a word now and then, a slow sway), a tilt when listening
    const talking = !!spoken, since = this.t - this.wordStart;
    this.nod = lerp(this.nod, talking && since < 0.25 && Math.random() < 0.08 ? 1 : 0, Math.min(1, dt * 10));
    const sway = talking ? 0.025 : 0.008;
    this.headAdd.pitch = lerp(this.headAdd.pitch, 0.06 * this.nod + sway * Math.sin(this.t * 1.3 + this.rnd), Math.min(1, dt * 6));
    this.headAdd.yaw = lerp(this.headAdd.yaw, sway * Math.sin(this.t * 0.7 + this.rnd * 2), Math.min(1, dt * 6));
    this.headAdd.roll = lerp(this.headAdd.roll, (this.listening ? 0.05 : 0) + sway * 0.6 * Math.sin(this.t * 0.9 + this.rnd * 3), Math.min(1, dt * 4));
  }
  // for a tuning page: every shape this body has, with its weight now
  shapes() { return Object.keys(this.targets).sort().map(n => ({ name: n, arkit: ARKIT.includes(n), weight: this.w[n] || 0 })); }
}
