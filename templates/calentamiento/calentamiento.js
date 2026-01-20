import { requireSession } from "../../assets/js/app.js";

const s = requireSession();
const sb = window.supabaseClient;
const $ = (id) => document.getElementById(id);

/* =========================
   Sidebar robusto SIN tocar app.js
========================= */
async function fetchFirstOk(urls) {
  for (const u of urls) {
    try {
      const r = await fetch(u, { cache: "no-store" });
      if (r.ok) return { url: u, text: await r.text() };
    } catch {}
  }
  return null;
}
async function loadSidebarLocal({ activeKey = "", basePath = "../" } = {}) {
  const host = document.getElementById("sidebar-host");
  if (!host) return;

  const urls = [
    `${basePath}sidebar/sidebar_operador.html`,
    `${basePath}sidebar_operador.html`,
    `${basePath}sidebar.html`,
    `${basePath}sidebar/sidebar.html`,
  ];

  const got = await fetchFirstOk(urls);
  if (!got) {
    host.innerHTML = `<div style="color:white;padding:14px;">❌ No encontré sidebar (operador). Revisá rutas.</div>`;
    return;
  }

  host.innerHTML = got.text;
  if (activeKey) {
    host.querySelectorAll("[data-key]").forEach(el => {
      el.classList.toggle("active", el.getAttribute("data-key") === activeKey);
    });
  }
}

/* =========================
   Helpers
========================= */
function iso(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function addDays(baseISO, days) {
  const d = new Date(baseISO + "T00:00:00");
  d.setDate(d.getDate() + days);
  return iso(d);
}
function clamp(n) {
  n = Number(n);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}
function estadoFrom(done, req) {
  if (req === 0) return "n/a";
  if (done >= req) return "ok";
  if (done > 0) return "en_progreso";
  return "pendiente";
}
function prettyEstado(e) {
  if (e === "ok") return "✅ OK";
  if (e === "en_progreso") return "🟡 En progreso";
  if (e === "pendiente") return "⏳ Pendiente";
  return "—";
}

/* =========================
   Init
========================= */
(async function init() {
  await loadSidebarLocal({ activeKey: "calentamiento", basePath: "../" });

  // seguridad: esta página es de operador
  if (s.rol !== "operador") {
    document.body.innerHTML = `
      <div style="text-align:center; padding:50px; color:white;">
        <h1 style="color:#ef4444;">⛔ Acceso Denegado</h1>
        <p>Esta página es solo para Operadores.</p>
        <a href="../dashboard/dashboard.html" style="color:#3b82f6;">Volver</a>
      </div>`;
    return;
  }

  $("btn-refrescar").onclick = cargarTodo;

  llenarSelectorDias();
  $("sel-dia").addEventListener("change", cargarTodo);

  await cargarConfiguracion();
  await cargarTodo();
})();

function llenarSelectorDias() {
  const base = iso(new Date());
  const sel = $("sel-dia");
  sel.innerHTML = "";

  for (let i = 0; i < 7; i++) {
    const d = addDays(base, i);
    const opt = document.createElement("option");
    opt.value = d;
    opt.textContent = (i === 0) ? `Hoy (${d})` : d;
    sel.appendChild(opt);
  }
}

/* =========================
   Drive global
========================= */
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

  const link = data?.[0]?.link_drive;
  if (link) $("btn-drive").href = link;
  else $("btn-drive").style.display = "none";
}

/* =========================
   Carga principal:
   - Trae plan del día para ESTE operador
   - Trae emails de cuentas asignadas (cuentas_facebook)
========================= */
async function cargarTodo() {
  const dia = $("sel-dia").value || iso(new Date());

  $("resumen").textContent = "Cargando…";
  $("tabla-calentamiento").innerHTML = "";

  // 1) plan del día del operador
  const { data: plan, error: ePlan } = await sb
    .from("calentamiento_plan")
    .select("*")
    .eq("fecha", dia)
    .eq("usuario", s.usuario)
    .order("cuenta_id");

  if (ePlan) {
    console.error(ePlan);
    $("resumen").textContent = "❌ Error cargando plan: " + ePlan.message;
    return;
  }

  if (!plan || plan.length === 0) {
    $("resumen").innerHTML = `No tenés tareas asignadas para <b>${dia}</b>.`;
    return;
  }

  // 2) traer cuentas para mostrar email bonito
  const ids = plan.map(p => p.cuenta_id);
  const { data: cuentas, error: eCtas } = await sb
    .from("cuentas_facebook")
    .select("id,email,calidad,estado")
    .in("id", ids);

  if (eCtas) console.warn("No pude traer cuentas_facebook:", eCtas.message);

  const mapEmail = new Map((cuentas || []).map(c => [c.id, c.email]));

  renderResumen(plan, dia);
  renderTabla(plan, mapEmail, dia);
}

function renderResumen(plan, dia) {
  let reqT = 0, doneT = 0;
  for (const p of plan) {
    reqT += clamp(p.req_historias) + clamp(p.req_muro) + clamp(p.req_reels) + clamp(p.req_grupos);
    doneT += clamp(p.done_historias) + clamp(p.done_muro) + clamp(p.done_reels) + clamp(p.done_grupos);
  }

  $("resumen").innerHTML = `
    Día: <b>${dia}</b> · Cuentas: <b>${plan.length}</b> · Progreso: <b>${doneT}/${reqT}</b>
  `;
}

function renderTabla(plan, mapEmail, dia) {
  const tbody = $("tabla-calentamiento");
  tbody.innerHTML = "";

  for (const p of plan) {
    const email = mapEmail.get(p.cuenta_id) || `ID ${p.cuenta_id}`;

    const reqH = clamp(p.req_historias), reqM = clamp(p.req_muro), reqR = clamp(p.req_reels), reqG = clamp(p.req_grupos);
    const dH = clamp(p.done_historias), dM = clamp(p.done_muro), dR = clamp(p.done_reels), dG = clamp(p.done_grupos);

    const estH = estadoFrom(dH, reqH);
    const estM = estadoFrom(dM, reqM);
    const estR = estadoFrom(dR, reqR);
    const estG = estadoFrom(dG, reqG);

    // estado general
    const totalReq = reqH + reqM + reqR + reqG;
    const totalDone = dH + dM + dR + dG;
    let estado = "pendiente";
    if (totalReq === 0) estado = "n/a";
    else if (totalDone >= totalReq) estado = "ok";
    else if (totalDone > 0) estado = "en_progreso";

    tbody.innerHTML += `
      <tr>
        <td>${email}</td>
        <td>${dH}/${reqH} <span class="muted">(${prettyEstado(estH)})</span></td>
        <td>${dM}/${reqM} <span class="muted">(${prettyEstado(estM)})</span></td>
        <td>${dR}/${reqR} <span class="muted">(${prettyEstado(estR)})</span></td>
        <td>${dG}/${reqG} <span class="muted">(${prettyEstado(estG)})</span></td>
        <td><span class="muted">${totalDone}/${totalReq}</span></td>
        <td>${prettyEstado(estado)}</td>
        <td>
          <button class="btn2" onclick="window.marcarTodoOk(${p.cuenta_id}, '${dia}')">Marcar todo OK</button>
        </td>
      </tr>
    `;
  }
}

/* =========================
   Acción operador: marcar todo OK (para ese día y cuenta)
========================= */
window.marcarTodoOk = async (cuenta_id, fecha) => {
  // traer la fila para saber req_*
  const { data, error } = await sb
    .from("calentamiento_plan")
    .select("id,req_historias,req_muro,req_reels,req_grupos")
    .eq("fecha", fecha)
    .eq("cuenta_id", cuenta_id)
    .eq("usuario", s.usuario)
    .limit(1);

  if (error) return alert("❌ Error: " + error.message);
  const row = data?.[0];
  if (!row) return alert("No encontré el plan de esa cuenta para ese día.");

  const patch = {
    done_historias: clamp(row.req_historias),
    done_muro: clamp(row.req_muro),
    done_reels: clamp(row.req_reels),
    done_grupos: clamp(row.req_grupos),
    estado: "ok",
    updated_at: new Date(),
  };

  const upd = await sb.from("calentamiento_plan").update(patch).eq("id", row.id);
  if (upd.error) return alert("❌ Error guardando: " + upd.error.message);

  alert("✅ Marcado OK");
  await cargarTodo();
};
