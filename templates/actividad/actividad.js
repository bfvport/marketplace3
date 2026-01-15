import { requireSession, loadSidebar, fmtDateISO } from "../../assets/js/app.js";

const s = requireSession();
const sb = window.supabaseClient;
const $ = (id) => document.getElementById(id);
const today = fmtDateISO(new Date());

// ====== RANGO "HOY" EN ARG (UTC para timestamps) ======
function getARGDayRangeUTC() {
    const now = new Date();
    const arg = new Date(now.toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
    const y = arg.getFullYear();
    const m = arg.getMonth();
    const d = arg.getDate();

    const startUTC = new Date(Date.UTC(y, m, d, 3, 0, 0));
    const endUTC = new Date(Date.UTC(y, m, d, 26, 59, 59));
    return { start: startUTC.toISOString(), end: endUTC.toISOString() };
}

function formatHoraARG(iso) {
    return new Date(iso).toLocaleTimeString('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
}

function escapeCSV(v) {
    const s = String(v ?? "");
    if (s.includes("\n") || s.includes(",") || s.includes('"')) return `"${s.replaceAll('"', '""')}"`;
    return s;
}

// ====== INIT ======
(async function init() {
    await loadSidebar({ activeKey: "actividad", basePath: "../" });

    // Solo gerente
    if (s.rol !== "gerente") {
        document.body.innerHTML = "<h1 style='color:white;text-align:center;margin-top:50px;'>⛔ Solo Gerencia</h1>";
        return;
    }

    // Reloj ARG
    setInterval(() => {
        if ($("reloj-arg")) {
            $("reloj-arg").textContent = new Date().toLocaleTimeString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
        }
    }, 1000);

    // Botones
    if ($("btn-descargar")) $("btn-descargar").onclick = descargarCSV;
    if ($("btn-limpiar")) $("btn-limpiar").onclick = limpiarLogs;

    await cargarMonitor();
    setInterval(cargarMonitor, 15000);
})();

// ====== MONITOR ======
async function cargarMonitor() {
    try {
        const { start, end } = getARGDayRangeUTC();

        const [resAsig, resMarket, resCalent, resMetricas, resLogs] = await Promise.all([
            sb.from("usuarios_asignado").select("*").lte("fecha_desde", today).gte("fecha_hasta", today),
            sb.from("marketplace_actividad").select("usuario, fecha_publicacion").gte("fecha_publicacion", start).lte("fecha_publicacion", end),
            sb.from("calentamiento_actividad").select("usuario").eq("fecha", today),
            sb.from("metricas").select("usuario, created_at").order("created_at", { ascending: false }),
            sb.from("usuarios_actividad").select("*").order("created_at", { ascending: false }).limit(200)
        ]);

        const asignaciones = resAsig.data || [];
        const marketplaceData = resMarket.data || [];
        const logs = resLogs.data || [];

        // --- TARJETAS EQUIPO ---
        const grid = $("grid-team");
        if (!grid) return;
        grid.innerHTML = "";

        if (asignaciones.length === 0) {
            grid.innerHTML = "<p class='muted' style='grid-column: 1/-1; text-align:center;'>No hay operadores trabajando hoy.</p>";
        }

        asignaciones.forEach(asig => {
            const u = asig.usuario;

            const hechosMP = marketplaceData.filter(x => x.usuario === u).length;
            const metaMP = asig.marketplace_daily || 0;
            const porcMP = metaMP > 0 ? Math.min((hechosMP / metaMP) * 100, 100) : 0;

            const hechosCalent = (resCalent.data || []).filter(x => x.usuario === u).length;

            const ultMetrica = (resMetricas.data || []).find(m => m.usuario === u);
            let badgeMetrica = '<span class="badge bg-red">Sin Datos</span>';
            if (ultMetrica) {
                const d = Math.floor((new Date() - new Date(ultMetrica.created_at)) / (1000 * 60 * 60 * 24));
                badgeMetrica = d < 7 ? '<span class="badge bg-green">Al día</span>' : `<span class="badge bg-red">Hace ${d}d</span>`;
            }

            const lastLog = logs.find(l => l.usuario === u);
            const isOnline = lastLog && (new Date() - new Date(lastLog.created_at) < 20 * 60 * 1000);

            grid.innerHTML += `
                <div class="op-card">
                    <div class="op-header">
                        <div><span class="status-dot ${isOnline ? 'online' : 'offline'}"></span><strong>${u}</strong></div>
                        <span class="muted" style="font-size:0.75rem;">${asig.categoria || '-'}</span>
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

        // --- TABLA LOGS (ENTRADA/SALIDA) ---
        const tbody = $("tabla-logs");
        if (!tbody) return;
        tbody.innerHTML = "";

        logs.forEach(l => {
            const hora = l.created_at ? formatHoraARG(l.created_at) : "--:--:--";
            let color = "white";
            const evt = (l.evento || "").toUpperCase();
            if (evt.includes("LOGIN")) color = "#4ade80";
            if (evt.includes("LOGOUT")) color = "#f87171";

            tbody.innerHTML += `
                <tr style="border-bottom:1px solid #334155;">
                    <td style="color:#94a3b8; font-family:monospace; padding:8px;">${hora}</td>
                    <td style="font-weight:bold; color:white;">${l.usuario || '-'}</td>
                    <td style="color:${color}; font-weight:bold;">${l.evento || 'Undefined'}</td>
                    <td class="muted">${l.cuenta_fb || '-'}</td>
                </tr>`;
        });

    } catch (err) {
        console.error("Error en el monitor:", err);
    }
}

// ====== EXPORTAR CSV ======
async function descargarCSV() {
    try {
        const { data, error } = await sb
            .from("usuarios_actividad")
            .select("id, created_at, usuario, evento, cuenta_fb")
            .order("created_at", { ascending: false })
            .limit(5000);

        if (error) {
            console.error(error);
            alert("No se pudo exportar el historial.");
            return;
        }

        const rows = data || [];
        if (rows.length === 0) {
            alert("No hay registros para exportar.");
            return;
        }

        const header = ["id", "created_at", "hora_ARG", "usuario", "evento", "cuenta_fb"].join(",");
        const lines = rows.map(r => {
            const hora = r.created_at ? formatHoraARG(r.created_at) : "";
            return [
                escapeCSV(r.id),
                escapeCSV(r.created_at),
                escapeCSV(hora),
                escapeCSV(r.usuario),
                escapeCSV(r.evento),
                escapeCSV(r.cuenta_fb),
            ].join(",");
        });

        const csv = [header, ...lines].join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = `historial_logins_${today}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    } catch (e) {
        console.error(e);
        alert("Error exportando el historial.");
    }
}

// ====== BORRAR HISTORIAL (para que no se llene la DB) ======
async function limpiarLogs() {
    try {
        const ok = confirm("¿Seguro que querés BORRAR TODO el historial de logins/logouts?\n\nRecomendado: primero exportá el CSV.");
        if (!ok) return;

        const { data: ids, error: e1 } = await sb
            .from("usuarios_actividad")
            .select("id")
            .order("id", { ascending: true })
            .limit(5000);

        if (e1) {
            console.error(e1);
            alert("No se pudo leer el historial para borrarlo.");
            return;
        }

        if (!ids || ids.length === 0) {
            alert("No hay registros para borrar.");
            return;
        }

        const batchSize = 500;
        for (let i = 0; i < ids.length; i += batchSize) {
            const chunk = ids.slice(i, i + batchSize).map(x => x.id);
            const { error } = await sb.from("usuarios_actividad").delete().in("id", chunk);
            if (error) {
                console.error(error);
                alert("Se borró una parte, pero hubo un error. Revisá consola.");
                return;
            }
        }

        alert("Historial borrado ✅");
        await cargarMonitor();
    } catch (e) {
        console.error(e);
        alert("Error borrando el historial.");
    }
}
