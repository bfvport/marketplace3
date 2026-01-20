import { requireSession, loadSidebar } from "../../assets/js/app.js";

const s = requireSession();
const sb = window.supabaseClient;
const $ = (id) => document.getElementById(id);

(async function init() {
  // ✅ Volvemos al sidebar del sistema (NO custom)
  // basePath "../" porque estamos en /templates/calentamiento/
  await loadSidebar({ activeKey: "calentamiento", basePath: "../" });

  // Seguridad básica: si por error entra un gerente acá, lo dejamos igual (no rompe)
  $("btn-refrescar").onclick = cargarTodo;

  await cargarConfiguracion();
  await cargarTodo();
})();

/* ---------------------------
   CONFIG GLOBAL (drive)
---------------------------- */
async function cargarConfiguracion() {
  const { data, error } = await sb
    .from("configuracion_calentamiento")
    .select("link_drive")
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error(error);
    $("btn-drive").style.display = "none";
    return;
  }

  const cfg = data?.[0];
  if (cfg?.link_drive) {
    $("btn-drive").href = cfg.link_drive;
  } else {
    $("btn-drive").style.display = "none";
  }
}

/* ---------------------------
   CARGA GENERAL
---------------------------- */
async function cargarTodo() {
  $("resumen").textContent = "Cargando…";
  $("tabla-calentamiento").innerHTML = `<tr><td colspan="6" style="text-align:center;" class="muted">Cargando…</td></tr>`;

  const cuentas = await cargarCuentasFrias();
  if (!cuentas.length) {
    $("resumen").textContent = "No tenés cuentas frías asignadas.";
    $("tabla-calentamiento").innerHTML = `<tr><td colspan="6" style="text-align:center;" class="muted">Sin cuentas frías asignadas.</td></tr>`;
    return;
  }

  const plan = await cargarPlanHoy(cuentas.map(c => c.id));

  renderTabla(cuentas, plan);
  renderResumen(cuentas, plan);
}

/* ---------------------------
   CUENTAS FRÍAS DEL OPERADOR
---------------------------- */
async function cargarCuentasFrias() {
  const { data, error } = await sb
    .from("cuentas_facebook")
    .select("id,email,ocupada_por,calidad,estado")
    .eq("ocupada_por", s.usuario)
    .in("calidad", ["fria", "nueva"])
    .order("email", { ascending: true });

  if (error) {
    console.error(error);
    return [];
  }
  return data || [];
}

/* ---------------------------
   PLAN DEL DÍA (de gerente)
---------------------------- */
async function cargarPlanHoy(cuentasIds) {
  const hoy = new Date().toISOString().slice(0, 10);

  const { data, error } = await sb
    .from("calentamiento_plan")
    .select("cuenta_id,req_historias,req_muro,req_reels,req_grupos,usuario,fecha")
    .eq("fecha", hoy)
    .in("cuenta_id", cuentasIds);

  if (error) {
    console.error(error);
    return [];
  }
  return data || [];
}

/* ---------------------------
   RENDER
---------------------------- */
function renderResumen(cuentas, plan) {
  const conPlan = plan.length;
  $("resumen").innerHTML = `
    🔹 Cuentas frías: <b>${cuentas.length}</b><br>
    🔹 Cuentas con plan cargado hoy: <b>${conPlan}</b>
  `;
}

function renderTabla(cuentas, plan) {
  const tbody = $("tabla-calentamiento");
  tbody.innerHTML = "";

  cuentas.forEach(c => {
    const p = plan.find(x => Number(x.cuenta_id) === Number(c.id));

    tbody.innerHTML += `
      <tr>
        <td>${c.email}</td>
        <td>${p ? p.req_historias : "-"}</td>
        <td>${p ? p.req_muro : "-"}</td>
        <td>${p ? p.req_reels : "-"}</td>
        <td>${p ? p.req_grupos : "-"}</td>
        <td><span class="muted">${p ? "Plan diario asignado" : "Sin plan hoy"}</span></td>
      </tr>
    `;
  });
}

