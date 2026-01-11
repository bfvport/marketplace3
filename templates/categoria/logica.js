import {
  requireSession, loadSidebar, nowISO, escapeHtml
} from "../../assets/js/app.js";

const s = requireSession();
if (s?.rol !== "gerente") {
  // si no es gerente, afuera
  window.location.href = "../dashboard/dashboard.html";
}

await loadSidebar({ activeKey: "categoria", basePath: "../" });

const sb = window.supabaseClient;
const BUCKET = "categoria_csv";

const $ = (id) => document.getElementById(id);

function log(line) {
  const el = $("log");
  const ts = new Date().toLocaleTimeString();
  el.textContent += `[${ts}] ${line}\n`;
  el.scrollTop = el.scrollHeight;
}

function clearForm() {
  $("cat_id").value = "";
  $("cat_nombre").value = "";
  $("cat_mensaje").value = "";
  $("cat_csv_nombre").value = "";
}

function fillForm(cat) {
  $("cat_id").value = cat.id ?? "";
  $("cat_nombre").value = cat.nombre ?? "";
  $("cat_mensaje").value = cat.mensaje ?? "";
  $("cat_csv_nombre").value = cat.csv_nombre ?? "";
}

async function fetchCategorias() {
  const { data, error } = await sb
    .from("categoria")
    .select("id,nombre,mensaje,csv_nombre,created_at,updated_at")
    .order("id", { ascending: true });

  if (error) {
    log("❌ fetch categorias: " + error.message);
    return [];
  }
  return data || [];
}

function renderCategorias(cats) {
  // select para upload
  const sel = $("selCategoria");
  sel.innerHTML = "";
  for (const c of cats) {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = `${c.id} - ${c.nombre}`;
    sel.appendChild(opt);
  }

  // tabla
  const tbody = $("tablaCats").querySelector("tbody");
  tbody.innerHTML = "";

  for (const c of cats) {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td class="mono">${escapeHtml(c.id)}</td>
      <td><strong>${escapeHtml(c.nombre)}</strong></td>
      <td class="small">${escapeHtml((c.mensaje || "").slice(0, 220))}${(c.mensaje || "").length > 220 ? "…" : ""}</td>
      <td class="small mono">${escapeHtml(c.csv_nombre || "-")}</td>
      <td>
        <div class="actions">
          <button class="btn2" data-action="edit" data-id="${c.id}">Editar</button>
          <button class="btn2" data-action="listcsv" data-id="${c.id}">Ver CSV</button>
          <button class="btn2" data-action="upload" data-id="${c.id}">Subir CSV</button>
          <button class="btn2 danger" data-action="deletecat" data-id="${c.id}">Eliminar</button>
        </div>
      </td>
    `;

    tbody.appendChild(tr);
  }

  tbody.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", onTableAction);
  });
}

async function onTableAction(e) {
  const btn = e.currentTarget;
  const action = btn.dataset.action;
  const id = btn.dataset.id;

  if (action === "edit") {
    const cats = await fetchCategorias();
    const c = cats.find(x => String(x.id) === String(id));
    if (c) fillForm(c);
    return;
  }

  if (action === "upload") {
    $("selCategoria").value = id;
    $("fileCsv").focus();
    log(`📌 Seleccionada categoría ${id} para subir CSV.`);
    return;
  }

  if (action === "listcsv") {
    await listCsvForCategory(id);
    return;
  }

  if (action === "deletecat") {
    const ok = confirm(`¿Eliminar categoría ID=${id}? (No borra storage automáticamente)`);
    if (!ok) return;

    const { error } = await sb.from("categoria").delete().eq("id", id);
    if (error) return log("❌ delete categoria: " + error.message);

    log("✅ Categoría eliminada.");
    await refreshAll();
    return;
  }
}

async function saveCategoria() {
  const id = $("cat_id").value.trim();
  const nombre = $("cat_nombre").value.trim();
  const mensaje = $("cat_mensaje").value.trim();
  const csv_nombre = $("cat_csv_nombre").value.trim();

  if (!nombre) return log("⚠️ Falta nombre.");

  // Si hay id, actualizamos; si no, insert.
  if (id) {
    const { error } = await sb.from("categoria")
      .update({
        nombre,
        mensaje,
        csv_nombre: csv_nombre || null,
        updated_at: nowISO(),
      })
      .eq("id", id);

    if (error) return log("❌ update categoria: " + error.message);
    log("✅ Categoría actualizada.");
  } else {
    const { error } = await sb.from("categoria")
      .insert([{
        nombre,
        mensaje: mensaje || null,
        csv_nombre: csv_nombre || null,
        created_at: nowISO(),
        updated_at: nowISO(),
      }]);

    if (error) return log("❌ insert categoria: " + error.message);
    log("✅ Categoría creada.");
  }

  clearForm();
  await refreshAll();
}

function downloadTemplateCsv() {
  const headers = [
    "titulo",
    "descripcion",
    "categoria",
    "etiquetas",
    "url_img_fijas",
    "url_imagenes_portadas",
  ];

  // 2 filas de ejemplo (podés borrar la 2da si querés)
  const rows = [
    headers.join(","),
    `Ejemplo titulo,"Ejemplo descripcion","ropa","oferta,envio","https://...","https://...,https://..."`,
  ];

  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
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

function safeFilename(name) {
  return String(name || "")
    .trim()
    .replaceAll(" ", "_")
    .replaceAll(":", "-")
    .replaceAll("/", "-")
    .replaceAll("\\", "-");
}

async function uploadCsv() {
  const catId = $("selCategoria").value;
  const file = $("fileCsv").files?.[0];

  if (!catId) return log("⚠️ Elegí una categoría.");
  if (!file) return log("⚠️ Elegí un archivo CSV.");

  // nombre final
  const stamp = new Date().toISOString().replaceAll(":", "").slice(0, 15);
  const finalName = safeFilename(file.name || `categoria_${catId}.csv`);
  const path = `${catId}/${stamp}_${finalName}`;

  log(`📤 Subiendo a bucket ${BUCKET}: ${path}`);

  // subimos (upsert true para reemplazar si existe el mismo path)
  const { error: upErr } = await sb.storage
    .from(BUCKET)
    .upload(path, file, {
      contentType: "text/csv",
      upsert: true
    });

  if (upErr) return log("❌ upload error: " + upErr.message);

  log("✅ CSV subido.");

  // guardamos referencia en la tabla categoria.csv_nombre (opcional: guardamos path)
  const { error: dbErr } = await sb.from("categoria")
    .update({ csv_nombre: path, updated_at: nowISO() })
    .eq("id", catId);

  if (dbErr) log("⚠️ No pude actualizar csv_nombre en DB: " + dbErr.message);
  else log("✅ csv_nombre actualizado en categoría.");

  $("fileCsv").value = "";
  await refreshAll();
  await listCsvForCategory(catId);
}

async function listCsvForCategory(catId) {
  $("csvPanel").style.display = "block";
  $("csvPanelHint").textContent = `Categoría ID=${catId} | Bucket=${BUCKET} | Carpeta=${catId}/`;

  const { data, error } = await sb.storage.from(BUCKET).list(`${catId}`, {
    limit: 100,
    offset: 0,
    sortBy: { column: "updated_at", order: "desc" }
  });

  if (error) {
    log("❌ list storage: " + error.message);
    return;
  }

  const files = (data || []).filter(x => x.name && x.name.toLowerCase().endsWith(".csv"));

  const tbody = $("tablaCsv").querySelector("tbody");
  tbody.innerHTML = "";

  if (!files.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="3" class="muted">No hay CSV subidos en ${catId}/</td>`;
    tbody.appendChild(tr);
    return;
  }

  for (const f of files) {
    const fullPath = `${catId}/${f.name}`;

    // URL pública (si bucket es público). Si no es público, lo cambiamos a signed URL.
    const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(fullPath);
    const publicUrl = pub?.publicUrl || null;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="mono">${escapeHtml(f.name)}</td>
      <td class="small">${escapeHtml(f.updated_at || f.created_at || "-")}</td>
      <td>
        <div class="actions">
          ${publicUrl ? `<a class="btn2" href="${publicUrl}" target="_blank" rel="noopener">Descargar</a>` : `<span class="muted small">Sin URL pública</span>`}
          <button class="btn2" data-action="setRef" data-path="${fullPath}">Usar como csv_nombre</button>
          <button class="btn2 danger" data-action="delFile" data-path="${fullPath}">Eliminar</button>
        </div>
      </td>
    `;

    tbody.appendChild(tr);
  }

  tbody.querySelectorAll("button").forEach(b => {
    b.addEventListener("click", async (ev) => {
      const action = ev.currentTarget.dataset.action;
      const path = ev.currentTarget.dataset.path;

      if (action === "setRef") {
        const { error: dbErr } = await sb.from("categoria")
          .update({ csv_nombre: path, updated_at: nowISO() })
          .eq("id", catId);

        if (dbErr) log("❌ set csv_nombre: " + dbErr.message);
        else {
          log("✅ csv_nombre seteado: " + path);
          await refreshAll();
        }
        return;
      }

      if (action === "delFile") {
        const ok = confirm(`¿Eliminar archivo del bucket?\n${path}`);
        if (!ok) return;

        const { error: delErr } = await sb.storage.from(BUCKET).remove([path]);
        if (delErr) return log("❌ delete storage: " + delErr.message);

        log("✅ Archivo eliminado: " + path);

        // si este era el csv_nombre actual, lo limpiamos
        const cats = await fetchCategorias();
        const c = cats.find(x => String(x.id) === String(catId));
        if (c?.csv_nombre === path) {
          const { error: clrErr } = await sb.from("categoria")
            .update({ csv_nombre: null, updated_at: nowISO() })
            .eq("id", catId);

          if (clrErr) log("⚠️ No pude limpiar csv_nombre: " + clrErr.message);
          else log("✅ csv_nombre limpiado (porque borraste ese archivo).");
        }

        await refreshAll();
        await listCsvForCategory(catId);
      }
    });
  });
}

async function refreshAll() {
  const cats = await fetchCategorias();
  renderCategorias(cats);

  // mantener panel de csv si está abierto
  const panelOpen = $("csvPanel").style.display !== "none";
  if (panelOpen) {
    const currentCatId = $("selCategoria").value;
    if (currentCatId) await listCsvForCategory(currentCatId);
  }
}

// UI events
$("btnGuardar").addEventListener("click", () => saveCategoria().catch(e => log("❌ " + e.message)));
$("btnNuevo").addEventListener("click", () => { clearForm(); log("🧾 Form listo para nueva categoría."); });
$("btnDescargarPlantilla").addEventListener("click", downloadTemplateCsv);

$("btnSubir").addEventListener("click", () => uploadCsv().catch(e => log("❌ " + e.message)));
$("btnListarCsv").addEventListener("click", async () => {
  const catId = $("selCategoria").value;
  if (!catId) return log("⚠️ Elegí una categoría.");
  await listCsvForCategory(catId);
});

// init
(async function init() {
  log("Init categorías...");
  await refreshAll();
  log("Listo.");
})();
