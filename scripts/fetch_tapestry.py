#!/usr/bin/env python3
"""Download public-domain scene images of the Bayeux Tapestry from Wikimedia Commons.

Writes <tier dir>/<key>.jpg and <tier dir>/manifest.json.
Requires macOS `sips` for PNG -> JPEG conversion.
"""
import json, os, subprocess, sys, time, urllib.error, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Usage: fetch_tapestry.py            -> 480px tier in img/tapestry (used for the strip layout)
#        fetch_tapestry.py --hi       -> 1200px tier in img/tapestry/hi (loaded when zoomed in)
HI = "--hi" in sys.argv
HEIGHT = 1200 if HI else 480
OUT = os.path.join(ROOT, "img", "tapestry", "hi" if HI else "")
UA = {"User-Agent": "bayeux-journey-viewer/1.0 (personal educational project)"}

# Each Commons file and the scene numbers it covers, in tapestry order.
FILES = []
for n in range(1, 59):
    if n in (27, 28, 30, 31):
        continue
    FILES.append((f"Bayeux Tapestry Scene {n:02d}.png", [n]))
FILES.insert(26, ("Bayeux Tapestry Scene 27,28.png", [27, 28]))
FILES.insert(28, ("Bayeux Tapestry Scene 30,31.png", [30, 31]))


def fetch(url):
    for attempt in range(8):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA)) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code != 429 and e.code < 500:
                raise
            wait = int(e.headers.get("Retry-After") or 0) or 5 * 2 ** attempt
            print(f"  HTTP {e.code}, waiting {wait}s", file=sys.stderr)
            time.sleep(wait)
    raise RuntimeError("gave up on " + url)


def image_info(titles):
    """One batched API call for all files (max 50 titles per call)."""
    info = {}
    for i in range(0, len(titles), 50):
        q = urllib.parse.urlencode({"action": "query", "titles": "|".join("File:" + t for t in titles[i:i + 50]),
                                    "prop": "imageinfo", "iiprop": "url|size", "iiurlheight": HEIGHT,
                                    "format": "json"})
        d = json.loads(fetch("https://commons.wikimedia.org/w/api.php?" + q))
        for page in d["query"]["pages"].values():
            info[page["title"][5:]] = page["imageinfo"][0]
    return info


def main():
    os.makedirs(OUT, exist_ok=True)
    manifest = []
    info = image_info([t for t, _ in FILES])
    for title, scenes in FILES:
        key = "scene-" + "-".join(f"{s:02d}" for s in scenes)
        dest = os.path.join(OUT, key + ".jpg")
        ii = info[title]
        if not os.path.exists(dest):
            tmp = dest + ".src"
            with open(tmp, "wb") as f:
                f.write(fetch(ii["thumburl"]))
            subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "80",
                            tmp, "--out", dest], check=True, capture_output=True)
            os.remove(tmp)
            time.sleep(2)
            # Commons snaps thumbs to standard widths, so normalise the height
            subprocess.run(["sips", "--resampleHeight", str(HEIGHT), dest], check=True, capture_output=True)
        out = subprocess.run(["sips", "-g", "pixelWidth", dest], capture_output=True, text=True).stdout
        w = int(out.split()[-1])
        manifest.append({"file": key + ".jpg", "scenes": scenes, "width": w, "height": HEIGHT,
                         "source": ii["descriptionurl"]})
        print(key, w)
    with open(os.path.join(OUT, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=1)


if __name__ == "__main__":
    main()
