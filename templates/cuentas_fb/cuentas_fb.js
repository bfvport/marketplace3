const $ = (sel) => document.querySelector(sel);

async function waitSupabaseClient(timeoutMs = 2000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (window.supabaseClient) return window.supabaseClient;
    await new Promise(r => setTimeout(r, 50));
  }
  return null;
}

let supabase = null;
const tbody = document.getElementById("cuentas_facebook");
let cuentaEditandoId = null;

/* ===============================
   CARGAR OPERADORES
================================ */
async function cargarOperadores() {
  // Protección: Si supabase falló, no seguimos
  if (!supabase) return;

  const { data, error } = await supabase
    .from("usuarios")
    .select("usuario")
    .neq("rol", "gerente");

  if (error) {
    console.error("❌ Error operadores:", error);
    return; // No alertamos para no molestar, pero queda en consola
  }

  const select = $("#ocupada_por");
  if (!select) return; // Protección por si no existe el modal
  
  select.innerHTML = `<option value="">Libre</option>`;

  // 🛡️ CORRECCIÓN CLAVE: Usamos (data || []) para evitar error si es null
  (data || []).forEach(u => {
    select.innerHTML += `<option value="${u.usuario}">${u.usuario}</option>`;
  });
}

/* ===============================
   CARGAR CUENTAS (Aquí estaba el problema)
================================ */
async function cargarCuentas() {
  if (!supabase) return;

  const { data, error } = await supabase
    .from("cuentas_facebook")
    .select("*")
    .order("id", { ascending: true });

  if (error) {
    alert("❌ Error de conexión: " + error.message);
    console.error(error);
    return;
  }

  tbody.innerHTML = "";

  // 🛡️ Si data es null, usamos lista vacía para que no se rompa el JS
  const cuentas = data || [];

  if (cuentas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px;">No hay cuentas cargadas (o no llegan los datos)</td></tr>`;
    return;
  }

  cuentas.forEach(cuenta => {
    // Badges con colores seguros
    const estadoClass = cuenta.estado === 'activo' ? 'success' : 'danger'; 
    const estadoBadge = `<span class="badge ${cuenta.estado}">${cuenta.estado}</span>`;
    
    // Validamos que calidad exista
    const calidad = cuenta.calidad || '-';
    const calidadBadge = `<span class="badge ${calidad}">${calidad}</span>`;

    const ocupada = cuenta.ocupada_por
      ? `<span class="badge warning">Ocupada</span><br><small>${cuenta.ocupada_por}</small>`
      : `<span class="badge success">Libre</span>`;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${cuenta.id}</td>
      <td>${cuenta.email || 'Sin email'}</td>
      <td>${estadoBadge}</td>
      <td>${calidadBadge}</td>
      <td>${ocupada}</td>
      <td>
        <button class="btn edit" data-id="${cuenta.id}">Editar</button>
        <button class="btn danger" data-id="${cuenta.id}">Eliminar</button>
      </td>
    `;

    tbody.appendChild(tr);
  });
}

/* ===============================
   MODAL
================================ */
function openModal() {
  const m = $("#modal-cuenta");
  if(m) m.classList.remove("hidden");
}

function closeModal() {
  const m = $("#modal-cuenta");
  if(m) m.classList.add("hidden");
  
  cuentaEditandoId = null;
  if($("#email")) $("#email").value = "";
  if($("#contra")) $("#contra").value = "";
  if($("#nombre")) $("#nombre").value = "";
  if($("#estado")) $("#estado").value = "activo";
  if($("#calidad")) $("#calidad").value = "caliente";
  if($("#ocupada_por")) $("#ocupada_por").value = "";
}

/* ===============================
   INIT
================================ */
document.addEventListener("DOMContentLoaded", async () => {
  // 1. Intentamos conectar
  supabase = await waitSupabaseClient();
  
  if (!supabase) {
    // Si falla, mostramos alerta y detenemos todo
    alert("🚨 Error Crítico: No se pudo conectar con Supabase. Revisa supabase.js");
    return;
  }

  // 2. Cargamos datos
  console.log("✅ Supabase conectado. Cargando datos...");
  await cargarOperadores();
  await cargarCuentas();

  // 3. Eventos botones
  if($("#btn-nueva")) $("#btn-nueva").onclick = openModal;
  if($("#cancelar")) $("#cancelar").onclick = closeModal;

  if($("#guardar")) $("#guardar").onclick = async () => {
    const payload = {
      email: $("#email").value.trim(),
      contra: $("#contra").value.trim(),
      nombre: $("#nombre").value.trim(),
      estado: $("#estado").value,
      calidad: $("#calidad").value,
      ocupada_por: $("#ocupada_por").value || null
    };

    if (!payload.email || !payload.contra || !payload.nombre) {
      alert("Completá todos los campos");
      return;
    }

    let errorOp;
    if (cuentaEditandoId) {
      const res = await supabase.from("cuentas_facebook").update(payload).eq("id", cuentaEditandoId);
      errorOp = res.error;
    } else {
      const res = await supabase.from("cuentas_facebook").insert(payload);
      errorOp = res.error;
    }

    if (errorOp) {
      alert("Error guardando: " + errorOp.message);
      return;
    }

    closeModal();
    await cargarCuentas();
  };

  tbody.onclick = async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    const id = btn.dataset.id;

    // ELIMINAR
    if (btn.classList.contains("danger")) {
      if (!confirm("¿Eliminar esta cuenta Facebook?")) return;
      await supabase.from("cuentas_facebook").delete().eq("id", id);
      await cargarCuentas();
      return;
    }

    // EDITAR
    if (btn.classList.contains("edit")) {
      const { data, error } = await supabase
        .from("cuentas_facebook")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        alert("Error cargando cuenta: " + error.message);
        return;
      }

      $("#email").value = data.email ?? "";
      $("#contra").value = data.contra ?? "";
      $("#nombre").value = data.nombre ?? "";
      $("#estado").value = data.estado ?? "activo";
      $("#calidad").value = data.calidad ?? "caliente";
      $("#ocupada_por").value = data.ocupada_por ?? "";

      cuentaEditandoId = id;
      openModal();
    }
  };
});