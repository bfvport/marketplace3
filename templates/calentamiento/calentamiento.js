import { requireSession, loadSidebar, fmtDateISO } from "../../assets/js/app.js";

const s = requireSession();
const sb = window.supabaseClient;
const $ = (id) => document.getElementById(id);

let cachedEmails = new Map(); // cuenta_id -> email

if (s.rol === "gerente") {
  window.location.href = "../calentamiento_gerente/calentamiento_gerente.html";
}

function todayISO(){ return fmtDateISO(new Date()); }
function addDaysISO(baseISO, days) {
  const d = new Date(baseISO + "T00:00:00");
  d.setDate(d.getDate() + days);
  return fmtDateISO(d);
}

function ensureFechaPicker(){
  if (document.getElementById("sel-fecha")) return;

  // Insertamos picker debajo de los botones
  const btnDrive = $("btn-drive");
  if (!btnDrive) return;

  const wrap = document.createElement("div");
  wrap.style.display = "flex";
  wrap.style.gap = "10px";
  wrap.style.flexWrap = "wrap";
  wrap.style.alignItems = "center";
  wrap.style.marginTop = "12px";

  const start = todayISO();
  const end = addDaysISO(start, 6);

  wrap.innerHTML = `
    <label class="muted" style="font-size:0.85rem;">📅 Fecha:</label>
    <input id="sel-fecha" type="date"
      min="${start}" max="${end}" value="${start}"
      style="padding:10px; border-radius:8px; border:1px solid #334155; background:#0f172a; color:white;" />
    <span class="muted" style="font-size:0.8rem;">(hoy + 6 días)</span>
  `;

  btnDrive.parentElement.insertAdjacentElement("afterend", wrap);
}

(async function init() {
  await loadSidebar({ activeKey: "calentamiento", basePath: "../" });

  ensureFechaPicker();

  $("btn-refrescar")?.addEventListener("click", () => cargarTodo());
  document.getElementById("sel-fecha")?.addEventListener("change", () => cargarTodo());

  await cargarTodo();
})();

async function cargarTodo() {
  const fecha = (document.getElementById("sel-fecha")?.value) || todayISO();

  // 1) Drive desde configuracion_calentamiento (última)
  const { data: cfgData, error: eCfg } = await sb
    .from("configuracion_calentamiento")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1);

  if (eCfg) {
    alert("Error cargando configuración: " + eCfg.message);
    return;
  }

  const cfg = cfgData?.[0];
  const drive = cfg?.link_drive || "#";
  $("btn-drive").href = drive;
  $("btn-drive").style.opacity = (cfg?.link_drive ? "1" : "0.6");

  // 2) Cuentas frías asignadas al operador (como ya venías)
  const { data: cuentas, error: eC } = await sb
    .from("cuentas_facebook")
    .select("id,email,calidad,ocupada_por,estado")
    .eq("ocupada_por", s.usuario)
    .in("calidad", ["fria", "frío", "frio", "nueva"]);

  if (eC) {
    alert("Error cargando cuentas: " + eC.message);
    return;
  }

  cachedEmails = new Map((cuentas || []).map(c => [c.id, c.email]));

  if (!cuentas || cuentas.length === 0) {
    $("tabla-calentamiento").innerHTML =
      `<tr><td colspan="6" class="muted">No tenés cuentas frías asignadas.</td></tr>`;
    $("resumen").textContent = "Pendientes → H:0 | M:0 | R:0 | G:0";
    return;
  }

  await dibujarTablaYResumen(cuentas, fecha);
}

async function dibujarTablaYResumen(cuentas, fecha) {
  const ids = cuentas.map(c => c.id);

  // 3) Traemos el plan asignado por gerencia para esa fecha
  const { data: planes, error } = await sb
    .from("calentamiento_plan")
    .select("*")
    .eq("fecha", fecha)
    .in("cuenta_id", ids);

  if (error) {
    alert("Error cargando planes: " + error.message);
    return;
  }

  const map = new Map((planes || []).map(p => [p.cuenta_id, p]));
  let ph = 0, pm = 0, pr = 0, pg = 0;

  const rows = cuentas.map(c => {
    const p = map.get(c.id);

    // Si NO hay plan para esa cuenta en esa fecha, mostramos “sin asignación”
    if (!p) {
      return `
        <tr>
          <td style="color:white; font-weight:700;">${escapeHtml(c.email)}</td>
          <td class="muted" colspan="4">Sin plan asignado para ${fecha}</td>
          <td class="muted">—</td>
        </tr>
      `;
    }

    const faltH = Math.max(0, (p.req_historias || 0) - (p.done_historias || 0));
    const faltM = Math.max(0, (p.req_muro || 0) - (p.done_muro || 0));
    const faltR = Math.max(0, (p.req_reels || 0) - (p.done_reels || 0));
    const faltG = Math.max(0, (p.req_grupos || 0) - (p.done_grupos || 0));

    ph += faltH; pm += faltM; pr += faltR; pg += faltG;

    return `
      <tr>
        <td style="color:white; font-weight:700;">${escapeHtml(c.email)}</td>
        <td style="color:white;">${p.done_historias}/${p.req_historias}</td>
        <td style="color:white;">${p.done_muro}/${p.req_muro}</td>
        <td style="color:white;">${p.done_reels}/${p.req_reels}</td>
        <td style="color:white;">${p.done_grupos}/${p.req_grupos}</td>
        <td style="display:flex; gap:6px; flex-wrap:wrap;">
          <button class="btn2" data-fecha="${fecha}" data-id="${p.id}" data-a="h">+1 Historia</button>
          <button class="btn2" data-fecha="${fecha}" data-id="${p.id}" data-a="m">+1 Muro</button>
          <button class="btn2" data-fecha="${fecha}" data-id="${p.id}" data-a="r">+1 Reel</button>
          <button class="btn2" data-fecha="${fecha}" data-id="${p.id}" data-a="g">+1 Grupo</button>
        </td>
      </tr>
    `;
  }).join("");

  $("tabla-calentamiento").innerHTML = rows;
  $("resumen").innerHTML = `Pendientes (${fecha}) → H:${ph} | M:${pm} | R:${pr} | G:${pg}`;

  bindAcciones(fecha);
}

function bindAcciones(fecha) {
  document.querySelectorAll("button[data-a]").forEach(btn => {
    btn.onclick = async () => {
      const planId = Number(btn.dataset.id);
      const act = btn.dataset.a;

      const { data: p, error: e1 } = await sb
        .from("calentamiento_plan")
        .select("*")
        .eq("id", planId)
        .single();

      if (e1) return alert("Error leyendo plan: " + e1.message);

      const patch = { updated_at: new Date() };
      const labels = { h: "Historia", m: "Muro", r: "Reel", g: "Grupo" };
      const tipo = labels[act] || "Acción";

      if (act === "h" && p.done_historias < p.req_historias) patch.done_historias = p.done_historias + 1;
      if (act === "m" && p.done_muro < p.req_muro) patch.done_muro = p.done_muro + 1;
      if (act === "r" && p.done_reels < p.req_reels) patch.done_reels = p.done_reels + 1;
      if (act === "g" && p.done_grupos < p.req_grupos) patch.done_grupos = p.done_grupos + 1;

      if (Object.keys(patch).length === 1) return;

      const doneH = (patch.done_historias ?? p.done_historias);
      const doneM = (patch.done_muro ?? p.done_muro);
      const doneR = (patch.done_reels ?? p.done_reels);
      const doneG = (patch.done_grupos ?? p.done_grupos);

      const reqH = p.req_historias || 0;
      const reqM = p.req_muro || 0;
      const reqR = p.req_reels || 0;
      const reqG = p.req_grupos || 0;

      const faltH = Math.max(0, reqH - doneH);
      const faltM = Math.max(0, reqM - doneM);
      const faltR = Math.max(0, reqR - doneR);
      const faltG = Math.max(0, reqG - doneG);

      if (doneH >= reqH && doneM >= reqM && doneR >= reqR && doneG >= reqG) {
        patch.estado = "completo";
      }

      const { error: e2 } = await sb.from("calentamiento_plan").update(patch).eq("id", planId);
      if (e2) return alert("Error guardando avance: " + e2.message);

      const email = cachedEmails.get(p.cuenta_id) || `CuentaID ${p.cuenta_id}`;
      const evento =
        `🔥 Calentamiento (${fecha}) | ${email} | ${tipo} +1 | ` +
        `H ${doneH}/${reqH} (faltan ${faltH}) | ` +
        `M ${doneM}/${reqM} (faltan ${faltM}) | ` +
        `R ${doneR}/${reqR} (faltan ${faltR}) | ` +
        `G ${doneG}/${reqG} (faltan ${faltG})`;

      await sb.from("usuarios_actividad").insert([{
        usuario: s.usuario,
        evento,
        cuenta_fb: `cuenta_id:${p.cuenta_id}`
      }]);

      await cargarTodo();
    };
  });
}

function escapeHtml(v) {
  return String(v)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
