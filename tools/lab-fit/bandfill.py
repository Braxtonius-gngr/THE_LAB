# Erase ledges and hem lips at a garment's edge: thin-plate (biharmonic) fill of
# a band within D metres (surface distance) of the edge, both sides, with
# everything outside the band held - the band becomes a smooth C1 bridge from
# the garment's (pulled-in) interior to the skin.
import numpy as np, scipy.sparse as sp, sys
from scipy.sparse.csgraph import dijkstra
from scipy.sparse.linalg import spsolve
D = float(sys.argv[1]) if len(sys.argv) > 1 else 0.02
YMIN = float(sys.argv[2]) if len(sys.argv) > 2 else 0.0
I=np.fromfile('idx.bin',np.uint32).reshape(-1,3);W0=np.load('W.npy');Wn=np.load('newW.npy');mw=np.load('mask_w.npy')
key=np.round(W0*1e5).astype(np.int64);_,uid,inv=np.unique(key,axis=0,return_index=True,return_inverse=True);inv=inv.ravel();n=len(uid);F=inv[I]
U=Wn[uid].copy();m=np.zeros(n,bool);np.logical_or.at(m,inv,mw)
e=np.vstack([F[:,[0,1]],F[:,[1,2]],F[:,[2,0]]]);Lw=np.linalg.norm(U[e[:,0]]-U[e[:,1]],axis=1)+1e-9
G=sp.coo_matrix((Lw,(e[:,0],e[:,1])),shape=(n,n)).tocsr();G=G.maximum(G.T)
A=(G>0).astype(float)
edge=np.where(m&((A@(~m).astype(float))>0))[0]
dist=dijkstra(G,directed=False,indices=edge,min_only=True,limit=D*1.5)
band=(dist<D)&(U[:,1]>YMIN)
# cotangent-free: uniform Laplacian is enough for a smooth bridge
Wg=G.copy();Wg.data=1.0/Wg.data   # inverse edge-length weights: stitch strips pack tiny edges; uniform weights keep their kink
L=sp.diags(1/np.asarray(Wg.sum(1)).ravel())@Wg
Lap=sp.identity(n,format='csr')-L;L2=(Lap@Lap).tocsr()
fi=np.where(band)[0];bo=np.where(~band)[0]
M=L2[fi][:,fi].tocsc();R=-(L2[fi][:,bo]@U[bo])
before=U[fi].copy()
for k in range(3): U[fi,k]=spsolve(M,R[:,k])
print('band verts',band.sum(),'max change (mm)',(np.linalg.norm(U[fi]-before,axis=1).max()*1000).round(1))
np.save('newW.npy',U[inv])
