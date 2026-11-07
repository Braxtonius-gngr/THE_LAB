// The places: each one is a room (size), its furniture (Meshy props by floor centre and yaw),
// the standing spots a mind can send someone to, where hips go to sit or lie, the lights, the
// host and who else turns up when. world/apartment.html?place=<key> builds it.
import * as THREE from '../assets/vendor/three/three.module.js';
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export const PLACES = {
  // ---- Marco's: 6 x 4.5 m studio downtown, door on the -z wall, window on +z ----
  marco: {
    name: "Marco's apartment", location: 'marco-apartment', W: 6, D: 4.5, H: 2.7,
    floor: 0x6b5236, wall: 0xcfc6b8, window: { x: -0.8, w: 1.25, h: 1.4, y: 1.75 },
    host: 'marco', spawnHost: { at: 'kitchen', yaw: Math.PI / 2 - 0.5 },
    // the other one: when he's here on his own, and what the scene says to him
    guest: { key: 'dante', hours: [2, 5], param: 'dante', place: "at your friend Marco's apartment - you came over after your shift", first: 'table' },
    props: (W, D, H) => [
      { id: 'door',        x: 0,     z: -D / 2 + 0.095, ry: 0 },
      { id: 'tv',          x: -1.3,  z: -D / 2 + 0.14,  ry: 0 },
      { id: 'diningtable', x: 1.0,   z: -1.55, ry: 0 },
      { id: 'chair',       x: 0.7,   z: -0.82, ry: Math.PI },
      { id: 'chair',       x: 1.3,   z: -0.82, ry: Math.PI },
      { id: 'fridge',      x: W / 2 - 0.24, z: -D / 2 + 0.30, ry: -Math.PI / 2 },
      { id: 'counter',     x: W / 2 - 0.54, z: -0.85, ry: -Math.PI / 2 },
      { id: 'bed',         x: 1.75,  z: D / 2 - 0.92, ry: Math.PI },
      { id: 'nightstand',  x: W / 2 - 0.26, z: D / 2 - 0.24, ry: -Math.PI / 2 },
      { id: 'window',      x: -0.8,  y: 1.0, z: D / 2 - 0.07, ry: Math.PI, shadow: false },
      { id: 'sofa',        x: -0.8,  z: D / 2 - 0.46, ry: Math.PI },
      { id: 'coffeetable', x: -0.8,  z: 0.75, ry: 0 },
      { id: 'armchair',    x: -2.3,  z: 0.45, ry: Math.PI / 2 },
      { id: 'floorlamp',   x: -2.15, z: 2.0,  ry: 0, shadow: false, glow: 0xffc77a },
      { id: 'bookshelf',   x: -W / 2 + 0.21, z: -0.95, ry: Math.PI / 2 },
      { id: 'bassguitar',  x: 0.45,  z: 1.95, ry: Math.PI - 0.3 },
      { id: 'laptop',      x: 0.85,  y: 0.718, z: -1.4, ry: 0.15 },
      { id: 'mug',         x: 1.35,  y: 0.718, z: -1.3, ry: 0.8, shadow: false },
      { id: 'keysbowl',    x: 0.45,  y: 0.718, z: -1.85, ry: 0, shadow: false },
      { id: 'plate',       x: 2.45,  y: 1.043, z: -0.42, ry: 0, shadow: false },
      { id: 'glass',       x: 2.2,   y: 1.043, z: -0.62, ry: 0, shadow: false },
      { id: 'pintglass',   x: 2.35,  y: 1.043, z: -1.42, ry: 0, shadow: false },
      { id: 'beerbottle',  x: -0.55, y: 0.322, z: 0.82, ry: 0, shadow: false },
      { id: 'rug',          x: -0.8,  z: 0.75, ry: 0, shadow: false },
      { id: 'stove',        x: W / 2 - 0.33, z: 0.18, ry: -Math.PI / 2 },
      { id: 'microwave',    x: 2.6,   y: 1.043, z: -1.45, ry: -Math.PI / 2 },
      { id: 'wallshelf',    x: W / 2 - 0.125, y: 1.6, z: -0.85, ry: -Math.PI / 2, shadow: false },
      { id: 'liquorbottle', x: 2.25,  y: 1.043, z: -1.15, ry: 0.4, shadow: false },
      { id: 'trashcan',     x: 2.15,  z: -2.02, ry: 0 },
      { id: 'barcart',      x: -W / 2 + 0.16, z: -0.2, ry: Math.PI / 2 },
      { id: 'shaker',       x: -2.84, y: 0.81, z: -0.38, ry: 0, shadow: false },
      { id: 'bassamp',      x: 0.78,  z: 2.08, ry: Math.PI - 0.15 },
      { id: 'turntable',    x: -W / 2 + 0.16, z: 1.15, ry: Math.PI / 2 },
      { id: 'recordcrate',  x: -2.86, z: 0.75, ry: Math.PI / 2, shadow: false },
      { id: 'wallart',      x: -W / 2 + 0.045, y: 1.25, z: 0.45, ry: Math.PI / 2, shadow: false },
      { id: 'wallclock',    x: 1.0,   y: 2.0, z: -D / 2 + 0.012, ry: 0, shadow: false },
      { id: 'plant',        x: -2.68, z: 1.95, ry: 0.6 },
      { id: 'smallplant',   x: -2.79, y: 1.9, z: -0.95, ry: 0, shadow: false },
      { id: 'throwblanket', x: -1.55, y: 0.45, z: 1.85, ry: 0.3, shadow: false },
      { id: 'bookstack',    x: 2.74,  y: 0.551, z: 1.99, ry: 0.2, shadow: false },
      { id: 'coatrack',     x: -0.56, z: -1.85, ry: 0 },
      { id: 'shoes',        x: -0.95, z: -1.7, ry: 0.3, shadow: false },
      { id: 'laundrybasket', x: 2.78, z: 0.78, ry: -Math.PI / 2 },
      { id: 'curtain',      x: -1.72, y: 0.32, z: D / 2 - 0.09, ry: Math.PI, shadow: false },
      { id: 'curtain',      x: 0.12,  y: 0.32, z: D / 2 - 0.09, ry: Math.PI, shadow: false },
      { id: 'ceilinglight', x: -0.8,  y: H - 0.64, z: 0.75, ry: 0, shadow: false },
      { id: 'bathroomdoor', x: -W / 2 + 0.1, z: -1.8, ry: Math.PI / 2 },
      { id: 'towel',        x: -2.3,  y: 0.9, z: -D / 2 + 0.1, ry: 0, shadow: false },
    ],
    lights: (scene, W, D) => {
      scene.add(new THREE.HemisphereLight(0xe9dcc6, 0x2a221a, 0.45));
      const lamp = new THREE.PointLight(0xffc27a, 14, 9, 1.6); lamp.position.set(-2.15, 1.45, 2.0); lamp.castShadow = true; lamp.shadow.mapSize.set(1024, 1024); lamp.shadow.bias = -0.002; scene.add(lamp);
      const cool = new THREE.DirectionalLight(0xa9c4e6, 0.9); cool.position.set(-0.8, 1.8, D / 2 - 0.2); cool.target.position.set(-0.3, 0.6, 0); scene.add(cool, cool.target);
      const k = new THREE.PointLight(0xfff1dc, 5, 6, 1.8); k.position.set(2.1, 2.15, -0.85); scene.add(k);
    },
    spots: { sofa: V(-0.4, 0, 1.22), kitchen: V(1.5, 0, -0.3), window: V(0.65, 0, 1.6), door: V(0, 0, -1.3), table: V(0.3, 0, -0.4), bed: V(1.75, 0, 0.2), shelf: V(-2.2, 0, -1.0) },
    seats: { sofa: { pos: V(-0.8, 0, 1.74), yaw: Math.PI, y: 0.02 }, sofa2: { pos: V(-0.2, 0, 1.74), yaw: Math.PI, y: 0.02 },
      bed: { pos: V(1.75, 0.43, 1.46), yaw: Math.PI, side: V(1.05, 0, 1.35) }, counter: { pos: V(1.5, 0, -0.3), yaw: -Math.PI / 2 } },
    speaker: 'turntable', bass: 'bassguitar',
    playerStart: { pos: V(0, 0, -1.6), yaw: Math.PI },
  },

  // ---- Dante's: 5 x 4 m main room of a West Side one-bedroom. Door on -z. The kitchen runs
  // along the +x wall (the nicest part of the place), the couch faces the TV on the -x wall,
  // the bed is through an open doorway in the +z wall - here, the alcove is the +z end. ----
  dante: {
    name: "Dante's apartment", location: 'dante-apartment', W: 5, D: 4, H: 2.6,
    floor: 0x8a7a66, wall: 0xd8d0c2, window: { x: 1.3, w: 1.0, h: 1.2, y: 1.7 },
    host: 'dante', spawnHost: { at: 'kitchen', yaw: -Math.PI / 2 },
    // Marco drops by in the afternoon before their shifts (both off till evening), or ?marco=1
    guest: { key: 'marco', hours: [13, 17], param: 'marco', place: "at Dante's apartment on the West Side - you came by before work", first: 'couch' },
    props: (W, D, H) => [
      // entry wall
      { id: 'door',          x: -0.9,  z: -D / 2 + 0.095, ry: 0 },
      { id: 'd-clogs',       x: -0.45, z: -D / 2 + 0.3, ry: 0.4, shadow: false },
      { id: 'd-sneakersline', x: 0.6,  z: -D / 2 + 0.2, ry: 0 },
      { id: 'coatrack',      x: -1.5,  z: -D / 2 + 0.22, ry: 0 },
      // kitchen along +x: stove, cutting board on a counter, knives and spices on the wall, pots overhead
      { id: 'counter',       x: W / 2 - 0.54, z: -0.9, ry: -Math.PI / 2 },
      { id: 'd-stove',       x: W / 2 - 0.33, z: 0.25, ry: -Math.PI / 2 },
      { id: 'fridge',        x: W / 2 - 0.24, z: -D / 2 + 0.3, ry: -Math.PI / 2 },
      { id: 'd-cuttingboard', x: 2.0, y: 1.043, z: -0.9, ry: 0.2, shadow: false },
      { id: 'd-standmixer',  x: 2.15, y: 1.043, z: -1.45, ry: -0.5, shadow: false },
      { id: 'd-takeoutstack', x: 1.75, y: 1.043, z: -0.45, ry: 0.3, shadow: false },
      { id: 'd-knifestrip',  x: W / 2 - 0.01, y: 1.45, z: -0.9, ry: -Math.PI / 2, shadow: false },
      { id: 'd-spiceshelf',  x: W / 2 - 0.1, y: 1.35, z: -1.6, ry: -Math.PI / 2, shadow: false },
      { id: 'd-potrack',     x: 2.0, y: H - 0.75, z: 0.25, ry: 0, shadow: false },
      { id: 'd-herbpots',    x: 1.3, y: 1.0, z: D / 2 - 0.1, ry: Math.PI, shadow: false },   // on the windowsill
      { id: 'window',        x: 1.3, y: 1.0, z: D / 2 - 0.07, ry: Math.PI, shadow: false },
      { id: 'trashcan',      x: 1.3,  z: -D / 2 + 0.2, ry: 0 },
      // living, -x side: couch facing the TV, milk crate beside it, beanbag, turntable crate
      { id: 'd-tvunit',      x: -W / 2 + 0.25, z: 0.3, ry: Math.PI / 2 },
      { id: 'd-couch',       x: -0.6,  z: 0.3, ry: -Math.PI / 2 },
      { id: 'd-milktable',   x: -0.6,  z: -1.0, ry: 0.3 },
      { id: 'd-ashtray',     x: -0.6,  y: 0.278, z: -1.0, ry: 0, shadow: false },
      { id: 'd-beanbag',     x: -1.6,  z: 1.5, ry: 0.5 },
      { id: 'd-turntablecrate', x: -W / 2 + 0.25, z: -1.2, ry: Math.PI / 2 },
      { id: 'd-speakerdock', x: -W / 2 + 0.2, y: 0.761, z: 0.75, ry: Math.PI / 2, shadow: false },
      { id: 'd-poster',      x: -W / 2 + 0.03, y: 1.3, z: 1.4, ry: Math.PI / 2, shadow: false },
      { id: 'rug',           x: -0.8,  z: 0.3, ry: Math.PI / 2, shadow: false },
      { id: 'd-chairlaundry', x: 0.3,  z: 1.5, ry: -0.6 },
      // the bedroom end (+z): bed against the wall, dresser, clothes rack, box fan
      { id: 'd-bed',         x: 0.2,  z: D / 2 - 0.9, ry: Math.PI },
      { id: 'd-dresser',     x: -1.3, z: D / 2 - 0.46, ry: Math.PI },
      { id: 'd-photoframe',  x: -1.5, y: 0.9, z: D / 2 - 0.5, ry: Math.PI - 0.3, shadow: false },
      { id: 'd-veladora',    x: -1.05, y: 0.9, z: D / 2 - 0.45, ry: 0, shadow: false, glow: 0xffb060 },
      { id: 'd-clothesrack', x: 2.0,  z: D / 2 - 0.25, ry: Math.PI },
      { id: 'd-boxfan',      x: 1.1,  z: 1.2, ry: Math.PI - 0.8 },
      { id: 'ceilinglight',  x: -0.3, y: H - 0.64, z: -0.3, ry: 0, shadow: false },
      { id: 'wallclock',     x: 0.6,  y: 1.95, z: -D / 2 + 0.012, ry: 0, shadow: false },
    ],
    lights: (scene, W, D, H) => {
      scene.add(new THREE.HemisphereLight(0xf2e6d2, 0x2c2620, 0.55));
      const k = new THREE.PointLight(0xfff3df, 9, 7, 1.7); k.position.set(1.8, H - 0.3, -0.6); k.castShadow = true; k.shadow.mapSize.set(1024, 1024); k.shadow.bias = -0.002; scene.add(k);
      const c = new THREE.PointLight(0xffd9a8, 5, 6, 1.8); c.position.set(-0.3, H - 0.7, -0.3); scene.add(c);
      const day = new THREE.DirectionalLight(0xcfe0f5, 0.7); day.position.set(1.3, 1.8, D / 2 - 0.2); day.target.position.set(0.5, 0.5, 0); scene.add(day, day.target);
      const candle = new THREE.PointLight(0xffa040, 1.2, 1.5, 2); candle.position.set(-1.05, 1.05, D / 2 - 0.45); scene.add(candle);
    },
    spots: { couch: V(0.1, 0, 0.3), kitchen: V(1.55, 0, -0.6), stove: V(1.6, 0, 0.25), window: V(1.3, 0, 1.3), door: V(-0.9, 0, -1.2), tv: V(-1.5, 0, 0.3), bed: V(0.2, 0, 0.6), dresser: V(-1.3, 0, 0.9) },
    seats: { sofa: { pos: V(-0.55, 0, 0.6), yaw: -Math.PI / 2, y: 0.02 }, sofa2: { pos: V(-0.55, 0, 0.0), yaw: -Math.PI / 2, y: 0.02 },
      bed: { pos: V(0.2, 0.5, 1.05), yaw: Math.PI, side: V(-0.65, 0, 1.0) }, counter: { pos: V(1.55, 0, -0.6), yaw: -Math.PI / 2 } },
    speaker: 'd-speakerdock', bass: null,
    playerStart: { pos: V(-0.9, 0, -1.5), yaw: Math.PI },
  },
};
