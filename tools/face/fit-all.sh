#!/usr/bin/env sh
# Fit FaceKit onto every body, desktop and mobile. Writes <tier>.face.glb beside each body (never overwrites the original).
# Usage: tools/face/fit-all.sh [blender-binary]   (default: `blender` on PATH; or set BLENDER=/path/to/blender)
set -e
cd "$(dirname "$0")/../.."
B="${1:-${BLENDER:-blender}}"
for d in assets/bodies/*/; do
  n="$(basename "$d")"
  for t in desktop mobile; do
    [ -f "$d$t.glb" ] || continue
    echo "== $n/$t"
    "$B" -b -P tools/face/fit-facekit.py -- --body "$d$t.glb" --preview
  done
done
