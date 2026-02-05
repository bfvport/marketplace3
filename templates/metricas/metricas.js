import { requireSession, loadSidebar, fmtDateISO } from "../../assets/js/app.js";

const s = requireSession();
const sb = window.supabaseClient;
const $ = (id) => document.getElementById(id);

// Carga inicial del sidebar y permisos
await loadSidebar({ activeKey: "metricas", basePath: "../" });

async function init() {
    await cargarCuentasPropias();
    await cargarHistorial();
    await verificarAlertasLocales();
}

// 1. CARGAR CUENTAS EN EL SELECT
// Solo muestra las cuentas que el usuario tiene asignadas en "ocupada_por"
async function cargarCuentasPropias() {
    const { data } = await sb.from("cuentas_facebook")
        .select("email")
        .eq("ocupada_por", s.usuario); 

    const sel = $("sel-cuenta");
    sel.innerHTML = "";
    
    if (!data || data.length === 0) {
        sel.innerHTML = "<option value=''>No tienes cuentas asignadas</option>";
        return;
    }
    data.forEach(c => {
        sel.innerHTML += `<option value="${c.email}">${c.email}</option>`;
    });
}

// 2. GUARDAR MÉTRICA (Corrección de nombres de columna)
$("btn-guardar").onclick = async () => {
    const cuenta = $("sel-cuenta").value;
    const clicks = $("inp-clicks").value;

    if (!cuenta) return alert("No hay cuenta seleccionada.");
    if (!clicks || clicks < 0) return alert("Ingresa una cantidad válida de clicks.");

    // Insertamos usando los nombres EXACTOS que pide Nahuel y el Dashboard
    const { error } = await sb.from("metricas").insert([{
        usuario: s.usuario,
        mail: cuenta,                       // CORREGIDO: antes decía email_cuenta
        clicks_7_dias_marketplace: clicks,  // CORREGIDO: antes decía clicks_7_dias
        tipo_cuenta: "marketplace",
        created_at: new Date()
    }]);

    if (error) {
        alert("Error al guardar: " + error.message);
    } else {
        alert("✅ Métrica guardada correctamente. El dashboard se actualizará.");
        $("inp-clicks").value = "";
        await cargarHistorial();
        await verificarAlertasLocales(); // Revisa si ya se puede quitar el cartel rojo
    }
};

// 3. CARGAR HISTORIAL DE CARGAS
// Si es Gerente ve todo, si es Operador ve solo lo suyo
async function cargarHistorial() {
    let query = sb.from("metricas").select("*").order("created_at", { ascending: false }).limit(20);
    
    if (s.rol !== "gerente") {
        query = query.eq("usuario", s.usuario);
    }

    const { data } = await query;
    const tbody = $("lista-metricas");
    tbody.innerHTML = "";

    if (!data || data.length === 0) {
        tbody.innerHTML = "<tr><td colspan='4' class='muted'>No hay registros recientes.</td></tr>";
        return;
    }

    data.forEach(m => {
        const fecha = new Date(m.created_at).toLocaleDateString();
        // Usamos los nombres corregidos de la DB
        const email = m.mail || m.email_cuenta || "Sin datos"; 
        const clicks = m.clicks_7_dias_marketplace || m.clicks_7_dias || 0;

        tbody.innerHTML += `
            <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                <td style="padding:8px; color:#94a3b8;">${fecha}</td>
                <td style="padding:8px;">${email}</td>
                <td style="padding:8px; font-weight:bold; color:#60a5fa;">${clicks}</td>
                <td style="padding:8px;">${m.usuario}</td>
            </tr>
        `;
    });
}

// 4. VERIFICAR SI DEBE MOSTRAR ALERTA EN ESTA PÁGINA
async function verificarAlertasLocales() {
    // Busca la última carga de este usuario
    const { data } = await sb.from("metricas")
        .select("created_at")
        .eq("usuario", s.usuario)
        .order("created_at", { ascending: false })
        .limit(1);

    const alertaBox = $("alerta-carga");
    
    // Si nunca cargó nada, mostrar alerta
    if (!data || data.length === 0) {
        alertaBox.style.display = "block";
        $("texto-alerta").textContent = "Nunca has cargado métricas. Por favor carga tu primer reporte.";
        return;
    }

    // Calcular diferencia de días
    const ultimaFecha = new Date(data[0].created_at);
    const hoy = new Date();
    const diffDias = Math.floor((hoy - ultimaFecha) / (1000 * 60 * 60 * 24));

    if (diffDias >= 7) {
        alertaBox.style.display = "block";
        $("texto-alerta").textContent = `Hace ${diffDias} días que no registras métricas. Recuerda hacerlo semanalmente.`;
    } else {
        alertaBox.style.display = "none";
    }
}

init();