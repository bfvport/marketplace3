import {
  requireSession, loadSidebar, fmtDateISO, nowISO,
  escapeHtml, takeFacebookAccountFor
} from "../../assets/js/app.js";

const s = requireSession();
await loadSidebar({ activeKey: "diario", basePath: "../" });

const sb = window.supabaseClient;
const $ = (id) => document.getElementById(id);

const today = fmtDateISO(new Date());
$("subtitle").textContent = `Hoy: ${today} | Usuario: ${s.usuario} | Rol: ${s.rol}`;

function log(line){
  const el = $("log");
  const ts = new Date().toLocaleTimeString();
  el.textContent += `[${ts}] ${line}\n`;
  el.scrollTop = el.scrollHeight;
}
function setAccStatus(text){ $("accStatus").textContent = "Cuenta: " + (text || "-"); }

async function loadCategorias(){
  const { data, error } = await sb
    .from("categoria")
    .select("id,nombre,mensaje,csv_nombre")
    .order("nombre", { ascending:true });

  if (error) return log("❌ categorias: " + error.message);

  const sel = $("categoriaSelect");
  sel.innerHTML = "";

  for (const c of (data || [])){
    const opt = document.createElement("option");
    opt.value = c.nombre;          // simple: guardo nombre (tu esquema)
    opt.textContent = c.nombre;
    opt.dataset.mensaje = c.mensaje || "";
    sel.appendChild(opt);
  }

  if (sel.options.length){
    const msg = sel.options[sel.selectedIndex].dataset.mensaje || "";
    if (!$("descripcion").value.trim() && msg) $("descripcion").value = msg;
  }
}

$("categoriaSelect").addEventListener("change", () => {
  const sel = $("categoriaSelect");
  const msg = sel.options[sel.selectedIndex]?.dataset?.mensaje || "";
  if (msg && !$("descripcion").value.trim()) $("descripcion").value = msg;
});

async function loadAsignacionDeHoy(){
  $("asigHint").textContent = "Buscando asignación...";
  $("asigBox").innerHTML = "";

  const { data, error } = await sb
    .from("usuarios_asignado")
    .select("id,usuario,fecha_desde,fecha_hasta,categoria,marketplace_daily,historia_daily,muro_daily,grupos_daily,asignado_por,created_at,updated_at")
    .eq("usuario", s.usuario);

  if (error){
    $("asigHint").textContent = "Error cargando asignación.";
    return log("❌ asignaciones: " + error.message);
  }

  const inRange = (data || []).filter(a => a.fecha_desde <= today && today <= a.fecha_hasta);

  if (!inRange.length){
    $("asigHint").textContent = "No tenés asignación para hoy.";
    $("asigBox").innerHTML = `<div class="muted">Pedile al gerente que te asigne una categoría.</div>`;
    return;
  }

  $("asigHint").textContent = `Asignaciones activas hoy: ${inRange.length}`;

  const wrap = document.createElement("div");
  for (const a of inRange){
    const div = document.createElement("div");
    div.style.marginTop = "10px";
    div.innerHTML = `
      <div class="pill">Categoría: <strong>${escapeHtml(a.categoria)}</strong></div>
      <div class="muted" style="margin-top:8px;">
        Rango: ${escapeHtml(a.fecha_desde)} → ${escapeHtml(a.fecha_hasta)}<br>
        Objetivos: marketplace=${escapeHtml(a.marketplace_daily)} | historia=${escapeHtml(a.historia_daily)} | muro=${escapeHtml(a.muro_daily)} | grupos=${escapeHtml(a.grupos_daily)}
      </div>
    `;
    wrap.appendChild(div);
  }
  $("asigBox").appendChild(wrap);
}

async function ensureCuentaActual(){
  const { data, error } = await sb
    .from("cuentas_facebook")
    .select("id,email,nombre,estado,ocupada_por")
    .eq("ocupada_por", s.usuario)
    .eq("estado", "ocupada")
    .order("id", { ascending:true })
    .limit(1);

  if (error) return log("❌ cuenta actual: " + error.message);

  if (data && data.length){
    const acc = data[0];
    setAccStatus(acc.email || acc.nombre || ("id=" + acc.id));
  } else {
    setAccStatus("-");
  }
}

async function takeCuenta(){
  log("Tomando cuenta...");
  const r = await takeFacebookAccountFor(s.usuario);
  if (!r.ok) return log("⚠️ " + r.reason);

  const acc = r.account;
  const label = acc.email || acc.nombre || ("id=" + acc.id);
  setAccStatus(label);
  log("✅ Cuenta tomada: " + label);

  // Registrar actividad de logueo (si querés)
  const { error } = await sb.from("usuarios_actividad").insert([{
    usuario: s.usuario,
    fecha_logueo: nowISO(),
    facebook_account_usada: label,
    created_at: nowISO()
  }]);
  if (error) log("⚠️ usuarios_actividad insert: " + error.message);
}

async function saveActividad(){
  const categoria = $("categoriaSelect").value;
  const titulo = $("titulo").value.trim();
  const descripcion = $("descripcion").value.trim();
  const etiquetas = $("etiquetas").value.trim();
  const link = $("link").value.trim();

  if (!categoria) return log("⚠️ Falta categoría.");
  if (!titulo) return log("⚠️ Falta título.");

  // cuenta ocupada actual (si existe)
  let facebookUsed = "-";
  const { data: acc, error: eAcc } = await sb
    .from("cuentas_facebook")
    .select("email,nombre,id")
    .eq("ocupada_por", s.usuario)
    .eq("estado", "ocupada")
    .limit(1);

  if (!eAcc && acc && acc.length){
    facebookUsed = acc[0].email || acc[0].nombre || String(acc[0].id);
  }

  const payload = {
    usuario: s.usuario,
    facebook_account_usada: facebookUsed,
    fecha_publicacion: today,
    marketplace_link_publicacion: link || null,
    titulo,
    descripcion: descripcion || null,
    categoria,
    etiquetas_usadas: etiquetas || null,
    created_at: nowISO()
  };

  log("Insert marketplace_actividad...");
  const { error } = await sb.from("marketplace_actividad").insert([payload]);

  if (error) return log("❌ insert: " + error.message);

  log("✅ Actividad guardada.");
}

function clearForm(){
  $("titulo").value = "";
  $("etiquetas").value = "";
  $("link").value = "";
  log("🧼 Form limpio (parcial).");
}

$("btnTakeAcc").addEventListener("click", () => takeCuenta().catch(e => log("❌ " + e.message)));
$("btnSave").addEventListener("click", () => saveActividad().catch(e => log("❌ " + e.message)));
$("btnClear").addEventListener("click", clearForm);

// init
(async function init(){
  log("Init diario...");
  await loadCategorias();
  await loadAsignacionDeHoy();
  await ensureCuentaActual();
  log("Listo.");
})();
