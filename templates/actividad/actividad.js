import { requireSession, loadSidebar, fmtDateISO } from "../../assets/js/app.js";

const s = requireSession(); 
const sb = window.supabaseClient;
const $ = (id) => document.getElementById(id);
const today = fmtDateISO(new Date()); 

(async function init() {
    await loadSidebar({ activeKey: "actividad", basePath: "../" });

    if (s.rol !== "gerente") {
        document.body.innerHTML = "<h1 style='color:white;text-align:center;margin-top:50px;'>⛔ Acceso solo para Gerentes</h1>";
        return;
    }

    setInterval(() => {
        if($("reloj-arg")) {
            $("reloj-arg").textContent = new Date().toLocaleTimeString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
        }
    }, 1000);

    if($("btn-descargar")) $("btn-descargar").onclick = descargarCSV;
    if($("btn-limpiar")) $("btn-limpiar").onclick = limpiarLogs;

    await cargarMonitor();
    setInterval(cargarMonitor, 15000); 
})();

async function cargarMonitor() {
    // Definimos el rango de hoy para comparar con los timestamps de la DB
    const startOfDay = `${today}T00:00:00.000Z`;
    const endOfDay = `${today}T23:59:59.999Z`;

    const [resAsig, resMarket, resCalent, resMetricas, resCuentas, resLogs] = await Promise.all([
        sb.from("usuarios_asignado").select("*").lte("fecha_desde", today).gte("fecha_hasta", today),
        // Consultamos todas las publicaciones de hoy usando un rango de tiempo
        sb.from("marketplace_actividad").select("usuario, fecha_publicacion").gte("fecha_publicacion", startOfDay).lte("fecha_publicacion", endOfDay),
        sb.from("calentamiento_actividad").select("usuario").eq("fecha", today),
        sb.from("metricas").select("usuario, created_at").order("created_at", {ascending:false}),
        sb.from("cuentas_facebook").select("ocupada_por, calidad"),
        sb.from("usuarios_actividad").select("*").order("created_at", { ascending: false }).limit(50)
    ]);

    const asignaciones = resAsig.data || [];
    const logs = resLogs.data || [];
    const marketplaceData = resMarket.data || [];

    const grid = $("grid-team");
    grid.innerHTML = "";

    asignaciones.forEach(asig => {
        const u = asig.usuario;

        // CONTEO REAL: Filtramos los datos que ya vienen de hoy por usuario
        const hechosMP = marketplaceData.filter(x => x.usuario === u).length;
        
        const metaMP = asig.marketplace_daily || 1;
        const porcMP = Math.min((hechosMP / metaMP) * 100, 100);
        const hechosCalent = (resCalent.data || []).filter(x => x.usuario === u).length;
        
        const ultMetrica = (resMetricas.data || []).find(m => m.usuario === u);
        let statusMetrica = '<span class="badge bg-red">Sin Datos</span>';
        if (ultMetrica) {
            const dias = Math.floor((new Date() - new Date(ultMetrica.created_at)) / (1000 * 60 * 60 * 24));
            statusMetrica = dias < 7 ? '<span class="badge bg-green">Al día</span>' : `<span class="badge bg-red">Hace ${dias}d</span>`;
        }

        const misCuentas = (resCuentas.data || []).filter(c => c.ocupada_por === u);
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
                        ${statusMetrica}
                    </div>
                </div>
            </div>`;
    });

    // Tu tabla de accesos que ya funciona perfectamente
    const tbody = $("tabla-logs");
    tbody.innerHTML = "";
    logs.forEach(l => {
        const hArg = new Date(l.created_at).toLocaleTimeString('es-AR', { 
            timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute:'2-digit', second:'2-digit'
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
// ... resto de funciones (descargarCSV, limpiarLogs)