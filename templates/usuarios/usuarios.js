import { requireSession, loadSidebar } from "../../assets/js/app.js";

const s = requireSession();
const sb = window.supabaseClient;
const $ = (id) => document.getElementById(id);

let usuarioEditandoID = null; // Si es null, estamos creando. Si tiene ID, editamos.

await loadSidebar({ activeKey: "usuarios", basePath: "../" });

// --- CARGAR USUARIOS ---
async function cargarUsuarios() {
    // Solo Gerente
    if (s.rol !== "gerente") {
        document.body.innerHTML = "<h2 style='color:white; text-align:center;'>⛔ Solo Gerentes</h2>";
        return;
    }

    const { data, error } = await sb.from("usuarios").select("*").order("usuario");
    if (error) return alert("Error cargando: " + error.message);

    const lista = $("lista-usuarios");
    lista.innerHTML = "";

    data.forEach(u => {
        const tr = document.createElement("tr");
        tr.style.borderBottom = "1px solid rgba(255,255,255,0.05)";
        
        // Determinar estilo del rol
        const badgeColor = u.rol === "gerente" ? "#ef4444" : "#10b981";
        
        tr.innerHTML = `
            <td style="padding:12px; font-weight:bold;">${u.usuario}</td>
            <td style="padding:12px; font-family:monospace; color:#94a3b8;">${u.pass}</td>
            <td style="padding:12px;">
                <span class="pill" style="background:${badgeColor}; font-size:0.75rem;">${u.rol.toUpperCase()}</span>
            </td>
            <td style="padding:12px; text-align:right;">
                <button class="action-btn btn-edit" data-id="${u.id}">✏️ Editar</button>
                <button class="action-btn btn-del" data-id="${u.id}">🗑️</button>
            </td>
        `;
        lista.appendChild(tr);
    });

    // Asignar eventos a los botones generados
    document.querySelectorAll(".btn-edit").forEach(btn => {
        btn.onclick = () => abrirModalEditar(btn.dataset.id, data);
    });
    document.querySelectorAll(".btn-del").forEach(btn => {
        btn.onclick = () => eliminarUsuario(btn.dataset.id);
    });
}

// --- MODAL Y FORMULARIO ---
function abrirModalCrear() {
    usuarioEditandoID = null;
    $("modal-titulo").textContent = "Nuevo Usuario";
    $("inp-usuario").value = "";
    $("inp-pass").value = "";
    $("sel-rol").value = "operador";
    $("modal-usuario").style.display = "flex";
}

function abrirModalEditar(id, listaDatos) {
    const user = listaDatos.find(u => u.id == id);
    if (!user) return;

    usuarioEditandoID = id;
    $("modal-titulo").textContent = "Editar Usuario";
    $("inp-usuario").value = user.usuario;
    $("inp-pass").value = user.pass; // Mostramos la pass actual
    $("sel-rol").value = user.rol;
    $("modal-usuario").style.display = "flex";
}

function cerrarModal() {
    $("modal-usuario").style.display = "none";
}

// --- GUARDAR (Crear o Editar) ---
async function guardarUsuario() {
    const usuario = $("inp-usuario").value.trim();
    const pass = $("inp-pass").value.trim();
    const rol = $("sel-rol").value;

    if (!usuario || !pass) return alert("Completa todos los datos");

    const payload = { usuario, pass, rol };

    let error = null;

    if (usuarioEditandoID) {
        // MODO EDICIÓN
        const res = await sb.from("usuarios").update(payload).eq("id", usuarioEditandoID);
        error = res.error;
    } else {
        // MODO CREACIÓN
        const res = await sb.from("usuarios").insert([payload]);
        error = res.error;
    }

    if (error) {
        alert("Error al guardar: " + error.message);
    } else {
        cerrarModal();
        cargarUsuarios(); // Refrescar tabla
    }
}

// --- ELIMINAR ---
async function eliminarUsuario(id) {
    if (!confirm("¿Seguro que querés eliminar a este usuario? Se perderá su historial.")) return;

    const { error } = await sb.from("usuarios").delete().eq("id", id);
    if (error) alert("Error: " + error.message);
    else cargarUsuarios();
}

// --- INICIALIZACIÓN ---
$("btn-nuevo").onclick = abrirModalCrear;
$("btn-cancelar").onclick = cerrarModal;
$("btn-guardar").onclick = guardarUsuario;

cargarUsuarios();