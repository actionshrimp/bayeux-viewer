# Bayeux Journeys v2

A phone-friendly rebuild of the Bayeux Tapestry viewer. Scroll the tapestry and a tilted 3D map flies along with the story. Tap people, places and objects on the tapestry for a short bio and every other place they appear.

## Run it

```sh
cd ~/dev/bayeux-journey/v2
npm install          # first time only
npm run dev          # hot-reloading dev server on port 5180
# or
npm run build && npm run preview   # production build, also on port 5180
```

Both commands listen on your network, so the terminal prints a `Network:` address as well as `localhost`.

- **On your Mac:** <http://localhost:5180>
- **On your phone, same Wi-Fi:** the `Network:` address, e.g. `http://192.168.1.181:5180`.
- **On your phone, anywhere:** with Tailscale, use your Mac's tailnet address, e.g. `http://<mac-name>:5180` or `http://100.x.y.z:5180`.

### Offline in the gallery

The app can save itself for offline use (*Layers → Save for offline use*), but browsers only allow that over **HTTPS**. Two ways to get HTTPS:

- **`tailscale serve --bg 5180`** gives you `https://<mac-name>.<tailnet>.ts.net` on your tailnet. Open that on your phone, save offline, then *Add to Home Screen*.
- **Host `dist/` on any static host** (GitHub Pages, Cloudflare Pages, Netlify). The images are public domain. The 480px set is about 24 MB; drop `img/tapestry/hi` if you want it smaller.

Over plain `http://` everything else works; it just needs a connection.

## Deploy

Live at <https://actionshrimp.com/bayeux-viewer/>. To publish changes:

```sh
npm run deploy   # builds, then force-pushes dist/ to the gh-pages branch
```

## What's in it

- **Tapestry strip:** native swipe scrolling with momentum and a centre needle. Seams are cut mid-overlap and feathered. Zoom (+/−, ctrl/pinch-wheel on desktop) swaps in 1200px tiles.
- **Clickable figures:** 71 boxes for 30 people, places and things, from `src/data/characters.json` and `src/data/figures.json`. Tap one to highlight every appearance, read the bio, and step through appearances. Places fly the map there.
- **3D map:** MapLibre GL, fully local (Natural Earth GeoJSON, with no tiles or font server). Pitched camera follows the traveller as you scroll, with extruded pillars for places, the travelled route and a ship/horse marker. Drag the map to explore; *Follow* re-centres it.
- **Panel tabs:**
  - *Scene*: Latin, translation, summary, hardships, who's in it, what to look for.
  - *People*: bios and appearances.
  - *Why*: the Norman / tapestry / English reading of each step.
- **Layers:** People & places (on by default), Who shaped this? (bias tags), Penis watch, Beyond the tapestry (Hardrada), Keep screen on.
- **Gallery helpers:** a scene number jump box, hiding the map for more room, a dark theme when your phone is in dark mode, and screen wake lock.

## Layout

```
index.html            shell
src/main.ts           wiring, input, offline
src/store.ts          state (p, scene, journey, layers, selection, tab)
src/story.ts          strip <-> story position, routes, traveller
src/map3d.ts          MapLibre map
src/strip.ts          tapestry strip, figures, overlays
src/panel.ts          Scene / People / Why tabs
src/styles.css        all styles, light + dark
src/data/             scenes, journeys, dates, argument, bias, penises, basemap,
                      characters (bios), figures (boxes on the tapestry)
public/img/tapestry/  images + strip.json (copied from v1)
annotate/             how the figure boxes were made (see below)
```

## Figure boxes

`annotate/make_crops.py` renders the strip into 66 crops with a coordinate grid (`annotate/crops/`). AI agents read the embroidered captions and scene notes and recorded boxes in `annotate/out/batch-*.json`. Then `npm run annotations` (`annotate/merge.py`) merges them into `src/data/figures.json`.

Boxes are in 480px strip units: `{id, x0, y0, x1, y1, scene, evidence, note}`. They're rough: some figures are missed, and crowded battle scenes are sparse. To fix or add one, edit the JSON (crops show the grid coordinates) and rebuild. A drag-to-edit mode is the obvious next step.

## Debugging

`window.bayeux` exposes `{ map, strip, store, panel }`.

URL flags: `#scene-23`, `?bias`, `?penis`, `?context`, `?people=0`, `?tab=why`, `?select=harold`, `?zoom=2`, `?nomap`.
