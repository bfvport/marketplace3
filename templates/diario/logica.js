import { requireSession, loadSidebar, fmtDateISO, nowISO, escapeHtml } from "../../assets/js/app.js";

const s = requireSession();
const sb = window.supabaseClient;
const $ = (id) => document.getElementById(id);
const today = fmtDateISO(new Date());

let itemsCSV = []; 
let itemActual = null;

await loadSidebar({ activeKey: "diario", basePath: "../" });

// --- UTILIDADES ---
function log(msg) {
    const l = $("log");
    if (l) l.innerHTML = `<div>[${new Date().toLocaleTimeString()}] ${msg}</div>` + l.innerHTML;
}

window.copy = (id) => {
    const el = $(id);
    if (!el || !el.value) return log("⚠️ Nada que copiar");
    el.select();
    navigator.clipboard.writeText(el.value);
    log(`Copiado: ${id.split('-')[1]}`);
};

// --- MANEJO DE IMÁGENES ---
async function descargarFotos() {
    if (!itemActual) return alert("Seleccioná una categoría primero.");
    
    const urls = [];
    if (itemActual.url_img_fijas) urls.push(...itemActual.url_img_fijas.split(","));
    if (itemActual.url_imagenes_portadas) urls.push(itemActual.url_imagenes_portadas);

    const filtradas = urls.map(u => u.trim()).filter(u => u.startsWith("http"));
    if (filtradas.length === 0) return alert("No hay links de fotos válidos.");

    log(`Descargando ${filtradas.length} fotos...`);
    filtradas.forEach((url, i) => {
        const a = document.createElement("a");
        a.href = url;
        a.target = "_blank";
        a.download = `foto_${i+1}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    });
}

// --- 🚀 CARGAR CSV DEL BUCKET (Corregido: categoria_csv) ---
async function cargarRecursosCSV(csvNombre) {
    if (!csvNombre) return log("⚠️ Esta categoría no tiene un archivo CSV asignado.");
    
    const loader = $("loader-csv");
    if (loader) loader.style.display = "block";
    
    try {
        // CORRECCIÓN: Nombre exacto del bucket según tu foto
        const { data: urlData } = sb.storage.from('categoria_csv').getPublicUrl(csvNombre);
        
        log(`Buscando archivo: ${csvNombre}...`);
        
        const res = await fetch(urlData.publicUrl);
        if (!res.ok) throw new Error("El archivo no existe en el bucket 'categoria_csv'.");
        
        const text = await res.text();
        const parsed = Papa.parse(text, {
  header: true,
  skipEmptyLines: true,
  transformHeader: (h) => (h || "").trim().toLowerCase(),
});

if (parsed.errors?.length) {
  console.warn("CSV parse errors:", parsed.errors);
}

itemsCSV = (parsed.data || []).map((row) => {
  // limpieza básica: trim a strings
  const out = {};
  for (const k in row) out[k] = (typeof row[k] === "string") ? row[k].trim() : row[k];
  return out;
});

log(`✅ CSV cargado con ${itemsCSV.length} registros.`);
rotarRecurso();

        const lines = text.split("\n").filter(l => l.trim().length > 0);
        const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
        
        itemsCSV = lines.slice(1).map(line => {
            const values = line.split(",");
            return headers.reduce((obj, h, i) => {
                obj[h] = values[i]?.trim();
                return obj;
            }, {});
        });

        log(`✅ CSV cargado con ${itemsCSV.length} registros.`);
        rotarRecurso();
    } catch (e) {
        log("❌ Error CSV: " + e.message);
        console.error(e);
    } finally {
        if (loader) loader.style.display = "none";
    }
}

function rotarRecurso() {
    if (itemsCSV.length === 0) return;
    itemActual = itemsCSV[Math.floor(Math.random() * itemsCSV.length)];
    
    if ($("csv-titulo")) $("csv-titulo").value = itemActual.titulo || "";
    if ($("csv-desc")) $("csv-desc").value = itemActual.descripcion || "";
    if ($("csv-cat")) $("csv-cat").value = itemActual.categoria || "";
    if ($("csv-tags")) $("csv-tags").value = itemActual.etiquetas || "";
    
    log("🔄 Recurso asignado.");
}

// --- INICIO ---
async function init() {
    const subt = $("subtitle");
    if (subt) subt.textContent = `Usuario: ${s.usuario} | Hoy: ${today}`;
    
    await sb.from("usuarios_actividad").insert([{ 
        usuario: s.usuario, 
        fecha_logueo: nowISO(), 
        facebook_account_usada: "🟢 INGRESO AL DIARIO" 
    }]);

    const { data: cats } = await sb.from("categoria").select("*").order("nombre");
    const sel = $("categoriaSelect");
    
    if (sel && cats) {
        sel.innerHTML = '<option value="">Seleccionar categoría...</option>';
        cats.forEach(c => {
            const opt = document.createElement("option");
            opt.value = c.nombre;
            opt.textContent = c.nombre;
            opt.dataset.csv = c.csv_nombre;
            sel.appendChild(opt);
        });

        sel.onchange = (e) => {
            const opt = e.target.options[e.target.selectedIndex];
            if (opt && opt.dataset.csv) {
                cargarRecursosCSV(opt.dataset.csv);
            }
        };
    }
}

if ($("btnSave")) {
    $("btnSave").onclick = async () => {
        const link = $("link").value.trim();
        if (!link) return alert("El link de Marketplace es obligatorio.");

        const payload = {
            usuario: s.usuario,
            fecha_publicacion: today,
            titulo: $("csv-titulo").value,
            descripcion: $("csv-desc").value,
            categoria: $("categoriaSelect").value,
            marketplace_link_publicacion: link,
            url_imagenes_portadas: itemActual?.url_imagenes_portadas || "",
            created_at: nowISO()
        };

        const { error } = await sb.from("marketplace_actividad").insert([payload]);
        if (error) log("❌ Error: " + error.message);
        else {
            log("✅ Guardado correctamente.");
            $("link").value = "";
            rotarRecurso();
        }
    };
}

if ($("btnNew")) $("btnNew").onclick = rotarRecurso;
if ($("btnDownloadImgs")) $("btnDownloadImgs").onclick = descargarFotos;

init();