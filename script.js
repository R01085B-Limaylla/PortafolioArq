// ===== Estado =====
const store = {
  isAdmin: false,
  currentWeek: 1,
  repoEntries: [] // archivos de la semana actual (se cargan desde Supabase Storage)
};

// ===== Utils =====
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const openModal = (el) => el && (el.style.display = 'flex');
const closeModal = (el) => el && (el.style.display = 'none');

// ===== UI =====
function updateAuthUI() {
  const isAdmin = !!store.isAdmin;
  $('#btn-login')?.classList.toggle('hidden', isAdmin);
  $('#btn-logout')?.classList.toggle('hidden', !isAdmin);
  $('#admin-tools')?.classList.toggle('hidden', !isAdmin);

  // Re-render para que aparezcan/desaparezcan los botones de editar/eliminar
  if (store.currentWeek) {
    renderWeekGrid(store.currentWeek);
  }
}

function toggleSecondSidebar(show) {
  const sb2 = $('#sidebar-weeks');
  const main = $('#app-main');
  if (!sb2 || !main) return;
  sb2.classList.toggle('show', !!show);
  sb2.style.display = show ? 'flex' : 'none';
  main.classList.toggle('with-sidebar-2', !!show);
}

function showView(name) {
  $('#view-portfolio')?.classList.toggle('hidden', name !== 'portfolio');
  $('#view-profile')?.classList.toggle('hidden', name !== 'profile');

  $$('button[data-nav]').forEach(b => {
    b.classList.toggle('active', b.dataset.nav === name);
    if (b.dataset.nav === name) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });

  toggleSecondSidebar(name === 'portfolio');
  if (name === 'portfolio') openWeek(store.currentWeek || 1);
}

// ===== PDF Thumbnails =====
async function renderPdfThumb(url, imgEl) {
  try {
    if (!window.pdfjsLib) return;
    const pdf = await pdfjsLib.getDocument({ url }).promise;
    const page = await pdf.getPage(1);
    const vp = page.getViewport({ scale: 1.0 });
    const scale = Math.min(640 / vp.width, 1.5);
    const v = page.getViewport({ scale });
    const c = document.createElement('canvas');
    c.width = v.width;
    c.height = v.height;
    await page.render({ canvasContext: c.getContext('2d', { alpha: false }), viewport: v }).promise;
    imgEl.src = c.toDataURL('image/png');
    imgEl.classList.remove('hidden');
  } catch (e) {
    // Si falla, dejamos el ícono PDF del template
  }
}

// ===== Supabase Storage: listar y subir =====
async function fetchWeekFiles(week) {
  if (!window.supabase) {
    console.warn('Supabase no inicializado (window.supabase undefined)');
    return [];
  }
  try {
    const { data, error } = await supabase.storage
      .from('uploads')
      .list(`${week}/`, { limit: 100, offset: 0, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw error;

    return (data || []).map(obj => {
      const { data: pub } = supabase.storage.from('uploads').getPublicUrl(`${week}/${obj.name}`);
      const isPdf = obj.name.toLowerCase().endsWith('.pdf');
      return {
        title: obj.name,
        name: obj.name,
        week: +week,
        type: isPdf ? 'pdf' : 'image',
        url: pub.publicUrl,
      };
    });
  } catch (e) {
    console.error('fetchWeekFiles error', e);
    return [];
  }
}

async function addEntry({ title, week, file }) {
  if (!window.supabase) {
    alert("Supabase no está inicializado. Revisa el <script type='module'> en index.html");
    return;
  }
  try {
    const path = `${week}/${file.name}`; // guardamos en carpeta por semana
    const { error: upErr } = await supabase.storage.from('uploads').upload(path, file, { upsert: true });
    if (upErr) throw upErr;

    await openWeek(+week); // refresca listado
    alert('Archivo subido correctamente a Supabase Storage.');
  } catch (err) {
    console.error(err);
    alert('Error al subir: ' + (err.message || err));
  }
}

// ===== CRUD Admin (renombrar / eliminar) =====
async function renameFile(week, oldName, newName) {
  if (!window.supabase) return alert('Supabase no inicializado');
  if (!newName || newName === oldName) return;

  const fromPath = `${week}/${oldName}`;
  const toPath = `${week}/${newName}`;

  try {
    const { error } = await supabase.storage.from('uploads').move(fromPath, toPath);
    if (error) throw error;
    await openWeek(week);
    alert('Archivo renombrado.');
  } catch (e) {
    console.error(e);
    alert('No se pudo renombrar: ' + (e.message || e));
  }
}

async function deleteFile(week, name) {
  if (!window.supabase) return alert('Supabase no inicializado');
  if (!confirm(`¿Eliminar "${name}" de la semana ${week}?`)) return;

  try {
    const { error } = await supabase.storage.from('uploads').remove([`${week}/${name}`]);
    if (error) throw error;
    await openWeek(week);
    alert('Archivo eliminado.');
  } catch (e) {
    console.error(e);
    alert('No se pudo eliminar: ' + (e.message || e));
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
  meta.textContent = `${item.type.toUpperCase()} · Semana ${item.week}`;
  aDownload.href = item.url;
  aDownload.download = item.name;

  if (item.type === 'image') {
    img.src = item.url;
    img.onload = () => img.classList.remove('hidden');
  } else {
    // pdf
    renderPdfThumb(item.url, img).then(() => {
      if (!img.src) pdfCover.classList.remove('hidden');
    });
  }

  btnPrev.onclick = () => {
    const cont = $('#preview-container'); cont.innerHTML = '';
    if (item.type === 'image') {
      const im = new Image(); im.src = item.url; im.className = 'w-full h-full object-contain bg-black';
      cont.appendChild(im);
    } else {
      const ifr = document.createElement('iframe'); ifr.src = item.url; ifr.className = 'w-full h-full';
      cont.appendChild(ifr);
    }
    openModal($('#modal-preview'));
  };

  // Controles admin (editar/eliminar) – solo si es admin
  if (store.isAdmin) {
    const actions = document.createElement('div');
    actions.className = 'flex items-center gap-1';

    const btnEdit = document.createElement('button');
    btnEdit.className = 'btn btn-ghost px-2 py-1 text-xs';
    btnEdit.textContent = 'Renombrar';
    btnEdit.onclick = () => {
      const newName = prompt('Nuevo nombre de archivo (incluye la extensión):', item.name);
      if (!newName) return;
      renameFile(item.week, item.name, newName);
    };

    const btnDel = document.createElement('button');
    btnDel.className = 'btn btn-ghost px-2 py-1 text-xs';
    btnDel.textContent = 'Eliminar';
    btnDel.onclick = () => deleteFile(item.week, item.name);

    // añade junto a los botones existentes
    const actionsWrap = node.querySelector('.flex.items-center.gap-1');
    if (actionsWrap) {
      actionsWrap.appendChild(btnEdit);
      actionsWrap.appendChild(btnDel);
    } else {
      actions.appendChild(btnEdit);
      actions.appendChild(btnDel);
      node.appendChild(actions);
    }
  }

  return node;
}

// ===== Render central =====
function renderWeekGrid(week) {
  const grid = $('#files-grid');
  if (!grid) return;

  grid.innerHTML = '';
  const items = store.repoEntries || [];
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No hay archivos en esta semana.';
    grid.appendChild(empty);
    return;
  }
  items.forEach(it => grid.appendChild(createCard(it)));
}

// ===== Sidebar de semanas =====
function buildWeeksSidebar() {
  const nav = $('#weeks-nav'); if (!nav) return;
  nav.innerHTML = '';
  for (let w = 1; w <= 16; w++) {
    const btn = document.createElement('button');
    btn.className = 'wk';
    btn.dataset.week = String(w);
    btn.innerHTML = `
      <span class="pill">${w}</span>
      <span>Semana ${w}</span>`;
    btn.addEventListener('click', () => openWeek(w));
    if (w === (store.currentWeek || 1)) btn.classList.add('active');
    nav.appendChild(btn);
  }
}

// ===== Abrir semana (carga desde Storage y pinta) =====
async function openWeek(w) {
  store.currentWeek = +w;
  $$('#weeks-nav .wk').forEach(b => b.classList.toggle('active', +b.dataset.week === store.currentWeek));

  store.repoEntries = await fetchWeekFiles(store.currentWeek);
  renderWeekGrid(store.currentWeek);
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', async () => {
  // Inicial UI
  buildWeeksSidebar();
  await openWeek(1);

  // Nav principal
  $$('button[data-nav]').forEach(b => b.onclick = () => showView(b.dataset.nav));
  showView('portfolio');

  // Login local (simple). Si migras a Supabase Auth, reemplaza aquí.
  const modalLogin = $('#modal-login');
  $('#btn-login')?.addEventListener('click', () => openModal(modalLogin));
  $('#btn-logout')?.addEventListener('click', () => {
    store.isAdmin = false;
    localStorage.removeItem('isAdmin');
    updateAuthUI();
  });
  $('#login-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    // Por ahora login simple (sin Supabase Auth)
    store.isAdmin = true;
    localStorage.setItem('isAdmin', '1');
    updateAuthUI();
    closeModal(modalLogin);
  });

  // Cerrar modales
  $$('#modal-login [data-close], #modal-preview [data-close]').forEach(b =>
    b.onclick = (ev) => closeModal(ev.target.closest('.modal-backdrop'))
  );
  $$('#modal-login, #modal-preview').forEach(m =>
    m.onclick = (e) => { if (e.target.classList.contains('modal-backdrop')) closeModal(e.target); }
  );

  // Admin tools: subir archivos a Storage
  const weekSelect = $('#week-select');
  if (weekSelect) {
    weekSelect.innerHTML = '<option value="" disabled selected>Semana…</option>' +
      Array.from({ length: 16 }, (_, i) => `<option value="${i + 1}">Semana ${i + 1}</option>`).join('');
  }

  $('#upload-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!store.isAdmin) return alert('Solo admin puede subir.');
    const title = $('#title-input').value.trim();
    const week = $('#week-select').value;
    const file = $('#file-input').files[0];
    if (!title || !week || !file) return alert('Completa título, semana y archivo.');
    await addEntry({ title, week, file });
    e.target.reset();
    $('#week-select').value = '';
  });

  // Recupera estado admin previo
  store.isAdmin = localStorage.getItem('isAdmin') === '1';
  updateAuthUI();
});




