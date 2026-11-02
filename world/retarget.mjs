// Retarget an animation clip from one skeleton to another by bone name.
//
// Each bone's rotation is taken as a change from its rest pose, expressed in
// the body's own axes (so it doesn't matter how a rig orients its bones -
// Mixamo and MeshyRig differ), and applied to the target bone from the
// target's rest pose. The hips' travel is carried over in body axes, scaled
// by the ratio of hip heights.
//
// Both skeletons must be captured at rest (captureRest) before anything
// poses them. Bone names must already match (the lab's canonical names:
// Hips, Spine02, Spine01, Spine, neck, Head, Left/RightShoulder, Arm,
// ForeArm, Hand, UpLeg, Leg, Foot, ToeBase).
import * as THREE from '../assets/vendor/three/three.module.js';

const _q = new THREE.Quaternion(), _d = new THREE.Quaternion(), _v = new THREE.Vector3();

// remember every bone's rest: its local rotation and position, and its
// parent's world rotation and world linear transform (for the hips' travel)
// (allNodes: an animation-only file has no skin, so its joints are plain nodes)
export function captureRest(root, { allNodes = false } = {}) {
  root.updateMatrixWorld(true);
  const bones = {};
  root.traverse(o => {
    if (!(o.isBone || (allNodes && o.name && o.parent))) return;
    const pw = o.parent.getWorldQuaternion(new THREE.Quaternion());
    const pm = new THREE.Matrix3().setFromMatrix4(o.parent.matrixWorld);
    bones[o.name] = {
      bone: o, q: o.quaternion.clone(), p: o.position.clone(),
      pw, pwi: pw.clone().invert(), pm, pmi: pm.clone().invert(),
      worldY: o.getWorldPosition(new THREE.Vector3()).y
    };
  });
  return bones;
}

export function retargetClip(clip, src, dst, { hips = 'Hips', inPlace = false } = {}) {
  const tracks = [];
  const scale = src[hips] && dst[hips] ? dst[hips].worldY / src[hips].worldY : 1;
  for (const tr of clip.tracks) {
    const dot = tr.name.lastIndexOf('.'), name = tr.name.slice(0, dot), prop = tr.name.slice(dot + 1);
    const s = src[name], d = dst[name];
    if (!s || !d) continue;
    if (prop === 'quaternion') {
      const out = new Float32Array(tr.values.length), sqi = s.q.clone().invert();
      for (let i = 0; i < tr.values.length; i += 4) {
        _q.fromArray(tr.values, i);
        // the change from rest, in body axes: D = PWs * q * qRest^-1 * PWs^-1
        _d.copy(s.pw).multiply(_q).multiply(sqi).multiply(s.pwi);
        // onto the target: L = PWd^-1 * D * PWd * qRestTarget
        _q.copy(d.pwi).multiply(_d).multiply(d.pw).multiply(d.q);
        _q.toArray(out, i);
      }
      tracks.push(new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, tr.times, out));
    } else if (prop === 'position' && name === hips) {
      const out = new Float32Array(tr.values.length);
      for (let i = 0; i < tr.values.length; i += 3) {
        // the travel from rest, in body axes, scaled to the target's size
        _v.fromArray(tr.values, i).sub(s.p).applyMatrix3(s.pm).multiplyScalar(scale);
        if (inPlace) { _v.x = 0; _v.z = 0; }
        _v.applyMatrix3(d.pmi).add(d.p);
        _v.toArray(out, i);
      }
      tracks.push(new THREE.VectorKeyframeTrack(`${name}.position`, tr.times, out));
    }
  }
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

// a clip's display name: "_360_Power_Spin_Jump" -> "360 Power Spin Jump"
export const clipLabel = n => n.replace(/^_+/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
