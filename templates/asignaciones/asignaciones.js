import { requireSession, loadSidebar } from "../../assets/js/app.js";

const s = requireSession();
const sb = window.supabaseClient;
const $ = (id) => document.getElementById(id);

let asignacionEditandoID = null;

// INICIALIZACIÓN DEL MÓDULO
(async function init() {
    try {
        await loadSidebar({ activeKey: "asignaciones", basePath: "../" });

        if (s.rol !== "gerente") {
            document.body.innerHTML = "<h2 style='color:white; text-align:center; margin-top:50px;'>⛔ Acceso Restringido a Gerencia</h2>";
            return;
        }

        await cargarSelects();
        await cargarTabla();

        // Event Listeners
        if($("btn-nuevo")) $("btn-nuevo").onclick = abrirModalCrear;
        if($("btn-cancelar")) $("btn-cancelar").onclick = cerrarModal;
        if($("btn-guardar")) $("btn-guardar").onclick = guardarAsignacion;

    } catch (e) {
        console.error("Error crítico en Asignaciones:", e);
    }
})();

// CARGA DE SELECTORES
async function cargarSelects() {
    const { data: users } = await sb.from("usuarios").select("usuario").neq("rol", "gerente");
    const selUser = $("sel-usuario");
    if (selUser) {
        selUser.innerHTML = "";
        (users || []).forEach(u => {
            selUser.innerHTML += `<option value="${u.usuario}">${u.usuario}</option>`;
        });
    }

    const { data: cats } = await sb.from("categoria").select("nombre");
    const selCat = $("sel-categoria");
    if (selCat) {
        selCat.innerHTML = "";
        (cats || []).forEach(c => {
            selCat.innerHTML += `<option value="${c.nombre}">${c.nombre}</option>`;
        });
    }
}

// RENDERIZADO DE TABLA
async function cargarTabla() {
    const tbody = $("lista-asignaciones");
    if (!tbody) return;
    tbody.innerHTML = "<tr><td colspan='5' style='text-align:center'>⏳ Sincronizando datos...</td></tr>";

    const { data, error } = await sb.from("usuarios_asignado").select("*").order("fecha_desde", { ascending: false });

    if (error || !data) {
        tbody.innerHTML = "<tr><td colspan='5' style='text-align:center; color:#ef4444'>Error al cargar o sin datos.</td></tr>";
        return;
    }

    tbody.innerHTML = "";
    data.forEach(item => {
        const tr = document.createElement("tr");
        tr.style.borderBottom = "1px solid rgba(255,255,255,0.05)";
        tr.innerHTML = `
            <td style="padding:12px; font-weight:bold; color:#f1f5f9;">${item.usuario}</td>
            <td style="padding:12px; color:#60a5fa;">${item.categoria}</td>
            <td style="padding:12px; font-size:0.9rem;">${item.fecha_desde} / ${item.fecha_hasta}</td>
            <td style="padding:12px; font-size:0.85rem; font-family:monospace; color:#94a3b8;">
                MP:${item.marketplace_daily} | GR:${item.grupos_daily} | HIS:${item.historia_daily} | MU:${item.muro_daily}
            </td>
            <td style="padding:12px; text-align:right;">
                <button class="action-btn btn-edit" style="background:#f59e0b; margin-right:5px;" data-obj='${JSON.stringify(item)}'>✏️</button>
                <button class="action-btn btn-del" style="background:#ef4444; color:white;" data-id="${item.id}">🗑️</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Asignar eventos a los botones generados
    document.querySelectorAll(".btn-edit").forEach(btn => {
        btn.onclick = () => abrirModalEditar(JSON.parse(btn.dataset.obj));
    });
    document.querySelectorAll(".btn-del").forEach(btn => {
        btn.onclick = () => eliminarAsignacion(btn.dataset.id);
    });
}

// LÓGICA DE MODAL
function abrirModalCrear() {
    asignacionEditandoID = null;
    $("modal-titulo").textContent = "Nueva Asignación";
    $("sel-usuario").disabled = false; // Permitir cambiar usuario al crear
    $("sel-categoria").disabled = false; // Permitir cambiar categoría al crear
    
    // Valores por defecto
    const today = new Date().toISOString().split('T')[0];
    $("inp-desde").value = today;
    $("inp-hasta").value = today;
    $("inp-daily-mp").value = 1;
    $("inp-daily-grupos").value = 0;
    $("inp-daily-historia").value = 0;
    $("inp-daily-muro").value = 0;

    $("modal-asignacion").style.display = "flex";
}

function abrirModalEditar(item) {
    asignacionEditandoID = item.id;
    $("modal-titulo").textContent = "Editar Asignación";
    
    // Bloqueamos usuario y categoria al editar para evitar confusiones, o se pueden dejar libres
    $("sel-usuario").value = item.usuario;
    $("sel-categoria").value = item.categoria;
    
    $("inp-desde").value = item.fecha_desde;
    $("inp-hasta").value = item.fecha_hasta;
    $("inp-daily-mp").value = item.marketplace_daily;
    $("inp-daily-grupos").value = item.grupos_daily;
    $("inp-daily-historia").value = item.historia_daily;
    $("inp-daily-muro").value = item.muro_daily;

    $("modal-asignacion").style.display = "flex";
}

function cerrarModal() {
    $("modal-asignacion").style.display = "none";
}

// --- LÓGICA CORE CORREGIDA ---
async function guardarAsignacion() {
    const usuario = $("sel-usuario").value;
    const categoria = $("sel-categoria").value;

    const payload = {
        usuario: usuario,
        categoria: categoria,
        fecha_desde: $("inp-desde").value,
        fecha_hasta: $("inp-hasta").value,
        marketplace_daily: parseInt($("inp-daily-mp").value) || 0,
        grupos_daily: parseInt($("inp-daily-grupos").value) || 0,
        historia_daily: parseInt($("inp-daily-historia").value) || 0,
        muro_daily: parseInt($("inp-daily-muro").value) || 0
    };

    if (!usuario || !categoria) return alert("Faltan datos obligatorios");

    // 1. DETECCIÓN DE DUPLICADOS (SI ES NUEVO)
    if (!asignacionEditandoID) {
        // Verificar si ya existe una asignación para este usuario y categoría
        const { data: existente } = await sb.from("usuarios_asignado")
            .select("id")
            .eq("usuario", usuario)
            .eq("categoria", categoria)
            .maybeSingle();

        if (existente) {
            // ¡YA EXISTE! Pasamos a modo edición automáticamente
            const confirmar = confirm(`⚠️ ${usuario} ya tiene asignada la categoría ${categoria}. \n¿Querés ACTUALIZAR la asignación existente en lugar de crear una nueva?`);
            if (confirmar) {
                asignacionEditandoID = existente.id; // Switch a modo update
            } else {
                return; // Cancelar operación
            }
        }
    }

    let error = null;

    // 2. GUARDADO (UPDATE O INSERT)
    if (asignacionEditandoID) {
        // Actualizar registro existente (por ID)
        const { error: err } = await sb.from("usuarios_asignado").update(payload).eq("id", asignacionEditandoID);
        error = err;
    } else {
        // Insertar nuevo
        const { error: err } = await sb.from("usuarios_asignado").insert([payload]);
        error = err;
    }

    if (error) {
        alert("Error al guardar: " + error.message);
    } else {
        cerrarModal();
        await cargarTabla();
        // Feedback visual
        const btn = $("btn-guardar");
        const originalText = btn.textContent;
        btn.textContent = "✅ Guardado!";
        setTimeout(() => btn.textContent = originalText, 1000);
    }
}

async function eliminarAsignacion(id) {
    if (confirm("¿Borrar asignación?")) {
        await sb.from("usuarios_asignado").delete().eq("id", id);
        await cargarTabla();
    }
}