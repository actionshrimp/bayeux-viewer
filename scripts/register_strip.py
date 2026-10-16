#!/usr/bin/env python3
"""Find how far each tapestry image overlaps the next, so they tile seamlessly.

Each Commons scene image overlaps its neighbours. For every adjacent pair (A, B) we find
the x offset in A at which B begins by matching a strip of B's left edge against A.
Writes img/tapestry/strip.json: [{file, scenes, width, x}] where x is the image's left
edge in continuous-strip pixels. Needs Pillow + numpy.
"""
import json, os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, "img", "tapestry")
manifest = json.load(open(os.path.join(DIR, "manifest.json")))


def load(name):
    im = Image.open(os.path.join(DIR, name)).convert("L")
    a = np.asarray(im, dtype=np.float32)
    return a[60:420]  # skip black bands top and bottom


def offset(a, b, probe=200):
    pb = b[:, :probe]
    best, best_x = 1e9, None
    for x in range(int(a.shape[1] * 0.15), a.shape[1] - probe):
        d = np.abs(a[:, x:x + probe] - pb).mean()
        if d < best:
            best, best_x = d, x
    return best_x, best


x = 0
out = []
imgs = [load(m["file"]) for m in manifest]
for i, m in enumerate(manifest):
    out.append({"file": m["file"], "scenes": m["scenes"], "width": m["width"], "x": x})
    if i + 1 < len(manifest):
        dx, err = offset(imgs[i], imgs[i + 1])
        print(f"{m['file']:>20} -> next starts at {dx:5d} / {m['width']}  ({dx / m['width']:.2f})  err {err:.1f}")
        x += dx
total = x + manifest[-1]["width"]
json.dump({"height": manifest[0]["height"], "total": total, "images": out},
          open(os.path.join(DIR, "strip.json"), "w"), indent=1)
print("total strip width", total)
