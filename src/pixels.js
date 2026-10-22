// Pixel-art UI kit: tiny icons and bevelled 9-slice frames, both generated as SVG from text grids.
// '#' = currentColor, 'o' = currentColor at half strength, '.' = empty.

const ICONS = {
  sword: [
    '.......##',
    '......#o#',
    '.....#o#.',
    '#...#o#..',
    '.#.#o#...',
    '..#o#....',
    '..##.....',
    '.#..#....',
    '#........',
  ],
  fire: [
    '....#....',
    '...##....',
    '...###.#.',
    '.#.####..',
    '.##o####.',
    '.#ooo###.',
    '.#ooo##..',
    '..#####..',
    '.##.#.##.',
  ],
  flag: [
    '.#.......',
    '.#####...',
    '.#ooo###.',
    '.#oooo#..',
    '.#####...',
    '.#.......',
    '.#.......',
    '.#.......',
    '###......',
  ],
  crown: [
    '.........',
    '#...#...#',
    '##.###.##',
    '#########',
    '#o#o#o#o#',
    '#########',
    '.........',
    '.#######.',
    '.........',
  ],
  tent: [
    '....#....',
    '...#o#...',
    '..#ooo#..',
    '.#oo#oo#.',
    '#ooo#ooo#',
    '#########',
  ],
  scroll: [
    '.#######.',
    '#o#....#.',
    '.#.###.#.',
    '.#.....#.',
    '.#.####..',
    '.#.....#.',
    '.#######o',
    '..#######',
  ],
  play: ['##.....', '####...', '######.', '#######', '######.', '####...', '##.....'],
  pause: ['##.##', '##.##', '##.##', '##.##', '##.##', '##.##', '##.##'],
  skip: ['#...#.#', '##..#.#', '###.#.#', '#####.#', '###.#.#', '##..#.#', '#...#.#'],
  reset: [
    '.....#..',
    '.#######',
    '#....#..',
    '#.......',
    '#......#',
    '#......#',
    '.######.',
  ],
  close: ['#.....#', '.#...#.', '..#.#..', '...#...', '..#.#..', '.#...#.', '#.....#'],
  plus: ['..#..', '..#..', '#####', '..#..', '..#..'],
  minus: ['.....', '.....', '#####', '.....', '.....'],
  check: ['......#', '.....##', '#...##.', '##.##..', '.###...', '..#....'],
  mini: [
    '#########',
    '#.......#',
    '#.......#',
    '#...####.',
    '#...#oo#.',
    '#...#oo#.',
    '####.##..',
  ],
  party: [
    '.##...##.',
    '#oo#.#oo#',
    '#oo#.#oo#',
    '.##...##.',
    '.........',
    '####.####',
    '#oo#.#oo#',
    '#oo#.#oo#',
  ],
  hourglass: [
    '#######',
    '.#ooo#.',
    '..#o#..',
    '...#...',
    '..#.#..',
    '.#ooo#.',
    '#######',
  ],
  calendar: [
    '.#...#.',
    '#######',
    '#.....#',
    '#.#.#.#',
    '#.....#',
    '#.#.#o#',
    '#######',
  ],
  flame: [
    '...#...',
    '..##...',
    '..###.#',
    '.#####.',
    '##o###.',
    '#ooo##.',
    '.####..',
  ],
  mountain: [
    '....#....',
    '...#o#...',
    '..#ooo#.#',
    '.#ooooo#o',
    '#ooooooo#',
    '#########',
  ],
  folder: [
    '###......',
    '#..####..',
    '#######.#',
    '#ooooooo#',
    '#ooooooo#',
    '#########',
  ],
};

function gridSvg(rows, fills) {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  let rects = '';
  rows.forEach((row, y) => {
    // merge horizontal runs of the same char into one rect
    for (let x = 0; x < row.length;) {
      const c = row[x];
      let n = 1;
      while (row[x + n] === c) n++;
      if (fills[c]) rects += `<rect x="${x}" y="${y}" width="${n}" height="1" fill="${fills[c]}"/>`;
      x += n;
    }
  });
  return { w, h, body: rects };
}

export function icon(name, cls = '') {
  const rows = ICONS[name];
  if (!rows) return '';
  const { w, h, body } = gridSvg(rows, { '#': 'currentColor', o: 'currentColor" fill-opacity="0.45' });
  return `<svg class="px ${cls}" viewBox="0 0 ${w} ${h}" width="${w * 2}" height="${h * 2}" shape-rendering="crispEdges" aria-hidden="true">${body}</svg>`;
}

// Replace <i data-icon="name"></i> placeholders.
export function hydrateIcons(root = document) {
  for (const el of root.querySelectorAll('i[data-icon]')) el.outerHTML = icon(el.dataset.icon, el.className);
}

// ---------- frames ----------
// k = outline, h = top/left light, s = bottom/right shade, f = fill.

const BIG = [
  '..kkkkkkkk..',
  '.khhhhhhhhk.',
  'khhffffffffk',
  'khffffffffsk',
  'khffffffffsk',
  'khffffffffsk',
  'khffffffffsk',
  'khffffffffsk',
  'khffffffffsk',
  'kfffffffffsk',
  '.kssssssssk.',
  '..kkkkkkkk..',
];
const SMALL = [
  '.kkkkkk.',
  'khhhhhfk',
  'khffffsk',
  'khffffsk',
  'khffffsk',
  'khffffsk',
  'kfsssssk',
  '.kkkkkk.',
];

function frameUrl(rows, { k, h, s, f }) {
  const { w, h: hh, body } = gridSvg(rows, { k, h, s, f });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${hh}" width="${w}" height="${hh}" shape-rendering="crispEdges">${body}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

const OUT = '#07070f';
export const FRAMES = {
  panel: [BIG, { k: OUT, h: 'rgba(255,236,200,0.16)', s: 'rgba(0,0,0,0.35)', f: 'rgba(21,21,46,0.9)' }],
  'panel-focus': [BIG, { k: OUT, h: 'rgba(242,166,90,0.55)', s: 'rgba(0,0,0,0.35)', f: 'rgba(24,20,40,0.9)' }],
  'panel-break': [BIG, { k: OUT, h: 'rgba(127,209,199,0.5)', s: 'rgba(0,0,0,0.35)', f: 'rgba(17,26,44,0.9)' }],
  card: [SMALL, { k: '#0b0b18', h: 'rgba(255,236,200,0.12)', s: 'rgba(0,0,0,0.3)', f: 'rgba(36,36,70,0.7)' }],
  'card-hover': [SMALL, { k: '#0b0b18', h: 'rgba(255,236,200,0.2)', s: 'rgba(0,0,0,0.3)', f: 'rgba(48,46,86,0.8)' }],
  'card-on': [SMALL, { k: '#f2a65a', h: 'rgba(255,214,150,0.35)', s: 'rgba(120,60,20,0.45)', f: 'rgba(74,48,48,0.85)' }],
  btn: [SMALL, { k: OUT, h: '#5a5a86', s: '#26264a', f: '#3a3a64' }],
  'btn-hover': [SMALL, { k: OUT, h: '#6c6c9c', s: '#2c2c54', f: '#46467a' }],
  'btn-down': [SMALL, { k: OUT, h: '#26264a', s: '#4a4a76', f: '#33335a' }],
  primary: [SMALL, { k: OUT, h: '#ffd29a', s: '#b4602a', f: '#f2a65a' }],
  'primary-hover': [SMALL, { k: OUT, h: '#ffe0b4', s: '#c46c32', f: '#f7b674' }],
  'primary-down': [SMALL, { k: OUT, h: '#b4602a', s: '#ffd29a', f: '#e8964a' }],
  glacier: [SMALL, { k: OUT, h: '#d2f6ef', s: '#3f8f88', f: '#7fd1c7' }],
  'glacier-hover': [SMALL, { k: OUT, h: '#e4fbf6', s: '#4a9d95', f: '#96ddd4' }],
  'glacier-down': [SMALL, { k: OUT, h: '#3f8f88', s: '#d2f6ef', f: '#70c3b9' }],
  well: [SMALL, { k: '#0b0b18', h: 'rgba(0,0,0,0.45)', s: 'rgba(255,236,200,0.1)', f: 'rgba(8,8,22,0.55)' }],
};

export function installFrames() {
  const root = document.documentElement.style;
  for (const [name, [rows, colors]] of Object.entries(FRAMES)) root.setProperty(`--f-${name}`, frameUrl(rows, colors));
}
