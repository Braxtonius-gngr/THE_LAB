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
# Faces (route 1 of the assessment in HANDOFF.md)

The face module (`world/face.mjs`) drives the 52 ARKit blendshapes - the same set Unreal's Live
Link face uses - wherever a body has them, and gives every body the timing of a face anyway
(blinks, glances, speech rhythm) as small head motion. Nothing in the engine changes when a body
gains its shapes; they simply start moving. `lab/face.html` is the tuning page.

## Making the shapes (Blender + Faceit, on the MSI)
1. Import the body's `desktop.glb` into Blender (3.0-5.2). Faceit (Superhive, the ARKit tier) fits
   landmarks to a humanoid head and generates the 52 shapes.
2. **Split the head first.** Select the mesh, edit mode, select the `Head` vertex group (and
   `head_end` if it has weight), `P` → Selection. Name the new object `Head`. Keep the armature
   modifier on both parts. The shapes must live on this small mesh (12-15k verts on Marco): on the
   whole 100k-vertex body they would be 80-170 MB of GPU texture and the phone would not cope.
3. Run Faceit on the `Head` object: landmarks → generate ARKit expressions. Check with the Faceit
   sliders that `eyeBlinkLeft/Right` close the painted eyes cleanly, `jawOpen` does not tear the
   neck seam, `mouthSmile*` keeps the lips attached. Meshy heads have closed, painted eyes and no
   inner mouth: keep `jawOpen` modest in Faceit's setup if a dark void shows, or add a simple
   teeth/tongue mesh behind the lips (a later step).
4. Optional but worth it: re-UV the head onto its own 2048 texture (project from the existing
   4096 body map). Today the whole head gets about a 740 px square of the body texture.
5. Export GLB with "Shape Keys" on and shape-key names kept (glTF `extras.targetNames`), skinning
   on, the same bone names. Export the mobile tier the same way from the decimated body (keep the
   head at full resolution; decimate the body only).
6. `node tools/face/check.mjs assets/bodies/<id>/desktop.glb` says which shapes landed and how
   much GPU memory they take. Then open `lab/face.html?body=<id>`: the mood sliders, a blink, a
   line said with his real voice and timing, and one slider per shape.

## What the module does with the shapes
- Mood (the mind's valence and energy): smile and cheek squint when warm; frown with brows down
  when bothered and wound up, brows inner-up when bothered and low; heavy lids when tired; wide
  eyes when wired. Small weights, a resting face is mostly still.
- Blinks every 2-6 s (quicker when wound up); glances that drift and come back - eye contact is
  the resting state.
- Speech: ElevenLabs returns when each character is spoken (`voice` function, `timing: true`);
  letters map to rough visemes (jaw, funnel, pucker, closed lips for m/b/p, lower lip under the
  teeth for f/v). The browser's own voice gives word boundaries only, so the mouth moves to a
  rougher beat there.
- Listening (the mic is open): brows up a touch, a slight head tilt.

## Route 2, the bridge (in): eyes and brows on the fused head
Until a body has shapes, `world/face.mjs` runs its skin path on the body's own material: a lid
of skin slides down over each painted eye (blinks, heavy lids), the brow vertices lift or lower
with the mood, and the iris slides a few millimetres for glances (the texture lookup moves,
following whichever way the texture island lies). The mouth is a stopgap: the jaw drops a few
millimetres on the vowels with the lip line opening dark between the lips, m/b/p close it, and
the corners lift or fall with the mood. There is no inner mouth to show, so it stays small; the
"mouth stopgap" box on the face page (localStorage `lab.face.mouth`) turns it off if it reads
wrong on your screen. It needs
only the `face` block in `bodies.json`: the two eye centres, six brow points, the mouth centre and
corners in the mesh's own vertex space, plus the eye's and lips' half-sizes in metres. Marco and Dante have theirs. To place or
correct them: `lab/face.html?body=<id>` → Landmarks → pick an anchor, **place**, click the spot
on his face (his left is screen-right when he faces you), **apply** to see it, **JSON** to copy
the block into `bodies.json`. The same anchors serve the phone mesh (`?tier=mobile` to check).
The lid colour is read off the texture near the eye at load, so a re-textured body needs no
change. When ARKit shapes land on a body the skin path steps aside by itself.

## Shape transfer (`tools/face/transfer.mjs`): shapes from any ARKit head, no Blender
A free route to the 52 shapes, and the way to give Dante (and every body after) Marco's shapes
once Faceit has made them, without a second Faceit pass:

    node tools/face/transfer.mjs --from <head.glb> --to dante            # desktop mesh
    node tools/face/transfer.mjs --from <head.glb> --to dante --tier mobile
    node tools/face/transfer.mjs --selftest --to dante                   # a made-up source, to see it run

The source is any GLB whose head mesh has ARKit-named morph targets: a Ready Player Me avatar
(`https://models.readyplayer.me/<avatar-id>.glb?morphTargets=ARKit`, free account), or a Faceit
export of one of our own heads. Its landmarks come from its own shapes (where eyeBlinkLeft moves
vertices is the left eye, mouthSmileLeft the corner, jawOpen the chin); the target's from the
`face` anchors in `bodies.json`. The source is fitted on by a translation and a per-axis scale,
every head vertex takes the nearest source deltas, the head is split into its own primitive and
the shapes go on it (sparse, a few MB). Output lands in `tools/face/out/` (git-ignored):

    node tools/face/check.mjs tools/face/out/dante-desktop.glb
    lab/face.html?body=dante&glb=tools/face/out/dante-desktop.glb

If it reads right, copy it over `assets/bodies/dante/desktop.glb` (and the mobile one). The
printed landmark residuals should be around 10 mm; 30+ means an anchor is off (re-pick it on
the face page) or the source faces the wrong way. Painted eyes have no eyeball for a blink
shape to close over, so with shapes present the face module still draws the lid of skin itself
(eyes stay on the skin path; the shapes do brows and mouth).

### What's in the repo now
Marco and Dante have shaped heads made this way from the MPFB avatar of the TalkingHead project
(CC0, public domain; github.com/met4citizen/TalkingHead, `avatars/mpfb.glb`): 52 ARKit shapes plus
15 speech visemes, landmark residuals 1-4 mm. They sit beside the plain bodies as
`assets/bodies/<id>/{desktop,mobile}-face.glb` and load only with `?faces=1` (apartment and face
page). Dante reads well; Marco's mouth tears into angular dark when it opens wide (his lips are one
thin fold in the Meshy mesh), so talking is kept small. Faceit on Marco's own head is still the
better mouth; the transfer then carries it to Dante.

## Route 3: the Unreal era
Rebuild the men on a face-first character base when the move to Unreal happens: Mesh to
MetaHuman can take the current heads for the likeness; MetaHumans may now be used outside
Unreal too (Epic, June 2025, free under $1M revenue). Not before: every garment (20 on Marco, 12
on Dante) and the anatomy fit are tied to the current meshes.
