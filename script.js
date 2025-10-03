// ===== Configuración de Supabase =====
const SUPABASE_URL = "https://oqrmtfxvhtmjyoekssgu.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xcm10Znh2aHRtanlvZWtzc2d1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxMjA3NjYsImV4cCI6MjA3NDY5Njc2Nn0.mdjAo_SdGt4KfnEuyXT8KVaJDA6iDVNbHLYmt22e-b0";

const supabase = window.supabase || createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===== Estado =====
const store = { 
  entries: [], 
  repoEntries: [], 
  isAdmin:false, 
  currentWeek: 1 
};
const dbEntriesKey='entries'; 
const dbFileKey=id=>`file:${id}`;

// ===== Utils =====
const $=(s,el=document)=>el.querySelector(s); 
const $$=(s,el=document)=>[...el.querySelectorAll(s)];
const fmtBytes=b=>b<1024?b+' B':b<1024**2?(b/1024).toFixed(1)+' KB':b<1024**3?(b/1024**2).toFixed(1)+' MB':(b/1024**3).toFixed(1)+' GB';
const openModal=el=>el.style.display='flex'; 
const closeModal=el=>el.style.display='none';

const updateAuthUI=()=>{
  $('#btn-login').classList.toggle('hidden',store.isAdmin);
  $('#btn-logout').classList.toggle('hidden',!store.isAdmin);
  $('#admin-tools').classList.toggle('hidden',!store.isAdmin);

  // Mostrar/ocultar botones de editar/eliminar
  $$('.card [data-action="edit"], .card [data-action="delete"]').forEach(btn=>{
    btn.style.display = store.isAdmin ? "inline-flex" : "none";
  });
};

async function persistEntries(){ await idbKeyval.set(dbEntriesKey, store.entries); }
async function loadEntries(){ store.entries = (await idbKeyval.get(dbEntriesKey)) || []; }

function ensureWeekOptions(sel){ 
  sel.innerHTML='<option value="" disabled selected>Semana…</option>'
    +Array.from({length:16},(_,i)=>`<option value="${i+1}">Semana ${i+1}</option>`).join('');
}

// ---- Navegación entre vistas (definición única) ----
window.showView = window.showView || function (name) {
  const vp = document.getElementById('view-portfolio');
  const vf = document.getElementById('view-profile');

  if (vp && vf) {
    vp.classList.toggle('hidden', name !== 'portfolio');
    vf.classList.toggle('hidden', name !== 'profile');
  }

  // marcar activo en el menú lateral
  document.querySelectorAll('button[data-nav]').forEach(b => {
    const active = b.dataset.nav === name;
    b.classList.toggle('active', active);
    if (active) {
      b.setAttribute('aria-current','page');
    } else {
      b.removeAttribute('aria-current');
    }
  });

  // sidebar de semanas solo en Portafolio
  if (typeof toggleSecondSidebar === 'function') {
    toggleSecondSidebar(name === 'portfolio');
  }

  // abrir semana al entrar a Portafolio
  if (name === 'portfolio' && typeof openWeek === 'function') {
    const w = (window.store && window.store.currentWeek) || 1;
    openWeek(w);
  }
}; // 👈 aquí CIERRA bien la función


// ==== Sidebar Semanas (mostrar/ocultar) ====
function toggleSecondSidebar(show) {
  const sb2 = document.getElementById('sidebar-weeks');
  const main = document.getElementById('app-main');
  if (!sb2 || !main) return;
  sb2.classList.toggle('show', !!show);
  sb2.style.display = show ? 'flex' : 'none';
  main.classList.toggle('with-sidebar-2', !!show);
}


// ===== Supabase: listado remoto =====
async function loadRepoManifest(){
  try {
    const { data, error } = await supabase.storage.from("uploads").list("", { limit: 100 });
    if (error) throw error;

    store.repoEntries = data.map(it=>{
      const ext = it.name.split('.').pop().toLowerCase();
      const type = ["jpg","jpeg","png","gif","webp"].includes(ext) ? "image" : "pdf";
      return {
        title: it.name,
        name: it.name,
        week: 1, // ⚠️ aquí podrías guardar semana en metadata
        type,
        url: `${SUPABASE_URL}/storage/v1/object/public/uploads/${it.name}`
      };
    });
  } catch(e){ console.error("Error cargando manifest:", e); }
}

// ===== Thumbnails =====
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
  }catch(e){ /* deja icono PDF */ }
}

// ===== Cards =====
function createCard(item){
  const tpl=$('#card-template'); 
  const node=tpl.content.firstElementChild.cloneNode(true);
  const img=$('[data-role=thumb]',node); 
  const pdfCover=$('[data-role=pdfcover]',node);
  const title=$('[data-role=title]',node); 
  const meta=$('[data-role=meta]',node);
  const btnPrev=$('[data-action=preview]',node); 
  const aDownload=$('[data-role=download]',node);

  title.textContent=item.title||item.name; 
  meta.textContent=`${item.type.toUpperCase()} · Semana ${item.week}`;
  aDownload.href=item.url; 
  aDownload.download=item.name;

  if(item.type==='image'){ 
    img.src=item.url; 
    img.onload=()=>img.classList.remove('hidden'); 
  }
  else { 
    renderPdfThumb(item.url,img).then(()=>{ 
      if(!img.src) pdfCover.classList.remove('hidden'); 
    }); 
  }

  btnPrev.onclick=()=>{ 
    const cont=$('#preview-container'); 
    cont.innerHTML='';
    if(item.type==='image'){ 
      const im=new Image(); 
      im.src=item.url; 
      im.className='w-full h-full object-contain bg-black'; 
      cont.appendChild(im); 
    }
    else { 
      const ifr=document.createElement('iframe'); 
      ifr.src=item.url; 
      ifr.className='w-full h-full'; 
      cont.appendChild(ifr); 
    }
    openModal($('#modal-preview'));
  };

  // Botones Admin
  if (store.isAdmin) {
    const editBtn = document.createElement("button");
    editBtn.textContent = "Editar";
    editBtn.dataset.action="edit";
    editBtn.className="btn btn-ghost px-2 py-1 text-xs";
    editBtn.onclick=()=>editEntry(item);

    const delBtn = document.createElement("button");
    delBtn.textContent = "Eliminar";
    delBtn.dataset.action="delete";
    delBtn.className="btn btn-ghost px-2 py-1 text-xs";
    delBtn.onclick=()=>deleteEntry(item);

    node.querySelector(".flex.items-center.gap-1").appendChild(editBtn);
    node.querySelector(".flex.items-center.gap-1").appendChild(delBtn);
  }

  return node;
}

// ===== CRUD (editar/eliminar solo Admin) =====
async function editEntry(item){
  const nuevoTitulo = prompt("Nuevo título:", item.title);
  if (!nuevoTitulo) return;
  item.title = nuevoTitulo;
  // ⚠️ Aquí puedes actualizar en Supabase (DB o metadata)
  renderWeekGrid(store.currentWeek);
}
async function deleteEntry(item){
  if (!confirm(`¿Eliminar ${item.title}?`)) return;
  try {
    await supabase.storage.from("uploads").remove([item.name]);
    store.repoEntries = store.repoEntries.filter(e=>e.name!==item.name);
    renderWeekGrid(store.currentWeek);
    alert("Eliminado correctamente");
  } catch(e){ alert("Error eliminando: "+e.message); }
}

// ===== Barra lateral de semanas =====
function buildWeeksSidebar(){
  const nav = $('#weeks-nav'); 
  if (!nav) return;
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

// ===== Grid central =====
function renderWeekGrid(week){
  const grid = $('#files-grid'); if (!grid) return;
  grid.innerHTML='';
  const items = store.repoEntries.filter(e=>+e.week===+week);
  if (!items.length){
    const empty=document.createElement('div'); 
    empty.className='empty'; 
    empty.textContent='No hay archivos en esta semana.'; 
    grid.appendChild(empty); 
    return;
  }
  items.forEach(it=>grid.appendChild(createCard(it)));
}

// ===== Abrir semana =====
function openWeek(w){
  store.currentWeek = w;
  renderWeekGrid(w);   // solo renderiza en el Dashboard
}

// ===== SUPABASE AUTH =====
async function sbSignUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}
async function sbSignIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}
async function sbSignOut() {
  await supabase.auth.signOut();
}

// Refrescar UI cuando cambia la sesión
supabase.auth.onAuthStateChange((_event, session) => {
  const isLogged = !!session;
  const user = session?.user?.email || null;
  // solo el correo admin@upla.edu es admin
  store.isAdmin = (isLogged && user === "admin@upla.edu");
  updateAuthUI();
});

// ===== Eventos de login/logout =====
document.addEventListener('DOMContentLoaded', ()=>{
  // Botón login: abre modal
  $('#btn-login').onclick=()=>openModal($('#modal-login'));

  // Botón logout
  $('#btn-logout').onclick=sbSignOut;

  // Formulario login
  $('#login-form').onsubmit = async (e)=>{
    e.preventDefault();
    const email = $('#login-user').value.trim();
    const pass  = $('#login-pass').value.trim();
    try {
      await sbSignIn(email, pass);
      closeModal($('#modal-login'));
    } catch (err) {
      alert("No se pudo iniciar sesión: " + err.message);
    }
  };
});

// ===== Upload archivos =====
document.addEventListener('DOMContentLoaded', ()=>{
  $('#upload-form').onsubmit=async(e)=>{
    e.preventDefault();
    const title=$('#title-input').value.trim(); 
    const week=$('#week-select').value; 
    const file=$('#file-input').files[0];
    if(!title||!week||!file) return alert('Completa título, semana y archivo.');

    try {
      // Subir a Supabase Storage
      const { error } = await supabase.storage.from("uploads").upload(file.name, file, { upsert: true });
      if (error) throw error;

      // Insertar referencia en lista local
      store.repoEntries.push({
        title, 
        week:+week, 
        type:file.type.startsWith("image/")?"image":"pdf",
        name:file.name,
        url:`${SUPABASE_URL}/storage/v1/object/public/uploads/${file.name}`
      });

      buildWeeksSidebar();
      openWeek(+week);

      e.target.reset(); 
      $('#week-select').value='';
      alert("Archivo subido correctamente.");
    } catch(err){ 
      alert("Error subiendo archivo: "+err.message); 
    }
  };
});

// ===== Init =====
document.addEventListener('DOMContentLoaded', async ()=>{
  ensureWeekOptions(document.getElementById('week-select'));
  await loadEntries();
  await loadRepoManifest();

  buildWeeksSidebar();
  openWeek(1);

  showView('portfolio'); // pantalla inicial
});

// ===== Helpers para refrescar la UI al cambiar el estado de admin =====
function refreshUIAfterAuthChange() {
  // Botonera y herramientas de admin
  const adminTools = $('#admin-tools');
  if (adminTools) adminTools.classList.toggle('hidden', !store.isAdmin);

  // Botones Login / Logout
  const btnLogin = $('#btn-login');
  const btnLogout = $('#btn-logout');
  if (btnLogin) btnLogin.classList.toggle('hidden', store.isAdmin);
  if (btnLogout) btnLogout.classList.toggle('hidden', !store.isAdmin);

  // Re-render de la semana actual para que aparezcan o se oculten las acciones admin
  openWeek(store.currentWeek || 1);
}

// ===== Parchear createCard para agregar acciones de admin sin recargar =====
(function patchCreateCardForAdmin(){
  if (window.__createCard_patched__) return; // evitar doble parche
  window.__createCard_patched__ = true;

  const __origCreateCard = createCard;
  window.createCard = function(item){
    const node = __origCreateCard(item);

    // Si es admin, añadimos barra de acciones (Editar / Eliminar)
    if (store.isAdmin) {
      addAdminToolbar(node, item);
    }
    return node;
  };
})();

// ===== Toolbar de admin en las cards =====
function addAdminToolbar(cardNode, item) {
  // contenedor superior (donde está la vista previa/descarga)
  let toolbar = cardNode.querySelector('.toolbar-admin');
  if (!toolbar) {
    toolbar = document.createElement('div');
    toolbar.className = 'toolbar-admin';
    toolbar.style.display = 'flex';
    toolbar.style.gap = '.4rem';

    const btnEdit = document.createElement('button');
    btnEdit.className = 'btn btn-ghost';
    btnEdit.textContent = 'Editar';
    btnEdit.style.fontSize = '.75rem';

    const btnDel = document.createElement('button');
    btnDel.className = 'btn btn-ghost';
    btnDel.textContent = 'Eliminar';
    btnDel.style.fontSize = '.75rem';

    // colocar a la derecha del header de la card
    const header = cardNode.querySelector('.mt-3 .flex');
    if (header) {
      header.appendChild(toolbar);
    } else {
      // fallback: ponerlo al final de la card
      cardNode.appendChild(toolbar);
    }

    toolbar.appendChild(btnEdit);
    toolbar.appendChild(btnDel);

    // EDITAR
    btnEdit.addEventListener('click', async ()=>{
      const nuevoTitulo = prompt('Nuevo título:', item.title || item.name);
      if (nuevoTitulo === null) return;

      let nuevaSemana = prompt('Nueva semana (1-16):', item.week);
      if (nuevaSemana === null) return;
      nuevaSemana = parseInt(nuevaSemana, 10);
      if (!(nuevaSemana >= 1 && nuevaSemana <= 16)) {
        alert('Semana inválida. Debe ser 1 a 16.');
        return;
      }

      // Actualiza en memoria
      const ref = store.repoEntries.find(x => x.name === item.name);
      if (ref) {
        ref.title = nuevoTitulo.trim() || ref.title;
        ref.week  = nuevaSemana;
      }

      // Refrescar UI
      buildWeeksSidebar();
      openWeek(store.currentWeek || 1);
      alert('Elemento actualizado (nota: si deseas persistir cambios, usa una BD).');
    });

    // ELIMINAR
    btnDel.addEventListener('click', async ()=>{
      if (!confirm(`¿Eliminar "${item.title || item.name}"?`)) return;
      try {
        // Elimina del Storage (si usas Supabase Storage)
        const { error } = await supabase
          .storage
          .from('uploads')
          .remove([item.name]);
        if (error) throw error;

        // Elimina del listado local
        store.repoEntries = store.repoEntries.filter(x => x.name !== item.name);

        // Refrescar UI
        buildWeeksSidebar();
        openWeek(store.currentWeek || 1);
        alert('Eliminado correctamente.');
      } catch(err){
        alert('No se pudo eliminar: ' + err.message);
      }
    });
  }
}




// ===== Modales: cerrar al hacer click fuera =====
document.addEventListener('DOMContentLoaded', ()=>{
  $$('#modal-login [data-close], #modal-preview [data-close]').forEach(b =>
    b.onclick = (ev)=> closeModal(ev.target.closest('.modal-backdrop'))
  );
  $$('#modal-login, #modal-preview').forEach(m =>
    m.onclick = (e)=>{ if (e.target.classList.contains('modal-backdrop')) closeModal(e.target); }
  );
});

// ===== Escucha de auth state (forzar refresco inmediato de UI) =====
if (supabase && supabase.auth) {
  supabase.auth.onAuthStateChange((_event, session) => {
    const isLogged = !!session;
    const user = session?.user?.email || null;
    store.isAdmin = (isLogged && user === 'admin@upla.edu'); // sólo este correo es admin
    refreshUIAfterAuthChange();
  });
}

// ===== Botones Login / Logout (asegurar que existen) =====
document.addEventListener('DOMContentLoaded', ()=>{
  const btnLogin = $('#btn-login');
  const btnLogout = $('#btn-logout');

  if (btnLogin) btnLogin.onclick = ()=> openModal($('#modal-login'));
  if (btnLogout) btnLogout.onclick = async ()=>{
    await supabase.auth.signOut();
    refreshUIAfterAuthChange();
  };

  const loginForm = $('#login-form');
  if (loginForm) {
    loginForm.onsubmit = async (e)=>{
      e.preventDefault();
      const email = $('#login-user').value.trim();
      const pass  = $('#login-pass').value.trim();
      try {
        await supabase.auth.signInWithPassword({ email, password: pass });
        closeModal($('#modal-login'));
        refreshUIAfterAuthChange();
      } catch (err) {
        alert('No se pudo iniciar sesión: ' + err.message);
      }
    };
  }
});

// ===== Cierre: reforzar estado inicial =====
document.addEventListener('DOMContentLoaded', ()=>{
  // Asegura que la semana 1 esté visible y la UI lista
  buildWeeksSidebar();
  openWeek(store.currentWeek || 1);
  showView('portfolio');
  refreshUIAfterAuthChange();
});

