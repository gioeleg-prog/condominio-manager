// Variante del seed per le prove su più anni (anno scorso, anno corrente,
// anno prossimo con il preventivo): consuntivi chiusi, preventivi mai
// consuntivati, versamenti previsionali mai validati, spesa ricorrente che
// attraversa il capodanno, record il 31/12 e il 1/1. Importi tondi, così i
// totali attesi si calcolano a mano (vedi ATTESI in fondo).
// Uso: node qa/seed-multianno.js  (emulatori avviati)
const path = require('path');
const { seed } = require('./seed');
const { backfill } = require('../scripts/lib/buildings-migration');
const req = require('module').createRequire(path.join(__dirname, '..', 'functions', 'package.json'));
const { getApps } = req('firebase-admin/app');
const { getFirestore } = req('firebase-admin/firestore');

const Y = new Date().getFullYear();
const P = Y - 1, N = Y + 1; // anno precedente, anno prossimo
const S = (id, titolo, categoria, data, preventivo, consuntivo, extra = {}) => ({
  id, titolo, categoria, tipoSpesa: 'ordinaria', preventivo: String(preventivo), consuntivo: consuntivo === '' ? '' : String(consuntivo),
  data, edificioId: 1, allegati: [], split: [], ...extra,
});
const E = (id, condominoId, importo, data, previsionale = false) => ({
  id, condominoId, importo: String(importo), data, descrizione: previsionale ? 'Rata prevista' : 'Quota', categoria: 'quote', edificioId: 1, previsionale,
});

const speseExtra = [
  // Anno precedente: tutto consuntivato tranne un preventivo dimenticato.
  S(11001, 'Pulizie anno prec.', 'pulizie', `${P}-03-31`, 1200, 1200),
  S(11002, 'Ascensore anno prec.', 'ascensore', `${P}-06-30`, 800, 800),
  S(11003, 'Assicurazione 31/12', 'assicurazione', `${P}-12-31`, 1000, 1000),
  S(11004, 'Cancello mai consuntivato', 'riparazioni', `${P}-09-15`, 500, ''),
  // Anno corrente: spesa del 1° gennaio (confine d'anno).
  S(12001, 'Luce 1/1', 'luce_comuni', `${Y}-01-01`, 400, 400),
  // Anno prossimo (preventivo).
  S(13001, 'Assicurazione prossimo anno', 'assicurazione', `${N}-03-31`, 1100, ''),
  S(13002, 'Ascensore prossimo anno', 'ascensore', `${N}-06-30`, 950, ''),
];
// Spesa ricorrente mensile da novembre dell'anno corrente a giugno del prossimo (8 occorrenze).
const mesi = [[Y, 11], [Y, 12], [N, 1], [N, 2], [N, 3], [N, 4], [N, 5], [N, 6]];
mesi.forEach(([a, m], i) => speseExtra.push(S(14001 + i, 'Pulizie mensili', 'pulizie', `${a}-${String(m).padStart(2, '0')}-01`, 150, '',
  { ricorrente: true, frequenza: 'mensile', ricorrenzaFine: `${N}-06-30`, ricGruppoId: 990001 })));

const entrateExtra = [
  E(31001, 101, 1000, `${P}-01-01`), E(31002, 102, 1000, `${P}-02-15`), E(31003, 103, 1000, `${P}-03-15`), E(31004, 104, 600, `${P}-07-01`),
  E(31005, 105, 400, `${P}-11-30`, true), // previsionale mai validato
  ...[101, 102, 103, 104, 105].map((c, i) => E(33001 + i, c, 300, `${N}-01-15`, true)),
];

async function seedMultianno() {
  await seed({ legacyOnly: true });
  const db = getFirestore(getApps()[0]);
  for (const [k, extra] of [['cm_spese', speseExtra], ['cm_entrate', entrateExtra]]) {
    const ref = db.collection('appdata').doc(k);
    const arr = JSON.parse((await ref.get()).data().value);
    await ref.set({ value: JSON.stringify([...arr, ...extra]) });
  }
  await backfill(db);
}

// Totali attesi per l'edificio 1 (solo dati reali, come il saldo di cassa).
const ATTESI = {
  [`usciteReali${P}`]: 3000, [`entrateReali${P}`]: 3600, [`riporto${Y}`]: 600,
  [`usciteReali${Y}`]: 1600, // 1200 pulizie + 400 luce (l'ascensore di novembre è solo preventivo)
  [`entrateReali${Y}`]: 500,
  [`riporto${N}`]: 600 + 500 - 1600, // -500
};
if (require.main === module) {
  seedMultianno().then(() => { console.log('Seed multi-anno completato. Attesi:', ATTESI); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
module.exports = { seedMultianno, ATTESI };
