// Avvio di Firebase (modulo) ed esposizione delle funzioni all'app in window._fb.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, serverTimestamp, writeBatch, deleteField, limit, arrayUnion }
  from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, updatePassword, reauthenticateWithCredential, EmailAuthProvider , sendPasswordResetEmail, GoogleAuthProvider, signInWithPopup, linkWithPopup, linkWithCredential, verifyBeforeUpdateEmail }
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
// Le funzioni chiamate dall'app stanno in europe-west1, vicino a Firestore
// (eur3): deve coincidere con la region dichiarata in functions/.
const functionsInstance = getFunctions(app, 'europe-west1');
const storage = getStorage(app);

// ═══════════════════════════════════════════
//  BRIDGE: espone Firebase al codice globale
// ═══════════════════════════════════════════
window._fb = {
  db, auth,
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, serverTimestamp, writeBatch, deleteField, limit, arrayUnion,
  signInWithEmailAndPassword, signOut, onAuthStateChanged,
  updatePassword, reauthenticateWithCredential, EmailAuthProvider, sendPasswordResetEmail, verifyBeforeUpdateEmail,
  GoogleAuthProvider, signInWithPopup, linkWithPopup, linkWithCredential,
  functionsInstance, httpsCallable,
  storage, ref, uploadBytes, getBytes, deleteObject

};
// PERF-001: riscaldamento di whoami. L'istanza della funzione si spegne quando non
// è usata e il primo accesso paga l'avviamento a freddo (1-2 secondi). Una sola
// chiamata per caricamento della pagina, senza credenziali e senza dati: whoami
// risponde subito "unauthenticated" (è proprio il suo primo controllo), ma l'istanza
// parte mentre l'utente scrive la password o la sessione salvata si ripristina.
// Fuori dall'SDK di proposito: l'SDK allegherebbe il token della sessione salvata
// e lo trasformerebbe in un vero accesso (registro accessi). Errori ignorati; il
// 401 che il browser scrive in console è atteso.
function riscaldaWhoami() {
  try {
    const regione = 'europe-west1';
    const progetto = firebaseConfig.projectId;
    const origine = functionsInstance.emulatorOrigin; // impostato solo dagli emulatori (collegamento locale)
    const url = origine
      ? origine + '/' + progetto + '/' + regione + '/whoami'
      : 'https://' + regione + '-' + progetto + '.cloudfunctions.net/whoami';
    fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"data":{}}',
      credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
    }).catch(() => {});
  } catch (e) { /* il riscaldamento non deve mai disturbare l'avvio */ }
}
riscaldaWhoami();

window._fbReady = true;
document.dispatchEvent(new Event('fb-ready'));
