const CACHE_NAME = 'agroactiva-app-cache-v2'; // Incrementa la versión del caché si cambias urlsToCache
const urlsToCache = [
    '/', // Representa el index.html en la raíz
    '/index.html',
    '/style.css',
    '/manifest.json',
    '/firebase-config.js', // Configuración de Firebase
    
    // Módulos JavaScript principales
    '/app.js',                 // Tu orquestador principal
    '/firebase-service.js',    // Para servicios de Firebase
    '/indexeddb-handler.js', // Para manejo de IndexedDB
    '/productos.js',           // Lógica de productos
    '/utils.js',               // Utilidades como generarIdTemporal

    // Íconos (asegúrate que estas rutas y nombres de archivo sean EXACTOS a los que tienes)
    // Estos son ejemplos, ajusta a los que realmente usas y están en tu manifest.json y HTML
    '/images/icons/android-icon-192x192.png', // O el nombre del ícono principal de PWA
    // Puedes añadir otros íconos importantes que quieras precachear:
    '/favicon.ico',
    // '/images/icons/apple-icon-180x180.png', 
    // '/favicon.ico' // Si tienes uno en la raíz
];

self.addEventListener('install', event => {
    console.log('SW: Instalando...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('SW: Cache abierto, añadiendo archivos principales al cache');
                return cache.addAll(urlsToCache);
            })
            .then(() => {
                console.log('SW: Todos los archivos principales cacheados. Listo para funcionar offline.');
                return self.skipWaiting();
            })
            .catch(error => {
                console.error('SW: Falló el cacheo de archivos principales:', error);
                // Propagar el error para que la instalación del Service Worker falle
                // si no se pueden cachear todos los archivos esenciales.
                throw error; 
            })
        );
});

self.addEventListener('activate', event => {
    console.log('SW: Activado.');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) {
                        console.log('SW: Borrando cache antiguo:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => {
            console.log('SW: Reclamando clientes...');
            return self.clients.claim();
        })
    );
});

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // No interceptar peticiones a Firestore. Dejar que el SDK de Firestore las maneje.
    // El SDK tiene su propia lógica robusta para offline y online.
    if (url.hostname === 'firestore.googleapis.com') {
        // console.log('SW: No interceptando petición a Firestore:', event.request.url);
        // No llamar a event.respondWith() aquí, permite que la petición siga normalmente.
        return;
    }

    // Para otros recursos, intentar la estrategia "Cache First, then Network"
    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                if (cachedResponse) {
                    // console.log('SW: Sirviendo desde cache:', event.request.url);
                    return cachedResponse; // Servir desde el cache si está disponible
                }

                // console.log('SW: No en cache, intentando red:', event.request.url);
                return fetch(event.request)
                    .then(networkResponse => {
                        // Si la respuesta es válida y es un GET, la clonamos y la guardamos en cache
                        if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET') {
                            // console.log('SW: Cacheando nueva respuesta de red:', event.request.url);
                            // Solo cachear recursos de nuestro propio origen o CDNs confiables si es necesario
                            // y que no sean opacos (type: 'opaque' usualmente no se deben cachear así).
                            // Por ahora, cacheamos lo que no sea de Firestore y venga con status 200.
                            if (url.protocol.startsWith('http')) { // Solo cachear http/https
                                const responseToCache = networkResponse.clone();
                                caches.open(CACHE_NAME)
                                    .then(cache => {
                                        cache.put(event.request, responseToCache);
                                    });
                            }
                        }
                        return networkResponse;
                    })
                    .catch(error => {
                        console.warn(`SW: Fetch fallido (offline o error de red) para ${event.request.method} ${event.request.url}:`, error);
                        // Para satisfacer event.respondWith(), debemos devolver una Response.
                        // Devolver una respuesta de error genérica para que el navegador sepa que falló.
                        return new Response(
                            `Contenido no disponible offline y no encontrado en caché: ${event.request.url}`, {
                            status: 404,
                            statusText: "Not Found in Cache or Network",
                            headers: { 'Content-Type': 'text/plain' }
                        });
                    });
            })
    );
});