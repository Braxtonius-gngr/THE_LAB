// Face: what a man's face does - his mood on it, blinks and glances, his mouth when he talks.
// Runs every frame beside the reflexes (world/reflexes.mjs does the head and neck; this does
// everything inside the face). It drives ARKit-named blendshapes (eyeBlinkLeft, jawOpen,
// mouthSmileLeft, browInnerUp, ...) wherever the body has them: a head mesh with those morph
// targets, made in Blender with Faceit (tools/face/README.md). A body with no face shapes
// still gets the timing of all this - blinks, glances, speech rhythm - as small head motion
// (headAdd), which the reflexes add on top of the gaze, so he reads as alive and talking even
// before his face can move.
//
// Until a body has shapes, the skin path does the eyes and brows on the fused head itself
// (bodies.json `face`: the eye and brow anchors in the mesh's own vertex space, picked on
// lab/face.html): a patch on the body's material slides a lid of skin over each painted eye
// for blinks and heavy lids, lifts or lowers the brow vertices with the mood, and lets the
// iris slide a few millimetres for glances. The mouth is a stopgap until the shapes come: the
// jaw drops a few millimetres on the vowels and the lip line opens dark between the lips,
// the corners lift or fall with the mood. There is no inner mouth to show, so it stays small;
// `mouthOn` (localStorage lab.face.mouth, lab/face.html) turns it off if it reads wrong.
//
//   const face = new Face(model, { skin: spec.face });   // finds every mesh with morph targets; else the skin path
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

// --- the skin path's shader pieces (spliced into the body's MeshStandardMaterial) ---
const SKIN_PARS = `
uniform float uFaceA; uniform vec3 uFaceUp, uFaceRight, uFaceFwd;
uniform vec3 uEyeP[2]; uniform vec2 uEyeHalf, uBlink, uLook; uniform vec3 uLidCol[2];
uniform vec3 uBrowP[6]; uniform float uBrowD[6]; uniform float uBrowR;
uniform vec3 uMouthP; uniform vec3 uMouthC[2]; uniform vec2 uMouthHalf; uniform float uJaw, uMouthOn, uPinch; uniform vec4 uCorner;
`;
// brows lift or lower round their anchors; on a blink the lids pinch toward each other a little (the silhouette)
const SKIN_VERTEX = `
vFaceP = transformed;
{ float fa = uFaceA; vec3 fd = vec3(0.0);
  for (int i = 0; i < 6; i++) { float r = distance(transformed, uBrowP[i]) / (uBrowR * fa); float f = max(0.0, 1.0 - r * r); fd += uFaceUp * (uBrowD[i] * fa * f * f); }
  for (int i = 0; i < 2; i++) { vec3 q = transformed - uEyeP[i]; float x = dot(q, uFaceRight) / (uEyeHalf.x * fa * 1.3), y = dot(q, uFaceUp) / (uEyeHalf.y * fa * 2.2);
    float f = max(0.0, 1.0 - x * x - y * y); fd += uFaceUp * (-sign(y) * 0.0012 * fa * f * uBlink[i] * uPinch); }
  if (uMouthOn > 0.5) {
    // the jaw: what lies below the lip line drops, more toward the chin (it swings from the ears), fading at the
    // jaw's angle and, close to the lips, toward the corners (the cheeks hold them)
    vec3 q = transformed - uMouthP; float mx = dot(q, uFaceRight) / fa, my = dot(q, uFaceUp) / fa, mz = dot(q, uFaceFwd) / fa;
    if (mz > -0.07 && mz < 0.03 && abs(mx) < 0.07 && my > -0.08 && my < 0.02) {
      float below = smoothstep(0.0015, -0.0035, my), swing = mix(0.6, 1.0, smoothstep(0.0, -0.03, my));
      float corner = mix(smoothstep(uMouthHalf.x * 1.15, uMouthHalf.x * 0.45, abs(mx)), 1.0 - smoothstep(0.035, 0.065, abs(mx)), smoothstep(-0.004, -0.02, my));
      fd += uFaceUp * (-uJaw * fa * below * swing * corner * smoothstep(-0.07, -0.03, mz));
    }
    for (int i = 0; i < 2; i++) { float r = distance(transformed, uMouthC[i]) / (0.014 * fa); float f = max(0.0, 1.0 - r * r); f *= f;
      vec2 c = i == 0 ? uCorner.xy : uCorner.zw; fd += (uFaceUp * c.x + uFaceRight * (i == 0 ? c.y : -c.y)) * fa * f; }
  }
  transformed += fd; }
`;
// the eye: the iris slides with the glance (the texture lookup moves, through the screen-space
// derivatives so it follows the texture island whichever way it lies); the lid comes down over
// the painted eye as skin, with a lash line and a crease shadow at its edge
const SKIN_MAP = `
#ifdef USE_MAP
  vec2 fUv = vMapUv; float lidMix = 0.0, lash = 0.0; vec3 lidCol = vec3(0.0);
  vec3 fpx = dFdx(vFaceP), fpy = dFdy(vFaceP); vec2 fux = dFdx(vMapUv), fuy = dFdy(vMapUv);
  { float fa = uFaceA;
    for (int i = 0; i < 2; i++) {
      vec3 q = vFaceP - uEyeP[i]; float dz = dot(q, uFaceFwd) / fa;
      if (abs(dz) < 0.02) {
        float x = dot(q, uFaceRight) / (uEyeHalf.x * fa), y = dot(q, uFaceUp) / (uEyeHalf.y * fa); float e = x * x + y * y;
        float iris = smoothstep(1.0, 0.45, e);
        if (iris > 0.0) {
          vec3 dW = (uFaceRight * uLook.x + uFaceUp * uLook.y) * fa;
          float a11 = dot(fpx, fpx), a12 = dot(fpx, fpy), a22 = dot(fpy, fpy), det = a11 * a22 - a12 * a12;
          if (det > 1e-24) { float b1 = dot(dW, fpx), b2 = dot(dW, fpy); float s = (b1 * a22 - b2 * a12) / det, t = (a11 * b2 - a12 * b1) / det; fUv -= (fux * s + fuy * t) * iris; }
        }
        float b = uBlink[i];
        if (b > 0.001) {
          float yl = 1.3 - 2.5 * b, inside = smoothstep(1.7, 1.1, e);
          float cover = smoothstep(yl - 0.12, yl + 0.12, y) * inside, edge = exp(-pow((y - yl) / 0.16, 2.0)) * inside;
          lidMix = max(lidMix, cover); lidCol = uLidCol[i]; lash = max(lash, edge * b);
        }
      }
    }
  }
  vec4 sampledDiffuseColor = texture2D(map, fUv);
  #ifdef DECODE_VIDEO_TEXTURE
    sampledDiffuseColor = sRGBTransferEOTF(sampledDiffuseColor);
  #endif
  if (uMouthOn > 0.5 && uJaw > 0.0002) {
    // the band of texture on the lip line is what the jaw stretches apart: it darkens into the opening
    vec3 q = vFaceP - uMouthP; float fa = uFaceA; float mx = dot(q, uFaceRight) / fa, my = dot(q, uFaceUp) / fa, mz = dot(q, uFaceFwd) / fa;
    if (abs(mz) < 0.03) { float band = exp(-pow((my + 0.0004) / 0.0014, 2.0)) * (1.0 - smoothstep(uMouthHalf.x * 0.7, uMouthHalf.x * 1.05, abs(mx)));
      sampledDiffuseColor.rgb *= 1.0 - 0.85 * band * smoothstep(0.0002, 0.003, uJaw); }
  }
  sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, lidCol, lidMix);
  sampledDiffuseColor.rgb *= 1.0 - 0.4 * lash;
  diffuseColor *= sampledDiffuseColor;
#endif
`;

export class Face {
  constructor(model, { skin = null, THREE = null } = {}) {
    this.targets = {};   // shape name -> [{ mesh, index }]
    model.traverse(o => { if (o.isMesh && o.morphTargetDictionary) for (const [n, i] of Object.entries(o.morphTargetDictionary)) (this.targets[n] = this.targets[n] || []).push({ mesh: o, index: i }); });
    this.has = ARKIT.some(n => this.targets[n]);
    this.skin = null; this.lookOverride = null; this.hold = {};   // hold: shape weights a tuning page pins (lab/face.html)
    // the skin path runs whenever a body has face anchors: on its own for a body without shapes; eyes
    // only (lids, iris) beside the shapes otherwise, because a painted eye has no eyeball for a blink
    // shape to close over - the lid of skin coming down is what reads as a blink
    if (skin && skin.eyeL && skin.eyeR) { try { this._skin(model, skin, THREE); } catch (e) { console.warn('face: skin path off', e); } }
    this.skinEyesOnly = this.has;
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
    Object.assign(g, this.hold);
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
    if (this.skin) this._skinUpdate();
  }
  // ---- the skin path: eyes and brows on a body with no face shapes ----
  _skin(model, spec, THREE) {
    // THREE comes from the caller (the module keeps no import of its own so the vendored copy stays the only one)
    if (!THREE) THREE = globalThis.THREE || null;
    let mesh = null; model.traverse(o => { if (!mesh && o.isSkinnedMesh && o.material && o.material.map) mesh = o; });
    if (!mesh || !THREE) return;
    model.updateMatrixWorld(true);
    // the mesh's vertex space -> the model's: its rotation gives up/right/forward in vertex space, its scale the unit
    const M = new THREE.Matrix4().copy(model.matrixWorld).invert().multiply(mesh.matrixWorld);
    const pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(); M.decompose(pos, q, sc); const qi = q.clone().invert();
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(qi).normalize(), right = new THREE.Vector3(1, 0, 0).applyQuaternion(qi).normalize(), fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(qi).normalize();
    const A = 1 / sc.x;   // vertex units per metre
    const v3 = a => new THREE.Vector3().fromArray(a);
    const brows = ['browLin', 'browL', 'browLout', 'browRin', 'browR', 'browRout'].map(k => spec[k] ? v3(spec[k]) : null);
    for (let i = 0; i < 6; i++) if (!brows[i]) brows[i] = (i < 3 ? v3(spec.eyeL) : v3(spec.eyeR)).addScaledVector(up, 0.014 * A);   // a brow 14 mm above the eye if none was picked
    const eye = spec.eye || { w: 0.0155, h: 0.0053 };
    const u = {
      uFaceA: { value: A }, uFaceUp: { value: up }, uFaceRight: { value: right }, uFaceFwd: { value: fwd },
      uEyeP: { value: [v3(spec.eyeL), v3(spec.eyeR)] }, uEyeHalf: { value: new THREE.Vector2(eye.w, eye.h) },
      uBlink: { value: new THREE.Vector2(0, 0) }, uLook: { value: new THREE.Vector2(0, 0) },
      uLidCol: { value: [new THREE.Color(0.5, 0.35, 0.3), new THREE.Color(0.5, 0.35, 0.3)] },
      uBrowP: { value: brows }, uBrowD: { value: [0, 0, 0, 0, 0, 0] }, uBrowR: { value: 0.013 },
      uMouthP: { value: spec.mouth ? v3(spec.mouth) : v3(spec.eyeL).lerp(v3(spec.eyeR), 0.5).addScaledVector(up, -0.07 * A) },
      uMouthC: { value: [spec.mouthL ? v3(spec.mouthL) : null, spec.mouthR ? v3(spec.mouthR) : null] },
      uMouthHalf: { value: new THREE.Vector2((spec.lips || {}).w || 0.019, (spec.lips || {}).h || 0.006) },
      uJaw: { value: 0 }, uCorner: { value: new THREE.Vector4(0, 0, 0, 0) }, uMouthOn: { value: 0 }, uPinch: { value: 1 },
    };
    const mp = u.uMouthP.value, mw = u.uMouthHalf.value.x * A;
    if (!u.uMouthC.value[0]) u.uMouthC.value[0] = mp.clone().addScaledVector(right, mw); if (!u.uMouthC.value[1]) u.uMouthC.value[1] = mp.clone().addScaledVector(right, -mw);
    this.hasMouth = !!spec.mouth;
    let on = true; try { on = localStorage.getItem('lab.face.mouth') !== '0'; } catch (_) { /* default on */ }
    this.mouthOn = on;
    this.skin = { mesh, u, A, up, right, fwd, THREE };
    this._lidColours(mesh, spec, u, THREE);
    const m = mesh.material; if (m.userData.faceSkin) return;
    const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
    m.onBeforeCompile = (sh, r) => {
      if (prev) prev.call(m, sh, r);
      Object.assign(sh.uniforms, u);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\n' + SKIN_PARS + 'varying vec3 vFaceP;\n')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + SKIN_VERTEX);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\n' + SKIN_PARS + 'varying vec3 vFaceP;\n')
        .replace('#include <map_fragment>', SKIN_MAP);
    };
    m.customProgramCacheKey = () => (prevKey ? prevKey.call(m) : '') + '|face';
    m.userData.faceSkin = true; m.needsUpdate = true;
  }
  // the colour of the lid that comes down: skin read off the body texture near the eye. Several
  // spots are tried (the lid, the forehead above the brow); the brightest wins, since brow hair,
  // lashes and the shadow painted round a deep-set eye are all darker than the skin itself.
  _lidColours(mesh, spec, u, THREE) {
    const img = mesh.material.map.image; if (!img || !img.width) return;
    const g = mesh.geometry, pos = g.attributes.position, uv = g.attributes.uv; if (!uv) return;
    const { A, up } = this.skin;
    const W = img.width, H = img.height, flip = mesh.material.map.flipY;
    let ctx = null; try { const c = document.createElement('canvas'); c.width = W; c.height = H; ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0); } catch (_) { return; }
    const tone = new THREE.Color(spec.tone || '#c48b74');
    const med = a => a.sort((x, y) => x - y)[a.length >> 1] / 255;
    const sampleAt = t => {   // the median texel colour round the vertex nearest t (vertex space), or null
      let best = -1, bd = Infinity;
      for (let k = 0; k < pos.count; k++) { const dx = pos.getX(k) - t.x, dy = pos.getY(k) - t.y, dz = pos.getZ(k) - t.z, d = dx * dx + dy * dy + dz * dz; if (d < bd) { bd = d; best = k; } }
      if (best < 0 || Math.sqrt(bd) > 0.006 * A) return null;
      const px = Math.round(uv.getX(best) * W), py = Math.round((flip ? 1 - uv.getY(best) : uv.getY(best)) * H);
      let d; try { d = ctx.getImageData(Math.max(0, px - 3), Math.max(0, py - 3), 7, 7).data; } catch (_) { return null; }
      const ch = [[], [], []]; for (let k = 0; k < d.length; k += 4) { if (d[k + 3] < 128) continue; ch[0].push(d[k]); ch[1].push(d[k + 1]); ch[2].push(d[k + 2]); }
      return ch[0].length ? [med(ch[0]), med(ch[1]), med(ch[2])] : null;
    };
    [[spec.eyeL, spec.browL], [spec.eyeR, spec.browR]].forEach(([e, b], i) => {
      const E = new THREE.Vector3().fromArray(e), B = b ? new THREE.Vector3().fromArray(b) : E.clone().addScaledVector(up, 0.014 * A);
      const spots = [[E, 0.007, 1], [E, 0.009, 1], [B, 0.010, 0.92], [B, 0.014, 0.92]];   // [from, metres up, dimming for the forehead]
      let pick = null, lum = -1;
      for (const [from, m, dim] of spots) { const c = sampleAt(from.clone().addScaledVector(up, m * A)); if (!c) continue; const l = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]; if (l > lum) { lum = l; pick = c.map(v => v * dim); } }
      if (pick) u.uLidCol.value[i].setRGB(pick[0], pick[1], pick[2], THREE.SRGBColorSpace); else u.uLidCol.value[i].copy(tone);
    });
  }
  _skinUpdate() {
    const { u } = this.skin, w = this.w, W = n => w[n] || 0;
    u.uBlink.value.set(W('eyeBlinkLeft'), W('eyeBlinkRight'));
    // the iris slides a few millimetres: +x is his left
    const lx = this.lookOverride ? this.lookOverride.x : (W('eyeLookOutLeft') + W('eyeLookInRight') - W('eyeLookInLeft') - W('eyeLookOutRight')) / 2;
    const ly = this.lookOverride ? this.lookOverride.y : (W('eyeLookUpLeft') + W('eyeLookUpRight') - W('eyeLookDownLeft') - W('eyeLookDownRight')) / 2;
    u.uLook.value.set(lx * 0.0035, ly * 0.002);
    // the mouth stopgap: jaw drop in metres from the vowels (m/b/p close it), corners from the mood
    const on = this.mouthOn && this.hasMouth && !this.skinEyesOnly; u.uMouthOn.value = on ? 1 : 0; u.uPinch.value = this.skinEyesOnly ? 0 : 1;
    const jaw = Math.max(0, W('jawOpen') * (1 - 0.7 * W('mouthClose')) + 0.25 * W('mouthFunnel') + 0.15 * W('mouthPucker'));
    u.uJaw.value = on ? Math.min(0.011, jaw * 0.011) : 0;
    const st = (W('mouthStretchLeft') + W('mouthStretchRight')) / 2, pk = Math.min(1, W('mouthPucker') + W('mouthFunnel'));
    const cornerUp = L => 0.004 * W('mouthSmile' + L) - 0.003 * W('mouthFrown' + L), cornerOut = L => 0.003 * W('mouthSmile' + L) + 0.0015 * st - 0.003 * pk;
    if (on) u.uCorner.value.set(cornerUp('Left'), cornerOut('Left'), cornerUp('Right'), cornerOut('Right')); else u.uCorner.value.set(0, 0, 0, 0);
    // brows, in metres of lift: inner, middle, outer, his left then his right
    const inner = this.skinEyesOnly ? 0 : 0.005 * W('browInnerUp'), d = u.uBrowD.value;
    if (this.skinEyesOnly) { d.fill(0); return; }
    for (const [s, L] of [[0, 'Left'], [3, 'Right']]) {
      const down = W('browDown' + L), outer = W('browOuterUp' + L);
      d[s] = inner - 0.004 * down; d[s + 1] = 0.35 * inner + 0.002 * outer - 0.0042 * down; d[s + 2] = 0.004 * outer - 0.0025 * down;
    }
  }
  // for a tuning page: every shape this body has, with its weight now
  shapes() { return Object.keys(this.targets).sort().map(n => ({ name: n, arkit: ARKIT.includes(n), weight: this.w[n] || 0 })); }
}
