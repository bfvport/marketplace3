import { requireSession, loadSidebar } from "../../assets/js/app.js";

const s = requireSession();

// si entra operador, lo mandamos al de operador
if (s?.rol !== "gerente") {
  location.href = "../calentamiento/calentamiento.html";
}

// MISMO sidebar de siempre
await loadSidebar({ activeKey: "calentamiento", basePath: "../" });

function $(id) {
  const el = document.getElementById(id);
  if (!el) console.warn("Falta:", id);
  return el;
}

const estado = $("estado");
const guardar = $("btn-guardar");
const generar = $("btn-generar");

guardar?.addEventListener("click", () => {
  estado.textContent = "💾 Guardado (simulado).";
});

generar?.addEventListener("click", () => {
  estado.textContent = "🎲 Plan 7 días generado (simulado).";
  $("contenedor-plan").innerHTML = "<b>Plan generado correctamente.</b>";
});

estado.textContent = "✅ Calentamiento de gerencia cargado.";
