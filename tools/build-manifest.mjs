// tools/build-manifest.mjs
// Scanne media/images et media/videos, puis écrit media.json.
// Aucune dépendance : Node 18+ suffit. ffprobe est utilisé s'il est présent
// (pour la durée des vidéos), sinon on se rabat sur une lecture d'en-têtes.

import { readdir, stat, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MEDIA_DIR = path.join(ROOT, 'media');
const OUT_FILE = path.join(ROOT, 'media.json');
const OVERRIDES_FILE = path.join(MEDIA_DIR, 'memes.json');

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.bmp']);
const VIDEO_EXT = new Set(['.mp4', '.webm', '.ogv', '.mov', '.m4v', '.mkv']);

const MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif',
  '.bmp': 'image/bmp', '.mp4': 'video/mp4', '.m4v': 'video/mp4',
  '.webm': 'video/webm', '.ogv': 'video/ogg', '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
};

/* ------------------------------------------------------------------ */
/* Lecture des dimensions dans les en-têtes de fichiers                */
/* ------------------------------------------------------------------ */

export function imageFormat(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf.toString('ascii', 0, 3) === 'GIF') return 'gif';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpeg';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (buf.toString('ascii', 4, 12) === 'ftypavif' || buf.toString('ascii', 4, 12) === 'ftypavis') return 'avif';
  if (buf.toString('ascii', 0, 2) === 'BM') return 'bmp';
  return null;
}

export function imageSize(buf, ext) {
  const kind = imageFormat(buf);
  try {
    if (kind === 'png' && buf.length > 24) {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    if (kind === 'gif' && buf.length > 10) {
      return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
    }
    if (kind === 'jpeg' && buf.length > 4) {
      let i = 2;
      while (i < buf.length - 8) {
        if (buf[i] !== 0xff) { i++; continue; }
        const marker = buf[i + 1];
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
        const len = buf.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
        }
        i += 2 + len;
      }
    }
    if (kind === 'webp' && buf.length > 30) {
      const chunk = buf.toString('ascii', 12, 16);
      if (chunk === 'VP8X') {
        return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
      }
      if (chunk === 'VP8 ') {
        return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
      }
      if (chunk === 'VP8L') {
        const b = buf.subarray(21, 25);
        return {
          width: 1 + (((b[1] & 0x3f) << 8) | b[0]),
          height: 1 + (((b[3] & 0x0f) << 10) | (b[2] << 2) | ((b[1] & 0xc0) >> 6)),
        };
      }
    }
  } catch {
    /* fichier exotique : on laisse tomber */
  }
  return null;
}

function mp4Size(buf) {
  try {
    const idx = buf.indexOf('tkhd');
    if (idx < 4) return null;
    const size = buf.readUInt32BE(idx - 4);
    if (!size || idx - 4 + size > buf.length) return null;
    const end = idx - 4 + size;
    const width = buf.readUInt32BE(end - 8) / 65536;
    const height = buf.readUInt32BE(end - 4) / 65536;
    if (width > 0 && height > 0) {
      return { width: Math.round(width), height: Math.round(height) };
    }
  } catch {
    /* ignore */
  }
  return null;
}

function ffprobe(file) {
  return new Promise((resolve) => {
    execFile(
      'ffprobe',
      ['-v', 'error', '-select_streams', 'v:0', '-show_entries',
        'stream=width,height:format=duration', '-of', 'json', file],
      { timeout: 8000 },
      (err, stdout) => {
        if (err) return resolve(null);
        try {
          const data = JSON.parse(stdout);
          const stream = (data.streams || [])[0] || {};
          resolve({
            width: stream.width || null,
            height: stream.height || null,
            duration: data.format && data.format.duration ? Number(data.format.duration) : null,
          });
        } catch {
          resolve(null);
        }
      }
    );
  });
}

/* ------------------------------------------------------------------ */
/* Utilitaires                                                         */
/* ------------------------------------------------------------------ */

export function slugify(input) {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'meme';
}

function prettyTitle(file) {
  return file
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function loadOverrides() {
  if (!existsSync(OVERRIDES_FILE)) return {};
  try {
    const raw = await readFile(OVERRIDES_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    console.warn(`[manifest] media/memes.json illisible (${err.message}), on l'ignore.`);
    return {};
  }
}

async function scanDir(dirName, type, overrides) {
  const abs = path.join(MEDIA_DIR, dirName);
  if (!existsSync(abs)) return [];
  const entries = await readdir(abs, { withFileTypes: true });
  const out = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (/\.poster\.(jpe?g|png|webp)$/i.test(entry.name)) continue;
    const ext = path.extname(entry.name).toLowerCase();
    const allowed = type === 'video' ? VIDEO_EXT : IMAGE_EXT;
    if (!allowed.has(ext)) continue;

    const file = path.join(abs, entry.name);
    const info = await stat(file);
    const buf = await readFile(file);
    const kind = type === 'image' ? imageFormat(buf) : null;
    const dims = type === 'video'
      ? (await ffprobe(file)) || mp4Size(buf) || null
      : imageSize(buf, ext);

    const override = overrides[entry.name] || overrides[`${dirName}/${entry.name}`] || {};
    const posterFile = path.join(abs, `${entry.name.replace(/\.[^.]+$/, '')}.poster.jpg`);
    const effectiveExt = kind === 'jpeg' ? '.jpg' : kind ? `.${kind}` : ext;

    out.push({
      file: entry.name,
      type,
      gif: kind === 'gif' || ext === '.gif',
      ext: effectiveExt.slice(1),
      src: `media/${dirName}/${entry.name}`,
      bytes: info.size,
      mtime: Math.round(info.mtimeMs),
      width: (dims && dims.width) || null,
      height: (dims && dims.height) || null,
      duration: (dims && dims.duration) || null,
      poster: existsSync(posterFile) ? `media/${dirName}/${path.basename(posterFile)}` : null,
      title: typeof override.title === 'string' && override.title.trim() ? override.title.trim() : prettyTitle(entry.name),
      tags: Array.isArray(override.tags) ? override.tags.filter((t) => typeof t === 'string') : [],
      mime: MIME[effectiveExt] || (type === 'video' ? 'video/mp4' : 'application/octet-stream'),
      playable: type === 'video' ? ['.mp4', '.m4v', '.webm', '.ogv'].includes(ext) : true,
    });
  }
  return out;
}

export async function scanMedia() {
  const overrides = await loadOverrides();
  const items = [
    ...(await scanDir('images', 'image', overrides)),
    ...(await scanDir('videos', 'video', overrides)),
  ];

  const used = new Map();
  for (const item of items) {
    const base = slugify(item.file);
    const seen = used.get(base) || 0;
    used.set(base, seen + 1);
    item.id = seen ? `${base}-${seen + 1}` : base;
  }

  items.sort((a, b) => (a.type === b.type ? a.title.localeCompare(b.title, 'fr') : a.type.localeCompare(b.type)));

  return {
    generatedAt: new Date().toISOString(),
    count: items.length,
    images: items.filter((i) => i.type === 'image').length,
    videos: items.filter((i) => i.type === 'video').length,
    gifs: items.filter((i) => i.gif).length,
    items,
  };
}

export async function writeManifest() {
  const manifest = await scanMedia();
  await writeFile(OUT_FILE, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const manifest = await writeManifest();
    console.log(`[manifest] ${manifest.count} memes indexés (${manifest.images} images, ${manifest.gifs} gifs, ${manifest.videos} vidéos) -> media.json`);
  } catch (err) {
    console.error('[manifest] échec :', err);
    process.exitCode = 1;
  }
}
