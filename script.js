// ===== Estado =====
const store = { entries: [], repoEntries: [], isAdmin:false, dirHandle:null };
const dbEntriesKey='entries'; const keyDirHandle='dirHandle'; const dbFileKey=id=>`file:${id}`;

// ===== Utils =====
const $=(s,el=document)=>el.querySelector(s); const $$=(s,el=document)=>[...el.querySelectorAll(s)];
const fmtBytes=b=>b<1024?b+' B':b<1024**2?(b/1024).toFixed(1)+' KB':b<1024**3?(b/1024**2).toFixed(1)+' MB':(b/1024**3).toFixed(1)+' GB';
const openModal=el=>el.style.display='flex'; const closeModal=el=>el.style.display='none';

const updateAuthUI=()=>{ $('#btn-login').classList.toggle('hidden',store.isAdmin); $('#btn-logout').classList.toggle('hidden',!store.isAdmin); $('#admin-tools').classList.toggle('hidden',!store.isAdmin); };

async function persistEntries(){ await idbKeyval.set(dbEntriesKey, store.entries); }
async function loadEntries(){ store.entries = (await idbKeyval.get(dbEntriesKey)) || []; }
async function saveDirHandle(handle){ try{ await idbKeyval.set(keyDirHandle, handle);}catch(e){} }
async function loadDirHandle(){ try{ store.dirHandle = await idbKeyval.get(keyDirHandle) || null;}catch(e){} }

function ensureWeekOptions(sel){ sel.innerHTML='<option value="" disabled selected>Semana…</option>'+Array.from({length:16},(_,i)=>`<option value="${i+1}">Semana ${i+1}</option>`).join(''); }

function showView(name){
  $('#view-portfolio').classList.toggle('hidden', name !== 'portfolio');
  $('#view-profile').classList.toggle('hidden', name !== 'profile');
  markActiveNav(name);
  toggleSecondSidebar(name === 'portfolio');
  if (name === 'portfolio') { openWeek(store.currentWeek || 1); }
}

function markActiveNav(name){
  $$('button[data-nav]').forEach(b=>{
    b.classList.toggle('active', b.dataset.nav === name);
    if (b.dataset.nav === name) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current');
  });
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
async function loadRepoManifest(){
  try{ const r=await fetch('uploads/index.json',{cache:'no-store'}); if(!r.ok) return;
    const d=await r.json(); store.repoEntries=(d.items||[]).map(it=>({title:it.title||it.name,name:it.name,week:+it.week,type:it.type,url:it.url}));
  }catch(e){ /* sin manifest */ }
}

// ===== File System Access API =====
async function verifyPermission(handle,mode='readwrite'){ if(!handle) return false; const opts={mode};
  if((await handle.queryPermission(opts))==='granted') return true;
  if((await handle.requestPermission(opts))==='granted') return true;
  return false;
}
async function pickFolder(){
  if(!window.showDirectoryPicker){ alert('Tu navegador no soporta elegir carpeta. Usa Chrome/Edge.'); return; }
  try{ const dir=await window.showDirectoryPicker({id:'uploads-folder'});
    const ok=await verifyPermission(dir,'readwrite'); if(!ok) return;
    store.dirHandle=dir; await saveDirHandle(dir); $('#folder-status').textContent='Carpeta conectada ✔';
    // Garantiza que exista index.json
    await ensureManifestFile();
  }catch(e){ console.error(e); }
}

async function ensureManifestFile(){
  if(!store.dirHandle) return;
  const ok=await verifyPermission(store.dirHandle,'readwrite'); if(!ok) return;
  try{ await store.dirHandle.getFileHandle('index.json'); } // existe
  catch{ // crearlo vacío
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
  try{ const pdf=await pdfjsLib.getDocument({url}).promise; const page=await pdf.getPage(1);
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

// ===== Render =====
function renderAccordion(){
  const acc=$('#weeks-accordion'); acc.innerHTML='';
  for(let w=1; w<=16; w++){
    const sec=document.createElement('section'); sec.className='card p-0';
    const head=document.createElement('button'); head.className='accordion-btn w-full flex items-center justify-between p-4';
    const items=store.repoEntries.filter(e=>+e.week===w);
    head.innerHTML=`<div class="flex items-center gap-3"><span class="tag">Semana ${w}</span><span class="text-sm text-slate-400">${items.length} elementos</span></div><span>▸</span>`;
    const panel=document.createElement('div'); panel.className='accordion-panel px-4 pb-4';
    const list=document.createElement('div'); list.className='grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4';

    if(items.length===0){ const empty=document.createElement('div'); empty.className='text-sm text-slate-400 border border-dashed border-white/10 rounded-xl p-6 text-center'; empty.textContent='Sin elementos aún'; list.appendChild(empty); }
    else { items.forEach(it=>list.appendChild(createCard(it))); }

    panel.appendChild(list);
    head.onclick=()=>{ const open=panel.classList.toggle('open'); head.querySelector('span:last-child').textContent=open?'▾':'▸'; };
    sec.appendChild(head); sec.appendChild(panel); acc.appendChild(sec);
  }
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

  // Guarda copia en IndexedDB (local)
  store.entries.push(meta);
  await idbKeyval.set(dbFileKey(id), file);
  await persistEntries();

  // Si hay carpeta conectada, guarda el archivo físico y actualiza index.json
  if (store.dirHandle) {
    await saveFileToFolder(file, meta.name);

    const manifest = await readLocalManifest();
    const idx = (manifest.items || []).findIndex(x => x.name === meta.name);
    const item = {
      title: meta.title,
      week: meta.week,
      type: meta.type,
      name: meta.name,
      url: `uploads/${meta.name}`
    };
    if (idx >= 0) manifest.items[idx] = item;
    else (manifest.items || (manifest.items = [])).push(item);

    await writeLocalManifest(manifest);
  }

  // 🔄 Refresca UI: contadores y listas de la semana seleccionada
  buildWeeksSidebar();
  if (store.currentWeek === meta.week) {
    renderWeekGrid(store.currentWeek);
    renderFilesSidebar(store.currentWeek);
  }

  alert('Archivo guardado. Si conectaste uploads/, ya se actualizó index.json. Recuerda hacer git add/commit/push.');
}


// ===== Init =====
document.addEventListener('DOMContentLoaded', async ()=>{
  ensureWeekOptions(document.getElementById('week-select'));
  await loadEntries();
await loadDirHandle();
await loadRepoManifest();

// construir barra secundaria (Semana 1..16) y abrir la semana actual (o 1)
buildWeeksSidebar();
openWeek(store.currentWeek || 1);


  store.isAdmin = localStorage.getItem('isAdmin')==='1'; updateAuthUI();
  $$('button[data-nav]').forEach(b=>b.onclick=()=>showView(b.dataset.nav)); showView('portfolio');

  // Login
  document.getElementById('btn-login').onclick=()=>openModal(document.getElementById('modal-login'));
  document.getElementById('btn-logout').onclick=()=>{ store.isAdmin=false; localStorage.removeItem('isAdmin'); updateAuthUI(); };
  document.getElementById('login-form').onsubmit=(e)=>{ e.preventDefault(); const u=$('#login-user').value.trim(); const p=$('#login-pass').value.trim(); if(u==='admin'&&p==='admin123'){store.isAdmin=true; localStorage.setItem('isAdmin','1'); updateAuthUI(); closeModal(document.getElementById('modal-login'));} else alert('Credenciales inválidas'); };

  // Upload
  document.getElementById('upload-form').onsubmit=async(e)=>{ e.preventDefault();
    const title=$('#title-input').value.trim(); const week=$('#week-select').value; const file=$('#file-input').files[0];
    if(!title||!week||!file) return alert('Completa título, semana y archivo.');
    await addEntry({title,week,file});
    e.target.reset(); $('#week-select').value='';
  };

  // Folder picker
  document.getElementById('btn-pick-folder').onclick=pickFolder;

  // Close modals
  $$('#modal-login [data-close], #modal-preview [data-close]').forEach(b=>b.onclick=(ev)=>closeModal(ev.target.closest('.modal-backdrop')));
  $$('#modal-login, #modal-preview').forEach(m=>m.onclick=(e)=>{ if(e.target.classList.contains('modal-backdrop')) closeModal(e.target); });
});

// Botones Semana 1–16 en la barra 2
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

// Lista compacta en la barra 2
function renderFilesSidebar(week){
  const box = $('#weeks-files'); if (!box) return;
  box.innerHTML = '';
  const items = store.repoEntries.filter(e => +e.week === +week)
    .sort((a,b) => (a.title||a.name).localeCompare(b.title||b.name));
  if (!items.length){
    const empty=document.createElement('div'); empty.className='empty'; empty.textContent='No hay archivos en esta semana'; box.appendChild(empty); return;
  }
  for (const it of items){
    const row=document.createElement('div'); row.className='file-mini';
    row.innerHTML=`
      <div class="ico">${it.type==='image'?'🖼️':'📄'}</div>
      <div><div class="title" style="font-weight:700; font-size:.86rem">${it.title||it.name}</div><div class="meta">${it.type.toUpperCase()}</div></div>
      <div class="spacer"></div>
      <div class="act"><button type="button" data-action="prev">Ver</button><a href="${it.url}" download="${it.name}">Desc.</a></div>`;
    row.querySelector('[data-action="prev"]').onclick=()=>{
      const cont=$('#preview-container'); cont.innerHTML='';
      if (it.type==='image'){ const im=new Image(); im.src=it.url; im.className='w-full h-full object-contain bg-black'; cont.appendChild(im);}
      else { const ifr=document.createElement('iframe'); ifr.src=it.url; ifr.className='w-full h-full'; cont.appendChild(ifr);}
      openModal($('#modal-preview'));
    };
    box.appendChild(row);
  }
}

// Grid del centro
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
  renderWeekGrid(w);   // solo renderiza en el Dashboard
  // ❌ quitar la llamada a renderFilesSidebar(w);
}