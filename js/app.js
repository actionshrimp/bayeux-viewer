/* Bayeux Journeys: a scrolling tapestry strip that drives a map of the journeys.
 *
 * Coordinates used throughout:
 *  - strip px: position along the continuous tapestry at its native 480px height
 *    (img/tapestry/strip.json). Multiply by `stripScale` for screen px.
 *  - p (story position): p = n on the museum's painted marker for scene n, fractional between.
 *  - base xy: map projection space (nominal 1000 x 800); the d3 zoom transform maps it to screen.
 */
(async function () {
  'use strict';

  const B = window.BAYEUX;
  const $ = (id) => document.getElementById(id);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let strip, scenes, topo, pen, bias, hiManifest;
  try {
    [strip, scenes, topo, pen, bias] = await Promise.all([
      getJSON('img/tapestry/strip.json'),
      getJSON('data/scenes.json'),
      getJSON('data/basemap.topo.json'),
      getJSON('data/penises.json').catch(() => null),
      getJSON('data/bias.json').catch(() => null),
    ]);
    hiManifest = await getJSON('img/tapestry/hi/manifest.json').catch(() => null);
  } catch (err) {
    document.body.innerHTML = `<p style="padding:24px;font:16px system-ui">Could not load the data files (${err.message}).
      Browsers block these when the page is opened straight from disk, so serve the folder instead:
      <code>python3 -m http.server 8000</code> and open <a href="http://localhost:8000">localhost:8000</a>.</p>`;
    return;
  }

  async function getJSON(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
    return r.json();
  }

  const sceneByN = new Map(scenes.map((s) => [s.n, s]));
  const journeyById = new Map(B.journeys.map((j) => [j.id, j]));
  const N_SCENES = 58;

  /* ---------------------------------------------------------------- markers */
  // Each Commons image starts at the painted marker of the scene before its first scene,
  // so image k's left edge is marker (k.scenes[0] - 1). Gaps (combined images) are interpolated.
  const marker = new Array(N_SCENES + 2).fill(null);
  marker[0] = 0;
  strip.images.forEach((im, i) => { if (i > 0) marker[im.scenes[0] - 1] = im.x; });
  const last = strip.images[strip.images.length - 1];
  marker[N_SCENES] = last.x + last.width * 0.55;
  marker[N_SCENES + 1] = strip.total;
  for (let s = 1; s <= N_SCENES; s++) {
    if (marker[s] == null) marker[s] = (marker[s - 1] + marker[s + 1]) / 2;
  }

  function pFromX(x) {
    if (x <= 0) return 0;
    for (let s = 0; s <= N_SCENES; s++) {
      if (x < marker[s + 1]) return s + (x - marker[s]) / (marker[s + 1] - marker[s]);
    }
    return N_SCENES + 1;
  }
  function xFromP(p) {
    p = Math.max(0, Math.min(N_SCENES + 1, p));
    const s = Math.min(N_SCENES, Math.floor(p));
    return marker[s] + (p - s) * (marker[s + 1] - marker[s]);
  }
  const sceneAt = (p) => Math.max(1, Math.min(N_SCENES, Math.round(p)));
  const journeyForScene = (n) => B.journeys.find((j) => n >= j.scenes[0] && n <= j.scenes[1]) || B.journeys[0];

  /* ---------------------------------------------------------------- map setup */
  const BASE_W = 1000, BASE_H = 800;
  const projection = d3.geoConicConformal().parallels([49, 58]).rotate([-1, 0])
    .fitExtent([[0, 0], [BASE_W, BASE_H]], {
      type: 'MultiPoint', coordinates: [[-7, 47.3], [12, 47.3], [-7, 62], [12, 62]],
    });
  const geoPath = d3.geoPath(projection);
  const P = (lonlat) => projection(lonlat);

  const svg = d3.select('#map');
  const gGeo = svg.append('g');
  const gOver = svg.append('g');

  const land = topojson.feature(topo, topo.objects.land);
  // One path per landmass: merged into a single path, rings of different polygons can cancel
  // each other out under the nonzero fill rule (Great Britain vanished that way).
  gGeo.selectAll('path.land').data(land.features).join('path').attr('class', 'land').attr('d', geoPath);
  if (topo.objects.lakes) gGeo.selectAll('path.lake').data(topojson.feature(topo, topo.objects.lakes).features).join('path').attr('class', 'lake').attr('d', geoPath);
  if (topo.objects.rivers) gGeo.append('path').attr('class', 'river').attr('d', geoPath(topojson.feature(topo, topo.objects.rivers)));

  // Layers drawn in screen space so stitch dashes, labels and markers keep their size when zooming.
  const gRegions = gOver.append('g');
  const gContext = gOver.append('g').attr('display', 'none');
  const gRoutes = gOver.append('g');
  const gSide = gOver.append('g');
  const gObst = gOver.append('g');
  const gPlaces = gOver.append('g');
  const gTraveller = gOver.append('g').attr('class', 'traveller');

  // Hidden base-space paths let us sample smooth curves along each leg.
  const sampler = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  const smooth = d3.line().curve(d3.curveCatmullRom.alpha(0.5));
  function sampleCurve(lonlats, n = 48) {
    const pts = lonlats.map(P);
    if (pts.length < 2 || (pts.length === 2 && pts[0][0] === pts[1][0] && pts[0][1] === pts[1][1])) return [pts[0], pts[0]];
    sampler.setAttribute('d', smooth(pts));
    const L = sampler.getTotalLength();
    return d3.range(n + 1).map((i) => { const q = sampler.getPointAtLength((L * i) / n); return [q.x, q.y]; });
  }

  // Legs: one per consecutive pair of stops.
  const legs = [];
  B.journeys.forEach((j, ji) => {
    j.index = ji;
    j.legs = [];
    for (let i = 1; i < j.stops.length; i++) {
      const a = j.stops[i - 1], b = j.stops[i];
      const lonlats = [B.places[a.place].lonlat, ...(b.via || []), B.places[b.place].lonlat];
      const leg = {
        id: `${j.id}-${i}`, journey: j, from: a, to: b,
        mode: b.gap ? 'gap' : (b.mode || 'stay'),
        still: a.place === b.place,
        pts: sampleCurve(lonlats),
      };
      j.legs.push(leg);
      if (!leg.still) legs.push(leg);
    }
    j.sideTrips = (j.sideTrips || []).map((t) => ({
      ...t, journey: j,
      pts: sampleCurve([B.places[t.from].lonlat, ...(t.via || []), B.places[t.to].lonlat]),
    }));
  });

  // Places that appear in any journey, with the journeys and obstacles that touch them.
  const places = Object.entries(B.places).map(([id, pl]) => ({ id, ...pl, xy: P(pl.lonlat), journeys: new Set() }));
  const placeById = new Map(places.map((p) => [p.id, p]));
  B.journeys.forEach((j) => j.stops.forEach((s) => placeById.get(s.place).journeys.add(j.id)));
  const obstacles = scenes.filter((s) => s.obstacle && s.place && placeById.has(s.place));

  /* ---------------------------------------------------------------- zoom */
  let T = d3.zoomIdentity;
  let follow = true;
  const zoom = d3.zoom().scaleExtent([0.4, 60]).on('zoom', (ev) => {
    T = ev.transform;
    gGeo.attr('transform', T);
    if (ev.sourceEvent && follow) setFollow(false);
    drawOverlay();
  });
  svg.call(zoom).on('dblclick.zoom', null);

  function boundsOf(points) {
    const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
    return [[d3.min(xs), d3.min(ys)], [d3.max(xs), d3.max(ys)]];
  }
  function zoomTo(points, { maxK = 14, pad = 0.18, duration = 1100 } = {}) {
    const el = svg.node();
    const W = el.clientWidth, H = el.clientHeight;
    if (!W || !H) return;
    const [[x0, y0], [x1, y1]] = boundsOf(points);
    const dx = Math.max(x1 - x0, 4), dy = Math.max(y1 - y0, 4);
    const k = Math.min(maxK, (1 - pad * 2) * Math.min(W / dx, H / dy));
    const t = d3.zoomIdentity.translate(W / 2 - k * (x0 + x1) / 2, H / 2 - k * (y0 + y1) / 2).scale(k);
    svg.interrupt();
    if (duration && !reduceMotion) svg.transition().duration(duration).ease(d3.easeCubicInOut).call(zoom.transform, t);
    else svg.call(zoom.transform, t);
  }
  function journeyPoints(j) {
    return [...j.legs.flatMap((l) => l.pts), ...j.sideTrips.flatMap((t) => t.pts), ...j.stops.map((s) => placeById.get(s.place).xy)];
  }
  const allStoryPoints = () => [
    ...B.journeys.flatMap(journeyPoints),
    ...(showContext ? contextRoutes.flatMap((c) => c.pts) : []),
  ];

  /* ---------------------------------------------------------------- static overlay content */
  const lineScreen = d3.line();
  const scr = (pt) => T.apply(pt);

  const regionSel = gRegions.selectAll('text').data(B.regions).join('text')
    .attr('class', 'region-label').text((d) => d.name);

  const contextRoutes = B.context.map((c) => ({ ...c, pts: sampleCurve(c.points, 120) }));
  const ctxPaths = gContext.selectAll('path').data(contextRoutes).join('path')
    .attr('class', 'context-route').style('stroke', (d) => d.color);
  const ctxLabels = gContext.selectAll('text')
    .data(contextRoutes.flatMap((c) => c.labels.map(([ll, text]) => ({ xy: P(ll), text }))))
    .join('text').attr('class', 'context-label').attr('dx', 7).attr('dy', 4).text((d) => d.text);
  ctxPaths.append('title').text((d) => `${d.name} (${d.date}). ${d.summary}`);

  const legSel = gRoutes.selectAll('g.leg').data(legs, (d) => d.id).join('g').attr('class', 'leg');
  legSel.append('path').attr('class', (d) => `route ${d.mode} route-ahead`).style('stroke', (d) => d.journey.color);
  legSel.append('path').attr('class', (d) => `route ${d.mode} route-done`).style('stroke', (d) => d.journey.color);

  const sideTrips = B.journeys.flatMap((j) => j.sideTrips);
  const sideSel = gSide.selectAll('path').data(sideTrips).join('path')
    .attr('class', 'side-trip').style('stroke', (d) => d.journey.color);

  const obstSel = gObst.selectAll('path').data(obstacles).join('path')
    .attr('class', 'obstacle-mark').attr('d', 'M0,-6L6,0L0,6L-6,0Z');
  obstSel.append('title').text((d) => `Scene ${d.n}: ${d.obstacle}`);

  const placeSel = gPlaces.selectAll('g.place').data(places.filter((p) => p.journeys.size)).join('g').attr('class', 'place');
  placeSel.filter((d) => !d.sea).append('circle').attr('class', 'pulse').attr('r', 6).attr('opacity', 0);
  placeSel.filter((d) => !d.sea).append('circle').attr('class', 'place-dot').attr('r', 4);
  const LABEL_POS = {
    'below-left': { dx: -6, dy: 16, anchor: 'end' },
    'below': { dx: 0, dy: 18, anchor: 'middle' },
    'left': { dx: -8, dy: 4, anchor: 'end' },
  };
  const labelPos = (d) => LABEL_POS[d.label] || (d.sea ? { dx: 0, dy: 4, anchor: 'middle' } : { dx: 8, dy: 4, anchor: 'start' });
  placeSel.append('text').attr('class', (d) => `place-label${d.sea ? ' sea-label' : ''}`)
    .attr('dx', (d) => labelPos(d).dx).attr('dy', (d) => labelPos(d).dy).attr('text-anchor', (d) => labelPos(d).anchor)
    .text((d) => d.name);
  placeSel.append('title').text((d) => d.note || d.name);

  gTraveller.append('circle').attr('class', 'halo').attr('r', 14);
  gTraveller.append('circle').attr('class', 'core').attr('r', 8);
  const travellerGlyph = gTraveller.append('path');
  const GLYPH = {
    sea: 'M-4.5,1.2h9l-2,2.8h-5z M-0.5,-4.8v6h1v-6z M0.8,-4.2l3.4,4.4h-3.4z',
    land: 'M-2.4,0a2.4,2.4 0 1,0 4.8,0a2.4,2.4 0 1,0 -4.8,0',
  };

  /* ---------------------------------------------------------------- state + overlay drawing */
  let p = 1;
  let currentScene = 0;
  let currentJourney = null;
  let showContext = false;

  function pointOnLeg(leg, f) {
    const pts = leg.pts, n = pts.length - 1;
    const t = Math.max(0, Math.min(1, f)) * n, i = Math.min(n - 1, Math.floor(t)), r = t - i;
    return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * r, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * r];
  }
  // Where the journey's traveller is at story position p, and on which leg.
  function travellerAt(j, pp) {
    const st = j.stops;
    if (pp <= st[0].at) return { xy: placeById.get(st[0].place).xy, leg: j.legs[0], f: 0 };
    for (const leg of j.legs) {
      if (pp <= leg.to.at) {
        const f = (pp - leg.from.at) / (leg.to.at - leg.from.at || 1);
        return { xy: pointOnLeg(leg, f), leg, f };
      }
    }
    const lastLeg = j.legs[j.legs.length - 1];
    return { xy: placeById.get(st[st.length - 1].place).xy, leg: lastLeg, f: 1 };
  }
  function legProgress(leg, pp) {
    const j = leg.journey;
    if (j.index < currentJourney.index) return 1;
    if (j.index > currentJourney.index) return 0;
    return Math.max(0, Math.min(1, (pp - leg.from.at) / (leg.to.at - leg.from.at || 1)));
  }

  function drawOverlay() {
    if (!currentJourney) return;
    regionSel.attr('transform', (d) => `translate(${scr(P(d.lonlat))})`);

    legSel.each(function (leg) {
      const g = d3.select(this);
      const prog = legProgress(leg, p);
      const isActive = leg.journey === currentJourney;
      const ptsS = leg.pts.map(scr);
      const n = ptsS.length - 1, cut = prog * n, i = Math.floor(cut);
      let done = ptsS.slice(0, i + 1);
      if (prog > 0 && i < n) done.push(pointOnLeg({ pts: ptsS }, prog));
      g.select('.route-ahead').attr('d', lineScreen(ptsS))
        .style('opacity', isActive ? 0.42 : leg.journey.index < currentJourney.index ? 0.3 : 0.16);
      g.select('.route-done').attr('d', prog > 0 && done.length > 1 ? lineScreen(done) : null)
        .style('opacity', isActive ? 1 : 0.3);
    });

    sideSel.attr('d', (d) => lineScreen(d.pts.map(scr)))
      .classed('on', (d) => d.journey === currentJourney && p >= d.scenes[0] && p <= d.scenes[1]);

    obstSel.attr('transform', (d) => {
      const [x, y] = scr(placeById.get(d.place).xy);
      return `translate(${x - 9},${y - 11})`;
    }).attr('display', (d) => (journeyForScene(d.n) === currentJourney ? null : 'none'));

    const curPlace = sceneByN.get(currentScene)?.place;
    placeSel.attr('transform', (d) => `translate(${scr(d.xy)})`)
      .classed('inactive', (d) => !d.journeys.has(currentJourney.id))
      .classed('is-current', (d) => d.id === curPlace)
      .style('--c', currentJourney.color);
    placeSel.select('text').attr('display', (d) =>
      d.journeys.has(currentJourney.id) || d.id === curPlace ? null : 'none');

    if (showContext) {
      ctxPaths.attr('d', (d) => lineScreen(d.pts.map(scr)));
      ctxLabels.attr('x', (d) => scr(d.xy)[0]).attr('y', (d) => scr(d.xy)[1]);
    }

    const tr = travellerAt(currentJourney, p);
    const moving = tr.leg && !tr.leg.still && tr.f > 0 && tr.f < 1;
    const mode = tr.leg && (tr.leg.mode === 'sea' || tr.leg.mode === 'gap') && moving ? 'sea' : 'land';
    gTraveller.attr('transform', `translate(${scr(tr.xy)})`).style('--c', currentJourney.color);
    travellerGlyph.attr('d', GLYPH[mode]);
  }

  // A gentle pulse on the current scene's place.
  function pulsePlace() {
    if (reduceMotion) return;
    placeSel.select('.pulse').interrupt().attr('r', 6).attr('opacity', 0)
      .filter((d) => d.id === sceneByN.get(currentScene)?.place)
      .attr('opacity', 0.9).transition().duration(1400).ease(d3.easeCubicOut).attr('r', 22).attr('opacity', 0);
  }

  /* ---------------------------------------------------------------- panel */
  const PENIS_Y = { 'upper border': 0.31, 'main frieze': 0.6, 'lower border': 0.83 };
  const penisEntries = pen?.entries || [];
  const penisByScene = d3.group(penisEntries, (e) => e.scene);

  function renderPanel() {
    const s = sceneByN.get(currentScene);
    const j = currentJourney;
    const panel = $('panel');
    panel.style.setProperty('--c', j.color);
    $('p-jdate').textContent = j.date;
    $('p-jname').textContent = j.name;
    $('p-jsummary').textContent = j.summary;
    $('p-num').textContent = s.n;
    const pl = s.place && B.places[s.place];
    $('p-place').textContent = pl ? pl.name : 'Place not shown';
    $('p-title').textContent = s.title;
    $('p-latin').textContent = s.latin;
    $('p-english').textContent = `“${s.english}”`;
    $('p-summary').textContent = s.summary;
    $('p-obstacle').hidden = !s.obstacle;
    $('p-obstacle').textContent = s.obstacle || '';
    $('p-details').replaceChildren(...(s.details || []).map((d) => {
      const li = document.createElement('li'); li.textContent = d; return li;
    }));
    const pe = penisByScene.get(s.n);
    const pn = $('p-penis');
    pn.hidden = !(showPenis && pe);
    if (pe) pn.textContent = pe.map((e) => e.note).join(' ');

    renderBias(s.n);

    const gapLeg = j.legs.find((l) => l.mode === 'gap');
    const inGap = gapLeg && p >= gapLeg.from.at - 1 && p <= gapLeg.to.at + 0.6;
    $('p-gap').hidden = !(inGap && j.gapNote);
    $('p-gap').textContent = j.gapNote || '';

    document.querySelectorAll('.jtab').forEach((b) => b.classList.toggle('is-active', b.dataset.id === j.id));
    const dt = dateFor(s.n);
    $('needle-label').textContent = `Scene ${s.n} · ${dt.year}`;
    if ($('when-year').textContent !== dt.year) {
      $('when').classList.remove('flash'); void $('when').offsetWidth; $('when').classList.add('flash');
    }
    $('when-year').textContent = dt.year;
    $('when-text').textContent = dt.when;
    $('when').title = [dt.note, dt.jump].filter(Boolean).join(' ');
    updateWhy();
    updatePenisCount();
    try { history.replaceState(null, '', `#scene-${s.n}`); } catch (e) { /* file:// or sandboxed */ }
  }

  const DATES = window.BAYEUX_DATES || [];
  const dateFor = (n) => DATES.find((d) => n >= d.from && n <= d.to) || { year: '', when: '' };

  /* ---------------------------------------------------------------- bias layer */
  const parties = new Map((bias?.parties || []).map((pt) => [pt.id, pt]));
  const biasEntries = bias?.entries || [];
  let showBias = false;
  function biasItem(e) {
    const pt = parties.get(e.party) || { name: e.party };
    const div = document.createElement('div');
    div.className = 'bias-item';
    div.style.setProperty('--pc', `var(--party-${e.party}, var(--ink-soft))`);
    const head = document.createElement('div');
    const who = document.createElement('span'); who.className = 'who'; who.textContent = pt.name;
    who.title = pt.blurb || '';
    const st = document.createElement('span'); st.className = 'strength';
    st.textContent = e.strength === 'documented' ? 'documented' : 'argued';
    st.title = e.strength === 'documented' ? 'A recorded fact, such as a named person or a recorded restoration' : 'A scholarly interpretation';
    head.append(who, st);
    const h = document.createElement('b'); h.textContent = e.title;
    const t = document.createElement('p'); t.textContent = e.text;
    const src = document.createElement('p'); src.className = 'src';
    const url = (e.source || '').match(/https?:\/\/\S+/);
    if (url) {
      src.append(e.source.slice(0, url.index).replace(/[:\s]+$/, ''), ' ');
      const a = document.createElement('a'); a.href = url[0]; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'source';
      src.append(a);
    } else src.textContent = e.source || '';
    div.append(head, h, t, src);
    return div;
  }
  function renderBias(n) {
    $('p-bias').hidden = !showBias || !bias;
    if (!showBias || !bias) return;
    const here = biasEntries.filter((e) => e.scenes && n >= e.scenes[0] && n <= e.scenes[1]);
    const list = $('p-bias-list');
    if (here.length) list.replaceChildren(...here.map(biasItem));
    else {
      const pnone = document.createElement('p'); pnone.className = 'bias-none';
      pnone.textContent = 'No documented agenda flagged for this scene. Scroll to a coloured tag on the tapestry.';
      list.replaceChildren(pnone);
    }
    if (!$('p-bias-whole').childElementCount) {
      $('p-bias-whole').append(...biasEntries.filter((e) => !e.scenes).map(biasItem));
    }
  }

  /* ---------------------------------------------------------------- journey tabs */
  B.journeys.forEach((j) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'jtab'; b.dataset.id = j.id;
    b.style.setProperty('--c', j.color);
    b.innerHTML = '<i></i>';
    b.append(j.short || j.name);
    b.title = `${j.name}, ${j.date} · scenes ${j.scenes[0]}–${j.scenes[1]}`;
    b.addEventListener('click', () => goToScene(j.scenes[0]));
    $('journey-tabs').append(b);
  });

  /* ---------------------------------------------------------------- strip */
  const stripEl = $('strip');
  const inner = $('strip-inner');
  const imgLayer = $('strip-images');
  const overlay = $('strip-overlay');
  let stripScale = 1;

  const tiles = strip.images.map((im, i) => {
    const next = strip.images[i + 1];
    const tile = document.createElement('div');
    tile.className = 'tile';
    const img = document.createElement('img');
    img.src = `img/tapestry/${im.file}`;
    img.alt = `Bayeux Tapestry, scene${im.scenes.length > 1 ? 's' : ''} ${im.scenes.join(' and ')}`;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.draggable = false;
    tile.append(img);
    imgLayer.append(tile);
    return { tile, img, x: im.x, w: next ? next.x - im.x : im.width, imgW: im.width };
  });

  // Journey colour bands along the bottom edge, the not-embroidered gap flag, penis markers.
  const bands = B.journeys.map((j) => {
    const band = document.createElement('div');
    band.className = 'jband'; band.style.setProperty('--c', j.color);
    const label = document.createElement('div');
    label.className = 'jband-label'; label.textContent = j.name;
    overlay.append(band, label);
    return { j, band, label };
  });
  const gapFlags = B.journeys.flatMap((j) => j.legs.filter((l) => l.mode === 'gap').map((l) => {
    const el = document.createElement('div');
    el.className = 'gap-flag';
    el.textContent = `Not embroidered: ${B.places[l.from.place].name} → ${B.places[l.to.place].name}`;
    el.title = j.gapNote || '';
    overlay.append(el);
    return { el, at: (l.from.at + l.to.at) / 2 };
  }));
  const jumpFlags = DATES.filter((d) => d.jump).map((d) => {
    const el = document.createElement('div');
    el.className = 'time-jump';
    el.textContent = d.jump;
    overlay.append(el);
    return { el, at: d.from - 0.5 };
  });
  // Bias tags along the top of the strip, packed into rows so overlapping ranges don't collide.
  const btags = biasEntries.filter((e) => e.scenes).map((e) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `btag${e.strength === 'documented' ? '' : ' argued'}`;
    el.style.setProperty('--pc', `var(--party-${e.party}, #666)`);
    el.textContent = `${parties.get(e.party)?.short || e.party}: ${e.title}`;
    el.title = `${parties.get(e.party)?.name || e.party} (${e.strength}). ${e.text}`;
    el.tabIndex = -1;
    el.addEventListener('click', (ev) => { ev.stopPropagation(); stopPlay(); goToScene(Math.round((e.scenes[0] + e.scenes[1]) / 2)); });
    el.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    overlay.append(el);
    return { el, e, row: 0 };
  });
  const rowEnds = [];
  btags.sort((a, b) => a.e.scenes[0] - b.e.scenes[0]).forEach((t) => {
    const a = t.e.scenes[0] - 0.45;
    let r = rowEnds.findIndex((end) => end <= a);
    if (r < 0) { r = rowEnds.length; rowEnds.push(0); }
    rowEnds[r] = t.e.scenes[1] + 0.45;
    t.row = r;
  });
  const pmarks = penisEntries.map((e) => {
    const el = document.createElement('div');
    if (e.pos == null && (e.count || 1) > 1) {
      el.className = 'pband';
    } else {
      el.className = `pmark${e.confidence === 'likely' ? ' likely' : ''}`;
      if ((e.count || 1) > 1) { const b = document.createElement('b'); b.textContent = e.count; el.append(b); }
    }
    el.title = `Scene ${e.scene}: ${e.note}`;
    overlay.append(el);
    return { el, e };
  });

  const ZOOMS = [1, 1.5, 2, 3, 4];
  let zoomLevel = 0;
  function layoutStrip() {
    const keepP = p;
    const H = stripEl.clientHeight, W = stripEl.clientWidth;
    const z = ZOOMS[zoomLevel];
    stripScale = (H / strip.height) * z;
    const imgH = strip.height * stripScale;
    const half = W / 2;
    stripEl.classList.toggle('zoomed', z > 1);
    inner.style.width = `${strip.total * stripScale + W}px`;
    inner.style.height = `${imgH}px`;
    inner.style.setProperty('--img-h', `${imgH}px`);
    imgLayer.style.left = overlay.style.left = `${half}px`;
    imgLayer.style.right = overlay.style.right = 'auto';
    imgLayer.style.width = overlay.style.width = `${strip.total * stripScale}px`;
    tiles.forEach((t) => {
      t.tile.style.left = `${t.x * stripScale}px`;
      t.tile.style.width = `${Math.ceil(t.w * stripScale) + 1}px`;
      t.img.style.width = `${t.imgW * stripScale}px`;
    });
    bands.forEach(({ j, band, label }) => {
      const x0 = xFromP(j.scenes[0] - 0.5) * stripScale, x1 = xFromP(j.scenes[1] + 0.5) * stripScale;
      band.style.left = label.style.left = `${x0}px`;
      band.style.width = `${x1 - x0}px`;
    });
    gapFlags.forEach(({ el, at }) => { el.style.left = `${xFromP(at) * stripScale}px`; });
    jumpFlags.forEach(({ el, at }) => { el.style.left = `${xFromP(at) * stripScale}px`; });
    btags.forEach(({ el, e, row }) => {
      const a = xFromP(e.scenes[0] - 0.45) * stripScale, b = xFromP(e.scenes[1] + 0.45) * stripScale;
      el.style.left = `${a}px`;
      el.style.width = `${Math.max(90, b - a)}px`;
      el.style.top = `${imgH * 0.05 + row * 21}px`;
    });
    pmarks.forEach(({ el, e }) => {
      const a = xFromP(e.scene - 0.5), b = xFromP(e.scene + 0.5);
      const y = PENIS_Y[e.where] ?? 0.83;
      if (el.className === 'pband') {
        el.style.left = `${a * stripScale}px`; el.style.width = `${(b - a) * stripScale}px`;
        el.style.top = `${(y - 0.06) * imgH}px`;
      } else {
        el.style.left = `${(a + (e.pos ?? 0.5) * (b - a)) * stripScale}px`;
        el.style.top = `${y * imgH}px`;
      }
    });
    layoutOverview();
    stripEl.scrollLeft = xFromP(keepP) * stripScale;
    stripEl.scrollTop = (imgH - H) / 2;
    loadHiTiles();
  }

  // Swap in the 1200px tier for on-screen tiles once the 480px images would be upscaled.
  const hiByFile = new Map((hiManifest || []).map((m) => [m.file, m]));
  function loadHiTiles() {
    if (!hiByFile.size) return;
    // Keep already-loaded hi-res images sized to the current zoom, even when zoomed back out.
    tiles.forEach((t) => { if (t.hi) t.hi.style.width = t.img.style.width; });
    const needHi = stripScale * (window.devicePixelRatio || 1) > 1.15;
    if (!needHi) return;
    const W = stripEl.clientWidth;
    const viewL = (stripEl.scrollLeft - W / 2 - W) / stripScale, viewR = (stripEl.scrollLeft + W / 2 + W) / stripScale;
    tiles.forEach((t, i) => {
      if (t.hi || t.x + t.w < viewL || t.x > viewR) return;
      const file = strip.images[i].file;
      if (!hiByFile.has(file)) return;
      const img = document.createElement('img');
      img.className = 'hi';
      img.alt = '';
      img.decoding = 'async';
      img.draggable = false;
      img.style.width = t.img.style.width;
      img.onload = () => img.classList.add('ready');
      img.src = `img/tapestry/hi/${file}`;
      t.tile.append(img);
      t.hi = img;
    });
    tiles.forEach((t) => { if (t.hi) t.hi.style.width = t.img.style.width; });
  }

  function setZoom(level) {
    level = Math.max(0, Math.min(ZOOMS.length - 1, level));
    if (level === zoomLevel) return;
    zoomLevel = level;
    layoutStrip();
    $('btn-zoom-in').disabled = zoomLevel === ZOOMS.length - 1;
    $('btn-zoom-out').disabled = zoomLevel === 0;
  }
  $('btn-zoom-in').addEventListener('click', () => setZoom(zoomLevel + 1));
  $('btn-zoom-out').addEventListener('click', () => setZoom(zoomLevel - 1));

  /* overview bar */
  const ov = $('overview');
  const ovWin = $('overview-window');
  B.journeys.forEach((j) => {
    const seg = document.createElement('div');
    seg.className = 'ov-seg'; seg.style.setProperty('--c', j.color);
    seg.dataset.a = j.scenes[0] - 0.5; seg.dataset.b = j.scenes[1] + 0.5;
    seg.title = j.name;
    ov.append(seg);
  });
  for (let s = 1; s <= N_SCENES; s++) {
    const t = document.createElement('div'); t.className = 'ov-tick'; t.dataset.p = s; ov.append(t);
  }
  penisEntries.forEach((e) => {
    const d = document.createElement('div'); d.className = 'ov-p'; d.dataset.p = e.scene; ov.append(d);
  });
  function layoutOverview() {
    const w = ov.clientWidth, k = w / strip.total;
    ov.querySelectorAll('.ov-seg').forEach((el) => {
      const a = xFromP(+el.dataset.a) * k, b = xFromP(+el.dataset.b) * k;
      el.style.left = `${a}px`; el.style.width = `${b - a}px`;
    });
    ov.querySelectorAll('[data-p]').forEach((el) => { el.style.left = `${xFromP(+el.dataset.p) * k}px`; });
  }
  function updateOverviewWindow() {
    const k = ov.clientWidth / strip.total;
    const viewW = stripEl.clientWidth / stripScale;
    const cx = stripEl.scrollLeft / stripScale;
    ovWin.style.left = `${(cx - viewW / 2) * k}px`;
    ovWin.style.width = `${viewW * k}px`;
  }
  function overviewSeek(ev) {
    const r = ov.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width) * strip.total;
    stopPlay();
    stripEl.scrollLeft = x * stripScale;
  }
  ov.addEventListener('pointerdown', (ev) => {
    ov.setPointerCapture(ev.pointerId);
    overviewSeek(ev);
    const move = (e) => overviewSeek(e);
    ov.addEventListener('pointermove', move);
    ov.addEventListener('pointerup', () => ov.removeEventListener('pointermove', move), { once: true });
  });

  /* scroll → story position */
  let rafPending = false;
  stripEl.addEventListener('scroll', () => {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => { rafPending = false; onScroll(); });
  }, { passive: true });

  function onScroll() {
    p = pFromX(stripEl.scrollLeft / stripScale);
    const s = sceneAt(p);
    const j = journeyForScene(s);
    const journeyChanged = j !== currentJourney;
    currentJourney = j;
    if (journeyChanged && follow) zoomTo(journeyPoints(j));
    if (s !== currentScene) {
      currentScene = s;
      renderPanel();
      pulsePlace();
    }
    drawOverlay();
    updateOverviewWindow();
    loadHiTiles();
  }

  function goToScene(n, smooth = true) {
    n = Math.max(1, Math.min(N_SCENES, n));
    stripEl.scrollTo({ left: xFromP(n) * stripScale, behavior: smooth && !reduceMotion ? 'smooth' : 'auto' });
  }

  // Vertical wheel scrolls the strip sideways.
  let wheelZoomAcc = 0;
  stripEl.addEventListener('wheel', (ev) => {
    if (ev.ctrlKey) {
      // Trackpad pinch arrives as ctrl+wheel.
      ev.preventDefault();
      wheelZoomAcc += ev.deltaY;
      if (Math.abs(wheelZoomAcc) > 40) { setZoom(zoomLevel + (wheelZoomAcc < 0 ? 1 : -1)); wheelZoomAcc = 0; }
      return;
    }
    if (zoomLevel > 0 && ev.shiftKey) return; // shift+wheel pans vertically when zoomed
    if (Math.abs(ev.deltaY) > Math.abs(ev.deltaX)) {
      ev.preventDefault();
      stopPlay();
      stripEl.scrollLeft += ev.deltaY * (ev.deltaMode === 1 ? 32 : 1);
    }
  }, { passive: false });

  // Mouse drag to pan (touch already scrolls natively).
  stripEl.addEventListener('pointerdown', (ev) => {
    if (ev.pointerType !== 'mouse' || ev.button !== 0) return;
    stopPlay();
    const x0 = ev.clientX, s0 = stripEl.scrollLeft, y0 = ev.clientY, t0 = stripEl.scrollTop;
    stripEl.classList.add('dragging');
    stripEl.setPointerCapture(ev.pointerId);
    const move = (e) => { stripEl.scrollLeft = s0 - (e.clientX - x0); stripEl.scrollTop = t0 - (e.clientY - y0); };
    const up = () => {
      stripEl.classList.remove('dragging');
      stripEl.removeEventListener('pointermove', move);
    };
    stripEl.addEventListener('pointermove', move);
    stripEl.addEventListener('pointerup', up, { once: true });
    stripEl.addEventListener('pointercancel', up, { once: true });
  });

  /* play */
  let playing = false, lastT = 0;
  const PLAY_SPEED = 70; // native strip px per second
  function tick(t) {
    if (!playing) return;
    const dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0;
    lastT = t;
    stripEl.scrollLeft += PLAY_SPEED * stripScale * dt;
    if (stripEl.scrollLeft >= stripEl.scrollWidth - stripEl.clientWidth - 1) { stopPlay(); return; }
    requestAnimationFrame(tick);
  }
  function startPlay() {
    playing = true; lastT = 0;
    $('btn-play').textContent = '❚❚'; $('btn-play').setAttribute('aria-label', 'Pause');
    requestAnimationFrame(tick);
  }
  function stopPlay() {
    if (!playing) return;
    playing = false;
    $('btn-play').textContent = '▶'; $('btn-play').setAttribute('aria-label', 'Play');
  }
  $('btn-play').addEventListener('click', () => (playing ? stopPlay() : startPlay()));
  $('btn-prev').addEventListener('click', () => { stopPlay(); goToScene(currentScene - 1); });
  $('btn-next').addEventListener('click', () => { stopPlay(); goToScene(currentScene + 1); });

  document.addEventListener('keydown', (ev) => {
    if (ev.target.closest('input, textarea, select')) return;
    if (ev.key === 'ArrowRight') { ev.preventDefault(); stopPlay(); goToScene(currentScene + 1); }
    else if (ev.key === 'ArrowLeft') { ev.preventDefault(); stopPlay(); goToScene(currentScene - 1); }
    else if (ev.key === ' ' && !ev.target.closest('button')) { ev.preventDefault(); playing ? stopPlay() : startPlay(); }
    else if (ev.key === '+' || ev.key === '=') setZoom(zoomLevel + 1);
    else if (ev.key === '-' || ev.key === '_') setZoom(zoomLevel - 1);
    else if (ev.key === 'Home') { stopPlay(); goToScene(1); }
    else if (ev.key === 'End') { stopPlay(); goToScene(N_SCENES); }
  });

  /* ---------------------------------------------------------------- map controls + toggles */
  function setFollow(on) {
    follow = on;
    $('btn-follow').classList.toggle('is-on', on);
    $('btn-follow').setAttribute('aria-pressed', String(on));
  }
  $('btn-follow').addEventListener('click', () => { setFollow(true); zoomTo(journeyPoints(currentJourney)); });
  $('btn-overview').addEventListener('click', () => { setFollow(false); zoomTo(allStoryPoints()); });

  $('toggle-context').addEventListener('change', (ev) => {
    showContext = ev.target.checked;
    gContext.attr('display', showContext ? null : 'none');
    if (showContext) { setFollow(false); zoomTo(allStoryPoints()); }
    else { setFollow(true); zoomTo(journeyPoints(currentJourney)); }
    drawOverlay();
  });

  let showPenis = false;
  function updatePenisCount() {
    const el = $('penis-count');
    if (!showPenis || !pen) { el.textContent = ''; return; }
    const seen = d3.sum(penisEntries.filter((e) => e.scene <= currentScene), (e) => e.count || 1);
    el.textContent = `${seen} / ${pen.total}`;
    el.title = `${seen} located so far. George Garnett counted ${pen.total} in all (${pen.horses} on horses, ${pen.humans} on men).`;
  }
  $('toggle-penis').addEventListener('change', (ev) => {
    showPenis = ev.target.checked;
    document.querySelector('.tapestry').classList.toggle('show-penis', showPenis);
    renderPanel();
  });
  if (!pen) $('toggle-penis').closest('label').hidden = true;
  $('toggle-bias').addEventListener('change', (ev) => {
    showBias = ev.target.checked;
    document.querySelector('.tapestry').classList.toggle('show-bias', showBias);
    btags.forEach((t) => { t.el.tabIndex = showBias ? 0 : -1; });
    renderPanel();
  });
  if (!bias) $('toggle-bias').closest('label').hidden = true;

  /* ---------------------------------------------------------------- why it happened */
  const ARG = window.BAYEUX_ARGUMENT;
  const whyEl = $('why'), whyScroll = $('why-scroll'), whyCanvas = $('why-canvas'), whyEdges = d3.select('#why-edges');
  const LANES = ['norman', 'shown', 'english'];
  const LANE_NAMES = { norman: 'Norman reading', shown: 'In the tapestry', english: 'English reading' };
  const COL_W = 196, COL_GAP = 44, LEFT = 34, TOP = 48, NODE_GAP = 10, LANE_GAP = 26;
  const colIndex = new Map(ARG.columns.map((c, i) => [c.id, i]));
  const colLabels = ARG.columns.map((c, i) => {
    const el = document.createElement('div');
    el.className = 'why-col-label';
    el.style.left = `${LEFT + i * (COL_W + COL_GAP)}px`;
    el.style.width = `${COL_W}px`;
    el.innerHTML = `${c.label}<small></small>`;
    el.querySelector('small').textContent = c.scenes[0] >= 1 ? `scenes ${c.scenes[0]}${c.scenes[1] > c.scenes[0] ? `–${c.scenes[1]}` : ''}` : 'not embroidered';
    whyCanvas.append(el);
    return el;
  });
  const laneLabels = LANES.map((lane) => {
    const el = document.createElement('div');
    el.className = `why-lane-label lane-${lane}`;
    el.textContent = LANE_NAMES[lane];
    whyCanvas.append(el);
    return el;
  });
  const nodeById = new Map();
  ARG.nodes.forEach((n) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `wnode lane-${n.lane}${n.kind === 'context' ? ' context' : ''}${n.key ? ' key' : ''}`;
    const h = document.createElement('h4'); h.textContent = n.title;
    const t = document.createElement('p'); t.textContent = n.text;
    b.append(h, t);
    if (n.scenes) {
      const sc = document.createElement('span'); sc.className = 'wscenes';
      sc.textContent = n.scenes[0] === n.scenes[1] ? `Scene ${n.scenes[0]}` : `Scenes ${n.scenes[0]}–${n.scenes[1]}`;
      b.append(sc);
    }
    b.addEventListener('click', () => {
      const col = ARG.columns[colIndex.get(n.col)];
      stopPlay();
      goToScene(n.scenes ? n.scenes[0] : Math.max(1, col.scenes[0]));
    });
    whyCanvas.append(b);
    nodeById.set(n.id, { n, el: b });
  });

  function layoutWhy() {
    if (whyEl.hidden) return;
    // Stack nodes per (lane, column), then size each lane to its tallest stack.
    const laneH = {};
    const stacks = new Map();
    ARG.nodes.forEach((n) => {
      const key = `${n.lane}|${n.col}`;
      if (!stacks.has(key)) stacks.set(key, []);
      stacks.get(key).push(nodeById.get(n.id));
    });
    LANES.forEach((lane) => {
      laneH[lane] = d3.max(ARG.columns, (c) => d3.sum(stacks.get(`${lane}|${c.id}`) || [], (o) => o.el.offsetHeight + NODE_GAP)) || 40;
    });
    let y = TOP;
    const laneTop = {};
    LANES.forEach((lane, li) => {
      laneTop[lane] = y;
      laneLabels[li].style.top = `${y}px`;
      laneLabels[li].style.height = `${laneH[lane] - NODE_GAP}px`;
      y += laneH[lane] + LANE_GAP;
    });
    stacks.forEach((list, key) => {
      const [lane, col] = key.split('|');
      // Centre short stacks vertically in their lane so arrows stay tidy.
      const total = d3.sum(list, (o) => o.el.offsetHeight + NODE_GAP) - NODE_GAP;
      let yy = laneTop[lane] + (laneH[lane] - NODE_GAP - total) / 2;
      list.forEach((o) => {
        o.x = LEFT + colIndex.get(col) * (COL_W + COL_GAP);
        o.y = yy;
        o.w = COL_W;
        o.h = o.el.offsetHeight;
        o.el.style.left = `${o.x}px`;
        o.el.style.top = `${o.y}px`;
        yy += o.h + NODE_GAP;
      });
    });
    const W = LEFT + ARG.columns.length * (COL_W + COL_GAP);
    whyCanvas.style.width = `${W}px`;
    whyCanvas.style.height = `${y}px`;
    whyEdges.attr('width', W).attr('height', y);
    whyEdges.selectAll('path').data(ARG.edges).join('path')
      .attr('marker-end', 'url(#why-arrow)')
      .attr('d', ([a, b]) => {
        const A = nodeById.get(a), Bn = nodeById.get(b);
        const ca = colIndex.get(A.n.col), cb = colIndex.get(Bn.n.col);
        if (ca === cb) {
          const down = Bn.y > A.y;
          const x = A.x + A.w / 2 + (down ? 12 : -12);
          const y1 = down ? A.y + A.h : A.y, y2 = down ? Bn.y - 2 : Bn.y + Bn.h + 2;
          return `M${x},${y1}L${x},${y2}`;
        }
        const x1 = A.x + A.w, y1 = A.y + A.h / 2, x2 = Bn.x - 3, y2 = Bn.y + Bn.h / 2;
        const mx = (x1 + x2) / 2;
        return `M${x1},${y1}C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
      });
    if (!whyEdges.select('defs').size()) {
      whyEdges.insert('defs', ':first-child').append('marker').attr('id', 'why-arrow')
        .attr('viewBox', '0 0 8 8').attr('refX', 7).attr('refY', 4).attr('markerWidth', 7).attr('markerHeight', 7)
        .attr('orient', 'auto').append('path').attr('d', 'M0,0L8,4L0,8z').style('fill', 'var(--ink-soft)');
    }
    updateWhy(true);
  }

  let whyCol = -1;
  function updateWhy(force) {
    if (!ARG || whyEl.hidden) return;
    const s = currentScene;
    const ci = Math.max(0, ARG.columns.findIndex((c) => s >= c.scenes[0] && s <= c.scenes[1]));
    const current = new Set();
    nodeById.forEach(({ n, el }, id) => {
      const on = n.scenes ? s >= n.scenes[0] && s <= n.scenes[1] : false;
      el.classList.toggle('is-current', on);
      if (on) current.add(id);
    });
    colLabels.forEach((el, i) => el.classList.toggle('is-current', i === ci));
    whyEdges.selectAll('path:not(marker path)').classed('hot', (d) => d && (current.has(d[0]) || current.has(d[1])));
    if (ci !== whyCol || force) {
      whyCol = ci;
      const x = LEFT + ci * (COL_W + COL_GAP) + COL_W / 2 - whyScroll.clientWidth / 2;
      whyScroll.scrollTo({ left: Math.max(0, x), behavior: force || reduceMotion ? 'auto' : 'smooth' });
    }
  }

  function setView(view) {
    const why = view === 'why';
    whyEl.hidden = !why;
    document.querySelector('.map-wrap').classList.toggle('why-on', why);
    $('tab-map').classList.toggle('is-on', !why); $('tab-map').setAttribute('aria-selected', String(!why));
    $('tab-why').classList.toggle('is-on', why); $('tab-why').setAttribute('aria-selected', String(why));
    document.querySelector('.map-controls').hidden = why;
    document.querySelector('.map-legend').hidden = why;
    if (why) layoutWhy();
  }
  $('tab-map').addEventListener('click', () => setView('map'));
  $('tab-why').addEventListener('click', () => setView('why'));

  /* ---------------------------------------------------------------- boot */
  let lastStripSize = '';
  new ResizeObserver(() => {
    const size = `${stripEl.clientWidth}x${stripEl.clientHeight}`;
    if (size === lastStripSize) return;
    lastStripSize = size;
    layoutStrip(); drawOverlay();
  }).observe(stripEl);
  window.addEventListener('resize', () => layoutWhy());
  window.addEventListener('resize', () => { if (follow) zoomTo(journeyPoints(currentJourney), { duration: 0 }); });

  const m = /^#scene-(\d+)$/.exec(location.hash);
  p = m ? +m[1] : 1;
  layoutStrip();
  onScroll();
  zoomTo(journeyPoints(currentJourney), { duration: 0 });
  $('btn-zoom-out').disabled = true;
  if (location.search.includes('why')) setView('why');       // ?why opens the chart
  if (location.search.includes('penis')) $('toggle-penis').click();
  if (location.search.includes('context')) $('toggle-context').click();
  if (location.search.includes('overview')) $('btn-overview').click();
  if (location.search.includes('bias')) $('toggle-bias').click();
  const zq = /zoom=(\d)/.exec(location.search);
  if (zq) setZoom(+zq[1]);
})();
