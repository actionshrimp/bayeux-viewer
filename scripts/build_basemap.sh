#!/usr/bin/env bash
# Builds data/basemap.topo.json (land, rivers, lakes) for NW Europe from Natural Earth 10m.
# Usage: scripts/build_basemap.sh [raw_download_dir]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RAW="${1:-${TMPDIR:-/tmp}/bayeux-basemap-raw}"
OUT="$ROOT/data/basemap.topo.json"
BBOX="-12,42,16,64"
NE="https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson"
mkdir -p "$RAW"
for f in ne_10m_land ne_10m_rivers_lake_centerlines ne_10m_rivers_europe ne_10m_lakes ne_10m_lakes_europe; do
  [ -s "$RAW/$f.geojson" ] || curl -sSfL -o "$RAW/$f.geojson" "$NE/$f.geojson"
done
MS="npx -y mapshaper@0.6"
# Land: clip, simplify lightly (keep detail at ~1:500k), drop attributes
$MS -i "$RAW/ne_10m_land.geojson" -clip bbox=$BBOX -explode \
    -simplify weighted 0.7 keep-shapes -filter-slivers min-area=0.5km2 \
    -filter-fields '' -rename-layers land \
    -o "$RAW/land.json" format=geojson force
# Rivers: global centerlines + Europe supplement, keep name
$MS -i "$RAW/ne_10m_rivers_lake_centerlines.geojson" "$RAW/ne_10m_rivers_europe.geojson" combine-files \
    -merge-layers force -clip bbox=$BBOX \
    -filter-fields name -simplify 0.8 -rename-layers rivers \
    -o "$RAW/rivers.json" format=geojson force
# Lakes
$MS -i "$RAW/ne_10m_lakes.geojson" "$RAW/ne_10m_lakes_europe.geojson" combine-files \
    -merge-layers force -clip bbox=$BBOX \
    -filter-fields name -simplify 0.8 keep-shapes -rename-layers lakes \
    -o "$RAW/lakes.json" format=geojson force
# Combine into one TopoJSON
$MS -i "$RAW/land.json" "$RAW/rivers.json" "$RAW/lakes.json" combine-files \
    -o "$OUT" format=topojson quantization=100000 force
ls -l "$OUT"
