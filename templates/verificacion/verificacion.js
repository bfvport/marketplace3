import { requireSession, loadSidebar } from "../../assets/js/app.js";

const sb = window.supabaseClient;

const $fecha = document.getElementById("f-fecha");
const $operador = document.getElementById("f-operador");
const $tipo = document.getElementById("f-tipo");
const $btn = document.getElementById("btn-aplicar");
const $tbody = document.getElementById("veri-tbody");

// Tablas reales (de tu captura)
const TABLE_RRSS = "publicaciones_rrss";
const TABLE_MP   = "marketplace_actividad";

function toISODate(d = new Date()){
  const pad = n => String(n).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function escapeHtml(str){
  return String(str ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

// Busca un campo por “candidatos” (para evitar que explote si el nombre exacto cambia)
function pick(obj, candidates){
  for (const k of candidates){
    if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
  }
  return "";
}

function rowHTML(r){
  const tag = r.fuente === "Marketplace"
    ? `<span class="tag mp">🟠 Marketplace</span>`
    : `<span class="tag">🟢 RRSS</span>`;

  const linkBtn = r.link
    ? `<a class="link-btn" href="${escapeHtml(r.link)}" target="_blank" rel="noopener">Abrir ↗</a>`
    : `<span class="muted">—</span>`;

  return `
    <tr>
      <td class="nowrap">${escapeHtml(r.fecha || "")}</td>
      <td>${escapeHtml(r.usuario || "")}</td>
      <td>${escapeHtml(r.cuenta || "")}</td>
      <td class="nowrap">${escapeHtml(r.tipo || "")}</td>
      <td class="nowrap">${linkBtn}</td>
      <td class="nowrap">${tag}</td>
    </tr>
  `;
}

function setLoading(msg="Cargando…"){
  $tbody.innerHTML = `<tr><td colspan="6" class="muted">${escapeHtml(msg)}</td></tr>`;
}

function setEmpty(msg="Sin resultados."){
  $tbody.innerHTML = `<tr><td colspan="6" class="muted">${escapeHtml(msg)}</td></tr>`;
}

async function loadOperators(){
  // Usamos usuarios (tabla que se ve en tu esquema)
  const { data, error } = await sb
    .from("usuarios")
    .select("usuario,rol")
    .order("usuario", { ascending:true });

  if (error){
    console.error(error);
    return;
  }

  // solo operadores + gerente si querés (yo dejo todos)
  const users = (data || []).map(u => u.usuario).filter(Boolean);

  // limpiar y cargar
  $operador.innerHTML = `<option value="">Todos los operadores</option>` +
    users.map(u => `<option value="${escapeHtml(u)}">${escapeHtml(u)}</option>`).join("");
}

async function fetchRRSS({ fecha, operador, tipo }){
  // RRSS: columnas vistas en tu tabla: usuario, cuenta_fb, tipo, link, fecha
  let q = sb.from(TABLE_RRSS).select("*").order("id", { ascending:false });

  if (fecha) q = q.eq("fecha", fecha);
  if (operador) q = q.eq("usuario", operador);
  if (tipo && tipo !== "marketplace") q = q.eq("tipo", tipo);

  const { data, error } = await q;
  if (error){
    console.error("RRSS error:", error);
    return [];
  }

  return (data || []).map(x => ({
    fuente: "RRSS",
    fecha: pick(x, ["fecha", "created_at"]),
    usuario: pick(x, ["usuario"]),
    cuenta: pick(x, ["cuenta_fb", "cuenta", "cuenta_id"]),
    tipo: pick(x, ["tipo"]),
    link: pick(x, ["link", "url"])
  }));
}

async function fetchMarketplace({ fecha, operador, tipo }){
  if (tipo && tipo !== "marketplace") return []; // si filtran rrss, no trae marketplace

  // Marketplace: tabla marketplace_actividad (tu captura)
  let q = sb.from(TABLE_MP).select("*").order("id", { ascending:false });

  // fecha_publicacion es timestamp (en tu esquema). Si querés filtrar por día:
  // hacemos rango [fecha 00:00, fecha+1 00:00)
  if (fecha){
    const from = `${fecha}T00:00:00`;
    const toDate = new Date(fecha);
    toDate.setDate(toDate.getDate() + 1);
    const to = `${toISODate(toDate)}T00:00:00`;

    q = q.gte("fecha_publicacion", from).lt("fecha_publicacion", to);
  }

  if (operador) q = q.eq("usuario", operador);

  const { data, error } = await q;
  if (error){
    console.error("Marketplace error:", error);
    return [];
  }

  return (data || []).map(x => ({
    fuente: "Marketplace",
    fecha: String(pick(x, ["fecha_publicacion", "created_at"])).slice(0,10), // YYYY-MM-DD
    usuario: pick(x, ["usuario"]),
    cuenta: pick(x, ["facebook_account_usada", "facebook_account_utilizada", "facebook_account", "cuenta_fb", "cuenta"]),
    tipo: "marketplace",
    link: pick(x, ["marketplace_link_publicacion", "marketplace_link", "link"])
  }));
}

async function render(){
  const fecha = $fecha.value || "";
  const operador = $operador.value || "";
  const tipo = $tipo.value || "";

  setLoading("Cargando datos…");

  const [rrss, mp] = await Promise.all([
    fetchRRSS({ fecha, operador, tipo }),
    fetchMarketplace({ fecha, operador, tipo })
  ]);

  // juntar y ordenar por fecha desc (simple)
  const rows = [...rrss, ...mp].sort((a,b) => (b.fecha || "").localeCompare(a.fecha || ""));

  if (!rows.length) return setEmpty("Sin resultados para esos filtros.");

  $tbody.innerHTML = rows.map(rowHTML).join("");
}

async function init(){
  // sesión + rol
  const s = requireSession();
  if (!s) return;

  // Solo gerente
  if (s.rol !== "gerente"){
    alert("Solo gerente puede ingresar a Verificación.");
    location.replace("../dashboard/dashboard.html");
    return;
  }

  // Sidebar (ruta correcta desde /templates/verificacion/)
  await loadSidebar({ activeKey: "verificacion", basePath: "../" });

  // fecha default hoy
  $fecha.value = toISODate(new Date());

  await loadOperators();
  await render();

  $btn.addEventListener("click", render);
}

init();
