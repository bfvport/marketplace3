// assets/app.js

const SESSION_KEY = "mp_session_v1";

function setSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function getSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function requireSession() {
  const s = getSession();
  if (!s || !s.usuario || !s.rol) {
    window.location.href = "login.html";
    return null;
  }
  return s;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function loadSidebar(activeKey) {
  const host = document.getElementById("sidebar-host");
  if (!host) return;

  const res = await fetch("sidebar.html", { cache: "no-store" });
  host.innerHTML = await res.text();

  // Set active
  const activeEl = host.querySelector(`[data-nav="${activeKey}"]`);
  if (activeEl) activeEl.classList.add("active");

  // Fill user info
  const s = getSession();
  const uEl = host.querySelector("#sb-usuario");
  const rEl = host.querySelector("#sb-rol");
  if (uEl && s?.usuario) uEl.textContent = s.usuario;
  if (rEl && s?.rol) rEl.textContent = s.rol;

  // Logout
  const btn = host.querySelector("#btn-logout");
  if (btn) {
    btn.addEventListener("click", () => {
      clearSession();
      window.location.href = "login.html";
    });
  }

  // Role-based visibility (simple)
  if (s?.rol !== "gerente") {
    const onlyGerente = host.querySelectorAll("[data-only='gerente']");
    onlyGerente.forEach(el => el.style.display = "none");
  }
}

function fmtDateISO(d = new Date()) {
  // yyyy-mm-dd en hora local
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function nowISO() {
  return new Date().toISOString();
}

// Selecciona una cuenta disponible. Podés mejorar con reglas por "calidad".
async function takeFacebookAccountFor(usuario) {
  const sb = window.supabaseClient;

  // 1) Trae una disponible
  const { data: acc, error: e1 } = await sb
    .from("cuentas_facebook")
    .select("id,email,nombre,estado,calidad,ocupada_por")
    .eq("estado", "disponible")
    .is("ocupada_por", null)
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (e1) throw new Error(e1.message);
  if (!acc) return { ok: false, reason: "No hay cuentas disponibles." };

  // 2) La marca ocupada
  const { error: e2 } = await sb
    .from("cuentas_facebook")
    .update({
      estado: "ocupada",
      ocupada_por: usuario,
      updated_at: nowISO()
    })
    .eq("id", acc.id);

  if (e2) throw new Error(e2.message);

  return { ok: true, account: acc };
}
