import { getSession, loadSidebar, escapeHtml } from "../../assets/js/app.js";

const $ = q => document.querySelector(q);
const session = getSession();
const sb = window.supabaseClient;

const isGerente = session?.rol === "gerente" || session?.rol === "admin";

function log(msg){
  const el = $("#log");
  if(el) el.innerHTML += msg + "<br>";
}

function showByRole(){
  document.querySelectorAll(".only-gerente").forEach(el => el.style.display = isGerente ? "" : "none");
  document.querySelectorAll(".only-operador").forEach(el => el.style.display = isGerente ? "none" : "");
}

async function cargarOperadores(){
  const { data } = await sb.from("usuarios").select("usuario, rol");
  const sel = $("#selOperador");
  sel.innerHTML = "";
  data.filter(u=>u.rol==="operador").forEach(u=>{
    const o=document.createElement("option");
    o.value=u.usuario; o.textContent=u.usuario;
    sel.appendChild(o);
  });
}

async function cargarCuentas(){
  const { data } = await sb.from("cuentas").select("*").order("id");
  const tbody = $("#tbodyCuentas");
  tbody.innerHTML = "";

  data.forEach(c=>{
    const tr=document.createElement("tr");
    tr.innerHTML=`
      <td class="mono">${c.id}</td>
      <td><span class="pill">${c.plataforma}</span></td>
      <td><b>${escapeHtml(c.nombre_visible)}</b></td>
      <td class="mono">${escapeHtml(c.usuario_handle||"-")}</td>
      <td>${c.activo?"✅":"⛔"}</td>
      <td class="actions">
        <button class="btn2" data-edit="${c.id}">Editar</button>
      </td>`;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("[data-edit]").forEach(btn=>{
    btn.onclick=async()=>{
      const id=btn.dataset.edit;
      const { data } = await sb.from("cuentas").select("*").eq("id",id).single();
      $("#cuenta_id").value=data.id;
      $("#plataforma").value=data.plataforma;
      $("#nombre_visible").value=data.nombre_visible;
      $("#usuario_handle").value=data.usuario_handle||"";
      $("#url").value=data.url||"";
      $("#activo").value=String(data.activo);
    };
  });

  // select asignar
  const sel=$("#selCuenta");
  sel.innerHTML="";
  data.filter(c=>c.activo).forEach(c=>{
    const o=document.createElement("option");
    o.value=c.id;
    o.textContent=`${c.plataforma.toUpperCase()} - ${c.nombre_visible}`;
    sel.appendChild(o);
  });
}

async function guardarCuenta(){
  const payload={
    plataforma: $("#plataforma").value,
    nombre_visible: $("#nombre_visible").value,
    usuario_handle: $("#usuario_handle").value||null,
    url: $("#url").value||null,
    activo: $("#activo").value==="true"
  };

  const id=$("#cuenta_id").value;
  if(id){
    await sb.from("cuentas").update(payload).eq("id",id);
    log("✏️ Cuenta actualizada");
  }else{
    await sb.from("cuentas").insert([payload]);
    log("✅ Cuenta creada");
  }
  $("#cuenta_id").value="";
  await cargarCuentas();
}

async function asignarCuenta(){
  const usuario=$("#selOperador").value;
  const cuenta_id=$("#selCuenta").value;
  await sb.from("cuentas_asignadas").insert([{usuario,cuenta_id}]);
  log("📌 Cuenta asignada");
}

async function cargarMisCuentas(){
  const { data } = await sb
    .from("cuentas_asignadas")
    .select("cuentas(plataforma,nombre_visible,usuario_handle)")
    .eq("usuario", session.usuario);

  const tbody=$("#tbodyMisCuentas");
  tbody.innerHTML="";
  data.forEach(r=>{
    const c=r.cuentas;
    const tr=document.createElement("tr");
    tr.innerHTML=`
      <td><span class="pill">${c.plataforma}</span></td>
      <td><b>${escapeHtml(c.nombre_visible)}</b></td>
      <td class="mono">${escapeHtml(c.usuario_handle||"-")}</td>`;
    tbody.appendChild(tr);
  });
}

document.addEventListener("DOMContentLoaded", async ()=>{
  await loadSidebar({ activeKey:"cuentas", basePath:"../" });
  showByRole();

  if(isGerente){
    await cargarOperadores();
    await cargarCuentas();
    $("#btnGuardar").onclick=guardarCuenta;
    $("#btnNuevo").onclick=()=>$("#cuenta_id").value="";
    $("#btnAsignar").onclick=asignarCuenta;
  }else{
    await cargarMisCuentas();
  }
});
