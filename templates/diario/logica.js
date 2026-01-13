import { requireSession, loadSidebar, fmtDateISO, nowISO } from "../../assets/js/app.js";

const s = requireSession();
const sb = window.supabaseClient;
const $ = (id) => document.getElementById(id);
const today = fmtDateISO(new Date());

// Variables globales del módulo
let itemsCSV = []; 
let itemActual = null;
let asignacionActual = null;
let cuentasDelUsuario = [];
let objetivoDiario = 1; 

await loadSidebar({ activeKey: "diario", basePath: "../" });

// --- UTILIDADES ---
window.copiar = (id) => {
    const el = $(id);
    if(el && el.value) {
        el.select();
        navigator.clipboard.writeText(el.value);
        const btn = el.parentElement.querySelector('.copy-btn');
        if(btn) {
            const txt = btn.textContent;
            btn.textContent = "LISTO";
            setTimeout(() => btn.textContent = txt, 1000);
        }
    }
};

// --- PASO 1: VERIFICAR ASIGNACIÓN (Automático) ---
async function verificarAsignacion() {
    // Busca si HOY el usuario tiene tarea
    const { data, error } = await sb.from("usuarios_asignado")
        .select("*")
        .eq("usuario", s.usuario)
        .lte("fecha_desde", today)
        .gte("fecha_hasta", today)
        .limit(1);

    if (!data || data.length === 0) {
        $("error-bloqueo").style.display = "block";
        $("subtitle").textContent = "Sin actividad.";
        return false;
    }

    // ¡Éxito! Tenemos asignación
    asignacionActual = data[0];
    $("main-dashboard").style.display = "grid"; 
    $("lbl-categoria-asignada").textContent = asignacionActual.categoria;
    $("subtitle").textContent = `Asignado: ${asignacionActual.categoria}`;
    
    // Objetivo por defecto si no está definido es 1
    objetivoDiario = asignacionActual.marketplace_daily || 1;

    return true;
}

// --- PASO 2: CONTADOR DE CUENTAS (Pedido del Jefe) ---
async function cargarEstadoCuentas() {
    const container = $("cuentas-container");
    const select = $("sel-cuenta-usada");
    
    // 1. Buscamos cuentas asignadas
    const { data: cuentas } = await sb.from("cuentas_facebook")
        .select("email, id")
        .eq("ocupada_por", s.usuario);
    
    cuentasDelUsuario = cuentas || [];
    
    // 2. Buscamos lo que YA publicó hoy
    const { data: actividad } = await sb.from("marketplace_actividad")
        .select("facebook_account_usada")
        .eq("usuario", s.usuario)
        .eq("fecha_publicacion", today);

    // 3. Renderizamos
    container.innerHTML = "";
    select.innerHTML = "";

    if (cuentasDelUsuario.length === 0) {
        container.innerHTML = "<div class='muted'>No tienes cuentas FB asignadas.</div>";
        return;
    }

    cuentasDelUsuario.forEach(c => {
        // Cálculo: Objetivo - Hechas
        const hechas = actividad.filter(a => a.facebook_account_usada === c.email).length;
        const faltan = Math.max(0, objetivoDiario - hechas);
        
        let estadoHtml = "";
        if (faltan > 0) {
            estadoHtml = `<span class="status-pill status-pending">Faltan ${faltan}</span>`;
        } else {
            estadoHtml = `<span class="status-pill status-ok">✅ Listo</span>`;
        }

        container.innerHTML += `
            <div style="background:rgba(255,255,255,0.05); padding:10px; border-radius:6px; display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:0.9rem; color:#e2e8f0; font-family:monospace;">${c.email}</span>
                ${estadoHtml}
            </div>
        `;

        // Llenar el select para reportar
        const opt = document.createElement("option");
        opt.value = c.email;
        opt.textContent = c.email;
        select.appendChild(opt);
    });
}

// --- PASO 3: CARGAR CSV DEL BUCKET (Automático) ---
async function cargarCSVAsignado() {
    if (!asignacionActual) return;
    
    // Buscar el nombre del archivo en la tabla categoria
    const { data: catData } = await sb.from("categoria")
        .select("csv_nombre")
        .eq("nombre", asignacionActual.categoria)
        .single();

    if (!catData || !catData.csv_nombre) {
        alert("Error crítico: La categoría asignada no tiene archivo CSV en la base de datos.");
        return;
    }

    $("loader-csv").style.display = "block";

    try {
        // Descargar del bucket 'categoria_csv'
        const { data: urlData } = sb.storage.from('categoria_csv').getPublicUrl(catData.csv_nombre);
        const res = await fetch(urlData.publicUrl);
        
        if (!res.ok) throw new Error("Archivo no encontrado en Storage.");

        const text = await res.text();
        const lines = text.split("\n").filter(l => l.trim().length > 0);
        // Asumimos CSV simple. Si tiene comas en textos, necesitaría mejor parser.
        const headers = lines[0].split(",").map(h => h.trim().toLowerCase());

        itemsCSV = lines.slice(1).map(line => {
            const values = line.split(","); 
            return headers.reduce((obj, h, i) => {
                obj[h] = values[i]?.trim();
                return obj;
            }, {});
        });

        rotarRecurso();
    } catch (e) {
        console.error(e);
        $("loader-csv").textContent = "❌ Error cargando CSV";
    } finally {
        $("loader-csv").style.display = "none";
    }
}

// --- ROTAR Y MOSTRAR DATOS ---
function rotarRecurso() {
    if (itemsCSV.length === 0) return;
    
    // Elegir fila al azar
    itemActual = itemsCSV[Math.floor(Math.random() * itemsCSV.length)];

    // Llenar campos
    $("csv-titulo").value = itemActual.titulo || "";
    $("csv-desc").value = itemActual.descripcion || "";
    $("csv-cat-fb").value = itemActual.categoria || ""; 
    $("csv-tags").value = itemActual.etiquetas || "";
    
    verificarTitulo(itemActual.titulo);
}

async function verificarTitulo(titulo) {
    if (!titulo) return;
    // Chequear si este usuario ya usó este título HOY
    const { data } = await sb.from("marketplace_actividad")
        .select("id")
        .eq("titulo", titulo)
        .eq("fecha_publicacion", today)
        .limit(1);
    
    const aviso = $("titulo-aviso");
    if (data && data.length > 0) {
        aviso.textContent = "⚠️ Ya usaste este título hoy";
        aviso.style.color = "#f59e0b";
    } else {
        aviso.textContent = "✅ Título libre hoy";
        aviso.style.color = "#10b981";
    }
}

// --- DESCARGAR FOTOS (Columna: url_imagenes_portadas) ---
$("btn-download-img").onclick = () => {
    if(!itemActual || !itemActual.url_imagenes_portadas) {
        return alert("Este recurso no tiene columna 'url_imagenes_portadas' o está vacía.");
    }
    // Abrir la foto en nueva pestaña para guardar
    window.open(itemActual.url_imagenes_portadas, '_blank');
};

// --- BOTÓN ROTAR ---
$("btn-rotar").onclick = rotarRecurso;

// --- GUARDAR Y DESCONTAR ---
$("btn-save").onclick = async () => {
    const link = $("inp-link").value.trim();
    const cuenta = $("sel-cuenta-usada").value;

    if (!link) return alert("❌ Debes pegar el link de Marketplace.");
    if (!cuenta || cuenta.includes("Cargando")) return alert("❌ Selecciona una cuenta.");

    const payload = {
        usuario: s.usuario,
        fecha_publicacion: today,
        titulo: $("csv-titulo").value,
        descripcion: $("csv-desc").value,
        categoria: asignacionActual.categoria,
        marketplace_link_publicacion: link,
        facebook_account_usada: cuenta,
        created_at: nowISO() // Hora exacta para métricas
    };

    const { error } = await sb.from("marketplace_actividad").insert([payload]);

    if (error) {
        alert("Error guardando: " + error.message);
    } else {
        alert("✅ Publicación registrada.");
        $("inp-link").value = "";
        
        // Actualizar contadores y rotar datos
        await cargarEstadoCuentas(); 
        rotarRecurso();
    }
};

// --- INICIALIZACIÓN ---
(async function init() {
    // Fichaje automático
    await sb.from("usuarios_actividad").insert([{ 
        usuario: s.usuario, fecha_logueo: nowISO(), facebook_account_usada: "🟢 INGRESO AL DIARIO" 
    }]);

    const tieneAsignacion = await verificarAsignacion();
    if (tieneAsignacion) {
        await cargarEstadoCuentas();
        await cargarCSVAsignado();
    }
})();