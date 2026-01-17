const supabase = window.supabaseClient;

const tabla = document.getElementById("tabla-links");
const filtroFecha = document.getElementById("filtro-fecha");
const filtroUsuario = document.getElementById("filtro-usuario");
const filtroTipo = document.getElementById("filtro-tipo");
const btnFiltrar = document.getElementById("btn-filtrar");

document.addEventListener("DOMContentLoaded", () => {
  cargarFiltros();
  cargarLinks();
  btnFiltrar?.addEventListener("click", cargarLinks);
});

async function cargarFiltros() {
  // Usuarios
  const { data: usuarios } = await supabase.from("usuarios").select("id, usuario").order("usuario");
  if (usuarios && filtroUsuario) {
    usuarios.forEach(u => {
      const op = document.createElement("option");
      op.value = u.usuario;
      op.textContent = u.usuario;
      filtroUsuario.appendChild(op);
    });
  }

  // Tipos (RRSS + Marketplace)
  if (filtroTipo) {
    const tipos = [
      { value: "", label: "Todos los tipos" },
      { value: "historia", label: "Historias" },
      { value: "reels", label: "Reels" },
      { value: "muro", label: "Muro" },
      { value: "grupo", label: "Grupos" },
      { value: "marketplace", label: "Marketplace" },
    ];

    // Si ya tiene opciones en HTML no duplicamos
    if (filtroTipo.options.length <= 1) {
      filtroTipo.innerHTML = "";
      tipos.forEach(t => {
        const op = document.createElement("option");
        op.value = t.value;
        op.textContent = t.label;
        filtroTipo.appendChild(op);
      });
    }
  }
}

async function cargarLinks() {
  if (!tabla) return;

  tabla.innerHTML = `<tr><td colspan="6">Cargando...</td></tr>`;

  const fecha = filtroFecha?.value || "";
  const usuario = filtroUsuario?.value || "";
  const tipo = filtroTipo?.value || "";

  // 1) Traer RRSS
  let qRRSS = supabase
    .from("publicaciones_rrss")
    .select("id, fecha, created_at, usuario, tipo, link, cuenta_id")
    .order("created_at", { ascending: false });

  if (fecha) qRRSS = qRRSS.eq("fecha", fecha);
  if (usuario) qRRSS = qRRSS.eq("usuario", usuario);
  if (tipo && tipo !== "marketplace") qRRSS = qRRSS.eq("tipo", tipo);

  // 2) Traer Marketplace (tabla distinta)
  // En tu schema se ve "marketplace_actividad" con campos tipo:
  // usuario, fecha_publicacion, marketplace_link_..., facebook_account_..., created_at, etc.
  let qMP = supabase
    .from("marketplace_actividad")
    .select(`
      id,
      created_at,
      usuario,
      fecha_publicacion,
      marketplace_link_publicacion,
      facebook_account_uuid,
      cuenta_fb,
      titulo
    `)
    .order("created_at", { ascending: false });

  // filtros sobre marketplace
  if (fecha) qMP = qMP.eq("fecha_publicacion", fecha);
  if (usuario) qMP = qMP.eq("usuario", usuario);
  // si eligieron un tipo RRSS, NO traemos marketplace
  if (tipo && tipo !== "marketplace") {
    // devolvemos vacío a propósito
    qMP = qMP.limit(0);
  }

  // 3) Ejecutar en paralelo
  const [{ data: rrss, error: e1 }, { data: mp, error: e2 }] = await Promise.all([qRRSS, qMP]);

  if (e1) console.error("RRSS error:", e1);
  if (e2) console.error("Marketplace error:", e2);

  const rrssSafe = Array.isArray(rrss) ? rrss : [];
  const mpSafe = Array.isArray(mp) ? mp : [];

  // 4) Normalizar Marketplace al mismo formato
  const mpNorm = mpSafe.map(x => ({
    origen: "marketplace",
    id: x.id,
    created_at: x.created_at || null,
    fecha: x.fecha_publicacion || null,
    usuario: x.usuario || "-",
    tipo: "marketplace",
    link: x.marketplace_link_publicacion || "-",
    cuenta_id: x.facebook_account_uuid ?? x.cuenta_fb ?? null,
    extra: x.titulo ? `Título: ${x.titulo}` : ""
  }));

  const rrssNorm = rrssSafe.map(x => ({
    origen: "rrss",
    id: x.id,
    created_at: x.created_at || null,
    fecha: x.fecha || null,
    usuario: x.usuario || "-",
    tipo: x.tipo || "-",
    link: x.link || "-",
    cuenta_id: x.cuenta_id ?? null,
    extra: ""
  }));

  // 5) Unir + ordenar por created_at
  const all = [...rrssNorm, ...mpNorm].sort((a, b) => {
    const da = a.created_at ? new Date(a.created_at).getTime() : 0;
    const db = b.created_at ? new Date(b.created_at).getTime() : 0;
    return db - da;
  });

  if (!all.length) {
    tabla.innerHTML = `<tr><td colspan="6">Sin resultados.</td></tr>`;
    return;
  }

  // 6) Mapear cuenta_id -> nombre/email si coincide con cuentas_facebook.id
  const { data: cuentas } = await supabase
    .from("cuentas_facebook")
    .select("id, nombre, email");

  const mapCuentas = new Map((cuentas || []).map(c => [String(c.id), c.nombre || c.email || String(c.id)]));

  // 7) Render tabla
  tabla.innerHTML = "";
  all.forEach(l => {
    const cuentaLabel = l.cuenta_id != null ? (mapCuentas.get(String(l.cuenta_id)) || String(l.cuenta_id)) : "-";
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${l.fecha || "-"}</td>
      <td>${l.usuario}</td>
      <td>${cuentaLabel}</td>
      <td>${l.tipo}</td>
      <td style="max-width:420px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
        ${l.link && l.link !== "-" ? l.link : "-"}
        ${l.extra ? `<div style="opacity:.7; font-size:12px; margin-top:4px;">${escapeHtml(l.extra)}</div>` : ""}
      </td>
      <td>
        ${l.link && l.link !== "-" ? `<a class="btn-link" href="${l.link}" target="_blank" rel="noopener">Abrir</a>` : "-"}
      </td>
    `;
    tabla.appendChild(tr);
  });
}

// Mini escape para no romper la tabla con textos
function escapeHtml(str){
  return String(str ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
