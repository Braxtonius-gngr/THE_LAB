# tools/lab-fit

The scripts behind the `/lab-fit` skill (see the skill for the full procedure). Node scripts read `$WORK`; Python scripts run from inside `$WORK`.

| Step | Script | Notes |
|---|---|---|
| inspect | `probe.mjs`, `tree.mjs` | bones, material factors, hierarchy with positions |
| rig | `automap.mjs` | names any auto-rig's bones from the skeleton's shape |
| dump | `dump.mjs`, `nrm.mjs` | positions/UVs/indices, base colour, normal map |
| reshape | `reshape.py` | thin briefs: pull in, thin-plate front, cleft, stitch-strip relax, fold untangle, front waist lip |
| reshape (thick) | `bandfill.py` | thin-plate re-fill of a band either side of the garment edge (ledges, hem lips); run after reshape |
| shading | `smoothnormals.py` | rebuilds shading normals in the edge zone from the surrounding surface. **The seam line Meshy's rolled hems leave is in the normals, not the shape**: positions can be smooth to <2° and the line still shows. Pass `NORMALS=$WORK/normals.bin` to `write.mjs`. |
| write | `write.mjs` | new positions (+ optional normals) into the GLB |
| texture | `repaint.py`, `tone.py`, `edgefix.py`, `hair.py`, `pad.py`, `tex.mjs` | skin fill + grain, pressure-line tone, baked edge softening, strand-by-strand hair (`HAIRK`/`PUBK` env scale density), island padding |
| weights | `split-limbs.py`, `reweight2.mjs` | hand/thigh weight bleed |
| verify | `views.html` + `render.cjs`, `bodies-test.cjs` | 4-view strip (flat / nonrm / onlyn / noskin / ds modes), Bodies-page test |

**Skin-coloured garments** (Rodin): colour can't separate them from skin, so `maskloops.py WLO WHI LLO LHI` reads Meshy's dense stitch seams as curves (waistband height per angle round the body axis, leg-opening height per angle round each thigh axis) and masks what lies between. `maskseams.py` (flood-fill between seam walls) is kept but leaks wherever a single big triangle spans a seam. Build `tmask.npy` from the masked triangles afterwards.
