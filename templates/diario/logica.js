import { requireSession, loadSidebar, fmtDateISO, nowISO } from "../../assets/js/app.js";

const s = requireSession();
const sb = window.supabaseClient;
const $ = (id) => document.getElementById(id);
const today = fmtDateISO(new Date());

// Variables globales para el Operador
let itemsCSV = [];
let itemActual = null;
let miAsignacion = null;

(async function init() {
    await loadSidebar({ activeKey: "diario", basePath: "../" });

    if (s.rol === "gerente") {
        $("view-gerente").style.display = "block";
        await cargarSupervisionGerente();
        setInterval(cargarSupervisionGerente, 20000);
    } else {
        $("view-operador").style.display = "block";
        await cargarPanelOperador();
    }
})();

// ==========================================
// SECCIÓN GERENTE: SUPERVISIÓN EN TIEMPO REAL
// ==========================================
async function cargarSupervisionGerente() {
    const [resAsig, resAct] = await Promise.all([
        sb.from("usuarios_asignado").select("*").lte("fecha_desde", today).gte("fecha_hasta", today),
        sb.from("marketplace_actividad").select("usuario").eq("fecha_publicacion", today)
    ]);

    const grid = $("grid-supervision");
    grid.innerHTML = "";
    
    (resAsig.data || []).forEach(asig => {
        const hechos = (resAct.data || []).filter(a => a.usuario === asig.usuario).length;
        const meta = asig.marketplace_daily || 0;
        const porc = meta > 0 ? Math.min((hechos / meta) * 100, 100) : 0;

        grid.innerHTML += `
            <div class="card-operador">
                <div style="display:flex; justify-content:space-between;">
                    <strong>${asig.usuario}</strong>
                    <span class="pill" style="background:#3b82f6;">${hechos} / ${meta}</span>
                </div>
                <div class="muted" style="font-size:0.8rem; margin:5px 0;">📦 Categoria: ${asig.categoria}</div>
                <div class="progress-container"><div class="progress-bar" style="width:${porc}%"></div></div>
                <div style="font-size:0.75rem; text-align:right; color:${porc === 100 ? '#10b981' : '#94a3b8'}">
                    ${porc === 100 ? '✅ COMPLETADO' : `Faltan ${meta - hechos} publicaciones`}
                </div>
            </div>`;
    });
}

// ==========================================
// SECCIÓN OPERADOR: LÓGICA DE TRABAJO PESADO
// ==========================================
async function cargarPanelOperador() {
    const { data: asig } = await sb.from("usuarios_asignado").select("*").eq("usuario", s.usuario).lte("fecha_desde", today).gte("fecha_hasta", today).maybeSingle();

    if (!asig) {
        $("panel-operador").style.display = "none";
        $("error-bloqueo").style.display = "block";
        return;
    }

    miAsignacion = asig;
    await cargarEstadoCuentas();
    await cargarCSV();
    
    // Botones de acción
    $("btn-rotar").onclick = rotarRecurso;
    $("btn-save").onclick = guardarPublicacion;
    $("btn-download-img").onclick = () => itemActual?.url_imagenes_portadas && window.open(itemActual.url_imagenes_portadas, '_blank');
}

async function cargarEstadoCuentas() {
    // --- SOLUCIÓN AL RESET: GUARDAR LO QUE EL USUARIO TENÍA SELECCIONADO ---
    const select = $("sel-cuenta-usada");
    const cuentaPrevia = select.value;

    const [resCuentas, resAct] = await Promise.all([
        sb.from("cuentas_facebook").select("email").eq("ocupada_por", s.usuario),
        sb.from("marketplace_actividad").select("facebook_account_usada").eq("usuario", s.usuario).eq("fecha_publicacion", today)
    ]);

    const lista = $("cuentas-list");
    lista.innerHTML = "";
    select.innerHTML = "";

    const metaIndividual = miAsignacion.marketplace_daily;
    let totalHechosHoy = resAct.data?.length || 0;

    // Actualizar Header de Progreso
    const porcTotal = Math.min((totalHechosHoy / metaIndividual) * 100, 100);
    $("header-progreso").innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <span>Categoría: <strong>${miAsignacion.categoria}</strong></span>
            <span style="font-size:1.2rem;">🚀 <strong>${totalHechosHoy}</strong> / ${metaIndividual}</span>
        </div>
        <div class="progress-container"><div class="progress-bar" style="width:${porcTotal}%"></div></div>
    `;

    (resCuentas.data || []).forEach(c => {
        const hechosConEsta = (resAct.data || []).filter(a => a.facebook_account_usada === c.email).length;
        const faltan = Math.max(0, metaIndividual - hechosConEsta);

        lista.innerHTML += `
            <div style="display:flex; justify-content:space-between; font-size:0.85rem; padding:5px; border-bottom:1px solid #334155;">
                <span class="muted">${c.email}</span>
                <span class="${faltan === 0 ? 'status-ok' : 'status-pending'}">${faltan === 0 ? 'LISTO' : 'Faltan ' + faltan}</span>
            </div>`;

        const opt = document.createElement("option");
        opt.value = c.email; opt.textContent = c.email;
        select.appendChild(opt);
    });

    // --- RESTAURAR LA CUENTA QUE EL OPERADOR ESTABA USANDO ---
    if (cuentaPrevia && Array.from(select.options).some(o => o.value === cuentaPrevia)) {
        select.value = cuentaPrevia;
    }
}

async function cargarCSV() {
    const { data: cat } = await sb.from("categoria").select("csv_nombre").eq("nombre", miAsignacion.categoria).single();
    if (!cat?.csv_nombre) return;

    const { data: url } = sb.storage.from('categoria_csv').getPublicUrl(cat.csv_nombre);
    const res = await fetch(url.publicUrl);
    const text = await res.text();
    const lines = text.split("\n").filter(l => l.trim().length > 0);
    const headers = lines[0].split(",").map(h => h.trim().toLowerCase());

    itemsCSV = lines.slice(1).map(line => {
        const values = line.split(",");
        return headers.reduce((obj, h, i) => { obj[h] = values[i]?.trim(); return obj; }, {});
    });
    rotarRecurso();
}

function rotarRecurso() {
    if (itemsCSV.length === 0) return;
    itemActual = itemsCSV[Math.floor(Math.random() * itemsCSV.length)];
    $("csv-titulo").value = itemActual.titulo || "";
    $("csv-desc").value = itemActual.descripcion || "";
    verificarDuplicado(itemActual.titulo);
}

async function verificarDuplicado(titulo) {
    const { data } = await sb.from("marketplace_actividad").select("id").eq("titulo", titulo).eq("fecha_publicacion", today).limit(1);
    const aviso = $("titulo-aviso");
    if (data?.length > 0) {
        aviso.textContent = "⚠️ Ya usaste este título hoy."; aviso.style.color = "#f59e0b";
    } else {
        aviso.textContent = "✅ Título disponible."; aviso.style.color = "#10b981";
    }
}

async function guardarPublicacion() {
    const link = $("inp-link").value.trim();
    const cuenta = $("sel-cuenta-usada").value;

    if (!link.startsWith("http")) return alert("Pega un link válido.");

    const { error } = await sb.from("marketplace_actividad").insert([{
        usuario: s.usuario,
        fecha_publicacion: today,
        titulo: $("csv-titulo").value,
        descripcion: $("csv-desc").value,
        categoria: miAsignacion.categoria,
        marketplace_link_publicacion: link,
        facebook_account_usada: cuenta,
        created_at: nowISO()
    }]);

    if (error) alert("Error: " + error.message);
    else {
        alert("✅ Guardado con éxito.");
        $("inp-link").value = "";
        await cargarEstadoCuentas(); // Esto refresca el progreso sin perder la cuenta seleccionada
        rotarRecurso();
    }
}

// Función global de copiado
window.copiar = (id) => {
    const el = $(id);
    el.select();
    navigator.clipboard.writeText(el.value);
};