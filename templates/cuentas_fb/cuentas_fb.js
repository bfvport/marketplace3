import {
  requireSession, loadSidebar
} from "../../assets/js/app.js";

const s = requireSession();
await loadSidebar({ activeKey: "cuentas_fb", basePath: "../" });

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
  const { data, error } = await supabase
    .from("usuarios")
    .select("usuario")
    .neq("rol", "gerente");

  if (error) {
    alert("Error cargando operadores");
    console.error(error);
    return;
  }

  const select = $("#ocupada_por");
  select.innerHTML = `<option value="">Libre</option>`;

  data.forEach(u => {
    select.innerHTML += `<option value="${u.usuario}">${u.usuario}</option>`;
  });
}

/* ===============================
   CARGAR CUENTAS
================================ */
async function cargarCuentas() {
  const { data, error } = await supabase
    .from("cuentas_facebook")
    .select("*")
    .order("id");

  if (error) {
    alert("Error cargando cuentas");
    console.error(error);
    return;
  }

  tbody.innerHTML = "";

  data.forEach(cuenta => {
    const estadoBadge = `<span class="badge ${cuenta.estado}">${cuenta.estado}</span>`;
    const calidadBadge = `<span class="badge ${cuenta.calidad}">${cuenta.calidad}</span>`;

    const ocupada = cuenta.ocupada_por
      ? `<span class="badge activo">Ocupada</span><br><small>${cuenta.ocupada_por}</small>`
      : `<span class="badge inactivo">Libre</span>`;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${cuenta.id}</td>
      <td>${cuenta.email}</td>
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

  $("#email").value = "";
  $("#contra").value = "";
  $("#nombre").value = "";
  $("#estado").value = "activo";
  $("#calidad").value = "caliente";
  $("#ocupada_por").value = "";
}

/* ===============================
   INIT
================================ */
document.addEventListener("DOMContentLoaded", async () => {
  supabase = await waitSupabaseClient();
  if (!supabase) {
    alert("Supabase no inicializado");
    return;
  }

  await cargarOperadores();
  await cargarCuentas();

  $("#btn-nueva").onclick = openModal;
  $("#cancelar").onclick = closeModal;

  $("#guardar").onclick = async () => {
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

    let error;
    if (cuentaEditandoId) {
      ({ error } = await supabase
        .from("cuentas_facebook")
        .update(payload)
        .eq("id", cuentaEditandoId));
    } else {
      ({ error } = await supabase
        .from("cuentas_facebook")
        .insert(payload));
    }

    if (error) {
      alert("Error guardando cuenta");
      console.error(error);
      return;
    }

    closeModal();
    await cargarCuentas();
  };

  tbody.onclick = async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    const id = btn.dataset.id;

    if (btn.classList.contains("danger")) {
      if (!confirm("¿Eliminar esta cuenta Facebook?")) return;
      await supabase.from("cuentas_facebook").delete().eq("id", id);
      await cargarCuentas();
      return;
    }

    if (btn.classList.contains("edit")) {
      const { data, error } = await supabase
        .from("cuentas_facebook")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        alert("Error cargando cuenta");
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
