// Banco di misura delle prestazioni: dati sintetici a volume crescente.
// Parte dal seed dei test (qa/seed.js: utenti, 2 edifici, migrazione e
// separazione contatti) e aggiunge all'edificio 1 record realistici in
// proporzione al fattore BENCH_VOLUME (V):
//   condomini attivi ~6*V (max 300, con contatti email/telefono), spese ~200*V
//   su 5 anni, entrate ~300*V, fornitori ~10*V, avvisi/verbali/lavori/delibere ~10*V.
// I documenti hanno lo stesso formato della migrazione (_createdBy 'backfill'):
// la Cloud Function auditTrail li ignora. Durante le scritture i trigger degli
// emulatori sono sospesi (Emulator Hub), così non restano code di funzioni a
// falsare le misure. Solo emulatori locali (progetto demo-qa).
// Uso: BENCH_VOLUME=10 node qa/bench/seed-volume.js   (emulatori avviati)
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
const fs = require('fs');
const path = require('path');
const { seed } = require('../seed');
const { FieldValue, Timestamp } = require('../../scripts/lib/firebase-admin');
const req = require('module').createRequire(path.join(__dirname, '..', '..', 'functions', 'package.json'));
const { getApps } = req('firebase-admin/app');
const { getFirestore } = req('firebase-admin/firestore');

const V = Math.max(1, Number(process.env.BENCH_VOLUME || 1));
const HUB = process.env.FIREBASE_EMULATOR_HUB || '127.0.0.1:4400';
const B = '1';
const Y = new Date().getFullYear();

// Generatore pseudo-casuale con seme fisso: stessi dati a ogni esecuzione.
let s0 = 20261020 + V;
const rnd = () => { s0 = (s0 * 1103515245 + 12345) % 2147483648; return s0 / 2147483648; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pad = (n) => String(n).padStart(2, '0');
const dataIn = (anno) => `${anno}-${pad(int(1, 12))}-${pad(int(1, 28))}`;

const NOMI = ['Mario', 'Lucia', 'Giorgio', 'Anna', 'Paolo', 'Stefania', 'Luca', 'Giulia', 'Marco', 'Sara', 'Andrea', 'Chiara', 'Franco', 'Elena', 'Roberto', 'Silvia'];
const COGNOMI = ['Rossi', 'Bianchi', 'Ferrari', 'Conti', 'Esposito', 'Mancini', 'Romano', 'Colombo', 'Ricci', 'Marino', 'Greco', 'Bruno', 'Gallo', 'Costa', 'Fontana', 'Moretti'];
const COLORI = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4'];
const CAT_SPESA = [
  ['pulizie', 'ordinaria', 'Pulizie scale', 300, 1500], ['luce_comuni', 'ordinaria', 'Bolletta luce parti comuni', 80, 600],
  ['acqua', 'ordinaria', 'Bolletta acqua', 100, 900], ['ascensore', 'ordinaria', 'Manutenzione ascensore', 200, 1200],
  ['giardinaggio', 'ordinaria', 'Taglio siepi e prato', 150, 800], ['assicurazione', 'ordinaria', 'Polizza fabbricato', 800, 2500],
  ['amministrazione', 'ordinaria', 'Compenso amministrazione', 300, 1800], ['riparazioni', 'ordinaria', 'Riparazione cancello', 100, 1500],
  ['riscaldamento', 'ordinaria', 'Gas riscaldamento', 500, 4000], ['ristrutturazione', 'straordinaria', 'Ristrutturazione androne', 2000, 15000],
  ['impianti', 'straordinaria', 'Nuovo impianto citofonico', 1500, 8000], ['facciate', 'straordinaria', 'Rifacimento facciata', 10000, 40000],
  ['tetto', 'straordinaria', 'Rifacimento tetto', 8000, 30000], ['altro', 'ordinaria', 'Spese varie', 50, 500],
];
const CAT_FORN = ['pulizie', 'manutenzione', 'impianti', 'altro'];

const meta = (createdMs) => ({
  _createdAt: Timestamp.fromMillis(createdMs), _createdBy: 'backfill',
  _updatedAt: FieldValue.serverTimestamp(), _updatedBy: 'backfill', _deleted: false,
});

async function hub(azione) {
  const r = await fetch(`http://${HUB}/functions/${azione}BackgroundTriggers`, { method: 'PUT' });
  if (!r.ok) throw new Error(`Emulator Hub ${azione}: ${r.status}`);
}

async function scrivi(db, docs) {
  for (let i = 0; i < docs.length; i += 400) {
    const batch = db.batch();
    docs.slice(i, i + 400).forEach(([p, d]) => batch.set(db.doc(p), d));
    await batch.commit();
  }
}

async function seedVolume() {
  const t0 = Date.now();
  await seed();
  const db = getFirestore(getApps()[0]);
  const base = Date.UTC(Y - 5, 0, 1);
  const docs = [];
  const conta = {};
  const add = (coll, rec) => { conta[coll] = (conta[coll] || 0) + 1; docs.push([`buildings/${B}/${coll}/${rec.id}`, { ...rec, edificioId: 1, ...meta(base + docs.length * 1000) }]); };

  // Condomini (attivi) + contatti separati, come dopo la migrazione dei contatti.
  const nCond = Math.min(300, 6 * V);
  const condIds = [101, 102, 103];
  for (let i = 0; i < nCond; i++) {
    const id = 10000 + i;
    condIds.push(id);
    const nome = `${pick(NOMI)} ${pick(COGNOMI)}`;
    add('members', { id, nome, appartamento: `Int. ${10 + i}`, canEdit: false, isAdmin: false, superAdmin: false, color: pick(COLORI),
      dataIngresso: `${Y - int(1, 8)}-01-01` });
    add('contatti', { id, email: `cond${i}@bench.test`, emailLower: `cond${i}@bench.test`, telefono: `333${String(1000000 + i)}` });
  }

  // Fornitori.
  const fornIds = [5001];
  for (let i = 0; i < 10 * V; i++) {
    const id = 50000 + i;
    fornIds.push(id);
    add('suppliers', { id, nome: `Fornitore ${pick(COGNOMI)} ${i}`, categoria: pick(CAT_FORN), email: `forn${i}@bench.test`,
      telefono: `0541${String(100000 + i)}`, note: '' });
  }

  // Spese su 5 anni (Y-4 … Y): consuntivate negli anni chiusi, metà dell'anno
  // corrente solo a preventivo; ~20% con ripartizione su alcuni condomini.
  for (let i = 0; i < 200 * V; i++) {
    const id = 200000 + i;
    const [categoria, tipoSpesa, titolo, min, max] = pick(CAT_SPESA);
    const anno = Y - int(0, 4);
    const prev = int(min, max);
    const chiusa = anno < Y || rnd() < 0.5;
    const rec = { id, titolo: `${titolo} ${i}`, categoria, tipoSpesa, preventivo: String(prev),
      consuntivo: chiusa ? String(Math.round(prev * (0.85 + rnd() * 0.3))) : '', data: dataIn(anno),
      descrizione: rnd() < 0.3 ? 'Fattura n. ' + int(1, 999) : '', allegati: [], split: [] };
    if (rnd() < 0.5) rec.fornitoreId = pick(fornIds);
    if (rnd() < 0.2) {
      const n = int(2, Math.min(6, condIds.length));
      const scelti = [...new Set(Array.from({ length: n }, () => pick(condIds)))];
      const quota = Math.floor(100 / scelti.length);
      rec.split = scelti.map((c, k) => ({ id: c, perc: k === 0 ? 100 - quota * (scelti.length - 1) : quota }));
    }
    add('expenses', rec);
  }

  // Entrate legate ai condomini: versamenti negli anni passati, alcune rate previste.
  for (let i = 0; i < 300 * V; i++) {
    const id = 300000 + i;
    const anno = Y - int(0, 4);
    const previsionale = anno === Y && rnd() < 0.4;
    add('payments', { id, condominoId: pick(condIds), importo: String(int(5, 60) * 10), data: dataIn(anno),
      descrizione: previsionale ? 'Rata prevista' : `Quota ${anno}`, categoria: 'quote', previsionale });
  }

  // Vita condominiale.
  for (let i = 0; i < 10 * V; i++) {
    const anno = Y - int(0, 4);
    add('notices', { id: 70000 + i, titolo: `Avviso ${i}: ${pick(['chiusura acqua', 'pulizia garage', 'assemblea', 'lavori ascensore'])}`,
      testo: 'Si avvisano i condomini che i lavori si svolgeranno in mattinata.', data: dataIn(anno), prioritaria: rnd() < 0.2 });
    add('minutes', { id: 80000 + i, titolo: `Assemblea ${i}`, data: dataIn(anno), tipo: pick(['ordinaria', 'straordinaria']),
      argomenti: ['bilancio', 'pulizie'], decisioni: ['Approvato il bilancio'] });
    add('works', { id: 90000 + i, titolo: `Lavori ${i}: ${pick(['facciata', 'tetto', 'citofoni', 'cancello'])}`,
      stato: pick(['da_avviare', 'in_corso', 'completato', 'sospeso']), percentuale: int(0, 100) });
    add('resolutions', { id: 95000 + i, descrizioneSintetica: `Delibera ${i}`, dataApprovazione: dataIn(anno), stato: 'approvata',
      budgetPrevisto: String(int(1, 50) * 1000), responsabile: 'Amministratore', note: '' });
  }

  await hub('disable');
  try { await scrivi(db, docs); } finally { await hub('enable'); }

  // Conteggi effettivi dell'edificio 1 (record non cancellati), per il rapporto.
  const totali = {};
  for (const c of ['members', 'contatti', 'expenses', 'payments', 'suppliers', 'notices', 'minutes', 'works', 'resolutions']) {
    totali[c] = (await db.collection(`buildings/${B}/${c}`).count().get()).data().count;
  }
  const out = path.join(__dirname, '..', 'out', 'bench');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, `seed-V${V}.json`), JSON.stringify({ volume: V, aggiunti: conta, totaliEdificio1: totali, secondi: (Date.now() - t0) / 1000 }, null, 2));
  console.log(`Seed volume V=${V}: aggiunti`, conta, 'totali edificio 1', totali, `in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

if (require.main === module) seedVolume().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
module.exports = { seedVolume };
