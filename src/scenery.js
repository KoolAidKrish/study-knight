// Scenery tab: pick the character and the focus/break backgrounds, and manage user packs.

import { BUILTIN, DEFAULT_SCENERY, loadCharacter, loadBackground } from './packs.js';
import { drawSprite } from './scene.js';
import { icon } from './pixels.js';

const $ = (id) => document.getElementById(id);
const KEY = 'studyknight.scenery.v1';
const desktop = window.desktop?.packs;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function initScenery(scene) {
  let choice = { ...DEFAULT_SCENERY };
  try { choice = { ...choice, ...JSON.parse(localStorage.getItem(KEY)) }; } catch {}
  let packs = [...BUILTIN];
  const loaded = new Map();   // id → Promise of loaded character/background

  const byId = (id) => packs.find((p) => p.id === id);
  const ofType = (t) => packs.filter((p) => p.type === t);
  const get = (pack) => {
    if (!loaded.has(pack.id)) {
      const p = pack.type === 'character' ? loadCharacter(pack) : loadBackground(pack);
      p.catch(() => {});
      loaded.set(pack.id, p);
    }
    return loaded.get(pack.id);
  };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(choice)); } catch {} };
  const showError = (msg) => { $('packError').textContent = msg || ''; };

  // Apply the current choice to the scene, falling back to the defaults for anything missing or broken.
  async function apply() {
    const errors = [];
    const pick = async (id, type, fallback) => {
      const pack = byId(id)?.type === type ? byId(id) : byId(fallback);
      try {
        return [pack, await get(pack)];
      } catch (e) {
        errors.push(e.message);
        return [byId(fallback), await get(byId(fallback))];
      }
    };
    const [, hero] = await pick(choice.character, 'character', DEFAULT_SCENERY.character);
    const [, focus] = await pick(choice.focus.bg, 'background', DEFAULT_SCENERY.focus.bg);
    const [, rest] = await pick(choice.rest.bg, 'background', DEFAULT_SCENERY.rest.bg);
    scene.setHero(hero);
    scene.setBackground('trail', focus, choice.focus.phase);
    scene.setBackground('camp', rest, choice.rest.phase);
    scene.start();
    if (errors.length) showError(errors.join('\n'));
  }

  // ---------- cards ----------

  function card(pack, checked, group) {
    return `<button class="card" role="radio" aria-checked="${checked}" data-group="${group}" data-id="${esc(pack.id)}" title="${esc(pack.name)}">
      <canvas width="${group === 'char' ? 64 : 160}" height="${group === 'char' ? 64 : 80}"></canvas>
      <span class="card-name">${esc(pack.name)}</span>
      ${pack.user ? '<span class="badge">yours</span>' : ''}
      <span class="on-mark">${icon('check')}</span>
    </button>`;
  }

  function chips(which) {
    const pack = byId(choice[which].bg);
    const el = $(which === 'focus' ? 'focusPhases' : 'restPhases');
    const phases = pack?.phases ?? [];
    if (phases.length < 2) { el.innerHTML = ''; return; }
    const opts = [['cycle', 'Day cycle'], ...phases.map((p, i) => [i, p.name])];
    el.innerHTML = opts.map(([v, label]) =>
      `<button class="chip" role="radio" aria-checked="${String(choice[which].phase) === String(v)}" data-which="${which}" data-phase="${v}"
        ${v === 'cycle' ? 'title="Moves through every phase over the length of your plan"' : ''}>${esc(label)}</button>`).join('');
  }

  function render() {
    $('charCards').innerHTML = ofType('character').map((p) => card(p, p.id === choice.character, 'char')).join('');
    $('focusCards').innerHTML = ofType('background').map((p) => card(p, p.id === choice.focus.bg, 'focus')).join('');
    $('restCards').innerHTML = ofType('background').map((p) => card(p, p.id === choice.rest.bg, 'rest')).join('');
    chips('focus');
    chips('rest');
    drawThumbs();
    renderPackList();
  }

  async function drawThumbs() {
    for (const el of document.querySelectorAll('.card[data-group="focus"], .card[data-group="rest"]')) {
      const pack = byId(el.dataset.id);
      const which = el.dataset.group;
      const phase = choice[which].bg === pack.id && choice[which].phase !== 'cycle' ? +choice[which].phase : 0;
      get(pack).then((bg) => drawBgThumb(el.querySelector('canvas'), bg, phase))
        .catch(() => el.classList.add('broken'));
    }
    for (const el of document.querySelectorAll('.card[data-group="char"]')) {
      get(byId(el.dataset.id)).catch(() => el.classList.add('broken'));
    }
  }

  const thumbBuf = document.createElement('canvas');
  function drawBgThumb(cv, bg, phase) {
    thumbBuf.width = 640;
    thumbBuf.height = 320;
    const t = thumbBuf.getContext('2d');
    t.imageSmoothingEnabled = false;
    for (const l of bg.phases[Math.min(phase, bg.phases.length - 1)].layers) {
      const w = l.img.width * bg.scale;
      for (let x = 0; x < 640; x += w) t.drawImage(l.img, x, -bg.cropY, w, l.img.height * bg.scale);
    }
    const c = cv.getContext('2d');
    c.imageSmoothingEnabled = true;
    c.drawImage(thumbBuf, 0, 0, cv.width, cv.height);
  }

  // Character previews play their idle loop while the tab is open.
  let tick = 0;
  setInterval(async () => {
    if (!document.body.classList.contains('drawer-open') || $('charCards').closest('[hidden]')) return;
    tick++;
    for (const el of document.querySelectorAll('.card[data-group="char"]')) {
      let hero;
      try { hero = await get(byId(el.dataset.id)); } catch { continue; }
      const cv = el.querySelector('canvas');
      const c = cv.getContext('2d');
      c.imageSmoothingEnabled = false;
      c.clearRect(0, 0, cv.width, cv.height);
      const anim = el.getAttribute('aria-checked') === 'true' ? 'run' : 'idle';
      const a = hero.anims[anim];
      const fit = Math.max(1, Math.floor(56 / Math.max(a.w, a.h)));
      drawSprite(c, { ...hero, scale: fit }, a, Math.floor((tick * 120) / a.ms) % a.frames, cv.width / 2, cv.height - 4);
    }
  }, 120);

  // ---------- events ----------

  document.querySelector('[data-panel="scenery"]').addEventListener('click', async (e) => {
    const c = e.target.closest('.card');
    const chip = e.target.closest('.chip');
    if (c) {
      const g = c.dataset.group;
      if (g === 'char') choice.character = c.dataset.id;
      else {
        const pack = byId(c.dataset.id);
        const keep = choice[g].bg === pack.id;
        choice[g] = { bg: pack.id, phase: keep ? choice[g].phase : (g === 'focus' && pack.phases.length > 1 ? 'cycle' : 0) };
      }
    } else if (chip) {
      const p = chip.dataset.phase;
      choice[chip.dataset.which].phase = p === 'cycle' ? 'cycle' : +p;
    } else {
      return;
    }
    showError('');
    save();
    render();
    await apply();
  });

  // ---------- user packs (desktop app only) ----------

  function renderPackList() {
    const mine = packs.filter((p) => p.user);
    $('packList').innerHTML = mine.map((p) => `
      <li>${esc(p.name)} <small>${p.type}</small>
        <button class="x" data-remove="${esc(p.id)}" aria-label="Remove ${esc(p.name)}" title="Move to Recycle Bin">${icon('close')}</button></li>`).join('');
  }

  async function reloadPacks() {
    if (!desktop) return;
    const { packs: user, errors } = await desktop.list();
    packs = [...BUILTIN, ...user];
    for (const id of [...loaded.keys()]) if (id.startsWith('user:')) loaded.delete(id);
    showError(errors.join('\n'));
    render();
    await apply();
  }

  if (desktop) {
    $('importPack').addEventListener('click', async () => {
      try {
        const res = await desktop.import();
        if (!res) return;
        await reloadPacks();
        // Jump straight to what was imported.
        if (res.type === 'character') choice.character = res.id;
        else choice.focus = { bg: res.id, phase: (byId(res.id)?.phases.length ?? 0) > 1 ? 'cycle' : 0 };
        save();
        render();
        await apply();
      } catch (e) {
        showError(String(e.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
      }
    });
    $('openPacks').addEventListener('click', () => desktop.open());
    $('reloadPacks').addEventListener('click', () => reloadPacks());
    $('packList').addEventListener('click', async (e) => {
      const id = e.target.closest('[data-remove]')?.dataset.remove;
      if (!id || !confirm(`Remove "${byId(id)?.name}"? It will be moved to the Recycle Bin.`)) return;
      await desktop.remove(id);
      await reloadPacks();
    });
  } else {
    $('packTools').innerHTML = '<p class="hint">Importing your own characters and scenes works in the desktop app.</p>';
  }

  render();
  return (desktop ? reloadPacks() : Promise.resolve()).then(apply);
}
