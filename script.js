/* script.js (ESM) — copia y pega tal cual */

// === Supabase (ESM) ===
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
const SUPABASE_URL = "https://oqrmtfxvhtmjyoekssgu.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xcm10Znh2aHRtanlvZWtzc2d1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxMjA3NjYsImV4cCI6MjA3NDY5Njc2Nn0.mdjAo_SdGt4KfnEuyXT8KVaJDA6iDVNbHLYmt22e-b0";
const SB = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===== Estado =====
const store = { entries: [], repoEntries: [], isAdmin:false, dirHandle:null, currentWeek: 1 };
const dbEntriesKey='entries'; const keyDirHandle='dirHandle'; const dbFileKey=id=>`file:${id}`;

// ===== Utils =====
const $=(s,el=document)=>el.querySelector(s); const $$=(s,el=document)=>[...el.querySelectorAll(s)];
const fmtBytes=b=>b<1024?b+' B':b<1024**2?(b/1024).toFixed(1)+' KB':b<1024**3?(b/1024**2).toFixed(1)+' MB':(b/1024**3).toFixed(1)+' GB';
const openModal=el=>el&&(el.style.display='flex'); const closeModal=el=>el&&(el.style.display='none');

const updateAuthUI=()=>{
  $('#btn-login')?.classList.toggle('hidden',store.isAdmin);
  $('#btn-logout')?.classList.toggle('hidden',!store.isAdmin);
  $('#admin-tools')?.classList.toggle('hidden',!store.isAdmin);
};

async function persistEntries(){ await idbKeyval.set(dbEntriesKey, store.entries); }
async function loadEntries(){ store.entries = (await idbKeyval.get(dbEntriesKey)) || []; }
async function saveDirHandle(handle){ try{ await idbKeyval.set(keyDirHandle, handle);}catch(e){} }
async function loadDirHandle(){ try{ store.dirHandle = await idbKeyval.get(keyDirHandle) || null;}catch(e){} }

function ensureWeekOptions(sel){ if(!sel) return; sel.innerHTML='<option value="" disabled selected>Semana…</option>'+Array.from({length:16},(_,i)=>`<option value="${i+1}">Semana ${i+1}</option>`).join(''); }

function showView(name){
  $('#view-portfolio')?.classList.toggle('hidden', name !== 'portfolio');
  $('#view-profile')?.classList.toggle('hidden', name !== 'profile');

  $$('button[data-nav]').forEach(b=>{
    b.classList.toggle('active', b.dataset.nav === name);
    if (b.dataset.nav === name) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current');
  });

  toggleSecondSidebar(name === 'portfolio');
  if (name === 'portfolio') openWeek(store.currentWeek || 1);
}

function toggleSecondSidebar(show) {
  const sb2 = $('#sidebar-weeks'); const main = $('#app-main');
  if (!sb2 || !main) return;
  sb2.classList.toggle('show', !!show);
  sb2.style.display = show ? 'flex' : 'none';
  main.classList.toggle('with-sidebar-2', !!show);
}

// ===== Manifest remoto (publicados) =====
async function loadRepoManifest(){
  try{
    const r=await fetch('uploads/index.json',{cache:'no-store'});
    if(!r.ok) return;
    const d=await r.json();
    store.repoEntries=(d.items||[]).map(it=>({title:it.title||it.name,name:it.name,week:+it.week,type:it.type,url:it.url}));
  }catch(e){ /* sin manifest */ }
}

// ===== File System Access API (opcional para admin local) =====
async function verifyPermission(handle,mode='readwrite'){ if(!handle) return false; const opts={mode};
  if((await handle.queryPermission(opts))==='granted') return true;
  if((await handle.requestPermission(opts))==='granted') return true;
  return false;
}
async function pickFolder(){
  if(!window.showDirectoryPicker){ alert('Tu navegador no soporta elegir carpeta. Usa Chrome/Edge.'); return; }
  try{
    const dir=await window.showDirectoryPicker({id:'uploads-folder'});
    const ok=await verifyPermission(dir,'readwrite'); if(!ok) return;
    store.dirHandle=dir; await saveDirHandle(dir); $('#folder-status').textContent='Carpeta conectada ✔';
    await ensureManifestFile();
  }catch(e){ console.error(e); }
}
async function ensureManifestFile(){
  if(!store.dirHandle) return;
  const ok=await verifyPermission(store.dirHandle,'readwrite'); if(!ok) return;
  try{ await store.dirHandle.getFileHandle('index.json'); }
  catch{
    const f=await store.dirHandle.getFileHandle('index.json',{create:true});
    const w=await f.createWritable(); await w.write(JSON.stringify({items:[]},null,2)); await w.close();
  }
}
async function readLocalManifest(){
  if(!store.dirHandle) return {items:[]};
  const ok=await verifyPermission(store.dirHandle,'read'); if(!ok) return {items:[]};
  try{ const fh=await store.dirHandle.getFileHandle('index.json'); const f=await fh.getFile(); const txt=await f.text(); return JSON.parse(txt||'{}'); }
  catch(e){ return {items:[]}; }
}
async function writeLocalManifest(manifest){
  if(!store.dirHandle) return;
  const ok=await verifyPermission(store.dirHandle,'readwrite'); if(!ok) return;
  const fh=await store.dirHandle.getFileHandle('index.json',{create:true});
  const w=await fh.createWritable(); await w.write(JSON.stringify(manifest,null,2)); await w.close();
}
async function saveFileToFolder(file, filename){
  if(!store.dirHandle) return;
  const ok=await verifyPermission(store.dirHandle,'readwrite'); if(!ok) return;
  const fh=await store.dirHandle.getFileHandle(filename,{create:true});
  const w=await fh.createWritable(); await w.write(file); await w.close();
}

// ===== Thumbnails =====
async function renderPdfThumb(url, imgEl){
  try{
    const pdf=await pdfjsLib.getDocument({url}).promise; const page=await pdf.getPage(1);
    const vp=page.getViewport({scale:1.0}); const scale=Math.min(640/vp.width,1.5); const v=page.getViewport({scale});
    const c=document.createElement('canvas'); c.width=v.width; c.height=v.height;
    await page.render({canvasContext:c.getContext('2d',{alpha:false}), viewport:v}).promise;
    imgEl.src=c.toDataURL('image/png'); imgEl.classList.remove('hidden');
  }catch(e){ /* deja icono PDF */ }
}

// ===== Cards =====
function createCard(item){
  const tpl=$('#card-template'); const node=tpl.content.firstElementChild.cloneNode(true);
  const img=$('[data-role=thumb]',node); const pdfCover=$('[data-role=pdfcover]',node);
  const title=$('[data-role=title]',node); const meta=$('[data-role=meta]',node);
  const btnPrev=$('[data-action=preview]',node); const aDownload=$('[data-role=download]',node);

  title.textContent=item.title||item.name; meta.textContent=`${item.type.toUpperCase()} · Semana ${item.week}`;
  aDownload.href=item.url; aDownload.download=item.name;

  if(item.type==='image'){ img.src=item.url; img.onload=()=>img.classList.remove('hidden'); }
  else { renderPdfThumb(item.url,img).then(()=>{ if(!img.src) pdfCover.classList.remove('hidden'); }); }

  btnPrev.onclick=()=>{ const cont=$('#preview-container'); cont.innerHTML='';
    if(item.type==='image'){ const im=new Image(); im.src=item.url; im.className='w-full h-full object-contain bg-black'; cont.appendChild(im); }
    else { const ifr=document.createElement('iframe'); ifr.src=item.url; ifr.className='w-full h-full'; cont.appendChild(ifr); }
    openModal($('#modal-preview'));
  };

  return node;
}

// ===== Barra de semanas (solo botones) =====
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
      store.currentWeek = w;
      $$('#weeks-nav .wk').forEach(b => b.classList.toggle('active', b === btn));
      openWeek(w);
    });
    if (w === (store.currentWeek||1)) btn.classList.add('active');
    nav.appendChild(btn);
  }
}

// ===== Grid del centro =====
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
  renderWeekGrid(w); // solo Dashboard (la barra 2 NO lista archivos)
}

// ===== CRUD + Auto actualización de index.json local =====
async function addEntry({ title, week, file }) {
  const id = crypto.randomUUID();
  const type = file.type.startsWith('image/') ? 'image' : 'pdf';
  const meta = { id, title: title || file.name, week:+week, type, name:file.name, size:file.size, createdAt:Date.now() };

  store.entries.push(meta);
  await idbKeyval.set(dbFileKey(id), file);
  await persistEntries();

  if(store.dirHandle){
    await saveFileToFolder(file, meta.name);
    const manifest = await readLocalManifest();
    const idx = (manifest.items||[]).findIndex(x=>x.name===meta.name);
    const item = { title: meta.title, week: meta.week, type: meta.type, name: meta.name, url: `uploads/${meta.name}` };
    if(idx>=0) manifest.items[idx]=item; else (manifest.items||(manifest.items=[])).push(item);
    await writeLocalManifest(manifest);
  }

  // Refresca UI
  await loadRepoManifest();        // recarga publicados si ya subiste a uploads/
  buildWeeksSidebar();
  if (store.currentWeek === meta.week) renderWeekGrid(store.currentWeek);

  alert('Archivo guardado. Si conectaste uploads/, ya se actualizó index.json. Recuerda hacer git add/commit/push.');
}

// ===== SUPABASE AUTH helpers =====
async function sbSignIn(email, password) {
  const { data, error } = await SB.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}
async function sbSignOut() { await SB.auth.signOut(); }

SB.auth.onAuthStateChange((_event, session) => {
  store.isAdmin = !!session;
  updateAuthUI();
});

// ===== Init =====
document.addEventListener('DOMContentLoaded', async ()=>{
  ensureWeekOptions(document.getElementById('week-select'));

  await loadEntries();
  await loadDirHandle();
  await loadRepoManifest();

  buildWeeksSidebar();
  openWeek(1);

  updateAuthUI();
  $$('button[data-nav]').forEach(b=>b.onclick=()=>showView(b.dataset.nav));
  showView('portfolio');

  // Login modal open/close
  document.getElementById('btn-login')?.addEventListener('click', ()=>openModal(document.getElementById('modal-login')));
  document.getElementById('btn-logout')?.addEventListener('click', sbSignOut);

  // Login submit (Supabase)
  const loginForm = document.getElementById('login-form');
  if (loginForm){
    loginForm.onsubmit = async (e) => {
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
  }

  // Upload (solo visible si isAdmin por CSS/UI)
  document.getElementById('upload-form')?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const title=$('#title-input').value.trim();
    const week=$('#week-select').value;
    const file=$('#file-input').files[0];
    if(!title||!week||!file) return alert('Completa título, semana y archivo.');
    await addEntry({title,week,file});
    e.target.reset(); $('#week-select').value='';
  });

  // Folder picker
  document.getElementById('btn-pick-folder')?.addEventListener('click', pickFolder);

  // Close modals by buttons/backdrop
  $$('#modal-login [data-close], #modal-preview [data-close]').forEach(b=>b.onclick=(ev)=>closeModal(ev.target.closest('.modal-backdrop')));
  $$('#modal-login, #modal-preview').forEach(m=>m.onclick=(e)=>{ if(e.target.classList.contains('modal-backdrop')) closeModal(e.target); });
});




