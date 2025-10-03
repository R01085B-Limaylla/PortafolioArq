// ====== CONFIG ======
const SUPABASE_URL = window.SUPABASE_URL || "https://oqrmtfxvhtmjyoekssgu.supabase.co";
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || "";
const BUCKET = "uploads";
const INDEX_KEY = "index.json"; // manifest dentro del bucket

// Usa el cliente que creaste en index.html (window.supabase). Si no existe, intenta crearlo.
let supabase = window.supabase;
(async () => {
  if (!supabase && typeof window.createClient === "function" && SUPABASE_URL && SUPABASE_ANON_KEY) {
    supabase = window.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  if (!supabase) {
    console.warn("Supabase client no disponible. La parte pública funcionará, pero el login/subida no.");
  }
})();

// ====== ESTADO ======
const store = {
  repoEntries: [],
  isAdmin: false,
  currentWeek: 1
};

// ====== HELPERS DOM ======
const $ = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => [...el.querySelectorAll(s)];
const openModal = (el) => el && (el.style.display = "flex");
const closeModal = (el) => el && (el.style.display = "none");

function updateAuthUI() {
  const isAdmin = !!store.isAdmin;
  const loginBtn  = $("#btn-login");
  const logoutBtn = $("#btn-logout");
  const adminBox  = $("#admin-tools");

  if (loginBtn)  loginBtn.classList.toggle("hidden", isAdmin);
  if (logoutBtn) logoutBtn.classList.toggle("hidden", !isAdmin);
  if (adminBox)  adminBox.classList.toggle("hidden", !isAdmin);

  // Re-pintar tarjetas para mostrar/ocultar herramientas admin
  renderWeekGrid(store.currentWeek || 1);
}

// ====== NAVEGACIÓN (definición única) ======
window.showView = function(name){
  const vp = $("#view-portfolio");
  const vf = $("#view-profile");
  if (vp && vf) {
    vp.classList.toggle("hidden", name !== "portfolio");
    vf.classList.toggle("hidden", name !== "profile");
  }
  // barra de semanas solo en Portafolio
  toggleSecondSidebar(name === "portfolio");
  if (name === "portfolio") {
    openWeek(store.currentWeek || 1);
  }
};

function toggleSecondSidebar(show){
  const sb2  = $("#sidebar-weeks");
  const main = $("#app-main");
  if (!sb2 || !main) return;
  sb2.classList.toggle("show", !!show);
  sb2.style.display = show ? "flex" : "none";
  main.classList.toggle("with-sidebar-2", !!show);
}

// ====== MANIFEST EN SUPABASE STORAGE ======
async function readStorageManifest(){
  if (!supabase) return { items: [] };
  try {
    const { data, error } = await supabase.storage.from(BUCKET).download(INDEX_KEY);
    if (error) return { items: [] };
    const text = await data.text();
    const json = JSON.parse(text || "{}");
    return json?.items ? json : { items: [] };
  } catch (e) {
    return { items: [] };
  }
}

async function writeStorageManifest(manifest){
  if (!supabase) return;
  const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" });
  await supabase.storage.from(BUCKET).upload(INDEX_KEY, blob, { upsert: true, contentType: "application/json" });
}

// ====== CARGA DE LISTA (usa manifest; si no existe, lista objetos para fallback) ======
async function loadRepoManifest(){
  // 1) Intenta cargar manifest
  const mf = await readStorageManifest();
  if (mf.items?.length) {
    store.repoEntries = mf.items;
    return;
  }

  // 2) Fallback: listar bucket (no mantiene título/semana personalizados)
  if (!supabase) { store.repoEntries = []; return; }
  try {
    const { data, error } = await supabase.storage.from(BUCKET).list("", { limit: 100 });
    if (error) throw error;
    store.repoEntries = (data || [])
      .filter(x => !x.name.endsWith("/")) // evita “directorios virtuales”
      .map(it => {
        const ext = it.name.split(".").pop().toLowerCase();
        const type = ["jpg","jpeg","png","gif","webp","bmp","svg"].includes(ext) ? "image" : "pdf";
        return {
          title: it.name.replace(/\.[^.]+$/, ""), // sin extensión
          name: it.name,
          week: 1, // sin manifest no hay semana -> 1 por defecto
          type,
          url: `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${encodeURIComponent(it.name)}`
        };
      });
  } catch (e) {
    console.error("Error al listar Storage:", e);
    store.repoEntries = [];
  }
}

// ====== MINIATURAS PDF ======
async function renderPdfThumb(url, imgEl){
  try {
    const pdf = await pdfjsLib.getDocument({ url }).promise;
    const page = await pdf.getPage(1);
    const vp = page.getViewport({ scale: 1.0 });
    const scale = Math.min(640 / vp.width, 1.5);
    const v = page.getViewport({ scale });
    const c = document.createElement("canvas");
    c.width = v.width; c.height = v.height;
    await page.render({ canvasContext: c.getContext("2d", { alpha:false }), viewport: v }).promise;
    imgEl.src = c.toDataURL("image/png");
    imgEl.classList.remove("hidden");
  } catch(e) { /* deja icono PDF */ }
}

// ====== TARJETAS ======
function createCard(item){
  const tpl = $("#card-template");
  const node = tpl.content.firstElementChild.cloneNode(true);
  const img = node.querySelector('[data-role="thumb"]');
  const pdfCover = node.querySelector('[data-role="pdfcover"]');
  const title = node.querySelector('[data-role="title"]');
  const meta  = node.querySelector('[data-role="meta"]');
  const btnPrev = node.querySelector('[data-action="preview"]');
  const aDownload= node.querySelector('[data-role="download"]');

  title.textContent = item.title || item.name;
  meta.textContent  = `${(item.type || "").toUpperCase()} · Semana ${item.week}`;

  aDownload.href = item.url;
  aDownload.download = item.name;

  if (item.type === "image") {
    img.src = item.url;
    img.onload = () => img.classList.remove("hidden");
  } else {
    renderPdfThumb(item.url, img).then(() => {
      if (!img.src) pdfCover.classList.remove("hidden");
    });
  }

  btnPrev.onclick = () => {
    const cont = $("#preview-container");
    cont.innerHTML = "";
    if (item.type === "image") {
      const im = new Image();
      im.src = item.url;
      im.className = "w-full h-full object-contain bg-black";
      cont.appendChild(im);
    } else {
      const ifr = document.createElement("iframe");
      ifr.src = item.url;
      ifr.className = "w-full h-full";
      cont.appendChild(ifr);
    }
    openModal($("#modal-preview"));
  };

  // Barra de acciones (dentro de la card)
  const actionsWrap = node.querySelector(".flex.items-center.gap-1");
  const adminBar = document.createElement("div");
  adminBar.className = "flex items-center gap-1 ml-2";
  actionsWrap.appendChild(adminBar);

  if (store.isAdmin) {
    const btnEdit = document.createElement("button");
    btnEdit.className = "btn btn-ghost px-2 py-1 text-xs";
    btnEdit.textContent = "Editar";
    btnEdit.onclick = () => editEntry(item);

    const btnDel = document.createElement("button");
    btnDel.className = "btn btn-ghost px-2 py-1 text-xs";
    btnDel.textContent = "Eliminar";
    btnDel.onclick = () => deleteEntry(item);

    adminBar.appendChild(btnEdit);
    adminBar.appendChild(btnDel);
  }

  return node;
}

// ====== GRID ======
function renderWeekGrid(week){
  const grid = $("#files-grid");
  if (!grid) return;
  grid.innerHTML = "";
  const list = store.repoEntries.filter(e => +e.week === +week);
  if (!list.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No hay archivos en esta semana.";
    grid.appendChild(empty);
    return;
  }
  list.forEach(it => grid.appendChild(createCard(it)));
}

// ====== SIDEBAR SEMANAS ======
function buildWeeksSidebar(){
  const nav = $("#weeks-nav");
  if (!nav) return;
  nav.innerHTML = "";
  for (let w=1; w<=16; w++){
    const count = store.repoEntries.filter(e => +e.week === w).length;
    const btn = document.createElement("button");
    btn.className = "wk";
    btn.dataset.week = String(w);
    btn.innerHTML = `
      <span class="pill">${w}</span>
      <span>Semana ${w}</span>
      <span style="margin-left:auto; font-size:.75rem; color:#a9b6dc;">${count}</span>`;
    btn.addEventListener("click", () => {
      $$("#weeks-nav .wk").forEach(b => b.classList.toggle("active", b === btn));
      openWeek(w);
    });
    if (w === (store.currentWeek||1)) btn.classList.add("active");
    nav.appendChild(btn);
  }
}

function openWeek(w){
  store.currentWeek = +w;
  renderWeekGrid(store.currentWeek);
}

// ====== CRUD (editar / eliminar) ======
async function editEntry(item){
  try {
    const nuevoTitulo = prompt("Nuevo título:", item.title || item.name);
    if (nuevoTitulo === null) return;
    let nuevaSemana = prompt("Nueva semana (1–16):", item.week);
    if (nuevaSemana === null) return;
    nuevaSemana = parseInt(nuevaSemana, 10);
    if (!(nuevaSemana >= 1 && nuevaSemana <= 16)) {
      alert("Semana inválida. Debe ser 1 a 16.");
      return;
    }

    // Actualizar en memoria
    const ref = store.repoEntries.find(x => x.name === item.name);
    if (ref) {
      ref.title = (nuevoTitulo || "").trim() || ref.title;
      ref.week  = nuevaSemana;
    }

    // Persistir en manifest
    const mf = await readStorageManifest();
    const idx = (mf.items||[]).findIndex(x => x.name === item.name);
    if (idx >= 0) {
      mf.items[idx].title = ref.title;
      mf.items[idx].week  = ref.week;
    } else {
      // por si no existía
      mf.items.push(ref);
    }
    await writeStorageManifest(mf);

    // refrescar UI
    buildWeeksSidebar();
    renderWeekGrid(store.currentWeek);
  } catch (e) {
    alert("No se pudo editar: " + e.message);
  }
}

async function deleteEntry(item){
  if (!confirm(`¿Eliminar "${item.title || item.name}"?`)) return;
  try {
    if (supabase) {
      const { error } = await supabase.storage.from(BUCKET).remove([item.name]);
      if (error) throw error;
    }
    // Quitar de manifest
    const mf = await readStorageManifest();
    mf.items = (mf.items || []).filter(x => x.name !== item.name);
    await writeStorageManifest(mf);

    // Quitar de memoria
    store.repoEntries = store.repoEntries.filter(x => x.name !== item.name);

    buildWeeksSidebar();
    renderWeekGrid(store.currentWeek);
  } catch (e) {
    alert("Error eliminando: " + e.message);
  }
}

// ====== AUTH ======
function attachAuthHandlers(){
  const loginBtn  = $("#btn-login");
  const logoutBtn = $("#btn-logout");
  const loginForm = $("#login-form");

  if (loginBtn)  loginBtn.onclick  = () => openModal($("#modal-login"));
  if (logoutBtn) logoutBtn.onclick = async () => { if (supabase) await supabase.auth.signOut(); };

  if (loginForm) {
    loginForm.onsubmit = async (e) => {
      e.preventDefault();
      if (!supabase) return alert("Supabase no está inicializado.");
      const email = $("#login-user").value.trim();
      const pass  = $("#login-pass").value.trim();
      try {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
        if (error) throw error;
        closeModal($("#modal-login"));
      } catch (err) {
        alert("No se pudo iniciar sesión: " + err.message);
      }
    };
  }

  if (supabase && supabase.auth) {
    supabase.auth.onAuthStateChange((_event, session) => {
      const email = session?.user?.email || null;
      store.isAdmin = !!email && (email === "admin@upla.edu" || email === "admin@upla.edu.pe");
      updateAuthUI();
    });
  }
}

// ====== SUBIDA ======
function attachUploadHandler(){
  const form = $("#upload-form");
  const weekSel = $("#week-select");

  // opciones semana
  if (weekSel) {
    weekSel.innerHTML = '<option value="" disabled selected>Semana…</option>' +
      Array.from({length:16}, (_,i)=>`<option value="${i+1}">Semana ${i+1}</option>`).join("");
  }

  if (!form) return;

  form.onsubmit = async (e) => {
    e.preventDefault();
    if (!supabase) return alert("Supabase no está inicializado.");

    const title = $("#title-input").value.trim();
    const week  = parseInt($("#week-select").value, 10);
    const file  = $("#file-input").files[0];

    if (!title || !week || !file) return alert("Completa título, semana y archivo.");

    try {
      // 1) Subir archivo
      const { error } = await supabase.storage.from(BUCKET).upload(file.name, file, { upsert: true });
      if (error) throw error;

      // 2) Construir item con título y semana elegidos
      const ext  = (file.name.split(".").pop() || "").toLowerCase();
      const type = file.type.startsWith("image/") ? "image" : (["jpg","jpeg","png","gif","webp","bmp","svg"].includes(ext) ? "image" : "pdf");
      const url  = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${encodeURIComponent(file.name)}`;

      const item = { title, week, type, name: file.name, url };

      // 3) Guardar en manifest
      const mf = await readStorageManifest();
      const idx = (mf.items || []).findIndex(x => x.name === item.name);
      if (idx >= 0) mf.items[idx] = item;
      else (mf.items || (mf.items = [])).push(item);
      await writeStorageManifest(mf);

      // 4) Refrescar en memoria + UI
      const localIdx = store.repoEntries.findIndex(x => x.name === item.name);
      if (localIdx >= 0) store.repoEntries[localIdx] = item;
      else store.repoEntries.push(item);

      buildWeeksSidebar();
      openWeek(week);

      form.reset();
      $("#week-select").value = "";
      alert("Archivo subido correctamente.");
    } catch (err) {
      alert("Error subiendo archivo: " + err.message);
    }
  };
}

// ====== INIT ======
document.addEventListener("DOMContentLoaded", async () => {
  // Nav entre vistas
  $$("button[data-nav]").forEach(b => b.onclick = () => window.showView(b.dataset.nav));
  window.showView("portfolio");

  attachAuthHandlers();
  attachUploadHandler();

  // cerrar modales al hacer click en backdrop
  $$("#modal-login [data-close], #modal-preview [data-close]").forEach(b =>
    b.onclick = ev => closeModal(ev.target.closest(".modal-backdrop"))
  );
  $$("#modal-login, #modal-preview").forEach(m =>
    m.onclick = (e)=>{ if (e.target.classList.contains("modal-backdrop")) closeModal(e.target); }
  );

  // Cargar datos
  await loadRepoManifest();
  buildWeeksSidebar();
  renderWeekGrid(store.currentWeek || 1);
});
