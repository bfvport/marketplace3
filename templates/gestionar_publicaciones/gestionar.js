import { requireSession, loadSidebar } from "../../assets/js/app.js";

const s = requireSession();
const sb = window.supabaseClient;
const $ = (id) => document.getElementById(id);

await loadSidebar({ activeKey: "gestionar_publicaciones", basePath: "../" });

// Solo Gerentes
if (s.rol !== "gerente") {
    document.body.innerHTML = "<h2 style='text-align:center; color:white;'>⛔ Acceso Denegado</h2>";
}

// 1. Cargar Categorías
async function cargarCategorias() {
    const { data } = await sb.from("categoria").select("*").order("nombre");
    const sel = $("sel-categoria");
    sel.innerHTML = '<option value="">Seleccione...</option>';
    data.forEach(c => {
        sel.innerHTML += `<option value="${c.id}">${c.nombre} ${c.csv_extras ? '✅' : '(Sin extras)'}</option>`;
    });
}

// 2. Subir Archivo
$("btn-upload").onclick = async () => {
    const file = $("inp-file").files[0];
    const catId = $("sel-categoria").value;
    
    if (!file || !catId) return alert("Selecciona categoría y archivo.");

    $("upload-status").textContent = "⏳ Subiendo...";
    
    // Nombre único
    const fileName = `${Date.now()}_extras_${file.name.replace(/\s/g, '_')}`;

    // A. Subir al Bucket
    const { error: uploadError } = await sb.storage
        .from('categoria_csv')
        .upload(fileName, file);

    if (uploadError) {
        $("upload-status").textContent = "❌ Error Subida: " + uploadError.message;
        return;
    }

    // B. Guardar nombre en DB
    const { error: dbError } = await sb.from("categoria")
        .update({ csv_extras: fileName })
        .eq("id", catId);

    if (dbError) {
        $("upload-status").textContent = "❌ Error DB: " + dbError.message;
    } else {
        $("upload-status").textContent = "✅ ¡Archivo subido y asignado correctamente!";
        cargarCategorias();
    }
};

// 3. Descargar Plantilla
$("btn-plantilla").onclick = () => {
    const csvContent = "url_img_historia,url_img_grupo,url_img_muro,texto_muro,texto_grupo\nhttps://ejemplo.com/foto1.jpg,https://ejemplo.com/foto2.jpg,,,";
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "plantilla_extras.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
};

cargarCategorias();