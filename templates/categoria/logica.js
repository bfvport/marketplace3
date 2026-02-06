import { getSession, loadSidebar, escapeHtml } from "../../assets/js/app.js";

const $ = (sel) => document.querySelector(sel);
const TABLE = "categoria";
const BUCKET = "categoria_csv";

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

function nowTsCompact() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function safeName(name) {
  return String(name || "archivo.csv").replace(/[^\w.\-]+/g, "_");
}

async function waitSupabaseClient(timeoutMs = 2000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (window.supabaseClient) return window.supabaseClient;
    await new Promise(r => setTimeout(r, 50));
  }
  return null;
}

function setSessionPill(session) {
  const pill = $("#sessionPill");
  if (!pill) return;
  if (!session?.usuario) {
    pill.style.display = "inline-block";
    pill.textContent = "Sesión: NO encontrada";
    return;
  }
  pill.style.display = "inline-block";
  pill.textContent = `Sesión: ${session.usuario} (${session.rol || "?"})`;
}

function clearForm(session) {
  $("#cat_id").value = "";
  $("#cat_nombre").value = "";
  $("#cat_mensaje").value = "";
  $("#cat_etiquetas").value = "";
  $("#cat_csv_nombre").value = "(sin CSV)";
  $("#cat_creado_por_view").value = session?.usuario ? session.usuario : "(sesión no encontrada)";
}

function fillForm(cat) {
  $("#cat_id").value = String(cat.id);
  $("#cat_nombre").value = cat.nombre || "";
  $("#cat_mensaje").value = cat.mensaje || "";
  $("#cat_etiquetas").value = cat.etiquetas || "";
  $("#cat_csv_nombre").value = cat.csv_nombre || "(sin CSV)";
  $("#cat_creado_por_view").value = cat.creado_por || "(sin dato)";
}

async function fetchCategorias(sb) {
  const { data, error } = await sb
    .from(TABLE)
    .select("id, nombre, mensaje, etiquetas, csv_nombre, creado_por, created_at, updated_at")
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
    opt.textContent = c.nombre;
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
    tdMsg.textContent = m.slice(0, 120) + (m.length > 120 ? "…" : "");
    tr.appendChild(tdMsg);

    const tdEtiquetas = document.createElement("td");
    const et = c.etiquetas || "";
    tdEtiquetas.textContent = et.slice(0, 80) + (et.length > 80 ? "…" : "");
    tr.appendChild(tdEtiquetas);

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

    const btnVer = document.createElement("button");
    btnVer.className = "btn2";
    btnVer.textContent = "Ver CSV";
    btnVer.onclick = async () => {
      $("#selCategoria").value = String(c.id);
      await listarCsvDeCategoria();
    };

    tdAcc.appendChild(btnEdit);
    tdAcc.appendChild(btnVer);
    tr.appendChild(tdAcc);

    tbody.appendChild(tr);
  }
}

async function refreshUI(sb) {
  const cats = await fetchCategorias(sb);
  renderSelect(cats);
  renderTabla(cats);
}

async function guardarCategoria(sb, session) {
  const id = ($("#cat_id")?.value || "").trim();
  const nombre = ($("#cat_nombre")?.value || "").trim();
  const mensaje = ($("#cat_mensaje")?.value || "").trim();
  const etiquetas = ($("#cat_etiquetas")?.value || "").trim();

  if (!session?.usuario) return log("❌ No hay sesión (mp_session_v1). Volvé al login.");
  if (!nombre) return log("❌ Falta nombre.");
  if (!mensaje) return log("❌ Falta mensaje.");

  disable("#btnGuardar", true);
  try {
    if (!id) {
      log(`🧾 Creando categoría "${nombre}" (creado_por=${session.usuario})`);

      const { data, error } = await sb
        .from(TABLE)
        .insert([{
          nombre,
          mensaje,
          etiquetas,
          creado_por: session.usuario
        }])
        .select("id, nombre, mensaje, etiquetas, csv_nombre, creado_por")
        .single();

      if (error) throw error;

      fillForm(data);
      log(`✅ Creada OK (id interno ${data.id})`);
    } else {
      log(`🧾 Actualizando categoría (id interno oculto)`);

      const { error } = await sb
        .from(TABLE)
        .update({ nombre, mensaje, etiquetas })
        .eq("id", Number(id));

      if (error) {
        if (error.message.includes("violates foreign key constraint") &&
            error.message.includes("usuarios_asignado_categoria_fkey")) {
          throw new Error("❌ No se puede actualizar: esta categoría está asignada a usuarios. Primero desasignala.");
        }
        throw error;
      }

      log(`✅ Actualizada OK`);
    }

    await refreshUI(sb);
  } catch (e) {
    log(`❌ Guardar error: ${e.message || e}`);
    console.error(e);
  } finally {
    disable("#btnGuardar", false);
  }
}

async function subirCSV(sb, session) {
  if (!session?.usuario) return log("❌ No hay sesión (mp_session_v1). Volvé al login.");

  const catId = ($("#selCategoria")?.value || "").trim();
  if (!catId) return log("❌ Seleccioná una categoría.");

  const file = $("#fileCsv")?.files?.[0];
  if (!file) return log("❌ Elegí un CSV.");

  const path = `${catId}/${nowTsCompact()}_${safeName(file.name)}`;

  disable("#btnSubir", true);
  try {
    log(`📤 Subiendo a bucket ${BUCKET}: ${path}`);

    const { error: upErr } = await sb.storage
      .from(BUCKET)
      .upload(path, file, { upsert: true, contentType: "text/csv" });

    if (upErr) throw upErr;

    const { error: updErr } = await sb
      .from(TABLE)
      .update({ csv_nombre: path })
      .eq("id", Number(catId));

    if (updErr) throw updErr;

    log(`✅ CSV subido y asociado: ${path}`);

    if ($("#cat_id")?.value?.trim() === String(catId)) {
      $("#cat_csv_nombre").value = path;
    }

    await refreshUI(sb);
  } catch (e) {
    log(`❌ upload/db error: ${e.message || e}`);
    console.error(e);
  } finally {
    disable("#btnSubir", false);
  }
}

async function listarCsvDeCategoria() {
  const sb = window.supabaseClient;
  if (!sb) return log("❌ Supabase client no disponible.");

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
    log(`📚 Listando ${BUCKET}/${catId}/`);

    const { data, error } = await sb.storage
      .from(BUCKET)
      .list(`${catId}`, { limit: 100, sortBy: { column: "updated_at", order: "desc" } });

    if (error) throw error;

    const files = (data || []).filter(f => f?.name && f.name.toLowerCase().endsWith(".csv"));
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
          log("❌ No pude copiar.");
        }
      };

      tdAcc.appendChild(btnCopy);
      tr.appendChild(tdAcc);

      tbody.appendChild(tr);
    }
  } catch (e) {
    log(`❌ listar csv error: ${e.message || e}`);
    console.error(e);
  } finally {
    disable("#btnListarCsv", false);
  }
}

function descargarPlantilla() {
  const headers = [
    "titulo",
    "categoria",
    "etiquetas"
  ];

  const ejemplo = [
    "Producto Ejemplo",
    "nombre-de-la-categoria",
    "\"etiqueta1, etiqueta2, etiqueta3\""
  ];

  const csv = headers.join(",") + "\n" + ejemplo.join(",") + "\n";
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "plantilla_categoria.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  log("⬇️ Plantilla descargada (CSV liviano: titulo, categoria, etiquetas).");
  log("📝 Las etiquetas con comas deben ir entre comillas dobles: \"etiqueta1, etiqueta2\"");
}

document.addEventListener("DOMContentLoaded", async () => {
  const session = getSession();
  setSessionPill(session);

  // ✅ importante: coincide con data-nav="categoria" del sidebar
  await loadSidebar({ activeKey: "categoria", basePath: "../" });

  const client = await waitSupabaseClient(2000);
  if (!client) {
    log("❌ No encuentro window.supabaseClient. Revisá que ../../assets/js/supabase.js lo seteé ANTES del module.");
    return;
  }
  log("✅ Supabase client OK.");

  clearForm(session);

  $("#btnGuardar")?.addEventListener("click", () => guardarCategoria(client, session));
  $("#btnNuevo")?.addEventListener("click", () => { clearForm(session); log("🆕 Form limpio."); });
  $("#btnSubir")?.addEventListener("click", () => subirCSV(client, session));
  $("#btnListarCsv")?.addEventListener("click", listarCsvDeCategoria);
  $("#btnDescargarPlantilla")?.addEventListener("click", descargarPlantilla);

  try {
    await refreshUI(client);
    log("✅ Categorías cargadas.");
  } catch (e) {
    log(`❌ No pude cargar categorías: ${e.message || e}`);
    console.error(e);
  }
});
