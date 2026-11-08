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
following whichever way the texture island lies). The mouth is left alone on purpose. It needs
only the `face` block in `bodies.json`: the two eye centres and six brow points in the mesh's own
vertex space, plus the eye's half-sizes in metres. Marco and Dante have theirs. To place or
correct them: `lab/face.html?body=<id>` → Landmarks → pick an anchor, **place**, click the spot
on his face (his left is screen-right when he faces you), **apply** to see it, **JSON** to copy
the block into `bodies.json`. The same anchors serve the phone mesh (`?tier=mobile` to check).
The lid colour is read off the texture near the eye at load, so a re-textured body needs no
change. When ARKit shapes land on a body the skin path steps aside by itself.

## Route 3: the Unreal era
Rebuild the men on a face-first character base when the move to Unreal happens: Mesh to
MetaHuman can take the current heads for the likeness; MetaHumans may now be used outside
Unreal too (Epic, June 2025, free under $1M revenue). Not before: every garment (20 on Marco, 12
on Dante) and the anatomy fit are tied to the current meshes.
