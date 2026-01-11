const $ = (sel) => document.querySelector(sel);

// Función de espera robusta para conectar con Supabase
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
  if (!supabase) return;

  const { data, error } = await supabase
    .from("usuarios")
    .select("usuario")
    .neq("rol", "gerente");

  if (error) {
    console.error("Error operadores:", error);
    return;
  }

  const select = $("#ocupada_por");
  if (select) {
    select.innerHTML = `<option value="">Libre</option>`;
    // Protección contra nulos (data || [])
    (data || []).forEach(u => {
      select.innerHTML += `<option value="${u.usuario}">${u.usuario}</option>`;
    });
  }
}

/* ===============================
   CARGAR CUENTAS (Mejorado)
================================ */
async function cargarCuentas() {
  if (!supabase) return;

  const { data, error } = await supabase
    .from("cuentas_facebook")
    .select("*")
    .order("id", { ascending: true });

  if (error) {
    console.error("Error cuentas:", error);
    alert("Error cargando cuentas: " + error.message);
    return;
  }

  tbody.innerHTML = "";
  const cuentas = data || []; // 🛡️ Evita que se rompa si es null

  if (cuentas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:15px; opacity:0.7;">No hay cuentas cargadas todavía.</td></tr>`;
    return;
  }

  cuentas.forEach(cuenta => {
    // Badges con clases seguras
    const estadoClass = cuenta.estado === 'activo' ? 'activo' : 'inactivo';
    const calidadClass = cuenta.calidad === 'caliente' ? 'caliente' : 'frio';

    const estadoBadge = `<span class="badge ${estadoClass}">${cuenta.estado}</span>`;
    const calidadBadge = `<span class="badge ${calidadClass}">${cuenta.calidad || '-'}</span>`;

    const ocupada = cuenta.ocupada_por
      ? `<span class="badge warning">Ocupada</span><br><small>${cuenta.ocupada_por}</small>`
      : `<span class="badge success">Libre</span>`;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${cuenta.id}</td>
      <td title="${cuenta.email}">${cuenta.email}</td>
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
  $("#modal-cuenta").classList.remove("hidden");
}

function closeModal() {
  $("#modal-cuenta").classList.add("hidden");
  cuentaEditandoId = null;

  // Limpiamos form
  $("#email").value = "";
  $("#contra").value = "";
  $("#nombre").value = "";
  $("#estado").value = "activo";
  $("#calidad").value = "caliente";
  $("#ocupada_por").value = "";
}

/* ===============================
   INIT (Arranque)
================================ */
document.addEventListener("DOMContentLoaded", async () => {
  // 1. Conectar
  supabase = await waitSupabaseClient();
  
  if (!supabase) {
    console.error("Supabase no inicializado en window.");
    return;
  }

  // 2. Cargar datos iniciales
  await cargarOperadores();
  await cargarCuentas();

  // 3. Configurar botones
  const btnNueva = $("#btn-nueva");
  if (btnNueva) btnNueva.onclick = openModal;
  
  const btnCancelar = $("#cancelar");
  if (btnCancelar) btnCancelar.onclick = closeModal;

  // 4. Guardar (Crear / Editar)
  const btnGuardar = $("#guardar");
  if (btnGuardar) {
    btnGuardar.onclick = async () => {
      const payload = {
        email: $("#email").value.trim(),
        contra: $("#contra").value.trim(),
        nombre: $("#nombre").value.trim(),
        estado: $("#estado").value,
        calidad: $("#calidad").value,
        ocupada_por: $("#ocupada_por").value || null
      };

      if (!payload.email || !payload.contra || !payload.nombre) {
        alert("Completá todos los campos obligatorios");
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
        alert("Error al guardar: " + errorOp.message);
        return;
      }

      closeModal();
      await cargarCuentas();
    };
  }

  // 5. Acciones en la tabla (Delegación de eventos)
  tbody.onclick = async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    const id = btn.dataset.id;

    // -- Eliminar --
    if (btn.classList.contains("danger")) {
      if (!confirm("¿Seguro que querés eliminar esta cuenta?")) return;
      const { error } = await supabase.from("cuentas_facebook").delete().eq("id", id);
      if (error) alert("No se pudo eliminar: " + error.message);
      else await cargarCuentas();
    }

    // -- Editar --
    if (btn.classList.contains("edit")) {
      const { data, error } = await supabase
        .from("cuentas_facebook")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        alert("No se pudo cargar la cuenta.");
        return;
      }

      $("#email").value = data.email || "";
      $("#contra").value = data.contra || "";
      $("#nombre").value = data.nombre || "";
      $("#estado").value = data.estado || "activo";
      $("#calidad").value = data.calidad || "caliente";
      $("#ocupada_por").value = data.ocupada_por || "";

      cuentaEditandoId = id;
      openModal();
    }
  };
});