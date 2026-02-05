import { requireSession, loadSidebar, fmtDateISO } from "../../assets/js/app.js";

const sb = window.supabaseClient;
const s = requireSession();

const DRIVE_URL =
  "https://drive.google.com/drive/folders/1WEKYsaptpUnGCKOszZOKEAovzL5ld7j7?usp=sharing";
const today = fmtDateISO(new Date());

const TYPES = [
  { key: "historias", title: "Historias" },
  { key: "reels", title: "Reels" },
  { key: "muro", title: "Muro" },
  { key: "grupos", title: "Grupos" },
];

const $ = (id) => document.getElementById(id);

let selectedUsuario = null;
let cuentas = [];
let metas = { historias: 0, reels: 0, muro: 0, grupos: 0 };
let linksHoy = [];
let rtChannel = null;

function showError(msg) {
  const box = $("errorbox");
  if (!box) return;
  box.style.display = "block";
  box.textContent = msg;
}
function clearError() {
  const box = $("errorbox");
  if (!box) return;
  box.style.display = "none";
  box.textContent = "";
}
function isValidUrl(u) {
  try {
    const url = new URL(u);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function cuentaById(cuentaId) {
  return (cuentas || []).find((x) => String(x.id) === String(cuentaId)) || null;
}

function cuentaLabel(cuentaId) {
  const c = cuentaById(cuentaId);
  return c?.email || `#${cuentaId}`;
}

async function init() {
  await loadSidebar({ activeKey: "publicaciones", basePath: "../" });

  $("pill-hoy").textContent = `Hoy: ${today}`;
  $("pill-rol").textContent = `Rol: ${s.rol || "-"}`;
  $("btn-drive").href = DRIVE_URL;

  if (s.rol === "gerente") {
    $("wrap-operador").style.display = "block";
    await cargarOperadoresEnSelect();
    selectedUsuario = $("sel-operador").value || null;

    $("sel-operador").addEventListener("change", async () => {
      selectedUsuario = $("sel-operador").value;
      await refreshAll(true);
      attachRealtime();
    });
  } else {
    selectedUsuario = s.usuario;
  }

  $("btn-refresh").addEventListener("click", async () => {
    await refreshAll(false);
    refreshAllViews();
  });

  await refreshAll(true);
  attachRealtime();
}

async function cargarOperadoresEnSelect() {
  const { data, error } = await sb
    .from("usuarios")
    .select("usuario, rol")
    .order("usuario", { ascending: true });

  if (error) throw error;

  const ops = (data || []).filter((x) => x.rol === "operador");
  const sel = $("sel-operador");
  sel.innerHTML = ops
    .map((o) => `<option value="${o.usuario}">${o.usuario}</option>`)
    .join("");

  if (ops.length) sel.value = ops[0].usuario;
}

async function refreshAll(rerender) {
  clearError();

  try {
    // 1) Cuentas asignadas al operador
    const resCuentas = await sb
      .from("cuentas_facebook")
      .select("id, email, ocupada_por")
      .eq("ocupada_por", selectedUsuario)
      .order("id", { ascending: true });

    if (resCuentas.error) throw resCuentas.error;
    cuentas = resCuentas.data || [];

    // 2) Metas del día (usuarios_asignado) - incluye reels_daily
    const resAsign = await sb
      .from("usuarios_asignado")
      .select("historia_daily, reels_daily, muro_daily, grupos_daily, fecha_desde, fecha_hasta")
      .eq("usuario", selectedUsuario)
      .lte("fecha_desde", today)
      .gte("fecha_hasta", today);

    if (resAsign.error) throw resAsign.error;

    metas = { historias: 0, reels: 0, muro: 0, grupos: 0 };
    for (const a of resAsign.data || []) {
      metas.historias += Number(a.historia_daily || 0);
      metas.reels += Number(a.reels_daily || 0);
      metas.muro += Number(a.muro_daily || 0);
      metas.grupos += Number(a.grupos_daily || 0);
    }

    // 3) Links guardados hoy
    const resLinks = await sb
      .from("publicaciones_rrss")
      .select("id, created_at, fecha, usuario, cuenta_id, cuenta_fb, tipo, link")
      .eq("fecha", today)
      .eq("usuario", selectedUsuario)
      .order("created_at", { ascending: false });

    if (resLinks.error) throw resLinks.error;
    linksHoy = resLinks.data || [];

    if (rerender) renderCards();
    refreshAllViews();
  } catch (e) {
    console.error(e);
    showError(`Error cargando Recursos: ${e?.message || e}`);
    if (rerender) renderCards(true);
  }
}

function renderCards(forceEmpty = false) {
  const host = $("cards-recursos");
  if (!host) return;

  const opLabel =
    s.rol === "gerente"
      ? `Operador: ${selectedUsuario || "-"} (lectura)`
      : `Operador: ${selectedUsuario || "-"}`;

  host.innerHTML = TYPES.map((t) => {
    const meta = metas[t.key] || 0;
    const done = forceEmpty ? 0 : linksHoy.filter((x) => x.tipo === t.key).length;
    const pend = Math.max(0, meta - done);

    return `
      <div class="card" id="card-${t.key}">
        <div class="card-top">
          <div>
            <h3>${t.title}</h3>
            <div class="muted">${opLabel}</div>
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end;">
            <span class="badge">Pend. <strong id="pend-${t.key}">${pend}</strong></span>
            <span class="badge"><strong id="done-${t.key}">${done}</strong> / <span id="meta-${t.key}">${meta}</span></span>
          </div>
        </div>

        <div class="row">
          <div class="w-40">
            <select id="sel-${t.key}">
              <option value="">Seleccionar cuenta</option>
              ${(cuentas || [])
                .map((c) => `<option value="${c.id}">${c.email}</option>`)
                .join("")}
            </select>
          </div>
          <div class="w-60">
            <input id="in-${t.key}" placeholder="Pegá el link acá..." />
          </div>
        </div>

        <div class="actions">
          <button class="btn btn-primary" id="btn-${t.key}">Guardar link</button>
        </div>

        <div class="list" id="list-${t.key}"></div>
      </div>
    `;
  }).join("");

  for (const t of TYPES) {
    $(`btn-${t.key}`)?.addEventListener("click", () => guardarLink(t.key));
  }
}

function refreshAllViews() {
  for (const t of TYPES) {
    updateTipoUI(t.key);
    updateTipoTable(t.key);
  }
}

function updateTipoUI(tipo) {
  const meta = metas[tipo] || 0;
  const done = linksHoy.filter((x) => x.tipo === tipo).length;
  const pend = Math.max(0, meta - done);

  $(`done-${tipo}`) && ($(`done-${tipo}`).textContent = done);
  $(`meta-${tipo}`) && ($(`meta-${tipo}`).textContent = meta);
  $(`pend-${tipo}`) && ($(`pend-${tipo}`).textContent = pend);

  const list = $(`list-${tipo}`);
  if (!list) return;

  const rows = linksHoy.filter((x) => x.tipo === tipo).slice(0, 8);
  if (!rows.length) {
    list.innerHTML = `<div class="muted">Todavía no hay links cargados hoy.</div>`;
    return;
  }

  list.innerHTML = rows
    .map((r) => {
      const hhmm = new Date(r.created_at).toLocaleTimeString("es-AR", {
        hour: "2-digit",
        minute: "2-digit",
      });

      const safeLink = encodeURIComponent(r.link || "");

      return `
        <div class="item" style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <div class="muted">${hhmm}</div>
            <a href="${r.link}" target="_blank" rel="noopener">Ver link</a>
          </div>
          <button
            type="button"
            class="btn-copy"
            data-link="${safeLink}"
            style="padding:6px 10px; border-radius:8px; border:1px solid rgba(255,255,255,.12); background:rgba(255,255,255,.04); color:#e2e8f0; cursor:pointer;">
            Copiar
          </button>
        </div>
      `;
    })
    .join("");

  wireCopyButtons(list);
}

function updateTipoTable(tipo) {
  const body = $(`tbl-${tipo}`);
  if (!body) return;

  const rows = linksHoy.filter((x) => x.tipo === tipo).slice(0, 60);
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="4" class="muted">Sin links hoy.</td></tr>`;
    return;
  }

  body.innerHTML = rows
    .map((r) => {
      const hhmm = new Date(r.created_at).toLocaleTimeString("es-AR", {
        hour: "2-digit",
        minute: "2-digit",
      });

      const cuentaTxt = r.cuenta_id ? cuentaLabel(r.cuenta_id) : (r.cuenta_fb || "-");
      const safeLink = encodeURIComponent(r.link || "");

      return `
        <tr>
          <td>${hhmm}</td>
          <td class="cap">${cuentaTxt}</td>
          <td>
            <a class="btn-open" href="${r.link}" target="_blank" rel="noopener">Abrir</a>
          </td>
          <td style="text-align:right;">
            <button
              type="button"
              class="btn-copy"
              data-link="${safeLink}"
              style="padding:6px 10px; border-radius:8px; border:1px solid rgba(255,255,255,.12); background:rgba(255,255,255,.04); color:#e2e8f0; cursor:pointer;">
              Copiar
            </button>
          </td>
        </tr>
      `;
    })
    .join("");

  wireCopyButtons(body);
}

async function guardarLink(tipo) {
  clearError();

  const select = document.getElementById(`sel-${tipo}`);
  const cuentaIdRaw = select?.value || "";
  const cuentaId = Number(cuentaIdRaw || 0);

  const input = document.getElementById(`in-${tipo}`);
  const link = (input?.value || "").trim();

  if (!cuentaId) return showError("Seleccioná una cuenta antes de guardar.");
  if (!link || !isValidUrl(link)) return showError("Pegá un link válido (http/https).");
  if (s.rol === "gerente") return showError("Modo gerente es solo lectura.");

  // EMAIL DIRECTO DEL SELECT (blindado)
  const cuentaFb = select.options[select.selectedIndex].text.trim();
  if (!cuentaFb) return showError("No se pudo obtener el email de la cuenta.");

  const { data, error } = await sb
    .from("publicaciones_rrss")
    .insert([
      {
        fecha: today,
        usuario: selectedUsuario,
        cuenta_id: cuentaId,
        cuenta_fb: cuentaFb,
        tipo,
        link,
      },
    ])
    .select()
    .single();

  if (error) return showError(`No se pudo guardar: ${error.message}`);

  input.value = "";

  if (!linksHoy.some((x) => x.id === data.id)) {
    linksHoy.unshift(data);
  }

  updateTipoUI(tipo);
  updateTipoTable(tipo);
}

function wireCopyButtons(rootEl) {
  const btns = rootEl.querySelectorAll?.(".btn-copy") || [];
  btns.forEach((b) => {
    b.addEventListener("click", async () => {
      const link = decodeURIComponent(b.dataset.link || "");
      if (!link) return;

      try {
        await navigator.clipboard.writeText(link);
        const old = b.textContent;
        b.textContent = "Copiado ✅";
        setTimeout(() => (b.textContent = old), 900);
      } catch {
        // fallback
        const ta = document.createElement("textarea");
        ta.value = link;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);

        const old = b.textContent;
        b.textContent = "Copiado ✅";
        setTimeout(() => (b.textContent = old), 900);
      }
    });
  });
}

function attachRealtime() {
  if (rtChannel) {
    try {
      sb.removeChannel(rtChannel);
    } catch {}
    rtChannel = null;
  }

  rtChannel = sb
    .channel("rt-publicaciones-rrss")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "publicaciones_rrss" },
      (payload) => {
        const n = payload.new;
        if (n?.fecha !== today) return;
        if (n?.usuario !== selectedUsuario) return;
        if (linksHoy.some((x) => x.id === n.id)) return;

        linksHoy.unshift(n);
        updateTipoUI(n.tipo);
        updateTipoTable(n.tipo);
      }
    )
    .subscribe();
}

init();
