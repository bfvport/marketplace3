import { requireSession, loadSidebar, fmtDateISO } from "../../assets/js/app.js";

const s = requireSession();
const sb = window.supabaseClient;
const $ = (id) => document.getElementById(id);
const today = fmtDateISO(new Date());

// INICIALIZACIÓN PRINCIPAL
(async function init() {
    // Carga la barra lateral y configura textos básicos de bienvenida
    await loadSidebar({ activeKey: "dashboard", basePath: "../" });
    $("welcome-user").textContent = `Hola, ${s.usuario} 👋`;
    $("fecha-actual").textContent = new Date().toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // Ejecuta las verificaciones de tareas pendientes
    await verificarTodo();
})();

// FUNCIÓN MAESTRA QUE LLAMA A LAS 3 REVISIONES
async function verificarTodo() {
    const container = $("alerta-container");
    container.innerHTML = ""; // Limpia alertas viejas antes de cargar nuevas

    // Ejecutamos las 3 verificaciones en paralelo para que cargue rápido
    await Promise.all([
        checkDiario(container),       // Revisa publicaciones de hoy
        checkCalentamiento(container),// Revisa cuentas frías
        checkMetricas(container)      // Revisa si pasaron 7 días sin cargar clicks
    ]);

    // Si después de revisar todo el contenedor sigue vacío, mostramos mensaje de éxito
    if (container.innerHTML === "") {
        container.innerHTML = `
            <div class="card" style="border-left: 5px solid #10b981; background: rgba(16, 185, 129, 0.1);">
                <h3 style="color:#10b981; margin:0;">✅ ¡Todo al día!</h3>
                <p style="margin:5px 0 0 0;">No tenés tareas pendientes por ahora.</p>
            </div>`;
    }
}

// 1. VERIFICAR PUBLICACIONES DE DIARIO (SI COMPLETÓ LA META HOY)
async function checkDiario(container) {
    // Busca la meta asignada para hoy (tabla usuarios_asignado)
    let qAsig = sb.from("usuarios_asignado").select("*").lte("fecha_desde", today).gte("fecha_hasta", today);
    if (s.rol !== "gerente") qAsig = qAsig.eq("usuario", s.usuario);
    
    // Busca lo que ya se publicó hoy (tabla marketplace_actividad)
    const { data: asigs } = await qAsig;
    const { data: hechos } = await sb.from("marketplace_actividad").select("usuario").eq("fecha_publicacion", today);

    // Compara Meta vs Hechos
    if (asigs) {
        asigs.forEach(a => {
            const realizados = hechos.filter(h => h.usuario === a.usuario).length;
            const falta = (a.marketplace_daily || 0) - realizados;

            if (falta > 0) {
                // Si falta, crea una alerta roja
                const msg = s.rol === "gerente" ? `El operador <b>${a.usuario}</b> debe` : "Te faltan";
                agregarAlerta(container, "error", "⚠️ Publicaciones Pendientes", `${msg} publicar <b>${falta}</b> productos hoy en la categoría ${a.categoria}.`);
            }
        });
    }
}

// 2. VERIFICAR CALENTAMIENTO (SI TIENE CUENTAS FRÍAS)
async function checkCalentamiento(container) {
    // Busca cuentas marcadas como 'frio' asignadas al usuario (o a todos si es gerente)
    let q = sb.from("cuentas_facebook").select("email, ocupada_por").eq("calidad", "frio");
    if (s.rol !== "gerente") q = q.eq("ocupada_por", s.usuario);

    const { data: frias } = await q;

    if (frias && frias.length > 0) {
        // Si hay cuentas frías, crea alerta amarilla
        const msg = s.rol === "gerente" ? `Hay <b>${frias.length}</b> cuentas frías en el equipo.` : `Tenés <b>${frias.length}</b> cuentas en estado FRÍO para trabajar hoy.`;
        agregarAlerta(container, "warning", "🔥 Calentamiento Requerido", msg);
    }
}

// 3. VERIFICAR MÉTRICAS (SI PASARON 7 DÍAS SIN CARGAR CLICKS)
async function checkMetricas(container) {
    // Busca la última métrica cargada por el usuario
    let q = sb.from("metricas").select("created_at, usuario").order("created_at", { ascending: false }).limit(1);
    if (s.rol !== "gerente") q = q.eq("usuario", s.usuario);
    
    const { data: lastMetric } = await q;

    // Calcula días desde la última carga. Si no hay datos nunca, asumimos deuda.
    let diasSinCarga = 999; 
    if (lastMetric && lastMetric.length > 0) {
        const ultimaFecha = new Date(lastMetric[0].created_at);
        const hoy = new Date();
        diasSinCarga = Math.floor((hoy - ultimaFecha) / (1000 * 60 * 60 * 24));
    }

    if (diasSinCarga >= 7) {
        // Si pasaron 7 o más días, crea alerta roja crítica
        const texto = s.rol === "gerente" ? "Alguien del equipo no carga métricas hace +7 días." : `Hace <b>${diasSinCarga} días</b> que no cargas el reporte de Clicks.`;
        agregarAlerta(container, "error", "📊 Reporte Semanal Vencido", texto + " <a href='../metricas/metricas.html' style='color:#fff; text-decoration:underline;'>Ir a cargar ahora</a>");
    }
}

// UTILIDAD: CREA EL HTML DE LA ALERTA VISUAL
function agregarAlerta(container, tipo, titulo, mensaje) {
    const div = document.createElement("div");
    // Define colores según tipo (error=rojo, warning=amarillo)
    const color = tipo === "error" ? "#ef4444" : "#f59e0b";
    const bg = tipo === "error" ? "rgba(239, 68, 68, 0.15)" : "rgba(245, 158, 11, 0.15)";
    
    div.className = "card";
    div.style.borderLeft = `5px solid ${color}`;
    div.style.background = bg;
    div.style.padding = "15px";
    
    div.innerHTML = `
        <strong style="color:${color}; display:block; margin-bottom:5px;">${titulo}</strong>
        <span style="color:#e2e8f0;">${mensaje}</span>
    `;
    container.appendChild(div);
}