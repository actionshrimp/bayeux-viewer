/* Dev-only review tool for the horse pass. Shows one horse at a time from the 1200px tier,
 * lets you set its status and drag the genital marker, and saves to src/data/horses.json
 * through the dev server's /__data endpoint.
 */
import './review.css';
import type { Horse, StripData } from './types';
import { Timeline, buildMarkers, sceneAt } from './story';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

type Status = Horse['stallion'] | 'hidden';
interface ReviewHorse extends Horse { reviewed?: boolean; added?: boolean }

const canvas = $('view') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
let strip: StripData;
let horses: ReviewHorse[] = [];
let list: ReviewHorse[] = [];
let idx = 0;
let pad = 70;              // strip units of context around the horse
let view = { x0: 0, y0: 0, s: 1 }; // strip coords of canvas origin, canvas px per strip unit
const imgs = new Map<string, HTMLImageElement>();
let cuts: number[] = [];
let tl: Timeline;
let lastAdded: ReviewHorse | null = null;
let dataVersion = '';
let stale = false;

async function boot() {
  strip = await fetch('img/tapestry/strip.json').then((r) => r.json());
  const res = await fetch('/__data/horses');
  dataVersion = res.headers.get('X-Data-Version') ?? '';
  horses = await res.json();
  tl = new Timeline(buildMarkers(strip));
  const ims = strip.images;
  cuts = ims.map((im, i) => (ims[i + 1] ? (ims[i + 1].x + im.x + im.width) / 2 : im.x + im.width));
  $('filter').addEventListener('change', () => { buildList(); idx = 0; show(); });
  document.querySelectorAll<HTMLButtonElement>('.decide button').forEach((b) =>
    b.addEventListener('click', () => decide(b.dataset.s as Status)));
  $('prev').addEventListener('click', () => step(-1));
  $('next').addEventListener('click', () => step(1));
  bindCanvas();
  document.addEventListener('keydown', onKey);
  new ResizeObserver(() => draw()).observe($('stage'));
  buildList();
  show();
}

function buildList() {
  const f = ($('filter') as HTMLSelectElement).value;
  list = horses.filter((h) =>
    f === 'all' ? true
      : f === 'unreviewed' ? !h.reviewed
      : f === 'unclear' ? h.stallion === 'unclear' && h.gx != null
      : f === 'hidden' ? h.stallion === 'unclear' && h.gx == null
      : f === 'no-unchecked' ? h.stallion === 'no' && !h.reviewed
      : h.stallion === f);
}

const cur = () => list[idx];

function step(d: number) {
  if (!list.length) return;
  idx = Math.max(0, Math.min(list.length - 1, idx + d));
  show();
}

function show() {
  const h = cur();
  const item = $('item');
  if (!h) {
    item.innerHTML = '<p class="done">Nothing left in this filter.</p>';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  } else {
    item.innerHTML = `
      <p class="id">${h.id} · scene ${h.scene}${h.facing ? ` · facing ${h.facing}` : ''}</p>
      <p class="status s-${h.stallion}">${label(h)}${h.reviewed ? ' · reviewed' : ''}${h.added ? ' · added by you' : ''}</p>
      ${h.note ? `<p class="note"></p>` : ''}`;
    if (h.note) item.querySelector('.note')!.textContent = h.note;
    draw();
  }
  $('progress').textContent = list.length ? `${idx + 1} of ${list.length}` : '';
  totals();
}

function label(h: ReviewHorse) {
  if (h.stallion === 'yes') return 'Stallion';
  if (h.stallion === 'no') return 'Not a stallion';
  return h.gx == null ? "Can't tell (no marker)" : 'Unsure';
}

function totals() {
  const n = (s: string) => horses.filter((h) => h.stallion === s).length;
  const reviewed = horses.filter((h) => h.reviewed).length;
  $('totals').innerHTML = `<b>${n('yes')}</b> stallions <span>(Garnett: 88)</span><br>
    ${n('unclear')} unclear · ${n('no')} not · ${horses.length} horses · ${reviewed} reviewed`;
}

/* ------------------------------------------------------------------ drawing */
function image(file: string) {
  let im = imgs.get(file);
  if (!im) {
    im = new Image();
    im.src = `img/tapestry/hi/${file}`;
    im.onload = () => draw();
    imgs.set(file, im);
  }
  return im;
}

function draw() {
  const h = cur();
  if (!h) return;
  const box = $('stage').getBoundingClientRect();
  const dpr = devicePixelRatio || 1;
  const W = Math.floor(box.width), H = Math.floor(box.height);
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const rx0 = h.x0 - pad, rx1 = h.x1 + pad, ry0 = Math.max(0, h.y0 - pad), ry1 = Math.min(strip.height, h.y1 + pad);
  const s = Math.min(W / (rx1 - rx0), H / (ry1 - ry0));
  view = { x0: (rx0 + rx1) / 2 - W / s / 2, y0: (ry0 + ry1) / 2 - H / s / 2, s };
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingQuality = 'high';

  // Tapestry: each image clipped to its seam range, like the viewer.
  const vx1 = view.x0 + W / s;
  strip.images.forEach((im, i) => {
    const a = i === 0 ? im.x : cuts[i - 1], b = cuts[i];
    const lo = Math.max(a, view.x0), hi = Math.min(b, vx1);
    if (lo >= hi) return;
    const el = image(im.file);
    if (!el.complete || !el.naturalWidth) return;
    const k = el.naturalWidth / im.width; // hi px per strip unit for this image (≈2.5)
    ctx.drawImage(el, (lo - im.x) * k, 0, (hi - lo) * k, el.naturalHeight,
      (lo - view.x0) * s, (0 - view.y0) * s, (hi - lo) * s, strip.height * s);
  });

  // Neighbouring horses, dashed; this horse, solid.
  const toC = (x: number, y: number) => [(x - view.x0) * s, (y - view.y0) * s] as const;
  for (const o of horses) {
    if (o.x1 < view.x0 || o.x0 > vx1) continue;
    const [ax, ay] = toC(o.x0, o.y0), [bx, by] = toC(o.x1, o.y1);
    ctx.setLineDash(o === h ? [] : [5, 5]);
    ctx.strokeStyle = o === h ? 'rgba(255,255,255,.85)' : 'rgba(255,255,255,.35)';
    ctx.lineWidth = o === h ? 2 : 1;
    ctx.strokeRect(ax, ay, bx - ax, by - ay);
    if (o !== h && o.gx != null) dot(o.gx, o.gy!, o.added ? '#ff4f8b' : 'rgba(255,92,147,.45)', o.added ? 9 : 6);
  }
  ctx.setLineDash([]);
  if (h.gx != null) dot(h.gx, h.gy!, h.stallion === 'yes' ? '#ff4f8b' : '#ffb03a', Math.max(10, 9 * s));
}

function dot(x: number, y: number, color: string, r: number) {
  const [cx, cy] = [(x - view.x0) * view.s, (y - view.y0) * view.s];
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 2, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

/* ------------------------------------------------------------------ editing */
function bindCanvas() {
  let dragging = false;
  const setFrom = (e: PointerEvent) => {
    const h = cur();
    if (!h) return;
    const r = canvas.getBoundingClientRect();
    h.gx = Math.round(view.x0 + (e.clientX - r.left) / view.s);
    h.gy = Math.round(view.y0 + (e.clientY - r.top) / view.s);
    if (h.stallion === 'no') h.stallion = 'yes';
    draw();
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (e.shiftKey) { addAt(e); return; }
    dragging = true; canvas.setPointerCapture(e.pointerId); setFrom(e);
  });
  canvas.addEventListener('pointermove', (e) => { if (dragging) setFrom(e); });
  canvas.addEventListener('pointerup', () => {
    if (!dragging) return;
    dragging = false;
    const h = cur();
    if (h) { h.reviewed = true; show(); save(); }
  });
}

/** Shift+click: a new stallion marker as its own horse entry (for boxes that hold two horses). */
function addAt(e: PointerEvent) {
  const r = canvas.getBoundingClientRect();
  const x = Math.round(view.x0 + (e.clientX - r.left) / view.s);
  const y = Math.round(view.y0 + (e.clientY - r.top) / view.s);
  const n = horses.filter((h) => h.added).length + 1;
  const h: ReviewHorse = {
    id: `added-${String(n).padStart(3, '0')}-${Date.now() % 100000}`,
    x0: x - 45, y0: y - 80, x1: x + 45, y1: y + 40,
    stallion: 'yes', gx: x, gy: y, scene: sceneAt(tl.pFromX(x)),
    note: 'added in review', reviewed: true, added: true,
  };
  horses.push(h);
  lastAdded = h;
  horses.sort((a, b) => a.x0 - b.x0);
  save();
  buildList();
  show();
  $('save').textContent = `Added a marker in scene ${h.scene}. Press Delete to undo it.`;
}

function removeCurrent() {
  // Delete removes the horse you're on if you added it, otherwise undoes your latest addition.
  const h = cur()?.added ? cur() : lastAdded && horses.includes(lastAdded) ? lastAdded : null;
  if (!h) { $('save').textContent = 'Only markers you added can be deleted. Use N or H for the others.'; return; }
  if (h === lastAdded) lastAdded = null;
  horses.splice(horses.indexOf(h), 1);
  save();
  buildList();
  idx = Math.min(idx, Math.max(0, list.length - 1));
  show();
}

function decide(s: Status) {
  const h = cur();
  if (!h) return;
  if (s === 'hidden') {
    h.stallion = 'unclear';
    delete h.gx; delete h.gy;
  } else {
    h.stallion = s;
    if (s === 'no') { delete h.gx; delete h.gy; }
    if (s === 'yes' && h.gx == null) {
      // No point yet: start in the middle of the belly so it can be dragged into place.
      h.gx = Math.round((h.x0 + h.x1) / 2);
      h.gy = Math.round(h.y0 + (h.y1 - h.y0) * 0.55);
      h.reviewed = true;
      show(); save();
      return; // stay here so the new marker can be positioned
    }
  }
  h.reviewed = true;
  save();
  // Advance; if the item dropped out of the filter, the next one slides into this index.
  const before = h;
  buildList();
  const at = list.indexOf(before);
  idx = at >= 0 ? Math.min(list.length - 1, at + 1) : Math.min(idx, list.length - 1);
  show();
}

let saveTimer = 0;
// ?dry: never write (for testing without touching the real data).
const DRY = new URLSearchParams(location.search).has('dry');
function save() {
  if (DRY) { $('save').textContent = 'Dry run: not saved'; return; }
  clearTimeout(saveTimer);
  $('save').textContent = 'Saving…';
  saveTimer = window.setTimeout(async () => {
    if (stale) return;
    const res = await fetch('/__data/horses', { method: 'POST', body: JSON.stringify(horses), headers: { 'X-Data-Version': dataVersion } });
    if (res.ok) {
      dataVersion = res.headers.get('X-Data-Version') ?? dataVersion;
      $('save').textContent = `Saved ${new Date().toLocaleTimeString()}`;
    } else {
      stale = res.status === 409;
      $('save').textContent = `Not saved: ${await res.text()}`;
      $('save').classList.add('error');
    }
  }, 300);
}

function onKey(e: KeyboardEvent) {
  if ((e.target as HTMLElement).closest('select, input')) return;
  const k = e.key.toLowerCase();
  if (k === 'y') decide('yes');
  else if (k === 'n') decide('no');
  else if (k === 'u') decide('unclear');
  else if (k === 'h') decide('hidden');
  else if (k === 'arrowright' || k === ' ') { e.preventDefault(); step(1); }
  else if (k === 'arrowleft') step(-1);
  else if (k === '[') { pad = Math.min(400, pad * 1.5); draw(); }
  else if (k === ']') { pad = Math.max(15, pad / 1.5); draw(); }
  else if (k === 'delete' || k === 'backspace') { e.preventDefault(); removeCurrent(); }
}

boot();
