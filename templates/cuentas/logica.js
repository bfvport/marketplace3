import { getSession, loadSidebar, escapeHtml } from "../../assets/js/app.js";

const $ = (sel) => document.querySelector(sel);

const TABLA_USUARIOS = "usuarios";
const TABLA_CUENTAS_FB = "cuentas_facebook";
const TABLA_CUENTAS = "cuentas";
const TABLA_CUENTAS_ASIGNADAS = "cuentas_asignadas";

let session = null;
let supabaseClient = null;
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

async function cargarUsuario() {
  const { data, error } = await supabaseClient
    .from(TABLA_USUARIOS)
    .select("*")
    .eq("usuario", session.usuario)
    .single();

  if (error) throw error;
  usuarioActual = data;

  $("#userInfo").innerHTML = `
    <div><strong>Usuario:</strong> ${escapeHtml(data.usuario)}</div>
    <div><strong>Rol:</strong> ${escapeHtml(data.rol || "no definido")}</div>
    <div><strong>Email:</strong> ${escapeHtml(data.email || "-")}</div>
  `;
}

function isGerente() {
  return String(usuarioActual?.rol || "").toLowerCase() === "gerente";
}

function setSensitiveColumnsVisible(show) {
  document.querySelectorAll(".col-sensible").forEach((el) => el.classList.toggle("hide", !show));
}

function pill(text, type = "info") {
  const cls = type === "success" ? "pill pill-success" : type === "warning" ? "pill pill-warning" : "pill pill-info";
  return `<span class="${cls}">${escapeHtml(text)}</span>`;
}

async function fetchCuentasFacebook() {
  let q = supabaseClient
    .from(TABLA_CUENTAS_FB)
    .select("id, nombre, email, contra, two_fa, ocupada_por, estado");

  if (!isGerente()) q = q.eq("ocupada_por", session.usuario);

  const { data, error } = await q.order("id", { ascending: true });
  if (error) throw error;

  return (data || []).map((c) => ({
    plataforma: "facebook",
    nombre: c.nombre || c.email || "—",
    correo: c.email || "—",
    password: c.contra || "—",
    twofa: c.two_fa || "—",
    ocupada_por: c.ocupada_por || "libre",
    estado: c.estado || "—",
    link_o_handle: "—",
  }));
}

async function fetchCuentasSociales() {
  if (isGerente()) {
    const { data, error } = await supabaseClient
      .from(TABLA_CUENTAS)
      .select(`id, plataforma, nombre, handle, url, activo, cuentas_asignadas:cuentas_asignadas ( usuario )`)
      .order("id", { ascending: true });

    if (error) throw error;

    return (data || []).map((c) => {
      const asign = Array.isArray(c.cuentas_asignadas) && c.cuentas_asignadas.length
        ? c.cuentas_asignadas.map(a => a.usuario).filter(Boolean).join(", ")
        : "libre";

      return {
        plataforma: String(c.plataforma || "otra").toLowerCase(),
        nombre: c.nombre || `Cuenta ${c.id}`,
        correo: "—",
        password: "—",
        twofa: "—",
        ocupada_por: asign || "libre",
        estado: c.activo ? "activa" : "inactiva",
        link_o_handle: c.url || c.handle || "—",
      };
    });
  }

  const { data, error } = await supabaseClient
    .from(TABLA_CUENTAS_ASIGNADAS)
    .select(`usuario, cuenta_id, cuentas:cuenta_id ( id, plataforma, nombre, handle, url, activo )`)
    .eq("usuario", session.usuario)
    .order("cuenta_id", { ascending: true });

  if (error) throw error;

  return (data || [])
    .map((r) => r.cuentas)
    .filter(Boolean)
    .map((c) => ({
      plataforma: String(c.plataforma || "otra").toLowerCase(),
      nombre: c.nombre || `Cuenta ${c.id}`,
      correo: "—",
      password: "—",
      twofa: "—",
      ocupada_por: session.usuario,
      estado: c.activo ? "activa" : "inactiva",
      link_o_handle: c.url || c.handle || "—",
    }));
}

function renderTabla(rows) {
  const tbody = $("#tablaCuentas tbody");
  tbody.innerHTML = "";

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="muted">No hay cuentas para mostrar</td></tr>`;
    return;
  }

  for (const r of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${pill(r.plataforma)}</td>
      <td><strong>${escapeHtml(r.nombre)}</strong></td>
      <td class="mono">${escapeHtml(r.correo || "—")}</td>
      <td class="mono col-sensible">${escapeHtml(r.password || "—")}</td>
      <td class="mono col-sensible">${escapeHtml(r.twofa || "—")}</td>
      <td class="mono">${escapeHtml(r.ocupada_por || "libre")}</td>
      <td>${r.estado === "activa" ? pill("activa","success") : pill(r.estado || "—","warning")}</td>
      <td>
        ${
          r.link_o_handle && r.link_o_handle !== "—"
            ? `<a href="${escapeHtml(r.link_o_handle)}" target="_blank" style="color:#60a5fa;">${escapeHtml(String(r.link_o_handle).slice(0, 60))}${String(r.link_o_handle).length > 60 ? "…" : ""}</a>`
            : `<span class="muted">—</span>`
        }
      </td>
    `;
    tbody.appendChild(tr);
  }
}

async function cargarTodo() {
  log("⏳ Cargando cuentas…");
  const fb = await fetchCuentasFacebook();
  const social = await fetchCuentasSociales();
  const rows = [...fb, ...social];

  setSensitiveColumnsVisible(isGerente());
  renderTabla(rows);
  log(`✅ Listo: ${rows.length} cuenta(s)`);
}

document.addEventListener("DOMContentLoaded", async () => {
  session = getSession();
  if (!session?.usuario) {
    $("#log").innerHTML = "❌ No hay sesión activa. Volvé al login.";
    return;
  }

  // ✅ sidebar siempre
  await loadSidebar({ activeKey: "cuentas", basePath: "../" });

  supabaseClient = await waitSupabaseClient(2500);
  if (!supabaseClient) {
    log("❌ No se pudo conectar con Supabase");
    return;
  }

  try {
    await cargarUsuario();
    await cargarTodo();
  } catch (e) {
    log(`❌ Error: ${e.message}`);
    console.error(e);
  }

  $("#btnRefrescar")?.addEventListener("click", async () => {
    try { await cargarTodo(); } catch (e) { log(`❌ ${e.message}`); }
  });
});
