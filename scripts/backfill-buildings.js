// REB-01 P1/P2: copia i dati dal blob legacy (appdata/cm_*) alle nuove
// sottocollection buildings/{buildingId}/{members|expenses|payments|suppliers}.
// NON tocca il blob legacy (resta autoritativo finché il dual-write non è
// attivo — vedi piano). Idempotente e resumibile: rieseguibile senza
// duplicare nulla, riprende da dove interrotto tramite migrationJobs/{jobId}.
//
// SOLO STAGING finché non esplicitamente approvato per produzione — il
// --project va sempre passato esplicitamente, nessun default.
//
// Uso:
//   node scripts/backfill-buildings.js --project=neridarimini-staging --job=<jobId> [--dry-run] [--only=cm_spese]

const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');

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
const JOB_ID = args.job || `backfill-${new Date().toISOString().slice(0, 10)}`;
const DRY_RUN = !!args['dry-run'];
const ONLY = args.only || null;

if (!PROJECT_ID) {
  console.error('Uso: node scripts/backfill-buildings.js --project=<id> --job=<jobId> [--dry-run] [--only=cm_spese]');
  process.exit(1);
}

const app = initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
const db = getFirestore(app);

const COLLECTION_OF = {
  cm_condomini: 'members',
  cm_spese: 'expenses',
  cm_entrate: 'payments',
  cm_fornitori: 'suppliers',
};
const BATCH_SIZE = 400; // limite Firestore per batch: 500

async function loadArr(key) {
  const snap = await db.collection('appdata').doc(key).get();
  try { return JSON.parse(snap.data()?.value || '[]'); } catch { return []; }
}

// createdAt: newId() (index.html) è Date.now() + rand(1000) — un epoch
// plausibile per i record generati dall'app. I 6 condomini/edifici
// demo originali hanno id piccoli (1..6), non un epoch: per quelli non
// abbiamo una data reale, si usa il momento del backfill come miglior
// approssimazione onesta, documentata qui.
function guessCreatedAt(id) {
  const n = Number(id);
  if (Number.isFinite(n) && n > 1e12) return Timestamp.fromDate(new Date(n));
  return null; // → FieldValue.serverTimestamp() a valle
}

function withMeta(rec) {
  const created = guessCreatedAt(rec.id);
  const { ...clean } = rec;
  return {
    ...clean, // record legacy VERBATIM: id ed edificioId restano numerici
    createdAt: created || FieldValue.serverTimestamp(),
    createdBy: 'backfill',
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: 'backfill',
    version: 1,
    deletedAt: null,
    _migratedBy: JOB_ID,
  };
}

async function main() {
  const jobRef = db.doc(`migrationJobs/${JOB_ID}`);
  const jobSnap = await jobRef.get();
  const job = jobSnap.exists ? jobSnap.data() : { cursor: {}, counts: {} };

  console.log(`Job: ${JOB_ID} su progetto ${PROJECT_ID}${DRY_RUN ? ' (DRY RUN)' : ''}`);

  // ── 1. leggi ogni blob UNA volta, snapshot verbatim per audit/rollback ──
  const raw = {};
  for (const key of [...Object.keys(COLLECTION_OF), 'cm_edifici']) {
    raw[key] = await loadArr(key);
  }
  if (!job.snapshotted && !DRY_RUN) {
    for (const key of Object.keys(raw)) {
      await jobRef.collection('sourceSnapshot').doc(key)
        .set({ value: JSON.stringify(raw[key]), at: FieldValue.serverTimestamp() });
    }
  }

  // ── 2. PRE-FLIGHT — abortisce, non indovina mai ──────────────────────
  const buildingIds = new Set(raw.cm_edifici.map((e) => String(e.id)));
  const errors = [];
  for (const [key] of Object.entries(COLLECTION_OF)) {
    const seen = new Set();
    for (const rec of raw[key]) {
      if (rec.id == null) { errors.push(`${key}: record senza id`); continue; }
      const idStr = String(rec.id);
      if (seen.has(idStr)) errors.push(`${key}: id duplicato ${idStr}`);
      seen.add(idStr);

      if (key === 'cm_condomini' && rec.superAdmin) continue; // mai sotto un building
      if (rec.edificioId == null) { errors.push(`${key}/${rec.id}: edificioId mancante`); continue; }
      if (!buildingIds.has(String(rec.edificioId))) {
        errors.push(`${key}/${rec.id}: edificio ${rec.edificioId} inesistente`);
      }
    }
  }
  for (const e of raw.cm_entrate) {
    if (!raw.cm_condomini.some((c) => String(c.id) === String(e.condominoId))) {
      errors.push(`cm_entrate/${e.id}: condominoId ${e.condominoId} orfano`);
    }
  }
  for (const s of raw.cm_spese) {
    if (s.fornitoreId && !raw.cm_fornitori.some((f) => String(f.id) === String(s.fornitoreId))) {
      errors.push(`cm_spese/${s.id}: fornitoreId ${s.fornitoreId} orfano`);
    }
    for (const a of (s.allegati || [])) {
      if (a.storagePath && !a.storagePath.startsWith(`buildings/${s.edificioId}/`)) {
        errors.push(`cm_spese/${s.id}: allegato ${a.id} sotto un edificio diverso (${a.storagePath})`);
      }
    }
  }
  if (errors.length) {
    console.error(`\n${errors.length} PROBLEMA/I — backfill ABORTITO, nessuna scrittura:`);
    errors.forEach((e) => console.error(' - ' + e));
    process.exit(1);
  }
  console.log('Pre-flight OK: nessun record orfano/duplicato/con FK rotta.');

  if (DRY_RUN) {
    console.log('\nDRY RUN: nessuna scrittura eseguita. Conteggi che verrebbero scritti:');
    console.log('  buildings:', raw.cm_edifici.length);
    for (const [key, sub] of Object.entries(COLLECTION_OF)) {
      console.log(`  ${sub}:`, raw[key].length);
    }
    process.exit(0);
  }

  // ── 3. buildings ──────────────────────────────────────────────────────
  for (const ed of raw.cm_edifici) {
    await db.doc(`buildings/${String(ed.id)}`).set(withMeta(ed), { merge: true });
  }
  console.log(`buildings: scritti ${raw.cm_edifici.length}`);

  // ── 4. sottocollection, resumibili ──────────────────────────────────
  for (const [key, sub] of Object.entries(COLLECTION_OF)) {
    if (ONLY && ONLY !== key) continue;
    const arr = raw[key];
    let start = job.cursor?.[key] || 0;
    for (let i = start; i < arr.length; i += BATCH_SIZE) {
      const batch = db.batch();
      let n = 0;
      for (const rec of arr.slice(i, i + BATCH_SIZE)) {
        if (key === 'cm_condomini' && rec.superAdmin) {
          if (rec.uid) {
            batch.set(db.doc(`users/${rec.uid}`), {
              email: rec.email || null, nome: rec.nome || null,
              updatedAt: FieldValue.serverTimestamp(),
            }, { merge: true });
            n++;
          }
          continue;
        }
        const ref = db.doc(`buildings/${String(rec.edificioId)}/${sub}/${String(rec.id)}`);
        batch.set(ref, withMeta(rec), { merge: true });
        n++;
      }
      await batch.commit();
      const newCursor = { ...(job.cursor || {}), [key]: i + BATCH_SIZE };
      await jobRef.set({
        cursor: newCursor,
        counts: { ...(job.counts || {}), [key]: Math.min(i + BATCH_SIZE, arr.length) },
        status: 'running',
        snapshotted: true,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      console.log(`  ${sub}: ${Math.min(i + BATCH_SIZE, arr.length)}/${arr.length}`);
    }
  }

  await jobRef.set({ status: 'completed', finishedAt: FieldValue.serverTimestamp() }, { merge: true });
  console.log('\nBACKFILL COMPLETATO.');
  process.exit(0);
}

main().catch((e) => { console.error('Errore:', e); process.exit(2); });
