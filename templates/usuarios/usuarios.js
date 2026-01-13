import { requireSession, loadSidebar } from "../../assets/js/app.js";

const s = requireSession();
const sb = window.supabaseClient;
const $ = (id) => document.getElementById(id);

let usuarioEditandoID = null;

// Inicialización
(async function init() {
    await loadSidebar({ activeKey: "usuarios", basePath: "../" });
    cargarUsuarios();
})();

// --- CARGAR USUARIOS DESDE SUPABASE ---
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
        
        // CORRECCIÓN DEFINITIVA: Usamos la columna 'contra'
        let passwordReal = u.contra;
        
        // Si 'contra' está vacío, mostramos ayuda visual para el gerente
        if (!passwordReal) {
            passwordReal = `<span style='color:#fbbf24; font-size:0.75rem'>Falta columna 'contra' en DB</span>`;
        }

        const badgeColor = u.rol === "gerente" ? "#ef4444" : "#10b981";
        
        tr.innerHTML = `
            <td style="padding:15px; font-weight:bold; color:#f1f5f9;">${u.usuario}</td>
            <td style="padding:15px; font-family:monospace; color:#60a5fa; font-size:0.95rem;">${passwordReal}</td>
            <td style="padding:15px;">
                <span class="pill" style="background:${badgeColor}; color:white; font-weight:bold;">${u.rol.toUpperCase()}</span>
            </td>
            <td style="padding:15px; text-align:right;">
                <button class="action-btn btn-edit" data-id="${u.id}">✏️ Editar</button>
                <button class="action-btn btn-del" data-id="${u.id}">🗑️</button>
            </td>
        `;
        lista.appendChild(tr);
    });

    // Re-vincular eventos a los nuevos botones
    document.querySelectorAll(".btn-edit").forEach(btn => btn.onclick = () => abrirModalEditar(btn.dataset.id, data));
    document.querySelectorAll(".btn-del").forEach(btn => btn.onclick = () => eliminarUsuario(btn.dataset.id));
}

// --- LÓGICA DEL MODAL ---
function abrirModalCrear() {
    usuarioEditandoID = null;
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
    $("modal-titulo").textContent = "Editar Usuario";
    $("inp-usuario").value = user.usuario || "";
    $("inp-contra").value = user.contra || ""; // Carga la contraseña actual en el input
    $("sel-rol").value = user.rol || "operador";
    $("modal-usuario").style.display = "flex";
}

function cerrarModal() {
    $("modal-usuario").style.display = "none";
}

// --- GUARDAR (INSERT O UPDATE) ---
async function guardarUsuario() {
    const usuario = $("inp-usuario").value.trim();
    const contra = $("inp-contra").value.trim();
    const rol = $("sel-rol").value;

    if (!usuario || !contra) return alert("⚠️ Debes completar Nombre y Contraseña.");

    const payload = { usuario, contra, rol }; 

    let res;
    if (usuarioEditandoID) {
        res = await sb.from("usuarios").update(payload).eq("id", usuarioEditandoID);
    } else {
        res = await sb.from("usuarios").insert([payload]);
    }

    if (res.error) {
        alert("Error al guardar: " + res.error.message);
    } else {
        cerrarModal();
        cargarUsuarios(); 
    }
}

async function eliminarUsuario(id) {
    if (!confirm("¿Estás seguro de eliminar a este usuario? Se perderán sus accesos.")) return;
    const { error } = await sb.from("usuarios").delete().eq("id", id);
    if (error) alert("Error al eliminar: " + error.message);
    else cargarUsuarios();
}

// Eventos de botones principales
if($("btn-nuevo")) $("btn-nuevo").onclick = abrirModalCrear;
if($("btn-cancelar")) $("btn-cancelar").onclick = cerrarModal;
if($("btn-guardar")) $("btn-guardar").onclick = guardarUsuario;