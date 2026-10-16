#!/usr/bin/env python3
"""Merge the horse pass (annotate/hout/batch-*.json) into src/data/horses.json.

Dedupes horses recorded twice in overlapping crops (box IoU > 0.3, or the same
genital point within 12 units), reports totals against Garnett's 88, and checks
the three named horses already in penises.json are found.
"""
import glob, json, os
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

def iou(a, b):
    ix = max(0, min(a["x1"], b["x1"]) - max(a["x0"], b["x0"]))
    iy = max(0, min(a["y1"], b["y1"]) - max(a["y0"], b["y0"]))
    inter = ix * iy
    ar = lambda r: max(1, (r["x1"] - r["x0"]) * (r["y1"] - r["y0"]))
    return inter / (ar(a) + ar(b) - inter)

RANK = {"yes": 2, "unclear": 1, "no": 0}
horses = []
# Scene for a strip x: scene n is centred on marker n (see story.ts).
_m = {int(k): v for k, v in json.load(open(os.path.join(HERE, "crops", "index.json")))["markers"].items()}
def scene_at(x):
    return min(range(1, 59), key=lambda n: abs(_m[n] - x))

# Main-frieze batches first, then the border pass.
files = sorted(glob.glob(os.path.join(HERE, "hout", "batch-*.json"))) + sorted(glob.glob(os.path.join(HERE, "hout", "border-*.json")))
for f in files:
    for h in json.load(open(f)):
        h["x0"], h["x1"] = sorted((h["x0"], h["x1"]))
        h["y0"], h["y1"] = sorted((h["y0"], h["y1"]))
        h["batch"] = os.path.basename(f)
        if not h.get("scene"):
            h["scene"] = scene_at((h["x0"] + h["x1"]) / 2)
        # Heads over ship hulls / bodies hidden behind other horses: can't be judged, so no marker.
        note = (h.get("note") or "").lower()
        if h["stallion"] == "unclear" and ((h["y1"] - h["y0"]) < 70 or "head" in note or "ship" in note) and h.get("where") is None:
            h.pop("gx", None); h.pop("gy", None)
        dup = next((o for o in horses if iou(o, h) > 0.3 or (
            "gx" in o and "gx" in h and abs(o["gx"] - h["gx"]) < 12 and abs(o["gy"] - h["gy"]) < 12)), None)
        if dup:
            # Keep the more confident call.
            if RANK[h["stallion"]] > RANK[dup["stallion"]]:
                horses[horses.index(dup)] = h
            continue
        horses.append(h)
# Keep anything already reviewed by hand in the review tool.
out = os.path.join(ROOT, "src/data/horses.json")
if os.path.exists(out):
    reviewed = [h for h in json.load(open(out)) if h.get("reviewed")]
    for r in reviewed:
        match = next((h for h in horses if iou(h, r) > 0.5), None)
        if match: horses[horses.index(match)] = r
        else: horses.append(r)
    if reviewed: print(f"kept {len(reviewed)} reviewed horses")
horses.sort(key=lambda h: h["x0"])
for i, h in enumerate(horses):
    h["id"] = f"h{i:03d}"
count = {k: sum(h["stallion"] == k for h in horses) for k in ("yes", "unclear", "no")}
print(f"{len(horses)} horses: {count}  (Garnett: 88 with genitals)")
named = json.load(open(os.path.join(ROOT, "src/data/penises.json")))["entries"]
for e in named:
    if e["kind"] != "horse" or "x" not in e: continue
    near = [h for h in horses if "gx" in h and abs(h["gx"] - e["x"]) < 30 and abs(h["gy"] - e["y"]) < 30]
    print(f"  named scene {e['scene']} horse at {e['x']},{e['y']}: " + (", ".join(f"{h['id']} {h['stallion']}" for h in near) or "NOT FOUND"))
by_scene = {}
for h in horses:
    by_scene.setdefault(h["scene"], [0, 0])[0] += 1
    if h["stallion"] == "yes": by_scene[h["scene"]][1] += 1
print("per scene (horses/yes):", " ".join(f"{s}:{v[0]}/{v[1]}" for s, v in sorted(by_scene.items())))
json.dump(horses, open(os.path.join(ROOT, "src/data/horses.json"), "w"), indent=1)
