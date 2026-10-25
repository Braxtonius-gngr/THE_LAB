// UNIVERSAL CLOTH MATERIAL: a garment's own surface carried out over what is
// under it, on the GPU - for the build's figures wherever they are used (the
// lab, and any scene that takes them up), skinned or not. It patches a
// material (three's built-ins - Standard, Physical, Lambert, Phong - or a
// ShaderMaterial that includes <skinning_vertex>, like burin.mjs's ink) and
// gives it matching shadow materials, so the shadow is cast by the same shape.
//
// Everything runs in the vertex shader right after <skinning_vertex>: the
// point has already been carried by its bones, so the cloth moves with the
// body in a walk or a jog and is never torn off it. Each point is pushed out
// along its own (skinned) normal by a height read off its uv:
//
//   u_tissueType (cloth.mjs's TISSUE: 0 and 1 the same):
//     0  RIGID (bone, a piercing): crisp and unyielding - a plateau with a
//        smoothstep edge, radius u_radius round u_baseUV
//     1  SOFT (fat, muscle): a Gaussian bell (sigma u_radius / 2) with an
//        organic micro-jiggle, (1 + u_jiggle sin(u_time 4))
//     2  HYDROSTATIC (semi-rigid): a directional protrusion from u_baseUV
//        along u_direction for u_length, interpolating with u_state from
//        soft and draping (0: wider, 0.3 of its depth) to firm and extended
//        (1: narrower, all of u_maxDepth) - anisotropic: its width is
//        across the axis, its profile along it
//
// The drape gap: a garment hangs (1 - u_clinginess) x u_drapeDistance off
// what is under it, so only what stands out past that gap tents it:
//     clothRestGap = (1 - u_clinginess) * u_drapeDistance
//     activeProtrusion = max(0, rawProtrusion - clothRestGap)
// The swing vector (u_swingVector, uv units): the height is read that far
// ahead, so the cloth trails what moves under it (cloth.mjs's lag, on the GPU).
//
// The normal is re-derived from the height (central differences over
// u_uvEps, through the surface's own uv tangents - prepareClothGeometry()),
// so a lit surface shades as the shape it has become, not the flat one it
// was. Without those tangents it is still carried out, its normal unchanged.
//
// The hydrostatic profile: its width falls off as a half ellipse across the
// axis (round at the crown - a linear falloff put a crease down the middle)
// and its length as a half sine (0 at the base - sealed - and at the tip).
//
// The uv the shape is read off is the mesh's `uv` unless the material is
// made with { uv: '<attribute>' } (a garment whose uv is laid for its hatch
// carries a second, isotropic one for the cloth); `wrap(material)` patches
// another material onto the same uniforms (a mesh's outline, so it follows
// the shape); `twin(base)` is the same cloth on another base (a studio clay
// beside an ink plate), sharing the uniforms.
//
// Not handled: instanced and morphed meshes (their normals are taken as the
// attribute gives them), and a uv seam crossing the shape (its tangents jump).
import * as THREE from '../vendor/three/three.module.js';

// (0 and 1 are cloth.mjs's TISSUE.RIGID and TISSUE.SOFT)
export const TISSUE_TYPE = { RIGID: 0, SOFT: 1, HYDROSTATIC: 2 };

// the uniforms and their defaults (uv units for every length but the depths, which are the mesh's)
const DEFAULTS = {
  u_tissueType: TISSUE_TYPE.SOFT,
  u_baseUV: [0.5, 0.5], u_direction: [0, -1], u_length: 0.2, u_width: 0.05,
  u_state: 0, u_maxDepth: 1, u_radius: 0.08, u_jiggle: 0.04, u_time: 0,
  u_clinginess: 1, u_drapeDistance: 0, u_swingVector: [0, 0], u_uvEps: 0.002
};

const PARS = /* glsl */`
uniform float u_tissueType;
uniform vec2 u_baseUV;      // Root/base coordinate of the structure
uniform vec2 u_direction;   // Directional vector flow (axis of elongation)
uniform float u_length;     // Longitudinal span
uniform float u_width;      // Half-width at the base (0.05)
uniform float u_state;      // 0.0 (Flaccid/Soft) to 1.0 (Firm/Erect)
uniform float u_maxDepth;   // Peak protrusion depth
uniform float u_radius;     // Rigid / soft: the shape's radius
uniform float u_jiggle;     // Soft: the micro-jiggle's share of its depth
uniform float u_time;       // Seconds
uniform float u_clinginess; // 0 hangs off it, 1 lies on it
uniform float u_drapeDistance;
uniform vec2 u_swingVector; // The cloth's trail behind what moves under it (uv)
uniform float u_uvEps;      // The step the normal is differenced over (uv)
attribute vec3 clothDu;     // d position / d u (prepareClothGeometry)
attribute vec3 clothDv;     // d position / d v
#ifdef UC_CUSTOM_UV
attribute vec2 UC_UV;       // the uv the shape is read off, when not the mesh's own
#else
#define UC_UV uv
#endif

// Rigid / piercing: crisp and unyielding - flat to its edge, then a smoothstep
float ucRigid(vec2 p) {
  float d = length(p - u_baseUV);
  return u_maxDepth * (1.0 - smoothstep(u_radius * 0.85, u_radius, d));
}

// Soft / fat / muscle: a Gaussian bell, breathing with a micro-jiggle
float ucSoft(vec2 p) {
  float d = length(p - u_baseUV);
  float s = max(u_radius * 0.5, 1e-5);
  float bell = exp(-(d * d) / (2.0 * s * s));
  return u_maxDepth * bell * (1.0 + u_jiggle * sin(u_time * 4.0));
}

// Hydrostatic / semi-rigid: state-dependent directional protrusion
float ucHydrostatic(vec2 p) {
  vec2 dir = length(u_direction) > 1e-6 ? normalize(u_direction) : vec2(0.0, -1.0);
  float len = max(u_length, 1e-5);

  vec2 uvOffset = p - u_baseUV;
  float longitudinalDist = dot(uvOffset, dir);
  vec2 transversePos = uvOffset - longitudinalDist * dir;
  float transverseDist = length(transversePos);

  float hydrostaticPeak = 0.0;
  if (longitudinalDist >= 0.0 && longitudinalDist <= len) {
    // Elliptical width falloff (narrows on sides, prominent down the center)
    // - a half ellipse across the axis: round at the crown, so no crease
    // down the middle (a straight 1 - t/w is a tent, its apex a ridge)
    float widthT = transverseDist / (u_width * mix(1.5, 0.8, u_state));
    float widthFactor = widthT < 1.0 ? sqrt(1.0 - widthT * widthT) : 0.0;

    if (widthFactor > 0.0) {
      // Longitudinal profile (tapers at base, rounds at tip)
      float shapeProfile = sin((longitudinalDist / len) * 3.14159);

      // Scale depth based on state uniform (0.3 = relaxed, 1.0 = firm)
      float currentDepth = u_maxDepth * mix(0.3, 1.0, u_state);
      hydrostaticPeak = shapeProfile * widthFactor * currentDepth;
    }
  }
  return hydrostaticPeak;
}

// the tissue under the cloth at p, by type
float ucRaw(vec2 p) {
  if (u_tissueType < 0.5) return ucRigid(p);
  if (u_tissueType < 1.5) return ucSoft(p);
  return ucHydrostatic(p);
}

// how far the cloth stands out at p: only what passes its drape gap, read
// the swing vector ahead so it trails the motion
float ucHeight(vec2 p) {
  float rawProtrusion = ucRaw(p + u_swingVector);
  float clothRestGap = (1.0 - u_clinginess) * u_drapeDistance;
  return max(0.0, rawProtrusion - clothRestGap);
}
`;

const MAIN = /* glsl */`
#include <skinning_vertex>
{
  // the point's normal and uv tangents, carried by its bones as the point was
  vec3 ucN = normal, ucDu = clothDu, ucDv = clothDv;
  #ifdef USE_SKINNING
    mat4 ucSkin = bindMatrixInverse * (skinWeight.x * boneMatX + skinWeight.y * boneMatY + skinWeight.z * boneMatZ + skinWeight.w * boneMatW) * bindMatrix;
    ucN = (ucSkin * vec4(ucN, 0.0)).xyz;
    ucDu = (ucSkin * vec4(ucDu, 0.0)).xyz;
    ucDv = (ucSkin * vec4(ucDv, 0.0)).xyz;
  #endif
  ucN = normalize(ucN);

  // carried out along it
  vec2 ucUv = UC_UV;
  float ucH = ucHeight(ucUv);
  transformed += ucN * ucH;

  #if defined( UC_OBJECT_NORMAL ) || defined( UC_VNORMAL )
    // the shape's normal: the surface's tangents tilted by the height's slope
    vec3 ucBase = cross(ucDu, ucDv);
    float ucSide = dot(ucBase, ucN);
    if (abs(ucSide) > 1e-12) {
      float ucE = max(u_uvEps, 1e-6);
      float ucHu = (ucHeight(ucUv + vec2(ucE, 0.0)) - ucHeight(ucUv - vec2(ucE, 0.0))) / (2.0 * ucE);
      float ucHv = (ucHeight(ucUv + vec2(0.0, ucE)) - ucHeight(ucUv - vec2(0.0, ucE))) / (2.0 * ucE);
      vec3 ucC = cross(ucDu + ucHu * ucN, ucDv + ucHv * ucN);
      float ucL = length(ucC);
      if (ucL > 1e-12) {
        vec3 ucN2 = ucC / ucL * sign(ucSide);
        #ifdef UC_OBJECT_NORMAL
          objectNormal = ucN2;
        #endif
        #ifdef UC_VNORMAL
          vec3 ucTN = normalMatrix * ucN2;
          #ifdef FLIP_SIDED
            ucTN = -ucTN;
          #endif
          #ifndef FLAT_SHADED
            vNormal = normalize(ucTN);
          #endif
        #endif
      }
    }
  #endif
}
`;

// patch one material's shader; normals: whether it shades (a shadow material
// does not); uvName: the attribute the shape is read off (null: the mesh's uv)
function patch(mat, uniforms, normals, uvName) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev.call(mat, shader, renderer);
    const vs = shader.vertexShader;
    if (!vs.includes('#include <skinning_vertex>')) throw new Error('UniversalClothMaterial: the vertex shader has no <skinning_vertex> to follow');
    Object.assign(shader.uniforms, uniforms);
    const defs = [];
    if (uvName) defs.push('#define UC_CUSTOM_UV', '#define UC_UV ' + uvName);
    // (a material that reads objectNormal after skinning - burin's ink - takes
    // the new one there; three's lit built-ins have set vNormal already, so
    // it is set again)
    if (normals && vs.includes('#include <beginnormal_vertex>')) defs.push('#define UC_OBJECT_NORMAL');
    if (normals && vs.includes('#include <normal_vertex>')) defs.push('#define UC_VNORMAL');
    const at = vs.indexOf('void main()');
    shader.vertexShader = vs.slice(0, at) + defs.join('\n') + '\n' + PARS + '\n' + vs.slice(at);
    shader.vertexShader = shader.vertexShader.replace('#include <skinning_vertex>', MAIN);
  };
  const key = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => '';
  mat.customProgramCacheKey = () => key() + '|uc-cloth-2' + (normals ? 'n' : '') + (uvName || '');
  return mat;
}

// d position / d u and d v at each point (the uv's own tangents, unnormalised
// - their length is how far a unit of uv goes on the mesh), averaged over the
// faces round it: clothDu and clothDv, for the re-derived normal
export function prepareClothGeometry(geo, uvName = 'uv') {
  const p = geo.attributes.position, t = geo.attributes[uvName]; if (!p || !t) return geo;
  const n = p.count, du = new Float32Array(n * 3), dv = new Float32Array(n * 3), cnt = new Uint16Array(n);
  const ix = geo.index ? geo.index.array : null, tris = ix ? ix.length : n;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), U = new THREE.Vector3(), V = new THREE.Vector3();
  for (let k = 0; k + 2 < tris; k += 3) {
    const i0 = ix ? ix[k] : k, i1 = ix ? ix[k + 1] : k + 1, i2 = ix ? ix[k + 2] : k + 2;
    a.fromBufferAttribute(p, i0); b.fromBufferAttribute(p, i1); c.fromBufferAttribute(p, i2);
    const s1 = t.getX(i1) - t.getX(i0), t1 = t.getY(i1) - t.getY(i0), s2 = t.getX(i2) - t.getX(i0), t2 = t.getY(i2) - t.getY(i0);
    const det = s1 * t2 - s2 * t1; if (Math.abs(det) < 1e-12) continue;
    e1.subVectors(b, a); e2.subVectors(c, a);
    U.copy(e1).multiplyScalar(t2).addScaledVector(e2, -t1).divideScalar(det);
    V.copy(e2).multiplyScalar(s1).addScaledVector(e1, -s2).divideScalar(det);
    for (const i of [i0, i1, i2]) { du[3 * i] += U.x; du[3 * i + 1] += U.y; du[3 * i + 2] += U.z; dv[3 * i] += V.x; dv[3 * i + 1] += V.y; dv[3 * i + 2] += V.z; cnt[i]++; }
  }
  for (let i = 0; i < n; i++) if (cnt[i]) for (let j = 0; j < 3; j++) { du[3 * i + j] /= cnt[i]; dv[3 * i + j] /= cnt[i]; }
  geo.setAttribute('clothDu', new THREE.BufferAttribute(du, 3));
  geo.setAttribute('clothDv', new THREE.BufferAttribute(dv, 3));
  return geo;
}

// A material that carries a garment out over the tissue under it.
//   const cloth = new UniversalClothMaterial(base, { tissueType: TISSUE_TYPE.HYDROSTATIC, state: 0.4, ... });
//   cloth.apply(mesh);            // its material and its shadow materials
//   cloth.set({ state: 1 });      // any parameter, any time
//   cloth.tick(seconds);          // the soft tissue's jiggle
// Parameters are the uniforms without their u_ (tissueType, baseUV, direction,
// length, width, state, maxDepth, radius, jiggle, clinginess, drapeDistance,
// swingVector, uvEps), read with ?? so a 0 - rigid tissue, a slack state -
// is a value and never falls back to a default; `uv` names the attribute the
// shape is read off (the mesh's own by default).
export class UniversalClothMaterial {
  constructor(base, params = {}, shared = null) {
    this.uvName = params.uv && params.uv !== 'uv' ? params.uv : null;
    this.uniforms = shared || {};
    if (!shared) for (const [k, v] of Object.entries(DEFAULTS)) this.uniforms[k] = { value: Array.isArray(v) ? new THREE.Vector2(...v) : v };
    this.set(params);
    this.material = patch(base.clone(), this.uniforms, true, this.uvName);
    this.depthMaterial = patch(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), this.uniforms, false, this.uvName);
    this.distanceMaterial = patch(new THREE.MeshDistanceMaterial(), this.uniforms, false, this.uvName);
  }
  // another material (a mesh's outline) carried out the same way, on the same uniforms
  wrap(material) { return patch(material.clone(), this.uniforms, true, this.uvName); }
  // the same cloth on another base, sharing the uniforms (a studio clay for an ink plate)
  twin(base) { return new UniversalClothMaterial(base, { uv: this.uvName || 'uv' }, this.uniforms); }
  set(params) {
    for (const [k, v] of Object.entries(params)) {
      const u = this.uniforms['u_' + k]; if (!u || v === undefined) continue;
      if (u.value && u.value.isVector2) { if (Array.isArray(v)) u.value.set(v[0] ?? u.value.x, v[1] ?? u.value.y); else if (v && v.isVector2) u.value.copy(v); }
      else u.value = v ?? u.value;
    }
    return this;
  }
  tick(t) { this.uniforms.u_time.value = t; return this; }
  apply(mesh) {
    if (!mesh.geometry.attributes.clothDu) prepareClothGeometry(mesh.geometry, this.uvName || 'uv');
    mesh.material = this.material;
    mesh.customDepthMaterial = this.depthMaterial;
    mesh.customDistanceMaterial = this.distanceMaterial;
    return mesh;
  }
  dispose() { this.material.dispose(); this.depthMaterial.dispose(); this.distanceMaterial.dispose(); }
}
