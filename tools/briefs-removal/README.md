# Briefs removal (imported bodies)

How Adult base 01's baked-in briefs were turned back into skin. Rerun per body; the numbers (heights, widths) are for a 1.70 m Meshy/Mixamo body facing +z and need checking on another.

1. `FBX2glTF --binary --pbr-metallic-roughness` the rigged FBX, then `fix.mjs` (drops the converter's bogus metal map, roughness 0.62).
2. `dump.mjs` writes positions/UVs/indices and the base texture; a colour test (low saturation, dark, pelvis height) masks the briefs (`vmask.npy`, `tmask.npy`).
3. `reshape.py` pulls the fabric 4 mm in (tapered to 0 at its edge), relaxes the pouch to a membrane, smooths the waist/leg bands, and sinks the gluteal cleft. UVs and skin weights are untouched.
4. `write.mjs` puts the new positions back (and recomputes welded normals).
5. `repaint.py` fills the briefs texels with skin: a harmonic (mesh-space) colour fill from the surrounding skin, grain from a clean skin patch, flat normals, carried 12 px past the hem's shadow line. `pad.py` pads every UV island against mip bleed.
6. `tex.mjs` builds the final GLB; gltf-transform resize/webp/simplify makes desktop (4K) and mobile (2K, ~35% tris).

The anatomy itself is not baked in: `world/attach-anatomy.mjs` builds it from the lab's `buildAnatomy` on the Hips bone at load, so the lab's sliders and the Measure tool's presets drive it.
