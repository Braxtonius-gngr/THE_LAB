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
  frac=L@m.astype(float); m=m|((frac>0.5)&(U[:,1]>0.62)&(U[:,1]<1.0))
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
pouch=m&(((z>0.0)&(abs(x)<0.08)&(y>0.73)&(y<0.94))|((abs(x)<0.045)&(y>0.73)&(y<0.83)))
# thin-plate fill: solve L^2 U = 0 over the patch (+1 ring), two rings outside held -
# matches the surrounding skin's position and slope, so its curvature runs through
grow=pouch.copy()
for _ in range(6): grow=grow|((A@grow.astype(float))>0)
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
# 5) gluteal cleft: the fabric bridged it - sink a narrow groove up the midline of the back
x,y,z=U.T
def smoothstep(a,b,t): t=np.clip((t-a)/(b-a),0,1); return t*t*(3-2*t)
prof=smoothstep(0.96,0.91,y)*smoothstep(0.72,0.75,y)
back=smoothstep(-0.012,-0.045,z)
dep=0.022*np.exp(-(x/0.017)**2)*prof*back
U[:,2]+=dep
# gluteal fold: a soft crease where each buttock meets the thigh
cm_=dep>1e-4
for _ in range(3): cm_=cm_|((A@cm_.astype(float))>0)
ci=np.where(cm_)[0]
for it in range(12):
  U[ci]=U[ci]-0.34*((L@U)[ci]-U[ci])
  U[ci]=0.68*U[ci]+0.32*(L@U)[ci]
# 6) relax the knob where the cleft meets the crotch gap
x,y,z=U.T
kn=m&(abs(x)<0.03)&(y>0.72)&(y<0.79)&(z<0.0)
ki=np.where(kn)[0]
for it in range(40): U[ki]=0.6*U[ki]+0.4*(L@U)[ki]
# --- from reshape-full: relax Meshy's dense stitch strips, then untangle folds at the seam ---
zone=m.copy()
for _ in range(10): zone=zone|((A@zone.astype(float))>0)
zi=np.where(zone)[0]
# 2b) the stitch strips: the waistband and hems are packed with dense, jittery
# micro-geometry (dozens of vertices in a few mm) - relax just those, hard
eL = np.linalg.norm(U[e[:, 0]] - U[e[:, 1]], axis=1)
acc = np.zeros(n); cntv = np.zeros(n); np.add.at(acc, e[:, 0], eL); np.add.at(cntv, e[:, 0], 1); np.add.at(acc, e[:, 1], eL); np.add.at(cntv, e[:, 1], 1)
avg = acc / np.maximum(cntv, 1)
dense = zone & (avg < np.median(avg[zone]) * 0.45)
for _ in range(2): dense = dense | (((A @ dense.astype(float)) > 0) & zone)
di = np.where(dense)[0]
for it in range(300): U[di] = 0.5 * U[di] + 0.5 * (L @ U)[di]
for it in range(40):
    U[zi] = U[zi] + 0.5 * ((L @ U)[zi] - U[zi]); U[zi] = U[zi] - 0.53 * ((L @ U)[zi] - U[zi])
print('stitch-strip verts relaxed', dense.sum())
# 5) untangle: triangles folded or turned steeply against the surface (the fabric's
# edge stitched to the skin) - relax their vertices until none remain
for rnd in range(8):
    a_, b_, c_ = U[F[:, 0]], U[F[:, 1]], U[F[:, 2]]; fn = np.cross(b_ - a_, c_ - a_)
    VN = np.zeros((n, 3))
    for k in range(3): np.add.at(VN, F[:, k], fn)
    for _ in range(8): VN = L @ VN
    VN /= np.maximum(np.linalg.norm(VN, axis=1, keepdims=True), 1e-12)
    d = ((fn / np.maximum(np.linalg.norm(fn, axis=1, keepdims=True), 1e-15)) * VN[F].mean(1)).sum(1)
    bad = zone[F].any(1) & (d < 0.5)
    if rnd == 0 or bad.sum() == 0: print('round', rnd, 'folded/steep', bad.sum())
    if bad.sum() == 0: break
    bv = np.zeros(n, bool); bv[F[bad].ravel()] = True
    for _ in range(1 + rnd // 2): bv = bv | ((A @ bv.astype(float)) > 0)
    vi = np.where(bv)[0]
    for it in range(120): U[vi] = 0.5 * U[vi] + 0.5 * (L @ U)[vi]
print('after untangle: folded/steep', int(bad.sum()))
# 6) the waistband lip: relax a band of rings either side of the garment's top edge
edge=(m&((A@(~m).astype(float))>0))|(~m&((A@m.astype(float))>0))
wb=edge&(U[:,1]>0.88)&(U[:,2]>0.02)
for _ in range(7): wb=wb|(((A@wb.astype(float))>0)&(U[:,1]>0.86)&(U[:,2]>0.0))
wi=np.where(wb)[0]
for it in range(60): U[wi]=0.6*U[wi]+0.4*(L@U)[wi]
for it in range(60):
  U[wi]=U[wi]+0.5*((L@U)[wi]-U[wi]); U[wi]=U[wi]-0.53*((L@U)[wi]-U[wi])
print('waistband band verts',wb.sum())
print('moved max (cm)',np.linalg.norm(U-W[uid],axis=1).max()*100,'pouch verts',pouch.sum())
newW=U[inv]
np.save('newW.npy',newW);np.save('mask_w.npy',m[inv]);np.save('pouch_w.npy',pouch[inv])
