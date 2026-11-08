// Seats from the furniture: every sofa, armchair, chair, beanbag, bed and counter in a place
// becomes somewhere a person can sit, lie or lean, worked out from the prop's placement
// (floor point + yaw, world/places.mjs) and its baked size (assets/props/props.json), instead
// of hand-placed coordinates. Hand-placed seats in a place still win where they exist.
//
// Each seat: { pos, yaw, y?, group, kind } - pos is where the hips' root goes, yaw which way he
// faces when he sits (a prop's front is +z before its yaw), y the root height while seated.
// A bed also has `side` (where he stands to get on and off) and is `kind: 'lie'`; a counter is
// `kind: 'lean'`. Groups let the mind say "sit on the sofa" and the body take a free spot.
import * as THREE from '../assets/vendor/three/three.module.js';

// how each piece is sat on: where the hips go, measured from the piece's centre, and how far the
// root sits above the floor there (the sit clip puts the hips about 0.45 m up at y = 0)
const RULES = {
  sofa:           { kind: 'sit', group: 'sofa', back: 0.40, y: 0.02, spread: 0.27 },   // two seats, +-27 % of the width
  'd-couch':      { kind: 'sit', group: 'sofa', back: 0.40, y: 0.02, spread: 0.27 },
  armchair:       { kind: 'sit', group: 'armchair', back: 0.36, y: 0.0 },
  chair:          { kind: 'sit', group: 'chair', back: 0.30, y: 0.02 },
  'd-chairlaundry': { kind: 'sit', group: 'chair', back: 0.30, y: 0.0 },
  'd-beanbag':    { kind: 'sit', group: 'beanbag', back: 0.45, y: -0.12 },
  bed:            { kind: 'lie', group: 'bed', top: 0.14 },
  'd-bed':        { kind: 'lie', group: 'bed', top: 0.15 },
  counter:        { kind: 'lean', group: 'counter', out: 0.43 },
};

// a point given in the piece's own frame (x along its width, z toward its front), in the room
const place = (p, lx, lz, y = 0) => { const c = Math.cos(p.ry || 0), s = Math.sin(p.ry || 0); return new THREE.Vector3(p.x + lx * c + lz * s, y, p.z - lx * s + lz * c); };

// placements: the place's prop list; sizes: { id: [w, h, d] } from the catalog
export function deriveSeats(placements, sizes) {
  const out = {}, count = {};
  const key = g => { count[g] = (count[g] || 0) + 1; return count[g] === 1 ? g : g + count[g]; };
  for (const p of placements) {
    const R = RULES[p.id], sz = sizes[p.id]; if (!R || !sz || p.y) continue;   // (p.y: on a shelf or a table, not on the floor)
    const [w, h, d] = sz, yaw = p.ry || 0;
    if (R.kind === 'sit') {
      const lz = Math.min(d / 2 - R.back, 0.05);
      const xs = R.spread && w > 1.4 ? [-R.spread * w, R.spread * w] : [0];
      for (const lx of xs) out[key(R.group)] = { pos: place(p, lx, lz), yaw, y: R.y, group: R.group, kind: 'sit', prop: p.id };
    } else if (R.kind === 'lie') {
      // lying along the bed, head at the back (the wall end, local -z); on and off from the side
      // nearer the room's middle, standing right at the edge
      const left = place(p, -w / 2, 0), right = place(p, w / 2, 0);
      const side = left.lengthSq() < right.lengthSq() ? left : right;
      out[key(R.group)] = { pos: place(p, 0, -0.05, h - R.top), yaw, y: h - R.top, side, group: R.group, kind: 'lie', prop: p.id };
    } else if (R.kind === 'lean') {
      // standing just in front of it with his back to it, facing out
      out[key(R.group)] = { pos: place(p, 0, d / 2 + R.out), yaw, group: R.group, kind: 'lean', prop: p.id };
    }
  }
  return out;
}

// what the mind can be told: the groups available here, by what you do on them
export function seatWords(seats) {
  const by = { sit: new Set(), lie: new Set(), lean: new Set() };
  for (const s of Object.values(seats)) by[s.kind || 'sit']?.add(s.group);
  return { sit: [...by.sit], lie: [...by.lie], lean: [...by.lean] };
}
