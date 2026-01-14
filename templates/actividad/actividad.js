import { requireSession, loadSidebar, fmtDateISO } from "../../assets/js/app.js";

const s = requireSession(); 
const sb = window.supabaseClient;
const $ = (id) => document.getElementById(id);
const today = fmtDateISO(new Date()); 

(async function init() {
    // Carga de navegación y validación de permisos de Gerencia
    await loadSidebar({ activeKey: "actividad", basePath: "../" });

    if (s.rol !== "gerente") {
        document.body.innerHTML = "<h1 style='color:white;text-align:center;margin-top:50px;'>⛔ Acceso solo para Gerentes</h1>";
        return;
    }

    // Actualización del reloj digital con zona horaria Argentina
    setInterval(() => {
        if($("reloj-arg")) {
            $("reloj-arg").textContent = new Date().toLocaleTimeString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
        }
    }, 1000);

    // Asignación de funciones a los botones de administración
    if($("btn-descargar")) $("btn-descargar").onclick = descargarCSV;
    if($("btn-limpiar")) $("btn-limpiar").onclick = limpiarLogs;

    await cargarMonitor();
    setInterval(cargarMonitor, 15000); // Actualización automática cada 15 segundos
})();

async function cargarMonitor() {
    // Definimos el rango de tiempo de "hoy" para la consulta de base de datos
    const startOfDay = `${today}T00:00:00.000Z`;
    const endOfDay = `${today}T23:59:59.999Z`;

    // Consulta masiva de datos incluyendo las publicaciones de la tabla marketplace_actividad
    const [resAsig, resMarket, resCalent, resMetricas, resCuentas, resLogs] = await Promise.all([
        sb.from("usuarios_asignado").select("*").lte("fecha_desde", today).gte("fecha_hasta", today),
        // CORRECCIÓN: Filtramos Marketplace por rango de tiempo para detectar publicaciones con timestamp
        sb.from("marketplace_actividad").select("usuario, fecha_publicacion").gte("fecha_publicacion", startOfDay).lte("fecha_publicacion", endOfDay),
        sb.from("calentamiento_actividad").select("usuario").eq("fecha", today),
        sb.from("metricas").select("usuario, created_at").order("created_at", {ascending:false}),
        sb.from("cuentas_facebook").select("ocupada_por, calidad"),
        sb.from("usuarios_actividad").select("*").order("created_at", { ascending: false }).limit(50)
    ]);

    const asignaciones = resAsig.data || [];
    const logs = resLogs.data || [];
    const marketplaceData = resMarket.data || [];

    // Renderizado de las tarjetas de monitoreo por cada operador asignado
    const grid = $("grid-team");
    grid.innerHTML = "";

    if (asignaciones.length === 0) {
        grid.innerHTML = "<p class='muted' style='grid-column: 1/-1; text-align:center;'>No hay trabajo programado para hoy.</p>";
    }

    asignaciones.forEach(asig => {
        const u = asig.usuario;

        // CORRECCIÓN: Conteo de publicaciones del usuario filtrado por el rango de hoy
        const hechosMP = marketplaceData.filter(x => x.usuario === u).length;
        
        const metaMP = asig.marketplace_daily || 1;
        const porcMP = Math.min((hechosMP / metaMP) * 100, 100);
        const hechosCalent = (resCalent.data || []).filter(x => x.usuario === u).length;
        
        // Verificación de antigüedad de la última carga de métricas (7 días)
        const ultMetrica = (resMetricas.data || []).find(m => m.usuario === u);
        let statusMetrica = '<span class="badge bg-red">Sin Datos</span>';
        if (ultMetrica) {
            const dias = Math.floor((new Date() - new Date(ultMetrica.created_at)) / (1000 * 60 * 60 * 24));
            statusMetrica = dias < 7 ? '<span class="badge bg-green">Al día</span>' : `<span class="badge bg-red">Hace ${dias}d</span>`;
        }

        const misCuentas = (resCuentas.data || []).filter(c => c.ocupada_por === u);
        const frias = misCuentas.filter(c => c.calidad === 'fria').length;
        const calientes = misCuentas.filter(c => c.calidad === 'caliente').length;
        const baneadas = misCuentas.filter(c => c.calidad === 'baneada').length;

        // Detección de estado online basada en el último log de actividad registrado
        const lastLog = logs.find(l => l.usuario === u);
        const isOnline = lastLog && (new Date() - new Date(lastLog.created_at) < 20 * 60 * 1000);

        grid.innerHTML += `
            <div class="op-card">
                <div class="op-header">
                    <div>
                        <span class="status-dot ${isOnline ? 'online' : 'offline'}"></span>
                        <strong style="color:white;">${u}</strong>
                    </div>
                    <span class="muted" style="font-size:0.75rem;">${asig.categoria}</span>
                </div>
                <div class="op-body">
                    <div>
                        <div style="display:flex; justify-content:space-between; font-size:0.8rem; color:#cbd5e1;">
                            <span>📦 Marketplace</span>
                            <span>${hechosMP}/${metaMP}</span>
                        </div>
                        <div class="progress-bg"><div class="progress-fill" style="width:${porcMP}%"></div></div>
                    </div>
                    <div class="stat-row">
                        <span style="color:#cbd5e1;">🔥 Calentamiento</span>
                        <span class="badge ${hechosCalent > 0 ? 'bg-green' : 'bg-yellow'}">${hechosCalent > 0 ? 'Hecho' : 'Pendiente'}</span>
                    </div>
                    <div class="stat-row">
                        <span style="color:#cbd5e1;">📊 Métricas</span>
                        ${statusMetrica}
                    </div>
                    <div style="background:#1e293b; padding:8px; border-radius:6px; font-size:0.75rem; display:flex; justify-content:space-around;">
                        <div style="text-align:center;"><span style="color:#60a5fa;">${frias}</span><br>Frias</div>
                        <div style="text-align:center;"><span style="color:#34d399;">${calientes}</span><br>Listas</div>
                        <div style="text-align:center;"><span style="color:#f87171;">${baneadas}</span><br>Ban</div>
                    </div>
                </div>
            </div>`;
    });

    // Llenado de la tabla de accesos con conversión de UTC a hora local de Argentina
    const tbody = $("tabla-logs");
    tbody.innerHTML = "";
    
    if (logs.length === 0) {
        tbody.innerHTML = "<tr><td colspan='4' style='text-align:center; padding:15px; color:#94a3b8;'>Cerrá sesión y volvé a entrar para generar registros.</td></tr>";
    } else {
        logs.forEach(l => {
            const hArg = new Date(l.created_at).toLocaleTimeString('es-AR', { 
                timeZone: 'America/Argentina/Buenos_Aires',
                hour: '2-digit', minute:'2-digit', second:'2-digit'
            });
            
            let colorStatus = "white";
            const eventoTexto = (l.evento || "").toUpperCase();
            if (eventoTexto.includes("LOGIN")) colorStatus = "#4ade80";
            if (eventoTexto.includes("LOGOUT")) colorStatus = "#f87171";

            tbody.innerHTML += `
                <tr style="border-bottom:1px solid #334155;">
                    <td style="color:#94a3b8; font-family:monospace; padding:8px;">${hArg}</td>
                    <td style="font-weight:bold; color:white;">${l.usuario}</td>
                    <td style="color:${colorStatus};">${l.evento}</td>
                    <td class="muted">${l.cuenta_fb || '-'}</td>
                </tr>`;
        });
    }
}

async function descargarCSV() {
    const { data } = await sb.from("usuarios_actividad").select("*").order("created_at", {ascending:false});
    if(!data || data.length === 0) return alert("Sin datos registrados.");

    let contenidoCsv = "ID,Fecha_UTC,Hora_Argentina,Usuario,Evento,Detalle\n";
    data.forEach(row => {
        const horaArg = new Date(row.created_at).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
        contenidoCsv += `${row.id},${row.created_at},"${horaArg}",${row.usuario},${row.evento},${row.cuenta_fb||''}\n`;
    });

    const blobCsv = new Blob([contenidoCsv], { type: 'text/csv' });
    const linkDescarga = URL.createObjectURL(blobCsv);
    const disparador = document.createElement('a');
    disparador.href = linkDescarga; disparador.download = `Reporte_Actividad_${today}.csv`;
    disparador.click();
}

async function limpiarLogs() {
    if(confirm("⚠️ ¿Estás seguro de vaciar el historial?")) {
        await sb.from("usuarios_actividad").delete().neq("id", 0);
        location.reload();
    }
}