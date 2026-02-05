import { requireSession, loadSidebar } from "../../assets/js/app.js";

const s = requireSession();
const sb = window.supabaseClient;
const $ = (id) => document.getElementById(id);

let editID = null;

// 1) Inicializa la vista: sidebar, eventos y carga inicial de usuarios.
// 2) Es el “arranque” del módulo Usuarios.
(async function init() {
  await loadSidebar({ activeKey: "usuarios", basePath: "../" });

  bindModalButtons();
  bindTableEvents();

  await fetchUsers();
})();

// =========================
// EVENTOS GENERALES
// =========================

function bindModalButtons() {
  // 1) Abre el modal en modo “nuevo usuario”.
  // 2) Cancela edición y cierra el modal.
  $("btn-nuevo")?.addEventListener("click", () => openModal());
  $("btn-cancelar")?.addEventListener("click", closeModal);
  $("btn-guardar")?.addEventListener("click", saveUser);
}

function bindTableEvents() {
  const tbody = $("lista-usuarios");
  if (!tbody || tbody.dataset.bound === "1") return;
  tbody.dataset.bound = "1";

  // 1) Delegación de eventos: captura clicks de editar y borrar.
  // 2) Evita errores cuando la tabla se vuelve a generar.
  tbody.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn?.id) return;

    if (btn.id.startsWith("edit-")) {
      const id = Number(btn.id.replace("edit-", ""));
      await openEditById(id);
    }

    if (btn.id.startsWith("del-")) {
      const id = Number(btn.id.replace("del-", ""));
      await deleteUserById(id);
    }
  });
}

// =========================
// CARGA Y DIBUJO
// =========================

// 1) Trae los usuarios desde Supabase.
// 2) Dibuja la tabla completa otra vez.
async function fetchUsers() {
  if (s?.rol !== "gerente") return;

  const { data, error } = await sb.from("usuarios").select("*").order("usuario");
  if (error) {
    console.error(error);
    alert("Error cargando usuarios: " + error.message);
    return;
  }

  const tbody = $("lista-usuarios");
  tbody.innerHTML = "";

  data.forEach((u) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="font-weight:bold; color:white;">${escapeHtml(u.usuario)}</td>
      <td style="font-family:monospace; color:#60a5fa;">${escapeHtml(u.contra || "---")}</td>
      <td>
        <span style="background:${u.rol === "gerente" ? "#ef4444" : "#10b981"}; color:white; padding:6px 12px; border-radius:999px; font-size:0.8rem; font-weight:bold;">
          ${escapeHtml((u.rol || "").toUpperCase())}
        </span>
      </td>
      <td style="text-align:right;">
        <button class="action-btn btn-edit" id="edit-${u.id}">✏️</button>
        <button class="action-btn btn-del" id="del-${u.id}">🗑️</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// =========================
// MODAL
// =========================

// 1) Abre el modal en modo nuevo o edición.
// 2) Carga los valores si se edita un usuario.
function openModal(user = null) {
  editID = user?.id ?? null;

  $("modal-titulo").innerText = editID ? "Editar Usuario" : "Nuevo Usuario";
  $("inp-usuario").value = user?.usuario ?? "";
  $("inp-contra").value = user?.contra ?? "";
  $("sel-rol").value = user?.rol ?? "operador";

  $("modal-usuario").style.display = "flex";
}

function closeModal() {
  // 1) Cierra el modal y limpia el estado.
  // 2) Evita que queden datos viejos cargados.
  editID = null;
  $("modal-usuario").style.display = "none";
}

// =========================
// CRUD
// =========================

// 1) Carga un usuario por ID y abre el modal.
// 2) Si falla, muestra error real.
async function openEditById(id) {
  const { data, error } = await sb.from("usuarios").select("*").eq("id", id).single();
  if (error) {
    console.error(error);
    alert("Error cargando usuario: " + error.message);
    return;
  }
  openModal(data);
}

// 1) Guarda cambios o crea usuario.
// 2) Valida duplicados y maneja conflictos.
async function saveUser() {
  const usuario = $("inp-usuario").value.trim();
  const contra = $("inp-contra").value.trim();
  const rol = $("sel-rol").value;

  if (!usuario || !contra) {
    alert("Completa usuario y contraseña.");
    return;
  }

  // 1) Evita error 409 por nombre duplicado.
  // 2) No permite usar el mismo nombre de otro usuario.
  const { data: repetido, error: errRep } = await sb
    .from("usuarios")
    .select("id")
    .eq("usuario", usuario)
    .neq("id", editID ?? -1)
    .maybeSingle();

  if (errRep) {
    alert("Error validando usuario: " + errRep.message);
    return;
  }
  if (repetido) {
    alert("Ese nombre de usuario ya existe. Elegí otro.");
    return;
  }

  let res;
  if (editID) {
    res = await sb.from("usuarios").update({ usuario, contra, rol }).eq("id", editID);
  } else {
    res = await sb.from("usuarios").insert([{ usuario, contra, rol }]);
  }

  if (res.error) {
    console.error(res.error);
    alert("No se pudo guardar: " + res.error.message);
    return;
  }

  alert("Guardado correctamente ✅");
  closeModal();
  await fetchUsers();
}

// 1) Borra usuario: la base libera cuentas y cancela tareas sola.
// 2) Nunca tocamos tablas relacionadas desde el frontend.
async function deleteUserById(id) {
  const { data: u, error: e1 } = await sb.from("usuarios").select("id,usuario").eq("id", id).single();
  if (e1) {
    console.error(e1);
    alert("Error buscando usuario: " + e1.message);
    return;
  }

  if (!confirm(`¿Eliminar a ${u.usuario}?\n\nSe liberarán sus cuentas y se cancelarán sus tareas.`)) return;

  const { error: e2 } = await sb.from("usuarios").delete().eq("id", id);
  if (e2) {
    console.error(e2);
    alert("Error al eliminar: " + e2.message);
    return;
  }

  alert("Usuario eliminado ✅");
  await fetchUsers();
}

// =========================
// UTIL
// =========================

// 1) Escapa texto para que no puedan inyectar HTML.
// 2) Es una protección básica para paneles web.
function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
