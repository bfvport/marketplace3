import { requireSession, loadSidebar, fmtDateISO } from "../../assets/js/app.js";

const s = requireSession();
const sb = window.supabaseClient;
const $ = (id) => document.getElementById(id);
const today = fmtDateISO(new Date());

// ====== RANGO "HOY" EN ARG (UTC para timestamps) ======
function getARGDayRangeUTC() {
  const now = new Date();
  const arg = new Date(now.toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  const y = arg.getFullYear();
  const m = arg.getMonth();
  const d = arg.getDate();

  // ARG ~ UTC-3
  const startUTC = new Date(Date.UTC(y, m, d, 3, 0, 0));
  const endUTC = new Date(Date.UTC(y, m, d, 26, 59, 59));

  return { start: startUTC.toISOString(), end: endUTC.toISOString() };
}

function nowISO() {
  return new Date().toISOString();
}

function clamp0(n) {
  n = Number(n || 0);
  return n < 0 ? 0 : n;
}

function normalizePlatform(p) {
  const v = String(p || "").toLowerCase().trim();
  return v || "marketplace";
}

function normalizeTipoRRSS(t) {
  const v = String(t || "").toLowerCase().trim();
  if (!v) return "muro";
  if (v === "grupos") return "grupo";
  if (v === "historias") return "historia";
  if (v === "reels") return "reel";
  return v;
}

function initDoneObj() {
  return { marketplace: 0, tiktok: 0, facebook: { muro: 0, grupo: 0, historia: 0, reel: 0 } };
}

function initReqObj() {
  return { marketplace: 0, tiktok: 0, facebook: { muro: 0, grupo: 0, historia: 0, reel: 0 } };
}

function sumObj(o) {
  return (
    clamp0(o.marketplace) +
    clamp0(o.tiktok) +
    clamp0(o.facebook?.muro) +
    clamp0(o.facebook?.grupo) +
    clamp0(o.facebook?.historia) +
    clamp0(o.facebook?.reel)
  );
}

function diffObj(req, done) {
  return {
    marketplace: clamp0((req.marketplace || 0) - (done.marketplace || 0)),
    tiktok: clamp0((req.tiktok || 0) - (done.tiktok || 0)),
    facebook: {
      muro: clamp0((req.facebook?.muro || 0) - (done.facebook?.muro || 0)),
      grupo: clamp0((req.facebook?.grupo || 0) - (done.facebook?.grupo || 0)),
      historia: clamp0((req.facebook?.historia || 0) - (done.facebook?.historia || 0)),
      reel: clamp0((req.facebook?.reel || 0) - (done.facebook?.reel || 0)),
    },
  };
}

function fmtBreakdown(obj) {
  const parts = [];
  if (obj.marketplace) parts.push(`MP: <b>${obj.marketplace}</b>`);
  if (obj.facebook?.muro) parts.push(`FB Muro: <b>${obj.facebook.muro}</b>`);
  if (obj.facebook?.grupo) parts.push(`FB Grupo: <b>${obj.facebook.grupo}</b>`);
  if (obj.facebook?.historia) parts.push(`FB Historia: <b>${obj.facebook.historia}</b>`);
  if (obj.facebook?.reel) parts.push(`FB Reel: <b>${obj.facebook.reel}</b>`);
  if (obj.tiktok) parts.push(`TT: <b>${obj.tiktok}</b>`);
  return parts.length ? parts.join(" · ") : "—";
}

// ====== AVISOS (sistema_avisos) ======
async function getUltimoAviso() {
  const { data, error } = await sb
    .from("sistema_avisos")
    .select("id, contenido, autor, updated_at")
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error("Error leyendo sistema_avisos:", error);
    return null;
  }
  return data && data.length ? data[0] : null;
}

function renderAviso(aviso) {
  const text = $("aviso-text");
  if (!text) return;

  if (!aviso || !aviso.contenido) {
    text.textContent = "No hay avisos por ahora.";
    return;
  }

  const autor = aviso.autor ? `— ${aviso.autor}` : "";
  const fecha = aviso.updated_at
    ? new Date(aviso.updated_at).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })
    : "";

  text.textContent = `${aviso.contenido}\n\n${autor}${fecha ? ` · ${fecha}` : ""}`.trim();
}

async function enableAvisoEditorIfGerente() {
  const form = $("aviso-form");
  const input = $("aviso-input");
  const btn = $("aviso-save");
  if (!form || !input || !btn) return;

  if (s.rol !== "gerente") {
    form.style.display = "none";
    return;
  }

  form.style.display = "block";

  // precarga
  const actual = await getUltimoAviso();
  input.value = actual?.contenido || "";

  btn.onclick = async () => {
    const contenido = (input.value || "").trim();
    if (!contenido) {
      alert("El aviso no puede estar vacío.");
      return;
    }

    const ultimo = await getUltimoAviso();

    if (ultimo?.id) {
      const { error } = await sb
        .from("sistema_avisos")
        .update({ contenido, autor: s.usuario, updated_at: nowISO() })
        .eq("id", ultimo.id);

      if (error) {
        console.error("Error update aviso:", error);
        alert("No se pudo publicar el aviso.");
        return;
      }
    } else {
      const { error } = await sb.from("sistema_avisos").insert({
        contenido,
        autor: s.usuario,
        updated_at: nowISO(),
      });

      if (error) {
        console.error("Error insert aviso:", error);
        alert("No se pudo publicar el aviso.");
        return;
      }
    }

    const nuevo = await getUltimoAviso();
    renderAviso(nuevo);
    alert("Aviso publicado ✅");
  };
}

// ====== INIT ======
(async function init() {
  await loadSidebar({ activeKey: "dashboard", basePath: "../" });

  $("welcome-user").textContent = `Hola, ${s.usuario} 👋`;
  $("fecha-actual").textContent = new Date().toLocaleDateString("es-AR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Avisos
  const aviso = await getUltimoAviso();
  renderAviso(aviso);
  await enableAvisoEditorIfGerente();

  // Pendientes
  await verificarTodo();
})();

// ====== MAESTRA ======
async function verificarTodo() {
  const container = $("alerta-container");
  container.innerHTML = "";

  await Promise.all([
    checkDiario(container),
    checkCalentamiento(container),
    checkMetricas(container),
    checkCSVDeadline(container),
  ]);

  if (container.innerHTML === "") {
    container.innerHTML = `
      <div class="card" style="border-left: 5px solid #10b981; background: rgba(16, 185, 129, 0.1);">
        <h3 style="color:#10b981; margin:0;">✅ ¡Todo al día!</h3>
        <p style="margin:5px 0 0 0;">No tenés tareas pendientes por ahora.</p>
      </div>`;
  }
}

// ====== 1) DIARIO (NUEVO: plataforma + tipo_rrss + tiktok) ======
async function checkDiario(container) {
  const { start, end } = getARGDayRangeUTC();

  // 1) Asignaciones activas hoy
  let qAsig = sb
    .from("usuarios_asignado")
    .select("id, usuario, categoria, marketplace_daily, muro_daily, grupo_daily, historia_daily, reels_daily, tiktok_daily, fecha_desde, fecha_hasta")
    .lte("fecha_desde", today)
    .gte("fecha_hasta", today);

  if (s.rol !== "gerente") qAsig = qAsig.eq("usuario", s.usuario);

  const { data: asigs, error: eA } = await qAsig;
  if (eA) {
    console.error("Error usuarios_asignado:", eA);
    return;
  }

  if (!asigs || !asigs.length) return;

  // 2) Publicaciones hechas hoy (rango ARG)
  let qHechos = sb
    .from("marketplace_actividad")
    .select("usuario, plataforma, tipo_rrss")
    .gte("fecha_publicacion", start)
    .lte("fecha_publicacion", end);

  if (s.rol !== "gerente") qHechos = qHechos.eq("usuario", s.usuario);

  const { data: hechos, error: eH } = await qHechos;
  if (eH) {
    console.error("Error marketplace_actividad:", eH);
    return;
  }

  // 3) Mapear requeridos por usuario (sumando categorías si hay más de una)
  const reqByUser = new Map();
  for (const a of asigs) {
    const u = a.usuario;
    if (!reqByUser.has(u)) reqByUser.set(u, initReqObj());

    const req = reqByUser.get(u);
    req.marketplace += Number(a.marketplace_daily || 0);
    req.tiktok += Number(a.tiktok_daily || 0);
    req.facebook.muro += Number(a.muro_daily || 0);
    req.facebook.grupo += Number(a.grupo_daily || 0);
    req.facebook.historia += Number(a.historia_daily || 0);
    req.facebook.reel += Number(a.reels_daily || 0);
  }

  // 4) Mapear hechos por usuario con plataforma/tipo
  const doneByUser = new Map();
  for (const h of hechos || []) {
    const u = h.usuario;
    if (!doneByUser.has(u)) doneByUser.set(u, initDoneObj());

    const done = doneByUser.get(u);

    const p = normalizePlatform(h.plataforma);
    if (p === "marketplace") {
      done.marketplace += 1;
    } else if (p === "tiktok") {
      done.tiktok += 1;
    } else if (p === "facebook") {
      const t = normalizeTipoRRSS(h.tipo_rrss);
      if (done.facebook[t] !== undefined) done.facebook[t] += 1;
      else done.facebook.muro += 1; // fallback seguro
    } else {
      // cualquier cosa rara -> marketplace
      done.marketplace += 1;
    }
  }

  // 5) Alertas
  for (const [usuario, req] of reqByUser.entries()) {
    const done = doneByUser.get(usuario) || initDoneObj();
    const missing = diffObj(req, done);
    const faltaTotal = sumObj(missing);

    if (faltaTotal > 0) {
      const breakdown = fmtBreakdown(missing);
      const msgUser = (s.rol === "gerente")
        ? `El operador <b>${usuario}</b> tiene pendientes <b>${faltaTotal}</b> hoy.`
        : `Te faltan <b>${faltaTotal}</b> publicaciones hoy.`;

      agregarAlerta(
        container,
        "error",
        "⚠️ Publicaciones Pendientes",
        `${msgUser}<br><span style="opacity:.9">${breakdown}</span>
         <br><a href="../diario/diario.html" style="color:#fff; text-decoration:underline;">Ir al Diario</a>`
      );
    }
  }
}

// ====== 2) CALENTAMIENTO (legacy) ======
async function checkCalentamiento(container) {
  let q = sb.from("cuentas_facebook").select("email, ocupada_por").eq("calidad", "frio");
  if (s.rol !== "gerente") q = q.eq("ocupada_por", s.usuario);

  const { data: frias, error } = await q;
  if (error) return console.error("Error cuentas_facebook:", error);

  if (frias && frias.length > 0) {
    const msg = s.rol === "gerente"
      ? `Hay <b>${frias.length}</b> cuentas frías en el equipo.`
      : `Tenés <b>${frias.length}</b> cuentas en estado FRÍO para trabajar hoy.`;
    agregarAlerta(container, "warning", "🔥 Calentamiento Requerido", msg);
  }
}

// ====== 3) MÉTRICAS ======
async function checkMetricas(container) {
  let q = sb.from("metricas").select("created_at, usuario").order("created_at", { ascending: false }).limit(1);
  if (s.rol !== "gerente") q = q.eq("usuario", s.usuario);

  const { data: lastMetric, error } = await q;
  if (error) return console.error("Error metricas:", error);

  let diasSinCarga = 999;
  if (lastMetric && lastMetric.length > 0) {
    const ultimaFecha = new Date(lastMetric[0].created_at);
    const hoy = new Date();
    diasSinCarga = Math.floor((hoy - ultimaFecha) / (1000 * 60 * 60 * 24));
  }

  if (diasSinCarga >= 7) {
    const texto = s.rol === "gerente"
      ? "Alguien del equipo no carga métricas hace +7 días."
      : `Hace <b>${diasSinCarga} días</b> que no cargas el reporte de Clicks.`;
    agregarAlerta(
      container,
      "error",
      "📊 Reporte Semanal Vencido",
      texto + ` <a href='../metricas/metricas.html' style='color:#fff; text-decoration:underline;'>Ir a cargar ahora</a>`
    );
  }
}

// ====== 4) DÍAS RESTANTES (CSV / asignación) ======
async function checkCSVDeadline(container) {
  // Esto no toca Diario: solo alerta si la fecha_hasta está cerca.
  let q = sb
    .from("usuarios_asignado")
    .select("usuario, categoria, fecha_hasta")
    .lte("fecha_desde", today)
    .gte("fecha_hasta", today);

  if (s.rol !== "gerente") q = q.eq("usuario", s.usuario);

  const { data, error } = await q;
  if (error) return;

  const hoy = new Date(today + "T00:00:00");
  for (const a of data || []) {
    if (!a.fecha_hasta) continue;
    const fin = new Date(String(a.fecha_hasta).slice(0, 10) + "T00:00:00");
    const dias = Math.ceil((fin - hoy) / (1000 * 60 * 60 * 24));

    if (dias <= 3) {
      const who = s.rol === "gerente" ? `El operador <b>${a.usuario}</b>` : "Vos";
      agregarAlerta(
        container,
        "warning",
        "⏰ Fin de asignación cerca",
        `${who} tiene la asignación de <b>${a.categoria}</b> por terminar.
         <br>Quedan <b>${dias}</b> día(s).`
      );
    }
  }
}

// ====== UI ALERTAS ======
function agregarAlerta(container, tipo, titulo, mensaje) {
  const div = document.createElement("div");
  const color = tipo === "error" ? "#ef4444" : "#f59e0b";
  const bg = tipo === "error" ? "rgba(239, 68, 68, 0.15)" : "rgba(245, 158, 11, 0.15)";

  div.className = "card";
  div.style.borderLeft = `5px solid ${color}`;
  div.style.background = bg;
  div.style.padding = "15px";

  div.innerHTML = `
    <strong style="color:${color}; display:block; margin-bottom:5px;">${titulo}</strong>
    <span style="color:#e2e8f0;">${mensaje}</span>
  `;
  container.appendChild(div);
}
