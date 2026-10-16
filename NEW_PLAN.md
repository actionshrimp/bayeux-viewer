# Bayeux Journeys v2: plan

A from-scratch rebuild based on what v1 taught us. Desktop first; mobile once the core feels right.

**v2 pillars**
1. **3D map:** a terrain map where every story point is a place you fly to.
2. **Tapestry viewer:** deep-zoom scrolling of the full-resolution tapestry, with **clickable characters**.
3. **Interest overlays:** penis watch, bias/agendas, time, journeys and the argument chart, all as one annotation system.

Everything below is what we learned in v1 and how it should shape v2. Read section 9 (gotchas) before writing code.

---

## 1. What v1 is (reference implementation)

- **Stack:** a static site with no build step. Vendored d3 v7 and topojson-client, plain JS (`js/app.js`, ~900 lines), JSON/JS data files. Run with `python3 -m http.server`.
- **Map:** d3 SVG, Lambert conformal conic (`parallels [49, 58]`, `rotate [-1, 0]`) over Natural Earth 10m land, rivers and lakes clipped to lon −12..16 / lat 42..64. Routes are drawn in screen space so stitch dashes and labels stay a constant size under zoom.
- **Strip:** 56 Commons images at a 480px height, laid out as absolutely positioned clipped tiles. The scroll position maps to a fractional story position `p`, which drives everything else.
- **Layers:** the journey route and moving marker, obstacles, a side trip (messengers), context routes (Hardrada and Harold's marches), the year/date readout with time-jump flags, the "Why it happened" lane chart, the bias tags, penis markers, and zoom with a 1200px tier.
- **Keep from v1:** every file in `data/` (it's the real asset), `scripts/register_strip.py` (the alignment trick) and the story-position model (`p`).

## 2. The data we now have (reuse all of it)

| File | What | Source/quality |
|---|---|---|
| `data/scenes.json` | 58 scenes: `latin`, `english`, `title`, `summary`, `place`, `journey`, `obstacle`, `details[]` | Latin/English checked against Wikipedia "Bayeux Tapestry tituli"; details written from memory, so spot-check against images (scene 38 masthead, 55 Eustace, 35 Odo) |
| `data/journeys.js` | 22 places (lon/lat + notes on uncertain ones), 6 journeys with stops `{place, at, mode, via[], gap}`, side trips, 2 context routes, region labels | Hand-built; coordinates verified against the coastline |
| `data/dates.js` | Date ranges per scene run, `year`, `when`, `jump` notes | Standard chronology |
| `data/argument.js` | 9 columns × 3 lanes (norman / shown / english), 28 nodes, 33 edges, `key` nodes | Synthesised from William of Poitiers, Eadmer, ASC, Vita Edwardi |
| `data/bias.json` | 6 parties, 28 entries `{scenes, party, title, text, strength: documented/argued, source}` | Sourced, with URLs |
| `data/penises.json` | Garnett's totals (93 = 88 horses + 5 humans), 9 located entries `{scene, kind, count, where, pos, note, confidence}` | Sourced; only 8 of the 93 are locatable from text |
| `data/basemap.topo.json` | NE 10m land (272), rivers (279, named), lakes (241); 0.4 MB | Missing: Couesnon, Rance, Orne, Dives, Yorkshire Ouse/Humber |
| `img/tapestry/strip.json` | Per image: `x` offset in the continuous strip (480px units), width; total 41,689px | Pixel registration, mean error 2.5–6 grey levels |
| `img/tapestry/*.jpg`, `hi/*.jpg` | 480px (24 MB) and 1200px (64 MB) tiers | Commons, public domain |

### Key facts about the images
- **Series:** Wikimedia Commons `File:Bayeux Tapestry Scene NN.png`, 01–58, all public domain, all **5,550px tall**, 6,500–50,060px wide (scene 51 is the widest). Scenes 27+28 and 30+31 are combined files (`Scene 27,28.png`, `Scene 30,31.png`), so there are 56 files.
- **Overlap:** each image overlaps its neighbours. It starts at the museum's painted number for the previous scene and ends near the number for the next. So **image k's left edge = scene marker (k.firstScene − 1)**, which gives the museum's own scene positions for free.
- **Image bands:** each image has a black band top and bottom, then the plain linen backing with the painted scene numbers, then the embroidery. At 480px tall: upper border ≈ 27–36% of height, main frieze ≈ 37–77%, lower border ≈ 77–87%.
- **Strip length:** at full resolution the seamless strip is ≈ 41,689 × (5,550/480) ≈ **482,000 × 5,550 px** (≈ 2.7 gigapixels).

## 3. Architecture for v2

### Stack (recommended)
- **Vite + TypeScript:** typed data schemas will pay off, since every overlay shares the story-position model. Keep it a static build that runs offline from `npm run dev` / `npm run preview`.
- **State:** a tiny store (Zustand vanilla or a hand-rolled signal) holding `p`, `scene`, `journey`, `layers`, `zoom` and `selection`. Every view subscribes. v1 threaded this through closures, and it got tangled.
- **UI shell:** plain TS + Web Components or Preact. Avoid heavy frameworks; the expensive parts (map, deep-zoom) are canvas/WebGL anyway.

### The one coordinate system to rule them all
Define **tapestry coordinates** in **full-resolution strip pixels** (height 5,550, width ≈ 482k), origin at the left edge of scene 1's image.
- **Scene markers:** `marker[n]` in tapestry px (scale v1's `strip.json` by 5550/480, or re-run registration at higher resolution for precision).
- **Story position:** `p = n + frac` between markers, used by the map, dates and charts.
- **Annotations:** every annotation (character, penis, bias, obstacle, detail) is a region in tapestry px. Use the **W3C Web Annotation** model so tooling works (see 3.2).

### 3.1 Tapestry viewer: deep zoom
- **OpenSeadragon** (BSD, mature, smooth on desktop and mobile) with a **single stitched DZI/IIIF image pyramid** of the whole strip.
- **Build pipeline** (one-off script):
  1. Download the 56 full-resolution PNGs (~3–4 GB; scenes 27,28 and 30,31 alone are ~100 MB each). Throttle requests and send a User-Agent (see gotchas).
  2. Crop each image to `[x_k, x_{k+1})` using the registration offsets, then join them horizontally with `vips arrayjoin` (or `vips insert` chains).
  3. Generate tiles with `vips dzsave strip.v --layout dz --tile-size 512 --suffix .jpg[Q=82]`, or `--layout iiif3`. Expect ~300–600 MB of tiles.
  4. If one 482k-px-wide image is awkward, use an **OpenSeadragon multi-image collection** instead: 56 tile sources placed at their `x` offsets, with clipping set via `setClip`. This avoids stitching artefacts and keeps rebuilds incremental.
- **Behaviour:**
  - Lock the vertical pan, map wheel to horizontal pan, and bound the zoom between "full height fits the viewport" and native resolution.
  - The needle stays at the centre, as in v1. On every animation frame, derive `p` from the viewport centre.
- **Overlays:** OpenSeadragon's overlay API, or an SVG overlay plugin, for annotation shapes. A Canvas2D overlay is better if there are hundreds (e.g. all 93 penises).

### 3.2 Clickable characters (new in v2)
- **Annotation tool:** **Annotorious (OpenSeadragon plugin)** gives drawing, editing, selection and the W3C annotation format out of the box. Ship two modes:
  - **View mode:** hover to highlight; click to open the character card (bio, every appearance, scenes); "show every appearance" lights them up along the strip and on the minimap.
  - **Edit mode** (behind a key, e.g. `?edit`): draw a box or polygon, tag it with a character id, then save or export to `data/annotations/*.json`.
- **Seeding without blowing up context:**
  1. **Tituli first.** Many figures are named in the embroidered text right above them, so the label's position is a strong prior. Named figures include HAROLD, EDWARD (EADWARDUS), WILLELM, WIDO (Guy), ODO EPISCOPUS, ROTBERT (Robert of Mortain), CONAN, ÆLFGYVA, TUROLD, WADARD, VITAL, STIGANT, EUSTATIUS, LEWINE and GYRD (Leofwine and Gyrth), and the clericus.
  2. **A vision pass in subagents only** (never the main context). Give each agent 2–3 scene images downscaled to ~1200px wide; it returns JSON boxes in image-fraction coordinates for named figures and horses. Merge, then fix by hand in edit mode.
  3. Mark every machine-proposed box `confidence: "proposed"` until a human approves it.
- **Character registry:** `data/characters.json` with entries `{id, name, latin, role, bio, sources[], color}`. Each annotation's body carries `{purpose: "identifying", value: "harold"}` plus layer tags.
- **Character card:** portrait crops (taken from the annotations themselves), a timeline of appearances (tick marks on the strip minimap), relations (Harold ↔ William, Odo ↔ Turold/Wadard/Vital), and their node on the argument chart.

### 3.3 The 3D map
Two viable routes. **Recommend A.**

**A. MapLibre GL JS + local PMTiles + terrain (recommended)**
- **MapLibre GL JS** (BSD) has pitch, bearing, `flyTo` with curves, 3D terrain via raster-DEM, fog and sky, and handles labels well. It's a much better fit than raw three.js for "fly to each point".
- **Offline vector basemap:** build a **PMTiles** extract for the bbox with Planetiler or Protomaps (single file, served by Vite, no tile server). Then **restyle it heavily**: linen land, woad sea, no modern roads or borders. Alternatively, convert v1's Natural Earth TopoJSON to GeoJSON sources directly; that's simpler and keeps the hand-drawn look.
- **Terrain:** download a DEM (Copernicus GLO-90 or Mapzen Terrarium tiles from AWS Open Data) for the bbox, zooms 0–10. Store it as a raster-dem PMTiles archive. Use exaggeration of about 1.5–2; Normandy is flat, so Brittany and the South Downs benefit.
- **Routes:**
  - GeoJSON line layers with `line-dasharray` for stitch styles, plus a progress gradient (`line-gradient` with `lineMetrics: true`) so the travelled part fills in as `p` advances.
  - Use `line-progress` for "done vs ahead" instead of v1's re-slicing.
- **Moving marker:** a custom HTML marker (ship or horse glyph), or a three.js custom layer for a little 3D longship model (stretch goal).
- **Camera choreography:** each journey stop gets a camera preset `{center, zoom, pitch, bearing}`. Between stops, interpolate the camera from `p` (scrubbed, not timed), so scrolling the tapestry flies the camera.
  - Precompute a spline through the camera keyframes and evaluate it at `p`. This is the single most impressive thing v2 can do.
  - Keep `flyTo` only for jumps (tab clicks).
- **Points:** each place is a 3D pin or extruded marker with a label. The current place pulses. Obstacles are icon symbols. Disputed places get a translucent uncertainty circle, not a point.

**B. three.js diorama**
- A custom terrain mesh from a DEM heightmap for the bbox, a coastline texture painted in tapestry style (even generated from the tapestry's own linen photo), and route tubes (`TubeGeometry`) with an embroidered-thread shader.
- Very beautiful and very bespoke. Expect 3–5× the effort of A for labels, picking, camera and performance. Consider it later for a "diorama mode".

### 3.4 Overlays as one system
Every overlay is a **layer** sharing one interface:

```ts
interface Layer {
  id: 'journeys' | 'characters' | 'penis' | 'bias' | 'time' | 'argument' | 'context' | 'obstacles'
  label: string
  annotations: Annotation[]          // regions on the tapestry (tapestry px)
  mapFeatures?: GeoJSON.FeatureCollection
  panel?(scene: number): HTMLElement | null
  legend?: LegendItem[]
}
```

- The layer panel turns layers on and off. Each layer can draw on the **tapestry** (regions or tags), the **map** (features) and the **scene panel** (cards).
- **Penis layer:** convert v1 entries to regions (keeping `confidence`). With the vision pass, aim to place all 88 horses. Garnett's article lists them by context, so recheck the History Extra piece and his *Historical Research* (2018) paper for the scene list.
- **Bias layer:** keep tags on the upper band. Add a "party lens" that tints the whole strip by who-cares density (a heat strip along the minimap) and filters to one party.
- **Time layer:** year readout, time-jump flags, and an optional "true chronology" toggle that reorders scenes 26–28 on the minimap to show the reversal.
- **Argument layer:** the lane chart as a docked panel or full overlay, as in v1, but rendered from the same store and linked both ways. Selecting a node also highlights its regions on the tapestry.

## 4. UX plan (desktop first)

```
+---------------------------------------------------------------+
| header: title · journey tabs · layer toggles · search (⌘K)    |
+-----------------------------------------+---------------------+
|                                         | scene card          |
|           3D map (MapLibre)             |  - titulus + trans. |
|   year/date top-right, camera follows p |  - summary, hardship|
|                                         |  - layer cards      |
|                                         |  - character chips  |
+-----------------------------------------+---------------------+
| tapestry deep-zoom (OpenSeadragon), needle at centre          |
| minimap: journeys · scene ticks · penis/bias density · window |
+---------------------------------------------------------------+
```

- **Resizable split:** drag the divider between the map and the tapestry. A "tapestry focus" mode makes the strip full height for zoomed reading.
- **Search (⌘K):** scenes, people, places and Latin words, e.g. "Odo", "Dinan", "SACRAMENTUM".
- **Reading mode:** auto-scroll paced by each scene's text length, with optional narration later.
- **Keyboard:** ← → scene, space play, + − zoom, L layers, C characters, W why-chart.
- **Mobile (later):** stack the map (40vh), strip (35vh) and a bottom-sheet scene card. OpenSeadragon and MapLibre both handle touch well. Keep annotations tappable (minimum 32px hit targets).

## 5. Content still to research or write
1. **Character registry** (~20 people) with bios and sources.
2. **Penis catalogue** to 93 (vision pass plus Garnett).
3. **Missing rivers:** hand-draw the Couesnon, Rance, Dives, Orne and Yorkshire Ouse/Humber as GeoJSON (the Couesnon matters for the quicksand scene).
4. **Camera keyframes** per journey stop (center, zoom, pitch, bearing).
5. **Border-fable catalogue:** Aesop's fables in the borders (fox and crow, wolf and crane, etc.) with readings. It feeds the bias layer.
6. **Lost ending:** a placeholder section after scene 58 (William's coronation on Christmas Day 1066, likely the lost final panels). The Alderney replica's 2013 ending could be a cited reference.
7. **Disputed-place polygons:** Ponthieu landing (Somme vs Authie), Harold's return port, the English ship's landfall, the oath location (Bayeux vs Bonneville vs Rouen), scene 21's location.
8. **Spot-check scene `details[]`** against the images; some were written from memory.

## 6. Build phases

1. **Foundation.** Vite + TS skeleton, store, data schemas (zod), and migrate the v1 data into typed modules. Port `register_strip.py` and generate tapestry-px markers.
2. **Tapestry deep zoom.** Full-resolution download, stitch or collection, DZI tiles; OpenSeadragon with the locked-axis pan; needle → `p`; minimap.
3. **3D map.** MapLibre with a restyled basemap and terrain; routes with progress gradients; camera spline driven by `p`.
4. **Layers.** Journeys, obstacles, time, context, bias and penis ported to the layer interface.
5. **Characters.** Annotorious edit mode, then the vision-pass seeding in subagents, a review pass, character cards and "all appearances".
6. **Argument chart.** Ported and linked both ways with annotations.
7. **Polish.** Search, reading mode, performance (tile prefetch along the scroll direction), dark mode.
8. **Mobile.**

## 7. Performance notes
- The 480px strip in v1 is 24 MB for the whole tapestry, which is fine. Deep zoom only loads visible tiles; prefetch one viewport ahead in the scroll direction during play.
- MapLibre terrain is GPU-heavy, so cap `maxPitch` at ~70 and use `terrain` only at zoom ≥ 6, or allow it to be turned off.
- Drive everything from `requestAnimationFrame` with a single `p` per frame. Avoid layout thrash; v1 had a ResizeObserver loop until it compared sizes before re-laying out.

## 8. Testing approach that worked
- **Headless Chrome screenshots** with URL flags (`?why`, `?bias`, `?penis`, `?zoom=3`, `?overview`, `#scene-N`). Keep these flags in v2; they make visual testing and sharing views trivial.
- **`--dump-dom`** to check computed state without screenshots, which saves context.
- Add **Playwright** in v2 for scripted scroll → assert the map state (current journey, place, year) at key scenes: 1, 17, 23, 26, 38, 57.

## 9. Gotchas we hit (don't repeat them)
1. **Commons thumbnails snap to standard widths** (960/1920/3840). Asking for `iiurlheight=480` returned images of varying heights. **Always normalise the height after download.**
2. **Commons rate-limits (HTTP 429).** Batch `imageinfo` queries (50 titles per call), send a descriptive User-Agent, honour `Retry-After`, sleep about 2s between downloads.
3. **The scene images overlap.** Don't concatenate them naively. Register them (strip-matching the left 200px of the next image against the current one, mean absolute difference over the embroidery band, skipping the black bars) or the strip duplicates content.
4. **Merging all land polygons into one SVG path made Great Britain disappear** (nonzero fill-rule cancellation between rings). Draw one path per feature. In MapLibre this is a non-issue, but watch it in any SVG or canvas fallback.
5. **CSS grid `1fr` = `minmax(auto, 1fr)`.** An 86,000px-wide scroll strip inflated the whole grid. Use `minmax(0, 1fr)` for every track containing wide or scrolling content.
6. **A `display: flex` rule overrides the `hidden` attribute.** Add `[hidden] { display: none !important }` globally.
7. **`fetch()` fails from `file://`.** Always serve over HTTP (Vite solves this).
8. **Headless Chrome has a minimum window width of ~500px.** Phone-width screenshots at 400px are cropped, not reflowed. Use device emulation (Playwright) for mobile tests.
9. **Natural Earth lacks small rivers** that matter to the story (Couesnon, Dives, Rance). Hand-draw them.
10. **Sea routes need waypoints** to avoid crossing land (Dives → Saint-Valery hugs the coast). In v2 use explicit `via` points, or a sea-only routing graph.
11. **Label collisions** at journey zoom (Mont-Saint-Michel / Couesnon / Dol / Dinan are within ~30km). Use MapLibre's symbol collision detection, plus per-place `text-anchor` and `text-offset` overrides.
12. **The tapestry's chronology isn't linear** (26–28 reversed; the 1065 → 1066 jump; the Saint-Valery wait skipped). Don't drive dates from the scene index; use the dates table.
13. **Penis data from text is thin** (8 of 93). Plan the vision pass from the start, and label confidence honestly in the UI.

## 10. Key sources
- Wikipedia: *Bayeux Tapestry*, *Bayeux Tapestry tituli* (Latin and English per scene).
- Bayeux Museum: bayeuxmuseum.com (scene-by-scene viewer and commentary).
- George Garnett, "The Bayeux Tapestry and its penises", *History Extra* (2018), and *Historical Research*. Summarised at thehistoryblog.com/archives/52003.
- Christopher Monk on a possible 94th penis (The Art Newspaper, April 2025).
- Andrew Bridgeford, *1066: The Hidden History in the Bayeux Tapestry* (the Eustace thesis).
- David Bernstein, *The Mystery of the Bayeux Tapestry* (1986), on the arrow and restorations.
- Charles Stothard's drawings, 1816–19 (pre-restoration evidence).
- Primary narratives: William of Poitiers, William of Jumièges, Eadmer, the Anglo-Saxon Chronicle, the *Vita Ædwardi Regis*.
- Data: Natural Earth; Wikimedia Commons "Bayeux Tapestry Scene NN" series (public domain).
