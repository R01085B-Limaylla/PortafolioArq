/* ============================
   script.js — PARTE 1/3
   Estado, Utils, Auth, Carga, Sidebar Semanas, Render Grid
   ============================ */

// ===== Estado global =====
const store = {
  entries: [],          // copia local (IndexedDB) si quieres
  repoEntries: [],      // items visibles (de Supabase o index.json)
  isAdmin: false,       // auth (se setea por Supabase)
  currentWeek: 1,       // semana seleccionada
  dirHandle: null       // para File System Access API (opcional)
};

// Claves IndexedDB locales (por compatibilidad con lo anterior)
const dbEntriesKey = 'entries';
const keyDirHandle  = 'dirHandle';
const dbFileKey     = id => `file:${id}`;

// ===== Utils DOM =====
const $  = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

// ===== Modales =====
const openModal  = el => el && (el.style.display = 'flex');
const closeModal = el => el && (el.style.display = 'none');

// ===== Vista principal/Perfil y barra secundaria =====
function showView(name) {
  $('#view-portfolio')?.classList.toggle('hidden', name !== 'portfolio');
  $('#view-profile')?.classList.toggle('hidden',   name !== 'profile');

  // marca activo
  $$('button[data-nav]').forEach(b => {
    const active = b.dataset.nav === name;
    b.classList.toggle('active', active);
    if (active) b.setAttribute('aria-current', 'page');
    else        b.removeAttribute('aria-current');
  });

  // mostrar barra 2 solo en portafolio
  toggleSecondSidebar(name === 'portfolio');

   async function fetchAllEntries() {
  // 1) Si tienes Supabase configurado y la tabla portfolio_items:
  try {
    if (window.supabase) {
      const { data, error } = await supabase
        .from('portfolio_items')
        .select('*')
        .order('week', { ascending: true });
      if (!error && Array.isArray(data)) {
        store.repoEntries = data.map(r => ({
          title: r.title || r.name,
          name: r.name,
          week: +r.week,
          type: r.type,
          url: r.url
        }));
        return;
      }
    }
  } catch (_) {}

  // 2) Fallback: manifest local
  await loadRepoManifest();
}


  // asegurar que hay semana abierta en portafolio
  if (name === 'portfolio') openWeek(store.currentWeek || 1);
}

function toggleSecondSidebar(show) {
  const sb2  = $('#sidebar-weeks');
  const main = $('#app-main');
  if (!sb2 || !main) return;
  sb2.classList.toggle('show', !!show);
  sb2.style.display = show ? 'flex' : 'none';
  main.classList.toggle('with-sidebar-2', !!show);
}

// ===== UI Auth (muestra/oculta herramientas admin) =====
function updateAuthUI() {
  $('#btn-login')?.classList.toggle('hidden',  store.isAdmin);
  $('#btn-logout')?.classList.toggle('hidden', !store.isAdmin);
  $('#admin-tools')?.classList.toggle('hidden', !store.isAdmin);

  // Re-render tarjetas para mostrar/ocultar acciones admin sin recargar
  renderWeekGrid(store.currentWeek || 1);
}

// ===== Supabase Client (inyectado desde index.html) =====
function sbClient() {
  if (!window.supabase) {
    console.warn('Supabase no está disponible. Asegúrate de tener el <script type="module"> con createClient en index.html antes de script.js');
    return null;
  }
  return window.supabase;
}

// ===== Auth con Supabase =====
async function sbSignIn(email, password) {
  const sb = sbClient();
  if (!sb) throw new Error('Supabase no inicializado');
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function sbSignOut() {
  const sb = sbClient();
  if (!sb) return;
  await sb.auth.signOut();
}

// Reacciona a cambios de sesión (login/logout) sin recargar
(function bindAuthListener() {
  const sb = sbClient();
  if (!sb) return;
  sb.auth.onAuthStateChange((_event, session) => {
    store.isAdmin = !!session;
    updateAuthUI();
  });
})();

// ===== Carga de entradas (Supabase primero; fallback a index.json) =====
async function loadRepoEntries() {
  // 1) Intentar traer desde Supabase (tabla y/o bucket)
  const sb = sbClient();
  let items = [];

  try {
    if (sb) {
      // Preferimos la tabla (si la creaste como te indiqué: portfolio_items)
      const { data: rows, error } = await sb
        .from('portfolio_items')
        .select('title,name,week,type,url')
        .order('week', { ascending: true });

      if (error) {
        console.warn('Tabla portfolio_items no disponible:', error.message);
      } else if (rows && rows.length) {
        items = rows.map(r => ({
          title: r.title || r.name,
          name:  r.name,
          week:  +r.week,
          type:  r.type,          // 'image' o 'pdf'
          url:   r.url            // URL pública del archivo en Storage
        }));
      }
    }
  } catch (e) {
    console.warn('Supabase fetch falló:', e);
  }

  // 2) Fallback: manifest uploads/index.json del repo (si existe)
  if (!items.length) {
    try {
      const r = await fetch('uploads/index.json', { cache: 'no-store' });
      if (r.ok) {
        const d = await r.json();
        items = (d.items || []).map(it => ({
          title: it.title || it.name,
          name:  it.name,
          week:  +it.week,
          type:  it.type,
          url:   it.url
        }));
      }
    } catch (_) {
      // sin manifest => lista vacía
    }
  }

  store.repoEntries = items;
}

// ===== Construye la barra de semanas (1–16) =====
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
      <span style="margin-left:auto; font-size:.75rem; color:#a9b6dc;">${count}</span>
    `;
    btn.addEventListener('click', () => {
      store.currentWeek = w;
      $$('#weeks-nav .wk').forEach(b => b.classList.toggle('active', b === btn));
      openWeek(w);
    });
    if (w === (store.currentWeek || 1)) btn.classList.add('active');
    nav.appendChild(btn);
  }
}

// ===== PDF thumbnail (PDF.js) =====
async function renderPdfThumb(url, imgEl) {
  try {
    const pdf = await pdfjsLib.getDocument({ url }).promise;
    const page = await pdf.getPage(1);
    const vp   = page.getViewport({ scale: 1.0 });
    const scale = Math.min(640 / vp.width, 1.5);
    const v = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width  = v.width;
    canvas.height = v.height;
    await page.render({ canvasContext: canvas.getContext('2d', { alpha: false }), viewport: v }).promise;
    imgEl.src = canvas.toDataURL('image/png');
    imgEl.classList.remove('hidden');
  } catch (e) {
    // Si falla, se deja solo el ícono 📄
  }
}

// ===== Tarjeta de archivo (con acciones admin si está logueado) =====
function createCard(item) {
  const tpl  = $('#card-template');
  const node = tpl.content.firstElementChild.cloneNode(true);

  const img      = $('[data-role=thumb]', node);
  const pdfCover = $('[data-role=pdfcover]', node);
  const titleEl  = $('[data-role=title]', node);
  const metaEl   = $('[data-role=meta]',  node);
  const btnPrev  = $('[data-action=preview]', node);
  const aDownload= $('[data-role=download]', node);

  // Texto
  titleEl.textContent = item.title || item.name;
  metaEl.textContent  = `${(item.type || '').toUpperCase()} · Semana ${item.week}`;
  aDownload.href      = item.url;
  aDownload.download  = item.name;

  // Miniatura
  if (item.type === 'image') {
    img.src = item.url;
    img.onload = () => img.classList.remove('hidden');
  } else {
    renderPdfThumb(item.url, img).then(() => {
      if (!img.src) pdfCover.classList.remove('hidden');
    });
  }

  // Vista previa modal
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

  // ==== Acciones admin (se añaden dinámicamente según login) ====
  if (store.isAdmin) {
    // Botonera adjunta a la tarjeta (al lado de "Ver" y "Descargar")
    const actionsWrap = document.createElement('div');
    actionsWrap.className = 'flex items-center gap-1';

    const btnEdit = document.createElement('button');
    btnEdit.className = 'btn btn-ghost px-2 py-1 text-xs';
    btnEdit.textContent = 'Editar';
    btnEdit.addEventListener('click', () => handleEditItem(item));

    const btnDel = document.createElement('button');
    btnDel.className = 'btn btn-ghost px-2 py-1 text-xs';
    btnDel.textContent = 'Eliminar';
    btnDel.addEventListener('click', () => handleDeleteItem(item));

    actionsWrap.appendChild(btnEdit);
    actionsWrap.appendChild(btnDel);

    // insertar junto a los existentes
    const rightBtns = node.querySelector('.flex.items-center.gap-1');
    rightBtns?.appendChild(actionsWrap);
  }

  return node;
}

// ===== Render del grid central =====
function renderWeekGrid(week) {
  const grid = $('#files-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const items = store.repoEntries
    .filter(e => +e.week === +week)
    .sort((a, b) => (a.title || a.name).localeCompare(b.title || b.name));

  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No hay archivos en esta semana.';
    grid.appendChild(empty);
    return;
  }

  items.forEach(it => grid.appendChild(createCard(it)));
}

// ===== Abre semana seleccionada =====
function openWeek(w) {
  store.currentWeek = +w || 1;
  renderWeekGrid(store.currentWeek);
}

// ====== Login modal bindings (se completan en Parte 3) ======
// (los listeners de login/logout se conectan al final del DOMContentLoaded)

/* ====== Fin PARTE 1/3 ====== */

/* ============================
   script.js — PARTE 2/3
   Upload a Supabase Storage + CRUD (Editar / Eliminar solo Admin)
   ============================ */

// === Config de Storage ===
const SUPABASE_BUCKET = 'uploads'; // usa el bucket público que creaste

// === Helpers de semana en el <select> del formulario ===
function ensureWeekOptions(sel) {
  if (!sel) return;
  sel.innerHTML = '<option value="" disabled selected>Semana…</option>' +
    Array.from({ length: 16 }, (_, i) => `<option value="${i + 1}">Semana ${i + 1}</option>`).join('');
}

// === Helpers de auth "admin real": solo admin@upla.edu puede administrar ===
function isAdminEmail(email) {
  return email && email.toLowerCase() === 'admin@upla.edu';
}

async function applySessionFromSupabase() {
  const sb = sbClient();
  if (!sb) return;
  const { data } = await sb.auth.getSession();
  const session = data?.session || null;
  store.isAdmin = !!session && isAdminEmail(session.user?.email);
  updateAuthUI();
}

// Re-forzar listener con filtro de admin por email
(function bindStrongAuthListener() {
  const sb = sbClient();
  if (!sb) return;
  sb.auth.onAuthStateChange((_event, session) => {
    store.isAdmin = !!session && isAdminEmail(session?.user?.email);
    updateAuthUI();
  });
})();

// === Subida a Supabase Storage + insert en tabla ===
async function uploadToSupabase({ file, title, week }) {
  const sb = sbClient();
  if (!sb) throw new Error('Supabase no inicializado');
  if (!store.isAdmin) throw new Error('Solo el admin puede subir archivos');

  // Nombre único para evitar colisiones
  const objectName = `${Date.now()}_${file.name}`;

  // 1) Subir al bucket
  const { error: upErr } = await sb.storage
    .from(SUPABASE_BUCKET)
    .upload(objectName, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || undefined
    });

  if (upErr) throw upErr;

  // 2) Conseguir URL pública
  const { data: pub } = sb.storage.from(SUPABASE_BUCKET).getPublicUrl(objectName);
  const publicUrl = pub?.publicUrl;
  if (!publicUrl) throw new Error('No se pudo obtener la URL pública');

  // 3) Determinar tipo (image/pdf)
  const type = (file.type || '').startsWith('image/') ? 'image' : 'pdf';

  // 4) Insert en tabla portfolio_items
  const row = {
    title: title || file.name,
    name: objectName,       // importante para poder borrar luego del Storage
    week: +week,
    type,
    url: publicUrl
  };

  const { error: insErr } = await sb.from('portfolio_items').insert(row);
  if (insErr) throw insErr;

  // 5) Refrescar lista local (sin volver a llamar al server)
  store.repoEntries.push(row);

  // Refrescar UI (contadores y grid)
  buildWeeksSidebar();
  if (+store.currentWeek === +week) {
    renderWeekGrid(week);
  }

  return row;
}

// === CRUD: EDITAR ===
async function handleEditItem(item) {
  if (!store.isAdmin) {
    alert('Solo el admin puede editar.');
    return;
  }
  const sb = sbClient();
  if (!sb) {
    alert('Supabase no inicializado');
    return;
  }

  const newTitle = prompt('Nuevo título:', item.title || item.name);
  if (newTitle === null) return; // cancel
  let newWeek = prompt('Nueva semana (1..16):', String(item.week || 1));
  if (newWeek === null) return;
  newWeek = parseInt(newWeek, 10);
  if (!(newWeek >= 1 && newWeek <= 16)) {
    alert('Semana inválida');
    return;
  }

  // Actualiza en la base por "name" (que guardamos como objectName único)
  const { error: updErr } = await sb
    .from('portfolio_items')
    .update({ title: newTitle, week: newWeek })
    .eq('name', item.name);

  if (updErr) {
    alert('No se pudo actualizar: ' + updErr.message);
    return;
  }

  // Actualiza en memoria
  const it = store.repoEntries.find(x => x.name === item.name);
  if (it) {
    it.title = newTitle;
    it.week  = newWeek;
  }

  // Refresca UI: contadores y grid de semana afectada
  buildWeeksSidebar();
  renderWeekGrid(store.currentWeek);
}

// === CRUD: ELIMINAR ===
async function handleDeleteItem(item) {
  if (!store.isAdmin) {
    alert('Solo el admin puede eliminar.');
    return;
  }
  const sb = sbClient();
  if (!sb) {
    alert('Supabase no inicializado');
    return;
  }

  if (!confirm(`¿Eliminar "${item.title || item.name}"? Esta acción no se puede deshacer.`)) {
    return;
  }

  // 1) Borrar del Storage (usa el objectName = item.name)
  const { error: delStorageErr } = await sb.storage
    .from(SUPABASE_BUCKET)
    .remove([item.name]);

  if (delStorageErr) {
    alert('No se pudo borrar del Storage: ' + delStorageErr.message);
    return;
  }

  // 2) Borrar de la tabla
  const { error: delRowErr } = await sb
    .from('portfolio_items')
    .delete()
    .eq('name', item.name);

  if (delRowErr) {
    alert('No se pudo borrar de la tabla: ' + delRowErr.message);
    return;
  }

  // 3) Remover del arreglo local y refrescar UI
  store.repoEntries = store.repoEntries.filter(x => x.name !== item.name);
  buildWeeksSidebar();
  renderWeekGrid(store.currentWeek);
}

// === Manejador del form de subida (usa Supabase Storage) ===
async function handleUploadSubmit(e) {
  e.preventDefault();
  try {
    if (!store.isAdmin) {
      alert('Debes iniciar sesión como admin@upla.edu para subir.');
      return;
    }
    const title = $('#title-input')?.value.trim();
    const week  = $('#week-select')?.value;
    const file  = $('#file-input')?.files?.[0];

    if (!title || !week || !file) {
      alert('Completa título, semana y archivo.');
      return;
    }

    await uploadToSupabase({ file, title, week });

    // Reset del form
    e.target.reset();
    $('#week-select').value = '';

    alert('Archivo subido y publicado ✔');

  } catch (err) {
    console.error(err);
    alert('Error al subir: ' + (err?.message || err));
  }
}

// === Re-render rápido de grid según semana actual ===
function refreshCurrentWeek() {
  buildWeeksSidebar();
  renderWeekGrid(store.currentWeek || 1);
}

/* ====== Fin PARTE 2/3 ====== */
/* ============================
   script.js — PARTE 3/3
   Boot (DOMContentLoaded), login/logout, wiring UI
   ============================ */

// Mejora UI según sesión + refresco de grid para mostrar/ocultar acciones admin
function updateAuthUI() {
  const isAdmin = !!store.isAdmin;
  const btnLogin  = document.getElementById('btn-login');
  const btnLogout = document.getElementById('btn-logout');
  const adminTools = document.getElementById('admin-tools');

  if (btnLogin)  btnLogin.classList.toggle('hidden', isAdmin);
  if (btnLogout) btnLogout.classList.toggle('hidden', !isAdmin);
  if (adminTools) adminTools.classList.toggle('hidden', !isAdmin);

  // re-render del grid actual para que aparezcan/desaparezcan botones Editar/Eliminar
  if (store.currentWeek) {
    renderWeekGrid(store.currentWeek);
  }
}

// Mostrar/ocultar la 2da sidebar (semanas) solo en Portafolio
function toggleSecondSidebar(show) {
  const sb2 = document.getElementById('sidebar-weeks');
  const main = document.getElementById('app-main');
  if (!sb2 || !main) return;
  sb2.classList.toggle('show', !!show);
  sb2.style.display = show ? 'flex' : 'none';
  main.classList.toggle('with-sidebar-2', !!show);
}

// Cambiar de vista (portfolio/profile)
function showView(name) {
  const vPortfolio = document.getElementById('view-portfolio');
  const vProfile   = document.getElementById('view-profile');
  if (vPortfolio) vPortfolio.classList.toggle('hidden', name !== 'portfolio');
  if (vProfile)   vProfile.classList.toggle('hidden',   name !== 'profile');

  // nav activo
  document.querySelectorAll('button[data-nav]').forEach(b => {
    const active = b.dataset.nav === name;
    b.classList.toggle('active', active);
    if (active) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });

  // solo mostrar la barra de semanas en Portafolio
  toggleSecondSidebar(name === 'portfolio');

  // si entras a Portafolio, asegúrate de tener una semana seleccionada
  if (name === 'portfolio') {
    openWeek(store.currentWeek || 1);
  }
}

// Cerrar modal utilitario
function wireModalClose(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => { modal.style.display = 'none'; });
  });
  modal.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-backdrop')) {
      modal.style.display = 'none';
    }
  });
}

// === DOMContentLoaded: boot de la app ===
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // 1) preparar select de semana (form admin)
    ensureWeekOptions(document.getElementById('week-select'));

    // 2) traer sesión actual y ajustar UI
    await applySessionFromSupabase();

    // 3) traer datos publicados (tabla portfolio_items) y render inicial
    await fetchAllEntries();          // <- definida en Parte 1
    buildWeeksSidebar();              // <- definida en Parte 1
    store.currentWeek = 1;
    renderWeekGrid(store.currentWeek);

    // 4) vista por defecto
    showView('portfolio');

    // 5) nav lateral
    document.querySelectorAll('button[data-nav]').forEach(b => {
      b.addEventListener('click', () => showView(b.dataset.nav));
    });

    // 6) login/logout
    const btnLogin  = document.getElementById('btn-login');
    const btnLogout = document.getElementById('btn-logout');
    const modalLogin = document.getElementById('modal-login');
    const formLogin  = document.getElementById('login-form');

    if (btnLogin && modalLogin) {
      btnLogin.addEventListener('click', () => {
        modalLogin.style.display = 'flex';
      });
    }

    if (btnLogout) {
      btnLogout.addEventListener('click', async () => {
        const sb = sbClient();
        if (sb) await sb.auth.signOut();
        store.isAdmin = false;
        updateAuthUI();
      });
    }

    // submit del login (Supabase Auth)
    if (formLogin) {
      formLogin.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = (document.getElementById('login-user')?.value || '').trim();
        const pass  = (document.getElementById('login-pass')?.value || '').trim();
        if (!email || !pass) { alert('Completa email y contraseña'); return; }

        try {
          const sb = sbClient();
          if (!sb) throw new Error('Supabase no disponible');
          const { error } = await sb.auth.signInWithPassword({ email, password: pass });
          if (error) throw error;

          // solo admin@upla.edu obtiene privilegios de admin
          const { data } = await sb.auth.getUser();
          store.isAdmin = !!data?.user && data.user.email?.toLowerCase() === 'admin@upla.edu';
          updateAuthUI();

          // cerrar modal
          const m = document.getElementById('modal-login');
          if (m) m.style.display = 'none';

        } catch (err) {
          alert('No se pudo iniciar sesión: ' + (err?.message || err));
        }
      });
    }

    // 7) cierre de modales (login / preview)
    wireModalClose('modal-login');
    wireModalClose('modal-preview');

    // 8) form de subida (usa Supabase Storage)
    const uploadForm = document.getElementById('upload-form');
    if (uploadForm) {
      uploadForm.addEventListener('submit', handleUploadSubmit); // <- definida en Parte 2
    }

    // 9) botón "Elegir carpeta" (si quieres seguir usando FS local, opcional)
    const btnPick = document.getElementById('btn-pick-folder');
    if (btnPick) btnPick.addEventListener('click', pickFolder); // no obligatorio si solo usas Supabase

  } catch (err) {
    console.error(err);
    alert('Error al iniciar la app: ' + (err?.message || err));
  }
});

/* ====== Fin PARTE 3/3 ====== */




