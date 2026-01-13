import { requireSession, loadSidebar } from "../../assets/js/app.js";

const s = requireSession();
const sb = window.supabaseClient;
const $ = (id) => document.getElementById(id);

async function initDashboard() {
    // 1. Cargar el menú lateral
    await loadSidebar({ activeKey: "dashboard", basePath: "../" });

    // 2. Personalizar bienvenida con el nombre real
    $("user-name").textContent = s.usuario;

    // 3. Mostrar controles si es gerente
    if (s.rol === "gerente") {
        $("manager-controls").style.display = "block";
        $("card-gerente").style.display = "block";
    }

    // 4. Cargar el mensaje actual de la base de datos
    await cargarMensaje();

    // --- EVENTOS ---
    $("btn-edit-toggle").onclick = () => $("edit-box").classList.toggle("hidden");
    $("btn-cancel-msg").onclick = () => $("edit-box").classList.add("hidden");

    $("btn-save-msg").onclick = async () => {
        const texto = $("txt-mensaje").value.trim();
        if (!texto) return alert("El mensaje no puede estar vacío");

        const { error } = await sb.from("sistema_avisos").upsert({ 
            id: 1, 
            contenido: texto, 
            autor: s.usuario, 
            updated_at: new Date() 
        });

        if (!error) {
            $("display-msg").textContent = texto;
            $("edit-box").classList.add("hidden");
            alert("✅ Mensaje actualizado para el equipo");
        } else {
            alert("Error: " + error.message);
        }
    };
}

async function cargarMensaje() {
    const { data } = await sb.from("sistema_avisos").select("contenido").eq("id", 1).single();
    if (data) {
        $("display-msg").textContent = data.contenido;
        $("txt-mensaje").value = data.contenido;
    }
}

initDashboard();