// Banco di misura delle prestazioni: l'app vera in Chromium contro gli
// emulatori (dati di qa/bench/seed-volume.js). Non cambia il codice dell'app:
// avvolge solo, dalla pagina di prova, alcune sue funzioni globali per
// cronometrarle (fbLoadAll, whoami, fbLoadBuildings, render, getDoc/getDocs,
// writeBatch). Ogni misura è ripetuta REP volte; nel JSON ci sono le singole
// ripetizioni e la mediana. Risultati in qa/out/bench/<BENCH_LABEL>-V<BENCH_VOLUME>.json.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { PASSWORD } = require('../seed');

const PAGINA = '/qa/out/harness.html';
const REP = Number(process.env.BENCH_REP || 3);
const REP_SCRITTURE = Number(process.env.BENCH_REP_SCRITTURE || REP); // scritture: si può ridurre per i volumi alti
const RENDER_LEGGERO = process.env.BENCH_RENDER_LEGGERO === "1"; // volumi alti: niente variante con layout per le pagine lente (>2 s)
const VOLUME = Number(process.env.BENCH_VOLUME || 1);
const LABEL = process.env.BENCH_LABEL || 'prima';
const QUIETE_MS = 400;     // rete "ferma": nessuna attività per questo tempo
const QUIETE_MAX = 30_000; // oltre, si smette di aspettare (annotato)
const RUOLI = [
  { ruolo: 'admin', email: 'admin1@qa.test' },
  { ruolo: 'condomino', email: 'member1@qa.test' },
];
const PAGINE = ['dashboard', 'spese', 'entrate', 'bilancio', 'confronto', 'fornitori', 'vita', 'condomini', 'impostazioni'];
const TITOLI = { dashboard: 'Dashboard', spese: 'Spese', entrate: 'Entrate', bilancio: 'Bilancio', confronto: 'Confronto anni',
  fornitori: 'Fornitori', vita: 'Vita condominiale', condomini: 'Condomini', impostazioni: 'Impostazioni', ricerca: 'Ricerca' };
const PAROLA = 'pulizie';

const risultati = { label: LABEL, volume: VOLUME, ripetizioni: REP, ripetizioniScritture: REP_SCRITTURE, renderLeggero: RENDER_LEGGERO, quando: new Date().toISOString(), ruoli: {} };
try { risultati.seed = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'out', 'bench', `seed-V${VOLUME}.json`), 'utf8')); } catch { /* facoltativo */ }

// ---------- aiuti ----------
const r1 = (x) => (typeof x === 'number' ? Math.round(x * 10) / 10 : x);
function mediana(a) { const v = a.filter((x) => typeof x === 'number').sort((x, y) => x - y); if (!v.length) return null; const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; }
// Mediana campo per campo di una lista di oggetti con la stessa forma.
function medianaOggetti(lista) {
  const out = {};
  for (const k of Object.keys(lista[0] || {})) {
    const vals = lista.map((o) => o[k]);
    if (vals.every((v) => typeof v === 'number')) out[k] = r1(mediana(vals));
    else if (vals.every((v) => v && typeof v === 'object' && !Array.isArray(v))) out[k] = medianaOggetti(vals);
    else out[k] = vals[0];
  }
  return out;
}
const conRipetizioni = (runs) => ({ mediana: medianaOggetti(runs), min: medianaMin(runs, Math.min), max: medianaMin(runs, Math.max), ripetizioni: runs });
function medianaMin(runs, f) { const o = {}; for (const k of Object.keys(runs[0] || {})) { const v = runs.map((r) => r[k]); if (v.every((x) => typeof x === 'number')) o[k] = r1(f(...v)); } return o; }

const porta = (u) => { const m = /^https?:\/\/[^/]+:(\d+)\//.exec(u); return m ? m[1] : ''; };
const TIPO_PORTA = { 8080: 'firestore', 5001: 'functions', 9099: 'auth', 9199: 'storage', 8911: 'statico' };

// Conta le richieste di rete per servizio e ricorda l'ultima attività.
function traccia(page) {
  const t = { n: {}, ultima: performance.now(), aperte: new Set() };
  const tocca = () => { t.ultima = performance.now(); };
  page.on('request', (r) => { const k = TIPO_PORTA[porta(r.url())] || 'altro'; t.n[k] = (t.n[k] || 0) + 1; t.aperte.add(r); tocca(); });
  page.on('requestfinished', (r) => { t.aperte.delete(r); tocca(); });
  page.on('requestfailed', (r) => { t.aperte.delete(r); tocca(); });
  t.foto = () => ({ ...t.n });
  t.diff = (prima) => { const d = {}; for (const k of new Set([...Object.keys(t.n), ...Object.keys(prima)])) { const x = (t.n[k] || 0) - (prima[k] || 0); if (x) d[k] = x; } d.totale = Object.values(d).reduce((a, b) => a + b, 0); return d; };
  // Aspetta QUIETE_MS senza attività; restituisce l'istante dell'ultima attività.
  t.quiete = async () => {
    const inizio = performance.now();
    while (performance.now() - t.ultima < QUIETE_MS) {
      if (performance.now() - inizio > QUIETE_MAX) return { ultima: t.ultima, interrotta: true };
      await new Promise((r) => setTimeout(r, 50));
    }
    return { ultima: t.ultima, interrotta: false };
  };
  return t;
}

// Strumenti nella pagina (dopo il caricamento, prima del login): cronometri
// attorno alle funzioni dell'app e contatori delle letture/scritture Firestore.
async function strumenta(page) {
  await page.waitForFunction(() => window._fbReady && window._fb && typeof fbLoadBuildings === 'function');
  await page.evaluate(() => {
    if (window.__bench) return;
    const B = window.__bench = { segni: [], render: { n: 0, ms: 0 }, fs: { getDoc: 0, getDocs: 0, docsLetti: 0, batch: 0, docsScritti: 0 }, t0: null };
    const segna = (nome, t) => B.segni.push([nome, t]);
    const avvolgi = (nome) => {
      const orig = window[nome];
      window[nome] = async function (...a) { segna(nome + ':inizio', performance.now()); try { return await orig.apply(this, a); } finally { segna(nome + ':fine', performance.now()); } };
    };
    ['fbLoadAll', 'fbLoadBuildings', 'loadSuperAdminConfig'].forEach(avvolgi);
    const origRender = window.render;
    window.render = function () {
      const t = performance.now();
      const r = origRender.apply(this, arguments);
      const d = performance.now() - t;
      B.render.n++; B.render.ms += d;
      if (state.user && !B.primoRenderUtente) {
        B.primoRenderUtente = { inizio: t, fine: t + d };
        requestAnimationFrame(() => setTimeout(() => { B.primoRenderUtente.dipinto = performance.now(); }, 0));
      }
      return r;
    };
    const fb = window._fb;
    const origCall = fb.httpsCallable;
    fb.httpsCallable = (inst, nome, ...x) => {
      const f = origCall(inst, nome, ...x);
      return async (...a) => { segna(nome + ':inizio', performance.now()); try { return await f(...a); } finally { segna(nome + ':fine', performance.now()); } };
    };
    const origGetDoc = fb.getDoc, origGetDocs = fb.getDocs, origBatch = fb.writeBatch;
    fb.getDoc = async (...a) => { B.fs.getDoc++; const s = await origGetDoc(...a); if (s.exists()) B.fs.docsLetti++; return s; };
    fb.getDocs = async (...a) => { B.fs.getDocs++; const s = await origGetDocs(...a); B.fs.docsLetti += s.size; return s; };
    fb.writeBatch = (...a) => {
      const b = origBatch(...a);
      const set = b.set.bind(b), commit = b.commit.bind(b);
      b.set = (...x) => { B.fs.docsScritti++; return set(...x); };
      b.commit = () => { B.fs.batch++; return commit(); };
      return b;
    };
    // Istante dell'invio della password (Invio nel campo).
    document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target && e.target.id === 'inp-pw') B.t0 = performance.now(); }, true);
    B.contatori = () => ({ render: B.render.n, renderMs: B.render.ms, ...B.fs });
  });
}

const contatoriPagina = (page) => page.evaluate(() => window.__bench.contatori());
const diffContatori = (a, b) => ({ render: b.render - a.render, renderMs: r1(b.renderMs - a.renderMs), getDoc: b.getDoc - a.getDoc, getDocs: b.getDocs - a.getDocs,
  docsLetti: b.docsLetti - a.docsLetti, batch: b.batch - a.batch, docsScritti: b.docsScritti - a.docsScritti });

async function nuovaPagina(browser) {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:8911', locale: 'it-IT', timezoneId: 'Europe/Rome', viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();
  const errori = [];
  page.on('pageerror', (e) => errori.push(e.message));
  page.on('dialog', (d) => d.dismiss());
  const rete = traccia(page);
  return { context, page, rete, errori };
}

// Un accesso completo, cronometrato. Restituisce la misura e la pagina aperta.
async function accessoMisurato(browser, email) {
  const s = await nuovaPagina(browser);
  const { page, rete } = s;
  await page.goto(PAGINA);
  await page.locator('#inp-login').waitFor();
  await strumenta(page);
  await rete.quiete(); // caricamenti prima del login conclusi
  await page.locator('#inp-login').fill(email);
  await page.locator('#inp-pw').fill(PASSWORD);
  const reteprima = rete.foto();
  const t0n = performance.now();
  await page.locator('#inp-pw').press('Enter');
  // Controllo a ogni fotogramma (non con le attese di expect, che si diradano):
  // l'istante in cui titolo e numeri sono a schermo, con l'orologio della pagina.
  await page.waitForFunction(() => {
    const t = document.querySelector('.page-title'), k = document.querySelector('.kpi-value');
    if (!(t && /Dashboard/.test(t.textContent) && k && k.offsetParent && k.textContent.trim())) return false;
    window.__bench.tVisibile = window.__bench.tVisibile || performance.now();
    return true;
  }, null, { polling: 'raf', timeout: 300_000 });
  const tVisibile = performance.now();
  const q = await rete.quiete();
  const B = await page.evaluate(() => ({ t0: window.__bench.t0, tVis: window.__bench.tVisibile, segni: window.__bench.segni, pr: window.__bench.primoRenderUtente, c: window.__bench.contatori(),
    record: { condomini: state.condomini.length, spese: state.spese.length, entrate: state.entrate.length, fornitori: state.fornitori.length,
      bacheca: state.bacheca.length, verbali: state.verbali.length, lavori: state.lavori.length, delibere: state.delibere.length } }));
  // Segni dopo l'invio: l'ultima occorrenza di ciascuno (fbLoadAll gira anche prima del login).
  const dopo = B.segni.filter(([, t]) => t >= B.t0);
  const primo = (n) => { const x = dopo.find(([k]) => k === n); return x ? x[1] : null; };
  const ultimo = (n) => { const x = [...dopo].reverse().find(([k]) => k === n); return x ? x[1] : null; };
  const misura = {
    totaleVisibileMs: r1(B.tVis - B.t0),                                // Invio → dashboard con titolo e numeri (orologio della pagina)
    totalePlaywrightMs: r1(tVisibile - t0n),                            // lo stesso, visto da Playwright
    totaleReteFermaMs: r1(Math.max(tVisibile, q.ultima) - t0n),        // … e rete ferma
    totaleDipintoMs: r1(B.pr.dipinto - B.t0),                          // Invio → primo disegno con l'utente (orologio della pagina)
    fasi: {
      autenticazioneMs: r1(primo('fbLoadAll:inizio') - B.t0),          // signIn + refresh del token
      appdataMs: r1(primo('whoami:inizio') - primo('fbLoadAll:inizio')), // fbLoadAll + cm_config
      whoamiMs: r1(primo('whoami:fine') - primo('whoami:inizio')),
      tokenDopoWhoamiMs: r1(primo('fbLoadBuildings:inizio') - primo('whoami:fine')),
      datiEdificioMs: r1(primo('fbLoadBuildings:fine') - primo('fbLoadBuildings:inizio')),
      preparazioneERenderMs: r1(B.pr.fine - primo('fbLoadBuildings:fine')), // applyLoadedData + primo render
      primoRenderMs: r1(B.pr.fine - B.pr.inizio),
      dipintoMs: r1(B.pr.dipinto - B.pr.fine),
    },
    richieste: rete.diff(reteprima),
    letture: { getDoc: B.c.getDoc, getDocs: B.c.getDocs, docsLetti: B.c.docsLetti },
    render: B.c.render,
    reteInterrotta: q.interrotta,
  };
  if (ultimo('fbLoadAll:fine') == null) misura.nota = 'segni mancanti';
  return { s, misura, record: B.record };
}

// Clic su una voce del menu laterale, cronometrato.
async function navigaMisurato(page, rete, id) {
  const c0 = await contatoriPagina(page);
  const r0 = rete.foto();
  const t0 = performance.now();
  const inPagina = await page.evaluate((pid) => new Promise((res) => {
    const el = document.querySelector(`.sidebar [data-page="${pid}"]`);
    const t = performance.now();
    el.click();
    const sinc = performance.now() - t;
    requestAnimationFrame(() => setTimeout(() => res({ sincronoMs: sinc, dipintoMs: performance.now() - t }), 0));
  }), id);
  await expect(page.locator('.page-title').first()).toContainText(TITOLI[id]);
  const tVis = performance.now();
  const q = await rete.quiete();
  const c1 = await contatoriPagina(page);
  return { visibileMs: r1(tVis - t0), reteFermaMs: r1(Math.max(tVis, q.ultima) - t0), sincronoMs: r1(inPagina.sincronoMs), dipintoMs: r1(inPagina.dipintoMs),
    richieste: rete.diff(r0), ...diffContatori(c0, c1), reteInterrotta: q.interrotta };
}

// render() chiamato N volte a pagina ferma: solo JavaScript, e con il calcolo
// del layout forzato (offsetHeight) dopo ciascuno.
async function renderMisurato(page, n = 10) {
  return page.evaluate(({ N0, leggero }) => {
    // Con pagine molto lente si fanno meno chiamate (annotato in "chiamate").
    const t1 = performance.now(); render(); const primo = performance.now() - t1;
    const N = primo > 5000 ? 1 : primo > 2000 ? 2 : primo > 500 ? 4 : N0;
    const solo = [], conLayout = [];
    for (let i = 0; i < N; i++) { const t = performance.now(); render(); solo.push(performance.now() - t); }
    const NL = leggero && primo > 2000 ? 0 : N;
    for (let i = 0; i < NL; i++) { const t = performance.now(); render(); void document.body.offsetHeight; conLayout.push(performance.now() - t); }
    const med = (a) => { if (!a.length) return null; const v = [...a].sort((x, y) => x - y); return v[v.length >> 1]; };
    return { renderMs: Math.round(med(solo) * 10) / 10, renderLayoutMs: conLayout.length ? Math.round(med(conLayout) * 10) / 10 : null, chiamate: N, nodiDom: document.getElementsByTagName('*').length };
  }, { N0: n, leggero: RENDER_LEGGERO });
}

// Scrittura di spese con le stesse funzioni dei pulsanti dell'app
// (save('cm_spese', …) seguito da setState, come in salvaSpesa di spese.js).
async function scritturaMisurata(page, rete, tipo, ctx) {
  const c0 = await contatoriPagina(page);
  const r0 = rete.foto();
  const t0 = performance.now();
  const esito = await page.evaluate(async ({ tipo, ctx }) => {
    const Y = new Date().getFullYear();
    const nuova = (k) => ({ id: newId(), titolo: `Spesa banco ${k}`, categoria: 'pulizie', tipoSpesa: 'ordinaria', preventivo: '100', consuntivo: '100',
      data: `${Y}-06-15`, descrizione: '', edificioId: state.edificioAttivo, allegati: [], split: [] });
    const t = performance.now();
    let promesse = [], ids = [];
    if (tipo === 'inserisci') { const s = nuova('1'); ids = [s.id]; const spese = [...state.spese, s]; promesse.push(save('cm_spese', spese)); setState({ spese }); }
    if (tipo === 'modifica') { const spese = state.spese.map((s) => (s.id === ctx.id ? { ...s, titolo: s.titolo + ' (mod)', consuntivo: '120' } : s)); promesse.push(save('cm_spese', spese)); setState({ spese }); }
    if (tipo === 'cancella') { const spese = state.spese.filter((s) => s.id !== ctx.id); promesse.push(save('cm_spese', spese)); setState({ spese }); }
    if (tipo === 'inserisci10') {
      for (let k = 0; k < 10; k++) { const s = nuova('10-' + k); ids.push(s.id); const spese = [...state.spese, s]; promesse.push(save('cm_spese', spese)); setState({ spese }); }
    }
    const ui = performance.now() - t;
    const ok = (await Promise.all(promesse)).every(Boolean);
    return { interfacciaMs: ui, confermataMs: performance.now() - t, ok, ids };
  }, { tipo, ctx });
  const tFine = performance.now();
  const q = await rete.quiete();
  const c1 = await contatoriPagina(page);
  return { misura: { interfacciaMs: r1(esito.interfacciaMs), confermataMs: r1(esito.confermataMs), totaleMs: r1(tFine - t0),
    reteFermaMs: r1(Math.max(tFine, q.ultima) - t0), ok: esito.ok, richieste: rete.diff(r0), ...diffContatori(c0, c1), reteInterrotta: q.interrotta }, ids: esito.ids };
}

// Ricerca dal campo della barra laterale (Invio), come una persona.
async function ricercaMisurata(page, rete) {
  const r0 = rete.foto();
  const t0 = performance.now();
  const x = await page.evaluate((parola) => new Promise((res) => {
    const c = document.getElementById('ricerca-globale');
    c.value = parola;
    const t = performance.now();
    c.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const sinc = performance.now() - t;
    requestAnimationFrame(() => setTimeout(() => res({ sinc, dip: performance.now() - t,
      risultati: cercaNelSito(parola).gruppi.reduce((a, g) => a + g.voci.length, 0) }), 0));
  }), PAROLA);
  await expect(page.locator('.page-title').first()).toContainText('Ricerca');
  const tVis = performance.now();
  const q = await rete.quiete();
  // Solo la funzione di ricerca, senza disegno.
  const soloCerca = await page.evaluate((parola) => { const t = performance.now(); cercaNelSito(parola); return performance.now() - t; }, PAROLA);
  return { visibileMs: r1(tVis - t0), reteFermaMs: r1(Math.max(tVis, q.ultima) - t0), sincronoMs: r1(x.sinc), dipintoMs: r1(x.dip),
    cercaNelSitoMs: r1(soloCerca), risultati: x.risultati, richieste: rete.diff(r0) };
}

test.describe.configure({ mode: 'serial' });

for (const { ruolo, email } of RUOLI) {
  test(`banco ${ruolo} V${VOLUME}`, async ({ browser }) => {
    const R = risultati.ruoli[ruolo] = { email };

    // 0. Accesso a freddo (primo dopo l'avvio degli emulatori per questo ruolo): a parte.
    const freddo = await accessoMisurato(browser, email);
    R.accessoAFreddo = freddo.misura;
    R.record = freddo.record;
    await freddo.s.context.close();

    // 1. Accesso: REP volte, ognuna da un browser pulito.
    const accessi = [];
    let sessione = null;
    for (let i = 0; i < REP; i++) {
      const a = await accessoMisurato(browser, email);
      accessi.push(a.misura);
      if (i < REP - 1) await a.s.context.close(); else sessione = a.s;
    }
    R.accesso = conRipetizioni(accessi);
    const { page, rete, errori } = sessione;

    // 2. Navigazione: le pagine che il ruolo vede nel menu.
    const visibili = await page.evaluate((ids) => ids.filter((id) => document.querySelector(`.sidebar [data-page="${id}"]`)), PAGINE);
    R.pagine = visibili;
    const nav = Object.fromEntries(visibili.map((p) => [p, []]));
    for (let i = 0; i < REP; i++) {
      await navigaMisurato(page, rete, visibili[visibili.length - 1]); // punto di partenza uguale per ogni giro
      for (const p of visibili) nav[p].push(await navigaMisurato(page, rete, p));
    }
    R.navigazione = Object.fromEntries(Object.entries(nav).map(([p, runs]) => [p, conRipetizioni(runs)]));

    // 3. render() a pagina ferma, per ogni pagina (10 chiamate, mediana).
    R.render = {};
    for (const p of visibili) {
      await navigaMisurato(page, rete, p);
      const runs = [];
      for (let i = 0; i < REP; i++) runs.push(await renderMisurato(page, 10));
      R.render[p] = conRipetizioni(runs);
    }

    // 4. Scritture (solo amministratore), dalla pagina Spese.
    if (ruolo === 'admin') {
      await navigaMisurato(page, rete, 'spese');
      const w = { inserisci: [], modifica: [], cancella: [], inserisci10: [] };
      const daPulire = [];
      for (let i = 0; i < REP_SCRITTURE; i++) {
        const ins = await scritturaMisurata(page, rete, 'inserisci', {});
        w.inserisci.push(ins.misura);
        w.modifica.push((await scritturaMisurata(page, rete, 'modifica', { id: ins.ids[0] })).misura);
        w.cancella.push((await scritturaMisurata(page, rete, 'cancella', { id: ins.ids[0] })).misura);
        const dieci = await scritturaMisurata(page, rete, 'inserisci10', {});
        w.inserisci10.push(dieci.misura);
        daPulire.push(...dieci.ids);
      }
      R.scritture = Object.fromEntries(Object.entries(w).map(([k, runs]) => [k, conRipetizioni(runs)]));
      // Pulizia (non misurata): via le 10*REP spese di prova.
      await page.evaluate(async (ids) => { const s = new Set(ids); const spese = state.spese.filter((x) => !s.has(x.id)); await save('cm_spese', spese); setState({ spese }); }, daPulire);
      await rete.quiete();
    }

    // 5. Ricerca di una parola comune.
    const ric = [];
    for (let i = 0; i < REP; i++) {
      await navigaMisurato(page, rete, 'dashboard');
      ric.push(await ricercaMisurata(page, rete));
    }
    R.ricerca = conRipetizioni(ric);
    R.erroriPagina = errori;
    await sessione.context.close();
  });
}

test.afterAll(() => {
  const dir = path.join(__dirname, '..', 'out', 'bench');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${LABEL}-V${VOLUME}.json`);
  fs.writeFileSync(file, JSON.stringify(risultati, null, 2));
  console.log('Risultati in', file);
});
