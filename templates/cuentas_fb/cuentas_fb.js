// templates/cuentas_fb/cuentas_fb.js

const supabase = window.supabaseClient;

const tabla = document.getElementById("tabla-cuentas");

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
        <button class="btn-small">Editar</button>
        <button class="btn-small danger">Eliminar</button>
      </td>
    `;

    tabla.appendChild(tr);
  });
}

cargarCuentas();
