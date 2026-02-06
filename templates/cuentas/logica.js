import { requireSession, loadSidebar, escapeHtml } from "../../assets/js/app.js";

const s = requireSession();
const sb = window.supabaseClient;

const $ = (q) => document.querySelector(q);

function log(msg) {
  const el = $("#log");
  if (!el) return;
  const t = new Date().toTimeString().slice(0, 8);
  el.innerHTML += `[${t}] ${escapeHtml(msg)}<br>`;
  el.scrollTop = el.scrollHeight;
}

function boolFromSelect(v) {
  return String(v) === "true";
}

function clearForm() {
  $("#cuenta_id").value = "";
  $("#plataforma").value = "facebook";
  $("#nombre").value = "";
  $("#handle").value = "";
  $("#url").value = "";
  $("#activo").value = "true";
}

function fillForm(c) {
  $("#cuenta_id").value = String(c.id);
  $("#plataforma").value = c.plataforma;
  $("#nombre").value = c.nombre || "";
  $("#handle").value = c.handle || "";
  $("#url").value = c.url || "";
  $("#activo").value = String(!!c.activo);
}

async function loadOperadores() {
  const { data, error } = await sb
    .from("usuarios")
    .select("usuario, rol")
    .order("usuario", { ascending: true });

  if (error) throw error;

  const ops = (data || []).filter(u => u.rol === "operador");
  const sel = $("#selOperador");
  sel.innerHTML = "";

  for (const o of ops) {
    const opt = document.createElement("option");
    opt.value = o.usuario;
    opt.textContent = o.usuario;
    sel.appendChild(opt);
  }
}

async function fetchCuentasAll() {
  let q = sb.from("cuentas").select("*").order("id", { ascending: false });
  const fp = $("#fPlataforma").value;
  if (fp) q = q.eq("plataforma", fp);

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

function renderCuentasAll(cuentas) {
  const tbody = $("#tbodyCuentas");
  tbody.innerHTML = "";

  if (!cuentas.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="muted2">No hay cuentas cargadas.</td></tr>`;
    return;
  }

  for (const c of cuentas) {
    const tr = document.createElement("tr");

    const url = c.url
      ? `<a href="${escapeHtml(c.url)}" target="_blank" rel="noopener">${escapeHtml(c.url)}</a>`
      : `<span style="opacity:.7">-</span>`;

    tr.innerHTML = `
      <td><span class="pill">${escapeHtml(c.plataforma)}</span></td>
      <td><b>${escapeHtml(c.nombre)}</b></td>
      <td class="mono">${escapeHtml(c.handle || "-")}</td>
      <td>${url}</td>
      <td>${c.activo ? "✅" : "⛔"}</td>
      <td class="actions">
        <button class="btn2" data-edit="${c.id}">Editar</button>
        <button class="btn danger" data-del="${c.id}">Eliminar</button>
      </td>
    `;

    tbody.appendChild(tr);
  }

  tbody.querySelectorAll("[data-edit]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.getAttribute("data-edit"));
      const { data, error } = await sb.from("cuentas").select("*").eq("id", id).single();
      if (error) return log(`❌ No pude cargar cuenta: ${error.message}`);
      fillForm(data);
      log(`✏️ Editando: ${data.nombre}`);
    });
  });

  tbody.querySelectorAll("[data-del]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.getAttribute("data-del"));
      const ok = confirm("¿Eliminar cuenta? (Se borran asignaciones relacionadas)");
      if (!ok) return;
      const { error } = await sb.from("cuentas").delete().eq("id", id);
      if (error) return log(`❌ Error al eliminar: ${error.message}`);
      log("🗑️ Cuenta eliminada.");
      await refreshGerente();
    });
  });
}

async function renderSelectCuentasActivas() {
  const sel = $("#selCuenta");
  sel.innerHTML = "";

  const { data, error } = await sb
    .from("cuentas")
    .select("id, plataforma, nombre, handle, activo")
    .eq("activo", true)
    .order("plataforma", { ascending: true })
    .order("nombre", { ascending: true });

  if (error) throw error;

  for (const c of (data || [])) {
    const opt = document.createElement("option");
    opt.value = String(c.id);
    const extra = c.handle ? ` (${c.handle})` : "";
    opt.textContent = `${c.plataforma.toUpperCase()} — ${c.nombre}${extra}`;
    sel.appendChild(opt);
  }
}

async function guardarCuenta() {
  const id = ($("#cuenta_id").value || "").trim();
  const plataforma = ($("#plataforma").value || "").trim();
  const nombre = ($("#nombre").value || "").trim();
  const handle = ($("#handle").value || "").trim();
  const url = ($("#url").value || "").trim();
  const activo = boolFromSelect($("#activo").value);

  if (!nombre) return log("❌ Falta nombre.");
  if (!plataforma) return log("❌ Falta plataforma.");

  const payload = { plataforma, nombre, handle: handle || null, url: url || null, activo };

  if (!id) {
    const { error } = await sb.from("cuentas").insert([payload]);
    if (error) return log(`❌ Insert error: ${error.message}`);
    log("✅ Cuenta creada.");
  } else {
    const { error } = await sb.from("cuentas").update(payload).eq("id", Number(id));
    if (error) return log(`❌ Update error: ${error.message}`);
    log("✅ Cuenta actualizada.");
  }

  clearForm();
  await refreshGerente();
}

async function asignarCuenta() {
  const usuario = ($("#selOperador").value || "").trim();
  const cuenta_id = Number($("#selCuenta").value || "0");

  if (!usuario) return log("❌ Falta operador.");
  if (!cuenta_id) return log("❌ Falta cuenta.");

  const { error } = await sb.from("cuentas_asignadas").insert([{ usuario, cuenta_id }]);
  if (error) {
    if (String(error.message || "").toLowerCase().includes("duplicate")) {
      return log("⚠️ Esa cuenta ya está asignada a ese operador.");
    }
    return log(`❌ Error asignando: ${error.message}`);
  }

  log("✅ Asignación creada.");
}

async function verAsignadas() {
  const usuario = ($("#selOperador").value || "").trim();
  if (!usuario) return log("❌ Elegí un operador.");

  $("#panelAsignadas").style.display = "block";
  $("#asignadasHint").innerHTML = `Operador: <b>${escapeHtml(usuario)}</b>`;

  const { data, error } = await sb
    .from("cuentas_asignadas")
    .select("id, cuenta_id, cuentas(plataforma, nombre, handle)")
    .eq("usuario", usuario)
    .order("id", { ascending: false });

  if (error) return log(`❌ No pude cargar asignadas: ${error.message}`);

  const tbody = $("#tbodyAsignadas");
  tbody.innerHTML = "";

  if (!(data || []).length) {
    tbody.innerHTML = `<tr><td colspan="3" class="muted2">Sin cuentas asignadas.</td></tr>`;
    return;
  }

  for (const r of data) {
    const c = r.cuentas || {};
    const extra = c.handle ? ` <span class="mono">(${escapeHtml(c.handle)})</span>` : "";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><b>${escapeHtml(c.nombre || "-")}</b>${extra}</td>
      <td><span class="pill">${escapeHtml(c.plataforma || "-")}</span></td>
      <td class="actions">
        <button class="btn danger" data-un="${r.id}">Quitar</button>
      </td>
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll("[data-un]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.getAttribute("data-un"));
      const ok = confirm("¿Quitar asignación?");
      if (!ok) return;
      const { error } = await sb.from("cuentas_asignadas").delete().eq("id", id);
      if (error) return log(`❌ Error quitando: ${error.message}`);
      log("🧹 Asignación eliminada.");
      await verAsignadas();
    });
  });
}

/* ✅ OPERADOR: solo ve SUS cuentas asignadas */
async function loadMisCuentas() {
  const tbody = $("#tbodyMisCuentas");
  tbody.innerHTML = `<tr><td colspan="4" class="muted2">Cargando…</td></tr>`;

  const { data, error } = await sb
    .from("cuentas_asignadas")
    .select("id, cuentas(plataforma, nombre, handle, activo)")
    .eq("usuario", s.usuario)
    .order("id", { ascending: false });

  if (error) {
    tbody.innerHTML = `<tr><td colspan="4" class="muted2">Error: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  const rows = (data || [])
    .map(r => r.cuentas ? r.cuentas : null)
    .filter(Boolean);

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="muted2">No tenés cuentas asignadas.</td></tr>`;
    return;
  }

  tbody.innerHTML = "";
  for (const c of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><span class="pill">${escapeHtml(c.plataforma)}</span></td>
      <td><b>${escapeHtml(c.nombre)}</b></td>
      <td class="mono">${escapeHtml(c.handle || "-")}</td>
      <td>${c.activo ? "✅" : "⛔"}</td>
    `;
    tbody.appendChild(tr);
  }
}

/* ✅ GERENTE: refresca todo */
async function refreshGerente() {
  const cuentas = await fetchCuentasAll();
  renderCuentasAll(cuentas);
  await renderSelectCuentasActivas();
}

document.addEventListener("DOMContentLoaded", async () => {
  await loadSidebar({ activeKey: "cuentas", basePath: "../" });

  // Mostrar panel según rol
  if (s.rol === "gerente") {
    document.querySelectorAll(".only-gerente").forEach(el => (el.style.display = ""));
    document.querySelectorAll(".only-operador").forEach(el => (el.style.display = "none"));

    // Events gerente
    $("#btnGuardar")?.addEventListener("click", guardarCuenta);
    $("#btnNuevo")?.addEventListener("click", () => { clearForm(); log("🆕 Form limpio."); });
    $("#btnAsignar")?.addEventListener("click", asignarCuenta);
    $("#btnVerAsignadas")?.addEventListener("click", verAsignadas);
    $("#btnRefrescar")?.addEventListener("click", refreshGerente);
    $("#fPlataforma")?.addEventListener("change", refreshGerente);

    await loadOperadores();
    await refreshGerente();
    clearForm();
    log("✅ Panel gerente listo.");
    return;
  }

  // OPERADOR
  document.querySelectorAll(".only-gerente").forEach(el => (el.style.display = "none"));
  document.querySelectorAll(".only-operador").forEach(el => (el.style.display = ""));

  $("#btnRefrescarOperador")?.addEventListener("click", loadMisCuentas);
  await loadMisCuentas();
});
