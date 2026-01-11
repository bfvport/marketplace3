// ================================================
// CONFIGURACIÓN GLOBAL
// ================================================
const SUPABASE_URL = 'https://uriqltengefxiijgonih.supabase.co';
const SUPABASE_KEY = 'sb_publishable_lHmMGjQnXl0Bm4FOF5YV5w_jQN_lNRP';

// Crear cliente Supabase global
window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Estado global de la aplicación
window.currentUser = null;
window.appConfig = {
    version: '1.0.0',
    environment: 'development',
    appName: 'Marketplace Manager'
};

// ================================================
// INICIALIZACIÓN PRINCIPAL
// ================================================
document.addEventListener('DOMContentLoaded', async function() {
    console.log(`🚀 ${window.appConfig.appName} v${window.appConfig.version}`);
    
    try {
        // Cargar usuario desde localStorage
        await cargarUsuario();
        
        // Configurar navegación según rol
        configurarNavegacion();
        
        // Inicializar componentes comunes
        inicializarComponentes();
        
        // Verificar autenticación según página
        verificarAccesoPagina();
        
        // Inicializar manejadores globales
        inicializarManejadoresGlobales();
        
    } catch (error) {
        console.error('Error en inicialización:', error);
        mostrarMensaje('Error al inicializar la aplicación', 'error');
    }
});

// ================================================
// FUNCIONES PRINCIPALES
// ================================================

async function cargarUsuario() {
    const userData = localStorage.getItem('marketplaceUser');
    
    if (userData) {
        try {
            window.currentUser = JSON.parse(userData);
            console.log('👤 Usuario cargado:', window.currentUser.usuario);
            
            // Verificar si la sesión sigue siendo válida
            await verificarSesionValida();
            
        } catch (error) {
            console.error('Error al parsear usuario:', error);
            localStorage.removeItem('marketplaceUser');
            window.currentUser = null;
        }
    }
}

async function verificarSesionValida() {
    if (!window.currentUser) return;
    
    try {
        // Verificar que el usuario todavía existe en la base de datos
        const { data, error } = await window.supabaseClient
            .from('usuarios')
            .select('usuario')
            .eq('usuario', window.currentUser.usuario)
            .single();
            
        if (error || !data) {
            console.log('Sesión inválida, usuario no encontrado');
            localStorage.removeItem('marketplaceUser');
            window.currentUser = null;
            window.location.href = 'login.html';
        }
    } catch (error) {
        console.error('Error verificando sesión:', error);
    }
}

function configurarNavegacion() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    
    if (!window.currentUser) {
        sidebar.innerHTML = `
            <div class="menu-section">
                <h3><i class="fas fa-sign-in-alt"></i> Acceso</h3>
                <a href="login.html" class="menu-item">
                    <i class="fas fa-sign-in-alt"></i> Iniciar Sesión
                </a>
            </div>
        `;
        return;
    }
    
    let menuHTML = '';
    
    // Menú según rol
    if (window.currentUser.rol === 'gerente') {
        menuHTML = `
            <div class="menu-section">
                <h3><i class="fas fa-crown"></i> Gerencia</h3>
                <a href="../templates/cuentas_facebook/listar.html" class="menu-item">
                    <i class="fas fa-user-friends"></i> Cuentas Facebook
                </a>
                <a href="../templates/asignaciones/gestionar.html" class="menu-item">
                    <i class="fas fa-tasks"></i> Asignaciones
                </a>
                <a href="../templates/categorias/listar.html" class="menu-item">
                    <i class="fas fa-tags"></i> Categorías
                </a>
                <a href="../templates/reportes/dashboard_reportes.html" class="menu-item">
                    <i class="fas fa-chart-bar"></i> Reportes
                </a>
            </div>
        `;
    }
    
    // Menú común para todos
    menuHTML += `
        <div class="menu-section">
            <h3><i class="fas fa-tasks"></i> Operaciones</h3>
            ${window.currentUser.rol === 'operador' ? `
                <a href="../templates/operador/dashboard_operador.html" class="menu-item">
                    <i class="fas fa-home"></i> Mi Dashboard
                </a>
                <a href="../templates/operador/tareas_diarias.html" class="menu-item">
                    <i class="fas fa-calendar-day"></i> Tareas Diarias
                </a>
                <a href="../templates/operador/nueva_publicacion.html" class="menu-item">
                    <i class="fas fa-plus-circle"></i> Nueva Publicación
                </a>
            ` : ''}
            <a href="../dashboard.html" class="menu-item">
                <i class="fas fa-home"></i> Dashboard Principal
            </a>
        </div>
        
        <div class="menu-section">
            <h3><i class="fas fa-user"></i> Cuenta</h3>
            <div class="user-info-sidebar">
                <p><strong>${window.currentUser.usuario}</strong></p>
                <p class="user-role">${window.currentUser.rol}</p>
            </div>
            <a href="#" class="menu-item" onclick="cerrarSesion()">
                <i class="fas fa-sign-out-alt"></i> Cerrar Sesión
            </a>
        </div>
    `;
    
    sidebar.innerHTML = menuHTML;
    
    // Actualizar UI con datos del usuario
    actualizarUIUsuario();
}

function actualizarUIUsuario() {
    const userDisplay = document.getElementById('userDisplay');
    const roleBadge = document.getElementById('roleBadge');
    
    if (userDisplay) {
        userDisplay.textContent = window.currentUser.usuario;
    }
    
    if (roleBadge) {
        roleBadge.textContent = window.currentUser.rol.toUpperCase();
        roleBadge.setAttribute('data-role', window.currentUser.rol);
        roleBadge.className = `role-badge badge-${window.currentUser.rol}`;
    }
    
    // Configurar botón de logout si existe
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', cerrarSesion);
    }
}

function inicializarComponentes() {
    // Actualizar fecha
    actualizarFechaActual();
    
    // Configurar tooltips
    inicializarTooltips();
    
    // Configurar modales
    inicializarModales();
    
    // Configurar notificaciones para gerentes
    if (window.currentUser && window.currentUser.rol === 'gerente') {
        cargarNotificacionesGerente();
    }
    
    // Configurar buscadores globales
    inicializarBuscadores();
}

function actualizarFechaActual() {
    const todayDate = document.getElementById('todayDate');
    if (todayDate) {
        const hoy = new Date();
        todayDate.textContent = hoy.toLocaleDateString('es-ES', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }
    
    // También actualizar en otros lugares si existen
    const fechaElements = document.querySelectorAll('.fecha-actual');
    fechaElements.forEach(element => {
        const hoy = new Date();
        element.textContent = hoy.toLocaleDateString('es-ES');
    });
}

function inicializarManejadoresGlobales() {
    // Manejador para botones de logout
    document.addEventListener('click', function(e) {
        if (e.target.closest('[data-action="logout"]')) {
            cerrarSesion();
        }
        
        // Manejador para botones de retroceso
        if (e.target.closest('[data-action="go-back"]')) {
            window.history.back();
        }
        
        // Manejador para recargar página
        if (e.target.closest('[data-action="reload"]')) {
            window.location.reload();
        }
    });
    
    // Interceptor para errores de fetch/Supabase
    window.addEventListener('unhandledrejection', function(event) {
        console.error('Error no manejado:', event.reason);
        
        // Mostrar error amigable para errores de conexión
        if (event.reason && event.reason.message && event.reason.message.includes('fetch')) {
            mostrarMensaje('Error de conexión con el servidor', 'error');
        }
    });
}

function verificarAccesoPagina() {
    const path = window.location.pathname;
    const currentPage = path.split('/').pop() || '';
    
    // Páginas que no requieren login
    const publicPages = ['login.html', 'index.html', ''];
    const isPublicPage = publicPages.includes(currentPage) || path.endsWith('/');
    
    if (!window.currentUser && !isPublicPage) {
        window.location.href = 'login.html';
        return;
    }
    
    // Si hay usuario, verificar permisos por rol
    if (window.currentUser) {
        const isGerentePage = path.includes('/templates/') && (
            path.includes('cuentas_facebook/') ||
            path.includes('asignaciones/') ||
            path.includes('categorias/') ||
            path.includes('reportes/')
        );
        
        if (isGerentePage && window.currentUser.rol !== 'gerente') {
            mostrarMensaje('No tienes permisos para acceder a esta página', 'error');
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 2000);
            return;
        }
        
        const isOperadorPage = path.includes('/templates/operador/');
        
        if (isOperadorPage && window.currentUser.rol !== 'operador') {
            mostrarMensaje('Esta página es solo para operadores', 'error');
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 2000);
            return;
        }
    }
}

// ================================================
// FUNCIONES UTILITARIAS
// ================================================

function cerrarSesion() {
    if (confirm('¿Estás seguro de cerrar sesión?')) {
        localStorage.removeItem('marketplaceUser');
        window.currentUser = null;
        mostrarMensaje('Sesión cerrada exitosamente', 'success');
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 1000);
    }
}

function mostrarMensaje(texto, tipo = 'info', duracion = 5000) {
    // Remover mensajes anteriores
    const mensajesAnteriores = document.querySelectorAll('.global-message');
    mensajesAnteriores.forEach(msg => msg.remove());
    
    // Crear elemento de mensaje
    const mensajeDiv = document.createElement('div');
    mensajeDiv.className = `global-message alert alert-${tipo} fade-in`;
    mensajeDiv.innerHTML = `
        <i class="fas fa-${tipo === 'success' ? 'check-circle' : tipo === 'error' ? 'exclamation-circle' : tipo === 'warning' ? 'exclamation-triangle' : 'info-circle'}"></i>
        <span>${texto}</span>
        <button class="alert-close" onclick="this.parentElement.remove()">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    // Estilos para mensaje global
    Object.assign(mensajeDiv.style, {
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: '9999',
        maxWidth: '400px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
    });
    
    // Agregar al cuerpo
    document.body.appendChild(mensajeDiv);
    
    // Auto-remover después de la duración
    if (duracion > 0) {
        setTimeout(() => {
            if (mensajeDiv.parentElement) {
                mensajeDiv.style.opacity = '0';
                mensajeDiv.style.transform = 'translateX(100px)';
                setTimeout(() => {
                    if (mensajeDiv.parentElement) {
                        mensajeDiv.remove();
                    }
                }, 300);
            }
        }, duracion);
    }
}

function formatearFecha(fechaISO) {
    if (!fechaISO) return '--/--/----';
    
    try {
        const fecha = new Date(fechaISO);
        return fecha.toLocaleDateString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    } catch (error) {
        return 'Fecha inválida';
    }
}

function formatearFechaCompleta(fechaISO) {
    if (!fechaISO) return '--/--/---- --:--';
    
    try {
        const fecha = new Date(fechaISO);
        return fecha.toLocaleDateString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (error) {
        return 'Fecha inválida';
    }
}

function formatearHora(fechaISO) {
    if (!fechaISO) return '--:--';
    
    try {
        const fecha = new Date(fechaISO);
        return fecha.toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (error) {
        return 'Hora inválida';
    }
}

function formatearNumero(numero) {
    if (typeof numero !== 'number') return '0';
    return numero.toLocaleString('es-ES');
}

function inicializarTooltips() {
    // Usar tooltips nativos del navegador primero
    const tooltips = document.querySelectorAll('[title]');
    tooltips.forEach(element => {
        element.setAttribute('data-tooltip', element.getAttribute('title'));
        element.removeAttribute('title');
    });
    
    // Tooltips personalizados para elementos sin title
    const customTooltips = document.querySelectorAll('[data-tooltip]:not([title])');
    customTooltips.forEach(element => {
        element.addEventListener('mouseenter', function(e) {
            const tooltip = document.createElement('div');
            tooltip.className = 'custom-tooltip';
            tooltip.textContent = this.getAttribute('data-tooltip');
            document.body.appendChild(tooltip);
            
            const rect = this.getBoundingClientRect();
            tooltip.style.left = (rect.left + rect.width / 2 - tooltip.offsetWidth / 2) + 'px';
            tooltip.style.top = (rect.top - tooltip.offsetHeight - 10) + 'px';
            
            this._tooltip = tooltip;
        });
        
        element.addEventListener('mouseleave', function() {
            if (this._tooltip) {
                this._tooltip.remove();
                this._tooltip = null;
            }
        });
    });
}

function inicializarModales() {
    // Manejador para abrir modales
    document.addEventListener('click', function(e) {
        const modalTrigger = e.target.closest('[data-modal-target]');
        if (modalTrigger) {
            const modalId = modalTrigger.getAttribute('data-modal-target');
            const modal = document.getElementById(modalId);
            if (modal) {
                modal.style.display = 'block';
                document.body.style.overflow = 'hidden';
            }
        }
        
        // Manejador para cerrar modales
        if (e.target.closest('.modal-close') || e.target.classList.contains('modal')) {
            const modal = e.target.closest('.modal');
            if (modal) {
                modal.style.display = 'none';
                document.body.style.overflow = 'auto';
            }
        }
    });
    
    // Cerrar modal con ESC
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            const modalesAbiertos = document.querySelectorAll('.modal[style*="display: block"]');
            modalesAbiertos.forEach(modal => {
                modal.style.display = 'none';
                document.body.style.overflow = 'auto';
            });
        }
    });
}

async function cargarNotificacionesGerente() {
    try {
        const hoy = new Date().toISOString().split('T')[0];
        const ayer = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        
        // Cuentas inactivas
        const { data: cuentasInactivas } = await window.supabaseClient
            .from('cuentas_facebook')
            .select('count')
            .eq('estado', 'inactivo')
            .single();
        
        // Operadores sin login hoy
        const { data: operadores } = await window.supabaseClient
            .from('usuarios')
            .select('usuario')
            .eq('rol', 'operador');
        
        const { data: loginsHoy } = await window.supabaseClient
            .from('usuarios_actividad')
            .select('usuario')
            .eq('fecha_logueo', hoy);
        
        const operadoresConLogin = loginsHoy?.map(l => l.usuario) || [];
        const operadoresSinLogin = operadores?.filter(op => !operadoresConLogin.includes(op.usuario)) || [];
        
        // Publicaciones de ayer (para revisar)
        const { data: publicacionesAyer } = await window.supabaseClient
            .from('marketplace_actividad')
            .select('count')
            .gte('created_at', ayer + 'T00:00:00')
            .lt('created_at', hoy + 'T00:00:00')
            .single();
        
        // Crear alertas
        const alertsContainer = document.getElementById('alertsContainer');
        const gerenteNotifications = document.getElementById('gerenteNotifications');
        
        if (!alertsContainer || !gerenteNotifications) return;
        
        let alertasHTML = '';
        let tieneAlertas = false;
        
        if (cuentasInactivas && cuentasInactivas.count > 0) {
            tieneAlertas = true;
            alertasHTML += `
                <div class="alert-card alert-warning">
                    <i class="fas fa-user-slash"></i>
                    <div>
                        <h4>Cuentas inactivas</h4>
                        <p>${cuentasInactivas.count} cuenta(s) marcadas como inactivas</p>
                    </div>
                    <a href="templates/cuentas_facebook/listar.html?estado=inactivo" class="btn-small">
                        Revisar
                    </a>
                </div>
            `;
        }
        
        if (operadoresSinLogin.length > 0) {
            tieneAlertas = true;
            alertasHTML += `
                <div class="alert-card alert-info">
                    <i class="fas fa-user-clock"></i>
                    <div>
                        <h4>Operadores sin actividad hoy</h4>
                        <p>${operadoresSinLogin.length} operador(es) sin login hoy</p>
                    </div>
                </div>
            `;
        }
        
        if (publicacionesAyer && publicacionesAyer.count === 0) {
            tieneAlertas = true;
            alertasHTML += `
                <div class="alert-card alert-secondary">
                    <i class="fas fa-chart-line"></i>
                    <div>
                        <h4>Baja actividad ayer</h4>
                        <p>No se registraron publicaciones ayer</p>
                    </div>
                </div>
            `;
        }
        
        if (tieneAlertas) {
            gerenteNotifications.style.display = 'block';
            alertsContainer.innerHTML = alertasHTML;
        }
        
    } catch (error) {
        console.error('Error cargando notificaciones:', error);
    }
}

function inicializarBuscadores() {
    const buscadores = document.querySelectorAll('.global-search');
    buscadores.forEach(buscador => {
        buscador.addEventListener('input', function(e) {
            const termino = e.target.value.toLowerCase();
            const tablaId = this.getAttribute('data-search-table');
            const tabla = document.getElementById(tablaId);
            
            if (!tabla) return;
            
            const filas = tabla.querySelectorAll('tbody tr');
            filas.forEach(fila => {
                const textoFila = fila.textContent.toLowerCase();
                fila.style.display = textoFila.includes(termino) ? '' : 'none';
            });
        });
    });
}

// ================================================
// FUNCIONES DE VALIDACIÓN
// ================================================

function validarEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function validarRequerido(valor, campo) {
    if (!valor || valor.trim() === '') {
        mostrarMensaje(`El campo ${campo} es requerido`, 'error');
        return false;
    }
    return true;
}

function validarLongitud(valor, campo, min, max) {
    if (valor.length < min) {
        mostrarMensaje(`${campo} debe tener al menos ${min} caracteres`, 'error');
        return false;
    }
    if (max && valor.length > max) {
        mostrarMensaje(`${campo} no puede tener más de ${max} caracteres`, 'error');
        return false;
    }
    return true;
}

function validarNumero(valor, campo, min = null, max = null) {
    const num = Number(valor);
    if (isNaN(num)) {
        mostrarMensaje(`${campo} debe ser un número válido`, 'error');
        return false;
    }
    if (min !== null && num < min) {
        mostrarMensaje(`${campo} debe ser mayor o igual a ${min}`, 'error');
        return false;
    }
    if (max !== null && num > max) {
        mostrarMensaje(`${campo} debe ser menor o igual a ${max}`, 'error');
        return false;
    }
    return true;
}

// ================================================
// FUNCIONES DE DATOS
// ================================================

async function obtenerOperadores() {
    try {
        const { data, error } = await window.supabaseClient
            .from('usuarios')
            .select('usuario')
            .eq('rol', 'operador')
            .order('usuario');
        
        if (error) throw error;
        return data.map(u => u.usuario);
    } catch (error) {
        console.error('Error obteniendo operadores:', error);
        mostrarMensaje('Error al cargar operadores', 'error');
        return [];
    }
}

async function obtenerCategorias() {
    try {
        const { data, error } = await window.supabaseClient
            .from('categoria')
            .select('nombre')
            .order('nombre');
        
        if (error) throw error;
        return data.map(c => c.nombre);
    } catch (error) {
        console.error('Error obteniendo categorías:', error);
        return [];
    }
}

async function obtenerCuentasFacebook(estado = 'activo') {
    try {
        let query = window.supabaseClient
            .from('cuentas_facebook')
            .select('*')
            .order('nombre');
        
        if (estado !== 'todos') {
            query = query.eq('estado', estado);
        }
        
        const { data, error } = await query;
        
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error obteniendo cuentas:', error);
        return [];
    }
}

// ================================================
// EXPORTAR FUNCIONES GLOBALES
// ================================================
window.mostrarMensaje = mostrarMensaje;
window.formatearFecha = formatearFecha;
window.formatearFechaCompleta = formatearFechaCompleta;
window.formatearHora = formatearHora;
window.formatearNumero = formatearNumero;
window.cerrarSesion = cerrarSesion;
window.validarEmail = validarEmail;
window.validarRequerido = validarRequerido;
window.validarLongitud = validarLongitud;
window.validarNumero = validarNumero;
window.obtenerOperadores = obtenerOperadores;
window.obtenerCategorias = obtenerCategorias;
window.obtenerCuentasFacebook = obtenerCuentasFacebook;

// ================================================
// INICIALIZACIÓN DE ESTILOS DINÁMICOS
// ================================================
function injectGlobalStyles() {
    const styles = `
        /* Tooltips personalizados */
        .custom-tooltip {
            position: fixed;
            background: var(--dark-bg);
            color: white;
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 12px;
            z-index: 10000;
            pointer-events: none;
            max-width: 200px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }
        
        /* Animaciones */
        .fade-in {
            animation: fadeIn 0.3s ease;
        }
        
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        
        /* Estados de carga */
        .loading {
            position: relative;
            pointer-events: none;
            opacity: 0.7;
        }
        
        .loading::after {
            content: '';
            position: absolute;
            top: 50%;
            left: 50%;
            width: 20px;
            height: 20px;
            margin: -10px 0 0 -10px;
            border: 2px solid var(--primary-color);
            border-top-color: transparent;
            border-radius: 50%;
            animation: spin 0.6s linear infinite;
        }
        
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        
        /* Cards de alerta */
        .alert-card {
            display: flex;
            align-items: center;
            gap: 15px;
            padding: 15px;
            border-radius: var(--radius);
            margin-bottom: 10px;
            background: white;
            box-shadow: var(--shadow);
        }
        
        .alert-card i {
            font-size: 24px;
        }
        
        .alert-warning {
            border-left: 4px solid var(--warning-color);
        }
        
        .alert-info {
            border-left: 4px solid var(--info-color);
        }
        
        .alert-secondary {
            border-left: 4px solid var(--text-light);
        }
        
        /* User info en sidebar */
        .user-info-sidebar {
            padding: 10px 15px;
            background: rgba(255,255,255,0.1);
            border-radius: var(--radius);
            margin-bottom: 15px;
        }
        
        .user-info-sidebar p {
            margin: 5px 0;
        }
        
        .user-role {
            font-size: 12px;
            opacity: 0.8;
            text-transform: uppercase;
        }
    `;
    
    const styleSheet = document.createElement('style');
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);
}

// Inyectar estilos globales
injectGlobalStyles();

console.log('✅ Core.js cargado correctamente');