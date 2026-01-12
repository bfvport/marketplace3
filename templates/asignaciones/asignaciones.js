import { requireSession, loadSidebar, nowISO, fmtDateISO } from "../../assets/js/app.js";

const $ = (id) => document.getElementById(id);

async function waitSupabase() {
  while (!window.supabaseClient) await new Promise(r => setTimeout(r, 50));
  return window.supabaseClient;
}

document.addEventListener("DOMContentLoaded", async () => {
  const sb = await waitSupabase();
  const session = requireSession();

  // 🛡️ Solo Gerente
  if (session.rol !== "gerente") {
    alert("Solo acceso gerencial.");
    window.location.href = "/templates/dashboard/dashboard.html";
    return;
  }

  await loadSidebar({ activeKey: "asignaciones", basePath: "../" });

  // ==========================================
  // 1. CARGA DE DATOS Y FECHAS (Lo que pidió Nahu)
  // ==========================================
  async function initFormulario() {
    // A) Cargar Operadores
    const { data: ops } = await sb.from("usuarios").select("usuario").eq("rol", "operador");
    const selOp = $("sel-operador");
    selOp.innerHTML = '<option value="">Seleccionar...</option>';
    selOp.innerHTML += '<option value="TODOS" style="font-weight:bold; color: #10b981;">-- 👥 A TODOS LOS OPERADORES --</option>';
    (ops || []).forEach(u => selOp.innerHTML += `<option value="${u.usuario}">${u.usuario}</option>`);

    // B) Cargar Categorías
    const { data: cats } = await sb.from("categoria").select("nombre").order("nombre");
    const selCat = $("sel-categoria");
    selCat.innerHTML = '<option value="">Seleccionar...</option>';
    (cats || []).forEach(c => selCat.innerHTML += `<option value="${c.nombre}">${c.nombre}</option>`);

    // C) 📅 FECHAS AUTOMÁTICAS (El pedido de "Una semana más")
    const hoy = new Date();
    $("date-desde").value = fmtDateISO(hoy); // Setea HOY automáticamente
    
    // Calculamos 7 días a futuro
    const semanaQueViene = new Date();
    semanaQueViene.setDate(hoy.getDate() + 7);
    $("date-hasta").value = fmtDateISO(semanaQueViene); // Setea +1 semana automáticamente
  }

  // ==========================================
  // 2. TABLA DE VIGENTES
  // ==========================================
  async function cargarTabla() {
    const { data } = await sb.from("usuarios_asignado").select("*").order("id", { ascending: false });
    const tbody = $("tabla-asignaciones");
    tbody.innerHTML = "";
    
    if(!data || data.length === 0) {
      tbody.innerHTML = "<tr><td colspan='5' class='muted'>No hay asignaciones activas.</td></tr>";
      return;
    }

    data.forEach(a => {
      tbody.innerHTML += `
        <tr>
          <td style="font-weight:bold; color:#fff;">${a.usuario}</td>
          <td><span class="badge" style="background:#8b5cf6; color:white;">${a.categoria}</span></td>
          <td class="muted" style="font-size:0.9rem;">${a.fecha_desde} <br> ${a.fecha_hasta}</td>
          <td style="font-family:monospace;">
             🛒${a.marketplace_daily} | 👥${a.grupos_daily} | 📖${a.historia_daily} | 🏠${a.muro_daily}
          </td>
          <td><button class="btn2 delete-btn" data-id="${a.id}" style="color:#ef4444; border-color:#ef4444;">X</button></td>
        </tr>`;
    });
  }

  // ==========================================
  // 3. LOGICA ANTI-SUPERPOSICIÓN (Corrección de duplicados)
  // ==========================================
  $("btn-asignar").onclick = async () => {
    const operador = $("sel-operador").value;
    const categoria = $("sel-categoria").value;
    const fDesde = $("date-desde").value;
    const fHasta = $("date-hasta").value;
    
    const mkp = $("num-marketplace").value;
    const grp = $("num-grupos").value;
    const hist = $("num-historia").value;
    const muro = $("num-muro").value;

    if (!operador || !categoria || !fDesde || !fHasta) {
      return alert("Faltan datos clave (Operador, Categoría o Fechas).");
    }

    // Preparamos los datos
    const basePayload = {
      categoria, fecha_desde: fDesde, fecha_hasta: fHasta,
      marketplace_daily: mkp, grupos_daily: grp, historia_daily: hist, muro_daily: muro,
      asignado_por: session.usuario, updated_at: nowISO()
    };

    let usuariosDestino = [];

    // Definimos quién recibe la tarea
    if (operador === "TODOS") {
      const { data: todos } = await sb.from("usuarios").select("usuario").eq("rol", "operador");
      usuariosDestino = todos.map(u => u.usuario);
    } else {
      usuariosDestino = [operador];
    }

    if(usuariosDestino.length === 0) return alert("No hay usuarios destinatarios.");

    // 🔥 LIMPIEZA PREVIA: Borramos la asignación vieja de esa categoría
    // Esto soluciona lo que dijo Nahu de que "se sobreponen".
    // Si asignas de nuevo, borra la anterior y deja la nueva.
    await sb.from("usuarios_asignado")
      .delete()
      .in("usuario", usuariosDestino) // Para estos usuarios
      .eq("categoria", categoria);    // Y esta categoría específica

    // 🔥 INSERTAR LA NUEVA
    const inserts = usuariosDestino.map(u => ({ ...basePayload, usuario: u }));
    const { error } = await sb.from("usuarios_asignado").insert(inserts);

    if (error) {
      alert("Error: " + error.message);
    } else {
      // ÉXITO: Recargamos tabla y limpiamos solo lo necesario
      await cargarTabla();
      
      // Dejamos el selector limpio para el próximo, pero mantenemos fechas
      $("sel-operador").value = ""; 
      
      // Notificación suave en consola o alerta corta
      // alert("✅ Asignación guardada.");
    }
  };

  // 4. Borrar manual
  $("tabla-asignaciones").addEventListener("click", async (e) => {
    if(e.target.classList.contains("delete-btn")){
      if(confirm("¿Eliminar asignación?")) {
        await sb.from("usuarios_asignado").delete().eq("id", e.target.dataset.id);
        await cargarTabla();
      }
    }
  });

  // Inicio
  await initFormulario();
  await cargarTabla();
});