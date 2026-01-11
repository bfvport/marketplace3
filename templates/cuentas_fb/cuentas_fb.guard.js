// cuentas_fb.guard.js
// Acceso total SOLO para GERENTE a cuentas_facebook

(function () {

  // === 1. Datos de sesión ===
  const usuario = localStorage.getItem("usuario");
  const rol = localStorage.getItem("rol");

  // === 2. Validación dura ===
  if (!usuario || !rol) {
    alert("Sesión no válida. Inicie sesión nuevamente.");
    window.location.href = "../login/login.html";
    return;
  }

  if (rol !== "gerente") {
    alert("Acceso restringido. Solo el rol GERENTE puede acceder.");
    window.location.href = "../dashboard/dashboard.html";
    return;
  }

  // === 3. Mostrar datos en sidebar ===
  const sbUsuario = document.getElementById("sb-usuario");
  const sbRol = document.getElementById("sb-rol");

  if (sbUsuario) sbUsuario.textContent = usuario;
  if (sbRol) sbRol.textContent = rol;

  // === 4. Habilitar opciones exclusivas gerente ===
  document.querySelectorAll("[data-only]").forEach(el => {
    if (el.dataset.only === "gerente") {
      el.style.display = "block";
    }
  });

  // === 5. Log visual (opcional, pero suma) ===
  console.log("✔ Acceso gerente habilitado - Cuentas Facebook");

})();
