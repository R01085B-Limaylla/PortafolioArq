/* =========================
   Portafolio – script.js
   (Supabase + Sidebar Semanas + CRUD admin)
   ========================= */

/* ---------- Guards (evita doble carga) ---------- */
if (window.__PORTFOLIO_SCRIPT_LOADED__) {
  console.info("script.js ya estaba cargado.");
} else {
  window.__PORTFOLIO_SCRIPT_LOADED__ = true;

  /* ---------- Supabase client (debe existir en window) ---------- */
  const supabase = window.supabase;
  if (!supabase) {
    console.warn("Supabase client no detectado. Revisa el <script type='module'> del index.html.");
  }

  /* ---------- Estado ---------- */
  const store = {
    repoEntries: [],
    isAdmin: false,
    currentWeek: 1
  };
  window.store = store;

  /* ---------- Utils ---------- */
  const $  = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const openModal  = el => el && (el.style.display = "flex");
  const closeModal = el => el && (el.style.display = "none");

  function ensureWeekOptions(sel){
    if (!sel) return;
    sel.innerHTML =
      '<option value="" disabled selected>Semana…</option>' +
      Array.from({length:16}, (_,i) => `<option value="${i+1}">Semana ${i+1}</option>`).join('');
  }

  /* ---------- Navegación entre vistas ---------- */
  function showView(name){
    const vp = $("#view-portfolio");
    const vf = $("#view-profile");
    if (vp && vf) {
      vp.classList.toggle("hidden", name !== "portfolio");
      vf.classList.toggle("hidden", name !== "profile");
    }

    // marcar activo en el menú lateral
    $$("button[data-nav]").forEach(b => {
      const active = b.dataset.nav === name;
      b.classList.toggle("active", active);
      if (active) b.setAttribute("aria-current","page");
      else b.removeAttribute("aria-current");
    });

    // sidebar 2 solo en Portafolio
    toggleSecondSidebar(name === "portfolio");

    // abrir semana al entrar a Portafolio
    if (name === "portfolio") openWeek(store.currentWeek || 1);
  }
  window.showView = showView;

  /* ---------- Sidebar 2 (Semanas) ---------- */
  function toggleSecondSidebar(show) {
    const sb2  = $("#sidebar-weeks");
    const main = $("#app-main");
    if (!sb2 || !main) return;
    sb2.classList.toggle("show", !!show);
    sb2.style.display = show ? "flex" : "none";
    main.classList.toggle("with-sidebar-2", !!show);
  }

  function buildWeeksSidebar(){
    const nav = $("#weeks-nav");
    if (!nav) return;
    nav.innerHTML = "";
    for (let w = 1; w <= 16; w++){
      const count = store.repoEntries.filter(e => +e.week === w).length;
      const btn = document.createElement("button");
      btn.className = "wk";
      btn.dataset.week = String(w);
      btn.innerHTML = `
        <span class="pill">${w}</span>
        <span>Semana ${w}</span>
        <span style="margin-left:auto; font-size:.75rem; color:#a9b6dc;">${count}</span>
      `;
      btn.addEventListener("click", () => {
        $$("#weeks-nav .wk").forEach(b => b.classList.toggle("active", b === btn));
        openWeek(w);
      });
      if (w === (store.currentWeek || 1)) btn.classList.add("active");
      nav.appendChild(btn);
    }
  }

  /* ---------- Thumbnails ---------- */
  async function renderPdfThumb(url, imgEl){
    try {
      const pdf = await pdfjsLib.getDocument({ url }).promise;
      const page = await pdf.getPage(1);
      const vp = page.getViewport({ scale: 1.0 });
      const scale = Math.min(640 / vp.width, 1.5);
      const v = page.getViewport({ scale });
      const c = document.createElement("canvas");
      c.width = v.width; c.height = v.height;
      await page.render({ canvasContext: c.getContext("2d", {alpha:false}), viewport: v }).promise;
      imgEl.src = c.toDataURL("image/png");
      imgEl.classList.remove("hidden");
    } catch(e) {
      // deja el ícono PDF
    }
  }

  /* ---------- Cards ---------- */
  function getPublicUrl(name){
    const { data } = supabase.storage.from("uploads").getPublicUrl(name);
    return data?.publicUrl || "";
  }

  function createCard(item){
    const tpl  = $("#card-template");
    const node = tpl.content.firstElementChild.cloneNode(true);
    const img      = $("[data-role=thumb]", node);
    const pdfCover = $("[data-role=pdfcover]", node);
    const titleEl  = $("[data-role=title]", node);
    const metaEl   = $("[data-role=meta]", node);
    const btnPrev  = $("[data-action=preview]", node);
    const aDown    = $("[data-role=download]", node);

    titleEl.textContent = item.title || item.name;
    metaEl.textContent  = `${item.type.toUpperCase()} · Semana ${item.week}`;
    aDown.href = item.url;
    aDown.download = item.name;

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

    // --- Botones Admin (junto a Ver/Descargar)
    if (store.isAdmin) {
      const actionsEl = node.querySelector(".flex.items-start.justify-between .flex.items-center.gap-1")
                      || node.querySelector(".flex.items-center.gap-1");
      if (actionsEl) {
        actionsEl.style.flexWrap = "wrap";
        const editBtn = document.createElement("button");
        editBtn.textContent = "Editar";
        editBtn.dataset.action = "edit";
        editBtn.className = "btn btn-ghost px-2 py-1 text-xs";
        editBtn.onclick = () => editEntry(item);

        const delBtn = document.createElement("button");
        delBtn.textContent = "Eliminar";
        delBtn.dataset.action = "delete";
        delBtn.className = "btn btn-ghost px-2 py-1 text-xs";
        delBtn.onclick = () => deleteEntry(item);

        actionsEl.appendChild(editBtn);
        actionsEl.appendChild(delBtn);
      }
      node.style.overflow = "hidden";
    }

    return node;
  }

  /* ---------- CRUD (editar / eliminar) solo Admin ---------- */
  async function editEntry(item){
    const nuevoTitulo = prompt("Nuevo título:", item.title || item.name);
    if (nuevoTitulo === null) return;

    let nuevaSemana = prompt("Nueva semana (1-16):", item.week);
    if (nuevaSemana === null) return;
    nuevaSemana = parseInt(nuevaSemana, 10);
    if (!(nuevaSemana >= 1 && nuevaSemana <= 16)) {
      alert("Semana inválida. Debe ser 1 a 16.");
      return;
    }

    const ref = store.repoEntries.find(x => x.name === item.name);
    if (ref) {
      ref.title = (nuevoTitulo.trim() || ref.title);
      ref.week  = nuevaSemana;
    }

    buildWeeksSidebar();
    openWeek(store.currentWeek || 1);
    alert("Elemento actualizado (nota: para persistir cambios usa una tabla en Supabase).");
  }

  async function deleteEntry(item){
    if (!confirm(`¿Eliminar "${item.title || item.name}"?`)) return;
    try {
      const { error } = await supabase.storage.from("uploads").remove([item.name]);
      if (error) throw error;

      store.repoEntries = store.repoEntries.filter(x => x.name !== item.name);
      buildWeeksSidebar();
      openWeek(store.currentWeek || 1);
      alert("Eliminado correctamente.");
    } catch(err) {
      alert("No se pudo eliminar: " + err.message);
    }
  }

  /* ---------- Grid central ---------- */
  function renderWeekGrid(week){
    const grid = $("#files-grid");
    if (!grid) return;
    grid.innerHTML = "";

    const items = store.repoEntries
      .filter(e => +e.week === +week)
      .sort((a, b) => (a.title || a.name).localeCompare(b.title || b.name));

    if (!items.length){
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "No hay archivos en esta semana.";
      grid.appendChild(empty);
      return;
    }
    items.forEach(it => grid.appendChild(createCard(it)));
  }

  function openWeek(w){
    store.currentWeek = w;
    renderWeekGrid(w);
  }
  window.openWeek = openWeek;

  /* ---------- Carga de Storage (listado) ---------- */
  async function loadRepoManifest(){
    if (!supabase) return;
    try {
      const { data, error } = await supabase.storage.from("uploads").list("", { limit: 100 });
      if (error) throw error;

      const items = [];
      for (const it of data) {
        const ext  = (it.name.split(".").pop() || "").toLowerCase();
        const type = ["jpg","jpeg","png","gif","webp","bmp","svg","avif","heic"].includes(ext) ? "image" : "pdf";

        const baseName = it.name.replace(/\.[^.]+$/, "");
        const { data:pub } = supabase.storage.from("uploads").getPublicUrl(it.name);
        const url = pub?.publicUrl || "";

        items.push({
          title: baseName,
          name: it.name,
          week: 1,
          type,
          url
        });
      }
      store.repoEntries = items;
    } catch (e) {
      console.error("Error cargando manifest:", e);
    }
  }

  /* ---------- Auth ---------- */
  function isAdminEmail(email){
    return email && email.toLowerCase() === "admin@upla.edu";
  }

  function refreshUIAfterAuthChange(){
    store.isAdmin = !!store.isAdmin;
    const adminTools = $("#admin-tools");
    if (adminTools) adminTools.classList.toggle("hidden", !store.isAdmin);

    const btnLogin  = $("#btn-login");
    const btnLogout = $("#btn-logout");
    if (btnLogin)  btnLogin.classList.toggle("hidden",  store.isAdmin);
    if (btnLogout) btnLogout.classList.toggle("hidden", !store.isAdmin);

    buildWeeksSidebar();
    openWeek(store.currentWeek || 1);
  }

  if (supabase && supabase.auth) {
    supabase.auth.onAuthStateChange((_event, session) => {
      const email = session?.user?.email || null;
      store.isAdmin = isAdminEmail(email);
      refreshUIAfterAuthChange();
    });
  }

  /* ---------- Eventos DOM ---------- */
  document.addEventListener("DOMContentLoaded", async () => {
    $$("button[data-nav]").forEach(b => b.onclick = () => showView(b.dataset.nav));
    showView("portfolio");

    ensureWeekOptions($("#week-select"));

    const btnLogin  = $("#btn-login");
    const btnLogout = $("#btn-logout");
    const loginForm = $("#login-form");

    if (btnLogin)  btnLogin.onclick  = () => openModal($("#modal-login"));
    if (btnLogout) btnLogout.onclick = async () => {
      await supabase.auth.signOut();
    };

    if (loginForm) {
      loginForm.onsubmit = async (e) => {
        e.preventDefault();
        const email = $("#login-user").value.trim();
        const pass  = $("#login-pass").value.trim();
        try {
          await supabase.auth.signInWithPassword({ email, password: pass });
          closeModal($("#modal-login"));
        } catch (err) {
          alert("No se pudo iniciar sesión: " + err.message);
        }
      };
    }

    $$("#modal-login [data-close], #modal-preview [data-close]").forEach(b => {
      b.onclick = (ev) => closeModal(ev.target.closest(".modal-backdrop"));
    });
    $$("#modal-login, #modal-preview").forEach(m => {
      m.onclick = (e) => { if (e.target.classList.contains("modal-backdrop")) closeModal(e.target); };
    });

    await loadRepoManifest();
    buildWeeksSidebar();
    openWeek(1);
  });

  /* ---------- Subida de archivos (Storage) ---------- */
  document.addEventListener("DOMContentLoaded", () => {
    const form = $("#upload-form");
    if (!form) return;

    form.onsubmit = async (e) => {
      e.preventDefault();
      const title = $("#title-input").value.trim();
      const week  = $("#week-select").value;
      const file  = $("#file-input").files[0];
      if (!file || !week) {
        alert("Completa semana y selecciona un archivo.");
        return;
      }
      try {
        const { error } = await supabase.storage.from("uploads").upload(file.name, file, { upsert: true });
        if (error) throw error;

        const { data:pub } = supabase.storage.from("uploads").getPublicUrl(file.name);
        const url = pub?.publicUrl || "";

        const baseName  = file.name.replace(/\.[^.]+$/, "");
        const safeTitle = title || baseName;

        store.repoEntries.push({
          title: safeTitle,
          week: +week,
          type: file.type.startsWith("image/") ? "image" : "pdf",
          name: file.name,
          url
        });

        buildWeeksSidebar();
        openWeek(+week);

        form.reset();
        $("#week-select").value = "";
        alert("Archivo subido correctamente.");
      } catch (err) {
        alert("Error subiendo archivo: " + err.message);
      }
    };
  });

} // end guard



