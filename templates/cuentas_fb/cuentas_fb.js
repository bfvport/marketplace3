// templates/cuentas_fb/cuentas_fb.js
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
const tbody = document.getElementById("cuentas_facebook"); // ✅ id real del tbody
let cuentaEditandoId = null;

async function cargarCuentas() {
  const { data, error } = await supabase
    .from("cuentas_facebook")
    .select("*")
    .order("id", { ascending: true });

  if (error) {
    console.error(error);
    alert("Error cargando cuentas: " + error.message);
    return;
  }

  tbody.innerHTML = "";

  data.forEach((cuenta) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${cuenta.id}</td>
      <td>${cuenta.email}</td>
      <td>${cuenta.estado}</td>
      <td>${cuenta.calidad}</td>
      <td>${cuenta.ocupada_por ?? "-"}</td>
      <td>
        <button class="btn-small edit" data-id="${cuenta.id}">Editar</button>
        <button class="btn-small danger" data-id="${cuenta.id}">Eliminar</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function openModal() {
  $("#modal-cuenta")?.classList.remove("hidden");
}
function closeModal() {
  $("#modal-cuenta")?.classList.add("hidden");
  cuentaEditandoId = null;
  $("#email").value = "";
  $("#contra").value = "";
  $("#nombre").value = "";
  $("#estado").value = "activo";
  $("#calidad").value = "caliente";
}

document.addEventListener("DOMContentLoaded", async () => {
  if (!tbody) {
    console.error("No existe tbody#cuentas_facebook");
    return;
  }

  supabase = await waitSupabaseClient(2000);
  if (!supabase) {
    alert("Supabase client no está inicializado (window.supabaseClient). Revisá assets/js/supabase.js");
    return;
  }

  await cargarCuentas();

  $("#btn-nueva").onclick = () => openModal();
  $("#cancelar").onclick = () => closeModal();

  $("#guardar").onclick = async () => {
    const email = $("#email").value.trim();
    const contra = $("#contra").value.trim();
    const nombre = $("#nombre").value.trim();
    const estado = $("#estado").value;
    const calidad = $("#calidad").value;

    if (!email || !contra || !nombre) {
      alert("Completá todos los campos");
      return;
    }

    let error;
    if (cuentaEditandoId) {
      ({ error } = await supabase
        .from("cuentas_facebook")
        .update({ email, contra, nombre, estado, calidad })
        .eq("id", cuentaEditandoId));
    } else {
      ({ error } = await supabase
        .from("cuentas_facebook")
        .insert([{ email, contra, nombre, estado, calidad }]));
    }

    if (error) {
      console.error(error);
      alert("Error al guardar: " + error.message);
      return;
    }

    closeModal();
    await cargarCuentas();
  };

  tbody.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    const id = btn.dataset.id;
    if (!id) return;

    if (btn.classList.contains("danger")) {
      if (!confirm("¿Eliminar esta cuenta Facebook?")) return;

      const { error } = await supabase
        .from("cuentas_facebook")
        .delete()
        .eq("id", id);

      if (error) {
        console.error(error);
        alert("No se pudo eliminar: " + error.message);
        return;
      }

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
        console.error(error);
        alert("Error cargando la cuenta: " + error.message);
        return;
      }

      $("#email").value = data.email ?? "";
      $("#contra").value = data.contra ?? "";
      $("#nombre").value = data.nombre ?? "";
      $("#estado").value = data.estado ?? "activo";
      $("#calidad").value = data.calidad ?? "caliente";

      cuentaEditandoId = id;
      openModal();
    }
  });
});
