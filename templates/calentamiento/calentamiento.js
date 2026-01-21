import { requireSession, loadSidebar } from "../../assets/js/app.js";

const s = requireSession();
const sb = window.supabaseClient;

const $ = (id) => document.getElementById(id);
const hoyISO = () => new Date().toISOString().slice(0, 10);

(async function init() {
  // OPERADOR usa el sidebar normal en /templates/sidebar.html
  await loadSidebar({ activeKey: "calentamiento", basePath: "../" });

  // Si un gerente cae acá, lo mandamos a su módulo
  if (s?.rol === "gerente") {
    window.location.href = "../calentamiento_gerente/calentamiento_gerente.html";
    return;
  }

  $("btn-refrescar").addEventListener("click", cargarTodo);

  await cargarTodo();
})();

async function cargarTodo() {
  $("resumen").textContent = "Cargando…";
  $("tabla-calentamiento").innerHTML = "";

  // 1) Traer config global (drive + topes)
  const { data: cfgRows, error: cfgErr } = await sb
    .from("configuracion_calentamiento")
    .select("*")
    .order("id", { ascending: true })
    .limit(1);

  if (cfgErr) console.warn("Config calentamiento error:", cfgErr);

  const cfg = cfgRows?.[0] || null;

  const drive = cfg?.link_drive?.trim() || "https://drive.google.com/";
  $("btn-drive").href = drive;

  // 2) Traer cuentas frías/nuevas asignadas al operador
  const usuario = s?.usuario || s?.email || s?.nombre || "";
  const { data: cuentas, error: cErr } = await sb
    .from("cuentas_facebook")
    .select("id,email,telefono,ocupada_por,calidad,estado")
    .eq("ocupada_por", usuario)
    .in("calidad", ["fria", "nueva"])
    .neq("estado", "inactiva");

  if (cErr) {
    console.error(cErr);
    $("resumen").textContent = "❌ Error cargando cuentas.";
    return;
  }

  if (!cuentas || cuentas.length === 0) {
    $("resumen").textContent = "No tenés cuentas frías asignadas.";
    $("tabla-calentamiento").innerHTML = `<tr><td colspan="6" class="muted" style="text-align:center;">Sin cuentas frías asignadas.</td></tr>`;
    return;
  }

  // 3) Traer plan del día para esas cuentas
  const fecha = hoyISO();
  const cuentaIds = cuentas.map(c => c.id);

  const { data: planes, error: pErr } = await sb
    .from("calentamiento_plan")
    .select("*")
    .eq("fecha", fecha)
    .in("cuenta_id", cuentaIds);

  if (pErr) {
    console.warn("Plan error:", pErr);
  }

  const planByCuenta = new Map((planes || []).map(p => [p.cuenta_id, p]));

  // 4) Render
  let totalH = 0, totalM = 0, totalR = 0, totalG = 0;

  const tbody = $("tabla-calentamiento");
  tbody.innerHTML = "";

  for (const c of cuentas) {
    const p = planByCuenta.get(c.id) || null;

    const historias = p?.historias ?? 0;
    const muro = p?.muro ?? 0;
    const reels = p?.reels ?? 0;
    const grupos = p?.grupos ?? 0;

    totalH += historias; totalM += muro; totalR += reels; totalG += grupos;

    tbody.innerHTML += `
      <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
        <td>${c.email || "-"}</td>
        <td style="font-weight:800;">${historias}</td>
        <td style="font-weight:800;">${muro}</td>
        <td style="font-weight:800;">${reels}</td>
        <td style="font-weight:800;">${grupos}</td>
        <td class="muted">Hoy</td>
      </tr>
    `;
  }

  $("resumen").textContent =
    `Hoy: Historias ${totalH} • Muro ${totalM} • Reels ${totalR} • Grupos ${totalG} (según plan generado por Gerencia).`;
}
