// Archivo: templates/diario/logica.js
import {
  requireSession, loadSidebar, fmtDateISO, nowISO,
  escapeHtml, takeFacebookAccountFor
} from "../../assets/js/app.js";

// 1. Validamos sesión y cargamos el menú
const s = requireSession();
await loadSidebar({ activeKey: "diario", basePath: "../" });

const sb = window.supabaseClient;
const $ = (id) => document.getElementById(id);

// Ponemos la fecha y usuario en el subtítulo
const today = fmtDateISO(new Date());
if($("subtitle")) $("subtitle").textContent = `Hoy: ${today} | Usuario: ${s.usuario}`;

function setAccStatus(text){ 
  if($("accStatus")) $("accStatus").textContent = "Cuenta: " + (text || "-"); 
}

/* =========================================
   🟢 REGISTRO DE ENTRADA (Automático)
   ========================================= */
async function registrarEntrada() {
  // Apenas carga el archivo, guardamos que el usuario entró
  await sb.from("usuarios_actividad").insert([{
    usuario: s.usuario,
    fecha_logueo: nowISO(),
    facebook_account_usada: "🟢 INGRESO AL DIARIO"
  }]);
}

/* =========================================
   👮 VISOR DE ASISTENCIA (Solo Gerente)
   ========================================= */
async function cargarReporteGerente() {
  // Si NO es gerente, no hacemos nada
  if (s.rol !== "gerente") return;

  // 1. Mostramos la tarjeta amarilla (que en el HTML está oculta)
  const section = $("managerSection");
  if(section) section.style.display = "block";

  // 2. Traemos los movimientos de HOY
  const { data, error } = await sb
    .from("usuarios_actividad")
    .select("*")
    .like("fecha_logueo", `${today}%`) // Filtro: solo fecha de hoy
    .order("fecha_logueo", { ascending: false }); // Orden: lo más nuevo arriba

  const tbody = $("managerLogsBody");
  if(!tbody) return;
  tbody.innerHTML = ""; // Limpiamos la tabla antes de llenarla

  if(!data || data.length === 0) {
    tbody.innerHTML = "<tr><td colspan='3' class='muted' style='padding:10px;'>Sin actividad hoy.</td></tr>";
    return;
  }

  // 3. Dibujamos cada fila de la tabla
  data.forEach(log => {
    // Hora bonita (ej: 14:30)
    const hora = new Date(log.fecha_logueo).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    // Colores para identificar rápido qué pasó
    let colorTexto = "#ccc";
    let estiloExtra = "";
    const texto = log.facebook_account_usada || "";
    
    if (texto.includes("INGRESO")) {
      colorTexto = "#4ade80"; // Verde
      estiloExtra = "font-weight:bold;";
    } else if (texto.includes("SALIÓ")) {
      colorTexto = "#f87171"; // Rojo
      estiloExtra = "font-weight:bold;";
    } else if (texto.includes("TOMÓ")) {
      colorTexto = "#fbbf24"; // Amarillo
    }

    tbody.innerHTML += `
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
        <td style="padding: 8px; font-family: monospace; color: #64748b;">${hora}</td>
        <td style="padding: 8px; font-weight: 500;">${escapeHtml(log.usuario)}</td>
        <td style="padding: 8px; color: ${colorTexto}; ${estiloExtra}">
          ${escapeHtml(texto)}
        </td>
      </tr>
    `;
  });
}

// ... Funciones estándar del Diario (Categorías, etc.) ...
async function loadCategorias(){
  const { data } = await sb.from("categoria").select("nombre,mensaje").order("nombre");
  const sel = $("categoriaSelect");
  if(sel){
    sel.innerHTML = "";
    (data||[]).forEach(c => {
       const opt = document.createElement("option");
       opt.value = c.nombre; opt.textContent = c.nombre; opt.dataset.mensaje = c.mensaje;
       sel.appendChild(opt);
    });
  }
}

/* =========================================
   3. MOSTRAR TAREA AL OPERADOR (Con Números)
   ========================================= */
async function loadAsignacionDeHoy(){
  const box = $("asigBox");
  if(!box) return;

  // Buscamos si tiene tarea hoy
  const { data } = await sb.from("usuarios_asignado").select("*").eq("usuario", s.usuario);
  
  // Filtramos por fecha
  const inRange = (data || []).filter(a => a.fecha_desde <= today && today <= a.fecha_hasta);

  box.innerHTML = "";
  
  if (!inRange.length){
    box.innerHTML = `<div class="muted">💤 No tienes asignaciones activas para hoy.</div>`;
    return;
  }

  // Mostramos cada tarea con sus objetivos
  inRange.forEach(a => {
    box.innerHTML += `
      <div style="background: rgba(255,255,255,0.05); border-left: 4px solid #a78bfa; padding: 10px; margin-bottom: 8px; border-radius: 4px;">
        <div style="font-weight:bold; color: #a78bfa; font-size: 1.1rem;">${a.categoria}</div>
        <div style="margin-top: 5px; font-size: 0.9rem; color: #e2e8f0; line-height: 1.6;">
           🛒 Marketplace: <b style="color:#fff;">${a.marketplace_daily}</b> <span class="muted">|</span> 
           👥 Grupos: <b style="color:#fff;">${a.grupos_daily}</b><br>
           📖 Historias: <b style="color:#fff;">${a.historia_daily}</b> <span class="muted">|</span> 
           🏠 Muro: <b style="color:#fff;">${a.muro_daily}</b>
        </div>
      </div>
    `;
  });
}

async function ensureCuentaActual(){
  const { data } = await sb.from("cuentas_facebook").select("*").eq("ocupada_por", s.usuario).eq("estado","ocupada").limit(1);
  if(data && data.length) setAccStatus(data[0].email);
}

// INICIALIZACIÓN (Se ejecuta al abrir la página)
(async function init(){
  // 1. Registramos entrada silenciosa
  await registrarEntrada();
  
  // 2. Carga normal de datos
  await loadCategorias();
  await loadAsignacionDeHoy();
  await ensureCuentaActual();

  // 3. Si eres GERENTE, carga la tabla de espía
  await cargarReporteGerente();

  // Evento botón tomar cuenta
  if($("btnTakeAcc")) $("btnTakeAcc").onclick = async () => {
      const r = await takeFacebookAccountFor(s.usuario);
      if(r.ok) {
          setAccStatus(r.account.email);
          // Registro extra: Toma de cuenta
          await sb.from("usuarios_actividad").insert([{
            usuario: s.usuario, fecha_logueo: nowISO(), 
            facebook_account_usada: "⚠️ TOMÓ CUENTA: " + r.account.email
          }]);
          await cargarReporteGerente(); // Refrescamos la tabla al instante
      } else { alert(r.reason); }
  };
})();