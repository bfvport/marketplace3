// Lógica específica para gestión de cuentas Facebook

class CuentasManager {
    constructor() {
        this.cuentas = [];
        this.filtros = {
            estado: 'todos',
            calidad: 'todos',
            asignada: 'todos'
        };
        this.init();
    }
    
    async init() {
        await this.verificarPermisos();
        this.configurarEventos();
        await this.cargarCuentas();
        this.actualizarEstadisticas();
    }
    
    async verificarPermisos() {
        // Solo gerentes pueden ver esta página
        if (!window.currentUser || window.currentUser.rol !== 'gerente') {
            window.location.href = '../../dashboard.html';
            return;
        }
        
        document.getElementById('userDisplay').textContent = window.currentUser.usuario;
        document.getElementById('roleBadge').textContent = 'GERENTE';
        document.getElementById('roleBadge').setAttribute('data-role', 'gerente');
        
        // Configurar logout
        document.getElementById('logoutBtn').addEventListener('click', () => {
            localStorage.removeItem('marketplaceUser');
            window.location.href = '../../login.html';
        });
    }
    
    configurarEventos() {
        // Filtros
        document.getElementById('btnAplicarFiltros').addEventListener('click', () => {
            this.aplicarFiltros();
        });
        
        document.getElementById('btnLimpiarFiltros').addEventListener('click', () => {
            this.limpiarFiltros();
        });
        
        // Recargar
        document.getElementById('btnRecargar').addEventListener('click', () => {
            this.cargarCuentas();
        });
    }
    
    async cargarCuentas() {
        try {
            const { data, error } = await window.supabaseClient
                .from('cuentas_facebook')
                .select('*')
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            
            this.cuentas = data || [];
            this.mostrarCuentas();
            this.actualizarEstadisticas();
            
        } catch (error) {
            console.error('Error cargando cuentas:', error);
            this.mostrarError('Error al cargar las cuentas');
        }
    }
    
    mostrarCuentas() {
        const tbody = document.getElementById('tbodyCuentas');
        if (!tbody) return;
        
        const cuentasFiltradas = this.filtrarCuentas();
        
        if (cuentasFiltradas.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="empty-row">
                        <i class="fas fa-inbox"></i>
                        <p>No hay cuentas registradas</p>
                    </td>
                </tr>
            `;
            return;
        }
        
        let html = '';
        
        cuentasFiltradas.forEach(cuenta => {
            const estadoClass = cuenta.estado === 'activo' ? 'badge-success' : 'badge-danger';
            const calidadClass = cuenta.calidad === 'caliente' ? 'badge-warning' : 'badge-info';
            const fecha = new Date(cuenta.created_at).toLocaleDateString('es-ES');
            
            html += `
                <tr>
                    <td>${cuenta.id}</td>
                    <td>
                        <div class="email-cell">
                            <i class="fas fa-envelope"></i>
                            <span>${cuenta.email}</span>
                        </div>
                    </td>
                    <td>${cuenta.nombre}</td>
                    <td><span class="badge ${estadoClass}">${cuenta.estado}</span></td>
                    <td><span class="badge ${calidadClass}">${cuenta.calidad}</span></td>
                    <td>
                        ${cuenta.ocupada_por 
                            ? `<span class="asignado-a">${cuenta.ocupada_por}</span>` 
                            : '<span class="badge badge-secondary">Libre</span>'}
                    </td>
                    <td>${fecha}</td>
                    <td>
                        <div class="action-buttons">
                            <button class="btn-icon-small btn-edit" onclick="cuentasManager.editarCuenta(${cuenta.id})">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn-icon-small btn-delete" onclick="cuentasManager.eliminarCuenta(${cuenta.id})">
                                <i class="fas fa-trash"></i>
                            </button>
                            ${cuenta.ocupada_por 
                                ? `<button class="btn-icon-small btn-unassign" onclick="cuentasManager.desasignarCuenta(${cuenta.id})">
                                    <i class="fas fa-user-times"></i>
                                   </button>`
                                : `<button class="btn-icon-small btn-assign" onclick="cuentasManager.asignarCuenta(${cuenta.id})">
                                    <i class="fas fa-user-plus"></i>
                                   </button>`}
                        </div>
                    </td>
                </tr>
            `;
        });
        
        tbody.innerHTML = html;
        document.getElementById('contadorCuentas').textContent = 
            `${cuentasFiltradas.length} cuenta${cuentasFiltradas.length !== 1 ? 's' : ''}`;
    }
    
    filtrarCuentas() {
        return this.cuentas.filter(cuenta => {
            // Filtrar por estado
            if (this.filtros.estado !== 'todos' && cuenta.estado !== this.filtros.estado) {
                return false;
            }
            
            // Filtrar por calidad
            if (this.filtros.calidad !== 'todos' && cuenta.calidad !== this.filtros.calidad) {
                return false;
            }
            
            // Filtrar por asignación
            if (this.filtros.asignada === 'asignadas' && !cuenta.ocupada_por) {
                return false;
            }
            if (this.filtros.asignada === 'libres' && cuenta.ocupada_por) {
                return false;
            }
            
            return true;
        });
    }
    
    aplicarFiltros() {
        this.filtros.estado = document.getElementById('filterEstado').value;
        this.filtros.calidad = document.getElementById('filterCalidad').value;
        this.filtros.asignada = document.getElementById('filterAsignada').value;
        
        this.mostrarCuentas();
        this.actualizarEstadisticas();
    }
    
    limpiarFiltros() {
        document.getElementById('filterEstado').value = 'todos';
        document.getElementById('filterCalidad').value = 'todos';
        document.getElementById('filterAsignada').value = 'todos';
        
        this.filtros = {
            estado: 'todos',
            calidad: 'todos',
            asignada: 'todos'
        };
        
        this.mostrarCuentas();
        this.actualizarEstadisticas();
    }
    
    actualizarEstadisticas() {
        const total = this.cuentas.length;
        const activas = this.cuentas.filter(c => c.estado === 'activo').length;
        const asignadas = this.cuentas.filter(c => c.ocupada_por).length;
        const calientes = this.cuentas.filter(c => c.calidad === 'caliente').length;
        
        document.getElementById('statTotal').textContent = total;
        document.getElementById('statActivas').textContent = activas;
        document.getElementById('statAsignadas').textContent = asignadas;
        document.getElementById('statCalientes').textContent = calientes;
    }
    
    async editarCuenta(id) {
        window.location.href = `editar.html?id=${id}`;
    }
    
    async eliminarCuenta(id) {
        if (!confirm('¿Estás seguro de eliminar esta cuenta? Esta acción no se puede deshacer.')) {
            return;
        }
        
        try {
            const { error } = await window.supabaseClient
                .from('cuentas_facebook')
                .delete()
                .eq('id', id);
            
            if (error) throw error;
            
            alert('Cuenta eliminada exitosamente');
            await this.cargarCuentas();
            
        } catch (error) {
            console.error('Error eliminando cuenta:', error);
            alert('Error al eliminar la cuenta');
        }
    }
    
    async asignarCuenta(id) {
        const operadores = await this.obtenerOperadores();
        const selector = this.crearSelectorOperadores(operadores);
        
        if (selector) {
            const seleccionado = prompt(`Selecciona un operador para asignar:\n\n${selector}`, '');
            if (seleccionado && operadores.includes(seleccionado)) {
                await this.actualizarAsignacion(id, seleccionado);
            }
        }
    }
    
    async desasignarCuenta(id) {
        if (!confirm('¿Desasignar esta cuenta del operador?')) {
            return;
        }
        
        await this.actualizarAsignacion(id, null);
    }
    
    async actualizarAsignacion(id, operador) {
        try {
            const { error } = await window.supabaseClient
                .from('cuentas_facebook')
                .update({ 
                    ocupada_por: operador,
                    updated_at: new Date().toISOString()
                })
                .eq('id', id);
            
            if (error) throw error;
            
            alert(`Cuenta ${operador ? 'asignada' : 'desasignada'} exitosamente`);
            await this.cargarCuentas();
            
        } catch (error) {
            console.error('Error actualizando asignación:', error);
            alert('Error al actualizar la asignación');
        }
    }
    
    async obtenerOperadores() {
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
            return [];
        }
    }
    
    crearSelectorOperadores(operadores) {
        if (operadores.length === 0) return 'No hay operadores disponibles';
        
        let selector = '';
        operadores.forEach((op, index) => {
            selector += `${index + 1}. ${op}\n`;
        });
        return selector;
    }
    
    mostrarError(mensaje) {
        const tbody = document.getElementById('tbodyCuentas');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="error-row">
                        <i class="fas fa-exclamation-triangle"></i>
                        <p>${mensaje}</p>
                        <button onclick="cuentasManager.cargarCuentas()" class="btn-secondary">
                            Reintentar
                        </button>
                    </td>
                </tr>
            `;
        }
    }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    window.cuentasManager = new CuentasManager();
});