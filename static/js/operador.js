// Lógica específica para operadores

class OperadorManager {
    constructor() {
        this.tareasHoy = [];
        this.cuentasAsignadas = [];
        this.asignacionActual = null;
        this.ultimasPublicaciones = [];
        this.init();
    }
    
    async init() {
        await this.verificarAutenticacion();
        this.cargarDatosUsuario();
        await this.cargarTareasDelDia();
        await this.cargarCuentasAsignadas();
        await this.cargarUltimasPublicaciones();
        this.actualizarUI();
        this.configurarEventos();
    }
    
    async verificarAutenticacion() {
        if (!window.currentUser || window.currentUser.rol !== 'operador') {
            window.location.href = '../../login.html';
            return;
        }
        
        // Configurar logout
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                localStorage.removeItem('marketplaceUser');
                window.location.href = '../../login.html';
            });
        }
    }
    
    cargarDatosUsuario() {
        const userDisplay = document.getElementById('userDisplay');
        const nombreOperador = document.getElementById('nombreOperador');
        
        if (userDisplay) {
            userDisplay.textContent = window.currentUser.usuario;
        }
        if (nombreOperador) {
            nombreOperador.textContent = window.currentUser.usuario;
        }
        
        // Actualizar fecha
        const fechaHoy = document.getElementById('fechaHoy');
        if (fechaHoy) {
            const hoy = new Date();
            fechaHoy.textContent = hoy.toLocaleDateString('es-ES', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        }
    }
    
    async cargarTareasDelDia() {
        try {
            const hoy = new Date().toISOString().split('T')[0];
            
            // Obtener asignación activa
            const { data: asignaciones, error } = await window.supabaseClient
                .from('usuarios_asignado')
                .select('*')
                .eq('usuario', window.currentUser.usuario)
                .lte('fecha_desde', hoy)
                .gte('fecha_hasta', hoy)
                .single();
            
            if (error && error.code !== 'PGRST116') throw error;
            
            this.asignacionActual = asignaciones || null;
            
            // Obtener actividad de hoy
            const { data: actividad } = await window.supabaseClient
                .from('usuarios_actividad')
                .select('*')
                .eq('usuario', window.currentUser.usuario)
                .eq('fecha_logueo', hoy)
                .single();
            
            // Crear array de tareas
            this.tareasHoy = [];
            
            if (this.asignacionActual) {
                // Marketplace
                this.tareasHoy.push({
                    tipo: 'marketplace',
                    objetivo: this.asignacionActual.marketplace_daily || 0,
                    completado: actividad?.marketplace_quest || 0,
                    icono: 'fas fa-store',
                    nombre: 'Marketplace'
                });
                
                // Historias
                this.tareasHoy.push({
                    tipo: 'historia',
                    objetivo: this.asignacionActual.historia_daily || 0,
                    completado: actividad?.historia_quest || 0,
                    icono: 'fas fa-history',
                    nombre: 'Historias'
                });
                
                // Muro
                this.tareasHoy.push({
                    tipo: 'muro',
                    objetivo: this.asignacionActual.muro_daily || 0,
                    completado: actividad?.muro_quest || 0,
                    icono: 'fas fa-newspaper',
                    nombre: 'Muro'
                });
                
                // Grupos
                this.tareasHoy.push({
                    tipo: 'grupo',
                    objetivo: this.asignacionActual.grupos_daily || 0,
                    completado: actividad?.grupo_quest || 0,
                    icono: 'fas fa-users',
                    nombre: 'Grupos'
                });
            }
            
        } catch (error) {
            console.error('Error cargando tareas:', error);
            window.mostrarMensaje('Error al cargar tareas', 'error');
        }
    }
    
    async cargarCuentasAsignadas() {
        try {
            const { data, error } = await window.supabaseClient
                .from('cuentas_facebook')
                .select('*')
                .eq('ocupada_por', window.currentUser.usuario)
                .eq('estado', 'activo');
            
            if (error) throw error;
            
            this.cuentasAsignadas = data || [];
            
        } catch (error) {
            console.error('Error cargando cuentas:', error);
        }
    }
    
    async cargarUltimasPublicaciones() {
        try {
            const { data, error } = await window.supabaseClient
                .from('marketplace_actividad')
                .select('*')
                .eq('usuario', window.currentUser.usuario)
                .order('created_at', { ascending: false })
                .limit(5);
            
            if (error) throw error;
            
            this.ultimasPublicaciones = data || [];
            
        } catch (error) {
            console.error('Error cargando publicaciones:', error);
        }
    }
    
    configurarEventos() {
        // Botón para marcar tareas rápidas
        document.addEventListener('click', (e) => {
            if (e.target.closest('.btn-marcar-tarea')) {
                const tipo = e.target.closest('.btn-marcar-tarea').dataset.tipo;
                this.marcarTarea(tipo);
            }
        });
    }
    
    actualizarUI() {
        this.actualizarProgreso();
        this.actualizarListaTareas();
        this.actualizarUltimasPublicaciones();
        this.actualizarResumen();
    }
    
    actualizarProgreso() {
        // Actualizar barras de progreso
        this.tareasHoy.forEach(tarea => {
            const elemento = document.querySelector(`.progress-item[data-tipo="${tarea.tipo}"]`);
            if (elemento) {
                const porcentaje = tarea.objetivo > 0 ? 
                    Math.min((tarea.completado / tarea.objetivo) * 100, 100) : 0;
                
                const barra = elemento.querySelector('.progress-fill');
                const texto = elemento.querySelector('span');
                
                if (barra) barra.style.width = `${porcentaje}%`;
                if (texto) texto.textContent = `${tarea.completado}/${tarea.objetivo}`;
                
                // Color según progreso
                if (porcentaje >= 100) {
                    barra.classList.add('progress-complete');
                } else if (porcentaje >= 50) {
                    barra.classList.add('progress-half');
                } else {
                    barra.classList.add('progress-low');
                }
            }
        });
    }
    
    actualizarListaTareas() {
        const lista = document.getElementById('listaTareas');
        if (!lista) return;
        
        if (this.tareasHoy.length === 0) {
            lista.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-calendar-check"></i>
                    <p>No tienes tareas asignadas para hoy</p>
                    <button onclick="window.location.href='tareas_diarias.html'" class="btn-secondary">
                        Ver asignaciones futuras
                    </button>
                </div>
            `;
            return;
        }
        
        let html = '<div class="tasks-grid">';
        
        this.tareasHoy.forEach(tarea => {
            const restantes = tarea.objetivo - tarea.completado;
            const completado = restantes <= 0;
            const porcentaje = tarea.objetivo > 0 ? 
                Math.round((tarea.completado / tarea.objetivo) * 100) : 0;
            
            html += `
                <div class="task-card ${completado ? 'task-completed' : ''}">
                    <div class="task-header">
                        <i class="${tarea.icono}"></i>
                        <h4>${tarea.nombre}</h4>
                        <span class="task-percentage">${porcentaje}%</span>
                    </div>
                    <div class="task-body">
                        <p><strong>${tarea.completado}</strong> de <strong>${tarea.objetivo}</strong> completados</p>
                        ${restantes > 0 ? 
                            `<p class="task-pending"><i class="fas fa-clock"></i> <strong>${restantes}</strong> pendientes</p>` : 
                            `<p class="task-done"><i class="fas fa-check-circle"></i> ¡Completado!</p>`}
                    </div>
                    ${!completado ? `
                    <div class="task-footer">
                        <button class="btn-small btn-primary btn-marcar-tarea" data-tipo="${tarea.tipo}">
                            <i class="fas fa-check"></i> Marcar como hecho
                        </button>
                        <button onclick="window.location.href='nueva_publicacion.html?tipo=${tarea.tipo}'" 
                                class="btn-small btn-secondary">
                            <i class="fas fa-plus"></i> Crear
                        </button>
                    </div>
                    ` : ''}
                </div>
            `;
        });
        
        html += '</div>';
        lista.innerHTML = html;
    }
    
    actualizarUltimasPublicaciones() {
        const container = document.getElementById('ultimasPublicaciones');
        if (!container) return;
        
        if (this.ultimasPublicaciones.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-inbox"></i>
                    <p>Aún no has realizado publicaciones</p>
                    <button onclick="window.location.href='nueva_publicacion.html'" class="btn-primary">
                        <i class="fas fa-plus"></i> Crear primera publicación
                    </button>
                </div>
            `;
            return;
        }
        
        let html = '<div class="publications-list">';
        
        this.ultimasPublicaciones.forEach(pub => {
            const fecha = window.formatearFecha(pub.created_at);
            const hora = window.formatearHora(pub.created_at);
            
            html += `
                <div class="publication-item">
                    <div class="pub-header">
                        <span class="pub-date">${fecha} ${hora}</span>
                        <span class="pub-category">${pub.categoria || 'Sin categoría'}</span>
                    </div>
                    <div class="pub-body">
                        <h5>${pub.titulo || 'Sin título'}</h5>
                        <p class="pub-desc">${pub.descripcion ? pub.descripcion.substring(0, 100) + '...' : 'Sin descripción'}</p>
                        <div class="pub-footer">
                            <span class="pub-account">
                                <i class="fas fa-user-circle"></i> ${pub.facebook_account_usada || 'Cuenta no especificada'}
                            </span>
                            ${pub.marketplace_link_publicacion ? `
                                <a href="${pub.marketplace_link_publicacion}" target="_blank" class="btn-link">
                                    <i class="fas fa-external-link-alt"></i> Ver publicación
                                </a>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        
        // Agregar botón para ver más
        html += `
            <div class="text-center" style="margin-top: 20px;">
                <button onclick="window.location.href='mis_publicaciones.html'" class="btn-secondary">
                    <i class="fas fa-history"></i> Ver historial completo
                </button>
            </div>
        `;
        
        container.innerHTML = html;
    }
    
    actualizarResumen() {
        // Actualizar estadísticas rápidas
        const totalTareas = this.tareasHoy.reduce((sum, t) => sum + t.objetivo, 0);
        const completadas = this.tareasHoy.reduce((sum, t) => sum + t.completado, 0);
        const porcentajeTotal = totalTareas > 0 ? Math.round((completadas / totalTareas) * 100) : 0;
        
        // Actualizar en dashboard principal si existe
        const pendingTasks = document.getElementById('pendingTasks');
        const completedTasks = document.getElementById('completedTasks');
        const performance = document.getElementById('performance');
        
        if (pendingTasks) pendingTasks.textContent = totalTareas - completadas;
        if (completedTasks) completedTasks.textContent = completadas;
        if (performance) performance.textContent = `${porcentajeTotal}%`;
    }
    
    async marcarTarea(tipo) {
        try {
            const hoy = new Date().toISOString().split('T')[0];
            const campo = `${tipo}_quest`;
            
            // Obtener actividad actual
            const { data: actividadExistente } = await window.supabaseClient
                .from('usuarios_actividad')
                .select('*')
                .eq('usuario', window.currentUser.usuario)
                .eq('fecha_logueo', hoy)
                .single();
            
            let nuevaActividad = {};
            
            if (actividadExistente) {
                // Actualizar existente
                nuevaActividad[campo] = (actividadExistente[campo] || 0) + 1;
                
                await window.supabaseClient
                    .from('usuarios_actividad')
                    .update(nuevaActividad)
                    .eq('id', actividadExistente.id);
                    
            } else {
                // Crear nueva actividad
                nuevaActividad = {
                    usuario: window.currentUser.usuario,
                    fecha_logueo: hoy,
                    [campo]: 1
                };
                
                await window.supabaseClient
                    .from('usuarios_actividad')
                    .insert(nuevaActividad);
            }
            
            window.mostrarMensaje('✅ Tarea registrada exitosamente', 'success');
            
            // Recargar datos
            await this.cargarTareasDelDia();
            this.actualizarUI();
            
        } catch (error) {
            console.error('Error registrando tarea:', error);
            window.mostrarMensaje('❌ Error al registrar la tarea', 'error');
        }
    }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    // Verificar si estamos en una página de operador
    if (window.location.pathname.includes('operador/') || 
        (window.currentUser && window.currentUser.rol === 'operador')) {
        window.operadorManager = new OperadorManager();
    }
});