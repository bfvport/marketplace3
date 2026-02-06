import { getSession, loadSidebar, escapeHtml, fmtDateAR } from "../../assets/js/app.js";

const $ = (sel) => document.querySelector(sel);

// Tablas (legacy + nuevas)
const TABLA_CUENTAS_LEGACY = "cuentas_facebook";      // legacy
const TABLA_CUENTAS = "cuentas";                      // nuevo
const TABLA_CUENTAS_ASIGNADAS = "cuentas_asignadas";  // nuevo

const TABLA_USUARIOS_ASIGNADO = "usuarios_asignado";
const TABLA_MARKETPLACE_ACTIVIDAD = "marketplace_actividad";
const TABLA_CATEGORIA = "categoria";
const BUCKET_CSV = "categoria_csv";

// Drive (única fuente de medios ahora)
const DRIVE_URL =
  "https://drive.google.com/drive/u/3/folders/1WEKYsaptpUnGCKOszZOKEAovzL5ld7j7";

// Estado
let session = null;
let supabaseClient = null;

let usuarioActual = null;
let asignacionActiva = null;     // fila de usuarios_asignado
let categoriaDetalles = null;    // fila de categoria (incluye csv + etiquetas + mensaje)
let csvData = [];
let contenidoUsado = new Set();

let cuentasAsignadas = [];       // cuentas filtradas por plataforma actual
let cuentaSeleccionada = null;

let historialHoy = [];
let metaDia = {
  marketplace: 0,
  facebook: { muro: 0, grupo: 0, historia: 0, reel: 0 },
  tiktok: 0
};

// UI refs
const plataformaSel = () => $("#plataformaSel");
const tipoSel = () => $("#tipoSel");

// -------------------- Utils --------------------
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

async function waitSupabaseClient(timeoutMs = 2000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (window.supabaseClient) return window.supabaseClient;
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}

function normalizeTags(input) {
  if (Array.isArray(input)) return input.map((s) => String(s).trim()).filter(Boolean);
  const s = String(input || "").trim();
  if (!s) return [];
  return s.split(/[,;|]/g).map((t) => t.trim()).filter(Boolean);
}

function mergeTags(tagsA, tagsB) {
  const a = normalizeTags(tagsA);
  const b = normalizeTags(tagsB);
  const set = new Set([...a, ...b].map(x => x.trim()).filter(Boolean));
  return Array.from(set);
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString();
}

// -------------------- Usuario --------------------
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

// -------------------- Asignación + Categoría --------------------
async function cargarAsignacionActiva() {
  try {
    const hoy = fmtDateAR();

    // Traemos TODAS las metas (las nuevas incluidas)
    const { data, error } = await supabaseClient
      .from(TABLA_USUARIOS_ASIGNADO)
      .select("categoria, fecha_desde, fecha_hasta, marketplace_daily, muro_daily, grupo_daily, historia_daily, reels_daily, tiktok_daily")
      .eq("usuario", session.usuario)
      .lte("fecha_desde", hoy)
      .gte("fecha_hasta", hoy)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        asignacionActiva = null;
        categoriaDetalles = null;
        $("#categoriaInfo").innerHTML = `<div class="muted">⚠️ No tenés asignación activa para hoy.</div>`;
        updateMetasUI([], []);
        return;
      }
      throw error;
    }

    asignacionActiva = data;

    // Categoría: usamos mensaje + etiquetas + csv
    const { data: catData, error: catError } = await supabaseClient
      .from(TABLA_CATEGORIA)
      .select("nombre, csv_nombre, etiquetas, mensaje")
      .eq("nombre", data.categoria)
      .single();

    if (catError) throw catError;

    categoriaDetalles = catData;

    metaDia.marketplace = Number(data.marketplace_daily || 0);
    metaDia.facebook = {
      muro: Number(data.muro_daily || 0),
      grupo: Number(data.grupo_daily || 0),
      historia: Number(data.historia_daily || 0),
      reel: Number(data.reels_daily || 0),
    };
    metaDia.tiktok = Number(data.tiktok_daily || 0);

    $("#categoriaInfo").innerHTML = `
      <div><strong>Categoría:</strong> ${escapeHtml(data.categoria)}</div>
      <div><strong>Descripción base:</strong> ${escapeHtml((catData.mensaje || "").slice(0, 120) || "—")} ${(catData.mensaje || "").length > 120 ? "…" : ""}</div>
      <div><strong>Etiquetas base:</strong> ${escapeHtml(catData.etiquetas || "Sin etiquetas")}</div>
      <div><strong>Período:</strong> ${new Date(data.fecha_desde).toLocaleDateString("es-AR")} al ${new Date(data.fecha_hasta).toLocaleDateString("es-AR")}</div>
    `;

    log(`✅ Asignación activa: ${data.categoria}`);
  } catch (e) {
    log(`❌ Error cargando asignación: ${e.message}`);
  }
}

function totalMetaDia() {
  const fb = metaDia.facebook;
  return (
    metaDia.marketplace +
    (fb.muro + fb.grupo + fb.historia + fb.reel) +
    metaDia.tiktok
  );
}

// -------------------- CSV --------------------
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

function parseCSV(text) {
  const lines = String(text || "").split("\n").map(l => l.replace(/\r/g, ""));
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

    // CSV liviano: titulo, categoria, etiquetas
    const key = `${row.titulo || ""}|${row.categoria || ""}|${row.etiquetas || ""}`;
    row._id = hashString(key);
    row._index = i - 1;
    row._usado = false;

    data.push(row);
  }

  return data;
}

async function cargarCSVDeCategoria() {
  if (!categoriaDetalles?.csv_nombre) {
    log("⚠️ No hay CSV asociado a esta categoría.");
    csvData = [];
    renderCSVInfo();
    return;
  }

  try {
    const path = categoriaDetalles.csv_nombre;
    log(`📥 Descargando CSV: ${path}`);

    const { data, error } = await supabaseClient.storage.from(BUCKET_CSV).download(path);
    if (error) throw error;

    const text = await data.text();
    csvData = parseCSV(text);

    await identificarContenidoUsado();
    renderCSVInfo();

    log(`✅ CSV cargado: ${csvData.length} filas`);
    seleccionarContenidoAutomatico();
  } catch (e) {
    log(`❌ Error cargando CSV: ${e.message}`);
  }
}

async function identificarContenidoUsado() {
  const hoy = fmtDateAR();

  try {
    const { data, error } = await supabaseClient
      .from(TABLA_MARKETPLACE_ACTIVIDAD)
      .select("titulo, categoria, etiquetas_usadas")
      .eq("usuario", session.usuario)
      .gte("fecha_publicacion", hoy + "T00:00:00")
      .lte("fecha_publicacion", hoy + "T23:59:59");

    if (error) throw error;

    contenidoUsado.clear();

    for (const item of data || []) {
      const key = `${item.titulo || ""}|${item.categoria || ""}|${(item.etiquetas_usadas || []).join(",")}`;
      const id = hashString(key);
      contenidoUsado.add(id);

      const index = csvData.findIndex((row) => row._id === id);
      if (index !== -1) csvData[index]._usado = true;
    }
  } catch (e) {
    log(`⚠️ Error identificando contenido usado: ${e.message}`);
  }
}

function renderCSVInfo() {
  const total = csvData.length;
  const usado = csvData.filter(r => r._usado).length;
  const disp = total - usado;

  $("#csvInfo").innerHTML = `
    <div style="display:flex; gap:15px; margin-top:5px; flex-wrap:wrap;">
      <span class="pill pill-success">Disponible: ${disp}</span>
      <span class="pill pill-warning">Usado hoy: ${usado}</span>
      <span class="pill pill-info">Total: ${total}</span>
      <span class="pill pill-info">CSV: <span class="mono">titulo,categoria,etiquetas</span></span>
    </div>
  `;
}

function seleccionarContenidoAutomatico() {
  if (!csvData.length) {
    // igual podemos trabajar con título manual si el operador quiere
    $("#contenidoContainer").style.display = "block";
    $("#tituloInput").value = "";
    $("#categoriaInput").value = asignacionActiva?.categoria || "";
    $("#descripcionInput").value = categoriaDetalles?.mensaje || "";
    $("#etiquetasInput").value = (categoriaDetalles?.etiquetas || "");
    syncHiddenFields();
    log("ℹ️ Sin CSV: podés cargar el título manualmente.");
    return null;
  }

  const disponibles = csvData.filter((row) => !row._usado);
  if (!disponibles.length) {
    log("❌ Ya usaste todo el contenido disponible del CSV para hoy.");
    return null;
  }

  const randomIndex = Math.floor(Math.random() * disponibles.length);
  const fila = disponibles[randomIndex];
  fila._seleccionado = true;

  // Set contenido visible
  $("#tituloInput").value = fila.titulo || "";
  $("#categoriaInput").value = fila.categoria || asignacionActiva?.categoria || "";
  $("#descripcionInput").value = categoriaDetalles?.mensaje || "";

  const etiquetasMerged = mergeTags(categoriaDetalles?.etiquetas || "", fila.etiquetas || "");
  $("#etiquetasInput").value = etiquetasMerged.join(", ");

  syncHiddenFields();
  log(`✅ Contenido seleccionado: "${(fila.titulo || "").slice(0, 34)}${(fila.titulo || "").length > 34 ? "…" : ""}"`);
  return fila;
}

function syncHiddenFields() {
  $("#tituloUsadoInput").value = ($("#tituloInput").value || "").trim();
  $("#descripcionUsadaInput").value = ($("#descripcionInput").value || "").trim();
  $("#categoriaUsadaInput").value = ($("#categoriaInput").value || "").trim();
  $("#etiquetasUsadasInput").value = ($("#etiquetasInput").value || "").trim();
}

// -------------------- Cuentas --------------------
async function cargarCuentasAsignadasPorPlataforma() {
  const plat = (plataformaSel()?.value || "marketplace").trim();

  // Reset
  cuentasAsignadas = [];
  cuentaSeleccionada = null;
  $("#cuentaSeleccionadaView").value = "";
  $("#cuentaUsadaInput").value = "";

  // Estrategia: intentamos el sistema nuevo (cuentas + cuentas_asignadas).
  // Si no existe, caemos al legacy cuentas_facebook.
  let nuevasOk = true;
  try {
    const { data, error } = await supabaseClient
      .from(TABLA_CUENTAS_ASIGNADAS)
      .select("id, usuario, cuenta_id, cuentas(plataforma, nombre, handle, url, activo)")
      .eq("usuario", session.usuario);

    if (error) throw error;

    const rows = (data || [])
      .map(r => r.cuentas ? ({ ...r.cuentas, _asigId: r.id, _cuentaId: r.cuenta_id }) : null)
      .filter(Boolean)
      .filter(c => !!c.activo)
      .filter(c => String(c.plataforma).toLowerCase() === plat);

    cuentasAsignadas = rows.map(c => ({
      display: c.handle ? `${c.nombre} (${c.handle})` : c.nombre,
      plataforma: c.plataforma,
      ref: c.handle || c.nombre,
      _cuentaId: c._cuentaId
    }));
  } catch (e) {
    nuevasOk = false;
    console.warn("Fallo sistema nuevo de cuentas, usando legacy:", e?.message || e);
  }

  if (!nuevasOk) {
    // Legacy: solo facebook
    if (plat !== "facebook" && plat !== "marketplace") {
      cuentasAsignadas = [];
      renderTablaCuentas();
      return;
    }

    try {
      const { data, error } = await supabaseClient
        .from(TABLA_CUENTAS_LEGACY)
        .select("email, ocupada_por, estado")
        .eq("ocupada_por", session.usuario);

      if (error) throw error;

      cuentasAsignadas = (data || []).map(c => ({
        display: c.email,
        plataforma: "facebook",
        ref: c.email
      }));
    } catch (e) {
      log(`❌ Error cargando cuentas (legacy): ${e.message}`);
    }
  }

  // Contar hoy por cuenta/plataforma
  await contarPublicacionesHoyPorCuenta();
  renderTablaCuentas();
}

async function contarPublicacionesHoyPorCuenta() {
  const hoy = fmtDateAR();
  for (const cuenta of cuentasAsignadas) {
    // Para legacy/nuevo guardamos el "ref" en facebook_account_usada
    const { count } = await supabaseClient
      .from(TABLA_MARKETPLACE_ACTIVIDAD)
      .select("*", { count: "exact", head: true })
      .eq("usuario", session.usuario)
      .eq("facebook_account_usada", cuenta.ref)
      .gte("fecha_publicacion", hoy + "T00:00:00")
      .lte("fecha_publicacion", hoy + "T23:59:59");

    cuenta.publicacionesHoy = count || 0;
  }
}

function metaParaPlataformaTipoActual() {
  const plat = plataformaSel().value;
  if (plat === "marketplace") return metaDia.marketplace;

  if (plat === "tiktok") return metaDia.tiktok;

  // facebook
  const tipo = String(tipoSel().value || "").trim();
  if (!tipo) return 0;
  return Number(metaDia.facebook[tipo] || 0);
}

function renderTablaCuentas() {
  const tbody = $("#tablaCuentas tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  const plat = plataformaSel().value;
  const meta = metaParaPlataformaTipoActual();

  if (!cuentasAsignadas.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="muted">No tenés cuentas asignadas para esta plataforma</td></tr>`;
    return;
  }

  for (const cuenta of cuentasAsignadas) {
    const tr = document.createElement("tr");

    const tdCuenta = document.createElement("td");
    tdCuenta.innerHTML = `<span class="mono">${escapeHtml(cuenta.display)}</span>`;
    tr.appendChild(tdCuenta);

    const tdPlat = document.createElement("td");
    tdPlat.innerHTML = `<span class="pill pill-info">${escapeHtml(cuenta.plataforma)}</span>`;
    tr.appendChild(tdPlat);

    const tdHoy = document.createElement("td");
    const completado = meta > 0 ? Number(cuenta.publicacionesHoy || 0) >= meta : false;

    tdHoy.innerHTML = `
      <span style="font-weight:bold; color:${completado ? "#22c55e" : "#f59e0b"}">
        ${cuenta.publicacionesHoy || 0}
      </span>
      <span class="muted">/${meta || "—"}</span>
    `;
    tr.appendChild(tdHoy);

    const tdAcc = document.createElement("td");
    tdAcc.className = "actions";

    const btn = document.createElement("button");
    btn.className = (cuentaSeleccionada?.ref === cuenta.ref) ? "btn active" : "btn";
    btn.textContent = (cuentaSeleccionada?.ref === cuenta.ref) ? "✓ Seleccionada" : "Seleccionar";
    btn.onclick = () => seleccionarCuenta(cuenta);

    // Si hay meta y está completado, no dejemos seguir registrando para esa cuenta
    if (meta > 0) btn.disabled = completado;

    tdAcc.appendChild(btn);
    tr.appendChild(tdAcc);

    tbody.appendChild(tr);
  }
}

function seleccionarCuenta(cuenta) {
  cuentaSeleccionada = cuenta;
  $("#cuentaSeleccionadaView").value = cuenta.display;
  $("#cuentaUsadaInput").value = cuenta.ref;

  $("#contenidoContainer").style.display = "block";

  // Cargar CSV si no está
  if (!csvData.length && categoriaDetalles) cargarCSVDeCategoria();
  else seleccionarContenidoAutomatico();

  renderTablaCuentas();
  log(`✅ Cuenta seleccionada: ${cuenta.display}`);
}

// -------------------- Historial + Metas --------------------
async function cargarHistorialHoy() {
  try {
    const hoy = fmtDateAR();

    const { data, error } = await supabaseClient
      .from(TABLA_MARKETPLACE_ACTIVIDAD)
      .select("id, usuario, fecha_publicacion, plataforma, tipo_rrss, link_publicacion, marketplace_link_publicacion, facebook_account_usada, titulo, categoria")
      .eq("usuario", session.usuario)
      .gte("fecha_publicacion", hoy + "T00:00:00")
      .lte("fecha_publicacion", hoy + "T23:59:59")
      .order("fecha_publicacion", { ascending: false });

    if (error) throw error;

    historialHoy = data || [];
    $("#contadorPublicaciones").textContent = String(historialHoy.length);

    renderTablaHistorial(historialHoy);
    updateMetasUIFromHistorial(historialHoy);

    log(`✅ Historial cargado: ${historialHoy.length} publicación(es) hoy`);
  } catch (e) {
    log(`❌ Error cargando historial: ${e.message}`);
  }
}

function countByPlatTipo(hist) {
  const out = {
    marketplace: 0,
    tiktok: 0,
    facebook: { muro: 0, grupo: 0, historia: 0, reel: 0 }
  };

  for (const it of hist || []) {
    const p = String(it.plataforma || "marketplace").toLowerCase();

    if (p === "marketplace") out.marketplace++;
    else if (p === "tiktok") out.tiktok++;
    else if (p === "facebook") {
      const t = String(it.tipo_rrss || "").toLowerCase();
      if (out.facebook[t] !== undefined) out.facebook[t]++;
    }
  }

  return out;
}

function updateMetasUIFromHistorial(hist) {
  const counts = countByPlatTipo(hist);

  const metaTotal = totalMetaDia();
  $("#metaTotalDia").textContent = String(metaTotal);

  const hechas = (hist || []).length;
  const pendientes = Math.max(metaTotal - hechas, 0);

  $("#pendientesHoy").textContent = String(pendientes);

  const detalle = $("#pillsDetalle");
  if (detalle) {
    const fb = metaDia.facebook;

    detalle.innerHTML = `
      <span class="pill pill-info">MP: <strong>${counts.marketplace}</strong>/${metaDia.marketplace}</span>
      <span class="pill pill-info">FB Muro: <strong>${counts.facebook.muro}</strong>/${fb.muro}</span>
      <span class="pill pill-info">FB Grupo: <strong>${counts.facebook.grupo}</strong>/${fb.grupo}</span>
      <span class="pill pill-info">FB Historia: <strong>${counts.facebook.historia}</strong>/${fb.historia}</span>
      <span class="pill pill-info">FB Reel: <strong>${counts.facebook.reel}</strong>/${fb.reel}</span>
      <span class="pill pill-info">TT: <strong>${counts.tiktok}</strong>/${metaDia.tiktok}</span>
    `;
  }
}

function updateMetasUI() {
  const metaTotal = totalMetaDia();
  $("#metaTotalDia").textContent = String(metaTotal);
  $("#contadorPublicaciones").textContent = "0";
  $("#pendientesHoy").textContent = String(metaTotal);
  const detalle = $("#pillsDetalle");
  if (detalle) detalle.innerHTML = "";
}

// -------------------- Guardar --------------------
function linkLabelUpdate() {
  const plat = plataformaSel().value;
  const el = $("#linkLabel");
  if (!el) return;
  if (plat === "marketplace") el.textContent = "Link de la publicación (Marketplace)";
  else if (plat === "facebook") el.textContent = "Link de la publicación (Facebook)";
  else el.textContent = "Link de la publicación (TikTok)";
}

function enforceTipoRRSS() {
  const plat = plataformaSel().value;

  if (plat === "facebook") {
    tipoSel().disabled = false;
    if (!tipoSel().value) tipoSel().value = "muro"; // default razonable
  } else {
    tipoSel().value = "";
    tipoSel().disabled = true;
  }
}

async function guardarPublicacion() {
  if (!asignacionActiva || !categoriaDetalles) {
    log("❌ No tenés asignación/categoría activa para hoy.");
    return;
  }

  const plat = String(plataformaSel().value || "marketplace");
  const tipo = plat === "facebook" ? String(tipoSel().value || "") : "";

  if (plat === "facebook" && !tipo) {
    log("❌ Elegí el tipo RRSS (muro/grupo/historia/reel).");
    return;
  }

  if (!cuentaSeleccionada) {
    log("❌ Seleccioná una cuenta primero.");
    return;
  }

  const meta = metaParaPlataformaTipoActual();
  if (meta > 0) {
    const ya = Number(cuentaSeleccionada.publicacionesHoy || 0);
    if (ya >= meta) {
      log("❌ Ya completaste la meta para esta cuenta (según plataforma/tipo).");
      return;
    }
  }

  const link = ($("#linkPublicacionInput").value || "").trim();
  if (!link) {
    log("❌ El link es obligatorio.");
    return;
  }

  // contenido
  const titulo = ($("#tituloInput").value || "").trim();
  const descripcion = ($("#descripcionInput").value || "").trim();
  const categoria = ($("#categoriaInput").value || "").trim();
  const etiquetasTxt = ($("#etiquetasInput").value || "").trim();
  const nota = ($("#notaInput").value || "").trim();

  if (!titulo || !categoria) {
    log("❌ Título y categoría son obligatorios.");
    return;
  }

  // Validación anti-repetición si hay CSV
  let fila = null;
  if (csvData.length) {
    fila = csvData.find(r => (r.titulo || "").trim() === titulo && (r.categoria || "").trim() === categoria);
    if (fila && fila._usado) {
      log("⚠️ Ese contenido ya se usó hoy. Te selecciono otro.");
      seleccionarContenidoAutomatico();
      return;
    }
  }

  disable("#btnGuardarPublicacion", true);

  try {
    const etiquetasMerged = mergeTags(categoriaDetalles.etiquetas || "", etiquetasTxt);

    const payload = {
      usuario: session.usuario,
      facebook_account_usada: cuentaSeleccionada.ref, // fallback (sirve para FB/TT también como "cuenta usada")
      fecha_publicacion: new Date().toISOString(),
      titulo,
      descripcion: descripcion || (categoriaDetalles.mensaje || ""),
      categoria,
      etiquetas_usadas: etiquetasMerged,
      nota: nota || null,

      // Nuevo (para dashboard/verificación)
      plataforma: plat,
      tipo_rrss: plat === "facebook" ? tipo : null,
      link_publicacion: link
    };

    // Compatibilidad legacy
    if (plat === "marketplace") payload.marketplace_link_publicacion = link;

    const { error } = await supabaseClient.from(TABLA_MARKETPLACE_ACTIVIDAD).insert([payload]);
    if (error) throw error;

    // marcar usado
    if (fila) fila._usado = true;

    log("✅ Publicación guardada.");
    $("#linkPublicacionInput").value = "";
    $("#notaInput").value = "";

    await cargarHistorialHoy();
    await cargarCuentasAsignadasPorPlataforma();
    renderCSVInfo();
    seleccionarContenidoAutomatico();
  } catch (e) {
    log(`❌ Error guardando: ${e.message}`);
    console.error(e);
  } finally {
    disable("#btnGuardarPublicacion", false);
  }
}

// -------------------- Historial table --------------------
function shortLink(url) {
  const s = String(url || "");
  if (!s) return "";
  return s.length > 60 ? s.slice(0, 60) + "…" : s;
}

function renderTablaHistorial(hist) {
  const tbody = $("#tablaHistorial tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!hist.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="muted">No hay publicaciones hoy</td></tr>`;
    return;
  }

  for (const item of hist) {
    const tr = document.createElement("tr");

    const tdHora = document.createElement("td");
    const fecha = new Date(item.fecha_publicacion);
    tdHora.textContent = fecha.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
    tr.appendChild(tdHora);

    const tdPlat = document.createElement("td");
    tdPlat.textContent = String(item.plataforma || "marketplace");
    tr.appendChild(tdPlat);

    const tdTipo = document.createElement("td");
    tdTipo.textContent = item.plataforma === "facebook" ? (item.tipo_rrss || "-") : "-";
    tr.appendChild(tdTipo);

    const tdCuenta = document.createElement("td");
    tdCuenta.innerHTML = `<span class="mono">${escapeHtml(item.facebook_account_usada || "-")}</span>`;
    tr.appendChild(tdCuenta);

    const tdLink = document.createElement("td");
    const link = item.link_publicacion || item.marketplace_link_publicacion;
    if (link) tdLink.innerHTML = `<a href="${escapeHtml(link)}" target="_blank" style="color:#60a5fa;">${escapeHtml(shortLink(link))}</a>`;
    else tdLink.textContent = "Sin link";
    tr.appendChild(tdLink);

    const tdAcc = document.createElement("td");
    tdAcc.className = "actions";

    const btnCopiar = document.createElement("button");
    btnCopiar.className = "btn2";
    btnCopiar.textContent = "Copiar link";
    btnCopiar.onclick = () => {
      navigator.clipboard.writeText(link || "");
      log("📋 Link copiado.");
    };

    tdAcc.appendChild(btnCopiar);
    tr.appendChild(tdAcc);

    tbody.appendChild(tr);
  }
}

// -------------------- Eventos --------------------
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
    log("🧹 Form limpio.");
  });

  // Sync hidden on manual edits
  $("#tituloInput")?.addEventListener("input", syncHiddenFields);
  $("#descripcionInput")?.addEventListener("input", syncHiddenFields);
  $("#categoriaInput")?.addEventListener("input", syncHiddenFields);
  $("#etiquetasInput")?.addEventListener("input", syncHiddenFields);

  plataformaSel()?.addEventListener("change", async () => {
    enforceTipoRRSS();
    linkLabelUpdate();
    await cargarCuentasAsignadasPorPlataforma();
    renderTablaCuentas();
    log(`🧭 Plataforma: ${plataformaSel().value}`);
  });

  tipoSel()?.addEventListener("change", async () => {
    // cambia la meta por cuenta
    await cargarCuentasAsignadasPorPlataforma();
    renderTablaCuentas();
    log(`🧩 Tipo RRSS: ${tipoSel().value}`);
  });
}

// -------------------- Init --------------------
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
    log("❌ No se pudo conectar con Supabase.");
    return;
  }

  const hoy = fmtDateAR();
  const pill = $("#pill-hoy");
  if (pill) pill.textContent = `Hoy (AR): ${hoy}`;

  const driveFecha = $("#driveFecha");
  if (driveFecha) {
    driveFecha.innerHTML = `Contenido correspondiente al día <strong>${hoy}</strong>`;
  }

  log("✅ Supabase conectado.");
  setupEventListeners();

  enforceTipoRRSS();
  linkLabelUpdate();

  await cargarInformacionUsuario();
  await cargarAsignacionActiva();
  await cargarHistorialHoy();

  // Cuentas + CSV
  await cargarCuentasAsignadasPorPlataforma();
  await cargarCSVDeCategoria();

  // Mostrar contenedor cuando haya cuenta elegida
  $("#contenidoContainer").style.display = "none";

  log("✅ Diario final listo. (Y no lo tocamos más 😎)");
});
