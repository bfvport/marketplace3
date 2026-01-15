import { requireSession, loadSidebar, fmtDateISO } from "../../assets/js/app.js";

const s = requireSession();
const sb = window.supabaseClient;
const $ = (id) => document.getElementById(id);
const today = fmtDateISO(new Date());

// ===== AUTO REFRESH (gerente no refresca manual) =====
const AUTO_REFRESH_MS = 10000; // 10s (podés cambiar a 5000 o 15000 si querés)
let autoTimer = null;

// ====== RANGO "HOY" EN ARG (UTC para timestamps) ======
function getARGDayRangeUTC() {
  const now = new Date();
  const arg = new Date(
    now.toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" })
  );
  const y = arg.getFullYear();
  const m = arg.getMonth();
  const d = arg.getDate();

  // Argentina UTC-3 → [03:00Z, 03:00Z+1d)
  const startUTC = new Date(Date.UTC(y, m, d, 3, 0, 0));
  const endUTC = new Date(Date.UTC(y, m, d + 1, 3, 0, 0));
  return { start: startUTC.toISOString(), end: endUTC.toISOString() };
}

function formatHoraARG(iso) {
  return new Date(iso).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escapeCSV(val) {
  if (val == null) return "";
  const s = String(val);
  if (s.includes('"') || s.includes(",") || s.includes("\n")) {
    return `"${s.replaceAll('"', '""')}"`;
  }
  return s;
}

function shortEmail(email) {
  if (!email) return "-";
  if (email.length <= 25) return email;
  return email.slice(0, 10) + "..." + email.slice(-10);
}

async function init() {
  await loadSidebar(s, "actividad");

  // Solo gerente ve esto
  if (!s || s.rol !== "gerente") {
    document.body.innerHTML =
      "<h1 style='padding:24px;font-family:system-ui'>Acceso denegado</h1>";
    return;
  }

  $("hoy") && ($("hoy").textContent = today);

  await cargarMonitor();

  $("btn-refresh")?.addEventListener("click", cargarMonitor);
  $("btn-csv")?.addEventListener("click", descargarCSV);
  $("btn-limpiar")?.addEventListener("click", limpiarLogs);

  // ✅ Auto-refresh
  autoTimer = setInterval(() => {
    cargarMonitor();
  }, AUTO_REFRESH_MS);

  // ✅ Pausar si la pestaña no está visible (ahorra recursos)
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (autoTimer) clearInterval(autoTimer);
      autoTimer = null;
    } else {
      if (!autoTimer) autoTimer = setInterval(() => cargarMonitor(), AUTO_REFRESH_MS);
      cargarMonitor();
    }
  });
}

async function cargarMonitor() {
  try {
    const { start, end } = getARGDayRangeUTC();

    // Traemos datos clave
    const [resAsig, resMarket, resCalent, resCuentas, resLogs, resMetricas] =
      await Promise.all([
        // Operadores asignados HOY
        sb
          .from("usuarios_asignado")
          .select("*")
          .lte("fecha_desde", today)
          .gte("fecha_hasta", today),

        // Marketplace HOY
        sb
          .from("marketplace_actividad")
          .select("usuario, facebook_account_usada, fecha_publicacion")
          .gte("fecha_publicacion", start)
          .lt("fecha_publicacion", end),

        // Calentamiento HOY (plan)
        sb
          .from("calentamiento_plan")
          .select(
            "fecha, cuenta_id, usuario, req_historias, req_muro, req_reels, req_grupos, done_historias, done_muro, done_reels, done_grupos, estado"
          )
          .eq("fecha", today),

        // Cuentas y a quién están ocupadas/asignadas
        sb.from("cuentas_facebook").select("id, email, ocupada_por"),

        // Logs de actividad HOY (entrada/salida)
        sb
          .from("usuarios_actividad")
          .select("*")
          .order("created_at", { ascending: false })
          .gte("created_at", start)
          .lt("created_at", end),

        // Métricas (si querés ver si cargó métricas hoy)
        sb
          .from("metricas")
          .select("usuario, created_at")
          .order("created_at", { ascending: false }),
      ]);

    if (resAsig.error) throw resAsig.error;
    if (resMarket.error) throw resMarket.error;
    if (resCalent.error) throw resCalent.error;
    if (resCuentas.error) throw resCuentas.error;
    if (resLogs.error) throw resLogs.error;
    if (resMetricas.error) throw resMetricas.error;

    const asignados = resAsig.data || [];
    const market = resMarket.data || [];
    const planes = resCalent.data || [];
    const cuentasFB = resCuentas.data || [];
    const logs = resLogs.data || [];
    const metricas = resMetricas.data || [];

    // ---- MAPAS ----

    // cuentas por operador (ocupada_por)
    const cuentasPorOp = new Map(); // usuario => [{id,email}]
    for (const c of cuentasFB) {
      const u = c.ocupada_por;
      if (!u) continue;
      if (!cuentasPorOp.has(u)) cuentasPorOp.set(u, []);
      cuentasPorOp.get(u).push({ id: c.id, email: c.email });
    }

    // meta marketplace por usuario = cantidad de cuentas ocupadas
    const metaPorOp = new Map();
    for (const [u, arr] of cuentasPorOp.entries()) metaPorOp.set(u, arr.length);

    // done marketplace por usuario total
    const donePorOpTotal = new Map();

    // done marketplace por usuario por cuenta (id)
    const donePorOpCuenta = new Map(); // usuario => Map(cuentaId => done)

    for (const row of market) {
      const u = row.usuario;
      if (!u) continue;

      donePorOpTotal.set(u, (donePorOpTotal.get(u) || 0) + 1);

      const cuentaId = row.facebook_account_usada;
      if (!cuentaId) continue;

      if (!donePorOpCuenta.has(u)) donePorOpCuenta.set(u, new Map());
      const mapCuenta = donePorOpCuenta.get(u);
      mapCuenta.set(cuentaId, (mapCuenta.get(cuentaId) || 0) + 1);
    }

    // planes por usuario (Historias/Muro/Reels/Grupos)
    const planPorOp = new Map(); // usuario => acumulados
    for (const p of planes) {
      const u = p.usuario;
      if (!u) continue;

      if (!planPorOp.has(u)) {
        planPorOp.set(u, {
          reqH: 0,
          reqM: 0,
          reqR: 0,
          reqG: 0,
          doneH: 0,
          doneM: 0,
          doneR: 0,
          doneG: 0,
        });
      }

      const acc = planPorOp.get(u);
      acc.reqH += Number(p.req_historias || 0);
      acc.reqM += Number(p.req_muro || 0);
      acc.reqR += Number(p.req_reels || 0);
      acc.reqG += Number(p.req_grupos || 0);

      acc.doneH += Number(p.done_historias || 0);
      acc.doneM += Number(p.done_muro || 0);
      acc.doneR += Number(p.done_reels || 0);
      acc.doneG += Number(p.done_grupos || 0);
    }

    // última métrica por usuario
    const ultimaMetricaPorOp = new Map();
    for (const m of metricas) {
      if (!m.usuario) continue;
      if (!ultimaMetricaPorOp.has(m.usuario)) ultimaMetricaPorOp.set(m.usuario, m);
    }

    // ---- RENDER CARDS OPERADORES ----
    const grid = $("grid-operadores");
    if (!grid) return;
    grid.innerHTML = "";

    // Orden
    asignados.sort((a, b) => {
      const ca = (a.categoria || "").localeCompare(b.categoria || "");
      if (ca !== 0) return ca;
      return (a.usuario || "").localeCompare(b.usuario || "");
    });

    asignados.forEach((asig) => {
      const u = asig.usuario;
      if (!u) return;

      // Online/Offline por logs
      const logsU = logs.filter((l) => l.usuario === u);
      const lastEntrada = logsU.find((l) => l.evento === "entrada");
      const lastSalida = logsU.find((l) => l.evento === "salida");
      const isOnline =
        !!lastEntrada &&
        (!lastSalida ||
          new Date(lastEntrada.created_at) > new Date(lastSalida.created_at));

      // Marketplace total
      const totalDone = donePorOpTotal.get(u) || 0;
      const totalMeta = metaPorOp.get(u) || 0;
      const porcMP =
        totalMeta > 0 ? Math.min(100, Math.round((totalDone / totalMeta) * 100)) : 0;

      // detalle por cuentas (marketplace)
      const cuentas = cuentasPorOp.get(u) || [];
      const doneCuentaMap = donePorOpCuenta.get(u) || new Map();

      const detalleCuentas = cuentas.map((c) => ({
        id: c.id,
        email: c.email,
        done: doneCuentaMap.get(c.id) || 0,
        meta: 1, // 1 publicación por cuenta (si tu negocio pide otra meta, se ajusta)
      }));

      let cuentasHTML = "";
      if (detalleCuentas.length > 0) {
        detalleCuentas.sort((a, b) => b.done - a.done);

        const maxShow = 6;
        const show = detalleCuentas.slice(0, maxShow);
        const rest = detalleCuentas.length - show.length;

        cuentasHTML = `
          <div style="margin-top:8px; border-top:1px solid rgba(255,255,255,0.06); padding-top:8px;">
            <div class="muted" style="font-size:0.75rem; margin-bottom:6px;">Cuentas (Marketplace):</div>
            ${show
              .map((c) => {
                const ok = (c.done || 0) >= (c.meta || 0) && c.meta > 0;
                const color = ok ? "#34d399" : "#60a5fa";
                return `
                  <div style="display:flex; justify-content:space-between; gap:10px; font-size:0.75rem; margin:3px 0;">
                    <span class="muted" style="max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                      ${shortEmail(c.email)}
                    </span>
                    <span style="font-weight:bold; color:${color};">${c.done}/${c.meta}</span>
                  </div>
                `;
              })
              .join("")}
            ${
              rest > 0
                ? `<div class="muted" style="font-size:0.75rem; margin-top:6px;">+ ${rest} cuenta(s) más</div>`
                : ""
            }
          </div>
        `;
      } else {
        cuentasHTML = `
          <div class="muted" style="font-size:0.75rem; margin-top:8px;">
            Sin cuentas asignadas al operador (cuentas_facebook.ocupada_por vacío)
          </div>
        `;
      }

      // Calentamiento H/M/R/G
      const p = planPorOp.get(u);
      const reqH = p?.reqH || 0,
        reqM = p?.reqM || 0,
        reqR = p?.reqR || 0,
        reqG = p?.reqG || 0;
      const doneH = p?.doneH || 0,
        doneM = p?.doneM || 0,
        doneR = p?.doneR || 0,
        doneG = p?.doneG || 0;

      const totalReqPub = reqH + reqM + reqR + reqG;
      const totalDonePub = doneH + doneM + doneR + doneG;

      let badgePublicaciones = "";
      if (totalReqPub <= 0) {
        badgePublicaciones = `<span class="badge warn">Sin Plan</span>`;
      } else if (totalDonePub >= totalReqPub) {
        badgePublicaciones = `<span class="badge ok">Hecho</span>`;
      } else {
        badgePublicaciones = `<span class="badge info">Pend. ${totalReqPub - totalDonePub}</span>`;
      }

      // Métrica
      const met = ultimaMetricaPorOp.get(u);
      const badgeMetrica = met
        ? `<span class="badge ok">OK</span>`
        : `<span class="badge warn">Sin</span>`;

      grid.innerHTML += `
        <div class="op-card">
          <div class="op-header">
            <div>
              <span class="status-dot ${isOnline ? "online" : "offline"}"></span>
              <strong>${u}</strong>
            </div>
            <span class="muted" style="font-size:0.75rem;">${asig.categoria || "-"}</span>
          </div>

          <div class="op-body">
            <div>
              <div style="display:flex; justify-content:space-between; font-size:0.8rem; color:#cbd5e1;">
                <span>📦 Marketplace (Total)</span>
                <span style="color:${porcMP === 100 ? "#34d399" : "#60a5fa"}">${totalDone}/${totalMeta}</span>
              </div>
              <div class="progress-bg">
                <div class="progress-fill" style="width:${porcMP}%;"></div>
              </div>

              ${cuentasHTML}
            </div>

            <div class="stat-row" style="align-items:flex-start;">
              <div>
                <span style="color:#cbd5e1;">📣 Calentamiento</span>
                <div class="muted" style="font-size:0.75rem; margin-top:4px;">
                  Historias ${doneH}/${reqH} • Muro ${doneM}/${reqM} • Reels ${doneR}/${reqR} • Grupos ${doneG}/${reqG}
                </div>
              </div>
              ${badgePublicaciones}
            </div>

            <div class="stat-row">
              <span style="color:#cbd5e1;">📊 Métricas</span>
              ${badgeMetrica}
            </div>
          </div>
        </div>
      `;
    });

    // --- TABLA LOGS (ENTRADA/SALIDA) ---
    const tbody = $("tabla-logs");
    if (!tbody) return;
    tbody.innerHTML = "";

    logs.forEach((l) => {
      const hora = l.created_at ? formatHoraARG(l.created_at) : "--:--";
      tbody.innerHTML += `
        <tr>
          <td>${hora}</td>
          <td>${l.usuario || "-"}</td>
          <td>${l.evento || "-"}</td>
          <td>${l.cuenta_fb || "-"}</td>
        </tr>
      `;
    });
  } catch (e) {
    console.error(e);
    alert("Error cargando Actividad. Mirá consola.");
  }
}

async function descargarCSV() {
  try {
    const { start, end } = getARGDayRangeUTC();
    const { data, error } = await sb
      .from("usuarios_actividad")
      .select("*")
      .order("created_at", { ascending: true })
      .gte("created_at", start)
      .lt("created_at", end);

    if (error) throw error;

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
    a.download = `usuarios_actividad_${today}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error(e);
    alert("Error descargando CSV.");
  }
}

async function limpiarLogs() {
  if (!confirm("¿Borrar historial de HOY? (usuarios_actividad)")) return;

  try {
    const { start, end } = getARGDayRangeUTC();

    const { data: ids, error: errIds } = await sb
      .from("usuarios_actividad")
      .select("id")
      .gte("created_at", start)
      .lt("created_at", end);

    if (errIds) throw errIds;

    const list = (ids || []).map((x) => x.id);
    if (list.length === 0) {
      alert("No hay logs de hoy.");
      return;
    }

    const CHUNK = 200;
    for (let i = 0; i < list.length; i += CHUNK) {
      const chunk = list.slice(i, i + CHUNK);
      const { error } = await sb.from("usuarios_actividad").delete().in("id", chunk);
      if (error) {
        console.error(error);
        alert("Se borró una parte, pero hubo un error. Revisá consola.");
        return;
      }
    }

    alert("Historial borrado ✅");
    await cargarMonitor();
  } catch (e) {
    console.error(e);
    alert("Error borrando el historial.");
  }
}

init();
