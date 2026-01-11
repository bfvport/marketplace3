import { setSession, getSession } from "../../assets/js/app.js";

const sb = window.supabaseClient;
const $ = (id) => document.getElementById(id);
const msg = (t) => ($("msg").textContent = t || "");

const existing = getSession();
if (existing?.usuario) window.location.href = "../dashboard/dashboard.html";

async function login(){
  msg("Logueando...");
  const usuario = $("usuario").value.trim();
  const contra = $("contra").value;

  if (!usuario || !contra) return msg("Falta usuario o contraseña.");

  const { data, error } = await sb
    .from("usuarios")
    .select("id, usuario, rol")
    .eq("usuario", usuario)
    .eq("contra", contra)
    .limit(1);

  if (error) return msg("Error DB: " + error.message);
  if (!data || data.length === 0) return msg("Usuario o contraseña incorrectos.");

  const u = data[0];
  setSession({ usuario: u.usuario, rol: u.rol, user_id: u.id });
  window.location.href = "../dashboard/dashboard.html";
}

$("btnLogin").addEventListener("click", login);
document.addEventListener("keydown", (e) => { if (e.key === "Enter") login(); });
