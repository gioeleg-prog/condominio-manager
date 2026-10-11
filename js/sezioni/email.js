// Email ai condomini gestite dall'amministratore (il server è functions/notifiche.js).
// Regola: nessuna email parte senza una scelta esplicita, e ogni invio mostra
// prima l'elenco dei destinatari con le spunte (Tutti / Nessuno).
//  • elenco con le spunte, riusato da avvisi, verbali, rendiconto, estratti, promemoria
//  • schede "Invia per email": rendiconto PDF, estratti conto personali, promemoria rate
//  • Impostazioni: promemoria automatici (spenti di base) e storico degli invii
// Script classico: condivide le variabili globali con gli altri file di js/ (ordine in index.html).

const EMAIL_VALIDA = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

function edificioEmail() { return getUserEdificio(state.user) || state.edificioAttivo; }

// Perché un condomino non può ricevere email (null = può). Stesse regole del server.
function motivoNoEmail(c) {
  const oggi = ymdLocale(new Date());
  if (c.disabled || (c.dataUscita && c.dataUscita <= oggi)) return 'archiviato';
  if (c.emailNotifiche === false) return 'non vuole email';
  if (!EMAIL_VALIDA.test(String(c.email || '').trim())) return 'senza email';
  return null;
}

function condominiPerEmail(edificioId = edificioEmail()) {
  return state.condomini.filter(c => (c.edificioId || state.edificioAttivo) === edificioId && !c.superAdmin && !c.disabled)
    .sort((a, b) => String(a.appartamento || '').localeCompare(String(b.appartamento || ''), 'it', { numeric: true }))
    .map(c => ({ c, motivo: motivoNoEmail(c) }));
}

// ─── Elenco con le spunte ─────────────────────────────────────────
// pref: prefisso univoco nella pagina; seleziona(c) decide chi parte spuntato;
// extra(c) aggiunge un dettaglio sulla riga (es. prossima rata).
function renderSceltaDestinatari(pref, { seleziona = () => true, extra = null } = {}) {
  const voci = condominiPerEmail();
  const possibili = voci.filter(v => !v.motivo).length;
  const scelti = voci.filter(v => !v.motivo && seleziona(v.c)).length;
  return `<div class="scelta-dest" data-scelta="${pref}">
    <div class="scelta-dest-testa">
      <span class="scelta-dest-conta" id="${pref}-conta" aria-live="polite">${scelti} di ${possibili} selezionati</span>
      <span class="scelta-dest-azioni">
        <button type="button" class="btn btn-secondary btn-sm" data-scelta-tutti="${pref}">Tutti</button>
        <button type="button" class="btn btn-secondary btn-sm" data-scelta-nessuno="${pref}">Nessuno</button>
      </span>
    </div>
    <ul class="scelta-dest-lista" aria-label="Destinatari">
      ${voci.map(({ c, motivo }) => `<li class="${motivo ? 'escluso' : ''}">
        <label>
          <input type="checkbox" data-dest="${pref}" value="${c.id}" ${!motivo && seleziona(c) ? 'checked' : ''} ${motivo ? 'disabled' : ''}>
          <span class="sd-nome">${esc(c.nome)}${c.appartamento ? ` <span class="sd-apt">${esc(c.appartamento)}</span>` : ''}</span>
          <span class="sd-dett">${motivo ? esc(motivo) : esc(c.email)}${!motivo && extra ? ' · ' + extra(c) : ''}</span>
        </label>
      </li>`).join('') || '<li class="escluso">Nessun condomino in questo condominio.</li>'}
    </ul>
  </div>`;
}

function leggiDestinatari(pref) {
  return [...document.querySelectorAll(`input[data-dest="${pref}"]:checked`)].map(i => Number(i.value));
}

function aggiornaConteggio(pref) {
  const tutte = document.querySelectorAll(`input[data-dest="${pref}"]:not(:disabled)`).length;
  const n = leggiDestinatari(pref).length;
  const el = document.getElementById(pref + '-conta');
  if (el) el.textContent = `${n} di ${tutte} selezionati`;
  document.querySelectorAll(`[data-invia-conta="${pref}"]`).forEach(b => { b.textContent = `📧 Invia a ${n}`; b.disabled = !n; });
}

// Un solo gestore per tutta la pagina (gli elenchi vengono ridisegnati spesso).
if (typeof document !== 'undefined' && document.addEventListener && !window.__sceltaDest) {
  window.__sceltaDest = true;
  document.addEventListener('click', (e) => {
    const t = e.target.closest?.('[data-scelta-tutti],[data-scelta-nessuno]');
    if (!t) return;
    const pref = t.dataset.sceltaTutti || t.dataset.sceltaNessuno;
    document.querySelectorAll(`input[data-dest="${pref}"]:not(:disabled)`).forEach(i => { i.checked = !!t.dataset.sceltaTutti; });
    aggiornaConteggio(pref);
  });
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset?.dest) aggiornaConteggio(t.dataset.dest);
    if (t.dataset?.casellaEmail) {
      const box = document.getElementById(t.dataset.casellaEmail);
      if (box) box.hidden = !t.checked;
    }
  });
}

// ─── Avvisi e verbali: casella spenta, elenco quando la accendi ─────
function renderCasellaEmail(id, isEdit) {
  const possibili = condominiPerEmail().filter(v => !v.motivo).length;
  return `<div class="casella-email-box">
    <label class="casella-email" for="${id}">
      <input type="checkbox" id="${id}" data-casella-email="${id}-dest" ${possibili ? '' : 'disabled'}>
      <span><strong>${isEdit ? 'Invia di nuovo per email' : 'Avvisa i condomini per email'}</strong>
      <span class="hint" style="display:block;margin-top:2px">${possibili ? 'Spunta solo per le comunicazioni importanti: poi scegli a chi.' : 'Nessun condomino ha un\'email per ricevere avvisi.'}</span></span>
    </label>
    <div id="${id}-dest" hidden>${renderSceltaDestinatari(id + '-dest')}</div>
  </div>`;
}

// { notificaEmail, notificaDestinatari } da salvare nel record, oppure {} se nessuna email.
function richiestaEmail(id) {
  if (!document.getElementById(id)?.checked) return {};
  const ids = leggiDestinatari(id + '-dest');
  if (!ids.length) return { nessunDestinatario: true };
  return { notificaEmail: new Date().toISOString() + '-' + Math.random().toString(36).slice(2, 7), notificaDestinatari: ids };
}

function avvisaEmail(email) {
  if (email.nessunDestinatario) { avvisa('⚠️ Pubblicato senza email: nessun destinatario era selezionato.'); return; }
  if (!email.notificaEmail) return;
  const n = email.notificaDestinatari.length;
  avvisa('✅ Pubblicato. Email in partenza per ' + n + (n === 1 ? ' condomino.' : ' condomini.'));
}
// Il campo di sola interfaccia non va salvato nel record.
function pulisciRichiestaEmail(email) { const { nessunDestinatario, ...resto } = email; return resto; }

// ─── Chiamata al server ───────────────────────────────────────────
async function chiamaInviaEmail(dati) {
  const { functionsInstance, httpsCallable } = window._fb;
  const r = await httpsCallable(functionsInstance, 'inviaEmail')({ buildingId: String(edificioEmail()), ...dati });
  return r.data || {};
}

function esitoInvio(r) {
  const parti = [`✅ Email inviata a ${r.inviati} ${r.inviati === 1 ? 'condomino' : 'condomini'}`];
  if (r.esclusi?.length) parti.push(`${r.esclusi.length} esclusi (${r.esclusi.map(e => e.nome + ': ' + e.motivo).join(', ')})`);
  if (r.errori?.length) parti.push(`${r.errori.length} non riuscite (${r.errori.map(e => e.nome).join(', ')})`);
  return parti.join('; ') + '.' + (r.simulata ? ' (Ambiente di prova: nessuna email reale.)' : '');
}

function schedaEmail({ titolo, intro, oggetto, messaggio, elenco, pref, extraCampi = '' }) {
  return `
  <div class="modal-overlay" id="modal-overlay">
    <div class="modal" style="max-width:600px">
      <div class="modal-header">
        <h2>📧 ${esc(titolo)}</h2>
        <button class="modal-close" id="modal-close" aria-label="Chiudi">✕</button>
      </div>
      <div class="modal-body">
        <p class="hint" style="margin:0 0 1rem;font-size:13px">${intro}</p>
        ${extraCampi}
        ${oggetto !== null ? `<div class="field"><label for="em-oggetto">Oggetto</label><input type="text" id="em-oggetto" maxlength="140" value="${esc(oggetto)}"></div>` : ''}
        <div class="field"><label for="em-messaggio">Messaggio (facoltativo)</label><textarea id="em-messaggio" rows="4" maxlength="3000">${esc(messaggio)}</textarea></div>
        <div class="field"><label>Destinatari</label>${elenco}</div>
        <div id="em-err" class="alert alert-warning" style="display:none;font-size:13px"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="modal-cancel">Annulla</button>
        <button class="btn btn-primary" id="btn-em-invia" data-invia-conta="${pref}">📧 Invia</button>
      </div>
    </div>
  </div>`;
}

// ─── Rendiconto PDF ───────────────────────────────────────────────
function renderModalEmailRendiconto(d) {
  const ed = state.edifici.find(e => e.id === edificioEmail()) || {};
  const preventivo = d.anno > new Date().getFullYear();
  const nomeDoc = preventivo ? 'Bilancio preventivo' : 'Rendiconto';
  return schedaEmail({
    titolo: `Invia il ${nomeDoc.toLowerCase()} ${d.anno}`,
    intro: `Allegato: ${nomeDoc} ${d.anno} ${d.tipo === 'dettagliato' ? 'dettagliato' : 'sintetico'}${d.riparto ? ', con il riparto per condomino' : ', senza riparto'}. Un'email sola, in copia nascosta.`,
    oggetto: `${nomeDoc} ${d.anno}${ed.nome ? ' · ' + ed.nome : ''}`,
    messaggio: `Buongiorno,\nin allegato il ${nomeDoc.toLowerCase()} ${d.anno} del condominio.\n\nUn saluto,\nl'amministratore`,
    elenco: renderSceltaDestinatari('em-rend'),
    pref: 'em-rend',
  });
}

// ─── Estratti conto personali ─────────────────────────────────────
function renderModalEmailEstratti(d) {
  return schedaEmail({
    titolo: `Invia gli estratti conto ${d.anno}`,
    intro: 'Ogni condomino selezionato riceve solo il <strong>suo</strong> estratto conto (quote, versamenti, saldo), in un\'email personale.',
    oggetto: `Il tuo estratto conto ${d.anno}`,
    messaggio: '',
    elenco: renderSceltaDestinatari('em-estr', { seleziona: c => !d.condId || c.id === d.condId }),
    pref: 'em-estr',
  });
}

// ─── Promemoria rate ──────────────────────────────────────────────
function situazioneRate(c) {
  const oggi = ymdLocale(new Date());
  const prossima = state.entrate.filter(e => e.condominoId === c.id && e.previsionale && String(e.data || '') >= oggi)
    .sort((a, b) => String(a.data).localeCompare(String(b.data)))[0] || null;
  let saldo = null;
  try { saldo = datiEstratto(c.id, new Date().getFullYear()).saldo; } catch (e) { saldo = null; }
  const giorni = prossima ? Math.round((new Date(prossima.data) - new Date(oggi)) / 86400000) : null;
  return { prossima, saldo, giorni };
}

function renderModalEmailPromemoria() {
  return schedaEmail({
    titolo: 'Invia promemoria',
    intro: 'Un\'email personale a ciascun condomino selezionato, con la sua prossima rata prevista e, se è in ritardo, il saldo. Sono già spuntati quelli con una rata nei prossimi 15 giorni o con saldo negativo.',
    oggetto: null,
    messaggio: '',
    elenco: renderSceltaDestinatari('em-prom', {
      seleziona: c => { const s = situazioneRate(c); return (s.giorni !== null && s.giorni <= 15) || (s.saldo !== null && s.saldo < -0.005); },
      extra: c => { const s = situazioneRate(c); return [s.prossima ? `rata ${dataPdf(s.prossima.data)} ${fmt(parseFloat(s.prossima.importo) || 0)}` : 'nessuna rata prevista', s.saldo !== null ? `saldo ${fmt(s.saldo)}` : ''].filter(Boolean).map(esc).join(' · '); },
    }),
    pref: 'em-prom',
  });
}

function bindSchedeEmail() {
  const tipo = state.modal?.type;
  const pref = { emailRendiconto: 'em-rend', emailEstratti: 'em-estr', emailPromemoria: 'em-prom' }[tipo];
  const b = document.getElementById('btn-em-invia');
  if (!pref || !b) return;
  aggiornaConteggio(pref);
  b.onclick = async () => {
    const err = document.getElementById('em-err');
    const ids = leggiDestinatari(pref);
    if (!ids.length) { err.textContent = 'Scegli almeno un destinatario.'; err.style.display = 'block'; return; }
    if (!await chiedi(`Inviare l'email a ${ids.length} ${ids.length === 1 ? 'condomino' : 'condomini'}?`, { titolo: 'Confermi l\'invio?', conferma: 'Invia' })) return;
    const messaggio = document.getElementById('em-messaggio').value;
    const oggetto = document.getElementById('em-oggetto')?.value || '';
    const d = state.modal.data || {};
    b.disabled = true; b.textContent = '⏳ Invio in corso…'; err.style.display = 'none';
    try {
      let r;
      if (tipo === 'emailRendiconto') {
        await caricaLibrerieRendiconto();
        r = await chiamaInviaEmail({ tipo: 'rendiconto', destinatari: ids, oggetto, messaggio, allegato: generaRendicontoPDF(d, true) });
      } else if (tipo === 'emailEstratti') {
        await caricaLibrerieRendiconto();
        r = await chiamaInviaEmail({ tipo: 'estratti', oggetto, messaggio, invii: ids.map(id => ({ id, anno: d.anno, allegato: generaEstrattoPDF(id, d.anno, true) })) });
      } else {
        r = await chiamaInviaEmail({ tipo: 'promemoria', messaggio, invii: ids.map(id => {
          const s = situazioneRate(state.condomini.find(c => c.id === id));
          return { id, rataImporto: s.prossima ? parseFloat(s.prossima.importo) || 0 : 0, rataData: s.prossima?.data || '', saldo: s.saldo };
        }) });
      }
      _storicoEmail = null;
      setState({ modal: null });
      avvisa(esitoInvio(r));
    } catch (e) {
      reportClientError('Invio email: ' + (e.message || e), e.stack);
      err.textContent = 'Email non inviata: ' + (e.message || e);
      err.style.display = 'block';
      b.disabled = false; aggiornaConteggio(pref);
    }
  };
}

// ─── Impostazioni: promemoria automatici e storico invii ───────────
let _storicoEmail = null;   // { at, voci } — ricaricato al massimo ogni minuto
let _impEmail = null;

function renderSezioneEmail() {
  return `<div class="section-divider"><h3>📧 Email ai condomini</h3></div>
    <div class="card" style="padding:1rem 1.25rem;margin-bottom:1rem">
      <div id="email-impostazioni"><p class="hint">Caricamento…</p></div>
    </div>
    <div class="card" style="margin-bottom:1.5rem">
      <div class="card-header"><h3>Email inviate</h3><button type="button" class="btn btn-secondary btn-sm" id="btn-email-storico-aggiorna">Aggiorna</button></div>
      <div id="email-storico" style="padding:.75rem 1.25rem"><p class="hint">Caricamento…</p></div>
    </div>`;
}

const ETICHETTE_INVIO = { avviso: 'Avviso', verbale: 'Verbale', rendiconto: 'Rendiconto', estratti: 'Estratti conto', promemoria: 'Promemoria', 'promemoria-auto': 'Promemoria automatico' };
const STATI_INVIO = { inviata: 'inviata', simulata: 'prova (non spedita)', 'in invio': 'in invio', errore: 'non riuscita', 'in parte': 'in parte', 'nessun destinatario': 'nessun destinatario' };

function disegnaStoricoEmail() {
  const box = document.getElementById('email-storico');
  if (!box || !_storicoEmail) return;
  const voci = _storicoEmail.voci;
  box.innerHTML = voci.length ? `<ul class="storico-email">${voci.map(v => {
    const quando = v.creatoIl?.toDate ? v.creatoIl.toDate() : null;
    const nomi = (v.destinatari || []).map(x => x.nome).filter(Boolean);
    const ok = v.stato === 'inviata' || v.stato === 'simulata';
    return `<li>
      <div class="se-riga"><span class="badge ${ok ? 'badge-green' : v.stato === 'errore' ? 'badge-red' : 'badge-amber'}">${esc(STATI_INVIO[v.stato] || v.stato || '')}</span>
        <strong>${esc(ETICHETTE_INVIO[v.tipo] || v.tipo || '')}</strong> · ${esc(v.oggetto || '')}</div>
      <div class="se-dett">${quando ? esc(quando.toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })) : ''} · ${v.n || 0} ${v.n === 1 ? 'destinatario' : 'destinatari'}${v.allegato ? ' · allegato ' + esc(v.allegato) : ''}</div>
      ${nomi.length ? `<details><summary>Chi l'ha ricevuta</summary><p>${esc(nomi.join(', '))}</p>${(v.esclusi || []).length ? `<p class="hint">Esclusi: ${esc(v.esclusi.map(e => e.nome + ' (' + e.motivo + ')').join(', '))}</p>` : ''}</details>` : ''}
    </li>`; }).join('')}</ul>` : '<p class="hint">Nessuna email inviata finora.</p>';
}

function disegnaImpostazioniEmail() {
  const box = document.getElementById('email-impostazioni');
  if (!box || !_impEmail) return;
  const giorni = _impEmail.giorniPreavviso || 3;
  box.innerHTML = `
    <label class="casella-email" for="imp-prom-auto" style="margin-top:0">
      <input type="checkbox" id="imp-prom-auto" ${_impEmail.promemoriaAuto ? 'checked' : ''}>
      <span><strong>Promemoria automatici delle rate</strong>
      <span class="hint" style="display:block;margin-top:2px">Ogni mattina alle 8, un'email a chi ha una rata prevista fra i giorni scelti. Spenti finché non li accendi; in alternativa usa "📧 Invia promemoria" in Entrate.</span></span>
    </label>
    <div style="display:flex;gap:.75rem;align-items:flex-end;flex-wrap:wrap">
      <div class="field" style="margin:0"><label for="imp-prom-giorni">Giorni di anticipo</label>
        <select id="imp-prom-giorni">${[1, 2, 3, 5, 7, 10, 15].map(g => `<option value="${g}" ${g === giorni ? 'selected' : ''}>${g} ${g === 1 ? 'giorno' : 'giorni'} prima</option>`).join('')}</select></div>
      <button type="button" class="btn btn-primary" id="btn-imp-email-salva" style="width:auto">Salva</button>
    </div>`;
  document.getElementById('btn-imp-email-salva').onclick = async () => {
    const { db, doc, setDoc, serverTimestamp } = window._fb;
    const dati = { promemoriaAuto: document.getElementById('imp-prom-auto').checked, giorniPreavviso: parseInt(document.getElementById('imp-prom-giorni').value, 10),
      aggiornatoDa: window._fb.auth.currentUser?.uid, aggiornatoIl: serverTimestamp() };
    try {
      await setDoc(doc(db, 'buildings', String(edificioEmail()), 'impostazioni', 'email'), dati);
      _impEmail = { ...dati };
      avvisa(dati.promemoriaAuto ? `✅ Promemoria automatici accesi: ${dati.giorniPreavviso} ${dati.giorniPreavviso === 1 ? 'giorno' : 'giorni'} prima della rata.` : '✅ Promemoria automatici spenti.');
    } catch (e) { avvisa('⚠️ Impostazione non salvata: ' + (e.message || e)); }
  };
}

async function bindSezioneEmail() {
  if (!document.getElementById('email-storico') || !window._fb?.getDocs) return;
  const { db, collection, doc, getDoc, getDocs, query, orderBy, limit } = window._fb;
  const b = String(edificioEmail());
  const agg = document.getElementById('btn-email-storico-aggiorna');
  if (agg) agg.onclick = () => { _storicoEmail = null; bindSezioneEmail(); };
  try {
    if (!_impEmail) _impEmail = (await getDoc(doc(db, 'buildings', b, 'impostazioni', 'email'))).data() || { promemoriaAuto: false, giorniPreavviso: 3 };
    disegnaImpostazioniEmail();
    if (!_storicoEmail || Date.now() - _storicoEmail.at > 60000) {
      const snap = await getDocs(query(collection(db, 'buildings', b, 'invii'), orderBy('creatoIl', 'desc'), limit(50)));
      _storicoEmail = { at: Date.now(), voci: snap.docs.map(d => d.data()) };
    }
    disegnaStoricoEmail();
  } catch (e) {
    const box = document.getElementById('email-storico');
    if (box) box.innerHTML = '<p class="hint">Storico non disponibile: ' + esc(e.message || e) + '</p>';
  }
}
