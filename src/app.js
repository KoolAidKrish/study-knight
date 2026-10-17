import { Scene } from './scene.js';
import { Timer, PRESETS } from './timer.js';
import { initScenery } from './scenery.js';
import { icon, hydrateIcons, installFrames } from './pixels.js';

installFrames();
hydrateIcons();

const $ = (id) => document.getElementById(id);
const PREFS = 'studyknight.prefs.v1';
const STATS = 'studyknight.stats.v1';

const load = (key, fallback) => {
  try { return { ...fallback, ...JSON.parse(localStorage.getItem(key)) }; } catch { return fallback; }
};
const store = (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} };

const prefs = load(PREFS, { autoStart: true, task: '' });
const stats = load(STATS, { days: {} });

const scene = new Scene($('scene'));
const timer = new Timer();
timer.restore();

// ---------------- pixel digits ----------------

const GLYPHS = {
  0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  3: ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  5: ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  6: ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  9: ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  ':': ['0', '1', '1', '0', '1', '1', '0'],
};

const digitsCanvas = $('digits');
let lastDigits = '';
function drawDigits(text, color) {
  const key = text + color;
  if (key === lastDigits) return;
  lastDigits = key;
  const glyphs = [...text].map((c) => GLYPHS[c]);
  const width = glyphs.reduce((w, g) => w + g[0].length + 1, 0);
  digitsCanvas.width = width + 1;
  digitsCanvas.height = 8;
  const ctx = digitsCanvas.getContext('2d');
  for (const [dx, dy, fill] of [[1, 1, '#0a0a18'], [0, 0, color]]) {
    ctx.fillStyle = fill;
    let x = 0;
    for (const g of glyphs) {
      g.forEach((row, y) => [...row].forEach((on, i) => on === '1' && ctx.fillRect(x + i + dx, y + dy, 1, 1)));
      x += g[0].length + 1;
    }
  }
}

function fmt(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, '0');
  if (m < 100) return `${String(m).padStart(2, '0')}:${ss}`;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${ss}`;
}

const fmtMins = (ms) => {
  const m = Math.round(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60 ? (m % 60) + 'm' : ''}`.trim() : `${m}m`;
};

// ---------------- stats ----------------

const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

timer.addEventListener('focuslogged', (e) => {
  const k = dayKey();
  stats.days[k] = (stats.days[k] || 0) + e.detail.ms;
  store(STATS, stats);
  renderStats();
});

function renderStats() {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push({ d, ms: stats.days[dayKey(d)] || 0 });
  }
  $('statToday').textContent = fmtMins(days[6].ms);
  $('statWeek').textContent = fmtMins(days.reduce((a, x) => a + x.ms, 0));

  let streak = 0;
  const d = new Date();
  if (!stats.days[dayKey(d)]) d.setDate(d.getDate() - 1); // today not started yet doesn't break it
  while (stats.days[dayKey(d)] >= 60000) { streak++; d.setDate(d.getDate() - 1); }
  $('statStreak').textContent = streak;

  // Bars snap to 4px steps so they read as pixel columns; the dashed line marks one hour.
  const max = Math.max(2 * 3600e3, ...days.map((x) => x.ms));
  const BAR = 64;
  const px = (ms) => Math.round(((ms / max) * BAR) / 4) * 4;
  $('week').innerHTML = `<div class="goal" style="bottom:${px(3600e3) + 27}px"><span>1h</span></div>` +
    days.map(({ d, ms }, i) => `
    <div class="day ${i === 6 ? 'today' : ''} ${ms ? 'has' : ''}" title="${fmtMins(ms)}">
      <div class="bar" style="height:${Math.max(2, px(ms))}px"></div>
      <small>${d.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2)}</small>
    </div>`).join('');
}

// ---------------- notifications ----------------

function notify(title, body) {
  if (window.desktop) return window.desktop.notify(title, body);
  if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body });
}

timer.addEventListener('segmentend', (e) => {
  const { prev, next, skipped } = e.detail;
  if (skipped) return;
  if (!next) {
    notify('Journey complete', `The knight made it through the night. ${fmtMins(timer.focusDone)} of focus.`);
  } else if (next.type === 'break') {
    notify(`Break: ${next.min} min`, 'The knight is making camp. Stand up, stretch, drink water.');
  } else {
    const len = next.min == null ? 'Focus until you drift.' : `${next.min} min of focus.`;
    notify('Back on the trail', len);
  }
});

// ---------------- HUD ----------------

const playBtn = $('playBtn');
const skipBtn = $('skipBtn');

function sceneMode() {
  const seg = timer.current;
  if (timer.status === 'done') return 'done';
  if (timer.status === 'ready') return 'idle';
  if (seg.type === 'break') return 'camp';
  return timer.status === 'running' ? 'study' : 'paused';
}

function render() {
  const seg = timer.current;
  const st = timer.status;
  const isBreak = seg.type === 'break' && st !== 'ready' && st !== 'done';
  document.body.classList.toggle('is-break', isBreak);
  document.body.classList.toggle('is-focus', !isBreak && (st === 'running' || st === 'paused'));

  document.body.classList.toggle('done', st === 'done');

  // ribbon
  let phase = 'Ready';
  let ico = 'flag';
  if (st === 'done') { phase = 'Journey complete'; ico = 'crown'; }
  else if (st === 'waiting') { phase = `Next: ${seg.type}`; ico = seg.type === 'break' ? 'tent' : 'sword'; }
  else if (st !== 'ready') {
    phase = (seg.type === 'break' ? 'Camp' : 'Focus') + (st === 'paused' ? ' · paused' : '');
    ico = seg.type === 'break' ? 'fire' : 'sword';
  }
  setHTML('phase', phase);
  setHTML('phaseIcon', icon(ico));

  const focusIdx = timer.segments.slice(0, timer.index + 1).filter((s) => s.type === 'focus').length;
  $('blockCount').textContent = timer.isFlow
    ? `Session ${Math.max(1, focusIdx)}`
    : `Block ${timer.index + 1} / ${timer.segments.length}`;

  // time
  const now = Date.now();
  const rem = timer.remaining(now);
  const text = rem === null ? fmt(timer.elapsed(now)) : fmt(rem);
  drawDigits(text, isBreak ? '#7fd1c7' : st === 'done' ? '#f4ecd8' : '#f2a65a');
  $('timeText').textContent = text;
  document.title = st === 'running' ? `${text} · ${isBreak ? 'Break' : 'Focus'} · Study Knight` : 'Study Knight';

  // buttons
  const label = {
    ready: 'Begin quest', running: 'Pause', paused: 'Resume', done: 'Again',
    waiting: seg.type === 'break' ? 'Make camp' : 'Back to it',
  }[st];
  setHTML('playLabel', label);
  setHTML('playIcon', icon(st === 'running' ? 'pause' : st === 'done' ? 'reset' : 'play'));
  playBtn.setAttribute('aria-label', label);
  const flowFocus = timer.isFlow && seg.type === 'focus';
  skipBtn.classList.toggle('wide', flowFocus);
  setHTML('skipIcon', icon(flowFocus ? 'tent' : 'skip'));
  setHTML('skipLabel', flowFocus ? 'Rest' : '');
  skipBtn.setAttribute('aria-label', flowFocus ? 'Take a break' : 'Skip to next block');
  skipBtn.title = flowFocus ? 'Take a break now (S)' : 'Skip to next block (S)';
  skipBtn.disabled = st === 'done' || (flowFocus && st === 'ready');

  renderXp(now);
  renderStrip(now);
  scene.setMode(sceneMode());
  scene.setSkyProgress(st === 'done' ? 1 : timer.progress(now));
  document.body.classList.toggle('locked', !(st === 'ready' || st === 'done'));
}

function setHTML(id, html) {
  const el = $(id);
  if (el.innerHTML !== html) el.innerHTML = html;
}

// Chunky progress bar for the current block (flowtime fills over 25 minutes, then loops).
function renderXp(now) {
  const seg = timer.current;
  const CELLS = 24;
  let f = 0;
  if (timer.status === 'done') f = 1;
  else if (timer.status !== 'ready') {
    f = seg.min == null ? (timer.elapsed(now) / (25 * 60000)) % 1 : timer.elapsed(now) / (seg.min * 60000);
  }
  const on = Math.floor(f * CELLS);
  let html = '';
  for (let i = 0; i < CELLS; i++) html += `<i class="${i < on ? 'on' : i === on && f > 0 && f < 1 ? 'tip' : ''}"></i>`;
  setHTML('xp', html);
}

// Journey trail: focus blocks are path segments, breaks are tents, the crown waits at the end.
function renderStrip(now) {
  let segs = timer.segments.map((s, i) => ({ ...s, i }));
  if (timer.isFlow) segs = segs.slice(-9);
  const st = timer.status;
  let html = segs.map((s) => {
    const past = s.i < timer.index || (s.i === timer.index && st === 'done');
    const cur = s.i === timer.index && st !== 'ready' && st !== 'done';
    if (s.type === 'break') {
      return `<span class="camp ${past ? 'done' : ''} ${cur ? 'now' : ''}" title="Break · ${s.min} min">${icon('tent')}</span>`;
    }
    const cls = ['seg'];
    let inner = '';
    if (past) cls.push('done');
    else if (cur) {
      if (s.min == null) {
        cls.push('open');
        inner = '<span class="pip" style="left:100%"></span>';
      } else {
        const pct = Math.min(100, (100 * timer.elapsed(now)) / (s.min * 60000)).toFixed(1);
        inner = `<span class="fill" style="width:${pct}%"></span><span class="pip" style="left:${pct}%"></span>`;
      }
    }
    return `<span class="${cls.join(' ')}" style="flex:${s.min ?? 30}" title="Focus · ${s.min ?? 'open'} min">${inner}</span>`;
  }).join('');
  if (!timer.isFlow) html += `<span class="end ${st === 'done' ? 'done' : ''}" title="Journey's end">${icon('crown')}</span>`;
  setHTML('strip', html);
}

playBtn.addEventListener('click', () => timer.toggle());
skipBtn.addEventListener('click', () => timer.skip(prefs.autoStart));
$('resetBtn').addEventListener('click', () => {
  // count partial focus before throwing the session away
  if (timer.current.type === 'focus' && (timer.status === 'running' || timer.status === 'paused')) {
    timer.dispatchEvent(new CustomEvent('focuslogged', { detail: { ms: timer.elapsed() } }));
  }
  timer.reset();
});

const task = $('task');
task.value = prefs.task;
task.addEventListener('input', () => { prefs.task = task.value; store(PREFS, prefs); });
task.addEventListener('keydown', (e) => { if (e.key === 'Enter') task.blur(); });

// ---------------- drawer: methods, builder, options ----------------

function renderMethods() {
  $('methods').innerHTML = PRESETS.map((p) => {
    const segs = methodSegments(p);
    const focus = segs.filter((s) => s.type === 'focus' && s.min).reduce((a, s) => a + s.min, 0);
    const time = p.flow ? 'open-ended' : `${fmtMins(focus * 60000)} focus`;
    const tl = segs.map((s) => (s.min == null
      ? '<span class="open" style="flex:40"></span>'
      : `<span class="${s.type === 'break' ? 'b' : ''}" style="flex:${s.min}"></span>`)).join('');
    return `
    <button class="method" role="radio" aria-checked="${p.id === timer.presetId}" data-id="${p.id}">
      <span class="method-top">
        <span class="method-name">${p.name}</span>
        <span class="method-time">${time}</span>
        <span class="method-check">${icon('check')}</span>
      </span>
      <span class="mtl" title="${p.pattern}">${tl}</span>
      <span class="method-blurb">${p.blurb}</span>
    </button>`;
  }).join('');
  document.body.classList.toggle('custom', !!timer.preset.custom);
  $('rounds').textContent = timer.rounds;
  $('roundsRow').style.display = timer.isFlow ? 'none' : '';
  renderBuilder();
  renderTotal();
}

// The block pattern a method card previews: the live plan for the selected method, defaults otherwise.
function methodSegments(p) {
  if (p.id === timer.presetId && !p.flow) return timer.segments;
  if (p.flow) return [{ type: 'focus', min: null }, { type: 'break', min: 8 }, { type: 'focus', min: null }, { type: 'break', min: 10 }];
  const round = p.custom ? timer.custom : p.round;
  return Array.from({ length: p.rounds }, () => round).flat();
}

function renderTotal() {
  if (timer.isFlow) {
    $('planTotal').textContent = 'Breaks: 5m under 25m · 8m under 50m · 10m under 90m · else 15m';
    return;
  }
  const focus = timer.segments.filter((s) => s.type === 'focus').reduce((a, s) => a + s.min, 0);
  const all = timer.segments.reduce((a, s) => a + s.min, 0);
  $('planTotal').textContent = `${fmtMins(focus * 60000)} of focus · ${fmtMins(all * 60000)} total`;
}

function renderBuilder() {
  $('builderRows').innerHTML = timer.custom.map((s, i) => `
    <div class="brow ${s.type}">
      <span class="tag">${s.type}</span>
      <input type="number" min="1" max="240" value="${s.min}" data-i="${i}" aria-label="${s.type} minutes" />
      <span class="unit">min</span>
      <button class="x" data-del="${i}" aria-label="Remove block">${icon('close')}</button>
    </div>`).join('');
}

$('methods').addEventListener('click', (e) => {
  const btn = e.target.closest('.method');
  if (!btn) return;
  const p = PRESETS.find((x) => x.id === btn.dataset.id);
  timer.reset({ presetId: p.id, rounds: p.rounds });
  renderMethods();
});

$('builderRows').addEventListener('change', (e) => {
  const i = e.target.dataset.i;
  if (i == null) return;
  const v = Math.min(240, Math.max(1, Math.round(+e.target.value || 1)));
  e.target.value = v;
  timer.custom[i].min = v;
  timer.reset({ custom: timer.custom });
  renderTotal();
});
$('builderRows').addEventListener('click', (e) => {
  const i = e.target.closest('[data-del]')?.dataset.del;
  if (i == null || timer.custom.length <= 1) return;
  timer.custom.splice(i, 1);
  timer.reset({ custom: timer.custom });
  renderMethods();
});
document.querySelector('.builder-add').addEventListener('click', (e) => {
  const type = e.target.closest('[data-add]')?.dataset.add;
  if (!type) return;
  timer.custom.push({ type, min: type === 'focus' ? 30 : 10 });
  timer.reset({ custom: timer.custom });
  renderMethods();
});

$('roundsDown').addEventListener('click', () => { timer.reset({ rounds: Math.max(1, timer.rounds - 1) }); renderMethods(); });
$('roundsUp').addEventListener('click', () => { timer.reset({ rounds: Math.min(8, timer.rounds + 1) }); renderMethods(); });

const autoStart = $('autoStart');
autoStart.checked = prefs.autoStart;
autoStart.addEventListener('change', () => { prefs.autoStart = autoStart.checked; store(PREFS, prefs); });

const toggleDrawer = (open = !document.body.classList.contains('drawer-open')) => {
  document.body.classList.toggle('drawer-open', open);
  if (open) renderStats();
};
$('planBtn').addEventListener('click', () => toggleDrawer());
document.querySelector('.tabs').addEventListener('click', (e) => {
  const tab = e.target.closest('.tab');
  if (!tab) return;
  for (const t of document.querySelectorAll('.tab')) t.setAttribute('aria-selected', t === tab);
  for (const p of document.querySelectorAll('.panel')) p.hidden = p.dataset.panel !== tab.dataset.tab;
});
$('closeDrawer').addEventListener('click', () => toggleDrawer(false));

// ---------------- mini mode ----------------

function setMini(on) {
  document.body.classList.toggle('mini', on);
  if (on) toggleDrawer(false);
  window.desktop?.setMini(on);
  lastDigits = '';
}
$('miniBtn').addEventListener('click', () => setMini(!document.body.classList.contains('mini')));

// ---------------- keyboard ----------------

document.addEventListener('keydown', (e) => {
  if (e.target.matches('input')) return;
  if (e.code === 'Space') { e.preventDefault(); timer.toggle(); }
  else if (e.key === 's' || e.key === 'S') { if (!skipBtn.disabled) timer.skip(prefs.autoStart); }
  else if (e.key === 'm' || e.key === 'M') setMini(!document.body.classList.contains('mini'));
  else if (e.key === 'Escape') toggleDrawer(false);
});

// ---------------- boot ----------------

timer.addEventListener('change', render);
setInterval(() => { timer.tick(prefs.autoStart); render(); }, 250);

if (!window.desktop && 'Notification' in window && Notification.permission === 'default') {
  playBtn.addEventListener('click', () => Notification.requestPermission(), { once: true });
}

renderMethods();
renderStats();
render();
initScenery(scene).then(render);
