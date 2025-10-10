
/************************************
 *  Portfolio – script.js (COMPLETO)
 *  (ver cabecera del archivo anterior para descripción)
 ************************************/
if (!window.supabase) {
  console.warn("Supabase client no encontrado. Crea window.supabase en index.html.");
}
const BUCKET = "uploads";
const MANIFEST_PATH = "manifest.json";

const store = {
  repoEntries: [],
  isAdmin: false,
  currentWeek: 1,
  session: null,
  userEmail: null
};

const $  = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => [...el.querySelectorAll(s)];
const openModal  = el => el && (el.style.display = "flex");
const closeModal = el => el && (el.style.display = "none");

function ensureWeekOptions(sel) {
  if (!sel) return;
  sel.innerHTML =
    '<option value="" disabled selected>Semana…</option>' +
    Array.from({ length: 16 }, (_, i) => `<option value="${i + 1}">Semana ${i + 1}</option>`).join("");
}

function getPublicUrl(path) {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data?.publicUrl || "";
}

function extIsImage(filename) {
  const ext = (filename.split(".").pop() || "").toLowerCase();
  return ["jpg","jpeg","png","gif","webp","bmp","svg"].includes(ext);
}

window.showView = function(name) {
  const vp  = $("#view-portfolio");
  const vf  = $("#view-profile");
  const vac = $("#view-account");
  if (vp)  vp.classList.toggle("hidden", name !== "portfolio");
  if (vf)  vf.classList.toggle("hidden", name !== "profile");
  if (vac) vac.classList.toggle("hidden", name !== "account");

  $$("button[data-nav]").forEach(b => {
    const active = b.dataset.nav === name;
    b.classList.toggle("active", active);
    if (active) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });

  toggleSecondSidebar(name === "portfolio");
  if (name === "portfolio") openWeek(store.currentWeek || 1);
};

function toggleSecondSidebar(show) {
  const sb2 = $("#sidebar-weeks");
  const main = $("#app-main");
  if (!sb2 || !main) return;
  sb2.classList.toggle("show", !!show);
  sb2.style.display = show ? "flex" : "none";
  main.classList.toggle("with-sidebar-2", !!show);
}

async function fetchManifest() {
  try {
    const { data, error } = await supabase.storage.from(BUCKET).download(MANIFEST_PATH);
    if (error) throw error;
    const txt = await data.text();
    const json = JSON.parse(txt || "{}");
    return Array.isArray(json.items) ? json.items : [];
  } catch (_) {
    return [];
  }
}

async function saveManifest(items) {
  const body = JSON.stringify({ items }, null, 2);
  const blob = new Blob([body], { type: "application/json" });
  const { error } = await supabase.storage.from(BUCKET).upload(MANIFEST_PATH, blob, { upsert: true, contentType: "application/json" });
  if (error) throw error;
}

async function loadRepoManifest() {
  let items = await fetchManifest();
  if (!items.length) {
    const { data, error } = await supabase.storage.from(BUCKET).list("", { limit: 1000 });
    if (!error && Array.isArray(data)) {
      items = data.map(it => ({
        name: it.name,
        title: it.name,
        week: 1,
        type: extIsImage(it.name) ? "image" : "pdf",
        url: getPublicUrl(it.name)
      }));
    }
  }
  store.repoEntries = items;
}

async function renderPdfThumb(url, imgEl) {
  try {
    const pdf = await pdfjsLib.getDocument({ url }).promise;
    const page = await pdf.getPage(1);
    const vp = page.getViewport({ scale: 1.0 });
    const scale = Math.min(640 / vp.width, 1.5);
    const v = page.getViewport({ scale });
    const c = document.createElement("canvas");
    c.width = v.width;
    c.height = v.height;
    await page.render({ canvasContext: c.getContext("2d", { alpha: false }), viewport: v }).promise;
    imgEl.src = c.toDataURL("image/png");
    imgEl.classList.remove("hidden");
  } catch (_) {}
}

function createCard(item) {
  const tpl = $("#card-template");
  const node = tpl.content.firstElementChild.cloneNode(true);

  const thumbWrap = node.querySelector(".aspect-video");
  const img = node.querySelector('[data-role="thumb"]');
  const pdfCover = node.querySelector('[data-role="pdfcover"]');
  const title = node.querySelector('[data-role="title"]');
  const meta = node.querySelector('[data-role="meta"]');

  title.textContent = item.title || item.name;
  meta.textContent = `${item.type.toUpperCase()} · Semana ${item.week}`;

  if (item.type === "image") {
    img.src = item.url;
    img.onload = () => img.classList.remove("hidden");
  } else {
    renderPdfThumb(item.url, img).then(() => {
      if (!img.src) pdfCover.classList.remove("hidden");
    });
  }

  const overlay = document.createElement("div");
  overlay.className = "thumb-overlay";

  const verBtn = document.createElement("button");
  verBtn.className = "icon-btn";
  verBtn.title = "Ver";
  verBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Z" stroke="currentColor" stroke-width="2"/>
      <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/>
    </svg>`;
  verBtn.onclick = () => {
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

  const dlBtn = document.createElement("a");
  dlBtn.className = "icon-btn";
  dlBtn.href = item.url;
  dlBtn.download = item.name;
  dlBtn.title = "Descargar";
  dlBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M12 3v12M7 10l5 5 5-5M4 21h16" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;

  overlay.appendChild(verBtn);
  overlay.appendChild(dlBtn);
  thumbWrap.appendChild(overlay);

  if (store.isAdmin) {
    const actions = document.createElement("div");
    actions.className = "admin-actions";
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn btn-success text-xs";
    editBtn.textContent = "Editar";
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "btn btn-danger text-xs";
    delBtn.textContent = "Eliminar";
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    node.querySelector(".mt-3").appendChild(actions);
    editBtn.addEventListener("click", () => editEntry(item));
    delBtn.addEventListener("click", () => deleteEntry(item));
  }

  return node;
}

async function editEntry(item) {
  const nuevoTitulo = prompt("Nuevo título:", item.title || item.name);
  if (nuevoTitulo === null) return;
  let nuevaSemana = prompt("Nueva semana (1-16):", String(item.week || 1));
  if (nuevaSemana === null) return;
  nuevaSemana = parseInt(nuevaSemana, 10);
  if (!(nuevaSemana >= 1 && nuevaSemana <= 16)) return alert("Semana inválida (1-16).");

  const ref = store.repoEntries.find(x => x.name === item.name);
  if (ref) {
    ref.title = (nuevoTitulo.trim() || ref.title);
    ref.week = nuevaSemana;
  }
  try {
    await saveManifest(store.repoEntries);
    buildWeeksSidebar();
    openWeek(store.currentWeek || 1);
    alert("Elemento actualizado.");
  } catch (e) {
    alert("Error al guardar cambios: " + e.message);
  }
}

async function deleteEntry(item) {
  if (!confirm(`¿Eliminar "${item.title || item.name}"?`)) return;
  try {
    const { error } = await supabase.storage.from(BUCKET).remove([item.name]);
    if (error) throw error;
    store.repoEntries = store.repoEntries.filter(x => x.name !== item.name);
    await saveManifest(store.repoEntries);
    buildWeeksSidebar();
    openWeek(store.currentWeek || 1);
    alert("Eliminado correctamente.");
  } catch (e) {
    alert("No se pudo eliminar: " + e.message);
  }
}

function buildWeeksSidebar() {
  const nav = $("#weeks-nav");
  if (!nav) return;
  nav.innerHTML = "";
  for (let w = 1; w <= 16; w++) {
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
    if (w === (store.currentWeek || 1)) btn.classList.add("active");
    nav.appendChild(btn);
  }
}

function renderWeekGrid(week) {
  const grid = $("#files-grid");
  if (!grid) return;
  grid.innerHTML = "";
  const items = store.repoEntries.filter(e => +e.week === +week);
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No hay archivos en esta semana.";
    grid.appendChild(empty);
    return;
  }
  items.forEach(it => grid.appendChild(createCard(it)));
}

function openWeek(w) {
  store.currentWeek = w;
  renderWeekGrid(w);
}

function populateAccount(session) {
  const user = session?.user;
  const email = user?.email || "—";
  const name = user?.user_metadata?.full_name || user?.user_metadata?.name || (email ? email.split("@")[0] : "—");
  const avatar = user?.user_metadata?.avatar_url || "";
  const provider = user?.app_metadata?.provider || "password";

  const $name   = $("#account-name");
  const $email  = $("#account-email");
  const $prov   = $("#account-provider");
  const $avatar = $("#account-avatar");
  const $id     = $("#account-id");
  const $ver    = $("#account-verified");
  const $created= $("#account-created");
  const $last   = $("#account-last-signin");
  const $idents = $("#account-identities");

  if ($name)   $name.textContent = name;
  if ($email)  $email.textContent = email;
  if ($prov)   $prov.textContent  = provider;
  if ($avatar) $avatar.src        = avatar || "https://ui-avatars.com/api/?name=" + encodeURIComponent(name);
  if ($id)     $id.textContent    = user?.id || "—";
  if ($ver)    $ver.textContent   = user?.email_confirmed_at ? "Sí" : "No";
  if ($created)$created.textContent = user?.created_at ? new Date(user.created_at).toLocaleString() : "—";
  if ($last)   $last.textContent  = user?.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString() : "—";

  if ($idents) {
    const idents = user?.identities || [];
    if (!idents.length) $idents.textContent = "—";
    else {
      $idents.innerHTML = idents.map(idt => {
        const prov = idt?.provider || "—";
        const idv  = idt?.identity_data?.sub || idt?.id || "—";
        return `<div><span class="text-slate-400">• ${prov}:</span> ${idv}</div>`;
      }).join("");
    }
  }
  renderSidebarUser(session);
}

function renderSidebarUser(session) {
  const footer = document.querySelector(".sidebar__footer");
  if (!footer) return;
  let box = document.getElementById("sidebar-userbox");
  if (!box) {
    box = document.createElement("div");
    box.id = "sidebar-userbox";
    box.className = "card mb-2";
    box.style.marginBottom = "0.5rem";
    footer.prepend(box);
  }
  const user = session?.user;
  if (!user) { box.innerHTML = ""; box.style.display="none"; return; }
  const email = user.email || "";
  const name = user.user_metadata?.full_name || user.user_metadata?.name || email.split("@")[0] || "Usuario";
  const avatar = user.user_metadata?.avatar_url || "https://ui-avatars.com/api/?name=" + encodeURIComponent(name);
  box.innerHTML = `
    <div class="flex items-center gap-3">
      <img src="${avatar}" alt="avatar" class="w-8 h-8 rounded-lg border border-white/10 object-cover">
      <div class="min-w-0">
        <div class="text-sm font-semibold truncate">${name}</div>
        <div class="text-xs text-slate-400 truncate">${email}</div>
      </div>
    </div>`;
  box.style.display = "block";
}

function updateAuthUI() {
  const hasSession = !!store.session;
  const isAdmin = store.isAdmin;

  // Botones de login/logout
  $("#btn-login") ?.classList.toggle("hidden", hasSession);
  $("#btn-logout")?.classList.toggle("hidden", !hasSession);

  // Ocultar SIEMPRE el botón de cerrar sesión dentro de la pestaña "Cuenta"
  const btnLogoutAcc = $("#btn-logout-account");
  if (btnLogoutAcc) btnLogoutAcc.classList.add("hidden");

  // Herramientas admin
  $("#admin-tools")?.classList.toggle("hidden", !isAdmin);

  // 🔹 Mostrar/ocultar la pestaña "Cuenta" en la barra lateral
  const accountBtn = document.querySelector('button[data-nav="account"]');
  if (accountBtn) {
    accountBtn.style.display = hasSession ? "flex" : "none"; // muestra solo si hay sesión
  }

  // 🔹 Mostrar/ocultar mini perfil en sidebar
  const userBox = document.getElementById("sidebar-userbox");
  if (userBox) {
    userBox.style.display = hasSession ? "block" : "none";
  }

  // Refrescar grid (actualiza botones de admin en las cards)
  openWeek(store.currentWeek || 1);
}

async function updateAccountSection(user) {
  if (!user) return;

  $('#account-name-detail').textContent = user.user_metadata?.full_name || 'Sin nombre';
  $('#account-email-detail').textContent = user.email || '—';
  $('#account-provider-detail').textContent = user.app_metadata?.provider || '—';
  $('#account-last-login').textContent = new Date(user.last_sign_in_at).toLocaleString();
  $('#account-role').textContent = user.email === 'admin@upla.edu' ? 'Administrador' : 'Usuario registrado';
}

if (supabase && supabase.auth) {
  supabase.auth.onAuthStateChange((_event, session) => {
    store.session = session || null;
    store.userEmail = session?.user?.email || null;
    store.isAdmin = !!store.userEmail && store.userEmail.toLowerCase() === "admin@upla.edu";
    updateAuthUI();
    if (session) populateAccount(session);
    else renderSidebarUser(null);
  });
}

async function sbSignInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname }
  });
  if (error) throw error;
  return data;
}

async function handleUpload(e) {
  e.preventDefault();
  const title = $("#title-input").value.trim();
  const week  = parseInt($("#week-select").value, 10);
  const file  = $("#file-input").files[0];
  if (!title || !week || !file) return alert("Completa título, semana y archivo.");
  try {
    const { error } = await supabase.storage.from(BUCKET).upload(file.name, file, { upsert: true });
    if (error) throw error;
    const items = await fetchManifest();
    const idx = items.findIndex(x => x.name === file.name);
    const item = {
      name: file.name,
      title: title,
      week: week,
      type: extIsImage(file.name) ? "image" : "pdf",
      url: getPublicUrl(file.name)
    };
    if (idx >= 0) items[idx] = item; else items.push(item);
    await saveManifest(items);
    store.repoEntries = items;
    buildWeeksSidebar();
    openWeek(week);
    e.target.reset();
    $("#week-select").value = "";
    alert("Archivo subido correctamente.");
  } catch (err) {
    alert("Error al subir: " + err.message);
  }
}

// ===== Landing / Splash =====
// Clave de preferencia (no volver a mostrar)
const LANDING_KEY = 'landing_seen_v1';

// Muestra/oculta la landing sin romper tu lógica
function showLanding(force = false) {
  const landing = document.getElementById('landing');
  if (!landing) return;

  // Si el usuario ya marcó “no volver a mostrar” y no forzamos, no la mostramos
  if (!force && localStorage.getItem(LANDING_KEY) === '1') {
    landing.classList.add('hidden');
    return;
  }

  landing.classList.remove('hidden');
  landing.classList.remove('fade-out');

  // Botones
  const btnEnter = document.getElementById('btn-enter');
  const remember = document.getElementById('landing-remember');

  if (btnEnter) {
    btnEnter.onclick = () => {
      // Guardar preferencia si el checkbox está marcado
      if (remember && remember.checked) {
        localStorage.setItem(LANDING_KEY, '1');
      }
      // Fade out elegante
      landing.classList.add('fade-out');
      setTimeout(() => {
        landing.classList.add('hidden');
        // Ir a Portafolio (no toca tu sidebar)
        if (typeof showView === 'function') showView('portfolio');
      }, 320);
    };
  }

  // Si añadiste un botón alternativo a Perfil:
  const btnAlt = document.getElementById('btn-enter-alt');
  if (btnAlt) {
    btnAlt.onclick = () => {
      if (remember && remember.checked) {
        localStorage.setItem(LANDING_KEY, '1');
      }
      landing.classList.add('fade-out');
      setTimeout(() => {
        landing.classList.add('hidden');
        if (typeof showView === 'function') showView('profile');
      }, 320);
    };
  }
}

// Lanza la landing al cargar (solo si no se marcó "no volver a mostrar")
document.addEventListener('DOMContentLoaded', () => {
  showLanding(false);
});




document.addEventListener("DOMContentLoaded", async () => {
  ensureWeekOptions($("#week-select"));
  $$("button[data-nav]").forEach(b => b.onclick = () => showView(b.dataset.nav));
  showView("portfolio");

  $("#btn-login")?.addEventListener("click", () => openModal($("#modal-login")));
  $("#btn-logout")?.addEventListener("click", async () => {
    await supabase.auth.signOut();
    updateAuthUI();
  });

  const btnGoogle = document.getElementById('btn-google');
  if (btnGoogle) btnGoogle.addEventListener('click', async () => {
    try { await sbSignInWithGoogle(); } 
    catch (err) { alert('No se pudo iniciar con Google: ' + err.message); }
  });

  $("#login-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#login-user").value.trim();
    const pass  = $("#login-pass").value.trim();
    try {
      await supabase.auth.signInWithPassword({ email, password: pass });
      closeModal($("#modal-login"));
    } catch (err) {
      alert("No se pudo iniciar sesión: " + err.message);
    }
  });

  $$("#modal-login [data-close], #modal-preview [data-close]").forEach(b =>
    b.onclick = (ev) => closeModal(ev.target.closest(".modal-backdrop"))
  );
  $$("#modal-login, #modal-preview").forEach(m =>
    m.onclick = (e) => { if (e.target.classList.contains("modal-backdrop")) closeModal(e.target); }
  );

  $("#upload-form")?.addEventListener("submit", handleUpload);

  await loadRepoManifest();
  buildWeeksSidebar();
  openWeek(1);

  if (supabase && supabase.auth) {
    const { data: { session } } = await supabase.auth.getSession();
    store.session = session || null;
    store.userEmail = session?.user?.email || null;
    store.isAdmin = !!store.userEmail && store.userEmail.toLowerCase() === "admin@upla.edu";
    updateAuthUI();
    if (session) populateAccount(session);
  } else {
    updateAuthUI();
  }
});

