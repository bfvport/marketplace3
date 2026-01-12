import { requireSession, loadSidebar } from "../../assets/js/app.js";

const $ = (id) => document.getElementById(id);

async function waitSupabase() {
  while (!window.supabaseClient) await new Promise(r => setTimeout(r, 50));
  return window.supabaseClient;
}

document.addEventListener("DOMContentLoaded", async () => {
  const sb = await waitSupabase();
  const session = requireSession();
  
  // 1. Cargar Sidebar
  await loadSidebar({ activeKey: "dashboard", basePath: "../" });

  // 2. Mostrar nombre del usuario
  if($("user-name")) $("user-name").textContent = session.usuario;

  // ==========================================
  // A. LEER MENSAJE (Para todos los roles)
  // ==========================================
  async function cargarMensaje() {
    const { data, error } = await sb
      .from("configuracion")
      .select("mensaje_general")
      .eq("id", 1) // Siempre leemos la fila 1
      .single();

    if (!error && data) {
      $("display-msg").textContent = data.mensaje_general || "Sin novedades hoy.";
    } else {
      console.log("Error cargando mensaje:", error);
      $("display-msg").textContent = "📢 ¡Bienvenido al sistema!";
    }
  }

  // Cargamos el mensaje apenas entramos
  await cargarMensaje();

  // ==========================================
  // B. EDICIÓN (Solo para Gerente)
  // ==========================================
  if (session.rol === "gerente") {
    // Mostrar controles de gerente
    if($("manager-controls")) $("manager-controls").style.display = "block";
    if($("card-gerente")) $("card-gerente").style.display = "block";

    // Botón "Editar": Abre la cajita
    $("btn-edit-toggle").onclick = () => {
      $("edit-box").classList.remove("hidden");
      $("btn-edit-toggle").classList.add("hidden");
      // Rellenamos el textarea con el mensaje actual
      $("txt-mensaje").value = $("display-msg").textContent;
    };

    // Botón "Cancelar": Cierra la cajita
    $("btn-cancel-msg").onclick = () => {
      $("edit-box").classList.add("hidden");
      $("btn-edit-toggle").classList.remove("hidden");
    };

    // Botón "Guardar": Manda el cambio a la base de datos
    $("btn-save-msg").onclick = async () => {
      const nuevoTexto = $("txt-mensaje").value.trim();
      
      const { error } = await sb
        .from("configuracion")
        .update({ mensaje_general: nuevoTexto, updated_at: new Date() })
        .eq("id", 1);

      if (error) {
        alert("Error al guardar: " + error.message);
      } else {
        await cargarMensaje(); // Refrescamos el texto en pantalla
        $("edit-box").classList.add("hidden");
        $("btn-edit-toggle").classList.remove("hidden");
      }
    };
  }
});