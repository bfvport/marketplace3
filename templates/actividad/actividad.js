import { requireSession, loadSidebar, fmtDateISO } from "../../assets/js/app.js";

const s = requireSession();
const sb = window.supabaseClient;
const $ = (id) => document.getElementById(id);
const today = fmtDateISO(new Date());

(async function init() {
    await loadSidebar({ activeKey: "actividad", basePath: "../" });

    // Seguridad: Solo Gerente
    if (s.rol !== "gerente") {
        document.body.innerHTML = "<h1 style='color:white;text-align:center;margin-top:50px;'>⛔ Solo Gerencia</h1>";
        return;
    }

    // Reloj en vivo (Hora Argentina)
    setInterval(() => {
        $("reloj-arg").textContent = new Date().toLocaleTimeString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
    }, 1000);

    // Carga de Datos y Eventos
    await cargarSupervision();
    setInterval(cargarSupervision, 30000); // Auto-refresco

    $("btn-descargar").onclick = descargarCSV;
    $("btn-limpiar").onclick = limpiarLogs;
})();

async function cargarSupervision() {
    // 1. TRAER TODO DE LA BASE DE DATOS (6 Tablas a la vez)
    const [
        resAsig,     // Metas de hoy
        resMarket,   // Publicaciones hechas hoy
        resCalent,   // Cuentas calentadas hoy
        resMetricas, // Últimas métricas cargadas
        resCuentas,  // Inventario de cuentas FB
        resLogs      // Login/Logout
    ] = await Promise.all([
        sb.from("usuarios_asignado").select("*").lte("fecha_desde", today).gte("fecha_hasta", today),
        sb.from("marketplace_actividad").select("usuario").eq("fecha_publicacion", today),
        sb.from("calentamiento_actividad").select("usuario").eq("fecha", today),
        sb.from("metricas").select("usuario, created_at").order("created_at", {ascending:false}),
        sb.from("cuentas_facebook").select("ocupada_por, calidad"),
        sb.from("usuarios_actividad").select("*").order("created_at", { ascending: false }).limit(100)
    ]);

    const asignaciones = resAsig.data || [];
    const logs = resLogs.data || [];

    // --- RENDERIZAR GRID DE OPERADORES ---
    const grid = $("grid-team");
    grid.innerHTML = "";

    if (asignaciones.length === 0) {
        grid.innerHTML = "<p class='muted'>No hay operadores asignados hoy.</p>";
    }

    asignaciones.forEach(asig => {
        const u = asig.usuario;

        // A. Calcular Marketplace
        const hechosMP = (resMarket.data || []).filter(x => x.usuario === u).length;
        const metaMP = asig.marketplace_daily || 1;
        const porcMP = Math.min((hechosMP / metaMP) * 100, 100);

        // B. Calcular Calentamiento (Hoy)
        const hechosCalent = (resCalent.data || []).filter(x => x.usuario === u).length;
        
        // C. Calcular Métricas (Vencimiento 7 días)
        const ultMetrica = (resMetricas.data || []).find(m => m.usuario === u);
        let estadoMetrica = '<span class="badge bg-red">Nunca</span>';
        if (ultMetrica) {
            const diasDiff = Math.floor((new Date() - new Date(ultMetrica.created_at)) / (1000 * 60 * 60 * 24));
            if (diasDiff < 7) estadoMetrica = '<span class="badge bg-green">Al día</span>';
            else estadoMetrica = `<span class="badge bg-red">Hace ${diasDiff} días</span>`;
        }

        // D. Estado de Cuentas FB
        const misCuentas = (resCuentas.data || []).filter(c => c.ocupada_por === u);
        const frias = misCuentas.filter(c => c.calidad === 'fria').length;
        const calientes = misCuentas.filter(c => c.calidad === 'caliente').length;
        const baneadas = misCuentas.filter(c => c.calidad === 'baneada').length;

        // E. Conexión (Online/Offline)
        const lastLog = logs.find(l => l.usuario === u);
        const isOnline = lastLog && (new Date() - new Date(lastLog.created_at) < 15 * 60 * 1000); // 15 min timeout

        // --- HTML DE LA TARJETA ---
        grid.innerHTML += `
            <div class="op-card">
                <div class="op-header">
                    <div>
                        <span class="status-dot ${isOnline ? 'online' : 'offline'}"></span>
                        <strong style="font-size:1.1rem;">${u}</strong>
                    </div>
                    <span class="muted" style="font-size:0.8rem;">${asig.categoria}</span>
                </div>
                
                <div class="op-body">
                    <div>
                        <div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom:2px;">
                            <span>📦 Marketplace</span>
                            <span style="color:${porcMP===100?'#34d399':'#60a5fa'}">${hechosMP}/${metaMP}</span>
                        </div>
                        <div class="progress-bg"><div class="progress-fill" style="width:${porcMP}%"></div></div>
                    </div>

                    <div class="stat-row">
                        <span>🔥 Calentamiento (Hoy)</span>
                        <span class="badge ${hechosCalent > 0 ? 'bg-green' : 'bg-yellow'}">${hechosCalent > 0 ? 'Activo' : 'Pendiente'}</span>
                    </div>
                    <div class="stat-row">
                        <span>📊 Carga Métricas</span>
                        ${estadoMetrica}
                    </div>

                    <div style="background:#1e293b; padding:8px; border-radius:6px; font-size:0.8rem; display:flex; justify-content:space-around; margin-top:5px;">
                        <div style="text-align:center;"><span style="color:#60a5fa; font-weight:bold;">${frias}</span><br>Frías</div>
                        <div style="text-align:center;"><span style="color:#34d399; font-weight:bold;">${calientes}</span><br>Listas</div>
                        <div style="text-align:center;"><span style="color:#f87171; font-weight:bold;">${baneadas}</span><br>Ban</div>
                    </div>
                </div>
            </div>
        `;
    });

    // --- RENDERIZAR TABLA DE LOGS (ABAJO) ---
    const tbody = $("tabla-logs");
    tbody.innerHTML = "";
    
    logs.forEach(l => {
        // Conversión estricta a Hora Argentina
        const fecha = new Date(l.created_at);
        const horaArg = fecha.toLocaleTimeString('es-AR', { 
            timeZone: 'America/Argentina/Buenos_Aires',
            hour: '2-digit', minute:'2-digit', second:'2-digit'
        });
        
        // Estilos
        let estiloAccion = "color:white;";
        if (l.evento.includes("login") || l.evento.includes("ENTRÓ")) estiloAccion = "color:#4ade80;"; // Verde
        if (l.evento.includes("logout") || l.evento.includes("SALIÓ")) estiloAccion = "color:#f87171;"; // Rojo

        tbody.innerHTML += `
            <tr style="border-bottom:1px solid #334155;">
                <td style="color:#94a3b8; font-family:monospace;">${horaArg}</td>
                <td style="font-weight:bold;">${l.usuario}</td>
                <td style="${estiloAccion}">${l.evento}</td>
                <td class="muted">${l.cuenta_fb || '-'}</td>
            </tr>
        `;
    });
}

// --- BOTONES ---
async function descargarCSV() {
    const { data } = await sb.from("usuarios_actividad").select("*").order("created_at", {ascending:false});
    if(!data) return alert("Sin datos.");

    let csv = "ID,Fecha_UTC,Hora_Argentina,Usuario,Evento,Detalle\n";
    data.forEach(row => {
        const fechaArg = new Date(row.created_at).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
        csv += `${row.id},${row.created_at},"${fechaArg}",${row.usuario},${row.evento},${row.cuenta_fb||''}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `Reporte_Total_${today}.csv`;
    a.click();
}

async function limpiarLogs() {
    if(confirm("⚠️ ¿BORRAR TODO EL HISTORIAL?\nEsta acción es irreversible.")) {
        await sb.from("usuarios_actividad").delete().neq("id", 0);
        location.reload();
    }
}