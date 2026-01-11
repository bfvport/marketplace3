import { requireSession, loadSidebar } from "../../assets/js/app.js";

const s = requireSession();

await loadSidebar({ activeKey: "dashboard", basePath: "../" });

document.getElementById("hello").textContent =
  `Usuario: ${s.usuario} | Rol: ${s.rol}`;

if (s.rol === "gerente") {
  document.getElementById("gerenteBox").style.display = "block";
}
