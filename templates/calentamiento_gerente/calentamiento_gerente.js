import { requireSession, loadSidebar, fmtDateISO } from "../../assets/js/app.js";

const s = requireSession();
const sb = window.supabaseClient;
const $ = (id) => document.getElementById(id);

let cuentasCache = [];
let configCache = null;

// ---------- Helpers ----------
function todayISO() { return fmtDateISO(new Date()); }
function addDaysISO(baseISO, days) {
  const d = new Date(baseISO + "T00:00:00");
  d.setDate(d.getDate() + days);
  return fmtDateISO(d);
}
function randInt(min, max) {
  const a = Math.min(min, max);
  const b = Math.max(min, max);
  return a + Math.floor(Math.random() * (b - a + 1));
}
function getCfgFromInputs(){
  return {
    meta_historias: parseInt($("cfg-historias").value, 10) || 0,
    meta_muro: parseInt($("cfg-muro").value, 10) || 0,
    meta_reels: parseInt($("cfg-reels").value, 10) || 0,
    meta_grupos: parseInt($("cfg-grupos").value, 10) || 0,
    link_drive: ($("cfg-drive").value || "").trim()
  };
}

// Rutina aleatoria “conservadora”, usando los números del gerente como “tope”
function rutinaAleatoriaDesde(cfg){
  const Hmax = Math.max(0, cfg.meta_historias || 0);
  const Mmax = Math.max(0, cfg.meta_muro || 0);
  const Rmax = Math.max(0, cfg.meta_reels || 0);
  const Gmax = Math.max(0, cfg.meta_grupos || 0);

  // Historias: si hay tope, mínimo 1; si no, 0
  const h = Hmax > 0 ? randInt(Math.max(1, Hmax - 1), Hmax) : 0;
  // Muro/Reels/Grupos: permiten 0..tope
  const m = Mmax > 0 ? randInt(Math.max(0, Mmax - 1), Mmax) : 0;
  const r = Rmax > 0 ? randInt(Math.max(0, Rmax - 1), Rmax) : 0;
  const g = Gmax > 0 ? randInt(Math.max(0, Gmax - 1), Gmax) : 0;

  // Nunca todo 0
  if (h + m + r + g === 0) return { h: 1, m: 0, r: 0, g: 0 };
  return { h, m, r, g };
}

function asegurarUISeleccionYBotones(){
  // 1) Inyectar botones debajo del btn-save
  const btnSave = $("btn-save");
  if (btnSave && !document.getElementById("btn-plan-7d")) {
    const wrap = document.createElement("div");
    wrap.style.display = "grid";
    wrap.style.gap = "10px";
    wrap.style.marginTop = "10px";

    wrap.innerHTML = `
      <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
        <button id="btn-plan-7d" class="btn" style="width:100%;">🎲 Generar PLAN 7 días (seleccionadas)</button>
        <div class="muted" id="sel-count" style="font-size:0.85rem;">0 seleccionadas</div>
      </div>
      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        <button id="btn-sel-all" class="btn2" type="button">Seleccionar todo</button>
        <button id="btn-sel-none" class="btn2" type="button">Limpiar</button>
      </div>
      <div class="muted" style="font-size:0.8rem;">
        Tip: Solo se planifican cuentas con <b>Resp.</b> asignado (ocupada_por) y que no estén baneadas/inactivas.
      </div>
    `;
    btnSave.insertAdjacentElement("afterend", wrap);
  }

  // 2) Inyectar columna de selección en tabla (header + rows)
  const theadRow = document.querySelector("table.table thead tr");
  if (theadRow && !theadRow.querySelector("th[data-sel='1']")) {
    const th = document.createElement("th");
    th.textContent = "Sel";
    th.setAttribute("data-sel", "1");
    th.style.width = "55px";
    theadRow.prepend(th);
  }
}

function actualizarContadorSeleccion(){
  const checked = document.querySelectorAll(".ck-cuenta:checked").length;
  const el = document.getElementById("sel-count");
  if (el) el.textContent = `${checked} seleccionadas`;
  const btn = document.getElementById("btn-plan-7d");
  if (btn) btn.disabled = checked === 0;
}

function getSeleccionadasIds(){
  return Array.from(document.querySelectorAll(".ck-cuenta:checked"))
    .map(x => Number(x.getAttribute("data-id")))
    .filter(Boolean);
}

// ---------- Init ----------
(async function init() {
  await loadSidebar({ activeKey: "calentamiento_gerente", basePath: "../" });

  if (s.rol !== "gerente") {
    document.body.innerHTML = `
      <div style="text-align:center; padding:50px; color:white;">
        <h1 style="color:#ef4444;">⛔ Acceso Denegado</h1>
        <p>Esta configuración es exclusiva para Gerencia.</p>
        <a href="../dashboard/dashboard.html" style="color:#3b82f6;">Volver</a>
      </div>`;
    return;
  }

  asegurarUISeleccionYBotones();

  await cargarConfiguracion();
  await cargarCuentas();

  $("btn-save").onclick = guardarConfiguracion;

  // Botones extra
  const b7 = document.getElementById("btn-plan-7d");
  if (b7) b7.onclick = generarPlan7DiasSeleccionadas;

  const bAll = document.getElementById("btn-sel-all");
  if (bAll) bAll.onclick = () => toggleSeleccion(true);

  const bNone = document.getElementById("btn-sel-none");
  if (bNone) bNone.onclick = () => toggleSeleccion(false);

  document.addEventListener("change", (e) => {
    if (e.target && e.target.classList && e.target.classList.contains("ck-cuenta")) {
      actualizarContadorSeleccion();
    }
  });

  actualizarContadorSeleccion();
})();

// ---------- Configuracion ----------
async function cargarConfiguracion() {
  // Traemos la última config (si hay 0 filas, no rompe)
  const { data, error } = await sb
    .from("configuracion_calentamiento")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error("Error cargando config:", error);
    return;
  }

  const cfg = data?.[0];
  if (!cfg) return;

  configCache = cfg;

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
    updated_at: new Date()
  };

  // ✅ NO usamos id=1 (evita “cannot insert non-default into id”)
  // 1) si existe una fila, la actualizamos; 2) si no existe, insertamos.
  const { data: upd, error: eUpd } = await sb
    .from("configuracion_calentamiento")
    .update(payload)
    .select("id")
    .limit(1);

  if (eUpd) {
    alert("❌ Error al guardar (update): " + eUpd.message);
    return;
  }

  if (upd && upd.length > 0) {
    alert("✅ Estrategia global actualizada.");
    return;
  }

  const { error: eIns } = await sb
    .from("configuracion_calentamiento")
    .insert([payload]);

  if (eIns) alert("❌ Error al guardar (insert): " + eIns.message);
  else alert("✅ Estrategia global creada.");
}

// ---------- Cuentas ----------
async function cargarCuentas() {
  const { data: cuentas, error } = await sb
    .from("cuentas_facebook")
    .select("*")
    .order("calidad");

  if (error) {
    alert("❌ Error cargando cuentas: " + error.message);
    return;
  }

  cuentasCache = cuentas || [];

  const baneadas = cuentasCache.filter(c => c.calidad === "baneada" || c.estado === "inactiva").length;
  const frias = cuentasCache.filter(c => c.calidad === "fria" || c.calidad === "nueva").length;
  const calientes = cuentasCache.filter(c => c.calidad === "caliente").length;

  $("stat-baneadas").textContent = baneadas;
  $("stat-frias").textContent = frias;
  $("stat-calientes").textContent = calientes;

  const tbody = $("tabla-cuentas");
  tbody.innerHTML = "";

  cuentasCache.forEach(c => {
    let colorEstado = "#94a3b8";
    if (c.calidad === "caliente") colorEstado = "#10b981";
    if (c.calidad === "fria" || c.calidad === "nueva") colorEstado = "#3b82f6";
    if (c.calidad === "baneada") colorEstado = "#ef4444";

    const inactiva = (c.calidad === "baneada" || c.estado === "inactiva");
    const libre = !c.ocupada_por;
    const habilitada = !inactiva && !libre;

    tbody.innerHTML += `
      <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
        <td style="width:55px;">
          <input type="checkbox" class="ck-cuenta" data-id="${c.id}" ${habilitada ? "" : "disabled"}
            title="${habilitada ? "Seleccionar" : (libre ? "No: Libre" : "No: Inactiva/Baneada")}" />
        </td>
        <td>${c.email}</td>
        <td><span class="muted">${c.ocupada_por || "Libre"}</span></td>
        <td style="color:${colorEstado}; font-weight:bold; text-transform:uppercase;">${c.calidad}</td>
        <td>
          ${c.calidad !== "baneada"
            ? `<button class="btn-danger" style="padding:4px 8px; font-size:0.7rem;" onclick="reportarBan('${c.id}')">☠️ Ban</button>`
            : `<span class="muted">Inactiva</span>`
          }
        </td>
      </tr>
    `;
  });

  actualizarContadorSeleccion();
}

function toggleSeleccion(checked){
  document.querySelectorAll(".ck-cuenta").forEach(ck => {
    if (ck.disabled) return;
    ck.checked = checked;
  });
  actualizarContadorSeleccion();
}

// ---------- Plan 7 días ----------
async function generarPlan7DiasSeleccionadas(){
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
        link_drive: cfg.link_drive || null
      });
    }
  }

  if (!rows.length) return alert("No hay cuentas válidas (libres/inactivas).");

  // Intento upsert con link_drive; si tu tabla no tiene esa columna, reintenta sin link_drive.
  let { error } = await sb
    .from("calentamiento_plan")
    .upsert(rows, { onConflict: "fecha,cuenta_id" });

  if (error && /link_drive|column/i.test(error.message)) {
    const rows2 = rows.map(({ link_drive, ...rest }) => rest);
    const retry = await sb.from("calentamiento_plan").upsert(rows2, { onConflict: "fecha,cuenta_id" });
    error = retry.error;
  }

  if (error) {
    console.error(error);
    alert("❌ Error generando plan 7 días: " + error.message);
    return;
  }

  // Log simple en actividad (opcional, pero útil)
  await sb.from("usuarios_actividad").insert([{
    usuario: s.usuario,
    evento: `🗓️ Gerencia generó PLAN 7 días (aleatorio) para ${ids.length} cuentas`,
    cuenta_fb: "calentamiento_plan"
  }]);

  alert(`✅ Plan 7 días generado para ${ids.length} cuentas. (Hoy + 6 días)`);
}

// ---------- Ban ----------
window.reportarBan = async (id) => {
  if (confirm("¿Confirmás que esta cuenta ha sido BANEADA permanentemente?")) {
    const { error } = await sb
      .from("cuentas_facebook")
      .update({ calidad: "baneada", estado: "inactiva" })
      .eq("id", id);

    if (!error) {
      alert("Cuenta marcada como baneada.");
      cargarCuentas();
    } else {
      alert("❌ Error: " + error.message);
    }
  }
};
