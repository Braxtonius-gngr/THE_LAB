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
//   - the lines run WITH THE FORM: each plate has an axis (opts.axis, in
//     object space - the form's length by default), and on every face the
//     lines run along it as it lies on that face (a post cut up its length,
//     a plank along its grain, a limb along the limb, a dome in meridians;
//     a face the axis stands square to - a post's end - takes opts.angle);
//     or along the mesh's own UVs for a turned form (opts.uv = [su, sv]);
//     and are cut analytically - sharp at any zoom, no texture to blur;
//   - their pitch is held on screen (opts.pitch, pixels between lines):
//     where the frequency would crowd them the hatch drops an octave, two
//     octaves blended, so a far figure is cut with fewer, bolder lines and
//     nothing dissolves into a grey (a printed block has no grey);
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
//     bleed a little wider and the passage darkens (no sheen: a print has
//     no specular).
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
  varying vec3 vAxisW;
  varying vec2 vTone;
  // the form's own frame, for a plate whose lines wrap the form (uForm):
  varying vec3 vAlongO;   // the hull's direction at this point (aAlong, carried by its bones), object space; zero on a mesh that has none
  varying vec3 vNormalO;  // the normal in the same space
  varying vec3 vLocal;    // the point as it stands now (posed, the soft tissue out), object space: the lines are laid in it, so they bend with it
  varying vec3 vBind;     // the point at rest: the hand's wobble and the stipple are fixed to the skin by it
  varying float vTaut;    // 0..1: cloth drawn taut over what is under it (UniversalClothMaterial's ucTaut)
  varying float vScale;   // the object's scale in the world, so a pitch in its units prints the same on every man
  attribute vec2 aTone;
  attribute vec3 aAlong;
  uniform vec3 uAxis;
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
    vec3 alongO = aAlong;
    #ifdef USE_SKINNING
      alongO = (skinMatrix * vec4(alongO, 0.0)).xyz;
    #endif
    vAlongO = alongO;
    vNormalO = objectNormal;
    vLocal = transformed;
    vBind = position;
    vScale = length(modelMatrix[1].xyz);
    #ifdef UC_TAUT
      vTaut = ucTaut;
    #else
      vTaut = 0.0;
    #endif
    vec4 w = modelMatrix * vec4(transformed, 1.0);
    vWorld = w.xyz;
    vNormalW = normalize(mat3(modelMatrix) * objectNormal);
    vAxisW = normalize(mat3(modelMatrix) * uAxis);
    vUv = uv;
    vTone = aTone;
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
  varying vec3 vAxisW;
  varying vec2 vTone;
  varying vec3 vAlongO;
  varying vec3 vNormalO;
  varying vec3 vLocal;
  varying vec3 vBind;
  varying float vTaut;
  varying float vScale;
  uniform float uForm;     // >0: the lines wrap the form - laid round each hull square to its aAlong, the shade crossed at 60 degrees (the value: the pitch, as a factor on uFreq)
  uniform float uStip;     // 0..1: a stipple in the lit flat of a wrapped form - dots in the hatch's gaps, fixed to the skin
  uniform float uLean;     // how far the wrapped form's rings lean along it (0 a lathe's rings)
  uniform float uBare;     // the tone below which a plane is left as bare paper (a figure's lights held open wider than the land's)
  uniform float uToneMap;  // >0: the tone laid in from aTone (x: the value, y: how much of it) - an engraver's planned passage, the light only modelling it
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
  uniform float uFlip;     // 0..1: dissolved to the freed negative - the ground ink, the light cut in bone lines, no blood
  uniform float uGhost;    // 0..1: faded into the ground (Death, while a soul stands freed)
  uniform float uUvMode;   // 1: the lines follow the mesh's own UVs (a lathe's rings, a sphere's meridians), scaled by uUvScale
  uniform vec2 uUvScale;
  uniform vec2 uScroll;    // the lines' drift along the plane (a river's current, smoke)
  uniform float uSteps;    // >0: the tone cut in this many steps, as an engraver turns a form in three or four
  uniform float uAxisOn;   // 1: the lines run with the form's long axis (uAxis, object space) wherever the face lets them
  uniform float uPitchPx;  // >0: the lines keep about this many pixels between them on screen - far off, fewer bolder lines, never a grey
  uniform vec4 uRing;      // w > 0: the lines laid in rings round (x, y) in world xz, computed per pixel - a ring uv interpolated across the mesh's faces kinked at every edge into a zip; z: past this radius each line stands for twice the ground
  uniform float uWobF;     // the hand's drift's scale (per unit): slow on the land, so a line undulates and never jitters
  uniform float uSwell;    // 0..1: each line swells and tapers along its length, as a burin's cut does

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  // one set of lines across coordinate s: ink coverage 0..1 for width w
  // (as a share of the pitch), box-filtered over the pixel's footprint - so
  // a line thinner than a pixel greys in proportion and never widens (a
  // smoothstep edge turned every hairline into a half-grey band the width
  // of a pixel, and ruled the lights that a cutter leaves as bare paper)
  float lines(float s, float w) {
    float d = abs(fract(s) - 0.5);          // 0 at the line's centre
    float aa = max(fwidth(s), 1e-4);        // the pixel's width, in pitches
    float edge = w * 0.5;
    float lo = max(d - aa * 0.5, -edge), hi = min(d + aa * 0.5, edge);
    return clamp((hi - lo) / aa, 0.0, 1.0);
  }
  vec2 rot2(vec2 d, float a) { float c = cos(a), sn = sin(a); return vec2(c * d.x - sn * d.y, sn * d.x + c * d.y); }
  // one octave of the three sets at frequency f over planar coords p,
  // the first set across direction d1 (its lines run along perp(d1))
  // (a cutter crosses his lines square, at the same pitch, and only in the
  // deep passages; a third set, on the diagonal, only in the darkest - sets
  // at odd angles and pitches beat against each other into a moire)
  float sets(vec2 p, vec2 d1, float f, float w1, float w1b, float w2, float w3, float wob) {
    vec2 d2 = vec2(-d1.y, d1.x), d3 = normalize(d1 + d2);
    float ink = lines(dot(p, d1) * f + wob, w1);
    // (into the shade the cutter closes his lines up: a line between each
    // pair of the first set, so the pitch halves before any set crosses)
    ink = max(ink, lines(dot(p, d1) * f + 0.5 + wob, w1b) * step(0.001, w1b));
    ink = max(ink, lines(dot(p, d2) * f + wob * 0.7, w2) * step(0.001, w2));
    ink = max(ink, lines(dot(p, d3) * f * 1.4142 - wob * 0.5, w3) * step(0.001, w3));
    return ink;
  }
  // the hatch at tone t (0 light .. 1 dark) over planar coords p, the
  // lines running along the vector along (a unit vector in the plane)
  float hatch(vec2 p, vec2 along, float t, float wobble) {
    vec2 d1 = vec2(-along.y, along.x);
    // the hand's wobble: a slow drift along each line so no line is ruled
    float wob = (vnoise(p * uWobF) - 0.5) * wobble;
    // the first set from a hairline to a fat cut; the second comes in past
    // the middle tone, the third in the deep dark
    // (the lit plane is left as paper: no line at all until the form turns)
    // (and into the shade the lines close up: a second line comes between
    // each pair, and the first thin as it does, so the pitch halves and the
    // passage darkens without going to a solid)
    float close_ = smoothstep(0.5, 0.8, t);
    float w1 = mix(0.0, 0.7, smoothstep(uBare, 0.7, t)) * (1.0 - 0.35 * close_);
    float w1b = 0.42 * close_;
    // (the burin's swell: a line opens and closes along its length, slowly,
    // each line on its own - one weight end to end read as a plotted trace)
    if (uSwell > 0.0) { float sw = 1.0 + uSwell * (vnoise(vec2(dot(p, along) * 0.035, floor(dot(p, d1) * uFreq + wob) * 1.37)) - 0.5) * 2.0; w1 *= sw; w1b *= sw; }
    float w2 = mix(0.0, 0.42, smoothstep(0.62, 0.95, t));
    float w3 = mix(0.0, 0.3, smoothstep(0.8, 1.0, t));
    // (cloth drawn taut over a form under it: the lines close up over it)
    float fq = uFreq * (1.0 + 0.55 * vTaut);
    float ink;
    if (uPitchPx > 0.0) {
      // the pitch held on screen: where uFreq would put more than one
      // line per uPitchPx pixels, drop an octave (half the lines), and
      // blend the two octaves so nothing pops as it recedes
      float lpp = fwidth(dot(p, d1)) * fq;                // lines per pixel at fq
      float k = max(0.0, log2(max(lpp * uPitchPx, 1e-5)));
      float k0 = floor(k), fr = k - k0;
      float f0 = fq * exp2(-k0), f1 = f0 * 0.5;
      ink = mix(sets(p, d1, f0, w1, w1b, w2, w3, wob), sets(p, d1, f1, w1, w1b, w2, w3, wob), smoothstep(0.0, 1.0, fr));
    } else {
      ink = sets(p, d1, fq, w1, w1b, w2, w3, wob);
      // where the lines fall under a pixel they dissolve into their mean
      float px = fwidth(dot(p, d1) * fq);
      float mean = clamp(w1 + w1b + w2 * 0.6 + w3 * 0.4, 0.0, 1.0);
      ink = mix(ink, mean, smoothstep(0.45, 1.0, px));
    }
    // stipple in the light: a dot where the line would be too thin to cut
    vec2 cell = p * uFreq * 1.6;
    float dot_ = length(fract(cell) - 0.5);
    float sp = step(0.965, hash(floor(cell))) * (1.0 - smoothstep(0.12, 0.2, dot_)) * smoothstep(0.3, 0.12, t) * smoothstep(0.04, 0.1, t) * 0.6 * (1.0 - uFlip);   // (no flecks in the negative: they print as salt)
    return max(ink, sp);
  }
  // the three sets of a wrapped form at frequency f: the first in rings
  // round the hull (s1: the distance along it), the second across them at
  // the engraver's 60 degrees, the third on the other diagonal
  float setsForm(float s1, float s2, float s3, float f, float w1, float w2, float w3, float wob) {
    float ink = lines(s1 * f + wob, w1);
    ink = max(ink, lines(s2 * f + wob * 0.7, w2) * step(0.001, w2));
    ink = max(ink, lines(s3 * f - wob * 0.5, w3) * step(0.001, w3));
    return ink;
  }
  // the hatch of a form the lines wrap (uForm): a burin follows the form,
  // so the first set runs round each limb and the trunk's girth, square to
  // the hull's own direction (vAlongO, carried by the bones, so the rings
  // turn with the joints), laid in the posed object space (vLocal: a belly
  // pulsed out bends them). The light is not a darker hatch: into the shade
  // a second set crosses the first at 60 degrees over the terminator, and a
  // third, the other way, only in the deepest cores - the tone cut in a few
  // plate steps, never a gradient. A stipple in the lit flat, in the gaps.
  float hatchForm(float t, float wobble) {
    vec3 n = normalize(vNormalO);
    vec3 a = vAlongO - n * dot(vAlongO, n);
    float la = length(a);
    // (where the face turns square to the hull's direction - the top of
    // the shoulder, a dome - the direction projects to nothing and the
    // rings swirled; it eases over to a fixed one there, lines laid across
    // the form's side-to-side)
    vec3 af = cross(n, vec3(1.0, 0.0, 0.0)); float lf = length(af); af = lf > 1e-4 ? af / lf : vec3(0.0, 0.0, 1.0);
    a = normalize(mix(af, la > 1e-5 ? a / la : af, smoothstep(0.08, 0.4, la)));
    vec3 r = normalize(cross(n, a));
    // the first set round the form, leaning a little along it (a stroke
    // drawn round a limb, not a lathe's ring); the others 60 degrees off it
    vec3 d1 = normalize(a - uLean * r);
    vec3 d2 = 0.5 * d1 + 0.866 * cross(n, d1), d3 = 0.5 * d1 - 0.866 * cross(n, d1);
    float f = uFreq * uForm * vScale * (1.0 + 0.55 * vTaut);
    // the chart the wobble and the stipple are seeded on: the point at rest
    vec2 q = vec2(vBind.x + 0.6 * vBind.z, vBind.y - 0.3 * vBind.z);
    float wob = (vnoise(q * uWobF) - 0.5) * wobble;
    // the tone in plate cuts: five steps, mostly
    float tq = mix(t, floor(t * 5.0 + 0.5) / 5.0, 0.65);
    // the first set a hairline in the light, a cut in the half tone; the
    // second comes in over the terminator (the key gone: t about 0.5), the
    // third only in the cores
    float w1 = mix(0.0, 0.55, smoothstep(uBare, 0.72, tq));
    float w2 = 0.46 * smoothstep(0.5, 0.64, tq);
    float w3 = 0.4 * smoothstep(0.72, 0.84, tq);
    float s1 = dot(vLocal, d1), s2 = dot(vLocal, d2), s3 = dot(vLocal, d3);
    // the pitch held on screen, as hatch() holds it
    float lpp = fwidth(s1) * f;
    float k = max(0.0, log2(max(lpp * max(uPitchPx, 1.0), 1e-5)));
    float k0 = floor(k), fr = k - k0;
    float f0 = f * exp2(-k0), f1 = f0 * 0.5;
    float ink = mix(setsForm(s1, s2, s3, f0, w1, w2, w3, wob), setsForm(s1, s2, s3, f1, w1, w2, w3, wob), smoothstep(0.0, 1.0, fr));
    // the stipple: a dot in a cell of the rest chart, only in the gaps
    vec2 cell = q * f0 * 1.5;
    float dot_ = length(fract(cell) - 0.5);
    float sp = step(1.0 - 0.07 * uStip, hash(floor(cell))) * (1.0 - smoothstep(0.1, 0.2, dot_)) * smoothstep(0.34, 0.1, tq) * smoothstep(0.02, 0.08, tq) * 0.7 * (1.0 - ink) * (1.0 - uFlip);
    return max(ink, sp);
  }
  void main() {
    vec3 n = normalize(vNormalW);
    if (!gl_FrontFacing) n = -n;
    // the tone: one key, a sky from above, the terminator pushed so the
    // form turns in three or four clear steps as an engraver cuts it
    float lam = max(dot(n, normalize(uKey)), 0.0);
    float sky = 0.6 + 0.4 * n.y;   // (the ground throws some light back up under things)
    // (a floor of light under everything, and a ceiling on the dark: a
    // woodcutter's deepest passage is still crossed lines, never a solid)
    float lit = clamp(lam * uKeyI + sky * uSky + 0.18, 0.0, 1.0);
    float t = clamp(pow(1.0 - lit, 0.9) + uTone, 0.0, 0.84);
    if (uInvert > 0.5) t = 1.0 - t;
    // a rim toward the lens stays light (the plate's bevel of light)
    vec3 v = normalize(uCamPos - vWorld);
    float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
    t = clamp(t + (uInvert > 0.5 ? -rim * 0.3 : -rim * 0.07), 0.0, 1.0);
    // a planned passage (the hills behind the figures): the value laid in
    // where the engraver wants it, the light left only to model it
    if (uToneMap > 0.5) t = clamp(mix(t, vTone.x + (t - 0.45) * 0.3, vTone.y), 0.0, 0.9);
    // the tone in steps: a woodcutter turns a form in a few clear planes
    if (uSteps > 0.5) t = mix(t, floor(t * uSteps + 0.5) / uSteps, 0.7);
    // triplanar: the face's dominant axis picks the plane the lines lie on
    vec3 an = abs(n);
    vec2 p, along;
    vec3 ax = normalize(vAxisW);
    // (uRing: past uRing.z each line stands for twice the ground, eased in
    // over 60 units - a hard knee there doubled the pitch in a band, a moire
    // belt where the ring's floor meets the hills)
    if (uUvMode > 0.5) {
      along = vec2(-sin(uAngle), cos(uAngle));
      if (uRing.w > 0.5) { vec2 rd = vWorld.xz - uRing.xy; float rr = length(rd), kx = rr - uRing.z; p = vec2(atan(rd.x, rd.y) * rr, rr - 0.25 * (kx + sqrt(kx * kx + 3600.0)) + 15.0) * uUvScale; }
      else p = vUv * uUvScale;
    }
    else if (an.y > max(an.x, an.z)) { p = vWorld.xz; along = ax.xz; }
    else if (an.x > an.z) { p = vWorld.zy; along = ax.zy; }
    else { p = vWorld.xy; along = ax.xy; }
    // (the lines run with the form's long axis as it lies on this face; a
    // face the axis stands square to - a post's end - takes the set angle)
    if (uUvMode < 0.5 && (uAxisOn < 0.5 || length(along) < 0.25)) along = vec2(-sin(uAngle), cos(uAngle));
    along = normalize(along);
    p += uScroll * uTime;
    // blood: a mask by height that runs down with spill, its edge ragged
    // (as a second block is cut: a broad wavering edge and a few long runs,
    // never a fine noise - at the screen's pitch that prints as a dither)
    float bm = 0.0;
    if (uBloodOn > 0.5) {
      float h = (vWorld.y - uBloodLo) / max(0.001, uBloodHi - uBloodLo);  // 1 at the wound (the top of the band), 0 at its foot
      float run = uBloodSpill;                                           // how far down the band it has got (0 none .. 1 to the foot)
      // (in world units: p is the plate's line space, where a body's uv
      // runs several lines to a unit and any noise in it is fine-grained)
      vec2 wq = vec2(vWorld.x + vWorld.z, vWorld.y) * 0.09;
      float rag = (vnoise(wq + 7.0) - 0.5) * 0.32;
      // runs: narrow streaks that go further than the body of it
      float streak = pow(vnoise(vec2((vWorld.x - vWorld.z) * 0.32, 3.0)), 3.0) * 0.9;
      // (both edges cut clean, a pixel wide wherever they fall: a band's
      // worth of soft edge printed as an airbrush, not a second block)
      float e1 = h - (1.0 - run) + rag + streak * run * 0.5, e2 = 1.0 - (h + rag * 0.3);
      bm = clamp(e1 / max(fwidth(e1), 1e-4) + 0.5, 0.0, 1.0) * clamp(e2 / max(fwidth(e2), 1e-4) + 0.5, 0.0, 1.0);
      // (solid only along the wound's lip at the top of the band; below it
      // the blood runs down in streams, widening toward the wound - a band
      // of red all round a body read as a garment, a corset or a pair of
      // briefs)
      float ce = vnoise(vec2((vWorld.x - vWorld.z) * 0.16, 2.0 + uBloodLo * 0.01)) - 0.52 + h * 0.34;
      float lip = h - 0.78 + rag * 0.4;
      bm *= max(clamp(ce / max(fwidth(ce), 1e-4) + 0.5, 0.0, 1.0), clamp(lip / max(fwidth(lip), 1e-4) + 0.5, 0.0, 1.0));
    }
    // the wet pass: fresh ink spreads a little wider and the tone deepens
    // (blood is always a darker passage than the skin it runs on)
    float tt = clamp(max(t, bm * 0.42) + bm * 0.1 + uWet * 0.06 * max(bm, 0.3), 0.0, 1.0);
    // (a wrapped form, where the mesh carries its direction; the plate's
    // own lines where it does not)
    bool form = uForm > 0.0 && dot(vAlongO, vAlongO) > 0.25;
    float ink = form ? hatchForm(tt, uWobble) : hatch(p, along, tt, uWobble);
    // ember: in the darks, the ink glows from under (the valley burning)
    // (blood is a wash: the paper under the lines goes red; the lines stay ink)
    vec3 inkCol = uInk;
    vec3 ember = vec3(0.82, 0.27, 0.12);
    float dark = uInvert > 0.5 ? 1.0 - t : t;
    inkCol = mix(inkCol, ember, uEmber * smoothstep(0.55, 1.0, dark) * (0.5 + 0.5 * sin(uTime * 1.7 + vWorld.x * 0.3 + vWorld.z * 0.2)));
    // the paper: a hair darker where the form turns from the light, the
    // plate tone an engraver leaves in the shadows
    vec3 paper = mix(mix(uPaper, uBlood, bm), uPaper * 0.86, smoothstep(0.5, 1.0, dark) * 0.6 * (1.0 - bm));
    vec3 col = mix(paper, inkCol, ink);
    // (no sheen on the wet blood: a print has no specular, and a gloss
    // streak across a torso read as plastic)
    if (uFlip > 0.001) {
      // the freed: the same form as a white-line cut - the block left
      // standing as the ground, so the figure prints dark, and only the
      // light cut out of it in bone lines, thin in the half tones, gone in
      // the shade (the tone before the blood: no blood, no plate tone)
      float tn = mix(0.05, 0.5, 1.0 - t);   // (the stroke count kept: the lights cut as fully as the positive's shade, so the ground keeps its lines and a figure its form)
      float inkN = form ? hatchForm(tn, uWobble) : hatch(p, along, tn, uWobble);
      vec3 bone = vec3(0.91, 0.863, 0.753);
      col = mix(col, mix(uInk * 0.85, bone, inkN), uFlip);
    }
    // a ghost: the cut washed back toward the paper, a faint proof of itself
    // (Death, while his soul stands freed)
    col = mix(col, uPaper, uGhost * 0.7);
    gl_FragColor = vec4(col, uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// A sharable set of uniforms (uTime, uCamPos are driven per frame by
// burinTick(); the rest are the material's own).
export function engravingMaterial(opts = {}) {
  const o = Object.assign({ paper: BONE, ink: INK, blood: BLOOD, freq: 1.1, angle: -0.6, tone: 0.0, wet: 0, bloodOn: false, bloodLo: 0, bloodHi: 1, spill: 0, ember: 0, sky: 0.28, keyI: 1.0, transparent: false, opacity: 1, side: THREE.FrontSide, uv: null, invert: false, wobble: 0.6, scroll: null, steps: 0, toneMap: false, bare: 0.14, axis: [0, 1, 0], pitch: 4.5, wobF: 0.35, swell: 0, ring: null, form: 0, stipple: 0, lean: 0 }, opts);
  const m = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG,
    uniforms: {
      uPaper: { value: o.paper.clone() }, uInk: { value: o.ink.clone() }, uBlood: { value: o.blood.clone() },
      uKey: { value: KEY.clone() }, uKeyI: { value: o.keyI }, uSky: { value: o.sky },
      uFreq: { value: o.freq }, uAngle: { value: o.angle }, uTone: { value: o.tone }, uWet: { value: o.wet },
      uBloodLo: { value: o.bloodLo }, uBloodHi: { value: o.bloodHi }, uBloodOn: { value: o.bloodOn ? 1 : 0 }, uBloodSpill: { value: o.spill },
      uEmber: { value: o.ember }, uTime: { value: 0 }, uOpacity: { value: o.opacity }, uCamPos: { value: new THREE.Vector3() },
      uInvert: { value: o.invert ? 1 : 0 }, uFlip: { value: 0 }, uGhost: { value: 0 }, uWobble: { value: o.wobble }, uUvMode: { value: o.uv ? 1 : 0 }, uUvScale: { value: new THREE.Vector2(o.uv ? o.uv[0] : 1, o.uv ? o.uv[1] : 1) },
      uScroll: { value: new THREE.Vector2(o.scroll ? o.scroll[0] : 0, o.scroll ? o.scroll[1] : 0) }, uSteps: { value: o.steps }, uToneMap: { value: o.toneMap ? 1 : 0 }, uBare: { value: o.bare },
      uAxis: { value: new THREE.Vector3(...(o.axis || [0, 1, 0])) }, uAxisOn: { value: o.axis ? 1 : 0 }, uPitchPx: { value: o.pitch },
      uRing: { value: new THREE.Vector4(...(o.ring || [0, 0, 0, 0])) }, uWobF: { value: o.wobF }, uSwell: { value: o.swell },
      uForm: { value: o.form }, uStip: { value: o.stipple }, uLean: { value: o.lean }
    },
    transparent: o.transparent, side: o.side, lights: false, fog: false
  });
  // (a mesh without the form's direction reads it as zero: the plate's own lines)
  Object.assign(m.defaultAttributeValues, { aAlong: [0, 0, 0], aTone: [0, 0] });
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
  uniform vec3 uKey;        // the light, for the swell
  uniform float uLitSwell;  // 0..1: the line swells toward the light and thins in the shade, as an engraver's contour does
  uniform float uLimbHalo;  // the line (a halo's) stands this much wider round a limb (aLimb 1), where it crosses the trunk
  attribute float aLimb;
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
    vec3 nw = normalize(mat3(modelMatrix) * objectNormal);
    float px = uPx * (1.0 + uLitSwell * clamp(dot(nw, normalize(uKey)), -1.0, 1.0)) * (1.0 + uLimbHalo * aLimb);
    // push along the screen-space normal by px pixels, thinning far off
    vec2 off = normalize(nv.xy + vec2(1e-5)) * px * clip.w / uViewport * 2.0;
    float far = clamp(1.45 - (-mv.z) / 520.0, 0.4, 1.35);
    clip.xy += off * far;
    gl_Position = clip;
  }
`;
const OUT_FRAG = /* glsl */`
  uniform vec3 uInk, uNeg;
  uniform float uFlip, uGhost;
  void main() {
    // (in the freed negative the line is a bone cut between the dark forms,
    // and a halo the ink the forms are cut from; a ghost's line fades back
    // toward the paper)
    vec3 bone = vec3(0.91, 0.863, 0.753);
    vec3 c = mix(uInk, uNeg, uFlip);
    c = mix(c, bone, uGhost * 0.7);
    gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment> }
`;
const NEG_BONE = new THREE.Color(0.91, 0.863, 0.753);
export function outlineMaterial(px = 2.2, ink = INK, neg = NEG_BONE) {
  const m = new THREE.ShaderMaterial({ vertexShader: OUT_VERT, fragmentShader: OUT_FRAG, uniforms: { uPx: { value: px }, uViewport: { value: new THREE.Vector2(1, 1) }, uInk: { value: ink.clone() }, uNeg: { value: neg.clone() }, uFlip: { value: 0 }, uGhost: { value: 0 }, uKey: { value: KEY.clone() }, uLitSwell: { value: 0 }, uLimbHalo: { value: 0 } }, side: THREE.BackSide, depthWrite: true });
  m.defaultAttributeValues.aLimb = [0];
  return m;
}
// a halo: the paper knocked out round a figure where it stands against a
// dark passage, as an engraver leaves a hair of white along a contour - an
// inverted hull wider than the outline, behind it, the paper's own colour
// (the ink in the negative)
export function haloOf(mesh, px = 7) {
  const o = new THREE.Mesh(mesh.geometry, outlineMaterial(px, BONE, INK.clone().multiplyScalar(0.85)));
  o.userData.outline = true; o.userData.halo = true;
  o.renderOrder = -2;
  mesh.add(o);
  return o;
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
      else if (m.uniforms && m.uniforms.uViewport) { m.uniforms.uViewport.value.copy(_v2); if (key && m.uniforms.uKey) m.uniforms.uKey.value.copy(key); }
    }
  });
}

// The paper itself: the page's bone, with the plate's grain - a very faint
// hatch of the paper's laid lines and the plate tone, for grounds the
// engraver left "white".
export function paperMaterial(opts = {}) {
  return engravingMaterial(Object.assign({ tone: -0.35, freq: 1.4, sky: 0.6, keyI: 0.5 }, opts));
}
