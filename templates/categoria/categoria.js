// /js/categorias.js
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// 1) Pegá tus datos (ideal: usar Netlify env + function; pero esto es lo directo)
const SUPABASE_URL = "TU_SUPABASE_URL";
const SUPABASE_ANON_KEY = "TU_SUPABASE_ANON_KEY";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = (sel) => document.querySelector(sel);

let categoriaCreada = null; // { id, nombre, csv_path? }

document.addEventListener("DOMContentLoaded", () => {
  const btnCrear = $("#btn_crear");
  const btnSubir = $("#btn_subir_csv");

  if (btnCrear) btnCrear.addEventListener("click", crearCategoria);
  if (btnSubir) btnSubir.addEventListener("click", subirCSV);

  // opcional: autocompletar creado_por desde storage si lo guardás al loguear
  const savedUser = localStorage.getItem("usuario");
  if ($("#cat_creado_por") && savedUser) $("#cat_creado_por").value = savedUser;

  cargarListado().catch(() => {
    if ($("#cats_list")) $("#cats_list").textContent = "No se pudo cargar el listado.";
  });
});

function setStatus(sel, msg, ok = false) {
  const el = $(sel);
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle("ok", ok);
  el.classList.toggle("bad", !ok && msg.startsWith("❌"));
}

function disable(sel, dis) {
  const el = $(sel);
  if (el) el.disabled = dis;
}

async function crearCategoria() {
  const nombre = $("#cat_nombre")?.value?.trim() || "";
  const mensaje = $("#cat_mensaje")?.value?.trim() || "";
  const csv_nombre = $("#cat_csv_nombre")?.value?.trim() || ""; // opcional
  const creado_por = $("#cat_creado_por")?.value?.trim() || "";

  if (!nombre) return setStatus("#status_crear", "❌ Falta nombre.");
  if (!mensaje) return setStatus("#status_crear", "❌ Falta mensaje.");
  if (!creado_por) return setStatus("#status_crear", "❌ Falta creado_por.");

  setStatus("#status_crear", "Creando...");
  disable("#btn_crear", true);

  try {
    // Insert en tabla categoria
    const { data, error } = await supabase
      .from("categoria")
      .insert([{
        nombre,
        mensaje,
        csv_nombre: csv_nombre || null,
        creado_por
      }])
      .select("id, nombre, csv_nombre")
      .single();

    if (error) {
      setStatus("#status_crear", `❌ Error: ${error.message}`);
      return;
    }

    categoriaCreada = { id: data.id, nombre: data.nombre, csv_path: null };

    setStatus("#status_crear", "✅ Categoría creada.", true);

    // habilitar bloque CSV
    const card = $("#card_csv");
    if (card) card.style.display = "block";

    if ($("#info_nombre")) $("#info_nombre").textContent = categoriaCreada.nombre;
    if ($("#info_id")) $("#info_id").textContent = String(categoriaCreada.id);
    if ($("#info_csv")) $("#info_csv").textContent = "(sin CSV)";

    // refrescar listado
    await cargarListado();

  } finally {
    disable("#btn_crear", false);
  }
}

async function subirCSV() {
  if (!categoriaCreada?.id) return setStatus("#status_csv", "❌ Primero creá la categoría.");

  const file = $("#csv_file")?.files?.[0];
  if (!file) return setStatus("#status_csv", "❌ Elegí un CSV.");

  setStatus("#status_csv", "📤 Subiendo CSV...");
  disable("#btn_subir_csv", true);

  try {
    // Path en bucket: <categoria_id>/<timestamp>_nombre.csv
    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    const ts = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15);
    const path = `${categoriaCreada.id}/${ts}_${safeName}`;

    // Upload a Storage
    const { error: upErr } = await supabase
      .storage
      .from("categoria_csv")
      .upload(path, file, {
        cacheControl: "3600",
        upsert: true,
        contentType: "text/csv"
      });

    if (upErr) {
      setStatus("#status_csv", `❌ upload error: ${upErr.message}`);
      return;
    }

    // Guardar en DB el path asociado
    const { error: updErr } = await supabase
      .from("categoria")
      .update({ csv_path: path })
      .eq("id", categoriaCreada.id);

    if (updErr) {
      setStatus("#status_csv", `❌ DB update error: ${updErr.message}`);
      return;
    }

    categoriaCreada.csv_path = path;
    if ($("#info_csv")) $("#info_csv").textContent = path;

    setStatus("#status_csv", "✅ CSV subido y asociado.", true);
    await cargarListado();

  } finally {
    disable("#btn_subir_csv", false);
  }
}

async function cargarListado() {
  const list = $("#cats_list");
  if (!list) return;

  const { data, error } = await supabase
    .from("categoria")
    .select("id, nombre, creado_por, csv_nombre, csv_path, created_at")
    .order("id", { ascending: false })
    .limit(50);

  if (error) {
    list.textContent = `❌ Error listado: ${error.message}`;
    return;
  }

  if (!data || data.length === 0) {
    list.textContent = "No hay categorías todavía.";
    return;
  }

  list.innerHTML = data.map(c => {
    const csv = c.csv_path || c.csv_nombre || "(sin CSV)";
    return `
      <div class="row">
        <div class="col">
          <b>${escapeHtml(c.nombre)}</b>
          <div class="muted">creado_por: ${escapeHtml(c.creado_por || "-")}</div>
        </div>
        <div class="col muted">CSV: ${escapeHtml(csv)}</div>
      </div>
    `;
  }).join("");
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
