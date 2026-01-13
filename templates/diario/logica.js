import { requireSession, loadSidebar, fmtDateISO, nowISO, escapeHtml } from "../../assets/js/app.js";

const s = requireSession();
const sb = window.supabaseClient;
const $ = (id) => document.getElementById(id);
const today = fmtDateISO(new Date());

let itemsCSV = []; // Guardará las filas del CSV cargado
let itemActual = null;

await loadSidebar({ activeKey: "diario", basePath: "../" });

// --- FUNCIONES DE APOYO ---
function log(msg) {
    const l = $("log");
    l.innerHTML = `<div>[${new Date().toLocaleTimeString()}] ${msg}</div>` + l.innerHTML;
}

window.copy = (id) => {
    const el = $(id);
    el.select();
    navigator.clipboard.writeText(el.value);
    log(`Copiado: ${id.replace('csv-', '')}`);
};

// --- DESCARGAR IMÁGENES (Nahu) ---
async function descargarFotos() {
    if (!itemActual) return alert("Primero carga una categoría");
    
    // Combinamos fijas y portadas
    const urls = [];
    if (itemActual.url_img_fijas) urls.push(...itemActual.url_img_fijas.split(","));
    if (itemActual.url_imagenes_portadas) urls.push(itemActual.url_imagenes_portadas);

    log(`Iniciando descarga de ${urls.length} fotos...`);
    
    for (let i = 0; i < urls.length; i++) {
        const url = urls[i].trim();
        if(!url) continue;
        try {
            const res = await fetch(url);
            const blob = await res.blob();
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `foto_${i+1}.jpg`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } catch (e) { log("Error descargando foto " + (i+1)); }
    }
}

// --- CARGAR Y PROCESAR CSV ---
async function cargarRecursosCSV(csvNombre) {
    if (!csvNombre) return;
    $("loader-csv").style.display = "block";
    
    try {
        const { data: urlData } = sb.storage.from('categorias').getPublicUrl(csvNombre);
        const res = await fetch(urlData.publicUrl);
        const text = await res.text();
        
        const lines = text.split("\n").filter(l => l.trim() !== "");
        const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
        
        itemsCSV = lines.slice(1).map(line => {
            const values = line.split(",");
            return headers.reduce((obj, h, i) => {
                obj[h] = values[i]?.trim();
                return obj;
            }, {});
        });

        // Seleccionamos uno al azar para empezar
        rotarRecurso();
    } catch (e) {
        log("❌ Error cargando CSV: " + e.message);
    } finally {
        $("loader-csv").style.display = "none";
    }
}

function rotarRecurso() {
    if (itemsCSV.length === 0) return;
    itemActual = itemsCSV[Math.floor(Math.random() * itemsCSV.length)];
    
    $("csv-titulo").value = itemActual.titulo || "";
    $("csv-desc").value = itemActual.descripcion || "";
    $("csv-cat").value = itemActual.categoria || "";
    $("csv-tags").value = itemActual.etiquetas || "";
    
    log("🔄 Recurso rotado (Nuevo título asignado)");
}

// --- INICIO Y EVENTOS ---
async function init() {
    $("subtitle").textContent = `Operador: ${s.usuario} | ${today}`;
    
    // Fichaje automático
    await sb.from("usuarios_actividad").insert([{ 
        usuario: s.usuario, fecha_logueo: nowISO(), facebook_account_usada: "🟢 ENTRÓ AL DIARIO" 
    }]);

    // Cargar selector de categorías
    const { data: cats } = await sb.from("categoria").select("*");
    const sel = $("categoriaSelect");
    cats.forEach(c => {
        const opt = document.createElement("option");
        opt.value = c.nombre;
        opt.textContent = c.nombre;
        opt.dataset.csv = c.csv_nombre;
        sel.appendChild(opt);
    });

    // Evento al cambiar categoría
    sel.onchange = (e) => {
        const selected = e.target.options[e.target.selectedIndex];
        cargarRecursosCSV(selected.dataset.csv);
    };

    // Cargar primer CSV por defecto
    if(cats.length > 0) cargarRecursosCSV(cats[0].csv_nombre);
}

$("btnSave").onclick = async () => {
    const link = $("link").value.trim();
    if (!link) return alert("¡El link de Marketplace es obligatorio!");

    const payload = {
        usuario: s.usuario,
        fecha_publicacion: today,
        titulo: $("csv-titulo").value,
        descripcion: $("csv-desc").value,
        categoria: $("categoriaSelect").value,
        marketplace_link_publicacion: link,
        url_imagenes_portada: itemActual?.url_imagenes_portadas || "",
        created_at: nowISO()
    };

    const { error } = await sb.from("marketplace_actividad").insert([payload]);
    
    if (error) {
        log("❌ Error al guardar: " + error.message);
    } else {
        log("✅ ¡Guardado con éxito!");
        $("link").value = "";
        rotarRecurso(); // Pasamos al siguiente automáticamente
    }
};

$("btnNew").onclick = rotarRecurso;
$("btnDownloadImgs").onclick = descargarFotos;

init();