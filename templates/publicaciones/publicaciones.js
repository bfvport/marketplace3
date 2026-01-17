import { requireSession, loadSidebar, fmtDateISO } from "../../assets/js/app.js";

const sb = window.supabaseClient;
const s = requireSession();

const DRIVE_URL = "https://drive.google.com/drive/folders/1WEKYsaptpUnGCKOszZOKEAovzL5ld7j7?usp=sharing";
const today = fmtDateISO(new Date());

const TYPES = [
  { key: "historias", title: "Historias" },
  { key: "reels",     title: "Reels" },
  { key: "muro",      title: "Muro" },
  { key: "grupos",    title: "Grupos" },
];

const $ = (id) => document.getElementById(id);

let selectedUsuario = null; // gerente puede cambiar operador
let cuentas = [];           // cuentas del operador elegido
let metas = { historias:0, reels:0, muro:0, grupos:0 };
let linksHoy = [];          // publicaciones_rrss del día (operador elegido)

let rtChannel = null;
let autoTimer = null;

function showError(msg){
  const box = $("errorbox");
  if (!box) return;
  box.style.display = "block";
  box.textContent = msg;
}
function clearError(){
  const box = $("errorbox");
  if (!box) return;
  box.style.display = "none";
  box.textContent = "";
}

function isValidUrl(u){
  try { new URL(u); return true; } catch { return false; }
}

async function init(){
  // Sidebar (NO tocamos app.js)
  await loadSidebar({ activeKey: "publicaciones", basePath: "../" });

  $("pill-hoy").textContent = `Hoy: ${today}`;
  $("pill-rol").textContent = `Rol: ${s.rol || "-"}`;
  $("btn-drive").href = DRIVE_URL;

  // Selección de operador (solo gerente)
  if (s.rol === "gerente"){
    $("wrap-operador").style.display = "block";
    await cargarOperadoresEnSelect();
    selectedUsuario = $("sel-operador").value || null;

    $("sel-operador").addEventListener("change", async () => {
      selectedUsuario = $("sel-operador").value;
      await refreshAll();
      attachRealtime(); // reengancha realtime al cambiar operador
    });
  } else {
    selectedUsuario = s.usuario;
  }

  // Primer render
  await refreshAll();
  attachRealtime();
  startAutoRefresh();

  // Pausa auto-refresh si pestaña no está visible
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopAutoRefresh();
    else startAutoRefresh(true);
  });
}

async function cargarOperadoresEnSelect(){
  // Usamos tabla usuarios (tiene usuario, rol)
  const { data, error } = await sb.from("usuarios").select("usuario, rol").order("usuario", { ascending:true });
  if (error) throw error;

  const ops = (data || []).filter(x => x.rol === "operador");

  const sel = $("sel-operador");
  sel.innerHTML = ops.map(o => `<option value="${o.usuario}">${o.usuario}</option>`).join("");

  // Por defecto: primero
  if (ops.length) sel.value = ops[0].usuario;
}

async function refreshAll(){
  clearError();

  try{
    // 1) cuentas asignadas: cuentas_facebook.ocupada_por = usuario
    const resCuentas = await sb
      .from("cuentas_facebook")
      .select("id, email, ocupada_por")
      .eq("ocupada_por", selectedUsuario)
      .order("id", { ascending:true });

    if (resCuentas.error) throw resCuentas.error;
    cuentas = resCuentas.data || [];

    // 2) metas desde calentamiento_plan (req_*)
    const resPlan = await sb
      .from("calentamiento_plan")
      .select("req_historias, req_reels, req_muro, req_grupos")
      .eq("fecha", today)
      .eq("usuario", selectedUsuario);

    if (resPlan.error) throw resPlan.error;

    // suma por si hay varias filas (por cuenta)
    metas = { historias:0, reels:0, muro:0, grupos:0 };
    for (const p of (resPlan.data || [])){
      metas.historias += Number(p.req_historias || 0);
      metas.reels     += Number(p.req_reels || 0);
      metas.muro      += Number(p.req_muro || 0);
      metas.grupos    += Number(p.req_grupos || 0);
    }

    // 3) links guardados hoy
    const resLinks = await sb
      .from("publicaciones_rrss")
      .select("id, created_at, fecha, usuario, cuenta_id, tipo, link")
      .eq("fecha", today)
      .eq("usuario", selectedUsuario)
      .order("created_at", { ascending:false });

    if (resLinks.error) throw resLinks.error;
    linksHoy = resLinks.data || [];

    // 4) render cards
    renderCards();

  }catch(e){
    console.error(e);
    showError(`Error cargando Recursos: ${e?.message || e}`);
    // aunque falle, rendereá base para no quedar en blanco
    renderCards(true);
  }
}

function renderCards(forceEmpty=false){
  const host = $("cards-recursos");
  if (!host) return;

  const opLabel = (s.rol === "gerente")
    ? `Operador: ${selectedUsuario || "-"} (lectura)`
    : `Operador: ${selectedUsuario || "-"}`;

  host.innerHTML = TYPES.map(t => {
    const meta = metas[t.key] || 0;
    const done = forceEmpty ? 0 : linksHoy.filter(x => x.tipo === t.key).length;
    const pend = Math.max(0, meta - done);

    return `
      <div class="card" id="card-${t.key}">
        <div class="card-top">
          <div>
            <h3>${t.title}</h3>
            <div class="muted">${opLabel}</div>
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end;">
            <span class="badge">Pend. <strong>${pend}</strong></span>
            <span class="badge"><strong>${done}</strong> / ${meta}</span>
          </div>
        </div>

        <div class="row">
          <div class="w-40">
            <select id="sel-${t.key}">
              <option value="">Seleccionar cuenta</option>
              ${
                (cuentas || []).map(c => `<option value="${c.id}">${c.email}</option>`).join("")
              }
            </select>
          </div>
          <div class="w-60">
            <input id="in-${t.key}" placeholder="Pegá el link acá..." />
          </div>
        </div>

        <div class="actions">
          <button class="btn btn-primary" id="btn-${t.key}">Guardar link</button>
        </div>

        <div class="list" id="list-${t.key}">
          ${renderList(t.key, forceEmpty)}
        </div>
      </div>
    `;
  }).join("");

  // listeners
  for (const t of TYPES){
    const btn = $(`btn-${t.key}`);
    if (!btn) continue;
    btn.addEventListener("click", () => guardarLink(t.key));
  }
}

function renderList(tipo, forceEmpty){
  if (forceEmpty) return `<div class="muted">No se pudo cargar (revisá el error arriba).</div>`;

  const rows = linksHoy.filter(x => x.tipo === tipo).slice(0, 8);
  if (!rows.length) return `<div class="muted">Todavía no hay links cargados hoy.</div>`;

  return rows.map(r => `
    <div class="item">
      <div class="muted">${new Date(r.created_at).toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"})}</div>
      <a href="${r.link}" target="_blank" rel="noopener">Ver link</a>
    </div>
  `).join("");
}

async function guardarLink(tipo){
  clearError();

  const sel = $(`sel-${tipo}`);
  const input = $(`in-${tipo}`);

  const cuentaId = Number(sel?.value || 0);
  const link = (input?.value || "").trim();

  if (!cuentaId){
    showError("Seleccioná una cuenta antes de guardar.");
    return;
  }
  if (!link || !isValidUrl(link)){
    showError("Pegá un link válido (tiene que empezar con http/https).");
    return;
  }

  // si es gerente: lectura (no debería guardar)
  if (s.rol === "gerente"){
    showError("Modo gerente es solo lectura. Guardá links desde el operador.");
    return;
  }

  try{
    const { error } = await sb.from("publicaciones_rrss").insert([{
      fecha: today,
      usuario: selectedUsuario,
      cuenta_id: cuentaId,
      tipo,
      link,
      estado: "ok"
    }]);

    if (error) throw error;

    input.value = "";
    await refreshAll();

  }catch(e){
    console.error(e);
    showError(`No se pudo guardar: ${e?.message || e}`);
  }
}

function attachRealtime(){
  // limpia canal anterior
  if (rtChannel){
    try { sb.removeChannel(rtChannel); } catch {}
    rtChannel = null;
  }

  // realtime: cuando alguien inserta/borrar/actualiza un link -> refresca
  rtChannel = sb.channel("rt-publicaciones-rrss")
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "publicaciones_rrss"
    }, (payload) => {
      // si es otro usuario, igual refrescamos (gerente ve al toque)
      // pero evitamos pegar 50 refresh si hay mucho tráfico:
      debounceRefresh();
    })
    .subscribe();
}

let debTimer = null;
function debounceRefresh(){
  if (debTimer) clearTimeout(debTimer);
  debTimer = setTimeout(() => refreshAll(), 400);
}

function startAutoRefresh(force=false){
  if (autoTimer && !force) return;
  stopAutoRefresh();
  autoTimer = setInterval(() => refreshAll(), 5000);
}
function stopAutoRefresh(){
  if (autoTimer) clearInterval(autoTimer);
  autoTimer = null;
}

init();
