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

// Cargamos la sesión desde el almacenamiento local [cite: 5]
const session = JSON.parse(localStorage.getItem("mp_session_v1") || "{}");

async function cargarCuentas() {
  if (!supabase || !session.usuario) return;

  // 🛡️ FILTRO INTELIGENTE: El gerente ve todo, el operador solo lo suyo 
  let query = supabase.from("cuentas_facebook").select("*");

  if (session.rol !== "gerente") {
    query = query.eq("ocupada_por", session.usuario);
  }

  const { data, error } = await query.order("id", { ascending: true });

  if (error) {
    console.error("Error:", error);
    return;
  }

  tbody.innerHTML = "";
  const cuentas = data || [];

  if (cuentas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:20px;">No tenés cuentas asignadas actualmente.</td></tr>`;
    return;
  }

  cuentas.forEach(cuenta => {
    const tr = document.createElement("tr");
    
    // Definimos los badges de estado y calidad [cite: 17]
    const estadoBadge = `<span class="badge ${cuenta.estado}">${cuenta.estado}</span>`;
    const calidadBadge = `<span class="badge ${cuenta.calidad || 'frio'}">${cuenta.calidad || 'frio'}</span>`;
    const ocupada = cuenta.ocupada_por 
      ? `<span class="badge activo">Ocupada</span><br><small>${cuenta.ocupada_por}</small>` 
      : `<span class="badge inactivo">Libre</span>`;

    tr.innerHTML = `
      <td>${cuenta.id}</td>
      <td><strong>${cuenta.nombre || ''}</strong><br><small class="muted">${cuenta.email}</small></td>
      <td style="font-family: monospace; color: #e2e8f0;">${cuenta.contra || '****'}</td> <td style="color: #60a5fa; font-weight: bold;">${cuenta.two_fa || '-'}</td>         <td>${estadoBadge}</td>
      <td>${calidadBadge}</td>
      <td>${ocupada}</td>
      <td>
        <button class="btn edit" data-id="${cuenta.id}">Editar</button>
        ${session.rol === 'gerente' ? `<button class="btn danger" data-id="${cuenta.id}">Eliminar</button>` : ''}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Carga de operadores para el gerente [cite: 12]
async function cargarOperadores() {
  if (session.rol !== "gerente") return;
  const { data, error } = await supabase.from("usuarios").select("usuario").neq("rol", "gerente");
  const select = $("#ocupada_por");
  if (!select) return;
  select.innerHTML = `<option value="">Libre</option>`;
  (data || []).forEach(u => {
    select.innerHTML += `<option value="${u.usuario}">${u.usuario}</option>`;
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  supabase = await waitSupabaseClient();
  if (!supabase) return;

  await cargarCuentas();
  
  if (session.rol === "gerente") {
    await cargarOperadores();
    $("#btn-nueva").onclick = () => $("#modal-cuenta").classList.remove("hidden");
  } else {
    // Si es operador, ocultamos el botón de crear cuentas
    if ($("#btn-nueva")) $("#btn-nueva").style.display = "none";
  }

  // Lógica de cerrar modal [cite: 19]
  $("#cancelar").onclick = () => $("#modal-cuenta").classList.add("hidden");

  // Lógica de la tabla (Editar/Eliminar) [cite: 26, 27, 28]
  tbody.onclick = async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const id = btn.dataset.id;

    if (btn.classList.contains("danger")) {
      if (!confirm("¿Eliminar esta cuenta?")) return;
      await supabase.from("cuentas_facebook").delete().eq("id", id);
      await cargarCuentas();
    }

    if (btn.classList.contains("edit")) {
      const { data } = await supabase.from("cuentas_facebook").select("*").eq("id", id).single();
      $("#email").value = data.email || "";
      $("#contra").value = data.contra || "";
      $("#nombre").value = data.nombre || "";
      $("#estado").value = data.estado || "activo";
      $("#calidad").value = data.calidad || "caliente";
      $("#ocupada_por").value = data.ocupada_por || "";
      cuentaEditandoId = id;
      $("#modal-cuenta").classList.remove("hidden");
    }
  };
});