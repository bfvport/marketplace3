import { requireSession, loadSidebar } from "../../assets/js/app.js";

const sb = window.supabaseClient;

// Tablas reales del proyecto
const TABLE_RRSS = "publicaciones_rrss";
const TABLE_ACT  = "marketplace_actividad";

const $fecha     = document.getElementById("f-fecha");
const $operador  = document.getElementById("f-operador");
const $plataforma= document.getElementById("f-plataforma");
const $tipo      = document.getElementById("f-tipo");
const $btn       = document.getElementById("btn-aplicar");
const $tbody     = document.getElementById("veri-tbody");

function toISODate(d){
  const pad = (n) => String(n).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function esc(x){
  return String(x ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function setMsg(msg){
  $tbody.innerHTML = `<tr><td colspan="7">${esc(msg)}</td></tr>`;
}

function normalizeTipoRRSS(t){
  const v = String(t || "").toLowerCase().trim();
  if (v === "grupos") return "grupo";
  if (v === "historias") return "historia";
  if (v === "reels") return "reel";
  return v;
}

function prettyPlataforma(p){
  const v = String(p || "").toLowerCase();
  if (v === "marketplace") return "Marketplace";
  if (v === "facebook") return "Facebook";
  if (v === "tiktok") return "TikTok";
  return v || "-";
}

function prettyTipo(t){
  const v = normalizeTipoRRSS(t);
  if (!v) return "-";
  if (v === "muro") return "Muro";
  if (v === "grupo") return "Grupo";
  if (v === "historia") return "Historia";
  if (v === "reel") return "Reel";
  if (v === "marketplace") return "Marketplace";
  if (v === "tiktok") return "TikTok";
  return v;
}

function rowHTML(r){
  const link = r.link
    ? `<a class="link-btn" href="${esc(r.link)}" target="_blank" rel="noopener">Abrir</a>`
    : `<span style="opacity:.65">-</span>`;

  return `
    <tr>
      <td>${esc(r.fecha || "-")}</td>
      <td>${esc(r.usuario || "-")}</td>
      <td>${esc(r.cuenta || "-")}</td>
      <td>${esc(prettyPlataforma(r.plataforma))}</td>
      <td>${esc(prettyTipo(r.tipo))}</td>
      <td>${link}</td>
      <td>${esc(r.fuente || "-")}</td>
    </tr>
  `;
}

async function loadOperators(){
  const { data, error } = await sb
    .from("usuarios")
    .select("usuario, rol")
    .order("usuario", { ascending: true });

  if (error){
    console.error("Usuarios error:", error);
    return;
  }

  const ops = (data || []).filter(u => u.rol === "operador");
  const current = $operador.value;

  $operador.innerHTML =
    `<option value="">Todos los operadores</option>` +
    ops.map(u => `<option value="${esc(u.usuario)}">${esc(u.usuario)}</option>`).join("");

  $operador.value = current || "";
}

/**
 * RRSS histórico (tabla publicaciones_rrss)
 * - plataforma fija: facebook
 * - tipo viene en columna "tipo"
 */
async function fetchRRSS({ fecha, operador, plataforma, tipo }) {
  // Si filtro plataforma está y no es facebook, no traemos RRSS
  if (plataforma && plataforma !== "facebook") return [];

  let q = sb
    .from(TABLE_RRSS)
    .select("usuario, cuenta_fb, tipo, link, fecha")
    .order("fecha", { ascending: false })
    .limit(600);

  if (fecha) q = q.eq("fecha", fecha);
  if (operador) q = q.eq("usuario", operador);

  // tipo RRSS
  if (tipo) {
    // En tu tabla a veces aparece "historias/grupos/reels"
    // Normalizamos sin romper: probamos con el que venga
    const raw = String(tipo);
    const alt =
      raw === "grupo" ? "grupos" :
      raw === "historia" ? "historias" :
      raw === "reel" ? "reels" : raw;

    // Traemos cualquiera de las dos variantes
    q = q.in("tipo", [raw, alt]);
  }

  const { data, error } = await q;
  if (error){
    console.error("RRSS error:", error);
    return [];
  }

  return (data || []).map(x => ({
    fuente: "publicaciones_rrss",
    fecha: (x.fecha || "").slice(0,10),
    usuario: x.usuario,
    cuenta: x.cuenta_fb,
    plataforma: "facebook",
    tipo: normalizeTipoRRSS(x.tipo),
    link: x.link
  }));
}

/**
 * Actividad nueva (marketplace_actividad)
 * - usa plataforma + tipo_rrss + link_publicacion (si existe)
 * - fallback: marketplace_link_publicacion
 */
async function fetchActividad({ fecha, operador, plataforma, tipo }) {
  let q = sb
    .from(TABLE_ACT)
    .select("usuario, facebook_account_usada, fecha_publicacion, created_at, plataforma, tipo_rrss, link_publicacion, marketplace_link_publicacion")
    .order("fecha_publicacion", { ascending: false })
    .limit(800);

  if (operador) q = q.eq("usuario", operador);

  // filtro por rango (funciona si fecha_publicacion es timestamp)
  // si fuese date, igual suele funcionar bien con gte/lte en texto ISO
  if (fecha){
    const start = `${fecha}T00:00:00`;
    const end   = `${fecha}T23:59:59`;
    q = q.gte("fecha_publicacion", start).lte("fecha_publicacion", end);
  }

  // filtro plataforma (nuevo)
  if (plataforma) q = q.eq("plataforma", plataforma);

  // filtro tipo_rrss (solo aplica a facebook)
  if (tipo) q = q.eq("tipo_rrss", tipo);

  const { data, error } = await q;
  if (error){
    console.error("Actividad error:", error);
    return [];
  }

  return (data || []).map(x => {
    const plat = x.plataforma || "marketplace";
    const link = x.link_publicacion || x.marketplace_link_publicacion || null;

    let tipoMostrar = x.tipo_rrss || "";
    if (plat === "marketplace") tipoMostrar = "marketplace";
    if (plat === "tiktok") tipoMostrar = "tiktok";

    return {
      fuente: "marketplace_actividad",
      fecha: String((x.fecha_publicacion || x.created_at || "")).slice(0,10),
      usuario: x.usuario,
      cuenta: x.facebook_account_usada || "-",
      plataforma: plat,
      tipo: tipoMostrar,
      link
    };
  });
}

function enforceTipoEnabled(){
  const plat = $plataforma.value || "";
  // Solo Facebook usa tipo_rrss
  const enabled = (plat === "" || plat === "facebook");
  $tipo.disabled = !enabled;
  if (!enabled) $tipo.value = "";
}

async function render(){
  const fecha = $fecha?.value || "";
  const operador = $operador?.value || "";
  const plataforma = $plataforma?.value || "";
  const tipo = $tipo?.value || "";

  setMsg("Cargando…");

  const [rrss, act] = await Promise.all([
    fetchRRSS({ fecha, operador, plataforma, tipo }),
    fetchActividad({ fecha, operador, plataforma, tipo })
  ]);

  const rows = [...rrss, ...act].sort((a, b) =>
    (b.fecha || "").localeCompare(a.fecha || "")
  );

  if (!rows.length){
    return setMsg("Sin resultados para esos filtros.");
  }

  $tbody.innerHTML = rows.map(rowHTML).join("");
}

async function init(){
  const s = requireSession();
  if (!s) return;

  if (s.rol !== "gerente"){
    alert("Solo gerente puede ingresar a Verificación.");
    location.replace("../dashboard/dashboard.html");
    return;
  }

  await loadSidebar({ activeKey: "verificacion", basePath: "../" });

  $fecha.value = toISODate(new Date());

  await loadOperators();
  enforceTipoEnabled();
  await render();

  $btn.addEventListener("click", render);
  $plataforma.addEventListener("change", () => {
    enforceTipoEnabled();
    render();
  });
}

init();
