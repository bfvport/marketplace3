import { requireSession, loadSidebar } from "../../assets/js/app.js";

const sb = window.supabaseClient;
const $ = (id) => document.getElementById(id);

await loadSidebar({ activeKey: "mensajes", basePath: "../" });
requireSession();

async function cargarMensajes() {
    // Traemos nombre y mensaje de todas las categorías
    const { data, error } = await sb.from("categoria")
        .select("nombre, mensaje")
        .neq("mensaje", null) // Solo las que tengan mensaje
        .order("nombre");

    $("loader").style.display = "none";
    const container = $("mensajes-container");

    if (!data || data.length === 0) {
        container.innerHTML = "<div class='muted'>No hay scripts configurados en las categorías.</div>";
        return;
    }

    data.forEach((cat, index) => {
        // Generamos ID único para copiar
        const divId = `msg-${index}`;
        
        container.innerHTML += `
            <div class="msg-card">
                <div class="msg-cat">Categoría: ${cat.nombre}</div>
                <div id="${divId}" class="msg-text">${cat.mensaje}</div>
                <button class="btn-copy" onclick="copiarTexto('${divId}')">📋 Copiar</button>
            </div>
        `;
    });
}

window.copiarTexto = (id) => {
    const texto = document.getElementById(id).innerText;
    navigator.clipboard.writeText(texto);
    alert("✅ Mensaje copiado al portapapeles");
};

cargarMensajes();