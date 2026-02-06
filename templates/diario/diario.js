import { getSession, loadSidebar, escapeHtml, fmtDateAR } from "../../assets/js/app.js";

const $ = (sel) => document.querySelector(sel);

// ============================
// Constantes
// ============================

// Legacy Facebook (NO SE TOCA, se reutiliza)
const TABLA_CUENTAS_FB = "cuentas_facebook";

// Nuevas (IG/TikTok/etc)
const TABLA_CUENTAS = "cuentas";
const TABLA_CUENTAS_ASIGNADAS = "cuentas_asignadas";

const TABLA_USUARIOS_ASIGNADO = "usuarios_asignado";
const TABLA_MARKETPLACE_ACTIVIDAD = "marketplace_actividad";
const TABLA_CATEGORIA = "categoria";
const BUCKET_CSV = "categoria_csv";

// Drive (única fuente de imágenes/videos ahora)
const DRIVE_URL =
  "https://drive.google.com/drive/u/3/folders/1WEKYsaptpUnGCKOszZOKEAovzL5ld7j7";

// ============================
// Estado
// ============================
let session = null;
let supabaseClient = null;
let usuarioActual = null;

// Unificadas (FB + IG/TikTok)
let cuentasAsignadas = [];

let categoriaAsignada = null;
let etiquetasCategoria = ""; // Etiquetas desde la BD

let csvData = [];
let contenidoUsado = new Set(); // IDs de contenido ya usado
let cuentaSeleccionada = null;
let publicacionesHoy = 0;

// ============================
// Utilidades
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

// ============================
// Supabase client
// ============================
async function waitSupabaseClient(timeoutMs = 2000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (window.supabaseClient) return window.supabaseClient;
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}

// ============================
// Datos usuario
// ============================
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
      <div><strong>Usuario:</strong> ${escapeHtml(data.usuario)}</div>
      <div><strong>Rol:</strong> ${escapeHtml(data.rol || "No especificado")}</div>
      <div><strong>Email:</strong> ${escapeHtml(data.email || "No especificado")}</div>
    `;

    log(`✅ Usuario cargado: ${data.usuario}`);
  } catch (e) {
    log(`❌ Error cargando usuario: ${e.message}`);
  }
}

// ============================
// CUENTAS (FB + IG/TikTok)
// ============================

/**
 * Para NO tocar BD de actividad, usamos SIEMPRE facebook_account_usada como "identificador"
 * - Facebook legacy: email (ej: "foo@bar.com")
 * - Nuevas: "<plataforma>:<id>" (ej: "instagram:12")
 *
 * Así el gerente ve todo en la misma tabla marketplace_actividad sin romper nada.
 */
function makeCuentaIdent(plataforma, id) {
  const p = String(plataforma || "").toLowerCase().trim();
  return `${p}:${String(id)}`;
}

async function cargarCuentasLegacyFacebook() {
  const { data, error } = await supabaseClient
    .from(TABLA_CUENTAS_FB)
    .select("email, ocupada_por, estado")
    .eq("ocupada_por", session.usuario);

  if (error) throw error;

  // Normalizamos al modelo unificado
  return (data || []).map((c) => ({
    // Campos legacy que ya usa el diario.html
    email: c.email,                 // se muestra
    estado: c.estado || "desconocido",

    // Campos unificados
    plataforma: "facebook",
    cuenta_id: null,
    ident: c.email,                 // IMPORTANTÍSIMO: se guarda así en actividad
  }));
}

async function cargarCuentasNuevasAsignadas() {
  // join: cuentas_asignadas -> cuentas
  const { data, error } = await supabaseClient
    .from(TABLA_CUENTAS_ASIGNADAS)
    .select(
      `
      cuenta_id,
      cuentas:cuenta_id (
        id,
        plataforma,
        nombre_visible,
        usuario_handle,
        url,
        activo
      )
    `
    )
    .eq("usuario", session.usuario);

  if (error) throw error;

  return (data || [])
    .map((r) => r.cuentas)
    .filter(Boolean)
    .map((c) => ({
      // Lo mostramos en la columna "email" para no tocar el HTML
      email: c.nombre_visible || c.usuario_handle || `Cuenta ${c.id}`,
      estado: c.activo ? "activa" : "inactiva",

      plataforma: String(c.plataforma || "otra").toLowerCase(),
      cuenta_id: c.id,
      ident: makeCuentaIdent(c.plataforma, c.id),

      handle: c.usuario_handle || null,
      url: c.url || null,
    }));
}

async function contarPublicacionesHoyPorIdent(ident) {
  const hoy = fmtDateAR();

  const { count, error } = await supabaseClient
    .from(TABLA_MARKETPLACE_ACTIVIDAD)
    .select("*", { count: "exact", head: true })
    .eq("facebook_account_usada", ident)
    .gte("fecha_publicacion", hoy + "T00:00:00")
    .lte("fecha_publicacion", hoy + "T23:59:59");

  if (error) throw error;
  return count || 0;
}

async function cargarCuentas() {
  try {
    // 1) FB legacy
    const fb = await cargarCuentasLegacyFacebook();

    // 2) Nuevas (IG/TikTok/etc)
    let nuevas = [];
    try {
      nuevas = await cargarCuentasNuevasAsignadas();
    } catch (e) {
      // Si todavía no existe la tabla o hay permisos, no rompemos el diario.
      log(`⚠️ No pude cargar cuentas nuevas (IG/TikTok): ${e.message}`);
      nuevas = [];
    }

    cuentasAsignadas = [...fb, ...nuevas];

    // Contar publicaciones de hoy por cuenta (usamos ident siempre)
    for (const cuenta of cuentasAsignadas) {
      try {
        cuenta.publicacionesHoy = await contarPublicacionesHoyPorIdent(cuenta.ident);
      } catch (e) {
        cuenta.publicacionesHoy = 0;
      }
    }

    renderTablaCuentas();
    log(`✅ ${cuentasAsignadas.length} cuenta(s) cargada(s) (FB + otras)`);
  } catch (e) {
    log(`❌ Error cargando cuentas: ${e.message}`);
  }
}

// ============================
// Asignación categoría
// ============================
async function cargarAsignacionCategoria() {
  try {
    const hoy = fmtDateAR();

    const { data, error } = await supabaseClient
      .from(TABLA_USUARIOS_ASIGNADO)
      .select("categoria, marketplace_daily, fecha_desde, fecha_hasta")
      .eq("usuario", session.usuario)
      .lte("fecha_desde", hoy)
      .gte("fecha_hasta", hoy)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        log("⚠️ No tenés asignación activa para hoy");
        categoriaAsignada = null;
        $("#categoriaInfo").innerHTML = `<div class="muted">No tenés asignación activa para hoy.</div>`;
        $("#metaPublicaciones").textContent = "0";
        return;
      }
      throw error;
    }

    categoriaAsignada = data;

    // Detalles de categoría (incluye etiquetas)
    const { data: catData, error: catError } = await supabaseClient
      .from(TABLA_CATEGORIA)
      .select("nombre, csv_nombre, etiquetas")
      .eq("nombre", data.categoria)
      .single();

    if (catError) throw catError;

    categoriaAsignada.detalles = catData;
    etiquetasCategoria = catData.etiquetas || "";

    $("#categoriaInfo").innerHTML = `
      <div><strong>Categoría:</strong> ${escapeHtml(data.categoria)}</div>
      <div><strong>Etiquetas:</strong> ${escapeHtml(catData.etiquetas || "Sin etiquetas")}</div>
      <div><strong>Publicaciones diarias por cuenta:</strong> ${data.marketplace_daily}</div>
      <div><strong>Período:</strong> ${new Date(data.fecha_desde).toLocaleDateString("es-AR")} al ${new Date(
      data.fecha_hasta
    ).toLocaleDateString("es-AR")}</div>
    `;

    $("#metaPublicaciones").textContent = String(data.marketplace_daily ?? 0);
    log(`✅ Categoría asignada: ${data.categoria}`);
  } catch (e) {
    log(`❌ Error cargando asignación: ${e.message}`);
  }
}

// ============================
// CSV categoría (compat CSV nuevo 3 columnas)
// ============================
async function cargarCSVDeCategoria() {
  if (!categoriaAsignada?.detalles?.csv_nombre) {
    log("⚠️ No hay CSV asociado a esta categoría");
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

    log(`✅ CSV cargado: ${csvData.length} filas`);
    log(`📊 Contenido usado hoy: ${contenidoUsado.size} de ${csvData.length}`);

    mostrarEstadisticasContenido();
    seleccionarContenidoAutomatico();
  } catch (e) {
    log(`❌ Error cargando CSV: ${e.message}`);
  }
}

function normalizeTags(input) {
  if (Array.isArray(input)) {
    return input.map((s) => String(s).trim()).filter(Boolean);
  }

  const s = String(input || "").trim();
  if (!s) return [];

  return s
    .split(/[,;|]/g)
    .map((t) => t.trim())
    .filter(Boolean);
}

function parseCSV(text) {
  const lines = text.split("\n");
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim());
  const data = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;

    const values = parseCSVLine(lines[i]);
    const row = {};

    for (let j = 0; j < headers.length; j++) {
      let value = values[j] || "";
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      row[headers[j]] = value.trim();
    }

    // ✅ ID por titulo + categoria (CSV nuevo)
    row._id = hashString((row.titulo || "") + "||" + (row.categoria || ""));
    row._index = i - 1;
    row._usado = false;

    data.push(row);
  }

  return data;
}

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

async function identificarContenidoUsado() {
  const hoy = fmtDateAR();

  try {
    // ✅ ahora buscamos por titulo + categoria (no descripcion)
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

      const index = csvData.findIndex((row) => row._id === id);
      if (index !== -1) csvData[index]._usado = true;
    }
  } catch (e) {
    log(`⚠️ Error identificando contenido usado: ${e.message}`);
  }
}

function mostrarEstadisticasContenido() {
  const usado = csvData.filter((row) => row._usado).length;
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

function seleccionarContenidoAutomatico() {
  if (csvData.length === 0) {
    log("⚠️ No hay contenido disponible en el CSV");
    return null;
  }

  const disponibles = csvData.filter((row) => !row._usado);
  if (disponibles.length === 0) {
    log("❌ Ya usaste todo el contenido disponible para hoy");
    return null;
  }

  const randomIndex = Math.floor(Math.random() * disponibles.length);
  const contenido = disponibles[randomIndex];
  contenido._seleccionado = true;

  actualizarContenidoFila(contenido);

  log(`✅ Contenido seleccionado: "${contenido.titulo?.substring(0, 30) || "Sin título"}..."`);
  return contenido;
}

function actualizarContenidoFila(fila) {
  if (!fila) return;

  $("#tituloInput").value = fila.titulo || "";

  // ✅ Descripcion puede NO venir en CSV nuevo
  $("#descripcionInput").value = fila.descripcion || "";

  $("#categoriaInput").value = fila.categoria || "";
  $("#etiquetasInput").value = etiquetasCategoria || "";

  $("#tituloUsadoInput").value = fila.titulo || "";
  $("#descripcionUsadaInput").value = fila.descripcion || ""; // puede quedar ""
  $("#categoriaUsadaInput").value = fila.categoria || "";
  $("#etiquetasUsadasInput").value = etiquetasCategoria || "";
}

async function cargarHistorialHoy() {
  try {
    const hoy = fmtDateAR();

    const { data, error } = await supabaseClient
      .from(TABLA_MARKETPLACE_ACTIVIDAD)
      .select("*")
      .eq("usuario", session.usuario)
      .gte("fecha_publicacion", hoy + "T00:00:00")
      .lte("fecha_publicacion", hoy + "T23:59:59")
      .order("fecha_publicacion", { ascending: false });

    if (error) throw error;

    publicacionesHoy = (data || []).length;
    $("#contadorPublicaciones").textContent = String(publicacionesHoy);

    renderTablaHistorial(data || []);
    log(`✅ Historial cargado: ${publicacionesHoy} publicación(es) hoy`);
  } catch (e) {
    log(`❌ Error cargando historial: ${e.message}`);
  }
}

// ============================
// Render cuentas (sin tocar HTML: usamos "email" como nombre)
// ============================
function renderTablaCuentas() {
  const tbody = $("#tablaCuentas tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (cuentasAsignadas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="muted">No tenés cuentas asignadas</td></tr>`;
    return;
  }

  for (const cuenta of cuentasAsignadas) {
    const tr = document.createElement("tr");

    const tdEmail = document.createElement("td");
    // Mostramos plataforma como pill dentro del mismo td (no tocamos columnas)
    tdEmail.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
        <span class="mono" style="font-weight:800; color:#e5e7eb;">${escapeHtml(cuenta.email)}</span>
        <span class="pill pill-info">${escapeHtml(cuenta.plataforma || "otra")}</span>
      </div>
      ${cuenta.handle ? `<div class="muted mono" style="margin-top:2px;">${escapeHtml(cuenta.handle)}</div>` : ""}
    `;
    tr.appendChild(tdEmail);

    const tdEstado = document.createElement("td");
    const estadoPill = document.createElement("span");
    const isActiva = cuenta.estado === "activa";
    estadoPill.className = `pill ${isActiva ? "pill-success" : "pill-warning"}`;
    estadoPill.textContent = cuenta.estado || "desconocido";
    tdEstado.appendChild(estadoPill);
    tr.appendChild(tdEstado);

    const tdPublicaciones = document.createElement("td");
    const meta = Number(categoriaAsignada?.marketplace_daily || 0);
    const completado = Number(cuenta.publicacionesHoy || 0) >= meta;

    tdPublicaciones.innerHTML = `
      <span style="font-weight:bold; color:${completado ? "#22c55e" : "#f59e0b"}">
        ${cuenta.publicacionesHoy || 0}
      </span>
      <span class="muted">/${meta || "?"}</span>
    `;
    tr.appendChild(tdPublicaciones);

    const tdAcciones = document.createElement("td");
    tdAcciones.className = "actions";

    const btnSeleccionar = document.createElement("button");
    // Selección por ident (estable)
    btnSeleccionar.className = cuentaSeleccionada?.ident === cuenta.ident ? "btn active" : "btn";
    btnSeleccionar.textContent = cuentaSeleccionada?.ident === cuenta.ident ? "✓ Seleccionada" : "Seleccionar";
    btnSeleccionar.onclick = () => seleccionarCuenta(cuenta);
    btnSeleccionar.disabled = completado;

    tdAcciones.appendChild(btnSeleccionar);
    tr.appendChild(tdAcciones);

    tbody.appendChild(tr);
  }
}

// Render historial
function renderTablaHistorial(historial) {
  const tbody = $("#tablaHistorial tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (historial.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="muted">No hay publicaciones hoy</td></tr>`;
    return;
  }

  for (const item of historial) {
    const tr = document.createElement("tr");

    const tdFecha = document.createElement("td");
    const fecha = new Date(item.fecha_publicacion);
    tdFecha.textContent = fecha.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
    tr.appendChild(tdFecha);

    const tdCuenta = document.createElement("td");
    // Acá puede ser email (FB) o "instagram:12"
    tdCuenta.innerHTML = `<span class="mono">${escapeHtml(item.facebook_account_usada || "-")}</span>`;
    tr.appendChild(tdCuenta);

    const tdLink = document.createElement("td");
    if (item.marketplace_link_publicacion) {
      const short = String(item.marketplace_link_publicacion).slice(0, 60);
      tdLink.innerHTML = `<a href="${escapeHtml(
        item.marketplace_link_publicacion
      )}" target="_blank" style="color:#60a5fa;">${escapeHtml(short)}${
        item.marketplace_link_publicacion.length > 60 ? "..." : ""
      }</a>`;
    } else {
      tdLink.textContent = "Sin link";
    }
    tr.appendChild(tdLink);

    const tdAcciones = document.createElement("td");
    tdAcciones.className = "actions";

    const btnCopiar = document.createElement("button");
    btnCopiar.className = "btn2";
    btnCopiar.textContent = "Copiar link";
    btnCopiar.onclick = () => {
      navigator.clipboard.writeText(item.marketplace_link_publicacion || "");
      log("📋 Link copiado al portapapeles");
    };

    tdAcciones.appendChild(btnCopiar);
    tr.appendChild(tdAcciones);

    tbody.appendChild(tr);
  }
}

// Seleccionar cuenta
function seleccionarCuenta(cuenta) {
  cuentaSeleccionada = cuenta;

  renderTablaCuentas();

  $("#contenidoContainer").style.display = "block";

  // Para no tocar HTML, dejamos estos inputs con algo legible
  $("#cuentaUsadaInput").value = cuenta.email;
  $("#cuentaSeleccionadaView").value = cuenta.email;

  // Cargar CSV si no está cargado
  if (csvData.length === 0 && categoriaAsignada) {
    cargarCSVDeCategoria();
  } else if (csvData.length > 0) {
    seleccionarContenidoAutomatico();
  }

  log(`✅ Cuenta seleccionada: ${cuenta.email} (${cuenta.plataforma})`);
}

// Guardar publicación
async function guardarPublicacion() {
  if (!cuentaSeleccionada) {
    log("❌ Seleccioná una cuenta primero");
    return;
  }

  const meta = Number(categoriaAsignada?.marketplace_daily || 0);
  const completado = Number(cuentaSeleccionada.publicacionesHoy || 0) >= meta;
  if (completado) {
    log("❌ Ya completaste las publicaciones diarias para esta cuenta");
    return;
  }

  const link = ($("#marketplaceLinkInput").value || "").trim();
  if (!link) {
    log("❌ El link de Marketplace es obligatorio");
    return;
  }

  const titulo = ($("#tituloUsadoInput").value || "").trim();
  const descripcion = ($("#descripcionUsadaInput").value || "").trim(); // puede quedar ""
  const categoria = ($("#categoriaUsadaInput").value || "").trim();

  // ✅ CSV nuevo: descripcion no es obligatoria
  if (!titulo || !categoria) {
    log("❌ Faltan campos obligatorios (Título y Categoría)");
    return;
  }

  // ✅ Encontrar contenido actual por ID (titulo+categoria)
  const contenidoId = hashString(titulo + "||" + categoria);
  const contenidoActual = csvData.find((row) => row._id === contenidoId);
  if (!contenidoActual) {
    log("❌ No se encontró el contenido actual en el CSV (titulo+categoria)");
    return;
  }

  if (contenidoActual._usado) {
    log("⚠️ Este contenido ya fue usado hoy. Seleccionando nuevo contenido...");
    seleccionarContenidoAutomatico();
    return;
  }

  disable("#btnGuardarPublicacion", true);

  try {
    // Intento 1: etiquetas como array (si la columna es text[])
    let errorInsert = null;

    {
      const { error } = await supabaseClient.from(TABLA_MARKETPLACE_ACTIVIDAD).insert([
        {
          usuario: session.usuario,
          // SIEMPRE guardamos ident acá (email en FB, o instagram:12 en nuevas)
          facebook_account_usada: cuentaSeleccionada.ident,
          fecha_publicacion: new Date().toISOString(), // timestamp real
          marketplace_link_publicacion: link,
          titulo,
          descripcion: descripcion || "",
          categoria,
          etiquetas_usadas: normalizeTags(etiquetasCategoria),
        },
      ]);
      errorInsert = error || null;
    }

    // Intento 2: etiquetas como string (si la columna es text)
    if (errorInsert) {
      const { error } = await supabaseClient.from(TABLA_MARKETPLACE_ACTIVIDAD).insert([
        {
          usuario: session.usuario,
          facebook_account_usada: cuentaSeleccionada.ident,
          fecha_publicacion: new Date().toISOString(),
          marketplace_link_publicacion: link,
          titulo,
          descripcion: descripcion || "",
          categoria,
          etiquetas_usadas: String(etiquetasCategoria || "").trim(),
        },
      ]);
      if (error) throw error;
    }

    contenidoActual._usado = true;
    contenidoUsado.add(contenidoActual._id);

    log("✅ Publicación guardada correctamente (el gerente ya la puede revisar)");
    $("#marketplaceLinkInput").value = "";

    await cargarHistorialHoy();
    await cargarCuentas(); // refresca contadores y estado
    mostrarEstadisticasContenido();

    const nuevo = seleccionarContenidoAutomatico();
    if (!nuevo) log("ℹ️ Ya usaste todo el contenido disponible para hoy");
  } catch (e) {
    log(`❌ Error guardando publicación: ${e.message}`);
    console.error(e);
  } finally {
    disable("#btnGuardarPublicacion", false);
  }
}

// Eventos
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
    $("#marketplaceLinkInput").value = "";
    log("🧹 Link limpiado");
  });
}

// Init
document.addEventListener("DOMContentLoaded", async () => {
  session = getSession();
  if (!session?.usuario) {
    const el = $("#log");
    if (el) el.innerHTML = "❌ No hay sesión activa. Volvé al login.";
    return;
  }

  await loadSidebar({ activeKey: "diario", basePath: "../" });

  supabaseClient = await waitSupabaseClient(2000);
  if (!supabaseClient) {
    log("❌ No se pudo conectar con Supabase");
    return;
  }

  const hoy = fmtDateAR();
  const pill = $("#pill-hoy");
  if (pill) pill.textContent = `Hoy (AR): ${hoy}`;

  const driveFecha = $("#driveFecha");
  if (driveFecha) {
    driveFecha.innerHTML = `Contenido correspondiente al día <strong>${hoy}</strong>`;
  }

  log("✅ Supabase client conectado");
  setupEventListeners();

  await cargarInformacionUsuario();
  await cargarAsignacionCategoria();
  await cargarCuentas();        // ✅ ahora trae FB + IG/TikTok
  await cargarHistorialHoy();

  log("✅ Sistema de diario listo (FB + IG/TikTok)");
});
