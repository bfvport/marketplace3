// ./logica.js  (type="module")
const $ = (sel) => document.querySelector(sel);

function getSB() {
  // soporta varias convenciones de supabase.js
  if (window.supabaseClient) return window.supabaseClient;
  if (window.sb) return window.sb;
  if (window.supabase && window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
    return window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  }
  throw new Error("No encuentro el cliente de Supabase. Revisá ../../assets/js/supabase.js");
}

const sb = getSB();

const BUCKET = "categoria_csv";
const TABLE = "categoria";

// --- Sesión ---
function getSessionUser() {
  // Ajustá acá si tu login guarda otra clave
  // Ej esperado: localStorage.setItem("session_user", JSON.stringify({usuario:"operador1", rol:"operador"}))
  try {
    const raw = localStorage.getItem("session_user");
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || !obj.usuario) return null;
    return obj;
  } catch {
    return null;
  }
}

function requireSession() {
  const sess = getSessionUser();
  if (!sess?.usuario) {
    log("❌ No hay sesión. Volvé al login.");
    return null;
  }
  return sess;
}

// --- Utils ---
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
  // 20260111T132012 -> compacta, segura para filename
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function safeName(name) {
  return String(name || "archivo.csv").replace(/[^\w.\-]+/g, "_");
}

// --- Form ---
function clearForm() {
  $("#cat_id").value = "";
  $("#cat_nombre").value = "";
  $("#cat_mensaje").value = "";
  $("#cat_csv_nombre").value = "(sin CSV)";

  const sess = getSessionUser();
  $("#cat_creado_por_view").value = sess?.usuario ? sess.usuario : "(sesión no encontrada)";
}

function fillForm(cat) {
  $("#cat_id").value = String(cat.id);
  $("#cat_nombre").value = cat.nombre || "";
  $("#cat_mensaje").value = cat.mensaje || "";
  $("#cat_csv_nombre").value = cat.csv_nombre || "(sin CSV)";

  // creado_por siempre viene de DB; vista read-only
  $("#cat_creado_por_view").value = cat.creado_por || "(sin dato)";
}

// --- Data ---
async function fetchCategorias() {
  const { data, error } = await sb
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

// --- Actions ---
async function guardarCategoria() {
  const sess = requireSession();
  if (!sess) return;

  const id = ($("#cat_id")?.value || "").trim();
  const nombre = ($("#cat_nombre")?.value || "").trim();
  const mensaje = ($("#cat_mensaje")?.value || "").trim();

  if (!nombre) return log("❌ Falta nombre.");
  if (!mensaje) return log("❌ Falta mensaje.");

  disable("#btnGuardar", true);

  try {
    if (!id) {
      log(`🧾 Creando categoría: "${nombre}" (creado_por = sesión: ${sess.usuario})`);

      const { data, error } = await sb
        .from(TABLE)
        .insert([{
          nombre,
          mensaje,
          creado_por: sess.usuario,
          // csv_nombre queda null hasta subir
        }])
        .select("id, nombre, mensaje, csv_nombre, creado_por")
        .single();

      if (error) throw error;

      fillForm(data);
      log(`✅ Categoría creada (id interno ${data.id}).`);
    } else {
      // Update: NO permitimos cambiar creado_por desde UI
      log(`🧾 Actualizando categoría (id interno oculto).`);

      const { error } = await sb
        .from(TABLE)
        .update({ nombre, mensaje })
        .eq("id", Number(id));

      if (error) throw error;

      log(`✅ Categoría actualizada.`);
    }

    await refreshUI();
  } catch (e) {
    log(`❌ Guardar error: ${e.message || e}`);
  } finally {
    disable("#btnGuardar", false);
  }
}

async function subirCSV() {
  const sess = requireSession();
  if (!sess) return;

  const catId = ($("#selCategoria")?.value || "").trim();
  if (!catId) return log("❌ Seleccioná una categoría.");
  const file = $("#fileCsv")?.files?.[0];
  if (!file) return log("❌ Elegí un archivo CSV.");

  const path = `${catId}/${nowTsCompact()}_${safeName(file.name)}`;

  disable("#btnSubir", true);
  try {
    log(`📤 Subiendo a bucket ${BUCKET}: ${path}`);

    const { error: upErr } = await sb.storage
      .from(BUCKET)
      .upload(path, file, {
        cacheControl: "3600",
        upsert: true,
        contentType: "text/csv"
      });

    if (upErr) throw upErr;

    // Asocia el CSV en la categoría (guardar path como csv_nombre para que quede todo simple)
    const { error: updErr } = await sb
      .from(TABLE)
      .update({ csv_nombre: path })
      .eq("id", Number(catId));

    if (updErr) throw updErr;

    log(`✅ CSV subido y asociado: ${path}`);

    // si justo estás editando esa categoría, actualizar el campo visual
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
    log(`📚 Listando CSV en ${BUCKET}/${catId}/`);

    const { data, error } = await sb.storage
      .from(BUCKET)
      .list(`${catId}`, { limit: 100, sortBy: { column: "updated_at", order: "desc" } });

    if (error) throw error;

    const files = (data || []).filter(x => x && x.name && x.name.toLowerCase().endsWith(".csv"));

    if (!files.length) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="3" class="muted">No hay CSV subidos para esta categoría.</td></tr>`;
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
          log(`📋 Path copiado: ${fullPath}`);
        } catch {
          log(`❌ No pude copiar al portapapeles.`);
        }
      };

      const btnDel = document.createElement("button");
      btnDel.className = "btn2 danger";
      btnDel.textContent = "Borrar";
      btnDel.onclick = async () => {
        if (!confirm(`¿Borrar ${fullPath}?`)) return;
        await borrarCsv(fullPath, Number(catId));
      };

      tdAcc.appendChild(btnCopy);
      tdAcc.appendChild(btnDel);
      tr.appendChild(tdAcc);

      tbody.appendChild(tr);
    }
  } catch (e) {
    log(`❌ listar csv error: ${e.message || e}`);
  } finally {
    disable("#btnListarCsv", false);
  }
}

async function borrarCsv(fullPath, catIdNum) {
  disable("#btnListarCsv", true);
  try {
    log(`🗑️ Borrando: ${BUCKET}/${fullPath}`);

    const { error } = await sb.storage.from(BUCKET).remove([fullPath]);
    if (error) throw error;

    log(`✅ Borrado OK: ${fullPath}`);

    // Si la categoría apuntaba a ese path, limpiar csv_nombre
    const { data: cat, error: catErr } = await sb
      .from(TABLE)
      .select("id, csv_nombre")
      .eq("id", catIdNum)
      .single();

    if (!catErr && cat?.csv_nombre === fullPath) {
      await sb.from(TABLE).update({ csv_nombre: null }).eq("id", catIdNum);
      log(`🧹 csv_nombre limpiado en la categoría (porque apuntaba al archivo borrado).`);
      if ($("#cat_id")?.value?.trim() === String(catIdNum)) {
        $("#cat_csv_nombre").value = "(sin CSV)";
      }
    }

    await listarCsvDeCategoria();
    await refreshUI();
  } catch (e) {
    log(`❌ borrar csv error: ${e.message || e}`);
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

// --- Init ---
document.addEventListener("DOMContentLoaded", async () => {
  // Si faltan elementos, salimos sin romper
  if (!$("#btnGuardar") || !$("#btnNuevo") || !$("#btnSubir") || !$("#btnListarCsv")) return;

  const sess = getSessionUser();
  const pill = $("#sessionPill");
  if (pill && sess?.usuario) {
    pill.style.display = "inline-block";
    pill.textContent = `Sesión: ${sess.usuario}`;
  }

  clearForm();

  $("#btnGuardar").addEventListener("click", guardarCategoria);
  $("#btnNuevo").addEventListener("click", () => {
    clearForm();
    log("🆕 Form limpio (modo crear).");
  });
  $("#btnSubir").addEventListener("click", subirCSV);
  $("#btnListarCsv").addEventListener("click", listarCsvDeCategoria);
  $("#btnDescargarPlantilla").addEventListener("click", descargarPlantilla);

  try {
    await refreshUI();
    log("✅ UI lista.");
  } catch (e) {
    log(`❌ init error: ${e.message || e}`);
  }
});
