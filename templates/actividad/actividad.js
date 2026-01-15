import { requireSession, loadSidebar, fmtDateISO } from "../../assets/js/app.js";

const s = requireSession();
const sb = window.supabaseClient;
const $ = (id) => document.getElementById(id);
const today = fmtDateISO(new Date());

const AUTO_REFRESH_MS = 10000;

// ====== RANGO "HOY" EN ARG ======
function getARGDayRangeUTC() {
  const now = new Date();
  const arg = new Date(now.toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  const y = arg.getFullYear();
  const m = arg.getMonth();
  const d = arg.getDate();
  return {
    start: new Date(Date.UTC(y, m, d, 3, 0, 0)).toISOString(),
    end: new Date(Date.UTC(y, m, d + 1, 3, 0, 0)).toISOString(),
  };
}

function horaARG(iso) {
  return new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

// ===== INIT =====
init();
async function init() {
  await loadSidebar(s, "actividad");

  if (!s || s.rol !== "gerente") {
    document.body.innerHTML = "<h2 style='padding:20px'>Acceso denegado</h2>";
    return;
  }

  $("hoy").innerText = today;

  await cargarActividad();
  setInterval(cargarActividad, AUTO_REFRESH_MS);
}

// ===== CORE =====
async function cargarActividad() {
  try {
    const { start, end } = getARGDayRangeUTC();

    const [asig, logs, market, planes, cuentas] = await Promise.all([
      sb.from("usuarios_asignado").select("*").lte("fecha_desde", today).gte("fecha_hasta", today),
      sb.from("usuarios_actividad").select("*").gte("created_at", start).lt("created_at", end).order("created_at", { ascending: false }),
      sb.from("marketplace_actividad").select("*").gte("fecha_publicacion", start).lt("fecha_publicacion", end),
      sb.from("calentamiento_plan").select("*").eq("fecha", today),
      sb.from("cuentas_facebook").select("id,email,ocupada_por")
    ]);

    if (asig.error || logs.error || market.error || planes.error || cuentas.error) {
      console.error(asig.error || logs.error || market.error || planes.error || cuentas.error);
      return;
    }

    renderLogs(logs.data || []);
    renderOperadores(asig.data || [], logs.data || [], market.data || [], planes.data || [], cuentas.data || []);

  } catch (e) {
    console.error("ACTIVIDAD ERROR:", e);
  }
}

// ===== LOGS =====
function renderLogs(logs) {
  const tbody = $("tabla-logs");
  tbody.innerHTML = "";

  logs.forEach(l => {
    tbody.innerHTML += `
      <tr>
        <td>${horaARG(l.created_at)}</td>
        <td>${l.usuario || "-"}</td>
        <td>${l.evento || "-"}</td>
        <td>${l.cuenta_fb || "-"}</td>
      </tr>
    `;
  });
}

// ===== OPERADORES =====
function renderOperadores(asignados, logs, market, planes, cuentas) {
  const grid = $("grid-operadores");
  grid.innerHTML = "";

  const cuentasPorOp = {};
  cuentas.forEach(c => {
    if (!c.ocupada_por) return;
    if (!cuentasPorOp[c.ocupada_por]) cuentasPorOp[c.ocupada_por] = [];
    cuentasPorOp[c.ocupada_por].push(c);
  });

  const marketPorOp = {};
  market.forEach(m => {
    if (!marketPorOp[m.usuario]) marketPorOp[m.usuario] = [];
    marketPorOp[m.usuario].push(m);
  });

  const planPorOp = {};
  planes.forEach(p => {
    if (!planPorOp[p.usuario]) planPorOp[p.usuario] = { rh:0, rm:0, rr:0, rg:0, dh:0, dm:0, dr:0, dg:0 };
    const o = planPorOp[p.usuario];
    o.rh+=p.req_historias||0; o.rm+=p.req_muro||0; o.rr+=p.req_reels||0; o.rg+=p.req_grupos||0;
    o.dh+=p.done_historias||0; o.dm+=p.done_muro||0; o.dr+=p.done_reels||0; o.dg+=p.done_grupos||0;
  });

  asignados.forEach(op => {
    const u = op.usuario;
    const totalMP = (marketPorOp[u] || []).length;
    const totalCuentas = (cuentasPorOp[u] || []).length;
    const p = planPorOp[u] || {};

    grid.innerHTML += `
      <div class="op-card">
        <div class="op-header">
          <strong>${u}</strong>
          <span class="muted">${op.categoria || ""}</span>
        </div>

        <div class="op-body">
          <div class="stat-row"><span>📦 Marketplace</span><strong>${totalMP}/${totalCuentas}</strong></div>
          <div class="stat-row"><span>🔥 Calentamiento</span>
            <small>H ${p.dh||0}/${p.rh||0} · M ${p.dm||0}/${p.rm||0} · R ${p.dr||0}/${p.rr||0} · G ${p.dg||0}/${p.rg||0}</small>
          </div>
        </div>
      </div>
    `;
  });
}
