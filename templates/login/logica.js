import { setSession, getSession } from "../../assets/js/app.js";

const sb = window.supabaseClient;
const $ = (id) => document.getElementById(id);
const msg = (t) => ($("msg").textContent = t || "");

// Si ya está logueado, mandar al dashboard
const existing = getSession();
if (existing?.usuario) window.location.href = "../dashboard/dashboard.html";

async function login(){
    msg("⏳ Verificando...");
    const usuario = $("usuario").value.trim();
    const contra = $("contra").value;

    if (!usuario || !contra) return msg("Falta datos.");

    // 1. Verificar Usuario
    const { data, error } = await sb
        .from("usuarios")
        .select("id, usuario, rol")
        .eq("usuario", usuario)
        .eq("contra", contra)
        .limit(1);

    if (error || !data || data.length === 0) return msg("Datos incorrectos.");

    const u = data[0];

    // 2. REGISTRAR EL LOGIN (Aquí estaba el error antes)
    // Ahora enviamos explícitamente a la columna 'evento'
    await sb.from("usuarios_actividad").insert([{
        usuario: u.usuario,
        evento: "🟢 LOGIN",  // Esto es lo que salía undefined
        cuenta_fb: "Sistema Web",
        // created_at se genera solo
    }]);

    // 3. Guardar sesión y entrar
    setSession({ usuario: u.usuario, rol: u.rol, user_id: u.id });
    window.location.href = "../dashboard/dashboard.html";
}

$("btnLogin").addEventListener("click", login);
document.addEventListener("keydown", (e) => { if (e.key === "Enter") login(); });