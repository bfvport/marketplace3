import { getSession, loadSidebar, escapeHtml } from "../../assets/js/app.js";

const $ = (s) => document.querySelector(s);

// Tablas
const TABLA_USUARIOS = "usuarios";
const TABLA_FB = "cuentas_facebook";
const TABLA_CUENTAS = "cuentas";
const TABLA_ASIG = "cuentas_asignadas";

let session = null;
let sb = null;
let usuarioActual = null;

function log(msg) {
  const el = $("#log");
  if (!el) return;
  const t = new Date().toTimeString().slice(0, 8);
  el.innerHTML += `[${t}] ${escapeHtml(msg)}<br>`;
  el.scrollTop = el.scrollHeight;
}

async function waitSupabaseClient(timeoutMs = 2500) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (window.supabaseClient) return window.supabaseClient;
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}

function isGerente() {
  return String(usuarioActual?.rol || "").toLowerCase() === "gerente";
}

function pill(text, kind = "info") {
  const cls =
    kind === "success" ? "pill pill-success" :
    kind === "warning" ? "pill pill-warning" :
    "pill pill-info";
  return `<span class="${cls}">${escapeHtml(text)}</span>`;
}

async function cargarUsuario() {
  const { data, error } = await sb
    .from(TABLA_USUARIOS)
    .select("*")
    .eq("usuario", session.usuario)
    .single();

  if (error) throw error;
  usuarioActual = data;
}

// ----------------------------
// Facebook (tabla legacy)
// ----------------------------
async function fetchFacebookVisibles() {
  // Gerente: todo. Operador: solo las que le asignaron (ocupada_por)
  let q = sb
    .from(TABLA_FB)
    .select("id,nombre,email,contra,two_fa,ocupada_por,estado")
    .order("id", { ascending: true });

  if (!isGerente()) q = q.eq("ocupada_por", session.usuario);

  const { data, error } = await q;
  if (error) throw error;

  return (data || []).map((r) => ({
    fuente: "cuentas_facebook",
    plataforma: "facebook",
    nombre: r.nombre || r.email || `Cuenta ${r.id}`,
    correo: r.email || "—",
    pass: r.contra || "—",
    twofa: r.two_fa || "—",
    asignadaA: r.ocupada_por || "libre",
    estado: r.estado || "—",
    link: "—",
  }));
}

// ----------------------------
// Cuentas unificadas (tabla cuentas)
// ----------------------------
async function fetchCuentasVisibles() {
  // IMPORTANT:
  // - En algunas bases viejas, "cuentas" solo tiene plataforma/nombre/handle/url/activo.
  // - En el modelo nuevo (que vos querés), "cuentas" tiene también email/contra/two_fa/estado.
  // Este fetch intenta primero el modelo nuevo y si falla, cae al viejo sin romper UI.

  if (isGerente()) {
    // 1) Intento modelo nuevo (con datos sensibles)
    try {
      const { data, error } = await sb
        .from(TABLA_CUENTAS)
        .select(`
          id,
          plataforma,
          nombre,
          email,
          contra,
          two_fa,
          estado,
          handle,
          url,
          activo,
          cuentas_asignadas:cuentas_asignadas ( usuario )
        `)
        .order("id", { ascending: true });

      if (error) throw error;

      return (data || []).map((c) => {
        const asign = Array.isArray(c.cuentas_asignadas) && c.cuentas_asignadas.length
          ? c.cuentas_asignadas.map((a) => a.usuario).filter(Boolean).join(", ")
          : "libre";

        return {
          fuente: "cuentas",
          plataforma: String(c.plataforma || "otra").toLowerCase(),
          nombre: c.nombre || c.handle || `Cuenta ${c.id}`,
          correo: c.email || "—",
          pass: c.contra || "—",
          twofa: c.two_fa || "—",
          asignadaA: asign || "libre",
          estado: c.estado || (c.activo ? "activa" : "inactiva"),
          link: c.url || c.handle || "—",
        };
      });
    } catch (e) {
      // 2) Fallback: modelo viejo (sin datos sensibles)
      const { data, error } = await sb
        .from(TABLA_CUENTAS)
        .select(`
          id,
          plataforma,
          nombre,
          handle,
          url,
          activo,
          cuentas_asignadas:cuentas_asignadas ( usuario )
        `)
        .order("id", { ascending: true });

      if (error) throw error;

      return (data || []).map((c) => {
        const asign = Array.isArray(c.cuentas_asignadas) && c.cuentas_asignadas.length
          ? c.cuentas_asignadas.map((a) => a.usuario).filter(Boolean).join(", ")
          : "libre";

        return {
          fuente: "cuentas",
          plataforma: String(c.plataforma || "otra").toLowerCase(),
          nombre: c.nombre || c.handle || `Cuenta ${c.id}`,
          correo: "—",
          pass: "—",
          twofa: "—",
          asignadaA: asign || "libre",
          estado: c.activo ? "activa" : "inactiva",
          link: c.url || c.handle || "—",
        };
      });
    }
  }

  // Operador: SOLO asignadas (cuentas_asignadas)
  // 1) Intento modelo nuevo
  try {
    const { data, error } = await sb
      .from(TABLA_ASIG)
      .select(`
        usuario,
        cuenta_id,
        cuentas:cuenta_id (
          id,
          plataforma,
          nombre,
          email,
          contra,
          two_fa,
          estado,
          handle,
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
        fuente: "cuentas_asignadas",
        plataforma: String(c.plataforma || "otra").toLowerCase(),
        nombre: c.nombre || c.handle || `Cuenta ${c.id}`,
        correo: c.email || "—",
        pass: c.contra || "—",
        twofa: c.two_fa || "—",
        asignadaA: session.usuario,
        estado: c.estado || (c.activo ? "activa" : "inactiva"),
        link: c.url || c.handle || "—",
      }));
  } catch (e) {
    // 2) Fallback modelo viejo
    const { data, error } = await sb
      .from(TABLA_ASIG)
      .select(`
        usuario,
        cuenta_id,
        cuentas:cuenta_id (
          id,
          plataforma,
          nombre,
          handle,
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
        fuente: "cuentas_asignadas",
        plataforma: String(c.plataforma || "otra").toLowerCase(),
        nombre: c.nombre || c.handle || `Cuenta ${c.id}`,
        correo: "—",
        pass: "—",
        twofa: "—",
        asignadaA: session.usuario,
        estado: c.activo ? "activa" : "inactiva",
        link: c.url || c.handle || "—",
      }));
  }
}

function render(rows) {
  const tbody = $("#tablaCuentas tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="muted">No hay cuentas visibles para este usuario.</td></tr>`;
    return;
  }

  for (const r of rows) {
    const tr = document.createElement("tr");
    const estadoKind = String(r.estado || "").toLowerCase().includes("act") ? "success" : "warning";

    tr.innerHTML = `
      <td>${pill(r.plataforma)}</td>
      <td><strong>${escapeHtml(r.nombre)}</strong></td>
      <td class="mono">${escapeHtml(r.correo)}</td>
      <td class="mono col-sensible">${escapeHtml(r.pass)}</td>
      <td class="mono col-sensible">${escapeHtml(r.twofa)}</td>
      <td class="mono">${escapeHtml(r.asignadaA)}</td>
      <td>${pill(r.estado || "—", estadoKind)}</td>
      <td>
        ${
          r.link && r.link !== "—"
            ? `<a href="${escapeHtml(r.link)}" target="_blank" rel="noopener" style="color:#60a5fa;">${escapeHtml(String(r.link).slice(0, 60))}${String(r.link).length > 60 ? "..." : ""}</a>`
            : `<span class="muted">—</span>`
        }
      </td>
    `;
    tbody.appendChild(tr);
  }
}

async function cargarTodo() {
  log("⏳ Cargando cuentas...");

  const [fb, cuentas] = await Promise.all([
    fetchFacebookVisibles().catch((e) => {
      log(`⚠️ Facebook: ${e.message}`);
      return [];
    }),
    fetchCuentasVisibles().catch((e) => {
      log(`⚠️ Cuentas: ${e.message}`);
      return [];
    }),
  ]);

  const rows = [...fb, ...cuentas];
  render(rows);
  log(`✅ Listo: ${rows.length} cuenta(s) visibles`);
}

document.addEventListener("DOMContentLoaded", async () => {
  session = getSession();
  if (!session?.usuario) {
    $("#log").innerHTML = "❌ No hay sesión activa.";
    return;
  }

  await loadSidebar({ activeKey: "cuentas", basePath: "../" });

  sb = await waitSupabaseClient(2500);
  if (!sb) {
    log("❌ No se pudo conectar a Supabase");
    return;
  }

  try {
    await cargarUsuario();
    await cargarTodo();
  } catch (e) {
    log(`❌ Error: ${e.message}`);
    console.error(e);
  }
});
