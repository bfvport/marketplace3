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

function limpiarFormulario() {
  $("#email").value = "";
  $("#contra").value = "";
  $("#nombre").value = "";
  $("#two_fa").value = "";
  $("#estado").value = "activo";
  $("#calidad").value = "caliente";
  $("#ocupada_por").value = "";
  cuentaEditandoId = null;
}

function openModal(data = null) {
  const m = $("#modal-cuenta");
  m.classList.remove("hidden");

  const esGerente = session.rol === "gerente";

  // Operador: solo ve
  ["#email", "#contra", "#nombre", "#two_fa"].forEach(id => { if ($(id)) $(id).readOnly = !esGerente; });
  ["#estado", "#calidad", "#ocupada_por"].forEach(id => { if ($(id)) $(id).disabled = !esGerente; });

  if ($("#guardar")) $("#guardar").style.display = esGerente ? "inline-block" : "none";

  if (data) {
    $("#email").value = data.email || "";
    $("#contra").value = data.contra || "";
    $("#nombre").value = data.nombre || "";
    $("#two_fa").value = data.two_fa || "";
    $("#estado").value = data.estado || "activo";
    $("#calidad").value = data.calidad || "caliente";
    $("#ocupada_por").value = data.ocupada_por || "";
    cuentaEditandoId = data.id;
  } else {
    limpiarFormulario();
  }
}

async function cargarCuentas() {
  if (!supabase || !session.usuario) return;

  // Gerente ve todo. Operador ve solo sus cuentas.
  let query = supabase.from("cuentas_facebook").select("*");
  if (session.rol !== "gerente") {
    query = query.eq("ocupada_por", session.usuario);
  }

  const { data, error } = await query.order("id", { ascending: true });
  if (error) {
    console.error(error);
    tbody.innerHTML = `<tr><td colspan="8" class="muted">Error cargando cuentas.</td></tr>`;
    return;
  }

  tbody.innerHTML = "";
  const rows = data || [];

  if (!rows.length) {
    const msg = session.rol === "gerente"
      ? "No hay cuentas cargadas todavía."
      : "No tenés cuentas asignadas todavía. Pedile al gerente que te asigne.";
    tbody.innerHTML = `<tr><td colspan="8" class="muted">${msg}</td></tr>`;
    return;
  }

  rows.forEach(cuenta => {
    const textoBoton = session.rol === "gerente" ? "Editar" : "Ver datos";

    const etiquetaOcupada = cuenta.ocupada_por
      ? `<span class="badge" style="background-color:#f59e0b;color:black;">👤 ${cuenta.ocupada_por}</span>`
      : `<span class="badge" style="background-color:#10b981;color:white;">🟢 Libre</span>`;

    // Solo operador: login rápido
    const btnLogin = (session.rol !== "gerente")
      ? `<button class="btn2 loginfb"
            data-email="${String(cuenta.email || "").replaceAll('"', "&quot;")}"
            data-pass="${String(cuenta.contra || "").replaceAll('"', "&quot;")}"
          >🔐 Iniciar sesión</button>`
      : "";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${cuenta.id}</td>
      <td><strong>${cuenta.nombre || ""}</strong><br><small>${cuenta.email || ""}</small></td>
      <td style="font-family: monospace;">${cuenta.contra ? cuenta.contra : "****"}</td>
      <td style="color:#60a5fa;font-weight:bold;">${cuenta.two_fa || "-"}</td>
      <td><span class="badge ${cuenta.estado}">${cuenta.estado}</span></td>
      <td><span class="badge ${cuenta.calidad || "frio"}">${cuenta.calidad || "frio"}</span></td>
      <td>${etiquetaOcupada}</td>
      <td style="display:flex; gap:8px; flex-wrap:wrap;">
        <button class="btn edit" data-id="${cuenta.id}">${textoBoton}</button>
        ${session.rol === "gerente" ? `<button class="btn danger" data-id="${cuenta.id}">Eliminar</button>` : ""}
        ${btnLogin}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

/* ===== Login helper ===== */
window.abrirFBLogin = function(email, pass) {
  const modal = document.getElementById("fbLoginModal");
  const inpEmail = document.getElementById("fbEmail");
  const inpPass = document.getElementById("fbPass");
  const msg = document.getElementById("fbMsg");

  if (!modal || !inpEmail || !inpPass || !msg) {
    alert("Falta el modal de login (fbLoginModal/fbEmail/fbPass/fbMsg) en el HTML.");
    return;
  }

  inpEmail.value = email || "";
  inpPass.value = pass || "";
  msg.textContent = "";
  modal.style.display = "flex";

  // Abrimos Marketplace directo
  window.open("https://www.facebook.com/marketplace/", "_blank", "noopener");
};

window.cerrarFBModal = function() {
  const modal = document.getElementById("fbLoginModal");
  if (modal) modal.style.display = "none";
};

window.copiarFB = async function(id) {
  const el = document.getElementById(id);
  if (!el) return;

  try {
    await navigator.clipboard.writeText(el.value || "");
    const msg = document.getElementById("fbMsg");
    if (msg) msg.textContent = "✅ Copiado";
  } catch {
    alert("No se pudo copiar. Copiá manualmente.");
  }
};

window.abrirFacebook = function() {
  window.open("https://www.facebook.com/login", "_blank", "noopener");
};
window.abrirMarketplace = function() {
  window.open("https://www.facebook.com/marketplace/", "_blank", "noopener");
};

document.addEventListener("DOMContentLoaded", async () => {
  supabase = await waitSupabaseClient();
  if (!supabase) return;

  await cargarCuentas();

  // Botón nueva cuenta solo gerente
  if (session.rol === "gerente") {
    // Cargar lista de operadores
    const { data, error } = await supabase.from("usuarios").select("usuario").eq("rol", "operador");
    if (!error) {
      const sel = $("#ocupada_por");
      if (sel) {
        sel.innerHTML = '<option value="">Libre</option>';
        (data || []).forEach(u => sel.innerHTML += `<option value="${u.usuario}">${u.usuario}</option>`);
      }
    }

    if ($("#btn-nueva")) $("#btn-nueva").onclick = () => { limpiarFormulario(); openModal(); };
  } else {
    if ($("#btn-nueva")) $("#btn-nueva").style.display = "none";
  }

  // Cerrar modal cuenta
  if ($("#cancelar")) $("#cancelar").onclick = () => {
    $("#modal-cuenta").classList.add("hidden");
    limpiarFormulario();
  };

  // Guardar (solo gerente)
  if ($("#guardar")) $("#guardar").onclick = async () => {
    if (session.rol !== "gerente") return;

    const payload = {
      email: $("#email").value.trim(),
      contra: $("#contra").value.trim(),
      nombre: $("#nombre").value.trim(),
      two_fa: $("#two_fa").value.trim(),
      estado: $("#estado").value,
      calidad: $("#calidad").value,
      ocupada_por: $("#ocupada_por").value || null
    };

    const { error } = cuentaEditandoId
      ? await supabase.from("cuentas_facebook").update(payload).eq("id", cuentaEditandoId)
      : await supabase.from("cuentas_facebook").insert([payload]);

    if (error) {
      console.error(error);
      alert("No se pudo guardar.");
      return;
    }

    $("#modal-cuenta").classList.add("hidden");
    limpiarFormulario();
    await cargarCuentas();
  };

  // Clicks en tabla
  tbody.onclick = async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    // Operador: iniciar sesión
    if (btn.classList.contains("loginfb")) {
      window.abrirFBLogin(btn.dataset.email || "", btn.dataset.pass || "");
      return;
    }

    // Ver/Editar
    if (btn.classList.contains("edit")) {
      const { data, error } = await supabase
        .from("cuentas_facebook")
        .select("*")
        .eq("id", btn.dataset.id)
        .single();

      if (error) return console.error(error);
      openModal(data);
      return;
    }

    // Eliminar (solo gerente)
    if (btn.classList.contains("danger")) {
      if (session.rol !== "gerente") return;
      if (!confirm("¿Eliminar?")) return;

      const { error } = await supabase.from("cuentas_facebook").delete().eq("id", btn.dataset.id);
      if (error) return console.error(error);

      await cargarCuentas();
      return;
    }
  };
});
