# Summary of asks: Bayeux Journeys session (15 Oct 2026)

Everything you asked for or noted during the build, in order, with what was done and where it lives. See `README.md` for how to run the viewer.

---

## 1. The original idea

> "Some big chunks of the tapestry are all about journeys undertaken by various parties at different points and the obstacles they overcame. Build me an interactive viewer (HTML or even WebGL/three.js) that shows a map of Europe, with the different sections of the tapestry and the journeys they depict."

**Status: done.**
- I chose a d3/SVG map over WebGL. It's sharper for coastlines, labels and stitched route lines, and it zooms smoothly. A 3D globe would add spectacle but make the routes harder to read.
- **Six journeys** (`data/journeys.js`):
  1. Harold sails to Normandy, scenes 1–15
  2. The Breton campaign, scenes 16–23
  3. Harold returns, scenes 24–25
  4. A crown and a comet, scenes 26–34
  5. William's invasion, scenes 35–47
  6. The Battle of Hastings, scenes 48–58
- **Route lines** are styled as embroidery: stem stitch overland, running stitch at sea, dotted where a leg is not embroidered.
- **Obstacles** appear as diamonds on the map and as "Hardship" notes in the scene panel. They include Guy's capture, the Couesnon quicksand, Conan's escape from Dol, the siege of Dinan, the night crossing, and others.
- **Side trip:** William's messengers riding to Beaurain show as a separate dashed route during scenes 10–12.

## 2. Side-scrolling tapestry as the timeline

> "A side-scrolling representation of the tapestry itself, so I could use that as a 'timeline'… it would highlight different pieces on the European map as we progressed through each scene."

**Status: done.**
- **The strip:** the real tapestry runs along the bottom of the page, built from 56 public-domain Commons photographs covering all 58 scenes.
- **Seamless joins:** the photos overlap, so a registration script (`scripts/register_strip.py`) pixel-matches neighbours into one seamless strip.
- **Scene positions:** the museum's painted scene numbers set where each scene sits, so the scene under the needle always matches the panel.
- **Scrolling drives the map:** the current journey zooms into view, the route fills in as you travel, a ship or rider marker moves along it, and the current place pulses.
- **Controls:**
  - Wheel, drag or trackpad to scroll the strip; arrow keys step a scene; space plays.
  - The overview bar under the strip shows the journeys in colour and lets you jump.
  - Deep links like `#scene-23` open at a scene.

## 3. Local project, not a hosted artifact

> "It doesn't need to be a Claude artifact. I'd rather it was a local project that I can run via localhost."

**Status: done.** It's a plain static site in `~/dev/bayeux-journey`. Run `python3 -m http.server 8000` and open localhost:8000. There's no build step, and the libraries are vendored so it works offline (except Google Fonts, which fall back cleanly).

## 4. Penis highlight overlay

> "As a fun detail, we could add a 'penis highlight' overlay to draw attention to the many penises along the way 😎"

**Status: done**, with a caveat on coverage.
- **The toggle:** *Penis watch* in the header. A running counter ("4 / 93") shows how many you have passed.
- **Strip markers:** glowing rings, solid where a source places the penis and dashed where the placement is a reasonable inference. Pink ticks also appear on the overview bar.
- **Panel notes:** each located example gets a short explanatory note.
- **Source:** George Garnett's 2018 study counted 93: 88 on horses and 5 on men.
- **Coverage:** web sources locate only 8 of the 93. Those are all 5 humans, plus William's charger (the largest), Odo's horse and Harold's first steed. There's also one disputed extra: the stripped corpse in scene 57, which sits outside Garnett's count. The other 85 horses aren't placed by any published source.
- **Data:** `data/penises.json`, with citations.
- **Possible follow-up:** finding the remaining horses would need an image pass. Run it in subagents so it doesn't fill the main chat context.

## 5. Use subagents while downloading

> "While it's downloading, we can probably check out the story/text details of each chunk, and figure out how to build some of the other viewer pieces with subagents."

**Status: done.** Four research and build agents ran in parallel:
- scene texts (Latin, translations, summaries, places, obstacles)
- basemap geodata (Natural Earth, clipped, no modern borders)
- penis locations
- the bias layer

## 6. Don't scan images individually

> "Avoid individually scanning these images as it will blow out our chat context. If we can get metadata about the panels from Wikimedia/other references we should, and use image scan as a last resort."

**Status: followed.**
- All scene, penis and bias data came from text sources.
- The strip was aligned by a pixel-matching script, not by looking at images.
- A few screenshots of the finished viewer were taken for testing.

## 7. Clickable characters on the tapestry

> "If we have some way of highlighting key characters in key scenes by clicking on them as well on the actual horizontal tapestry view… pretty powerful as an add-on once we're done with the map/penis layers."

**Status: not built yet. This is the next add-on.**
- **Why it's harder:** it needs a box around each figure in the images, and no published source gives figure coordinates.
- **Option A, a small annotation mode (recommended first).** Drag a box on the strip, pick a character (Harold, William, Odo, Edward, Guy, Conan, Ælfgyva, Turold, Wadard, Vital, Eustace, Stigand), and save to `data/characters.json`. The viewer then highlights and labels them, and clicking a name in the panel lights up every appearance along the strip.
- **Option B, a subagent vision pass.** Agents look at downscaled images in their own context and propose boxes for named figures, which you then correct in the annotation mode. Many figures are named by the tituli (HAROLD, WILLELM, WIDO, ODO EPISCOPUS, TUROLD, WADARD, VITAL, EUSTATIUS…), which narrows it a lot.

## 8. A "logical deduction" map or flowchart

> "Any kind of 'logical deduction' map of the whole thing or flowchart layer would be amazing. The whole thing is super confusing, e.g. the oath: what are the implications of this?"

**Status: done.** The *Why it happened* tab over the map (`data/argument.js`).
- **Lanes:** three rows. *Norman reading* is on top, *In the tapestry* in the middle and *English reading* at the bottom.
- **Not-embroidered events** are shown dashed: the 1051 promise, the hostages, the papal banner, Stamford Bridge and William's coronation.
- **Navigation:** it follows the strip, highlighting the current column and nodes. Clicking a box jumps to its scenes.

**Your oath question in short:**
- **The Norman case:** Harold had been rescued by William, then armed by him, which in Norman eyes made him William's man. He then swore on holy relics to support William as Edward's heir. Taking the crown in January 1066 made him a perjurer, a sin against God, not just a broken promise.
- **What that bought William:** papal backing (a banner from Alexander II), so the invasion became a just war. Harold's death at Hastings then reads as divine judgement.
- **The English answer:** the oath was sworn under duress, since Harold could not leave Normandy without it, so it did not bind him. More importantly, the dying Edward named Harold as his heir, and the witan elected him.
- **The tapestry's role:** it never says what Harold swore, or what Edward said on his deathbed. That silence is exactly where the two stories split.

## 9. Load larger images when zooming

> "We might need to scale. Can we dynamically load the larger images if people want to zoom? (Off disk as it's all local currently.)"

**Status: done.**
- **Two tiers:** 480px images (24 MB) for normal viewing, and a 1200px tier in `img/tapestry/hi/` (64 MB).
- **Zoom:** the strip has five levels, set with the + / − buttons or keys, or ctrl+wheel / trackpad pinch. Once zoomed, you can pan vertically by dragging.
- **Loading:** high-res tiles fade in only for the part of the strip on screen, once the 480px image would be upscaled (on retina screens that can be at the default zoom).
- **Larger still:** the Commons originals are 5,550px tall. Run `fetch_tapestry.py` with a bigger height for a third tier, or switch to deep-zoom tiles (IIIF/DZI) if it ever needs to go online.

## 10. A "current year" display

> "The tapestry does jump through time itself too, so some kind of 'current year' display would be useful."

**Status: done** (`data/dates.js`).
- **Year readout:** a large year sits on the map with the specific date under it (e.g. "Night of 27–28 September 1066"). It flashes when the year changes.
- **The needle** label shows the scene and the year.
- **Time-jump flags** on the strip mark where the tapestry leaps:
  - about a year forward at scene 26
  - backwards for Edward's death (26–28 run in reverse)
  - forward again to the coronation
  - the skipped six-week wait before the crossing

## 11. A bias layer

> "The 'bias' element: who would care about a particular panel? There are key (well documented) moments where a panel might be drawn/overridden by particular interested parties. Would be cool if these could be flagged clearly too as another overlay."

**Status: done.** The *Who shaped this?* toggle (`data/bias.json`, 28 sourced entries).
- **Parties:**
  - Bishop Odo, the likely patron, and his named Kentish tenants Turold, Wadard and Vital.
  - The Norman case: the oath, Stigand, the comet, Harold's death as judgement.
  - The English designers and embroiderers: Harold's heroism in Brittany, the ambiguous deathbed, "HAROLD REX", English spellings, the border fables.
  - Eustace of Boulogne.
  - The restorers: the arrow in Harold's eye is likely a 19th-century addition, and the final caption and ending are restored.
  - Later users: Napoleon's 1803–04 display, and the Nazi Ahnenerbe study.
- **On the strip:** coloured tags along the top. Solid tags are documented and hatched tags are argued.
- **In the panel:** each tag's text with its source link, plus a section for agendas that apply to the whole tapestry.
- **Genuine disputes are noted in the entries:** Odo vs Eustace as patron, whether the arrow is original, where the oath took place, and whether the English touches are subversive or just part of the Norman story.

## 12. This document

> "Write all my notes/questions from this session into a big 'summary of asks' md doc."

**Status: you're reading it.**

---

## Open ideas / next steps

1. **Clickable characters** (ask 7): build the annotation mode, then optionally a subagent vision pass to pre-fill boxes.
2. **More penis locations:** a subagent image pass for the 85 unplaced horses, run in subagent context only.
3. **Missing rivers:** hand-draw the Couesnon, Rance, Dives and Yorkshire Ouse, which aren't in Natural Earth.
4. **Highlight disputed places on the map:** show a fuzzy area instead of a point where the place is uncertain (the Ponthieu landing, Harold's return port, the English ship's landfall).
5. **Lost ending:** add a placeholder "lost scenes" section after 58, showing William's coronation as a not-embroidered node.
6. **Reading mode:** auto-play paced by the length of each scene's text, for passive viewing.
