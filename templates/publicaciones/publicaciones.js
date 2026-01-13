import { requireSession, loadSidebar, fmtDateISO } from "../../assets/js/app.js";

const s = requireSession();
const sb = window.supabaseClient;
const $ = (id) => document.getElementById(id);
const today = fmtDateISO(new Date());

let asignacion = null;
let recursos = [];

await loadSidebar({ activeKey: "publicaciones", basePath: "../" });

// 1. Cargar Asignación y CSV
async function init() {
    $("loader-main").style.display = "block";

    // A. Buscar Asignación
    const { data: asigData } = await sb.from("usuarios_asignado")
        .select("*")
        .eq("usuario", s.usuario)
        .lte("fecha_desde", today)
        .gte("fecha_hasta", today)
        .limit(1);

    if (!asigData || asigData.length === 0) {
        $("subtitle").textContent = "⛔ No tienes asignación activa hoy.";
        $("loader-main").style.display = "none";
        return;
    }

    asignacion = asigData[0];
    $("subtitle").textContent = `Categoría: ${asignacion.categoria} | Fecha: ${today}`;

    // Mostrar Objetivos
    $("goal-historia").textContent = asignacion.historia_daily || 0;
    $("goal-grupos").textContent = asignacion.grupos_daily || 0;
    $("goal-muro").textContent = asignacion.muro_daily || 0;

    // B. Buscar CSV Extra de la Categoría
    const { data: catData } = await sb.from("categoria")
        .select("csv_extras")
        .eq("nombre", asignacion.categoria)
        .single();

    if (catData && catData.csv_extras) {
        await descargarCSV(catData.csv_extras);
    } else {
        alert("⚠️ Esta categoría no tiene recursos extra cargados (CSV).");
    }
    
    $("loader-main").style.display = "none";
}

// 2. Procesar CSV
async function descargarCSV(filename) {
    try {
        const { data } = sb.storage.from('categoria_csv').getPublicUrl(filename);
        const res = await fetch(data.publicUrl);
        const text = await res.text();
        
        const lines = text.split("\n").filter(l => l.trim().length > 0);
        const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
        
        recursos = lines.slice(1).map(line => {
            const values = line.split(",");
            return headers.reduce((obj, h, i) => {
                obj[h] = values[i]?.trim();
                return obj;
            }, {});
        });
        
        // Cargar textos aleatorios de ejemplo
        const randomItem = recursos[Math.floor(Math.random() * recursos.length)];
        if(randomItem) {
            $("txt-grupo").value = randomItem.texto_grupo || "";
            $("txt-muro").value = randomItem.texto_muro || "";
        }

    } catch (e) {
        console.error(e);
        alert("Error leyendo recursos extra.");
    }
}

// 3. Función de Descarga Inteligente
window.descargar = (tipo) => {
    // tipo = 'historia', 'grupo', 'muro'
    if (recursos.length === 0) return alert("No se cargaron recursos.");

    let cantidad = 0;
    let columnaUrl = "";

    if (tipo === 'historia') {
        cantidad = asignacion.historia_daily;
        columnaUrl = "url_img_historia";
    } else if (tipo === 'grupo') {
        cantidad = asignacion.grupos_daily;
        columnaUrl = "url_img_grupo";
    } else if (tipo === 'muro') {
        cantidad = asignacion.muro_daily;
        columnaUrl = "url_img_muro";
    }

    if (!cantidad || cantidad <= 0) return alert("Objetivo cumplido o es 0.");

    const validos = recursos.filter(r => r[columnaUrl] && r[columnaUrl].startsWith("http"));
    
    if (validos.length === 0) return alert("No hay fotos válidas en el CSV para " + tipo);

    // Selección aleatoria
    const mezclados = validos.sort(() => 0.5 - Math.random());
    const seleccionados = mezclados.slice(0, cantidad);

    seleccionados.forEach((item, i) => {
        const url = item[columnaUrl];
        const a = document.createElement("a");
        a.href = url;
        a.target = "_blank";
        a.download = `${tipo}_${i+1}.jpg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    });
};

init();