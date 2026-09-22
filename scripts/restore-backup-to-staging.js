// Verifica che il backup JSON esportato dall'app sia effettivamente
// ripristinabile: lo scrive su STAGING (mai produzione) e ne verifica i
// conteggi. Stessa logica di window.importaDati (index.html:1369), ma da
// Admin SDK per gestire comodamente un file di centinaia di KB.
//
// Uso: node scripts/restore-backup-to-staging.js <path-al-backup.json>

const fs = require('fs');
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const PROJECT_ID = 'neridarimini-staging';
const app = initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
const db = getFirestore(app);

async function main() {
  const path = process.argv[2];
  if (!path) { console.error('Uso: node restore-backup-to-staging.js <path.json>'); process.exit(1); }

  const backup = JSON.parse(fs.readFileSync(path, 'utf8'));
  if (!backup.data) { console.error('Backup non valido: manca "data".'); process.exit(1); }

  console.log(`Backup del ${backup.timestamp}, edificioAttivo=${backup.edificioAttivo}`);
  const keys = Object.keys(backup.data);
  console.log('Chiavi:', keys.join(', '));

  for (const key of keys) {
    const val = backup.data[key];
    await db.collection('appdata').doc(key).set({ value: JSON.stringify(val) });
    const count = Array.isArray(val) ? val.length : 1;
    console.log(`  ${key}: scritti ${count} elementi`);
  }

  console.log('\nVerifica: rileggo da staging e confronto i conteggi...');
  let ok = true;
  for (const key of keys) {
    const snap = await db.collection('appdata').doc(key).get();
    const reread = JSON.parse(snap.data().value);
    const expected = Array.isArray(backup.data[key]) ? backup.data[key].length : null;
    const actual = Array.isArray(reread) ? reread.length : null;
    const match = expected === actual;
    if (!match) ok = false;
    console.log(`  ${key}: atteso=${expected} letto=${actual} ${match ? 'OK' : 'MISMATCH'}`);
  }

  console.log(ok ? '\nRIPRISTINO VERIFICATO CON SUCCESSO.' : '\nATTENZIONE: discrepanze trovate.');
  process.exit(ok ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(2); });
