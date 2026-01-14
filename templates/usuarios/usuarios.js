import { requireSession, loadSidebar } from "../../assets/js/app.js";

const s = requireSession();
const sb = window.supabaseClient;
const $ = (id) => document.getElementById(id);

let usuarioEditandoID = null;
let nombreOriginalEditando = null;

// Inicialización de la página
(async function init() {
    await loadSidebar({ activeKey: "usuarios", basePath: "../" });
    cargarUsuarios();
})();

// --- 1. CARGAR EQUIPO CON CONTRASEÑAS VISIBLES ---
async function cargarUsuarios() {
    if (s.rol !== "gerente") {
        document.body.innerHTML = "<h2 style='color:white; text-align:center; margin-top:50px;'>⛔ Acceso Restringido a Gerentes</h2>";
        return;
    }

    const { data, error } = await sb.from("usuarios").select("*").order("usuario");
    if (error) return alert("Error cargando equipo: " + error.message);

    const lista = $("lista-usuarios");
    lista.innerHTML = "";

    data.forEach(u => {
        const tr = document.createElement("tr");
        tr.style.borderBottom = "1px solid rgba(255,255,255,0.05)";
        
        // Uso de la variable 'contra' para mostrar la contraseña
        let passwordReal = u.contra || `<span style='color:#ef4444;'>Sin clave</span>`;
        const badgeColor = u.rol === "gerente" ? "#ef4444" : "#10b981";
        
        tr.innerHTML = `
            <td style="padding:15px; font-weight:bold; color:#f1f5f9;">${u.usuario}</td>
            <td style="padding:15px; font-family:monospace; color:#60a5fa; font-size:0.95rem;">${passwordReal}</td>
            <td style="padding:15px;">
                <span class="pill" style="background:${badgeColor}; color:white; font-weight:bold;">${u.rol.toUpperCase()}</span>
            </td>
            <td style="padding:15px; text-align:right;">
                <button class="action-btn btn-edit" data-id="${u.id}">✏️ Editar</button>
                <button class="action-btn btn-del" data-id="${u.id}" data-user="${u.usuario}">🗑️</button>
            </td>
        `;
        lista.appendChild(tr);
    });

    // Vinculación de eventos a botones dinámicos
    document.querySelectorAll(".btn-edit").forEach(btn => btn.onclick = () => abrirModalEditar(btn.dataset.id, data));
    document.querySelectorAll(".btn-del").forEach(btn => btn.onclick = () => eliminarUsuarioProfundo(btn.dataset.id, btn.dataset.user));
}

// --- 2. GESTIÓN DE MODALES ---
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
    $("inp-contra").value = user.contra || ""; // Carga la variable 'contra'
    $("sel-rol").value = user.rol || "operador";
    $("modal-usuario").style.display = "flex";
}

function cerrarModal() {
    $("modal-usuario").style.display = "none";
}

// --- 3. GUARDAR (INSERT O UPDATE CON VÍNCULOS) ---
async function guardarUsuario() {
    const usuarioNuevo = $("inp-usuario").value.trim();
    const contra = $("inp-contra").value.trim();
    const rol = $("sel-rol").value;

    if (!usuarioNuevo || !contra) return alert("⚠️ Debes completar Nombre y Contraseña.");

    try {
        // Si editamos y el nombre cambió, actualizamos los vínculos antes para evitar errores FK
        if (usuarioEditandoID && usuarioNuevo !== nombreOriginalEditando) {
            // Actualiza el nombre en las cuentas asignadas
            await sb.from("cuentas_facebook").update({ ocupada_por: usuarioNuevo }).eq("ocupada_por", nombreOriginalEditando);
            // Actualiza el nombre en las asignaciones diarias
            await sb.from("usuarios_asignado").update({ usuario: usuarioNuevo }).eq("usuario", nombreOriginalEditando);
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
        alert("Error al guardar: " + e.message);
    }
}

// --- 4. ELIMINACIÓN CON LIMPIEZA PROFUNDA ---
// Borra todo el rastro del usuario para evitar el error de Foreign Key
async function eliminarUsuarioProfundo(id, usuarioNombre) {
    const msg = `⚠️ ¿BORRAR A ${usuarioNombre.toUpperCase()}?\nSe liberarán sus cuentas y se borrará su historial de tareas para que la DB no bloquee la acción.`;
    if (!confirm(msg)) return;

    try {
        // Limpiamos vínculos en orden para que Supabase nos deje borrar
        await sb.from("cuentas_facebook").update({ ocupada_por: null, estado: 'disponible' }).eq("ocupada_por", usuarioNombre);
        await sb.from("usuarios_actividad").delete().eq("usuario", usuarioNombre);
        await sb.from("usuarios_asignado").delete().eq("usuario", usuarioNombre);
        await sb.from("marketplace_actividad").delete().eq("usuario", usuarioNombre);
        await sb.from("calentamiento_actividad").delete().eq("usuario", usuarioNombre);

        // Borrado final del usuario
        const { error } = await sb.from("usuarios").delete().eq("id", id);
        if (error) throw error;

        alert("Usuario y registros eliminados correctamente.");
        cargarUsuarios();
    } catch (e) {
        alert("Error al eliminar: " + e.message);
    }
}

// Eventos de botones
if($("btn-nuevo")) $("btn-nuevo").onclick = abrirModalCrear;
if($("btn-cancelar")) $("btn-cancelar").onclick = cerrarModal;
if($("btn-guardar")) $("btn-guardar").onclick = guardarUsuario;