// app.js
import { auth, onAuthStateChanged } from './firebase-service.js';
import { initDB } from './indexeddb-handler.js';
import { initProductos, sincronizarProductosPendientes as sincronizarProd, cargarYMostrarProductos as cargarProd } from './productos.js';
// CORREGIDO AQUÍ: El alias ahora apunta al nombre correcto de la función exportada en presupuestos.js
import { initPresupuestos, cargarYMostrarPresupuestos as cargarPresup, sincronizarPresupuestosPendientes as sincronizarPresup } from './presupuestos.js'; 
import { initInteresados, cargarYMostrarInteresados as cargarInter, sincronizarInteresadosPendientes as sincronizarInter } from './interesados.js';

document.addEventListener('DOMContentLoaded', async () => {
    console.log("DOM completamente cargado y procesado.");
    try {
        await initDB(); 

        if (navigator.onLine) {
            console.log('App cargada con conexión, intentando sincronizar pendientes...');
            if (typeof sincronizarProd === 'function') sincronizarProd();
            if (typeof sincronizarPresup === 'function') sincronizarPresup(); // Usar el alias correcto
            if (typeof sincronizarInter === 'function') sincronizarInter(); 
        } else {
            console.log('App cargada sin conexión.');
        }
    } catch (error) {
        console.error("No se pudo inicializar IndexedDB:", error);
    }

    // Elementos de navegación
    const btnInicio = document.getElementById('btnInicio'); 
    const btnInteresados = document.getElementById('btnInteresados');
    const btnProductos = document.getElementById('btnProductos');
    const btnPresupuestos = document.getElementById('btnPresupuestos');

    const inicioSection = document.getElementById('inicioSection'); 
    const interesadosSection = document.getElementById('interesadosSection');
    const productosSection = document.getElementById('productosSection');
    const presupuestosSection = document.getElementById('presupuestosSection');

    const navButtons = [];
    if (btnInicio) navButtons.push(btnInicio);
    if (btnInteresados) navButtons.push(btnInteresados);
    if (btnProductos) navButtons.push(btnProductos);
    if (btnPresupuestos) navButtons.push(btnPresupuestos);

    const sections = [];
    if (inicioSection) sections.push(inicioSection);
    if (interesadosSection) sections.push(interesadosSection);
    if (productosSection) sections.push(productosSection);
    if (presupuestosSection) sections.push(presupuestosSection);


    function showSection(sectionToShow, buttonToActivate) {
        sections.forEach(section => {
            if(section) section.classList.remove('active');
        });
        navButtons.forEach(button => {
            if(button) button.classList.remove('active');
        });
        if (sectionToShow) sectionToShow.classList.add('active');
        if (buttonToActivate) buttonToActivate.classList.add('active');
    }

    // --- Inicializar UI y lógica de Productos ---
    const formProductoEl = document.getElementById('formProducto');
    const productoIdInputEl = document.getElementById('productoId');
    const nombreProductoInputEl = document.getElementById('nombreProducto');
    const descripcionProductoInputEl = document.getElementById('descripcionProducto');
    const precioProductoInputEl = document.getElementById('precioProducto');
    const unidadProductoInputEl = document.getElementById('unidadProducto');
    const btnCancelarEdicionProductoEl = document.getElementById('btnCancelarEdicionProducto');
    const divListaProductosEl = document.getElementById('listaProductos');

    if (formProductoEl) { 
        initProductos({ 
            formProducto: formProductoEl,
            productoIdInput: productoIdInputEl,
            nombreProductoInput: nombreProductoInputEl,
            descripcionProductoInput: descripcionProductoInputEl,
            precioProductoInput: precioProductoInputEl,
            unidadProductoInput: unidadProductoInputEl,
            btnCancelarEdicionProducto: btnCancelarEdicionProductoEl,
            divListaProductos: divListaProductosEl,
        });
    } else {
        console.warn("app.js: Elemento formProducto no encontrado.");
    }

    // --- Inicializar UI y lógica de Presupuestos ---
    const btnNuevoPresupuestoEl = document.getElementById('btnNuevoPresupuesto');
    const areaFormularioPresupuestoEl = document.getElementById('areaFormularioPresupuesto');
    const formPresupuestoEl = document.getElementById('formPresupuesto');
    const presupuestoIdInputEl = document.getElementById('presupuestoId');
    const selectInteresadoParaPresupuestoEl = document.getElementById('selectInteresadoParaPresupuesto');
    const selectProductoPresupuestoEl = document.getElementById('selectProductoPresupuesto');
    const cantidadProductoPresupuestoEl = document.getElementById('cantidadProductoPresupuesto');
    const btnAnadirProductoItemEl = document.getElementById('btnAnadirProductoItem');
    const itemsPresupuestoActualDivEl = document.getElementById('itemsPresupuestoActualDiv');
    const terminosPresupuestoInputEl = document.getElementById('terminosPresupuesto');
    const presupuestoSubtotalSpanEl = document.getElementById('presupuestoSubtotalSpan');
    const presupuestoTotalSpanEl = document.getElementById('presupuestoTotalSpan');
    const btnCancelarPresupuestoEl = document.getElementById('btnCancelarPresupuesto');
    const divListaPresupuestosEl = document.getElementById('listaPresupuestos');
    const tituloFormPresupuestoEl = document.getElementById('tituloFormPresupuesto');
    
    if (formPresupuestoEl && btnNuevoPresupuestoEl && areaFormularioPresupuestoEl && divListaPresupuestosEl && selectInteresadoParaPresupuestoEl && selectProductoPresupuestoEl) { 
        initPresupuestos({ 
            btnNuevoPresupuesto: btnNuevoPresupuestoEl,
            areaFormularioPresupuesto: areaFormularioPresupuestoEl,
            formPresupuesto: formPresupuestoEl,
            presupuestoIdInput: presupuestoIdInputEl,
            selectInteresadoParaPresupuesto: selectInteresadoParaPresupuestoEl,
            selectProductoPresupuesto: selectProductoPresupuestoEl,
            cantidadProductoPresupuesto: cantidadProductoPresupuestoEl,
            btnAnadirProductoItem: btnAnadirProductoItemEl,
            itemsPresupuestoActual: itemsPresupuestoActualDivEl,
            terminosPresupuesto: terminosPresupuestoInputEl,
            presupuestoSubtotal: presupuestoSubtotalSpanEl,
            presupuestoTotal: presupuestoTotalSpanEl,
            btnCancelarPresupuesto: btnCancelarPresupuestoEl,
            listaPresupuestos: divListaPresupuestosEl,
            tituloFormPresupuesto: tituloFormPresupuestoEl
        });
    } else {
        console.error("app.js: Faltan elementos del DOM para inicializar completamente la sección de Presupuestos. Revisa los IDs.");
    }

    // --- Inicializar UI y lógica de Interesados ---
    const formInteresadoEl = document.getElementById('formInteresado');
    const interesadoIdInputEl = document.getElementById('interesadoId'); 
    const nombreInteresadoInputEl = document.getElementById('nombreInteresado');
    const emailInteresadoInputEl = document.getElementById('emailInteresado');
    const telefonoInteresadoInputEl = document.getElementById('telefonoInteresado');
    const empresaInteresadoInputEl = document.getElementById('empresaInteresado');
    const localidadInteresadoInputEl = document.getElementById('localidadInteresado');
    const notasInteresadoInputEl = document.getElementById('notasInteresado');
    const btnCancelarEdicionInteresadoEl = document.getElementById('btnCancelarEdicionInteresado');
    const divListaInteresadosEl = document.getElementById('listaInteresados');

    if (formInteresadoEl) {
        initInteresados({
            formInteresado: formInteresadoEl,
            interesadoIdInput: interesadoIdInputEl,
            nombreInteresadoInput: nombreInteresadoInputEl,
            emailInteresadoInput: emailInteresadoInputEl,
            telefonoInteresadoInput: telefonoInteresadoInputEl,
            empresaInteresadoInput: empresaInteresadoInputEl,
            localidadInteresadoInput: localidadInteresadoInputEl,
            notasInteresadoInput: notasInteresadoInputEl,
            btnCancelarEdicionInteresado: btnCancelarEdicionInteresadoEl, 
            listaInteresados: divListaInteresadosEl
        });
    } else {
        console.warn("app.js: Elemento formInteresado no encontrado.");
    }


    // Listeners de Navegación
    if (btnInicio) btnInicio.addEventListener('click', () => { 
        showSection(inicioSection, btnInicio);
    });
    if (btnInteresados) btnInteresados.addEventListener('click', () => {
        showSection(interesadosSection, btnInteresados);
        if (typeof cargarInter === 'function') cargarInter(); 
    });
    if (btnProductos) btnProductos.addEventListener('click', () => {
        showSection(productosSection, btnProductos);
        if (typeof cargarProd === 'function') cargarProd(); 
    });
    if (btnPresupuestos) btnPresupuestos.addEventListener('click', () => { 
        showSection(presupuestosSection, btnPresupuestos);
        if (typeof cargarPresup === 'function') { 
            cargarPresup(); 
        } else {
            console.warn("cargarPresup (de presupuestos.js) no está definida o importada.");
        }
    });

    // Mostrar sección por defecto y cargar sus datos
    if (inicioSection && btnInicio) { 
        showSection(inicioSection, btnInicio); 
    } else if (interesadosSection && btnInteresados) { 
        showSection(interesadosSection, btnInteresados); 
        if (interesadosSection.classList.contains('active') && typeof cargarInter === 'function') {
             cargarInter();
        }
    } 
    
    if (productosSection && productosSection.classList.contains('active') && typeof cargarProd === 'function') {
         cargarProd();
    }
    if (presupuestosSection && presupuestosSection.classList.contains('active') && typeof cargarPresup === 'function') {
         cargarPresup();
    }


    // Listener de Autenticación
    onAuthStateChanged(auth, (user) => {
        if (user) {
            console.log("Usuario autenticado:", user.email);
        } else {
            console.log("Usuario no autenticado.");
        }
    });

}); // Fin del DOMContentLoaded


// Listeners globales para online/offline
window.addEventListener('online', () => {
    console.log('Conexión a internet restablecida.');
    alert('Conexión recuperada. Intentando sincronizar datos pendientes...');
    if (typeof sincronizarProd === 'function') sincronizarProd();
    if (typeof sincronizarPresup === 'function') sincronizarPresup(); // Usa el alias correcto
    if (typeof sincronizarInter === 'function') sincronizarInter(); 
});

window.addEventListener('offline', () => {
    console.log('Se ha perdido la conexión a internet.');
    alert('Has perdido la conexión a internet. Los cambios se guardarán localmente.');
});


// Registrar el Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('ServiceWorker registrado con éxito: ', registration.scope);
            })
            .catch(error => {
                console.log('Error al registrar ServiceWorker: ', error);
            });
    });
}