# Bayeux Journeys

Interactive viewers for the Bayeux Tapestry: scroll the tapestry and follow its journeys on a map.

- **Live (v2):** <https://actionshrimp.com/bayeux-viewer/>
- **`v2/`:** the current version. Phone-friendly, with a 3D map and clickable figures. See [v2/README.md](v2/README.md).
- **Repo root:** v1, the original static d3 viewer (described below).
- **Notes:** [SUMMARY-OF-ASKS.md](SUMMARY-OF-ASKS.md) and [NEW_PLAN.md](NEW_PLAN.md) record how the project was planned.

---

## v1

An interactive viewer for the Bayeux Tapestry. Scroll the tapestry sideways and a map of north-west Europe follows the story: who is travelling, where they are, and what is in their way.

## Run it

The page loads JSON files, so it needs a local web server (browsers block `fetch` from `file://`):

```sh
cd ~/dev/bayeux-journey
python3 -m http.server 8000
```

Then open <http://localhost:8000>. No build step and no npm install: d3 and topojson-client are vendored in `vendor/`.

Useful URL options (handy for testing or sharing a view):

| URL | Opens |
|---|---|
| `#scene-23` | the strip at scene 23 |
| `?why` | the "Why it happened" chart |
| `?penis` / `?bias` / `?context` | with that layer switched on |
| `?overview` | the map zoomed out to the whole story |
| `?zoom=3` | the strip zoomed in (levels 0–4) |

These combine, for example `?bias&why#scene-23`.

## Controls

- **Strip:** scroll wheel, trackpad or drag to move along the tapestry. The white needle is the current position. ← → step by scene, space plays, + − zoom (or ctrl+wheel / pinch). Click the bar under the strip to jump.
- **Map:** drag and zoom freely. *Follow journey* re-centres on the current journey, and *Whole story* shows everything.
- **Layers** (header):
  - *Beyond the tapestry* adds Harald Hardrada's invasion and Harold's forced marches, which the tapestry leaves out.
  - *Who shaped this?* adds bias tags: who had an interest in each scene. Solid tags are documented and hatched tags are argued.
  - *Penis watch* marks the located examples from George Garnett's 2018 count of 93.

## Layout

```
index.html          page shell
css/style.css       all styles (light and dark themes)
js/app.js           everything interactive
data/
  journeys.js       places, journeys, routes, region labels  (hand-written)
  dates.js          when each run of scenes happened + time jumps
  argument.js       "Why it happened" chart: nodes, lanes, edges
  scenes.json       58 scenes: Latin, English, summary, place, obstacles
  penises.json      Garnett's count + located entries
  bias.json         parties and per-scene agendas, with sources
  basemap.topo.json Natural Earth land, rivers, lakes (no modern borders)
img/tapestry/       480px scene images + strip.json (seamless layout)
img/tapestry/hi/    1200px tier, loaded only when zoomed in
scripts/
  fetch_tapestry.py   download images from Wikimedia Commons (--hi for 1200px)
  register_strip.py   compute image overlaps -> strip.json
  build_basemap.sh    rebuild the basemap with mapshaper
```

### How the strip lines up

The Commons images overlap: each one runs from the museum's painted number for the previous scene to the number for the next scene. `register_strip.py` matches pixels between neighbouring images to find the offsets, then lays them out as one seamless 41,689px strip. The painted numbers become scene positions. The story position `p` is fractional (`p = 17.5` is halfway between the numbers for scenes 17 and 18). Each journey stop in `journeys.js` has an `at` value in those units, and the moving marker on the map interpolates between stops.

To rebuild the images (needs Pillow and numpy for registration):

```sh
python3 scripts/fetch_tapestry.py          # 480px tier
python3 scripts/fetch_tapestry.py --hi     # 1200px tier
python3 scripts/register_strip.py
```

## Sources and caveats

- Images: photographs of the Bayeux Tapestry on [Wikimedia Commons](https://commons.wikimedia.org/wiki/Category:Bayeux_Tapestry), public domain.
- Map data: [Natural Earth](https://www.naturalearthdata.com/). It lacks small rivers such as the Couesnon, Rance and Dives.
- Scene text is checked against Wikipedia's *Bayeux Tapestry tituli*. Sources for bias and penis entries are cited in their JSON files.
- Routes between named places are approximate. Several places are disputed (where Harold landed in Ponthieu, where the oath was sworn, where the English ship came ashore), and the scene text says so.
