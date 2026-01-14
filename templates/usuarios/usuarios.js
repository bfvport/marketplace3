import { requireSession, loadSidebar } from "../../assets/js/app.js";

const s = requireSession();
const sb = window.supabaseClient;
const $ = (id) => document.getElementById(id);

let usuarioEditandoID = null;
let nombreOriginalEditando = null;

// Inicialización
(async function init() {
    await loadSidebar({ activeKey: "usuarios", basePath: "../" });
    cargarUsuarios();
})();

// --- 1. CARGAR LISTADO ---
async function cargarUsuarios() {
    if (s.rol !== "gerente") {
        document.body.innerHTML = "<h2 style='color:white; text-align:center; margin-top:50px;'>⛔ Acceso Restringido</h2>";
        return;
    }

    const { data, error } = await sb.from("usuarios").select("*").order("usuario");
    if (error) return alert("Error: " + error.message);

    const lista = $("lista-usuarios");
    lista.innerHTML = "";

    data.forEach(u => {
        const tr = document.createElement("tr");
        tr.style.borderBottom = "1px solid rgba(255,255,255,0.05)";
        
        // Usamos la variable 'contra'
        const passwordReal = u.contra || "Sin clave";
        const badgeColor = u.rol === "gerente" ? "#ef4444" : "#10b981";
        
        tr.innerHTML = `
            <td style="padding:15px; font-weight:bold; color:#f1f5f9;">${u.usuario}</td>
            <td style="padding:15px; font-family:monospace; color:#60a5fa;">${passwordReal}</td>
            <td style="padding:15px;">
                <span class="pill" style="background:${badgeColor}; color:white;">${u.rol.toUpperCase()}</span>
            </td>
            <td style="padding:15px; text-align:right;">
                <button class="action-btn btn-edit" data-id="${u.id}">✏️ Editar</button>
                <button class="action-btn btn-del" data-id="${u.id}" data-user="${u.usuario}">🗑️</button>
            </td>
        `;
        lista.appendChild(tr);
    });

    document.querySelectorAll(".btn-edit").forEach(btn => btn.onclick = () => abrirModalEditar(btn.dataset.id, data));
    document.querySelectorAll(".btn-del").forEach(btn => btn.onclick = () => eliminarUsuarioProfundo(btn.dataset.id, btn.dataset.user));
}

// --- 2. MODALES ---
function abrirModalCrear() {
    usuarioEditandoID = null;
    nombreOriginalEditando = null;
    $("modal-titulo").textContent = "Nuevo Usuario";
    $("inp-usuario").value = "";
    $("inp-contra").value = "";
    $("sel-rol").value = "operador";
    $("modal-usuario").style.display = "flex";
}

function abrirModalEditar(id, listaDatos) {
    const user = listaDatos.find(u => u.id == id);
    if (!user) return;
    usuarioEditandoID = id;
    nombreOriginalEditando = user.usuario;
    $("modal-titulo").textContent = "Editar Usuario";
    $("inp-usuario").value = user.usuario || "";
    $("inp-contra").value = user.contra || "";
    $("sel-rol").value = user.rol || "operador";
    $("modal-usuario").style.display = "flex";
}

function cerrarModal() { $("modal-usuario").style.display = "none"; }

// --- 3. GUARDAR (CON LIMPIEZA DE VÍNCULOS) ---
async function guardarUsuario() {
    const usuarioNuevo = $("inp-usuario").value.trim();
    const contra = $("inp-contra").value.trim();
    const rol = $("sel-rol").value;

    if (!usuarioNuevo || !contra) return alert("⚠️ Completa usuario y contra.");

    try {
        // LIMPIEZA DE VÍNCULOS: Si el nombre cambió, actualizamos TODAS las tablas relacionadas
        // Esto evita los errores de "foreign key constraint"
        if (usuarioEditandoID && usuarioNuevo !== nombreOriginalEditando) {
            console.log("Actualizando vínculos de tablas relacionadas...");
            await sb.from("cuentas_facebook").update({ ocupada_por: usuarioNuevo }).eq("ocupada_por", nombreOriginalEditando);
            await sb.from("usuarios_asignado").update({ usuario: usuarioNuevo }).eq("usuario", nombreOriginalEditando);
            await sb.from("marketplace_actividad").update({ usuario: usuarioNuevo }).eq("usuario", nombreOriginalEditando);
            await sb.from("calentamiento_actividad").update({ usuario: usuarioNuevo }).eq("usuario", nombreOriginalEditando);
            await sb.from("usuarios_actividad").update({ usuario: usuarioNuevo }).eq("usuario", nombreOriginalEditando);
        }

        const payload = { usuario: usuarioNuevo, contra, rol }; 

        if (usuarioEditandoID) {
            const { error } = await sb.from("usuarios").update(payload).eq("id", usuarioEditandoID);
            if (error) throw error;
        } else {
            const { error } = await sb.from("usuarios").insert([payload]);
            if (error) throw error;
        }

        cerrarModal();
        cargarUsuarios(); 
    } catch (e) {
        alert("Error crítico: " + e.message);
    }
}

// --- 4. ELIMINAR (CON LIMPIEZA TOTAL) ---
// Esta función barre con todo el historial para permitir el borrado
async function eliminarUsuarioProfundo(id, usuarioNombre) {
    if (!confirm(`⚠️ ¿ELIMINAR A ${usuarioNombre.toUpperCase()}?\nSe borrará todo su historial de tareas y se liberarán sus cuentas.`)) return;

    try {
        // Borramos rastro en todas las tablas con Foreign Keys
        await sb.from("cuentas_facebook").update({ ocupada_por: null, estado: 'disponible' }).eq("ocupada_por", usuarioNombre);
        await sb.from("usuarios_asignado").delete().eq("usuario", usuarioNombre);
        await sb.from("marketplace_actividad").delete().eq("usuario", usuarioNombre);
        await sb.from("calentamiento_actividad").delete().eq("usuario", usuarioNombre);
        await sb.from("usuarios_actividad").delete().eq("usuario", usuarioNombre);

        // Finalmente borramos el perfil
        const { error } = await sb.from("usuarios").delete().eq("id", id);
        if (error) throw error;

        alert("Usuario eliminado correctamente.");
        cargarUsuarios();
    } catch (e) {
        alert("No se pudo eliminar: " + e.message);
    }
}

// Eventos
if($("btn-nuevo")) $("btn-nuevo").onclick = abrirModalCrear;
if($("btn-cancelar")) $("btn-cancelar").onclick = cerrarModal;
if($("btn-guardar")) $("btn-guardar").onclick = guardarUsuario;