// ===== Estado =====
const store = {
  entries: [],          // IndexedDB (copia local de archivos subidos)
  repoEntries: [],      // Publicados en uploads/index.json
  isAdmin: false,       // True solo si session y email === admin@upla.edu
  dirHandle: null,      // Carpeta uploads/ conectada con File System Access API
  currentWeek: 1
};
const dbEntriesKey = 'entries';
const keyDirHandle = 'dirHandle';
const dbFileKey = id => `file:${id}`;

// Atajos DOM
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

// ===== Utils =====
const fmtBytes = b => b < 1024 ? b + ' B'
  : b < 1024 ** 2 ? (b / 1024).toFixed(1) + ' KB'
  : b < 1024 ** 3 ? (b / 1024 ** 2).toFixed(1) + ' MB'
  : (b / 1024 ** 3).toFixed(1) + ' GB';

const openModal = el => el && (el.style.display = 'flex');
const closeModal = el => el && (el.style.display = 'none');

function ensureWeekOptions(sel) {
  if (!sel) return;
  sel.innerHTML = '<option value="" disabled selected>Semana…</option>' +
    Array.from({ length: 16 }, (_, i) => `<option value="${i + 1}">Semana ${i + 1}</option>`).join('');
}

function updateAuthUI() {
  $('#btn-login')?.classList.toggle('hidden', store.isAdmin);
  $('#btn-logout')?.classList.toggle('hidden', !store.isAdmin);
  $('#admin-tools')?.classList.toggle('hidden', !store.isAdmin);

  // Re-render total según el estado actual (admin o no):
  // - Recalculamos los conteos de la barra de semanas
  // - Re-render del grid de la semana actual (reconstruye las cards sin/ con CRUD)
  buildWeeksSidebar();
  openWeek(store.currentWeek || 1);
}


function showView(name) {
  $('#view-portfolio')?.classList.toggle('hidden', name !== 'portfolio');
  $('#view-profile')?.classList.toggle('hidden', name !== 'profile');

  $$('button[data-nav]').forEach(b => {
    const active = b.dataset.nav === name;
    b.classList.toggle('active', active);
    if (active) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });

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

// ===== Persistencia local =====
async function persistEntries() { await idbKeyval.set(dbEntriesKey, store.entries); }
async function loadEntries() { store.entries = (await idbKeyval.get(dbEntriesKey)) || []; }
async function saveDirHandle(handle) { try { await idbKeyval.set(keyDirHandle, handle); } catch (e) {} }
async function loadDirHandle() { try { store.dirHandle = (await idbKeyval.get(keyDirHandle)) || null; } catch (e) {} }

// ===== Manifest (publicado) =====
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
  } catch (e) { /* sin manifest */ }
}

// ===== File System Access API =====
async function verifyPermission(handle, mode = 'readwrite') {
  if (!handle) return false;
  const opts = { mode };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  if ((await handle.requestPermission(opts)) === 'granted') return true;
  return false;
}

async function pickFolder() {
  if (!window.showDirectoryPicker) { alert('Tu navegador no soporta elegir carpeta. Usa Chrome/Edge.'); return; }
  try {
    const dir = await window.showDirectoryPicker({ id: 'uploads-folder' });
    const ok = await verifyPermission(dir, 'readwrite'); if (!ok) return;
    store.dirHandle = dir;
    await saveDirHandle(dir);
    $('#folder-status').textContent = 'Carpeta conectada ✔';
    await ensureManifestFile();
  } catch (e) { console.error(e); }
}

async function ensureManifestFile() {
  if (!store.dirHandle) return;
  const ok = await verifyPermission(store.dirHandle, 'readwrite'); if (!ok) return;
  try { await store.dirHandle.getFileHandle('index.json'); }
  catch {
    const f = await store.dirHandle.getFileHandle('index.json', { create: true });
    const w = await f.createWritable();
    await w.write(JSON.stringify({ items: [] }, null, 2));
    await w.close();
  }
}

async function readLocalManifest() {
  if (!store.dirHandle) return { items: [] };
  const ok = await verifyPermission(store.dirHandle, 'read'); if (!ok) return { items: [] };
  try {
    const fh = await store.dirHandle.getFileHandle('index.json');
    const f = await fh.getFile();
    const txt = await f.text();
    return JSON.parse(txt || '{}');
  } catch (e) { return { items: [] }; }
}

async function writeLocalManifest(manifest) {
  if (!store.dirHandle) return;
  const ok = await verifyPermission(store.dirHandle, 'readwrite'); if (!ok) return;
  const fh = await store.dirHandle.getFileHandle('index.json', { create: true });
  const w = await fh.createWritable();
  await w.write(JSON.stringify(manifest, null, 2));
  await w.close();
}

async function saveFileToFolder(file, filename) {
  if (!store.dirHandle) return;
  const ok = await verifyPermission(store.dirHandle, 'readwrite'); if (!ok) return;
  const fh = await store.dirHandle.getFileHandle(filename, { create: true });
  const w = await fh.createWritable();
  await w.write(file);
  await w.close();
}

// ===== Thumbnails =====
async function renderPdfThumb(url, imgEl) {
  try {
    if (!window.pdfjsLib) throw new Error('pdfjs no disponible');
    const pdf = await pdfjsLib.getDocument({ url }).promise;
    const page = await pdf.getPage(1);
    const vp = page.getViewport({ scale: 1.0 });
    const scale = Math.min(640 / vp.width, 1.5);
    const v = page.getViewport({ scale });
    const c = document.createElement('canvas'); c.width = v.width; c.height = v.height;
    await page.render({ canvasContext: c.getContext('2d', { alpha: false }), viewport: v }).promise;
    imgEl.src = c.toDataURL('image/png');
    imgEl.classList.remove('hidden');
  } catch (e) {
    // deja icono PDF
  }
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
  meta.textContent = `${(item.type || '').toUpperCase()} · Semana ${item.week}`;
  aDownload.href = item.url;
  aDownload.download = item.name;

  if (item.type === 'image') {
    img.src = item.url;
    img.onload = () => img.classList.remove('hidden');
  } else {
    renderPdfThumb(item.url, img).then(() => {
      if (!img.src) pdfCover.classList.remove('hidden');
    });
  }

  btnPrev.onclick = () => {
    const cont = $('#preview-container'); cont.innerHTML = '';
    if (item.type === 'image') {
      const im = new Image(); im.src = item.url; im.className = 'w-full h-full object-contain bg-black'; cont.appendChild(im);
    } else {
      const ifr = document.createElement('iframe'); ifr.src = item.url; ifr.className = 'w-full h-full'; cont.appendChild(ifr);
    }
    openModal($('#modal-preview'));
  };

  // ===== Botones CRUD (solo admin) =====
  const actionsWrap = btnPrev.parentElement;
  if (store.isAdmin && actionsWrap) {
    // EDITAR
    const btnEdit = document.createElement('button');
    btnEdit.className = 'btn btn-ghost px-2 py-1 text-xs';
    btnEdit.textContent = 'Editar';
    btnEdit.onclick = () => openEditDialog(item);

    // ELIMINAR
    const btnDel = document.createElement('button');
    btnDel.className = 'btn btn-ghost px-2 py-1 text-xs';
    btnDel.textContent = 'Eliminar';
    btnDel.onclick = () => {
      if (confirm(`¿Eliminar "${item.title || item.name}"?`)) {
        deleteEntry(item).catch(err => alert('No se pudo eliminar: ' + err.message));
      }
    };

    actionsWrap.appendChild(btnEdit);
    actionsWrap.appendChild(btnDel);
  }

  return node;
}

// ===== Render: barra 2 (semanas) + grid =====
function buildWeeksSidebar() {
  const nav = $('#weeks-nav'); if (!nav) return;
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

// Grid central (visible para todos)
function renderWeekGrid(week) {
  const grid = $('#files-grid'); if (!grid) return;
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
  store.currentWeek = +w;
  renderWeekGrid(store.currentWeek);
}

// ===== CRUD + Auto actualización de index.json local =====
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

  // Guarda copia local en IndexedDB
  store.entries.push(meta);
  await idbKeyval.set(dbFileKey(id), file);
  await persistEntries();

  // Si hay carpeta conectada, guarda archivo físico y actualiza manifest
  if (store.dirHandle) {
    await saveFileToFolder(file, meta.name);
    const manifest = await readLocalManifest();
    const idx = (manifest.items || []).findIndex(x => x.name === meta.name);
    const item = { title: meta.title, week: meta.week, type: meta.type, name: meta.name, url: `uploads/${meta.name}` };
    if (idx >= 0) manifest.items[idx] = item; else (manifest.items || (manifest.items = [])).push(item);
    await writeLocalManifest(manifest);
  }

  // Refrescar UI
  await loadRepoManifest();
  buildWeeksSidebar();
  if (store.currentWeek === meta.week) renderWeekGrid(store.currentWeek);

  alert('Archivo guardado. Si conectaste uploads/, ya se actualizó index.json. Luego haz git add/commit/push.');
}

// Editar item del manifest (título y semana)
async function editEntry(name, newTitle, newWeek) {
  if (!store.dirHandle) { alert('Conecta la carpeta uploads/ para editar.'); return; }
  const manifest = await readLocalManifest();
  const items = manifest.items || [];
  const idx = items.findIndex(x => x.name === name);
  if (idx < 0) throw new Error('Elemento no encontrado en index.json');

  items[idx].title = newTitle;
  items[idx].week = +newWeek;

  await writeLocalManifest({ items });
  await loadRepoManifest();
  buildWeeksSidebar();
  renderWeekGrid(store.currentWeek);
  alert('Actualizado. Recuerda git add/commit/push.');
}

// Eliminar del manifest y archivo físico
async function deleteEntry(item) {
  if (!store.dirHandle) { alert('Conecta la carpeta uploads/ para eliminar.'); return; }

  // 1) borrar archivo físico
  try {
    await store.dirHandle.removeEntry(item.name);
  } catch (e) {
    console.warn('No se pudo borrar archivo físico (quizás no existe):', e);
  }

  // 2) quitar del manifest
  const manifest = await readLocalManifest();
  const items = manifest.items || [];
  const filtered = items.filter(x => x.name !== item.name);
  await writeLocalManifest({ items: filtered });

  // 3) refrescar UI
  await loadRepoManifest();
  buildWeeksSidebar();
  renderWeekGrid(store.currentWeek);

  alert('Eliminado. Recuerda git add/commit/push.');
}

// Diálogo simple para editar
function openEditDialog(item) {
  const currTitle = item.title || item.name;
  const currWeek = item.week;

  const newTitle = prompt('Nuevo título:', currTitle);
  if (newTitle === null) return;

  let newWeek = prompt('Nueva semana (1-16):', String(currWeek));
  if (newWeek === null) return;
  newWeek = parseInt(newWeek, 10);
  if (!(newWeek >= 1 && newWeek <= 16)) {
    alert('Semana inválida. Debe ser un número entre 1 y 16.');
    return;
  }

  editEntry(item.name, newTitle.trim(), newWeek).catch(err => {
    alert('No se pudo editar: ' + err.message);
  });
}

// ===== SUPABASE AUTH (usa `window.SB` creado en index.html) =====
const SB = window.supabase || null;

async function sbSignIn(email, password) {
  if (!SB) throw new Error('Supabase no está disponible. Revisa el <script type="module"> de index.html');
  const { data, error } = await SB.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}
async function sbSignOut() {
  if (!SB) return;
  await SB.auth.signOut();
}

// Solo admin@upla.edu es admin
if (SB) {
  SB.auth.onAuthStateChange((_event, session) => {
    const email = (session?.user?.email || '').toLowerCase();
    store.isAdmin = !!session && email === 'admin@upla.edu'; // <— aquí limitamos admin
    updateAuthUI();
  });
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', async () => {
  // Selects semana en el formulario
  ensureWeekOptions($('#week-select'));

  // Cargas iniciales
  await loadEntries();
  await loadDirHandle();
  await loadRepoManifest();

  // Construir barra lateral de semanas
  buildWeeksSidebar();

  // Mostrar Portafolio por defecto y semana 1
  showView('portfolio');
  openWeek(1);

  // Login (abrir/cerrar modal)
  $('#btn-login')?.addEventListener('click', () => openModal($('#modal-login')));
  $('#btn-logout')?.addEventListener('click', sbSignOut);

  // Form login con Supabase
  const loginForm = $('#login-form');
  if (loginForm) {
    loginForm.onsubmit = async (e) => {
      e.preventDefault();
      const email = $('#login-user').value.trim();
      const pass = $('#login-pass').value.trim();
      try {
        await sbSignIn(email, pass);
        closeModal($('#modal-login'));
      } catch (err) {
        alert('No se pudo iniciar sesión: ' + (err?.message || err));
      }
    };
  }

  // Navegación (Portafolio/Perfil)
  $$('button[data-nav]').forEach(b => b.addEventListener('click', () => showView(b.dataset.nav)));

  // Upload (solo admin, pero el form está oculto si no es admin)
  const uploadForm = $('#upload-form');
  if (uploadForm) {
    uploadForm.onsubmit = async (e) => {
      e.preventDefault();
      const title = $('#title-input').value.trim();
      const week = $('#week-select').value;
      const file = $('#file-input').files[0];
      if (!title || !week || !file) return alert('Completa título, semana y archivo.');
      await addEntry({ title, week, file });
      e.target.reset();
      $('#week-select').value = '';
    };
  }

  // Conectar carpeta
  $('#btn-pick-folder')?.addEventListener('click', pickFolder);

  // Cerrar modales
  $$('#modal-login [data-close], #modal-preview [data-close]').forEach(b =>
    b.addEventListener('click', (ev) => closeModal(ev.target.closest('.modal-backdrop')))
  );
  $$('#modal-login, #modal-preview').forEach(m =>
    m.addEventListener('click', (e) => { if (e.target.classList.contains('modal-backdrop')) closeModal(e.target); })
  );
});




