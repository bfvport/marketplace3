// Manejo de autenticación

class AuthManager {
    constructor() {
        this.loginForm = document.getElementById('loginForm');
        this.init();
    }
    
    init() {
        if (this.loginForm) {
            this.setupLoginForm();
        }
    }
    
    setupLoginForm() {
        this.loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const usuario = document.getElementById('usuario').value.trim();
            const contra = document.getElementById('contra').value;
            const messageDiv = document.getElementById('message');
            
            if (!usuario || !contra) {
                this.showMessage('Por favor, completa todos los campos', 'error', messageDiv);
                return;
            }
            
            await this.login(usuario, contra);
        });
    }
    
    async login(username, password) {
        const submitBtn = this.loginForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        
        try {
            // Mostrar carga
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...';
            submitBtn.disabled = true;
            
            // Consultar usuario
            const { data, error } = await window.supabaseClient
                .from('usuarios')
                .select('*')
                .eq('usuario', username)
                .eq('contra', password)
                .single();
            
            if (error) {
                if (error.code === 'PGRST116') { // No encontrado
                    throw new Error('Usuario o contraseña incorrectos');
                }
                throw error;
            }
            
            if (!data) {
                throw new Error('Usuario o contraseña incorrectos');
            }
            
            // Guardar sesión
            this.guardarSesion(data);
            
            // Registrar actividad de login
            await this.registrarLogin(data.usuario);
            
            // Mostrar éxito y redirigir
            this.showMessage('¡Login exitoso! Redirigiendo...', 'success');
            
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 1500);
            
        } catch (error) {
            console.error('Error en login:', error);
            this.showMessage(error.message || 'Error al conectar con el servidor', 'error');
        } finally {
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    }
    
    guardarSesion(userData) {
        const sessionData = {
            id: userData.id,
            usuario: userData.usuario,
            rol: userData.rol,
            loginTime: new Date().toISOString()
        };
        
        localStorage.setItem('marketplaceUser', JSON.stringify(sessionData));
        window.currentUser = sessionData;
        
        console.log('✅ Sesión guardada para:', userData.usuario);
    }
    
    async registrarLogin(username) {
        try {
            const hoy = new Date().toISOString().split('T')[0];
            
            // Verificar si ya existe registro para hoy
            const { data: existing } = await window.supabaseClient
                .from('usuarios_actividad')
                .select('id')
                .eq('usuario', username)
                .eq('fecha_logueo', hoy)
                .single();
            
            if (!existing) {
                // Crear nuevo registro
                await window.supabaseClient
                    .from('usuarios_actividad')
                    .insert({
                        usuario: username,
                        fecha_logueo: hoy
                    });
            }
        } catch (error) {
            console.error('Error registrando login:', error);
            // No fallar el login por esto
        }
    }
    
    showMessage(text, type, element = null) {
        const messageDiv = element || document.getElementById('message');
        if (messageDiv) {
            messageDiv.textContent = text;
            messageDiv.className = `message ${type}`;
            messageDiv.style.display = 'block';
            
            // Auto-ocultar mensajes de error después de 5 segundos
            if (type === 'error') {
                setTimeout(() => {
                    messageDiv.style.display = 'none';
                }, 5000);
            }
        }
    }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    window.authManager = new AuthManager();
});