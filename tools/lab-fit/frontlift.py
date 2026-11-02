# Lift the repaint's brightness on the front so it follows the body's own
# belly-to-thigh gradient. A mesh-space harmonic fill takes its tone from the
# whole boundary, and on bodies with baked side shadows that pulls the front
# too dark (a "tan line"). Gain per front vertex = target/current low-freq V,
# target = linear in y between the skin just above the top edge and the skin
# below the bottom edge (front only), faded out toward the sides; rasterized
# through the UVs like tone.py.  Usage: frontlift.py in.png out.png [maxGain]
import numpy as np, cv2, scipy.sparse as sp, sys
SRC, OUT = sys.argv[1], sys.argv[2]; GMAX = float(sys.argv[3]) if len(sys.argv) > 3 else 1.25
UV=np.fromfile('uv.bin',np.float32).reshape(-1,2);W=np.load('newW.npy');fv=np.load('mask_w.npy');I=np.fromfile('idx.bin',np.uint32).reshape(-1,3)
img=cv2.cvtColor(cv2.imread(SRC),cv2.COLOR_BGR2RGB).astype(np.float32);h,w,_=img.shape;lo=cv2.GaussianBlur(img,(0,0),8)
u=np.clip(UV[:,0]*w,0,w-1).astype(int);v=np.clip(UV[:,1]*h,0,h-1).astype(int);V=lo[v,u].mean(1)
x,y,z=W.T;front=z>0.02
fy=y[fv&front];top,bot=fy.max(),fy.min()
vt=np.median(V[~fv&front&(y>top)&(y<top+0.03)&(np.abs(x)<0.08)]);vb=np.median(V[~fv&front&(y<bot)&(y>bot-0.04)&(np.abs(x)<0.12)])
print('front skin V above %.0f below %.0f, repaint front median %.0f'%(vt,vb,np.median(V[fv&front])))
t=np.clip((y-bot)/max(top-bot,1e-6),0,1);target=vb+(vt-vb)*t
g=np.ones(len(W));sel=fv&front
g[sel]=np.clip(target[sel]/np.maximum(V[sel],1),1/GMAX,GMAX)
side=np.clip(z/0.06,0,1);g=1+(g-1)*side          # fade to no change toward the sides
# smooth the gain over the mesh
key=np.round(np.load('W.npy')*1e5).astype(np.int64);_,uid,inv=np.unique(key,axis=0,return_index=True,return_inverse=True);inv=inv.ravel();n=len(uid)
F=inv[I];e=np.vstack([F[:,[0,1]],F[:,[1,2]],F[:,[2,0]]]);A=sp.coo_matrix((np.ones(len(e)),(e[:,0],e[:,1])),shape=(n,n)).tocsr();A=((A+A.T)>0).astype(float)
L=sp.diags(1/np.maximum(np.asarray(A.sum(1)).ravel(),1))@A
G=np.zeros(n);c=np.zeros(n);np.add.at(G,inv,g);np.add.at(c,inv,1);G/=np.maximum(c,1)
for it in range(25): G=0.5*G+0.5*(L@G)
gv=G[inv]
gain=np.ones((h,w),np.float32)
for tI in np.where((np.abs(gv[I]-1)>1e-3).any(1))[0]:
  ia,ib,ic=I[tI];pa=UV[ia]*[w,h];pb=UV[ib]*[w,h];pc=UV[ic]*[w,h]
  x0,y0=np.floor(np.minimum(np.minimum(pa,pb),pc)).astype(int)-1;x1,y1=np.ceil(np.maximum(np.maximum(pa,pb),pc)).astype(int)+1
  x0,y0=max(x0,0),max(y0,0);x1,y1=min(x1,w-1),min(y1,h-1)
  X,Y=np.meshgrid(np.arange(x0,x1+1)+0.5,np.arange(y0,y1+1)+0.5)
  d=(pb[1]-pc[1])*(pa[0]-pc[0])+(pc[0]-pb[0])*(pa[1]-pc[1])
  if abs(d)<1e-9: continue
  l1=((pb[1]-pc[1])*(X-pc[0])+(pc[0]-pb[0])*(Y-pc[1]))/d;l2=((pc[1]-pa[1])*(X-pc[0])+(pa[0]-pc[0])*(Y-pc[1]))/d;l3=1-l1-l2
  ins=(l1>=-0.05)&(l2>=-0.05)&(l3>=-0.05)
  if ins.any(): ys,xs=np.where(ins);gain[y0+ys,x0+xs]=(l1*gv[ia]+l2*gv[ib]+l3*gv[ic])[ins]
cv2.imwrite(OUT,cv2.cvtColor(np.clip(img*gain[...,None],0,255).astype(np.uint8),cv2.COLOR_RGB2BGR))
print('gain range %.2f-%.2f'%(gain.min(),gain.max()))
