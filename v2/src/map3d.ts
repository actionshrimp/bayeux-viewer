/* 3D map: MapLibre GL with a fully local style (Natural Earth GeoJSON, no tiles, no glyphs),
 * pitched camera that follows the traveller as the tapestry scrolls, extruded pillars for places.
 * Labels and the traveller are DOM markers so no font glyphs are needed (works offline).
 */
import maplibregl, { type GeoJSONSource, type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import type { Feature, FeatureCollection, LineString, Polygon } from 'geojson';
import topo from './data/basemap.topo.json';
import { JOURNEYS as STORY } from './data/journeys';
import {
  CONTEXT_ROUTES, JOURNEY_LEGS, LEGS, SIDE_TRIPS, journeyBounds, placeLonLat, travelledCoords, travellerAt,
} from './story';
import type { Journey, LonLat } from './types';
import { store, type State } from './store';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

function cssColor(v: string): string {
  const m = /var\((--[\w-]+)\)/.exec(v);
  if (!m) return v;
  return getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() || '#888';
}
const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function circle([lon, lat]: LonLat, km: number, n = 14): Polygon {
  const dLat = km / 111, dLon = km / (111 * Math.cos((lat * Math.PI) / 180));
  const ring = Array.from({ length: n + 1 }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [lon + Math.cos(a) * dLon, lat + Math.sin(a) * dLat];
  });
  return { type: 'Polygon', coordinates: [ring] };
}

const fc = <G extends Feature['geometry']>(features: Feature<G>[]): FeatureCollection<G> =>
  ({ type: 'FeatureCollection', features });
const line = (coords: LonLat[], props: Record<string, unknown> = {}): Feature<LineString> =>
  ({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: coords } });

const t = topo as unknown as Topology<{ land: GeometryCollection; rivers: GeometryCollection; lakes: GeometryCollection }>;
const LAND = feature(t, t.objects.land);
const RIVERS = feature(t, t.objects.rivers);
const LAKES = feature(t, t.objects.lakes);

const GLYPH = {
  sea: '<svg viewBox="-6 -6 12 12" aria-hidden="true"><path d="M-4.5,1.2h9l-2,2.8h-5z M-0.5,-4.8v6h1v-6z M0.8,-4.2l3.4,4.4h-3.4z"/></svg>',
  land: '<svg viewBox="-6 -6 12 12" aria-hidden="true"><circle r="2.4"/></svg>',
};

export class StoryMap {
  map: maplibregl.Map;
  private ready = false;
  private journey: Journey | null = null;
  private follow = true;
  private flying = false;
  private placeMarkers = new Map<string, { marker: maplibregl.Marker; el: HTMLElement }>();
  private traveller!: maplibregl.Marker;
  private travellerEl!: HTMLElement;
  private ctxMarkers: maplibregl.Marker[] = [];
  private camTarget: { center: LonLat; zoom: number; bearing: number; pitch: number } | null = null;
  private raf = 0;
  onFollowChange: (on: boolean) => void = () => {};

  constructor(container: HTMLElement) {
    this.map = new maplibregl.Map({
      container,
      style: this.style(),
      center: [0, 50],
      zoom: 5,
      pitch: 50,
      maxPitch: 75,
      attributionControl: false,
      dragRotate: true,
      pitchWithRotate: true,
      fadeDuration: 0,
    });
    this.map.addControl(new maplibregl.NavigationControl({ visualizePitch: true, showZoom: false }), 'bottom-right');
    this.map.on('load', () => {
      this.ready = true;
      this.addOverlays();
      this.update(store.get(), true);
    });
    const userMove = (e: { originalEvent?: unknown }) => { if (e.originalEvent && this.follow) this.setFollow(false); };
    this.map.on('dragstart', userMove);
    this.map.on('rotatestart', userMove);
    this.map.on('pitchstart', userMove);
    this.map.on('wheel', userMove);
    this.map.on('moveend', () => { this.flying = false; });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => this.restyle());
    new ResizeObserver(() => this.map.resize()).observe(container);
  }

  private style(): StyleSpecification {
    return {
      version: 8,
      sources: {
        land: { type: 'geojson', data: LAND },
        lakes: { type: 'geojson', data: LAKES },
        rivers: { type: 'geojson', data: RIVERS },
      },
      layers: [
        { id: 'sea', type: 'background', paint: { 'background-color': token('--sea') || '#c7cfc9' } },
        { id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': token('--linen') || '#ebe3d1', 'fill-outline-color': token('--linen-deep') || '#ddd2ba' } },
        { id: 'lakes', type: 'fill', source: 'lakes', paint: { 'fill-color': token('--sea') || '#c7cfc9' } },
        { id: 'rivers', type: 'line', source: 'rivers', paint: { 'line-color': token('--sea-line') || '#aab6b0', 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.4, 9, 1.6] } },
      ],
      sky: {
        'sky-color': token('--sky') || '#dfe6e3',
        'horizon-color': token('--paper') || '#f5f0e5',
        'sky-horizon-blend': 0.6,
        'horizon-fog-blend': 0.6,
        'fog-color': token('--paper') || '#f5f0e5',
        'fog-ground-blend': 0.3,
      },
    };
  }

  private restyle() {
    if (!this.ready) return;
    const m = this.map;
    m.setPaintProperty('sea', 'background-color', token('--sea'));
    m.setPaintProperty('land', 'fill-color', token('--linen'));
    m.setPaintProperty('land', 'fill-outline-color', token('--linen-deep'));
    m.setPaintProperty('lakes', 'fill-color', token('--sea'));
    m.setPaintProperty('rivers', 'line-color', token('--sea-line'));
    m.setSky(this.style().sky!);
    m.setPaintProperty('context', 'line-color', token('--context'));
    this.update(store.get(), true);
  }

  private addOverlays() {
    const m = this.map;
    // All legs, coloured per journey; opacity set per journey in update().
    const legFeatures = LEGS.filter((l) => !l.still).map((l) =>
      line(l.coords, { journey: l.journey.id, mode: l.mode, color: cssColor(l.journey.color) }));
    m.addSource('legs', { type: 'geojson', data: fc(legFeatures) });
    m.addSource('done', { type: 'geojson', data: fc([]) });
    m.addSource('side', { type: 'geojson', data: fc(SIDE_TRIPS.map((s) => line(s.coords, { journey: s.journey.id, color: cssColor(s.journey.color), a: s.scenes[0], b: s.scenes[1] }))) });
    m.addSource('context', { type: 'geojson', data: fc(CONTEXT_ROUTES.map((c) => line(c.coords, { id: c.id }))) });
    m.addSource('pillars', { type: 'geojson', data: fc([]) });

    m.addLayer({ id: 'context', type: 'line', source: 'context', layout: { visibility: 'none', 'line-cap': 'round' },
      paint: { 'line-color': token('--context'), 'line-width': 2, 'line-dasharray': [3, 2] } });
    const legPaint = (dash: number[], width: number) => ({
      'line-color': ['get', 'color'] as unknown as string,
      'line-width': width,
      'line-opacity': 0.25,
      'line-dasharray': dash,
    });
    m.addLayer({ id: 'legs-land', type: 'line', source: 'legs', filter: ['==', ['get', 'mode'], 'land'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: legPaint([3, 1], 3) });
    m.addLayer({ id: 'legs-sea', type: 'line', source: 'legs', filter: ['==', ['get', 'mode'], 'sea'], layout: { 'line-cap': 'round' }, paint: legPaint([1, 2], 3) });
    m.addLayer({ id: 'legs-gap', type: 'line', source: 'legs', filter: ['==', ['get', 'mode'], 'gap'], layout: { 'line-cap': 'round' }, paint: legPaint([0.5, 3], 2.5) });
    m.addLayer({ id: 'side', type: 'line', source: 'side', layout: { visibility: 'none', 'line-cap': 'round' },
      paint: { 'line-color': ['get', 'color'], 'line-width': 2, 'line-dasharray': [2, 2], 'line-opacity': 0.9 } });
    m.addLayer({ id: 'done-casing', type: 'line', source: 'done', layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': token('--paper'), 'line-width': 7, 'line-opacity': 0.8 } });
    m.addLayer({ id: 'done', type: 'line', source: 'done', layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': ['get', 'color'], 'line-width': 4 } });
    m.addLayer({ id: 'pillars', type: 'fill-extrusion', source: 'pillars',
      paint: {
        'fill-extrusion-color': ['get', 'color'],
        'fill-extrusion-height': ['get', 'h'],
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 0.9,
      } });

    // Place labels (DOM, so no glyph server is needed).
    for (const [id, pl] of Object.entries(STORY.places)) {
      const el = document.createElement('button');
      el.type = 'button';
      const flip = pl.label === 'left' || pl.label === 'below-left';
      el.className = `place-marker${pl.sea ? ' sea' : ''}${flip ? ' flip' : ''}`;
      el.innerHTML = '<i aria-hidden="true"></i><span></span>';
      el.querySelector('span')!.textContent = pl.name;
      el.title = pl.note ?? pl.name;
      el.setAttribute('aria-label', `${pl.name}${pl.note ? `. ${pl.note}` : ''}`);
      el.addEventListener('click', () => store.emit('place', id));
      const marker = new maplibregl.Marker({ element: el, anchor: pl.sea ? 'center' : flip ? 'right' : 'left', offset: pl.sea ? [0, 0] : [flip ? 6 : -6, 0] })
        .setLngLat(pl.lonlat).addTo(m);
      this.placeMarkers.set(id, { marker, el });
    }
    for (const r of STORY.regions) {
      const el = document.createElement('div');
      el.className = 'region-label';
      el.textContent = r.name;
      el.setAttribute('aria-hidden', 'true');
      new maplibregl.Marker({ element: el }).setLngLat(r.lonlat).addTo(m);
    }
    for (const c of CONTEXT_ROUTES) {
      for (const [ll, text] of c.labels) {
        const el = document.createElement('div');
        el.className = 'context-label';
        el.textContent = text;
        el.hidden = true;
        this.ctxMarkers.push(new maplibregl.Marker({ element: el, anchor: 'left', offset: [6, 0] }).setLngLat(ll).addTo(m));
      }
    }
    this.travellerEl = document.createElement('div');
    this.travellerEl.className = 'traveller';
    this.travellerEl.setAttribute('aria-hidden', 'true');
    this.traveller = new maplibregl.Marker({ element: this.travellerEl }).setLngLat([0, 50]).addTo(m);
  }

  setFollow(on: boolean) {
    this.follow = on;
    this.onFollowChange(on);
    if (on && this.journey) this.flyToJourney(this.journey, store.get().p);
  }

  /** Camera for a journey: fit its bounds tilted, then centre on the traveller. */
  private journeyCamera(j: Journey, p: number) {
    const [[w, s], [e, n]] = journeyBounds(j);
    const cam = this.map.cameraForBounds([[w, s], [e, n]], { padding: 40, maxZoom: 9.2 });
    const zoom = Math.min(9.2, (cam?.zoom ?? 6) + 0.35);
    const tr = travellerAt(j, p).lonlat;
    const mid: LonLat = [(w + e) / 2, (s + n) / 2];
    // Look mostly at the traveller, a little towards the journey's middle.
    const center: LonLat = [tr[0] * 0.65 + mid[0] * 0.35, tr[1] * 0.65 + mid[1] * 0.35];
    const span = (p - j.scenes[0]) / Math.max(1, j.scenes[1] - j.scenes[0] + 1);
    return { center, zoom, pitch: 52, bearing: -12 + span * 24 };
  }

  private flyToJourney(j: Journey, p: number) {
    const cam = this.journeyCamera(j, p);
    this.flying = !reduceMotion;
    this.camTarget = null;
    this.map.flyTo({ ...cam, duration: reduceMotion ? 0 : 1600, curve: 1.3, essential: false });
  }

  showWholeStory(showContext: boolean) {
    this.setFollow(false);
    const pts = [
      ...LEGS.flatMap((l) => l.coords),
      ...(showContext ? CONTEXT_ROUTES.flatMap((c) => c.coords) : []),
    ];
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    this.map.fitBounds([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]],
      { padding: 30, pitch: 35, bearing: 0, duration: reduceMotion ? 0 : 1400 });
  }

  private tick = () => {
    this.raf = 0;
    if (!this.camTarget || this.flying || !this.follow) return;
    const c = this.map.getCenter();
    const tgt = this.camTarget;
    const k = 0.18;
    const next: LonLat = [c.lng + (tgt.center[0] - c.lng) * k, c.lat + (tgt.center[1] - c.lat) * k];
    const z = this.map.getZoom(), b = this.map.getBearing();
    this.map.jumpTo({ center: next, zoom: z + (tgt.zoom - z) * k, bearing: b + (tgt.bearing - b) * k, pitch: tgt.pitch });
    const done = Math.abs(next[0] - tgt.center[0]) < 1e-4 && Math.abs(next[1] - tgt.center[1]) < 1e-4 && Math.abs(tgt.zoom - z) < 0.01;
    if (!done) this.raf = requestAnimationFrame(this.tick);
  };

  update(s: State, force = false) {
    if (!this.ready) return;
    const m = this.map;
    const j = s.journey;
    const changed = j !== this.journey;
    this.journey = j;

    if (changed || force) {
      const op = ['case', ['==', ['get', 'journey'], j.id], 0.5, 0.18] as unknown as number;
      for (const id of ['legs-land', 'legs-sea', 'legs-gap']) m.setPaintProperty(id, 'line-opacity', op);
      const inJourney = new Set(j.stops.map((st) => st.place));
      for (const [id, { el }] of this.placeMarkers) el.classList.toggle('inactive', !inJourney.has(id));
      this.travellerEl.style.setProperty('--c', cssColor(j.color));
      if (this.follow) this.flyToJourney(j, s.p);
    }

    // Travelled line, traveller, pillars.
    const done = travelledCoords(j, s.p);
    (m.getSource('done') as GeoJSONSource).setData(fc(done.length > 1 ? [line(done, { color: cssColor(j.color) })] : []));
    const tr = travellerAt(j, s.p);
    this.traveller.setLngLat(tr.lonlat);
    const moving = !tr.leg.still && tr.f > 0 && tr.f < 1;
    const sea = moving && (tr.leg.mode === 'sea' || tr.leg.mode === 'gap');
    this.travellerEl.innerHTML = GLYPH[sea ? 'sea' : 'land'];

    const current = s.sceneData.place;
    const jColor = cssColor(j.color);
    const pillars = Object.entries(STORY.places).filter(([, pl]) => !pl.sea).map(([id, pl]) => {
      const inJ = j.stops.some((st) => st.place === id);
      return {
        type: 'Feature' as const,
        properties: { color: id === current ? jColor : inJ ? jColor : token('--ink-soft'), h: id === current ? 16000 : inJ ? 5000 : 1500 },
        geometry: circle(pl.lonlat, id === current ? 1.6 : 1.1),
      };
    });
    (m.getSource('pillars') as GeoJSONSource).setData(fc(pillars));
    for (const [id, { el }] of this.placeMarkers) el.classList.toggle('current', id === current);

    // Side trips (William's messengers) show only during their scenes.
    const sideOn = SIDE_TRIPS.some((t) => t.journey === j && s.p >= t.scenes[0] && s.p <= t.scenes[1]);
    m.setLayoutProperty('side', 'visibility', sideOn ? 'visible' : 'none');

    const ctx = s.layers.context;
    m.setLayoutProperty('context', 'visibility', ctx ? 'visible' : 'none');
    this.ctxMarkers.forEach((mk) => { mk.getElement().hidden = !ctx; });

    if (this.follow && !changed && !this.flying) {
      this.camTarget = this.journeyCamera(j, s.p);
      if (!this.raf) this.raf = requestAnimationFrame(this.tick);
    }
  }

  flyToPlace(id: string) {
    this.setFollow(false);
    this.map.flyTo({ center: placeLonLat(id), zoom: 9, pitch: 60, duration: reduceMotion ? 0 : 1400 });
  }

  /** Legs for a journey, exported for tests. */
  static legsOf(id: string) { return JOURNEY_LEGS.get(id); }
}
