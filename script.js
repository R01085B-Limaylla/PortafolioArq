// ===== SUPABASE CONFIG =====
const SUPABASE_URL = 'https://oqrmtfxvhtmjyoekssgu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xcm10Znh2aHRtanlvZWtzc2d1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxMjA3NjYsImV4cCI6MjA3NDY5Njc2Nn0.mdjAo_SdGt4KfnEuyXT8KVaJDA6iDVNbHLYmt22e-b0';

const SB = window.supabase;

// ===== Estado =====
const store = { entries: [], repoEntries: [], isAdmin: false, dirHandle: null, currentWeek: 1 };
const dbEntriesKey = 'entries';
const keyDirHandle = 'dirHandle';
const dbFileKey = id => `file:${id}`;

// ===== Utils =====
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const fmtBytes = b =>
  b < 1024
    ? b + ' B'
    : b < 1024 ** 2
    ? (b / 1024).toFixed(1) + ' KB'
    : b < 1024 ** 3
    ? (b / 1024 ** 2).toFixed(1) + ' MB'
    : (b / 1024 ** 3).toFixed(1) + ' GB';
const openModal = el => (el.style.display = 'flex');
const closeModal = el => (el.style.display = 'none');

const updateAuthUI = () => {
  $('#btn-login').classList.toggle('hidden', store.isAdmin);
  $('#btn-logout').classList.toggle('hidden', !store.isAdmin);
  $('#admin-tools').classList.toggle('hidden', !store.isAdmin);
};

async function persistEntries() {
  await idbKeyval.set(dbEntriesKey, store.entries);
}
async function loadEntries() {
  store.entries = (await idbKeyval.get(dbEntriesKey)) || [];
}
async function saveDirHandle(handle) {
  try {
    await idbKeyval.set(keyDirHandle, handle);
  } catch (e) {}
}
async function loadDirHandle() {
  try {
    store.dirHandle = (await idbKeyval.get(keyDirHandle)) || null;
  } catch (e) {}
}

function ensureWeekOptions(sel) {
  sel.innerHTML =
    '<option value="" disabled selected>Semana…</option>' +
    Array.from({ length: 16 }, (_, i) => `<option value="${i + 1}">Semana ${i + 1}</option>`).join('');
}

function showView(name) {
  $('#view-portfolio').classList.toggle('hidden', name !== 'portfolio');
  $('#view-profile').classList.toggle('hidden', name !== 'profile');

  toggleSecondSidebar(name === 'portfolio');
  if (name === 'portfolio') openWeek(store.currentWeek || 1);
}

function toggleSecondSidebar(show) {
  const sb2 = $('#sidebar-weeks');
  const main = $('#app-main');
  if (!sb2 || !main) return;
  sb2.classList.toggle('show', !!show);
  sb2.style.display = show ? 'flex' : 'none';
  main.classList.toggle('with-sidebar-2', !!show);
}

// ===== Manifest remoto =====
async function loadRepoManifest() {
  try {
    const r = await fetch('uploads/index.json', { cache: 'no-store' });
    if (!r.ok) return;
    const d = await r.json();
    store.repoEntries = (d.items || []).map(it => ({
      title: it.title || it.name,
      name: it.name,
      week: +it.week,
      type: it.type,
      url: it.url
    }));
  } catch (e) {}
}

// ===== Cards =====
function createCard(item) {
  const tpl = $('#card-template');
  const node = tpl.content.firstElementChild.cloneNode(true);
  const img = $('[data-role=thumb]', node);
  const pdfCover = $('[data-role=pdfcover]', node);
  const title = $('[data-role=title]', node);
  const meta = $('[data-role=meta]', node);
  const btnPrev = $('[data-action=preview]', node);
  const aDownload = $('[data-role=download]', node);

  title.textContent = item.title || item.name;
  meta.textContent = `${item.type.toUpperCase()} · Semana ${item.week}`;
  aDownload.href = item.url;
  aDownload.download = item.name;

  if (item.type === 'image') {
    img.src = item.url;
    img.onload = () => img.classList.remove('hidden');
  } else {
    pdfCover.classList.remove('hidden');
  }

  btnPrev.onclick = () => {
    const cont = $('#preview-container');
    cont.innerHTML = '';
    if (item.type === 'image') {
      const im = new Image();
      im.src = item.url;
      im.className = 'w-full h-full object-contain bg-black';
      cont.appendChild(im);
    } else {
      const ifr = document.createElement('iframe');
      ifr.src = item.url;
      ifr.className = 'w-full h-full';
      cont.appendChild(ifr);
    }
    openModal($('#modal-preview'));
  };

  return node;
}

// ===== Render =====
function buildWeeksSidebar() {
  const nav = $('#weeks-nav');
  if (!nav) return;
  nav.innerHTML = '';
  for (let w = 1; w <= 16; w++) {
    const count = store.repoEntries.filter(e => +e.week === w).length;
    const btn = document.createElement('button');
    btn.className = 'wk';
    btn.dataset.week = String(w);
    btn.innerHTML = `
      <span class="pill">${w}</span>
      <span>Semana ${w}</span>
      <span style="margin-left:auto; font-size:.75rem; color:#a9b6dc;">${count}</span>`;
    btn.addEventListener('click', () => {
      $$('#weeks-nav .wk').forEach(b => b.classList.toggle('active', b === btn));
      openWeek(w);
    });
    if (w === (store.currentWeek || 1)) btn.classList.add('active');
    nav.appendChild(btn);
  }
}

function renderWeekGrid(week) {
  const grid = $('#files-grid');
  if (!grid) return;
  grid.innerHTML = '';
  const items = store.repoEntries.filter(e => +e.week === +week);
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No hay archivos en esta semana.';
    grid.appendChild(empty);
    return;
  }
  items.forEach(it => grid.appendChild(createCard(it)));
}

function openWeek(w) {
  store.currentWeek = w;
  renderWeekGrid(w);
}

// ===== CRUD =====
async function addEntry({ title, week, file }) {
  const id = crypto.randomUUID();
  const type = file.type.startsWith('image/') ? 'image' : 'pdf';
  const meta = {
    id,
    title: title || file.name,
    week: +week,
    type,
    name: file.name,
    size: file.size,
    createdAt: Date.now()
  };

  store.entries.push(meta);
  await idbKeyval.set(dbFileKey(id), file);
  await persistEntries();

  buildWeeksSidebar();
  if (store.currentWeek === meta.week) {
    renderWeekGrid(store.currentWeek);
  }

  alert('Archivo guardado.');
}

// ===== SUPABASE AUTH =====
async function sbSignUp(email, password) {
  const { data, error } = await SB.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

async function sbSignIn(email, password) {
  const { data, error } = await SB.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function sbSignOut() {
  await SB.auth.signOut();
}

SB.auth.onAuthStateChange((_event, session) => {
  const isLogged = !!session;
  store.isAdmin = isLogged;
  updateAuthUI();
});

// ===== Init =====
document.addEventListener('DOMContentLoaded', async () => {
  ensureWeekOptions(document.getElementById('week-select'));
  await loadEntries();
  await loadDirHandle();
  await loadRepoManifest();

  buildWeeksSidebar();
  openWeek(1);

  store.isAdmin = false;
  updateAuthUI();

  $$('button[data-nav]').forEach(b => (b.onclick = () => showView(b.dataset.nav)));
  showView('portfolio');

  // Login con Supabase
  document.getElementById('login-form').onsubmit = async e => {
    e.preventDefault();
    const email = document.getElementById('login-user').value.trim();
    const pass = document.getElementById('login-pass').value.trim();
    try {
      await sbSignIn(email, pass);
      closeModal(document.getElementById('modal-login'));
    } catch (err) {
      alert('No se pudo iniciar sesión: ' + err.message);
    }
  };
  document.getElementById('btn-logout').onclick = sbSignOut;

  // Upload (solo admins)
  document.getElementById('upload-form').onsubmit = async e => {
    e.preventDefault();
    const title = $('#title-input').value.trim();
    const week = $('#week-select').value;
    const file = $('#file-input').files[0];
    if (!title || !week || !file) return alert('Completa título, semana y archivo.');
    await addEntry({ title, week, file });
    e.target.reset();
    $('#week-select').value = '';
  };

  // Close modals
  $$('#modal-login [data-close], #modal-preview [data-close]').forEach(
    b => (b.onclick = ev => closeModal(ev.target.closest('.modal-backdrop')))
  );
  $$('#modal-login, #modal-preview').forEach(m =>
    m.addEventListener('click', e => {
      if (e.target.classList.contains('modal-backdrop')) closeModal(e.target);
    })
  );
});



