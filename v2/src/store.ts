/* A tiny store: one state object, subscribers notified once per animation frame. */
import type { Journey, Scene } from './types';

export interface Layers {
  people: boolean;
  bias: boolean;
  penis: boolean;
  context: boolean;
}

export interface State {
  p: number;
  scene: number;
  sceneData: Scene;
  journey: Journey;
  layers: Layers;
  selected: string | null; // character id
  tab: 'scene' | 'people' | 'why';
}

type Listener = (s: State, prev: State) => void;
type EventName = 'place' | 'goto' | 'select';

const LAYER_KEY = 'bayeux-v2-layers';

function loadLayers(): Layers {
  const defaults: Layers = { people: true, bias: false, penis: false, context: false };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(LAYER_KEY) || '{}') };
  } catch {
    return defaults;
  }
}

class Store {
  private state!: State;
  private prev!: State;
  private listeners: Listener[] = [];
  private events = new Map<EventName, ((arg: any) => void)[]>();
  private pending = false;

  init(s: Omit<State, 'layers'>) {
    this.state = { ...s, layers: loadLayers() };
    this.prev = this.state;
  }

  get() { return this.state; }

  set(patch: Partial<State>) {
    this.state = { ...this.state, ...patch };
    if (patch.layers) {
      try { localStorage.setItem(LAYER_KEY, JSON.stringify(this.state.layers)); } catch { /* private mode */ }
    }
    if (!this.pending) {
      this.pending = true;
      requestAnimationFrame(() => {
        this.pending = false;
        const prev = this.prev;
        this.prev = this.state;
        for (const l of this.listeners) l(this.state, prev);
      });
    }
  }

  setLayer(name: keyof Layers, on: boolean) {
    this.set({ layers: { ...this.state.layers, [name]: on } });
  }

  subscribe(l: Listener) { this.listeners.push(l); }

  on(name: EventName, fn: (arg: any) => void) {
    if (!this.events.has(name)) this.events.set(name, []);
    this.events.get(name)!.push(fn);
  }

  emit(name: EventName, arg?: unknown) {
    for (const fn of this.events.get(name) ?? []) fn(arg);
  }
}

export const store = new Store();
