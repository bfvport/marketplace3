import { requireSession, loadSidebar } from "../../assets/js/app.js";

const s = requireSession();
const sb = window.supabaseClient;
const $ = (id) => document.getElementById(id);

await loadSidebar({ activeKey: "metricas", basePath: "../" });

let chart = null;

async function init() {
  await cargarCuentasSelects();
  await cargarHistorial();
  await verificarAlertasLocales();

  if (String(s.rol).toLowerCase() === "gerente") {
    $("card-grafico").style.display = "block";
    $("btn-actualizar-grafico").onclick = cargarGrafico;
    await cargarGrafico();
  }

  $("btn-guardar").onclick = guardarMetricaSemanal;
}

async function cargarCuentasSelects() {
  // Operador: solo las ocupadas_por = su usuario
  // Gerente: todas las cuentas (para ver todo)
  let q = sb.from("cuentas_facebook").select("email").order("email", { ascending: true });
  if (String(s.rol).toLowerCase() !== "gerente") q = q.eq("ocupada_por", s.usuario);

  const { data, error } = await q;
  if (error) {
    alert("Error cargando cuentas: " + error.message);
    return;
  }

  const selCarga = $("sel-cuenta");
  selCarga.innerHTML = "";

  if (!data || data.length === 0) {
    selCarga.innerHTML = "<option value=''>No tienes cuentas asignadas</option>";
  } else {
    data.forEach(c => {
      selCarga.innerHTML += `<option value="${c.email}">${c.email}</option>`;
    });
  }

  // Selector de gráfico (solo gerente)
  const selGraf = $("sel-cuenta-grafico");
  if (selGraf) {
    selGraf.innerHTML = `<option value="ALL">Todas las cuentas</option>`;
    (data || []).forEach(c => {
      selGraf.innerHTML += `<option value="${c.email}">${c.email}</option>`;
    });
  }
}

async function guardarMetricaSemanal() {
  const cuenta = $("sel-cuenta").value;
  const clicksRaw = $("inp-clicks").value;

  if (!cuenta) return alert("No hay cuenta seleccionada.");
  const clicks = Number(clicksRaw);
  if (!Number.isFinite(clicks) || clicks < 0) return alert("Ingresa una cantidad válida de clicks.");

  // Semana ISO (lunes 00:00 -> lunes siguiente)
  const now = new Date();
  const start = startOfISOWeekUTC(now);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);

  // Si ya existe una carga en esta semana para esta cuenta y este usuario -> UPDATE
  const { data: existentes, error: errBusca } = await sb
    .from("metricas")
    .select("id, created_at")
    .eq("usuario", s.usuario)
    .eq("mail", cuenta)
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString())
    .order("created_at", { ascending: false })
    .limit(1);

  if (errBusca) return alert("Error buscando semana: " + errBusca.message);

  if (existentes && existentes.length > 0) {
    const id = existentes[0].id;

    const { error: errUpd } = await sb
      .from("metricas")
      .update({
        clicks_7_dias_marketplace: clicks,
        tipo_cuenta: "facebook", // Marketplace vive en Facebook
        updated_at: new Date().toISOString()
      })
      .eq("id", id);

    if (errUpd) return alert("Error al actualizar: " + errUpd.message);

    alert("✅ Semana actualizada (no se duplicó).");
  } else {
    const { error: errIns } = await sb.from("metricas").insert([{
      usuario: s.usuario,
      mail: cuenta,
      clicks_7_dias_marketplace: clicks,
      tipo_cuenta: "facebook",
      created_at: new Date().toISOString()
    }]);

    if (errIns) return alert("Error al guardar: " + errIns.message);

    alert("✅ Métrica guardada.");
  }

  $("inp-clicks").value = "";
  await cargarHistorial();
  await verificarAlertasLocales();
  if (String(s.rol).toLowerCase() === "gerente") await cargarGrafico();
}

async function cargarHistorial() {
  let query = sb.from("metricas").select("*").order("created_at", { ascending: false }).limit(30);
  if (String(s.rol).toLowerCase() !== "gerente") query = query.eq("usuario", s.usuario);

  const { data, error } = await query;
  if (error) {
    alert("Error cargando historial: " + error.message);
    return;
  }

  const tbody = $("lista-metricas");
  tbody.innerHTML = "";

  if (!data || data.length === 0) {
    tbody.innerHTML = "<tr><td colspan='4' class='muted'>No hay registros recientes.</td></tr>";
    return;
  }

  data.forEach(m => {
    const email = m.mail || m.email_cuenta || "Sin datos";
    const clicks = Number(m.clicks_7_dias_marketplace ?? m.clicks_7_dias ?? 0);
    const week = isoWeekLabelUTC(new Date(m.created_at));

    tbody.innerHTML += `
      <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
        <td style="padding:8px; color:#94a3b8;">${week}</td>
        <td style="padding:8px;">${email}</td>
        <td style="padding:8px; font-weight:bold; color:#60a5fa;">${clicks}</td>
        <td style="padding:8px;">${m.usuario}</td>
      </tr>
    `;
  });
}

async function verificarAlertasLocales() {
  const { data, error } = await sb.from("metricas")
    .select("created_at")
    .eq("usuario", s.usuario)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) return;

  const alertaBox = $("alerta-carga");

  if (!data || data.length === 0) {
    alertaBox.style.display = "block";
    $("texto-alerta").textContent = "Nunca has cargado métricas. Por favor carga tu primer reporte.";
    return;
  }

  const ultimaFecha = new Date(data[0].created_at);
  const hoy = new Date();
  const diffDias = Math.floor((hoy - ultimaFecha) / (1000 * 60 * 60 * 24));

  if (diffDias >= 7) {
    alertaBox.style.display = "block";
    $("texto-alerta").textContent = `Hace ${diffDias} días que no registras métricas. Recuerda hacerlo semanalmente.`;
  } else {
    alertaBox.style.display = "none";
  }
}

async function cargarGrafico() {
  const selCuenta = $("sel-cuenta-grafico").value;
  const semanas = Number($("sel-periodo").value);

  // Armamos el rango: desde el lunes de (hoy - (semanas-1)) hasta hoy
  const now = new Date();
  const startThisWeek = startOfISOWeekUTC(now);
  const startRange = new Date(startThisWeek);
  startRange.setUTCDate(startRange.getUTCDate() - (7 * (semanas - 1)));

  let q = sb.from("metricas")
    .select("mail, clicks_7_dias_marketplace, clicks_7_dias, created_at")
    .gte("created_at", startRange.toISOString())
    .order("created_at", { ascending: true });

  if (selCuenta !== "ALL") q = q.eq("mail", selCuenta);

  const { data, error } = await q;
  if (error) {
    alert("Error cargando gráfico: " + error.message);
    return;
  }

  // Labels: semanas fijas (aunque no haya datos)
  const labels = [];
  const weekStarts = [];
  for (let i = 0; i < semanas; i++) {
    const ws = new Date(startRange);
    ws.setUTCDate(ws.getUTCDate() + (i * 7));
    weekStarts.push(ws);
    labels.push(isoWeekLabelUTC(ws));
  }

  // Agrupar por semana+cuenta: nos quedamos con el ÚLTIMO valor de esa semana
  const map = {}; // map[weekLabel][mail] = clicks
  const lastTs = {}; // lastTs[weekLabel][mail] = created_at ms

  (data || []).forEach(r => {
    const mail = r.mail || r.email_cuenta || "Sin mail";
    const clicks = Number(r.clicks_7_dias_marketplace ?? r.clicks_7_dias ?? 0);
    const wk = isoWeekLabelUTC(new Date(r.created_at));
    map[wk] ??= {};
    lastTs[wk] ??= {};

    const t = new Date(r.created_at).getTime();
    const prev = lastTs[wk][mail] ?? -1;
    if (t >= prev) {
      lastTs[wk][mail] = t;
      map[wk][mail] = clicks;
    }
  });

  const cuentas = selCuenta === "ALL"
    ? [...new Set((data || []).map(r => r.mail || r.email_cuenta).filter(Boolean))].sort()
    : [selCuenta];

  const datasets = cuentas.map((mail) => ({
    label: mail,
    data: labels.map(w => map[w]?.[mail] ?? 0),
    borderWidth: 2,
    tension: 0.35
  }));

  if (chart) chart.destroy();
  chart = new Chart($("grafico-metricas"), {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      plugins: { legend: { position: "bottom" } },
      scales: {
        y: { beginAtZero: true }
      }
    }
  });
}

/* ===== Helpers Semana ISO (UTC) ===== */
function startOfISOWeekUTC(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7; // 1..7 (lunes=1)
  if (day !== 1) d.setUTCDate(d.getUTCDate() - (day - 1));
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function isoWeekLabelUTC(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // jueves de la semana define el año ISO
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  const year = d.getUTCFullYear();
  return `${year}-W${String(weekNo).padStart(2, "0")}`;
}

init();
