import { requireSession, loadSidebar, fmtDateISO, escapeHtml } from "../../assets/js/app.js";

const s = requireSession();
const sb = window.supabaseClient;
const $ = (id) => document.getElementById(id);
const today = fmtDateISO(new Date());

await loadSidebar({ activeKey: "actividad", basePath: "../" });

// --- SEMÁFORO DE ACTIVIDAD ---
// Calcula si el operador está activo basándose en la hora exacta
function obtenerSemaforo(fechaISO) {
    if (!fechaISO) return { color: "#4b5563", texto: "Sin datos" }; // Gris
    
    const ahora = new Date();
    const ultimoMov = new Date(fechaISO);
    const difMin = Math.floor((ahora - ultimoMov) / 1000 / 60);

    if (difMin <= 10) return { color: "#10b981", texto: "Activo ahora" }; // Verde
    if (difMin <= 45) return { color: "#fbbf24", texto: "Inactivo reciente" }; // Amarillo
    return { color: "#ef4444", texto: "Desconectado" }; // Rojo
}

async function cargarTodo() {
    // Seguridad: Solo gerente ve esto
    if (s.rol !== "gerente") {
        document.body.innerHTML = "<h2 style='color:white; text-align:center; margin-top:50px;'>⛔ Acceso Restringido</h2>";
        return;
    }

    // 1. CARGA DE DATOS (Optimizada)
    // Usamos Promise.all para hacer todas las consultas juntas y que cargue rápido
    const [resAsignado, resHechos, resCuentas, resLogs] = await Promise.all([
        sb.from("usuarios_asignado").select("*").lte("fecha_desde", today).gte("fecha_hasta", today),
        sb.from("marketplace_actividad").select("usuario, facebook_account_usada").eq("fecha_publicacion", today),
        sb.from("cuentas_facebook").select("ocupada_por").eq("estado", "ocupada"),
        // IMPORTANTE: Traemos 'created_at' para la hora exacta
        sb.from("usuarios_actividad")
          .select("usuario, facebook_account_usada, created_at")
          .filter("created_at", "gte", `${today}T00:00:00`) 
          .order("created_at", { ascending: false })
    ]);

    const asignaciones = resAsignado.data || [];
    const hechos = resHechos.data || [];
    const cuentas = resCuentas.data || [];
    const logs = resLogs.data || [];

    // 2. RENDERIZAR SEMÁFORO Y RENDIMIENTO (Arriba)
    const flujoContainer = $("flujo-actividad");
    if (flujoContainer) {
        flujoContainer.innerHTML = "";
        
        if (asignaciones.length === 0) {
            flujoContainer.innerHTML = "<div class='muted'>No hay operadores asignados para hoy.</div>";
        }

        asignaciones.forEach(asig => {
            // Cálculos
            const pubUser = hechos.filter(h => h.usuario === asig.usuario);
            const cuentasUsadas = [...new Set(pubUser.map(p => p.facebook_account_usada))].length;
            const totalCuentas = cuentas.filter(c => c.ocupada_por === asig.usuario).length;
            
            // Buscamos su último movimiento real
            const ultimoLog = logs.find(l => l.usuario === asig.usuario);
            const sem = obtenerSemaforo(ultimoLog?.created_at);

            flujoContainer.innerHTML += `
                <div style="padding:15px; border-bottom:1px solid rgba(255,255,255,0.05);">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${sem.color}; margin-right:8px; box-shadow: 0 0 5px ${sem.color};"></span>
                            <strong style="font-size:1.1rem;">${escapeHtml(asig.usuario)}</strong> 
                            <span class="muted" style="font-size:0.85rem;"> • ${asig.categoria}</span>
                        </div>
                        <div style="text-align:right;">
                            <span class="pill" style="background:#3b82f6;">${pubUser.length} pubs</span>
                        </div>
                    </div>
                    <div style="font-size: 0.8rem; margin-top:5px; color:#94a3b8; padding-left:20px;">
                        Estado: <span style="color:${sem.color}">${sem.texto}</span> • Usó ${cuentasUsadas}/${totalCuentas} cuentas
                    </div>
                </div>`;
        });
    }

    // 3. RENDERIZAR TABLA DE LOGS (Abajo - HORA CORREGIDA)
    const tablaLogs = $("asistencia-logs");
    if (tablaLogs) {
        tablaLogs.innerHTML = "";
        
        if (logs.length === 0) {
            tablaLogs.innerHTML = "<tr><td colspan='3' class='muted' style='text-align:center; padding:20px;'>Sin actividad registrada hoy.</td></tr>";
            return;
        }

        logs.forEach(l => {
            // CORRECCIÓN DE HORA: Usamos created_at y forzamos zona horaria local
            const fechaObj = new Date(l.created_at);
            const horaLocal = fechaObj.toLocaleTimeString('es-AR', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            });

            // Íconos visuales
            let icon = "⚠️";
            let color = "#e2e8f0";
            
            const accion = (l.facebook_account_usada || "").toUpperCase();
            if (accion.includes("INGRESO") || accion.includes("ENTRÓ")) { icon = "🟢"; color = "#4ade80"; }
            else if (accion.includes("TOMÓ")) { icon = "🤚"; color = "#fbbf24"; }
            else if (accion.includes("SALIÓ")) { icon = "🔴"; color = "#f87171"; }

            tablaLogs.innerHTML += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <td style="padding:10px; font-family:monospace; color:#64748b; width: 80px;">${horaLocal}</td>
                    <td style="padding:10px; font-weight:bold; color:#f1f5f9;">${escapeHtml(l.usuario)}</td>
                    <td style="padding:10px; font-size:0.9rem; color:${color};">
                        ${icon} ${escapeHtml(l.facebook_account_usada)}
                    </td>
                </tr>`;
        });
    }
}

// Auto-refresco cada 30 segundos
setInterval(cargarTodo, 30000);
cargarTodo();