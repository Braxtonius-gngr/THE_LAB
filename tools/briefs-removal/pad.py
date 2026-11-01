import numpy as np, cv2
from scipy import ndimage
UV=np.fromfile('uv.bin',np.float32).reshape(-1,2);I=np.fromfile('idx.bin',np.uint32).reshape(-1,3)
h=w=4096
cov=np.zeros((h,w),np.uint8)
pts=np.stack([UV[I][...,0]*w,UV[I][...,1]*h],-1)
for p in np.round(pts*16).astype(np.int32): cv2.fillPoly(cov,[p],1,shift=4)
cov=ndimage.binary_erosion(cov.astype(bool),iterations=1)   # keep only texels well inside a triangle
_,(iy,ix)=ndimage.distance_transform_edt(~cov,return_indices=True)
for f in ['base_new.png','normal_new.png']:
  a=cv2.imread(f);a[~cov]=a[iy[~cov],ix[~cov]];cv2.imwrite(f,a)
print('covered share',cov.mean().round(3))
