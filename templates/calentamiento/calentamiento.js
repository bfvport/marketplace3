import { requireSession, loadSidebar, fmtDateISO } from "../../assets/js/app.js";

const s = requireSession();
const sb = window.supabaseClient;

const $ = (id) => document.getElementById(id);

// ---------- helpers ----------
function todayISO() { return fmtDateISO(new Date()); }
function addDaysISO(baseISO, days) {
  const d = new Date(baseISO + "T00:00:00");
  d.setDate(d.getDate() + days);
  return fmtDateISO(d);
}
function escapeHtml(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function ensureContainer() {
  // Si tu HTML no tiene nada, creamos UI mínima en el main content
  if (document.getElementById("mp-calentamiento-root")) return;

  const main = document.querySelector("main") || document.body;
  const root = document.createElement("div");
  root.id = "mp-calentamiento-root";
  root.style.padding = "20px";
  root.innerHTML = `
    <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin-bottom:14px;">
      <a id="btn-drive" class="btn" target="_blank" rel="noopener">Abrir Drive</a>
      <button id="btn-refrescar" class="btn2" type="button">Actualizar</button>
      <label class="muted" style="margin-left:auto;">Fecha</label>
      <input id="sel-fecha" type="date"
        style="padding:10px; border-radius:10px; border:1px solid #334155; background:#0f172a; color:white;" />
    </div>

    <div id="msg" class="muted" style="margin-bottom:10px;"></div>

    <div class="card" style="padding:14px; border:1px solid rgba(255,255,255,0.07); border-radius:14px; background:rgba(2,6,23,0.35);">
      <div id="resumen" style="color:white; font-weight:700; margin-bottom:10px;">—</div>

      <div style="overflow:auto;">
        <table class="table" style="width:100%; border-collapse:collapse;">
          <thead>
            <tr style="text-align:left; color:#94a3b8; font-size:0.9rem;">
              <th style="padding:10px;">Cuenta</th>
              <th style="padding:10px;">Historias</th>
              <th style="padding:10px;">Muro</th>
              <th style="padding:10px;">Reels</th>
              <th style="padding:10px;">Grupos</th>
              <th style="padding:10px;">Acción</th>
            </tr>
          </thead>
          <tbody id="tabla-calentamiento"></tbody>
        </table>
      </div>
    </div>
  `;
  main.appendChild(root);
}

function setMsg(text) {
  const el = document.getElementById("msg");
  if (el) el.textContent = text || "";
}

// ---------- main ----------
(async function init() {
  await loadSidebar({ activeKey: "calentamiento", basePath: "../" });
  ensureContainer();

  // Si es gerente lo mandamos a la vista gerente
  if (s.rol === "gerente") {
    window.location.href = "../calentamiento_gerente/calentamiento_gerente.html";
    return;
  }

  // setear rango fecha
  const start = todayISO();
  const end = addDaysISO(start, 6);
  const selFecha = document.getElementById("sel-fecha");
  if (selFecha) {
    selFecha.min = start;
    selFecha.max = end;
    selFecha.value = start;
    selFecha.addEventListener("change", () => cargarTodo());
  }

  document.getElementById("btn-refrescar")?.addEventListener("click", () => cargarTodo());

  await cargarTodo();
})();

async function cargarTodo() {
  try {
    setMsg("Cargando…");

    const fecha = document.getElementById("sel-fecha")?.value || todayISO();

    // 1) Drive (última config)
    const { data: cfgData, error: eCfg } = await sb
      .from("configuracion_calentamiento")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(1);

    if (eCfg) throw eCfg;

    const cfg = cfgData?.[0];
    const drive = cfg?.link_drive || "";
    const btnDrive = document.getElementById("btn-drive");
    if (btnDrive) {
      btnDrive.href = drive || "#";
      btnDrive.style.opacity = drive ? "1" : "0.6";
      btnDrive.textContent = drive ? "Abrir Drive" : "Drive (no configurado)";
    }

    // 2) Cuentas del operador (IMPORTANTÍSIMO)
    // Si querés SOLO frías, descomentá el .in('calidad', ...)
    let q = sb
      .from("cuentas_facebook")
      .select("id,email,calidad,ocupada_por,estado")
      .eq("ocupada_por", s.usuario)
      .neq("estado", "inactiva");

    // 🔥 Solo frías:
    // q = q.in("calidad", ["fria", "nueva"]);

    const { data: cuentas, error: eC } = await q;

    if (eC) throw eC;

    if (!cuentas || cuentas.length === 0) {
      document.getElementById("tabla-calentamiento").innerHTML =
        `<tr><td colspan="6" class="muted" style="padding:12px;">No tenés cuentas asignadas (ocupada_por = ${escapeHtml(s.usuario)}).</td></tr>`;
      document.getElementById("resumen").textContent = `Pendientes (${fecha}) → H:0 | M:0 | R:0 | G:0`;
      setMsg("⚠️ No hay cuentas para este operador. Revisá: cuentas_facebook.ocupada_por.");
      return;
    }

    // 3) Plan del día para esas cuentas
    const ids = cuentas.map(c => c.id);

    const { data: planes, error: eP } = await sb
      .from("calentamiento_plan")
      .select("*")
      .eq("fecha", fecha)
      .in("cuenta_id", ids);

    if (eP) throw eP;

    const map = new Map((planes || []).map(p => [Number(p.cuenta_id), p]));

    let ph = 0, pm = 0, pr = 0, pg = 0;

    const tbody = cuentas.map(c => {
      const p = map.get(Number(c.id));

      if (!p) {
        return `
          <tr style="border-top:1px solid rgba(255,255,255,0.06);">
            <td style="padding:12px; color:white; font-weight:700;">${escapeHtml(c.email)}</td>
            <td colspan="4" class="muted" style="padding:12px;">Sin plan asignado para ${fecha}</td>
            <td class="muted" style="padding:12px;">—</td>
          </tr>
        `;
      }

      const faltH = Math.max(0, (p.req_historias || 0) - (p.done_historias || 0));
      const faltM = Math.max(0, (p.req_muro || 0) - (p.done_muro || 0));
      const faltR = Math.max(0, (p.req_reels || 0) - (p.done_reels || 0));
      const faltG = Math.max(0, (p.req_grupos || 0) - (p.done_grupos || 0));

      ph += faltH; pm += faltM; pr += faltR; pg += faltG;

      return `
        <tr style="border-top:1px solid rgba(255,255,255,0.06);">
          <td style="padding:12px; color:white; font-weight:700;">${escapeHtml(c.email)}</td>
          <td style="padding:12px; color:white;">${p.done_historias}/${p.req_historias}</td>
          <td style="padding:12px; color:white;">${p.done_muro}/${p.req_muro}</td>
          <td style="padding:12px; color:white;">${p.done_reels}/${p.req_reels}</td>
          <td style="padding:12px; color:white;">${p.done_grupos}/${p.req_grupos}</td>
          <td style="padding:12px; display:flex; gap:6px; flex-wrap:wrap;">
            <button class="btn2" data-id="${p.id}" data-a="h">+1 H</button>
            <button class="btn2" data-id="${p.id}" data-a="m">+1 M</button>
            <button class="btn2" data-id="${p.id}" data-a="r">+1 R</button>
            <button class="btn2" data-id="${p.id}" data-a="g">+1 G</button>
          </td>
        </tr>
      `;
    }).join("");

    document.getElementById("tabla-calentamiento").innerHTML = tbody;
    document.getElementById("resumen").textContent =
      `Pendientes (${fecha}) → H:${ph} | M:${pm} | R:${pr} | G:${pg}`;

    setMsg(planes?.length
      ? `✅ Plan encontrado para ${fecha}.`
      : `⚠️ No hay plan para ${fecha}. Pedile al gerente que genere el plan 7 días.`);

    bindAcciones(fecha);
  } catch (err) {
    console.error(err);
    setMsg("❌ Error: " + (err?.message || "desconocido"));
    // mostrar algo para que no quede en blanco
    const tbody = document.getElementById("tabla-calentamiento");
    if (tbody) tbody.innerHTML =
      `<tr><td colspan="6" class="muted" style="padding:12px;">Error cargando calentamiento. Abrí consola para detalle.</td></tr>`;
    const res = document.getElementById("resumen");
    if (res) res.textContent = "—";
  }
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

      if (act === "h" && (p.done_historias || 0) < (p.req_historias || 0)) patch.done_historias = (p.done_historias || 0) + 1;
      if (act === "m" && (p.done_muro || 0) < (p.req_muro || 0)) patch.done_muro = (p.done_muro || 0) + 1;
      if (act === "r" && (p.done_reels || 0) < (p.req_reels || 0)) patch.done_reels = (p.done_reels || 0) + 1;
      if (act === "g" && (p.done_grupos || 0) < (p.req_grupos || 0)) patch.done_grupos = (p.done_grupos || 0) + 1;

      if (Object.keys(patch).length === 1) return;

      // estado
      const doneH = patch.done_historias ?? (p.done_historias || 0);
      const doneM = patch.done_muro ?? (p.done_muro || 0);
      const doneR = patch.done_reels ?? (p.done_reels || 0);
      const doneG = patch.done_grupos ?? (p.done_grupos || 0);
      const reqH = p.req_historias || 0;
      const reqM = p.req_muro || 0;
      const reqR = p.req_reels || 0;
      const reqG = p.req_grupos || 0;

      if (doneH >= reqH && doneM >= reqM && doneR >= reqR && doneG >= reqG) {
        patch.estado = "completo";
      } else {
        patch.estado = "pendiente";
      }

      const { error: e2 } = await sb.from("calentamiento_plan").update(patch).eq("id", planId);
      if (e2) return alert("Error guardando avance: " + e2.message);

      await sb.from("usuarios_actividad").insert([{
        usuario: s.usuario,
        evento: `🔥 Calentamiento (${fecha}) avance +1 (${act}) en plan_id ${planId}`,
        cuenta_fb: `plan:${planId}`
      }]);

      await cargarTodo();
    };
  });
}
