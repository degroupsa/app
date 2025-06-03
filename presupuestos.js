// presupuestos.js
import {
    db as firestoreDB,
    presupuestosCollection,
    addDoc as firestoreAddDoc,
    getDoc as firestoreGetDoc,
    setDoc as firestoreSetDoc,
    doc as firestoreDoc,
    onSnapshot,
    query,
    orderBy,
    deleteDoc as firestoreDeleteDoc
} from './firebase-service.js';
import { getIdb, PRODUCTOS_STORE_NAME, PRESUPUESTOS_STORE_NAME, INTERESADOS_STORE_NAME } from './indexeddb-handler.js';
import { generarIdTemporal } from './utils.js';

// Elementos del DOM (se asignarán en initPresupuestos)
let btnNuevoPresupuestoEl, areaFormularioPresupuestoEl, formPresupuestoEl, presupuestoIdInputEl,
    // clienteNombreInputEl, clienteEmailInputEl, // Ya no se usan directamente, se reemplazaron por selectInteresado...
    selectProductoPresupuestoEl, cantidadProductoPresupuestoEl, btnAnadirProductoItemEl,
    itemsPresupuestoActualDivEl, terminosPresupuestoInputEl, presupuestoSubtotalSpanEl,
    presupuestoTotalSpanEl, btnCancelarPresupuestoEl, divListaPresupuestosEl, tituloFormPresupuestoEl,
    selectInteresadoParaPresupuestoEl; // Para el selector de interesados

let productosDisponibles = [];
let itemsPresupuestoEnCurso = [];
let presupuestoEnEdicionId = null;
let unsubscribePresupuestosFirestore;

// --- Funciones Auxiliares ---
function calcularTotalesPresupuesto() {
    let subtotalGeneral = 0;
    itemsPresupuestoEnCurso.forEach(item => {
        subtotalGeneral += parseFloat(item.subtotalItem) || 0;
    });
    const montoTotal = subtotalGeneral;

    if (presupuestoSubtotalSpanEl) presupuestoSubtotalSpanEl.textContent = `$${subtotalGeneral.toFixed(2)}`;
    if (presupuestoTotalSpanEl) presupuestoTotalSpanEl.textContent = `$${montoTotal.toFixed(2)}`;
    return { subtotalGeneral, montoTotal };
}

function renderItemsEnFormularioPresupuesto() {
    if (!itemsPresupuestoActualDivEl) return;
    if (itemsPresupuestoEnCurso.length === 0) {
        itemsPresupuestoActualDivEl.innerHTML = "<p><em>Aún no se han añadido productos.</em></p>";
        calcularTotalesPresupuesto();
        return;
    }

    let html = "<ul>";
    itemsPresupuestoEnCurso.forEach((item, index) => {
        const precioUnitario = parseFloat(item.precioUnitarioAlMomento) || 0;
        const subtotalItem = parseFloat(item.subtotalItem) || 0;
        html += `
            <li>
                ${item.cantidad} x ${item.nombreProducto} (@ $${precioUnitario.toFixed(2)}) = $${subtotalItem.toFixed(2)}
                <button type="button" class="btn-quitar-item-presupuesto" data-index="${index}" style="margin-left: 10px; color: red; border: none; background: none; cursor: pointer; font-weight: bold;">X</button>
            </li>
        `;
    });
    html += "</ul>";
    itemsPresupuestoActualDivEl.innerHTML = html;

    itemsPresupuestoActualDivEl.querySelectorAll('.btn-quitar-item-presupuesto').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const itemIndex = parseInt(e.target.dataset.index, 10);
            if (!isNaN(itemIndex) && itemIndex >= 0 && itemIndex < itemsPresupuestoEnCurso.length) {
                itemsPresupuestoEnCurso.splice(itemIndex, 1);
                renderItemsEnFormularioPresupuesto();
            }
        });
    });
    calcularTotalesPresupuesto();
}

async function poblarSelectInteresados() {
    if (!selectInteresadoParaPresupuestoEl) {
        console.warn("presupuestos.js: selectInteresadoParaPresupuestoEl NO está definido.");
        return;
    }
    const idb = getIdb();
    if (!idb) {
        console.warn("presupuestos.js: IDB no disponible para poblar interesados en presupuesto.");
        selectInteresadoParaPresupuestoEl.innerHTML = '<option value="">Error: IDB no disponible</option>';
        return;
    }

    try {
        const transaction = idb.transaction(INTERESADOS_STORE_NAME, 'readonly');
        const store = transaction.objectStore(INTERESADOS_STORE_NAME);
        const interesados = await new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => {
                // Filtrar aquí también por si acaso, aunque interesados.js debería hacerlo
                const resultado = request.result || [];
                resolve(resultado.filter(i => i.status !== 'pending_delete'));
            };
            request.onerror = (event) => reject(event.target.error);
        });

        const interesadosOrdenados = interesados.sort((a, b) => (a.nombreCompleto || "").localeCompare(b.nombreCompleto || ""));

        selectInteresadoParaPresupuestoEl.innerHTML = '<option value="">Seleccione un interesado...</option>';
        if (interesadosOrdenados.length === 0) {
            console.warn("presupuestos.js: No hay interesados disponibles (o válidos) para mostrar en el selector.");
        }

        interesadosOrdenados.forEach(interesado => {
            const option = document.createElement('option');
            option.value = interesado.id;
            option.textContent = `${interesado.nombreCompleto || 'Sin nombre'} (${interesado.email || 'Sin email'})`;
            option.dataset.nombre = interesado.nombreCompleto || '';
            option.dataset.email = interesado.email || '';
            selectInteresadoParaPresupuestoEl.appendChild(option);
        });
        console.log("presupuestos.js: Selector de interesados poblado.");
    } catch (error) {
        console.error("presupuestos.js: Error al poblar select de interesados:", error);
        if (selectInteresadoParaPresupuestoEl) {
             selectInteresadoParaPresupuestoEl.innerHTML = '<option value="">Error al cargar interesados</option>';
        }
    }
}

async function poblarSelectProductos() {
    if (!selectProductoPresupuestoEl) { // Esta es la variable que estaba dando problemas
        console.warn("presupuestos.js: selectProductoPresupuestoEl NO está definido (en poblarSelectProductos).");
        return;
    }
    const idb = getIdb();
    if (!idb) {
        console.warn("presupuestos.js: IDB no disponible para poblar productos en presupuesto.");
        selectProductoPresupuestoEl.innerHTML = '<option value="">Error: IDB no disponible</option>';
        return;
    }

    try {
        const transaction = idb.transaction(PRODUCTOS_STORE_NAME, 'readonly');
        const store = transaction.objectStore(PRODUCTOS_STORE_NAME);
        const productos = await new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => {
                resolve((request.result || []).filter(p => p.status !== 'pending_delete'));
            };
            request.onerror = (event) => {
                console.error("presupuestos.js: Error en request getAll() para productos:", event.target.error);
                reject(event.target.error);
            };
        });

        productosDisponibles = productos.sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));

        selectProductoPresupuestoEl.innerHTML = '<option value="">Seleccione un producto...</option>';
        if (productosDisponibles.length === 0) {
            console.warn("presupuestos.js: No hay productos disponibles (o válidos) para mostrar en el selector.");
        }

        productosDisponibles.forEach(p => {
            const option = document.createElement('option');
            option.value = p.id;
            const precioActual = p.precio !== undefined && p.precio !== null ? parseFloat(p.precio).toFixed(2) : 'N/A';
            option.textContent = `${p.nombre} ($${precioActual})`;
            option.dataset.precio = p.precio;
            option.dataset.nombre = p.nombre;
            selectProductoPresupuestoEl.appendChild(option);
        });
        console.log("presupuestos.js: Selector de productos poblado.");
    } catch (error) {
        console.error("presupuestos.js: Error general al poblar select de productos para presupuesto:", error);
        if (selectProductoPresupuestoEl) {
             selectProductoPresupuestoEl.innerHTML = '<option value="">Error al cargar productos</option>';
        }
    }
}

function resetFormularioPresupuesto() {
    if (formPresupuestoEl) formPresupuestoEl.reset();
    if (presupuestoIdInputEl) presupuestoIdInputEl.value = '';
    itemsPresupuestoEnCurso = [];
    presupuestoEnEdicionId = null;
    renderItemsEnFormularioPresupuesto();
    if (tituloFormPresupuestoEl) tituloFormPresupuestoEl.textContent = "Nuevo Presupuesto";
    if (formPresupuestoEl) {
        const submitButton = formPresupuestoEl.querySelector('button[type="submit"]');
        if(submitButton) submitButton.textContent = 'Guardar Presupuesto';
    }
    if (areaFormularioPresupuestoEl) areaFormularioPresupuestoEl.style.display = 'none';
    if(selectInteresadoParaPresupuestoEl) selectInteresadoParaPresupuestoEl.value = ""; // Resetear también el select de interesados
    if(selectProductoPresupuestoEl) selectProductoPresupuestoEl.value = "";
    if(cantidadProductoPresupuestoEl) cantidadProductoPresupuestoEl.value = 1;
}

function handleAnadirProductoItem() {
    if (!selectProductoPresupuestoEl || !cantidadProductoPresupuestoEl) {
        console.warn("No se puede añadir producto, selectProducto o cantidad no definidos.");
        return;
    }
    const productoId = selectProductoPresupuestoEl.value;
    const cantidad = parseInt(cantidadProductoPresupuestoEl.value, 10);

    if (!productoId || isNaN(cantidad) || cantidad <= 0) {
        alert("Seleccione un producto y una cantidad válida.");
        return;
    }
    const productoSeleccionadoOption = selectProductoPresupuestoEl.options[selectProductoPresupuestoEl.selectedIndex];
    if (!productoSeleccionadoOption || !productoSeleccionadoOption.dataset.nombre || productoSeleccionadoOption.value === "") {
         alert("Producto no válido seleccionado.");
        return;
    }
    const nombreProducto = productoSeleccionadoOption.dataset.nombre;
    const precioUnitario = parseFloat(productoSeleccionadoOption.dataset.precio);

    if (isNaN(precioUnitario)) {
        alert("El producto seleccionado no tiene un precio válido.");
        return;
    }
    itemsPresupuestoEnCurso.push({
        productoId: productoId,
        nombreProducto: nombreProducto,
        cantidad: cantidad,
        precioUnitarioAlMomento: precioUnitario,
        subtotalItem: precioUnitario * cantidad
    });
    renderItemsEnFormularioPresupuesto();
    selectProductoPresupuestoEl.value = '';
    cantidadProductoPresupuestoEl.value = 1;
    selectProductoPresupuestoEl.focus();
}

async function cargarPresupuestoParaEdicion(idPresupuesto) {
    console.log("Cargando presupuesto para edición ID:", idPresupuesto);
    const idb = getIdb();
    let presupuesto;

    if (idb) {
        try {
            const transaction = idb.transaction(PRESUPUESTOS_STORE_NAME, 'readonly');
            const store = transaction.objectStore(PRESUPUESTOS_STORE_NAME);
            presupuesto = await new Promise((resolve, reject) => {
                const request = store.get(idPresupuesto);
                request.onsuccess = () => resolve(request.result);
                request.onerror = (event) => reject(event.target.error);
            });
        } catch (error) {
            console.error("Error cargando presupuesto desde IDB para edición:", error);
        }
    }

    if (!presupuesto && navigator.onLine) {
        try {
            console.log("Presupuesto no encontrado en IDB o se prefiere online, buscando en Firestore para edición...");
            const docRef = firestoreDoc(firestoreDB, "presupuestos", idPresupuesto);
            const docSnap = await firestoreGetDoc(docRef);
            if (docSnap.exists()) {
                presupuesto = { id: docSnap.id, ...docSnap.data() };
                if (presupuesto.fechaCreacion && presupuesto.fechaCreacion.toDate) {
                    presupuesto.fechaCreacion = presupuesto.fechaCreacion.toDate();
                }
                if (presupuesto.actualizadoEn && presupuesto.actualizadoEn.toDate) {
                    presupuesto.actualizadoEn = presupuesto.actualizadoEn.toDate();
                }
            } else {
                alert("Presupuesto no encontrado en Firestore.");
                return;
            }
        } catch (error) {
            console.error("Error cargando presupuesto desde Firestore para edición:", error);
            alert("Error al cargar datos del presupuesto.");
            return;
        }
    }

    if (!presupuesto) {
        alert("No se pudo cargar el presupuesto para editar.");
        return;
    }

    resetFormularioPresupuesto();

    presupuestoEnEdicionId = presupuesto.id;
    if(presupuestoIdInputEl) presupuestoIdInputEl.value = presupuesto.id;
    // Los campos nombreCliente y emailCliente ya no se llenan directamente desde inputs,
    // se manejarán a través del select de interesados.
    if(terminosPresupuestoInputEl) terminosPresupuestoInputEl.value = presupuesto.terminosCondiciones || '';

    if (formPresupuestoEl && presupuesto.fechaCreacion) {
        formPresupuestoEl.dataset.fechaCreacionOriginal = (presupuesto.fechaCreacion instanceof Date)
            ? presupuesto.fechaCreacion.toISOString()
            : presupuesto.fechaCreacion;
    }

    itemsPresupuestoEnCurso = presupuesto.items ? JSON.parse(JSON.stringify(presupuesto.items)) : [];
    renderItemsEnFormularioPresupuesto();

    if(tituloFormPresupuestoEl) tituloFormPresupuestoEl.textContent = "Editar Presupuesto";
    if(formPresupuestoEl) {
        const submitButton = formPresupuestoEl.querySelector('button[type="submit"]');
        if(submitButton) submitButton.textContent = 'Actualizar Presupuesto';
    }
    if(areaFormularioPresupuestoEl) areaFormularioPresupuestoEl.style.display = 'block';
    
    await poblarSelectProductos(); // Esperar a que se pueblen los productos
    await poblarSelectInteresados(); // Esperar a que se pueblen los interesados
    
    if (selectInteresadoParaPresupuestoEl && presupuesto.interesadoId) {
        selectInteresadoParaPresupuestoEl.value = presupuesto.interesadoId;
    } else if (selectInteresadoParaPresupuestoEl && !presupuesto.interesadoId && presupuesto.nombreCliente) {
        console.warn("Presupuesto antiguo sin interesadoId, se deberá seleccionar manualmente o implementar lógica de búsqueda.");
    }

    if(selectInteresadoParaPresupuestoEl) selectInteresadoParaPresupuestoEl.focus(); // O el primer campo relevante
}

async function handleGuardarPresupuesto(event) {
    event.preventDefault();
    const idb = getIdb();

    const interesadoIdSeleccionado = selectInteresadoParaPresupuestoEl.value;
    const opcionSeleccionada = selectInteresadoParaPresupuestoEl.options[selectInteresadoParaPresupuestoEl.selectedIndex];
    const nombreCliente = opcionSeleccionada && opcionSeleccionada.dataset.nombre ? opcionSeleccionada.dataset.nombre : '';
    const emailCliente = opcionSeleccionada && opcionSeleccionada.dataset.email ? opcionSeleccionada.dataset.email : '';
    const terminos = terminosPresupuestoInputEl.value.trim();

    if (!interesadoIdSeleccionado) {
        alert("Por favor, seleccione un interesado.");
        return;
    }
    if (itemsPresupuestoEnCurso.length === 0) {
        alert("Añada al menos un producto al presupuesto.");
        return;
    }

    const { subtotalGeneral, montoTotal } = calcularTotalesPresupuesto();
    let esEdicion = !!presupuestoEnEdicionId;
    let presupuestoData;

    if (esEdicion) {
        presupuestoData = {
            id: presupuestoEnEdicionId,
            interesadoId: interesadoIdSeleccionado,
            nombreCliente: nombreCliente,
            emailCliente: emailCliente,
            fechaCreacion: formPresupuestoEl.dataset.fechaCreacionOriginal || new Date().toISOString(),
            actualizadoEn: new Date(),
            items: itemsPresupuestoEnCurso,
            subtotalGeneral: subtotalGeneral,
            montoTotal: montoTotal,
            terminosCondiciones: terminos,
            emailStatus: 'pending',
            statusPresupuesto: 'borrador_editado',
            needsSync: !navigator.onLine,
            esOffline: !navigator.onLine
        };
    } else {
        presupuestoData = {
            interesadoId: interesadoIdSeleccionado,
            nombreCliente: nombreCliente,
            emailCliente: emailCliente,
            fechaCreacion: new Date(),
            items: itemsPresupuestoEnCurso,
            subtotalGeneral: subtotalGeneral,
            montoTotal: montoTotal,
            terminosCondiciones: terminos,
            emailStatus: 'pending',
            statusPresupuesto: 'borrador',
            needsSync: !navigator.onLine,
            esOffline: !navigator.onLine
        };
    }

    try {
        let idOperacion;
        let presupuestoParaIDB;

        if (esEdicion) {
            idOperacion = presupuestoEnEdicionId;
            const { id, needsSync, esOffline, ...datosFirestore } = { ...presupuestoData };
            datosFirestore.fechaCreacion = new Date(presupuestoData.fechaCreacion);
            datosFirestore.actualizadoEn = new Date(presupuestoData.actualizadoEn);

            presupuestoParaIDB = { ...presupuestoData };
            presupuestoParaIDB.fechaCreacion = (presupuestoData.fechaCreacion instanceof Date) ? presupuestoData.fechaCreacion.toISOString() : presupuestoData.fechaCreacion;
            presupuestoParaIDB.actualizadoEn = (presupuestoData.actualizadoEn instanceof Date) ? presupuestoData.actualizadoEn.toISOString() : presupuestoData.actualizadoEn;

            if (navigator.onLine) {
                const docRef = firestoreDoc(firestoreDB, "presupuestos", idOperacion);
                await firestoreSetDoc(docRef, datosFirestore, { merge: true });
                console.log("Presupuesto actualizado en Firestore con ID:", idOperacion);
                presupuestoParaIDB.needsSync = false;
                presupuestoParaIDB.esOffline = false;
            } else {
                console.log("Offline: Actualización de presupuesto guardada localmente.");
                // needsSync y esOffline ya son true
            }
        } else {
             const { id, needsSync, esOffline, ...presupuestoParaFirestore } = { ...presupuestoData };
             // Convertir fecha a objeto Date si es string (ya debería ser Date desde la creación)
             presupuestoParaFirestore.fechaCreacion = (presupuestoData.fechaCreacion instanceof Date) ? presupuestoData.fechaCreacion : new Date(presupuestoData.fechaCreacion);

            if (navigator.onLine) {
                const docRef = await firestoreAddDoc(presupuestosCollection, presupuestoParaFirestore);
                idOperacion = docRef.id;
                console.log("Presupuesto guardado en Firestore con ID:", idOperacion);
                presupuestoParaIDB = {
                    ...presupuestoData,
                    id: idOperacion,
                    fechaCreacion: presupuestoData.fechaCreacion.toISOString(),
                    needsSync: false,
                    esOffline: false
                };
            } else {
                idOperacion = generarIdTemporal();
                console.log("Offline: Guardando presupuesto en IndexedDB con ID temporal:", idOperacion);
                presupuestoParaIDB = {
                    ...presupuestoData,
                    id: idOperacion,
                    fechaCreacion: presupuestoData.fechaCreacion.toISOString(),
                    needsSync: true,
                    esOffline: true
                };
            }
        }

        if (idb) {
            const transaction = idb.transaction(PRESUPUESTOS_STORE_NAME, 'readwrite');
            const store = transaction.objectStore(PRESUPUESTOS_STORE_NAME);
            store.put(presupuestoParaIDB);
            await new Promise((resolve, reject) => {
                transaction.oncomplete = resolve;
                transaction.onerror = (event) => reject(event.target.error);
            });
            console.log("Presupuesto guardado/actualizado en IndexedDB con ID:", idOperacion);
            alert(esEdicion ? (navigator.onLine ? "Presupuesto actualizado exitosamente." : "Estás offline. Cambios al presupuesto guardados localmente.") : (navigator.onLine ? "Presupuesto guardado exitosamente." : "Estás offline. Presupuesto guardado localmente."));
        } else {
             alert("Error: No se pudo guardar/actualizar presupuesto localmente. Base de datos no disponible.");
        }
        resetFormularioPresupuesto();
        if (typeof cargarYMostrarPresupuestos === 'function') cargarYMostrarPresupuestos();
    } catch (error) {
        console.error("Error al guardar/actualizar presupuesto:", error);
        alert("Error al guardar/actualizar el presupuesto. Revisa la consola.");
    }
}

function actualizarListaPresupuestosHTML(presupuestos, esActualizacionDesdeFirestore) {
    if (!divListaPresupuestosEl) {
        console.warn("actualizarListaPresupuestosHTML: divListaPresupuestosEl no está definido.");
        return;
    }
    const presupuestosVisibles = presupuestos.filter(p => p.statusPresupuesto !== 'pending_delete');

    let mensajeFuente = "Lista de presupuestos";
     if (presupuestosVisibles.some(p => p.needsSync || p.esOffline)) {
        mensajeFuente += " (con items offline pendientes)";
    } else if (esActualizacionDesdeFirestore) {
        mensajeFuente += " (sincronizado con la nube)";
    } else if (presupuestosVisibles.length > 0){
        mensajeFuente += " (desde local)";
    }

    if (!presupuestosVisibles || presupuestosVisibles.length === 0) {
        divListaPresupuestosEl.innerHTML = `<p>No hay presupuestos registrados.</p><p style="font-size:0.8em; color:grey;">${mensajeFuente}</p>`;
        return;
    }

    let htmlPresupuestos = `<ul><p style="font-size:0.8em; color:grey;">${mensajeFuente}</p>`;
    presupuestosVisibles.sort((a,b) => new Date(b.fechaCreacion) - new Date(a.fechaCreacion));

    presupuestosVisibles.forEach(presupuesto => {
        const fecha = presupuesto.fechaCreacion ? new Date(presupuesto.fechaCreacion).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Fecha N/A';
        const indicadorOffline = presupuesto.needsSync ? ' <strong>(Pendiente Sync)</strong>' : (presupuesto.esOffline ? ' (Local)' : '');
        const total = presupuesto.montoTotal !== undefined ? parseFloat(presupuesto.montoTotal).toFixed(2) : '0.00';

        htmlPresupuestos += `
            <li data-id="${presupuesto.id}" style="border-bottom: 1px solid #eee; padding-bottom: 5px; margin-bottom: 5px;">
                <strong>Cliente: ${presupuesto.nombreCliente || 'N/A'}</strong>${indicadorOffline}<br>
                Email: ${presupuesto.emailCliente || 'N/A'} | Total: $${total}<br>
                Fecha: ${fecha} | Estado: ${presupuesto.statusPresupuesto || 'Borrador'}<br>
                <small>ID Pres: ${presupuesto.id.length > 20 ? presupuesto.id.substring(0,10)+'...' : presupuesto.id}</small>
                ${presupuesto.interesadoId ? `<small> | ID Int: ${presupuesto.interesadoId.length > 20 ? presupuesto.interesadoId.substring(0,10)+'...' : presupuesto.interesadoId}</small>` : ''}
                <button type="button" class="btn-editar-presupuesto" data-id="${presupuesto.id}" style="margin-left: 5px; font-size: 0.8em;">Editar</button>
                <button type="button" class="btn-eliminar-presupuesto" data-id="${presupuesto.id}" style="margin-left: 5px; font-size: 0.8em; color: red;">Eliminar</button>
            </li>`;
    });
    htmlPresupuestos += "</ul>";
    divListaPresupuestosEl.innerHTML = htmlPresupuestos;

    divListaPresupuestosEl.querySelectorAll('.btn-editar-presupuesto').forEach(btn => {
        btn.addEventListener('click', (e) => cargarPresupuestoParaEdicion(e.target.dataset.id));
    });
    divListaPresupuestosEl.querySelectorAll('.btn-eliminar-presupuesto').forEach(btn => {
        btn.addEventListener('click', (e) => handleEliminarPresupuestoClick(e.target.dataset.id));
    });
}

async function handleEliminarPresupuestoClick(idPresupuesto) {
    if (confirm(`¿Estás seguro de que quieres eliminar el presupuesto ID: ${idPresupuesto}? Esta acción no se puede deshacer.`)) {
        await eliminarPresupuesto(idPresupuesto);
    }
}

async function eliminarPresupuesto(id) {
    const idb = getIdb();
    if (!idb) {
        alert("Error: Base de datos local no disponible.");
        return;
    }

    if (id.startsWith('offline_')) {
        try {
            const transaction = idb.transaction(PRESUPUESTOS_STORE_NAME, 'readwrite');
            const store = transaction.objectStore(PRESUPUESTOS_STORE_NAME);
            store.delete(id);
            await new Promise((resolve, reject) => {
                transaction.oncomplete = resolve;
                transaction.onerror = (event) => reject(event.target.error);
            });
            console.log("Presupuesto offline eliminado de IDB:", id);
        } catch (error) { console.error("Error eliminando presupuesto offline de IDB:", error); }
    } else if (!navigator.onLine) {
        try {
            const transaction = idb.transaction(PRESUPUESTOS_STORE_NAME, 'readwrite');
            const store = transaction.objectStore(PRESUPUESTOS_STORE_NAME);
            const presupuesto = await new Promise((res, rej) => { const r = store.get(id); r.onsuccess = () => res(r.result); r.onerror = e => rej(e.target.error); });
            if (presupuesto) {
                presupuesto.needsSync = true;
                presupuesto.statusPresupuesto = 'pending_delete';
                presupuesto.deletedOfflineTimestamp = new Date().toISOString();
                store.put(presupuesto);
                await new Promise((resolve, reject) => { transaction.oncomplete = resolve; transaction.onerror = (event) => reject(event.target.error); });
                console.log("Presupuesto marcado para eliminar en IDB:", id);
                alert("Estás offline. Presupuesto marcado para eliminar.");
            } else {
                console.warn("No se encontró el presupuesto en IDB para marcar como eliminado:", id);
            }
        } catch (error) { console.error("Error marcando presupuesto para eliminar en IDB:", error); alert("Error al marcar el presupuesto para eliminar localmente.");}
    } else { // Online
        try {
            const presupuestoRef = firestoreDoc(firestoreDB, "presupuestos", id);
            await firestoreDeleteDoc(presupuestoRef);
            console.log("Presupuesto eliminado de Firestore:", id);
            const transaction = idb.transaction(PRESUPUESTOS_STORE_NAME, 'readwrite');
            const store = transaction.objectStore(PRESUPUESTOS_STORE_NAME);
            store.delete(id);
            await new Promise((resolve, reject) => { transaction.oncomplete = resolve; transaction.onerror = (event) => reject(event.target.error); });
            console.log("Presupuesto eliminado de IDB:", id);
        } catch (error) { console.error("Error eliminando presupuesto online:", error); alert("Error al eliminar el presupuesto.");}
    }
    if (typeof cargarYMostrarPresupuestos === 'function') cargarYMostrarPresupuestos(); // Refrescar siempre
}

export async function cargarYMostrarPresupuestos() {
    const idb = getIdb();
    if (!divListaPresupuestosEl) {
        divListaPresupuestosEl = document.getElementById('listaPresupuestos');
        if (!divListaPresupuestosEl) {
            console.warn("divListaPresupuestosEl no se pudo encontrar en cargarYMostrarPresupuestos.");
            return;
        }
    }
    if (!idb) {
        if (divListaPresupuestosEl) divListaPresupuestosEl.innerHTML = "<p>Esperando inicialización de base de datos local...</p>";
        setTimeout(cargarYMostrarPresupuestos, 1000);
        return;
    }

    try {
        const transaction = idb.transaction(PRESUPUESTOS_STORE_NAME, 'readonly');
        const store = transaction.objectStore(PRESUPUESTOS_STORE_NAME);
        const todosLosPresupuestosLocal = await new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = (event) => reject(event.target.error);
        });
        actualizarListaPresupuestosHTML(todosLosPresupuestosLocal || [], false);
    } catch (error) {
        console.error("Error al cargar presupuestos desde IndexedDB:", error);
        if (divListaPresupuestosEl) divListaPresupuestosEl.innerHTML = "<p>Error al cargar presupuestos locales.</p>";
    }

    if (unsubscribePresupuestosFirestore) {
        unsubscribePresupuestosFirestore();
    }

    const q = query(presupuestosCollection, orderBy("fechaCreacion", "desc"));
    unsubscribePresupuestosFirestore = onSnapshot(q, async (snapshot) => {
        console.log("Datos recibidos de Firestore (presupuestos)");
        const presupuestosDesdeFirestore = [];
        snapshot.forEach(docSnapshot => presupuestosDesdeFirestore.push({ id: docSnapshot.id, ...docSnapshot.data() }));
        
        const idb = getIdb();
        if (idb) {
            try {
                const transactionIDB_sync = idb.transaction(PRESUPUESTOS_STORE_NAME, 'readwrite');
                const storeIDB_sync = transactionIDB_sync.objectStore(PRESUPUESTOS_STORE_NAME);
                const firestoreIds = new Set(presupuestosDesdeFirestore.map(p => p.id));
                const todosLosPresupuestosIDBActuales = await new Promise((res, rej) => { const r = storeIDB_sync.getAll(); r.onsuccess = () => res(r.result); r.onerror = e => rej(e.target.error); });

                for (const presupuestoIDB of todosLosPresupuestosIDBActuales) {
                    if (!presupuestoIDB.id.startsWith('offline_') && !presupuestoIDB.needsSync && !firestoreIds.has(presupuestoIDB.id)) {
                        storeIDB_sync.delete(presupuestoIDB.id);
                    }
                }
                for (const presupuestoFS of presupuestosDesdeFirestore) {
                    const presupuestoParaIDB = { ...presupuestoFS };
                    if (presupuestoFS.fechaCreacion && presupuestoFS.fechaCreacion.toDate) {
                        presupuestoParaIDB.fechaCreacion = presupuestoFS.fechaCreacion.toDate().toISOString();
                    }
                    if (presupuestoFS.actualizadoEn && presupuestoFS.actualizadoEn.toDate) {
                        presupuestoParaIDB.actualizadoEn = presupuestoFS.actualizadoEn.toDate().toISOString();
                    }
                    presupuestoParaIDB.needsSync = false;
                    presupuestoParaIDB.esOffline = false;
                    storeIDB_sync.put(presupuestoParaIDB);
                }
                await new Promise((resolve, reject) => { transactionIDB_sync.oncomplete = resolve; transactionIDB_sync.onerror = (event) => reject(event.target.error); });

                const finalTx = idb.transaction(PRESUPUESTOS_STORE_NAME, 'readonly');
                const finalStore = finalTx.objectStore(PRESUPUESTOS_STORE_NAME);
                const todosParaUI = await new Promise((res, rej) => { const r = finalStore.getAll(); r.onsuccess = () => res(r.result); r.onerror = e => rej(e.target.error); });
                actualizarListaPresupuestosHTML(todosParaUI || [], true);
            } catch (error) {
                console.error("Error en onSnapshot al actualizar IDB y UI (presupuestos):", error);
                actualizarListaPresupuestosHTML(presupuestosDesdeFirestore, true);
            }
        } else {
            actualizarListaPresupuestosHTML(presupuestosDesdeFirestore, true);
        }
    }, (error) => {
        console.error("Error al obtener presupuestos de Firestore: ", error);
    });
}

export async function sincronizarPresupuestosPendientes() {
    const idb = getIdb();
    if (!idb || !navigator.onLine) return;
    console.log("Iniciando sincronización de presupuestos pendientes...");
    
    let presupuestosParaSincronizar;
    try {
        const readTx = idb.transaction(PRESUPUESTOS_STORE_NAME, 'readonly');
        const storeRead = readTx.objectStore(PRESUPUESTOS_STORE_NAME);
        const locales = await new Promise((res, rej) => { const r = storeRead.getAll(); r.onsuccess = () => res(r.result || []); r.onerror = e => rej(e.target.error); });
        presupuestosParaSincronizar = locales.filter(p => p.needsSync === true);
    } catch (error) {
        console.error("Error leyendo presupuestos para sync:", error);
        return;
    }

    if (presupuestosParaSincronizar.length === 0) {
        console.log("No hay presupuestos para sincronizar.");
        return;
    }
    console.log(`Sincronizando ${presupuestosParaSincronizar.length} presupuesto(s)...`);

    for (const presupuestoLocal of presupuestosParaSincronizar) {
        const { id: localId, needsSync, esOffline, statusPresupuesto, ...datosNetosOriginal } = presupuestoLocal;
        let datosParaFirestore = { ...datosNetosOriginal };
        
        if (datosParaFirestore.fechaCreacion && typeof datosParaFirestore.fechaCreacion === 'string') {
            datosParaFirestore.fechaCreacion = new Date(datosParaFirestore.fechaCreacion);
        }
        if (datosParaFirestore.actualizadoEn && typeof datosParaFirestore.actualizadoEn === 'string') {
            datosParaFirestore.actualizadoEn = new Date(datosParaFirestore.actualizadoEn);
        }
        delete datosParaFirestore.deletedOfflineTimestamp;

        try {
            if (localId.startsWith('offline_') && statusPresupuesto !== 'pending_delete') {
                delete datosParaFirestore.id;
                const docRef = await firestoreAddDoc(presupuestosCollection, datosParaFirestore);
                console.log("Presupuesto NUEVO sincronizado. ID Local:", localId, "ID Firestore:", docRef.id);
                const tx = idb.transaction(PRESUPUESTOS_STORE_NAME, 'readwrite');
                const store = tx.objectStore(PRESUPUESTOS_STORE_NAME);
                store.delete(localId);
                const sincronizado = { ...datosNetosOriginal, id: docRef.id, fechaCreacion: datosParaFirestore.fechaCreacion.toISOString(), actualizadoEn: datosParaFirestore.actualizadoEn?.toISOString(), needsSync: false, esOffline: false, statusPresupuesto: datosNetosOriginal.statusPresupuesto };
                store.put(sincronizado);
                await new Promise(r => tx.oncomplete = r);
            } else if (statusPresupuesto === 'pending_delete') {
                const docRef = firestoreDoc(firestoreDB, "presupuestos", localId);
                await firestoreDeleteDoc(docRef);
                console.log("Presupuesto eliminado de Firestore. ID:", localId);
                const tx = idb.transaction(PRESUPUESTOS_STORE_NAME, 'readwrite');
                tx.objectStore(PRESUPUESTOS_STORE_NAME).delete(localId);
                await new Promise(r => tx.oncomplete = r);
            } else if (!localId.startsWith('offline_') && statusPresupuesto !== 'pending_delete') {
                datosParaFirestore.actualizadoEn = new Date();
                const { id, ...datosUpdateFS } = datosParaFirestore;
                const docRef = firestoreDoc(firestoreDB, "presupuestos", localId);
                await firestoreSetDoc(docRef, datosUpdateFS, { merge: true });
                console.log("Presupuesto actualizado en Firestore. ID:", localId);
                const tx = idb.transaction(PRESUPUESTOS_STORE_NAME, 'readwrite');
                const store = tx.objectStore(PRESUPUESTOS_STORE_NAME);
                const actualizadoIDB = { ...presupuestoLocal, ...datosUpdateFS, actualizadoEn: datosParaFirestore.actualizadoEn.toISOString(), needsSync: false, esOffline: false };
                delete actualizadoIDB.statusPresupuesto;
                store.put(actualizadoIDB);
                await new Promise(r => tx.oncomplete = r);
            }
        } catch (error) {
            console.error(`Error sincronizando presupuesto ID ${localId}:`, error);
        }
    }
    console.log("Sincronización de presupuestos completada.");
}

export function initPresupuestos(elements) {
    console.log("presupuestos.js: initPresupuestos fue llamada con elements:", elements);

    // Asignación correcta de todos los elementos del DOM
    btnNuevoPresupuestoEl = elements.btnNuevoPresupuesto;
    areaFormularioPresupuestoEl = elements.areaFormularioPresupuesto;
    formPresupuestoEl = elements.formPresupuesto;
    presupuestoIdInputEl = elements.presupuestoIdInput;
    // clienteNombreInputEl y clienteEmailInputEl ya no son necesarios si se usa el select de interesados
    selectProductoPresupuestoEl = elements.selectProductoPresupuesto; // <--- CORRECCIÓN CLAVE
    selectInteresadoParaPresupuestoEl = elements.selectInteresadoParaPresupuesto; // Para el selector de interesados
    cantidadProductoPresupuestoEl = elements.cantidadProductoPresupuesto;
    btnAnadirProductoItemEl = elements.btnAnadirProductoItem;
    itemsPresupuestoActualDivEl = elements.itemsPresupuestoActual;
    terminosPresupuestoInputEl = elements.terminosPresupuesto;
    presupuestoSubtotalSpanEl = elements.presupuestoSubtotal;
    presupuestoTotalSpanEl = elements.presupuestoTotal;
    btnCancelarPresupuestoEl = elements.btnCancelarPresupuesto;
    divListaPresupuestosEl = elements.listaPresupuestos;
    tituloFormPresupuestoEl = elements.tituloFormPresupuesto;
    
    // Verificar si los elementos cruciales existen antes de añadir listeners
    if (selectProductoPresupuestoEl) {
        console.log("presupuestos.js: selectProductoPresupuestoEl asignado:", selectProductoPresupuestoEl);
    } else {
        console.error("presupuestos.js: elements.selectProductoPresupuesto NO FUE RECIBIDO o es nulo en initPresupuestos.");
    }
     if (selectInteresadoParaPresupuestoEl) {
        console.log("presupuestos.js: selectInteresadoParaPresupuestoEl asignado:", selectInteresadoParaPresupuestoEl);
    } else {
        console.warn("presupuestos.js: elements.selectInteresadoParaPresupuesto NO FUE RECIBIDO o es nulo en initPresupuestos. La selección de interesados no funcionará.");
    }


    if (btnNuevoPresupuestoEl) {
        btnNuevoPresupuestoEl.addEventListener('click', () => {
            presupuestoEnEdicionId = null;
            resetFormularioPresupuesto();
            if (areaFormularioPresupuestoEl) areaFormularioPresupuestoEl.style.display = 'block';
            if (tituloFormPresupuestoEl) tituloFormPresupuestoEl.textContent = "Nuevo Presupuesto";
            
            // Poblar ambos selectores
            if (typeof poblarSelectProductos === 'function') poblarSelectProductos();
            if (typeof poblarSelectInteresados === 'function') poblarSelectInteresados();
            
            if (selectInteresadoParaPresupuestoEl) { // Poner foco en el primer selector visible
                selectInteresadoParaPresupuestoEl.focus();
            } else if (selectProductoPresupuestoEl) {
                 selectProductoPresupuestoEl.focus();
            }
        });
    }

    if (btnCancelarPresupuestoEl) {
        btnCancelarPresupuestoEl.addEventListener('click', resetFormularioPresupuesto);
    }

    if (btnAnadirProductoItemEl) {
        btnAnadirProductoItemEl.addEventListener('click', handleAnadirProductoItem);
    }

    if (formPresupuestoEl) {
        formPresupuestoEl.addEventListener('submit', handleGuardarPresupuesto);
    }

    console.log("Módulo de Presupuestos inicializado.");
    if (typeof cargarYMostrarPresupuestos === 'function') {
         cargarYMostrarPresupuestos();
    }
}