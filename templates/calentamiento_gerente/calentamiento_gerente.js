import { requireSession, loadSidebar } from "../../assets/js/app.js";

const s = requireSession();
const sb = window.supabaseClient;
const $ = (id) => document.getElementById(id);

// Estado
let cuentasCache = [];
let configCache = {
  meta_historias: 0,
  meta_muro: 0,
  meta_reels: 0,
  meta_grupos: 0,
  link_drive: ""
};

// Inicialización
(async function init() {
  await loadSidebar({ activeKey: "calentamiento_gerente", basePath: "../" });

  // 1) Seguridad (Solo Gerentes)
  if (s.rol !== "gerente") {
    document.body.innerHTML = `
      <div style="text-align:center; padding:50px; color:white;">
        <h1 style="color:#ef4444;">⛔ Acceso Denegado</h1>
        <p>Esta configuración es exclusiva para Gerencia.</p>
        <a href="../dashboard/dashboard.html" style="color:#3b82f6;">Volver</a>
      </div>`;
    return;
  }

  await cargarConfiguracion();
  await cargarCuentas();

  // Botones
  $("btn-save").onclick = guardarConfiguracion;

  // Si tenés este botón en el HTML, lo usamos (si no existe, no rompe)
  const btnAplicar = $("btn-aplicar");
  if (btnAplicar) btnAplicar.onclick = aplicarEstrategiaACuentasSeleccionadas;

  // Helpers de selección (si existen en el HTML)
  const btnSelAll = $("btn-sel-all");
  if (btnSelAll) btnSelAll.onclick = () => toggleSeleccion(true);

  const btnSelNone = $("btn-sel-none");
  if (btnSelNone) btnSelNone.onclick = () => toggleSeleccion(false);

  // Delegación para checkbox (no hace falta re-crear listeners por fila)
  document.addEventListener("change", (e) => {
    if (e.target && e.target.classList && e.target.classList.contains("ck-cuenta")) {
      actualizarEstadoSeleccion();
    }
  });

  actualizarEstadoSeleccion();
})();

// --- Utilidades ---
function hoyISO() {
  // YYYY-MM-DD
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function intVal(id) {
  return parseInt($(id)?.value, 10) || 0;
}

function getCfgFromInputs() {
  return {
    meta_historias: intVal("cfg-historias"),
    meta_muro: intVal("cfg-muro"),
    meta_reels: intVal("cfg-reels"),
    meta_grupos: intVal("cfg-grupos"),
    link_drive: $("cfg-drive")?.value?.trim() || ""
  };
}

function getSeleccionadasIds() {
  return Array.from(document.querySelectorAll(".ck-cuenta:checked"))
    .map((el) => el.getAttribute("data-id"))
    .filter(Boolean);
}

function toggleSeleccion(checked) {
  document.querySelectorAll(".ck-cuenta").forEach((ck) => {
    // si la cuenta no es asignable (libre o baneada) no la tocamos
    if (ck.disabled) return;
    ck.checked = checked;
  });
  actualizarEstadoSeleccion();
}

function actualizarEstadoSeleccion() {
  const sel = getSeleccionadasIds();
  const lbl = $("sel-count");
  if (lbl) lbl.textContent = `${sel.length} seleccionadas`;

  const btnAplicar = $("btn-aplicar");
  if (btnAplicar) btnAplicar.disabled = sel.length === 0;
}

// --- LÓGICA DE CONFIGURACIÓN GLOBAL ---
async function cargarConfiguracion() {
  const { data: config, error } = await sb
    .from("configuracion_calentamiento")
    .select("*")
    .single();

  if (error && error.code !== "PGRST116") {
    console.error("Error cargando config:", error);
    return;
  }

  if (config) {
    $("cfg-historias").value = config.meta_historias || 0;
    $("cfg-muro").value = config.meta_muro || 0;
    $("cfg-reels").value = config.meta_reels || 0;
    $("cfg-grupos").value = config.meta_grupos || 0;
    $("cfg-drive").value = config.link_drive || "";

    configCache = {
      meta_historias: config.meta_historias || 0,
      meta_muro: config.meta_muro || 0,
      meta_reels: config.meta_reels || 0,
      meta_grupos: config.meta_grupos || 0,
      link_drive: config.link_drive || ""
    };
  }
}

async function guardarConfiguracion() {
  const payload = {
    meta_historias: intVal("cfg-historias"),
    meta_muro: intVal("cfg-muro"),
    meta_reels: intVal("cfg-reels"),
    meta_grupos: intVal("cfg-grupos"),
    link_drive: $("cfg-drive").value,
    updated_at: new Date()
  };

  // ✅ Upsert (config global fija en id=1)
  const { error } = await sb
    .from("configuracion_calentamiento")
    .upsert({ id: 1, ...payload });

  if (error) {
    alert("❌ Error al guardar: " + error.message);
  } else {
    configCache = { ...payload };
    alert("✅ Estrategia global actualizada. Ahora podés aplicarla a cuentas.");
  }
}

// --- LÓGICA DE GESTIÓN DE CUENTAS ---
async function cargarCuentas() {
  const { data: cuentas, error } = await sb
    .from("cuentas_facebook")
    .select("*")
    .order("calidad");

  if (error) {
    console.error(error);
    alert("❌ Error cargando cuentas: " + error.message);
    return;
  }

  cuentasCache = cuentas || [];

  // KPIs
  const baneadas = cuentasCache.filter((c) => c.calidad === "baneada" || c.estado === "inactiva").length;
  const frias = cuentasCache.filter((c) => c.calidad === "fria" || c.calidad === "nueva").length;
  const calientes = cuentasCache.filter((c) => c.calidad === "caliente").length;

  $("stat-baneadas").textContent = baneadas;
  $("stat-frias").textContent = frias;
  $("stat-calientes").textContent = calientes;

  renderTablaCuentas();
  actualizarEstadoSeleccion();
}

function renderTablaCuentas() {
  const tbody = $("tabla-cuentas");
  tbody.innerHTML = "";

  cuentasCache.forEach((c) => {
    let colorEstado = "#94a3b8";
    if (c.calidad === "caliente") colorEstado = "#10b981";
    if (c.calidad === "fria" || c.calidad === "nueva") colorEstado = "#3b82f6";
    if (c.calidad === "baneada") colorEstado = "#ef4444";

    const esBaneada = c.calidad === "baneada" || c.estado === "inactiva";
    const esLibre = !c.ocupada_por;
    const asignable = !esBaneada && !esLibre;

    tbody.innerHTML += `
      <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
        <td style="width:40px;">
          <input
            type="checkbox"
            class="ck-cuenta"
            data-id="${c.id}"
            ${asignable ? "" : "disabled"}
            title="${asignable ? "Seleccionar cuenta" : (esLibre ? "No se puede: cuenta Libre" : "No se puede: cuenta Inactiva/Baneada")}"
          />
        </td>

        <td>${c.email}</td>
        <td><span class="muted">${c.ocupada_por || "Libre"}</span></td>

        <td style="color:${colorEstado}; font-weight:bold; text-transform:uppercase;">
          ${c.calidad}
        </td>

        <td>
          ${c.calidad !== "baneada"
            ? `<button class="btn-danger" style="padding:4px 8px; font-size:0.7rem;" onclick="reportarBan('${c.id}')">☠️ Ban</button>`
            : `<span class="muted">Inactiva</span>`
          }
        </td>
      </tr>
    `;
  });
}

// ✅ Aplicar estrategia a cuentas seleccionadas (GUARDA EN calentamiento_plan)
async function aplicarEstrategiaACuentasSeleccionadas() {
  const ids = getSeleccionadasIds();
  if (!ids.length) return alert("Seleccioná al menos 1 cuenta.");

  const cfg = getCfgFromInputs(); // usa lo que está en inputs (lo más fiel)
  const fecha = hoyISO();

  // Construimos filas a upsert
  const rows = [];

  for (const idStr of ids) {
    const id = Number(idStr);
    const c = cuentasCache.find((x) => Number(x.id) === id);
    if (!c) continue;

    // Solo asignables (por si acaso)
    const esBaneada = c.calidad === "baneada" || c.estado === "inactiva";
    const esLibre = !c.ocupada_por;
    if (esBaneada || esLibre) continue;

    rows.push({
      // ⚠️ NO mandamos "id" (lo genera la DB)
      fecha,
      cuenta_id: id,
      usuario: c.ocupada_por,
      req_historias: cfg.meta_historias,
      req_muro: cfg.meta_muro,
      req_reels: cfg.meta_reels,
      req_grupos: cfg.meta_grupos,

      // si tu tabla no tiene link_drive, después te paso el SQL y lo activás
      link_drive: cfg.link_drive
    });
  }

  if (!rows.length) {
    return alert("No hay cuentas válidas para asignar (están libres o inactivas).");
  }

  // Upsert: evita duplicados por (fecha, cuenta_id)
  const { error } = await sb
    .from("calentamiento_plan")
    .upsert(rows, { onConflict: "fecha,cuenta_id" });

  if (error) {
    console.error(error);
    alert("❌ Error aplicando estrategia: " + error.message);
    return;
  }

  alert(`✅ Estrategia aplicada a ${rows.length} cuentas para ${fecha}.`);
}

// --- Ban ---
window.reportarBan = async (id) => {
  if (confirm("¿Confirmás que esta cuenta ha sido BANEADA permanentemente?")) {
    const { error } = await sb
      .from("cuentas_facebook")
      .update({
        calidad: "baneada",
        estado: "inactiva"
      })
      .eq("id", id);

    if (!error) {
      alert("Cuenta marcada como baneada.");
      cargarCuentas();
    } else {
      alert("❌ Error: " + error.message);
    }
  }
};
