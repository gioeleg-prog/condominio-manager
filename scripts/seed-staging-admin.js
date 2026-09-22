// Seed del primo superAdmin su un progetto Firebase REALE (staging).
// Usa Application Default Credentials — esegui prima, se serve:
//   gcloud auth application-default login
//
// Uso:
//   node scripts/seed-staging-admin.js <uid> <email>

const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const PROJECT_ID = 'neridarimini-staging';

const app = initializeApp({
  credential: applicationDefault(),
  projectId: PROJECT_ID,
});
const auth = getAuth(app);
const db = getFirestore(app);

async function main() {
  const uid = process.argv[2];
  const email = process.argv[3];
  if (!uid || !email) {
    console.error('Uso: node seed-staging-admin.js <uid> <email>');
    process.exit(1);
  }

  console.log(`--- Seed superAdmin su ${PROJECT_ID} ---`);
  console.log('UID:', uid, '| Email:', email);

  await auth.setCustomUserClaims(uid, { role: 'superAdmin' });
  console.log('Custom claim role=superAdmin assegnato.');

  // ATTENZIONE: cm_config ha campi DIRETTI sul documento (non un blob "value"
  // come le altre chiavi appdata), con nomi camelCase — bug reale trovato ieri,
  // il primo tentativo con SUPER_ADMIN_UID/SUPER_ADMIN_EMAIL dentro "value" ha
  // fallito silenziosamente ("Account non configurato" al login).
  await db.collection('appdata').doc('cm_config').set({
    superAdminUid: uid,
    superAdminEmail: email,
  });
  console.log('appdata/cm_config seminato (superAdminUid + superAdminEmail).');

  await db.collection('roles').doc(uid).set({
    role: 'superAdmin',
    buildingId: null,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: 'seed-script',
  });
  console.log('roles/{uid} scritto.');

  console.log('\nFatto. Ora puoi fare login con', email, 'su index.staging.html');
  process.exit(0);
}

main().catch((e) => { console.error('Errore:', e); process.exit(1); });
