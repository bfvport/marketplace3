const sb = window.supabaseClient;

const host = document.getElementById("host");
const fFecha = document.getElementById("f-fecha");
const fOperador = document.getElementById("f-operador");
const fTipo = document.getElementById("f-tipo");
const btnAplicar = document.getElementById("btn-aplicar");

const btnPrev = document.getElementById("btn-prev");
const btnNext = document.getElementById("btn-next");
const lblPage = document.getElementById("lbl-page");

const PAGE_SIZE = 120; // links por página (ajustable)
let page = 0;

// ✅ Guard: operador no entra
function getSessionSafe(){
  try { return JSON.parse(localStorage.getItem("mp_session_v1") || "null"); }
  catch { return null; }
}

const sess = getSessionSafe();
if (!sess || sess.rol !== "gerente"){
  alert("Acceso solo gerente.");
  window.location.href = "./publicaciones.html";
}

init();

async function init(){
  // fecha default: hoy
  const now = new Date();
  const iso = now.toISOString().slice(0,10);
  fFecha.value = iso;

  await cargarOperadores();

  btnAplicar.addEventListener("click", () => { page = 0; cargar(); });
  btnPrev.addEventListener("click", () => { if (page > 0){ page--; cargar(); }});
  btnNext.addEventListener("click", () => { page++; cargar(); });

  cargar();
}

async function cargarOperadores(){
  const { data, error } = await sb.from("usuarios").select("usuario, rol").order("usuario", { ascending:true });
  if (error) return;

  const ops = (data || []).filter(u => u.rol === "operador");
  fOperador.innerHTML = `<option value="">Todos los operadores</option>` +
    ops.map(o => `<option value="${o.usuario}">${o.usuario}</option>`).join("");
}

async function cargar(){
  host.innerHTML = `<div class="card"><div class="muted">Cargando...</div></div>`;
  lblPage.textContent = `Página ${page + 1}`;

  let q = sb
    .from("publicaciones_rrss")
    .select("id, created_at, fecha, usuario, cuenta_id, tipo, link, cuentas_facebook(email)")
    .eq("fecha", fFecha.value)
    .order("created_at", { ascending:false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

  if (fOperador.value) q = q.eq("usuario", fOperador.value);
  if (fTipo.value) q = q.eq("tipo", fTipo.value);

  const { data, error } = await q;

  if (error){
    host.innerHTML = `<div class="card"><div class="muted">Error: ${error.message}</div></div>`;
    return;
  }
  if (!data || !data.length){
    host.innerHTML = `<div class="card"><div class="muted">Sin resultados.</div></div>`;
    return;
  }

  // Agrupar: operador -> cuenta(email) -> tipo -> links
  const grouped = {};
  for (const r of data){
    const op = r.usuario || "-";
    const cuenta = r.cuentas_facebook?.email || `#${r.cuenta_id}`;
    const tipo = r.tipo || "-";

    grouped[op] ??= {};
    grouped[op][cuenta] ??= {};
    grouped[op][cuenta][tipo] ??= [];
    grouped[op][cuenta][tipo].push(r);
  }

  host.innerHTML = renderGrouped(grouped);
}

function renderGrouped(grouped){
  const ops = Object.keys(grouped).sort();
  return ops.map(op => {
    const cuentas = grouped[op];
    const cuentasKeys = Object.keys(cuentas).sort();

    const opCount = cuentasKeys.reduce((acc, ck) => {
      const tipos = cuentas[ck];
      return acc + Object.keys(tipos).reduce((a2, tk) => a2 + tipos[tk].length, 0);
    }, 0);

    return `
      <details open>
        <summary>${op} <span class="chip">links: ${opCount}</span></summary>
        <div class="sub">Cuentas asignadas / usadas hoy</div>

        ${cuentasKeys.map(ck => renderCuenta(ck, cuentas[ck])).join("")}
      </details>
    `;
  }).join("");
}

function renderCuenta(cuentaLabel, tiposObj){
  const tipos = Object.keys(tiposObj).sort();
  const total = tipos.reduce((acc, t) => acc + tiposObj[t].length, 0);

  return `
    <details style="margin-top:10px;">
      <summary>${cuentaLabel} <span class="chip">links: ${total}</span></summary>

      ${tipos.map(t => renderTipo(t, tiposObj[t])).join("")}
    </details>
  `;
}

function renderTipo(tipo, rows){
  const nice = {
    historias:"Historias",
    reels:"Reels",
    muro:"Muro",
    grupos:"Grupos"
  }[tipo] || tipo;

  return `
    <details style="margin-top:10px;">
      <summary>${nice} <span class="chip">links: ${rows.length}</span></summary>
      <div class="list">
        ${rows.slice(0, 50).map(r => {
          const hhmm = new Date(r.created_at).toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"});
          return `
            <div class="row">
              <div>
                <div class="cap">${hhmm} — ${r.link}</div>
              </div>
              <a class="btn-open" href="${r.link}" target="_blank" rel="noopener">Abrir</a>
            </div>
          `;
        }).join("")}
        ${rows.length > 50 ? `<div class="muted">Mostrando 50. Usá filtros/paginado para ver más.</div>` : ""}
      </div>
    </details>
  `;
}
