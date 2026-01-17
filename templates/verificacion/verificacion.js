import { requireSession, loadSidebar } from "../../assets/js/app.js";

const sb = window.supabaseClient;

// tablas (según tu esquema)
const TABLE_RRSS = "publicaciones_rrss";
const TABLE_MP   = "marketplace_actividad";

const $fecha   = document.getElementById("f-fecha");
const $operador= document.getElementById("f-operador");
const $tipo    = document.getElementById("f-tipo");
const $btn     = document.getElementById("btn-aplicar");
const $tbody   = document.getElementById("results-body");

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
  $tbody.innerHTML = `<tr><td colspan="6" class="muted">${esc(msg)}</td></tr>`;
}

function rowHTML(r){
  const link = r.link
    ? `<a href="${esc(r.link)}" target="_blank" rel="noopener">Abrir</a>`
    : `<span class="muted">-</span>`;

  return `
    <tr>
      <td>${esc(r.fecha || "-")}</td>
      <td>${esc(r.usuario || "-")}</td>
      <td>${esc(r.cuenta || "-")}</td>
      <td>${esc(r.tipo || "-")}</td>
      <td>${link}</td>
      <td>${esc(r.fuente || "-")}</td>
    </tr>
  `;
}

async function loadOperators(){
  // operadores desde tabla usuarios
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

  $operador.innerHTML = `<option value="">Todos los operadores</option>` +
    ops.map(u => `<option value="${esc(u.usuario)}">${esc(u.usuario)}</option>`).join("");

  $operador.value = current || "";
}

async function fetchRRSS({ fecha, operador, tipo }){
  if (tipo && tipo !== "rrss") return [];

  // columnas según tu tabla publicaciones_rrss:
  // usuario, cuenta_fb, tipo, link, fecha
  let q = sb
    .from(TABLE_RRSS)
    .select("usuario, cuenta_fb, tipo, link, fecha")
    .order("fecha", { ascending: false })
    .limit(400);

  if (fecha) q = q.eq("fecha", fecha);
  if (operador) q = q.eq("usuario", operador);

  const { data, error } = await q;
  if (error){
    console.error("RRSS error:", error);
    return [];
  }

  return (data || []).map(x => ({
    fuente: "RRSS",
    fecha: (x.fecha || "").slice(0,10),
    usuario: x.usuario,
    cuenta: x.cuenta_fb,
    tipo: (x.tipo || "rrss").toString(),
    link: x.link
  }));
}

async function fetchMarketplace({ fecha, operador, tipo }){
  if (tipo && tipo !== "marketplace") return [];

  // columnas según tu tabla marketplace_actividad:
  // usuario, facebook_account_usada, fecha_publicacion, marketplace_link_publicacion
  let q = sb
    .from(TABLE_MP)
    .select("usuario, facebook_account_usada, fecha_publicacion, marketplace_link_publicacion, created_at")
    .order("fecha_publicacion", { ascending: false })
    .limit(400);

  if (operador) q = q.eq("usuario", operador);

  // fecha_publicacion puede ser timestamp; filtramos por rango del día
  if (fecha){
    const start = `${fecha}T00:00:00`;
    const end   = `${fecha}T23:59:59`;
    q = q.gte("fecha_publicacion", start).lte("fecha_publicacion", end);
  }

  const { data, error } = await q;
  if (error){
    console.error("Marketplace error:", error);
    return [];
  }

  return (data || []).map(x => ({
    fuente: "Marketplace",
    fecha: String((x.fecha_publicacion || x.created_at || "")).slice(0,10),
    usuario: x.usuario,
    cuenta: x.facebook_account_usada,
    tipo: "marketplace",
    link: x.marketplace_link_publicacion
  }));
}

async function render(){
  const fecha = $fecha?.value || "";
  const operador = $operador?.value || "";
  const tipo = $tipo?.value || "";

  setMsg("Cargando…");

  const [rrss, mp] = await Promise.all([
    fetchRRSS({ fecha, operador, tipo }),
    fetchMarketplace({ fecha, operador, tipo })
  ]);

  const rows = [...rrss, ...mp]
    .sort((a,b) => (b.fecha || "").localeCompare(a.fecha || ""));

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
  await render();

  $btn.addEventListener("click", render);
}

init();
