// interesados.js
import { 
    db as firestoreDB, 
    interesadosCollection, 
    addDoc as firestoreAddDoc, 
    getDoc as firestoreGetDoc, // Para futura edición
    setDoc as firestoreSetDoc,   // Para futura edición
    doc as firestoreDoc,         // Para futura edición/eliminación
    onSnapshot, 
    query, 
    orderBy,
    deleteDoc as firestoreDeleteDoc // Para futura eliminación
} from './firebase-service.js';
import { getIdb, INTERESADOS_STORE_NAME } from './indexeddb-handler.js';
import { generarIdTemporal } from './utils.js';

// Elementos del DOM
let formInteresadoEl, interesadoIdInputEl, nombreInteresadoInputEl, emailInteresadoInputEl,
    telefonoInteresadoInputEl, empresaInteresadoInputEl, localidadInteresadoInputEl,
    notasInteresadoInputEl, btnCancelarEdicionInteresadoEl, divListaInteresadosEl;

let unsubscribeInteresadosFirestore;

// --- Funciones Auxiliares del Módulo ---
function resetFormularioInteresado() {
    if(formInteresadoEl) formInteresadoEl.reset();
    if(interesadoIdInputEl) interesadoIdInputEl.value = '';
    if(btnCancelarEdicionInteresadoEl && btnCancelarEdicionInteresadoEl.style) { // Verificar si el botón y su estilo existen
      btnCancelarEdicionInteresadoEl.style.display = 'none';
    }
    if(formInteresadoEl) {
        const submitButton = formInteresadoEl.querySelector('button[type="submit"]');
        if(submitButton) submitButton.textContent = 'Guardar Interesado';
    }
}

async function handleInteresadoSubmit(event) {
    event.preventDefault();
    const idb = getIdb();

    const nombreCompleto = nombreInteresadoInputEl.value.trim();
    const email = emailInteresadoInputEl.value.trim();
    const telefono = telefonoInteresadoInputEl.value.trim();
    const empresa = empresaInteresadoInputEl.value.trim();
    const localidad = localidadInteresadoInputEl.value.trim();
    const notas = notasInteresadoInputEl.value.trim();
    const interesadoId = interesadoIdInputEl.value; 

    if (!nombreCompleto) {
        alert("Por favor, ingrese el nombre completo del interesado.");
        return;
    }

    let esEdicion = !!interesadoId;
    let dataInteresadoBase; // Renombrado para claridad

    if (esEdicion) {
        // Lógica para edición (Futuro - por ahora, solo preparación)
        console.log("Editando interesado ID:", interesadoId);
        dataInteresadoBase = { // Este es el objeto con los datos actualizados del formulario
            id: interesadoId, // Mantener el ID existente
            nombreCompleto, email, telefono, empresa, localidad, notas,
            actualizadoEn: new Date(), // Marcar fecha de actualización
            needsSync: !navigator.onLine,
            esOffline: !navigator.onLine,
            // Aquí podríamos necesitar la fechaDeRegistro original si no queremos que se pierda
        };
        // Obtener el registro original de IDB para preservar fechaRegistro si no está en el formulario
        if (idb) {
            try {
                const tx = idb.transaction(INTERESADOS_STORE_NAME, 'readonly');
                const store = tx.objectStore(INTERESADOS_STORE_NAME);
                const original = await new Promise((res, rej) => {
                    const req = store.get(interesadoId);
                    req.onsuccess = () => res(req.result);
                    req.onerror = (e) => rej(e.target.error);
                });
                if (original && original.fechaRegistro) {
                    dataInteresadoBase.fechaRegistro = (original.fechaRegistro instanceof Date) 
                                                    ? original.fechaRegistro 
                                                    : new Date(original.fechaRegistro);
                } else if (!dataInteresadoBase.fechaRegistro) { // Si no había y no se cargó
                    dataInteresadoBase.fechaRegistro = new Date(); // Usar la fecha actual como fallback
                }
            } catch (err) {
                console.error("Error obteniendo item original para edición de interesado:", err);
                if (!dataInteresadoBase.fechaRegistro) dataInteresadoBase.fechaRegistro = new Date(); // Fallback
            }
        } else if (!dataInteresadoBase.fechaRegistro) {
            dataInteresadoBase.fechaRegistro = new Date(); // Fallback
        }


    } else { // Creando nuevo
        dataInteresadoBase = {
            nombreCompleto, email, telefono, empresa, localidad, notas,
            fechaRegistro: new Date(),
            needsSync: !navigator.onLine,
            esOffline: !navigator.onLine,
            status: 'activo' 
        };
    }

    try {
        let idOperacion = esEdicion ? interesadoId : null;
        let interesadoParaIDB;

        if (esEdicion) {
            const { id, needsSync, esOffline, status, ...firestoreData } = { ...dataInteresadoBase };
            // Asegurar que las fechas sean objetos Date para Firestore
            firestoreData.fechaRegistro = (dataInteresadoBase.fechaRegistro instanceof Date) ? dataInteresadoBase.fechaRegistro : new Date(dataInteresadoBase.fechaRegistro);
            firestoreData.actualizadoEn = (dataInteresadoBase.actualizadoEn instanceof Date) ? dataInteresadoBase.actualizadoEn : new Date(dataInteresadoBase.actualizadoEn);
            
            interesadoParaIDB = { // Objeto completo para IDB
                ...dataInteresadoBase,
                fechaRegistro: firestoreData.fechaRegistro.toISOString(),
                actualizadoEn: firestoreData.actualizadoEn.toISOString(),
            };

            if (navigator.onLine) {
                console.log("Online: Actualizando interesado en Firestore ID:", idOperacion);
                const docRef = firestoreDoc(firestoreDB, "interesados", idOperacion);
                await firestoreSetDoc(docRef, firestoreData, { merge: true });
                console.log("Interesado actualizado en Firestore.");
                interesadoParaIDB.needsSync = false;
                interesadoParaIDB.esOffline = false;
            } else {
                console.log("Offline: Actualización de interesado guardada localmente.");
                alert("Estás offline. Cambios al interesado guardados localmente.");
                // needsSync y esOffline ya están true en interesadoParaIDB
            }

        } else { // Creando
            if (navigator.onLine) {
                const { id, needsSync, esOffline, status, ...firestoreData } = { ...dataInteresadoBase };
                firestoreData.fechaRegistro = (dataInteresadoBase.fechaRegistro instanceof Date) ? dataInteresadoBase.fechaRegistro : new Date(dataInteresadoBase.fechaRegistro);

                const docRef = await firestoreAddDoc(interesadosCollection, firestoreData);
                idOperacion = docRef.id;
                console.log("Interesado guardado en Firestore con ID:", idOperacion);
                
                interesadoParaIDB = {
                    ...dataInteresadoBase,
                    id: idOperacion,
                    fechaRegistro: dataInteresadoBase.fechaRegistro.toISOString(),
                    needsSync: false,
                    esOffline: false
                };
            } else {
                idOperacion = generarIdTemporal();
                console.log("Offline: Guardando interesado en IndexedDB con ID temporal:", idOperacion);
                interesadoParaIDB = {
                    ...dataInteresadoBase,
                    id: idOperacion,
                    fechaRegistro: dataInteresadoBase.fechaRegistro.toISOString(),
                    needsSync: true,
                    esOffline: true
                };
            }
        }

        if (idb && interesadoParaIDB) {
            const transaction = idb.transaction(INTERESADOS_STORE_NAME, 'readwrite');
            const store = transaction.objectStore(INTERESADOS_STORE_NAME);
            store.put(interesadoParaIDB);
            await new Promise((resolve, reject) => {
                transaction.oncomplete = resolve;
                transaction.onerror = (event) => reject(event.target.error);
            });
            console.log("Interesado guardado/actualizado en IndexedDB con ID:", idOperacion);
            if (!navigator.onLine) {
                 alert(esEdicion ? "Estás offline. Cambios al interesado guardados localmente." : "Estás offline. Interesado guardado localmente.");
            } else {
                 alert(esEdicion ? "Interesado actualizado exitosamente." : "Interesado guardado exitosamente.");
            }
        }
        
        resetFormularioInteresado();
        if(typeof cargarYMostrarInteresados === 'function') cargarYMostrarInteresados();

    } catch (error) {
        console.error("Error al guardar/actualizar interesado:", error);
        alert("Error al guardar el interesado. Revisa la consola.");
    }
}

function actualizarListaInteresadosHTML(interesados, esActualizacionDesdeFirestore) {
    if (!divListaInteresadosEl) {
        console.warn("actualizarListaInteresadosHTML: divListaInteresadosEl no está definido.");
        return;
    }

    const interesadosVisibles = interesados.filter(i => i.status !== 'pending_delete');

    let mensajeFuente = "Lista de Interesados";
    if (interesadosVisibles.some(i => i.needsSync || i.esOffline)) {
        mensajeFuente += " (con items offline pendientes)";
    } else if (esActualizacionDesdeFirestore) {
        mensajeFuente += " (sincronizado con la nube)";
    } else if (interesadosVisibles.length > 0) {
        mensajeFuente += " (desde local)";
    }

    if (!interesadosVisibles || interesadosVisibles.length === 0) {
        divListaInteresadosEl.innerHTML = `<p>No hay interesados registrados.</p><p style="font-size:0.8em; color:grey;">${mensajeFuente}</p>`;
        return;
    }

    let htmlInteresados = `<ul><p style="font-size:0.8em; color:grey;">${mensajeFuente}</p>`;
    interesadosVisibles.sort((a, b) => (a.nombreCompleto || "").localeCompare(b.nombreCompleto || ""));

    interesadosVisibles.forEach(interesado => {
        const fecha = interesado.fechaRegistro ? new Date(interesado.fechaRegistro).toLocaleDateString('es-AR') : 'N/A';
        const indicadorOffline = interesado.needsSync ? ' <strong>(Pendiente Sync)</strong>' : (interesado.esOffline ? ' (Local)' : '');

        htmlInteresados += `
            <li data-id="${interesado.id}" style="border-bottom: 1px solid #eee; padding-bottom: 5px; margin-bottom: 5px;">
                <strong>${interesado.nombreCompleto}</strong>${indicadorOffline}<br>
                Email: ${interesado.email || 'N/A'} | Tel: ${interesado.telefono || 'N/A'}<br>
                Empresa: ${interesado.empresa || 'N/A'} | Localidad: ${interesado.localidad || 'N/A'}<br>
                Notas: ${interesado.notas || ''}<br>
                <small>Registrado: ${fecha} | ID: ${interesado.id.length > 20 ? interesado.id.substring(0,10)+'...' : interesado.id}</small>
                <button type="button" class="btn-editar-interesado" data-id="${interesado.id}" style="margin-left: 5px; font-size: 0.8em;">Editar</button>
                <button type="button" class="btn-eliminar-interesado" data-id="${interesado.id}" style="margin-left: 5px; font-size: 0.8em; color: red;">Eliminar</button>
            </li>`;
    });
    htmlInteresados += "</ul>";
    divListaInteresadosEl.innerHTML = htmlInteresados;
    
    // Añadir listeners para los botones de editar y eliminar
    divListaInteresadosEl.querySelectorAll('.btn-editar-interesado').forEach(button => {
        button.addEventListener('click', (e) => {
            const idInteresado = e.target.dataset.id;
            if (typeof cargarInteresadoParaEdicion === 'function') cargarInteresadoParaEdicion(idInteresado);
        });
    });

    divListaInteresadosEl.querySelectorAll('.btn-eliminar-interesado').forEach(button => {
        button.addEventListener('click', (e) => {
            const idInteresado = e.target.dataset.id;
            if (typeof handleEliminarInteresadoClick === 'function') handleEliminarInteresadoClick(idInteresado);
        });
    });
}

// --- Funciones Exportadas ---
export async function cargarYMostrarInteresados() {
    const idb = getIdb();
    if (!divListaInteresadosEl) {
        divListaInteresadosEl = document.getElementById('listaInteresados');
        if (!divListaInteresadosEl) {
            console.warn("divListaInteresadosEl no se pudo encontrar.");
            return;
        }
    }
    if (!idb) {
        divListaInteresadosEl.innerHTML = "<p>Esperando base de datos local...</p>";
        setTimeout(cargarYMostrarInteresados, 1000);
        return;
    }

    try {
        const transaction = idb.transaction(INTERESADOS_STORE_NAME, 'readonly');
        const store = transaction.objectStore(INTERESADOS_STORE_NAME);
        const locales = await new Promise((resolve, reject) => {
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result);
            req.onerror = (e) => reject(e.target.error);
        });
        actualizarListaInteresadosHTML(locales || [], false);
    } catch (error) {
        console.error("Error cargando interesados de IDB:", error);
        if(divListaInteresadosEl) divListaInteresadosEl.innerHTML = "<p>Error al cargar interesados locales.</p>";
    }

    if (unsubscribeInteresadosFirestore) unsubscribeInteresadosFirestore();

    const q = query(interesadosCollection, orderBy("fechaRegistro", "desc"));
    unsubscribeInteresadosFirestore = onSnapshot(q, async (snapshot) => {
        console.log("Datos recibidos de Firestore (interesados)");
        const desdeFirestore = [];
        snapshot.forEach(doc => desdeFirestore.push({ id: doc.id, ...doc.data() }));

        const idb = getIdb();
        if (idb) {
            try {
                const txSync = idb.transaction(INTERESADOS_STORE_NAME, 'readwrite');
                const storeSync = txSync.objectStore(INTERESADOS_STORE_NAME);
                
                const firestoreIds = new Set(desdeFirestore.map(p => p.id));
                const todosIDB = await new Promise((resolve, reject) => {
                    const r = storeSync.getAll();
                    r.onsuccess = () => resolve(r.result);
                    r.onerror = e => reject(e.target.error);
                });

                for (const itemIDB of todosIDB) {
                    if (!itemIDB.id.startsWith('offline_') && !itemIDB.needsSync && !firestoreIds.has(itemIDB.id)) {
                        storeSync.delete(itemIDB.id);
                    }
                }

                for (const itemFS of desdeFirestore) {
                    const itemParaIDB = { ...itemFS };
                    if (itemFS.fechaRegistro && itemFS.fechaRegistro.toDate) {
                        itemParaIDB.fechaRegistro = itemFS.fechaRegistro.toDate().toISOString();
                    }
                    if (itemFS.actualizadoEn && itemFS.actualizadoEn.toDate) {
                        itemParaIDB.actualizadoEn = itemFS.actualizadoEn.toDate().toISOString();
                    }
                    itemParaIDB.needsSync = false;
                    itemParaIDB.esOffline = false;
                    storeSync.put(itemParaIDB);
                }
                await new Promise(r => txSync.oncomplete = r);

                const txFinalRead = idb.transaction(INTERESADOS_STORE_NAME, 'readonly');
                const storeFinalRead = txFinalRead.objectStore(INTERESADOS_STORE_NAME);
                const todosParaUI = await new Promise(r => storeFinalRead.getAll().onsuccess = e => r(e.target.result));
                actualizarListaInteresadosHTML(todosParaUI || [], true);

            } catch (error) {
                console.error("Error en onSnapshot (interesados) al actualizar IDB:", error);
                actualizarListaInteresadosHTML(desdeFirestore, true);
            }
        } else {
            actualizarListaInteresadosHTML(desdeFirestore, true);
        }
    }, (error) => {
        console.error("Error al obtener interesados de Firestore:", error);
        if(divListaInteresadosEl) divListaInteresadosEl.innerHTML = "<p>Error al cargar interesados de la nube.</p>";
    });
}

// --- COMIENZO DE SINCRONIZARINTERESADOSPENDIENTES CORREGIDO ---
export async function sincronizarInteresadosPendientes() {
    const idb = getIdb();
    if (!idb) {
        console.warn("IndexedDB no está lista para sincronizar interesados.");
        return;
    }
    if (!navigator.onLine) {
        console.log("Sincronización de interesados pausada: sin conexión.");
        return;
    }

    console.log("Iniciando sincronización de interesados pendientes...");
    
    let interesadosParaSincronizar;
    try {
        const readTx = idb.transaction(INTERESADOS_STORE_NAME, 'readonly');
        const storeRead = readTx.objectStore(INTERESADOS_STORE_NAME);
        const request = storeRead.getAll();
        
        const todosLosInteresadosLocales = await new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result || []); // Devolver array vacío si es null
            request.onerror = (event) => {
                console.error("Error al leer interesados de IndexedDB para sincronizar:", event.target.error);
                reject(event.target.error);
            };
        });
        interesadosParaSincronizar = todosLosInteresadosLocales.filter(i => i.needsSync === true);

    } catch (error) {
        console.error("Error al leer interesados de IndexedDB para sincronizar (bloque try/catch):", error);
        return; 
    }
    

    if (!interesadosParaSincronizar || interesadosParaSincronizar.length === 0) {
        console.log("No hay interesados pendientes de sincronizar.");
        return;
    }

    console.log(`Sincronizando ${interesadosParaSincronizar.length} interesado(s)...`);

    for (const interesadoLocal of interesadosParaSincronizar) {
        const { id: localId, needsSync, esOffline, status, ...datosNetosOriginal } = interesadoLocal;
        let datosParaFirestore = { ...datosNetosOriginal }; 

        // Convertir fechas para Firestore
        if (datosParaFirestore.fechaRegistro && typeof datosParaFirestore.fechaRegistro === 'string') {
            datosParaFirestore.fechaRegistro = new Date(datosParaFirestore.fechaRegistro);
        }
        if (datosParaFirestore.actualizadoEn && typeof datosParaFirestore.actualizadoEn === 'string') {
            datosParaFirestore.actualizadoEn = new Date(datosParaFirestore.actualizadoEn);
        }
        delete datosParaFirestore.deletedOfflineTimestamp; 
        delete datosParaFirestore.status; // Asegurarse de no enviar 'status' si no es campo de Firestore

        try {
            if (localId.startsWith('offline_') && status !== 'pending_delete') { // CREACIÓN OFFLINE
                delete datosParaFirestore.id; 
                const docRef = await firestoreAddDoc(interesadosCollection, datosParaFirestore);
                console.log("Interesado NUEVO sincronizado. ID Local:", localId, "ID Firestore:", docRef.id);
                
                const txUpdateIDB = idb.transaction(INTERESADOS_STORE_NAME, 'readwrite');
                const storeUpdateIDB = txUpdateIDB.objectStore(INTERESADOS_STORE_NAME);
                storeUpdateIDB.delete(localId); 
                const sincronizado = { 
                    ...datosNetosOriginal, 
                    id: docRef.id, 
                    fechaRegistro: (datosParaFirestore.fechaRegistro instanceof Date) ? datosParaFirestore.fechaRegistro.toISOString() : datosNetosOriginal.fechaRegistro,
                    actualizadoEn: (datosParaFirestore.actualizadoEn instanceof Date) ? datosParaFirestore.actualizadoEn.toISOString() : datosNetosOriginal.actualizadoEn,
                    needsSync: false, 
                    esOffline: false, 
                    status: 'activo' 
                };
                storeUpdateIDB.put(sincronizado);
                await new Promise((resolve, reject) => {
                    txUpdateIDB.oncomplete = resolve;
                    txUpdateIDB.onerror = (e) => { console.error("Error en txUpdateIDB (creación interesado sync):", e.target.error); reject(e.target.error); };
                });

            } else if (status === 'pending_delete') { // ELIMINACIÓN OFFLINE
                console.log(`Sincronizando ELIMINACIÓN de interesado ID: ${localId}`);
                const docRef = firestoreDoc(firestoreDB, "interesados", localId);
                await firestoreDeleteDoc(docRef);
                console.log("Interesado eliminado de Firestore. ID:", localId);
                
                const txDeleteIDB = idb.transaction(INTERESADOS_STORE_NAME, 'readwrite');
                const storeDeleteIDB = txDeleteIDB.objectStore(INTERESADOS_STORE_NAME);
                storeDeleteIDB.delete(localId); 
                await new Promise((resolve, reject) => {
                    txDeleteIDB.oncomplete = resolve;
                    txDeleteIDB.onerror = (e) => { console.error("Error en txDeleteIDB (eliminación interesado sync):", e.target.error); reject(e.target.error);};
                });
                console.log(`Interesado con ID ${localId} eliminado de IndexedDB después de sincronizar borrado.`);

            } else if (!localId.startsWith('offline_') && status !== 'pending_delete') { // ACTUALIZACIÓN OFFLINE
                console.log(`Sincronizando ACTUALIZACIÓN de interesado ID: ${localId}`);
                datosParaFirestore.actualizadoEn = new Date(); 
                const { id, ...datosUpdateFS } = datosParaFirestore; // 'id' no se envía como campo
                
                const docRef = firestoreDoc(firestoreDB, "interesados", localId);
                await firestoreSetDoc(docRef, datosUpdateFS, { merge: true });
                console.log("Interesado actualizado en Firestore. ID:", localId);

                const txUpdateIDB = idb.transaction(INTERESADOS_STORE_NAME, 'readwrite');
                const storeUpdateIDB = txUpdateIDB.objectStore(INTERESADOS_STORE_NAME);
                
                const actualizadoIDB = {
                    ...interesadoLocal, 
                    ...datosUpdateFS,    
                    actualizadoEn: datosParaFirestore.actualizadoEn.toISOString(),
                    needsSync: false,
                    esOffline: false,
                };
                delete actualizadoIDB.status; // Limpiar el status si no es 'pending_delete'
                
                storeUpdateIDB.put(actualizadoIDB);
                await new Promise((resolve, reject) => {
                    txUpdateIDB.oncomplete = resolve;
                    txUpdateIDB.onerror = (e) => { console.error("Error en txUpdateIDB (actualización interesado sync):", e.target.error); reject(e.target.error); }
                });
            }
        } catch (error) {
            console.error(`Error al procesar sincronización para interesado ID ${localId}:`, error);
        }
    }
    console.log("Todas las operaciones de sincronización de interesados encoladas/intentadas.");
    // onSnapshot en cargarYMostrarInteresados se encargará de refrescar la UI.
}

// --- FIN DE SINCRONIZARINTERESADOSPENDIENTES CORREGIDO ---


// --- NUEVAS FUNCIONES PARA EDICIÓN Y ELIMINACIÓN DE INTERESADOS (esqueleto) ---
export async function cargarInteresadoParaEdicion(idInteresado) {
    console.log("Cargando interesado para edición ID:", idInteresado);
    const idb = getIdb();
    let interesado;

    // Intenta cargar desde IDB primero
    if (idb) {
        try {
            const transaction = idb.transaction(INTERESADOS_STORE_NAME, 'readonly');
            const store = transaction.objectStore(INTERESADOS_STORE_NAME);
            interesado = await new Promise((resolve, reject) => {
                const request = store.get(idInteresado);
                request.onsuccess = () => resolve(request.result);
                request.onerror = (event) => reject(event.target.error);
            });
        } catch (error) {
            console.error("Error cargando interesado desde IDB para edición:", error);
        }
    }

    // Si no está en IDB y estamos online, intentar desde Firestore
    if (!interesado && navigator.onLine) {
        try {
            const docRef = firestoreDoc(firestoreDB, "interesados", idInteresado);
            const docSnap = await firestoreGetDoc(docRef);
            if (docSnap.exists()) {
                interesado = { id: docSnap.id, ...docSnap.data() };
                // Convertir Timestamps de Firestore a objetos Date si es necesario
                if (interesado.fechaRegistro && interesado.fechaRegistro.toDate) {
                    interesado.fechaRegistro = interesado.fechaRegistro.toDate();
                }
                if (interesado.actualizadoEn && interesado.actualizadoEn.toDate) {
                    interesado.actualizadoEn = interesado.actualizadoEn.toDate();
                }
            } else {
                alert("Interesado no encontrado en Firestore.");
                return;
            }
        } catch (error) {
            console.error("Error cargando interesado desde Firestore para edición:", error);
            alert("Error al cargar datos del interesado.");
            return;
        }
    }
    
    if (!interesado) {
        alert("No se pudo cargar el interesado para editar.");
        return;
    }

    // Poblar el formulario (asumiendo que los elementos del DOM ya están asignados)
    if(interesadoIdInputEl) interesadoIdInputEl.value = interesado.id;
    if(nombreInteresadoInputEl) nombreInteresadoInputEl.value = interesado.nombreCompleto || '';
    if(emailInteresadoInputEl) emailInteresadoInputEl.value = interesado.email || '';
    if(telefonoInteresadoInputEl) telefonoInteresadoInputEl.value = interesado.telefono || '';
    if(empresaInteresadoInputEl) empresaInteresadoInputEl.value = interesado.empresa || '';
    if(localidadInteresadoInputEl) localidadInteresadoInputEl.value = interesado.localidad || '';
    if(notasInteresadoInputEl) notasInteresadoInputEl.value = interesado.notas || '';

    if(formInteresadoEl) {
        const submitButton = formInteresadoEl.querySelector('button[type="submit"]');
        if(submitButton) submitButton.textContent = 'Actualizar Interesado';
    }
    if(btnCancelarEdicionInteresadoEl) btnCancelarEdicionInteresadoEl.style.display = 'inline-block';
    if(nombreInteresadoInputEl) nombreInteresadoInputEl.focus();
    // Aquí podrías querer ocultar el botón "Nuevo" o cambiar el título del formulario si es un área separada.
}

async function handleEliminarInteresadoClick(idInteresado) {
    if (confirm(`¿Estás seguro de que quieres eliminar al interesado ID: ${idInteresado}?`)) {
        await eliminarInteresado(idInteresado);
    }
}

async function eliminarInteresado(id) {
    const idb = getIdb();
    if (!idb) {
        alert("Error: Base de datos local no disponible.");
        return;
    }

    if (id.startsWith('offline_')) {
        try {
            const transaction = idb.transaction(INTERESADOS_STORE_NAME, 'readwrite');
            const store = transaction.objectStore(INTERESADOS_STORE_NAME);
            store.delete(id);
            await new Promise((resolve, reject) => {
                transaction.oncomplete = resolve;
                transaction.onerror = (event) => reject(event.target.error);
            });
            console.log("Interesado offline eliminado de IndexedDB:", id);
            if(typeof cargarYMostrarInteresados === 'function') cargarYMostrarInteresados();
        } catch (error) { console.error("Error eliminando interesado offline de IDB:", error); }
        return;
    }

    if (!navigator.onLine) {
        try {
            const transaction = idb.transaction(INTERESADOS_STORE_NAME, 'readwrite');
            const store = transaction.objectStore(INTERESADOS_STORE_NAME);
            const interesado = await new Promise((res,rej) => store.get(id).onsuccess = e => res(e.target.result));
            if (interesado) {
                interesado.needsSync = true;
                interesado.status = 'pending_delete';
                interesado.deletedOfflineTimestamp = new Date().toISOString();
                store.put(interesado);
                await new Promise((resolve, reject) => {
                    transaction.oncomplete = resolve;
                    transaction.onerror = (event) => reject(event.target.error);
                });
                console.log("Interesado marcado para eliminar en IndexedDB:", id);
                alert("Estás offline. Interesado marcado para eliminar.");
                if(typeof cargarYMostrarInteresados === 'function') cargarYMostrarInteresados();
            }
        } catch (error) { console.error("Error marcando interesado para eliminar en IDB:", error); }
        return;
    }

    try {
        const docRef = firestoreDoc(firestoreDB, "interesados", id);
        await firestoreDeleteDoc(docRef);
        console.log("Interesado eliminado de Firestore:", id);

        const transaction = idb.transaction(INTERESADOS_STORE_NAME, 'readwrite');
        const store = transaction.objectStore(INTERESADOS_STORE_NAME);
        store.delete(id);
        await new Promise((resolve, reject) => {
            transaction.oncomplete = resolve;
            transaction.onerror = (event) => reject(event.target.error);
        });
        console.log("Interesado eliminado de IndexedDB:", id);
        if(typeof cargarYMostrarInteresados === 'function') cargarYMostrarInteresados();
    } catch (error) {
        console.error("Error eliminando interesado online:", error);
        alert("Error al eliminar el interesado.");
    }
}
// --- FIN NUEVAS FUNCIONES ---


export function initInteresados(elements) {
    console.log("interesados.js: initInteresados fue llamada.");
    formInteresadoEl = elements.formInteresado;
    interesadoIdInputEl = elements.interesadoIdInput;
    nombreInteresadoInputEl = elements.nombreInteresadoInput;
    emailInteresadoInputEl = elements.emailInteresadoInput;
    telefonoInteresadoInputEl = elements.telefonoInteresadoInput;
    empresaInteresadoInputEl = elements.empresaInteresadoInput;
    localidadInteresadoInputEl = elements.localidadInteresadoInput;
    notasInteresadoInputEl = elements.notasInteresadoInput;
    btnCancelarEdicionInteresadoEl = elements.btnCancelarEdicionInteresado;
    divListaInteresadosEl = elements.listaInteresados;

    if (formInteresadoEl) {
        formInteresadoEl.addEventListener('submit', handleInteresadoSubmit);
        console.log("Listener de submit añadido a formInteresado.");
    } else {
        console.warn("formInteresadoEl no encontrado en initInteresados.");
    }
    if (btnCancelarEdicionInteresadoEl) {
        btnCancelarEdicionInteresadoEl.addEventListener('click', resetFormularioInteresado);
    }
    if(typeof cargarYMostrarInteresados === 'function') cargarYMostrarInteresados();
}