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

describe('UNIT — segnalazione errori (reportClientError)', () => {
  it('non lancia mai eccezioni, anche senza Firebase o senza utente', () => {
    const app = loadApp();
    assert.doesNotThrow(() => app.reportClientError('x'));
    app.__set('state', { ...app.__get('state'), user: { id: 1, nome: 'A' } });
    app._fb = { auth: { currentUser: { uid: 'u' } }, setDoc: () => { throw new Error('rete'); } };
    assert.doesNotThrow(() => app.reportClientError('y'));
  });
  it('invia al massimo 5 segnalazioni e mai due volte la stessa', () => {
    const app = loadApp();
    app.__set('state', { ...app.__get('state'), user: { id: 1, nome: 'A', edificioId: 1 } });
    const inviate = [];
    app._fb = { auth: { currentUser: { uid: 'u' } }, db: {}, serverTimestamp: () => 'TS', collection: () => ({}), doc: () => ({}),
      setDoc: (_ref, p) => { inviate.push(p.message); return Promise.resolve(); } };
    ['a', 'a', 'b', 'c', 'd', 'e', 'f', 'g'].forEach((m) => app.reportClientError(m));
    assert.strictEqual(inviate.join(','), 'a,b,c,d,e');
  });
});

describe('UNIT — graffetta allegati accanto al titolo (renderAllegatiClip)', () => {
  const app = loadApp();
  const all = (n, nome = 'f.pdf') => Array.from({ length: n }, (_, i) => ({ id: i + 1, nome, mime: 'application/pdf' }));
  it('niente graffetta se la spesa non ha allegati', () => {
    assert.strictEqual(app.renderAllegatiClip({ allegati: [] }), '');
    assert.strictEqual(app.renderAllegatiClip({}), '');
  });
  it('una graffetta per allegato, al massimo 3, poi "+N"', () => {
    assert.strictEqual((app.renderAllegatiClip({ allegati: all(2) }).match(/class="attach-clip"/g) || []).length, 2);
    const h = app.renderAllegatiClip({ allegati: all(5) });
    assert.strictEqual((h.match(/class="attach-clip"/g) || []).length, 3);
    assert.ok(h.includes('+2'));
  });
  it('usa lo stesso data-view-allegato della colonna e fa l\'escape del nome del file', () => {
    const h = app.renderAllegatiClip({ allegati: [{ id: 7, nome: '"><img src=x onerror=alert(1)>\'.pdf' }] });
    assert.ok(h.includes(`data-view-allegato='{"id":7}'`));
    assert.ok(!h.includes('<img'), 'nome del file non escapato');
  });
});

describe('UNIT — guida rapida delle pagine', () => {
  const app = loadApp();
  const GUIDA = app.__get('GUIDA');
  const user = (r) => ({ lettura: { nome: 'L' }, mod: { nome: 'M', canEdit: true }, admin: { nome: 'A', isAdmin: true }, super: { nome: 'S', superAdmin: true } }[r]);
  const guida = (page, ruolo) => { app.__set('state', { ...app.__get('state'), page, user: user(ruolo) }); return app.renderGuida(); };

  it('ogni pagina del menu ha la sua guida', () => {
    for (const p of ['dashboard', 'spese', 'entrate', 'bilancio', 'confronto', 'ricerca', 'fornitori', 'vita', 'condomini', 'impostazioni']) {
      assert.ok(GUIDA[p] && GUIDA[p].titolo && GUIDA[p].breve, 'manca la guida di ' + p);
    }
  });
  it('ogni voce ha un livello riconosciuto e un testo', () => {
    const livelli = ['lettura', 'noadmin', 'mod', 'admin', 'super'];
    for (const [p, g] of Object.entries(GUIDA)) {
      for (const v of [...g.trovi, ...g.sapere]) {
        if (Array.isArray(v)) assert.ok(v.length === 2 && livelli.includes(v[0]), `${p}: voce con livello errato ${JSON.stringify(v)}`);
      }
      for (const v of g.fare) {
        assert.ok(Array.isArray(v) && (v.length === 2 || (v.length === 3 && livelli.includes(v[0]))), `${p}: passo errato ${JSON.stringify(v)}`);
      }
    }
  });
  it('chi è in sola lettura non vede le istruzioni per modificare, e viceversa', () => {
    const l = guida('spese', 'lettura'), m = guida('spese', 'mod');
    assert.ok(!l.includes('Aggiungere una spesa') && l.includes('Chiedere una modifica'));
    assert.ok(m.includes('Aggiungere una spesa') && !m.includes('Chiedere una modifica'));
  });
  it('le voci da super admin restano nascoste agli altri ruoli', () => {
    assert.ok(!guida('impostazioni', 'admin').includes('Zona pericolosa'));
    assert.ok(guida('impostazioni', 'super').includes('Zona pericolosa'));
    assert.ok(guida('vita', 'mod').includes('rivolgiti') && !guida('vita', 'admin').includes('Proporre un avviso'));
  });
});

describe('UNIT — più anni (anno passato, corrente, prossimo)', () => {
  const Y = new Date().getFullYear();
  const base = (extra) => {
    const app = loadApp();
    app.__set('state', { ...app.__get('state'), edificioAttivo: 1, edifici: [{ id: 1, nome: 'E' }], filterAnno: Y,
      user: { id: 101, nome: 'A', isAdmin: true, canEdit: true, edificioId: 1 },
      condomini: [{ id: 101, nome: 'A', edificioId: 1 }, { id: 102, nome: 'B', edificioId: 1 }], spese: [], entrate: [], ...extra });
    return app;
  };

  it('annoDi legge l\'anno dal testo della data (niente fuso orario) e scarta le date non valide', () => {
    const app = loadApp();
    assert.strictEqual(app.annoDi('2027-01-01'), 2027);
    assert.strictEqual(app.annoDi('2026-12-31'), 2026);
    assert.ok(Number.isNaN(app.annoDi('')));
    assert.ok(Number.isNaN(app.annoDi(undefined)));
    assert.ok(Number.isNaN(app.annoDi('abc')));
  });
  it('getAnni offre sempre l\'anno prossimo e l\'anno scelto, senza buchi né "NaN"', () => {
    const app = base({ spese: [{ data: `${Y - 2}-05-01`, edificioId: 1 }, { data: 'non-valida', edificioId: 1 }], filterAnno: Y + 3 });
    const anni = app.getAnni();
    assert.ok(!anni.some(Number.isNaN), 'opzione NaN');
    for (let a = Y - 2; a <= Y + 3; a++) assert.ok(anni.includes(a), 'manca ' + a);
    assert.strictEqual(JSON.stringify(anni), JSON.stringify([...anni].sort((a, b) => b - a)));
  });
  it('saldo stimato a inizio anno prossimo: cassa di oggi − spese aperte + versamenti previsti dell\'anno corrente', () => {
    const app = base({
      spese: [
        { data: `${Y}-02-01`, consuntivo: '1000', edificioId: 1 },
        { data: `${Y}-12-01`, preventivo: '400', consuntivo: '', edificioId: 1 },   // ancora da pagare
        { data: `${Y - 1}-06-01`, preventivo: '999', consuntivo: '', edificioId: 1 }, // anno chiuso: non più atteso
        { data: `${Y + 1}-03-01`, preventivo: '700', consuntivo: '', edificioId: 1 }, // dell'anno stimato: escluso
      ],
      entrate: [
        { data: `${Y}-01-10`, importo: '5000', edificioId: 1 },
        { data: `${Y}-12-10`, importo: '300', edificioId: 1, previsionale: true },
      ] });
    const s = app.getSaldoStimatoInizioAnno(Y + 1);
    assert.strictEqual(s.reale, 4000);
    assert.strictEqual(s.speseAperte, 400);
    assert.strictEqual(s.entratePreviste, 300);
    assert.strictEqual(s.stimato, 3900);
    // anno corrente o passato: coincide con il riporto reale
    assert.strictEqual(app.getSaldoStimatoInizioAnno(Y).stimato, app.getSaldoRiporto(Y));
  });
  it('ricorrenza con solo consuntivo: le occorrenze successive hanno quell\'importo come preventivo', () => {
    const app = loadApp();
    const occ = app.generaOccorrenze({ data: `${Y}-11-30`, preventivo: '', consuntivo: '100', frequenza: 'mensile' }, `${Y + 1}-02-28`);
    assert.ok(occ.length >= 3);
    for (const o of occ) { assert.strictEqual(o.preventivo, '100'); assert.strictEqual(o.consuntivo, ''); }
    assert.ok(occ.some((o) => o.data.startsWith(String(Y + 1))), 'deve attraversare il capodanno');
  });
  it('Bilancio con "Tutti gli anni" mostra l\'anno corrente, non una pagina a zero con "· 0"', () => {
    const app = base({ filterAnno: 0, page: 'bilancio', spese: [{ id: 1, data: `${Y}-02-01`, consuntivo: '250', preventivo: '250', edificioId: 1, split: [] }] });
    const h = app.renderBilancio();
    assert.ok(!h.includes('· 0<'), 'etichetta anno 0');
    assert.ok(h.includes(`· ${Y}`));
    assert.ok(h.includes('250,00'));
  });
  it('anno prossimo: nessun mese "passato" e nessun falso allarme "già questo mese"', () => {
    const app = base({ filterAnno: Y + 1, page: 'bilancio', bilancioTab: 'forecast',
      spese: Array.from({ length: 12 }, (_, m) => ({ id: m + 1, data: `${Y + 1}-${String(m + 1).padStart(2, '0')}-15`, preventivo: '1000', consuntivo: '', edificioId: 1, split: [] })),
      entrate: [{ data: `${Y}-01-10`, importo: '5000', edificioId: 1 }] });
    const h = app.renderBilancio();
    assert.ok(!h.includes('già questo mese'));
    assert.ok(!/runway-dot (positive|warning|negative)/.test(h), 'mesi dell\'anno prossimo trattati come passati');
    const d = app.renderDashboard();
    assert.ok(!d.includes('già questo mese'));
    assert.ok(d.includes(`mesi del ${Y + 1}`) && d.includes('stimato a inizio'), 'la Dashboard deve parlare del saldo stimato a inizio anno');
  });
  it('Dashboard con "Tutti gli anni": riporto e saldo dell\'anno corrente (prima riporto azzerato)', () => {
    const app = base({ filterAnno: 0, page: 'dashboard',
      spese: [{ id: 1, data: `${Y - 1}-03-01`, consuntivo: '1000', edificioId: 1 }, { id: 2, data: `${Y}-03-01`, consuntivo: '200', edificioId: 1 }],
      entrate: [{ data: `${Y - 1}-01-10`, importo: '3000', edificioId: 1 }] });
    const d = app.renderDashboard();
    assert.ok(d.includes('2000,00'), 'riporto dell\'anno precedente mancante'); // 3000 − 1000
    assert.ok(d.includes('1800,00'), 'saldo di cassa errato');               // 2000 − 200
  });
  it('"La tua situazione" non conta come versate le rate solo previste', () => {
    const app = base({ page: 'dashboard', user: { id: 103, nome: 'M', edificioId: 1 }, condomini: [{ id: 103, nome: 'M', edificioId: 1 }],
      entrate: [{ data: `${Y}-12-10`, importo: '400', edificioId: 1, condominoId: 103, previsionale: true }] });
    const d = app.renderDashboard();
    const i = d.indexOf('La tua situazione');
    assert.ok(i > 0);
    assert.ok(!d.slice(i, i + 1500).includes('400,00'), 'rata prevista contata come versata');
  });
});

describe('UNIT — filtro anni multiplo e Confronto anni', () => {
  const Y = new Date().getFullYear();
  const base = (extra) => {
    const app = loadApp();
    app.__set('state', { ...app.__get('state'), edificioAttivo: 1, edifici: [{ id: 1, nome: 'E' }],
      user: { id: 101, nome: 'A', isAdmin: true, canEdit: true, edificioId: 1 },
      condomini: [{ id: 101, nome: 'A', edificioId: 1 }, { id: 102, nome: 'B', edificioId: 1 }], spese: [], entrate: [], ...extra });
    return app;
  };
  it('normalizza, filtra ed etichetta gli anni scelti', () => {
    const app = base({ filterAnni: ['2026', 2025, 2026, 'x'] });
    assert.strictEqual(JSON.stringify(app.anniSelezionati()), '[2025,2026]');
    assert.ok(app.inAnniSelezionati('2025-12-31') && app.inAnniSelezionati('2026-01-01'));
    assert.ok(!app.inAnniSelezionati('2027-01-01'));
    assert.strictEqual(app.etichettaAnni(), '2025 + 2026');
    assert.strictEqual(app.etichettaAnni([]), 'tutti gli anni');
    app.__set('state', { ...app.__get('state'), filterAnni: [] });
    assert.ok(app.inAnniSelezionati('1999-05-05'), '"Tutti" deve includere ogni anno');
  });
  it('Spese con due anni accesi: lista e totali sommano entrambi gli anni', () => {
    const app = base({ page: 'spese', filterAnni: [Y - 1, Y], spese: [
      { id: 1, titolo: 'Vecchia', data: `${Y - 1}-05-01`, consuntivo: '100', preventivo: '100', categoria: 'pulizie', edificioId: 1, split: [] },
      { id: 2, titolo: 'Nuova', data: `${Y}-05-01`, consuntivo: '50', preventivo: '50', categoria: 'pulizie', edificioId: 1, split: [] },
      { id: 3, titolo: 'Futura', data: `${Y + 1}-05-01`, preventivo: '999', categoria: 'pulizie', edificioId: 1, split: [] } ] });
    const h = app.renderSpese();
    assert.ok(h.includes('Vecchia') && h.includes('Nuova') && !h.includes('Futura'));
    assert.ok(h.includes('150,00'), 'totale consuntivo dei due anni');
  });
  it('anno intero e "da inizio anno a oggi": entrate, uscite, risultato, cassa, scostamento', () => {
    const oggi = new Date();
    const mmgg = String(oggi.getMonth() + 1).padStart(2, '0') + '-' + String(oggi.getDate()).padStart(2, '0');
    const dopo = mmgg === '12-31' ? null : '12-31'; // una data sicuramente dopo oggi nell'anno
    const app = base({
      spese: [
        { data: `${Y - 1}-01-01`, consuntivo: '300', preventivo: '250', tipoSpesa: 'ordinaria', categoria: 'pulizie', edificioId: 1 },
        { data: `${Y - 1}-12-31`, consuntivo: '200', preventivo: '', tipoSpesa: 'straordinaria', categoria: 'tetto', edificioId: 1 },
        { data: `${Y - 1}-06-01`, consuntivo: '', preventivo: '80', tipoSpesa: 'ordinaria', categoria: 'pulizie', edificioId: 1 },
      ],
      entrate: [
        { data: `${Y - 1}-01-02`, importo: '1000', edificioId: 1 },
        { data: `${Y - 1}-11-30`, importo: '40', edificioId: 1, previsionale: true },
      ] });
    const d = app.datiAnnoConfronto(Y - 1, 'anno');
    assert.strictEqual(d.entrateReali, 1000);
    assert.strictEqual(d.usciteCons, 500);
    assert.strictEqual(d.usciteConsOrd, 300);
    assert.strictEqual(d.usciteConsStr, 200);
    assert.strictEqual(d.risultato, 500);
    assert.strictEqual(d.cassaFine, 500);
    assert.strictEqual(d.preventivo, 330);
    assert.strictEqual(d.daConsuntivare, 80);
    assert.strictEqual(d.scostamento, 50); // solo la spesa chiusa con preventivo: 300 − 250
    assert.strictEqual(d.entratePreviste, 40);
    if (dopo) {
      const ytd = app.datiAnnoConfronto(Y - 1, 'ytd');
      assert.strictEqual(ytd.usciteConsStr, 0, 'la spesa del 31/12 non è "da inizio anno a oggi"');
      assert.ok(ytd.usciteCons <= d.usciteCons);
    }
  });
  it('quota per condomino: percentuale salvata, zero se escluso dalla ripartizione, parti uguali senza ripartizione', () => {
    const app = loadApp();
    assert.strictEqual(app.quotaSuSpesa({ split: [{ id: 1, perc: 40 }, { id: 2, perc: 60 }] }, 1, 100, 2), 40);
    assert.strictEqual(app.quotaSuSpesa({ split: [{ id: 1, perc: 100 }] }, 3, 100, 3), 0);
    assert.strictEqual(app.quotaSuSpesa({ split: [] }, 3, 90, 3), 30);
  });
  it('la pagina mostra "—" per i dati reali dell\'anno prossimo e le categorie con l\'importo scelto', () => {
    const app = base({ page: 'confronto', confrontoAnni: [Y, Y + 1], confrontoBase: 'preventivo', spese: [
      { id: 1, data: `${Y + 1}-03-01`, preventivo: '700', consuntivo: '', categoria: 'pulizie', tipoSpesa: 'ordinaria', edificioId: 1, split: [] },
      { id: 2, data: `${Y}-03-01`, preventivo: '500', consuntivo: '450', categoria: 'pulizie', tipoSpesa: 'ordinaria', edificioId: 1, split: [] } ] });
    const h = app.renderConfronto();
    assert.ok(h.includes('cf-vuoto'), 'manca il "—" per l\'anno non iniziato');
    assert.ok(h.includes('700,00') && h.includes('500,00'));
    assert.ok(h.includes('preventivo</span>'), 'badge "preventivo" sull\'anno prossimo');
  });
  it('Entrate con anni non consecutivi: il riporto include gli anni saltati, così il saldo resta la cassa vera', () => {
    const app = base({ page: 'entrate', filterAnni: [Y - 2, Y], condomini: [{ id: 101, nome: 'A', edificioId: 1 }],
      spese: [], entrate: [
        { id: 1, condominoId: 101, importo: '100', data: `${Y - 2}-03-01`, edificioId: 1 },
        { id: 2, condominoId: 101, importo: '200', data: `${Y - 1}-03-01`, edificioId: 1 },
        { id: 3, condominoId: 101, importo: '300', data: `${Y}-03-01`, edificioId: 1 } ] });
    const h = app.renderEntrate();
    assert.ok(h.includes('400,00'), 'versato degli anni scelti (100 + 300)');
    assert.ok(h.includes('200,00'), 'riporto dell\'anno saltato');
    assert.ok(h.includes('600,00'), 'saldo = cassa vera (100 + 200 + 300)');
  });
});

describe('UNIT — export del Confronto anni', () => {
  it('una colonna per anno, importi con la virgola, nomi di categoria protetti dalle formule di Excel', () => {
    const Y = new Date().getFullYear();
    const app = loadApp();
    app.__set('state', { ...app.__get('state'), edificioAttivo: 1, edifici: [{ id: 1, nome: 'E' }], confrontoAnni: [Y - 1, Y], confrontoPeriodo: 'anno', confrontoBase: 'reale',
      condomini: [], entrate: [{ data: `${Y - 1}-02-01`, importo: '1000', edificioId: 1 }],
      spese: [{ data: `${Y}-02-01`, consuntivo: '250.5', categoria: '=HYPERLINK("x")', edificioId: 1 }] });
    app.esportaConfrontoCSV();
    const blob = app.__downloads.find((d) => d.blob).blob;
    const righe = blob.text.replace(/^﻿/, '').split('\r\n');
    assert.ok(righe.includes(`Sintesi;${Y - 1};${Y}`));
    assert.ok(righe.includes('Entrate reali;1000,00;0,00'));
    assert.ok(righe.some((r) => r.startsWith('"\'=HYPERLINK(""x"")";')), 'categoria non protetta: ' + righe.slice(-1));
    assert.ok(righe.some((r) => r.endsWith(';0,00;250,50')));
  });
});

describe('UNIT — difetti aperti chiusi dopo il riassessment', () => {
  const Y = new Date().getFullYear();
  const base = (extra) => {
    const app = loadApp();
    app.__set('state', { ...app.__get('state'), edificioAttivo: 1, edifici: [{ id: 1, nome: 'E' }], filterAnno: Y, filterAnni: [Y],
      user: { id: 101, nome: 'A', isAdmin: true, canEdit: true, edificioId: 1 },
      condomini: [{ id: 101, nome: 'Anna', edificioId: 1 }, { id: 102, nome: 'Bruno', edificioId: 1 }], spese: [], entrate: [], ...extra });
    return app;
  };
  it('meseDi legge il mese dal testo e scarta le date non valide', () => {
    const app = loadApp();
    assert.strictEqual(app.meseDi('2027-01-01'), 0);
    assert.strictEqual(app.meseDi('2026-12-31'), 11);
    assert.ok(Number.isNaN(app.meseDi('')));
  });
  it('riporto per condomino: versamenti reali meno la sua quota delle spese consuntivate degli anni prima', () => {
    const app = base({
      spese: [{ data: `${Y - 1}-05-01`, consuntivo: '1000', split: [{ id: 101, perc: 60 }, { id: 102, perc: 40 }], edificioId: 1 },
        { data: `${Y - 1}-06-01`, preventivo: '500', consuntivo: '', split: [], edificioId: 1 }],
      entrate: [{ data: `${Y - 1}-02-01`, importo: '200', condominoId: 101, edificioId: 1 },
        { data: `${Y - 1}-12-01`, importo: '999', condominoId: 101, edificioId: 1, previsionale: true }] });
    assert.strictEqual(app.riportoCondomino(101, (d) => app.annoDi(d) < Y, 2), -400); // 200 − 600
    assert.strictEqual(app.riportoCondomino(102, (d) => app.annoDi(d) < Y, 2), -400); //   0 − 400
  });
  it('Bilancio per condomino: chi ha un debito dagli anni prima non risulta "in regola"', () => {
    const app = base({ page: 'bilancio', bilancioTab: 'condomini',
      spese: [{ id: 1, data: `${Y - 1}-05-01`, consuntivo: '1000', split: [{ id: 101, perc: 50 }, { id: 102, perc: 50 }], edificioId: 1 },
        { id: 2, data: `${Y}-03-01`, consuntivo: '200', split: [{ id: 101, perc: 50 }, { id: 102, perc: 50 }], edificioId: 1 }],
      entrate: [{ id: 3, data: `${Y}-03-10`, importo: '100', condominoId: 101, edificioId: 1 },
        { id: 4, data: `${Y - 1}-06-10`, importo: '500', condominoId: 102, edificioId: 1 },
        { id: 5, data: `${Y}-03-10`, importo: '100', condominoId: 102, edificioId: 1 }] });
    const h = app.renderBilancio();
    assert.ok(h.includes('Riporto anni prec.'), 'riga del riporto mancante');
    assert.ok(h.includes('-500,00'), 'debito di Anna dagli anni prima (0 − 500)');
    assert.ok(/In regola<\/div><div class="kpi-value"[^>]*>1\/2</.test(h), 'solo Bruno è in pari');
  });
  it('chi non è nella ripartizione di una spesa non paga una parte uguale (totale quote = spesa)', () => {
    const app = base({ page: 'bilancio', bilancioTab: 'condomini',
      condomini: [{ id: 101, nome: 'Anna', edificioId: 1 }, { id: 102, nome: 'Bruno', edificioId: 1 }, { id: 103, nome: 'Carla', edificioId: 1 }],
      spese: [{ id: 1, data: `${Y}-03-01`, consuntivo: '900', split: [{ id: 101, perc: 50 }, { id: 102, perc: 50 }], edificioId: 1 }] });
    const h = app.renderBilancio();
    const i = h.indexOf('Carla');
    assert.ok(i > 0);
    assert.ok(h.slice(i, i + 2500).includes('−€ 0,00'), 'Carla, entrata dopo, non deve avere quota');
  });
  it('"La tua situazione" mostra il debito degli anni precedenti', () => {
    const app = base({ page: 'dashboard', user: { id: 103, nome: 'M', edificioId: 1 }, condomini: [{ id: 103, nome: 'M', edificioId: 1 }],
      spese: [{ data: `${Y - 1}-05-01`, consuntivo: '300', split: [], edificioId: 1 }] });
    const d = app.renderDashboard();
    const i = d.indexOf('La tua situazione');
    assert.ok(d.slice(i, i + 2000).includes('Dagli anni precedenti') && d.slice(i, i + 2000).includes('-300,00'));
  });
  it('Entrate: il totale in verde conta solo i versamenti reali, le rate previste sono a parte', () => {
    const app = base({ page: 'entrate', entrate: [
      { id: 1, data: `${Y}-02-01`, importo: '100', condominoId: 101, edificioId: 1 },
      { id: 2, data: `${Y}-11-01`, importo: '400', condominoId: 101, edificioId: 1, previsionale: true }] });
    const h = app.renderEntrate();
    assert.ok(/Tutti i versamenti<\/h3><div[^>]*><strong[^>]*>€ 100,00/.test(h), 'totale reale');
    assert.ok(h.includes('400,00 previsti'));
  });
  it('Bilancio di un anno chiuso segnala preventivi e rate rimasti aperti', () => {
    const app = base({ page: 'bilancio', bilancioTab: 'overview', filterAnno: Y - 1,
      spese: [{ id: 1, data: `${Y - 1}-05-01`, preventivo: '300', consuntivo: '', edificioId: 1, split: [] }],
      entrate: [{ id: 2, data: `${Y - 1}-06-01`, importo: '50', edificioId: 1, previsionale: true }] });
    const h = app.renderBilancio();
    assert.ok(h.includes('sono rimasti aperti') && h.includes('1 spesa con solo preventivo') && h.includes('1 versamento previsto'));
  });
});

describe('UNIT — ripartizione esatta al 100%', () => {
  it('parti uguali in centesimi: la somma è sempre 100,00%', () => {
    const app = loadApp();
    for (const n of [1, 3, 6, 7, 9, 12]) {
      const p = app.partiUguali(n);
      assert.strictEqual(p.length, n);
      assert.strictEqual(Math.round(p.reduce((a, x) => a + x, 0) * 100), 10000, 'n=' + n);
    }
  });
  it('una ripartizione salvata a 100,02% (6 × 16,67%) chiede esattamente la spesa, non 6 € in più', () => {
    const app = loadApp();
    const split = [1, 2, 3, 4, 5, 6].map((id) => ({ id, perc: 16.67 }));
    const quote = split.map((x) => app.quotaSuSpesa({ split }, x.id, 30000, 6));
    assert.strictEqual(Math.round(quote.reduce((a, q) => a + q, 0) * 100) / 100, 30000);
    // una ripartizione volutamente diversa da 100% (es. 80%) non viene toccata
    assert.strictEqual(app.percEffettiva([{ perc: 50 }, { perc: 30 }], 50), 50);
  });
});

describe('UNIT — spese ricorrenti come serie', () => {
  const Y = new Date().getFullYear();
  const serie = [1, 2, 3, 4].map((m) => ({ id: 70 + m, ricGruppoId: 9, data: `${Y + 1}-0${m}-01`, preventivo: '100', consuntivo: m === 3 ? '100' : '', edificioId: 1, split: [] }));
  const app = loadApp();
  app.__set('state', { ...app.__get('state'), spese: [...serie, { id: 99, data: `${Y + 1}-05-01`, preventivo: '5', edificioId: 1 }] });
  it('successive = stessa serie, dopo questa, non consuntivate', () => {
    const ids = app.occorrenzeSuccessive(serie[0]).map((s) => s.id).sort();
    assert.strictEqual(JSON.stringify(ids), '[72,74]'); // la 73 è consuntivata, la 99 è di un'altra serie
    assert.strictEqual(app.occorrenzeSuccessive(serie[3]).length, 0);
    assert.strictEqual(app.occorrenzeSuccessive({ id: 1, data: '2026-01-01' }).length, 0);
  });
  it('la scheda mostra il riquadro della serie solo se ci sono successive', () => {
    assert.ok(app.renderBoxSerie(serie[0]).includes('2 occorrenze successive'));
    assert.strictEqual(app.renderBoxSerie(serie[3]), '');
  });
});

describe('UNIT — rendiconto annuale', () => {
  const Y = new Date().getFullYear();
  const base = (extra) => {
    const app = loadApp();
    app.__set('state', { ...app.__get('state'), edificioAttivo: 1, edifici: [{ id: 1, nome: 'E' }], fornitori: [{ id: 5, nome: 'Pulito Srl' }],
      user: { id: 101, nome: 'Anna', isAdmin: true, canEdit: true, edificioId: 1 },
      condomini: [{ id: 101, nome: 'Anna', appartamento: 'Int. 1', edificioId: 1 }, { id: 102, nome: 'Bruno', appartamento: 'Int. 2', edificioId: 1 }],
      spese: [
        { id: 1, data: `${Y - 2}-05-01`, consuntivo: '400', split: [], edificioId: 1 },
        { id: 2, data: `${Y - 1}-03-01`, titolo: 'Pulizie', categoria: 'pulizie', tipoSpesa: 'ordinaria', preventivo: '1000', consuntivo: '1100', fornitoreId: 5, split: [{ id: 101, perc: 60 }, { id: 102, perc: 40 }], allegati: [{ id: 1 }], edificioId: 1 },
        { id: 3, data: `${Y - 1}-09-01`, titolo: 'Tetto', categoria: 'tetto', tipoSpesa: 'straordinaria', preventivo: '2000', consuntivo: '', split: [], edificioId: 1 },
        { id: 4, data: `${Y + 1}-02-01`, titolo: 'Assicurazione', categoria: 'assicurazione', tipoSpesa: 'ordinaria', preventivo: '800', consuntivo: '', split: [], edificioId: 1 },
      ],
      entrate: [
        { id: 10, data: `${Y - 2}-01-10`, importo: '1000', condominoId: 101, edificioId: 1 },
        { id: 11, data: `${Y - 1}-02-10`, importo: '500', condominoId: 101, edificioId: 1 },
        { id: 12, data: `${Y - 1}-12-10`, importo: '300', condominoId: 102, edificioId: 1, previsionale: true },
      ], ...extra });
    return app;
  };
  it('anno chiuso: cassa iniziale + versamenti - spese consuntivate = cassa finale', () => {
    const d = base().datiRendiconto(Y - 1);
    assert.strictEqual(d.preventivo, false);
    assert.strictEqual(d.riporto, 600);          // 1000 - 400
    assert.strictEqual(d.entrate, 500);
    assert.strictEqual(d.uscite, 1100);
    assert.strictEqual(d.cassaFine, 0);          // 600 + 500 - 1100
    assert.strictEqual(d.usciteOrd, 1100);
    assert.strictEqual(d.daConsuntivare, 2000);
    assert.strictEqual(d.chiuseCons - d.chiusePrev, 100);
    assert.strictEqual(d.entratePreviste, 300);
    assert.strictEqual(JSON.stringify(d.categorie.map((c) => c.tipo + ':' + c.categoria)), JSON.stringify(['ordinaria:Pulizie', 'straordinaria:Rifacimento tetto']));
  });
  it('riparto: quote dalla ripartizione, riporto per condomino e saldo', () => {
    const d = base().datiRendiconto(Y - 1);
    const a = d.riparto.find((r) => r.nome === 'Anna'), b = d.riparto.find((r) => r.nome === 'Bruno');
    assert.strictEqual(a.dovuto, 660); assert.strictEqual(b.dovuto, 440);
    assert.strictEqual(a.riporto, 800);          // 1000 versati - 200 (metà dei 400 senza ripartizione)
    assert.strictEqual(a.saldo, 800 + 500 - 660);
    assert.strictEqual(b.saldo, -200 - 440);     // la rata prevista non conta
  });
  it('registri del dettagliato: spese con fornitore e allegati, versamenti reali separati dai previsti', () => {
    const d = base().datiRendiconto(Y - 1);
    assert.strictEqual(d.registroSpese.length, 2);
    assert.strictEqual(d.registroSpese[0].fornitore, 'Pulito Srl');
    assert.strictEqual(d.registroSpese[0].allegati, 1);
    assert.strictEqual(d.registroVersamenti.length, 1);
    assert.strictEqual(d.registroPrevisti.length, 1);
  });
  it('anno prossimo: diventa bilancio preventivo con gli importi a preventivo', () => {
    const d = base().datiRendiconto(Y + 1);
    assert.strictEqual(d.preventivo, true);
    assert.strictEqual(d.uscite, 800);
    assert.strictEqual(d.riparto.find((r) => r.nome === 'Anna').dovuto, 400);
  });
  it('importi nel PDF sempre con il punto delle migliaia e la virgola dei decimali', () => {
    const app = loadApp();
    assert.strictEqual(app.euroPdf(1234.5), '€ 1.234,50');
    assert.strictEqual(app.euroPdf(-32950), '-€ 32.950,00');
    assert.strictEqual(app.euroPdf(0), '€ 0,00');
    assert.strictEqual(app.dataPdf('2026-03-31'), '31/03/2026');
  });
});

describe('UNIT — estratto conto del condomino', () => {
  const Y = new Date().getFullYear();
  const app = loadApp();
  app.__set('state', { ...app.__get('state'), edificioAttivo: 1, edifici: [{ id: 1, nome: 'E' }], fornitori: [],
    user: { id: 101, nome: 'Anna', isAdmin: true, canEdit: true, edificioId: 1 },
    condomini: [{ id: 101, nome: 'Anna', appartamento: 'Int. 1', edificioId: 1 }, { id: 102, nome: 'Bruno', appartamento: 'Int. 2', edificioId: 1 }],
    spese: [
      { id: 1, data: `${Y - 2}-05-01`, consuntivo: '400', split: [], edificioId: 1 },
      { id: 2, data: `${Y - 1}-03-01`, titolo: 'Pulizie', categoria: 'pulizie', tipoSpesa: 'ordinaria', preventivo: '1000', consuntivo: '1100', split: [{ id: 101, perc: 60 }, { id: 102, perc: 40 }], edificioId: 1 },
      { id: 3, data: `${Y - 1}-09-01`, titolo: 'Tetto', categoria: 'tetto', tipoSpesa: 'straordinaria', preventivo: '2000', consuntivo: '1500', split: [], edificioId: 1 },
      { id: 4, data: `${Y - 1}-11-01`, titolo: 'Ascensore', categoria: 'ascensore', tipoSpesa: 'ordinaria', preventivo: '600', consuntivo: '', split: [], edificioId: 1 },
    ],
    entrate: [
      { id: 10, data: `${Y - 2}-01-10`, importo: '1000', condominoId: 101, edificioId: 1 },
      { id: 11, data: `${Y - 1}-03-01`, importo: '500', condominoId: 101, descrizione: 'Rata 1', edificioId: 1 },
      { id: 12, data: `${Y - 1}-12-10`, importo: '300', condominoId: 101, edificioId: 1, previsionale: true },
    ] });
  const d = app.datiEstratto(101, Y - 1);
  it('riepilogo: saldo iniziale, quote ordinarie e straordinarie, versamenti, saldo finale', () => {
    assert.strictEqual(d.riporto, 800);            // 1000 - 200
    assert.strictEqual(d.quoteOrd, 660);           // 60% di 1100
    assert.strictEqual(d.quoteStr, 750);           // metà di 1500
    assert.strictEqual(d.versato, 500);
    assert.strictEqual(d.saldo, 800 - 660 - 750 + 500);
  });
  it('movimenti in ordine di data con saldo progressivo (nello stesso giorno prima il versamento)', () => {
    assert.strictEqual(JSON.stringify(d.movimenti.map((m) => m.tipo)), JSON.stringify(['versamento', 'quota', 'quota']));
    assert.strictEqual(d.movimenti[0].saldo, 1300);
    assert.strictEqual(d.movimenti.at(-1).saldo, d.saldo);
    assert.ok(d.movimenti[1].dettaglio.includes('60%'));
  });
  it('prossime scadenze: quota sulle spese da consuntivare e rate previste, fuori dal saldo', () => {
    assert.strictEqual(d.quotaPrevista, 300);      // metà di 600
    assert.strictEqual(d.ratePreviste, 300);
  });
  it('il saldo coincide con quello del riparto nel rendiconto dello stesso anno', () => {
    const r = app.datiRendiconto(Y - 1).riparto.find((x) => x.nome === 'Anna');
    assert.ok(Math.abs(r.saldo - d.saldo) < 0.001);
  });
});

describe('UNIT — ricerca nel sito e tema', () => {
  const Y = new Date().getFullYear();
  const base = (user) => {
    const app = loadApp();
    app.__set('state', { ...app.__get('state'), edificioAttivo: 1, edifici: [{ id: 1, nome: 'E' }], user,
      condomini: [{ id: 101, nome: 'Anna Rossi', appartamento: 'Int. 1', email: 'anna@x.it', edificioId: 1 }, { id: 201, nome: 'Altro Edificio', edificioId: 2 }],
      fornitori: [{ id: 5, nome: 'Ascensore Rapido Srl', categoria: 'altro', note: 'chiamare la mattina', edificioId: 1 }],
      spese: [
        { id: 1, data: `${Y}-03-01`, titolo: 'Manutenzione ascensore', descrizione: 'Revisione semestrale', consuntivo: '1200', fornitoreId: 5, categoria: 'ascensore', edificioId: 1, allegati: [{ id: 9, nome: 'fattura-ascensore.pdf' }] },
        { id: 2, data: `${Y}-04-01`, titolo: 'Pulizie', consuntivo: '300', categoria: 'pulizie', edificioId: 1 },
        { id: 3, data: `${Y}-04-01`, titolo: 'Ascensore altro edificio', consuntivo: '50', edificioId: 2 },
      ],
      entrate: [{ id: 10, data: `${Y}-02-01`, importo: '450', condominoId: 101, descrizione: 'Rata perché in ritardo', edificioId: 1 }],
      bacheca: [{ id: 20, titolo: 'Fermo ascensore', testo: 'Lunedì mattina', data: `${Y}-05-01`, edificioId: 1 }],
      verbali: [{ id: 30, titolo: 'Assemblea', argomenti: ['ascensore', 'facciata'], decisioni: ['approvato'], data: `${Y}-03-20`, edificioId: 1 }],
      lavori: [], delibere: [] });
    return app;
  };
  const admin = { id: 101, nome: 'Anna', isAdmin: true, canEdit: true, edificioId: 1 };
  const membro = { id: 102, nome: 'Bruno', edificioId: 1 };
  it('trova in più sezioni, senza maiuscole e accenti, solo nel condominio attivo', () => {
    const r = base(admin).cercaNelSito('ASCENSORE');
    const k = Object.fromEntries(r.gruppi.map((g) => [g.chiave, g.voci.length]));
    assert.strictEqual(k.spese, 1, 'la spesa dell\'altro edificio non deve comparire');
    assert.strictEqual(k.fornitori, 1);
    assert.strictEqual(k.avvisi, 1);
    assert.strictEqual(k.verbali, 1);
    assert.strictEqual(base(admin).cercaNelSito('perche').gruppi[0].chiave, 'entrate');
  });
  it('più parole = tutte presenti; importi, date e nomi degli allegati', () => {
    const app = base(admin);
    assert.strictEqual(app.cercaNelSito('ascensore revisione').gruppi.length, 1);
    assert.strictEqual(app.cercaNelSito('1.200,00').gruppi[0].voci[0].id, 1);
    assert.strictEqual(app.cercaNelSito('fattura-ascensore').gruppi[0].voci[0].id, 1);
    assert.strictEqual(app.cercaNelSito('01/02/' + Y).gruppi[0].chiave, 'entrate');
    assert.strictEqual(app.cercaNelSito('a').gruppi.length, 0, 'una lettera sola non cerca');
  });
  it('i condomini compaiono solo a chi amministra', () => {
    assert.ok(base(admin).cercaNelSito('anna').gruppi.some((g) => g.chiave === 'condomini'));
    assert.ok(!base(membro).cercaNelSito('anna').gruppi.some((g) => g.chiave === 'condomini'));
    assert.ok(!base(admin).cercaNelSito('altro edificio').gruppi.some((g) => g.chiave === 'condomini'));
  });
  it('l\'evidenziazione è sicura: il testo passa dall\'escape', () => {
    const app = loadApp();
    assert.strictEqual(app.evidenzia('<b>Ascensore</b>', ['ascensore']), '&lt;b&gt;<mark>Ascensore</mark>&lt;/b&gt;');
    assert.strictEqual(app.evidenzia('Perché', ['perche']), '<mark>Perché</mark>');
  });
  it('tema: scelta non valida o assente = automatico; senza scuro del dispositivo resta chiaro', () => {
    const app = loadApp();
    assert.strictEqual(app.temaScelto(), 'auto');
    assert.strictEqual(typeof app.cambiaTema, 'function');
  });
});
