import { requireSession, loadSidebar, nowISO } from "../../assets/js/app.js";

const $ = (id) => document.getElementById(id);

async function waitSupabase() {
  while (!window.supabaseClient) await new Promise(r => setTimeout(r, 50));
  return window.supabaseClient;
}

document.addEventListener("DOMContentLoaded", async () => {
  const sb = await waitSupabase();
  const session = requireSession();

  // 🛡️ Solo Gerentes
  if (session.rol !== "gerente") {
    alert("Solo acceso gerencial.");
    window.location.href = "/templates/dashboard/dashboard.html";
    return;
  }

  await loadSidebar({ activeKey: "asignaciones", basePath: "../" });

  // 1. Cargar Combos (Selects)
  async function cargarDatos() {
    // Operadores
    const { data: ops } = await sb.from("usuarios").select("usuario").eq("rol", "operador");
    const selOp = $("sel-operador");
    selOp.innerHTML = '<option value="">Seleccionar Operador...</option>';
    // Opción para asignar a TODOS (como pedía el mensaje)
    selOp.innerHTML += '<option value="TODOS">-- TODOS LOS OPERADORES --</option>';
    ops.forEach(u => selOp.innerHTML += `<option value="${u.usuario}">${u.usuario}</option>`);

    // Categorías (Ya las tienes creadas)
    const { data: cats } = await sb.from("categoria").select("nombre").order("nombre");
    const selCat = $("sel-categoria");
    selCat.innerHTML = '<option value="">Seleccionar Categoría...</option>';
    cats.forEach(c => selCat.innerHTML += `<option value="${c.nombre}">${c.nombre}</option>`);
  }

  // 2. Cargar Tabla de Asignaciones
  async function cargarTabla() {
    const { data } = await sb
      .from("usuarios_asignado")
      .select("*")
      .order("id", { ascending: false }); // Las más nuevas arriba

    const tbody = $("tabla-asignaciones");
    tbody.innerHTML = "";
    
    if(!data || data.length === 0) {
      tbody.innerHTML = "<tr><td colspan='5' class='muted'>No hay asignaciones activas.</td></tr>";
      return;
    }

    data.forEach(a => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td style="font-weight:bold; color:#fff;">${a.usuario}</td>
        <td><span class="badge" style="background:#8b5cf6; color:white;">${a.categoria}</span></td>
        <td class="muted" style="font-size:0.9rem;">${a.fecha_desde} <br> ${a.fecha_hasta}</td>
        <td style="font-family:monospace;">
           M:${a.marketplace_daily} | G:${a.grupos_daily} | H:${a.historia_daily} | Mu:${a.muro_daily}
        </td>
        <td><button class="btn2 delete-btn" data-id="${a.id}" style="color:#ef4444; border-color:#ef4444;">Borrar</button></td>
      `;
      tbody.appendChild(tr);
    });
  }

  // 3. Guardar Asignación
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
      return alert("Por favor completa Operador, Categoría y Fechas.");
    }

    const payload = {
      categoria: categoria,
      fecha_desde: fDesde,
      fecha_hasta: fHasta,
      marketplace_daily: mkp,
      grupos_daily: grp,
      historia_daily: hist,
      muro_daily: muro,
      asignado_por: session.usuario,
      updated_at: nowISO()
    };

    // Lógica para "TODOS" o "Uno solo"
    let inserts = [];
    if (operador === "TODOS") {
      // Buscamos todos los operadores reales
      const { data: todos } = await sb.from("usuarios").select("usuario").eq("rol", "operador");
      inserts = todos.map(u => ({ ...payload, usuario: u.usuario }));
    } else {
      inserts = [{ ...payload, usuario: operador }];
    }

    const { error } = await sb.from("usuarios_asignado").insert(inserts);

    if (error) alert("Error: " + error.message);
    else {
      alert("¡Tarea asignada correctamente!");
      await cargarTabla();
    }
  };

  // 4. Borrar
  $("tabla-asignaciones").addEventListener("click", async (e) => {
    if(e.target.classList.contains("delete-btn")){
      if(confirm("¿Eliminar asignación?")) {
        await sb.from("usuarios_asignado").delete().eq("id", e.target.dataset.id);
        await cargarTabla();
      }
    }
  });

  // Init
  await cargarDatos();
  await cargarTabla();
});