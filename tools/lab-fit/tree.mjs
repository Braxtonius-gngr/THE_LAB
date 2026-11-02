import { NodeIO } from '@gltf-transform/core';
const doc=await new NodeIO().read(process.argv[2]);const r=doc.getRoot();
const sk=r.listSkins()[0];const J=new Set(sk.listJoints());
const roots=r.listScenes()[0].listChildren();
function walk(n,d){const t=n.getWorldTranslation();console.log(' '.repeat(d*2)+n.getName()+(J.has(n)?'':' (node)')+'  '+t.map(v=>v.toFixed(3)).join(','));for(const c of n.listChildren())walk(c,d+1);}
roots.forEach(n=>walk(n,0));
