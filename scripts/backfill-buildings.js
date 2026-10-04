// REB-01 / fase 2: copia i dati dal blob legacy (appdata/cm_*) al modello
// per edificio buildings/{id}/{members|expenses|payments|suppliers|notices|
// minutes|works|resolutions}. Non tocca il blob legacy. Idempotente.
// Logica in scripts/lib/buildings-migration.js (la stessa usata dai test).
//
// Il --project va sempre passato esplicitamente, nessun default.
// Uso:
//   node scripts/backfill-buildings.js --project=<id> [--dry-run] [--job=<jobId>]
//   node scripts/backfill-buildings.js --project=<id> --mark-cutover   (dopo il rilascio
//     della nuova app: da lì in poi la copia dal vecchio formato è bloccata)
const { adminDb } = require('./lib/firebase-admin');
const { backfill, verify, markCutover } = require('./lib/buildings-migration');

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.match(/^--([^=]+)(?:=(.*))?$/)).filter(Boolean)
  .map((m) => [m[1], m[2] === undefined ? true : m[2]]));
if (!args.project) {
  console.error('Uso: node scripts/backfill-buildings.js --project=<id> [--dry-run] [--job=<jobId>]');
  process.exit(1);
}
const db = adminDb(args.project);
const jobId = args.job || `backfill-${new Date().toISOString().replace(/[:.]/g, '-')}`;

(async () => {
  if (args['mark-cutover']) {
    await markCutover(db, process.env.USERNAME || 'script');
    console.log(`Cutover registrato su ${args.project}: la copia dal vecchio formato è ora bloccata.`);
    return process.exit(0);
  }
  console.log(`Progetto ${args.project}${args['dry-run'] ? ' (DRY RUN)' : `, job ${jobId}`}`);
  const res = await backfill(db, { dryRun: !!args['dry-run'], jobId: args['dry-run'] ? null : jobId, log: (l) => console.log('  ' + l) });
  console.log('Conteggi:', JSON.stringify(res.counts));
  if (res.dryRun) return process.exit(0);
  console.log('\nVerifica:');
  const ok = await verify(db, { log: (l) => console.log('  ' + l) });
  console.log(ok ? '\nMIGRAZIONE COMPLETATA E VERIFICATA.' : '\nATTENZIONE: discrepanze, vedi sopra.');
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e.message || e); process.exit(2); });
