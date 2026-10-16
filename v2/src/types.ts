export type LonLat = [number, number];

export interface Place {
  name: string;
  lonlat: LonLat;
  sea?: boolean;
  note?: string;
  label?: string;
}

export interface Stop {
  place: string;
  at: number;
  mode?: 'land' | 'sea';
  via?: LonLat[];
  gap?: boolean;
}

export interface Journey {
  id: string;
  short: string;
  name: string;
  date: string;
  color: string;
  scenes: [number, number];
  summary: string;
  stops: Stop[];
  sideTrips?: { from: string; to: string; scenes: [number, number]; label: string; via?: LonLat[] }[];
  gapNote?: string;
}

export interface ContextRoute {
  id: string;
  name: string;
  date: string;
  color: string;
  summary: string;
  points: LonLat[];
  labels: [LonLat, string][];
}

export interface StoryData {
  places: Record<string, Place>;
  journeys: Journey[];
  context: ContextRoute[];
  regions: { name: string; lonlat: LonLat }[];
}

export interface DateRange {
  from: number;
  to: number;
  year: string;
  when: string;
  note?: string;
  jump?: string;
}

export interface ArgumentNode {
  id: string;
  col: string;
  lane: 'norman' | 'shown' | 'english';
  kind?: 'context';
  key?: boolean;
  scenes?: [number, number];
  title: string;
  text: string;
}

export interface ArgumentData {
  columns: { id: string; label: string; scenes: [number, number] }[];
  nodes: ArgumentNode[];
  edges: [string, string][];
}

export interface Scene {
  n: number;
  latin: string;
  english: string;
  title: string;
  summary: string;
  place: string | null;
  journey: string;
  obstacle: string | null;
  details: string[];
}

export interface Character {
  id: string;
  kind: 'person' | 'object' | 'place';
  name: string;
  latin: string;
  role: string;
  bio: string;
  lookFor: string;
  place?: string;
}

/** A box on the tapestry, in 480px strip units. */
export interface Figure {
  id: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  scene: number;
  evidence: 'labelled' | 'narrative';
  note?: string;
}

export interface StripImage {
  file: string;
  scenes: number[];
  width: number;
  x: number;
}

export interface StripData {
  height: number;
  total: number;
  images: StripImage[];
}

export interface BiasEntry {
  scenes: [number, number] | null;
  party: string;
  title: string;
  text: string;
  strength: 'documented' | 'argued';
  source: string;
}

export interface BiasData {
  parties: { id: string; name: string; short: string; blurb: string }[];
  entries: BiasEntry[];
}

export interface PenisEntry {
  scene: number;
  kind: 'human' | 'horse';
  count?: number;
  where: string;
  pos: number | null;
  note: string;
  confidence: 'documented' | 'likely';
  /** Exact centre and radius in 480px strip units, when located on the image. */
  x?: number;
  y?: number;
  r?: number;
}

export interface PenisData {
  source: string;
  total: number;
  horses: number;
  humans: number;
  summary: string;
  entries: PenisEntry[];
}
