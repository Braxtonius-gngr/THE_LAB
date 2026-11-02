// Put fitted garments (tools/garments: fit.py + gwrite.mjs) on a body. A garment GLB carries its
// vertices in the body mesh's own local space and skin weights indexed by the body's own joint
// order, so it is bound to the body's skeleton exactly as the body is - it bends with every pose
// and clip. Call before or after placing the model; it parents to the body mesh's parent.
import * as THREE from '../assets/vendor/three/three.module.js';

export function bodyMeshOf(model) { let b = null; model.traverse(o => { if (o.isSkinnedMesh && (!b || o.geometry.attributes.position.count > b.geometry.attributes.position.count)) b = o; }); return b; }

export async function wear(loader, model, url) {
  const body = bodyMeshOf(model); if (!body) throw new Error('wear: no skinned body');
  const g = await loader.loadAsync(url); const out = [];
  g.scene.traverse(o => {
    if (!o.isMesh) return;
    const m = new THREE.SkinnedMesh(o.geometry, o.material);
    m.name = 'garment:' + url.split('/').slice(-2, -1)[0];
    m.position.copy(body.position); m.quaternion.copy(body.quaternion); m.scale.copy(body.scale);
    m.castShadow = m.receiveShadow = true; m.frustumCulled = false;
    body.parent.add(m);
    m.bind(body.skeleton, body.bindMatrix);
    out.push(m);
  });
  // (the skin it covers comes out of the body while it is worn - every worn garment's together)
  let hide = null;
  try { const r = await fetch(url.replace(/\.glb$/, '.hide.bin')); if (r.ok) hide = new Uint32Array(await r.arrayBuffer()); } catch (_) { /* none */ }
  const W = body.userData.worn || (body.userData.worn = new Set());
  const rec = { hide, meshes: out }; W.add(rec); recut(body);
  // (layers: whatever is already on and lies close under this one is cut away, so an inner
  // layer can't poke through an outer one - the cut is undone when the outer comes off)
  for (const r of W) if (r !== rec && r.meshes) for (const m of r.meshes) layerCut(m, out, rec);
  return { meshes: out, remove() {
    out.forEach(m => { m.parent?.remove(m); m.geometry.dispose(); }); W.delete(rec); recut(body);
    for (const r of W) if (r.meshes) for (const m of r.meshes) if (m.userData.cutBy) { m.userData.cutBy.delete(rec); applyCuts(m); }
  } };
}

function recut(body) {
  const geo = body.geometry, idx0 = body.userData.index0 || (body.userData.index0 = geo.index.array.slice());
  const off = new Uint8Array(idx0.length / 3);
  for (const r of body.userData.worn) if (r.hide) for (const t of r.hide) off[t] = 1;
  const keep = [];
  for (let t = 0; t < off.length; t++) if (!off[t]) keep.push(idx0[3 * t], idx0[3 * t + 1], idx0[3 * t + 2]);
  geo.setIndex(new THREE.BufferAttribute(idx0.length > 65535 * 3 || idx0 instanceof Uint32Array ? new Uint32Array(keep) : new Uint16Array(keep), 1));
}

// hide the triangles of `inner` whose three corners lie within `reach` of the outer garment's
// surface (both in the body mesh's rest space, so this is done once, not per frame)
function layerCut(inner, outers, by, reach = 0.015) {
  const ip = inner.geometry.attributes.position, sc = inner.scale.x || 1, r = reach / sc, cell = r, grid = new Map();
  const key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  for (const o of outers) { const p = o.geometry.attributes.position; for (let i = 0; i < p.count; i++) { const k = key(p.getX(i), p.getY(i), p.getZ(i)); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(p.getX(i), p.getY(i), p.getZ(i)); } }
  const near = new Uint8Array(ip.count), r2 = r * r;
  for (let i = 0; i < ip.count; i++) {
    const x = ip.getX(i), y = ip.getY(i), z = ip.getZ(i), cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
    search: for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      const L = grid.get(`${cx + a},${cy + b},${cz + c}`); if (!L) continue;
      for (let j = 0; j < L.length; j += 3) { const dx = L[j] - x, dy = L[j + 1] - y, dz = L[j + 2] - z; if (dx * dx + dy * dy + dz * dz < r2) { near[i] = 1; break search; } }
    }
  }
  const idx0 = inner.userData.index0 || (inner.userData.index0 = inner.geometry.index.array.slice()), hid = [];
  for (let t = 0; t < idx0.length / 3; t++) if (near[idx0[3 * t]] && near[idx0[3 * t + 1]] && near[idx0[3 * t + 2]]) hid.push(t);
  (inner.userData.cutBy || (inner.userData.cutBy = new Map())).set(by, hid); applyCuts(inner);
}
function applyCuts(m) {
  const idx0 = m.userData.index0; if (!idx0) return;
  const off = new Uint8Array(idx0.length / 3); for (const h of m.userData.cutBy.values()) for (const t of h) off[t] = 1;
  const keep = []; for (let t = 0; t < off.length; t++) if (!off[t]) keep.push(idx0[3 * t], idx0[3 * t + 1], idx0[3 * t + 2]);
  m.geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(keep), 1));
}
