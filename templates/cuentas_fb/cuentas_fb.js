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
const session = JSON.parse(localStorage.getItem("mp_session_v1") || "{}");
let cuentaEditandoId = null;

async function cargarCuentas() {
  if (!supabase || !session.usuario) return;

  let query = supabase.from("cuentas_facebook").select("*");
  
  // 🛡️ FILTRO: El operador solo ve lo asignado a él
  if (session.rol !== "gerente") {
    query = query.eq("ocupada_por", session.usuario);
  }

  const { data, error } = await query.order("id", { ascending: true });
  if (error) return console.error(error);

  tbody.innerHTML = "";
  const cuentas = data || [];

  if (cuentas.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:20px;">No hay cuentas asignadas para mostrar.</td></tr>`;
    return;
  }

  cuentas.forEach(cuenta => {
    const textoBoton = session.rol === 'gerente' ? 'Editar' : 'Ver datos';
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${cuenta.id}</td>
      <td><strong>${cuenta.nombre || ''}</strong><br><small>${cuenta.email}</small></td>
      <td style="font-family: monospace;">${cuenta.contra || '****'}</td>
      <td style="color: #60a5fa; font-weight: bold;">${cuenta.two_fa || '-'}</td>
      <td><span class="badge ${cuenta.estado}">${cuenta.estado}</span></td>
      <td><span class="badge ${cuenta.calidad || 'frio'}">${cuenta.calidad || 'frio'}</span></td>
      <td>${cuenta.ocupada_por ? `<span class="badge activo">Asignada</span>` : `<span class="badge inactivo">Libre</span>`}</td>
      <td>
        <button class="btn edit" data-id="${cuenta.id}">${textoBoton}</button>
        ${session.rol === 'gerente' ? `<button class="btn danger" data-id="${cuenta.id}">Eliminar</button>` : ''}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function openModal(data = null) {
  const m = $("#modal-cuenta");
  m.classList.remove("hidden");
  const esGerente = session.rol === "gerente";

  // Bloqueamos inputs si es operador
  ["#email", "#contra", "#nombre", "#two_fa"].forEach(id => $(id).readOnly = !esGerente);
  ["#estado", "#calidad", "#ocupada_por"].forEach(id => $(id).disabled = !esGerente);
  $("#guardar").style.display = esGerente ? "block" : "none";

  if (data) {
    $("#email").value = data.email || "";
    $("#contra").value = data.contra || "";
    $("#nombre").value = data.nombre || "";
    $("#two_fa").value = data.two_fa || "";
    $("#estado").value = data.estado || "activo";
    $("#calidad").value = data.calidad || "caliente";
    $("#ocupada_por").value = data.ocupada_por || "";
    cuentaEditandoId = data.id;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  supabase = await waitSupabaseClient();
  if (!supabase) return;

  await cargarCuentas();

  if (session.rol === "gerente") {
    const { data } = await supabase.from("usuarios").select("usuario").eq("rol", "operador");
    const sel = $("#ocupada_por");
    if(sel){
      sel.innerHTML = `<option value="">Libre</option>`;
      (data || []).forEach(u => sel.innerHTML += `<option value="${u.usuario}">${u.usuario}</option>`);
    }
    $("#btn-nueva").onclick = () => { cuentaEditandoId = null; openModal(); };
  } else if ($("#btn-nueva")) {
    $("#btn-nueva").style.display = "none";
  }

  $("#cancelar").onclick = () => $("#modal-cuenta").classList.add("hidden");

  $("#guardar").onclick = async () => {
    if (session.rol !== "gerente") return;
    const payload = {
      email: $("#email").value.trim(), contra: $("#contra").value.trim(),
      nombre: $("#nombre").value.trim(), two_fa: $("#two_fa").value.trim(),
      estado: $("#estado").value, calidad: $("#calidad").value,
      ocupada_por: $("#ocupada_por").value || null
    };
    const { error } = cuentaEditandoId 
      ? await supabase.from("cuentas_facebook").update(payload).eq("id", cuentaEditandoId)
      : await supabase.from("cuentas_facebook").insert([payload]);
    
    if (!error) { $("#modal-cuenta").classList.add("hidden"); await cargarCuentas(); }
  };

  tbody.onclick = async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    if (btn.classList.contains("edit")) {
      const { data } = await supabase.from("cuentas_facebook").select("*").eq("id", btn.dataset.id).single();
      openModal(data);
    }
    if (btn.classList.contains("danger") && confirm("¿Eliminar?")) {
      await supabase.from("cuentas_facebook").delete().eq("id", btn.dataset.id);
      await cargarCuentas();
    }
  };
});