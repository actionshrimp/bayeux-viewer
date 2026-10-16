#!/usr/bin/env python3
"""Render the seamless 480px strip into overlapping crops with a labelled grid.

Grid labels are absolute strip coordinates (x along the whole tapestry, y from the top
of the 480px image), so annotators can report boxes directly in strip units.
Writes annotate/crops/crop-NNN.png and annotate/crops/index.json.
"""
import json, os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(HERE, "..", "public", "img", "tapestry")
strip = json.load(open(os.path.join(IMG, "strip.json")))
H = strip["height"]
total = strip["total"]

full = Image.new("RGB", (total, H))
imgs = strip["images"]
for i, im in enumerate(imgs):
    src = Image.open(os.path.join(IMG, im["file"])).convert("RGB")
    w = (imgs[i + 1]["x"] - im["x"]) if i + 1 < len(imgs) else im["width"]
    full.paste(src.crop((0, 0, min(w, src.width), H)), (im["x"], 0))

# Scene markers: image k starts at the marker of the scene before its first scene.
marker = {}
for i, im in enumerate(imgs):
    if i > 0:
        marker[im["scenes"][0] - 1] = im["x"]
marker[58] = imgs[-1]["x"] + imgs[-1]["width"] * 0.55
for s in (27, 30):
    marker[s] = (marker[s - 1] + marker[s + 1]) / 2

def scenes_in(x0, x1):
    # scene n is centred on marker n and spans the midpoints to its neighbours
    out = []
    for n in range(1, 59):
        a = (marker.get(n - 1, 0) + marker[n]) / 2
        b = (marker[n] + marker.get(n + 1, total)) / 2
        if b > x0 and a < x1:
            out.append(n)
    return out

try:
    font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 13)
except OSError:
    font = ImageFont.load_default()

CW, STEP, SCALE = 760, 640, 1.6
index = []
x = 0
k = 0
while x < total:
    x1 = min(total, x + CW)
    crop = full.crop((x, 0, x1, H)).resize((round((x1 - x) * SCALE), round(H * SCALE)), Image.LANCZOS)
    d = ImageDraw.Draw(crop, "RGBA")
    for gx in range((x // 50 + 1) * 50, x1, 50):
        px = (gx - x) * SCALE
        major = gx % 100 == 0
        d.line([(px, 0), (px, crop.height)], fill=(0, 140, 255, 110 if major else 50), width=1)
        if major:
            d.rectangle([px + 2, 2, px + 46, 18], fill=(255, 255, 255, 220))
            d.text((px + 4, 3), str(gx), fill=(0, 60, 160), font=font)
    for gy in range(40, H, 40):
        py = gy * SCALE
        d.line([(0, py), (crop.width, py)], fill=(255, 60, 0, 70), width=1)
        d.rectangle([2, py - 9, 32, py + 8], fill=(255, 255, 255, 220))
        d.text((4, py - 8), str(gy), fill=(170, 40, 0), font=font)
    name = f"crop-{k:03d}.png"
    crop.save(os.path.join(HERE, "crops", name))
    index.append({"file": name, "x0": x, "x1": x1, "scenes": scenes_in(x, x1)})
    k += 1
    x += STEP
json.dump({"height": H, "total": total, "markers": marker, "crops": index},
          open(os.path.join(HERE, "crops", "index.json"), "w"), indent=1)
print(k, "crops")
