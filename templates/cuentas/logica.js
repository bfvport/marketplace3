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

function pill(text) {
  return `<span class="pill pill-info">${escapeHtml(text)}</span>`;
}
function pillEstado(text) {
  const t = String(text || "").toLowerCase();
  const cls = t.includes("act") ? "pill pill-success" : "pill pill-warning";
  return `<span class="${cls}">${escapeHtml(text || "—")}</span>`;
}

function shortText(v, max = 16) {
  const s = String(v || "");
  if (!s) return "—";
  if (s.length <= max) return s;
  return s.slice(0, max) + "…";
}

function cellCopy(value) {
  const full = String(value || "");
  const shown = shortText(full, 18);
  const safeTitle = escapeHtml(full);

  if (!full) {
    return `<span class="muted">—</span>`;
  }

  return `
    <div class="cell-flex">
      <span class="val mono" title="${safeTitle}">${escapeHtml(shown)}</span>
      <button class="btn-mini" data-copy="${escapeHtml(full)}">Copiar</button>
    </div>
  `;
}

function cellLink(v) {
  const s = String(v || "").trim();
  if (!s) return `<span class="muted">—</span>`;
  const shown = escapeHtml(shortText(s, 28));
  return `<a href="${escapeHtml(s)}" target="_blank" rel="noopener" style="color:#60a5fa;" title="${escapeHtml(s)}">${shown}</a>`;
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
// Facebook (legacy) - FUENTE ÚNICA para facebook
// ----------------------------
async function fetchFacebookVisibles() {
  let q = sb
    .from(TABLA_FB)
    .select("id,nombre,email,contra,two_fa,ocupada_por,estado")
    .order("id", { ascending: true });

  if (!isGerente()) q = q.eq("ocupada_por", session.usuario);

  const { data, error } = await q;
  if (error) throw error;

  return (data || []).map((r) => ({
    plataforma: "facebook",
    nombre: r.nombre || r.email || `Cuenta ${r.id}`,
    correo: r.email || "—",
    pass: r.contra || "",
    twofa: r.two_fa || "",
    ocupadaPor: r.ocupada_por || "libre",
    estado: r.estado || "—",
    link: "",
  }));
}

// ----------------------------
// Cuentas unificadas (solo IG/TikTok/etc). IMPORTANTE:
// si la tabla "cuentas" tiene plataforma facebook, la IGNORAMOS para no duplicar.
// ----------------------------
async function fetchCuentasNoFacebookVisibles() {
  if (isGerente()) {
    const { data, error } = await sb
      .from(TABLA_CUENTAS)
      .select("id,plataforma,nombre,email,contra,two_fa,estado,handle,url,activo")
      .order("id", { ascending: true });

    if (error) throw error;

    return (data || [])
      .filter((c) => String(c.plataforma || "").toLowerCase() !== "facebook")
      .map((c) => ({
        plataforma: String(c.plataforma || "otra").toLowerCase(),
        nombre: c.nombre || c.handle || `Cuenta ${c.id}`,
        correo: c.email || "—",
        pass: c.contra || "",
        twofa: c.two_fa || "",
        ocupadaPor: "—", // la asignación se ve en otra pantalla; acá es vista unificada
        estado: c.estado || (c.activo ? "activa" : "inactiva"),
        link: c.url || c.handle || "",
      }));
  }

  // Operador: solo asignadas desde cuentas_asignadas
  const { data, error } = await sb
    .from(TABLA_ASIG)
    .select(`
      usuario,
      cuenta_id,
      cuentas:cuenta_id (
        id,plataforma,nombre,email,contra,two_fa,estado,handle,url,activo
      )
    `)
    .eq("usuario", session.usuario);

  if (error) throw error;

  return (data || [])
    .map((r) => r.cuentas)
    .filter(Boolean)
    .filter((c) => String(c.plataforma || "").toLowerCase() !== "facebook")
    .map((c) => ({
      plataforma: String(c.plataforma || "otra").toLowerCase(),
      nombre: c.nombre || c.handle || `Cuenta ${c.id}`,
      correo: c.email || "—",
      pass: c.contra || "",
      twofa: c.two_fa || "",
      ocupadaPor: session.usuario,
      estado: c.estado || (c.activo ? "activa" : "inactiva"),
      link: c.url || c.handle || "",
    }));
}

// ----------------------------
// Dedupe final (para asegurar 0 repetidos)
// ----------------------------
function dedupeRows(rows) {
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const key = [
      String(r.plataforma || ""),
      String(r.correo || ""),
      String(r.nombre || ""),
      String(r.link || ""),
    ].join("||").toLowerCase();

    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

function render(rows) {
  const tbody = $("#tablaCuentas tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="muted">No hay cuentas visibles.</td></tr>`;
    return;
  }

  for (const r of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="col-plataforma">${pill(r.plataforma)}</td>
      <td class="col-nombre"><strong title="${escapeHtml(r.nombre)}">${escapeHtml(r.nombre)}</strong></td>
      <td class="col-correo mono" title="${escapeHtml(r.correo)}">${escapeHtml(r.correo)}</td>

      <td class="col-pass">${cellCopy(r.pass)}</td>
      <td class="col-2fa">${cellCopy(r.twofa)}</td>

      <td class="col-ocupada mono" title="${escapeHtml(r.ocupadaPor)}">${escapeHtml(r.ocupadaPor)}</td>
      <td class="col-estado">${pillEstado(r.estado)}</td>
      <td class="col-link">${cellLink(r.link)}</td>
    `;

    tbody.appendChild(tr);
  }

  // bind copy buttons
  tbody.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const val = btn.getAttribute("data-copy") || "";
      try {
        await navigator.clipboard.writeText(val);
        btn.textContent = "✓";
        setTimeout(() => (btn.textContent = "Copiar"), 900);
      } catch {
        log("❌ No pude copiar al portapapeles.");
      }
    });
  });
}

async function cargarTodo() {
  log("⏳ Cargando cuentas...");

  const [fb, other] = await Promise.all([
    fetchFacebookVisibles().catch((e) => {
      log(`⚠️ Facebook: ${e.message}`);
      return [];
    }),
    fetchCuentasNoFacebookVisibles().catch((e) => {
      log(`⚠️ IG/TikTok: ${e.message}`);
      return [];
    }),
  ]);

  const rows = dedupeRows([...fb, ...other]);
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
