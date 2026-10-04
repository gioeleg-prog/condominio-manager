// REB-01 / fase 2: confronta blob legacy e modello per edificio (conteggi,
// id e somme per edificio). Sola lettura, rieseguibile.
// Uso: node scripts/verify-backfill.js --project=<id>
const { adminDb } = require('./lib/firebase-admin');
const { verify } = require('./lib/buildings-migration');

const m = process.argv.slice(2).join(' ').match(/--project=(\S+)/);
if (!m) { console.error('Uso: node scripts/verify-backfill.js --project=<id>'); process.exit(1); }
verify(adminDb(m[1]), { log: (l) => console.log(l) })
  .then((ok) => { console.log(ok ? '\nVERIFICA OK: tutto combacia.' : '\nATTENZIONE: discrepanze.'); process.exit(ok ? 0 : 1); })
  .catch((e) => { console.error(e); process.exit(2); });
