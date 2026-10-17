// User packs: folders inside <userData>/packs. Each is a character or a background, described by a
// manifest.json, or inferred from the files when there isn't one (see README "Custom packs").

const fs = require('fs');
const path = require('path');

const MIME = { '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
const isImage = (f) => MIME[path.extname(f).toLowerCase()] !== undefined;
const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

function images(dir) {
  return fs.readdirSync(dir).filter((f) => isImage(f) && fs.statSync(path.join(dir, f)).isFile()).sort(natural);
}

// Back-to-front layers get parallax that eases from 0 (sky) up to 1 (foreground).
function layersFrom(files, prefix = '') {
  return files.map((f, i) => ({
    src: prefix + f,
    parallax: files.length === 1 ? 0 : +Math.pow(i / (files.length - 1), 1.6).toFixed(3),
  }));
}

function inferManifest(dir) {
  const name = path.basename(dir);
  const files = images(dir);
  const lower = Object.fromEntries(files.map((f) => [path.parse(f).name.toLowerCase(), f]));

  if (lower.idle && lower.run) {
    const anims = { idle: { src: lower.idle }, run: { src: lower.run } };
    if (lower.jump) anims.jump = { src: lower.jump };
    return { type: 'character', name, anims };
  }

  const subdirs = fs.readdirSync(dir)
    .filter((d) => fs.statSync(path.join(dir, d)).isDirectory() && images(path.join(dir, d)).length)
    .sort(natural);
  if (subdirs.length) {
    return {
      type: 'background', name,
      phases: subdirs.map((d) => ({ name: d, layers: layersFrom(images(path.join(dir, d)), d + '/') })),
    };
  }
  if (files.length) return { type: 'background', name, phases: [{ name, layers: layersFrom(files) }] };
  throw new Error('No manifest.json and no images found.');
}

function readManifest(dir) {
  const file = path.join(dir, 'manifest.json');
  const m = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : inferManifest(dir);
  m.name ??= path.basename(dir);
  if (m.type !== 'character' && m.type !== 'background') throw new Error('"type" must be "character" or "background".');
  return m;
}

function sources(m) {
  if (m.type === 'character') return Object.values(m.anims ?? {}).map((a) => a.src);
  return (m.phases ?? []).flatMap((p) => (p.layers ?? []).map((l) => l.src));
}

// Images go to the renderer as data URLs, so the page never needs file access.
function loadPack(dir) {
  const m = readManifest(dir);
  const files = {};
  for (const src of sources(m)) {
    if (typeof src !== 'string') throw new Error('Every animation and layer needs a "src".');
    const full = path.resolve(dir, src);
    if (!full.startsWith(path.resolve(dir) + path.sep)) throw new Error(`"${src}" points outside the pack folder.`);
    if (!isImage(full)) throw new Error(`"${src}" is not a png, gif, webp or jpg.`);
    files[src] = `data:${MIME[path.extname(full).toLowerCase()]};base64,${fs.readFileSync(full).toString('base64')}`;
  }
  return { ...m, id: 'user:' + path.basename(dir), user: true, files };
}

function listPacks(root) {
  fs.mkdirSync(root, { recursive: true });
  const packs = [];
  const errors = [];
  for (const d of fs.readdirSync(root).sort(natural)) {
    const dir = path.join(root, d);
    if (!fs.statSync(dir).isDirectory()) continue;
    try {
      packs.push(loadPack(dir));
    } catch (e) {
      errors.push(`${d}: ${e.message}`);
    }
  }
  return { packs, errors };
}

function importPack(root, src) {
  const m = readManifest(src); // validate before copying anything
  fs.mkdirSync(root, { recursive: true });
  const base = path.basename(src).replace(/[^\w\- ]+/g, '').trim() || 'pack';
  let name = base;
  for (let n = 2; fs.existsSync(path.join(root, name)); n++) name = `${base} ${n}`;
  fs.cpSync(src, path.join(root, name), { recursive: true });
  return { id: 'user:' + name, type: m.type };
}

function packDir(root, id) {
  const dir = path.resolve(root, String(id).replace(/^user:/, ''));
  if (path.dirname(dir) !== path.resolve(root)) throw new Error('Bad pack id.');
  return dir;
}

module.exports = { listPacks, importPack, packDir };
