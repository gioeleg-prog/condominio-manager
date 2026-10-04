// Backup completo di Firestore in un file JSON su Cloud Storage (fase 3 QA).
// Usato dalla funzione pianificata dailyBackup (functions/index.js), dallo
// script di ripristino (scripts/restore-backup.js) e dai test, così il
// formato è uno solo e il ripristino è collaudato.
//
// Contenuto: tutte le collezioni radice (appdata, buildings con le loro
// sottocollezioni, roles, users, appSettings, auditEvents, clientErrors…),
// documento per documento. I Timestamp sono salvati come {__ts: millis}.
const { Timestamp } = require('firebase-admin/firestore');

const BACKUP_PREFIX = 'backups/';
const KEEP_DAYS = 30;
// Collezioni non salvate: copie interne della migrazione, già ridondanti.
const SKIP_ROOT = new Set(['migrationJobs']);

function encode(v) {
  if (v instanceof Timestamp) return { __ts: v.toMillis() };
  if (Array.isArray(v)) return v.map(encode);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encode(x)]));
  return v;
}
function decode(v) {
  if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 1 && typeof v.__ts === 'number') {
    return Timestamp.fromMillis(v.__ts);
  }
  if (Array.isArray(v)) return v.map(decode);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, decode(x)]));
  return v;
}

// Legge ricorsivamente una collezione: { docId: { data, subcollections: { nome: {...} } } }
async function dumpCollection(ref) {
  const out = {};
  for (const d of (await ref.get()).docs) {
    const subs = {};
    for (const s of await d.ref.listCollections()) subs[s.id] = await dumpCollection(s);
    out[d.id] = { data: encode(d.data()), ...(Object.keys(subs).length ? { subcollections: subs } : {}) };
  }
  return out;
}

async function buildBackup(db) {
  const collections = {};
  let docs = 0;
  const count = (c) => Object.values(c).forEach((d) => { docs++; Object.values(d.subcollections || {}).forEach(count); });
  for (const c of await db.listCollections()) {
    if (SKIP_ROOT.has(c.id)) continue;
    collections[c.id] = await dumpCollection(c);
    count(collections[c.id]);
  }
  return { format: 'condominio-manager-backup', version: 1, createdAt: new Date().toISOString(), docs, collections };
}

// Riscrive i documenti del backup (sovrascrivendo quelli con lo stesso
// percorso). Non cancella documenti assenti dal backup: chi ripristina decide
// se svuotare prima (vedi scripts/restore-backup.js).
// I record degli edifici ricevono _restoredAt: il trigger auditTrail ignora
// queste scritture (altrimenti attribuirebbe una "creazione" all'ultimo autore
// del record al momento del ripristino); il ripristino stesso va registrato da
// chi lo esegue (scripts/restore-backup.js).
async function restoreBackup(db, backup) {
  if (backup?.format !== 'condominio-manager-backup') throw new Error('File di backup non riconosciuto.');
  const restoredAt = Timestamp.now();
  let batch = db.batch(); let n = 0; let total = 0;
  const write = async (ref, data) => {
    const isRecord = /^buildings\/[^/]+\/[^/]+\/[^/]+$/.test(ref.path);
    batch.set(ref, isRecord ? { ...decode(data), _restoredAt: restoredAt } : decode(data)); n++; total++;
    if (n === 400) { await batch.commit(); batch = db.batch(); n = 0; }
  };
  const walk = async (colRef, col) => {
    for (const [id, d] of Object.entries(col)) {
      await write(colRef.doc(id), d.data);
      for (const [sub, subCol] of Object.entries(d.subcollections || {})) await walk(colRef.doc(id).collection(sub), subCol);
    }
  };
  for (const [name, col] of Object.entries(backup.collections)) await walk(db.collection(name), col);
  if (n) await batch.commit();
  return total;
}

function backupFileName(date = new Date()) {
  // Data italiana: il backup delle 3 di notte appartiene a quel giorno.
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  return `${BACKUP_PREFIX}${d}.json`;
}

// Esegue il backup e la pulizia delle copie oltre KEEP_DAYS. Ritorna l'esito.
async function runBackup(db, bucket, { now = new Date() } = {}) {
  const backup = await buildBackup(db);
  const name = backupFileName(now);
  const body = JSON.stringify(backup);
  await bucket.file(name).save(body, { contentType: 'application/json', resumable: false });
  const limit = new Date(now.getTime() - KEEP_DAYS * 86400000);
  const [files] = await bucket.getFiles({ prefix: BACKUP_PREFIX });
  let removed = 0;
  for (const f of files) {
    const m = f.name.match(/^backups\/(\d{4}-\d{2}-\d{2})\.json$/);
    if (m && new Date(m[1] + 'T12:00:00Z') < limit) { await f.delete(); removed++; }
  }
  return { file: name, docs: backup.docs, sizeKB: Math.round(body.length / 1024), removed };
}

module.exports = { buildBackup, restoreBackup, runBackup, backupFileName, encode, decode, KEEP_DAYS };
