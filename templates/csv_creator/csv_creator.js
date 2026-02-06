import { getSession, loadSidebar, escapeHtml, fmtDateISO } from "../../assets/js/app.js";

const $ = (sel) => document.querySelector(sel);

const TABLE_CATEGORIA = "categoria";
const BUCKET = "categoria_csv";

let supabaseClient = null;
let session = null;

let categorias = [];
let categoriaSel = null; // {id, nombre, etiquetas, csv_nombre}
let rows = []; // [{titulo, etiquetas}]

function log(msg) {
  const el = $("#log");
  if (!el) return;
  const t = new Date().toTimeString().slice(0, 8);
  el.innerHTML += `[${t}] ${escapeHtml(msg)}<br>`;
  el.scrollTop = el.scrollHeight;
}

function disable(sel, v) {
  const el = $(sel);
  if (el) el.disabled = !!v;
}

async function waitSupabaseClient(timeoutMs = 2000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (window.supabaseClient) return window.supabaseClient;
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}

function safeName(name) {
  return String(name || "archivo.csv").replace(/[^\w.\-]+/g, "_");
}

function nowTsCompact() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function csvEscape(value) {
  const s = String(value ?? "");
  // Si tiene coma, salto, o comillas => encerrar y escapar comillas
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildCsvText() {
  if (!categoriaSel?.nombre) throw new Error("Seleccioná una categoría.");

  const header = ["titulo", "categoria", "etiquetas"].join(",");
  const lines = [header];

  for (const r of rows) {
    const titulo = (r.titulo || "").trim();
    if (!titulo) continue;

    const categoria = categoriaSel.nombre;
    const etiquetas = (r.etiquetas || "").trim();

    lines.push([csvEscape(titulo), csvEscape(categoria), csvEscape(etiquetas)].join(","));
  }

  return lines.join("\n") + "\n";
}

function renderCategoriasSelect() {
  const sel = $("#selCategoria");
  sel.innerHTML = "";

  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = "— Seleccioná —";
  sel.appendChild(opt0);

  for (const c of categorias) {
    const opt = document.createElement("option");
    opt.value = String(c.id);
    opt.textContent = c.nombre;
    sel.appendChild(opt);
  }
}

function renderRowsTable() {
  const tbody = $("#tablaRows tbody");
  tbody.innerHTML = "";

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="muted">No hay filas. Agregá o importá títulos.</td></tr>`;
    return;
  }

  rows.forEach((r, i) => {
    const tr = document.createElement("tr");

    const tdN = document.createElement("td");
    tdN.textContent = String(i + 1);
    tr.appendChild(tdN);

    const tdTitulo = document.createElement("td");
    const inpT = document.createElement("input");
    inpT.value = r.titulo || "";
    inpT.placeholder = "Título...";
    inpT.oninput = (e) => {
      rows[i].titulo = e.target.value;
    };
    tdTitulo.appendChild(inpT);
    tr.appendChild(tdTitulo);

    const tdTags = document.createElement("td");
    const inpG = document.createElement("input");
    inpG.value = r.etiquetas || "";
    inpG.placeholder = "tag1, tag2, tag3";
    inpG.oninput = (e) => {
      rows[i].etiquetas = e.target.value;
    };
    tdTags.appendChild(inpG);
    tr.appendChild(tdTags);

    const tdAcc = document.createElement("td");
    const btnDel = document.createElement("button");
    btnDel.className = "btn2 btn-danger";
    btnDel.textContent = "Eliminar";
    btnDel.onclick = () => {
      rows.splice(i, 1);
      renderRowsTable();
      log(`🗑️ Fila ${i + 1} eliminada`);
    };
    tdAcc.appendChild(btnDel);
    tr.appendChild(tdAcc);

    tbody.appendChild(tr);
  });
}

function setCategoriaSeleccionada(catId) {
  categoriaSel = categorias.find((c) => String(c.id) === String(catId)) || null;
  $("#catTags").textContent = categoriaSel?.etiquetas ? categoriaSel.etiquetas : "-";
  log(categoriaSel ? `✅ Categoría: ${categoriaSel.nombre}` : "⚠️ Seleccioná una categoría.");
}

function addRow(titulo = "", etiquetas = "") {
  rows.push({ titulo, etiquetas });
  renderRowsTable();
}

function importTitlesFromBulk() {
  const raw = ($("#bulkTitles").value || "").trim();
  if (!raw) return log("⚠️ Pegá títulos (uno por línea).");

  const lines = raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (lines.length === 0) return log("⚠️ No hay títulos válidos.");

  lines.forEach((t) => addRow(t, ""));
  log(`📥 Importados ${lines.length} títulos como filas.`);
  $("#bulkTitles").value = "";
}

function fillDefaultTagsToEmpty() {
  if (!categoriaSel) return log("❌ Seleccioná categoría primero.");
  const def = (categoriaSel.etiquetas || "").trim();
  if (!def) return log("⚠️ Esta categoría no tiene etiquetas por defecto en BD.");

  let changed = 0;
  rows.forEach((r) => {
    if (!(r.etiquetas || "").trim()) {
      r.etiquetas = def;
      changed++;
    }
  });

  renderRowsTable();
  log(`🏷️ Etiquetas por defecto aplicadas en ${changed} fila(s).`);
}

function buildPreview() {
  try {
    if (!categoriaSel) return log("❌ Seleccioná una categoría.");
    const csv = buildCsvText();
    $("#csvPreview").value = csv;
    const count = rows.filter(r => (r.titulo || "").trim()).length;
    log(`✅ Preview generado. Filas: ${count}`);
  } catch (e) {
    log(`❌ ${e.message}`);
  }
}

function downloadCsv() {
  try {
    if (!categoriaSel) return log("❌ Seleccioná una categoría.");
    const csv = buildCsvText();
    const name = `csv_${safeName(categoriaSel.nombre)}_${fmtDateISO(new Date())}.csv`;

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);

    log(`⬇️ Descargado: ${name}`);
  } catch (e) {
    log(`❌ ${e.message}`);
  }
}

async function uploadAndAssociate() {
  if (!categoriaSel) return log("❌ Seleccioná una categoría.");
  if (!session?.usuario) return log("❌ No hay sesión. Volvé al login.");

  let csv;
  try {
    csv = buildCsvText();
  } catch (e) {
    return log(`❌ ${e.message}`);
  }

  const validRows = rows.filter(r => (r.titulo || "").trim()).length;
  if (validRows === 0) return log("❌ No hay filas con título.");

  disable("#btnUpload", true);
  try {
    const fileName = `creador_${safeName(categoriaSel.nombre)}_${nowTsCompact()}.csv`;
    const path = `${categoriaSel.id}/${fileName}`;

    log(`📤 Subiendo a ${BUCKET}: ${path}`);

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });

    const { error: upErr } = await supabaseClient.storage
      .from(BUCKET)
      .upload(path, blob, { upsert: true, contentType: "text/csv" });

    if (upErr) throw upErr;

    log(`🧷 Asociando csv_nombre en categoría...`);

    const { error: updErr } = await supabaseClient
      .from(TABLE_CATEGORIA)
      .update({ csv_nombre: path })
      .eq("id", Number(categoriaSel.id));

    if (updErr) throw updErr;

    log(`✅ CSV subido y asociado a "${categoriaSel.nombre}"`);
  } catch (e) {
    log(`❌ Error: ${e.message || e}`);
    console.error(e);
  } finally {
    disable("#btnUpload", false);
  }
}

async function loadCategorias() {
  const { data, error } = await supabaseClient
    .from(TABLE_CATEGORIA)
    .select("id,nombre,etiquetas,csv_nombre")
    .order("id", { ascending: false });

  if (error) throw error;
  categorias = data || [];
  renderCategoriasSelect();
}

function clearAll() {
  rows = [];
  $("#csvPreview").value = "";
  $("#bulkTitles").value = "";
  renderRowsTable();
  log("🧹 Todo limpio.");
}

document.addEventListener("DOMContentLoaded", async () => {
  session = getSession();
  if (!session?.usuario) return;

  await loadSidebar({ activeKey: "csv_creator", basePath: "../" });

  supabaseClient = await waitSupabaseClient(2000);
  if (!supabaseClient) {
    log("❌ No se pudo conectar a Supabase (window.supabaseClient).");
    return;
  }

  log("✅ Supabase client conectado.");

  try {
    await loadCategorias();
    log(`✅ Categorías cargadas: ${categorias.length}`);
  } catch (e) {
    log(`❌ No pude cargar categorías: ${e.message || e}`);
  }

  // eventos
  $("#selCategoria").addEventListener("change", (e) => {
    setCategoriaSeleccionada(e.target.value);
  });

  $("#btnAddRow").addEventListener("click", () => addRow());
  $("#btnImportTitles").addEventListener("click", importTitlesFromBulk);
  $("#btnClearBulk").addEventListener("click", () => ($("#bulkTitles").value = ""));
  $("#btnFillDefaultTags").addEventListener("click", fillDefaultTagsToEmpty);
  $("#btnClear").addEventListener("click", clearAll);

  $("#btnBuild").addEventListener("click", buildPreview);
  $("#btnDownload").addEventListener("click", downloadCsv);
  $("#btnUpload").addEventListener("click", uploadAndAssociate);

  // fila inicial
  addRow();
});
