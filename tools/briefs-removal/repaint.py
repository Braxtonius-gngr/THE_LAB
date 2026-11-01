import numpy as np, scipy.sparse as sp, cv2
from scipy import ndimage
UV=np.fromfile('uv.bin',np.float32).reshape(-1,2);I=np.fromfile('idx.bin',np.uint32).reshape(-1,3)
W=np.load('W.npy');vm=np.load('mask_w.npy')
img=cv2.cvtColor(cv2.imread('base.png'),cv2.COLOR_BGR2RGB).astype(np.float32)
nrm=cv2.cvtColor(cv2.imread('normal.png'),cv2.COLOR_BGR2RGB).astype(np.float32)
h,w,_=img.shape
u=np.clip((UV[:,0]%1)*w,0,w-1).astype(int);v=np.clip((UV[:,1]%1)*h,0,h-1).astype(int)
blur=cv2.GaussianBlur(img,(0,0),6)
col=blur[v,u]
# welded graph
key=np.round(W*1e5).astype(np.int64);_,uid,inv=np.unique(key,axis=0,return_index=True,return_inverse=True);inv=inv.ravel();n=len(uid);F=inv[I]
e=np.vstack([F[:,[0,1]],F[:,[1,2]],F[:,[2,0]]]);A=sp.coo_matrix((np.ones(len(e)),(e[:,0],e[:,1])),shape=(n,n));A=((A+A.T)>0).astype(float).tocsr()
L=sp.diags(1/np.maximum(np.asarray(A.sum(1)).ravel(),1))@A
m=np.zeros(n,bool);np.logical_or.at(m,inv,vm)
# grow the fill set 2 rings so the fabric's edge pixels get replaced too
for _ in range(2): m=m|((A@m.astype(float))>0)
C=np.zeros((n,3));cnt=np.zeros(n);np.add.at(C,inv,col);np.add.at(cnt,inv,1);C/=cnt[:,None]
fi=np.where(m)[0]
C[fi]=C[~m].mean(0)
for it in range(3000): C[fi]=(L@C)[fi]
vc=C[inv]
print('fill verts',m.sum(),'mean fill colour',C[fi].mean(0).round())
# rasterize per-vertex fill colour over every triangle touching the fill set
tri=np.where(m[F].any(1))[0]
fill=np.zeros_like(img);cov=np.zeros((h,w),np.uint8)
for t in tri:
  ia,ib,ic=I[t];pa=np.array([UV[ia,0]%1*w,UV[ia,1]%1*h]);pb=np.array([UV[ib,0]%1*w,UV[ib,1]%1*h]);pc=np.array([UV[ic,0]%1*w,UV[ic,1]%1*h])
  x0,y0=np.floor(np.minimum(np.minimum(pa,pb),pc)).astype(int)-1;x1,y1=np.ceil(np.maximum(np.maximum(pa,pb),pc)).astype(int)+1
  x0,y0=max(x0,0),max(y0,0);x1,y1=min(x1,w-1),min(y1,h-1)
  if x1<=x0 or y1<=y0 or (x1-x0)*(y1-y0)>2000000: continue
  X,Y=np.meshgrid(np.arange(x0,x1+1)+0.5,np.arange(y0,y1+1)+0.5)
  d=(pb[1]-pc[1])*(pa[0]-pc[0])+(pc[0]-pb[0])*(pa[1]-pc[1])
  if abs(d)<1e-9: continue
  l1=((pb[1]-pc[1])*(X-pc[0])+(pc[0]-pb[0])*(Y-pc[1]))/d;l2=((pc[1]-pa[1])*(X-pc[0])+(pa[0]-pc[0])*(Y-pc[1]))/d;l3=1-l1-l2
  ins=(l1>=-0.02)&(l2>=-0.02)&(l3>=-0.02)
  if not ins.any(): continue
  c=l1[...,None]*vc[ia]+l2[...,None]*vc[ib]+l3[...,None]*vc[ic]
  ys,xs=np.where(ins);fill[y0+ys,x0+xs]=c[ins];cov[y0+ys,x0+xs]=1
# skin detail: high-pass from a thigh patch, tiled
thigh=(W[:,1]>0.5)&(W[:,1]<0.62)&(W[:,2]>0.02)
tu,tv=u[thigh],v[thigh];S=256
ss=img.max(2)-img.min(2);sk=((img.max(2)>90)&(ss>25)).astype(np.float32)
full=cv2.boxFilter(sk,-1,(S+16,S+16),normalize=True)>0.999
cand=np.zeros_like(full);cand[tv,tu]=True;cand=ndimage.binary_dilation(cand,iterations=60)&full
ys,xs=np.where(cand)
if len(ys)==0: ys,xs=np.where(full)
k=np.argmin((xs-np.median(tu))**2+(ys-np.median(tv))**2);cx,cy=int(xs[k]),int(ys[k])
print('detail patch at',cx,cy)
patch=img[cy-S//2:cy+S//2,cx-S//2:cx+S//2];hp=patch-cv2.GaussianBlur(patch,(0,0),4)
npatch=nrm[cy-S//2:cy+S//2,cx-S//2:cx+S//2];nhp=npatch-cv2.GaussianBlur(npatch,(0,0),8)
# mirror-tile so the repeat has no hard seam
def tile(p):
  t=np.concatenate([p,p[:,::-1]],1);t=np.concatenate([t,t[::-1]],0)
  return np.tile(t,(h//t.shape[0]+1,w//t.shape[1]+1,1))[:h,:w]
fill=fill+tile(hp)*0.5
cov=cov.astype(bool)
# island gutters: fabric-grey pixels the triangles don't reach - extend the nearest fill into them
T=np.load('tmask.npy')
gut=ndimage.binary_dilation(T,iterations=4)&~cov
near=ndimage.binary_dilation(cov,iterations=24)
gut&=near
_,(iy,ix)=ndimage.distance_transform_edt(~cov,return_indices=True)
fill[gut]=fill[iy[gut],ix[gut]]
cov=cov|gut
# pixels owned by triangles outside the fill set
other=np.zeros((h,w),np.uint8)
ot=np.where(~m[F].any(1))[0]
pts=np.stack([UV[I[ot]][...,0]%1*w,UV[I[ot]][...,1]%1*h],-1)
for p in np.round(pts*16).astype(np.int32): cv2.fillPoly(other,[p],1,shift=4)
other=other.astype(bool)&~cov
region=ndimage.binary_dilation(cov,iterations=40)&~other
_,(iy,ix)=ndimage.distance_transform_edt(~cov,return_indices=True)
ext=region&~cov;fill[ext]=fill[iy[ext],ix[ext]]
alpha=cv2.GaussianBlur(region.astype(np.float32),(0,0),1.2)[...,None]
alpha=np.maximum(alpha,cov[...,None].astype(np.float32))
# carry the repaint 12 px over the neighbouring skin (the hem's shadow line lives there), fading out
dist,(jy,jx)=ndimage.distance_transform_edt(~cov,return_indices=True)
band=other&(dist<=12)
fill[band]=fill[jy[band],jx[band]]-tile(hp)[jy[band],jx[band]]*0.5+tile(hp)[band]*0.5
ramp=np.clip(1-(dist-3)/9,0,1)
alpha[band,0]=np.maximum(alpha[band,0],ramp[band])
out=img*(1-alpha)+np.clip(fill,0,255)*alpha
# normal map: flatten fabric wrinkles to skin (flat + pore detail)
flat=np.zeros_like(nrm);flat[...]=(128,128,255)
nout=nrm*(1-alpha)+flat*alpha
cv2.imwrite('base_new.png',cv2.cvtColor(out.astype(np.uint8),cv2.COLOR_RGB2BGR))
cv2.imwrite('normal_new.png',cv2.cvtColor(nout.astype(np.uint8),cv2.COLOR_RGB2BGR))
print('pixels replaced',int(cov.sum()))
# preview crop of the atlas region
ys,xs=np.where(cov);y0,y1,x0,x1=ys.min(),ys.max(),xs.min(),xs.max()
prev=np.concatenate([img[y0:y1,x0:x1],out[y0:y1,x0:x1]],1)
sc=900/prev.shape[1];cv2.imwrite('/tmp/claude-0/repaint.png',cv2.resize(cv2.cvtColor(prev.astype(np.uint8),cv2.COLOR_RGB2BGR),None,fx=sc,fy=sc))
