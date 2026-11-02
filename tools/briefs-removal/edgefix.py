# Soften the garment's edge line baked into the maps just outside the repaint:
# over rings 0..R outside the edge, blend the normal map (and a little of the
# colour) toward a blurred copy, so the line's fine detail goes and the broad
# shape stays. Mesh-space weights, rasterized through the UVs.
import numpy as np, cv2, scipy.sparse as sp, sys
R = int(sys.argv[1]) if len(sys.argv) > 1 else 8
UV=np.fromfile('uv.bin',np.float32).reshape(-1,2);W=np.load('newW.npy');fv=np.load('mask_w.npy');I=np.fromfile('idx.bin',np.uint32).reshape(-1,3)
key=np.round(W*1e5).astype(np.int64);_,uid,inv=np.unique(key,axis=0,return_index=True,return_inverse=True);inv=inv.ravel();n=len(uid)
F=inv[I];e=np.vstack([F[:,[0,1]],F[:,[1,2]],F[:,[2,0]]]);A=sp.coo_matrix((np.ones(len(e)),(e[:,0],e[:,1])),shape=(n,n)).tocsr();A=((A+A.T)>0).astype(float)
m=np.zeros(n,bool);np.logical_or.at(m,inv,fv)
ring=np.full(n,99);cur=m&((A@(~m).astype(float))>0);ring[cur]=0;seen=cur.copy()
for r in range(1,R+1):
  nx=((A@cur.astype(float))>0)&~seen;ring[nx]=r;seen|=nx;cur=nx
wv=np.clip(1-(ring-R*0.5)/(R*0.5),0,1);wv[m]=0;wv=wv*wv*(3-2*wv);wv=wv[inv]
h=w=4096;Wt=np.zeros((h,w),np.float32)
for t in np.where((wv[I]>0).any(1))[0]:
  ia,ib,ic=I[t];pa=UV[ia]*w;pb=UV[ib]*w;pc=UV[ic]*w
  x0,y0=np.floor(np.minimum(np.minimum(pa,pb),pc)).astype(int)-1;x1,y1=np.ceil(np.maximum(np.maximum(pa,pb),pc)).astype(int)+1
  x0,y0=max(x0,0),max(y0,0);x1,y1=min(x1,w-1),min(y1,h-1)
  X,Y=np.meshgrid(np.arange(x0,x1+1)+0.5,np.arange(y0,y1+1)+0.5)
  d=(pb[1]-pc[1])*(pa[0]-pc[0])+(pc[0]-pb[0])*(pa[1]-pc[1])
  if abs(d)<1e-9: continue
  l1=((pb[1]-pc[1])*(X-pc[0])+(pc[0]-pb[0])*(Y-pc[1]))/d;l2=((pc[1]-pa[1])*(X-pc[0])+(pa[0]-pc[0])*(Y-pc[1]))/d;l3=1-l1-l2
  ins=(l1>=-0.05)&(l2>=-0.05)&(l3>=-0.05)
  if ins.any(): ys,xs=np.where(ins);Wt[y0+ys,x0+xs]=np.maximum(Wt[y0+ys,x0+xs],(l1*wv[ia]+l2*wv[ib]+l3*wv[ic])[ins])
Wt=Wt[...,None]
nrm=cv2.imread('normal_new.png').astype(np.float32);col=cv2.imread('base_new.png').astype(np.float32)
nb=cv2.GaussianBlur(nrm,(0,0),10);cb=cv2.GaussianBlur(col,(0,0),5)
cv2.imwrite('normal_new.png',np.clip(nrm*(1-Wt)+nb*Wt,0,255).astype(np.uint8))
cv2.imwrite('base_new.png',np.clip(col*(1-0.6*Wt)+cb*0.6*Wt,0,255).astype(np.uint8))
print('edge band px',int((Wt>0.01).sum()))
