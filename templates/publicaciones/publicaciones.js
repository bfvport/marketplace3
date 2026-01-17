import { requireSession, loadSidebar, fmtDateISO } from "../../assets/js/app.js";

const sb = window.supabaseClient;
const s = requireSession();
const today = fmtDateISO(new Date());

// ✅ Sidebar (si esto no corre, NO aparece navegación)
await loadSidebar(s, "publicaciones");

// ✅ Solo operador y gerente
if (!s || (s.rol !== "operador" && s.rol !== "gerente")) {
  document.body.innerHTML = "<h1 style='padding:30px'>Acceso denegado</h1>";
  throw new Error("Acceso denegado");
}

// 🔒 Gerente entra modo lectura (no guarda)
const READ_ONLY = s.rol === "gerente";

// 🔗 Drive (abre en otra pestaña)
const DRIVE_LINK =
  "https://drive.google.com/drive/folders/1WEKYsaptpUnGCKOszZOKEAovzL5ld7j7?usp=sharing";

const TIPOS = [
  { id: "historia", nombre: "Historias", reqKey: "req_historias" },
  { id: "reel", nombre: "Reels", reqKey: "req_reels" },
  { id: "muro", nombre: "Muro", reqKey: "req_muro" },
  { id: "grupo", nombre: "Grupos", reqKey: "req_grupos" },
];

// ✅ Auto refresh (no hace falta botón “Actualizar”)
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
  if (s.rol === "gerente") {
    await initSelectorGerente();
    document.getElementById("box-gerente").style.display = "inline-flex";
  }

  await renderAll(getUsuarioObjetivoActual(), { soft: false });

  // Auto refresh
  startAutoRefresh();

  // Pausar si la pestaña no está visible
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopAutoRefresh();
    else {
      startAutoRefresh();
      renderAll(getUsuarioObjetivoActual(), { soft: true });
    }
  });
}

function startAutoRefresh() {
  stopAutoRefresh();
  timer = setInterval(() => {
    renderAll(getUsuarioObjetivoActual(), { soft: true });
  }, REFRESH_MS);
}

function stopAutoRefresh() {
  if (timer) clearInterval(timer);
  timer = null;
}

function getUsuarioObjetivoActual() {
  if (s.rol !== "gerente") return s.usuario;
  return document.getElementById("sel-operador")?.value || s.usuario;
}

/* =========================
   GERENTE: selector de operador
========================= */
async function initSelectorGerente() {
  const sel = document.getElementById("sel-operador");

  // Tomamos operadores de usuarios_asignado (ya existe en tu sistema)
  const { data, error } = await sb
    .from("usuarios_asignado")
    .select("usuario")
    .order("usuario", { ascending: true });

  if (error) {
    console.error(error);
    sel.innerHTML = `<option value="${s.usuario}">${s.usuario}</option>`;
    return;
  }

  const unique = [...new Set((data || []).map(x => x.usuario).filter(Boolean))];

  sel.innerHTML = unique.length
    ? unique.map(u => `<option value="${u}">${u}</option>`).join("")
    : `<option value="${s.usuario}">${s.usuario}</option>`;

  sel.addEventListener("change", () => {
    renderAll(getUsuarioObjetivoActual(), { soft: false });
  });
}

/* =========================
   Render principal
========================= */
async function renderAll(usuario, opts = {}) {
  try {
    const [cuentas, plan, linksHoy] = await Promise.all([
      cargarCuentas(usuario),
      cargarPlanHoy(usuario),
      cargarLinksHoy(usuario),
    ]);

    renderCards(usuario, cuentas, plan, linksHoy, opts.soft === true);
  } catch (e) {
    console.error(e);
    cont.innerHTML = `
      <div class="card" style="grid-column: span 12;">
        <h3 class="card-title">Error cargando Recursos</h3>
        <p class="muted small">Revisá consola (F12). Puede ser tabla/permiso/RLS.</p>
      </div>
    `;
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
  // ✅ Tabla RRSS nueva: publicaciones_rrss
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

function safeHtml(v) {
  return String(v || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/* =========================
   Render Cards
========================= */
function renderCards(usuario, cuentas, plan, linksHoy, soft) {
  const byTipo = new Map();
  for (const t of TIPOS) byTipo.set(t.id, []);
  for (const l of (linksHoy || [])) if (byTipo.has(l.tipo)) byTipo.get(l.tipo).push(l);

  // Guardar estado (no perder lo que el operador está escribiendo)
  const prevState = new Map();
  if (soft) {
    for (const t of TIPOS) {
      prevState.set(t.id, {
        sel: document.getElementById(`sel-${t.id}`)?.value || "",
        inp: document.getElementById(`inp-${t.id}`)?.value || "",
      });
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
            <div class="muted small">Operador: <b>${safeHtml(usuario)}</b>${READ_ONLY ? " <span class='muted'>(lectura)</span>" : ""}</div>
          </div>

          <div class="kpis">
            <span class="badge ${st.cls}">${st.text}</span>
            <span class="badge">${done}/${meta}</span>
          </div>
        </div>

        <div class="progress"><div style="width:${pct}%"></div></div>

        <div class="row">
          <select id="sel-${t.id}" ${READ_ONLY ? "disabled" : ""}>
            <option value="">Seleccionar cuenta</option>
            ${(cuentas || []).map(c => `<option value="${safeHtml(c.email)}">${safeHtml(c.email)}</option>`).join("")}
          </select>

          <input id="inp-${t.id}" type="url" placeholder="Pegá el link acá..." ${READ_ONLY ? "disabled" : ""} />
        </div>

        <div class="row" style="margin-top:10px;">
          <button class="btn" ${READ_ONLY ? "disabled" : ""} onclick="guardarLink('${t.id}')">Guardar link</button>
        </div>

        <div class="links" id="box-${t.id}">
          ${renderListaLinks(arr, "")}
        </div>
      </section>
    `;
  }

  // Enganchar filtros por cuenta (y restauro estado en refresh suave)
  for (const t of TIPOS) {
    const sel = document.getElementById(`sel-${t.id}`);
    const inp = document.getElementById(`inp-${t.id}`);

    if (soft) {
      const st = prevState.get(t.id);
      if (st) {
        sel.value = st.sel;
        inp.value = st.inp;

        if (st.sel) {
          const arr = byTipo.get(t.id) || [];
          document.getElementById(`box-${t.id}`).innerHTML = renderListaLinks(arr, st.sel);
        }
      }
    } else {
      sel?.addEventListener("change", () => {
        const cuenta = sel.value || "";
        const arr = byTipo.get(t.id) || [];
        document.getElementById(`box-${t.id}`).innerHTML = renderListaLinks(arr, cuenta);
      });
    }
  }
}

function renderListaLinks(arr, cuentaFiltro) {
  const list = cuentaFiltro ? arr.filter(x => x.cuenta_fb === cuentaFiltro) : arr;

  if (!list.length) {
    return `<p class="muted small">Todavía no hay links cargados hoy${cuentaFiltro ? " para esta cuenta" : ""}.</p>`;
  }

  return list.slice(0, 40).map(l => `
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
   Guardar Link
========================= */
window.guardarLink = async function(tipo) {
  if (READ_ONLY) return;

  const usuario = getUsuarioObjetivoActual();
  const sel = document.getElementById(`sel-${tipo}`);
  const inp = document.getElementById(`inp-${tipo}`);

  const cuenta = sel?.value || "";
  const link = (inp?.value || "").trim();

  if (!cuenta) return alert("Seleccioná una cuenta");
  if (!link.startsWith("http")) return alert("Pegá un link válido (http/https)");

  const { error } = await sb.from("publicaciones_rrss").insert({
    usuario,
    cuenta_fb: cuenta,
    tipo,
    link,
    fecha: today,
  });

  if (error) {
    console.error(error);
    alert("Error guardando link. Revisá consola (F12).");
    return;
  }

  inp.value = "";
  await renderAll(usuario, { soft: true });
};
