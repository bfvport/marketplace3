import { requireSession, loadSidebar } from "../../assets/js/app.js";

const s = requireSession();
const sb = window.supabaseClient;
const $ = (id) => document.getElementById(id);

// Inicialización
(async function init() {
    await loadSidebar({ activeKey: "calentamiento_gerente", basePath: "../" });

    // 1. Verificar Seguridad (Solo Gerentes)
    if (s.rol !== "gerente") {
        document.body.innerHTML = `
            <div style="text-align:center; padding:50px; color:white;">
                <h1 style="color:#ef4444;">⛔ Acceso Denegado</h1>
                <p>Esta configuración es exclusiva para Gerencia.</p>
                <a href="../dashboard/dashboard.html" style="color:#3b82f6;">Volver</a>
            </div>`;
        return;
    }

    await cargarConfiguracion();
    await cargarCuentas();

    $("btn-save").onclick = guardarConfiguracion;
})();

// --- LÓGICA DE CONFIGURACIÓN ---
async function cargarConfiguracion() {
    // Buscamos la fila con ID 1 (la configuración global)
    const { data: config, error } = await sb.from("configuracion_calentamiento").select("*").single();
    
    if (error && error.code !== 'PGRST116') {
        console.error("Error cargando config:", error);
        return;
    }

    if (config) {
        $("cfg-historias").value = config.meta_historias || 0;
        $("cfg-muro").value = config.meta_muro || 0;
        $("cfg-reels").value = config.meta_reels || 0;
        $("cfg-grupos").value = config.meta_grupos || 0;
        $("cfg-drive").value = config.link_drive || "";
    }
}

async function guardarConfiguracion() {
    const payload = {
        meta_historias: parseInt($("cfg-historias").value) || 0,
        meta_muro: parseInt($("cfg-muro").value) || 0,
        meta_reels: parseInt($("cfg-reels").value) || 0,
        meta_grupos: parseInt($("cfg-grupos").value) || 0,
        link_drive: $("cfg-drive").value,
        updated_at: new Date()
    };

    // Upsert (Actualiza si existe ID 1, crea si no)
    const { error } = await sb.from("configuracion_calentamiento").upsert({ id: 1, ...payload });

    if (error) {
        alert("❌ Error al guardar: " + error.message);
    } else {
        alert("✅ Estrategia actualizada correctamente. Los operadores verán los nuevos objetivos.");
    }
}

// --- LÓGICA DE GESTIÓN DE CUENTAS ---
async function cargarCuentas() {
    const { data: cuentas } = await sb.from("cuentas_facebook").select("*").order("calidad");
    
    // Contadores para KPIs
    const baneadas = cuentas.filter(c => c.calidad === 'baneada' || c.estado === 'inactiva').length;
    const frias = cuentas.filter(c => c.calidad === 'fria' || c.calidad === 'nueva').length;
    const calientes = cuentas.filter(c => c.calidad === 'caliente').length;

    $("stat-baneadas").textContent = baneadas;
    $("stat-frias").textContent = frias;
    $("stat-calientes").textContent = calientes;

    // Renderizar Tabla
    const tbody = $("tabla-cuentas");
    tbody.innerHTML = "";

    cuentas.forEach(c => {
        let colorEstado = "#94a3b8";
        if (c.calidad === 'caliente') colorEstado = "#10b981";
        if (c.calidad === 'fria') colorEstado = "#3b82f6";
        if (c.calidad === 'baneada') colorEstado = "#ef4444";

        tbody.innerHTML += `
            <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                <td>${c.email}</td>
                <td><span class="muted">${c.ocupada_por || 'Libre'}</span></td>
                <td style="color:${colorEstado}; font-weight:bold; text-transform:uppercase;">${c.calidad}</td>
                <td>
                    ${c.calidad !== 'baneada' ? 
                        `<button class="btn-danger" style="padding:4px 8px; font-size:0.7rem;" onclick="reportarBan('${c.id}')">☠️ Ban</button>` : 
                        `<span class="muted">Inactiva</span>`
                    }
                </td>
            </tr>
        `;
    });
}

// Función expuesta globalmente para el botón de la tabla
window.reportarBan = async (id) => {
    if (confirm("¿Confirmás que esta cuenta ha sido BANEADA permanentemente?")) {
        const { error } = await sb.from("cuentas_facebook").update({ 
            calidad: 'baneada', 
            estado: 'inactiva' // La marcamos inactiva para que no se pueda asignar
        }).eq("id", id);

        if (!error) {
            alert("Cuenta marcada como baneada.");
            cargarCuentas(); // Recargar tabla
        }
    }
};