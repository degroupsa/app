export function generarIdTemporal() {
    return `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Puedes añadir más utilidades aquí en el futuro