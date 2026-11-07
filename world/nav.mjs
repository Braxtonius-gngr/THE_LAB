// Nav: a floor map of a room so characters walk around the furniture, not through it.
// The floor is a grid (10 cm cells); every prop standing on the floor blocks the cells
// under its footprint, grown by a body's half-width. Paths are A* over the grid, then
// pulled tight (a straight line wherever one fits), so walks look like a person's.
// Destinations that sit inside furniture (the sofa seat, the counter) are fine: the path
// goes to the nearest free spot and the last short step goes straight in.
import * as THREE from '../assets/vendor/three/three.module.js';

const _b = new THREE.Box3(), _m = new THREE.Box3();
// a prop's box from its meshes' own bounds, in the world
function footprint(o) {
  _b.makeEmpty(); o.updateWorldMatrix(true, true);
  o.traverse(m => { if (!m.isMesh) return; if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); _b.union(_m.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld)); });
}

export class Nav {
  // w, d: room size in metres, centred on the origin; props: Object3Ds in the room
  constructor(w, d, props = [], { cell = 0.1, body = 0.18, wall = 0.2 } = {}) {
    this.cell = cell; this.x0 = -w / 2; this.z0 = -d / 2;
    this.nx = Math.ceil(w / cell); this.nz = Math.ceil(d / cell);
    this.block = new Uint8Array(this.nx * this.nz);
    // the walls
    for (let i = 0; i < this.nx; i++) for (let j = 0; j < this.nz; j++) {
      const x = this.x0 + (i + 0.5) * cell, z = this.z0 + (j + 0.5) * cell;
      if (x < this.x0 + wall || x > -this.x0 - wall || z < this.z0 + wall || z > -this.z0 - wall) this.block[j * this.nx + i] = 1;
    }
    // furniture: on the floor (starts below 30 cm) and tall enough to bump into (over 8 cm) - so
    // rugs, wall art, shelves, lights and curtains don't block
    for (const o of props) {
      footprint(o); if (_b.isEmpty() || _b.min.y > 0.3 || _b.max.y < 0.08) continue;
      this.fill(_b.min.x - body, _b.min.z - body, _b.max.x + body, _b.max.z + body);
    }
  }
  fill(ax, az, bx, bz, v = 1) {
    const [i0, j0] = this.ij(ax, az), [i1, j1] = this.ij(bx, bz);
    for (let j = Math.max(0, j0); j <= Math.min(this.nz - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(this.nx - 1, i1); i++) this.block[j * this.nx + i] = v;
  }
  ij(x, z) { return [Math.floor((x - this.x0) / this.cell), Math.floor((z - this.z0) / this.cell)]; }
  xz(i, j) { return [this.x0 + (i + 0.5) * this.cell, this.z0 + (j + 0.5) * this.cell]; }
  free(i, j) { return i >= 0 && j >= 0 && i < this.nx && j < this.nz && !this.block[j * this.nx + i]; }
  // nearest free cell to (i, j), searching outward
  nearestFree(i, j) {
    if (this.free(i, j)) return [i, j];
    for (let r = 1; r < 40; r++) { let best = null, bd = 1e9;
      for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) { if (Math.max(Math.abs(a), Math.abs(b)) !== r || !this.free(i + a, j + b)) continue; const d = a * a + b * b; if (d < bd) { bd = d; best = [i + a, j + b]; } }
      if (best) return best; }
    return [i, j];
  }
  // straight line clear? (samples every half cell)
  clear(ax, az, bx, bz) {
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / (this.cell * 0.5));
    for (let k = 0; k <= n; k++) { const t = k / Math.max(1, n); const [i, j] = this.ij(ax + (bx - ax) * t, az + (bz - az) * t); if (!this.free(i, j)) return false; }
    return true;
  }
  // waypoints (Vector3s, y 0) from `from` to `to`; the last one is `to` itself
  path(from, to) {
    const goal = new THREE.Vector3(to.x, 0, to.z);
    let [si, sj] = this.nearestFree(...this.ij(from.x, from.z)); const [gi, gj] = this.nearestFree(...this.ij(to.x, to.z));
    const [sx, sz] = [from.x, from.z];
    if (this.clear(sx, sz, to.x, to.z)) return [goal];
    // A* (8-way, no corner cutting)
    const N = this.nx * this.nz, g = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), open = [], closed = new Uint8Array(N);
    const h = k => Math.hypot(k % this.nx - gi, Math.floor(k / this.nx) - gj);
    const s = sj * this.nx + si, e = gj * this.nx + gi; g[s] = 0; open.push([h(s), s]);
    while (open.length) {
      let bi = 0; for (let q = 1; q < open.length; q++) if (open[q][0] < open[bi][0]) bi = q;
      const [, k] = open.splice(bi, 1)[0]; if (closed[k]) continue; closed[k] = 1; if (k === e) break;
      const i = k % this.nx, j = (k - i) / this.nx;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        if (!a && !b) continue; const ni = i + a, nj = j + b; if (!this.free(ni, nj)) continue;
        if (a && b && (!this.free(i + a, j) || !this.free(i, j + b))) continue;
        const nk = nj * this.nx + ni, ng = g[k] + (a && b ? 1.4142 : 1);
        if (ng < g[nk]) { g[nk] = ng; came[nk] = k; open.push([ng + h(nk), nk]); }
      }
    }
    if (came[e] < 0 && e !== s) return [goal];   // no way through: walk straight as before
    const cells = []; for (let k = e; k !== -1; k = came[k]) { cells.push(k); if (k === s) break; }
    cells.reverse();
    const pts = cells.map(k => this.xz(k % this.nx, Math.floor(k / this.nx)));
    // pull tight: from each kept point, jump to the farthest point still in a straight clear line
    const out = []; let cx = sx, cz = sz, q = 0;
    while (q < pts.length - 1) { let far = q + 1; for (let r = pts.length - 1; r > q + 1; r--) if (this.clear(cx, cz, pts[r][0], pts[r][1])) { far = r; break; } out.push(new THREE.Vector3(pts[far][0], 0, pts[far][1])); [cx, cz] = pts[far]; q = far; }
    out.push(goal);
    return out;
  }
}
