// Genera qa/out/harness.html: la pagina dell'app collegata agli emulatori
// Firebase locali (progetto demo-qa, nessun dato reale).
// Uso: node qa/build-harness.js  — poi aprire http://localhost:8911/qa/out/harness.html
//
// Usa gli stessi css/ e js/ dell'app (tramite <base href="../../">); sostituisce
// solo la configurazione (config.harness.js) e il modulo Firebase
// (firebase.harness.js, che si collega agli emulatori).
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const outDir = path.join(__dirname, 'out');
fs.mkdirSync(outDir, { recursive: true });

// 1. Configurazione del progetto demo.
fs.writeFileSync(path.join(outDir, 'config.harness.js'), `window.FIREBASE_CONFIG = {
  apiKey: "demo-key", authDomain: "demo-qa.firebaseapp.com", projectId: "demo-qa",
  storageBucket: "demo-qa.appspot.com", messagingSenderId: "0", appId: "demo"
};
`);

// 2. Modulo Firebase collegato agli emulatori.
let fb = fs.readFileSync(path.join(root, 'js', 'firebase.js'), 'utf8');
fb = fb
  .replace('import { getFirestore, ', 'import { connectFirestoreEmulator, getFirestore, ')
  .replace('import { getAuth, ', 'import { connectAuthEmulator, getAuth, ')
  .replace('import { getFunctions, ', 'import { connectFunctionsEmulator, getFunctions, ')
  .replace('import { getStorage, ', 'import { connectStorageEmulator, getStorage, ')
  .replace('const storage = getStorage(app);', `const storage = getStorage(app);
connectFirestoreEmulator(db, '127.0.0.1', 8080);
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
connectFunctionsEmulator(functionsInstance, '127.0.0.1', 5001);
connectStorageEmulator(storage, '127.0.0.1', 9199);`);
if (!fb.includes('connectFirestoreEmulator(db')) { console.error('Patch del modulo Firebase fallita'); process.exit(1); }
fs.writeFileSync(path.join(outDir, 'firebase.harness.js'), fb);

// 3. Pagina: stessa di index.html, con base alla radice del repository.
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html
  .replace('<head>', '<head>\n<base href="../../">')
  .replace(/<script src="js\/config\.js(\?v=[0-9a-f]*)?"><\/script>/, '<script src="qa/out/config.harness.js"></script>')
  .replace(/<script type="module" src="js\/firebase\.js(\?v=[0-9a-f]*)?"><\/script>/, '<script type="module" src="qa/out/firebase.harness.js"></script>')
  .replace(/connect-src 'self'/, "connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:*")
  .replace(/frame-src 'self'/, "frame-src 'self' http://127.0.0.1:* http://localhost:*");
for (const marker of ['<base href="../../">', 'qa/out/config.harness.js', 'qa/out/firebase.harness.js', 'http://127.0.0.1:*']) {
  if (!html.includes(marker)) { console.error('Patch fallita:', marker); process.exit(1); }
}
fs.writeFileSync(path.join(outDir, 'harness.html'), html);
console.log('qa/out/harness.html generato');
