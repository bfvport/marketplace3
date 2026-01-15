// templates/actividad/actividad.js

const supabase = window.supabaseClient;

const $ = (id) => document.getElementById(id);

// ====== UTILS FECHA (ARG) ======
function getArgentinaISODate() {
  // Devuelve YYYY-MM-DD en horario Argentina
  const now = new Date();
  const arg = new Date(
    now.toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" })
  );
  const y = arg.getFullYear();
  const m = String(arg.getMonth() + 1).padStart(2, "0");
  const d = String(arg.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getArgentinaDayRangeISO() {
  // Devuelve start/end ISO para filtrar por rango del día (Argentina)
  const today = getArgentinaISODate(); // YYYY-MM-DD

  // Armamos rango "día ARG" convertido a UTC ISO usando Date con TZ local string
  // Truco: construimos fechas en ARG via toLocaleString y parseamos.
  const startLocal = new Date(`${today}T00:00:00`);
  const endLocal = new Date(`${today}T23:59:59`);

  // OJO: esto usa TZ del sistema. Para evitar líos, convertimos desde un "now" en ARG:
  const now = new Date();
  const argNow = new Date(
    now.toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" })
  );

  // Tomamos y/m/d de ARG, y creamos un Date en UTC equivalente a ese día en ARG
  const y = argNow.getFullYear();
  const m = argNow.getMonth();
  const d = argNow.getDate();

  // 00:00:00 ARG = 03:00:00 UTC aprox (depende DST; ARG no usa DST normalmente)
  // Para ser consistente, usamos Date.UTC y restamos 3 horas (UTC-3).
  const startUTC = new Date(Date.UTC(y, m, d, 3, 0, 0));
  const endUTC = new Date(Date.UTC(y, m, d, 26, 59, 59)); // 23:59:59 ARG => +3h = 26:59:59 UTC (día siguiente)

  // Normalizamos endUTC al valor real:
  // UTC(y,m,d,26,59,59) automáticamente se pasa al día siguiente.
  return {
    start: startUTC.toISOString(),
    end: endUTC.toISOString(),
    today,
  };
}

// ====== SIDEBAR ======
async function loadSidebar() {
  try {
    const res = await fetch("/templates/sidebar.html");
    const html = await res.text();
    const cont = $("sidebar-container");
    if (cont) cont.innerHTML = html;
  } catch (e) {
    console.error("Error cargando sidebar:", e);
  }
}

// ====== PERMISOS ======
async function verificarGerente() {
  const rol = localStorage.getItem("rol");
  if (rol !== "gerente") {
    alert("Acceso denegado: Solo gerente puede ver esta sección.");
    window.location.href = "/templates/login/login.html";
    return false;
  }
  return true;
}

// ====== RELOJ ARG ======
function iniciarRelojArgentina() {
  const el = $("hora-argentina");
  if (!el) return;

  const tick = () => {
    const now = new Date();
    const argTime = now.toLocaleString("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    el.textContent = argTime;
  };

  tick();
  setInterval(tick, 1000);
}

// ====== RENDER ======
function setLoading(id, loading) {
  const el = $(id);
  if (!el) return;
  el.innerHTML = loading
    ? `<div class="loading">Cargando...</div>`
    : el.innerHTML;
}

function renderOperadorCard({ operador, marketplace, calentamiento, metricas }) {
  const cont = $("operadores-container");
  if (!cont) return;

  const mpDone = marketplace?.done ?? 0;
  const mpMeta = marketplace?.meta ?? 0;

  const calDone = calentamiento?.done ?? false;
  const metDone = metricas?.done ?? false;

  const mpPct = mpMeta > 0 ? Math.round((mpDone / mpMeta) * 100) : 0;

  const html = `
    <div class="card-operador">
      <div class="card-header">
        <div class="nombre">${operador}</div>
        <div class="fecha">${getArgentinaISODate()}</div>
      </div>

      <div class="bloque">
        <div class="titulo">Marketplace</div>
        <div class="linea">
          <span>Hechos:</span> <b>${mpDone}</b> / <b>${mpMeta}</b>
          <span class="pct">(${mpPct}%)</span>
        </div>
        <div class="barra">
          <div class="barra-inner" style="width:${Math.min(mpPct, 100)}%"></div>
        </div>
      </div>

      <div class="bloque">
        <div class="titulo">Calentamiento</div>
        <div class="linea">
          <span>Estado:</span>
          <b class="${calDone ? "ok" : "pend"}">${
            calDone ? "Hecho" : "Pendiente"
          }</b>
        </div>
      </div>

      <div class="bloque">
        <div class="titulo">Métricas</div>
        <div class="linea">
          <span>Estado:</span>
          <b class="${metDone ? "ok" : "pend"}">${
            metDone ? "Al día" : "Atrasado"
          }</b>
        </div>
      </div>
    </div>
  `;

  cont.insertAdjacentHTML("beforeend", html);
}

// ====== DATA LOAD ======
async function getOperadoresAsignados() {
  const { data, error } = await supabase
    .from("usuarios_asignado")
    .select("id, usuario, marketplace_daily, historia_daily, muro_daily, reels_daily, grupos_daily")
    .order("id", { ascending: true });

  if (error) {
    console.error(error);
    throw new Error("Error cargando usuarios asignados");
  }
  return data || [];
}

async function getMarketplaceDoneByUserForToday(usuario, range) {
  // marketplace_actividad tiene fecha_publicacion (timestamp ISO)
  const { data, error } = await supabase
    .from("marketplace_actividad")
    .select("id", { count: "exact" })
    .eq("usuario", usuario)
    .gte("fecha_publicacion", range.start)
    .lte("fecha_publicacion", range.end);

  if (error) {
    console.error("MP count error:", error);
    return 0;
  }

  // supabase-js devuelve count en data? depende. Usamos length si data viene.
  return Array.isArray(data) ? data.length : 0;
}

async function getCalentamientoDone(usuario, today) {
  const { data, error } = await supabase
    .from("calentamiento_actividad")
    .select("id, estado")
    .eq("usuario", usuario)
    .eq("fecha", today)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error("Calentamiento error:", error);
    return false;
  }

  if (!data || data.length === 0) return false;
  return data[0]?.estado === "hecho";
}

async function getMetricasDone(usuario, today) {
  // Dependiendo tu lógica, acá asumo que en metricas hay created_at y usuario
  // y que una métrica "de hoy" existe si hay registro hoy.
  const { start, end } = getArgentinaDayRangeISO();

  const { data, error } = await supabase
    .from("metricas")
    .select("id")
    .eq("usuario", usuario)
    .gte("created_at", start)
    .lte("created_at", end)
    .limit(1);

  if (error) {
    console.error("Metricas error:", error);
    return false;
  }
  return !!(data && data.length > 0);
}

async function cargarActividadOperadores() {
  const range = getArgentinaDayRangeISO();

  const cont = $("operadores-container");
  if (cont) cont.innerHTML = "";

  const asignados = await getOperadoresAsignados();

  for (const u of asignados) {
    const usuario = u.usuario;

    const mpDone = await getMarketplaceDoneByUserForToday(usuario, range);
    const mpMeta = u.marketplace_daily ?? 0;

    const calDone = await getCalentamientoDone(usuario, range.today);
    const metDone = await getMetricasDone(usuario, range.today);

    renderOperadorCard({
      operador: usuario,
      marketplace: { done: mpDone, meta: mpMeta },
      calentamiento: { done: calDone },
      metricas: { done: metDone },
    });
  }
}

// ====== LOGINS / LOGOUTS ======
function renderTablaActividad(rows) {
  const tbody = $("tabla-actividad-body");
  if (!tbody) return;

  tbody.innerHTML = "";

  for (const r of rows) {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${r.usuario ?? "-"}</td>
      <td>${r.evento ?? "-"}</td>
      <td>${r.cuenta_fb ?? "-"}</td>
      <td>${r.estado ?? "-"}</td>
      <td>${r.created_at ? new Date(r.created_at).toLocaleString("es-AR") : "-"}</td>
    `;

    tbody.appendChild(tr);
  }
}

async function cargarTablaActividadHoy() {
  const { start, end } = getArgentinaDayRangeISO();

  const { data, error } = await supabase
    .from("usuarios_actividad")
    .select("*")
    .gte("created_at", start)
    .lte("created_at", end)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error tabla actividad:", error);
    return;
  }

  renderTablaActividad(data || []);
}

// ====== INIT ======
document.addEventListener("DOMContentLoaded", async () => {
  await loadSidebar();
  iniciarRelojArgentina();

  const ok = await verificarGerente();
  if (!ok) return;

  try {
    await cargarActividadOperadores();
    await cargarTablaActividadHoy();
  } catch (e) {
    console.error(e);
    alert("Error cargando Actividad.");
  }
});
