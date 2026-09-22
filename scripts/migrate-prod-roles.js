// Migrazione one-off: assegna il custom claim di ruolo ai condomini reali di
// produzione che hanno GIA' un uid collegato (login precedente), mappando i
// loro flag legacy canEdit/isAdmin/superAdmin. Necessario perche' getBuildingData
// (SEC-03) rifiuta chiunque non abbia un ruolo assegnato, e nessun condomino
// esistente (a parte il superAdmin, seedato a parte) ce l'ha mai avuto.
//
// Usa Application Default Credentials (gia' configurate in questa sessione).
//
// Uso: node scripts/migrate-prod-roles.js

const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const PROJECT_ID = 'condominio-manager-9e99a';
const app = initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
const auth = getAuth(app);
const db = getFirestore(app);

async function main() {
  const ref = db.collection('appdata').doc('cm_condomini');
  const snap = await ref.get();
  const arr = JSON.parse(snap.data().value);

  for (const c of arr) {
    if (!c.uid) {
      console.log(`SKIP ${c.nome} (${c.email}) — nessun uid, verra' provisionato al prossimo primo login.`);
      continue;
    }
    const user = await auth.getUser(c.uid).catch(() => null);
    if (!user) {
      console.log(`SKIP ${c.nome} — uid ${c.uid} non trovato in Firebase Auth.`);
      continue;
    }
    if (user.customClaims?.role) {
      console.log(`SKIP ${c.nome} — ha gia' il claim role=${user.customClaims.role}.`);
      continue;
    }

    const role = c.superAdmin ? 'superAdmin'
      : (c.isAdmin ? 'adminEdificio' : (c.canEdit ? 'editor' : 'member'));
    const claims = role === 'superAdmin' ? { role } : { role, buildingId: String(c.edificioId || '') };
    await auth.setCustomUserClaims(c.uid, claims);
    await db.collection('roles').doc(c.uid).set({
      role,
      buildingId: claims.buildingId || null,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: 'migrate-prod-roles-script',
    }, { merge: true });
    console.log(`OK   ${c.nome} (${c.email}) -> role=${role} buildingId=${claims.buildingId || '-'}`);
  }

  console.log('\nFatto.');
  process.exit(0);
}

main().catch((e) => { console.error('Errore:', e); process.exit(1); });
