// Phone Stage: drop a design onto a 3D phone, animate it, export it.

import { createStage, FINISHES, SCREEN_ASPECT } from './stage.js';
import { MOTIONS } from './motion.js';
import { BACKGROUNDS, paintBackground } from './backgrounds.js';
import { loadMedia, paintScreen, paintPlaceholder, ACCEPT } from './media.js';
import { exportClip, FORMATS, isCancelled, videoSupported } from './exporter.js';

const $ = (id) => document.getElementById(id);

const ASPECTS = { '16:9': [16, 9], '1:1': [1, 1], '4:5': [4, 5], '9:16': [9, 16] };
const VIDEO_FPS = [24, 30, 60];
const GIF_FPS = [12, 15, 20];

// ---- settings (remembered between visits) ---------------------------------------------
const DEFAULTS = {
  fit: 'cover', screenFill: '#000000',
  finish: 'midnight', zoom: 1, island: true, shadow: true,
  motion: 'sway', amount: 1, duration: 6,
  background: 'studio', customColor: '#f4f1ff',
  aspect: '16:9', format: 'mp4', quality: '1', fps: 30, gifFps: 15,
};
const STORE = 'phone-stage:settings';
const state = { ...DEFAULTS };
try {
  Object.assign(state, JSON.parse(localStorage.getItem(STORE) || '{}'));
} catch {}
if (!MOTIONS[state.motion]) state.motion = DEFAULTS.motion;
if (!BACKGROUNDS[state.background]) state.background = DEFAULTS.background;
if (!FINISHES[state.finish]) state.finish = DEFAULTS.finish;
const save = () => {
  try { localStorage.setItem(STORE, JSON.stringify(state)); } catch {}
};

// ---- scene ------------------------------------------------------------------------------
const stage = createStage();
const view = $('view');
const viewCtx = view.getContext('2d');
const screenCtx = stage.screenCanvas.getContext('2d');
let media = null;
let playing = true;
let exporting = false;
let t = 0; // seconds into the loop

const pose = (time) => MOTIONS[state.motion].pose((((time % state.duration) + state.duration) % state.duration) / state.duration, state.amount);

function paintScreenAt(time) {
  const { width: w, height: h } = stage.screenCanvas;
  if (media) paintScreen(screenCtx, w, h, media.drawable(time), media.width, media.height, state.fit, state.screenFill);
  else paintPlaceholder(screenCtx, w, h, time);
  stage.updateScreen();
}

// Background + phone at `time`, into a 2D canvas of w × h.
function compose(ctx, w, h, time, allowTransparent) {
  if (state.background === 'transparent' && !allowTransparent) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
  } else {
    paintBackground(ctx, w, h, state.background, state.customColor);
  }
  paintScreenAt(time);
  stage.frame(w, h, state.zoom);
  ctx.drawImage(stage.render(pose(time), { island: state.island, shadow: state.shadow }), 0, 0, w, h);
}

function outputSize(format = state.format) {
  const [aw, ah] = ASPECTS[state.aspect];
  const short = (format === 'gif' ? 600 : 1080) * Number(state.quality);
  const even = (n) => Math.max(2, Math.round(n / 2) * 2);
  return aw >= ah ? { w: even((short * aw) / ah), h: even(short) } : { w: even(short), h: even((short * ah) / aw) };
}

// ---- preview ----------------------------------------------------------------------------
function sizeView() {
  const box = $('stageFrame').getBoundingClientRect();
  const [aw, ah] = ASPECTS[state.aspect];
  const scale = Math.min(box.width / aw, box.height / ah);
  const cssW = Math.max(1, Math.floor(aw * scale));
  const cssH = Math.max(1, Math.floor(ah * scale));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  view.style.width = `${cssW}px`;
  view.style.height = `${cssH}px`;
  view.width = Math.round(cssW * dpr);
  view.height = Math.round(cssH * dpr);
  view.classList.toggle('is-transparent', state.background === 'transparent');
}
new ResizeObserver(sizeView).observe($('stageFrame'));

let last = performance.now();
function loop(now) {
  if (!exporting) {
    if (playing) t = (t + (now - last) / 1000) % state.duration;
    compose(viewCtx, view.width, view.height, t, true);
    $('scrub').value = t / state.duration;
    $('clock').textContent = `${t.toFixed(1)}s`;
  }
  last = now;
  requestAnimationFrame(loop);
}

function setPlaying(on) {
  playing = on;
  $('play').textContent = on ? '❚❚' : '▶';
  $('play').setAttribute('aria-label', on ? 'pause' : 'play');
}
$('play').addEventListener('click', () => setPlaying(!playing));
$('scrub').addEventListener('input', (e) => {
  setPlaying(false);
  t = Number(e.target.value) * state.duration;
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !e.target.closest('input, button, dialog')) {
    e.preventDefault();
    setPlaying(!playing);
  }
});

// ---- controls -----------------------------------------------------------------------------
function segmented(id, key, after) {
  const root = $(id);
  const sync = () => root.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value) === String(state[key])));
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    state[key] = isNaN(Number(b.dataset.value)) || key === 'quality' ? b.dataset.value : Number(b.dataset.value);
    sync();
    save();
    after?.();
  });
  sync();
  return sync;
}

function swatches(id, entries, key, paint, after) {
  const root = $(id);
  for (const [value, info] of Object.entries(entries)) {
    const b = document.createElement('button');
    b.className = 'swatch';
    b.title = info.label;
    b.setAttribute('aria-label', info.label);
    paint(b, value, info);
    b.addEventListener('click', () => {
      state[key] = value;
      sync();
      save();
      after?.();
    });
    root.append(b);
  }
  const sync = () => [...root.children].forEach((b, i) => b.setAttribute('aria-pressed', Object.keys(entries)[i] === state[key]));
  sync();
}

function range(id, key, after) {
  const input = $(id);
  input.value = state[key];
  input.addEventListener('input', () => {
    state[key] = Number(input.value);
    save();
    after?.();
  });
}

function toggle(id, key) {
  const input = $(id);
  input.checked = state[key];
  input.addEventListener('change', () => {
    state[key] = input.checked;
    save();
  });
}

// Design
segmented('fit', 'fit', () => ($('screenFillField').hidden = state.fit !== 'contain'));
$('screenFillField').hidden = state.fit !== 'contain';
$('screenFill').value = state.screenFill;
$('screenFill').addEventListener('input', (e) => { state.screenFill = e.target.value; save(); });

// Phone
swatches('finish', FINISHES, 'finish', (b, _, f) => (b.style.background = f.color), () => stage.setFinish(state.finish));
stage.setFinish(state.finish);
range('zoom', 'zoom');
toggle('island', 'island');
toggle('shadow', 'shadow');

// Motion
for (const [key, m] of Object.entries(MOTIONS)) {
  const b = document.createElement('button');
  b.className = 'motion';
  b.dataset.value = key;
  b.innerHTML = `<b>${m.label}</b><small>${m.hint}</small>`;
  $('motion').append(b);
}
segmented('motion', 'motion');
range('amount', 'amount');
const showDuration = () => ($('durationValue').textContent = `${state.duration.toFixed(1)}s`);
range('duration', 'duration', () => { showDuration(); updateInfo(); });
showDuration();
$('matchMedia').addEventListener('click', () => {
  if (!media?.duration) return;
  state.duration = Math.round(media.duration * 100) / 100;
  $('duration').value = state.duration;
  showDuration();
  updateInfo();
  save();
  toast(`Loop set to ${state.duration.toFixed(2)}s to match “${media.name}”.`);
});

// Background
swatches('background', BACKGROUNDS, 'background', (b, key, info) => {
  if (key === 'transparent') b.classList.add('swatch--none');
  else if (key === 'custom') b.classList.add('swatch--solid');
  else b.style.background = info.swatch;
}, () => { syncBackground(); sizeView(); });
function syncBackground() {
  $('customColorField').hidden = state.background !== 'custom';
  $('bgNote').hidden = state.background !== 'transparent';
}
syncBackground();
$('customColor').value = state.customColor;
$('customColor').addEventListener('input', (e) => { state.customColor = e.target.value; save(); });

// Export settings
segmented('aspect', 'aspect', () => { sizeView(); updateInfo(); });
segmented('quality', 'quality', updateInfo);
const syncFormat = segmented('format', 'format', () => { buildFps(); updateInfo(); });
function buildFps() {
  const isGif = state.format === 'gif';
  const key = isGif ? 'gifFps' : 'fps';
  $('fpsField').hidden = state.format === 'png';
  $('fps').innerHTML = (isGif ? GIF_FPS : VIDEO_FPS).map((f) => `<button data-value="${f}">${f}</button>`).join('');
  $('fps').onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    state[key] = Number(b.dataset.value);
    save();
    syncFps();
    updateInfo();
  };
  const syncFps = () => $('fps').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', Number(b.dataset.value) === state[key]));
  syncFps();
}
buildFps();
syncFormat();

function updateInfo() {
  const { w, h } = outputSize();
  const fps = state.format === 'gif' ? state.gifFps : state.fps;
  const what = state.format === 'png' ? 'one frame' : `${state.duration.toFixed(1)}s · ${Math.round(state.duration * fps)} frames`;
  $('outputInfo').textContent = `${w}×${h} · ${what}. ${FORMATS[state.format].note}.`;
  $('exportButton').textContent = `Export ${FORMATS[state.format].label}`;
}
updateInfo();

// ---- loading designs ------------------------------------------------------------------------
$('fileInput').accept = ACCEPT;
$('fileInput').addEventListener('change', (e) => e.target.files[0] && useFile(e.target.files[0]));

async function useFile(file) {
  try {
    const next = await loadMedia(file);
    media?.dispose();
    media = next;
    $('fileLabel').textContent = `${media.name} · ${media.width}×${media.height}${media.duration ? ` · ${media.duration.toFixed(1)}s` : ''}`;
    $('mediaNote').hidden = !media.note;
    $('mediaNote').textContent = media.note ?? '';
    $('matchMedia').hidden = !media.duration;
    if (media.duration && Math.abs(media.duration - state.duration) > 0.05) {
      toast('Tip: “Match the video/GIF length” makes the export loop seamlessly.');
    }
  } catch (e) {
    toast(e.message);
  }
}

// Drop anywhere on the window.
let dragDepth = 0;
const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');
window.addEventListener('dragenter', (e) => {
  if (!hasFiles(e)) return;
  dragDepth++;
  $('dropOverlay').hidden = false;
});
window.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) $('dropOverlay').hidden = true;
});
window.addEventListener('dragover', (e) => hasFiles(e) && e.preventDefault());
window.addEventListener('drop', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  $('dropOverlay').hidden = true;
  const file = e.dataTransfer.files[0];
  if (file) useFile(file);
});
// Paste an image (e.g. "Copy as PNG" from Figma).
window.addEventListener('paste', (e) => {
  const file = [...(e.clipboardData?.files ?? [])][0];
  if (file) useFile(file);
});

// ---- export -------------------------------------------------------------------------------
let abort = null;

// Renders the whole clip to a Blob. Also available as window.phoneStage.exportBlob().
async function exportBlob(format = state.format, onProgress) {
  const { w, h } = outputSize(format);
  const fps = format === 'gif' ? state.gifFps : state.fps;
  const allowTransparent = format === 'webm' || format === 'png';
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d', { willReadFrequently: format === 'gif' });
  const start = format === 'png' ? t : 0; // PNG = the moment you're looking at
  abort = new AbortController();
  return exportClip({
    format, width: w, height: h, fps, duration: state.duration,
    transparent: allowTransparent && state.background === 'transparent',
    signal: abort.signal,
    onProgress,
    renderFrame: async (time) => {
      if (media) await media.seek(start + time);
      compose(ctx, w, h, start + time, allowTransparent);
      return out;
    },
  });
}

async function runExport() {
  if (exporting) return;
  const format = state.format;
  if ((format === 'mp4' || format === 'webm') && !videoSupported()) {
    toast('Video export needs Chrome, Edge or Safari 16.4+. GIF and PNG work everywhere.');
    return;
  }
  exporting = true;
  $('progressTitle').textContent = `Exporting ${FORMATS[format].label}…`;
  setProgress(0, 'Starting…');
  $('progress').showModal();
  try {
    const blob = await exportBlob(format, setProgress);
    const base = (media?.name ?? 'phone-stage').replace(/\.[^.]+$/, '');
    const name = `${base}-${state.motion}-${state.aspect.replace(':', 'x')}.${FORMATS[format].ext}`;
    download(blob, name);
    toast(`Saved ${name} · ${(blob.size / 1e6).toFixed(1)} MB`);
  } catch (e) {
    if (!isCancelled(e)) {
      console.error(e);
      toast(e.message || 'Export failed.');
    }
  } finally {
    exporting = false;
    $('progress').close();
    media?.resume?.();
  }
}

function setProgress(fraction, detail) {
  $('progressFill').style.width = `${Math.round(fraction * 100)}%`;
  $('progressDetail').textContent = detail;
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

$('exportButton').addEventListener('click', runExport);
$('cancelExport').addEventListener('click', () => abort?.abort());
$('progress').addEventListener('cancel', (e) => { e.preventDefault(); abort?.abort(); });

let toastTimer;
function toast(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($('toast').hidden = true), 4500);
}

// A small scripting hook (used for automated tests and batch exports).
window.phoneStage = { load: useFile, exportBlob, state, screenAspect: SCREEN_ASPECT };

sizeView();
requestAnimationFrame(loop);
