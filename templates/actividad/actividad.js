import { requireSession, loadSidebar, fmtDateISO } from "../../assets/js/app.js";

const s = requireSession();
const sb = window.supabaseClient;
const $ = (id) => document.getElementById(id);
const today = fmtDateISO(new Date());

(async function init() {
    await loadSidebar({ activeKey: "actividad", basePath: "../" });

    // Seguridad: Solo Gerente
    if (s.rol !== "gerente") {
        document.body.innerHTML = "<h1 style='color:white;text-align:center;margin-top:50px;'>⛔ Acceso Denegado: Solo Gerencia</h1>";
        return;
    }

    // Reloj ARG (Se actualiza cada segundo)
    setInterval(() => {
        if($("reloj-arg")) {
            $("reloj-arg").textContent = new Date().toLocaleTimeString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
        }
    }, 1000);

    // Eventos de botones
    if($("btn-descargar")) $("btn-descargar").onclick = descargarCSV;
    if($("btn-limpiar")) $("btn-limpiar").onclick = limpiarLogs;

    // Carga de datos inicial y bucle
    await cargarSupervision();
    setInterval(cargarSupervision, 15000); // Refrescar cada 15 seg
})();

async function cargarSupervision() {
    // 1. TRAER TODA LA INFORMACIÓN (6 Tablas en paralelo)
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

    // --- RENDERIZAR GRID DE OPERADORES ---
    const grid = $("grid-team");
    if(grid) {
        grid.innerHTML = "";
        
        if (asignaciones.length === 0) {
            grid.innerHTML = "<p class='muted' style='grid-column: 1/-1; text-align:center;'>No hay operadores asignados para trabajar hoy.</p>";
        }

        asignaciones.forEach(asig => {
            const u = asig.usuario;

            // A. Marketplace
            const hechosMP = (resMarket.data || []).filter(x => 
    x.usuario === u && x.fecha_publicacion && x.fecha_publicacion.startsWith(today)
).length;
            const metaMP = asig.marketplace_daily || 1;
            const porcMP = Math.min((hechosMP / metaMP) * 100, 100);

            // B. Calentamiento
            const hechosCalent = (resCalent.data || []).filter(x => x.usuario === u).length;
            
            // C. Métricas (7 días)
            const ultMetrica = (resMetricas.data || []).find(m => m.usuario === u);
            let estadoMetrica = '<span class="badge bg-red">Nunca</span>';
            if (ultMetrica) {
                const diasDiff = Math.floor((new Date() - new Date(ultMetrica.created_at)) / (1000 * 60 * 60 * 24));
                if (diasDiff < 7) estadoMetrica = '<span class="badge bg-green">Al día</span>';
                else estadoMetrica = `<span class="badge bg-red">Hace ${diasDiff} días</span>`;
            }

            // D. Cuentas
            const misCuentas = (resCuentas.data || []).filter(c => c.ocupada_por === u);
            const frias = misCuentas.filter(c => c.calidad === 'fria').length;
            const calientes = misCuentas.filter(c => c.calidad === 'caliente').length;
            const baneadas = misCuentas.filter(c => c.calidad === 'baneada').length;

            // E. Conexión (Online si hubo log en ultimos 20 min)
            const lastLog = logs.find(l => l.usuario === u);
            const isOnline = lastLog && (new Date() - new Date(lastLog.created_at) < 20 * 60 * 1000);

            grid.innerHTML += `
                <div class="op-card">
                    <div class="op-header">
                        <div>
                            <span class="status-dot ${isOnline ? 'online' : 'offline'}"></span>
                            <strong style="font-size:1.1rem; color:white;">${u}</strong>
                        </div>
                        <span class="muted" style="font-size:0.8rem;">${asig.categoria}</span>
                    </div>
                    
                    <div class="op-body">
                        <div>
                            <div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom:2px; color:#cbd5e1;">
                                <span>📦 Marketplace</span>
                                <span style="color:${porcMP===100?'#34d399':'#60a5fa'}">${hechosMP}/${metaMP}</span>
                            </div>
                            <div class="progress-bg"><div class="progress-fill" style="width:${porcMP}%"></div></div>
                        </div>

                        <div class="stat-row">
                            <span style="color:#cbd5e1;">🔥 Calentamiento</span>
                            <span class="badge ${hechosCalent > 0 ? 'bg-green' : 'bg-yellow'}">${hechosCalent > 0 ? 'Realizado' : 'Pendiente'}</span>
                        </div>
                        <div class="stat-row">
                            <span style="color:#cbd5e1;">📊 Métricas</span>
                            ${estadoMetrica}
                        </div>

                        <div style="background:#1e293b; padding:8px; border-radius:6px; font-size:0.8rem; display:flex; justify-content:space-around; margin-top:5px;">
                            <div style="text-align:center;"><span style="color:#60a5fa; font-weight:bold;">${frias}</span><br><span class="muted">Frías</span></div>
                            <div style="text-align:center;"><span style="color:#34d399; font-weight:bold;">${calientes}</span><br><span class="muted">Listas</span></div>
                            <div style="text-align:center;"><span style="color:#f87171; font-weight:bold;">${baneadas}</span><br><span class="muted">Ban</span></div>
                        </div>
                    </div>
                </div>`;
        });
    }

    // --- RENDERIZAR TABLA LOGS ---
    const tbody = $("tabla-logs");
    if(tbody) {
        tbody.innerHTML = "";
        
        if (logs.length === 0) {
            tbody.innerHTML = "<tr><td colspan='4' style='text-align:center; padding:20px; color:#94a3b8;'>📭 No hay registros de actividad aún.<br>Prueba cerrar sesión y volver a entrar.</td></tr>";
        } else {
            logs.forEach(l => {
                const horaArg = new Date(l.created_at).toLocaleTimeString('es-AR', { 
                    timeZone: 'America/Argentina/Buenos_Aires',
                    hour: '2-digit', minute:'2-digit', second:'2-digit'
                });
                
                let color = "white";
                let icon = "⚪";
                const evt = (l.evento || "").toUpperCase();

                if (evt.includes("LOGIN") || evt.includes("ENTRÓ")) { color = "#4ade80"; icon = "🟢"; }
                if (evt.includes("LOGOUT") || evt.includes("SALIÓ")) { color = "#f87171"; icon = "🔴"; }

                tbody.innerHTML += `
                    <tr style="border-bottom:1px solid #334155;">
                        <td style="color:#94a3b8; font-family:monospace; padding:10px;">${horaArg}</td>
                        <td style="font-weight:bold; color:white; padding:10px;">${l.usuario}</td>
                        <td style="color:${color}; padding:10px;">${icon} ${l.evento}</td>
                        <td class="muted" style="padding:10px;">${l.cuenta_fb || '-'}</td>
                    </tr>`;
            });
        }
    }
}

// --- BOTONES ---
async function descargarCSV() {
    const { data } = await sb.from("usuarios_actividad").select("*").order("created_at", {ascending:false});
    if(!data || data.length === 0) return alert("No hay datos para descargar.");

    let csv = "ID,Fecha_UTC,Hora_Argentina,Usuario,Evento,Detalle\n";
    data.forEach(row => {
        const fechaArg = new Date(row.created_at).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
        csv += `${row.id},${row.created_at},"${fechaArg}",${row.usuario},${row.evento},${row.cuenta_fb||''}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `Reporte_Actividad_${today}.csv`;
    a.click();
}

async function limpiarLogs() {
    if(confirm("⚠️ ¿BORRAR TODO EL HISTORIAL DE ACCESOS?\nEsta acción es irreversible.")) {
        // Borramos todo excepto ID 0 (truco para delete all)
        await sb.from("usuarios_actividad").delete().neq("id", 0);
        location.reload();
    }
}