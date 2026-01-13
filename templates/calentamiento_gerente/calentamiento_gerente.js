import { requireSession, loadSidebar, fmtDateISO } from "../../assets/js/app.js";

const s = requireSession();
const sb = window.supabaseClient;
const $ = (id) => document.getElementById(id);
const today = fmtDateISO(new Date());

(async function init() {
    await loadSidebar({ activeKey: "calentamiento", basePath: "../" });

    if (s.rol === "gerente") {
        $("view-gerente").classList.remove("hidden");
        await initGerente();
    } else {
        $("view-operador").classList.remove("hidden");
        await initOperador();
    }
})();

// --- LÓGICA DEL GERENTE ---
async function initGerente() {
    const { data: config } = await sb.from("configuracion_calentamiento").select("*").single();
    if (config) {
        $("cfg-min").value = config.rango_min;
        $("cfg-max").value = config.rango_max;
        $("cfg-drive").value = config.link_drive;
    }

    const { data: cuentas } = await sb.from("cuentas_facebook").select("*");
    
    $("count-baneadas").textContent = cuentas.filter(c => c.calidad === "inactiva").length;
    $("count-frias").textContent = cuentas.filter(c => c.calidad === "fria" || c.calidad === "nueva").length;
    $("count-calientes").textContent = cuentas.filter(c => c.calidad === "caliente").length;

    const tabla = $("tabla-gerente");
    cuentas.forEach(c => {
        let dia = c.fecha_inicio_calentamiento ? Math.ceil(Math.abs(new Date() - new Date(c.fecha_inicio_calentamiento)) / 86400000) : "---";
        tabla.innerHTML += `<tr><td>${c.email}</td><td>${dia}</td><td style="color:#f59e0b">${c.calidad}</td><td>${c.ocupada_por || '---'}</td></tr>`;
    });

    $("btn-save-cfg").onclick = async () => {
        await sb.from("configuracion_calentamiento").upsert({
            id: 1, rango_min: parseInt($("cfg-min").value), rango_max: parseInt($("cfg-max").value), link_drive: $("cfg-drive").value
        });
        alert("Estrategia Guardada");
    };
}

// --- LÓGICA DEL OPERADOR ---
async function initOperador() {
    const { data: cfg } = await sb.from("configuracion_calentamiento").select("*").single();
    const { data: cuentas } = await sb.from("cuentas_facebook").select("*").eq("ocupada_por", s.usuario).neq("calidad", "caliente");

    $("link-recursos").href = cfg?.link_drive || "#";
    const lista = $("lista-misiones");

    cuentas.forEach(c => {
        if (!c.fecha_inicio_calentamiento) {
            sb.from("cuentas_facebook").update({ fecha_inicio_calentamiento: today }).eq("id", c.id).then();
        }
        
        const dia = Math.ceil(Math.abs(new Date() - new Date(c.fecha_inicio_calentamiento || today)) / 86400000) || 1;
        const cant = Math.floor(Math.random() * (cfg.rango_max - cfg.rango_min + 1)) + cfg.rango_min;
        
        let mision = dia <= 15 ? `${cant} Historias/Reels/Muro (Aleatorio)` : `1 Publicación Marketplace (Cargar Link)`;
        
        lista.innerHTML += `
            <div class="mision-card">
                <div style="display:flex; justify-content:space-between;">
                    <strong>Día ${dia} de 30</strong>
                    <small>${c.email}</small>
                </div>
                <h3 style="margin:10px 0;">${mision}</h3>
                ${dia > 15 ? `<input type="text" id="link-${c.id}" placeholder="Pega el link de marketplace aquí" style="margin-bottom:10px;">` : ''}
                <button class="btn" style="width:100%;" onclick="alert('Misión Guardada')">✅ Marcar como Hecho</button>
            </div>`;
    });
}