// ./logica.js
console.log("PATH:", location.pathname);
console.log("SESSION mp_session_v1:", localStorage.getItem("mp_session_v1"));

import { getSession, loadSidebar } from "../../assets/js/app.js";

function gotoLogin() {
  // arma la URL correcta desde donde estés parado
  const url = new URL("../login/login.html", location.href);
  location.href = url.pathname; 
}

const s = getSession();
if (!s || !s.usuario || !s.rol) {
  gotoLogin();      // <- esto evita “page not found”
  throw new Error("No session");
}

// si llegaste acá, hay sesión:
await loadSidebar({ activeKey: "categorias", basePath: "../" });

const $ = (sel) => document.querySelector(sel);

// Ajustes
const BUCKET = "categoria_csv";
const TABLE = "categoria";
const BASE_PATH = "../../";      // <- IMPORTANTE: para sidebar.html y logout link
const ACTIVE_KEY = "categorias"; // <- Asegurate que en sidebar.html exista data-nav="categorias"

// Supabase client: tu supabase.js debería setear window.supabaseClient
function sb() {
  if (window.supabaseClient) return window.supabaseClient;
  if (window.sb) return window.sb;
  throw new Error("No encuentro window.supabaseClient. Revisá ../../assets/js/supabase.js");
}

function log(msg) {
  const el = $("#log");
  if (!el) return;
  const time = new Date().toTimeString().slice(0, 8);
  el.innerHTML += `[${time}] ${escapeHtml(msg)}<br>`;
  el.scrollTop = el.scrollHeight;
}

function disable(sel, v) {
  const el = $(sel);
  if (el) el.disabled = !!v;
}

function nowTsCompact() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function safeName(name) {
  return String(name || "archivo.csv").replace(/[^\w.\-]+/g, "_");
}

function clearForm(session) {
  $("#cat_id").value = "";
  $("#cat_nombre").value = "";
  $("#cat_mensaje").value = "";
  $("#cat_csv_nombre").value = "(sin CSV)";
  $("#cat_creado_por_view").value = session?.usuario ? session.usuario : "(sesión no encontrada)";
}

function fillForm(cat) {
  $("#cat_id").value = String(cat.id);
  $("#cat_nombre").value = cat.nombre || "";
  $("#cat_mensaje").value = cat.mensaje || "";
  $("#cat_csv_nombre").value = cat.csv_nombre || "(sin CSV)";
  $("#cat_creado_por_view").value = cat.creado_por || "(sin dato)";
}

async function fetchCategorias() {
  const { data, error } = await sb()
    .from(TABLE)
    .select("id, nombre, mensaje, csv_nombre, creado_por, created_at, updated_at")
    .order("id", { ascending: false });

  if (error) throw error;
  return data || [];
}

function renderSelect(cats) {
  const sel = $("#selCategoria");
  if (!sel) return;

  sel.innerHTML = "";
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = "— Seleccioná —";
  sel.appendChild(opt0);

  for (const c of cats) {
    const opt = document.createElement("option");
    opt.value = String(c.id);
    opt.textContent = `${c.nombre}`;
    sel.appendChild(opt);
  }
}

function renderTabla(cats) {
  const tbody = $("#tablaCats tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  for (const c of cats) {
    const tr = document.createElement("tr");
    tr.dataset.id = String(c.id);

    const tdNombre = document.createElement("td");
    tdNombre.innerHTML = `<b>${escapeHtml(c.nombre)}</b>`;
    tr.appendChild(tdNombre);

    const tdCreado = document.createElement("td");
    tdCreado.textContent = c.creado_por || "-";
    tr.appendChild(tdCreado);

    const tdMsg = document.createElement("td");
    const m = c.mensaje || "";
    tdMsg.textContent = m.slice(0, 220) + (m.length > 220 ? "…" : "");
    tr.appendChild(tdMsg);

    const tdCsv = document.createElement("td");
    tdCsv.innerHTML = `<span class="mono">${escapeHtml(c.csv_nombre || "(sin CSV)")}</span>`;
    tr.appendChild(tdCsv);

    const tdAcc = document.createElement("td");
    tdAcc.className = "actions";

    const btnEdit = document.createElement("button");
    btnEdit.className = "btn2";
    btnEdit.textContent = "Editar";
    btnEdit.onclick = () => {
      fillForm(c);
      log(`✏️ Editando "${c.nombre}"`);
    };

    const btnVerCsv = document.createElement("button");
    btnVerCsv.className = "btn2";
    btnVerCsv.textContent = "Ver CSV";
    btnVerCsv.onclick = async () => {
      $("#selCategoria").value = String(c.id);
      await listarCsvDeCategoria();
    };

    tdAcc.appendChild(btnEdit);
    tdAcc.appendChild(btnVerCsv);
    tr.appendChild(tdAcc);

    tbody.appendChild(tr);
  }
}

async function refreshUI() {
  const cats = await fetchCategorias();
  renderSelect(cats);
  renderTabla(cats);
}

async function guardarCategoria(session) {
  const id = ($("#cat_id")?.value || "").trim();
  const nombre = ($("#cat_nombre")?.value || "").trim();
  const mensaje = ($("#cat_mensaje")?.value || "").trim();

  if (!nombre) return log("❌ Falta nombre.");
  if (!mensaje) return log("❌ Falta mensaje.");

  disable("#btnGuardar", true);
  try {
    if (!id) {
      log(`🧾 Creando categoría: "${nombre}" (creado_por = ${session.usuario})`);

      const { data, error } = await sb()
        .from(TABLE)
        .insert([{
          nombre,
          mensaje,
          creado_por: session.usuario,
          // csv_nombre queda null hasta subir CSV
        }])
        .select("id, nombre, mensaje, csv_nombre, creado_por")
        .single();

      if (error) throw error;

      fillForm(data);
      log(`✅ Categoría creada (id interno ${data.id}).`);
    } else {
      log(`🧾 Actualizando categoría (id interno oculto).`);

      const { error } = await sb()
        .from(TABLE)
        .update({ nombre, mensaje })
        .eq("id", Number(id));

      if (error) throw error;

      log("✅ Categoría actualizada.");
    }

    await refreshUI();
  } catch (e) {
    log(`❌ Guardar error: ${e.message || e}`);
  } finally {
    disable("#btnGuardar", false);
  }
}

async function subirCSV(session) {
  const catId = ($("#selCategoria")?.value || "").trim();
  if (!catId) return log("❌ Seleccioná una categoría.");

  const file = $("#fileCsv")?.files?.[0];
  if (!file) return log("❌ Elegí un archivo CSV.");

  const path = `${catId}/${nowTsCompact()}_${safeName(file.name)}`;

  disable("#btnSubir", true);
  try {
    log(`📤 Subiendo: ${BUCKET}/${path}`);

    const { error: upErr } = await sb().storage
      .from(BUCKET)
      .upload(path, file, { upsert: true, contentType: "text/csv" });

    if (upErr) throw upErr;

    const { error: updErr } = await sb()
      .from(TABLE)
      .update({ csv_nombre: path })
      .eq("id", Number(catId));

    if (updErr) throw updErr;

    log(`✅ CSV asociado: ${path}`);

    if ($("#cat_id")?.value?.trim() === String(catId)) {
      $("#cat_csv_nombre").value = path;
    }

    await refreshUI();
  } catch (e) {
    log(`❌ upload error: ${e.message || e}`);
  } finally {
    disable("#btnSubir", false);
  }
}

async function listarCsvDeCategoria() {
  const catId = ($("#selCategoria")?.value || "").trim();
  if (!catId) return log("❌ Seleccioná una categoría.");

  const panel = $("#csvPanel");
  const hint = $("#csvPanelHint");
  const tbody = $("#tablaCsv tbody");

  if (panel) panel.style.display = "block";
  if (hint) hint.innerHTML = `Mostrando: <span class="mono">${BUCKET}/${catId}/</span>`;
  if (tbody) tbody.innerHTML = "";

  disable("#btnListarCsv", true);
  try {
    log(`📚 Listando: ${BUCKET}/${catId}/`);

    const { data, error } = await sb().storage
      .from(BUCKET)
      .list(`${catId}`, { limit: 100, sortBy: { column: "updated_at", order: "desc" } });

    if (error) throw error;

    const files = (data || []).filter(x => x?.name && x.name.toLowerCase().endsWith(".csv"));

    if (!files.length) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="3" class="muted">No hay CSV subidos.</td></tr>`;
      return;
    }

    for (const f of files) {
      const fullPath = `${catId}/${f.name}`;

      const tr = document.createElement("tr");

      const tdFile = document.createElement("td");
      tdFile.innerHTML = `<span class="mono">${escapeHtml(fullPath)}</span>`;
      tr.appendChild(tdFile);

      const tdMod = document.createElement("td");
      tdMod.textContent = f.updated_at || f.created_at || "-";
      tr.appendChild(tdMod);

      const tdAcc = document.createElement("td");
      tdAcc.className = "actions";

      const btnCopy = document.createElement("button");
      btnCopy.className = "btn2";
      btnCopy.textContent = "Copiar path";
      btnCopy.onclick = async () => {
        try {
          await navigator.clipboard.writeText(fullPath);
          log(`📋 Copiado: ${fullPath}`);
        } catch {
          log("❌ No pude copiar al portapapeles.");
        }
      };

      tdAcc.appendChild(btnCopy);
      tr.appendChild(tdAcc);

      tbody.appendChild(tr);
    }
  } catch (e) {
    log(`❌ listar csv error: ${e.message || e}`);
  } finally {
    disable("#btnListarCsv", false);
  }
}

function descargarPlantilla() {
  const headers = ["titulo","descripcion","categoria","etiquetas","url_img_fijas","url_imagenes_portadas"];
  const csv = headers.join(",") + "\n";
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "plantilla_categoria.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  log("⬇️ Plantilla descargada.");
}

document.addEventListener("DOMContentLoaded", async () => {
  // Si faltan elementos clave, evitamos romper
  if (!$("#btnGuardar") || !$("#btnSubir") || !$("#tablaCats")) return;

  const session = requireSession();
  if (!session) return;

  await loadSidebar({ activeKey: ACTIVE_KEY, basePath: BASE_PATH });

  const pill = $("#sessionPill");
  if (pill) {
    pill.style.display = "inline-block";
    pill.textContent = `Sesión: ${session.usuario} (${session.rol})`;
  }

  clearForm(session);

  $("#btnGuardar").addEventListener("click", () => guardarCategoria(session));
  $("#btnNuevo").addEventListener("click", () => {
    clearForm(session);
    log("🆕 Form limpio (modo crear).");
  });

  $("#btnSubir").addEventListener("click", () => subirCSV(session));
  $("#btnListarCsv").addEventListener("click", listarCsvDeCategoria);
  $("#btnDescargarPlantilla").addEventListener("click", descargarPlantilla);

  try {
    await refreshUI();
    log("✅ UI lista.");
  } catch (e) {
    log(`❌ init error: ${e.message || e}`);
  }
});
