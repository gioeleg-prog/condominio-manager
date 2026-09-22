const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const app = initializeApp({ credential: applicationDefault(), projectId: 'neridarimini-staging' });
const db = getFirestore(app);

async function main() {
  const snap = await db.collection('appdata').doc('cm_spese').get();
  const arr = JSON.parse(snap.data().value);
  console.log(JSON.stringify(arr.map(s => ({ id: s.id, titolo: s.titolo, edificioId: s.edificioId })), null, 2));
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
