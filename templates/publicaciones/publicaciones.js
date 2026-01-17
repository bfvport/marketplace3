import { requireSession, loadSidebar, fmtDateISO } from "../../assets/js/app.js";

const sb = window.supabaseClient;
const s = requireSession();
const today = fmtDateISO(new Date());

await loadSidebar(s, "publicaciones");

// 🔒 Solo operadores
if (!s || s.rol !== "operador") {
  document.body.innerHTML = "<h1 style='padding:30px'>Acceso denegado</h1>";
  throw new Error("Acceso denegado");
}

// 🔗 Drive central
const DRIVE_LINK = "https://drive.google.com/drive/folders/1WEKYsaptpUnGCKOszZOKEAovzL5ld7j7?usp=sharing";

// Tipos de recursos
const TIPOS = [
  { id: "historia", nombre: "Historias" },
  { id: "reel", nombre: "Reels" },
  { id: "muro", nombre: "Muro" },
  { id: "grupo", nombre: "Grupos" }
];

const cont = document.getElementById("cards-recursos");

init();

/* =========================
   INIT
========================= */
async function init() {
  const cuentas = await cargarCuentas();
  const plan = await cargarPlanHoy();
  renderCards(cuentas, plan);
}

/* =========================
   DATA BASE
========================= */
async function cargarCuentas() {
  const { data, error } = await sb
    .from("cuentas_facebook")
    .select("email")
    .eq("ocupada_por", s.usuario);

  if (error) throw error;
  return data || [];
}

async function cargarPlanHoy() {
  const { data, error } = await sb
    .from("calentamiento_plan")
    .select("*")
    .eq("usuario", s.usuario)
    .eq("fecha", today);

  if (error) throw error;
  return data || [];
}

/* =========================
   RENDER
========================= */
function renderCards(cuentas, planes) {
  cont.innerHTML = "";

  TIPOS.forEach(t => {
    const meta = calcularMeta(t.id, planes);

    cont.innerHTML += `
      <div class="recurso-card">
        <h3>${t.nombre}</h3>
        <p class="muted">Objetivo diario: <b>${meta}</b></p>

        <a href="${DRIVE_LINK}" target="_blank" class="btn-drive">
          Abrir Drive
        </a>

        <select id="cuenta-${t.id}">
          <option value="">Seleccionar cuenta</option>
          ${cuentas.map(c => `<option value="${c.email}">${c.email}</option>`).join("")}
        </select>

        <input id="link-${t.id}" type="url" placeholder="Pegá el link acá...">

        <button onclick="guardarLink('${t.id}')">Guardar link</button>

        <div id="lista-${t.id}" class="lista-links">
          <p class="muted">Cargando...</p>
        </div>
      </div>
    `;

    cargarLinks(t.id);
  });
}

/* =========================
   METAS DESDE CALENTAMIENTO
========================= */
function calcularMeta(tipo, planes) {
  let total = 0;

  planes.forEach(p => {
    if (tipo === "historia") total += p.req_historias || 0;
    if (tipo === "reel") total += p.req_reels || 0;
    if (tipo === "muro") total += p.req_muro || 0;
    if (tipo === "grupo") total += p.req_grupos || 0;
  });

  return total;
}

/* =========================
   GUARDAR LINK
========================= */
window.guardarLink = async function(tipo) {
  const cuenta = document.getElementById(`cuenta-${tipo}`).value;
  const link = document.getElementById(`link-${tipo}`).value.trim();

  if (!cuenta) return alert("Seleccioná una cuenta");
  if (!link.startsWith("http")) return alert("Pegá un link válido");

  const { error } = await sb.from("publicaciones_rrss").insert({
    usuario: s.usuario,
    cuenta_fb: cuenta,
    tipo,
    link,
    fecha: today
  });

  if (error) {
    console.error(error);
    alert("Error guardando link");
    return;
  }

  document.getElementById(`link-${tipo}`).value = "";
  cargarLinks(tipo);
};

/* =========================
   CARGAR LINKS DEL DÍA
========================= */
async function cargarLinks(tipo) {
  const box = document.getElementById(`lista-${tipo}`);

  const { data, error } = await sb
    .from("publicaciones_rrss")
    .select("*")
    .eq("usuario", s.usuario)
    .eq("tipo", tipo)
    .eq("fecha", today)
    .order("created_at", { ascending: false });

  if (error) {
    box.innerHTML = "<p>Error cargando links</p>";
    return;
  }

  if (!data.length) {
    box.innerHTML = "<p class='muted'>Todavía no cargaste links.</p>";
    return;
  }

  box.innerHTML = data.map(l => `
    <div class="link-item">
      <span>${l.cuenta_fb}</span>
      <a href="${l.link}" target="_blank">Ver</a>
    </div>
  `).join("");
}
