import { escapeHtml } from "../../assets/js/app.js";

const $ = (s) => document.querySelector(s);

async function waitSupabaseClient(timeoutMs = 2000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (window.supabaseClient) return window.supabaseClient;
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}

const session = JSON.parse(localStorage.getItem("mp_session_v1") || "{}");
let sb = null;

let filtroPlataforma = "all";
let editMode = { tipo: null, id: null }; // tipo: "fb" | "new"

// ==========================
// Log seguro (no rompe nunca)
// ==========================
function log(msg) {
  const el = $("#log");
  if (!el) return;
  const t = new Date().toTimeString().slice(0, 8);
  el.innerHTML += `[${t}] ${escapeHtml(msg)}<br>`;
  el.scrollTop = el.scrollHeight;
}

// ==========================
// UI chips
// ==========================
function setupChips() {
  document.querySelectorAll(".chip").forEach((c) => {
    c.onclick = async () => {
      document.querySelectorAll(".chip").forEach((x) => x.classList.remove("active"));
      c.classList.add("active");
      filtroPlataforma = c.dataset.pl || "all";
      await cargarPantalla();
    };
  });
}

// ==========================
// Helpers
// ==========================
function pillClass(pl) {
  const p = String(pl || "").toLowerCase();
  if (p === "facebook") return "fb";
  if (p === "instagram") return "ig";
  if (p === "tiktok") return "tt";
  return "ot";
}

// ==========================
// CARGA SEGURA DE DATOS
// ==========================

// 1) Facebook legacy (cuentas_facebook) -> funciona SIEMPRE
async function fetchFacebookLegacy() {
  let q = sb.from("cuentas_facebook").select("*").order("id", { ascending: true });

  if (session.rol !== "gerente") {
    q = q.eq("ocupada_por", session.usuario);
  }

  const { data, error } = await q;
  if (error) throw error;

  return (data || []).map((r) => ({
    tipo: "fb",
    plataforma: "facebook",
    id: r.id,
    nombre: r.nombre || r.email || "(sin nombre)",
    estado: r.estado || "activo",
    asignada_a: r.ocupada_por || null,
    raw: r,
  }));
}

// 2) Nuevas cuentas (cuentas + cuentas_asignadas)
// - gerente: ve todo en "cuentas"
// - operador: trae ids desde cuentas_asignadas y luego hace .in()
async function fetchCuentasNuevas() {
  if (session.rol === "gerente") {
    const { data, error } = await sb
      .from("cuentas")
      .select("*")
      .order("id", { ascending: true });
    if (error) throw error;

    return (data || []).map((c) => ({
      tipo: "new",
      plataforma: c.plataforma || "otra",
      id: c.id,
      nombre: c.nombre_visible || c.usuario_handle || `Cuenta ${c.id}`,
      estado: c.activo ? "activa" : "inactiva",
      asignada_a: null, // la mostramos solo si querés (se puede cargar con otra query)
      raw: c,
    }));
  }

  // Operador
  const { data: asig, error: errAsig } = await sb
    .from("cuentas_asignadas")
    .select("cuenta_id")
    .eq("usuario", session.usuario);

  if (errAsig) throw errAsig;

  const ids = (asig || []).map((x) => x.cuenta_id).filter(Boolean);
  if (!ids.length) return [];

  const { data: cuentas, error: errC } = await sb
    .from("cuentas")
    .select("*")
    .in("id", ids)
    .order("id", { ascending: true });

  if (errC) throw errC;

  return (cuentas || []).map((c) => ({
    tipo: "new",
    plataforma: c.plataforma || "otra",
    id: c.id,
    nombre: c.nombre_visible || c.usuario_handle || `Cuenta ${c.id}`,
    estado: c.activo ? "activa" : "inactiva",
    asignada_a: session.usuario,
    raw: c,
  }));
}

// ==========================
// RENDER
// ==========================
function renderTabla(rows) {
  const tbody = $("#tbodyCuentas");
  if (!tbody) return;

  const filtradas =
    filtroPlataforma === "all"
      ? rows
      : rows.filter((r) => String(r.plataforma).toLowerCase() === filtroPlataforma);

  tbody.innerHTML = "";

  if (!filtradas.length) {
    const msg =
      session.rol === "gerente"
        ? "No hay cuentas para mostrar con este filtro."
        : "No tenés cuentas asignadas todavía. Pedile al gerente que te asigne.";
    tbody.innerHTML = `<tr><td colspan="5" class="muted2">${msg}</td></tr>`;
    return;
  }

  filtradas.forEach((r) => {
    const tr = document.createElement("tr");

    const pl = String(r.plataforma || "otra").toLowerCase();
    const plLabel =
      pl === "facebook" ? "Facebook" : pl === "instagram" ? "Instagram" : pl === "tiktok" ? "TikTok" : "Otra";

    let acciones = "";

    if (r.tipo === "fb") {
      // gerente: editar FB legacy desde panel (lo dejamos ahí)
      // operador: modal login rápido
      if (session.rol !== "gerente") {
        acciones += `<button class="btn2" data-action="loginfb" data-id="${r.id}">🔐 Iniciar sesión</button>`;
      } else {
        acciones += `<button class="btn2" data-action="editfb" data-id="${r.id}">Editar</button>`;
      }
    } else {
      if (session.rol === "gerente") {
        acciones += `<button class="btn2" data-action="editnew" data-id="${r.id}">Editar</button>`;
      } else {
        acciones += `<span class="muted2">Asignada</span>`;
      }
    }

    tr.innerHTML = `
      <td><span class="pill ${pillClass(pl)}">● ${escapeHtml(plLabel)}</span></td>
      <td>
        <div style="font-weight:800; color:#e5e7eb;">${escapeHtml(r.nombre)}</div>
        <div class="muted2 mono">${r.tipo === "fb" ? escapeHtml(r.raw.email || "") : escapeHtml(r.raw.usuario_handle || "")}</div>
      </td>
      <td>${escapeHtml(r.estado || "-")}</td>
      <td>${r.asignada_a ? `<span class="pill ot">👤 ${escapeHtml(r.asignada_a)}</span>` : `<span class="pill tt">🟢 Libre</span>`}</td>
      <td style="display:flex; gap:8px; flex-wrap:wrap;">${acciones}</td>
    `;

    tbody.appendChild(tr);
  });
}

// ==========================
// GERENTE: cargar combos
// ==========================
async function cargarOperadoresYCombos() {
  if (session.rol !== "gerente") return;

  // Operadores
  const { data: ops, error: errOps } = await sb
    .from("usuarios")
    .select("usuario")
    .eq("rol", "operador")
    .order("usuario", { ascending: true });

  if (errOps) {
    log("⚠️ No pude cargar operadores: " + errOps.message);
  } else {
    const selOp = $("#selOperador");
    if (selOp) {
      selOp.innerHTML = (ops || []).map((u) => `<option value="${u.usuario}">${u.usuario}</option>`).join("");
    }
  }

  // Cuentas nuevas (para asignar)
  const { data: cuentas, error: errC } = await sb
    .from("cuentas")
    .select("id, plataforma, nombre_visible, usuario_handle")
    .order("id", { ascending: true });

  if (errC) {
    log("⚠️ No pude cargar cuentas nuevas para asignación: " + errC.message);
  } else {
    const selCuenta = $("#selCuenta");
    if (selCuenta) {
      selCuenta.innerHTML = (cuentas || [])
        .map((c) => {
          const label = `${(c.plataforma || "otra").toUpperCase()} — ${c.nombre_visible || c.usuario_handle || "Cuenta " + c.id}`;
          return `<option value="${c.id}">${escapeHtml(label)}</option>`;
        })
        .join("");
    }
  }
}

// ==========================
// Acciones gerente (guardar / asignar)
// ==========================
async function guardarCuentaGerente() {
  if (session.rol !== "gerente") return;

  const plataforma = ($("#plataforma").value || "facebook").toLowerCase();
  const nombre_visible = ($("#nombre_visible").value || "").trim();
  const usuario_handle = ($("#usuario_handle").value || "").trim();
  const url = ($("#url").value || "").trim();
  const activo = ($("#activo").value || "true") === "true";

  // Si es FB legacy, se guarda en cuentas_facebook (para NO perder lo que ya está)
  if (plataforma === "facebook") {
    const payload = {
      email: ($("#fb_email").value || "").trim(),
      contra: ($("#fb_contra").value || "").trim(),
      two_fa: ($("#fb_twofa").value || "").trim(),
      nombre: nombre_visible || null,
      estado: ($("#fb_estado").value || "activo"),
      calidad: ($("#fb_calidad").value || "caliente"),
      // ocupada_por no la tocamos acá (se maneja desde cuentas_fb o si querés la agregamos)
    };

    if (!payload.email) {
      alert("FB legacy: el email es obligatorio.");
      return;
    }

    const res = editMode.tipo === "fb" && editMode.id
      ? await sb.from("cuentas_facebook").update(payload).eq("id", editMode.id)
      : await sb.from("cuentas_facebook").insert([payload]);

    if (res.error) {
      alert("No se pudo guardar FB: " + res.error.message);
      return;
    }

    log("✅ Guardada cuenta Facebook (legacy)");
    editMode = { tipo: null, id: null };
    $("#editInfo").textContent = "";
    await cargarPantalla();
    return;
  }

  // IG/TikTok a tabla cuentas
  const payload = {
    plataforma,
    nombre_visible: nombre_visible || null,
    usuario_handle: usuario_handle || null,
    url: url || null,
    activo,
  };

  const res = editMode.tipo === "new" && editMode.id
    ? await sb.from("cuentas").update(payload).eq("id", editMode.id)
    : await sb.from("cuentas").insert([payload]);

  if (res.error) {
    alert("No se pudo guardar cuenta: " + res.error.message);
    return;
  }

  log("✅ Guardada cuenta nueva (" + plataforma + ")");
  editMode = { tipo: null, id: null };
  $("#editInfo").textContent = "";
  await cargarOperadoresYCombos();
  await cargarPantalla();
}

async function asignarCuenta() {
  if (session.rol !== "gerente") return;

  const usuario = ($("#selOperador").value || "").trim();
  const cuenta_id = Number($("#selCuenta").value);

  if (!usuario || !cuenta_id) return alert("Faltan datos para asignar");

  const { error } = await sb.from("cuentas_asignadas").insert([{ usuario, cuenta_id }]);
  if (error) {
    alert("No se pudo asignar: " + error.message);
    return;
  }

  log(`✅ Asignada cuenta ${cuenta_id} a ${usuario}`);
  await cargarPantalla();
}

// ==========================
// Login FB modal (operador)
// ==========================
async function abrirFBLoginPorId(id) {
  const { data, error } = await sb.from("cuentas_facebook").select("*").eq("id", id).single();
  if (error) {
    log("❌ No pude abrir login FB: " + error.message);
    return;
  }
  window.abrirFBLogin(data.email || "", data.contra || "");
}

window.abrirFBLogin = function(email, pass) {
  const modal = document.getElementById("fbLoginModal");
  const inpEmail = document.getElementById("fbEmail");
  const inpPass = document.getElementById("fbPass");
  const msg = document.getElementById("fbMsg");
  if (!modal || !inpEmail || !inpPass || !msg) return;

  inpEmail.value = email || "";
  inpPass.value = pass || "";
  msg.textContent = "";
  modal.style.display = "flex";

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

// ==========================
// Acciones de tabla (delegación)
// ==========================
function bindTablaAcciones(rows) {
  const tbody = $("#tbodyCuentas");
  if (!tbody) return;

  tbody.onclick = async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    const action = btn.dataset.action;
    const id = Number(btn.dataset.id);

    if (action === "loginfb") {
      await abrirFBLoginPorId(id);
      return;
    }

    if (action === "editfb" && session.rol === "gerente") {
      const row = rows.find((r) => r.tipo === "fb" && r.id === id);
      if (!row) return;

      editMode = { tipo: "fb", id };
      $("#editInfo").textContent = `Editando FB legacy ID ${id}`;

      $("#plataforma").value = "facebook";
      $("#nombre_visible").value = row.raw.nombre || "";
      $("#usuario_handle").value = "";
      $("#url").value = "";
      $("#activo").value = "true";

      $("#fb_email").value = row.raw.email || "";
      $("#fb_contra").value = row.raw.contra || "";
      $("#fb_twofa").value = row.raw.two_fa || "";
      $("#fb_estado").value = row.raw.estado || "activo";
      $("#fb_calidad").value = row.raw.calidad || "caliente";
      return;
    }

    if (action === "editnew" && session.rol === "gerente") {
      const row = rows.find((r) => r.tipo === "new" && r.id === id);
      if (!row) return;

      editMode = { tipo: "new", id };
      $("#editInfo").textContent = `Editando cuenta ID ${id}`;

      $("#plataforma").value = (row.raw.plataforma || "instagram").toLowerCase();
      $("#nombre_visible").value = row.raw.nombre_visible || "";
      $("#usuario_handle").value = row.raw.usuario_handle || "";
      $("#url").value = row.raw.url || "";
      $("#activo").value = row.raw.activo ? "true" : "false";
      return;
    }
  };
}

// ==========================
// Cargar pantalla completa
// ==========================
async function cargarPantalla() {
  try {
    const fb = await fetchFacebookLegacy();
    let nuevas = [];
    try {
      nuevas = await fetchCuentasNuevas();
    } catch (e) {
      // Importante: si falla, NO rompemos la pantalla
      log("⚠️ Cuentas nuevas no disponibles: " + e.message);
      nuevas = [];
    }

    const rows = [...fb, ...nuevas];
    renderTabla(rows);
    bindTablaAcciones(rows);
    log(`✅ Cargadas: ${rows.length} cuenta(s) (FB + otras)`);

  } catch (e) {
    console.error(e);
    $("#tbodyCuentas").innerHTML = `<tr><td colspan="5" class="muted2">Error cargando cuentas: ${escapeHtml(e.message)}</td></tr>`;
    log("❌ Error cargando cuentas: " + e.message);
  }
}

// ==========================
// Init
// ==========================
document.addEventListener("DOMContentLoaded", async () => {
  sb = await waitSupabaseClient();
  if (!sb) {
    log("❌ Supabase no inicializado");
    return;
  }

  setupChips();

  // Panel gerente
  if (session.rol === "gerente") {
    $("#panelGerente").style.display = "grid";
    await cargarOperadoresYCombos();

    $("#btnGuardarCuenta").onclick = guardarCuentaGerente;
    $("#btnAsignar").onclick = asignarCuenta;

    $("#btnNuevaCuenta").onclick = () => {
      editMode = { tipo: null, id: null };
      $("#editInfo").textContent = "";
      $("#nombre_visible").value = "";
      $("#usuario_handle").value = "";
      $("#url").value = "";
      $("#activo").value = "true";

      $("#fb_email").value = "";
      $("#fb_contra").value = "";
      $("#fb_twofa").value = "";
      $("#fb_estado").value = "activo";
      $("#fb_calidad").value = "caliente";
      log("🧼 Formulario limpio");
    };
  }

  $("#btnRefresh").onclick = cargarPantalla;

  await cargarPantalla();
});
