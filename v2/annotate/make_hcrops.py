#!/usr/bin/env python3
"""High-res crops (from the 1200px tier) of the frieze + lower border, for the horse pass.

Same coordinate grid as make_crops.py: labels are 480px-tier strip units, so results
drop straight into the app. Seams are cut mid-overlap, like the viewer.
Writes annotate/hcrops/h-NNN.jpg and annotate/hcrops/index.json.
"""
import json, os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(HERE, "..", "public", "img", "tapestry")
strip = json.load(open(os.path.join(IMG, "strip.json")))
ims = strip["images"]
K = 2.5                      # hi tier / lo tier
Y0, Y1 = 130, 450            # strip y band: main frieze + lower border
CW, STEP = 400, 340          # crop width / step in strip units (60 overlap)

cut = [((ims[i + 1]["x"] + im["x"] + im["width"]) / 2) if i + 1 < len(ims) else im["x"] + im["width"] for i, im in enumerate(ims)]
cache = {}
def hi(i):
    if i not in cache:
        if len(cache) > 6: cache.clear()
        cache[i] = Image.open(os.path.join(IMG, "hi", ims[i]["file"])).convert("RGB")
    return cache[i]

def render(x0, x1):
    out = Image.new("RGB", (round((x1 - x0) * K), round((Y1 - Y0) * K)))
    for i, im in enumerate(ims):
        a = im["x"] if i == 0 else cut[i - 1]
        b = cut[i]
        lo, hi_ = max(a, x0), min(b, x1)
        if lo >= hi_: continue
        src = hi(i)
        sx0, sx1 = (lo - im["x"]) * K, (hi_ - im["x"]) * K
        piece = src.crop((round(sx0), round(Y0 * K), round(sx1), round(Y1 * K)))
        out.paste(piece, (round((lo - x0) * K), 0))
    return out

try:
    font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 15)
except OSError:
    font = ImageFont.load_default()

markers = json.load(open(os.path.join(HERE, "crops", "index.json")))["markers"]
def scenes_in(x0, x1):
    m = {int(k): v for k, v in markers.items()}
    out = []
    for n in range(1, 59):
        a = (m.get(n - 1, 0) + m[n]) / 2
        b = (m[n] + m.get(n + 1, strip["total"])) / 2
        if b > x0 and a < x1: out.append(n)
    return out

index, k, x = [], 0, 0
while x < strip["total"]:
    x1 = min(strip["total"], x + CW)
    img = render(x, x1)
    d = ImageDraw.Draw(img, "RGBA")
    for gx in range((x // 25 + 1) * 25, x1, 25):
        px = (gx - x) * K
        major = gx % 50 == 0
        d.line([(px, 0), (px, img.height)], fill=(0, 140, 255, 90 if major else 40), width=1)
        if major:
            d.rectangle([px + 2, 2, px + 52, 20], fill=(255, 255, 255, 225))
            d.text((px + 4, 3), str(gx), fill=(0, 60, 160), font=font)
    for gy in range((Y0 // 20 + 1) * 20, Y1, 20):
        py = (gy - Y0) * K
        d.line([(0, py), (img.width, py)], fill=(255, 60, 0, 60), width=1)
        d.rectangle([2, py - 10, 36, py + 9], fill=(255, 255, 255, 225))
        d.text((4, py - 9), str(gy), fill=(170, 40, 0), font=font)
    name = f"h-{k:03d}.jpg"
    img.save(os.path.join(HERE, "hcrops", name), quality=88)
    index.append({"file": name, "x0": x, "x1": x1, "scenes": scenes_in(x, x1)})
    k += 1
    x += STEP
json.dump({"y0": Y0, "y1": Y1, "crops": index}, open(os.path.join(HERE, "hcrops", "index.json"), "w"), indent=1)
print(k, "crops")
