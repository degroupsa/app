// indexeddb-handler.js
const DB_NAME = 'AgroactivaAppDB';
const DB_VERSION = 3; // Mantenemos la versión 3 para incluir el almacén de interesados

// Exportar las constantes de nombres de almacenes directamente
export const PRODUCTOS_STORE_NAME = 'productosLocal';
export const PRESUPUESTOS_STORE_NAME = 'presupuestosLocal';
export const INTERESADOS_STORE_NAME = 'interesadosLocal';

let dbInstance = null; // Instancia de la base de datos

export async function initDB() {
    return new Promise((resolve, reject) => {
        if (dbInstance) {
            resolve(dbInstance);
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => {
            console.error("Error al abrir IndexedDB:", event.target.error);
            reject("Error al abrir IndexedDB");
        };

        request.onsuccess = (event) => {
            dbInstance = event.target.result;
            console.log("IndexedDB abierta correctamente:", dbInstance);
            resolve(dbInstance);
        };

        request.onupgradeneeded = (event) => {
            const currentDb = event.target.result;
            console.log("IndexedDB: Actualización necesaria (onupgradeneeded). Versión antigua:", event.oldVersion, "Nueva versión:", event.newVersion);

            if (!currentDb.objectStoreNames.contains(PRODUCTOS_STORE_NAME)) {
                const productosStore = currentDb.createObjectStore(PRODUCTOS_STORE_NAME, { keyPath: 'id' });
                productosStore.createIndex('nombre', 'nombre', { unique: false });
                productosStore.createIndex('needsSync', 'needsSync', { unique: false });
                console.log(`Almacén de objetos '${PRODUCTOS_STORE_NAME}' creado.`);
            }
            
            if (!currentDb.objectStoreNames.contains(PRESUPUESTOS_STORE_NAME)) {
                const presupuestosStore = currentDb.createObjectStore(PRESUPUESTOS_STORE_NAME, { keyPath: 'id' });
                presupuestosStore.createIndex('fechaCreacion', 'fechaCreacion', { unique: false });
                presupuestosStore.createIndex('interesadoId', 'interesadoId', { unique: false });
                presupuestosStore.createIndex('needsSync', 'needsSync', { unique: false });
                console.log(`Almacén de objetos '${PRESUPUESTOS_STORE_NAME}' creado.`);
            }
            
            if (!currentDb.objectStoreNames.contains(INTERESADOS_STORE_NAME)) {
                const interesadosStore = currentDb.createObjectStore(INTERESADOS_STORE_NAME, { keyPath: 'id' });
                interesadosStore.createIndex('nombreCompleto', 'nombreCompleto', { unique: false });
                interesadosStore.createIndex('email', 'email', { unique: false });
                interesadosStore.createIndex('needsSync', 'needsSync', { unique: false });
                console.log(`Almacén de objetos '${INTERESADOS_STORE_NAME}' creado.`);
            }
        };
    });
}

export function getIdb() {
    if (!dbInstance) {
        console.error("IndexedDB no ha sido inicializada. Llama a initDB() primero.");
        return null; 
    }
    return dbInstance;
}

// Ya no necesitamos el bloque export { ... } al final para estas constantes
// porque las exportamos directamente con 'export const'.
// Solo exportamos initDB y getIdb si no se hicieron con 'export async function' o 'export function'.
// En este caso, initDB y getIdb ya están exportadas individualmente.