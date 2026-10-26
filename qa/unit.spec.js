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
  it('coloreSicuro() e avatarStyle() non lasciano passare CSS iniettato (audit 2026-10-21)', () => {
    assert.strictEqual(app.coloreSicuro('#3B82F6'), '#3B82F6');
    assert.strictEqual(app.coloreSicuro('#fff'), '#fff');
    assert.strictEqual(app.coloreSicuro('var(--accent)'), 'var(--accent)');
    for (const male of ['red;position:fixed;inset:0', '#fff;background:url(https://x.test/p)', 'url(x)', 'red', '', null, undefined, '#12', 'var(--a);x:y']) {
      assert.strictEqual(app.coloreSicuro(male), '#888888', String(male));
    }
    assert.strictEqual(app.coloreSicuro('x;y', 'var(--accent)'), 'var(--accent)');
    const stile = app.avatarStyle('red;position:fixed;inset:0;z-index:9999');
    assert.ok(!/position|inset|z-index/.test(stile), stile);
    assert.ok(app.avatarStyle('#3B82F6').includes('#3B82F622'));
  });
  it("esc() neutralizza anche l'apice singolo (audit 2026-10-15)", () => {
    assert.strictEqual(app.esc("a'b"), 'a&#39;b');
  });
  it('allegati: un id con apici non esce dagli attributi data-* (audit 2026-10-15)', () => {
    const id = "1' onmouseover='window.__xss=1' x='";
    const a = { id, nome: "f'.pdf", mime: "application/x'<b>", size: 10 };
    for (const html of [app.renderAllegatoItem(a), app.renderAllegatiClip({ allegati: [a] }), app.renderAllegatiChip({ allegati: [a] })]) {
      assert.ok(!html.includes("'1'") && !/onmouseover='/.test(html) && !html.includes('<b>'), html);
      // dataset decodifica le entità: il JSON torna quello originale
      const attr = html.match(/data-view-allegato='([^']*)'/)[1];
      const decoded = attr.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
      assert.deepStrictEqual(JSON.parse(decoded), { id });
    }
  });
  // Audit 2026-10-19
  it('fromDocs(): record con id avvelenato scartato, riferimenti non validi svuotati', () => {
    const bad = '1"><img src=x onerror=alert(1)>';
    const snap = (id, data) => ({ id: String(id), ref: { path: 'buildings/1/expenses/' + id }, data: () => data });
    const out = app.fromDocs([
      snap(10, { id: 10, edificioId: 1, fornitoreId: 3, condominoId: bad, ricGruppoId: '', tabellaMillesimi: 'generale', split: [{ id: 5, perc: 50 }, { id: bad, perc: 1 }] }),
      snap(bad, { id: bad, edificioId: 1 }),
      snap(11, { id: bad, edificioId: 1 }),
      snap('a-1_b.2', { id: 'a-1_b.2', edificioId: 1, _updatedBy: 'u' }),
    ]);
    assert.deepStrictEqual(out.map((r) => r.id), [10, 'a-1_b.2']);
    assert.strictEqual(out[0].fornitoreId, 3);
    assert.strictEqual(out[0].condominoId, null);
    assert.strictEqual(out[0].ricGruppoId, '');
    assert.strictEqual(out[0].tabellaMillesimi, 'generale');
    assert.deepStrictEqual(out[0].split.map((s) => s.id), [5]);
    assert.ok(!('_updatedBy' in out[1]));
  });
  it('visualizzatore: un vecchio allegato con data64 javascript: non finisce in iframe, img o link', () => {
    const js = 'javascript:window.__xss=1';
    assert.strictEqual(app.data64Sicuro({ data64: js }), '');
    assert.strictEqual(app.data64Sicuro({ data64: ' data:application/pdf;base64,AA' }), '');
    assert.strictEqual(app.data64Sicuro({ data64: 'data:image/jpeg;base64,/9j/' }), 'data:image/jpeg;base64,/9j/');
    for (const mime of ['application/pdf', 'image/jpeg']) {
      app.__set('state', { ...app.__get('state'), viewer: { nome: 'f', mime, size: 1, data64: js } });
      const html = app.renderViewer();
      assert.ok(!html.includes('javascript:') && !html.includes('<iframe') && !html.includes('<img'), html);
    }
    // PDF dichiarato ma contenuto di altro tipo: niente anteprima nell'iframe.
    app.__set('state', { ...app.__get('state'), viewer: { nome: 'f', mime: 'application/pdf', size: 1, data64: 'data:text/html;base64,PHA+' } });
    assert.ok(!app.renderViewer().includes('<iframe'));
    app.__set('state', { ...app.__get('state'), viewer: { nome: 'f', mime: 'application/pdf', size: 1, data64: 'data:application/pdf;base64,JVBERi0=' } });
    assert.ok(app.renderViewer().includes('<iframe src="data:application/pdf;base64,JVBERi0="'));
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

// Privacy (decisione del 2026-10-15): al salvataggio email e telefono vanno in
// buildings/{b}/contatti/{id}, mai nel record del condomino (js/core/dati.js).
describe('UNIT — contatti dei condomini separati al salvataggio', () => {
  function conFirebase() {
    const app = loadApp();
    const scritte = [];
    const doc = (_db, ...p) => ({ path: p.join('/'), id: p[p.length - 1] });
    app._fb = { auth: { currentUser: { uid: 'u' } }, db: {}, doc, serverTimestamp: () => 'ORA', deleteField: () => 'TOGLI',
      writeBatch: () => ({ set: (ref, data, opts) => scritte.push({ path: ref.path, data, merge: !!opts }), commit: async () => {} }),
      getDoc: async () => ({ exists: () => false }) };
    app.__set('state', { ...app.__get('state'), edificioAttivo: 1 });
    return { app, scritte };
  }
  const anna = { id: 7, nome: 'Anna', appartamento: 'Int. 1', edificioId: 1, email: 'Anna@Esempio.it' };

  it('nuovo condomino: due documenti, il condomino senza email, i contatti con emailLower', async () => {
    const { app, scritte } = conFirebase();
    app.setServerSnap('cm_condomini', []);
    await app.saveRecords('cm_condomini', [anna]);
    const m = scritte.find((s) => s.path === 'buildings/1/members/7');
    const c = scritte.find((s) => s.path === 'buildings/1/contatti/7');
    assert.ok(m && c, JSON.stringify(scritte.map((s) => s.path)));
    assert.ok(!('email' in m.data) && !('emailLower' in m.data));
    assert.deepStrictEqual([c.data.email, c.data.emailLower, c.data.nome, c.merge], ['Anna@Esempio.it', 'anna@esempio.it', undefined, false]);
  });
  it('cambio di nome: si scrive solo il condomino (e si tolgono i vecchi campi); cambio di email: solo i contatti', async () => {
    const { app, scritte } = conFirebase();
    app.setServerSnap('cm_condomini', [anna]);
    app.__get('_contattiNoti').add('buildings/1/contatti/7');
    await app.saveRecords('cm_condomini', [{ ...anna, nome: 'Anna R.' }]);
    assert.deepStrictEqual(scritte.map((s) => s.path), ['buildings/1/members/7']);
    assert.deepStrictEqual([scritte[0].data.email, scritte[0].data.emailLower, scritte[0].merge], ['TOGLI', 'TOGLI', true]);
    scritte.length = 0;
    app.setServerSnap('cm_condomini', [anna]);
    await app.saveRecords('cm_condomini', [{ ...anna, email: '' }]);
    assert.deepStrictEqual(scritte.map((s) => s.path), ['buildings/1/contatti/7']);
    assert.deepStrictEqual([scritte[0].data.email, scritte[0].data.emailLower], ['TOGLI', null]);
  });
  it('record non ancora migrato: salvandolo l\'email passa nei contatti; cancellandolo non si perde', async () => {
    const { app, scritte } = conFirebase();
    app.setServerSnap('cm_condomini', [anna]);
    await app.saveRecords('cm_condomini', [{ ...anna, nome: 'Anna R.' }]);
    assert.deepStrictEqual(scritte.map((s) => s.path).sort(), ['buildings/1/contatti/7', 'buildings/1/members/7']);
    assert.strictEqual(scritte.find((s) => s.path.includes('contatti')).data.email, 'Anna@Esempio.it');
    scritte.length = 0;
    const { app: app2, scritte: s2 } = conFirebase();
    app2.setServerSnap('cm_condomini', [anna]);
    await app2.saveRecords('cm_condomini', []);
    const c = s2.find((s) => s.path === 'buildings/1/contatti/7');
    assert.deepStrictEqual([c.data._deleted, c.data.email, s2.find((s) => s.path === 'buildings/1/members/7').data.email], [true, 'Anna@Esempio.it', 'TOGLI']);
  });
});

// Correzioni dell'audit dei percorsi di clic (2026-10-16).
describe('UNIT — percorsi di clic', () => {
  it('doppio clic: unClicAllaVolta esegue una volta sola finché non ha finito, poi riattiva il pulsante', async () => {
    const app = loadApp();
    const btn = { dataset: {}, disabled: false };
    let n = 0, fine;
    const lavoro = () => new Promise((r) => { n++; fine = r; });
    const primo = app.unClicAllaVolta(btn, lavoro);
    await app.unClicAllaVolta(btn, lavoro);
    assert.strictEqual(n, 1);
    assert.strictEqual(btn.disabled, true);
    fine(); await primo;
    assert.strictEqual(btn.disabled, false);
    await app.unClicAllaVolta(btn, async () => { n++; });
    assert.strictEqual(n, 2);
  });
  it('"🗑 Elimina" dei condomini ha un gestore', () => {
    const app = loadApp();
    const btn = { dataset: { delCond: '7' } };
    app.document.querySelectorAll = (sel) => (sel === '[data-del-cond]' ? [btn] : []);
    app.document.getElementById = () => null;
    app.bindAzioniCondomini();
    assert.strictEqual(typeof btn.onclick, 'function');
  });
  it('allegati: senza permesso niente cestino; con permesso sì', () => {
    const app = loadApp();
    const f = { id: 1, nome: 'v.pdf', mime: 'application/pdf', size: 10 };
    assert.ok(!app.renderAllegatoItem(f, false, false).includes('data-del-allegato'));
    assert.ok(app.renderAllegatoItem(f, false, true).includes('data-del-allegato'));
    assert.ok(app.renderAllegatoItem(f, false).includes('data-del-allegato'));
  });
  it('allegati: il file si cancella solo dopo che il record è stato salvato', async () => {
    const app = loadApp();
    const cancellati = [];
    app._fb = { storage: {}, ref: (_s, p) => p, deleteObject: async (p) => { cancellati.push(p); } };
    const verbale = { id: 5, allegati: [{ id: 9, nome: 'a.pdf', mime: 'application/pdf', storagePath: 'x/a.pdf' }] };
    app.__set('state', { ...app.__get('state'), verbali: [verbale], modal: null });
    const btn = { dataset: { delAllegato: '{"id":9}' } };
    app.document.querySelectorAll = (sel) => (sel === '[data-del-allegato]' ? [btn] : []);
    for (const esito of [false, true]) {
      app.save = () => Promise.resolve(esito);
      app.setState = () => {};
      app.bindAllegatiInTable([{ records: [verbale], stateKey: 'verbali', appdataKey: 'cm_verbali' }]);
      await btn.onclick();
      await new Promise((r) => setTimeout(r, 0));
      assert.deepStrictEqual(cancellati, esito ? ['x/a.pdf'] : [], 'salvataggio ' + (esito ? 'riuscito' : 'rifiutato'));
    }
  });
  it('spese: la selezione tiene solo le righe visibili con i filtri attuali', () => {
    const app = loadApp();
    const Y = new Date().getFullYear();
    app.__set('state', { ...app.__get('state'), page: 'spese', user: { id: 1, nome: 'A', isAdmin: true, canEdit: true, edificioId: 1 }, edificioAttivo: 1,
      spese: [{ id: 1, titolo: 'Luce', categoria: 'luce', data: Y + '-02-01', edificioId: 1, preventivo: '10' },
        { id: 2, titolo: 'Acqua', categoria: 'acqua', data: Y + '-03-01', edificioId: 1, preventivo: '10' }],
      speseSelezionate: new Set([1, 2]), searchQ: 'luce' });
    app.renderSpese();
    assert.deepStrictEqual([...app.__get('state').speseSelezionate], [1]);
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
    assert.ok(h.includes(`data-view-allegato='{&quot;id&quot;:7}'`));
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
    assert.ok(new RegExp('Versato ' + Y + '</div><div class="sit-valore">€ 0,00').test(d), 'rata prevista contata come versata');
    assert.ok(/Prossima rata<\/div><div class="sit-valore">€ 400,00/.test(d),'la rata prevista compare come prossima rata');
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
  it('la scheda si chiama "Bilancio preventivo" per l\'anno prossimo, senza consuntivo nel dettagliato', () => {
    const app = loadApp();
    assert.strictEqual(app.nomeDocRendiconto(Y + 1), 'Bilancio preventivo');
    assert.strictEqual(app.nomeDocRendiconto(Y), 'Rendiconto');
    assert.ok(!app.descDettaglioRendiconto(Y + 1).includes('consuntivo'));
    assert.ok(app.descDettaglioRendiconto(Y - 1).includes('consuntivo'));
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
    assert.strictEqual(typeof app.interruttoreTema, 'function');
    assert.ok(app.renderInterruttoreTema().includes('role="switch"') && app.renderInterruttoreTema().includes('aria-checked="false"'));
  });
});

describe('UNIT — subentri (date di ingresso e uscita)', () => {
  const Y = new Date().getFullYear();
  const P = Y - 1; // anno del subentro
  const base = () => {
    const app = loadApp();
    app.__set('state', { ...app.__get('state'), edificioAttivo: 1, edifici: [{ id: 1, nome: 'E' }], fornitori: [],
      user: { id: 102, nome: 'Bruno', isAdmin: true, canEdit: true, edificioId: 1 },
      condomini: [
        { id: 101, nome: 'Anna', appartamento: 'Int. 1', edificioId: 1, disabled: true, dataUscita: `${P}-07-01` },
        { id: 102, nome: 'Bruno', appartamento: 'Int. 2', edificioId: 1 },
        { id: 103, nome: 'Carlo', appartamento: 'Int. 1', edificioId: 1, dataIngresso: `${P}-07-01` },
      ],
      spese: [
        { id: 1, data: `${P}-03-01`, titolo: 'Pulizie', categoria: 'pulizie', tipoSpesa: 'ordinaria', consuntivo: '600', split: [], edificioId: 1 },
        { id: 2, data: `${P}-07-01`, titolo: 'Luce', categoria: 'luce', tipoSpesa: 'ordinaria', consuntivo: '400', split: [], edificioId: 1 },
        { id: 3, data: `${Y}-02-01`, titolo: 'Tetto', categoria: 'tetto', tipoSpesa: 'straordinaria', preventivo: '1000', consuntivo: '', split: [], edificioId: 1 },
      ],
      entrate: [{ id: 10, data: `${P}-02-01`, importo: '300', condominoId: 101, edificioId: 1 }] });
    return app;
  };
  it('attivo alla data: il giorno di uscita appartiene già a chi entra', () => {
    const app = base();
    const [anna, , carlo] = app.__get('state').condomini;
    assert.ok(app.attivoAllaData(anna, `${P}-06-30`) && !app.attivoAllaData(anna, `${P}-07-01`));
    assert.ok(!app.attivoAllaData(carlo, `${P}-06-30`) && app.attivoAllaData(carlo, `${P}-07-01`));
    assert.ok(app.attivoNellAnno(anna, P) && !app.attivoNellAnno(anna, Y));
    assert.ok(app.attivoNellAnno(carlo, P) && !app.attivoNellAnno(carlo, P - 1));
  });
  it('archiviato senza data di uscita: escluso da oggi in poi, presente nel passato', () => {
    const app = base();
    const c = { id: 9, disabled: true, disabledOn: `${Y}-01-15T10:00:00.000Z` };
    assert.ok(app.attivoAllaData(c, `${Y}-01-14`) && !app.attivoAllaData(c, `${Y}-01-15`));
  });
  it('spese senza ripartizione divise tra chi abitava alla data della spesa', () => {
    const app = base();
    const [s1, s2] = app.__get('state').spese;
    assert.strictEqual(app.quotaSuSpesa(s1, 101, 600, 2), 300);
    assert.strictEqual(app.quotaSuSpesa(s1, 103, 600, 2), 0);
    assert.strictEqual(app.quotaSuSpesa(s2, 101, 400, 2), 0);
    assert.strictEqual(app.quotaSuSpesa(s2, 103, 400, 2), 200);
  });
  it('rendiconto dell\'anno del subentro: riparto con chi esce e chi entra, quote corrette', () => {
    const d = base().datiRendiconto(P);
    const q = Object.fromEntries(d.riparto.map((r) => [r.nome, r.dovuto]));
    assert.deepStrictEqual(q, { Anna: 300, Bruno: 500, Carlo: 200 });
    const dn = base().datiRendiconto(Y);
    assert.deepStrictEqual(dn.riparto.map((r) => r.nome).sort(), ['Bruno', 'Carlo']);
  });
  it('estratto conto di chi è uscito e di chi è entrato coerente con il riparto', () => {
    const app = base();
    for (const [id, nome] of [[101, 'Anna'], [103, 'Carlo']]) {
      const e = app.datiEstratto(id, P);
      const r = app.datiRendiconto(P).riparto.find((x) => x.nome === nome);
      assert.ok(Math.abs(e.saldo - r.saldo) < 0.001, `${nome}: ${e.saldo} vs ${r.saldo}`);
    }
  });
  it('subentro: archivia chi esce, crea chi entra e passa solo le quote future non consuntivate', async () => {
    const app = base();
    const st = app.__get('state');
    app.__set('state', { ...st,
      condomini: [{ id: 201, nome: 'Dario', appartamento: 'Int. 3', edificioId: 1, color: '#000' }, { id: 102, nome: 'Bruno', appartamento: 'Int. 2', edificioId: 1 }],
      spese: [
        { id: 1, data: `${Y}-01-10`, consuntivo: '100', split: [{ id: 201, perc: 50 }, { id: 102, perc: 50 }], edificioId: 1 },
        { id: 2, data: `${Y}-03-10`, consuntivo: '', preventivo: '200', split: [{ id: 201, perc: 50 }, { id: 102, perc: 50 }], edificioId: 1 },
        { id: 3, data: `${Y - 1}-12-10`, consuntivo: '', preventivo: '200', split: [{ id: 201, perc: 50 }, { id: 102, perc: 50 }], edificioId: 1 },
      ] });
    const salvati = {};
    app.save = (k, v) => { salvati[k] = v; };
    app.setState = (p) => app.__set('state', { ...app.__get('state'), ...p });
    app.__set('state', { ...app.__get('state'), modal: { type: 'subentro', data: { id: 201 } } });
    const campi = { 'btn-sub-conferma': { dataset: { cond: '201' } }, 'sub-data': { value: `${Y}-01-01` }, 'sub-nome': { value: 'Elena' },
      'sub-email': { value: 'elena@esempio.it' }, 'sub-ruolo': { value: 'lettura' }, 'sub-passa': { checked: true }, 'sub-err': { style: {} } };
    app.document.getElementById = (id) => campi[id] || null;
    app.bindSchedaSubentro();
    await campi['btn-sub-conferma'].onclick();
    const s = app.__get('state');
    const dario = s.condomini.find((c) => c.id === 201), elena = s.condomini.find((c) => c.nome === 'Elena');
    assert.ok(dario.disabled && dario.dataUscita === `${Y}-01-01` && /Subentro: Elena/.test(dario.disabledNote));
    assert.strictEqual(elena.appartamento, 'Int. 3'); assert.strictEqual(elena.dataIngresso, `${Y}-01-01`);
    assert.strictEqual(elena.canEdit, false); assert.strictEqual(elena.edificioId, 1);
    const split = (id) => s.spese.find((x) => x.id === id).split;
    assert.strictEqual(split(1).find((x) => x.id === 201).perc, 50);   // consuntivata: resta a chi esce
    assert.strictEqual(split(3).find((x) => x.id === 201).perc, 50);   // precedente al subentro
    assert.strictEqual(split(2).find((x) => x.id === 201).perc, 0);
    assert.strictEqual(split(2).find((x) => x.id === elena.id).perc, 50);
    assert.ok(salvati.cm_condomini && salvati.cm_spese);
    assert.strictEqual(s.modal, null);
  });
});

describe('UNIT — subentro solo per amministratori', () => {
  const casi = [
    ['lettura', { id: 102, canEdit: false, isAdmin: false }, false],
    ['modifica', { id: 102, canEdit: true, isAdmin: false }, false],
    ['amm. edificio', { id: 102, canEdit: true, isAdmin: true }, true],
    ['super admin', { id: 900, superAdmin: true }, true],
  ];
  for (const [nome, user, puo] of casi) {
    it(`${nome}: ${puo ? 'può' : 'non può'} registrare un subentro`, () => {
      const app = loadApp();
      app.__set('state', { ...app.__get('state'), edificioAttivo: 1, user: { ...user, edificioId: 1 },
        condomini: [{ id: 201, nome: 'Dario', appartamento: 'Int. 3', edificioId: 1 }], spese: [], entrate: [],
        modal: { type: 'subentro', data: { id: 201, nome: 'Dario', edificioId: 1 } } });
      const salvati = {};
      app.save = (k, v) => { salvati[k] = v; };
      app.setState = (p) => app.__set('state', { ...app.__get('state'), ...p });
      const campi = { 'btn-sub-conferma': { dataset: { cond: '201' } }, 'sub-data': { value: '2027-01-01' }, 'sub-nome': { value: 'Elena' },
        'sub-email': { value: '' }, 'sub-ruolo': { value: 'lettura' }, 'sub-passa': { checked: true }, 'sub-err': { style: {} } };
      app.document.getElementById = (id) => campi[id] || null;
      assert.strictEqual(app.renderModalSubentro({ id: 201, nome: 'Dario', edificioId: 1 }).includes('btn-sub-conferma'), puo);
      app.bindSchedaSubentro();
      if (campi['btn-sub-conferma'].onclick) campi['btn-sub-conferma'].onclick();
      assert.strictEqual(!!salvati.cm_condomini, puo);
      assert.strictEqual(app.__get('state').condomini.some((c) => c.nome === 'Elena'), puo);
    });
  }
});

describe('UNIT — grafici a colonne', () => {
  const app = loadApp();
  it('asse con valori puliti, sempre con lo zero', () => {
    assert.deepStrictEqual(JSON.parse(JSON.stringify(app.grafScala(0, 3600))), { min: 0, max: 4000, tacche: [0, 1000, 2000, 3000, 4000] });
    const neg = app.grafScala(-1100, 600);
    assert.ok(neg.min <= -1100 && neg.max >= 600 && neg.tacche.includes(0), JSON.stringify(neg));
    assert.deepStrictEqual(JSON.parse(JSON.stringify(app.grafScala(0, 0).tacche)), [0, 0.25, 0.5, 0.75, 1]);
    assert.strictEqual(app.grafEuroAsse(25000), '€ 25k');
    assert.strictEqual(app.grafEuroAsse(-500), '−€ 500');
  });
  it('cassa mensile: legenda, dettaglio per mese, tabella dei valori; previsioni in tinta chiara', () => {
    const mesi = ['Gen', 'Feb'].map((mese, m) => ({ mese, incassi: 500 * (m + 1), incPrevis: 200, cons: 300, prevForecast: 0, isCurrent: m === 1 }));
    const html = app.graficoCassaMensile(mesi, { titolo: 'Andamento <prova>' });
    assert.match(html, /Andamento &lt;prova&gt;/);
    assert.strictEqual((html.match(/class="graf-gruppo/g) || []).length, 2);
    assert.match(html, /graf-gruppo oggi/);
    for (const v of ['Entrate reali', 'Entrate previste', 'Uscite reali', 'Uscite da consuntivare']) assert.ok(html.includes(`</i>${v}</li>`), v);
    assert.match(html, /aria-label="Feb \(mese in corso\): Entrate reali € 1000,00; Entrate previste € 200,00/);
    assert.match(html, /graf-pezzo tenue/);
    assert.match(html, /<summary>Valori in tabella<\/summary>/);
    assert.ok(!/style="[^"]*height:0\.00%/.test(html), 'un valore zero non disegna pezzi');
  });
  it('valori negativi scendono sotto lo zero; una sola serie senza legenda', () => {
    const html = app.graficoBarre({ aria: 'x', legenda: [{ colore: 'red', nome: 'Cassa' }],
      gruppi: [{ etichetta: 'Gen', colonne: [[{ valore: -300, colore: 'red' }]], tip: { titolo: 'Gen', righe: [] } }] });
    assert.match(html, /graf-pezzo neg/);
    assert.ok(!html.includes('graf-legenda'));
  });
});

describe('UNIT — icone dei pulsanti e finestre dell\'app', () => {
  const app = loadApp();
  it('emoji dei pulsanti → icona: matita per modificare, cestino per eliminare', () => {
    assert.strictEqual(JSON.stringify(app.iconaPerEmoji('✏', '✏️')), JSON.stringify(['matita', 'Modifica']));
    assert.strictEqual(JSON.stringify(app.iconaPerEmoji('🗑', '🗑')), JSON.stringify(['cestino', 'Elimina', 'ico-elimina']));
    assert.strictEqual(app.iconaPerEmoji('🔁', '🔁 Subentro')[0], 'scambio');
    assert.strictEqual(app.iconaPerEmoji('📊', '📊 Esporta Excel')[0], 'foglio');
    assert.strictEqual(app.iconaPerEmoji('⏸', '⏸ Archivia')[0], 'archivio');
    assert.strictEqual(app.iconaPerEmoji('⏸', '⏸')[0], 'disabilita');
    assert.strictEqual(app.iconaPerEmoji('▶', '▶ Riabilita')[0], 'riabilita');
    assert.strictEqual(app.iconaPerEmoji('▶', '▶ Riattiva')[0], 'riattiva');
    assert.strictEqual(app.iconaPerEmoji('🏠', '🏠'), null);
  });
  it('icona SVG nascosta ai lettori di schermo', () => {
    assert.match(app.ico('cestino', 'ico-elimina'), /^<svg class="ico ico-elimina"[^>]*aria-hidden="true"/);
  });
  it('tipo di avviso dal messaggio e emoji iniziale tolta', () => {
    assert.strictEqual(app._tipoMessaggio('✅ Subentro registrato'), 'ok');
    assert.strictEqual(app._tipoMessaggio('⚠️ Salvataggio non riuscito: rete'), 'errore');
    assert.strictEqual(app._tipoMessaggio('⚠️ Attenzione al saldo'), 'attenzione');
    assert.strictEqual(app._tipoMessaggio('Nessuna spesa da esportare.'), 'info');
    assert.strictEqual(app.__get('_togliEmoji')('⚠️ Testo'), 'Testo');
  });
  it('nessuna finestrella del browser rimasta nel codice dell\'app', () => {
    const fs = require('fs'), path = require('path');
    const { appScripts } = require('./load-app');
    const usi = appScripts().filter((f) => !/dialoghi\.js$/.test(f))
      .filter((f) => /(^|[^a-zA-Z_.$-])(alert|confirm|prompt)\(/m.test(fs.readFileSync(path.join(__dirname, '..', f), 'utf8')));
    assert.deepStrictEqual(usi, []);
  });
});

describe('UNIT — tabelle millesimali', () => {
  const Y = new Date().getFullYear();
  const base = (cfg) => {
    const app = loadApp();
    app.__set('state', { ...app.__get('state'), edificioAttivo: 1, edifici: [{ id: 1, nome: 'E' }], fornitori: [],
      user: { id: 101, nome: 'Anna', isAdmin: true, canEdit: true, edificioId: 1 },
      condomini: [
        { id: 101, nome: 'Anna', appartamento: 'Int. 1', edificioId: 1 },
        { id: 102, nome: 'Bruno', appartamento: 'Int. 2', edificioId: 1 },
        { id: 103, nome: 'Carlo', appartamento: 'Piano terra', edificioId: 1 },
      ],
      spese: [
        { id: 1, data: `${Y - 1}-05-01`, categoria: 'pulizie', preventivo: '300', consuntivo: '', split: [{ id: 101, perc: 33.34 }, { id: 102, perc: 33.33 }, { id: 103, perc: 33.33 }], edificioId: 1 },
        { id: 2, data: `${Y}-02-01`, categoria: 'pulizie', preventivo: '300', consuntivo: '300', split: [{ id: 101, perc: 33.34 }, { id: 102, perc: 33.33 }, { id: 103, perc: 33.33 }], edificioId: 1 },
        { id: 3, data: `${Y}-11-01`, categoria: 'ascensore', preventivo: '1000', consuntivo: '', split: [{ id: 101, perc: 33.34 }, { id: 102, perc: 33.33 }, { id: 103, perc: 33.33 }], edificioId: 1 },
      ],
      entrate: [] });
    if (cfg) app.__get('_millesimi')[1] = cfg;
    return app;
  };
  const CFG = { attivo: true, dal: `${Y}-01-01`, categorie: { ascensore: 'asc' }, tabelle: [
    { id: 'generale', nome: 'Generale', valori: { 'int. 1': 400, 'int. 2': 350, 'piano terra': 250 } },
    { id: 'asc', nome: 'Ascensore', valori: { 'int. 1': 600, 'int. 2': 400, 'piano terra': 0 } },
  ] };

  it('percentuali da pesi: proporzionali e sempre 100,00 esatto', () => {
    const app = base();
    const p = app.percDaPesi([1, 1, 1]);
    assert.strictEqual(Math.round(p.reduce((a, b) => a + b, 0) * 100), 10000);
    assert.strictEqual(JSON.stringify(app.percDaPesi([400, 350, 250])), JSON.stringify([40, 35, 25]));
    assert.strictEqual(JSON.stringify(app.percDaPesi([0, 0])), JSON.stringify([0, 0]));
  });

  it('condominio senza millesimi: nessuna proposta e nessun calcolo diverso', () => {
    const app = base(null);
    assert.strictEqual(app.millesimiAttiviAlla(`${Y}-06-01`), false);
    assert.strictEqual(app.millesimiDi({ appartamento: 'Int. 1', edificioId: 1 }).length, 0);
    const s = { data: `${Y}-06-01`, split: [], edificioId: 1 };
    assert.strictEqual(app.quotaSuSpesa(s, 101, 300, 3), 100);
  });

  it('proposta per la tabella della categoria; chi ha 0 non paga; nome dell\'appartamento senza maiuscole', () => {
    const app = base(CFG);
    assert.strictEqual(app.tabellaPerCategoria('ascensore'), 'asc');
    assert.strictEqual(app.tabellaPerCategoria('pulizie'), 'generale');
    const g = app.propostaMillesimi('generale', `${Y}-06-01`);
    assert.strictEqual(JSON.stringify(g.split.map((x) => x.perc)), JSON.stringify([40, 35, 25]));
    const a = app.propostaMillesimi('asc', `${Y}-06-01`);
    assert.strictEqual(JSON.stringify(a.split.map((x) => x.perc)), JSON.stringify([60, 40, 0]));
    assert.strictEqual(JSON.stringify(a.senza), JSON.stringify(['Carlo']));
  });

  it('valgono solo dalla data di attivazione', () => {
    const app = base(CFG);
    assert.strictEqual(app.millesimiAttiviAlla(`${Y - 1}-12-31`), false);
    assert.strictEqual(app.millesimiAttiviAlla(`${Y}-01-01`), true);
    assert.strictEqual(app.millesimiAttiviAlla(`${Y}-06-01`, 2), false, 'altro condominio');
  });

  it('subentro: il nuovo proprietario eredita i millesimi dell\'appartamento', () => {
    const app = base(CFG);
    const st = app.__get('state');
    app.__set('state', { ...st, condomini: [
      { ...st.condomini[0], disabled: true, dataUscita: `${Y}-07-01` },
      st.condomini[1], st.condomini[2],
      { id: 104, nome: 'Dora', appartamento: 'Int. 1', edificioId: 1, dataIngresso: `${Y}-07-01` },
    ] });
    const p = app.propostaMillesimi('generale', `${Y}-08-01`);
    assert.strictEqual(p.split.find((x) => x.id === 104).perc, 40);
    assert.ok(!p.split.some((x) => x.id === 101));
  });

  it('applica all\'anno in corso: solo spese non consuntivate del ' + Y + ', mai anni passati', () => {
    const app = base(CFG);
    const { nuove, righe } = app.calcolaApplicazioneMillesimi();
    assert.strictEqual(JSON.stringify(nuove.map((s) => s.id)), JSON.stringify([3]));
    assert.strictEqual(nuove[0].tabellaMillesimi, 'asc');
    const anna = righe.find((r) => r.nome === 'Anna');
    assert.ok(Math.abs(anna.prima - 333.4) < 0.01 && Math.abs(anna.dopo - 600) < 0.01);
  });

  it('applica (QA-CONS-021): salta le spese prima di "dal" e quelle a mano, usa la tabella della spesa, e l\'anteprima le elenca', () => {
    const app = base({ ...CFG, dal: `${Y}-06-01` });
    const st = app.__get('state');
    const eq = [{ id: 101, perc: 33.34 }, { id: 102, perc: 33.33 }, { id: 103, perc: 33.33 }];
    const sp = (id, data, extra) => ({ id, data, titolo: 'Sp' + id, categoria: 'pulizie', preventivo: '300', consuntivo: '', split: eq, edificioId: 1, ...extra });
    app.__set('state', { ...st, spese: [
      sp(10, `${Y}-03-01`),                                                            // prima di "dal"
      sp(11, `${Y}-07-01`, { categoria: 'pulizie', tabellaMillesimi: 'asc' }),         // tabella scelta nella spesa (la categoria darebbe "generale")
      sp(12, `${Y}-07-02`, { split: [{ id: 101, perc: 70 }, { id: 102, perc: 20 }, { id: 103, perc: 10 }] }), // a mano
      sp(13, `${Y}-07-03`, { split: [{ id: 101, perc: 33.34, locked: true }, { id: 102, perc: 33.33 }, { id: 103, perc: 33.33 }] }), // quota bloccata
      sp(14, `${Y}-07-04`, { split: [] }),                                             // senza ripartizione: parti uguali implicite, si applica
      sp(15, `${Y}-07-05`, { consuntivo: '300' }),                                     // consuntivata: mai
    ] });
    const r = app.calcolaApplicazioneMillesimi();
    assert.strictEqual(JSON.stringify(r.nuove.map((s) => s.id)), JSON.stringify([11, 14]));
    assert.strictEqual(r.nuove.find((s) => s.id === 11).tabellaMillesimi, 'asc');
    assert.strictEqual(r.nuove.find((s) => s.id === 11).split.find((x) => x.id === 101).perc, 60);
    assert.strictEqual(r.nuove.find((s) => s.id === 14).tabellaMillesimi, 'generale');
    const motivi = Object.fromEntries(r.saltate.map((x) => [x.spesa.id, x.motivo]));
    assert.strictEqual(JSON.stringify(motivi), JSON.stringify({ 10: 'prima-data', 12: 'a-mano', 13: 'a-mano' }));
    assert.strictEqual(r.modificate.length, 2);
    assert.ok(/Anna 33,34%/.test(r.modificate[0].prima) && /Anna 60%/.test(r.modificate[0].dopo));
    // Le spese saltate restano identiche (stesso oggetto, nessuna copia modificata).
    assert.ok(!r.nuove.some((s) => [10, 12, 13, 15].includes(s.id)));
    // L'anteprima elenca cosa cambia e cosa viene saltato, con il motivo.
    const html = app.renderModalMillesimiApplica();
    assert.ok(html.includes('mill-elenco-cambiano') && html.includes('Sp11') && html.includes('Sp14'));
    assert.ok(html.includes('mill-elenco-saltate') && html.includes('Sp10') && html.includes('Sp12') && html.includes('Sp13'));
    assert.ok(html.includes('data precedente') && html.includes('ripartizione fatta a mano'));
    assert.ok(!html.includes('Sp15'), 'le consuntivate non compaiono');
  });

  it('applica (QA-CONS-021): una ripartizione che coincide con la proposta di una tabella non è "a mano"', () => {
    const app = base(CFG);
    const st = app.__get('state');
    const gen = app.propostaMillesimi('generale', `${Y}-07-01`).split.map(({ id, perc }) => ({ id, perc }));
    app.__set('state', { ...st, spese: [{ id: 20, data: `${Y}-07-01`, titolo: 'Sp20', categoria: 'ascensore', preventivo: '100', consuntivo: '', split: gen, edificioId: 1 }] });
    const r = app.calcolaApplicazioneMillesimi();
    assert.strictEqual(r.saltate.length, 0);
    assert.strictEqual(r.nuove[0].tabellaMillesimi, 'asc');
  });

  it('rendiconto: colonna millesimi solo se in uso nell\'anno', () => {
    assert.strictEqual(base(null).datiRendiconto(Y).millesimi, null);
    const d = base(CFG).datiRendiconto(Y);
    assert.strictEqual(d.millesimi.tabella, 'Generale');
    assert.strictEqual(d.riparto.find((r) => r.nome === 'Anna').millesimi, 400);
    assert.strictEqual(base(CFG).datiRendiconto(Y - 1).millesimi, null, 'anno prima dell\'attivazione');
  });
});

describe('UNIT — appartamenti in affitto', () => {
  const Y = new Date().getFullYear();
  const base = (affitti) => {
    const app = loadApp();
    app.__set('state', { ...app.__get('state'), edificioAttivo: 1, edifici: [{ id: 1, nome: 'E' }], fornitori: [],
      user: { id: 101, nome: 'Anna', isAdmin: true, canEdit: true, edificioId: 1 },
      condomini: [{ id: 101, nome: 'Anna', appartamento: 'Int. 1', edificioId: 1 }, { id: 102, nome: 'Bruno', appartamento: 'Int. 2', edificioId: 1 }],
      spese: [
        { id: 1, data: `${Y}-03-01`, titolo: 'Pulizie', categoria: 'pulizie', tipoSpesa: 'ordinaria', consuntivo: '600', split: [{ id: 101, perc: 50 }, { id: 102, perc: 50 }], edificioId: 1 },
        { id: 2, data: `${Y}-04-01`, titolo: 'Tetto', categoria: 'tetto', tipoSpesa: 'straordinaria', consuntivo: '2000', split: [{ id: 101, perc: 50 }, { id: 102, perc: 50 }], edificioId: 1 },
        { id: 3, data: `${Y}-12-01`, titolo: 'Luce', categoria: 'luce_comuni', tipoSpesa: 'ordinaria', preventivo: '200', consuntivo: '', split: [{ id: 101, perc: 50 }, { id: 102, perc: 50 }], edificioId: 1 },
      ],
      entrate: [{ id: 10, data: `${Y}-02-01`, importo: '500', condominoId: 101, edificioId: 1 }] });
    if (affitti !== undefined) app.__get('_affitti')[1] = affitti;
    return app;
  };
  it('di base nessun appartamento è in affitto: nessun riquadro nell\'estratto', () => {
    const app = base(null);
    assert.strictEqual(app.appartamentoInAffitto('Int. 1'), false);
    assert.strictEqual(app.datiEstratto(101, Y).affitto, null);
  });
  it('in affitto: da recuperare = sole quote ordinarie; straordinarie e saldo del proprietario invariati', () => {
    const senza = base(null).datiEstratto(101, Y);
    const d = base({ appartamenti: { 'int. 1': true } }).datiEstratto(101, Y);
    assert.strictEqual(d.affitto.recuperabile, 300);
    assert.strictEqual(JSON.stringify(d.affitto.voci.map((v) => v.descrizione)), JSON.stringify(['Pulizie']));
    assert.strictEqual(d.affitto.previste, 100);
    assert.strictEqual(d.saldo, senza.saldo, 'verso il condominio paga sempre il proprietario');
    assert.strictEqual(d.quoteStr, 1000);
  });
  it('la spunta vale per l\'appartamento (anche dopo un subentro) e non per gli altri', () => {
    const app = base({ appartamenti: { 'int. 1': true } });
    assert.strictEqual(app.appartamentoInAffitto(' int. 1 '), true);
    assert.strictEqual(app.datiEstratto(102, Y).affitto, null);
  });
});

describe('UNIT — WhatsApp ai condomini (link "Apri in WhatsApp")', () => {
  const Y = new Date().getFullYear();
  const base = (user = { id: 1, nome: 'Admin', isAdmin: true, canEdit: true, edificioId: 1 }) => {
    const app = loadApp();
    app.__set('state', { ...app.__get('state'), edificioAttivo: 1, edifici: [{ id: 1, nome: 'Via Neri 20' }], fornitori: [], user,
      condomini: [
        { id: 101, nome: 'Anna Rossi', appartamento: 'Int. 1', edificioId: 1, telefono: '333 123 4567' },
        { id: 102, nome: '<b>Bruno</b>', appartamento: 'Int. 2', edificioId: 1, telefono: '0541 123456' },
        { id: 103, nome: 'Carla', appartamento: 'Int. 3', edificioId: 1, telefono: '+41 79 123 45 67', whatsappNotifiche: false },
        { id: 104, nome: 'Dario', appartamento: 'Int. 4', edificioId: 1 },
      ],
      spese: [], entrate: [{ id: 9, data: `${Y + 1}-01-15`, importo: '120', condominoId: 101, previsionale: true, edificioId: 1 }] });
    return app;
  };
  it('numero per wa.me: prefisso 39 ai cellulari italiani, fissi e testo rifiutati', () => {
    const app = base();
    assert.strictEqual(app.numeroWa('333 123 4567'), '393331234567');
    assert.strictEqual(app.numeroWa('+39 333-1234567'), '393331234567');
    assert.strictEqual(app.numeroWa('0039 3331234567'), '393331234567');
    assert.strictEqual(app.numeroWa('393331234567'), '393331234567');
    assert.strictEqual(app.numeroWa('+41 79 123 45 67'), '41791234567');
    assert.strictEqual(app.numeroWa('0541 123456'), null);
    assert.strictEqual(app.numeroWa('chiamare in ufficio'), null);
    assert.strictEqual(app.numeroWa(''), null);
  });
  it('chi non può riceverlo e perché: fisso, "Riceve WhatsApp" tolto, senza cellulare, archiviato', () => {
    const app = base();
    const st = app.__get('state');
    assert.deepStrictEqual(st.condomini.map((c) => app.motivoNoWa(c)), [null, 'numero fisso o non valido', 'non vuole WhatsApp', 'senza cellulare']);
    assert.strictEqual(app.motivoNoWa({ ...st.condomini[0], dataUscita: '2000-01-01' }), 'archiviato');
  });
  it('modello: variabili riempite, quelle sconosciute lasciate in vista, niente righe vuote in eccesso', () => {
    const app = base();
    assert.strictEqual(app.componiWa('Ciao {nome},\n\n\n\n{saldo}\n{firma} {nomee}', { nome: 'Anna', saldo: '', firma: 'L\'amm.' }), 'Ciao Anna,\n\nL\'amm. {nomee}');
    assert.strictEqual(app.linkWa('393331234567', 'Rata & saldo?'), 'https://wa.me/393331234567?text=Rata%20%26%20saldo%3F');
  });
  it('valori: primo nome, "a tutti" per il gruppo, rata e saldo nel promemoria', () => {
    const app = base();
    const anna = app.__get('state').condomini[0];
    assert.strictEqual(app.valoriWa('avviso', { titolo: 'Acqua' }, anna).nome, 'Anna');
    assert.strictEqual(app.valoriWa('avviso', {}, null).nome, 'a tutti');
    assert.strictEqual(app.valoriWa('rendiconto', app.contestoWaRendiconto(Y + 1), anna).documento, 'bilancio preventivo');
    const v = app.valoriWa('promemoria', {}, anna);
    assert.match(v.rata, /^la rata di € 120,00 prevista per il 15\/01\//);
    const testo = app.componiWa(app.__get('EVENTI_WA').promemoria.modello, v);
    assert.match(testo, /^Ciao Anna, ti ricordiamo la rata di € 120,00/);
    assert.ok(!testo.includes('{'), testo);
  });
  it('scheda: solo agli amministratori, nomi protetti, un pulsante solo per chi ha il cellulare', () => {
    const app = base();
    const html = app.renderModalWhatsApp({ evento: 'avviso', contesto: {}, titolo: 'Acqua <i>', scelti: null });
    assert.ok(html.includes('&lt;b&gt;Bruno') && !html.includes('<b>Bruno') && !html.includes('Acqua <i>'));
    assert.deepStrictEqual([...html.matchAll(/data-wa-apri="(\d+)"/g)].map((m) => m[1]), ['101']);
    assert.ok(html.includes('btn-wa-gruppo'));
    assert.ok(!app.renderModalWhatsApp({ evento: 'promemoria', contesto: {}, titolo: 'P' }).includes('btn-wa-gruppo'), 'promemoria: personale, niente gruppo');
    const membro = base({ id: 101, nome: 'Anna', edificioId: 1 });
    assert.strictEqual(membro.renderModalWhatsApp({ evento: 'avviso', contesto: {}, titolo: 'A' }), '');
    assert.strictEqual(membro.waAttivo('avviso'), false);
    assert.strictEqual(app.waAttivo('avviso'), true);
  });
  it('il cellulare finisce nei contatti, mai nel record del condomino', async () => {
    const app = base();
    const scritte = [];
    app._fb = { auth: { currentUser: { uid: 'u' } }, db: {}, doc: (_db, ...p) => ({ path: p.join('/'), id: p[p.length - 1] }),
      serverTimestamp: () => 'ORA', deleteField: () => 'TOGLI', getDoc: async () => ({ exists: () => false }),
      writeBatch: () => ({ set: (ref, data, opts) => scritte.push({ path: ref.path, data, merge: !!opts }), commit: async () => {} }) };
    app.setServerSnap('cm_condomini', []);
    await app.saveRecords('cm_condomini', [{ id: 7, nome: 'Eva', appartamento: 'Int. 5', edificioId: 1, telefono: '333 000 1111', whatsappNotifiche: false }]);
    const m = scritte.find((s) => s.path === 'buildings/1/members/7');
    const c = scritte.find((s) => s.path === 'buildings/1/contatti/7');
    assert.ok(!('telefono' in m.data) && m.data.whatsappNotifiche === false);
    assert.strictEqual(c.data.telefono, '333 000 1111');
  });
});

// Prestazioni 2026-10-21: la memoria del render (js/core/utils.js) cambia solo
// quante volte si calcola, non il risultato. Stessi numeri, bit per bit.
describe('UNIT — memoria del render: stessi risultati al centesimo', () => {
  const app = loadApp();
  let seme = 7;
  const caso = () => { seme = (seme * 1103515245 + 12345) % 2147483648; return seme / 2147483648; };
  const data = (a) => `${a}-${String(1 + Math.floor(caso() * 12)).padStart(2, '0')}-${String(1 + Math.floor(caso() * 28)).padStart(2, '0')}`;
  const condomini = Array.from({ length: 23 }, (_, i) => ({
    id: 100 + i, nome: 'C' + i, edificioId: 1, appartamento: 'Int. ' + i,
    ...(i % 7 === 3 ? { dataIngresso: data(2023) } : {}), ...(i % 9 === 5 ? { dataUscita: data(2024) } : {}),
    ...(i === 11 ? { disabled: true, disabledOn: data(2025) + 'T10:00:00' } : {}),
  }));
  const spese = Array.from({ length: 400 }, (_, i) => {
    const conSplit = i % 5 === 0;
    const quote = conSplit ? condomini.slice(0, 1 + (i % 9)) : [];
    return { id: 1000 + i, titolo: 'S' + i, edificioId: 1, data: i % 37 === 0 ? 'non-una-data' : data(2022 + (i % 4)),
      consuntivo: i % 3 ? String((caso() * 900).toFixed(2)) : '', preventivo: String((caso() * 1000).toFixed(2)),
      tipoSpesa: i % 4 ? 'ordinaria' : 'straordinaria',
      split: quote.map((c, k) => ({ id: c.id, perc: k === 0 ? 33.33 : (66.67 / Math.max(1, quote.length - 1)).toFixed(2) })) };
  });
  const entrate = Array.from({ length: 300 }, (_, i) => ({ id: 5000 + i, edificioId: 1, condominoId: 100 + (i % 23),
    data: data(2022 + (i % 4)), importo: String((caso() * 300).toFixed(2)), previsionale: i % 6 === 0 }));

  it('quote, riporti e partecipanti identici con e senza memoria', () => {
    app.__set('state', { ...app.__get('state'), condomini, spese, entrate, edificioAttivo: 1 });
    const calcola = () => condomini.map((c) => ({
      quote: spese.map((s) => app.quotaSuSpesa(s, c.id, parseFloat(s.consuntivo || s.preventivo || 0), 20)),
      riporto: app.riportoCondomino(c.id, (d) => app.annoDi(d) < 2025, 20),
      perc: spese.filter((s) => s.split.length).map((s) => app.percEffettiva(s.split, s.split[0].perc)),
    })).concat([spese.map((s) => app.condominiAllaData(s.data, 1).map((c) => c.id))]);
    const senza = calcola();
    const con = app.conMemoRender(calcola);
    assert.deepStrictEqual(con, senza);
    assert.strictEqual(app.__get('_memoRender'), null, 'la memoria si svuota alla fine del render');
  });
  it('trovaPerId restituisce il primo elemento con quell\'id, come find', () => {
    const lista = [{ id: 1, n: 'a' }, { id: 2, n: 'b' }, { id: 1, n: 'c' }];
    assert.strictEqual(app.conMemoRender(() => app.trovaPerId(lista, 1)).n, 'a');
    assert.strictEqual(app.trovaPerId(lista, 3), undefined);
  });
});

// Lotto L1 del consolidato 2026-10-24 (QA-CONS-006, 008, 019, 024). Nessun dato reale: nomi e importi di prova.
describe('UNIT — conti: totale al 100%, usciti con debito, ricerca e CSV (consolidato L1)', () => {
  const Y = new Date().getFullYear();
  const mk = (extra = {}) => {
    const app = loadApp();
    app.__set('state', { ...app.__get('state'), edificioAttivo: 1, edifici: [{ id: 1, nome: 'E' }], fornitori: [], page: 'entrate', filterAnno: Y,
      user: { id: 102, nome: 'Bruno', isAdmin: true, canEdit: true, edificioId: 1 },
      condomini: [
        { id: 101, nome: 'Anna', appartamento: 'Int. 1', edificioId: 1, disabled: true, dataUscita: `${Y - 1}-07-01` },
        { id: 102, nome: 'Bruno', appartamento: 'Int. 2', edificioId: 1 },
        { id: 103, nome: 'Carlo', appartamento: 'Int. 1', edificioId: 1, dataIngresso: `${Y - 1}-07-01` },
      ], spese: [], entrate: [], ...extra });
    return app;
  };

  // QA-CONS-006
  it('scheda spesa: una ripartizione che non fa 100% non si salva (60/60/0 e 30/0/30)', () => {
    for (const perc of [[60, 60, 0], [30, 0, 30], [0, 0, 0]]) {
      const app = mk();
      const campi = { 'm-titolo': { value: 'Tetto' }, 'm-cat': { value: 'tetto' }, 'm-tipo': { value: 'ordinaria' }, 'm-prev': { value: '' },
        'm-cons': { value: '1000' }, 'm-data': { value: `${Y}-03-01` }, 'm-err': { style: {}, textContent: '' } };
      app.document.getElementById = (id) => campi[id] || null;
      app.document.querySelectorAll = (sel) => sel === '.split-perc-inp' ? perc.map((v, i) => ({ dataset: { cid: String(101 + i) }, value: String(v) })) : [];
      app.__set('state', { ...app.__get('state'), pendingFiles: [] });
      let salvato = false;
      app.save = () => { salvato = true; };
      app.salvaSchedaSpesa({ data: null });
      assert.strictEqual(salvato, false, 'salvata una ripartizione al ' + perc.join('/'));
      assert.match(campi['m-err'].textContent, /100%/);
    }
  });
  it('scheda spesa: una ripartizione al 100% (anche 6 x 16,67) si salva', () => {
    const app = mk();
    const campi = { 'm-titolo': { value: 'Tetto' }, 'm-cat': { value: 'tetto' }, 'm-tipo': { value: 'ordinaria' }, 'm-prev': { value: '' },
      'm-cons': { value: '1000' }, 'm-data': { value: `${Y}-03-01` }, 'm-err': { style: {}, textContent: '' } };
    app.document.getElementById = (id) => campi[id] || null;
    app.document.querySelectorAll = (sel) => sel === '.split-perc-inp' ? [33.34, 33.33, 33.33].map((v, i) => ({ dataset: { cid: String(101 + i) }, value: String(v) })) : [];
    app.__set('state', { ...app.__get('state'), pendingFiles: [] });
    let salvato = false;
    app.save = () => { salvato = true; };
    app.setState = (p) => app.__set('state', { ...app.__get('state'), ...p });
    app.salvaSchedaSpesa({ data: null });
    assert.strictEqual(salvato, true);
  });

  // QA-CONS-008
  it('chi è uscito negli anni prima con un debito resta in Rendiconto e Bilancio; la somma dei saldi è la cassa', () => {
    const app = mk({ page: 'bilancio', bilancioTab: 'condomini',
      spese: [{ id: 1, data: `${Y - 1}-03-01`, consuntivo: '600', split: [], edificioId: 1 }],
      entrate: [{ id: 10, data: `${Y - 1}-04-01`, importo: '600', condominoId: 102, edificioId: 1 }] });
    const d = app.datiRendiconto(Y);
    const anna = d.riparto.find((r) => r.nome === 'Anna');
    assert.ok(anna, 'Anna (uscita prima, con debito) manca dal riparto');
    assert.ok(Math.abs(anna.saldo + 300) < 0.005, 'saldo di Anna ' + anna.saldo);
    const somma = d.riparto.reduce((a, r) => a + r.saldo, 0);
    assert.ok(Math.abs(somma - d.cassaFine) < 0.005, `somma saldi ${somma} vs cassa ${d.cassaFine}`);
    const h = app.renderBilancio();
    assert.ok(h.includes('Anna'), 'Anna manca dal Bilancio "Per condomino"');
  });
  it('chi è uscito prima e non deve nulla non compare nel riparto dell\'anno dopo', () => {
    const app = mk({ spese: [{ id: 1, data: `${Y - 1}-03-01`, consuntivo: '600', split: [], edificioId: 1 }],
      entrate: [{ id: 10, data: `${Y - 1}-04-01`, importo: '300', condominoId: 101, edificioId: 1 }, { id: 11, data: `${Y - 1}-04-02`, importo: '300', condominoId: 102, edificioId: 1 }] });
    assert.ok(!app.datiRendiconto(Y).riparto.some((r) => r.nome === 'Anna'));
  });

  // QA-CONS-019
  it('Entrate: i saldi per condomino non cambiano con la ricerca impostata', () => {
    const dati = { condomini: [{ id: 102, nome: 'Bruno', appartamento: 'Int. 2', edificioId: 1 }],
      spese: [{ id: 1, data: `${Y}-02-01`, consuntivo: '1000', split: [{ id: 102, perc: 100 }], edificioId: 1 }],
      entrate: [{ id: 1, data: `${Y}-03-01`, importo: '800', descrizione: 'contanti', condominoId: 102, edificioId: 1 },
        { id: 2, data: `${Y}-04-01`, importo: '400', descrizione: 'bonifico', condominoId: 102, edificioId: 1 }] };
    const senza = mk({ ...dati, searchQ: '' }).renderEntrate();
    assert.ok(senza.includes('200,00'), 'versato 1.200 - quota 1.000');
    for (const q of ['bonifico', 'luce', 'zzz']) {
      const h = mk({ ...dati, searchQ: q }).renderEntrate();
      assert.ok(h.includes('1.200,00') || h.includes('1200,00'), 'versato alterato con ricerca "' + q + '"');
      assert.ok(h.includes('200,00'), 'saldo alterato con ricerca "' + q + '"');
    }
  });

  // QA-CONS-024
  it('CSV spese: chi è uscito ma ha una quota ha la sua colonna e la somma delle quote è l\'importo', () => {
    const app = mk();
    const s = { id: 1, data: `${Y}-02-01`, titolo: 'Luce', categoria: 'luce', consuntivo: '300', edificioId: 1,
      split: [{ id: 101, perc: 40 }, { id: 102, perc: 30 }, { id: 103, perc: 30 }] };
    app.esportaSpeseCSV([s], 't.csv');
    const righe = app.__downloads.find((d) => d.blob).blob.text.replace(/^﻿/, '').split('\r\n');
    const intest = righe[0].split(';'), riga = righe[1].split(';');
    assert.ok(intest.includes('Anna'), 'manca la colonna di chi è uscito');
    const somma = riga.slice(9).reduce((a, v) => a + (parseFloat(v.replace(',', '.')) || 0), 0);
    assert.ok(Math.abs(somma - 300) < 0.005, 'somma colonne ' + somma);
  });
  it('CSV spese: un archiviato senza quote non ha colonna', () => {
    const app = mk();
    app.esportaSpeseCSV([{ id: 1, data: `${Y}-02-01`, titolo: 'Luce', categoria: 'luce', consuntivo: '300', edificioId: 1, split: [{ id: 102, perc: 50 }, { id: 103, perc: 50 }] }], 't.csv');
    assert.ok(!app.__downloads.find((d) => d.blob).blob.text.split('\r\n')[0].includes('Anna'));
  });
});

// D4 deciso: la spesa segue la data (QA-CONS-005 e colonna Quota di QA-CONS-024). Nomi e importi di prova.
describe('UNIT — spesa che segue la data: righe della scheda, aggiunta a mano, colonna Quota (consolidato L1, D4)', () => {
  const Y = new Date().getFullYear();
  const P = Y - 1;
  const mk = (user) => {
    const app = loadApp();
    app.__set('state', { ...app.__get('state'), edificioAttivo: 1, edifici: [{ id: 1, nome: 'E' }], fornitori: [],
      user: user || { id: 102, nome: 'Bruno', isAdmin: true, canEdit: true, edificioId: 1 },
      condomini: [
        { id: 101, nome: 'Anna', appartamento: 'Int. 1', edificioId: 1, disabled: true, dataUscita: `${P}-07-01` },
        { id: 102, nome: 'Bruno', appartamento: 'Int. 2', edificioId: 1 },
        { id: 103, nome: 'Carlo', appartamento: 'Int. 1', edificioId: 1, dataIngresso: `${P}-07-01` },
        { id: 104, nome: 'Dora', appartamento: 'Int. 3', edificioId: 1 },
      ], spese: [], entrate: [] });
    return app;
  };
  const righe = (h) => [...h.matchAll(/<tr data-base="(\d)">[\s\S]*?class="split-perc-inp" data-cid="(\d+)" value="([\d.]+)"/g)].map((m) => ({ id: +m[2], base: m[1] === '1', perc: +m[3] }));

  it('spesa nuova con data anteriore al subentro: righe Anna, Bruno, Dora (non Carlo), totale 100%', () => {
    const r = righe(mk().renderModalSpesa({ data: `${P}-03-01` }));
    assert.deepStrictEqual(r.map((x) => x.id).sort(), [101, 102, 104]);
    assert.ok(r.every((x) => x.base));
    assert.ok(Math.abs(r.reduce((a, x) => a + x.perc, 0) - 100) < 0.005);
  });
  it('spesa nuova con data di oggi: chi abita oggi (Bruno, Carlo, Dora)', () => {
    const r = righe(mk().renderModalSpesa(null));
    assert.deepStrictEqual(r.map((x) => x.id).sort(), [102, 103, 104]);
  });
  it('chi non ha riga si può aggiungere a mano (select); le righe segnano la data per il ricalcolo', () => {
    const h = mk().renderModalSpesa({ data: `${P}-03-01` });
    assert.match(h, /id="split-aggiungi"[^>]*>\s*<option value="103">/);
    assert.ok(h.includes('id="split-aggiungi-btn"') && h.includes('data-segue-data="1"'));
  });
  it('spesa già salvata: righe e quote salvate non cambiano (chi è uscito con quota resta, Carlo parte da zero)', () => {
    const h = mk().renderModalSpesa({ id: 7, data: `${Y}-02-01`, consuntivo: '300', split: [{ id: 101, perc: 40 }, { id: 102, perc: 30 }, { id: 104, perc: 30 }] });
    const r = righe(h);
    assert.strictEqual(r.find((x) => x.id === 101).perc, 40);
    assert.strictEqual(r.find((x) => x.id === 101).base, false);
    assert.strictEqual(r.find((x) => x.id === 103).perc, 0);
    assert.ok(h.includes('data-segue-data="0"'));
  });

  it('cambio data: le righe seguono la data e le quote bloccate a mano non si perdono', () => {
    const app = mk();
    // Prima: oggi (Bruno, Carlo, Dora) con Carlo bloccato al 50%; poi data anteriore al subentro.
    const prima = [{ id: 102, base: true, perc: 25, locked: false }, { id: 103, base: true, perc: 50, locked: true }, { id: 104, base: true, perc: 25, locked: false }];
    const dopo = app.righeSplitPerData(prima, [101, 102, 104]);
    const carlo = dopo.find((x) => x.id === 103);
    assert.ok(carlo && !carlo.base && carlo.perc === 50, 'la quota scritta a mano di Carlo è sparita');
    assert.ok(dopo.find((x) => x.id === 101 && x.base), 'Anna non è entrata');
    assert.ok(Math.abs(dopo.reduce((a, x) => a + x.perc, 0) - 100) < 0.005);
    // Senza quote bloccate: parti uguali tra chi abitava alla data, Carlo esce.
    const libere = app.righeSplitPerData(prima.map((x) => ({ ...x, locked: false })), [101, 102, 104]);
    assert.deepStrictEqual(Array.from(libere.map((x) => x.id).sort()), [101, 102, 104]);
    assert.ok(Math.abs(libere.reduce((a, x) => a + x.perc, 0) - 100) < 0.005 && libere.every((x) => x.perc > 33 && x.perc < 34));
  });
  it('riga aggiunta a mano (uscito): resta con la sua quota al cambio data e le altre si ridividono il residuo', () => {
    const app = mk();
    const prima = [{ id: 102, base: true, perc: 40, locked: false }, { id: 104, base: true, perc: 40, locked: false }, { id: 101, base: false, perc: 20, locked: true }];
    const dopo = app.righeSplitPerData(prima, [102, 103, 104]);
    assert.strictEqual(dopo.find((x) => x.id === 101).perc, 20);
    assert.ok(Math.abs(dopo.reduce((a, x) => a + x.perc, 0) - 100) < 0.005);
    assert.ok(dopo.filter((x) => x.base).every((x) => Math.abs(x.perc - 80 / 3) < 0.02));
  });

  it('colonna Quota: la spesa consuntivata dopo l\'uscita con la quota di Anna la mostra, come Bilancio e CSV', () => {
    const spesa = { id: 1, data: `${Y}-02-01`, consuntivo: '300', edificioId: 1, split: [{ id: 101, perc: 40 }, { id: 102, perc: 30 }, { id: 104, perc: 30 }] };
    const anna = mk({ id: 101, nome: 'Anna', isAdmin: false, canEdit: false, edificioId: 1 });
    assert.ok(anna.renderQuotaCell(spesa).includes('120,00'), anna.renderQuotaCell(spesa));
    assert.ok(anna.renderQuotaCellText(spesa).includes('120,00'));
    assert.strictEqual(anna.quotaSuSpesa(spesa, 101, 300, 3), 120);
    const admin = mk();
    assert.ok(admin.renderQuotaCell(spesa).includes('3 cond.') || admin.renderQuotaCell(spesa).includes('Split personalizzato'));
    // Carlo non ha quota nella ripartizione: "—", come quotaSuSpesa (0).
    const carlo = mk({ id: 103, nome: 'Carlo', isAdmin: false, canEdit: false, edificioId: 1 });
    assert.ok(carlo.renderQuotaCell(spesa).includes('—') && carlo.quotaSuSpesa(spesa, 103, 300, 3) === 0);
  });
});

// Retest avversario-regole 2026-10-24 (ADV-FUNC-001 ricorrenze e spese salvate, 027, 028, 029, 030). Nomi e importi di prova.
describe('UNIT — retest regole: ricorrenze, quote fuori scala, lucchetti, spese legacy, Entrate (ADV-FUNC-001/027/028/029/030)', () => {
  const Y = new Date().getFullYear();
  const mk = (user, extra = {}) => {
    const app = loadApp();
    app.__set('state', { ...app.__get('state'), edificioAttivo: 1, edifici: [{ id: 1, nome: 'E' }], fornitori: [], pendingFiles: [],
      user: user || { id: 102, nome: 'Bruno', isAdmin: true, canEdit: true, edificioId: 1 },
      condomini: [
        { id: 101, nome: 'Anna', appartamento: 'Int. 1', edificioId: 1, disabled: true, dataUscita: `${Y}-07-01` },
        { id: 102, nome: 'Bruno', appartamento: 'Int. 2', edificioId: 1 },
        { id: 103, nome: 'Carlo', appartamento: 'Int. 1', edificioId: 1, dataIngresso: `${Y}-07-01` },
        { id: 104, nome: 'Dora', appartamento: 'Int. 3', edificioId: 1 },
      ], spese: [], entrate: [], ...extra });
    return app;
  };
  const somma = (split) => split.reduce((a, x) => a + x.perc, 0);
  const perc = (split, id) => split.find((x) => x.id === id)?.perc || 0;
  const splitBase = [{ id: 101, perc: 33.34, locked: false }, { id: 102, perc: 33.33, locked: false }, { id: 104, perc: 33.33, locked: false }];

  // ADV-FUNC-001, residuo A: ricorrenze
  it('serie che attraversa un subentro: da luglio la quota di Anna è di Carlo, prima resta ad Anna; totale sempre 100%', () => {
    const app = mk();
    const occ = app.generaOccorrenze({ data: `${Y}-01-15`, frequenza: 'mensile', ricorrente: true, preventivo: '90', edificioId: 1, split: splitBase }, `${Y}-12-31`);
    assert.ok(occ.length >= 10);
    for (const o of occ) {
      assert.ok(Math.abs(somma(o.split) - 100) < 0.005, o.data + ' totale ' + somma(o.split));
      if (o.data < `${Y}-07-01`) { assert.strictEqual(perc(o.split, 101), 33.34, o.data); assert.strictEqual(perc(o.split, 103), 0, o.data); }
      else { assert.strictEqual(perc(o.split, 101), 0, o.data); assert.strictEqual(perc(o.split, 103), 33.34, o.data); }
    }
  });
  it('serie: chi esce senza un subentrante nello stesso appartamento non riceve quote; si ridistribuisce tra chi abita', () => {
    const app = mk(null, { condomini: [
      { id: 101, nome: 'Anna', appartamento: 'Int. 1', edificioId: 1, disabled: true, dataUscita: `${Y}-07-01` },
      { id: 102, nome: 'Bruno', appartamento: 'Int. 2', edificioId: 1 },
      { id: 104, nome: 'Dora', appartamento: 'Int. 3', edificioId: 1 }] });
    const occ = app.generaOccorrenze({ data: `${Y}-01-15`, frequenza: 'mensile', ricorrente: true, preventivo: '90', edificioId: 1, split: splitBase }, `${Y}-12-31`);
    const dopo = occ.filter((o) => o.data >= `${Y}-07-01`);
    assert.ok(dopo.length >= 5);
    for (const o of dopo) {
      assert.strictEqual(perc(o.split, 101), 0);
      assert.ok(Math.abs(somma(o.split) - 100) < 0.005);
      assert.ok(Math.abs(perc(o.split, 102) - 50) < 0.02 && Math.abs(perc(o.split, 104) - 50) < 0.02, JSON.stringify(o.split));
    }
  });
  it('"Applica anche alle successive": le occorrenze dopo il subentro danno la quota a Carlo, non ad Anna', () => {
    const base = { titolo: 'Pulizie', categoria: 'pulizie', tipoSpesa: 'ordinaria', preventivo: '90', consuntivo: '', edificioId: 1, ricorrente: true, frequenza: 'mensile', ricorrenzaFine: `${Y}-12-31`, ricGruppoId: 'g1', allegati: [] };
    const spese = [{ ...base, id: 1, data: `${Y}-06-15`, split: splitBase },
      { ...base, id: 2, data: `${Y}-07-15`, split: splitBase }, { ...base, id: 3, data: `${Y}-08-15`, split: splitBase }, { ...base, id: 4, data: `${Y}-05-15`, split: splitBase }];
    const app = mk(null, { spese });
    const campi = { 'm-titolo': { value: 'Pulizie' }, 'm-cat': { value: 'pulizie' }, 'm-tipo': { value: 'ordinaria' }, 'm-prev': { value: '90' }, 'm-cons': { value: '' },
      'm-data': { value: `${Y}-06-15` }, 'm-err': { style: {}, textContent: '' }, 'm-ricorrente': { checked: true }, 'm-freq': { value: 'mensile' }, 'm-freq-fine': { value: `${Y}-12-31` },
      'm-serie-applica': { checked: true } };
    app.document.getElementById = (id) => campi[id] || null;
    app.document.querySelectorAll = (sel) => sel === '.split-perc-inp' ? [[101, 33.34], [102, 33.33], [104, 33.33]].map(([id, v]) => ({ dataset: { cid: String(id) }, value: String(v) })) : [];
    app.setState = (p) => app.__set('state', { ...app.__get('state'), ...p });
    let salvate = null;
    app.save = (k, v) => { salvate = v; };
    app.salvaSchedaSpesa({ data: spese[0] });
    assert.ok(salvate, 'non salvata');
    for (const id of [2, 3]) {
      const s = salvate.find((x) => x.id === id);
      assert.strictEqual(perc(s.split, 101), 0, 'Anna ha ancora una quota il ' + s.data);
      assert.strictEqual(perc(s.split, 103), 33.34, 'Carlo senza la quota il ' + s.data);
      assert.ok(Math.abs(somma(s.split) - 100) < 0.005);
    }
    assert.strictEqual(perc(salvate.find((x) => x.id === 1).split, 101), 33.34, 'la spesa modificata resta com\'è');
    assert.strictEqual(perc(salvate.find((x) => x.id === 4).split, 101), 33.34, 'le precedenti non si toccano');
  });

  // ADV-FUNC-031: serie che riparte da un'occorrenza già dopo il subentro (subentro registrato in ritardo)
  it('serie da un\'occorrenza dopo il subentro con la quota residua di Anna: resta a Carlo, non va a Bruno e Dora', () => {
    const app = mk();
    const splitDopo = [{ id: 101, perc: 33.34, locked: false }, { id: 102, perc: 33.33, locked: false }, { id: 103, perc: 0, locked: false }, { id: 104, perc: 33.33, locked: false }];
    const occ = app.generaOccorrenze({ data: `${Y}-07-15`, frequenza: 'mensile', ricorrente: true, preventivo: '90', edificioId: 1, split: splitDopo }, `${Y}-12-31`);
    assert.ok(occ.length >= 5);
    for (const o of occ) {
      assert.strictEqual(perc(o.split, 101), 0, o.data);
      assert.strictEqual(perc(o.split, 103), 33.34, 'Carlo ' + o.data);
      assert.strictEqual(perc(o.split, 102), 33.33, 'Bruno ' + o.data);
      assert.strictEqual(perc(o.split, 104), 33.33, 'Dora ' + o.data);
    }
    // Comproprietario che ha già la sua quota: non è un subentrante, la quota di chi esce si ridistribuisce come prima.
    const comp = mk(null, { condomini: [
      { id: 101, nome: 'Anna', appartamento: 'Int. 1', edificioId: 1, disabled: true, dataUscita: `${Y}-07-01` },
      { id: 102, nome: 'Bruno', appartamento: 'Int. 1', edificioId: 1 },
      { id: 104, nome: 'Dora', appartamento: 'Int. 3', edificioId: 1 }] });
    const s = comp.splitPerOccorrenza([{ id: 101, perc: 50 }, { id: 102, perc: 25 }, { id: 104, perc: 25 }], `${Y}-08-15`, `${Y}-06-15`, 1);
    assert.ok(Math.abs(somma(s) - 100) < 0.005 && perc(s, 101) === 0 && Math.abs(perc(s, 102) - 50) < 0.02, JSON.stringify(s));
  });

  // ADV-FUNC-001, residuo B: spesa già salvata, gruppo di base = chi abitava alla data
  it('spesa salvata di giugno: Carlo (entrato a luglio) non ha riga ed è tra gli aggiungibili; Anna è di base', () => {
    const h = mk().renderModalSpesa({ id: 9, data: `${Y}-06-20`, consuntivo: '300', split: splitBase });
    const r = [...h.matchAll(/<tr data-base="(\d)">[\s\S]*?class="split-perc-inp" data-cid="(\d+)"/g)].map((m) => ({ id: +m[2], base: m[1] === '1' }));
    assert.deepStrictEqual(r.map((x) => x.id).sort(), [101, 102, 104]);
    assert.ok(r.every((x) => x.base), 'chi abitava alla data deve essere di base');
    assert.match(h, /id="split-aggiungi"[^>]*>\s*<option value="103">/);
    assert.ok(h.includes('data-segue-data="0"') && h.includes(`data-data-originale="${Y}-06-20"`) && h.includes('id="split-data-avviso"'));
  });
  it('spesa salvata con una quota a chi non abitava alla data: la riga c\'è ma è fuori base', () => {
    const h = mk().renderModalSpesa({ id: 9, data: `${Y}-06-20`, consuntivo: '300', split: [{ id: 102, perc: 50 }, { id: 103, perc: 50 }] });
    assert.match(h, /<tr data-base="0">[\s\S]*?data-cid="103"/);
  });

  // ADV-FUNC-027
  it('scheda spesa: una quota negativa o sopra il 100% non si salva anche se il totale fa 100%; 100/0/0 sì', () => {
    const prova = (percs) => {
      const app = mk();
      const campi = { 'm-titolo': { value: 'Tetto' }, 'm-cat': { value: 'tetto' }, 'm-tipo': { value: 'ordinaria' }, 'm-prev': { value: '' },
        'm-cons': { value: '1000' }, 'm-data': { value: `${Y}-03-01` }, 'm-err': { style: {}, textContent: '' } };
      app.document.getElementById = (id) => campi[id] || null;
      app.document.querySelectorAll = (sel) => sel === '.split-perc-inp' ? percs.map((v, i) => ({ dataset: { cid: String(101 + i) }, value: String(v) })) : [];
      app.setState = (p) => app.__set('state', { ...app.__get('state'), ...p });
      let salvato = false;
      app.save = () => { salvato = true; };
      app.salvaSchedaSpesa({ data: null });
      return { salvato, err: campi['m-err'].textContent };
    };
    for (const p of [[120, -20, 0], [150, -50, 0], [-10, 110, 0]]) {
      const r = prova(p);
      assert.strictEqual(r.salvato, false, 'salvata ' + p.join('/'));
      assert.match(r.err, /tra 0% e 100%/);
    }
    assert.strictEqual(prova([100, 0, 0]).salvato, true);
    assert.strictEqual(prova([33.34, 33.33, 33.33]).salvato, true);
  });

  // ADV-FUNC-028 (parte pura; il percorso reale è nell'E2E "cambio data")
  it('le righe disegnate con una quota bloccata portano data-locked="1" (il lucchetto vale, non è solo disegnato)', () => {
    const app = mk();
    const c = { id: 102, nome: 'Bruno', appartamento: 'Int. 2', color: '#3B82F6' };
    const bloccata = app.htmlRigaSplit(c, { id: 102, perc: 25, locked: true }, true, 100);
    const libera = app.htmlRigaSplit(c, { id: 102, perc: 25, locked: false }, true, 100);
    assert.ok(bloccata.includes('data-locked="1"') && bloccata.includes('split-lock-btn locked'));
    assert.ok(libera.includes('data-locked="0"') && !libera.includes('split-lock-btn locked'));
  });

  // ADV-FUNC-029: spese senza ripartizione
  describe('spese senza ripartizione (legacy) prima del subentro', () => {
    const legacy = { id: 5, data: `${Y}-03-01`, titolo: 'Luce', categoria: 'luce', consuntivo: '300', edificioId: 1 };
    it('colonna Quota: chi non abitava alla data vede "—", chi abitava la sua parte (come quotaSuSpesa)', () => {
      const carlo = mk({ id: 103, nome: 'Carlo', isAdmin: false, canEdit: false, edificioId: 1 });
      assert.ok(carlo.renderQuotaCell(legacy).includes('—'));
      assert.strictEqual(carlo.renderQuotaCellText(legacy), '');
      assert.strictEqual(carlo.quotaSuSpesa(legacy, 103, 300, 3), 0);
      const anna = mk({ id: 101, nome: 'Anna', isAdmin: false, canEdit: false, edificioId: 1 });
      assert.ok(anna.renderQuotaCell(legacy).includes('100,00') && anna.renderQuotaCellText(legacy).includes('100,00'));
      assert.strictEqual(anna.quotaSuSpesa(legacy, 101, 300, 3), 100);
    });
    it('CSV: Anna (uscita) ha la colonna, Carlo ha la cella vuota e la riga somma l\'importo', () => {
      const app = mk();
      app.esportaSpeseCSV([legacy], 't.csv');
      const righe = app.__downloads.find((d) => d.blob).blob.text.replace(/^﻿/, '').split('\r\n');
      const intest = righe[0].split(';'), riga = righe[1].split(';');
      assert.ok(intest.includes('Anna'), 'manca la colonna di Anna');
      assert.strictEqual(riga[intest.indexOf('Carlo')], '');
      const tot = riga.slice(9).reduce((a, v) => a + (parseFloat(v.replace(',', '.')) || 0), 0);
      assert.ok(Math.abs(tot - 300) < 0.005, 'somma colonne ' + tot);
    });
  });

  // ADV-FUNC-030
  describe('Entrate: stato versamenti per condomino', () => {
    const dati = { filterAnni: [Y], page: 'entrate',
      condomini: [
        { id: 101, nome: 'Anna', appartamento: 'Int. 1', edificioId: 1, disabled: true, dataUscita: `${Y - 1}-07-01` },
        { id: 102, nome: 'Bruno', appartamento: 'Int. 2', edificioId: 1 },
        { id: 103, nome: 'Carlo', appartamento: 'Int. 1', edificioId: 1, dataIngresso: `${Y - 1}-07-01` }],
      spese: [{ id: 1, data: `${Y - 1}-03-01`, consuntivo: '600', split: [], edificioId: 1 }],
      entrate: [{ id: 10, data: `${Y - 1}-04-01`, importo: '600', condominoId: 102, edificioId: 1 }] };
    it('chi è uscito negli anni prima con un debito compare, con il saldo del Bilancio (-300,00)', () => {
      const h = mk(null, dati).renderEntrate();
      assert.ok(h.includes('Anna'), 'Anna manca dallo stato versamenti');
      assert.ok(h.includes('300,00'));
    });
    it('chi è uscito prima senza debito non compare', () => {
      const h = mk(null, { ...dati, entrate: [...dati.entrate, { id: 11, data: `${Y - 1}-04-02`, importo: '300', condominoId: 101, edificioId: 1 }] }).renderEntrate();
      assert.ok(!h.includes('>Anna<'), 'Anna senza debito non deve comparire');
    });
    it('anno scelto: chi è uscito prima, senza riporto, ma ha una quota aggiunta a mano su una spesa dell\'anno compare (-50,00)', () => {
      const h = mk(null, { ...dati,
        entrate: [...dati.entrate, { id: 11, data: `${Y - 1}-04-02`, importo: '300', condominoId: 101, edificioId: 1 }],
        spese: [...dati.spese, { id: 2, data: `${Y}-01-15`, consuntivo: '500', edificioId: 1, split: [{ id: 101, perc: 10 }, { id: 102, perc: 90 }] }] }).renderEntrate();
      assert.ok(h.includes('Anna'), 'Anna manca');
      assert.ok(h.includes('50,00'));
    });
    it('"Tutti gli anni": compare anche chi è uscito e non ha mai versato ma ha una quota', () => {
      const h = mk(null, { ...dati, filterAnni: [] }).renderEntrate();
      assert.ok(h.includes('Anna'));
    });
  });
});

// Consolidato L2 (2026-10-24): salvataggi in coda dopo un rifiuto, subentro e svuotamento
// che annunciano il successo solo dopo la conferma (QA-CONS-004, QA-CONS-003).
describe('UNIT — salvataggi: coda dopo un rifiuto, subentro e reset a conferma avvenuta (consolidato L2)', () => {
  const offline = async () => { const e = new Error('offline'); e.code = 'unavailable'; throw e; };
  it('QA-CONS-004: un salvataggio fallito con altri in coda non riporta indietro lo schermo e il successivo non annulla né cancella', async () => {
    const app = loadApp();
    app.render = () => {}; // niente pagina in questa sandbox
    const scritte = [];
    let chiamate = 0;
    const snapVer = { exists: () => true, data: () => ({ _updatedAt: { toMillis: () => 1 } }) };
    app._fb = { auth: { currentUser: { uid: 'u' } }, db: {}, doc: (_db, ...p) => ({ path: p.join('/'), id: p[p.length - 1] }),
      serverTimestamp: () => 'ORA', deleteField: () => 'TOGLI',
      // il primo controllo di versione fallisce (rete), i successivi riescono
      getDoc: async () => { if (++chiamate === 1) return offline(); return snapVer; },
      writeBatch: () => ({ set: (ref, data, opts) => scritte.push({ path: ref.path, data, merge: !!opts }), commit: async () => {} }) };
    const X0 = { id: 1, titolo: 'Luce', preventivo: '100', edificioId: 1 };
    const Y0 = { id: 2, titolo: 'Acqua', preventivo: '50', edificioId: 1 };
    const X1 = { ...X0, preventivo: '120' };
    const N = { id: 3, titolo: 'Nuova', preventivo: '10', edificioId: 1 };
    app.__set('state', { ...app.__get('state'), edificioAttivo: 1, spese: [X0, Y0] });
    app.setServerSnap('cm_spese', [X0, Y0]);
    app.__get('_versioni').cm_spese = new Map([['buildings/1/expenses/1', 1], ['buildings/1/expenses/2', 1]]);
    // l'utente modifica X (salvataggio 1) e subito aggiunge N (salvataggio 2, che contiene anche X1)
    app.__set('state', { ...app.__get('state'), spese: [X1, Y0] });
    const p1 = app.fbSaveKey('cm_spese', [X1, Y0]);
    app.__set('state', { ...app.__get('state'), spese: [X1, Y0, N] });
    const p2 = app.fbSaveKey('cm_spese', [X1, Y0, N]);
    assert.deepStrictEqual([await p1, await p2], [false, true]);
    assert.deepStrictEqual(app.__get('state').spese.map((s) => s.id), [1, 2, 3], 'lo schermo è stato riportato indietro');
    assert.strictEqual(app.__get('state').spese[0].preventivo, '120');
    // terza operazione: modifica di Y, partendo da ciò che si vede
    scritte.length = 0;
    const attuali = app.__get('state').spese.map((s) => (s.id === 2 ? { ...s, preventivo: '60' } : s));
    assert.strictEqual(await app.fbSaveKey('cm_spese', attuali), true);
    assert.deepStrictEqual(scritte.map((s) => s.path), ['buildings/1/expenses/2'], 'il terzo salvataggio ha toccato altri record');
    assert.ok(!scritte.some((s) => s.data._deleted === true), 'record cancellato');
  });
  it('QA-CONS-004: se anche l\'ultimo salvataggio della coda fallisce, si torna all\'ultimo stato confermato', async () => {
    const app = loadApp();
    app.render = () => {};
    app._fb = { auth: { currentUser: { uid: 'u' } }, db: {}, doc: (_db, ...p) => ({ path: p.join('/'), id: p[p.length - 1] }),
      serverTimestamp: () => 'ORA', deleteField: () => 'TOGLI', getDoc: offline, writeBatch: () => ({ set() {}, commit: async () => {} }) };
    const X0 = { id: 1, titolo: 'Luce', preventivo: '100', edificioId: 1 };
    app.__set('state', { ...app.__get('state'), edificioAttivo: 1, spese: [{ ...X0, preventivo: '120' }] });
    app.setServerSnap('cm_spese', [X0]);
    app.__get('_versioni').cm_spese = new Map([['buildings/1/expenses/1', 1]]);
    const p1 = app.fbSaveKey('cm_spese', [{ ...X0, preventivo: '120' }]);
    const p2 = app.fbSaveKey('cm_spese', [{ ...X0, preventivo: '130' }]);
    assert.deepStrictEqual([await p1, await p2], [false, false]);
    assert.strictEqual(app.__get('state').spese[0].preventivo, '100');
  });

  const subentro = (esiti) => {
    const app = loadApp();
    const Y = new Date().getFullYear() + 1;
    app.__set('state', { ...app.__get('state'), edificioAttivo: 1, user: { id: 102, isAdmin: true, canEdit: true, edificioId: 1 },
      condomini: [{ id: 201, nome: 'Dario', appartamento: 'Int. 3', edificioId: 1 }],
      spese: [{ id: 5, data: Y + '-03-01', titolo: 'Tetto', preventivo: '1000', consuntivo: '', edificioId: 1, split: [{ id: 201, perc: 100 }] }],
      entrate: [], modal: { type: 'subentro', data: { id: 201, nome: 'Dario', edificioId: 1 } } });
    const salvati = [];
    app.save = (k) => { salvati.push(k); return Promise.resolve(esiti[k]); };
    app.setState = (p) => app.__set('state', { ...app.__get('state'), ...p });
    const campi = { 'btn-sub-conferma': { dataset: { cond: '201' } }, 'sub-data': { value: Y + '-01-01' }, 'sub-nome': { value: 'Elena' },
      'sub-email': { value: '' }, 'sub-ruolo': { value: 'lettura' }, 'sub-passa': { checked: true }, 'sub-err': { style: {} } };
    app.document.getElementById = (id) => campi[id] || null;
    app.bindSchedaSubentro();
    return { app, salvati, clic: () => campi['btn-sub-conferma'].onclick() };
  };
  it('QA-CONS-003: se il salvataggio dei condomini è rifiutato, le quote delle spese non vengono salvate e non si annuncia il successo', async () => {
    const { app, salvati, clic } = subentro({ cm_condomini: false, cm_spese: true });
    await clic();
    assert.deepStrictEqual(salvati, ['cm_condomini']);
    assert.ok(!app.__alerts.some((m) => /Subentro registrato/.test(m)), app.__alerts.join('|'));
    assert.strictEqual(app.__get('state').spese[0].split.length, 1, 'quote passate a un condomino non salvato');
  });
  it('QA-CONS-003: subentro riuscito: prima i condomini, poi le spese, successo annunciato alla fine; spese rifiutate: avviso onesto', async () => {
    const ok = subentro({ cm_condomini: true, cm_spese: true });
    await ok.clic();
    assert.deepStrictEqual(ok.salvati, ['cm_condomini', 'cm_spese']);
    assert.ok(ok.app.__alerts.some((m) => /^✅ Subentro registrato/.test(m)));
    const ko = subentro({ cm_condomini: true, cm_spese: false });
    await ko.clic();
    assert.ok(!ko.app.__alerts.some((m) => /^✅ Subentro registrato/.test(m)));
    assert.ok(ko.app.__alerts.some((m) => /NON sono passate/.test(m)), ko.app.__alerts.join('|'));
  });
  it('QA-CONS-003: lo svuotamento dei dati dell\'edificio annuncia il successo solo se ogni sezione è confermata', async () => {
    for (const [rifiutata, atteso] of [[null, /^✅ Dati di/], ['cm_entrate', /NON completo: entrate/]]) {
      const app = loadApp();
      app.__set('state', { ...app.__get('state'), edificioAttivo: 1, edifici: [{ id: 1, nome: 'Casa' }], user: { id: 900, superAdmin: true },
        spese: [{ id: 1, edificioId: 1 }], entrate: [{ id: 2, edificioId: 1 }], fornitori: [], bacheca: [], verbali: [], lavori: [], delibere: [] });
      app.save = (k) => Promise.resolve(k !== rifiutata);
      app.setState = (p) => app.__set('state', { ...app.__get('state'), ...p });
      app.chiedi = async () => true;
      app.chiediTesto = async () => 'RESET';
      const bottoni = { 'btn-reset': {} };
      app.document.getElementById = (id) => bottoni[id] || null;
      app.document.querySelectorAll = () => [];
      app.bindAzioniImpostazioni();
      await bottoni['btn-reset'].onclick();
      assert.ok(app.__alerts.some((m) => atteso.test(m)), (rifiutata || 'tutte ok') + ': ' + app.__alerts.join('|'));
      if (rifiutata) assert.ok(!app.__alerts.some((m) => /^✅ Dati di/.test(m)));
    }
  });
});

describe('UNIT — riparazione D1: la quota di chi è uscito resta a lui (QA-CONS-007, QA-CONS-026)', () => {
  const Y = new Date().getFullYear();
  const split = [{ id: 101, perc: 40 }, { id: 102, perc: 30 }, { id: 104, perc: 30 }];
  const mk = (extra = {}) => {
    const app = loadApp();
    app.__set('state', { ...app.__get('state'), edificioAttivo: 1, edifici: [{ id: 1, nome: 'E' }], fornitori: [], page: 'entrate', filterAnno: Y, filterAnni: [Y],
      user: { id: 102, nome: 'Bruno', isAdmin: true, canEdit: true, edificioId: 1 },
      condomini: [
        { id: 101, nome: 'Anna', appartamento: 'Int. 1', edificioId: 1, disabled: true, dataUscita: `${Y}-07-01` },
        { id: 102, nome: 'Bruno', appartamento: 'Int. 2', edificioId: 1 },
        { id: 103, nome: 'Carlo', appartamento: 'Int. 1', edificioId: 1, dataIngresso: `${Y}-07-01` },
        { id: 104, nome: 'Dora', appartamento: 'Int. 3', edificioId: 1 },
      ],
      spese: [{ id: 1, data: `${Y}-12-01`, titolo: 'Tetto', categoria: 'tetto', preventivo: '1200', consuntivo: '', split, edificioId: 1 }],
      entrate: [], ...extra });
    return app;
  };
  const somma = (piano, id) => piano.rate.reduce((a, r) => a + r.perCondomino.filter((c) => c.id === id).reduce((b, c) => b + c.importo, 0), 0);

  it('QA-CONS-007: chi ha lo 0% non riceve rate e la quota di chi è uscito non finisce all\'ultimo dell\'elenco', () => {
    const piano = mk().calcolaPianoRate(Y);
    assert.strictEqual(piano.coperto, false);
    assert.strictEqual(somma(piano, 103), 0, 'Carlo (0%) ha rate');
    assert.strictEqual(somma(piano, 101), 0, 'Anna è uscita: nessuna rata nel piano');
    for (const r of piano.rate) {
      const pc = (id) => r.perCondomino.find((c) => c.id === id).importo;
      assert.ok(Math.abs(pc(102) - r.importoTotale * 0.3) <= 0.05, 'Bruno ' + pc(102));
      assert.ok(Math.abs(pc(104) - r.importoTotale * 0.3) <= 0.05, 'Dora ' + pc(104));
      const scarto = Math.abs(r.importoTotale - r.perCondomino.reduce((a, c) => a + c.importo, 0) - r.nonAttribuito);
      assert.ok(scarto <= 0.05, 'scarto ' + scarto);
      assert.ok(Math.abs(r.nonAttribuito - r.importoTotale * 0.4) <= 0.05, 'non attribuito ' + r.nonAttribuito);
    }
    assert.ok(Math.abs(piano.totNonAttribuito - 480) <= 0.05, String(piano.totNonAttribuito));
    assert.deepStrictEqual(Array.from(piano.nonAttribuitoDettaglio.map((x) => x.nome)), ['Anna']);
  });
  it('QA-CONS-007: il piano mostra la quota non attribuita con il nome di chi è uscito', () => {
    const h = mk().renderPianoRateBox(Y, true);
    assert.ok(h.includes('Quota non attribuita') && h.includes('Anna') && h.includes('480,00'), h.slice(0, 200));
  });
  it('QA-CONS-007: senza uscite nessuna quota non attribuita e il totale delle rate torna al centesimo', () => {
    const app = mk({ condomini: [{ id: 102, nome: 'Bruno', edificioId: 1 }, { id: 104, nome: 'Dora', edificioId: 1 }, { id: 105, nome: 'Elia', edificioId: 1 }],
      spese: [{ id: 1, data: `${Y}-12-01`, preventivo: '100', consuntivo: '', split: [{ id: 102, perc: 33.34 }, { id: 104, perc: 33.33 }, { id: 105, perc: 33.33 }], edificioId: 1 }] });
    const piano = app.calcolaPianoRate(Y);
    assert.strictEqual(piano.totNonAttribuito, 0);
    for (const r of piano.rate) assert.ok(Math.abs(r.perCondomino.reduce((a, c) => a + c.importo, 0) - r.importoTotale) < 0.005);
  });
  it('QA-CONS-026: ricalcolando il piano le rate previste di chi è uscito restano sue e sono segnalate; chi entra non ne riceve', async () => {
    const prop = (id, cond) => ({ id, condominoId: cond, importo: '160', data: `${Y}-12-01`, previsionale: true, pianoRataAuto: true, pianoAnno: Y, pianoRataN: 1, edificioId: 1 });
    const app = mk({ entrate: [prop(50, 101), prop(51, 103)] });
    const piano = app.calcolaPianoRate(Y);
    assert.strictEqual(piano.rateUscitiEsistenti.n, 1);
    assert.strictEqual(piano.rateUscitiEsistenti.importo, 160);
    assert.ok(app.renderPianoRateBox(Y, true).includes('già a carico di condomini usciti'));
    let salvate = null;
    app.save = (k, v) => { if (k === 'cm_entrate') salvate = v; return Promise.resolve(true); };
    app.setState = (p) => app.__set('state', { ...app.__get('state'), ...p });
    const bottoni = { 'btn-conferma-rate-piano': {} };
    app.document.getElementById = (id) => bottoni[id] || null;
    app.document.querySelectorAll = () => [];
    app.bindAzioniEntrate();
    await bottoni['btn-conferma-rate-piano'].onclick();
    assert.ok(salvate, 'il piano non è stato salvato');
    assert.ok(salvate.some((e) => e.id === 50 && e.condominoId === 101), 'la rata di Anna (uscita) è stata tolta');
    assert.ok(!salvate.some((e) => e.id === 51), 'la rata di Carlo (0%) doveva sparire');
    assert.ok(!salvate.some((e) => e.pianoAnno === Y && e.condominoId === 103), 'Carlo non deve ricevere rate per quote non sue');
  });
});

// Consolidato 2026-10-24, QA-CONS-020 (decisione RA-2): solo importi positivi. Nessun dato reale.
describe('UNIT — importi: solo maggiori di zero, lettura uniforme (QA-CONS-020)', () => {
  const Y = new Date().getFullYear();
  const mk = (extra = {}) => {
    const app = loadApp();
    app.__set('state', { ...app.__get('state'), edificioAttivo: 1, edifici: [{ id: 1, nome: 'E' }], fornitori: [], page: 'entrate', filterAnno: Y,
      user: { id: 102, nome: 'Bruno', isAdmin: true, canEdit: true, edificioId: 1 }, pendingFiles: [],
      condomini: [{ id: 102, nome: 'Bruno', appartamento: 'Int. 2', edificioId: 1 }], spese: [], entrate: [], ...extra });
    app.setState = (p) => app.__set('state', { ...app.__get('state'), ...p });
    return app;
  };
  const scheda = (app, campi) => {
    app.document.getElementById = (id) => campi[id] || null;
    app.document.querySelectorAll = (sel) => sel === '.split-perc-inp' ? [{ dataset: { cid: '102' }, value: '100' }] : [];
    const r = { salvato: null };
    app.save = (k, v) => { r.salvato = v; };
    return r;
  };

  it('importoValido: positivo con al massimo due decimali', () => {
    const app = loadApp();
    for (const v of ['1', '1200.5', '0.01', '0.50', '12.34', '007']) assert.strictEqual(app.importoValido(v), true, v);
    for (const v of ['0', '0.00', '-50', '10.123', '10,5', 'abc', '', null, undefined, '1e3']) assert.strictEqual(app.importoValido(v), false, String(v));
  });
  it('salvaSchedaEntrata: versamento a 0 o negativo non si salva e mostra il messaggio', () => {
    for (const importo of ['0', '-50', '0.00', '10.555', 'abc']) {
      const app = mk();
      const err = { style: {}, textContent: '' };
      const r = scheda(app, { 'm-previsionale': { value: '0' }, 'entrata-err': err, 'm-condo-s': { value: '102' }, 'm-importo-s': { value: importo }, 'm-data-s': { value: `${Y}-03-01` } });
      app.salvaSchedaEntrata({ data: null });
      assert.strictEqual(r.salvato, null, 'salvato ' + importo);
      assert.match(err.textContent, /maggiore di zero/);
      assert.match(err.textContent, /nota di credito/);
    }
  });
  it('salvaSchedaEntrata: un versamento positivo si salva', () => {
    const app = mk();
    const r = scheda(app, { 'm-previsionale': { value: '0' }, 'entrata-err': { style: {} }, 'm-condo-s': { value: '102' }, 'm-importo-s': { value: '150.50' }, 'm-data-s': { value: `${Y}-03-01` } });
    app.salvaSchedaEntrata({ data: null });
    assert.strictEqual(r.salvato.length, 1);
    assert.strictEqual(r.salvato[0].importo, '150.50');
  });
  it('salvaSchedaEntrata in modifica: importo non valido rifiutato, ma un valore vecchio lasciato com\'è non blocca altri campi', () => {
    const vecchio = { id: 5, condominoId: 102, importo: '-20', data: `${Y}-02-01`, edificioId: 1, previsionale: false };
    const campi = (importo) => ({ 'm-previsionale': { value: '0' }, 'entrata-err': { style: {}, textContent: '' }, 'm-condo-s': { value: '102' },
      'm-importo-s': { value: importo }, 'm-data-s': { value: `${Y}-02-01` }, 'm-desc-s': { value: 'nuova descrizione' } });
    let app = mk({ entrate: [vecchio] });
    let r = scheda(app, campi('-30'));
    app.salvaSchedaEntrata({ data: vecchio });
    assert.strictEqual(r.salvato, null);
    app = mk({ entrate: [vecchio] });
    r = scheda(app, campi('-20'));
    app.salvaSchedaEntrata({ data: vecchio });
    assert.ok(r.salvato, 'un importo vecchio invariato doveva restare modificabile');
  });
  it('salvaSchedaEntrata: rate previste con importo 0, negativo o con troppi decimali non si salvano', () => {
    for (const importoR of ['0', '-10', '5.999']) {
      const app = mk();
      const err = { style: {}, textContent: '' };
      const r = scheda(app, { 'm-previsionale': { value: '1' }, 'entrata-err': err, 'm-condo': { value: '102' },
        'rata-row-1': { style: {} }, 'rata-data-1': { value: `${Y}-05-01` }, 'rata-importo-1': { value: importoR } });
      app.salvaSchedaEntrata({ data: null });
      assert.strictEqual(r.salvato, null, 'salvata la rata ' + importoR);
      assert.match(err.textContent, /maggiore di zero/);
    }
  });
  it('salvaSchedaSpesa: preventivo o consuntivo a 0, negativi o con troppi decimali non si salvano', () => {
    for (const [prev, cons] of [['0', ''], ['', '-100'], ['100', '0'], ['-5', '50'], ['', '10.999'], ['abc', '']]) {
      const app = mk({ page: 'spese' });
      const err = { style: {}, textContent: '' };
      const r = scheda(app, { 'm-titolo': { value: 'Tetto' }, 'm-cat': { value: 'tetto' }, 'm-tipo': { value: 'ordinaria' }, 'm-prev': { value: prev },
        'm-cons': { value: cons }, 'm-data': { value: `${Y}-03-01` }, 'm-err': err });
      app.salvaSchedaSpesa({ data: null });
      assert.strictEqual(r.salvato, null, `salvata la spesa ${prev}/${cons}`);
      assert.match(err.textContent, /maggiore di zero/);
      assert.match(err.textContent, /nota di credito/);
    }
  });
  it('salvaSchedaSpesa: importi positivi si salvano; una spesa vecchia con preventivo 0 resta modificabile se non lo si tocca', () => {
    let app = mk({ page: 'spese' });
    const campi = (prev, cons) => ({ 'm-titolo': { value: 'Tetto' }, 'm-cat': { value: 'tetto' }, 'm-tipo': { value: 'ordinaria' }, 'm-prev': { value: prev },
      'm-cons': { value: cons }, 'm-data': { value: `${Y}-03-01` }, 'm-err': { style: {}, textContent: '' } });
    let r = scheda(app, campi('100', '120.5'));
    app.salvaSchedaSpesa({ data: null });
    assert.ok(r.salvato, 'importi positivi non salvati');
    const vecchia = { id: 9, titolo: 'Tetto', categoria: 'tetto', preventivo: '0', consuntivo: '500', data: `${Y}-03-01`, split: [], edificioId: 1 };
    app = mk({ page: 'spese', spese: [vecchia] });
    r = scheda(app, campi('0', '500'));
    app.salvaSchedaSpesa({ data: vecchia });
    assert.ok(r.salvato, 'preventivo vecchio invariato doveva restare modificabile');
  });
  it('un importo salvato non numerico non fa diventare NaN i totali del Bilancio', () => {
    const app = mk({ page: 'bilancio', bilancioTab: 'condomini',
      spese: [{ id: 1, data: `${Y}-02-01`, consuntivo: '500', preventivo: 'abc', split: [{ id: 102, perc: 100 }], edificioId: 1 },
        { id: 2, data: `${Y}-03-01`, consuntivo: 'xyz', preventivo: '', split: [{ id: 102, perc: 100 }], edificioId: 1 }],
      entrate: [{ id: 10, data: `${Y}-04-01`, importo: 'zz', condominoId: 102, edificioId: 1 }, { id: 11, data: `${Y}-04-02`, importo: '200', condominoId: 102, edificioId: 1 }] });
    for (const tab of ['condomini', 'riepilogo', 'categorie', 'mensile', 'analisi']) {
      app.__set('state', { ...app.__get('state'), bilancioTab: tab });
      assert.ok(!app.renderBilancio().includes('NaN'), 'NaN nel Bilancio, scheda ' + tab);
    }
    assert.strictEqual(app.importoNum('abc'), 0);
    assert.strictEqual(app.importoNum('12.5'), 12.5);
    assert.strictEqual(app.importoNum(undefined), 0);
  });
});

// Consolidato QA-CONS-022 (ADV-FUNC-009): un rappresentante per appartamento nei millesimi; "Riattiva" non per chi è uscito con un subentro
describe('UNIT — QA-CONS-022: appartamento con più condomini e Riattiva dopo un subentro', () => {
  const Y = new Date().getFullYear();
  const CFG = { attivo: true, dal: `${Y}-01-01`, categorie: {}, tabelle: [
    { id: 'generale', nome: 'Generale', valori: { 'int. 1': 400, 'int. 2': 300, 'int. 3': 300 } }] };
  const mk = (condomini) => {
    const app = loadApp();
    app.__set('state', { ...app.__get('state'), edificioAttivo: 1, edifici: [{ id: 1, nome: 'E' }], fornitori: [], spese: [], entrate: [],
      user: { id: 101, nome: 'Anna', isAdmin: true, canEdit: true, edificioId: 1 }, condomini });
    app.__get('_millesimi')[1] = CFG;
    app.setState = (p) => app.__set('state', { ...app.__get('state'), ...p });
    return app;
  };
  const base = () => [
    { id: 101, nome: 'Anna', appartamento: 'Int. 1', edificioId: 1 },
    { id: 102, nome: 'Bruno', appartamento: 'Int. 2', edificioId: 1 },
    { id: 103, nome: 'Bea', appartamento: 'Int. 2', edificioId: 1 },
    { id: 104, nome: 'Dora', appartamento: 'Int. 3', edificioId: 1 },
  ];
  const perc = (p, id) => p.split.find((x) => x.id === id).perc;
  const somma = (p, ids) => Math.round(ids.reduce((a, id) => a + perc(p, id), 0) * 100) / 100;

  it('senza rappresentante: l\'appartamento conta UNA volta (peso diviso tra i suoi condomini) e viene segnalato', () => {
    const app = mk(base());
    const p = app.propostaMillesimi('generale', `${Y}-06-01`);
    assert.strictEqual(somma(p, [102, 103]), 30, 'Int. 2 deve valere il 30%, non il 46,15%');
    assert.strictEqual(perc(p, 101), 40);
    assert.strictEqual(perc(p, 104), 30);
    assert.strictEqual(Math.round(p.split.reduce((a, x) => a + x.perc, 0) * 100), 10000);
    assert.deepStrictEqual(Array.from(p.senzaRappresentante), ['Int. 2']);
    assert.deepStrictEqual(Array.from(app.appartamentiSenzaRappresentante().map((a) => a.etichetta)), ['Int. 2']);
  });

  it('con il rappresentante: porta tutto il peso dell\'appartamento, l\'altro 0%; nessun avviso', () => {
    const c = base(); c[2] = { ...c[2], rappresentante: true };
    const app = mk(c);
    const p = app.propostaMillesimi('generale', `${Y}-06-01`);
    assert.deepStrictEqual([perc(p, 101), perc(p, 102), perc(p, 103), perc(p, 104)], [40, 0, 30, 30]);
    assert.deepStrictEqual(Array.from(p.senzaRappresentante), []);
    assert.deepStrictEqual(Array.from(p.senza), [], 'il cointestatario senza peso non è "senza millesimi"');
    assert.strictEqual(app.appartamentiSenzaRappresentante().length, 0);
  });

  it('il rappresentante vale solo tra chi è presente alla data: uscito lui, resta il peso diviso e l\'avviso', () => {
    const c = base(); c[2] = { ...c[2], rappresentante: true, disabled: true, dataUscita: `${Y}-03-01` };
    const app = mk(c);
    const p = app.propostaMillesimi('generale', `${Y}-06-01`);
    assert.strictEqual(perc(p, 102), 30, 'Bruno resta solo: porta il suo appartamento');
    assert.ok(!p.split.some((x) => x.id === 103), 'chi è uscito non è alla data');
    assert.deepStrictEqual(Array.from(p.senzaRappresentante), []);
  });

  it('salvataggio scheda: spuntare "Rappresentante" toglie la spunta agli altri dello stesso appartamento', () => {
    const c = base(); c[1] = { ...c[1], rappresentante: true };
    const app = mk(c);
    let salvati = null;
    app.save = (k, v) => { if (k === 'cm_condomini') salvati = v; };
    const campi = { 'm-nome': { value: 'Bea' }, 'm-apt': { value: 'Int. 2' }, 'm-email': { value: '' }, 'm-ruolo': { value: 'lettura' },
      'm-edificio': { value: '1' }, 'm-ingresso': { value: '' }, 'm-tel': { value: '' }, 'm-username': { value: '' },
      'm-email-notifiche': { checked: true }, 'm-wa-notifiche': { checked: true }, 'm-rappresentante': { checked: true } };
    app.document.getElementById = (id) => campi[id] || null;
    return app.salvaSchedaCondomino({ data: { id: 103 } }).then(() => {
      assert.ok(salvati, 'non salvato');
      assert.strictEqual(salvati.find((x) => x.id === 103).rappresentante, true);
      assert.strictEqual(salvati.find((x) => x.id === 102).rappresentante, false);
    });
  });

  it('Riattiva: chi è uscito per un subentro non si riattiva (avviso, nessun salvataggio); gli altri sì', async () => {
    const c = base();
    c[0] = { ...c[0], disabled: true, disabledOn: `${Y}-07-01T00:00:00.000Z`, dataUscita: `${Y}-07-01`, disabledNote: 'Subentro: Carlo dal 01/07/' + Y };
    c[1] = { ...c[1], disabled: true, disabledOn: `${Y}-05-01T00:00:00.000Z`, dataUscita: `${Y}-05-01`, disabledNote: 'Trasferito' };
    c.push({ id: 105, nome: 'Carlo', appartamento: 'Int. 1', edificioId: 1, dataIngresso: `${Y}-07-01` });
    const app = mk(c);
    let salvati = null;
    app.save = (k, v) => { salvati = v; };
    app.chiedi = async () => true;
    assert.ok(app.motivoNoRiattiva(c[0]) && !app.motivoNoRiattiva(c[1]));
    await app.riattivaCondomino(101);
    assert.strictEqual(salvati, null, 'nessun salvataggio per chi è uscito per subentro');
    assert.ok(app.__alerts.some((m) => /subentro/i.test(m) && /Anna/.test(m)), app.__alerts.join('|'));
    const anna = app.__get('state').condomini.find((x) => x.id === 101);
    assert.ok(anna.disabled && anna.dataUscita === `${Y}-07-01`, 'la data di uscita deve restare');
    await app.riattivaCondomino(102);
    assert.ok(salvati && salvati.find((x) => x.id === 102).disabled === false);
  });
});

// Consolidato QA-CONS-023 (ADV-FUNC-010, RA-3/D3) e QA-CONS-025 (ADV-FUNC-012, D6-bis)
describe('UNIT — QA-CONS-023: subentro a data futura', () => {
  const Y = new Date().getFullYear();
  const mk = () => {
    const app = loadApp();
    app.__set('state', { ...app.__get('state'), edificioAttivo: 1, edifici: [{ id: 1, nome: 'E' }], fornitori: [], entrate: [],
      user: { id: 900, nome: 'Admin', isAdmin: true, canEdit: true, edificioId: 1 },
      condomini: [{ id: 201, nome: 'Dario', appartamento: 'Int. 3', edificioId: 1, color: '#000' }],
      spese: [{ id: 1, data: `${Y + 2}-03-10`, consuntivo: '', preventivo: '200', split: [{ id: 201, perc: 100 }], edificioId: 1 }] });
    app.save = () => true;
    app.setState = (p) => app.__set('state', { ...app.__get('state'), ...p });
    return app;
  };
  const registra = async (app, data) => {
    app.__set('state', { ...app.__get('state'), modal: { type: 'subentro', data: { id: 201 } } });
    const campi = { 'btn-sub-conferma': { dataset: { cond: '201' } }, 'sub-data': { value: data }, 'sub-nome': { value: 'Elena' },
      'sub-email': { value: '' }, 'sub-ruolo': { value: 'lettura' }, 'sub-passa': { checked: true }, 'sub-err': { style: {} } };
    app.document.getElementById = (id) => campi[id] || null;
    app.bindSchedaSubentro();
    await campi['btn-sub-conferma'].onclick();
    const s = app.__get('state');
    return { dario: s.condomini.find((c) => c.id === 201), elena: s.condomini.find((c) => c.nome === 'Elena') };
  };

  it('data futura: chi esce resta attivo (solo dataUscita, niente disabled) fino alla data; chi entra ha dataIngresso', async () => {
    const data = `${Y + 1}-06-01`;
    const { dario, elena } = await registra(mk(), data);
    assert.ok(!dario.disabled, 'chi esce non deve essere archiviato subito');
    assert.strictEqual(dario.dataUscita, data);
    assert.ok(/Subentro: Elena/.test(dario.disabledNote));
    assert.strictEqual(elena.dataIngresso, data);
    const app = mk();
    await registra(app, data);
    const alla = (d) => Array.from(app.condominiAllaData(d, 1).map((c) => c.nome).sort());
    assert.deepStrictEqual(alla(`${Y + 1}-05-31`), ['Dario'], 'prima della data: chi esce compare, chi entra no');
    assert.deepStrictEqual(alla(data), ['Elena'], 'dalla data: chi entra compare, chi esce no');
  });

  it('data odierna o passata: come prima, chi esce è archiviato subito', async () => {
    for (const data of [`${Y}-01-01`, new Date().toLocaleDateString('sv-SE')]) {
      const { dario, elena } = await registra(mk(), data);
      assert.ok(dario.disabled === true && dario.dataUscita === data && dario.disabledOn, data);
      assert.strictEqual(elena.dataIngresso, data);
    }
  });

  it('elenco Condomini: chi esce con data futura è tra gli attivi, chi ha la data già arrivata tra gli archiviati', () => {
    const app = mk();
    app.__set('state', { ...app.__get('state'), page: 'condomini', condomini: [
      { id: 301, nome: 'Esce', appartamento: 'A1', edificioId: 1, dataUscita: `${Y + 1}-06-01` },
      { id: 302, nome: 'Uscito', appartamento: 'A2', edificioId: 1, dataUscita: `${Y - 1}-06-01` },
      { id: 303, nome: 'Entra', appartamento: 'A3', edificioId: 1, dataIngresso: `${Y + 1}-06-01` }] });
    const html = app.renderCondomini();
    const [attivi, archiviati] = html.split('Archiviati');
    assert.ok(/Esce/.test(attivi) && /Entra/.test(attivi) && !/Uscito/.test(attivi));
    assert.ok(/Uscito/.test(archiviati) && !/Esce/.test(archiviati));
    assert.ok(/Entra il/.test(attivi) && /Esce il/.test(attivi));
  });
});

describe('UNIT — QA-CONS-025: un condomino con movimenti non si elimina', () => {
  const mk = (extra) => {
    const app = loadApp();
    app.__set('state', { ...app.__get('state'), edificioAttivo: 1, edifici: [{ id: 1, nome: 'E' }], fornitori: [],
      user: { id: 900, nome: 'Admin', isAdmin: true, canEdit: true, edificioId: 1 },
      condomini: [{ id: 101, nome: 'Anna', appartamento: 'Int. 1', edificioId: 1 }, { id: 102, nome: 'Bruno', appartamento: 'Int. 2', edificioId: 1, disabled: true }],
      spese: [], entrate: [], ...extra });
    let salvati = null;
    app.save = (k, v) => { salvati = v; };
    app.setState = (p) => app.__set('state', { ...app.__get('state'), ...p });
    let chiesto = 0;
    app.chiedi = async () => { chiesto++; return true; };
    return { app, salvati: () => salvati, chiesto: () => chiesto };
  };
  const elimina = async (app, id) => {
    const btn = { dataset: { delCond: String(id) } };
    app.document.querySelectorAll = (sel) => (sel === '[data-del-cond]' ? [btn] : []);
    app.bindAzioniCondomini();
    await btn.onclick();
  };

  it('haMovimenti: quota maggiore di zero, versamento (anche previsionale); zero e altri condomini no', () => {
    const app = loadApp();
    const spese = [{ split: [{ id: 1, perc: 50 }, { id: 2, perc: 0 }] }];
    assert.strictEqual(app.haMovimenti(1, spese, []), true);
    assert.strictEqual(app.haMovimenti(2, spese, []), false);
    assert.strictEqual(app.haMovimenti(3, spese, [{ condominoId: 3, previsionale: true }]), true);
    assert.strictEqual(app.haMovimenti(4, spese, [{ condominoId: 3 }]), false);
    assert.strictEqual(app.haMovimenti(4, undefined, undefined), false);
  });

  it('con una quota o con un versamento: avviso "Ha movimenti: usa Archivia", nessuna conferma, nessun salvataggio', async () => {
    for (const extra of [{ spese: [{ id: 1, split: [{ id: 101, perc: 100 }] }] }, { entrate: [{ id: 1, condominoId: 101, importo: '10' }] }]) {
      const t = mk(extra);
      await elimina(t.app, 101);
      assert.strictEqual(t.salvati(), null);
      assert.strictEqual(t.chiesto(), 0);
      assert.ok(t.app.__alerts.some((m) => /Ha movimenti: usa Archivia/.test(m)), t.app.__alerts.join('|'));
      assert.ok(t.app.__get('state').condomini.some((c) => c.id === 101));
    }
  });

  it('già archiviato ma con movimenti: non si elimina nemmeno; senza movimenti l\'eliminazione resta disponibile', async () => {
    const t = mk({ entrate: [{ id: 1, condominoId: 102, importo: '10' }] });
    await elimina(t.app, 102);
    assert.strictEqual(t.salvati(), null);
    assert.ok(t.app.__get('state').condomini.some((c) => c.id === 102));
    const u = mk({ entrate: [{ id: 1, condominoId: 101, importo: '10' }] });
    await elimina(u.app, 102);
    assert.strictEqual(u.chiesto(), 1);
    assert.deepStrictEqual(Array.from(u.salvati().map((c) => c.id)), [101]);
  });
});

describe('UNIT — CONS-028: segnalazione all\'amministratore di versamenti e quote dell\'editor su sé stesso (nessun blocco)', () => {
  const NOW = Date.UTC(2026, 9, 24);
  const GG = 86400000;
  const condomini = [
    { id: 1, nome: 'Edi Tore', edificioId: 1, uid: 'u-ed', canEdit: true, isAdmin: false },
    { id: 2, nome: 'Ammi Nistra', edificioId: 1, uid: 'u-ad', canEdit: true, isAdmin: true },
    { id: 3, nome: 'Solo Lettura', edificioId: 1, uid: 'u-rd', canEdit: false, isAdmin: false },
    { id: 4, nome: 'Edi Altrove', edificioId: 2, uid: 'u-ed2', canEdit: true, isAdmin: false },
  ];
  const mkAutori = (m) => (t, r) => m[t + ':' + r.id] || null;
  const run = (app, extra) => app.segnalazioniEditor({ condomini, edificioId: 1, adesso: NOW, entrate: [], spese: [], autore: () => null, ...extra });

  it('versamento intestato all\'editor e scritto da lui: segnalato; di altri, o scritto da un altro: no', () => {
    const app = loadApp();
    const entrate = [
      { id: 10, edificioId: 1, condominoId: 1, importo: '50', data: '2026-10-20' }, // editor su sé stesso
      { id: 11, edificioId: 1, condominoId: 3, importo: '50', data: '2026-10-20' }, // editor per un altro
      { id: 12, edificioId: 1, condominoId: 1, importo: '50', data: '2026-10-20' }, // intestato all'editor, ma scritto dall'amministratore
      { id: 13, edificioId: 1, condominoId: 2, importo: '50', data: '2026-10-20' }, // l'amministratore su sé stesso: non è un editor
    ];
    const autore = mkAutori({
      'entrata:10': { by: 'u-ed', at: NOW - GG }, 'entrata:11': { by: 'u-ed', at: NOW - GG },
      'entrata:12': { by: 'u-ad', at: NOW - GG }, 'entrata:13': { by: 'u-ad', at: NOW - GG },
    });
    const r = run(app, { entrate, autore });
    assert.deepStrictEqual(Array.from(r.map((x) => x.rec.id)), [10]);
    assert.strictEqual(r[0].editor.nome, 'Edi Tore');
  });

  it('quota: spesa con una quota maggiore di zero dell\'editor scritta da lui è segnalata; quota zero o assente no', () => {
    const app = loadApp();
    const spese = [
      { id: 20, edificioId: 1, titolo: 'A', split: [{ id: 1, perc: 50 }, { id: 3, perc: 50 }] },
      { id: 21, edificioId: 1, titolo: 'B', split: [{ id: 1, perc: 0 }, { id: 3, perc: 100 }] },
      { id: 22, edificioId: 1, titolo: 'C', split: [{ id: 3, perc: 100 }] },
    ];
    const autore = mkAutori(Object.fromEntries([20, 21, 22].map((i) => ['spesa:' + i, { by: 'u-ed', at: NOW - GG }])));
    assert.deepStrictEqual(Array.from(run(app, { spese, autore }).map((x) => x.rec.id)), [20]);
  });

  it('oltre 60 giorni, altro edificio, senza autore noto o senza uid collegato: nessuna segnalazione', () => {
    const app = loadApp();
    const entrate = [
      { id: 30, edificioId: 1, condominoId: 1, importo: '5' },
      { id: 31, edificioId: 2, condominoId: 4, importo: '5' },
      { id: 32, edificioId: 1, condominoId: 1, importo: '5' },
    ];
    const autore = mkAutori({ 'entrata:30': { by: 'u-ed', at: NOW - 61 * GG }, 'entrata:31': { by: 'u-ed2', at: NOW - GG } });
    assert.deepStrictEqual(Array.from(run(app, { entrate, autore })), []);
    const senzaUid = condomini.map((c) => ({ ...c, uid: undefined }));
    const ok = mkAutori({ 'entrata:32': { by: 'u-ed', at: NOW - GG } });
    assert.deepStrictEqual(Array.from(run(app, { entrate, autore: ok, condomini: senzaUid })), []);
    assert.strictEqual(run(app, { entrate, autore: ok }).length, 1);
  });

  it('riquadro in pagina: lo vede solo l\'amministratore, con nome e importo; ricordaAutore() lo alimenta e un amministratore lo spegne', () => {
    const app = loadApp();
    const adesso = Date.now();
    const base = { condomini, entrate: [{ id: 10, edificioId: 1, condominoId: 1, importo: '50', data: '2026-10-20' }], spese: [], edificioAttivo: 1 };
    const ts = (ms) => ({ toMillis: () => ms });
    app.ricordaAutore('buildings/1/payments/10', { _updatedBy: 'u-ed', _updatedAt: ts(adesso - GG) });
    app.__set('state', { ...app.__get('state'), ...base, user: { isAdmin: true, canEdit: true } });
    const html = app.renderSegnalazioniEditor('entrata');
    assert.ok(html.includes('Edi Tore') && html.includes('data-segnalazioni-editor="cm_entrate"') && /50,00/.test(html), html);
    assert.strictEqual(app.renderSegnalazioniEditor('spesa'), '');
    // un editor o un condomino semplice non vedono il riquadro
    for (const user of [{ canEdit: true }, {}]) {
      app.__set('state', { ...app.__get('state'), user });
      assert.strictEqual(app.renderSegnalazioniEditor('entrata'), '');
    }
    // l'amministratore ritocca il versamento: l'autore diventa lui e la segnalazione sparisce
    app.__set('state', { ...app.__get('state'), user: { isAdmin: true, canEdit: true } });
    app.ricordaAutore('buildings/1/payments/10', { _updatedBy: 'u-ad', _updatedAt: ts(adesso) });
    assert.strictEqual(app.renderSegnalazioniEditor('entrata'), '');
  });

  it('il nome nel riquadro passa da esc() (nessun HTML iniettato)', () => {
    const app = loadApp();
    const ts = { toMillis: () => Date.now() };
    app.ricordaAutore('buildings/1/expenses/20', { _updatedBy: 'u-ed', _updatedAt: ts });
    app.__set('state', { ...app.__get('state'), edificioAttivo: 1, user: { isAdmin: true },
      condomini: [{ ...condomini[0], nome: '<img src=x onerror=1>' }], entrate: [],
      spese: [{ id: 20, edificioId: 1, titolo: '<b>x</b>', data: '2026-10-01', split: [{ id: 1, perc: 100 }] }] });
    const html = app.renderSegnalazioniEditor('spesa');
    assert.ok(html.includes('&lt;img') && html.includes('&lt;b&gt;') && !/<img|<b>/.test(html), html);
  });
});

// QA-CONS-029 (ADV-FUNC-018, scelta del proprietario RA-5/D7): nessun blocco sugli anni passati, ma un avviso con conferma.
describe('UNIT — QA-CONS-029: avviso con conferma quando si modifica un anno già passato', () => {
  const Y = new Date().getFullYear();
  const MSG = /Stai modificando un anno già passato: i riporti e i rendiconti già inviati cambiano\./;
  const split = [{ id: 101, perc: 50 }, { id: 102, perc: 50 }];
  const spesaVecchia = { id: 1, titolo: 'Tetto', descrizione: '', categoria: 'tetto', tipoSpesa: 'ordinaria', preventivo: '', consuntivo: '1000', data: `${Y - 1}-03-01`, split, edificioId: 1, allegati: [] };
  const versVecchio = { id: 5, condominoId: 101, importo: '100', data: `${Y - 1}-04-10`, descrizione: 'Rata', categoria: 'quote', edificioId: 1, previsionale: false };
  const mk = (extra = {}, risposta = true) => {
    const app = loadApp();
    app.__set('state', { ...app.__get('state'), edificioAttivo: 1, edifici: [{ id: 1, nome: 'E' }], fornitori: [], pendingFiles: [],
      user: { id: 900, nome: 'Admin', isAdmin: true, canEdit: true, edificioId: 1 },
      condomini: [{ id: 101, nome: 'Anna', appartamento: 'Int. 1', edificioId: 1 }, { id: 102, nome: 'Bruno', appartamento: 'Int. 2', edificioId: 1 }],
      spese: [spesaVecchia], entrate: [versVecchio], ...extra });
    const r = { salvati: [], chiesti: [] };
    app.save = (k, v) => { r.salvati.push(k); };
    app.setState = (p) => app.__set('state', { ...app.__get('state'), ...p });
    app.chiedi = async (t) => { r.chiesti.push(String(t)); return risposta; };
    return { app, r };
  };
  const campiSpesa = (app, v = {}) => {
    const campi = { 'm-titolo': { value: 'Tetto' }, 'm-desc': { value: '' }, 'm-cat': { value: 'tetto' }, 'm-tipo': { value: 'ordinaria' }, 'm-prev': { value: '' },
      'm-cons': { value: '1000' }, 'm-data': { value: `${Y - 1}-03-01` }, 'm-err': { style: {}, textContent: '' }, ...v };
    app.document.getElementById = (id) => campi[id] || null;
    app.document.querySelectorAll = (sel) => sel === '.split-perc-inp' ? [[101, 50], [102, 50]].map(([id, p]) => ({ dataset: { cid: String(id) }, value: String(p) })) : [];
  };
  const campiEntrata = (app, v = {}) => {
    const campi = { 'm-previsionale': { value: '0' }, 'entrata-err': { style: {}, textContent: '' }, 'm-condo-s': { value: '101' }, 'm-importo-s': { value: '100' },
      'm-data-s': { value: `${Y - 1}-04-10` }, 'm-desc-s': { value: 'Rata' }, 'm-cat-s': { value: 'quote' }, ...v };
    app.document.getElementById = (id) => campi[id] || null;
  };

  it('modificaAnnoPassato: anno corrente e futuro mai; anno passato per nuovo ed eliminato; modifica solo se cambiano data, importi, quote o condomino', () => {
    const app = loadApp();
    const f = (a, b, c) => app.modificaAnnoPassato(a, b, c || app.__get('CAMPI_ANNO_SPESA'));
    assert.strictEqual(f(null, { data: `${Y}-01-01` }), false);
    assert.strictEqual(f(null, { data: `${Y + 1}-01-01` }), false);
    assert.strictEqual(f(null, { data: `${Y - 1}-12-31` }), true);
    assert.strictEqual(f({ data: `${Y - 1}-12-31` }, null), true);
    assert.strictEqual(f(null, null), false);
    const base = { data: `${Y - 1}-05-05`, preventivo: '', consuntivo: '10', split };
    assert.strictEqual(f(base, { ...base, titolo: 'altro', descrizione: 'x', categoria: 'y' }), false, 'solo testo');
    assert.strictEqual(f(base, { ...base, consuntivo: '10.00' }), false, 'stesso importo scritto diversamente');
    assert.strictEqual(f(base, { ...base, split: [...split, { id: 103, perc: 0 }] }), false, 'riga a zero');
    assert.strictEqual(f(base, { ...base, consuntivo: '11' }), true);
    assert.strictEqual(f(base, { ...base, data: `${Y - 1}-05-06` }), true);
    assert.strictEqual(f(base, { ...base, data: `${Y}-01-02` }), true, 'spostata fuori dall\'anno passato');
    assert.strictEqual(f(base, { ...base, split: [{ id: 101, perc: 60 }, { id: 102, perc: 40 }] }), true);
    const v = { data: `${Y - 1}-05-05`, condominoId: 101, importo: '100', previsionale: undefined };
    assert.strictEqual(f(v, { ...v, previsionale: false, descrizione: 'x' }, app.__get('CAMPI_ANNO_ENTRATA')), false);
    assert.strictEqual(f(v, { ...v, condominoId: 102 }, app.__get('CAMPI_ANNO_ENTRATA')), true);
    assert.strictEqual(f(v, { ...v, importo: '90' }, app.__get('CAMPI_ANNO_ENTRATA')), true);
    assert.strictEqual(f(v, { ...v, previsionale: true }, app.__get('CAMPI_ANNO_ENTRATA')), true);
  });

  it('nuova spesa in un anno passato: chiede conferma; se si annulla non salva; se si conferma salva', async () => {
    for (const [risposta, attesi] of [[false, 0], [true, 1]]) {
      const { app, r } = mk({ spese: [] }, risposta);
      campiSpesa(app);
      await app.salvaSchedaSpesa({ data: null });
      assert.strictEqual(r.chiesti.length, 1);
      assert.match(r.chiesti[0], MSG);
      assert.strictEqual(r.salvati.length, attesi);
    }
  });

  it('spesa nell\'anno corrente: nessun avviso (e il salvataggio resta immediato)', () => {
    const { app, r } = mk({ spese: [] });
    campiSpesa(app, { 'm-data': { value: `${Y}-03-01` } });
    app.salvaSchedaSpesa({ data: null });
    assert.strictEqual(r.chiesti.length, 0);
    assert.strictEqual(r.salvati.length, 1, 'salvata senza attese');
  });

  it('spesa di un anno passato: cambiare il solo titolo non avvisa; cambiare il consuntivo avvisa', async () => {
    const a = mk();
    campiSpesa(a.app, { 'm-titolo': { value: 'Tetto condominiale' } });
    await a.app.salvaSchedaSpesa({ data: spesaVecchia });
    assert.strictEqual(a.r.chiesti.length, 0);
    assert.strictEqual(a.r.salvati.length, 1);
    const b = mk();
    campiSpesa(b.app, { 'm-cons': { value: '1200' } });
    await b.app.salvaSchedaSpesa({ data: spesaVecchia });
    assert.strictEqual(b.r.chiesti.length, 1);
    assert.match(b.r.chiesti[0], MSG);
  });

  it('versamento: nuovo in un anno passato avvisa; modifica della sola descrizione no; cambio di importo sì e, se rifiutato, non salva', async () => {
    const nuovo = mk({ entrate: [] });
    campiEntrata(nuovo.app);
    await nuovo.app.salvaSchedaEntrata({ data: null });
    assert.strictEqual(nuovo.r.chiesti.length, 1);
    assert.strictEqual(nuovo.r.salvati.length, 1);
    const testo = mk();
    campiEntrata(testo.app, { 'm-desc-s': { value: 'Rata di aprile' } });
    await testo.app.salvaSchedaEntrata({ data: versVecchio });
    assert.strictEqual(testo.r.chiesti.length, 0);
    assert.strictEqual(testo.r.salvati.length, 1);
    const importo = mk({}, false);
    campiEntrata(importo.app, { 'm-importo-s': { value: '90' } });
    await importo.app.salvaSchedaEntrata({ data: versVecchio });
    assert.strictEqual(importo.r.chiesti.length, 1);
    assert.match(importo.r.chiesti[0], MSG);
    assert.strictEqual(importo.r.salvati.length, 0, 'rifiutato: nessun salvataggio');
  });

  it('versamento dell\'anno corrente: nessun avviso', () => {
    const { app, r } = mk({ entrate: [] });
    campiEntrata(app, { 'm-data-s': { value: `${Y}-02-01` } });
    app.salvaSchedaEntrata({ data: null });
    assert.strictEqual(r.chiesti.length, 0);
    assert.strictEqual(r.salvati.length, 1);
  });

  it('eliminare un versamento o una spesa di un anno passato: la stessa domanda di conferma porta l\'avviso; dell\'anno corrente no', async () => {
    const prova = async (bind, sel, attr, id, extra) => {
      const { app, r } = mk(extra);
      const btn = { dataset: { [attr]: String(id) } };
      app.document.querySelectorAll = (s) => (s === sel ? [btn] : []);
      app[bind]();
      await btn.onclick();
      return r.chiesti.find((t) => /^Eliminare/.test(t));
    };
    assert.match(await prova('bindAzioniEntrate', '[data-del-entrata]', 'delEntrata', 5), MSG);
    assert.match(await prova('bindAzioniSpese', '[data-del-spesa]', 'delSpesa', 1), MSG);
    assert.doesNotMatch(await prova('bindAzioniEntrate', '[data-del-entrata]', 'delEntrata', 5, { entrate: [{ ...versVecchio, data: `${Y}-04-10` }] }), MSG);
    assert.doesNotMatch(await prova('bindAzioniSpese', '[data-del-spesa]', 'delSpesa', 1, { spese: [{ ...spesaVecchia, data: `${Y}-03-01` }] }), MSG);
  });
});

// Consolidato (2026-10-25): QA-CONS-027 (allegati delle spese ricorrenti) e QA-CONS-010 (impostazioni per edificio).
describe('UNIT — QA-CONS-027: allegati delle occorrenze ricorrenti', () => {
  const allegato = { id: 'a1', nome: 'f.pdf', mime: 'application/pdf', size: 10, storagePath: 'buildings/1/allegati/a1_f.pdf' };
  it('le occorrenze nascono senza gli allegati della prima spesa, che resta com\'è', () => {
    const app = loadApp();
    const base = { data: '2027-01-15', frequenza: 'mensile', ricorrente: true, preventivo: '90', edificioId: 1, allegati: [allegato] };
    const occ = app.generaOccorrenze(base, '2027-06-30');
    assert.ok(occ.length >= 3);
    occ.forEach((o) => assert.strictEqual(JSON.stringify(o.allegati), '[]'));
    assert.strictEqual(JSON.stringify(base.allegati), JSON.stringify([allegato]));
  });
  it('allegatoRiferito(): vero finché un altro record usa lo stesso file, falso quando nessuno lo usa', () => {
    const app = loadApp();
    const A = { id: 1, allegati: [allegato] }, B = { id: 2, allegati: [allegato] }, B0 = { id: 2, allegati: [] };
    app.__set('state', { ...app.__get('state'), spese: [A, B], verbali: [] });
    assert.strictEqual(app.allegatoRiferito(allegato.storagePath, { spese: [A, B0] }), true);
    assert.strictEqual(app.allegatoRiferito(allegato.storagePath, { spese: [{ ...A, allegati: [] }, B0] }), false);
    assert.strictEqual(app.allegatoRiferito(''), false);
  });

  // Elimina un allegato dalla scheda di `idScheda`, con le spese `spese` in memoria.
  const elimina = async (spese, idScheda) => {
    const app = loadApp();
    const cancellati = [], salvati = [];
    app._fb = { storage: {}, ref: (_s, p) => p, deleteObject: async (p) => { cancellati.push(p); } };
    const scheda = spese.find((s) => s.id === idScheda);
    app.__set('state', { ...app.__get('state'), edificioAttivo: 1, spese, verbali: [], modal: { type: 'spesa', data: { ...scheda } } });
    app.chiedi = async () => true;
    app.save = (k, v) => { salvati.push(v); return Promise.resolve(true); };
    app.setState = (p) => app.__set('state', { ...app.__get('state'), ...p });
    app.render = () => {};
    const btn = { dataset: { delAllegato: JSON.stringify({ id: 'a1' }) }, closest: () => null };
    app.document.querySelectorAll = (sel) => (sel === '[data-del-allegato]' ? [btn] : []);
    app.bindAllegatiInTable([{ records: spese, stateKey: 'spese', appdataKey: 'cm_spese' }]);
    await btn.onclick();
    await new Promise((r) => setTimeout(r, 0));
    return { cancellati, salvati };
  };
  it('togliere l\'allegato da una spesa lo lascia alle altre che lo hanno già e non cancella il file condiviso', async () => {
    const spese = [{ id: 1, allegati: [allegato] }, { id: 2, allegati: [allegato] }, { id: 3, allegati: [allegato] }];
    const { cancellati, salvati } = await elimina(spese, 2);
    assert.strictEqual(salvati.length, 1);
    assert.deepStrictEqual(salvati[0].map((s) => s.allegati.length), [1, 0, 1]);
    assert.deepStrictEqual(cancellati, [], 'file condiviso cancellato');
  });
  it('se nessun altro record lo riferisce il file viene cancellato da Storage', async () => {
    const { cancellati, salvati } = await elimina([{ id: 1, allegati: [allegato] }, { id: 2, allegati: [] }], 1);
    assert.deepStrictEqual(salvati[0].map((s) => s.allegati.length), [0, 0]);
    assert.deepStrictEqual(cancellati, [allegato.storagePath]);
  });
  it('scheda chiusa senza salvare: i file appena caricati si cancellano, ma non se un record li usa', () => {
    const app = loadApp();
    const cancellati = [];
    app._fb = { storage: {}, ref: (_s, p) => p, deleteObject: async (p) => { cancellati.push(p); } };
    const nuovo = { id: 'n1', nome: 'n.pdf', mime: 'application/pdf', size: 1, storagePath: 'buildings/1/allegati/n1_n.pdf' };
    app.__set('state', { ...app.__get('state'), spese: [{ id: 1, allegati: [allegato] }], verbali: [], pendingFiles: [nuovo, allegato] });
    app.scartaFilePendenti();
    assert.deepStrictEqual(cancellati, [nuovo.storagePath]);
    assert.strictEqual(app.__get('state').pendingFiles.length, 0);
  });
});

describe('UNIT — QA-CONS-010: impostazioni per edificio riviste dal server prima di salvare', () => {
  const snapDi = (ms, extra = {}) => ({ exists: () => ms !== null, data: () => (ms === null ? undefined : { ...extra, aggiornatoIl: { toMillis: () => ms } }) });
  const fbCon = (lettura, scritture = []) => ({
    auth: { currentUser: { uid: 'u' } }, db: {}, serverTimestamp: () => 'ORA',
    doc: (_db, ...p) => ({ path: p.join('/'), id: p[p.length - 1] }),
    getDoc: async (ref) => lettura(ref), setDoc: async (ref, dati) => { scritture.push({ path: ref.path, dati }); },
  });

  it('impostazioneCambiataAltrove(): nessun avviso se la versione è la stessa o se non c\'è una versione di partenza', async () => {
    const app = loadApp();
    app._fb = fbCon(() => snapDi(5));
    let dialoghi = 0; app.chiedi = async () => { dialoghi++; return true; };
    assert.strictEqual(await app.impostazioneCambiataAltrove(1, 'affitti', 'v5', 'Affitti', () => {}), false);
    assert.strictEqual(await app.impostazioneCambiataAltrove(1, 'affitti', undefined, 'Affitti', () => {}), false);
    assert.strictEqual(dialoghi, 0);
  });
  it('impostazioneCambiataAltrove(): versione diversa o documento comparso/sparito = salvataggio fermato, con scelta di ricaricare', async () => {
    for (const [att, base] of [[9, 'v5'], [null, 'v5'], [5, 'assente']]) {
      const app = loadApp();
      app._fb = fbCon(() => snapDi(att, { tabelle: [] }));
      const domande = [];
      app.chiedi = async (t, o) => { domande.push({ t, o }); return true; };
      let ricaricato = null;
      assert.strictEqual(await app.impostazioneCambiataAltrove(1, 'millesimi', base, 'Millesimi', (d, f) => { ricaricato = { d, f }; }), true, `${att}/${base}`);
      assert.strictEqual(domande.length, 1);
      assert.match(domande[0].t, /cambiate da un'altra persona/);
      assert.ok(ricaricato, 'la scelta Ricarica non ha applicato i valori');
      assert.strictEqual(ricaricato.f, att === null ? 'assente' : 'v' + att);
      // "Resta qui": si ferma lo stesso e non ricarica.
      app.chiedi = async () => false;
      ricaricato = null;
      assert.strictEqual(await app.impostazioneCambiataAltrove(1, 'millesimi', base, 'Millesimi', () => { ricaricato = true; }), true);
      assert.strictEqual(ricaricato, null);
    }
  });

  // Salvataggio degli appartamenti in affitto, con il server che nel frattempo è (o non è) cambiato.
  const salvaAffitti = async (versioneServer) => {
    const app = loadApp();
    const scritture = [];
    app._fb = fbCon(() => snapDi(versioneServer, { appartamenti: { 'int. 1': true } }), scritture);
    app.__set('state', { ...app.__get('state'), edificioAttivo: 1, condomini: [{ id: 1, nome: 'Anna', appartamento: 'Int. 1', edificioId: 1 }] });
    app.__get('_affitti')[1] = null;
    app.__get('_affittiVer')[1] = 'v5';
    const box = { innerHTML: '', querySelectorAll: () => [] };
    const salva = {};
    app.document.getElementById = (id) => (id === 'affitti-box' ? box : id === 'affitti-salva' ? salva : id === 'affitti-err' ? { style: {} } : null);
    app.chiedi = async () => false;
    app.render = () => {};
    app.disegnaAffitti();
    await salva.onclick();
    return { scritture, avvisi: app.__alerts };
  };
  it('Appartamenti in affitto: se un altro ha salvato dopo la lettura non si scrive nulla', async () => {
    const { scritture } = await salvaAffitti(9);
    assert.deepStrictEqual(scritture, []);
  });
  it('Appartamenti in affitto: con la versione letta ancora attuale il salvataggio avviene', async () => {
    const { scritture } = await salvaAffitti(5);
    assert.strictEqual(scritture.length, 1);
    assert.strictEqual(scritture[0].path, 'buildings/1/impostazioni/affitti');
  });

  it('dati globali (categorie): se sul server sono cambiati non si sovrascrivono e si torna a ciò che c\'è sul server', async () => {
    const app = loadApp();
    app.render = () => {};
    const scritture = [];
    const base = [{ id: 'a', label: 'A' }], altrui = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }];
    const server = altrui;
    app._fb = fbCon(() => ({ exists: () => true, data: () => ({ value: JSON.stringify(server) }) }), scritture);
    app.setServerSnap('cm_categorie', base);
    const mie = [{ id: 'a', label: 'A2' }];
    assert.strictEqual(await app.save('cm_categorie', mie), false);
    assert.deepStrictEqual(scritture, [], 'sovrascritto in silenzio');
    assert.deepStrictEqual(app.load('cm_categorie'), altrui);
    assert.ok(app.__alerts.some((m) => /modificat[io] da un'altra persona/.test(m)), app.__alerts.join('|'));
    // Rifatta la modifica sopra la versione aggiornata, il salvataggio passa.
    assert.strictEqual(await app.save('cm_categorie', [...altrui, { id: 'c', label: 'C' }]), true);
    assert.strictEqual(scritture.length, 1);
  });
  it('dati globali: server invariato = salvataggio normale; base mai letta = nessun confronto', async () => {
    const app = loadApp();
    app.render = () => {};
    const scritture = [];
    const base = [{ id: 'a' }];
    app._fb = fbCon(() => ({ exists: () => true, data: () => ({ value: JSON.stringify(base) }) }), scritture);
    app.setServerSnap('cm_categorie', base);
    assert.strictEqual(await app.save('cm_categorie', [{ id: 'a', label: 'x' }]), true);
    const app2 = loadApp();
    app2.render = () => {};
    const s2 = [];
    app2._fb = fbCon(() => ({ exists: () => true, data: () => ({ value: '[]' }) }), s2);
    assert.strictEqual(await app2.save('cm_branding', { nomeProdotto: 'X' }), true);
    assert.strictEqual(s2.length, 1);
  });

  it('millesimi (ADV-FUNC-026): dopo un minuto si rileggono in silenzio e la scheda spesa vede la tabella nuova; mai con una scheda aperta', async () => {
    const app = loadApp();
    let versione = 1;
    app._fb = fbCon(() => snapDi(versione, { attivo: true, dal: '2027-01-01', tabelle: [{ id: 't' + versione }] }));
    let ridisegni = 0; app.renderPresto = () => { ridisegni++; };
    app.__set('state', { ...app.__get('state'), user: { id: 1 }, edificioAttivo: 1, page: 'spese', modal: null });
    app.assicuraMillesimi();
    await new Promise((r) => setTimeout(r, 0));
    assert.strictEqual(app.tabelleMillesimi(1)[0].id, 't1');
    versione = 2;
    app.assicuraMillesimi(); // appena letti: nessuna nuova lettura
    await new Promise((r) => setTimeout(r, 0));
    assert.strictEqual(app.tabelleMillesimi(1)[0].id, 't1');
    app.__get('_millesimiLetti')[1] = Date.now() - 61000;
    app.__set('state', { ...app.__get('state'), modal: { type: 'spesa', data: null } });
    app.assicuraMillesimi(); // scheda aperta: non si tocca
    await new Promise((r) => setTimeout(r, 0));
    assert.strictEqual(app.tabelleMillesimi(1)[0].id, 't1');
    app.__set('state', { ...app.__get('state'), modal: null });
    const prima = ridisegni;
    app.assicuraMillesimi();
    await new Promise((r) => setTimeout(r, 0));
    assert.strictEqual(app.tabelleMillesimi(1)[0].id, 't2');
    assert.strictEqual(ridisegni, prima + 1);
  });
});

// Lotto A (2026-10-25): ADV-FUNC-032/034/017/026, ADV-TECH-020, CR-004/005/006.
describe('UNIT — lotto A: subentro futuro, rappresentante, editor, millesimi, piano rate', () => {
  const Y = new Date().getFullYear();
  const FUT = `${Y + 1}-06-01`;
  const base = (extra = {}) => {
    const app = loadApp();
    app.__set('state', { ...app.__get('state'), edificioAttivo: 1, edifici: [{ id: 1, nome: 'E' }], fornitori: [], pendingFiles: [], spese: [], entrate: [],
      user: { id: 900, nome: 'Admin', isAdmin: true, canEdit: true, edificioId: 1 }, ...extra });
    app.setState = (p) => app.__set('state', { ...app.__get('state'), ...p });
    return app;
  };
  const condSubentro = () => [
    { id: 101, nome: 'Anna', appartamento: 'Int. 1', edificioId: 1, dataUscita: FUT, disabledNote: 'Subentro: Carlo dal 01/06/' + (Y + 1) },
    { id: 105, nome: 'Carlo', appartamento: 'Int. 1', edificioId: 1, dataIngresso: FUT },
    { id: 102, nome: 'Bruno', appartamento: 'Int. 2', edificioId: 1 },
  ];

  // ADV-FUNC-032
  it('ADV-FUNC-032: su chi ha un subentro futuro il pulsante Subentro e la conferma sono bloccati con un avviso', async () => {
    const app = base({ condomini: condSubentro() });
    const btn = { dataset: { subentroCond: '101' } };
    app.document.querySelectorAll = (s) => (s === '[data-subentro-cond]' ? [btn] : []);
    app.bindAzioniCondomini();
    btn.onclick();
    assert.ok(!app.__get('state').modal, 'la scheda del secondo subentro non deve aprirsi');
    assert.ok(app.__alerts.some((m) => /ha già un subentro registrato/.test(m)), app.__alerts.join('|'));
    // anche la conferma, se la scheda fosse già aperta
    app.__set('state', { ...app.__get('state'), modal: { type: 'subentro', data: { id: 101 } } });
    let salvati = 0; app.save = () => { salvati++; return true; };
    const campi = { 'btn-sub-conferma': { dataset: { cond: '101' } }, 'sub-data': { value: `${Y + 1}-08-01` }, 'sub-nome': { value: 'Elena' },
      'sub-email': { value: '' }, 'sub-ruolo': { value: 'lettura' }, 'sub-passa': { checked: false }, 'sub-err': { style: {}, textContent: '' } };
    app.document.getElementById = (id) => campi[id] || null;
    app.bindSchedaSubentro();
    await campi['btn-sub-conferma'].onclick();
    assert.strictEqual(salvati, 0);
    assert.strictEqual(app.__get('state').condomini.length, 3, 'creato un secondo subentrante');
    assert.ok(/ha già un subentro registrato/.test(campi['sub-err'].textContent));
  });

  it('ADV-FUNC-032: Archivia su chi ha un subentro futuro chiede conferma e non sostituisce la nota; senza conferma non cambia nulla', async () => {
    for (const risposta of [false, true]) {
      const app = base({ condomini: condSubentro() });
      let salvati = null; app.save = (k, v) => { salvati = v; };
      let chiesto = 0; app.chiedi = async () => { chiesto++; return risposta; };
      const campi = { 'btn-confirm-disable': { dataset: { uid: '101' } }, 'disable-note': { value: 'Trasloco' }, 'disable-uscita': { value: `${Y}-01-05` } };
      app.document.getElementById = (id) => campi[id] || null;
      app.bindSchedaCondomini();
      await campi['btn-confirm-disable'].onclick();
      assert.strictEqual(chiesto, 1);
      const anna = app.__get('state').condomini.find((c) => c.id === 101);
      if (!risposta) {
        assert.strictEqual(salvati, null, 'salvato senza conferma');
        assert.strictEqual(anna.dataUscita, FUT);
        assert.ok(!anna.disabled);
      } else {
        assert.ok(/^Subentro: Carlo/.test(anna.disabledNote), anna.disabledNote);
        assert.ok(anna.disabledNote.includes('Trasloco'));
      }
    }
    // chi non ha un subentro: nessuna domanda in più
    const app = base({ condomini: condSubentro() });
    app.save = () => {}; let chiesto = 0; app.chiedi = async () => { chiesto++; return true; };
    const campi = { 'btn-confirm-disable': { dataset: { uid: '102' } }, 'disable-note': { value: '' }, 'disable-uscita': { value: `${Y}-01-05` } };
    app.document.getElementById = (id) => campi[id] || null;
    app.bindSchedaCondomini();
    await campi['btn-confirm-disable'].onclick();
    assert.strictEqual(chiesto, 0);
    assert.ok(app.__get('state').condomini.find((c) => c.id === 102).disabled);
  });

  it('ADV-FUNC-032: "Uscito il" non si svuota su chi ha un subentro futuro (resterebbero attivi sia lui sia chi entra); cambiarlo è consentito', async () => {
    const campiBase = (uscita) => ({ 'm-nome': { value: 'Anna' }, 'm-apt': { value: 'Int. 1' }, 'm-email': { value: '' }, 'm-ruolo': { value: 'lettura' },
      'm-edificio': { value: '1' }, 'm-ingresso': { value: '' }, 'm-tel': { value: '' }, 'm-username': { value: '' }, 'm-uscita': { value: uscita },
      'm-email-notifiche': { checked: true }, 'm-wa-notifiche': { checked: true } });
    const app = base({ condomini: condSubentro() });
    let salvati = null; app.save = (k, v) => { salvati = v; };
    let campi = campiBase('');
    app.document.getElementById = (id) => campi[id] || null;
    await app.salvaSchedaCondomino({ data: { id: 101 } });
    assert.strictEqual(salvati, null, 'salvato con la data svuotata');
    assert.ok(app.__alerts.some((m) => /non si può lasciare vuota la data di uscita/.test(m)), app.__alerts.join('|'));
    assert.strictEqual(app.__get('state').condomini.find((c) => c.id === 101).dataUscita, FUT);
    campi = campiBase(`${Y + 1}-07-01`);
    await app.salvaSchedaCondomino({ data: { id: 101 } });
    assert.strictEqual(salvati.find((c) => c.id === 101).dataUscita, `${Y + 1}-07-01`);
  });

  // ADV-FUNC-034
  it('ADV-FUNC-034: nominare il nuovo rappresentante non toglie il flag a chi è uscito: la proposta alle date passate non cambia', async () => {
    const CFG = { attivo: true, dal: `${Y}-01-01`, categorie: {}, tabelle: [{ id: 'generale', nome: 'Generale', valori: { 'int. 1': 400, 'int. 2': 300, 'int. 3': 300 } }] };
    const condomini = [
      { id: 101, nome: 'Anna', appartamento: 'Int. 1', edificioId: 1 },
      { id: 102, nome: 'Aldo', appartamento: 'Int. 2', edificioId: 1, rappresentante: true, disabled: true, disabledOn: `${Y}-03-01T00:00:00.000Z`, dataUscita: `${Y}-03-01` },
      { id: 103, nome: 'Bea', appartamento: 'Int. 2', edificioId: 1 },
      { id: 104, nome: 'Dora', appartamento: 'Int. 3', edificioId: 1 },
      { id: 106, nome: 'Ciro', appartamento: 'Int. 2', edificioId: 1, dataIngresso: `${Y}-03-01` },
    ];
    const app = base({ condomini });
    app.__get('_millesimi')[1] = CFG;
    let salvati = null; app.save = (k, v) => { salvati = v; };
    const campi = { 'm-nome': { value: 'Ciro' }, 'm-apt': { value: 'Int. 2' }, 'm-email': { value: '' }, 'm-ruolo': { value: 'lettura' }, 'm-edificio': { value: '1' },
      'm-ingresso': { value: `${Y}-03-01` }, 'm-tel': { value: '' }, 'm-username': { value: '' }, 'm-email-notifiche': { checked: true }, 'm-wa-notifiche': { checked: true }, 'm-rappresentante': { checked: true } };
    app.document.getElementById = (id) => campi[id] || null;
    await app.salvaSchedaCondomino({ data: { id: 106 } });
    assert.strictEqual(salvati.find((c) => c.id === 106).rappresentante, true);
    assert.strictEqual(salvati.find((c) => c.id === 102).rappresentante, true, 'il flag di chi è uscito è stato tolto');
    const p = app.propostaMillesimi('generale', `${Y}-02-01`);
    const perc = (id) => p.split.find((x) => x.id === id).perc;
    assert.strictEqual(perc(102), 30, 'Aldo era il rappresentante prima di marzo');
    assert.strictEqual(perc(103), 0);
  });

  // ADV-FUNC-017
  describe('ADV-FUNC-017', () => {
    const NOW = Date.UTC(2026, 9, 24);
    const condomini = [{ id: 1, nome: 'Edi Tore', edificioId: 1, uid: 'u-ed', canEdit: true, isAdmin: false, dataIngresso: '2020-01-01' },
      { id: 3, nome: 'Altro', edificioId: 1 }];
    const run = (app, spese, by = 'u-ed') => app.segnalazioniEditor({ condomini, edificioId: 1, adesso: NOW, entrate: [], spese,
      autore: () => ({ by, at: NOW - 86400000 }) });
    it('editor con la quota a 0% o senza riga, presente alla data: segnalato con il motivo; senza data valida o non ancora entrato: no', () => {
      const app = loadApp();
      const spese = [
        { id: 20, edificioId: 1, titolo: 'A', data: '2026-10-01', split: [{ id: 1, perc: 0 }, { id: 3, perc: 100 }] },
        { id: 21, edificioId: 1, titolo: 'B', data: '2026-10-01', split: [{ id: 3, perc: 100 }] },
        { id: 22, edificioId: 1, titolo: 'C', data: '2019-10-01', split: [{ id: 3, perc: 100 }] }, // l'editor non c'era ancora
        { id: 23, edificioId: 1, titolo: 'D', split: [{ id: 3, perc: 100 }] }, // nessuna data
        { id: 24, edificioId: 1, titolo: 'E', data: '2026-10-01', split: [{ id: 1, perc: 40 }, { id: 3, perc: 60 }] },
      ];
      const r = run(app, spese);
      assert.deepStrictEqual(Array.from(r.map((x) => x.rec.id).sort()), [20, 21, 24]);
      assert.strictEqual(r.find((x) => x.rec.id === 20).quota, 'zero');
      assert.strictEqual(r.find((x) => x.rec.id === 21).quota, 'assente');
      assert.strictEqual(r.find((x) => x.rec.id === 24).quota, undefined);
      assert.deepStrictEqual(Array.from(run(app, spese, 'u-altro')), [], 'scritta da un altro: nessuna segnalazione');
    });
    it('il riquadro in pagina dice quando la quota dell\'editor è a 0% o tolta', () => {
      const app = loadApp();
      app.ricordaAutore('buildings/1/expenses/20', { _updatedBy: 'u-ed', _updatedAt: { toMillis: () => Date.now() } });
      app.__set('state', { ...app.__get('state'), edificioAttivo: 1, user: { isAdmin: true }, condomini, entrate: [],
        spese: [{ id: 20, edificioId: 1, titolo: 'Luce', data: '2026-10-01', split: [{ id: 3, perc: 100 }] }] });
      const html = app.renderSegnalazioniEditor('spesa');
      assert.ok(/senza la sua riga/.test(html) && html.includes('Edi Tore'), html);
    });
  });

  // ADV-FUNC-026 e CR-004
  describe('millesimi: rilettura all\'apertura della scheda spesa e nessun ridisegno con scheda aperta', () => {
    const snapDi = (ms, extra) => ({ exists: () => true, data: () => ({ ...extra, aggiornatoIl: { toMillis: () => ms } }) });
    const fb = (lettura) => ({ auth: { currentUser: { uid: 'u' } }, db: {}, doc: (_db, ...p) => ({ path: p.join('/') }), getDoc: async () => lettura() });
    it('ADV-FUNC-026: rileggiMillesimiSeVecchi legge solo se l\'ultima lettura ha più di un minuto; "+ Aggiungi spesa" aspetta la lettura prima di aprire la scheda', async () => {
      let versione = 1; let letture = 0;
      const app = base();
      app._fb = fb(() => { letture++; return snapDi(versione, { attivo: true, dal: `${Y}-01-01`, tabelle: [{ id: 't' + versione }] }); });
      app.__get('_millesimi')[1] = { attivo: true, dal: `${Y}-01-01`, tabelle: [{ id: 't1' }] };
      app.__get('_millesimiLetti')[1] = Date.now();
      versione = 2;
      await app.rileggiMillesimiSeVecchi();
      assert.strictEqual(letture, 0, 'letti da poco: nessuna lettura');
      app.__get('_millesimiLetti')[1] = Date.now() - 120000;
      const btn = {};
      app.document.getElementById = (id) => (id === 'btn-add-spesa' ? btn : null);
      app.document.querySelectorAll = () => [];
      app.bindAzioniSpese();
      const ordine = [];
      const setStatePrima = app.setState;
      app.setState = (p) => { if (p.modal) ordine.push('apre:' + app.tabelleMillesimi(1)[0].id); return setStatePrima(p); };
      await btn.onclick();
      assert.strictEqual(letture, 1);
      assert.deepStrictEqual(ordine, ['apre:t2'], 'la scheda si apre dopo la rilettura, con la tabella nuova');
    });
    it('CR-004: se durante la lettura si apre una scheda, i dati si aggiornano ma la pagina non viene ridisegnata', async () => {
      let versione = 1;
      const app = base({ page: 'spese', modal: null, user: { id: 1 } });
      app._fb = fb(() => snapDi(versione, { attivo: true, dal: `${Y}-01-01`, tabelle: [{ id: 't' + versione }] }));
      let ridisegni = 0; app.renderPresto = () => { ridisegni++; };
      app.assicuraMillesimi();
      await new Promise((r) => setTimeout(r, 0));
      const dopoPrima = ridisegni;
      versione = 2;
      app.__get('_millesimiLetti')[1] = Date.now() - 120000;
      app._fb = fb(() => { app.__set('state', { ...app.__get('state'), modal: { type: 'spesa', data: null } }); return snapDi(versione, { attivo: true, dal: `${Y}-01-01`, tabelle: [{ id: 't2' }] }); });
      app.assicuraMillesimi();
      await new Promise((r) => setTimeout(r, 0));
      assert.strictEqual(app.tabelleMillesimi(1)[0].id, 't2');
      assert.strictEqual(ridisegni, dopoPrima, 'ridisegno con una scheda aperta');
    });
  });

  // ADV-TECH-020
  describe('ADV-TECH-020: il subentro calcola il passaggio delle quote dopo la conferma dei condomini', () => {
    const prepara = () => {
      const app = base({ condomini: [{ id: 201, nome: 'Dario', appartamento: 'Int. 3', edificioId: 1 }],
        spese: [{ id: 5, data: `${Y + 1}-03-01`, titolo: 'Tetto', preventivo: '1000', consuntivo: '', edificioId: 1, split: [{ id: 201, perc: 100 }] }],
        modal: { type: 'subentro', data: { id: 201 } } });
      let sblocca; const attesa = new Promise((r) => { sblocca = r; });
      const salvateSpese = [];
      app.save = (k, v) => { if (k === 'cm_condomini') return attesa.then(() => true); salvateSpese.push(v); return Promise.resolve(true); };
      const campi = { 'btn-sub-conferma': { dataset: { cond: '201' } }, 'sub-data': { value: `${Y + 1}-01-01` }, 'sub-nome': { value: 'Elena' },
        'sub-email': { value: '' }, 'sub-ruolo': { value: 'lettura' }, 'sub-passa': { checked: true }, 'sub-err': { style: {} } };
      app.document.getElementById = (id) => campi[id] || null;
      app.bindSchedaSubentro();
      return { app, salvateSpese, sblocca, clic: () => campi['btn-sub-conferma'].onclick() };
    };
    it('una correzione fatta durante l\'attesa resta, e la quota passa comunque sulla spesa aggiornata', async () => {
      const t = prepara();
      const p = t.clic();
      await new Promise((r) => setTimeout(r, 0));
      t.app.__set('state', { ...t.app.__get('state'), spese: t.app.__get('state').spese.map((s) => ({ ...s, titolo: 'Tetto corretto', preventivo: '1200' })) });
      t.sblocca();
      await p;
      assert.strictEqual(t.salvateSpese.length, 1);
      const s = t.salvateSpese[0][0];
      assert.strictEqual(s.titolo, 'Tetto corretto', 'la correzione è stata annullata');
      assert.strictEqual(s.preventivo, '1200');
      assert.strictEqual(s.split.find((x) => x.id === 201).perc, 0);
      assert.strictEqual(s.split.find((x) => x.id !== 201).perc, 100);
      assert.ok(t.app.__alerts.some((m) => /^✅ Subentro registrato/.test(m)), t.app.__alerts.join('|'));
    });
    it('se nell\'attesa la spesa diventa consuntivata (quota non più passabile) non si dice "Subentro registrato" e basta: avviso', async () => {
      const t = prepara();
      const p = t.clic();
      await new Promise((r) => setTimeout(r, 0));
      t.app.__set('state', { ...t.app.__get('state'), spese: t.app.__get('state').spese.map((s) => ({ ...s, consuntivo: '900' })) });
      t.sblocca();
      await p;
      assert.strictEqual(t.salvateSpese.length, 0, 'quote passate su una spesa consuntivata');
      assert.ok(!t.app.__alerts.some((m) => /^✅ Subentro registrato/.test(m)), t.app.__alerts.join('|'));
      assert.ok(t.app.__alerts.some((m) => /nessuna quota è passata/.test(m)), t.app.__alerts.join('|'));
    });
  });

  // CR-005
  describe('CR-005: spesa vecchia con la quota di un condomino che non esiste più', () => {
    const prova = (split) => {
      const app = base({ condomini: [{ id: 101, nome: 'Anna', appartamento: 'Int. 1', edificioId: 1 }, { id: 102, nome: 'Bruno', appartamento: 'Int. 2', edificioId: 1 }] });
      let salvati = 0; app.save = () => { salvati++; };
      const err = { style: {}, textContent: '' };
      const campi = { 'm-titolo': { value: 'Tetto' }, 'm-desc': { value: '' }, 'm-cat': { value: 'tetto' }, 'm-tipo': { value: 'ordinaria' }, 'm-prev': { value: '' },
        'm-cons': { value: '1000' }, 'm-data': { value: `${Y}-03-01` }, 'm-err': err };
      app.document.getElementById = (id) => campi[id] || null;
      app.document.querySelectorAll = (sel) => (sel === '.split-perc-inp' ? [[101, 30], [102, 30]].map(([id, p]) => ({ dataset: { cid: String(id) }, value: String(p) })) : []);
      const vecchia = { id: 1, titolo: 'Tetto', categoria: 'tetto', tipoSpesa: 'ordinaria', consuntivo: '1000', data: `${Y}-03-01`, edificioId: 1, allegati: [], split };
      return app.salvaSchedaSpesa({ data: vecchia }).then(() => ({ err, salvati: () => salvati }));
    };
    it('resta bloccata al 100% ma il messaggio spiega la causa e cosa fare', async () => {
      const r = await prova([{ id: 101, perc: 30 }, { id: 102, perc: 30 }, { id: 999, perc: 40 }]);
      assert.strictEqual(r.salvati(), 0, 'il blocco al 100% è stato indebolito');
      assert.ok(/non esiste più/.test(r.err.textContent) && /40\.00%/.test(r.err.textContent) && /Parti uguali/.test(r.err.textContent), r.err.textContent);
    });
    it('senza quote orfane il messaggio resta quello generico', async () => {
      const r = await prova([{ id: 101, perc: 30 }, { id: 102, perc: 30 }]);
      assert.strictEqual(r.salvati(), 0);
      assert.ok(/ora fa 60\.00%/.test(r.err.textContent) && !/non esiste più/.test(r.err.textContent), r.err.textContent);
    });
  });

  // CR-006
  it('CR-006: piano rate di un anno passato: lo stato si rilegge dopo la conferma, così un versamento arrivato nell\'attesa non viene perso', async () => {
    const vecchia = { id: 50, condominoId: 101, importo: '10', importoPrevisto: '10', data: `${Y - 1}-03-01`, descrizione: 'Rata', categoria: 'quote', edificioId: 1, previsionale: true, pianoRataAuto: true, pianoAnno: Y - 1, pianoRataN: 1 };
    const app = base({ condomini: [{ id: 101, nome: 'Anna', appartamento: 'Int. 1', edificioId: 1 }], entrate: [vecchia], filterAnno: Y - 1, filterAnni: [Y - 1] });
    let salvate = null; app.save = (k, v) => { salvate = v; };
    app.chiedi = async () => {
      // nell'attesa arriva un versamento nuovo
      app.__set('state', { ...app.__get('state'), entrate: [...app.__get('state').entrate, { id: 777, condominoId: 101, importo: '5', data: `${Y}-01-02`, edificioId: 1 }] });
      return true;
    };
    const btn = {};
    app.document.getElementById = (id) => (id === 'btn-conferma-rate-piano' ? btn : null);
    app.document.querySelectorAll = () => [];
    app.bindAzioniEntrate();
    await btn.onclick();
    assert.ok(salvate, 'non salvato');
    assert.ok(salvate.some((e) => e.id === 777), 'il versamento arrivato nell\'attesa è stato cancellato dalla copia vecchia');
    assert.ok(!salvate.some((e) => e.id === 50), 'la proposta non più necessaria doveva essere rimossa');
  });
});

// ─── Lotto B (2026-10-25) ───────────────────────────────────────────────────
describe('UNIT — lotto B: data di ingresso, serie con importo vecchio, tipi di allegato, versione dopo setUserRole', () => {
  const fs = require('fs');
  const path = require('path');
  const Y = new Date().getFullYear();
  const base = (extra = {}) => {
    const app = loadApp();
    app.__set('state', { ...app.__get('state'), edificioAttivo: 1, edifici: [{ id: 1, nome: 'E' }], fornitori: [], pendingFiles: [], spese: [], entrate: [], page: 'spese', filterAnno: Y,
      user: { id: 102, nome: 'Bruno', isAdmin: true, canEdit: true, edificioId: 1 },
      condomini: [{ id: 102, nome: 'Bruno', appartamento: 'Int. 2', edificioId: 1 }], ...extra });
    app.setState = (p) => app.__set('state', { ...app.__get('state'), ...p });
    return app;
  };

  // DAT-001: stessa semantica del server (functions/notifiche.js, ingressoFuturo)
  describe('DAT-001: data di ingresso', () => {
    const male = ['25/12/2099', '2099', '2099-12', '2099-1-5', '31-12-2099', '2099-13-45', '2099-02-30', '2099-12-01T10:00', ' 2099-12-01', 'domani', '', 20991201, true, { a: 1 }, ['2099-12-01'], null, undefined];
    it('una data non ISO o impossibile vale "nessuna data": non esclude dalle email né segnala un ingresso futuro', () => {
      const app = loadApp();
      for (const dataIngresso of male) {
        assert.strictEqual(app.ingressoFuturo({ dataIngresso }, '2026-11-30'), false, JSON.stringify(dataIngresso));
        assert.strictEqual(app.motivoNoEmail({ email: 'a@qa.test', dataIngresso }), null, JSON.stringify(dataIngresso));
      }
      assert.strictEqual(app.ingressoFuturo({ dataIngresso: '2099-12-01' }, '2026-11-30'), true);
      assert.strictEqual(app.ingressoFuturo({ dataIngresso: '2026-11-30' }, '2026-11-30'), false);
      assert.strictEqual(app.motivoNoEmail({ email: 'a@qa.test', dataIngresso: '2099-12-01' }), 'non ancora entrato');
    });
    it('client e server danno lo stesso risultato su ogni caso', () => {
      process.env.FUNCTIONS_EMULATOR = 'true';
      const fnReq = require('module').createRequire(path.join(__dirname, '..', 'functions', 'package.json'));
      const server = fnReq('./notifiche')._test.ingressoFuturo;
      const app = loadApp();
      for (const dataIngresso of [...male, '2099-12-01', '2026-11-30', '2026-11-29', '2024-02-29', '2099-02-29', '2100-02-29', '2000-01-01']) {
        assert.strictEqual(app.ingressoFuturo({ dataIngresso }, '2026-11-30'), server({ dataIngresso }, '2026-11-30'), JSON.stringify(dataIngresso));
      }
    });
    it('la lista dei condomini non mostra "Entra il" per una data non ISO', () => {
      const app = base({ page: 'condomini', condomini: [
        { id: 102, nome: 'Bruno', appartamento: 'Int. 2', edificioId: 1, dataIngresso: '25/12/2099' },
        { id: 103, nome: 'Carla', appartamento: 'Int. 3', edificioId: 1, dataIngresso: '2099-12-25' }] });
      const html = app.renderCondomini();
      assert.strictEqual((html.match(/Entra il/g) || []).length, 1, 'solo la data ISO futura');
    });
  });

  // DAT-003: la serie copia l'importo della spesa; un importo vecchio non valido farebbe rifiutare l'intero lotto
  describe('DAT-003: spesa ricorrente con un importo vecchio non valido', () => {
    const campi = (extra = {}) => ({ 'm-titolo': { value: 'Pulizie' }, 'm-desc': { value: '' }, 'm-cat': { value: 'pulizie' }, 'm-tipo': { value: 'ordinaria' },
      'm-prev': { value: '' }, 'm-cons': { value: '' }, 'm-data': { value: `${Y}-03-01` }, 'm-err': { style: {}, textContent: '' },
      'm-ricorrente': { checked: false }, 'm-freq': { value: 'mensile' }, 'm-freq-fine': { value: '' }, 'm-serie-applica': { checked: false }, ...extra });
    const prova = async (vecchia, c, spese = vecchia ? [vecchia] : []) => {
      const app = base({ spese });
      let salvate = null; app.save = (k, v) => { salvate = v; };
      app.document.getElementById = (id) => c[id] || null;
      app.document.querySelectorAll = (sel) => (sel === '.split-perc-inp' ? [{ dataset: { cid: '102' }, value: '100' }] : []);
      await app.salvaSchedaSpesa({ data: vecchia });
      return { salvate, errore: c['m-err'].textContent, avvisi: app.__alerts };
    };
    const vecchia = (extra = {}) => ({ id: 9, titolo: 'Pulizie', categoria: 'pulizie', tipoSpesa: 'ordinaria', data: `${Y}-03-01`, split: [{ id: 102, perc: 100 }], edificioId: 1, allegati: [], ...extra });

    it('nuova serie con importo valido: crea la spesa e le occorrenze', async () => {
      const r = await prova(null, campi({ 'm-prev': { value: '90' }, 'm-ricorrente': { checked: true }, 'm-freq-fine': { value: `${Y}-06-30` } }));
      assert.ok(r.salvate && r.salvate.length === 4, 'attese 4 spese (marzo-giugno), ottenute ' + (r.salvate && r.salvate.length));
      assert.ok(r.salvate.every((s) => s.preventivo === '90'));
    });
    it('una spesa vecchia con preventivo 0 o consuntivo negativo, resa ricorrente: nessun salvataggio, messaggio chiaro nella scheda', async () => {
      for (const [prev, cons] of [['0', ''], ['', '-50'], ['0', '500'], ['10.999', ''], ['', '0.00']]) {
        const v = vecchia({ preventivo: prev, consuntivo: cons });
        const r = await prova(v, campi({ 'm-prev': { value: prev }, 'm-cons': { value: cons }, 'm-ricorrente': { checked: true }, 'm-freq-fine': { value: `${Y}-06-30` } }));
        assert.strictEqual(r.salvate, null, `salvata la serie con ${prev}/${cons}`);
        assert.match(r.errore, /occorrenze della serie copiano l'importo/);
        assert.match(r.errore, /maggiore di zero/);
      }
    });
    it('cambiare la data di fine di una serie esistente con un importo vecchio non valido è bloccato allo stesso modo', async () => {
      const v = vecchia({ preventivo: '0', consuntivo: '', ricorrente: true, frequenza: 'mensile', ricorrenzaFine: `${Y}-05-31`, ricGruppoId: 'g1' });
      const r = await prova(v, campi({ 'm-prev': { value: '0' }, 'm-ricorrente': { checked: true }, 'm-freq-fine': { value: `${Y}-08-31` } }));
      assert.strictEqual(r.salvate, null);
      assert.match(r.errore, /occorrenze della serie/);
    });
    it('"Applica anche alle successive" con un preventivo vecchio non valido che le successive non hanno: bloccato; se è lo stesso valore, no', async () => {
      const v = vecchia({ preventivo: '0', consuntivo: '500', ricorrente: true, frequenza: 'mensile', ricorrenzaFine: `${Y}-05-31`, ricGruppoId: 'g1' });
      const succ = (prev) => ({ ...vecchia({ id: 10, data: `${Y}-04-01`, preventivo: prev, consuntivo: '', ricorrente: true, frequenza: 'mensile', ricorrenzaFine: `${Y}-05-31`, ricGruppoId: 'g1' }) });
      const c = () => campi({ 'm-prev': { value: '0' }, 'm-cons': { value: '500' }, 'm-ricorrente': { checked: true }, 'm-freq-fine': { value: `${Y}-05-31` }, 'm-serie-applica': { checked: true } });
      let r = await prova(v, c(), [v, succ('90')]);
      assert.strictEqual(r.salvate, null, 'scriverebbe 0 nelle successive');
      assert.match(r.errore, /occorrenze della serie copiano/);
      r = await prova(v, c(), [v, succ('0')]);
      assert.ok(r.salvate, 'le successive hanno già lo stesso valore: la regola le lascia passare');
    });
    it('senza serie, una spesa vecchia con un importo non valido lasciato com\'è si salva come prima', async () => {
      const v = vecchia({ preventivo: '0', consuntivo: '500' });
      const r = await prova(v, campi({ 'm-prev': { value: '0' }, 'm-cons': { value: '500' } }));
      assert.ok(r.salvate, 'bloccata una modifica che non crea occorrenze');
    });
    it('un importo valido corretto sulla spesa permette di creare la serie', async () => {
      const v = vecchia({ preventivo: '0', consuntivo: '' });
      const r = await prova(v, campi({ 'm-prev': { value: '120' }, 'm-ricorrente': { checked: true }, 'm-freq-fine': { value: `${Y}-05-31` } }));
      assert.ok(r.salvate && r.salvate.length === 3, 'serie non creata (attese la spesa e 2 occorrenze)');
    });
  });

  // DAT-009: le tre copie dell'elenco dei tipi di allegato devono coincidere
  describe('DAT-009: elenco dei tipi di allegato uguale in regole Firestore, regole Storage e pagina', () => {
    const root = path.join(__dirname, '..');
    const leggi = (f) => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
    // regole Firestore: la quarta parte dell'espressione regolare di validAllegato (dopo l'ultimo "<("), a corrispondenza intera
    const daFirestore = () => {
      const m = /function validAllegato\(a\) \{[\s\S]*?\.matches\(\s*"((?:[^"\\]|\\.)*)"\)/.exec(leggi('firestore.rules'));
      assert.ok(m, 'validAllegato non trovata in firestore.rules');
      const lett = m[1].replace(/\\\\/g, '\\'); // dentro la stringa delle regole la barra è raddoppiata
      const mime = lett.slice(lett.lastIndexOf('<(') + 1);
      return new RegExp('^' + mime + '$');
    };
    // regole Storage: le espressioni di allowedType, in alternativa tra loro, a corrispondenza intera
    const daStorage = () => {
      const corpo = /function allowedType\(\) \{([\s\S]*?)\n\}/.exec(leggi('storage.rules'));
      assert.ok(corpo, 'allowedType non trovata in storage.rules');
      const parti = [...corpo[1].matchAll(/contentType\.matches\('((?:[^'\\]|\\.)*)'\)/g)].map((x) => x[1].replace(/\\\\/g, '\\'));
      assert.ok(parti.length >= 4, 'attese almeno 4 espressioni, trovate ' + parti.length);
      return new RegExp('^(?:' + parti.join('|') + ')$');
    };
    const tipi = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/heic', 'image/heif', 'image/bmp', 'image/tiff', 'image/svg+xml', 'image/x-icon', 'image/avif',
      'application/pdf', 'application/octet-stream', 'application/msword', 'application/rtf', 'application/zip', 'application/json', 'application/javascript', 'application/xhtml+xml',
      'application/vnd.ms-excel', 'application/vnd.ms-powerpoint', 'application/vnd.ms-word',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
      'application/vnd.openxmlformats-officedocument.evil', 'application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.spreadsheet',
      'application/vnd.oasis.opendocument.presentation', 'application/vnd.oasis.opendocument.graphics', 'application/vnd.oasis.opendocument.formula',
      'application/vnd.oasis.opendocument.formula-template', 'text/plain', 'text/csv', 'text/html', 'text/css', 'text/javascript', 'text/xml',
      'APPLICATION/PDF', 'application/pdf;x=1', 'image/png<x', 'pdf', '', ' image/png', 'image/png\n'];
    it('le tre copie accettano e rifiutano esattamente gli stessi tipi', () => {
      const app = loadApp();
      const client = app.__get('MIME_ALLEGATI');
      const fire = daFirestore();
      const stor = daStorage();
      const accettati = tipi.filter((t) => fire.test(t));
      assert.ok(accettati.length >= 20 && accettati.length < tipi.length, 'elenco di prova non significativo: ' + accettati.length);
      for (const t of tipi) {
        assert.strictEqual(client.test(t), fire.test(t), `pagina e regole Firestore divergono su "${t}"`);
        assert.strictEqual(stor.test(t), fire.test(t), `regole Storage e Firestore divergono su "${t}"`);
      }
    });
    it('il tipo scelto dalla pagina per un file senza tipo (octet-stream) è ammesso da tutte e tre', () => {
      const app = loadApp();
      assert.ok(app.__get('MIME_ALLEGATI').test('application/octet-stream') && daFirestore().test('application/octet-stream') && daStorage().test('application/octet-stream'));
    });
    it('la pagina ha una sola copia dell\'elenco (MIME_ALLEGATI): nessun\'altra espressione con gli stessi tipi in js/', () => {
      const trovati = [];
      const visita = (dir) => {
        for (const n of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
          const rel = path.posix.join(dir, n.name);
          if (n.isDirectory()) { if (n.name !== 'vendor') visita(rel); } else if (n.name.endsWith('.js')) {
            if (/oasis\\?\.opendocument/.test(leggi(rel))) trovati.push(rel);
          }
        }
      };
      visita('js');
      assert.deepStrictEqual(trovati, ['js/sezioni/allegati.js']);
    });
  });

  // ADV-TECH-021: setUserRole scrive la scheda lato server; la pagina riprende la versione prima di salvare la stessa scheda
  describe('ADV-TECH-021: versione della scheda dopo setUserRole', () => {
    const finta = (leggi) => ({ db: {}, doc: (db, ...p) => ({ path: p.join('/') }), getDoc: leggi });
    it('rinfrescaVersione memorizza la versione scritta dal server, così il salvataggio della scheda non risulta un conflitto', async () => {
      const app = base();
      app.window._fb = finta(async () => ({ exists: () => true, data: () => ({ id: 103, _updatedBy: 'u-admin1', _updatedAt: { toMillis: () => 4242 } }) }));
      app.__get('_versioni').cm_condomini = new Map([['buildings/1/members/103', 1111]]);
      await app.rinfrescaVersione('cm_condomini', { id: 103, edificioId: 1 });
      assert.strictEqual(app.__get('_versioni').cm_condomini.get('buildings/1/members/103'), 4242);
    });
    it('se la lettura non riesce la versione si dimentica (nessun controllo, come prima) e non si lancia nessun errore', async () => {
      const app = base();
      app.window._fb = finta(async () => { throw new Error('rete'); });
      app.__get('_versioni').cm_condomini = new Map([['buildings/1/members/103', 1111]]);
      await app.rinfrescaVersione('cm_condomini', { id: 103, edificioId: 1 });
      assert.ok(!app.__get('_versioni').cm_condomini.has('buildings/1/members/103'));
    });
    it('la scheda che cambia ruolo riprende la versione dopo setUserRole e prima di salvare', async () => {
      const app = base({ condomini: [{ id: 103, nome: 'Marta', appartamento: 'Int. 3', edificioId: 1, uid: 'u-member1' }] });
      const ordine = [];
      app.window._fb = { ...finta(async () => { ordine.push('lettura'); return { exists: () => true, data: () => ({ id: 103, _updatedAt: { toMillis: () => 5 } }) }; }),
        functionsInstance: {}, httpsCallable: () => async () => { ordine.push('setUserRole'); return { data: { ok: true } }; } };
      app.save = () => { ordine.push('salvataggio'); return true; };
      const sel = { dataset: { ruoloId: '103' }, value: 'modifica' };
      app.document.querySelectorAll = (q) => (q === '.ruolo-select' ? [sel] : []);
      app.bindAzioniCondomini();
      await sel.onchange();
      assert.deepStrictEqual(ordine, ['setUserRole', 'lettura', 'salvataggio']);
    });
  });

  // ADV-TECH-023: la versione si adotta solo se sul server sono cambiati soltanto i flag di ruolo
  describe('ADV-TECH-023: rinfrescaVersione non assorbe le modifiche di altri', () => {
    const finta = (dati) => ({ db: {}, doc: (db, ...p) => ({ path: p.join('/') }), getDoc: async () => ({ exists: () => true, data: () => dati }) });
    const caricato = { id: 103, nome: 'Marta', appartamento: 'Int. 3', edificioId: 1, uid: 'u-member1', isAdmin: false, canEdit: false, email: 'm@qa.test' };
    const prepara = (dati) => {
      const app = base();
      app.window._fb = finta(dati);
      app.__get('_versioni').cm_condomini = new Map([['buildings/1/members/103', 1111]]);
      app.__get('_serverSnap').cm_condomini = [caricato];
      return app;
    };
    const scheda = (extra, ms) => ({ id: 103, nome: 'Marta', appartamento: 'Int. 3', edificioId: 1, uid: 'u-member1', isAdmin: false, canEdit: false,
      _updatedBy: 'u-admin1', _updatedAt: { toMillis: () => ms }, ...extra });
    it('se sul server cambiano solo i flag di ruolo la versione nuova si adotta', async () => {
      const app = prepara(scheda({ canEdit: true }, 4242));
      await app.rinfrescaVersione('cm_condomini', { id: 103, edificioId: 1 });
      assert.strictEqual(app.__get('_versioni').cm_condomini.get('buildings/1/members/103'), 4242);
    });
    it('se un altro amministratore ha cambiato altro (appartamento) la versione resta quella vecchia e il salvataggio dà conflitto', async () => {
      const app = prepara(scheda({ canEdit: true, appartamento: 'Int. 9' }, 4242));
      await app.rinfrescaVersione('cm_condomini', { id: 103, edificioId: 1 });
      assert.strictEqual(app.__get('_versioni').cm_condomini.get('buildings/1/members/103'), 1111, 'la modifica di un altro è stata assorbita');
      await assert.rejects(() => app.controllaConflitti('cm_condomini', [[{ path: 'buildings/1/members/103' }, {}, { merge: true }]]), (e) => e.code === 'conflitto');
    });
    it('anche un campo aggiunto o tolto da un altro, o un record archiviato/cancellato, non viene assorbito', async () => {
      for (const extra of [{ dataUscita: '2026-12-01' }, { nome: undefined }, { _deleted: true }]) {
        const app = prepara(scheda({ canEdit: true, ...extra }, 4242));
        await app.rinfrescaVersione('cm_condomini', { id: 103, edificioId: 1 });
        assert.strictEqual(app.__get('_versioni').cm_condomini.get('buildings/1/members/103'), 1111, JSON.stringify(extra));
      }
    });
  });

  // ADV-TECH-024: il subentro non lascia una scheda spesa con la ripartizione di prima
  describe('ADV-TECH-024: scheda spesa aperta mentre il subentro attende la conferma', () => {
    const prepara = (modal) => {
      const app = base({ condomini: [{ id: 201, nome: 'Dario', appartamento: 'Int. 3', edificioId: 1 }],
        spese: [{ id: 5, data: `${Y + 1}-03-01`, titolo: 'Tetto', preventivo: '1000', consuntivo: '', edificioId: 1, split: [{ id: 201, perc: 100 }] },
          { id: 6, data: `${Y + 1}-04-01`, titolo: 'Altra', preventivo: '500', consuntivo: '', edificioId: 1, split: [{ id: 201, perc: 100 }] }],
        modal: { type: 'subentro', data: { id: 201 } } });
      let sblocca; const attesa = new Promise((r) => { sblocca = r; });
      app.save = (k) => (k === 'cm_condomini' ? attesa.then(() => true) : Promise.resolve(true));
      const campi = { 'btn-sub-conferma': { dataset: { cond: '201' } }, 'sub-data': { value: `${Y + 1}-01-01` }, 'sub-nome': { value: 'Elena' },
        'sub-email': { value: '' }, 'sub-ruolo': { value: 'lettura' }, 'sub-passa': { checked: true }, 'sub-err': { style: {} } };
      app.document.getElementById = (id) => campi[id] || null;
      app.bindSchedaSubentro();
      return { app, sblocca, clic: () => campi['btn-sub-conferma'].onclick() };
    };
    const apriNellAttesa = async (t, id) => {
      const p = t.clic();
      await new Promise((r) => setTimeout(r, 0));
      const s = t.app.__get('state');
      t.app.__set('state', { ...s, modal: { type: 'spesa', data: { ...s.spese.find((x) => x.id === id) } } }); // ripartizione di prima
      t.sblocca();
      await p;
    };
    it('la scheda della spesa toccata dal subentro si chiude, con avviso: non si può salvare con la ripartizione vecchia', async () => {
      const t = prepara();
      await apriNellAttesa(t, 5);
      const st = t.app.__get('state');
      assert.strictEqual(st.modal, null, 'la scheda con la ripartizione vecchia è rimasta aperta');
      assert.ok(st.spese.find((x) => x.id === 5).split.some((x) => x.id !== 201 && x.perc === 100), 'quota non passata');
      assert.ok(t.app.__alerts.some((m) => /scheda della spesa/.test(m)), t.app.__alerts.join('|'));
    });
    it('una scheda aperta su una spesa non toccata, o una scheda nuova, resta aperta', async () => {
      const t = prepara();
      const p = t.clic();
      await new Promise((r) => setTimeout(r, 0));
      t.app.__set('state', { ...t.app.__get('state'), modal: { type: 'spesa', data: null } });
      t.sblocca();
      await p;
      assert.strictEqual(t.app.__get('state').modal?.type, 'spesa');
    });
  });

  // ADV-TECH-025: la data di uscita conta solo se è AAAA-MM-GG esistente, come sul server
  describe('ADV-TECH-025: data di uscita non ISO', () => {
    const male = ['01/12/2099', '25/12/2099', '2099', '2099-12', '2099-1-5', '31-12-2099', '2099-13-45', '2099-02-30', '2099-12-01T10:00', ' 2099-12-01', 'domani', '', 20991201, true, { a: 1 }, ['2099-12-01'], null, undefined];
    it('una data non ISO vale "nessuna uscita": non archivia, non esclude dalle email né da WhatsApp', () => {
      const app = loadApp();
      for (const dataUscita of male) {
        assert.strictEqual(app.uscitaArrivata({ dataUscita }, '2026-11-30'), false, JSON.stringify(dataUscita));
        assert.strictEqual(app.uscitaFutura({ dataUscita }, '2026-11-30'), false, JSON.stringify(dataUscita));
        assert.strictEqual(app.motivoNoEmail({ email: 'a@qa.test', dataUscita }), null, JSON.stringify(dataUscita));
      }
      assert.strictEqual(app.uscitaArrivata({ dataUscita: '2026-11-30' }, '2026-11-30'), true);
      assert.strictEqual(app.uscitaArrivata({ dataUscita: '2026-11-29' }, '2026-11-30'), true);
      assert.strictEqual(app.uscitaFutura({ dataUscita: '2099-12-01' }, '2026-11-30'), true);
      assert.strictEqual(app.motivoNoEmail({ email: 'a@qa.test', dataUscita: '2020-01-01' }), 'archiviato');
    });
    it('client e server danno lo stesso risultato su ogni caso', () => {
      process.env.FUNCTIONS_EMULATOR = 'true';
      const fnReq = require('module').createRequire(path.join(__dirname, '..', 'functions', 'package.json'));
      const server = fnReq('./notifiche')._test.uscitaArrivata;
      const app = loadApp();
      for (const dataUscita of [...male, '2099-12-01', '2026-11-30', '2026-11-29', '2024-02-29', '2099-02-29', '2100-02-29', '2000-01-01']) {
        assert.strictEqual(app.uscitaArrivata({ dataUscita }, '2026-11-30'), server({ dataUscita }, '2026-11-30'), JSON.stringify(dataUscita));
      }
    });
    it('la lista dei condomini non archivia chi ha una data di uscita non ISO', () => {
      const app = base({ page: 'condomini', condomini: [
        { id: 102, nome: 'Bruno', appartamento: 'Int. 2', edificioId: 1, dataUscita: '01/12/2099' },
        { id: 103, nome: 'Carla', appartamento: 'Int. 3', edificioId: 1, dataUscita: '2020-01-01' }] });
      const html = app.renderCondomini();
      assert.ok(/Bruno/.test(html) && /Carla/.test(html));
      assert.strictEqual((html.match(/Esce il/g) || []).length, 0, 'una data non ISO non è un\'uscita futura');
    });
  });
});
