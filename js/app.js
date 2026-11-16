// app.js — la partie "fonctionnelle" du bordel.
// Charge media.json, filtre, trie, affiche, ouvre la visionneuse, gère les favoris,
// les vues, les liens directs et l'upload (si le serveur local tourne).

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const MANIFEST_URL = 'media.json';
const PAGE_SIZE = 12;
const LS = { favs: 'mg.favs.v1', views: 'mg.views.v1' };

const VIDEO_EXT = ['mp4', 'webm', 'ogv', 'mov', 'm4v', 'mkv'];

const PALETTES = [
  ['#fffdf0', '#17002b', '#ff00aa'],
  ['#e9ffe9', '#062b06', '#00a300'],
  ['#fff6c9', '#2b1a00', '#ff7a00'],
  ['#e6f7ff', '#002233', '#0077aa'],
  ['#ffe6f7', '#2b0020', '#7b00ff'],
  ['#f0e6ff', '#1a0033', '#00c2a8'],
];

const state = {
  q: '',
  type: 'all',
  favOnly: false,
  sort: 'chaos',
  limit: PAGE_SIZE,
  openId: null,
};

let items = [];
let freshIds = new Set();
let favs = new Set(readLS(LS.favs, []));
let views = readLS(LS.views, {});

/* ------------------------------------------------------------------ utils */

function readLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeLS(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* navigation privée : tant pis */
  }
}

function norm(str) {
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function humanSize(bytes) {
  if (!bytes) return '0 o';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

function humanDate(ms) {
  try {
    return new Date(ms).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '?';
  }
}

function typeLabel(item) {
  if (item.type === 'video') return 'VIDÉO';
  if (item.gif) return 'GIF';
  return 'IMAGE';
}

function plural(n, word = 'meme') {
  return `${n} ${word}${n > 1 ? 's' : ''}`;
}

/* ------------------------------------------------------------------ données */

async function loadManifest() {
  const res = await fetch(`${MANIFEST_URL}?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`media.json introuvable (HTTP ${res.status})`);
  const data = await res.json();
  items = Array.isArray(data.items) ? data.items : [];
  const newest = [...items].sort((a, b) => b.mtime - a.mtime).slice(0, 4);
  freshIds = new Set(newest.map((i) => i.id));
  return data;
}

/* ------------------------------------------------------------------ filtres */

function filteredItems() {
  const q = norm(state.q);
  let list = items.filter((item) => {
    if (state.type === 'image' && item.type !== 'image') return false;
    if (state.type === 'gif' && !item.gif) return false;
    if (state.type === 'video' && item.type !== 'video') return false;
    if (state.favOnly && !favs.has(item.id)) return false;
    if (!q) return true;
    const haystack = [item.title, item.file, item.id, ...(item.tags || [])].join(' ');
    return norm(haystack).includes(q);
  });

  switch (state.sort) {
    case 'recent':
      list.sort((a, b) => b.mtime - a.mtime);
      break;
    case 'az':
      list.sort((a, b) => a.title.localeCompare(b.title, 'fr'));
      break;
    case 'za':
      list.sort((a, b) => b.title.localeCompare(a.title, 'fr'));
      break;
    case 'vues':
      list.sort((a, b) => (views[b.id] || 0) - (views[a.id] || 0) || a.title.localeCompare(b.title, 'fr'));
      break;
    case 'lourd':
      list.sort((a, b) => b.bytes - a.bytes);
      break;
    default:
      list.sort((a, b) => (hash(a.id + 'bordel') % 100000) - (hash(b.id + 'bordel') % 100000));
  }
  return list;
}

/* ------------------------------------------------------------------ rendu */

function cardEl(item) {
  const seed = hash(item.id);
  const pal = PALETTES[seed % PALETTES.length];

  const card = document.createElement('article');
  card.className = 'carte';
  card.dataset.id = item.id;
  card.style.setProperty('--rot', `${((seed % 91) / 10 - 4.5).toFixed(1)}deg`);
  card.style.setProperty('--carte-fond', pal[0]);
  card.style.setProperty('--carte-texte', pal[1]);
  card.style.setProperty('--carte-bordure', pal[2]);
  card.style.marginTop = `${(seed % 6) * 3}px`;
  card.style.setProperty('--thumb-h', `${150 + (seed % 80)}px`);

  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'carte-ouvrir';
  open.setAttribute('aria-label', `Ouvrir « ${item.title} » dans la visionneuse`);

  const thumbSrc = item.poster || item.src;
  if (thumbSrc) {
    const img = document.createElement('img');
    img.src = thumbSrc;
    img.alt = item.title;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.addEventListener('error', () => {
      img.remove();
      const ph = document.createElement('span');
      ph.className = 'sans-apercu';
      ph.textContent = item.type === 'video' ? '🎬' : '🖼';
      open.appendChild(ph);
    });
    open.appendChild(img);
  } else {
    const ph = document.createElement('span');
    ph.className = 'sans-apercu';
    ph.textContent = item.type === 'video' ? '🎬' : '🖼';
    open.appendChild(ph);
  }

  const badge = document.createElement('span');
  badge.className = 'etiquette-type';
  badge.textContent = `${typeLabel(item)} · .${item.ext}`;
  open.appendChild(badge);

  if (freshIds.has(item.id)) {
    const nouveau = document.createElement('span');
    nouveau.className = 'etiquette-new';
    nouveau.textContent = 'NEW !';
    nouveau.setAttribute('aria-hidden', 'true');
    open.appendChild(nouveau);
  }

  open.addEventListener('click', () => openLightbox(item.id));

  const title = document.createElement('h3');
  title.className = 'carte-titre';
  title.textContent = item.title;

  const meta = document.createElement('p');
  meta.className = 'carte-meta';
  const dims = item.width && item.height ? `${item.width}×${item.height}` : 'taille inconnue';
  meta.textContent = `${typeLabel(item)} · ${dims} · ${humanSize(item.bytes)} · ${views[item.id] || 0} vue(s)`;

  const actions = document.createElement('div');
  actions.className = 'carte-actions';

  const favBtn = document.createElement('button');
  favBtn.type = 'button';
  favBtn.className = `bouton favori${favs.has(item.id) ? ' actif' : ''}`;
  favBtn.textContent = favs.has(item.id) ? '★ FAVORI' : '☆ FAVORI';
  favBtn.setAttribute('aria-pressed', String(favs.has(item.id)));
  favBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFav(item.id);
  });

  const linkBtn = document.createElement('button');
  linkBtn.type = 'button';
  linkBtn.className = 'bouton';
  linkBtn.textContent = '🔗 LIEN';
  linkBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    copyLink(item.id);
  });

  const openBtn = document.createElement('button');
  openBtn.type = 'button';
  openBtn.className = 'bouton';
  openBtn.textContent = 'OUVRIR';
  openBtn.addEventListener('click', () => openLightbox(item.id));

  actions.append(favBtn, linkBtn, openBtn);

  card.append(open, title, meta);

  if (item.tags && item.tags.length) {
    const tags = document.createElement('div');
    tags.className = 'carte-tags';
    for (const tag of item.tags) {
      const t = document.createElement('button');
      t.type = 'button';
      t.className = 'tag';
      t.textContent = `#${tag}`;
      t.addEventListener('click', () => {
        $('#recherche').value = tag;
        state.q = tag;
        state.limit = PAGE_SIZE;
        render();
        $('#galerie').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      tags.appendChild(t);
    }
    card.appendChild(tags);
  }

  card.appendChild(actions);
  return card;
}

const AD_GRID = [
  ['🔥 VOTRE PUB ICI', '3 € le clic. Arnaques acceptées.'],
  ['⚡ TÉLÉCHARGEZ PLUS DE RAM', 'Cliquez, ça ne marchera pas.'],
  ['💰 GAGNEZ UN IPHONE 47', 'En regardant des memes. Évidemment.'],
];

function adGridEl(index) {
  const [titre, texte] = AD_GRID[Math.floor(index / 6) % AD_GRID.length];
  const box = document.createElement('div');
  box.className = 'pub-grille';

  const t = document.createElement('p');
  t.className = 'pub-grille-titre clignote';
  t.textContent = titre;

  const s = document.createElement('p');
  s.textContent = texte;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'bouton bouton-hurlant';
  btn.textContent = 'CLIQUEZ (vous avez gagné)';
  btn.addEventListener('click', () => {
    btn.textContent = 'RIEN À GAGNER. DÉSOLÉ.';
    window.dispatchEvent(new CustomEvent('mg:pluie', { detail: { n: 16 } }));
  });

  box.append(t, s, btn);
  return box;
}

function render() {
  const list = filteredItems();
  const shown = list.slice(0, state.limit);
  const grid = $('#grille');

  const nodes = [];
  shown.forEach((item, i) => {
    nodes.push(cardEl(item));
    if ((i + 1) % 6 === 0 && i < shown.length - 1) nodes.push(adGridEl(i));
  });
  grid.replaceChildren(...nodes);

  $('#vide').hidden = list.length > 0;
  $('#plus').hidden = list.length <= state.limit;

  const favCount = favs.size;
  $('#favcount').textContent = String(favCount);
  $('#favcount-nav').textContent = String(favCount);
  $('#fav-filter').setAttribute('aria-pressed', String(state.favOnly));
  $('#fav-filter').classList.toggle('actif', state.favOnly);

  $$('.filtre').forEach((b) => {
    const on = b.dataset.type === state.type;
    b.classList.toggle('actif', on);
    b.setAttribute('aria-pressed', String(on));
  });

  const total = items.length;
  if (!total) {
    $('#statut').textContent = 'AUCUN MEME INDEXÉ. Ajoutez des fichiers dans media/ puis lancez npm run index.';
    return;
  }
  const filtres = [];
  if (state.q) filtres.push(`recherche « ${state.q} »`);
  if (state.type !== 'all') filtres.push(`type ${state.type}`);
  if (state.favOnly) filtres.push('favoris uniquement');
  const suffix = filtres.length ? ` · filtres : ${filtres.join(', ')}` : '';
  $('#statut').textContent = `${list.length} / ${total} meme(s) trouvé(s)${suffix} · ${shown.length} affiché(s) · tri : ${$('#tri').selectedOptions[0]?.textContent || '?'}`;

  renderTop5();
  renderMemeDuJour();
}

function renderTop5() {
  const ol = $('#top5');
  const top = [...items]
    .sort((a, b) => (views[b.id] || 0) - (views[a.id] || 0) || hash(a.id) - hash(b.id))
    .slice(0, 5);
  ol.replaceChildren(
    ...top.map((item) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = `#meme=${encodeURIComponent(item.id)}`;
      a.textContent = item.title;
      const n = document.createElement('span');
      n.className = 'n';
      n.textContent = ` (${views[item.id] || 0})`;
      li.append(a, n);
      return li;
    })
  );
}

function renderMemeDuJour() {
  const box = $('#meme-jour');
  if (!items.length) {
    box.textContent = 'rien.';
    return;
  }
  const day = Math.floor(Date.now() / 86400000);
  const item = items[hash(`jour-${day}`) % items.length];
  box.replaceChildren();

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'carte-mini';
  btn.title = `Ouvrir « ${item.title} »`;

  if (item.poster || item.type === 'image') {
    const img = document.createElement('img');
    img.src = item.poster || item.src;
    img.alt = item.title;
    img.loading = 'lazy';
    btn.appendChild(img);
  }

  const label = document.createElement('span');
  label.textContent = item.title.slice(0, 60);
  btn.appendChild(label);
  btn.addEventListener('click', () => openLightbox(item.id));
  box.appendChild(btn);
}

/* ------------------------------------------------------------------ favoris / liens */

function toggleFav(id) {
  if (favs.has(id)) favs.delete(id);
  else favs.add(id);
  writeLS(LS.favs, [...favs]);
  render();
  if (state.openId === id) syncLightboxFav();
}

function copyLink(id) {
  const url = `${location.origin}${location.pathname}#meme=${encodeURIComponent(id)}`;
  const done = () => {
    $('#lb-msg').textContent = 'Lien copié. Collez-le quelque part de honteux.';
    window.setTimeout(() => { $('#lb-msg').textContent = ''; }, 2600);
  };
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(url).then(done).catch(() => fallbackCopy(url, done));
  } else {
    fallbackCopy(url, done);
  }
}

function fallbackCopy(text, done) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    done();
  } catch {
    window.prompt('Copiez ce lien à la main :', text);
  }
  ta.remove();
}

/* ------------------------------------------------------------------ visionneuse */

function mediaEl(item, big) {
  if (item.type === 'video') {
    const video = document.createElement('video');
    video.controls = true;
    video.playsInline = true;
    video.preload = 'metadata';
    if (item.poster) video.poster = item.poster;
    const src = document.createElement('source');
    src.src = item.src;
    src.type = item.mime || 'video/mp4';
    video.appendChild(src);
    if (!item.playable) {
      const note = document.createElement('p');
      note.className = 'sans-apercu';
      note.textContent = `Format .${item.ext} probablement non lu par le navigateur. Téléchargez-le, courage.`;
      const wrap = document.createElement('div');
      wrap.append(note, video);
      return wrap;
    }
    return video;
  }
  const img = document.createElement('img');
  img.src = item.src;
  img.alt = item.title;
  if (big) img.decoding = 'async';
  return img;
}

function openLightbox(id, opts = {}) {
  const item = items.find((i) => i.id === id);
  if (!item) return;

  state.openId = id;
  if (!opts.silentCount) {
    views[id] = (views[id] || 0) + 1;
    writeLS(LS.views, views);
  }

  $('#lb-titre').textContent = item.title;
  $('#lb-media').replaceChildren(mediaEl(item, true));

  const parts = [
    typeLabel(item),
    `.${item.ext}`,
    item.width && item.height ? `${item.width}×${item.height}` : 'dimensions inconnues',
    humanSize(item.bytes),
    item.duration ? `${item.duration.toFixed(1)} s` : null,
    `${views[id] || 0} vue(s)`,
    humanDate(item.mtime),
    item.tags && item.tags.length ? item.tags.map((t) => `#${t}`).join(' ') : null,
  ].filter(Boolean);
  $('#lb-meta').textContent = parts.join(' · ');

  $('#lb-dl').href = item.src;
  $('#lb-dl').setAttribute('download', item.file);

  $('#visionneuse').hidden = false;
  document.body.style.overflow = 'hidden';
  syncLightboxFav();

  if (location.hash !== `#meme=${encodeURIComponent(id)}`) {
    history.replaceState(null, '', `#meme=${encodeURIComponent(id)}`);
  }

  $('#lb-fermer').focus({ preventScroll: true });
  updateCardViewCount(id);
}

function updateCardViewCount(id) {
  const card = $(`.carte[data-id="${CSS.escape(id)}"]`);
  if (!card) return;
  const meta = card.querySelector('.carte-meta');
  const item = items.find((i) => i.id === id);
  if (!meta || !item) return;
  const dims = item.width && item.height ? `${item.width}×${item.height}` : 'taille inconnue';
  meta.textContent = `${typeLabel(item)} · ${dims} · ${humanSize(item.bytes)} · ${views[id] || 0} vue(s)`;
}

function syncLightboxFav() {
  const on = favs.has(state.openId);
  const btn = $('#lb-fav');
  btn.textContent = on ? '★ DANS LES FAVORIS' : '☆ AJOUTER AUX FAVORIS';
  btn.classList.toggle('actif', on);
  btn.setAttribute('aria-pressed', String(on));
}

function closeLightbox() {
  if ($('#visionneuse').hidden) return;
  $('#visionneuse').hidden = true;
  $('#lb-media').replaceChildren();
  document.body.style.overflow = '';
  state.openId = null;
  if (location.hash.startsWith('#meme=')) {
    history.replaceState(null, '', `${location.pathname}${location.search}`);
  }
  render();
}

function navList() {
  const list = filteredItems();
  if (state.openId && !list.some((i) => i.id === state.openId)) return items;
  return list.length ? list : items;
}

function step(delta) {
  if (!state.openId) return;
  const list = navList();
  if (!list.length) return;
  const idx = list.findIndex((i) => i.id === state.openId);
  const next = list[(idx + delta + list.length) % list.length];
  if (next) openLightbox(next.id, { silentCount: false });
}

/* ------------------------------------------------------------------ upload */

function setupUpload() {
  const form = $('#upload-form');
  const input = $('#upload-file');
  const submit = $('#upload-submit');
  const nameEl = $('#upload-name');
  const bar = $('#upload-bar');
  const msg = $('#upload-msg');

  const setMsg = (text, kind = '') => {
    msg.textContent = text;
    msg.className = `message ${kind}`;
  };

  input.addEventListener('change', () => {
    const file = input.files[0];
    submit.disabled = !file;
    nameEl.textContent = file ? `${file.name} · ${humanSize(file.size)}` : 'aucun fichier sélectionné';
    bar.style.width = '0%';
    setMsg('');
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const file = input.files[0];
    if (!file) return;

    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const type = VIDEO_EXT.includes(ext) ? 'video' : 'image';
    const allowed = type === 'video'
      ? VIDEO_EXT
      : ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp'];

    if (!allowed.includes(ext)) {
      setMsg(`Extension .${ext} refusée. C'est peut-être mieux comme ça.`, 'erreur');
      return;
    }

    submit.disabled = true;
    setMsg('Envoi en cours… (le serveur réfléchit)');
    bar.style.width = '2%';

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/upload?name=${encodeURIComponent(file.name)}&type=${type}`);
    xhr.upload.addEventListener('progress', (ev) => {
      if (ev.lengthComputable) bar.style.width = `${Math.round((ev.loaded / ev.total) * 100)}%`;
    });
    xhr.addEventListener('load', async () => {
      let data = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        data = null;
      }
      if (xhr.status === 201 && data && data.ok) {
        bar.style.width = '100%';
        setMsg('Meme ajouté. Félicitations, vous avez rendu ce site pire.', 'ok');
        input.value = '';
        nameEl.textContent = 'aucun fichier sélectionné';
        submit.disabled = true;
        await refresh();
        const newId = data.item && data.item.id;
        if (newId) {
          state.q = '';
          state.type = 'all';
          state.favOnly = false;
          render();
          window.setTimeout(() => openLightbox(newId), 350);
        }
      } else {
        bar.style.width = '0%';
        setMsg(
          (data && data.error) ||
            `Échec (HTTP ${xhr.status}). Si vous êtes sur GitHub Pages, l'envoi est impossible : utilisez media/ + npm run index.`,
          'erreur'
        );
        submit.disabled = false;
      }
    });
    xhr.addEventListener('error', () => {
      bar.style.width = '0%';
      setMsg('Serveur injoignable. Lancez `npm start` à la racine du projet, puis rechargez.', 'erreur');
      submit.disabled = false;
    });
    xhr.send(file);
  });
}

/* ------------------------------------------------------------------ init */

async function refresh() {
  await loadManifest();
  render();
}

function bind() {
  const search = $('#recherche');
  let timer = null;
  search.addEventListener('input', () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      state.q = search.value;
      state.limit = PAGE_SIZE;
      render();
    }, 160);
  });

  $('#tri').addEventListener('change', (e) => {
    state.sort = e.target.value;
    state.limit = PAGE_SIZE;
    render();
  });

  $$('.filtre').forEach((btn) => {
    btn.addEventListener('click', () => setType(btn.dataset.type));
  });

  $$('[data-type]').forEach((link) => {
    if (link.classList.contains('filtre')) return;
    link.addEventListener('click', () => setType(link.dataset.type));
  });

  $$('[data-fav]').forEach((link) => {
    link.addEventListener('click', () => {
      state.favOnly = true;
      state.limit = PAGE_SIZE;
      render();
    });
  });

  $('#fav-filter').addEventListener('click', () => {
    state.favOnly = !state.favOnly;
    state.limit = PAGE_SIZE;
    render();
  });

  $('#random').addEventListener('click', () => {
    const list = filteredItems();
    const pool = list.length ? list : items;
    if (!pool.length) return;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    openLightbox(pick.id);
  });

  $('#reset').addEventListener('click', resetFilters);
  $('#vide-reset').addEventListener('click', resetFilters);

  $('#plus').addEventListener('click', () => {
    state.limit += PAGE_SIZE;
    render();
  });

  $('#lb-fermer').addEventListener('click', closeLightbox);
  $('#lb-prev').addEventListener('click', () => step(-1));
  $('#lb-next').addEventListener('click', () => step(1));
  $('#lb-fav').addEventListener('click', () => { if (state.openId) toggleFav(state.openId); });
  $('#lb-copier').addEventListener('click', () => { if (state.openId) copyLink(state.openId); });

  $('#visionneuse').addEventListener('click', (e) => {
    if (e.target === $('#visionneuse')) closeLightbox();
  });

  document.addEventListener('keydown', (e) => {
    if ($('#visionneuse').hidden) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeLightbox();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      step(-1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      step(1);
    }
  });

  window.addEventListener('hashchange', handleHash);

  // délégation pour les liens du top 5 et tout lien #meme=...
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href^="#meme="]');
    if (!link) return;
    e.preventDefault();
    const id = decodeURIComponent(link.getAttribute('href').slice('#meme='.length));
    openLightbox(id);
  });

  setupUpload();
}

function setType(type) {
  state.type = type;
  state.limit = PAGE_SIZE;
  render();
  if (location.hash.startsWith('#meme=')) return;
  const grid = $('#galerie');
  if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetFilters() {
  state.q = '';
  state.type = 'all';
  state.favOnly = false;
  state.sort = 'chaos';
  state.limit = PAGE_SIZE;
  $('#recherche').value = '';
  $('#tri').value = 'chaos';
  render();
}

function handleHash() {
  const m = location.hash.match(/^#meme=(.+)$/);
  if (m) {
    const id = decodeURIComponent(m[1]);
    if (state.openId === id) return;
    const item = items.find((i) => i.id === id);
    if (item) openLightbox(id);
    else $('#statut').textContent = `Ce meme n'existe pas (ou plus) : « ${id} ». La déception est réelle.`;
  } else if (!$('#visionneuse').hidden) {
    closeLightbox();
  }
}

async function init() {
  bind();
  try {
    await refresh();
    handleHash();
    document.documentElement.dataset.mgReady = '1';
  } catch (err) {
    $('#statut').textContent = `Impossible de charger media.json : ${err.message}. Lancez « npm start » (ou un serveur statique) à la racine du projet.`;
    $('#grille').replaceChildren();
  }
}

init();
