# Animation packs

`meshy-pack-01.glb`: Meshy's merged animations for Adult base 01 (Running, Walking, 360 Power Spin Jump, Parkour Vault with Roll, Standard Forward Charge, Swim Forward, Swing on Rope to Ground, Air Squat). Skeleton and clips only (mesh stripped, 195 KB); bones renamed from `mixamorig:` to the lab's canonical names. All clips are in place.

The Bodies page retargets every clip onto whichever body is shown (`world/retarget.mjs`): rotations are carried as changes from rest in body axes, so rigs with different bone orientations (Mixamo, MeshyRig) both work. Bones a target lacks (Tommy's Chest, fingers) stay at rest.

To add a pack: convert the FBX with FBX2glTF, strip the mesh and rename bones to the canonical names (see the strip script in the commit that added this file), drop it here and list it in `lab/bodies.html`.
