// templates/dashboard/logica.js

const supabase = window.supabaseClient;

const $ = (id) => document.getElementById(id);

// ====== FECHA ARG / RANGO ======
function getArgentinaISODate() {
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
  const now = new Date();
  const argNow = new Date(
    now.toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" })
  );

  const y = argNow.getFullYear();
  const m = argNow.getMonth();
  const d = argNow.getDate();

  // 00:00:00 ARG ~ 03:00:00 UTC (UTC-3)
  const startUTC = new Date(Date.UTC(y, m, d, 3, 0, 0));
  // 23:59:59 ARG ~ 26:59:59 UTC (día siguiente)
  const endUTC = new Date(Date.UTC(y, m, d, 26, 59, 59));

  return {
    today: getArgentinaISODate(),
    start: startUTC.toISOString(),
    end: endUTC.toISOString(),
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
    alert("Acceso denegado: Solo gerente puede ver el Dashboard.");
    window.location.href = "/templates/login/login.html";
    return false;
  }
  return true;
}

// ====== DATA ======
async function getOperadoresAsignados() {
  const { data, error } = await supabase
    .from("usuarios_asignado")
    .select(
      "id, usuario, marketplace_daily, historia_daily, muro_daily, reels_daily, grupos_daily"
    )
    .order("id", { ascending: true });

  if (error) {
    console.error(error);
    throw new Error("Error cargando usuarios asignados");
  }
  return data || [];
}

async function countMarketplaceByUserToday(usuario, range) {
  // ✅ FIX: fecha_publicacion es timestamp ISO, así que filtramos por rango del día
  const { data, error } = await supabase
    .from("marketplace_actividad")
    .select("id")
    .eq("usuario", usuario)
    .gte("fecha_publicacion", range.start)
    .lte("fecha_publicacion", range.end);

  if (error) {
    console.error("Error contando marketplace:", error);
    return 0;
  }
  return Array.isArray(data) ? data.length : 0;
}

function renderPendientesCard({ usuario, pendientes }) {
  const cont = $("pendientes-container");
  if (!cont) return;

  const items = pendientes
    .map(
      (p) => `
        <li>
          <span class="tipo">${p.tipo}</span>
          <span class="cant">${p.falta}</span>
        </li>
      `
    )
    .join("");

  const html = `
    <div class="card-pendientes">
      <div class="header">
        <div class="usuario">${usuario}</div>
        <div class="fecha">${getArgentinaISODate()}</div>
      </div>
      <ul class="lista">
        ${items || `<li class="ok">Todo al día ✅</li>`}
      </ul>
    </div>
  `;

  cont.insertAdjacentHTML("beforeend", html);
}

// ====== MAIN LOGIC ======
async function cargarPendientesDashboard() {
  const range = getArgentinaDayRangeISO();

  const cont = $("pendientes-container");
  if (cont) cont.innerHTML = "";

  const asignados = await getOperadoresAsignados();

  for (const u of asignados) {
    const usuario = u.usuario;

    // Marketplace (hechos vs meta)
    const metaMarketplace = u.marketplace_daily ?? 0;
    const hechoMarketplace = await countMarketplaceByUserToday(usuario, range);
    const faltaMarketplace = Math.max(metaMarketplace - hechoMarketplace, 0);

    // Nota: historias/muro/reels/grupos no se pueden calcular “hechos” si no hay tabla de registro.
    // Por ahora, el dashboard solo puede marcar marketplace real.
    const pendientes = [];

    if (faltaMarketplace > 0) {
      pendientes.push({ tipo: "Marketplace", falta: faltaMarketplace });
    }

    renderPendientesCard({ usuario, pendientes });
  }
}

// ====== INIT ======
document.addEventListener("DOMContentLoaded", async () => {
  await loadSidebar();

  const ok = await verificarGerente();
  if (!ok) return;

  try {
    await cargarPendientesDashboard();
  } catch (e) {
    console.error(e);
    alert("Error cargando Dashboard.");
  }
});
