import { requireSession, loadSidebar } from "../../assets/js/app.js";

const s = requireSession();
const sb = window.supabaseClient;
const $ = (id) => document.getElementById(id);

let asignacionEditandoID = null;

// Ejecución inicial protegida
(async function init() {
    try {
        // CORRECCIÓN: 'activeKey' coincide con 'data-nav' en sidebar.html (plural)
        await loadSidebar({ activeKey: "asignaciones", basePath: "../" });

        if (s.rol !== "gerente") {
            document.querySelector(".content").innerHTML = "<h2 style='text-align:center;'>⛔ Acceso Restringido</h2>";
            return;
        }

        await cargarSelects();
        await cargarTabla();

        // Activamos botones si existen en el DOM
        if($("btn-nuevo")) $("btn-nuevo").onclick = abrirModalCrear;
        if($("btn-cancelar")) $("btn-cancelar").onclick = cerrarModal;
        if($("btn-guardar")) $("btn-guardar").onclick = guardarAsignacion;

    } catch (e) {
        console.error("Error iniciando Asignaciones:", e);
        alert("Error cargando la página. Verifica la consola.");
    }
})();

// --- CARGAR SELECTS ---
async function cargarSelects() {
    const selUser = $("sel-usuario");
    const selCat = $("sel-categoria");
    if (!selUser || !selCat) return;

    // Usuarios
    const { data: users } = await sb.from("usuarios").select("usuario").neq("rol", "gerente");
    selUser.innerHTML = "";
    (users || []).forEach(u => selUser.innerHTML += `<option value="${u.usuario}">${u.usuario}</option>`);

    // Categorías
    const { data: cats } = await sb.from("categoria").select("nombre");
    selCat.innerHTML = "";
    (cats || []).forEach(c => selCat.innerHTML += `<option value="${c.nombre}">${c.nombre}</option>`);
}

// --- CARGAR TABLA ---
async function cargarTabla() {
    const tbody = $("lista-asignaciones");
    if (!tbody) return;

    const { data, error } = await sb.from("usuarios_asignado").select("*").order("fecha_desde", { ascending: false });
    if (error) {
        console.error(error);
        tbody.innerHTML = "<tr><td colspan='5'>Error cargando datos</td></tr>";
        return;
    }

    tbody.innerHTML = "";
    data.forEach(item => {
        const tr = document.createElement("tr");
        tr.style.borderBottom = "1px solid rgba(255,255,255,0.05)";
        
        tr.innerHTML = `
            <td style="padding:12px; font-weight:bold; color:#f1f5f9;">${item.usuario}</td>
            <td style="padding:12px; color:#60a5fa;">${item.categoria}</td>
            <td style="padding:12px; font-size:0.9rem;">
                ${item.fecha_desde} <span class="muted">al</span> ${item.fecha_hasta}
            </td>
            <td style="padding:12px; font-size:0.85rem; font-family:monospace;">
                MP:${item.marketplace_daily} | GR:${item.grupos_daily} | ST:${item.historia_daily} | WL:${item.muro_daily}
            </td>
            <td style="padding:12px; text-align:right;">
                <button class="action-btn btn-edit" data-id="${item.id}">✏️</button>
                <button class="action-btn btn-del" data-id="${item.id}">🗑️</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    document.querySelectorAll(".btn-edit").forEach(btn => btn.onclick = () => abrirModalEditar(btn.dataset.id, data));
    document.querySelectorAll(".btn-del").forEach(btn => btn.onclick = () => eliminarAsignacion(btn.dataset.id));
}

// --- FUNCIONES MODAL ---
function abrirModalCrear() {
    asignacionEditandoID = null;
    if($("modal-titulo")) $("modal-titulo").textContent = "Nueva Asignación";
    $("inp-daily-mp").value = 1;
    $("inp-daily-grupos").value = 0;
    $("inp-daily-historia").value = 0;
    $("inp-daily-muro").value = 0;
    
    const today = new Date().toISOString().split('T')[0];
    $("inp-desde").value = today;
    $("inp-hasta").value = today;
    
    $("modal-asignacion").style.display = "flex";
}

function abrirModalEditar(id, listaDatos) {
    const item = listaDatos.find(i => i.id == id);
    if (!item) return;

    asignacionEditandoID = id;
    if($("modal-titulo")) $("modal-titulo").textContent = "Editar Asignación";
    
    $("sel-usuario").value = item.usuario;
    $("sel-categoria").value = item.categoria;
    $("inp-desde").value = item.fecha_desde;
    $("inp-hasta").value = item.fecha_hasta;
    $("inp-daily-mp").value = item.marketplace_daily || 0;
    $("inp-daily-grupos").value = item.grupos_daily || 0;
    $("inp-daily-historia").value = item.historia_daily || 0;
    $("inp-daily-muro").value = item.muro_daily || 0;

    $("modal-asignacion").style.display = "flex";
}

function cerrarModal() {
    $("modal-asignacion").style.display = "none";
}

// --- GUARDAR ---
async function guardarAsignacion() {
    const payload = {
        usuario: $("sel-usuario").value,
        categoria: $("sel-categoria").value,
        fecha_desde: $("inp-desde").value,
        fecha_hasta: $("inp-hasta").value,
        marketplace_daily: $("inp-daily-mp").value,
        grupos_daily: $("inp-daily-grupos").value,
        historia_daily: $("inp-daily-historia").value,
        muro_daily: $("inp-daily-muro").value
    };

    if (!payload.usuario || !payload.categoria || !payload.fecha_desde || !payload.fecha_hasta) {
        return alert("Completa los campos obligatorios.");
    }

    let error = null;
    if (asignacionEditandoID) {
        const res = await sb.from("usuarios_asignado").update(payload).eq("id", asignacionEditandoID);
        error = res.error;
    } else {
        const res = await sb.from("usuarios_asignado").insert([payload]);
        error = res.error;
    }

    if (error) alert("Error: " + error.message);
    else {
        cerrarModal();
        cargarTabla();
    }
}

async function eliminarAsignacion(id) {
    if(!confirm("¿Borrar asignación?")) return;
    await sb.from("usuarios_asignado").delete().eq("id", id);
    cargarTabla();
}