import { requireSession, loadSidebar } from "../../assets/js/app.js";

const sb = window.supabaseClient;

const $estado = document.getElementById("f-estado");
const $prioridad = document.getElementById("f-prioridad");
const $operador = document.getElementById("f-operador");
const $btn = document.getElementById("btn-aplicar");
const $tbody = document.getElementById("tbody");

// Modal
const $modalBack = document.getElementById("modalBack");
const $mClose = document.getElementById("mClose");
const $mTitle = document.getElementById("mTitle");
const $mImg = document.getElementById("mImg");
const $mDownload = document.getElementById("mDownload");
const $mFecha = document.getElementById("mFecha");
const $mOperador = document.getElementById("mOperador");
const $mPantalla = document.getElementById("mPantalla");
const $mPrioridad = document.getElementById("mPrioridad");
const $mEstado = document.getElementById("mEstado");
const $mHaciendo = document.getElementById("mHaciendo");
const $mPaso = document.getElementById("mPaso");
const $mPasos = document.getElementById("mPasos");
const $mMsg = document.getElementById("mMsg");

const $btnAbierto = document.getElementById("btnAbierto");
const $btnProgreso = document.getElementById("btnProgreso");
const $btnResuelto = document.getElementById("btnResuelto");

let currentId = null;

function esc(x){
  return String(x ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function setMsgRow(msg){
  $tbody.innerHTML = `<tr><td colspan="6" class="muted">${esc(msg)}</td></tr>`;
}

function fmtDate(iso){
  try{ return new Date(iso).toLocaleString(); }catch{ return iso || "-"; }
}

function storagePublicUrl(path){
  // bucket publico => url directa
  const { data } = sb.storage.from("errores").getPublicUrl(path);
  return data?.publicUrl || "";
}

function rowHTML(r){
  return `
    <tr>
      <td>${esc(fmtDate(r.created_at))}</td>
      <td>${esc(r.operador)}</td>
      <td>${esc(r.pantalla)}</td>
      <td>${esc(r.prioridad)}</td>
      <td>${esc(r.estado)}</td>
      <td><a href="#" class="btnlink" data-id="${r.id}">Abrir</a></td>
    </tr>
  `;
}

async function fetchRows(){
  setMsgRow("Cargando…");

  let q = sb.from("reportes_errores")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);

  if ($estado.value) q = q.eq("estado", $estado.value);
  if ($prioridad.value) q = q.eq("prioridad", $prioridad.value);
  if ($operador.value.trim()) q = q.ilike("operador", `%${$operador.value.trim()}%`);

  const { data, error } = await q;
  if (error){
    console.error(error);
    return setMsgRow("Error cargando reportes.");
  }

  if (!data || !data.length) return setMsgRow("Sin reportes con esos filtros.");

  $tbody.innerHTML = data.map(rowHTML).join("");

  // click abrir
  [...document.querySelectorAll('a[data-id]')].forEach(a => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const id = Number(a.dataset.id);
      const row = data.find(x => x.id === id);
      if (row) openModal(row);
    });
  });
}

function openModal(r){
  currentId = r.id;

  const url = storagePublicUrl(r.imagen_path);
  $mImg.src = url;
  $mDownload.href = url;

  $mTitle.textContent = `Reporte #${r.id}`;
  $mFecha.textContent = fmtDate(r.created_at);
  $mOperador.textContent = r.operador;
  $mPantalla.textContent = r.pantalla;
  $mPrioridad.textContent = r.prioridad;
  $mEstado.textContent = r.estado;

  $mHaciendo.textContent = r.que_estabas_haciendo;
  $mPaso.textContent = r.que_paso;
  $mPasos.textContent = r.pasos_para_reproducir || "-";

  $mMsg.textContent = "";
  $modalBack.style.display = "flex";
}

function closeModal(){
  $modalBack.style.display = "none";
  currentId = null;
}

async function updateEstado(estado){
  if (!currentId) return;
  $mMsg.textContent = "Actualizando…";

  const { error } = await sb
    .from("reportes_errores")
    .update({ estado })
    .eq("id", currentId);

  if (error){
    console.error(error);
    $mMsg.textContent = "❌ No se pudo actualizar.";
    return;
  }

  $mMsg.textContent = "✅ Estado actualizado.";
  $mEstado.textContent = estado;
  await fetchRows();
}

async function init(){
  const s = requireSession();
  if (!s) return;

  // ✅ SOLO GERENTE VE TODO
  if (s.rol !== "gerente"){
    alert("Solo gerente puede ver reportes.");
    location.replace("../dashboard/dashboard.html");
    return;
  }

  await loadSidebar({ activeKey: "reportes_errores", basePath: "../" });

  $btn.addEventListener("click", fetchRows);
  $mClose.addEventListener("click", closeModal);
  $modalBack.addEventListener("click", (e) => { if (e.target === $modalBack) closeModal(); });

  $btnAbierto.addEventListener("click", () => updateEstado("abierto"));
  $btnProgreso.addEventListener("click", () => updateEstado("en_progreso"));
  $btnResuelto.addEventListener("click", () => updateEstado("resuelto"));

  await fetchRows();
}
init();
