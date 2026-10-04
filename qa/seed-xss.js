// Variante del seed per il test di XSS memorizzata: scrive direttamente su
// Firestore (bypassando i controlli di saveBuildingData) un payload HTML in
// ogni campo di testo di ogni record. Poi si naviga l'app con ogni ruolo e si
// verifica che nessun payload venga eseguito né diventi un elemento della
// pagina. Uso: node qa/seed-xss.js  (emulatori avviati)
const path = require('path');
const { seed, PROJECT } = require('./seed');
const { backfill } = require('../scripts/lib/buildings-migration');
const req = require('module').createRequire(path.join(__dirname, '..', 'functions', 'package.json'));
const { getApps } = req('firebase-admin/app');
const { getFirestore } = req('firebase-admin/firestore');

const PAYLOAD = `"'><img src=x data-xss=1 onerror="window.__xss=(window.__xss||0)+1">`;
// Campi che restano validi: identificativi, riferimenti, colori, date, importi
// (il test riguarda il testo libero, non la robustezza ai tipi sbagliati).
const KEEP = new Set(['id', 'edificioId', 'uid', 'color', 'colore', 'data', 'scadenza', 'condominoId',
  'fornitoreId', 'verbaleRifId', 'delibereRifId', 'preventivo', 'consuntivo', 'importo', 'budget',
  'percentuale', 'categoria', 'tipoSpesa', 'frequenza', 'ricorrenzaFine', 'createdAt', 'perc', 'email', 'stato', 'tipo']);

function poison(v, key) {
  if (KEEP.has(key)) return v;
  if (typeof v === 'string') return v + PAYLOAD;
  if (Array.isArray(v)) return v.map((x) => poison(x, key));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, poison(x, k)]));
  return v;
}

async function seedXss() {
  await seed({ legacyOnly: true });
  const db = getFirestore(getApps()[0]);
  const keys = ['cm_condomini', 'cm_spese', 'cm_entrate', 'cm_fornitori', 'cm_bacheca', 'cm_verbali',
    'cm_lavori', 'cm_delibere', 'cm_edifici'];
  for (const k of keys) {
    const ref = db.collection('appdata').doc(k);
    const arr = JSON.parse((await ref.get()).data().value);
    await ref.set({ value: JSON.stringify(arr.map((r) => poison(r))) });
  }
  // Campi "a valore chiuso" con valori fuori elenco: devono comparire come testo.
  const del = db.collection('appdata').doc('cm_delibere');
  const d = JSON.parse((await del.get()).data().value);
  d[0].stato = PAYLOAD;
  await del.set({ value: JSON.stringify(d) });
  // Categoria personalizzata e registro accessi.
  await db.collection('appdata').doc('cm_categorie').set({ value: JSON.stringify([
    { id: 'pulizie', label: 'Pulizie' + PAYLOAD, tipo: 'ordinaria', icon: '🧹' + PAYLOAD },
    { id: 'altro', label: 'Altro', tipo: 'ordinaria', icon: '📦' },
  ]) });
  await db.collection('appdata').doc('cm_login_stats').set({ value: JSON.stringify({
    103: { nome: 'Marta' + PAYLOAD, ultimoLogin: '2026-10-01 10:00' + PAYLOAD, totale: 1, mensile: { '2026-10': 1 } },
  }) });
  // Il modello per edificio con la migrazione reale, sui dati avvelenati.
  await backfill(db);
}
module.exports = { seedXss, PAYLOAD, PROJECT };
if (require.main === module) seedXss().then(() => { console.log('Seed XSS completato'); process.exit(0); }, (e) => { console.error(e); process.exit(1); });
