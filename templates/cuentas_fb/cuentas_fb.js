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
  const emailInput = document.getElementById("email");
  const contraInput = document.getElementById("contra");
  const nombreInput = document.getElementById("nombre");
  const estadoInput = document.getElementById("estado");
  const calidadInput = document.getElementById("calidad");

  const email = emailInput.value.trim();
  const contra = contraInput.value.trim();
  const nombre = nombreInput.value.trim();
  const estado = estadoInput.value;
  const calidad = calidadInput.value;

  if (!email || !contra || !nombre) {
    alert("Completá todos los campos");
    return;
  }

  const { error } = await supabase
    .from("cuentas_facebook")
    .insert([{
      email,
      contra,
      nombre,
      estado,
      calidad
    }]);

  if (error) {
    console.error(error);
    alert("Error al guardar la cuenta");
    return;
  }

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
