/* The reading panel: Scene, People and Why tabs. */
import type { BiasData, BiasEntry, Character, Figure, PenisData } from './types';
import { ARGUMENT } from './data/argument';
import { JOURNEYS as STORY } from './data/journeys';
import { dateFor } from './story';
import { store, type State } from './store';

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
};

const LANE_NAME = { norman: 'Norman reading', shown: 'In the tapestry', english: 'English reading' } as const;

export class Panel {
  private sceneEl: HTMLElement;
  private peopleEl: HTMLElement;
  private whyEl: HTMLElement;
  private appearances = new Map<string, Figure[]>();
  private lastScene = -1;
  private lastSel: string | null | undefined;
  private lastCol = -1;
  private lastLayers = '';
  goToFigure: (f: Figure) => void = () => {};
  goToScene: (n: number) => void = () => {};

  constructor(
    root: HTMLElement,
    private chars: Map<string, Character>,
    figures: Figure[],
    private bias: BiasData,
    private pen: PenisData,
  ) {
    this.sceneEl = root.querySelector('#tab-scene')!;
    this.peopleEl = root.querySelector('#tab-people')!;
    this.whyEl = root.querySelector('#tab-why')!;
    for (const f of figures) {
      if (!this.appearances.has(f.id)) this.appearances.set(f.id, []);
      this.appearances.get(f.id)!.push(f);
    }
    root.querySelectorAll<HTMLButtonElement>('[role="tab"]').forEach((b) =>
      b.addEventListener('click', () => store.set({ tab: b.dataset.tab as State['tab'] })));
  }

  figuresOf(id: string) { return this.appearances.get(id) ?? []; }

  update(s: State) {
    document.querySelectorAll<HTMLButtonElement>('.tabs [role="tab"]').forEach((b) => {
      const on = b.dataset.tab === s.tab;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    this.sceneEl.hidden = s.tab !== 'scene';
    this.peopleEl.hidden = s.tab !== 'people';
    this.whyEl.hidden = s.tab !== 'why';

    const layersKey = JSON.stringify(s.layers);
    if (s.scene !== this.lastScene || layersKey !== this.lastLayers) this.renderScene(s);
    if (s.selected !== this.lastSel || (s.tab === 'people' && s.scene !== this.lastScene)) this.renderPeople(s);
    this.renderWhy(s);
    this.lastScene = s.scene;
    this.lastSel = s.selected;
    this.lastLayers = layersKey;
  }

  /* --------------------------------------------------------------- scene */
  private renderScene(s: State) {
    const sc = s.sceneData, j = s.journey;
    const root = this.sceneEl;
    root.replaceChildren();
    root.style.setProperty('--c', j.color);

    const jh = h('div', 'journey-head');
    jh.append(h('p', 'eyebrow', `${j.date}`), h('h2', '', j.name));
    const js = h('p', 'muted small', j.summary);
    const jdet = h('details', 'journey-more');
    jdet.append(h('summary', '', 'About this journey'), js);
    root.append(jh, jdet);

    const card = h('article', 'scene-card');
    const place = sc.place ? STORY.places[sc.place]?.name : null;
    const num = h('p', 'scene-num');
    num.innerHTML = '<span>Scene</span> <b></b> <span class="scene-place"></span>';
    num.querySelector('b')!.textContent = String(sc.n);
    num.querySelector('.scene-place')!.textContent = place ?? 'Place not shown';
    const d = dateFor(sc.n);
    card.append(num, h('h3', '', sc.title));
    const lat = h('p', 'titulus', sc.latin);
    lat.lang = 'la';
    card.append(lat, h('p', 'translation', `“${sc.english}”`), h('p', 'summary', sc.summary));
    if (sc.obstacle) card.append(h('p', 'note note-hardship', sc.obstacle));
    if (d.jump && sc.n === d.from) card.append(h('p', 'note note-time', d.jump));

    // Who and what is here.
    const here = [...new Set([...this.appearances.entries()]
      .filter(([, fs]) => fs.some((f) => f.scene === sc.n)).map(([id]) => id))];
    if (here.length) {
      const wrap = h('div', 'chips');
      wrap.append(h('span', 'chips-label', 'In this scene'));
      for (const id of here) {
        const c = this.chars.get(id)!;
        const b = h('button', `chip kind-${c.kind}`, c.name);
        b.type = 'button';
        b.addEventListener('click', () => {
          const f = this.figuresOf(id).find((x) => x.scene === sc.n) ?? this.figuresOf(id)[0];
          store.emit('select', { id, figure: f });
        });
        wrap.append(b);
      }
      card.append(wrap);
    }
    if (sc.details?.length) {
      const ul = h('ul', 'details');
      sc.details.forEach((t) => ul.append(h('li', '', t)));
      const dd = h('details', 'look-for');
      dd.append(h('summary', '', 'Look for'), ul);
      dd.open = true;
      card.append(dd);
    }
    if (s.layers.penis) {
      const pe = this.pen.entries.filter((e) => e.scene === sc.n);
      if (pe.length) card.append(h('p', 'note note-penis', pe.map((e) => e.note).join(' ')));
    }
    if (j.gapNote && j.stops.some((st) => st.gap && Math.abs(st.at - s.p) < 1.2)) card.append(h('p', 'note note-gap', j.gapNote));
    root.append(card);

    if (s.layers.bias) root.append(this.biasSection(sc.n));
  }

  private biasItem(e: BiasEntry) {
    const pt = this.bias.parties.find((p) => p.id === e.party);
    const div = h('div', 'bias-item');
    div.style.setProperty('--pc', `var(--party-${e.party})`);
    const head = h('p', 'bias-head');
    head.append(h('span', 'who', pt?.name ?? e.party), h('span', 'strength', e.strength));
    div.append(head, h('p', 'bias-title', e.title), h('p', '', e.text));
    const url = /https?:\/\/\S+/.exec(e.source);
    const src = h('p', 'src');
    if (url) {
      src.append(e.source.slice(0, url.index).replace(/[:\s]+$/, '') + ' · ');
      const a = h('a', '', 'source');
      a.href = url[0]; a.target = '_blank'; a.rel = 'noopener';
      src.append(a);
    } else src.textContent = e.source;
    div.append(src);
    return div;
  }

  private biasSection(n: number) {
    const sec = h('section', 'bias-box');
    sec.append(h('h3', '', 'Who shaped this scene?'));
    const here = this.bias.entries.filter((e) => e.scenes && n >= e.scenes[0] && n <= e.scenes[1]);
    if (here.length) here.forEach((e) => sec.append(this.biasItem(e)));
    else sec.append(h('p', 'muted small', 'Nothing flagged here. Look for coloured tags along the top of the tapestry.'));
    const whole = h('details', 'bias-whole');
    whole.append(h('summary', '', 'Agendas across the whole tapestry'));
    this.bias.entries.filter((e) => !e.scenes).forEach((e) => whole.append(this.biasItem(e)));
    sec.append(whole);
    return sec;
  }

  /* --------------------------------------------------------------- people */
  private renderPeople(s: State) {
    const root = this.peopleEl;
    root.replaceChildren();
    if (s.selected) {
      const c = this.chars.get(s.selected)!;
      const figs = this.figuresOf(c.id).slice().sort((a, b) => a.x0 - b.x0);
      const card = h('article', `person-card kind-${c.kind}`);
      const top = h('div', 'person-top');
      const close = h('button', 'icon-btn', '×');
      close.type = 'button';
      close.setAttribute('aria-label', 'Close and show everyone');
      close.addEventListener('click', () => store.set({ selected: null }));
      const titles = h('div');
      titles.append(h('p', 'eyebrow', c.role), h('h2', '', c.name));
      top.append(titles, close);
      const lat = h('p', 'titulus', c.latin);
      lat.lang = 'la';
      card.append(top, lat, h('p', '', c.bio));
      if (c.kind === 'place' && c.place) {
        const b = h('button', 'btn', 'Show on map');
        b.type = 'button';
        b.addEventListener('click', () => store.emit('place', c.place));
        card.append(b);
      }
      if (figs.length) {
        card.append(h('h3', 'small-head', figs.length > 1 ? `Appears ${figs.length} times` : 'Appears once'));
        const list = h('div', 'appear');
        figs.forEach((f) => {
          const b = h('button', 'appear-btn');
          b.type = 'button';
          b.innerHTML = '<b></b><span></span>';
          b.querySelector('b')!.textContent = `Scene ${f.scene}`;
          b.querySelector('span')!.textContent = f.note ?? '';
          b.addEventListener('click', () => this.goToFigure(f));
          list.append(b);
        });
        card.append(list);
        const nav = h('div', 'appear-nav');
        const prev = h('button', 'btn', '‹ Previous');
        const next = h('button', 'btn', 'Next ›');
        prev.type = next.type = 'button';
        const step = (dir: number) => {
          const cur = s.p;
          const sorted = figs.map((f) => ({ f, sc: f.scene }));
          const target = dir > 0 ? sorted.find((o) => o.sc > Math.round(cur)) : [...sorted].reverse().find((o) => o.sc < Math.round(cur));
          if (target) this.goToFigure(target.f);
        };
        prev.addEventListener('click', () => step(-1));
        next.addEventListener('click', () => step(1));
        nav.append(prev, next);
        card.append(nav);
      } else {
        card.append(h('p', 'muted small', 'Not yet marked on the tapestry.'));
      }
      card.append(h('p', 'muted small look', `How to spot: ${c.lookFor}`));
      root.append(card);
    } else {
      root.append(h('p', 'muted small', 'Tap a highlighted figure on the tapestry, or pick someone here.'));
    }
    const groups: [Character['kind'], string][] = [['person', 'People'], ['place', 'Places'], ['object', 'Things']];
    for (const [kind, label] of groups) {
      const sec = h('section', 'people-group');
      sec.append(h('h3', 'small-head', label));
      const grid = h('div', 'people-grid');
      for (const c of this.chars.values()) {
        if (c.kind !== kind) continue;
        const n = this.figuresOf(c.id).length;
        const b = h('button', `person-btn kind-${kind}${c.id === s.selected ? ' on' : ''}`);
        b.type = 'button';
        b.innerHTML = '<b></b><span></span>';
        b.querySelector('b')!.textContent = c.name;
        b.querySelector('span')!.textContent = n ? `${n} ×` : '–';
        b.addEventListener('click', () => store.emit('select', { id: c.id, figure: this.figuresOf(c.id)[0] }));
        grid.append(b);
      }
      sec.append(grid);
      root.append(sec);
    }
  }

  /* --------------------------------------------------------------- why */
  private renderWhy(s: State) {
    const cols = ARGUMENT.columns;
    let ci = cols.findIndex((c) => s.scene >= c.scenes[0] && s.scene <= c.scenes[1]);
    if (ci < 0) ci = 0;
    if (ci === this.lastCol && s.tab !== 'why') return;
    if (ci === this.lastCol && this.whyEl.childElementCount) {
      this.whyEl.querySelectorAll<HTMLElement>('.wnode').forEach((el) => {
        const sc = el.dataset.scenes?.split('-').map(Number);
        el.classList.toggle('current', !!sc && s.scene >= sc[0] && s.scene <= sc[1]);
      });
      return;
    }
    this.lastCol = ci;
    const col = cols[ci];
    const root = this.whyEl;
    root.replaceChildren();
    const head = h('div', 'why-head');
    const prev = h('button', 'icon-btn', '‹');
    const next = h('button', 'icon-btn', '›');
    prev.type = next.type = 'button';
    prev.setAttribute('aria-label', 'Previous step');
    next.setAttribute('aria-label', 'Next step');
    prev.disabled = ci === 0;
    next.disabled = ci === cols.length - 1;
    prev.addEventListener('click', () => this.goToScene(Math.max(1, cols[ci - 1].scenes[0])));
    next.addEventListener('click', () => this.goToScene(cols[ci + 1].scenes[0]));
    const t = h('div', 'why-title');
    t.append(h('p', 'eyebrow', `Step ${ci + 1} of ${cols.length}${col.scenes[0] < 1 ? ' · before the tapestry' : col.scenes[0] === col.scenes[1] ? ` · scene ${col.scenes[0]}` : ` · scenes ${col.scenes[0]}–${col.scenes[1]}`}`),
      h('h2', '', col.label));
    head.append(prev, t, next);
    root.append(head);

    const steps = h('ol', 'why-steps');
    cols.forEach((c, i) => {
      const li = h('li', i === ci ? 'on' : i < ci ? 'past' : '');
      li.title = c.label;
      steps.append(li);
    });
    root.append(steps);

    const nodes = ARGUMENT.nodes.filter((n) => n.col === col.id);
    const edges = ARGUMENT.edges;
    const byId = new Map(ARGUMENT.nodes.map((n) => [n.id, n]));
    for (const lane of ['norman', 'shown', 'english'] as const) {
      const ln = nodes.filter((n) => n.lane === lane);
      if (!ln.length) continue;
      const sec = h('section', `lane lane-${lane}`);
      sec.append(h('h3', 'lane-name', LANE_NAME[lane]));
      for (const n of ln) {
        const b = h('button', `wnode${n.kind === 'context' ? ' context' : ''}${n.key ? ' key' : ''}`);
        b.type = 'button';
        if (n.scenes) {
          b.dataset.scenes = `${n.scenes[0]}-${n.scenes[1]}`;
          b.classList.toggle('current', s.scene >= n.scenes[0] && s.scene <= n.scenes[1]);
        }
        b.append(h('b', '', n.title), h('span', '', n.text));
        const meta = n.kind === 'context' ? 'Not embroidered' : n.scenes ? (n.scenes[0] === n.scenes[1] ? `Scene ${n.scenes[0]}` : `Scenes ${n.scenes[0]}–${n.scenes[1]}`) : '';
        if (meta) b.append(h('small', '', meta));
        const from = edges.filter(([a, bb]) => bb === n.id && byId.get(a)?.col !== n.col).map(([a]) => byId.get(a)!.title);
        const to = edges.filter(([a, bb]) => a === n.id && byId.get(bb)?.col !== n.col).map(([, bb]) => byId.get(bb)!.title);
        if (from.length) b.append(h('small', 'link-from', `Because: ${from.join('; ')}`));
        if (to.length) b.append(h('small', 'link-to', `Leads to: ${to.join('; ')}`));
        b.addEventListener('click', () => { if (n.scenes) this.goToScene(n.scenes[0]); });
        sec.append(b);
      }
      root.append(sec);
    }
  }
}
