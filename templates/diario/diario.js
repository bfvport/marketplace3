import { getSession, loadSidebar, escapeHtml } from "../../assets/js/app.js";

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

function parseCSV(text) {
  const lines = text.split('\n');
  if (lines.length < 2) return [];
  
  const headers = lines[0].split(',').map(h => h.trim());
  const data = [];
  
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    
    const values = parseCSVLine(lines[i]);
    const row = {};
    
    for (let j = 0; j < headers.length; j++) {
      let value = values[j] || '';
      // Usar la función limpiarEtiquetas para consistencia
      row[headers[j]] = limpiarEtiquetas(value);
    }
    
    // Agregar ID único basado en título + descripción
    row._id = hashString((row.titulo || '') + (row.descripcion || ''));
    row._index = i - 1;
    row._usado = false;
    row._seleccionado = false;
    
    data.push(row);
  }
  
  return data;
}

function log(msg) {
  const el = $("#log");
  if (!el) return;
  const t = new Date().toTimeString().slice(0, 8);
  el.innerHTML += `[${t}] ${escapeHtml(msg)}<br>`;
  el.scrollTop = el.scrollHeight;
}


function limpiarEtiquetas(etiquetas) {
  if (!etiquetas) return "";
  
  let limpias = etiquetas.trim();
  
  // Remover comillas dobles exteriores
  if (limpias.startsWith('"') && limpias.endsWith('"')) {
    limpias = limpias.substring(1, limpias.length - 1);
  }
  
  // Reemplazar comillas dobles escapadas
  limpias = limpias.replace(/""/g, '"');
  
  return limpias;
}

// En cargarAsignacionCategoria
etiquetasCategoria = limpiarEtiquetas(catData.etiquetas);

// En guardarPublicacion
const etiquetasParaGuardar = limpiarEtiquetas(etiquetasCategoria);


function clearLogs() {
  const el = $("#log");
  if (el) el.innerHTML = "";
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
      <div><strong>Usuario:</strong> ${escapeHtml(data.usuario)}</div>
      <div><strong>Rol:</strong> ${escapeHtml(data.rol || "No especificado")}</div>
      <div><strong>Email:</strong> ${escapeHtml(data.email || "No especificado")}</div>
    `;
    
    log(`✅ Usuario cargado: ${data.usuario}`);
  } catch (e) {
    log(`❌ Error cargando usuario: ${e.message}`);
  }
}

async function cargarCuentasFacebook() {
  try {
    const { data, error } = await supabaseClient
      .from(TABLA_CUENTAS)
      .select("email, ocupada_por, estado")
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
        .gte("fecha_publicacion", hoy + "T00:00:00")
        .lte("fecha_publicacion", hoy + "T23:59:59");
      
      cuenta.publicacionesHoy = count || 0;
      
      // Verificar si completó la cuota
      if (categoriaAsignada && cuenta.publicacionesHoy >= categoriaAsignada.marketplace_daily) {
        completadas++;
      }
    }
    
    // Actualizar estadísticas
    $("#cuentasCount").textContent = `Cuentas: ${cuentasAsignadas.length}`;
    $("#completadasCount").textContent = `Completadas: ${completadas}`;
    
    renderTablaCuentas();
    log(`✅ ${cuentasAsignadas.length} cuenta(s) cargada(s)`);
  } catch (e) {
    log(`❌ Error cargando cuentas: ${e.message}`);
  }
}

function limpiarEtiquetas(etiquetas) {
  if (!etiquetas) return "";
  
  let limpias = etiquetas.trim();
  
  // Remover comillas dobles exteriores
  if (limpias.startsWith('"') && limpias.endsWith('"')) {
    limpias = limpias.substring(1, limpias.length - 1);
  }
  
  // Reemplazar comillas dobles escapadas
  limpias = limpias.replace(/""/g, '"');
  
  return limpias;
}

async function cargarAsignacionCategoria() {
  try {
    const hoy = new Date().toISOString().split('T')[0];
    
    const { data, error } = await supabaseClient
      .from(TABLA_USUARIOS_ASIGNADO)
      .select("categoria, marketplace_daily, fecha_desde, fecha_hasta")
      .eq("usuario", session.usuario)
      .lte("fecha_desde", hoy)
      .gte("fecha_hasta", hoy)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        log("⚠️ No tenés asignación activa para hoy");
        categoriaAsignada = null;
        return;
      }
      throw error;
    }
    
    categoriaAsignada = data;
    
    // Cargar detalles de la categoría (INCLUYENDO ETIQUETAS)
    const { data: catData } = await supabaseClient
      .from(TABLA_CATEGORIA)
      .select("nombre, csv_nombre, etiquetas")
      .eq("nombre", data.categoria)
      .single();
    
    if (catData) {
      categoriaAsignada.detalles = catData;
      
      // LIMPIAR ETIQUETAS - QUITAR COMILLAS DOBLES
      etiquetasCategoria = limpiarEtiquetas(catData.etiquetas || "");
      
      $("#categoriaInfo").innerHTML = `
        <div><strong>Categoría:</strong> ${escapeHtml(data.categoria)}</div>
        <div><strong>Etiquetas:</strong> ${escapeHtml(etiquetasCategoria || "Sin etiquetas")}</div>
        <div><strong>Publicaciones diarias por cuenta:</strong> ${data.marketplace_daily}</div>
        <div><strong>Período:</strong> ${new Date(data.fecha_desde).toLocaleDateString()} al ${new Date(data.fecha_hasta).toLocaleDateString()}</div>
      `;
    } else {
      $("#categoriaInfo").innerHTML = `
        <div><strong>Categoría:</strong> ${escapeHtml(data.categoria)}</div>
        <div><strong>Publicaciones diarias por cuenta:</strong> ${data.marketplace_daily}</div>
        <div><strong>Período:</strong> ${new Date(data.fecha_desde).toLocaleDateString()} al ${new Date(data.fecha_hasta).toLocaleDateString()}</div>
      `;
    }
    
    $("#metaPublicaciones").textContent = data.marketplace_daily;
    
    log(`✅ Categoría asignada: ${data.categoria}`);
  } catch (e) {
    log(`❌ Error cargando asignación: ${e.message}`);
  }
}
async function cargarCSVDeCategoria() {
  if (!categoriaAsignada?.detalles?.csv_nombre) {
    log("⚠️ No hay CSV asociado a esta categoría");
    return;
  }
  
  try {
    const path = categoriaAsignada.detalles.csv_nombre;
    log(`📥 Descargando CSV: ${path}`);
    
    const { data, error } = await supabaseClient.storage
      .from(BUCKET_CSV)
      .download(path);
    
    if (error) throw error;
    
    const text = await data.text();
    csvData = parseCSV(text);
    
    // Identificar contenido ya usado HOY
    await identificarContenidoUsado();
    
    log(`✅ CSV cargado: ${csvData.length} filas`);
    
    // Mostrar estadísticas
    mostrarEstadisticasContenido();
    
  } catch (e) {
    log(`❌ Error cargando CSV: ${e.message}`);
  }
}

function parseCSV(text) {
  const lines = text.split('\n');
  if (lines.length < 2) return [];
  
  const headers = lines[0].split(',').map(h => h.trim());
  const data = [];
  
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    
    const values = parseCSVLine(lines[i]);
    const row = {};
    
    for (let j = 0; j < headers.length; j++) {
      let value = values[j] || '';
      // Remover comillas dobles si las hay
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }
      row[headers[j]] = value.trim();
    }
    
    // Agregar ID único basado en título + descripción
    row._id = hashString((row.titulo || '') + (row.descripcion || ''));
    row._index = i - 1;
    row._usado = false;
    row._seleccionado = false;
    
    data.push(row);
  }
  
  return data;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current);
  return result;
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString();
}

async function identificarContenidoUsado() {
  const hoy = new Date().toISOString().split('T')[0];
  
  try {
    const { data, error } = await supabaseClient
      .from(TABLA_MARKETPLACE_ACTIVIDAD)
      .select("titulo, descripcion")
      .eq("usuario", session.usuario)
      .gte("fecha_publicacion", hoy + "T00:00:00")
      .lte("fecha_publicacion", hoy + "T23:59:59");
    
    if (error) throw error;
    
    contenidoUsado.clear();
    
    // Marcar contenido ya usado en csvData
    for (const item of data) {
      const id = hashString((item.titulo || '') + (item.descripcion || ''));
      contenidoUsado.add(id);
      
      // También marcar en csvData
      const index = csvData.findIndex(row => row._id === id);
      if (index !== -1) {
        csvData[index]._usado = true;
      }
    }
    
  } catch (e) {
    log(`⚠️ Error identificando contenido usado: ${e.message}`);
  }
}

function mostrarEstadisticasContenido() {
  const usado = csvData.filter(row => row._usado).length;
  const total = csvData.length;
  const disponible = total - usado;
  
  const statsEl = $("#estadisticasContenido");
  statsEl.style.display = "flex";
  statsEl.innerHTML = `
    <span class="pill pill-success">Disponible: ${disponible}</span>
    <span class="pill pill-warning">Usado hoy: ${usado}</span>
    <span class="pill pill-info">Total: ${total}</span>
  `;
}

function seleccionarContenidoAutomatico() {
  if (csvData.length === 0) {
    log("⚠️ No hay contenido disponible en el CSV");
    return null;
  }
  
  // Filtrar contenido no usado
  const contenidoDisponible = csvData.filter(row => !row._usado);
  
  if (contenidoDisponible.length === 0) {
    log("❌ Ya usaste todo el contenido disponible para hoy");
    return null;
  }
  
  // Limpiar selección anterior
  if (contenidoSeleccionado) {
    contenidoSeleccionado._seleccionado = false;
  }
  
  // Seleccionar aleatoriamente
  const randomIndex = Math.floor(Math.random() * contenidoDisponible.length);
  contenidoSeleccionado = contenidoDisponible[randomIndex];
  contenidoSeleccionado._seleccionado = true;
  
  // Actualizar interfaz
  actualizarContenidoFila(contenidoSeleccionado);
  
  log(`✅ Contenido seleccionado: "${contenidoSeleccionado.titulo?.substring(0, 30) || 'Sin título'}..."`);
  
  return contenidoSeleccionado;
}

function actualizarContenidoFila(fila) {
  if (!fila) return;
  
  // Actualizar inputs de visualización
  $("#tituloInput").value = fila.titulo || "";
  $("#descripcionInput").value = fila.descripcion || "";
  $("#categoriaInput").value = fila.categoria || "";
  $("#etiquetasInput").value = etiquetasCategoria || "";
  
  // Actualizar formulario de guardado
  $("#etiquetasInput").value = etiquetasCategoria || "";
  $("#etiquetasUsadasInput").value = etiquetasCategoria || "";
  $("#tituloUsadoInput").value = fila.titulo || "";
  $("#descripcionUsadaInput").value = fila.descripcion || "";
  $("#categoriaUsadaInput").value = fila.categoria || "";
  $("#etiquetasUsadasInput").value = etiquetasCategoria || "";
  $("#urlPortadaInput").value = fila.url_imagenes_portadas || "";
  
  // Actualizar estado visual de los inputs
  const tituloInput = $("#tituloInput");
  const descInput = $("#descripcionInput");
  
  tituloInput.className = fila._usado ? "content-used" : (fila._seleccionado ? "content-selected" : "content-available");
  descInput.className = fila._usado ? "content-used" : (fila._seleccionado ? "content-selected" : "content-available");
  
  // Actualizar badge de estado en título
  const tituloStatus = $("#tituloStatus");
  if (fila._usado) {
    tituloStatus.innerHTML = '<span class="used-badge">USADO</span>';
  } else if (fila._seleccionado) {
    tituloStatus.innerHTML = '<span class="available-badge">SELECCIONADO</span>';
  } else {
    tituloStatus.innerHTML = "";
  }
  
  // Actualizar imágenes fijas
  const container = $("#imagenesFijasContainer");
  container.innerHTML = "";
  
  for (let i = 1; i <= 4; i++) {
    const url = fila[`url_img_fijas_${i}`];
    if (url) {
      const div = document.createElement("div");
      div.className = `image-preview ${fila._usado ? 'used' : ''}`;
      div.innerHTML = `
        <img src="${escapeHtml(url)}" alt="Imagen ${i}" onerror="this.style.display='none'">
        <div style="font-size:11px; padding:2px; text-align:center;">${i}</div>
      `;
      container.appendChild(div);
    }
  }
  
  // Actualizar portada
  const portadaContainer = $("#portadaContainer");
  portadaContainer.innerHTML = "";
  
  if (fila.url_imagenes_portadas) {
    const div = document.createElement("div");
    div.className = `image-preview ${fila._usado ? 'used' : ''}`;
    div.innerHTML = `
      <img src="${escapeHtml(fila.url_imagenes_portadas)}" alt="Portada" onerror="this.style.display='none'">
      <div style="font-size:11px; padding:2px; text-align:center;">Portada</div>
    `;
    portadaContainer.appendChild(div);
  }
}

async function cargarHistorialHoy() {
  try {
    const hoy = new Date().toISOString().split('T')[0];
    
    const { data, error } = await supabaseClient
      .from(TABLA_MARKETPLACE_ACTIVIDAD)
      .select("*")
      .eq("usuario", session.usuario)
      .gte("fecha_publicacion", hoy + "T00:00:00")
      .lte("fecha_publicacion", hoy + "T23:59:59")
      .order("fecha_publicacion", { ascending: false });
    
    if (error) throw error;
    
    publicacionesHoy = data.length;
    $("#contadorPublicaciones").textContent = publicacionesHoy;
    $("#historialInfo").textContent = `${data.length} publicación(es) hoy`;
    
    renderTablaHistorial(data);
  } catch (e) {
    log(`❌ Error cargando historial: ${e.message}`);
  }
}

// Funciones de renderizado
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
    
    // Email
    const tdEmail = document.createElement("td");
    tdEmail.innerHTML = `<span class="mono">${escapeHtml(cuenta.email)}</span>`;
    tr.appendChild(tdEmail);
    
    // Estado
    const tdEstado = document.createElement("td");
    const estadoPill = document.createElement("span");
    estadoPill.className = `pill ${cuenta.estado === 'activa' ? 'pill-success' : 'pill-warning'}`;
    estadoPill.textContent = cuenta.estado || 'desconocido';
    tdEstado.appendChild(estadoPill);
    tr.appendChild(tdEstado);
    
    // Publicaciones hoy
    const tdPublicaciones = document.createElement("td");
    const meta = categoriaAsignada?.marketplace_daily || 0;
    const completado = cuenta.publicacionesHoy >= meta;
    tdPublicaciones.innerHTML = `
      <span style="font-weight:bold; color: ${completado ? '#22c55e' : '#f59e0b'}">${cuenta.publicacionesHoy}</span>
      <span class="muted">/${meta}</span>
    `;
    tr.appendChild(tdPublicaciones);
    
    // Acciones
    const tdAcciones = document.createElement("td");
    tdAcciones.className = "actions";
    
    const btnSeleccionar = document.createElement("button");
    btnSeleccionar.className = cuentaSeleccionada?.email === cuenta.email ? "btn active" : "btn";
    btnSeleccionar.textContent = cuentaSeleccionada?.email === cuenta.email ? "✓ Seleccionada" : "Seleccionar";
    btnSeleccionar.onclick = () => seleccionarCuenta(cuenta);
    btnSeleccionar.disabled = completado;
    
    tdAcciones.appendChild(btnSeleccionar);
    tr.appendChild(tdAcciones);
    
    tbody.appendChild(tr);
  }
}

function renderTablaHistorial(historial) {
  const tbody = $("#tablaHistorial tbody");
  if (!tbody) return;
  
  tbody.innerHTML = "";
  
  if (historial.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="muted">No hay publicaciones hoy</td></tr>`;
    return;
  }
  
  for (const item of historial) {
    const tr = document.createElement("tr");
    
    // Hora
    const tdHora = document.createElement("td");
    const fecha = new Date(item.fecha_publicacion);
    tdHora.textContent = fecha.toLocaleTimeString('es-AR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    tr.appendChild(tdHora);
    
    // Cuenta
    const tdCuenta = document.createElement("td");
    tdCuenta.innerHTML = `<span class="mono">${escapeHtml(item.facebook_account_usada)}</span>`;
    tr.appendChild(tdCuenta);
    
    // Título
    const tdTitulo = document.createElement("td");
    tdTitulo.textContent = item.titulo ? (item.titulo.substring(0, 40) + (item.titulo.length > 40 ? '...' : '')) : '';
    tr.appendChild(tdTitulo);
    
    // Link
    const tdLink = document.createElement("td");
    if (item.marketplace_link_publicacion) {
      tdLink.innerHTML = `<a href="${escapeHtml(item.marketplace_link_publicacion)}" target="_blank" style="color:#60a5fa; font-size:12px;">${escapeHtml(item.marketplace_link_publicacion.substring(0, 40))}...</a>`;
    } else {
      tdLink.textContent = "Sin link";
    }
    tr.appendChild(tdLink);
    
    // Acciones
    const tdAcciones = document.createElement("td");
    tdAcciones.className = "actions";
    
    const btnCopiar = document.createElement("button");
    btnCopiar.className = "btn2";
    btnCopiar.textContent = "Copiar";
    btnCopiar.onclick = () => {
      navigator.clipboard.writeText(item.marketplace_link_publicacion || '');
      log("📋 Link copiado al portapapeles");
    };
    
    tdAcciones.appendChild(btnCopiar);
    tr.appendChild(tdAcciones);
    
    tbody.appendChild(tr);
  }
}

// Funciones de interacción
function seleccionarCuenta(cuenta) {
  cuentaSeleccionada = cuenta;
  
  // Actualizar UI
  renderTablaCuentas();
  
  // Mostrar contenido
  $("#contenidoContainer").style.display = "block";
  $("#csvInfo").textContent = `Contenido para: ${cuenta.email}`;
  
  // Actualizar cuenta usada en formulario
  $("#cuentaUsadaInput").value = cuenta.email;
  
  // Cargar CSV si no está cargado
  if (csvData.length === 0 && categoriaAsignada) {
    cargarCSVDeCategoria().then(() => {
      if (csvData.length > 0) {
        seleccionarContenidoAutomatico();
      }
    });
  } else if (csvData.length > 0) {
    seleccionarContenidoAutomatico();
  }
  
  log(`✅ Cuenta seleccionada: ${cuenta.email}`);
}

async function guardarPublicacion() {
  // Validaciones
  if (!cuentaSeleccionada) {
    log("❌ Seleccioná una cuenta primero");
    return;
  }
  
  if (!contenidoSeleccionado) {
    log("❌ No hay contenido seleccionado");
    return;
  }
  
  // Verificar si ya completó la cuota diaria
  const meta = categoriaAsignada?.marketplace_daily || 0;
  const completado = cuentaSeleccionada.publicacionesHoy >= meta;
  if (completado) {
    log(`❌ Ya completaste las ${meta} publicaciones diarias para esta cuenta`);
    return;
  }
  
  if (contenidoSeleccionado._usado) {
    log("⚠️ Este contenido ya fue usado hoy. Seleccionando nuevo contenido...");
    seleccionarContenidoAutomatico();
    return;
  }
  
  const link = $("#marketplaceLinkInput").value.trim();
  if (!link) {
    log("❌ El link de Marketplace es obligatorio");
    return;
  }
  
  const titulo = $("#tituloUsadoInput").value.trim();
  const descripcion = $("#descripcionUsadaInput").value.trim();
  const categoria = $("#categoriaUsadaInput").value.trim();
  
  if (!titulo || !descripcion || !categoria) {
    log("❌ Falta completar campos obligatorios");
    return;
  }
  
  disable("#btnGuardarPublicacion", true);
  


  try {
    const { error } = await supabaseClient
      .from(TABLA_MARKETPLACE_ACTIVIDAD)
      .insert([{
        usuario: session.usuario,
        facebook_account_usada: cuentaSeleccionada.email,
        fecha_publicacion: new Date().toISOString(),
        marketplace_link_publicacion: link,
        titulo: titulo,
        descripcion: descripcion,
        categoria: categoria,
        etiquetas_usadas: limpiarEtiquetas(etiquetasCategoria), // <- AQUÍ TAMBIÉN
        url_imagenes_portada: $("#urlPortadaInput").value.trim()
      }]);
    
    if (error) throw error;
    
    // ... resto del código ...
  } catch (e) {
    log(`❌ Error guardando publicación: ${e.message}`);
    console.error(e);
}

async function cargarAsignacionCategoria() {
  try {
    // ... código anterior ...
    
    if (catData) {
      categoriaAsignada.detalles = catData;
      
      // Limpiar comillas dobles de las etiquetas
      let etiquetasRaw = catData.etiquetas || "";
      if (etiquetasRaw.startsWith('"') && etiquetasRaw.endsWith('"')) {
        etiquetasCategoria = etiquetasRaw.substring(1, etiquetasRaw.length - 1);
      } else {
        etiquetasCategoria = etiquetasRaw;
      }
      
      // Reemplazar comillas escapadas
      etiquetasCategoria = etiquetasCategoria.replace(/""/g, '"');
      
      $("#categoriaInfo").innerHTML = `
        <div><strong>Categoría:</strong> ${escapeHtml(data.categoria)}</div>
        <div><strong>Etiquetas:</strong> ${escapeHtml(etiquetasCategoria || "Sin etiquetas")}</div>
        <div><strong>Publicaciones diarias por cuenta:</strong> ${data.marketplace_daily}</div>
        <div><strong>Período:</strong> ${new Date(data.fecha_desde).toLocaleDateString()} al ${new Date(data.fecha_hasta).toLocaleDateString()}</div>
      `;
    }
    
    // ... resto del código ...
  } catch (e) {
    log(`❌ Error cargando asignación: ${e.message}`);
  }
}

function descargarTodasImagenes() {
  if (!contenidoSeleccionado) {
    log("❌ No hay contenido seleccionado");
    return;
  }
  
  const fila = contenidoSeleccionado;
  const urls = [];
  
  // Agregar imágenes fijas
  for (let i = 1; i <= 4; i++) {
    const url = fila[`url_img_fijas_${i}`];
    if (url) {
      const nombre = fila.titulo ? 
        `imagen_${i}_${fila.titulo.replace(/[^a-z0-9]/gi, '_').substring(0, 20)}.jpg` :
        `imagen_${i}.jpg`;
      urls.push({ url, name: nombre });
    }
  }
  
  // Agregar portada
  if (fila.url_imagenes_portadas) {
    const nombrePortada = fila.titulo ?
      `portada_${fila.titulo.replace(/[^a-z0-9]/gi, '_').substring(0, 20)}.jpg` :
      `portada.jpg`;
    urls.push({ url: fila.url_imagenes_portadas, name: nombrePortada });
  }
  
  if (urls.length === 0) {
    log("⚠️ No hay URLs de imágenes para descargar");
    return;
  }
  
  log(`⬇️ Descargando ${urls.length} imagen(es)...`);
  
  // Descargar cada imagen
  urls.forEach(item => {
    const a = document.createElement("a");
    a.href = item.url;
    a.download = item.name;
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  });
}

// Event Listeners
function setupEventListeners() {
  // Copiar contenido
  $("#btnCopiarTitulo")?.addEventListener("click", () => {
    navigator.clipboard.writeText($("#tituloInput").value);
    showCopiedFeedback($("#btnCopiarTitulo"));
  });
  
  $("#btnCopiarDescripcion")?.addEventListener("click", () => {
    navigator.clipboard.writeText($("#descripcionInput").value);
    showCopiedFeedback($("#btnCopiarDescripcion"));
  });
  
  $("#btnCopiarCategoria")?.addEventListener("click", () => {
    navigator.clipboard.writeText($("#categoriaInput").value);
    showCopiedFeedback($("#btnCopiarCategoria"));
  });
  
  $("#btnCopiarEtiquetas")?.addEventListener("click", () => {
    navigator.clipboard.writeText($("#etiquetasInput").value);
    showCopiedFeedback($("#btnCopiarEtiquetas"));
  });
  
  // Descargar imágenes
  $("#btnDescargarTodasImagenes")?.addEventListener("click", descargarTodasImagenes);
  
  // Cambiar contenido
  $("#btnCambiarContenido")?.addEventListener("click", () => {
    const nuevo = seleccionarContenidoAutomatico();
    if (nuevo) {
      log("🔄 Contenido cambiado manualmente");
    }
  });
  
  // Guardar publicación
  $("#btnGuardarPublicacion")?.addEventListener("click", guardarPublicacion);
  
  // Limpiar formulario (solo el link)
  $("#btnLimpiarFormulario")?.addEventListener("click", () => {
    $("#marketplaceLinkInput").value = "";
    log("🧹 Link limpiado");
  });
  
  // Limpiar logs
  $("#btnLimpiarLogs")?.addEventListener("click", clearLogs);
}

// Inicialización
document.addEventListener("DOMContentLoaded", async () => {
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
  
  log("✅ Sistema de diario listo");
});