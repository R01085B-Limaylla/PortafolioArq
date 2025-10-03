/************************************
 *  Portfolio – script.js (completo)
 *  - Supabase Storage (bucket: uploads)
 *  - Auth (solo admin@upla.edu puede editar)
 *  - Sidebar semanas
 *  - Grid con overlay de acciones
 ************************************/

/* ====== CONFIG SUPABASE ====== */
/* REQUIERE que en index.html hayas creado el cliente con:
   <script type="module">
     import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
     window.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
   </script>
*/
if (!window.supabase) {
  console.warn('Supabase client no encontrado. Asegúrate de crearlo en index.html.');
}

const BUCKET = 'uploads'; // nombre del bucket en Storage

/* ====== ESTADO ====== */
const store = {
  repoEntries: [],       // {name, title, week, type, url}
  isAdmin: false,
  currentWeek: 1
};

/* ====== UTILS ====== */
const $  = (s, el=document)=> el.querySelector(s);
const $$ = (s, el=document)=> [...el.querySelectorAll(s)];

const openModal  = el => el && (el.style.display='flex');
const closeModal = el => el && (el.style.display='none');

function ensureWeekOptions(sel) {
  if (!sel) return;
  sel.innerHTML = '<option value="" disabled selected>Semana…</option>' +
    Array.from({length:16}, (_,i)=>`<option value="${i+1}">Semana ${i+1}</option>`).join('');
}

/* ====== NAV ENTRE VISTAS ====== */
window.showView = function(name){
  const vp = $('#view-portfolio');
  const vf = $('#view-profile');

  if (vp && vf) {
    vp.classList.toggle('hidden', name !== 'portfolio');
    vf.classList.toggle('hidden', name !== 'profile');
  }

  // marcar activo en el menú lateral
  $$('button[data-nav]').forEach(b=>{
    const active = b.dataset.nav === name;
    b.classList.toggle('active', active);
    if (active) b.setAttribute('aria-current','page');
    else b.removeAttribute('aria-current');
  });

  // barra semanas solo en Portafolio
  toggleSecondSidebar(name === 'portfolio');

  // abrir semana al entrar a Portafolio
  if (name === 'portfolio') openWeek(store.currentWeek || 1);
};

function toggleSecondSidebar(show) {
  const sb2  = $('#sidebar-weeks');
  const main = $('#app-main');
  if (!sb2 || !main) return;
  sb2.classList.toggle('show', !!show);
  sb2.style.display = show ? 'flex' : 'none';
  main.classList.toggle('with-sidebar-2', !!show);
}

/* ====== CARGA LISTADO DESDE SUPABASE STORAGE ====== */
async function loadRepoManifest(){
  if (!supabase) return;
  try{
    const { data, error } = await supabase.storage.from(BUCKET).list('', { limit: 1000, sortBy: { column: 'name', order: 'asc' }});
    if (error) throw error;

    // mapear a nuestros objetos (sin metadata—por ahora semana=1)
    store.repoEntries = (data || []).map(it=>{
      const ext = (it.name.split('.').pop() || '').toLowerCase();
      const isImage = ['jpg','jpeg','png','gif','webp','bmp','svg'].includes(ext);
      return {
        name: it.name,
        title: it.name,           // si tienes una BD, aquí pondrías el título real
        week: 1,                  // idem: si guardas semana en BD, úsala aquí
        type: isImage ? 'image' : 'pdf',
        url: getPublicUrl(it.name)
      };
    });

  }catch(e){
    console.error('Error al listar Storage:', e.message);
  }
}

function getPublicUrl(path){
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data?.publicUrl || '';
}

/* ====== MINIATURAS PDF ====== */
async function renderPdfThumb(url, imgEl){
  try{
    const pdf = await pdfjsLib.getDocument({ url }).promise;
    const page = await pdf.getPage(1);
    const vp   = page.getViewport({ scale: 1.0 });
    const scale = Math.min(640/vp.width, 1.5);
    const v = page.getViewport({ scale });

    const c = document.createElement('canvas');
    c.width = v.width; c.height = v.height;

    await page.render({ canvasContext: c.getContext('2d', {alpha:false}), viewport: v }).promise;

    imgEl.src = c.toDataURL('image/png');
    imgEl.classList.remove('hidden');
  }catch(_){
    // deja icono 📄
  }
}

/* ====== CARDS (con overlay y admin actions) ====== */
function createCard(item){
  const tpl  = $('#card-template');
  const node = tpl.content.firstElementChild.cloneNode(true);

  const thumbWrap = node.querySelector('.aspect-video');
  const img       = node.querySelector('[data-role=thumb]');
  const pdfCover  = node.querySelector('[data-role=pdfcover]');
  const title     = node.querySelector('[data-role=title]');
  const meta      = node.querySelector('[data-role=meta]');
  const aDownload = node.querySelector('[data-role=download]');

  // Título + meta
  title.textContent = item.title || item.name;
  meta.textContent  = `${item.type.toUpperCase()} · Semana ${item.week}`;

  // Descarga
  aDownload.href     = item.url;
  aDownload.download = item.name;

  // Miniatura
  if (item.type === 'image') {
    img.src = item.url;
    img.onload = ()=> img.classList.remove('hidden');
  } else {
    renderPdfThumb(item.url, img).then(()=>{
      if (!img.src) pdfCover.classList.remove('hidden');
    });
  }

  // Botón "Ver" antiguo lo ocultamos (usaremos overlay)
  const oldPrev = node.querySelector('[data-action=preview]');
  if (oldPrev) oldPrev.style.display = 'none';

  // === Overlay con iconos (Ver, Descargar) ===
  const overlay = document.createElement('div');
  overlay.className = 'thumb-overlay';

  // Ver
  const verBtn = document.createElement('button');
  verBtn.className = 'icon-btn';
  verBtn.title = 'Ver';
  verBtn.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Z" stroke="currentColor" stroke-width="2"/>
      <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/>
    </svg>`;
  verBtn.onclick = ()=>{
    const cont = $('#preview-container'); cont.innerHTML = '';
    if (item.type==='image'){
      const im = new Image(); im.src = item.url; im.className = 'w-full h-full object-contain bg-black';
      cont.appendChild(im);
    } else {
      const ifr = document.createElement('iframe'); ifr.src = item.url; ifr.className = 'w-full h-full';
      cont.appendChild(ifr);
    }
    openModal($('#modal-preview'));
  };

  // Descargar
  const dlBtn = document.createElement('a');
  dlBtn.className = 'icon-btn';
  dlBtn.href = item.url;
  dlBtn.download = item.name;
  dlBtn.title = 'Descargar';
  dlBtn.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M12 3v12M7 10l5 5 5-5M4 21h16" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;

  overlay.appendChild(verBtn);
  overlay.appendChild(dlBtn);
  thumbWrap.appendChild(overlay);

  // === Acciones Admin (abajo, verde/rojo) ===
  if (store.isAdmin) {
    const actions = document.createElement('div');
    actions.className = 'admin-actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'btn btn-success text-xs';
    editBtn.textContent = 'Editar';
    editBtn.onclick = ()=> editEntry(item);

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn btn-danger text-xs';
    delBtn.textContent = 'Eliminar';
    delBtn.onclick = ()=> deleteEntry(item);

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    const metaRow = node.querySelector('.mt-3');
    metaRow.appendChild(actions);
  }

  return node;
}

/* ====== CRUD (solo Admin) ====== */
async function editEntry(item){
  const nuevoTitulo = prompt('Nuevo título:', item.title || item.name);
  if (nuevoTitulo === null) return;

  let nuevaSemana = prompt('Nueva semana (1-16):', String(item.week || 1));
  if (nuevaSemana === null) return;
  nuevaSemana = parseInt(nuevaSemana, 10);
  if (!(nuevaSemana >=1 && nuevaSemana <=16)) return alert('Semana inválida (1-16).');

  // En memoria
  const ref = store.repoEntries.find(x => x.name === item.name);
  if (ref) {
    ref.title = (nuevoTitulo.trim() || ref.title);
    ref.week  = nuevaSemana;
  }

  buildWeeksSidebar();
  openWeek(store.currentWeek || 1);
  alert('Elemento actualizado (nota: persistencia requiere una BD).');
}

async function deleteEntry(item){
  if (!confirm(`¿Eliminar "${item.title || item.name}"?`)) return;
  try{
    const { error } = await supabase.storage.from(BUCKET).remove([ item.name ]);
    if (error) throw error;

    store.repoEntries = store.repoEntries.filter(x => x.name !== item.name);
    buildWeeksSidebar();
    openWeek(store.currentWeek || 1);
    alert('Eliminado correctamente.');
  }catch(e){
    alert('No se pudo eliminar: ' + e.message);
  }
}

/* ====== SIDEBAR DE SEMANAS ====== */
function buildWeeksSidebar(){
  const nav = $('#weeks-nav'); if (!nav) return;
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
    btn.addEventListener('click', ()=>{
      $$('#weeks-nav .wk').forEach(b => b.classList.toggle('active', b===btn));
      openWeek(w);
    });
    if (w === (store.currentWeek || 1)) btn.classList.add('active');
    nav.appendChild(btn);
  }
}

/* ====== GRID CENTRAL ====== */
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

/* ====== AUTH ====== */
function updateAuthUI(){
  $('#btn-login') ?.classList.toggle('hidden', store.isAdmin);
  $('#btn-logout')?.classList.toggle('hidden', !store.isAdmin);
  $('#admin-tools')?.classList.toggle('hidden', !store.isAdmin);

  // Re-render para mostrar/ocultar acciones Admin
  openWeek(store.currentWeek || 1);
}

if (supabase && supabase.auth){
  supabase.auth.onAuthStateChange((_event, session)=>{
    const email = session?.user?.email || null;
    store.isAdmin = !!email && email.toLowerCase() === 'admin@upla.edu';
    updateAuthUI();
  });
}

/* ====== UPLOAD (solo admin) ====== */
async function handleUpload(e){
  e.preventDefault();
  const title = $('#title-input').value.trim();
  const week  = parseInt($('#week-select').value, 10);
  const file  = $('#file-input').files[0];

  if (!title || !week || !file) return alert('Completa título, semana y archivo.');

  try{
    // sube/actualiza en Storage
    const { error } = await supabase.storage.from(BUCKET).upload(file.name, file, { upsert: true });
    if (error) throw error;

    // agrega a la lista en memoria con los datos correctos
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const isImage = ['jpg','jpeg','png','gif','webp','bmp','svg'].includes(ext);

    const item = {
      name: file.name,
      title: title,         // << usa el título escrito por el usuario
      week: week,           // << respeta la semana elegida
      type: isImage ? 'image' : 'pdf',
      url: getPublicUrl(file.name)
    };

    // reemplazar si ya existía
    const i = store.repoEntries.findIndex(x => x.name === item.name);
    if (i >= 0) store.repoEntries[i] = item;
    else store.repoEntries.push(item);

    buildWeeksSidebar();
    openWeek(week);
    e.target.reset();
    $('#week-select').value = '';
    alert('Archivo subido correctamente.');
  }catch(err){
    alert('Error al subir: ' + err.message);
  }
}

/* ====== INIT ====== */
document.addEventListener('DOMContentLoaded', async ()=>{
  ensureWeekOptions($('#week-select'));

  // nav
  $$('button[data-nav]').forEach(b => b.onclick = ()=> showView(b.dataset.nav));
  showView('portfolio');

  // login modal
  $('#btn-login')?.addEventListener('click', ()=> openModal($('#modal-login')));
  $('#btn-logout')?.addEventListener('click', async ()=>{
    await supabase.auth.signOut();
    updateAuthUI();
  });
  $('#login-form')?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const email = $('#login-user').value.trim();
    const pass  = $('#login-pass').value.trim();
    try{
      await supabase.auth.signInWithPassword({ email, password: pass });
      closeModal($('#modal-login'));
    }catch(err){ alert('No se pudo iniciar sesión: ' + err.message); }
  });

  // cerrar modales
  $$('#modal-login [data-close], #modal-preview [data-close]').forEach(b =>
    b.onclick = ev => closeModal(ev.target.closest('.modal-backdrop'))
  );
  $$('#modal-login, #modal-preview').forEach(m =>
    m.onclick = e => { if (e.target.classList.contains('modal-backdrop')) closeModal(e.target); }
  );

  // subir (admin tools)
  $('#upload-form')?.addEventListener('submit', handleUpload);

  // cargar listados y render
  await loadRepoManifest();
  buildWeeksSidebar();
  openWeek(1);
  updateAuthUI();
});

