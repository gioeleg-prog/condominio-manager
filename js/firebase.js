// Avvio di Firebase (modulo) ed esposizione delle funzioni all'app in window._fb.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, serverTimestamp, writeBatch, deleteField, limit }
  from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, updatePassword, reauthenticateWithCredential, EmailAuthProvider , sendPasswordResetEmail, GoogleAuthProvider, signInWithPopup, linkWithPopup, linkWithCredential }
  from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFunctions, httpsCallable }
  from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-functions.js';
import { getStorage, ref, uploadBytes, getBytes, deleteObject }
  from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js';

// ═══════════════════════════════════════════
//  CONFIGURAZIONE FIREBASE
// ═══════════════════════════════════════════
// La configurazione del progetto arriva da js/config.js (produzione) o
// js/config.staging.js (staging), caricati prima di questo modulo.
const firebaseConfig = window.FIREBASE_CONFIG;

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);
const auth = getAuth(app);
const functionsInstance = getFunctions(app);
const storage = getStorage(app);

// ═══════════════════════════════════════════
//  BRIDGE: espone Firebase al codice globale
// ═══════════════════════════════════════════
window._fb = {
  db, auth,
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, serverTimestamp, writeBatch, deleteField, limit,
  signInWithEmailAndPassword, signOut, onAuthStateChanged,
  updatePassword, reauthenticateWithCredential, EmailAuthProvider, sendPasswordResetEmail,
  GoogleAuthProvider, signInWithPopup, linkWithPopup, linkWithCredential,
  functionsInstance, httpsCallable,
  storage, ref, uploadBytes, getBytes, deleteObject

};
window._fbReady = true;
document.dispatchEvent(new Event('fb-ready'));
