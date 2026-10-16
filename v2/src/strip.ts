/* The tapestry strip: native horizontal scrolling (momentum on phones), a fixed centre
 * needle, clickable figures, and layer overlays. Everything is positioned in strip units
 * (480px tier) multiplied by the current scale.
 */
import type { BiasData, Character, Figure, Horse, PenisData, StripData } from './types';
import { Timeline, N_SCENES } from './story';
import { DATES } from './data/dates';
import { JOURNEYS as STORY } from './data/journeys';
import { store, type State } from './store';

const FEATHER = 24;              // strip units of cross-fade at each seam
const ZOOMS = [1, 1.6, 2.4, 3.6];
const TAG_BASE = 168;            // strip y of the tag baseline (top of the main frieze)
const PENIS_Y: Record<string, number> = { 'upper border': 0.31, 'main frieze': 0.6, 'lower border': 0.83 };
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

interface Tile { el: HTMLElement; img: HTMLImageElement; hi?: HTMLImageElement; file: string; left: number; right: number; x: number; w: number; }

export class Strip {
  scale = 1;
  zoom = 0;
  private tiles: Tile[] = [];
  private inner: HTMLElement;
  private layer: HTMLElement;
  private overlay: HTMLElement;
  private figEls: { el: HTMLButtonElement; f: Figure }[] = [];
  private placed: { el: HTMLElement; place: (s: number, H: number) => void }[] = [];
  private hiFiles: Set<string>;
  private playing = false;
  private lastT = 0;
  private playPos = 0;
  onPlayChange: (on: boolean) => void = () => {};

  constructor(
    public el: HTMLElement,
    private strip: StripData,
    public tl: Timeline,
    private figures: Figure[],
    private chars: Map<string, Character>,
    private bias: BiasData,
    private pen: PenisData,
    hiFiles: string[],
    private horses: Horse[] = [],
  ) {
    this.hiFiles = new Set(hiFiles);
    this.inner = el.querySelector('.strip-inner')!;
    this.layer = el.querySelector('.strip-images')!;
    this.overlay = el.querySelector('.strip-overlay')!;
    this.buildTiles();
    this.buildOverlays();
    this.buildHorseMarks();
    this.bindInput();
    new ResizeObserver(() => this.layout()).observe(el);
  }

  /* ------------------------------------------------------------- tiles */
  private buildTiles() {
    const ims = this.strip.images;
    // Cut each seam in the middle of the overlap, away from the photos' edges, and feather it.
    const cut = ims.map((im, i) => {
      const next = ims[i + 1];
      return next ? (next.x + (im.x + im.width)) / 2 : im.x + im.width;
    });
    ims.forEach((im, i) => {
      const left = i === 0 ? im.x : cut[i - 1] - FEATHER;
      const right = cut[i];
      const el = document.createElement('div');
      el.className = 'tile';
      if (i > 0) el.classList.add('feather');
      const img = document.createElement('img');
      img.src = `img/tapestry/${im.file}`;
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.draggable = false;
      el.append(img);
      this.layer.append(el);
      this.tiles.push({ el, img, file: im.file, left, right, x: im.x, w: im.width });
    });
  }

  /* ------------------------------------------------------------- overlays */
  private place(el: HTMLElement, fn: (s: number, H: number) => void) {
    this.overlay.append(el);
    this.placed.push({ el, place: fn });
  }

  private buildOverlays() {
    const tl = this.tl;
    // Journey bands along the bottom edge.
    for (const j of STORY.journeys) {
      const band = document.createElement('div');
      band.className = 'jband';
      band.style.setProperty('--c', j.color);
      band.innerHTML = '<span></span>';
      band.querySelector('span')!.textContent = j.name;
      this.place(band, (s) => {
        const a = tl.xFromP(j.scenes[0] - 0.5), b = tl.xFromP(j.scenes[1] + 0.5);
        band.style.left = `${a * s}px`; band.style.width = `${(b - a) * s}px`;
      });
    }
    // Time jumps.
    for (const d of DATES.filter((d) => d.jump)) {
      const el = document.createElement('div');
      el.className = 'flag time-jump';
      el.textContent = d.jump!;
      this.place(el, (s) => { el.style.left = `${tl.xFromP(d.from - 0.5) * s}px`; });
    }
    // Not-embroidered legs.
    for (const j of STORY.journeys) {
      j.stops.forEach((st, i) => {
        if (!st.gap) return;
        const prev = j.stops[i - 1];
        const el = document.createElement('div');
        el.className = 'flag gap-flag';
        el.textContent = `Not embroidered: ${STORY.places[prev.place].name} → ${STORY.places[st.place].name}`;
        this.place(el, (s) => { el.style.left = `${tl.xFromP((prev.at + st.at) / 2) * s}px`; });
      });
    }
    // Figures (clickable).
    for (const f of this.figures) {
      const c = this.chars.get(f.id);
      if (!c) continue;
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `fig kind-${c.kind}`;
      el.dataset.id = f.id;
      el.setAttribute('aria-label', `${c.name}, scene ${f.scene}${f.note ? `: ${f.note}` : ''}`);
      el.innerHTML = '<span class="fig-tag"></span>';
      el.querySelector('span')!.textContent = c.name;
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        store.emit('select', { id: f.id, figure: f });
      });
      this.place(el, (s) => {
        el.style.left = `${f.x0 * s}px`; el.style.top = `${f.y0 * s}px`;
        el.style.width = `${(f.x1 - f.x0) * s}px`; el.style.height = `${(f.y1 - f.y0) * s}px`;
        // Tags share one baseline just above the main frieze so stacked rows line up.
        el.style.setProperty('--tag-top', `${(Math.min(f.y0, TAG_BASE) - f.y0) * s}px`);
      });
      this.figEls.push({ el, f });
    }
    // Bias tags, packed into rows.
    const parties = new Map(this.bias.parties.map((p) => [p.id, p]));
    const rows: number[] = [];
    [...this.bias.entries].filter((e) => e.scenes).sort((a, b) => a.scenes![0] - b.scenes![0]).forEach((e) => {
      const [a0, b0] = e.scenes!;
      let r = rows.findIndex((end) => end <= a0 - 0.45);
      if (r < 0) { r = rows.length; rows.push(0); }
      rows[r] = b0 + 0.45;
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `btag layer-bias${e.strength === 'argued' ? ' argued' : ''}`;
      el.style.setProperty('--pc', `var(--party-${e.party})`);
      el.textContent = `${parties.get(e.party)?.short ?? e.party}: ${e.title}`;
      el.setAttribute('aria-label', `${parties.get(e.party)?.name}: ${e.title} (${e.strength})`);
      el.addEventListener('click', (ev) => { ev.stopPropagation(); this.goToScene(Math.round((a0 + b0) / 2)); });
      const row = r;
      this.place(el, (s, H) => {
        const a = tl.xFromP(a0 - 0.45) * s, b = tl.xFromP(b0 + 0.45) * s;
        el.style.left = `${a}px`; el.style.width = `${Math.max(96, b - a)}px`;
        el.style.top = `${H * 0.045 + row * 22}px`;
      });
    });
    // Penis markers.
    for (const e of this.pen.entries) {
      const el = document.createElement('div');
      const exact = e.x != null && e.y != null;
      const band = !exact && e.pos == null && (e.count ?? 1) > 1;
      el.className = `layer-penis ${band ? 'pband' : 'pmark'}${e.confidence === 'likely' ? ' likely' : ''}`;
      el.title = `Scene ${e.scene}: ${e.note}`;
      this.place(el, (s, H) => {
        if (exact) {
          const d = Math.max(18, 2 * (e.r ?? 10) * s);
          Object.assign(el.style, { left: `${e.x! * s}px`, top: `${e.y! * s}px`, width: `${d}px`, height: `${d}px`, margin: `${-d / 2}px 0 0 ${-d / 2}px` });
          return;
        }
        const [a, b] = tl.sceneRange(e.scene);
        const y = PENIS_Y[e.where] ?? 0.83;
        if (band) {
          el.style.left = `${a * s}px`; el.style.width = `${(b - a) * s}px`; el.style.top = `${(y - 0.06) * H}px`;
        } else {
          el.style.left = `${(a + (e.pos ?? 0.5) * (b - a)) * s}px`; el.style.top = `${y * H}px`;
        }
      });
    }
  }

  /** Every penis position along the strip (named entries plus stallions from the horse pass), for the counter. */
  penisXs(): number[] {
    const xs: number[] = [];
    for (const e of this.pen.entries) {
      const n = e.count ?? 1;
      const x = e.x ?? this.tl.xFromP(e.scene);
      for (let i = 0; i < n; i++) xs.push(x);
    }
    for (const h of this.extraStallions()) xs.push(h.gx!);
    return xs.sort((a, b) => a - b);
  }

  /** Stallions from the horse pass that aren't already a named entry. */
  private extraStallions(status: Horse['stallion'] = 'yes') {
    const named = this.pen.entries.filter((e) => e.kind === 'horse' && e.x != null);
    return this.horses.filter((h) => h.stallion === status && h.gx != null &&
      !named.some((e) => Math.abs(e.x! - h.gx!) < 30 && Math.abs(e.y! - h.gy!) < 30));
  }

  private buildHorseMarks() {
    for (const status of ['yes', 'unclear'] as const) {
      for (const h of this.extraStallions(status)) {
        const el = document.createElement('div');
        el.className = `layer-penis pmark horse${status === 'unclear' ? ' unsure' : ''}`;
        el.title = `Scene ${h.scene}: ${status === 'yes' ? 'stallion' : 'possibly a stallion'}${h.note ? ` (${h.note})` : ''}`;
        this.place(el, (s) => {
          const d = Math.max(16, 18 * s);
          Object.assign(el.style, { left: `${h.gx! * s}px`, top: `${h.gy! * s}px`, width: `${d}px`, height: `${d}px`, margin: `${-d / 2}px 0 0 ${-d / 2}px` });
        });
      }
    }
  }

  layout() {
    const keepP = store.get()?.p ?? 1;
    const H0 = this.el.clientHeight, W = this.el.clientWidth;
    if (!H0 || !W) return;
    this.scale = (H0 / this.strip.height) * ZOOMS[this.zoom];
    const s = this.scale, H = this.strip.height * s;
    this.el.classList.toggle('zoomed', this.zoom > 0);
    this.inner.style.width = `${this.strip.total * s + W}px`;
    this.inner.style.height = `${H}px`;
    for (const l of [this.layer, this.overlay]) {
      l.style.left = `${W / 2}px`;
      l.style.width = `${this.strip.total * s}px`;
      l.style.height = `${H}px`;
    }
    for (const t of this.tiles) {
      t.el.style.left = `${t.left * s}px`;
      t.el.style.width = `${(t.right - t.left) * s + 1}px`;
      t.el.style.setProperty('--feather', `${FEATHER * s}px`);
      const imgLeft = `${(t.x - t.left) * s}px`, imgW = `${t.w * s}px`;
      t.img.style.left = imgLeft; t.img.style.width = imgW;
      if (t.hi) { t.hi.style.left = imgLeft; t.hi.style.width = imgW; }
    }
    for (const p of this.placed) p.place(s, H);
    this.stackTags();
    this.el.scrollLeft = this.tl.xFromP(keepP) * s;
    this.el.scrollTop = (H - H0) / 2;
    this.loadHi();
  }

  /** Stagger figure name tags into up to three rows so neighbours don't overlap; hide the rest. */
  private stackTags() {
    const rows: number[] = [];
    const items = this.figEls.map(({ el, f }) => {
      const tag = el.firstElementChild as HTMLElement;
      tag.style.removeProperty('--row');
      el.classList.remove('tag-hidden');
      return { el, tag, cx: ((f.x0 + f.x1) / 2) * this.scale, w: tag.offsetWidth || 80 };
    }).sort((a, b) => a.cx - b.cx);
    for (const it of items) {
      const l = it.cx - it.w / 2 - 3, r = it.cx + it.w / 2 + 3;
      let row = rows.findIndex((end) => end <= l);
      if (row < 0 && rows.length < 3) { row = rows.length; rows.push(-Infinity); }
      if (row < 0) { it.el.classList.add('tag-hidden'); continue; }
      rows[row] = r;
      it.tag.style.setProperty('--row', String(row));
    }
  }

  private loadHi() {
    if (!this.hiFiles.size || this.scale * (devicePixelRatio || 1) <= 1.15) return;
    const W = this.el.clientWidth, s = this.scale;
    const l = (this.el.scrollLeft - W) / s, r = (this.el.scrollLeft + 2 * W) / s;
    for (const t of this.tiles) {
      if (t.hi || t.right < l || t.left > r || !this.hiFiles.has(t.file)) continue;
      const img = document.createElement('img');
      img.className = 'hi';
      img.alt = '';
      img.decoding = 'async';
      img.draggable = false;
      img.style.left = t.img.style.left;
      img.style.width = t.img.style.width;
      img.onload = () => img.classList.add('ready');
      img.src = `img/tapestry/hi/${t.file}`;
      t.el.append(img);
      t.hi = img;
    }
  }

  /** Strip x under the needle. */
  centreX() { return this.el.scrollLeft / this.scale; }

  setZoom(level: number) {
    level = Math.max(0, Math.min(ZOOMS.length - 1, level));
    if (level === this.zoom) return;
    this.zoom = level;
    this.layout();
  }
  get zoomLevels() { return ZOOMS.length; }

  goToX(x: number, smooth = true) {
    this.el.scrollTo({ left: x * this.scale, behavior: smooth && !reduceMotion ? 'smooth' : 'auto' });
  }
  goToScene(n: number, smooth = true) {
    this.goToX(this.tl.xFromP(Math.max(1, Math.min(N_SCENES, n))), smooth);
  }
  goToFigure(f: Figure, smooth = true) {
    this.goToX((f.x0 + f.x1) / 2, smooth);
    if (this.zoom > 0) {
      const H0 = this.el.clientHeight;
      this.el.scrollTo({ top: ((f.y0 + f.y1) / 2) * this.scale - H0 / 2 });
    }
  }

  onScroll() { this.loadHi(); }

  /* ------------------------------------------------------------- state */
  update(s: State) {
    const ov = this.overlay;
    ov.classList.toggle('show-people', s.layers.people);
    ov.classList.toggle('show-bias', s.layers.bias);
    ov.classList.toggle('show-penis', s.layers.penis);
    ov.classList.toggle('has-selection', !!s.selected);
    for (const { el, f } of this.figEls) el.classList.toggle('selected', f.id === s.selected);
    for (const el of ov.querySelectorAll<HTMLElement>('.layer-bias')) el.tabIndex = s.layers.bias ? 0 : -1;
  }

  /* ------------------------------------------------------------- input */
  private bindInput() {
    const el = this.el;
    el.addEventListener('wheel', (ev) => {
      if (ev.ctrlKey) {
        ev.preventDefault();
        if (Math.abs(ev.deltaY) > 4) this.setZoom(this.zoom + (ev.deltaY < 0 ? 1 : -1));
        return;
      }
      if (this.zoom > 0 && ev.shiftKey) return;
      if (Math.abs(ev.deltaY) > Math.abs(ev.deltaX)) {
        ev.preventDefault();
        this.stop();
        el.scrollLeft += ev.deltaY * (ev.deltaMode === 1 ? 32 : 1);
      }
    }, { passive: false });

    // Mouse drag pans; touch uses native scrolling.
    el.addEventListener('pointerdown', (ev) => {
      if (ev.pointerType !== 'mouse' || ev.button !== 0) return;
      this.stop();
      const x0 = ev.clientX, y0 = ev.clientY, s0 = el.scrollLeft, t0 = el.scrollTop;
      let moved = false;
      const move = (e: PointerEvent) => {
        if (!moved && Math.hypot(e.clientX - x0, e.clientY - y0) < 4) return;
        if (!moved) { moved = true; el.setPointerCapture(ev.pointerId); el.classList.add('dragging'); }
        el.scrollLeft = s0 - (e.clientX - x0);
        el.scrollTop = t0 - (e.clientY - y0);
      };
      const up = () => {
        el.classList.remove('dragging');
        el.removeEventListener('pointermove', move);
        if (moved) {
          // Swallow the click that follows a drag so it doesn't select a figure.
          el.addEventListener('click', (e) => e.stopPropagation(), { capture: true, once: true });
        }
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up, { once: true });
      el.addEventListener('pointercancel', up, { once: true });
    });
    el.addEventListener('touchstart', () => this.stop(), { passive: true });
  }

  /* ------------------------------------------------------------- play */
  private tick = (t: number) => {
    if (!this.playing) return;
    const dt = this.lastT ? Math.min(0.05, (t - this.lastT) / 1000) : 0;
    this.lastT = t;
    // Accumulate in a float: per-frame steps are often under a pixel, and phones round
    // scrollLeft writes, so adding to scrollLeft directly never moves.
    this.playPos += 70 * this.scale * dt;
    this.el.scrollLeft = this.playPos;
    if (this.el.scrollLeft >= this.el.scrollWidth - this.el.clientWidth - 1) { this.stop(); return; }
    requestAnimationFrame(this.tick);
  };
  play() {
    if (this.playing) return;
    this.playing = true;
    this.lastT = 0;
    this.playPos = this.el.scrollLeft;
    this.onPlayChange(true);
    requestAnimationFrame(this.tick);
  }
  stop() { if (!this.playing) return; this.playing = false; this.onPlayChange(false); }
  toggle() { this.playing ? this.stop() : this.play(); }
}
