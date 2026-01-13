import { requireSession, loadSidebar, fmtDateISO, nowISO } from "../../assets/js/app.js";

const s = requireSession();
const sb = window.supabaseClient;
const $ = (id) => document.getElementById(id);
const today = fmtDateISO(new Date());

let itemsCSV = [];
let itemActual = null;
let asignacionActiva = null;

(async function init() {
    await loadSidebar({ activeKey: "diario", basePath: "../" });

    if (s.rol === "gerente") {
        $("view-gerente").classList.remove("hidden");
        await cargarVistaGerente();
        setInterval(cargarVistaGerente, 20000); // Refresco automático
    } else {
        await cargarVistaOperador();
    }
})();

// --- VISTA GERENTE: CONTROL DE EQUIPO ---
async function cargarVistaGerente() {
    const { data: asigs } = await sb.from("usuarios_asignado").select("*").lte("fecha_desde", today).gte("fecha_hasta", today);
    const { data: hechos } = await sb.from("marketplace_actividad").select("usuario").eq("fecha_publicacion", today);

    const grid = $("grid-supervision");
    grid.innerHTML = "";
    $("last-sync").textContent = `Sincronizado: ${new Date().toLocaleTimeString()}`;

    asigs.forEach(a => {
        const totalHechos = hechos.filter(x => x.usuario === a.usuario).length;
        const meta = a.marketplace_daily || 0;
        const porc = meta > 0 ? Math.min((totalHechos / meta) * 100, 100) : 0;

        grid.innerHTML += `
            <div class="card-operador">
                <div style="display:flex; justify-content:space-between; align-items:start;">
                    <strong>${a.usuario}</strong>
                    <span class="pill" style="background:#3b82f6;">${totalHechos} / ${meta}</span>
                </div>
                <div class="muted" style="font-size:0.8rem; margin:8px 0;">📦 Categoría: ${a.categoria}</div>
                <div class="progress-container"><div class="progress-bar" style="width:${porc}%"></div></div>
                <div style="font-size:0.7rem; text-align:right; color:#94a3b8;">${porc === 100 ? '✅ META CUMPLIDA' : 'En progreso...'}</div>
            </div>`;
    });
}

// --- VISTA OPERADOR: CARGA Y CSV ---
async function cargarVistaOperador() {
    // 1. Buscar asignación del día (Categoría asignada)
    const { data: asig, error } = await sb.from("usuarios_asignado")
        .select("*")
        .eq("usuario", s.usuario)
        .lte("fecha_desde", today)
        .gte("fecha_hasta", today)
        .maybeSingle();

    if (!asig || error) {
        return $("panel-error").classList.remove("hidden");
    }

    asignacionActiva = asig;
    $("view-operador").classList.remove("hidden");

    await actualizarStatusCuentas();
    await procesarCSV();

    $("btn-rotar").onclick = rotarRecurso;
    $("btn-save").onclick = guardarLink;
}

async function actualizarStatusCuentas() {
    // Guardar cuenta seleccionada para no perder el foco
    const select = $("sel-cuenta");
    const cuentaPrevia = select.value;

    const { data: cuentas } = await sb.from("cuentas_facebook").select("email").eq("ocupada_por", s.usuario);
    const { data: hechos } = await sb.from("marketplace_actividad").select("*").eq("usuario", s.usuario).eq("fecha_publicacion", today);

    const lista = $("lista-cuentas-status");
    lista.innerHTML = "";
    select.innerHTML = "";

    // Header de progreso general
    const total = hechos.length;
    const metaGral = asignacionActiva.marketplace_daily;
    $("header-progreso").innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <span>Trabajando hoy en: <strong>${asignacionActiva.categoria}</strong></span>
            <span style="font-size:1.1rem; font-weight:bold;">${total} / ${metaGral} Publicaciones</span>
        </div>
        <div class="progress-container"><div class="progress-bar" style="width:${(total/metaGral)*100}%"></div></div>`;

    // Detalle por cada cuenta (Faltantes)
    cuentas.forEach(c => {
        const hechosCuenta = hechos.filter(h => h.facebook_account_usada === c.email).length;
        const faltan = Math.max(0, 10 - hechosCuenta); // Meta de 10 por cuenta según captura

        lista.innerHTML += `
            <div style="display:flex; justify-content:space-between; font-size:0.85rem; padding:5px 0; border-bottom:1px solid rgba(255,255,255,0.03);">
                <span class="muted">${c.email}</span>
                <span style="color:${faltan === 0 ? '#10b981' : '#f59e0b'}; font-weight:bold;">${faltan === 0 ? 'LISTO' : 'Faltan ' + faltan}</span>
            </div>`;

        const opt = document.createElement("option");
        opt.value = c.email; opt.textContent = c.email;
        select.appendChild(opt);
    });

    if (cuentaPrevia) select.value = cuentaPrevia;
}

async function procesarCSV() {
    // Buscar la ruta del CSV en la tabla categoria
    const { data: cat } = await sb.from("categoria").select("csv_nombre").eq("nombre", asignacionActiva.categoria).single();
    
    if (!cat?.csv_nombre) {
        return alert("Error: No hay CSV cargado para esta categoría.");
    }

    // Descargar desde el storage
    const { data: blob } = await sb.storage.from('categoria_csv').download(cat.csv_nombre);
    const text = await blob.text();
    const rows = text.split("\n").filter(r => r.trim());
    const headers = rows[0].split(",").map(h => h.trim().toLowerCase());

    itemsCSV = rows.slice(1).map(row => {
        const cells = row.split(",");
        return headers.reduce((obj, h, i) => { obj[h] = cells[i]?.trim(); return obj; }, {});
    });

    rotarRecurso();
}

function rotarRecurso() {
    if (itemsCSV.length === 0) return;
    itemActual = itemsCSV[Math.floor(Math.random() * itemsCSV.length)];
    
    $("csv-titulo").value = itemActual.titulo || "";
    $("csv-desc").value = itemActual.descripcion || "";
    $("csv-cat-fb").value = itemActual.categoria || "N/A"; // Categoría real de FB
    $("csv-tags").value = itemActual.etiquetas || ""; // Etiquetas del CSV
}

async function guardarLink() {
    const link = $("inp-link").value.trim();
    if (!link.startsWith("http")) return alert("Por favor, pega un link válido de Marketplace.");

    const { error } = await sb.from("marketplace_actividad").insert([{
        usuario: s.usuario,
        fecha_publicacion: today,
        titulo: $("csv-titulo").value,
        descripcion: $("csv-desc").value,
        categoria: asignacionActiva.categoria,
        marketplace_link_publicacion: link,
        facebook_account_usada: $("sel-cuenta").value,
        created_at: nowISO()
    }]);

    if (!error) {
        $("inp-link").value = "";
        await actualizarStatusCuentas();
        rotarRecurso();
    } else {
        alert("Error al guardar: " + error.message);
    }
}

// Función global para botones copiar
window.copiar = (id) => {
    const el = $(id);
    el.select();
    navigator.clipboard.writeText(el.value);
};