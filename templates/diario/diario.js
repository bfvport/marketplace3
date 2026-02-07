import { getSession, loadSidebar, escapeHtml, fmtDateAR } from "../../assets/js/app.js";

const $ = (sel) => document.querySelector(sel);

// ============================
// Tablas
// ============================
const TABLA_CUENTAS_FB = "cuentas_facebook";        // legacy
const TABLA_CUENTAS = "cuentas";                   // nuevas (tiktok/ig/etc)
const TABLA_CUENTAS_ASIGNADAS = "cuentas_asignadas";
const TABLA_USUARIOS_ASIGNADO = "usuarios_asignado";
const TABLA_MARKETPLACE_ACTIVIDAD = "marketplace_actividad";
const TABLA_CATEGORIA = "categoria";
const BUCKET_CSV = "categoria_csv";

const DRIVE_URL =
  "https://drive.google.com/drive/u/3/folders/1WEKYsaptpUnGCKOszZOKEAovzL5ld7j7";

// ============================
// Estado
// ============================
let session = null;
let supabaseClient = null;

let usuarioActual = null;
let categoriaAsignada = null;
let etiquetasCategoria = "";

let cuentasAsignadas = [];     // FB + nuevas (solo asignadas al operador)
let cuentaSeleccionada = null;

let csvData = [];
let contenidoUsado = new Set();

// ============================
// Helpers
// ============================
function log(msg) {
  const el = $("#log");
  if (!el) return;
  const t = new Date().toTimeString().slice(0, 8);
  el.innerHTML += `[${t}] ${escapeHtml(msg)}<br>`;
  el.scrollTop = el.scrollHeight;
}

function disable(sel, v) {
  const el = $(sel);
  if (el) el.disabled = !!v;
}

function showCopiedFeedback(button) {
  const originalText = button.textContent;
  button.textContent = "✓ Copiado";
  button.style.background = "rgba(34, 197, 94, 0.2)";
  setTimeout(() => {
    button.textContent = originalText;
    button.style.background = "";
  }, 1200);
}

async function waitSupabaseClient(timeoutMs = 2500) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (window.supabaseClient) return window.supabaseClient;
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}

function getPlataforma() {
  return String($("#plataformaSel")?.value || "marketplace").toLowerCase();
}
function getTipoFb() {
  return String($("#tipoSel")?.value || "").toLowerCase();
}

function syncTipoUI() {
  const plat = getPlataforma();
  const tipoSel = $("#tipoSel");
  if (!tipoSel) return;
  tipoSel.disabled = plat !== "facebook";
  if (plat !== "facebook") tipoSel.value = "";
}

function makeCuentaIdent(plataforma, id) {
  return `${String(plataforma || "").toLowerCase()}:${String(id)}`;
}

// Marketplace lo operan desde cuentas Facebook (como venís usando)
function cuentasVisiblesSegunPlataforma() {
  const plat = getPlataforma();

  if (plat === "tiktok") return cuentasAsignadas.filter((c) => c.plataforma === "tiktok");
  if (plat === "facebook") return cuentasAsignadas.filter((c) => c.plataforma === "facebook");

  // marketplace: usa cuentas facebook
  return cuentasAsignadas.filter((c) => c.plataforma === "facebook");
}

// ============================
// Usuario
// ============================
async function cargarUsuario() {
  const { data, error } = await supabaseClient
    .from("usuarios")
    .select("*")
    .eq("usuario", session.usuario)
    .single();

  if (error) throw error;
  usuarioActual = data;

  $("#userInfo").innerHTML = `
    <div><strong>Usuario:</strong> ${escapeHtml(data.usuario)}</div>
    <div><strong>Rol:</strong> ${escapeHtml(data.rol || "No especificado")}</div>
    <div><strong>Email:</strong> ${escapeHtml(data.email || "No especificado")}</div>
  `;

  log(`✅ Usuario cargado: ${data.usuario}`);
}

// ============================
// Asignación categoría y metas
// ============================
function metaPorCuenta() {
  if (!categoriaAsignada) return 0;
  const plat = getPlataforma();
  const tipo = getTipoFb();

  if (plat === "marketplace") return Number(categoriaAsignada.marketplace_daily || 0);
  if (plat === "tiktok") return Number(categoriaAsignada.tiktok_daily || 0);

  if (plat === "facebook") {
    if (tipo === "muro") return Number(categoriaAsignada.muro_daily || 0);
    if (tipo === "grupo") return Number(categoriaAsignada.grupo_daily || 0);
    if (tipo === "historia") return Number(categoriaAsignada.historia_daily || 0);
    if (tipo === "reel") return Number(categoriaAsignada.reels_daily || 0);
    return 0;
  }
  return 0;
}

async function contarHechasHoyFiltro() {
  const hoy = fmtDateAR();
  const plat = getPlataforma();
  const tipo = getTipoFb();

  let q = supabaseClient
    .from(TABLA_MARKETPLACE_ACTIVIDAD)
    .select("*", { count: "exact", head: true })
    .eq("usuario", session.usuario)
    .gte("fecha_publicacion", hoy + "T00:00:00")
    .lte("fecha_publicacion", hoy + "T23:59:59")
    .eq("plataforma", plat);

  if (plat === "facebook") q = q.eq("tipo_rrss", tipo || "");

  const { count, error } = await q;
  if (error) throw error;
  return count || 0;
}

async function actualizarPills() {
  const visibles = cuentasVisiblesSegunPlataforma();
  const meta = metaPorCuenta();
  const metaTotal = meta * (visibles.length || 0);

  let hechas = 0;
  try {
    // si no hay tipo en facebook, evitamos contar para no mentir
    if (getPlataforma() !== "facebook" || getTipoFb()) {
      hechas = await contarHechasHoyFiltro();
    }
  } catch {
    hechas = 0;
  }

  const pendientes = Math.max(0, metaTotal - hechas);

  $("#metaTotalDia").textContent = String(metaTotal);
  $("#contadorPublicaciones").textContent = String(hechas);
  $("#pendientesHoy").textContent = String(pendientes);

  const det = $("#pillsDetalle");
  if (det && categoriaAsignada) {
    det.innerHTML = `
      <span class="pill pill-info">Marketplace/cuenta: <strong>${Number(categoriaAsignada.marketplace_daily || 0)}</strong></span>
      <span class="pill pill-info">TikTok/cuenta: <strong>${Number(categoriaAsignada.tiktok_daily || 0)}</strong></span>
      <span class="pill pill-info">FB muro: <strong>${Number(categoriaAsignada.muro_daily || 0)}</strong></span>
      <span class="pill pill-info">FB grupo: <strong>${Number(categoriaAsignada.grupo_daily || 0)}</strong></span>
      <span class="pill pill-info">FB historia: <strong>${Number(categoriaAsignada.historia_daily || 0)}</strong></span>
      <span class="pill pill-info">FB reel: <strong>${Number(categoriaAsignada.reels_daily || 0)}</strong></span>
    `;
  }
}

async function cargarAsignacionCategoria() {
  const hoy = fmtDateAR();

  const { data, error } = await supabaseClient
    .from(TABLA_USUARIOS_ASIGNADO)
    .select("categoria, fecha_desde, fecha_hasta, marketplace_daily, tiktok_daily, muro_daily, grupo_daily, historia_daily, reels_daily")
    .eq("usuario", session.usuario)
    .lte("fecha_desde", hoy)
    .gte("fecha_hasta", hoy)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      categoriaAsignada = null;
      $("#categoriaInfo").innerHTML = `<div class="muted">No tenés asignación activa para hoy.</div>`;
      await actualizarPills();
      return;
    }
    throw error;
  }

  categoriaAsignada = data;

  const { data: cat, error: catError } = await supabaseClient
    .from(TABLA_CATEGORIA)
    .select("nombre, csv_nombre, etiquetas")
    .eq("nombre", data.categoria)
    .single();

  if (catError) throw catError;

  categoriaAsignada.detalles = cat;
  etiquetasCategoria = cat.etiquetas || "";

  $("#categoriaInfo").innerHTML = `
    <div><strong>Categoría:</strong> ${escapeHtml(data.categoria)}</div>
    <div><strong>Etiquetas:</strong> ${escapeHtml(cat.etiquetas || "Sin etiquetas")}</div>
    <div><strong>Período:</strong> ${new Date(data.fecha_desde).toLocaleDateString("es-AR")} al ${new Date(data.fecha_hasta).toLocaleDateString("es-AR")}</div>
  `;

  log(`✅ Asignación activa: ${data.categoria}`);
  await actualizarPills();
}

// ============================
// Cuentas (solo las asignadas al operador)
// ============================
async function fetchFacebookAsignadas() {
  let q = supabaseClient
    .from(TABLA_CUENTAS_FB)
    .select("email, estado, ocupada_por")
    .eq("ocupada_por", session.usuario);

  const { data, error } = await q;
  if (error) throw error;

  return (data || []).map((c) => ({
    plataforma: "facebook",
    nombre: c.email,
    estado: c.estado || "desconocido",
    ident: c.email,       // legacy: se guarda así
    cuenta_id: null,
  }));
}

async function fetchNuevasAsignadas() {
  const { data, error } = await supabaseClient
    .from(TABLA_CUENTAS_ASIGNADAS)
    .select(`
      usuario,
      cuenta_id,
      cuentas:cuenta_id (
        id, plataforma, nombre, handle, url, activo
      )
    `)
    .eq("usuario", session.usuario);

  if (error) throw error;

  return (data || [])
    .map((r) => r.cuentas)
    .filter(Boolean)
    .map((c) => ({
      plataforma: String(c.plataforma || "otra").toLowerCase(),
      nombre: c.nombre || c.handle || `Cuenta ${c.id}`,
      estado: c.activo ? "activa" : "inactiva",
      ident: makeCuentaIdent(c.plataforma, c.id),
      cuenta_id: c.id,
      handle: c.handle || "",
      url: c.url || "",
    }));
}

async function contarPorCuentaHoy(ident) {
  const hoy = fmtDateAR();
  const plat = getPlataforma();
  const tipo = getTipoFb();

  let q = supabaseClient
    .from(TABLA_MARKETPLACE_ACTIVIDAD)
    .select("*", { count: "exact", head: true })
    .eq("usuario", session.usuario)
    .eq("facebook_account_usada", ident)
    .eq("plataforma", plat)
    .gte("fecha_publicacion", hoy + "T00:00:00")
    .lte("fecha_publicacion", hoy + "T23:59:59");

  if (plat === "facebook") q = q.eq("tipo_rrss", tipo || "");

  const { count, error } = await q;
  if (error) throw error;
  return count || 0;
}

async function cargarCuentas() {
  try {
    const fb = await fetchFacebookAsignadas();

    let nuevas = [];
    try {
      nuevas = await fetchNuevasAsignadas();
    } catch (e) {
      log(`⚠️ No pude cargar cuentas nuevas: ${e.message}`);
      nuevas = [];
    }

    cuentasAsignadas = [...fb, ...nuevas];

    const visibles = cuentasVisiblesSegunPlataforma();
    for (const c of visibles) {
      try {
        c.hoy = await contarPorCuentaHoy(c.ident);
      } catch {
        c.hoy = 0;
      }
    }

    renderTablaCuentas();
    await actualizarPills();

    log(`✅ Cuentas cargadas: ${cuentasVisiblesSegunPlataforma().length} visibles`);
  } catch (e) {
    log(`❌ Error cargando cuentas: ${e.message}`);
  }
}

function renderTablaCuentas() {
  const tbody = $("#tablaCuentas tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const visibles = cuentasVisiblesSegunPlataforma();
  const meta = metaPorCuenta();

  if (visibles.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="muted">No hay cuentas asignadas para esta plataforma</td></tr>`;
    return;
  }

  for (const cuenta of visibles) {
    const completado = meta > 0 && Number(cuenta.hoy || 0) >= meta;

    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>
        <div style="display:flex; flex-direction:column; gap:4px;">
          <strong>${escapeHtml(cuenta.nombre)}</strong>
          ${cuenta.handle ? `<span class="muted mono">${escapeHtml(cuenta.handle)}</span>` : ""}
        </div>
      </td>
      <td><span class="pill pill-info">${escapeHtml(cuenta.plataforma)}</span></td>
      <td>
        <strong style="color:${completado ? "#22c55e" : "#f59e0b"}">${Number(cuenta.hoy || 0)}</strong>
        <span class="muted">/${meta || "?"}</span>
      </td>
      <td style="text-align:right;">
        <button class="btn2" ${completado ? "disabled" : ""} data-ident="${escapeHtml(cuenta.ident)}">
          ${cuentaSeleccionada?.ident === cuenta.ident ? "✓ Seleccionada" : "Seleccionar"}
        </button>
      </td>
    `;

    tr.querySelector("button")?.addEventListener("click", () => seleccionarCuenta(cuenta));

    tbody.appendChild(tr);
  }
}

function seleccionarCuenta(cuenta) {
  cuentaSeleccionada = cuenta;

  $("#cuentaSeleccionadaView").value = cuenta.nombre;
  $("#contenidoContainer").style.display = "block";

  // hidden para insertar
  $("#cuentaUsadaInput").value = cuenta.ident;

  // cargar CSV si no está
  if (csvData.length === 0 && categoriaAsignada) cargarCSVDeCategoria();
  else if (csvData.length > 0) seleccionarContenidoAutomatico();

  renderTablaCuentas();
  log(`✅ Cuenta seleccionada: ${cuenta.nombre}`);
}

// ============================
// CSV (titulo/categoria/etiquetas)
// ============================
function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') inQuotes = !inQuotes;
    else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else current += char;
  }
  result.push(current);
  return result;
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString();
}

function parseCSV(text) {
  const lines = text.split("\n").filter((l) => l.trim().length);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim());
  const data = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      let value = values[j] || "";
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      row[headers[j]] = value.trim();
    }

    row._id = hashString((row.titulo || "") + "||" + (row.categoria || ""));
    row._usado = false;
    data.push(row);
  }

  return data;
}

async function identificarContenidoUsado() {
  const hoy = fmtDateAR();

  const { data, error } = await supabaseClient
    .from(TABLA_MARKETPLACE_ACTIVIDAD)
    .select("titulo, categoria")
    .eq("usuario", session.usuario)
    .gte("fecha_publicacion", hoy + "T00:00:00")
    .lte("fecha_publicacion", hoy + "T23:59:59");

  if (error) throw error;

  contenidoUsado.clear();
  for (const item of data || []) {
    const id = hashString((item.titulo || "") + "||" + (item.categoria || ""));
    contenidoUsado.add(id);
  }
}

function mostrarEstadisticasContenido() {
  const usado = csvData.filter((r) => contenidoUsado.has(r._id)).length;
  const total = csvData.length;
  const disponible = total - usado;

  $("#csvInfo").innerHTML = `
    <div style="display:flex; gap:15px; margin-top:5px; flex-wrap:wrap;">
      <span class="pill pill-success">Disponible: ${disponible}</span>
      <span class="pill pill-warning">Usado hoy: ${usado}</span>
      <span class="pill pill-info">Total: ${total}</span>
    </div>
  `;
}

function actualizarContenidoFila(fila) {
  $("#tituloInput").value = fila.titulo || "";
  $("#descripcionInput").value = fila.descripcion || "";
  $("#categoriaInput").value = fila.categoria || "";

  // etiquetas: mezcla categoria + csv si existe columna etiquetas
  const csvTags = String(fila.etiquetas || "").trim();
  const mix = [etiquetasCategoria, csvTags].filter(Boolean).join(", ");
  $("#etiquetasInput").value = mix;

  // hidden
  $("#tituloUsadoInput").value = fila.titulo || "";
  $("#descripcionUsadaInput").value = fila.descripcion || "";
  $("#categoriaUsadaInput").value = fila.categoria || "";
  $("#etiquetasUsadasInput").value = mix;
}

function seleccionarContenidoAutomatico() {
  if (!csvData.length) return null;

  const disponibles = csvData.filter((r) => !contenidoUsado.has(r._id));
  if (!disponibles.length) {
    log("❌ Ya usaste todo el contenido disponible para hoy");
    return null;
  }

  const fila = disponibles[Math.floor(Math.random() * disponibles.length)];
  actualizarContenidoFila(fila);
  log(`✅ Contenido seleccionado: "${(fila.titulo || "").slice(0, 40)}..."`);
  return fila;
}

async function cargarCSVDeCategoria() {
  if (!categoriaAsignada?.detalles?.csv_nombre) {
    log("⚠️ No hay CSV asociado a la categoría");
    return;
  }

  try {
    const path = categoriaAsignada.detalles.csv_nombre;
    log(`📥 Descargando CSV: ${path}`);

    const { data, error } = await supabaseClient.storage.from(BUCKET_CSV).download(path);
    if (error) throw error;

    const text = await data.text();
    csvData = parseCSV(text);

    await identificarContenidoUsado();
    mostrarEstadisticasContenido();
    seleccionarContenidoAutomatico();
  } catch (e) {
    log(`❌ Error cargando CSV: ${e.message}`);
  }
}

// ============================
// Historial
// ============================
async function cargarHistorialHoy() {
  const hoy = fmtDateAR();

  const { data, error } = await supabaseClient
    .from(TABLA_MARKETPLACE_ACTIVIDAD)
    .select("*")
    .eq("usuario", session.usuario)
    .gte("fecha_publicacion", hoy + "T00:00:00")
    .lte("fecha_publicacion", hoy + "T23:59:59")
    .order("fecha_publicacion", { ascending: false });

  if (error) throw error;

  renderTablaHistorial(data || []);
}

function renderTablaHistorial(rows) {
  const tbody = $("#tablaHistorial tbody");
  if (!tbody) return;

  tbody.innerHTML = "";
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="muted">No hay publicaciones hoy</td></tr>`;
    return;
  }

  for (const item of rows) {
    const tr = document.createElement("tr");

    const hora = new Date(item.fecha_publicacion).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });

    // Compat: algunos inserts viejos guardaban el link solo en marketplace_link_publicacion.
    // A partir de ahora guardamos en ambas columnas y leemos de la que exista.
    const linkPub = String(item.link_publicacion || item.marketplace_link_publicacion || "");

    tr.innerHTML = `
      <td>${escapeHtml(hora)}</td>
      <td>${escapeHtml(item.plataforma || "-")}</td>
      <td>${escapeHtml(item.tipo_rrss || "-")}</td>
      <td class="mono">${escapeHtml(item.facebook_account_usada || "-")}</td>
      <td>
        ${
          linkPub
            ? `<a href="${escapeHtml(linkPub)}" target="_blank" style="color:#60a5fa;">${escapeHtml(String(linkPub).slice(0, 60))}${String(linkPub).length > 60 ? "..." : ""}</a>`
            : "Sin link"
        }
      </td>
      <td style="text-align:right;">
        <button class="btn2" data-copy="${escapeHtml(linkPub)}">Copiar link</button>
      </td>
    `;

    tr.querySelector("button")?.addEventListener("click", () => {
      navigator.clipboard.writeText(linkPub);
      log("📋 Link copiado");
    });

    tbody.appendChild(tr);
  }
}

// ============================
// Guardar publicación
// ============================
async function guardarPublicacion() {
  if (!cuentaSeleccionada) {
    log("❌ Seleccioná una cuenta");
    return;
  }

  const plat = getPlataforma();
  const tipo = getTipoFb();

  if (plat === "facebook" && !tipo) {
    log("❌ En Facebook tenés que elegir Tipo RRSS");
    return;
  }

  const link = String($("#linkPublicacionInput")?.value || "").trim();
  if (!link) {
    log("❌ El link es obligatorio");
    return;
  }

  const titulo = String($("#tituloUsadoInput")?.value || "").trim();
  const categoria = String($("#categoriaUsadaInput")?.value || "").trim();
  const descripcion = String($("#descripcionUsadaInput")?.value || "").trim();
  const etiquetas = String($("#etiquetasUsadasInput")?.value || "").trim();

  if (!titulo || !categoria) {
    log("❌ Faltan campos (Título y Categoría)");
    return;
  }

  const idContenido = hashString(titulo + "||" + categoria);
  if (contenidoUsado.has(idContenido)) {
    log("⚠️ Ese contenido ya se usó hoy. Te selecciono otro.");
    seleccionarContenidoAutomatico();
    return;
  }

  disable("#btnGuardarPublicacion", true);

  try {
    const payload = {
      usuario: session.usuario,
      facebook_account_usada: cuentaSeleccionada.ident,
      fecha_publicacion: new Date().toISOString(),
      // Guardamos en ambas columnas para que Verificación + Historial siempre encuentren el link.
      link_publicacion: link,
      marketplace_link_publicacion: link,
      titulo,
      descripcion: descripcion || "",
      categoria,
      etiquetas_usadas: etiquetas,          // texto simple (no array)
      plataforma: plat,
      tipo_rrss: plat === "facebook" ? tipo : null,
    };

    const { error } = await supabaseClient.from(TABLA_MARKETPLACE_ACTIVIDAD).insert([payload]);
    if (error) throw error;

    contenidoUsado.add(idContenido);

    $("#linkPublicacionInput").value = "";
    $("#notaInput").value = "";

    log("✅ Guardado OK");
    await cargarHistorialHoy();
    await cargarCuentas();      // recalcula contadores
    mostrarEstadisticasContenido();
    seleccionarContenidoAutomatico();
  } catch (e) {
    log(`❌ Error guardando: ${e.message}`);
    console.error(e);
  } finally {
    disable("#btnGuardarPublicacion", false);
  }
}

// ============================
// Eventos
// ============================
function setupEventListeners() {
  $("#btnAbrirDrive")?.addEventListener("click", () => window.open(DRIVE_URL, "_blank"));

  $("#btnCopiarTitulo")?.addEventListener("click", () => {
    navigator.clipboard.writeText($("#tituloInput").value || "");
    showCopiedFeedback($("#btnCopiarTitulo"));
  });
  $("#btnCopiarDescripcion")?.addEventListener("click", () => {
    navigator.clipboard.writeText($("#descripcionInput").value || "");
    showCopiedFeedback($("#btnCopiarDescripcion"));
  });
  $("#btnCopiarCategoria")?.addEventListener("click", () => {
    navigator.clipboard.writeText($("#categoriaInput").value || "");
    showCopiedFeedback($("#btnCopiarCategoria"));
  });
  $("#btnCopiarEtiquetas")?.addEventListener("click", () => {
    navigator.clipboard.writeText($("#etiquetasInput").value || "");
    showCopiedFeedback($("#btnCopiarEtiquetas"));
  });

  $("#btnGuardarPublicacion")?.addEventListener("click", guardarPublicacion);

  $("#btnLimpiarFormulario")?.addEventListener("click", () => {
    $("#linkPublicacionInput").value = "";
    $("#notaInput").value = "";
    log("🧹 Limpiado");
  });

  $("#plataformaSel")?.addEventListener("change", async () => {
    syncTipoUI();
    cuentaSeleccionada = null;
    $("#cuentaSeleccionadaView").value = "";
    $("#contenidoContainer").style.display = "none";

    await cargarCuentas();
    await actualizarPills();

    log(`🧭 Plataforma: ${getPlataforma()}`);
  });

  $("#tipoSel")?.addEventListener("change", async () => {
    cuentaSeleccionada = null;
    $("#cuentaSeleccionadaView").value = "";
    $("#contenidoContainer").style.display = "none";

    await cargarCuentas();
    await actualizarPills();

    log(`📌 Tipo FB: ${getTipoFb() || "(no aplica)"}`);
  });
}

// ============================
// Init
// ============================
document.addEventListener("DOMContentLoaded", async () => {
  session = getSession();
  if (!session?.usuario) {
    const el = $("#log");
    if (el) el.innerHTML = "❌ No hay sesión activa. Volvé al login.";
    return;
  }

  await loadSidebar({ activeKey: "diario", basePath: "../" });

  supabaseClient = await waitSupabaseClient(2500);
  if (!supabaseClient) {
    log("❌ No se pudo conectar con Supabase");
    return;
  }

  $("#pill-hoy") && ($("#pill-hoy").textContent = `Hoy (AR): ${fmtDateAR()}`);

  setupEventListeners();
  syncTipoUI();

  try {
    await cargarUsuario();
    await cargarAsignacionCategoria();
    await cargarCuentas();
    await cargarHistorialHoy();
    await actualizarPills();
    log("✅ Diario listo");
  } catch (e) {
    log(`❌ Error init: ${e.message}`);
    console.error(e);
  }
});
