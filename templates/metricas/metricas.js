import { requireSession, loadSidebar, fmtDateISO } from "../../assets/js/app.js";

const s = requireSession();
const sb = window.supabaseClient;
const $ = (id) => document.getElementById(id);

await loadSidebar({ activeKey: "metricas", basePath: "../" });

async function init() {
    await cargarCuentasPropias();
    await cargarHistorial();
    await verificarAlertas();
}

// 1. Cargar cuentas asignadas al operador en el Select
async function cargarCuentasPropias() {
    const { data } = await sb.from("cuentas_facebook")
        .select("email")
        .eq("ocupada_por", s.usuario); // Solo las mías

    const sel = $("sel-cuenta");
    sel.innerHTML = "";
    if (!data || data.length === 0) {
        sel.innerHTML = "<option>No tienes cuentas asignadas</option>";
        return;
    }
    data.forEach(c => {
        sel.innerHTML += `<option value="${c.email}">${c.email}</option>`;
    });
}

// 2. Guardar métrica
$("btn-guardar").onclick = async () => {
    const cuenta = $("sel-cuenta").value;
    const clicks = $("inp-clicks").value;

    if (!clicks || clicks < 0) return alert("Ingresa una cantidad válida de clicks.");

    const { error } = await sb.from("metricas").insert([{
        usuario: s.usuario,
        email_cuenta: cuenta,
        clicks_7_dias: clicks,
        tipo_cuenta: "marketplace"
    }]);

    if (error) alert("Error: " + error.message);
    else {
        alert("✅ Métrica guardada correctamente.");
        $("inp-clicks").value = "";
        cargarHistorial();
        verificarAlertas(); // Re-chequear si se va el alerta
    }
};

// 3. Cargar Historial (Gerente ve todo, Operador solo lo suyo)
async function cargarHistorial() {
    let query = sb.from("metricas").select("*").order("created_at", { ascending: false }).limit(20);
    
    if (s.rol !== "gerente") {
        query = query.eq("usuario", s.usuario);
    }

    const { data } = await query;
    const tbody = $("lista-metricas");
    tbody.innerHTML = "";

    (data || []).forEach(m => {
        const fecha = new Date(m.created_at).toLocaleDateString();
        tbody.innerHTML += `
            <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                <td style="padding:8px; color:#94a3b8;">${fecha}</td>
                <td style="padding:8px;">${m.email_cuenta}</td>
                <td style="padding:8px; font-weight:bold; color:#60a5fa;">${m.clicks_7_dias}</td>
                <td style="padding:8px;">${m.usuario}</td>
            </tr>
        `;
    });
}

// 4. Verificar si hace falta cargar métricas (Alerta de 7 días)
async function verificarAlertas() {
    // Buscamos la última métrica cargada por este usuario
    const { data } = await sb.from("metricas")
        .select("created_at")
        .eq("usuario", s.usuario)
        .order("created_at", { ascending: false })
        .limit(1);

    const alertaBox = $("alerta-carga");
    
    if (!data || data.length === 0) {
        // Nunca cargó nada
        alertaBox.style.display = "block";
        return;
    }

    const ultimaFecha = new Date(data[0].created_at);
    const hoy = new Date();
    const diffDias = Math.floor((hoy - ultimaFecha) / (1000 * 60 * 60 * 24));

    if (diffDias >= 7) {
        alertaBox.style.display = "block";
        alertaBox.querySelector("p").textContent = `Hace ${diffDias} días que no registras métricas. Es obligatorio semanalmente.`;
    } else {
        alertaBox.style.display = "none";
    }
}

init();