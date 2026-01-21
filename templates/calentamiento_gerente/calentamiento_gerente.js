import { requireSession, loadSidebar } from "../../assets/js/app.js";

const s = requireSession();
const sb = window.supabaseClient;
const $ = (id) => document.getElementById(id);

const hoy = new Date();
const iso = (d) => d.toISOString().slice(0, 10);

(async function init() {
  // ✅ GERENTE usa SU sidebar (en carpeta sidebar_gerente)
  await loadSidebar({ activeKey: "calentamiento_gerente", basePath: "../sidebar_gerente/" });

  // Seguridad
  if (s?.rol !== "gerente") {
    window.location.href = "../calentamiento/calentamiento.html";
    return;
  }

  $("btn-save").addEventListener("click", guardarConfiguracion);
  $("btn-plan-7d").addEventListener("click", generarPlan7Dias);
  $("btn-sel-all").addEventListener("click", () => setAll(true));
  $("btn-sel-none").addEventListener("click", () => setAll(false));

  await cargarConfiguracion();
  await cargarCuentas();
  actualizarContadorSel();
})();

// ========= CONFIG =========
async function cargarConfiguracion() {
  const { data, error } = await sb
    .from("configuracion_calentamiento")
    .select("*")
    .order("id", { ascending: true })
    .limit(1);

  if (error) {
    console.error("Error cargando config:", error);
    return;
  }

  const cfg = data?.[0] || null;

  $("cfg-historias").value = cfg?.meta_historias ?? 0;
  $("cfg-muro").value = cfg?.meta_muro ?? 0;
  $("cfg-reels").value = cfg?.meta_reels ?? 0;
  $("cfg-grupos").value = cfg?.meta_grupos ?? 0;
  $("cfg-drive").value = cfg?.link_drive ?? "";
}

async function guardarConfiguracion() {
  const payload = {
    meta_historias: parseInt($("cfg-historias").value) || 0,
    meta_muro: parseInt($("cfg-muro").value) || 0,
    meta_reels: parseInt($("cfg-reels").value) || 0,
    meta_grupos: parseInt($("cfg-grupos").value) || 0,
    link_drive: ($("cfg-drive").value || "").trim(),
    updated_at: new Date().toISOString()
  };

  // ✅ NO tocamos 'id'. Si existe, update; si no existe, insert.
  const { data: existing, error: e1 } = await sb
    .from("configuracion_calentamiento")
    .select("id")
    .order("id", { ascending: true })
    .limit(1);

  if (e1) {
    alert("❌ Error verificando config: " + e1.message);
    return;
  }

  if (existing?.length) {
    const cfgId = existing[0].id;
    const { error } = await sb
      .from("configuracion_calentamiento")
      .update(payload)
      .eq("id", cfgId);

    if (error) alert("❌ Error al guardar: " + error.message);
    else alert("✅ Estrategia guardada.");
  } else {
    const { error } = await sb
      .from("configuracion_calentamiento")
      .insert(payload);

    if (error) alert("❌ Error al crear config: " + error.message);
    else alert("✅ Estrategia creada.");
  }
}

// ========= CUENTAS =========
let cuentasCache = [];

async function cargarCuentas() {
  const { data: cuentas, error } = await sb
    .from("cuentas_facebook")
    .select("id,email,ocupada_por,calidad,estado")
    .order("calidad", { ascending: true });

  if (error) {
    console.error(error);
    $("tabla-cuentas").innerHTML = `<tr><td colspan="5" class="muted" style="text-align:center;">Error cargando cuentas</td></tr>`;
    return;
  }

  cuentasCache = cuentas || [];

  // KPIs
  const baneadas = cuentasCache.filter(c => c.calidad === "baneada" || c.estado === "inactiva").length;
  const frias = cuentasCache.filter(c => ["fria","nueva"].includes(c.calidad) && c.estado !== "inactiva").length;
  const calientes = cuentasCache.filter(c => c.calidad === "caliente" && c.estado !== "inactiva").length;

  $("stat-baneadas").textContent = baneadas;
  $("stat-frias").textContent = frias;
  $("stat-calientes").textContent = calientes;

  // Render tabla (solo planificables: con ocupada_por y no inactiva)
  const tbody = $("tabla-cuentas");
  tbody.innerHTML = "";

  for (const c of cuentasCache) {
    const planificable = !!c.ocupada_por && c.estado !== "inactiva" && c.calidad !== "baneada";

    let colorEstado = "#94a3b8";
    if (c.calidad === "caliente") colorEstado = "#10b981";
    if (c.calidad === "fria" || c.calidad === "nueva") colorEstado = "#3b82f6";
    if (c.calidad === "baneada") colorEstado = "#ef4444";

    tbody.innerHTML += `
      <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
        <td>
          ${planificable
            ? `<input class="ck" type="checkbox" data-sel="1" data-id="${c.id}">`
            : `<span class="muted">—</span>`}
        </td>
        <td>${c.email || "-"}</td>
        <td><span class="muted">${c.ocupada_por || "Libre"}</span></td>
        <td style="color:${colorEstado}; font-weight:800; text-transform:uppercase;">${c.calidad}</td>
        <td>
          ${c.calidad !== "baneada"
            ? `<button class="btn-danger" style="padding:4px 8px; font-size:0.7rem;" data-ban="${c.id}">☠️ Ban</button>`
            : `<span class="muted">Inactiva</span>`}
        </td>
      </tr>
    `;
  }

  // eventos
  tbody.querySelectorAll("input[data-sel]").forEach(ch => ch.addEventListener("change", actualizarContadorSel));
  tbody.querySelectorAll("button[data-ban]").forEach(btn => btn.addEventListener("click", () => reportarBan(btn.dataset.ban)));

  actualizarContadorSel();
}

function selectedIds() {
  return Array.from(document.querySelectorAll("input[data-sel]:checked")).map(x => x.dataset.id);
}

function setAll(v) {
  document.querySelectorAll("input[data-sel]").forEach(ch => ch.checked = v);
  actualizarContadorSel();
}

function actualizarContadorSel() {
  const n = selectedIds().length;
  $("sel-count").textContent = `${n} seleccionadas`;
}

// ========= BAN =========
async function reportarBan(id) {
  if (!confirm("¿Confirmás que esta cuenta ha sido BANEADA permanentemente?")) return;

  const { error } = await sb
    .from("cuentas_facebook")
    .update({ calidad: "baneada", estado: "inactiva" })
    .eq("id", id);

  if (error) alert("❌ Error: " + error.message);
  else {
    alert("✅ Cuenta marcada como baneada.");
    await cargarCuentas();
  }
}

// ========= PLAN 7 DÍAS =========
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function generarPlan7Dias() {
  const ids = selectedIds();
  if (ids.length === 0) {
    alert("Seleccioná al menos 1 cuenta planificable.");
    return;
  }

  const topH = parseInt($("cfg-historias").value) || 0;
  const topM = parseInt($("cfg-muro").value) || 0;
  const topR = parseInt($("cfg-reels").value) || 0;
  const topG = parseInt($("cfg-grupos").value) || 0;

  // Generamos 7 días desde hoy (incluido)
  const rows = [];
  for (let day = 0; day < 7; day++) {
    const d = new Date();
    d.setDate(hoy.getDate() + day);
    const fecha = iso(d);

    for (const cuenta_id of ids) {
      rows.push({
        fecha,
        cuenta_id,
        historias: topH > 0 ? randInt(0, topH) : 0,
        muro: topM > 0 ? randInt(0, topM) : 0,
        reels: topR > 0 ? randInt(0, topR) : 0,
        grupos: topG > 0 ? randInt(0, topG) : 0,
        updated_at: new Date().toISOString()
      });
    }
  }

  // Guardar: upsert por unique (fecha, cuenta_id)
  const { error } = await sb
    .from("calentamiento_plan")
    .upsert(rows, { onConflict: "fecha,cuenta_id" });

  if (error) {
    console.error(error);
    alert("❌ Error guardando plan: " + error.message);
    return;
  }

  alert("✅ Plan de 7 días generado y guardado.");
}
