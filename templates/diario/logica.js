import { requireSession, loadSidebar, fmtDateISO, nowISO } from "../../assets/js/app.js";

const s = requireSession();
const sb = window.supabaseClient;
const $ = (id) => document.getElementById(id);
const today = fmtDateISO(new Date());

// Variables globales
let itemsCSV = []; 
let itemActual = null;
let asignacionActual = null;
let objetivoDiario = 1; 

await loadSidebar({ activeKey: "diario", basePath: "../" });

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

async function verificarAsignacion() {
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

    asignacionActual = data[0];
    $("main-dashboard").style.display = "grid"; 
    $("lbl-categoria-asignada").textContent = asignacionActual.categoria;
    $("subtitle").textContent = `Asignado: ${asignacionActual.categoria}`;
    objetivoDiario = asignacionActual.marketplace_daily || 1;
    return true;
}

async function cargarEstadoCuentas() {
    const container = $("cuentas-container");
    const select = $("sel-cuenta-usada");
    
    // --- SOLUCIÓN: GUARDAR SELECCIÓN PREVIA ---
    const seleccionPrevia = select.value;
    // ------------------------------------------

    const { data: cuentas } = await sb.from("cuentas_facebook").select("email, id").eq("ocupada_por", s.usuario);
    const { data: actividad } = await sb.from("marketplace_actividad").select("facebook_account_usada").eq("usuario", s.usuario).eq("fecha_publicacion", today);

    container.innerHTML = "";
    select.innerHTML = "";

    if (!cuentas || cuentas.length === 0) {
        container.innerHTML = "<div class='muted'>No tienes cuentas FB asignadas.</div>";
        return;
    }

    cuentas.forEach(c => {
        const hechas = actividad.filter(a => a.facebook_account_usada === c.email).length;
        const faltan = Math.max(0, objetivoDiario - hechas);
        
        let estadoHtml = faltan > 0 
            ? `<span class="status-pill status-pending">Faltan ${faltan}</span>` 
            : `<span class="status-pill status-ok">✅ Listo</span>`;

        container.innerHTML += `
            <div style="background:rgba(255,255,255,0.05); padding:10px; border-radius:6px; display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:0.9rem; color:#e2e8f0; font-family:monospace;">${c.email}</span>
                ${estadoHtml}
            </div>
        `;

        const opt = document.createElement("option");
        opt.value = c.email;
        opt.textContent = c.email;
        select.appendChild(opt);
    });

    // --- SOLUCIÓN: RESTAURAR SELECCIÓN ---
    // Si la cuenta que estaba seleccionada sigue en la lista, la volvemos a marcar.
    if (seleccionPrevia && Array.from(select.options).some(o => o.value === seleccionPrevia)) {
        select.value = seleccionPrevia;
    }
}

async function cargarCSVAsignado() {
    if (!asignacionActual) return;
    const { data: catData } = await sb.from("categoria").select("csv_nombre").eq("nombre", asignacionActual.categoria).single();

    if (!catData || !catData.csv_nombre) {
        alert("Error crítico: La categoría asignada no tiene archivo CSV.");
        return;
    }
    $("loader-csv").style.display = "block";
    try {
        const { data: urlData } = sb.storage.from('categoria_csv').getPublicUrl(catData.csv_nombre);
        const res = await fetch(urlData.publicUrl);
        if (!res.ok) throw new Error("Archivo no encontrado.");
        const text = await res.text();
        const lines = text.split("\n").filter(l => l.trim().length > 0);
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

function rotarRecurso() {
    if (itemsCSV.length === 0) return;
    itemActual = itemsCSV[Math.floor(Math.random() * itemsCSV.length)];
    $("csv-titulo").value = itemActual.titulo || "";
    $("csv-desc").value = itemActual.descripcion || "";
    $("csv-cat-fb").value = itemActual.categoria || ""; 
    $("csv-tags").value = itemActual.etiquetas || "";
    verificarTitulo(itemActual.titulo);
}

async function verificarTitulo(titulo) {
    if (!titulo) return;
    const { data } = await sb.from("marketplace_actividad").select("id").eq("titulo", titulo).eq("fecha_publicacion", today).limit(1);
    const aviso = $("titulo-aviso");
    if (data && data.length > 0) {
        aviso.textContent = "⚠️ Ya usaste este título hoy";
        aviso.style.color = "#f59e0b";
    } else {
        aviso.textContent = "✅ Título libre hoy";
        aviso.style.color = "#10b981";
    }
}

$("btn-download-img").onclick = () => {
    if(!itemActual || !itemActual.url_imagenes_portadas) return alert("Sin foto.");
    window.open(itemActual.url_imagenes_portadas, '_blank');
};

$("btn-rotar").onclick = rotarRecurso;

$("btn-save").onclick = async () => {
    const link = $("inp-link").value.trim();
    const cuenta = $("sel-cuenta-usada").value;
    if (!link) return alert("❌ Debes pegar el link de Marketplace.");
    if (!cuenta) return alert("❌ Selecciona una cuenta.");

    const payload = {
        usuario: s.usuario,
        fecha_publicacion: today,
        titulo: $("csv-titulo").value,
        descripcion: $("csv-desc").value,
        categoria: asignacionActual.categoria,
        marketplace_link_publicacion: link,
        facebook_account_usada: cuenta,
        created_at: nowISO()
    };
    const { error } = await sb.from("marketplace_actividad").insert([payload]);

    if (error) {
        alert("Error: " + error.message);
    } else {
        alert("✅ Publicación registrada.");
        $("inp-link").value = "";
        await cargarEstadoCuentas(); 
        rotarRecurso();
    }
};

(async function init() {
    await sb.from("usuarios_actividad").insert([{ usuario: s.usuario, fecha_logueo: nowISO(), facebook_account_usada: "🟢 INGRESO AL DIARIO" }]);
    if (await verificarAsignacion()) {
        await cargarEstadoCuentas();
        await cargarCSVAsignado();
    }
})();