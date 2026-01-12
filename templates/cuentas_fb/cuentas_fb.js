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
const session = JSON.parse(localStorage.getItem("mp_session_v1") || "{}");

async function cargarCuentas() {
  if (!supabase || !session.usuario) return;

  let query = supabase.from("cuentas_facebook").select("*");
  if (session.rol !== "gerente") {
    query = query.eq("ocupada_por", session.usuario);
  }

  const { data, error } = await query.order("id", { ascending: true });
  if (error) return console.error(error);

  tbody.innerHTML = "";
  (data || []).forEach(cuenta => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${cuenta.id}</td>
      <td><strong>${cuenta.nombre || ''}</strong><br><small class="muted">${cuenta.email}</small></td>
      <td style="font-family: monospace;">${cuenta.contra || '****'}</td>
      <td style="color: #60a5fa; font-weight: bold;">${cuenta.two_fa || '-'}</td>
      <td><span class="badge ${cuenta.estado}">${cuenta.estado}</span></td>
      <td><span class="badge ${cuenta.calidad || 'frio'}">${cuenta.calidad || 'frio'}</span></td>
      <td>${cuenta.ocupada_por ? `<span class="badge activo">Ocupada por ${cuenta.ocupada_por}</span>` : `<span class="badge inactivo">Libre</span>`}</td>
      <td>
        <button class="btn edit" data-id="${cuenta.id}">Editar</button>
        ${session.rol === 'gerente' ? `<button class="btn danger" data-id="${cuenta.id}">Eliminar</button>` : ''}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function cargarOperadores() {
  if (session.rol !== "gerente") return;
  const { data } = await supabase.from("usuarios").select("usuario").neq("rol", "gerente");
  const select = $("#ocupada_por");
  if (!select) return;
  select.innerHTML = `<option value="">Libre</option>`;
  (data || []).forEach(u => { select.innerHTML += `<option value="${u.usuario}">${u.usuario}</option>`; });
}

function closeModal() {
  $("#modal-cuenta").classList.add("hidden");
  cuentaEditandoId = null;
  // Limpiamos ABSOLUTAMENTE TODO el formulario
  $("#email").value = "";
  $("#contra").value = "";
  $("#nombre").value = "";
  $("#two_fa").value = ""; 
  $("#estado").value = "activo";
  $("#calidad").value = "caliente";
  $("#ocupada_por").value = "";
}

document.addEventListener("DOMContentLoaded", async () => {
  supabase = await waitSupabaseClient();
  if (!supabase) return;

  await cargarCuentas();
  if (session.rol === "gerente") {
    await cargarOperadores();
    $("#btn-nueva").onclick = () => { closeModal(); $("#modal-cuenta").classList.remove("hidden"); };
  } else if ($("#btn-nueva")) {
    $("#btn-nueva").style.display = "none";
  }

  $("#cancelar").onclick = closeModal;

  $("#guardar").onclick = async () => {
    // 📦 CAPTURAMOS TODO: Los datos viejos + el 2FA nuevo
    const payload = {
      email: $("#email").value.trim(),
      contra: $("#contra").value.trim(),
      nombre: $("#nombre").value.trim(),
      two_fa: $("#two_fa").value.trim(), // <--- 2FA Incluido
      estado: $("#estado").value,
      calidad: $("#calidad").value,
      ocupada_por: $("#ocupada_por").value || null
    };

    if (!payload.email || !payload.contra) {
      alert("Email y Contraseña son obligatorios");
      return;
    }

    const { error } = cuentaEditandoId 
      ? await supabase.from("cuentas_facebook").update(payload).eq("id", cuentaEditandoId)
      : await supabase.from("cuentas_facebook").insert([payload]);

    if (error) alert("Error: " + error.message);
    else { closeModal(); await cargarCuentas(); }
  };

  tbody.onclick = async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const id = btn.dataset.id;

    if (btn.classList.contains("danger")) {
      if (confirm("¿Eliminar cuenta?")) {
        await supabase.from("cuentas_facebook").delete().eq("id", id);
        await cargarCuentas();
      }
    }

    if (btn.classList.contains("edit")) {
      const { data } = await supabase.from("cuentas_facebook").select("*").eq("id", id).single();
      // 📝 CARGAMOS TODO al formulario para editar
      $("#email").value = data.email || "";
      $("#contra").value = data.contra || "";
      $("#nombre").value = data.nombre || "";
      $("#two_fa").value = data.two_fa || "";
      $("#estado").value = data.estado || "activo";
      $("#calidad").value = data.calidad || "caliente";
      $("#ocupada_por").value = data.ocupada_por || "";
      cuentaEditandoId = id;
      $("#modal-cuenta").classList.remove("hidden");
    }
  };
});