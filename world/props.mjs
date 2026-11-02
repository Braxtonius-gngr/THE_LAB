// Load baked props (assets/props/<id>/{desktop,mobile}.glb) and place them.
// Each placement: { id, x, z, y?, ry?, shadow? }.  Props are baked with their
// origin at the floor centre and their front on +z, so a placement is just a
// floor position and a yaw.  The same id used twice shares geometry.
export async function loadProps(loader, placements, { tier = 'desktop', base = '../assets/props/' } = {}) {
  const cache = new Map();
  const get = id => { if (!cache.has(id)) cache.set(id, loader.loadAsync(`${base}${id}/${tier}.glb`)); return cache.get(id); };
  return Promise.all(placements.map(async p => {
    const g = (await get(p.id)).scene.clone(true);
    g.name = p.id; g.userData.prop = p;
    g.position.set(p.x, p.y || 0, p.z); g.rotation.y = p.ry || 0;
    g.traverse(o => { if (o.isMesh) { o.castShadow = p.shadow !== false; o.receiveShadow = true; } });
    return g;
  }));
}
