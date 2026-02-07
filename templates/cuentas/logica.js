import { getSession, loadSidebar, escapeHtml } from "../../assets/js/app.js";

const $ = (s) => document.querySelector(s);

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

function setSensitiveVisible(show) {
  document.querySelectorAll(".col-sensible").forEach((el) => {
    el.style.display = show ? "" : "none";
  });
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

async function fetchFacebook() {
  let q = sb.from(TABLA_FB).select("id,nombre,email,contra,two_fa,ocupada_por,estado").order("id", { ascending: true });
  if (!isGerente()) q = q.eq("ocupada_por", session.usuario);

  const { data, error } = await q;
  if (error) throw error;

  return (data || []).map((r) => ({
    plataforma: "facebook",
    nombre: r.nombre || r.email || "—",
    correo: r.email || "—",
    pass: r.contra || "—",
    twofa: r.two_fa || "—",
    ocupada: r.ocupada_por || "libre",
    estado: r.estado || "—",
    link: "—",
  }));
}

async function fetchNuevas() {
  if (isGerente()) {
    const { data, error } = await sb
      .from(TABLA_CUENTAS)
      .select(`id,plataforma,nombre,handle,url,activo, cuentas_asignadas:cuentas_asignadas ( usuario )`)
      .order("id", { ascending: true });

    if (error) throw error;

    return (data || []).map((c) => {
      const asign = Array.isArray(c.cuentas_asignadas) && c.cuentas_asignadas.length
        ? c.cuentas_asignadas.map((a) => a.usuario).filter(Boolean).join(", ")
        : "libre";

      return {
        plataforma: String(c.plataforma || "otra").toLowerCase(),
        nombre: c.nombre || c.handle || `Cuenta ${c.id}`,
        correo: "—",
        pass: "—",
        twofa: "—",
        ocupada: asign || "libre",
        estado: c.activo ? "activa" : "inactiva",
        link: c.url || c.handle || "—",
      };
    });
  }

  // Operador: SOLO asignadas
  const { data, error } = await sb
    .from(TABLA_ASIG)
    .select(`usuario, cuenta_id, cuentas:cuenta_id ( id,plataforma,nombre,handle,url,activo )`)
    .eq("usuario", session.usuario);

  if (error) throw error;

  return (data || [])
    .map((r) => r.cuentas)
    .filter(Boolean)
    .map((c) => ({
      plataforma: String(c.plataforma || "otra").toLowerCase(),
      nombre: c.nombre || c.handle || `Cuenta ${c.id}`,
      correo: "—",
      pass: "—",
      twofa: "—",
      ocupada: session.usuario,
      estado: c.activo ? "activa" : "inactiva",
      link: c.url || c.handle || "—",
    }));
}

function render(rows) {
  const tbody = $("#tablaCuentas tbody");
  tbody.innerHTML = "";

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="muted">No hay cuentas</td></tr>`;
    return;
  }

  for (const r of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${pill(r.plataforma)}</td>
      <td><strong>${escapeHtml(r.nombre)}</strong></td>
      <td class="mono">${escapeHtml(r.correo)}</td>
      <td class="mono col-sensible">${escapeHtml(r.pass)}</td>
      <td class="mono col-sensible">${escapeHtml(r.twofa)}</td>
      <td class="mono">${escapeHtml(r.ocupada)}</td>
      <td>${r.estado === "activa" ? pill("activa","success") : pill(r.estado,"warning")}</td>
      <td>${
        r.link && r.link !== "—"
          ? `<a href="${escapeHtml(r.link)}" target="_blank" style="color:#60a5fa;">${escapeHtml(String(r.link).slice(0, 60))}${String(r.link).length > 60 ? "..." : ""}</a>`
          : `<span class="muted">—</span>`
      }</td>
    `;
    tbody.appendChild(tr);
  }
}

async function cargarTodo() {
  log("⏳ Cargando...");
  const fb = await fetchFacebook();
  const nuevas = await fetchNuevas();
  const rows = [...fb, ...nuevas];

  setSensitiveVisible(isGerente());
  render(rows);

  log(`✅ Listo: ${rows.length} cuenta(s)`);
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
