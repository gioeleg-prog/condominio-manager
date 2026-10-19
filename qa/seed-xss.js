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
  'fornitoreId', 'verbaleRifId', 'delibereRifId', 'preventivo', 'consuntivo', 'importo', 'budget', 'budgetPrevisto', 'dataApprovazione', 'dataPrevistaCompletamento',
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
  // Allegato con id avvelenato (audit 2026-10-15): l'id finisce in attributi
  // data-* tra apici singoli. Scritto qui, senza passare dalle regole che oggi
  // lo rifiuterebbero, come un dato già presente nel database.
  const sp = db.collection('appdata').doc('cm_spese');
  const s = JSON.parse((await sp.get()).data().value);
  s[0].allegati = [{ id: '1' + PAYLOAD, nome: 'fattura.pdf' + PAYLOAD, mime: 'application/pdf' + PAYLOAD, size: 10, storagePath: 'buildings/1/allegati/x.pdf' }];
  await sp.set({ value: JSON.stringify(s) });
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
  await avvelenaIdentificativi(db);
}

// Audit 2026-10-19: id dei record, riferimenti, vecchi allegati incorporati e
// millesimi finiscono in attributi HTML. Scritti qui direttamente (le regole
// oggi li rifiutano) come dati già presenti: l'app non deve né eseguirli né
// trasformarli in elementi della pagina.
async function avvelenaIdentificativi(db) {
  const b1 = db.collection('buildings').doc('1');
  const bad = '1' + PAYLOAD; // nessuna "/": è anche un id di documento valido
  const primo = async (coll) => (await b1.collection(coll).limit(1).get()).docs[0];
  // Record con id del documento (e campo id) avvelenato, in ogni collezione.
  for (const coll of ['expenses', 'payments', 'suppliers', 'members', 'notices', 'minutes', 'works', 'resolutions']) {
    const d = await primo(coll);
    // (il condomino copiato non porta con sé l'account: whoami lo troverebbe due volte)
    if (d) await b1.collection(coll).doc(bad).set({ ...d.data(), id: bad, _deleted: false, ...(coll === 'members' ? { uid: null } : {}) });
  }
  // Riferimenti avvelenati su record con id valido.
  const rif = { expenses: ['fornitoreId', 'ricGruppoId', 'tabellaMillesimi'], payments: ['condominoId'],
    works: ['delibereRifId'], resolutions: ['verbaleRifId'] };
  for (const [coll, campi] of Object.entries(rif)) {
    const d = (await b1.collection(coll).get()).docs.find((x) => x.id !== bad);
    if (d) await d.ref.update(Object.fromEntries(campi.map((k) => [k, bad])));
  }
  // Ripartizione con un id avvelenato e vecchi allegati incorporati con un
  // indirizzo javascript: (un PDF e un'immagine).
  const sp = (await b1.collection('expenses').get()).docs.find((x) => x.id !== bad);
  await sp.ref.update({
    split: [...(sp.data().split || []), { id: bad, perc: 1 }],
    allegati: [
      { id: 901, nome: 'vecchio.pdf', mime: 'application/pdf', size: 10, data64: 'javascript:window.__xss=(window.__xss||0)+1' },
      { id: 902, nome: 'vecchia.jpg', mime: 'image/jpeg', size: 10, data64: 'javascript:window.__xss=(window.__xss||0)+1' },
    ],
  });
  // Millesimi con testo al posto dei numeri, per ogni appartamento (stessa
  // chiave di chiaveApt in js/sezioni/millesimi.js).
  const chiave = (a) => String(a || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const valori = {};
  (await b1.collection('members').get()).docs.forEach((d) => { if (d.data().appartamento) valori[chiave(d.data().appartamento)] = PAYLOAD; });
  await b1.collection('impostazioni').doc('millesimi').set({
    attivo: true, dal: '2026-01-01', categorie: {},
    tabelle: [{ id: 'generale', nome: 'Generale', valori }],
    aggiornatoDa: 'seed', aggiornatoIl: new Date(),
  });
}
module.exports = { seedXss, PAYLOAD, PROJECT };
if (require.main === module) seedXss().then(() => { console.log('Seed XSS completato'); process.exit(0); }, (e) => { console.error(e); process.exit(1); });
