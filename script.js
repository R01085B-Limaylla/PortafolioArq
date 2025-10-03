// =====================
//  Portafolio – script.js (Supabase + UI)
//  Reemplaza COMPLETO tu script.js con este archivo
// =====================
// Reutiliza el cliente creado en index.html
const SB = window.supabase; // alias corto

if (!SB) {
  console.error('Supabase no está disponible. Revisa el orden de los <script>.');
}

// ======= CONFIGURA SUPABASE AQUÍ =======
const SUPABASE_URL = 'https://oqrmtfxvhtmjyoekssgu.supabase.co';   // <-- cambia
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xcm10Znh2aHRtanlvZWtzc2d1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxMjA3NjYsImV4cCI6MjA3NDY5Njc2Nn0.mdjAo_SdGt4KfnEuyXT8KVaJDA6iDVNbHLYmt22e-b0';                   // <-- cambia

// Cliente Supabase (usa <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script> en index.html)
const sb = window.supabase?.createClient?.(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===== Estado =====
const store = {
  entries: [],        // (local, ya no se usa para render si usas Supabase)
  repoEntries: [],    // elementos publicados (de Supabase)
  isAdmin: false,     // se activa si hay sesión de Supabase
  dirHandle: null,    // opcional, si sigues usando carpeta local
  currentWeek: 1
};
const dbEntriesKey='entries'; const keyDirHandle='dirHandle'; const dbFileKey=id=>`file:${id}`;

// ===== Utils =====
const $=(s,el=document)=>el.querySelector(s); const $$=(s,el=document)=>[...el.querySelectorAll(s)];
const fmtBytes=b=>b<1024?b+' B':b<1024**2?(b/1024).toFixed(1)+' KB':b<1024**3?(b/1024**2).toFixed(1)+' MB':(b/1024**3).toFixed(1)+' GB';
const openModal=el=>el.style.display='flex'; const closeModal=el=>el.style.display='none';

function updateAuthUI(){
  $('#btn-login')?.classList.toggle('hidden',store.isAdmin);
  $('#btn-logout')?.classList.toggle('hidden',!store.isAdmin);
  $('#admin-tools')?.classList.toggle('hidden',!store.isAdmin);
}

// IndexedDB helpers (por compatibilidad con tu código previo)
async function persistEntries(){ if (window.idbKeyval) await idbKeyval.set(dbEntriesKey, store.entries); }
async function loadEntries(){ store.entries = (window.idbKeyval ? (await idbKeyval.get(dbEntriesKey)) || [] : []); }
async function saveDirHandle(handle){ try{ if(window.idbKeyval) await idbKeyval.set(keyDirHandle, handle);}catch(e){} }
async function loadDirHandle(){ try{ store.dirHandle = (window.idbKeyval ? (await idbKeyval.get(keyDirHandle)) : null) || null;}catch(e){} }

function ensureWeekOptions(sel){
  if (!sel) return;
  sel.innerHTML='<option value="" disabled selected>Semana…</option>'
    + Array.from({length:16},(_,i)=>`<option value="${i+1}">Semana ${i+1}</option>`).join('');
}

function showView(name){
  $('#view-portfolio')?.classList.toggle('hidden', name !== 'portfolio');
  $('#view-profile')?.classList.toggle('hidden', name !== 'profile');
  // marcar nav activo
  $$('button[data-nav]').forEach(b=>{
    b.classList.toggle('active', b.dataset.nav === name);
    if (b.dataset.nav === name) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current');
  });
  // mostrar barra semanas solo en Portafolio
  toggleSecondSidebar(name === 'portfolio');
  // abrir semana actual
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

// ===== Thumbnails (PDF.js) =====
async function renderPdfThumb(url, imgEl){
  try{
    const pdf=await pdfjsLib.getDocument({url}).promise;
    const page=await pdf.getPage(1);
    const vp=page.getViewport({scale:1.0});
    const scale=Math.min(640/vp.width,1.5);
    const v=page.getViewport({scale});
    const c=document.createElement('canvas');
    c.width=v.width; c.height=v.height;
    await page.render({canvasContext:c.getContext('2d',{alpha:false}), viewport:v}).promise;
    imgEl.src=c.toDataURL('image/png');
    imgEl.classList.remove('hidden');
  }catch(e){
    // usa icono PDF si falla
  }
}

// ===== Cards (grid central) =====
function createCard(item){
  const tpl=$('#card-template'); const node=tpl.content.firstElementChild.cloneNode(true);
  const img=$('[data-role=thumb]',node); const pdfCover=$('[data-role=pdfcover]',node);
  const title=$('[data-role=title]',node); const meta=$('[data-role=meta]',node);
  const btnPrev=$('[data-action=preview]',node); const aDownload=$('[data-role=download]',node);

  title.textContent=item.title||item.name;
  meta.textContent=`${item.type?.toUpperCase?.()||'FILE'} · Semana ${item.week}`;
  aDownload.href=item.url; aDownload.download=item.name||'archivo';

  if(item.type==='image'){ img.src=item.url; img.onload=()=>img.classList.remove('hidden'); }
  else { renderPdfThumb(item.url,img).then(()=>{ if(!img.src) pdfCover.classList.remove('hidden'); }); }

  btnPrev.onclick=()=>{ const cont=$('#preview-container'); cont.innerHTML='';
    if(item.type==='image'){
      const im=new Image(); im.src=item.url; im.className='w-full h-full object-contain bg-black'; cont.appendChild(im);
    }else{
      const ifr=document.createElement('iframe'); ifr.src=item.url; ifr.className='w-full h-full'; cont.appendChild(ifr);
    }
    openModal($('#modal-preview'));
  };

  return node;
}

// ===== Sidebar Semanas =====
function buildWeeksSidebar(){
  const nav = $('#weeks-nav'); if (!nav) return;
  nav.innerHTML = '';
  for (let w=1; w<=16; w++){
    const count = store.repoEntries.filter(e=>+e.week===w).length;
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
    if (w === (store.currentWeek||1)) btn.classList.add('active');
    nav.appendChild(btn);
  }
}

// ===== Grid del centro (Dashboard) =====
function renderWeekGrid(week){
  const grid = $('#files-grid'); if (!grid) return;
  grid.innerHTML='';
  const items = store.repoEntries.filter(e=>+e.week===+week);
  if (!items.length){
    const empty=document.createElement('div'); empty.className='empty'; empty.textContent='No hay archivos en esta semana.'; grid.appendChild(empty); return;
  }
  items.forEach(it=>grid.appendChild(createCard(it)));
}

// Abre semana (solo centro)
function openWeek(w){
  store.currentWeek = w;
  renderWeekGrid(w);   // solo Dashboard (no mostramos lista en la barra 2)
}

// ===== SUPABASE: leer listado (público) =====
async function loadRepoFromSupabase(){
  if (!sb) { console.warn('Supabase no inicializado.'); return; }
  store.repoEntries = [];
  for (let w=1; w<=16; w++){
    const folder = `semana${w}`;  // ajusta si usas otra convención
    const { data: list, error } = await sb.storage.from('uploads').list(folder, { limit: 100 });
    if (error) { console.warn('LIST error', folder, error.message); continue; }
    if (!list) continue;

    for (const obj of list){
      const path = `${folder}/${obj.name}`;
      const { data: pub } = sb.storage.from('uploads').getPublicUrl(path);
      const lower = obj.name.toLowerCase();
      const type = (/\.(png|jpg|jpeg|gif|webp)$/i.test(lower)) ? 'image' : 'pdf';
      store.repoEntries.push({
        title: obj.name,
        name: obj.name,
        week: w,
        type,
        url: pub.publicUrl
      });
    }
  }
}

// ===== SUPABASE AUTH helpers =====
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
// Refrescar UI al cambiar sesión
if (sb?.auth) {
  SB.auth.onAuthStateChange((_event, session) => {
  const isLogged = !!session;
  store.isAdmin = isLogged;
  updateAuthUI();
});

// ===== SUBIR a Supabase (reemplaza admin local) =====
async function addEntry({ title, week, file }){
  // Requiere estar logueado
  const { data: sessionData } = await sb.auth.getSession();
  if (!sessionData?.session) {
    alert('Debes iniciar sesión para subir.');
    return;
  }

  const safeName = file.name.replace(/\s+/g,'_');
  const path = `semana${week}/${Date.now()}_${safeName}`;

  const { data: up, error: upErr } = await sb.storage
    .from('uploads')
    .upload(path, file, { upsert: true, contentType: file.type, cacheControl: '3600' });

  if (upErr) {
    alert('Error subiendo a Supabase: ' + upErr.message);
    return;
  }

  // URL pública
  const { data: pub } = sb.storage.from('uploads').getPublicUrl(path);
  const type = file.type.startsWith('image/') ? 'image' : 'pdf';

  // Inserta en el arreglo y refresca UI
  const meta = {
    title: title || file.name,
    name: up?.path?.split('/').pop() || file.name,
    week: +week,
    type,
    url: pub.publicUrl
  };
  store.repoEntries.push(meta);

  // refresca conteos y listas en la barra y el centro
  buildWeeksSidebar();
  if (store.currentWeek === meta.week) {
    renderWeekGrid(store.currentWeek);
  }

  alert('Archivo subido a Supabase 👍');
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', async ()=>{
  ensureWeekOptions(document.getElementById('week-select'));

  await loadEntries();          // opcional (legacy)
  await loadDirHandle();        // opcional (legacy)
  if (sb) await loadRepoFromSupabase();  // carga desde Supabase
  buildWeeksSidebar();
  openWeek(1);

  // Intenta obtener sesión actual de Supabase para activar admin-tools
  if (sb?.auth) {
    const { data: { session } } = await sb.auth.getSession();
    store.isAdmin = !!session;
  }
  updateAuthUI();

  // Nav
  $$('button[data-nav]').forEach(b=>b.onclick=()=>showView(b.dataset.nav));
  showView('portfolio');

  // Login (abre modal)
  $('#btn-login')?.addEventListener('click', ()=>openModal($('#modal-login')));

  // Logout via Supabase
  $('#btn-logout')?.addEventListener('click', async ()=>{
    await sbSignOut();
    store.isAdmin=false;
    updateAuthUI();
  });

  // Login form -> Supabase
  const loginForm = $('#login-form');
  if (loginForm) {
    loginForm.onsubmit = async (e) => {
      e.preventDefault();
      const email = $('#login-user').value.trim();
      const pass  = $('#login-pass').value.trim();
      try {
        await sbSignIn(email, pass);
        closeModal($('#modal-login'));
      } catch (err) {
        alert('No se pudo iniciar sesión: ' + err.message);
      }
    };
  }

  // Upload form -> Supabase
  const uploadForm = $('#upload-form');
  if (uploadForm) {
    uploadForm.onsubmit = async (e)=>{
      e.preventDefault();
      const title=$('#title-input').value.trim();
      const week=$('#week-select').value;
      const file=$('#file-input').files[0];
      if(!title||!week||!file) return alert('Completa título, semana y archivo.');
      await addEntry({title,week,file});
      e.target.reset(); $('#week-select').value='';
    };
  }

document.getElementById('login-form').onsubmit = async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-user').value.trim();
  const pass  = document.getElementById('login-pass').value.trim();
  try {
    await sbSignIn(email, pass);
    closeModal(document.getElementById('modal-login'));
  } catch (err) {
    alert('No se pudo iniciar sesión: ' + err.message);
  }
};

document.getElementById('btn-logout').onclick = sbSignOut;
  
  
  // Folder picker (legacy local) — puedes dejarlo sin uso si migraste 100% a Supabase
  $('#btn-pick-folder')?.addEventListener('click', ()=>{
    alert('Con Supabase ya no necesitas carpeta local. Este botón es opcional.');
  });

  // Close modals
  $$('#modal-login [data-close], #modal-preview [data-close]').forEach(b=>b.onclick=(ev)=>closeModal(ev.target.closest('.modal-backdrop')));
  $$('#modal-login, #modal-preview').forEach(m=>m.onclick=(e)=>{ if(e.target.classList.contains('modal-backdrop')) closeModal(e.target); });
});

