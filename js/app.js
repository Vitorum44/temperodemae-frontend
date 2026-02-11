// js/app.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-app.js";
import { getFirestore, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-storage.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-auth.js";


const firebaseConfig = {
  apiKey: "AIzaSyBqs4xmB_R-hj1aioGIRdUPB3kGrY_9nG4",
  authDomain: "temperodemae-c1996.firebaseapp.com",
  projectId: "temperodemae-c1996",
  storageBucket: "temperodemae-c1996.firebasestorage.app",
  messagingSenderId: "1088168653266",
  appId: "1:1088168653266:web:572b54bc7919c0bad1d80b"
};


// Inicializa Firebase
export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);

// Helpers
export const ts = () => serverTimestamp();
export const brl = (n) => (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });