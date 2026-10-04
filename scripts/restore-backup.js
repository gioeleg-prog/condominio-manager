// Ripristina un backup creato da dailyBackup (functions/backup.js).
// Il --project va sempre passato esplicitamente. Prima di scrivere mostra
// cosa contiene il file e chiede --confirm.
//
// Uso:
//   node scripts/restore-backup.js --project=<id> --file=<percorso locale .json>              (anteprima)
//   node scripts/restore-backup.js --project=<id> --file=<percorso locale .json> --confirm    (ripristino)
//
// Il file si scarica dalla console Firebase → Storage → backups/.
// Sovrascrive i documenti presenti nel backup; non cancella quelli assenti.
const fs = require('fs');
const path = require('path');
const { adminDb, FieldValue } = require('./lib/firebase-admin');
const req = require('module').createRequire(path.join(__dirname, '..', 'functions', 'package.json'));
const { restoreBackup } = req('./backup');

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.match(/^--([^=]+)(?:=(.*))?$/)).filter(Boolean)
  .map((m) => [m[1], m[2] === undefined ? true : m[2]]));
if (!args.project || !args.file) {
  console.error('Uso: node scripts/restore-backup.js --project=<id> --file=<backup.json> [--confirm]');
  process.exit(1);
}
const backup = JSON.parse(fs.readFileSync(args.file, 'utf8'));
console.log(`Backup del ${backup.createdAt}: ${backup.docs} documenti in ${Object.keys(backup.collections).join(', ')}`);
if (!args.confirm) { console.log('Anteprima: nessuna scrittura. Aggiungi --confirm per ripristinare su ' + args.project + '.'); process.exit(0); }

(async () => {
  const db = adminDb(args.project);
  const n = await restoreBackup(db, backup);
  await db.collection('auditEvents').add({ type: 'backup.restored', file: path.basename(args.file),
    backupCreatedAt: backup.createdAt, docs: n, actorUid: process.env.USERNAME || 'script', at: FieldValue.serverTimestamp() });
  console.log(`Ripristinati ${n} documenti su ${args.project}.`);
  process.exit(0);
})().catch((e) => { console.error(e.message || e); process.exit(2); });
