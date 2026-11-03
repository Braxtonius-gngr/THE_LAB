# Garments (Meshy -> a rigged body)

Meshy garments come normalised to a ~1 m cube, modelled as if worn in an A-pose with no body.

| step | tool | notes |
|---|---|---|
| body | `../lab-fit/skindump.mjs <body.glb> <dir>` | world positions, joints, weights, node matrix - once per body and tier |
| dump | `gdump.mjs <raw.glb> <dir>` | the garment's positions and triangles |
| fit | `fit.py <garmentDir> <bodyDir> <kind> <outDir> [json]` | kinds `top` / `pants` / `under` / `socks` / `shoes` (each shoe scaled to its own foot's length + `room`, sole on the floor); json overrides `top`, `h`, `bottom`, `off` (cloth's distance off the skin), `sleeveless`, `cover`. Scales and places it, swings sleeves to the arm angle, pushes it out of the skin, copies weights from the nearest skin, and lists the body triangles it covers |
| write | `gwrite.mjs <raw.glb> <fitDir> <out.glb>` | then copy `hide.u32` to `<out>.hide.bin` |
| wear | `world/garments.mjs` `wear(loader, model, url)` | binds to the body's own skeleton; cuts the covered skin out while worn; cuts close-under inner layers |

Files: `assets/garments/<garment>/<bodyId>.glb` (+ `.mobile.glb`, `.hide.bin` for each). Catalog and
outfits: `assets/garments/garments.json`. The Bodies page lists every outfit whose items are all fitted to
the body shown.

Marco's fits (spec used): tshirt `top`; tanktop `top {"h":0.70,"sleeveless":true}`; workshirt `top
{"top":1.5,"h":0.78}`; flannel `top {"top":1.5,"h":0.78,"off":0.012}`; denimjacket `top
{"top":1.5,"h":0.66,"off":0.016}`; hoodie `top {"top":1.53,"h":0.78}`; jeans, chinos `pants`; sweatpants
`pants {"off":0.009}`; boxerbriefs `under`; apron `under {"top":1.0,"bottom":0.5,"off":0.012}`; crewsocks `socks`.

Footwear (batch 5): sneakers `shoes {"top":0.12}`, slides `{"top":0.055,"room":0.015}`, workboots `{"top":0.17,"room":0.03}`, blackshoes `{"top":0.115}`; sleepwear: pajamapants `pants {"off":0.012}`, sleepshorts `under {"top":0.99,"bottom":0.6}`, sleeptee `top {"h":0.74}`. Shoes go on bare feet (crew socks are bulkier than the shoes and poke through).
