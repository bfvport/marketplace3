import { requireSession, loadSidebar } from "../../assets/js/app.js";

const sb = window.supabaseClient;

const $pantalla = document.getElementById("pantalla");
const $prioridad = document.getElementById("prioridad");
const $queHaciendo = document.getElementById("queHaciendo");
const $quePaso = document.getElementById("quePaso");
const $pasos = document.getElementById("pasos");
const $captura = document.getElementById("captura");
const $btnEnviar = document.getElementById("btnEnviar");
const $btnLimpiar = document.getElementById("btnLimpiar");
const $msg = document.getElementById("msg");

const $previewBox = document.getElementById("previewBox");
const $previewImg = document.getElementById("previewImg");
const $previewName = document.getElementById("previewName");

function setMsg(t){ $msg.textContent = t || ""; }

function resetForm(){
  $pantalla.value = "diario";
  $prioridad.value = "media";
  $queHaciendo.value = "";
  $quePaso.value = "";
  $pasos.value = "";
  $captura.value = "";
  $previewBox.style.display = "none";
  setMsg("");
}

function safeName(name){
  return (name || "captura").replace(/[^a-zA-Z0-9._-]/g, "_");
}

$captura.addEventListener("change", () => {
  const f = $captura.files?.[0];
  if (!f) { $previewBox.style.display = "none"; return; }
  $previewImg.src = URL.createObjectURL(f);
  $previewName.textContent = f.name;
  $previewBox.style.display = "flex";
});

async function subirCaptura(file, operador){
  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const path = `${operador}/${Date.now()}_${safeName(file.name)}.${ext}`;

  const { error } = await sb.storage
    .from("errores")
    .upload(path, file, { upsert: false, contentType: file.type });

  if (error) throw error;
  return path;
}

async function enviarReporte(session){
  const operador = session.usuario;
  const file = $captura.files?.[0];

  if (!file) return setMsg("Subí una captura.");
  if (!$queHaciendo.value.trim()) return setMsg("Completá: ¿Qué estabas haciendo?");
  if (!$quePaso.value.trim()) return setMsg("Completá: ¿Qué pasó?");

  setMsg("Enviando…");
  $btnEnviar.disabled = true;

  try {
    const imagen_path = await subirCaptura(file, operador);

    const payload = {
      operador,
      pantalla: $pantalla.value,
      prioridad: $prioridad.value,
      que_estabas_haciendo: $queHaciendo.value.trim(),
      que_paso: $quePaso.value.trim(),
      pasos_para_reproducir: $pasos.value.trim() || null,
      imagen_path,
      estado: "abierto"
    };

    const { error } = await sb.from("reportes_errores").insert(payload);
    if (error) throw error;

    setMsg("✅ Reporte enviado. Gracias.");
    resetForm();
  } catch (e) {
    console.error(e);
    setMsg("❌ No se pudo enviar. Revisá internet o avisá al gerente.");
  } finally {
    $btnEnviar.disabled = false;
  }
}

async function init(){
  const s = requireSession();
  if (!s) return;

  // ✅ SOLO OPERADOR
  if (s.rol !== "operador"){
    alert("Solo operadores pueden reportar errores.");
    location.replace("../dashboard/dashboard.html");
    return;
  }

  await loadSidebar({ activeKey: "reporte_error", basePath: "../" });

  $btnEnviar.addEventListener("click", () => enviarReporte(s));
  $btnLimpiar.addEventListener("click", resetForm);

  resetForm();
}
init();
