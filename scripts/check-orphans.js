// Sola lettura: verifica record "orfani" (senza edificioId, o con un
// edificioId che non corrisponde a nessun edificio reale) su produzione.
// Non modifica nulla — serve per l'exit criteria del P0 di REB-01.
//
// Uso: node scripts/check-orphans.js

const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const app = initializeApp({ credential: applicationDefault(), projectId: 'condominio-manager-9e99a' });
const db = getFirestore(app);

async function loadArr(key) {
  const snap = await db.collection('appdata').doc(key).get();
  try { return JSON.parse(snap.data()?.value || '[]'); } catch { return []; }
}

async function main() {
  const [edifici, condomini, spese, entrate, fornitori] = await Promise.all(
    ['cm_edifici', 'cm_condomini', 'cm_spese', 'cm_entrate', 'cm_fornitori'].map(loadArr)
  );
  const buildingIds = new Set(edifici.map(e => String(e.id)));
  console.log('Edifici reali:', [...buildingIds].join(', '));

  const problems = [];
  const seenIds = {};

  const check = (key, arr, { skipSuperAdmin = false } = {}) => {
    seenIds[key] = new Set();
    for (const rec of arr) {
      if (rec.id == null) problems.push(`${key}: record senza id (${JSON.stringify(rec).slice(0,80)})`);
      const idStr = String(rec.id);
      if (seenIds[key].has(idStr)) problems.push(`${key}: id duplicato ${idStr}`);
      seenIds[key].add(idStr);

      if (skipSuperAdmin && rec.superAdmin) continue;
      if (rec.edificioId == null) problems.push(`${key}/${rec.id} (${rec.nome||rec.titolo||''}): edificioId MANCANTE`);
      else if (!buildingIds.has(String(rec.edificioId))) problems.push(`${key}/${rec.id} (${rec.nome||rec.titolo||''}): edificioId ${rec.edificioId} NON ESISTE come edificio`);
    }
  };

  check('cm_condomini', condomini, { skipSuperAdmin: true });
  check('cm_spese', spese);
  check('cm_entrate', entrate);
  check('cm_fornitori', fornitori);

  // FK referenziali
  for (const e of entrate) {
    if (!condomini.some(c => String(c.id) === String(e.condominoId))) {
      problems.push(`cm_entrate/${e.id}: condominoId ${e.condominoId} orfano (nessun condomino corrispondente)`);
    }
  }
  for (const s of spese) {
    if (s.fornitoreId && !fornitori.some(f => String(f.id) === String(s.fornitoreId))) {
      problems.push(`cm_spese/${s.id}: fornitoreId ${s.fornitoreId} orfano (nessun fornitore corrispondente)`);
    }
    for (const a of (s.allegati || [])) {
      if (a.storagePath && !a.storagePath.startsWith(`buildings/${s.edificioId}/`)) {
        problems.push(`cm_spese/${s.id}: allegato ${a.id} con storagePath sotto un edificio diverso (${a.storagePath}, spesa in ${s.edificioId})`);
      }
    }
  }

  console.log(`\nConteggi: edifici=${edifici.length} condomini=${condomini.length} spese=${spese.length} entrate=${entrate.length} fornitori=${fornitori.length}`);

  if (problems.length === 0) {
    console.log('\nNESSUN PROBLEMA TROVATO. Dati puliti per il backfill.');
  } else {
    console.log(`\n${problems.length} PROBLEMA/I TROVATO/I:`);
    problems.forEach(p => console.log(' - ' + p));
  }
  process.exit(problems.length === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(2); });
