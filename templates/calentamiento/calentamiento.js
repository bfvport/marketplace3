import { requireSession, loadSidebar, fmtDateISO } from "../../assets/js/app.js";

const s = requireSession();
const sb = window.supabaseClient;
const $ = (id) => document.getElementById(id);
const today = fmtDateISO(new Date());

let cachedEmails = new Map(); // cuenta_id -> email

// 1) Si entra un gerente al módulo operador, lo mandamos al panel de gerencia.
// 2) Así nunca ve “dos calentamientos” y no toca lo que no corresponde.
if (s.rol === "gerente") {
  window.location.href = "../calentamiento_gerente/calentamiento_gerente.html";
}

// 1) Random determinístico: mismo día + misma cuenta => mismo resultado.
// 2) Evita que cambien las tareas si el operador recarga la página.
function seededRand(seedStr) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6D2B79F5;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rng, min, max) {
  const a = Math.min(min, max);
  const b = Math.max(min, max);
  return a + Math.floor(rng() * (b - a + 1));
}

// 1) Inicializa pantalla: sidebar y primer carga.
// 2) El operador solo ve lo suyo (cuentas frías asignadas).
(async function init() {
  await loadSidebar({ activeKey: "calentamiento", basePath: "../" });

  $("btn-refrescar")?.addEventListener("click", () => cargarTodo());
  await cargarTodo();
})();

// 1) Carga configuración + cuentas frías asignadas + plan de hoy.
// 2) Si el plan no existe, lo crea; si existe, lo respeta (no cambia).
async function cargarTodo() {
  const { data: cfg, error: eCfg } = await sb
    .from("calentamiento_config")
    .select("*")
    .eq("id", 1)
    .single();

  if (eCfg) {
    alert("Error cargando configuración de calentamiento: " + eCfg.message);
    return;
  }

  $("btn-drive").href = cfg.link_drive || "#";
  $("btn-drive").style.opacity = cfg.link_drive ? "1" : "0.6";

  const { data: cuentas, error: eC } = await sb
    .from("cuentas_facebook")
    .select("id,email,calidad,ocupada_por")
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
    $("resumen").textContent = "Pendientes hoy → H:0 | M:0 | R:0 | G:0";
    return;
  }

  // Generar plan solo si no existe (para que no cambie al recargar)
  for (const c of cuentas) {
    const { data: existe } = await sb
      .from("calentamiento_plan")
      .select("id")
      .eq("fecha", today)
      .eq("cuenta_id", c.id)
      .maybeSingle();

    if (!existe) {
      const rng = seededRand(`${today}|${c.id}|${s.usuario}`);

      let h = randInt(rng, cfg.historias_min, cfg.historias_max);
      let m = randInt(rng, cfg.muro_min, cfg.muro_max);
      let r = randInt(rng, cfg.reels_min, cfg.reels_max);
      let g = randInt(rng, cfg.grupos_min, cfg.grupos_max);

      // Si todo da 0, forzamos 1 acción mínima para que “siempre haya tarea”
      if (h + m + r + g === 0) h = 1;

      const { data: creado, error: eUp } = await sb
        .from("calentamiento_plan")
        .insert([{
          fecha: today,
          cuenta_id: c.id,
          usuario: s.usuario,
          req_historias: h,
          req_muro: m,
          req_reels: r,
          req_grupos: g,
          done_historias: 0,
          done_muro: 0,
          done_reels: 0,
          done_grupos: 0,
          estado: "pendiente"
        }])
        .select("id")
        .single();

      if (eUp) {
        alert("Error creando plan de hoy: " + eUp.message);
        return;
      }

      // 1) Log de “plan generado” para Torre de Actividad (sin spam: solo cuando se crea).
      // 2) Esto permite ver qué le tocó hoy a esa cuenta, sin entrar a calentamiento.
      await sb.from("usuarios_actividad").insert([{
        usuario: s.usuario,
        evento: `📌 Plan Calentamiento HOY | ${c.email} | H:${h} M:${m} R:${r} G:${g}`,
        cuenta_fb: `cuenta_id:${c.id}`,
      }]);

      // evitamos usar la variable creado para más cosas, pero queda por si querés debug
      void creado;
    }
  }

  await dibujarTablaYResumen(cuentas);
}

// 1) Dibuja tabla de tareas por cuenta (hecho/requerido) y calcula pendientes totales.
// 2) Deja los botones listos para registrar “+1” y mandar log a Actividad.
async function dibujarTablaYResumen(cuentas) {
  const ids = cuentas.map(c => c.id);

  const { data: planes, error } = await sb
    .from("calentamiento_plan")
    .select("*")
    .eq("fecha", today)
    .in("cuenta_id", ids);

  if (error) {
    alert("Error cargando planes: " + error.message);
    return;
  }

  const map = new Map((planes || []).map(p => [p.cuenta_id, p]));
  let ph = 0, pm = 0, pr = 0, pg = 0;

  const rows = cuentas.map(c => {
    const p = map.get(c.id);
    if (!p) return "";

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
          <button class="btn2" data-id="${p.id}" data-a="h">+1 Historia</button>
          <button class="btn2" data-id="${p.id}" data-a="m">+1 Muro</button>
          <button class="btn2" data-id="${p.id}" data-a="r">+1 Reel</button>
          <button class="btn2" data-id="${p.id}" data-a="g">+1 Grupo</button>
        </td>
      </tr>
    `;
  }).join("");

  $("tabla-calentamiento").innerHTML = rows || `<tr><td colspan="6" class="muted">Sin datos.</td></tr>`;
  $("resumen").innerHTML = `Pendientes hoy → H:${ph} | M:${pm} | R:${pr} | G:${pg}`;

  bindAcciones();
}

// 1) Al apretar +1, actualiza el progreso del plan y registra un log detallado en Actividad.
// 2) El log incluye cuánto hizo y cuánto falta en H/M/R/G para esa cuenta.
function bindAcciones() {
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

      // Si ya estaba completo en esa acción, no hacemos nada (evita inflar números)
      if (Object.keys(patch).length === 1) return;

      // Recalcular “done” con el patch aplicado
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
        `🔥 Calentamiento | ${email} | ${tipo} +1 | ` +
        `H ${doneH}/${reqH} (faltan ${faltH}) | ` +
        `M ${doneM}/${reqM} (faltan ${faltM}) | ` +
        `R ${doneR}/${reqR} (faltan ${faltR}) | ` +
        `G ${doneG}/${reqG} (faltan ${faltG})`;

      await sb.from("usuarios_actividad").insert([{
        usuario: s.usuario,
        evento,
        cuenta_fb: `cuenta_id:${p.cuenta_id}`,
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

