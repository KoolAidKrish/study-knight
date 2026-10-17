// Characters and backgrounds are "packs": plain data describing sprite strips and parallax layers.
// Built-in packs live below; user packs come from the desktop app's packs folder (see README).

const FUR = ['#dfeded', '#c6dbde', '#a7b8c2'];
const ARMOUR = ['#bac4ca', '#a6afb4', '#9baab3', '#8a98a0', '#7b888f', '#728794', '#6e7a80', '#5c6d77'];

const meowKnight = {
  type: 'character',
  name: 'Meow Knight',
  base: 'assets/knight/',
  frameWidth: 16,
  frameHeight: 24,
  scale: 2,
  anims: {
    idle: { src: 'idle.png', frames: 6, ms: 140 },
    run: { src: 'run.png', frames: 8, ms: 95 },
    jump: { src: 'jump.png', frames: 12, ms: 70, air: [3, 9] },
  },
};

const skyLayers = (sky) => [0, 0.01, 0.06, 0.16, 0.42, 1].map((parallax, i) => ({
  src: `${sky}/${i + 1}.png`, parallax, drift: i === 2 ? 5 : 0,
}));

const glacialLayers = (pale) => [
  { src: pale ? 'sky_lightened.png' : 'sky.png', parallax: 0, drift: 0 },
  { src: 'clouds_bg.png', parallax: 0.03, drift: 3 },
  { src: pale ? 'glacial_mountains_lightened.png' : 'glacial_mountains.png', parallax: 0.08, drift: 0 },
  { src: 'clouds_mg_3.png', parallax: 0.18, drift: 5 },
  { src: 'clouds_mg_2.png', parallax: 0.3, drift: 8 },
  { src: pale ? 'clouds_mg_1_lightened.png' : 'clouds_mg_1.png', parallax: 0.5, drift: 12 },
  { src: 'cloud_lonely.png', parallax: 0.12, drift: 6 },
];

export const BUILTIN = [
  { id: 'meow-knight', ...meowKnight },
  { id: 'ginger-knight', ...meowKnight, name: 'Ginger Knight', recolor: { tints: [{ colors: FUR, to: '#f4b46e' }] } },
  { id: 'paladin', ...meowKnight, name: 'Paladin', recolor: { tints: [{ colors: ARMOUR, to: '#ecc760' }] } },
  {
    id: 'rose-knight', ...meowKnight, name: 'Rose Knight',
    recolor: { tints: [{ colors: FUR, to: '#f7d3de' }, { colors: ARMOUR, to: '#b89ad6' }] },
  },
  {
    id: 'shadow-knight', ...meowKnight, name: 'Shadow Knight',
    recolor: {
      tints: [{ colors: FUR, to: '#5d5878' }, { colors: ARMOUR, to: '#45405c' }],
      replace: { '#4e4d5c': '#ffd166', '#e6a3a3': '#8a6fa8' },
    },
  },
  {
    id: 'four-skies',
    type: 'background',
    name: 'Four Skies',
    base: 'assets/skies/',
    groundY: 314,
    phases: ['sunrise', 'noon', 'sunset', 'night'].map((s) => ({
      name: s[0].toUpperCase() + s.slice(1), layers: skyLayers(s),
    })),
  },
  {
    id: 'glacial',
    type: 'background',
    name: 'Glacial Mountains',
    base: 'assets/glacial/',
    scale: 2,
    cropY: 64,
    groundY: 181,
    ledge: true,
    phases: [
      { name: 'Clear', layers: glacialLayers(false) },
      { name: 'Pale', layers: glacialLayers(true) },
    ],
  },
];

export const DEFAULT_SCENERY = {
  character: 'meow-knight',
  focus: { bg: 'four-skies', phase: 'cycle' },
  rest: { bg: 'glacial', phase: 0 },
};

// ---------------- loading ----------------

const cache = new Map();

export function loadImage(src) {
  if (!cache.has(src)) {
    cache.set(src, new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => { cache.delete(src); reject(new Error('Could not load ' + src.slice(0, 80))); };
      img.src = src;
    }));
  }
  return cache.get(src);
}

const url = (pack, src) => (pack.files ? pack.files[src] : pack.base + src);

const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const lum = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;

// Recolor: each tint group keeps its shading but moves onto a new colour (brightest → `to`).
function recolor(img, { tints = [], replace = {} }) {
  const map = new Map();
  for (const { colors, to } of tints) {
    const top = Math.max(...colors.map((c) => lum(hex(c))));
    const target = hex(to);
    for (const c of colors) {
      const k = lum(hex(c)) / top;
      map.set(c.toLowerCase(), target.map((v) => Math.min(255, Math.round(v * k))));
    }
  }
  for (const [from, to] of Object.entries(replace)) map.set(from.toLowerCase(), hex(to));

  const cv = document.createElement('canvas');
  cv.width = img.width;
  cv.height = img.height;
  const ctx = cv.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, cv.width, cv.height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    if (!px[i + 3]) continue;
    const key = '#' + [px[i], px[i + 1], px[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');
    const to = map.get(key);
    if (to) [px[i], px[i + 1], px[i + 2]] = to;
  }
  ctx.putImageData(data, 0, 0);
  return cv;
}

// Turns a character pack into ready-to-draw animations. Frame layout is inferred when not given:
// a strip wider than tall is split into square frames; a taller one is read top-to-bottom.
export async function loadCharacter(pack) {
  if (!pack.anims?.idle || !pack.anims?.run) throw new Error(`${pack.name}: needs "idle" and "run" animations`);
  const anims = {};
  let fh = 0;
  for (const [name, a] of Object.entries(pack.anims)) {
    let img = await loadImage(url(pack, a.src));
    if (pack.recolor) img = recolor(img, pack.recolor);
    const vertical = a.vertical ?? (!a.frames && !pack.frameWidth && img.height > img.width);
    let frames = a.frames;
    let w = pack.frameWidth;
    let h = pack.frameHeight;
    if (vertical) {
      w ??= img.width;
      frames ??= Math.round(img.height / (h ?? w));
      h ??= Math.floor(img.height / frames);
    } else {
      h ??= img.height;
      frames ??= Math.max(1, Math.round(img.width / (w ?? h)));
      w ??= Math.floor(img.width / frames);
    }
    anims[name] = { img, frames, w, h, vertical, ms: a.ms ?? 100, air: a.air };
    fh = Math.max(fh, h);
  }
  return {
    anims,
    scale: pack.scale ?? Math.max(1, Math.round(48 / fh)),
    feet: pack.feet ?? 0,                 // transparent rows under the feet, in frame pixels
    flip: pack.facing === 'left',
  };
}

export async function loadBackground(pack) {
  if (!pack.phases?.length) throw new Error(`${pack.name}: needs at least one phase of layers`);
  const phases = await Promise.all(pack.phases.map(async (ph) => ({
    name: ph.name,
    layers: await Promise.all(ph.layers.map(async (l) => ({
      img: await loadImage(url(pack, l.src)), parallax: l.parallax ?? 0, drift: l.drift ?? 0,
    }))),
  })));
  const h = phases[0].layers[0].img.height;
  const scale = pack.scale ?? 320 / h;
  const cropY = pack.cropY ?? Math.max(0, h * scale - 320);
  return {
    phases,
    scale,
    cropY,
    ground: Math.round((pack.groundY ?? h * 0.97) * scale - cropY),
    ledge: !!pack.ledge,
  };
}
