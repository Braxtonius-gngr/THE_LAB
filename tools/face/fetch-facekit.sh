#!/usr/bin/env sh
# Pulls ICT FaceKit's 53 expression OBJs (not committed: ~140 MB) into third_party/ict-facekit/FaceXModel.
# The neutral mesh, vertex_indices.json, Blender script and LICENSE are already in the repo.
set -e
cd "$(dirname "$0")/../.."
TMP="$(mktemp -d)"
git clone --depth 1 --filter=blob:none --sparse https://github.com/ICT-VGL/ICT-FaceKit.git "$TMP/fk"
git -C "$TMP/fk" checkout -q da5f95a607f5e6b37755b38d3385d7f2853732e5 2>/dev/null || true
git -C "$TMP/fk" sparse-checkout set --no-cone '/FaceXModel/*' '!/FaceXModel/identity*'
cp "$TMP/fk"/FaceXModel/*.obj "$TMP/fk"/FaceXModel/*.mtl third_party/ict-facekit/FaceXModel/
rm -rf "$TMP"
ls third_party/ict-facekit/FaceXModel/*.obj | wc -l | xargs echo "FaceXModel OBJs in place:"
