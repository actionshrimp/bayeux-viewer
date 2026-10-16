#!/usr/bin/env python3
"""Border-only crops for a second horse pass: the upper and lower borders of each stretch,
stacked into one image, from the 1200px tier. Grid labels are 480px-tier strip units.
Writes annotate/bcrops/b-NNN.jpg and annotate/bcrops/index.json.
"""
import json, os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(HERE, "..", "public", "img", "tapestry")
strip = json.load(open(os.path.join(IMG, "strip.json")))
ims = strip["images"]
K = 2.5
BANDS = [("UPPER BORDER", 105, 185), ("LOWER BORDER", 355, 440)]
CW, STEP, OUT_SCALE = 700, 620, 2.0   # strip units; output px per strip unit

cut = [((ims[i + 1]["x"] + im["x"] + im["width"]) / 2) if i + 1 < len(ims) else im["x"] + im["width"] for i, im in enumerate(ims)]
cache = {}
def hi(i):
    if i not in cache:
        if len(cache) > 6: cache.clear()
        cache[i] = Image.open(os.path.join(IMG, "hi", ims[i]["file"])).convert("RGB")
    return cache[i]

def render(x0, x1, y0, y1):
    out = Image.new("RGB", (round((x1 - x0) * K), round((y1 - y0) * K)))
    for i, im in enumerate(ims):
        a = im["x"] if i == 0 else cut[i - 1]
        lo, hi_ = max(a, x0), min(cut[i], x1)
        if lo >= hi_: continue
        piece = hi(i).crop((round((lo - im["x"]) * K), round(y0 * K), round((hi_ - im["x"]) * K), round(y1 * K)))
        out.paste(piece, (round((lo - x0) * K), 0))
    return out.resize((round((x1 - x0) * OUT_SCALE), round((y1 - y0) * OUT_SCALE)), Image.LANCZOS)

font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 14)
LABEL_H = 22
index, k, x = [], 0, 0
while x < strip["total"]:
    x1 = min(strip["total"], x + CW)
    panels = []
    for name, y0, y1 in BANDS:
        img = render(x, x1, y0, y1)
        d = ImageDraw.Draw(img, "RGBA")
        for gx in range((x // 25 + 1) * 25, x1, 25):
            px = (gx - x) * OUT_SCALE
            d.line([(px, 0), (px, img.height)], fill=(0, 140, 255, 80 if gx % 50 == 0 else 35))
            if gx % 50 == 0:
                d.rectangle([px + 2, 2, px + 50, 19], fill=(255, 255, 255, 225))
                d.text((px + 4, 3), str(gx), fill=(0, 60, 160), font=font)
        for gy in range((y0 // 20 + 1) * 20, y1, 20):
            py = (gy - y0) * OUT_SCALE
            d.line([(0, py), (img.width, py)], fill=(255, 60, 0, 60))
            d.rectangle([2, py - 9, 34, py + 8], fill=(255, 255, 255, 225))
            d.text((4, py - 8), str(gy), fill=(170, 40, 0), font=font)
        head = Image.new("RGB", (img.width, LABEL_H), (25, 22, 18))
        ImageDraw.Draw(head).text((6, 3), f"{name}  (strip y {y0}–{y1})", fill=(240, 230, 210), font=font)
        panels += [head, img]
    sheet = Image.new("RGB", (panels[0].width, sum(p.height for p in panels) + 8), (25, 22, 18))
    yy = 0
    for p in panels:
        sheet.paste(p, (0, yy)); yy += p.height + (8 if p.height > LABEL_H and yy < 10 else 0)
    name = f"b-{k:03d}.jpg"
    sheet.save(os.path.join(HERE, "bcrops", name), quality=88)
    index.append({"file": name, "x0": x, "x1": x1})
    k += 1
    x += STEP
json.dump({"bands": BANDS, "crops": index}, open(os.path.join(HERE, "bcrops", "index.json"), "w"), indent=1)
print(k, "crops")
