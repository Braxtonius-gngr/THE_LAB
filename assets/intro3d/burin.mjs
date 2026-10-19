// THE BURIN: Burin & Brimstone's engraving (three.js).
//
// Everything in this skin's world is drawn the way a copperplate engraver
// draws it: the form is not shaded, it is HATCHED. A burin cuts a line
// into the plate; the line swells where the engraver leans in, so a dark
// passage is a line grown fat, and the darkest are crossed with a second
// and a third set of lines. The paper shows between the cuts. Printed, the
// ink stands a hair proud of the paper (intaglio) and catches the light.
// That is the craft the card back came from, and this module holds every
// surface of the hellscape to it.
//
// engravingMaterial(opts) makes a material that lights a surface with one
// key light and a sky, turns that into a tone, and prints the tone as
// hatching:
//   - the lines run in a fixed direction over each face (triplanar, so a
//     turning object's lines turn with it, as the plate's would), or along
//     the mesh's own UVs for a turned form (opts.uv = [su, sv]: a sphere's
//     meridians, a lathe's rings - the way an engraver follows a form),
//     and are cut analytically - sharp at any zoom, no texture to blur;
//   - their width follows the tone: a hairline in the light, swelling to
//     near-solid in the dark; a second set crosses at 60 degrees as the
//     tone passes the middle, a third below that;
//   - a dot of stipple sits in the lightest passages, as an engraver
//     stipples a highlight he will not leave blank;
//   - when the lines would fall under a pixel (far away, a steep face)
//     they dissolve into their mean tone, so there is no moire;
//   - a white-line plate (opts.invert): the ground is the ink and the lines
//     swell in the light instead - Bewick's way, the valley's;
//   - the ink is one colour (opts.ink) on one paper (opts.paper): the
//     iron-gall black of the valley, or the arterial red of what bleeds
//     (opts.blood blends the two by a mask, so blood can run down a form);
//   - a wet pass (opts.wet 0..1): fresh ink that has not dried - the lines
//     bleed a little wider and a sheen crosses them.
// Outlines: outlineOf(mesh) makes the inverted-hull line round a form, the
// engraver's contour, thick in the near foreground, a hair in the distance
// (sized in screen space).
//
// The paper is the page's own: BONE. The inks: INK (iron-gall, a black
// with brown in it) and BLOOD (arterial, and a darker clotted BLOOD_DRY).

import * as THREE from '../vendor/three/three.module.js';

export const BONE = new THREE.Color('#E8DCC0');
export const BONE_DARK = new THREE.Color('#CFC0A0');
export const INK = new THREE.Color('#1A0F0C');
export const BLOOD = new THREE.Color('#8E0E0E');
export const BLOOD_WET = new THREE.Color('#B81414');
export const EMBER = new THREE.Color('#D2451E');

// The key light's direction (toward the light), the hellscape's: low from
// the left, the glow of the burning valley; and a dim sky from above.
export const KEY = new THREE.Vector3(-0.55, 0.5, 0.67).normalize();

const VERT = /* glsl */`
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec2 vUv;
  varying float vDepth;
  #include <common>
  #include <skinning_pars_vertex>
  #include <morphtarget_pars_vertex>
  void main() {
    #include <beginnormal_vertex>
    #include <morphnormal_vertex>
    #include <skinbase_vertex>
    #include <skinnormal_vertex>
    #include <begin_vertex>
    #include <morphtarget_vertex>
    #include <skinning_vertex>
    vec4 w = modelMatrix * vec4(transformed, 1.0);
    vWorld = w.xyz;
    vNormalW = normalize(mat3(modelMatrix) * objectNormal);
    vUv = uv;
    vec4 mv = viewMatrix * w;
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */`
  precision highp float;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec2 vUv;
  varying float vDepth;
  uniform vec3 uPaper;
  uniform vec3 uInk;
  uniform vec3 uBlood;
  uniform vec3 uKey;
  uniform float uKeyI;
  uniform float uSky;
  uniform float uFreq;     // lines per world unit
  uniform float uAngle;    // the first set's angle on the face
  uniform float uTone;     // tone bias: + darker
  uniform float uWet;      // 0 dry .. 1 fresh
  uniform float uBloodLo;  // blood mask: below this height (object space y, world) it bleeds
  uniform float uBloodHi;
  uniform float uBloodOn;
  uniform float uBloodSpill; // 0..1 how far the blood has run (animated)
  uniform float uEmber;    // 0..1 ember glow in the darks (the valley's fire)
  uniform float uTime;
  uniform float uOpacity;
  uniform vec3 uCamPos;
  uniform float uWobble;   // the hand's drift along a line (0 ruled .. 3 loose)
  uniform float uInvert;   // 1: a white-line plate - the lines swell in the LIGHT (the ground is the ink)
  uniform float uUvMode;   // 1: the lines follow the mesh's own UVs (a lathe's rings, a sphere's meridians), scaled by uUvScale
  uniform vec2 uUvScale;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  // one set of lines across coordinate s: ink coverage 0..1 for width w
  // (as a share of the pitch), anti-aliased by the pixel's footprint
  float lines(float s, float w) {
    float d = abs(fract(s) - 0.5);          // 0 at the line's centre
    float aa = fwidth(s) * 0.9;
    float edge = w * 0.5;
    return 1.0 - smoothstep(edge - aa, edge + aa, d);
  }
  // the hatch at tone t (0 light .. 1 dark) over planar coords p
  float hatch(vec2 p, float t, float wobble) {
    float c = cos(uAngle), sn = sin(uAngle);
    vec2 d1 = vec2(c, sn), d2 = vec2(cos(uAngle + 1.0472), sin(uAngle + 1.0472)), d3 = vec2(cos(uAngle - 1.0472), sin(uAngle - 1.0472));
    // the hand's wobble: a slow drift along each line so no line is ruled
    float wob = (vnoise(p * 0.35) - 0.5) * wobble;
    float s1 = dot(p, d1) * uFreq + wob;
    float s2 = dot(p, d2) * uFreq * 0.93 + wob * 0.7;
    float s3 = dot(p, d3) * uFreq * 1.07 - wob * 0.5;
    // the first set from a hairline to a fat cut; the second comes in past
    // the middle tone, the third in the deep dark
    float w1 = mix(0.08, 0.78, smoothstep(0.0, 0.72, t));
    float w2 = mix(0.0, 0.62, smoothstep(0.42, 0.9, t));
    float w3 = mix(0.0, 0.5, smoothstep(0.7, 1.0, t));
    float ink = lines(s1, w1);
    ink = max(ink, lines(s2, w2) * step(0.001, w2));
    ink = max(ink, lines(s3, w3) * step(0.001, w3));
    // stipple in the light: a dot where the line would be too thin to cut
    vec2 cell = p * uFreq * 1.6;
    float dot_ = length(fract(cell) - 0.5);
    float sp = step(0.95, hash(floor(cell))) * (1.0 - smoothstep(0.12, 0.2, dot_)) * smoothstep(0.24, 0.05, t) * 0.7;
    ink = max(ink, sp);
    // where the lines fall under a pixel they dissolve into their mean
    float px = fwidth(s1);
    float mean = clamp(w1 + w2 * 0.6 + w3 * 0.4, 0.0, 1.0);
    return mix(ink, mean, smoothstep(0.45, 1.0, px));
  }
  void main() {
    vec3 n = normalize(vNormalW);
    if (!gl_FrontFacing) n = -n;
    // the tone: one key, a sky from above, the terminator pushed so the
    // form turns in three or four clear steps as an engraver cuts it
    float lam = max(dot(n, normalize(uKey)), 0.0);
    float sky = 0.5 + 0.5 * n.y;
    float lit = clamp(lam * uKeyI + sky * uSky, 0.0, 1.0);
    float t = clamp(pow(1.0 - lit, 0.85) + uTone, 0.0, 1.0);
    if (uInvert > 0.5) t = 1.0 - t;
    // a rim toward the lens stays light (the plate's bevel of light)
    vec3 v = normalize(uCamPos - vWorld);
    float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
    t = clamp(t + (uInvert > 0.5 ? -rim * 0.3 : -rim * 0.18), 0.0, 1.0);
    // triplanar: the face's dominant axis picks the plane the lines lie on
    vec3 an = abs(n);
    vec2 p = an.y > max(an.x, an.z) ? vWorld.xz : (an.x > an.z ? vWorld.zy : vWorld.xy);
    if (uUvMode > 0.5) p = vUv * uUvScale;
    // blood: a mask by height that runs down with spill, its edge ragged
    float bm = 0.0;
    if (uBloodOn > 0.5) {
      float h = (vWorld.y - uBloodLo) / max(0.001, uBloodHi - uBloodLo);  // 1 at the top of the band, 0 at its foot
      float run = uBloodSpill;                                           // how far down it has got
      float rag = (vnoise(p * 2.1 + 7.0) - 0.5) * 0.35 + (vnoise(p * 9.0) - 0.5) * 0.08;
      // runs: narrow streaks that go further than the body of it
      float streak = pow(vnoise(vec2(p.x * 6.0, 3.0)), 3.0) * 0.9;
      bm = smoothstep(0.02, -0.02, h - (1.0 - run) + rag + streak * run * 0.6);
      bm *= step(0.0, h + 0.5);
    }
    // the wet pass: fresh ink spreads a little wider and the tone deepens
    // (blood is always a darker passage than the skin it runs on)
    float tt = clamp(t + bm * 0.3 + uWet * 0.12 * max(bm, 0.3), 0.0, 1.0);
    float ink = hatch(p, tt, uWobble);
    // ember: in the darks, the ink glows from under (the valley burning)
    vec3 inkCol = mix(uInk, uBlood, bm);
    vec3 ember = vec3(0.82, 0.27, 0.12);
    float dark = uInvert > 0.5 ? 1.0 - t : t;
    inkCol = mix(inkCol, ember, uEmber * smoothstep(0.55, 1.0, dark) * (0.5 + 0.5 * sin(uTime * 1.7 + vWorld.x * 0.3 + vWorld.z * 0.2)));
    // the paper: a hair darker where the form turns from the light, the
    // plate tone an engraver leaves in the shadows
    vec3 paper = mix(uPaper, uPaper * 0.86, smoothstep(0.5, 1.0, dark) * 0.6);
    vec3 col = mix(paper, inkCol, ink);
    // wet blood: a sheen across it, toward the lens
    float sheen = uWet * bm * pow(max(dot(reflect(-normalize(uKey), n), v), 0.0), 18.0) * 0.5;
    col += sheen;
    gl_FragColor = vec4(col, uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// A sharable set of uniforms (uTime, uCamPos are driven per frame by
// burinTick(); the rest are the material's own).
export function engravingMaterial(opts = {}) {
  const o = Object.assign({ paper: BONE, ink: INK, blood: BLOOD, freq: 1.1, angle: -0.6, tone: 0.0, wet: 0, bloodOn: false, bloodLo: 0, bloodHi: 1, spill: 0, ember: 0, sky: 0.28, keyI: 1.0, transparent: false, opacity: 1, side: THREE.FrontSide, uv: null, invert: false, wobble: 0.6 }, opts);
  const m = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG,
    uniforms: {
      uPaper: { value: o.paper.clone() }, uInk: { value: o.ink.clone() }, uBlood: { value: o.blood.clone() },
      uKey: { value: KEY.clone() }, uKeyI: { value: o.keyI }, uSky: { value: o.sky },
      uFreq: { value: o.freq }, uAngle: { value: o.angle }, uTone: { value: o.tone }, uWet: { value: o.wet },
      uBloodLo: { value: o.bloodLo }, uBloodHi: { value: o.bloodHi }, uBloodOn: { value: o.bloodOn ? 1 : 0 }, uBloodSpill: { value: o.spill },
      uEmber: { value: o.ember }, uTime: { value: 0 }, uOpacity: { value: o.opacity }, uCamPos: { value: new THREE.Vector3() },
      uInvert: { value: o.invert ? 1 : 0 }, uWobble: { value: o.wobble }, uUvMode: { value: o.uv ? 1 : 0 }, uUvScale: { value: new THREE.Vector2(o.uv ? o.uv[0] : 1, o.uv ? o.uv[1] : 1) }
    },
    transparent: o.transparent, side: o.side, lights: false, fog: false
  });
  m.userData.burin = true;
  return m;
}

// The contour: an inverted hull a few screen pixels proud of the form, in
// ink, drawn behind it. px: the line's thickness on screen at the near
// distance, thinning with distance (an engraver's outline is heavier in
// the foreground).
const OUT_VERT = /* glsl */`
  uniform float uPx;
  uniform vec2 uViewport;
  #include <common>
  #include <skinning_pars_vertex>
  void main() {
    #include <beginnormal_vertex>
    #include <skinbase_vertex>
    #include <skinnormal_vertex>
    #include <begin_vertex>
    #include <skinning_vertex>
    vec4 mv = modelViewMatrix * vec4(transformed, 1.0);
    vec3 nv = normalize(normalMatrix * objectNormal);
    vec4 clip = projectionMatrix * mv;
    // push along the screen-space normal by uPx pixels, thinning far off
    vec2 off = normalize(nv.xy + vec2(1e-5)) * uPx * clip.w / uViewport * 2.0;
    float far = clamp(1.0 - (-mv.z) / 900.0, 0.35, 1.0);
    clip.xy += off * far;
    gl_Position = clip;
  }
`;
const OUT_FRAG = /* glsl */`
  uniform vec3 uInk;
  void main() { gl_FragColor = vec4(uInk, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment> }
`;
export function outlineMaterial(px = 2.2, ink = INK) {
  return new THREE.ShaderMaterial({ vertexShader: OUT_VERT, fragmentShader: OUT_FRAG, uniforms: { uPx: { value: px }, uViewport: { value: new THREE.Vector2(1, 1) }, uInk: { value: ink.clone() } }, side: THREE.BackSide, depthWrite: true });
}
export function outlineOf(mesh, px = 2.2, ink = INK) {
  const o = new THREE.Mesh(mesh.geometry, outlineMaterial(px, ink));
  o.userData.outline = true;
  o.renderOrder = -1;
  if (mesh.isSkinnedMesh) { const s = new THREE.SkinnedMesh(mesh.geometry, o.material); s.bind(mesh.skeleton, mesh.bindMatrix); s.userData.outline = true; s.renderOrder = -1; mesh.add(s); return s; }
  mesh.add(o);
  return o;
}

// Each frame: the camera's place and the clock into every burin material
// under root, the viewport into every outline.
const _v2 = new THREE.Vector2();
// key: the light's direction in world space (a room passes its own, turned
// with its seat; by default KEY as it stands).
export function burinTick(root, camera, renderer, t, key = null) {
  renderer.getDrawingBufferSize(_v2);
  root.traverse(obj => {
    const mats = obj.material ? [].concat(obj.material) : [];
    for (const m of mats) {
      if (m.userData && m.userData.burin) { m.uniforms.uTime.value = t; m.uniforms.uCamPos.value.copy(camera.position); if (key) m.uniforms.uKey.value.copy(key); }
      else if (m.uniforms && m.uniforms.uViewport) m.uniforms.uViewport.value.copy(_v2);
    }
  });
}

// The paper itself: the page's bone, with the plate's grain - a very faint
// hatch of the paper's laid lines and the plate tone, for grounds the
// engraver left "white".
export function paperMaterial(opts = {}) {
  return engravingMaterial(Object.assign({ tone: -0.35, freq: 1.4, sky: 0.6, keyI: 0.5 }, opts));
}
