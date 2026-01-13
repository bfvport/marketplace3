import { requireSession, loadSidebar } from "../../assets/js/app.js";

const s = requireSession();
const sb = window.supabaseClient;
const $ = (id) => document.getElementById(id);

let asignacionEditandoID = null;

// INICIALIZACIÓN DEL MÓDULO
(async function init() {
    try {
        // Carga el sidebar con la llave en plural para que se marque en el menú
        await loadSidebar({ activeKey: "asignaciones", basePath: "../" });

        if (s.rol !== "gerente") {
            document.body.innerHTML = "<h2 style='color:white; text-align:center; margin-top:50px;'>⛔ Acceso Restringido a Gerencia</h2>";
            return;
        }

        await cargarSelects();
        await cargarTabla();

        // Registro de eventos para botones estáticos
        if($("btn-nuevo")) $("btn-nuevo").onclick = abrirModalCrear;
        if($("btn-cancelar")) $("btn-cancelar").onclick = cerrarModal;
        if($("btn-guardar")) $("btn-guardar").onclick = guardarAsignacion;

    } catch (e) {
        console.error("Error crítico en Asignaciones:", e);
    }
})();

// CARGA DE SELECTORES (USUARIOS Y CATEGORÍAS)
async function cargarSelects() {
    // Solo operadores para asignar tareas
    const { data: users } = await sb.from("usuarios").select("usuario").neq("rol", "gerente");
    const selUser = $("sel-usuario");
    if (selUser) {
        selUser.innerHTML = "";
        (users || []).forEach(u => {
            selUser.innerHTML += `<option value="${u.usuario}">${u.usuario}</option>`;
        });
    }

    // Categorías disponibles
    const { data: cats } = await sb.from("categoria").select("nombre");
    const selCat = $("sel-categoria");
    if (selCat) {
        selCat.innerHTML = "";
        (cats || []).forEach(c => {
            selCat.innerHTML += `<option value="${c.nombre}">${c.nombre}</option>`;
        });
    }
}

// RENDERIZADO DE LA TABLA PRINCIPAL
async function cargarTabla() {
    const tbody = $("lista-asignaciones");
    if (!tbody) return;
    
    tbody.innerHTML = "<tr><td colspan='5' style='text-align:center'>⏳ Sincronizando datos...</td></tr>";

    const { data, error } = await sb.from("usuarios_asignado").select("*").order("fecha_desde", { ascending: false });
    
    if (error) {
        tbody.innerHTML = `<tr><td colspan="5" style="color:#ef4444">Error: ${error.message}</td></tr>`;
        return;
    }

    if (!data || data.length === 0) {
        tbody.innerHTML = "<tr><td colspan='5' style='text-align:center; color:#94a3b8'>No hay asignaciones registradas hoy.</td></tr>";
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
                ${item.fecha_desde} <span class="muted">/</span> ${item.fecha_hasta}
            </td>
            <td style="padding:12px; font-size:0.85rem; font-family:monospace; color:#94a3b8;">
                MP:${item.marketplace_daily} | GR:${item.grupos_daily} | ST:${item.historia_daily} | WL:${item.muro_daily}
            </td>
            <td style="padding:12px; text-align:right;">
                <button class="action-btn btn-edit" data-id="${item.id}">✏️</button>
                <button class="action-btn btn-del" data-id="${item.id}">🗑️</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Delegación de eventos para botones dinámicos
    document.querySelectorAll(".btn-edit").forEach(btn => {
        btn.onclick = () => abrirModalEditar(btn.dataset.id, data);
    });
    document.querySelectorAll(".btn-del").forEach(btn => {
        btn.onclick = () => eliminarAsignacion(btn.dataset.id);
    });
}

// LÓGICA DE VENTANA EMERGENTE (MODAL)
function abrirModalCrear() {
    asignacionEditandoID = null;
    $("modal-titulo").textContent = "Nueva Asignación";
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
    $("modal-titulo").textContent = "Editar Asignación";
    
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

// PERSISTENCIA EN SUPABASE (INSERT / UPDATE)
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
        return alert("Error: Todos los campos de identificación y fecha son obligatorios.");
    }

    let error = null;
    if (asignacionEditandoID) {
        // Actualizar registro existente
        const res = await sb.from("usuarios_asignado").update(payload).eq("id", asignacionEditandoID);
        error = res.error;
    } else {
        // Crear nuevo registro
        const res = await sb.from("usuarios_asignado").insert([payload]);
        error = res.error;
    }

    if (error) {
        alert("Error de base de datos: " + error.message);
    } else {
        cerrarModal();
        await cargarTabla();
    }
}

async function eliminarAsignacion(id) {
    if(!confirm("¿Está seguro de eliminar esta asignación? Esta acción no se puede deshacer.")) return;
    const { error } = await sb.from("usuarios_asignado").delete().eq("id", id);
    if (error) alert("Error al eliminar: " + error.message);
    else await cargarTabla();
}