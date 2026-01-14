const SESSION_KEY = "mp_session_v1";

// --- GESTIÓN DE SESIÓN ---
export function setSession(session){ localStorage.setItem(SESSION_KEY, JSON.stringify(session)); }
export function getSession(){
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); }
  catch { return null; }
}
export function clearSession(){ localStorage.removeItem(SESSION_KEY); }

// --- SEGURIDAD: REQUERIR LOGIN ---
export function requireSession(){
  const s = getSession();
  if (!s || !s.usuario || !s.rol){
    // Ajustá la ruta si tu login está en otra carpeta
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

export function fmtDateISO(d = new Date()){
  const pad = (n) => String(n).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
export function nowISO(){ return new Date().toISOString(); }

// --- CARGA DEL SIDEBAR Y LÓGICA DE NAVEGACIÓN ---
export async function loadSidebar({ activeKey, basePath }){
  const host = document.getElementById("sidebar-host");
  if (!host) return;

  const res = await fetch(`${basePath}sidebar.html`, { cache:"no-store" });
  host.innerHTML = await res.text();

  const s = getSession();

  // Marcar enlace activo
  const activeEl = host.querySelector(`[data-nav="${activeKey}"]`);
  if (activeEl) activeEl.classList.add("active");

  // Mostrar usuario y rol
  const uEl = host.querySelector("#sb-usuario");
  const rEl = host.querySelector("#sb-rol");
  if (uEl && s?.usuario) uEl.textContent = s.usuario;
  if (rEl && s?.rol) rEl.textContent = s.rol;

  // 🛡️ Oculta opciones de gerente si el rol es operador
  if (s?.rol !== "gerente"){
    host.querySelectorAll("[data-only='gerente']").forEach(el => el.style.display="none");
  }

  // 🚪 CIERRE DE SESIÓN CON REGISTRO (LOGOUT) - ¡CORREGIDO!
  const btn = host.querySelector("#btn-logout");
  if (btn){
    btn.addEventListener("click", async () => {
      console.log("Cerrando sesión...");

      // 1. REGISTRAR LA SALIDA EN SUPABASE ANTES DE IRSE
      if (s && window.supabaseClient) {
        try {
          // Usamos 'evento' y 'cuenta_fb' que son las columnas que creamos en la DB
          await window.supabaseClient.from("usuarios_actividad").insert([{
            usuario: s.usuario,
            evento: "🔴 LOGOUT (Salió)", 
            cuenta_fb: "Sistema" 
          }]);
        } catch (error) {
          console.error("No se pudo registrar la salida:", error);
        }
      }

      // 2. BORRAR SESIÓN Y REDIRIGIR
      clearSession();
      window.location.replace(`${basePath}login/login.html`);
    });
  }
}

// --- LÓGICA DE CUENTAS FACEBOOK (NO TOCAR) ---
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