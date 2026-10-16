#!/usr/bin/env python3
"""Merge annotate/out/batch-*.json into src/data/figures.json.

Drops boxes for unknown ids, normalises coordinates, and removes duplicates from the
overlapping crops (same id, intersection-over-union > 0.4).
"""
import glob, json, os
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ids = {c["id"] for c in json.load(open(os.path.join(ROOT, "src/data/characters.json")))}
boxes = []
for f in sorted(glob.glob(os.path.join(HERE, "out", "batch-*.json"))):
    boxes += json.load(open(f))
def iou(a, b):
    ix = max(0, min(a["x1"], b["x1"]) - max(a["x0"], b["x0"]))
    iy = max(0, min(a["y1"], b["y1"]) - max(a["y0"], b["y0"]))
    inter = ix * iy
    area = lambda r: (r["x1"] - r["x0"]) * (r["y1"] - r["y0"])
    return inter / (area(a) + area(b) - inter or 1)
out, dropped = [], 0
for b in boxes:
    if b["id"] not in ids:
        print("unknown id", b["id"]); continue
    b["x0"], b["x1"] = sorted((round(b["x0"]), round(b["x1"])))
    b["y0"], b["y1"] = sorted((round(b["y0"]), round(b["y1"])))
    if any(o["id"] == b["id"] and iou(o, b) > 0.4 for o in out):
        dropped += 1; continue
    out.append(b)
out.sort(key=lambda b: b["x0"])
json.dump(out, open(os.path.join(ROOT, "src/data/figures.json"), "w"), indent=1, ensure_ascii=False)
print(len(out), "figures,", dropped, "duplicates dropped")
