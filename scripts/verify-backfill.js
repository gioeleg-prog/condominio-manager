// REB-01: confronta il blob legacy (appdata/cm_*) con le nuove
// sottocollection buildings/{id}/{members|expenses|payments|suppliers}.
// Sola lettura, rieseguibile quante volte serve (anche più volte di
// seguito per verificare l'idempotenza del backfill).
//
// Uso: node scripts/verify-backfill.js --project=<id>

const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

function parseArgs() {
  const args = {};
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) args[m[1]] = m[2] === undefined ? true : m[2];
  }
  return args;
}

const args = parseArgs();
const PROJECT_ID = args.project;
if (!PROJECT_ID) { console.error('Uso: node scripts/verify-backfill.js --project=<id>'); process.exit(1); }

const app = initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
const db = getFirestore(app);

const COLLECTION_OF = { cm_condomini: 'members', cm_spese: 'expenses', cm_entrate: 'payments', cm_fornitori: 'suppliers' };
const SUM_FIELD = { cm_spese: 'consuntivo', cm_entrate: 'importo', cm_fornitori: null, cm_condomini: null };

async function loadArr(key) {
  const snap = await db.collection('appdata').doc(key).get();
  try { return JSON.parse(snap.data()?.value || '[]'); } catch { return []; }
}

function sum(arr, field) {
  if (!field) return null;
  return arr.reduce((a, r) => a + (parseFloat(r[field]) || 0), 0);
}

async function main() {
  const edifici = await loadArr('cm_edifici');
  let allOk = true;

  for (const [key, sub] of Object.entries(COLLECTION_OF)) {
    const legacyArr = await loadArr(key);

    for (const ed of edifici) {
      const bid = String(ed.id);
      const legacySlice = legacyArr.filter((r) => key === 'cm_condomini'
        ? (String(r.edificioId) === bid && !r.superAdmin)
        : String(r.edificioId) === bid);

      const snap = await db.collection(`buildings/${bid}/${sub}`).get();
      const newDocs = snap.docs.map((d) => d.data());

      const countMatch = legacySlice.length === newDocs.length;
      const legacyIds = new Set(legacySlice.map((r) => String(r.id)));
      const newIds = new Set(newDocs.map((r) => String(r.id)));
      const idsMatch = legacyIds.size === newIds.size && [...legacyIds].every((id) => newIds.has(id));

      const field = SUM_FIELD[key];
      const legacySum = sum(legacySlice, field);
      const newSum = sum(newDocs, field);
      const sumMatch = field ? Math.abs(legacySum - newSum) < 0.005 : true;

      const ok = countMatch && idsMatch && sumMatch;
      if (!ok) allOk = false;
      console.log(`${sub} / edificio ${bid} (${ed.nome || ''}): count ${legacySlice.length}=${newDocs.length} ${countMatch ? 'OK' : 'MISMATCH'}` +
        (field ? `, somma ${legacySum.toFixed(2)}=${newSum.toFixed(2)} ${sumMatch ? 'OK' : 'MISMATCH'}` : '') +
        (idsMatch ? '' : ', ID DIVERGENTI'));
    }
  }

  console.log(allOk ? '\nVERIFICA OK: tutto combacia.' : '\nATTENZIONE: trovate discrepanze, vedi sopra.');
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
