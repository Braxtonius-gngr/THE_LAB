# Garment mask for garments the same colour as the skin: Meshy stitches every
# hem and waistband as a dense strip of tiny triangles. Find those strips by
# edge length, then flood-fill the mesh from a seed inside the garment without
# crossing them. The fill is the garment.  Usage: maskseams.py SEED_Y SEED_Z [dense_frac] [YLO YHI]
import numpy as np, scipy.sparse as sp, sys
from scipy.sparse.csgraph import connected_components
SY=float(sys.argv[1]); SZ=float(sys.argv[2]); FRAC=float(sys.argv[3]) if len(sys.argv)>3 else 0.5
YLO=float(sys.argv[4]) if len(sys.argv)>4 else 0.6; YHI=float(sys.argv[5]) if len(sys.argv)>5 else 1.05
I=np.fromfile('idx.bin',np.uint32).reshape(-1,3);W=np.load('W.npy')
key=np.round(W*1e5).astype(np.int64);_,uid,inv=np.unique(key,axis=0,return_index=True,return_inverse=True);inv=inv.ravel();U=W[uid];n=len(U);F=inv[I]
e=np.vstack([F[:,[0,1]],F[:,[1,2]],F[:,[2,0]]]);L=np.linalg.norm(U[e[:,0]]-U[e[:,1]],axis=1)
acc=np.zeros(n);cnt=np.zeros(n)
for a,b in ((0,1),(1,0)): np.add.at(acc,e[:,a],L);np.add.at(cnt,e[:,a],1)
avg=acc/np.maximum(cnt,1)
band=(U[:,1]>YLO)&(U[:,1]<YHI)
dense=band&(avg<np.median(avg[band])*FRAC)
A=sp.coo_matrix((np.ones(len(e)),(e[:,0],e[:,1])),shape=(n,n)).tocsr();A=((A+A.T)>0)
# thicken the walls by one ring so the fill can't slip through a corner
RINGS=int(sys.argv[6]) if len(sys.argv)>6 else 2
wall=dense.copy()
for _ in range(RINGS): wall=wall|(((A@wall.astype(float))>0)&band)
# seed: the vertex nearest (0, SY, SZ) that is not a wall
d=np.linalg.norm(U-np.array([0,SY,SZ]),axis=1);d[wall]=9;seed=int(np.argmin(d))
free=~wall&band
Af=A[free][:,free]
nc,lab=connected_components(Af,directed=False)
fi=np.where(free)[0];seedlab=lab[np.searchsorted(fi,seed)]
m=np.zeros(n,bool);m[fi[lab==seedlab]]=True
m|=wall&((A@m.astype(float))>0)   # the walls themselves belong to the garment too
for _ in range(2): m|=wall&((A@m.astype(float))>0)
print('dense verts',dense.sum(),'garment verts',m.sum(),'y',U[m,1].min().round(3),U[m,1].max().round(3),'x',U[m,0].min().round(3),U[m,0].max().round(3))
np.save('vmask.npy',m[inv])
