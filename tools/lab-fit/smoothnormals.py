# Shading normals for the garment's edge zone from the surface around each
# vertex (area-weighted face normals within R metres, in 3D) instead of from its
# own triangles: Meshy's rolled hems are mm-scale folds whose triangle normals
# swing wildly and draw a line no smoothing of positions removes. Writes normals.bin.
import numpy as np, sys
from scipy.spatial import cKDTree
R=float(sys.argv[1]) if len(sys.argv)>1 else 0.008
D=float(sys.argv[2]) if len(sys.argv)>2 else 0.04
I=np.fromfile('idx.bin',np.uint32).reshape(-1,3);P=np.load('newW.npy');m=np.load('mask_w.npy')
a,b,c=P[I[:,0]],P[I[:,1]],P[I[:,2]];fn=np.cross(b-a,c-a)          # area-weighted
cen=(a+b+c)/3
N=np.zeros_like(P)
for k in range(3): np.add.at(N,I[:,k],fn)
# orient: outward from the body's vertical axis on average
ax=np.median(P[:,[0,2]],0)
# zone: within D of any garment vertex (both sides of the edge)
tree_g=cKDTree(P[m]);dz,_=tree_g.query(P,distance_upper_bound=D);zone=np.isfinite(dz)
tc=cKDTree(cen)
zi=np.where(zone)[0]
for s in range(0,len(zi),20000):
  idx=zi[s:s+20000];nb=tc.query_ball_point(P[idx],R)
  for j,lst in zip(idx,nb):
    v=fn[lst].sum(0)
    # weight down toward the vertex's own normal near the zone's outer edge
    t=min(1.0,max(0.0,(D-dz[j])/(0.25*D)))
    N[j]=N[j]/max(np.linalg.norm(N[j]),1e-15)*(1-t)+v/max(np.linalg.norm(v),1e-15)*t
N/=np.maximum(np.linalg.norm(N,axis=1,keepdims=True),1e-12)
# make UV-seam duplicates share one normal
key=np.round(P*1e7).astype(np.int64);_,inv=np.unique(key,axis=0,return_inverse=True);inv=inv.ravel()
acc=np.zeros((inv.max()+1,3));np.add.at(acc,inv,N);acc/=np.maximum(np.linalg.norm(acc,axis=1,keepdims=True),1e-12);N=acc[inv]
bad=np.linalg.norm(N,axis=1)<0.5
if bad.any():
  for j,lst in zip(np.where(bad)[0],tc.query_ball_point(P[bad],R*2)):
    v=fn[lst].sum(0)
    if np.linalg.norm(v)<1e-15: v=P[j]-np.array([ax[0],P[j,1],ax[1]])
    N[j]=v/np.linalg.norm(v)
  print('fixed',bad.sum(),'cancelled normals')
N.astype(np.float32).tofile('normals.bin');print('zone verts',zone.sum())
