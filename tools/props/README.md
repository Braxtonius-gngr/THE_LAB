# Props pipeline (Meshy → world)

Meshy exports every prop normalised to a ~0.95 m cube centred at the origin, front on +z,
one mesh, one 2048² PBR texture, 13–26k triangles. The size we want is in the filename
(`..._sofa_w220cm_...` = 2.2 m wide, `..._fridge_h180cm_...` = 1.8 m tall).

| step | tool | notes |
|---|---|---|
| inventory | `probe.mjs` (run in the unzipped folder) | prints size / tris / textures per prop |
| look | `view.html?m=<glb>&s=<scale>` + `../lab-fit/render.cjs` | front / ¾ / side / top with a 1 m grid and a 1.75 m capsule for scale |
| bake | `bake.mjs <raw.glb> <id> <s|sx,sy,sz> assets/props/<id>` (run from `tools/lab-fit`) | scales to metres, origin at the floor centre, writes `desktop.glb` (2048 webp) + `mobile.glb` (1024 webp, ~35 % tris) |
| place | `world/props.mjs` `loadProps(loader, [{ id, x, z, y?, ry?, shadow? }], { tier })` | yaw only; the baked origin makes placement a floor point |

Scale = target cm / 100 / normalised size on that axis. Check the result on the grid before
baking: Meshy sometimes puts the long axis where you don't expect (the nightstand came out
deeper than wide, so it got a non-uniform scale), and a "w" measurement can leave a table
too low (the dining table was scaled by height instead).

`assets/props/props.json` is the catalog. `tools/props/node_modules` is a symlink to the
lab-fit toolchain's modules (gltf-transform, meshoptimizer, sharp).
