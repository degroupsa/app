// productos.js
import { 
    auth, db, productosCollection, addDoc, getDoc, setDoc, deleteDoc, onSnapshot, query, orderBy, doc 
} from './firebase-service.js';
import { getIdb, PRODUCTOS_STORE_NAME } from './indexeddb-handler.js';
import { generarIdTemporal } from './utils.js';

// Variables del módulo para los elementos del DOM
let formProductoEl, productoIdInputEl, nombreProductoInputEl, 
    descripcionProductoInputEl, precioProductoInputEl, unidadProductoInputEl, 
    btnCancelarEdicionProductoEl, divListaProductosEl;

let unsubscribeProductosFirestore;

// --- Funciones Internas del Módulo ---

// FUNCIÓN PARA OBTENER EL VALOR NUMÉRICO REAL DEL PRECIO (ELIMINA PUNTOS Y NO DÍGITOS)
function getPrecioNumerico(value) {
    if (typeof value !== 'string' || !value) return 0;
    const numeroLimpio = value.replace(/\D/g, ''); // Elimina todo lo que NO sea dígito
    const numero = parseInt(numeroLimpio, 10);
    return isNaN(numero) ? 0 : numero; // Devuelve 0 si después de limpiar no es un número
}

// FUNCIÓN PARA FORMATEAR UN NÚMERO A MONEDA ARS CON PUNTOS DE MILES PARA VISUALIZACIÓN
function formatPrecioArsDisplay(value) {
    const numero = parseInt(value, 10); // Asegurarse de que es un número
    if (isNaN(numero)) {
        return ''; // Devolver vacío si no es un número válido o es 0 y se prefiere vacío
    }
    // Usamos 'es-AR' para el formato de miles con punto.
    return numero.toLocaleString('es-AR'); 
}

function resetFormularioProducto() {
    if(formProductoEl) formProductoEl.reset();
    if(productoIdInputEl) productoIdInputEl.value = '';
    if(btnCancelarEdicionProductoEl) btnCancelarEdicionProductoEl.style.display = 'none';
    if(formProductoEl) {
        const submitButton = formProductoEl.querySelector('button[type="submit"]');
        if(submitButton) submitButton.textContent = 'Guardar Producto';
    }
    if(unidadProductoInputEl) unidadProductoInputEl.value = '1'; 
    if(precioProductoInputEl) precioProductoInputEl.value = ''; 
}

async function handleProductoSubmit(event) {
    console.log("productos.js: handleProductoSubmit INICIADO.");
    if (event) {
        event.preventDefault();
    } else {
        console.error("productos.js: ¡No se recibió el objeto event en handleProductoSubmit!");
        return; 
    }

    const nombre = nombreProductoInputEl.value.trim();
    const descripcion = descripcionProductoInputEl.value.trim();
    const precio = getPrecioNumerico(precioProductoInputEl.value); // Usa la función para limpiar y parsear
    const unidad = parseInt(unidadProductoInputEl.value, 10); 
    const productoId = productoIdInputEl.value;

    if (!nombre || isNaN(precio) || precio < 0 || isNaN(unidad) || unidad < 1) {
        alert("Por favor, completa el nombre, un precio válido (número entero sin centavos) y una cantidad válida para la unidad (número entero mayor o igual a 1).");
        return;
    }

    let productoDataParaIDB;
    let idOperacion = productoId; 
    const esEdicion = !!productoId;

    try {
        if (esEdicion) { 
            const firestoreData = { 
                nombre: nombre,
                descripcion: descripcion,
                precio: precio, 
                unidad: unidad, 
                actualizadoEn: new Date() 
            };
            productoDataParaIDB = { 
                id: productoId,
                nombre: nombre,
                descripcion: descripcion,
                precio: precio,
                unidad: unidad,
                actualizadoEn: firestoreData.actualizadoEn.toISOString(),
                needsSync: !navigator.onLine, 
                esOffline: !navigator.onLine
            };
            idOperacion = productoId;

            if (navigator.onLine) {
                const productoRef = doc(db, "productos", productoId);
                await setDoc(productoRef, firestoreData, { merge: true });
                console.log("Producto actualizado en Firestore con ID: ", productoId);
                productoDataParaIDB.needsSync = false; 
                productoDataParaIDB.esOffline = false;
            } else {
                console.log("Offline: Actualización de producto guardada localmente para sincronizar.");
                alert("Estás offline. Cambios al producto guardados localmente.");
            }
        } else { 
            idOperacion = generarIdTemporal(); 
            productoDataParaIDB = {
                id: idOperacion,
                nombre: nombre,
                descripcion: descripcion,
                precio: precio, 
                unidad: unidad, 
                creadoEn: new Date().toISOString(),
                needsSync: !navigator.onLine,
                esOffline: !navigator.onLine
            };

            if (navigator.onLine) {
                console.log("Online: Creando producto en Firestore...");
                const firestoreDataParaCrear = { 
                    nombre, 
                    descripcion, 
                    precio, 
                    unidad, 
                    creadoEn: new Date(productoDataParaIDB.creadoEn) 
                };
                const docRef = await addDoc(productosCollection, firestoreDataParaCrear);
                
                idOperacion = docRef.id; 
                productoDataParaIDB.id = idOperacion; 
                productoDataParaIDB.needsSync = false;
                productoDataParaIDB.esOffline = false;
                console.log("Producto guardado en Firestore con ID: ", idOperacion);
            } else {
                console.log("Offline: Creando producto solo en IndexedDB con ID temporal: ", idOperacion);
                alert("Estás offline. Producto guardado localmente, se sincronizará cuando vuelvas a tener conexión.");
            }
        }

        const idb = getIdb();
        if (idb) {
            const transaction = idb.transaction(PRODUCTOS_STORE_NAME, 'readwrite');
            const store = transaction.objectStore(PRODUCTOS_STORE_NAME);
            store.put(productoDataParaIDB); 
            await new Promise((resolve, reject) => {
                transaction.oncomplete = () => {
                    console.log("productos.js: Transacción de IndexedDB COMPLETADA para producto ID:", idOperacion);
                    resolve();
                };
                transaction.onerror = (event) => {
                    console.error("productos.js: Transacción de IndexedDB FALLÓ para producto ID:", idOperacion, event.target.error);
                    reject(event.target.error);
                };
            });
            console.log("productos.js: Operación en IndexedDB (put) finalizada para ID: ", idOperacion); 
        } else {
            console.warn("productos.js: idb no disponible, no se guardó en IndexedDB.");
        }

        resetFormularioProducto();
        if (typeof cargarYMostrarProductos === 'function') cargarYMostrarProductos();
        
    } catch (error) {
        console.error("Error al guardar/actualizar producto (general): ", error);
        alert("Error al guardar el producto. Revisa la consola para más detalles.");
    }
}

function actualizarListaProductosHTML(productos, esActualizacionDesdeFirestore) {
    if (!divListaProductosEl) {
        return;
    }

    const productosVisibles = productos.filter(p => p.status !== 'pending_delete');
    let mensajeFuente = "Datos actuales en lista";
    if (productosVisibles.some(p => p.needsSync || p.esOffline)) { 
        mensajeFuente += " (con items offline pendientes)";
    } else if (esActualizacionDesdeFirestore) {
        mensajeFuente += " (sincronizado con la nube)";
    } else if (productosVisibles.length > 0) {
        mensajeFuente += " (desde local)";
    } else {
        mensajeFuente = "No hay productos para mostrar."
    }

    if (!productosVisibles || productosVisibles.length === 0) {
        divListaProductosEl.innerHTML = `<p>${mensajeFuente}</p>`;
        return;
    }
    
    let htmlProductos = `<ul><p style="font-size:0.8em; color:grey;">${mensajeFuente}</p>`;
    productosVisibles.sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));

    productosVisibles.forEach(producto => {
        const precioValido = producto.precio !== undefined && producto.precio !== null && !isNaN(producto.precio);
        const unidadValida = producto.unidad !== undefined && producto.unidad !== null && !isNaN(producto.unidad) && producto.unidad >= 1;
        
        const precioFormateado = precioValido 
            ? `$ ${formatPrecioArsDisplay(producto.precio)}` 
            : 'N/A';
        
        const unidadFormateada = unidadValida ? `${parseInt(producto.unidad, 10)} Un.` : (producto.unidad || 'Un.');

        const indicadorOffline = producto.needsSync ? ' <strong>(Pendiente Sync)</strong>' : (producto.esOffline ? ' (Local)' : '');
        htmlProductos += `
            <li data-id="${producto.id}">
                <strong>${producto.nombre}</strong>${indicadorOffline} - ${producto.descripcion || ''}<br>
                Precio: ${precioFormateado} por ${unidadFormateada}<br>
                <small>ID: ${producto.id.length > 20 ? producto.id.substring(0,10)+'...' : producto.id}</small><br>
                <button class="btn-editar-producto" data-id="${producto.id}">Editar</button>
                <button class="btn-eliminar-producto" data-id="${producto.id}">Eliminar</button>
            </li>`;
    });
    htmlProductos += "</ul>";
    divListaProductosEl.innerHTML = htmlProductos;

    divListaProductosEl.querySelectorAll('.btn-editar-producto').forEach(button => {
        button.addEventListener('click', (e) => {
            const id = e.target.dataset.id;
            if (typeof cargarProductoParaEdicion === 'function') cargarProductoParaEdicion(id);
        });
    });

    divListaProductosEl.querySelectorAll('.btn-eliminar-producto').forEach(button => {
        button.addEventListener('click', async (e) => {
            const id = e.target.dataset.id;
            if (confirm("¿Estás seguro de que quieres eliminar este producto?")) {
                if (typeof eliminarProducto === 'function') await eliminarProducto(id);
            }
        });
    });
}

async function cargarProductoParaEdicion(id) {
    const idb = getIdb();
    try {
        let producto;
        if (idb) {
            const transaction = idb.transaction(PRODUCTOS_STORE_NAME, 'readonly');
            const store = transaction.objectStore(PRODUCTOS_STORE_NAME);
            producto = await new Promise((resolve, reject) => {
                const request = store.get(id);
                request.onsuccess = () => resolve(request.result);
                request.onerror = (event) => reject(event.target.error);
            });
        }

        if (!producto && navigator.onLine) {
            const productoRef = doc(db, "productos", id);
            const docSnap = await getDoc(productoRef);
            if (docSnap.exists()) {
                producto = { id: docSnap.id, ...docSnap.data() };
            }
        }
        
        if (producto) {
            resetFormularioProducto(); 
            if(productoIdInputEl) productoIdInputEl.value = producto.id;
            if(nombreProductoInputEl) nombreProductoInputEl.value = producto.nombre || '';
            if(descripcionProductoInputEl) descripcionProductoInputEl.value = producto.descripcion || '';
            
            if(precioProductoInputEl && producto.precio !== undefined) {
                precioProductoInputEl.value = formatPrecioArsDisplay(producto.precio);
            } else if (precioProductoInputEl) {
                precioProductoInputEl.value = '';
            }

            if(unidadProductoInputEl && producto.unidad !== undefined) unidadProductoInputEl.value = parseInt(producto.unidad, 10);
            else if (unidadProductoInputEl) unidadProductoInputEl.value = '1';

            const submitButton = formProductoEl.querySelector('button[type="submit"]');
            if(submitButton) submitButton.textContent = 'Actualizar Producto';
            if(btnCancelarEdicionProductoEl) btnCancelarEdicionProductoEl.style.display = 'inline-block';
            if(nombreProductoInputEl) nombreProductoInputEl.focus();
        } else {
            alert("No se encontró el producto para editar.");
        }
    } catch (error) {
        console.error("Error al cargar producto para edición: ", error);
        alert("Error al cargar producto para edición.");
    }
}

async function eliminarProducto(id) {
    const idb = getIdb();
    if (id.startsWith('offline_')) { 
        if (idb) {
            try {
                const transaction = idb.transaction(PRODUCTOS_STORE_NAME, 'readwrite');
                transaction.objectStore(PRODUCTOS_STORE_NAME).delete(id);
                await new Promise((resolve, reject) => {
                    transaction.oncomplete = resolve;
                    transaction.onerror = (event) => reject(event.target.error);
                });
                console.log("Producto offline eliminado de IndexedDB:", id);
            } catch (error) { console.error("Error al eliminar producto offline de IDB:", error); }
        }
    } else if (!navigator.onLine) { 
        if (idb) {
            try {
                const transaction = idb.transaction(PRODUCTOS_STORE_NAME, 'readwrite');
                const store = transaction.objectStore(PRODUCTOS_STORE_NAME);
                const productoParaMarcar = await new Promise((resolve, reject) => {
                    store.get(id).onsuccess = (e) => resolve(e.target.result);
                });
                if (productoParaMarcar) {
                    productoParaMarcar.needsSync = true;
                    productoParaMarcar.status = 'pending_delete'; 
                    productoParaMarcar.deletedOfflineTimestamp = new Date().toISOString(); 
                    store.put(productoParaMarcar); 
                    await new Promise((resolve, reject) => {
                        transaction.oncomplete = resolve;
                        transaction.onerror = (event) => reject(event.target.error);
                    });
                    console.log("Producto marcado para eliminar en IndexedDB:", id);
                    alert("Estás offline. Producto marcado para eliminar.");
                }
            } catch (error) { console.error("Error al marcar producto para eliminar en IDB:", error); }
        }
    } else { 
        try {
            const productoRef = doc(db, "productos", id);
            await deleteDoc(productoRef);
            console.log("Producto eliminado de Firestore:", id);

            if (idb) { 
                const transaction = idb.transaction(PRODUCTOS_STORE_NAME, 'readwrite');
                transaction.objectStore(PRODUCTOS_STORE_NAME).delete(id); 
                await new Promise((resolve, reject) => {
                    transaction.oncomplete = resolve;
                    transaction.onerror = (event) => reject(event.target.error);
                });
                console.log("Producto eliminado de IndexedDB:", id);
            }
        } catch (error) {
            console.error("Error al eliminar producto (online):", error);
            alert("Error al eliminar el producto.");
        }
    }
    resetFormularioProducto();
    if (typeof cargarYMostrarProductos === 'function') cargarYMostrarProductos(); 
}


export async function cargarYMostrarProductos() {
    const idb = getIdb();
    if (!divListaProductosEl) { 
        console.warn("divListaProductosEl no está definido en cargarYMostrarProductos.");
        return;
    }
    if (!idb) {
        divListaProductosEl.innerHTML = "<p>Esperando base de datos local...</p>";
        setTimeout(cargarYMostrarProductos, 1000); 
        return;
    }

    try {
        const transaction = idb.transaction(PRODUCTOS_STORE_NAME, 'readonly');
        const store = transaction.objectStore(PRODUCTOS_STORE_NAME);
        const locales = await new Promise((resolve, reject) => {
            store.getAll().onsuccess = (e) => resolve(e.target.result || []);
        });
        actualizarListaProductosHTML(locales, false); 
    } catch (error) {
        console.error("Error al cargar productos desde IndexedDB:", error);
    }

    if (unsubscribeProductosFirestore) unsubscribeProductosFirestore();

    const q = query(productosCollection, orderBy("nombre", "asc"));
    unsubscribeProductosFirestore = onSnapshot(q, async (snapshot) => {
        const desdeFirestore = [];
        snapshot.forEach(docSnapshot => desdeFirestore.push({ id: docSnapshot.id, ...docSnapshot.data() }));
        
        const idb = getIdb(); 
        if (idb) {
            try {
                const txSync = idb.transaction(PRODUCTOS_STORE_NAME, 'readwrite');
                const storeSync = txSync.objectStore(PRODUCTOS_STORE_NAME);
                const firestoreIds = new Set(desdeFirestore.map(p => p.id));
                const todosIDB = await new Promise((res, rej) => storeSync.getAll().onsuccess = e => res(e.target.result || []));

                for (const itemIDB of todosIDB) {
                    if (!itemIDB.id.startsWith('offline_') && !itemIDB.needsSync && !firestoreIds.has(itemIDB.id)) {
                        storeSync.delete(itemIDB.id);
                    }
                }

                for (const productoFS of desdeFirestore) {
                    const productoParaIDB = { ...productoFS };
                    if (typeof productoParaIDB.precio === 'string') productoParaIDB.precio = parseFloat(productoParaIDB.precio);
                    if (typeof productoParaIDB.unidad === 'string') productoParaIDB.unidad = parseInt(productoParaIDB.unidad, 10);

                    if (productoFS.creadoEn?.toDate) productoParaIDB.creadoEn = productoFS.creadoEn.toDate().toISOString();
                    if (productoFS.actualizadoEn?.toDate) productoParaIDB.actualizadoEn = productoFS.actualizadoEn.toDate().toISOString();
                    productoParaIDB.needsSync = false;
                    productoParaIDB.esOffline = false;
                    storeSync.put(productoParaIDB);
                }
                await new Promise(r => txSync.oncomplete = r);

                const finalTx = idb.transaction(PRODUCTOS_STORE_NAME, 'readonly');
                const todosParaUI = await new Promise(r => finalTx.objectStore(PRODUCTOS_STORE_NAME).getAll().onsuccess = e => r(e.target.result || []));
                actualizarListaProductosHTML(todosParaUI, true);
            } catch (error) {
                console.error("Error en onSnapshot (productos) al actualizar IDB:", error);
                actualizarListaProductosHTML(desdeFirestore, true); 
            }
        } else {
            actualizarListaProductosHTML(desdeFirestore, true);
        }
    }, (error) => {
        console.error("Error al obtener productos de Firestore:", error);
    });
}

export async function sincronizarProductosPendientes() {
    const idb = getIdb();
    if (!idb || !navigator.onLine) return;

    console.log("Iniciando sincronización de productos pendientes...");
    const txRead = idb.transaction(PRODUCTOS_STORE_NAME, 'readonly');
    const locales = await new Promise((res, rej) => txRead.objectStore(PRODUCTOS_STORE_NAME).getAll().onsuccess = e => res(e.target.result || []));
    const paraSincronizar = locales.filter(p => p.needsSync === true);

    if (paraSincronizar.length === 0) {
        console.log("No hay productos pendientes de sincronizar.");
        return;
    }
    console.log(`Sincronizando ${paraSincronizar.length} producto(s)...`);

    for (const productoLocal of paraSincronizar) {
        const { id: localId, needsSync, esOffline, status, ...datosNetos } = productoLocal;
        let datosParaFirestore = { ...datosNetos };

        if (typeof datosParaFirestore.precio === 'string') datosParaFirestore.precio = parseFloat(datosParaFirestore.precio);
        else if (datosParaFirestore.precio === null || datosParaFirestore.precio === undefined) datosParaFirestore.precio = 0;
        
        if (typeof datosParaFirestore.unidad === 'string') datosParaFirestore.unidad = parseInt(datosParaFirestore.unidad, 10);
        else if (datosParaFirestore.unidad === null || datosParaFirestore.unidad === undefined) datosParaFirestore.unidad = 1;


        try {
            if (datosParaFirestore.creadoEn && typeof datosParaFirestore.creadoEn === 'string') datosParaFirestore.creadoEn = new Date(datosParaFirestore.creadoEn);
            if (datosParaFirestore.actualizadoEn && typeof datosParaFirestore.actualizadoEn === 'string') datosParaFirestore.actualizadoEn = new Date(datosParaFirestore.actualizadoEn);
            delete datosParaFirestore.deletedOfflineTimestamp;
            
            if (localId.startsWith('offline_') && status !== 'pending_delete') {
                const { actualizadoEn, ...datosCreacionFS } = datosParaFirestore; 
                const docRef = await addDoc(productosCollection, datosCreacionFS);
                const txUpdate = idb.transaction(PRODUCTOS_STORE_NAME, 'readwrite');
                const storeUpdate = txUpdate.objectStore(PRODUCTOS_STORE_NAME);
                storeUpdate.delete(localId); 
                const sincronizado = { ...datosCreacionFS, id: docRef.id, needsSync: false, esOffline: false };
                if (sincronizado.creadoEn instanceof Date) sincronizado.creadoEn = sincronizado.creadoEn.toISOString();
                storeUpdate.put(sincronizado); 
                await new Promise(r => txUpdate.oncomplete = r);
            } else if (status === 'pending_delete') {
                const productoRef = doc(db, "productos", localId);
                await deleteDoc(productoRef);
                const txDeleteIDB = idb.transaction(PRODUCTOS_STORE_NAME, 'readwrite');
                txDeleteIDB.objectStore(PRODUCTOS_STORE_NAME).delete(localId);
                await new Promise(r => txDeleteIDB.oncomplete = r);
            } else if (!localId.startsWith('offline_') && status !== 'pending_delete') {
                datosParaFirestore.actualizadoEn = new Date(); 
                const productoRef = doc(db, "productos", localId);
                await setDoc(productoRef, datosParaFirestore, { merge: true }); 
                const txUpdate = idb.transaction(PRODUCTOS_STORE_NAME, 'readwrite');
                const storeUpdate = txUpdate.objectStore(PRODUCTOS_STORE_NAME);
                const actualizadoIDB = { ...productoLocal, ...datosParaFirestore, needsSync: false, esOffline: false };
                if (actualizadoIDB.creadoEn instanceof Date) actualizadoIDB.creadoEn = actualizadoIDB.creadoEn.toISOString();
                if (actualizadoIDB.actualizadoEn instanceof Date) actualizadoIDB.actualizadoEn = actualizadoIDB.actualizadoEn.toISOString();
                storeUpdate.put(actualizadoIDB);
                await new Promise(r => txUpdate.oncomplete = r);
            }
        } catch (error) {
            console.error(`Error al sincronizar producto ID ${localId}:`, error);
        }
    } 
    console.log("Sincronización de productos completada.");
    if (typeof cargarYMostrarProductos === 'function') cargarYMostrarProductos();
}

export function initProductos(elements) {
    formProductoEl = elements.formProducto;
    productoIdInputEl = elements.productoIdInput;
    nombreProductoInputEl = elements.nombreProductoInput;
    descripcionProductoInputEl = elements.descripcionProductoInput;
    precioProductoInputEl = elements.precioProductoInput;
    unidadProductoInputEl = elements.unidadProductoInput;
    btnCancelarEdicionProductoEl = elements.btnCancelarEdicionProducto;
    divListaProductosEl = elements.divListaProductos;

    if (btnCancelarEdicionProductoEl) {
        btnCancelarEdicionProductoEl.addEventListener('click', resetFormularioProducto);
    }
    if (formProductoEl) {
        formProductoEl.addEventListener('submit', handleProductoSubmit);
    }

    // MANEJO DEL CAMPO DE PRECIO
    if (precioProductoInputEl) {
        // Al obtener foco: quitar formato para editar el número puro
        precioProductoInputEl.addEventListener('focus', (event) => {
            const valorActual = event.target.value;
            const valorNumerico = getPrecioNumerico(valorActual);
            // Mostrar el número sin puntos, o vacío si es 0 y se prefiere así
            event.target.value = valorNumerico === 0 && valorActual.trim() === '' ? '' : valorNumerico.toString();
        });

        // Al perder foco: formatear el número con puntos de miles
        precioProductoInputEl.addEventListener('blur', (event) => {
            const valorActual = event.target.value;
            // Solo formatear si el valor no está ya vacío y contiene dígitos
            if (valorActual.trim() !== '' && /\d/.test(valorActual)) {
                const valorNumerico = getPrecioNumerico(valorActual);
                event.target.value = formatPrecioArsDisplay(valorNumerico);
            } else if (valorActual.trim() === '') {
                 // Si el usuario borró todo, dejarlo vacío y no formatear como "$ 0"
                event.target.value = '';
            }
            // Si el valor no es un número válido (ej. solo letras), getPrecioNumerico devolverá 0,
            // y formatPrecioArsDisplay lo mostrará como "0" (o vacío si se modifica formatPrecioArsDisplay).
            // Si quieres limpiar campos inválidos al perder foco, podrías añadir:
            // else if (valorActual.trim() !== '') { event.target.value = ''; }
        });

        // Al escribir: permitir solo dígitos y un punto como separador decimal (aunque lo quitaremos al parsear)
        // Esta es una validación más permisiva durante la entrada para no ser tan restrictivo con el cursor.
        // La limpieza final se hace con getPrecioNumerico.
        precioProductoInputEl.addEventListener('input', (event) => {
            let valor = event.target.value;
            // Permitir números y el punto (usado en Argentina como separador de miles)
            // Al final, getPrecioNumerico quitará los puntos.
            // Esto es para una mejor experiencia de usuario al escribir, permitiendo que pongan puntos si quieren,
            // aunque el formateo final en blur y display lo hará con toLocaleString.
            // No eliminamos los puntos aquí para no interferir demasiado con la escritura.
            // La validación fuerte de que solo sean números para el guardado está en getPrecioNumerico.
            // Podríamos ser más estrictos aquí y solo permitir dígitos:
            // event.target.value = valor.replace(/\D/g, '');
        });
    }
}
