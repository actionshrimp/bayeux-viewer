import './styles.css';
import type { BiasData, Character, Figure, PenisData, Scene, StripData } from './types';
import scenesJson from './data/scenes.json';
import charactersJson from './data/characters.json';
import figuresJson from './data/figures.json';
import biasJson from './data/bias.json';
import penisJson from './data/penises.json';
import { JOURNEYS as STORY } from './data/journeys';
import { Timeline, buildMarkers, dateFor, journeyForScene, sceneAt, N_SCENES } from './story';
import { store, type Layers, type State } from './store';
import { Strip } from './strip';
import { Panel } from './panel';
import { StoryMap } from './map3d';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const scenes = scenesJson as Scene[];
const chars = new Map((charactersJson as Character[]).map((c) => [c.id, c]));
const figures = figuresJson as Figure[];
const sceneByN = new Map(scenes.map((s) => [s.n, s]));

async function boot() {
  const [strip, hi] = await Promise.all([
    fetch('img/tapestry/strip.json').then((r) => r.json() as Promise<StripData>),
    fetch('img/tapestry/hi/manifest.json').then((r) => (r.ok ? r.json() : [])).catch(() => []) as Promise<{ file: string }[]>,
  ]);
  const tl = new Timeline(buildMarkers(strip));

  const hash = /^#scene-(\d+)$/.exec(location.hash);
  const startP = hash ? Math.min(N_SCENES, Math.max(1, +hash[1])) : 1;
  store.init({
    p: startP, scene: sceneAt(startP), sceneData: sceneByN.get(sceneAt(startP))!,
    journey: journeyForScene(sceneAt(startP)), selected: null, tab: 'scene',
  });

  const stripView = new Strip($('strip'), strip, tl, figures, chars, biasJson as BiasData, penisJson as PenisData, hi.map((h) => h.file));
  const panel = new Panel($('panel'), chars, figures, biasJson as BiasData, penisJson as PenisData);
  panel.goToFigure = (f) => stripView.goToFigure(f);
  panel.goToScene = (n) => stripView.goToScene(n);
  const map = new StoryMap($('map'));

  /* ------------------------------------------------ scroll -> state */
  const stripEl = $('strip');
  let raf = 0;
  stripEl.addEventListener('scroll', () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const p = tl.pFromX(stripView.centreX());
      const n = sceneAt(p);
      const cur = store.get();
      store.set({
        p,
        ...(n !== cur.scene ? { scene: n, sceneData: sceneByN.get(n)!, journey: journeyForScene(n) } : {}),
      });
      stripView.onScroll();
    });
  }, { passive: true });

  /* ------------------------------------------------ render */
  const announce = $('announce');
  let announceTimer = 0;
  store.subscribe((s, prev) => {
    map.update(s);
    stripView.update(s);
    panel.update(s);
    updateChrome(s, prev);
    if (s.scene !== prev.scene) {
      clearTimeout(announceTimer);
      announceTimer = window.setTimeout(() => {
        announce.textContent = `Scene ${s.scene}: ${s.sceneData.title}`;
      }, 700);
      try { history.replaceState(null, '', `#scene-${s.scene}`); } catch { /* ignore */ }
    }
  });

  function updateChrome(s: State, prev: State) {
    const d = dateFor(s.scene);
    $('needle-label').textContent = `Scene ${s.scene} · ${d.year}`;
    if ($('when-year').textContent !== d.year) {
      const w = $('when');
      w.classList.remove('flash'); void w.offsetWidth; w.classList.add('flash');
    }
    $('when-year').textContent = d.year;
    $('when-text').textContent = d.when;
    $('when').title = [d.note, d.jump].filter(Boolean).join(' ');
    document.querySelectorAll<HTMLElement>('.jchip').forEach((b) => {
      const on = b.dataset.id === s.journey.id;
      b.classList.toggle('on', on);
      b.setAttribute('aria-current', on ? 'true' : 'false');
      if (on && s.journey !== prev.journey) b.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    });
    (Object.keys(s.layers) as (keyof Layers)[]).forEach((k) => {
      const el = document.getElementById(`layer-${k}`) as HTMLInputElement | null;
      if (el) el.checked = s.layers[k];
    });
    const k = ov.clientWidth / strip.total;
    const vw = stripEl.clientWidth / stripView.scale;
    ovWin.style.left = `${(stripView.centreX() - vw / 2) * k}px`;
    ovWin.style.width = `${Math.max(4, vw * k)}px`;
  }

  /* ------------------------------------------------ journey chips + overview */
  for (const j of STORY.journeys) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'jchip';
    b.dataset.id = j.id;
    b.style.setProperty('--c', j.color);
    b.innerHTML = '<i aria-hidden="true"></i>';
    b.append(j.short);
    b.title = `${j.name}, ${j.date}`;
    b.addEventListener('click', () => stripView.goToScene(j.scenes[0]));
    $('journey-chips').append(b);
  }
  const ov = $('overview'), ovWin = $('ov-win');
  for (const j of STORY.journeys) {
    const seg = document.createElement('div');
    seg.className = 'ov-seg';
    seg.style.setProperty('--c', j.color);
    ov.append(seg);
    const lay = () => {
      const k = ov.clientWidth / strip.total;
      seg.style.left = `${tl.xFromP(j.scenes[0] - 0.5) * k}px`;
      seg.style.width = `${(tl.xFromP(j.scenes[1] + 0.5) - tl.xFromP(j.scenes[0] - 0.5)) * k}px`;
    };
    new ResizeObserver(lay).observe(ov);
  }
  const seek = (e: PointerEvent) => {
    const r = ov.getBoundingClientRect();
    stripView.stop();
    stripView.goToX(((e.clientX - r.left) / r.width) * strip.total, false);
  };
  ov.addEventListener('pointerdown', (e) => {
    ov.setPointerCapture(e.pointerId);
    seek(e);
    const mv = (ev: PointerEvent) => seek(ev);
    ov.addEventListener('pointermove', mv);
    ov.addEventListener('pointerup', () => ov.removeEventListener('pointermove', mv), { once: true });
  });

  /* ------------------------------------------------ events */
  store.on('select', ({ id, figure }: { id: string; figure?: Figure }) => {
    store.set({ selected: id, tab: 'people' });
    if (figure) stripView.goToFigure(figure);
    const c = chars.get(id);
    if (c?.kind === 'place' && c.place && store.get().layers.people) map.flyToPlace(c.place);
  });
  store.on('place', (id: string) => map.flyToPlace(id));

  $('btn-prev').addEventListener('click', () => { stripView.stop(); stripView.goToScene(store.get().scene - 1); });
  $('btn-next').addEventListener('click', () => { stripView.stop(); stripView.goToScene(store.get().scene + 1); });
  $('btn-play').addEventListener('click', () => stripView.toggle());
  stripView.onPlayChange = (on) => {
    // Playing returns to the normal view rather than spotlighting one person.
    if (on && store.get().selected) store.set({ selected: null });
    $('btn-play').textContent = on ? '❚❚' : '▶';
    $('btn-play').setAttribute('aria-label', on ? 'Pause' : 'Play');
  };
  const zoomBtns = () => {
    ($('btn-zin') as HTMLButtonElement).disabled = stripView.zoom >= stripView.zoomLevels - 1;
    ($('btn-zout') as HTMLButtonElement).disabled = stripView.zoom <= 0;
  };
  $('btn-zin').addEventListener('click', () => { stripView.setZoom(stripView.zoom + 1); zoomBtns(); });
  $('btn-zout').addEventListener('click', () => { stripView.setZoom(stripView.zoom - 1); zoomBtns(); });
  zoomBtns();

  map.onFollowChange = (on) => {
    $('btn-follow').classList.toggle('is-on', on);
    $('btn-follow').setAttribute('aria-pressed', String(on));
  };
  $('btn-follow').addEventListener('click', () => map.setFollow(true));
  $('btn-whole').addEventListener('click', () => map.showWholeStory(store.get().layers.context));

  $('jump').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('jump-n') as HTMLInputElement;
    const n = parseInt(input.value, 10);
    if (n >= 1 && n <= N_SCENES) { stripView.goToScene(n); input.value = ''; input.blur(); }
    else input.setCustomValidity('Enter a scene from 1 to 58'), input.reportValidity(), setTimeout(() => input.setCustomValidity(''), 2000);
  });

  // Map show/hide (gives the tapestry and text more room on a phone).
  const app = $('app');
  const setMap = (open: boolean) => {
    app.dataset.map = open ? 'open' : 'closed';
    $('btn-map').setAttribute('aria-pressed', String(open));
    try { localStorage.setItem('bayeux-v2-map', open ? '1' : '0'); } catch { /* ignore */ }
    requestAnimationFrame(() => { map.map.resize(); stripView.layout(); });
  };
  $('btn-map').addEventListener('click', () => setMap(app.dataset.map !== 'open'));
  try { if (localStorage.getItem('bayeux-v2-map') === '0') setMap(false); } catch { /* ignore */ }

  // Layers popover.
  const pop = $('layers'), lb = $('btn-layers');
  const setPop = (open: boolean) => { pop.hidden = !open; lb.setAttribute('aria-expanded', String(open)); };
  lb.addEventListener('click', (e) => { e.stopPropagation(); setPop(!!pop.hidden); });
  document.addEventListener('click', (e) => { if (!pop.hidden && !pop.contains(e.target as Node)) setPop(false); });
  (['people', 'bias', 'penis', 'context'] as (keyof Layers)[]).forEach((k) => {
    $(`layer-${k}`).addEventListener('change', (e) => store.setLayer(k, (e.target as HTMLInputElement).checked));
  });

  // Keep the screen awake while reading in the gallery.
  let wake: WakeLockSentinel | null = null;
  const awake = $('opt-awake') as HTMLInputElement;
  const requestWake = async () => {
    try { wake = await navigator.wakeLock?.request('screen') ?? null; } catch { awake.checked = false; }
  };
  awake.addEventListener('change', () => { if (awake.checked) requestWake(); else { wake?.release(); wake = null; } });
  document.addEventListener('visibilitychange', () => { if (awake.checked && document.visibilityState === 'visible') requestWake(); });
  if (!('wakeLock' in navigator)) awake.closest('label')!.hidden = true;

  // Keyboard.
  document.addEventListener('keydown', (ev) => {
    const t = ev.target as HTMLElement;
    if (t.closest('input, textarea, select')) return;
    if (ev.key === 'ArrowRight') { ev.preventDefault(); stripView.stop(); stripView.goToScene(store.get().scene + 1); }
    else if (ev.key === 'ArrowLeft') { ev.preventDefault(); stripView.stop(); stripView.goToScene(store.get().scene - 1); }
    else if (ev.key === ' ' && !t.closest('button, summary, a')) { ev.preventDefault(); stripView.toggle(); }
    else if (ev.key === '+' || ev.key === '=') { stripView.setZoom(stripView.zoom + 1); zoomBtns(); }
    else if (ev.key === '-') { stripView.setZoom(stripView.zoom - 1); zoomBtns(); }
    else if (ev.key === 'Escape') { setPop(false); if (store.get().selected) store.set({ selected: null }); }
  });

  // Test/share flags: ?bias ?penis ?context ?people=0 ?tab=why ?select=harold ?zoom=2 ?nomap
  const q = new URLSearchParams(location.search);
  const layerPatch: Partial<Layers> = {};
  for (const k of ['bias', 'penis', 'context'] as const) if (q.has(k)) layerPatch[k] = true;
  if (q.get('people') === '0') layerPatch.people = false;
  if (Object.keys(layerPatch).length) store.set({ layers: { ...store.get().layers, ...layerPatch } });
  if (q.get('tab')) store.set({ tab: q.get('tab') as State['tab'] });
  if (q.has('nomap')) setMap(false);

  stripView.layout();
  if (q.get('zoom')) { stripView.setZoom(+q.get('zoom')!); zoomBtns(); }
  if (q.get('select')) {
    const id = q.get('select')!;
    store.emit('select', { id, figure: panel.figuresOf(id)[0] });
  }
  store.set({ p: store.get().p }); // first render

  setupOffline(strip);
  // Handy for debugging and automated checks.
  (window as unknown as { bayeux: unknown }).bayeux = { map, strip: stripView, store, panel };
}

/* ------------------------------------------------ offline (PWA) */
function setupOffline(strip: StripData) {
  if (!('serviceWorker' in navigator) || !window.isSecureContext || import.meta.env.DEV) return;
  navigator.serviceWorker.register('sw.js').catch(() => {});
  const btn = $('btn-offline') as HTMLButtonElement;
  const status = $('offline-status');
  btn.hidden = false;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    const urls = strip.images.map((im) => `img/tapestry/${im.file}`);
    const cache = await caches.open('bayeux-v2-runtime');
    let done = 0;
    for (const u of urls) {
      try { await cache.add(u); } catch { /* keep going */ }
      done++;
      status.textContent = `Saving tapestry images… ${done} / ${urls.length}`;
    }
    status.textContent = 'Saved. The viewer now works without a connection.';
    btn.disabled = false;
  });
}

boot();
