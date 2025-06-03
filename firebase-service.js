// firebase-service.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.6.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.6.0/firebase-auth.js";
import { 
    getFirestore, collection, addDoc, getDoc, 
    setDoc, deleteDoc, onSnapshot, query, 
    orderBy, doc 
} from "https://www.gstatic.com/firebasejs/10.6.0/firebase-firestore.js";
import { firebaseConfig } from './firebase-config.js';

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Colecciones
const productosCollection = collection(db, "productos");
const presupuestosCollection = collection(db, "presupuestos");
const interesadosCollection = collection(db, "interesados"); // MODIFICADO: Descomentado y definido

console.log("Firebase App inicializada desde firebase-service.js. Proyecto ID:", firebaseConfig.projectId);

export {
    auth,
    onAuthStateChanged,
    db,
    productosCollection,
    presupuestosCollection,
    interesadosCollection, // MODIFICADO: Añadido a las exportaciones
    collection, 
    addDoc,
    getDoc,
    setDoc,
    deleteDoc,
    onSnapshot,
    query,
    orderBy,
    doc
};