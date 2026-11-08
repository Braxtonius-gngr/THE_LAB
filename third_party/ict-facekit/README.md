# ICT FaceKit (vendored subset)
Source: https://github.com/ICT-VGL/ICT-FaceKit @ da5f95a607f5e6b37755b38d3385d7f2853732e5 - MIT (LICENSE here).
Kept in the repo: `FaceXModel/generic_neutral_mesh.obj` (26,719 verts: head, neck, eyes, teeth, tongue, lashes), `FaceXModel/vertex_indices.json` (the 53 expression names, face/head regions, 68 landmarks), `Blender/ICTFaceKit.py` (their Blender loader, reference only).
Not kept (fetch with `tools/face/fetch-facekit.sh`): the 53 expression OBJs and 100 identity OBJs.
THE_LAB uses FaceKit as the **expression standard and transfer source**, not as the head mesh: see `assets/face/expressions.json` and `tools/face/`.
