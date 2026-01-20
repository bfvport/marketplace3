import { requireSession, loadSidebar } from "../../assets/js/app.js";

const s = requireSession();
const sb = window.supabaseClient;

const $ = (id) => document.getElementById(id);

function todayISO() {
  // ISO simple YYYY-MM-DD (sin depender de fmtDateISO)
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function escapeHtml(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function init() {
  await loadSidebar({ activeKey: "calentamiento", basePath: "../" });

  // Seguridad: si es gerente, fuera
  if (s.rol === "gerente") {
    window.location.href = "../calentamiento_gerente/calentamiento_gerente.html";
    return;
  }

  $("btn-refrescar").onclick = cargar;

  await cargar();
}

async function cargar() {
  try {
    $("resumen").textContent = "Cargando…";
    $("tabla-calentamiento").innerHTML = "";

    const hoy = todayISO();

    // 1) Config global para Drive
    const { data: cfgData, error: eCfg } = await sb
      .from("configuracion_calentamiento")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(1);

    if (eCfg) throw eCfg;

    const cfg = cfgData?.[0];
    const drive = (cfg?.link_drive || "").trim();
    $("btn-drive").href = drive || "#";
    $("btn-drive").style.opacity = drive ? "1" : "0.6";

    // 2) Cuentas del operador
    // ⚠️ OJO: si querés SOLO frías, dejalo como está.
    const { data: cuentas, error: eC } = await sb
      .from("cuentas_facebook")
      .select("id,email,calidad,estado,ocupada_por")
      .eq("ocupada_por", s.usuario)
      .in("calidad", ["fria", "nueva"]);

    if (eC) throw eC;

    if (!cuentas || cuentas.length === 0) {
      $("resumen").textContent =
        `⚠️ No tenés cuentas FRÍAS asignadas (ocupada_por="${s.usuario}").`;
      $("tabla-calentamiento").innerHTML = `
        <tr>
          <td colspan="6" class="muted">
            No hay cuentas con calidad = fria/nueva asignadas a este operador.
            Revisá en Supabase: cuentas_facebook.ocupada_por y cuentas_facebook.calidad.
          </td>
        </tr>`;
      return;
    }

    const ids = cuentas.map(c => c.id);

    // 3) Plan asignado para HOY
    const { data: planes, error: eP } = await sb
      .from("calentamiento_plan")
      .select("*")
      .eq("fecha", hoy)
      .in("cuenta_id", ids);

    if (eP) throw eP;

    const map = new Map((planes || []).map(p => [Number(p.cuenta_id), p]));

    let ph = 0, pm = 0, pr = 0, pg = 0;

    const rows = cuentas.map(c => {
      const p = map.get(Number(c.id));

      if (!p) {
        return `
          <tr>
            <td>${escapeHtml(c.email)}</td>
            <td class="muted" colspan="4">Sin plan asignado para hoy (${hoy})</td>
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
          <td>${escapeHtml(c.email)}</td>
          <td>${p.done_historias || 0}/${p.req_historias || 0}</td>
          <td>${p.done_muro || 0}/${p.req_muro || 0}</td>
          <td>${p.done_reels || 0}/${p.req_reels || 0}</td>
          <td>${p.done_grupos || 0}/${p.req_grupos || 0}</td>
          <td style="display:flex; gap:6px; flex-wrap:wrap;">
            <button class="btn2" data-id="${p.id}" data-a="h">+1 H</button>
            <button class="btn2" data-id="${p.id}" data-a="m">+1 M</button>
            <button class="btn2" data-id="${p.id}" data-a="r">+1 R</button>
            <button class="btn2" data-id="${p.id}" data-a="g">+1 G</button>
          </td>
        </tr>
      `;
    }).join("");

    $("tabla-calentamiento").innerHTML = rows;

    if (!planes || planes.length === 0) {
      $("resumen").textContent =
        `⚠️ Hoy (${hoy}) no hay plan generado. Pedile a gerencia que apriete “Generar plan 7 días”.`;
    } else {
      $("resumen").textContent =
        `Pendientes HOY (${hoy}) → H:${ph} | M:${pm} | R:${pr} | G:${pg}`;
    }

    bindAcciones(hoy);
  } catch (err) {
    console.error("Calentamiento error:", err);
    $("resumen").textContent = "❌ Error: " + (err?.message || "desconocido");
    $("tabla-calentamiento").innerHTML = `
      <tr><td colspan="6" class="muted">Error cargando calentamiento. Abrí consola para ver el detalle.</td></tr>
    `;
  }
}

function bindAcciones(hoy) {
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

      if (Object.keys(patch).length === 1) return; // nada para sumar

      // estado
      const doneH = patch.done_historias ?? (p.done_historias || 0);
      const doneM = patch.done_muro ?? (p.done_muro || 0);
      const doneR = patch.done_reels ?? (p.done_reels || 0);
      const doneG = patch.done_grupos ?? (p.done_grupos || 0);
      const reqH = p.req_historias || 0;
      const reqM = p.req_muro || 0;
      const reqR = p.req_reels || 0;
      const reqG = p.req_grupos || 0;

      patch.estado = (doneH >= reqH && doneM >= reqM && doneR >= reqR && doneG >= reqG)
        ? "completo"
        : "pendiente";

      const { error: e2 } = await sb.from("calentamiento_plan").update(patch).eq("id", planId);
      if (e2) return alert("Error guardando avance: " + e2.message);

      // Log actividad (opcional pero útil)
      await sb.from("usuarios_actividad").insert([{
        usuario: s.usuario,
        evento: `🔥 Calentamiento HOY ${hoy} avance +1 (${act}) plan_id=${planId}`,
        cuenta_fb: `plan:${planId}`
      }]);

      await cargar();
    };
  });
}

init();
