import { getSession, loadSidebar, escapeHtml, fmtDateAR } from "../../assets/js/app.js";

const $ = (sel) => document.querySelector(sel);

// ======================================================
// CONSTANTES
// ======================================================

// Legacy Facebook (NO SE TOCA)
const TABLA_CUENTAS_FB = "cuentas_facebook";

// Nuevas cuentas (Instagram / TikTok / otras)
const TABLA_CUENTAS = "cuentas";
const TABLA_CUENTAS_ASIGNADAS = "cuentas_asignadas";

// Operatoria diaria
const TABLA_USUARIOS_ASIGNADO = "usuarios_asignado";
const TABLA_MARKETPLACE_ACTIVIDAD = "marketplace_actividad";
const TABLA_CATEGORIA = "categoria";

// CSV categorías
const BUCKET_CSV = "categoria_csv";

// Drive (contenido)
const DRIVE_URL =
  "https://drive.google.com/drive/u/3/folders/1WEKYsaptpUnGCKOszZOKEAovzL5ld7j7";

// ======================================================
// ESTADO GLOBAL
// ======================================================
let session = null;
let supabaseClient = null;
let usuarioActual = null;

let cuentasAsignadas = [];
let cuentaSeleccionada = null;

let categoriaAsignada = null;
let etiquetasCategoria = "";

let csvData = [];
let contenidoUsado = new Set();
let publicacionesHoy = 0;

// ======================================================
// UTILIDADES
// ======================================================
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
  button.style.background = "rgba(34,197,94,.2)";
  setTimeout(() => {
    button.textContent = originalText;
    button.style.background = "";
  }, 1200);
}

// ======================================================
// SUPABASE
// ======================================================
async function waitSupabaseClient(timeoutMs = 2000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (window.supabaseClient) return window.supabaseClient;
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}

// ======================================================
// USUARIO
// ======================================================
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
      <div><strong>Rol:</strong> ${escapeHtml(data.rol || "No definido")}</div>
      <div><strong>Email:</strong> ${escapeHtml(data.email || "-")}</div>
    `;

    log(`✅ Usuario cargado: ${data.usuario}`);
  } catch (e) {
    log(`❌ Error cargando usuario: ${e.message}`);
  }
}

// ======================================================
// CUENTAS (UNIFICADAS)
// ======================================================

/**
 * Identificador único:
 * - Facebook legacy → email
 * - Nuevas → plataforma:id (ej instagram:12)
 */
function makeCuentaIdent(plataforma, id) {
  return `${String(plataforma).toLowerCase()}:${String(id)}`;
}

async function cargarCuentasLegacyFacebook() {
  const { data, error } = await supabaseClient
    .from(TABLA_CUENTAS_FB)
    .select("email, ocupada_por, estado")
    .eq("ocupada_por", session.usuario);

  if (error) throw error;

  return (data || []).map((c) => ({
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
    .select(`
      cuenta_id,
      cuentas:cuenta_id (
        id,
        plataforma,
        nombre_visible,
        usuario_handle,
        url,
        activo
      )
    `)
    .eq("usuario", session.usuario);

  if (error) throw error;

  return (data || [])
    .map((r) => r.cuentas)
    .filter(Boolean)
    .map((c) => ({
      email: c.nombre_visible || c.usuario_handle || `Cuenta ${c.id}`,
      estado: c.activo ? "activa" : "inactiva",
      plataforma: c.plataforma,
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
    const fb = await cargarCuentasLegacyFacebook();
    let nuevas = [];

    try {
      nuevas = await cargarCuentasNuevasAsignadas();
    } catch (e) {
      log(`⚠️ Cuentas nuevas no disponibles: ${e.message}`);
    }

    cuentasAsignadas = [...fb, ...nuevas];

    for (const c of cuentasAsignadas) {
      c.publicacionesHoy = await contarPublicacionesHoyPorIdent(c.ident);
    }

    renderTablaCuentas();
    log(`✅ ${cuentasAsignadas.length} cuentas cargadas`);
  } catch (e) {
    log(`❌ Error cargando cuentas: ${e.message}`);
  }
}

// ======================================================
// (TODO LO DEMÁS: categoría, CSV, historial, guardar publicación)
// 👉 QUEDA EXACTAMENTE IGUAL A LO QUE PEGASTE
// 👉 NO SE ROMPE NADA
// ======================================================

// ⛔️ IMPORTANTE
// El guardado del LINK ya está correcto en:
// marketplace_link_publicacion
// y se muestra correctamente en historial y verificación.

// ======================================================
// INIT
// ======================================================
document.addEventListener("DOMContentLoaded", async () => {
  session = getSession();
  if (!session?.usuario) {
    $("#log").innerHTML = "❌ No hay sesión activa.";
    return;
  }

  await loadSidebar({ activeKey: "diario", basePath: "../" });

  supabaseClient = await waitSupabaseClient(2000);
  if (!supabaseClient) {
    log("❌ Supabase no disponible");
    return;
  }

  const hoy = fmtDateAR();
  $("#pill-hoy") && ($("#pill-hoy").textContent = `Hoy (AR): ${hoy}`);
  $("#driveFecha") &&
    ($("#driveFecha").innerHTML = `Contenido del día <strong>${hoy}</strong>`);

  log("✅ Supabase conectado");

  await cargarInformacionUsuario();
  await cargarAsignacionCategoria();
  await cargarCuentas();
  await cargarHistorialHoy();

  setupEventListeners();

  log("🚀 Diario listo (FB + IG + TikTok)");
});
