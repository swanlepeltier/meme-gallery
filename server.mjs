// server.mjs — serveur local sans dépendance.
// Sert le site statique, régénère media.json à la volée et accepte les uploads.
//   node server.mjs            -> http://127.0.0.1:4321
//   PORT=8080 HOST=0.0.0.0 node server.mjs
//
// Sur GitHub Pages (statique) l'upload ne marchera pas : c'est normal,
// il faut passer par le dossier media/ + `npm run index`.

import http from 'node:http';
import { createReadStream, createWriteStream, existsSync, statSync } from 'node:fs';
import { mkdir, unlink } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanMedia, writeManifest } from './tools/build-manifest.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4321);
const HOST = process.env.HOST || '127.0.0.1';
const MAX_UPLOAD = 200 * 1024 * 1024;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.ogv': 'video/ogg',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.bmp']);
const VIDEO_EXT = new Set(['.mp4', '.webm', '.ogv', '.mov', '.m4v', '.mkv']);

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  res.end(body);
}

function safeName(raw) {
  const base = path.basename(String(raw || 'meme')).normalize('NFC');
  let clean = base.replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^[.-]+/, '');
  if (!clean) clean = 'meme';
  return clean.slice(-120);
}

async function handleUpload(req, res, url) {
  const type = url.searchParams.get('type') === 'video' ? 'video' : 'image';
  const name = safeName(url.searchParams.get('name'));
  const ext = path.extname(name).toLowerCase();
  const allowed = type === 'video' ? VIDEO_EXT : IMAGE_EXT;

  if (!allowed.has(ext)) {
    return json(res, 415, {
      ok: false,
      error: `Extension refusée (${ext || 'aucune'}). Autorisées : ${[...allowed].join(', ')}`,
    });
  }

  const dir = path.join(ROOT, 'media', type === 'video' ? 'videos' : 'images');
  let target = path.join(dir, name);
  if (existsSync(target)) {
    const stem = name.slice(0, -ext.length);
    target = path.join(dir, `${stem}-${Date.now().toString(36)}${ext}`);
  }
  if (!target.startsWith(dir + path.sep)) return json(res, 400, { ok: false, error: 'chemin invalide' });

  const declared = Number(req.headers['content-length'] || 0);
  if (declared > MAX_UPLOAD) return json(res, 413, { ok: false, error: 'fichier trop gros (max 200 Mo)' });

  await mkdir(dir, { recursive: true });

  let written = 0;
  const limiter = new Transform({
    transform(chunk, _enc, cb) {
      written += chunk.length;
      if (written > MAX_UPLOAD) return cb(new Error('TOO_BIG'));
      cb(null, chunk);
    },
  });

  try {
    await pipeline(req, limiter, createWriteStream(target));
  } catch (err) {
    await unlink(target).catch(() => {});
    if (err.message === 'TOO_BIG') return json(res, 413, { ok: false, error: 'fichier trop gros (max 200 Mo)' });
    return json(res, 400, { ok: false, error: `upload interrompu : ${err.message}` });
  }

  const manifest = await writeManifest();
  const saved = manifest.items.find((item) => item.src === `media/${type === 'video' ? 'videos' : 'images'}/${path.basename(target)}`);
  return json(res, 201, { ok: true, item: saved || null, bytes: written });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(url.pathname);

  try {
    if (pathname === '/api/media') {
      const manifest = await scanMedia();
      return json(res, 200, manifest);
    }

    if (pathname === '/api/upload' && req.method === 'POST') {
      return handleUpload(req, res, url);
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return json(res, 405, { ok: false, error: 'méthode non autorisée' });
    }

    let rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const abs = path.resolve(ROOT, rel);
    if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) {
      return json(res, 403, { ok: false, error: 'dehors' });
    }
    if (!existsSync(abs) || !statSync(abs).isFile()) {
      res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(`<!doctype html><meta charset="utf-8"><title>404</title>
<body style="background:#ff00aa;color:#0f0;font-family:Comic Sans MS,cursive;text-align:center;padding:4rem">
<h1 style="font-size:6rem;margin:0">404</h1><p style="font-size:2rem">CE MEME N'EXISTE PAS (encore)</p>
<p><a href="/" style="color:#ff0">retour au bordel</a></p></body>`);
    }

    const ext = path.extname(abs).toLowerCase();
    const noCache = ['.html', '.json', '.js', '.css', '.mjs'].includes(ext);
    const head = {
      'content-type': TYPES[ext] || 'application/octet-stream',
      'content-length': statSync(abs).size,
      'cache-control': noCache ? 'no-cache' : 'public, max-age=3600',
    };
    res.writeHead(200, head);
    if (req.method === 'HEAD') return res.end();
    try {
      await pipeline(createReadStream(abs), res);
    } catch (err) {
      // Le navigateur qui annule un téléchargement, c'est la vie.
      if (err.code !== 'ERR_STREAM_PREMATURE_CLOSE' && err.code !== 'ECONNRESET') {
        console.error('[static]', err.message);
      }
    }
    return undefined;
  } catch (err) {
    console.error(err);
    if (!res.headersSent) json(res, 500, { ok: false, error: String(err.message || err) });
    else res.end();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n  🦄 GALERIE DE MEMES (édition chaos) sur http://${HOST}:${PORT}\n`);
  console.log(`  upload : POST /api/upload?name=fichier.jpg&type=image (corps = fichier brut)`);
  console.log(`  index  : npm run index\n`);
});

process.on('SIGINT', () => {
  console.log('\n  au revoir. rangez ce site.');
  server.close(() => process.exit(0));
});
