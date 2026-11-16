// chaos.js — tout ce qui rend le site vivant et insupportable.
// Compteur bidon, popup publicitaire, mode enfer, livre d'or, newsletter.

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const LS = {
  enfer: 'mg.enfer.v1',
  compteur: 'mg.compteur.v1',
  livre: 'mg.livre.v1',
  mail: 'mg.mail.v1',
};

const EMOJIS = ['😂', '💀', '🔥', '🤡', '👾', '💩', '🦄', '📼', '💾', '🎉', '😭', '🫠'];

const CITATIONS = [
  "« Ce site est une insulte à l'UX. » — un utilisateur, avant de revenir",
  "« J'ai cligné des yeux et j'ai vu 1998. » — un ophtalmologue",
  "« On dirait MySpace après un accident. » — un designer, en pleurant",
  "« Le contenu est bien, le reste est un crime. » — la presse unanime",
  "« J'ai cliqué sur la pub. » — personne, jamais",
  "« Enfin un site qui ne ressemble pas à un template. » — moi, à 3 h du matin",
  "« C'est tellement moche que c'en est… non, c'est juste moche. » — ma mère",
  "« Le responsive marche mieux que prévu. » — moi, surpris",
];

const MAX_LIVRE = 50;

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
    /* tant pis */
  }
}

function pad(n, len) {
  return String(n).padStart(len, '0');
}

function randomOf(list) {
  return list[Math.floor(Math.random() * list.length)];
}

/* ------------------------------------------------------------------ pluie d'emojis */

function pluie(n = 24) {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < n; i++) {
    const span = document.createElement('span');
    span.className = 'pluie-emoji';
    span.textContent = randomOf(EMOJIS);
    span.style.left = `${Math.random() * 96}vw`;
    span.style.animationDelay = `${Math.random() * 0.9}s`;
    span.style.animationDuration = `${1.8 + Math.random() * 1.8}s`;
    span.style.fontSize = `${18 + Math.random() * 26}px`;
    frag.appendChild(span);
    window.setTimeout(() => span.remove(), 4200);
  }
  document.body.appendChild(frag);
}

/* ------------------------------------------------------------------ popup */

function setupPopup() {
  const popup = $('#popup');
  if (!popup) return;

  const seen = sessionStorage.getItem('mg.popup.vu');
  if (!seen) {
    const delay = document.body.classList.contains('enfer') ? 3500 : 7000;
    window.setTimeout(() => {
      popup.hidden = false;
      sessionStorage.setItem('mg.popup.vu', '1');
    }, delay);
  }

  $('#popup-fermer')?.addEventListener('click', () => {
    popup.hidden = true;
  });

  $('#popup-ok')?.addEventListener('click', () => {
    popup.hidden = true;
    pluie(38);
    document.title = '🎉 VOUS AVEZ GAGNÉ (rien) 🎉';
    window.setTimeout(() => {
      document.title = '★★★ LA GALERIE DE MEMES ★★★ (élu meilleur site 1999)';
    }, 3200);
  });
}

/* ------------------------------------------------------------------ compteur */

function setupCompteur() {
  const el = $('#compteur');
  if (!el) return;

  let value = Number(localStorage.getItem(LS.compteur) || 0);
  if (!value || Number.isNaN(value)) {
    value = 1000000 + Math.floor(Math.random() * 9000);
  }

  const draw = () => {
    el.textContent = pad(value, 7);
  };

  draw();
  window.setInterval(() => {
    value += Math.floor(Math.random() * 3);
    localStorage.setItem(LS.compteur, String(value));
    draw();
  }, 4200);
}

/* ------------------------------------------------------------------ horloge + citation */

function setupHorloge() {
  const el = $('#horloge');
  const maj = $('#maj');
  if (maj) {
    try {
      maj.textContent = new Date(document.lastModified).toLocaleDateString('fr-FR');
    } catch {
      maj.textContent = 'un jour';
    }
  }
  if (!el) return;
  const tick = () => {
    el.textContent = new Date().toLocaleTimeString('fr-FR');
  };
  tick();
  window.setInterval(tick, 1000);
}

function setupCitation() {
  const el = $('#citation');
  if (!el) return;
  let i = Math.floor(Math.random() * CITATIONS.length);
  const tick = () => {
    el.textContent = CITATIONS[i % CITATIONS.length];
    i++;
  };
  tick();
  window.setInterval(tick, 14000);
}

/* ------------------------------------------------------------------ mode enfer */

function setupEnfer() {
  const btn = $('#enfer');
  if (!btn) return;

  let enfer = readLS(LS.enfer, false);
  let last = 0;

  const apply = () => {
    document.body.classList.toggle('enfer', enfer);
    btn.setAttribute('aria-pressed', String(enfer));
    btn.textContent = enfer ? "DÉSACTIVER L'ENFER (trop tard)" : "ACTIVER L'ENFER";
    if (enfer) pluie(16);
  };

  apply();

  btn.addEventListener('click', () => {
    enfer = !enfer;
    writeLS(LS.enfer, enfer);
    apply();
    if (enfer) {
      document.title = '🔥 MODE ENFER ACTIVÉ 🔥';
      window.setTimeout(() => {
        document.title = '★★★ LA GALERIE DE MEMES ★★★ (élu meilleur site 1999)';
      }, 2400);
    }
  });

  document.addEventListener('mousemove', (e) => {
    if (!enfer) return;
    const now = performance.now();
    if (now - last < 70) return;
    last = now;
    const span = document.createElement('span');
    span.className = 'traine-curseur';
    span.textContent = randomOf(EMOJIS);
    span.style.left = `${e.clientX}px`;
    span.style.top = `${e.clientY}px`;
    document.body.appendChild(span);
    window.setTimeout(() => span.remove(), 800);
  });

  document.addEventListener('click', (e) => {
    if (!enfer) return;
    if (e.target.closest('input, textarea, select, video')) return;
    const box = document.querySelector('.corps');
    if (!box) return;
    box.style.transform = `translate(${Math.random() * 4 - 2}px, ${Math.random() * 4 - 2}px)`;
    window.setTimeout(() => { box.style.transform = ''; }, 130);
  });
}

/* ------------------------------------------------------------------ arnaque */

function setupArnaque() {
  $$('[data-arnaque]').forEach((btn) => {
    btn.addEventListener('click', () => {
      btn.textContent = 'VOUS AVEZ ÉTÉ ARNAQUÉ';
      btn.style.animation = 'none';
      pluie(20);
      window.setTimeout(() => {
        btn.textContent = 'CLIQUEZ ICI';
        btn.style.animation = '';
      }, 4000);
    });
  });
}

/* ------------------------------------------------------------------ livre d'or */

function renderLivre() {
  const liste = $('#livre-liste');
  if (!liste) return;
  const entries = readLS(LS.livre, []);
  liste.replaceChildren();

  if (!entries.length) {
    const li = document.createElement('li');
    li.className = 'livre-vide';
    li.textContent = "Le livre d'or est vide. Personne ne vous aime. (Ou alors localStorage est bloqué.)";
    liste.appendChild(li);
    return;
  }

  for (const entry of entries) {
    const li = document.createElement('li');
    li.className = 'livre-entree';

    const auteur = document.createElement('span');
    auteur.className = 'auteur';
    auteur.textContent = entry.nom;

    const date = document.createElement('span');
    date.className = 'date';
    date.textContent = ` · ${new Date(entry.at).toLocaleString('fr-FR')}`;

    const p = document.createElement('p');
    p.textContent = entry.message;

    li.append(auteur, date, p);
    liste.appendChild(li);
  }
}

function setupLivre() {
  const form = $('#livre-form');
  if (!form) return;
  const nom = $('#livre-nom');
  const message = $('#livre-message');
  const msg = $('#livre-msg');

  const saved = readLS('mg.pseudo.v1', '');
  if (saved) nom.value = saved;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const n = nom.value.trim();
    const m = message.value.trim();
    if (n.length < 2) {
      msg.textContent = 'Un pseudo de 2 caractères minimum. Même « a » ne suffit pas.';
      msg.className = 'message erreur';
      nom.focus();
      return;
    }
    if (m.length < 2) {
      msg.textContent = 'Un message vide, comme votre vie sociale ? 2 caractères minimum.';
      msg.className = 'message erreur';
      message.focus();
      return;
    }

    const entries = readLS(LS.livre, []);
    entries.unshift({ nom: n.slice(0, 24), message: m.slice(0, 280), at: Date.now() });
    writeLS(LS.livre, entries.slice(0, MAX_LIVRE));
    writeLS('mg.pseudo.v1', n.slice(0, 24));

    message.value = '';
    msg.textContent = `Merci ${n}. Votre message est stocké dans VOTRE navigateur, donc il n'existe pas vraiment.`;
    msg.className = 'message ok';
    renderLivre();
    pluie(8);
  });

  $('#livre-vider')?.addEventListener('click', () => {
    if (!window.confirm('Effacer tout le livre d\'or ? Les preuves disparaissent.')) return;
    writeLS(LS.livre, []);
    renderLivre();
    msg.textContent = 'Livre d\'or effacé. Comme vos promesses.';
    msg.className = 'message erreur';
  });

  renderLivre();
}

/* ------------------------------------------------------------------ newsletter */

function setupNewsletter() {
  const form = $('#newsletter-form');
  if (!form) return;
  const input = $('#newsletter-email');
  const msg = $('#newsletter-msg');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const mail = input.value.trim();
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail);
    if (!ok) {
      msg.textContent = 'ERREUR 404 : adresse email introuvable.';
      msg.className = 'message erreur';
      input.focus();
      return;
    }
    writeLS(LS.mail, { mail: mail.slice(0, 120), at: Date.now() });
    msg.textContent = `Inscription enregistrée pour ${mail}. Aucun email ne sera jamais envoyé.`;
    msg.className = 'message ok';
    input.value = '';
    pluie(6);
  });

  const saved = readLS(LS.mail, null);
  if (saved && saved.mail) {
    msg.textContent = `Déjà inscrit : ${saved.mail}. Vous êtes piégé(e).`;
  }
}

/* ------------------------------------------------------------------ init */

function init() {
  setupPopup();
  setupCompteur();
  setupHorloge();
  setupCitation();
  setupEnfer();
  setupArnaque();
  setupLivre();
  setupNewsletter();
  window.addEventListener('mg:pluie', (e) => pluie((e.detail && e.detail.n) || 20));
}

init();
