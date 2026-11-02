#!/bin/bash
# Reweight the shoulders of every body, both tiers:  ./shoulder-all.sh [band_m]
# Writes to .work/skin/<id>-<tier>/<tier>_rw.glb; copy into assets/bodies when verified.
set -e; cd "$(dirname "$0")"; BAND=${1:-0.07}
for id in adult-base-01 tommy adult-base-02 cole dante tariq rodin; do for tier in desktop mobile; do
  d=../../.work/skin/$id-$tier; mkdir -p $d
  node skindump.mjs ../../assets/bodies/$id/$tier.glb $d 2>&1 | grep -v -i warn | sed "s/^/$id-$tier: /"
  python3 shoulder.py $d $BAND | tail -2 | head -1 | sed "s/^/  /"
  node skinwrite.mjs ../../assets/bodies/$id/$tier.glb $d $d/${tier}_rw.glb 2>&1 | grep -v -i warn >/dev/null
done; done
