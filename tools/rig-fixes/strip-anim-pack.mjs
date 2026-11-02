import { NodeIO } from '@gltf-transform/core';
import { prune } from '@gltf-transform/functions';
const io=new NodeIO();const doc=await io.read('anim.glb');const r=doc.getRoot();
// keep the skeleton and the clips; drop the mesh (and with it the textures)
for(const n of r.listNodes()) if(n.getMesh()){ n.setMesh(null); n.setSkin(null); }
for(const m of r.listMeshes()) m.dispose();
await doc.transform(prune());
// canonical bone names (the lab's): mixamorig:X -> X, the spine renamed bottom-up as the lab's bodies have it
const MAP={'mixamorig:Spine':'Spine02','mixamorig:Spine1':'Spine01','mixamorig:Spine2':'Spine','mixamorig:Neck':'neck','mixamorig:HeadTop_End':'head_end','mixamorig:LeftHandMiddle4':'LeftHand_End','mixamorig:RightHandMiddle4':'RightHand_End','mixamorig:LeftToe_End':'LeftToe_end','mixamorig:RightToe_End':'RightToe_end'};
for(const n of r.listNodes()){const nm=n.getName();n.setName(MAP[nm]||nm.replace('mixamorig:',''));}
// how far the hips travel in each clip (root motion)
for(const a of r.listAnimations()){for(const c of a.listChannels()){if(c.getTargetNode().getName()==='Hips'&&c.getTargetPath()==='translation'){const o=c.getSampler().getOutput().getArray();const n=o.length/3;console.log(a.getName().padEnd(26),'hips moves',[0,1,2].map(k=>(o[(n-1)*3+k]-o[k]).toFixed(1)).join(','),'(local units)');}}}
await io.write('pack.glb',doc);
