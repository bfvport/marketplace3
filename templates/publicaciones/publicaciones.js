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

let selectedUsuario = null;
let cuentas = [];
let metas = { historias:0, reels:0, muro:0, grupos:0 };
let linksHoy = [];
let rtChannel = null;

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
  await loadSidebar({ activeKey: "publicaciones", basePath: "../" });

  $("pill-hoy").textContent = `Hoy: ${today}`;
  $("pill-rol").textContent = `Rol: ${s.rol || "-"}`;
  $("btn-drive").href = DRIVE_URL;

  if (s.rol === "gerente"){
    $("wrap-operador").style.display = "block";
    await cargarOperadoresEnSelect();
    selectedUsuario = $("sel-operador").value || null;

    $("sel-operador").addEventListener("change", async () => {
      selectedUsuario = $("sel-operador").value;
      await refreshAll(true);
      attachRealtime();
    });
  } else {
    selectedUsuario = s.usuario;
  }

  $("btn-refresh").addEventListener("click", async () => {
    await refreshAll(false);
    refreshAllViews();
  });

  await refreshAll(true);
  attachRealtime();
}

async function cargarOperadoresEnSelect(){
  const { data, error } = await sb.from("usuarios").select("usuario, rol").order("usuario", { ascending:true });
  if (error) throw error;

  const ops = (data || []).filter(x => x.rol === "operador");
  const sel = $("sel-operador");
  sel.innerHTML = ops.map(o => `<option value="${o.usuario}">${o.usuario}</option>`).join("");
  if (ops.length) sel.value = ops[0].usuario;
}

async function refreshAll(rerender){
  clearError();

  try{
    const resCuentas = await sb
      .from("cuentas_facebook")
      .select("id, email, ocupada_por")
      .eq("ocupada_por", selectedUsuario)
      .order("id", { ascending:true });

    if (resCuentas.error) throw resCuentas.error;
    cuentas = resCuentas.data || [];

    const resPlan = await sb
      .from("calentamiento_plan")
      .select("req_historias, req_reels, req_muro, req_grupos")
      .eq("fecha", today)
      .eq("usuario", selectedUsuario);

    if (resPlan.error) throw resPlan.error;

    metas = { historias:0, reels:0, muro:0, grupos:0 };
    for (const p of (resPlan.data || [])){
      metas.historias += Number(p.req_historias || 0);
      metas.reels     += Number(p.req_reels || 0);
      metas.muro      += Number(p.req_muro || 0);
      metas.grupos    += Number(p.req_grupos || 0);
    }

    const resLinks = await sb
      .from("publicaciones_rrss")
      .select("id, created_at, fecha, usuario, cuenta_id, tipo, link")
      .eq("fecha", today)
      .eq("usuario", selectedUsuario)
      .order("created_at", { ascending:false });

    if (resLinks.error) throw resLinks.error;
    linksHoy = resLinks.data || [];

    if (rerender) renderCards();
    refreshAllViews();

  }catch(e){
    console.error(e);
    showError(`Error cargando Recursos: ${e?.message || e}`);
    if (rerender) renderCards(true);
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
            <span class="badge">Pend. <strong id="pend-${t.key}">${pend}</strong></span>
            <span class="badge"><strong id="done-${t.key}">${done}</strong> / <span id="meta-${t.key}">${meta}</span></span>
          </div>
        </div>

        <div class="row">
          <div class="w-40">
            <select id="sel-${t.key}">
              <option value="">Seleccionar cuenta</option>
              ${(cuentas || []).map(c => `<option value="${c.id}">${c.email}</option>`).join("")}
            </select>
          </div>
          <div class="w-60">
            <input id="in-${t.key}" placeholder="Pegá el link acá..." />
          </div>
        </div>

        <div class="actions">
          <button class="btn btn-primary" id="btn-${t.key}">Guardar link</button>
        </div>

        <div class="list" id="list-${t.key}"></div>
      </div>
    `;
  }).join("");

  for (const t of TYPES){
    $(`btn-${t.key}`)?.addEventListener("click", () => guardarLink(t.key));
  }
}

function refreshAllViews(){
  for (const t of TYPES){
    updateTipoUI(t.key);
    updateTipoTable(t.key);
  }
}

function updateTipoUI(tipo){
  const meta = metas[tipo] || 0;
  const done = linksHoy.filter(x => x.tipo === tipo).length;
  const pend = Math.max(0, meta - done);

  $(`done-${tipo}`) && ($(`done-${tipo}`).textContent = done);
  $(`meta-${tipo}`) && ($(`meta-${tipo}`).textContent = meta);
  $(`pend-${tipo}`) && ($(`pend-${tipo}`).textContent = pend);

  const list = $(`list-${tipo}`);
  if (!list) return;

  const rows = linksHoy.filter(x => x.tipo === tipo).slice(0, 8);
  if (!rows.length){
    list.innerHTML = `<div class="muted">Todavía no hay links cargados hoy.</div>`;
    return;
  }

  list.innerHTML = rows.map(r => {
    const hhmm = new Date(r.created_at).toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"});
    return `
      <div class="item">
        <div class="muted">${hhmm}</div>
        <a href="${r.link}" target="_blank" rel="noopener">Ver link</a>
      </div>
    `;
  }).join("");
}

function cuentaLabel(cuentaId){
  const c = (cuentas || []).find(x => String(x.id) === String(cuentaId));
  return c?.email || `#${cuentaId}`;
}

function updateTipoTable(tipo){
  const body = $(`tbl-${tipo}`);
  if (!body) return;

  const rows = linksHoy.filter(x => x.tipo === tipo).slice(0, 60);
  if (!rows.length){
    body.innerHTML = `<tr><td colspan="3" class="muted">Sin links hoy.</td></tr>`;
    return;
  }

  body.innerHTML = rows.map(r => {
    const hhmm = new Date(r.created_at).toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"});
    return `
      <tr>
        <td>${hhmm}</td>
        <td class="cap">${cuentaLabel(r.cuenta_id)}</td>
        <td><a class="btn-open" href="${r.link}" target="_blank" rel="noopener">Abrir</a></td>
      </tr>
    `;
  }).join("");
}

async function guardarLink(tipo){
  clearError();

  const cuentaId = Number($(`sel-${tipo}`)?.value || 0);
  const input = $(`in-${tipo}`);
  const link = (input?.value || "").trim();

  if (!cuentaId) return showError("Seleccioná una cuenta antes de guardar.");
  if (!link || !isValidUrl(link)) return showError("Pegá un link válido (http/https).");
  if (s.rol === "gerente") return showError("Modo gerente es solo lectura.");

  const { data, error } = await sb
    .from("publicaciones_rrss")
    .insert([{ fecha: today, usuario: selectedUsuario, cuenta_id: cuentaId, tipo, link, estado: "ok" }])
    .select("id, created_at, fecha, usuario, cuenta_id, tipo, link")
    .single();

  if (error) return showError(`No se pudo guardar: ${error.message}`);

  input.value = "";
  if (!linksHoy.some(x => x.id === data.id)) linksHoy.unshift(data);
  updateTipoUI(tipo);
  updateTipoTable(tipo);
}

function attachRealtime(){
  if (rtChannel){
    try { sb.removeChannel(rtChannel); } catch {}
    rtChannel = null;
  }

  rtChannel = sb.channel("rt-publicaciones-rrss")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "publicaciones_rrss" }, (payload) => {
      const n = payload.new;
      if (n?.fecha !== today) return;
      if (n?.usuario !== selectedUsuario) return;
      if (linksHoy.some(x => x.id === n.id)) return;

      linksHoy.unshift(n);
      updateTipoUI(n.tipo);
      updateTipoTable(n.tipo);
    })
    .subscribe();
}

init();
