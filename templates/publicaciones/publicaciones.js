import { requireSession, loadSidebar, fmtDateISO, escapeHtml, getSession } from "../../assets/js/app.js";

const sb = window.supabaseClient;
const s = requireSession();
if (!s) throw new Error("Sin sesión");

const today = fmtDateISO(new Date());
const $ = (id) => document.getElementById(id);

// ✅ Tu app.js espera loadSidebar({ activeKey, basePath })
await loadSidebar({ activeKey: "publicaciones", basePath: "../" });

$("pill-rol").textContent = `Rol: ${s?.rol || "-"}`;
$("pill-hoy").textContent = `Hoy: ${today}`;

// Drive en otra pestaña
const DRIVE_LINK = "https://drive.google.com/drive/folders/1WEKYsaptpUnGCKOszZOKEAovzL5ld7j7?usp=sharing";
$("btn-drive").href = DRIVE_LINK;

// Auto refresh (gerente ve cambios sin F5)
const AUTO_MS = 5000;
let timer = null;

const TIPOS = [
  { key: "historias", titulo: "Historias", colReq: "req_historias" },
  { key: "reels",     titulo: "Reels",     colReq: "req_reels" },
  { key: "muro",      titulo: "Muro",      colReq: "req_muro" },
  { key: "grupos",    titulo: "Grupos",    colReq: "req_grupos" },
];

const IS_GERENTE = s.rol === "gerente";
let usuarioObjetivo = s.usuario;

init();

async function init(){
  if (IS_GERENTE){
    $("ver-operador-wrap").style.display = "inline-flex";
    await cargarOperadores();
    $("sel-operador").addEventListener("change", async () => {
      usuarioObjetivo = $("sel-operador").value;
      await renderAll();
    });
  }

  await renderAll();

  timer = setInterval(renderAll, AUTO_MS);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden){
      if (timer) clearInterval(timer);
      timer = null;
    } else {
      if (!timer) timer = setInterval(renderAll, AUTO_MS);
      renderAll();
    }
  });
}

async function cargarOperadores(){
  const { data, error } = await sb
    .from("usuarios")
    .select("usuario, rol")
    .order("usuario", { ascending: true });

  if (error) throw error;

  const ops = (data || []).filter(x => x.rol === "operador").map(x => x.usuario);
  $("sel-operador").innerHTML = ops.map(u => `<option value="${escapeHtml(u)}">${escapeHtml(u)}</option>`).join("");

  if (!ops.includes(usuarioObjetivo)) usuarioObjetivo = ops[0] || usuarioObjetivo;
  $("sel-operador").value = usuarioObjetivo;
}

async function renderAll(){
  const cont = $("cards-recursos");
  cont.innerHTML = "";

  const [cuentas, planHoy, linksHoy] = await Promise.all([
    cargarCuentas(usuarioObjetivo),
    cargarPlanHoy(usuarioObjetivo),
    cargarLinksHoy(usuarioObjetivo),
  ]);

  for (const t of TIPOS){
    const meta = sumCol(planHoy, t.colReq); // meta del calentamiento
    const cargados = (linksHoy[t.key] || []).length; // evidencia (links)
    const pendientes = Math.max(0, meta - cargados);

    cont.innerHTML += cardHTML(t, usuarioObjetivo, cuentas, meta, cargados, pendientes);
    renderLinksList(t.key, linksHoy[t.key] || []);

    if (!IS_GERENTE){
      const btn = document.getElementById(`btn-save-${t.key}`);
      if (btn) btn.onclick = () => guardarLink(t.key);
    }
  }
}

function cardHTML(t, usuario, cuentas, meta, cargados, pendientes){
  const badgePend = pendientes === 0
    ? `<span class="badge badge-ok">OK</span>`
    : `<span class="badge badge-warn">Pend. ${pendientes}</span>`;

  const badgeCont = `<span class="badge">${cargados}/${meta}</span>`;

  const disabled = IS_GERENTE ? "disabled" : "";

  const cuentasOptions = cuentas.length
    ? cuentas.map(c => `<option value="${escapeHtml(c.email)}">${escapeHtml(c.email)}</option>`).join("")
    : `<option value="">(Sin cuentas asignadas)</option>`;

  return `
    <div class="card" id="card-${t.key}">
      <div class="card-head">
        <div>
          <h3 class="card-title">${t.titulo}</h3>
          <div class="card-muted">Operador: <b>${escapeHtml(usuario)}</b>${IS_GERENTE ? " (lectura)" : ""}</div>
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          ${badgePend}
          ${badgeCont}
        </div>
      </div>

      <div class="row">
        <select id="sel-${t.key}" ${disabled}>
          <option value="">Seleccionar cuenta</option>
          ${cuentasOptions}
        </select>
        <input id="inp-${t.key}" type="url" placeholder="Pegá el link acá..." ${disabled} />
      </div>

      <button class="btn-save" id="btn-save-${t.key}" ${disabled}>
        Guardar link
      </button>

      <div class="links" id="links-${t.key}">
        <div class="muted">Cargando...</div>
      </div>
    </div>
  `;
}

function renderLinksList(tipoKey, items){
  const box = document.getElementById(`links-${tipoKey}`);
  if (!box) return;

  if (!items.length){
    box.innerHTML = `<div class="muted">Todavía no hay links cargados hoy.</div>`;
    return;
  }

  box.innerHTML = items.map(x => `
    <div class="link-item">
      <span title="${escapeHtml(x.cuenta_fb)}">${escapeHtml(x.cuenta_fb)}</span>
      <a href="${escapeHtml(x.link)}" target="_blank" rel="noopener noreferrer">Ver</a>
    </div>
  `).join("");
}

async function cargarCuentas(usuario){
  const { data, error } = await sb
    .from("cuentas_facebook")
    .select("email")
    .eq("ocupada_por", usuario);

  if (error) throw error;
  return data || [];
}

async function cargarPlanHoy(usuario){
  const { data, error } = await sb
    .from("calentamiento_plan")
    .select("req_historias, req_reels, req_muro, req_grupos")
    .eq("usuario", usuario)
    .eq("fecha", today);

  if (error) throw error;
  return data || [];
}

async function cargarLinksHoy(usuario){
  const out = { historias:[], reels:[], muro:[], grupos:[] };

  const { data, error } = await sb
    .from("publicaciones_rrss")
    .select("tipo, cuenta_fb, link, created_at")
    .eq("usuario", usuario)
    .eq("fecha", today)
    .order("created_at", { ascending:false });

  if (error){
    console.error("Falta tabla publicaciones_rrss o error:", error);
    return out;
  }

  for (const r of (data || [])){
    const k = String(r.tipo || "").toLowerCase();
    if (out[k]) out[k].push(r);
  }
  return out;
}

function sumCol(rows, col){
  return (rows || []).reduce((acc, r) => acc + Number(r?.[col] || 0), 0);
}

async function guardarLink(tipoKey){
  const sel = document.getElementById(`sel-${tipoKey}`);
  const inp = document.getElementById(`inp-${tipoKey}`);
  const cuenta = sel?.value || "";
  const link = (inp?.value || "").trim();

  if (!cuenta) return alert("Seleccioná una cuenta");
  if (!link.startsWith("http")) return alert("Pegá un link válido (http/https)");

  const { error } = await sb.from("publicaciones_rrss").insert([{
    usuario: usuarioObjetivo,
    cuenta_fb: cuenta,
    tipo: tipoKey,
    link,
    fecha: today
  }]);

  if (error){
    console.error(error);
    alert("No se pudo guardar. Mirá consola.");
    return;
  }

  inp.value = "";
  await renderAll();
}
