// Configuración Supabase
const supabaseUrl = 'https://uriqltengefxiijgonih.supabase.co';
const supabaseKey = 'sb_publishable_lHmMGjQnXl0Bm4FOF5YV5w_jQN_lNRP';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

// Estado global
let currentUser = null;

// Cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', async function() {
    console.log('🚀 Marketplace Manager iniciando...');
    
    // Verificar autenticación
    await checkAuth();
    
    // Configurar según la página
    const path = window.location.pathname;
    
    if (path.includes('dashboard.html')) {
        await loadDashboard();
    } else if (path.includes('index.html') || path === '/') {
        setupLoginForm();
    }
});

// ================================================
// AUTENTICACIÓN
// ================================================
async function checkAuth() {
    const userData = localStorage.getItem('marketplaceUser');
    
    if (!userData && !window.location.pathname.includes('index.html') && window.location.pathname !== '/') {
        window.location.href = 'index.html';
        return;
    }
    
    if (userData) {
        try {
            currentUser = JSON.parse(userData);
            console.log('👤 Usuario:', currentUser.usuario, 'Rol:', currentUser.rol);
            
            // Actualizar última fecha de login
            await updateLastLogin();
            
        } catch (error) {
            console.error('Error al parsear usuario:', error);
            localStorage.removeItem('marketplaceUser');
            window.location.href = 'index.html';
        }
    }
}

function setupLoginForm() {
    const loginForm = document.getElementById('loginForm');
    if (!loginForm) return;
    
    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const usuario = document.getElementById('usuario').value;
        const contra = document.getElementById('contra').value;
        const messageDiv = document.getElementById('message');
        
        if (!usuario || !contra) {
            showMessage('Por favor, completa todos los campos', 'error', messageDiv);
            return;
        }
        
        // Mostrar carga
        const submitBtn = loginForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...';
        submitBtn.disabled = true;
        
        try {
            // Consultar usuario en Supabase
            const { data, error } = await supabaseClient
                .from('usuarios')
                .select('*')
                .eq('usuario', usuario)
                .eq('contra', contra)
                .single();
            
            if (error) {
                throw error;
            }
            
            if (data) {
                showMessage('¡Login exitoso! Redirigiendo...', 'success', messageDiv);
                
                // Guardar usuario
                localStorage.setItem('marketplaceUser', JSON.stringify({
                    id: data.id,
                    usuario: data.usuario,
                    rol: data.rol
                }));
                
                currentUser = data;
                
                // Actualizar fecha de login
                await supabaseClient
                    .from('usuarios_actividad')
                    .insert({
                        usuario: data.usuario,
                        fecha_logueo: new Date().toISOString().split('T')[0]
                    });
                
                // Redirigir
                setTimeout(() => {
                    window.location.href = 'dashboard.html';
                }, 1500);
                
            } else {
                showMessage('Usuario o contraseña incorrectos', 'error', messageDiv);
            }
            
        } catch (error) {
            console.error('Error en login:', error);
            showMessage('Error al conectar con la base de datos', 'error', messageDiv);
        } finally {
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    });
}

async function updateLastLogin() {
    if (!currentUser) return;
    
    const today = new Date().toISOString().split('T')[0];
    
    // Verificar si ya existe registro para hoy
    const { data: existing } = await supabaseClient
        .from('usuarios_actividad')
        .select('id')
        .eq('usuario', currentUser.usuario)
        .eq('fecha_logueo', today)
        .single();
    
    if (!existing) {
        // Crear nuevo registro
        await supabaseClient
            .from('usuarios_actividad')
            .insert({
                usuario: currentUser.usuario,
                fecha_logueo: today
            });
    }
}

// ================================================
// DASHBOARD
// ================================================
async function loadDashboard() {
    if (!currentUser) return;
    
    // Mostrar información del usuario
    document.getElementById('userDisplay').textContent = currentUser.usuario;
    const roleBadge = document.getElementById('roleBadge');
    roleBadge.textContent = currentUser.rol.toUpperCase();
    roleBadge.setAttribute('data-role', currentUser.rol);
    
    // Mostrar/ocultar menú de gerente
    if (currentUser.rol === 'gerente') {
        document.getElementById('gerenteMenu').style.display = 'block';
    }
    
    // Configurar logout
    document.getElementById('logoutBtn').addEventListener('click', function() {
        localStorage.removeItem('marketplaceUser');
        window.location.href = 'index.html';
    });
    
    // Cargar estadísticas
    await loadDashboardStats();
    
    // Configurar fecha actual
    const today = new Date();
    document.getElementById('todayDate').textContent = today.toLocaleDateString('es-ES', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    
    // Cargar acciones rápidas según rol
    loadQuickActions();
}

async function loadDashboardStats() {
    if (!currentUser) return;
    
    try {
        const today = new Date().toISOString().split('T')[0];
        
        // Para operadores: obtener tareas del día
        if (currentUser.rol === 'operador') {
            // Obtener asignaciones activas
            const { data: asignaciones } = await supabaseClient
                .from('usuarios_asignado')
                .select('*')
                .eq('usuario', currentUser.usuario)
                .lte('fecha_desde', today)
                .gte('fecha_hasta', today);
            
            // Obtener actividad de hoy
            const { data: actividad } = await supabaseClient
                .from('usuarios_actividad')
                .select('*')
                .eq('usuario', currentUser.usuario)
                .eq('fecha_logueo', today)
                .single();
            
            // Calcular estadísticas
            let totalTasks = 0;
            let completedTasks = 0;
            
            if (asignaciones && asignaciones.length > 0) {
                const asignacion = asignaciones[0];
                totalTasks = asignacion.marketplace_daily + asignacion.historia_daily + 
                            asignacion.muro_daily + asignacion.grupos_daily;
                
                if (actividad) {
                    completedTasks = (actividad.marketplace_quest || 0) + 
                                   (actividad.historia_quest || 0) + 
                                   (actividad.muro_quest || 0) + 
                                   (actividad.grupo_quest || 0);
                }
            }
            
            document.getElementById('pendingTasks').textContent = totalTasks - completedTasks;
            document.getElementById('completedTasks').textContent = completedTasks;
            document.getElementById('performance').textContent = totalTasks > 0 ? 
                Math.round((completedTasks / totalTasks) * 100) + '%' : '0%';
        }
        
    } catch (error) {
        console.error('Error cargando estadísticas:', error);
    }
}

function loadQuickActions() {
    const quickActions = document.getElementById('quickActions');
    if (!quickActions) return;
    
    quickActions.innerHTML = '';
    
    if (currentUser.rol === 'gerente') {
        quickActions.innerHTML = `
            <button class="action-btn" onclick="window.location.href='cuentas.html'">
                <i class="fas fa-user-friends"></i><br>Gestionar Cuentas
            </button>
            <button class="action-btn" onclick="window.location.href='asignaciones.html'">
                <i class="fas fa-tasks"></i><br>Asignar Tareas
            </button>
            <button class="action-btn" onclick="window.location.href='reportes.html'">
                <i class="fas fa-chart-bar"></i><br>Ver Reportes
            </button>
        `;
    } else {
        quickActions.innerHTML = `
            <button class="action-btn" onclick="window.location.href='diario.html'">
                <i class="fas fa-calendar-day"></i><br>Ver Tareas Diarias
            </button>
            <button class="action-btn" onclick="window.location.href='publicar.html'">
                <i class="fas fa-plus-circle"></i><br>Nueva Publicación
            </button>
            <button class="action-btn" onclick="window.location.href='historial.html'">
                <i class="fas fa-history"></i><br>Mi Historial
            </button>
        `;
    }
}

// ================================================
// FUNCIONES UTILITARIAS
// ================================================
function showMessage(text, type, element = null) {
    const messageDiv = element || document.getElementById('message');
    if (messageDiv) {
        messageDiv.textContent = text;
        messageDiv.className = `message ${type}`;
        messageDiv.style.display = 'block';
    }
}

// Exportar para uso en otros archivos
window.supabaseClient = supabaseClient;
window.currentUser = currentUser;