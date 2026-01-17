import { requireSession, loadSidebar, fmtDateISO } from "../../assets/js/app.js";

const sb = window.supabaseClient;
const s = requireSession();
const today = fmtDateISO(new Date());

await loadSidebar(s, "publicaciones");

// ✅ Permitir operador y gerente
if (!s || (s.rol !== "operador" && s.rol !== "gerente")) {
  document.body.innerHTML = "<h1 style='padding:30px'>Acceso denegado</h1>";
  throw new Error("Acceso denegado");
}

// 🔒 Si es gerente: modo lectura (no guarda)
const READ_ONLY = s.rol === "gerente";

// 🔗 Drive central (abre en otra pestaña)
const DRIVE_LINK =
  "https://drive.google.com/drive/folders/1WEKYsaptpUnGCKOszZOKEAovzL5ld7j7?usp=sharing";

// Tipos RRSS
const TIPOS = [
  { id: "historia", nombre: "Historias", reqKey: "req_historias" },
  { id: "reel", nombre: "Reels", reqKey: "req_reels" },
  { id: "muro", nombre: "Muro", reqKey: "req_muro" },
  { id: "grupo", nombre: "Grupos", reqKey: "req_grupos" },
];

// Auto refresh suave (para que se note “en vivo” sin reventar la DB)
const REFRESH_MS = 8000;
let timer = null;

const cont = document.getElementById("cards-recursos");

document.getElementById("btn-drive").href = DRIVE_LINK;
document.getElementById("pill-rol").textContent = `Rol: ${s.rol}`;
document.getElementById("pill-hoy").textContent = `Hoy: ${today}`;

init();

/* =========================
   INIT
========================= */
async function init() {
  // Si entra gerente, habilitamos selector de operador (pro y útil)
  let usuarioObjetivo = s.usuario;

  if (s.rol === "gerente") {
    await initSelectorGerente();
    usuarioObjetivo = document.getElementById("sel-operador").value || s.usuario;
  }

  await renderAll(usuarioObjetivo);

  // Auto-refresh
  if (timer) clearInterval(timer);
  timer = setInterval(async () => {
    const u = getUsuarioObjetivoActual();
    await renderAll(u, { soft: true });
  }, REFRESH_MS);

  // Pausa si pestaña no visible
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (timer) clearInterval(timer);
      timer = null;
    } else {
      if (!timer) timer = setInterval(async () => {
        const u = getUsuarioObjetivoActual();
        await renderAll(u, { soft: true });
      }, REFRESH_MS);
      renderAll(getUsuarioObjetivoActual(), { soft: true });
    }
  });
}

function getUsuarioObjetivoActual() {
  if (s.rol !== "gerente") return s.usuario;
  return document.getElementById("sel-operador")?.value || s.usuario;
}

/* =========================
   GERENTE: SELECTOR OPERADOR
========================= */
async function initSelectorGerente() {
  const box = document.getElementById("box-gerente");
  const sel = document.getElementById("sel-operador");

  box.style.display = "inline-flex";

  // Traemos usuarios asignados (operadores)
  // Si tu sistema usa otra tabla para usuarios, lo adaptamos después.
  const { data, error } = await sb
    .from("usuarios_asignado")
    .select("usuario")
    .order("usuario", { ascending: true });

  if (error) {
    console.error(error);
    // si falla, igual dejamos al gerente ver su propio usuario
    sel.innerHTML = `<option value="${s.usuario}">${s.usuario}</option>`;
    return;
  }

  const unique = [...new Set((data || []).map(x => x.usuario).filter(Boolean))];

  sel.innerHTML = unique.length
    ? unique.map(u => `<option value="${u}">${u}</option>`).join("")
    : `<option value="${s.usuario}">${s.usuario}</option>`;

  sel.addEventListener("change", async () => {
    await renderAll(getUsuarioObjetivoActual());
  });
}

/* =========================
   RENDER PRINCIPAL
========================= */
async function renderAll(usuario, opts = {}) {
  try {
    // 1) Cuentas asignadas al operador (ocupada_por)
    const cuentas = await cargarCuentas(usuario);

    // 2) Plan de calentamiento (para objetivos)
    const plan = await cargarPlanHoy(usuario);

    // 3) Links RRSS del día (para contadores/listas)
    const linksHoy = await cargarLinksHoy(usuario);

    // Render cards
    renderCards(usuario, cuentas, plan, linksHoy, opts.soft === true);
  } catch (e) {
    console.error(e);
    cont.innerHTML = `<div class="card" style="grid-column: span 12;">
      <h3 class="card-title">Error</h3>
      <p class="muted small">No se pudo cargar el Centro de Recursos. Revisá consola (F12).</p>
    </div>`;
  }
}

/* =========================
   DATA
========================= */
async function cargarCuentas(usuario) {
  const { data, error } = await sb
    .from("cuentas_facebook")
    .select("email")
    .eq("ocupada_por", usuario)
    .order("email", { ascending: true });

  if (error) throw error;
  return data || [];
}

async function cargarPlanHoy(usuario) {
  const { data, error } = await sb
    .from("calentamiento_plan")
    .select("*")
    .eq("usuario", usuario)
    .eq("fecha", today);

  if (error) throw error;
  return data || [];
}

async function cargarLinksHoy(usuario) {
  // Tabla nueva que definimos para RRSS:
  // publicaciones_rrss (historia/reel/muro/grupo)
  const { data, error } = await sb
    .from("publicaciones_rrss")
    .select("*")
    .eq("usuario", usuario)
    .eq("fecha", today)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

/* =========================
   HELPERS
========================= */
function calcularMeta(tipoId, planes) {
  const t = TIPOS.find(x => x.id === tipoId);
  if (!t) return 0;

  let total = 0;
  for (const p of (planes || [])) total += Number(p[t.reqKey] || 0);
  return total;
}

function buildStatus(done, meta) {
  if (meta <= 0) return { cls: "warn", text: "Sin plan" };
  if (done >= meta) return { cls: "ok", text: "Cumplido" };
  return { cls: "info", text: `Pend. ${meta - done}` };
}

function safeHtml(s) {
  return String(s || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/* =========================
   RENDER CARDS
========================= */
function renderCards(usuario, cuentas, plan, linksHoy, soft) {
  // Agrupar links por tipo y por cuenta
  const byTipo = new Map(); // tipo => array links
  for (const t of TIPOS) byTipo.set(t.id, []);
  for (const l of (linksHoy || [])) {
    if (byTipo.has(l.tipo)) byTipo.get(l.tipo).push(l);
  }

  // No reventar scroll/inputs en refresh suave:
  // si soft, guardamos valores actuales de selects/inputs
  const prevState = new Map();
  if (soft) {
    for (const t of TIPOS) {
      const sel = document.getElementById(`sel-${t.id}`);
      const inp = document.getElementById(`inp-${t.id}`);
      prevState.set(t.id, { sel: sel?.value || "", inp: inp?.value || "" });
    }
  }

  cont.innerHTML = "";

  for (const t of TIPOS) {
    const meta = calcularMeta(t.id, plan);
    const arr = byTipo.get(t.id) || [];
    const done = arr.length;

    const st = buildStatus(done, meta);
    const pct = meta > 0 ? Math.min(100, Math.round((done / meta) * 100)) : 0;

    cont.innerHTML += `
      <section class="card" data-tipo="${t.id}">
        <div class="card-top">
          <div>
            <h3 class="card-title">${t.nombre}</h3>
            <div class="muted small">Operador: <b>${safeHtml(usuario)}</b></div>
          </div>

          <div class="kpis">
            <span class="badge ${st.cls}">${st.text}</span>
            <span class="badge">${done}/${meta}</span>
          </div>
        </div>

        <div class="progress"><div id="prog-${t.id}" style="width:${pct}%"></div></div>

        <div class="row">
          <select id="sel-${t.id}" ${READ_ONLY ? "disabled" : ""}>
            <option value="">Seleccionar cuenta</option>
            ${(cuentas || []).map(c => `<option value="${safeHtml(c.email)}">${safeHtml(c.email)}</option>`).join("")}
          </select>

          <input id="inp-${t.id}" type="url" placeholder="Pegá el link acá..." ${READ_ONLY ? "disabled" : ""} />
        </div>

        <div class="row" style="margin-top:10px;">
          <button class="btn" ${READ_ONLY ? "disabled" : ""} onclick="guardarLink('${t.id}')">Guardar link</button>
          <button class="btn secondary" onclick="refrescarTipo('${t.id}')">Actualizar</button>
        </div>

        <div class="links" id="box-${t.id}">
          ${renderListaLinks(arr, "")}
        </div>
      </section>
    `;
  }

  // Restauro selects/inputs si fue refresh suave
  if (soft) {
    for (const t of TIPOS) {
      const st = prevState.get(t.id);
      if (!st) continue;
      const sel = document.getElementById(`sel-${t.id}`);
      const inp = document.getElementById(`inp-${t.id}`);
      if (sel) sel.value = st.sel;
      if (inp) inp.value = st.inp;

      // Si hay cuenta seleccionada, filtramos la lista a esa cuenta
      if (st.sel) {
        const arr = byTipo.get(t.id) || [];
        document.getElementById(`box-${t.id}`).innerHTML = renderListaLinks(arr, st.sel);
      }
    }
  } else {
    // Primera carga: enganchar change para filtrar lista por cuenta
    for (const t of TIPOS) {
      const sel = document.getElementById(`sel-${t.id}`);
      sel?.addEventListener("change", () => {
        const cuenta = sel.value || "";
        const arr = byTipo.get(t.id) || [];
        document.getElementById(`box-${t.id}`).innerHTML = renderListaLinks(arr, cuenta);
      });
    }
  }
}

function renderListaLinks(arr, cuentaFiltro) {
  const list = (cuentaFiltro ? arr.filter(x => x.cuenta_fb === cuentaFiltro) : arr);

  if (!list.length) {
    return `<p class="muted small">Todavía no hay links cargados hoy${cuentaFiltro ? " para esta cuenta" : ""}.</p>`;
  }

  return list.slice(0, 30).map(l => `
    <div class="link-item">
      <div class="left">
        <span><b>${safeHtml(l.cuenta_fb)}</b></span>
        <span class="muted small">${new Date(l.created_at).toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"})}</span>
      </div>
      <a href="${safeHtml(l.link)}" target="_blank" rel="noopener noreferrer">Ver</a>
    </div>
  `).join("");
}

/* =========================
   ACTIONS
========================= */
window.refrescarTipo = async function(tipo) {
  // refresca todo (simple y seguro)
  await renderAll(getUsuarioObjetivoActual());
};

window.guardarLink = async function(tipo) {
  if (READ_ONLY) return;

  const usuario = getUsuarioObjetivoActual();
  const sel = document.getElementById(`sel-${tipo}`);
  const inp = document.getElementById(`inp-${tipo}`);

  const cuenta = sel?.value || "";
  const link = (inp?.value || "").trim();

  if (!cuenta) return alert("Seleccioná una cuenta");
  if (!link.startsWith("http")) return alert("Pegá un link válido (http/https)");

  // Insert en tabla nueva RRSS
  const { error } = await sb.from("publicaciones_rrss").insert({
    usuario,
    cuenta_fb: cuenta,
    tipo,
    link,
    fecha: today,
  });

  if (error) {
    console.error(error);
    alert("Error guardando link. Mirá consola (F12).");
    return;
  }

  // Limpio input y refresco
  if (inp) inp.value = "";
  await renderAll(usuario, { soft: true });
};
