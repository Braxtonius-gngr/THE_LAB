# Rig fixes

- `rename-meshyrig.mjs`: MeshyRig exports bones as Bone_000..Bone_044; this maps them to the lab's Mixamo-style names (map checked by joint positions; re-check per body).
- `split-limbs.py`: auto-rig weights bleed between hands resting on thighs. Each vertex is labelled hand / upper arm / torso / leg by geodesic (surface) distance from clean seeds, then hand weights are stripped from torso and legs and leg/pelvis weights from hands. Cuts triangles only where a hand and a thigh are truly fused (none on Tommy).
- `apply-weights.mjs`: writes the new JOINTS/WEIGHTS back into the GLB.
- `automap.mjs`: names any auto-rig's bones by the skeleton's shape (legs reach the floor; Hips is where the leg and spine chains meet; spine bottom-up to where the arms branch; fingers by place across the palm, thumb most forward; a separate legs bone becomes `Pelvis`). Reproduces Tommy's hand-made map exactly. `node automap.mjs in.glb out.glb`.
