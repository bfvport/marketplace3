import { requireSession, loadSidebar } from "../../assets/js/app.js";

const s = requireSession();
const sb = window.supabaseClient;
const $ = (id) => document.getElementById(id);

(async function init() {
    await loadSidebar({ activeKey: "calentamiento_gerente", basePath: "../" });
    
    await cargarEstadisticas();
    await cargarConfiguracion();
    await cargarListaCuentas();

    $("btn-save-config").onclick = guardarConfiguracion;
})();

async function cargarEstadisticas() {
    const { data: cuentas } = await sb.from("cuentas_facebook").select("calidad");
    
    const baneadas = cuentas.filter(c => c.calidad === "inactiva" || c.calidad === "baneada").length;
    const frias = cuentas.filter(c => c.calidad === "fria" || c.calidad === "nueva").length;
    const calientes = cuentas.filter(c => c.calidad === "caliente").length;

    $("count-baneadas").textContent = baneadas;
    $("count-frias").textContent = frias;
    $("count-calientes").textContent = calientes;
}

async function cargarConfiguracion() {
    const { data } = await sb.from("configuracion_calentamiento").select("*").single();
    if (data) {
        $("cfg-min").value = data.rango_min;
        $("cfg-max").value = data.rango_max;
        $("cfg-drive").value = data.link_drive;
    }
}

async function guardarConfiguracion() {
    const payload = {
        id: 1, // Siempre usamos el ID 1 para la config global
        rango_min: parseInt($("cfg-min").value),
        rango_max: parseInt($("cfg-max").value),
        link_drive: $("cfg-drive").value,
        updated_at: new Date().toISOString()
    };

    const { error } = await sb.from("configuracion_calentamiento").upsert(payload);

    if (error) alert("Error: " + error.message);
    else alert("✅ Configuración de calentamiento actualizada.");
}

async function cargarListaCuentas() {
    const { data: cuentas } = await sb.from("cuentas_facebook").select("*").order("calidad");
    const tabla = $("tabla-cuentas-calentamiento");
    tabla.innerHTML = "";

    cuentas.forEach(c => {
        let dia = "---";
        if (c.fecha_inicio_calentamiento) {
            const diff = Math.abs(new Date() - new Date(c.fecha_inicio_calentamiento));
            dia = Math.ceil(diff / (1000 * 60 * 60 * 24));
        }

        const colorEstado = c.calidad === "caliente" ? "#10b981" : (c.calidad === "inactiva" ? "#ef4444" : "#f59e0b");

        tabla.innerHTML += `
            <tr style="border-bottom: 1px solid #334155;">
                <td style="padding:10px;">${c.email}</td>
                <td><span style="color:${colorEstado}; font-weight:bold;">${c.calidad.toUpperCase()}</span></td>
                <td>${dia > 30 ? "30+" : dia}</td>
                <td>${c.ocupada_por || 'Sin asignar'}</td>
            </tr>
        `;
    });
}