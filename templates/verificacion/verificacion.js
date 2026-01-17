import { requireSession, loadSidebar, fmtDateISO } from "../../assets/js/app.js";

const sb = window.supabaseClient;

const PAGE_SIZE = 25;

const $ = (id) => document.getElementById(id);

const state = {
  page: 1,
  total: 0,
  rows: [],
  marketplaceTable: null,
};

function safeText(v){ return (v ?? "").toString(); }

function linkCell(url){
  const u = safeText(url).trim();
  if (!u) return "";
  const safe = u.replaceAll('"', "&quot;");
  return `<a href="${safe}" target="_blank" rel="noopener">Abrir</a>`;
}

/**
 * Detecta qué tabla de marketplace existe (porque vos dijiste que está en otra tabla,
 * pero no sabemos el nombre exacto). Probamos varias.
 */
async function detectMarketplaceTable(){
  const candidates = [
    "publicaciones_marketplace",
    "marketplace_publicaciones",
    "publicaciones_mp",
    "marketplace_links",
    "publicaciones_market",
  ];

  for (const t of candidates){
    const { error } = await sb.from(t).select("id").limit(1);
    if (!error) return t;
  }
  return null;
}

async function cargarOperadores(){
  const sel = $("vf-operador");
  if (!sel) return;

  // trae usuarios operadores + (opcional) todos
  const { data, error } = await sb
    .from("usuarios")
    .select("usuario, rol")
    .order("usuario", { ascending: true });

  if (error){
    console.error(error);
    sel.innerHTML = `<option value="">(Error cargando usuarios)</option>`;
    return;
  }

  const ops = (data || []).filter(x => x.rol === "operador").map(x => x.usuario);

  sel.innerHTML = `
    <option value="">Todos los operadores</option>
    ${ops.map(u => `<option value="${u}">${u}</option>`).join("")}
  `;
}

function cargarTipos(){
  const sel = $("vf-tipo");
  if (!sel) return;

  // “Marketplace” es un tipo especial, lo mostramos igual
  sel.innerHTML = `
    <option value="">Todos los tipos</option>
    <option value="historias">Historias</option>
    <option value="reels">Reels</option>
    <option value="muro">Muro</option>
    <option value="grupos">Grupos</option>
    <option value="marketplace">Marketplace</option>
  `;
}

async function fetchRRSS({ fecha, usuario, tipo }){
  let q = sb
    .from("publicaciones_rrss")
    .select("id, fecha, usuario, cuenta_id, tipo, link, created_at")
    .order("created_at", { ascending: false });

  if (fecha) q = q.eq("fecha", fecha);
  if (usuario) q = q.eq("usuario", usuario);
  if (tipo && tipo !== "marketplace") q = q.eq("tipo", tipo);

  const { data, error } = await q;
  if (error) throw error;

  // cuenta_id -> mail (join manual, porque supabase-js simple)
  const cuentaIds = [...new Set((data || []).map(x => x.cuenta_id).filter(Boolean))];
  let cuentasMap = new Map();
  if (cuentaIds.length){
    const { data: cuentas, error: e2 } = await sb
      .from("cuentas_facebook")
      .select("id,email")
      .in("id", cuentaIds);

    if (!e2){
      (cuentas || []).forEach(c => cuentasMap.set(c.id, c.email));
    }
  }

  return (data || []).map(r => ({
    fecha: r.fecha || "",
    usuario: r.usuario || "",
    cuenta: cuentasMap.get(r.cuenta_id) || `#${r.cuenta_id ?? ""}`,
    tipo: r.tipo || "",
    link: r.link || "",
    fuente: "RRSS",
    created_at: r.created_at || null,
  }));
}

async function fetchMarketplace({ fecha, usuario }){
  if (!state.marketplaceTable) return [];

  // Intentamos columnas típicas (porque puede variar tu esquema)
  // Primero probamos campos comunes; si falla, devolvemos vacío sin romper.
  const tryQueries = [
    () => sb.from(state.marketplaceTable).select("id, fecha, usuario, cuenta_fb, link, created_at").order("created_at",{ascending:false}),
    () => sb.from(state.marketplaceTable).select("id, fecha, usuario, cuenta, link, created_at").order("created_at",{ascending:false}),
    () => sb.from(state.marketplaceTable).select("id, fecha, usuario, cuenta_id, link, created_at").order("created_at",{ascending:false}),
  ];

  let data = null;

  for (const make of tryQueries){
    let q = make();
    if (fecha) q = q.eq("fecha", fecha);
    if (usuario) q = q.eq("usuario", usuario);

    const res = await q;
    if (!res.error){
      data = res.data || [];
      break;
    }
  }

  if (!data) return [];

  return data.map(r => ({
    fecha: r.fecha || "",
    usuario: r.usuario || "",
    cuenta: r.cuenta_fb || r.cuenta || (r.cuenta_id ? `#${r.cuenta_id}` : "-"),
    tipo: "marketplace",
    link: r.link || "",
    fuente: "Marketplace",
    created_at: r.created_at || null,
  }));
}

function render(){
  const tbody = $("vf-tbody");
  const info = $("vf-info");
  const page = $("vf-page");
  if (!tbody || !info || !page) return;

  const start = (state.page - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const slice = state.rows.slice(start, end);

  info.textContent = `Resultados: ${state.rows.length} | Mostrando ${slice.length} | Página ${state.page}`;

  if (!slice.length){
    tbody.innerHTML = `<tr><td colspan="6" class="muted">Sin resultados.</td></tr>`;
    page.textContent = `Página ${state.page}`;
    return;
  }

  tbody.innerHTML = slice.map(r => `
    <tr>
      <td title="${safeText(r.fecha)}">${safeText(r.fecha)}</td>
      <td title="${safeText(r.usuario)}">${safeText(r.usuario)}</td>
      <td title="${safeText(r.cuenta)}">${safeText(r.cuenta)}</td>
      <td title="${safeText(r.tipo)}">${safeText(r.tipo)}</td>
      <td>${linkCell(r.link)}</td>
      <td title="${safeText(r.fuente)}">${safeText(r.fuente)}</td>
    </tr>
  `).join("");

  page.textContent = `Página ${state.page}`;
}

async function aplicar(){
  const fechaEl = $("vf-fecha");
  const opEl = $("vf-operador");
  const tipoEl = $("vf-tipo");
  const tbody = $("vf-tbody");
  if (!fechaEl || !opEl || !tipoEl || !tbody) return;

  const fecha = fechaEl.value || "";
  const usuario = opEl.value || "";
  const tipo = tipoEl.value || "";

  tbody.innerHTML = `<tr><td colspan="6" class="muted">Cargando…</td></tr>`;

  try{
    // Si el tipo es marketplace, no traemos RRSS (porque no aplica)
    const rrss = (tipo === "marketplace") ? [] : await fetchRRSS({ fecha, usuario, tipo });
    const mp   = (tipo && tipo !== "marketplace") ? [] : await fetchMarketplace({ fecha, usuario });

    // Merge y orden por created_at (si existe)
    state.rows = [...rrss, ...mp].sort((a,b) => {
      const da = a.created_at ? new Date(a.created_at).getTime() : 0;
      const db = b.created_at ? new Date(b.created_at).getTime() : 0;
      return db - da;
    });

    state.page = 1;
    render();

  }catch(e){
    console.error(e);
    tbody.innerHTML = `<tr><td colspan="6" class="muted">Error cargando: ${safeText(e?.message || e)}</td></tr>`;
  }
}

function initPager(){
  const prev = $("vf-prev");
  const next = $("vf-next");
  if (!prev || !next) return;

  prev.addEventListener("click", () => {
    if (state.page <= 1) return;
    state.page--;
    render();
  });

  next.addEventListener("click", () => {
    const maxPage = Math.max(1, Math.ceil(state.rows.length / PAGE_SIZE));
    if (state.page >= maxPage) return;
    state.page++;
    render();
  });
}

async function init(){
  const s = requireSession();
  if (!s) return;

  // Solo gerente
  if (s.rol !== "gerente"){
    document.body.innerHTML = "<div style='padding:24px;color:#fff'>Solo gerente.</div>";
    return;
  }

  await loadSidebar({ activeKey: "verificacion", basePath: "../" });

  // Defaults
  const today = fmtDateISO(new Date());
  const fechaEl = $("vf-fecha");
  if (fechaEl) fechaEl.value = today;

  cargarTipos();
  await cargarOperadores();

  // Detect marketplace table (si no existe, igual funciona RRSS)
  state.marketplaceTable = await detectMarketplaceTable();
  console.log("Marketplace table:", state.marketplaceTable);

  // Listeners
  const btn = $("vf-apply");
  if (btn) btn.addEventListener("click", aplicar);

  initPager();

  // Primera carga
  await aplicar();
}

document.addEventListener("DOMContentLoaded", init);

