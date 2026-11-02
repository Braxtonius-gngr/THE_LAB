# Tone-match the band around the old waistband/leg openings: a smooth
# multiplicative gain over rings -5..+8 from the repaint's edge, so the low
# frequency colour runs as a harmonic blend from the repaint's interior to the
# original skin a few cm out. Detail (hair, pores) is kept; only tone moves.
import numpy as np, cv2, scipy.sparse as sp, sys
SRC, OUT = sys.argv[1], sys.argv[2]
UV=np.fromfile('uv.bin',np.float32).reshape(-1,2);W=np.load('newW.npy');fv=np.load('mask_w.npy');I=np.fromfile('idx.bin',np.uint32).reshape(-1,3)
img=cv2.cvtColor(cv2.imread(SRC),cv2.COLOR_BGR2RGB).astype(np.float32);h,w,_=img.shape
lo=cv2.GaussianBlur(img,(0,0),8)
u=np.clip(UV[:,0]*w,0,w-1).astype(int);v=np.clip(UV[:,1]*h,0,h-1).astype(int)
key=np.round(W*1e5).astype(np.int64);_,uid,inv=np.unique(key,axis=0,return_index=True,return_inverse=True);inv=inv.ravel();n=len(uid)
F=inv[I];e=np.vstack([F[:,[0,1]],F[:,[1,2]],F[:,[2,0]]]);A=sp.coo_matrix((np.ones(len(e)),(e[:,0],e[:,1])),shape=(n,n)).tocsr();A=((A+A.T)>0).astype(float)
L=sp.diags(1/np.maximum(np.asarray(A.sum(1)).ravel(),1))@A
m=np.zeros(n,bool);np.logical_or.at(m,inv,fv)
ring=np.full(n,99);cur=m&((A@(~m).astype(float))>0);ring[cur]=0;seen=cur.copy()
for r in range(1,14):
  nx=((A@cur.astype(float))>0)&~seen;ring[nx]=r;seen|=nx;cur=nx
inside=np.full(n,99);cur=m&((A@(~m).astype(float))>0);inside[cur]=0;seen=cur.copy()
for r in range(1,8):
  nx=((A@cur.astype(float))>0)&m&~seen;inside[nx]=r;seen|=nx;cur=nx
free=(m&(inside<=5))|(~m&(ring<=8))
C=np.zeros((n,3));cnt=np.zeros(n);np.add.at(C,inv,lo[v,u]);np.add.at(cnt,inv,1);C/=cnt[:,None]
T=C.copy();fi=np.where(free)[0]
for it in range(2500): T[fi]=(L@T)[fi]
g=np.clip(T/np.maximum(C,1),0.85,1.18)
for it in range(10): g[fi]=0.5*g[fi]+0.5*(L@g)[fi]
print('band verts',free.sum(),'gain range',g[fi].min(0).round(3),g[fi].max(0).round(3))
gv=g[inv]
gain=np.ones((h,w,3),np.float32)
tri=np.where(free[F].any(1))[0]
for t in tri:
  ia,ib,ic=I[t];pa=UV[ia]*[w,h];pb=UV[ib]*[w,h];pc=UV[ic]*[w,h]
  x0,y0=np.floor(np.minimum(np.minimum(pa,pb),pc)).astype(int)-1;x1,y1=np.ceil(np.maximum(np.maximum(pa,pb),pc)).astype(int)+1
  x0,y0=max(x0,0),max(y0,0);x1,y1=min(x1,w-1),min(y1,h-1)
  X,Y=np.meshgrid(np.arange(x0,x1+1)+0.5,np.arange(y0,y1+1)+0.5)
  d=(pb[1]-pc[1])*(pa[0]-pc[0])+(pc[0]-pb[0])*(pa[1]-pc[1])
  if abs(d)<1e-9: continue
  l1=((pb[1]-pc[1])*(X-pc[0])+(pc[0]-pb[0])*(Y-pc[1]))/d;l2=((pc[1]-pa[1])*(X-pc[0])+(pa[0]-pc[0])*(Y-pc[1]))/d;l3=1-l1-l2
  ins=(l1>=-0.05)&(l2>=-0.05)&(l3>=-0.05)
  if not ins.any(): continue
  gg=l1[...,None]*gv[ia]+l2[...,None]*gv[ib]+l3[...,None]*gv[ic]
  ys,xs=np.where(ins);gain[y0+ys,x0+xs]=gg[ins]
out=np.clip(img*gain,0,255)
cv2.imwrite(OUT,cv2.cvtColor(out.astype(np.uint8),cv2.COLOR_RGB2BGR))
np.save('band_w.npy',(~m&(ring>=1)&(ring<=6))[inv])     # the smooth strip outside, for the hair pass
