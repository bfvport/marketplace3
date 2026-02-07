import { getSession, loadSidebar, escapeHtml, fmtDateAR } from "../../assets/js/app.js";

const $ = (sel) => document.querySelector(sel);

// ============================
// Constantes (BD)
// ============================

// Facebook legacy (NO SE TOCA)
const TABLA_CUENTAS_FB = "cuentas_facebook";

// Nuevas cuentas (IG/TikTok/etc)
const TABLA_CUENTAS = "cuentas";
const TABLA_CUENTAS_ASIGNADAS = "cuentas_asignadas";

// Asignaciones diarias
const TABLA_USUARIOS_ASIGNADO = "usuarios_asignado";

// Actividad diaria (publicaciones)
const TABLA_MARKETPLACE_ACTIVIDAD = "marketplace_actividad";

// Categorías + CSV
const TABLA_CATEGORIA = "categoria";
const BUCKET_CSV = "categoria_csv";

// Drive
const DRIVE_URL =
  "https://drive.google.com/drive/u/3/folders/1WEKYsaptpUnGCKOszZOKEAovzL5ld7j7";

// ============================
// Estado
// ============================
let session = null;
let supabaseClient = null;
let usuarioActual = null;

let cuentasAsignadas = [];      // FB + IG/TikTok unificadas
let cuentaSeleccionada = null;

let categoriaAsignada = null;   // fila de usuarios_asignado (con dailys)
let etiquetasCategoria = "";    // etiquetas desde categoria

let csvData = [];
let contenidoUsado = new Set();
let publicacionesHoy = 0;

// ============================
// Utilidades UI
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
async function waitSupabaseClient(timeoutMs = 2500) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (window.supabaseClient) return window.supabaseClient;
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}

// ============================
// Selección "Qué estás registrando"
// ============================
function getPlataformaSeleccionada() {
  return String($("#plataformaSel")?.value || "marketplace").toLowerCase();
}

function getTipoSeleccionado() {
  return String($("#tipoSel")?.value || "").toLowerCase();
}

function syncTipoFacebookUI() {
  const plat = getPlataformaSeleccionada();
  const tipoSel = $("#tipoSel");
  if (!tipoSel) return;

  // Solo FB usa tipo_rrss
  const isFB = plat === "facebook";
  tipoSel.disabled = !isFB;

  if (!isFB) tipoSel.value = "";
}

// Meta por cuenta según plataforma/tipo
function getMetaPorCuenta() {
  if (!categoriaAsignada) return 0;

  const plat = getPlataformaSeleccionada();
  const tipo = getTipoSeleccionado();

  // OJO: tu tabla usuarios_asignado (según captura) tiene:
  // marketplace_daily, tiktok_daily, muro_daily, grupo_daily, historia_daily, reels_daily
  if (plat === "marketplace") return Number(categoriaAsignada.marketplace_daily || 0);
  if (plat === "tiktok") return Number(categoriaAsignada.tiktok_daily || 0);

  if (plat === "facebook") {
    if (tipo === "muro") return Number(categoriaAsignada.muro_daily || 0);
    if (tipo === "grupo") return Number(categoriaAsignada.grupo_daily || 0);
    if (tipo === "historia") return Number(categoriaAsignada.historia_daily || 0);
    if (tipo === "reel") return Number(categoriaAsignada.reels_daily || 0);
    // si no eligió tipo, meta 0 para evitar bloquear raro
    return 0;
  }

  return 0;
}

// Meta total del día (meta por cuenta * cantidad de cuentas visibles)
function getMetaTotalDia() {
  const meta = getMetaPorCuenta();
  const cuentasFiltradas = getCuentasVisiblesSegunPlataforma();
  return meta * (cuentasFiltradas.length || 0);
}

function getCuentasVisiblesSegunPlataforma() {
  const plat = getPlataformaSeleccionada();

  // Facebook: solo cuentas plataforma facebook
  if (plat === "facebook") return cuentasAsignadas.filter((c) => c.plataforma === "facebook");

  // TikTok: solo tiktok
  if (plat === "tiktok") return cuentasAsignadas.filter((c) => c.plataforma === "tiktok");

  // Marketplace: se publica en Marketplace desde cuentas FB (por tu flujo real)
  // Si vos querés marketplace con cuentas específicas, se ajusta después.
  return cuentasAsignadas.filter((c) => c.plataforma === "facebook");
}

function actualizarPillsMetas() {
  const metaTotal = getMetaTotalDia();
  const hechas = Number(publicacionesHoy || 0);
  const pendientes = Math.max(0, metaTotal - hechas);

  $("#metaTotalDia") && ($("#metaTotalDia").textContent = String(metaTotal));
  $("#contadorPublicaciones") && ($("#contadorPublicaciones").textContent = String(hechas));
  $("#pendientesHoy") && ($("#pendientesHoy").textContent = String(pendientes));
}

// ============================
// Datos usuario
// ============================
async function cargarInformacionUsuario() {
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
// CUENTAS (FB + IG/TikTok)
// ============================

/**
 * Identificador estable para marketplace_actividad.facebook_account_usada
 * - Facebook legacy: email
 * - Nuevas: "<plataforma>:<id>" (ej: "tiktok:12")
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

  return (data || [])
  .filter((c) => String(c.ocupada_por || "").trim() === String(session.usuario).trim())
  .map((c) => ({
    email: c.email,
    estado: c.estado || "desconocido",
    plataforma: "facebook",
    cuenta_id: null,
    ident: c.email,
  }));

}

async function cargarCuentasNuevasAsignadas() {
  const { data, error } = await supabaseClient
    .from(TABLA_CUENTAS_ASIGNADAS)
    .select(
      `
      cuenta_id,
      cuentas:cuenta_id (
        id,
        plataforma,
        nombre,
        handle,
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
      // usamos email como "nombre visible" para no tocar HTML
      email: c.nombre || c.handle || `Cuenta ${c.id}`,
      estado: c.activo ? "activa" : "inactiva",
      plataforma: String(c.plataforma || "otra").toLowerCase(),
      cuenta_id: c.id,
      ident: makeCuentaIdent(c.plataforma, c.id),
      handle: c.handle || null,
      url: c.url || null,
    }));
}

async function contarPublicacionesHoy(ident, plataforma, tipo_rrss) {
  const hoy = fmtDateAR();

  let q = supabaseClient
    .from(TABLA_MARKETPLACE_ACTIVIDAD)
    .select("*", { count: "exact", head: true })
    .eq("usuario", session.usuario)
    .eq("facebook_account_usada", ident)
    .gte("fecha_publicacion", hoy + "T00:00:00")
    .lte("fecha_publicacion", hoy + "T23:59:59");

  // Filtrar por plataforma/tipo para que las metas cierren bien
  if (plataforma) q = q.eq("plataforma", plataforma);
  if (tipo_rrss) q = q.eq("tipo_rrss", tipo_rrss);

  const { count, error } = await q;
  if (error) throw error;

  return count || 0;
}

async function refrescarContadoresPorCuenta() {
  const plat = getPlataformaSeleccionada();
  const tipo = getTipoSeleccionado();

  for (const cuenta of cuentasAsignadas) {
    // Solo contar las cuentas que aplican a la plataforma actual
    // (para evitar mostrar counters raros)
    const aplica =
      (plat === "facebook" && cuenta.plataforma === "facebook") ||
      (plat === "tiktok" && cuenta.plataforma === "tiktok") ||
      (plat === "marketplace" && cuenta.plataforma === "facebook");

    if (!aplica) {
      cuenta.publicacionesHoy = 0;
      continue;
    }

    try {
      const tipoRRSS = plat === "facebook" ? tipo : null;
      cuenta.publicacionesHoy = await contarPublicacionesHoy(cuenta.ident, plat, tipoRRSS);
    } catch (e) {
      cuenta.publicacionesHoy = 0;
    }
  }
}

async function cargarCuentas() {
  try {
    const fb = await cargarCuentasLegacyFacebook();

    let nuevas = [];
    try {
      nuevas = await cargarCuentasNuevasAsignadas();
    } catch (e) {
      log(`⚠️ No pude cargar cuentas nuevas (IG/TikTok): ${e.message}`);
      nuevas = [];
    }

    cuentasAsignadas = [...fb, ...nuevas];

    await refrescarContadoresPorCuenta();
    renderTablaCuentas();

    log(`✅ ${cuentasAsignadas.length} cuenta(s) cargada(s) (FB + otras)`);
  } catch (e) {
    log(`❌ Error cargando cuentas: ${e.message}`);
  }
}

// ============================
// Asignación categoría (ESTA FUNCIÓN ES LA QUE TE FALTABA)
// ============================
async function cargarAsignacionCategoria() {
  try {
    const hoy = fmtDateAR();

    const { data, error } = await supabaseClient
      .from(TABLA_USUARIOS_ASIGNADO)
      .select(
        "categoria, fecha_desde, fecha_hasta, marketplace_daily, tiktok_daily, muro_daily, grupo_daily, historia_daily, reels_daily"
      )
      .eq("usuario", session.usuario)
      .lte("fecha_desde", hoy)
      .gte("fecha_hasta", hoy)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        log("⚠️ No tenés asignación activa para hoy");
        categoriaAsignada = null;
        $("#categoriaInfo").innerHTML = `<div class="muted">No tenés asignación activa para hoy.</div>`;
        actualizarPillsMetas();
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
      <div><strong>Período:</strong> ${new Date(data.fecha_desde).toLocaleDateString("es-AR")} al ${new Date(
      data.fecha_hasta
    ).toLocaleDateString("es-AR")}</div>
    `;

    log(`✅ Categoría asignada: ${data.categoria}`);

    // Pills de meta total / pendientes
    actualizarPillsMetas();
  } catch (e) {
    log(`❌ Error cargando asignación: ${e.message}`);
  }
}

// ============================
// CSV categoría (3 columnas: titulo, categoria, etiquetas)
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

    // ID por titulo + categoria
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

  log(`✅ Contenido seleccionado: "${(contenido.titulo || "").substring(0, 30)}..."`);
  return contenido;
}

function actualizarContenidoFila(fila) {
  if (!fila) return;

  $("#tituloInput").value = fila.titulo || "";
  $("#descripcionInput").value = fila.descripcion || ""; // puede no venir
  $("#categoriaInput").value = fila.categoria || "";
  $("#etiquetasInput").value = etiquetasCategoria || "";

  $("#tituloUsadoInput").value = fila.titulo || "";
  $("#descripcionUsadaInput").value = fila.descripcion || "";
  $("#categoriaUsadaInput").value = fila.categoria || "";
  $("#etiquetasUsadasInput").value = etiquetasCategoria || "";
}

// ============================
// Historial de hoy (con plataforma + tipo)
// ============================
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

    renderTablaHistorial(data || []);
    actualizarPillsMetas();

    log(`✅ Historial cargado: ${publicacionesHoy} publicación(es) hoy`);
  } catch (e) {
    log(`❌ Error cargando historial: ${e.message}`);
  }
}

// ============================
// Render cuentas (según plataforma seleccionada)
// ============================
function renderTablaCuentas() {
  const tbody = $("#tablaCuentas tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  const visibles = getCuentasVisiblesSegunPlataforma();
  const meta = Number(getMetaPorCuenta() || 0);

  if (visibles.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="muted">No tenés cuentas asignadas para esta plataforma</td></tr>`;
    return;
  }

  for (const cuenta of visibles) {
    const tr = document.createElement("tr");

    const tdCuenta = document.createElement("td");
    tdCuenta.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
        <span class="mono" style="font-weight:800; color:#e5e7eb;">${escapeHtml(cuenta.email)}</span>
      </div>
      ${cuenta.handle ? `<div class="muted mono" style="margin-top:2px;">${escapeHtml(cuenta.handle)}</div>` : ""}
    `;
    tr.appendChild(tdCuenta);

    const tdPlat = document.createElement("td");
    tdPlat.innerHTML = `<span class="pill pill-info">${escapeHtml(cuenta.plataforma)}</span>`;
    tr.appendChild(tdPlat);

    const tdHoy = document.createElement("td");
    const completado = meta > 0 && Number(cuenta.publicacionesHoy || 0) >= meta;
    tdHoy.innerHTML = `
      <span style="font-weight:bold; color:${completado ? "#22c55e" : "#f59e0b"}">
        ${cuenta.publicacionesHoy || 0}
      </span>
      <span class="muted">/${meta || "?"}</span>
    `;
    tr.appendChild(tdHoy);

    const tdAcc = document.createElement("td");
    tdAcc.className = "actions";

    const btn = document.createElement("button");
    btn.className = cuentaSeleccionada?.ident === cuenta.ident ? "btn active" : "btn";
    btn.textContent = cuentaSeleccionada?.ident === cuenta.ident ? "✓ Seleccionada" : "Seleccionar";
    btn.onclick = () => seleccionarCuenta(cuenta);
    btn.disabled = completado;

    tdAcc.appendChild(btn);
    tr.appendChild(tdAcc);

    tbody.appendChild(tr);
  }
}

// Render historial con columnas: HORA | PLATAFORMA | TIPO | CUENTA | LINK
function renderTablaHistorial(historial) {
  const tbody = $("#tablaHistorial tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!historial || historial.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="muted">No hay publicaciones hoy</td></tr>`;
    return;
  }

  for (const item of historial) {
    const tr = document.createElement("tr");

    const tdHora = document.createElement("td");
    const fecha = new Date(item.fecha_publicacion);
    tdHora.textContent = fecha.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
    tr.appendChild(tdHora);

    const tdPlat = document.createElement("td");
    tdPlat.innerHTML = `<span class="pill pill-info">${escapeHtml(item.plataforma || "-")}</span>`;
    tr.appendChild(tdPlat);

    const tdTipo = document.createElement("td");
    tdTipo.textContent = item.tipo_rrss || "-";
    tr.appendChild(tdTipo);

    const tdCuenta = document.createElement("td");
    tdCuenta.innerHTML = `<span class="mono">${escapeHtml(item.facebook_account_usada || "-")}</span>`;
    tr.appendChild(tdCuenta);

    const tdLink = document.createElement("td");
    if (item.marketplace_link_publicacion) {
      const url = String(item.marketplace_link_publicacion);
      const short = url.slice(0, 60);
      tdLink.innerHTML = `<a href="${escapeHtml(url)}" target="_blank" style="color:#60a5fa;">${escapeHtml(short)}${
        url.length > 60 ? "..." : ""
      }</a>`;
    } else {
      tdLink.textContent = "Sin link";
    }
    tr.appendChild(tdLink);

    tbody.appendChild(tr);
  }
}

// Seleccionar cuenta
function seleccionarCuenta(cuenta) {
  cuentaSeleccionada = cuenta;

  renderTablaCuentas();

  $("#contenidoContainer").style.display = "block";
  $("#cuentaSeleccionadaView").value = cuenta.email;

  if (csvData.length === 0 && categoriaAsignada) {
    cargarCSVDeCategoria();
  } else if (csvData.length > 0) {
    seleccionarContenidoAutomatico();
  }

  log(`✅ Cuenta seleccionada: ${cuenta.email} (${cuenta.plataforma})`);
}

// ============================
// Guardar publicación (GUARDA LINK + plataforma + tipo_rrss)
// ============================
function normalizeTags(input) {
  const s = String(input || "").trim();
  if (!s) return [];
  return s.split(/[,;|]/g).map((t) => t.trim()).filter(Boolean);
}

async function guardarPublicacion() {
  if (!cuentaSeleccionada) {
    log("❌ Seleccioná una cuenta primero");
    return;
  }

  const plat = getPlataformaSeleccionada?.() || "marketplace";
  const tipo = getTipoSeleccionado?.() || "";

  const meta = Number(getMetaPorCuenta?.() || categoriaAsignada?.marketplace_daily || 0);
  if (meta > 0 && Number(cuentaSeleccionada.publicacionesHoy || 0) >= meta) {
    log("❌ Ya completaste la meta diaria para esta cuenta");
    return;
  }

  const link = ($("#marketplaceLinkInput").value || "").trim();
  if (!link) {
    log("❌ El link es obligatorio");
    return;
  }

  const titulo = ($("#tituloUsadoInput").value || "").trim();
  const categoria = ($("#categoriaUsadaInput").value || "").trim();
  const descripcion = ($("#descripcionUsadaInput").value || "").trim();

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
    const payload = {
      usuario: session.usuario,
      facebook_account_usada: cuentaSeleccionada.ident,
      fecha_publicacion: new Date().toISOString(),

      // 🔥 guardamos plataforma/tipo para reportes
      plataforma: plat,
      tipo_rrss: plat === "facebook" ? (tipo || null) : null,

      // 🔥 guardamos en AMBOS campos para que no “desaparezca”
      marketplace_link_publicacion: link,
      link_publicacion: link,

      titulo,
      descripcion: descripcion || "",
      categoria,
      etiquetas_usadas: String(etiquetasCategoria || "").trim(),
    };

    const { error } = await supabaseClient
      .from(TABLA_MARKETPLACE_ACTIVIDAD)
      .insert([payload]);

    if (error) {
      log(`❌ Error insert: ${error.message}`);
      console.error("Insert error:", error, "Payload:", payload);
      return;
    }

    contenidoActual._usado = true;
    contenidoUsado.add(contenidoActual._id);

    log("✅ Publicación guardada");
    $("#marketplaceLinkInput").value = "";

    await cargarHistorialHoy();
    await cargarCuentas();
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
    $("#marketplaceLinkInput").value = "";
    log("🧹 Link limpiado");
  });

  // Cambios de plataforma/tipo → recargar contadores y tabla
  $("#plataformaSel")?.addEventListener("change", async () => {
    syncTipoFacebookUI();
    await refrescarContadoresPorCuenta();
    renderTablaCuentas();
    actualizarPillsMetas();

    // al cambiar plataforma, limpiamos selección
    cuentaSeleccionada = null;
    $("#cuentaSeleccionadaView").value = "";
    $("#contenidoContainer").style.display = "none";

    log(`🧭 Plataforma: ${getPlataformaSeleccionada()}`);
  });

  $("#tipoSel")?.addEventListener("change", async () => {
    await refrescarContadoresPorCuenta();
    renderTablaCuentas();
    actualizarPillsMetas();

    // al cambiar tipo, limpiamos selección
    cuentaSeleccionada = null;
    $("#cuentaSeleccionadaView").value = "";
    $("#contenidoContainer").style.display = "none";

    log(`📌 Tipo FB: ${getTipoSeleccionado() || "(none)"}`);
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

  const hoy = fmtDateAR();
  $("#pill-hoy") && ($("#pill-hoy").textContent = `Hoy (AR): ${hoy}`);
  $("#driveFecha") &&
    ($("#driveFecha").innerHTML = `Contenido correspondiente al día <strong>${hoy}</strong>`);

  log("✅ Supabase conectado");

  setupEventListeners();
  syncTipoFacebookUI();

  try {
    await cargarInformacionUsuario();
    await cargarAsignacionCategoria(); // 🔥 ya no rompe
    await cargarCuentas();
    await cargarHistorialHoy();

    // render inicial de metas
    actualizarPillsMetas();

    log("✅ Diario listo (Marketplace / Facebook / TikTok)");
  } catch (e) {
    log(`❌ Error en init: ${e.message}`);
    console.error(e);
  }
});
