import { requireSession, loadSidebar } from "../../assets/js/app.js";

const sb = window.supabaseClient;

// Tablas reales según tu DB
const TABLE_RRSS = "publicaciones_rrss";
const TABLE_MP   = "marketplace_actividad";

const $fecha    = document.getElementById("f-fecha");
const $operador = document.getElementById("f-operador");
const $tipo     = document.getElementById("f-tipo");
const $btn      = document.getElementById("btn-aplicar");

// ✅ FIX: este ES el tbody del HTML
const $tbody    = document.getElementById("veri-tbody");

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
  $tbody.innerHTML = `<tr><td colspan="6">${esc(msg)}</td></tr>`;
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
      <td>${esc(r.tipo || "-")}</td>
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

async function fetchRRSS({ fecha, operador, tipo }){
  // Si el filtro está en marketplace, no traemos RRSS
  if (tipo === "marketplace") return [];

  let q = sb
    .from(TABLE_RRSS)
    .select("usuario, cuenta_fb, tipo, link, fecha")
    .order("fecha", { ascending: false })
    .limit(400);

  if (fecha) q = q.eq("fecha", fecha);
  if (operador) q = q.eq("usuario", operador);

  // Si eligió historias/muro/reels/grupos, filtramos por tipo
  if (tipo && tipo !== "marketplace") q = q.eq("tipo", tipo);

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
    tipo: (x.tipo || "").toString(),
    link: x.link
  }));
}

async function fetchMarketplace({ fecha, operador, tipo }){
  // Si eligió un tipo distinto a marketplace, no traemos marketplace
  if (tipo && tipo !== "marketplace") return [];

  let q = sb
    .from(TABLE_MP)
    .select("usuario, facebook_account_usada, fecha_publicacion, marketplace_link_publicacion, created_at")
    .order("fecha_publicacion", { ascending: false })
    .limit(400);

  if (operador) q = q.eq("usuario", operador);

  // Filtrado por día (fecha_publicacion es timestamp)
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

  const rows = [...rrss, ...mp].sort((a, b) =>
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
  await render();

  $btn.addEventListener("click", render);
}

init();
