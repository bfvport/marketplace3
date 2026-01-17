const SESSION_KEY = "mp_session_v1";

// --- SESIÓN ---
export function setSession(session){ localStorage.setItem(SESSION_KEY, JSON.stringify(session)); }
export function getSession(){
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); }
  catch { return null; }
}
export function clearSession(){ localStorage.removeItem(SESSION_KEY); }

// --- SEGURIDAD ---
export function requireSession(){
  const s = getSession();
  if (!s || !s.usuario || !s.rol){
    window.location.href = "/templates/login/login.html";
    return null;
  }
  return s;
}

// --- UTILIDADES ---
export function escapeHtml(str){
  return String(str ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
export function nowISO(){ return new Date().toISOString(); }

// --- CUENTAS FB (NO TOCAR) ---
export async function takeFacebookAccountFor(usuario){
  const sb = window.supabaseClient;

  const { data: acc, error: e1 } = await sb
    .from("cuentas_facebook")
    .select("id,email,nombre,estado,calidad,ocupada_por")
    .eq("estado","disponible")
    .is("ocupada_por", null)
    .order("id", { ascending:true })
    .limit(1)
    .maybeSingle();

  if (e1) throw new Error(e1.message);
  if (!acc) return { ok:false, reason:"No hay cuentas disponibles." };

  const { error: e2 } = await sb
    .from("cuentas_facebook")
    .update({ estado:"ocupada", ocupada_por: usuario, updated_at: nowISO() })
    .eq("id", acc.id);

  if (e2) throw new Error(e2.message);

  return { ok:true, account: acc };
}

// =========================
// SIDEBAR UNIVERSAL ÚNICO
// =========================

function sidebarMarkActive(host){
  const path = location.pathname;
  host.querySelectorAll(".nav a[data-nav]").forEach(a => {
    a.classList.remove("active");
    const href = a.getAttribute("href") || "";
    const folder = href.split("/").filter(Boolean).slice(-2, -1)[0]; // dashboard, diario, etc
    if (folder && path.includes(`/${folder}/`)) a.classList.add("active");
  });
}

function sidebarApplyRole(host, s){
  // usuario / rol
  const uEl = host.querySelector("#sb-usuario");
  const rEl = host.querySelector("#sb-rol");
  if (uEl) uEl.textContent = s.usuario;
  if (rEl) rEl.textContent = s.rol;

  // gerente-only
  if (s.rol !== "gerente"){
    host.querySelectorAll("[data-only='gerente']").forEach(el => el.style.display = "none");
  } else {
    host.querySelectorAll("[data-only='gerente']").forEach(el => el.style.display = "");
  }
}

function sidebarInitToggle(){
  const btn = document.getElementById("sb-toggle");
  const icon = document.getElementById("sb-toggle-icon");
  if (!btn) return;

  const saved = localStorage.getItem("sb_collapsed") === "1";
  document.body.classList.toggle("sb-collapsed", saved);
  if (icon) icon.textContent = saved ? "▶" : "◀";

  // evitar doble listener si se ejecuta más de una vez
  if (btn.dataset.bound === "1") return;
  btn.dataset.bound = "1";

  btn.addEventListener("click", () => {
    const isCollapsed = document.body.classList.toggle("sb-collapsed");
    localStorage.setItem("sb_collapsed", isCollapsed ? "1" : "0");
    if (icon) icon.textContent = isCollapsed ? "▶" : "◀";
  });
}

async function sidebarLoadHTML(){
  // asegurar host
  let host = document.getElementById("sidebar-host");
  if (!host){
    host = document.createElement("div");
    host.id = "sidebar-host";
    document.body.prepend(host);
  }

  // si ya está cargado, no recargar
  if (host.dataset.loaded === "1") return host;

  const res = await fetch("/templates/sidebar.html", { cache:"no-store" });
  if (!res.ok){
    console.error("No se pudo cargar /templates/sidebar.html", res.status);
    return host;
  }
  host.innerHTML = await res.text();
  host.dataset.loaded = "1";
  return host;
}

export async function bootSidebar(){
  // evita que se ejecute 2 veces en la misma página
  if (window.__mp_sidebar_booted) return;
  window.__mp_sidebar_booted = true;

  const s = getSession();
  if (!s || !s.usuario || !s.rol) return;

  const host = await sidebarLoadHTML();
  sidebarApplyRole(host, s);
  sidebarMarkActive(host);
  sidebarInitToggle();

  // logout
  const btn = host.querySelector("#btn-logout");
  if (btn && btn.dataset.bound !== "1"){
    btn.dataset.bound = "1";
    btn.addEventListener("click", async () => {
      try {
        if (window.supabaseClient){
          await window.supabaseClient.from("usuarios_actividad").insert([{
            usuario: s.usuario,
            evento: "🔴 LOGOUT (Salió)",
            cuenta_fb: "Sistema"
          }]);
        }
      } catch (e) {
        console.warn("Logout log falló:", e);
      }
      clearSession();
      location.replace("/templates/login/login.html");
    });
  }
}

// auto-run
document.addEventListener("DOMContentLoaded", () => {
  bootSidebar();
});
