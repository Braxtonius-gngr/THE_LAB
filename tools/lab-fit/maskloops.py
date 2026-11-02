# Garment mask from Meshy's stitch seams, for garments the colour of the skin.
# The dense seam vertices are read as two kinds of curve: the waistband (height
# per angle around the body axis) and the leg openings (height per angle around
# each thigh axis). The garment is what lies below the waistband and above the
# leg openings, plus the crotch between the thighs.
# Usage: maskloops.py WLO WHI LLO LHI   (waistband y range, leg-opening y range)
import numpy as np, sys
WLO,WHI,LLO,LHI=[float(v) for v in sys.argv[1:5]] if len(sys.argv)>4 else (0.84,0.99,0.70,0.86)
I=np.fromfile('idx.bin',np.uint32).reshape(-1,3);W=np.load('W.npy');x,y,z=W.T
key=np.round(W*1e5).astype(np.int64);_,uid,inv=np.unique(key,axis=0,return_index=True,return_inverse=True);inv=inv.ravel();U=W[uid];n=len(U);F=inv[I]
e=np.vstack([F[:,[0,1]],F[:,[1,2]],F[:,[2,0]]]);L=np.linalg.norm(U[e[:,0]]-U[e[:,1]],axis=1)
acc=np.zeros(n);cnt=np.zeros(n)
for a in (0,1): np.add.at(acc,e[:,a],L);np.add.at(cnt,e[:,a],1)
avg=acc/np.maximum(cnt,1);band=(U[:,1]>0.6)&(U[:,1]<1.05)&(np.abs(U[:,0])<0.25)
dense=band&(avg<np.median(avg[band])*0.6)
D=U[dense]
NB=48
def curve(pts,cx,cz,lo,hi,agg=np.median):
  s=(pts[:,1]>lo)&(pts[:,1]<hi);p=pts[s];th=np.arctan2(p[:,0]-cx,p[:,2]-cz);b=((th+np.pi)/(2*np.pi)*NB).astype(int)%NB
  out=np.full(NB,np.nan)
  for k in range(NB):
    if (b==k).sum()>=3: out[k]=agg(p[b==k,1])
  # circular interpolation over empty bins
  idx=np.arange(NB);ok=~np.isnan(out)
  if ok.sum()<4: return None
  out=np.interp(idx,np.concatenate([idx[ok]-NB,idx[ok],idx[ok]+NB]),np.concatenate([out[ok]]*3))
  return out
def at(cv,px,pz,cx,cz):
  th=np.arctan2(px-cx,pz-cz);f=(th+np.pi)/(2*np.pi)*NB;i0=np.floor(f).astype(int)%NB;i1=(i0+1)%NB;t=f-np.floor(f)
  return cv[i0]*(1-t)+cv[i1]*t
# body axis
bx,bz=np.median(x[(y>0.85)&(y<0.95)]),np.median(z[(y>0.85)&(y<0.95)])
waist=curve(D,bx,bz,WLO,WHI,agg=np.max)        # top edge of the band
# thigh axes from the leg slices
thighs=[]
for sgn in (-1,1):
  s=(y>0.62)&(y<0.70)&(np.sign(x-bx)==sgn)&(np.abs(x-bx)<0.2);thighs.append((np.median(x[s]),np.median(z[s])))
legs=[curve(D,cx,cz,LLO,LHI,agg=np.min) for cx,cz in thighs]   # bottom edge of each leg hem
print('waist y range %.3f-%.3f'%(waist.min(),waist.max()),'legs',[('%.3f-%.3f'%(l.min(),l.max())) if l is not None else None for l in legs],'thigh axes',np.round(thighs,3).tolist())
below_waist=y<at(waist,x,z,bx,bz)+0.004
on_leg=np.zeros(len(W),bool)
for (cx,cz),lc in zip(thighs,legs):
  if lc is None: continue
  r=np.hypot(x-cx,z-cz);near=r<0.16
  on_leg|=near&(y<at(lc,x,z,cx,cz)-0.004)
m=below_waist&~on_leg&(y>0.6)&(y<1.05)&(np.abs(x-bx)<0.25)
print('garment verts',m.sum(),'y %.3f-%.3f'%(y[m].min(),y[m].max()))
np.save('vmask.npy',m)
