// Estado y claves
const store = { entries: [], isAdmin: false, dirHandle: null };
const dbEntriesKey = 'entries';
const keyDirHandle = 'dirHandle';
const dbFileKey = (id) => `file:${id}`;

// Utilidades
const $ = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => [...el.querySelectorAll(s)];
const fmtBytes = (b) => b<1024? b+' B' : b<1024**2? (b/1024).toFixed(1)+' KB' : b<1024**3? (b/1024**2).toFixed(1)+' MB' : (b/1024**3).toFixed(1)+' GB';

// Modales
function openModal(el){ el.style.display = 'flex'; }
function closeModal(el){ el.style.display = 'none'; }

// Vistas
function showView(name){
  $('#view-portfolio').classList.toggle('hidden', name !== 'portfolio');
  $('#view-profile').classList.toggle('hidden', name !== 'profile');
}

// Auth UI
function updateAuthUI(){
  $('#btn-login').classList.toggle('hidden', store.isAdmin);
  $('#btn-logout').classList.toggle('hidden', !store.isAdmin);
  $('#admin-tools').classList.toggle('hidden', !store.isAdmin);
  $$('#weeks-accordion [data-action="edit"]').forEach(b => b.classList.toggle('hidden', !store.isAdmin));
  $$('#weeks-accordion [data-action="delete"]').forEach(b => b.classList.toggle('hidden', !store.isAdmin));
}

// Persistencia
async function persistEntries(){ await idbKeyval.set(dbEntriesKey, store.entries); }
async function loadEntries(){ store.entries = (await idbKeyval.get(dbEntriesKey)) || []; }
async function saveDirHandle(handle){ try { await idbKeyval.set(keyDirHandle, handle); } catch(e){} }
async function loadDirHandle(){ try { store.dirHandle = await idbKeyval.get(keyDirHandle) || null; } catch(e){} }

function ensureWeekOptions(select){
  select.innerHTML=''; const def = document.createElement('option');
  def.value=''; def.disabled = true; def.selected = true; def.textContent = 'Semana…';
  select.appendChild(def);
  for(let w=1; w<=16; w++){ const opt=document.createElement('option'); opt.value=String(w); opt.textContent=`Semana ${w}`; select.appendChild(opt); }
}

// PDF thumb helper
async function renderPdfThumbnailToImg(pdfBlob, imgEl){
  if(!window['pdfjsLib']) return;
  try{
    const url = URL.createObjectURL(pdfBlob);
    const pdf = await pdfjsLib.getDocument({ url }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1.0 });
    // Ajustar tamaño (ancho 640 aprox para buena miniatura)
    const scale = Math.min(640 / viewport.width, 1.5);
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { alpha:false });
    canvas.width = vp.width; canvas.height = vp.height;
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    imgEl.src = canvas.toDataURL('image/png');
    imgEl.classList.remove('hidden');
    URL.revokeObjectURL(url);
  } catch (e){ console.warn('No se pudo renderizar miniatura PDF:', e); }
}

// Cards
function createCard(entry){
  const tpl = $('#card-template'); const node = tpl.content.firstElementChild.cloneNode(true);
  const img = $('[data-role="thumb"]', node);
  const pdfCover = $('[data-role="pdfcover"]', node);
  const title = $('[data-role="title"]', node);
  const meta = $('[data-role="meta"]', node);
  const btnPrev = $('[data-action="preview"]', node);
  const btnEdit = $('[data-action="edit"]', node);
  const btnDel = $('[data-action="delete"]', node);
  const aDownload = $('[data-role="download"]', node);

  title.textContent = entry.title || entry.name;
  meta.textContent = `${entry.type.toUpperCase()} · ${fmtBytes(entry.size)} · Semana ${entry.week}`;

  idbKeyval.get(dbFileKey(entry.id)).then(async (blob) => {
    if(!blob) return;
    const url = URL.createObjectURL(blob);
    aDownload.href = url;
    aDownload.download = entry.name;
    if(entry.type === 'image'){
      img.src = url; img.classList.remove('hidden');
    } else {
      // Generar miniatura del primer folio del PDF
      await renderPdfThumbnailToImg(blob, img);
      if(img.src){ pdfCover.classList.add('hidden'); } else { pdfCover.classList.remove('hidden'); }
    }
  });

  btnPrev.addEventListener('click', async () => {
    const blob = await idbKeyval.get(dbFileKey(entry.id));
    if(!blob) return;
    const url = URL.createObjectURL(blob);
    const cont = $('#preview-container');
    cont.innerHTML='';
    if(entry.type === 'image'){
      const im = document.createElement('img');
      im.src = url; im.alt = entry.title; im.className = 'w-full h-full object-contain bg-black';
      cont.appendChild(im);
    } else {
      const ifr = document.createElement('iframe');
      ifr.src = url; ifr.className = 'w-full h-full';
      cont.appendChild(ifr);
    }
    openModal($('#modal-preview'));
  });

  btnEdit.addEventListener('click', () => openEdit(entry));
  btnDel.addEventListener('click', () => deleteEntry(entry.id));

  btnEdit.classList.toggle('hidden', !store.isAdmin);
  btnDel.classList.toggle('hidden', !store.isAdmin);

  return node;
}

// Accordion
function renderAccordion(){
  const acc = $('#weeks-accordion'); acc.innerHTML = '';
  for(let w=1; w<=16; w++){
    const section = document.createElement('section');
    section.className = 'card p-0';

    const header = document.createElement('button');
    header.className = 'accordion-btn w-full flex items-center justify-between p-4';
    const count = store.entries.filter(e=>+e.week===w).length;
    header.innerHTML = `<div class="flex items-center gap-3"><span class="tag">Semana ${w}</span><span class="text-sm text-slate-400">${count} elementos</span></div><span>▸</span>`;

    const panel = document.createElement('div');
    panel.className = 'accordion-panel px-4 pb-4';

    const list = document.createElement('div');
    list.className = 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4';
    store.entries.filter(e=>+e.week===w).sort((a,b)=>b.createdAt-a.createdAt).forEach(e => list.appendChild(createCard(e)));
    if(list.children.length===0){
      const empty = document.createElement('div');
      empty.className = 'text-sm text-slate-400 border border-dashed border-white/10 rounded-xl p-6 text-center';
      empty.textContent = 'Sin elementos aún';
      list.appendChild(empty);
    }
    panel.appendChild(list);

    header.addEventListener('click', () => {
      const open = panel.classList.toggle('open');
      header.querySelector('span:last-child').textContent = open ? '▾' : '▸';
    });

    section.appendChild(header);
    section.appendChild(panel);
    acc.appendChild(section);
  }
}

// CRUD
async function addEntry({title, week, file}){
  const id = crypto.randomUUID();
  const type = file.type.startsWith('image/') ? 'image' : 'pdf';
  const meta = { id, title: title || file.name, week: Number(week), type, name: file.name, size: file.size, createdAt: Date.now() };
  store.entries.push(meta);
  await idbKeyval.set(dbFileKey(id), file);
  await persistEntries();
  await maybeSaveToFolder(file, meta.name);
  renderAccordion();
}

async function deleteEntry(id){
  if(!confirm('¿Eliminar este elemento?')) return;
  store.entries = store.entries.filter(e=>e.id!==id);
  await idbKeyval.del(dbFileKey(id));
  await persistEntries();
  renderAccordion();
}

function openEdit(entry){
  const newTitle = prompt('Nuevo título:', entry.title) ?? entry.title;
  let newWeek = Number(prompt('Nueva semana (1-16):', entry.week) ?? entry.week);
  if(!(newWeek>=1 && newWeek<=16)) newWeek = entry.week;
  const i = store.entries.findIndex(x=>x.id===entry.id);
  if(i>=0){ store.entries[i].title = newTitle; store.entries[i].week = newWeek; persistEntries().then(renderAccordion); }
}

// File System Access API
async function verifyPermission(handle, mode='readwrite'){
  if(!handle) return false;
  const opts = { mode };
  if((await handle.queryPermission(opts)) === 'granted') return true;
  if((await handle.requestPermission(opts)) === 'granted') return true;
  return false;
}

async function pickFolder(){
  if(!window.showDirectoryPicker){
    alert('Tu navegador no soporta la API para guardar en carpeta local. Usa Chrome/Edge recientes.');
    return;
  }
  try{
    const dir = await window.showDirectoryPicker({id:'portafolio-semanas'});
    const ok = await verifyPermission(dir, 'readwrite');
    if(ok){
      store.dirHandle = dir;
      await saveDirHandle(dir);
      $('#folder-status').textContent = 'Carpeta conectada ✔';
    } else {
      $('#folder-status').textContent = 'Permiso denegado';
    }
  }catch(e){ console.error(e); }
}

async function maybeSaveToFolder(file, filename){
  try{
    if(!store.dirHandle) return;
    const ok = await verifyPermission(store.dirHandle, 'readwrite');
    if(!ok) return;
    const fileHandle = await store.dirHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(file);
    await writable.close();
  }catch(e){ console.warn('No se pudo guardar en carpeta local:', e); }
}

// Init
document.addEventListener('DOMContentLoaded', async () => {
  ensureWeekOptions($('#week-select'));

  await loadEntries();
  await loadDirHandle();
  renderAccordion();

  store.isAdmin = localStorage.getItem('isAdmin') === '1';
  updateAuthUI();
  if(store.dirHandle){ $('#folder-status').textContent = 'Carpeta conectada ✔'; }

  $$('button[data-nav]').forEach(btn => btn.addEventListener('click', () => showView(btn.dataset.nav)));
  showView('portfolio');

  $('#btn-login').addEventListener('click', () => openModal($('#modal-login')));
  $('#btn-logout').addEventListener('click', () => { store.isAdmin=false; localStorage.removeItem('isAdmin'); updateAuthUI(); });
  $('#login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const user = $('#login-user').value.trim();
    const pass = $('#login-pass').value.trim();
    if(user === 'admin' && pass === 'admin123'){
      store.isAdmin = true; localStorage.setItem('isAdmin','1'); updateAuthUI(); closeModal($('#modal-login'));
    } else alert('Credenciales inválidas');
  });

  $('#upload-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = $('#title-input').value.trim();
    const week = $('#week-select').value;
    const file = $('#file-input').files[0];
    if(!file || !week){ alert('Completa título, semana y archivo.'); return; }
    await addEntry({ title, week, file });
    e.target.reset(); $('#week-select').value='';
  });

  $('#btn-pick-folder').addEventListener('click', pickFolder);

  $$('#modal-login [data-close], #modal-preview [data-close]').forEach(b => b.addEventListener('click', (ev) => {
    closeModal(ev.target.closest('.modal-backdrop'));
  }));
  $$('#modal-login, #modal-preview').forEach(m => m.addEventListener('click', (e)=>{
    if(e.target.classList.contains('modal-backdrop')) closeModal(e.target);
  }));
});