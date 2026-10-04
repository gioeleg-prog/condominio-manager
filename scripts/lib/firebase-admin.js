// firebase-admin è installato solo in functions/: gli script lo prendono da lì.
const path = require('path');
const req = require('module').createRequire(path.join(__dirname, '..', '..', 'functions', 'package.json'));
const { initializeApp, getApps, applicationDefault } = req('firebase-admin/app');
const { getFirestore, FieldValue, Timestamp } = req('firebase-admin/firestore');
const { getAuth } = req('firebase-admin/auth');

// Sugli emulatori (FIRESTORE_EMULATOR_HOST impostato) niente credenziali reali.
function adminDb(projectId) {
  const app = getApps()[0] || initializeApp(process.env.FIRESTORE_EMULATOR_HOST
    ? { projectId }
    : { credential: applicationDefault(), projectId });
  return getFirestore(app);
}
module.exports = { adminDb, FieldValue, Timestamp, getAuth, getApps, initializeApp };
