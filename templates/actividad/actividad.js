import { requireSession, loadSidebar, fmtDateISO, escapeHtml } from "../../assets/js/app.js";

const s = requireSession();
const sb = window.supabaseClient;
const $ = (id) => document.getElementById(id);
const today = fmtDateISO(new Date());

await loadSidebar({ activeKey: "actividad", basePath: "../" });

// Función para determinar el color del semáforo
function obtenerSemaforo(fechaLogueo) {
    const ahora = new Date();
    const ultimoMov = new Date(fechaLogueo);
    const difMinutos = Math.floor((ahora - ultimoMov) / 1000 / 60);

    if (difMinutos <= 10) return { color: "#10b981", texto: "Activo ahora" }; // Verde
    if (difMinutos <= 30) return { color: "#fbbf24", texto: "Inactivo hace poco" }; // Amarillo
    return { color: "#ef4444", texto: "Desconectado/Inactivo" }; // Rojo
}

async function cargarTodo() {
  if (s.rol !== "gerente") return;

  // 1. Traer datos
  const { data: asignaciones } = await sb.from("usuarios_asignado").select("*").lte("fecha_desde", today).gte("fecha_hasta", today);
  const { data: hechos } = await sb.from("marketplace_actividad").select("usuario, facebook_account_usada").eq("fecha_publicacion", today);
  const { data: cuentas } = await sb.from("cuentas_facebook").select("ocupada_por").eq("estado", "ocupada");
  const { data: logs } = await sb.from("usuarios_actividad").select("*").filter("fecha_logueo", "gte", today).order("fecha_logueo", { ascending: false });

  // --- RENDIMIENTO Y SEMÁFORO ---
  const flujoContainer = $("flujo-actividad");
  flujoContainer.innerHTML = "";

  (asignaciones || []).forEach(asig => {
    const pubUser = (hechos || []).filter(h => h.usuario === asig.usuario);
    const cuentasUsadas = [...new Set(pubUser.map(p => p.facebook_account_usada))].length;
    const totalCuentas = (cuentas || []).filter(c => c.ocupada_por === asig.usuario).length;
    
    // Buscamos el último movimiento de este usuario para el semáforo
    const ultimoLog = (logs || []).find(l => l.usuario === asig.usuario);
    const semaforo = ultimoLog ? obtenerSemaforo(ultimoLog.fecha_logueo) : { color: "#4b5563", texto: "Sin datos" };

    const item = document.createElement("div");
    item.style.padding = "15px";
    item.style.borderBottom = "1px solid rgba(255,255,255,0.05)";
    item.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <span style="display:inline-block; width:12px; height:12px; border-radius:50%; background:${semaforo.color}; margin-right:8px;" title="${semaforo.texto}"></span>
          <strong>${asig.usuario}</strong> <span class="muted">(${asig.categoria})</span>
        </div>
        <span class="pill">${pubUser.length} posts hoy</span>
      </div>
      <div style="font-size: 0.9rem; margin-top:8px; padding-left:20px;">
        📢 Publicó en <b>${cuentasUsadas}</b> de sus <b>${totalCuentas}</b> cuentas.
      </div>
    `;
    flujoContainer.appendChild(item);
  });

  // --- TABLA DE ASISTENCIA ---
  const tablaLogs = $("asistencia-logs");
  tablaLogs.innerHTML = "";
  (logs || []).forEach(l => {
    const hora = new Date(l.fecha_logueo).toLocaleTimeString();
    tablaLogs.innerHTML += `
      <tr>
        <td style="padding:8px; font-family:monospace;">${hora}</td>
        <td style="padding:8px; font-weight:bold;">${l.usuario}</td>
        <td style="padding:8px; font-size:0.85rem; color:#94a3b8;">${l.facebook_account_usada}</td>
      </tr>
    `;
  });
}

// Actualizar cada 1 minuto automáticamente para que el semáforo cambie solo
setInterval(cargarTodo, 60000);
cargarTodo();