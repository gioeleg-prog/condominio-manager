// REB-01 / fase 2 QA: logica di migrazione dal blob legacy (appdata/cm_*)
// al modello per edificio buildings/{buildingId}/{collezione}/{id}.
// Usata da scripts/backfill-buildings.js (progetti reali), da
// scripts/verify-backfill.js e dal seed degli emulatori (qa/seed.js), così
// la stessa identica logica è provata in test prima di toccare produzione.
//
// Non modifica MAI il blob legacy: resta come copia di sicurezza.
const { FieldValue, Timestamp } = require('./firebase-admin');

// chiave legacy → sottocollezione
const COLLECTION_OF = {
  cm_condomini: 'members',
  cm_spese: 'expenses',
  cm_entrate: 'payments',
  cm_fornitori: 'suppliers',
  cm_bacheca: 'notices',
  cm_verbali: 'minutes',
  cm_lavori: 'works',
  cm_delibere: 'resolutions',
};
const SUM_FIELD = { cm_spese: 'consuntivo', cm_entrate: 'importo', cm_delibere: 'budgetPrevisto' };
const BATCH_SIZE = 400; // limite Firestore per batch: 500
const MAX_RECORD_BYTES = 900 * 1024; // limite documento Firestore: 1 MiB

async function loadArr(db, key) {
  const snap = await db.collection('appdata').doc(key).get();
  try {
    const v = JSON.parse(snap.data()?.value || '[]');
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

// Data di creazione ricavata dall'id quando è un timestamp: newId() era
// Date.now()+rand(1000) fino a ottobre 2026, poi Date.now()*1000+rand(1000).
function guessCreatedAt(id) {
  const n = Number(id);
  if (!Number.isFinite(n)) return null;
  if (n > 1e15) return Timestamp.fromMillis(Math.floor(n / 1000));
  if (n > 1e12) return Timestamp.fromMillis(n);
  return null;
}

function toDoc(key, rec) {
  const out = {
    ...rec, // record legacy verbatim: id ed edificioId restano numerici
    _createdAt: guessCreatedAt(rec.id) || FieldValue.serverTimestamp(),
    _createdBy: 'backfill',
    _updatedAt: FieldValue.serverTimestamp(),
    _updatedBy: 'backfill',
    _deleted: false,
  };
  if (key === 'cm_condomini' && rec.email) out.emailLower = String(rec.email).toLowerCase();
  return out;
}

// Controlli prima di scrivere: abortisce, non indovina mai.
function preflight(raw) {
  const buildingIds = new Set(raw.cm_edifici.map((e) => String(e.id)));
  const errors = [];
  for (const key of Object.keys(COLLECTION_OF)) {
    const seen = new Set();
    for (const rec of raw[key]) {
      if (!rec || typeof rec !== 'object' || rec.id == null) { errors.push(`${key}: record senza id`); continue; }
      const idStr = String(rec.id);
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(idStr)) errors.push(`${key}/${idStr}: id non utilizzabile come documento`);
      if (seen.has(idStr)) errors.push(`${key}: id duplicato ${idStr}`);
      seen.add(idStr);
      if (key === 'cm_condomini' && rec.superAdmin) continue; // mai sotto un edificio
      if (rec.edificioId == null) { errors.push(`${key}/${idStr}: edificioId mancante`); continue; }
      if (!buildingIds.has(String(rec.edificioId))) errors.push(`${key}/${idStr}: edificio ${rec.edificioId} inesistente`);
      const size = Buffer.byteLength(JSON.stringify(rec));
      if (size > MAX_RECORD_BYTES) errors.push(`${key}/${idStr}: record troppo grande (${Math.round(size / 1024)} KB)`);
    }
  }
  for (const e of raw.cm_entrate) {
    if (e.condominoId != null && !raw.cm_condomini.some((c) => String(c.id) === String(e.condominoId))) {
      errors.push(`cm_entrate/${e.id}: condominoId ${e.condominoId} orfano`);
    }
  }
  for (const s of raw.cm_spese) {
    if (s.fornitoreId && !raw.cm_fornitori.some((f) => String(f.id) === String(s.fornitoreId))) {
      errors.push(`cm_spese/${s.id}: fornitoreId ${s.fornitoreId} orfano`);
    }
  }
  return errors;
}

async function loadRaw(db) {
  const raw = {};
  for (const key of [...Object.keys(COLLECTION_OF), 'cm_edifici']) raw[key] = await loadArr(db, key);
  return raw;
}

// Segnale di passaggio definitivo: dopo il cutover i dati veri sono in
// buildings/** e rieseguire la copia dal vecchio formato li sovrascriverebbe.
const CUTOVER_DOC = 'appSettings/buildingsCutover';

// Copia tutto dal vecchio formato, sovrascrivendo per intero i documenti di
// buildings/** (anche quelli di una prova precedente con metadati diversi) e
// rimuovendo quelli che nel vecchio formato non esistono più. Rieseguibile
// fino al cutover; dopo, si rifiuta (salvo force). Ritorna i conteggi.
async function backfill(db, { dryRun = false, log = () => {}, jobId = null, force = false } = {}) {
  const cut = await db.doc(CUTOVER_DOC).get();
  if (cut.exists && !force) {
    throw new Error('Migrazione già conclusa (cutover del ' + (cut.data().at?.toDate?.().toISOString() || '?')
      + '): i dati attuali sono in buildings/** e verrebbero sovrascritti. ABORTITA.');
  }
  const raw = await loadRaw(db);
  const errors = preflight(raw);
  if (errors.length) {
    const err = new Error(`${errors.length} problema/i — migrazione ABORTITA, nessuna scrittura:\n - ${errors.join('\n - ')}`);
    err.errors = errors;
    throw err;
  }
  const counts = { buildings: raw.cm_edifici.length };
  for (const [key, sub] of Object.entries(COLLECTION_OF)) {
    counts[sub] = raw[key].filter((r) => !(key === 'cm_condomini' && r.superAdmin)).length;
  }
  if (dryRun) return { counts, dryRun: true };

  if (jobId) {
    const jobRef = db.doc(`migrationJobs/${jobId}`);
    for (const key of Object.keys(raw)) {
      await jobRef.collection('sourceSnapshot').doc(key).set({ value: JSON.stringify(raw[key]), at: FieldValue.serverTimestamp() });
    }
    await jobRef.set({ status: 'running', startedAt: FieldValue.serverTimestamp() }, { merge: true });
  }

  const keepBuildings = new Set(raw.cm_edifici.map((e) => String(e.id)));
  for (const b of (await db.collection('buildings').get()).docs) {
    if (!keepBuildings.has(b.id)) { await db.recursiveDelete(b.ref); log(`buildings: rimosso ${b.id} (non più nel vecchio formato)`); }
  }
  for (const ed of raw.cm_edifici) {
    await db.doc(`buildings/${String(ed.id)}`).set({ ...ed, _createdBy: 'backfill', _updatedAt: FieldValue.serverTimestamp(),
      _updatedBy: 'backfill', _deleted: false });
  }
  log(`buildings: ${raw.cm_edifici.length}`);

  for (const [key, sub] of Object.entries(COLLECTION_OF)) {
    const arr = raw[key];
    let written = 0;
    for (let i = 0; i < arr.length; i += BATCH_SIZE) {
      const batch = db.batch();
      for (const rec of arr.slice(i, i + BATCH_SIZE)) {
        if (key === 'cm_condomini' && rec.superAdmin) {
          if (rec.uid) {
            batch.set(db.doc(`users/${rec.uid}`), { email: rec.email || null, nome: rec.nome || null,
              updatedAt: FieldValue.serverTimestamp() }, { merge: true });
          }
          continue;
        }
        batch.set(db.doc(`buildings/${String(rec.edificioId)}/${sub}/${String(rec.id)}`), toDoc(key, rec));
        written++;
      }
      await batch.commit();
    }
    // Copie di una prova precedente che nel vecchio formato non esistono più.
    let removed = 0;
    for (const bid of keepBuildings) {
      const want = new Set(arr.filter((r) => String(r.edificioId) === bid).map((r) => String(r.id)));
      for (const d of (await db.collection(`buildings/${bid}/${sub}`).get()).docs) {
        if (!want.has(d.id)) { await d.ref.delete(); removed++; }
      }
    }
    log(`${sub}: ${written}${removed ? `, rimossi ${removed} non più presenti` : ''}`);
  }
  if (jobId) await db.doc(`migrationJobs/${jobId}`).set({ status: 'completed', counts, finishedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { counts };
}

// Confronta blob legacy e nuovo modello: conteggi, id e somme per edificio.
async function verify(db, { log = () => {} } = {}) {
  const raw = await loadRaw(db);
  let ok = true;
  const sum = (arr, f) => arr.reduce((a, r) => a + (parseFloat(r[f]) || 0), 0);
  for (const [key, sub] of Object.entries(COLLECTION_OF)) {
    for (const ed of raw.cm_edifici) {
      const bid = String(ed.id);
      const legacy = raw[key].filter((r) => String(r.edificioId) === bid && !(key === 'cm_condomini' && r.superAdmin));
      const docs = (await db.collection(`buildings/${bid}/${sub}`).get()).docs.map((d) => d.data()).filter((d) => !d._deleted);
      const ids = (a) => a.map((r) => String(r.id)).sort().join(',');
      const f = SUM_FIELD[key];
      const sumOk = !f || Math.abs(sum(legacy, f) - sum(docs, f)) < 0.005;
      const lineOk = legacy.length === docs.length && ids(legacy) === ids(docs) && sumOk;
      if (!lineOk) ok = false;
      log(`${lineOk ? 'OK ' : 'KO '} ${sub} / edificio ${bid}: ${legacy.length} → ${docs.length}`
        + (f ? `, somma ${sum(legacy, f).toFixed(2)} → ${sum(docs, f).toFixed(2)}` : '')
        + (ids(legacy) === ids(docs) ? '' : ', ID DIVERSI'));
    }
  }
  return ok;
}

// Da chiamare UNA volta, dopo la verifica e il rilascio della nuova app: da qui
// in poi buildings/** è l'unica fonte dei dati e backfill si rifiuta.
async function markCutover(db, by = 'script') {
  await db.doc(CUTOVER_DOC).set({ at: FieldValue.serverTimestamp(), by });
}

module.exports = { COLLECTION_OF, backfill, verify, preflight, markCutover, CUTOVER_DOC };
