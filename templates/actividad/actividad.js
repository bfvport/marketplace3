import { requireSession, loadSidebar, fmtDateISO } from "../../assets/js/app.js";

const s = requireSession(); //
const sb = window.supabaseClient;
const $ = (id) => document.getElementById(id);
const today = fmtDateISO(new Date()); //

(async function init() {
    // Carga el sidebar y verifica permisos de gerente para esta vista
    await loadSidebar({ activeKey: "actividad", basePath: "../" }); //

    if (s.rol !== "gerente") {
        document.body.innerHTML = "<h1 style='color:white;text-align:center;margin-top:50px;'>⛔ Acceso Denegado</h1>";
        return;
    }

    // Inicializa el reloj en tiempo real con la zona horaria de Argentina
    setInterval(() => {
        if($("reloj-arg")) {
            $("reloj-arg").textContent = new Date().toLocaleTimeString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
        }
    }, 1000);

    // Configura los eventos de los botones y el ciclo de actualización automática
    if($("btn-descargar")) $("btn-descargar").onclick = descargarCSV;
    if($("btn-limpiar")) $("btn-limpiar").onclick = limpiarLogs;

    await cargarTodo();
    setInterval(cargarTodo, 15000); // Refresco cada 15 segundos
})();

async function cargarTodo() {
    // Consulta simultánea a las 6 tablas principales para obtener métricas y actividad
    const [resAsig, resMarket, resCalent, resMetricas, resCuentas, resLogs] = await Promise.all([
        sb.from("usuarios_asignado").select("*").lte("fecha_desde", today).gte("fecha_hasta", today),
        sb.from("marketplace_actividad").select("usuario").eq("fecha_publicacion", today),
        sb.from("calentamiento_actividad").select("usuario").eq("fecha", today),
        sb.from("metricas").select("usuario, created_at").order("created_at", {ascending:false}),
        sb.from("cuentas_facebook").select("ocupada_por, calidad"),
        sb.from("usuarios_actividad").select("*").order("created_at", { ascending: false }).limit(50)
    ]);

    const asignaciones = resAsig.data || [];
    const logs = resLogs.data || [];

    // Lógica para renderizar las tarjetas de progreso de cada operador
    const grid = $("grid-team");
    grid.innerHTML = "";

    if (asignaciones.length === 0) {
        grid.innerHTML = "<p class='muted' style='grid-column: 1/-1; text-align:center;'>No hay asignaciones para hoy.</p>";
    }

    asignaciones.forEach(asig => {
        const u = asig.usuario;

        // Cálculo de progreso de Marketplace y estado de calentamiento/métricas
        const hechosMP = (resMarket.data || []).filter(x => x.usuario === u).length;
        const metaMP = asig.marketplace_daily || 1;
        const porcMP = Math.min((hechosMP / metaMP) * 100, 100);
        const hechosCalent = (resCalent.data || []).filter(x => x.usuario === u).length;
        
        const ultMetrica = (resMetricas.data || []).find(m => m.usuario === u);
        let estadoMetrica = '<span class="badge bg-red">Nunca</span>';
        if (ultMetrica) {
            const diasDiff = Math.floor((new Date() - new Date(ultMetrica.created_at)) / (1000 * 60 * 60 * 24));
            estadoMetrica = diasDiff < 7 ? '<span class="badge bg-green">Al día</span>' : `<span class="badge bg-red">Hace ${diasDiff} días</span>`;
        }

        const misCuentas = (resCuentas.data || []).filter(c => c.ocupada_por === u);
        const frias = misCuentas.filter(c => c.calidad === 'fria').length;
        const calientes = misCuentas.filter(c => c.calidad === 'caliente').length;
        const baneadas = misCuentas.filter(c => c.calidad === 'baneada').length;

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
                        ${estadoMetrica}
                    </div>
                    <div style="background:#1e293b; padding:8px; border-radius:6px; font-size:0.75rem; display:flex; justify-content:space-around;">
                        <div style="text-align:center;"><span style="color:#60a5fa;">${frias}</span><br>Frias</div>
                        <div style="text-align:center;"><span style="color:#34d399;">${calientes}</span><br>Listas</div>
                        <div style="text-align:center;"><span style="color:#f87171;">${baneadas}</span><br>Ban</div>
                    </div>
                </div>
            </div>`;
    });

    // Lógica para llenar la tabla de registros de acceso con conversión de hora local
    const tbody = $("tabla-logs");
    tbody.innerHTML = "";
    
    if (logs.length === 0) {
        tbody.innerHTML = "<tr><td colspan='4' style='text-align:center; padding:15px;'>Sin actividad reciente.</td></tr>";
    } else {
        logs.forEach(l => {
            const horaArg = new Date(l.created_at).toLocaleTimeString('es-AR', { 
                timeZone: 'America/Argentina/Buenos_Aires',
                hour: '2-digit', minute:'2-digit', second:'2-digit'
            });
            
            let color = "white";
            const evt = (l.evento || "").toUpperCase();
            if (evt.includes("LOGIN")) color = "#4ade80";
            if (evt.includes("LOGOUT")) color = "#f87171";

            tbody.innerHTML += `
                <tr style="border-bottom:1px solid #334155;">
                    <td style="color:#94a3b8; font-family:monospace; padding:8px;">${horaArg}</td>
                    <td style="font-weight:bold; color:white;">${l.usuario}</td>
                    <td style="color:${color};">${l.evento}</td>
                    <td class="muted">${l.cuenta_fb || '-'}</td>
                </tr>`;
        });
    }
}

// Funciones administrativas para exportar datos y mantenimiento de la tabla de logs
async function descargarCSV() {
    const { data } = await sb.from("usuarios_actividad").select("*").order("created_at", {ascending:false});
    if(!data || data.length === 0) return alert("No hay datos.");

    let csv = "ID,Fecha_UTC,Hora_Argentina,Usuario,Evento,Detalle\n";
    data.forEach(row => {
        const fArg = new Date(row.created_at).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
        csv += `${row.id},${row.created_at},"${fArg}",${row.usuario},${row.evento},${row.cuenta_fb||''}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `Reporte_Actividad_${today}.csv`;
    a.click();
}

async function limpiarLogs() {
    if(confirm("⚠️ ¿Borrar historial de accesos?")) {
        await sb.from("usuarios_actividad").delete().neq("id", 0);
        location.reload();
    }
}