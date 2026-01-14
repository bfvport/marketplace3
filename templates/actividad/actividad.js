import { requireSession, loadSidebar, fmtDateISO } from "../../assets/js/app.js";

const s = requireSession();
const sb = window.supabaseClient;
const $ = (id) => document.getElementById(id);
const today = fmtDateISO(new Date()); 

// Función de inicio
(async function init() {
    // 1. Carga el sidebar para navegación
    await loadSidebar({ activeKey: "actividad", basePath: "../" });

    // 2. Valida que solo el gerente vea esta info
    if (s.rol !== "gerente") {
        document.body.innerHTML = "<h1 style='color:white;text-align:center;margin-top:50px;'>⛔ Solo Gerencia</h1>";
        return;
    }

    // 3. Reloj en tiempo real (Hora Argentina)
    setInterval(() => {
        if($("reloj-arg")) {
            $("reloj-arg").textContent = new Date().toLocaleTimeString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
        }
    }, 1000);

    // 4. Configura botones de administración
    if($("btn-descargar")) $("btn-descargar").onclick = descargarCSV;
    if($("btn-limpiar")) $("btn-limpiar").onclick = limpiarLogs;

    // 5. Carga de datos con autorefresco cada 15 segundos
    await cargarMonitor();
    setInterval(cargarMonitor, 15000); 
})();

async function cargarMonitor() {
    try {
        // Rango para detectar publicaciones con hora detallada
        const start = `${today}T00:00:00.000Z`;
        const end = `${today}T23:59:59.999Z`;

        // Traemos datos de las 6 tablas críticas
        const [resAsig, resMarket, resCalent, resMetricas, resCuentas, resLogs] = await Promise.all([
            sb.from("usuarios_asignado").select("*").lte("fecha_desde", today).gte("fecha_hasta", today),
            sb.from("marketplace_actividad").select("usuario, fecha_publicacion").gte("fecha_publicacion", start).lte("fecha_publicacion", end),
            sb.from("calentamiento_actividad").select("usuario").eq("fecha", today),
            sb.from("metricas").select("usuario, created_at").order("created_at", {ascending:false}),
            sb.from("cuentas_facebook").select("ocupada_por, calidad"),
            sb.from("usuarios_actividad").select("*").order("created_at", { ascending: false }).limit(50)
        ]);

        const asignaciones = resAsig.data || [];
        const logs = resLogs.data || [];
        const marketplaceData = resMarket.data || [];

        // --- DIBUJAR TARJETAS DE EQUIPO ---
        const grid = $("grid-team");
        if (!grid) return;
        grid.innerHTML = "";

        if (asignaciones.length === 0) {
            grid.innerHTML = "<p class='muted' style='grid-column: 1/-1; text-align:center;'>No hay operadores trabajando hoy.</p>";
        }

        asignaciones.forEach(asig => {
            const u = asig.usuario;

            // Conteo real de publicaciones (lo que le faltaba a Guillermo)
            const hechosMP = marketplaceData.filter(x => x.usuario === u).length;
            const metaMP = asig.marketplace_daily || 1;
            const porcMP = Math.min((hechosMP / metaMP) * 100, 100);

            // Estado de Calentamiento y Métricas
            const hechosCalent = (resCalent.data || []).filter(x => x.usuario === u).length;
            const ultMetrica = (resMetricas.data || []).find(m => m.usuario === u);
            let badgeMetrica = '<span class="badge bg-red">Sin Datos</span>';
            if (ultMetrica) {
                const d = Math.floor((new Date() - new Date(ultMetrica.created_at)) / (1000 * 60 * 60 * 24));
                badgeMetrica = d < 7 ? '<span class="badge bg-green">Al día</span>' : `<span class="badge bg-red">Hace ${d}d</span>`;
            }

            // Semáforo de conexión online
            const lastLog = logs.find(l => l.usuario === u);
            const isOnline = lastLog && (new Date() - new Date(lastLog.created_at) < 20 * 60 * 1000);

            grid.innerHTML += `
                <div class="op-card">
                    <div class="op-header">
                        <div><span class="status-dot ${isOnline ? 'online' : 'offline'}"></span><strong>${u}</strong></div>
                        <span class="muted" style="font-size:0.75rem;">${asig.categoria}</span>
                    </div>
                    <div class="op-body">
                        <div>
                            <div style="display:flex; justify-content:space-between; font-size:0.8rem; color:#cbd5e1;">
                                <span>📦 Marketplace</span>
                                <span style="color:${porcMP === 100 ? '#34d399' : '#60a5fa'}">${hechosMP}/${metaMP}</span>
                            </div>
                            <div class="progress-bg"><div class="progress-fill" style="width:${porcMP}%"></div></div>
                        </div>
                        <div class="stat-row">
                            <span style="color:#cbd5e1;">🔥 Calentamiento</span>
                            <span class="badge ${hechosCalent > 0 ? 'bg-green' : 'bg-yellow'}">${hechosCalent > 0 ? 'Hecho' : 'Pendiente'}</span>
                        </div>
                        <div class="stat-row">
                            <span style="color:#cbd5e1;">📊 Métricas</span>
                            ${badgeMetrica}
                        </div>
                    </div>
                </div>`;
        });

        // --- DIBUJAR TABLA DE ACCESOS ---
        const tbody = $("tabla-logs");
        if (!tbody) return;
        tbody.innerHTML = "";
        
        logs.forEach(l => {
            const hora = new Date(l.created_at).toLocaleTimeString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour:'2-digit', minute:'2-digit', second:'2-digit' });
            let color = "white";
            const evt = (l.evento || "").toUpperCase();
            if (evt.includes("LOGIN")) color = "#4ade80"; // Verde
            if (evt.includes("LOGOUT")) color = "#f87171"; // Rojo

            tbody.innerHTML += `
                <tr style="border-bottom:1px solid #334155;">
                    <td style="color:#94a3b8; font-family:monospace; padding:8px;">${hora}</td>
                    <td style="font-weight:bold; color:white;">${l.usuario}</td>
                    <td style="color:${color}; font-weight:bold;">${l.evento || 'Undefined'}</td>
                    <td class="muted">${l.cuenta_fb || '-'}</td>
                </tr>`;
        });

    } catch (err) {
        console.error("Error en el monitor:", err);
    }
}

// Funciones administrativas
async function descargarCSV() { /* lógica de descarga */ }
async function limpiarLogs() { /* lógica de limpieza */ }