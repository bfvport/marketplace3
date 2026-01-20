import { requireSession } from "../../assets/js/app.js";

const s = requireSession();
const sb = window.supabaseClient;
const $ = (id) => document.getElementById(id);

let cuentasCache = [];

/* =========================
   Sidebar robusto SIN tocar app.js
========================= */
async function fetchFirstOk(urls) {
  for (const u of urls) {
    try {
      const r = await fetch(u, { cache: "no-store" });
      if (r.ok) return { url: u, text: await r.text() };
    } catch {}
  }
  return null;
}
async function loadSidebarLocal({ activeKey = "", basePath = "../" } = {}) {
  const host = document.getElementById("sidebar-host");
  if (!host) return;

  // probamos varias rutas comunes para no depender de app.js
  const urls = [
    `${basePath}sidebar/sidebar_gerente.html`,
    `${basePath}sidebar_gerente.html`,
    `${basePath}sidebar.html`,
    `${basePath}sidebar/sidebar.html`,
  ];

  const got = await fetchFirstOk(urls);
  if (!got) {
    host.innerHTML = `<div style="color:white;padding:14px;">❌ No encontré sidebar (gerente). Revisá rutas.</div>`;
    return;
  }

  host.innerHTML = got.text;
  if (activeKey) {
    host.querySelectorAll("[data-key]").forEach(el => {
      el.classList.toggle("active", el.getAttribute("data-key") === activeKey);
    });
  }
}

/* =========================
   Helpers
========================= */
function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function addDaysISO(baseISO, days) {
  const d = new Date(baseISO + "T00:00:00");
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function getCfgFromInputs() {
  return {
    meta_historias: parseInt($("cfg-historias").value, 10) || 0,
    meta_muro: parseInt($("cfg-muro").value, 10) || 0,
    meta_reels: parseInt($("cfg-reels").value, 10) || 0,
    meta_grupos: parseInt($("cfg-grupos").value, 10) || 0,
    link_drive: ($("cfg-drive").value || "").trim(),
  };
}
// Rutina aleatoria “conservadora” usando topes del gerente
function rutinaAleatoriaDesde(cfg) {
  const H = Math.max(0, cfg.meta_historias);
  const M = Math.max(0, cfg.meta_muro);
  const R = Math.max(0, cfg.meta_reels);
  const G = Math.max(0, cfg.meta_grupos);

  const h = H > 0 ? randInt(Math.max(1, H - 1), H) : 0;
  const m = M > 0 ? randInt(Math.max(0, M - 1), M) : 0;
  const r = R > 0 ? randInt(Math.max(0, R - 1), R) : 0;
  const g = G > 0 ? randInt(Math.max(0, G - 1), G) : 0;

  if (h + m + r + g === 0) return { h: 1, m: 0, r: 0, g: 0 };
  return { h, m, r, g };
}

function actualizarContadorSeleccion() {
  const checked = document.querySelectorAll(".ck-cuenta:checked").length;
  $("sel-count").textContent = `${checked} seleccionadas`;
  $("btn-plan-7d").disabled = checked === 0;
}
function getSeleccionadasIds() {
  return Array.from(document.querySelectorAll(".ck-cuenta:checked"))
    .map(x => Number(x.getAttribute("data-id")))
    .filter(Boolean);
}

/* =========================
   Init
========================= */
(async function init() {
  await loadSidebarLocal({ activeKey: "calentamiento_gerente", basePath: "../" });

  if (s.rol !== "gerente") {
    document.body.innerHTML = `
      <div style="text-align:center; padding:50px; color:white;">
        <h1 style="color:#ef4444;">⛔ Acceso Denegado</h1>
        <p>Esta página es exclusiva para Gerencia.</p>
        <a href="../dashboard/dashboard.html" style="color:#3b82f6;">Volver</a>
      </div>`;
    return;
  }

  $("btn-save").onclick = guardarConfiguracion;
  $("btn-plan-7d").onclick = generarPlan7DiasSeleccionadas;
  $("btn-sel-all").onclick = () => toggleSeleccion(true);
  $("btn-sel-none").onclick = () => toggleSeleccion(false);

  document.addEventListener("change", (e) => {
    if (e.target?.classList?.contains("ck-cuenta")) actualizarContadorSeleccion();
  });

  await cargarConfiguracion();
  await cargarCuentas();
  actualizarContadorSeleccion();
})();

/* =========================
   Configuración global (drive + topes)
   - SIN usar id=1 para evitar "cannot insert non-default into id"
========================= */
async function cargarConfiguracion() {
  const { data, error } = await sb
    .from("configuracion_calentamiento")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error(error);
    return;
  }

  const cfg = data?.[0];
  if (!cfg) return;

  $("cfg-historias").value = cfg.meta_historias || 0;
  $("cfg-muro").value = cfg.meta_muro || 0;
  $("cfg-reels").value = cfg.meta_reels || 0;
  $("cfg-grupos").value = cfg.meta_grupos || 0;
  $("cfg-drive").value = cfg.link_drive || "";
}

async function guardarConfiguracion() {
  const payload = {
    meta_historias: parseInt($("cfg-historias").value, 10) || 0,
    meta_muro: parseInt($("cfg-muro").value, 10) || 0,
    meta_reels: parseInt($("cfg-reels").value, 10) || 0,
    meta_grupos: parseInt($("cfg-grupos").value, 10) || 0,
    link_drive: ($("cfg-drive").value || "").trim(),
    updated_at: new Date(),
  };

  // buscamos la última fila y actualizamos por id; si no existe, insertamos
  const { data: last, error: eLast } = await sb
    .from("configuracion_calentamiento")
    .select("id")
    .order("updated_at", { ascending: false })
    .limit(1);

  if (eLast) return alert("❌ Error leyendo config: " + eLast.message);

  if (last && last.length) {
    const id = last[0].id;
    const { error } = await sb.from("configuracion_calentamiento").update(payload).eq("id", id);
    if (error) return alert("❌ Error guardando: " + error.message);
    alert("✅ Estrategia actualizada.");
  } else {
    const { error } = await sb.from("configuracion_calentamiento").insert([payload]);
    if (error) return alert("❌ Error guardando: " + error.message);
    alert("✅ Estrategia creada.");
  }
}

/* =========================
   Cuentas (tabla + selección)
========================= */
async function cargarCuentas() {
  const { data, error } = await sb
    .from("cuentas_facebook")
    .select("*")
    .order("calidad");

  if (error) return alert("❌ Error cargando cuentas: " + error.message);

  cuentasCache = data || [];

  const baneadas = cuentasCache.filter(c => c.calidad === "baneada" || c.estado === "inactiva").length;
  const frias = cuentasCache.filter(c => c.calidad === "fria" || c.calidad === "nueva").length;
  const calientes = cuentasCache.filter(c => c.calidad === "caliente").length;

  $("stat-baneadas").textContent = baneadas;
  $("stat-frias").textContent = frias;
  $("stat-calientes").textContent = calientes;

  const tbody = $("tabla-cuentas");
  tbody.innerHTML = "";

  for (const c of cuentasCache) {
    const inactiva = (c.calidad === "baneada" || c.estado === "inactiva");
    const libre = !c.ocupada_por;
    const habilitada = !inactiva && !libre;

    let colorEstado = "#94a3b8";
    if (c.calidad === "caliente") colorEstado = "#10b981";
    if (c.calidad === "fria" || c.calidad === "nueva") colorEstado = "#3b82f6";
    if (c.calidad === "baneada") colorEstado = "#ef4444";

    tbody.innerHTML += `
      <tr>
        <td>
          <input class="ck ck-cuenta" type="checkbox" data-id="${c.id}" ${habilitada ? "" : "disabled"}>
        </td>
        <td>${c.email}</td>
        <td class="muted">${c.ocupada_por || "Libre"}</td>
        <td style="color:${colorEstado}; font-weight:800; text-transform:uppercase;">${c.calidad}</td>
        <td>
          ${c.calidad !== "baneada"
            ? `<button class="btn-danger" style="padding:4px 8px; font-size:0.75rem;" onclick="reportarBan('${c.id}')">☠️ Ban</button>`
            : `<span class="muted">Inactiva</span>`
          }
        </td>
      </tr>
    `;
  }

  actualizarContadorSeleccion();
}

function toggleSeleccion(checked) {
  document.querySelectorAll(".ck-cuenta").forEach(ck => {
    if (ck.disabled) return;
    ck.checked = checked;
  });
  actualizarContadorSeleccion();
}

window.reportarBan = async (id) => {
  if (!confirm("¿Confirmás que esta cuenta está BANEADA / INACTIVA?")) return;

  const { error } = await sb
    .from("cuentas_facebook")
    .update({ calidad: "baneada", estado: "inactiva" })
    .eq("id", id);

  if (error) return alert("❌ Error: " + error.message);

  alert("✅ Cuenta marcada como baneada/inactiva.");
  await cargarCuentas();
};

/* =========================
   Plan 7 días (aleatorio) por cuenta seleccionada
   - Guarda en calentamiento_plan (upsert por fecha,cuenta_id)
========================= */
async function generarPlan7DiasSeleccionadas() {
  const ids = getSeleccionadasIds();
  if (!ids.length) return alert("Seleccioná al menos 1 cuenta.");

  const cfg = getCfgFromInputs();
  const start = todayISO();

  const rows = [];
  for (let i = 0; i < 7; i++) {
    const fecha = addDaysISO(start, i);

    for (const cuenta_id of ids) {
      const c = cuentasCache.find(x => Number(x.id) === Number(cuenta_id));
      if (!c) continue;

      const inactiva = (c.calidad === "baneada" || c.estado === "inactiva");
      const libre = !c.ocupada_por;
      if (inactiva || libre) continue;

      const r = rutinaAleatoriaDesde(cfg);

      rows.push({
        fecha,
        cuenta_id: Number(cuenta_id),
        usuario: c.ocupada_por,
        req_historias: r.h,
        req_muro: r.m,
        req_reels: r.r,
        req_grupos: r.g,
        done_historias: 0,
        done_muro: 0,
        done_reels: 0,
        done_grupos: 0,
        estado: "pendiente",
      });
    }
  }

  if (!rows.length) return alert("No hay cuentas válidas (libres/inactivas).");

  const { error } = await sb
    .from("calentamiento_plan")
    .upsert(rows, { onConflict: "fecha,cuenta_id" });

  if (error) return alert("❌ Error generando plan: " + error.message);

  alert(`✅ Plan 7 días generado. Filas: ${rows.length}`);
}
