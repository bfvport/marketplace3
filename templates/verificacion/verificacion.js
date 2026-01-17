const supabase = window.supabaseClient;

const tabla = document.getElementById("tabla-links");
const filtroFecha = document.getElementById("filtro-fecha");
const filtroUsuario = document.getElementById("filtro-usuario");
const filtroTipo = document.getElementById("filtro-tipo");
const btnFiltrar = document.getElementById("btn-filtrar");

document.addEventListener("DOMContentLoaded", async () => {
  await cargarOperadores();
  await cargarLinks();
  btnFiltrar.addEventListener("click", cargarLinks);
});

async function cargarOperadores(){
  const { data, error } = await supabase
    .from("usuarios")
    .select("usuario, rol")
    .order("usuario", { ascending: true });

  if (error) return console.error(error);

  data
    .filter(u => u.rol !== "gerente")
    .forEach(u => {
      const op = document.createElement("option");
      op.value = u.usuario;
      op.textContent = u.usuario;
      filtroUsuario.appendChild(op);
    });
}

async function cargarLinks(){
  tabla.innerHTML = `<tr><td colspan="5" class="muted">Cargando...</td></tr>`;

  const fecha = filtroFecha.value || null;
  const usuario = filtroUsuario.value || null;
  const tipo = filtroTipo.value || null;

  // 1) RRSS
  let q1 = supabase
    .from("publicaciones_rrss")
    .select(`id, fecha, usuario, tipo, link, cuentas_facebook(nombre)`)
    .order("created_at", { ascending: false });

  if (fecha) q1 = q1.eq("fecha", fecha);
  if (usuario) q1 = q1.eq("usuario", usuario);
  if (tipo && tipo !== "marketplace") q1 = q1.eq("tipo", tipo);

  const { data: rrss, error: e1 } = await q1;
  if (e1) {
    console.error(e1);
    tabla.innerHTML = `<tr><td colspan="5">Error cargando RRSS</td></tr>`;
    return;
  }

  // 2) Marketplace (de calentamiento_actividad)
  // Traemos la fila por fecha + usuario y levantamos cualquier campo "marketplace...link"
  let marketplaceRows = [];
  if (!tipo || tipo === "marketplace") {
    let q2 = supabase
      .from("calentamiento_actividad")
      .select("*")
      .order("created_at", { ascending: false });

    if (fecha) q2 = q2.eq("fecha", fecha);
    if (usuario) q2 = q2.eq("usuario", usuario);

    const { data: ca, error: e2 } = await q2;
    if (e2) console.error(e2);

    (ca || []).forEach(row => {
      // detecta campos link de marketplace
      Object.keys(row).forEach(k => {
        const key = k.toLowerCase();
        const val = row[k];
        if (val && typeof val === "string" && key.includes("marketplace") && key.includes("link")) {
          marketplaceRows.push({
            fecha: row.fecha || fecha || "-",
            usuario: row.usuario || "-",
            cuenta: row.cuenta_fb || row.cuenta_id || "-",
            tipo: "marketplace",
            link: val
          });
        }
      });
    });
  }

  // unificamos
  const unified = [
    ...(rrss || []).map(l => ({
      fecha: l.fecha || "-",
      usuario: l.usuario || "-",
      cuenta: l.cuentas_facebook?.nombre || "-",
      tipo: l.tipo || "-",
      link: l.link || ""
    })),
    ...marketplaceRows
  ];

  if (!unified.length){
    tabla.innerHTML = `<tr><td colspan="5" class="muted">Sin resultados.</td></tr>`;
    return;
  }

  tabla.innerHTML = "";
  unified.forEach(l => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${l.fecha}</td>
      <td>${l.usuario}</td>
      <td>${l.cuenta}</td>
      <td>${l.tipo}</td>
      <td>
        ${l.link ? `<a class="btn-sm" href="${l.link}" target="_blank" rel="noopener">Abrir</a>` : "-"}
      </td>
    `;
    tabla.appendChild(tr);
  });
}
