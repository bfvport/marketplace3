import {
  requireSession, loadSidebar, fmtDateISO, nowISO,
  escapeHtml, takeFacebookAccountFor
} from "../../assets/js/app.js";

const s = requireSession();
await loadSidebar({ activeKey: "diario", basePath: "../" });

const sb = window.supabaseClient;
const $ = (id) => document.getElementById(id);

const today = fmtDateISO(new Date());
$("subtitle").textContent = `Hoy: ${today} | Usuario: ${s.usuario} | Rol: ${s.rol}`;

function log(line){
  const el = $("log");
  if(!el) return;
  const ts = new Date().toLocaleTimeString();
  el.textContent += `[${ts}] ${line}\n`;
  el.scrollTop = el.scrollHeight;
}

function setAccStatus(text){ $("accStatus").textContent = "Cuenta: " + (text || "-"); }

// 🟢 REGISTRO AUTOMÁTICO DE ENTRADA
async function registrarEntradaDiario() {
  await sb.from("usuarios_actividad").insert([{
    usuario: s.usuario,
    fecha_logueo: nowISO(),
    facebook_account_usada: "🟢 INGRESO AL DIARIO",
    created_at: nowISO()
  }]);
}

// 👮 VISTA EXCLUSIVA PARA EL GERENTE
async function cargarReporteAsistenciaGerente() {
  if (s.rol !== "gerente") return;
  
  const section = $("managerSection");
  if (section) section.style.display = "block";

  const { data, error } = await sb
    .from("usuarios_actividad")
    .select("*")
    .filter("fecha_logueo", "gte", today)
    .order("fecha_logueo", { ascending: false });

  if (error) return log("❌ error logs gerente: " + error.message);

  const tbody = $("managerLogsBody");
  tbody.innerHTML = "";

  (data || []).forEach(row => {
    const hora = new Date(row.fecha_logueo).toLocaleTimeString();
    const tr = document.createElement("tr");
    tr.style.borderBottom = "1px solid rgba(255,255,255,0.05)";
    tr.innerHTML = `
      <td style="padding:8px; font-family:monospace;">${hora}</td>
      <td style="padding:8px; font-weight:bold; color:#60a5fa;">${escapeHtml(row.usuario)}</td>
      <td style="padding:8px; font-size:0.9em; color:#94a3b8;">${escapeHtml(row.facebook_account_usada)}</td>
    `;
    tbody.appendChild(tr);
  });
}

async function loadCategorias(){
  const { data, error } = await sb.from("categoria").select("id,nombre,mensaje").order("nombre");
  if (error) return log("❌ categorias: " + error.message);

  const sel = $("categoriaSelect");
  sel.innerHTML = "";
  (data || []).forEach(c => {
    const opt = document.createElement("option");
    opt.value = c.nombre;
    opt.textContent = c.nombre;
    opt.dataset.mensaje = c.mensaje || "";
    sel.appendChild(opt);
  });
}

// 🎯 MOSTRAR TAREA AL OPERADOR (Versión Detallada)
async function loadAsignacionDeHoy(){
  const box = $("asigBox");
  if(!box) return;

  const { data, error } = await sb.from("usuarios_asignado").select("*").eq("usuario", s.usuario);
  if (error) return log("❌ asignaciones: " + error.message);

  const inRange = (data || []).filter(a => a.fecha_desde <= today && today <= a.fecha_hasta);

  if (!inRange.length){
    $("asigHint").textContent = "No tenés asignación para hoy.";
    box.innerHTML = `<div class="muted">💤 Pedile al gerente que te asigne una categoría.</div>`;
    return;
  }

  $("asigHint").textContent = `Tareas activas: ${inRange.length}`;
  box.innerHTML = "";

  inRange.forEach(a => {
    box.innerHTML += `
      <div style="background: rgba(255,255,255,0.05); border-left: 4px solid #a78bfa; padding: 10px; margin-bottom: 8px; border-radius: 4px;">
        <div style="font-weight:bold; color: #a78bfa; font-size: 1.1rem;">${escapeHtml(a.categoria)}</div>
        <div style="margin-top: 5px; font-size: 0.85rem; color: #e2e8f0; line-height: 1.6;">
           🛒 Marketplace: <b style="color:#fff;">${a.marketplace_daily}</b> | 👥 Grupos: <b style="color:#fff;">${a.grupos_daily}</b><br>
           📖 Historias: <b style="color:#fff;">${a.historia_daily}</b> | 🏠 Muro: <b style="color:#fff;">${a.muro_daily}</b>
        </div>
      </div>
    `;
  });
}

async function ensureCuentaActual(){
  const { data } = await sb.from("cuentas_facebook").select("email").eq("ocupada_por", s.usuario).eq("estado", "ocupada").limit(1);
  if (data && data.length) setAccStatus(data[0].email);
}

$("btnTakeAcc").addEventListener("click", async () => {
  log("Buscando cuenta...");
  const r = await takeFacebookAccountFor(s.usuario);
  if (!r.ok) return log("⚠️ " + r.reason);
  setAccStatus(r.account.email);
  log("✅ Cuenta tomada: " + r.account.email);
  await sb.from("usuarios_actividad").insert([{
    usuario: s.usuario, fecha_logueo: nowISO(), facebook_account_usada: "⚠️ TOMÓ CUENTA: " + r.account.email
  }]);
  await cargarReporteAsistenciaGerente();
});

$("btnSave").addEventListener("click", async () => {
  const payload = {
    usuario: s.usuario,
    fecha_publicacion: today,
    titulo: $("titulo").value.trim(),
    descripcion: $("descripcion").value.trim(),
    categoria: $("categoriaSelect").value,
    marketplace_link_publicacion: $("link").value.trim(),
    created_at: nowISO()
  };
  if(!payload.titulo) return log("⚠️ Falta título.");
  const { error } = await sb.from("marketplace_actividad").insert([payload]);
  if (error) return log("❌ error: " + error.message);
  log("✅ Actividad guardada.");
  $("titulo").value = ""; $("link").value = "";
});

$("btnClear").addEventListener("click", () => { $("titulo").value = ""; $("link").value = ""; log("🧼 Limpio."); });

(async function init(){
  log("Init diario...");
  await registrarEntradaDiario();
  await loadCategorias();
  await loadAsignacionDeHoy();
  await ensureCuentaActual();
  await cargarReporteAsistenciaGerente();
  log("Listo.");
})();