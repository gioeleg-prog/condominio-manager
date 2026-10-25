// Tabelle millesimali: SOLO per i condomini che le accendono. Per tutti gli altri
// (es. Neri da Rimini 20, dove tutti pagano uguale) l'app funziona esattamente
// come prima: nessuna proposta, nessun calcolo diverso.
//
// Configurazione per condominio in buildings/{b}/impostazioni/millesimi:
//   { attivo, dal: 'AAAA-MM-GG', tabelle: [{ id, nome, valori: { appartamento: millesimi } }],
//     categorie: { idCategoria: idTabella } }
// I millesimi sono dell'APPARTAMENTO (chiave = nome dell'appartamento): con un
// subentro il nuovo proprietario li eredita senza rifare nulla.
// Nelle spese la ripartizione proposta dai millesimi viene FOTOGRAFATA nella spesa
// (campo split, come già oggi): cambiare la tabella non tocca le spese già
// salvate, gli anni passati e le spese consuntivate non si ricalcolano mai.
// Per l'anno in corso c'è un'azione esplicita con anteprima (scheda millesimiApplica).
// Script classico: condivide le variabili globali con gli altri file di js/ (ordine in index.html).

const _millesimi = {};          // edificioId → configurazione (null = mai configurati)
const _millesimiInCarico = {};

function chiaveApt(a) { return String(a || '').trim().toLowerCase().replace(/\s+/g, ' '); }

function configMillesimi(edId = state.edificioAttivo) { return _millesimi[edId] || null; }

// I millesimi valgono per una spesa di quella data?
function millesimiAttiviAlla(data, edId = state.edificioAttivo) {
  const c = configMillesimi(edId);
  return !!(c && c.attivo && c.dal && (c.tabelle || []).length && String(data || '') >= c.dal);
}
function millesimiInUsoNellAnno(anno, edId = state.edificioAttivo) {
  const c = configMillesimi(edId);
  return !!(c && c.attivo && c.dal && c.dal <= anno + '-12-31');
}

const _millesimiVer = {};        // edificioId → versione letta dal server (firmaImpostazione)
const _millesimiLetti = {};      // edificioId → quando (ms) sono stati letti l'ultima volta
const MILLESIMI_VALIDITA_MS = 60000;

async function caricaMillesimi(edId = state.edificioAttivo) {
  if (!window._fb?.getDoc || !edId) return;
  try {
    const r = await leggiImpostazione(edId, 'millesimi');
    _millesimi[edId] = r.dati;
    _millesimiVer[edId] = r.firma;
    _millesimiLetti[edId] = Date.now();
  } catch (e) {
    // Una rilettura fallita non cancella ciò che si ha già.
    if (!(edId in _millesimi)) { _millesimi[edId] = null; delete _millesimiVer[edId]; }
    _millesimiLetti[edId] = Date.now();
    console.warn('Millesimi non caricati', e.code || e.message);
  }
}
// Chiamata a ogni disegno: carica la prima volta per condominio, poi ridisegna.
// Dopo un minuto li rilegge in silenzio (ADV-FUNC-026: la scheda di una spesa non
// deve proporre la tabella vecchia se un altro amministratore l'ha cambiata) e
// ridisegna solo se sono davvero cambiati, mai con una scheda aperta o nelle Impostazioni.
// Il controllo "scheda aperta / Impostazioni" si ripete alla fine della lettura (CR-004): l'utente può
// aprire una scheda mentre la risposta è in viaggio, e un ridisegno cancellerebbe ciò che sta scrivendo.
function ridisegnoConsentito() { return !state.modal && state.page !== 'impostazioni'; }
function assicuraMillesimi() {
  const ed = state.edificioAttivo;
  if (!state.user || !window._fb?.getDoc || _millesimiInCarico[ed]) return;
  const primo = !(ed in _millesimi);
  const scaduti = !primo && Date.now() - (_millesimiLetti[ed] || 0) > MILLESIMI_VALIDITA_MS && ridisegnoConsentito();
  if (!primo && !scaduti) return;
  const prima = _millesimiVer[ed];
  _millesimiInCarico[ed] = true;
  caricaMillesimi(ed).finally(() => {
    _millesimiInCarico[ed] = false;
    if (!primo && !ridisegnoConsentito()) return; // scheda aperta nel frattempo: i dati sono aggiornati, nessun ridisegno
    if ((primo || prima !== _millesimiVer[ed]) && typeof renderPresto === 'function') renderPresto();
  });
}
// Aprendo la scheda spesa: se i millesimi sono stati letti più di un minuto fa si rileggono dal server
// (stesso meccanismo delle impostazioni) PRIMA di aprirla, così la proposta usa la tabella di adesso.
// Nessun ridisegno: la scheda non è ancora aperta.
async function rileggiMillesimiSeVecchi(edId = state.edificioAttivo) {
  if (!window._fb?.getDoc || !edId || !(edId in _millesimi) || _millesimiInCarico[edId]) return;
  if (Date.now() - (_millesimiLetti[edId] || 0) <= MILLESIMI_VALIDITA_MS) return;
  _millesimiInCarico[edId] = true;
  try { await caricaMillesimi(edId); } finally { _millesimiInCarico[edId] = false; }
}

function tabelleMillesimi(edId = state.edificioAttivo) { return configMillesimi(edId)?.tabelle || []; }
function tabellaPerCategoria(cat, edId = state.edificioAttivo) {
  const c = configMillesimi(edId);
  const id = c?.categorie?.[cat];
  return tabelleMillesimi(edId).some(t => t.id === id) ? id : (tabelleMillesimi(edId)[0]?.id || '');
}

// Percentuali con due decimali che sommano esattamente 100 (resti più grandi).
function percDaPesi(pesi) {
  const tot = pesi.reduce((a, p) => a + Math.max(0, p || 0), 0);
  if (!tot) return pesi.map(() => 0);
  const esatti = pesi.map(p => Math.max(0, p || 0) / tot * 10000);
  const base = esatti.map(Math.floor);
  let resto = 10000 - base.reduce((a, b) => a + b, 0);
  const ordine = esatti.map((e, i) => [e - Math.floor(e), i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; k < resto; k++) base[ordine[k % ordine.length][1]]++;
  return base.map(b => b / 100);
}

// Ripartizione proposta da una tabella per una spesa di quella data: tra chi
// abita nel condominio alla data, in proporzione ai millesimi del suo appartamento.
// Chi ha 0 (o non è in tabella) non paga quella spesa; `senza` li elenca.
// Un solo peso per appartamento (CONS-022, scelta del proprietario: un rappresentante per appartamento).
// Se un appartamento ha più condomini presenti, il peso va al rappresentante (campo `rappresentante`);
// gli altri hanno fattore 0. Se nessuno è indicato (scelta prudente) il peso NON si raddoppia: si divide
// in parti uguali tra i presenti dell'appartamento, e l'appartamento è elencato in `senzaScelta` perché
// l'amministratore indichi il rappresentante. Con più rappresentanti indicati vale il primo.
// Appartamento vuoto: nessun raggruppamento (non si sa chi condivide cosa) e peso 0 comunque.
function fattoriAppartamento(presenti) {
  const gruppi = new Map();
  presenti.forEach((c, i) => {
    const k = chiaveApt(c.appartamento);
    if (k) gruppi.set(k, [...(gruppi.get(k) || []), i]);
  });
  const fattori = presenti.map(() => 1);
  const senzaScelta = [];
  gruppi.forEach((idx, chiave) => {
    if (idx.length < 2) return;
    const rep = idx.find(i => presenti[i].rappresentante === true);
    if (rep !== undefined) { idx.forEach(i => { fattori[i] = i === rep ? 1 : 0; }); return; }
    idx.forEach(i => { fattori[i] = 1 / idx.length; });
    senzaScelta.push({ chiave, etichetta: presenti[idx[0]].appartamento, nomi: idx.map(i => presenti[i].nome) });
  });
  return { fattori, senzaScelta };
}

function propostaMillesimi(tabId, data, edId = state.edificioAttivo) {
  const t = tabelleMillesimi(edId).find(x => x.id === tabId);
  const presenti = condominiAllaData(data, edId);
  if (!t || !presenti.length) return null;
  const grezzi = presenti.map(c => parseFloat(t.valori?.[chiaveApt(c.appartamento)]) || 0);
  if (!grezzi.some(p => p > 0)) return null;
  const { fattori, senzaScelta } = fattoriAppartamento(presenti);
  const pesi = grezzi.map((p, i) => p * fattori[i]);
  const perc = percDaPesi(pesi);
  return {
    tabella: t,
    split: presenti.map((c, i) => ({ id: c.id, perc: perc[i], locked: false })),
    senza: presenti.filter((c, i) => !grezzi[i]).map(c => c.nome),
    // appartamenti con più condomini e nessun rappresentante, che hanno un peso in questa tabella
    senzaRappresentante: senzaScelta.filter(a => presenti.some((c, i) => chiaveApt(c.appartamento) === a.chiave && grezzi[i] > 0)).map(a => a.etichetta),
  };
}

// Appartamenti di OGGI con più condomini attivi e nessun rappresentante (avviso nella pagina
// Millesimi e nella scheda condomino). Solo se i millesimi sono accesi.
function appartamentiSenzaRappresentante(edId = state.edificioAttivo) {
  if (!configMillesimi(edId)?.attivo) return [];
  return fattoriAppartamento(condominiAllaData(ymdLocale(new Date()), edId)).senzaScelta;
}
// Ci sono altri condomini attivi oggi nello stesso appartamento?
function condividenti(c) {
  const k = chiaveApt(c?.appartamento);
  if (!k) return [];
  return condominiAllaData(ymdLocale(new Date()), c.edificioId || state.edificioAttivo)
    .filter(x => x.id !== c.id && chiaveApt(x.appartamento) === k);
}

// Millesimi di un condomino (sola lettura, per l'anagrafica).
function millesimiDi(c, edId = c?.edificioId || state.edificioAttivo) {
  const cfg = configMillesimi(edId);
  if (!cfg?.attivo) return [];
  return (cfg.tabelle || []).map(t => ({ nome: t.nome, valore: parseFloat(t.valori?.[chiaveApt(c.appartamento)]) || 0 }));
}
const fmtMill = (n) => (Number(n) || 0).toLocaleString('it-IT', { maximumFractionDigits: 3 });

// ─── Impostazioni: tabella dei millesimi ───────────────────────────
let _bozzaMill = null;   // copia in modifica

function appartamentiEdificio(edId = state.edificioAttivo) {
  const visti = new Map();
  state.condomini.filter(c => c.edificioId === edId && !c.superAdmin && !c.disabled)
    .sort((a, b) => String(a.appartamento || '').localeCompare(String(b.appartamento || ''), 'it', { numeric: true }))
    .forEach(c => { const k = chiaveApt(c.appartamento); if (k && !visti.has(k)) visti.set(k, { chiave: k, etichetta: c.appartamento, chi: c.nome }); });
  return [...visti.values()];
}

function nuovaBozzaMill() {
  const c = configMillesimi();
  return c ? JSON.parse(JSON.stringify({ attivo: !!c.attivo, dal: c.dal || '', tabelle: c.tabelle || [], categorie: c.categorie || {} }))
    : { attivo: false, dal: ymdLocale(new Date()), tabelle: [{ id: 'generale', nome: 'Generale', valori: {} }], categorie: {} };
}

function renderSezioneMillesimi() {
  return `<div class="section-divider"><h3>⚖️ Tabelle millesimali</h3></div>
    <div class="card" style="padding:1rem 1.25rem;margin-bottom:1.5rem"><div id="mill-box"><p class="hint">Caricamento…</p></div></div>`;
}

function totaleTabella(t) { return Object.values(t.valori || {}).reduce((a, v) => a + (parseFloat(v) || 0), 0); }

function disegnaMillesimi() {
  const box = document.getElementById('mill-box');
  if (!box) return;
  if (!_bozzaMill) _bozzaMill = nuovaBozzaMill();
  const b = _bozzaMill;
  const apt = appartamentiEdificio();
  const categorie = getCategorie().filter(c => c.tipo !== 'entrata');
  const cambiati = !!(b.__ver && _millesimiVer[state.edificioAttivo] && b.__ver !== _millesimiVer[state.edificioAttivo]);
  box.innerHTML = `
    ${cambiati ? `<div class="alert alert-warning" id="mill-cambiati" style="font-size:13px;margin:0 0 .75rem">Un'altra persona ha salvato nuovi millesimi dopo che hai aperto questa scheda. Se salvi ora il salvataggio viene fermato per non cancellare la sua modifica.
      <button type="button" class="btn btn-secondary btn-sm" id="mill-ricarica" style="width:auto;margin-left:.5rem">Ricarica i valori</button></div>` : ''}
    <label class="casella-email" for="mill-attivo" style="margin-top:0">
      <input type="checkbox" id="mill-attivo" ${b.attivo ? 'checked' : ''}>
      <span><strong>Usa i millesimi in questo condominio</strong>
      <span class="hint" style="display:block;margin-top:2px">Spento: le spese si dividono come sempre (in parti uguali o come le imposti). Acceso: le spese nuove dalla data indicata propongono la ripartizione per millesimi, sempre modificabile nella spesa. Le spese già inserite non cambiano.</span></span>
    </label>
    <div class="field" style="max-width:240px"><label for="mill-dal">Valgono per le spese dal</label><input type="date" id="mill-dal" value="${esc(b.dal || '')}"></div>
    ${(() => {
      const senza = appartamentiSenzaRappresentante();
      return senza.length ? `<div class="alert alert-warning" id="mill-senza-rapp" style="font-size:13px;margin:.75rem 0">
        <strong>Manca il rappresentante</strong> in: ${senza.map(a => esc(a.etichetta) + ' (' + a.nomi.map(esc).join(', ') + ')').join('; ')}.
        Ogni appartamento conta una volta sola: finché non indichi chi lo rappresenta (Condomini → Modifica), il suo peso è diviso in parti uguali tra i condomini attivi. Gli altri non portano peso né quote proprie.</div>` : '';
    })()}
    ${b.tabelle.map((t, ti) => {
      const tot = totaleTabella(t);
      const ok = Math.abs(tot - 1000) < 0.0005;
      return `<div class="mill-tab">
        <div class="mill-tab-testa">
          <input type="text" class="mill-nome" data-ti="${ti}" value="${esc(t.nome)}" maxlength="40" aria-label="Nome della tabella">
          <span class="badge ${ok ? 'badge-green' : 'badge-amber'}" id="mill-tot-${ti}">Totale ${fmtMill(tot)} / 1000</span>
          ${ti > 0 ? `<button type="button" class="btn btn-secondary btn-sm" data-mill-togli="${ti}" title="Elimina la tabella ${esc(t.nome)}">🗑</button>` : ''}
        </div>
        <table class="mill-righe"><tbody>
          ${apt.map(a => `<tr><td><strong>${esc(a.etichetta)}</strong> <span class="hint">${esc(a.chi)}</span></td>
            <td><input type="number" min="0" max="1000" step="0.001" inputmode="decimal" class="mill-val" data-ti="${ti}" data-apt="${esc(a.chiave)}" value="${esc(t.valori?.[a.chiave] ?? '')}" aria-label="Millesimi ${esc(a.etichetta)} tabella ${esc(t.nome)}"></td></tr>`).join('')}
        </tbody></table>
        ${Object.keys(t.valori || {}).filter(k => !apt.some(a => a.chiave === k) && parseFloat(t.valori[k])).length
          ? `<p class="hint" style="color:var(--amber)">Millesimi di appartamenti senza condomini attivi: ${esc(Object.keys(t.valori).filter(k => !apt.some(a => a.chiave === k) && parseFloat(t.valori[k])).join(', '))}. Restano nel totale ma non pagano finché non c'è qualcuno.</p>` : ''}
      </div>`;
    }).join('')}
    <button type="button" class="btn btn-secondary btn-sm" id="mill-aggiungi" style="width:auto">+ Aggiungi tabella (es. Scale, Ascensore, Riscaldamento)</button>
    ${b.tabelle.length > 1 ? `<div class="field" style="margin-top:1rem"><label>Tabella da proporre per ogni categoria di spesa</label>
      <div class="mill-categorie">${categorie.map(c => `<label><span>${esc(c.icon || '')} ${esc(c.label)}</span>
        <select data-mill-cat="${esc(c.id)}">${b.tabelle.map(t => `<option value="${esc(t.id)}" ${(b.categorie[c.id] || b.tabelle[0].id) === t.id ? 'selected' : ''}>${esc(t.nome)}</option>`).join('')}</select></label>`).join('')}</div></div>` : ''}
    <div id="mill-err" class="alert alert-warning" style="display:none;font-size:13px;margin-top:.75rem"></div>
    <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:1rem">
      <button type="button" class="btn btn-primary" id="mill-salva" style="width:auto">Salva i millesimi</button>
      ${configMillesimi()?.attivo ? `<button type="button" class="btn btn-secondary" id="mill-applica" style="width:auto">Applica alle spese ${new Date().getFullYear()} non consuntivate…</button>` : ''}
    </div>`;

  const leggi = () => {
    b.attivo = document.getElementById('mill-attivo').checked;
    b.dal = document.getElementById('mill-dal').value;
    box.querySelectorAll('.mill-nome').forEach(i => { b.tabelle[+i.dataset.ti].nome = i.value.trim(); });
    box.querySelectorAll('.mill-val').forEach(i => {
      const t = b.tabelle[+i.dataset.ti];
      const v = i.value === '' ? null : parseFloat(i.value);
      if (v === null || isNaN(v)) delete t.valori[i.dataset.apt]; else t.valori[i.dataset.apt] = Math.round(v * 1000) / 1000;
    });
    box.querySelectorAll('[data-mill-cat]').forEach(s => { b.categorie[s.dataset.millCat] = s.value; });
  };
  box.querySelectorAll('.mill-val').forEach(i => i.oninput = () => {
    leggi();
    const ti = +i.dataset.ti, tot = totaleTabella(b.tabelle[ti]), el = document.getElementById('mill-tot-' + ti);
    if (el) { el.textContent = `Totale ${fmtMill(tot)} / 1000`; el.className = 'badge ' + (Math.abs(tot - 1000) < 0.0005 ? 'badge-green' : 'badge-amber'); }
  });
  document.getElementById('mill-aggiungi').onclick = () => {
    leggi();
    b.tabelle.push({ id: 't' + Date.now().toString(36), nome: 'Nuova tabella', valori: {} });
    disegnaMillesimi();
  };
  box.querySelectorAll('[data-mill-togli]').forEach(bt => bt.onclick = async () => {
    leggi();
    const t = b.tabelle[+bt.dataset.millTogli];
    if (!await chiedi(`Eliminare la tabella "${t.nome}"? Le spese già ripartite con questa tabella non cambiano.`)) return;
    b.tabelle.splice(+bt.dataset.millTogli, 1);
    Object.keys(b.categorie).forEach(k => { if (b.categorie[k] === t.id) delete b.categorie[k]; });
    disegnaMillesimi();
  });
  document.getElementById('mill-salva').onclick = async () => {
    leggi();
    const err = document.getElementById('mill-err');
    const errore = (t) => { err.textContent = t; err.style.display = 'block'; };
    err.style.display = 'none';
    if (b.attivo && !b.dal) return errore('Indica da quale data valgono i millesimi.');
    if (b.tabelle.some(t => !t.nome)) return errore('Ogni tabella deve avere un nome.');
    const sbagliate = b.tabelle.filter(t => Math.abs(totaleTabella(t) - 1000) >= 0.0005);
    if (b.attivo && sbagliate.length && !await chiedi(`Il totale non è 1000 in: ${sbagliate.map(t => t.nome + ' (' + fmtMill(totaleTabella(t)) + ')').join(', ')}. Le quote si calcolano comunque in proporzione. Salvare lo stesso?`, { titolo: 'Totale diverso da 1000', conferma: 'Salva lo stesso', pericolo: false })) return;
    const { db, doc, setDoc, serverTimestamp, auth } = window._fb;
    const dati = { attivo: b.attivo, dal: b.dal || '', tabelle: b.tabelle, categorie: b.categorie, aggiornatoDa: auth.currentUser?.uid, aggiornatoIl: serverTimestamp() };
    try {
      // QA-CONS-010: se un altro ha salvato dopo che hai aperto la scheda, non si sovrascrive in silenzio.
      const ed = state.edificioAttivo;
      if (await impostazioneCambiataAltrove(ed, 'millesimi', b.__ver, 'Tabelle millesimali', ricaricaMillesimi)) return;
      await setDoc(doc(db, 'buildings', String(state.edificioAttivo), 'impostazioni', 'millesimi'), dati);
      _millesimi[state.edificioAttivo] = { ...dati };
      _bozzaMill = null;
      avvisa(b.attivo ? `✅ Millesimi salvati: valgono per le spese dal ${dataPdf(b.dal)}.` : '✅ Millesimi salvati (non attivi: le spese si dividono come prima).');
      render();
    } catch (e) { errore('Millesimi non salvati: ' + (e.message || e)); }
  };
  const ric = document.getElementById('mill-ricarica');
  if (ric) ric.onclick = () => ricaricaMillesimi(_millesimi[state.edificioAttivo], _millesimiVer[state.edificioAttivo]);
  const ap = document.getElementById('mill-applica');
  if (ap) ap.onclick = () => setState({ modal: { type: 'millesimiApplica', data: {} } });
}

// Applica i valori del server e riparte da una bozza nuova (dopo "Ricarica").
function ricaricaMillesimi(dati, firma) {
  const ed = state.edificioAttivo;
  _millesimi[ed] = dati; _millesimiVer[ed] = firma; _millesimiLetti[ed] = Date.now();
  _bozzaMill = null;
  render();
}

// Alla apertura della scheda si rileggono sempre dal server (QA-CONS-010): la bozza
// ricorda la versione da cui è partita, il salvataggio la confronta con quella attuale.
async function bindSezioneMillesimi() {
  if (!document.getElementById('mill-box')) return;
  await caricaMillesimi();
  if (_bozzaMill && _bozzaMill.__ed !== state.edificioAttivo) _bozzaMill = null;
  if (!_bozzaMill) { _bozzaMill = nuovaBozzaMill(); _bozzaMill.__ed = state.edificioAttivo; _bozzaMill.__ver = _millesimiVer[state.edificioAttivo]; }
  disegnaMillesimi();
}

// ─── Applica all'anno in corso (anteprima e conferma) ───────────────
function speseDaRipartireMillesimi() {
  const anno = String(new Date().getFullYear());
  return state.spese.filter(s => (s.edificioId || state.edificioAttivo) === state.edificioAttivo && String(s.data || '').startsWith(anno)
    && !(parseFloat(s.consuntivo) > 0));
}

// Ripartizione fatta a mano? (CONS-021, scelta del proprietario: queste spese non si toccano.)
// Una spesa NON è a mano se: non ha ripartizione (parti uguali implicite), oppure la sua ripartizione
// coincide con le parti uguali tra chi abitava alla data, oppure con la proposta di una delle tabelle
// dei millesimi a quella data (tolleranza 0,011 punti percentuali). È a mano se ha una quota bloccata,
// una quota > 0 per chi non abitava alla data (riga aggiunta a mano), o qualunque altra distribuzione.
// Nel dubbio (es. millesimi cambiati dopo il salvataggio, quindi la vecchia proposta non coincide più)
// la spesa conta come "a mano" e viene saltata: è la scelta prudente.
function ripartizioneAMano(s) {
  const split = (s.split || []).filter(x => x && x.id !== undefined);
  if (!split.length) return false;
  if (split.some(x => x.locked)) return true;
  const mappa = (righe) => new Map(righe.map(x => [x.id, parseFloat(x.perc) || 0]));
  const attuale = mappa(split);
  const uguale = (altra) => {
    const ids = new Set([...attuale.keys(), ...altra.keys()]);
    for (const id of ids) if (Math.abs((attuale.get(id) || 0) - (altra.get(id) || 0)) > 0.011) return false;
    return true;
  };
  const ed = s.edificioId || state.edificioAttivo;
  const presenti = condominiAllaData(s.data, ed);
  if (presenti.length) {
    const pu = partiUguali(presenti.length);
    if (uguale(new Map(presenti.map((c, i) => [c.id, pu[i]])))) return false;
  }
  for (const t of tabelleMillesimi(ed)) {
    const p = propostaMillesimi(t.id, s.data, ed);
    if (p && uguale(mappa(p.split))) return false;
  }
  return true;
}

// Sintesi leggibile di una ripartizione: "Anna 40% · Bruno 35%" (solo chi ha una quota).
function sintesiRipartizione(s) {
  if (!(s.split || []).length) return 'parti uguali';
  const parti = s.split.filter(x => (parseFloat(x.perc) || 0) > 0).map(x => {
    const c = state.condomini.find(k => k.id === x.id);
    return `${c ? c.nome : 'ex condomino'} ${fmtMill(parseFloat(x.perc) || 0)}%`;
  });
  return parti.join(' · ') || 'nessuna quota';
}

function calcolaApplicazioneMillesimi() {
  const righe = new Map(); // condId → { nome, prima, dopo }
  const nuove = [];
  const modificate = []; // { spesa, prima, dopo } per l'elenco dell'anteprima
  const saltate = [];    // { spesa, motivo: 'prima-data' | 'a-mano' | 'senza-tabella' }
  for (const s of speseDaRipartireMillesimi()) {
    if (!millesimiAttiviAlla(s.data)) { saltate.push({ spesa: s, motivo: 'prima-data' }); continue; }
    if (ripartizioneAMano(s)) { saltate.push({ spesa: s, motivo: 'a-mano' }); continue; }
    // Tabella scelta nella spesa, se esiste ancora; altrimenti quella della categoria.
    const tabId = tabelleMillesimi().some(t => t.id === s.tabellaMillesimi) ? s.tabellaMillesimi : tabellaPerCategoria(s.categoria);
    const p = propostaMillesimi(tabId, s.data);
    if (!p) { saltate.push({ spesa: s, motivo: 'senza-tabella' }); continue; }
    const importo = parseFloat(s.preventivo) || 0;
    const nAttivi = condominiAllaData(s.data).length;
    const ids = new Set([...(s.split || []).map(x => x.id), ...p.split.map(x => x.id)]);
    const dopoS = { ...s, split: p.split, tabellaMillesimi: p.tabella.id };
    ids.forEach(id => {
      const c = state.condomini.find(x => x.id === id);
      if (!c) return;
      const r = righe.get(id) || { nome: c.nome, apt: c.appartamento, prima: 0, dopo: 0 };
      r.prima += quotaSuSpesa(s, id, importo, nAttivi);
      r.dopo += quotaSuSpesa(dopoS, id, importo, nAttivi);
      righe.set(id, r);
    });
    nuove.push(dopoS);
    modificate.push({ spesa: s, prima: sintesiRipartizione(s), dopo: sintesiRipartizione(dopoS) + ` (tabella ${p.tabella.nome})` });
  }
  return { nuove, modificate, saltate, righe: [...righe.values()].sort((a, b) => String(a.apt).localeCompare(String(b.apt), 'it', { numeric: true })) };
}

const MOTIVI_SALTO_MILL = {
  'prima-data': 'data precedente a "Valgono per le spese dal"',
  'a-mano': 'ripartizione fatta a mano',
  'senza-tabella': 'nessun millesimo valido per quella data',
};

function renderModalMillesimiApplica() {
  const { nuove, modificate, saltate, righe } = calcolaApplicazioneMillesimi();
  const anno = new Date().getFullYear();
  const dal = configMillesimi()?.dal;
  const nome = (s) => esc(s.titolo || s.descrizione || ('Spesa ' + s.id));
  return `
  <div class="modal-overlay" id="modal-overlay">
    <div class="modal" style="max-width:700px">
      <div class="modal-header"><h2>⚖️ Applica i millesimi alle spese ${anno}</h2><button class="modal-close" id="modal-close" aria-label="Chiudi">✕</button></div>
      <div class="modal-body">
        <p style="font-size:14px;margin-bottom:.75rem">${nuove.length
          ? `<strong>${nuove.length} ${nuove.length === 1 ? 'spesa' : 'spese'}</strong> del ${anno} non ancora consuntivate verranno ripartite con i millesimi (tabella scelta nella spesa, altrimenti quella della categoria), a partire dal ${esc(dataPdf(dal))}. Le spese consuntivate, quelle con ripartizione fatta a mano e gli anni passati non cambiano.`
          : `Nessuna spesa del ${anno} da ripartire: sono tutte consuntivate, precedenti alla data di inizio, con ripartizione fatta a mano oppure non ci sono millesimi validi.`}</p>
        ${nuove.length ? `<div class="table-wrap" style="overflow-x:auto"><table class="split-table" style="min-width:0">
          <thead><tr><th>Condomino</th><th style="text-align:right">Quota prima</th><th style="text-align:right">Quota dopo</th><th style="text-align:right">Differenza</th></tr></thead>
          <tbody>${righe.map(r => { const d = r.dopo - r.prima; return `<tr><td>${esc(r.nome)} <span class="hint">${esc(r.apt || '')}</span></td>
            <td style="text-align:right">${fmt(r.prima)}</td><td style="text-align:right">${fmt(r.dopo)}</td>
            <td style="text-align:right;color:${d > 0.005 ? 'var(--red)' : d < -0.005 ? 'var(--green)' : 'var(--text2)'}">${d > 0 ? '+' : ''}${fmt(d)}</td></tr>`; }).join('')}</tbody>
        </table></div><p class="hint" style="margin-top:.5rem">Importi calcolati sul preventivo delle spese non ancora consuntivate.</p>` : ''}
        ${modificate.length ? `<h3 style="font-size:14px;margin:1rem 0 .4rem">Spese che cambiano (${modificate.length})</h3>
        <ul id="mill-elenco-cambiano" style="font-size:13px;padding-left:1.1rem;margin:0">${modificate.map(m => `<li style="margin-bottom:.4rem"><strong>${esc(dataPdf(m.spesa.data))}</strong> · ${nome(m.spesa)}<br>
          <span class="hint">Prima: ${esc(m.prima)}<br>Dopo: ${esc(m.dopo)}</span></li>`).join('')}</ul>` : ''}
        ${saltate.length ? `<h3 style="font-size:14px;margin:1rem 0 .4rem">Spese saltate (${saltate.length})</h3>
        <ul id="mill-elenco-saltate" style="font-size:13px;padding-left:1.1rem;margin:0">${saltate.map(x => `<li style="margin-bottom:.3rem"><strong>${esc(dataPdf(x.spesa.data))}</strong> · ${nome(x.spesa)} <span class="hint">— ${esc(MOTIVI_SALTO_MILL[x.motivo])}</span></li>`).join('')}</ul>` : ''}
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="modal-cancel">Annulla</button>
        ${nuove.length ? `<button class="btn btn-primary" id="btn-mill-conferma" style="width:auto">Applica a ${nuove.length} ${nuove.length === 1 ? 'spesa' : 'spese'}</button>` : ''}
      </div>
    </div>
  </div>`;
}

function bindSchedaMillesimi() {
  const b = document.getElementById('btn-mill-conferma');
  if (!b || state.modal?.type !== 'millesimiApplica') return;
  b.onclick = () => {
    const { nuove } = calcolaApplicazioneMillesimi();
    const perId = new Map(nuove.map(s => [s.id, s]));
    const spese = state.spese.map(s => perId.get(s.id) || s);
    save('cm_spese', spese);
    setState({ spese, modal: null });
    avvisa(`✅ Millesimi applicati a ${nuove.length} ${nuove.length === 1 ? 'spesa' : 'spese'} del ${new Date().getFullYear()}.`);
  };
}
