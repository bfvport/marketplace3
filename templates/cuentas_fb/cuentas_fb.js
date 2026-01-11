// templates/cuentas_fb/cuentas_fb.js

const supabase = window.supabaseClient;

const tabla = document.getElementById("tabla-cuentas");
let cuentaEditandoId = null;

async function cargarCuentas() {
  const { data, error } = await supabase
    .from("cuentas_facebook")
    .select("*")
    .order("id", { ascending: true });

  if (error) {
    console.error(error);
    alert("Error cargando cuentas");
    return;
  }

  tabla.innerHTML = "";

  data.forEach(cuenta => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
  <td>${cuenta.id}</td>
  <td>${cuenta.email}</td>
  <td>${cuenta.estado}</td>
  <td>${cuenta.calidad}</td>
  <td>${cuenta.ocupada_por ?? "-"}</td>
  <td>
    <button class="btn-small edit" data-id="${cuenta.id}">Editar</button>

    <button class="btn-small danger" data-id="${cuenta.id}"> Eliminar </button>
  </td>
`;


    tabla.appendChild(tr);
  });
}

cargarCuentas();

document.getElementById("btn-nueva").onclick = () => {
  document.getElementById("modal-cuenta").classList.remove("hidden");
};

document.getElementById("cancelar").onclick = () => {
  document.getElementById("modal-cuenta").classList.add("hidden");
};

document.getElementById("guardar").onclick = async () => {
  const email = document.getElementById("email").value.trim();
  const contra = document.getElementById("contra").value.trim();
  const nombre = document.getElementById("nombre").value.trim();
  const estado = document.getElementById("estado").value;
  const calidad = document.getElementById("calidad").value;

  if (!email || !contra || !nombre) {
    alert("Completá todos los campos");
    return;
  }

  let error;

  if (cuentaEditandoId) {
    // UPDATE
    ({ error } = await supabase
      .from("cuentas_facebook")
      .update({
        email,
        contra,
        nombre,
        estado,
        calidad
      })
      .eq("id", cuentaEditandoId));
  } else {
    // INSERT
    ({ error } = await supabase
      .from("cuentas_facebook")
      .insert([{
        email,
        contra,
        nombre,
        estado,
        calidad
      }]));
  }

  if (error) {
    console.error(error);
    alert("Error al guardar");
    return;
  }

  cuentaEditandoId = null;
  document.getElementById("modal-cuenta").classList.add("hidden");
  cargarCuentas();
};

tabla.addEventListener("click", async (e) => {
  if (!e.target.classList.contains("danger")) return;

  const id = e.target.dataset.id;
  if (!id) return;

  const ok = confirm("¿Eliminar esta cuenta Facebook?");
  if (!ok) return;

  const { error } = await supabase
    .from("cuentas_facebook")
    .delete()
    .eq("id", id);

  if (error) {
    console.error(error);
    alert("No se pudo eliminar");
    return;
  }

  cargarCuentas();
});
tabla.addEventListener("click", async (e) => {
  if (!e.target.classList.contains("edit")) return;

  const id = e.target.dataset.id;
  if (!id) return;

  const { data, error } = await supabase
    .from("cuentas_facebook")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error(error);
    alert("Error cargando la cuenta");
    return;
  }

  // cargar datos en el modal
  document.getElementById("email").value = data.email;
  document.getElementById("contra").value = data.contra;
  document.getElementById("nombre").value = data.nombre;
  document.getElementById("estado").value = data.estado;
  document.getElementById("calidad").value = data.calidad;

  cuentaEditandoId = id;

  document.getElementById("modal-cuenta").classList.remove("hidden");
});
