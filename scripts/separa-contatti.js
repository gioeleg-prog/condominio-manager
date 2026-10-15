// Privacy tra condomini (decisione del 2026-10-15): sposta email e telefono dei
// condomini da buildings/{b}/members/{id} a buildings/{b}/contatti/{id}.
// Logica e garanzie in scripts/lib/contatti-migration.js (la stessa usata dai test).
//
// Va eseguito DOPO il deploy di regole e functions e il merge dell'app che
// leggono i contatti. Prima su staging, poi in produzione. Senza --esegui
// non scrive nulla e dice solo cosa farebbe.
// Il --project va sempre passato esplicitamente, nessun default.
// Uso:
//   node scripts/separa-contatti.js --project=<id>            (prova, nessuna scrittura)
//   node scripts/separa-contatti.js --project=<id> --esegui   (sposta e verifica)
const { adminDb } = require('./lib/firebase-admin');
const { separaContatti, verificaContatti } = require('./lib/contatti-migration');

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.match(/^--([^=]+)(?:=(.*))?$/)).filter(Boolean)
  .map((m) => [m[1], m[2] === undefined ? true : m[2]]));
if (!args.project) {
  console.error('Uso: node scripts/separa-contatti.js --project=<id> [--esegui]');
  process.exit(1);
}
const db = adminDb(args.project);

(async () => {
  const prova = !args.esegui;
  console.log(`Progetto ${args.project}${prova ? ' (PROVA: nessuna scrittura)' : ''}`);
  const esito = await separaContatti(db, { dryRun: prova, log: (l) => console.log('  ' + l) });
  if (prova) return process.exit(esito.conflitti.length ? 1 : 0);
  const problemi = await verificaContatti(db);
  problemi.forEach((p) => console.log('  PROBLEMA ' + p));
  const ok = !problemi.length && !esito.conflitti.length;
  console.log(ok ? '\nCONTATTI SEPARATI E VERIFICATI.' : '\nATTENZIONE: vedi sopra (i condomini con problemi non sono stati toccati).');
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e.message || e); process.exit(2); });
