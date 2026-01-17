import { escapeHtml, fmtDateISO } from "../../assets/js/app.js";

const supabase = window.supabaseClient;

const tabla = document.getElementById("tabla-links");
const filtroFecha = document.getElementById("filtro-fecha");
const filtroUsuario = document.getElementById("filtro-usuario");
const filtroTipo = document.getElementById("filtro-tipo");
const btnFiltrar = document.getElementById("btn-filtrar");

document.addEventListener("DOMContentLoaded", () => {
  // por default: hoy
  if (!filtroFecha.value) filtroFecha.value = fmtDateISO(new Date());

  cargarFiltros();
  cargarTodo();

  btnFiltrar.addEventListener("click", cargarTodo);
});

async function cargarFiltros() {
  try {
    const { data: usuarios, error } = await supabase
      .from("usuarios")
      .select("usuario")
      .order("usuario", { ascending: true });

    if (error) throw error;

    (usuarios || []).forEach(u => {
      const op = document.createElement("option");
      op.value = u.usuario;
      op.textContent = u.usuario;
      filtroUsuario.appendChild(op);
    });
  } catch (e) {
    console.error("Error cargando filtros:", e);
  }
}

function getDayRangeISO(dateStr) {
  // dateStr: YYYY-MM-DD
  const start = new Date(`${dateStr}T00:00:00`);
  const end = new Date(`${dateStr}T23:59:59.999`);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

async function cargarTodo() {
  tabla.innerHTML = `<tr><td colspan="6">Cargando...</td></tr>`;

  const fecha = filtroFecha.value;
  const usuario = filtroUsuario.value;
  const tipo = filtroTipo.value; // historias/muro/reels/grupos/marketplace

  try {
    const [rrss, mp] = await Promise.all([
      (tipo === "marketplace" ? Promise.resolve([]) : cargarRRSS({ fecha, usuario, tipo })),
      (tipo && tipo !== "marketplace" ? Promise.resolve([]) : cargarMarketplace({ fecha, usuario }))
    ]);

    const rows = [...rrss, ...mp].sort((a, b) => (b.ts || 0) - (a.ts || 0));

    if (!rows.length) {
      tabla.innerHTML = `<tr><td colspan="6">No hay resultados</td></tr>`;
      return;
    }

    tabla.innerHTML = "";
    for (const r of rows) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(r.fechaTxt || "-")}</td>
        <td>${escapeHtml(r.usuario || "-")}</td>
        <td>${escapeHtml(r.cuenta || "-")}</td>
        <td>${escapeHtml(r.tipo || "-")}</td>
        <td>${r.link ? `<a href="${escapeHtml(r.link)}" target="_blank" rel="noopener">Abrir</a>` : "-"}</td>
        <td>${escapeHtml(r.fuente || "-")}</td>
      `;
      tabla.appendChild(tr);
    }

  } catch (e) {
    console.error(e);
    tabla.innerHTML = `<tr><td colspan="6">Error cargando datos</td></tr>`;
  }
}

async function cargarRRSS({ fecha, usuario, tipo }) {
  let q = supabase
    .from("publicaciones_rrss")
    .select(`
      id,
      fecha,
      usuario,
      tipo,
      link,
      cuenta_id,
      cuentas_facebook(nombre)
    `)
    .order("created_at", { ascending: false });

  if (fecha) q = q.eq("fecha", fecha);
  if (usuario) q = q.eq("usuario", usuario);
  if (tipo) q = q.eq("tipo", tipo);

  const { data, error } = await q;
  if (error) throw error;

  return (data || []).map(x => ({
    ts: x.fecha ? new Date(`${x.fecha}T00:00:00`).getTime() : 0,
    fechaTxt: x.fecha || "-",
    usuario: x.usuario,
    cuenta: x.cuentas_facebook?.nombre || "-",
    tipo: x.tipo,
    link: x.link,
    fuente: "RRSS"
  }));
}

async function cargarMarketplace({ fecha, usuario }) {
  let q = supabase
    .from("marketplace_actividad")
    .select(`
      id,
      usuario,
      facebook_account_usada,
      fecha_publicacion,
      marketplace_link_publicacion
    `)
    .order("fecha_publicacion", { ascending: false });

  // marketplace_actividad usa timestamp → filtramos por rango del día
  if (fecha) {
    const { startISO, endISO } = getDayRangeISO(fecha);
    q = q.gte("fecha_publicacion", startISO).lte("fecha_publicacion", endISO);
  }
  if (usuario) q = q.eq("usuario", usuario);

  const { data, error } = await q;
  if (error) throw error;

  return (data || []).map(x => {
    const ts = x.fecha_publicacion ? new Date(x.fecha_publicacion).getTime() : 0;
    const fechaTxt = x.fecha_publicacion ? x.fecha_publicacion.slice(0, 10) : "-";
    return {
      ts,
      fechaTxt,
      usuario: x.usuario,
      cuenta: x.facebook_account_usada || "-",
      tipo: "marketplace",
      link: x.marketplace_link_publicacion || "",
      fuente: "Marketplace"
    };
  });
}
