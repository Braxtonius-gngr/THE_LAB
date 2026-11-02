import { NodeIO } from '@gltf-transform/core';
import fs from 'fs';
const [,, out, tex] = process.argv;
const io=new NodeIO();const doc=await io.read(process.env.WORK+'/fixed.glb');const prim=doc.getRoot().listMeshes()[0].listPrimitives()[0];
const a=prim.getAttribute('POSITION');const b=fs.readFileSync(process.env.WORK+'/newpos.bin');a.setArray(new Float32Array(b.buffer,b.byteOffset,b.byteLength/4).slice());
// recompute normals for the moved region
const P=a.getArray(),I=prim.getIndices().getArray(),N=new Float32Array(P.length);
for(let t=0;t<I.length;t+=3){const [i,j,k]=[I[t]*3,I[t+1]*3,I[t+2]*3];const ux=P[j]-P[i],uy=P[j+1]-P[i+1],uz=P[j+2]-P[i+2],vx=P[k]-P[i],vy=P[k+1]-P[i+1],vz=P[k+2]-P[i+2];
 const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;for(const q of [i,j,k]){N[q]+=nx;N[q+1]+=ny;N[q+2]+=nz;}}
// weld normals across UV seams (same position)
const key=new Map();for(let v=0;v<P.length/3;v++){const kk=`${Math.round(P[v*3]*1e8)},${Math.round(P[v*3+1]*1e8)},${Math.round(P[v*3+2]*1e8)}`;if(!key.has(kk))key.set(kk,[]);key.get(kk).push(v);}
for(const g of key.values()){if(g.length<2)continue;let s=[0,0,0];for(const v of g){s[0]+=N[v*3];s[1]+=N[v*3+1];s[2]+=N[v*3+2];}for(const v of g){N[v*3]=s[0];N[v*3+1]=s[1];N[v*3+2]=s[2];}}
for(let v=0;v<N.length;v+=3){const l=Math.hypot(N[v],N[v+1],N[v+2])||1;N[v]/=l;N[v+1]/=l;N[v+2]/=l;}
prim.getAttribute('NORMAL').setArray(N);
const nb=process.env.NORMALS||'';if(nb&&fs.existsSync(nb)){const b2=fs.readFileSync(nb);prim.getAttribute('NORMAL').setArray(new Float32Array(b2.buffer,b2.byteOffset,b2.byteLength/4).slice());console.log('smoothed normals used');}
const m=doc.getRoot().listMaterials()[0];
if(tex){m.getBaseColorTexture().setImage(fs.readFileSync(tex)).setMimeType('image/png');}
await io.write(out,doc);
