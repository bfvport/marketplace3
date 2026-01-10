// ================================================
// CONFIGURACIÓN Y DEPURACIÓN
// ================================================
console.log('🚀 app.js INICIANDO...');

// Configuración de Supabase
const supabaseUrl = 'https://uriqltengefxiijgonih.supabase.co';
const supabaseKey = 'sb_publishable_lHmMGjQnXl0Bm4FOF5YV5w_jQN_lNRP';

console.log('🔗 URL:', supabaseUrl);
console.log('🔑 Key:', supabaseKey ? 'PRESENTE' : 'FALTANTE');

// ================================================
// IMPORTANTE: NO CREES UNA NUEVA VARIABLE 'supabase'
// ================================================

// En lugar de esto (❌ MAL):
// const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

// Usa esto (✅ BIEN):
const client = window.supabase.createClient(supabaseUrl, supabaseKey);
console.log('✅ Cliente Supabase inicializado:', !!client);

// ================================================
// CUANDO EL DOM ESTÉ LISTO
// ================================================
document.addEventListener('DOMContentLoaded', function() {
    console.log('📄 DOM completamente cargado');
    
    // Verificar si estamos en login o dashboard
    if (window.location.pathname.includes('dashboard.html')) {
        console.log('🏠 Estamos en DASHBOARD');
        checkLoginStatus();
        setupLogoutButton();
    } else {
        console.log('🔐 Estamos en LOGIN');
        setupLoginForm();
    }
});

// ================================================
// CONFIGURAR FORMULARIO DE LOGIN
// ================================================
function setupLoginForm() {
    console.log('🔧 Configurando formulario de login...');
    
    const loginForm = document.getElementById('loginForm');
    const messageDiv = document.getElementById('message');
    
    console.log('🔍 Formulario encontrado:', !!loginForm);
    console.log('💬 Div de mensaje encontrado:', !!messageDiv);
    
    if (!loginForm) {
        console.error('❌ NO SE ENCONTRÓ EL FORMULARIO');
        return;
    }
    
    // Agregar listener
    loginForm.addEventListener('submit', async function(e) {
        console.log('🎯 EVENTO SUBMIT DETECTADO');
        e.preventDefault();
        console.log('✅ Formulario prevenido');
        
        const usuario = document.getElementById('usuario').value.trim();
        const contra = document.getElementById('contra').value;
        
        console.log('📝 Datos:', { usuario, contra });
        
        if (!usuario || !contra) {
            showMessage('Por favor, completa todos los campos', 'error');
            return;
        }
        
        // Mostrar carga
        const submitBtn = loginForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...';
        submitBtn.disabled = true;
        
        try {
            console.log('🔗 Consultando Supabase...');
            
            // IMPORTANTE: Usar 'client' en lugar de 'supabase'
            const { data, error } = await client
                .from('usuarios')
                .select('*')
                .eq('usuario', usuario)
                .eq('contra', contra);
            
            console.log('📊 Respuesta:', { data, error });
            
            if (error) {
                console.error('❌ Error:', error);
                showMessage('Error: ' + error.message, 'error');
                return;
            }
            
            if (data && data.length > 0) {
                console.log('✅ LOGIN EXITOSO!');
                showMessage('¡Login exitoso! Redirigiendo...', 'success');
                
                localStorage.setItem('loggedInUser', JSON.stringify({
                    usuario: data[0].usuario,
                    loginTime: new Date().toISOString()
                }));
                
                setTimeout(() => {
                    window.location.href = 'dashboard.html';
                }, 1500);
                
            } else {
                console.log('❌ Credenciales incorrectas');
                showMessage('Usuario o contraseña incorrectos', 'error');
            }
            
        } catch (error) {
            console.error('🔥 Error crítico:', error);
            showMessage('Error inesperado', 'error');
        } finally {
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    });
}

// ================================================
// CONFIGURAR BOTÓN DE LOGOUT
// ================================================
function setupLogoutButton() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            localStorage.removeItem('loggedInUser');
            window.location.href = 'index.html';
        });
    }
}

// ================================================
// VERIFICAR ESTADO DE LOGIN
// ================================================
function checkLoginStatus() {
    const userData = localStorage.getItem('loggedInUser');
    
    if (!userData) {
        window.location.href = 'index.html';
        return;
    }
    
    try {
        const user = JSON.parse(userData);
        const userDisplay = document.getElementById('userDisplay');
        const loginTimeDisplay = document.getElementById('loginTimeDisplay');
        
        if (userDisplay) userDisplay.textContent = user.usuario;
        if (loginTimeDisplay && user.loginTime) {
            const loginDate = new Date(user.loginTime);
            loginTimeDisplay.textContent = loginDate.toLocaleString('es-ES');
        }
    } catch (error) {
        window.location.href = 'index.html';
    }
}

// ================================================
// FUNCIÓN PARA MOSTRAR MENSAJES
// ================================================
function showMessage(text, type) {
    const messageDiv = document.getElementById('message');
    if (messageDiv) {
        messageDiv.textContent = text;
        messageDiv.className = `message ${type}`;
        messageDiv.style.display = 'block';
    }
}