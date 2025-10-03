// =============================
//  Portafolio – script.js (limpio)
//  Supabase + Sidebar semanas + CRUD admin
// =============================

// ---------- Configuración Supabase (usa la que defines en index.html) ----------
const supabase = (window && window.supabase) ? window.supabase : null;

// ---------- Estado global ----------
window.store = {
  repoEntries: [],         // Archivos visibles (semanas)
  isAdmin: false,          // Control de UI admin (auth)
  currentWeek: 1           // Semana seleccionada
};

// ---------- Utils ----------
const $  = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => [...el.querySelectorAll(s)];
const openModal  = el => el && (el.style.display = 'flex');
const closeModal = el => el && (el.style.display = 'none');

function ensureWeekOptions(sel){
  if (!sel) return;
  sel.innerHTML = '<option value="" disabled selected>Semana…</option>' +
    Array.from({length:16},(_,i)=>`<option value="${i+1}">Semana ${i+1}</option>`).join('');
}

function updateAuthUI(){
  const { isAdmin } = store;
  const btnLogin  = $('#btn-login');
  const btnLogout = $('#btn-logout');
  const adminBox  = $('#admin-tools');

  if (btnLogin)  btnLogin.classList.toggle('hidden',  isAdmin);
  if (btnLogout) btnLogout.classList.toggle('hidden', !isAdmin);
  if (adminBox)  adminBox.classList.toggle('hidden', !isAdmin);

  // Mostrar / ocultar acciones admin en cards ya renderizadas
  $$('.card [data-action="edit"], .card [data-action="delete"]').forEach(btn => {
    btn.style.display = isAdmin ? 'inline-flex' : 'none';
  });
}

// ---------- Navegación (Portafolio / Perfil) ----------
window.showView = function(name){
  const vp = $('#view-portfolio');
  const vf = $('#view-profile');
  if (vp && vf) {
    vp.classList.toggle('hidden', name !== 'portfolio');
    vf.classList.toggle('hidden', name !== 'profile');
  }

  // marcar activo en menú lateral (no asigna handlers aquí)
  $$('button[data-nav]').forEach(b => {
    const active = b.dataset.nav === name;
    b.classList.toggle('active', active);
    if (active) b.setAttribute('aria-current', 'page');
    else        b.removeAttribute('aria-current');
  });

  toggleSecondSidebar(name === 'portfolio');

  // Al entrar al portafolio siempre mostramos la semana en curso
  if (name === 'portfolio') openWeek(store.currentWeek || 1);
};

function toggleSecondSidebar(show){
  const sb2 = $('#sidebar-weeks');
  const main = $('#app-main');
  if (!sb2 || !main) return;
  sb2.classList.toggle('show', !!show);
  sb2.style.display = show ? 'flex' : 'none';
  main.classList.toggle('with-sidebar-2', !!show);
}

// ---------- Carga de archivos (Supabase Storage) ----------
// NOTA: Por simplicidad, asignamos week=1 para todos (puedes guardar semana en DB aparte).
async function loadRepoManifest(){
  if (!supabase) return;
  try{
    const { data, error } = await supabase.storage.from('uploads').list('', { limit: 300 });
    if (error) throw error;

    store.repoEntries = (data || []).map(it => {
      const ext  = it.name.split('.').pop().toLowerCase();
      const type = ['jpg','jpeg','png','gif','webp','bmp'].includes(ext) ? 'image' : 'pdf';
      return {
        title: it.name,
        name: it.name,
        week: 1, // TODO: guarda/lee semana real desde DB si la usas
        type,
        url: `${supabase.supabaseUrl || ''}/storage/v1/object/public/uploads/${it.name}`
      };
    });
  }catch(e){
    console.error('Error loadRepoManifest:', e);
  }
}

// ---------- Thumbnails para PDFs ----------
async function renderPdfThumb(url, imgEl){
  try{
    const pdf = await pdfjsLib.getDocument({ url }).promise;
    const page = await pdf.getPage(1);
    const vp   = page.getViewport({ scale: 1.0 });
    const sc   = Math.min(640 / vp.width, 1.5);
    const view = page.getViewport({ scale: sc });
    const c = document.createElement('canvas');
    c.width  = view.width;
    c.height = view.height;
    await page.render({ canvasContext: c.getContext('2d', { alpha:false }), viewport: view }).promise;
    imgEl.src = c.toDataURL('image/png');
    imgEl.classList.remove('hidden');
  }catch{
    // deja el ícono PDF
  }
}

// ---------- Cards ----------
function createCard(item){
  const tpl  = $('#card-template');
  const node = tpl.content.firstElementChild.cloneNode(true);

  const img      = $('[data-role=thumb]', node);
  const pdfCover = $('[data-role=pdfcover]', node);
  const title    = $('[data-role=title]', node);
  const meta     = $('[data-role=meta]', node);
  const btnPrev  = $('[data-action=preview]', node);
  const aDown    = $('[data-role=download]', node);

  title.textContent = item.title || item.name;
  meta.textContent  = `${item.type.toUpperCase()} · Semana ${item.week}`;
  aDown.href        = item.url;
  aDown.download    = item.name;

  if (item.type === 'image'){
    img.src = item.url;
    img.onload = () => img.classList.remove('hidden');
  }else{
    renderPdfThumb(item.url, img).then(() => { if (!img.src) pdfCover.classList.remove('hidden'); });
  }

  btnPrev.onclick = () => {
    const cont = $('#preview-container'); cont.innerHTML = '';
    if (item.type === 'image'){
      const im = new Image();
      im.src = item.url;
      im.className = 'w-full h-full object-contain bg-black';
      cont.appendChild(im);
    }else{
      const ifr = document.createElement('iframe');
      ifr.src = item.url;
      ifr.className = 'w-full h-full';
      cont.appendChild(ifr);
    }
    openModal($('#modal-preview'));
  };

 // Botones Admin (colócalos junto a Ver/Descargar)
if (store.isAdmin) {
  const actionsEl = node.querySelector('.flex.items-center.gap-1'); // contenedor de Ver/Descargar
  if (actionsEl) {
    actionsEl.style.flexWrap = 'wrap'; // por si no cabe en una línea

    const editBtn = document.createElement('button');
    editBtn.textContent = 'Editar';
    editBtn.dataset.action = 'edit';
    editBtn.className = 'btn btn-ghost px-2 py-1 text-xs';
    editBtn.onclick = () => editEntry(item);

    const delBtn = document.createElement('button');
    delBtn.textContent = 'Eliminar';
    delBtn.dataset.action = 'delete';
    delBtn.className = 'btn btn-ghost px-2 py-1 text-xs';
    delBtn.onclick = () => deleteEntry(item);

    actionsEl.appendChild(editBtn);
    actionsEl.appendChild(delBtn);
  }

  // Asegura que el card no derrame contenido
  node.style.overflow = 'hidden';
}


// ---------- CRUD (solo Admin) ----------
async function editEntry(item){
  const nuevoTitulo = prompt('Nuevo título:', item.title || item.name);
  if (nuevoTitulo === null) return;
  let nuevaSemana   = prompt('Nueva semana (1-16):', item.week);
  if (nuevaSemana === null) return;
  nuevaSemana = parseInt(nuevaSemana, 10);
  if (!(nuevaSemana >= 1 && nuevaSemana <= 16)){
    alert('Semana inválida. Debe ser 1 a 16.');
    return;
  }

  // Actualiza en memoria (si usas DB, persiste ahí también)
  const ref = store.repoEntries.find(x => x.name === item.name);
  if (ref){
    ref.title = (nuevoTitulo || ref.title).trim();
    ref.week  = nuevaSemana;
  }

  buildWeeksSidebar();
  openWeek(store.currentWeek || 1);
  alert('Elemento actualizado (nota: para persistir este cambio usa una base de datos).');
}

async function deleteEntry(item){
  if (!confirm(`¿Eliminar "${item.title || item.name}"?`)) return;
  try{
    if (supabase){
      const { error } = await supabase.storage.from('uploads').remove([item.name]);
      if (error) throw error;
    }
    store.repoEntries = store.repoEntries.filter(x => x.name !== item.name);
    buildWeeksSidebar();
    openWeek(store.currentWeek || 1);
    alert('Eliminado correctamente.');
  }catch(e){
    alert('No se pudo eliminar: ' + e.message);
  }
}

// ---------- Lateral de semanas ----------
function buildWeeksSidebar(){
  const nav = $('#weeks-nav');
  if (!nav) return;
  nav.innerHTML = '';
  for (let w=1; w<=16; w++){
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

// ---------- Grid central ----------
function renderWeekGrid(week){
  const grid = $('#files-grid'); if (!grid) return;
  grid.innerHTML = '';
  const items = store.repoEntries.filter(e => +e.week === +week);
  if (!items.length){
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No hay archivos en esta semana.';
    grid.appendChild(empty);
    return;
  }
  items.forEach(it => grid.appendChild(createCard(it)));
}

function openWeek(w){
  store.currentWeek = w;
  renderWeekGrid(w);
}

// ---------- Auth helpers ----------
function attachAuthListener(){
  if (!supabase || !supabase.auth) return;
  supabase.auth.onAuthStateChange((_event, session) => {
    const email = session?.user?.email || null;
    // Permite admin para admin@upla.edu y admin@upla.edu.pe
    store.isAdmin = !!email && /admin@upla\.edu(\.pe)?$/i.test(email);
    updateAuthUI();
    // Re-render para mostrar/ocultar botones admin en las cards
    openWeek(store.currentWeek || 1);
  });
}

// ---------- Handlers DOM Ready ----------
document.addEventListener('DOMContentLoaded', async ()=>{
  // Week select (form admin)
  ensureWeekOptions($('#week-select'));

  // Menú lateral principal
  $$('button[data-nav]').forEach(b => {
    b.addEventListener('click', () => window.showView(b.dataset.nav));
  });

  // Modales: cerrar
  $$('#modal-login [data-close], #modal-preview [data-close]').forEach(b =>
    b.addEventListener('click', ev => closeModal(ev.target.closest('.modal-backdrop')))
  );
  $$('#modal-login, #modal-preview').forEach(m =>
    m.addEventListener('click', e => { if (e.target.classList.contains('modal-backdrop')) closeModal(e.target); })
  );

  // Login / Logout
  const loginBtn   = $('#btn-login');
  const logoutBtn  = $('#btn-logout');
  const loginForm  = $('#login-form');

  if (loginBtn)  loginBtn.addEventListener('click', () => openModal($('#modal-login')));
  if (logoutBtn) logoutBtn.addEventListener('click', async () => { await supabase?.auth?.signOut(); });

  if (loginForm){
    loginForm.addEventListener('submit', async e => {
      e.preventDefault();
      const email = $('#login-user').value.trim();
      const pass  = $('#login-pass').value.trim();
      try{
        const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
        if (error) throw error;
        closeModal($('#modal-login'));
      }catch(err){
        alert('No se pudo iniciar sesión: ' + err.message);
      }
    });
  }

  // Subir (solo admins – el form está oculto para otros por updateAuthUI)
  const uploadForm = $('#upload-form');
  if (uploadForm){
    uploadForm.addEventListener('submit', async e => {
      e.preventDefault();
      const title = $('#title-input').value.trim();
      const week  = +$('#week-select').value;
      const file  = $('#file-input').files[0];
      if (!title || !week || !file) return alert('Completa título, semana y archivo.');

      try{
        const { error } = await supabase.storage.from('uploads').upload(file.name, file, { upsert: true });
        if (error) throw error;

        store.repoEntries.push({
          title,
          week,
          type: file.type.startsWith('image/') ? 'image' : 'pdf',
          name: file.name,
          url: `${supabase.supabaseUrl || ''}/storage/v1/object/public/uploads/${file.name}`
        });

        buildWeeksSidebar();
        openWeek(week);
        uploadForm.reset();
        $('#week-select').value = '';
        alert('Archivo subido correctamente.');
      }catch(err){
        alert('Error subiendo archivo: ' + err.message);
      }
    });
  }

  // Carga inicial
  await loadRepoManifest();
  buildWeeksSidebar();
  showView('portfolio'); // vista inicial
  openWeek(1);

  // Auth listener (al final para refrescar UI tras render inicial)
  attachAuthListener();
  updateAuthUI();
});


