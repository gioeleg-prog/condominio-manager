// Messaggi WhatsApp ai condomini, con i link "Apri in WhatsApp" (decisione del
// 2026-10-19: niente servizi a pagamento né account Meta). L'app prepara il
// messaggio e apre WhatsApp (app o web) già scritto per il condomino scelto:
// lo spedisce l'amministratore dal suo telefono, premendo Invia. Nessun
// messaggio parte da solo, quindi niente promemoria automatici.
//  • EVENTI_WA: gli eventi che si possono comunicare, ognuno con il suo modello
//    di testo e le variabili {nome}, {condominio}, … che l'app riempie
//  • Impostazioni › WhatsApp (buildings/{b}/impostazioni/whatsapp): per
//    condominio, quali eventi mostrano il pulsante 💬, i testi e la firma
//  • scheda "💬 WhatsApp": testo modificabile, un pulsante per ogni condomino
//    con il cellulare, "Copia per il gruppo" per il gruppo del condominio
//  • storico (buildings/{b}/inviiWhatsapp): a chi è stato aperto il messaggio;
//    se poi è stato davvero spedito l'app non può saperlo
// Il cellulare sta nei contatti (privacy, come l'email: lo vedono solo
// amministratori ed editor); "Riceve WhatsApp" (whatsappNotifiche) nella scheda.
// Script classico: condivide le variabili globali con gli altri file di js/ (ordine in index.html).

const VARIABILI_WA = {
  nome: 'nome del condomino',
  condominio: 'nome del condominio',
  documento: 'rendiconto o bilancio preventivo',
  anno: 'anno del rendiconto',
  titolo: 'titolo dell\'avviso o del verbale',
  testo: 'testo dell\'avviso',
  scadenza: 'scadenza dell\'avviso',
  data: 'data dell\'assemblea',
  decisioni: 'decisioni del verbale, una per riga',
  rata: 'prossima rata con importo e data',
  saldo: 'saldo, solo se negativo',
  link: 'indirizzo dell\'app',
  firma: 'firma (da Impostazioni)',
};

// personale: il messaggio cambia da persona a persona (niente gruppo).
const EVENTI_WA = {
  rendiconto: { etichetta: 'Rendiconto inviato per email', personale: false,
    variabili: ['nome', 'condominio', 'documento', 'anno', 'link', 'firma'],
    modello: 'Ciao {nome}, ti abbiamo mandato per email il {documento} {anno} del condominio {condominio}. Se non lo trovi, guarda anche nella posta indesiderata.\n\n{firma}' },
  avviso: { etichetta: 'Nuovo avviso', personale: false,
    variabili: ['nome', 'condominio', 'titolo', 'testo', 'scadenza', 'link', 'firma'],
    modello: 'Ciao {nome}, nuovo avviso per il condominio {condominio}:\n*{titolo}*\n{testo}\n\nLo trovi anche nell\'app: {link}\n\n{firma}' },
  verbale: { etichetta: 'Nuovo verbale', personale: false,
    variabili: ['nome', 'condominio', 'titolo', 'data', 'decisioni', 'link', 'firma'],
    modello: 'Ciao {nome}, è disponibile il verbale dell\'assemblea del {data}: *{titolo}*.\n{decisioni}\n\nLo trovi nell\'app: {link}\n\n{firma}' },
  promemoria: { etichetta: 'Promemoria rata', personale: true,
    variabili: ['nome', 'condominio', 'rata', 'saldo', 'firma'],
    modello: 'Ciao {nome}, ti ricordiamo {rata} per il condominio {condominio}.{saldo}\nSe hai già versato, non serve fare nulla.\n\n{firma}' },
};
const FIRMA_WA = 'L\'amministratore';
const MAX_MODELLO_WA = 1000;

// ─── Numeri e testi (funzioni pure, provate in qa/unit.spec.js) ─────
// Numero per wa.me: solo cifre, con il prefisso internazionale. Un cellulare
// italiano scritto senza prefisso (3…) diventa 39…; un fisso italiano senza
// prefisso (0…) non ha WhatsApp. null = numero non utilizzabile.
function numeroWa(tel) {
  const s = String(tel || '').trim();
  if (!s) return null;
  let n = s.replace(/\D/g, '');
  if (/^\+/.test(s)) { /* già internazionale */ }
  else if (/^00/.test(n)) n = n.slice(2);
  else if (/^3\d{8,9}$/.test(n)) n = '39' + n;
  else if (/^0/.test(n)) return null;
  return /^[1-9]\d{7,14}$/.test(n) ? n : null;
}

// Perché un condomino non può ricevere il messaggio (null = può).
function motivoNoWa(c) {
  const oggi = ymdLocale(new Date());
  if (c.disabled || (c.dataUscita && c.dataUscita <= oggi)) return 'archiviato';
  if (c.whatsappNotifiche === false) return 'non vuole WhatsApp';
  if (!String(c.telefono || '').trim()) return 'senza cellulare';
  if (!numeroWa(c.telefono)) return 'numero fisso o non valido';
  return null;
}

// Riempie le {variabili}; quelle sconosciute restano come sono, così un errore
// di battitura si vede nell'anteprima. Toglie le righe vuote in eccesso.
function componiWa(modello, valori) {
  return String(modello || '').replace(/\{(\w+)\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(valori, k) ? String(valori[k] ?? '') : m))
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function linkWa(numero, testo) {
  return 'https://wa.me/' + (numero || '') + '?text=' + encodeURIComponent(testo);
}

function sitoApp() {
  try { if (location && /^https?:/.test(location.origin)) return location.origin; } catch (e) { /* fuori dal browser */ }
  return 'https://neridarimini20.it';
}

// ─── Impostazioni del condominio ────────────────────────────────────
// Lette solo dagli amministratori (regole); finché non arrivano valgono i
// testi predefiniti, con tutti gli eventi accesi.
let _impWa = null;      // { modelli, firma, eventiSpenti }
let _impWaDi = null;    // "uid/edificio" a cui si riferiscono
let _impWaInCarico = false;

function edificioWa() { return getUserEdificio(state.user) || state.edificioAttivo; }
function chiWa() { return (window._fb?.auth?.currentUser?.uid || '') + '/' + edificioWa(); }

function impWa() {
  const i = _impWaDi === chiWa() && _impWa ? _impWa : {};
  return { modelli: i.modelli || {}, firma: typeof i.firma === 'string' ? i.firma : FIRMA_WA, eventiSpenti: Array.isArray(i.eventiSpenti) ? i.eventiSpenti : [] };
}
function modelloWa(evento) { return impWa().modelli[evento] || EVENTI_WA[evento].modello; }
// Il pulsante 💬 compare solo agli amministratori e per gli eventi accesi.
function waAttivo(evento) { return !!EVENTI_WA[evento] && canUserAdmin(state.user) && !impWa().eventiSpenti.includes(evento); }

function assicuraWhatsApp() {
  if (!state.user || !canUserAdmin(state.user) || !window._fb?.getDoc || _impWaInCarico) return;
  const chi = chiWa();
  if (_impWaDi === chi) return;
  _impWaInCarico = true;
  const { db, doc, getDoc } = window._fb;
  getDoc(doc(db, 'buildings', String(edificioWa()), 'impostazioni', 'whatsapp'))
    .then(s => { _impWa = s.data() || {}; _impWaDi = chi; })
    .catch(e => { console.warn('Impostazioni WhatsApp non lette:', e.code || e.message); _impWa = {}; _impWaDi = chi; })
    .finally(() => { _impWaInCarico = false; if (typeof renderPresto === 'function' && !state.modal) renderPresto(); });
}

// ─── Valori delle variabili per un condomino ────────────────────────
// contesto: i dati dell'evento (anno, avviso, verbale…). c = null per il gruppo.
function valoriWa(evento, contesto, c) {
  const ed = state.edifici.find(e => e.id === edificioWa()) || {};
  const v = { nome: c ? (String(c.nome || '').split(' ')[0] || c.nome || '') : 'a tutti', condominio: ed.nome || '', link: sitoApp(), firma: impWa().firma };
  const x = contesto || {};
  if (evento === 'rendiconto') Object.assign(v, { documento: x.documento || 'rendiconto', anno: x.anno || '' });
  if (evento === 'avviso') Object.assign(v, { titolo: x.titolo || '', testo: x.testo || '', scadenza: x.scadenza ? dataPdf(x.scadenza) : '' });
  if (evento === 'verbale') Object.assign(v, { titolo: x.titolo || '', data: x.data ? dataPdf(x.data) : '', decisioni: (x.decisioni || []).map(d => '- ' + d).join('\n') });
  if (evento === 'promemoria') {
    const s = c ? situazioneRate(c) : {};
    const imp = s.prossima ? parseFloat(s.prossima.importo) || 0 : 0;
    v.rata = s.prossima ? `la rata di ${fmt(imp)} prevista per il ${dataPdf(s.prossima.data)}` : 'i versamenti';
    v.saldo = typeof s.saldo === 'number' && s.saldo < -0.005 ? ` Il tuo saldo attuale è di ${fmt(s.saldo)}.` : '';
  }
  return v;
}

// Chi è già proposto nella scheda: per il rendiconto chi ha appena ricevuto
// l'email, per i promemoria chi ha una rata entro 15 giorni o il saldo negativo.
function proposteWa(evento, scelti) {
  if (Array.isArray(scelti)) return c => scelti.includes(c.id);
  if (evento === 'promemoria') return c => { const s = situazioneRate(c); return (s.giorni !== null && s.giorni <= 15) || (s.saldo !== null && s.saldo < -0.005); };
  return () => true;
}

function condominiPerWa() {
  return state.condomini.filter(c => (c.edificioId || state.edificioAttivo) === edificioWa() && !c.superAdmin && !c.disabled)
    .sort((a, b) => String(a.appartamento || '').localeCompare(String(b.appartamento || ''), 'it', { numeric: true }))
    .map(c => ({ c, motivo: motivoNoWa(c) }));
}

// Per l'anno prossimo il documento è il bilancio preventivo (come in email.js).
function contestoWaRendiconto(anno) {
  return { anno, documento: anno > new Date().getFullYear() ? 'bilancio preventivo' : 'rendiconto' };
}

// Dopo l'email del rendiconto: chiede se avvisare anche su WhatsApp chi l'ha
// ricevuta. Mai in automatico: senza un sì la scheda non si apre.
async function proponiWaDopoRendiconto(anno, ids) {
  if (!waAttivo('rendiconto') || !ids.length) return;
  const conTel = ids.map(id => state.condomini.find(c => c.id === id)).filter(c => c && !motivoNoWa(c)).length;
  if (!conTel) return;
  if (!await chiedi(`Vuoi avvisare anche su WhatsApp che il rendiconto è arrivato per email? ${conTel} ${conTel === 1 ? 'condomino ha' : 'condomini hanno'} il cellulare.`,
    { titolo: 'Avvisare su WhatsApp?', conferma: 'Apri WhatsApp' })) return;
  apriWhatsApp('rendiconto', contestoWaRendiconto(anno), 'Rendiconto ' + anno, ids);
}

// ─── Scheda "💬 WhatsApp" ───────────────────────────────────────────
// data: { evento, contesto, titolo, scelti?: [id] }
function apriWhatsApp(evento, contesto, titolo, scelti) {
  setState({ modal: { type: 'whatsapp', data: { evento, contesto: contesto || {}, titolo: titolo || EVENTI_WA[evento].etichetta, scelti: scelti || null } } });
}

function renderModalWhatsApp(d) {
  const ev = EVENTI_WA[d.evento];
  if (!ev || !canUserAdmin(state.user)) return '';
  const proposta = proposteWa(d.evento, d.scelti);
  const voci = condominiPerWa();
  const proposti = voci.filter(v => proposta(v.c));
  const altri = voci.filter(v => !proposta(v.c));
  const riga = ({ c, motivo }) => `<li class="${motivo ? 'escluso' : ''}" data-wa-riga="${c.id}">
      <div class="wa-chi"><span class="sd-nome">${esc(c.nome)}${c.appartamento ? ` <span class="sd-apt">${esc(c.appartamento)}</span>` : ''}</span>
        <span class="sd-dett">${motivo ? esc(motivo) : esc(c.telefono)}${d.evento === 'promemoria' && !motivo ? ' · ' + esc(valoriWa('promemoria', d.contesto, c).rata) : ''}</span></div>
      ${motivo ? '' : `<button type="button" class="btn btn-secondary btn-sm" data-wa-apri="${c.id}">💬 Apri</button>`}
    </li>`;
  const possibili = proposti.filter(v => !v.motivo).length;
  return `
  <div class="modal-overlay" id="modal-overlay">
    <div class="modal" style="max-width:600px">
      <div class="modal-header">
        <h2>💬 WhatsApp · ${esc(d.titolo)}</h2>
        <button class="modal-close" id="modal-close" aria-label="Chiudi">✕</button>
      </div>
      <div class="modal-body">
        <p class="hint" style="margin:0 0 1rem;font-size:13px">Premi "Apri" accanto a ogni condomino: WhatsApp si apre con il messaggio già scritto e lo mandi tu, con Invia. Da qui non parte nulla da solo.</p>
        <div class="field">
          <label for="wa-testo">Messaggio</label>
          <textarea id="wa-testo" rows="6" maxlength="${MAX_MODELLO_WA}">${esc(modelloWa(d.evento))}</textarea>
          <p class="hint">Le parole tra graffe si riempiono da sole: ${ev.variabili.map(k => `<code>{${k}}</code> ${esc(VARIABILI_WA[k])}`).join(' · ')}. Per il <strong>grassetto</strong> in WhatsApp: *testo*. Il testo predefinito si cambia in Impostazioni.</p>
        </div>
        <div class="field">
          <label>Anteprima${possibili ? ' per ' + esc(proposti.find(v => !v.motivo).c.nome) : ''}</label>
          <div class="wa-anteprima" id="wa-anteprima"></div>
        </div>
        <div class="field">
          <label>Condomini <span class="hint" id="wa-conta" aria-live="polite"></span></label>
          <ul class="wa-lista">${proposti.map(riga).join('') || '<li class="escluso"><span class="sd-dett">Nessun condomino da avvisare.</span></li>'}</ul>
          ${altri.length ? `<details class="wa-altri"><summary>Altri ${altri.length} condomini</summary><ul class="wa-lista">${altri.map(riga).join('')}</ul></details>` : ''}
        </div>
        <div id="wa-err" class="alert alert-warning" style="display:none;font-size:13px"></div>
      </div>
      <div class="modal-footer">
        ${ev.personale ? '' : '<button class="btn btn-secondary" id="btn-wa-gruppo" title="Copia il messaggio (con &quot;Ciao a tutti&quot;) da incollare nel gruppo WhatsApp del condominio">📋 Copia per il gruppo</button>'}
        <button class="btn btn-primary" id="modal-cancel">Fatto</button>
      </div>
    </div>
  </div>`;
}

// Storico: una voce per scheda aperta, creata al primo "Apri" e poi allungata.
async function registraAperturaWa(d, c) {
  if (!window._fb?.setDoc || !window._fb.arrayUnion) return;
  const { db, doc, setDoc, updateDoc, serverTimestamp, arrayUnion } = window._fb;
  const voce = { id: Number(c.id), nome: String(c.nome || '').slice(0, 80), ora: new Date().toISOString() };
  try {
    if (!d.logId) {
      d.logId = 'wa_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      await setDoc(doc(db, 'buildings', String(edificioWa()), 'inviiWhatsapp', d.logId), {
        evento: d.evento, titolo: String(d.titolo || '').slice(0, 200), aperti: [voce],
        autoreUid: window._fb.auth.currentUser?.uid, creatoIl: serverTimestamp(), aggiornatoIl: serverTimestamp() });
    } else {
      await updateDoc(doc(db, 'buildings', String(edificioWa()), 'inviiWhatsapp', d.logId), { aperti: arrayUnion(voce), aggiornatoIl: serverTimestamp() });
    }
    _storicoWa = null;
  } catch (e) {
    console.warn('Storico WhatsApp non salvato:', e.code || e.message);
  }
}

async function copiaTesto(testo) {
  try { await navigator.clipboard.writeText(testo); return true; } catch (e) { return false; }
}

function bindSchedaWhatsApp() {
  if (state.modal?.type !== 'whatsapp') return;
  const d = state.modal.data;
  const area = document.getElementById('wa-testo');
  if (!area) return;
  d.aperti = d.aperti || new Set();
  const persona = id => state.condomini.find(c => String(c.id) === String(id));
  const primo = condominiPerWa().find(v => !v.motivo && proposteWa(d.evento, d.scelti)(v.c));
  const anteprima = () => {
    const box = document.getElementById('wa-anteprima');
    if (box) box.textContent = componiWa(area.value, valoriWa(d.evento, d.contesto, primo ? primo.c : null));
  };
  const conta = () => {
    const el = document.getElementById('wa-conta');
    if (el) el.textContent = d.aperti.size ? `· aperto per ${d.aperti.size}` : '';
  };
  area.oninput = anteprima;
  anteprima();
  conta();
  d.aperti.forEach(id => {
    document.querySelector(`[data-wa-riga="${id}"]`)?.classList.add('aperto');
    const b = document.querySelector(`[data-wa-apri="${id}"]`);
    if (b) b.textContent = '✓ Aperto';
  });
  document.querySelectorAll('[data-wa-apri]').forEach(b => {
    b.onclick = () => {
      const c = persona(b.dataset.waApri);
      if (!c || motivoNoWa(c)) return;
      // Aperto subito, nello stesso clic: altrimenti il browser lo blocca come popup.
      window.open(linkWa(numeroWa(c.telefono), componiWa(area.value, valoriWa(d.evento, d.contesto, c))), '_blank', 'noopener');
      d.aperti.add(c.id);
      b.closest('li')?.classList.add('aperto');
      b.textContent = '✓ Aperto';
      conta();
      registraAperturaWa(d, c);
    };
  });
  const bg = document.getElementById('btn-wa-gruppo');
  if (bg) bg.onclick = async () => {
    const testo = componiWa(area.value, valoriWa(d.evento, d.contesto, null));
    if (await copiaTesto(testo)) avvisa('✅ Messaggio copiato: incollalo nel gruppo WhatsApp del condominio.');
    else window.open(linkWa('', testo), '_blank', 'noopener'); // senza appunti: WhatsApp chiede a chi mandarlo
  };
}

// ─── Impostazioni › WhatsApp e storico ──────────────────────────────
let _storicoWa = null;   // { at, voci, di }

function renderSezioneWhatsApp() {
  return `<div class="section-divider"><h3>💬 WhatsApp ai condomini</h3></div>
    <div class="card" style="padding:1rem 1.25rem;margin-bottom:1rem">
      <p class="hint" style="margin-top:0">L'app prepara i messaggi e apre WhatsApp già scritto: li spedisci tu dal tuo telefono o dal computer (WhatsApp Web). Servono il cellulare nella scheda di ogni condomino e la spunta "Riceve WhatsApp".</p>
      <div id="wa-impostazioni"><p class="hint">Caricamento…</p></div>
    </div>
    <div class="card" style="margin-bottom:1.5rem">
      <div class="card-header"><h3>Messaggi WhatsApp aperti</h3><button type="button" class="btn btn-secondary btn-sm" id="btn-wa-storico-aggiorna">Aggiorna</button></div>
      <div id="wa-storico" style="padding:.75rem 1.25rem"><p class="hint">Caricamento…</p></div>
    </div>`;
}

function disegnaImpostazioniWa() {
  const box = document.getElementById('wa-impostazioni');
  if (!box) return;
  const imp = impWa();
  box.innerHTML = Object.entries(EVENTI_WA).map(([k, ev]) => `
    <div class="wa-evento">
      <label class="casella-email" for="wa-on-${k}" style="margin-bottom:.5rem">
        <input type="checkbox" id="wa-on-${k}" ${imp.eventiSpenti.includes(k) ? '' : 'checked'}>
        <span><strong>${esc(ev.etichetta)}</strong><span class="hint" style="display:block;margin-top:2px">Mostra il pulsante 💬 WhatsApp per questo evento.</span></span>
      </label>
      <div class="field">
        <label for="wa-mod-${k}">Testo</label>
        <textarea id="wa-mod-${k}" rows="4" maxlength="${MAX_MODELLO_WA}">${esc(imp.modelli[k] || ev.modello)}</textarea>
        <p class="hint">${ev.variabili.map(v => `<code>{${v}}</code>`).join(' ')} · <button type="button" class="btn btn-secondary btn-sm" data-wa-ripristina="${k}">Ripristina il testo predefinito</button></p>
      </div>
    </div>`).join('') + `
    <div style="display:flex;gap:.75rem;align-items:flex-end;flex-wrap:wrap">
      <div class="field" style="margin:0;flex:1;min-width:200px"><label for="wa-firma">Firma ({firma})</label>
        <input type="text" id="wa-firma" maxlength="100" value="${esc(imp.firma)}"></div>
      <button type="button" class="btn btn-primary" id="btn-wa-salva" style="width:auto">Salva</button>
    </div>`;
  box.querySelectorAll('[data-wa-ripristina]').forEach(b => {
    b.onclick = () => { const t = document.getElementById('wa-mod-' + b.dataset.waRipristina); if (t) t.value = EVENTI_WA[b.dataset.waRipristina].modello; };
  });
  document.getElementById('btn-wa-salva').onclick = async () => {
    const { db, doc, setDoc, serverTimestamp } = window._fb;
    const modelli = {};
    // Si salva solo il testo cambiato: quello predefinito resta aggiornabile con l'app.
    Object.entries(EVENTI_WA).forEach(([k, ev]) => {
      const t = String(document.getElementById('wa-mod-' + k).value || '').trim().slice(0, MAX_MODELLO_WA);
      if (t && t !== ev.modello) modelli[k] = t;
    });
    const dati = { modelli, firma: String(document.getElementById('wa-firma').value || '').trim().slice(0, 100),
      eventiSpenti: Object.keys(EVENTI_WA).filter(k => !document.getElementById('wa-on-' + k).checked),
      aggiornatoDa: window._fb.auth.currentUser?.uid, aggiornatoIl: serverTimestamp() };
    try {
      await setDoc(doc(db, 'buildings', String(edificioWa()), 'impostazioni', 'whatsapp'), dati);
      _impWa = dati; _impWaDi = chiWa();
      avvisa('✅ Impostazioni WhatsApp salvate.');
    } catch (e) { avvisa('⚠️ Impostazioni WhatsApp non salvate: ' + (e.message || e)); }
  };
}

function disegnaStoricoWa() {
  const box = document.getElementById('wa-storico');
  if (!box || !_storicoWa) return;
  const voci = _storicoWa.voci;
  box.innerHTML = voci.length ? `<ul class="storico-email">${voci.map(v => {
    const quando = v.creatoIl?.toDate ? v.creatoIl.toDate() : null;
    const nomi = (v.aperti || []).map(x => x.nome).filter(Boolean);
    return `<li>
      <div class="se-riga"><strong>${esc(EVENTI_WA[v.evento]?.etichetta || v.evento || '')}</strong> · ${esc(v.titolo || '')}</div>
      <div class="se-dett">${quando ? esc(quando.toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })) : ''} · aperto per ${nomi.length} ${nomi.length === 1 ? 'condomino' : 'condomini'}</div>
      ${nomi.length ? `<details><summary>Per chi</summary><p>${esc(nomi.join(', '))}</p></details>` : ''}
    </li>`; }).join('')}</ul>` : '<p class="hint">Nessun messaggio WhatsApp aperto finora.</p>';
}

async function bindSezioneWhatsApp() {
  if (!document.getElementById('wa-storico') || !window._fb?.getDocs) return;
  const { db, collection, getDocs, query, orderBy, limit } = window._fb;
  const chi = chiWa();
  // Finché le impostazioni non arrivano niente modulo: Salva coprirebbe quelle
  // vere con i testi predefiniti. Quando arrivano, assicuraWhatsApp ridisegna.
  if (_impWaDi === chi) disegnaImpostazioniWa(); else assicuraWhatsApp();
  const agg = document.getElementById('btn-wa-storico-aggiorna');
  if (agg) agg.onclick = () => { _storicoWa = null; bindSezioneWhatsApp(); };
  try {
    if (!_storicoWa || _storicoWa.di !== chi || Date.now() - _storicoWa.at > 60000) {
      const snap = await getDocs(query(collection(db, 'buildings', String(edificioWa()), 'inviiWhatsapp'), orderBy('creatoIl', 'desc'), limit(50)));
      if (chiWa() !== chi) return; // nel frattempo è cambiato condominio o utente
      _storicoWa = { at: Date.now(), di: chi, voci: snap.docs.map(x => x.data()) };
    }
    disegnaStoricoWa();
  } catch (e) {
    const box = document.getElementById('wa-storico');
    if (box) box.innerHTML = '<p class="hint">Storico non disponibile: ' + esc(e.message || e) + '</p>';
  }
}
