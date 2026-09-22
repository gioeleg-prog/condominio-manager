const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const app = initializeApp({ credential: applicationDefault(), projectId: 'condominio-manager-9e99a' });
const db = getFirestore(app);

async function main() {
  const snap = await db.collection('appdata').doc('cm_condomini').get();
  const arr = JSON.parse(snap.data().value);
  console.log(JSON.stringify(arr.map(c => ({
    id: c.id, nome: c.nome, email: c.email, uid: c.uid || null,
    canEdit: !!c.canEdit, isAdmin: !!c.isAdmin, superAdmin: !!c.superAdmin,
    edificioId: c.edificioId || null, disabled: !!c.disabled,
  })), null, 2));
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
