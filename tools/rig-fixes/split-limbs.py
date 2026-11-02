import numpy as np,json,scipy.sparse as sp
from scipy.sparse.csgraph import dijkstra
J=np.fromfile('joints.bin',np.uint8).reshape(-1,4).copy();Wt=np.fromfile('wts.bin',np.float32).reshape(-1,4).copy()
names=json.load(open('jnames.json'));pos=json.load(open('jpos.json'));I=np.fromfile('idx.bin',np.uint32).reshape(-1,3);W=np.load('newW.npy')
grp=lambda pred: np.array([pred(n) for n in names])
C={'H':grp(lambda n:'ForeArm' in n or 'Hand' in n),
   'U':grp(lambda n:n in('LeftArm','RightArm','LeftShoulder','RightShoulder')),
   'L':grp(lambda n:'UpLeg' in n or n in('LeftLeg','RightLeg') or 'Foot' in n or 'Toe' in n)}
C['T']=~(C['H']|C['U']|C['L'])
sh={k:(Wt*m[J]).sum(1) for k,m in C.items()}
key=np.round(W*1e5).astype(np.int64);_,uid,inv=np.unique(key,axis=0,return_index=True,return_inverse=True);inv=inv.ravel();n=len(uid);U=W[uid]
F=inv[I];e=np.vstack([F[:,[0,1]],F[:,[1,2]],F[:,[2,0]]]);L=np.linalg.norm(U[e[:,0]]-U[e[:,1]],axis=1)
A=sp.coo_matrix((L,(e[:,0],e[:,1])),shape=(n,n)).tocsr();A=A.maximum(A.T)
hj=np.array([pos[x] for x in names if 'Hand' in x]);dH=np.min(np.linalg.norm(U[:,None]-hj[None],axis=2),1)
lj=np.array([pos[x] for x in names if 'UpLeg' in x or x in('LeftLeg','RightLeg')])
def segd(P,a,b):
  ab=b-a;t=np.clip(((P-a)@ab)/(ab@ab),0,1);return np.linalg.norm(P-(a+t[:,None]*ab),axis=1)
dLeg=np.minimum(segd(U,np.array(pos['LeftUpLeg']),np.array(pos['LeftLeg'])),segd(U,np.array(pos['RightUpLeg']),np.array(pos['RightLeg'])))
shw={k:v[uid] for k,v in sh.items()}
seeds={'H':np.where((shw['H']>0.9)&(dLeg>0.12))[0],'U':np.where((shw['U']>0.8)&(dH>0.15))[0],
       'T':np.where((shw['T']>0.8)&(dH>0.12))[0],'L':np.where((shw['L']>0.8)&(dH>0.12))[0]}
print({k:len(v) for k,v in seeds.items()})
allS=np.concatenate(list(seeds.values()));cls=np.concatenate([[i]*len(v) for i,v in enumerate(seeds.values())])
dist,pred,src=dijkstra(A,directed=False,indices=allS,min_only=True,return_predecessors=True)
lab=np.full(n,-1);ok=src>=0;pos_in=np.searchsorted(allS,src[ok]) if False else None
m={s:c for s,c in zip(allS,cls)};lab[ok]=np.array([m[s] for s in src[ok]])
names_c=list(seeds.keys());print({names_c[i]:(lab==i).sum() for i in range(4)},'unlabeled',(lab<0).sum())
lv=lab[inv];iH,iU,iT,iL=0,1,2,3
for v in range(len(J)):
  c=lv[v]
  if c==iH: Wt[v][C['L'][J[v]]|C['T'][J[v]]&np.isin(np.array(names)[J[v]],['Hips','Root','Spine02'])]=0
  elif c in (iT,iL): Wt[v][C['H'][J[v]]]=0
  if c==iL: pass
s=Wt.sum(1,keepdims=True);bad0=(s[:,0]<1e-6);Wt=np.where(s>0,Wt/np.maximum(s,1e-9),Wt)
print('vertices left with no weight',bad0.sum())
lt=lv[I];allowed={(iH,iH),(iU,iU),(iT,iT),(iL,iL),(iH,iU),(iU,iT),(iT,iL)}
def okpair(a,b): return (min(a,b),max(a,b)) in {(min(x),max(x)) for x in allowed}
cut=np.array([not(okpair(t[0],t[1]) and okpair(t[1],t[2]) and okpair(t[0],t[2])) for t in lt])
print('triangles cut at contact',cut.sum())
np.save('J_new.npy',J);np.save('W_new.npy',Wt);np.save('keep_tris.npy',~cut)
