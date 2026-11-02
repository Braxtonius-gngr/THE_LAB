# Briefs removal (imported bodies)

How Adult base 01's baked-in briefs were turned back into skin. Rerun per body; the numbers (heights, widths) are for a 1.70 m Meshy/Mixamo body facing +z and need checking on another.

1. `FBX2glTF --binary --pbr-metallic-roughness` the rigged FBX, then `fix.mjs` (drops the converter's bogus metal map, roughness 0.62).
2. `dump.mjs` writes positions/UVs/indices and the base texture; a colour test (low saturation, dark, pelvis height) masks the briefs (`vmask.npy`, `tmask.npy`).
3. `reshape.py` pulls the fabric 4 mm in (tapered to 0 at its edge), relaxes the pouch to a membrane, smooths the waist/leg bands, and sinks the gluteal cleft. UVs and skin weights are untouched.
4. `write.mjs` puts the new positions back (and recomputes welded normals).
5. `repaint.py` fills the briefs texels with skin: a harmonic (mesh-space) colour fill from the surrounding skin, grain from a clean skin patch, flat normals, carried 12 px past the hem's shadow line. `pad.py` pads every UV island against mip bleed.
6. `tex.mjs` builds the final GLB; gltf-transform resize/webp/simplify makes desktop (4K) and mobile (2K, ~35% tris).

The anatomy itself is not baked in: `world/attach-anatomy.mjs` builds it from the lab's `buildAnatomy` on the Hips bone at load, so the lab's sliders and the Measure tool's presets drive it.

7. `hair.py` (for hairy bodies, after step 5): paints body hair strand by strand over the repainted area. Hairs are placed on the 3D surface by a per-region density (pubic patch around the anatomy's root, belly line, groin, leg openings matching the thighs, sparse glutes) and a flow field (down the belly line and into the groin, down and outward over hips, thighs and glutes), then each strand is drawn through its own triangle's 3D-to-UV mapping, so it follows the body across UV seams instead of tiling. Coarse curly hair for the pubic area, finer straighter lighter hair elsewhere; clipped to the region's own texels. Run: `python3 hair.py base_nohair.png base_new.png region` (needs `hair_region.npy`; ROOT is the anatomy root from bodies.json).
