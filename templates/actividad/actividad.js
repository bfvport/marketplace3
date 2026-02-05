import { requireSession, loadSidebar, fmtDateISO } from "../../assets/js/app.js";

const s = requireSession();
const sb = window.supabaseClient;
const $ = (id) => document.getElementById(id);
const today = fmtDateISO(new Date());

let realtimeChannel = null;

// ====== RANGO "HOY" EN ARG ======
function getARGDayRangeUTC() {
  const now = new Date();
  const arg = new Date(
    now.toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" })
  );
  const y = arg.getFullYear();
  const m = arg.getMonth();
  const d = arg.getDate();

  const startUTC = new Date(Date.UTC(y, m, d, 3, 0, 0));
  const endUTC = new Date(Date.UTC(y, m, d + 1, 3, 0, 0));
  return { start: startUTC.toISOString(), end: endUTC.toISOString() };
}

function formatHoraARG(iso) {
  return new Date(iso).toLocaleTimeString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function escapeCSV(v) {
  const s = String(v ?? "");
  if (s.includes("\n") || s.includes(",") || s.includes('"'))
    return `"${s.replaceAll('"', '""')}"`;
  return s;
}

function shortEmail(email) {
  if (!email) return "-";
  if (email.length <= 24) return email;
  return email.slice(0, 10) + "..." + email.slice(-10);
}

// ====== INIT ======
(async function init() {
  await loadSidebar({ activeKey: "actividad", basePath: "../" });

  if (s.rol !== "gerente") {
    document.body.innerHTML =
      "<h1 style='color:white;text-align:center;margin-top:50px;'>⛔ Solo Gerencia</h1>";
    return;
  }

  // reloj ARG
  setInterval(() => {
    if ($("reloj-arg")) {
      $("reloj-arg").textContent = new Date().toLocaleTimeString("es-AR", {
        timeZone: "America/Argentina/Buenos_Aires",
      });
    }
  }, 1000);

  if ($("btn-descargar")) $("btn-descargar").onclick = descargarCSV;
  if ($("btn-limpiar")) $("btn-limpiar").onclick = limpiarLogs;

  await cargarMonitor();
  activarRealtime();
})();

// ====== REALTIME ======
function activarRealtime() {
  if (realtimeChannel) return;

  realtimeChannel = sb
    .channel("actividad-tiempo-real")

    // logins / logouts
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "usuarios_actividad" },
      () => cargarMonitor()
    )

    // publicaciones marketplace
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "marketplace_actividad" },
      () => cargarMonitor()
    )

    // calentamiento
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "calentamiento_plan" },
      () => cargarMonitor()
    )

    // métricas
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "metricas" },
      () => cargarMonitor()
    )

    .subscribe((status) => {
      console.log("Realtime:", status);
    });
}

// ====== MONITOR ======
async function cargarMonitor() {
  try {
    const { start, end } = getARGDayRangeUTC();

    const [resAsig, resMarket, resCalent, resMetricas, resCuentas, resLogs] =
      await Promise.all([
        sb
          .from("usuarios_asignado")
          .select("*")
          .lte("fecha_desde", today)
          .gte("fecha_hasta", today),

        sb
          .from("marketplace_actividad")
          .select("usuario, facebook_account_usada, fecha_publicacion")
          .gte("fecha_publicacion", start)
          .lte("fecha_publicacion", end),

        sb.from("calentamiento_plan").select("*").eq("fecha", today),

        sb.from("metricas").select("usuario, created_at").order("created_at", {
          ascending: false,
        }),

        sb.from("cuentas_facebook").select("email, ocupada_por"),

        sb
          .from("usuarios_actividad")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(200),
      ]);

    const asignaciones = resAsig.data || [];
    const marketplaceData = resMarket.data || [];
    const logs = resLogs.data || [];
    const cuentasFB = resCuentas.data || [];
    const calent = resCalent.data || [];
    const metricas = resMetricas.data || [];

    // cuentas por usuario
    const cuentasPorUsuario = new Map();
    for (const c of cuentasFB) {
      if (!c.ocupada_por) continue;
      if (!cuentasPorUsuario.has(c.ocupada_por))
        cuentasPorUsuario.set(c.ocupada_por, []);
      cuentasPorUsuario.get(c.ocupada_por).push(c.email);
    }

    // publicaciones por usuario + cuenta
    const donePorUserCuenta = new Map();
    for (const row of marketplaceData) {
      const key = `${row.usuario}||${row.facebook_account_usada}`;
      donePorUserCuenta.set(key, (donePorUserCuenta.get(key) || 0) + 1);
    }

    // --- TARJETAS ---
    const grid = $("grid-team");
    grid.innerHTML = "";

    asignaciones.forEach((asig) => {
      const u = asig.usuario;
      const cuentas = cuentasPorUsuario.get(u) || [];
      const metaPorCuenta = asig.marketplace_daily || 0;

      let totalDone = 0;
      const detalleCuentas = [];

      cuentas.forEach((email) => {
        const done = donePorUserCuenta.get(`${u}||${email}`) || 0;
        totalDone += done;
        detalleCuentas.push({ email, done, meta: metaPorCuenta });
      });

      const totalMeta =
        cuentas.length > 0 ? cuentas.length * metaPorCuenta : metaPorCuenta;

      const porcMP =
        totalMeta > 0 ? Math.min((totalDone / totalMeta) * 100, 100) : 0;

      const hechosCalent = calent.filter((x) => x.usuario === u).length;
      const ultMetrica = metricas.find((m) => m.usuario === u);

      const lastLog = logs.find((l) => l.usuario === u);
      const isOnline =
        lastLog &&
        new Date() - new Date(lastLog.created_at) < 20 * 60 * 1000;

      let cuentasHTML = "";
      if (detalleCuentas.length > 0) {
        cuentasHTML = detalleCuentas
          .slice(0, 5)
          .map(
            (c) => `
            <div class="stat-row" style="border-bottom:none;">
              <span class="muted">${shortEmail(c.email)}</span>
              <strong>${c.done}/${c.meta}</strong>
            </div>`
          )
          .join("");
      } else {
        cuentasHTML = `<div class="muted" style="font-size:0.75rem;">Sin cuentas asignadas</div>`;
      }

      grid.innerHTML += `
        <div class="op-card">
          <div class="op-header">
            <div><span class="status-dot ${
              isOnline ? "online" : "offline"
            }"></span><strong>${u}</strong></div>
            <span class="muted">${asig.categoria || "-"}</span>
          </div>
          <div class="op-body">
            <div>
              <div style="display:flex; justify-content:space-between;">
                <span>📦 Marketplace</span>
                <strong>${totalDone}/${totalMeta}</strong>
              </div>
              <div class="progress-bg"><div class="progress-fill" style="width:${porcMP}%"></div></div>
              ${cuentasHTML}
            </div>

            <div class="stat-row">
              <span>🔥 Calentamiento</span>
              <span class="badge ${
                hechosCalent > 0 ? "bg-green" : "bg-yellow"
              }">${hechosCalent > 0 ? "Hecho" : "Pendiente"}</span>
            </div>

            <div class="stat-row">
              <span>📊 Métricas</span>
              <span class="badge ${
                ultMetrica ? "bg-green" : "bg-red"
              }">${ultMetrica ? "OK" : "Sin datos"}</span>
            </div>
          </div>
        </div>
      `;
    });

    // --- LOGS ---
    const tbody = $("tabla-logs");
    tbody.innerHTML = "";

    logs.forEach((l) => {
      tbody.innerHTML += `
        <tr>
          <td style="color:#94a3b8;">${formatHoraARG(l.created_at)}</td>
          <td style="font-weight:bold;">${l.usuario}</td>
          <td>${l.evento}</td>
          <td class="muted">${l.cuenta_fb || "-"}</td>
        </tr>
      `;
    });
  } catch (err) {
    console.error("Error en monitor:", err);
  }
}

// ====== EXPORTAR CSV ======
async function descargarCSV() {
  const { data } = await sb
    .from("usuarios_actividad")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5000);

  const header = ["created_at", "usuario", "evento", "cuenta_fb"].join(",");
  const lines = (data || []).map((r) =>
    [
      escapeCSV(r.created_at),
      escapeCSV(r.usuario),
      escapeCSV(r.evento),
      escapeCSV(r.cuenta_fb),
    ].join(",")
  );

  const csv = [header, ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `actividad_${today}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ====== LIMPIAR ======
async function limpiarLogs() {
  if (!confirm("¿Seguro que querés borrar el historial?")) return;
  const { error } = await sb.from("usuarios_actividad").delete().neq("id", 0);
  if (!error) cargarMonitor();
}
