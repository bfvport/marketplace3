import { requireSession, loadSidebar } from "../../assets/js/app.js";

const s = requireSession();

// si entra gerente, lo mandamos al de gerente
if (s?.rol === "gerente") {
  location.href = "../calentamiento_gerente/calentamiento_gerente.html";
}

// SIEMPRE el mismo sidebar
await loadSidebar({ activeKey: "calentamiento", basePath: "../" });

const estado = document.getElementById("estado");
const contenedor = document.getElementById("contenedor-calentamiento");
const btn = document.getElementById("btn-recargar");

btn?.addEventListener("click", cargar);

function cargar() {
  estado.textContent = "✅ Calentamiento del operador cargado.";
  contenedor.innerHTML = `
    <div class="card">
      <b>Esto es el calentamiento del operador.</b><br>
      Si estás viendo esto y el sidebar está, GANAMOS.
    </div>
  `;
}

cargar();
