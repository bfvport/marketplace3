import { getSession, loadSidebar, escapeHtml } from "../../assets/js/app.js";

// Helpers (importa app.js si está disponible; si no, usa fallback)
const SESSION_KEY_FALLBACK = "mp_session_v1";

function _fallbackGetSession(){
  try { return JSON.parse(localStorage.getItem(SESSION_KEY_FALLBACK) || "null"); }
  catch { return null; }
}
function _fallbackEscapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#39;");
}
async function _fallbackLoadSidebar({ activeKey, basePath }){
  const host = document.getElementById("sidebar-host");
  if (!host) return;

  try{
    const res = await fetch(`${basePath}sidebar.html`, { cache:"no-store" });
    host.innerHTML = await res.text();

    const s = _fallbackGetSession();
    const activeEl = host.querySelector(`[data-nav="${activeKey}"]`);
    if (activeEl) activeEl.classList.add("active");

    const uEl = host.querySelector("#sb-usuario");
    const rEl = host.querySelector("#sb-rol");
    if (uEl && s?.usuario) uEl.textContent = s.usuario;
    if (rEl && s?.rol) rEl.textContent = s.rol;

    if (s?.rol !== "gerente"){
      host.querySelectorAll("[data-only='gerente']").forEach(el => el.style.display="none");
    }

    // Logout básico (sin tocar app.js)
    const btn = host.querySelector("#btn-logout");
    if (btn){
      btn.addEventListener("click", () => {
        localStorage.removeItem(SESSION_KEY_FALLBACK);
        window.location.href = "/templates/login/login.html";
      });
    }
  }catch(e){
    console.warn("Sidebar no pudo cargarse (fallback):", e);
  }
}

let getSession = _fallbackGetSession;
let loadSidebar = _fallbackLoadSidebar;
let escapeHtml = _fallbackEscapeHtml;

async function ensureAppHelpers(){
  try{
    const mod = await import("../../assets/js/app.js");
    if (typeof mod.getSession === "function") getSession = mod.getSession;
    if (typeof mod.loadSidebar === "function") loadSidebar = mod.loadSidebar;
    if (typeof mod.escapeHtml === "function") escapeHtml = mod.escapeHtml;
  }catch(e){
    // Deja fallback
    console.warn("No pude importar assets/js/app.js, uso fallback:", e);
  }
}

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// Constantes
const TABLA_CUENTAS = "cuentas_facebook";
const TABLA_USUARIOS_ASIGNADO = "usuarios_asignado";
const TABLA_MARKETPLACE_ACTIVIDAD = "marketplace_actividad";
const TABLA_CATEGORIA = "categoria";
const BUCKET_CSV = "categoria_csv";

// Variables de estado
let session = null;
let supabaseClient = null;
let usuarioActual = null;
let cuentasAsignadas = [];
let categoriaAsignada = null;
let etiquetasCategoria = "";
let csvData = [];
let contenidoUsado = new Set();
let contenidoSeleccionado = null;
let cuentaSeleccionada = null;
let publicacionesHoy = 0;

// Utilidades
function log(msg) {
  const el = $("#log");
  const time = new Date().toLocaleTimeString();
  el.innerHTML += `<div>[${time}] ${escapeHtml(msg)}</div>`;
  el.scrollTop = el.scrollHeight;
}

function toastOk(button, text = "✅ Copiado") {
  const originalText = button.textContent;
  button.textContent = text;
  button.style.background = "rgba(34, 197, 94, 0.2)";
  setTimeout(() => {
    button.textContent = originalText;
    button.style.background = "";
  }, 1500);
}

// Funciones de datos
async function waitSupabaseClient(timeoutMs = 2000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (window.supabaseClient) return window.supabaseClient;
    await new Promise(r => setTimeout(r, 50));
  }
  return null;
}

async function cargarInformacionUsuario() {
  try {
    const { data, error } = await supabaseClient
      .from("usuarios")
      .select("*")
      .eq("usuario", session.usuario)
      .single();

    if (error) throw error;

    usuarioActual = data;
    $("#userInfo").innerHTML = `
      <div><strong>Usuario:</strong> ${escapeHtml(usuarioActual.usuario)}</div>
      <div><strong>Rol:</strong> ${escapeHtml(usuarioActual.rol)}</div>
    `;
  } catch (e) {
    log("❌ Error cargando usuario: " + (e?.message || e));
  }
}

async function cargarAsignacionCategoria() {
  try {
    const hoy = new Date().toISOString().split("T")[0];

    const { data, error } = await supabaseClient
      .from(TABLA_USUARIOS_ASIGNADO)
      .select("*")
      .eq("usuario", session.usuario)
      .lte("fecha_desde", hoy)
      .gte("fecha_hasta", hoy)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) throw error;

    const asignacion = (data && data[0]) || null;
    if (!asignacion) {
      $("#categoriaInfo").innerHTML = `<div class="muted">No tenés asignación activa hoy.</div>`;
      return;
    }

    categoriaAsignada = asignacion.categoria;
    $("#categoriaInfo").innerHTML = `
      <div><strong>Categoría asignada:</strong> ${escapeHtml(categoriaAsignada)}</div>
      <div class="muted">MarketDaily: ${escapeHtml(asignacion.marketplace_daily)}</div>
    `;
    $("#metaPublicaciones").textContent = asignacion.marketplace_daily || 0;

    // Cargar datos de categoría
    const { data: cat, error: errCat } = await supabaseClient
      .from(TABLA_CATEGORIA)
      .select("*")
      .eq("nombre", categoriaAsignada)
      .single();

    if (!errCat && cat) {
      etiquetasCategoria = cat.mensaje || "";
      $("#etiquetasInput").value = etiquetasCategoria;
    }
  } catch (e) {
    log("❌ Error cargando asignación: " + (e?.message || e));
  }
}

async function cargarCuentasFacebook() {
  try {
    if (!categoriaAsignada) return;

    const { data, error } = await supabaseClient
      .from(TABLA_CUENTAS)
      .select("*")
      .eq("estado", "disponible")
      .eq("ocupada_por", session.usuario);

    if (error) throw error;

    cuentasAsignadas = data || [];

    // Contar publicaciones de hoy por cuenta
    const hoy = new Date().toISOString().split('T')[0];
    let completadas = 0;

    for (const cuenta of cuentasAsignadas) {
      const { count } = await supabaseClient
        .from(TABLA_MARKETPLACE_ACTIVIDAD)
        .select("*", { count: 'exact', head: true })
        .eq("facebook_account_usada", cuenta.email)
        .gte("created_at", `${hoy}T00:00:00`)
        .lte("created_at", `${hoy}T23:59:59`);

      cuenta.completadas_hoy = count || 0;
      completadas += (count || 0);
    }

    $("#cuentasCount").textContent = cuentasAsignadas.length;
    $("#completadasCount").textContent = completadas;

    renderTablaCuentas();
  } catch (e) {
    log("❌ Error cargando cuentas: " + (e?.message || e));
  }
}

function renderTablaCuentas() {
  const tbody = $("#tablaCuentas tbody");
  tbody.innerHTML = "";

  for (const c of cuentasAsignadas) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(c.email)}</td>
      <td>${escapeHtml(c.nombre || "")}</td>
      <td>${escapeHtml(c.calidad || "")}</td>
      <td>${c.completadas_hoy || 0}</td>
      <td>
        <button class="btn-secondary btn-sm" data-email="${escapeHtml(c.email)}">Usar</button>
      </td>
    `;
    tbody.appendChild(tr);
  }

  // bind botones
  tbody.querySelectorAll("button[data-email]").forEach(btn => {
    btn.addEventListener("click", () => {
      const email = btn.getAttribute("data-email");
      cuentaSeleccionada = cuentasAsignadas.find(x => x.email === email) || null;
      $("#cuentaUsadaInput").value = cuentaSeleccionada?.email || "";
      log(`✅ Cuenta seleccionada: ${email}`);
    });
  });
}

async function cargarHistorialHoy() {
  try {
    const hoy = new Date().toISOString().split("T")[0];

    const { data, error } = await supabaseClient
      .from(TABLA_MARKETPLACE_ACTIVIDAD)
      .select("*")
      .eq("usuario", session.usuario)
      .gte("created_at", `${hoy}T00:00:00`)
      .lte("created_at", `${hoy}T23:59:59`)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const rows = data || [];
    publicacionesHoy = rows.length;
    $("#contadorPublicaciones").textContent = publicacionesHoy;

    const tbody = $("#tablaHistorial tbody");
    tbody.innerHTML = "";

    for (const r of rows) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(new Date(r.created_at).toLocaleTimeString())}</td>
        <td>${escapeHtml(r.facebook_account_usada || "")}</td>
        <td>${escapeHtml(r.titulo || "")}</td>
        <td>${escapeHtml(r.marketplace_link_publicacion || "")}</td>
      `;
      tbody.appendChild(tr);
    }
  } catch (e) {
    log("❌ Error cargando historial: " + (e?.message || e));
  }
}

async function descargarCSVCategoria() {
  try {
    if (!categoriaAsignada) return;

    log("⬇️ Buscando CSV en bucket...");
    const fileName = `${categoriaAsignada}.csv`;

    const { data, error } = await supabaseClient
      .storage
      .from(BUCKET_CSV)
      .download(fileName);

    if (error) throw error;

    const text = await data.text();
    csvData = parseCSV(text);

    $("#csvInfo").innerHTML = `
      <div><strong>CSV:</strong> ${escapeHtml(fileName)}</div>
      <div class="muted">Filas: ${csvData.length}</div>
    `;

    log(`✅ CSV cargado (${csvData.length} filas)`);
    seleccionarContenidoAleatorio();
  } catch (e) {
    log("❌ Error descargando CSV: " + (e?.message || e));
  }
}

function parseCSV(text) {
  // parse simple (sin comillas complejas)
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];

  const headers = lines[0].split(",").map(h => h.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const row = {};
    headers.forEach((h, idx) => row[h] = (cols[idx] ?? "").trim());
    rows.push(row);
  }
  return rows;
}

function seleccionarContenidoAleatorio() {
  if (!csvData.length) {
    log("⚠️ No hay CSV cargado para seleccionar contenido.");
    return;
  }

  // Selecciona fila no usada
  const disponibles = csvData.filter((r, idx) => !contenidoUsado.has(idx));
  if (!disponibles.length) {
    log("⚠️ Ya se usaron todas las filas del CSV.");
    return;
  }

  const pick = disponibles[Math.floor(Math.random() * disponibles.length)];
  const idxPick = csvData.indexOf(pick);

  contenidoSeleccionado = { ...pick, _idx: idxPick };
  contenidoUsado.add(idxPick);

  // Ajustá nombres de columnas del CSV si difieren
  const titulo = pick.titulo || pick.title || "";
  const descripcion = pick.descripcion || pick.description || "";
  const portada = pick.portada || pick.image || pick.imagen || "";

  $("#categoriaUsadaInput").value = categoriaAsignada || "";
  $("#etiquetasUsadasInput").value = etiquetasCategoria || "";
  $("#tituloInput").value = titulo;
  $("#descripcionInput").value = descripcion;

  // Render portadita
  $("#portadaContainer").innerHTML = portada
    ? `<img src="${escapeHtml(portada)}" alt="portada" style="max-width:220px;border-radius:10px;">`
    : `<div class="muted">Sin portada</div>`;

  // Render imágenes fijas si vienen como columnas imagen1/imagen2...
  const imgs = [];
  Object.keys(pick).forEach(k => {
    const kk = k.toLowerCase();
    if (kk.startsWith("imagen") || kk.startsWith("image") || kk.startsWith("foto") || kk.startsWith("pic")) {
      const v = pick[k];
      if (v && /^https?:\/\//i.test(v)) imgs.push(v);
    }
  });

  $("#imagenesFijasContainer").innerHTML = imgs.length
    ? imgs.map(u => `<img src="${escapeHtml(u)}" style="max-width:140px;border-radius:10px;margin:6px;">`).join("")
    : `<div class="muted">Sin imágenes extra</div>`;

  // Stats
  $("#estadisticasContenido").innerHTML = `
    <div class="muted">Fila CSV usada: ${contenidoSeleccionado._idx}</div>
    <div class="muted">Restantes: ${csvData.length - contenidoUsado.size}</div>
  `;

  log("🎲 Contenido seleccionado del CSV");
}

function setupEventListeners() {
  $("#btnCambiarContenido").addEventListener("click", () => {
    seleccionarContenidoAleatorio();
  });

  $("#btnCopiarCategoria").addEventListener("click", async (e) => {
    await navigator.clipboard.writeText($("#categoriaUsadaInput").value || "");
    toastOk(e.target);
  });

  $("#btnCopiarEtiquetas").addEventListener("click", async (e) => {
    await navigator.clipboard.writeText($("#etiquetasUsadasInput").value || "");
    toastOk(e.target);
  });

  $("#btnCopiarTitulo").addEventListener("click", async (e) => {
    await navigator.clipboard.writeText($("#tituloInput").value || "");
    toastOk(e.target);
  });

  $("#btnCopiarDescripcion").addEventListener("click", async (e) => {
    await navigator.clipboard.writeText($("#descripcionInput").value || "");
    toastOk(e.target);
  });

  $("#btnLimpiarFormulario").addEventListener("click", () => {
    $("#marketplaceLinkInput").value = "";
    $("#cuentaUsadaInput").value = "";
    cuentaSeleccionada = null;
    log("🧽 Formulario limpiado");
  });

  $("#btnLimpiarLogs").addEventListener("click", () => {
    $("#log").innerHTML = "";
  });

  $("#btnGuardarPublicacion").addEventListener("click", guardarPublicacion);

  $("#btnDescargarTodasImagenes").addEventListener("click", () => {
    const imgs = Array.from($("#imagenesFijasContainer").querySelectorAll("img")).map(i => i.src);
    if ($("#portadaContainer img")) imgs.unshift($("#portadaContainer img").src);
    if (!imgs.length) return log("⚠️ No hay imágenes para descargar.");

    imgs.forEach((u) => window.open(u, "_blank"));
    log(`🖼️ Abiertas ${imgs.length} imágenes en pestañas`);
  });
}

async function guardarPublicacion() {
  try {
    const link = ($("#marketplaceLinkInput").value || "").trim();
    if (!link) {
      log("⚠️ Pegá el link de la publicación antes de guardar.");
      return;
    }
    if (!cuentaSeleccionada?.email) {
      log("⚠️ Seleccioná una cuenta de Facebook antes de guardar.");
      return;
    }

    const payload = {
      usuario: session.usuario,
      facebook_account_usada: cuentaSeleccionada.email,
      fecha_publicacion: new Date().toISOString(),
      marketplace_link_publicacion: link,

      titulo: ($("#tituloInput").value || "").trim(),
      descripcion: ($("#descripcionInput").value || "").trim(),
      categoria: categoriaAsignada || "",
      etiquetas_usadas: etiquetasCategoria || ""
    };

    const { error } = await supabaseClient
      .from(TABLA_MARKETPLACE_ACTIVIDAD)
      .insert([payload]);

    if (error) throw error;

    log("✅ Publicación guardada en marketplace_actividad");
    $("#marketplaceLinkInput").value = "";

    await cargarCuentasFacebook();
    await cargarHistorialHoy();
  } catch (e) {
    log("❌ Error guardando publicación: " + (e?.message || e));
  }
}

// Inicialización
document.addEventListener("DOMContentLoaded", async () => {
  await ensureAppHelpers();

  // 1) Cargar sesión
  session = getSession();
  if (!session?.usuario) {
    log("❌ No hay sesión activa. Volvé al login.");
    return;
  }

  // 2) Cargar sidebar
  await loadSidebar({ activeKey: "diario", basePath: "../" });

  // 3) Conectar a Supabase
  supabaseClient = await waitSupabaseClient(2000);
  if (!supabaseClient) {
    log("❌ No se pudo conectar con Supabase");
    return;
  }

  log("✅ Supabase client conectado");

  // 4) Configurar eventos
  setupEventListeners();

  // 5) Cargar datos iniciales
  await cargarInformacionUsuario();
  await cargarAsignacionCategoria();
  await cargarCuentasFacebook();
  await cargarHistorialHoy();

  // 6) Intentar cargar CSV automáticamente
  await descargarCSVCategoria();

  log("✅ Sistema de diario listo");
});
