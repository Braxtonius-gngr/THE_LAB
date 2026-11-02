import numpy as np, scipy.sparse as sp
P=np.fromfile('pos.bin',np.float32).reshape(-1,3).astype(float);I=np.fromfile('idx.bin',np.uint32).reshape(-1,3)
W=np.load('W.npy');vm=np.load('vmask.npy')
# weld UV-seam duplicates by position
key=np.round(W*1e5).astype(np.int64);_,uid,inv=np.unique(key,axis=0,return_index=True,return_inverse=True);inv=inv.ravel()
U=W[uid].copy();n=len(U);F=inv[I]
m=np.zeros(n,bool);np.logical_or.at(m,inv,vm)
e=np.vstack([F[:,[0,1]],F[:,[1,2]],F[:,[2,0]]]);A=sp.coo_matrix((np.ones(len(e)),(e[:,0],e[:,1])),shape=(n,n));A=((A+A.T)>0).astype(float).tocsr()
deg=np.asarray(A.sum(1)).ravel();Dinv=sp.diags(1/np.maximum(deg,1))
L=Dinv@A
# fill speckle holes: a vertex joins if most neighbours are briefs (and it's in the pelvis band)
for _ in range(6):
  frac=L@m.astype(float); m=m|((frac>0.5)&(U[:,1]>0.70)&(U[:,1]<1.0))
for _ in range(2):
  frac=L@m.astype(float); m=m&(frac>0.25)
print('briefs verts (welded)',m.sum(),'of',n)
def normals(V):
  a,b,c=V[F[:,0]],V[F[:,1]],V[F[:,2]];fn=np.cross(b-a,c-a);N=np.zeros_like(V)
  for k in range(3): np.add.at(N,F[:,k],fn)
  return N/np.maximum(np.linalg.norm(N,axis=1,keepdims=True),1e-12)
x,y,z=U.T
# 1) whole briefs area: pull in by fabric thickness + snug compression (~4 mm)
# taper the pull to zero at the fabric edge (ring distance inside the mask)
ringd=np.full(n,99.0);cur=m&((A@(~m).astype(float))>0);ringd[cur]=0;seen=cur.copy()
for r in range(1,8):
  nxt=m&((A@cur.astype(float))>0)&~seen;ringd[nxt]=r;seen|=nxt;cur=nxt
tap=np.clip(ringd/6,0,1);tap=tap*tap*(3-2*tap)
N=normals(U);U[m]-=N[m]*(0.004*tap[m])[:,None]
# 2) pouch zone: front-centre and crotch - relax to a membrane between belly and inner thighs
pouch=m&(((z>0.0)&(abs(x)<0.085)&(y>0.74)&(y<0.95))|((abs(x)<0.045)&(y>0.74)&(y<0.84)))
# thin-plate fill: solve L^2 U = 0 over the patch (+1 ring), two rings outside held -
# matches the surrounding skin's position and slope, so its curvature runs through
grow=pouch.copy()
for _ in range(8): grow=grow|((A@grow.astype(float))>0)
Lap=sp.identity(n,format='csr')-L
L2=(Lap@Lap).tocsr()
fi=np.where(grow)[0];bi=np.where(~grow)[0]
from scipy.sparse.linalg import spsolve
M=L2[fi][:,fi].tocsc();R=-(L2[fi][:,bi]@U[bi])
for k in range(3): U[fi,k]=spsolve(M,R[:,k])
# 3) soften the band ridges: light smoothing over the briefs area plus 3 rings around it
ring=m.copy()
for _ in range(3): ring=ring|((A@ring.astype(float))>0)
idx=np.where(ring)[0]
for it in range(25):
  U[idx]=0.7*U[idx]+0.3*(L@U)[idx]
# undo the shrink a plain Laplacian causes (Taubin step) on the same set
for it in range(25):
  U[idx]=U[idx]-0.32*((L@U)[idx]-U[idx])
  U[idx]=0.68*U[idx]+0.32*(L@U)[idx]
# 4) seam bands: wider, stronger relaxation where the fabric edge met skin
bnd=m&((A@(~m).astype(float))>0)
band=bnd.copy()
for _ in range(10): band=band|((A@band.astype(float))>0)
bi=np.where(band)[0]
for it in range(220):
  U[bi]=U[bi]-0.34*((L@U)[bi]-U[bi])
  U[bi]=0.68*U[bi]+0.32*(L@U)[bi]
# (this body's glutes were never covered: no cleft to restore)
print('moved max (cm)',np.linalg.norm(U-W[uid],axis=1).max()*100,'pouch verts',pouch.sum())
newW=U[inv]
np.save('newW.npy',newW);np.save('mask_w.npy',m[inv]);np.save('pouch_w.npy',pouch[inv])
