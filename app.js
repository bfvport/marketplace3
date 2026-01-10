// Configuración de Supabase - REEMPLAZA ESTOS VALORES
const supabaseUrl = 'https://uriqltengefxiijgonih.supabase.co'; // Cambia esto por tu URL
const supabaseKey = 'sb_publishable_lHmMGjQnXl0Bm4FOF5YV5w_jQN_lNRP'; // Cambia esto por tu clave

// Inicializar Supabase
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

// Cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    const messageDiv = document.getElementById('message');
    
    if (loginForm) {
        // Manejar el envío del formulario de login
        loginForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const usuario = document.getElementById('usuario').value;
            const contra = document.getElementById('contra').value;
            
            // Limpiar mensajes anteriores
            messageDiv.className = 'message';
            messageDiv.textContent = '';
            messageDiv.style.display = 'none';
            
            // Validar que los campos no estén vacíos
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
                // Buscar usuario en Supabase
                const { data, error } = await supabase
                    .from('usuarios')
                    .select('*')
                    .eq('usuario', usuario)
                    .eq('contra', contra);
                
                if (error) {
                    throw error;
                }
                
                // Verificar si encontró el usuario
                if (data && data.length > 0) {
                    // Login exitoso
                    showMessage('¡Login exitoso! Redirigiendo...', 'success');
                    
                    // Guardar usuario en localStorage
                    localStorage.setItem('loggedInUser', JSON.stringify({
                        usuario: data[0].usuario,
                        loginTime: new Date().toISOString()
                    }));
                    
                    // Redirigir al dashboard después de 1.5 segundos
                    setTimeout(() => {
                        window.location.href = 'dashboard.html';
                    }, 1500);
                    
                } else {
                    showMessage('Usuario o contraseña incorrectos', 'error');
                }
                
            } catch (error) {
                console.error('Error en login:', error);
                showMessage('Error al conectar con la base de datos', 'error');
            } finally {
                // Restaurar botón
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
            }
        });
    }
    
    // Verificar si estamos en dashboard y cargar información del usuario
    if (window.location.pathname.includes('dashboard.html')) {
        checkLoginStatus();
        
        // Manejar logout
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', function() {
                localStorage.removeItem('loggedInUser');
                window.location.href = 'index.html';
            });
        }
    }
});

// Función para mostrar mensajes
function showMessage(text, type) {
    const messageDiv = document.getElementById('message');
    messageDiv.textContent = text;
    messageDiv.className = `message ${type}`;
    messageDiv.style.display = 'block';
}

// Función para verificar si el usuario está logueado
function checkLoginStatus() {
    const userData = localStorage.getItem('loggedInUser');
    
    if (!userData) {
        // No hay usuario logueado, redirigir al login
        window.location.href = 'index.html';
        return;
    }
    
    try {
        const user = JSON.parse(userData);
        // Mostrar información del usuario en el dashboard
        const userDisplay = document.getElementById('userDisplay');
        const loginTimeDisplay = document.getElementById('loginTimeDisplay');
        
        if (userDisplay) {
            userDisplay.textContent = user.usuario;
        }
        
        if (loginTimeDisplay && user.loginTime) {
            const loginDate = new Date(user.loginTime);
            loginTimeDisplay.textContent = loginDate.toLocaleString('es-ES');
        }
    } catch (error) {
        console.error('Error al parsear datos del usuario:', error);
        window.location.href = 'index.html';
    }
}