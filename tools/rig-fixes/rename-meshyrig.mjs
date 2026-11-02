import { NodeIO } from '@gltf-transform/core';
const [,, inp, out] = process.argv;
const MAP = { Bone_000:'Root', Bone_001:'Hips', Bone_005:'Spine02', Bone_004:'Spine01', Bone_003:'Spine', Bone_002:'Chest', Bone_018:'neck', Bone_017:'Head', Bone_016:'head_end',
 Bone_023:'LeftShoulder', Bone_022:'LeftArm', Bone_021:'LeftForeArm', Bone_020:'LeftHand', Bone_019:'LeftHandPalm',
 Bone_032:'LeftHandIndex1', Bone_031:'LeftHandIndex2', Bone_030:'LeftHandIndex3', Bone_029:'LeftHandIndex4',
 Bone_036:'LeftHandRing1', Bone_035:'LeftHandRing2', Bone_034:'LeftHandRing3', Bone_033:'LeftHandRing4',
 Bone_028:'RightShoulder', Bone_027:'RightArm', Bone_026:'RightForeArm', Bone_025:'RightHand', Bone_024:'RightHandPalm',
 Bone_040:'RightHandIndex1', Bone_039:'RightHandIndex2', Bone_038:'RightHandIndex3', Bone_037:'RightHandIndex4',
 Bone_044:'RightHandRing1', Bone_043:'RightHandRing2', Bone_042:'RightHandRing3', Bone_041:'RightHandRing4',
 Bone_015:'LeftUpLeg', Bone_014:'LeftLeg', Bone_013:'LeftFoot', Bone_012:'LeftToeBase', Bone_011:'LeftToe_end',
 Bone_010:'RightUpLeg', Bone_009:'RightLeg', Bone_008:'RightFoot', Bone_007:'RightToeBase', Bone_006:'RightToe_end' };
const io=new NodeIO();const doc=await io.read(inp);let n=0;
for(const node of doc.getRoot().listNodes()){const m=MAP[node.getName()];if(m){node.setName(m);n++;}}
doc.getRoot().listMaterials()[0].setName('tommy-skin');
await io.write(out,doc);console.log('renamed',n);
