import { requireSession, loadSidebar } from "../../assets/js/app.js";

const s = requireSession();
const sb = window.supabaseClient;
const $ = (id) => document.getElementById(id);

let editID = null;
let oldName = null;

(async function init() {
    await loadSidebar({ activeKey: "usuarios", basePath: "../" });
    fetchUsers();

    if($("btn-nuevo")) $("btn-nuevo").onclick = () => openModal();
    if($("btn-cancelar")) $("btn-cancelar").onclick = closeModal;
    if($("btn-guardar")) $("btn-guardar").onclick = saveUser;
})();

async function fetchUsers() {
    if (s.rol !== "gerente") return;

    const { data, error } = await sb.from("usuarios").select("*").order("usuario");
    if (error) return console.error(error);

    const tbody = $("lista-usuarios");
    tbody.innerHTML = "";

    data.forEach(u => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td style="font-weight:bold; color:white;">${u.usuario}</td>
            <td style="font-family:monospace; color:#60a5fa;">${u.contra || '---'}</td>
            <td><span style="background:${u.rol === 'gerente' ? '#ef4444':'#10b981'}; color:white; padding:4px 8px; border-radius:4px; font-size:0.8rem; font-weight:bold;">${u.rol.toUpperCase()}</span></td>
            <td style="text-align:right;">
                <button class="action-btn btn-edit" id="edit-${u.id}">✏️</button>
                <button class="action-btn btn-del" id="del-${u.id}">🗑️</button>
            </td>
        `;
        tbody.appendChild(tr);

        $(`edit-${u.id}`).onclick = () => {
            editID = u.id;
            oldName = u.usuario;
            $("modal-titulo").innerText = "Editar Usuario";
            $("inp-usuario").value = u.usuario;
            $("inp-contra").value = u.contra;
            $("sel-rol").value = u.rol;
            $("modal-usuario").style.display = "flex";
        };

        $(`del-${u.id}`).onclick = async () => {
            if (!confirm(`¿Eliminar a ${u.usuario}?`)) return;
            
            // LIMPIEZA DE VÍNCULOS
            await sb.from("cuentas_facebook").update({ ocupada_por: null }).eq("ocupada_por", u.usuario);
            await sb.from("usuarios_asignado").delete().eq("usuario", u.usuario);
            await sb.from("marketplace_actividad").delete().eq("usuario", u.usuario);
            await sb.from("usuarios_actividad").delete().eq("usuario", u.usuario);

            const { error: delErr } = await sb.from("usuarios").delete().eq("id", u.id);
            if (delErr) alert("Error: " + delErr.message);
            else fetchUsers();
        };
    });
}

function openModal() {
    editID = null;
    oldName = null;
    $("modal-titulo").innerText = "Nuevo Usuario";
    $("inp-usuario").value = "";
    $("inp-contra").value = "";
    $("sel-rol").value = "operador";
    $("modal-usuario").style.display = "flex";
}

function closeModal() { $("modal-usuario").style.display = "none"; }

async function saveUser() {
    const usuario = $("inp-usuario").value.trim();
    const contra = $("inp-contra").value.trim();
    const rol = $("sel-rol").value;

    if (!usuario || !contra) return alert("Completa los datos.");

    try {
        if (editID) {
            // ACTUALIZACIÓN DE VÍNCULOS EN OTRAS TABLAS
            if (usuario !== oldName) {
                await sb.from("cuentas_facebook").update({ ocupada_por: usuario }).eq("ocupada_por", oldName);
                await sb.from("usuarios_asignado").update({ usuario: usuario }).eq("usuario", oldName);
                await sb.from("marketplace_actividad").update({ usuario: usuario }).eq("usuario", oldName);
                await sb.from("usuarios_actividad").update({ usuario: usuario }).eq("usuario", oldName);
            }
            await sb.from("usuarios").update({ usuario, contra, rol }).eq("id", editID);
        } else {
            await sb.from("usuarios").insert([{ usuario, contra, rol }]);
        }
        closeModal();
        fetchUsers();
    } catch (err) {
        alert("Error: " + err.message);
    }
}