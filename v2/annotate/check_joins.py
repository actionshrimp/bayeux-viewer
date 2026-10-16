import json, os
import numpy as np
from PIL import Image
IMG = "public/img/tapestry"
strip = json.load(open(os.path.join(IMG, "strip.json")))
imgs = strip["images"]
def load(f): return np.asarray(Image.open(os.path.join(IMG, f)).convert("L"), dtype=np.float32)
A = [load(m["file"]) for m in imgs]
res = []
for i in range(len(imgs) - 1):
    a, b = A[i], A[i + 1]
    dx0 = imgs[i + 1]["x"] - imgs[i]["x"]
    best = (1e9, 0, 0)
    probe = 160
    for dy in range(-20, 21):
        for dx in range(dx0 - 25, dx0 + 26):
            if dx < 0 or dx + probe > a.shape[1]: continue
            ya0, ya1 = max(60, 60 + dy), min(420, 420 + dy)
            pa = a[ya0:ya1, dx:dx + probe]
            pb = b[ya0 - dy:ya1 - dy, 0:probe]
            e = np.abs(pa - pb).mean()
            if e < best[0]: best = (e, dx, dy)
    res.append((imgs[i]["file"], best[1] - dx0, best[2], round(best[0], 1)))
for r in res: print(r)
print("max |dy|", max(abs(r[2]) for r in res), "max |ddx|", max(abs(r[1]) for r in res))
