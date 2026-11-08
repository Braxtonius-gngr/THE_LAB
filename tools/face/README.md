# Faces: FaceKit → THE_LAB bodies

The bodies (`assets/bodies/<name>/{desktop,mobile}.glb`) are single skinned Meshy/Rodin meshes with no face rig. This folder gives them one, automatically, using ICT FaceKit's 53 FACS expressions as the standard.

## The contract
`assets/face/expressions.json` - the 53 expression ids (FaceKit / ARKit names), groups, the `core` tier, 15 visemes and 4 mood anchors as weight maps over those ids, and blink timing. Every surface speaks this: browser morph targets (`world/face.mjs`), Blender shape keys (this fitter), Unreal morph targets (later). Add an id here first; never invent one downstream.

## The fitter: `fit-facekit.py` (Blender, headless, ~10 s per body)
```
tools/face/fetch-facekit.sh                                   # once: the 53 expression OBJs (140 MB, not committed)
blender -b -P tools/face/fit-facekit.py -- --body assets/bodies/dante/desktop.glb --preview
tools/face/fit-all.sh                                         # every body, both tiers
```
Writes `<tier>.face.glb` beside the input (the original is never touched), a `.fit.json` report (fit error, per-expression max displacement, L/R asymmetry flags) and, with `--preview`, front renders of neutral + six expressions.

How it fits, so you can judge the numbers in the report:
1. **Head** = vertices skinned to `Head`/`head_end`/`headfront` (neck at 35 %).
2. **Anchors**: FaceKit landmark 30 (nose tip) onto the body's most forward head vertex; FaceKit crown onto the body's; that fixes scale and height. Both facings are tried.
3. **Similarity ICP** (scale, rotation, translation; trimmed 20 %) of FaceKit's 7801 face-skin verts onto the body head surface. Dante mobile: 2.4 mm rms.
4. **Non-rigid wrap**: face-skin verts projected to the body surface, offsets Laplacian-smoothed over the FaceKit mesh so the wrap follows the body without crumpling.
5. **Transfer**: each body head vertex finds its nearest point on the wrapped FaceKit face; the expression delta there (barycentric, rotated and scaled like the fit) becomes its shape-key offset, faded to zero beyond `--falloff` (2.5 cm) from the fitted face and outside the head weights.
6. **Export** glTF with `export_morph=True`; shape-key names become `morphTargetDictionary` keys in Three.js.

`python tools/face/fit-facekit.py ...` (no `--`) also works anywhere `pip install bpy` works; that is how it was tested here.

## What the first run (Dante, mobile) showed
`samples/` has three renders. Smile, brows, pucker, sneer read correctly and symmetric. Two known limits, both Blender-weekend work, not fitter bugs:
- **jawOpen / mouthClose / visemes**: the Meshy mouth is sealed - lips are one surface with no cavity, teeth or tongue. Opening the jaw stretches the lip skin as a sheet. Fix: cut the mouth seam and add FaceKit's mouth interior (its OBJ carries gums/teeth/tongue) *before* fitting, or accept closed-lip talking (press/pucker/stretch still work) for now.
- **eyeBlink**: Meshy eyeballs and lids share one surface, so the lid delta tears at the socket. Fix: separate eyeballs (or let FaceKit's eye shells replace them) before fitting.
Also: the mobile mesh is low-poly around the cheeks, so big smiles show facets; desktop will read better. The `.face.glb` is ~2x the original (53 full-length delta arrays); if that matters on phones, export `core` tier (`--tier core`, 24 ids).

## Runtime: `world/face.mjs`
`new FaceRig(model, contract)` finds the morph targets; `setMood({valence,energy})` from the mind, `setGaze()` from the reflexes (or pass `reflexes`), `express(id|map, amount, hold)` for one-shots the mind asks for (`{type:'express', id}`), `speak(frames)` for viseme timing or `speakAmplitude(analyser)` as the fallback; `update(dt)` each frame. A body with no face rig is fine: `face.rigged === false`, nothing applied. `lab/face.html` is the tuning page (mood sliders, every contract id, presets, mic → mouth). It prefers `<tier>.face.glb` when it exists, else the plain body.

## Not wired yet
`world/apartment.html` does not construct a FaceRig; once the fitted GLBs are in, that is: load `.face.glb`, `new FaceRig`, `setMood` where the mind reply is applied, `update(dt)` beside `reflexes.update`, and `speakAmplitude` on the voice's analyser. Deliberately left for after the heads are checked in Blender.
