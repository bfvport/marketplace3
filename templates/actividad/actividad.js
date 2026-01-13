import { requireSession, loadSidebar, fmtDateISO, escapeHtml } from "../../assets/js/app.js";

const s = requireSession();
const sb = window.supabaseClient;
const $ = (id) => document.getElementById(id);
const today = fmtDateISO(new Date());

await loadSidebar({ activeKey: "actividad", basePath: "../" });

// Función para el semáforo (Verde si hubo actividad hace < 10 min)
function obtenerSemaforo(fechaISO) {
    if (!fechaISO) return { color: "#4b5563", texto: "Sin datos" };
    const ahora = new Date();
    const ultimoMov = new Date(fechaISO);
    const difMin = Math.floor((ahora - ultimoMov) / 1000 / 60);

    if (difMin <= 10) return { color: "#10b981", texto: "Activo" };
    if (difMin <= 30) return { color: "#fbbf24", texto: "Inactivo recientemente" };
    return { color: "#ef4444", texto: "Desconectado" };
}

async function cargarTodo() {
    if (s.rol !== "gerente") return;

    // 1. Consultas a Supabase
    const { data: asignaciones } = await sb.from("usuarios_asignado").select("*").lte("fecha_desde", today).gte("fecha_hasta", today);
    const { data: hechos } = await sb.from("marketplace_actividad").select("usuario, facebook_account_usada").eq("fecha_publicacion", today);
    const { data: cuentas } = await sb.from("cuentas_facebook").select("ocupada_por").eq("estado", "ocupada");
    const { data: logs } = await sb.from("usuarios_actividad").select("*").filter("fecha_logueo", "gte", today).order("fecha_logueo", { ascending: false });

    // --- SECCIÓN RENDIMIENTO ---
    const flujoContainer = $("flujo-actividad");
    flujoContainer.innerHTML = "";

    (asignaciones || []).forEach(asig => {
        const pubUser = (hechos || []).filter(h => h.usuario === asig.usuario);
        const cuentasUsadas = [...new Set(pubUser.map(p => p.facebook_account_usada))].length;
        const totalCuentas = (cuentas || []).filter(c => c.ocupada_por === asig.usuario).length;
        
        // Buscamos su último log para el color del semáforo
        const ultimoLog = (logs || []).find(l => l.usuario === asig.usuario);
        const sem = obtenerSemaforo(ultimoLog?.fecha_logueo);

        const card = document.createElement("div");
        card.style.padding = "15px";
        card.style.borderBottom = "1px solid rgba(255,255,255,0.05)";
        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${sem.color}; margin-right:8px;"></span>
                    <strong>${asig.usuario}</strong> <span class="muted">(${asig.categoria})</span>
                </div>
                <span class="pill">${pubUser.length} posts hoy</span>
            </div>
            <div style="font-size: 0.85rem; margin-top:5px; padding-left:18px;">
                📢 Publicó en <b>${cuentasUsadas}</b> de sus <b>${totalCuentas}</b> cuentas asignadas.
            </div>
        `;
        flujoContainer.appendChild(card);
    });

    // --- SECCIÓN ASISTENCIA (CORRECCIÓN DE HORA) ---
    const tablaLogs = $("asistencia-logs");
    tablaLogs.innerHTML = "";

    (logs || []).forEach(l => {
        // CORRECCIÓN: Creamos fecha a partir del valor de la DB
        const fechaDB = new Date(l.fecha_logueo);
        const horaLocal = fechaDB.toLocaleTimeString('es-AR', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });

        const icon = l.facebook_account_usada.includes("INGRESO") ? "🟢" : "⚠️";

        const tr = document.createElement("tr");
        tr.style.borderBottom = "1px solid rgba(255,255,255,0.05)";
        tr.innerHTML = `
            <td style="padding:10px; font-family:monospace; color:#94a3b8;">${horaLocal}</td>
            <td style="padding:10px; font-weight:bold; color:#60a5fa;">${escapeHtml(l.usuario)}</td>
            <td style="padding:10px; font-size:0.9rem;">${icon} ${escapeHtml(l.facebook_account_usada)}</td>
        `;
        tablaLogs.appendChild(tr);
    });
}

// Recarga automática cada 1 minuto para mantener el semáforo al día
setInterval(cargarTodo, 60000);
cargarTodo();