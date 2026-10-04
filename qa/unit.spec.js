// Test unitari della logica di business di index.html (nessun browser).
// Eseguire con: npx mocha qa/unit.spec.js   (TZ=Europe/Rome impostato sotto)
process.env.TZ = 'Europe/Rome';
const assert = require('assert');
const { loadApp } = require('./load-app');

describe('UNIT — utilità di formato e sicurezza', () => {
  const app = loadApp();
  it('esc() neutralizza i caratteri HTML e conserva lo zero', () => {
    assert.strictEqual(app.esc('<img src=x onerror="a">&'), '&lt;img src=x onerror=&quot;a&quot;&gt;&amp;');
    assert.strictEqual(app.esc(0), '0');
    assert.strictEqual(app.esc(null), '');
    assert.strictEqual(app.esc(false), '');
  });
  it("esc() NON neutralizza l'apice singolo (attributi tra apici singoli restano esposti)", () => {
    assert.strictEqual(app.esc("a'b"), "a'b");
  });
  it('fmt() formatta in euro con due decimali e gestisce valori non numerici', () => {
    assert.match(app.fmt(1234.5), /^€ 1\.?234,50$/);
    assert.strictEqual(app.fmt(undefined), '€ 0,00');
    assert.strictEqual(app.fmt('abc'), '€ NaN');
  });
  it('validatePassword() richiede 8 caratteri, una maiuscola e un numero', () => {
    assert.strictEqual(app.validatePassword('Abcdefg1').length, 0);
    assert.strictEqual(app.validatePassword('abc').length, 3);
  });
});

describe('UNIT — generazione identificativi (newId)', () => {
  const app = loadApp();
  it('100 id generati nello stesso istante sono tutti distinti', () => {
    const ids = Array.from({ length: 100 }, () => app.newId());
    assert.strictEqual(new Set(ids).size, ids.length, `collisioni: ${ids.length - new Set(ids).size}`);
  });
});

describe('UNIT — spese ricorrenti (generaOccorrenze)', () => {
  const app = loadApp();
  const base = (data, frequenza) => ({ id: 1, titolo: 'Pulizie', data, frequenza, preventivo: '100', consuntivo: '100', edificioId: 1 });

  it('mensile dal 15/01 al 31/12: 11 occorrenze, sempre il giorno 15', () => {
    const occ = app.generaOccorrenze(base('2027-01-15', 'mensile'), '2027-12-31');
    assert.strictEqual(occ.length, 11);
    const giorni = occ.map((o) => o.data.slice(8));
    assert.deepStrictEqual([...new Set(giorni)], ['15'], `date: ${occ.map((o) => o.data).join(', ')}`);
  });
  it('mensile dal 31/01: nessuna data salta il mese (fine mese)', () => {
    const occ = app.generaOccorrenze(base('2027-01-31', 'mensile'), '2027-06-30');
    const mesi = occ.map((o) => o.data.slice(0, 7));
    assert.strictEqual(mesi.join(','), '2027-02,2027-03,2027-04,2027-05,2027-06', `date: ${occ.map((o) => o.data).join(', ')}`);
  });
  it('le occorrenze future hanno consuntivo vuoto (solo preventivo)', () => {
    const occ = app.generaOccorrenze(base('2027-01-15', 'trimestrale'), '2027-12-31');
    assert.ok(occ.every((o) => o.consuntivo === '' && o.preventivo === '100'));
  });
  it('settimanale per un anno: id tutti distinti', () => {
    const occ = app.generaOccorrenze(base('2027-01-04', 'settimanale'), '2027-12-31');
    const ids = occ.map((o) => o.id);
    assert.strictEqual(new Set(ids).size, ids.length, `${ids.length - new Set(ids).size} id duplicati su ${ids.length}`);
  });
  it('mensile su 5 anni: non viene troncata in silenzio', () => {
    const occ = app.generaOccorrenze(base('2027-01-15', 'mensile'), '2031-12-31');
    assert.strictEqual(occ.length, 59);
  });
  it('senza data di fine non genera nulla', () => {
    assert.strictEqual(app.generaOccorrenze(base('2027-01-15', 'mensile'), '').length, 0);
  });
});

describe('UNIT — export CSV spese', () => {
  function exportCsv(spese, condomini) {
    const app = loadApp();
    app.__set('state', { ...app.__get('state'), edificioAttivo: 1, condomini, fornitori: [], spese });
    app.esportaSpeseCSV(spese, 't.csv');
    return app.__downloads.find((d) => d.blob).blob.text;
  }
  const cond = [
    { id: 11, nome: 'Rossi', edificioId: 1 }, { id: 12, nome: 'Bianchi', edificioId: 1 },
    { id: 21, nome: 'Verdi', edificioId: 2 },
  ];
  it('quote a parti uguali tra i soli condomini dell\'edificio della spesa', () => {
    const csv = exportCsv([{ id: 1, data: '2027-02-01', titolo: 'Luce', categoria: 'luce_comuni', consuntivo: '100', edificioId: 1 }], cond);
    const riga = csv.split('\r\n')[1].split(';');
    assert.deepStrictEqual(riga.slice(-2), ['50,00', '50,00']);
    assert.ok(!csv.includes('Verdi'), 'un condomino di un altro edificio compare nel CSV');
  });
  it('campi con ; e virgolette sono quotati correttamente', () => {
    const csv = exportCsv([{ id: 1, data: '2027-02-01', titolo: 'A;B "C"', categoria: 'altro', consuntivo: '10', edificioId: 1 }], cond);
    assert.ok(csv.includes('"A;B ""C"""'));
  });
  it('CSV/formula injection: un titolo che inizia con = viene neutralizzato', () => {
    const csv = exportCsv([{ id: 1, data: '2027-02-01', titolo: '=HYPERLINK("http://x","clic")', categoria: 'altro', consuntivo: '10', edificioId: 1 }], cond);
    const titolo = csv.split('\r\n')[1].split(';')[1];
    assert.ok(!/^"?=/.test(titolo), `il campo esportato inizia con "=": ${titolo}`);
  });
});

describe('UNIT — normalizzazione dei record salvati (normalizeRecords)', () => {
  const app = loadApp();
  it('riporta alla forma attesa campi elenco e testo di tipo sbagliato', () => {
    const [v] = app.normalizeRecords([{ id: 1, titolo: 42, argomenti: 'bilancio, facciata', decisioni: [1, 'ok', { x: 1 }], allegati: 'x' }]);
    assert.strictEqual(v.titolo, '42');
    assert.strictEqual(v.argomenti.join('|'), 'bilancio|facciata');
    assert.strictEqual(v.decisioni.join('|'), '1|ok');
    assert.strictEqual(v.allegati.length, 0);
  });
  it('scarta elementi che non sono record e lascia invariati quelli corretti', () => {
    const ok = { id: 2, titolo: 'A', argomenti: ['x'] };
    const out = app.normalizeRecords([null, 'x', ok]);
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0], ok);
  });
});

describe('UNIT — saldo e riporto (getSaldoRiporto)', () => {
  it('somma solo i movimenti consuntivati degli anni precedenti dell\'edificio attivo', () => {
    const app = loadApp();
    app.__set('state', { ...app.__get('state'), edificioAttivo: 1, condomini: [],
      spese: [
        { data: '2025-03-01', consuntivo: '300', edificioId: 1 },
        { data: '2025-04-01', preventivo: '999', consuntivo: '', edificioId: 1 },
        { data: '2025-04-01', consuntivo: '500', edificioId: 2 },
        { data: '2026-01-10', consuntivo: '50', edificioId: 1 },
      ],
      entrate: [
        { data: '2025-01-10', importo: '1000', edificioId: 1 },
        { data: '2025-06-10', importo: '400', edificioId: 1, previsionale: true },
      ] });
    assert.strictEqual(app.getSaldoRiporto(2026), 700);
  });
});
