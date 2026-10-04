// Genera qa/out/harness.html: copia di index.staging.html collegata agli
// emulatori Firebase locali (progetto demo-qa, nessun dato reale).
// Uso: node qa/build-harness.js
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'index.staging.html'), 'utf8');
let out = src;

// 1. Config Firebase → progetto demo (gli emulatori non toccano mai il cloud).
out = out.replace(/const firebaseConfig = \{[\s\S]*?\};/, `const firebaseConfig = {
    apiKey: "demo-key", authDomain: "demo-qa.firebaseapp.com", projectId: "demo-qa",
    storageBucket: "demo-qa.appspot.com", messagingSenderId: "0", appId: "demo"
  };`);

// 2. Import delle funzioni connect*Emulator.
out = out
  .replace("import { getFirestore, ", "import { connectFirestoreEmulator, getFirestore, ")
  .replace("import { getAuth, ", "import { connectAuthEmulator, getAuth, ")
  .replace("import { getFunctions, ", "import { connectFunctionsEmulator, getFunctions, ")
  .replace("import { getStorage, ", "import { connectStorageEmulator, getStorage, ");

// 3. Collegamento agli emulatori subito dopo l'inizializzazione.
out = out.replace("const storage = getStorage(app);", `const storage = getStorage(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFunctionsEmulator(functionsInstance, '127.0.0.1', 5001);
  connectStorageEmulator(storage, '127.0.0.1', 9199);`);

// 4. CSP: aggiunge gli host locali degli emulatori.
out = out.replace(/connect-src 'self'/, "connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:*")
         .replace(/frame-src 'self'/, "frame-src 'self' http://127.0.0.1:* http://localhost:*");

for (const marker of ['connectFirestoreEmulator(db', 'projectId: "demo-qa"', 'http://127.0.0.1:*']) {
  if (!out.includes(marker)) { console.error('Patch fallita:', marker); process.exit(1); }
}
fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'out', 'harness.html'), out);
console.log('qa/out/harness.html generato');
