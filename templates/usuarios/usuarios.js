import { requireSession, loadSidebar } from "../../assets/js/app.js";

const s = requireSession();
const sb = window.supabaseClient;
const $ = (id) => document.getElementById(id);

let usuarioEditandoID = null;

await loadSidebar({ activeKey: "usuarios", basePath: "../" });

// --- CARGAR USUARIOS ---
async function cargarUsuarios() {
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
        
        // CORRECCIÓN: Busca el nombre real de la columna de contraseña
        const passwordReal = u.pass || u.password || u.contrasenia || "---";
        const badgeColor = u.rol === "gerente" ? "#ef4444" : "#10b981";
        
        tr.innerHTML = `
            <td style="padding:12px; font-weight:bold;">${u.usuario}</td>
            <td style="padding:12px; font-family:monospace; color:#94a3b8;">${passwordReal}</td>
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

    // Asignar eventos
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
    
    // Recuperar la contraseña para mostrarla en el input
    const passwordReal = user.pass || user.password || user.contrasenia || "";

    usuarioEditandoID = id;
    $("modal-titulo").textContent = "Editar Usuario";
    $("inp-usuario").value = user.usuario;
    $("inp-pass").value = passwordReal; 
    $("sel-rol").value = user.rol;
    $("modal-usuario").style.display = "flex";
}

function cerrarModal() {
    $("modal-usuario").style.display = "none";
}

async function guardarUsuario() {
    const usuario = $("inp-usuario").value.trim();
    const pass = $("inp-pass").value.trim();
    const rol = $("sel-rol").value;

    if (!usuario || !pass) return alert("Completa todos los datos");

    // NOTA: Si al guardar te da error, cambia 'pass' por 'password' aquí abajo:
    const payload = { usuario, pass, rol }; 

    let error = null;
    if (usuarioEditandoID) {
        const res = await sb.from("usuarios").update(payload).eq("id", usuarioEditandoID);
        error = res.error;
    } else {
        const res = await sb.from("usuarios").insert([payload]);
        error = res.error;
    }

    if (error) {
        alert("Error al guardar: " + error.message);
    } else {
        cerrarModal();
        cargarUsuarios(); 
    }
}

async function eliminarUsuario(id) {
    if (!confirm("¿Eliminar usuario?")) return;
    const { error } = await sb.from("usuarios").delete().eq("id", id);
    if (error) alert("Error: " + error.message);
    else cargarUsuarios();
}

// Eventos
if($("btn-nuevo")) $("btn-nuevo").onclick = abrirModalCrear;
if($("btn-cancelar")) $("btn-cancelar").onclick = cerrarModal;
if($("btn-guardar")) $("btn-guardar").onclick = guardarUsuario;

cargarUsuarios();