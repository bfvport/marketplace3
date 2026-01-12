import { requireSession, loadSidebar } from "../../assets/js/app.js";

const $ = (id) => document.getElementById(id);

async function waitSupabase() {
  while (!window.supabaseClient) await new Promise(r => setTimeout(r, 50));
  return window.supabaseClient;
}

document.addEventListener("DOMContentLoaded", async () => {
  const sb = await waitSupabase();
  const session = requireSession();

  // 🛡️ SEGURIDAD: Solo Gerentes pueden estar aquí
  if (session.rol !== "gerente") {
    alert("Acceso denegado. Solo gerencia.");
    window.location.href = "../dashboard/dashboard.html";
    return;
  }

  // Cargar Sidebar
  await loadSidebar({ activeKey: "usuarios", basePath: "../" }); // Usamos una key nueva 'usuarios'

  // ============================
  // 1. CARGAR LISTA DE USUARIOS
  // ============================
  async function cargarUsuarios() {
    const { data, error } = await sb
      .from("usuarios")
      .select("*")
      .order("id", { ascending: true });

    const tbody = $("tabla-usuarios");
    tbody.innerHTML = "";

    if (error) {
      alert("Error cargando usuarios: " + error.message);
      return;
    }

    data.forEach(u => {
      const tr = document.createElement("tr");
      
      // Estilo diferente para rol
      const badgeClass = u.rol === "gerente" ? "activo" : "inactivo"; // Reusamos clases CSS que ya tenés
      const badgeColor = u.rol === "gerente" ? "#ef4444" : "#3b82f6"; // Rojo gerente, Azul operador

      tr.innerHTML = `
        <td>${u.id}</td>
        <td style="font-weight:bold; color: white;">${u.usuario}</td>
        <td style="font-family:monospace; color: #94a3b8;">${u.contra}</td>
        <td><span class="badge" style="background:${badgeColor}; color:white;">${u.rol.toUpperCase()}</span></td>
        <td>
          <button class="btn2 delete-btn" data-id="${u.id}" style="color:#ef4444; border-color:#ef4444;">Eliminar</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  // ============================
  // 2. CREAR NUEVO USUARIO
  // ============================
  $("btn-crear").onclick = async () => {
    const usuario = $("new-user").value.trim();
    const contra = $("new-pass").value.trim();
    const rol = $("new-rol").value;

    if (!usuario || !contra) return alert("Falta usuario o contraseña");

    const { error } = await sb
      .from("usuarios")
      .insert([{ usuario, contra, rol }]);

    if (error) {
      alert("Error al crear (¿Quizás el usuario ya existe?): " + error.message);
    } else {
      // Limpiar campos y recargar tabla
      $("new-user").value = "";
      $("new-pass").value = "";
      await cargarUsuarios();
    }
  };

  // ============================
  // 3. ELIMINAR USUARIO
  // ============================
  $("tabla-usuarios").addEventListener("click", async (e) => {
    if (e.target.classList.contains("delete-btn")) {
      const id = e.target.dataset.id;
      
      // Evitar que te borres a vos mismo por error
      if (confirm("¿Estás seguro de eliminar a este usuario?")) {
         const { error } = await sb.from("usuarios").delete().eq("id", id);
         if (!error) await cargarUsuarios();
         else alert("Error al borrar: " + error.message);
      }
    }
  });

  // Carga inicial
  await cargarUsuarios();
});