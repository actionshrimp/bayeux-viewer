/* The story model shared by every view.
 *
 * Strip units: x along the continuous tapestry at the 480px tier (strip.json).
 * Story position p: p = n on the museum's painted marker for scene n, fractional between.
 * The strip's scroll position gives p; p gives the scene, journey, date and traveller.
 */
import type { Journey, LonLat, StripData, Stop } from './types';
import { JOURNEYS as STORY } from './data/journeys';
import { DATES } from './data/dates';

export const N_SCENES = 58;

export function buildMarkers(strip: StripData): number[] {
  const marker: (number | null)[] = new Array(N_SCENES + 2).fill(null);
  marker[0] = 0;
  // Each Commons image starts at the painted marker of the scene before its first scene.
  strip.images.forEach((im, i) => { if (i > 0) marker[im.scenes[0] - 1] = im.x; });
  const last = strip.images[strip.images.length - 1];
  marker[N_SCENES] = last.x + last.width * 0.55;
  marker[N_SCENES + 1] = strip.total;
  for (let s = 1; s <= N_SCENES; s++) {
    if (marker[s] == null) marker[s] = ((marker[s - 1] as number) + (marker[s + 1] as number)) / 2;
  }
  return marker as number[];
}

export class Timeline {
  constructor(public markers: number[]) {}

  pFromX(x: number): number {
    const m = this.markers;
    if (x <= 0) return 0;
    for (let s = 0; s <= N_SCENES; s++) {
      if (x < m[s + 1]) return s + (x - m[s]) / (m[s + 1] - m[s]);
    }
    return N_SCENES + 1;
  }

  xFromP(p: number): number {
    const m = this.markers;
    p = Math.max(0, Math.min(N_SCENES + 1, p));
    const s = Math.min(N_SCENES, Math.floor(p));
    return m[s] + (p - s) * (m[s + 1] - m[s]);
  }

  /** Scene n spans halfway to its neighbours' markers. */
  sceneRange(n: number): [number, number] {
    return [this.xFromP(n - 0.5), this.xFromP(n + 0.5)];
  }
}

export const sceneAt = (p: number) => Math.max(1, Math.min(N_SCENES, Math.round(p)));

export const journeyForScene = (n: number): Journey =>
  STORY.journeys.find((j) => n >= j.scenes[0] && n <= j.scenes[1]) ?? STORY.journeys[0];

export const dateFor = (n: number) =>
  DATES.find((d) => n >= d.from && n <= d.to) ?? { from: n, to: n, year: '', when: '' };

/* ------------------------------------------------------------------ routes */

export interface Leg {
  id: string;
  journey: Journey;
  from: Stop;
  to: Stop;
  mode: 'land' | 'sea' | 'gap' | 'stay';
  still: boolean;
  coords: LonLat[];
}

/** Centripetal-ish Catmull-Rom through lon/lat points, sampled evenly per segment. */
function smooth(points: LonLat[], perSeg = 16): LonLat[] {
  if (points.length < 3) {
    if (points.length === 2) {
      const [a, b] = points;
      return Array.from({ length: perSeg + 1 }, (_, i) => {
        const t = i / perSeg;
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] as LonLat;
      });
    }
    return points.slice();
  }
  const out: LonLat[] = [];
  const P = [points[0], ...points, points[points.length - 1]];
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    for (let k = 0; k < perSeg; k++) {
      const t = k / perSeg, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

export const placeLonLat = (id: string): LonLat => STORY.places[id].lonlat;

export const LEGS: Leg[] = [];
export const JOURNEY_LEGS = new Map<string, Leg[]>();
for (const j of STORY.journeys) {
  const legs: Leg[] = [];
  for (let i = 1; i < j.stops.length; i++) {
    const a = j.stops[i - 1], b = j.stops[i];
    const pts = [placeLonLat(a.place), ...(b.via ?? []), placeLonLat(b.place)];
    const still = a.place === b.place;
    const leg: Leg = {
      id: `${j.id}-${i}`, journey: j, from: a, to: b, still,
      mode: still ? 'stay' : b.gap ? 'gap' : (b.mode ?? 'land'),
      coords: still ? [pts[0], pts[0]] : smooth(pts),
    };
    legs.push(leg);
    LEGS.push(leg);
  }
  JOURNEY_LEGS.set(j.id, legs);
}

export const SIDE_TRIPS = STORY.journeys.flatMap((j) => (j.sideTrips ?? []).map((t) => ({
  ...t, journey: j,
  coords: smooth([placeLonLat(t.from), ...(t.via ?? []), placeLonLat(t.to)]),
})));

export const CONTEXT_ROUTES = STORY.context.map((c) => ({ ...c, coords: smooth(c.points, 10) }));

function pointAlong(coords: LonLat[], f: number): LonLat {
  // Arc-length interpolation in lon/lat (fine at this scale).
  f = Math.max(0, Math.min(1, f));
  const seg: number[] = [];
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const d = Math.hypot(coords[i][0] - coords[i - 1][0], coords[i][1] - coords[i - 1][1]);
    seg.push(d); total += d;
  }
  if (!total) return coords[0];
  let target = f * total;
  for (let i = 0; i < seg.length; i++) {
    if (target <= seg[i]) {
      const t = seg[i] ? target / seg[i] : 0;
      const a = coords[i], b = coords[i + 1];
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    target -= seg[i];
  }
  return coords[coords.length - 1];
}

export function legFraction(leg: Leg, p: number) {
  return Math.max(0, Math.min(1, (p - leg.from.at) / (leg.to.at - leg.from.at || 1)));
}

/** Where the journey's traveller is at story position p. */
export function travellerAt(j: Journey, p: number): { lonlat: LonLat; leg: Leg; f: number } {
  const legs = JOURNEY_LEGS.get(j.id)!;
  if (p <= j.stops[0].at) return { lonlat: placeLonLat(j.stops[0].place), leg: legs[0], f: 0 };
  for (const leg of legs) {
    if (p <= leg.to.at) {
      const f = legFraction(leg, p);
      return { lonlat: pointAlong(leg.coords, f), leg, f };
    }
  }
  const leg = legs[legs.length - 1];
  return { lonlat: placeLonLat(j.stops[j.stops.length - 1].place), leg, f: 1 };
}

/** The travelled part of a journey up to p, as one line. */
export function travelledCoords(j: Journey, p: number): LonLat[] {
  const out: LonLat[] = [];
  for (const leg of JOURNEY_LEGS.get(j.id)!) {
    if (leg.still) continue;
    const f = legFraction(leg, p);
    if (f <= 0) break;
    if (f >= 1) { out.push(...leg.coords); continue; }
    const n = Math.max(1, Math.round(f * (leg.coords.length - 1)));
    out.push(...leg.coords.slice(0, n), pointAlong(leg.coords, f));
    break;
  }
  return out;
}

export function journeyBounds(j: Journey): [LonLat, LonLat] {
  const pts: LonLat[] = [
    ...JOURNEY_LEGS.get(j.id)!.flatMap((l) => l.coords),
    ...SIDE_TRIPS.filter((t) => t.journey === j).flatMap((t) => t.coords),
  ];
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]];
}
